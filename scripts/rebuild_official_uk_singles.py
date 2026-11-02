"""Replace the Official UK singles CSVs (CSV_SINGLES_UK) with the chart books.

The books' "Official UK Singles Chart" series is more complete than the
officialcharts.com scrape it replaces: the top 200 is printed from 1994 to 2017
and every week carries full printed titles and credits. Years up to --through
(default 2022) are regenerated from `Charts/<year>_uk_singles`; later years are
left exactly as they are.

Week identity is preserved. Each book week is matched to the existing
`Chart Date`/`Chart End Date` pair (the books print either the first or the last
day of the week, depending on the era), so ISO week keys and first-appearance
dates keep their meaning.  Run without --apply to preview; --apply saves a
verified copy of the whole folder in chart-ranking-backups/ before replacing.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHART = "Official UK Singles Chart"
FIRST_YEAR = 1952
FIELDS = [
    "Year", "ISO Week", "Chart Date", "Chart End Date", "Rank", "Last Week",
    "Movement", "Peak", "Artist", "Title", "Weeks on Chart", "Source URL", "Item URL",
]


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def title_key(value: str) -> str:
    value = re.sub(r"\(.*?\)", "", value.lower().split("/")[0])
    return re.sub(r"[^a-z0-9]", "", value)[:12]


def read_book(source: Path, year: int) -> list[dict[str, str]]:
    book = f"{year}_uk_singles"
    path = source / book / f"{book}_official_uk_singles_chart.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError(f"No Official UK Singles Chart rows in {path}")
    for row in rows:
        if row["chart"] != CHART or row["book"] != book:
            raise ValueError(f"Unexpected chart identity in {path}")
        if not row["title"].strip() or not row["artist"].strip() or int(row["position"]) < 1:
            raise ValueError(f"Incomplete row in {path}: {row['week_ending']} #{row['position']}")
    return rows


class ExistingWeeks:
    """The week identities and source links of the CSVs being replaced."""

    def __init__(self, target: Path) -> None:
        self.by_start: dict[str, list[tuple[str, str]]] = defaultdict(list)
        self.by_end: dict[str, list[tuple[str, str]]] = defaultdict(list)
        self.url: dict[tuple[str, str], str] = {}
        self.top: dict[tuple[str, str], set[str]] = defaultdict(set)
        for path in sorted(target.glob("*.csv")):
            with path.open(encoding="utf-8-sig", newline="") as stream:
                for row in csv.DictReader(stream):
                    week = (row["Chart Date"], row["Chart End Date"])
                    if week not in self.url:
                        self.by_start[week[0]].append(week)
                        self.by_end[week[1]].append(week)
                        self.url[week] = row["Source URL"]
                    if int(row["Rank"]) <= 10:
                        self.top[week].add(title_key(row["Title"]))

    def weeks(self) -> set[tuple[str, str]]:
        return set(self.url)

    def containing(self, printed: str) -> list[tuple[str, str]]:
        """Existing weeks whose first and last day enclose a mid-week printed date."""
        return [week for week in self.url if week[0] <= printed <= week[1]]


def rule_week(day: date) -> tuple[date, date]:
    """Fallback when no existing week owns the printed date."""
    if day.weekday() == 5 or (day.year >= 2015 and day.weekday() == 3):
        return day - timedelta(days=6), day
    return day, day + timedelta(days=6)


def resolve_week(printed: str, titles: set[str], existing: ExistingWeeks,
                 claimed: dict[tuple[str, str], str]) -> tuple[str, str, str]:
    candidates = existing.by_start.get(printed, []) + existing.by_end.get(printed, [])
    candidates = list(dict.fromkeys(candidates))
    if len(candidates) == 1:
        return (*candidates[0], "existing")
    if candidates:
        best = max(candidates, key=lambda week: len(titles & existing.top[week]))
        return (*best, "existing-by-content")
    # Mid-week printed dates occur while the chart changed its week definition (1969).
    enclosing = [week for week in existing.containing(printed) if week not in claimed]
    if enclosing:
        best = max(enclosing, key=lambda week: len(titles & existing.top[week]))
        return (*best, "existing-containing")
    start, end = rule_week(parse_date(printed))
    return start.isoformat(), end.isoformat(), "rule"


def movement(rank: int, last_week: str, status: str) -> tuple[str, str]:
    """(Last Week, Movement) in the vocabulary the importer already stores."""
    if status == "NEW":
        return "New", "New"
    if status == "RE-ENTRY":
        return "RE", "Re-entry"
    if not last_week.isdigit() or int(last_week) == 0:
        raise ValueError(f"Cannot derive movement for rank {rank} with last week {last_week!r}")
    previous = int(last_week)
    return last_week, "Up" if previous > rank else "Down" if previous < rank else "Same"


def build_year(year: int, book_rows: list[dict[str, str]], existing: ExistingWeeks,
               claimed: dict[tuple[str, str], str], through: int) -> tuple[list[dict[str, object]], Counter]:
    by_week: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in book_rows:
        by_week[row["week_ending"]].append(row)
    methods: Counter = Counter()
    rows: list[dict[str, object]] = []
    for printed in sorted(by_week):
        week_rows = by_week[printed]
        titles = {title_key(r["title"]) for r in week_rows if int(r["position"]) <= 10}
        start, end, method = resolve_week(printed, titles, existing, claimed)
        chart_day = parse_date(start)
        if chart_day.year > through:
            continue  # belongs to a later year file, which is kept as it is
        methods[method] += 1
        if (start, end) in claimed:
            raise ValueError(f"Book weeks {claimed[(start, end)]} and {printed} resolve to {start}")
        claimed[(start, end)] = printed
        for row in sorted(week_rows, key=lambda r: int(r["position"])):
            rank = int(row["position"])
            last_week, move = movement(rank, row["last_week"], row["entry_status"])
            rows.append({
                "Year": chart_day.year, "ISO Week": chart_day.isocalendar()[1],
                "Chart Date": start, "Chart End Date": end, "Rank": rank,
                "Last Week": last_week, "Movement": move, "Peak": row["peak_position"],
                "Artist": row["artist"].strip(), "Title": row["title"].strip(),
                "Weeks on Chart": row["weeks_on_chart"],
                "Source URL": existing.url.get((start, end), ""), "Item URL": "",
            })
    return rows, methods


def encode(rows: list[dict[str, object]]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + stream.getvalue().encode("utf-8")


def generate(source: Path, target: Path, through: int):
    existing = ExistingWeeks(target)
    claimed: dict[tuple[str, str], str] = {}
    generated: dict[int, bytes] = {}
    report: dict[str, dict[str, object]] = {}
    # A book's last week can start in the previous year, so read one book further.
    for year in range(FIRST_YEAR, through + 2):
        rows, methods = build_year(year, read_book(source, year), existing, claimed, through)
        # Year files hold the weeks whose Chart Date falls in that year, as before.
        by_file: dict[int, list[dict[str, object]]] = defaultdict(list)
        for row in rows:
            by_file[int(row["Year"])].append(row)
        for file_year, file_rows in by_file.items():
            if file_year in generated:
                file_rows = decode_rows(generated[file_year]) + file_rows
            file_rows.sort(key=lambda r: (r["Chart Date"], int(r["Rank"])))
            generated[file_year] = encode(file_rows)
        report[str(year)] = {"rows": len(rows), "weeks": sum(methods.values()), "methods": dict(methods)}
    for file_year, data in generated.items():
        report.setdefault(str(file_year), {})["sha256"] = hashlib.sha256(data).hexdigest()
    dropped = sorted(week for week in existing.weeks() - set(claimed) if parse_date(week[0]).year <= through)
    return generated, report, dropped


def decode_rows(data: bytes) -> list[dict[str, object]]:
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"), newline="")))


def verify_against_existing(generated: dict[int, bytes], target: Path) -> dict[str, object]:
    """Compare against the files being replaced (same week, same rank, same song)."""
    old: dict[tuple[str, str], str] = {}
    for year in generated:
        path = target / f"{year}.csv"
        if path.is_file():
            with path.open(encoding="utf-8-sig", newline="") as stream:
                for row in csv.DictReader(stream):
                    old[(row["Chart Date"], row["Rank"])] = title_key(row["Title"])
    compared = same = 0
    for data in generated.values():
        for row in decode_rows(data):
            key = (row["Chart Date"], row["Rank"])
            if key in old:
                compared += 1
                same += old[key] == title_key(row["Title"])
    return {"ranks_compared": compared, "same_song": same,
            "same_song_percent": round(100 * same / compared, 2) if compared else 0.0}


def replace_files(target: Path, generated: dict[int, bytes], backup: Path) -> None:
    target = target.resolve()
    if not target.is_dir():
        raise ValueError(f"Existing singles directory required: {target}")
    backup.mkdir(parents=True, exist_ok=False)
    originals = {p.name: p.read_bytes() for p in target.glob("*.csv")}
    for name, data in originals.items():
        (backup / name).write_bytes(data)
        if (backup / name).read_bytes() != data:
            raise IOError(f"Backup verification failed: {name}")
    touched: list[Path] = []
    try:
        for year, data in generated.items():
            path = target / f"{year}.csv"
            temporary = backup / f"{year}.replacement"
            temporary.write_bytes(data)
            touched.append(path)
            shutil.copyfile(temporary, path)
        replaced = {f"{y}.csv" for y in generated}
        for name, data in originals.items():
            if name not in replaced and (target / name).read_bytes() != data:
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
    parser.add_argument("--target", type=Path, default=ROOT / "CSV_SINGLES_UK")
    parser.add_argument("--through", type=int, default=2022)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    generated, report, dropped = generate(args.source, args.target, args.through)
    comparison = verify_against_existing(generated, args.target)
    total = sum(len(decode_rows(data)) for data in generated.values())
    methods = Counter()
    for year, item in report.items():
        methods.update(item.get("methods", {}))
    print(f"{total:,} rows in {len(generated)} files ({min(generated)}-{max(generated)}); "
          f"weeks resolved via {dict(methods)}")
    print(f"Against the files being replaced: {comparison}")
    print(f"Existing weeks with no book counterpart (dropped): {len(dropped)} {dropped[:10]}")
    if args.apply:
        backup = ROOT / "chart-ranking-backups" / (datetime.now().strftime("%Y%m%d-%H%M%S-%f") + "-official-uk-singles")
        replace_files(args.target, generated, backup)
        (backup / "replacement-report.json").write_text(
            json.dumps({"report": report, "comparison": comparison, "dropped": dropped}, indent=2) + "\n",
            encoding="utf-8")
        print(f"Replaced {len(generated)} years; verified originals saved in {backup}")
    else:
        print("Preview only; add --apply to replace the files.")


if __name__ == "__main__":
    main()
