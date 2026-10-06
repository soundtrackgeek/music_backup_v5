use super::*;

#[derive(Debug, Clone, Copy)]
pub(super) struct MusicToolDefinition {
    pub(super) id: &'static str,
    pub(super) label: &'static str,
    pub(super) description: &'static str,
    pub(super) severity: &'static str,
    pub(super) scope: &'static str,
}

pub(super) const WHITESPACE_ANOMALY_CONDITION_SQL: &str = "
    COALESCE(t.album, '') GLOB '*  *' OR
    COALESCE(t.album_artist_display, '') GLOB '*  *' OR
    COALESCE(t.display_artist, '') GLOB '*  *' OR
    COALESCE(t.title, '') GLOB '*  *' OR
    COALESCE(t.genre, '') GLOB '*  *' OR
    COALESCE(t.canonical_genre, '') GLOB '*  *' OR
    COALESCE(t.publisher, '') GLOB '*  *' OR
    COALESCE(t.file_path, '') GLOB '*  *' OR
    COALESCE(t.filename, '') GLOB '*  *'
";

pub(super) const MUSIC_TOOL_FIX_CONFIDENCE: &str = "high";
pub(super) const MUSIC_TOOL_SOURCE_WARNING: &str =
    "This repair changes only the app-local SQLite library. MusicBee TSV rows and audio tags remain unchanged, so re-importing the same source can restore the original spacing.";

pub(super) fn music_tool_count_label(count: usize, singular: &str, plural: &str) -> String {
    format!("{count} {}", if count == 1 { singular } else { plural })
}

pub(super) const MUSIC_TOOLS: &[MusicToolDefinition] = &[
    MusicToolDefinition {
        id: "duplicate-albums",
        label: "Duplicate albums",
        description: "Potential duplicate album versions with the same artist, title, and year.",
        severity: "medium",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "albums-without-cover-image",
        label: "Albums without embedded cover image",
        description: "Albums missing an imported archive or embedded cover image record.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "missing-chart-albums",
        label: "Missing Chart Albums",
        description:
            "Imported Billboard, Official UK, and VG Lista albums not linked to the library.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "missing-chart-singles",
        label: "Missing Chart Singles",
        description: "Imported Billboard, Official UK, VG Lista, Ti i Skuddet, and Norsktoppen singles not linked to the library.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "artists-without-musicbrainz-data",
        label: "Artists without MusicBrainz data",
        description:
            "Library album artists without a usable MusicBrainz cache or verified overlay match.",
        severity: "medium",
        scope: "artists",
    },
    MusicToolDefinition {
        id: "high-confidence-missing-musicbrainz-albums",
        label: "High-confidence missing MusicBrainz albums",
        description:
            "Collection-wide missing pure official MusicBrainz albums from trusted artist matches.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "albums-not-on-musicbrainz-official-list",
        label: "Albums not on MusicBrainz official list",
        description:
            "Local albums absent from pure official MusicBrainz album lists for trusted artist matches.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "owned-musicbrainz-special-releases",
        label: "Owned MusicBrainz special releases",
        description:
            "Local albums positively matched to selected MusicBrainz compilation, live, interview, or EP release-group types and absent from the pure album list.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "duplicates-within-album",
        label: "Duplicates within album",
        description: "Tracks that repeat a title or disc/track position inside one album.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "invalid-time-values",
        label: "Invalid time values",
        description: "Tracks where duration could not be parsed into seconds.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "non-numeric-ratings",
        label: "Non-numeric ratings",
        description: "Track ratings that contain non-numeric text.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "missing-tags",
        label: "Missing tags",
        description: "Tracks missing required album, artist, title, genre, year, or file tags.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "non-mp3-files",
        label: "Non-MP3 files",
        description: "Tracks whose filenames do not end in .mp3.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "audio-below-320-kbps",
        label: "Audio below 320 kbps",
        description: "Music Doctor audio matches with a measured bitrate below 320 kbps.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "mixed-audio-quality",
        label: "Albums with mixed audio quality",
        description: "Albums whose Music Doctor matches contain more than one measured bitrate.",
        severity: "low",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "music-doctor-unimported-audio",
        label: "Music Doctor audio not in library",
        description: "Audio files scanned by Music Doctor that do not match the imported library.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "music-doctor-file-problems",
        label: "Music Doctor file problems",
        description: "Empty, missing, or unreadable files reported by Music Doctor.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "year-anomalies",
        label: "Year anomalies",
        description: "Tracks with missing or implausible canonical year values.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "ratings-out-of-range",
        label: "Ratings out of range",
        description: "Numeric ratings that are not whole-number values from 0 to 5.",
        severity: "high",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "track-disc-number-issues",
        label: "Track/disc number issues",
        description: "Tracks with missing, zero, or negative disc and track numbers.",
        severity: "medium",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "inconsistent-album-metadata",
        label: "Inconsistent album metadata",
        description: "Albums whose tracks disagree on title, genre, or publisher.",
        severity: "medium",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "whitespace-anomalies",
        label: "Whitespace anomalies",
        description: "Track metadata with repeated internal spaces.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "genre-normalization-issues",
        label: "Genre normalization issues",
        description:
            "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
        severity: "low",
        scope: "tracks",
    },
    MusicToolDefinition {
        id: "conflicting-album-artists",
        label: "Conflicting album artists",
        description: "Albums whose tracks disagree on album artist.",
        severity: "high",
        scope: "albums",
    },
    MusicToolDefinition {
        id: "multiple-years-per-album",
        label: "Multiple years per album",
        description: "Albums containing tracks with more than one canonical year.",
        severity: "medium",
        scope: "albums",
    },
];

#[cfg(not(test))]
pub fn list_music_tools_for_app(app: &AppHandle) -> Result<Vec<MusicToolSummary>> {
    let (conn, _) = open(app)?;
    list_music_tools(&conn)
}

#[cfg(not(test))]
pub fn list_music_tool_issues_for_app(
    app: &AppHandle,
    request: MusicToolIssueRequest,
) -> Result<MusicToolIssueResponse> {
    let (mut conn, _) = open(app)?;
    let tool_id = request.tool_id.clone();
    let request_id = request.request_id.clone();
    ensure_music_tool_data_for_request(app, &mut conn, &request)?;
    let result = list_music_tool_issues(&conn, request, 500, Some(app));
    if result.is_err() {
        emit_music_tool_progress(
            Some(app),
            &tool_id,
            &request_id,
            "failed",
            100,
            "Validation count failed.",
        );
    }
    result
}

#[cfg(not(test))]
pub fn fix_music_tool_issues_for_app(
    app: &AppHandle,
    input: MusicToolFixRequest,
) -> Result<MusicToolFixSummary> {
    let (mut conn, db_path) = open(app)?;
    fix_music_tool_issues(&mut conn, Some(db_path.as_path()), input)
}

#[cfg(not(test))]
pub fn list_music_tool_fix_history_for_app(
    app: &AppHandle,
    tool_id: Option<String>,
) -> Result<Vec<MusicToolFixHistoryEntry>> {
    let (conn, _) = open_read(app)?;
    list_music_tool_fix_history(&conn, tool_id.as_deref())
}

#[cfg(not(test))]
pub fn undo_music_tool_fix_for_app(app: &AppHandle, run_id: i64) -> Result<MusicToolUndoSummary> {
    let (mut conn, db_path) = open(app)?;
    undo_music_tool_fix(&mut conn, Some(db_path.as_path()), run_id)
}

pub(super) fn list_music_tools(conn: &Connection) -> Result<Vec<MusicToolSummary>> {
    let _ = count_rows(conn, "tracks")?;
    Ok(MUSIC_TOOLS
        .iter()
        .map(|definition| music_tool_catalog_summary(*definition))
        .collect())
}

pub(super) fn list_music_tool_issues(
    conn: &Connection,
    request: MusicToolIssueRequest,
    max_limit: u32,
    progress_app: Option<ProgressApp<'_>>,
) -> Result<MusicToolIssueResponse> {
    let definition = music_tool_definition(&request.tool_id)?;
    let has_musicbrainz_preparation = music_tool_has_musicbrainz_preparation(definition.id);
    let is_collection_comparison_tool = matches!(
        definition.id,
        "albums-not-on-musicbrainz-official-list" | "owned-musicbrainz-special-releases"
    );
    let (summary_start, summary_cap, filter_start, filter_cap, rows_start, rows_cap) =
        if is_collection_comparison_tool {
            (90, 96, 97, 98, 99, 99)
        } else if has_musicbrainz_preparation {
            (52, 72, 76, 86, 90, 98)
        } else {
            (5, 58, 62, 78, 82, 96)
        };
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "starting",
        summary_start,
        "Starting validation count.",
    );
    let summary_pulse = start_music_tool_progress_pulse(
        progress_app,
        definition.id,
        &request.request_id,
        "counting",
        summary_start,
        summary_cap,
        if is_collection_comparison_tool {
            "Comparing local albums with MusicBrainz."
        } else {
            "Counting selected validator issues."
        },
    );
    let raw_base_sql = music_tool_issue_sql(definition.id)?;
    let base_sql = materialize_music_tool_issue_rows(conn, definition.id, raw_base_sql)?;
    let tool_result = music_tool_summary(conn, definition, &base_sql);
    drop(summary_pulse);
    let tool = tool_result?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "counting",
        filter_start,
        "Applying filters to the selected tool.",
    );

    let (where_sql, values) = music_tool_issue_search_where(&request.search_text);
    let limit = request.limit.clamp(1, max_limit);
    let offset = request.offset;

    let count_sql = format!("SELECT COUNT(*) FROM ({base_sql}) issue_rows {where_sql}");
    let count_pulse = start_music_tool_progress_pulse(
        progress_app,
        definition.id,
        &request.request_id,
        "counting",
        filter_start,
        filter_cap,
        "Counting filtered issue rows.",
    );
    let total_result = conn
        .query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })
        .with_context(|| format!("Could not count {} issues", definition.label));
    drop(count_pulse);
    let total = total_result?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "loading",
        rows_start,
        "Loading issue rows.",
    );

    let order_sql = music_tool_issue_order_clause(&request.sort);
    let sql =
        format!("SELECT * FROM ({base_sql}) issue_rows {where_sql} {order_sql} LIMIT ? OFFSET ?");
    let mut row_values = values;
    row_values.push(Value::Integer(i64::from(limit)));
    row_values.push(Value::Integer(i64::from(offset)));

    let rows_pulse = start_music_tool_progress_pulse(
        progress_app,
        definition.id,
        &request.request_id,
        "loading",
        rows_start,
        rows_cap,
        "Loading issue rows.",
    );
    let rows_result = (|| -> Result<Vec<MusicToolIssueRow>> {
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(
                params_from_iter(row_values.iter()),
                music_tool_issue_from_row,
            )?
            .collect::<rusqlite::Result<Vec<_>>>()
            .with_context(|| format!("Could not load {} issues", definition.label))?;
        Ok(rows)
    })();
    drop(rows_pulse);
    let rows = rows_result?;
    emit_music_tool_progress(
        progress_app,
        definition.id,
        &request.request_id,
        "completed",
        100,
        "Validation count complete.",
    );

    Ok(MusicToolIssueResponse {
        tool,
        rows,
        total,
        limit,
        offset,
    })
}

pub(super) fn music_tool_summary(
    conn: &Connection,
    definition: MusicToolDefinition,
    base_sql: &str,
) -> Result<MusicToolSummary> {
    let sql = format!(
        "
        SELECT
            COUNT(*),
            COUNT(DISTINCT album_id),
            COUNT(DISTINCT track_id)
        FROM ({base_sql}) issue_rows
        "
    );
    let (issue_count, album_count, mut track_count) = conn
        .query_row(&sql, [], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .with_context(|| format!("Could not count {} issues", definition.label))?;

    if definition.id == "missing-chart-singles" {
        track_count = issue_count;
    }

    Ok(MusicToolSummary {
        id: definition.id.to_string(),
        label: definition.label.to_string(),
        description: definition.description.to_string(),
        severity: definition.severity.to_string(),
        scope: definition.scope.to_string(),
        issue_count,
        album_count,
        track_count,
    })
}

pub(super) fn music_tool_has_musicbrainz_preparation(tool_id: &str) -> bool {
    matches!(
        tool_id,
        "artists-without-musicbrainz-data"
            | "high-confidence-missing-musicbrainz-albums"
            | "albums-not-on-musicbrainz-official-list"
            | "owned-musicbrainz-special-releases"
    )
}

pub(super) fn materialize_music_tool_issue_rows(
    conn: &Connection,
    tool_id: &str,
    base_sql: String,
) -> Result<String> {
    let table_name = match tool_id {
        "albums-not-on-musicbrainz-official-list" => "musicbrainz_tool_official_list_issues",
        "owned-musicbrainz-special-releases" => "musicbrainz_tool_special_release_issues",
        _ => return Ok(base_sql),
    };

    conn.execute_batch(&format!("DROP TABLE IF EXISTS temp.{table_name};"))
        .context("Could not clear the previous MusicBrainz collection comparison")?;
    conn.execute_batch(&format!("CREATE TEMP TABLE {table_name} AS {base_sql};"))
        .context("Could not materialize the MusicBrainz collection comparison")?;
    conn.execute_batch(&format!(
        "
        CREATE INDEX temp.idx_{table_name}_album
            ON {table_name}(album_artist_display, album);
        CREATE INDEX temp.idx_{table_name}_year
            ON {table_name}(year);
        "
    ))
    .context("Could not index the MusicBrainz collection comparison")?;

    Ok(format!("SELECT * FROM temp.{table_name}"))
}

pub(super) fn music_tool_catalog_summary(definition: MusicToolDefinition) -> MusicToolSummary {
    MusicToolSummary {
        id: definition.id.to_string(),
        label: definition.label.to_string(),
        description: definition.description.to_string(),
        severity: definition.severity.to_string(),
        scope: definition.scope.to_string(),
        issue_count: -1,
        album_count: -1,
        track_count: -1,
    }
}

#[cfg(not(test))]
pub(super) fn emit_music_tool_progress(
    app: Option<ProgressApp<'_>>,
    tool_id: &str,
    request_id: &str,
    status: &str,
    percent: u8,
    message: &str,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "music-tool-progress",
            MusicToolProgress {
                tool_id: tool_id.to_string(),
                request_id: request_id.to_string(),
                status: status.to_string(),
                percent: percent.min(100),
                message: message.to_string(),
            },
        );
    }
}

#[cfg(test)]
pub(super) fn emit_music_tool_progress(
    _app: Option<ProgressApp<'_>>,
    _tool_id: &str,
    _request_id: &str,
    _status: &str,
    _percent: u8,
    _message: &str,
) {
}

pub(super) struct MusicToolProgressPulse {
    pub(super) stop: Arc<AtomicBool>,
    pub(super) handle: Option<thread::JoinHandle<()>>,
}

impl Drop for MusicToolProgressPulse {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(not(test))]
pub(super) fn start_music_tool_progress_pulse(
    app: Option<ProgressApp<'_>>,
    tool_id: &str,
    request_id: &str,
    status: &'static str,
    start: u8,
    cap: u8,
    message: &'static str,
) -> Option<MusicToolProgressPulse> {
    if cap <= start {
        return None;
    }

    let Some(app) = app else {
        return None;
    };

    let app = app.clone();
    let tool_id = tool_id.to_string();
    let request_id = request_id.to_string();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);

    let handle = thread::spawn(move || {
        let mut percent = start;
        while !thread_stop.load(Ordering::Relaxed) && percent < cap {
            thread::sleep(Duration::from_millis(180));
            if thread_stop.load(Ordering::Relaxed) {
                break;
            }
            percent = percent.saturating_add(1).min(cap);
            let _ = app.emit(
                "music-tool-progress",
                MusicToolProgress {
                    tool_id: tool_id.clone(),
                    request_id: request_id.clone(),
                    status: status.to_string(),
                    percent,
                    message: message.to_string(),
                },
            );
        }
    });

    Some(MusicToolProgressPulse {
        stop,
        handle: Some(handle),
    })
}

#[cfg(test)]
pub(super) fn start_music_tool_progress_pulse(
    _app: Option<ProgressApp<'_>>,
    _tool_id: &str,
    _request_id: &str,
    _status: &'static str,
    _start: u8,
    _cap: u8,
    _message: &'static str,
) -> Option<MusicToolProgressPulse> {
    None
}

pub(super) fn music_tool_definition(tool_id: &str) -> Result<MusicToolDefinition> {
    MUSIC_TOOLS
        .iter()
        .copied()
        .find(|definition| definition.id == tool_id)
        .ok_or_else(|| anyhow!("Unknown music tool: {tool_id}"))
}

pub(super) fn music_tool_issue_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<MusicToolIssueRow> {
    let includes_chart_columns = row.as_ref().column_count() >= 20;
    Ok(MusicToolIssueRow {
        id: row.get(0)?,
        tool_id: row.get(1)?,
        severity: row.get(2)?,
        entity_type: row.get(3)?,
        album_id: row.get(4)?,
        track_id: row.get(5)?,
        album: row.get(6)?,
        album_artist_display: row.get(7)?,
        title: row.get(8)?,
        canonical_genre: row.get(9)?,
        year: row.get(10)?,
        detail: row.get(11)?,
        value: row.get(12)?,
        filename: row.get(13)?,
        file_path: row.get(14)?,
        billboard: if includes_chart_columns {
            row.get(15)?
        } else {
            None
        },
        official_uk: if includes_chart_columns {
            row.get(16)?
        } else {
            None
        },
        vg_lista: if includes_chart_columns {
            row.get(17)?
        } else {
            None
        },
        ti_i_skuddet: if includes_chart_columns {
            row.get(18)?
        } else {
            None
        },
        norsktoppen: if includes_chart_columns {
            row.get(19)?
        } else {
            None
        },
    })
}

pub(super) fn music_tool_issue_search_where(search_text: &str) -> (String, Vec<Value>) {
    let search_text = search_text.trim();
    if search_text.is_empty() {
        return (String::new(), Vec::new());
    }

    let normalized = search_text.to_lowercase();
    (
        "
        WHERE LOWER(
            COALESCE(album, '') || ' ' ||
            COALESCE(album_artist_display, '') || ' ' ||
            COALESCE(title, '') || ' ' ||
            COALESCE(canonical_genre, '') || ' ' ||
            COALESCE(detail, '') || ' ' ||
            COALESCE(value, '') || ' ' ||
            COALESCE(filename, '') || ' ' ||
            COALESCE(file_path, '')
        ) LIKE ? ESCAPE '\\'
        "
        .to_string(),
        vec![Value::Text(format!("%{}%", escape_like(&normalized)))],
    )
}

pub(super) fn music_tool_issue_order_clause(sort: &BrowseSort) -> String {
    let direction = if sort.direction.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let field = match sort.field.as_str() {
        "artist" => "LOWER(COALESCE(album_artist_display, ''))",
        "year" => "year",
        "title" => "LOWER(COALESCE(title, ''))",
        "severity" => "severity",
        "value" => "LOWER(COALESCE(value, ''))",
        "filename" => "LOWER(COALESCE(filename, ''))",
        "detail" => "LOWER(COALESCE(detail, ''))",
        _ => "LOWER(COALESCE(album, ''))",
    };

    format!(
        "ORDER BY {field} {direction}, LOWER(COALESCE(album_artist_display, '')) ASC, LOWER(COALESCE(album, '')) ASC, COALESCE(track_id, 0) ASC"
    )
}

pub(super) fn music_tool_issue_sql(tool_id: &str) -> Result<String> {
    match tool_id {
        "duplicate-albums" => {
            let album_artist_key_sql = artist_key_sql("album_artist_display");
            let album_artist_key_sql_a = artist_key_sql("a.album_artist_display");
            Ok(format!(
                "
            WITH duplicate_groups AS (
                SELECT
                    {album_artist_key_sql} AS artist_key,
                    COALESCE(NULLIF(TRIM(LOWER(album)), ''), 'unknown') AS album_key,
                    COALESCE(year, -1) AS year_key,
                    COUNT(*) AS version_count
                FROM albums
                GROUP BY artist_key, album_key, year_key
                HAVING COUNT(*) > 1
            )
            SELECT
                'duplicate-albums:' || a.id AS id,
                'duplicate-albums' AS tool_id,
                'medium' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Potential duplicate album version' AS detail,
                printf('%d albums share artist/title/year', g.version_count) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM albums a
            JOIN duplicate_groups g
              ON {album_artist_key_sql_a} = g.artist_key
             AND COALESCE(NULLIF(TRIM(LOWER(a.album)), ''), 'unknown') = g.album_key
             AND COALESCE(a.year, -1) = g.year_key
            "
            ))
        },
        "albums-without-cover-image" => Ok(
            "
            WITH representative_paths AS (
                SELECT
                    album_id,
                    MIN(NULLIF(TRIM(filename), '')) AS filename,
                    MIN(NULLIF(TRIM(file_path), '')) AS file_path
                FROM tracks
                GROUP BY album_id
            )
            SELECT
                'albums-without-cover-image:' || a.id AS id,
                'albums-without-cover-image' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'No imported cover image' AS detail,
                'Missing album cover record' AS value,
                p.filename,
                p.file_path
            FROM albums a
            LEFT JOIN album_covers c ON c.album_id = a.id
            LEFT JOIN representative_paths p ON p.album_id = a.id
            WHERE c.album_id IS NULL
            "
            .to_string(),
        ),
        "missing-chart-albums" => Ok(
            "
            WITH missing_entries AS (
                SELECT
                    1 AS chart_order,
                    'billboard' AS chart,
                    'Billboard' AS chart_label,
                    b.id,
                    b.artist,
                    b.album AS title,
                    b.artist_key,
                    b.album_key AS title_key,
                    b.year,
                    b.rank,
                    b.source_file
                FROM billboard_chart_entries b
                WHERE b.matched_album_id IS NULL

                UNION ALL

                SELECT
                    2 AS chart_order,
                    'official_uk' AS chart,
                    'Official UK' AS chart_label,
                    uk.id,
                    uk.artist,
                    uk.title,
                    uk.artist_key,
                    uk.title_key,
                    uk.year,
                    uk.rank,
                    uk.source_file
                FROM official_uk_album_chart_entries uk
                WHERE uk.matched_album_id IS NULL

                UNION ALL

                SELECT
                    3 AS chart_order,
                    'vg_lista' AS chart,
                    'VG Lista' AS chart_label,
                    vg.id,
                    vg.artist,
                    vg.title,
                    vg.artist_key,
                    vg.title_key,
                    vg.year,
                    vg.rank,
                    vg.source_file
                FROM vg_lista_album_chart_entries vg
                WHERE vg.matched_album_id IS NULL
            ),
            ranked_missing AS (
                SELECT
                    missing_entries.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY chart, artist_key, title_key
                        ORDER BY year ASC, rank ASC, id ASC
                    ) AS duplicate_rank
                FROM missing_entries
            ),
            best_sources AS (
                SELECT *
                FROM ranked_missing
                WHERE duplicate_rank = 1
                ORDER BY chart_order
            ),
            missing_items AS (
                SELECT
                    artist_key,
                    title_key,
                    COALESCE(
                        MAX(CASE WHEN chart = 'billboard' THEN artist END),
                        MAX(CASE WHEN chart = 'official_uk' THEN artist END),
                        MAX(CASE WHEN chart = 'vg_lista' THEN artist END)
                    ) AS artist,
                    COALESCE(
                        MAX(CASE WHEN chart = 'billboard' THEN title END),
                        MAX(CASE WHEN chart = 'official_uk' THEN title END),
                        MAX(CASE WHEN chart = 'vg_lista' THEN title END)
                    ) AS title,
                    MIN(year) AS year,
                    GROUP_CONCAT(
                        chart_label || ' ' || printf('#%d / %d', rank, year),
                        ' · '
                    ) AS chart_summary,
                    GROUP_CONCAT(DISTINCT source_file) AS source_files,
                    MAX(CASE
                        WHEN chart = 'billboard' THEN printf('#%d / %d', rank, year)
                    END) AS billboard,
                    MAX(CASE
                        WHEN chart = 'official_uk' THEN printf('#%d / %d', rank, year)
                    END) AS official_uk,
                    MAX(CASE
                        WHEN chart = 'vg_lista' THEN printf('#%d / %d', rank, year)
                    END) AS vg_lista
                FROM best_sources
                GROUP BY artist_key, title_key
            )
            SELECT
                'missing-chart-albums:' || artist_key || char(31) || title_key AS id,
                'missing-chart-albums' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                'chart-album:' || artist_key || char(31) || title_key AS album_id,
                NULL AS track_id,
                title AS album,
                artist AS album_artist_display,
                NULL AS title,
                NULL AS canonical_genre,
                year,
                'Chart album missing from library' AS detail,
                chart_summary AS value,
                source_files AS filename,
                NULL AS file_path,
                billboard,
                official_uk,
                vg_lista,
                NULL AS ti_i_skuddet,
                NULL AS norsktoppen
            FROM missing_items
            "
            .to_string(),
        ),
        "missing-chart-singles" => Ok(
            "
            WITH missing_entries AS (
                SELECT
                    1 AS chart_order,
                    'billboard' AS chart,
                    'Billboard' AS chart_label,
                    b.id,
                    b.display_artist AS artist,
                    b.title,
                    b.artist_key,
                    b.title_key,
                    b.year,
                    b.rank,
                    b.source_file
                FROM billboard_single_chart_entries b
                WHERE b.matched_track_id IS NULL

                UNION ALL

                SELECT
                    2 AS chart_order,
                    'official_uk' AS chart,
                    'Official UK' AS chart_label,
                    uk.id,
                    uk.artist,
                    uk.title,
                    uk.artist_key,
                    uk.title_key,
                    uk.year,
                    uk.rank,
                    uk.source_file
                FROM official_uk_single_chart_entries uk
                WHERE uk.matched_track_id IS NULL

                UNION ALL

                SELECT
                    3 AS chart_order,
                    'vg_lista' AS chart,
                    'VG Lista' AS chart_label,
                    vg.id,
                    vg.artist,
                    vg.title,
                    vg.artist_key,
                    vg.title_key,
                    vg.year,
                    vg.rank,
                    vg.source_file
                FROM vg_lista_single_chart_entries vg
                WHERE vg.matched_track_id IS NULL

                UNION ALL

                SELECT
                    4 AS chart_order,
                    'ti_i_skuddet' AS chart,
                    'Ti i Skuddet' AS chart_label,
                    ti.id,
                    ti.artist,
                    ti.title,
                    ti.artist_key,
                    ti.title_key,
                    ti.year,
                    ti.rank,
                    ti.source_file
                FROM ti_i_skuddet_chart_entries ti
                WHERE ti.matched_track_id IS NULL

                UNION ALL

                SELECT
                    5 AS chart_order,
                    'norsktoppen' AS chart,
                    'Norsktoppen' AS chart_label,
                    no.id,
                    no.artist,
                    no.title,
                    no.artist_key,
                    no.title_key,
                    no.year,
                    no.rank,
                    no.source_file
                FROM norsktoppen_chart_entries no
                WHERE no.matched_track_id IS NULL
            ),
            ranked_missing AS (
                SELECT
                    missing_entries.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY chart, artist_key, title_key
                        ORDER BY rank ASC, year ASC, id ASC
                    ) AS duplicate_rank
                FROM missing_entries
            ),
            best_sources AS (
                SELECT *
                FROM ranked_missing
                WHERE duplicate_rank = 1
                ORDER BY chart_order
            ),
            missing_items AS (
                SELECT
                    artist_key,
                    title_key,
                    COALESCE(
                        MAX(CASE WHEN chart = 'billboard' THEN artist END),
                        MAX(CASE WHEN chart = 'official_uk' THEN artist END),
                        MAX(CASE WHEN chart = 'vg_lista' THEN artist END),
                        MAX(CASE WHEN chart = 'ti_i_skuddet' THEN artist END),
                        MAX(CASE WHEN chart = 'norsktoppen' THEN artist END)
                    ) AS artist,
                    COALESCE(
                        MAX(CASE WHEN chart = 'billboard' THEN title END),
                        MAX(CASE WHEN chart = 'official_uk' THEN title END),
                        MAX(CASE WHEN chart = 'vg_lista' THEN title END),
                        MAX(CASE WHEN chart = 'ti_i_skuddet' THEN title END),
                        MAX(CASE WHEN chart = 'norsktoppen' THEN title END)
                    ) AS title,
                    MIN(year) AS year,
                    GROUP_CONCAT(
                        chart_label || ' ' || printf('#%d / %d', rank, year),
                        ' · '
                    ) AS chart_summary,
                    GROUP_CONCAT(DISTINCT source_file) AS source_files,
                    MAX(CASE
                        WHEN chart = 'billboard' THEN printf('#%d / %d', rank, year)
                    END) AS billboard,
                    MAX(CASE
                        WHEN chart = 'official_uk' THEN printf('#%d / %d', rank, year)
                    END) AS official_uk,
                    MAX(CASE
                        WHEN chart = 'vg_lista' THEN printf('#%d / %d', rank, year)
                    END) AS vg_lista,
                    MAX(CASE
                        WHEN chart = 'ti_i_skuddet' THEN printf('#%d / %d', rank, year)
                    END) AS ti_i_skuddet,
                    MAX(CASE
                        WHEN chart = 'norsktoppen' THEN printf('#%d / %d', rank, year)
                    END) AS norsktoppen
                FROM best_sources
                GROUP BY artist_key, title_key
            )
            SELECT
                'missing-chart-singles:' || artist_key || char(31) || title_key AS id,
                'missing-chart-singles' AS tool_id,
                'low' AS severity,
                'tracks' AS entity_type,
                'chart-single:' || artist_key || char(31) || title_key AS album_id,
                NULL AS track_id,
                NULL AS album,
                artist AS album_artist_display,
                title,
                NULL AS canonical_genre,
                year,
                'Chart single missing from library' AS detail,
                chart_summary AS value,
                source_files AS filename,
                NULL AS file_path,
                billboard,
                official_uk,
                vg_lista,
                ti_i_skuddet,
                norsktoppen
            FROM missing_items
            "
            .to_string(),
        ),
        "artists-without-musicbrainz-data" => Ok(
            "
            WITH cache_matches AS (
                SELECT
                    l.artist_key,
                    c.name,
                    c.mbid,
                    c.release_group_count,
                    CASE
                        WHEN c.local_name_key = l.artist_key THEN 'cache-name'
                        ELSE 'normalized-cache-name'
                    END AS match_method,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.artist_key
                        ORDER BY
                            CASE WHEN c.local_name_key = l.artist_key THEN 0 ELSE 1 END,
                            c.release_group_count DESC,
                            LOWER(c.name) ASC
                    ) AS match_rank
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            best_cache_matches AS (
                SELECT artist_key, name, mbid, release_group_count, match_method
                FROM cache_matches
                WHERE match_rank = 1
            ),
            verified_links AS (
                SELECT
                    link.local_artist_key AS artist_key,
                    LOWER(link.mbid) AS mbid,
                    COALESCE(NULLIF(TRIM(link.canonical_name), ''), MIN(cache.name)) AS matched_name,
                    COALESCE(MAX(cache.release_group_count), 0) AS cache_release_group_count
                FROM musicbrainz_artist_links link
                LEFT JOIN temp.musicbrainz_tool_artist_cache cache
                  ON cache.mbid = LOWER(link.mbid)
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
                GROUP BY link.local_artist_key, link.mbid, link.canonical_name
            ),
            overlay_release_counts AS (
                SELECT LOWER(artist_mbid) AS mbid, COUNT(*) AS release_group_count
                FROM musicbrainz_artist_release_groups
                GROUP BY LOWER(artist_mbid)
            ),
            resolved_artists AS (
                SELECT
                    l.*,
                    COALESCE(verified.mbid, cache.mbid) AS mbid,
                    COALESCE(verified.matched_name, cache.name) AS matched_name,
                    COALESCE(verified.cache_release_group_count, cache.release_group_count, 0)
                        AS cache_release_group_count,
                    COALESCE(overlay.release_group_count, 0) AS overlay_release_group_count,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 'verified-link'
                        WHEN cache.mbid IS NOT NULL THEN cache.match_method
                        ELSE 'none'
                    END AS match_method
                FROM temp.musicbrainz_tool_local_artists l
                LEFT JOIN verified_links verified
                  ON verified.artist_key = l.artist_key
                LEFT JOIN best_cache_matches cache
                  ON cache.artist_key = l.artist_key
                 AND verified.mbid IS NULL
                LEFT JOIN overlay_release_counts overlay
                  ON overlay.mbid = COALESCE(verified.mbid, cache.mbid)
            )
            SELECT
                'artists-without-musicbrainz-data:' || r.artist_key AS id,
                'artists-without-musicbrainz-data' AS tool_id,
                'medium' AS severity,
                'artists' AS entity_type,
                r.artist_key AS album_id,
                NULL AS track_id,
                r.display_artist AS album,
                r.display_artist AS album_artist_display,
                r.sample_album AS title,
                r.top_genre AS canonical_genre,
                r.first_year AS year,
                CASE
                    WHEN r.mbid IS NULL THEN 'No MusicBrainz artist cache match'
                    ELSE 'No cached MusicBrainz release groups'
                END AS detail,
                CASE
                    WHEN r.mbid IS NULL THEN printf('%d albums / %d tracks', r.album_count, r.track_count)
                    ELSE printf(
                        'MBID %s / %s / %d albums / %d tracks',
                        r.mbid,
                        r.match_method,
                        r.album_count,
                        r.track_count
                    )
                END AS value,
                NULL AS filename,
                NULL AS file_path
            FROM resolved_artists r
            WHERE r.mbid IS NULL
               OR (r.cache_release_group_count + r.overlay_release_group_count) = 0
            "
            .to_string(),
        ),
        "high-confidence-missing-musicbrainz-albums" => Ok(format!(
            "
            WITH cache_matches AS (
                SELECT
                    l.artist_key,
                    c.name,
                    c.mbid,
                    c.cached_name_count,
                    c.release_group_count,
                    CASE
                        WHEN c.local_name_key = l.artist_key THEN 'cache-name'
                        ELSE 'normalized-cache-name'
                    END AS match_method,
                    COUNT(*) OVER (PARTITION BY l.artist_key) AS candidate_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.artist_key
                        ORDER BY
                            CASE WHEN c.local_name_key = l.artist_key THEN 0 ELSE 1 END,
                            c.cached_name_count ASC,
                            c.release_group_count DESC,
                            LOWER(c.name) ASC
                    ) AS match_rank
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            best_cache_matches AS (
                SELECT
                    artist_key, name, mbid, cached_name_count, release_group_count,
                    match_method, candidate_count
                FROM cache_matches
                WHERE match_rank = 1
            ),
            verified_links AS (
                SELECT
                    link.local_artist_key AS artist_key,
                    LOWER(link.mbid) AS mbid,
                    COALESCE(NULLIF(TRIM(link.canonical_name), ''), MIN(cache.name)) AS matched_name
                FROM musicbrainz_artist_links link
                LEFT JOIN temp.musicbrainz_tool_artist_cache cache
                  ON cache.mbid = LOWER(link.mbid)
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
                GROUP BY link.local_artist_key, link.mbid, link.canonical_name
            ),
            ignored_links AS (
                SELECT local_artist_key AS artist_key
                FROM musicbrainz_artist_links
                WHERE ignored <> 0
            ),
            trusted_artists AS (
                SELECT
                    l.artist_key,
                    l.display_artist,
                    COALESCE(verified.mbid, cache.mbid) AS mbid,
                    COALESCE(verified.matched_name, cache.name, l.display_artist) AS matched_name,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 'verified-link'
                        WHEN cache.mbid IS NOT NULL THEN cache.match_method
                        ELSE 'none'
                    END AS match_method,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 1
                        WHEN cache.mbid IS NOT NULL
                         AND cache.candidate_count = 1
                         AND cache.cached_name_count <= 1
                         AND cache.release_group_count < {threshold}
                            THEN 1
                        ELSE 0
                    END AS high_confidence
                FROM temp.musicbrainz_tool_local_artists l
                LEFT JOIN verified_links verified
                  ON verified.artist_key = l.artist_key
                LEFT JOIN best_cache_matches cache
                  ON cache.artist_key = l.artist_key
                 AND verified.mbid IS NULL
                LEFT JOIN ignored_links ignored
                  ON ignored.artist_key = l.artist_key
                WHERE ignored.artist_key IS NULL
            ),
            overlay_counts AS (
                SELECT artist_mbid AS mbid, COUNT(*) AS release_group_count
                FROM temp.musicbrainz_tool_release_groups
                WHERE source = 'refreshed'
                  AND primary_type = 'Album'
                  AND secondary_types_key = ''
                GROUP BY artist_mbid
            ),
            artist_releases AS (
                SELECT
                    artist.artist_key,
                    artist.display_artist,
                    artist.mbid,
                    artist.matched_name,
                    artist.match_method,
                    releases.release_mbid,
                    releases.title,
                    releases.title_key,
                    releases.year,
                    releases.track_count,
                    releases.source
                FROM trusted_artists artist
                JOIN temp.musicbrainz_tool_release_groups releases
                  ON releases.artist_mbid = artist.mbid
                LEFT JOIN overlay_counts overlay
                  ON overlay.mbid = artist.mbid
                WHERE artist.high_confidence = 1
                  AND artist.mbid IS NOT NULL
                  AND releases.title_key <> ''
                  AND releases.primary_type = 'Album'
                  AND releases.secondary_types_key = ''
                  AND (
                        releases.source = 'refreshed'
                     OR COALESCE(overlay.release_group_count, 0) = 0
                  )
            )
            SELECT
                'high-confidence-missing-musicbrainz-albums:' || ar.artist_key || char(31) || ar.release_mbid AS id,
                'high-confidence-missing-musicbrainz-albums' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                'musicbrainz:' || ar.artist_key || char(31) || ar.release_mbid AS album_id,
                NULL AS track_id,
                ar.title AS album,
                ar.display_artist AS album_artist_display,
                NULL AS title,
                NULL AS canonical_genre,
                ar.year,
                'High-confidence MusicBrainz album missing from library' AS detail,
                printf(
                    'MBID %s / %s / %s / matched %s',
                    ar.mbid,
                    ar.match_method,
                    ar.source,
                    ar.matched_name
                ) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM artist_releases ar
            LEFT JOIN temp.musicbrainz_tool_local_albums owned
              ON owned.artist_key = ar.artist_key
             AND owned.title_key = ar.title_key
            LEFT JOIN musicbrainz_release_decisions decisions
              ON decisions.local_artist_key = ar.artist_key
             AND decisions.release_mbid = ar.release_mbid
            LEFT JOIN temp.musicbrainz_tool_release_statuses status
              ON status.artist_mbid = ar.mbid
             AND status.release_mbid = ar.release_mbid
            WHERE owned.album_id IS NULL
              AND COALESCE(decisions.decision, '') NOT IN ('not-in-scope', 'ignored')
              AND (
                    COALESCE(decisions.decision, '') = 'include'
                 OR COALESCE(status.has_official_release, 1) <> 0
              )
            ",
            threshold = MUSICBRAINZ_SUSPICIOUS_RELEASE_GROUP_THRESHOLD,
        )),
        "albums-not-on-musicbrainz-official-list" => Ok(format!(
            "
            WITH cache_matches AS (
                SELECT
                    l.artist_key,
                    c.name,
                    c.mbid,
                    c.cached_name_count,
                    c.release_group_count,
                    CASE
                        WHEN c.local_name_key = l.artist_key THEN 'cache-name'
                        ELSE 'normalized-cache-name'
                    END AS match_method,
                    COUNT(*) OVER (PARTITION BY l.artist_key) AS candidate_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.artist_key
                        ORDER BY
                            CASE WHEN c.local_name_key = l.artist_key THEN 0 ELSE 1 END,
                            c.cached_name_count ASC,
                            c.release_group_count DESC,
                            LOWER(c.name) ASC
                    ) AS match_rank
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            best_cache_matches AS (
                SELECT
                    artist_key, name, mbid, cached_name_count, release_group_count,
                    match_method, candidate_count
                FROM cache_matches
                WHERE match_rank = 1
            ),
            verified_links AS (
                SELECT
                    link.local_artist_key AS artist_key,
                    LOWER(link.mbid) AS mbid,
                    COALESCE(NULLIF(TRIM(link.canonical_name), ''), MIN(cache.name)) AS matched_name
                FROM musicbrainz_artist_links link
                LEFT JOIN temp.musicbrainz_tool_artist_cache cache
                  ON cache.mbid = LOWER(link.mbid)
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
                GROUP BY link.local_artist_key, link.mbid, link.canonical_name
            ),
            ignored_links AS (
                SELECT local_artist_key AS artist_key
                FROM musicbrainz_artist_links
                WHERE ignored <> 0
            ),
            trusted_artists AS (
                SELECT
                    l.artist_key,
                    l.display_artist,
                    COALESCE(verified.mbid, cache.mbid) AS mbid,
                    COALESCE(verified.matched_name, cache.name, l.display_artist) AS matched_name,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 'verified-link'
                        WHEN cache.mbid IS NOT NULL THEN cache.match_method
                        ELSE 'none'
                    END AS match_method,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 1
                        WHEN cache.mbid IS NOT NULL
                         AND cache.candidate_count = 1
                         AND cache.cached_name_count <= 1
                         AND cache.release_group_count < {threshold}
                            THEN 1
                        ELSE 0
                    END AS high_confidence
                FROM temp.musicbrainz_tool_local_artists l
                LEFT JOIN verified_links verified
                  ON verified.artist_key = l.artist_key
                LEFT JOIN best_cache_matches cache
                  ON cache.artist_key = l.artist_key
                 AND verified.mbid IS NULL
                LEFT JOIN ignored_links ignored
                  ON ignored.artist_key = l.artist_key
                WHERE ignored.artist_key IS NULL
            ),
            overlay_counts AS (
                SELECT artist_mbid AS mbid, COUNT(*) AS release_group_count
                FROM temp.musicbrainz_tool_release_groups
                WHERE source = 'refreshed'
                  AND primary_type = 'Album'
                  AND secondary_types_key = ''
                GROUP BY artist_mbid
            ),
            available_releases AS (
                SELECT
                    artist.artist_key,
                    artist.display_artist,
                    artist.mbid,
                    artist.matched_name,
                    artist.match_method,
                    releases.release_mbid,
                    releases.title_key,
                    releases.source
                FROM trusted_artists artist
                JOIN temp.musicbrainz_tool_release_groups releases
                  ON releases.artist_mbid = artist.mbid
                LEFT JOIN overlay_counts overlay
                  ON overlay.mbid = artist.mbid
                LEFT JOIN musicbrainz_release_decisions decisions
                  ON decisions.local_artist_key = artist.artist_key
                 AND decisions.release_mbid = releases.release_mbid
                LEFT JOIN temp.musicbrainz_tool_release_statuses status
                  ON status.artist_mbid = artist.mbid
                 AND status.release_mbid = releases.release_mbid
                WHERE artist.high_confidence = 1
                  AND artist.mbid IS NOT NULL
                  AND releases.title_key <> ''
                  AND releases.primary_type = 'Album'
                  AND releases.secondary_types_key = ''
                  AND (
                        releases.source = 'refreshed'
                     OR COALESCE(overlay.release_group_count, 0) = 0
                  )
                  AND COALESCE(decisions.decision, '') NOT IN ('not-in-scope', 'ignored')
                  AND (
                        COALESCE(decisions.decision, '') = 'include'
                     OR COALESCE(status.has_official_release, 1) <> 0
                  )
            ),
            comparable_artists AS (
                SELECT
                    artist_key,
                    display_artist,
                    mbid,
                    matched_name,
                    match_method,
                    MIN(source) AS release_source
                FROM available_releases
                GROUP BY artist_key, display_artist, mbid, matched_name, match_method
            ),
            official_titles AS (
                SELECT DISTINCT artist_key, title_key
                FROM available_releases
            ),
            representative_paths AS (
                SELECT
                    album_id,
                    MIN(NULLIF(TRIM(filename), '')) AS filename,
                    MIN(NULLIF(TRIM(file_path), '')) AS file_path
                FROM tracks
                GROUP BY album_id
            )
            SELECT
                'albums-not-on-musicbrainz-official-list:' || local.album_id AS id,
                'albums-not-on-musicbrainz-official-list' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                local.album_id,
                NULL AS track_id,
                local.title AS album,
                artist.display_artist AS album_artist_display,
                NULL AS title,
                albums.canonical_genre,
                local.year,
                'Local album not found on MusicBrainz pure official album list' AS detail,
                printf(
                    'MBID %s / %s / %s / matched %s',
                    artist.mbid,
                    artist.match_method,
                    artist.release_source,
                    artist.matched_name
                ) AS value,
                paths.filename,
                paths.file_path
            FROM temp.musicbrainz_tool_local_albums local
            JOIN comparable_artists artist
              ON artist.artist_key = local.artist_key
            JOIN albums
              ON albums.id = local.album_id
            LEFT JOIN official_titles official
              ON official.artist_key = local.artist_key
             AND official.title_key = local.title_key
            LEFT JOIN representative_paths paths
              ON paths.album_id = local.album_id
            WHERE official.title_key IS NULL
            ",
            threshold = MUSICBRAINZ_SUSPICIOUS_RELEASE_GROUP_THRESHOLD,
        )),
        "owned-musicbrainz-special-releases" => Ok(format!(
            "
            WITH cache_matches AS (
                SELECT
                    l.artist_key,
                    c.name,
                    c.mbid,
                    c.cached_name_count,
                    c.release_group_count,
                    CASE
                        WHEN c.local_name_key = l.artist_key THEN 'cache-name'
                        ELSE 'normalized-cache-name'
                    END AS match_method,
                    COUNT(*) OVER (PARTITION BY l.artist_key) AS candidate_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY l.artist_key
                        ORDER BY
                            CASE WHEN c.local_name_key = l.artist_key THEN 0 ELSE 1 END,
                            c.cached_name_count ASC,
                            c.release_group_count DESC,
                            LOWER(c.name) ASC
                    ) AS match_rank
                FROM temp.musicbrainz_tool_local_artists l
                JOIN temp.musicbrainz_tool_artist_cache c
                  ON c.local_name_key = l.artist_key
                  OR (
                        l.musicbrainz_name_key <> ''
                    AND c.musicbrainz_name_key = l.musicbrainz_name_key
                  )
            ),
            best_cache_matches AS (
                SELECT
                    artist_key, name, mbid, cached_name_count, release_group_count,
                    match_method, candidate_count
                FROM cache_matches
                WHERE match_rank = 1
            ),
            verified_links AS (
                SELECT
                    link.local_artist_key AS artist_key,
                    LOWER(link.mbid) AS mbid,
                    COALESCE(NULLIF(TRIM(link.canonical_name), ''), MIN(cache.name)) AS matched_name
                FROM musicbrainz_artist_links link
                LEFT JOIN temp.musicbrainz_tool_artist_cache cache
                  ON cache.mbid = LOWER(link.mbid)
                WHERE link.verification_state = 'verified'
                  AND link.ignored = 0
                  AND link.mbid IS NOT NULL
                  AND TRIM(link.mbid) <> ''
                GROUP BY link.local_artist_key, link.mbid, link.canonical_name
            ),
            ignored_links AS (
                SELECT local_artist_key AS artist_key
                FROM musicbrainz_artist_links
                WHERE ignored <> 0
            ),
            trusted_artists AS (
                SELECT
                    l.artist_key,
                    l.display_artist,
                    COALESCE(verified.mbid, cache.mbid) AS mbid,
                    CASE
                        WHEN verified.mbid IS NOT NULL THEN 1
                        WHEN cache.mbid IS NOT NULL
                         AND cache.candidate_count = 1
                         AND cache.cached_name_count <= 1
                         AND cache.release_group_count < {threshold}
                            THEN 1
                        ELSE 0
                    END AS high_confidence
                FROM temp.musicbrainz_tool_local_artists l
                LEFT JOIN verified_links verified
                  ON verified.artist_key = l.artist_key
                LEFT JOIN best_cache_matches cache
                  ON cache.artist_key = l.artist_key
                 AND verified.mbid IS NULL
                LEFT JOIN ignored_links ignored
                  ON ignored.artist_key = l.artist_key
                WHERE ignored.artist_key IS NULL
            ),
            refreshed_type_counts AS (
                SELECT artist_mbid AS mbid, primary_type, COUNT(*) AS release_group_count
                FROM temp.musicbrainz_tool_release_groups
                WHERE source = 'refreshed'
                GROUP BY artist_mbid, primary_type
            ),
            available_releases AS (
                SELECT
                    artist.artist_key,
                    releases.title_key,
                    releases.primary_type,
                    releases.secondary_types_key,
                    releases.release_type
                FROM trusted_artists artist
                JOIN temp.musicbrainz_tool_release_groups releases
                  ON releases.artist_mbid = artist.mbid
                LEFT JOIN refreshed_type_counts refreshed
                  ON refreshed.mbid = artist.mbid
                 AND refreshed.primary_type = releases.primary_type
                LEFT JOIN musicbrainz_release_decisions decisions
                  ON decisions.local_artist_key = artist.artist_key
                 AND decisions.release_mbid = releases.release_mbid
                LEFT JOIN temp.musicbrainz_tool_release_statuses status
                  ON status.artist_mbid = artist.mbid
                 AND status.release_mbid = releases.release_mbid
                WHERE artist.high_confidence = 1
                  AND artist.mbid IS NOT NULL
                  AND releases.title_key <> ''
                  AND (
                        releases.source = 'refreshed'
                     OR COALESCE(refreshed.release_group_count, 0) = 0
                  )
                  AND COALESCE(decisions.decision, '') NOT IN ('not-in-scope', 'ignored')
                  AND (
                        COALESCE(decisions.decision, '') = 'include'
                     OR COALESCE(status.has_official_release, 1) <> 0
                  )
            ),
            pure_titles AS (
                SELECT DISTINCT artist_key, title_key
                FROM available_releases
                WHERE primary_type = 'Album'
                  AND secondary_types_key = ''
            ),
            ordered_special_types AS (
                SELECT DISTINCT artist_key, title_key, release_type
                FROM available_releases
                WHERE NOT (primary_type = 'Album' AND secondary_types_key = '')
                ORDER BY artist_key, title_key, release_type
            ),
            special_titles AS (
                SELECT
                    artist_key,
                    title_key,
                    GROUP_CONCAT(release_type, ' / ') AS release_types
                FROM ordered_special_types
                GROUP BY artist_key, title_key
            ),
            representative_paths AS (
                SELECT
                    album_id,
                    MIN(NULLIF(TRIM(filename), '')) AS filename,
                    MIN(NULLIF(TRIM(file_path), '')) AS file_path
                FROM tracks
                GROUP BY album_id
            )
            SELECT
                'owned-musicbrainz-special-releases:' || local.album_id AS id,
                'owned-musicbrainz-special-releases' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                local.album_id,
                NULL AS track_id,
                local.title AS album,
                artist.display_artist AS album_artist_display,
                NULL AS title,
                albums.canonical_genre,
                local.year,
                'Owned MusicBrainz special release' AS detail,
                special.release_types AS value,
                paths.filename,
                paths.file_path
            FROM temp.musicbrainz_tool_local_albums local
            JOIN trusted_artists artist
              ON artist.artist_key = local.artist_key
             AND artist.high_confidence = 1
            JOIN special_titles special
              ON special.artist_key = local.artist_key
             AND special.title_key = local.title_key
            JOIN albums
              ON albums.id = local.album_id
            LEFT JOIN pure_titles pure
              ON pure.artist_key = local.artist_key
             AND pure.title_key = local.title_key
            LEFT JOIN representative_paths paths
              ON paths.album_id = local.album_id
            WHERE pure.title_key IS NULL
            ",
            threshold = MUSICBRAINZ_SUSPICIOUS_RELEASE_GROUP_THRESHOLD,
        )),
        "duplicates-within-album" => Ok(
            "
            WITH duplicate_titles AS (
                SELECT
                    album_id,
                    LOWER(TRIM(title)) AS title_key,
                    COUNT(*) AS match_count
                FROM tracks
                WHERE NULLIF(TRIM(COALESCE(title, '')), '') IS NOT NULL
                GROUP BY album_id, title_key
                HAVING COUNT(*) > 1
            ),
            duplicate_positions AS (
                SELECT
                    album_id,
                    disc_number AS disc_key,
                    track_number AS track_key,
                    COUNT(*) AS match_count
                FROM tracks
                WHERE disc_number IS NOT NULL
                  AND track_number IS NOT NULL
                GROUP BY album_id, disc_key, track_key
                HAVING COUNT(*) > 1
            )
            SELECT DISTINCT
                'duplicates-within-album:' || t.id AS id,
                'duplicates-within-album' AS tool_id,
                'high' AS severity,
                'tracks' AS entity_type,
                t.album_id,
                t.id AS track_id,
                t.album,
                t.album_artist_display,
                t.title,
                t.canonical_genre,
                t.year,
                CASE
                    WHEN dt.title_key IS NOT NULL AND dp.album_id IS NOT NULL THEN 'Duplicate title and track position'
                    WHEN dt.title_key IS NOT NULL THEN 'Duplicate title inside album'
                    ELSE 'Duplicate disc/track position'
                END AS detail,
                CASE
                    WHEN dp.album_id IS NOT NULL THEN printf('Disc %s track %s', COALESCE(CAST(t.disc_number AS TEXT), '?'), COALESCE(CAST(t.track_number AS TEXT), '?'))
                    ELSE t.title
                END AS value,
                t.filename,
                t.file_path
            FROM tracks t
            LEFT JOIN duplicate_titles dt
              ON dt.album_id = t.album_id
             AND dt.title_key = LOWER(TRIM(t.title))
            LEFT JOIN duplicate_positions dp
              ON dp.album_id = t.album_id
             AND dp.disc_key = t.disc_number
             AND dp.track_key = t.track_number
            WHERE dt.title_key IS NOT NULL
               OR dp.album_id IS NOT NULL
            "
            .to_string(),
        ),
        "invalid-time-values" => Ok(track_issue_sql(
            "invalid-time-values",
            "high",
            "Missing or invalid track time",
            "NULL",
            "t.time_seconds IS NULL",
        )),
        "non-numeric-ratings" => {
            let numeric = numeric_rating_condition("t.rating_raw");
            Ok(track_issue_sql(
                "non-numeric-ratings",
                "medium",
                "Track rating is not numeric",
                "t.rating_raw",
                &format!(
                    "NULLIF(TRIM(COALESCE(t.rating_raw, '')), '') IS NOT NULL AND NOT {numeric}"
                ),
            ))
        }
        "missing-tags" => Ok(track_issue_sql(
            "missing-tags",
            "high",
            "Missing required tag",
            "
            TRIM(
                CASE WHEN NULLIF(TRIM(COALESCE(t.album, '')), '') IS NULL THEN 'Album ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.album_artist_display, '')), '') IS NULL THEN 'Album artist ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.display_artist, '')), '') IS NULL THEN 'Display artist ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.title, '')), '') IS NULL THEN 'Title ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.canonical_genre, '')), '') IS NULL THEN 'Genre ' ELSE '' END ||
                CASE WHEN t.year IS NULL THEN 'Year ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.file_path, '')), '') IS NULL THEN 'File path ' ELSE '' END ||
                CASE WHEN NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NULL THEN 'Filename ' ELSE '' END
            )
            ",
            "
            NULLIF(TRIM(COALESCE(t.album, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.album_artist_display, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.display_artist, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.title, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.canonical_genre, '')), '') IS NULL OR
            t.year IS NULL OR
            NULLIF(TRIM(COALESCE(t.file_path, '')), '') IS NULL OR
            NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NULL
            ",
        )),
        "non-mp3-files" => Ok(track_issue_sql(
            "non-mp3-files",
            "low",
            "Filename is not MP3",
            "t.filename",
            "NULLIF(TRIM(COALESCE(t.filename, '')), '') IS NOT NULL AND LOWER(t.filename) NOT LIKE '%.mp3'",
        )),
        "audio-below-320-kbps" => Ok(
            "
            SELECT
                'audio-below-320-kbps:' || t.id AS id,
                'audio-below-320-kbps' AS tool_id,
                'medium' AS severity,
                'tracks' AS entity_type,
                t.album_id,
                t.id AS track_id,
                t.album,
                t.album_artist_display,
                t.title,
                t.canonical_genre,
                t.year,
                'Measured bitrate is below 320 kbps' AS detail,
                printf('%d kbps / %s / %.1f MB', q.bitrate_kbps, q.format, q.size_bytes / 1048576.0) AS value,
                t.filename,
                t.file_path
            FROM music_doctor_track_quality q
            JOIN tracks t
              ON t.file_path = q.file_path
             AND t.filename = q.filename
            WHERE q.file_type = 'Audio'
              AND q.bitrate_kbps IS NOT NULL
              AND q.bitrate_kbps < 320
            "
            .to_string(),
        ),
        "mixed-audio-quality" => Ok(
            "
            SELECT
                'mixed-audio-quality:' || a.id AS id,
                'mixed-audio-quality' AS tool_id,
                'low' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Album contains mixed measured bitrates' AS detail,
                printf('%d–%d kbps / %d below 320 / %s', q.min_bitrate_kbps, q.max_bitrate_kbps, q.below_320_tracks, q.formats) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM music_doctor_album_quality q
            JOIN albums a ON a.id = q.album_id
            WHERE q.mixed_quality = 1
            "
            .to_string(),
        ),
        "music-doctor-unimported-audio" => Ok(
            "
            SELECT
                'music-doctor-unimported-audio:' || file_key AS id,
                'music-doctor-unimported-audio' AS tool_id,
                'low' AS severity,
                'tracks' AS entity_type,
                'music-doctor:' || LOWER(source_path || '\\' || album_folder) AS album_id,
                NULL AS track_id,
                COALESCE(NULLIF(album, ''), NULLIF(album_folder, ''), '[Unknown album]') AS album,
                artist AS album_artist_display,
                file_name AS title,
                NULL AS canonical_genre,
                album_year AS year,
                'Music Doctor audio file is not in the imported library' AS detail,
                printf('%s / %s kbps / %.1f MB', format, COALESCE(CAST(bitrate_kbps AS TEXT), '?'), size_bytes / 1048576.0) AS value,
                file_name AS filename,
                source_path || '\\' || relative_path AS file_path
            FROM music_doctor_unmatched_files
            "
            .to_string(),
        ),
        "music-doctor-file-problems" => Ok(
            "
            SELECT
                'music-doctor-file-problems:' || file_key AS id,
                'music-doctor-file-problems' AS tool_id,
                'high' AS severity,
                'tracks' AS entity_type,
                'music-doctor:' || LOWER(source_path || '\\' || album_folder) AS album_id,
                NULL AS track_id,
                COALESCE(NULLIF(album, ''), NULLIF(album_folder, ''), '[Unknown album]') AS album,
                artist AS album_artist_display,
                file_name AS title,
                NULL AS canonical_genre,
                album_year AS year,
                CASE issue_kind
                    WHEN 'empty-file' THEN 'Music Doctor reported an empty file'
                    WHEN 'missing' THEN 'Music Doctor reported a missing file'
                    ELSE 'Music Doctor could not inspect the file'
                END AS detail,
                COALESCE(NULLIF(scan_error, ''), printf('%s / %d bytes', issue_kind, size_bytes)) AS value,
                file_name AS filename,
                source_path || '\\' || relative_path AS file_path
            FROM music_doctor_file_issues
            "
            .to_string(),
        ),
        "year-anomalies" => {
            let max_year = Utc::now().year() + 1;
            Ok(track_issue_sql(
                "year-anomalies",
                "medium",
                "Missing or implausible year",
                "printf('Year %s / release %s', COALESCE(CAST(t.year AS TEXT), 'missing'), COALESCE(CAST(t.release_year AS TEXT), 'missing'))",
                &format!(
                    "t.year IS NULL OR t.year < 1900 OR t.year > {max_year} OR t.release_year < 1900 OR t.release_year > {max_year}"
                ),
            ))
        }
        "ratings-out-of-range" => {
            let numeric = numeric_rating_condition("t.rating_raw");
            Ok(track_issue_sql(
                "ratings-out-of-range",
                "high",
                "Rating is outside accepted whole-number 0-5 values",
                "t.rating_raw",
                &format!(
                    "NULLIF(TRIM(COALESCE(t.rating_raw, '')), '') IS NOT NULL AND {numeric} AND t.normalized_rating IS NULL"
                ),
            ))
        }
        "track-disc-number-issues" => Ok(track_issue_sql(
            "track-disc-number-issues",
            "medium",
            "Missing or invalid disc/track number",
            "
            TRIM(
                CASE WHEN t.disc_number IS NULL THEN 'Missing disc ' WHEN t.disc_number <= 0 THEN 'Disc <= 0 ' ELSE '' END ||
                CASE WHEN t.track_number IS NULL THEN 'Missing track ' WHEN t.track_number <= 0 THEN 'Track <= 0 ' ELSE '' END
            )
            ",
            "t.disc_number IS NULL OR t.disc_number <= 0 OR t.track_number IS NULL OR t.track_number <= 0",
        )),
        "inconsistent-album-metadata" => Ok(
            "
            WITH inconsistent AS (
                SELECT
                    album_id,
                    COUNT(DISTINCT NULLIF(TRIM(LOWER(album)), '')) AS album_names,
                    COUNT(DISTINCT NULLIF(TRIM(LOWER(canonical_genre)), '')) AS genres,
                    COUNT(DISTINCT NULLIF(TRIM(LOWER(publisher)), '')) AS publishers
                FROM tracks
                GROUP BY album_id
                HAVING COUNT(DISTINCT NULLIF(TRIM(LOWER(album)), '')) > 1
                    OR COUNT(DISTINCT NULLIF(TRIM(LOWER(canonical_genre)), '')) > 1
                    OR COUNT(DISTINCT NULLIF(TRIM(LOWER(publisher)), '')) > 1
            )
            SELECT
                'inconsistent-album-metadata:' || a.id AS id,
                'inconsistent-album-metadata' AS tool_id,
                'medium' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Tracks disagree on album metadata' AS detail,
                printf('%d titles / %d genres / %d publishers', i.album_names, i.genres, i.publishers) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM inconsistent i
            JOIN albums a ON a.id = i.album_id
            "
            .to_string(),
        ),
        "whitespace-anomalies" => Ok(track_issue_sql(
            "whitespace-anomalies",
            "low",
            "Repeated internal whitespace",
            "'Repeated spaces'",
            WHITESPACE_ANOMALY_CONDITION_SQL,
        )),
        "genre-normalization-issues" => Ok(track_issue_sql(
            "genre-normalization-issues",
            "low",
            "Multiple genre values collapsed to canonical genre",
            "t.genre",
            "COALESCE(t.genre, '') LIKE '%;%' OR COALESCE(t.genre, '') LIKE '%|%'",
        )),
        "conflicting-album-artists" => {
            let album_artist_key_sql = format!(
                "NULLIF(TRIM(LOWER({})), '')",
                normalized_artist_sql("album_artist_display")
            );
            Ok(format!(
                "
            WITH conflicting AS (
                SELECT
                    album_id,
                    COUNT(DISTINCT {album_artist_key_sql}) AS artist_count
                FROM tracks
                GROUP BY album_id
                HAVING COUNT(DISTINCT {album_artist_key_sql}) > 1
            )
            SELECT
                'conflicting-album-artists:' || a.id AS id,
                'conflicting-album-artists' AS tool_id,
                'high' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Tracks disagree on album artist' AS detail,
                printf('%d album artists', c.artist_count) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM conflicting c
            JOIN albums a ON a.id = c.album_id
            "
            ))
        },
        "multiple-years-per-album" => Ok(
            "
            WITH multiple_years AS (
                SELECT
                    album_id,
                    COUNT(DISTINCT year) AS year_count
                FROM tracks
                WHERE year IS NOT NULL
                GROUP BY album_id
                HAVING COUNT(DISTINCT year) > 1
            )
            SELECT
                'multiple-years-per-album:' || a.id AS id,
                'multiple-years-per-album' AS tool_id,
                'medium' AS severity,
                'albums' AS entity_type,
                a.id AS album_id,
                NULL AS track_id,
                a.album,
                a.album_artist_display,
                NULL AS title,
                a.canonical_genre,
                a.year,
                'Album contains multiple track years' AS detail,
                printf('%d years on tracks', y.year_count) AS value,
                NULL AS filename,
                NULL AS file_path
            FROM multiple_years y
            JOIN albums a ON a.id = y.album_id
            "
            .to_string(),
        ),
        _ => bail!("Unknown music tool: {tool_id}"),
    }
}

pub(super) fn track_issue_sql(
    tool_id: &str,
    severity: &str,
    detail: &str,
    value_sql: &str,
    condition_sql: &str,
) -> String {
    format!(
        "
        SELECT
            '{tool_id}:' || t.id AS id,
            '{tool_id}' AS tool_id,
            '{severity}' AS severity,
            'tracks' AS entity_type,
            t.album_id,
            t.id AS track_id,
            t.album,
            t.album_artist_display,
            t.title,
            t.canonical_genre,
            t.year,
            '{detail}' AS detail,
            {value_sql} AS value,
            t.filename,
            t.file_path
        FROM tracks t
        WHERE {condition_sql}
        "
    )
}

pub(super) fn numeric_rating_condition(field: &str) -> String {
    let trimmed = format!("TRIM(COALESCE({field}, ''))");
    let dot_count = format!("(LENGTH({trimmed}) - LENGTH(REPLACE({trimmed}, '.', '')))");
    let minus_count = format!("(LENGTH({trimmed}) - LENGTH(REPLACE({trimmed}, '-', '')))");

    format!(
        "({trimmed} <> '' AND {trimmed} NOT GLOB '*[^0-9.-]*' AND {dot_count} <= 1 AND {minus_count} <= 1 AND (INSTR({trimmed}, '-') = 0 OR INSTR({trimmed}, '-') = 1) AND {trimmed} NOT IN ('.', '-', '-.'))"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn missing_chart_tools_merge_sources_and_export_chart_columns() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key, imported_at
            ) VALUES (
                'billboard-albums.csv', 1987, 5, 'Missing Artist', 'Missing Album',
                'missing artist', 'missing album', 'now'
            );
            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, imported_at
            ) VALUES (
                'uk-albums.csv', 1988, 4, '1988-01-29', 2, 'Missing Artist', 'Missing Album',
                'missing artist', 'missing album', '1988-04', 'now'
            );
            INSERT INTO vg_lista_album_chart_entries (
                source_file, year, week, rank, artist, title, artist_key, title_key,
                week_date, week_key, imported_at
            ) VALUES (
                'vg-albums.csv', 1989, 6, 1, 'Missing Artist', 'Missing Album',
                'missing artist', 'missing album', '1989-02-10', '1989-06', 'now'
            );

            INSERT INTO billboard_single_chart_entries (
                source_file, year, rank, artist, display_artist, title,
                artist_key, title_key, imported_at
            ) VALUES (
                'billboard-singles.csv', 1990, 8, 'Missing Artist', 'Missing Artist',
                'Missing Single', 'missing artist', 'missing single', 'now'
            );
            INSERT INTO official_uk_single_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, imported_at
            ) VALUES (
                'uk-singles.csv', 1991, 7, '1991-02-15', 4, 'Missing Artist',
                'Missing Single', 'missing artist', 'missing single', '1991-07', 'now'
            );
            INSERT INTO vg_lista_single_chart_entries (
                source_file, year, week, rank, artist, title, artist_key, title_key,
                week_date, week_key, imported_at
            ) VALUES (
                'vg-singles.csv', 1992, 8, 3, 'Missing Artist', 'Missing Single',
                'missing artist', 'missing single', '1992-02-21', '1992-08', 'now'
            );
            INSERT INTO ti_i_skuddet_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw, artist, title,
                artist_key, title_key, imported_at
            ) VALUES (
                'ti-i-skuddet.csv', 1993, 9, '1993-03-01', 2, '2', 'Missing Artist',
                'Missing Single', 'missing artist', 'missing single', 'now'
            );
            INSERT INTO norsktoppen_chart_entries (
                source_file, year, week, chart_date, rank, rank_raw, artist, title,
                artist_key, title_key, imported_at
            ) VALUES (
                'norsktoppen.csv', 1994, 10, '1994-03-07', 1, '1', 'Missing Artist',
                'Missing Single', 'missing artist', 'missing single', 'now'
            );
            ",
        )
        .expect("insert unmatched chart rows");

        let mut album_request = MusicToolIssueRequest::default();
        album_request.tool_id = "missing-chart-albums".to_string();
        let album_response = list_music_tool_issues(&conn, album_request, 50, None)
            .expect("list missing chart albums");
        assert_eq!(album_response.total, 1);
        assert_eq!(album_response.tool.album_count, 1);
        assert_eq!(album_response.rows[0].year, Some(1987));
        assert_eq!(
            album_response.rows[0].billboard.as_deref(),
            Some("#5 / 1987")
        );
        assert_eq!(
            album_response.rows[0].official_uk.as_deref(),
            Some("#2 / 1988")
        );
        assert_eq!(
            album_response.rows[0].vg_lista.as_deref(),
            Some("#1 / 1989")
        );
        let album_summary = album_response.rows[0]
            .value
            .as_deref()
            .expect("album chart summary");
        assert!(album_summary.contains("Billboard #5 / 1987"));
        assert!(album_summary.contains("Official UK #2 / 1988"));
        assert!(album_summary.contains("VG Lista #1 / 1989"));

        let mut single_request = MusicToolIssueRequest::default();
        single_request.tool_id = "missing-chart-singles".to_string();
        let single_response = list_music_tool_issues(&conn, single_request, 50, None)
            .expect("list missing chart singles");
        assert_eq!(single_response.total, 1);
        assert_eq!(single_response.tool.track_count, 1);
        let single = &single_response.rows[0];
        assert_eq!(single.billboard.as_deref(), Some("#8 / 1990"));
        assert_eq!(single.official_uk.as_deref(), Some("#4 / 1991"));
        assert_eq!(single.vg_lista.as_deref(), Some("#3 / 1992"));
        assert_eq!(single.ti_i_skuddet.as_deref(), Some("#2 / 1993"));
        assert_eq!(single.norsktoppen.as_deref(), Some("#1 / 1994"));

        let (headers, values) = issue_export_table("missing-chart-singles", &single_response.rows);
        for header in [
            "Billboard",
            "Official UK",
            "VG Lista",
            "Ti i Skuddet",
            "Norsktoppen",
        ] {
            assert!(headers.contains(&header), "missing export header {header}");
        }
        let norsktoppen_column = headers
            .iter()
            .position(|header| *header == "Norsktoppen")
            .expect("Norsktoppen export column");
        assert_eq!(values[0][norsktoppen_column], "#1 / 1994");
    }

    #[test]
    fn musicbrainz_official_list_query_keeps_mbid_joins_indexable() {
        let sql = music_tool_issue_sql("albums-not-on-musicbrainz-official-list")
            .expect("build MusicBrainz official-list query");

        assert!(sql.contains("ON releases.artist_mbid = artist.mbid"));
        assert!(sql.contains("temp.musicbrainz_tool_release_statuses status"));
        assert!(!sql.contains("LOWER(releases.artist_mbid)"));
        assert!(!sql.contains("LOWER(status.artist_mbid)"));
    }

    #[test]
    fn lists_music_tool_issues_and_export_rows() {
        let conn = seeded_connection();
        conn.execute(
            "UPDATE tracks SET filename = '02 What Have I Done.flac' WHERE id = 1",
            [],
        )
        .expect("make non-mp3 issue");

        let tools = list_music_tools(&conn).expect("list music tools");
        let non_mp3 = tools
            .iter()
            .find(|tool| tool.id == "non-mp3-files")
            .expect("non-mp3 tool");

        assert_eq!(non_mp3.issue_count, -1);

        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "non-mp3-files".to_string();
        request.search_text = "flac".to_string();
        let response =
            list_music_tool_issues(&conn, request, 50, None).expect("list non-mp3 issues");
        let (headers, rows) = issue_export_table(&response.tool.id, &response.rows);

        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.tool.track_count, 1);
        assert_eq!(response.total, 1);
        assert_eq!(
            response.rows[0].filename.as_deref(),
            Some("02 What Have I Done.flac")
        );
        assert!(headers.contains(&"Issue"));
        assert!(headers.contains(&"Genre"));
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn lists_albums_without_cover_image_records() {
        let conn = seeded_connection();
        let mut request = MusicToolIssueRequest::default();
        request.tool_id = "albums-without-cover-image".to_string();

        let response =
            list_music_tool_issues(&conn, request.clone(), 50, None).expect("list cover issues");

        assert_eq!(response.tool.issue_count, 1);
        assert_eq!(response.tool.album_count, 1);
        assert_eq!(response.tool.track_count, 0);
        assert_eq!(response.total, 1);
        assert_eq!(response.rows[0].album.as_deref(), Some("Actually"));
        assert_eq!(
            response.rows[0].file_path.as_deref(),
            Some("D:\\Music\\Pet Shop Boys\\Actually")
        );

        conn.execute(
            "
            INSERT INTO album_covers (
                album_id, source, source_path, cache_path, mime_type, extension,
                file_size_bytes, imported_at
            ) VALUES (
                'mb:test', 'archive', 'D:\\Music\\AlbumCovers\\Actually.jpg',
                'D:\\Music\\AlbumCovers\\Actually.jpg', 'image/jpeg', 'jpg',
                2048, '2026-06-30T00:00:00Z'
            )
            ",
            [],
        )
        .expect("insert album cover");

        let response = list_music_tool_issues(&conn, request, 50, None)
            .expect("list cover issues after import");

        assert_eq!(response.tool.issue_count, 0);
        assert_eq!(response.tool.album_count, 0);
        assert_eq!(response.total, 0);
    }
}
