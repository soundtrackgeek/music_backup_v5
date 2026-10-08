"""Create a disposable synthetic million-track catalog; never modifies a library.

The marker is required by the native materialization helper. Feature vectors
are resampled from the explicit corpus, and fixture MP3s contain one byte.
"""
import argparse
import json
from pathlib import Path
import sqlite3

PROFILE = "bliss-0.13.0-symphonia-0.6.1-v2-full-mp3"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--count", type=int, default=1_100_000)
    args = parser.parse_args()
    if not 10_000 <= args.count <= 1_500_000:
        raise ValueError("Choose 10000 through 1500000 synthetic tracks")
    folder = args.output.resolve()
    folder.mkdir(parents=True, exist_ok=False)
    audio = folder / "fixture-audio"
    audio.mkdir()
    corpus = json.loads(args.corpus.read_text(encoding="utf-8"))
    vectors = corpus["features"]
    # Precompute 16 distinct templates per selected corpus row. This keeps the
    # Python generator fast while preserving coherent album clusters and ties.
    templates = [json.dumps([v + (slot - 7.5) * 0.0005 for v in vectors[(base * 7919) % len(vectors)]], separators=(",", ":")) for base in range(8192) for slot in range(16)]
    with sqlite3.connect(folder / "music-library.sqlite3") as cat, sqlite3.connect(folder / "music-analysis.sqlite3") as cache:
        cat.executescript("""PRAGMA journal_mode=OFF;
            CREATE TABLE tracks(id INTEGER PRIMARY KEY,title TEXT,album_artist_display TEXT,album TEXT,release_year INTEGER,normalized_rating INTEGER,love TEXT,time_seconds INTEGER,canonical_genre TEXT,album_id TEXT,file_path TEXT,filename TEXT,import_run_id INTEGER,display_artist TEXT,year INTEGER,publisher TEXT);
            CREATE INDEX paths ON tracks(file_path,filename);CREATE INDEX albums ON tracks(album_id);""")
        cache.executescript("""PRAGMA journal_mode=OFF; PRAGMA user_version=1;
            CREATE TABLE sonic_profiles(profile TEXT PRIMARY KEY,weights TEXT);
            CREATE TABLE sonic_audio(audio_hash TEXT,profile TEXT,features TEXT,PRIMARY KEY(audio_hash,profile));
            CREATE TABLE sonic_tracks(track_key TEXT PRIMARY KEY,directory TEXT,filename TEXT,audio_hash TEXT,profile TEXT,size INTEGER,modified TEXT,analyzed_at TEXT);
            CREATE INDEX paths ON sonic_tracks(directory,filename);""")
        cache.execute("INSERT INTO sonic_profiles VALUES(?,?)", (PROFILE, json.dumps(corpus["weights"])))
        stops = []
        for offset in range(0, args.count, 4096):
            tracks, checkpoints, features = [], [], []
            for i in range(offset, min(offset + 4096, args.count)):
                directory = str(audio / f"part-{i // 4096:04}")
                filename = f"{i:07}.mp3"
                key = (directory.replace("/", "\\").rstrip("\\") + "\\" + filename).lower()
                album = f"synthetic-album-{i // 16:06}"
                artist = f"Synthetic artist {i // 64}"
                genre = "Pop" if i // 16 % 3 else "Soundtrack"
                tracks.append((i+1, filename, artist, album, 2000, 80 if i%5 else 20, "", 180, genre, album, directory, filename, 1, artist, 2000, "Synthetic"))
                checkpoints.append((key, directory, filename, filename, PROFILE, 0, "unmaterialized", "synthetic"))
                features.append((filename, PROFILE, templates[i % len(templates)]))
                if i in (16, 64, 256, 512, 1024):
                    stops.append(key)
            cat.executemany("INSERT INTO tracks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", tracks)
            cache.executemany("INSERT INTO sonic_tracks VALUES(?,?,?,?,?,?,?,?)", checkpoints)
            cache.executemany("INSERT INTO sonic_audio VALUES(?,?,?)", features)
        cat.commit()
        cache.commit()
    (folder / "seeds.json").write_text(json.dumps({"stops": stops, "album": "synthetic-album-000001"}), encoding="utf-8")
    (folder / "synthetic-fixture.json").write_text(json.dumps({"synthetic": True, "vectors": args.count, "corpusVectors": len(vectors), "audioDirectory": str(audio), "fixtureAudioBytes": 1}), encoding="utf-8")
    print(f"Created {args.count:,} explicitly synthetic tracks and checkpoint vectors; native helper must materialize the benchmark shortlists")


if __name__ == "__main__":
    main()
