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

# Fixed clock near the fixture dates so the staleness warning stays quiet
NOW = datetime(2026, 1, 11, 12, 0, 0, tzinfo=timezone.utc)
LINE = "{ts}\t/artifacts/{name}\t200\t{sent}\tOK\t-\t10.000\t{ip}\tMozilla/5.0 (Macintosh)\t-\n"


class DownloadStatsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.media_root = self.tmp / "media"
        self.state_dir = self.tmp / "state"
        self.log_dir = self.tmp / "logs"
        self.log_dir.mkdir()
        (self.media_root / "artifacts").mkdir(parents=True)
        (self.media_root / "stream").mkdir(parents=True)
        (self.media_root / "artifacts" / "Test Mix.mp3").write_bytes(b"x" * 1000)
        (self.media_root / "artifacts" / "Quiet Mix.flac").write_bytes(b"x" * 2000)
        (self.media_root / "stream" / "Test Mix.webm").write_bytes(b"x" * 800)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def write_log(self, name, text):
        (self.log_dir / name).write_text(text)

    def run_script(self, state_dir=None):
        return download_stats.run(
            str(self.log_dir), "downloads-*.log", str(self.media_root), str(state_dir or self.state_dir), now=NOW
        )

    def read_json(self, state_dir=None):
        return json.loads(((state_dir or self.state_dir) / "downloads.json").read_text())

    def test_fixture_rollup(self):
        shutil.copy(FIXTURE_LOG, self.log_dir / "downloads-2026-01-10.log")
        self.run_script()
        doc = self.read_json()

        self.assertEqual(doc["version"], 1)
        keys = [entry["key"] for entry in doc["files"]]
        # Artifacts only (no stream key), zero-download files included
        self.assertEqual(keys, ["artifacts/Quiet Mix.flac", "artifacts/Test Mix.mp3"])

        test_mix = doc["files"][1]
        # Clean 200 + curl 200 count; truncated fails threshold, bot UA dropped
        # Same-day repeat from one address deduped, 404 and malformed skipped
        self.assertEqual(test_mix["completions"], 2)
        # 1000 + 400 + 300 + 300 + 1000 (curl) + 1000 (deduped repeat still ships bytes)
        self.assertEqual(test_mix["byte_equivalents"], 4.0)
        self.assertEqual(test_mix["daily"], {"2026-01-10": 2})

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
        self.write_log(
            "downloads-2026-01-10.log",
            template.format(uri="/stream/Test%20Mix.m4a") + template.format(uri="/artifacts/Test%20Mix.webm"),
        )
        self.run_script()

        db = sqlite3.connect(self.state_dir / "stats.sqlite")
        rollups = db.execute("SELECT COUNT(*) FROM daily_rollup").fetchone()
        db.close()
        self.assertEqual(rollups, (0,))

    def test_a_log_is_processed_once(self):
        shutil.copy(FIXTURE_LOG, self.log_dir / "downloads-2026-01-10.log")
        self.run_script()
        first = self.read_json()
        self.run_script()
        self.assertEqual(first, self.read_json())

    def test_batched_logs_match_one_pass(self):
        # A day is one file, so a batch boundary never falls inside one; see collect_days
        day_one = "".join(
            LINE.format(ts="2026-01-09T10:00:00+00:00", name="Test%20Mix.mp3", sent=1000, ip=f"203.0.113.{n}")
            for n in range(3)
        )
        day_two = FIXTURE_LOG.read_text()

        self.write_log("downloads-2026-01-09.log", day_one)
        self.run_script()
        self.write_log("downloads-2026-01-10.log", day_two)
        self.run_script()
        incremental = self.read_json()

        # Reference: both days handed over in one run against a fresh state dir
        reference_state = self.tmp / "reference-state"
        self.run_script(state_dir=reference_state)

        self.assertEqual(incremental, self.read_json(state_dir=reference_state))
        self.assertEqual(incremental["files"][1]["daily"], {"2026-01-09": 3, "2026-01-10": 2})

    def test_todays_log_is_not_read(self):
        # nginx still holds today's file open; reading it would count a partial day and never revisit it
        self.write_log(
            "downloads-2026-01-11.log",
            LINE.format(ts="2026-01-11T09:00:00+00:00", name="Test%20Mix.mp3", sent=1000, ip="203.0.113.60"),
        )
        self.run_script()
        self.assertEqual(self.read_json()["files"][1]["completions"], 0)

    def test_dedupe_is_per_day(self):
        # One address either side of midnight is two downloads; twice in a day is one
        self.write_log(
            "downloads-2026-01-09.log",
            LINE.format(ts="2026-01-09T23:59:00+00:00", name="Test%20Mix.mp3", sent=1000, ip="203.0.113.50"),
        )
        self.write_log(
            "downloads-2026-01-10.log",
            LINE.format(ts="2026-01-10T00:01:00+00:00", name="Test%20Mix.mp3", sent=1000, ip="203.0.113.50")
            + LINE.format(ts="2026-01-10T18:00:00+00:00", name="Test%20Mix.mp3", sent=1000, ip="203.0.113.50"),
        )
        self.run_script()
        self.assertEqual(self.read_json()["files"][1]["completions"], 2)


    def test_corpus_scraper_is_dropped(self):
        # One address taking the whole corpus in a day counts for none of it; a listener beside it still counts
        for index in range(download_stats.SCRAPE_FILE_CAP):
            (self.media_root / "artifacts" / f"Mix {index}.mp3").write_bytes(b"x" * 1000)
        scrape = "".join(
            LINE.format(ts="2026-01-10T10:00:00+00:00", name=f"Mix%20{index}.mp3", sent=1000, ip="198.51.100.7")
            for index in range(download_stats.SCRAPE_FILE_CAP)
        )
        self.write_log(
            "downloads-2026-01-10.log",
            scrape + LINE.format(ts="2026-01-10T11:00:00+00:00", name="Mix%200.mp3", sent=1000, ip="203.0.113.80"),
        )
        self.run_script()

        counts = {entry["key"]: entry["completions"] for entry in self.read_json()["files"]}
        self.assertEqual(counts["artifacts/Mix 0.mp3"], 1)
        self.assertEqual(counts["artifacts/Mix 1.mp3"], 0)

    def test_unparsed_and_ignored_are_counted_apart(self):
        # A scanner 404 is routine; a line that fails to parse means the log format drifted
        scanner = "2026-01-10T10:00:00+00:00\t/wp-config.php\t404\t0\tOK\t-\t0.001\t198.51.100.9\tcurl/8.4.0\t-\n"
        self.write_log(
            "downloads-2026-01-10.log",
            scanner
            + "garbage line that does not parse\n"
            + LINE.format(ts="2026-01-10T10:01:00+00:00", name="Test%20Mix.mp3", sent=1000, ip="203.0.113.90"),
        )
        summary = self.run_script()

        self.assertIn("unparsed=1", summary)
        self.assertIn("ignored=1", summary)
        self.assertIn("WARNING unparsed log lines: 1", summary)
        self.assertEqual(self.read_json()["files"][1]["completions"], 1)

    def test_missing_log_dir_is_harmless(self):
        shutil.rmtree(self.log_dir)
        self.run_script()
        doc = self.read_json()
        self.assertEqual(sum(entry["completions"] for entry in doc["files"]), 0)
        self.assertEqual(len(doc["files"]), 2)


if __name__ == "__main__":
    unittest.main()
