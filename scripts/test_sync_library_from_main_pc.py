"""Windows integration checks using disposable SQLite databases, never app data."""

import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("sync-library-from-main-pc.ps1")


@unittest.skipUnless(os.name == "nt", "Windows PowerShell script")
class DatabaseCopyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="music-library-sync-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "main pc" / "music-library.sqlite3"
        self.destination = self.root / "local pc" / "music-library.sqlite3"
        for path, value in [(self.source, "main"), (self.destination, "old local")]:
            path.parent.mkdir()
            with sqlite3.connect(path) as database:
                database.execute("CREATE TABLE marker (value TEXT)")
                database.execute("INSERT INTO marker VALUES (?)", (value,))
            database.close()
        self.source_bytes = self.source.read_bytes()
        self.local_bytes = self.destination.read_bytes()

    def run_copy(self, *extra, source=None, success=True):
        result = subprocess.run(
            [
                "powershell.exe", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT),
                "-SourcePath", str(source or self.source),
                "-DestinationPath", str(self.destination), *extra,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(list(self.destination.parent.glob("*-download-*")), [])
        return result

    def assert_originals_unchanged(self):
        self.assertEqual(self.source.read_bytes(), self.source_bytes)
        self.assertEqual(self.destination.read_bytes(), self.local_bytes)
        self.assertEqual(list(self.destination.parent.glob("*.before-sync-*.sqlite3")), [])

    def test_replaces_database_and_preserves_exact_backup(self):
        for suffix in ["-wal", "-journal", "-shm"]:
            Path(str(self.destination) + suffix).write_bytes(b"stale" if suffix == "-shm" else b"")
        Path(str(self.source) + "-wal").write_bytes(b"")
        self.run_copy()
        self.assertEqual(self.source.read_bytes(), self.source_bytes)
        self.assertTrue(Path(str(self.source) + "-wal").exists())
        self.assertEqual(self.destination.read_bytes(), self.source_bytes)
        backups = list(self.destination.parent.glob("*.before-sync-*.sqlite3"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), self.local_bytes)
        for suffix in ["-wal", "-journal", "-shm"]:
            self.assertFalse(Path(str(self.destination) + suffix).exists())
        with sqlite3.connect(self.destination) as database:
            self.assertEqual(database.execute("PRAGMA quick_check").fetchone(), ("ok",))
            self.assertEqual(database.execute("SELECT value FROM marker").fetchone(), ("main",))
        database.close()

    def test_first_copy_creates_directory_and_database(self):
        self.destination.unlink()
        self.destination.parent.rmdir()
        self.run_copy()
        self.assertEqual(self.destination.read_bytes(), self.source_bytes)
        self.assertEqual(list(self.destination.parent.glob("*.before-sync-*.sqlite3")), [])

    def test_whatif_does_not_change_files(self):
        self.run_copy("-WhatIf")
        self.assert_originals_unchanged()

    def test_missing_source_preserves_local_database(self):
        self.run_copy(source=self.root / "missing.sqlite3", success=False)
        self.assert_originals_unchanged()

    def test_invalid_source_preserves_local_database(self):
        invalid = self.root / "invalid.sqlite3"
        invalid.write_bytes(b"not a SQLite database" * 100)
        self.run_copy(source=invalid, success=False)
        self.assert_originals_unchanged()

    def test_same_source_and_destination_is_rejected(self):
        self.run_copy(source=self.destination, success=False)
        self.assert_originals_unchanged()

    def test_open_source_is_rejected(self):
        database = sqlite3.connect(self.source)
        try:
            self.run_copy(success=False)
        finally:
            database.close()
        self.assert_originals_unchanged()

    def test_open_destination_is_rejected(self):
        database = sqlite3.connect(self.destination)
        try:
            self.run_copy(success=False)
        finally:
            database.close()
        self.assert_originals_unchanged()

    def test_pending_journals_are_preserved_and_rejected(self):
        for database in [self.source, self.destination]:
            for suffix in ["-wal", "-journal"]:
                with self.subTest(database=database, suffix=suffix):
                    journal = Path(str(database) + suffix)
                    journal.write_bytes(b"pending SQLite changes")
                    try:
                        self.run_copy(success=False)
                        self.assertEqual(journal.read_bytes(), b"pending SQLite changes")
                        self.assert_originals_unchanged()
                    finally:
                        journal.unlink()


if __name__ == "__main__":
    unittest.main()
