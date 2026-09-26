"""Rebuild annual US song rankings from the validated Published Charts archive.

Run without --apply to preview; --apply backs up the old CSVs before replacement.
The archive-derived ordering is not Billboard's official year-end chart.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import shutil
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
YEARS = tuple(year for year in range(1940, 2026) if year != 1953)
BEST = "Billboard Best Sellers In Stores"
TOP = "Top 100"
HOT = "Billboard Hot 100"
FIELDS = ["Year", "Yearly Rank", "Source", "Artist", "Featured", "Album", "Track",
          "Date Entered", "#1 Weeks", "Weeks Charted", "Peak", "First In Year", "Last In Year"]


def chart_for_week(week: str) -> str:
    if week >= "1958-08-04":
        return HOT
    if week >= "1955-11-12":
        return TOP
    return BEST


def ascii_nocase(value: str) -> str:
    # Match SQLite COLLATE NOCASE, including the case-sensitive tie breaker.
    return value.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"))


def annual_rows(year: int, rows: list[dict[str, str]]) -> list[dict]:
    songs = defaultdict(list)
    for row in rows:
        week = row["week_ending"]
        if row["chart"] != chart_for_week(week):
            continue
        if date.fromisoformat(week).year != year:
            raise ValueError(f"Unexpected week {week} in {year}")
        if not row["artist"].strip() or not row["title"].strip() or int(row["position"]) < 1:
            raise ValueError(f"Invalid song row in {year}: {row}")
        songs[row["artist"], row["title"]].append(row)
    result = []
    for (artist, title), appearances in songs.items():
        weeks = {r["week_ending"] for r in appearances}
        # Only a printed, plausible entry date is a debut. Never invent it from
        # the first available archive week (especially for carryovers).
        entries = []
        for row in appearances:
            try:
                entered = date.fromisoformat(row["entry_date"])
                if entered <= date.fromisoformat(row["week_ending"]) and entered.year >= year - 1:
                    entries.append(entered.isoformat())
            except ValueError:
                pass
        result.append({
            "Year": year, "Yearly Rank": 0,
            "Source": "Published Charts annual calculation: " + " / ".join(sorted({r["chart"] for r in appearances})),
            "Artist": artist, "Featured": "", "Album": "", "Track": title,
            "Date Entered": min(entries, default=""),
            "#1 Weeks": len({r["week_ending"] for r in appearances if int(r["position"]) == 1}),
            "Weeks Charted": len(weeks), "Peak": min(int(r["position"]) for r in appearances),
            "First In Year": min(weeks), "Last In Year": max(weeks),
        })
    result.sort(key=lambda r: (-r["#1 Weeks"], -r["Weeks Charted"], r["Peak"],
                              ascii_nocase(r["Artist"]), r["Artist"], ascii_nocase(r["Track"]), r["Track"]))
    for rank, row in enumerate(result, 1):
        row["Yearly Rank"] = rank
    if not result:
        raise ValueError(f"No selected chart rows in {year}")
    return result


def read_book(source: Path, year: int) -> list[dict[str, str]]:
    book = f"{year}_us_singles"
    path = source / book / f"{book}_all_charts.csv"
    if path.is_file():
        stream = path.open(encoding="utf-8-sig", newline="")
    else:
        stream = gzip.open(path.with_suffix(".csv.gz"), "rt", encoding="utf-8-sig", newline="")
    with stream:
        rows = list(csv.DictReader(stream))
    with (source / "chart_inventory.csv").open(encoding="utf-8-sig", newline="") as stream:
        inventory = [r for r in csv.DictReader(stream) if r["book"] == book]
    actual = defaultdict(list)
    for row in rows:
        if row["book"] != book:
            raise ValueError(f"Wrong book identity in {path}")
        actual[row["chart"]].append(row)
    if set(actual) != {r["chart"] for r in inventory}:
        raise ValueError(f"Chart inventory mismatch for {book}")
    for expected in inventory:
        found = actual[expected["chart"]]
        weeks = {r["week_ending"] for r in found}
        if (len(found), len(weeks), min(weeks), max(weeks)) != (
            int(expected["rows"]), int(expected["weekly_charts"]), expected["first_week"], expected["last_week"]
        ):
            raise ValueError(f"Coverage mismatch for {book}: {expected['chart']}")
    selected_weeks = {r["week_ending"] for r in rows if r["chart"] == chart_for_week(r["week_ending"])}
    expected_min = {1940: 23, 1961: 51}.get(year, 52)
    if len(selected_weeks) < expected_min:
        raise ValueError(f"Incomplete selected coverage in {year}: {len(selected_weeks)} weeks")
    return rows


def metadata_key(artist: str, title: str) -> tuple[str, str]:
    def fold(value):
        value = value.lower().replace("&", " and ")
        for old, new in {"æ": "ae", "œ": "oe", "ø": "o", "ð": "d", "þ": "th", "ł": "l", "ß": "ss"}.items():
            value = value.replace(old, new)
        value = "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))
        return " ".join("".join(c if c.isalnum() else " " for c in value).split())
    artist, title = fold(artist), fold(title)
    if artist == "jade usa":
        artist = "jade"
    title = re.sub(r" (album version|lp version|album walk|lp)$", "", title)
    if title == "a whole new world aladdin s theme":
        title = "a whole new world"
    return artist, title


def preserve_album_metadata(rows: list[dict], original: Path) -> int:
    """Keep unambiguous legacy album hints used by the canonical-track selector."""
    if not original.is_file():
        return 0
    albums = defaultdict(set)
    with original.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            if row.get("Album", "").strip():
                albums[metadata_key(row["Artist"], row["Track"])].add(row["Album"])
    kept = 0
    for row in rows:
        candidates = albums[metadata_key(row["Artist"], row["Track"])]
        if len(candidates) == 1:
            row["Album"] = next(iter(candidates))
            kept += 1
    return kept


def encode_rows(rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8")


def replace_files(target: Path, generated: dict[int, bytes], backup: Path) -> None:
    target = target.resolve()
    if not target.is_dir():
        raise ValueError(f"Existing singles directory required: {target}")
    backup.mkdir(parents=True, exist_ok=False)
    # Preserve every existing year, including years deliberately not replaced.
    originals = {p.name: p.read_bytes() for p in target.glob("*.csv")}
    for name, data in originals.items():
        (backup / name).write_bytes(data)
        if (backup / name).read_bytes() != data:
            raise IOError(f"Backup verification failed: {name}")
    touched = []
    try:
        for year, data in generated.items():
            path = target / f"{year}.csv"
            temporary = backup / f"{year}.replacement"
            temporary.write_bytes(data)
            touched.append(path)
            temporary.replace(path)
        for name, data in originals.items():
            if name not in {f"{y}.csv" for y in generated} and (target / name).read_bytes() != data:
                raise IOError(f"Preserved year changed: {name}")
        for year, data in generated.items():
            if (target / f"{year}.csv").read_bytes() != data:
                raise IOError(f"Replacement verification failed: {year}")
    except BaseException:
        for path in touched:
            if path.name in originals:
                shutil.copyfile(backup / path.name, path)
            else:
                path.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "Charts")
    parser.add_argument("--target", type=Path, default=ROOT / "CSV_SINGLES")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    generated, report = {}, {}
    for year in YEARS:
        book_rows = read_book(args.source, year)
        rows = annual_rows(year, book_rows)
        kept = preserve_album_metadata(rows, args.target / f"{year}.csv")
        generated[year] = encode_rows(rows)
        report[str(year)] = {"songs": len(rows), "album_hints_preserved": kept,
                             "weeks": len({r["week_ending"] for r in book_rows if r["chart"] == chart_for_week(r["week_ending"])}),
                             "sha256": hashlib.sha256(generated[year]).hexdigest(),
                             "first_week": min(r["First In Year"] for r in rows),
                             "last_week": max(r["Last In Year"] for r in rows)}
    if args.apply:
        backup = ROOT / "chart-ranking-backups" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        replace_files(args.target, generated, backup)
        (backup / "replacement-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Replaced {len(generated)} years; verified originals saved in {backup}")
    else:
        print(json.dumps(report, indent=2))
    print(f"{sum(r['songs'] for r in report.values()):,} ranked songs across {len(report)} replaced years; pre-1940 and 1953 preserved.")


if __name__ == "__main__":
    main()
