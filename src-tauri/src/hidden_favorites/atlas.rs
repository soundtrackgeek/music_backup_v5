//! Persisted local atlas; Music Library owns geometry, progress and playlist writes.
use super::{load_entry, reader, row, Entry, JOIN, SELECT};
use crate::sonic::SonicTrack;
use anyhow::{bail, Context, Result};
use music_sonic_core::{atlas, Analysis, Metric, PROFILE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, path::Path, time::Duration};

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AtlasRequest {
    pub action: String,
    pub seed_key: String,
    pub revision: Option<String>,
    pub region_id: Option<String>,
    pub track_keys: Option<Vec<String>>,
    pub name: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AtlasPoint {
    pub track: SonicTrack,
    pub x: f64,
    pub y: f64,
    pub available: bool,
    pub in_history: bool,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AtlasCounts {
    pub owned: usize,
    pub rated: usize,
    pub loved: usize,
    pub absent_from_history: usize,
    pub unavailable: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AtlasRegion {
    pub id: String,
    pub representative_key: String,
    pub label: String,
    pub points: Vec<AtlasPoint>,
    pub counts: AtlasCounts,
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SonicAtlas {
    pub version: String,
    pub profile: String,
    pub revision: String,
    pub generated_at: String,
    pub seed: SonicTrack,
    pub regions: Vec<AtlasRegion>,
    pub counts: AtlasCounts,
    pub history_plays: usize,
    pub history_since: Option<i64>,
    pub message: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct Snapshot {
    atlas: SonicAtlas,
    // Fingerprints bind saved geometry to the recording, vector and metric.
    evidence: Vec<(String, String)>,
    weights: String,
}
fn fingerprint(e: &Entry) -> String {
    let mut h = Sha256::new();
    h.update(e.hash.as_bytes());
    for f in &e.features {
        h.update(f.to_le_bytes());
    }
    format!("{:x}", h.finalize())
}
fn store(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join("sonic-atlas.sqlite3"))?;
    c.busy_timeout(Duration::from_secs(30))?;
    let version: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("Update Music Library to read this sonic atlas store.");
    }
    c.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS atlases(seed_key TEXT PRIMARY KEY,payload TEXT NOT NULL);
        PRAGMA user_version=1;",
    )?;
    Ok(c)
}
fn weights(c: &Connection) -> Result<String> {
    c.query_row(
        "SELECT weights FROM sonic.sonic_profiles WHERE profile=?1",
        [PROFILE],
        |r| r.get(0),
    )
    .map_err(Into::into)
}
fn build(c: &Connection, seed_key: &str) -> Result<Snapshot> {
    let mut seed = load_entry(c, seed_key)?
        .filter(|e| e.fresh() && e.track.filename.to_lowercase().ends_with(".mp3"))
        .context(
            "This track needs current audio analysis. Analyze it in Music Library, then try again.",
        )?;
    let weights = weights(c)?;
    let analysis = Analysis {
        profile: PROFILE.into(),
        features: seed.features.clone(),
        weights: serde_json::from_str(&weights)?,
    };
    let metric =
        Metric::new(&analysis).context("Unsupported atlas metric. Update Music Library.")?;
    let candidates = crate::sonic_index::candidates(
        c,
        &analysis,
        std::slice::from_ref(&analysis.features),
        false,
        4096,
        None,
        &Default::default(),
    )
    .context("The sound index is not ready. Allow Music Library to prepare it, then retry.")?;
    let mut q = c.prepare(&format!("SELECT {SELECT} {JOIN} WHERE s.profile=?1 AND s.track_key IN (SELECT value FROM json_each(?2)) AND lower(t.filename) LIKE '%.mp3'"))?;
    let mut ranked = vec![];
    for e in q.query_map(params![PROFILE, candidates.keys], row)? {
        let mut e = e?;
        if e.track.track_key == seed_key || !e.valid() {
            continue;
        }
        if let Some(distance) = metric.distance(&e.features) {
            e.track.distance = Some(distance);
            ranked.push(e);
        }
    }
    ranked.sort_by(|a, b| {
        a.track
            .distance
            .unwrap()
            .total_cmp(&b.track.distance.unwrap())
            .then(a.track.track_key.cmp(&b.track.track_key))
    });
    let mut hashes = HashSet::from([seed.hash.clone()]);
    seed.track.distance = Some(0.);
    let mut entries = vec![seed];
    for e in ranked {
        if entries.len() == atlas::LIMIT {
            break;
        }
        if !e.hash.is_empty() && !hashes.contains(&e.hash) && e.fresh() {
            hashes.insert(e.hash.clone());
            entries.push(e);
        }
    }
    let features: Vec<_> = entries.iter().map(|e| e.features.clone()).collect();
    let groups = atlas::regions(&analysis, &features).context("Invalid atlas sound data")?;
    let bounds = |dimension: usize| {
        entries
            .iter()
            .map(|e| f64::from(e.features[dimension]))
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
                (lo.min(v), hi.max(v))
            })
    };
    let x = bounds(atlas::BRIGHTNESS);
    let y = bounds(atlas::LEVEL);
    let normalize = |value: f32, (lo, hi): (f64, f64)| {
        if hi - lo < 1e-8 {
            0.5
        } else {
            (f64::from(value) - lo) / (hi - lo)
        }
    };
    let regions = groups
        .into_iter()
        .map(|g| {
            let rep = &entries[g.representative].track;
            AtlasRegion {
                id: rep.track_key.clone(),
                representative_key: rep.track_key.clone(),
                label: format!("Near {}", rep.title),
                counts: AtlasCounts::default(),
                points: g
                    .members
                    .into_iter()
                    .map(|i| AtlasPoint {
                        track: entries[i].track.clone(),
                        x: normalize(entries[i].features[atlas::BRIGHTNESS], x),
                        y: normalize(entries[i].features[atlas::LEVEL], y),
                        available: true,
                        in_history: false,
                    })
                    .collect(),
            }
        })
        .collect();
    Ok(Snapshot {
        atlas: SonicAtlas {
            version: atlas::VERSION.into(),
            profile: PROFILE.into(),
            revision: chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .to_string(),
            generated_at: chrono::Utc::now().to_rfc3339(),
            seed: entries[0].track.clone(),
            regions,
            counts: AtlasCounts::default(),
            history_plays: 0,
            history_since: None,
            message: None,
        },
        evidence: entries
            .iter()
            .map(|e| (e.track.track_key.clone(), fingerprint(e)))
            .collect(),
        weights,
    })
}
fn counts<'a>(points: impl Iterator<Item = &'a AtlasPoint>) -> AtlasCounts {
    let mut c = AtlasCounts::default();
    for p in points {
        if !p.available {
            c.unavailable += 1;
            continue;
        }
        c.owned += 1;
        c.rated += usize::from(p.track.rating.is_some_and(|r| r > 0));
        c.loved += usize::from(p.track.loved);
        c.absent_from_history += usize::from(!p.in_history);
    }
    c
}
fn reconcile(c: &Connection, snapshot: &Snapshot) -> Result<SonicAtlas> {
    if snapshot.atlas.version != atlas::VERSION || snapshot.atlas.profile != PROFILE {
        bail!("This atlas uses an older layout. Rebuild the neighborhood.");
    }
    let metric_current =
        super::has_analysis(c)? && weights(c).ok().as_ref() == Some(&snapshot.weights);
    let mut atlas = snapshot.atlas.clone();
    (atlas.history_plays, atlas.history_since) = c.query_row(
        "SELECT COUNT(*),MIN(played_at) FROM listening_plays",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let mut history = c.prepare_cached("SELECT EXISTS(SELECT 1 FROM listening_identity_links l JOIN listening_plays p ON l.artist_key=p.artist_key AND l.title_key=p.title_key AND l.album_key=p.album_key AND l.path_key=p.path_key WHERE l.track_id=?1)")?;
    for region in &mut atlas.regions {
        for point in &mut region.points {
            let current = load_entry(c, &point.track.track_key)?.filter(|e| {
                metric_current
                    && e.fresh()
                    && snapshot
                        .evidence
                        .iter()
                        .any(|(key, proof)| key == &e.track.track_key && proof == &fingerprint(e))
            });
            point.available = current.is_some();
            if let Some(mut e) = current {
                e.track.distance = point.track.distance;
                point.in_history = history.query_row([e.track.track_id], |r| r.get(0))?;
                point.track = e.track;
                if point.track.track_key == atlas.seed.track_key {
                    atlas.seed = point.track.clone();
                }
            }
        }
        region.counts = counts(region.points.iter());
    }
    atlas.counts = counts(atlas.regions.iter().flat_map(|r| &r.points));
    Ok(atlas)
}
pub(crate) fn operate_at(dir: &Path, request: AtlasRequest) -> Result<SonicAtlas> {
    if !matches!(
        request.action.as_str(),
        "load" | "rebuild" | "save" | "audition"
    ) || request.seed_key.is_empty()
        || request.seed_key.len() > 4096
        || request
            .track_keys
            .as_ref()
            .is_some_and(|k| k.len() > atlas::LIMIT || k.iter().any(|k| k.len() > 4096))
    {
        bail!("Invalid sonic atlas request");
    }
    let writer = crate::db::open_path(&dir.join("music-library.sqlite3"))?;
    if !crate::listening::links_current(&writer)? {
        crate::listening::refresh_links(&writer)?;
    }
    drop(writer);
    let mut s = store(dir)?;
    let tx = s.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let c = reader(dir)?;
    let read = c.unchecked_transaction()?;
    let saved: Option<String> = tx
        .query_row(
            "SELECT payload FROM atlases WHERE seed_key=?1",
            [&request.seed_key],
            |r| r.get(0),
        )
        .optional()?;
    let snapshot: Snapshot = if request.action == "rebuild"
        || saved.is_none() && request.action == "load"
    {
        let snapshot = build(&read, &request.seed_key)?;
        tx.execute("INSERT INTO atlases VALUES(?1,?2) ON CONFLICT(seed_key) DO UPDATE SET payload=excluded.payload", params![request.seed_key,serde_json::to_string(&snapshot)?])?;
        snapshot
    } else {
        serde_json::from_str(
            saved
                .as_deref()
                .context("Open this neighborhood before using it.")?,
        )?
    };
    let mut atlas = reconcile(&read, &snapshot)?;
    if matches!(request.action.as_str(), "save" | "audition") {
        if request.revision.as_deref() != Some(&atlas.revision) {
            bail!("This neighborhood was rebuilt in another app. Reload it before continuing.");
        }
        let region = atlas
            .regions
            .iter()
            .find(|r| Some(r.id.as_str()) == request.region_id.as_deref())
            .context("Choose a sound region")?;
        let keys = request
            .track_keys
            .as_ref()
            .context("Review the region's tracks first")?;
        if keys.is_empty() || keys.iter().collect::<HashSet<_>>().len() != keys.len() {
            bail!("Choose different available tracks");
        }
        let reviewed = keys
            .iter()
            .map(|key| {
                region
                    .points
                    .iter()
                    .find(|p| &p.track.track_key == key && p.available)
                    .map(|p| &p.track)
                    .context("A reviewed recording changed or is unavailable. Reload the region.")
            })
            .collect::<Result<Vec<_>>>()?;
        if request.action == "save" {
            // Aurora can omit locally banned members before their tags reach
            // the catalog. Save only reviewed keys, in the snapshot's order;
            // never add newly eligible members or silently drop a changed key.
            let expected: Vec<_> = region
                .points
                .iter()
                .filter(|p| keys.contains(&p.track.track_key))
                .map(|p| &p.track.track_key)
                .collect();
            if keys.iter().collect::<Vec<_>>() != expected {
                bail!("The region changed. Reload and review its current tracks before saving.");
            }
            let name = request.name.as_deref().unwrap_or("").trim();
            if name.is_empty() || name.chars().count() > 120 {
                bail!("Choose a playlist name of 1–120 characters");
            }
            let tracks: Vec<_> = reviewed.iter().map(|t| serde_json::json!({"id":t.track_id,"filePath":t.file_path,"filename":t.filename})).collect();
            read.commit()?;
            crate::db::playlist_bridge_at(
                dir,
                "playlistAuthor",
                serde_json::json!({"action":"create","name":name,"tracks":tracks}),
            )?;
            atlas.message = Some(format!("Saved {name} in Playlists."));
            tx.commit()?;
            return Ok(atlas);
        }
    }
    read.commit()?;
    tx.commit()?;
    Ok(atlas)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn sonic_atlas(
    app: tauri::AppHandle,
    request: AtlasRequest,
) -> Result<SonicAtlas, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = crate::sonic::directory(&app).map_err(|e| e.to_string())?;
        operate_at(&dir, request).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Opt-in probe of an existing local library; set SONIC_ATLAS_LIVE_DIR"]
    fn live_readonly_neighborhood() {
        let dir = std::env::var("SONIC_ATLAS_LIVE_DIR").expect("Set SONIC_ATLAS_LIVE_DIR");
        // Optional preparation only replaces the disposable derived index;
        // the catalog, saved analysis and source audio stay read-only.
        if std::env::var_os("SONIC_ATLAS_REBUILD_INDEX").is_some() {
            crate::sonic_index::rebuild(
                &Path::new(&dir).join("music-library.sqlite3"),
                &Path::new(&dir).join("music-analysis.sqlite3"),
            )
            .unwrap();
        }
        let c = reader(Path::new(&dir)).unwrap();
        let read = c.unchecked_transaction().unwrap();
        let key: String = read.query_row("SELECT s.track_key FROM tracks t JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename WHERE t.normalized_rating=100 AND COALESCE(t.love,'')<>'B' AND s.profile=?1 LIMIT 1", [PROFILE], |r| r.get(0)).unwrap();
        let start = std::time::Instant::now();
        let snapshot = build(&read, &key).unwrap();
        let first = reconcile(&read, &snapshot).unwrap();
        let first_seconds = start.elapsed().as_secs_f64();
        let start = std::time::Instant::now();
        let next = reconcile(&read, &snapshot).unwrap();
        assert_eq!(first.counts.owned, 180);
        assert_eq!(first.revision, next.revision);
        println!(
            "Sonic atlas live proof: {}",
            serde_json::json!({"seed":first.seed.title,"artist":first.seed.artist,"owned":first.counts.owned,"regions":first.regions.len(),"buildSeconds":first_seconds,"reloadSeconds":start.elapsed().as_secs_f64(),"historyPlays":first.history_plays,"representatives":first.regions.iter().map(|r| &r.label).collect::<Vec<_>>()})
        );
        if let Ok(path) = std::env::var("SONIC_ATLAS_PROBE_OUTPUT") {
            std::fs::write(path, serde_json::to_vec_pretty(&first).unwrap()).unwrap();
        }
    }
    fn fixture() -> tempfile::TempDir {
        let dir = super::super::tests::fixture();
        crate::sonic_index::rebuild(
            &dir.path().join("music-library.sqlite3"),
            &dir.path().join("music-analysis.sqlite3"),
        )
        .unwrap();
        dir
    }
    fn request(dir: &Path, action: &str) -> AtlasRequest {
        AtlasRequest {
            action: action.into(),
            seed_key: music_sonic_core::track_key(&dir.to_string_lossy(), "0.mp3"),
            revision: None,
            region_id: None,
            track_keys: None,
            name: None,
        }
    }
    #[test]
    fn persisted_map_keeps_geometry_and_reconciles_counts_and_freshness() {
        let dir = fixture();
        let first = operate_at(dir.path(), request(dir.path(), "load")).unwrap();
        assert_eq!(first.counts.owned, 27); // changed file, ban, identical audio excluded
        assert_eq!(first.counts.absent_from_history, 27);
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute(
            "UPDATE tracks SET normalized_rating=100,love='L' WHERE filename='20.mp3'",
            [],
        )
        .unwrap();
        let next = operate_at(dir.path(), request(dir.path(), "load")).unwrap();
        assert_eq!(first.revision, next.revision);
        assert_eq!(next.counts.loved, 1);
        assert_eq!(next.counts.rated, first.counts.rated + 1);
        let geometry = |a: &SonicAtlas| {
            a.regions
                .iter()
                .flat_map(|r| {
                    r.points
                        .iter()
                        .map(|p| (r.id.clone(), p.track.track_key.clone(), p.x, p.y))
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(geometry(&first), geometry(&next));
        std::fs::write(dir.path().join("20.mp3"), [9; 257]).unwrap();
        let stale = operate_at(dir.path(), request(dir.path(), "load")).unwrap();
        assert_eq!(stale.counts.unavailable, 1);
        assert_eq!(stale.counts.owned, 26);
        assert_eq!(geometry(&first), geometry(&stale));
    }
    #[test]
    fn reviewed_regions_save_exactly_and_rebuilds_reject_old_actions() {
        let dir = fixture();
        let atlas = operate_at(dir.path(), request(dir.path(), "load")).unwrap();
        let mut save = request(dir.path(), "save");
        save.revision = Some(atlas.revision.clone());
        save.region_id = Some(atlas.regions[0].id.clone());
        save.track_keys = Some(
            atlas.regions[0]
                .points
                .iter()
                .map(|p| p.track.track_key.clone())
                .collect(),
        );
        save.name = Some("Atlas reviewed region".into());
        let saved = operate_at(dir.path(), save.clone()).unwrap();
        assert!(saved.message.unwrap().contains("Saved"));
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        let json: String = c
            .query_row("SELECT playlist_json FROM saved_playlists", [], |r| {
                r.get(0)
            })
            .unwrap();
        let saved: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(
            saved["tracks"].as_array().unwrap().len(),
            save.track_keys.as_ref().unwrap().len()
        );
        let saved_keys: Vec<_> = saved["tracks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| {
                music_sonic_core::track_key(
                    t["filePath"].as_str().unwrap(),
                    t["filename"].as_str().unwrap(),
                )
            })
            .collect();
        assert_eq!(saved_keys, *save.track_keys.as_ref().unwrap());
        // Pending bans can remove members in Aurora before the catalog syncs.
        let mut subset = save.clone();
        subset.track_keys.as_mut().unwrap().pop();
        assert!(operate_at(dir.path(), subset).is_ok());
        let mut invalid = save.clone();
        invalid.track_keys.as_mut().unwrap().reverse();
        assert!(operate_at(dir.path(), invalid).is_err());
        let rebuilt = operate_at(dir.path(), request(dir.path(), "rebuild")).unwrap();
        assert_ne!(atlas.revision, rebuilt.revision);
        assert!(operate_at(dir.path(), save)
            .unwrap_err()
            .to_string()
            .contains("rebuilt"));
    }
    #[test]
    fn stale_recordings_and_metric_changes_cannot_be_auditioned() {
        let dir = fixture();
        let atlas = operate_at(dir.path(), request(dir.path(), "load")).unwrap();
        let mut play = request(dir.path(), "audition");
        play.revision = Some(atlas.revision.clone());
        play.region_id = Some(atlas.regions[0].id.clone());
        play.track_keys = Some(vec![atlas.regions[0].points[0].track.track_key.clone()]);
        operate_at(dir.path(), play.clone()).unwrap();
        let a = crate::sonic::results(dir.path()).unwrap();
        a.execute("UPDATE sonic_profiles SET weights='[]'", [])
            .unwrap();
        let stale = operate_at(dir.path(), request(dir.path(), "load")).unwrap();
        assert_eq!(stale.counts.owned, 0);
        assert!(operate_at(dir.path(), play).is_err());
    }
}
