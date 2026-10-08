"""Prepare disposable online SQLite backups and a read-only scale corpus.

No analysis is synthesized into either database. The Rust scale example creates
its own explicitly synthetic in-memory vectors separately.
"""
import argparse
import json
from pathlib import Path
import sqlite3

PROFILE = "bliss-0.13.0-symphonia-0.6.1-v2-full-mp3"


def read(path):
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)


def backup(source, target):
    if target.exists():
        raise ValueError(f"Refusing to overwrite {target}")
    with read(source) as src, sqlite3.connect(target) as dest:
        src.backup(dest, pages=4096)


def signature(directory, filename, size, modified):
    try:
        stat = (Path(directory) / filename).stat()
        return stat.st_size == size and str(stat.st_mtime_ns) == modified
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output in (args.catalog.resolve().parent, args.analysis.resolve().parent):
        raise ValueError("Choose a separate disposable benchmark directory")
    output.mkdir(parents=True, exist_ok=True)
    backup(args.catalog, output / "music-library.sqlite3")
    backup(args.analysis, output / "music-analysis.sqlite3")
    with read(output / "music-analysis.sqlite3") as cache:
        weights = json.loads(cache.execute("SELECT weights FROM sonic_profiles WHERE profile=?", (PROFILE,)).fetchone()[0])
        features = [json.loads(row[0]) for row in cache.execute("SELECT features FROM sonic_audio WHERE profile=? ORDER BY audio_hash", (PROFILE,))]
    (output / "corpus.json").write_text(json.dumps({"weights": weights, "features": features}), encoding="utf-8")
    with read(output / "music-library.sqlite3") as catalog:
        catalog.execute("ATTACH DATABASE ? AS sonic", (str(output / "music-analysis.sqlite3"),))
        rows = catalog.execute("""SELECT s.track_key,t.album_id,s.directory,s.filename,s.size,s.modified
            FROM sonic.sonic_tracks s CROSS JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename
            WHERE s.profile=? AND COALESCE(t.love,'')!='B' ORDER BY s.analyzed_at DESC LIMIT 1000""", (PROFILE,))
        fresh = [row for row in rows if signature(*row[2:])]
        stops = list(dict.fromkeys(row[0] for row in fresh))[:5]
        if len(stops) != 5:
            raise ValueError("Need five distinct fresh analyzed tracks")
        seed = None
        for album in dict.fromkeys(row[1] for row in fresh):
            rows = list(catalog.execute("""SELECT t.file_path,t.filename,s.size,s.modified,COALESCE(t.love,'')
                FROM tracks t LEFT JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename AND s.profile=?
                WHERE t.album_id=? AND lower(t.filename) LIKE '%.mp3'""", (PROFILE, album)))
            usable = sum(row[2] is not None and row[4] != "B" and signature(*row[:4]) for row in rows)
            if usable >= min(3, len(rows)) and usable * 2 >= len(rows):
                seed = album
                break
        if seed is None:
            raise ValueError("Need a fresh analyzed album with at least 50 percent coverage")
        tracks = catalog.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
        analyzed = catalog.execute("SELECT COUNT(*) FROM sonic.sonic_tracks WHERE profile=?", (PROFILE,)).fetchone()[0]
    (output / "seeds.json").write_text(json.dumps({"stops": stops, "album": seed}), encoding="utf-8")
    print(f"Disposable snapshot: {tracks:,} catalog tracks, {analyzed:,} analyzed paths, {len(features):,} audio vectors")


if __name__ == "__main__":
    main()
