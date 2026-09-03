#!/usr/bin/env python3
"""Roll up closed daily nginx download logs into SQLite and emit downloads.json."""

# Stdlib only; this runs on the file server's system python

import argparse
import collections
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

LOG_DIR = "/srv/resonance/logs"
LOG_PATTERN = "downloads-*.log"
MEDIA_ROOT = "/srv/resonance"
STATE_DIR = "/srv/resonance/stats"

COMPLETION_THRESHOLD = 0.95
WINDOW_DAYS = 90
# A quiet week and a stopped nginx look identical without this
STALE_LOG_DAYS = 2
# curl/wget deliberately absent: command-line downloads are legitimate here
UA_BLOCKLIST = (
    "bot",
    "crawl",
    "spider",
    "python-requests",
    "go-http-client",
    "monitor",
    "uptime",
    "headless",
    "resonance-deploy-probe",
)

MEDIA_SUFFIXES = {"artifacts": (".mp3", ".flac"), "stream": (".webm",)}
LOG_DATE_RE = re.compile(r"-(\d{4}-\d{2}-\d{2})\.log$")
FILE_KEY_RE = re.compile(r"^/artifacts/[^/]+\.(mp3|flac)$|^/stream/[^/]+\.webm$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
  file_key    TEXT PRIMARY KEY,
  size_bytes  INTEGER NOT NULL,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_rollup (
  file_key         TEXT NOT NULL,
  day              TEXT NOT NULL,
  completions      INTEGER NOT NULL DEFAULT 0,
  bytes_sent       INTEGER NOT NULL DEFAULT 0,
  partial_requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (file_key, day)
);
CREATE TABLE IF NOT EXISTS processed_logs (
  name         TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credited_pairs (
  visitor  TEXT NOT NULL,
  file_key TEXT NOT NULL,
  PRIMARY KEY (visitor, file_key)
);
"""


def normalise_uri(raw_uri):
    path = unquote(raw_uri.split("?", 1)[0])
    if not FILE_KEY_RE.match(path):
        return None
    return path.lstrip("/")


def parse_line(line):
    fields = line.rstrip("\n").split("\t")
    if len(fields) != 10:
        return None
    (
        ts_raw,
        uri,
        status_raw,
        bytes_raw,
        _completion,
        _http_range,
        _req_time,
        ip,
        user_agent,
        _referer,
    ) = fields
    try:
        timestamp = datetime.fromisoformat(ts_raw).astimezone(timezone.utc)
        status = int(status_raw)
        bytes_sent = int(bytes_raw)
    except ValueError:
        return None
    return {
        "timestamp": timestamp,
        # `None` for anything that is not a media request; the caller counts those separately
        "file_key": normalise_uri(uri),
        "status": status,
        "bytes_sent": bytes_sent,
        "ip": ip,
        "user_agent": user_agent,
    }


def is_blocked_agent(user_agent):
    ua_lower = user_agent.lower()
    return any(marker in ua_lower for marker in UA_BLOCKLIST)


def scan_media_sizes(media_root):
    sizes = {}
    root = Path(media_root)
    for subdir, suffixes in MEDIA_SUFFIXES.items():
        base = root / subdir
        if not base.is_dir():
            continue
        for file_path in base.iterdir():
            if file_path.is_file() and file_path.suffix in suffixes:
                sizes[f"{subdir}/{file_path.name}"] = file_path.stat().st_size
    return sizes


def refresh_files_table(db, sizes, today):
    for file_key, size in sizes.items():
        db.execute(
            """
            INSERT INTO files (file_key, size_bytes, first_seen, last_seen) VALUES (?, ?, ?, ?)
            ON CONFLICT(file_key) DO UPDATE SET size_bytes = excluded.size_bytes, last_seen = excluded.last_seen
            """,
            (file_key, size, today, today),
        )


def dated_logs(log_dir, log_pattern):
    # nginx names each file from the request timestamp, so the date in the name is authoritative
    for path in sorted(Path(log_dir).glob(log_pattern)):
        match = LOG_DATE_RE.search(path.name)
        if match:
            yield match.group(1), path


def pending_logs(db, log_dir, log_pattern, today):
    # Today's file is the one nginx still holds open, so it is never read
    done = {name for (name,) in db.execute("SELECT name FROM processed_logs")}
    return [
        path
        for day, path in dated_logs(log_dir, log_pattern)
        if day < today and path.name not in done
    ]


def read_log(path):
    with open(path, "rt", encoding="utf-8", errors="replace") as handle:
        return handle.readlines()


# `traffic` counts ranged bytes too, the only signal a streamed play leaves
# One file holds one day, so a batch boundary can never split a day across two runs
def collect_days(lines, sizes):
    days = {}
    unparsed = 0
    ignored = 0

    for line in lines:
        entry = parse_line(line)
        if entry is None:
            unparsed += 1
            continue
        if entry["file_key"] is None:
            ignored += 1
            continue
        if entry["status"] not in (200, 206):
            continue
        if is_blocked_agent(entry["user_agent"]):
            continue

        day = days.setdefault(
            entry["timestamp"].strftime("%Y-%m-%d"),
            {"traffic": {}, "visitor_bytes": collections.Counter()},
        )
        traffic = day["traffic"].setdefault(
            entry["file_key"], {"bytes_sent": 0, "partial_requests": 0}
        )
        traffic["bytes_sent"] += entry["bytes_sent"]
        if entry["status"] == 206:
            traffic["partial_requests"] += 1

        day["visitor_bytes"][(entry["ip"], entry["file_key"])] += entry["bytes_sent"]

    # A resume is an aborted 200 plus a 206, a download manager only 206s; neither shows in one request
    for buckets in days.values():
        buckets["credited"] = {
            (ip, file_key)
            for (ip, file_key), bytes_sent in buckets["visitor_bytes"].items()
            if file_key in sizes and bytes_sent >= COMPLETION_THRESHOLD * sizes[file_key]
        }

    return days, unparsed, ignored


def visitor_salt(db):
    row = db.execute("SELECT value FROM meta WHERE key = 'visitor_salt'").fetchone()
    if row is not None:
        return row[0]
    salt = secrets.token_hex(16)
    db.execute("INSERT INTO meta (key, value) VALUES ('visitor_salt', ?)", (salt,))
    return salt


# An address that has taken a file has taken it, however often it comes back: a crawler refetching
# daily counts once, and a listener taking the whole catalog keeps every one of them
# There is no volume cap; taking a lot of music is what the audience does
# The raw address is salted and hashed here and never stored; only the digest reaches the table
def credit_day(db, credited, salt):
    completions = collections.Counter()

    for ip, file_key in credited:
        visitor = hashlib.sha256(f"{salt}{ip}".encode()).hexdigest()
        inserted = db.execute(
            "INSERT OR IGNORE INTO credited_pairs (visitor, file_key) VALUES (?, ?)",
            (visitor, file_key),
        )
        if inserted.rowcount:
            completions[file_key] += 1

    return completions


def process_lines(db, lines, sizes):
    days, unparsed, ignored = collect_days(lines, sizes)
    salt = visitor_salt(db)
    stats = {
        "days": len(days),
        "completions": 0,
        "partials": 0,
        "bytes": 0,
        "unparsed": unparsed,
        "ignored": ignored,
    }

    for day, buckets in sorted(days.items()):
        completions = credit_day(db, buckets["credited"], salt)

        for file_key, traffic in buckets["traffic"].items():
            counted = completions.get(file_key, 0)
            db.execute(
                """
                INSERT INTO daily_rollup (file_key, day, completions, bytes_sent, partial_requests)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(file_key, day) DO UPDATE SET
                  completions = completions + excluded.completions,
                  bytes_sent = bytes_sent + excluded.bytes_sent,
                  partial_requests = partial_requests + excluded.partial_requests
                """,
                (
                    file_key,
                    day,
                    counted,
                    traffic["bytes_sent"],
                    traffic["partial_requests"],
                ),
            )
            # A backlog processed after the file landed would otherwise date it to the first run
            db.execute(
                "UPDATE files SET first_seen = ? WHERE file_key = ? AND first_seen > ?",
                (day, file_key, day),
            )
            stats["completions"] += counted
            stats["partials"] += traffic["partial_requests"]
            stats["bytes"] += traffic["bytes_sent"]

    return stats


def emit_json(db, output_path, now):
    # Keys must stay exactly the six `downloadStatsSchema` declares; it is strict
    # Completions and byte_equivalents are all-time; the daily series is windowed
    window_start = (now - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
    files = []

    # Artifacts only; stream/ rollups keep accruing in SQLite for whenever a player lands
    rows = db.execute(
        "SELECT file_key, size_bytes, first_seen FROM files WHERE file_key LIKE 'artifacts/%' ORDER BY file_key"
    ).fetchall()
    for file_key, size_bytes, first_seen in rows:
        completions, bytes_sent = db.execute(
            "SELECT COALESCE(SUM(completions), 0), COALESCE(SUM(bytes_sent), 0) FROM daily_rollup WHERE file_key = ?",
            (file_key,),
        ).fetchone()
        daily_rows = db.execute(
            "SELECT day, completions FROM daily_rollup WHERE file_key = ? AND day >= ? AND completions > 0 ORDER BY day",
            (file_key, window_start),
        ).fetchall()
        files.append(
            {
                "key": file_key,
                "size_bytes": size_bytes,
                "completions": completions,
                "byte_equivalents": round(bytes_sent / size_bytes, 2)
                if size_bytes
                else 0,
                "first_seen": first_seen,
                "daily": dict(daily_rows),
            }
        )

    document = {
        "version": 1,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": files,
    }

    # Atomic replace so a concurrent rsync pull never sees a partial document
    tmp_path = output_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(document, indent=1) + "\n", encoding="utf-8")
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, output_path)


def stale_warning(log_dir, log_pattern, today):
    days = [day for day, _path in dated_logs(log_dir, log_pattern)]
    if not days:
        return "no download log has ever appeared; check the nginx access_log path and that logs/ is writable by the worker"
    age_days = (date.fromisoformat(today) - date.fromisoformat(max(days))).days
    if age_days >= STALE_LOG_DAYS:
        return f"newest download log is dated {max(days)}, {age_days} days ago; check that nginx is still writing"
    return None


def run(log_dir, log_pattern, media_root, state_dir, now=None):
    started = time.monotonic()
    now = now or datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    state = Path(state_dir)
    state.mkdir(mode=0o755, parents=True, exist_ok=True)

    db = sqlite3.connect(state / "stats.sqlite")
    db.executescript(SCHEMA)
    try:
        sizes = scan_media_sizes(media_root)
        refresh_files_table(db, sizes, today)

        logs = pending_logs(db, log_dir, log_pattern, today)
        lines = []
        for path in logs:
            lines.extend(read_log(path))

        stats = process_lines(db, lines, sizes)
        for path in logs:
            db.execute(
                "INSERT INTO processed_logs (name, processed_at) VALUES (?, ?)",
                (path.name, now.isoformat()),
            )
        db.commit()

        emit_json(db, state / "downloads.json", now)
    finally:
        db.close()

    duration_ms = int((time.monotonic() - started) * 1000)
    summary = (
        f"{now.strftime('%Y-%m-%dT%H:%M:%SZ')} logs={len(logs)} lines={len(lines)} days={stats['days']} "
        f"completions={stats['completions']} partials={stats['partials']} bytes={stats['bytes']} "
        f"unparsed={stats['unparsed']} ignored={stats['ignored']} "
        f"duration_ms={duration_ms}\n"
    )

    warnings = []
    stale = stale_warning(log_dir, log_pattern, today)
    if stale:
        warnings.append(stale)
    if stats["unparsed"]:
        warnings.append(
            f"unparsed log lines: {stats['unparsed']}; check that log_format djb_dl still matches parse_line"
        )
    for warning in warnings:
        summary += f"{now.strftime('%Y-%m-%dT%H:%M:%SZ')} WARNING {warning}\n"

    # Never truncated: one line per daily run is ~46 KB a year, and the box has no logrotate
    with open(state / "run.log", "a", encoding="utf-8") as handle:
        handle.write(summary)
    return summary


def main():
    parser = argparse.ArgumentParser(
        description="Aggregate closed daily nginx download logs into SQLite and downloads.json"
    )
    parser.add_argument("--log-dir", default=LOG_DIR)
    parser.add_argument("--log-pattern", default=LOG_PATTERN)
    parser.add_argument("--media-root", default=MEDIA_ROOT)
    parser.add_argument("--state-dir", default=STATE_DIR)
    args = parser.parse_args()
    summary = run(args.log_dir, args.log_pattern, args.media_root, args.state_dir)
    sys.stdout.write(summary)


if __name__ == "__main__":
    main()
