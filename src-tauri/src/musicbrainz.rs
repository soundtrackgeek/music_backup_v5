use crate::db;
use crate::models::{MusicBrainzCacheStatus, MusicBrainzCacheWarningExample};
use anyhow::{Context, Result};
use rusqlite::{params, Connection, OpenFlags};
use std::collections::HashSet;
use std::fs;
#[cfg(test)]
use std::path::Path;
use std::path::PathBuf;
#[cfg(not(test))]
use tauri::AppHandle;

const DEFAULT_CACHE_PATH: &str = "MusicBrainz/musicbrainz_cache.db";
const SUSPICIOUS_RELEASE_GROUP_THRESHOLD: i64 = 150;

#[cfg(not(test))]
pub fn cache_status_for_app(
    app: &AppHandle,
    cache_path: Option<String>,
) -> Result<MusicBrainzCacheStatus> {
    let path = match cache_path {
        Some(path) => path,
        None => db::settings_for_app(app)?.musicbrainz_cache_path,
    };
    cache_status_for_path(Some(path))
}

pub fn cache_status_for_path(cache_path: Option<String>) -> Result<MusicBrainzCacheStatus> {
    let cache_path = normalize_cache_path(cache_path);
    let resolved_path = resolve_cache_path(&cache_path)
        .with_context(|| format!("Could not resolve MusicBrainz cache path {cache_path}"))?;
    let resolved_path_text = resolved_path.display().to_string();

    let metadata = match fs::metadata(&resolved_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(empty_status(
                cache_path,
                resolved_path_text,
                "unavailable",
                "MusicBrainz cache file was not found.",
                false,
            ));
        }
        Err(error) => {
            return Ok(empty_status(
                cache_path,
                resolved_path_text,
                "invalid",
                &format!("Could not inspect MusicBrainz cache file: {error}"),
                false,
            ));
        }
    };

    if !metadata.is_file() {
        return Ok(empty_status(
            cache_path,
            resolved_path_text,
            "invalid",
            "MusicBrainz cache path is not a file.",
            true,
        ));
    }

    let file_size_bytes = metadata.len() as i64;
    let conn = match Connection::open_with_flags(
        &resolved_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        Ok(conn) => conn,
        Err(error) => {
            return Ok(invalid_status(
                cache_path,
                resolved_path_text,
                file_size_bytes,
                &format!("Could not open MusicBrainz cache read-only: {error}"),
            ));
        }
    };

    if let Err(error) = validate_cache_schema(&conn) {
        return Ok(invalid_status(
            cache_path,
            resolved_path_text,
            file_size_bytes,
            &error.to_string(),
        ));
    }

    match read_cache_status(
        cache_path.clone(),
        resolved_path_text.clone(),
        file_size_bytes,
        &conn,
    ) {
        Ok(status) => Ok(status),
        Err(error) => Ok(invalid_status(
            cache_path,
            resolved_path_text,
            file_size_bytes,
            &format!("Could not query MusicBrainz cache: {error}"),
        )),
    }
}

fn read_cache_status(
    cache_path: String,
    resolved_path: String,
    file_size_bytes: i64,
    conn: &Connection,
) -> Result<MusicBrainzCacheStatus> {
    let artist_count = count_rows(conn, "artist_cache")?;
    let distinct_mbid_count: i64 = conn
        .query_row(
            "
            SELECT COUNT(DISTINCT mbid)
            FROM artist_cache
            WHERE mbid IS NOT NULL AND TRIM(mbid) <> ''
            ",
            [],
            |row| row.get(0),
        )
        .context("Could not count distinct MusicBrainz artist MBIDs")?;
    let release_group_count = count_rows(conn, "release_groups")?;
    let official_release_group_count: i64 = conn
        .query_row(
            "
            SELECT COUNT(*)
            FROM release_groups
            WHERE status = 'Official'
            ",
            [],
            |row| row.get(0),
        )
        .context("Could not count official MusicBrainz release groups")?;
    let pure_album_release_group_count: i64 = conn
        .query_row(
            "
            SELECT COUNT(*)
            FROM release_groups
            WHERE status = 'Official'
              AND type = 'Album'
              AND COALESCE(secondary_types, '') = ''
            ",
            [],
            |row| row.get(0),
        )
        .context("Could not count pure official MusicBrainz album release groups")?;
    let duplicate_mbid_count: i64 = conn
        .query_row(
            "
            SELECT COUNT(*)
            FROM (
                SELECT mbid
                FROM artist_cache
                WHERE mbid IS NOT NULL AND TRIM(mbid) <> ''
                GROUP BY mbid
                HAVING COUNT(DISTINCT name) > 1
            )
            ",
            [],
            |row| row.get(0),
        )
        .context("Could not count duplicate MusicBrainz MBID mappings")?;
    let suspicious_mapping_count = suspicious_mapping_count(conn)?;
    let warning_examples = warning_examples(conn)?;
    let (release_year_min, release_year_max) = release_year_range(conn)?;
    let (cache_date_min, cache_date_max) = cache_date_range(conn)?;
    let has_warnings = suspicious_mapping_count > 0;
    let state = if has_warnings { "warning" } else { "available" }.to_string();
    let message = if has_warnings {
        format!(
            "Cache is readable, with {suspicious_mapping_count} artist mapping warnings to review."
        )
    } else {
        "Cache is readable and no duplicate/high-volume artist mapping warnings were found."
            .to_string()
    };

    Ok(MusicBrainzCacheStatus {
        cache_path,
        resolved_path,
        exists: true,
        valid: true,
        state,
        message,
        file_size_bytes,
        artist_count,
        distinct_mbid_count,
        duplicate_mbid_count,
        suspicious_mapping_count,
        release_group_count,
        official_release_group_count,
        pure_album_release_group_count,
        release_year_min,
        release_year_max,
        cache_date_min,
        cache_date_max,
        warning_examples,
    })
}

fn validate_cache_schema(conn: &Connection) -> Result<()> {
    require_columns(conn, "artist_cache", &["name", "mbid", "cached_at"])?;
    require_columns(
        conn,
        "release_groups",
        &[
            "artist_mbid",
            "release_mbid",
            "title",
            "year",
            "type",
            "secondary_types",
            "track_count",
            "status",
            "cached_at",
        ],
    )?;
    Ok(())
}

fn require_columns(conn: &Connection, table: &str, required_columns: &[&str]) -> Result<()> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&sql)
        .with_context(|| format!("Could not inspect MusicBrainz cache table {table}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<HashSet<_>>>()
        .with_context(|| format!("Could not read MusicBrainz cache columns for {table}"))?;

    if columns.is_empty() {
        anyhow::bail!("MusicBrainz cache is missing table {table}");
    }

    for column in required_columns {
        if !columns.contains(*column) {
            anyhow::bail!("MusicBrainz cache table {table} is missing column {column}");
        }
    }

    Ok(())
}

fn count_rows(conn: &Connection, table: &str) -> Result<i64> {
    let sql = format!("SELECT COUNT(*) FROM {table}");
    conn.query_row(&sql, [], |row| row.get(0))
        .with_context(|| format!("Could not count MusicBrainz cache table {table}"))
}

fn suspicious_mapping_count(conn: &Connection) -> Result<i64> {
    conn.query_row(
        "
        WITH name_stats AS (
            SELECT mbid, COUNT(DISTINCT name) AS cached_name_count
            FROM artist_cache
            WHERE mbid IS NOT NULL AND TRIM(mbid) <> ''
            GROUP BY mbid
        ),
        release_stats AS (
            SELECT artist_mbid AS mbid, COUNT(*) AS release_group_count
            FROM release_groups
            GROUP BY artist_mbid
        )
        SELECT COUNT(*)
        FROM name_stats
        LEFT JOIN release_stats USING (mbid)
        WHERE cached_name_count > 1
           OR COALESCE(release_group_count, 0) >= ?1
        ",
        params![SUSPICIOUS_RELEASE_GROUP_THRESHOLD],
        |row| row.get(0),
    )
    .context("Could not count suspicious MusicBrainz artist mappings")
}

fn warning_examples(conn: &Connection) -> Result<Vec<MusicBrainzCacheWarningExample>> {
    let mut stmt = conn
        .prepare(
            "
            WITH name_stats AS (
                SELECT mbid, COUNT(DISTINCT name) AS cached_name_count
                FROM artist_cache
                WHERE mbid IS NOT NULL AND TRIM(mbid) <> ''
                GROUP BY mbid
            ),
            release_stats AS (
                SELECT artist_mbid AS mbid, COUNT(*) AS release_group_count
                FROM release_groups
                GROUP BY artist_mbid
            )
            SELECT
                name_stats.mbid,
                name_stats.cached_name_count,
                COALESCE(release_stats.release_group_count, 0) AS release_group_count
            FROM name_stats
            LEFT JOIN release_stats USING (mbid)
            WHERE cached_name_count > 1
               OR COALESCE(release_stats.release_group_count, 0) >= ?1
            ORDER BY release_group_count DESC, cached_name_count DESC, name_stats.mbid
            LIMIT 6
            ",
        )
        .context("Could not prepare MusicBrainz warning example query")?;
    let rows = stmt
        .query_map(params![SUSPICIOUS_RELEASE_GROUP_THRESHOLD], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz warning examples")?;

    rows.into_iter()
        .map(|(mbid, cached_name_count, release_group_count)| {
            Ok(MusicBrainzCacheWarningExample {
                cached_names: cached_names_for_mbid(conn, &mbid)?,
                mbid,
                cached_name_count,
                release_group_count,
            })
        })
        .collect()
}

fn cached_names_for_mbid(conn: &Connection, mbid: &str) -> Result<Vec<String>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT name
            FROM artist_cache
            WHERE mbid = ?1
            ORDER BY name
            LIMIT 6
            ",
        )
        .context("Could not prepare MusicBrainz cached-name query")?;
    let names = stmt
        .query_map(params![mbid], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz cached names")?;
    Ok(names)
}

fn release_year_range(conn: &Connection) -> Result<(Option<i32>, Option<i32>)> {
    conn.query_row(
        "
        SELECT MIN(year), MAX(year)
        FROM release_groups
        WHERE year IS NOT NULL AND year > 0
        ",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .context("Could not read MusicBrainz release year range")
}

fn cache_date_range(conn: &Connection) -> Result<(Option<String>, Option<String>)> {
    conn.query_row(
        "
        SELECT MIN(cached_at), MAX(cached_at)
        FROM (
            SELECT cached_at FROM artist_cache
            UNION ALL
            SELECT cached_at FROM release_groups
        )
        WHERE cached_at IS NOT NULL AND TRIM(cached_at) <> ''
        ",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .context("Could not read MusicBrainz cache date range")
}

fn normalize_cache_path(cache_path: Option<String>) -> String {
    let trimmed = cache_path.unwrap_or_default().trim().to_string();
    if trimmed.is_empty() {
        DEFAULT_CACHE_PATH.to_string()
    } else {
        trimmed
    }
}

fn resolve_cache_path(cache_path: &str) -> Result<PathBuf> {
    let path = PathBuf::from(cache_path);
    if path.is_absolute() {
        Ok(path)
    } else {
        let cwd = std::env::current_dir().context("Could not read current working directory")?;
        let mut candidates = vec![cwd.join(&path)];
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&path));
        }

        for candidate in &candidates {
            if candidate.exists() {
                return Ok(candidate
                    .canonicalize()
                    .unwrap_or_else(|_| candidate.to_path_buf()));
            }
        }

        Ok(candidates.remove(0))
    }
}

fn empty_status(
    cache_path: String,
    resolved_path: String,
    state: &str,
    message: &str,
    exists: bool,
) -> MusicBrainzCacheStatus {
    MusicBrainzCacheStatus {
        cache_path,
        resolved_path,
        exists,
        valid: false,
        state: state.to_string(),
        message: message.to_string(),
        file_size_bytes: 0,
        artist_count: 0,
        distinct_mbid_count: 0,
        duplicate_mbid_count: 0,
        suspicious_mapping_count: 0,
        release_group_count: 0,
        official_release_group_count: 0,
        pure_album_release_group_count: 0,
        release_year_min: None,
        release_year_max: None,
        cache_date_min: None,
        cache_date_max: None,
        warning_examples: Vec::new(),
    }
}

fn invalid_status(
    cache_path: String,
    resolved_path: String,
    file_size_bytes: i64,
    message: &str,
) -> MusicBrainzCacheStatus {
    MusicBrainzCacheStatus {
        file_size_bytes,
        exists: true,
        ..empty_status(cache_path, resolved_path, "invalid", message, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reports_valid_cache_with_warning_examples() {
        let temp_dir = temp_cache_dir("valid");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_valid_cache(&cache_path);

        let status = cache_status_for_path(Some(cache_path.display().to_string()))
            .expect("inspect cache status");

        assert!(status.exists);
        assert!(status.valid);
        assert_eq!(status.state, "warning");
        assert_eq!(status.artist_count, 3);
        assert_eq!(status.distinct_mbid_count, 2);
        assert_eq!(status.duplicate_mbid_count, 1);
        assert_eq!(status.release_group_count, 2);
        assert_eq!(status.official_release_group_count, 2);
        assert_eq!(status.pure_album_release_group_count, 1);
        assert_eq!(status.release_year_min, Some(1986));
        assert_eq!(status.release_year_max, Some(1987));
        assert_eq!(status.warning_examples.len(), 1);
        assert_eq!(
            status.warning_examples[0].cached_names,
            vec!["pet shop boys".to_string(), "psb".to_string()]
        );

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn reports_missing_cache_as_unavailable() {
        let temp_dir = temp_cache_dir("missing");
        let cache_path = temp_dir.join("missing.db");

        let status = cache_status_for_path(Some(cache_path.display().to_string()))
            .expect("inspect missing cache");

        assert!(!status.exists);
        assert!(!status.valid);
        assert_eq!(status.state, "unavailable");

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn reports_invalid_cache_schema() {
        let temp_dir = temp_cache_dir("invalid");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        let conn = Connection::open(&cache_path).expect("open invalid cache");
        conn.execute("CREATE TABLE artist_cache (name TEXT PRIMARY KEY)", [])
            .expect("create invalid table");
        drop(conn);

        let status = cache_status_for_path(Some(cache_path.display().to_string()))
            .expect("inspect invalid cache");

        assert!(status.exists);
        assert!(!status.valid);
        assert_eq!(status.state, "invalid");
        assert!(status.message.contains("missing column"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    fn create_valid_cache(path: &Path) {
        let conn = Connection::open(path).expect("open test cache");
        conn.execute_batch(
            "
            CREATE TABLE artist_cache (
                name TEXT PRIMARY KEY,
                mbid TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE release_groups (
                artist_mbid TEXT,
                release_mbid TEXT,
                title TEXT,
                year INTEGER,
                type TEXT,
                secondary_types TEXT,
                track_count INTEGER,
                status TEXT,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (artist_mbid, release_mbid)
            );
            INSERT INTO artist_cache (name, mbid, cached_at) VALUES
                ('pet shop boys', 'mbid-psb', '2026-02-01 12:00:00'),
                ('psb', 'mbid-psb', '2026-02-01 12:01:00'),
                ('the smiths', 'mbid-smiths', '2026-02-01 12:02:00');
            INSERT INTO release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, cached_at
            ) VALUES
                ('mbid-psb', 'release-actually', 'Actually', 1987, 'Album', '', 10, 'Official', '2026-02-01 12:03:00'),
                ('mbid-psb', 'release-comp', 'Disco', 1986, 'Album', 'Remix', 6, 'Official', '2026-02-01 12:04:00');
            ",
        )
        .expect("seed valid cache");
    }

    fn temp_cache_dir(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("musicbrainz-cache-{label}-{unique}"));
        fs::create_dir_all(&dir).expect("create temp cache dir");
        dir
    }
}
