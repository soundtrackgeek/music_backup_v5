#[cfg(not(test))]
use crate::db;
use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
#[cfg(not(test))]
use tauri::AppHandle;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

const MAX_TITLE_LENGTH: usize = 300;
const MAX_ARTIST_LENGTH: usize = 300;
const MAX_ARTIST_DISCOVERY_ALBUMS: usize = 100;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddWishListItemRequest {
    pub entity: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    pub year: Option<i32>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    #[serde(default = "default_source")]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListItem {
    pub id: i64,
    pub entity: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i32>,
    pub musicbrainz_id: Option<String>,
    pub musicbrainz_url: Option<String>,
    pub source: String,
    pub created_at: String,
    pub downloaded_deezer_album_id: Option<String>,
    pub downloaded_path: Option<String>,
    pub downloaded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListResponse {
    pub items: Vec<WishListItem>,
    pub auto_removed_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumDiscoveryRequest {
    pub wish_list_item_id: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumDiscoveryRow {
    pub release_group_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub secondary_types: Vec<String>,
    pub musicbrainz_url: String,
    pub deemix_matches: Vec<crate::deemix::DeemixAlbumMatch>,
    pub deemix_error: Option<String>,
    pub downloaded_deezer_album_id: Option<String>,
    pub downloaded_path: Option<String>,
    pub downloaded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListArtistAlbumDiscoveryResponse {
    pub wish_list_item_id: i64,
    pub artist: String,
    pub musicbrainz_id: String,
    pub official_album_count: usize,
    pub searched_album_count: usize,
    pub matched_album_count: usize,
    pub truncated: bool,
    pub albums: Vec<WishListArtistAlbumDiscoveryRow>,
    pub searched_at: String,
}

#[derive(Debug, Clone)]
struct DownloadReceiptSummary {
    deezer_album_id: String,
    destination_path: String,
    completed_at: String,
}

#[derive(Debug, Default)]
struct OwnedLibrary {
    artist_ids: HashSet<String>,
    artist_names: HashSet<String>,
    album_ids: HashSet<String>,
    albums: HashSet<String>,
}

fn default_source() -> String {
    "MusicBrainz".to_string()
}

fn normalize_key(value: &str) -> String {
    let expanded = value.replace('&', " and ");
    let mut normalized = String::new();
    let mut pending_space = false;
    for character in expanded
        .nfkd()
        .filter(|character| !is_combining_mark(*character))
        .flat_map(char::to_lowercase)
    {
        if character.is_alphanumeric() {
            if pending_space && !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push(character);
            pending_space = false;
        } else {
            pending_space = true;
        }
    }
    normalized
}

fn album_key(artist: &str, title: &str) -> String {
    format!("{}\u{1f}{}", normalize_key(artist), normalize_key(title))
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
            params![table],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn load_owned_library(conn: &Connection) -> Result<OwnedLibrary> {
    let mut owned = OwnedLibrary::default();
    let mut album_statement = conn.prepare(
        "SELECT album_artist_display, album FROM albums WHERE TRIM(COALESCE(album, '')) <> ''",
    )?;
    let albums = album_statement.query_map([], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?.unwrap_or_default(),
            row.get::<_, Option<String>>(1)?.unwrap_or_default(),
        ))
    })?;
    for album in albums {
        let (artist, title) = album?;
        if !artist.trim().is_empty() {
            owned.artist_names.insert(normalize_key(&artist));
        }
        owned.albums.insert(album_key(&artist, &title));
    }
    drop(album_statement);

    let mut artist_statement = conn.prepare(
        "SELECT DISTINCT display_artist FROM tracks WHERE TRIM(COALESCE(display_artist, '')) <> ''",
    )?;
    let artists = artist_statement.query_map([], |row| row.get::<_, String>(0))?;
    for artist in artists {
        owned.artist_names.insert(normalize_key(&artist?));
    }
    drop(artist_statement);

    if table_exists(conn, "musicbrainz_artist_links")? {
        let mut statement = conn.prepare(
            "SELECT mbid FROM musicbrainz_artist_links WHERE ignored = 0 AND TRIM(COALESCE(mbid, '')) <> ''",
        )?;
        let ids = statement.query_map([], |row| row.get::<_, String>(0))?;
        for id in ids {
            owned.artist_ids.insert(id?.to_lowercase());
        }
    }

    if table_exists(conn, "musicbrainz_release_decisions")? {
        let mut statement = conn.prepare(
            "SELECT release_mbid FROM musicbrainz_release_decisions WHERE local_album_id IS NOT NULL AND TRIM(local_album_id) <> ''",
        )?;
        let ids = statement.query_map([], |row| row.get::<_, String>(0))?;
        for id in ids {
            owned.album_ids.insert(id?.to_lowercase());
        }
    }
    Ok(owned)
}

impl OwnedLibrary {
    fn contains(&self, item: &WishListItem) -> bool {
        match item.entity.as_str() {
            "artist" => {
                item.musicbrainz_id
                    .as_deref()
                    .is_some_and(|id| self.artist_ids.contains(&id.to_lowercase()))
                    || self.artist_names.contains(&normalize_key(&item.title))
            }
            "album" => {
                item.musicbrainz_id
                    .as_deref()
                    .is_some_and(|id| self.album_ids.contains(&id.to_lowercase()))
                    || self.albums.contains(&album_key(&item.artist, &item.title))
            }
            _ => false,
        }
    }
}

fn item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WishListItem> {
    Ok(WishListItem {
        id: row.get(0)?,
        entity: row.get(1)?,
        title: row.get(2)?,
        artist: row.get(3)?,
        year: row.get(4)?,
        musicbrainz_id: row.get(5)?,
        musicbrainz_url: row.get(6)?,
        source: row.get(7)?,
        created_at: row.get(8)?,
        downloaded_deezer_album_id: row.get(9)?,
        downloaded_path: row.get(10)?,
        downloaded_at: row.get(11)?,
    })
}

fn load_item(conn: &Connection, id: i64) -> Result<WishListItem> {
    conn.query_row(
        "
        SELECT wish.id, wish.entity, wish.title, wish.artist, wish.year,
               wish.musicbrainz_id, wish.musicbrainz_url, wish.source, wish.created_at,
               download.deezer_album_id, download.destination_path, download.completed_at
        FROM wish_list_items wish
        LEFT JOIN deemix_downloads download ON download.id = (
            SELECT latest.id
            FROM deemix_downloads latest
            WHERE latest.wish_list_item_id = wish.id
               OR (
                    wish.entity = 'album'
                    AND wish.musicbrainz_id IS NOT NULL
                    AND latest.musicbrainz_release_group_id = wish.musicbrainz_id
               )
            ORDER BY latest.completed_at DESC, latest.id DESC
            LIMIT 1
        )
        WHERE wish.id = ?1
        ",
        params![id],
        item_from_row,
    )
    .with_context(|| format!("Could not load wish list item {id}"))
}

fn all_items(conn: &Connection) -> Result<Vec<WishListItem>> {
    let mut statement = conn.prepare(
        "
        SELECT wish.id, wish.entity, wish.title, wish.artist, wish.year,
               wish.musicbrainz_id, wish.musicbrainz_url, wish.source, wish.created_at,
               download.deezer_album_id, download.destination_path, download.completed_at
        FROM wish_list_items wish
        LEFT JOIN deemix_downloads download ON download.id = (
            SELECT latest.id
            FROM deemix_downloads latest
            WHERE latest.wish_list_item_id = wish.id
               OR (
                    wish.entity = 'album'
                    AND wish.musicbrainz_id IS NOT NULL
                    AND latest.musicbrainz_release_group_id = wish.musicbrainz_id
               )
            ORDER BY latest.completed_at DESC, latest.id DESC
            LIMIT 1
        )
        ORDER BY wish.created_at DESC, wish.id DESC
        ",
    )?;
    let items = statement
        .query_map([], item_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

pub(crate) fn reconcile_for_connection(conn: &Connection) -> Result<usize> {
    if !table_exists(conn, "wish_list_items")? {
        return Ok(0);
    }
    let owned = load_owned_library(conn)?;
    let removed_ids = all_items(conn)?
        .into_iter()
        .filter(|item| owned.contains(item))
        .map(|item| item.id)
        .collect::<Vec<_>>();
    for id in &removed_ids {
        conn.execute("DELETE FROM wish_list_items WHERE id = ?1", params![id])?;
    }
    Ok(removed_ids.len())
}

fn list(conn: &Connection) -> Result<WishListResponse> {
    let auto_removed_count = reconcile_for_connection(conn)?;
    Ok(WishListResponse {
        items: all_items(conn)?,
        auto_removed_count,
    })
}

fn validate_request(input: &mut AddWishListItemRequest) -> Result<()> {
    input.entity = input.entity.trim().to_lowercase();
    if !matches!(input.entity.as_str(), "artist" | "album") {
        bail!("Wish list items must be an artist or album.")
    }
    input.title = input.title.trim().chars().take(MAX_TITLE_LENGTH).collect();
    input.artist = input
        .artist
        .trim()
        .chars()
        .take(MAX_ARTIST_LENGTH)
        .collect();
    if input.title.is_empty() {
        bail!("A wish list item needs a title.")
    }
    if input.entity == "album" && input.artist.is_empty() {
        bail!("A wish list album needs an artist.")
    }
    if let Some(year) = input.year {
        if !(1000..=3000).contains(&year) {
            bail!("The wish list year is outside the supported range.")
        }
    }
    input.source = input.source.trim().to_string();
    if input.source.is_empty() || input.source.chars().count() > 80 {
        bail!("A wish list item needs a valid source.")
    }
    input.musicbrainz_id = input
        .musicbrainz_id
        .take()
        .map(|id| id.trim().to_lowercase())
        .filter(|id| !id.is_empty());
    input.musicbrainz_url = input
        .musicbrainz_url
        .take()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty());
    if let Some(url) = &input.musicbrainz_url {
        let prefix = if input.entity == "artist" {
            "https://musicbrainz.org/artist/"
        } else {
            "https://musicbrainz.org/release-group/"
        };
        if !url.starts_with(prefix) || url.len() <= prefix.len() {
            bail!("The wish list MusicBrainz link is not valid for this item.")
        }
    }
    Ok(())
}

fn identity_key(input: &AddWishListItemRequest) -> String {
    if let Some(musicbrainz_id) = &input.musicbrainz_id {
        return format!("{}\u{1f}mbid\u{1f}{}", input.entity, musicbrainz_id);
    }
    format!(
        "{}\u{1f}name\u{1f}{}",
        input.entity,
        album_key(&input.artist, &input.title)
    )
}

fn add(conn: &Connection, mut input: AddWishListItemRequest) -> Result<WishListItem> {
    validate_request(&mut input)?;
    reconcile_for_connection(conn)?;
    let proposed = WishListItem {
        id: 0,
        entity: input.entity.clone(),
        title: input.title.clone(),
        artist: input.artist.clone(),
        year: input.year,
        musicbrainz_id: input.musicbrainz_id.clone(),
        musicbrainz_url: input.musicbrainz_url.clone(),
        source: input.source.clone(),
        created_at: String::new(),
        downloaded_deezer_album_id: None,
        downloaded_path: None,
        downloaded_at: None,
    };
    if load_owned_library(conn)?.contains(&proposed) {
        bail!("This item is already in your library.")
    }

    let identity_key = identity_key(&input);
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM wish_list_items WHERE identity_key = ?1",
            params![identity_key],
            |row| row.get::<_, i64>(0),
        )
        .optional()?
    {
        return load_item(conn, id);
    }

    let created_at = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO wish_list_items (entity, title, artist, year, musicbrainz_id, musicbrainz_url, source, identity_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![input.entity, input.title, input.artist, input.year, input.musicbrainz_id, input.musicbrainz_url, input.source, identity_key, created_at],
    )?;
    load_item(conn, conn.last_insert_rowid())
}

fn remove(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM wish_list_items WHERE id = ?1", params![id])?;
    Ok(())
}

fn download_receipt_for_release(
    conn: &Connection,
    release_group_id: &str,
) -> Result<Option<DownloadReceiptSummary>> {
    conn.query_row(
        "
        SELECT deezer_album_id, destination_path, completed_at
        FROM deemix_downloads
        WHERE musicbrainz_release_group_id = ?1
        ORDER BY completed_at DESC, id DESC
        LIMIT 1
        ",
        params![release_group_id],
        |row| {
            Ok(DownloadReceiptSummary {
                deezer_album_id: row.get(0)?,
                destination_path: row.get(1)?,
                completed_at: row.get(2)?,
            })
        },
    )
    .optional()
    .context("Could not load the Deemix download receipt")
}

#[cfg(not(test))]
pub fn discover_artist_albums_for_app(
    app: &AppHandle,
    request: WishListArtistAlbumDiscoveryRequest,
) -> Result<WishListArtistAlbumDiscoveryResponse> {
    if request.wish_list_item_id <= 0 {
        bail!("The Wish List artist selection is invalid.")
    }
    let (conn, _) = db::open(app)?;
    let item = load_item(&conn, request.wish_list_item_id)?;
    if item.entity != "artist" {
        bail!("Artist album discovery requires an artist Wish List item.")
    }
    let musicbrainz_id = item
        .musicbrainz_id
        .clone()
        .context("This artist has no MusicBrainz ID to verify official albums.")?;

    crate::deemix::validate_search_connection()?;
    let official_albums =
        crate::musicbrainz::official_album_release_groups_for_wishlist(&musicbrainz_id)?;
    let official_album_count = official_albums.len();
    let truncated = official_album_count > MAX_ARTIST_DISCOVERY_ALBUMS;
    let selected_albums = official_albums
        .into_iter()
        .take(MAX_ARTIST_DISCOVERY_ALBUMS)
        .collect::<Vec<_>>();
    let searched_album_count = selected_albums.len();
    let mut rows = Vec::with_capacity(searched_album_count);

    for album in selected_albums {
        let receipt = download_receipt_for_release(&conn, &album.release_mbid)?;
        let search = crate::deemix::search_albums_after_validation(
            crate::deemix::DeemixAlbumSearchRequest {
                title: album.title.clone(),
                artist: item.title.clone(),
                year: album.year,
                limit: Some(4),
            },
        );
        let (mut matches, deemix_error) = match search {
            Ok(response) => (response.matches, None),
            Err(error) => (Vec::new(), Some(error.to_string())),
        };
        if let Some(receipt) = &receipt {
            for album_match in &mut matches {
                if album_match.id == receipt.deezer_album_id {
                    album_match.downloaded_at = Some(receipt.completed_at.clone());
                    album_match.downloaded_path = Some(receipt.destination_path.clone());
                }
            }
        }
        rows.push(WishListArtistAlbumDiscoveryRow {
            release_group_id: album.release_mbid.clone(),
            title: album.title,
            year: album.year,
            secondary_types: album.secondary_types,
            musicbrainz_url: format!(
                "https://musicbrainz.org/release-group/{}",
                album.release_mbid
            ),
            deemix_matches: matches,
            deemix_error,
            downloaded_deezer_album_id: receipt.as_ref().map(|value| value.deezer_album_id.clone()),
            downloaded_path: receipt.as_ref().map(|value| value.destination_path.clone()),
            downloaded_at: receipt.map(|value| value.completed_at),
        });
    }

    let matched_album_count = rows
        .iter()
        .filter(|album| !album.deemix_matches.is_empty())
        .count();
    Ok(WishListArtistAlbumDiscoveryResponse {
        wish_list_item_id: item.id,
        artist: item.title,
        musicbrainz_id,
        official_album_count,
        searched_album_count,
        matched_album_count,
        truncated,
        albums: rows,
        searched_at: Utc::now().to_rfc3339(),
    })
}

#[cfg(not(test))]
pub fn list_for_app(app: &AppHandle) -> Result<WishListResponse> {
    let (conn, _) = db::open(app)?;
    list(&conn)
}

#[cfg(not(test))]
pub fn add_for_app(app: &AppHandle, input: AddWishListItemRequest) -> Result<WishListItem> {
    let (conn, _) = db::open(app)?;
    add(&conn, input)
}

#[cfg(not(test))]
pub fn remove_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = db::open(app)?;
    remove(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::configure(&conn).expect("configure database");
        crate::db::migrate(&conn).expect("migrate database");
        conn.execute(
            "INSERT INTO import_runs (source_path, started_at, status) VALUES ('test', '2026-07-19', 'running')",
            [],
        )
        .expect("create import run");
        conn
    }

    fn album_request(id: &str, title: &str, artist: &str) -> AddWishListItemRequest {
        AddWishListItemRequest {
            entity: "album".to_string(),
            title: title.to_string(),
            artist: artist.to_string(),
            year: Some(1992),
            musicbrainz_id: Some(id.to_string()),
            musicbrainz_url: Some(format!("https://musicbrainz.org/release-group/{id}")),
            source: "MusicBrainz".to_string(),
        }
    }

    #[test]
    fn adds_lists_deduplicates_and_removes_items() {
        let conn = connection();
        let first = add(&conn, album_request("release-1", "Wish", "The Artist")).expect("add item");
        let duplicate =
            add(&conn, album_request("release-1", "Wish", "The Artist")).expect("deduplicate item");
        assert_eq!(first.id, duplicate.id);
        assert_eq!(list(&conn).expect("list items").items.len(), 1);

        remove(&conn, first.id).expect("remove item");
        assert!(list(&conn).expect("list empty").items.is_empty());
    }

    #[test]
    fn reconciliation_removes_acquired_albums_and_artists() {
        let conn = connection();
        add(&conn, album_request("release-2", "Déjà Vu", "Beyoncé")).expect("add album");
        add(
            &conn,
            AddWishListItemRequest {
                entity: "artist".to_string(),
                title: "New Artist".to_string(),
                artist: String::new(),
                year: None,
                musicbrainz_id: Some("artist-1".to_string()),
                musicbrainz_url: Some("https://musicbrainz.org/artist/artist-1".to_string()),
                source: "MusicBrainz".to_string(),
            },
        )
        .expect("add artist");
        conn.execute(
            "INSERT INTO albums (id, import_run_id, album, album_artist_display, total_tracks, rated_tracks, rating_completeness, total_seconds, loved_tracks, tmoe_seconds, ae_ratio) VALUES ('album-1', 1, 'Deja Vu', 'Beyonce', 1, 0, 0, 180, 0, 0, 0)",
            [],
        )
        .expect("insert acquired album");
        conn.execute(
            "INSERT INTO tracks (import_run_id, album_id, display_artist, title, row_hash) VALUES (1, 'album-1', 'New Artist', 'Track', 'hash')",
            [],
        )
        .expect("insert acquired artist");

        let response = list(&conn).expect("reconcile list");
        assert_eq!(response.auto_removed_count, 2);
        assert!(response.items.is_empty());
    }

    #[test]
    fn lists_the_latest_download_receipt_on_an_album_wish() {
        let conn = connection();
        let item =
            add(&conn, album_request("release-3", "Wish", "The Artist")).expect("add album wish");
        conn.execute(
            "
            INSERT INTO deemix_downloads (
                deezer_album_id, wish_list_item_id, musicbrainz_release_group_id,
                artist, album, year, quality, destination_path, cover_path,
                track_count, completed_at, source
            ) VALUES (
                '123', ?1, 'release-3', 'The Artist', 'Wish', 1992, 'mp3_320',
                'D:\\Music\\The Artist - Wish (1992)', NULL, 10,
                '2026-07-26T12:00:00Z', 'download'
            )
            ",
            params![item.id],
        )
        .expect("insert download receipt");

        let response = list(&conn).expect("list wish with receipt");
        assert_eq!(
            response.items[0].downloaded_deezer_album_id.as_deref(),
            Some("123")
        );
        assert_eq!(
            response.items[0].downloaded_path.as_deref(),
            Some(r"D:\Music\The Artist - Wish (1992)")
        );
        assert_eq!(
            response.items[0].downloaded_at.as_deref(),
            Some("2026-07-26T12:00:00Z")
        );
    }
}
