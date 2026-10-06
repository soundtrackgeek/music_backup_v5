use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct MusicToolTrackTextFields {
    pub(super) display_artist: Option<String>,
    pub(super) album_artist_display: Option<String>,
    pub(super) album: Option<String>,
    pub(super) title: Option<String>,
    pub(super) genre: Option<String>,
    pub(super) canonical_genre: Option<String>,
    pub(super) publisher: Option<String>,
    pub(super) file_path: Option<String>,
    pub(super) filename: Option<String>,
}

impl MusicToolTrackTextFields {
    pub(super) fn compacted(&self) -> Self {
        Self {
            display_artist: compact_optional_whitespace(&self.display_artist),
            album_artist_display: compact_optional_whitespace(&self.album_artist_display),
            album: compact_optional_whitespace(&self.album),
            title: compact_optional_whitespace(&self.title),
            genre: compact_optional_whitespace(&self.genre),
            canonical_genre: compact_optional_whitespace(&self.canonical_genre),
            publisher: compact_optional_whitespace(&self.publisher),
            file_path: compact_optional_whitespace(&self.file_path),
            filename: compact_optional_whitespace(&self.filename),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct MusicToolAlbumTextFields {
    pub(super) album: Option<String>,
    pub(super) album_artist_display: Option<String>,
    pub(super) canonical_genre: Option<String>,
    pub(super) genre_normalized: Option<String>,
    pub(super) publisher: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct MusicToolFixHistoryRow {
    pub(super) id: i64,
    pub(super) tool_id: String,
    pub(super) action: String,
    pub(super) status: String,
    pub(super) confidence: String,
    pub(super) requested_count: i64,
    pub(super) fixable_count: i64,
    pub(super) affected_album_count: i64,
    pub(super) affected_track_count: i64,
    pub(super) changed_album_count: i64,
    pub(super) changed_track_count: i64,
    pub(super) backup_path: Option<String>,
    pub(super) undo_backup_path: Option<String>,
    pub(super) source_warning: String,
    pub(super) diff_json: String,
    pub(super) message: String,
    pub(super) created_at: String,
    pub(super) undone_at: Option<String>,
}

impl MusicToolAlbumTextFields {
    pub(super) fn compacted(&self) -> Self {
        Self {
            album: compact_optional_whitespace(&self.album),
            album_artist_display: compact_optional_whitespace(&self.album_artist_display),
            canonical_genre: compact_optional_whitespace(&self.canonical_genre),
            genre_normalized: compact_optional_whitespace(&self.genre_normalized),
            publisher: compact_optional_whitespace(&self.publisher),
        }
    }
}

pub(super) fn push_music_tool_field_diff(
    changes: &mut Vec<MusicToolFieldDiff>,
    field: &str,
    label: &str,
    before: &Option<String>,
    after: &Option<String>,
) {
    if before != after {
        changes.push(MusicToolFieldDiff {
            field: field.to_string(),
            label: label.to_string(),
            before: before.clone(),
            after: after.clone(),
        });
    }
}

pub(super) fn load_music_tool_track_fields(
    conn: &Connection,
    track_id: i64,
) -> Result<Option<(String, MusicToolTrackTextFields)>> {
    conn.query_row(
        "
        SELECT
            album_id,
            display_artist,
            album_artist_display,
            album,
            title,
            genre,
            canonical_genre,
            publisher,
            file_path,
            filename
        FROM tracks
        WHERE id = ?1
        ",
        params![track_id],
        |row| {
            Ok((
                row.get(0)?,
                MusicToolTrackTextFields {
                    display_artist: row.get(1)?,
                    album_artist_display: row.get(2)?,
                    album: row.get(3)?,
                    title: row.get(4)?,
                    genre: row.get(5)?,
                    canonical_genre: row.get(6)?,
                    publisher: row.get(7)?,
                    file_path: row.get(8)?,
                    filename: row.get(9)?,
                },
            ))
        },
    )
    .optional()
    .with_context(|| format!("Could not load track {track_id} for Music Tool repair"))
}

pub(super) fn load_music_tool_album_fields(
    conn: &Connection,
    album_id: &str,
) -> Result<Option<MusicToolAlbumTextFields>> {
    conn.query_row(
        "
        SELECT
            album,
            album_artist_display,
            canonical_genre,
            genre_normalized,
            publisher
        FROM albums
        WHERE id = ?1
        ",
        params![album_id],
        |row| {
            Ok(MusicToolAlbumTextFields {
                album: row.get(0)?,
                album_artist_display: row.get(1)?,
                canonical_genre: row.get(2)?,
                genre_normalized: row.get(3)?,
                publisher: row.get(4)?,
            })
        },
    )
    .optional()
    .with_context(|| format!("Could not load album {album_id} for Music Tool repair"))
}

pub(super) fn whitespace_fix_diffs(
    conn: &Connection,
    affected_track_ids: &HashSet<i64>,
    affected_album_ids: &HashSet<String>,
) -> Result<Vec<MusicToolFixDiff>> {
    let mut diffs = Vec::new();
    let mut track_ids = affected_track_ids.iter().copied().collect::<Vec<_>>();
    track_ids.sort_unstable();

    for track_id in track_ids {
        let Some((album_id, current)) = load_music_tool_track_fields(conn, track_id)? else {
            continue;
        };
        let next = current.compacted();
        let mut changes = Vec::new();
        for (field, label, before, after) in [
            (
                "display_artist",
                "Display artist",
                &current.display_artist,
                &next.display_artist,
            ),
            (
                "album_artist_display",
                "Album artist",
                &current.album_artist_display,
                &next.album_artist_display,
            ),
            ("album", "Album", &current.album, &next.album),
            ("title", "Track title", &current.title, &next.title),
            ("genre", "Source genre", &current.genre, &next.genre),
            (
                "canonical_genre",
                "Canonical genre",
                &current.canonical_genre,
                &next.canonical_genre,
            ),
            (
                "publisher",
                "Publisher",
                &current.publisher,
                &next.publisher,
            ),
            (
                "file_path",
                "File path",
                &current.file_path,
                &next.file_path,
            ),
            ("filename", "Filename", &current.filename, &next.filename),
        ] {
            push_music_tool_field_diff(&mut changes, field, label, before, after);
        }

        if changes.is_empty() {
            continue;
        }
        let label = current
            .title
            .clone()
            .or_else(|| current.filename.clone())
            .unwrap_or_else(|| format!("Track {track_id}"));
        let context = [current.album_artist_display.clone(), current.album.clone()]
            .into_iter()
            .flatten()
            .filter(|value| !value.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" / ");
        diffs.push(MusicToolFixDiff {
            id: format!("tracks:{track_id}"),
            entity_type: "tracks".to_string(),
            entity_id: track_id.to_string(),
            album_id,
            track_id: Some(track_id),
            label,
            context: (!context.is_empty()).then_some(context),
            confidence: MUSIC_TOOL_FIX_CONFIDENCE.to_string(),
            source_warning: MUSIC_TOOL_SOURCE_WARNING.to_string(),
            changes,
        });
    }

    let mut album_ids = affected_album_ids.iter().cloned().collect::<Vec<_>>();
    album_ids.sort();
    for album_id in album_ids {
        let Some(current) = load_music_tool_album_fields(conn, &album_id)? else {
            continue;
        };
        let next = current.compacted();
        let mut changes = Vec::new();
        for (field, label, before, after) in [
            ("album", "Album", &current.album, &next.album),
            (
                "album_artist_display",
                "Album artist",
                &current.album_artist_display,
                &next.album_artist_display,
            ),
            (
                "canonical_genre",
                "Canonical genre",
                &current.canonical_genre,
                &next.canonical_genre,
            ),
            (
                "genre_normalized",
                "Normalized genre",
                &current.genre_normalized,
                &next.genre_normalized,
            ),
            (
                "publisher",
                "Publisher",
                &current.publisher,
                &next.publisher,
            ),
        ] {
            push_music_tool_field_diff(&mut changes, field, label, before, after);
        }

        if changes.is_empty() {
            continue;
        }
        diffs.push(MusicToolFixDiff {
            id: format!("albums:{album_id}"),
            entity_type: "albums".to_string(),
            entity_id: album_id.clone(),
            album_id,
            track_id: None,
            label: current
                .album
                .clone()
                .unwrap_or_else(|| "Untitled album".to_string()),
            context: current.album_artist_display.clone(),
            confidence: MUSIC_TOOL_FIX_CONFIDENCE.to_string(),
            source_warning: format!(
                "Derived app-local album metadata will be updated. {MUSIC_TOOL_SOURCE_WARNING}"
            ),
            changes,
        });
    }

    Ok(diffs)
}

pub(super) fn fix_music_tool_issues(
    conn: &mut Connection,
    db_path: Option<&Path>,
    input: MusicToolFixRequest,
) -> Result<MusicToolFixSummary> {
    let MusicToolFixRequest {
        tool_id,
        issue_ids,
        apply,
    } = input;

    music_tool_definition(&tool_id)?;
    if tool_id != "whitespace-anomalies" {
        bail!("No fix action is available for this music tool yet: {tool_id}");
    }

    let requested_issue_ids = issue_ids.into_iter().collect::<HashSet<_>>();
    let requested_count = requested_issue_ids.len();
    let action = "compact-whitespace".to_string();
    if requested_count == 0 {
        return Ok(MusicToolFixSummary {
            repair_id: None,
            tool_id,
            action,
            applied: apply,
            confidence: MUSIC_TOOL_FIX_CONFIDENCE.to_string(),
            source_warning: MUSIC_TOOL_SOURCE_WARNING.to_string(),
            requested_count,
            fixable_count: 0,
            affected_album_count: 0,
            affected_track_count: 0,
            changed_album_count: 0,
            changed_track_count: 0,
            skipped_count: 0,
            backup_path: None,
            message: "No visible issue rows were selected for fixing.".to_string(),
            diffs: Vec::new(),
        });
    }

    let issue_prefix = format!("{tool_id}:");
    let selected_track_ids = requested_issue_ids
        .iter()
        .filter_map(|issue_id| {
            issue_id
                .strip_prefix(&issue_prefix)
                .and_then(|track_id| track_id.parse::<i64>().ok())
        })
        .collect::<HashSet<_>>();
    let (affected_track_ids, affected_album_ids) =
        whitespace_fix_targets(conn, &selected_track_ids)?;
    let fixable_count = affected_track_ids.len();
    let skipped_count = requested_count.saturating_sub(fixable_count);
    let diffs = whitespace_fix_diffs(conn, &affected_track_ids, &affected_album_ids)?;

    if !apply {
        return Ok(MusicToolFixSummary {
            repair_id: None,
            tool_id,
            action,
            applied: false,
            confidence: MUSIC_TOOL_FIX_CONFIDENCE.to_string(),
            source_warning: MUSIC_TOOL_SOURCE_WARNING.to_string(),
            requested_count,
            fixable_count,
            affected_album_count: affected_album_ids.len(),
            affected_track_count: affected_track_ids.len(),
            changed_album_count: 0,
            changed_track_count: 0,
            skipped_count,
            backup_path: None,
            message: format!(
                "Preview found {} across {}.",
                music_tool_count_label(fixable_count, "visible issue row", "visible issue rows"),
                music_tool_count_label(
                    diffs.len(),
                    "exact affected-row diff",
                    "exact affected-row diffs"
                )
            ),
            diffs,
        });
    }

    let backup_path = if fixable_count > 0 {
        match db_path {
            Some(path) => create_database_file_backup(path, "music-tool-fix")?,
            None => None,
        }
    } else {
        None
    };

    let backup_path_text = backup_path.as_ref().map(|path| path.display().to_string());
    let mut changed_track_count = 0_usize;
    let mut changed_album_count = 0_usize;
    let repair_id = if fixable_count > 0 {
        let diff_json =
            serde_json::to_string(&diffs).context("Could not serialize Music Tool repair diffs")?;
        let tx = conn
            .transaction()
            .context("Could not start Music Tool fix transaction")?;

        for track_id in &affected_track_ids {
            if compact_track_whitespace(&tx, *track_id)? {
                changed_track_count += 1;
            }
        }

        for album_id in &affected_album_ids {
            if compact_album_whitespace(&tx, album_id)? {
                changed_album_count += 1;
            }
        }

        let message = format!(
            "Compacted whitespace for {} and {}.",
            music_tool_count_label(changed_track_count, "track", "tracks"),
            music_tool_count_label(changed_album_count, "album", "albums")
        );
        tx.execute(
            "
            INSERT INTO music_tool_fix_runs (
                tool_id, action, status, confidence, requested_count, fixable_count,
                affected_album_count, affected_track_count, changed_album_count,
                changed_track_count, backup_path, source_warning, diff_json,
                message, created_at
            ) VALUES (
                ?1, ?2, 'applied', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                ?12, ?13, ?14
            )
            ",
            params![
                &tool_id,
                &action,
                MUSIC_TOOL_FIX_CONFIDENCE,
                requested_count as i64,
                fixable_count as i64,
                affected_album_ids.len() as i64,
                affected_track_ids.len() as i64,
                changed_album_count as i64,
                changed_track_count as i64,
                backup_path_text.as_deref(),
                MUSIC_TOOL_SOURCE_WARNING,
                diff_json,
                message,
                Utc::now().to_rfc3339(),
            ],
        )
        .context("Could not save Music Tool repair history")?;
        let repair_id = tx.last_insert_rowid();
        tx.commit()
            .context("Could not commit Music Tool whitespace fix")?;
        Some(repair_id)
    } else {
        None
    };

    if changed_track_count > 0 || changed_album_count > 0 {
        rebuild_search_indexes(conn)?;
    }

    Ok(MusicToolFixSummary {
        repair_id,
        tool_id,
        action,
        applied: true,
        confidence: MUSIC_TOOL_FIX_CONFIDENCE.to_string(),
        source_warning: MUSIC_TOOL_SOURCE_WARNING.to_string(),
        requested_count,
        fixable_count,
        affected_album_count: affected_album_ids.len(),
        affected_track_count: affected_track_ids.len(),
        changed_album_count,
        changed_track_count,
        skipped_count,
        backup_path: backup_path_text,
        message: format!(
            "Compacted whitespace for {} and {}.",
            music_tool_count_label(changed_track_count, "track", "tracks"),
            music_tool_count_label(changed_album_count, "album", "albums")
        ),
        diffs,
    })
}

pub(super) fn whitespace_fix_targets(
    conn: &Connection,
    selected_track_ids: &HashSet<i64>,
) -> Result<(HashSet<i64>, HashSet<String>)> {
    let sql = format!(
        "
        SELECT album_id
        FROM tracks t
        WHERE t.id = ?1
          AND ({WHITESPACE_ANOMALY_CONDITION_SQL})
        "
    );
    let mut affected_track_ids = HashSet::new();
    let mut affected_album_ids = HashSet::new();

    for track_id in selected_track_ids {
        let album_id = conn
            .query_row(&sql, params![track_id], |row| row.get::<_, String>(0))
            .optional()
            .with_context(|| format!("Could not validate whitespace issue track {track_id}"))?;
        if let Some(album_id) = album_id {
            affected_track_ids.insert(*track_id);
            affected_album_ids.insert(album_id);
        }
    }

    Ok((affected_track_ids, affected_album_ids))
}

pub(super) fn compact_track_whitespace(conn: &Connection, track_id: i64) -> Result<bool> {
    let current = conn
        .query_row(
            "
            SELECT
                display_artist,
                album_artist_display,
                album,
                title,
                genre,
                canonical_genre,
                publisher,
                file_path,
                filename
            FROM tracks
            WHERE id = ?1
            ",
            params![track_id],
            |row| {
                Ok(MusicToolTrackTextFields {
                    display_artist: row.get(0)?,
                    album_artist_display: row.get(1)?,
                    album: row.get(2)?,
                    title: row.get(3)?,
                    genre: row.get(4)?,
                    canonical_genre: row.get(5)?,
                    publisher: row.get(6)?,
                    file_path: row.get(7)?,
                    filename: row.get(8)?,
                })
            },
        )
        .optional()
        .with_context(|| format!("Could not load track {track_id} for whitespace fix"))?;

    let Some(current) = current else {
        return Ok(false);
    };
    let next = current.compacted();
    if current == next {
        return Ok(false);
    }

    conn.execute(
        "
        UPDATE tracks
        SET display_artist = ?1,
            album_artist_display = ?2,
            album = ?3,
            title = ?4,
            genre = ?5,
            canonical_genre = ?6,
            publisher = ?7,
            file_path = ?8,
            filename = ?9
        WHERE id = ?10
        ",
        params![
            next.display_artist.as_deref(),
            next.album_artist_display.as_deref(),
            next.album.as_deref(),
            next.title.as_deref(),
            next.genre.as_deref(),
            next.canonical_genre.as_deref(),
            next.publisher.as_deref(),
            next.file_path.as_deref(),
            next.filename.as_deref(),
            track_id
        ],
    )
    .with_context(|| format!("Could not compact whitespace for track {track_id}"))?;
    Ok(true)
}

pub(super) fn compact_album_whitespace(conn: &Connection, album_id: &str) -> Result<bool> {
    let current = conn
        .query_row(
            "
            SELECT
                album,
                album_artist_display,
                canonical_genre,
                genre_normalized,
                publisher
            FROM albums
            WHERE id = ?1
            ",
            params![album_id],
            |row| {
                Ok(MusicToolAlbumTextFields {
                    album: row.get(0)?,
                    album_artist_display: row.get(1)?,
                    canonical_genre: row.get(2)?,
                    genre_normalized: row.get(3)?,
                    publisher: row.get(4)?,
                })
            },
        )
        .optional()
        .with_context(|| format!("Could not load album {album_id} for whitespace fix"))?;

    let Some(current) = current else {
        return Ok(false);
    };
    let next = current.compacted();
    if current == next {
        return Ok(false);
    }

    conn.execute(
        "
        UPDATE albums
        SET album = ?1,
            album_artist_display = ?2,
            canonical_genre = ?3,
            genre_normalized = ?4,
            publisher = ?5
        WHERE id = ?6
        ",
        params![
            next.album.as_deref(),
            next.album_artist_display.as_deref(),
            next.canonical_genre.as_deref(),
            next.genre_normalized.as_deref(),
            next.publisher.as_deref(),
            album_id
        ],
    )
    .with_context(|| format!("Could not compact whitespace for album {album_id}"))?;
    Ok(true)
}

pub(super) fn compact_optional_whitespace(value: &Option<String>) -> Option<String> {
    value.as_deref().map(compact_whitespace)
}

pub(super) fn music_tool_fix_history_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<MusicToolFixHistoryRow> {
    Ok(MusicToolFixHistoryRow {
        id: row.get(0)?,
        tool_id: row.get(1)?,
        action: row.get(2)?,
        status: row.get(3)?,
        confidence: row.get(4)?,
        requested_count: row.get(5)?,
        fixable_count: row.get(6)?,
        affected_album_count: row.get(7)?,
        affected_track_count: row.get(8)?,
        changed_album_count: row.get(9)?,
        changed_track_count: row.get(10)?,
        backup_path: row.get(11)?,
        undo_backup_path: row.get(12)?,
        source_warning: row.get(13)?,
        diff_json: row.get(14)?,
        message: row.get(15)?,
        created_at: row.get(16)?,
        undone_at: row.get(17)?,
    })
}

pub(super) fn music_tool_fix_history_entry(
    row: MusicToolFixHistoryRow,
) -> Result<(MusicToolFixHistoryEntry, Vec<MusicToolFixDiff>)> {
    let diffs = serde_json::from_str::<Vec<MusicToolFixDiff>>(&row.diff_json)
        .context("Could not read Music Tool repair diffs")?;
    let tool_label = MUSIC_TOOLS
        .iter()
        .find(|definition| definition.id == row.tool_id)
        .map(|definition| definition.label)
        .unwrap_or(row.tool_id.as_str())
        .to_string();
    let status = row.status;
    let can_undo = status == "applied";
    Ok((
        MusicToolFixHistoryEntry {
            id: row.id,
            tool_id: row.tool_id,
            tool_label,
            action: row.action,
            status,
            confidence: row.confidence,
            requested_count: row.requested_count.max(0) as usize,
            fixable_count: row.fixable_count.max(0) as usize,
            affected_album_count: row.affected_album_count.max(0) as usize,
            affected_track_count: row.affected_track_count.max(0) as usize,
            changed_album_count: row.changed_album_count.max(0) as usize,
            changed_track_count: row.changed_track_count.max(0) as usize,
            diff_count: diffs.len(),
            backup_path: row.backup_path,
            undo_backup_path: row.undo_backup_path,
            source_warning: row.source_warning,
            message: row.message,
            created_at: row.created_at,
            undone_at: row.undone_at,
            can_undo,
        },
        diffs,
    ))
}

pub(super) fn list_music_tool_fix_history(
    conn: &Connection,
    tool_id: Option<&str>,
) -> Result<Vec<MusicToolFixHistoryEntry>> {
    let mut statement = conn
        .prepare(
            "
            SELECT
                id, tool_id, action, status, confidence, requested_count,
                fixable_count, affected_album_count, affected_track_count,
                changed_album_count, changed_track_count, backup_path,
                undo_backup_path, source_warning, diff_json, message,
                created_at, undone_at
            FROM music_tool_fix_runs
            WHERE ?1 IS NULL OR tool_id = ?1
            ORDER BY id DESC
            LIMIT 24
            ",
        )
        .context("Could not prepare Music Tool repair history")?;
    let rows = statement
        .query_map(params![tool_id], music_tool_fix_history_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load Music Tool repair history")?;
    rows.into_iter()
        .map(|row| music_tool_fix_history_entry(row).map(|(entry, _)| entry))
        .collect()
}

pub(super) fn load_music_tool_fix_history_run(
    conn: &Connection,
    run_id: i64,
) -> Result<(MusicToolFixHistoryEntry, Vec<MusicToolFixDiff>)> {
    let row = conn
        .query_row(
            "
            SELECT
                id, tool_id, action, status, confidence, requested_count,
                fixable_count, affected_album_count, affected_track_count,
                changed_album_count, changed_track_count, backup_path,
                undo_backup_path, source_warning, diff_json, message,
                created_at, undone_at
            FROM music_tool_fix_runs
            WHERE id = ?1
            ",
            params![run_id],
            music_tool_fix_history_row,
        )
        .optional()
        .context("Could not load Music Tool repair history entry")?
        .ok_or_else(|| anyhow!("Music Tool repair history entry {run_id} was not found"))?;
    music_tool_fix_history_entry(row)
}

pub(super) fn validate_music_tool_diff_field(
    entity_type: &str,
    field: &str,
) -> Result<&'static str> {
    let allowed = match entity_type {
        "tracks" => matches!(
            field,
            "display_artist"
                | "album_artist_display"
                | "album"
                | "title"
                | "genre"
                | "canonical_genre"
                | "publisher"
                | "file_path"
                | "filename"
        ),
        "albums" => matches!(
            field,
            "album" | "album_artist_display" | "canonical_genre" | "genre_normalized" | "publisher"
        ),
        _ => false,
    };
    if !allowed {
        bail!("Unsupported Music Tool undo field {entity_type}.{field}");
    }
    Ok(if entity_type == "tracks" {
        "tracks"
    } else {
        "albums"
    })
}

pub(super) fn music_tool_diff_current_value(
    conn: &Connection,
    diff: &MusicToolFixDiff,
    change: &MusicToolFieldDiff,
) -> Result<Option<String>> {
    let table = validate_music_tool_diff_field(&diff.entity_type, &change.field)?;
    let sql = format!("SELECT {} FROM {table} WHERE id = ?1", change.field);
    let current = if table == "tracks" {
        let track_id = diff
            .track_id
            .or_else(|| diff.entity_id.parse::<i64>().ok())
            .ok_or_else(|| anyhow!("Repair diff {} has no valid track id", diff.id))?;
        conn.query_row(&sql, params![track_id], |row| {
            row.get::<_, Option<String>>(0)
        })
        .optional()
        .with_context(|| format!("Could not validate undo value for {}", diff.id))?
    } else {
        conn.query_row(&sql, params![&diff.entity_id], |row| {
            row.get::<_, Option<String>>(0)
        })
        .optional()
        .with_context(|| format!("Could not validate undo value for {}", diff.id))?
    };
    current.ok_or_else(|| anyhow!("Affected row {} no longer exists", diff.id))
}

pub(super) fn restore_music_tool_diff_field(
    conn: &Connection,
    diff: &MusicToolFixDiff,
    change: &MusicToolFieldDiff,
) -> Result<()> {
    let table = validate_music_tool_diff_field(&diff.entity_type, &change.field)?;
    let sql = format!("UPDATE {table} SET {} = ?1 WHERE id = ?2", change.field);
    if table == "tracks" {
        let track_id = diff
            .track_id
            .or_else(|| diff.entity_id.parse::<i64>().ok())
            .ok_or_else(|| anyhow!("Repair diff {} has no valid track id", diff.id))?;
        conn.execute(&sql, params![change.before.as_deref(), track_id])
            .with_context(|| format!("Could not restore {}", diff.id))?;
    } else {
        conn.execute(&sql, params![change.before.as_deref(), &diff.entity_id])
            .with_context(|| format!("Could not restore {}", diff.id))?;
    }
    Ok(())
}

pub(super) fn undo_music_tool_fix(
    conn: &mut Connection,
    db_path: Option<&Path>,
    run_id: i64,
) -> Result<MusicToolUndoSummary> {
    let (history, diffs) = load_music_tool_fix_history_run(conn, run_id)?;
    if history.status != "applied" {
        bail!("This Music Tool repair has already been undone");
    }
    if diffs.is_empty() {
        bail!("This Music Tool repair has no affected-row diffs to restore");
    }

    for diff in &diffs {
        for change in &diff.changes {
            let current = music_tool_diff_current_value(conn, diff, change)?;
            if current != change.after {
                bail!(
                    "Undo stopped because {} / {} changed after this repair. Re-run the validator before making another repair.",
                    diff.label,
                    change.label
                );
            }
        }
    }

    let backup_path = match db_path {
        Some(path) => create_database_file_backup(path, "music-tool-undo")?,
        None => None,
    };
    let backup_path_text = backup_path.as_ref().map(|path| path.display().to_string());
    let restored_track_ids = diffs
        .iter()
        .filter(|diff| diff.entity_type == "tracks")
        .map(|diff| diff.entity_id.as_str())
        .collect::<HashSet<_>>();
    let restored_album_ids = diffs
        .iter()
        .filter(|diff| diff.entity_type == "albums")
        .map(|diff| diff.entity_id.as_str())
        .collect::<HashSet<_>>();
    let restored_track_count = restored_track_ids.len();
    let restored_album_count = restored_album_ids.len();
    let message = format!(
        "Restored {} and {} from repair #{run_id}.",
        music_tool_count_label(restored_track_count, "track", "tracks"),
        music_tool_count_label(restored_album_count, "album", "albums")
    );

    {
        let tx = conn
            .transaction()
            .context("Could not start Music Tool undo transaction")?;
        for diff in &diffs {
            for change in &diff.changes {
                restore_music_tool_diff_field(&tx, diff, change)?;
            }
        }
        tx.execute(
            "
            UPDATE music_tool_fix_runs
            SET status = 'undone',
                undo_backup_path = ?1,
                message = ?2,
                undone_at = ?3
            WHERE id = ?4 AND status = 'applied'
            ",
            params![
                backup_path_text.as_deref(),
                &message,
                Utc::now().to_rfc3339(),
                run_id
            ],
        )
        .context("Could not update Music Tool repair history after undo")?;
        tx.commit()
            .context("Could not commit Music Tool repair undo")?;
    }
    rebuild_search_indexes(conn)?;
    let (run, _) = load_music_tool_fix_history_run(conn, run_id)?;
    Ok(MusicToolUndoSummary {
        run,
        restored_album_count,
        restored_track_count,
        backup_path: backup_path_text,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn previews_and_applies_whitespace_music_tool_fix() {
        let mut conn = seeded_connection();
        conn.execute(
            "
            UPDATE tracks
            SET album = 'Actually  Deluxe',
                album_artist_display = 'Pet  Shop Boys',
                display_artist = 'Pet  Shop Boys',
                title = 'What  Have I Done?',
                genre = 'Synthpop  Dance',
                canonical_genre = 'Synthpop  Dance',
                publisher = 'Parlo  phone',
                file_path = 'D:\\Music\\Pet  Shop Boys\\Actually',
                filename = '02 What  Have I Done.mp3'
            WHERE id = 1
            ",
            [],
        )
        .expect("make track whitespace issue");
        conn.execute(
            "
            UPDATE albums
            SET album = 'Actually  Deluxe',
                album_artist_display = 'Pet  Shop Boys',
                canonical_genre = 'Synthpop  Dance',
                genre_normalized = 'synthpop  dance',
                publisher = 'Parlo  phone'
            WHERE id = 'mb:test'
            ",
            [],
        )
        .expect("make album whitespace issue");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "whitespace-anomalies".to_string();
        let response = list_music_tool_issues(&conn, request.clone(), 50, None)
            .expect("list whitespace issues");

        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.total, 1);

        let issue_ids = response
            .rows
            .iter()
            .map(|row| row.id.clone())
            .collect::<Vec<_>>();
        let preview = fix_music_tool_issues(
            &mut conn,
            None,
            MusicToolFixRequest {
                tool_id: "whitespace-anomalies".to_string(),
                issue_ids: issue_ids.clone(),
                apply: false,
            },
        )
        .expect("preview whitespace fix");

        assert!(!preview.applied);
        assert_eq!(preview.fixable_count, 1);
        assert_eq!(preview.changed_track_count, 0);
        assert_eq!(preview.confidence, "high");
        assert_eq!(preview.diffs.len(), 2);
        assert!(preview.diffs.iter().any(|diff| diff.entity_type == "tracks"
            && diff.changes.iter().any(|change| {
                change.field == "title"
                    && change.before.as_deref() == Some("What  Have I Done?")
                    && change.after.as_deref() == Some("What Have I Done?")
            })));

        let still_dirty = list_music_tool_issues(&conn, request.clone(), 50, None)
            .expect("list whitespace issues after preview");
        assert_eq!(still_dirty.total, 1);

        let summary = fix_music_tool_issues(
            &mut conn,
            None,
            MusicToolFixRequest {
                tool_id: "whitespace-anomalies".to_string(),
                issue_ids,
                apply: true,
            },
        )
        .expect("apply whitespace fix");

        assert!(summary.applied);
        assert_eq!(summary.fixable_count, 1);
        assert_eq!(summary.changed_track_count, 1);
        assert_eq!(summary.changed_album_count, 1);
        assert!(summary.backup_path.is_none());
        let repair_id = summary.repair_id.expect("repair history id");

        let clean = list_music_tool_issues(&conn, request.clone(), 50, None)
            .expect("list whitespace issues after fix");
        assert_eq!(clean.total, 0);

        let (track_album, track_artist, track_title, track_genre, track_path, track_filename): (
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "
                SELECT album, album_artist_display, title, canonical_genre, file_path, filename
                FROM tracks
                WHERE id = 1
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
            .expect("load compacted track");
        let (album_title, album_artist, album_genre): (
            Option<String>,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "
                SELECT album, album_artist_display, canonical_genre
                FROM albums
                WHERE id = 'mb:test'
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("load compacted album");

        assert_eq!(track_album.as_deref(), Some("Actually Deluxe"));
        assert_eq!(track_artist.as_deref(), Some("Pet Shop Boys"));
        assert_eq!(track_title.as_deref(), Some("What Have I Done?"));
        assert_eq!(track_genre.as_deref(), Some("Synthpop Dance"));
        assert_eq!(
            track_path.as_deref(),
            Some("D:\\Music\\Pet Shop Boys\\Actually")
        );
        assert_eq!(track_filename.as_deref(), Some("02 What Have I Done.mp3"));
        assert_eq!(album_title.as_deref(), Some("Actually Deluxe"));
        assert_eq!(album_artist.as_deref(), Some("Pet Shop Boys"));
        assert_eq!(album_genre.as_deref(), Some("Synthpop Dance"));

        let history =
            list_music_tool_fix_history(&conn, None).expect("list Music Tool repair history");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, repair_id);
        assert_eq!(history[0].status, "applied");
        assert!(history[0].can_undo);
        assert_eq!(history[0].diff_count, 2);

        let undo = undo_music_tool_fix(&mut conn, None, repair_id).expect("undo whitespace repair");
        assert_eq!(undo.restored_track_count, 1);
        assert_eq!(undo.restored_album_count, 1);
        assert_eq!(undo.run.status, "undone");
        assert!(!undo.run.can_undo);

        let dirty_again = list_music_tool_issues(&conn, request, 50, None)
            .expect("list whitespace issues after undo");
        assert_eq!(dirty_again.total, 1);
        let restored_title: Option<String> = conn
            .query_row("SELECT title FROM tracks WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("load restored title");
        assert_eq!(restored_title.as_deref(), Some("What  Have I Done?"));
    }

    #[test]
    fn stops_music_tool_undo_when_a_repaired_field_changed_later() {
        let mut conn = seeded_connection();
        conn.execute(
            "UPDATE tracks SET title = 'What  Have I Done?' WHERE id = 1",
            [],
        )
        .expect("make whitespace issue");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "whitespace-anomalies".to_string();
        let response =
            list_music_tool_issues(&conn, request, 50, None).expect("list whitespace issues");
        let summary = fix_music_tool_issues(
            &mut conn,
            None,
            MusicToolFixRequest {
                tool_id: "whitespace-anomalies".to_string(),
                issue_ids: response.rows.into_iter().map(|row| row.id).collect(),
                apply: true,
            },
        )
        .expect("apply whitespace repair");
        let repair_id = summary.repair_id.expect("repair history id");

        conn.execute(
            "UPDATE tracks SET title = 'Manual title after repair' WHERE id = 1",
            [],
        )
        .expect("change repaired field");
        let error = undo_music_tool_fix(&mut conn, None, repair_id)
            .expect_err("reject stale Music Tool undo");
        assert!(error.to_string().contains("changed after this repair"));
        let history =
            list_music_tool_fix_history(&conn, None).expect("list Music Tool repair history");
        assert_eq!(history[0].status, "applied");
        assert!(history[0].can_undo);
    }
}
