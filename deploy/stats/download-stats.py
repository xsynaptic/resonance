#!/usr/bin/env python3
"""Roll up nginx download logs into SQLite and emit downloads.json.

Runs hourly from cron (see deploy/cron.d/download-stats). Stdlib only; must stay
runnable on a bare Ubuntu box and readable in a text editor. Idempotent: progress
is tracked as a byte offset + inode watermark, so re-runs never double-count.
"""

import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOG_PATH = "<nginx-log-path>/downloads.log"
ROTATED_LOG_PATH = "<nginx-log-path>/downloads.log.1"
MEDIA_ROOT = "<audio-path>"
STATE_DIR = "<stats-state-path>"

COMPLETION_THRESHOLD = 0.95
WINDOW_DAYS = 90
DEDUPE_RETENTION_DAYS = 2
# curl/wget deliberately absent: command-line downloads are legitimate here
UA_BLOCKLIST = ("bot", "crawl", "spider", "python-requests", "go-http-client", "monitor", "uptime", "headless")
# Throughput heuristic: real transfers are capped by limit_rate (~3MB/s past 8MB),
# so a large body claiming a much faster rate never reached a real client
HEURISTIC_MIN_BYTES = 16 * 1024 * 1024
MAX_PLAUSIBLE_BYTES_PER_SEC = 50 * 1024 * 1024

FILE_KEY_RE = re.compile(r"^/(artifacts|stream)/[^/]+\.(mp3|flac|m4a)$")

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
CREATE TABLE IF NOT EXISTS dedupe_seen (
  bucket_key TEXT PRIMARY KEY,
  seen_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS salts (
  day  TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watermark (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  last_ts      TEXT,
  log_inode    INTEGER,
  log_offset   INTEGER
);
"""


def sha256_hex(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def get_salt(db, day):
    row = db.execute("SELECT salt FROM salts WHERE day = ?", (day,)).fetchone()
    if row:
        return row[0]
    salt = secrets.token_hex(16)
    db.execute("INSERT INTO salts (day, salt) VALUES (?, ?)", (day, salt))
    return salt


def normalise_uri(raw_uri):
    # Strip query, decode, and require a canonical media path; returns a file key
    # like "artifacts/DJ Basilisk - Foo.mp3" or None for anything untracked
    from urllib.parse import unquote

    path = raw_uri.split("?", 1)[0]
    path = unquote(path)
    if not FILE_KEY_RE.match(path):
        return None
    return path.lstrip("/")


def parse_line(line):
    fields = line.rstrip("\n").split("\t")
    if len(fields) != 10:
        return None
    ts_raw, uri, status_raw, bytes_raw, completion, http_range, req_time_raw, ip, user_agent, _referer = fields
    try:
        timestamp = datetime.fromisoformat(ts_raw).astimezone(timezone.utc)
        status = int(status_raw)
        bytes_sent = int(bytes_raw)
        request_time = float(req_time_raw)
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
        "has_range": http_range not in ("", "-"),
        "request_time": request_time,
        "ip": ip,
        "user_agent": user_agent,
    }


def is_bot(entry):
    ua_lower = entry["user_agent"].lower()
    if any(marker in ua_lower for marker in UA_BLOCKLIST):
        return True
    if (
        entry["bytes_sent"] > HEURISTIC_MIN_BYTES
        and entry["request_time"] > 0
        and entry["bytes_sent"] / entry["request_time"] > MAX_PLAUSIBLE_BYTES_PER_SEC
    ):
        return True
    return False


def scan_media_sizes(media_root):
    sizes = {}
    root = Path(media_root)
    for subdir in ("artifacts", "stream"):
        base = root / subdir
        if not base.is_dir():
            continue
        for file_path in base.iterdir():
            if file_path.is_file() and file_path.suffix in (".mp3", ".flac", ".m4a"):
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


def read_new_lines(log_path, rotated_log_path, watermark):
    """Yield unprocessed lines, honoring the inode+offset watermark.

    On rotation, drain the tail of the rotated file first (if its inode still
    matches the stored one) so no lines are lost between the last run and rotation.

    Assumes create-style logrotate (the nginx.org package default): rotation renames
    the file, so the new log gets a new inode and .1 keeps the old one. A copytruncate
    policy keeps the inode while shrinking the file; the size guard below catches that
    (restart from zero) instead of seeking past EOF and silently reading nothing forever.
    """
    lines = []
    stored_inode, stored_offset = watermark
    current_stat = os.stat(log_path) if os.path.exists(log_path) else None

    if current_stat is None:
        return lines, watermark

    if stored_inode is not None and current_stat.st_ino == stored_inode and current_stat.st_size < stored_offset:
        stored_offset = 0

    if stored_inode is not None and current_stat.st_ino != stored_inode:
        if os.path.exists(rotated_log_path) and os.stat(rotated_log_path).st_ino == stored_inode:
            with open(rotated_log_path, encoding="utf-8", errors="replace") as handle:
                handle.seek(stored_offset)
                lines.extend(handle.readlines())
        stored_offset = 0

    with open(log_path, encoding="utf-8", errors="replace") as handle:
        if stored_inode is not None and current_stat.st_ino == stored_inode:
            handle.seek(stored_offset)
        lines.extend(handle.readlines())
        new_offset = handle.tell()

    return lines, (current_stat.st_ino, new_offset)


def process_lines(db, lines, sizes):
    stats = {"parsed": 0, "completions": 0, "partials": 0, "bytes": 0}
    # Accumulate per (file_key, day) and upsert once at the end of the run
    rollup = {}
    last_ts = None

    for line in lines:
        entry = parse_line(line)
        if entry is None:
            continue
        if entry["status"] not in (200, 206):
            continue
        if is_bot(entry):
            continue
        stats["parsed"] += 1

        day = entry["timestamp"].strftime("%Y-%m-%d")
        hour = entry["timestamp"].strftime("%Y-%m-%dT%H")
        last_ts = entry["timestamp"].isoformat()
        bucket = rollup.setdefault((entry["file_key"], day), {"completions": 0, "bytes_sent": 0, "partial_requests": 0})
        bucket["bytes_sent"] += entry["bytes_sent"]
        stats["bytes"] += entry["bytes_sent"]

        if entry["status"] == 206:
            bucket["partial_requests"] += 1
            stats["partials"] += 1
            continue

        size = sizes.get(entry["file_key"])
        if size is None or size == 0:
            continue
        if not (entry["completed"] and entry["bytes_sent"] >= COMPLETION_THRESHOLD * size):
            continue

        # Hash the address immediately; the raw IP never touches the database
        salt = get_salt(db, day)
        ip_hash = sha256_hex(salt + entry["ip"])
        ua_hash = sha256_hex(entry["user_agent"])
        bucket_key = sha256_hex(f"{ip_hash}|{ua_hash}|{entry['file_key']}|{hour}")
        seen = db.execute("SELECT 1 FROM dedupe_seen WHERE bucket_key = ?", (bucket_key,)).fetchone()
        if seen:
            continue
        db.execute("INSERT INTO dedupe_seen (bucket_key, seen_at) VALUES (?, ?)", (bucket_key, last_ts))
        bucket["completions"] += 1
        stats["completions"] += 1

    for (file_key, day), bucket in rollup.items():
        db.execute(
            """
            INSERT INTO daily_rollup (file_key, day, completions, bytes_sent, partial_requests) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(file_key, day) DO UPDATE SET
              completions = completions + excluded.completions,
              bytes_sent = bytes_sent + excluded.bytes_sent,
              partial_requests = partial_requests + excluded.partial_requests
            """,
            (file_key, day, bucket["completions"], bucket["bytes_sent"], bucket["partial_requests"]),
        )

    return stats, last_ts


def prune(db, now):
    cutoff = (now - timedelta(days=DEDUPE_RETENTION_DAYS)).isoformat()
    day_cutoff = (now - timedelta(days=DEDUPE_RETENTION_DAYS)).strftime("%Y-%m-%d")
    db.execute("DELETE FROM dedupe_seen WHERE seen_at < ?", (cutoff,))
    db.execute("DELETE FROM salts WHERE day < ?", (day_cutoff,))


def emit_json(db, output_path, now):
    # Wire format consumed by src/lib/schemas/downloads.ts + downloads-loader.ts (strict
    # schemas, soft-fail): change the shape or bump "version" only in lockstep with both
    # Completions and byte_equivalents are all-time; the daily series is windowed
    window_start = (now - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%d")
    files = []
    totals = {"completions": 0, "bytes_sent": 0}

    rows = db.execute(
        "SELECT file_key, size_bytes, first_seen FROM files WHERE file_key LIKE 'artifacts/%' ORDER BY file_key"
    ).fetchall()
    for file_key, size_bytes, first_seen in rows:
        agg = db.execute(
            "SELECT COALESCE(SUM(completions), 0), COALESCE(SUM(bytes_sent), 0) FROM daily_rollup WHERE file_key = ?",
            (file_key,),
        ).fetchone()
        completions, bytes_sent = agg
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
        totals["completions"] += completions
        totals["bytes_sent"] += bytes_sent

    document = {
        "version": 1,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window_days": WINDOW_DAYS,
        "files": files,
        "totals": totals,
    }

    # Atomic replace so a concurrent rsync pull never sees a partial document
    tmp_path = output_path.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(document, indent=1) + "\n", encoding="utf-8")
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, output_path)


def run(log_path, rotated_log_path, media_root, state_dir, now=None):
    started = time.monotonic()
    now = now or datetime.now(timezone.utc)
    state = Path(state_dir)
    state.mkdir(mode=0o755, parents=True, exist_ok=True)

    db = sqlite3.connect(state / "stats.sqlite")
    db.executescript(SCHEMA)
    try:
        row = db.execute("SELECT log_inode, log_offset FROM watermark WHERE id = 1").fetchone()
        watermark = (row[0], row[1]) if row else (None, 0)

        sizes = scan_media_sizes(media_root)
        refresh_files_table(db, sizes, now.strftime("%Y-%m-%d"))

        lines, new_watermark = read_new_lines(log_path, rotated_log_path, watermark)
        stats, last_ts = process_lines(db, lines, sizes)
        db.execute(
            "INSERT INTO watermark (id, last_ts, log_inode, log_offset) VALUES (1, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET last_ts = COALESCE(excluded.last_ts, last_ts), "
            "log_inode = excluded.log_inode, log_offset = excluded.log_offset",
            (last_ts, new_watermark[0], new_watermark[1]),
        )
        prune(db, now)
        db.commit()

        emit_json(db, state / "downloads.json", now)
    finally:
        db.close()

    duration_ms = int((time.monotonic() - started) * 1000)
    summary = (
        f"{now.strftime('%Y-%m-%dT%H:%M:%SZ')} lines={len(lines)} parsed={stats['parsed']} "
        f"completions={stats['completions']} partials={stats['partials']} bytes={stats['bytes']} duration_ms={duration_ms}\n"
    )
    with open(state / "run.log", "a", encoding="utf-8") as handle:
        handle.write(summary)
    return summary


def main():
    parser = argparse.ArgumentParser(description="Aggregate nginx download logs into SQLite and downloads.json")
    parser.add_argument("--log", default=LOG_PATH)
    parser.add_argument("--rotated-log", default=ROTATED_LOG_PATH)
    parser.add_argument("--media-root", default=MEDIA_ROOT)
    parser.add_argument("--state-dir", default=STATE_DIR)
    args = parser.parse_args()
    summary = run(args.log, args.rotated_log, args.media_root, args.state_dir)
    sys.stdout.write(summary)


if __name__ == "__main__":
    main()
