use super::*;

#[derive(Debug, Clone, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewListening {
    pub plays: i64,
    pub matched_plays: i64,
    pub tracks: i64,
    pub top_tracks: Vec<ListeningRow>,
    pub top_albums: Vec<ListeningRow>,
    pub top_artists: Vec<ListeningRow>,
    pub discovery: Option<ListeningRow>,
    pub history_since: Option<i64>,
}

pub(crate) fn summarize(
    conn: &Connection,
    start: i64,
    end: i64,
    highlights: bool,
) -> Result<ReviewListening> {
    let (plays, history_since) = conn.query_row(
        "SELECT COUNT(CASE WHEN played_at>=?1 AND played_at<?2 THEN 1 END),MIN(played_at) FROM listening_plays",
        [start,end], |r| Ok((r.get(0)?,r.get(1)?)))?;
    let (matched_plays, tracks) = conn.query_row(
        &format!(
        "SELECT COUNT(*),COUNT(DISTINCT l.track_id) FROM listening_plays p JOIN {PLAY_LINK_JOIN}
         JOIN tracks t ON t.id=l.track_id WHERE p.played_at>=?1 AND p.played_at<?2"),
        [start, end],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let mut result = ReviewListening {
        plays,
        matched_plays,
        tracks,
        history_since,
        ..Default::default()
    };
    if !highlights || matched_plays == 0 {
        return Ok(result);
    }
    let played = played_cte().replace(
        "p.played_at >= ?1",
        "p.played_at >= ?1 AND p.played_at < ?2",
    );
    let mut statement = conn.prepare(&format!("{played}
        SELECT CAST(t.id AS TEXT),COALESCE(t.title,''),COALESCE(NULLIF(t.display_artist,''),t.album_artist_display,''),
        t.album,t.album_id,t.id,t.normalized_rating,played.plays,played.last_played,NULL
        FROM played JOIN tracks t ON t.id=played.track_id ORDER BY played.plays DESC,played.last_played DESC,t.id LIMIT 10"))?;
    result.top_tracks = statement
        .query_map([start, end], row_from_sql)?
        .collect::<rusqlite::Result<_>>()?;
    let mut statement = conn.prepare(&format!("{played}
        SELECT a.id,COALESCE(a.album,''),COALESCE(a.album_artist_display,''),a.album,a.id,NULL,a.effective_album_rating,
        SUM(played.plays),MAX(played.last_played),NULL FROM played JOIN tracks t ON t.id=played.track_id
        JOIN albums a ON a.id=t.album_id GROUP BY a.id ORDER BY 8 DESC,9 DESC,a.id LIMIT 10"))?;
    result.top_albums = statement
        .query_map([start, end], row_from_sql)?
        .collect::<rusqlite::Result<_>>()?;
    // First-ever matched album listen in the imported history, not the import date or release year.
    let mut statement = conn.prepare(&format!("WITH album_history AS (
        SELECT t.album_id,MIN(p.played_at) first_play,
        SUM(CASE WHEN p.played_at>=?1 AND p.played_at<?2 THEN 1 ELSE 0 END) plays,
        MAX(CASE WHEN p.played_at>=?1 AND p.played_at<?2 THEN p.played_at END) last_play
        FROM listening_plays p JOIN {PLAY_LINK_JOIN} JOIN tracks t ON t.id=l.track_id GROUP BY t.album_id)
        SELECT a.id,COALESCE(a.album,''),COALESCE(a.album_artist_display,''),a.album,a.id,NULL,a.effective_album_rating,
        h.plays,h.last_play,NULL FROM album_history h JOIN albums a ON a.id=h.album_id
        WHERE h.first_play>=?1 AND h.first_play<?2 ORDER BY h.plays DESC,h.last_play DESC,a.id LIMIT 1"))?;
    result.discovery = statement.query_row([start, end], row_from_sql).optional()?;
    let profiles = ArtistProfiles::load(conn)?;
    profiles.attach_rows(conn, &mut result.top_tracks)?;
    profiles.attach_rows(conn, &mut result.top_albums)?;
    if let Some(row) = &mut result.discovery {
        profiles.attach_rows(conn, std::slice::from_mut(row))?;
    }
    result.top_artists = profiles.top_artists_between(conn, start, end, 10)?;
    Ok(result)
}
