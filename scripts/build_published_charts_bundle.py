"""Build or verify the US and UK Published Charts resources shipped with the app."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Charts"
BUNDLE = ROOT / "src-tauri" / "resources" / "published-charts"
MANIFEST = BUNDLE / "manifest.json"
CHUNK = 1024 * 1024
REGION_SUFFIXES = ("_us_singles", "_uk_singles")
# Series that are not weekly singles charts: one-off or test series, and an albums
# chart printed inside a singles book. They would only add noise to song matching.
EXCLUDED_CHARTS = {
    "Digital Download Test Data",
    "NME First Breakers",
    "Record Retailer EP Breakers",
    "Record Mirror Albums Chart",
}


def digest_file(path: Path, compressed: bool = False) -> str:
    digest = hashlib.sha256()
    opener = gzip.open if compressed else open
    with opener(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inventory_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fieldnames = reader.fieldnames or []
        required = {"book", "chart", "rows"}
        if not required.issubset(fieldnames):
            raise ValueError(f"Inventory is missing {required.difference(fieldnames)}")
        rows = [
            row for row in reader
            if row["book"].endswith(REGION_SUFFIXES) and row["chart"] not in EXCLUDED_CHARTS
        ]
    for suffix in REGION_SUFFIXES:
        if not any(row["book"].endswith(suffix) for row in rows):
            raise ValueError(f"Inventory contains no {suffix[1:3].upper()} singles books")
    return fieldnames, rows


def filtered_book(book: str, source_csv: Path, source_report: Path, inventory: list[dict[str, str]]) -> tuple[bytes, str]:
    """UK books lose the excluded series; row counts are re-derived from the data itself."""
    wanted = {row["chart"]: row for row in inventory}
    out = io.StringIO(newline="")
    writer = None
    seen: dict[str, list] = defaultdict(lambda: [0, set()])
    with source_csv.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        writer = csv.DictWriter(out, fieldnames=reader.fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in reader:
            if row["book"] != book:
                raise ValueError(f"Wrong book identity in {source_csv}")
            if row["chart"] in EXCLUDED_CHARTS:
                continue
            if row["chart"] not in wanted:
                raise ValueError(f"{book}: chart {row['chart']} is absent from the inventory")
            if (not row["title"].strip() or not row["artist"].strip() or int(row["position"]) < 1):
                raise ValueError(f"{book}: invalid row {row['chart']} {row['week_ending']} #{row['position']}")
            stats = seen[row["chart"]]
            stats[0] += 1
            stats[1].add(row["week_ending"])
            writer.writerow(row)
    for chart, row in wanted.items():
        rows, weeks = seen[chart][0], seen[chart][1]
        if rows != int(row["rows"]) or len(weeks) != int(row["weekly_charts"]):
            raise ValueError(f"{book} / {chart}: inventory says {row['rows']} rows in "
                             f"{row['weekly_charts']} weeks, data has {rows} in {len(weeks)}")
    total = sum(item[0] for item in seen.values())
    lines = source_report.read_text(encoding="utf-8-sig").splitlines()
    summary = re.match(rf"{re.escape(book)}: (\d+) rows, 0 problems, (\d+) notes", lines[0])
    if not summary:
        raise ValueError(f"Validation report is not clean: {lines[0]}")
    lines[0] = f"{book}: {total} rows, 0 problems, {summary.group(2)} notes"
    return out.getvalue().encode("utf-8"), "\n".join(lines) + "\n"


def build() -> None:
    fields, rows = inventory_rows(SOURCE / "chart_inventory.csv")
    BUNDLE.mkdir(parents=True, exist_ok=True)
    inventory = BUNDLE / "chart_inventory.csv"
    with inventory.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    by_book: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        by_book[row["book"]].append(row)
    books = []
    for book in sorted(by_book):
        source_dir = SOURCE / book
        source_csv = source_dir / f"{book}_all_charts.csv"
        source_report = source_dir / f"{book}_validation.txt"
        expected_rows = sum(int(row["rows"]) for row in by_book[book])
        if not source_csv.is_file() or not source_report.is_file():
            raise FileNotFoundError(f"Missing chart source or validation report for {book}")
        target_dir = BUNDLE / book
        target_dir.mkdir(exist_ok=True)
        if book.endswith("_uk_singles"):
            payload, report_text = filtered_book(book, source_csv, source_report, by_book[book])
        else:
            first_line = source_report.read_text(encoding="utf-8-sig").splitlines()[0]
            if not first_line.startswith(f"{book}: {expected_rows} rows, 0 problems,"):
                raise ValueError(f"Validation report does not match inventory: {first_line}")
            payload, report_text = source_csv.read_bytes(), source_report.read_text(encoding="utf-8-sig")
        with (target_dir / source_report.name).open("w", encoding="utf-8", newline="\n") as target:
            target.write(report_text)
        compressed = target_dir / f"{book}_all_charts.csv.gz"
        temporary = compressed.with_suffix(".gz.tmp")
        try:
            with temporary.open("wb") as raw:
                with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as target:
                    target.write(payload)
            temporary.replace(compressed)
        finally:
            temporary.unlink(missing_ok=True)
        books.append({
            "book": book,
            "rows": expected_rows,
            "charts": len(by_book[book]),
            "csv_sha256": hashlib.sha256(payload).hexdigest(),
            "gzip_sha256": digest_file(compressed),
            "gzip_bytes": compressed.stat().st_size,
            "validation_sha256": digest_file(target_dir / source_report.name),
        })
        print(f"{book}: {compressed.stat().st_size:,} compressed bytes")

    manifest = {
        "schema": 1,
        "books": books,
        "inventory_sha256": digest_file(inventory),
        "total_rows": sum(book["rows"] for book in books),
    }
    with MANIFEST.open("w", encoding="utf-8", newline="\n") as target:
        target.write(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"Bundled {len(books)} US and UK books and {manifest['total_rows']:,} rows")


def check() -> None:
    tauri_config = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))
    if "resources/published-charts/" not in tauri_config["bundle"].get("resources", []):
        raise ValueError("Tauri is not configured to package the Published Charts bundle")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest["schema"] != 1:
        raise ValueError("Unsupported Published Charts bundle schema")
    inventory = BUNDLE / "chart_inventory.csv"
    if digest_file(inventory) != manifest["inventory_sha256"]:
        raise ValueError("Bundled chart inventory checksum mismatch")
    _, rows = inventory_rows(inventory)
    expected = defaultdict(int)
    for row in rows:
        expected[row["book"]] += int(row["rows"])
    books = manifest["books"]
    if set(expected) != {book["book"] for book in books}:
        raise ValueError("Bundle books do not match chart inventory")
    for book in books:
        name = book["book"]
        if expected[name] != book["rows"]:
            raise ValueError(f"Bundle row count differs from inventory: {name}")
        folder = BUNDLE / name
        compressed = folder / f"{name}_all_charts.csv.gz"
        validation = folder / f"{name}_validation.txt"
        if (compressed.stat().st_size != book["gzip_bytes"]
                or digest_file(compressed) != book["gzip_sha256"]
                or digest_file(compressed, compressed=True) != book["csv_sha256"]
                or digest_file(validation) != book["validation_sha256"]):
            raise ValueError(f"Bundled chart checksum mismatch: {name}")
    if sum(book["rows"] for book in books) != manifest["total_rows"]:
        raise ValueError("Bundled total row count mismatch")
    print(f"Verified {len(books)} US and UK books and {manifest['total_rows']:,} rows")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed bundle without local Charts sources")
    args = parser.parse_args()
    check() if args.check else build()
