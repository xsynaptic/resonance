#!/usr/bin/env python3
"""Tests for download-stats.py; run with `pnpm stats-test` (plain python3, stdlib only)."""

import importlib.util
import json
import shutil
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
FIXTURE_LOG = HERE / "fixtures" / "downloads.log"

# Hyphenated filename keeps repo conventions; load it as a module the long way
spec = importlib.util.spec_from_file_location("download_stats", HERE / "download-stats.py")
download_stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(download_stats)

# Fixed clock near the fixture dates so pruning never eats test state
NOW = datetime(2026, 1, 11, 12, 0, 0, tzinfo=timezone.utc)


class DownloadStatsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.media_root = self.tmp / "media"
        self.state_dir = self.tmp / "state"
        self.log = self.tmp / "downloads.log"
        self.rotated_log = self.tmp / "downloads.log.1"
        (self.media_root / "artifacts").mkdir(parents=True)
        (self.media_root / "stream").mkdir(parents=True)
        (self.media_root / "artifacts" / "Test Mix.mp3").write_bytes(b"x" * 1000)
        (self.media_root / "artifacts" / "Quiet Mix.flac").write_bytes(b"x" * 2000)
        (self.media_root / "stream" / "Test Mix.webm").write_bytes(b"x" * 800)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_script(self, state_dir=None):
        return download_stats.run(
            str(self.log), str(self.rotated_log), str(self.media_root), str(state_dir or self.state_dir), now=NOW
        )

    def read_json(self, state_dir=None):
        return json.loads(((state_dir or self.state_dir) / "downloads.json").read_text())

    def test_fixture_rollup(self):
        shutil.copy(FIXTURE_LOG, self.log)
        self.run_script()
        doc = self.read_json()

        self.assertEqual(doc["version"], 1)
        keys = [entry["key"] for entry in doc["files"]]
        # Artifacts only (no stream key), zero-download files included
        self.assertEqual(keys, ["artifacts/Quiet Mix.flac", "artifacts/Test Mix.mp3"])

        test_mix = doc["files"][1]
        # Clean 200 + curl 200 count; truncated fails threshold, bot UA dropped
        # Same-hour repeat deduped, 404 and malformed skipped
        self.assertEqual(test_mix["completions"], 2)
        # 1000 + 400 + 300 + 300 + 1000 (curl) + 1000 (deduped repeat still ships bytes)
        self.assertEqual(test_mix["byte_equivalents"], 4.0)
        self.assertEqual(test_mix["daily"], {"2026-01-10": 2})
        self.assertEqual(doc["totals"]["completions"], 2)

        quiet_mix = doc["files"][0]
        self.assertEqual(quiet_mix["completions"], 0)
        self.assertEqual(quiet_mix["size_bytes"], 2000)

        # Stream traffic is rolled up in SQLite for the future player, just not emitted
        db = sqlite3.connect(self.state_dir / "stats.sqlite")
        stream_bytes = db.execute(
            "SELECT bytes_sent FROM daily_rollup WHERE file_key = 'stream/Test Mix.webm'"
        ).fetchone()
        db.close()
        self.assertEqual(stream_bytes, (500,))

    def test_untracked_extensions_are_ignored(self):
        # .m4a is the abandoned AAC rendition format; a webm under /artifacts/ is equally out of place
        template = "2026-01-10T10:00:00+00:00\t{uri}\t200\t800\tOK\t-\t1.000\t203.0.113.70\tMozilla/5.0 (Macintosh)\t-\n"
        self.log.write_text(
            template.format(uri="/stream/Test%20Mix.m4a") + template.format(uri="/artifacts/Test%20Mix.webm")
        )
        self.run_script()

        db = sqlite3.connect(self.state_dir / "stats.sqlite")
        rollups = db.execute("SELECT COUNT(*) FROM daily_rollup").fetchone()
        db.close()
        self.assertEqual(rollups, (0,))

    def test_idempotency(self):
        shutil.copy(FIXTURE_LOG, self.log)
        self.run_script()
        first = self.read_json()
        self.run_script()
        second = self.read_json()
        self.assertEqual(first, second)

    def test_rotation_loses_nothing(self):
        lines = FIXTURE_LOG.read_text().splitlines(keepends=True)
        chunk_1, chunk_2, chunk_3 = lines[:4], lines[4:7], lines[7:]

        # Incremental run, then more lines land, then logrotate moves the file aside
        self.log.write_text("".join(chunk_1))
        self.run_script()
        self.log.write_text("".join(chunk_1 + chunk_2))
        self.log.rename(self.rotated_log)
        self.log.write_text("".join(chunk_3))
        self.run_script()
        incremental = self.read_json()

        # Reference: everything in one pass against a fresh state dir
        self.rotated_log.unlink()
        self.log.write_text("".join(lines))
        reference_state = self.tmp / "reference-state"
        self.run_script(state_dir=reference_state)
        reference = self.read_json(state_dir=reference_state)

        self.assertEqual(incremental, reference)

    def test_salt_rotates_across_days(self):
        template = (
            "{ts}\t/artifacts/Test%20Mix.mp3\t200\t1000\tOK\t-\t10.000\t203.0.113.50\tMozilla/5.0 (Macintosh)\t-\n"
        )
        self.log.write_text(
            template.format(ts="2026-01-10T23:59:00+00:00") + template.format(ts="2026-01-11T00:01:00+00:00")
        )
        self.run_script()

        db = sqlite3.connect(self.state_dir / "stats.sqlite")
        salts = db.execute("SELECT day, salt FROM salts ORDER BY day").fetchall()
        db.close()
        self.assertEqual([day for day, _salt in salts], ["2026-01-10", "2026-01-11"])
        self.assertNotEqual(salts[0][1], salts[1][1])
        # Same client on both sides of midnight: different salt, different bucket, both count
        self.assertEqual(self.read_json()["files"][1]["completions"], 2)

    def test_truncated_log_restarts_from_zero(self):
        template = (
            "{ts}\t/artifacts/Test%20Mix.mp3\t200\t1000\tOK\t-\t10.000\t{ip}\tMozilla/5.0 (Macintosh)\t-\n"
        )
        self.log.write_text(template.format(ip="203.0.113.60", ts="2026-01-10T09:00:00+00:00"))
        self.run_script()

        # Same inode, strictly smaller file: copytruncate-style rotation must not strand the offset
        self.log.write_text(template.format(ip="1.2.3.4", ts="2026-01-10T11:00:00+00:00"))
        self.run_script()

        self.assertEqual(self.read_json()["files"][1]["completions"], 2)

    def test_missing_log_is_harmless(self):
        self.run_script()
        doc = self.read_json()
        self.assertEqual(doc["totals"]["completions"], 0)
        self.assertEqual(len(doc["files"]), 2)


if __name__ == "__main__":
    unittest.main()
