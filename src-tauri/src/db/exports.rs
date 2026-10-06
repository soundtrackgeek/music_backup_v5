use super::*;

#[cfg(not(test))]
pub fn export_search_for_app(app: &AppHandle, input: ExportSearchRequest) -> Result<ExportResult> {
    let format = input.format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "tsv" | "json" | "txt" | "xlsx") {
        bail!("Unsupported export format: {}", input.format);
    }

    let (conn, _) = open_search(app)?;

    let mut request = input.request.clone();
    request.offset = 0;
    request.limit = 100_000;
    let response = search_library(&conn, request.clone(), 100_000)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;

    let path = export_dir.join(format!(
        "music-library-{}-{}.{}",
        normalize_view(&request.view),
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    write_export_file(
        &path,
        &format,
        &request.view,
        &response.rows,
        input.include_calculated,
        &input.export_columns,
    )
    .with_context(|| format!("Could not write export {}", path.display()))?;

    let request_json =
        serde_json::to_string(&request).context("Could not serialize export query")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ",
        params![
            Utc::now().to_rfc3339(),
            normalize_view(&request.view),
            &format,
            response.rows.len() as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record export")?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: response.rows.len(),
    })
}

#[cfg(not(test))]
pub fn export_music_tool_issues_for_app(
    app: &AppHandle,
    input: ExportMusicToolRequest,
) -> Result<ExportResult> {
    let format = input.format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "tsv" | "json" | "txt" | "xlsx") {
        bail!("Unsupported export format: {}", input.format);
    }

    let (mut conn, _) = open(app)?;
    let mut request = input.request.clone();
    request.request_id = String::new();
    request.limit = 100_000;
    request.offset = 0;
    ensure_music_tool_data_for_request(app, &mut conn, &request)?;
    let response = list_music_tool_issues(&conn, request.clone(), 100_000, None)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;

    let path = export_dir.join(format!(
        "music-library-tools-{}-{}.{}",
        safe_file_segment(&response.tool.id),
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    write_issue_export_file(&path, &format, &response.tool.id, &response.rows)
        .with_context(|| format!("Could not write export {}", path.display()))?;

    let request_json =
        serde_json::to_string(&request).context("Could not serialize music tool export query")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, 'tools', ?2, ?3, ?4, ?5)
        ",
        params![
            Utc::now().to_rfc3339(),
            &format,
            response.rows.len() as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record music tool export")?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: response.rows.len(),
    })
}

pub(crate) fn safe_file_segment(value: &str) -> String {
    let segment = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if segment.is_empty() {
        "tools".to_string()
    } else {
        segment
    }
}

pub(super) fn write_export_file(
    path: &PathBuf,
    format: &str,
    view: &str,
    rows: &[BrowseRow],
    include_calculated: bool,
    export_columns: &[String],
) -> Result<()> {
    let (headers, values) = export_table(view, rows, include_calculated, export_columns);

    if format == "xlsx" {
        write_xlsx_file(path, &headers, &values)?;
        return Ok(());
    }

    let mut file = fs::File::create(path)?;

    match format {
        "json" => {
            let records = values
                .iter()
                .map(|row| {
                    headers
                        .iter()
                        .zip(row.iter())
                        .map(|(header, value)| {
                            (
                                (*header).to_string(),
                                serde_json::Value::String(value.clone()),
                            )
                        })
                        .collect::<serde_json::Map<_, _>>()
                })
                .collect::<Vec<_>>();
            file.write_all(serde_json::to_string_pretty(&records)?.as_bytes())?;
        }
        "tsv" => write_delimited(&mut file, '\t', &headers, &values)?,
        "txt" => write_delimited(&mut file, '\t', &headers, &values)?,
        _ => write_delimited(&mut file, ',', &headers, &values)?,
    }

    Ok(())
}

pub(super) fn write_issue_export_file(
    path: &PathBuf,
    format: &str,
    tool_id: &str,
    rows: &[MusicToolIssueRow],
) -> Result<()> {
    let (headers, values) = issue_export_table(tool_id, rows);

    if format == "xlsx" {
        write_xlsx_file(path, &headers, &values)?;
        return Ok(());
    }

    let mut file = fs::File::create(path)?;

    match format {
        "json" => {
            let records = values
                .iter()
                .map(|row| {
                    headers
                        .iter()
                        .zip(row.iter())
                        .map(|(header, value)| {
                            (
                                (*header).to_string(),
                                serde_json::Value::String(value.clone()),
                            )
                        })
                        .collect::<serde_json::Map<_, _>>()
                })
                .collect::<Vec<_>>();
            file.write_all(serde_json::to_string_pretty(&records)?.as_bytes())?;
        }
        "tsv" => write_delimited(&mut file, '\t', &headers, &values)?,
        "txt" => write_delimited(&mut file, '\t', &headers, &values)?,
        _ => write_delimited(&mut file, ',', &headers, &values)?,
    }

    Ok(())
}

pub(crate) fn write_xlsx_file(
    path: &PathBuf,
    headers: &[&'static str],
    rows: &[Vec<String>],
) -> Result<()> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();

    for (column, header) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, column as u16, *header, &header_format)?;
    }

    for (row_index, row) in rows.iter().enumerate() {
        for (column_index, value) in row.iter().enumerate() {
            worksheet.write_string((row_index + 1) as u32, column_index as u16, value)?;
        }
    }

    workbook.save(path)?;
    Ok(())
}

pub(crate) fn write_delimited(
    file: &mut fs::File,
    delimiter: char,
    headers: &[&'static str],
    rows: &[Vec<String>],
) -> Result<()> {
    let delimiter_text = delimiter.to_string();
    writeln!(
        file,
        "{}",
        headers
            .iter()
            .map(|header| escape_delimited(header, delimiter))
            .collect::<Vec<_>>()
            .join(&delimiter_text)
    )?;

    for row in rows {
        writeln!(
            file,
            "{}",
            row.iter()
                .map(|value| escape_delimited(value, delimiter))
                .collect::<Vec<_>>()
                .join(&delimiter_text)
        )?;
    }

    Ok(())
}

pub(super) fn escape_delimited(value: &str, delimiter: char) -> String {
    let clean = value.replace('\r', " ").replace('\n', " ");
    if delimiter == '\t' {
        return clean.replace('\t', " ");
    }

    if clean.contains(delimiter) || clean.contains('"') {
        format!("\"{}\"", clean.replace('"', "\"\""))
    } else {
        clean
    }
}

pub(super) fn export_table(
    view: &str,
    rows: &[BrowseRow],
    include_calculated: bool,
    export_columns: &[String],
) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let is_tracks = normalize_view(view) == "tracks";
    let include_calculated = include_calculated || has_export_column(export_columns, "calculated");
    let include_ids = has_export_column(export_columns, "ids");
    let include_filename = !is_tracks && has_export_column(export_columns, "filename");
    let include_file_path = !is_tracks && has_export_column(export_columns, "filePath");
    let include_cover_info = has_export_column(export_columns, "coverInfo");
    let include_origin_country = has_export_column(export_columns, "originCountry");
    let mut headers = if is_tracks {
        vec![
            "Album Artist",
            "Album",
            "Disc",
            "Track",
            "Title",
            "Display Artist",
            "Year",
            "Album Billboard",
            "Album Billboard Debut Week",
            "Single Billboard",
            "Single Billboard Debut",
            "Rating",
            "Time",
            "Love",
            "Filename",
            "File Path",
        ]
    } else {
        vec![
            "Album Artist",
            "Album",
            "Year",
            "Billboard",
            "Billboard Debut Week",
            "Release Year",
            "Genre",
            "Publisher",
            "Tracks",
            "Minutes",
            "Album Rating",
            "Rating Complete",
            "Loved Tracks",
        ]
    };

    if include_ids {
        headers.push("Album ID");
        if is_tracks {
            headers.push("Track ID");
        }
    }

    if include_filename {
        headers.push("Filename");
    }

    if include_file_path {
        headers.push("File Path");
    }

    if include_cover_info {
        headers.extend(["Cover Path", "Cover MIME"]);
    }

    if include_origin_country {
        headers.extend(["Origin Country", "Origin Country Code", "Origin Raw Area"]);
    }

    if include_calculated {
        headers.extend(["TMOE Minutes", "AE Percent", "Album Score"]);
    }

    let values = rows
        .iter()
        .map(|row| {
            let mut values = if is_tracks {
                vec![
                    optional_text(&row.album_artist_display),
                    optional_text(&row.album),
                    optional_i32(row.disc_number),
                    optional_i32(row.track_number),
                    optional_text(&row.title),
                    optional_text(&row.display_artist),
                    optional_i32(row.year),
                    format_billboard_rank(row.billboard_rank, row.billboard_year),
                    format_billboard_debut_week(
                        row.billboard_debut_year,
                        row.billboard_debut_month,
                        row.billboard_debut_week,
                    ),
                    format_billboard_rank(row.billboard_single_rank, row.billboard_single_year),
                    format_billboard_single_debut(
                        &row.billboard_single_debut_date,
                        row.billboard_single_debut_week,
                    ),
                    row.normalized_rating
                        .map(|rating| format!("{:.0}", f64::from(rating) / 20.0))
                        .unwrap_or_default(),
                    row.track_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    optional_text(&row.love),
                    optional_text(&row.filename),
                    optional_text(&row.file_path),
                ]
            } else {
                vec![
                    optional_text(&row.album_artist_display),
                    optional_text(&row.album),
                    optional_i32(row.year),
                    format_billboard_rank(row.billboard_rank, row.billboard_year),
                    format_billboard_debut_week(
                        row.billboard_debut_year,
                        row.billboard_debut_month,
                        row.billboard_debut_week,
                    ),
                    optional_i32(row.release_year),
                    optional_text(&row.canonical_genre),
                    optional_text(&row.publisher),
                    row.total_tracks
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                    row.total_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    optional_i32(row.effective_album_rating),
                    row.rating_completeness
                        .map(|value| format!("{:.1}%", value * 100.0))
                        .unwrap_or_default(),
                    row.loved_tracks
                        .map(|value| value.to_string())
                        .unwrap_or_default(),
                ]
            };

            if include_ids {
                values.push(row.album_id.clone());
                if is_tracks {
                    values.push(
                        row.track_id
                            .map(|value| value.to_string())
                            .unwrap_or_default(),
                    );
                }
            }

            if include_filename {
                values.push(optional_text(&row.filename));
            }

            if include_file_path {
                values.push(optional_text(&row.file_path));
            }

            if include_cover_info {
                values.extend([
                    optional_text(&row.cover_path),
                    optional_text(&row.cover_mime_type),
                ]);
            }

            if include_origin_country {
                values.extend([
                    optional_text(&row.origin_country_name),
                    optional_text(&row.origin_country_code),
                    optional_text(&row.origin_country_raw_area),
                ]);
            }

            if include_calculated {
                values.extend([
                    row.tmoe_seconds
                        .map(format_seconds_as_minutes)
                        .unwrap_or_default(),
                    row.ae_ratio
                        .map(|value| format!("{:.2}%", value * 100.0))
                        .unwrap_or_default(),
                    row.album_score
                        .map(|value| format!("{value:.3}"))
                        .unwrap_or_default(),
                ]);
            }

            values
        })
        .collect::<Vec<_>>();

    (headers, values)
}

pub(super) fn has_export_column(columns: &[String], column: &str) -> bool {
    let normalized_column = normalize_export_column(column);
    columns
        .iter()
        .any(|value| normalize_export_column(value) == normalized_column)
}

pub(super) fn normalize_export_column(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub(super) fn issue_export_table(
    tool_id: &str,
    rows: &[MusicToolIssueRow],
) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let genre_header = if tool_id == "artists-without-musicbrainz-data" {
        "Top Genre"
    } else {
        "Genre"
    };
    let value_header = if tool_id == "owned-musicbrainz-special-releases" {
        "MusicBrainz Type"
    } else {
        "Value"
    };
    let mut headers = vec![
        "Tool",
        "Severity",
        "Scope",
        "Album Artist",
        "Album",
        "Year",
        "Track",
        genre_header,
        "Issue",
        value_header,
    ];
    if tool_id == "missing-chart-albums" {
        headers.extend(["Billboard", "Official UK", "VG Lista"]);
    } else if tool_id == "missing-chart-singles" {
        headers.extend([
            "Billboard",
            "Official UK",
            "VG Lista",
            "Ti i Skuddet",
            "Norsktoppen",
        ]);
    }
    headers.extend(["Filename", "File Path"]);

    let values = rows
        .iter()
        .map(|row| {
            let mut values = vec![
                row.tool_id.clone(),
                row.severity.clone(),
                row.entity_type.clone(),
                optional_text(&row.album_artist_display),
                optional_text(&row.album),
                optional_i32(row.year),
                optional_text(&row.title),
                optional_text(&row.canonical_genre),
                row.detail.clone(),
                optional_text(&row.value),
            ];
            if tool_id == "missing-chart-albums" {
                values.extend([
                    optional_text(&row.billboard),
                    optional_text(&row.official_uk),
                    optional_text(&row.vg_lista),
                ]);
            } else if tool_id == "missing-chart-singles" {
                values.extend([
                    optional_text(&row.billboard),
                    optional_text(&row.official_uk),
                    optional_text(&row.vg_lista),
                    optional_text(&row.ti_i_skuddet),
                    optional_text(&row.norsktoppen),
                ]);
            }
            values.extend([optional_text(&row.filename), optional_text(&row.file_path)]);
            values
        })
        .collect::<Vec<_>>();

    (headers, values)
}

pub(super) fn optional_text(value: &Option<String>) -> String {
    value.clone().unwrap_or_default()
}

pub(super) fn optional_i32(value: Option<i32>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}

pub(super) fn format_billboard_rank(rank: Option<i32>, year: Option<i32>) -> String {
    match (rank, year) {
        (Some(rank), Some(year)) => format!("#{rank} {year}"),
        (Some(rank), None) => format!("#{rank}"),
        _ => String::new(),
    }
}

pub(super) fn format_billboard_debut_week(
    year: Option<i32>,
    month: Option<i32>,
    week: Option<i32>,
) -> String {
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    match (year, month, week) {
        (Some(year), Some(month), Some(week)) if (1..=12).contains(&month) => {
            format!("{} {year:04} · Week {week}", MONTHS[(month - 1) as usize])
        }
        (Some(year), _, Some(week)) => format!("{year:04} · Week {week}"),
        _ => String::new(),
    }
}

pub(super) fn format_billboard_single_debut(date: &Option<String>, week: Option<i32>) -> String {
    match (date.as_deref(), week) {
        (Some(date), Some(week)) => format!("{date} · Week {week}"),
        (Some(date), None) => date.to_string(),
        _ => String::new(),
    }
}

pub(super) fn format_seconds_as_minutes(seconds: i64) -> String {
    format!("{:.1}", seconds as f64 / 60.0)
}
