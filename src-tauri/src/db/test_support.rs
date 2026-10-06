//! Shared fixtures for the `db` feature-module tests.

use super::*;

pub(super) fn shelf_explorer_request(shelf: &str) -> DiscoveryShelfExplorerRequest {
    DiscoveryShelfExplorerRequest {
        shelf: shelf.to_string(),
        date: Some("2026-08-11".to_string()),
        anniversary_years: None,
        event_type: None,
        source: None,
        year: None,
        week: None,
        decade: None,
        genre: None,
        mode: None,
        connection: None,
        query: None,
        sort: None,
        seed: Some(42),
        limit: Some(24),
        offset: Some(0),
    }
}

pub(super) fn temp_test_dir(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "music-library-{label}-{}",
        Utc::now().timestamp_millis()
    ));
    fs::create_dir_all(&dir).expect("create temp test directory");
    dir
}

pub(super) fn create_musicbrainz_tool_cache(path: &Path, artists: &[(&str, &str, usize)]) {
    let conn = Connection::open(path).expect("open test MusicBrainz cache");
    conn.execute_batch(
        "
        CREATE TABLE artist_cache (
            name TEXT PRIMARY KEY,
            mbid TEXT,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE release_groups (
            artist_mbid TEXT,
            release_mbid TEXT,
            title TEXT,
            year INTEGER,
            type TEXT,
            secondary_types TEXT,
            track_count INTEGER,
            status TEXT,
            cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (artist_mbid, release_mbid)
        );
        ",
    )
    .expect("create MusicBrainz tool cache schema");

    for (name, mbid, release_count) in artists {
        conn.execute(
            "INSERT INTO artist_cache (name, mbid, cached_at) VALUES (?1, ?2, '2026-02-01 12:00:00')",
            params![name, mbid],
        )
        .expect("insert MusicBrainz tool cache artist");
        for index in 0..*release_count {
            conn.execute(
                "
                INSERT INTO release_groups (
                    artist_mbid, release_mbid, title, year, type, secondary_types,
                    track_count, status, cached_at
                ) VALUES (
                    ?1, ?2, ?3, 1987, 'Album', '', 10, 'Official',
                    '2026-02-01 12:03:00'
                )
                ",
                params![
                    mbid,
                    format!("{mbid}-release-{index}"),
                    format!("{name} Release {index}")
                ],
            )
            .expect("insert MusicBrainz tool cache release");
        }
    }
}

pub(super) fn insert_musicbrainz_tool_cache_release(
    path: &Path,
    mbid: &str,
    release_mbid: &str,
    title: &str,
    year: i32,
) {
    insert_musicbrainz_tool_cache_typed_release(path, mbid, release_mbid, title, year, "Album", "");
}

pub(super) fn insert_musicbrainz_tool_cache_typed_release(
    path: &Path,
    mbid: &str,
    release_mbid: &str,
    title: &str,
    year: i32,
    primary_type: &str,
    secondary_types: &str,
) {
    let conn = Connection::open(path).expect("open test MusicBrainz cache");
    conn.execute(
        "
        INSERT INTO release_groups (
            artist_mbid, release_mbid, title, year, type, secondary_types,
            track_count, status, cached_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, 10, 'Official', '2026-02-01 12:03:00'
        )
        ",
        params![
            mbid,
            release_mbid,
            title,
            year,
            primary_type,
            secondary_types
        ],
    )
    .expect("insert MusicBrainz tool cache release");
}

pub(super) fn insert_test_album(
    conn: &Connection,
    album_id: &str,
    artist: &str,
    album: &str,
    year: i32,
    total_tracks: i64,
) {
    conn.execute(
        "
        INSERT INTO albums (
            id, import_run_id, album_unique_id, album, album_artist_display,
            canonical_genre, genre_normalized, publisher, year, release_year,
            total_tracks, rated_tracks, rating_completeness, total_seconds,
            loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
        ) VALUES (
            ?1, 1, ?1, ?3, ?2, 'Rock', 'rock', 'Test', ?4, ?4,
            ?5, ?5, 1.0, 2400, 0, 0, 0.0, 80, 100.0
        )
        ",
        params![album_id, artist, album, year, total_tracks],
    )
    .expect("insert test album");
}

pub(super) fn insert_test_artist_info(
    conn: &Connection,
    artist: &str,
    artist_type: &str,
    gender: Option<&str>,
    begin_year: Option<i32>,
    end_year: Option<i32>,
    ended: bool,
) {
    let artist_key = normalize_artist_key(artist);
    let mbid = format!("mbid-{artist_key}");
    let begin_date = begin_year.map(|year| year.to_string());
    let end_date = end_year.map(|year| year.to_string());
    conn.execute(
        "
        INSERT INTO musicbrainz_artist_infos (
            local_artist_key, display_artist, mbid, sort_name, artist_type, gender,
            life_begin_date, life_begin_year, life_end_date, life_end_year,
            life_ended, review_state, source, fetched_at, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            'imported', 'musicbrainz-live', '2026-07-09T00:00:00Z',
            '2026-07-09T00:00:00Z', '2026-07-09T00:00:00Z'
        )
        ",
        params![
            artist_key,
            artist,
            mbid,
            artist_type,
            gender,
            begin_date,
            begin_year,
            end_date,
            end_year,
            if ended { 1 } else { 0 },
        ],
    )
    .expect("insert test artist info");
}

pub(super) fn seeded_file_database(db_path: &Path, album_id: &str, album: &str) -> Connection {
    let conn = Connection::open(db_path).expect("open file database");
    configure(&conn).expect("configure database");
    migrate(&conn).expect("migrate database");
    conn.execute(
        "
        INSERT INTO import_runs (
            source_path, source_size_bytes, started_at, completed_at,
            status, track_rows, album_count, duration_ms
        )
        VALUES ('library.tsv', 123, '2026-07-04T00:00:00Z',
                '2026-07-04T00:00:01Z', 'completed', 1, 1, 1)
        ",
        [],
    )
    .expect("insert import run");
    let import_run_id = conn.last_insert_rowid();
    conn.execute(
        "
        INSERT INTO albums (
            id, import_run_id, album_unique_id, album, album_artist_display,
            canonical_genre, genre_normalized, year, total_tracks,
            rated_tracks, rating_completeness, total_seconds, loved_tracks,
            tmoe_seconds, ae_ratio, effective_album_rating, album_score
        ) VALUES (
            ?1, ?2, ?1, ?3, 'Restore Artist', 'Synthpop', 'synthpop',
            2026, 1, 1, 1.0, 180, 0, 180, 1.0, 100, 10.0
        )
        ",
        params![album_id, import_run_id, album],
    )
    .expect("insert album");
    conn.execute(
        "
        INSERT INTO tracks (
            import_run_id, album_id, album_unique_id, display_artist,
            album_artist_display, album, title, canonical_genre,
            genre_normalized, normalized_rating, year, time_seconds, row_hash
        ) VALUES (
            ?1, ?2, ?2, 'Restore Artist', 'Restore Artist', ?3,
            'Restore Track', 'Synthpop', 'synthpop', 100, 2026, 180, ?4
        )
        ",
        params![import_run_id, album_id, album, format!("{album_id}-hash")],
    )
    .expect("insert track");
    conn
}

pub(super) fn seeded_connection() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    configure(&conn).expect("configure database");
    migrate(&conn).expect("migrate database");
    conn.execute(
        "
        INSERT INTO import_runs (source_path, started_at, status)
        VALUES ('library.tsv', '2026-06-25T00:00:00Z', 'completed')
        ",
        [],
    )
    .expect("insert import run");
    conn.execute(
        "
        INSERT INTO albums (
            id, import_run_id, album_unique_id, album, album_artist_display,
            canonical_genre, genre_normalized, publisher, year, release_year,
            total_tracks, rated_tracks, rating_completeness, total_seconds,
            loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
        ) VALUES (
            'mb:test', 1, 'test', 'Actually', 'Pet Shop Boys',
            'Synthpop', 'synthpop', 'Parlophone', 1987, 1987,
            10, 10, 1.0, 2880, 2, 840, 0.2916, 86, 207.62
        )
        ",
        [],
    )
    .expect("insert album");
    conn.execute(
        "
        INSERT INTO tracks (
            import_run_id, album_id, album_unique_id, display_artist,
            album_artist_display, album, title, canonical_genre, genre_normalized,
            publisher, love, normalized_rating, year, release_year, time_seconds,
            file_path, filename, row_hash
        ) VALUES (
            1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
            'Actually', 'What Have I Done to Deserve This?', 'Synthpop',
            'synthpop', 'Parlophone', 'L', 100, 1987, 1987, 260,
            'D:\\Music\\Pet Shop Boys\\Actually', '02 What Have I Done.mp3', 'hash'
        )
        ",
        [],
    )
    .expect("insert track");
    rebuild_search_indexes(&conn).expect("rebuild search indexes");
    conn
}

pub(super) fn insert_discovery_mixer_fixtures(conn: &Connection) {
    for (album_id, artist, album, year) in [
        ("mix-seed-a", "Seed Artist A", "Mix Seed A", 1981),
        ("mix-seed-b", "Seed Artist B", "Mix Seed B", 1991),
        ("familiar-direct", "Familiar Artist", "Signal", 1982),
        ("familiar-copy", "Familiar Artist", "Signal", 1983),
        ("explore-direct", "Explore Artist", "Unknown Signal", 2025),
        ("cross-candidate", "Cross Artist", "Crossfade", 2004),
        ("second-candidate", "Second Artist", "Second Wave", 1992),
        (
            "seed-artist-extra",
            "Seed Artist A",
            "Should Be Excluded",
            1984,
        ),
    ] {
        insert_test_album(conn, album_id, artist, album, year, 10);
    }
    conn.execute_batch(
        "UPDATE albums SET canonical_genre = 'Seed A', genre_normalized = 'seed-a'
         WHERE id IN ('mix-seed-a', 'seed-artist-extra');
         UPDATE albums SET canonical_genre = 'Seed B', genre_normalized = 'seed-b'
         WHERE id = 'mix-seed-b';
         UPDATE albums SET canonical_genre = 'Candidate', genre_normalized = 'candidate'
         WHERE id IN ('familiar-direct', 'familiar-copy', 'explore-direct',
                      'cross-candidate', 'second-candidate');
         UPDATE albums SET rated_tracks = 10, rating_completeness = 1.0,
                           loved_tracks = 3, album_score = 400.0
         WHERE id IN ('familiar-direct', 'familiar-copy');
         UPDATE albums SET rated_tracks = 0, rating_completeness = 0.0,
                           loved_tracks = 0, album_score = NULL
         WHERE id = 'explore-direct';
         UPDATE albums SET rated_tracks = 5, rating_completeness = 0.5,
                           loved_tracks = 1, album_score = 200.0
         WHERE id = 'cross-candidate';

         INSERT INTO lastfm_album_relationships (
             album_id, album_artist, album_title, state, message,
             fetched_at, expires_at
         ) VALUES
             ('mix-seed-a', 'Seed Artist A', 'Mix Seed A', 'available', '',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z'),
             ('mix-seed-b', 'Seed Artist B', 'Mix Seed B', 'available', '',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z');
         INSERT INTO lastfm_related_albums (
             album_id, rank, candidate_artist_name, candidate_album_title,
             relationship_score, shared_tags_json, fetched_at, expires_at
         ) VALUES
             ('mix-seed-a', 1, 'Familiar Artist', 'Signal', 0.9, '[\"rock\"]',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z'),
             ('mix-seed-a', 2, 'Explore Artist', 'Unknown Signal', 0.9, '[\"rock\"]',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z'),
             ('mix-seed-a', 3, 'Cross Artist', 'Crossfade', 0.6, '[\"pop\"]',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z'),
             ('mix-seed-b', 1, 'Second Artist', 'Second Wave', 0.85, '[\"pop\"]',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z'),
             ('mix-seed-b', 2, 'Cross Artist', 'Crossfade', 0.6, '[\"pop\"]',
              '2026-08-13T08:00:00Z', '2026-09-13T08:00:00Z');",
    )
    .expect("insert mixer fixtures");
}

pub(super) fn test_playlist_plan() -> AiPlaylistPlan {
    let mut request = BrowseRequest::default();
    request.view = "tracks".to_string();
    request.filters.genres = vec!["Synthpop".to_string()];
    request.sort = BrowseSort {
        field: "trackRating".to_string(),
        direction: "desc".to_string(),
    };
    request.limit = 50;
    AiPlaylistPlan {
        prompt: "A short loved synthpop playlist".to_string(),
        name: "Neon Test".to_string(),
        description: "Loved synthpop selected from the local library.".to_string(),
        request,
        strategy: "variety".to_string(),
        target_track_count: 10,
        target_minutes: 45,
        max_tracks_per_artist: 2,
        max_tracks_per_album: 1,
        model: "gpt-5.6-luna".to_string(),
        usage: crate::ai::AiUsage {
            input_tokens: Some(180),
            cached_input_tokens: None,
            output_tokens: Some(45),
        },
    }
}

pub(super) fn test_mixtape(conn: &Connection) -> AiPlaylist {
    let mut playlist = build_playlist(conn, test_playlist_plan()).unwrap();
    let original = playlist.tracks[0].clone();
    for id in 2..=3 {
        let mut track = original.clone();
        track.track_id = id;
        track.filename = Some(format!("track-{id}.mp3"));
        track.title = Some(format!("Track {id}"));
        conn.execute("INSERT INTO tracks (id, import_run_id, album_id, title, display_artist, time_seconds, file_path, filename, row_hash) VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, track.album_id, track.title, track.display_artist, track.seconds, track.file_path, track.filename, format!("hash-{id}")]).unwrap();
        playlist.tracks.push(track);
    }
    playlist.mixtape = Some(serde_json::from_value(serde_json::json!({
        "version": 1, "config": { "briefs": ["Friday night", "Drive home"], "minutes": [45,45], "maxArtist": 3, "maxAlbum": 3, "weights": { "atmosphere": 60, "role": 30, "rating": 10 } },
        "pool": playlist.tracks, "notes": { "1": "Bright synths" }, "assessments": [], "scoredBriefs": null,
        "sides": [[{"trackId":1,"role":"opener","locked":false,"transitionToNext":true},{"trackId":2,"role":"builder","locked":false,"transitionToNext":false}],[{"trackId":3,"role":"closer","locked":true,"transitionToNext":false}]]
    })).unwrap());
    playlist
}
