//! Optional read-only sonic evidence. An unavailable cache must not prevent
//! Discovery's existing local/provider shelves from opening.
use super::*;
use crate::sonic_albums::DiscoveryMatches;

pub(super) struct SonicEvidence {
    pub matches: DiscoveryMatches,
    pub note: String,
}

fn reader(conn: &Connection) -> Result<Option<Connection>> {
    let Some(path) = conn.path().filter(|path| !path.is_empty()) else {
        return Ok(None);
    };
    let directory = Path::new(path)
        .parent()
        .context("Catalog has no directory")?;
    let cache = directory.join("music-analysis.sqlite3");
    if !cache.is_file() {
        return Ok(None);
    }
    let reader = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )?;
    configure_reader(&reader)?;
    reader.busy_timeout(Duration::from_secs(2))?;
    reader.execute_batch("PRAGMA query_only=ON;")?;
    let mut uri =
        url::Url::from_file_path(&cache).map_err(|_| anyhow!("Analysis cache path is invalid"))?;
    uri.set_query(Some("mode=ro"));
    reader.execute("ATTACH DATABASE ?1 AS sonic", [uri.as_str()])?;
    let version: i64 = reader.pragma_query_value(
        Some(rusqlite::DatabaseName::Attached("sonic")),
        "user_version",
        |row| row.get(0),
    )?;
    if version != 1 {
        bail!("Analysis cache format is unsupported");
    }
    Ok(Some(reader))
}

/// Cheap seed preference only; every chosen seed is subsequently verified.
pub(super) fn bound_anchors(conn: &Connection, ids: &[String]) -> HashSet<String> {
    let read = || -> Result<HashSet<String>> {
        let Some(reader) = reader(conn)? else {
            return Ok(HashSet::new());
        };
        let mut stmt = reader.prepare("SELECT COUNT(s.track_key), COUNT(*) FROM tracks t
            LEFT JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename AND s.profile=?2
            WHERE t.album_id=?1 AND lower(t.filename) LIKE '%.mp3'")?;
        let mut bound = HashSet::new();
        for id in ids {
            let (count, total): (usize, usize) = stmt
                .query_row(params![id, music_sonic_core::PROFILE], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })?;
            if music_sonic_core::album_ready(count, total, 50) {
                bound.insert(id.clone());
            }
        }
        Ok(bound)
    };
    read().unwrap_or_default()
}

pub(super) fn discovery_sonic(
    conn: &Connection,
    seeds: &[String],
    eligible: &HashSet<String>,
) -> SonicEvidence {
    let missing = || {
        SonicEvidence {
        matches: DiscoveryMatches::default(),
        note: "Analyze your favorite albums and more of the library in Tools → Audio analysis, then refresh these suggestions. Sound recommendations need at least 50% of each album's MP3s analyzed.".into(),
    }
    };
    let read = || -> Result<Option<DiscoveryMatches>> {
        // Use a dedicated reader; do not leave attachments on pooled writers.
        let Some(reader) = reader(conn)? else {
            return Ok(None);
        };
        crate::sonic_albums::discovery(&reader, seeds, eligible)
            .map(Some)
            .map_err(|e| anyhow!(e))
    };
    match read() {
        Ok(None) => missing(),
        Ok(Some(matches)) => SonicEvidence {
            note: if matches.ready_seeds.is_empty() {
                missing().note
            } else {
                format!("{} of {} anchors have current sound analysis · at least 50% MP3 coverage per album · up to 12 nearest eligible albums per anchor. Refresh as analysis completes.", matches.ready_seeds.len(), seeds.len())
            },
            matches,
        },
        Err(error) => SonicEvidence {
            matches: DiscoveryMatches::default(),
            note: format!("Sound recommendations are temporarily unavailable: {error}. Existing Last.fm and genre suggestions remain available. Check Audio analysis in Tools and refresh."),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;
    use music_sonic_core::{file_signature, track_key, DIMENSIONS, PROFILE};

    fn fixture() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("music-library.sqlite3");
        seeded_connection()
            .backup(rusqlite::DatabaseName::Main, &path, None)
            .unwrap();
        let conn = Connection::open(path).unwrap();
        configure(&conn).unwrap();
        let cache = crate::sonic::results(dir.path()).unwrap();
        let mut weights = vec![0f32; DIMENSIONS * DIMENSIONS];
        for i in 0..DIMENSIONS {
            weights[i * DIMENSIONS + i] = 1.;
        }
        cache
            .execute(
                "INSERT INTO sonic_profiles VALUES(?1, ?2)",
                params![PROFILE, serde_json::to_string(&weights).unwrap()],
            )
            .unwrap();
        for (id, artist, rated, analyzed, value) in [
            ("seed", "Seed Artist", 6, 6, 0.),
            ("near", "Near Artist", 0, 3, 0.5),
            ("both", "Both Artist", 0, 6, 0.7),
            ("rated", "Rated Artist", 1, 6, 0.01),
            ("same", "Seed Artist", 0, 6, 0.01),
            ("thin", "Thin Artist", 0, 1, 0.01),
            ("stale", "Stale Artist", 0, 6, 0.01),
            ("banned", "Banned Artist", 0, 6, 0.01),
            ("wrong", "Wrong Artist", 0, 6, 0.01),
        ] {
            insert_test_album(&conn, id, artist, id, 2000, 6);
            conn.execute(
                "UPDATE albums SET rated_tracks=?2, rating_completeness=?2/6.0,
                loved_tracks=CASE WHEN id='seed' THEN 1 ELSE 0 END,
                effective_album_rating=CASE WHEN id='seed' THEN 95 ELSE NULL END,
                album_score=CASE WHEN id='seed' THEN 400 ELSE NULL END WHERE id=?1",
                params![id, rated],
            )
            .unwrap();
            for n in 0..6 {
                let filename = format!("{id}-{n}.mp3");
                let audio = dir.path().join(&filename);
                fs::write(&audio, [8; 256]).unwrap();
                conn.execute("INSERT INTO tracks(import_run_id,album_id,album_unique_id,album,album_artist_display,
                    display_artist,title,file_path,filename,row_hash,love) VALUES(1,?1,?1,?1,?2,?2,?3,?4,?3,?3,?5)",
                    params![id, artist, filename, dir.path().to_string_lossy(), if id=="banned" { "B" } else { "" }]).unwrap();
                if n < analyzed {
                    let profile = if id == "wrong" {
                        "old-profile"
                    } else {
                        PROFILE
                    };
                    let mut features = vec![0.; DIMENSIONS];
                    features[0] = value;
                    let (size, modified) = file_signature(&audio).unwrap();
                    cache
                        .execute(
                            "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
                            params![filename, profile, serde_json::to_string(&features).unwrap()],
                        )
                        .unwrap();
                    cache
                        .execute(
                            "INSERT INTO sonic_tracks VALUES(?1,?2,?3,?3,?4,?5,?6,'now')",
                            params![
                                track_key(&dir.path().to_string_lossy(), &filename),
                                dir.path().to_string_lossy(),
                                filename,
                                profile,
                                size as i64,
                                modified
                            ],
                        )
                        .unwrap();
                    if id == "stale" {
                        fs::write(audio, [8; 257]).unwrap();
                    }
                }
            }
        }
        conn.execute_batch("INSERT INTO rating_events(import_run_id,created_at,event_type,album_id,album,album_artist_display,current_rated_tracks,current_rating_completeness)
            VALUES(1,'2026-10-08T10:00:00Z','completed','seed','seed','Seed Artist',6,1.0);
            INSERT INTO lastfm_album_relationships(album_id,album_artist,album_title,state,fetched_at,expires_at)
            VALUES('seed','Seed Artist','seed','available','now','later');
            INSERT INTO lastfm_related_albums(album_id,rank,candidate_artist_name,candidate_album_title,relationship_score,shared_tags_json,fetched_at,expires_at)
            VALUES('seed',1,'Both Artist','both',1.0,'[]','now','later')").unwrap();
        (dir, conn)
    }

    fn snapshot(conn: &Connection, mode: &str) -> DiscoveryRecommendationSnapshot {
        discovery_recommendation_snapshot_with_scope(
            conn,
            &DiscoveryRecommendationSnapshotRequest {
                mode: Some(mode.into()),
            },
            6,
            Some(42),
        )
        .unwrap()
    }

    #[test]
    fn sonic_discovery_requires_unrated_current_coverage_and_keeps_nearest_order() {
        let (_dir, conn) = fixture();
        let result = snapshot(&conn, "sonic");
        assert_eq!(result.mode, "sonic");
        assert_eq!(
            result
                .stories
                .iter()
                .map(|s| s.album_id.as_str())
                .collect::<Vec<_>>(),
            ["near", "both"]
        );
        assert!(result
            .stories
            .iter()
            .all(|s| s.rated_tracks == 0 && s.sonic_distance.is_some()));
        assert!(result.stories[0].evidence.contains("3/6 MP3s analyzed"));
        assert!(result.stories[0].evidence.contains("seed by Seed Artist"));
        assert_eq!(result.sonic_linked_count, 2);
        assert_eq!(result.lastfm_linked_count, 0);
        // A cache read must not attach anything to the reusable catalog writer.
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM pragma_database_list WHERE name='sonic'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        conn.execute(
            "UPDATE albums SET rated_tracks=1,rating_completeness=1.0/6 WHERE id='near'",
            [],
        )
        .unwrap();
        assert_eq!(snapshot(&conn, "sonic").stories.len(), 1);
    }

    #[test]
    fn mixed_discovery_prioritizes_agreement_and_explorer_filters_overlap_correctly() {
        let (_dir, conn) = fixture();
        let result = snapshot(&conn, "played");
        assert_eq!(result.stories[0].album_id, "both");
        assert_eq!(result.stories[0].reason, "Related album");
        assert!(result.stories[0].evidence.contains("Last.fm"));
        assert!(result.stories[0].sonic_distance.is_some());
        assert!(result
            .stories
            .iter()
            .any(|s| s.album_id == "rated" && s.sonic_distance.is_some()));
        let mut request = shelf_explorer_request("recommendations");
        request.mode = Some("played".into());
        request.connection = Some("lastfm".into());
        let provider = discovery_shelf_explorer(&conn, &request).unwrap();
        assert_eq!(provider.total, 1);
        assert_eq!(provider.recommendations[0].album_id, "both");
        request.connection = Some("sonic".into());
        request.limit = Some(1);
        let sound = discovery_shelf_explorer(&conn, &request).unwrap();
        assert_eq!(sound.total, 3);
        assert_eq!(sound.recommendations.len(), 1);
        request.offset = Some(1);
        let next = discovery_shelf_explorer(&conn, &request).unwrap();
        assert_ne!(
            sound.recommendations[0].album_id,
            next.recommendations[0].album_id
        );
        request.mode = Some("sonic".into());
        request.offset = Some(0);
        request.query = Some("Near Artist".into());
        let unrated = discovery_shelf_explorer(&conn, &request).unwrap();
        assert_eq!(unrated.total, 1);
        assert_eq!(unrated.title, "Similar unrated albums");
        assert_eq!(unrated.recommendations[0].rated_tracks, 0);
    }

    #[test]
    fn missing_or_future_analysis_falls_back_without_creating_or_changing_cache() {
        let (dir, conn) = fixture();
        let cache = dir.path().join("music-analysis.sqlite3");
        fs::remove_file(&cache).unwrap();
        assert!(snapshot(&conn, "sonic").stories.is_empty());
        assert!(!cache.exists());
        assert!(!snapshot(&conn, "played").stories.is_empty());
        let db = Connection::open(&cache).unwrap();
        db.execute_batch("PRAGMA user_version=99;").unwrap();
        drop(db);
        let bytes = fs::read(&cache).unwrap();
        let result = snapshot(&conn, "played");
        assert!(result.sonic_note.contains("unsupported"));
        assert_eq!(result.sonic_linked_count, 0);
        assert!(!result.stories.is_empty());
        assert_eq!(fs::read(&cache).unwrap(), bytes);
    }

    #[test]
    fn connection_filter_keeps_sound_from_a_different_anchor() {
        let (_dir, conn) = fixture();
        conn.execute_batch("INSERT INTO rating_events(import_run_id,created_at,event_type,album_id,album,album_artist_display,current_rated_tracks,current_rating_completeness)
            VALUES(1,'2026-10-08T11:00:00Z','completed','mb:test','Actually','Pet Shop Boys',10,1.0);
            INSERT INTO lastfm_album_relationships(album_id,album_artist,album_title,state,fetched_at,expires_at)
            VALUES('mb:test','Pet Shop Boys','Actually','available','now','later');
            INSERT INTO lastfm_related_albums(album_id,rank,candidate_artist_name,candidate_album_title,relationship_score,shared_tags_json,fetched_at,expires_at)
            VALUES('mb:test',1,'Near Artist','near',1.0,'[]','now','later')").unwrap();
        let mut request = shelf_explorer_request("recommendations");
        request.mode = Some("played".into());
        request.connection = Some("sonic".into());
        let result = discovery_shelf_explorer(&conn, &request).unwrap();
        assert_eq!(result.total, 3);
        assert!(result
            .recommendations
            .iter()
            .all(|s| s.sonic_distance.is_some()));
        assert_eq!(
            result
                .recommendations
                .iter()
                .find(|s| s.album_id == "near")
                .unwrap()
                .anchor_album_id,
            "seed"
        );
    }

    #[test]
    fn loved_but_unrated_album_can_anchor_sound_without_inventing_a_score() {
        let (_dir, conn) = fixture();
        conn.execute("UPDATE albums SET rated_tracks=0,rating_completeness=0,effective_album_rating=NULL,album_score=NULL WHERE id='seed'", []).unwrap();
        let result = snapshot(&conn, "sonic");
        assert_eq!(result.stories.len(), 2);
        let anchor = result
            .anchors
            .iter()
            .find(|a| a.album_id == "seed")
            .unwrap();
        assert!(anchor.evidence.contains("no album score yet"));
        assert!(!anchor.signal.contains("Album score"));
    }

    #[test]
    fn sonic_edition_remains_saved_and_old_archives_keep_original_evidence() {
        let (dir, conn) = fixture();
        let today = NaiveDate::from_ymd_opt(2026, 10, 8).unwrap();
        let first = discovery_daily_edition_snapshot(&conn, today, today, false).unwrap();
        assert!(
            first
                .daily_edition
                .recommendation_snapshot
                .sonic_linked_count
                > 0
        );
        for n in 0..6 {
            fs::remove_file(dir.path().join(format!("both-{n}.mp3"))).unwrap();
        }
        let saved = discovery_daily_edition_snapshot(&conn, today, today, false).unwrap();
        assert_eq!(
            serde_json::to_value(&saved.daily_edition).unwrap(),
            serde_json::to_value(&first.daily_edition).unwrap()
        );
        let refreshed = discovery_daily_edition_snapshot(&conn, today, today, true).unwrap();
        assert!(
            refreshed
                .daily_edition
                .recommendation_snapshot
                .sonic_linked_count
                < first
                    .daily_edition
                    .recommendation_snapshot
                    .sonic_linked_count
        );
        let yesterday = today - chrono::Duration::days(1);
        let mut old = serde_json::to_value(first.daily_edition).unwrap();
        old["date"] = json!(yesterday.format("%Y-%m-%d").to_string());
        let recommendation = old["recommendationSnapshot"].as_object_mut().unwrap();
        recommendation.remove("sonicNote");
        recommendation.remove("sonicLinkedCount");
        for story in recommendation["stories"].as_array_mut().unwrap() {
            story.as_object_mut().unwrap().remove("sonicDistance");
        }
        let payload = serde_json::to_string(&old).unwrap();
        conn.execute(
            "INSERT INTO daily_edition_snapshots VALUES(?1,2,?2,'original','original')",
            params![yesterday.format("%Y-%m-%d").to_string(), payload],
        )
        .unwrap();
        let archive = discovery_daily_edition_snapshot(&conn, yesterday, today, false).unwrap();
        assert!(archive.archive.is_archived);
        assert_eq!(
            archive
                .daily_edition
                .recommendation_snapshot
                .sonic_linked_count,
            0
        );
        assert_eq!(
            conn.query_row(
                "SELECT edition_json FROM daily_edition_snapshots WHERE payload_version=2",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            payload
        );
        old["date"] = json!(today.format("%Y-%m-%d").to_string());
        conn.execute("UPDATE daily_edition_snapshots SET payload_version=2,edition_json=?1 WHERE edition_date=?2", params![serde_json::to_string(&old).unwrap(),today.format("%Y-%m-%d").to_string()]).unwrap();
        discovery_daily_edition_snapshot(&conn, today, today, false).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT payload_version FROM daily_edition_snapshots WHERE edition_date=?1",
                [today.format("%Y-%m-%d").to_string()],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            3
        );
    }
}
