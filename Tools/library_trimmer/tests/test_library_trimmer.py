from __future__ import annotations

import csv
import importlib.util
import io
import json
import sqlite3
import tempfile
import unittest
from argparse import Namespace
from contextlib import closing, redirect_stderr, redirect_stdout
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "library_trimmer.py"
SPEC = importlib.util.spec_from_file_location("library_trimmer", MODULE_PATH)
assert SPEC and SPEC.loader
trimmer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(trimmer)


class ProgressReporterTests(unittest.TestCase):
    def test_reports_stages_counts_rate_and_eta(self) -> None:
        stream = io.StringIO()
        progress = trimmer.ProgressReporter("scan", stream=stream)
        progress.stage("Loading database")
        progress.begin_items("Discogs", 2, "classifying albums")
        progress.item(1, 2, "Artist — First: keep")
        progress.item(2, 2, "Artist — Second: move_candidate")
        progress.done("scan complete")

        output = stream.getvalue()
        self.assertIn("[scan +", output)
        self.assertIn("Loading database", output)
        self.assertIn("Discogs 1/2", output)
        self.assertIn("50.0%", output)
        self.assertIn("/s", output)
        self.assertIn("ETA", output)
        self.assertIn("Done: scan complete", output)

    def test_json_output_stays_clean_while_progress_uses_stderr(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            stdout = io.StringIO()
            stderr = io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = trimmer.main(
                    [
                        "--json",
                        "doctor",
                        "--db",
                        str(Path(temp) / "missing.sqlite3"),
                        "--skip-network",
                    ]
                )

        self.assertEqual(exit_code, 1)
        payload = json.loads(stdout.getvalue())
        self.assertFalse(payload["ok"])
        self.assertIn("[doctor +", stderr.getvalue())
        self.assertNotIn("[doctor +", stdout.getvalue())


class DiscogsClassificationTests(unittest.TestCase):
    def test_keeps_strong_pure_album_match(self) -> None:
        payload = {
            "results": [
                {
                    "id": 27976,
                    "type": "master",
                    "master_id": 27976,
                    "title": "Pet Shop Boys - Actually",
                    "year": "1987",
                    "format": ["Vinyl", "LP", "Album"],
                },
                {
                    "id": 1655528,
                    "type": "release",
                    "master_id": 27976,
                    "title": "Pet Shop Boys - Actually",
                    "year": "2009",
                    "format": ["CD", "Album", "Reissue", "Remastered"],
                },
            ]
        }
        result = trimmer.classify_discogs_search(
            payload, artist="Pet Shop Boys", title="Actually", year=1987
        )
        self.assertEqual(result["classification"], "keep")
        self.assertGreaterEqual(result["confidence"], 0.85)

    def test_moves_strong_compilation_match(self) -> None:
        payload = {
            "results": [
                {
                    "id": 123,
                    "type": "master",
                    "master_id": 123,
                    "title": "Example Artist - Greatest Hits",
                    "year": "1999",
                    "format": ["CD", "Album", "Compilation"],
                }
            ]
        }
        result = trimmer.classify_discogs_search(
            payload,
            artist="Example Artist",
            title="Greatest Hits",
            year=1999,
        )
        self.assertEqual(result["classification"], "move_candidate")
        self.assertIn("compilation", result["match"]["excludedDescriptors"])

    def test_any_strong_pure_album_group_prevents_a_move(self) -> None:
        payload = {
            "results": [
                {
                    "id": 100,
                    "type": "master",
                    "master_id": 100,
                    "title": "Example Artist - Same Name",
                    "year": "2000",
                    "format": ["CD", "Single"],
                },
                {
                    "id": 200,
                    "type": "master",
                    "master_id": 200,
                    "title": "Example Artist - Same Name",
                    "year": "2000",
                    "format": ["CD", "Album"],
                },
            ]
        }
        result = trimmer.classify_discogs_search(
            payload, artist="Example Artist", title="Same Name", year=2000
        )
        self.assertEqual(result["classification"], "keep")
        self.assertEqual(result["match"]["strongMatchedGroupCount"], 2)

    def test_reviews_weak_or_untyped_match(self) -> None:
        payload = {
            "results": [
                {
                    "id": 456,
                    "type": "release",
                    "title": "Another Artist - Unknown",
                    "year": "2001",
                    "format": ["CD"],
                }
            ]
        }
        result = trimmer.classify_discogs_search(
            payload, artist="Example Artist", title="Unknown", year=2001
        )
        self.assertEqual(result["classification"], "review")


class CandidateTests(unittest.TestCase):
    def create_databases(self, root: Path) -> tuple[Path, Path]:
        app_path = root / "app.sqlite3"
        cache_path = root / "musicbrainz.sqlite3"
        with closing(sqlite3.connect(app_path)) as db:
            db.executescript(
                """
                CREATE TABLE albums (
                    id TEXT PRIMARY KEY,
                    album TEXT,
                    album_artist_display TEXT,
                    year INTEGER,
                    release_year INTEGER,
                    total_tracks INTEGER,
                    canonical_genre TEXT
                );
                CREATE TABLE tracks (
                    id INTEGER PRIMARY KEY,
                    album_id TEXT,
                    title TEXT,
                    disc_number INTEGER,
                    track_number INTEGER,
                    file_path TEXT,
                    filename TEXT
                );
                CREATE TABLE app_settings (
                    id INTEGER PRIMARY KEY,
                    musicbrainz_cache_path TEXT
                );
                CREATE TABLE musicbrainz_artist_links (
                    local_artist_key TEXT,
                    mbid TEXT,
                    canonical_name TEXT,
                    verification_state TEXT,
                    ignored INTEGER
                );
                CREATE TABLE musicbrainz_release_decisions (
                    local_artist_key TEXT,
                    release_mbid TEXT,
                    decision TEXT
                );
                CREATE TABLE musicbrainz_release_status_cache (
                    artist_mbid TEXT,
                    release_mbid TEXT,
                    has_official_release INTEGER
                );
                CREATE TABLE musicbrainz_artist_release_groups (
                    artist_mbid TEXT,
                    release_mbid TEXT,
                    title TEXT,
                    year INTEGER,
                    type TEXT,
                    secondary_types TEXT,
                    status TEXT
                );
                """
            )
            db.execute(
                "INSERT INTO app_settings VALUES (1, ?)", (str(cache_path),)
            )
            db.executemany(
                "INSERT INTO albums VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        "album-1",
                        "Actually",
                        "Pet Shop Boys",
                        1987,
                        1987,
                        10,
                        "Synthpop",
                    ),
                    (
                        "album-2",
                        "Disco",
                        "Pet Shop Boys",
                        1986,
                        1986,
                        6,
                        "Dance",
                    ),
                ],
            )
            db.execute(
                """
                INSERT INTO musicbrainz_artist_links
                VALUES ('pet shop boys', 'mbid-psb', 'Pet Shop Boys', 'verified', 0)
                """
            )
            db.commit()
        with closing(sqlite3.connect(cache_path)) as db:
            db.executescript(
                """
                CREATE TABLE artist_cache (name TEXT, mbid TEXT);
                CREATE TABLE release_groups (
                    artist_mbid TEXT,
                    release_mbid TEXT,
                    title TEXT,
                    year INTEGER,
                    type TEXT,
                    secondary_types TEXT,
                    status TEXT
                );
                INSERT INTO artist_cache VALUES ('Pet Shop Boys', 'mbid-psb');
                INSERT INTO release_groups VALUES
                  ('mbid-psb', 'rg-actually', 'Actually', 1987, 'Album', '', 'Official'),
                  ('mbid-psb', 'rg-disco', 'Disco', 1986, 'Album', 'Remix', 'Official');
                """
            )
            db.commit()
        return app_path, cache_path

    def test_prefilter_keeps_pure_album_and_returns_non_pure_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            app_path, cache_path = self.create_databases(Path(temp))
            with trimmer.open_sqlite_read_only(app_path) as app:
                trimmer.validate_app_schema(app)
                albums = trimmer.load_albums(app)
                with trimmer.open_sqlite_read_only(cache_path) as cache:
                    trimmer.validate_musicbrainz_schema(cache)
                    candidates, metadata = trimmer.load_musicbrainz_candidates(
                        app, cache, albums
                    )
            self.assertEqual([row["albumId"] for row in candidates], ["album-2"])
            exact = candidates[0]["musicbrainz"]["exactReleaseGroup"]
            self.assertEqual(exact["secondaryTypes"], ["Remix"])
            self.assertEqual(metadata["candidateAlbumCount"], 1)

    def test_scores_soundtrack_and_synthwave_genres_can_be_excluded(self) -> None:
        albums = [
            {"genreKey": "action"},
            {"genreKey": "soundtrack"},
            {"genreKey": "synthwave"},
            {"genreKey": "synthpop"},
        ]
        scoped, summary = trimmer.scope_albums_by_genre(
            albums, ["scores", "soundtrack", "synthwave"]
        )
        self.assertEqual(scoped, [{"genreKey": "synthpop"}])
        self.assertEqual(summary["excludedGenreAlbumCount"], 3)
        self.assertIn("video game", summary["expandedExcludedGenres"])

    def test_library_root_requires_every_track_directory_inside(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            music_root = root / "MUSIC"
            inside = music_root / "Artist" / "Album"
            outside = root / "Other"
            inside.mkdir(parents=True)
            outside.mkdir()
            db_path = root / "scope.sqlite3"
            with closing(sqlite3.connect(db_path)) as db:
                db.execute("CREATE TABLE tracks (album_id TEXT, file_path TEXT)")
                db.executemany(
                    "INSERT INTO tracks VALUES (?, ?)",
                    [
                        ("inside", str(inside)),
                        ("inside", str(inside)),
                        ("mixed", str(inside)),
                        ("mixed", str(outside)),
                        ("outside", str(outside)),
                    ],
                )
                db.commit()
            albums = [
                {"albumId": "inside"},
                {"albumId": "mixed"},
                {"albumId": "outside"},
            ]
            with trimmer.open_sqlite_read_only(db_path) as db:
                scoped, summary = trimmer.scope_albums_to_library_root(
                    db, albums, music_root
                )
            self.assertEqual([album["albumId"] for album in scoped], ["inside"])
            self.assertEqual(summary["mixedLocationAlbumCount"], 1)
            self.assertEqual(summary["outsideRootAlbumCount"], 1)


class MoveAndReviewTests(unittest.TestCase):
    def create_manifest(self, root: Path) -> tuple[Path, Path]:
        music = root / "music" / "Example Artist" / "Live Album"
        music.mkdir(parents=True)
        first = music / "01 - One.mp3"
        second = music / "02 - Two.mp3"
        first.write_bytes(b"first track")
        second.write_bytes(b"second track")
        files = []
        for index, path in enumerate((first, second), start=1):
            stat = path.stat()
            files.append(
                {
                    "source": str(path),
                    "filename": path.name,
                    "relativePath": path.name,
                    "exists": True,
                    "sizeBytes": stat.st_size,
                    "mtimeNs": stat.st_mtime_ns,
                    "discNumber": 1,
                    "trackNumber": index,
                }
            )
        manifest = {
            "schemaVersion": trimmer.MANIFEST_SCHEMA_VERSION,
            "albums": [
                {
                    "albumId": "album-live",
                    "artist": "Example Artist",
                    "title": "Live Album",
                    "automatedClassification": "move_candidate",
                    "reviewDecision": None,
                    "approved": True,
                    "destinationArtistSegment": "Example Artist",
                    "destinationAlbumSegment": "Live Album [12345678]",
                    "files": files,
                }
            ],
        }
        path = root / "manifest.json"
        trimmer.write_json_atomic(path, manifest)
        return path, first

    def test_apply_preview_execute_and_undo(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest_path, original = self.create_manifest(root)
            quarantine = root / "quarantine"
            preview = trimmer.apply_command(
                Namespace(
                    manifest=str(manifest_path),
                    quarantine=str(quarantine),
                    journal=None,
                    execute=False,
                    confirm=None,
                )
            )
            self.assertEqual(preview["mode"], "preview")
            journal_path = root / "journal.json"
            executed = trimmer.apply_command(
                Namespace(
                    manifest=str(manifest_path),
                    quarantine=str(quarantine),
                    journal=str(journal_path),
                    execute=True,
                    confirm=trimmer.MOVE_CONFIRMATION,
                )
            )
            self.assertEqual(executed["fileCount"], 2)
            self.assertFalse(original.exists())
            undo_preview = trimmer.undo_command(
                Namespace(
                    journal=str(journal_path),
                    execute=False,
                    confirm=None,
                )
            )
            self.assertEqual(undo_preview["fileCount"], 2)
            undone = trimmer.undo_command(
                Namespace(
                    journal=str(journal_path),
                    execute=True,
                    confirm=trimmer.UNDO_CONFIRMATION,
                )
            )
            self.assertEqual(undone["restoredFileCount"], 2)
            self.assertTrue(original.exists())

    def test_review_import_requires_manual_move_for_ambiguous_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest_path, _ = self.create_manifest(root)
            manifest = trimmer.read_json(manifest_path)
            manifest["albums"][0]["automatedClassification"] = "review"
            manifest["albums"][0]["approved"] = False
            trimmer.write_json_atomic(manifest_path, manifest)
            review_path = root / "review.csv"
            with review_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["albumId", "reviewDecision", "approved"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "albumId": "album-live",
                        "reviewDecision": "move",
                        "approved": "yes",
                    }
                )
            result = trimmer.import_review_command(
                Namespace(manifest=str(manifest_path), review=str(review_path))
            )
            self.assertEqual(result["changedAlbumCount"], 1)
            updated = trimmer.read_json(manifest_path)
            self.assertEqual(updated["albums"][0]["reviewDecision"], "move")
            self.assertTrue(updated["albums"][0]["approved"])

    def test_apply_rejects_quarantine_inside_manifest_library_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest_path, _ = self.create_manifest(root)
            manifest = trimmer.read_json(manifest_path)
            manifest["libraryRoot"] = str(root / "music")
            trimmer.write_json_atomic(manifest_path, manifest)
            with self.assertRaisesRegex(
                trimmer.TrimmerError, "outside the manifest library root"
            ):
                trimmer.apply_command(
                    Namespace(
                        manifest=str(manifest_path),
                        quarantine=str(root / "music" / "Quarantine"),
                        journal=None,
                        execute=False,
                        confirm=None,
                    )
                )


if __name__ == "__main__":
    unittest.main()
