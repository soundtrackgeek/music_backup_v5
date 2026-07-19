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
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WishListResponse {
    pub items: Vec<WishListItem>,
    pub auto_removed_count: usize,
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
    })
}

fn load_item(conn: &Connection, id: i64) -> Result<WishListItem> {
    conn.query_row(
        "SELECT id, entity, title, artist, year, musicbrainz_id, musicbrainz_url, source, created_at FROM wish_list_items WHERE id = ?1",
        params![id],
        item_from_row,
    )
    .with_context(|| format!("Could not load wish list item {id}"))
}

fn all_items(conn: &Connection) -> Result<Vec<WishListItem>> {
    let mut statement = conn.prepare(
        "SELECT id, entity, title, artist, year, musicbrainz_id, musicbrainz_url, source, created_at FROM wish_list_items ORDER BY created_at DESC, id DESC",
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
}
