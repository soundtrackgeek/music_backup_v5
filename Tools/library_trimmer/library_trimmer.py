#!/usr/bin/env python3
"""Review and quarantine non-album releases from the Music Library database."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


TOOL_VERSION = "1.0.0"
MANIFEST_SCHEMA_VERSION = 1
JOURNAL_SCHEMA_VERSION = 1
DISCOGS_API_ROOT = "https://api.discogs.com"
DISCOGS_WEB_ROOT = "https://www.discogs.com"
MUSICBRAINZ_WEB_ROOT = "https://musicbrainz.org"
USER_AGENT = (
    f"MusicBackupV5LibraryTrimmer/{TOOL_VERSION} "
    "(personal library maintenance tool)"
)
DEFAULT_SCAN_LIMIT = 500
SUSPICIOUS_RELEASE_GROUP_THRESHOLD = 150
MOVE_CONFIRMATION = "MOVE_APPROVED"
UNDO_CONFIRMATION = "RESTORE_FILES"

DISALLOWED_DESCRIPTORS = {
    "bootleg",
    "compilation",
    "ep",
    "live",
    "maxi single",
    "mixtape",
    "partially unofficial",
    "partially unofficial release",
    "single",
    "unofficial",
    "unofficial release",
}
SCORE_GENRE_GROUP = {
    "action",
    "animation",
    "anime",
    "comedy",
    "documentary",
    "drama",
    "fantasy",
    "horror",
    "sci-fi",
    "thriller",
    "tv",
    "video game",
    "western",
}

DASH_TRANSLATION = str.maketrans(
    {character: "-" for character in "\u2010\u2011\u2012\u2013\u2014\u2212"}
)
WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}


class TrimmerError(RuntimeError):
    """Expected CLI error that is safe to show to the user."""


class CacheMiss(TrimmerError):
    """Raised when offline mode cannot satisfy an HTTP request."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def default_database_path() -> Path:
    appdata = os.environ.get("APPDATA")
    if appdata:
        return (
            Path(appdata)
            / "com.local.musiclibrary"
            / "music-library.sqlite3"
        )
    return Path.home() / ".local" / "share" / "com.local.musiclibrary" / "music-library.sqlite3"


def default_cache_dir() -> Path:
    local_appdata = os.environ.get("LOCALAPPDATA")
    base = Path(local_appdata) if local_appdata else Path.home() / ".cache"
    return base / "MusicLibraryTrimmer" / "discogs"


def normalize_space(value: str | None) -> str:
    return " ".join((value or "").strip().lower().split())


def normalize_artist_key(value: str | None) -> str:
    normalized = normalize_space((value or "").translate(DASH_TRANSLATION))
    return normalized or "unknown"


def musicbrainz_text_key(value: str | None) -> str:
    lower = (value or "").replace("&", " and ").lower()
    folded: list[str] = []
    replacements = {
        "æ": "ae",
        "œ": "oe",
        "ø": "o",
        "ð": "d",
        "þ": "th",
        "ł": "l",
        "ß": "ss",
    }
    for character in unicodedata.normalize("NFD", lower):
        if unicodedata.combining(character):
            continue
        folded.append(replacements.get(character, character))
    return " ".join(re.findall(r"[^\W_]+", "".join(folded), flags=re.UNICODE))


def normalize_descriptor(value: str | None) -> str:
    return musicbrainz_text_key(value)


def safe_file_segment(value: str | None, fallback: str) -> str:
    segment = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", (value or "").strip())
    segment = re.sub(r"\s+", " ", segment).strip(" .")
    if not segment:
        segment = fallback
    if segment.upper() in WINDOWS_RESERVED_NAMES:
        segment = f"_{segment}"
    return segment[:120].rstrip(" .") or fallback


def album_destination_segment(album: dict[str, Any]) -> str:
    title = safe_file_segment(album.get("title"), "Untitled")
    year = album.get("year") or album.get("releaseYear")
    year_suffix = f" ({year})" if year else ""
    identity = hashlib.sha256(str(album["albumId"]).encode("utf-8")).hexdigest()[:8]
    return safe_file_segment(f"{title}{year_suffix} [{identity}]", f"Album [{identity}]")


def parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def chunked(values: Sequence[str], size: int = 400) -> Iterator[Sequence[str]]:
    for offset in range(0, len(values), size):
        yield values[offset : offset + size]


def read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
    except FileNotFoundError as error:
        raise TrimmerError(f"File does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise TrimmerError(f"Invalid JSON in {path}: {error}") from error
    if not isinstance(value, dict):
        raise TrimmerError(f"Expected a JSON object in {path}")
    return value


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def backup_file(path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = path.with_name(f"{path.name}.{timestamp}.bak")
    counter = 1
    while destination.exists():
        destination = path.with_name(f"{path.name}.{timestamp}-{counter}.bak")
        counter += 1
    shutil.copy2(path, destination)
    return destination


@contextmanager
def open_sqlite_read_only(path: Path) -> Iterator[sqlite3.Connection]:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise TrimmerError(f"SQLite database does not exist: {resolved}")
    uri = f"file:{urllib.parse.quote(resolved.as_posix(), safe='/:')}?mode=ro"
    try:
        connection = sqlite3.connect(uri, uri=True, timeout=15)
    except sqlite3.Error as error:
        raise TrimmerError(f"Could not open SQLite database read-only: {resolved}") from error
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only = ON")
    connection.execute("PRAGMA busy_timeout = 15000")
    try:
        yield connection
    finally:
        connection.close()


def table_columns(connection: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row["name"])
        for row in connection.execute(f"PRAGMA table_info({table})")
    }


def validate_app_schema(connection: sqlite3.Connection) -> None:
    required = {
        "albums": {
            "id",
            "album",
            "album_artist_display",
            "year",
            "release_year",
            "total_tracks",
            "canonical_genre",
        },
        "tracks": {
            "album_id",
            "title",
            "disc_number",
            "track_number",
            "file_path",
            "filename",
        },
        "app_settings": {"musicbrainz_cache_path"},
        "musicbrainz_artist_links": {
            "local_artist_key",
            "mbid",
            "verification_state",
            "ignored",
        },
        "musicbrainz_release_decisions": {
            "local_artist_key",
            "release_mbid",
            "decision",
        },
        "musicbrainz_release_status_cache": {
            "artist_mbid",
            "release_mbid",
            "has_official_release",
        },
        "musicbrainz_artist_release_groups": {
            "artist_mbid",
            "release_mbid",
            "title",
            "type",
            "secondary_types",
            "status",
        },
    }
    for table, columns in required.items():
        actual = table_columns(connection, table)
        if not actual:
            raise TrimmerError(f"App database is missing the {table} table")
        missing = columns - actual
        if missing:
            names = ", ".join(sorted(missing))
            raise TrimmerError(f"App database is missing {table} columns: {names}")


def validate_musicbrainz_schema(connection: sqlite3.Connection) -> None:
    required = {
        "artist_cache": {"name", "mbid"},
        "release_groups": {
            "artist_mbid",
            "release_mbid",
            "title",
            "year",
            "type",
            "secondary_types",
            "status",
        },
    }
    for table, columns in required.items():
        actual = table_columns(connection, table)
        if not actual:
            raise TrimmerError(f"MusicBrainz cache is missing the {table} table")
        missing = columns - actual
        if missing:
            names = ", ".join(sorted(missing))
            raise TrimmerError(f"MusicBrainz cache is missing {table} columns: {names}")


def resolve_musicbrainz_cache_path(
    app_connection: sqlite3.Connection,
    explicit: Path | None,
) -> Path:
    if explicit:
        return explicit.expanduser().resolve()
    row = app_connection.execute(
        "SELECT musicbrainz_cache_path FROM app_settings WHERE id = 1"
    ).fetchone()
    if not row or not str(row[0] or "").strip():
        raise TrimmerError(
            "The app database does not contain a configured MusicBrainz cache path"
        )
    configured = Path(str(row[0]).strip()).expanduser()
    if configured.is_absolute():
        return configured.resolve()
    candidates = [Path.cwd() / configured, Path.cwd().parent / configured]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    return candidates[0].resolve()


def load_albums(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT
            id,
            album_artist_display,
            album,
            year,
            release_year,
            total_tracks,
            canonical_genre
        FROM albums
        WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(album, '')), '') IS NOT NULL
        ORDER BY LOWER(album_artist_display), COALESCE(year, release_year, 9999),
                 LOWER(album), id
        """
    )
    albums: list[dict[str, Any]] = []
    for row in rows:
        artist = str(row["album_artist_display"]).strip()
        title = str(row["album"]).strip()
        albums.append(
            {
                "albumId": str(row["id"]),
                "artist": artist,
                "artistKey": normalize_artist_key(artist),
                "artistTextKey": musicbrainz_text_key(artist),
                "title": title,
                "titleKey": musicbrainz_text_key(title),
                "year": parse_int(row["year"]),
                "releaseYear": parse_int(row["release_year"]),
                "trackCount": max(0, parse_int(row["total_tracks"]) or 0),
                "genre": str(row["canonical_genre"] or "").strip(),
                "genreKey": normalize_space(str(row["canonical_genre"] or "")),
            }
        )
    return albums


def path_is_within(path: Path, root: Path) -> bool:
    normalized_path = os.path.normcase(os.path.abspath(path))
    normalized_root = os.path.normcase(os.path.abspath(root))
    try:
        return os.path.commonpath([normalized_path, normalized_root]) == normalized_root
    except ValueError:
        return False


def scope_albums_to_library_root(
    connection: sqlite3.Connection,
    albums: list[dict[str, Any]],
    library_root: Path | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if library_root is None:
        return albums, {
            "libraryRoot": None,
            "fullLibraryAlbumCount": len(albums),
            "scopedLibraryAlbumCount": len(albums),
            "outsideRootAlbumCount": 0,
            "mixedLocationAlbumCount": 0,
            "albumsWithoutTrackPathsCount": 0,
        }
    root = library_root.expanduser().resolve()
    if not root.is_dir():
        raise TrimmerError(f"Library root is not an existing directory: {root}")

    states: dict[str, list[Any]] = {}
    for row in connection.execute(
        """
        SELECT album_id, file_path
        FROM tracks
        ORDER BY album_id
        """
    ):
        album_id = str(row["album_id"])
        state = states.setdefault(album_id, [True, False, 0])
        directory_text = str(row["file_path"] or "").strip()
        inside = bool(directory_text) and path_is_within(Path(directory_text), root)
        state[0] = bool(state[0]) and inside
        state[1] = bool(state[1]) or inside
        state[2] = int(state[2]) + 1

    scoped: list[dict[str, Any]] = []
    outside = 0
    mixed = 0
    without_paths = 0
    for album in albums:
        state = states.get(album["albumId"])
        if state is None or int(state[2]) == 0:
            without_paths += 1
        elif bool(state[0]):
            scoped.append(album)
        elif bool(state[1]):
            mixed += 1
        else:
            outside += 1
    return scoped, {
        "libraryRoot": str(root),
        "fullLibraryAlbumCount": len(albums),
        "scopedLibraryAlbumCount": len(scoped),
        "outsideRootAlbumCount": outside,
        "mixedLocationAlbumCount": mixed,
        "albumsWithoutTrackPathsCount": without_paths,
    }


def expand_genre_exclusions(values: Sequence[str]) -> set[str]:
    expanded: set[str] = set()
    for raw in values:
        normalized = normalize_space(raw)
        if not normalized:
            continue
        if normalized in {"score", "scores"}:
            expanded.update(SCORE_GENRE_GROUP)
        else:
            expanded.add(normalized)
    return expanded


def scope_albums_by_genre(
    albums: list[dict[str, Any]],
    requested_exclusions: Sequence[str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    expanded = expand_genre_exclusions(requested_exclusions)
    if not expanded:
        return albums, {
            "requestedExcludedGenres": [],
            "expandedExcludedGenres": [],
            "genreScopedAlbumCount": len(albums),
            "excludedGenreAlbumCount": 0,
            "excludedGenreAlbumCounts": {},
        }
    excluded_counts: dict[str, int] = defaultdict(int)
    scoped: list[dict[str, Any]] = []
    for album in albums:
        genre_key = album["genreKey"]
        if genre_key in expanded:
            excluded_counts[genre_key or "unknown"] += 1
        else:
            scoped.append(album)
    return scoped, {
        "requestedExcludedGenres": [
            normalize_space(value)
            for value in requested_exclusions
            if normalize_space(value)
        ],
        "expandedExcludedGenres": sorted(expanded),
        "genreScopedAlbumCount": len(scoped),
        "excludedGenreAlbumCount": len(albums) - len(scoped),
        "excludedGenreAlbumCounts": dict(sorted(excluded_counts.items())),
    }


def query_rows_for_mbids(
    connection: sqlite3.Connection,
    sql_template: str,
    mbids: Iterable[str],
) -> Iterator[sqlite3.Row]:
    sorted_mbids = sorted({mbid.lower() for mbid in mbids if mbid})
    for group in chunked(sorted_mbids):
        placeholders = ", ".join("?" for _ in group)
        sql = sql_template.format(placeholders=placeholders)
        yield from connection.execute(sql, list(group))


def is_pure_official_album(row: dict[str, Any] | sqlite3.Row) -> bool:
    return (
        normalize_space(str(row["status"] or "")) == "official"
        and normalize_space(str(row["type"] or "")) == "album"
        and not normalize_space(str(row["secondary_types"] or ""))
    )


def release_group_dict(row: sqlite3.Row, source: str) -> dict[str, Any]:
    secondary_text = str(row["secondary_types"] or "").strip()
    secondary_types = [
        value.strip()
        for value in re.split(r"[,;|]", secondary_text)
        if value.strip()
    ]
    return {
        "artistMbid": str(row["artist_mbid"]).lower(),
        "releaseGroupMbid": str(row["release_mbid"]),
        "title": str(row["title"]),
        "titleKey": musicbrainz_text_key(str(row["title"])),
        "year": parse_int(row["year"]),
        "type": str(row["type"] or ""),
        "secondaryTypes": secondary_types,
        "secondaryTypesRaw": secondary_text,
        "status": str(row["status"] or ""),
        "source": source,
    }


def load_musicbrainz_candidates(
    app_connection: sqlite3.Connection,
    musicbrainz_connection: sqlite3.Connection,
    albums: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    artists: dict[str, dict[str, str]] = {}
    artists_by_text_key: dict[str, set[str]] = defaultdict(set)
    for album in albums:
        artist_key = album["artistKey"]
        artists.setdefault(
            artist_key,
            {
                "display": album["artist"],
                "textKey": album["artistTextKey"],
            },
        )
        if album["artistTextKey"]:
            artists_by_text_key[album["artistTextKey"]].add(artist_key)

    ignored = {
        normalize_artist_key(str(row["local_artist_key"]))
        for row in app_connection.execute(
            "SELECT local_artist_key FROM musicbrainz_artist_links WHERE ignored <> 0"
        )
    }
    verified: dict[str, dict[str, str]] = {}
    for row in app_connection.execute(
        """
        SELECT local_artist_key, mbid, canonical_name
        FROM musicbrainz_artist_links
        WHERE verification_state = 'verified'
          AND ignored = 0
          AND NULLIF(TRIM(COALESCE(mbid, '')), '') IS NOT NULL
        """
    ):
        artist_key = normalize_artist_key(str(row["local_artist_key"]))
        verified[artist_key] = {
            "mbid": str(row["mbid"]).strip().lower(),
            "matchedName": str(row["canonical_name"] or "").strip()
            or artists.get(artist_key, {}).get("display", ""),
        }

    name_counts = {
        str(row["mbid"]).lower(): int(row["name_count"])
        for row in musicbrainz_connection.execute(
            """
            SELECT LOWER(mbid) AS mbid, COUNT(DISTINCT name) AS name_count
            FROM artist_cache
            WHERE NULLIF(TRIM(COALESCE(mbid, '')), '') IS NOT NULL
            GROUP BY LOWER(mbid)
            """
        )
    }
    release_counts = {
        str(row["mbid"]).lower(): int(row["release_count"])
        for row in musicbrainz_connection.execute(
            """
            SELECT LOWER(artist_mbid) AS mbid, COUNT(*) AS release_count
            FROM release_groups
            WHERE NULLIF(TRIM(COALESCE(artist_mbid, '')), '') IS NOT NULL
            GROUP BY LOWER(artist_mbid)
            """
        )
    }

    cache_matches: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in musicbrainz_connection.execute(
        """
        SELECT name, LOWER(mbid) AS mbid
        FROM artist_cache
        WHERE NULLIF(TRIM(COALESCE(name, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(mbid, '')), '') IS NOT NULL
        """
    ):
        name = str(row["name"]).strip()
        mbid = str(row["mbid"]).lower()
        local_name_key = normalize_artist_key(name)
        text_key = musicbrainz_text_key(name)
        matched_artist_keys: set[str] = set()
        if local_name_key in artists:
            matched_artist_keys.add(local_name_key)
        matched_artist_keys.update(artists_by_text_key.get(text_key, set()))
        for artist_key in matched_artist_keys:
            cache_matches[artist_key].append(
                {
                    "name": name,
                    "mbid": mbid,
                    "matchMethod": (
                        "cache-name"
                        if local_name_key == artist_key
                        else "normalized-cache-name"
                    ),
                    "cachedNameCount": name_counts.get(mbid, 1),
                    "releaseGroupCount": release_counts.get(mbid, 0),
                }
            )

    trusted: dict[str, dict[str, Any]] = {}
    for artist_key, artist in artists.items():
        if artist_key in ignored:
            continue
        verified_row = verified.get(artist_key)
        if verified_row:
            trusted[artist_key] = {
                "mbid": verified_row["mbid"],
                "matchedName": verified_row["matchedName"],
                "matchMethod": "verified-link",
            }
            continue
        matches = cache_matches.get(artist_key, [])
        matches.sort(
            key=lambda item: (
                0 if item["matchMethod"] == "cache-name" else 1,
                item["cachedNameCount"],
                -item["releaseGroupCount"],
                item["name"].lower(),
            )
        )
        if not matches:
            continue
        best = matches[0]
        if (
            len(matches) == 1
            and best["cachedNameCount"] <= 1
            and best["releaseGroupCount"] < SUSPICIOUS_RELEASE_GROUP_THRESHOLD
        ):
            trusted[artist_key] = {
                "mbid": best["mbid"],
                "matchedName": best["name"],
                "matchMethod": best["matchMethod"],
            }

    matched_mbids = {row["mbid"] for row in trusted.values()}
    cache_pure: dict[str, list[dict[str, Any]]] = defaultdict(list)
    pure_sql = """
        SELECT
            LOWER(artist_mbid) AS artist_mbid,
            release_mbid,
            title,
            year,
            type,
            secondary_types,
            status
        FROM release_groups
        WHERE LOWER(artist_mbid) IN ({placeholders})
          AND status = 'Official'
          AND type = 'Album'
          AND COALESCE(secondary_types, '') = ''
          AND NULLIF(TRIM(COALESCE(release_mbid, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL
    """
    for row in query_rows_for_mbids(
        musicbrainz_connection, pure_sql, matched_mbids
    ):
        release = release_group_dict(row, "cache")
        cache_pure[release["artistMbid"]].append(release)

    overlay_pure: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in app_connection.execute(
        """
        SELECT
            LOWER(artist_mbid) AS artist_mbid,
            release_mbid,
            title,
            year,
            type,
            secondary_types,
            status
        FROM musicbrainz_artist_release_groups
        WHERE status = 'Official'
          AND type = 'Album'
          AND COALESCE(secondary_types, '') = ''
          AND NULLIF(TRIM(COALESCE(release_mbid, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL
        """
    ):
        mbid = str(row["artist_mbid"]).lower()
        if mbid in matched_mbids:
            overlay_pure[mbid].append(release_group_dict(row, "refreshed"))

    decisions = {
        (
            normalize_artist_key(str(row["local_artist_key"])),
            str(row["release_mbid"]),
        ): str(row["decision"] or "").strip().lower()
        for row in app_connection.execute(
            """
            SELECT local_artist_key, release_mbid, decision
            FROM musicbrainz_release_decisions
            """
        )
    }
    official_status = {
        (str(row["artist_mbid"]).lower(), str(row["release_mbid"])): bool(
            row["has_official_release"]
        )
        for row in app_connection.execute(
            """
            SELECT artist_mbid, release_mbid, has_official_release
            FROM musicbrainz_release_status_cache
            """
        )
    }

    official_titles: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    release_source_by_artist: dict[str, str] = {}
    for artist_key, artist_match in trusted.items():
        mbid = artist_match["mbid"]
        rows = overlay_pure.get(mbid) or cache_pure.get(mbid, [])
        if not rows:
            continue
        for release in rows:
            decision = decisions.get(
                (artist_key, release["releaseGroupMbid"]), ""
            )
            if decision in {"not-in-scope", "ignored"}:
                continue
            if (
                decision != "include"
                and not official_status.get(
                    (mbid, release["releaseGroupMbid"]), True
                )
            ):
                continue
            title_key = release["titleKey"]
            if title_key:
                official_titles[artist_key].setdefault(title_key, release)
                release_source_by_artist[artist_key] = release["source"]

    candidates = [
        album
        for album in albums
        if album["artistKey"] in official_titles
        and album["titleKey"] not in official_titles[album["artistKey"]]
    ]

    candidate_titles_by_mbid: dict[str, set[str]] = defaultdict(set)
    for album in candidates:
        match = trusted[album["artistKey"]]
        candidate_titles_by_mbid[match["mbid"]].add(album["titleKey"])

    overlay_all: dict[str, list[dict[str, Any]]] = defaultdict(list)
    overlay_mbids: set[str] = set()
    for row in app_connection.execute(
        """
        SELECT
            LOWER(artist_mbid) AS artist_mbid,
            release_mbid,
            title,
            year,
            type,
            secondary_types,
            status
        FROM musicbrainz_artist_release_groups
        WHERE NULLIF(TRIM(COALESCE(release_mbid, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL
        """
    ):
        mbid = str(row["artist_mbid"]).lower()
        if mbid not in candidate_titles_by_mbid:
            continue
        overlay_mbids.add(mbid)
        release = release_group_dict(row, "refreshed")
        if release["titleKey"] in candidate_titles_by_mbid[mbid]:
            overlay_all[mbid].append(release)

    cache_exact: dict[str, list[dict[str, Any]]] = defaultdict(list)
    cache_mbids = set(candidate_titles_by_mbid) - overlay_mbids
    all_sql = """
        SELECT
            LOWER(artist_mbid) AS artist_mbid,
            release_mbid,
            title,
            year,
            type,
            secondary_types,
            status
        FROM release_groups
        WHERE LOWER(artist_mbid) IN ({placeholders})
          AND NULLIF(TRIM(COALESCE(release_mbid, '')), '') IS NOT NULL
          AND NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL
    """
    for row in query_rows_for_mbids(
        musicbrainz_connection, all_sql, cache_mbids
    ):
        release = release_group_dict(row, "cache")
        mbid = release["artistMbid"]
        if release["titleKey"] in candidate_titles_by_mbid[mbid]:
            cache_exact[mbid].append(release)

    exact_by_mbid_title: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for source in (cache_exact, overlay_all):
        for mbid, releases in source.items():
            for release in releases:
                exact_by_mbid_title[(mbid, release["titleKey"])].append(release)

    for album in candidates:
        match = trusted[album["artistKey"]]
        mbid = match["mbid"]
        exact_releases = exact_by_mbid_title.get((mbid, album["titleKey"]), [])
        exact_releases.sort(
            key=lambda release: (
                0 if release["status"].lower() == "official" else 1,
                0 if release["type"].lower() in {"ep", "single", "album"} else 1,
                release["year"] or 9999,
            )
        )
        exact = exact_releases[0] if exact_releases else None
        album["musicbrainz"] = {
            "artistMbid": mbid,
            "artistUrl": f"{MUSICBRAINZ_WEB_ROOT}/artist/{mbid}",
            "artistMatchMethod": match["matchMethod"],
            "matchedArtistName": match["matchedName"],
            "officialListSource": release_source_by_artist.get(
                album["artistKey"], "unknown"
            ),
            "officialAlbumCount": len(official_titles[album["artistKey"]]),
            "localTitleAbsentFromPureOfficialList": True,
            "exactReleaseGroup": (
                {
                    key: value
                    for key, value in exact.items()
                    if key not in {"titleKey", "secondaryTypesRaw", "artistMbid"}
                }
                | {
                    "url": (
                        f"{MUSICBRAINZ_WEB_ROOT}/release-group/"
                        f"{exact['releaseGroupMbid']}"
                    )
                }
                if exact
                else None
            ),
        }

    official_match_count = sum(
        1
        for album in albums
        if album["artistKey"] in official_titles
        and album["titleKey"] in official_titles[album["artistKey"]]
    )
    metadata = {
        "libraryAlbumCount": len(albums),
        "libraryArtistCount": len(artists),
        "trustedMusicBrainzArtistCount": len(trusted),
        "comparableMusicBrainzArtistCount": len(official_titles),
        "musicBrainzOfficialAlbumMatchCount": official_match_count,
        "uncomparedAlbumCount": max(
            len(albums) - official_match_count - len(candidates), 0
        ),
        "candidateAlbumCount": len(candidates),
    }
    return candidates, metadata


def resolve_track_source(file_path: str | None, filename: str | None) -> Path:
    directory = Path(str(file_path or "").strip()).expanduser()
    file_value = Path(str(filename or "").strip()).expanduser()
    if file_value.is_absolute():
        return file_value.resolve(strict=False)
    return (directory / file_value).resolve(strict=False)


def load_album_files(
    connection: sqlite3.Connection,
    album_id: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    rows = connection.execute(
        """
        SELECT title, disc_number, track_number, file_path, filename
        FROM tracks
        WHERE album_id = ?
        ORDER BY COALESCE(disc_number, 0), COALESCE(track_number, 0), id
        """,
        (album_id,),
    )
    raw: list[dict[str, Any]] = []
    warnings: list[str] = []
    source_keys: set[str] = set()
    for row in rows:
        source = resolve_track_source(row["file_path"], row["filename"])
        source_key = os.path.normcase(str(source))
        if source_key in source_keys:
            continue
        source_keys.add(source_key)
        try:
            exists = source.is_file()
            stat = source.stat() if exists else None
        except OSError as error:
            exists = False
            stat = None
            warnings.append(f"Could not inspect source file {source}: {error}")
        raw.append(
            {
                "source": str(source),
                "filename": source.name,
                "trackTitle": str(row["title"] or ""),
                "discNumber": parse_int(row["disc_number"]),
                "trackNumber": parse_int(row["track_number"]),
                "exists": exists,
                "sizeBytes": stat.st_size if stat else None,
                "mtimeNs": stat.st_mtime_ns if stat else None,
            }
        )
        if not exists:
            warnings.append(f"Missing source file: {source}")

    name_counts: dict[str, int] = defaultdict(int)
    for file in raw:
        name_counts[file["filename"].casefold()] += 1
    for index, file in enumerate(raw, start=1):
        if name_counts[file["filename"].casefold()] == 1:
            relative = Path(file["filename"])
        else:
            disc = file["discNumber"] or 0
            folder = f"Disc {disc}" if disc else "Duplicate names"
            relative = Path(folder) / file["filename"]
            if any(
                previous.get("relativePath", "").casefold()
                == str(relative).casefold()
                for previous in raw[: index - 1]
            ):
                relative = Path(folder) / f"{index:03d}-{file['filename']}"
        file["relativePath"] = str(relative)
    if not raw:
        warnings.append("No track rows were found for this album")
    return raw, warnings


def rym_search_url(artist: str, title: str) -> str:
    query = urllib.parse.urlencode(
        {"searchterm": f"{artist} {title}", "searchtype": "l"}
    )
    return f"https://rateyourmusic.com/search?{query}"


class DiscogsClient:
    def __init__(
        self,
        cache_dir: Path,
        *,
        offline: bool = False,
        refresh: bool = False,
    ) -> None:
        self.cache_dir = cache_dir.expanduser().resolve()
        self.offline = offline
        self.refresh = refresh
        self.token = os.environ.get("DISCOGS_TOKEN", "").strip()
        self.consumer_key = os.environ.get("DISCOGS_CONSUMER_KEY", "").strip()
        self.consumer_secret = os.environ.get(
            "DISCOGS_CONSUMER_SECRET", ""
        ).strip()
        self.last_request_started = 0.0
        self.network_requests = 0
        self.cache_hits = 0

    @property
    def auth_source(self) -> str:
        if self.token:
            return "env-personal-token"
        if self.consumer_key and self.consumer_secret:
            return "env-consumer-key-secret"
        if self.consumer_key or self.consumer_secret:
            return "incomplete-consumer-key-secret"
        return "public"

    @property
    def minimum_interval(self) -> float:
        return 1.1 if self.auth_source != "public" else 2.5

    def _headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        if self.token:
            headers["Authorization"] = f"Discogs token={self.token}"
        elif self.consumer_key and self.consumer_secret:
            headers["Authorization"] = (
                f"Discogs key={self.consumer_key}, "
                f"secret={self.consumer_secret}"
            )
        return headers

    def _cache_path(self, url: str) -> Path:
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return self.cache_dir / key[:2] / f"{key}.json"

    def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not path.startswith("/") or path.startswith("//"):
            raise TrimmerError("Discogs request paths must start with one slash")
        query = urllib.parse.urlencode(params or {}, doseq=True)
        url = f"{DISCOGS_API_ROOT}{path}"
        if query:
            url = f"{url}?{query}"
        cache_path = self._cache_path(url)
        if cache_path.is_file() and not self.refresh:
            cached = read_json(cache_path)
            data = cached.get("data")
            if isinstance(data, dict):
                self.cache_hits += 1
                return data
        if self.offline:
            raise CacheMiss(f"No cached Discogs response for {path}")

        elapsed = time.monotonic() - self.last_request_started
        if elapsed < self.minimum_interval:
            time.sleep(self.minimum_interval - elapsed)

        request = urllib.request.Request(url, headers=self._headers(), method="GET")
        attempts = 0
        while True:
            attempts += 1
            self.last_request_started = time.monotonic()
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                break
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempts < 4:
                    retry_after = parse_int(error.headers.get("Retry-After")) or 60
                    time.sleep(min(max(retry_after, 1), 60))
                    continue
                safe_message = f"Discogs returned HTTP {error.code} for {path}"
                raise TrimmerError(safe_message) from error
            except (urllib.error.URLError, TimeoutError) as error:
                if attempts < 3:
                    time.sleep(2**attempts)
                    continue
                raise TrimmerError(f"Discogs request failed for {path}: {error}") from error
            except json.JSONDecodeError as error:
                raise TrimmerError(f"Discogs returned invalid JSON for {path}") from error

        if not isinstance(payload, dict):
            raise TrimmerError(f"Discogs returned an unexpected payload for {path}")
        self.network_requests += 1
        cache_value = {
            "fetchedAt": utc_now(),
            "url": url,
            "data": payload,
        }
        write_json_atomic(cache_path, cache_value)
        return payload

    def search_release(self, artist: str, title: str) -> dict[str, Any]:
        return self.get(
            "/database/search",
            {
                "artist": artist,
                "release_title": title,
                "per_page": 50,
                "page": 1,
            },
        )


def result_match_score(
    result: dict[str, Any],
    artist: str,
    title: str,
    year: int | None,
) -> tuple[float, dict[str, Any]]:
    result_title = str(result.get("title") or "").strip()
    result_key = musicbrainz_text_key(result_title)
    artist_key = musicbrainz_text_key(artist)
    title_key = musicbrainz_text_key(title)
    title_match = bool(
        title_key
        and (
            result_key == title_key
            or result_key.endswith(f" {title_key}")
        )
    )
    artist_match = bool(
        artist_key
        and (
            result_key.startswith(f"{artist_key} ")
            or result_key == f"{artist_key} {title_key}"
        )
    )
    result_year = parse_int(result.get("year"))
    if year and result_year:
        difference = abs(year - result_year)
        year_score = 0.10 if difference <= 1 else 0.05 if difference <= 3 else 0.0
    elif not year or not result_year:
        difference = None
        year_score = 0.04
    else:
        difference = None
        year_score = 0.0
    score = (
        (0.60 if title_match else 0.0)
        + (0.25 if artist_match else 0.0)
        + year_score
        + (0.05 if result.get("type") == "master" else 0.0)
    )
    return min(score, 1.0), {
        "titleMatch": title_match,
        "artistMatch": artist_match,
        "yearDifference": difference,
    }


def descriptor_evidence(result: dict[str, Any]) -> dict[str, Any]:
    formats = [
        str(value).strip()
        for value in result.get("format") or []
        if str(value).strip()
    ]
    normalized = {normalize_descriptor(value) for value in formats}
    excluded = sorted(normalized & DISALLOWED_DESCRIPTORS)
    has_album = "album" in normalized
    return {
        "formats": formats,
        "normalized": sorted(normalized),
        "excluded": excluded,
        "hasAlbum": has_album,
        "pureAlbum": has_album and not excluded,
    }


def classify_discogs_search(
    payload: dict[str, Any],
    *,
    artist: str,
    title: str,
    year: int | None,
) -> dict[str, Any]:
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        raw_results = []
    scored: list[dict[str, Any]] = []
    for raw in raw_results:
        if not isinstance(raw, dict):
            continue
        score, match = result_match_score(raw, artist, title, year)
        if not match["titleMatch"] or not match["artistMatch"]:
            continue
        evidence = descriptor_evidence(raw)
        scored.append(
            {
                "raw": raw,
                "score": score,
                "match": match,
                "evidence": evidence,
            }
        )
    if not scored:
        return {
            "classification": "review",
            "confidence": 0.0,
            "reason": "Discogs returned no strong artist/title match.",
            "match": None,
        }

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in scored:
        raw = item["raw"]
        master_id = parse_int(raw.get("master_id"))
        if raw.get("type") == "master":
            master_id = parse_int(raw.get("id"))
        group_key = (
            f"master:{master_id}"
            if master_id
            else f"{raw.get('type', 'release')}:{raw.get('id')}"
        )
        groups[group_key].append(item)

    ranked_groups = sorted(
        groups.items(),
        key=lambda pair: (
            -max(item["score"] for item in pair[1]),
            -sum(1 for item in pair[1] if item["raw"].get("type") == "master"),
            -len(pair[1]),
            pair[0],
        ),
    )
    eligible_groups = [
        (group_key, group)
        for group_key, group in ranked_groups
        if max(item["score"] for item in group) >= 0.85
    ]
    if not eligible_groups:
        _, top_group = ranked_groups[0]
        best = max(top_group, key=lambda item: item["score"])
        confidence = round(float(best["score"]), 3)
        return {
            "classification": "review",
            "confidence": confidence,
            "reason": "Discogs match confidence is below the move threshold.",
            "match": None,
        }

    pure_groups = [
        (group_key, group)
        for group_key, group in eligible_groups
        if any(item["evidence"]["pureAlbum"] for item in group)
    ]
    excluded_groups = [
        (group_key, group)
        for group_key, group in eligible_groups
        if any(item["evidence"]["excluded"] for item in group)
    ]
    if pure_groups:
        group_key, group = pure_groups[0]
    elif excluded_groups:
        group_key, group = excluded_groups[0]
    else:
        group_key, group = eligible_groups[0]
    best = max(
        group,
        key=lambda item: (
            item["score"],
            item["raw"].get("type") == "master",
        ),
    )
    confidence = round(float(best["score"]), 3)
    pure_rows = [
        item
        for _, candidate_group in eligible_groups
        for item in candidate_group
        if item["evidence"]["pureAlbum"]
    ]
    excluded_rows = [
        item
        for _, candidate_group in eligible_groups
        for item in candidate_group
        if item["evidence"]["excluded"]
    ]
    descriptors = sorted(
        {
            value
            for _, candidate_group in eligible_groups
            for item in candidate_group
            for value in item["evidence"]["formats"]
        },
        key=str.casefold,
    )
    excluded = sorted(
        {
            value
            for _, candidate_group in eligible_groups
            for item in candidate_group
            for value in item["evidence"]["excluded"]
        }
    )
    raw = best["raw"]
    master_id = parse_int(raw.get("master_id"))
    if raw.get("type") == "master":
        master_id = parse_int(raw.get("id"))
    if master_id:
        entity_type = "master"
        entity_id = master_id
    else:
        entity_type = "release"
        entity_id = parse_int(raw.get("id"))
    url = (
        f"{DISCOGS_WEB_ROOT}/{entity_type}/{entity_id}"
        if entity_id
        else None
    )
    match = {
        "entityType": entity_type,
        "entityId": entity_id,
        "url": url,
        "title": str(raw.get("title") or ""),
        "year": parse_int(raw.get("year")),
        "groupKey": group_key,
        "strongMatchedGroupCount": len(eligible_groups),
        "matchedResultCount": len(group),
        "descriptors": descriptors,
        "excludedDescriptors": excluded,
        "matchEvidence": best["match"],
    }
    if pure_rows:
        return {
            "classification": "keep",
            "confidence": confidence,
            "reason": (
                "Discogs has a strongly matched edition tagged Album without "
                "an excluded release descriptor."
            ),
            "match": match,
        }
    if excluded_rows:
        return {
            "classification": "move_candidate",
            "confidence": confidence,
            "reason": (
                "Discogs strongly matched the release and found only excluded "
                f"release descriptors: {', '.join(excluded)}."
            ),
            "match": match,
        }
    return {
        "classification": "review",
        "confidence": confidence,
        "reason": (
            "Discogs matched the release but did not provide decisive Album or "
            "excluded release descriptors."
        ),
        "match": match,
    }


def manifest_summary(manifest: dict[str, Any]) -> dict[str, Any]:
    counts: dict[str, int] = defaultdict(int)
    file_count = 0
    total_bytes = 0
    approved = 0
    pending = 0
    errors = 0
    for album in manifest.get("albums", []):
        classification = str(album.get("automatedClassification") or "pending")
        counts[classification] += 1
        if album.get("approved"):
            approved += 1
        if album.get("lookupState") == "pending":
            pending += 1
        if album.get("lookupState") == "error":
            errors += 1
        for file in album.get("files") or []:
            file_count += 1
            total_bytes += parse_int(file.get("sizeBytes")) or 0
    candidate_count = int(manifest.get("candidateAlbumCount") or 0)
    processed = len(manifest.get("albums") or [])
    return {
        "candidateAlbumCount": candidate_count,
        "processedAlbumCount": processed,
        "remainingAlbumCount": max(candidate_count - processed + pending, 0),
        "keepCount": counts["keep"],
        "moveCandidateCount": counts["move_candidate"],
        "reviewCount": counts["review"],
        "pendingCount": pending,
        "errorCount": errors,
        "approvedMoveCount": approved,
        "manifestFileCount": file_count,
        "manifestBytes": total_bytes,
    }


def new_manifest(
    database_path: Path,
    musicbrainz_cache_path: Path,
    metadata: dict[str, Any],
    library_root: Path | None,
) -> dict[str, Any]:
    return {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "tool": "music-library-trimmer",
        "toolVersion": TOOL_VERSION,
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
        "status": "in_progress",
        "databasePath": str(database_path.resolve()),
        "musicbrainzCachePath": str(musicbrainz_cache_path.resolve()),
        "libraryRoot": (
            str(library_root.expanduser().resolve()) if library_root else None
        ),
        "candidateAlbumCount": metadata["candidateAlbumCount"],
        "sourceSummary": metadata,
        "policy": {
            "musicbrainzScope": (
                "Local albums absent from a trusted artist's pure official "
                "MusicBrainz album list"
            ),
            "discogsExcludedDescriptors": sorted(DISALLOWED_DESCRIPTORS),
            "discogsMoveThreshold": 0.85,
            "absenceAloneIsMoveEvidence": False,
            "filesOnly": True,
            "sidecarsIncluded": False,
            "requestedExcludedGenres": metadata.get(
                "requestedExcludedGenres", []
            ),
            "expandedExcludedGenres": metadata.get(
                "expandedExcludedGenres", []
            ),
        },
        "albums": [],
        "summary": {},
    }


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        raise TrimmerError(
            "Unsupported manifest schema version: "
            f"{manifest.get('schemaVersion')!r}"
        )
    if not isinstance(manifest.get("albums"), list):
        raise TrimmerError("Manifest albums must be an array")


def build_album_manifest_row(
    connection: sqlite3.Connection,
    album: dict[str, Any],
    discogs: dict[str, Any],
    *,
    lookup_state: str,
    lookup_error: str | None = None,
) -> dict[str, Any]:
    classification = str(discogs.get("classification") or "review")
    files: list[dict[str, Any]] = []
    warnings: list[str] = []
    if classification != "keep":
        files, warnings = load_album_files(connection, album["albumId"])
        if warnings and classification == "move_candidate":
            classification = "review"
    reason = str(discogs.get("reason") or "")
    if warnings:
        reason = f"{reason} Filesystem review required: {'; '.join(warnings)}"
    return {
        "albumId": album["albumId"],
        "artist": album["artist"],
        "title": album["title"],
        "year": album["year"],
        "releaseYear": album["releaseYear"],
        "trackCount": album["trackCount"],
        "lookupState": lookup_state,
        "lookupError": lookup_error,
        "automatedClassification": classification,
        "reviewDecision": None,
        "approved": False,
        "confidence": discogs.get("confidence", 0.0),
        "reason": reason,
        "musicbrainz": album["musicbrainz"],
        "discogs": discogs.get("match"),
        "rymSearchUrl": rym_search_url(album["artist"], album["title"]),
        "filesystemWarnings": warnings,
        "destinationArtistSegment": safe_file_segment(
            album["artist"], "Unknown Artist"
        ),
        "destinationAlbumSegment": album_destination_segment(album),
        "files": files,
        "totalBytes": sum(
            parse_int(file.get("sizeBytes")) or 0 for file in files
        ),
    }


def scan_command(args: argparse.Namespace) -> dict[str, Any]:
    database_path = Path(args.db).expanduser().resolve()
    output_path = Path(args.out).expanduser().resolve()
    library_root = (
        Path(args.library_root).expanduser().resolve()
        if args.library_root
        else None
    )
    with open_sqlite_read_only(database_path) as app_connection:
        validate_app_schema(app_connection)
        musicbrainz_path = resolve_musicbrainz_cache_path(
            app_connection,
            Path(args.musicbrainz_cache) if args.musicbrainz_cache else None,
        )
        with open_sqlite_read_only(musicbrainz_path) as mb_connection:
            validate_musicbrainz_schema(mb_connection)
            all_albums = load_albums(app_connection)
            root_scoped_albums, root_scope_summary = scope_albums_to_library_root(
                app_connection, all_albums, library_root
            )
            albums, genre_scope_summary = scope_albums_by_genre(
                root_scoped_albums, args.exclude_genre
            )
            candidates, metadata = load_musicbrainz_candidates(
                app_connection, mb_connection, albums
            )
            metadata = {
                **root_scope_summary,
                **genre_scope_summary,
                **metadata,
            }

        if output_path.exists():
            if not args.resume:
                raise TrimmerError(
                    f"Manifest already exists; use --resume: {output_path}"
                )
            manifest = read_json(output_path)
            validate_manifest(manifest)
            if Path(str(manifest.get("databasePath", ""))).resolve() != database_path:
                raise TrimmerError(
                    "The existing manifest belongs to a different app database"
                )
            manifest_root = manifest.get("libraryRoot")
            expected_root = str(library_root) if library_root else None
            if manifest_root != expected_root:
                raise TrimmerError(
                    "The existing manifest uses a different --library-root"
                )
            manifest_exclusions = manifest.get("policy", {}).get(
                "expandedExcludedGenres", []
            )
            current_exclusions = sorted(
                expand_genre_exclusions(args.exclude_genre)
            )
            if manifest_exclusions != current_exclusions:
                raise TrimmerError(
                    "The existing manifest uses different --exclude-genre values"
                )
        else:
            manifest = new_manifest(
                database_path, musicbrainz_path, metadata, library_root
            )
            write_json_atomic(output_path, manifest)

        existing = {
            str(album.get("albumId")): album
            for album in manifest["albums"]
            if album.get("albumId")
        }
        candidate_ids = {album["albumId"] for album in candidates}
        stale_ids = set(existing) - candidate_ids
        if stale_ids:
            raise TrimmerError(
                "The library changed and the manifest contains albums that are no "
                "longer candidates. Start a new manifest instead of resuming."
            )

        pending: list[dict[str, Any]] = []
        for album in candidates:
            previous = existing.get(album["albumId"])
            if previous is None:
                pending.append(album)
            elif args.retry_errors and previous.get("lookupState") in {
                "error",
                "pending",
            }:
                pending.append(album)

        limit = int(args.limit)
        if limit < 0:
            raise TrimmerError("--limit cannot be negative")
        selected = pending if limit == 0 else pending[:limit]
        client = DiscogsClient(
            Path(args.cache_dir),
            offline=bool(args.offline),
            refresh=bool(args.refresh),
        )
        processed_this_run = 0
        for index, album in enumerate(selected, start=1):
            try:
                payload = client.search_release(album["artist"], album["title"])
                discogs = classify_discogs_search(
                    payload,
                    artist=album["artist"],
                    title=album["title"],
                    year=album["year"] or album["releaseYear"],
                )
                row = build_album_manifest_row(
                    app_connection,
                    album,
                    discogs,
                    lookup_state="complete",
                )
            except CacheMiss as error:
                discogs = {
                    "classification": "pending",
                    "confidence": 0.0,
                    "reason": str(error),
                    "match": None,
                }
                row = build_album_manifest_row(
                    app_connection,
                    album,
                    discogs,
                    lookup_state="pending",
                    lookup_error=str(error),
                )
            except TrimmerError as error:
                discogs = {
                    "classification": "review",
                    "confidence": 0.0,
                    "reason": f"Discogs lookup failed: {error}",
                    "match": None,
                }
                row = build_album_manifest_row(
                    app_connection,
                    album,
                    discogs,
                    lookup_state="error",
                    lookup_error=str(error),
                )

            if album["albumId"] in existing:
                position = next(
                    position
                    for position, value in enumerate(manifest["albums"])
                    if value.get("albumId") == album["albumId"]
                )
                manifest["albums"][position] = row
            else:
                manifest["albums"].append(row)
                existing[album["albumId"]] = row
            processed_this_run += 1
            manifest["updatedAt"] = utc_now()
            manifest["summary"] = manifest_summary(manifest)
            if index % int(args.checkpoint_every) == 0:
                write_json_atomic(output_path, manifest)
            print(
                (
                    f"[{index}/{len(selected)}] {album['artist']} — "
                    f"{album['title']}: {row['automatedClassification']}"
                ),
                file=sys.stderr,
            )

        summary = manifest_summary(manifest)
        complete = (
            summary["remainingAlbumCount"] == 0
            and summary["pendingCount"] == 0
            and summary["errorCount"] == 0
        )
        manifest["status"] = "complete" if complete else "partial"
        manifest["updatedAt"] = utc_now()
        manifest["summary"] = summary
        write_json_atomic(output_path, manifest)
        return {
            "ok": True,
            "command": "scan",
            "manifestPath": str(output_path),
            "status": manifest["status"],
            "processedThisRun": processed_this_run,
            "networkRequests": client.network_requests,
            "cacheHits": client.cache_hits,
            "authSource": client.auth_source,
            "summary": summary,
            "nextCommand": (
                f'py "{Path(__file__).resolve()}" export-review '
                f'--manifest "{output_path}" --out "trim-review.csv"'
            ),
        }


def candidate_command(args: argparse.Namespace) -> dict[str, Any]:
    database_path = Path(args.db).expanduser().resolve()
    library_root = (
        Path(args.library_root).expanduser().resolve()
        if args.library_root
        else None
    )
    with open_sqlite_read_only(database_path) as app_connection:
        validate_app_schema(app_connection)
        musicbrainz_path = resolve_musicbrainz_cache_path(
            app_connection,
            Path(args.musicbrainz_cache) if args.musicbrainz_cache else None,
        )
        with open_sqlite_read_only(musicbrainz_path) as mb_connection:
            validate_musicbrainz_schema(mb_connection)
            all_albums = load_albums(app_connection)
            root_scoped_albums, root_scope_summary = scope_albums_to_library_root(
                app_connection, all_albums, library_root
            )
            albums, genre_scope_summary = scope_albums_by_genre(
                root_scoped_albums, args.exclude_genre
            )
            candidates, metadata = load_musicbrainz_candidates(
                app_connection, mb_connection, albums
            )
            metadata = {
                **root_scope_summary,
                **genre_scope_summary,
                **metadata,
            }
    candidate_artists = len({album["artistKey"] for album in candidates})
    return {
        "ok": True,
        "command": "candidates",
        "databasePath": str(database_path),
        "musicbrainzCachePath": str(musicbrainz_path),
        **metadata,
        "candidateArtistCount": candidate_artists,
        "estimatedDiscogsRequests": len(candidates),
        "note": (
            "The estimate assumes one cached-or-live Discogs database search per "
            "candidate album."
        ),
    }


REVIEW_FIELDS = [
    "albumId",
    "artist",
    "title",
    "year",
    "automatedClassification",
    "reviewDecision",
    "approved",
    "confidence",
    "reason",
    "musicbrainzType",
    "musicbrainzSecondaryTypes",
    "musicbrainzStatus",
    "musicbrainzUrl",
    "discogsDescriptors",
    "discogsExcludedDescriptors",
    "discogsUrl",
    "rymSearchUrl",
    "fileCount",
    "totalBytes",
    "representativePath",
]


def export_review_command(args: argparse.Namespace) -> dict[str, Any]:
    manifest_path = Path(args.manifest).expanduser().resolve()
    output_path = Path(args.out).expanduser().resolve()
    manifest = read_json(manifest_path)
    validate_manifest(manifest)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rows = 0
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REVIEW_FIELDS)
        writer.writeheader()
        for album in manifest["albums"]:
            if not args.include_keep and album.get("automatedClassification") == "keep":
                continue
            exact = (
                album.get("musicbrainz", {}).get("exactReleaseGroup")
                or {}
            )
            discogs = album.get("discogs") or {}
            files = album.get("files") or []
            writer.writerow(
                {
                    "albumId": album.get("albumId"),
                    "artist": album.get("artist"),
                    "title": album.get("title"),
                    "year": album.get("year") or album.get("releaseYear") or "",
                    "automatedClassification": album.get(
                        "automatedClassification"
                    ),
                    "reviewDecision": album.get("reviewDecision") or "",
                    "approved": "yes" if album.get("approved") else "no",
                    "confidence": album.get("confidence"),
                    "reason": album.get("reason"),
                    "musicbrainzType": exact.get("type", ""),
                    "musicbrainzSecondaryTypes": ", ".join(
                        exact.get("secondaryTypes") or []
                    ),
                    "musicbrainzStatus": exact.get("status", ""),
                    "musicbrainzUrl": exact.get("url", ""),
                    "discogsDescriptors": ", ".join(
                        discogs.get("descriptors") or []
                    ),
                    "discogsExcludedDescriptors": ", ".join(
                        discogs.get("excludedDescriptors") or []
                    ),
                    "discogsUrl": discogs.get("url", ""),
                    "rymSearchUrl": album.get("rymSearchUrl", ""),
                    "fileCount": len(files),
                    "totalBytes": album.get("totalBytes", 0),
                    "representativePath": (
                        files[0].get("source", "") if files else ""
                    ),
                }
            )
            rows += 1
    return {
        "ok": True,
        "command": "export-review",
        "manifestPath": str(manifest_path),
        "reviewPath": str(output_path),
        "rowCount": rows,
        "instructions": (
            "Set reviewDecision to move, keep, or review. Set approved=yes only "
            "for rows that should be moved, then run import-review."
        ),
    }


def parse_approval(value: str | None) -> bool:
    return normalize_space(value) in {"1", "true", "yes", "y", "x"}


def import_review_command(args: argparse.Namespace) -> dict[str, Any]:
    manifest_path = Path(args.manifest).expanduser().resolve()
    review_path = Path(args.review).expanduser().resolve()
    manifest = read_json(manifest_path)
    validate_manifest(manifest)
    albums = {
        str(album.get("albumId")): album
        for album in manifest["albums"]
        if album.get("albumId")
    }
    changed = 0
    seen: set[str] = set()
    with review_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"albumId", "reviewDecision", "approved"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise TrimmerError(
                f"Review CSV is missing columns: {', '.join(sorted(missing))}"
            )
        for row in reader:
            album_id = str(row.get("albumId") or "").strip()
            if not album_id:
                continue
            if album_id in seen:
                raise TrimmerError(f"Review CSV repeats albumId {album_id}")
            seen.add(album_id)
            album = albums.get(album_id)
            if not album:
                raise TrimmerError(
                    f"Review CSV contains an album not present in the manifest: {album_id}"
                )
            decision = normalize_space(row.get("reviewDecision"))
            if decision not in {"", "move", "keep", "review"}:
                raise TrimmerError(
                    f"Unsupported reviewDecision for {album_id}: {decision!r}"
                )
            approved = parse_approval(row.get("approved"))
            if approved and decision not in {"move", ""}:
                raise TrimmerError(
                    f"Only move decisions can be approved ({album_id})"
                )
            if approved and decision == "" and album.get(
                "automatedClassification"
            ) != "move_candidate":
                raise TrimmerError(
                    f"Set reviewDecision=move before approving {album_id}"
                )
            next_decision = decision or None
            if (
                album.get("reviewDecision") != next_decision
                or bool(album.get("approved")) != approved
            ):
                album["reviewDecision"] = next_decision
                album["approved"] = approved
                changed += 1

    backup = backup_file(manifest_path)
    manifest["updatedAt"] = utc_now()
    manifest["summary"] = manifest_summary(manifest)
    write_json_atomic(manifest_path, manifest)
    return {
        "ok": True,
        "command": "import-review",
        "manifestPath": str(manifest_path),
        "backupPath": str(backup),
        "changedAlbumCount": changed,
        "summary": manifest["summary"],
    }


def effective_decision(album: dict[str, Any]) -> str:
    review = normalize_space(str(album.get("reviewDecision") or ""))
    if review:
        return review
    automated = str(album.get("automatedClassification") or "review")
    return "move" if automated == "move_candidate" else automated


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def is_same_volume(source: Path, destination_parent: Path) -> bool:
    source_drive = os.path.splitdrive(str(source.resolve()))[0].casefold()
    destination_drive = os.path.splitdrive(
        str(destination_parent.resolve())
    )[0].casefold()
    if source_drive or destination_drive:
        return source_drive == destination_drive
    return source.stat().st_dev == destination_parent.stat().st_dev


def validate_quarantine_root(quarantine_root: Path) -> None:
    resolved = quarantine_root.resolve(strict=False)
    filesystem_root = Path(resolved.anchor).resolve(strict=False)
    if resolved == filesystem_root:
        raise TrimmerError("Choose a quarantine directory, not a filesystem root")
    if resolved == Path.home().resolve():
        raise TrimmerError("Choose a quarantine directory below, not equal to, the home directory")
    if resolved.exists() and not resolved.is_dir():
        raise TrimmerError(f"Quarantine path is not a directory: {resolved}")


def safe_move_file(source: Path, destination: Path) -> dict[str, Any]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise TrimmerError(f"Destination already exists: {destination}")
    source_size = source.stat().st_size
    if is_same_volume(source, destination.parent):
        os.replace(source, destination)
        destination_hash = sha256_file(destination)
        return {
            "method": "rename",
            "sizeBytes": source_size,
            "sha256": destination_hash,
        }

    temporary = destination.with_name(
        f".{destination.name}.{uuid.uuid4().hex}.partial"
    )
    try:
        source_hash = sha256_file(source)
        shutil.copy2(source, temporary)
        destination_hash = sha256_file(temporary)
        if destination_hash != source_hash:
            raise TrimmerError(
                f"SHA-256 verification failed while copying {source}"
            )
        os.replace(temporary, destination)
        source.unlink()
        return {
            "method": "copy-verify-delete",
            "sizeBytes": source_size,
            "sha256": source_hash,
        }
    finally:
        if temporary.exists():
            temporary.unlink()


def approved_move_plan(
    manifest: dict[str, Any],
    quarantine_root: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    albums: list[dict[str, Any]] = []
    moves: list[dict[str, Any]] = []
    seen_sources: set[str] = set()
    seen_destinations: set[str] = set()
    for album in manifest["albums"]:
        if not album.get("approved") or effective_decision(album) != "move":
            continue
        files = album.get("files") or []
        if not files:
            raise TrimmerError(
                f"Approved album has no file rows: {album.get('artist')} — "
                f"{album.get('title')}"
            )
        album_moves: list[dict[str, Any]] = []
        for file in files:
            source = Path(str(file.get("source") or "")).resolve(strict=False)
            relative = Path(str(file.get("relativePath") or source.name))
            if relative.is_absolute() or ".." in relative.parts:
                raise TrimmerError(
                    f"Unsafe relative destination in manifest: {relative}"
                )
            destination = (
                quarantine_root
                / str(album["destinationArtistSegment"])
                / str(album["destinationAlbumSegment"])
                / relative
            ).resolve(strict=False)
            source_key = os.path.normcase(str(source))
            destination_key = os.path.normcase(str(destination))
            if source_key in seen_sources:
                raise TrimmerError(f"Source file appears more than once: {source}")
            if destination_key in seen_destinations:
                raise TrimmerError(
                    f"Two files would use the same destination: {destination}"
                )
            seen_sources.add(source_key)
            seen_destinations.add(destination_key)
            album_moves.append(
                {
                    "albumId": album["albumId"],
                    "artist": album["artist"],
                    "title": album["title"],
                    "source": str(source),
                    "destination": str(destination),
                    "expectedSizeBytes": file.get("sizeBytes"),
                    "expectedMtimeNs": file.get("mtimeNs"),
                }
            )
        albums.append(
            {
                "albumId": album["albumId"],
                "artist": album["artist"],
                "title": album["title"],
                "fileCount": len(album_moves),
                "totalBytes": sum(
                    parse_int(move.get("expectedSizeBytes")) or 0
                    for move in album_moves
                ),
            }
        )
        moves.extend(album_moves)
    return albums, moves


def preflight_moves(moves: list[dict[str, Any]]) -> None:
    for move in moves:
        source = Path(move["source"])
        destination = Path(move["destination"])
        if not source.is_file():
            raise TrimmerError(f"Source file is missing: {source}")
        if destination.exists():
            raise TrimmerError(f"Destination already exists: {destination}")
        stat = source.stat()
        expected_size = parse_int(move.get("expectedSizeBytes"))
        expected_mtime = parse_int(move.get("expectedMtimeNs"))
        if expected_size is not None and stat.st_size != expected_size:
            raise TrimmerError(
                f"Source size changed after scan: {source}"
            )
        if expected_mtime is not None and stat.st_mtime_ns != expected_mtime:
            raise TrimmerError(
                f"Source modification time changed after scan: {source}"
            )
        if os.path.normcase(str(source.resolve())) == os.path.normcase(
            str(destination.resolve(strict=False))
        ):
            raise TrimmerError(f"Source and destination are identical: {source}")


def apply_command(args: argparse.Namespace) -> dict[str, Any]:
    manifest_path = Path(args.manifest).expanduser().resolve()
    quarantine_root = Path(args.quarantine).expanduser().resolve()
    validate_quarantine_root(quarantine_root)
    manifest = read_json(manifest_path)
    validate_manifest(manifest)
    manifest_library_root = manifest.get("libraryRoot")
    if manifest_library_root and path_is_within(
        quarantine_root, Path(str(manifest_library_root))
    ):
        raise TrimmerError(
            "Choose a quarantine directory outside the manifest library root "
            f"({manifest_library_root})"
        )
    albums, moves = approved_move_plan(manifest, quarantine_root)
    preflight_moves(moves)
    total_bytes = sum(
        parse_int(move.get("expectedSizeBytes")) or 0 for move in moves
    )
    preview = not bool(args.execute)
    if preview:
        return {
            "ok": True,
            "command": "apply",
            "mode": "preview",
            "manifestPath": str(manifest_path),
            "quarantineRoot": str(quarantine_root),
            "albumCount": len(albums),
            "fileCount": len(moves),
            "totalBytes": total_bytes,
            "requiredConfirmation": MOVE_CONFIRMATION,
        }
    if args.confirm != MOVE_CONFIRMATION:
        raise TrimmerError(
            f"Execution requires --confirm {MOVE_CONFIRMATION}"
        )
    if not moves:
        raise TrimmerError("The manifest contains no approved move decisions")

    journal_path = (
        Path(args.journal).expanduser().resolve()
        if args.journal
        else manifest_path.with_name(
            f"{manifest_path.stem}-apply-{datetime.now():%Y%m%d-%H%M%S}.json"
        )
    )
    if journal_path.exists():
        raise TrimmerError(f"Journal already exists: {journal_path}")
    journal: dict[str, Any] = {
        "schemaVersion": JOURNAL_SCHEMA_VERSION,
        "tool": "music-library-trimmer",
        "toolVersion": TOOL_VERSION,
        "status": "applying",
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
        "manifestPath": str(manifest_path),
        "quarantineRoot": str(quarantine_root),
        "albums": albums,
        "plannedFileCount": len(moves),
        "completedMoves": [],
        "activeMove": None,
        "error": None,
    }
    write_json_atomic(journal_path, journal)
    try:
        for index, move in enumerate(moves, start=1):
            journal["activeMove"] = move
            journal["updatedAt"] = utc_now()
            write_json_atomic(journal_path, journal)
            result = safe_move_file(
                Path(move["source"]), Path(move["destination"])
            )
            journal["completedMoves"].append(
                {
                    **move,
                    **result,
                    "movedAt": utc_now(),
                }
            )
            journal["activeMove"] = None
            journal["updatedAt"] = utc_now()
            write_json_atomic(journal_path, journal)
            print(
                f"[{index}/{len(moves)}] moved {move['source']}",
                file=sys.stderr,
            )
    except Exception as error:
        journal["status"] = "failed"
        journal["error"] = str(error)
        journal["updatedAt"] = utc_now()
        write_json_atomic(journal_path, journal)
        if isinstance(error, TrimmerError):
            raise
        raise TrimmerError(f"Move failed: {error}") from error

    journal["status"] = "completed"
    journal["completedAt"] = utc_now()
    journal["updatedAt"] = journal["completedAt"]
    write_json_atomic(journal_path, journal)
    return {
        "ok": True,
        "command": "apply",
        "mode": "executed",
        "manifestPath": str(manifest_path),
        "journalPath": str(journal_path),
        "quarantineRoot": str(quarantine_root),
        "albumCount": len(albums),
        "fileCount": len(moves),
        "totalBytes": total_bytes,
        "nextStep": (
            "Rescan the library in MusicBee, export a fresh TSV, and review that "
            "import in the Music Library app."
        ),
    }


def cleanup_empty_parents(start: Path, stop: Path) -> None:
    current = start
    stop = stop.resolve()
    while current != stop and stop in current.parents:
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def undo_command(args: argparse.Namespace) -> dict[str, Any]:
    journal_path = Path(args.journal).expanduser().resolve()
    journal = read_json(journal_path)
    if journal.get("schemaVersion") != JOURNAL_SCHEMA_VERSION:
        raise TrimmerError("Unsupported apply journal schema version")
    if journal.get("status") not in {"completed", "failed"}:
        raise TrimmerError(
            f"Journal cannot be undone from status {journal.get('status')!r}"
        )
    completed = list(journal.get("completedMoves") or [])
    active = journal.get("activeMove")
    if isinstance(active, dict):
        original = Path(str(active.get("source") or ""))
        quarantined = Path(str(active.get("destination") or ""))
        if quarantined.is_file() and not original.exists():
            completed.append(
                {
                    **active,
                    "sizeBytes": quarantined.stat().st_size,
                    "sha256": sha256_file(quarantined),
                    "recoveredFromActiveMove": True,
                }
            )
        elif original.is_file() and not quarantined.exists():
            pass
        else:
            raise TrimmerError(
                "The interrupted active move is ambiguous; inspect its source "
                "and destination before undoing."
            )
    quarantine_root = Path(str(journal.get("quarantineRoot") or "")).resolve()
    for move in completed:
        original = Path(str(move["source"]))
        quarantined = Path(str(move["destination"]))
        if not quarantined.is_file():
            raise TrimmerError(f"Quarantined file is missing: {quarantined}")
        if original.exists():
            raise TrimmerError(f"Original path is already occupied: {original}")
        expected_size = parse_int(move.get("sizeBytes"))
        if expected_size is not None and quarantined.stat().st_size != expected_size:
            raise TrimmerError(
                f"Quarantined file size changed: {quarantined}"
            )
        expected_hash = str(move.get("sha256") or "")
        if expected_hash and sha256_file(quarantined) != expected_hash:
            raise TrimmerError(
                f"Quarantined file hash changed: {quarantined}"
            )

    if not args.execute:
        return {
            "ok": True,
            "command": "undo",
            "mode": "preview",
            "journalPath": str(journal_path),
            "fileCount": len(completed),
            "requiredConfirmation": UNDO_CONFIRMATION,
        }
    if args.confirm != UNDO_CONFIRMATION:
        raise TrimmerError(
            f"Execution requires --confirm {UNDO_CONFIRMATION}"
        )
    for index, move in enumerate(reversed(completed), start=1):
        original = Path(str(move["source"]))
        quarantined = Path(str(move["destination"]))
        safe_move_file(quarantined, original)
        cleanup_empty_parents(quarantined.parent, quarantine_root)
        print(
            f"[{index}/{len(completed)}] restored {original}",
            file=sys.stderr,
        )
    journal["status"] = "undone"
    journal["undoneAt"] = utc_now()
    journal["updatedAt"] = journal["undoneAt"]
    write_json_atomic(journal_path, journal)
    return {
        "ok": True,
        "command": "undo",
        "mode": "executed",
        "journalPath": str(journal_path),
        "restoredFileCount": len(completed),
    }


def doctor_command(args: argparse.Namespace) -> dict[str, Any]:
    database_path = Path(args.db).expanduser().resolve()
    checks: list[dict[str, Any]] = []
    musicbrainz_path: Path | None = None
    album_count = 0
    track_count = 0
    try:
        with open_sqlite_read_only(database_path) as connection:
            validate_app_schema(connection)
            album_count = int(
                connection.execute("SELECT COUNT(*) FROM albums").fetchone()[0]
            )
            track_count = int(
                connection.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
            )
            musicbrainz_path = resolve_musicbrainz_cache_path(
                connection,
                Path(args.musicbrainz_cache)
                if args.musicbrainz_cache
                else None,
            )
        checks.append(
            {
                "name": "app_database",
                "ok": True,
                "path": str(database_path),
                "albumCount": album_count,
                "trackCount": track_count,
            }
        )
    except TrimmerError as error:
        checks.append(
            {
                "name": "app_database",
                "ok": False,
                "path": str(database_path),
                "message": str(error),
            }
        )

    if musicbrainz_path:
        try:
            with open_sqlite_read_only(musicbrainz_path) as connection:
                validate_musicbrainz_schema(connection)
            checks.append(
                {
                    "name": "musicbrainz_cache",
                    "ok": True,
                    "path": str(musicbrainz_path),
                }
            )
        except TrimmerError as error:
            checks.append(
                {
                    "name": "musicbrainz_cache",
                    "ok": False,
                    "path": str(musicbrainz_path),
                    "message": str(error),
                }
            )

    client = DiscogsClient(Path(args.cache_dir), offline=False)
    credentials_ok = client.auth_source != "incomplete-consumer-key-secret"
    checks.append(
        {
            "name": "discogs_credentials",
            "ok": credentials_ok,
            "authSource": client.auth_source,
            "tokenPrinted": False,
            "message": (
                "Set both DISCOGS_CONSUMER_KEY and DISCOGS_CONSUMER_SECRET."
                if not credentials_ok
                else "Discogs credentials are usable; public mode is also supported."
            ),
        }
    )
    if not args.skip_network:
        try:
            client.get("/")
            checks.append(
                {
                    "name": "discogs_endpoint",
                    "ok": True,
                    "endpoint": DISCOGS_API_ROOT,
                }
            )
        except TrimmerError as error:
            checks.append(
                {
                    "name": "discogs_endpoint",
                    "ok": False,
                    "endpoint": DISCOGS_API_ROOT,
                    "message": str(error),
                }
            )
    ok = all(bool(check["ok"]) for check in checks)
    return {
        "ok": ok,
        "command": "doctor",
        "toolVersion": TOOL_VERSION,
        "pythonVersion": sys.version.split()[0],
        "cacheDir": str(Path(args.cache_dir).expanduser().resolve()),
        "checks": checks,
    }


def request_command(args: argparse.Namespace) -> dict[str, Any]:
    if args.method.lower() != "get":
        raise TrimmerError("The raw request command supports GET only")
    if "?" in args.path or "#" in args.path:
        raise TrimmerError(
            "Put query values in --param rather than embedding them in the path"
        )
    params: dict[str, str] = {}
    for item in args.param:
        if "=" not in item:
            raise TrimmerError("--param values must use name=value")
        key, value = item.split("=", 1)
        if not key:
            raise TrimmerError("--param names cannot be empty")
        if normalize_space(key) in {
            "token",
            "key",
            "secret",
            "consumer_key",
            "consumer_secret",
        }:
            raise TrimmerError(
                "Pass Discogs credentials through environment variables, not --param"
            )
        params[key] = value
    client = DiscogsClient(
        Path(args.cache_dir),
        offline=bool(args.offline),
        refresh=bool(args.refresh),
    )
    data = client.get(args.path, params)
    return {
        "ok": True,
        "command": "request",
        "method": "GET",
        "path": args.path,
        "authSource": client.auth_source,
        "cacheHits": client.cache_hits,
        "networkRequests": client.network_requests,
        "data": data,
    }


def add_common_database_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--db",
        default=str(default_database_path()),
        help="Path to the app-owned music-library.sqlite3 database.",
    )
    parser.add_argument(
        "--musicbrainz-cache",
        help="Override the MusicBrainz cache path saved in app settings.",
    )


def add_cache_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--cache-dir",
        default=str(default_cache_dir()),
        help="Directory for cached Discogs JSON responses.",
    )


def add_library_root_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--library-root",
        help=(
            "Only include albums whose every recorded track path is beneath "
            "this directory, for example D:\\MUSIC."
        ),
    )


def add_genre_scope_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--exclude-genre",
        action="append",
        default=[],
        help=(
            "Exclude one canonical album genre before MusicBrainz/Discogs "
            "comparison; repeat as needed. score or scores expands to the "
            "app's complete scores genre group."
        ),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="library-trimmer",
        description=(
            "Classify non-album releases and move explicitly approved audio "
            "files into a recoverable quarantine."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a stable JSON result on stdout.",
    )
    parser.add_argument("--version", action="version", version=TOOL_VERSION)
    commands = parser.add_subparsers(dest="command", required=True)

    doctor = commands.add_parser(
        "doctor",
        help="Validate databases, credentials, cache, and Discogs reachability.",
    )
    add_common_database_arguments(doctor)
    add_cache_argument(doctor)
    doctor.add_argument(
        "--skip-network",
        action="store_true",
        help="Do not perform the read-only Discogs endpoint check.",
    )
    doctor.set_defaults(handler=doctor_command)

    candidates = commands.add_parser(
        "candidates",
        help="Count MusicBrainz official-list candidates without calling Discogs.",
    )
    add_common_database_arguments(candidates)
    add_library_root_argument(candidates)
    add_genre_scope_arguments(candidates)
    candidates.set_defaults(handler=candidate_command)

    scan = commands.add_parser(
        "scan",
        help="Classify a resumable batch of MusicBrainz candidates with Discogs.",
    )
    add_common_database_arguments(scan)
    add_library_root_argument(scan)
    add_genre_scope_arguments(scan)
    add_cache_argument(scan)
    scan.add_argument(
        "--out",
        default="trim-manifest.json",
        help="Manifest JSON path.",
    )
    scan.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_SCAN_LIMIT,
        help=(
            f"Maximum pending albums this run (default {DEFAULT_SCAN_LIMIT}; "
            "use 0 for all)."
        ),
    )
    scan.add_argument(
        "--resume",
        action="store_true",
        help="Resume and checkpoint into an existing manifest.",
    )
    scan.add_argument(
        "--retry-errors",
        action="store_true",
        help="Retry manifest rows whose lookup is pending or failed.",
    )
    scan.add_argument(
        "--offline",
        action="store_true",
        help="Use cached Discogs responses only.",
    )
    scan.add_argument(
        "--refresh",
        action="store_true",
        help="Ignore cached Discogs responses and fetch fresh data.",
    )
    scan.add_argument(
        "--checkpoint-every",
        type=int,
        default=10,
        help="Write the manifest after this many processed albums.",
    )
    scan.set_defaults(handler=scan_command)

    export_review = commands.add_parser(
        "export-review",
        help="Export non-keep manifest rows to an editable CSV review sheet.",
    )
    export_review.add_argument("--manifest", required=True)
    export_review.add_argument("--out", default="trim-review.csv")
    export_review.add_argument(
        "--include-keep",
        action="store_true",
        help="Include Discogs-confirmed keep rows in the CSV.",
    )
    export_review.set_defaults(handler=export_review_command)

    import_review = commands.add_parser(
        "import-review",
        help="Import reviewDecision and approved columns into a manifest.",
    )
    import_review.add_argument("--manifest", required=True)
    import_review.add_argument("--review", required=True)
    import_review.set_defaults(handler=import_review_command)

    apply_parser = commands.add_parser(
        "apply",
        help="Preview or execute approved file moves into quarantine.",
    )
    apply_parser.add_argument("--manifest", required=True)
    apply_parser.add_argument("--quarantine", required=True)
    apply_parser.add_argument(
        "--journal",
        help="Optional explicit path for the apply journal.",
    )
    apply_parser.add_argument(
        "--execute",
        action="store_true",
        help="Perform moves; omitted means preview only.",
    )
    apply_parser.add_argument(
        "--confirm",
        help=f"Execution confirmation; must equal {MOVE_CONFIRMATION}.",
    )
    apply_parser.set_defaults(handler=apply_command)

    undo = commands.add_parser(
        "undo",
        help="Preview or restore every file recorded in an apply journal.",
    )
    undo.add_argument("--journal", required=True)
    undo.add_argument(
        "--execute",
        action="store_true",
        help="Restore files; omitted means preview only.",
    )
    undo.add_argument(
        "--confirm",
        help=f"Execution confirmation; must equal {UNDO_CONFIRMATION}.",
    )
    undo.set_defaults(handler=undo_command)

    request = commands.add_parser(
        "request",
        help="Make a cached, authenticated, read-only Discogs API request.",
    )
    add_cache_argument(request)
    request.add_argument("method", choices=["get"])
    request.add_argument("path", help="Discogs API path such as /masters/27976.")
    request.add_argument(
        "--param",
        action="append",
        default=[],
        help="Query parameter in name=value form; repeat as needed.",
    )
    request.add_argument("--offline", action="store_true")
    request.add_argument("--refresh", action="store_true")
    request.set_defaults(handler=request_command)
    return parser


def render_human(result: dict[str, Any]) -> None:
    command = result.get("command", "command")
    if not result.get("ok", False):
        print(f"{command} found one or more problems.")
    elif command == "candidates":
        print(
            f"{result['candidateAlbumCount']:,} candidate albums across "
            f"{result['candidateArtistCount']:,} artists."
        )
    elif command == "scan":
        summary = result["summary"]
        print(
            f"Scan {result['status']}: {summary['processedAlbumCount']:,}/"
            f"{summary['candidateAlbumCount']:,} candidates in "
            f"{result['manifestPath']}."
        )
        print(
            f"Keep {summary['keepCount']:,}; move candidates "
            f"{summary['moveCandidateCount']:,}; review "
            f"{summary['reviewCount']:,}; pending/errors "
            f"{summary['pendingCount'] + summary['errorCount']:,}."
        )
    elif command == "apply":
        print(
            f"Apply {result['mode']}: {result.get('albumCount', 0):,} albums, "
            f"{result.get('fileCount', 0):,} files."
        )
        if result.get("journalPath"):
            print(f"Journal: {result['journalPath']}")
    elif command == "undo":
        print(
            f"Undo {result['mode']}: "
            f"{result.get('restoredFileCount', result.get('fileCount', 0)):,} files."
        )
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(argv if argv is not None else sys.argv[1:])
    json_mode = "--json" in arguments
    parser = build_parser()
    try:
        args = parser.parse_args(arguments)
        if int(getattr(args, "checkpoint_every", 1)) <= 0:
            raise TrimmerError("--checkpoint-every must be greater than zero")
        result = args.handler(args)
        if json_mode:
            print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        else:
            render_human(result)
        return 0 if result.get("ok", False) else 1
    except TrimmerError as error:
        payload = {
            "ok": False,
            "error": {
                "type": error.__class__.__name__,
                "message": str(error),
            },
        }
        if json_mode:
            print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        else:
            print(f"Error: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        payload = {
            "ok": False,
            "error": {
                "type": "Interrupted",
                "message": "Operation interrupted; cached responses and the latest checkpoint remain usable.",
            },
        }
        if json_mode:
            print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        else:
            print(payload["error"]["message"], file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
