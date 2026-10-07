//! Declarative schema migrations.
//!
//! [`MIGRATIONS`] is the single ordered list of schema steps. Each step runs
//! exactly once, inside its own transaction, and the runner (not the step) owns
//! `PRAGMA user_version`. To change the schema, append a step with the next
//! version number and raise [`LATEST_SCHEMA_VERSION`]; never edit a released step.
//!
//! Steps are idempotent `CREATE ... IF NOT EXISTS` and column-probe repairs.
//! Several steps also carry a `verify` check that confirms the schema really
//! contains what the step promised. When a recorded version is not backed by its
//! tables (a restored or hand-edited database), the runner trusts only the
//! verified part of the ladder and replays the rest.

use anyhow::{Context, Result};
use rusqlite::{params, Connection, Transaction, TransactionBehavior};

pub(super) const LATEST_SCHEMA_VERSION: i32 = 61;

type StepFn = fn(&Connection) -> Result<()>;
type VerifyFn = fn(&Connection) -> Result<bool>;

struct Migration {
    /// `user_version` stored once the step has been applied.
    version: i32,
    description: &'static str,
    up: StepFn,
    /// Structural check that everything up to and including this step exists.
    verify: Option<VerifyFn>,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 41,
        description: "baseline catalog, chart, MusicBrainz, and Library Completion schema",
        up: super::create_baseline_schema,
        verify: Some(phase_forty_one_schema_exists),
    },
    Migration {
        version: 42,
        description: "Library Completion Discogs verification columns",
        up: super::ensure_library_completion_discogs_columns,
        verify: Some(phase_forty_two_schema_exists),
    },
    Migration {
        version: 43,
        description: "Library Completion cover columns",
        up: super::ensure_library_completion_cover_columns,
        verify: Some(phase_forty_three_schema_exists),
    },
    Migration {
        version: 44,
        description: "Artist Completion queue",
        up: super::ensure_library_completion_artist_schema,
        verify: Some(phase_forty_four_schema_exists),
    },
    Migration {
        version: 45,
        description: "durable library update history",
        up: super::ensure_library_updates_schema,
        verify: Some(phase_forty_five_schema_exists),
    },
    Migration {
        version: 46,
        description: "shared artist portrait cache",
        up: super::ensure_artist_images_schema,
        verify: Some(phase_forty_six_schema_exists),
    },
    Migration {
        version: 47,
        description: "normalized album artist index",
        up: super::ensure_album_artist_key_index,
        verify: Some(phase_forty_seven_schema_exists),
    },
    Migration {
        version: 48,
        description: "Music Doctor quality tables",
        up: super::ensure_music_doctor_schema,
        verify: Some(phase_forty_eight_schema_exists),
    },
    Migration {
        version: 49,
        description: "Last.fm popularity cache",
        up: super::ensure_lastfm_popularity_schema,
        verify: Some(phase_forty_nine_schema_exists),
    },
    Migration {
        version: 50,
        description: "artist biography cache",
        up: super::ensure_artist_biography_schema,
        verify: Some(phase_fifty_schema_exists),
    },
    Migration {
        version: 51,
        description: "album review cache",
        up: super::ensure_album_review_schema,
        verify: Some(phase_fifty_one_schema_exists),
    },
    Migration {
        version: 52,
        description: "Last.fm similar-artist cache",
        up: super::ensure_lastfm_similarity_schema,
        verify: Some(phase_fifty_two_schema_exists),
    },
    Migration {
        version: 53,
        description: "Last.fm related-album cache",
        up: super::ensure_lastfm_related_albums_schema,
        verify: Some(phase_fifty_three_schema_exists),
    },
    Migration {
        version: 54,
        description: "Daily Edition snapshots",
        up: super::ensure_daily_edition_snapshot_schema,
        verify: Some(phase_fifty_four_schema_exists),
    },
    Migration {
        version: 55,
        description: "chart album match state",
        up: chart_album_match_state,
        verify: Some(phase_fifty_five_schema_exists),
    },
    Migration {
        version: 56,
        description: "Smart playlist rules",
        up: super::ensure_smart_playlist_schema,
        verify: Some(phase_fifty_six_schema_exists),
    },
    Migration {
        version: 57,
        description: "half-star track ratings",
        up: migrate_half_star_ratings,
        verify: None,
    },
    Migration {
        version: 58,
        description: "Published Charts archive",
        up: crate::published_charts::ensure_schema,
        verify: Some(crate::published_charts::schema_exists),
    },
    Migration {
        version: 59,
        description: "canonical UK origin country code",
        up: migrate_uk_origin_country_alias,
        verify: None,
    },
    Migration {
        version: 60,
        description: "Plex sync removal",
        up: remove_plex_sync_schema,
        verify: Some(phase_sixty_schema_exists),
    },
    Migration {
        version: 61,
        description: "Wish List and Artist Completion keys use identity::loose_key",
        up: rebuild_loose_identity_keys,
        verify: None,
    },
];

fn chart_album_match_state(conn: &Connection) -> Result<()> {
    super::ensure_chart_album_match_state_schema(conn)?;
    super::reconcile_album_chart_matches(conn)
}

/// Brings `conn` to [`LATEST_SCHEMA_VERSION`]. Callers hold the migration lock.
pub(super) fn run(conn: &Connection) -> Result<()> {
    let stored = conn
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
        .context("Could not read SQLite schema version")?;
    // A database written by a newer build keeps its higher version untouched.
    let version = trusted_version(conn, stored.min(LATEST_SCHEMA_VERSION))?;
    for migration in MIGRATIONS.iter().filter(|step| step.version > version) {
        apply(conn, migration)?;
    }
    Ok(())
}

/// The highest version whose recorded tables and columns actually exist.
fn trusted_version(conn: &Connection, recorded: i32) -> Result<i32> {
    let mut trusted = recorded;
    for migration in MIGRATIONS
        .iter()
        .rev()
        .filter(|step| step.version <= recorded)
    {
        if let Some(verify) = migration.verify {
            if !verify(conn)? {
                trusted = trusted.min(migration.version - 1);
            }
        }
    }
    Ok(trusted)
}

fn apply(conn: &Connection, migration: &Migration) -> Result<()> {
    let version = migration.version;
    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .with_context(|| format!("Could not start the schema {version} migration"))?;
    (migration.up)(&transaction).with_context(|| {
        format!(
            "Could not apply the schema {version} migration ({})",
            migration.description
        )
    })?;
    transaction
        .execute_batch(&format!("PRAGMA user_version = {version};"))
        .with_context(|| format!("Could not record schema version {version}"))?;
    transaction
        .commit()
        .with_context(|| format!("Could not commit the schema {version} migration"))
}

pub(super) fn remove_plex_sync_schema(conn: &Connection) -> Result<()> {
    if super::schema_column_exists(conn, "playlist_automations", "plex_sync_enabled")? {
        conn.execute_batch(
            "
            CREATE TABLE playlist_automations_without_plex (
                saved_playlist_id INTEGER PRIMARY KEY
                    REFERENCES saved_playlists(id) ON DELETE CASCADE,
                smart INTEGER NOT NULL DEFAULT 0,
                last_evaluated_at TEXT,
                last_error TEXT,
                desired_count INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO playlist_automations_without_plex (
                saved_playlist_id, smart, last_evaluated_at, desired_count
            )
            SELECT saved_playlist_id, smart, last_evaluated_at, desired_count
            FROM playlist_automations;
            DROP TABLE playlist_automations;
            ALTER TABLE playlist_automations_without_plex RENAME TO playlist_automations;
            ",
        )
        .context("Could not preserve Smart playlist rules while removing Plex sync")?;
    } else if !super::schema_column_exists(conn, "playlist_automations", "last_error")? {
        conn.execute_batch("ALTER TABLE playlist_automations ADD COLUMN last_error TEXT;")?;
    }
    conn.execute_batch(
        "DROP TABLE IF EXISTS plex_track_cache;
         DROP TABLE IF EXISTS plex_sync_state;",
    )
    .context("Could not remove retired Plex cache and schedule")?;
    Ok(())
}

pub(super) fn phase_sixty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_six_schema_exists(conn)?
        && super::schema_column_exists(conn, "playlist_automations", "last_error")?
        && !super::schema_column_exists(conn, "playlist_automations", "plex_sync_enabled")?
        && !super::schema_table_exists(conn, "plex_track_cache")?
        && !super::schema_table_exists(conn, "plex_sync_state")?)
}

/// Wish List and Artist Completion keys used to be a copy of the loose rules
/// without Nordic and ligature letters ("Røyksopp" stayed "røyksopp"). Rebuild
/// them with `identity::loose_key`. A row whose new key is already taken keeps
/// its old key, so nothing is deleted.
pub(super) fn rebuild_loose_identity_keys(conn: &Connection) -> Result<()> {
    if super::schema_table_exists(conn, "wish_list_items")? {
        let rows = conn
            .prepare("SELECT id, entity, artist, title, identity_key FROM wish_list_items")?
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()
            .context("Could not read Wish List identities")?;
        for (id, entity, artist, title, old_key) in rows {
            if !old_key.starts_with(&format!("{entity}\u{1f}name\u{1f}")) {
                continue;
            }
            let new_key = crate::wishlist::stored_identity_key(&entity, &artist, &title, None);
            if new_key != old_key {
                conn.execute(
                    "UPDATE OR IGNORE wish_list_items SET identity_key = ?1 WHERE id = ?2",
                    params![new_key, id],
                )
                .context("Could not rebuild a Wish List identity")?;
            }
        }
    }

    for table in [
        "library_completion_artist_verifications",
        "library_completion_artist_decisions",
        "library_completion_artist_verification_items",
    ] {
        if !super::schema_table_exists(conn, table)? {
            continue;
        }
        let keys = conn
            .prepare(&format!("SELECT DISTINCT artist_key FROM {table}"))?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .with_context(|| format!("Could not read {table} keys"))?;
        let mut update = conn.prepare(&format!(
            "UPDATE OR IGNORE {table} SET artist_key = ?1 WHERE artist_key = ?2"
        ))?;
        for old_key in keys {
            let new_key = crate::identity::loose_key(&old_key);
            if new_key != old_key {
                update
                    .execute(params![new_key, old_key])
                    .with_context(|| format!("Could not rebuild {table} keys"))?;
            }
        }
    }
    Ok(())
}

pub(super) fn migrate_half_star_ratings(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        DROP TABLE IF EXISTS temp.migration_57_half_star_albums;
        CREATE TEMP TABLE migration_57_half_star_albums (
            album_id TEXT PRIMARY KEY
        ) WITHOUT ROWID;

        INSERT OR IGNORE INTO migration_57_half_star_albums (album_id)
        SELECT album_id
        FROM tracks
        WHERE normalized_rating IS NULL
          AND TRIM(COALESCE(rating_raw, '')) IN ('0.5', '1.5', '2.5', '3.5', '4.5');

        UPDATE tracks
        SET normalized_rating = CASE TRIM(rating_raw)
            WHEN '0.5' THEN 10
            WHEN '1.5' THEN 30
            WHEN '2.5' THEN 50
            WHEN '3.5' THEN 70
            WHEN '4.5' THEN 90
        END
        WHERE normalized_rating IS NULL
          AND album_id IN (SELECT album_id FROM migration_57_half_star_albums)
          AND TRIM(COALESCE(rating_raw, '')) IN ('0.5', '1.5', '2.5', '3.5', '4.5');

        UPDATE albums
        SET rated_tracks = (
                SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id
                  AND tracks.normalized_rating IS NOT NULL
            ),
            rating_completeness = CASE
                WHEN total_tracks = 0 THEN 0.0
                ELSE CAST((
                    SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id
                      AND tracks.normalized_rating IS NOT NULL
                ) AS REAL) / CAST(total_tracks AS REAL)
            END,
            calculated_album_rating = CASE
                WHEN total_tracks > 0 AND total_tracks = (
                    SELECT COUNT(*) FROM tracks WHERE tracks.album_id = albums.id
                      AND tracks.normalized_rating IS NOT NULL
                ) THEN CAST(ROUND((
                    SELECT AVG(normalized_rating) FROM tracks WHERE tracks.album_id = albums.id
                )) AS INTEGER)
                ELSE NULL
            END
        WHERE id IN (SELECT album_id FROM migration_57_half_star_albums);

        UPDATE albums
        SET effective_album_rating = COALESCE(album_rating, calculated_album_rating)
        WHERE id IN (SELECT album_id FROM migration_57_half_star_albums);

        UPDATE albums
        SET album_score = CASE
            WHEN effective_album_rating IS NULL THEN NULL
            ELSE ((effective_album_rating * 0.5) + (ae_ratio * 100.0)
                    + ((tmoe_seconds / 60.0) * 0.3)) / 10.0
                 + (loved_tracks * 100.0)
        END
        WHERE id IN (SELECT album_id FROM migration_57_half_star_albums);

        DROP TABLE migration_57_half_star_albums;
        ",
    )
    .context("Could not migrate legacy half-star ratings")?;
    Ok(())
}

pub(super) fn migrate_uk_origin_country_alias(conn: &Connection) -> Result<()> {
    if !super::schema_table_exists(conn, "musicbrainz_origin_countries")?
        || !super::schema_table_exists(conn, "musicbrainz_artist_origin_countries")?
    {
        return Ok(());
    }

    let artist_origin_alias_exists = conn
        .query_row(
            "SELECT EXISTS(
                SELECT 1
                FROM musicbrainz_origin_countries
                WHERE UPPER(TRIM(country_code)) = 'UK'
                   OR (
                       country_code = 'GB'
                       AND (
                           TRIM(country_name) = ''
                           OR UPPER(TRIM(country_name)) IN ('UK', 'GB')
                       )
                   )
                UNION ALL
                SELECT 1
                FROM musicbrainz_artist_origin_countries
                WHERE UPPER(TRIM(country_code)) = 'UK'
            )",
            [],
            |row| row.get::<_, bool>(0),
        )
        .context("Could not inspect artist origins for legacy UK country codes")?;
    let map_location_alias_exists = super::schema_table_exists(conn, "musicbrainz_map_locations")?
        && conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM musicbrainz_map_locations
                    WHERE UPPER(TRIM(country_code)) = 'UK'
                )",
                [],
                |row| row.get::<_, bool>(0),
            )
            .context("Could not inspect map locations for legacy UK country codes")?;

    if !artist_origin_alias_exists && !map_location_alias_exists {
        return Ok(());
    }

    conn.execute_batch(
        "
        INSERT OR IGNORE INTO musicbrainz_origin_countries (
            country_code, country_name, area_mbid, iso_source,
            is_historical, is_special, created_at, updated_at
        )
        SELECT
            'GB', 'United Kingdom', area_mbid, iso_source,
            is_historical, is_special, created_at, updated_at
        FROM musicbrainz_origin_countries
        WHERE UPPER(TRIM(country_code)) = 'UK'
        LIMIT 1;

        UPDATE musicbrainz_artist_origin_countries
        SET
            country_code = 'GB',
            country_name = CASE
                WHEN country_name IS NULL
                    OR TRIM(country_name) = ''
                    OR UPPER(TRIM(country_name)) IN ('UK', 'GB')
                THEN 'United Kingdom'
                ELSE country_name
            END
        WHERE UPPER(TRIM(country_code)) = 'UK';

        DELETE FROM musicbrainz_origin_countries
        WHERE UPPER(TRIM(country_code)) = 'UK';

        UPDATE musicbrainz_origin_countries
        SET country_name = 'United Kingdom'
        WHERE country_code = 'GB'
            AND (
                TRIM(country_name) = ''
                OR UPPER(TRIM(country_name)) IN ('UK', 'GB')
            );
        ",
    )
    .context("Could not canonicalize UK artist origins to GB")?;

    if super::schema_table_exists(conn, "musicbrainz_map_locations")? {
        conn.execute(
            "UPDATE musicbrainz_map_locations SET country_code = 'GB' WHERE UPPER(TRIM(country_code)) = 'UK'",
            [],
        )
        .context("Could not canonicalize UK map locations to GB")?;
    }

    Ok(())
}

pub(super) fn phase_fifty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_five_schema_exists(conn)?
        && super::schema_column_exists(conn, "playlist_automations", "smart")?
        && super::schema_column_exists(conn, "playlist_automations", "last_evaluated_at")?
        && super::schema_column_exists(conn, "playlist_automations", "desired_count")?)
}

pub(super) fn phase_fifty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_four_schema_exists(conn)?
        && super::schema_table_exists(conn, "chart_album_match_state")?)
}

pub(super) fn phase_fifty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_three_schema_exists(conn)?
        && super::schema_table_exists(conn, "daily_edition_snapshots")?
        && super::schema_index_exists(conn, "idx_daily_edition_snapshots_created")?)
}

pub(super) fn phase_fifty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_two_schema_exists(conn)?
        && super::schema_table_exists(conn, "lastfm_album_relationships")?
        && super::schema_table_exists(conn, "lastfm_related_albums")?
        && super::schema_index_exists(conn, "idx_lastfm_related_albums_album_rank")?
        && super::schema_index_exists(conn, "idx_lastfm_related_albums_candidate_mbid")?
        && super::schema_index_exists(conn, "idx_lastfm_related_albums_expires")?)
}

pub(super) fn phase_fifty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_one_schema_exists(conn)?
        && super::schema_table_exists(conn, "lastfm_artist_similarity")?
        && super::schema_table_exists(conn, "lastfm_similar_artists")?
        && super::schema_index_exists(conn, "idx_lastfm_similar_artists_artist_rank")?
        && super::schema_index_exists(conn, "idx_lastfm_similar_artists_target_mbid")?
        && super::schema_index_exists(conn, "idx_lastfm_similar_artists_expires")?)
}

pub(super) fn phase_fifty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifty_schema_exists(conn)?
        && super::schema_table_exists(conn, "album_reviews")?
        && super::schema_index_exists(conn, "idx_album_reviews_expires")?)
}

pub(super) fn phase_fifty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_nine_schema_exists(conn)?
        && super::schema_table_exists(conn, "artist_biographies")?
        && super::schema_index_exists(conn, "idx_artist_biographies_expires")?)
}

pub(super) fn phase_forty_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_eight_schema_exists(conn)?
        && super::schema_table_exists(conn, "lastfm_artist_popularity")?
        && super::schema_table_exists(conn, "lastfm_track_popularity")?
        && super::schema_index_exists(conn, "idx_lastfm_track_popularity_artist_rank")?
        && super::schema_index_exists(conn, "idx_lastfm_track_popularity_expires")?)
}

pub(super) fn phase_forty_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_seven_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "music_doctor_database_path")?
        && super::schema_column_exists(conn, "app_settings", "music_doctor_auto_sync")?
        && super::schema_table_exists(conn, "music_doctor_sync_runs")?
        && super::schema_table_exists(conn, "music_doctor_track_quality")?
        && super::schema_table_exists(conn, "music_doctor_album_quality")?
        && super::schema_table_exists(conn, "music_doctor_unmatched_files")?
        && super::schema_table_exists(conn, "music_doctor_file_issues")?)
}

pub(super) fn phase_forty_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_six_schema_exists(conn)?
        && super::schema_index_exists(conn, "idx_albums_artist_key")?)
}

pub(super) fn phase_forty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_five_schema_exists(conn)?
        && super::schema_table_exists(conn, "artist_images")?
        && super::schema_index_exists(conn, "idx_artist_images_state_fetched_at")?)
}

pub(super) fn phase_forty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_four_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_updates")?
        && super::schema_index_exists(conn, "idx_library_updates_created_at")?
        && super::schema_index_exists(conn, "idx_library_updates_kind_created_at")?)
}

pub(super) fn phase_forty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_three_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_completion_artist_verifications")?
        && super::schema_table_exists(conn, "library_completion_artist_decisions")?
        && super::schema_table_exists(conn, "library_completion_artist_verification_batches")?
        && super::schema_table_exists(conn, "library_completion_artist_verification_items")?
        && super::schema_index_exists(
            conn,
            "idx_library_completion_artist_verification_batches_one_active",
        )?)
}

pub(super) fn phase_forty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_two_schema_exists(conn)?
        && super::schema_column_exists(conn, "library_completion_verifications", "cover_state")?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_cache_path",
        )?
        && super::schema_column_exists(conn, "library_completion_verifications", "cover_provider")?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_source_url",
        )?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_mime_type",
        )?
        && super::schema_column_exists(conn, "library_completion_verifications", "cover_message")?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "cover_checked_at",
        )?)
}

pub(super) fn phase_forty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_one_schema_exists(conn)?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "verification_provider",
        )?
        && super::schema_column_exists(
            conn,
            "library_completion_verifications",
            "discogs_master_id",
        )?
        && super::schema_column_exists(conn, "library_completion_verification_items", "provider")?)
}

pub(super) fn phase_forty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_forty_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_completion_verifications")?
        && super::schema_table_exists(conn, "library_completion_verification_batches")?
        && super::schema_table_exists(conn, "library_completion_verification_items")?
        && super::schema_index_exists(
            conn,
            "idx_library_completion_verification_batches_one_active",
        )?)
}

pub(super) fn phase_forty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_nine_schema_exists(conn)?
        && super::schema_table_exists(conn, "library_completion_decisions")?
        && super::schema_column_exists(conn, "library_completion_decisions", "musicbrainz_id")?
        && super::schema_column_exists(conn, "library_completion_decisions", "wish_list_item_id")?)
}

pub(super) fn phase_thirty_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_eight_schema_exists(conn)?
        && super::schema_column_exists(conn, "albums", "official_uk_rank")?
        && super::schema_column_exists(conn, "albums", "official_uk_debut_week_key")?
        && super::schema_column_exists(conn, "tracks", "official_uk_rank")?
        && super::schema_column_exists(conn, "tracks", "official_uk_debut_week_key")?
        && super::schema_table_exists(conn, "official_uk_album_chart_entries")?
        && super::schema_table_exists(conn, "official_uk_single_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "official_uk_album_source_path")?
        && super::schema_column_exists(conn, "app_settings", "official_uk_singles_source_path")?)
}

pub(super) fn phase_thirty_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_seven_schema_exists(conn)?
        && super::schema_column_exists(conn, "tracks", "norsktoppen_rank")?
        && super::schema_column_exists(conn, "tracks", "norsktoppen_debut_week_key")?
        && super::schema_table_exists(conn, "norsktoppen_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "norsktoppen_source_path")?)
}

pub(super) fn phase_thirty_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_six_schema_exists(conn)?
        && super::schema_column_exists(conn, "tracks", "ti_i_skuddet_rank")?
        && super::schema_column_exists(conn, "tracks", "ti_i_skuddet_debut_week_key")?
        && super::schema_table_exists(conn, "ti_i_skuddet_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "ti_i_skuddet_source_path")?)
}

pub(super) fn phase_thirty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_five_schema_exists(conn)?
        && super::schema_column_exists(conn, "albums", "vg_lista_rank")?
        && super::schema_column_exists(conn, "albums", "vg_lista_debut_week_key")?
        && super::schema_column_exists(conn, "tracks", "vg_lista_rank")?
        && super::schema_column_exists(conn, "tracks", "vg_lista_debut_week_key")?
        && super::schema_table_exists(conn, "vg_lista_album_chart_entries")?
        && super::schema_table_exists(conn, "vg_lista_single_chart_entries")?
        && super::schema_column_exists(conn, "app_settings", "vg_lista_album_source_path")?
        && super::schema_column_exists(conn, "app_settings", "vg_lista_singles_source_path")?)
}

pub(super) fn phase_thirty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_four_schema_exists(conn)?
        && super::schema_column_exists(conn, "billboard_single_chart_entries", "album")?
        && super::schema_column_exists(conn, "billboard_single_chart_entries", "album_key")?)
}

pub(super) fn phase_thirty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_three_schema_exists(conn)?
        && super::schema_column_exists(conn, "tracks", "billboard_single_debut_date")?
        && super::schema_column_exists(conn, "tracks", "billboard_single_debut_week_key")?
        && super::schema_column_exists(conn, "billboard_single_chart_entries", "date_entered")?
        && super::schema_column_exists(
            conn,
            "billboard_single_chart_entries",
            "date_entered_quality",
        )?)
}

pub(super) fn phase_thirty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_two_schema_exists(conn)?
        && super::schema_column_exists(conn, "albums", "billboard_debut_year")?
        && super::schema_column_exists(conn, "albums", "billboard_debut_month")?
        && super::schema_column_exists(conn, "albums", "billboard_debut_week")?
        && super::schema_column_exists(conn, "albums", "billboard_debut_week_key")?
        && super::schema_column_exists(conn, "billboard_chart_entries", "first_appearance_week")?
        && super::schema_column_exists(conn, "billboard_chart_entries", "first_appearance_month")?)
}

pub(super) fn phase_thirty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_one_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_fallback")?)
}

pub(super) fn phase_thirty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirty_schema_exists(conn)? && super::schema_table_exists(conn, "deemix_downloads")?)
}

pub(super) fn phase_thirty_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_nine_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_quality")?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_organization")?)
}

pub(super) fn phase_twenty_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_eight_schema_exists(conn)?
        && super::schema_column_exists(conn, "app_settings", "deemix_download_path")?)
}

const LEGACY_DEVELOPER_OVERLAY_SYNC_PATH: &str =
    r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3";

pub(super) fn phase_twenty_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_seven_schema_exists(conn)?
        && super::schema_table_exists(conn, "musicbrainz_map_locations")?)
}

pub(super) fn phase_twenty_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_six_schema_exists(conn)?
        && !super::schema_index_exists(conn, "idx_tracks_file_identity")?)
}

pub(super) fn phase_twenty_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_five_schema_exists(conn)?
        && super::schema_table_exists(conn, "music_tool_fix_runs")?)
}

pub(super) fn phase_twenty_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_four_schema_exists(conn)?
        && super::schema_table_exists(conn, "import_sessions")?
        && super::schema_table_exists(conn, "import_stage_tracks")?
        && super::schema_table_exists(conn, "import_stage_albums")?
        && super::schema_table_exists(conn, "import_suspicious_albums")?)
}

fn phase_twenty_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_three_schema_exists(conn)?
        && super::schema_table_exists(conn, "wish_list_items")?)
}

fn phase_twenty_three_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_two_schema_exists(conn)?
        && super::schema_table_exists(conn, "saved_external_discoveries")?)
}

fn phase_twenty_two_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_one_schema_exists(conn)?
        && super::schema_table_exists(conn, "saved_playlists")?)
}

fn phase_twenty_one_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twenty_schema_exists(conn)? && super::schema_table_exists(conn, "ai_snapshots")?)
}

fn phase_twenty_schema_exists(conn: &Connection) -> Result<bool> {
    super::phase_nineteen_schema_exists(conn)
}

pub(super) fn migrate_portable_overlay_sync_default(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE app_settings SET musicbrainz_overlay_sync_path = '' WHERE musicbrainz_overlay_sync_path = ?1",
        params![LEGACY_DEVELOPER_OVERLAY_SYNC_PATH],
    )
    .context("Could not clear the legacy developer-specific overlay sync path")?;
    Ok(())
}

pub(super) fn migrate_billboard_album_source_default(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE app_settings SET billboard_source_path = 'CSV_ALBUMS' WHERE LOWER(TRIM(billboard_source_path)) = 'csv'",
        [],
    )
    .context("Could not migrate the Billboard album CSV source path")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;
    use crate::db::*;

    #[test]
    fn schema_sixty_one_rebuilds_loose_identity_keys_without_dropping_rows() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            INSERT INTO wish_list_items (entity, title, artist, source, identity_key, created_at)
            VALUES
                ('album', 'Melody A.M.', 'Røyksopp', 'Manual',
                 'album' || char(31) || 'name' || char(31) || 'røyksopp' || char(31) || 'melody a m', 'now'),
                ('artist', 'Ståle Æsøy', '', 'Manual',
                 'artist' || char(31) || 'name' || char(31) || char(31) || 'stale æsøy', 'now'),
                ('album', 'Kept', 'Kept', 'Manual',
                 'album' || char(31) || 'mbid' || char(31) || 'Røyksopp-id', 'now');
            INSERT INTO library_completion_artist_decisions (artist_key, status, artist, updated_at)
            VALUES ('sigur rós', 'wanted', 'Sigur Rós', 'now'),
                   ('bjørn eidsvåg', 'wanted', 'Bjørn Eidsvåg', 'old'),
                   ('bjorn eidsvag', 'notForMe', 'Bjorn Eidsvag', 'new');
            PRAGMA user_version = 60;
            ",
        )
        .expect("seed schema sixty keys");

        migrate(&conn).expect("migrate loose identity keys");

        let identities = conn
            .prepare("SELECT identity_key FROM wish_list_items ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            identities,
            [
                "album\u{1f}name\u{1f}royksopp\u{1f}melody a m",
                "artist\u{1f}name\u{1f}\u{1f}stale aesoy",
                "album\u{1f}mbid\u{1f}Røyksopp-id",
            ]
        );
        let decisions = conn
            .prepare("SELECT artist_key, updated_at FROM library_completion_artist_decisions ORDER BY updated_at")
            .unwrap()
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            decisions,
            [
                ("bjorn eidsvag".to_string(), "new".to_string()),
                ("sigur ros".to_string(), "now".to_string()),
                ("bjørn eidsvåg".to_string(), "old".to_string()),
            ],
            "a colliding row keeps its old key instead of being deleted"
        );
    }

    #[test]
    fn canonicalizes_existing_uk_artist_origins_to_gb() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            INSERT INTO musicbrainz_origin_countries (
                country_code, country_name, iso_source, created_at, updated_at
            ) VALUES (
                'UK', 'United Kingdom', 'manual',
                '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'
            );
            INSERT INTO musicbrainz_artist_origin_countries (
                local_artist_key, display_artist, mbid, country_code, country_name,
                derived_from, review_state, source, created_at, updated_at
            ) VALUES (
                'lazy racer', 'Lazy Racer', 'manual', 'UK', 'United Kingdom',
                'manual', 'manual', 'manual',
                '2026-08-19T00:00:00Z', '2026-08-19T00:00:00Z'
            );
            ",
        )
        .expect("insert legacy UK artist origin");

        conn.execute_batch("PRAGMA user_version=58;").unwrap();

        conn.execute_batch("CREATE TRIGGER fail_uk_repair BEFORE DELETE ON musicbrainz_origin_countries BEGIN SELECT RAISE(ABORT, 'repair failed'); END;").unwrap();
        assert!(migrate(&conn).is_err());
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            58
        );
        assert_eq!(conn.query_row("SELECT country_code FROM musicbrainz_artist_origin_countries WHERE local_artist_key='lazy racer'", [], |row| row.get::<_, String>(0)).unwrap(), "UK");
        conn.execute_batch("DROP TRIGGER fail_uk_repair;").unwrap();

        migrate(&conn).expect("canonicalize legacy UK artist origin");

        let saved = conn
            .query_row(
                "SELECT country_code, country_name FROM musicbrainz_artist_origin_countries WHERE local_artist_key = 'lazy racer'",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .expect("read canonical artist origin");
        let uk_option_count = conn
            .query_row(
                "SELECT COUNT(*) FROM musicbrainz_origin_countries WHERE UPPER(TRIM(country_code)) = 'UK'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count legacy UK country options");

        assert_eq!(saved, ("GB".to_string(), "United Kingdom".to_string()));
        assert_eq!(uk_option_count, 0);

        // Once upgraded, migrations do not scan or repair country data again.
        conn.execute_batch("INSERT INTO musicbrainz_origin_countries(country_code, country_name, iso_source, created_at, updated_at) VALUES('UK', 'UK', 'manual', 'now', 'now');").unwrap();
        migrate(&conn).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM musicbrainz_origin_countries WHERE country_code='UK'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn current_schema_migration_stays_read_only_when_uk_alias_is_absent() {
        let directory = tempfile::tempdir().expect("create temporary database directory");
        let database_path = directory.path().join("library.sqlite3");
        let writer = Connection::open(&database_path).expect("open writer connection");
        configure(&writer).expect("configure writer connection");
        migrate(&writer).expect("create current schema");

        let reader = Connection::open(&database_path).expect("open reader connection");
        configure(&reader).expect("configure reader connection");
        reader
            .execute_batch("PRAGMA busy_timeout = 10;")
            .expect("set short test timeout");
        writer
            .execute_batch("BEGIN IMMEDIATE;")
            .expect("hold database write lock");

        migrate(&reader).expect("open current schema without requesting a write lock");

        writer
            .execute_batch("ROLLBACK;")
            .expect("release database write lock");
    }

    #[test]
    fn skips_noop_migration_for_current_schema() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        migrate(&conn).expect("noop migration");

        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read user version");

        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
        assert!(phase_nineteen_schema_exists(&conn).expect("phase nineteen schema exists"));
        assert!(migrations::phase_twenty_six_schema_exists(&conn)
            .expect("phase twenty-six schema exists"));
        assert!(migrations::phase_twenty_seven_schema_exists(&conn)
            .expect("phase twenty-seven schema exists"));
        assert!(migrations::phase_twenty_eight_schema_exists(&conn)
            .expect("phase twenty-eight schema exists"));
        assert!(migrations::phase_twenty_nine_schema_exists(&conn)
            .expect("phase twenty-nine schema exists"));
        assert!(migrations::phase_thirty_schema_exists(&conn).expect("phase thirty schema exists"));
        assert!(migrations::phase_thirty_one_schema_exists(&conn)
            .expect("phase thirty-one schema exists"));
        assert!(migrations::phase_thirty_two_schema_exists(&conn)
            .expect("phase thirty-two schema exists"));
        assert!(migrations::phase_thirty_three_schema_exists(&conn)
            .expect("phase thirty-three schema exists"));
        assert!(migrations::phase_thirty_four_schema_exists(&conn)
            .expect("phase thirty-four schema exists"));
        assert!(migrations::phase_thirty_five_schema_exists(&conn)
            .expect("phase thirty-five schema exists"));
        assert!(migrations::phase_thirty_six_schema_exists(&conn)
            .expect("phase thirty-six schema exists"));
        assert!(migrations::phase_thirty_seven_schema_exists(&conn)
            .expect("phase thirty-seven schema exists"));
        assert!(migrations::phase_forty_schema_exists(&conn).expect("phase forty schema exists"));
        assert!(migrations::phase_forty_one_schema_exists(&conn)
            .expect("phase forty-one schema exists"));
        assert!(migrations::phase_forty_five_schema_exists(&conn)
            .expect("phase forty-five schema exists"));
        assert!(migrations::phase_forty_six_schema_exists(&conn)
            .expect("phase forty-six schema exists"));
        assert!(migrations::phase_forty_seven_schema_exists(&conn)
            .expect("phase forty-seven schema exists"));
        assert!(migrations::phase_forty_nine_schema_exists(&conn)
            .expect("phase forty-nine schema exists"));
        assert!(migrations::phase_fifty_schema_exists(&conn).expect("phase fifty schema exists"));
        assert!(migrations::phase_fifty_one_schema_exists(&conn)
            .expect("phase fifty-one schema exists"));
        assert!(migrations::phase_fifty_two_schema_exists(&conn)
            .expect("phase fifty-two schema exists"));
        assert!(migrations::phase_fifty_three_schema_exists(&conn)
            .expect("phase fifty-three schema exists"));
        assert!(migrations::phase_fifty_four_schema_exists(&conn)
            .expect("phase fifty-four schema exists"));
        assert!(!schema_index_exists(&conn, "idx_tracks_file_identity")
            .expect("redundant track identity index is absent"));
        assert!(schema_table_exists(&conn, "import_sessions").expect("import session table exists"));
        assert!(schema_table_exists(&conn, "import_stage_tracks")
            .expect("import track staging table exists"));
        assert!(schema_table_exists(&conn, "music_tool_fix_runs")
            .expect("Music Tool fix history table exists"));
        assert!(schema_table_exists(&conn, "musicbrainz_origin_countries")
            .expect("origin country table exists"));
        assert!(
            schema_table_exists(&conn, "musicbrainz_artist_origin_countries")
                .expect("artist origin country table exists")
        );
        assert!(
            schema_table_exists(&conn, "musicbrainz_artist_origin_import_runs")
                .expect("artist origin import run table exists")
        );
        assert!(schema_table_exists(&conn, "musicbrainz_artist_infos")
            .expect("artist info table exists"));
        assert!(
            schema_table_exists(&conn, "musicbrainz_artist_info_import_runs")
                .expect("artist info import run table exists")
        );
        assert!(schema_table_exists(&conn, "ai_snapshots").expect("Luna snapshot table exists"));
        assert!(schema_table_exists(&conn, "saved_playlists").expect("saved playlist table exists"));
        assert!(schema_table_exists(&conn, "saved_external_discoveries")
            .expect("saved external discovery table exists"));
        assert!(schema_table_exists(&conn, "wish_list_items").expect("wish list table exists"));
        assert!(schema_table_exists(&conn, "musicbrainz_map_locations")
            .expect("MusicBrainz map location cache exists"));
        assert!(schema_table_exists(&conn, "library_updates")
            .expect("durable library update history exists"));
    }

    #[test]
    fn upgrades_schema_fifty_six_half_star_ratings_and_album_aggregates() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            UPDATE tracks
            SET rating_raw = '3.5', normalized_rating = NULL, love = NULL,
                time_seconds = 180
            WHERE id = 1;
            UPDATE albums
            SET total_tracks = 1, rated_tracks = 0, rating_completeness = 0.0,
                total_seconds = 180, loved_tracks = 0, tmoe_seconds = 0,
                ae_ratio = 0.0, album_rating = NULL,
                calculated_album_rating = NULL, effective_album_rating = NULL,
                album_score = NULL
            WHERE id = 'mb:test';

            INSERT INTO albums (
                id, import_run_id, album_unique_id, album, album_artist_display,
                total_tracks, rated_tracks, rating_completeness, total_seconds,
                loved_tracks, tmoe_seconds, ae_ratio, album_rating,
                calculated_album_rating, effective_album_rating, album_score
            ) VALUES (
                'mb:half-star', 1, 'half-star', 'Half Star', 'Test Artist',
                1, 0, 0.0, 120, 0, 0, 0.0, 95, NULL, 95, 4.75
            );
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, rating_raw,
                normalized_rating, time_seconds, file_path, filename, row_hash
            ) VALUES (
                1, 'mb:half-star', 'half-star', 'Test Artist', 'Test Artist',
                'Half Star', 'Legacy 4.5', '4.5', NULL, 120,
                'D:\\Music\\Test Artist\\Half Star', '01 Legacy 4.5.mp3',
                'legacy-half-star-hash'
            );
            PRAGMA user_version = 56;
            ",
        )
        .expect("restore schema fifty-six half-star data");

        migrate(&conn).expect("upgrade schema fifty-six ratings");

        type RatingAggregate = (Option<i32>, i64, f64, Option<i32>, Option<i32>, Option<f64>);
        let load_rating_aggregate = |album_id: &str| -> RatingAggregate {
            conn.query_row(
                "
                SELECT t.normalized_rating, a.rated_tracks, a.rating_completeness,
                       a.calculated_album_rating, a.effective_album_rating, a.album_score
                FROM tracks t JOIN albums a ON a.id = t.album_id
                WHERE a.id = ?1
                ",
                [album_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("load migrated half-star rating")
        };
        let first = load_rating_aggregate("mb:test");
        let second = load_rating_aggregate("mb:half-star");

        assert_eq!(first, (Some(70), 1, 1.0, Some(70), Some(70), Some(3.5)));
        assert_eq!(second, (Some(90), 1, 1.0, Some(90), Some(95), Some(4.75)));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );

        migrate(&conn).expect("repeat current schema migration");

        assert_eq!(load_rating_aggregate("mb:test"), first);
        assert_eq!(load_rating_aggregate("mb:half-star"), second);
    }

    #[test]
    fn upgrades_schema_forty_eight_with_lastfm_popularity_cache() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("create current schema");
        conn.execute_batch(
            "
            DROP TABLE lastfm_track_popularity;
            DROP TABLE lastfm_artist_popularity;
            PRAGMA user_version = 48;
            ",
        )
        .expect("restore schema forty-eight shape");

        assert!(migrations::phase_forty_eight_schema_exists(&conn)
            .expect("phase forty-eight schema exists"));
        assert!(!migrations::phase_forty_nine_schema_exists(&conn)
            .expect("phase forty-nine schema is absent"));

        migrate(&conn).expect("upgrade schema forty-eight");

        assert!(migrations::phase_forty_nine_schema_exists(&conn)
            .expect("phase forty-nine schema exists"));
        assert!(migrations::phase_fifty_schema_exists(&conn).expect("phase fifty schema exists"));
        assert!(migrations::phase_fifty_one_schema_exists(&conn)
            .expect("phase fifty-one schema exists"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn upgrades_schema_forty_nine_with_artist_biography_cache() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("create current schema");
        conn.execute_batch(
            "
            DROP TABLE artist_biographies;
            PRAGMA user_version = 49;
            ",
        )
        .expect("restore schema forty-nine shape");

        assert!(migrations::phase_forty_nine_schema_exists(&conn)
            .expect("phase forty-nine schema exists"));
        assert!(
            !migrations::phase_fifty_schema_exists(&conn).expect("phase fifty schema is absent")
        );

        migrate(&conn).expect("upgrade schema forty-nine");

        assert!(migrations::phase_fifty_schema_exists(&conn).expect("phase fifty schema exists"));
        assert!(migrations::phase_fifty_one_schema_exists(&conn)
            .expect("phase fifty-one schema exists"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn upgrades_schema_fifty_with_album_review_cache() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("create current schema");
        conn.execute_batch(
            "
            DROP TABLE album_reviews;
            PRAGMA user_version = 50;
            ",
        )
        .expect("restore schema fifty shape");

        assert!(migrations::phase_fifty_schema_exists(&conn).expect("phase fifty schema exists"));
        assert!(!migrations::phase_fifty_one_schema_exists(&conn)
            .expect("phase fifty-one schema is absent"));

        migrate(&conn).expect("upgrade schema fifty");

        assert!(migrations::phase_fifty_one_schema_exists(&conn)
            .expect("phase fifty-one schema exists"));
        assert!(migrations::phase_fifty_two_schema_exists(&conn)
            .expect("phase fifty-two schema exists"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn upgrades_schema_fifty_one_with_lastfm_similarity_cache() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("create current schema");
        conn.execute_batch(
            "
            DROP TABLE lastfm_similar_artists;
            DROP TABLE lastfm_artist_similarity;
            PRAGMA user_version = 51;
            ",
        )
        .expect("restore schema fifty-one shape");

        assert!(migrations::phase_fifty_one_schema_exists(&conn)
            .expect("phase fifty-one schema exists"));
        assert!(!migrations::phase_fifty_two_schema_exists(&conn)
            .expect("phase fifty-two schema is absent"));

        migrate(&conn).expect("upgrade schema fifty-one");

        assert!(migrations::phase_fifty_two_schema_exists(&conn)
            .expect("phase fifty-two schema exists"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn upgrades_schema_fifty_two_with_lastfm_related_album_cache() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("create current schema");
        conn.execute_batch(
            "
            DROP TABLE lastfm_related_albums;
            DROP TABLE lastfm_album_relationships;
            PRAGMA user_version = 52;
            ",
        )
        .expect("restore schema fifty-two shape");

        assert!(migrations::phase_fifty_two_schema_exists(&conn)
            .expect("phase fifty-two schema exists"));
        assert!(!migrations::phase_fifty_three_schema_exists(&conn)
            .expect("phase fifty-three schema is absent"));

        migrate(&conn).expect("upgrade schema fifty-two");

        assert!(migrations::phase_fifty_three_schema_exists(&conn)
            .expect("phase fifty-three schema exists"));
        assert!(migrations::phase_fifty_four_schema_exists(&conn)
            .expect("phase fifty-four schema exists"));
        assert!(migrations::phase_fifty_five_schema_exists(&conn)
            .expect("phase fifty-five schema exists"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn upgrades_schema_fifty_four_and_repairs_chart_album_links() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                matched_album_id, imported_at
            ) VALUES (
                'billboard.csv', 1988, 11, 'Pet Shop Boys', 'Actually',
                'pet shop boys', 'actually', NULL, 'now'
            );
            DROP TABLE chart_album_match_state;
            PRAGMA user_version = 54;
            ",
        )
        .expect("restore schema fifty-four shape");

        assert!(migrations::phase_fifty_four_schema_exists(&conn)
            .expect("phase fifty-four schema exists"));
        assert!(!migrations::phase_fifty_five_schema_exists(&conn)
            .expect("phase fifty-five schema is absent"));

        migrate(&conn).expect("upgrade schema fifty-four");

        assert!(migrations::phase_fifty_five_schema_exists(&conn)
            .expect("phase fifty-five schema exists"));
        let matched_album_id: Option<String> = conn
            .query_row(
                "SELECT matched_album_id FROM billboard_chart_entries LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("read repaired chart link");
        assert_eq!(matched_album_id.as_deref(), Some("mb:test"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn upgrades_schema_fifty_three_with_daily_edition_snapshots() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("create current schema");
        conn.execute_batch(
            "
            DROP TABLE daily_edition_snapshots;
            PRAGMA user_version = 53;
            ",
        )
        .expect("restore schema fifty-three shape");

        assert!(migrations::phase_fifty_three_schema_exists(&conn)
            .expect("phase fifty-three schema exists"));
        assert!(!migrations::phase_fifty_four_schema_exists(&conn)
            .expect("phase fifty-four schema is absent"));

        migrate(&conn).expect("upgrade schema fifty-three");

        assert!(migrations::phase_fifty_four_schema_exists(&conn)
            .expect("phase fifty-four schema exists"));
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .expect("read upgraded schema version"),
            LATEST_SCHEMA_VERSION,
        );
    }

    #[test]
    fn schema_forty_five_adds_durable_library_update_history() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE library_updates;
            PRAGMA user_version = 44;
            ",
        )
        .expect("simulate schema forty-four database");

        migrate(&conn).expect("migrate library update history schema");

        assert!(migrations::phase_forty_five_schema_exists(&conn)
            .expect("phase forty-five schema exists"));
        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read migrated user version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_forty_six_adds_the_shared_artist_portrait_cache() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE artist_images;
            PRAGMA user_version = 45;
            ",
        )
        .expect("simulate schema forty-five database");

        migrate(&conn).expect("migrate artist portrait cache schema");

        assert!(migrations::phase_forty_six_schema_exists(&conn)
            .expect("phase forty-six schema exists"));
        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read migrated user version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_forty_seven_adds_the_normalized_album_artist_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP INDEX idx_albums_artist_key;
            PRAGMA user_version = 46;
            ",
        )
        .expect("simulate schema forty-six database");

        migrate(&conn).expect("migrate normalized album artist index");

        assert!(migrations::phase_forty_seven_schema_exists(&conn)
            .expect("phase forty-seven schema exists"));
        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read migrated user version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_twenty_seven_removes_the_redundant_track_identity_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            CREATE INDEX idx_tracks_file_identity ON tracks(file_path, filename);
            PRAGMA user_version = 26;
            ",
        )
        .expect("simulate schema twenty-six identity index");

        migrate(&conn).expect("migrate current schema");

        assert!(!schema_index_exists(&conn, "idx_tracks_file_identity")
            .expect("inspect redundant identity index"));
        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read migrated user version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_twenty_nine_adds_the_deemix_download_path() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            ALTER TABLE app_settings DROP COLUMN deemix_download_path;
            PRAGMA user_version = 28;
            ",
        )
        .expect("simulate schema twenty-eight settings");

        migrate(&conn).expect("migrate current schema");

        assert!(
            schema_column_exists(&conn, "app_settings", "deemix_download_path")
                .expect("Deemix download path exists")
        );
        let saved_path: String = conn
            .query_row(
                "SELECT deemix_download_path FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read default Deemix path");
        assert_eq!(saved_path, "");
    }

    #[test]
    fn schema_thirty_adds_deemix_download_preferences() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            ALTER TABLE app_settings DROP COLUMN deemix_download_quality;
            ALTER TABLE app_settings DROP COLUMN deemix_download_organization;
            PRAGMA user_version = 29;
            ",
        )
        .expect("simulate schema twenty-nine settings");

        migrate(&conn).expect("migrate current schema");

        let preferences: (String, String) = conn
            .query_row(
                "SELECT deemix_download_quality, deemix_download_organization FROM app_settings WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read default Deemix preferences");
        assert_eq!(preferences.0, "mp3_320");
        assert_eq!(preferences.1, "flat_artist_album_year");
    }

    #[test]
    fn schema_thirty_one_adds_deemix_download_receipts() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE deemix_downloads;
            PRAGMA user_version = 30;
            ",
        )
        .expect("simulate schema thirty");

        migrate(&conn).expect("migrate current schema");

        assert!(schema_table_exists(&conn, "deemix_downloads")
            .expect("Deemix download receipt table exists"));
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_thirty_two_adds_deemix_quality_fallback() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            ALTER TABLE app_settings DROP COLUMN deemix_download_fallback;
            PRAGMA user_version = 31;
            ",
        )
        .expect("simulate schema thirty-one settings");

        migrate(&conn).expect("migrate current schema");

        let fallback: i64 = conn
            .query_row(
                "SELECT deemix_download_fallback FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read default Deemix fallback");
        assert_eq!(fallback, 1);
    }

    #[test]
    fn schema_thirty_six_adds_vg_lista_sources_and_weekly_chart_tables() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE vg_lista_album_chart_entries;
            DROP TABLE vg_lista_single_chart_entries;
            DROP INDEX idx_albums_vg_lista_rank;
            DROP INDEX idx_albums_vg_lista_debut_week;
            DROP INDEX idx_tracks_vg_lista_rank;
            DROP INDEX idx_tracks_vg_lista_debut_week;
            ALTER TABLE albums DROP COLUMN vg_lista_rank;
            ALTER TABLE albums DROP COLUMN vg_lista_year;
            ALTER TABLE albums DROP COLUMN vg_lista_debut_year;
            ALTER TABLE albums DROP COLUMN vg_lista_debut_month;
            ALTER TABLE albums DROP COLUMN vg_lista_debut_week;
            ALTER TABLE albums DROP COLUMN vg_lista_debut_week_key;
            ALTER TABLE tracks DROP COLUMN vg_lista_rank;
            ALTER TABLE tracks DROP COLUMN vg_lista_year;
            ALTER TABLE tracks DROP COLUMN vg_lista_debut_date;
            ALTER TABLE tracks DROP COLUMN vg_lista_debut_year;
            ALTER TABLE tracks DROP COLUMN vg_lista_debut_month;
            ALTER TABLE tracks DROP COLUMN vg_lista_debut_week;
            ALTER TABLE tracks DROP COLUMN vg_lista_debut_week_key;
            ALTER TABLE app_settings DROP COLUMN vg_lista_album_source_path;
            ALTER TABLE app_settings DROP COLUMN vg_lista_singles_source_path;
            PRAGMA user_version = 35;
            ",
        )
        .expect("simulate schema thirty-five");

        migrate(&conn).expect("migrate VG Lista schema");

        assert!(migrations::phase_thirty_six_schema_exists(&conn).expect("VG Lista schema exists"));
        let paths: (String, String) = conn
            .query_row(
                "
                SELECT vg_lista_album_source_path, vg_lista_singles_source_path
                FROM app_settings
                WHERE id = 1
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read VG Lista default paths");
        assert_eq!(paths.0, "CSV_ALBUMS_NO");
        assert_eq!(paths.1, "CSV_SINGLES_NO");
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_thirty_seven_adds_ti_i_skuddet_source_and_weekly_chart_table() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE ti_i_skuddet_chart_entries;
            DROP INDEX idx_tracks_ti_i_skuddet_rank;
            DROP INDEX idx_tracks_ti_i_skuddet_debut_week;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_rank;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_year;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_debut_date;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_debut_year;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_debut_month;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_debut_week;
            ALTER TABLE tracks DROP COLUMN ti_i_skuddet_debut_week_key;
            ALTER TABLE app_settings DROP COLUMN ti_i_skuddet_source_path;
            PRAGMA user_version = 36;
            ",
        )
        .expect("simulate schema thirty-six");

        migrate(&conn).expect("migrate Ti i Skuddet schema");

        assert!(migrations::phase_thirty_seven_schema_exists(&conn)
            .expect("Ti i Skuddet schema exists"));
        let path: String = conn
            .query_row(
                "SELECT ti_i_skuddet_source_path FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read Ti i Skuddet default path");
        assert_eq!(path, "CSV_TIISKUDDET_NO");
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_thirty_eight_adds_norsktoppen_source_and_weekly_chart_table() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE norsktoppen_chart_entries;
            DROP INDEX idx_tracks_norsktoppen_rank;
            DROP INDEX idx_tracks_norsktoppen_debut_week;
            ALTER TABLE tracks DROP COLUMN norsktoppen_rank;
            ALTER TABLE tracks DROP COLUMN norsktoppen_year;
            ALTER TABLE tracks DROP COLUMN norsktoppen_debut_date;
            ALTER TABLE tracks DROP COLUMN norsktoppen_debut_year;
            ALTER TABLE tracks DROP COLUMN norsktoppen_debut_month;
            ALTER TABLE tracks DROP COLUMN norsktoppen_debut_week;
            ALTER TABLE tracks DROP COLUMN norsktoppen_debut_week_key;
            ALTER TABLE app_settings DROP COLUMN norsktoppen_source_path;
            PRAGMA user_version = 37;
            ",
        )
        .expect("simulate schema thirty-seven");

        migrate(&conn).expect("migrate Norsktoppen schema");

        assert!(
            migrations::phase_thirty_eight_schema_exists(&conn).expect("Norsktoppen schema exists")
        );
        let path: String = conn
            .query_row(
                "SELECT norsktoppen_source_path FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read Norsktoppen default path");
        assert_eq!(path, "CSV_NORSKTOPPEN_NO");
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_thirty_nine_adds_official_uk_sources_and_weekly_chart_tables() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE official_uk_album_chart_entries;
            DROP TABLE official_uk_single_chart_entries;
            DROP INDEX idx_albums_official_uk_rank;
            DROP INDEX idx_albums_official_uk_debut_week;
            DROP INDEX idx_tracks_official_uk_rank;
            DROP INDEX idx_tracks_official_uk_debut_week;
            ALTER TABLE albums DROP COLUMN official_uk_rank;
            ALTER TABLE albums DROP COLUMN official_uk_year;
            ALTER TABLE albums DROP COLUMN official_uk_debut_year;
            ALTER TABLE albums DROP COLUMN official_uk_debut_month;
            ALTER TABLE albums DROP COLUMN official_uk_debut_week;
            ALTER TABLE albums DROP COLUMN official_uk_debut_week_key;
            ALTER TABLE tracks DROP COLUMN official_uk_rank;
            ALTER TABLE tracks DROP COLUMN official_uk_year;
            ALTER TABLE tracks DROP COLUMN official_uk_debut_date;
            ALTER TABLE tracks DROP COLUMN official_uk_debut_year;
            ALTER TABLE tracks DROP COLUMN official_uk_debut_month;
            ALTER TABLE tracks DROP COLUMN official_uk_debut_week;
            ALTER TABLE tracks DROP COLUMN official_uk_debut_week_key;
            ALTER TABLE app_settings DROP COLUMN official_uk_album_source_path;
            ALTER TABLE app_settings DROP COLUMN official_uk_singles_source_path;
            PRAGMA user_version = 38;
            ",
        )
        .expect("simulate schema thirty-eight");

        migrate(&conn).expect("migrate Official UK schema");

        assert!(
            migrations::phase_thirty_nine_schema_exists(&conn).expect("Official UK schema exists")
        );
        let paths: (String, String) = conn
            .query_row(
                "
                SELECT official_uk_album_source_path, official_uk_singles_source_path
                FROM app_settings
                WHERE id = 1
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read Official UK default paths");
        assert_eq!(paths.0, "CSV_ALBUMS_UK");
        assert_eq!(paths.1, "CSV_SINGLES_UK");
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_forty_adds_library_completion_decisions() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE library_completion_decisions;
            PRAGMA user_version = 39;
            ",
        )
        .expect("simulate schema thirty-nine");

        migrate(&conn).expect("migrate Library Completion schema");

        assert!(
            migrations::phase_forty_schema_exists(&conn).expect("Library Completion schema exists")
        );
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn schema_forty_one_adds_library_completion_verification_queue() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            DROP TABLE library_completion_verification_items;
            DROP TABLE library_completion_verification_batches;
            DROP TABLE library_completion_verifications;
            PRAGMA user_version = 40;
            ",
        )
        .expect("simulate schema forty");

        migrate(&conn).expect("migrate verification queue schema");

        assert!(migrations::phase_forty_one_schema_exists(&conn)
            .expect("Library Completion verification schema exists"));
        let user_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read schema version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn provider_cover_and_artist_schema_upgrades_preserve_every_chart_table() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "
            INSERT INTO billboard_chart_entries
                (source_file, year, rank, artist, album, artist_key, album_key, imported_at)
            VALUES ('billboard.csv', 1998, 1, 'Artist', 'Album', 'artist', 'album', 'now');
            INSERT INTO billboard_single_chart_entries
                (source_file, year, rank, artist, display_artist, title, artist_key, title_key, imported_at)
            VALUES ('billboard-singles.csv', 1998, 1, 'Artist', 'Artist', 'Song', 'artist', 'song', 'now');
            INSERT INTO vg_lista_album_chart_entries
                (source_file, year, week, rank, artist, title, artist_key, title_key, week_date, week_key, imported_at)
            VALUES ('vg-albums.csv', 1998, 1, 1, 'Artist', 'Album', 'artist', 'album', '1998-01-01', '1998-01', 'now');
            INSERT INTO vg_lista_single_chart_entries
                (source_file, year, week, rank, artist, title, artist_key, title_key, week_date, week_key, imported_at)
            VALUES ('vg-singles.csv', 1998, 1, 1, 'Artist', 'Song', 'artist', 'song', '1998-01-01', '1998-01', 'now');
            INSERT INTO official_uk_album_chart_entries
                (source_file, year, week, chart_date, rank, artist, title, artist_key, title_key, week_key, imported_at)
            VALUES ('uk-albums.csv', 1998, 1, '1998-01-01', 1, 'Artist', 'Album', 'artist', 'album', '1998-01', 'now');
            INSERT INTO official_uk_single_chart_entries
                (source_file, year, week, chart_date, rank, artist, title, artist_key, title_key, week_key, imported_at)
            VALUES ('uk-singles.csv', 1998, 1, '1998-01-01', 1, 'Artist', 'Song', 'artist', 'song', '1998-01', 'now');
            INSERT INTO ti_i_skuddet_chart_entries
                (source_file, year, week, chart_date, rank, rank_raw, artist, title, artist_key, title_key, imported_at)
            VALUES ('ti.csv', 1998, 1, '1998-01-01', 1, '1', 'Artist', 'Song', 'artist', 'song', 'now');
            INSERT INTO norsktoppen_chart_entries
                (source_file, year, week, chart_date, rank, rank_raw, artist, title, artist_key, title_key, imported_at)
            VALUES ('norsk.csv', 1998, 1, '1998-01-01', 1, '1', 'Artist', 'Song', 'artist', 'song', 'now');

            ALTER TABLE library_completion_verifications DROP COLUMN verification_provider;
            ALTER TABLE library_completion_verifications DROP COLUMN musicbrainz_outcome;
            ALTER TABLE library_completion_verifications DROP COLUMN musicbrainz_message;
            ALTER TABLE library_completion_verifications DROP COLUMN discogs_outcome;
            ALTER TABLE library_completion_verifications DROP COLUMN discogs_message;
            ALTER TABLE library_completion_verifications DROP COLUMN discogs_master_id;
            ALTER TABLE library_completion_verifications DROP COLUMN discogs_url;
            ALTER TABLE library_completion_verification_items DROP COLUMN provider;
            PRAGMA user_version = 41;
            ",
        )
        .expect("simulate schema forty-one with chart data");

        migrate(&conn).expect("migrate isolated Discogs schema");

        for table in [
            "billboard_chart_entries",
            "billboard_single_chart_entries",
            "vg_lista_album_chart_entries",
            "vg_lista_single_chart_entries",
            "official_uk_album_chart_entries",
            "official_uk_single_chart_entries",
            "ti_i_skuddet_chart_entries",
            "norsktoppen_chart_entries",
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap_or_else(|error| panic!("count preserved rows in {table}: {error}"));
            assert_eq!(count, 1, "provider schema upgrades must preserve {table}");
        }
        assert!(migrations::phase_forty_two_schema_exists(&conn)
            .expect("Discogs verification schema exists"));
        assert!(migrations::phase_forty_three_schema_exists(&conn)
            .expect("cover enrichment schema exists"));
        assert!(migrations::phase_forty_four_schema_exists(&conn)
            .expect("chart artist discovery schema exists"));
    }

    #[test]
    fn plex_removal_upgrade_preserves_saved_playlists_and_smart_rules() {
        for version in [55, 59] {
            let conn = seeded_connection();
            let playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");
            let saved = save_playlist(
                &conn,
                SavePlaylistRequest {
                    id: None,
                    name: "Living Synthpop".to_string(),
                    playlist: playlist.clone(),
                },
            )
            .expect("save Smart playlist");
            let snapshot = save_playlist(
                &conn,
                SavePlaylistRequest {
                    id: None,
                    name: "Fixed snapshot".to_string(),
                    playlist,
                },
            )
            .expect("save fixed playlist");
            let before: Vec<(i64, String, String, String)> = conn
                .prepare(
                    "SELECT id, name, playlist_json, updated_at FROM saved_playlists ORDER BY id",
                )
                .unwrap()
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            conn.execute_batch(
                "
                DROP TABLE playlist_automations;
                CREATE TABLE playlist_automations (
                    saved_playlist_id INTEGER PRIMARY KEY REFERENCES saved_playlists(id) ON DELETE CASCADE,
                    smart INTEGER NOT NULL DEFAULT 0,
                    plex_sync_enabled INTEGER NOT NULL DEFAULT 0,
                    plex_playlist_rating_key TEXT,
                    last_evaluated_at TEXT,
                    last_plex_attempt_at TEXT,
                    last_plex_success_at TEXT,
                    last_plex_error TEXT,
                    desired_count INTEGER NOT NULL DEFAULT 0,
                    matched_count INTEGER NOT NULL DEFAULT 0,
                    missing_count INTEGER NOT NULL DEFAULT 0,
                    last_content_hash TEXT
                );
                CREATE INDEX idx_playlist_automations_plex_sync ON playlist_automations(plex_sync_enabled, saved_playlist_id);
                CREATE TABLE plex_track_cache (normalized_file_path TEXT);
                CREATE INDEX idx_plex_track_cache_path ON plex_track_cache(normalized_file_path);
                INSERT INTO plex_track_cache VALUES ('D:\\Music\\track.mp3');
                CREATE TABLE plex_sync_state (id INTEGER PRIMARY KEY, last_error TEXT);
                INSERT INTO plex_sync_state VALUES (1, 'retired sync error');
                ",
            )
            .expect("restore populated legacy schema");
            conn.execute(
                "INSERT INTO playlist_automations (saved_playlist_id, smart, plex_sync_enabled,
                    plex_playlist_rating_key, last_evaluated_at, last_plex_error, desired_count)
                 VALUES (?1, 1, 1, 'plex-playlist-42', '2026-10-05T12:00:00Z', 'old Plex failure', 1)",
                params![saved.id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO playlist_automations (saved_playlist_id) VALUES (?1)",
                params![snapshot.id],
            )
            .unwrap();
            conn.pragma_update(None, "user_version", version).unwrap();

            migrate(&conn).expect("upgrade legacy Plex catalog");
            migrate(&conn).expect("repeat upgrade without recreating Plex tables");

            let after: Vec<(i64, String, String, String)> = conn
                .prepare(
                    "SELECT id, name, playlist_json, updated_at FROM saved_playlists ORDER BY id",
                )
                .unwrap()
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            assert_eq!(
                before, after,
                "saved playlist snapshots must stay byte-for-byte intact"
            );
            assert!(migrations::phase_sixty_schema_exists(&conn).unwrap());
            let automation = load_saved_playlist(&conn, saved.id).unwrap().automation;
            assert!(automation.smart);
            assert_eq!(automation.desired_count, 1);
            assert_eq!(
                automation.last_evaluated_at.as_deref(),
                Some("2026-10-05T12:00:00Z")
            );
            assert!(automation.last_error.is_none());
            assert!(
                !load_saved_playlist(&conn, snapshot.id)
                    .unwrap()
                    .automation
                    .smart
            );
            let columns: Vec<String> = conn
                .prepare("PRAGMA table_info(playlist_automations)")
                .unwrap()
                .query_map([], |row| row.get(1))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            assert_eq!(
                columns,
                [
                    "saved_playlist_id",
                    "smart",
                    "last_evaluated_at",
                    "last_error",
                    "desired_count"
                ]
            );
            assert!(!schema_index_exists(&conn, "idx_playlist_automations_plex_sync").unwrap());
            assert!(!schema_index_exists(&conn, "idx_plex_track_cache_path").unwrap());
            assert_eq!(
                refresh_all_smart_playlists_for_connection(&conn).unwrap(),
                1
            );
            delete_saved_playlist(&conn, saved.id).unwrap();
            let remaining: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM playlist_automations WHERE saved_playlist_id = ?1",
                    params![saved.id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                remaining, 0,
                "the migrated Smart rules must still cascade on deletion"
            );
            assert_eq!(list_saved_playlists(&conn).unwrap().len(), 1);
        }
    }

    #[test]
    fn clears_legacy_developer_overlay_sync_default() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute(
            "UPDATE app_settings SET musicbrainz_overlay_sync_path = ?1 WHERE id = 1",
            params![r"C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3"],
        )
        .expect("restore legacy developer default");
        conn.execute_batch("PRAGMA user_version = 19;")
            .expect("rewind schema version");

        migrate(&conn).expect("migrate portable overlay default");

        let sync_path: String = conn
            .query_row(
                "SELECT musicbrainz_overlay_sync_path FROM app_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read migrated overlay path");
        assert!(sync_path.is_empty());
    }

    #[test]
    fn migrates_existing_album_table_before_billboard_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        conn.execute_batch(
            "
            CREATE TABLE albums (
                id TEXT PRIMARY KEY,
                import_run_id INTEGER NOT NULL,
                album_unique_id TEXT,
                album TEXT,
                album_artist_display TEXT,
                canonical_genre TEXT,
                genre_normalized TEXT,
                publisher TEXT,
                year INTEGER,
                release_year INTEGER,
                total_tracks INTEGER NOT NULL,
                rated_tracks INTEGER NOT NULL,
                rating_completeness REAL NOT NULL,
                total_seconds INTEGER NOT NULL,
                loved_tracks INTEGER NOT NULL,
                tmoe_seconds INTEGER NOT NULL,
                ae_ratio REAL NOT NULL,
                album_rating INTEGER,
                calculated_album_rating INTEGER,
                effective_album_rating INTEGER,
                album_score REAL
            );
            PRAGMA user_version = 7;
            ",
        )
        .expect("create pre-billboard albums table");

        migrate(&conn).expect("migrate pre-billboard schema");

        assert!(schema_column_exists(&conn, "albums", "billboard_rank")
            .expect("billboard rank column exists"));
        assert!(schema_column_exists(&conn, "albums", "billboard_year")
            .expect("billboard year column exists"));
        assert!(schema_table_exists(&conn, "billboard_chart_entries")
            .expect("billboard chart entry table exists"));
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_rank")
                .expect("billboard single rank column exists")
        );
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_year")
                .expect("billboard single year column exists")
        );
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_debut_date")
                .expect("billboard single debut date column exists")
        );
        assert!(schema_column_exists(
            &conn,
            "billboard_single_chart_entries",
            "date_entered_quality"
        )
        .expect("billboard single date quality column exists"));
        assert!(schema_table_exists(&conn, "billboard_single_chart_entries")
            .expect("billboard single chart entry table exists"));
        assert!(phase_twelve_schema_exists(&conn).expect("phase twelve schema exists"));
    }

    #[test]
    fn migrates_existing_track_table_before_billboard_singles_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        conn.execute_batch(
            "
            CREATE TABLE tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                import_run_id INTEGER NOT NULL,
                album_id TEXT NOT NULL,
                album_unique_id TEXT,
                display_artist TEXT,
                album_artist_display TEXT,
                album TEXT,
                title TEXT,
                genre TEXT,
                canonical_genre TEXT,
                genre_normalized TEXT,
                publisher TEXT,
                love TEXT,
                rating_raw TEXT,
                normalized_rating INTEGER,
                album_rating_raw TEXT,
                album_rating INTEGER,
                disc_number INTEGER,
                track_number INTEGER,
                year INTEGER,
                release_year INTEGER,
                time_seconds INTEGER,
                file_path TEXT,
                filename TEXT,
                row_hash TEXT NOT NULL
            );
            PRAGMA user_version = 9;
            ",
        )
        .expect("create pre-singles tracks table");

        migrate(&conn).expect("migrate pre-singles schema");

        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_rank")
                .expect("billboard single rank column exists")
        );
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_year")
                .expect("billboard single year column exists")
        );
        assert!(
            schema_column_exists(&conn, "tracks", "billboard_single_debut_week_key")
                .expect("billboard single debut week column exists")
        );
        assert!(phase_twelve_schema_exists(&conn).expect("phase twelve schema exists"));
    }

    #[test]
    fn migrates_existing_billboard_singles_table_before_date_index() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        conn.execute_batch(
            "
            CREATE TABLE billboard_single_chart_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_file TEXT NOT NULL,
                year INTEGER NOT NULL,
                rank INTEGER NOT NULL,
                artist TEXT NOT NULL,
                featured TEXT,
                display_artist TEXT NOT NULL,
                title TEXT NOT NULL,
                artist_key TEXT NOT NULL,
                title_key TEXT NOT NULL,
                matched_track_id INTEGER,
                imported_at TEXT NOT NULL
            );
            PRAGMA user_version = 33;
            ",
        )
        .expect("create schema thirty-three Billboard singles table");

        migrate(&conn).expect("migrate schema thirty-three singles table");

        assert!(
            schema_column_exists(&conn, "billboard_single_chart_entries", "date_entered")
                .expect("Billboard single date entered column exists")
        );
        assert!(schema_column_exists(
            &conn,
            "billboard_single_chart_entries",
            "date_entered_quality"
        )
        .expect("Billboard single date quality column exists"));
        assert!(
            schema_column_exists(&conn, "billboard_single_chart_entries", "album")
                .expect("Billboard single source album column exists")
        );
        assert!(
            schema_column_exists(&conn, "billboard_single_chart_entries", "album_key")
                .expect("Billboard single source album key column exists")
        );
        assert!(
            schema_index_exists(&conn, "idx_billboard_single_chart_entries_date")
                .expect("Billboard single date index exists")
        );
        let user_version = conn
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read migrated user version");
        assert_eq!(user_version, LATEST_SCHEMA_VERSION);
    }

    fn stored_version(conn: &Connection) -> i32 {
        conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
            .expect("read user version")
    }

    #[test]
    fn migration_ladder_is_strictly_ordered_and_ends_at_the_latest_version() {
        let versions: Vec<i32> = MIGRATIONS.iter().map(|step| step.version).collect();
        assert!(
            versions.windows(2).all(|pair| pair[0] < pair[1]),
            "migration versions must be unique and ascending: {versions:?}"
        );
        assert_eq!(versions.last().copied(), Some(LATEST_SCHEMA_VERSION));
        assert!(MIGRATIONS
            .iter()
            .all(|step| !step.description.trim().is_empty()));
    }

    #[test]
    fn upgrades_a_schema_twenty_database_to_the_latest_version() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "INSERT INTO import_runs (source_path, started_at, status)
             VALUES ('fixture.tsv', '2026-01-01T00:00:00Z', 'completed');",
        )
        .expect("insert import run");
        insert_test_album(&conn, "album-1", "Kate Bush", "Hounds of Love", 1985, 12);
        conn.execute_batch("PRAGMA user_version = 20;")
            .expect("rewind schema version");

        migrate(&conn).expect("upgrade from schema 20");

        assert_eq!(stored_version(&conn), LATEST_SCHEMA_VERSION);
        let albums: i64 = conn
            .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
            .expect("count albums");
        assert_eq!(albums, 1, "replaying steps must keep existing catalog rows");
        for step in MIGRATIONS {
            if let Some(verify) = step.verify {
                assert!(
                    verify(&conn).expect("verify step"),
                    "schema {} ({}) must verify after the upgrade",
                    step.version,
                    step.description
                );
            }
        }
    }

    #[test]
    fn replays_steps_whose_tables_are_missing_from_a_current_database() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch("DROP TABLE daily_edition_snapshots; DROP TABLE album_reviews;")
            .expect("simulate a restored database with missing tables");
        assert_eq!(stored_version(&conn), LATEST_SCHEMA_VERSION);

        migrate(&conn).expect("repair missing tables");

        assert!(schema_table_exists(&conn, "daily_edition_snapshots").unwrap());
        assert!(schema_table_exists(&conn, "album_reviews").unwrap());
        assert_eq!(stored_version(&conn), LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn recreates_the_published_charts_archive_when_it_is_missing() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "DROP TABLE published_chart_entries;
             DROP TABLE published_chart_books;
             DROP TABLE published_chart_import_years;
             DROP TABLE published_chart_identity;",
        )
        .expect("drop Published Charts tables");

        migrate(&conn).expect("repair Published Charts schema");

        assert!(crate::published_charts::schema_exists(&conn).unwrap());
        assert_eq!(stored_version(&conn), LATEST_SCHEMA_VERSION);
    }

    #[test]
    fn leaves_a_database_from_a_newer_build_untouched() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        let newer = LATEST_SCHEMA_VERSION + 5;
        conn.execute_batch(&format!("PRAGMA user_version = {newer};"))
            .expect("simulate a newer schema");

        migrate(&conn).expect("migrate a newer database");

        assert_eq!(stored_version(&conn), newer);
    }

    #[test]
    fn upgrading_schema_forty_three_runs_every_later_step() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        configure(&conn).expect("configure database");
        migrate(&conn).expect("initial migration");
        conn.execute_batch(
            "DROP TABLE daily_edition_snapshots;
             DROP TABLE album_reviews;
             DROP TABLE library_updates;
             PRAGMA user_version = 43;",
        )
        .expect("rewind to schema 43 without the later tables");

        migrate(&conn).expect("upgrade from schema 43");

        for table in ["daily_edition_snapshots", "album_reviews", "library_updates"] {
            assert!(
                schema_table_exists(&conn, table).unwrap(),
                "{table} must be recreated by the schema 45-54 steps"
            );
        }
        assert_eq!(stored_version(&conn), LATEST_SCHEMA_VERSION);
    }
}
