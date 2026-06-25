use crate::db;
use crate::models::{ImportProgress, ImportSummary};
use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use csv::StringRecord;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

const BACKUP_RETENTION: usize = 3;

const REQUIRED_COLUMNS: [&str; 17] = [
    "Display Artist",
    "Album Rating",
    "Disc#",
    "Album",
    "Genre",
    "Love",
    "Publisher",
    "Rating",
    "Title",
    "Track#",
    "Year",
    "Release Year",
    "<Album Unique Id>",
    "<File Path>",
    "<Filename>",
    "Album Artist (display)",
    "Time",
];

#[derive(Debug, Clone)]
struct HeaderMap {
    display_artist: usize,
    album_rating: usize,
    disc_number: usize,
    album: usize,
    genre: usize,
    love: usize,
    publisher: usize,
    rating: usize,
    title: usize,
    track_number: usize,
    year: usize,
    release_year: usize,
    album_unique_id: usize,
    file_path: usize,
    filename: usize,
    album_artist_display: usize,
    time: usize,
}

#[derive(Debug, Clone)]
struct TrackRow {
    display_artist: String,
    album_rating_raw: String,
    disc_number_raw: String,
    album: String,
    genre: String,
    canonical_genre: String,
    genre_normalized: String,
    love: String,
    publisher: String,
    rating_raw: String,
    title: String,
    track_number_raw: String,
    year_raw: String,
    release_year_raw: String,
    album_unique_id: String,
    file_path: String,
    filename: String,
    album_artist_display: String,
    time_raw: String,
    normalized_rating: Option<i32>,
    track_rating_value: Option<i32>,
    album_rating: Option<i32>,
    disc_number: Option<i32>,
    track_number: Option<i32>,
    year: Option<i32>,
    release_year: Option<i32>,
    time_seconds: Option<i64>,
    album_id: String,
    row_hash: String,
}

#[derive(Debug, Clone)]
struct AlbumAggregate {
    album_id: String,
    album_unique_id: Option<String>,
    album: Option<String>,
    album_artist_display: Option<String>,
    canonical_genre: Option<String>,
    genre_normalized: Option<String>,
    publisher: Option<String>,
    year: Option<i32>,
    release_year: Option<i32>,
    album_rating: Option<i32>,
    total_tracks: u32,
    rated_tracks: u32,
    normalized_rating_sum: i64,
    total_seconds: i64,
    loved_tracks: u32,
    tmoe_seconds: i64,
}

#[derive(Debug, Clone)]
struct FinalAlbum {
    album_id: String,
    album_unique_id: Option<String>,
    album: Option<String>,
    album_artist_display: Option<String>,
    canonical_genre: Option<String>,
    genre_normalized: Option<String>,
    publisher: Option<String>,
    year: Option<i32>,
    release_year: Option<i32>,
    total_tracks: u32,
    rated_tracks: u32,
    rating_completeness: f64,
    total_seconds: i64,
    loved_tracks: u32,
    tmoe_seconds: i64,
    ae_ratio: f64,
    album_rating: Option<i32>,
    calculated_album_rating: Option<i32>,
    effective_album_rating: Option<i32>,
    album_score: Option<f64>,
}

pub fn import_musicbee_tsv(app: AppHandle, source_path: String) -> Result<ImportSummary> {
    let started = Instant::now();
    let (mut conn, db_path) = db::open(&app)?;
    let source_path = resolve_source_path(&source_path)?;
    let source_metadata = fs::metadata(&source_path)
        .with_context(|| format!("Could not read metadata for {}", source_path.display()))?;
    let source_size_bytes = source_metadata.len() as i64;

    emit_progress(
        &app,
        "starting",
        0,
        0,
        "Creating a database backup before import.",
    );
    let backup_path = create_backup(&conn, &db_path, &source_path, source_size_bytes)?;
    let backup_path_text = backup_path.as_ref().map(|path| path.display().to_string());

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO import_runs (
            source_path, source_size_bytes, started_at, status, backup_path
        ) VALUES (?1, ?2, ?3, 'running', ?4)
        ",
        params![
            source_path.display().to_string(),
            source_size_bytes,
            now,
            backup_path_text
        ],
    )
    .context("Could not create import run")?;
    let import_run_id = conn.last_insert_rowid();

    let import_result = run_import(&app, &mut conn, import_run_id, &source_path);

    match import_result {
        Ok((track_rows, album_count)) => {
            let duration_ms = started.elapsed().as_millis();
            let completed_at = Utc::now().to_rfc3339();
            conn.execute(
                "
                UPDATE import_runs
                SET completed_at = ?1,
                    status = 'completed',
                    track_rows = ?2,
                    album_count = ?3,
                    duration_ms = ?4
                WHERE id = ?5
                ",
                params![
                    completed_at,
                    track_rows as i64,
                    album_count as i64,
                    duration_ms as i64,
                    import_run_id
                ],
            )
            .context("Could not update completed import run")?;

            emit_progress(
                &app,
                "completed",
                track_rows,
                album_count,
                "Import completed and album calculations refreshed.",
            );

            Ok(ImportSummary {
                import_run: db::get_import_run(&conn, import_run_id)?,
                track_rows,
                album_count,
                duration_ms,
                backup_path: backup_path_text,
            })
        }
        Err(error) => {
            let duration_ms = started.elapsed().as_millis() as i64;
            let message = error.to_string();
            let _ = conn.execute(
                "
                UPDATE import_runs
                SET completed_at = ?1,
                    status = 'failed',
                    duration_ms = ?2,
                    error_message = ?3
                WHERE id = ?4
                ",
                params![Utc::now().to_rfc3339(), duration_ms, message, import_run_id],
            );
            emit_progress(&app, "failed", 0, 0, "Import failed.");
            Err(error)
        }
    }
}

fn run_import(
    app: &AppHandle,
    conn: &mut Connection,
    import_run_id: i64,
    source_path: &Path,
) -> Result<(u64, u64)> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(b'\t')
        .flexible(true)
        .from_path(source_path)
        .with_context(|| format!("Could not open TSV source {}", source_path.display()))?;

    let headers = reader
        .headers()
        .context("Could not read TSV header")?
        .clone();
    let header_map = HeaderMap::from_headers(&headers)?;

    let tx = conn
        .transaction()
        .context("Could not start import transaction")?;
    tx.execute_batch(
        "
        DELETE FROM raw_tracks;
        DELETE FROM tracks;
        DELETE FROM albums;
        ",
    )
    .context("Could not clear previous import tables")?;

    let mut albums: HashMap<String, AlbumAggregate> = HashMap::new();
    let mut processed_rows = 0_u64;

    {
        let mut insert_raw = tx.prepare(
            "
            INSERT INTO raw_tracks (
                import_run_id, row_number, display_artist, album_rating, disc_number,
                album, genre, love, publisher, rating, title, track_number, year_value,
                release_year, album_unique_id, file_path, filename, album_artist_display,
                time_value, row_hash
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
            )
            ",
        )?;

        let mut insert_track = tx.prepare(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist, album_artist_display,
                album, title, genre, canonical_genre, genre_normalized, publisher, love,
                rating_raw, normalized_rating, album_rating_raw, album_rating, disc_number,
                track_number, year, release_year, time_seconds, file_path, filename, row_hash
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24
            )
            ",
        )?;

        for result in reader.records() {
            let record = result.context("Could not read TSV record")?;
            processed_rows += 1;
            let track = TrackRow::from_record(&record, &header_map)?;

            insert_raw.execute(params![
                import_run_id,
                processed_rows as i64,
                &track.display_artist,
                &track.album_rating_raw,
                &track.disc_number_raw,
                &track.album,
                &track.genre,
                &track.love,
                &track.publisher,
                &track.rating_raw,
                &track.title,
                &track.track_number_raw,
                &track.year_raw,
                &track.release_year_raw,
                &track.album_unique_id,
                &track.file_path,
                &track.filename,
                &track.album_artist_display,
                &track.time_raw,
                &track.row_hash,
            ])?;

            insert_track.execute(params![
                import_run_id,
                &track.album_id,
                empty_to_none(&track.album_unique_id),
                empty_to_none(&track.display_artist),
                empty_to_none(&track.album_artist_display),
                empty_to_none(&track.album),
                empty_to_none(&track.title),
                empty_to_none(&track.genre),
                empty_to_none(&track.canonical_genre),
                empty_to_none(&track.genre_normalized),
                empty_to_none(&track.publisher),
                empty_to_none(&track.love),
                empty_to_none(&track.rating_raw),
                track.normalized_rating,
                empty_to_none(&track.album_rating_raw),
                track.album_rating,
                track.disc_number,
                track.track_number,
                track.year,
                track.release_year,
                track.time_seconds,
                empty_to_none(&track.file_path),
                empty_to_none(&track.filename),
                &track.row_hash,
            ])?;

            albums
                .entry(track.album_id.clone())
                .or_insert_with(|| AlbumAggregate::new(&track))
                .apply(&track);

            if processed_rows % 10_000 == 0 {
                emit_progress(
                    app,
                    "running",
                    processed_rows,
                    albums.len() as u64,
                    "Streaming TSV rows into SQLite.",
                );
            }
        }
    }

    {
        let mut insert_album = tx.prepare(
            "
            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                canonical_genre, genre_normalized, publisher, year, release_year,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, album_rating,
                calculated_album_rating, effective_album_rating, album_score
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
            )
            ",
        )?;

        for album in albums.values() {
            let final_album = album.finalize();
            insert_album.execute(params![
                final_album.album_id,
                import_run_id,
                final_album.album_unique_id,
                final_album.album,
                final_album.album_artist_display,
                final_album.canonical_genre,
                final_album.genre_normalized,
                final_album.publisher,
                final_album.year,
                final_album.release_year,
                final_album.total_tracks,
                final_album.rated_tracks,
                final_album.rating_completeness,
                final_album.total_seconds,
                final_album.loved_tracks,
                final_album.tmoe_seconds,
                final_album.ae_ratio,
                final_album.album_rating,
                final_album.calculated_album_rating,
                final_album.effective_album_rating,
                final_album.album_score,
            ])?;
        }
    }

    tx.commit().context("Could not commit import transaction")?;
    Ok((processed_rows, albums.len() as u64))
}

impl HeaderMap {
    fn from_headers(headers: &StringRecord) -> Result<Self> {
        for required in REQUIRED_COLUMNS {
            if !headers.iter().any(|header| header == required) {
                bail!("Missing required TSV column: {required}");
            }
        }

        Ok(Self {
            display_artist: header_index(headers, "Display Artist")?,
            album_rating: header_index(headers, "Album Rating")?,
            disc_number: header_index(headers, "Disc#")?,
            album: header_index(headers, "Album")?,
            genre: header_index(headers, "Genre")?,
            love: header_index(headers, "Love")?,
            publisher: header_index(headers, "Publisher")?,
            rating: header_index(headers, "Rating")?,
            title: header_index(headers, "Title")?,
            track_number: header_index(headers, "Track#")?,
            year: header_index(headers, "Year")?,
            release_year: header_index(headers, "Release Year")?,
            album_unique_id: header_index(headers, "<Album Unique Id>")?,
            file_path: header_index(headers, "<File Path>")?,
            filename: header_index(headers, "<Filename>")?,
            album_artist_display: header_index(headers, "Album Artist (display)")?,
            time: header_index(headers, "Time")?,
        })
    }
}

impl TrackRow {
    fn from_record(record: &StringRecord, headers: &HeaderMap) -> Result<Self> {
        let display_artist = clean_field(record.get(headers.display_artist));
        let album_rating_raw = clean_field(record.get(headers.album_rating));
        let disc_number_raw = clean_field(record.get(headers.disc_number));
        let album = clean_field(record.get(headers.album));
        let genre = clean_field(record.get(headers.genre));
        let love = clean_field(record.get(headers.love));
        let publisher = clean_field(record.get(headers.publisher));
        let rating_raw = clean_field(record.get(headers.rating));
        let title = clean_field(record.get(headers.title));
        let track_number_raw = clean_field(record.get(headers.track_number));
        let year_raw = clean_field(record.get(headers.year));
        let release_year_raw = clean_field(record.get(headers.release_year));
        let album_unique_id = clean_field(record.get(headers.album_unique_id));
        let file_path = clean_field(record.get(headers.file_path));
        let filename = clean_field(record.get(headers.filename));
        let album_artist_display = clean_field(record.get(headers.album_artist_display));
        let time_raw = clean_field(record.get(headers.time));

        let canonical_genre = canonical_genre(&genre);
        let genre_normalized = normalize_text(&canonical_genre);
        let normalized_rating = normalize_track_rating(&rating_raw);
        let track_rating_value = parse_track_rating(&rating_raw);
        let album_rating = parse_album_rating(&album_rating_raw);
        let disc_number = parse_whole_number(&disc_number_raw);
        let track_number = parse_whole_number(&track_number_raw);
        let year = parse_whole_number(&year_raw);
        let release_year = parse_whole_number(&release_year_raw);
        let time_seconds = parse_time_seconds(&time_raw);
        let album_id = album_identity(
            &album_unique_id,
            &album_artist_display,
            &album,
            year,
            &file_path,
        );
        let row_hash = row_hash(&[
            &display_artist,
            &album_rating_raw,
            &disc_number_raw,
            &album,
            &genre,
            &love,
            &publisher,
            &rating_raw,
            &title,
            &track_number_raw,
            &year_raw,
            &release_year_raw,
            &album_unique_id,
            &file_path,
            &filename,
            &album_artist_display,
            &time_raw,
        ]);

        Ok(Self {
            display_artist,
            album_rating_raw,
            disc_number_raw,
            album,
            genre,
            canonical_genre,
            genre_normalized,
            love,
            publisher,
            rating_raw,
            title,
            track_number_raw,
            year_raw,
            release_year_raw,
            album_unique_id,
            file_path,
            filename,
            album_artist_display,
            time_raw,
            normalized_rating,
            track_rating_value,
            album_rating,
            disc_number,
            track_number,
            year,
            release_year,
            time_seconds,
            album_id,
            row_hash,
        })
    }
}

impl AlbumAggregate {
    fn new(track: &TrackRow) -> Self {
        Self {
            album_id: track.album_id.clone(),
            album_unique_id: empty_to_none(&track.album_unique_id).map(str::to_string),
            album: empty_to_none(&track.album).map(str::to_string),
            album_artist_display: empty_to_none(&track.album_artist_display).map(str::to_string),
            canonical_genre: empty_to_none(&track.canonical_genre).map(str::to_string),
            genre_normalized: empty_to_none(&track.genre_normalized).map(str::to_string),
            publisher: empty_to_none(&track.publisher).map(str::to_string),
            year: track.year,
            release_year: track.release_year,
            album_rating: track.album_rating,
            total_tracks: 0,
            rated_tracks: 0,
            normalized_rating_sum: 0,
            total_seconds: 0,
            loved_tracks: 0,
            tmoe_seconds: 0,
        }
    }

    fn apply(&mut self, track: &TrackRow) {
        self.total_tracks += 1;

        if self.album.is_none() {
            self.album = empty_to_none(&track.album).map(str::to_string);
        }
        if self.album_artist_display.is_none() {
            self.album_artist_display =
                empty_to_none(&track.album_artist_display).map(str::to_string);
        }
        if self.canonical_genre.is_none() {
            self.canonical_genre = empty_to_none(&track.canonical_genre).map(str::to_string);
        }
        if self.genre_normalized.is_none() {
            self.genre_normalized = empty_to_none(&track.genre_normalized).map(str::to_string);
        }
        if self.publisher.is_none() {
            self.publisher = empty_to_none(&track.publisher).map(str::to_string);
        }
        if self.year.is_none() {
            self.year = track.year;
        }
        if self.release_year.is_none() {
            self.release_year = track.release_year;
        }
        if self.album_rating.is_none() {
            self.album_rating = track.album_rating;
        }

        if let Some(normalized_rating) = track.normalized_rating {
            self.rated_tracks += 1;
            self.normalized_rating_sum += i64::from(normalized_rating);
        }

        if let Some(time_seconds) = track.time_seconds {
            self.total_seconds += time_seconds;
            if track.track_rating_value == Some(5) {
                self.tmoe_seconds += time_seconds;
            }
        }

        if track.love == "L" {
            self.loved_tracks += 1;
        }
    }

    fn finalize(&self) -> FinalAlbum {
        let rating_completeness = if self.total_tracks == 0 {
            0.0
        } else {
            f64::from(self.rated_tracks) / f64::from(self.total_tracks)
        };

        let calculated_album_rating = if self.total_tracks > 0
            && self.total_tracks == self.rated_tracks
        {
            Some((self.normalized_rating_sum as f64 / f64::from(self.rated_tracks)).round() as i32)
        } else {
            None
        };

        let effective_album_rating = self.album_rating.or(calculated_album_rating);
        let ae_ratio = if self.total_seconds > 0 {
            self.tmoe_seconds as f64 / self.total_seconds as f64
        } else {
            0.0
        };
        let tmoe_minutes = self.tmoe_seconds as f64 / 60.0;
        let album_score = effective_album_rating.map(|rating| {
            ((rating as f64 * 0.5) + (ae_ratio * 100.0) + (tmoe_minutes * 0.3)) / 10.0
                + (f64::from(self.loved_tracks) * 100.0)
        });

        FinalAlbum {
            album_id: self.album_id.clone(),
            album_unique_id: self.album_unique_id.clone(),
            album: self.album.clone(),
            album_artist_display: self.album_artist_display.clone(),
            canonical_genre: self.canonical_genre.clone(),
            genre_normalized: self.genre_normalized.clone(),
            publisher: self.publisher.clone(),
            year: self.year,
            release_year: self.release_year,
            total_tracks: self.total_tracks,
            rated_tracks: self.rated_tracks,
            rating_completeness,
            total_seconds: self.total_seconds,
            loved_tracks: self.loved_tracks,
            tmoe_seconds: self.tmoe_seconds,
            ae_ratio,
            album_rating: self.album_rating,
            calculated_album_rating,
            effective_album_rating,
            album_score,
        }
    }
}

fn create_backup(
    conn: &Connection,
    db_path: &Path,
    source_path: &Path,
    source_size_bytes: i64,
) -> Result<Option<PathBuf>> {
    conn.execute_batch("PRAGMA wal_checkpoint(FULL);")
        .context("Could not checkpoint SQLite WAL before backup")?;

    if !db_path.exists() {
        return Ok(None);
    }

    let backup_dir = db_path
        .parent()
        .ok_or_else(|| anyhow!("Database path has no parent directory"))?
        .join("backups");
    fs::create_dir_all(&backup_dir).context("Could not create backup directory")?;

    let backup_path = backup_dir.join(format!(
        "music-library-{}-before-import.sqlite3",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    fs::copy(db_path, &backup_path).with_context(|| {
        format!(
            "Could not create database backup from {} to {}",
            db_path.display(),
            backup_path.display()
        )
    })?;

    conn.execute(
        "
        INSERT INTO database_backups (
            created_at, operation, source_path, source_size_bytes, backup_path
        ) VALUES (?1, 'import', ?2, ?3, ?4)
        ",
        params![
            Utc::now().to_rfc3339(),
            source_path.display().to_string(),
            source_size_bytes,
            backup_path.display().to_string()
        ],
    )
    .context("Could not record database backup metadata")?;

    enforce_backup_retention(&backup_dir)?;
    Ok(Some(backup_path))
}

fn enforce_backup_retention(backup_dir: &Path) -> Result<()> {
    let mut backups = fs::read_dir(backup_dir)
        .with_context(|| format!("Could not read backup directory {}", backup_dir.display()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|extension| extension == "sqlite3")
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    backups.sort_by_key(|entry| {
        entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    backups.reverse();

    for stale in backups.into_iter().skip(BACKUP_RETENTION) {
        fs::remove_file(stale.path())
            .with_context(|| format!("Could not remove stale backup {}", stale.path().display()))?;
    }

    Ok(())
}

fn resolve_source_path(source_path: &str) -> Result<PathBuf> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        bail!("Choose a TSV source path before starting import");
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
        .ok_or_else(|| anyhow!("Could not find TSV source path: {source_path}"))
}

fn header_index(headers: &StringRecord, name: &str) -> Result<usize> {
    headers
        .iter()
        .position(|header| header == name)
        .ok_or_else(|| anyhow!("Missing required TSV column: {name}"))
}

fn clean_field(value: Option<&str>) -> String {
    value.unwrap_or_default().trim().to_string()
}

fn empty_to_none(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn canonical_genre(genre: &str) -> String {
    genre
        .split(|character| character == ';' || character == '|')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn normalize_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_whole_number(value: &str) -> Option<i32> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let parsed = trimmed.parse::<f64>().ok()?;
    if parsed.is_finite() && parsed.fract() == 0.0 {
        Some(parsed as i32)
    } else {
        None
    }
}

fn parse_track_rating(value: &str) -> Option<i32> {
    let rating = parse_whole_number(value)?;
    if (0..=5).contains(&rating) {
        Some(rating)
    } else {
        None
    }
}

fn normalize_track_rating(value: &str) -> Option<i32> {
    parse_track_rating(value).map(|rating| rating * 20)
}

fn parse_album_rating(value: &str) -> Option<i32> {
    let rating = parse_whole_number(value)?;
    if (0..=100).contains(&rating) {
        Some(rating)
    } else {
        None
    }
}

fn parse_time_seconds(value: &str) -> Option<i64> {
    let parts = value
        .trim()
        .split(':')
        .map(|part| part.parse::<i64>().ok())
        .collect::<Option<Vec<_>>>()?;

    match parts.as_slice() {
        [minutes, seconds] if (0..60).contains(seconds) => Some(minutes * 60 + seconds),
        [hours, minutes, seconds] if (0..60).contains(minutes) && (0..60).contains(seconds) => {
            Some(hours * 3600 + minutes * 60 + seconds)
        }
        _ => None,
    }
}

fn album_identity(
    album_unique_id: &str,
    album_artist: &str,
    album: &str,
    year: Option<i32>,
    file_path: &str,
) -> String {
    if let Some(unique_id) = empty_to_none(album_unique_id) {
        return format!("mb:{unique_id}");
    }

    format!(
        "fallback:{}::{}::{}::{}",
        normalize_text(album_artist),
        normalize_text(album),
        year.map(|value| value.to_string()).unwrap_or_default(),
        normalize_text(&path_root(file_path))
    )
}

fn path_root(file_path: &str) -> String {
    let normalized = file_path.replace('/', "\\");
    let mut parts = normalized.split('\\').filter(|part| !part.is_empty());
    match (parts.next(), parts.next()) {
        (Some(drive), Some(first_dir)) if drive.ends_with(':') => format!("{drive}\\{first_dir}"),
        (Some(first), _) => first.to_string(),
        _ => String::new(),
    }
}

fn row_hash(values: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for value in values {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    hex::encode(hasher.finalize())
}

fn emit_progress(
    app: &AppHandle,
    status: &str,
    processed_rows: u64,
    album_count: u64,
    message: &str,
) {
    let _ = app.emit(
        "import-progress",
        ImportProgress {
            status: status.to_string(),
            processed_rows,
            album_count,
            message: message.to_string(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_musicbee_time_values() {
        assert_eq!(parse_time_seconds("4:05"), Some(245));
        assert_eq!(parse_time_seconds("1:02:03"), Some(3723));
        assert_eq!(parse_time_seconds("4:65"), None);
    }

    #[test]
    fn normalizes_only_whole_track_ratings() {
        assert_eq!(normalize_track_rating("5"), Some(100));
        assert_eq!(normalize_track_rating("5.0"), Some(100));
        assert_eq!(normalize_track_rating("0"), Some(0));
        assert_eq!(normalize_track_rating("3.5"), None);
        assert_eq!(normalize_track_rating("6"), None);
    }

    #[test]
    fn calculates_album_score_with_spec_formula() {
        let album = AlbumAggregate {
            album_id: "mb:test".to_string(),
            album_unique_id: Some("test".to_string()),
            album: Some("Album".to_string()),
            album_artist_display: Some("Artist".to_string()),
            canonical_genre: Some("Synthpop".to_string()),
            genre_normalized: Some("synthpop".to_string()),
            publisher: None,
            year: Some(1987),
            release_year: Some(1987),
            album_rating: Some(65),
            total_tracks: 10,
            rated_tracks: 10,
            normalized_rating_sum: 650,
            total_seconds: 2820,
            loved_tracks: 2,
            tmoe_seconds: 840,
        };

        let final_album = album.finalize();
        assert_eq!(final_album.rating_completeness, 1.0);
        assert_eq!(final_album.effective_album_rating, Some(65));
        assert_eq!(final_album.tmoe_seconds, 840);
        assert_eq!(final_album.loved_tracks, 2);
        assert_eq!(
            final_album
                .album_score
                .map(|score| (score * 1000.0).round() / 1000.0),
            Some(206.649)
        );
    }
}
