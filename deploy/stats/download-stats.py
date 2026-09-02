#!/usr/bin/env python3
"""Roll up closed daily nginx download logs into SQLite and emit downloads.json."""

# Stdlib only; this runs on the file server's system python

import argparse
import collections
import json
import os
import re
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
# Measured on the rescued logs: 97% of (IP, day) pairs took one file and none took 4 to 7
SCRAPE_FILE_CAP = 10
# A quiet week and a stopped nginx look identical without this
STALE_LOG_DAYS = 2
# curl/wget deliberately absent: command-line downloads are legitimate here
UA_BLOCKLIST = ("bot", "crawl", "spider", "python-requests", "go-http-client", "monitor", "uptime", "headless")

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
    ts_raw, uri, status_raw, bytes_raw, completion, _http_range, _req_time, ip, user_agent, _referer = fields
    try:
        timestamp = datetime.fromisoformat(ts_raw).astimezone(timezone.utc)
        status = int(status_raw)
        bytes_sent = int(bytes_raw)
    except ValueError:
        return None
    file_key = normalise_uri(uri)
    if file_key is None:
        return None
    return {
        "timestamp": timestamp,
        "file_key": file_key,
        "status": status,
        "bytes_sent": bytes_sent,
        "completed": completion == "OK",
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
    return [path for day, path in dated_logs(log_dir, log_pattern) if day < today and path.name not in done]


def read_log(path):
    with open(path, "rt", encoding="utf-8", errors="replace") as handle:
        return handle.readlines()


# `traffic` counts ranged bytes too, the only signal a streamed play leaves
# One file holds one day, so a batch boundary can never split a day across two runs
def collect_days(lines, sizes):
    days = {}
    skipped = 0

    for line in lines:
        entry = parse_line(line)
        if entry is None:
            skipped += 1
            continue
        if entry["status"] not in (200, 206):
            continue
        if is_blocked_agent(entry["user_agent"]):
            continue

        day = days.setdefault(entry["timestamp"].strftime("%Y-%m-%d"), {"credited": set(), "traffic": {}})
        traffic = day["traffic"].setdefault(entry["file_key"], {"bytes_sent": 0, "partial_requests": 0})
        traffic["bytes_sent"] += entry["bytes_sent"]

        if entry["status"] == 206:
            traffic["partial_requests"] += 1
            continue

        size = sizes.get(entry["file_key"])
        if size and entry["completed"] and entry["bytes_sent"] >= COMPLETION_THRESHOLD * size:
            day["credited"].add((entry["ip"], entry["file_key"]))

    return days, skipped


def credit_day(credited):
    # The raw address is read here and never stored; only the per-file tally leaves this function
    files_per_ip = collections.Counter(ip for ip, _file_key in credited)
    scrapers = {ip for ip, count in files_per_ip.items() if count >= SCRAPE_FILE_CAP}
    completions = collections.Counter(file_key for ip, file_key in credited if ip not in scrapers)
    return completions, len(scrapers)


def process_lines(db, lines, sizes):
    days, skipped = collect_days(lines, sizes)
    stats = {"days": len(days), "completions": 0, "partials": 0, "bytes": 0, "scrapers": 0, "skipped": skipped}

    for day, buckets in sorted(days.items()):
        completions, scraper_count = credit_day(buckets["credited"])
        stats["scrapers"] += scraper_count

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
                (file_key, day, counted, traffic["bytes_sent"], traffic["partial_requests"]),
            )
            # A backlog processed after the file landed would otherwise date it to the first run
            db.execute("UPDATE files SET first_seen = ? WHERE file_key = ? AND first_seen > ?", (day, file_key, day))
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
                "byte_equivalents": round(bytes_sent / size_bytes, 2) if size_bytes else 0,
                "first_seen": first_seen,
                "daily": dict(daily_rows),
            }
        )

    document = {"version": 1, "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "files": files}

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
            db.execute("INSERT INTO processed_logs (name, processed_at) VALUES (?, ?)", (path.name, now.isoformat()))
        db.commit()

        emit_json(db, state / "downloads.json", now)
    finally:
        db.close()

    duration_ms = int((time.monotonic() - started) * 1000)
    summary = (
        f"{now.strftime('%Y-%m-%dT%H:%M:%SZ')} logs={len(logs)} lines={len(lines)} days={stats['days']} "
        f"completions={stats['completions']} partials={stats['partials']} bytes={stats['bytes']} "
        f"scrapers={stats['scrapers']} skipped={stats['skipped']} duration_ms={duration_ms}\n"
    )
    warning = stale_warning(log_dir, log_pattern, today)
    if warning:
        summary += f"{now.strftime('%Y-%m-%dT%H:%M:%SZ')} WARNING {warning}\n"
    with open(state / "run.log", "a", encoding="utf-8") as handle:
        handle.write(summary)
    return summary


def main():
    parser = argparse.ArgumentParser(description="Aggregate closed daily nginx download logs into SQLite and downloads.json")
    parser.add_argument("--log-dir", default=LOG_DIR)
    parser.add_argument("--log-pattern", default=LOG_PATTERN)
    parser.add_argument("--media-root", default=MEDIA_ROOT)
    parser.add_argument("--state-dir", default=STATE_DIR)
    args = parser.parse_args()
    summary = run(args.log_dir, args.log_pattern, args.media_root, args.state_dir)
    sys.stdout.write(summary)


if __name__ == "__main__":
    main()
