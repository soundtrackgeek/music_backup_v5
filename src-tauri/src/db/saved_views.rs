use super::*;

#[cfg(not(test))]
pub fn list_saved_searches_for_app(app: &AppHandle) -> Result<Vec<SavedSearch>> {
    let (conn, _) = open_read(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, name, view, request_json, created_at, updated_at
        FROM saved_queries
        ORDER BY updated_at DESC, id DESC
        ",
    )?;

    let searches = stmt
        .query_map([], |row| {
            let request_json: String = row.get(3)?;
            let request =
                serde_json::from_str::<BrowseRequest>(&request_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;

            Ok(SavedSearch {
                id: row.get(0)?,
                name: row.get(1)?,
                view: row.get(2)?,
                request,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(searches)
}

#[cfg(not(test))]
pub fn save_search_for_app(app: &AppHandle, input: SaveSearchRequest) -> Result<SavedSearch> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() {
        bail!("Name the search before saving it");
    }

    let now = Utc::now().to_rfc3339();
    let request_json =
        serde_json::to_string(&input.request).context("Could not serialize search")?;
    conn.execute(
        "
        INSERT INTO saved_queries (name, view, request_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        ",
        params![name, input.request.view, request_json, now],
    )
    .context("Could not save search")?;

    let id = conn.last_insert_rowid();
    let saved = list_saved_searches_for_app(app)?
        .into_iter()
        .find(|search| search.id == id)
        .context("Could not reload saved search")?;
    Ok(saved)
}

#[cfg(not(test))]
pub fn delete_saved_search_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    conn.execute("DELETE FROM saved_queries WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved search {id}"))?;
    Ok(())
}

#[cfg(not(test))]
pub fn list_saved_charts_for_app(app: &AppHandle) -> Result<Vec<SavedChart>> {
    let (conn, _) = open_read(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, name, config_json, created_at, updated_at
        FROM saved_charts
        ORDER BY updated_at DESC, id DESC
        ",
    )?;

    let charts = stmt
        .query_map([], |row| {
            let config_json: String = row.get(2)?;
            let config = serde_json::from_str::<ChartConfig>(&config_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            let config = normalize_chart_config(config);

            Ok(SavedChart {
                id: row.get(0)?,
                name: row.get(1)?,
                config,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(charts)
}

#[cfg(not(test))]
pub fn save_chart_for_app(app: &AppHandle, input: SaveChartRequest) -> Result<SavedChart> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() {
        bail!("Name the chart before saving it");
    }

    let config = normalize_chart_config(input.config);
    let now = Utc::now().to_rfc3339();
    let config_json = serde_json::to_string(&config).context("Could not serialize chart")?;
    conn.execute(
        "
        INSERT INTO saved_charts (name, config_json, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?3)
        ",
        params![name, config_json, now],
    )
    .context("Could not save chart")?;

    let id = conn.last_insert_rowid();
    let saved = list_saved_charts_for_app(app)?
        .into_iter()
        .find(|chart| chart.id == id)
        .context("Could not reload saved chart")?;
    Ok(saved)
}

#[cfg(not(test))]
pub fn delete_saved_chart_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    conn.execute("DELETE FROM saved_charts WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved chart {id}"))?;
    Ok(())
}
