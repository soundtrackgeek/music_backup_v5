import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from rebuild_billboard_singles import BEST, HOT, TOP, YEARS, annual_rows, chart_for_week, replace_files, preserve_album_metadata


def entry(artist, title, week, position, chart=HOT, entered=""):
    return dict(artist=artist, title=title, week_ending=week, position=str(position),
                chart=chart, entry_date=entered)


class AnnualRankingTests(unittest.TestCase):
    def test_transitions_and_preserved_years(self):
        self.assertEqual(chart_for_week("1955-11-05"), BEST)
        self.assertEqual(chart_for_week("1955-11-12"), TOP)
        self.assertEqual(chart_for_week("1958-07-28"), TOP)
        self.assertEqual(chart_for_week("1958-08-04"), HOT)
        self.assertNotIn(1953, YEARS)
        self.assertEqual((min(YEARS), max(YEARS), len(YEARS)), (1940, 2025, 85))

    def test_ranking_distinct_weeks_and_printed_identity(self):
        rows = [entry("A", "Long run", "1993-01-02", 2),
                entry("A", "Long run", "1993-01-09", 2),
                entry("B", "Number one", "1993-01-02", 1),
                entry("B", "Number one", "1993-01-02", 1),
                entry("C", "Song (LP)", "1993-01-02", 3),
                entry("C", "Song", "1993-01-02", 4),
                entry("D", "Unrelated chart", "1993-01-02", 1, "Radio Songs")]
        ranked = annual_rows(1993, rows)
        self.assertEqual([r["Track"] for r in ranked], ["Number one", "Long run", "Song (LP)", "Song"])
        self.assertEqual(ranked[0]["#1 Weeks"], 1)
        self.assertEqual(ranked[1]["Weeks Charted"], 2)
        self.assertEqual([r["Yearly Rank"] for r in ranked], [1, 2, 3, 4])
        self.assertEqual(ranked[0]["Date Entered"], "")

    def test_debut_uses_valid_printed_dates_not_coverage_start(self):
        rows = [entry("A", "Song", "1993-01-02", 1, entered="1992-11-14"),
                entry("A", "Song", "1993-01-09", 1, entered="1994-01-01")]
        self.assertEqual(annual_rows(1993, rows)[0]["Date Entered"], "1992-11-14")

    def test_replacement_backs_up_and_preserves_other_years(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "singles"
            target.mkdir()
            for year in (1939, 1940, 1953):
                (target / f"{year}.csv").write_bytes(f"original {year}".encode())
            replace_files(target, {1940: b"new 1940", 2025: b"new 2025"}, root / "backup")
            self.assertEqual((target / "1939.csv").read_bytes(), b"original 1939")
            self.assertEqual((target / "1953.csv").read_bytes(), b"original 1953")
            self.assertEqual((target / "1940.csv").read_bytes(), b"new 1940")
            self.assertEqual((root / "backup/1940.csv").read_bytes(), b"original 1940")
            self.assertEqual((target / "2025.csv").read_bytes(), b"new 2025")

    def test_failed_replacement_restores_originals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "singles"
            target.mkdir()
            (target / "1940.csv").write_bytes(b"original")
            original_replace = Path.replace
            def fail_second(path, destination):
                if path.name == "1941.replacement":
                    raise OSError("simulated replacement failure")
                return original_replace(path, destination)
            with patch.object(Path, "replace", fail_second), self.assertRaises(OSError):
                replace_files(target, {1940: b"new", 1941: b"new"}, root / "backup")
            self.assertEqual((target / "1940.csv").read_bytes(), b"original")
            self.assertFalse((target / "1941.csv").exists())

    def test_preserves_unambiguous_album_hints_for_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "1993.csv"
            path.write_text("Artist,Track,Album\nSpin Doctors,Two Princes,Pocket Full Of Kryptonite\n", encoding="utf-8")
            rows = annual_rows(1993, [entry("Spin Doctors", "Two Princes (Album Version)", "1993-01-02", 1)])
            self.assertEqual(preserve_album_metadata(rows, path), 1)
            self.assertEqual(rows[0]["Album"], "Pocket Full Of Kryptonite")


if __name__ == "__main__":
    unittest.main()
