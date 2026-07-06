use crate::db;
use crate::models::{
    ExportResult, MusicBrainzArtistCandidateRow, MusicBrainzArtistDiscographyRequest,
    MusicBrainzArtistDiscographyResponse, MusicBrainzArtistExportRequest,
    MusicBrainzArtistExportRow, MusicBrainzArtistLinkRequest, MusicBrainzArtistRefreshRequest,
    MusicBrainzArtistRefreshResult, MusicBrainzArtistReleaseRow, MusicBrainzCacheStatus,
    MusicBrainzCacheWarningExample, MusicBrainzReleaseDecisionRequest,
};
#[cfg(not(test))]
use crate::musicbrainz_sync;
use anyhow::{bail, Context, Result};
#[cfg(not(test))]
use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
#[cfg(test)]
use std::path::Path;
use std::path::PathBuf;
#[cfg(not(test))]
use std::thread;
#[cfg(not(test))]
use std::time::Duration;
#[cfg(not(test))]
use tauri::{AppHandle, Manager};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

const DEFAULT_CACHE_PATH: &str = "MusicBrainz/musicbrainz_cache.db";
const SUSPICIOUS_RELEASE_GROUP_THRESHOLD: i64 = 150;
const MAX_ARTIST_CANDIDATES: usize = 8;
const FUZZY_ARTIST_CANDIDATE_THRESHOLD: f64 = 0.85;
#[cfg(not(test))]
const MUSICBRAINZ_RELEASES_URL: &str = "https://musicbrainz.org/ws/2/release";
#[cfg(not(test))]
const MUSICBRAINZ_RELEASE_GROUPS_URL: &str = "https://musicbrainz.org/ws/2/release-group";
#[cfg(not(test))]
const MUSICBRAINZ_USER_AGENT: &str = "music-backup-v5/0.39.1 (local desktop app)";
#[cfg(not(test))]
const MUSICBRAINZ_PAGE_LIMIT: usize = 100;
#[cfg(not(test))]
const MUSICBRAINZ_RATE_LIMIT_DELAY_MS: u64 = 1100;

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

#[cfg(not(test))]
pub fn artist_discography_for_app(
    app: &AppHandle,
    request: MusicBrainzArtistDiscographyRequest,
) -> Result<MusicBrainzArtistDiscographyResponse> {
    let (app_conn, _) = db::open(app)?;
    let settings = db::settings_for_app(app)?;
    artist_discography_for_connection(&app_conn, Some(settings.musicbrainz_cache_path), request)
}

#[cfg(not(test))]
pub fn set_release_decision_for_app(
    app: &AppHandle,
    request: MusicBrainzReleaseDecisionRequest,
) -> Result<()> {
    let (conn, _) = db::open(app)?;
    set_release_decision_for_connection(&conn, request)?;
    musicbrainz_sync::sync_for_app(app)?;
    Ok(())
}

#[cfg(not(test))]
pub fn set_artist_link_for_app(
    app: &AppHandle,
    request: MusicBrainzArtistLinkRequest,
) -> Result<()> {
    let (conn, _) = db::open(app)?;
    set_artist_link_for_connection(&conn, request)?;
    musicbrainz_sync::sync_for_app(app)?;
    Ok(())
}

#[cfg(not(test))]
pub fn refresh_artist_release_groups_for_app(
    app: &AppHandle,
    request: MusicBrainzArtistRefreshRequest,
) -> Result<MusicBrainzArtistRefreshResult> {
    let (mut conn, _) = db::open(app)?;
    let artist_name = normalize_display_name(&request.artist_name, &request.artist_key);
    let artist_key = normalize_local_artist_key(&request.artist_key, &artist_name);
    let mbid = required_mbid(request.musicbrainz_mbid.as_deref())?;
    let rows = fetch_artist_release_groups(&mbid)?;
    let fetched_at = Utc::now().to_rfc3339();
    let stored_count = save_refreshed_artist_release_groups(&mut conn, &mbid, &rows, &fetched_at)?;
    musicbrainz_sync::sync_for_app(app)?;

    Ok(MusicBrainzArtistRefreshResult {
        artist_key,
        artist_name,
        musicbrainz_mbid: mbid,
        fetched_count: rows.len(),
        stored_count,
        fetched_at,
    })
}

fn save_refreshed_artist_release_groups(
    conn: &mut Connection,
    artist_mbid: &str,
    rows: &[RefreshedReleaseGroup],
    fetched_at: &str,
) -> Result<usize> {
    if !table_exists(conn, "musicbrainz_artist_release_groups")? {
        bail!("MusicBrainz refreshed release-group table is unavailable");
    }

    let tx = conn
        .transaction()
        .context("Could not start MusicBrainz release-group refresh transaction")?;
    tx.execute(
        "
        DELETE FROM musicbrainz_artist_release_groups
        WHERE artist_mbid = ?1
        ",
        params![artist_mbid],
    )
    .context("Could not clear old refreshed MusicBrainz release groups")?;

    for row in rows {
        tx.execute(
            "
            INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, source, fetched_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'musicbrainz-live', ?9
            )
            ",
            params![
                artist_mbid,
                &row.release_mbid,
                &row.title,
                row.year,
                &row.primary_type,
                &row.secondary_types,
                row.track_count,
                &row.status,
                fetched_at
            ],
        )
        .context("Could not save refreshed MusicBrainz release group")?;
    }

    tx.commit()
        .context("Could not commit MusicBrainz release-group refresh")?;
    Ok(rows.len())
}

#[cfg(not(test))]
fn fetch_artist_release_groups(artist_mbid: &str) -> Result<Vec<RefreshedReleaseGroup>> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .build();
    let mut rows = Vec::new();
    let mut offset = 0usize;

    loop {
        let url = format!(
            "{MUSICBRAINZ_RELEASE_GROUPS_URL}?artist={artist_mbid}&type=album&fmt=json&limit={MUSICBRAINZ_PAGE_LIMIT}&offset={offset}"
        );
        let response = agent
            .get(&url)
            .set("User-Agent", MUSICBRAINZ_USER_AGENT)
            .call()
            .with_context(|| {
                format!("Could not fetch MusicBrainz release groups for {artist_mbid}")
            })?;
        let payload = response
            .into_json::<MusicBrainzReleaseGroupBrowseResponse>()
            .context("Could not parse MusicBrainz release-group response")?;
        let total = payload
            .release_group_count
            .unwrap_or(payload.release_groups.len());

        for release_group in payload.release_groups {
            rows.push(RefreshedReleaseGroup {
                release_mbid: release_group.id,
                title: release_group.title,
                year: release_year_from_date(release_group.first_release_date.as_deref()),
                primary_type: release_group
                    .primary_type
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "Album".to_string()),
                secondary_types: release_group.secondary_types.join(" + "),
                track_count: None,
                status: "Official".to_string(),
            });
        }

        offset += MUSICBRAINZ_PAGE_LIMIT;
        if offset >= total {
            break;
        }
        thread::sleep(Duration::from_millis(MUSICBRAINZ_RATE_LIMIT_DELAY_MS));
    }

    Ok(rows)
}

#[cfg(not(test))]
pub fn export_artist_releases_for_app(
    app: &AppHandle,
    input: MusicBrainzArtistExportRequest,
) -> Result<ExportResult> {
    let format = input.format.trim().to_lowercase();
    if !matches!(format.as_str(), "csv" | "xlsx") {
        bail!("Unsupported MusicBrainz export format: {}", input.format);
    }
    if input.artist_link_ignored {
        bail!("Ignored MusicBrainz artist matches have no visible rows to export");
    }

    let visible_rows = visible_musicbrainz_artist_export_rows(&input.rows);
    let (headers, values) = musicbrainz_artist_export_table(&input, &visible_rows);

    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;

    let artist_segment = db::safe_file_segment(&input.artist_name);
    let path = export_dir.join(format!(
        "music-library-musicbrainz-{}-{}.{}",
        artist_segment,
        Utc::now().format("%Y%m%d-%H%M%S"),
        format
    ));

    if format == "xlsx" {
        db::write_xlsx_file(&path, &headers, &values)?;
    } else {
        let mut file = fs::File::create(&path)?;
        db::write_delimited(&mut file, ',', &headers, &values)?;
    }

    let (conn, _) = db::open(app)?;
    let request_json =
        serde_json::to_string(&input).context("Could not serialize MusicBrainz export query")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, 'musicbrainz-artist', ?2, ?3, ?4, ?5)
        ",
        params![
            Utc::now().to_rfc3339(),
            &format,
            visible_rows.len() as i64,
            path.display().to_string(),
            request_json
        ],
    )
    .context("Could not record MusicBrainz artist export")?;

    Ok(ExportResult {
        path: path.display().to_string(),
        format,
        row_count: visible_rows.len(),
    })
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

pub fn artist_discography_for_connection(
    app_conn: &Connection,
    cache_path: Option<String>,
    request: MusicBrainzArtistDiscographyRequest,
) -> Result<MusicBrainzArtistDiscographyResponse> {
    let artist_name = normalize_display_name(&request.artist_name, &request.artist_key);
    let artist_key = normalize_local_artist_key(&request.artist_key, &artist_name);
    let cache_status = cache_status_for_path(cache_path)?;
    let local_albums = local_artist_albums(app_conn, &artist_key)?;
    let artist_link = artist_link_record(app_conn, &artist_key)?;

    if let Some(link) = artist_link.as_ref().filter(|link| link.ignored) {
        return Ok(ignored_discography_response(
            artist_key,
            artist_name,
            &cache_status,
            local_albums.len() as i64,
            link,
        ));
    }

    if !cache_status.valid {
        return Ok(empty_discography_response(
            artist_key,
            artist_name,
            &cache_status,
            &cache_status.state,
            &cache_status.message,
            local_albums.len() as i64,
        ));
    }

    let cache_conn = Connection::open_with_flags(
        &cache_status.resolved_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .with_context(|| {
        format!(
            "Could not open MusicBrainz cache read-only at {}",
            cache_status.resolved_path
        )
    })?;
    validate_cache_schema(&cache_conn)?;

    let artist_match = match find_artist_match(app_conn, &cache_conn, &artist_key, &artist_name)? {
        Some(artist_match) => artist_match,
        None => {
            let candidates = fuzzy_artist_candidates(&cache_conn, &artist_name, None)?;
            let message = if candidates.is_empty() {
                "No MusicBrainz artist match was found in the local cache."
            } else {
                "No exact MusicBrainz artist match was found in the local cache. Review the local cache candidates."
            };
            let mut response = empty_discography_response(
                artist_key,
                artist_name,
                &cache_status,
                "notFound",
                message,
                local_albums.len() as i64,
            );
            response.candidates = candidates;
            return Ok(response);
        }
    };
    let candidates = if artist_match.suspect_mapping && artist_match.artist_link_state != "verified"
    {
        suspect_artist_candidates(&cache_conn, &artist_name, &artist_match)?
    } else {
        Vec::new()
    };

    let decisions = release_decisions(app_conn, &artist_key)?;
    let ReleaseGroupSnapshot {
        releases: pure_releases,
        source: release_group_source,
        updated_at: release_group_updated_at,
    } = artist_release_group_snapshot(app_conn, &cache_conn, &artist_match.mbid)?;
    let official_statuses =
        official_release_statuses(app_conn, &artist_match.mbid, &pure_releases)?;
    let local_album_count = local_albums.len() as i64;
    let local_by_title = local_albums_by_title(local_albums);
    let releases = pure_releases
        .into_iter()
        .map(|release| {
            let decision = decisions.get(&release.release_mbid).cloned();
            let has_official_release = official_statuses.get(&release.release_mbid).copied();
            release_row_with_local_match(release, &local_by_title, decision, has_official_release)
        })
        .collect::<Vec<_>>();
    let owned_count = releases
        .iter()
        .filter(|release| release.status == "owned")
        .count() as i64;
    let missing_count = releases
        .iter()
        .filter(|release| release.status == "missing")
        .count() as i64;
    let excluded_count = releases
        .iter()
        .filter(|release| release.status == "excluded")
        .count() as i64;
    let pure_album_count = owned_count + missing_count;
    let completion = if pure_album_count > 0 {
        Some(owned_count as f64 / pure_album_count as f64)
    } else {
        None
    };
    let state = if artist_match.suspect_mapping {
        "warning"
    } else {
        "available"
    };
    let message = if artist_match.suspect_mapping {
        format!(
            "Matched through the local cache, but this MBID has {} cached names and {} release groups. Review before trusting broad missing-album results.",
            artist_match.cached_name_count, artist_match.total_release_group_count
        )
    } else {
        format!(
            "Matched {} scoped MusicBrainz albums against {} local albums; {} excluded by release decisions.",
            pure_album_count, local_album_count, excluded_count
        )
    };

    Ok(MusicBrainzArtistDiscographyResponse {
        artist_key,
        artist_name,
        state: state.to_string(),
        message,
        cache_path: cache_status.cache_path,
        resolved_path: cache_status.resolved_path,
        musicbrainz_mbid: Some(artist_match.mbid),
        matched_cache_name: artist_match.matched_name,
        match_method: artist_match.match_method,
        artist_link_state: artist_match.artist_link_state,
        artist_link_ignored: false,
        suspect_mapping: artist_match.suspect_mapping,
        cached_name_count: artist_match.cached_name_count,
        total_release_group_count: artist_match.total_release_group_count,
        pure_album_count,
        owned_count,
        missing_count,
        excluded_count,
        local_album_count,
        completion,
        release_group_source,
        release_group_updated_at,
        releases,
        candidates,
    })
}

fn visible_musicbrainz_artist_export_rows(
    rows: &[MusicBrainzArtistExportRow],
) -> Vec<MusicBrainzArtistExportRow> {
    rows.iter()
        .filter(|row| row.status != "excluded")
        .cloned()
        .collect()
}

fn musicbrainz_artist_export_table(
    input: &MusicBrainzArtistExportRequest,
    rows: &[MusicBrainzArtistExportRow],
) -> (Vec<&'static str>, Vec<Vec<String>>) {
    let headers = vec![
        "Status",
        "Year",
        "MusicBrainz Title",
        "Local Match",
        "Confidence",
        "Release Group MBID",
        "Release Group Link",
        "Release Match Method",
        "Artist",
        "Artist Link Trust",
        "MusicBrainz Artist MBID",
        "MusicBrainz Artist Link",
        "Cached Name",
        "Artist Match Method",
    ];
    let artist_mbid = input.musicbrainz_mbid.as_deref().unwrap_or_default();
    let artist_url = musicbrainz_artist_url(artist_mbid);

    let values = rows
        .iter()
        .map(|row| {
            let release_url = musicbrainz_release_group_url(&row.release_mbid);
            vec![
                status_label(&row.status),
                row.year.map(|year| year.to_string()).unwrap_or_default(),
                row.title.clone(),
                local_match_label(row),
                confidence_label(row),
                row.release_mbid.clone(),
                release_url,
                row.match_method.clone(),
                input.artist_name.clone(),
                artist_link_state_label(&input.artist_link_state),
                artist_mbid.to_string(),
                artist_url.clone(),
                input.matched_cache_name.clone().unwrap_or_default(),
                input.match_method.clone(),
            ]
        })
        .collect();

    (headers, values)
}

fn musicbrainz_artist_url(mbid: &str) -> String {
    if mbid.trim().is_empty() {
        String::new()
    } else {
        format!("https://musicbrainz.org/artist/{}", mbid.trim())
    }
}

fn musicbrainz_release_group_url(mbid: &str) -> String {
    if mbid.trim().is_empty() {
        String::new()
    } else {
        format!("https://musicbrainz.org/release-group/{}", mbid.trim())
    }
}

fn local_match_label(row: &MusicBrainzArtistExportRow) -> String {
    match row
        .local_album_title
        .as_deref()
        .filter(|title| !title.is_empty())
    {
        Some(title) => match row.local_year {
            Some(year) => format!("{title} ({year})"),
            None => title.to_string(),
        },
        None => String::new(),
    }
}

fn confidence_label(row: &MusicBrainzArtistExportRow) -> String {
    if row.status == "owned" {
        format!("{:.0}%", row.confidence * 100.0)
    } else {
        String::new()
    }
}

fn status_label(status: &str) -> String {
    match status {
        "owned" => "Owned".to_string(),
        "missing" => "Missing".to_string(),
        "excluded" => "Excluded".to_string(),
        value => value.to_string(),
    }
}

fn artist_link_state_label(state: &str) -> String {
    match state {
        "verified" => "Verified".to_string(),
        "ignored" => "Ignored".to_string(),
        "unverified" => "Unverified".to_string(),
        "none" => "No review".to_string(),
        value => value.to_string(),
    }
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

#[derive(Debug, Clone)]
struct ArtistMatch {
    mbid: String,
    matched_name: Option<String>,
    match_method: String,
    artist_link_state: String,
    cached_name_count: i64,
    total_release_group_count: i64,
    suspect_mapping: bool,
}

#[derive(Debug, Clone)]
struct ArtistLinkRecord {
    mbid: Option<String>,
    canonical_name: Option<String>,
    match_method: String,
    verification_state: String,
    ignored: bool,
}

#[derive(Debug, Clone)]
struct ArtistCacheEntry {
    name: String,
    mbid: String,
}

#[derive(Debug, Clone)]
struct ArtistCandidateSeed {
    name: String,
    mbid: String,
    match_method: String,
    score: f64,
}

#[derive(Debug, Clone)]
struct LocalAlbum {
    album_id: String,
    title: String,
    year: Option<i32>,
}

#[derive(Debug, Clone)]
struct MusicBrainzReleaseGroup {
    release_mbid: String,
    title: String,
    year: Option<i32>,
    track_count: Option<i64>,
}

struct ReleaseGroupSnapshot {
    releases: Vec<MusicBrainzReleaseGroup>,
    source: String,
    updated_at: Option<String>,
}

#[derive(Debug, Clone)]
struct RefreshedReleaseGroup {
    release_mbid: String,
    title: String,
    year: Option<i32>,
    primary_type: String,
    secondary_types: String,
    track_count: Option<i64>,
    status: String,
}

fn empty_discography_response(
    artist_key: String,
    artist_name: String,
    cache_status: &MusicBrainzCacheStatus,
    state: &str,
    message: &str,
    local_album_count: i64,
) -> MusicBrainzArtistDiscographyResponse {
    MusicBrainzArtistDiscographyResponse {
        artist_key,
        artist_name,
        state: state.to_string(),
        message: message.to_string(),
        cache_path: cache_status.cache_path.clone(),
        resolved_path: cache_status.resolved_path.clone(),
        musicbrainz_mbid: None,
        matched_cache_name: None,
        match_method: "none".to_string(),
        artist_link_state: "none".to_string(),
        artist_link_ignored: false,
        suspect_mapping: false,
        cached_name_count: 0,
        total_release_group_count: 0,
        pure_album_count: 0,
        owned_count: 0,
        missing_count: 0,
        excluded_count: 0,
        local_album_count,
        completion: None,
        release_group_source: "cache".to_string(),
        release_group_updated_at: None,
        releases: Vec::new(),
        candidates: Vec::new(),
    }
}

fn ignored_discography_response(
    artist_key: String,
    artist_name: String,
    cache_status: &MusicBrainzCacheStatus,
    local_album_count: i64,
    artist_link: &ArtistLinkRecord,
) -> MusicBrainzArtistDiscographyResponse {
    MusicBrainzArtistDiscographyResponse {
        artist_key,
        artist_name,
        state: "ignored".to_string(),
        message: "MusicBrainz is ignored for this local artist.".to_string(),
        cache_path: cache_status.cache_path.clone(),
        resolved_path: cache_status.resolved_path.clone(),
        musicbrainz_mbid: artist_link.mbid.clone(),
        matched_cache_name: artist_link.canonical_name.clone(),
        match_method: artist_link.match_method.clone(),
        artist_link_state: "ignored".to_string(),
        artist_link_ignored: true,
        suspect_mapping: false,
        cached_name_count: 0,
        total_release_group_count: 0,
        pure_album_count: 0,
        owned_count: 0,
        missing_count: 0,
        excluded_count: 0,
        local_album_count,
        completion: None,
        release_group_source: "cache".to_string(),
        release_group_updated_at: None,
        releases: Vec::new(),
        candidates: Vec::new(),
    }
}

fn find_artist_match(
    app_conn: &Connection,
    cache_conn: &Connection,
    artist_key: &str,
    artist_name: &str,
) -> Result<Option<ArtistMatch>> {
    if let Some(link) = artist_link_record(app_conn, artist_key)? {
        if link.verification_state == "verified" && !link.ignored {
            if let Some(mbid) = link.mbid {
                return artist_match_from_mbid(
                    cache_conn,
                    mbid,
                    link.canonical_name,
                    &link.match_method,
                    false,
                    "verified",
                );
            }
        }
    }

    if let Some((matched_name, mbid)) = cache_conn
        .query_row(
            "
            SELECT name, mbid
            FROM artist_cache
            WHERE LOWER(name) = LOWER(?1)
              AND mbid IS NOT NULL
              AND TRIM(mbid) <> ''
            ORDER BY name
            LIMIT 1
            ",
            params![artist_name],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .context("Could not lookup exact MusicBrainz artist cache match")?
    {
        return artist_match_from_mbid(
            cache_conn,
            mbid,
            Some(matched_name),
            "exact-name",
            true,
            "unverified",
        );
    }

    let normalized_artist_name = musicbrainz_text_key(artist_name);
    if normalized_artist_name.is_empty() {
        return Ok(None);
    }

    let mut stmt = cache_conn
        .prepare(
            "
            SELECT name, mbid
            FROM artist_cache
            WHERE mbid IS NOT NULL AND TRIM(mbid) <> ''
            ORDER BY name
            ",
        )
        .context("Could not prepare normalized MusicBrainz artist lookup")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz artist cache names")?;

    for (name, mbid) in rows {
        if musicbrainz_text_key(&name) == normalized_artist_name {
            return artist_match_from_mbid(
                cache_conn,
                mbid,
                Some(name),
                "normalized-name",
                true,
                "unverified",
            );
        }
    }

    Ok(None)
}

fn artist_link_record(app_conn: &Connection, artist_key: &str) -> Result<Option<ArtistLinkRecord>> {
    if !table_exists(app_conn, "musicbrainz_artist_links")? {
        return Ok(None);
    }

    app_conn
        .query_row(
            "
            SELECT mbid, canonical_name, match_method, verification_state, ignored
            FROM musicbrainz_artist_links
            WHERE local_artist_key = ?1
            LIMIT 1
            ",
            params![artist_key],
            |row| {
                Ok(ArtistLinkRecord {
                    mbid: row.get::<_, Option<String>>(0)?,
                    canonical_name: row.get::<_, Option<String>>(1)?,
                    match_method: row.get::<_, String>(2)?,
                    verification_state: row.get::<_, String>(3)?,
                    ignored: row.get::<_, i64>(4)? != 0,
                })
            },
        )
        .optional()
        .context("Could not read MusicBrainz artist link")
}

fn artist_match_from_mbid(
    cache_conn: &Connection,
    mbid: String,
    matched_name: Option<String>,
    match_method: &str,
    should_warn_for_cache_quality: bool,
    artist_link_state: &str,
) -> Result<Option<ArtistMatch>> {
    let cached_name_count = cached_name_count(cache_conn, &mbid)?;
    let total_release_group_count = release_group_count_for_mbid(cache_conn, &mbid)?;
    let suspect_mapping = should_warn_for_cache_quality
        && (cached_name_count > 1
            || total_release_group_count >= SUSPICIOUS_RELEASE_GROUP_THRESHOLD);

    Ok(Some(ArtistMatch {
        mbid,
        matched_name,
        match_method: match_method.to_string(),
        artist_link_state: artist_link_state.to_string(),
        cached_name_count,
        total_release_group_count,
        suspect_mapping,
    }))
}

fn fuzzy_artist_candidates(
    cache_conn: &Connection,
    artist_name: &str,
    excluded_mbid: Option<&str>,
) -> Result<Vec<MusicBrainzArtistCandidateRow>> {
    let seeds = fuzzy_artist_candidate_seeds(cache_conn, artist_name, excluded_mbid)?;
    hydrate_artist_candidates(cache_conn, seeds)
}

fn suspect_artist_candidates(
    cache_conn: &Connection,
    artist_name: &str,
    artist_match: &ArtistMatch,
) -> Result<Vec<MusicBrainzArtistCandidateRow>> {
    let mut seeds = same_mbid_artist_candidate_seeds(cache_conn, artist_name, artist_match)?;
    seeds.extend(fuzzy_artist_candidate_seeds(
        cache_conn,
        artist_name,
        Some(&artist_match.mbid),
    )?);
    hydrate_artist_candidates(cache_conn, seeds)
}

fn same_mbid_artist_candidate_seeds(
    cache_conn: &Connection,
    artist_name: &str,
    artist_match: &ArtistMatch,
) -> Result<Vec<ArtistCandidateSeed>> {
    let target_key = musicbrainz_text_key(artist_name);
    let matched_name_key = artist_match
        .matched_name
        .as_deref()
        .map(musicbrainz_text_key);
    let mut stmt = cache_conn
        .prepare(
            "
            SELECT DISTINCT name
            FROM artist_cache
            WHERE mbid = ?1
              AND TRIM(name) <> ''
            ORDER BY LOWER(name)
            ",
        )
        .context("Could not prepare MusicBrainz same-MBID candidate lookup")?;
    let names = stmt
        .query_map(params![&artist_match.mbid], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz same-MBID candidate names")?;

    let seeds = names
        .into_iter()
        .filter_map(|name| {
            let name_key = musicbrainz_text_key(&name);
            if matched_name_key.as_deref() == Some(name_key.as_str()) {
                return None;
            }
            let score = artist_name_similarity_from_keys(&target_key, &name_key).max(0.74);
            Some(ArtistCandidateSeed {
                name,
                mbid: artist_match.mbid.clone(),
                match_method: "same-mbid-name".to_string(),
                score,
            })
        })
        .collect::<Vec<_>>();
    Ok(seeds)
}

fn fuzzy_artist_candidate_seeds(
    cache_conn: &Connection,
    artist_name: &str,
    excluded_mbid: Option<&str>,
) -> Result<Vec<ArtistCandidateSeed>> {
    let target_key = musicbrainz_text_key(artist_name);
    if target_key.is_empty() {
        return Ok(Vec::new());
    }

    let mut best_by_mbid = HashMap::<String, ArtistCandidateSeed>::new();
    for entry in artist_cache_entries(cache_conn)? {
        if excluded_mbid == Some(entry.mbid.as_str()) {
            continue;
        }

        let entry_key = musicbrainz_text_key(&entry.name);
        let score = artist_name_similarity_from_keys(&target_key, &entry_key);
        if score < FUZZY_ARTIST_CANDIDATE_THRESHOLD {
            continue;
        }

        let seed = ArtistCandidateSeed {
            name: entry.name,
            mbid: entry.mbid.clone(),
            match_method: "fuzzy-name".to_string(),
            score,
        };
        best_by_mbid
            .entry(entry.mbid)
            .and_modify(|current| {
                if seed.score > current.score
                    || (seed.score == current.score && seed.name.len() < current.name.len())
                {
                    *current = seed.clone();
                }
            })
            .or_insert(seed);
    }

    let mut seeds = best_by_mbid.into_values().collect::<Vec<_>>();
    sort_artist_candidate_seeds(&mut seeds);
    seeds.truncate(MAX_ARTIST_CANDIDATES);
    Ok(seeds)
}

fn artist_cache_entries(cache_conn: &Connection) -> Result<Vec<ArtistCacheEntry>> {
    let mut stmt = cache_conn
        .prepare(
            "
            SELECT name, mbid
            FROM artist_cache
            WHERE mbid IS NOT NULL
              AND TRIM(mbid) <> ''
              AND TRIM(name) <> ''
            ORDER BY LOWER(name)
            ",
        )
        .context("Could not prepare MusicBrainz artist candidate lookup")?;
    let entries = stmt
        .query_map([], |row| {
            Ok(ArtistCacheEntry {
                name: row.get(0)?,
                mbid: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz artist candidate names")?;
    Ok(entries)
}

fn hydrate_artist_candidates(
    cache_conn: &Connection,
    seeds: Vec<ArtistCandidateSeed>,
) -> Result<Vec<MusicBrainzArtistCandidateRow>> {
    let mut seen = HashSet::new();
    let mut deduped = seeds
        .into_iter()
        .filter(|seed| seen.insert(format!("{}\u{0}{}", seed.mbid, seed.name)))
        .collect::<Vec<_>>();
    sort_artist_candidate_seeds(&mut deduped);
    deduped.truncate(MAX_ARTIST_CANDIDATES);

    deduped
        .into_iter()
        .map(|seed| {
            let cached_name_count = cached_name_count(cache_conn, &seed.mbid)?;
            let total_release_group_count = release_group_count_for_mbid(cache_conn, &seed.mbid)?;
            Ok(MusicBrainzArtistCandidateRow {
                name: seed.name,
                mbid: seed.mbid,
                match_method: seed.match_method,
                score: seed.score,
                cached_name_count,
                total_release_group_count,
                suspect_mapping: cached_name_count > 1
                    || total_release_group_count >= SUSPICIOUS_RELEASE_GROUP_THRESHOLD,
            })
        })
        .collect()
}

fn sort_artist_candidate_seeds(seeds: &mut [ArtistCandidateSeed]) {
    seeds.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.mbid.cmp(&right.mbid))
    });
}

fn artist_name_similarity_from_keys(target_key: &str, candidate_key: &str) -> f64 {
    if target_key.is_empty() || candidate_key.is_empty() {
        return 0.0;
    }
    if target_key == candidate_key {
        return 1.0;
    }

    let distance = levenshtein_distance(target_key, candidate_key) as f64;
    let max_len = target_key
        .chars()
        .count()
        .max(candidate_key.chars().count()) as f64;
    let edit_score = if max_len > 0.0 {
        1.0 - (distance / max_len)
    } else {
        0.0
    };
    let token_score = token_overlap_score(target_key, candidate_key);
    let substring_bonus =
        if target_key.contains(candidate_key) || candidate_key.contains(target_key) {
            0.08
        } else {
            0.0
        };

    ((edit_score * 0.68) + (token_score * 0.32) + substring_bonus).clamp(0.0, 1.0)
}

fn token_overlap_score(left: &str, right: &str) -> f64 {
    let left_tokens = left.split_whitespace().collect::<HashSet<_>>();
    let right_tokens = right.split_whitespace().collect::<HashSet<_>>();
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return 0.0;
    }

    let intersection = left_tokens.intersection(&right_tokens).count() as f64;
    let union = left_tokens.union(&right_tokens).count() as f64;
    if union > 0.0 {
        intersection / union
    } else {
        0.0
    }
}

fn levenshtein_distance(left: &str, right: &str) -> usize {
    let right_chars = right.chars().collect::<Vec<_>>();
    let mut previous = (0..=right_chars.len()).collect::<Vec<_>>();
    let mut current = vec![0; right_chars.len() + 1];

    for (left_index, left_char) in left.chars().enumerate() {
        current[0] = left_index + 1;
        for (right_index, right_char) in right_chars.iter().enumerate() {
            let substitution_cost = if left_char == *right_char { 0 } else { 1 };
            current[right_index + 1] = (previous[right_index + 1] + 1)
                .min(current[right_index] + 1)
                .min(previous[right_index] + substitution_cost);
        }
        std::mem::swap(&mut previous, &mut current);
    }

    previous[right_chars.len()]
}

fn cached_name_count(conn: &Connection, mbid: &str) -> Result<i64> {
    conn.query_row(
        "
        SELECT COUNT(DISTINCT name)
        FROM artist_cache
        WHERE mbid = ?1
        ",
        params![mbid],
        |row| row.get(0),
    )
    .context("Could not count MusicBrainz artist cache names")
}

fn release_group_count_for_mbid(conn: &Connection, mbid: &str) -> Result<i64> {
    conn.query_row(
        "
        SELECT COUNT(*)
        FROM release_groups
        WHERE artist_mbid = ?1
        ",
        params![mbid],
        |row| row.get(0),
    )
    .context("Could not count MusicBrainz artist release groups")
}

fn artist_release_group_snapshot(
    app_conn: &Connection,
    cache_conn: &Connection,
    artist_mbid: &str,
) -> Result<ReleaseGroupSnapshot> {
    if let Some(snapshot) = refreshed_artist_release_group_snapshot(app_conn, artist_mbid)? {
        return Ok(snapshot);
    }

    Ok(ReleaseGroupSnapshot {
        releases: cache_pure_album_release_groups(cache_conn, artist_mbid)?,
        source: "cache".to_string(),
        updated_at: None,
    })
}

fn refreshed_artist_release_group_snapshot(
    conn: &Connection,
    artist_mbid: &str,
) -> Result<Option<ReleaseGroupSnapshot>> {
    if !table_exists(conn, "musicbrainz_artist_release_groups")? {
        return Ok(None);
    }

    let row_count: i64 = conn
        .query_row(
            "
            SELECT COUNT(*)
            FROM musicbrainz_artist_release_groups
            WHERE artist_mbid = ?1
            ",
            params![artist_mbid],
            |row| row.get(0),
        )
        .context("Could not count refreshed MusicBrainz release groups")?;
    if row_count == 0 {
        return Ok(None);
    }

    let updated_at: Option<String> = conn
        .query_row(
            "
            SELECT MAX(fetched_at)
            FROM musicbrainz_artist_release_groups
            WHERE artist_mbid = ?1
            ",
            params![artist_mbid],
            |row| row.get(0),
        )
        .context("Could not read refreshed MusicBrainz release-group timestamp")?;

    let mut stmt = conn
        .prepare(
            "
            SELECT release_mbid, title, year, track_count
            FROM musicbrainz_artist_release_groups
            WHERE artist_mbid = ?1
              AND status = 'Official'
              AND type = 'Album'
              AND COALESCE(secondary_types, '') = ''
            ORDER BY COALESCE(year, 9999), LOWER(title), release_mbid
            ",
        )
        .context("Could not prepare refreshed MusicBrainz pure-album lookup")?;
    let releases = stmt
        .query_map(params![artist_mbid], |row| {
            Ok(MusicBrainzReleaseGroup {
                release_mbid: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                track_count: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load refreshed MusicBrainz pure official albums")?;

    Ok(Some(ReleaseGroupSnapshot {
        releases,
        source: "refreshed".to_string(),
        updated_at,
    }))
}

fn cache_pure_album_release_groups(
    conn: &Connection,
    artist_mbid: &str,
) -> Result<Vec<MusicBrainzReleaseGroup>> {
    let mut stmt = conn
        .prepare(
            "
            SELECT release_mbid, title, year, track_count
            FROM release_groups
            WHERE artist_mbid = ?1
              AND status = 'Official'
              AND type = 'Album'
              AND COALESCE(secondary_types, '') = ''
            ORDER BY COALESCE(year, 9999), LOWER(title), release_mbid
            ",
        )
        .context("Could not prepare MusicBrainz pure-album lookup")?;
    let releases = stmt
        .query_map(params![artist_mbid], |row| {
            Ok(MusicBrainzReleaseGroup {
                release_mbid: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                track_count: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load MusicBrainz pure official albums")?;
    Ok(releases)
}

pub fn set_release_decision_for_connection(
    conn: &Connection,
    request: MusicBrainzReleaseDecisionRequest,
) -> Result<()> {
    let artist_name = normalize_display_name(&request.artist_name, &request.artist_key);
    let artist_key = normalize_local_artist_key(&request.artist_key, &artist_name);
    let release_mbid = request.release_mbid.trim();

    if release_mbid.is_empty() {
        bail!("MusicBrainz release MBID is required");
    }

    if !table_exists(conn, "musicbrainz_artist_links")?
        || !table_exists(conn, "musicbrainz_release_decisions")?
    {
        bail!("MusicBrainz decision tables are unavailable");
    }

    match normalized_release_decision(&request.decision)? {
        Some(decision) => {
            ensure_artist_link_for_decision(
                conn,
                &artist_key,
                &artist_name,
                request.musicbrainz_mbid.as_deref(),
            )?;
            conn.execute(
                "
                INSERT INTO musicbrainz_release_decisions (
                    local_artist_key, release_mbid, decision, local_album_id, created_at, updated_at
                ) VALUES (
                    ?1, ?2, ?3, ?4, datetime('now'), datetime('now')
                )
                ON CONFLICT(local_artist_key, release_mbid) DO UPDATE SET
                    decision = excluded.decision,
                    local_album_id = excluded.local_album_id,
                    updated_at = datetime('now')
                ",
                params![artist_key, release_mbid, decision, request.local_album_id],
            )
            .context("Could not save MusicBrainz release decision")?;
            if table_exists(conn, "musicbrainz_release_decision_tombstones")? {
                conn.execute(
                    "
                    DELETE FROM musicbrainz_release_decision_tombstones
                    WHERE local_artist_key = ?1 AND release_mbid = ?2
                    ",
                    params![artist_key, release_mbid],
                )
                .context("Could not clear MusicBrainz release-decision sync marker")?;
            }
        }
        None => {
            if table_exists(conn, "musicbrainz_release_decision_tombstones")? {
                conn.execute(
                    "
                    INSERT INTO musicbrainz_release_decision_tombstones (
                        local_artist_key, release_mbid, updated_at
                    ) VALUES (
                        ?1, ?2, datetime('now')
                    )
                    ON CONFLICT(local_artist_key, release_mbid) DO UPDATE SET
                        updated_at = excluded.updated_at
                    ",
                    params![artist_key, release_mbid],
                )
                .context("Could not record MusicBrainz release-decision clear for sync")?;
            }
            conn.execute(
                "
                DELETE FROM musicbrainz_release_decisions
                WHERE local_artist_key = ?1 AND release_mbid = ?2
                ",
                params![artist_key, release_mbid],
            )
            .context("Could not clear MusicBrainz release decision")?;
        }
    }

    Ok(())
}

pub fn set_artist_link_for_connection(
    conn: &Connection,
    request: MusicBrainzArtistLinkRequest,
) -> Result<()> {
    let artist_name = normalize_display_name(&request.artist_name, &request.artist_key);
    let artist_key = normalize_local_artist_key(&request.artist_key, &artist_name);
    let action = request.action.trim().to_lowercase();

    if !table_exists(conn, "musicbrainz_artist_links")? {
        bail!("MusicBrainz artist link table is unavailable");
    }

    if action == "unlink" {
        if table_exists(conn, "musicbrainz_artist_link_tombstones")? {
            conn.execute(
                "
                INSERT INTO musicbrainz_artist_link_tombstones (
                    local_artist_key, display_artist, updated_at
                ) VALUES (
                    ?1, ?2, datetime('now')
                )
                ON CONFLICT(local_artist_key) DO UPDATE SET
                    display_artist = excluded.display_artist,
                    updated_at = excluded.updated_at
                ",
                params![artist_key, artist_name],
            )
            .context("Could not record MusicBrainz artist unlink for sync")?;
        }
        conn.execute(
            "
            DELETE FROM musicbrainz_artist_links
            WHERE local_artist_key = ?1
            ",
            params![artist_key],
        )
        .context("Could not unlink MusicBrainz artist match")?;
        return Ok(());
    }

    let canonical_name = request
        .canonical_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let (mbid, match_method, verification_state, ignored, confidence) = match action.as_str() {
        "verify" => (
            Some(required_mbid(request.musicbrainz_mbid.as_deref())?),
            "verified-link",
            "verified",
            false,
            Some(1.0),
        ),
        "set" | "manual" | "manual-mbid" => (
            Some(required_mbid(request.musicbrainz_mbid.as_deref())?),
            "manual-mbid",
            "verified",
            false,
            Some(1.0),
        ),
        "ignore" => (
            optional_mbid(request.musicbrainz_mbid.as_deref())?,
            "ignored",
            "ignored",
            true,
            None,
        ),
        _ => bail!(
            "Unsupported MusicBrainz artist link action: {}",
            request.action
        ),
    };

    conn.execute(
        "
        INSERT INTO musicbrainz_artist_links (
            local_artist_key, display_artist, mbid, canonical_name, match_method,
            confidence, verification_state, ignored, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now')
        )
        ON CONFLICT(local_artist_key) DO UPDATE SET
            display_artist = excluded.display_artist,
            mbid = excluded.mbid,
            canonical_name = excluded.canonical_name,
            match_method = excluded.match_method,
            confidence = excluded.confidence,
            verification_state = excluded.verification_state,
            ignored = excluded.ignored,
            updated_at = datetime('now')
        ",
        params![
            artist_key,
            artist_name,
            mbid,
            canonical_name,
            match_method,
            confidence,
            verification_state,
            if ignored { 1 } else { 0 }
        ],
    )
    .context("Could not save MusicBrainz artist match decision")?;
    if table_exists(conn, "musicbrainz_artist_link_tombstones")? {
        conn.execute(
            "
            DELETE FROM musicbrainz_artist_link_tombstones
            WHERE local_artist_key = ?1
            ",
            params![artist_key],
        )
        .context("Could not clear MusicBrainz artist unlink sync marker")?;
    }

    Ok(())
}

fn ensure_artist_link_for_decision(
    conn: &Connection,
    artist_key: &str,
    artist_name: &str,
    musicbrainz_mbid: Option<&str>,
) -> Result<()> {
    let mbid = musicbrainz_mbid
        .map(str::trim)
        .filter(|value| !value.is_empty());
    conn.execute(
        "
        INSERT INTO musicbrainz_artist_links (
            local_artist_key, display_artist, mbid, canonical_name, match_method,
            confidence, verification_state, ignored, created_at, updated_at
        ) VALUES (
            ?1, ?2, ?3, NULL, 'release-decision', NULL, 'unverified', 0,
            datetime('now'), datetime('now')
        )
        ON CONFLICT(local_artist_key) DO UPDATE SET
            display_artist = excluded.display_artist,
            mbid = COALESCE(excluded.mbid, musicbrainz_artist_links.mbid),
            updated_at = datetime('now')
        ",
        params![artist_key, artist_name, mbid],
    )
    .context("Could not ensure MusicBrainz artist link for release decision")?;
    if table_exists(conn, "musicbrainz_artist_link_tombstones")? {
        conn.execute(
            "
            DELETE FROM musicbrainz_artist_link_tombstones
            WHERE local_artist_key = ?1
            ",
            params![artist_key],
        )
        .context("Could not clear MusicBrainz artist unlink marker for release decision")?;
    }
    Ok(())
}

fn normalized_release_decision(decision: &str) -> Result<Option<String>> {
    let normalized = decision.trim().to_lowercase();
    match normalized.as_str() {
        "" | "clear" => Ok(None),
        "include" | "not-in-scope" | "ignored" => Ok(Some(normalized)),
        _ => bail!("Unsupported MusicBrainz release decision: {decision}"),
    }
}

fn required_mbid(mbid: Option<&str>) -> Result<String> {
    optional_mbid(mbid)?.context("MusicBrainz artist MBID is required")
}

fn optional_mbid(mbid: Option<&str>) -> Result<Option<String>> {
    let Some(mbid) = mbid.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let normalized = mbid.to_lowercase();
    if !is_valid_mbid(&normalized) {
        bail!("MusicBrainz artist MBID must be a valid UUID");
    }
    Ok(Some(normalized))
}

fn is_valid_mbid(value: &str) -> bool {
    if value.len() != 36 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        matches!(index, 8 | 13 | 18 | 23) && character == '-'
            || !matches!(index, 8 | 13 | 18 | 23) && character.is_ascii_hexdigit()
    })
}

fn official_release_statuses(
    conn: &Connection,
    artist_mbid: &str,
    releases: &[MusicBrainzReleaseGroup],
) -> Result<HashMap<String, bool>> {
    let release_ids = releases
        .iter()
        .map(|release| release.release_mbid.clone())
        .collect::<Vec<_>>();
    let mut statuses = cached_official_release_statuses(conn, artist_mbid)?;
    let missing_status = release_ids
        .iter()
        .any(|release_mbid| !statuses.contains_key(release_mbid));

    if missing_status {
        match fetch_official_release_group_ids(artist_mbid) {
            Ok(Some(official_release_group_ids)) => {
                for release_mbid in &release_ids {
                    statuses.insert(
                        release_mbid.clone(),
                        official_release_group_ids.contains(release_mbid),
                    );
                }
                save_official_release_statuses(conn, artist_mbid, &statuses)?;
            }
            Ok(None) => {}
            Err(error) => {
                eprintln!(
                    "Could not verify MusicBrainz official releases for {artist_mbid}: {error:#}"
                );
            }
        }
    }

    Ok(statuses)
}

fn cached_official_release_statuses(
    conn: &Connection,
    artist_mbid: &str,
) -> Result<HashMap<String, bool>> {
    if !table_exists(conn, "musicbrainz_release_status_cache")? {
        return Ok(HashMap::new());
    }

    let mut stmt = conn
        .prepare(
            "
            SELECT release_mbid, has_official_release
            FROM musicbrainz_release_status_cache
            WHERE artist_mbid = ?1
            ",
        )
        .context("Could not prepare MusicBrainz release-status cache lookup")?;
    let rows = stmt
        .query_map(params![artist_mbid], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release-status cache")?;

    Ok(rows.into_iter().collect())
}

fn save_official_release_statuses(
    conn: &Connection,
    artist_mbid: &str,
    statuses: &HashMap<String, bool>,
) -> Result<()> {
    if !table_exists(conn, "musicbrainz_release_status_cache")? {
        return Ok(());
    }

    for (release_mbid, has_official_release) in statuses {
        conn.execute(
            "
            INSERT INTO musicbrainz_release_status_cache (
                artist_mbid, release_mbid, has_official_release, checked_at
            ) VALUES (
                ?1, ?2, ?3, datetime('now')
            )
            ON CONFLICT(artist_mbid, release_mbid) DO UPDATE SET
                has_official_release = excluded.has_official_release,
                checked_at = datetime('now')
            ",
            params![artist_mbid, release_mbid, *has_official_release as i64],
        )
        .context("Could not save MusicBrainz release-status cache row")?;
    }

    Ok(())
}

#[cfg(not(test))]
fn fetch_official_release_group_ids(artist_mbid: &str) -> Result<Option<HashSet<String>>> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build();
    let mut official_ids = HashSet::new();
    let mut offset = 0usize;

    loop {
        let url = format!(
            "{MUSICBRAINZ_RELEASES_URL}?artist={artist_mbid}&type=album&status=official&inc=release-groups&fmt=json&limit={MUSICBRAINZ_PAGE_LIMIT}&offset={offset}"
        );
        let response = agent
            .get(&url)
            .set("User-Agent", MUSICBRAINZ_USER_AGENT)
            .call()
            .with_context(|| {
                format!("Could not fetch MusicBrainz official releases for {artist_mbid}")
            })?;
        let payload = response
            .into_json::<MusicBrainzReleaseResponse>()
            .context("Could not parse MusicBrainz official releases response")?;

        for release in payload.releases {
            if release.status.as_deref() == Some("Official") {
                if let Some(release_group) = release.release_group {
                    official_ids.insert(release_group.id);
                }
            }
        }

        offset += MUSICBRAINZ_PAGE_LIMIT;
        if offset >= payload.release_count.unwrap_or(0) {
            break;
        }
        thread::sleep(Duration::from_millis(MUSICBRAINZ_RATE_LIMIT_DELAY_MS));
    }

    Ok(Some(official_ids))
}

#[cfg(test)]
fn fetch_official_release_group_ids(_artist_mbid: &str) -> Result<Option<HashSet<String>>> {
    Ok(None)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseResponse {
    release_count: Option<usize>,
    releases: Vec<MusicBrainzRelease>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroupBrowseResponse {
    release_group_count: Option<usize>,
    release_groups: Vec<MusicBrainzReleaseGroupPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroupPayload {
    id: String,
    title: String,
    first_release_date: Option<String>,
    primary_type: Option<String>,
    #[serde(default)]
    secondary_types: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzRelease {
    status: Option<String>,
    release_group: Option<MusicBrainzReleaseGroupSummary>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzReleaseGroupSummary {
    id: String,
}

fn release_year_from_date(date: Option<&str>) -> Option<i32> {
    let date = date?.trim();
    if date.len() < 4 {
        return None;
    }
    date.get(0..4)?.parse::<i32>().ok()
}

fn release_decisions(conn: &Connection, artist_key: &str) -> Result<HashMap<String, String>> {
    if !table_exists(conn, "musicbrainz_release_decisions")? {
        return Ok(HashMap::new());
    }

    let mut stmt = conn
        .prepare(
            "
            SELECT release_mbid, decision
            FROM musicbrainz_release_decisions
            WHERE local_artist_key = ?1
            ",
        )
        .context("Could not prepare MusicBrainz release-decision lookup")?;
    let rows = stmt
        .query_map(params![artist_key], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not read MusicBrainz release decisions")?;

    Ok(rows.into_iter().collect())
}

fn local_artist_albums(conn: &Connection, artist_key: &str) -> Result<Vec<LocalAlbum>> {
    let album_artist_key_sql = db::artist_key_sql("album_artist_display");
    let sql = format!(
        "
            SELECT id, COALESCE(album, 'Untitled'), year
            FROM albums
            WHERE {album_artist_key_sql} = ?1
            ORDER BY COALESCE(year, 9999), LOWER(COALESCE(album, '')), id
            "
    );
    let mut stmt = conn
        .prepare(&sql)
        .context("Could not prepare local artist album lookup")?;
    let albums = stmt
        .query_map(params![artist_key], |row| {
            Ok(LocalAlbum {
                album_id: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load local artist albums")?;
    Ok(albums)
}

fn local_albums_by_title(local_albums: Vec<LocalAlbum>) -> HashMap<String, Vec<LocalAlbum>> {
    let mut by_title: HashMap<String, Vec<LocalAlbum>> = HashMap::new();
    for album in local_albums {
        let title_key = musicbrainz_text_key(&album.title);
        if !title_key.is_empty() {
            by_title.entry(title_key).or_default().push(album);
        }
    }
    by_title
}

fn release_row_with_local_match(
    release: MusicBrainzReleaseGroup,
    local_by_title: &HashMap<String, Vec<LocalAlbum>>,
    decision: Option<String>,
    has_official_release: Option<bool>,
) -> MusicBrainzArtistReleaseRow {
    let manual_include = decision.as_deref() == Some("include");
    let excluded_decision = if matches!(decision.as_deref(), Some("not-in-scope" | "ignored")) {
        decision.clone()
    } else if !manual_include && has_official_release == Some(false) {
        Some("auto-not-official".to_string())
    } else {
        None
    };

    if let Some(excluded_decision) = excluded_decision {
        return MusicBrainzArtistReleaseRow {
            release_mbid: release.release_mbid,
            title: release.title,
            year: release.year,
            track_count: release.track_count,
            status: "excluded".to_string(),
            local_album_id: None,
            local_album_title: None,
            local_year: None,
            match_method: excluded_decision.clone(),
            confidence: 0.0,
            decision: Some(excluded_decision),
        };
    }

    let title_key = musicbrainz_text_key(&release.title);
    let local_album = local_by_title
        .get(&title_key)
        .and_then(|albums| best_local_album_match(albums, release.year));

    match local_album {
        Some(album) => {
            let same_year = release.year.is_some() && release.year == album.year;
            MusicBrainzArtistReleaseRow {
                release_mbid: release.release_mbid,
                title: release.title,
                year: release.year,
                track_count: release.track_count,
                status: "owned".to_string(),
                local_album_id: Some(album.album_id.clone()),
                local_album_title: Some(album.title.clone()),
                local_year: album.year,
                match_method: if same_year {
                    "normalized-title-year".to_string()
                } else {
                    "normalized-title".to_string()
                },
                confidence: if same_year { 1.0 } else { 0.92 },
                decision,
            }
        }
        None => MusicBrainzArtistReleaseRow {
            release_mbid: release.release_mbid,
            title: release.title,
            year: release.year,
            track_count: release.track_count,
            status: "missing".to_string(),
            local_album_id: None,
            local_album_title: None,
            local_year: None,
            match_method: "none".to_string(),
            confidence: 0.0,
            decision,
        },
    }
}

fn best_local_album_match(albums: &[LocalAlbum], release_year: Option<i32>) -> Option<&LocalAlbum> {
    if albums.is_empty() {
        return None;
    }

    if let Some(year) = release_year {
        if let Some(exact_year) = albums.iter().find(|album| album.year == Some(year)) {
            return Some(exact_year);
        }
    }

    albums.first()
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    conn.query_row(
        "
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )
        ",
        params![table],
        |row| row.get(0),
    )
    .with_context(|| format!("Could not inspect SQLite table {table}"))
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

fn normalize_display_name(artist_name: &str, artist_key: &str) -> String {
    let trimmed = artist_name.trim();
    if !trimmed.is_empty() {
        trimmed.to_string()
    } else {
        let fallback = artist_key.trim();
        if fallback.is_empty() {
            "Unknown Artist".to_string()
        } else {
            fallback.to_string()
        }
    }
}

fn normalize_local_artist_key(artist_key: &str, artist_name: &str) -> String {
    let trimmed_key = normalize_local_artist_text(artist_key);
    if !trimmed_key.is_empty() {
        trimmed_key
    } else {
        let name_key = normalize_local_artist_text(artist_name);
        if name_key.is_empty() {
            "unknown".to_string()
        } else {
            name_key
        }
    }
}

fn normalize_local_artist_text(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
            _ => character,
        })
        .collect::<String>()
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn musicbrainz_text_key(value: &str) -> String {
    let lowercased = value.replace('&', " and ").to_lowercase();
    let folded = lowercased
        .nfd()
        .filter(|character| !is_combining_mark(*character))
        .fold(String::new(), |mut normalized, character| {
            match character {
                'æ' => normalized.push_str("ae"),
                'œ' => normalized.push_str("oe"),
                'ø' => normalized.push('o'),
                'ð' => normalized.push('d'),
                'þ' => normalized.push_str("th"),
                'ł' => normalized.push('l'),
                'ß' => normalized.push_str("ss"),
                _ => normalized.push(character),
            }
            normalized
        });

    folded
        .split(|character: char| !character.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
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

    #[test]
    fn musicbrainz_artist_export_table_uses_visible_rows() {
        let input = MusicBrainzArtistExportRequest {
            artist_key: "pet shop boys".to_string(),
            artist_name: "Pet Shop Boys".to_string(),
            musicbrainz_mbid: Some("mbid-psb".to_string()),
            matched_cache_name: Some("pet shop boys".to_string()),
            match_method: "verified-link".to_string(),
            artist_link_state: "verified".to_string(),
            artist_link_ignored: false,
            format: "csv".to_string(),
            rows: vec![
                MusicBrainzArtistExportRow {
                    release_mbid: "rg-owned".to_string(),
                    title: "Actually".to_string(),
                    year: Some(1987),
                    status: "owned".to_string(),
                    local_album_title: Some("Actually".to_string()),
                    local_year: Some(1987),
                    match_method: "exact-title".to_string(),
                    confidence: 1.0,
                },
                MusicBrainzArtistExportRow {
                    release_mbid: "rg-hidden".to_string(),
                    title: "Hidden Bootleg".to_string(),
                    year: Some(1988),
                    status: "excluded".to_string(),
                    local_album_title: None,
                    local_year: None,
                    match_method: "not-in-scope".to_string(),
                    confidence: 0.0,
                },
            ],
        };

        let visible_rows = visible_musicbrainz_artist_export_rows(&input.rows);
        let (headers, values) = musicbrainz_artist_export_table(&input, &visible_rows);

        assert_eq!(visible_rows.len(), 1);
        assert_eq!(headers[0], "Status");
        assert_eq!(values.len(), 1);
        assert_eq!(values[0][0], "Owned");
        assert_eq!(values[0][2], "Actually");
        assert_eq!(values[0][3], "Actually (1987)");
        assert_eq!(values[0][4], "100%");
        assert_eq!(
            values[0][6],
            "https://musicbrainz.org/release-group/rg-owned"
        );
        assert_eq!(values[0][9], "Verified");
    }

    #[test]
    fn compares_artist_discography_against_local_albums() {
        let temp_dir = temp_cache_dir("discography");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let app_conn = create_artist_app_db();

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare artist discography");

        assert_eq!(response.state, "available");
        assert_eq!(response.musicbrainz_mbid.as_deref(), Some("mbid-psb"));
        assert_eq!(response.pure_album_count, 2);
        assert_eq!(response.owned_count, 1);
        assert_eq!(response.missing_count, 1);
        assert_eq!(response.excluded_count, 0);
        assert_eq!(response.local_album_count, 2);
        assert_eq!(response.completion, Some(0.5));
        assert!(response
            .releases
            .iter()
            .any(|release| release.title == "Actually"
                && release.status == "owned"
                && release.local_album_title.as_deref() == Some("Actually")));
        assert!(response
            .releases
            .iter()
            .any(|release| release.title == "Please" && release.status == "missing"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn refreshed_release_group_overlay_overrides_stale_cache_rows() {
        let temp_dir = temp_cache_dir("discography-overlay");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let mut app_conn = create_artist_app_db();
        create_decision_tables(&app_conn);

        save_refreshed_artist_release_groups(
            &mut app_conn,
            "mbid-psb",
            &[
                RefreshedReleaseGroup {
                    release_mbid: "release-actually".to_string(),
                    title: "Actually".to_string(),
                    year: Some(1987),
                    primary_type: "Album".to_string(),
                    secondary_types: String::new(),
                    track_count: None,
                    status: "Official".to_string(),
                },
                RefreshedReleaseGroup {
                    release_mbid: "release-nonetheless".to_string(),
                    title: "Nonetheless".to_string(),
                    year: Some(2024),
                    primary_type: "Album".to_string(),
                    secondary_types: String::new(),
                    track_count: None,
                    status: "Official".to_string(),
                },
            ],
            "2026-07-06T12:00:00Z",
        )
        .expect("save refreshed rows");

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare artist discography with refreshed overlay");

        assert_eq!(response.release_group_source, "refreshed");
        assert_eq!(
            response.release_group_updated_at.as_deref(),
            Some("2026-07-06T12:00:00Z")
        );
        assert!(response
            .releases
            .iter()
            .any(|release| release.title == "Nonetheless" && release.status == "missing"));
        assert!(!response
            .releases
            .iter()
            .any(|release| release.title == "Please"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn release_decisions_exclude_rows_from_missing_counts() {
        let temp_dir = temp_cache_dir("discography-decision");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let app_conn = create_artist_app_db();
        create_decision_tables(&app_conn);

        set_release_decision_for_connection(
            &app_conn,
            MusicBrainzReleaseDecisionRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
                musicbrainz_mbid: Some("mbid-psb".to_string()),
                release_mbid: "release-please".to_string(),
                decision: "not-in-scope".to_string(),
                local_album_id: None,
            },
        )
        .expect("save release decision");

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare artist discography with decision");

        assert_eq!(response.pure_album_count, 1);
        assert_eq!(response.owned_count, 1);
        assert_eq!(response.missing_count, 0);
        assert_eq!(response.excluded_count, 1);
        assert_eq!(response.completion, Some(1.0));
        let excluded = response
            .releases
            .iter()
            .find(|release| release.release_mbid == "release-please")
            .expect("excluded release row");
        assert_eq!(excluded.status, "excluded");
        assert_eq!(excluded.decision.as_deref(), Some("not-in-scope"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn release_status_cache_auto_excludes_non_official_groups() {
        let temp_dir = temp_cache_dir("discography-official-status");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let app_conn = create_artist_app_db();
        create_decision_tables(&app_conn);
        app_conn
            .execute(
                "
                INSERT INTO musicbrainz_release_status_cache (
                    artist_mbid, release_mbid, has_official_release, checked_at
                ) VALUES
                    ('mbid-psb', 'release-actually', 1, '2026-07-05T00:00:00Z'),
                    ('mbid-psb', 'release-please', 0, '2026-07-05T00:00:00Z')
                ",
                [],
            )
            .expect("seed official status cache");

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare artist discography with official status cache");

        assert_eq!(response.pure_album_count, 1);
        assert_eq!(response.owned_count, 1);
        assert_eq!(response.missing_count, 0);
        assert_eq!(response.excluded_count, 1);
        assert_eq!(response.completion, Some(1.0));
        let excluded = response
            .releases
            .iter()
            .find(|release| release.release_mbid == "release-please")
            .expect("excluded release row");
        assert_eq!(excluded.status, "excluded");
        assert_eq!(excluded.decision.as_deref(), Some("auto-not-official"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn warns_for_suspect_artist_cache_mapping() {
        let temp_dir = temp_cache_dir("discography-warning");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, true);
        let app_conn = create_artist_app_db();

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare suspect artist discography");

        assert_eq!(response.state, "warning");
        assert!(response.suspect_mapping);
        assert_eq!(response.cached_name_count, 2);
        assert!(response
            .candidates
            .iter()
            .any(|candidate| candidate.name == "psb"
                && candidate.mbid == "mbid-psb"
                && candidate.match_method == "same-mbid-name"));

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn returns_high_confidence_fuzzy_artist_candidates_when_cache_lookup_fails() {
        let temp_dir = temp_cache_dir("discography-fuzzy-candidates");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let cache_conn = Connection::open(&cache_path).expect("open test cache");
        cache_conn
            .execute(
                "INSERT INTO artist_cache (name, mbid, cached_at) VALUES ('the legendary electronic pet shop boys', 'mbid-long-psb', '2026-02-01 12:07:00')",
                [],
            )
            .expect("insert fuzzy artist candidate");
        cache_conn
            .execute(
                "
                INSERT INTO release_groups (
                    artist_mbid, release_mbid, title, year, type, secondary_types,
                    track_count, status, cached_at
                ) VALUES ('mbid-long-psb', 'release-long-please', 'Please Again', 1986, 'Album', '', 11, 'Official', '2026-02-01 12:08:00')
                ",
                [],
            )
            .expect("insert fuzzy artist candidate release");
        drop(cache_conn);
        let app_conn = create_artist_app_db();

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "legendary electronic pet shop boys".to_string(),
                artist_name: "Legendary Electronic Pet Shop Boys".to_string(),
            },
        )
        .expect("compare artist discography with fuzzy candidates");

        assert_eq!(response.state, "notFound");
        assert_eq!(response.musicbrainz_mbid, None);
        assert!(response.releases.is_empty());
        let candidate = response
            .candidates
            .iter()
            .find(|candidate| candidate.name == "the legendary electronic pet shop boys")
            .expect("high-confidence fuzzy candidate");
        assert_eq!(candidate.mbid, "mbid-long-psb");
        assert_eq!(candidate.match_method, "fuzzy-name");
        assert!(candidate.score >= FUZZY_ARTIST_CANDIDATE_THRESHOLD);

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn suppresses_low_confidence_fuzzy_artist_candidates_when_cache_lookup_fails() {
        let temp_dir = temp_cache_dir("discography-low-fuzzy-candidates");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let app_conn = create_artist_app_db();

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boyz".to_string(),
                artist_name: "Pet Shop Boyz".to_string(),
            },
        )
        .expect("compare artist discography with low-confidence fuzzy candidates");

        assert_eq!(response.state, "notFound");
        assert_eq!(response.musicbrainz_mbid, None);
        assert!(response.releases.is_empty());
        assert!(response.candidates.is_empty());

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn verified_artist_link_overrides_suspect_cache_mapping() {
        let temp_dir = temp_cache_dir("discography-verified");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, true);
        let app_conn = create_artist_app_db();
        app_conn
            .execute_batch(
                "
                CREATE TABLE musicbrainz_artist_links (
                    local_artist_key TEXT PRIMARY KEY,
                    display_artist TEXT NOT NULL DEFAULT '',
                    mbid TEXT NOT NULL,
                    canonical_name TEXT,
                    match_method TEXT NOT NULL DEFAULT 'verified-link',
                    verification_state TEXT NOT NULL,
                    ignored INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO musicbrainz_artist_links (
                    local_artist_key, display_artist, mbid, canonical_name, match_method,
                    verification_state, ignored
                ) VALUES (
                    'pet shop boys', 'Pet Shop Boys', 'mbid-psb', 'Pet Shop Boys',
                    'verified-link', 'verified', 0
                );
                ",
            )
            .expect("seed verified artist link");

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare verified artist discography");

        assert_eq!(response.state, "available");
        assert!(!response.suspect_mapping);
        assert_eq!(response.cached_name_count, 2);
        assert_eq!(response.match_method, "verified-link");
        assert_eq!(response.artist_link_state, "verified");
        assert!(!response.artist_link_ignored);
        assert_eq!(
            response.matched_cache_name.as_deref(),
            Some("Pet Shop Boys")
        );

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn ignored_artist_link_suppresses_discography_rows() {
        let temp_dir = temp_cache_dir("discography-ignored");
        let cache_path = temp_dir.join("musicbrainz_cache.db");
        create_discography_cache(&cache_path, false);
        let app_conn = create_artist_app_db();
        create_decision_tables(&app_conn);
        app_conn
            .execute(
                "
                INSERT INTO musicbrainz_artist_links (
                    local_artist_key, display_artist, mbid, canonical_name, match_method,
                    confidence, verification_state, ignored, created_at, updated_at
                ) VALUES (
                    'pet shop boys', 'Pet Shop Boys', 'mbid-psb', 'Pet Shop Boys', 'ignored',
                    NULL, 'ignored', 1, datetime('now'), datetime('now')
                )
                ",
                [],
            )
            .expect("seed ignored artist link");

        let response = artist_discography_for_connection(
            &app_conn,
            Some(cache_path.display().to_string()),
            MusicBrainzArtistDiscographyRequest {
                artist_key: "pet shop boys".to_string(),
                artist_name: "Pet Shop Boys".to_string(),
            },
        )
        .expect("compare ignored artist discography");

        assert_eq!(response.state, "ignored");
        assert_eq!(response.artist_link_state, "ignored");
        assert!(response.artist_link_ignored);
        assert_eq!(response.match_method, "ignored");
        assert_eq!(response.musicbrainz_mbid.as_deref(), Some("mbid-psb"));
        assert_eq!(response.local_album_count, 2);
        assert_eq!(response.pure_album_count, 0);
        assert_eq!(response.owned_count, 0);
        assert_eq!(response.missing_count, 0);
        assert!(response.releases.is_empty());

        fs::remove_dir_all(temp_dir).expect("remove temp dir");
    }

    #[test]
    fn saves_manual_artist_link_decisions() {
        let app_conn = Connection::open_in_memory().expect("open app db");
        create_decision_tables(&app_conn);
        let def_leppard_mbid = "7249B899-8DB8-43E7-9E6E-22F1E736024E".to_string();

        set_artist_link_for_connection(
            &app_conn,
            MusicBrainzArtistLinkRequest {
                artist_key: "def leppard".to_string(),
                artist_name: "Def Leppard".to_string(),
                action: "set".to_string(),
                musicbrainz_mbid: Some(def_leppard_mbid),
                canonical_name: Some("Def Leppard".to_string()),
            },
        )
        .expect("save manual artist link");

        let saved = app_conn
            .query_row(
                "
                SELECT mbid, canonical_name, match_method, verification_state, ignored
                FROM musicbrainz_artist_links
                WHERE local_artist_key = 'def leppard'
                ",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .expect("read saved manual artist link");

        assert_eq!(saved.0, "7249b899-8db8-43e7-9e6e-22f1e736024e");
        assert_eq!(saved.1.as_deref(), Some("Def Leppard"));
        assert_eq!(saved.2, "manual-mbid");
        assert_eq!(saved.3, "verified");
        assert_eq!(saved.4, 0);

        set_artist_link_for_connection(
            &app_conn,
            MusicBrainzArtistLinkRequest {
                artist_key: "def leppard".to_string(),
                artist_name: "Def Leppard".to_string(),
                action: "ignore".to_string(),
                musicbrainz_mbid: Some("7249b899-8db8-43e7-9e6e-22f1e736024e".to_string()),
                canonical_name: Some("Def Leppard".to_string()),
            },
        )
        .expect("save ignored artist link");

        let ignored = app_conn
            .query_row(
                "
                SELECT match_method, verification_state, ignored
                FROM musicbrainz_artist_links
                WHERE local_artist_key = 'def leppard'
                ",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .expect("read ignored artist link");

        assert_eq!(ignored.0, "ignored");
        assert_eq!(ignored.1, "ignored");
        assert_eq!(ignored.2, 1);

        set_artist_link_for_connection(
            &app_conn,
            MusicBrainzArtistLinkRequest {
                artist_key: "def leppard".to_string(),
                artist_name: "Def Leppard".to_string(),
                action: "unlink".to_string(),
                musicbrainz_mbid: None,
                canonical_name: None,
            },
        )
        .expect("unlink artist link");

        let remaining = app_conn
            .query_row(
                "SELECT COUNT(*) FROM musicbrainz_artist_links WHERE local_artist_key = 'def leppard'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count remaining artist links");
        assert_eq!(remaining, 0);
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

    fn create_discography_cache(path: &Path, include_alias: bool) {
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
                ('pet shop boys', 'mbid-psb', '2026-02-01 12:00:00');
            INSERT INTO release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                track_count, status, cached_at
            ) VALUES
                ('mbid-psb', 'release-please', 'Please', 1986, 'Album', '', 11, 'Official', '2026-02-01 12:03:00'),
                ('mbid-psb', 'release-actually', 'Actually', 1987, 'Album', '', 10, 'Official', '2026-02-01 12:04:00'),
                ('mbid-psb', 'release-disco', 'Disco', 1986, 'Album', 'Remix', 6, 'Official', '2026-02-01 12:05:00');
            ",
        )
        .expect("seed discography cache");

        if include_alias {
            conn.execute(
                "INSERT INTO artist_cache (name, mbid, cached_at) VALUES ('psb', 'mbid-psb', '2026-02-01 12:06:00')",
                [],
            )
            .expect("insert alias");
        }
    }

    fn create_artist_app_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open app db");
        conn.execute_batch(
            "
            CREATE TABLE albums (
                id TEXT PRIMARY KEY,
                album TEXT,
                album_artist_display TEXT,
                year INTEGER
            );
            INSERT INTO albums (id, album, album_artist_display, year) VALUES
                ('local-actually', 'Actually', 'Pet Shop Boys', 1987),
                ('local-local-only', 'A Local Compilation', 'Pet Shop Boys', 1992),
                ('local-other', 'The Queen Is Dead', 'The Smiths', 1986);
            ",
        )
        .expect("seed app albums");
        conn
    }

    fn create_decision_tables(conn: &Connection) {
        conn.execute_batch(
            "
            CREATE TABLE musicbrainz_artist_links (
                local_artist_key TEXT PRIMARY KEY,
                display_artist TEXT NOT NULL,
                mbid TEXT,
                canonical_name TEXT,
                match_method TEXT NOT NULL DEFAULT 'unverified',
                confidence REAL,
                verification_state TEXT NOT NULL DEFAULT 'unverified',
                ignored INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE musicbrainz_release_decisions (
                local_artist_key TEXT NOT NULL,
                release_mbid TEXT NOT NULL,
                decision TEXT NOT NULL,
                local_album_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (local_artist_key, release_mbid),
                FOREIGN KEY(local_artist_key) REFERENCES musicbrainz_artist_links(local_artist_key)
                    ON DELETE CASCADE
            );
            CREATE TABLE musicbrainz_release_status_cache (
                artist_mbid TEXT NOT NULL,
                release_mbid TEXT NOT NULL,
                has_official_release INTEGER NOT NULL,
                checked_at TEXT NOT NULL,
                PRIMARY KEY (artist_mbid, release_mbid)
            );
            CREATE TABLE musicbrainz_artist_release_groups (
                artist_mbid TEXT NOT NULL,
                release_mbid TEXT NOT NULL,
                title TEXT NOT NULL,
                year INTEGER,
                type TEXT,
                secondary_types TEXT NOT NULL DEFAULT '',
                track_count INTEGER,
                status TEXT NOT NULL DEFAULT 'Official',
                source TEXT NOT NULL DEFAULT 'musicbrainz-live',
                fetched_at TEXT NOT NULL,
                PRIMARY KEY (artist_mbid, release_mbid)
            );
            ",
        )
        .expect("create decision tables");
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
