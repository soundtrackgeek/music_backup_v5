use super::*;

pub(super) struct PerformanceProbeSample {
    pub(super) total_count: Option<i64>,
    pub(super) row_count: Option<usize>,
    pub(super) detail: String,
}

#[cfg(not(test))]
pub fn library_status(app: &AppHandle) -> Result<LibraryStatus> {
    let (conn, db_path) = open_read(app)?;
    let track_count = count_rows(&conn, "tracks")?;
    let album_count = count_rows(&conn, "albums")?;
    let cover_count = count_rows(&conn, "album_covers")?;
    let import_run_count = count_rows(&conn, "import_runs")?;
    let last_import = list_import_runs(&conn, 1)?.into_iter().next();

    Ok(LibraryStatus {
        db_path: db_path.display().to_string(),
        has_database: db_path.exists(),
        track_count,
        album_count,
        cover_count,
        import_run_count,
        last_import,
    })
}

#[cfg(not(test))]
pub fn performance_probe_for_app(app: &AppHandle) -> Result<PerformanceProbeResponse> {
    // Discovery in this probe maintains the saved Daily Edition snapshot.
    let (conn, db_path) = open(app)?;
    performance_probe(&conn, db_path.display().to_string())
}

pub(super) fn performance_probe(
    conn: &Connection,
    database_path: String,
) -> Result<PerformanceProbeResponse> {
    ensure_search_indexes(conn)?;

    let started = Instant::now();
    let track_count = count_rows(conn, "tracks")?;
    let album_count = count_rows(conn, "albums")?;
    let album_sample = performance_probe_sample_text(conn, "albums", "album")?;
    let track_sample = performance_probe_sample_text(conn, "tracks", "title")?;

    let mut operations = Vec::new();
    operations.push(measure_performance_operation(
        "search-albums-default",
        "Album search default page",
        "Search",
        || {
            let mut request = BrowseRequest::default();
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Default album page, sorted by album.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "search-albums-sampled-text",
        "Album search sampled text",
        "Search",
        || {
            let mut request = BrowseRequest::default();
            request.search_text = album_sample.clone().unwrap_or_default();
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                performance_probe_text_detail("album", album_sample.as_deref()),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "search-tracks-sampled-text",
        "Track search sampled text",
        "Search",
        || {
            let mut request = BrowseRequest::default();
            request.view = "tracks".to_string();
            request.search_text = track_sample.clone().unwrap_or_default();
            request.sort = BrowseSort {
                field: "title".to_string(),
                direction: "asc".to_string(),
            };
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                performance_probe_text_detail("track", track_sample.as_deref()),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "chart-album-score",
        "Chart-style album score ranking",
        "Charts",
        || {
            let mut request = BrowseRequest::default();
            request.sort = BrowseSort {
                field: "albumScore".to_string(),
                direction: "desc".to_string(),
            };
            request.filters.rating_completeness_min = Some(100.0);
            request.limit = 50;
            let response = search_library(conn, request, 500)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Fully rated albums sorted by Album Score.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "tools-missing-covers",
        "Music Tool missing covers",
        "Tools",
        || {
            let request = MusicToolIssueRequest {
                tool_id: "albums-without-cover-image".to_string(),
                request_id: String::new(),
                search_text: String::new(),
                sort: BrowseSort::default(),
                limit: 50,
                offset: 0,
            };
            let response = list_music_tool_issues(conn, request, 500, None)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Albums without imported cover records.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "tools-whitespace",
        "Music Tool whitespace anomalies",
        "Tools",
        || {
            let request = MusicToolIssueRequest {
                tool_id: "whitespace-anomalies".to_string(),
                request_id: String::new(),
                search_text: String::new(),
                sort: BrowseSort::default(),
                limit: 50,
                offset: 0,
            };
            let response = list_music_tool_issues(conn, request, 500, None)?;
            Ok(performance_probe_sample(
                Some(response.total),
                Some(response.rows.len()),
                "Repeated whitespace validator.".to_string(),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "statistics-dashboard",
        "Statistics dashboard payload",
        "Statistics",
        || {
            let response = statistics(conn)?;
            Ok(performance_probe_sample(
                Some(response.overview.track_count),
                Some(response.import_history.len()),
                format!(
                    "{} albums / {} genres / {} import runs.",
                    response.overview.album_count,
                    response.overview.genre_count,
                    response.import_history.len()
                ),
            ))
        },
    ));
    operations.push(measure_performance_operation(
        "discovery-dashboard",
        "Discovery dashboard payload",
        "Discovery",
        || {
            let response = discovery(conn, false)?;
            let row_count = response.heatmap.len()
                + response.backlog_missions.len()
                + response.smart_missions.len()
                + response.love_rating_points.len()
                + response.genre_points.len()
                + response.artist_points.len();
            Ok(performance_probe_sample(
                Some(row_count as i64),
                Some(row_count),
                format!(
                    "{} heatmap cells / {} missions / {} discovery points.",
                    response.heatmap.len(),
                    response.backlog_missions.len() + response.smart_missions.len(),
                    response.love_rating_points.len()
                        + response.genre_points.len()
                        + response.artist_points.len()
                ),
            ))
        },
    ));

    let slowest_operation_ms = operations
        .iter()
        .map(|operation| operation.duration_ms)
        .max()
        .unwrap_or_default();

    Ok(PerformanceProbeResponse {
        generated_at: Utc::now().to_rfc3339(),
        database_path,
        track_count,
        album_count,
        total_duration_ms: started.elapsed().as_millis(),
        slowest_operation_ms,
        operations,
    })
}

pub(super) fn measure_performance_operation<F>(
    id: &str,
    label: &str,
    category: &str,
    operation: F,
) -> PerformanceProbeOperation
where
    F: FnOnce() -> Result<PerformanceProbeSample>,
{
    let started = Instant::now();
    match operation() {
        Ok(sample) => PerformanceProbeOperation {
            id: id.to_string(),
            label: label.to_string(),
            category: category.to_string(),
            status: "ok".to_string(),
            duration_ms: started.elapsed().as_millis(),
            total_count: sample.total_count,
            row_count: sample.row_count,
            detail: sample.detail,
            error_message: None,
        },
        Err(error) => PerformanceProbeOperation {
            id: id.to_string(),
            label: label.to_string(),
            category: category.to_string(),
            status: "failed".to_string(),
            duration_ms: started.elapsed().as_millis(),
            total_count: None,
            row_count: None,
            detail: "Operation failed before producing counts.".to_string(),
            error_message: Some(error.to_string()),
        },
    }
}

pub(super) fn performance_probe_sample(
    total_count: Option<i64>,
    row_count: Option<usize>,
    detail: String,
) -> PerformanceProbeSample {
    PerformanceProbeSample {
        total_count,
        row_count,
        detail,
    }
}

pub(super) fn performance_probe_text_detail(entity: &str, sample: Option<&str>) -> String {
    match sample {
        Some(value) => format!("Sampled {entity} text: {value}"),
        None => format!("No {entity} sample found; measured an empty-text query."),
    }
}

pub(super) fn performance_probe_sample_text(
    conn: &Connection,
    table: &str,
    column: &str,
) -> Result<Option<String>> {
    let sql = format!(
        "
        SELECT {column}
        FROM {table}
        WHERE NULLIF(TRIM(COALESCE({column}, '')), '') IS NOT NULL
        ORDER BY id
        LIMIT 1
        "
    );
    conn.query_row(&sql, [], |row| row.get::<_, String>(0))
        .optional()
        .with_context(|| format!("Could not select performance probe sample from {table}.{column}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn runs_performance_probe_with_representative_operations() {
        let conn = seeded_connection();
        let probe =
            performance_probe(&conn, "in-memory-test.sqlite3".to_string()).expect("run probe");

        assert_eq!(probe.track_count, 1);
        assert_eq!(probe.album_count, 1);
        assert_eq!(probe.database_path, "in-memory-test.sqlite3");
        assert!(probe.operations.len() >= 8);
        assert!(probe.slowest_operation_ms <= probe.total_duration_ms);
        assert!(probe
            .operations
            .iter()
            .all(|operation| operation.status == "ok"));
        assert!(probe
            .operations
            .iter()
            .any(|operation| operation.id == "search-albums-default"));
        assert!(probe
            .operations
            .iter()
            .any(|operation| operation.id == "statistics-dashboard"));
    }
}
