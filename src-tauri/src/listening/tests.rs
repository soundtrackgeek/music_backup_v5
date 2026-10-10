use super::*;
use serde_json::json;

const NOW: i64 = 1_790_000_000;
const DAY: i64 = 86_400;

fn catalog() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    crate::db::configure(&conn).expect("configure database");
    crate::db::migrate(&conn).expect("migrate database");
    conn.execute_batch(
        "INSERT INTO import_runs (source_path, started_at, status)
         VALUES ('fixture.tsv', '2026-01-01T00:00:00Z', 'completed');",
    )
    .expect("insert import run");
    conn
}

fn album(conn: &Connection, id: &str, artist: &str, title: &str, rating: i64) {
    conn.execute(
        "INSERT INTO albums (
            id, import_run_id, album, album_artist_display, total_tracks, rated_tracks,
            rating_completeness, total_seconds, loved_tracks, tmoe_seconds, ae_ratio,
            effective_album_rating
         ) VALUES (?1, 1, ?3, ?2, 1, 1, 1.0, 200, 0, 0, 0.0, ?4)",
        params![id, artist, title, rating],
    )
    .expect("insert album");
}

#[allow(clippy::too_many_arguments)]
fn track(
    conn: &Connection,
    id: i64,
    album_id: &str,
    artist: &str,
    album_artist: &str,
    album_title: &str,
    title: &str,
    rating: i64,
    path: (&str, &str),
) {
    conn.execute(
        "INSERT INTO tracks (
            id, import_run_id, album_id, display_artist, album_artist_display, album, title,
            normalized_rating, file_path, filename, row_hash
         ) VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'hash')",
        params![
            id,
            album_id,
            artist,
            album_artist,
            album_title,
            title,
            rating,
            path.0,
            path.1
        ],
    )
    .expect("insert track");
}

fn play(artist: &str, title: &str, album: Option<&str>, played_at: i64) -> PlayInput {
    PlayInput {
        artist: artist.into(),
        title: title.into(),
        album: album.map(Into::into),
        played_at,
        ..PlayInput::default()
    }
}

fn request(list: &str) -> ListeningListRequest {
    ListeningListRequest {
        list: list.into(),
        period_days: None,
        limit: Some(20),
    }
}

fn titles(rows: &[ListeningRow]) -> Vec<(&str, i64)> {
    rows.iter()
        .map(|row| (row.title.as_str(), row.plays))
        .collect()
}

/// Two albums share "Running Up That Hill"; a compilation credits a guest.
fn seeded() -> Connection {
    let conn = catalog();
    album(&conn, "hounds", "Kate Bush", "Hounds of Love", 100);
    album(&conn, "best", "Various Artists", "Best of the 80s", 60);
    album(&conn, "sigur", "Sigur Rós", "Ágætis byrjun", 90);
    track(
        &conn,
        1,
        "hounds",
        "Kate Bush",
        "Kate Bush",
        "Hounds of Love",
        "Running Up That Hill",
        100,
        ("D:/Music/Kate Bush/Hounds", "01.mp3"),
    );
    track(
        &conn,
        2,
        "hounds",
        "Kate Bush",
        "Kate Bush",
        "Hounds of Love",
        "Cloudbusting",
        100,
        ("D:/Music/Kate Bush/Hounds", "02.mp3"),
    );
    track(
        &conn,
        3,
        "best",
        "Kate Bush",
        "Various Artists",
        "Best of the 80s",
        "Running Up That Hill",
        80,
        ("D:/Music/VA/Best", "07.mp3"),
    );
    track(
        &conn,
        4,
        "sigur",
        "Sigur Rós",
        "Sigur Rós",
        "Ágætis byrjun",
        "Svefn-g-englar",
        100,
        ("D:/Music/Sigur Ros", "01.mp3"),
    );
    conn
}

#[test]
fn schema_sixty_three_creates_listening_tables() {
    let conn = catalog();
    assert!(schema_exists(&conn).expect("probe schema"));
}

#[test]
fn inserts_dedupe_within_and_across_sources() {
    let conn = seeded();
    let plays = vec![
        play("Kate Bush", "Running Up That Hill", None, NOW - 100),
        play("Kate Bush", "Running Up That Hill", None, NOW - 100),
        play("Kate Bush", "Running Up That Hill", None, NOW - 50),
        play("", "No artist", None, NOW),
    ];
    let first = insert_plays(&conn, "lastfm", &plays).expect("insert Last.fm plays");
    assert_eq!(
        first,
        InsertSummary {
            inserted: 2,
            duplicates: 1,
            skipped: 1
        },
        "an exact repeat is a duplicate, a later replay is a new play"
    );

    // Aurora reports the same play a few minutes later; Last.fm already has it.
    let aurora = insert_plays(
        &conn,
        "aurora",
        &[
            play(
                "KATE BUSH",
                "Running Up That Hill (2018 Remaster)",
                None,
                NOW - 100 + 240,
            ),
            play("Kate Bush", "Cloudbusting", None, NOW - 10 * DAY),
        ],
    )
    .expect("insert Aurora plays");
    assert_eq!(aurora.inserted, 1);
    assert_eq!(aurora.duplicates, 1);
    assert!(insert_plays(&conn, "spotify", &[]).is_err());
}

#[test]
fn links_prefer_path_then_album_then_own_credit() {
    let conn = seeded();
    insert_plays(
        &conn,
        "lastfm",
        &[
            // No album: the original album credit beats the compilation.
            play("Kate Bush", "Running Up That Hill", None, NOW - 3 * DAY),
            // Album named: the compilation copy is chosen.
            play(
                "Kate Bush",
                "Running Up That Hill",
                Some("Best of the 80s"),
                NOW - 2 * DAY,
            ),
            // Folded accents and a dash variant still match.
            play("Sigur Ros", "Svefn-g-englar", None, NOW - DAY),
            play("Unknown Band", "Not In Library", None, NOW - DAY),
        ],
    )
    .expect("insert plays");
    insert_plays(
        &conn,
        "aurora",
        &[PlayInput {
            file_path: Some("d:\\music\\va\\best\\07.mp3".into()),
            ..play(
                "Kate Bush",
                "Running Up That Hill",
                Some("Hounds of Love"),
                NOW - 30 * DAY,
            )
        }],
    )
    .expect("insert Aurora play");

    assert!(!links_current(&conn).expect("probe links"));
    assert_eq!(refresh_links(&conn).expect("refresh links"), 4);
    assert!(links_current(&conn).expect("probe links"));

    let top = list(&conn, &request("topTracks"), NOW).expect("top tracks");
    let by_id: Vec<(Option<i64>, i64)> = top.iter().map(|row| (row.track_id, row.plays)).collect();
    assert_eq!(by_id, vec![(Some(3), 2), (Some(4), 1), (Some(1), 1)]);

    let unmatched = list(&conn, &request("unmatched"), NOW).expect("unmatched");
    assert_eq!(titles(&unmatched), vec![("Not In Library", 1)]);

    let overview = overview(&conn, NOW).expect("overview");
    assert_eq!(overview.total_plays, 5);
    assert_eq!(overview.matched_plays, 4);
    assert_eq!(overview.played_tracks, 3);
    assert_eq!(overview.plays_last_30_days, 5);
}

#[test]
fn links_go_stale_when_the_catalog_changes() {
    let conn = seeded();
    insert_plays(
        &conn,
        "lastfm",
        &[play("Kate Bush", "Cloudbusting", None, NOW)],
    )
    .expect("insert play");
    refresh_links(&conn).expect("refresh links");
    conn.execute_batch(
        "INSERT INTO import_runs (source_path, started_at, completed_at, status)
         VALUES ('next.tsv', '2026-02-01T00:00:00Z', '2026-02-01T00:01:00Z', 'completed');",
    )
    .expect("record a new import");
    assert!(!links_current(&conn).expect("probe links"));
}

#[test]
fn insight_lists_cover_albums_artists_and_rediscovery() {
    let conn = seeded();
    let four_years_ago = NOW - 4 * 365 * DAY;
    insert_plays(
        &conn,
        "listenbrainz",
        &[
            play("Kate Bush", "Cloudbusting", None, four_years_ago),
            play("Kate Bush", "Cloudbusting", None, four_years_ago + 100),
            play("Kate Bush", "Running Up That Hill", None, NOW - 5 * DAY),
            play("Kate Bush", "Running Up That Hill", None, NOW - 4 * DAY),
            play("Kate Bush", "Running Up That Hill", None, NOW - 400 * DAY),
        ],
    )
    .expect("insert plays");
    refresh_links(&conn).expect("refresh links");

    let rediscover = list(&conn, &request("rediscover"), NOW).expect("rediscover");
    assert_eq!(titles(&rediscover), vec![("Cloudbusting", 2)]);

    let never = list(&conn, &request("neverPlayedFavorites"), NOW).expect("never played");
    assert_eq!(titles(&never), vec![("Svefn-g-englar", 0)]);

    let albums = list(&conn, &request("topAlbums"), NOW).expect("top albums");
    assert_eq!(titles(&albums), vec![("Hounds of Love", 5)]);

    let least = list(&conn, &request("leastPlayedAlbums"), NOW).expect("least played");
    assert_eq!(
        titles(&least),
        vec![("Ágætis byrjun", 0), ("Hounds of Love", 5)]
    );

    let artists = list(&conn, &request("topArtists"), NOW).expect("top artists");
    assert_eq!(titles(&artists), vec![("Kate Bush", 5)]);

    let last_year = ListeningListRequest {
        period_days: Some(30),
        ..request("topTracks")
    };
    let recent_top = list(&conn, &last_year, NOW).expect("period top tracks");
    assert_eq!(titles(&recent_top), vec![("Running Up That Hill", 2)]);

    let recent = list(&conn, &request("recent"), NOW).expect("recent plays");
    assert_eq!(recent.len(), 5);
    assert_eq!(recent[0].source.as_deref(), Some("listenbrainz"));
    assert_eq!(recent[0].track_id, Some(1));

    assert!(list(&conn, &request("everything"), NOW).is_err());
}

#[test]
fn source_configuration_resets_the_cursor_for_a_new_account() {
    let conn = catalog();
    let configure = |username: &str| {
        configure_source(
            &conn,
            &ListeningSourceRequest {
                source: "lastfm".into(),
                username: username.into(),
                token: None,
                clear_token: false,
            },
        )
    };
    configure("listener").expect("configure source");
    conn.execute(
        "UPDATE listening_sources SET newest_played_at = 42 WHERE source = 'lastfm'",
        [],
    )
    .expect("set cursor");
    configure("LISTENER").expect("same account, different case");
    let cursor: Option<i64> = conn
        .query_row(
            "SELECT newest_played_at FROM listening_sources",
            [],
            |row| row.get(0),
        )
        .expect("read cursor");
    assert_eq!(cursor, Some(42));
    configure("someone-else").expect("switch account");
    let cursor: Option<i64> = conn
        .query_row(
            "SELECT newest_played_at FROM listening_sources",
            [],
            |row| row.get(0),
        )
        .expect("read cursor");
    assert_eq!(cursor, None);
    assert!(configure("has space").is_err());
    assert!(sync_source(&conn, "aurora").is_err());
}

#[test]
fn clearing_a_source_removes_only_its_plays() {
    let conn = seeded();
    insert_plays(
        &conn,
        "lastfm",
        &[play("Kate Bush", "Cloudbusting", None, NOW)],
    )
    .unwrap();
    insert_plays(
        &conn,
        "aurora",
        &[play("Kate Bush", "Cloudbusting", None, NOW - DAY)],
    )
    .unwrap();
    clear_source(&conn, "lastfm").expect("clear source");
    let remaining: Vec<String> = conn
        .prepare("SELECT source FROM listening_plays")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(remaining, vec!["aurora".to_string()]);
}

#[test]
fn parses_lastfm_recent_tracks_and_skips_now_playing() {
    let payload = json!({
        "recenttracks": {
            "@attr": { "page": "1", "totalPages": "3", "total": "401" },
            "track": [
                {
                    "@attr": { "nowplaying": "true" },
                    "artist": { "#text": "Kate Bush" },
                    "name": "Cloudbusting",
                    "album": { "#text": "Hounds of Love" }
                },
                {
                    "artist": { "#text": "Kate Bush", "mbid": "" },
                    "name": "Running Up That Hill",
                    "album": { "#text": "" },
                    "mbid": "rec-1",
                    "date": { "uts": "1789990000", "#text": "..." }
                }
            ]
        }
    });
    let (plays, pages) = parse_lastfm_recent(&payload);
    assert_eq!(pages, 3);
    assert_eq!(
        plays,
        vec![PlayInput {
            artist: "Kate Bush".into(),
            title: "Running Up That Hill".into(),
            album: None,
            played_at: 1_789_990_000,
            recording_mbid: Some("rec-1".into()),
            file_path: None,
        }]
    );

    // A single scrobble arrives as an object, not an array.
    let single = json!({ "recenttracks": { "@attr": { "totalPages": "1" }, "track": {
        "artist": { "#text": "Björk" }, "name": "Jóga", "date": { "uts": "10" }
    }}});
    assert_eq!(parse_lastfm_recent(&single).0.len(), 1);
}

#[test]
fn parses_listenbrainz_listens_with_mbid_mapping() {
    let payload = json!({ "payload": { "count": 2, "listens": [
        {
            "listened_at": 1_789_990_000,
            "track_metadata": {
                "artist_name": "Röyksopp",
                "track_name": "Eple",
                "release_name": "Melody A.M.",
                "mbid_mapping": { "recording_mbid": "rec-eple" }
            }
        },
        { "listened_at": 5, "track_metadata": { "track_name": "No artist" } }
    ]}});
    let plays = parse_listenbrainz_listens(&payload);
    assert_eq!(plays.len(), 1);
    assert_eq!(plays[0].album.as_deref(), Some("Melody A.M."));
    assert_eq!(plays[0].recording_mbid.as_deref(), Some("rec-eple"));
}

#[test]
fn bridge_records_plays_with_unix_or_rfc3339_times() {
    let conn = seeded();
    let result = record_bridge_plays(
        &conn,
        json!({ "plays": [
            { "artist": "Kate Bush", "title": "Cloudbusting", "playedAt": 1_789_990_000 },
            { "artist": "Kate Bush", "title": "Running Up That Hill",
              "playedAt": "2026-09-01T10:00:00+02:00",
              "filePath": "D:\\Music\\Kate Bush\\Hounds\\01.mp3" },
            { "artist": "Kate Bush", "title": "Bad time", "playedAt": "yesterday" }
        ]}),
    )
    .expect("record bridge plays");
    assert_eq!(
        result,
        json!({ "inserted": 2, "duplicates": 0, "skipped": 1 })
    );
    let newest: i64 = conn
        .query_row(
            "SELECT newest_played_at FROM listening_sources WHERE source = 'aurora'",
            [],
            |row| row.get(0),
        )
        .expect("read Aurora cursor");
    assert_eq!(newest, 1_789_990_000);
    assert!(record_bridge_plays(&conn, json!({ "plays": "nope" })).is_err());
}
