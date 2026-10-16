//! A single auto-resolve attempt. The UI freezes and processes the batch in order.
use super::*;
use serde::Serialize;

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
pub struct ArtistAutoResolveCandidate {
    pub id: String,
    pub name: String,
    pub disambiguation: Option<String>,
    pub country: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistAutoResolveResult {
    pub artist_id: String,
    pub artist_name: String,
    pub status: String,
    pub message: String,
    pub candidates: Vec<ArtistAutoResolveCandidate>,
}

#[derive(Deserialize)]
struct SearchResponse {
    count: usize,
    artists: Vec<ArtistAutoResolveCandidate>,
}

#[derive(Debug, PartialEq)]
struct ArtistSnapshot {
    name: String,
    disambiguation: Option<String>,
    albums: Vec<String>,
}

// Re-read eligibility inside the write transaction as well as before networking.
// A manual edit, unlink, ignore or split during the request always wins.
fn eligible_artist(conn: &Connection, id: &str) -> Result<Option<ArtistSnapshot>> {
    if artist_link_is_unlinked(conn, id)? {
        return Ok(None);
    }
    if let Some(link) = artist_link_record(conn, id)? {
        if link.ignored || link.mbid.is_some_and(|mbid| !mbid.trim().is_empty()) {
            return Ok(None);
        }
    }
    let has_info_mbid: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM musicbrainz_artist_infos WHERE local_artist_key=?1 AND NULLIF(TRIM(mbid), '') IS NOT NULL)",
        [id], |row| row.get(0),
    )?;
    if has_info_mbid {
        return Ok(None);
    }
    let profile: Option<(String, Option<String>, i64)> = conn
        .query_row(
            "SELECT display_artist, disambiguation,
            (SELECT COUNT(*) FROM artist_identities other WHERE other.name_key=profile.name_key)
         FROM artist_identities profile WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((name, disambiguation, same_name_count)) = profile else {
        return Ok(None);
    };
    if same_name_count != 1
        || name.trim().is_empty()
        || matches!(
            crate::identity::strict_key(&name).as_str(),
            "unknown artist" | "various artists"
        )
    {
        return Ok(None);
    }
    let mut albums: Vec<_> = local_artist_albums(conn, id)?
        .into_iter()
        .map(|album| album.album_id)
        .collect();
    albums.sort();
    Ok((!albums.is_empty()).then_some(ArtistSnapshot {
        name,
        disambiguation,
        albums,
    }))
}

fn exact_match(name: &str, response: &SearchResponse) -> Option<ArtistAutoResolveCandidate> {
    // Never infer uniqueness from a truncated MusicBrainz search page.
    if response.count > response.artists.len() {
        return None;
    }
    let key = crate::identity::strict_key(name);
    let mut exact = response
        .artists
        .iter()
        .filter(|artist| crate::identity::strict_key(&artist.name) == key);
    let candidate = exact.next()?;
    if exact.any(|other| other.id != candidate.id) || required_mbid(Some(&candidate.id)).is_err() {
        return None;
    }
    Some(candidate.clone())
}

fn save_match(
    conn: &mut Connection,
    id: &str,
    snapshot: &ArtistSnapshot,
    candidate: &ArtistAutoResolveCandidate,
    rows: &[RefreshedReleaseGroup],
    payload: &MusicBrainzArtistLookupResponse,
) -> Result<bool> {
    retry_musicbrainz_write(|| {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if eligible_artist(&tx, id)?.as_ref() != Some(snapshot) {
            return Ok(false);
        }
        let now = Utc::now().to_rfc3339();
        replace_refreshed_artist_release_groups(&tx, &candidate.id, rows, &now)?;
        save_artist_info_evidence(
            &tx,
            id,
            &snapshot.name,
            &candidate.id,
            &derive_artist_info(payload),
            &now,
        )?;
        save_refreshed_artist_origin_country(
            &tx,
            id,
            &snapshot.name,
            &candidate.id,
            payload,
            &now,
        )?;
        tx.execute(
            "INSERT INTO musicbrainz_artist_links
                (local_artist_key, display_artist, mbid, canonical_name, match_method, confidence,
                 verification_state, ignored, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'auto-exact-name', 1.0, 'unverified', 0, ?5, ?5)
             ON CONFLICT(local_artist_key) DO UPDATE SET
                display_artist=excluded.display_artist, mbid=excluded.mbid,
                canonical_name=excluded.canonical_name, match_method=excluded.match_method,
                confidence=excluded.confidence, verification_state=excluded.verification_state,
                ignored=0, updated_at=excluded.updated_at",
            params![id, snapshot.name, candidate.id, candidate.name, now],
        )?;
        tx.commit()?;
        Ok(true)
    })
}

#[cfg(not(test))]
pub(crate) fn resolve_for_app(app: &AppHandle, id: &str) -> Result<ArtistAutoResolveResult> {
    let (conn, _) = db::open(app)?;
    let snapshot = eligible_artist(&conn, id)?;
    drop(conn);
    let mut result = ArtistAutoResolveResult {
        artist_id: id.into(), artist_name: snapshot.as_ref().map(|s| s.name.clone()).unwrap_or_default(),
        status: "skipped".into(), candidates: Vec::new(),
        message: "Skipped: already linked, unlinked, ignored, removed, or a split artist requiring manual review.".into(),
    };
    let Some(snapshot) = snapshot else {
        return Ok(result);
    };
    let query = format!(
        "artist:\"{}\"",
        snapshot.name.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let response: SearchResponse = crate::http::musicbrainz()
        .get(MUSICBRAINZ_ARTIST_URL)
        .query("query", &query)
        .query("limit", "100")
        .query("fmt", "json")
        .call()
        .context("Could not search MusicBrainz")?
        .into_json()
        .context("Could not read MusicBrainz artist search")?;
    let matched = exact_match(&snapshot.name, &response);
    result.candidates = response
        .artists
        .into_iter()
        .filter(|artist| required_mbid(Some(&artist.id)).is_ok())
        .take(8)
        .collect();
    let Some(candidate) = matched else {
        result.status = if result.candidates.is_empty() {
            "not-found"
        } else {
            "review"
        }
        .into();
        result.message = if result.candidates.is_empty() {
            "No MusicBrainz match found."
        } else {
            "No unique exact-name match. Review the candidates and set the MBID manually."
        }
        .into();
        return Ok(result);
    };
    result.candidates = vec![candidate.clone()];
    let update = (|| -> Result<bool> {
        let rows =
            fetch_artist_release_groups(&candidate.id, ArtistReleaseGroupScope::AlbumsAndEps)?;
        let payload = fetch_artist_origin(&candidate.id)?;
        let (mut conn, _) = db::open(app)?;
        save_match(&mut conn, id, &snapshot, &candidate, &rows, &payload)
    })();
    match update {
        Ok(true) => {
            result.status = "updated".into();
            result.message = "MBID saved and artist info updated. Match is unverified; use the link to check it.".into();
            if let Err(error) = musicbrainz_sync::sync_for_app(app) {
                result.message.push_str(&format!(" Saved locally, but overlay sync failed: {error}"));
            }
        }
        Ok(false) => result.message = "Skipped because the artist changed during the search. Your latest edits were preserved.".into(),
        Err(error) => {
            result.status = "failed".into();
            result.message = format!("Update failed; no MBID or info was saved: {error}");
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MBID: &str = "11111111-2222-3333-4444-555555555555";
    fn candidate(id: &str, name: &str) -> ArtistAutoResolveCandidate {
        ArtistAutoResolveCandidate {
            id: id.into(),
            name: name.into(),
            disambiguation: None,
            country: None,
        }
    }
    fn connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        db::configure(&conn).unwrap();
        db::migrate(&conn).unwrap();
        conn.execute_batch("INSERT INTO import_runs(id,source_path,started_at,status) VALUES(1,'test','now','completed');
            INSERT INTO albums(id,import_run_id,album,album_artist_display,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio)
            VALUES('album',1,'Example','Example',1,0,0,0,0,0,0);").unwrap();
        conn
    }
    fn payload() -> MusicBrainzArtistLookupResponse {
        serde_json::from_str(r#"{"type":"Group","sort-name":"Example","country":"GB","life-span":{"begin":"1980","ended":false}}"#).unwrap()
    }
    #[test]
    fn only_unique_exact_complete_search_results_are_applied() {
        let mut response = SearchResponse {
            count: 1,
            artists: vec![candidate(MBID, "EXAMPLE")],
        };
        assert!(exact_match("Example", &response).is_some());
        assert!(exact_match("Other Example", &response).is_none());
        response.count = 2;
        assert!(exact_match("Example", &response).is_none());
        response
            .artists
            .push(candidate("22222222-2222-3333-4444-555555555555", "Example"));
        assert!(exact_match("Example", &response).is_none());
        response.artists[1].name = "Other Example".into();
        assert!(exact_match("Example", &response).is_some());
        response.artists[0].id = "bad-id".into();
        assert!(exact_match("Example", &response).is_none());
    }
    #[test]
    fn saves_unverified_link_with_info_and_preserves_manual_country() {
        let mut conn = connection();
        set_artist_origin_country_for_connection(
            &conn,
            MusicBrainzArtistOriginCountryRequest {
                artist_key: "example".into(),
                artist_name: "Example".into(),
                musicbrainz_mbid: None,
                country_code: "NO".into(),
                country_name: Some("Norway".into()),
            },
        )
        .unwrap();
        let snapshot = eligible_artist(&conn, "example").unwrap().unwrap();
        assert!(save_match(
            &mut conn,
            "example",
            &snapshot,
            &candidate(MBID, "Example"),
            &[],
            &payload()
        )
        .unwrap());
        let link = artist_link_record(&conn, "example").unwrap().unwrap();
        assert_eq!(link.verification_state, "unverified");
        assert_eq!(link.mbid.as_deref(), Some(MBID));
        let info: (String, String) = conn
            .query_row(
                "SELECT mbid,artist_type FROM musicbrainz_artist_infos",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(info, (MBID.into(), "Group".into()));
        let country: String = conn
            .query_row(
                "SELECT country_code FROM musicbrainz_artist_origin_countries",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(country, "NO");
        assert!(eligible_artist(&conn, "example").unwrap().is_none());
    }
    #[test]
    fn preserves_concurrent_unlink_ignore_link_and_split() {
        for action in ["unlink", "ignore", "set", "split"] {
            let mut conn = connection();
            let snapshot = eligible_artist(&conn, "example").unwrap().unwrap();
            if action == "split" {
                conn.execute("INSERT INTO artist_identities(id,name_key,display_artist) VALUES('artist:second','example','Example')", []).unwrap();
            } else {
                set_artist_link_for_connection(
                    &conn,
                    MusicBrainzArtistLinkRequest {
                        artist_key: "example".into(),
                        artist_name: "Example".into(),
                        musicbrainz_mbid: Some(MBID.into()),
                        canonical_name: None,
                        action: action.into(),
                    },
                )
                .unwrap();
            }
            assert!(!save_match(
                &mut conn,
                "example",
                &snapshot,
                &candidate(MBID, "Example"),
                &[],
                &payload()
            )
            .unwrap());
            assert_eq!(
                conn.query_row("SELECT COUNT(*) FROM musicbrainz_artist_infos", [], |r| r
                    .get::<_, i64>(
                    0
                ))
                .unwrap(),
                0
            );
        }
    }
    #[test]
    fn failed_save_rolls_back_all_artist_metadata() {
        let mut conn = connection();
        let snapshot = eligible_artist(&conn, "example").unwrap().unwrap();
        conn.execute_batch("CREATE TRIGGER reject_auto_link BEFORE INSERT ON musicbrainz_artist_links BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
        assert!(save_match(
            &mut conn,
            "example",
            &snapshot,
            &candidate(MBID, "Example"),
            &[],
            &payload()
        )
        .is_err());
        for table in [
            "musicbrainz_artist_links",
            "musicbrainz_artist_infos",
            "musicbrainz_artist_origin_countries",
        ] {
            assert_eq!(
                conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                    .unwrap(),
                0
            );
        }
    }
}
