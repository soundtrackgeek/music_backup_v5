use super::*;

// Capture references before ON DELETE SET NULL clears them. Unrelated chart
// matches keep their stable track/album identities; affected charts use the full
// reconciler so alternative releases and duplicate recordings are still relinked.
pub(crate) fn album_removal_chart_impact(
    conn: &Connection,
    album_id: &str,
) -> Result<(bool, bool)> {
    let (albums, tracks, current) = album_removal_chart_state(conn, album_id)?;
    Ok((albums || !current, tracks))
}

pub(crate) fn album_removal_chart_state(
    conn: &Connection,
    album_id: &str,
) -> Result<(bool, bool, bool)> {
    let mut albums = false;
    for table in [
        "billboard_chart_entries",
        "official_uk_album_chart_entries",
        "vg_lista_album_chart_entries",
    ] {
        albums |= conn.query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE matched_album_id = ?1)"),
            params![album_id],
            |row| row.get::<_, bool>(0),
        )?;
    }
    let mut tracks = false;
    for table in [
        "billboard_single_chart_entries",
        "official_uk_single_chart_entries",
        "vg_lista_single_chart_entries",
        "ti_i_skuddet_chart_entries",
        "norsktoppen_chart_entries",
    ] {
        tracks |= conn.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {table} c JOIN tracks t ON t.id = c.matched_track_id WHERE t.album_id = ?1)"),
            params![album_id], |row| row.get::<_, bool>(0))?;
    }
    // Do not mark an already-stale album chart cache as current.
    let current_sources: i64 = conn.query_row("SELECT COUNT(*) FROM chart_album_match_state
        WHERE source IN ('billboard', 'official-uk', 'vg-lista')
        AND reconciled_import_run_id = (SELECT MAX(id) FROM import_runs WHERE status = 'completed')",
        [], |row| row.get(0))?;
    Ok((albums, tracks, current_sources == 3))
}

pub(crate) fn reconcile_album_chart_matches(conn: &Connection) -> Result<()> {
    ensure_chart_album_match_state_schema(conn)?;
    conn.execute_batch(
        "
        DROP TABLE IF EXISTS temp_discovery_album_match_keys;
        CREATE TEMP TABLE temp_discovery_album_match_keys (
            artist_key TEXT NOT NULL,
            album_key TEXT NOT NULL,
            album_id TEXT NOT NULL,
            PRIMARY KEY (artist_key, album_key)
        ) WITHOUT ROWID;
        ",
    )
    .context("Could not prepare album chart reconciliation")?;

    {
        let mut album_stmt =
            conn.prepare("SELECT id, album_artist_display, album FROM albums ORDER BY id")?;
        let albums = album_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut insert_key = conn.prepare(
            "INSERT OR IGNORE INTO temp_discovery_album_match_keys
             (artist_key, album_key, album_id) VALUES (?1, ?2, ?3)",
        )?;
        for (album_id, artist, album) in albums {
            let artist_key = billboard_text_key(artist.as_deref().unwrap_or_default());
            let album_key = billboard_text_key(album.as_deref().unwrap_or_default());
            if artist_key.is_empty() || album_key.is_empty() {
                continue;
            }
            for artist_variant in billboard_key_variants(&artist_key) {
                for album_variant in billboard_key_variants(&album_key) {
                    insert_key.execute(params![artist_variant, album_variant, album_id])?;
                }
            }
        }
    }

    reconcile_album_chart_entry_ids(conn, "billboard_chart_entries", "album_key")?;
    reconcile_album_chart_entry_ids(conn, "official_uk_album_chart_entries", "title_key")?;
    reconcile_album_chart_entry_ids(conn, "vg_lista_album_chart_entries", "title_key")?;
    reconcile_billboard_album_summaries(conn)?;
    reconcile_weekly_album_summaries(
        conn,
        "official_uk_album_chart_entries",
        "official_uk",
        "chart_date",
    )?;
    reconcile_weekly_album_summaries(
        conn,
        "vg_lista_album_chart_entries",
        "vg_lista",
        "week_date",
    )?;
    conn.execute_batch("DROP TABLE IF EXISTS temp_discovery_album_match_keys;")?;

    record_album_chart_match_state(conn)
}

pub(crate) fn record_album_chart_match_state(conn: &Connection) -> Result<()> {
    // During an import this runs in the same transaction before that run is marked
    // completed, so retain the current run id rather than the previous snapshot's id.
    let import_run_id = conn.query_row("SELECT MAX(id) FROM import_runs", [], |row| {
        row.get::<_, Option<i64>>(0)
    })?;
    let reconciled_at = Utc::now().to_rfc3339();
    let mut record_state = conn.prepare(
        "INSERT INTO chart_album_match_state
         (source, reconciled_import_run_id, reconciled_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(source) DO UPDATE SET
             reconciled_import_run_id = excluded.reconciled_import_run_id,
             reconciled_at = excluded.reconciled_at",
    )?;
    for source in ["billboard", "official-uk", "vg-lista"] {
        record_state.execute(params![source, import_run_id, reconciled_at])?;
    }
    Ok(())
}

pub(crate) fn reconcile_track_chart_matches(conn: &Connection) -> Result<()> {
    let tracks = load_track_chart_reconciliation_rows(conn)?;

    let billboard_entries = load_billboard_single_reconciliation_entries(conn)?;
    let billboard_matches = reconcile_billboard_single_entries(&tracks, &billboard_entries);
    apply_track_chart_reconciliation(
        conn,
        "billboard_single_chart_entries",
        "billboard_single",
        &billboard_entries,
        &billboard_matches,
    )?;

    for (table, column_prefix, date_column, week_key_column) in [
        (
            "vg_lista_single_chart_entries",
            "vg_lista",
            "week_date",
            Some("week_key"),
        ),
        (
            "official_uk_single_chart_entries",
            "official_uk",
            "chart_date",
            Some("week_key"),
        ),
        (
            "ti_i_skuddet_chart_entries",
            "ti_i_skuddet",
            "chart_date",
            None,
        ),
        (
            "norsktoppen_chart_entries",
            "norsktoppen",
            "chart_date",
            None,
        ),
    ] {
        let entries = load_weekly_track_chart_reconciliation_entries(
            conn,
            table,
            date_column,
            week_key_column,
        )?;
        let matches = reconcile_weekly_track_chart_entries(&tracks, &entries);
        apply_track_chart_reconciliation(conn, table, column_prefix, &entries, &matches)?;
    }

    Ok(())
}

pub(super) fn load_track_chart_reconciliation_rows(
    conn: &Connection,
) -> Result<Vec<TrackChartReconciliationRow>> {
    let mut statement = conn.prepare(
        "
        SELECT t.id, t.album, t.display_artist, t.title, t.album_artist_display,
               t.year, t.normalized_rating, c.album_id IS NOT NULL
        FROM tracks t
        LEFT JOIN album_covers c ON c.album_id = t.album_id
        ORDER BY t.id
        ",
    )?;
    let tracks = statement
        .query_map([], |row| {
            Ok(TrackChartReconciliationRow {
                title: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                track_id: row.get(0)?,
                album_key: billboard_text_key(
                    row.get::<_, Option<String>>(1)?
                        .as_deref()
                        .unwrap_or_default(),
                ),
                display_artist_key: billboard_text_key(
                    row.get::<_, Option<String>>(2)?
                        .as_deref()
                        .unwrap_or_default(),
                ),
                main_performers: crate::chart_identity::main_performers(
                    row.get::<_, Option<String>>(2)?
                        .as_deref()
                        .unwrap_or_default(),
                ),
                title_key: billboard_text_key(
                    row.get::<_, Option<String>>(3)?
                        .as_deref()
                        .unwrap_or_default(),
                ),
                album_artist_key: billboard_text_key(
                    row.get::<_, Option<String>>(4)?
                        .as_deref()
                        .unwrap_or_default(),
                ),
                year: row.get(5)?,
                normalized_rating: row.get(6)?,
                has_cover: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load tracks for singles chart reconciliation")?;
    Ok(tracks)
}

pub(super) fn load_billboard_single_reconciliation_entries(
    conn: &Connection,
) -> Result<Vec<StoredTrackChartEntry>> {
    let mut statement = conn.prepare(
        "
        SELECT id, artist, artist_key, title_key, COALESCE(album_key, ''),
               rank, year, date_entered, date_entered_year, date_entered_month,
               date_entered_week, date_entered_week_key, title, display_artist
        FROM billboard_single_chart_entries
        ORDER BY id
        ",
    )?;
    let entries = statement
        .query_map([], |row| {
            let artist = row.get::<_, String>(1)?;
            let artist_key = row.get::<_, String>(2)?;
            let source_artist_key = billboard_text_key(&artist);
            let mut match_artist_keys = vec![artist_key];
            push_unique(&mut match_artist_keys, source_artist_key.clone());
            Ok(StoredTrackChartEntry {
                title: row.get(12)?,
                entry_id: row.get(0)?,
                match_artist_keys,
                main_performers: crate::chart_identity::main_performers(&row.get::<_, String>(13)?),
                source_artist_key,
                title_key: row.get(3)?,
                source_album_key: row.get(4)?,
                rank: row.get(5)?,
                chart_year: row.get(6)?,
                chart_week: None,
                debut_date: row.get(7)?,
                debut_year: row.get(8)?,
                debut_month: row.get(9)?,
                debut_week: row.get(10)?,
                debut_week_key: row.get(11)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load Billboard singles chart entries for reconciliation")?;
    Ok(entries)
}

pub(super) fn load_weekly_track_chart_reconciliation_entries(
    conn: &Connection,
    table: &str,
    date_column: &str,
    week_key_column: Option<&str>,
) -> Result<Vec<StoredTrackChartEntry>> {
    let week_key_select = week_key_column.unwrap_or("NULL");
    let sql = format!(
        "SELECT id, artist_key, title_key, rank, year, week, {date_column}, {week_key_select}, title, artist
         FROM {table} ORDER BY id"
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(
            |(
                entry_id,
                artist_key,
                title_key,
                rank,
                year,
                week,
                date,
                stored_week_key,
                title,
                artist,
            )| {
                let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                    .with_context(|| format!("Invalid chart date {date} in {table}"))?;
                let week_key = stored_week_key.unwrap_or_else(|| format!("{year:04}-W{week:02}"));
                Ok(StoredTrackChartEntry {
                    title,
                    entry_id,
                    match_artist_keys: vec![artist_key.clone()],
                    main_performers: crate::chart_identity::main_performers(&artist),
                    source_artist_key: artist_key,
                    title_key,
                    source_album_key: String::new(),
                    rank,
                    chart_year: year,
                    chart_week: Some(week),
                    debut_date: Some(date),
                    debut_year: Some(year),
                    debut_month: Some(parsed_date.month() as i32),
                    debut_week: Some(week),
                    debut_week_key: Some(week_key),
                })
            },
        )
        .collect()
}

pub(super) fn chart_parenthetical_key(title: &str) -> Option<String> {
    crate::chart_song_match::without_parentheses(title)
        .map(|base| billboard_text_key(&base))
        .filter(|base| !base.is_empty())
}

pub(super) fn matching_chart_entries_by_track(
    tracks: &[TrackChartReconciliationRow],
    entries: &[StoredTrackChartEntry],
) -> HashMap<i64, Vec<usize>> {
    let mut index = crate::chart_song_match::SongIndex::default();
    for (id, track) in tracks.iter().enumerate() {
        index.insert(
            id,
            &billboard_single_artist_key_variants(&track.display_artist_key),
            &track.main_performers,
            &track.title_key,
            &billboard_single_title_key_variants(&track.title_key),
            chart_parenthetical_key(&track.title).as_deref(),
        );
    }
    let mut result = HashMap::<i64, Vec<usize>>::new();
    for (entry_id, entry) in entries.iter().enumerate() {
        let artists = entry
            .match_artist_keys
            .iter()
            .flat_map(|key| billboard_single_artist_key_variants(key))
            .collect::<Vec<_>>();
        for track_id in index.resolve(
            &artists,
            &entry.main_performers,
            &entry.title_key,
            &billboard_single_title_key_variants(&entry.title_key),
            chart_parenthetical_key(&entry.title).as_deref(),
        ) {
            result
                .entry(tracks[track_id].track_id)
                .or_default()
                .push(entry_id);
        }
    }
    result
}

pub(super) fn reconcile_billboard_single_entries(
    tracks: &[TrackChartReconciliationRow],
    entries: &[StoredTrackChartEntry],
) -> Vec<ReconciledTrackChartMatch> {
    let indexes_by_track = matching_chart_entries_by_track(tracks, entries);
    let mut candidates_by_identity: HashMap<String, Vec<BillboardSingleTrackCandidate>> =
        HashMap::new();

    for track in tracks {
        if track.display_artist_key.is_empty() || track.title_key.is_empty() {
            continue;
        }
        let entry_indexes = indexes_by_track
            .get(&track.track_id)
            .cloned()
            .unwrap_or_default();
        if entry_indexes.is_empty() {
            continue;
        }
        let best = entry_indexes
            .iter()
            .map(|index| &entries[*index])
            .min_by_key(|entry| (entry.rank, entry.chart_year))
            .expect("matched Billboard singles entries are not empty");
        let debut = entry_indexes
            .iter()
            .map(|index| &entries[*index])
            .filter(|entry| entry.debut_date.is_some())
            .min_by_key(|entry| entry.debut_date.as_deref());
        let source_album_key = entry_indexes
            .iter()
            .map(|index| &entries[*index])
            .filter(|entry| !entry.source_album_key.is_empty())
            .min_by(|left, right| {
                (
                    left.debut_date.is_none(),
                    left.debut_date.as_deref().unwrap_or_default(),
                    left.chart_year,
                )
                    .cmp(&(
                        right.debut_date.is_none(),
                        right.debut_date.as_deref().unwrap_or_default(),
                        right.chart_year,
                    ))
            })
            .map(|entry| entry.source_album_key.clone())
            .unwrap_or_default();
        let identity_key = billboard_match_key(&best.source_artist_key, &best.title_key);
        candidates_by_identity
            .entry(identity_key)
            .or_default()
            .push(BillboardSingleTrackCandidate {
                track_id: track.track_id,
                album_key: track.album_key.clone(),
                album_artist_key: track.album_artist_key.clone(),
                year: track.year,
                normalized_rating: track.normalized_rating,
                has_cover: track.has_cover,
                source_album_key,
                source_artist_key: best.source_artist_key.clone(),
                rank: best.rank,
                chart_year: best.chart_year,
                debut_date: debut.and_then(|entry| entry.debut_date.clone()),
                debut_year: debut.and_then(|entry| entry.debut_year),
                debut_month: debut.and_then(|entry| entry.debut_month),
                debut_week: debut.and_then(|entry| entry.debut_week),
                debut_week_key: debut.and_then(|entry| entry.debut_week_key.clone()),
                entry_indexes,
            });
    }

    candidates_by_identity
        .into_values()
        .filter_map(|candidates| {
            let candidate = candidates
                .iter()
                .max_by_key(|candidate| billboard_single_candidate_priority(candidate))?;
            Some(ReconciledTrackChartMatch {
                track_id: candidate.track_id,
                rank: candidate.rank,
                chart_year: candidate.chart_year,
                debut_date: candidate.debut_date.clone(),
                debut_year: candidate.debut_year,
                debut_month: candidate.debut_month,
                debut_week: candidate.debut_week,
                debut_week_key: candidate.debut_week_key.clone(),
                entry_indexes: candidate.entry_indexes.clone(),
            })
        })
        .collect()
}

pub(super) fn reconcile_weekly_track_chart_entries(
    tracks: &[TrackChartReconciliationRow],
    entries: &[StoredTrackChartEntry],
) -> Vec<ReconciledTrackChartMatch> {
    let indexes_by_track = matching_chart_entries_by_track(tracks, entries);
    let mut candidates_by_identity: HashMap<String, Vec<WeeklyChartTrackCandidate>> =
        HashMap::new();

    for track in tracks {
        if track.display_artist_key.is_empty() || track.title_key.is_empty() {
            continue;
        }
        let entry_indexes = indexes_by_track
            .get(&track.track_id)
            .cloned()
            .unwrap_or_default();
        if entry_indexes.is_empty() {
            continue;
        }
        let best = entry_indexes
            .iter()
            .map(|index| &entries[*index])
            .min_by_key(|entry| {
                (
                    entry.rank,
                    entry.chart_year,
                    entry.chart_week.unwrap_or_default(),
                )
            })
            .expect("matched weekly singles chart entries are not empty");
        let debut = entry_indexes
            .iter()
            .map(|index| &entries[*index])
            .min_by_key(|entry| {
                (
                    entry.chart_year,
                    entry.chart_week.unwrap_or_default(),
                    entry.debut_date.as_deref().unwrap_or_default(),
                )
            })
            .expect("matched weekly singles chart entries are not empty");
        let identity_key = billboard_match_key(&best.source_artist_key, &best.title_key);
        candidates_by_identity
            .entry(identity_key)
            .or_default()
            .push(WeeklyChartTrackCandidate {
                track_id: track.track_id,
                album_artist_key: track.album_artist_key.clone(),
                year: track.year,
                normalized_rating: track.normalized_rating,
                has_cover: track.has_cover,
                source_artist_key: best.source_artist_key.clone(),
                rank: best.rank,
                chart_year: best.chart_year,
                debut_date: debut.debut_date.clone().unwrap_or_default(),
                debut_year: debut.debut_year.unwrap_or(debut.chart_year),
                debut_month: debut.debut_month.unwrap_or_default(),
                debut_week: debut.debut_week.unwrap_or_default(),
                debut_week_key: debut.debut_week_key.clone().unwrap_or_default(),
                entry_indexes,
            });
    }

    candidates_by_identity
        .into_values()
        .filter_map(|candidates| {
            let candidate = candidates
                .iter()
                .max_by_key(|candidate| weekly_chart_track_candidate_priority(candidate))?;
            Some(ReconciledTrackChartMatch {
                track_id: candidate.track_id,
                rank: candidate.rank,
                chart_year: candidate.chart_year,
                debut_date: Some(candidate.debut_date.clone()),
                debut_year: Some(candidate.debut_year),
                debut_month: Some(candidate.debut_month),
                debut_week: Some(candidate.debut_week),
                debut_week_key: Some(candidate.debut_week_key.clone()),
                entry_indexes: candidate.entry_indexes.clone(),
            })
        })
        .collect()
}

pub(super) fn apply_track_chart_reconciliation(
    conn: &Connection,
    table: &str,
    column_prefix: &str,
    entries: &[StoredTrackChartEntry],
    matches: &[ReconciledTrackChartMatch],
) -> Result<()> {
    conn.execute_batch(&format!(
        "
        UPDATE tracks
        SET {column_prefix}_rank = NULL,
            {column_prefix}_year = NULL,
            {column_prefix}_debut_date = NULL,
            {column_prefix}_debut_year = NULL,
            {column_prefix}_debut_month = NULL,
            {column_prefix}_debut_week = NULL,
            {column_prefix}_debut_week_key = NULL;
        UPDATE {table} SET matched_track_id = NULL;
        "
    ))
    .with_context(|| format!("Could not clear stale {column_prefix} track chart matches"))?;

    let update_track_sql = format!(
        "UPDATE tracks
         SET {column_prefix}_rank = ?1,
             {column_prefix}_year = ?2,
             {column_prefix}_debut_date = ?3,
             {column_prefix}_debut_year = ?4,
             {column_prefix}_debut_month = ?5,
             {column_prefix}_debut_week = ?6,
             {column_prefix}_debut_week_key = ?7
         WHERE id = ?8"
    );
    let update_entry_sql = format!("UPDATE {table} SET matched_track_id = ?1 WHERE id = ?2");
    let mut update_track = conn.prepare(&update_track_sql)?;
    let mut update_entry = conn.prepare(&update_entry_sql)?;
    for chart_match in matches {
        update_track.execute(params![
            chart_match.rank,
            chart_match.chart_year,
            &chart_match.debut_date,
            chart_match.debut_year,
            chart_match.debut_month,
            chart_match.debut_week,
            &chart_match.debut_week_key,
            chart_match.track_id,
        ])?;
        for &entry_index in &chart_match.entry_indexes {
            update_entry.execute(params![chart_match.track_id, entries[entry_index].entry_id])?;
        }
    }
    Ok(())
}

pub(super) fn reconcile_album_chart_entry_ids(
    conn: &Connection,
    table: &str,
    title_key_column: &str,
) -> Result<()> {
    let sql = format!(
        "
         DROP TABLE IF EXISTS temp_discovery_chart_matches;
         CREATE TEMP TABLE temp_discovery_chart_matches (
             entry_id INTEGER PRIMARY KEY,
             album_id TEXT NOT NULL
         );
         INSERT OR IGNORE INTO temp_discovery_chart_matches (entry_id, album_id)
         SELECT entry.id, keys.album_id
         FROM {table} entry
         JOIN temp_discovery_album_match_keys keys
           ON keys.artist_key = entry.artist_key
          AND keys.album_key = entry.{title_key_column};
         INSERT OR IGNORE INTO temp_discovery_chart_matches (entry_id, album_id)
         SELECT entry.id, keys.album_id
         FROM {table} entry
         JOIN temp_discovery_album_match_keys keys
           ON keys.artist_key = SUBSTR(entry.artist_key, 5)
          AND keys.album_key = entry.{title_key_column}
         WHERE entry.artist_key LIKE 'the %';
         INSERT OR IGNORE INTO temp_discovery_chart_matches (entry_id, album_id)
         SELECT entry.id, keys.album_id
         FROM {table} entry
         JOIN temp_discovery_album_match_keys keys
           ON keys.artist_key = entry.artist_key
          AND keys.album_key = SUBSTR(entry.{title_key_column}, 5)
         WHERE entry.{title_key_column} LIKE 'the %';
         INSERT OR IGNORE INTO temp_discovery_chart_matches (entry_id, album_id)
         SELECT entry.id, keys.album_id
         FROM {table} entry
         JOIN temp_discovery_album_match_keys keys
           ON keys.artist_key = SUBSTR(entry.artist_key, 5)
          AND keys.album_key = SUBSTR(entry.{title_key_column}, 5)
         WHERE entry.artist_key LIKE 'the %'
           AND entry.{title_key_column} LIKE 'the %';
         UPDATE {table}
         SET matched_album_id = (
             SELECT album_id FROM temp_discovery_chart_matches matched
             WHERE matched.entry_id = {table}.id
         )
         WHERE id IN (SELECT entry_id FROM temp_discovery_chart_matches);
         DROP TABLE temp_discovery_chart_matches;
         "
    );
    conn.execute_batch(&sql)
        .with_context(|| format!("Could not reconcile owned albums with {table}"))?;
    Ok(())
}

pub(super) fn reconcile_billboard_album_summaries(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        DROP TABLE IF EXISTS temp_discovery_billboard_summaries;
        CREATE TEMP TABLE temp_discovery_billboard_summaries AS
        SELECT best.matched_album_id, best.rank, best.year,
               debut.first_appearance_year, debut.first_appearance_month,
               debut.first_appearance_week, debut.first_appearance_week_key
        FROM (
            SELECT matched_album_id, rank, year,
                   ROW_NUMBER() OVER (
                       PARTITION BY matched_album_id ORDER BY rank, year, id
                   ) AS position
            FROM billboard_chart_entries
            WHERE matched_album_id IS NOT NULL
        ) best
        JOIN (
            SELECT matched_album_id, first_appearance_year, first_appearance_month,
                   first_appearance_week, first_appearance_week_key,
                   ROW_NUMBER() OVER (
                       PARTITION BY matched_album_id
                       ORDER BY COALESCE(first_appearance_week_key, printf('%04d', year)), id
                   ) AS position
            FROM billboard_chart_entries
            WHERE matched_album_id IS NOT NULL
        ) debut ON debut.matched_album_id = best.matched_album_id
        WHERE best.position = 1 AND debut.position = 1;
        CREATE UNIQUE INDEX temp_discovery_billboard_summaries_album
            ON temp_discovery_billboard_summaries(matched_album_id);
        UPDATE albums SET
            (billboard_rank, billboard_year, billboard_debut_year,
             billboard_debut_month, billboard_debut_week,
             billboard_debut_week_key) = (
                SELECT rank, year, first_appearance_year,
                       first_appearance_month, first_appearance_week,
                       first_appearance_week_key
                FROM temp_discovery_billboard_summaries summary
                WHERE summary.matched_album_id = albums.id
            )
        WHERE id IN (SELECT matched_album_id FROM temp_discovery_billboard_summaries);
        DROP TABLE temp_discovery_billboard_summaries;
        ",
    )
    .context("Could not rebuild Billboard album summaries")?;
    Ok(())
}

pub(super) fn reconcile_weekly_album_summaries(
    conn: &Connection,
    table: &str,
    column_prefix: &str,
    date_column: &str,
) -> Result<()> {
    let sql = format!(
        "
        DROP TABLE IF EXISTS temp_discovery_weekly_summaries;
        CREATE TEMP TABLE temp_discovery_weekly_summaries AS
        SELECT best.matched_album_id, best.rank, best.year,
               debut.year AS debut_year, debut.week AS debut_week,
               debut.week_key AS debut_week_key,
               debut.month AS debut_month
        FROM (
            SELECT matched_album_id, rank, year,
                   ROW_NUMBER() OVER (
                       PARTITION BY matched_album_id ORDER BY rank, year, week, id
                   ) AS position
            FROM {table}
            WHERE matched_album_id IS NOT NULL
        ) best
        JOIN (
            SELECT matched_album_id, year, week, week_key,
                   CAST(SUBSTR({date_column}, 6, 2) AS INTEGER) AS month,
                   ROW_NUMBER() OVER (
                       PARTITION BY matched_album_id ORDER BY {date_column}, rank, id
                   ) AS position
            FROM {table}
            WHERE matched_album_id IS NOT NULL
        ) debut ON debut.matched_album_id = best.matched_album_id
        WHERE best.position = 1 AND debut.position = 1;
        CREATE UNIQUE INDEX temp_discovery_weekly_summaries_album
            ON temp_discovery_weekly_summaries(matched_album_id);
        UPDATE albums SET
            ({column_prefix}_rank, {column_prefix}_year,
             {column_prefix}_debut_year, {column_prefix}_debut_month,
             {column_prefix}_debut_week, {column_prefix}_debut_week_key) = (
                SELECT rank, year, debut_year, debut_month,
                       debut_week, debut_week_key
                FROM temp_discovery_weekly_summaries summary
                WHERE summary.matched_album_id = albums.id
            )
        WHERE id IN (SELECT matched_album_id FROM temp_discovery_weekly_summaries);
        DROP TABLE temp_discovery_weekly_summaries;
        "
    );
    conn.execute_batch(&sql)
        .with_context(|| format!("Could not rebuild {column_prefix} album summaries"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn chart_source_health_rebuild_repairs_owned_links() {
        let conn = seeded_connection();
        conn.execute_batch(
            "INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                matched_album_id, imported_at
             ) VALUES (
                'billboard.csv', 1988, 1, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', NULL, '2026-08-13T08:00:00Z'
             );",
        )
        .expect("seed unlinked chart");
        reconcile_album_chart_matches(&conn).expect("rebuild chart matches");
        let matched: Option<String> = conn
            .query_row(
                "SELECT matched_album_id FROM billboard_chart_entries LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("read rebuilt match");
        assert_eq!(matched.as_deref(), Some("mb:test"));
    }

    #[test]
    fn reconciles_unlinked_chart_corpora_with_the_current_album_snapshot() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                first_appearance, first_appearance_year, first_appearance_month,
                first_appearance_week, first_appearance_week_key,
                matched_album_id, imported_at
            ) VALUES (
                'billboard.csv', 1988, 11, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', 'September 1987', 1987, 9, 36,
                '1987-36', NULL, 'now'
            );
            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, matched_album_id, imported_at
            ) VALUES (
                'uk.csv', 1987, 37, '1987-09-12', 2, 'Pet Shop Boys',
                'Actually', 'pet shop boys', 'actually', '1987-37', NULL, 'now'
            );
            INSERT INTO vg_lista_album_chart_entries (
                source_file, year, week, rank, artist, title, artist_key,
                title_key, week_date, week_key, matched_album_id, imported_at
            ) VALUES (
                'vg.csv', 1987, 38, 4, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', '1987-09-18', '1987-38', NULL, 'now'
            );
            ",
        )
        .expect("insert unlinked chart fixtures");

        reconcile_album_chart_matches(&conn).expect("reconcile album charts");

        for table in [
            "billboard_chart_entries",
            "official_uk_album_chart_entries",
            "vg_lista_album_chart_entries",
        ] {
            let matched: Option<String> = conn
                .query_row(
                    &format!("SELECT matched_album_id FROM {table} LIMIT 1"),
                    [],
                    |row| row.get(0),
                )
                .expect("read reconciled match");
            assert_eq!(matched.as_deref(), Some("mb:test"));
        }
        let ranks = conn
            .query_row(
                "SELECT billboard_rank, official_uk_rank, vg_lista_rank
                 FROM albums WHERE id = 'mb:test'",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<i32>>(0)?,
                        row.get::<_, Option<i32>>(1)?,
                        row.get::<_, Option<i32>>(2)?,
                    ))
                },
            )
            .expect("read reconciled summaries");
        assert_eq!(ranks, (Some(11), Some(2), Some(4)));

        for _ in 0..20 {
            let snapshot = discovery_chart_snapshot(
                &conn,
                &DiscoveryChartSnapshotRequest {
                    source: None,
                    year: None,
                    week: None,
                    random: true,
                },
            )
            .expect("load populated random chart");
            assert!(snapshot.year.is_some());
            assert!(!snapshot.stories.is_empty());
        }
    }

    #[test]
    fn reconciliation_matches_charted_lead_artist_to_library_collaboration() {
        let conn = seeded_connection();
        conn.execute(
            "UPDATE tracks SET display_artist='John Lennon & Yoko Ono', title='Woman'",
            [],
        )
        .unwrap();
        let tracks = load_track_chart_reconciliation_rows(&conn).unwrap();
        let entry = |artist: &str| StoredTrackChartEntry {
            title: "WOMAN".into(),
            entry_id: 1,
            match_artist_keys: vec![billboard_text_key(artist)],
            main_performers: crate::chart_identity::main_performers(artist),
            source_artist_key: billboard_text_key(artist),
            title_key: "woman".into(),
            source_album_key: String::new(),
            rank: 1,
            chart_year: 1981,
            chart_week: Some(6),
            debut_date: Some("1981-01-24".into()),
            debut_year: Some(1981),
            debut_month: Some(1),
            debut_week: Some(4),
            debut_week_key: Some("1981-W04".into()),
        };
        assert!(!matching_chart_entries_by_track(&tracks, &[entry("JOHN LENNON")]).is_empty());
        // A different lead artist with the same title is not the same recording.
        assert!(matching_chart_entries_by_track(&tracks, &[entry("DURAN DURAN")]).is_empty());
    }

    #[test]
    fn parenthetical_reconciliation_prefers_exact_and_rejects_ambiguous_versions() {
        let conn = seeded_connection();
        conn.execute(
            "UPDATE tracks SET display_artist='Artist', title='Song (Live)'",
            [],
        )
        .unwrap();
        let mut tracks = load_track_chart_reconciliation_rows(&conn).unwrap();
        let mut entries = vec![StoredTrackChartEntry {
            title: "Song".into(),
            entry_id: 1,
            match_artist_keys: vec!["artist".into()],
            main_performers: vec!["artist".into()],
            source_artist_key: "artist".into(),
            title_key: "song".into(),
            source_album_key: String::new(),
            rank: 1,
            chart_year: 1985,
            chart_week: Some(1),
            debut_date: Some("1985-01-05".into()),
            debut_year: Some(1985),
            debut_month: Some(1),
            debut_week: Some(1),
            debut_week_key: Some("1985-W01".into()),
        }];
        assert!(!matching_chart_entries_by_track(&tracks, &entries).is_empty());
        let mut other = load_track_chart_reconciliation_rows(&conn)
            .unwrap()
            .remove(0);
        other.track_id = 99999;
        other.title = "Song (Remix)".into();
        other.title_key = billboard_text_key(&other.title);
        tracks.push(other);
        assert!(matching_chart_entries_by_track(&tracks, &entries).is_empty());
        entries[0].title = "Song (Live)".into();
        entries[0].title_key = "song live".into();
        let matches = matching_chart_entries_by_track(&tracks, &entries);
        assert!(!matches.is_empty());
        assert!(!matches.contains_key(&99999));
        entries[0].title = "Song (Edit)".into();
        entries[0].title_key = "song edit".into();
        assert!(matching_chart_entries_by_track(&tracks, &entries).is_empty());
        tracks.last_mut().unwrap().title = "Song".into();
        tracks.last_mut().unwrap().title_key = "song".into();
        for matches in [
            reconcile_billboard_single_entries(&tracks, &entries),
            reconcile_weekly_track_chart_entries(&tracks, &entries),
        ] {
            assert_eq!(matches.len(), 1);
            assert_eq!(matches[0].track_id, 99999);
        }
    }
}
