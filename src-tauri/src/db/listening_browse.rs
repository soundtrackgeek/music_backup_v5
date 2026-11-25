use super::*;
use crate::listening::{self, PLAY_LINK_JOIN};

const COUNT: &str = "COALESCE(history.plays, 0)";
const LAST: &str = "history.last_played";

pub(crate) fn has_filters(filters: &BrowseFilters) -> bool {
    filters.play_count_min.is_some()
        || filters.play_count_max.is_some()
        || filters.last_played_from.is_some()
        || filters.last_played_to.is_some()
        || filters.not_played_within_days.is_some()
}

pub(super) fn has_order(sort: &BrowseSort) -> bool {
    matches!(sort.field.as_str(), "playCount" | "lastPlayed")
}

pub(super) fn requested(request: &BrowseRequest) -> bool {
    request.include_listening_history || has_order(&request.sort) || has_filters(&request.filters)
}

pub(super) fn order_field(field: &str) -> Option<&'static str> {
    match field {
        "playCount" => Some(COUNT),
        "lastPlayed" => Some(LAST),
        _ => None,
    }
}

/// Only identities linked to tracks contribute. Each scrobble counts once,
/// including when an album is reached through several of its tracks.
fn rollup(is_tracks: bool, selected: bool) -> String {
    let (key, tracks) = if is_tracks {
        ("l.track_id", "")
    } else {
        ("ht.album_id", " JOIN tracks ht ON ht.id=l.track_id")
    };
    let scope = if selected {
        format!(" WHERE {key} IN (SELECT value FROM json_each(?1))")
    } else {
        String::new()
    };
    format!(
        "SELECT {key} AS item, COUNT(*) AS plays, MAX(p.played_at) AS last_played
         FROM listening_plays p JOIN {PLAY_LINK_JOIN}{tracks}{scope}
         GROUP BY {key}"
    )
}

pub(crate) fn join(is_tracks: bool, requested: bool) -> String {
    if !requested {
        return String::new();
    }
    let key = if is_tracks { "t.id" } else { "a.id" };
    format!(
        " LEFT JOIN ({}) history ON history.item={key}",
        rollup(is_tracks, false)
    )
}

pub(super) fn add_filters(
    conditions: &mut Vec<String>,
    values: &mut Vec<Value>,
    filters: &BrowseFilters,
    artist_scope: bool,
) {
    let (count, last) = if artist_scope {
        ("COALESCE(play_count, 0)", "last_played")
    } else {
        (COUNT, LAST)
    };
    for (comparison, bound) in [
        (">=", filters.play_count_min),
        ("<=", filters.play_count_max),
    ] {
        if let Some(bound) = bound {
            conditions.push(format!("{count} {comparison} ?"));
            values.push(Value::Integer(bound.max(0)));
        }
    }
    for (comparison, modifier, bound) in [
        (">=", "", &filters.last_played_from),
        ("<", ", '+1 day'", &filters.last_played_to),
    ] {
        if let Some(day) = bound
            .as_deref()
            .filter(|day| NaiveDate::parse_from_str(day, "%Y-%m-%d").is_ok())
        {
            conditions.push(format!("{last} {comparison} unixepoch(?{modifier}, 'utc')"));
            values.push(Value::Text(day.into()));
        }
    }
    if let Some(days) = filters.not_played_within_days {
        conditions.push(format!("({last} IS NULL OR {last} < unixepoch() - ?)"));
        values.push(Value::Integer(i64::from(days) * 86_400));
    }
}

pub(super) fn select_values(joined: bool) -> &'static str {
    if joined {
        ", COALESCE(history.plays, 0), history.last_played"
    } else {
        ", NULL, NULL"
    }
}

/// Plain browsing fetches history for the displayed page only.
pub(super) fn fill_page(conn: &Connection, is_tracks: bool, rows: &mut [BrowseRow]) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let selected = if is_tracks {
        serde_json::to_string(
            &rows
                .iter()
                .filter_map(|row| row.track_id)
                .collect::<Vec<_>>(),
        )?
    } else {
        serde_json::to_string(&rows.iter().map(|row| &row.album_id).collect::<Vec<_>>())?
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT CAST(item AS TEXT), plays, last_played FROM ({})",
        rollup(is_tracks, true),
    ))?;
    let counts = stmt
        .query_map([selected], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?),
            ))
        })?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    for row in rows {
        let (plays, last_played) = counts.get(&row.id).copied().unzip();
        row.play_count = Some(plays.unwrap_or(0));
        row.last_played_at = last_played;
    }
    Ok(())
}

pub(super) fn ensure_links_on(conn: &Connection) -> Result<()> {
    if !links_ready(conn)? {
        listening::refresh_links(conn)?;
    }
    Ok(())
}

pub(crate) fn links_ready(conn: &Connection) -> Result<bool> {
    let has_plays: bool =
        conn.query_row("SELECT EXISTS(SELECT 1 FROM listening_plays)", [], |row| {
            row.get(0)
        })?;
    Ok(!has_plays || listening::links_current(conn)?)
}

/// Keep the link revision and the queried tracks in one read snapshot.
#[cfg(not(test))]
pub(super) fn read<T>(
    app: &AppHandle,
    needed: bool,
    open: impl Fn(&AppHandle) -> Result<(CatalogConnection, PathBuf)>,
    query: impl FnOnce(&Connection) -> Result<T>,
) -> Result<T> {
    if !needed {
        let (conn, _) = open(app)?;
        return query(&conn);
    }
    for _ in 0..3 {
        {
            let (conn, _) = open(app)?;
            let snapshot = conn.unchecked_transaction()?;
            if links_ready(&snapshot)? {
                return query(&snapshot);
            }
        }
        listening::ensure_links(app)?;
    }
    bail!("Listening history is being updated. Try this search again.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::listening::{insert_plays, PlayInput};

    const FIRST_TRACK: &str = "What Have I Done to Deserve This?";

    fn play(title: &str, played_at: i64) -> PlayInput {
        PlayInput {
            artist: "Pet Shop Boys".into(),
            title: title.into(),
            album: Some("Actually".into()),
            played_at,
            ..Default::default()
        }
    }

    #[test]
    fn listening_history_filters_ranks_and_hydrates_tracks_and_albums() {
        let conn = test_support::seeded_connection();
        test_support::insert_test_album(&conn, "unplayed", "Other Artist", "Unplayed", 1990, 1);
        conn.execute_batch(
            "INSERT INTO tracks (import_run_id, album_id, display_artist, album, title, row_hash)
             VALUES (1, 'mb:test', 'Pet Shop Boys', 'Actually', 'It''s a Sin', 'second'),
                    (1, 'unplayed', 'Other Artist', 'Unplayed', 'Unplayed song', 'third');",
        )
        .unwrap();
        let now = Utc::now().timestamp();
        let old = play(FIRST_TRACK, now - 400 * 86_400);
        let recent = play("It's a Sin", now - 86_400);
        insert_plays(&conn, "aurora", &[old.clone(), recent.clone()]).unwrap();
        let duplicate = insert_plays(&conn, "lastfm", &[recent.clone()]).unwrap();
        assert_eq!(duplicate.duplicates, 1);
        ensure_links_on(&conn).unwrap();

        let mut request = BrowseRequest {
            view: "tracks".into(),
            include_listening_history: true,
            sort: BrowseSort {
                field: "lastPlayed".into(),
                direction: "asc".into(),
            },
            ..Default::default()
        };
        let results = search_library(&conn, request.clone(), 50).unwrap();
        assert_eq!(results.total, 3);
        let played: Vec<_> = results
            .rows
            .iter()
            .map(|row| (row.play_count, row.last_played_at))
            .collect();
        assert_eq!(
            played,
            [
                (Some(1), Some(old.played_at)),
                (Some(1), Some(recent.played_at)),
                (Some(0), None)
            ]
        );
        request.sort.direction = "desc".into();
        let newest = search_library(&conn, request.clone(), 50).unwrap();
        assert_eq!(newest.rows[0].last_played_at, Some(recent.played_at));
        assert_eq!(newest.rows[2].last_played_at, None);

        request.filters.play_count_min = Some(1);
        request.filters.not_played_within_days = Some(365);
        let rediscover = search_library(&conn, request.clone(), 50).unwrap();
        assert_eq!(rediscover.total, 1);
        assert_eq!(rediscover.rows[0].title.as_deref(), Some(FIRST_TRACK));
        request.filters = BrowseFilters {
            play_count_max: Some(0),
            ..Default::default()
        };
        let unplayed = search_library(&conn, request, 50).unwrap();
        assert_eq!(unplayed.total, 1);
        assert_eq!(unplayed.rows[0].play_count, Some(0));

        let albums = search_library(
            &conn,
            BrowseRequest {
                include_listening_history: true,
                ..Default::default()
            },
            50,
        )
        .unwrap();
        let album = albums
            .rows
            .iter()
            .find(|row| row.album_id == "mb:test")
            .unwrap();
        assert_eq!(
            (album.play_count, album.last_played_at),
            (Some(2), Some(recent.played_at))
        );
        let date = chrono::DateTime::from_timestamp(recent.played_at, 0)
            .unwrap()
            .with_timezone(&chrono::Local)
            .format("%Y-%m-%d")
            .to_string();
        let filtered = search_library(
            &conn,
            BrowseRequest {
                filters: BrowseFilters {
                    last_played_from: Some(date.clone()),
                    last_played_to: Some(date),
                    ..Default::default()
                },
                ..Default::default()
            },
            50,
        )
        .unwrap();
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.rows[0].album_id, "mb:test");

        let artists = artist_chart(
            &conn,
            ArtistChartRequest {
                metric: "playCount".into(),
                ..Default::default()
            },
            50,
        )
        .unwrap();
        assert_eq!(artists.rows[0].artist_name, "Pet Shop Boys");
        assert_eq!(artists.rows[0].play_count, Some(2));
        assert_eq!(artists.rows[0].last_played_at, Some(recent.played_at));
        let artists = artist_chart(
            &conn,
            ArtistChartRequest {
                filters: BrowseFilters {
                    play_count_min: Some(2),
                    ..Default::default()
                },
                ..Default::default()
            },
            50,
        )
        .unwrap();
        assert_eq!(artists.total, 1);
        assert_eq!(artists.rows[0].play_count, Some(2));
    }

    #[test]
    fn smart_playlist_reevaluates_history_when_a_track_is_played_again() {
        let conn = test_support::seeded_connection();
        let now = Utc::now().timestamp();
        insert_plays(&conn, "aurora", &[play(FIRST_TRACK, now - 400 * 86_400)]).unwrap();

        let saved = playlists::save_smart_playlist_on(
            &conn,
            crate::ai::SaveSmartPlaylistRequest {
                id: None,
                expected_updated_at: None,
                name: "Rediscover".into(),
                request: BrowseRequest {
                    view: "tracks".into(),
                    filters: BrowseFilters {
                        play_count_min: Some(1),
                        not_played_within_days: Some(365),
                        ..Default::default()
                    },
                    ..Default::default()
                },
                settings: crate::ai::SmartPlaylistSettings {
                    track_limit: 10,
                    refresh_policy: "manual".into(),
                    sonic: None,
                    sound_description: None,
                },
            },
        )
        .unwrap();
        assert_eq!(saved.playlist.tracks.len(), 1);

        insert_plays(&conn, "aurora", &[play(FIRST_TRACK, now)]).unwrap();
        let refreshed = playlists::evaluate_smart_playlist(&conn, saved.id).unwrap();
        assert!(refreshed.playlist.tracks.is_empty());
    }
}
