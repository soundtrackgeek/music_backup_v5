use super::*;

#[derive(Debug, Clone)]
pub(super) struct BillboardChartEntry {
    pub(super) source_file: String,
    pub(super) artist: String,
    pub(super) album: String,
    pub(super) artist_key: String,
    pub(super) album_key: String,
    pub(super) rank: i32,
    pub(super) year: i32,
    pub(super) first_appearance: String,
    pub(super) first_appearance_year: i32,
    pub(super) first_appearance_month: i32,
    pub(super) first_appearance_week: i32,
    pub(super) first_appearance_week_key: String,
}

#[derive(Debug, Clone)]
pub(super) struct BillboardSingleChartEntry {
    pub(super) source_file: String,
    pub(super) artist: String,
    pub(super) featured: String,
    pub(super) display_artist: String,
    pub(super) album: String,
    pub(super) album_key: String,
    pub(super) title: String,
    pub(super) artist_key: String,
    pub(super) title_key: String,
    pub(super) rank: i32,
    pub(super) year: i32,
    pub(super) date_entered_raw: String,
    pub(super) date_entered: Option<String>,
    pub(super) date_entered_year: Option<i32>,
    pub(super) date_entered_month: Option<i32>,
    pub(super) date_entered_week: Option<i32>,
    pub(super) date_entered_week_key: Option<String>,
    pub(super) date_entered_quality: String,
}

#[derive(Debug)]
pub(super) struct BillboardSingleTrackCandidate {
    pub(super) track_id: i64,
    pub(super) album_key: String,
    pub(super) album_artist_key: String,
    pub(super) year: Option<i32>,
    pub(super) normalized_rating: Option<i32>,
    pub(super) has_cover: bool,
    pub(super) source_album_key: String,
    pub(super) source_artist_key: String,
    pub(super) rank: i32,
    pub(super) chart_year: i32,
    pub(super) debut_date: Option<String>,
    pub(super) debut_year: Option<i32>,
    pub(super) debut_month: Option<i32>,
    pub(super) debut_week: Option<i32>,
    pub(super) debut_week_key: Option<String>,
    pub(super) entry_indexes: Vec<usize>,
}

#[derive(Debug, Clone)]
pub(super) struct VgListaChartEntry {
    pub(super) source_file: String,
    pub(super) year: i32,
    pub(super) week: i32,
    pub(super) rank: i32,
    pub(super) artist: String,
    pub(super) title: String,
    pub(super) artist_key: String,
    pub(super) title_key: String,
    pub(super) week_date: String,
    pub(super) month: i32,
    pub(super) week_key: String,
}

#[derive(Debug, Clone)]
pub(super) struct OfficialUkChartEntry {
    pub(super) source_file: String,
    pub(super) year: i32,
    pub(super) week: i32,
    pub(super) chart_date: String,
    pub(super) chart_end_date: String,
    pub(super) month: i32,
    pub(super) rank: i32,
    pub(super) last_week: String,
    pub(super) movement: String,
    pub(super) peak: String,
    pub(super) artist: String,
    pub(super) title: String,
    pub(super) artist_key: String,
    pub(super) title_key: String,
    pub(super) weeks_on_chart: String,
    pub(super) source_url: String,
    pub(super) item_url: String,
    pub(super) week_key: String,
}

#[derive(Debug)]
pub(super) struct WeeklyChartTrackCandidate {
    pub(super) track_id: i64,
    pub(super) album_artist_key: String,
    pub(super) year: Option<i32>,
    pub(super) normalized_rating: Option<i32>,
    pub(super) has_cover: bool,
    pub(super) source_artist_key: String,
    pub(super) rank: i32,
    pub(super) chart_year: i32,
    pub(super) debut_date: String,
    pub(super) debut_year: i32,
    pub(super) debut_month: i32,
    pub(super) debut_week: i32,
    pub(super) debut_week_key: String,
    pub(super) entry_indexes: Vec<usize>,
}

#[derive(Debug)]
pub(super) struct TrackChartReconciliationRow {
    pub(super) title: String,
    pub(super) track_id: i64,
    pub(super) album_key: String,
    pub(super) display_artist_key: String,
    /// Main performers of the display artist, lead first.
    pub(super) main_performers: Vec<String>,
    pub(super) title_key: String,
    pub(super) album_artist_key: String,
    pub(super) year: Option<i32>,
    pub(super) normalized_rating: Option<i32>,
    pub(super) has_cover: bool,
}

#[derive(Debug)]
pub(super) struct StoredTrackChartEntry {
    pub(super) title: String,
    pub(super) entry_id: i64,
    pub(super) match_artist_keys: Vec<String>,
    /// Main performers of the printed artist credit, lead first.
    pub(super) main_performers: Vec<String>,
    pub(super) source_artist_key: String,
    pub(super) title_key: String,
    pub(super) source_album_key: String,
    pub(super) rank: i32,
    pub(super) chart_year: i32,
    pub(super) chart_week: Option<i32>,
    pub(super) debut_date: Option<String>,
    pub(super) debut_year: Option<i32>,
    pub(super) debut_month: Option<i32>,
    pub(super) debut_week: Option<i32>,
    pub(super) debut_week_key: Option<String>,
}

#[derive(Debug)]
pub(super) struct ReconciledTrackChartMatch {
    pub(super) track_id: i64,
    pub(super) rank: i32,
    pub(super) chart_year: i32,
    pub(super) debut_date: Option<String>,
    pub(super) debut_year: Option<i32>,
    pub(super) debut_month: Option<i32>,
    pub(super) debut_week: Option<i32>,
    pub(super) debut_week_key: Option<String>,
    pub(super) entry_indexes: Vec<usize>,
}

#[derive(Debug, Clone)]
pub(super) struct TiISkuddetChartEntry {
    pub(super) source_file: String,
    pub(super) year: i32,
    pub(super) week: i32,
    pub(super) chart_date: String,
    pub(super) rank: i32,
    pub(super) rank_raw: String,
    pub(super) artist: String,
    pub(super) title: String,
    pub(super) artist_key: String,
    pub(super) title_key: String,
    pub(super) score_votes: String,
    pub(super) note: String,
    pub(super) chart_details: String,
    pub(super) source_url: String,
}

#[derive(Debug, Clone)]
pub(super) struct NorsktoppenChartEntry {
    pub(super) source_file: String,
    pub(super) year: i32,
    pub(super) week: i32,
    pub(super) chart_date: String,
    pub(super) rank: i32,
    pub(super) rank_raw: String,
    pub(super) artist: String,
    pub(super) title: String,
    pub(super) artist_key: String,
    pub(super) title_key: String,
    pub(super) points: String,
    pub(super) note: String,
    pub(super) chart_details: String,
    pub(super) source_url: String,
}

#[cfg(not(test))]
pub fn import_billboard_charts_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<BillboardImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_billboard_source_path(&source_path)?;
    import_billboard_charts(&mut conn, &source_path)
}

pub(super) fn import_billboard_charts(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<BillboardImportSummary> {
    let started = Instant::now();
    let csv_files = billboard_csv_files(source_path)?;
    if csv_files.is_empty() {
        bail!("No Billboard CSV files found in {}", source_path.display());
    }

    let mut files_scanned = 0_usize;
    let mut source_entry_count = 0_usize;
    let mut source_entries = Vec::new();
    let mut best_entries: HashMap<String, BillboardChartEntry> = HashMap::new();
    let mut entry_indexes_by_match_key: HashMap<String, Vec<usize>> = HashMap::new();
    for csv_file in csv_files {
        let year = billboard_year_from_path(&csv_file)?;
        let entries = read_billboard_chart_file(&csv_file, year)?;
        files_scanned += 1;
        source_entry_count += entries.len();
        for entry in entries {
            let entry_index = source_entries.len();
            for key in billboard_match_keys(&entry.artist_key, &entry.album_key) {
                entry_indexes_by_match_key
                    .entry(key.clone())
                    .or_default()
                    .push(entry_index);
                let should_replace = best_entries
                    .get(&key)
                    .map(|existing| {
                        entry.rank < existing.rank
                            || (entry.rank == existing.rank && entry.year < existing.year)
                    })
                    .unwrap_or(true);
                if should_replace {
                    best_entries.insert(key, entry.clone());
                }
            }
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Billboard chart import transaction")?;
    tx.execute(
        "
        UPDATE albums
        SET billboard_rank = NULL,
            billboard_year = NULL,
            billboard_debut_year = NULL,
            billboard_debut_month = NULL,
            billboard_debut_week = NULL,
            billboard_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing Billboard rankings")?;

    let mut matched_entry_album_ids = vec![None::<String>; source_entries.len()];
    let mut album_matches = Vec::new();
    {
        let mut stmt = tx.prepare(
            "
            SELECT id, album_artist_display, album
            FROM albums
            ",
        )?;
        let album_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (album_id, artist, album) in album_rows {
            let artist_key = crate::identity::loose_key(artist.as_deref().unwrap_or_default());
            let album_key = crate::identity::loose_key(album.as_deref().unwrap_or_default());
            if artist_key.is_empty() || album_key.is_empty() {
                continue;
            }

            let mut best_match: Option<&BillboardChartEntry> = None;
            for key in billboard_match_keys(&artist_key, &album_key) {
                if let Some(indexes) = entry_indexes_by_match_key.get(&key) {
                    for &entry_index in indexes {
                        if matched_entry_album_ids[entry_index].is_none() {
                            matched_entry_album_ids[entry_index] = Some(album_id.clone());
                        }
                    }
                }

                if let Some(entry) = best_entries.get(&key) {
                    if best_match
                        .map(|existing| {
                            entry.rank < existing.rank
                                || (entry.rank == existing.rank && entry.year < existing.year)
                        })
                        .unwrap_or(true)
                    {
                        best_match = Some(entry);
                    }
                }
            }

            if let Some(entry) = best_match {
                let earliest_debut = billboard_match_keys(&artist_key, &album_key)
                    .iter()
                    .filter_map(|key| entry_indexes_by_match_key.get(key))
                    .flatten()
                    .map(|index| &source_entries[*index])
                    .min_by(|left, right| {
                        left.first_appearance_week_key
                            .cmp(&right.first_appearance_week_key)
                    })
                    .unwrap_or(entry);
                album_matches.push((
                    album_id,
                    entry.rank,
                    entry.year,
                    earliest_debut.first_appearance_year,
                    earliest_debut.first_appearance_month,
                    earliest_debut.first_appearance_week,
                    earliest_debut.first_appearance_week_key.clone(),
                ));
            }
        }
    }

    {
        let mut update_album = tx.prepare(
            "
            UPDATE albums
            SET billboard_rank = ?1,
                billboard_year = ?2,
                billboard_debut_year = ?3,
                billboard_debut_month = ?4,
                billboard_debut_week = ?5,
                billboard_debut_week_key = ?6
            WHERE id = ?7
            ",
        )?;
        for (album_id, rank, year, debut_year, debut_month, debut_week, debut_week_key) in
            &album_matches
        {
            update_album
                .execute(params![
                    rank,
                    year,
                    debut_year,
                    debut_month,
                    debut_week,
                    debut_week_key,
                    album_id
                ])
                .with_context(|| format!("Could not update Billboard ranking for {album_id}"))?;
        }
    }

    tx.execute("DELETE FROM billboard_chart_entries", [])
        .context("Could not clear existing Billboard chart entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                first_appearance, first_appearance_year, first_appearance_month,
                first_appearance_week, first_appearance_week_key, matched_album_id, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
            )
            ",
        )?;
        for (index, entry) in source_entries.iter().enumerate() {
            insert_entry
                .execute(params![
                    &entry.source_file,
                    entry.year,
                    entry.rank,
                    &entry.artist,
                    &entry.album,
                    &entry.artist_key,
                    &entry.album_key,
                    &entry.first_appearance,
                    entry.first_appearance_year,
                    entry.first_appearance_month,
                    entry.first_appearance_week,
                    &entry.first_appearance_week_key,
                    matched_entry_album_ids[index].as_deref(),
                    &imported_at,
                ])
                .with_context(|| {
                    format!(
                        "Could not import Billboard chart entry #{} {} {}",
                        entry.rank, entry.artist, entry.album
                    )
                })?;
        }
    }

    tx.commit()
        .context("Could not commit Billboard chart import")?;

    Ok(BillboardImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned,
        chart_entries: source_entry_count,
        matched_albums: album_matches.len() as i64,
        dated_albums: album_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_billboard_singles_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<BillboardSinglesImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_billboard_source_path(&source_path)?;
    import_billboard_singles(&mut conn, &source_path)
}

pub(super) fn import_billboard_singles(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<BillboardSinglesImportSummary> {
    let started = Instant::now();
    let csv_files = billboard_csv_files(source_path)?;
    if csv_files.is_empty() {
        bail!(
            "No Billboard singles CSV files found in {}",
            source_path.display()
        );
    }

    let mut files_scanned = 0_usize;
    let mut source_entry_count = 0_usize;
    let mut source_entries = Vec::new();
    for csv_file in csv_files {
        let year = billboard_year_from_path(&csv_file)?;
        let entries = read_billboard_single_chart_file(&csv_file, year)?;
        files_scanned += 1;
        source_entry_count += entries.len();
        for entry in entries {
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Billboard singles import transaction")?;
    tx.execute(
        "
        UPDATE tracks
        SET billboard_single_rank = NULL,
            billboard_single_year = NULL,
            billboard_single_debut_date = NULL,
            billboard_single_debut_year = NULL,
            billboard_single_debut_month = NULL,
            billboard_single_debut_week = NULL,
            billboard_single_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing Billboard singles rankings")?;

    tx.execute("DELETE FROM billboard_single_chart_entries", [])
        .context("Could not clear existing Billboard singles chart entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO billboard_single_chart_entries (
                source_file, year, rank, artist, featured, display_artist, title,
                artist_key, title_key, album, album_key, date_entered_raw, date_entered,
                date_entered_year, date_entered_month, date_entered_week,
                date_entered_week_key, date_entered_quality, matched_track_id, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
            )
            ",
        )?;
        for entry in &source_entries {
            insert_entry
                .execute(params![
                    &entry.source_file,
                    entry.year,
                    entry.rank,
                    &entry.artist,
                    nonempty_str(&entry.featured),
                    &entry.display_artist,
                    &entry.title,
                    &entry.artist_key,
                    &entry.title_key,
                    &entry.album,
                    nonempty_str(&entry.album_key),
                    nonempty_str(&entry.date_entered_raw),
                    &entry.date_entered,
                    entry.date_entered_year,
                    entry.date_entered_month,
                    entry.date_entered_week,
                    &entry.date_entered_week_key,
                    &entry.date_entered_quality,
                    None::<i64>,
                    &imported_at,
                ])
                .with_context(|| {
                    format!(
                        "Could not import Billboard singles chart entry #{} {} {}",
                        entry.rank, entry.display_artist, entry.title
                    )
                })?;
        }
    }

    let tracks = load_track_chart_reconciliation_rows(&tx)?;
    let entries = load_billboard_single_reconciliation_entries(&tx)?;
    let track_matches = reconcile_billboard_single_entries(&tracks, &entries);
    apply_track_chart_reconciliation(
        &tx,
        "billboard_single_chart_entries",
        "billboard_single",
        &entries,
        &track_matches,
    )?;

    tx.commit()
        .context("Could not commit Billboard singles import")?;

    let exact_dates = source_entries
        .iter()
        .filter(|entry| entry.date_entered_quality == "exact")
        .count();
    let qualified_dates = source_entries
        .iter()
        .filter(|entry| entry.date_entered_quality == "qualified")
        .count();
    let missing_dates = source_entries
        .iter()
        .filter(|entry| entry.date_entered_quality == "missing")
        .count();
    let invalid_dates = source_entries
        .iter()
        .filter(|entry| entry.date_entered_quality == "invalid")
        .count();
    let dated_tracks = track_matches
        .iter()
        .filter(|track_match| track_match.debut_date.is_some())
        .count() as i64;

    Ok(BillboardSinglesImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned,
        chart_entries: source_entry_count,
        matched_tracks: track_matches.len() as i64,
        dated_tracks,
        exact_dates,
        qualified_dates,
        missing_dates,
        invalid_dates,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_vg_lista_albums_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<VgListaImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_vg_lista_source_path(&source_path)?;
    import_vg_lista_albums(&mut conn, &source_path)
}

pub(super) fn import_vg_lista_albums(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<VgListaImportSummary> {
    let started = Instant::now();
    let csv_files = chart_csv_files(source_path, "VG Lista")?;
    if csv_files.is_empty() {
        bail!(
            "No VG Lista album CSV files found in {}",
            source_path.display()
        );
    }

    let mut source_entries = Vec::new();
    let mut entry_indexes_by_match_key: HashMap<String, Vec<usize>> = HashMap::new();
    for csv_file in &csv_files {
        for entry in read_vg_lista_chart_file(csv_file)? {
            let entry_index = source_entries.len();
            for key in billboard_match_keys(&entry.artist_key, &entry.title_key) {
                entry_indexes_by_match_key
                    .entry(key)
                    .or_default()
                    .push(entry_index);
            }
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start VG Lista album import transaction")?;
    tx.execute(
        "
        UPDATE albums
        SET vg_lista_rank = NULL,
            vg_lista_year = NULL,
            vg_lista_debut_year = NULL,
            vg_lista_debut_month = NULL,
            vg_lista_debut_week = NULL,
            vg_lista_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing VG Lista album rankings")?;

    let mut matched_entry_album_ids = vec![None::<String>; source_entries.len()];
    let mut album_matches = Vec::new();
    {
        let mut stmt = tx.prepare("SELECT id, album_artist_display, album FROM albums")?;
        let album_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (album_id, artist, album) in album_rows {
            let artist_key = crate::identity::loose_key(artist.as_deref().unwrap_or_default());
            let title_key = crate::identity::loose_key(album.as_deref().unwrap_or_default());
            if artist_key.is_empty() || title_key.is_empty() {
                continue;
            }

            let mut entry_indexes = Vec::new();
            for key in billboard_match_keys(&artist_key, &title_key) {
                if let Some(indexes) = entry_indexes_by_match_key.get(&key) {
                    for &entry_index in indexes {
                        if !entry_indexes.contains(&entry_index) {
                            entry_indexes.push(entry_index);
                        }
                    }
                }
            }
            if entry_indexes.is_empty() {
                continue;
            }

            for &entry_index in &entry_indexes {
                matched_entry_album_ids[entry_index] = Some(album_id.clone());
            }
            let best = entry_indexes
                .iter()
                .map(|index| &source_entries[*index])
                .min_by_key(|entry| (entry.rank, entry.year, entry.week))
                .expect("matched VG Lista album entries are not empty");
            let debut = entry_indexes
                .iter()
                .map(|index| &source_entries[*index])
                .min_by_key(|entry| (entry.year, entry.week))
                .expect("matched VG Lista album entries are not empty");
            album_matches.push((
                album_id,
                best.rank,
                best.year,
                debut.year,
                debut.month,
                debut.week,
                debut.week_key.clone(),
            ));
        }
    }

    {
        let mut update_album = tx.prepare(
            "
            UPDATE albums
            SET vg_lista_rank = ?1,
                vg_lista_year = ?2,
                vg_lista_debut_year = ?3,
                vg_lista_debut_month = ?4,
                vg_lista_debut_week = ?5,
                vg_lista_debut_week_key = ?6
            WHERE id = ?7
            ",
        )?;
        for (album_id, rank, year, debut_year, debut_month, debut_week, debut_week_key) in
            &album_matches
        {
            update_album.execute(params![
                rank,
                year,
                debut_year,
                debut_month,
                debut_week,
                debut_week_key,
                album_id
            ])?;
        }
    }

    tx.execute("DELETE FROM vg_lista_album_chart_entries", [])
        .context("Could not clear existing VG Lista album entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO vg_lista_album_chart_entries (
                source_file, year, week, rank, artist, title, artist_key, title_key,
                week_date, week_key, matched_album_id, imported_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ",
        )?;
        for (index, entry) in source_entries.iter().enumerate() {
            insert_entry.execute(params![
                &entry.source_file,
                entry.year,
                entry.week,
                entry.rank,
                &entry.artist,
                &entry.title,
                &entry.artist_key,
                &entry.title_key,
                &entry.week_date,
                &entry.week_key,
                matched_entry_album_ids[index].as_deref(),
                &imported_at,
            ])?;
        }
    }

    tx.commit()
        .context("Could not commit VG Lista album import")?;
    Ok(VgListaImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned: csv_files.len(),
        chart_entries: source_entries.len(),
        matched_items: album_matches.len() as i64,
        dated_items: album_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_vg_lista_singles_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<VgListaImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_vg_lista_source_path(&source_path)?;
    import_vg_lista_singles(&mut conn, &source_path)
}

pub(super) fn import_vg_lista_singles(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<VgListaImportSummary> {
    let started = Instant::now();
    let csv_files = chart_csv_files(source_path, "VG Lista")?;
    if csv_files.is_empty() {
        bail!(
            "No VG Lista singles CSV files found in {}",
            source_path.display()
        );
    }

    let mut source_entries = Vec::new();
    for csv_file in &csv_files {
        for entry in read_vg_lista_chart_file(csv_file)? {
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start VG Lista singles import transaction")?;
    tx.execute(
        "
        UPDATE tracks
        SET vg_lista_rank = NULL,
            vg_lista_year = NULL,
            vg_lista_debut_date = NULL,
            vg_lista_debut_year = NULL,
            vg_lista_debut_month = NULL,
            vg_lista_debut_week = NULL,
            vg_lista_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing VG Lista singles rankings")?;

    tx.execute("DELETE FROM vg_lista_single_chart_entries", [])
        .context("Could not clear existing VG Lista single entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO vg_lista_single_chart_entries (
                source_file, year, week, rank, artist, title, artist_key, title_key,
                week_date, week_key, matched_track_id, imported_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ",
        )?;
        for entry in &source_entries {
            insert_entry.execute(params![
                &entry.source_file,
                entry.year,
                entry.week,
                entry.rank,
                &entry.artist,
                &entry.title,
                &entry.artist_key,
                &entry.title_key,
                &entry.week_date,
                &entry.week_key,
                None::<i64>,
                &imported_at,
            ])?;
        }
    }

    let tracks = load_track_chart_reconciliation_rows(&tx)?;
    let entries = load_weekly_track_chart_reconciliation_entries(
        &tx,
        "vg_lista_single_chart_entries",
        "week_date",
        Some("week_key"),
    )?;
    let track_matches = reconcile_weekly_track_chart_entries(&tracks, &entries);
    apply_track_chart_reconciliation(
        &tx,
        "vg_lista_single_chart_entries",
        "vg_lista",
        &entries,
        &track_matches,
    )?;

    tx.commit()
        .context("Could not commit VG Lista singles import")?;
    Ok(VgListaImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned: csv_files.len(),
        chart_entries: source_entries.len(),
        matched_items: track_matches.len() as i64,
        dated_items: track_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_official_uk_albums_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<OfficialUkImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_official_uk_source_path(&source_path)?;
    import_official_uk_albums(&mut conn, &source_path)
}

pub(super) fn import_official_uk_albums(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<OfficialUkImportSummary> {
    let started = Instant::now();
    let csv_files = chart_csv_files(source_path, "Official UK")?;
    if csv_files.is_empty() {
        bail!(
            "No Official UK album CSV files found in {}",
            source_path.display()
        );
    }

    let mut source_entries = Vec::new();
    let mut entry_indexes_by_match_key: HashMap<String, Vec<usize>> = HashMap::new();
    for csv_file in &csv_files {
        for entry in read_official_uk_chart_file(csv_file)? {
            let entry_index = source_entries.len();
            for key in billboard_match_keys(&entry.artist_key, &entry.title_key) {
                entry_indexes_by_match_key
                    .entry(key)
                    .or_default()
                    .push(entry_index);
            }
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Official UK album import transaction")?;
    tx.execute(
        "
        UPDATE albums
        SET official_uk_rank = NULL,
            official_uk_year = NULL,
            official_uk_debut_year = NULL,
            official_uk_debut_month = NULL,
            official_uk_debut_week = NULL,
            official_uk_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing Official UK album rankings")?;

    let mut matched_entry_album_ids = vec![None::<String>; source_entries.len()];
    let mut album_matches = Vec::new();
    {
        let mut stmt = tx.prepare("SELECT id, album_artist_display, album FROM albums")?;
        let album_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (album_id, artist, album) in album_rows {
            let artist_key = crate::identity::loose_key(artist.as_deref().unwrap_or_default());
            let title_key = crate::identity::loose_key(album.as_deref().unwrap_or_default());
            if artist_key.is_empty() || title_key.is_empty() {
                continue;
            }

            let mut entry_indexes = Vec::new();
            for key in billboard_match_keys(&artist_key, &title_key) {
                if let Some(indexes) = entry_indexes_by_match_key.get(&key) {
                    for &entry_index in indexes {
                        if !entry_indexes.contains(&entry_index) {
                            entry_indexes.push(entry_index);
                        }
                    }
                }
            }
            if entry_indexes.is_empty() {
                continue;
            }

            for &entry_index in &entry_indexes {
                matched_entry_album_ids[entry_index] = Some(album_id.clone());
            }
            let best = entry_indexes
                .iter()
                .map(|index| &source_entries[*index])
                .min_by_key(|entry| (entry.rank, entry.year, entry.week))
                .expect("matched Official UK album entries are not empty");
            let debut = entry_indexes
                .iter()
                .map(|index| &source_entries[*index])
                .min_by_key(|entry| (&entry.chart_date, entry.rank))
                .expect("matched Official UK album entries are not empty");
            album_matches.push((
                album_id,
                best.rank,
                best.year,
                debut.year,
                debut.month,
                debut.week,
                debut.week_key.clone(),
            ));
        }
    }

    {
        let mut update_album = tx.prepare(
            "
            UPDATE albums
            SET official_uk_rank = ?1,
                official_uk_year = ?2,
                official_uk_debut_year = ?3,
                official_uk_debut_month = ?4,
                official_uk_debut_week = ?5,
                official_uk_debut_week_key = ?6
            WHERE id = ?7
            ",
        )?;
        for (album_id, rank, year, debut_year, debut_month, debut_week, debut_week_key) in
            &album_matches
        {
            update_album.execute(params![
                rank,
                year,
                debut_year,
                debut_month,
                debut_week,
                debut_week_key,
                album_id
            ])?;
        }
    }

    tx.execute("DELETE FROM official_uk_album_chart_entries", [])
        .context("Could not clear existing Official UK album entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, chart_end_date, rank,
                last_week, movement, peak, artist, title, artist_key, title_key,
                weeks_on_chart, source_url, item_url, week_key, matched_album_id, imported_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
            ",
        )?;
        for (index, entry) in source_entries.iter().enumerate() {
            insert_entry.execute(params![
                &entry.source_file,
                entry.year,
                entry.week,
                &entry.chart_date,
                &entry.chart_end_date,
                entry.rank,
                &entry.last_week,
                &entry.movement,
                &entry.peak,
                &entry.artist,
                &entry.title,
                &entry.artist_key,
                &entry.title_key,
                &entry.weeks_on_chart,
                &entry.source_url,
                &entry.item_url,
                &entry.week_key,
                matched_entry_album_ids[index].as_deref(),
                &imported_at,
            ])?;
        }
    }

    tx.commit()
        .context("Could not commit Official UK album import")?;
    Ok(OfficialUkImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned: csv_files.len(),
        chart_entries: source_entries.len(),
        matched_items: album_matches.len() as i64,
        dated_items: album_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_official_uk_singles_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<OfficialUkImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_official_uk_source_path(&source_path)?;
    import_official_uk_singles(&mut conn, &source_path)
}

pub(super) fn import_official_uk_singles(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<OfficialUkImportSummary> {
    let started = Instant::now();
    let csv_files = chart_csv_files(source_path, "Official UK")?;
    if csv_files.is_empty() {
        bail!(
            "No Official UK singles CSV files found in {}",
            source_path.display()
        );
    }

    let mut source_entries = Vec::new();
    for csv_file in &csv_files {
        for entry in read_official_uk_chart_file(csv_file)? {
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Official UK singles import transaction")?;
    tx.execute(
        "
        UPDATE tracks
        SET official_uk_rank = NULL,
            official_uk_year = NULL,
            official_uk_debut_date = NULL,
            official_uk_debut_year = NULL,
            official_uk_debut_month = NULL,
            official_uk_debut_week = NULL,
            official_uk_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing Official UK singles rankings")?;

    tx.execute("DELETE FROM official_uk_single_chart_entries", [])
        .context("Could not clear existing Official UK single entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO official_uk_single_chart_entries (
                source_file, year, week, chart_date, chart_end_date, rank,
                last_week, movement, peak, artist, title, artist_key, title_key,
                weeks_on_chart, source_url, item_url, week_key, matched_track_id, imported_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
            ",
        )?;
        for entry in &source_entries {
            insert_entry.execute(params![
                &entry.source_file,
                entry.year,
                entry.week,
                &entry.chart_date,
                &entry.chart_end_date,
                entry.rank,
                &entry.last_week,
                &entry.movement,
                &entry.peak,
                &entry.artist,
                &entry.title,
                &entry.artist_key,
                &entry.title_key,
                &entry.weeks_on_chart,
                &entry.source_url,
                &entry.item_url,
                &entry.week_key,
                None::<i64>,
                &imported_at,
            ])?;
        }
    }

    let tracks = load_track_chart_reconciliation_rows(&tx)?;
    let entries = load_weekly_track_chart_reconciliation_entries(
        &tx,
        "official_uk_single_chart_entries",
        "chart_date",
        Some("week_key"),
    )?;
    let track_matches = reconcile_weekly_track_chart_entries(&tracks, &entries);
    apply_track_chart_reconciliation(
        &tx,
        "official_uk_single_chart_entries",
        "official_uk",
        &entries,
        &track_matches,
    )?;

    tx.commit()
        .context("Could not commit Official UK singles import")?;
    Ok(OfficialUkImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned: csv_files.len(),
        chart_entries: source_entries.len(),
        matched_items: track_matches.len() as i64,
        dated_items: track_matches.len() as i64,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_ti_i_skuddet_singles_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<TiISkuddetImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_ti_i_skuddet_source_path(&source_path)?;
    import_ti_i_skuddet_singles(&mut conn, &source_path)
}

pub(super) fn import_ti_i_skuddet_singles(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<TiISkuddetImportSummary> {
    let started = Instant::now();
    let csv_files = chart_csv_files(source_path, "Ti i Skuddet")?;
    if csv_files.is_empty() {
        bail!(
            "No Ti i Skuddet CSV files found in {}",
            source_path.display()
        );
    }

    let mut source_entries = Vec::new();
    let mut skipped_rows = 0;
    for csv_file in &csv_files {
        let (entries, file_skipped_rows) = read_ti_i_skuddet_chart_file(csv_file)?;
        skipped_rows += file_skipped_rows;
        for entry in entries {
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Ti i Skuddet import transaction")?;
    tx.execute(
        "
        UPDATE tracks
        SET ti_i_skuddet_rank = NULL,
            ti_i_skuddet_year = NULL,
            ti_i_skuddet_debut_date = NULL,
            ti_i_skuddet_debut_year = NULL,
            ti_i_skuddet_debut_month = NULL,
            ti_i_skuddet_debut_week = NULL,
            ti_i_skuddet_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing Ti i Skuddet rankings")?;

    tx.execute("DELETE FROM ti_i_skuddet_chart_entries", [])
        .context("Could not clear existing Ti i Skuddet entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO ti_i_skuddet_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw,
                artist, title, artist_key, title_key, score_votes, note,
                chart_details, source_url, matched_track_id, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
            )
            ",
        )?;
        for entry in &source_entries {
            insert_entry.execute(params![
                &entry.source_file,
                entry.year,
                entry.week,
                &entry.chart_date,
                entry.rank,
                &entry.rank_raw,
                &entry.artist,
                &entry.title,
                &entry.artist_key,
                &entry.title_key,
                &entry.score_votes,
                &entry.note,
                &entry.chart_details,
                &entry.source_url,
                None::<i64>,
                &imported_at,
            ])?;
        }
    }

    let tracks = load_track_chart_reconciliation_rows(&tx)?;
    let entries = load_weekly_track_chart_reconciliation_entries(
        &tx,
        "ti_i_skuddet_chart_entries",
        "chart_date",
        None,
    )?;
    let track_matches = reconcile_weekly_track_chart_entries(&tracks, &entries);
    apply_track_chart_reconciliation(
        &tx,
        "ti_i_skuddet_chart_entries",
        "ti_i_skuddet",
        &entries,
        &track_matches,
    )?;

    tx.commit()
        .context("Could not commit Ti i Skuddet import")?;
    Ok(TiISkuddetImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned: csv_files.len(),
        chart_entries: source_entries.len(),
        matched_tracks: track_matches.len() as i64,
        dated_tracks: track_matches.len() as i64,
        skipped_rows,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_norsktoppen_singles_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<NorsktoppenImportSummary> {
    let (mut conn, _) = open(app)?;
    let source_path = resolve_norsktoppen_source_path(&source_path)?;
    import_norsktoppen_singles(&mut conn, &source_path)
}

pub(super) fn import_norsktoppen_singles(
    conn: &mut Connection,
    source_path: &Path,
) -> Result<NorsktoppenImportSummary> {
    let started = Instant::now();
    let csv_files = chart_csv_files(source_path, "Norsktoppen")?;
    if csv_files.is_empty() {
        bail!(
            "No Norsktoppen CSV files found in {}",
            source_path.display()
        );
    }

    let mut source_entries = Vec::new();
    let mut skipped_rows = 0;
    for csv_file in &csv_files {
        let (entries, file_skipped_rows) = read_norsktoppen_chart_file(csv_file)?;
        skipped_rows += file_skipped_rows;
        for entry in entries {
            source_entries.push(entry);
        }
    }

    let tx = conn
        .transaction()
        .context("Could not start Norsktoppen import transaction")?;
    tx.execute(
        "
        UPDATE tracks
        SET norsktoppen_rank = NULL,
            norsktoppen_year = NULL,
            norsktoppen_debut_date = NULL,
            norsktoppen_debut_year = NULL,
            norsktoppen_debut_month = NULL,
            norsktoppen_debut_week = NULL,
            norsktoppen_debut_week_key = NULL
        ",
        [],
    )
    .context("Could not clear existing Norsktoppen rankings")?;

    tx.execute("DELETE FROM norsktoppen_chart_entries", [])
        .context("Could not clear existing Norsktoppen entries")?;
    {
        let imported_at = Utc::now().to_rfc3339();
        let mut insert_entry = tx.prepare(
            "
            INSERT INTO norsktoppen_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw,
                artist, title, artist_key, title_key, points, note,
                chart_details, source_url, matched_track_id, imported_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
            )
            ",
        )?;
        for entry in &source_entries {
            insert_entry.execute(params![
                &entry.source_file,
                entry.year,
                entry.week,
                &entry.chart_date,
                entry.rank,
                &entry.rank_raw,
                &entry.artist,
                &entry.title,
                &entry.artist_key,
                &entry.title_key,
                &entry.points,
                &entry.note,
                &entry.chart_details,
                &entry.source_url,
                None::<i64>,
                &imported_at,
            ])?;
        }
    }

    let tracks = load_track_chart_reconciliation_rows(&tx)?;
    let entries = load_weekly_track_chart_reconciliation_entries(
        &tx,
        "norsktoppen_chart_entries",
        "chart_date",
        None,
    )?;
    let track_matches = reconcile_weekly_track_chart_entries(&tracks, &entries);
    apply_track_chart_reconciliation(
        &tx,
        "norsktoppen_chart_entries",
        "norsktoppen",
        &entries,
        &track_matches,
    )?;

    tx.commit().context("Could not commit Norsktoppen import")?;
    Ok(NorsktoppenImportSummary {
        source_path: source_path.display().to_string(),
        files_scanned: csv_files.len(),
        chart_entries: source_entries.len(),
        matched_tracks: track_matches.len() as i64,
        dated_tracks: track_matches.len() as i64,
        skipped_rows,
        duration_ms: started.elapsed().as_millis(),
    })
}

pub(super) fn weekly_chart_track_candidate_priority(
    candidate: &WeeklyChartTrackCandidate,
) -> (bool, bool, i32, bool, i32, std::cmp::Reverse<i64>) {
    (
        billboard_single_album_artist_matches(
            &candidate.album_artist_key,
            &candidate.source_artist_key,
        ),
        !billboard_single_is_compilation_artist(&candidate.album_artist_key),
        billboard_single_release_year_score(candidate.year, Some(candidate.debut_year)),
        candidate.has_cover,
        candidate.normalized_rating.unwrap_or(i32::MIN),
        std::cmp::Reverse(candidate.track_id),
    )
}

pub(super) fn chart_csv_files(source_path: &Path, source_label: &str) -> Result<Vec<PathBuf>> {
    if source_path.is_file() {
        return Ok(vec![source_path.to_path_buf()]);
    }

    let mut files = fs::read_dir(source_path)
        .with_context(|| {
            format!(
                "Could not read {source_label} CSV folder {}",
                source_path.display()
            )
        })?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("csv"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

pub(super) fn read_vg_lista_chart_file(path: &Path) -> Result<Vec<VgListaChartEntry>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open VG Lista CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| format!("Could not read VG Lista CSV header {}", path.display()))?
        .clone();
    let year_index = chart_csv_header_index(&headers, "Year", "VG Lista")?;
    let week_index = chart_csv_header_index(&headers, "Week", "VG Lista")?;
    let rank_index = chart_csv_header_index(&headers, "Rank", "VG Lista")?;
    let artist_index = chart_csv_header_index(&headers, "Artist", "VG Lista")?;
    let title_index = chart_csv_header_index(&headers, "Title", "VG Lista")?;
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    for (row_index, result) in reader.records().enumerate() {
        let record = result
            .with_context(|| format!("Could not read VG Lista CSV row {}", path.display()))?;
        let year = record
            .get(year_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .ok_or_else(|| anyhow!("Invalid Year in {} row {}", path.display(), row_index + 2))?;
        let week = record
            .get(week_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|week| (1..=53).contains(week))
            .ok_or_else(|| anyhow!("Invalid Week in {} row {}", path.display(), row_index + 2))?;
        let week_date =
            NaiveDate::from_isoywd_opt(year, week as u32, Weekday::Mon).ok_or_else(|| {
                anyhow!(
                    "Invalid ISO Year/Week in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let rank = record
            .get(rank_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|rank| *rank > 0)
            .ok_or_else(|| anyhow!("Invalid Rank in {} row {}", path.display(), row_index + 2))?;
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist_key = crate::identity::loose_key(&artist);
        let title_key = crate::identity::loose_key(&title);
        if artist_key.is_empty() || title_key.is_empty() {
            continue;
        }
        entries.push(VgListaChartEntry {
            source_file: source_file.clone(),
            year,
            week,
            rank,
            artist,
            title,
            artist_key,
            title_key,
            week_date: week_date.format("%Y-%m-%d").to_string(),
            month: week_date.month() as i32,
            week_key: format!("{year:04}-W{week:02}"),
        });
    }

    Ok(entries)
}

pub(super) fn read_official_uk_chart_file(path: &Path) -> Result<Vec<OfficialUkChartEntry>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Official UK CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| format!("Could not read Official UK CSV header {}", path.display()))?
        .clone();
    let year_index = chart_csv_header_index(&headers, "Year", "Official UK")?;
    let week_index = chart_csv_header_index(&headers, "ISO Week", "Official UK")?;
    let chart_date_index = chart_csv_header_index(&headers, "Chart Date", "Official UK")?;
    let rank_index = chart_csv_header_index(&headers, "Rank", "Official UK")?;
    let artist_index = chart_csv_header_index(&headers, "Artist", "Official UK")?;
    let title_index = chart_csv_header_index(&headers, "Title", "Official UK")?;
    let chart_end_date_index = optional_chart_csv_header_index(&headers, "Chart End Date");
    let last_week_index = optional_chart_csv_header_index(&headers, "Last Week");
    let movement_index = optional_chart_csv_header_index(&headers, "Movement");
    let peak_index = optional_chart_csv_header_index(&headers, "Peak");
    let weeks_on_chart_index = optional_chart_csv_header_index(&headers, "Weeks on Chart");
    let source_url_index = optional_chart_csv_header_index(&headers, "Source URL");
    let item_url_index = optional_chart_csv_header_index(&headers, "Item URL");
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let field = |record: &csv::StringRecord, index: Option<usize>| {
        index
            .and_then(|value| record.get(value))
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let mut entries = Vec::new();
    for (row_index, result) in reader.records().enumerate() {
        let record = result
            .with_context(|| format!("Could not read Official UK CSV row {}", path.display()))?;
        let year = record
            .get(year_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .ok_or_else(|| anyhow!("Invalid Year in {} row {}", path.display(), row_index + 2))?;
        let week = record
            .get(week_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|week| (1..=53).contains(week))
            .ok_or_else(|| {
                anyhow!(
                    "Invalid ISO Week in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let chart_date_raw = record.get(chart_date_index).unwrap_or_default().trim();
        let chart_date = NaiveDate::parse_from_str(chart_date_raw, "%Y-%m-%d").map_err(|_| {
            anyhow!(
                "Invalid Chart Date in {} row {}",
                path.display(),
                row_index + 2
            )
        })?;
        let rank = record
            .get(rank_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|rank| *rank > 0)
            .ok_or_else(|| anyhow!("Invalid Rank in {} row {}", path.display(), row_index + 2))?;
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist_key = crate::identity::loose_key(&artist);
        let title_key = crate::identity::loose_key(&title);
        if artist_key.is_empty() || title_key.is_empty() {
            continue;
        }

        entries.push(OfficialUkChartEntry {
            source_file: source_file.clone(),
            year,
            week,
            chart_date: chart_date.format("%Y-%m-%d").to_string(),
            chart_end_date: field(&record, chart_end_date_index),
            month: chart_date.month() as i32,
            rank,
            last_week: field(&record, last_week_index),
            movement: field(&record, movement_index),
            peak: field(&record, peak_index),
            artist,
            title,
            artist_key,
            title_key,
            weeks_on_chart: field(&record, weeks_on_chart_index),
            source_url: field(&record, source_url_index),
            item_url: field(&record, item_url_index),
            week_key: format!("{year:04}-W{week:02}"),
        });
    }

    Ok(entries)
}

pub(super) fn read_ti_i_skuddet_chart_file(
    path: &Path,
) -> Result<(Vec<TiISkuddetChartEntry>, usize)> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Ti i Skuddet CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| format!("Could not read Ti i Skuddet CSV header {}", path.display()))?
        .clone();
    let year_index = chart_csv_header_index(&headers, "Year", "Ti i Skuddet")?;
    let week_index = chart_csv_header_index(&headers, "ISO Week", "Ti i Skuddet")?;
    let date_index = chart_csv_header_index(&headers, "Chart Date", "Ti i Skuddet")?;
    let rank_index = chart_csv_header_index(&headers, "Rank", "Ti i Skuddet")?;
    let artist_index = chart_csv_header_index(&headers, "Artist", "Ti i Skuddet")?;
    let title_index = chart_csv_header_index(&headers, "Title", "Ti i Skuddet")?;
    let score_index = optional_chart_csv_header_index(&headers, "Score / Votes");
    let note_index = optional_chart_csv_header_index(&headers, "Note");
    let details_index = optional_chart_csv_header_index(&headers, "Chart Details");
    let url_index = optional_chart_csv_header_index(&headers, "Source URL");
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    let mut skipped_rows = 0;
    for (row_index, result) in reader.records().enumerate() {
        let record = result
            .with_context(|| format!("Could not read Ti i Skuddet CSV row {}", path.display()))?;
        let year = record
            .get(year_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .ok_or_else(|| anyhow!("Invalid Year in {} row {}", path.display(), row_index + 2))?;
        let week = record
            .get(week_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|week| (1..=53).contains(week))
            .ok_or_else(|| {
                anyhow!(
                    "Invalid ISO Week in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let chart_date_raw = record.get(date_index).unwrap_or_default().trim();
        let chart_date =
            NaiveDate::parse_from_str(chart_date_raw, "%Y-%m-%d").with_context(|| {
                format!(
                    "Invalid Chart Date in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let iso_week = chart_date.iso_week();
        if iso_week.year() != year || iso_week.week() != week as u32 {
            bail!(
                "Chart Date does not match Year/ISO Week in {} row {}",
                path.display(),
                row_index + 2
            );
        }
        let rank_raw = record
            .get(rank_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let rank = parse_weekly_chart_rank(&rank_raw)
            .ok_or_else(|| anyhow!("Invalid Rank in {} row {}", path.display(), row_index + 2))?;
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist_key = crate::identity::loose_key(&artist);
        let title_key = crate::identity::loose_key(&title);
        if artist_key.is_empty() || title_key.is_empty() {
            skipped_rows += 1;
            continue;
        }
        let optional_value = |index: Option<usize>| {
            index
                .and_then(|index| record.get(index))
                .unwrap_or_default()
                .trim()
                .to_string()
        };
        entries.push(TiISkuddetChartEntry {
            source_file: source_file.clone(),
            year,
            week,
            chart_date: chart_date.format("%Y-%m-%d").to_string(),
            rank,
            rank_raw,
            artist,
            title,
            artist_key,
            title_key,
            score_votes: optional_value(score_index),
            note: optional_value(note_index),
            chart_details: optional_value(details_index),
            source_url: optional_value(url_index),
        });
    }

    Ok((entries, skipped_rows))
}

pub(super) fn read_norsktoppen_chart_file(
    path: &Path,
) -> Result<(Vec<NorsktoppenChartEntry>, usize)> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Norsktoppen CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| format!("Could not read Norsktoppen CSV header {}", path.display()))?
        .clone();
    let year_index = chart_csv_header_index(&headers, "Year", "Norsktoppen")?;
    let week_index = chart_csv_header_index(&headers, "ISO Week", "Norsktoppen")?;
    let date_index = chart_csv_header_index(&headers, "Chart Date", "Norsktoppen")?;
    let rank_index = chart_csv_header_index(&headers, "Rank", "Norsktoppen")?;
    let artist_index = chart_csv_header_index(&headers, "Artist", "Norsktoppen")?;
    let title_index = chart_csv_header_index(&headers, "Title", "Norsktoppen")?;
    let points_index = chart_csv_header_index(&headers, "Points", "Norsktoppen")?;
    let note_index = optional_chart_csv_header_index(&headers, "Note");
    let details_index = optional_chart_csv_header_index(&headers, "Chart Details");
    let url_index = optional_chart_csv_header_index(&headers, "Source URL");
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    let mut skipped_rows = 0;
    for (row_index, result) in reader.records().enumerate() {
        let record = result
            .with_context(|| format!("Could not read Norsktoppen CSV row {}", path.display()))?;
        let year = record
            .get(year_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .ok_or_else(|| anyhow!("Invalid Year in {} row {}", path.display(), row_index + 2))?;
        let week = record
            .get(week_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|week| (1..=53).contains(week))
            .ok_or_else(|| {
                anyhow!(
                    "Invalid ISO Week in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let chart_date_raw = record.get(date_index).unwrap_or_default().trim();
        let chart_date =
            NaiveDate::parse_from_str(chart_date_raw, "%Y-%m-%d").with_context(|| {
                format!(
                    "Invalid Chart Date in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let rank_raw = record
            .get(rank_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let rank = parse_weekly_chart_rank(&rank_raw)
            .ok_or_else(|| anyhow!("Invalid Rank in {} row {}", path.display(), row_index + 2))?;
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist_key = crate::identity::loose_key(&artist);
        let title_key = crate::identity::loose_key(&title);
        if artist_key.is_empty() || title_key.is_empty() {
            skipped_rows += 1;
            continue;
        }
        let optional_value = |index: Option<usize>| {
            index
                .and_then(|index| record.get(index))
                .unwrap_or_default()
                .trim()
                .to_string()
        };
        entries.push(NorsktoppenChartEntry {
            source_file: source_file.clone(),
            year,
            week,
            chart_date: chart_date.format("%Y-%m-%d").to_string(),
            rank,
            rank_raw,
            artist,
            title,
            artist_key,
            title_key,
            points: record
                .get(points_index)
                .unwrap_or_default()
                .trim()
                .to_string(),
            note: optional_value(note_index),
            chart_details: optional_value(details_index),
            source_url: optional_value(url_index),
        });
    }

    Ok((entries, skipped_rows))
}

pub(super) fn parse_weekly_chart_rank(value: &str) -> Option<i32> {
    value
        .split(|character| matches!(character, '-' | '–' | '—'))
        .next()
        .and_then(|rank| rank.trim().parse::<i32>().ok())
        .filter(|rank| *rank > 0)
}

pub(super) fn optional_chart_csv_header_index(
    headers: &csv::StringRecord,
    name: &str,
) -> Option<usize> {
    headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case(name))
}

pub(super) fn chart_csv_header_index(
    headers: &csv::StringRecord,
    name: &str,
    source_label: &str,
) -> Result<usize> {
    headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case(name))
        .ok_or_else(|| anyhow!("Missing required {source_label} CSV column: {name}"))
}

pub(super) fn resolve_vg_lista_source_path(source_path: &str) -> Result<PathBuf> {
    resolve_chart_source_path(source_path, "VG Lista")
}

pub(super) fn resolve_official_uk_source_path(source_path: &str) -> Result<PathBuf> {
    resolve_chart_source_path(source_path, "Official UK")
}

pub(super) fn resolve_ti_i_skuddet_source_path(source_path: &str) -> Result<PathBuf> {
    resolve_chart_source_path(source_path, "Ti i Skuddet")
}

pub(super) fn resolve_norsktoppen_source_path(source_path: &str) -> Result<PathBuf> {
    resolve_chart_source_path(source_path, "Norsktoppen")
}

pub(super) fn resolve_chart_source_path(source_path: &str, source_label: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a {source_label} CSV folder before starting import");
    }

    let provided = PathBuf::from(trimmed);
    let candidates = if provided.is_absolute() {
        vec![provided]
    } else {
        let cwd = std::env::current_dir().context("Could not read current working directory")?;
        let mut candidates = vec![cwd.join(&provided)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&provided));
        }
        candidates
    };

    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .map(|candidate| candidate.canonicalize().unwrap_or(candidate))
        .ok_or_else(|| anyhow!("Could not find {source_label} CSV source path: {source_path}"))
}

pub(super) fn billboard_csv_files(source_path: &Path) -> Result<Vec<PathBuf>> {
    if source_path.is_file() {
        return Ok(vec![source_path.to_path_buf()]);
    }

    let mut files = fs::read_dir(source_path)
        .with_context(|| {
            format!(
                "Could not read Billboard CSV folder {}",
                source_path.display()
            )
        })?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("csv"))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

pub(super) fn read_billboard_chart_file(
    path: &Path,
    year: i32,
) -> Result<Vec<BillboardChartEntry>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Billboard CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| format!("Could not read Billboard CSV header {}", path.display()))?
        .clone();
    let rank_index = csv_header_index(&headers, "EOY Rank")?;
    let artist_index = csv_header_index(&headers, "Artist")?;
    let title_index = csv_header_index(&headers, "Title")?;
    let first_appearance_index = csv_header_index(&headers, "First Appearance")?;
    let first_appearance_week_index = csv_header_index(&headers, "First Appearance Week")?;
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    for (row_index, result) in reader.records().enumerate() {
        let record = result
            .with_context(|| format!("Could not read Billboard CSV row {}", path.display()))?;
        let rank = record
            .get(rank_index)
            .and_then(|value| value.trim().parse::<i32>().ok());
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let album = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let artist_key = crate::identity::loose_key(&artist);
        let album_key = crate::identity::loose_key(&album);
        let first_appearance = record
            .get(first_appearance_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let first_appearance_date = parse_billboard_first_appearance(&first_appearance)
            .with_context(|| {
                format!(
                    "Invalid First Appearance in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let first_appearance_year = first_appearance_date.year();
        let first_appearance_month = first_appearance_date.month() as i32;
        let first_appearance_week = record
            .get(first_appearance_week_index)
            .and_then(|value| value.trim().parse::<i32>().ok())
            .filter(|week| (1..=53).contains(week))
            .ok_or_else(|| {
                anyhow!(
                    "Invalid First Appearance Week in {} row {}",
                    path.display(),
                    row_index + 2
                )
            })?;
        let first_appearance_iso_year =
            billboard_first_appearance_iso_year(first_appearance_date, first_appearance_week)
                .ok_or_else(|| {
                    anyhow!(
                        "First Appearance and ISO week do not overlap in {} row {}",
                        path.display(),
                        row_index + 2
                    )
                })?;
        let first_appearance_week_key =
            format!("{first_appearance_iso_year:04}-W{first_appearance_week:02}");
        if let Some(rank) = rank {
            if !artist_key.is_empty() && !album_key.is_empty() {
                entries.push(BillboardChartEntry {
                    source_file: source_file.clone(),
                    artist,
                    album,
                    artist_key,
                    album_key,
                    rank,
                    year,
                    first_appearance,
                    first_appearance_year,
                    first_appearance_month,
                    first_appearance_week,
                    first_appearance_week_key,
                });
            }
        }
    }

    Ok(entries)
}

pub(super) fn parse_billboard_first_appearance(value: &str) -> Result<NaiveDate> {
    for format in ["%b %Y", "%B %Y"] {
        if let Ok(date) = NaiveDate::parse_from_str(&format!("01 {value}"), &format!("%d {format}"))
        {
            return Ok(date);
        }
    }
    bail!("Expected a month and four-digit year, for example Mar 1989")
}

pub(super) fn billboard_first_appearance_iso_year(month: NaiveDate, week: i32) -> Option<i32> {
    let next_month = if month.month() == 12 {
        NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)?
    } else {
        NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)?
    };
    let month_end = next_month.pred_opt()?;

    [month.year() - 1, month.year(), month.year() + 1]
        .into_iter()
        .find(|iso_year| {
            NaiveDate::from_isoywd_opt(*iso_year, week as u32, Weekday::Mon)
                .map(|monday| {
                    let sunday = monday + chrono::Duration::days(6);
                    sunday >= month && monday <= month_end
                })
                .unwrap_or(false)
        })
}

pub(super) fn read_billboard_single_chart_file(
    path: &Path,
    year: i32,
) -> Result<Vec<BillboardSingleChartEntry>> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(path)
        .with_context(|| format!("Could not open Billboard singles CSV {}", path.display()))?;
    let headers = reader
        .headers()
        .with_context(|| {
            format!(
                "Could not read Billboard singles CSV header {}",
                path.display()
            )
        })?
        .clone();
    let rank_index = csv_header_index(&headers, "Yearly Rank")?;
    let artist_index = csv_header_index(&headers, "Artist")?;
    let featured_index = csv_header_index(&headers, "Featured")?;
    let album_index = headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case("Album"));
    let label_number_index = headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case("Label/Number"));
    let title_index = csv_header_index(&headers, "Track")?;
    let date_entered_index = headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case("Date Entered"));
    let source_file = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    let mut entries = Vec::new();
    for result in reader.records() {
        let record = result.with_context(|| {
            format!(
                "Could not read Billboard singles CSV row {}",
                path.display()
            )
        })?;
        let rank = record
            .get(rank_index)
            .and_then(|value| value.trim().parse::<i32>().ok());
        let artist = record
            .get(artist_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let featured = record
            .get(featured_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = record
            .get(title_index)
            .unwrap_or_default()
            .trim()
            .to_string();
        let album = album_index
            .and_then(|index| record.get(index))
            .unwrap_or_default()
            .trim()
            .to_string();
        let label_number = label_number_index
            .and_then(|index| record.get(index))
            .unwrap_or_default()
            .trim();
        let display_artist = billboard_single_display_artist(&artist, &featured);
        let artist_key = crate::identity::loose_key(&display_artist);
        let title_key = crate::identity::loose_key(&title);
        let album_key = billboard_single_source_album_key(&album, label_number);
        let date_entered_raw = date_entered_index
            .and_then(|index| record.get(index))
            .unwrap_or_default()
            .trim()
            .to_string();
        let (date_entered, date_entered_quality) =
            parse_billboard_single_date_entered(&date_entered_raw, year);
        let (date_entered_year, date_entered_month, date_entered_week, date_entered_week_key) =
            date_entered
                .as_ref()
                .map(|date| {
                    let iso_week = date.iso_week();
                    (
                        Some(date.year()),
                        Some(date.month() as i32),
                        Some(iso_week.week() as i32),
                        Some(format!("{:04}-W{:02}", iso_week.year(), iso_week.week())),
                    )
                })
                .unwrap_or((None, None, None, None));
        if let Some(rank) = rank {
            if !artist_key.is_empty() && !title_key.is_empty() {
                entries.push(BillboardSingleChartEntry {
                    source_file: source_file.clone(),
                    artist,
                    featured,
                    display_artist,
                    artist_key,
                    album,
                    album_key,
                    title,
                    title_key,
                    rank,
                    year,
                    date_entered_raw,
                    date_entered: date_entered.map(|date| date.format("%Y-%m-%d").to_string()),
                    date_entered_year,
                    date_entered_month,
                    date_entered_week,
                    date_entered_week_key,
                    date_entered_quality,
                });
            }
        }
    }

    Ok(entries)
}

pub(super) fn parse_billboard_single_date_entered(
    value: &str,
    chart_year: i32,
) -> (Option<NaiveDate>, String) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return (None, "missing".to_string());
    }

    let qualified = trimmed.ends_with('+');
    let candidate = trimmed.trim_end_matches('+').trim();
    let mut parsed = NaiveDate::parse_from_str(candidate, "%Y-%m-%d").ok();

    if parsed.is_none() {
        let parts = candidate.split('/').collect::<Vec<_>>();
        if parts.len() == 3 {
            let month = parts[0].parse::<u32>().ok();
            let day = parts[1].parse::<u32>().ok();
            let year = parts[2].parse::<i32>().ok().and_then(|year| {
                if parts[2].len() == 4 {
                    Some(year)
                } else if parts[2].len() == 2 {
                    let century = chart_year.div_euclid(100) * 100;
                    let mut inferred_year = century + year;
                    if inferred_year > chart_year + 1 {
                        inferred_year -= 100;
                    }
                    Some(inferred_year)
                } else {
                    None
                }
            });
            if let (Some(month), Some(day), Some(year)) = (month, day, year) {
                parsed = NaiveDate::from_ymd_opt(year, month, day);
            }
        }
    }

    let Some(date) = parsed else {
        return (None, "invalid".to_string());
    };
    let plausible = date.year() >= chart_year - 1
        && (date.year() <= chart_year || (date.year() == chart_year + 1 && date.month() <= 2));
    if !plausible {
        return (None, "invalid".to_string());
    }

    (
        Some(date),
        if qualified {
            "qualified".to_string()
        } else {
            "exact".to_string()
        },
    )
}

pub(super) fn csv_header_index(headers: &csv::StringRecord, name: &str) -> Result<usize> {
    headers
        .iter()
        .position(|header| header.trim().eq_ignore_ascii_case(name))
        .ok_or_else(|| anyhow!("Missing required Billboard CSV column: {name}"))
}

pub(super) fn billboard_year_from_path(path: &Path) -> Result<i32> {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .and_then(|stem| stem.trim().parse::<i32>().ok())
        .with_context(|| format!("Billboard CSV filename must be a year: {}", path.display()))
}

pub(super) fn resolve_billboard_source_path(source_path: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a Billboard CSV folder before starting import");
    }

    let provided = PathBuf::from(trimmed);
    let candidates = if provided.is_absolute() {
        vec![provided]
    } else {
        let cwd = std::env::current_dir().context("Could not read current working directory")?;
        let mut candidates = vec![cwd.join(&provided)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&provided));
        }
        candidates
    };

    candidates
        .into_iter()
        .find(|candidate| candidate.exists())
        .map(|candidate| candidate.canonicalize().unwrap_or(candidate))
        .ok_or_else(|| anyhow!("Could not find Billboard CSV source path: {source_path}"))
}

pub(super) fn billboard_match_key(artist_key: &str, album_key: &str) -> String {
    format!("{artist_key}\u{1f}{album_key}")
}

pub(super) fn billboard_match_keys(artist_key: &str, album_key: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for artist in billboard_key_variants(artist_key) {
        for album in billboard_key_variants(album_key) {
            let key = billboard_match_key(&artist, &album);
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    keys
}

pub(super) fn billboard_single_artist_key_variants(key: &str) -> Vec<String> {
    let mut variants = Vec::new();
    // A source-specific disambiguator, not a different performer. Do not strip
    // arbitrary country/name suffixes from unrelated artists.
    if key == "jade usa" {
        push_unique(&mut variants, "jade".to_string());
    }
    for base in billboard_key_variants(key) {
        push_unique(&mut variants, base.clone());
        let without_connectors = remove_artist_connector_tokens(&base);
        if !without_connectors.is_empty() {
            push_unique(&mut variants, without_connectors);
        }
    }
    variants
}

pub(super) fn billboard_single_title_key_variants(key: &str) -> Vec<String> {
    let mut variants = vec![key.to_string()];
    if let Some(stripped) = strip_title_feature_suffix(key) {
        push_unique(&mut variants, stripped);
    }
    // Existing aliases precede the raw-title parenthetical fallback.
    // Keep punctuation intact separately so version ambiguity can be checked.
    for base in variants.clone() {
        for suffix in [" album version", " lp version", " album walk", " lp"] {
            if let Some(stripped) = base.strip_suffix(suffix).filter(|value| !value.is_empty()) {
                push_unique(&mut variants, stripped.to_string());
            }
        }
        if base == "a whole new world aladdin s theme" {
            push_unique(&mut variants, "a whole new world".to_string());
        }
    }
    variants
}

pub(super) fn remove_artist_connector_tokens(key: &str) -> String {
    key.split_whitespace()
        .filter(|part| !matches!(*part, "feat" | "featuring" | "ft" | "with" | "and" | "x"))
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn strip_title_feature_suffix(key: &str) -> Option<String> {
    let parts = key.split_whitespace().collect::<Vec<_>>();
    let index = parts
        .iter()
        .position(|part| matches!(*part, "feat" | "featuring" | "ft"))?;
    if index == 0 {
        None
    } else {
        Some(parts[..index].join(" "))
    }
}

pub(super) fn billboard_single_display_artist(artist: &str, featured: &str) -> String {
    let artist = artist.trim();
    let featured = featured
        .trim()
        .trim_start_matches(|character| matches!(character, ',' | ';'))
        .trim();
    if featured.is_empty() {
        artist.to_string()
    } else {
        compact_whitespace(&format!("{artist} {featured}"))
    }
}

pub(super) fn billboard_single_source_album_key(album: &str, label_number: &str) -> String {
    let album = album.trim();
    let raw_key = crate::identity::loose_key(album);
    if raw_key.is_empty()
        || matches!(
            raw_key.as_str(),
            "s" | "single" | "none" | "unknown" | "unk" | "n a" | "na" | "tbd"
        )
    {
        return String::new();
    }

    let cleaned = [" - ", " – ", " — "]
        .into_iter()
        .find_map(|separator| {
            let separator_index = album.rfind(separator)?;
            let title = album[..separator_index].trim();
            let suffix = album[separator_index + separator.len()..].trim();
            if title.is_empty()
                || !suffix.chars().any(|character| character.is_ascii_digit())
                || !billboard_single_catalog_label_matches(suffix, label_number)
            {
                return None;
            }
            Some(title)
        })
        .unwrap_or(album);

    crate::identity::loose_key(cleaned)
}

pub(super) fn billboard_single_catalog_label_matches(
    album_suffix: &str,
    label_number: &str,
) -> bool {
    let suffix_key = crate::identity::loose_key(album_suffix);
    let label_key = crate::identity::loose_key(label_number);
    if suffix_key.is_empty() || label_key.is_empty() {
        return false;
    }

    let suffix_tokens = suffix_key
        .split_whitespace()
        .filter(|token| token.chars().all(char::is_alphabetic))
        .collect::<Vec<_>>();
    let label_tokens = label_key
        .split_whitespace()
        .filter(|token| token.chars().all(char::is_alphabetic))
        .collect::<Vec<_>>();
    suffix_tokens
        .iter()
        .any(|suffix| suffix.len() >= 2 && label_tokens.iter().any(|label| suffix == label))
        || (suffix_tokens.len() >= 2
            && label_tokens.len() >= 2
            && suffix_tokens[..2] == label_tokens[..2])
}

pub(super) fn billboard_single_album_match_score(
    library_album_key: &str,
    source_album_key: &str,
) -> i32 {
    if library_album_key.is_empty() || source_album_key.is_empty() {
        return 0;
    }

    let library_variants = billboard_key_variants(library_album_key);
    let source_variants = billboard_key_variants(source_album_key);
    if library_variants
        .iter()
        .any(|library| source_variants.iter().any(|source| library == source))
    {
        return 4;
    }

    if library_variants.iter().any(|library| {
        source_variants.iter().any(|source| {
            library
                .strip_prefix(source)
                .is_some_and(|suffix| suffix.starts_with(' '))
                || source
                    .strip_prefix(library)
                    .is_some_and(|suffix| suffix.starts_with(' '))
        })
    }) {
        return 3;
    }

    let library_tokens = library_album_key.split_whitespace().collect::<HashSet<_>>();
    let source_tokens = source_album_key.split_whitespace().collect::<HashSet<_>>();
    let shared = library_tokens.intersection(&source_tokens).count();
    let required = library_tokens.len().min(source_tokens.len());
    if required >= 2 && shared * 4 >= required * 3 {
        2
    } else {
        0
    }
}

pub(super) fn billboard_single_album_artist_matches(
    album_artist_key: &str,
    source_artist_key: &str,
) -> bool {
    if album_artist_key.is_empty() || source_artist_key.is_empty() {
        return false;
    }
    let album_variants = billboard_single_artist_key_variants(album_artist_key);
    let source_variants = billboard_single_artist_key_variants(source_artist_key);
    album_variants
        .iter()
        .any(|album| source_variants.iter().any(|source| album == source))
}

pub(super) fn billboard_single_is_compilation_artist(album_artist_key: &str) -> bool {
    matches!(
        album_artist_key,
        "various" | "various artist" | "various artists" | "v a"
    )
}

pub(super) fn billboard_single_release_year_score(
    year: Option<i32>,
    debut_year: Option<i32>,
) -> i32 {
    let (Some(year), Some(debut_year)) = (year, debut_year) else {
        return 0;
    };
    let difference = year - debut_year;
    match difference {
        0 => 5,
        -1 => 4,
        -2 => 3,
        1 => 2,
        -5..=-3 | 2..=5 => 1,
        _ => 0,
    }
}

pub(super) fn billboard_single_candidate_priority(
    candidate: &BillboardSingleTrackCandidate,
) -> (i32, bool, bool, i32, bool, i32, std::cmp::Reverse<i64>) {
    (
        billboard_single_album_match_score(&candidate.album_key, &candidate.source_album_key),
        billboard_single_album_artist_matches(
            &candidate.album_artist_key,
            &candidate.source_artist_key,
        ),
        !billboard_single_is_compilation_artist(&candidate.album_artist_key),
        billboard_single_release_year_score(candidate.year, candidate.debut_year),
        candidate.has_cover,
        candidate.normalized_rating.unwrap_or(i32::MIN),
        std::cmp::Reverse(candidate.track_id),
    )
}

pub(super) fn billboard_key_variants(key: &str) -> Vec<String> {
    let mut variants = vec![key.to_string()];
    if let Some(stripped) = key.strip_prefix("the ") {
        if !stripped.is_empty() {
            variants.push(stripped.to_string());
        }
    }
    variants
}

pub(super) fn compact_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(super) fn nonempty_str(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn imports_billboard_csv_and_keeps_best_overlap_rank() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-billboard-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create billboard csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "EOY Rank,Artist,Title,First Appearance,First Appearance Week\n1,WHITNEY HOUSTON,Whitney,Jun 1987,23\n103,PET SHOP BOYS,Actually,Sep 1987,36\n",
        )
        .expect("write 1987 chart");
        fs::write(
            source_dir.join("1988.csv"),
            "EOY Rank,Artist,Title,First Appearance,First Appearance Week\n7,WHITNEY HOUSTON,Whitney,Jun 1987,23\n107,PET SHOP BOYS,Actually,Sep 1987,36\n",
        )
        .expect("write 1988 chart");

        let summary =
            import_billboard_charts(&mut conn, &source_dir).expect("import billboard charts");
        let response = search_library(&conn, BrowseRequest::default(), 50).expect("search albums");

        assert_eq!(summary.files_scanned, 2);
        assert_eq!(summary.chart_entries, 4);
        assert_eq!(summary.matched_albums, 1);
        assert_eq!(summary.dated_albums, 1);
        assert_eq!(response.rows[0].billboard_rank, Some(103));
        assert_eq!(response.rows[0].billboard_year, Some(1987));
        assert_eq!(response.rows[0].billboard_debut_year, Some(1987));
        assert_eq!(response.rows[0].billboard_debut_month, Some(9));
        assert_eq!(response.rows[0].billboard_debut_week, Some(36));
        assert_eq!(
            response.rows[0].billboard_debut_week_key.as_deref(),
            Some("1987-W36")
        );

        let mut debut_request = BrowseRequest::default();
        debut_request.filters.billboard_debut_week_from = Some("1987-W36".to_string());
        debut_request.filters.billboard_debut_week_to = Some("1987-W36".to_string());
        let debut_response = search_library(&conn, debut_request, 50)
            .expect("filter albums by Billboard debut week");
        assert_eq!(debut_response.total, 1);
        assert_eq!(debut_response.rows[0].album.as_deref(), Some("Actually"));

        let timeline = album_debut_timeline(&conn, None).expect("build album debut timeline");
        assert_eq!(timeline.selected_year, Some(1987));
        assert_eq!(timeline.dated_album_count, 1);
        assert_eq!(timeline.undated_album_count, 0);
        assert_eq!(timeline.years.len(), 1);
        assert_eq!(timeline.years[0].album_count, 1);
        assert_eq!(timeline.albums.len(), 1);
        assert_eq!(timeline.albums[0].album.as_deref(), Some("Actually"));
        assert_eq!(timeline.albums[0].billboard_debut_week, 36);

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "missing-chart-albums".to_string();
        let missing_response =
            list_music_tool_issues(&conn, request, 50, None).expect("list missing chart albums");

        assert_eq!(missing_response.tool.issue_count, 1);
        assert_eq!(missing_response.tool.album_count, 1);
        assert_eq!(missing_response.total, 1);
        assert_eq!(missing_response.rows[0].album.as_deref(), Some("Whitney"));
        assert_eq!(
            missing_response.rows[0].album_artist_display.as_deref(),
            Some("WHITNEY HOUSTON")
        );
        assert_eq!(
            missing_response.rows[0].value.as_deref(),
            Some("Billboard #1 / 1987")
        );
        assert_eq!(
            missing_response.rows[0].billboard.as_deref(),
            Some("#1 / 1987")
        );

        fs::remove_dir_all(source_dir).expect("remove billboard csv dir");
    }

    #[test]
    fn imports_vg_lista_albums_with_weekly_entries_filters_and_norway_timeline() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-vg-lista-albums-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create VG Lista album csv dir");
        fs::write(
            source_dir.join("albums-1987.csv"),
            "Year,Week,Rank,Last Week,Movement,Artist,Title,Weeks on Chart,Source URL\n\
             1987,36,5,,,Pet Shop Boys,Actually,1,https://example.test/1987-36\n\
             1987,37,1,5,4,Pet Shop Boys,Actually,2,https://example.test/1987-37\n\
             1987,37,2,,,Whitney Houston,Whitney,1,https://example.test/1987-37\n",
        )
        .expect("write VG Lista album chart");

        let summary =
            import_vg_lista_albums(&mut conn, &source_dir).expect("import VG Lista albums");
        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_items, 1);
        assert_eq!(summary.dated_items, 1);

        let weekly_rows: (i64, i64) = conn
            .query_row(
                "
                SELECT COUNT(*), COUNT(matched_album_id)
                FROM vg_lista_album_chart_entries
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("count VG Lista album entries");
        assert_eq!(weekly_rows, (3, 2));

        let response =
            search_library(&conn, BrowseRequest::default(), 50).expect("search VG Lista albums");
        assert_eq!(response.rows[0].vg_lista_rank, Some(1));
        assert_eq!(response.rows[0].vg_lista_year, Some(1987));
        assert_eq!(response.rows[0].vg_lista_debut_year, Some(1987));
        assert_eq!(response.rows[0].vg_lista_debut_month, Some(8));
        assert_eq!(response.rows[0].vg_lista_debut_week, Some(36));
        assert_eq!(
            response.rows[0].vg_lista_debut_week_key.as_deref(),
            Some("1987-W36")
        );

        let mut filter_request = BrowseRequest::default();
        filter_request.filters.vg_lista_rank_min = Some(1);
        filter_request.filters.vg_lista_rank_max = Some(1);
        filter_request.filters.missing_fields = vec!["billboard".to_string()];
        filter_request.filters.vg_lista_debut_week_from = Some("1987-W36".to_string());
        filter_request.filters.vg_lista_debut_week_to = Some("1987-W36".to_string());
        filter_request.sort = BrowseSort {
            field: "vgListaDebut".to_string(),
            direction: "asc".to_string(),
        };
        let filtered = search_library(&conn, filter_request, 50)
            .expect("filter VG Lista albums missing Billboard data");
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.rows[0].album.as_deref(), Some("Actually"));

        let timeline = album_debut_timeline_for_source(&conn, Some(1987), "NO")
            .expect("build Norway album debut timeline");
        assert_eq!(timeline.selected_year, Some(1987));
        assert_eq!(timeline.dated_album_count, 1);
        assert_eq!(timeline.undated_album_count, 0);
        assert_eq!(timeline.albums.len(), 1);
        assert_eq!(timeline.albums[0].billboard_rank, Some(1));
        assert_eq!(timeline.albums[0].billboard_debut_week_key, "1987-W36");

        fs::remove_dir_all(source_dir).expect("remove VG Lista album csv dir");
    }

    #[test]
    fn imports_official_uk_albums_with_source_details_filters_and_timeline() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-official-uk-albums-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create Official UK album csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "Year,ISO Week,Chart Date,Chart End Date,Rank,Last Week,Movement,Peak,Artist,Title,Weeks on Chart,Source URL,Item URL\n\
             1987,36,1987-09-04,1987-09-10,5,,,5,Pet Shop Boys,Actually,1,https://example.test/albums/1987-36,https://example.test/actually\n\
             1987,37,1987-09-11,1987-09-17,1,5,Up,1,Pet Shop Boys,Actually,2,https://example.test/albums/1987-37,https://example.test/actually\n\
             1987,37,1987-09-11,1987-09-17,2,,,2,Whitney Houston,Whitney,1,https://example.test/albums/1987-37,https://example.test/whitney\n",
        )
        .expect("write Official UK album chart");

        let summary =
            import_official_uk_albums(&mut conn, &source_dir).expect("import Official UK albums");
        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_items, 1);

        let source_row: (i64, i64, String, String, String, String) = conn
            .query_row(
                "
                SELECT COUNT(*), COUNT(matched_album_id), chart_end_date,
                       movement, peak, item_url
                FROM official_uk_album_chart_entries
                WHERE rank = 1
                ",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("read Official UK source details");
        assert_eq!(source_row.0, 1);
        assert_eq!(source_row.1, 1);
        assert_eq!(source_row.2, "1987-09-17");
        assert_eq!(source_row.3, "Up");
        assert_eq!(source_row.4, "1");
        assert_eq!(source_row.5, "https://example.test/actually");

        let mut request = BrowseRequest::default();
        request.filters.official_uk_rank_min = Some(1);
        request.filters.official_uk_rank_max = Some(1);
        request.filters.official_uk_debut_week_from = Some("1987-W36".to_string());
        request.filters.official_uk_debut_week_to = Some("1987-W36".to_string());
        request.sort = BrowseSort {
            field: "officialUkDebut".to_string(),
            direction: "asc".to_string(),
        };
        let response =
            search_library(&conn, request, 50).expect("filter Official UK album metadata");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].official_uk_rank, Some(1));
        assert_eq!(response.rows[0].official_uk_debut_month, Some(9));
        assert_eq!(
            response.rows[0].official_uk_debut_week_key.as_deref(),
            Some("1987-W36")
        );

        let timeline = album_debut_timeline_for_source(&conn, Some(1987), "UK")
            .expect("build Official UK album debut timeline");
        assert_eq!(timeline.dated_album_count, 1);
        assert_eq!(timeline.albums[0].billboard_rank, Some(1));
        assert_eq!(timeline.albums[0].billboard_debut_week_key, "1987-W36");

        fs::remove_dir_all(source_dir).expect("remove Official UK album csv dir");
    }

    #[test]
    fn resolves_billboard_weeks_across_iso_year_boundaries() {
        let january_1949 =
            parse_billboard_first_appearance("Jan 1949").expect("parse January first appearance");
        let december_1957 =
            parse_billboard_first_appearance("Dec 1957").expect("parse December first appearance");

        assert_eq!(
            billboard_first_appearance_iso_year(january_1949, 53),
            Some(1948)
        );
        assert_eq!(
            billboard_first_appearance_iso_year(december_1957, 1),
            Some(1958)
        );
    }

    #[test]
    fn imports_billboard_csv_with_diacritic_library_text() {
        let mut conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, effective_album_rating, album_score
            ) VALUES (
                'mb:motley', 1, 'motley', 'Dr. Feelgood', 'Mötley Crüe',
                'Hard Rock', 'hard rock', 'Elektra', 1989, 1989,
                11, 11, 1.0, 2720, 3, 960, 0.3529, 90, 245.13
            )
            ",
            [],
        )
        .expect("insert motley album");
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-billboard-diacritic-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create billboard csv dir");
        fs::write(
            source_dir.join("1989.csv"),
            "EOY Rank,Artist,Title,First Appearance,First Appearance Week\n5,MOTLEY CRUE,Dr. Feelgood,Sep 1989,36\n",
        )
        .expect("write diacritic chart");

        let summary =
            import_billboard_charts(&mut conn, &source_dir).expect("import billboard charts");
        let (rank, year, debut_year, debut_week): (
            Option<i32>,
            Option<i32>,
            Option<i32>,
            Option<i32>,
        ) = conn
            .query_row(
                "
                SELECT billboard_rank, billboard_year,
                       billboard_debut_year, billboard_debut_week
                FROM albums
                WHERE id = 'mb:motley'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("load motley billboard rank");

        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 1);
        assert_eq!(summary.matched_albums, 1);
        assert_eq!(summary.dated_albums, 1);
        assert_eq!(rank, Some(5));
        assert_eq!(year, Some(1989));
        assert_eq!(debut_year, Some(1989));
        assert_eq!(debut_week, Some(36));

        fs::remove_dir_all(source_dir).expect("remove billboard csv dir");
    }

    #[test]
    fn imports_vg_lista_singles_with_weekly_entries_filters_and_norway_timeline() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-vg-lista-singles-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create VG Lista singles csv dir");
        fs::write(
            source_dir.join("singles-1987.csv"),
            "Year,Week,Rank,Last Week,Movement,Artist,Title,Weeks on Chart,Source URL\n\
             1987,42,3,,,Pet Shop Boys,What Have I Done to Deserve This?,1,https://example.test/1987-42\n\
             1987,43,2,3,1,Pet Shop Boys,What Have I Done to Deserve This?,2,https://example.test/1987-43\n\
             1987,43,1,,,A-ha,The Living Daylights,1,https://example.test/1987-43\n",
        )
        .expect("write VG Lista singles chart");

        let summary =
            import_vg_lista_singles(&mut conn, &source_dir).expect("import VG Lista singles");
        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_items, 1);
        assert_eq!(summary.dated_items, 1);

        let weekly_rows: (i64, i64) = conn
            .query_row(
                "
                SELECT COUNT(*), COUNT(matched_track_id)
                FROM vg_lista_single_chart_entries
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("count VG Lista single entries");
        assert_eq!(weekly_rows, (3, 2));

        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.vg_lista_rank_min = Some(2);
        request.filters.vg_lista_rank_max = Some(2);
        request.filters.vg_lista_debut_week_from = Some("1987-W42".to_string());
        request.filters.vg_lista_debut_week_to = Some("1987-W42".to_string());
        request.sort = BrowseSort {
            field: "vgListaRank".to_string(),
            direction: "asc".to_string(),
        };
        let response =
            search_library(&conn, request, 50).expect("filter singles by VG Lista metadata");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].vg_lista_rank, Some(2));
        assert_eq!(response.rows[0].vg_lista_year, Some(1987));
        assert_eq!(response.rows[0].vg_lista_debut_year, Some(1987));
        assert_eq!(response.rows[0].vg_lista_debut_month, Some(10));
        assert_eq!(response.rows[0].vg_lista_debut_week, Some(42));
        assert_eq!(
            response.rows[0].vg_lista_debut_week_key.as_deref(),
            Some("1987-W42")
        );

        let timeline = track_debut_timeline_for_source(&conn, Some(1987), "NO")
            .expect("build Norway track debut timeline");
        assert_eq!(timeline.selected_year, Some(1987));
        assert_eq!(timeline.dated_track_count, 1);
        assert_eq!(timeline.undated_track_count, 0);
        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].billboard_single_rank, Some(2));
        assert_eq!(
            timeline.tracks[0].billboard_single_debut_week_key,
            "1987-W42"
        );

        fs::remove_dir_all(source_dir).expect("remove VG Lista singles csv dir");
    }

    #[test]
    fn imports_official_uk_singles_once_with_exact_chart_dates() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-official-uk-singles-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create Official UK singles csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "Year,ISO Week,Chart Date,Chart End Date,Rank,Last Week,Movement,Peak,Artist,Title,Weeks on Chart,Source URL,Item URL\n\
             1987,42,1987-10-16,1987-10-22,3,,,3,Pet Shop Boys,What Have I Done to Deserve This?,1,https://example.test/singles/1987-42,https://example.test/what-have-i-done\n\
             1987,43,1987-10-23,1987-10-29,2,3,Up,2,Pet Shop Boys,What Have I Done to Deserve This?,2,https://example.test/singles/1987-43,https://example.test/what-have-i-done\n\
             1987,43,1987-10-23,1987-10-29,1,,,1,A-ha,The Living Daylights,1,https://example.test/singles/1987-43,https://example.test/living-daylights\n",
        )
        .expect("write Official UK singles chart");

        let summary =
            import_official_uk_singles(&mut conn, &source_dir).expect("import Official UK singles");
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_items, 1);

        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.official_uk_rank_min = Some(2);
        request.filters.official_uk_rank_max = Some(2);
        request.filters.official_uk_debut_week_from = Some("1987-W42".to_string());
        request.filters.official_uk_debut_week_to = Some("1987-W42".to_string());
        request.sort = BrowseSort {
            field: "officialUkRank".to_string(),
            direction: "asc".to_string(),
        };
        let response =
            search_library(&conn, request, 50).expect("filter Official UK single metadata");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].official_uk_rank, Some(2));
        assert_eq!(response.rows[0].official_uk_debut_month, Some(10));
        assert_eq!(
            response.rows[0].official_uk_debut_week_key.as_deref(),
            Some("1987-W42")
        );

        let timeline = track_debut_timeline_for_source(&conn, Some(1987), "officialUk")
            .expect("build Official UK track debut timeline");
        assert_eq!(timeline.dated_track_count, 1);
        assert_eq!(timeline.tracks[0].billboard_single_rank, Some(2));
        assert_eq!(timeline.tracks[0].billboard_single_debut_date, "1987-10-16");

        fs::remove_dir_all(source_dir).expect("remove Official UK singles csv dir");
    }

    #[test]
    fn imports_ti_i_skuddet_with_ranged_ranks_filters_and_timeline() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-ti-i-skuddet-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create Ti i Skuddet csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "Year,ISO Week,Chart Date,Rank,Title,Artist,Score / Votes,Note,Chart Details,Source URL\n\
             1987,42,1987-10-12,2-3,What Have I Done to Deserve This?,Pet Shop Boys,92 / 120,Tied,Weekly vote,https://example.test/1987-42\n\
             1987,43,1987-10-19,1,What Have I Done to Deserve This?,Pet Shop Boys,110 / 140,,Weekly vote,https://example.test/1987-43\n\
             1987,43,1987-10-19,4,The Living Daylights,A-ha,75 / 90,,Weekly vote,https://example.test/1987-43\n\
             1987,43,1987-10-19,5,,Unknown Artist,10 / 20,,Incomplete,https://example.test/invalid\n",
        )
        .expect("write Ti i Skuddet chart");

        let summary = import_ti_i_skuddet_singles(&mut conn, &source_dir)
            .expect("import Ti i Skuddet singles");
        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_tracks, 1);
        assert_eq!(summary.dated_tracks, 1);
        assert_eq!(summary.skipped_rows, 1);

        let weekly_rows: (i64, i64) = conn
            .query_row(
                "
                SELECT COUNT(*), COUNT(matched_track_id)
                FROM ti_i_skuddet_chart_entries
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("count Ti i Skuddet entries");
        assert_eq!(weekly_rows, (3, 2));
        let ranged_entry: (i32, String, String, String) = conn
            .query_row(
                "
                SELECT rank, rank_raw, score_votes, chart_details
                FROM ti_i_skuddet_chart_entries
                WHERE chart_date = '1987-10-12'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read ranged Ti i Skuddet entry");
        assert_eq!(ranged_entry.0, 2);
        assert_eq!(ranged_entry.1, "2-3");
        assert_eq!(ranged_entry.2, "92 / 120");
        assert_eq!(ranged_entry.3, "Weekly vote");

        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.ti_i_skuddet_rank_min = Some(1);
        request.filters.ti_i_skuddet_rank_max = Some(1);
        request.filters.ti_i_skuddet_debut_week_from = Some("1987-W42".to_string());
        request.filters.ti_i_skuddet_debut_week_to = Some("1987-W42".to_string());
        request.sort = BrowseSort {
            field: "tiISkuddetDebut".to_string(),
            direction: "asc".to_string(),
        };
        let response =
            search_library(&conn, request, 50).expect("filter tracks by Ti i Skuddet metadata");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].ti_i_skuddet_rank, Some(1));
        assert_eq!(response.rows[0].ti_i_skuddet_year, Some(1987));
        assert_eq!(
            response.rows[0].ti_i_skuddet_debut_date.as_deref(),
            Some("1987-10-12")
        );
        assert_eq!(response.rows[0].ti_i_skuddet_debut_year, Some(1987));
        assert_eq!(response.rows[0].ti_i_skuddet_debut_month, Some(10));
        assert_eq!(response.rows[0].ti_i_skuddet_debut_week, Some(42));
        assert_eq!(
            response.rows[0].ti_i_skuddet_debut_week_key.as_deref(),
            Some("1987-W42")
        );

        let timeline = track_debut_timeline_for_source(&conn, Some(1987), "tiISkuddet")
            .expect("build Ti i Skuddet track debut timeline");
        assert_eq!(timeline.selected_year, Some(1987));
        assert_eq!(timeline.dated_track_count, 1);
        assert_eq!(timeline.undated_track_count, 0);
        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].billboard_single_rank, Some(1));
        assert_eq!(
            timeline.tracks[0].billboard_single_debut_week_key,
            "1987-W42"
        );

        fs::remove_dir_all(source_dir).expect("remove Ti i Skuddet csv dir");
    }

    #[test]
    fn imports_norsktoppen_with_points_ranged_ranks_filters_and_timeline() {
        let mut conn = seeded_connection();
        let source_dir = std::env::temp_dir().join(format!(
            "music-library-norsktoppen-test-{}",
            Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&source_dir).expect("create Norsktoppen csv dir");
        fs::write(
            source_dir.join("1987.csv"),
            "Year,ISO Week,Chart Date,Rank,Title,Artist,Points,Note,Chart Details,Source URL\n\
             1987,42,1987-10-12,2-10,What Have I Done to Deserve This?,Pet Shop Boys,92,Tied,Weekly vote,https://example.test/1987-42\n\
             1987,43,1987-10-19,1,What Have I Done to Deserve This?,Pet Shop Boys,110,,Weekly vote,https://example.test/1987-43\n\
             1988,53,1988-01-02,2,Historical Boundary Song,Test Artist,75,,Year boundary,https://example.test/1988-53\n\
             1988,1,1988-01-09,5,,Unknown Artist,10,,Incomplete,https://example.test/invalid\n",
        )
        .expect("write Norsktoppen chart");

        let summary =
            import_norsktoppen_singles(&mut conn, &source_dir).expect("import Norsktoppen singles");
        assert_eq!(summary.files_scanned, 1);
        assert_eq!(summary.chart_entries, 3);
        assert_eq!(summary.matched_tracks, 1);
        assert_eq!(summary.dated_tracks, 1);
        assert_eq!(summary.skipped_rows, 1);

        let weekly_rows: (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COUNT(matched_track_id) FROM norsktoppen_chart_entries",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("count Norsktoppen entries");
        assert_eq!(weekly_rows, (3, 2));
        let ranged_entry: (i32, String, String, String) = conn
            .query_row(
                "
                SELECT rank, rank_raw, points, chart_details
                FROM norsktoppen_chart_entries
                WHERE chart_date = '1987-10-12'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read ranged Norsktoppen entry");
        assert_eq!(ranged_entry.0, 2);
        assert_eq!(ranged_entry.1, "2-10");
        assert_eq!(ranged_entry.2, "92");
        assert_eq!(ranged_entry.3, "Weekly vote");
        let boundary_week: (i32, i32, String) = conn
            .query_row(
                "
                SELECT year, week, chart_date
                FROM norsktoppen_chart_entries
                WHERE title = 'Historical Boundary Song'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read Norsktoppen year-boundary entry");
        assert_eq!(boundary_week, (1988, 53, "1988-01-02".to_string()));

        let mut request = BrowseRequest::default();
        request.view = "tracks".to_string();
        request.filters.norsktoppen_rank_min = Some(1);
        request.filters.norsktoppen_rank_max = Some(1);
        request.filters.norsktoppen_debut_week_from = Some("1987-W42".to_string());
        request.filters.norsktoppen_debut_week_to = Some("1987-W42".to_string());
        request.sort = BrowseSort {
            field: "norsktoppenDebut".to_string(),
            direction: "asc".to_string(),
        };
        let response =
            search_library(&conn, request, 50).expect("filter tracks by Norsktoppen metadata");
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].norsktoppen_rank, Some(1));
        assert_eq!(response.rows[0].norsktoppen_year, Some(1987));
        assert_eq!(
            response.rows[0].norsktoppen_debut_date.as_deref(),
            Some("1987-10-12")
        );
        assert_eq!(response.rows[0].norsktoppen_debut_year, Some(1987));
        assert_eq!(response.rows[0].norsktoppen_debut_month, Some(10));
        assert_eq!(response.rows[0].norsktoppen_debut_week, Some(42));
        assert_eq!(
            response.rows[0].norsktoppen_debut_week_key.as_deref(),
            Some("1987-W42")
        );

        let timeline = track_debut_timeline_for_source(&conn, Some(1987), "norsktoppen")
            .expect("build Norsktoppen track debut timeline");
        assert_eq!(timeline.selected_year, Some(1987));
        assert_eq!(timeline.dated_track_count, 1);
        assert_eq!(timeline.tracks.len(), 1);
        assert_eq!(timeline.tracks[0].billboard_single_rank, Some(1));
        assert_eq!(
            timeline.tracks[0].billboard_single_debut_week_key,
            "1987-W42"
        );

        fs::remove_dir_all(source_dir).expect("remove Norsktoppen csv dir");
    }

    #[test]
    fn cleans_only_catalog_style_billboard_single_album_suffixes() {
        assert_eq!(
            billboard_single_source_album_key(
                "Faster Than The Speed Of Night - Columbia 38710",
                "Columbia 38-03906"
            ),
            "faster than the speed of night"
        );
        assert_eq!(
            billboard_single_source_album_key("Thriller - Epic 38112", "Epic 34-04363"),
            "thriller"
        );
        assert_eq!(
            billboard_single_source_album_key("Mercury - Acts 1 & 2", "KIDinaKORNER/Interscope"),
            "mercury acts 1 and 2"
        );
        assert_eq!(billboard_single_source_album_key("21", "Columbia"), "21");
        assert_eq!(billboard_single_source_album_key("single", "RCA"), "");
    }

    #[test]
    fn parses_billboard_single_dates_without_trusting_historical_typos() {
        let (iso_date, iso_quality) = parse_billboard_single_date_entered("1989-07-08", 1989);
        assert_eq!(iso_date, NaiveDate::from_ymd_opt(1989, 7, 8));
        assert_eq!(iso_quality, "exact");

        let (slash_date, slash_quality) = parse_billboard_single_date_entered("02/20/2010", 2010);
        assert_eq!(slash_date, NaiveDate::from_ymd_opt(2010, 2, 20));
        assert_eq!(slash_quality, "exact");

        let (qualified_date, qualified_quality) =
            parse_billboard_single_date_entered("12/31/21+", 1921);
        assert_eq!(qualified_date, NaiveDate::from_ymd_opt(1921, 12, 31));
        assert_eq!(qualified_quality, "qualified");

        let (future_typo, future_quality) = parse_billboard_single_date_entered("4911-03-04", 1911);
        assert_eq!(future_typo, None);
        assert_eq!(future_quality, "invalid");

        let (missing, missing_quality) = parse_billboard_single_date_entered("", 1989);
        assert_eq!(missing, None);
        assert_eq!(missing_quality, "missing");
    }
}
