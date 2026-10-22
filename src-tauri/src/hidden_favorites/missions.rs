//! Persisted audition missions. Selection reads analysis and ratings; only the
//! existing playlist writer may change the catalog. Rating decisions stay human.
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct MissionRequest {
    pub action: String,
    pub revision: Option<String>,
    pub mission_id: Option<String>,
    pub minutes: Option<i64>,
    pub mode: Option<String>,
    pub track_keys: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RatingMission {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub reason: String,
    pub fit: String,
    pub tracks: Vec<SonicTrack>,
    pub anchors: Vec<SonicTrack>,
    pub seconds: i64,
    pub album_total: usize,
    pub album_rated: usize,
    pub completed_tracks: usize,
    pub status: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MissionShelf {
    pub revision: String,
    pub generated_at: Option<String>,
    pub minutes: i64,
    pub mode: String,
    pub note: String,
    pub model_version: String,
    pub model_auc: Option<f64>,
    pub training_tracks: usize,
    pub validation_tracks: usize,
    pub choices: Vec<RatingMission>,
    pub active: Option<RatingMission>,
    pub started_missions: usize,
    pub completed_missions: usize,
    pub completed_artists: usize,
    pub completed_neighborhoods: usize,
    pub message: Option<String>,
}

struct Album {
    entries: Vec<Entry>,
    total: usize,
    rated: usize,
    mean: Vec<f32>,
    score: f64,
    distance: f64,
    anchor: usize,
}

fn mission_store(dir: &Path) -> Result<Connection> {
    let c = Connection::open(dir.join("rating-missions.sqlite3"))?;
    c.busy_timeout(Duration::from_secs(30))?;
    let version: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version > 1 {
        bail!("Update Music Library to read these rating missions");
    }
    c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS shelf(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audio(mission_id TEXT NOT NULL,track_key TEXT NOT NULL,audio_hash TEXT NOT NULL,PRIMARY KEY(mission_id,track_key));
        CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,status TEXT NOT NULL,artists TEXT NOT NULL,neighborhoods TEXT NOT NULL);
        PRAGMA user_version=1;")?;
    Ok(c)
}

fn mean(entries: &[Entry]) -> Vec<f32> {
    let mut result = vec![0.; DIMENSIONS];
    for entry in entries {
        for (x, value) in result.iter_mut().zip(&entry.features) {
            *x += value / entries.len() as f32;
        }
    }
    result
}

fn metric(features: Vec<f32>, weights: &[f32]) -> Result<Metric> {
    Metric::new(&Analysis {
        profile: PROFILE.into(),
        features,
        weights: weights.to_vec(),
    })
    .context("Unsupported sound-analysis metric")
}

fn training(c: &Connection, rotation: u64) -> Result<(Option<taste::Model>, Vec<Entry>)> {
    let mut q = c.prepare(&format!("WITH selected AS MATERIALIZED (SELECT id FROM tracks WHERE lower(filename) LIKE '%.mp3' AND COALESCE(love,'')!='B' AND (normalized_rating=100 OR normalized_rating BETWEEN 1 AND 60 OR love='L') ORDER BY (id*1103515245+12345)%2147483647 LIMIT 20000) SELECT {SELECT} {SAMPLE_JOIN} WHERE s.profile=?1"))?;
    let examples = q
        .query_map([PROFILE], row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let labels: Vec<_> = examples
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
    let model = taste::train(&labels);
    let mut favorites: Vec<_> = examples
        .into_iter()
        .filter(|e| e.valid() && (e.track.rating == Some(100) || e.track.loved))
        .collect();
    favorites.sort_by_key(|e| taste::hash(&format!("{rotation}:{}", e.track.track_key)));
    let mut artists = HashSet::new();
    let mut hashes = HashSet::new();
    let anchors = favorites
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
    Ok((model, anchors))
}

fn albums(
    c: &Connection,
    weights: &[f32],
    anchors: &[Entry],
    model: Option<&taste::Model>,
    minutes: i64,
    rotation: u64,
    indexed: bool,
    mode: &str,
) -> Result<Vec<Album>> {
    let targets: Vec<_> = anchors.iter().map(|e| e.features.clone()).collect();
    let metrics: Vec<_> = targets
        .iter()
        .map(|f| metric(f.clone(), weights))
        .collect::<Result<_>>()?;
    let analysis = Analysis {
        profile: PROFILE.into(),
        features: targets[0].clone(),
        weights: weights.to_vec(),
    };
    let nearby = if indexed {
        crate::sonic_index::candidates(c, &analysis, &targets, false, 512, None, &HashSet::new())
            .map(|r| r.keys)
    } else {
        None
    };
    // Bound catalog identities before joining the million-track analysis cache.
    // Verify album counters against tracks below; imported counters may be stale.
    let budget = if mode == "albums" {
        "SUM(CASE WHEN COALESCE(t.normalized_rating,0)=0 THEN t.time_seconds ELSE 0 END)"
    } else {
        "MIN(CASE WHEN COALESCE(t.normalized_rating,0)=0 THEN t.time_seconds END)"
    };
    let mut query = c.prepare(&format!("WITH broad AS MATERIALIZED (SELECT id FROM albums WHERE total_tracks BETWEEN 1 AND 200 AND rated_tracks<total_tracks ORDER BY (rowid*1103515245+?1)%2147483647 LIMIT 512), close AS MATERIALIZED (SELECT id FROM albums WHERE rated_tracks>0 AND rated_tracks<total_tracks AND total_tracks<=200 ORDER BY total_tracks-rated_tracks,(rowid*1103515245+?1)%2147483647 LIMIT 128), nearby AS MATERIALIZED (SELECT DISTINCT t.album_id AS id FROM sonic.sonic_tracks s CROSS JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename WHERE s.profile=?2 AND s.track_key IN (SELECT value FROM json_each(?3)) LIMIT 256), selected AS MATERIALIZED (SELECT id FROM broad UNION SELECT id FROM close UNION SELECT id FROM nearby) SELECT t.album_id,COUNT(*),SUM(CASE WHEN COALESCE(t.normalized_rating,0)>0 THEN 1 ELSE 0 END) FROM selected a CROSS JOIN tracks t ON t.album_id=a.id GROUP BY t.album_id HAVING COUNT(*) BETWEEN 1 AND 200 AND SUM(CASE WHEN COALESCE(t.love,'')='B' THEN 1 ELSE 0 END)=0 AND SUM(CASE WHEN COALESCE(t.normalized_rating,0)=0 AND (COALESCE(t.time_seconds,0)<=0 OR lower(t.filename) NOT LIKE '%.mp3') THEN 1 ELSE 0 END)=0 AND {budget} BETWEEN 1 AND ?4"))?;
    let ids = query
        .query_map(
            params![
                (rotation % 2147483647) as i64,
                PROFILE,
                nearby.unwrap_or_else(|| "[]".into()),
                minutes * 60
            ],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, usize>(1)?,
                    r.get::<_, usize>(2)?,
                ))
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut result = Vec::new();
    let mut query = c.prepare(&format!("SELECT {SELECT} FROM tracks t CROSS JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename JOIN sonic.sonic_audio a ON a.audio_hash=s.audio_hash AND a.profile=s.profile WHERE t.album_id=?1 AND COALESCE(t.normalized_rating,0)=0 AND s.profile=?2 ORDER BY COALESCE(t.disc_number,1),COALESCE(t.track_number,0),t.id"))?;
    for (id, total, rated) in ids {
        let entries = query
            .query_map(params![id, PROFILE], row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if entries.is_empty()
            || (mode == "albums" && entries.len() != total - rated)
            || entries.iter().any(|e| !e.valid())
        {
            continue;
        }
        let average = mean(&entries);
        let (anchor, distance) = metrics
            .iter()
            .enumerate()
            .filter_map(|(i, m)| m.distance(&average).map(|d| (i, d)))
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .context("No favorite sound evidence")?;
        let score = entries
            .iter()
            .map(|e| model.map_or(0.5, |m| m.score(&e.features)))
            .sum::<f64>()
            / entries.len() as f64;
        result.push(Album {
            entries,
            total,
            rated,
            mean: average,
            score: score * 0.65 + 0.35 / (1. + distance),
            distance,
            anchor,
        });
    }
    Ok(result)
}

fn fit(model: Option<&taste::Model>, entries: &[Entry]) -> String {
    let Some(model) = model else {
        return "Favorite sound evidence".into();
    };
    let score = entries
        .iter()
        .map(|e| model.score(&e.features))
        .sum::<f64>()
        / entries.len() as f64;
    if score >= 0.65 {
        "Strong fit"
    } else if score >= 0.40 {
        "Possible fit"
    } else {
        "Stretch fit"
    }
    .into()
}

fn choose(
    pool: Vec<Album>,
    anchors: &[Entry],
    model: Option<&taste::Model>,
    weights: &[f32],
    mode: &str,
    minutes: i64,
    rotation: u64,
) -> Result<Vec<(RatingMission, Vec<Entry>)>> {
    let mut used_artists = HashSet::new();
    let mut used_albums = HashSet::new();
    let mut choices = Vec::new();
    let mut selected_means: Vec<Vec<f32>> = Vec::new();
    // Reserve the completion slot before the fit slot can consume the only
    // partially rated artist. Present the choices in fit/finish/stretch order.
    for kind in ["finish", "fit", "stretch"] {
        let mut ranked: Vec<_> = pool
            .iter()
            .filter(|a| kind != "finish" || a.rated > 0)
            .collect();
        ranked.sort_by(|a, b| {
            let order = match kind {
                "finish" => a.entries.len().cmp(&b.entries.len()).then_with(|| {
                    (b.rated as f64 / b.total as f64).total_cmp(&(a.rated as f64 / a.total as f64))
                }),
                "stretch" => {
                    let novelty = |album: &Album| -> f64 {
                        selected_means
                            .iter()
                            .filter_map(|f| metric(f.clone(), weights).ok()?.distance(&album.mean))
                            .fold(album.distance, f64::min)
                    };
                    novelty(b).total_cmp(&novelty(a))
                }
                _ => b.score.total_cmp(&a.score),
            };
            order.then_with(|| {
                a.entries[0]
                    .track
                    .album_id
                    .cmp(&b.entries[0].track.album_id)
            })
        });
        let eligible = |a: &&Album| {
            !used_artists.contains(&a.entries[0].artist)
                && !used_albums.contains(&a.entries[0].track.album_id)
        };
        let mut entries = Vec::new();
        let mut evidence = Vec::new();
        let (total, rated);
        if mode == "albums" {
            // Stat only the bounded, highest ranked choices, never every candidate.
            let Some(album) = ranked
                .into_iter()
                .filter(eligible)
                .find(|a| a.entries.iter().all(Entry::fresh))
            else {
                continue;
            };
            entries = album.entries.clone();
            total = album.total;
            rated = album.rated;
            evidence.push(anchors[album.anchor].clone());
            used_artists.insert(album.entries[0].artist.clone());
            used_albums.insert(album.entries[0].track.album_id.clone());
            selected_means.push(album.mean.clone());
        } else {
            total = 0;
            rated = 0;
            let mut seconds = 0;
            let mut hashes = HashSet::new();
            let mut neighborhoods = HashSet::new();
            // First cover different favorite neighborhoods, then fill with different
            // artists. A mix never repeats the exact same analyzed audio payload.
            for require_new in [true, false] {
                for album in &ranked {
                    if used_artists.contains(&album.entries[0].artist)
                        || used_albums.contains(&album.entries[0].track.album_id)
                        || (require_new && neighborhoods.contains(&album.anchor))
                    {
                        continue;
                    }
                    let candidate = album.entries.iter().find(|e| {
                        e.track.seconds + seconds <= minutes * 60
                            && !hashes.contains(&e.hash)
                            && e.fresh()
                    });
                    let Some(entry) = candidate else {
                        continue;
                    };
                    entries.push(entry.clone());
                    seconds += entry.track.seconds;
                    hashes.insert(entry.hash.clone());
                    neighborhoods.insert(album.anchor);
                    if !evidence
                        .iter()
                        .any(|e: &Entry| e.track.track_key == anchors[album.anchor].track.track_key)
                    {
                        evidence.push(anchors[album.anchor].clone());
                    }
                    used_artists.insert(entry.artist.clone());
                    used_albums.insert(entry.track.album_id.clone());
                    if entries.len() == 12 {
                        break;
                    }
                }
                if entries.len() == 12 {
                    break;
                }
            }
            if entries.is_empty() {
                continue;
            }
            selected_means.push(mean(&entries));
        }
        let title = if mode == "albums" {
            entries[0].track.album.clone()
        } else {
            format!("{} unrated tracks", entries.len())
        };
        let reason = match kind {
            "finish" => "Put the last unrated tracks of partially rated albums first.",
            "stretch" => "A reserved exploration choice, farther from the selected favorites and other choices in this candidate pool.",
            _ => "Prioritized by your saved ratings and distance to favorite sounds.",
        };
        choices.push((
            RatingMission {
                id: format!("{rotation}-{kind}"),
                kind: kind.into(),
                title,
                reason: reason.into(),
                fit: fit(model, &entries),
                seconds: entries.iter().map(|e| e.track.seconds).sum(),
                tracks: entries.iter().map(|e| e.track.clone()).collect(),
                anchors: evidence.iter().map(|e| e.track.clone()).collect(),
                album_total: total,
                album_rated: rated,
                completed_tracks: 0,
                status: "choice".into(),
                started_at: None,
                completed_at: None,
            },
            entries.into_iter().chain(evidence).collect(),
        ));
    }
    choices.sort_by_key(|(m, _)| match m.kind.as_str() {
        "fit" => 0,
        "finish" => 1,
        _ => 2,
    });
    Ok(choices)
}

fn build_missions(
    c: &Connection,
    s: &Connection,
    shelf: &mut MissionShelf,
    indexed: bool,
) -> Result<()> {
    let rotation = Utc::now().timestamp_micros() as u64;
    shelf.generated_at = Some(Utc::now().to_rfc3339());
    shelf.choices.clear();
    shelf.model_version = taste::VERSION.into();
    shelf.model_auc = None;
    shelf.training_tracks = 0;
    shelf.validation_tracks = 0;
    shelf.note = "Choose what to audition, then use your normal rating controls. Fit labels rank listening choices; they never predict stars. Missing choices need more eligible artists, analysis, or time.".into();
    if !has_analysis(c)? {
        shelf.note = "Continue Tools → Audio analysis to choose rating missions.".into();
        return Ok(());
    }
    let weights: Option<String> = c
        .query_row(
            "SELECT weights FROM sonic.sonic_profiles WHERE profile=?1",
            [PROFILE],
            |r| r.get(0),
        )
        .optional()?;
    let Some(weights) = weights.and_then(|s| serde_json::from_str::<Vec<f32>>(&s).ok()) else {
        shelf.note =
            "Current sound analysis is not ready. Continue Audio analysis, then find missions."
                .into();
        return Ok(());
    };
    metric(vec![0.; DIMENSIONS], &weights)?;
    let (model, anchors) = training(c, rotation)?;
    if let Some(m) = &model {
        shelf.model_auc = Some(m.auc);
        shelf.training_tracks = m.training;
        shelf.validation_tracks = m.validation;
    }
    if anchors.len() < 2 {
        shelf.note =
            "Analyze five-star or loved tracks by at least two album artists, then find missions."
                .into();
        return Ok(());
    }
    if model.is_none() {
        shelf.note.push_str(
            " Not enough reliable held-out ratings evidence; using favorite sound neighborhoods.",
        );
    }
    let mut pool = albums(
        c,
        &weights,
        &anchors,
        model.as_ref(),
        shelf.minutes,
        rotation,
        indexed,
        &shelf.mode,
    )?;
    if let Some(active) = &shelf.active {
        if matches!(active.status.as_str(), "active" | "unavailable") {
            let active_albums: HashSet<_> = active.tracks.iter().map(|t| &t.album_id).collect();
            pool.retain(|album| !active_albums.contains(&album.entries[0].track.album_id));
        }
    }
    for (mission, evidence) in choose(
        pool,
        &anchors,
        model.as_ref(),
        &weights,
        &shelf.mode,
        shelf.minutes,
        rotation,
    )? {
        for entry in evidence {
            s.execute(
                "INSERT OR REPLACE INTO audio VALUES(?1,?2,?3)",
                params![mission.id, entry.track.track_key, entry.hash],
            )?;
        }
        shelf.choices.push(mission);
    }
    Ok(())
}

fn reconcile(c: &Connection, s: &Connection, mission: &mut RatingMission) -> Result<()> {
    if matches!(mission.status.as_str(), "completed" | "abandoned") {
        return Ok(());
    }
    let mut valid = true;
    for track in &mut mission.tracks {
        let expected: Option<String> = s
            .query_row(
                "SELECT audio_hash FROM audio WHERE mission_id=?1 AND track_key=?2",
                params![mission.id, track.track_key],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(entry) = load_entry(c, &track.track_key)?.filter(|e| {
            current_recording(e)
                && e.track.track_id == track.track_id
                && e.track.album_id == track.album_id
                && expected.as_deref() == Some(&e.hash)
        }) {
            *track = entry.track;
        } else {
            valid = false;
        }
    }
    let mut anchors = Vec::new();
    for track in &mission.anchors {
        let expected: Option<String> = s
            .query_row(
                "SELECT audio_hash FROM audio WHERE mission_id=?1 AND track_key=?2",
                params![mission.id, track.track_key],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(entry) = load_entry(c, &track.track_key)?.filter(|e| {
            current_recording(e)
                && expected.as_deref() == Some(&e.hash)
                && (e.track.rating == Some(100) || e.track.loved)
        }) {
            anchors.push(entry.track);
        }
    }
    mission.anchors = anchors;
    mission.completed_tracks = mission
        .tracks
        .iter()
        .filter(|t| t.rating.is_some_and(|r| r > 0))
        .count();
    mission.seconds = mission
        .tracks
        .iter()
        .filter(|t| t.rating.unwrap_or(0) == 0)
        .map(|t| t.seconds)
        .sum();
    if mission.album_total > 0 {
        let (total,rated): (usize,usize) = c.query_row("SELECT COUNT(*),COALESCE(SUM(CASE WHEN COALESCE(normalized_rating,0)>0 THEN 1 ELSE 0 END),0) FROM tracks WHERE album_id=?1", [&mission.tracks[0].album_id], |r|Ok((r.get(0)?,r.get(1)?)))?;
        if total != mission.album_total
            || total - rated != mission.tracks.len() - mission.completed_tracks
        {
            valid = false;
        }
        mission.album_rated = rated;
    }
    if mission.status == "choice" && mission.anchors.is_empty() {
        valid = false;
    }
    if !valid {
        mission.status = "unavailable".into();
    } else if mission.status == "active" && mission.completed_tracks == mission.tracks.len() {
        mission.status = "completed".into();
        mission.completed_at = Some(Utc::now().to_rfc3339());
        s.execute(
            "UPDATE history SET status='completed' WHERE id=?1",
            [&mission.id],
        )?;
    }
    Ok(())
}

fn current_recording(entry: &Entry) -> bool {
    if entry.fresh() {
        return true;
    }
    if !entry.valid() {
        return false;
    }
    // Rating/tag edits may change the file signature without changing audio.
    // Recheck the exact MP3 payload, with a stable signature around the read;
    // never rewrite the analysis cache or infer identity from sound proximity.
    let path = Path::new(&entry.track.file_path).join(&entry.track.filename);
    let Ok(before) = music_sonic_core::file_signature(&path) else {
        return false;
    };
    crate::sonic::audio_hash(&path).is_ok_and(|hash| hash == entry.hash)
        && music_sonic_core::file_signature(&path).is_ok_and(|after| after == before)
}

fn remaining(mission: &RatingMission) -> Vec<String> {
    mission
        .tracks
        .iter()
        .filter(|t| t.rating.unwrap_or(0) == 0)
        .map(|t| t.track_key.clone())
        .collect()
}

pub(crate) fn operate_at(dir: &Path, request: MissionRequest) -> Result<MissionShelf> {
    operate(dir, request, true)
}
fn operate(dir: &Path, request: MissionRequest, indexed: bool) -> Result<MissionShelf> {
    if !matches!(
        request.action.as_str(),
        "load" | "refresh" | "start" | "abandon" | "save"
    ) {
        bail!("Unknown rating mission action");
    }
    let mut s = mission_store(dir)?;
    let tx = s.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let c = reader(dir)?;
    let read = c.unchecked_transaction()?;
    let saved: Option<String> = tx
        .query_row("SELECT payload FROM shelf WHERE id=1", [], |r| r.get(0))
        .optional()?;
    let mut shelf: MissionShelf = saved
        .as_ref()
        .map(|v| serde_json::from_str(v))
        .transpose()?
        .unwrap_or(MissionShelf {
            minutes: 40,
            mode: "albums".into(),
            note: "Find three ways into your rating backlog.".into(),
            ..Default::default()
        });
    if !matches!(request.action.as_str(), "load" | "refresh")
        && request.revision.as_deref() != Some(&shelf.revision)
    {
        bail!("Rating missions changed in another app. Reload missions before continuing.");
    }
    for mission in &mut shelf.choices {
        reconcile(&read, &tx, mission)?;
    }
    shelf
        .choices
        .retain(|m| m.status == "choice" && m.completed_tracks < m.tracks.len());
    if let Some(active) = &mut shelf.active {
        reconcile(&read, &tx, active)?;
    }
    shelf.message = None;
    if request.action == "refresh" {
        shelf.minutes = request.minutes.unwrap_or(40);
        shelf.mode = request.mode.unwrap_or_else(|| "albums".into());
        if !(10..=240).contains(&shelf.minutes) || !matches!(shelf.mode.as_str(), "albums" | "mix")
        {
            bail!("Choose 10–240 minutes and albums or mix.");
        }
        tx.execute(
            "DELETE FROM audio WHERE mission_id<>?1",
            [shelf.active.as_ref().map(|m| m.id.as_str()).unwrap_or("")],
        )?;
        build_missions(&read, &tx, &mut shelf, indexed)?;
    } else if matches!(request.action.as_str(), "start" | "save") {
        let id = request.mission_id.as_deref().context("Choose a mission")?;
        let mission = shelf
            .choices
            .iter()
            .chain(shelf.active.iter())
            .find(|m| m.id == id)
            .context("This mission changed. Reload missions.")?
            .clone();
        let keys = remaining(&mission);
        if !matches!(mission.status.as_str(), "choice" | "active")
            || keys.is_empty()
            || request.track_keys.as_ref() != Some(&keys)
        {
            bail!("The mission's unrated tracks changed. Reload progress after pending rating changes have synced, then review it again.");
        }
        if request.action == "start" {
            if shelf
                .active
                .as_ref()
                .is_some_and(|m| matches!(m.status.as_str(), "active" | "unavailable"))
            {
                bail!("Finish or leave the current mission before starting another.");
            }
            let mut mission = mission;
            mission.status = "active".into();
            mission.started_at = Some(Utc::now().to_rfc3339());
            let artists: HashSet<String> = mission
                .tracks
                .iter()
                .map(|t| {
                    load_entry(&read, &t.track_key).map(|e| e.map(|e| e.artist).unwrap_or_default())
                })
                .collect::<Result<_>>()?;
            let neighborhoods: HashSet<_> = mission
                .anchors
                .iter()
                .map(|t| t.track_key.clone())
                .collect();
            tx.execute(
                "INSERT INTO history VALUES(?1,'active',?2,?3)",
                params![
                    mission.id,
                    serde_json::to_string(&artists)?,
                    serde_json::to_string(&neighborhoods)?
                ],
            )?;
            shelf.choices.retain(|m| m.id != mission.id);
            shelf.active = Some(mission);
        } else {
            let tracks: Vec<_>=mission.tracks.iter().filter(|t|keys.contains(&t.track_key)).map(|t|serde_json::json!({"id":t.track_id,"filePath":t.file_path,"filename":t.filename})).collect();
            read.commit()?;
            crate::db::playlist_bridge_at(
                dir,
                "playlistAuthor",
                serde_json::json!({"action":"create","name":format!("Rate next — {}",mission.title),"tracks":tracks}),
            )?;
            shelf.message = Some(
                "Saved the reviewed unrated tracks in Music Library Playlists, in mission order."
                    .into(),
            );
            tx.commit()?;
            return Ok(shelf);
        }
    } else if request.action == "abandon" {
        let active = shelf.active.as_ref().context("No active mission")?;
        if request.mission_id.as_deref() != Some(&active.id) {
            bail!("The active mission changed. Reload missions.");
        }
        tx.execute(
            "UPDATE history SET status='abandoned' WHERE id=?1 AND status!='completed'",
            [&active.id],
        )?;
        shelf.active = None;
    }
    (shelf.started_missions, shelf.completed_missions) = tx.query_row(
        "SELECT COUNT(*),COALESCE(SUM(status='completed'),0) FROM history",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let mut artists = HashSet::new();
    let mut neighborhoods = HashSet::new();
    let mut history =
        tx.prepare("SELECT artists,neighborhoods FROM history WHERE status='completed'")?;
    for row in history.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (a, n) = row?;
        artists.extend(serde_json::from_str::<Vec<String>>(&a)?);
        neighborhoods.extend(serde_json::from_str::<Vec<String>>(&n)?);
    }
    drop(history);
    shelf.completed_artists = artists.len();
    shelf.completed_neighborhoods = neighborhoods.len();
    let serialized = serde_json::to_string(&shelf)?;
    if saved.as_deref() != Some(&serialized) {
        shelf.revision = Utc::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
            .to_string();
    }
    tx.execute(
        "INSERT INTO shelf VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        [serde_json::to_string(&shelf)?],
    )?;
    read.commit()?;
    tx.commit()?;
    Ok(shelf)
}

#[cfg(not(test))]
#[tauri::command]
#[specta::specta]
pub async fn rating_missions(
    app: tauri::AppHandle,
    request: MissionRequest,
) -> Result<MissionShelf, String> {
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
    fn fixture() -> tempfile::TempDir {
        let dir = super::super::tests::fixture();
        // Repair the intentionally stale fixture file, then form a two-disc,
        // partly rated album with deliberately reversed database IDs.
        std::fs::write(dir.path().join("13.mp3"), [8; 256]).unwrap();
        let a = crate::sonic::results(dir.path()).unwrap();
        let (size, modified) =
            music_sonic_core::file_signature(&dir.path().join("13.mp3")).unwrap();
        a.execute(
            "UPDATE sonic_tracks SET size=?1,modified=?2 WHERE filename='13.mp3'",
            params![size as i64, modified],
        )
        .unwrap();
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET album_id='12',album='Finish me',album_artist_display='Finish artist',disc_number=CASE id WHEN 13 THEN 2 ELSE 1 END,track_number=1 WHERE id IN (13,14,15)",[]).unwrap();
        c.execute(
            "UPDATE albums SET total_tracks=3,rated_tracks=1 WHERE id='12'",
            [],
        )
        .unwrap();
        dir
    }
    fn request(
        action: &str,
        shelf: Option<&MissionShelf>,
        mission: Option<&RatingMission>,
    ) -> MissionRequest {
        MissionRequest {
            action: action.into(),
            revision: shelf.map(|s| s.revision.clone()),
            mission_id: mission.map(|m| m.id.clone()),
            minutes: Some(10),
            mode: Some("albums".into()),
            track_keys: mission.map(remaining),
        }
    }
    fn run(dir: &Path, request: MissionRequest) -> MissionShelf {
        operate(dir, request, false).unwrap()
    }
    #[test]
    fn three_diverse_choices_obey_budget_album_order_and_partial_completion() {
        let dir = fixture();
        let shelf = run(dir.path(), request("refresh", None, None));
        assert_eq!(
            shelf
                .choices
                .iter()
                .map(|m| m.kind.as_str())
                .collect::<Vec<_>>(),
            ["fit", "finish", "stretch"]
        );
        let finish = &shelf.choices[1];
        assert_eq!(
            finish.tracks.iter().map(|t| t.track_id).collect::<Vec<_>>(),
            [14, 13]
        );
        assert_eq!((finish.album_rated, finish.album_total), (1, 3));
        assert!(shelf
            .choices
            .iter()
            .all(|m| m.seconds <= 600 && m.tracks.iter().all(|t| t.rating.unwrap_or(0) == 0)));
        assert_eq!(
            shelf
                .choices
                .iter()
                .map(|m| &m.tracks[0].album_artist)
                .collect::<HashSet<_>>()
                .len(),
            3
        );
        let c = reader(dir.path()).unwrap();
        for mission in &shelf.choices {
            assert!(mission
                .tracks
                .iter()
                .all(|t| load_entry(&c, &t.track_key).unwrap().unwrap().fresh()));
        }
        assert!(shelf.model_auc.is_none());
        assert!(shelf.note.contains("held-out"));
    }
    #[test]
    fn active_mission_survives_refresh_and_completes_only_from_real_ratings() {
        let dir = fixture();
        let shelf = run(dir.path(), request("refresh", None, None));
        let active = run(
            dir.path(),
            request("start", Some(&shelf), Some(&shelf.choices[1])),
        );
        assert_eq!(active.active.as_ref().unwrap().status, "active");
        assert_eq!((active.started_missions, active.completed_missions), (1, 0));
        let refreshed = run(dir.path(), request("refresh", None, None));
        assert_eq!(
            refreshed.active.as_ref().unwrap().id,
            active.active.as_ref().unwrap().id
        );
        assert!(operate(
            dir.path(),
            request("start", Some(&refreshed), Some(&refreshed.choices[0])),
            false
        )
        .is_err());
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET normalized_rating=20 WHERE id=14", [])
            .unwrap();
        let progress = run(dir.path(), request("load", None, None));
        assert_eq!(progress.active.as_ref().unwrap().completed_tracks, 1);
        assert_eq!(progress.active.as_ref().unwrap().seconds, 180);
        c.execute("UPDATE tracks SET normalized_rating=100 WHERE id=13", [])
            .unwrap();
        let done = run(dir.path(), request("load", None, None));
        assert_eq!(done.active.as_ref().unwrap().status, "completed");
        assert_eq!(done.completed_missions, 1);
        assert_eq!(done.completed_artists, 1);
        assert!(done.active.as_ref().unwrap().completed_at.is_some());
        assert_eq!(
            run(dir.path(), request("load", None, None)).completed_missions,
            1
        );
    }
    #[test]
    fn rejects_stale_revisions_changed_ratings_replaced_audio_and_reordered_review() {
        let dir = fixture();
        let shelf = run(dir.path(), request("refresh", None, None));
        let mut reversed = request("save", Some(&shelf), Some(&shelf.choices[1]));
        reversed.track_keys.as_mut().unwrap().reverse();
        assert!(operate(dir.path(), reversed, false).is_err());
        let newer = run(dir.path(), request("refresh", None, None));
        assert!(operate(
            dir.path(),
            request("start", Some(&shelf), Some(&shelf.choices[0])),
            false
        )
        .is_err());
        let finish = &newer.choices[1];
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute(
            "UPDATE tracks SET normalized_rating=80 WHERE id=?1",
            [finish.tracks[0].track_id],
        )
        .unwrap();
        assert!(operate(
            dir.path(),
            request("start", Some(&newer), Some(finish)),
            false
        )
        .is_err());
        let loaded = run(dir.path(), request("load", None, None));
        let choice = &loaded.choices[0];
        let a = crate::sonic::results(dir.path()).unwrap();
        a.execute(
            "INSERT INTO sonic_audio VALUES('new-recording',?1,?2)",
            params![
                PROFILE,
                serde_json::to_string(&vec![0.; DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        a.execute(
            "UPDATE sonic_tracks SET audio_hash='new-recording' WHERE track_key=?1",
            [&choice.tracks[0].track_key],
        )
        .unwrap();
        assert!(!run(dir.path(), request("load", None, None))
            .choices
            .iter()
            .any(|m| m.id == choice.id));
    }
    #[test]
    fn mixes_use_long_albums_without_repeating_artists_audio_or_exceeding_time() {
        let dir = fixture();
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET time_seconds=400 WHERE id>=13", [])
            .unwrap();
        let a = crate::sonic::results(dir.path()).unwrap();
        a.execute(
            "UPDATE sonic_tracks SET audio_hash='hash-16' WHERE filename='17.mp3'",
            [],
        )
        .unwrap();
        let mut req = request("refresh", None, None);
        req.mode = Some("mix".into());
        let shelf = run(dir.path(), req);
        assert_eq!(shelf.choices.len(), 3);
        for mission in shelf.choices {
            assert!(mission.seconds <= 600 && !mission.tracks.is_empty());
            assert_eq!(
                mission
                    .tracks
                    .iter()
                    .map(|t| &t.album_artist)
                    .collect::<HashSet<_>>()
                    .len(),
                mission.tracks.len()
            );
            let read = reader(dir.path()).unwrap();
            assert_eq!(
                mission
                    .tracks
                    .iter()
                    .map(|t| load_entry(&read, &t.track_key).unwrap().unwrap().hash)
                    .collect::<HashSet<_>>()
                    .len(),
                mission.tracks.len()
            );
        }
    }
    #[test]
    fn unavailable_and_newly_unrated_album_members_cannot_be_counted_as_finished() {
        let dir = fixture();
        let shelf = run(dir.path(), request("refresh", None, None));
        let active = run(
            dir.path(),
            request("start", Some(&shelf), Some(&shelf.choices[1])),
        );
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET normalized_rating=NULL WHERE id=15", [])
            .unwrap();
        let loaded = run(dir.path(), request("load", None, None));
        assert_eq!(loaded.active.as_ref().unwrap().status, "unavailable");
        assert_eq!(loaded.completed_missions, 0);
        assert!(operate(
            dir.path(),
            request("save", Some(&loaded), loaded.active.as_ref()),
            false
        )
        .is_err());
        assert!(operate(
            dir.path(),
            request("abandon", Some(&active), active.active.as_ref()),
            false
        )
        .is_err());
        assert!(run(
            dir.path(),
            request("abandon", Some(&loaded), loaded.active.as_ref())
        )
        .active
        .is_none());
    }
    #[test]
    fn save_uses_reviewed_order_and_never_changes_ratings_and_missing_analysis_stays_missing() {
        let dir = fixture();
        let shelf = run(dir.path(), request("refresh", None, None));
        let saved = run(
            dir.path(),
            request("save", Some(&shelf), Some(&shelf.choices[1])),
        );
        assert!(saved.message.unwrap().contains("mission order"));
        let c = reader(dir.path()).unwrap();
        let playlist: String = c
            .query_row(
                "SELECT playlist_json FROM saved_playlists ORDER BY id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let playlist: serde_json::Value = serde_json::from_str(&playlist).unwrap();
        assert_eq!(
            playlist["tracks"]
                .as_array()
                .unwrap()
                .iter()
                .map(|t| t["trackId"].as_i64().unwrap())
                .collect::<Vec<_>>(),
            [14, 13]
        );
        assert_eq!(
            c.query_row(
                "SELECT COUNT(*) FROM tracks WHERE COALESCE(normalized_rating,0)>0",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            13
        );
        drop(c);
        std::fs::remove_file(dir.path().join("music-analysis.sqlite3")).unwrap();
        let empty = run(dir.path(), request("refresh", None, None));
        assert!(empty.choices.is_empty());
        assert!(empty.note.contains("Audio analysis"));
        assert!(!dir.path().join("music-analysis.sqlite3").exists());
    }
    #[test]
    fn retagging_preserves_the_exact_recording_but_changed_audio_does_not_complete_it() {
        let dir = fixture();
        let path = dir.path().join("13.mp3");
        let hash = crate::sonic::audio_hash(&path).unwrap();
        let a = crate::sonic::results(dir.path()).unwrap();
        a.execute(
            "INSERT INTO sonic_audio VALUES(?1,?2,?3)",
            params![
                hash,
                PROFILE,
                serde_json::to_string(&vec![0.5; DIMENSIONS]).unwrap()
            ],
        )
        .unwrap();
        a.execute(
            "UPDATE sonic_tracks SET audio_hash=?1 WHERE filename='13.mp3'",
            [&hash],
        )
        .unwrap();
        let shelf = run(dir.path(), request("refresh", None, None));
        run(
            dir.path(),
            request("start", Some(&shelf), Some(&shelf.choices[1])),
        );
        let mut retagged = vec![8; 256];
        let mut tag = vec![0; 128];
        tag[..3].copy_from_slice(b"TAG");
        retagged.extend(tag);
        std::fs::write(&path, &retagged).unwrap();
        let c = crate::db::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        c.execute("UPDATE tracks SET normalized_rating=100 WHERE id=14", [])
            .unwrap();
        let loaded = run(dir.path(), request("load", None, None));
        assert_eq!(loaded.active.as_ref().unwrap().status, "active");
        assert_eq!(loaded.active.as_ref().unwrap().completed_tracks, 1);
        retagged[5] = 9;
        std::fs::write(&path, &retagged).unwrap();
        c.execute("UPDATE tracks SET normalized_rating=100 WHERE id=13", [])
            .unwrap();
        let loaded = run(dir.path(), request("load", None, None));
        assert_eq!(loaded.active.as_ref().unwrap().status, "unavailable");
        assert_eq!(loaded.completed_missions, 0);
    }
    #[test]
    #[ignore = "Opt-in read-only local-library check; set RATING_MISSIONS_LIVE_DIR"]
    fn live_readonly_missions() {
        let path = std::env::var("RATING_MISSIONS_LIVE_DIR").unwrap();
        let dir = tempfile::tempdir().unwrap();
        let c = reader(Path::new(&path)).unwrap();
        let read = c.unchecked_transaction().unwrap();
        let s = mission_store(dir.path()).unwrap();
        let mut shelf = MissionShelf {
            minutes: 40,
            mode: "albums".into(),
            ..Default::default()
        };
        let started = std::time::Instant::now();
        build_missions(&read, &s, &mut shelf, false).unwrap();
        assert_eq!(shelf.choices.len(), 3);
        assert!(shelf
            .choices
            .iter()
            .all(|m| m.seconds <= 2400 && m.tracks.iter().all(|t| t.rating.unwrap_or(0) == 0)));
        eprintln!(
            "Read-only live missions: {} seconds; AUC {:?}; choices {:?}",
            started.elapsed().as_secs_f64(),
            shelf.model_auc,
            shelf
                .choices
                .iter()
                .map(|m| (&m.kind, &m.title, m.tracks.len(), m.seconds))
                .collect::<Vec<_>>()
        );
    }
}
