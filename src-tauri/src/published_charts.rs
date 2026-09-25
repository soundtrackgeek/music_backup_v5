use anyhow::{anyhow, bail, Context, Result};
use chrono::{Datelike, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
#[cfg(not(test))]
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

#[cfg(not(test))]
use tauri::{AppHandle, Emitter};

const ENTRY_HEADERS: [&str; 21] = [
    "book",
    "chart",
    "week_ending",
    "position",
    "last_week",
    "weeks_on_chart",
    "entry_status",
    "movement",
    "title",
    "artist",
    "number_one_marker",
    "label",
    "format",
    "catalogue_number",
    "release_type",
    "duration",
    "peak_position",
    "entry_date",
    "peak_date",
    "bpi_award",
    "source_page",
];

#[cfg(not(test))]
static IMPORT_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(not(test))]
struct ImportGuard;

#[cfg(not(test))]
impl ImportGuard {
    fn acquire() -> Result<Self> {
        IMPORT_RUNNING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| anyhow!("A Published Charts import is already running"))?;
        Ok(Self)
    }
}

#[cfg(not(test))]
impl Drop for ImportGuard {
    fn drop(&mut self) {
        IMPORT_RUNNING.store(false, Ordering::Release);
    }
}

#[derive(Clone, Debug, Deserialize)]
struct InventoryRow {
    book: String,
    chart: String,
    first_week: String,
    last_week: String,
    weekly_charts: usize,
    rows: usize,
    first_page: String,
    last_page: String,
}

#[derive(Debug, Deserialize)]
struct SourceRow {
    book: String,
    chart: String,
    week_ending: String,
    position: i32,
    last_week: String,
    weeks_on_chart: String,
    entry_status: String,
    movement: String,
    title: String,
    artist: String,
    number_one_marker: String,
    label: String,
    format: String,
    catalogue_number: String,
    release_type: String,
    duration: String,
    peak_position: String,
    entry_date: String,
    peak_date: String,
    bpi_award: String,
    source_page: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartsImportProgress {
    pub completed_years: usize,
    pub total_years: usize,
    pub current_year: i32,
    pub imported_rows: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartsImportSummary {
    pub source_path: String,
    pub years_imported: usize,
    pub chart_series: usize,
    pub rows_imported: usize,
    pub duration_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartCatalog {
    pub imported_years: usize,
    pub inventory_years: usize,
    pub needs_import: bool,
    pub total_rows: i64,
    pub series: Vec<PublishedChartSeries>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartSeries {
    pub chart: String,
    pub years: Vec<i32>,
    pub first_week: String,
    pub last_week: String,
    pub rows: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartWeek {
    pub week_ending: String,
    pub rows: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartEntries {
    pub total_rows: i64,
    pub entries: Vec<PublishedChartEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedArtistRanking {
    pub total_artists: i64,
    pub chart_weeks: i64,
    pub total_entries: i64,
    pub artists: Vec<PublishedArtistRow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedArtistRow {
    pub rank: i64,
    pub artist: String,
    pub number_one_weeks: i64,
    pub chart_weeks: i64,
    pub appearances: i64,
    pub best_position: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedChartEntry {
    pub id: i64,
    pub position: i32,
    pub last_week: String,
    pub weeks_on_chart: String,
    pub entry_status: String,
    pub movement: String,
    pub title: String,
    pub artist: String,
    pub number_one_marker: String,
    pub label: String,
    pub format: String,
    pub catalogue_number: String,
    pub release_type: String,
    pub duration: String,
    pub peak_position: String,
    pub entry_date: String,
    pub peak_date: String,
    pub bpi_award: String,
    pub source_page: String,
    pub book: String,
}

pub(crate) fn ensure_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS published_chart_books (
            id INTEGER PRIMARY KEY,
            book TEXT NOT NULL,
            chart TEXT NOT NULL,
            first_week TEXT NOT NULL,
            last_week TEXT NOT NULL,
            weekly_charts INTEGER NOT NULL,
            row_count INTEGER NOT NULL,
            first_page TEXT NOT NULL,
            last_page TEXT NOT NULL,
            UNIQUE(book, chart)
        );
        CREATE INDEX IF NOT EXISTS idx_published_chart_books_chart
            ON published_chart_books(chart, book);

        CREATE TABLE IF NOT EXISTS published_chart_entries (
            id INTEGER PRIMARY KEY,
            book_id INTEGER NOT NULL REFERENCES published_chart_books(id) ON DELETE CASCADE,
            source_row INTEGER NOT NULL,
            week_ending TEXT NOT NULL,
            position INTEGER NOT NULL,
            last_week TEXT NOT NULL,
            weeks_on_chart TEXT NOT NULL,
            entry_status TEXT NOT NULL,
            movement TEXT NOT NULL,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            number_one_marker TEXT NOT NULL,
            label TEXT NOT NULL,
            format TEXT NOT NULL,
            catalogue_number TEXT NOT NULL,
            release_type TEXT NOT NULL,
            duration TEXT NOT NULL,
            peak_position TEXT NOT NULL,
            entry_date TEXT NOT NULL,
            peak_date TEXT NOT NULL,
            bpi_award TEXT NOT NULL,
            source_page TEXT NOT NULL,
            UNIQUE(book_id, source_row)
        );
        CREATE INDEX IF NOT EXISTS idx_published_chart_entries_week
            ON published_chart_entries(book_id, week_ending, position, source_row);

        CREATE TABLE IF NOT EXISTS published_chart_import_years (
            year INTEGER PRIMARY KEY,
            source_path TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            imported_at TEXT NOT NULL
        );
        ",
    )
    .context("Could not create Published Charts tables")
}

pub(crate) fn schema_exists(conn: &Connection) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
            'published_chart_books', 'published_chart_entries', 'published_chart_import_years'
        )",
        [],
        |row| row.get(0),
    )?;
    Ok(count == 3)
}

fn source_folder(source_path: &str) -> Result<PathBuf> {
    let source_path = source_path.trim();
    if source_path.is_empty() {
        bail!("Choose the Charts folder before importing");
    }
    let provided = PathBuf::from(source_path);
    let candidates = if provided.is_absolute() {
        vec![provided]
    } else {
        let cwd = std::env::current_dir().context("Could not find the current directory")?;
        let mut candidates = vec![cwd.join(&provided)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&provided));
        }
        candidates.push(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join(&provided),
        );
        candidates
    };
    candidates
        .into_iter()
        .find(|candidate| candidate.join("chart_inventory.csv").is_file())
        .map(|candidate| candidate.canonicalize().unwrap_or(candidate))
        .ok_or_else(|| anyhow!("Could not find chart_inventory.csv in {source_path}"))
}

fn read_inventory(folder: &Path) -> Result<BTreeMap<i32, Vec<InventoryRow>>> {
    let path = folder.join("chart_inventory.csv");
    let mut reader = csv::Reader::from_path(&path)
        .with_context(|| format!("Could not read {}", path.display()))?;
    let mut years: BTreeMap<i32, Vec<InventoryRow>> = BTreeMap::new();
    let mut seen = HashSet::new();
    for row in reader.deserialize::<InventoryRow>() {
        let row = row.context("Invalid chart inventory row")?;
        if !row.book.ends_with("_us_singles") {
            continue;
        }
        let year = row.book[0..4]
            .parse::<i32>()
            .with_context(|| format!("Invalid US chart book {}", row.book))?;
        if !seen.insert((row.book.clone(), row.chart.clone())) {
            bail!("Duplicate inventory chart {} / {}", row.book, row.chart);
        }
        years.entry(year).or_default().push(row);
    }
    if years.is_empty() {
        bail!("The chart inventory has no US singles charts");
    }
    Ok(years)
}

fn validate_report(folder: &Path, book: &str, expected_rows: usize) -> Result<()> {
    let path = folder.join(book).join(format!("{book}_validation.txt"));
    let report =
        fs::read_to_string(&path).with_context(|| format!("Could not read {}", path.display()))?;
    let first = report.lines().next().unwrap_or_default();
    let prefix = format!("{book}: {expected_rows} rows, 0 problems,");
    if !first.starts_with(&prefix) {
        bail!("Validation summary does not agree with the inventory: {first}");
    }
    Ok(())
}

fn import_folder<F>(
    conn: &mut Connection,
    folder: &Path,
    mut progress: F,
) -> Result<PublishedChartsImportSummary>
where
    F: FnMut(PublishedChartsImportProgress),
{
    let started = Instant::now();
    let years = read_inventory(folder)?;
    let total_years = years.len();
    let mut imported_rows = 0;
    let mut chart_names = HashSet::new();

    for (completed_years, (year, inventory)) in years.into_iter().enumerate() {
        let book = format!("{year}_us_singles");
        let expected_rows: usize = inventory.iter().map(|row| row.rows).sum();
        validate_report(folder, &book, expected_rows)?;
        let csv_path = folder.join(&book).join(format!("{book}_all_charts.csv"));
        let mut reader = csv::Reader::from_path(&csv_path)
            .with_context(|| format!("Could not read {}", csv_path.display()))?;
        let headers = reader
            .headers()
            .context("Could not read chart CSV headers")?;
        if !headers.iter().eq(ENTRY_HEADERS) {
            bail!("Unexpected columns in {}", csv_path.display());
        }

        let tx = conn
            .transaction()
            .context("Could not start chart year import")?;
        tx.execute(
            "DELETE FROM published_chart_books WHERE book = ?1",
            params![book],
        )?;
        let mut book_ids = HashMap::new();
        for row in &inventory {
            tx.execute(
                "INSERT INTO published_chart_books
                 (book, chart, first_week, last_week, weekly_charts, row_count, first_page, last_page)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![row.book, row.chart, row.first_week, row.last_week,
                    row.weekly_charts as i64, row.rows as i64, row.first_page, row.last_page],
            )?;
            book_ids.insert(row.chart.as_str(), tx.last_insert_rowid());
            chart_names.insert(row.chart.clone());
        }

        let mut actual: HashMap<i64, (usize, HashSet<String>, String, String)> = HashMap::new();
        let mut insert = tx.prepare(
            "INSERT INTO published_chart_entries
             (book_id, source_row, week_ending, position, last_week, weeks_on_chart,
              entry_status, movement, title, artist, number_one_marker, label, format,
              catalogue_number, release_type, duration, peak_position, entry_date,
              peak_date, bpi_award, source_page)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
                     ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
        )?;
        let mut count = 0_usize;
        for result in reader.deserialize::<SourceRow>() {
            let row =
                result.with_context(|| format!("Invalid CSV row in {}", csv_path.display()))?;
            if row.book != book
                || row.position < 1
                || row.title.trim().is_empty()
                || row.artist.trim().is_empty()
            {
                bail!(
                    "Invalid chart identity, rank, or song at row {} in {book}",
                    count + 1
                );
            }
            NaiveDate::parse_from_str(&row.week_ending, "%Y-%m-%d")
                .with_context(|| format!("Invalid chart date {}", row.week_ending))?;
            let book_id = *book_ids
                .get(row.chart.as_str())
                .ok_or_else(|| anyhow!("Chart {} is absent from the inventory", row.chart))?;
            let stats = actual.entry(book_id).or_insert_with(|| {
                (
                    0,
                    HashSet::new(),
                    row.week_ending.clone(),
                    row.week_ending.clone(),
                )
            });
            stats.0 += 1;
            stats.1.insert(row.week_ending.clone());
            if row.week_ending < stats.2 {
                stats.2 = row.week_ending.clone();
            }
            if row.week_ending > stats.3 {
                stats.3 = row.week_ending.clone();
            }
            insert.execute(params![
                book_id,
                count as i64 + 1,
                row.week_ending,
                row.position,
                row.last_week,
                row.weeks_on_chart,
                row.entry_status,
                row.movement,
                row.title,
                row.artist,
                row.number_one_marker,
                row.label,
                row.format,
                row.catalogue_number,
                row.release_type,
                row.duration,
                row.peak_position,
                row.entry_date,
                row.peak_date,
                row.bpi_award,
                row.source_page,
            ])?;
            count += 1;
        }
        drop(insert);
        if count != expected_rows {
            bail!("{book}: inventory expects {expected_rows} rows; CSV has {count}");
        }
        for row in &inventory {
            let (rows, weeks, first, last) = actual
                .get(&book_ids[row.chart.as_str()])
                .ok_or_else(|| anyhow!("{} has no CSV rows", row.chart))?;
            if *rows != row.rows
                || weeks.len() != row.weekly_charts
                || first != &row.first_week
                || last != &row.last_week
            {
                bail!("{book} / {} disagrees with chart_inventory.csv", row.chart);
            }
        }
        tx.execute(
            "INSERT INTO published_chart_import_years (year, source_path, row_count, imported_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(year) DO UPDATE SET source_path = excluded.source_path,
                row_count = excluded.row_count, imported_at = excluded.imported_at",
            params![year, csv_path.to_string_lossy(), count as i64],
        )?;
        tx.commit().context("Could not commit chart year import")?;
        imported_rows += count;
        progress(PublishedChartsImportProgress {
            completed_years: completed_years + 1,
            total_years,
            current_year: year,
            imported_rows,
        });
    }
    Ok(PublishedChartsImportSummary {
        source_path: folder.display().to_string(),
        years_imported: total_years,
        chart_series: chart_names.len(),
        rows_imported: imported_rows,
        duration_ms: started.elapsed().as_millis(),
    })
}

#[cfg(not(test))]
pub fn import_for_app(
    app: &AppHandle,
    source_path: String,
) -> Result<PublishedChartsImportSummary> {
    let _guard = ImportGuard::acquire()?;
    let folder = source_folder(&source_path)?;
    let (mut conn, _) = crate::db::open(app)?;
    import_folder(&mut conn, &folder, |progress| {
        let _ = app.emit("published-charts-import-progress", progress);
    })
}

pub fn catalog(conn: &Connection) -> Result<PublishedChartCatalog> {
    let imported_years = conn.query_row(
        "SELECT COUNT(*) FROM published_chart_import_years",
        [],
        |row| row.get::<_, i64>(0),
    )? as usize;
    let total_rows = conn.query_row(
        "SELECT COALESCE(SUM(row_count), 0) FROM published_chart_import_years",
        [],
        |row| row.get(0),
    )?;
    let mut statement = conn.prepare(
        "SELECT chart, CAST(SUBSTR(book, 1, 4) AS INTEGER), first_week, last_week, row_count
         FROM published_chart_books ORDER BY chart, book",
    )?;
    let books = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
        ))
    })?;
    let mut series: Vec<PublishedChartSeries> = Vec::new();
    for book in books {
        let (chart, year, first, last, rows) = book?;
        if series.last().is_none_or(|item| item.chart != chart) {
            series.push(PublishedChartSeries {
                chart: chart.clone(),
                years: Vec::new(),
                first_week: first.clone(),
                last_week: last.clone(),
                rows: 0,
            });
        }
        let item = series.last_mut().unwrap();
        item.years.push(year);
        if first < item.first_week {
            item.first_week = first;
        }
        if last > item.last_week {
            item.last_week = last;
        }
        item.rows += rows;
    }
    Ok(PublishedChartCatalog {
        imported_years,
        inventory_years: imported_years,
        needs_import: false,
        total_rows,
        series,
    })
}

pub fn catalog_with_inventory(
    conn: &Connection,
    source_path: &str,
) -> Result<PublishedChartCatalog> {
    let mut result = catalog(conn)?;
    let Ok(folder) = source_folder(source_path) else {
        return Ok(result);
    };
    let inventory = read_inventory(&folder)?;
    result.inventory_years = inventory.len();
    let mut by_chart: BTreeMap<String, PublishedChartSeries> = BTreeMap::new();
    let mut expected_books = HashSet::new();
    for (year, rows) in inventory {
        for row in rows {
            expected_books.insert((
                row.book.clone(),
                row.chart.clone(),
                row.rows as i64,
                row.first_week.clone(),
                row.last_week.clone(),
                row.weekly_charts as i64,
            ));
            let item = by_chart
                .entry(row.chart.clone())
                .or_insert_with(|| PublishedChartSeries {
                    chart: row.chart.clone(),
                    years: Vec::new(),
                    first_week: row.first_week.clone(),
                    last_week: row.last_week.clone(),
                    rows: 0,
                });
            item.years.push(year);
            if row.first_week < item.first_week {
                item.first_week = row.first_week;
            }
            if row.last_week > item.last_week {
                item.last_week = row.last_week;
            }
            item.rows += row.rows as i64;
        }
    }
    let mut statement = conn.prepare(
        "SELECT book, chart, row_count, first_week, last_week, weekly_charts FROM published_chart_books",
    )?;
    let imported_books = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?
        .collect::<rusqlite::Result<HashSet<_>>>()?;
    result.needs_import = expected_books != imported_books;
    result.series = by_chart.into_values().collect();
    Ok(result)
}

pub fn artists(
    conn: &Connection,
    chart: &str,
    from_year: i32,
    to_year: i32,
    from_week: Option<&str>,
    to_week: Option<&str>,
    offset: u32,
) -> Result<PublishedArtistRanking> {
    if !(1900..=2100).contains(&from_year)
        || !(1900..=2100).contains(&to_year)
        || from_year > to_year
    {
        bail!("Choose a valid ascending year range");
    }
    let start = match from_week.filter(|value| !value.is_empty()) {
        Some(value) => NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .context("Choose a valid first chart week")?,
        None => NaiveDate::from_ymd_opt(from_year, 1, 1).unwrap(),
    };
    let end = match to_week.filter(|value| !value.is_empty()) {
        Some(value) => NaiveDate::parse_from_str(value, "%Y-%m-%d")
            .context("Choose a valid last chart week")?,
        None => NaiveDate::from_ymd_opt(to_year, 12, 31).unwrap(),
    };
    if start.year() != from_year || end.year() != to_year || start > end {
        bail!("Chart weeks must fall within the selected years and run in date order");
    }
    let start = start.format("%Y-%m-%d").to_string();
    let end = end.format("%Y-%m-%d").to_string();
    let filter = "FROM published_chart_books b
                  JOIN published_chart_entries e ON e.book_id = b.id
                  WHERE b.chart = ?1 AND b.book BETWEEN ?2 AND ?3
                    AND e.week_ending BETWEEN ?4 AND ?5";
    let from_book = format!("{from_year}_us_singles");
    let to_book = format!("{to_year}_us_singles");
    let summary_sql = format!("SELECT COUNT(DISTINCT e.week_ending), COUNT(*) {filter}");
    let (chart_weeks, total_entries) = conn.query_row(
        &summary_sql,
        params![chart, from_book, to_book, start, end],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let ranking_sql = format!(
        "WITH artist_totals AS (
            SELECT e.artist AS artist,
                   COUNT(DISTINCT CASE WHEN e.position = 1 THEN e.week_ending END) AS number_one_weeks,
                   COUNT(DISTINCT e.week_ending) AS chart_weeks,
                   COUNT(*) AS appearances,
                   MIN(e.position) AS best_position
            {filter} GROUP BY e.artist
         )
         SELECT ROW_NUMBER() OVER (ORDER BY number_one_weeks DESC, chart_weeks DESC,
                   appearances DESC, artist COLLATE NOCASE, artist) AS rank,
                COUNT(*) OVER () AS total_artists,
                artist, number_one_weeks, chart_weeks, appearances, best_position
         FROM artist_totals
         ORDER BY rank LIMIT 100 OFFSET ?6"
    );
    let mut statement = conn.prepare(&ranking_sql)?;
    let mut total_artists = 0;
    let artists = statement
        .query_map(
            params![chart, from_book, to_book, start, end, offset],
            |row| {
                total_artists = row.get(1)?;
                Ok(PublishedArtistRow {
                    rank: row.get(0)?,
                    artist: row.get(2)?,
                    number_one_weeks: row.get(3)?,
                    chart_weeks: row.get(4)?,
                    appearances: row.get(5)?,
                    best_position: row.get(6)?,
                })
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(PublishedArtistRanking {
        total_artists,
        chart_weeks,
        total_entries,
        artists,
    })
}

pub fn weeks(conn: &Connection, chart: &str, year: i32) -> Result<Vec<PublishedChartWeek>> {
    let book = format!("{year}_us_singles");
    let mut statement = conn.prepare(
        "SELECT e.week_ending, COUNT(*) FROM published_chart_entries e
         JOIN published_chart_books b ON b.id = e.book_id
         WHERE b.book = ?1 AND b.chart = ?2
         GROUP BY e.week_ending ORDER BY e.week_ending",
    )?;
    let result = statement
        .query_map(params![book, chart], |row| {
            Ok(PublishedChartWeek {
                week_ending: row.get(0)?,
                rows: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load chart weeks")?;
    Ok(result)
}

pub fn entries(
    conn: &Connection,
    chart: &str,
    week: &str,
    offset: u32,
) -> Result<PublishedChartEntries> {
    let date = NaiveDate::parse_from_str(week, "%Y-%m-%d").context("Choose a valid chart date")?;
    let book = format!("{}_us_singles", date.format("%Y"));
    let book_id = conn
        .query_row(
            "SELECT id FROM published_chart_books WHERE book = ?1 AND chart = ?2",
            params![book, chart],
            |row| row.get::<_, i64>(0),
        )
        .optional()?;
    let Some(book_id) = book_id else {
        return Ok(PublishedChartEntries {
            total_rows: 0,
            entries: Vec::new(),
        });
    };
    let total_rows = conn.query_row(
        "SELECT COUNT(*) FROM published_chart_entries WHERE book_id = ?1 AND week_ending = ?2",
        params![book_id, week],
        |row| row.get(0),
    )?;
    let mut statement = conn.prepare(
        "SELECT id, position, last_week, weeks_on_chart, entry_status, movement, title,
                artist, number_one_marker, label, format, catalogue_number, release_type,
                duration, peak_position, entry_date, peak_date, bpi_award, source_page
         FROM published_chart_entries WHERE book_id = ?1 AND week_ending = ?2
         ORDER BY position, source_row LIMIT 100 OFFSET ?3",
    )?;
    let entries = statement
        .query_map(params![book_id, week, offset], |row| {
            Ok(PublishedChartEntry {
                id: row.get(0)?,
                position: row.get(1)?,
                last_week: row.get(2)?,
                weeks_on_chart: row.get(3)?,
                entry_status: row.get(4)?,
                movement: row.get(5)?,
                title: row.get(6)?,
                artist: row.get(7)?,
                number_one_marker: row.get(8)?,
                label: row.get(9)?,
                format: row.get(10)?,
                catalogue_number: row.get(11)?,
                release_type: row.get(12)?,
                duration: row.get(13)?,
                peak_position: row.get(14)?,
                entry_date: row.get(15)?,
                peak_date: row.get(16)?,
                bpi_award: row.get(17)?,
                source_page: row.get(18)?,
                book: book.clone(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(PublishedChartEntries {
        total_rows,
        entries,
    })
}

#[cfg(not(test))]
pub fn catalog_for_app(app: &AppHandle, source_path: &str) -> Result<PublishedChartCatalog> {
    let (conn, _) = crate::db::open(app)?;
    catalog_with_inventory(&conn, source_path)
}

#[cfg(not(test))]
pub fn artists_for_app(
    app: &AppHandle,
    chart: &str,
    from_year: i32,
    to_year: i32,
    from_week: Option<&str>,
    to_week: Option<&str>,
    offset: u32,
) -> Result<PublishedArtistRanking> {
    let (conn, _) = crate::db::open(app)?;
    artists(&conn, chart, from_year, to_year, from_week, to_week, offset)
}

#[cfg(not(test))]
pub fn weeks_for_app(app: &AppHandle, chart: &str, year: i32) -> Result<Vec<PublishedChartWeek>> {
    let (conn, _) = crate::db::open(app)?;
    weeks(&conn, chart, year)
}

#[cfg(not(test))]
pub fn entries_for_app(
    app: &AppHandle,
    chart: &str,
    week: &str,
    offset: u32,
) -> Result<PublishedChartEntries> {
    let (conn, _) = crate::db::open(app)?;
    entries(&conn, chart, week, offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(folder: &Path, row_count: usize) {
        let year = folder.join("2019_us_singles");
        fs::create_dir_all(&year).unwrap();
        fs::write(
            folder.join("chart_inventory.csv"),
            format!(
                "book,chart,first_week,last_week,weekly_charts,rows,first_page,last_page\n\
                 2019_us_singles,Billboard Hot 100,2019-01-05,2019-01-05,1,{row_count},137,137\n\
                 2019_us_singles,Rap Streaming Songs,2019-01-05,2019-01-05,1,1,4370,4370\n"
            ),
        )
        .unwrap();
        fs::write(
            year.join("2019_us_singles_validation.txt"),
            format!(
                "2019_us_singles: {} rows, 0 problems, 1 notes\n",
                row_count + 1
            ),
        )
        .unwrap();
        fs::write(
            year.join("2019_us_singles_all_charts.csv"),
            concat!(
                "book,chart,week_ending,position,last_week,weeks_on_chart,entry_status,movement,title,artist,number_one_marker,label,format,catalogue_number,release_type,duration,peak_position,entry_date,peak_date,bpi_award,source_page\n",
                "2019_us_singles,Billboard Hot 100,2019-01-05,1,,1,NEW,,Song A,Artist A,,Label,DL,USAAA1234567,S,03:00,1,2019-01-05,2019-01-05,,137\n",
                "2019_us_singles,Billboard Hot 100,2019-01-05,1,,1,NEW,,Song B,Artist B,,Label,DL,USBBB1234567,S,03:00,1,2019-01-05,2019-01-05,,137\n",
                "2019_us_singles,Rap Streaming Songs,2019-01-05,1,,1,NEW,,Song A,Artist A,,Label,DL,USAAA1234567,S,03:00,1,2019-01-05,2019-01-05,,4370\n"
            ),
        )
        .unwrap();
    }

    #[test]
    fn imports_distinct_series_and_preserves_printed_duplicate_positions() {
        let temp = tempfile::tempdir().unwrap();
        fixture(temp.path(), 2);
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_schema(&conn).unwrap();
        let available = catalog_with_inventory(&conn, temp.path().to_str().unwrap()).unwrap();
        assert_eq!(available.imported_years, 0);
        assert_eq!(available.inventory_years, 1);
        assert!(available.needs_import);
        assert_eq!(available.series.len(), 2);
        let summary = import_folder(&mut conn, temp.path(), |_| {}).unwrap();
        assert_eq!(summary.rows_imported, 3);
        assert!(
            !catalog_with_inventory(&conn, temp.path().to_str().unwrap())
                .unwrap()
                .needs_import
        );
        assert_eq!(catalog(&conn).unwrap().series.len(), 2);
        assert_eq!(weeks(&conn, "Billboard Hot 100", 2019).unwrap()[0].rows, 2);
        let chart = entries(&conn, "Billboard Hot 100", "2019-01-05", 0).unwrap();
        assert_eq!(chart.entries.len(), 2);
        assert_eq!(chart.entries[0].position, 1);
        assert_eq!(chart.entries[1].position, 1);
        assert_eq!(chart.entries[0].source_page, "137");

        fixture(temp.path(), 3);
        assert!(
            catalog_with_inventory(&conn, temp.path().to_str().unwrap())
                .unwrap()
                .needs_import
        );
        assert!(import_folder(&mut conn, temp.path(), |_| {}).is_err());
        assert_eq!(catalog(&conn).unwrap().total_rows, 3);
        assert_eq!(
            entries(&conn, "Billboard Hot 100", "2019-01-05", 0)
                .unwrap()
                .total_rows,
            2
        );
    }

    #[test]
    fn ranks_all_artist_credits_over_years_and_week_boundaries() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        for (id, year) in [(1, 2018), (2, 2019)] {
            conn.execute(
                "INSERT INTO published_chart_books
                 (id, book, chart, first_week, last_week, weekly_charts, row_count, first_page, last_page)
                 VALUES (?1, ?2, 'Billboard Hot 100', ?3, ?3, 1, 1, '1', '1')",
                params![id, format!("{year}_us_singles"), format!("{year}-01-06")],
            ).unwrap();
        }
        for (book_id, source_row, week, position, artist) in [
            (1, 1, "2018-01-06", 1, "Artist A"),
            (1, 2, "2018-01-06", 1, "Artist A"),
            (1, 3, "2018-01-06", 2, "Artist B"),
            (2, 1, "2019-01-05", 1, "Artist A"),
            (2, 2, "2019-01-05", 2, "Artist B"),
            (2, 3, "2019-01-12", 1, "Artist B"),
            (2, 4, "2019-01-12", 3, "Artist C"),
        ] {
            conn.execute(
                "INSERT INTO published_chart_entries
                 (book_id, source_row, week_ending, position, last_week, weeks_on_chart,
                  entry_status, movement, title, artist, number_one_marker, label, format,
                  catalogue_number, release_type, duration, peak_position, entry_date,
                  peak_date, bpi_award, source_page)
                 VALUES (?1, ?2, ?3, ?4, '', '', '', '', 'Song', ?5,
                         '', '', '', '', '', '', '', '', '', '', '')",
                params![book_id, source_row, week, position, artist],
            )
            .unwrap();
        }
        let all = artists(&conn, "Billboard Hot 100", 2018, 2019, None, None, 0).unwrap();
        assert_eq!(all.total_artists, 3);
        assert_eq!(all.chart_weeks, 3);
        assert_eq!(all.total_entries, 7);
        assert_eq!(
            all.artists
                .iter()
                .map(|item| item.artist.as_str())
                .collect::<Vec<_>>(),
            vec!["Artist A", "Artist B", "Artist C"]
        );
        assert_eq!(all.artists[0].number_one_weeks, 2);
        assert_eq!(all.artists[0].chart_weeks, 2);
        assert_eq!(all.artists[0].appearances, 3);
        let last_week = artists(
            &conn,
            "Billboard Hot 100",
            2019,
            2019,
            Some("2019-01-12"),
            Some("2019-01-12"),
            0,
        )
        .unwrap();
        assert_eq!(last_week.chart_weeks, 1);
        assert_eq!(last_week.total_artists, 2);
        assert_eq!(last_week.artists[0].artist, "Artist B");
        assert_eq!(last_week.artists[0].number_one_weeks, 1);
        assert!(artists(&conn, "Billboard Hot 100", 2019, 2018, None, None, 0).is_err());
        assert!(artists(
            &conn,
            "Billboard Hot 100",
            2019,
            2019,
            Some("2019-01-12"),
            Some("2019-01-05"),
            0
        )
        .is_err());
    }

    #[test]
    #[ignore = "uses the optional local Charts source"]
    fn imports_real_2019_chart_book_when_available() {
        let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../Charts");
        if !source
            .join("2019_us_singles/2019_us_singles_all_charts.csv")
            .is_file()
        {
            return;
        }
        let temp = tempfile::tempdir().unwrap();
        let year = temp.path().join("2019_us_singles");
        fs::create_dir_all(&year).unwrap();
        fs::copy(
            source.join("2019_us_singles/2019_us_singles_all_charts.csv"),
            year.join("2019_us_singles_all_charts.csv"),
        )
        .unwrap();
        fs::copy(
            source.join("2019_us_singles/2019_us_singles_validation.txt"),
            year.join("2019_us_singles_validation.txt"),
        )
        .unwrap();
        let mut inventory = csv::Reader::from_path(source.join("chart_inventory.csv")).unwrap();
        let mut output = csv::Writer::from_path(temp.path().join("chart_inventory.csv")).unwrap();
        output.write_record(inventory.headers().unwrap()).unwrap();
        for row in inventory.records() {
            let row = row.unwrap();
            if row.get(0) == Some("2019_us_singles") {
                output.write_record(&row).unwrap();
            }
        }
        output.flush().unwrap();
        let mut conn = Connection::open(temp.path().join("published.sqlite3")).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        ensure_schema(&conn).unwrap();
        let summary = import_folder(&mut conn, temp.path(), |_| {}).unwrap();
        assert_eq!(summary.rows_imported, 82_089);
        assert_eq!(summary.chart_series, 48);
        assert_eq!(
            entries(&conn, "Billboard Hot 100", "2019-01-05", 0)
                .unwrap()
                .total_rows,
            100
        );
        let started = Instant::now();
        let ranking = artists(&conn, "Billboard Hot 100", 2019, 2019, None, None, 0).unwrap();
        assert_eq!(ranking.chart_weeks, 52);
        assert_eq!(ranking.total_entries, 5_200);
        assert!(ranking.total_artists > 100);
        eprintln!("2019 Hot 100 artist ranking: {:?}", started.elapsed());
    }
}
