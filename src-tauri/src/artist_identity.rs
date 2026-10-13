//! Catalog artist identities and reviewed album assignments. Assignments are
//! independent of imported rows so a catalog rebuild cannot undo a split.
use crate::{db, identity, models::MusicBrainzArtistLinkRequest, musicbrainz};
use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistIdentityChoice {
    pub id: String,
    pub name: String,
    pub disambiguation: Option<String>,
    pub musicbrainz_mbid: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistIdentityAlbum {
    pub id: String,
    pub title: String,
    pub year: Option<i32>,
    pub tracks: i64,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistSplitContext {
    pub artist: ArtistIdentityChoice,
    pub albums: Vec<ArtistIdentityAlbum>,
    pub other_artists: Vec<ArtistIdentityChoice>,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SplitArtistRequest {
    pub source_artist_id: String,
    pub album_ids: Vec<String>,
    pub target_artist_id: Option<String>,
    pub disambiguation: String,
    pub source_disambiguation: Option<String>,
    pub musicbrainz_mbid: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SplitArtistResult {
    pub artist_id: String,
    pub moved_albums: usize,
}

pub(crate) fn install_schema(conn: &Connection) -> Result<()> {
    for table in ["albums", "tracks"] {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name='artist_identity_key')",
            [table],
            |row| row.get(0),
        )?;
        if !exists {
            conn.execute_batch(&format!(
                "ALTER TABLE {table} ADD COLUMN artist_identity_key TEXT;"
            ))?;
        }
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS artist_identities (
            id TEXT PRIMARY KEY, name_key TEXT NOT NULL, display_artist TEXT NOT NULL,
            disambiguation TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE INDEX IF NOT EXISTS idx_artist_identities_name ON artist_identities(name_key);
         CREATE TABLE IF NOT EXISTS artist_album_assignments (
            album_id TEXT PRIMARY KEY, artist_id TEXT NOT NULL REFERENCES artist_identities(id),
            source_artist_key TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
         CREATE INDEX IF NOT EXISTS idx_artist_album_assignments_artist ON artist_album_assignments(artist_id);",
    )?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS artist_identity_revision(singleton INTEGER PRIMARY KEY CHECK(singleton=1),revision INTEGER NOT NULL);
         INSERT OR IGNORE INTO artist_identity_revision VALUES(1,0);
         CREATE TRIGGER IF NOT EXISTS artist_assignment_revision_insert AFTER INSERT ON artist_album_assignments BEGIN UPDATE artist_identity_revision SET revision=revision+1 WHERE singleton=1; END;
         CREATE TRIGGER IF NOT EXISTS artist_assignment_revision_update AFTER UPDATE ON artist_album_assignments BEGIN UPDATE artist_identity_revision SET revision=revision+1 WHERE singleton=1; END;
         CREATE TRIGGER IF NOT EXISTS artist_assignment_revision_delete AFTER DELETE ON artist_album_assignments BEGIN UPDATE artist_identity_revision SET revision=revision+1 WHERE singleton=1; END;
         CREATE TRIGGER IF NOT EXISTS artist_profile_revision_insert AFTER INSERT ON artist_identities BEGIN UPDATE artist_identity_revision SET revision=revision+1 WHERE singleton=1; END;
         CREATE TRIGGER IF NOT EXISTS artist_profile_revision_update AFTER UPDATE ON artist_identities WHEN OLD.disambiguation IS NOT NEW.disambiguation OR OLD.display_artist IS NOT NEW.display_artist BEGIN UPDATE artist_identity_revision SET revision=revision+1 WHERE singleton=1; END;",
    )?;
    for table in [
        "musicbrainz_artist_links",
        "musicbrainz_artist_infos",
        "musicbrainz_artist_origin_countries",
        "artist_biographies",
        "artist_images",
    ] {
        for event in ["INSERT", "UPDATE", "DELETE"] {
            conn.execute_batch(&format!(
                "CREATE TRIGGER IF NOT EXISTS artist_metadata_revision_{table}_{event}
                 AFTER {event} ON {table} BEGIN UPDATE artist_identity_revision SET revision=revision+1 WHERE singleton=1; END;"
            ))?;
        }
    }
    for (table, event, suffix) in [
        ("albums", "INSERT", "insert"),
        ("albums", "UPDATE OF id, album_artist_display", "update"),
        ("tracks", "INSERT", "insert"),
        (
            "tracks",
            "UPDATE OF album_id, album_artist_display",
            "update",
        ),
    ] {
        let id_column = if table == "albums" { "id" } else { "album_id" };
        let artist_name_field = if table == "tracks" {
            "COALESCE((SELECT album_artist_display FROM albums WHERE id=NEW.album_id), NEW.album_artist_display)"
        } else {
            "NEW.album_artist_display"
        };
        let name_key = identity::artist_key_sql(artist_name_field);
        let ambiguous = format!(
            "EXISTS(SELECT 1 FROM artist_identities WHERE name_key={name_key} AND id<>{name_key})"
        );
        // No foreign key to imported albums: imports delete and recreate them.
        conn.execute_batch(&format!(
            "CREATE TRIGGER IF NOT EXISTS artist_identity_{table}_{suffix}
             AFTER {event} ON {table} BEGIN
                INSERT OR IGNORE INTO artist_identities(id, name_key, display_artist)
                  VALUES ({name_key}, {name_key}, COALESCE(NULLIF(TRIM({artist_name_field}), ''), 'Unknown Artist'));
                INSERT OR IGNORE INTO artist_identities(id, name_key, display_artist, disambiguation)
                  SELECT 'unresolved:' || {name_key}, {name_key}, COALESCE(NULLIF(TRIM({artist_name_field}), ''), 'Unknown Artist'), 'Unassigned albums'
                  WHERE {ambiguous};
                INSERT OR IGNORE INTO musicbrainz_artist_link_tombstones(local_artist_key,display_artist,updated_at)
                  SELECT 'unresolved:' || {name_key}, {artist_name_field}, datetime('now') WHERE {ambiguous};
                UPDATE {table} SET artist_identity_key = COALESCE(
                    (SELECT artist_id FROM artist_album_assignments
                     WHERE album_id = NEW.{id_column} AND source_artist_key = {name_key}),
                    CASE WHEN {ambiguous} THEN 'unresolved:' || {name_key} ELSE {name_key} END)
                  WHERE id = NEW.id;
             END;"
        ))?;
    }
    conn.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS artist_identity_album_projection
         AFTER UPDATE OF artist_identity_key ON albums BEGIN
           UPDATE tracks SET artist_identity_key = NEW.artist_identity_key
             WHERE album_id = NEW.id;
         END;",
    )?;
    let legacy_key = identity::artist_key_sql("album_artist_display");
    conn.execute_batch(&format!(
        "INSERT OR IGNORE INTO artist_identities(id, name_key, display_artist)
         SELECT {legacy_key}, {legacy_key}, MIN(COALESCE(NULLIF(TRIM(album_artist_display), ''), 'Unknown Artist'))
         FROM albums GROUP BY {legacy_key};
         UPDATE albums SET artist_identity_key = COALESCE(
           (SELECT artist_id FROM artist_album_assignments WHERE album_id=albums.id AND source_artist_key={legacy_key}), {legacy_key})
         WHERE artist_identity_key IS NULL;
         UPDATE tracks SET artist_identity_key = COALESCE(
           (SELECT artist_identity_key FROM albums WHERE id=tracks.album_id), {legacy_key})
         WHERE artist_identity_key IS NULL;
         CREATE INDEX IF NOT EXISTS idx_albums_artist_identity ON albums({effective_key});
         CREATE INDEX IF NOT EXISTS idx_tracks_artist_identity ON tracks({effective_key});",
        effective_key = identity::catalog_artist_key_sql("album_artist_display")
    ))?;
    Ok(())
}

pub(crate) fn schema_exists(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT (SELECT count(*) FROM sqlite_master WHERE name IN (
           'artist_identities','artist_album_assignments','artist_identity_albums_insert',
           'artist_identity_albums_update','artist_identity_tracks_insert','artist_identity_tracks_update',
           'artist_identity_album_projection','idx_albums_artist_identity','idx_tracks_artist_identity',
           'artist_identity_revision','artist_assignment_revision_insert','artist_assignment_revision_update',
           'artist_assignment_revision_delete','artist_profile_revision_insert','artist_profile_revision_update'))=15
           AND EXISTS(SELECT 1 FROM pragma_table_info('albums') WHERE name='artist_identity_key')
           AND EXISTS(SELECT 1 FROM pragma_table_info('tracks') WHERE name='artist_identity_key')
           AND (SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name GLOB 'artist_metadata_revision_*')=15",
        [], |row| row.get(0),
    )?)
}

fn choice(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArtistIdentityChoice> {
    Ok(ArtistIdentityChoice {
        id: row.get(0)?,
        name: row.get(1)?,
        disambiguation: row.get(2)?,
        musicbrainz_mbid: row.get(3)?,
    })
}

pub(crate) fn split_context(conn: &Connection, artist_id: &str) -> Result<ArtistSplitContext> {
    let key = identity::catalog_artist_key_sql("a.album_artist_display");
    let artist = conn
        .query_row(
            "SELECT i.id, i.display_artist, i.disambiguation, l.mbid FROM artist_identities i
         LEFT JOIN musicbrainz_artist_links l ON l.local_artist_key=i.id AND l.ignored=0
         WHERE i.id=?1",
            [artist_id],
            choice,
        )
        .optional()?
        .context("The selected artist no longer exists. Refresh the artist list.")?;
    let mut stmt = conn.prepare(&format!(
        "SELECT a.id, COALESCE(a.album, 'Untitled'), COALESCE(a.release_year,a.year), a.total_tracks
         FROM albums a WHERE {key}=?1 ORDER BY COALESCE(a.release_year,a.year,9999), a.album, a.id"
    ))?;
    let albums = stmt
        .query_map([artist_id], |row| {
            Ok(ArtistIdentityAlbum {
                id: row.get(0)?,
                title: row.get(1)?,
                year: row.get(2)?,
                tracks: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut stmt = conn.prepare(
        "SELECT i.id, i.display_artist, i.disambiguation, l.mbid FROM artist_identities i
         LEFT JOIN musicbrainz_artist_links l ON l.local_artist_key=i.id AND l.ignored=0
         WHERE i.name_key=(SELECT name_key FROM artist_identities WHERE id=?1) AND i.id<>?1
         ORDER BY i.disambiguation, i.id",
    )?;
    let other_artists = stmt
        .query_map([artist_id], choice)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(ArtistSplitContext {
        artist,
        albums,
        other_artists,
    })
}

pub(crate) fn split(conn: &Connection, request: SplitArtistRequest) -> Result<SplitArtistResult> {
    let transaction = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let context = split_context(&transaction, request.source_artist_id.trim())?;
    let album_ids = request
        .album_ids
        .iter()
        .collect::<std::collections::HashSet<_>>();
    if album_ids.is_empty()
        || album_ids.len() != request.album_ids.len()
        || album_ids
            .iter()
            .any(|id| !context.albums.iter().any(|album| &album.id == *id))
    {
        bail!("Select albums that still belong to this artist. Refresh and review the selection.");
    }
    let description = request.disambiguation.trim();
    if description.chars().count() > 240
        || request
            .source_disambiguation
            .as_deref()
            .unwrap_or("")
            .chars()
            .count()
            > 240
    {
        bail!("Artist descriptions must be 240 characters or fewer.");
    }
    let target = if let Some(target) = request.target_artist_id.as_deref() {
        context
            .other_artists
            .iter()
            .find(|artist| artist.id == target)
            .context("Choose a different artist with the same name.")?
            .id
            .clone()
    } else {
        if description.is_empty() {
            bail!("Add a description to distinguish the new artist.");
        }
        let id: String = transaction.query_row(
            "SELECT 'artist:' || lower(hex(randomblob(16)))",
            [],
            |row| row.get(0),
        )?;
        transaction.execute(
            "INSERT INTO artist_identities(id,name_key,display_artist,disambiguation)
             SELECT ?1,name_key,display_artist,?2 FROM artist_identities WHERE id=?3",
            params![id, description, context.artist.id],
        )?;
        // Suppress name-only cache matching until an identity is explicitly linked.
        transaction.execute("INSERT INTO musicbrainz_artist_link_tombstones(local_artist_key,display_artist,updated_at) VALUES(?1,?2,datetime('now'))", params![id,context.artist.name])?;
        if let Some(mbid) = request
            .musicbrainz_mbid
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            musicbrainz::set_artist_link_for_connection(
                &transaction,
                MusicBrainzArtistLinkRequest {
                    artist_key: id.clone(),
                    artist_name: context.artist.name.clone(),
                    action: "set".into(),
                    musicbrainz_mbid: Some(mbid.into()),
                    canonical_name: None,
                },
            )?;
        }
        id
    };
    if let Some(description) = request.source_disambiguation.as_deref() {
        transaction.execute("UPDATE artist_identities SET disambiguation=NULLIF(TRIM(?2),''),updated_at=datetime('now') WHERE id=?1", params![context.artist.id,description])?;
    }
    // Pin every reviewed source album before creating an ambiguous-name import
    // fallback. This includes the albums the user is leaving with the source.
    for album in &context.albums {
        transaction.execute(
            "INSERT OR IGNORE INTO artist_album_assignments(album_id,artist_id,source_artist_key)
             SELECT ?1,id,name_key FROM artist_identities WHERE id=?2",
            params![album.id, context.artist.id],
        )?;
    }
    for album_id in &request.album_ids {
        transaction.execute(
            "INSERT INTO artist_album_assignments(album_id,artist_id,source_artist_key)
             SELECT ?1,?2,name_key FROM artist_identities WHERE id=?3
             ON CONFLICT(album_id) DO UPDATE SET artist_id=excluded.artist_id,source_artist_key=excluded.source_artist_key,updated_at=datetime('now')",
            params![album_id,target,context.artist.id],
        )?;
        transaction.execute(
            "UPDATE albums SET artist_identity_key=?2 WHERE id=?1",
            params![album_id, target],
        )?;
    }
    transaction.commit()?;
    Ok(SplitArtistResult {
        artist_id: target,
        moved_albums: request.album_ids.len(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn get_artist_split_context(
    app: AppHandle,
    artist_id: String,
) -> Result<ArtistSplitContext, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (conn, _) = db::open_read(&app)?;
        split_context(&conn, &artist_id)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
#[specta::specta]
pub async fn split_artist(
    app: AppHandle,
    request: SplitArtistRequest,
) -> Result<SplitArtistResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (conn, path) = db::open(&app)?;
        db::backup_artist_split(&path)?;
        split(&conn, request)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| format!("{error:#}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        db::configure(&conn).unwrap();
        db::migrate(&conn).unwrap();
        conn.execute("INSERT INTO import_runs(id,source_path,started_at,status) VALUES(1,'test','now','completed')", []).unwrap();
        for (id, title, year) in [
            ("norway", "Norwegian Album", 1980),
            ("france", "French Album", 1972),
        ] {
            conn.execute("INSERT INTO albums(id,import_run_id,album,album_artist_display,year,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio) VALUES(?1,1,?2,'Zoo',?3,1,0,0,120,0,0,0)", params![id,title,year]).unwrap();
            conn.execute("INSERT INTO tracks(import_run_id,album_id,album_artist_display,display_artist,album,title,row_hash) VALUES(1,?1,'Zoo','Zoo with Guest',?2,?2,?1)", params![id,title]).unwrap();
        }
        musicbrainz::set_artist_link_for_connection(
            &conn,
            MusicBrainzArtistLinkRequest {
                artist_key: "zoo".into(),
                artist_name: "Zoo".into(),
                action: "set".into(),
                musicbrainz_mbid: Some("11111111-1111-1111-1111-111111111111".into()),
                canonical_name: None,
            },
        )
        .unwrap();
        conn
    }
    fn request() -> SplitArtistRequest {
        SplitArtistRequest {
            source_artist_id: "zoo".into(),
            album_ids: vec!["france".into()],
            target_artist_id: None,
            disambiguation: "French group".into(),
            source_disambiguation: Some("Norwegian group".into()),
            musicbrainz_mbid: Some("22222222-2222-2222-2222-222222222222".into()),
        }
    }

    #[test]
    fn splits_same_name_profiles_and_preserves_tags_and_original_link() {
        let conn = fixture();
        let result = split(&conn, request()).unwrap();
        assert!(result.artist_id.starts_with("artist:"));
        assert_eq!(split_context(&conn, "zoo").unwrap().albums[0].id, "norway");
        let new = split_context(&conn, &result.artist_id).unwrap();
        assert_eq!(new.albums[0].id, "france");
        assert_eq!(new.artist.disambiguation.as_deref(), Some("French group"));
        assert_eq!(
            new.artist.musicbrainz_mbid.as_deref(),
            Some("22222222-2222-2222-2222-222222222222")
        );
        assert_eq!(
            split_context(&conn, "zoo")
                .unwrap()
                .artist
                .musicbrainz_mbid
                .as_deref(),
            Some("11111111-1111-1111-1111-111111111111")
        );
        let (album_artist,display_artist,key):(String,String,String)=conn.query_row("SELECT album_artist_display,display_artist,artist_identity_key FROM tracks WHERE album_id='france'",[],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
        assert_eq!(album_artist, "Zoo");
        assert_eq!(display_artist, "Zoo with Guest");
        assert_eq!(key, result.artist_id);
        let mut browse = crate::models::BrowseRequest::default();
        browse.filters.artist_keys = vec![result.artist_id];
        let response = db::search_library(&conn, browse, 50).unwrap();
        assert_eq!(response.rows.len(), 1);
        assert_eq!(response.rows[0].album_id, "france");
    }

    #[test]
    fn assignments_survive_deleted_and_reimported_catalog_rows() {
        let conn = fixture();
        let result = split(&conn, request()).unwrap();
        conn.execute_batch("CREATE TEMP TABLE retained_albums AS SELECT * FROM albums; CREATE TEMP TABLE retained_tracks AS SELECT * FROM tracks; DELETE FROM tracks; DELETE FROM albums; INSERT INTO tracks SELECT * FROM retained_tracks; INSERT INTO albums SELECT * FROM retained_albums;").unwrap();
        // Also exercise a real import that omits all new projection columns.
        conn.execute_batch("UPDATE albums SET artist_identity_key=NULL WHERE id='france'; UPDATE albums SET album_artist_display='Zoo' WHERE id='france'; UPDATE tracks SET artist_identity_key=NULL WHERE album_id='france'; UPDATE tracks SET album_artist_display='Zoo' WHERE album_id='france';").unwrap();
        assert_eq!(
            split_context(&conn, &result.artist_id)
                .unwrap()
                .albums
                .len(),
            1
        );
        assert_eq!(
            conn.query_row(
                "SELECT artist_identity_key FROM tracks WHERE album_id='france'",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            result.artist_id
        );
        conn.execute(
            "UPDATE albums SET album_artist_display='Different Artist' WHERE id='france'",
            [],
        )
        .unwrap();
        assert!(split_context(&conn, &result.artist_id)
            .unwrap()
            .albums
            .is_empty());
    }

    #[test]
    fn stale_selection_and_invalid_mbid_roll_back_entire_split() {
        let conn = fixture();
        let mut invalid = request();
        invalid.album_ids.push("missing".into());
        assert!(split(&conn, invalid).is_err());
        let mut invalid = request();
        invalid.musicbrainz_mbid = Some("wrong".into());
        assert!(split(&conn, invalid).is_err());
        assert_eq!(split_context(&conn, "zoo").unwrap().albums.len(), 2);
        assert_eq!(
            conn.query_row("SELECT count(*) FROM artist_identities", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM artist_album_assignments", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap(),
            0
        );
    }

    #[test]
    fn unlinked_split_stays_unresolved_and_albums_can_be_moved_back() {
        let conn = fixture();
        let mut initial = request();
        initial.musicbrainz_mbid = None;
        let result = split(&conn, initial).unwrap();
        assert!(split_context(&conn, &result.artist_id)
            .unwrap()
            .artist
            .musicbrainz_mbid
            .is_none());
        assert!(conn.query_row("SELECT EXISTS(SELECT 1 FROM musicbrainz_artist_link_tombstones WHERE local_artist_key=?1)",[&result.artist_id],|row|row.get::<_,bool>(0)).unwrap());
        let mut undo = request();
        undo.source_artist_id = result.artist_id;
        undo.target_artist_id = Some("zoo".into());
        undo.source_disambiguation = None;
        undo.musicbrainz_mbid = None;
        split(&conn, undo).unwrap();
        assert_eq!(split_context(&conn, "zoo").unwrap().albums.len(), 2);
    }

    #[test]
    fn a_new_same_name_import_requires_review_after_a_split() {
        let conn = fixture();
        split(&conn, request()).unwrap();
        conn.execute("INSERT INTO albums(id,import_run_id,album,album_artist_display,total_tracks,rated_tracks,rating_completeness,total_seconds,loved_tracks,tmoe_seconds,ae_ratio) VALUES('new',1,'New Album','Zoo',1,0,0,120,0,0,0)",[]).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT artist_identity_key FROM albums WHERE id='new'",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "unresolved:zoo"
        );
        let context = split_context(&conn, "unresolved:zoo").unwrap();
        assert_eq!(
            context.artist.disambiguation.as_deref(),
            Some("Unassigned albums")
        );
        assert!(context.artist.musicbrainz_mbid.is_none());
        assert_eq!(context.albums.len(), 1);
        assert_eq!(split_context(&conn, "zoo").unwrap().albums.len(), 1);
    }

    #[test]
    fn track_without_album_artist_keeps_the_reviewed_album_identity() {
        let conn = fixture();
        let result = split(&conn, request()).unwrap();
        conn.execute("INSERT INTO tracks(import_run_id,album_id,album_artist_display,display_artist,title,row_hash) VALUES(1,'france',NULL,'Guest','Guest song','guest')",[]).unwrap();
        let (identity,album_artist,performer):(String,Option<String>,String)=conn.query_row("SELECT artist_identity_key,album_artist_display,display_artist FROM tracks WHERE row_hash='guest'",[],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
        assert_eq!(identity, result.artist_id);
        assert!(album_artist.is_none());
        assert_eq!(performer, "Guest");
    }
}
