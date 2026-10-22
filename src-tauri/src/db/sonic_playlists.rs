//! Versioned sound recipes. Only Music Library publishes their membership.
use super::*;
use music_sonic_core::{file_is_current, Analysis, Metric, PROFILE};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SonicPlaylistSeed {
    pub track_key: String,
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub audio_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SonicPlaylistRecipe {
    pub version: u32,
    pub profile: String,
    pub seeds: Vec<SonicPlaylistSeed>,
    pub max_distance: f64,
    pub max_per_artist: u32,
    pub ordering: String,
}
impl SonicPlaylistRecipe {
    pub(super) fn validate(&self) -> Result<()> {
        if self.version != 1
            || self.profile != PROFILE
            || self.ordering != "nearest"
            || !(1..=8).contains(&self.seeds.len())
            || self.seeds.iter().any(|s| {
                s.track_key.is_empty()
                    || s.track_key.len() > 4096
                    || s.title.len() > 1000
                    || s.artist.len() > 1000
                    || s.audio_hash.as_ref().is_some_and(|h| h.len() > 128)
            })
            || self
                .seeds
                .iter()
                .map(|s| &s.track_key)
                .collect::<HashSet<_>>()
                .len()
                != self.seeds.len()
            || !self.max_distance.is_finite()
            || !(0.001..=2.0).contains(&self.max_distance)
            || !(1..=100).contains(&self.max_per_artist)
        {
            bail!("Sonic Smart v1 needs 1–8 different examples, distance 0.001–2, nearest ordering and 1–100 songs per artist. Update both apps for newer recipes.")
        }
        Ok(())
    }
}

fn attach(conn: &Connection) -> Result<()> {
    let attached = conn
        .prepare("PRAGMA database_list")?
        .query_map([], |r| r.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if attached.iter().any(|name| name == "sonic") {
        return Ok(());
    }
    let path = conn
        .path()
        .filter(|s| !s.is_empty())
        .context("Sonic recipes need a local analysis database")?;
    let cache = Path::new(path)
        .parent()
        .context("Catalog has no directory")?
        .join("music-analysis.sqlite3");
    if !cache.is_file() {
        bail!("Run Audio analysis before using Sonic Smart playlists")
    }
    let mut uri = url::Url::from_file_path(cache).map_err(|_| anyhow!("Invalid analysis path"))?;
    uri.set_query(Some("mode=ro"));
    conn.execute("ATTACH DATABASE ?1 AS sonic", [uri.as_str()])?;
    Ok(())
}

/// Resolve path-based identities, never recycled numeric catalog IDs. Bind audio
/// identity on first save so replacing a seed at the same path cannot steer it.
pub(super) fn resolve(
    conn: &Connection,
    recipe: &mut SonicPlaylistRecipe,
) -> Result<Vec<Analysis>> {
    recipe.validate()?;
    attach(conn)?;
    let weights: String = conn
        .query_row(
            "SELECT weights FROM sonic.sonic_profiles WHERE profile=?1",
            [PROFILE],
            |r| r.get(0),
        )
        .context("Current sonic profile is unavailable. Check Audio analysis.")?;
    let weights: Vec<f32> = serde_json::from_str(&weights)?;
    let mut analyses = Vec::new();
    for (i, seed) in recipe.seeds.iter_mut().enumerate() {
        let found = conn.query_row("SELECT a.features,s.audio_hash,s.directory,s.filename,s.size,s.modified,COALESCE(t.love,''),COALESCE(t.title,''),COALESCE(NULLIF(t.display_artist,''),t.album_artist_display,'')
            FROM sonic.sonic_tracks s JOIN sonic.sonic_audio a USING(audio_hash,profile)
            JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename
            WHERE s.track_key=?1 AND s.profile=?2 AND lower(t.filename) LIKE '%.mp3'", params![seed.track_key, PROFILE], |r|
            Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,i64>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?,r.get::<_,String>(8)?))).optional()?;
        let message = || {
            format!("Sound example {} ({}) is missing, banned, replaced or needs current analysis. Choose it again or verify its analysis; the saved membership has been kept.", i+1, seed.title)
        };
        let Some((json, hash, directory, filename, size, modified, love, title, artist)) = found
        else {
            bail!(message())
        };
        if love == "B"
            || size < 0
            || !file_is_current(&directory, &filename, size as u64, &modified)
            || seed.audio_hash.as_ref().is_some_and(|h| h != &hash)
        {
            bail!(message())
        }
        let analysis = Analysis {
            profile: PROFILE.into(),
            features: serde_json::from_str(&json).unwrap_or_default(),
            weights: weights.clone(),
        };
        if Metric::new(&analysis).is_none() {
            bail!(message())
        }
        seed.audio_hash = Some(hash);
        seed.title = title;
        seed.artist = artist;
        analyses.push(analysis);
    }
    Ok(analyses)
}

struct Ranked {
    id: i64,
    key: String,
    artist: String,
    distance: f64,
    directory: String,
    filename: String,
    size: i64,
    modified: String,
}

pub(super) fn evaluate(
    conn: &Connection,
    request: &BrowseRequest,
    recipe: &mut SonicPlaylistRecipe,
    limit: usize,
) -> Result<Vec<AiPlaylistTrack>> {
    evaluate_indexed(conn, request, recipe, limit, true)
}

fn evaluate_indexed(
    conn: &Connection,
    request: &BrowseRequest,
    recipe: &mut SonicPlaylistRecipe,
    limit: usize,
    indexed: bool,
) -> Result<Vec<AiPlaylistTrack>> {
    if request.view != "tracks" {
        bail!("Sonic Smart playlists match songs. Choose Songs before adding sound examples.")
    }
    let analyses = resolve(conn, recipe)?;
    let metrics: Vec<_> = analyses.iter().map(|a| Metric::new(a).unwrap()).collect();
    let targets: Vec<_> = analyses.iter().map(|a| a.features.clone()).collect();
    let (where_sql, values) = build_where_clause(true, &request.search_text, &request.filters);
    let from = browse_from_clause(true);
    let and = if where_sql.is_empty() { "WHERE" } else { "AND" };
    let mut eligible_query = conn.prepare(&format!("SELECT s.track_key {from}
        JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename
        {where_sql} {and} s.profile=? AND COALESCE(t.love,'')!='B' AND lower(t.filename) LIKE '%.mp3'"))?;
    let mut values = values;
    values.push(Value::Text(PROFILE.into()));
    let mut eligible = eligible_query
        .query_map(params_from_iter(values), |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<HashSet<_>>>()?;
    for s in &recipe.seeds {
        eligible.remove(&s.track_key);
    }
    let mut width = limit.saturating_mul(4).max(1024);
    let selected = loop {
        // Expand until all unseen neighbors are farther than our final winner
        // (or the radius). A sparse filter/artist cap never silently truncates.
        let candidates = (indexed && width <= 65_536 && eligible.len() > 1024)
            .then(|| {
                crate::sonic_index::candidates(
                    conn,
                    &analyses[0],
                    &targets,
                    false,
                    width,
                    Some(&eligible),
                    &Default::default(),
                )
            })
            .flatten();
        let keys = candidates
            .as_ref()
            .map(|c| c.keys.clone())
            .unwrap_or_else(|| serde_json::to_string(&eligible).unwrap());
        let mut query = conn.prepare("SELECT t.id,s.track_key,COALESCE(NULLIF(t.display_artist,''),t.album_artist_display,''),a.features,s.directory,s.filename,s.size,s.modified
            FROM sonic.sonic_tracks s JOIN sonic.sonic_audio a USING(audio_hash,profile)
            JOIN tracks t ON t.file_path=s.directory AND t.filename=s.filename
            WHERE s.profile=?1 AND s.track_key IN (SELECT value FROM json_each(?2)) AND COALESCE(t.love,'')!='B'")?;
        let mut ranked = Vec::new();
        for row in query.query_map(params![PROFILE, keys], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, String>(7)?,
            ))
        })? {
            let (id, key, artist, json, directory, filename, size, modified) = row?;
            if !eligible.contains(&key) {
                continue;
            }
            let features: Vec<f32> = serde_json::from_str(&json).unwrap_or_default();
            let distance = metrics
                .iter()
                .filter_map(|m| m.distance(&features))
                .min_by(f64::total_cmp);
            if let Some(distance) = distance.filter(|d| *d <= recipe.max_distance) {
                ranked.push(Ranked {
                    id,
                    key,
                    artist: playlist_value_key(Some(&artist), "unknown artist"),
                    distance,
                    directory,
                    filename,
                    size,
                    modified,
                });
            }
        }
        ranked.sort_by(|a, b| a.distance.total_cmp(&b.distance).then(a.key.cmp(&b.key)));
        let mut counts = HashMap::<String, u32>::new();
        let mut selected = Vec::new();
        for row in ranked {
            let count = counts.entry(row.artist.clone()).or_default();
            if *count >= recipe.max_per_artist
                || row.size < 0
                || !file_is_current(
                    &row.directory,
                    &row.filename,
                    row.size as u64,
                    &row.modified,
                )
            {
                continue;
            }
            *count += 1;
            selected.push(row);
            if selected.len() == limit {
                break;
            }
        }
        let boundary = if selected.len() == limit {
            selected.last().unwrap().distance
        } else {
            recipe.max_distance
        };
        if candidates
            .as_ref()
            .is_none_or(|c| c.frontiers.iter().all(|f| *f > boundary))
        {
            break selected;
        }
        width = width.saturating_mul(2);
    };
    // Hydrate only the winning catalog IDs through the same native query path.
    let mut hydrated = HashMap::new();
    for chunk in selected.chunks(500) {
        let mut hydrate = request.clone();
        hydrate.filters.track_ids = chunk.iter().map(|r| r.id).collect();
        hydrate.offset = 0;
        hydrate.limit = 500;
        for row in search_library(conn, hydrate, 500)?.rows {
            let track = playlist_track_from_row(row)?;
            hydrated.insert(track.track_id, track);
        }
    }
    selected
        .into_iter()
        .map(|r| {
            hydrated
                .remove(&r.id)
                .context("A sonic match changed during refresh. Try again.")
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::seeded_connection;
    use music_sonic_core::{file_signature, track_key, DIMENSIONS};

    fn add(c: &Connection, dir: &Path, id: i64, x: f32, artist: &str) {
        let filename = format!("{id}.mp3");
        fs::write(dir.join(&filename), [id as u8; 20]).unwrap();
        let (size, modified) = file_signature(&dir.join(&filename)).unwrap();
        let directory = dir.to_string_lossy();
        c.execute("INSERT INTO tracks(id,import_run_id,album_id,title,display_artist,album_artist_display,canonical_genre,genre_normalized,year,file_path,filename,row_hash,time_seconds)
            VALUES(?1,1,'mb:test',?2,?3,?3,'Synthpop','synthpop',1985,?4,?2,?2,180)", params![id,filename,artist,directory]).unwrap();
        let mut f = vec![0.; DIMENSIONS];
        f[0] = x;
        c.execute(
            "INSERT INTO sonic.sonic_audio VALUES(?1,?2,?3)",
            params![filename, PROFILE, serde_json::to_string(&f).unwrap()],
        )
        .unwrap();
        c.execute(
            "INSERT INTO sonic.sonic_tracks VALUES(?1,?2,?3,?3,?4,?5,?6,'now')",
            params![
                track_key(&directory, &filename),
                directory,
                filename,
                PROFILE,
                size as i64,
                modified
            ],
        )
        .unwrap();
    }
    fn fixture() -> (
        tempfile::TempDir,
        Connection,
        crate::ai::SaveSmartPlaylistRequest,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let c = seeded_connection();
        c.execute_batch("DELETE FROM tracks; ATTACH DATABASE ':memory:' AS sonic;
            CREATE TABLE sonic.sonic_profiles(profile TEXT PRIMARY KEY,weights TEXT);
            CREATE TABLE sonic.sonic_audio(audio_hash TEXT,profile TEXT,features TEXT,PRIMARY KEY(audio_hash,profile));
            CREATE TABLE sonic.sonic_tracks(track_key TEXT PRIMARY KEY,directory TEXT,filename TEXT,audio_hash TEXT,profile TEXT,size INTEGER,modified TEXT,analyzed_at TEXT);").unwrap();
        let mut weights = vec![0.; DIMENSIONS * DIMENSIONS];
        for i in 0..DIMENSIONS {
            weights[i * DIMENSIONS + i] = 1.;
        }
        c.execute(
            "INSERT INTO sonic.sonic_profiles VALUES(?1,?2)",
            params![PROFILE, serde_json::to_string(&weights).unwrap()],
        )
        .unwrap();
        for (id, x, artist) in [
            (1, 0., "Seed"),
            (2, 0.125, "Same artist"),
            (3, 0.25, "Same artist"),
            (4, 0.375, "Other artist"),
            (5, 0.001, "Banned"),
            (6, 0.002, "Stale"),
            (7, 0.004, "Wrong year"),
            (8, 2.0, "Second seed"),
            (9, 2.1875, "Second region"),
        ] {
            add(&c, dir.path(), id, x, artist);
        }
        c.execute("UPDATE tracks SET love='B' WHERE id=5", [])
            .unwrap();
        fs::write(dir.path().join("6.mp3"), b"changed size").unwrap();
        c.execute("UPDATE tracks SET year=2000 WHERE id=7", [])
            .unwrap();
        let mut request = BrowseRequest {
            view: "tracks".into(),
            ..Default::default()
        };
        request.filters.year_from = Some(1980);
        request.filters.year_to = Some(1989);
        request.filters.missing_fields = vec!["rating".into()];
        let recipe = SonicPlaylistRecipe {
            version: 1,
            profile: PROFILE.into(),
            seeds: [1, 8]
                .into_iter()
                .map(|i| SonicPlaylistSeed {
                    track_key: track_key(&dir.path().to_string_lossy(), &format!("{i}.mp3")),
                    title: format!("{i}.mp3"),
                    artist: "Seed".into(),
                    audio_hash: None,
                })
                .collect(),
            max_distance: 0.5,
            max_per_artist: 1,
            ordering: "nearest".into(),
        };
        (
            dir,
            c,
            crate::ai::SaveSmartPlaylistRequest {
                id: None,
                expected_updated_at: None,
                name: "Late train home".into(),
                request,
                settings: crate::ai::SmartPlaylistSettings {
                    track_limit: 10,
                    refresh_policy: "library".into(),
                    sonic: Some(recipe),
                },
            },
        )
    }
    #[test]
    fn sonic_rules_combine_seeds_filters_caps_and_freshness_then_grow_on_refresh() {
        let (dir, c, input) = fixture();
        let saved = playlists::save_smart_playlist_on(&c, input).unwrap();
        let ids = |s: &SavedPlaylist| {
            s.playlist
                .tracks
                .iter()
                .map(|t| t.track_id)
                .collect::<Vec<_>>()
        };
        assert_eq!(ids(&saved), vec![2, 9, 4]);
        assert!(saved.playlist.description.contains("Insufficient"));
        assert!(saved
            .playlist
            .smart_settings
            .as_ref()
            .unwrap()
            .sonic
            .as_ref()
            .unwrap()
            .seeds
            .iter()
            .all(|s| s.audio_hash.is_some()));
        // A consumer's queue is a captured value, independent of publication.
        let playing_queue = serde_json::to_string(&saved.playlist.tracks).unwrap();
        add(&c, dir.path(), 10, 0.0625, "New import");
        c.execute("UPDATE tracks SET love='B' WHERE id=2", [])
            .unwrap();
        assert_eq!(
            playlists::refresh_all_smart_playlists_for_connection(&c).unwrap(),
            1
        );
        let refreshed = playlists::load_saved_playlist(&c, saved.id).unwrap();
        assert_eq!(ids(&refreshed), vec![10, 9, 3, 4]);
        assert_eq!(
            serde_json::to_string(&saved.playlist.tracks).unwrap(),
            playing_queue
        );
    }
    #[test]
    fn missing_or_replaced_seed_keeps_publication_and_records_refresh_failure() {
        let (_dir, c, input) = fixture();
        let saved = playlists::save_smart_playlist_on(&c, input).unwrap();
        let before = serde_json::to_string(&saved.playlist).unwrap();
        c.execute(
            "UPDATE sonic.sonic_tracks SET audio_hash='replacement' WHERE filename='1.mp3'",
            [],
        )
        .unwrap();
        assert_eq!(
            playlists::refresh_all_smart_playlists_for_connection(&c).unwrap(),
            0
        );
        let failed = playlists::load_saved_playlist(&c, saved.id).unwrap();
        assert_eq!(serde_json::to_string(&failed.playlist).unwrap(), before);
        assert_eq!(failed.updated_at, saved.updated_at);
        assert!(failed
            .automation
            .last_error
            .unwrap()
            .contains("Sound example 1"));
    }
    #[test]
    fn manual_policy_revisions_validation_and_empty_results_are_preserved() {
        let (_dir, c, mut input) = fixture();
        input.settings.refresh_policy = "manual".into();
        let saved = playlists::save_smart_playlist_on(&c, input.clone()).unwrap();
        c.execute(
            "UPDATE tracks SET normalized_rating=80 WHERE id NOT IN (1,8)",
            [],
        )
        .unwrap();
        assert_eq!(
            playlists::refresh_all_smart_playlists_for_connection(&c).unwrap(),
            0
        );
        assert_eq!(
            playlists::load_saved_playlist(&c, saved.id)
                .unwrap()
                .playlist
                .tracks
                .len(),
            3
        );
        let empty = playlists::evaluate_smart_playlist(&c, saved.id).unwrap();
        assert!(empty.playlist.tracks.is_empty());
        input.id = Some(saved.id);
        input.expected_updated_at = Some(saved.updated_at);
        assert!(playlists::save_smart_playlist_on(&c, input.clone()).is_err());
        input.id = None;
        input.request.view = "albums".into();
        assert!(playlists::save_smart_playlist_on(&c, input.clone()).is_err());
        input.request.view = "tracks".into();
        input.settings.sonic.as_mut().unwrap().version = 2;
        assert!(playlists::save_smart_playlist_on(&c, input).is_err());
    }

    #[test]
    fn indexed_expansion_matches_exact_scan_with_dense_artists_and_analysis_changes() {
        let (dir, memory, input) = fixture();
        for i in 11..1250 {
            add(
                &memory,
                dir.path(),
                i,
                0.001 + (i as f32) / 1_000_000.,
                "Crowded artist",
            );
        }
        let path = dir.path().join("music-library.sqlite3");
        let analysis_path = dir.path().join("music-analysis.sqlite3");
        memory
            .backup(rusqlite::DatabaseName::Main, &path, None)
            .unwrap();
        memory
            .backup(
                rusqlite::DatabaseName::Attached("sonic"),
                &analysis_path,
                None,
            )
            .unwrap();
        drop(memory);
        let c = Connection::open(&path).unwrap();
        configure(&c).unwrap();
        crate::sonic_index::install_catalog(&c).unwrap();
        let a = Connection::open(&analysis_path).unwrap();
        crate::sonic_index::install_analysis(&a).unwrap();
        drop(a);
        crate::sonic_index::rebuild(&path, &analysis_path).unwrap();
        let mut recipe = input.settings.sonic.unwrap();
        let first = evaluate_indexed(&c, &input.request, &mut recipe, 3, true).unwrap();
        let exact = evaluate_indexed(&c, &input.request, &mut recipe, 3, false).unwrap();
        assert_eq!(
            serde_json::to_value(&first).unwrap(),
            serde_json::to_value(&exact).unwrap()
        );
        // A warm exact prefix must expand past an entire same-artist crowd.
        assert_eq!(
            first.iter().map(|t| t.track_id).collect::<Vec<_>>(),
            vec![11, 2, 9]
        );
        c.execute("UPDATE tracks SET love='B' WHERE id=2", [])
            .unwrap();
        fs::write(dir.path().join("9.mp3"), b"now stale").unwrap();
        let next = evaluate_indexed(&c, &input.request, &mut recipe, 3, true).unwrap();
        let exact = evaluate_indexed(&c, &input.request, &mut recipe, 3, false).unwrap();
        assert_eq!(
            serde_json::to_value(&next).unwrap(),
            serde_json::to_value(&exact).unwrap()
        );
        assert_eq!(
            next.iter().map(|t| t.track_id).collect::<Vec<_>>(),
            vec![11, 3, 4]
        );
        assert!(c.execute("DELETE FROM sonic.sonic_audio", []).is_err());
    }

    #[test]
    #[ignore = "Opt-in read-only verification against a local analyzed catalog"]
    fn live_read_only_sonic_recipe_probe() {
        let dir = PathBuf::from(
            std::env::var("MUSIC_LIBRARY_SONIC_PROBE_DIR")
                .expect("Set MUSIC_LIBRARY_SONIC_PROBE_DIR"),
        );
        let c = Connection::open_with_flags(
            dir.join("music-library.sqlite3"),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        configure_reader(&c).unwrap();
        c.execute_batch("PRAGMA query_only=ON").unwrap();
        attach(&c).unwrap();
        let search_started = Instant::now();
        let seeds =
            crate::sonic_journey::search(&c, true, "Pet Shop Boys", &Default::default()).unwrap();
        println!("Read-only seed search: {:?}", search_started.elapsed());
        let seed = seeds
            .first()
            .expect("A current analyzed Pet Shop Boys seed");
        let mut recipe = SonicPlaylistRecipe {
            version: 1,
            profile: PROFILE.into(),
            seeds: vec![SonicPlaylistSeed {
                track_key: seed.track_key.clone(),
                title: seed.title.clone(),
                artist: seed.artist.clone(),
                audio_hash: None,
            }],
            max_distance: 0.2,
            max_per_artist: 2,
            ordering: "nearest".into(),
        };
        let mut request = BrowseRequest {
            view: "tracks".into(),
            ..Default::default()
        };
        request.filters.year_from = Some(1980);
        request.filters.year_to = Some(1989);
        request.filters.missing_fields = vec!["rating".into()];
        let start = Instant::now();
        // Disable cache rebuilding too: this probe writes neither catalog,
        // analysis, index files nor saved playlist membership.
        let tracks = evaluate_indexed(&c, &request, &mut recipe, 30, false).unwrap();
        assert!(!tracks.is_empty());
        assert!(tracks.len() <= 30);
        let mut counts = HashMap::<String, usize>::new();
        for t in &tracks {
            assert!(t.year.is_some_and(|y| (1980..=1989).contains(&y)));
            assert!(t.rating.is_none());
            let artist = playlist_value_key(
                t.display_artist.as_deref().or(t.album_artist.as_deref()),
                "unknown artist",
            );
            *counts.entry(artist).or_default() += 1;
        }
        assert!(counts.values().all(|n| *n <= 2));
        println!(
            "Read-only live recipe: {} unrated 1980s matches, {} track artists, {:?}, seed {}",
            tracks.len(),
            counts.len(),
            start.elapsed(),
            seed.title
        );
        assert_eq!(c.total_changes(), 0);
    }
}
