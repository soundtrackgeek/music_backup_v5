//! Music Library owns the shared shelf, model and feedback. Companion apps use
//! the capability-gated bridge rather than maintaining another recommendation DB.
use crate::sonic::SonicTrack;
use anyhow::{bail, Context, Result};
use chrono::{Local, Utc};
use music_sonic_core::{file_is_current, Analysis, Metric, DIMENSIONS, PROFILE};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, time::Duration};
mod taste;

const DAYS: i64 = 90;
const SELECT: &str = "t.id,s.track_key,COALESCE(t.title,''),COALESCE(NULLIF(t.display_artist,''),t.album_artist_display,''),COALESCE(t.album,''),COALESCE(t.album_id,''),COALESCE(t.album_artist_display,''),t.file_path,t.filename,t.canonical_genre,t.normalized_rating,COALESCE(t.time_seconds,0),COALESCE(t.love,''),a.features,s.size,s.modified,s.audio_hash,COALESCE(t.artist_identity_key,lower(t.album_artist_display),'')";
const JOIN: &str = "FROM sonic.sonic_tracks s CROSS JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename JOIN sonic.sonic_audio a ON a.audio_hash=s.audio_hash AND a.profile=s.profile";
const SAMPLE_JOIN: &str = "FROM selected chosen CROSS JOIN tracks t ON t.id=chosen.id CROSS JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename JOIN sonic.sonic_audio a ON a.audio_hash=s.audio_hash AND a.profile=s.profile";

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct HiddenRequest {
    pub action: String,
    pub revision: Option<String>,
    pub track_key: Option<String>,
    pub track_keys: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HiddenSuggestion {
    pub track: SonicTrack,
    pub anchors: Vec<SonicTrack>,
    pub fit: String,
    pub broader: bool,
    pub kept: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HiddenShelf {
    pub revision: String,
    pub generated_at: Option<String>,
    pub profile: String,
    pub model_version: String,
    pub model_auc: Option<f64>,
    pub training_tracks: usize,
    pub validation_tracks: usize,
    pub history_since: Option<i64>,
    pub history_plays: usize,
    pub excluded_days: i64,
    pub note: String,
    pub suggestions: Vec<HiddenSuggestion>,
    pub kept: Vec<SonicTrack>,
    pub message: Option<String>,
}

#[derive(Clone)]
struct Entry {
    track: SonicTrack,
    features: Vec<f32>,
    size: i64,
    modified: String,
    hash: String,
    artist: String,
    banned: bool,
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    let love: String = r.get(12)?;
    let features: String = r.get(13)?;
    Ok(Entry {
        track: SonicTrack {
            track_id: r.get(0)?,
            track_key: r.get(1)?,
            title: r.get(2)?,
            artist: r.get(3)?,
            album: r.get(4)?,
            album_id: r.get(5)?,
            album_artist: r.get(6)?,
            file_path: r.get(7)?,
            filename: r.get(8)?,
            genre: r.get(9)?,
            rating: r.get(10)?,
            seconds: r.get(11)?,
            loved: love == "L",
            distance: None,
        },
        features: serde_json::from_str(&features).unwrap_or_default(),
        size: r.get(14)?,
        modified: r.get(15)?,
        hash: r.get(16)?,
        artist: r.get(17)?,
        banned: love == "B",
    })
}
impl Entry {
    fn valid(&self) -> bool {
        !self.banned
            && self.size >= 0
            && self.features.len() == DIMENSIONS
            && self.features.iter().all(|v| v.is_finite())
    }
    fn fresh(&self) -> bool {
        self.valid()
            && file_is_current(
                &self.track.file_path,
                &self.track.filename,
                self.size as u64,
                &self.modified,
            )
    }
    fn recording(&self) -> String {
        format!(
            "{}|{}|{}",
            self.track.artist.trim().to_lowercase(),
            self.track.title.trim().to_lowercase(),
            self.track.seconds / 2
        )
    }
}

fn store(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join("hidden-favorites.sqlite3"))?;
    c.busy_timeout(Duration::from_secs(30))?;
    let version: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("Update Music Library to read this Hidden favorites store");
    }
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS shelf(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,model TEXT);
        CREATE TABLE IF NOT EXISTS kept(track_key TEXT PRIMARY KEY,payload TEXT NOT NULL,saved_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS dismissed(track_key TEXT PRIMARY KEY,day TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS shelf_audio(track_key TEXT PRIMARY KEY,audio_hash TEXT NOT NULL);
        PRAGMA user_version=1;")?;
    Ok(c)
}
fn reader(dir: &Path) -> Result<Connection> {
    let c = Connection::open_with_flags(
        dir.join("music-library.sqlite3"),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    c.busy_timeout(Duration::from_secs(5))?;
    c.execute_batch("PRAGMA query_only=ON;")?;
    crate::sonic::attach(&c, dir)?;
    Ok(c)
}
fn has_analysis(c: &Connection) -> Result<bool> {
    Ok(c.query_row(
        "SELECT COUNT(*) FROM pragma_database_list WHERE name='sonic'",
        [],
        |r| r.get::<_, i64>(0),
    )? == 1)
}
fn load_entry(c: &Connection, key: &str) -> Result<Option<Entry>> {
    if !has_analysis(c)? {
        return Ok(None);
    }
    Ok(c.query_row(
        &format!("SELECT {SELECT} {JOIN} WHERE s.profile=?1 AND s.track_key=?2"),
        params![PROFILE, key],
        row,
    )
    .optional()?)
}

fn reviewed_entry(c: &Connection, s: &Connection, key: &str) -> Result<Option<Entry>> {
    let expected: Option<String> = s
        .query_row(
            "SELECT audio_hash FROM shelf_audio WHERE track_key=?1",
            [key],
            |r| r.get(0),
        )
        .optional()?;
    Ok(load_entry(c, key)?.filter(|e| e.fresh() && expected.as_deref() == Some(&e.hash)))
}

fn recent(c: &Connection, now: i64) -> Result<HashSet<i64>> {
    let mut q = c.prepare("SELECT DISTINCT l.track_id FROM listening_plays p JOIN listening_identity_links l
        ON l.artist_key=p.artist_key AND l.title_key=p.title_key AND l.album_key=p.album_key AND l.path_key=p.path_key WHERE p.played_at>=?1")?;
    let rows = q
        .query_map([now - DAYS * 86400], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}
fn excluded(s: &Connection) -> Result<HashSet<String>> {
    let mut q =
        s.prepare("SELECT track_key FROM kept UNION SELECT track_key FROM dismissed WHERE day=?1")?;
    let rows = q
        .query_map([Local::now().date_naive().to_string()], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

fn recent_hashes(c: &Connection, ids: &HashSet<i64>) -> Result<HashSet<String>> {
    if !has_analysis(c)? || ids.is_empty() {
        return Ok(HashSet::new());
    }
    let mut q=c.prepare("SELECT DISTINCT s.audio_hash FROM tracks t JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename WHERE s.profile=?1 AND t.id IN (SELECT value FROM json_each(?2))")?;
    let rows = q
        .query_map(params![PROFILE, serde_json::to_string(ids)?], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

fn build(
    c: &Connection,
    s: &Connection,
    rotation: u64,
) -> Result<(HiddenShelf, Option<taste::Model>)> {
    build_indexed(c, s, rotation, true)
}
fn build_indexed(
    c: &Connection,
    s: &Connection,
    rotation: u64,
    indexed: bool,
) -> Result<(HiddenShelf, Option<taste::Model>)> {
    let mut shelf = HiddenShelf {
        revision: format!("{}-{rotation}", Utc::now().timestamp_micros()),
        generated_at: Some(Utc::now().to_rfc3339()),
        profile: PROFILE.into(),
        model_version: taste::VERSION.into(),
        excluded_days: DAYS,
        ..Default::default()
    };
    (shelf.history_plays, shelf.history_since) = c.query_row(
        "SELECT COUNT(*),MIN(played_at) FROM listening_plays",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    if !has_analysis(c)? {
        shelf.note = "Analyze favorite tracks and more of your library in Tools → Audio analysis, then refresh.".into();
        return Ok((shelf, None));
    }
    let weights: Option<String> = c
        .query_row(
            "SELECT weights FROM sonic.sonic_profiles WHERE profile=?1",
            [PROFILE],
            |r| r.get(0),
        )
        .optional()?;
    let Some(weights) = weights.and_then(|w| serde_json::from_str::<Vec<f32>>(&w).ok()) else {
        shelf.note =
            "Current sound analysis is not ready. Continue Audio analysis, then refresh.".into();
        return Ok((shelf, None));
    };
    let analysis = Analysis {
        profile: PROFILE.into(),
        features: vec![0.; DIMENSIONS],
        weights,
    };
    Metric::new(&analysis).context("Unsupported sound-analysis metric")?;
    let recent = recent(c, Utc::now().timestamp())?;
    let recent_audio = recent_hashes(c, &recent)?;
    let excluded = excluded(s)?;
    // One bounded, deterministic sample across the catalog, rather than the first
    // artists alphabetically. Four-star labels are deliberately not negatives.
    let mut q = c.prepare(&format!("WITH selected AS MATERIALIZED (SELECT id FROM tracks WHERE lower(filename) LIKE '%.mp3' AND COALESCE(love,'')!='B' AND (normalized_rating=100 OR normalized_rating BETWEEN 1 AND 60 OR love='L') ORDER BY (id*1103515245+12345)%2147483647 LIMIT 20000) SELECT {SELECT} {SAMPLE_JOIN} WHERE s.profile=?1"))?;
    let examples = q
        .query_map([PROFILE], row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let training: Vec<_> = examples
        .iter()
        .filter(|e| {
            e.valid()
                && (e.track.rating == Some(100)
                    || e.track.rating.is_some_and(|r| (1..=60).contains(&r)))
        })
        .map(|e| taste::Example {
            features: e.features.clone(),
            positive: e.track.rating == Some(100),
            artist: e.artist.clone(),
        })
        .collect();
    let model = taste::train(&training);
    if let Some(m) = &model {
        shelf.model_auc = Some(m.auc);
        shelf.training_tracks = m.training;
        shelf.validation_tracks = m.validation;
    }
    let mut favorites: Vec<_> = examples
        .into_iter()
        .filter(|e| (e.track.rating == Some(100) || e.track.loved) && e.valid())
        .collect();
    favorites.sort_by_key(|e| taste::hash(&format!("{rotation}:{}", e.track.track_key)));
    let mut artists = HashSet::new();
    let mut hashes = HashSet::new();
    let anchors: Vec<_> = favorites
        .into_iter()
        .filter(|e| {
            if artists.contains(&e.artist) || hashes.contains(&e.hash) || !e.fresh() {
                return false;
            }
            artists.insert(e.artist.clone());
            hashes.insert(e.hash.clone());
            true
        })
        .take(8)
        .collect();
    if anchors.len() < 2 {
        shelf.note = "Analyze five-star or loved tracks by at least two album artists to build Hidden favorites.".into();
        return Ok((shelf, model));
    }
    let favorite_keys: HashSet<_> = anchors.iter().map(|e| e.track.track_key.clone()).collect();
    let favorite_hashes: HashSet<_> = anchors.iter().map(|e| e.hash.clone()).collect();
    let targets: Vec<_> = anchors.iter().map(|e| e.features.clone()).collect();
    let metrics: Vec<_> = targets
        .iter()
        .map(|features| {
            Metric::new(&Analysis {
                features: features.clone(),
                ..analysis.clone()
            })
            .unwrap()
        })
        .collect();
    let candidates = if indexed {
        crate::sonic_index::candidates(c, &analysis, &targets, false, 512, None, &HashSet::new())
    } else {
        None
    };
    let indexed_union = if candidates.is_some() {
        " UNION SELECT t.id FROM sonic.sonic_tracks s CROSS JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename WHERE s.profile=?1 AND s.track_key IN (SELECT value FROM json_each(?3))"
    } else {
        ""
    };
    let mut q = c.prepare(&format!("WITH broad AS MATERIALIZED (SELECT id FROM tracks WHERE lower(filename) LIKE '%.mp3' AND COALESCE(love,'')!='B' AND (COALESCE(normalized_rating,0)=0 OR normalized_rating>=80) ORDER BY (id*1103515245+?2)%2147483647 LIMIT 12000), selected AS MATERIALIZED (SELECT id FROM broad {indexed_union}) SELECT {SELECT} {SAMPLE_JOIN} WHERE s.profile=?1 AND COALESCE(t.love,'')!='B' AND (COALESCE(t.normalized_rating,0)=0 OR t.normalized_rating>=80)"))?;
    let mut values = vec![
        rusqlite::types::Value::Text(PROFILE.into()),
        ((rotation % 2147483647) as i64).into(),
    ];
    if let Some(candidates) = candidates {
        values.push(candidates.keys.into());
    }
    let mut ranked = Vec::new();
    let mut broader = Vec::new();
    for entry in q.query_map(rusqlite::params_from_iter(values), row)? {
        let e = entry?;
        if !e.valid()
            || recent.contains(&e.track.track_id)
            || recent_audio.contains(&e.hash)
            || excluded.contains(&e.track.track_key)
            || favorite_keys.contains(&e.track.track_key)
            || favorite_hashes.contains(&e.hash)
        {
            continue;
        }
        let mut distances: Vec<_> = metrics
            .iter()
            .enumerate()
            .filter_map(|(i, m)| m.distance(&e.features).map(|d| (d, i)))
            .collect();
        distances.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        if distances.len() < 2 {
            continue;
        }
        let fit = model.as_ref().map(|m| m.score(&e.features));
        let score = fit.unwrap_or(0.5) * 0.65 + 0.35 / (1. + distances[0].0 + distances[1].0);
        let exploration = taste::hash(&format!("{rotation}:{}", e.hash));
        broader.push((exploration, e.clone(), distances.clone(), fit));
        ranked.push((score, e, distances, fit));
        if ranked.len() >= 2048 {
            ranked.sort_by(|a, b| {
                b.0.total_cmp(&a.0)
                    .then(a.1.track.track_key.cmp(&b.1.track.track_key))
            });
            ranked.truncate(512);
        }
        if broader.len() >= 1024 {
            broader.sort_by_key(|e| e.0);
            broader.truncate(128);
        }
    }
    ranked.sort_by(|a, b| {
        b.0.total_cmp(&a.0)
            .then(a.1.track.track_key.cmp(&b.1.track.track_key))
    });
    broader.sort_by_key(|e| e.0);
    let mut used_artists = HashSet::new();
    let mut used_albums = HashSet::new();
    let mut used_hashes = HashSet::new();
    let mut used_recordings = HashSet::new();
    let mut represented = HashSet::new();
    let mut accept = |e: &Entry,
                      distances: &[(f64, usize)],
                      fit: Option<f64>,
                      broad: bool|
     -> Option<HiddenSuggestion> {
        if used_artists.contains(&e.artist)
            || used_albums.contains(&e.track.album_id)
            || used_hashes.contains(&e.hash)
            || used_recordings.contains(&e.recording())
            || !e.fresh()
        {
            return None;
        }
        used_artists.insert(e.artist.clone());
        used_albums.insert(e.track.album_id.clone());
        used_hashes.insert(e.hash.clone());
        used_recordings.insert(e.recording());
        let mut track = e.track.clone();
        track.distance = Some(distances[0].0);
        Some(HiddenSuggestion {
            track,
            anchors: distances
                .iter()
                .take(2)
                .map(|(_, i)| anchors[*i].track.clone())
                .collect(),
            fit: fit
                .map(|s| {
                    if s >= 0.65 {
                        "Strong fit"
                    } else if s >= 0.4 {
                        "Possible fit"
                    } else {
                        "Stretch"
                    }
                })
                .unwrap_or("Favorite neighbors")
                .into(),
            broader: broad,
            kept: false,
        })
    };
    // Cover different anchors first, then fill remaining fit slots.
    for diverse in [true, false] {
        for (_, e, distances, fit) in &ranked {
            if shelf.suggestions.len() >= 4 {
                break;
            }
            if diverse && represented.contains(&distances[0].1) {
                continue;
            }
            if let Some(item) = accept(e, distances, *fit, false) {
                represented.insert(distances[0].1);
                shelf.suggestions.push(item);
            }
        }
    }
    for (_, e, distances, fit) in &broader {
        if let Some(item) = accept(e, distances, *fit, true) {
            shelf.suggestions.push(item);
            break;
        }
    }
    shelf.note = if model.is_some() { "Ranked with your five-star versus one-to-three-star sound evidence; four-star ratings are not negative labels. Fit labels are experimental ranking bands, not predicted ratings." } else { "Using sound neighborhoods around several favorites. There is not enough useful artist-held-out rating evidence for a taste model yet." }.into();
    if shelf.suggestions.is_empty() {
        shelf.note.push_str(" No eligible tracks found. Analyze more music or try again after today's dismissals expire.");
    }
    Ok((shelf, model))
}

fn current_shelf(c: &Connection, s: &Connection, mut shelf: HiddenShelf) -> Result<HiddenShelf> {
    let recent = recent(c, Utc::now().timestamp())?;
    let recent_audio = recent_hashes(c, &recent)?;
    (shelf.history_plays, shelf.history_since) = c.query_row(
        "SELECT COUNT(*),MIN(played_at) FROM listening_plays",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let today = Local::now().date_naive().to_string();
    let mut q = s.prepare("SELECT track_key FROM dismissed WHERE day=?1")?;
    let dismissed: HashSet<String> = q
        .query_map([today], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    let mut q = s.prepare("SELECT track_key,payload FROM kept ORDER BY saved_at,track_key")?;
    let kept: Vec<(String, String)> = q
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let kept_keys: HashSet<_> = kept.iter().map(|(key, _)| key.clone()).collect();
    shelf.kept.clear();
    for (key, payload) in kept {
        let proof: serde_json::Value = serde_json::from_str(&payload)?;
        if let Some(e) = load_entry(c, &key)?
            .filter(|e| e.fresh() && proof["audioHash"].as_str() == Some(&e.hash))
        {
            shelf.kept.push(e.track);
        }
    }
    let mut suggestions = Vec::new();
    for mut item in shelf.suggestions {
        if dismissed.contains(&item.track.track_key) {
            continue;
        }
        let Some(e) = reviewed_entry(c, s, &item.track.track_key)? else {
            continue;
        };
        if recent.contains(&e.track.track_id)
            || recent_audio.contains(&e.hash)
            || e.track.rating.is_some_and(|r| r > 0 && r < 80)
        {
            continue;
        }
        item.track = e.track;
        item.kept = kept_keys.contains(&item.track.track_key);
        // Do not retain explanations naming deleted, banned or stale anchors.
        let mut anchors = Vec::new();
        for anchor in item.anchors {
            if let Some(e) = reviewed_entry(c, s, &anchor.track_key)?
                .filter(|e| e.track.loved || e.track.rating == Some(100))
            {
                anchors.push(e.track);
            }
        }
        if anchors.len() < 2 {
            continue;
        }
        item.anchors = anchors;
        suggestions.push(item);
    }
    shelf.suggestions = suggestions;
    Ok(shelf)
}

pub(crate) fn operate_at(dir: &Path, request: HiddenRequest) -> Result<HiddenShelf> {
    if !matches!(
        request.action.as_str(),
        "load" | "refresh" | "keep" | "dismiss" | "remove" | "save"
    ) {
        bail!("Unknown Hidden favorites action");
    }
    // Refresh identity links before opening the read snapshot. This is the same
    // reviewed identity resolver used by Listening, not a title-only join.
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
        .query_row("SELECT payload FROM shelf WHERE id=1", [], |r| r.get(0))
        .optional()?;
    let mut shelf: HiddenShelf = saved
        .map(|v| serde_json::from_str(&v))
        .transpose()?
        .unwrap_or(HiddenShelf {
            profile: PROFILE.into(),
            excluded_days: DAYS,
            note: "Five tracks from the collection you already own. Find favorites to begin."
                .into(),
            ..Default::default()
        });
    if request.action == "refresh" {
        let rotation = Utc::now().timestamp_micros() as u64;
        let (next, model) = build(&read, &tx, rotation)?;
        shelf = next;
        tx.execute("DELETE FROM shelf_audio", [])?;
        for item in &shelf.suggestions {
            for track in std::iter::once(&item.track).chain(item.anchors.iter()) {
                let entry = load_entry(&read, &track.track_key)?
                    .context("Selected sound analysis changed. Find favorites again.")?;
                tx.execute(
                    "INSERT OR REPLACE INTO shelf_audio VALUES(?1,?2)",
                    params![track.track_key, entry.hash],
                )?;
            }
        }
        tx.execute("INSERT INTO shelf VALUES(1,?1,?2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,model=excluded.model",params![serde_json::to_string(&shelf)?, model.map(|m|serde_json::to_string(&m)).transpose()?])?;
        tx.execute(
            "DELETE FROM dismissed WHERE day<>?1",
            [Local::now().date_naive().to_string()],
        )?;
    } else if request.action != "load" {
        if request.revision.as_deref() != Some(&shelf.revision) {
            bail!(
                "This shelf changed in another app. Reload Hidden favorites before making changes."
            );
        }
        shelf = current_shelf(&read, &tx, shelf)?;
        if request.action == "save" {
            let keys = request
                .track_keys
                .as_ref()
                .context("Reload the kept shortlist before saving")?;
            if keys.is_empty()
                || keys.len() > 200
                || keys.iter().collect::<HashSet<_>>().len() != keys.len()
            {
                bail!("Choose 1–200 different kept tracks");
            }
            let mut reviewed = Vec::new();
            for key in keys {
                reviewed.push(
                    shelf
                        .kept
                        .iter()
                        .find(|t| &t.track_key == key)
                        .context("The kept shortlist changed. Reload before saving.")?
                        .clone(),
                );
            }
            shelf.kept = reviewed;
            let tracks:Vec<_>=shelf.kept.iter().map(|t|serde_json::json!({"id":t.track_id,"filePath":t.file_path,"filename":t.filename})).collect();
            // End the read transaction before using the existing catalog writer.
            read.commit()?;
            let result = crate::db::playlist_bridge_at(
                dir,
                "playlistAuthor",
                serde_json::json!({"action":"create","name":"Hidden favorites — kept for later","tracks":tracks}),
            )?;
            shelf.message = Some(format!(
                "Saved Hidden favorites — kept for later in Playlists ({}).",
                result["id"]
            ));
            tx.commit()?;
            return Ok(shelf);
        }
        let key = request.track_key.as_deref().context("Choose a track")?;
        if key.len() > 4096 {
            bail!("Invalid track identity");
        }
        if request.action == "remove" {
            tx.execute("DELETE FROM kept WHERE track_key=?1", [key])?;
        } else {
            let item = shelf
                .suggestions
                .iter()
                .find(|i| i.track.track_key == key)
                .context("This track is no longer on the shelf. Reload Hidden favorites.")?;
            if request.action == "keep" {
                let count: i64 = tx.query_row("SELECT COUNT(*) FROM kept", [], |r| r.get(0))?;
                if count >= 200 && !item.kept {
                    bail!("Save the kept tracks as a playlist and remove some before keeping more (200-track limit).");
                }
                let entry = reviewed_entry(&read, &tx, key)?
                    .context("This recording changed. Reload before keeping it.")?;
                tx.execute(
                    "INSERT OR IGNORE INTO kept VALUES(?1,?2,?3)",
                    params![
                        key,
                        serde_json::to_string(
                            &serde_json::json!({"track":item.track,"audioHash":entry.hash})
                        )?,
                        Utc::now().to_rfc3339()
                    ],
                )?;
            } else {
                tx.execute("INSERT INTO dismissed VALUES(?1,?2) ON CONFLICT(track_key) DO UPDATE SET day=excluded.day",params![key,Local::now().date_naive().to_string()])?;
            }
        }
    }
    shelf = current_shelf(&read, &tx, shelf)?;
    read.commit()?;
    tx.commit()?;
    Ok(shelf)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn hidden_favorites(
    app: tauri::AppHandle,
    request: HiddenRequest,
) -> Result<HiddenShelf, String> {
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
    use music_sonic_core::{file_signature, track_key};
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("INSERT INTO import_runs(source_path,started_at,status) VALUES('fixture','now','completed')",[]).unwrap();
        let analysis = crate::sonic::results(dir.path()).unwrap();
        let mut weights = vec![0f32; DIMENSIONS * DIMENSIONS];
        for i in 0..DIMENSIONS {
            weights[i * DIMENSIONS + i] = 1.;
        }
        analysis
            .execute(
                "INSERT INTO sonic_profiles VALUES(?1,?2)",
                params![PROFILE, serde_json::to_string(&weights).unwrap()],
            )
            .unwrap();
        for id in 0..30 {
            let name = format!("{id}.mp3");
            let artist = format!("artist-{id}");
            std::fs::write(dir.path().join(&name), [8; 256]).unwrap();
            c.execute("INSERT INTO albums(id,import_run_id,album_unique_id,album,album_artist_display,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio) VALUES(?1,1,?1,?1,?2,1,0,0,180,0,0,0)",params![id.to_string(),artist]).unwrap();
            c.execute("INSERT INTO tracks(id,import_run_id,album_id,album_unique_id,album,album_artist_display,display_artist,title,file_path,filename,row_hash,normalized_rating,love,time_seconds) VALUES(?1,1,?2,?2,?2,?3,?3,?4,?5,?4,?4,?6,?7,180)",params![id+1,id.to_string(),artist,name,dir.path().to_string_lossy(),if id<12 {Some(100)} else if id==14 {Some(40)} else {None},if id==15 {"B"} else {""}]).unwrap();
            let mut features = vec![0f32; DIMENSIONS];
            features[0] = id as f32 / 20.;
            let hash = if id == 10 {
                "hash-2".into()
            } else {
                format!("hash-{id}")
            };
            analysis
                .execute(
                    "INSERT OR IGNORE INTO sonic_audio VALUES(?1,?2,?3)",
                    params![hash, PROFILE, serde_json::to_string(&features).unwrap()],
                )
                .unwrap();
            let (size, modified) = file_signature(&dir.path().join(&name)).unwrap();
            analysis
                .execute(
                    "INSERT INTO sonic_tracks VALUES(?1,?2,?3,?4,?5,?6,?7,'now')",
                    params![
                        track_key(&dir.path().to_string_lossy(), &name),
                        dir.path().to_string_lossy(),
                        name,
                        hash,
                        PROFILE,
                        size as i64,
                        modified
                    ],
                )
                .unwrap();
        }
        std::fs::write(dir.path().join("13.mp3"), [8; 257]).unwrap();
        dir
    }
    fn request(action: &str, shelf: Option<&HiddenShelf>, key: Option<&str>) -> HiddenRequest {
        HiddenRequest {
            action: action.into(),
            revision: shelf.map(|s| s.revision.clone()),
            track_key: key.map(str::to_owned),
            track_keys: None,
        }
    }
    #[test]
    fn shelf_is_diverse_fresh_and_includes_rated_rediscovery() {
        let dir = fixture();
        let c = reader(dir.path()).unwrap();
        let s = store(dir.path()).unwrap();
        let (shelf, model) = build(&c, &s, 42).unwrap();
        assert!(model.is_none());
        assert_eq!(shelf.suggestions.len(), 5);
        assert_eq!(shelf.suggestions.iter().filter(|s| s.broader).count(), 1);
        let artists: HashSet<_> = shelf
            .suggestions
            .iter()
            .map(|s| &s.track.album_artist)
            .collect();
        assert_eq!(artists.len(), 5);
        assert!(shelf
            .suggestions
            .iter()
            .all(|s| !matches!(s.track.track_id, 14..=16) && s.anchors.len() == 2));
        let hashes: HashSet<_> = shelf
            .suggestions
            .iter()
            .map(|s| load_entry(&c, &s.track.track_key).unwrap().unwrap().hash)
            .collect();
        assert_eq!(hashes.len(), 5);
        assert!(shelf.note.contains("not enough"));
        assert!(shelf
            .suggestions
            .iter()
            .any(|s| s.track.rating == Some(100)));
        // Four/five-star candidates are eligible; Hidden favorites is not an unrated filter.
        assert!(c
            .query_row(
                &format!("SELECT {SELECT} {JOIN} WHERE t.id=4 AND s.profile=?1"),
                [PROFILE],
                row
            )
            .unwrap()
            .fresh());
    }
    #[test]
    fn saved_shelf_feedback_and_reviewed_playlist_survive_reopen_and_reject_stale_actions() {
        let dir = fixture();
        let shelf = operate_at(dir.path(), request("refresh", None, None)).unwrap();
        let key = &shelf.suggestions[0].track.track_key;
        let kept = operate_at(dir.path(), request("keep", Some(&shelf), Some(key))).unwrap();
        assert_eq!(kept.kept.len(), 1);
        let reloaded = operate_at(dir.path(), request("load", None, None)).unwrap();
        assert_eq!(reloaded.revision, shelf.revision);
        assert_eq!(reloaded.kept.len(), 1);
        assert!(
            reloaded
                .suggestions
                .iter()
                .find(|s| s.track.track_key == *key)
                .unwrap()
                .kept
        );
        let mut save = request("save", Some(&shelf), None);
        save.track_keys = Some(vec![key.clone()]);
        let saved = operate_at(dir.path(), save).unwrap();
        assert!(saved.message.unwrap().contains("Playlists"));
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        let json: String = c
            .query_row("SELECT playlist_json FROM saved_playlists", [], |r| {
                r.get(0)
            })
            .unwrap();
        let playlist: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(playlist["tracks"].as_array().unwrap().len(), 1);
        let rating_before: Option<i32> = c
            .query_row(
                "SELECT normalized_rating FROM tracks WHERE id=?1",
                [shelf.suggestions[0].track.track_id],
                |r| r.get(0),
            )
            .unwrap();
        let dismissed =
            operate_at(dir.path(), request("dismiss", Some(&shelf), Some(key))).unwrap();
        assert!(!dismissed
            .suggestions
            .iter()
            .any(|s| s.track.track_key == *key));
        let rating_after: Option<i32> = c
            .query_row(
                "SELECT normalized_rating FROM tracks WHERE id=?1",
                [shelf.suggestions[0].track.track_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(rating_before, rating_after);
        operate_at(dir.path(), request("refresh", None, None)).unwrap();
        assert!(operate_at(dir.path(), request("keep", Some(&shelf), Some(key))).is_err());
    }
    #[test]
    fn reload_removes_newly_banned_stale_and_recently_played_tracks_and_audio_twins() {
        let dir = fixture();
        let shelf = operate_at(dir.path(), request("refresh", None, None)).unwrap();
        let item = &shelf.suggestions[0].track;
        let used: HashSet<_> = shelf
            .suggestions
            .iter()
            .flat_map(|s| {
                std::iter::once(s.track.track_id).chain(s.anchors.iter().map(|a| a.track_id))
            })
            .collect();
        let played_id = (20..=30).find(|id| !used.contains(id)).unwrap();
        let sound = load_entry(&reader(dir.path()).unwrap(), &item.track_key)
            .unwrap()
            .unwrap()
            .hash;
        let analysis = crate::sonic::results(dir.path()).unwrap();
        analysis
            .execute(
                "UPDATE sonic_tracks SET audio_hash=?1 WHERE filename=?2",
                params![sound, format!("{}.mp3", played_id - 1)],
            )
            .unwrap();
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("INSERT INTO listening_plays(source,played_at,artist,title,album,artist_key,title_key,album_key,path_key,imported_at) VALUES('aurora',?1,?2,?3,?4,'a','t','b','p','now')",params![Utc::now().timestamp(),item.artist,item.title,item.album]).unwrap();
        // Pin a reviewed resolver link and its revision to isolate the recency policy.
        crate::listening::refresh_links(&c).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO listening_identity_links VALUES('a','t','b','p',?1)",
            [played_id],
        )
        .unwrap();
        let loaded = operate_at(dir.path(), request("load", None, None)).unwrap();
        assert!(!loaded
            .suggestions
            .iter()
            .any(|s| s.track.track_id == item.track_id));
        let other = &loaded.suggestions[0].track;
        c.execute("UPDATE tracks SET love='B' WHERE id=?1", [other.track_id])
            .unwrap();
        let loaded = operate_at(dir.path(), request("load", None, None)).unwrap();
        assert!(!loaded
            .suggestions
            .iter()
            .any(|s| s.track.track_id == other.track_id));
        let other = &loaded.suggestions[0].track;
        std::fs::write(dir.path().join(&other.filename), [0; 300]).unwrap();
        assert!(!operate_at(dir.path(), request("load", None, None))
            .unwrap()
            .suggestions
            .iter()
            .any(|s| s.track.track_id == other.track_id));
    }
    #[test]
    fn missing_analysis_explains_setup_without_creating_an_analysis_cache() {
        let dir = fixture();
        std::fs::remove_file(dir.path().join("music-analysis.sqlite3")).unwrap();
        let shelf = operate_at(dir.path(), request("refresh", None, None)).unwrap();
        assert!(shelf.suggestions.is_empty());
        assert!(shelf.note.contains("Audio analysis"));
        assert!(!dir.path().join("music-analysis.sqlite3").exists());
    }

    #[test]
    fn replacing_and_reanalyzing_audio_drops_old_evidence_and_kept_identity() {
        let dir = fixture();
        let shelf = operate_at(dir.path(), request("refresh", None, None)).unwrap();
        let item = &shelf.suggestions[0].track;
        operate_at(
            dir.path(),
            request("keep", Some(&shelf), Some(&item.track_key)),
        )
        .unwrap();
        std::fs::write(dir.path().join(&item.filename), [9; 300]).unwrap();
        let (size, modified) = file_signature(&dir.path().join(&item.filename)).unwrap();
        let a = crate::sonic::results(dir.path()).unwrap();
        a.execute(
            "INSERT INTO sonic_audio VALUES('replacement',?1,?2)",
            params![
                PROFILE,
                serde_json::to_string(&vec![0.7; DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        a.execute("UPDATE sonic_tracks SET audio_hash='replacement',size=?1,modified=?2 WHERE track_key=?3",params![size as i64,modified,item.track_key]).unwrap();
        let loaded = operate_at(dir.path(), request("load", None, None)).unwrap();
        assert!(!loaded
            .suggestions
            .iter()
            .any(|s| s.track.track_key == item.track_key));
        assert!(loaded.kept.is_empty());
    }

    #[test]
    #[ignore = "Opt-in read-only local-library verification; set HIDDEN_FAVORITES_LIVE_DIR"]
    fn live_readonly_shelf() {
        let path = std::env::var("HIDDEN_FAVORITES_LIVE_DIR")
            .expect("Set HIDDEN_FAVORITES_LIVE_DIR to the existing catalog directory");
        let c = reader(Path::new(&path)).unwrap();
        let scratch = tempfile::tempdir().unwrap();
        let s = store(scratch.path()).unwrap();
        let start = std::time::Instant::now();
        // Disable derived-index writes. Catalog and analysis are opened read-only;
        // only the temporary recommendation store can be modified by this probe.
        let (shelf, _) = build_indexed(&c, &s, 42, false).unwrap();
        assert_eq!(shelf.suggestions.len(), 5);
        println!(
            "Hidden favorites live proof: {}",
            serde_json::json!({"seconds":start.elapsed().as_secs_f64(),"training":shelf.training_tracks,"validation":shelf.validation_tracks,"auc":shelf.model_auc,"plays":shelf.history_plays,"tracks":shelf.suggestions.iter().map(|s|serde_json::json!({"title":s.track.title,"artist":s.track.artist,"rating":s.track.rating,"fit":s.fit,"broader":s.broader})).collect::<Vec<_>>()})
        );
    }
}
