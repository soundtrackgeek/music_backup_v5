//! Export of the Artists chart. It runs the same query as the on-screen table, with
//! the page size lifted, so the file matches the current ranking, sort and filters.

#[cfg(not(test))]
use super::exports::record_export;
use super::exports::write_table_file;
use super::*;
use serde::{Deserialize, Serialize};

/// Largest artist list one export writes, matching the Albums and Tracks export cap.
const ARTIST_EXPORT_LIMIT: u32 = 100_000;

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistChartExportRequest {
    pub request: ArtistChartRequest,
    pub format: String,
}

pub(super) fn artist_export_table(
    request: &ArtistChartRequest,
    rows: &[ArtistChartRow],
) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let threshold = request
        .rated_threshold_percent
        .filter(|value| value.is_finite())
        .unwrap_or(100.0)
        .clamp(1.0, 100.0);
    let headers = vec![
        "Rank",
        "Artist",
        "Albums",
        "Tracks",
        "5 Star Tracks",
        "Loved Tracks",
        "Charted Albums",
        "Charted Tracks",
        "Rated Albums",
        "Rated Threshold %",
        "Avg Album Score",
    ];
    let values = rows
        .iter()
        .map(|row| {
            vec![
                row.rank.to_string(),
                row.artist_name.clone(),
                row.album_count.to_string(),
                row.track_count.to_string(),
                row.five_star_tracks.to_string(),
                row.loved_tracks.to_string(),
                row.charted_albums.to_string(),
                row.charted_tracks.to_string(),
                row.complete_albums.to_string(),
                format!("{threshold}"),
                row.average_album_score
                    .map(|score| format!("{score:.1}"))
                    .unwrap_or_default(),
            ]
        })
        .collect();
    (headers, values)
}

pub(super) fn validated_export_format(format: &str) -> Result<String> {
    let format = format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "tsv" | "json" | "txt" | "xlsx") {
        bail!("Unsupported export format: {format}");
    }
    Ok(format)
}

#[cfg(not(test))]
pub fn export_artist_chart_for_app(
    app: &AppHandle,
    input: ArtistChartExportRequest,
) -> Result<ExportResult> {
    let format = validated_export_format(&input.format)?;
    let (conn, _) = open_read(app)?;

    let mut request = input.request;
    request.offset = 0;
    request.limit = ARTIST_EXPORT_LIMIT;
    let response = artist_chart(&conn, request.clone(), ARTIST_EXPORT_LIMIT)?;

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;
    let path = export_dir.join(format!(
        "music-library-artists-{}.{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    let (headers, values) = artist_export_table(&request, &response.rows);
    write_table_file(&path, &format, &headers, &values)
        .with_context(|| format!("Could not write export {}", path.display()))?;

    let request_json =
        serde_json::to_string(&request).context("Could not serialize export query")?;
    drop(conn);
    record_export(
        app,
        "artists",
        &format,
        response.rows.len(),
        &path,
        &request_json,
    )?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: response.rows.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(rank: i64, name: &str, score: Option<f64>) -> ArtistChartRow {
        ArtistChartRow {
            rank,
            artist_key: name.to_lowercase(),
            artist_name: name.to_string(),
            album_count: 3,
            track_count: 30,
            five_star_tracks: 4,
            loved_tracks: 2,
            charted_albums: 1,
            charted_tracks: 5,
            complete_albums: 2,
            average_album_score: score,
        }
    }

    #[test]
    fn table_lists_every_chart_column_with_the_rated_threshold() {
        let mut request = ArtistChartRequest::default();
        request.rated_threshold_percent = Some(85.0);
        let (headers, values) = artist_export_table(
            &request,
            &[row(1, "Alpha", Some(412.34)), row(2, "Beta, The", None)],
        );

        assert_eq!(headers.len(), values[0].len());
        assert_eq!(
            values[0],
            ["1", "Alpha", "3", "30", "4", "2", "1", "5", "2", "85", "412.3"]
        );
        assert_eq!(values[1][1], "Beta, The");
        assert_eq!(values[1][10], "");
    }

    #[test]
    fn default_threshold_exports_as_one_hundred() {
        let (_, values) =
            artist_export_table(&ArtistChartRequest::default(), &[row(1, "Alpha", None)]);
        assert_eq!(values[0][9], "100");
    }

    #[test]
    fn export_log_needs_a_writer_connection() {
        use super::super::exports::insert_export_record;

        let dir = std::env::temp_dir().join(format!("artist-export-log-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("catalog.sqlite3");
        let writer = Connection::open(&db_path).unwrap();
        writer
            .execute_batch(
                "CREATE TABLE exports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
                    view TEXT NOT NULL, format TEXT NOT NULL, row_count INTEGER NOT NULL,
                    path TEXT NOT NULL, request_json TEXT NOT NULL);",
            )
            .unwrap();
        let reader = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .unwrap();
        let file = dir.join("artists.xlsx");

        assert!(insert_export_record(&reader, "artists", "xlsx", 3, &file, "{}").is_err());
        insert_export_record(&writer, "artists", "xlsx", 3, &file, "{}").unwrap();
        let logged: i64 = writer
            .query_row("SELECT row_count FROM exports WHERE view = 'artists'", [], |row| {
                row.get(0)
            })
            .unwrap();
        drop(reader);
        drop(writer);
        fs::remove_dir_all(&dir).ok();

        assert_eq!(logged, 3);
    }

    #[test]
    fn writes_csv_and_rejects_unknown_formats() {
        assert!(validated_export_format("PDF").is_err());
        assert_eq!(validated_export_format(" XLSX ").unwrap(), "xlsx");

        let dir = std::env::temp_dir().join(format!("artist-export-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("artists.csv");
        let (headers, values) = artist_export_table(
            &ArtistChartRequest::default(),
            &[row(1, "Beta, The", Some(10.0))],
        );
        write_table_file(&path, "csv", &headers, &values).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        fs::remove_dir_all(&dir).ok();

        assert!(text.starts_with("Rank,Artist,Albums,"));
        assert!(text.contains("\"Beta, The\""));
    }
}
