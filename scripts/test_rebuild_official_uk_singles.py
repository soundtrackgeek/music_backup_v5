import csv
import tempfile
import unittest
from collections import Counter
from datetime import date
from pathlib import Path

import rebuild_official_uk_singles as rebuild
from rebuild_official_uk_singles import (
    CHART, FIELDS, ExistingWeeks, build_year, decode_rows, generate, movement, replace_files, rule_week,
)

HEADER = "book,chart,week_ending,position,last_week,weeks_on_chart,entry_status,movement,title,artist,number_one_marker,label,format,catalogue_number,release_type,duration,peak_position,entry_date,peak_date,bpi_award,source_page"


def book_row(year, week, position, title, artist="Artist", last_week="", status="", peak="1", weeks="1"):
    return dict(book=f"{year}_uk_singles", chart=CHART, week_ending=week, position=str(position),
                last_week=last_week, weeks_on_chart=weeks, entry_status=status, movement="", title=title,
                artist=artist, peak_position=peak)


def write_existing(target: Path, year: int, weeks: list[tuple[str, str]], title="Old"):
    rows = []
    for start, end in weeks:
        for rank in (1, 2):
            rows.append({"Year": year, "ISO Week": 1, "Chart Date": start, "Chart End Date": end, "Rank": rank,
                         "Last Week": "", "Movement": "New", "Peak": rank, "Artist": "A", "Title": f"{title} {rank}",
                         "Weeks on Chart": 1, "Source URL": f"https://example.test/{start}", "Item URL": ""})
    with (target / f"{year}.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def write_book(source: Path, year: int, rows: list[dict]):
    book = source / f"{year}_uk_singles"
    book.mkdir(parents=True)
    full = {name: "" for name in HEADER.split(",")}
    with (book / f"{year}_uk_singles_official_uk_singles_chart.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=HEADER.split(","))
        writer.writeheader()
        writer.writerows({**full, **row} for row in rows)


class MovementTests(unittest.TestCase):
    def test_uses_the_importers_existing_vocabulary(self):
        self.assertEqual(movement(5, "", "NEW"), ("New", "New"))
        self.assertEqual(movement(5, "", "RE-ENTRY"), ("RE", "Re-entry"))
        self.assertEqual(movement(2, "7", ""), ("7", "Up"))
        self.assertEqual(movement(9, "4", ""), ("4", "Down"))
        self.assertEqual(movement(3, "3", ""), ("3", "Same"))

    def test_a_non_new_row_without_a_last_week_is_an_error(self):
        with self.assertRaises(ValueError):
            movement(3, "", "")


class WeekIdentityTests(unittest.TestCase):
    def test_week_fallback_follows_the_printed_weekday(self):
        self.assertEqual(rule_week(date(1985, 1, 12)), (date(1985, 1, 6), date(1985, 1, 12)))  # Saturday ends
        self.assertEqual(rule_week(date(1958, 5, 9)), (date(1958, 5, 9), date(1958, 5, 15)))  # Friday starts
        self.assertEqual(rule_week(date(2018, 1, 4)), (date(2017, 12, 29), date(2018, 1, 4)))  # Thursday ends
        self.assertEqual(rule_week(date(1962, 1, 4)), (date(1962, 1, 4), date(1962, 1, 10)))  # Thursday starts

    def test_printed_dates_resolve_to_existing_week_identities(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder)
            write_existing(target, 1960, [("1960-01-01", "1960-01-07")])
            write_existing(target, 1985, [("1985-01-06", "1985-01-12"), ("1969-08-03", "1969-08-09")])
            existing = ExistingWeeks(target)
            self.assertEqual(rebuild.resolve_week("1960-01-01", set(), existing, {}), ("1960-01-01", "1960-01-07", "existing"))
            self.assertEqual(rebuild.resolve_week("1985-01-12", set(), existing, {}), ("1985-01-06", "1985-01-12", "existing"))
            # A mid-week print (the 1969 transition) lands in the week that contains it.
            self.assertEqual(rebuild.resolve_week("1969-08-06", set(), existing, {}), ("1969-08-03", "1969-08-09", "existing-containing"))
            self.assertEqual(rebuild.resolve_week("1986-03-01", set(), existing, {})[2], "rule")


class BuildYearTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.target = self.root / "target"
        self.source = self.root / "source"
        self.target.mkdir()
        write_existing(self.target, 1985, [("1985-01-06", "1985-01-12"), ("1985-01-13", "1985-01-19")])
        write_existing(self.target, 2023, [("2023-01-06", "2023-01-12")], title="Kept")
        self.addCleanup(self.folder.cleanup)

    def test_rows_use_printed_text_and_the_existing_week_year_and_iso_week(self):
        rows = [book_row(1985, "1985-01-12", 1, "Everything She Wants (Remix) / Last Christmas", "Wham!", status="NEW"),
                book_row(1985, "1985-01-12", 2, "Second", last_week="1", peak="1", weeks="4"),
                book_row(1985, "1985-01-19", 1, "Second", last_week="2", peak="1", weeks="5")]
        built, methods = build_year(1985, rows, ExistingWeeks(self.target), {}, 2022)
        self.assertEqual(methods, Counter({"existing": 2}))
        first = built[0]
        self.assertEqual((first["Year"], first["ISO Week"], first["Chart Date"], first["Chart End Date"]),
                         (1985, 1, "1985-01-06", "1985-01-12"))
        self.assertEqual(first["Title"], "Everything She Wants (Remix) / Last Christmas")
        self.assertEqual((first["Last Week"], first["Movement"]), ("New", "New"))
        self.assertEqual(first["Source URL"], "https://example.test/1985-01-06")
        self.assertEqual([(r["Rank"], r["Movement"]) for r in built[1:]], [(2, "Down"), (1, "Up")])

    def test_weeks_that_start_after_the_cutoff_year_are_left_for_the_kept_file(self):
        rows = [book_row(2023, "2023-01-12", 1, "Kept", status="NEW")]
        built, methods = build_year(2023, rows, ExistingWeeks(self.target), {}, 2022)
        self.assertEqual((built, sum(methods.values())), ([], 0))

    def test_two_book_weeks_cannot_claim_one_existing_week(self):
        existing = ExistingWeeks(self.target)
        claimed = {}
        build_year(1985, [book_row(1985, "1985-01-12", 1, "A", status="NEW")], existing, claimed, 2022)
        with self.assertRaises(ValueError):
            build_year(1985, [book_row(1985, "1985-01-06", 1, "B", status="NEW")], existing, claimed, 2022)

    def test_generate_and_replace_keep_later_years_byte_identical(self):
        write_book(self.source, 1985, [book_row(1985, "1985-01-12", 1, "New Title", status="NEW"),
                                       book_row(1985, "1985-01-19", 1, "New Title", last_week="1")])
        write_book(self.source, 1986, [book_row(1986, "1986-01-18", 1, "Next", status="NEW")])
        rebuild_first = rebuild.FIRST_YEAR
        rebuild.FIRST_YEAR = 1985
        self.addCleanup(setattr, rebuild, "FIRST_YEAR", rebuild_first)
        generated, report, dropped = generate(self.source, self.target, 1985)
        self.assertEqual(sorted(generated), [1985])
        self.assertEqual([r["Title"] for r in decode_rows(generated[1985])], ["New Title", "New Title"])
        self.assertEqual(dropped, [])
        kept_before = (self.target / "2023.csv").read_bytes()
        replace_files(self.target, generated, self.root / "backup")
        self.assertEqual((self.target / "2023.csv").read_bytes(), kept_before)
        self.assertEqual((self.target / "1985.csv").read_bytes(), generated[1985])
        self.assertTrue((self.root / "backup" / "1985.csv").is_file())
        self.assertTrue(generated[1985].startswith(b"\xef\xbb\xbfYear,ISO Week,"))
        self.assertIn(b"\r\n", generated[1985])


if __name__ == "__main__":
    unittest.main()
