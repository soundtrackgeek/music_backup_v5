use super::*;

/// Schema 41: the catalog as it stood before the versioned ladder began.
///
/// Every statement is idempotent, so this also repairs databases whose recorded
/// version is lower than the tables they actually contain.
pub(super) fn create_baseline_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            track_rows INTEGER NOT NULL DEFAULT 0,
            album_count INTEGER NOT NULL DEFAULT 0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT,
            error_message TEXT,
            added_tracks INTEGER NOT NULL DEFAULT 0,
            changed_tracks INTEGER NOT NULL DEFAULT 0,
            removed_tracks INTEGER NOT NULL DEFAULT 0,
            added_albums INTEGER NOT NULL DEFAULT 0,
            changed_albums INTEGER NOT NULL DEFAULT 0,
            removed_albums INTEGER NOT NULL DEFAULT 0,
            rating_events_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS database_backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            operation TEXT NOT NULL,
            source_path TEXT,
            source_size_bytes INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS raw_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            row_number INTEGER NOT NULL,
            display_artist TEXT,
            album_rating TEXT,
            disc_number TEXT,
            album TEXT,
            genre TEXT,
            love TEXT,
            publisher TEXT,
            rating TEXT,
            title TEXT,
            track_number TEXT,
            year_value TEXT,
            release_year TEXT,
            album_unique_id TEXT,
            file_path TEXT,
            filename TEXT,
            album_artist_display TEXT,
            time_value TEXT,
            row_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
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
            billboard_single_rank INTEGER,
            billboard_single_year INTEGER,
            billboard_single_debut_date TEXT,
            billboard_single_debut_year INTEGER,
            billboard_single_debut_month INTEGER,
            billboard_single_debut_week INTEGER,
            billboard_single_debut_week_key TEXT,
            vg_lista_rank INTEGER,
            vg_lista_year INTEGER,
            vg_lista_debut_date TEXT,
            vg_lista_debut_year INTEGER,
            vg_lista_debut_month INTEGER,
            vg_lista_debut_week INTEGER,
            vg_lista_debut_week_key TEXT,
            official_uk_rank INTEGER,
            official_uk_year INTEGER,
            official_uk_debut_date TEXT,
            official_uk_debut_year INTEGER,
            official_uk_debut_month INTEGER,
            official_uk_debut_week INTEGER,
            official_uk_debut_week_key TEXT,
            ti_i_skuddet_rank INTEGER,
            ti_i_skuddet_year INTEGER,
            ti_i_skuddet_debut_date TEXT,
            ti_i_skuddet_debut_year INTEGER,
            ti_i_skuddet_debut_month INTEGER,
            ti_i_skuddet_debut_week INTEGER,
            ti_i_skuddet_debut_week_key TEXT,
            norsktoppen_rank INTEGER,
            norsktoppen_year INTEGER,
            norsktoppen_debut_date TEXT,
            norsktoppen_debut_year INTEGER,
            norsktoppen_debut_month INTEGER,
            norsktoppen_debut_week INTEGER,
            norsktoppen_debut_week_key TEXT,
            row_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS albums (
            id TEXT PRIMARY KEY,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
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
            album_score REAL,
            billboard_rank INTEGER,
            billboard_year INTEGER,
            billboard_debut_year INTEGER,
            billboard_debut_month INTEGER,
            billboard_debut_week INTEGER,
            billboard_debut_week_key TEXT,
            vg_lista_rank INTEGER,
            vg_lista_year INTEGER,
            vg_lista_debut_year INTEGER,
            vg_lista_debut_month INTEGER,
            vg_lista_debut_week INTEGER,
            vg_lista_debut_week_key TEXT,
            official_uk_rank INTEGER,
            official_uk_year INTEGER,
            official_uk_debut_year INTEGER,
            official_uk_debut_month INTEGER,
            official_uk_debut_week INTEGER,
            official_uk_debut_week_key TEXT
        );

        CREATE TABLE IF NOT EXISTS album_covers (
            album_id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            source_path TEXT,
            cache_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            extension TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS billboard_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            album_key TEXT NOT NULL,
            first_appearance TEXT,
            first_appearance_year INTEGER,
            first_appearance_month INTEGER,
            first_appearance_week INTEGER,
            first_appearance_week_key TEXT,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS billboard_single_chart_entries (
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
            album TEXT,
            album_key TEXT,
            date_entered_raw TEXT,
            date_entered TEXT,
            date_entered_year INTEGER,
            date_entered_month INTEGER,
            date_entered_week INTEGER,
            date_entered_week_key TEXT,
            date_entered_quality TEXT NOT NULL DEFAULT 'missing',
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vg_lista_album_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            week_date TEXT NOT NULL,
            week_key TEXT NOT NULL,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vg_lista_single_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            week_date TEXT NOT NULL,
            week_key TEXT NOT NULL,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS official_uk_album_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            chart_end_date TEXT,
            rank INTEGER NOT NULL,
            last_week TEXT,
            movement TEXT,
            peak TEXT,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            weeks_on_chart TEXT,
            source_url TEXT,
            item_url TEXT,
            week_key TEXT NOT NULL,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS official_uk_single_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            chart_end_date TEXT,
            rank INTEGER NOT NULL,
            last_week TEXT,
            movement TEXT,
            peak TEXT,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            weeks_on_chart TEXT,
            source_url TEXT,
            item_url TEXT,
            week_key TEXT NOT NULL,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ti_i_skuddet_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            rank INTEGER NOT NULL,
            rank_raw TEXT NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            score_votes TEXT,
            note TEXT,
            chart_details TEXT,
            source_url TEXT,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS norsktoppen_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            rank INTEGER NOT NULL,
            rank_raw TEXT NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            points TEXT,
            note TEXT,
            chart_details TEXT,
            source_url TEXT,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
        CREATE INDEX IF NOT EXISTS idx_tracks_rating ON tracks(normalized_rating);
        CREATE INDEX IF NOT EXISTS idx_tracks_love ON tracks(love);
        CREATE INDEX IF NOT EXISTS idx_tracks_file ON tracks(file_path, filename);
        CREATE INDEX IF NOT EXISTS idx_tracks_display_artist_title_nocase
            ON tracks(display_artist COLLATE NOCASE, title COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_tracks_album_artist_title_nocase
            ON tracks(album_artist_display COLLATE NOCASE, title COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_albums_unique_id ON albums(album_unique_id);
        CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year);
        CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(album_artist_display);
        CREATE INDEX IF NOT EXISTS idx_albums_genre ON albums(genre_normalized);
        CREATE INDEX IF NOT EXISTS idx_albums_total_seconds ON albums(total_seconds);
        CREATE INDEX IF NOT EXISTS idx_albums_rating_completeness ON albums(rating_completeness);
        CREATE INDEX IF NOT EXISTS idx_albums_album_score ON albums(album_score);
        CREATE INDEX IF NOT EXISTS idx_album_covers_imported_at ON album_covers(imported_at);
        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_match
            ON billboard_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_year_rank
            ON billboard_chart_entries(year, rank);
        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_match
            ON billboard_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_year_rank
            ON billboard_single_chart_entries(year, rank);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_album_chart_entries_match
            ON vg_lista_album_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_album_chart_entries_week_rank
            ON vg_lista_album_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_single_chart_entries_match
            ON vg_lista_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_single_chart_entries_week_rank
            ON vg_lista_single_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_official_uk_album_chart_entries_match
            ON official_uk_album_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_official_uk_album_chart_entries_week_rank
            ON official_uk_album_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_official_uk_single_chart_entries_match
            ON official_uk_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_official_uk_single_chart_entries_week_rank
            ON official_uk_single_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_ti_i_skuddet_chart_entries_match
            ON ti_i_skuddet_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_ti_i_skuddet_chart_entries_week_rank
            ON ti_i_skuddet_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_norsktoppen_chart_entries_match
            ON norsktoppen_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_norsktoppen_chart_entries_week_rank
            ON norsktoppen_chart_entries(year, week, rank);

        CREATE VIRTUAL TABLE IF NOT EXISTS album_search_fts USING fts5(
            album_id UNINDEXED,
            album,
            album_artist_display,
            canonical_genre,
            publisher
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS track_search_fts USING fts5(
            track_id UNINDEXED,
            album_id UNINDEXED,
            title,
            display_artist,
            album,
            album_artist_display,
            canonical_genre,
            publisher,
            file_path,
            filename
        );

        CREATE TABLE IF NOT EXISTS saved_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            view TEXT NOT NULL,
            request_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS saved_charts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            config_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            content_json TEXT NOT NULL,
            library_import_run_id INTEGER,
            library_imported_at TEXT,
            library_album_count INTEGER NOT NULL DEFAULT 0,
            library_track_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_snapshots_kind_created
            ON ai_snapshots(kind, created_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS saved_playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            prompt TEXT NOT NULL,
            playlist_json TEXT NOT NULL,
            library_import_run_id INTEGER,
            library_imported_at TEXT,
            library_album_count INTEGER NOT NULL DEFAULT 0,
            library_track_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_saved_playlists_updated
            ON saved_playlists(updated_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS saved_external_discoveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            prompt TEXT NOT NULL,
            response_json TEXT NOT NULL,
            library_import_run_id INTEGER,
            library_imported_at TEXT,
            library_album_count INTEGER NOT NULL DEFAULT 0,
            library_track_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_saved_external_discoveries_updated
            ON saved_external_discoveries(updated_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS wish_list_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity TEXT NOT NULL CHECK(entity IN ('artist', 'album')),
            title TEXT NOT NULL,
            artist TEXT NOT NULL DEFAULT '',
            year INTEGER,
            musicbrainz_id TEXT,
            musicbrainz_url TEXT,
            source TEXT NOT NULL,
            identity_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_wish_list_items_entity_created
            ON wish_list_items(entity, created_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS library_completion_decisions (
            candidate_key TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('wanted', 'notForMe', 'needsReview')),
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            chart_year INTEGER NOT NULL,
            wish_list_item_id INTEGER REFERENCES wish_list_items(id) ON DELETE SET NULL,
            musicbrainz_id TEXT,
            musicbrainz_url TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_decisions_status
            ON library_completion_decisions(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS library_completion_verifications (
            candidate_key TEXT PRIMARY KEY,
            outcome TEXT NOT NULL CHECK(outcome IN ('verified', 'noMatch', 'ambiguous', 'failed')),
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            chart_year INTEGER NOT NULL,
            musicbrainz_id TEXT,
            musicbrainz_url TEXT,
            matched_artist TEXT,
            matched_title TEXT,
            matched_year INTEGER,
            score INTEGER,
            message TEXT NOT NULL,
            verification_provider TEXT NOT NULL DEFAULT 'musicbrainz',
            musicbrainz_outcome TEXT,
            musicbrainz_message TEXT,
            discogs_outcome TEXT,
            discogs_message TEXT,
            discogs_master_id TEXT,
            discogs_url TEXT,
            cover_state TEXT,
            cover_provider TEXT,
            cover_source_url TEXT,
            cover_cache_path TEXT,
            cover_mime_type TEXT,
            cover_message TEXT,
            cover_checked_at TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 1,
            checked_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_verifications_outcome
            ON library_completion_verifications(outcome, updated_at DESC);

        CREATE TABLE IF NOT EXISTS library_completion_verification_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            source TEXT,
            decade INTEGER,
            state TEXT NOT NULL CHECK(state IN ('running', 'paused', 'completed')),
            total_count INTEGER NOT NULL DEFAULT 0,
            cached_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            started_at TEXT,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_verification_batches_state
            ON library_completion_verification_batches(state, updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_library_completion_verification_batches_one_active
            ON library_completion_verification_batches(
                (CASE WHEN state IN ('running', 'paused') THEN 1 END)
            );

        CREATE TABLE IF NOT EXISTS library_completion_verification_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES library_completion_verification_batches(id)
                ON DELETE CASCADE,
            candidate_key TEXT NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            chart_year INTEGER NOT NULL,
            source TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT 'musicbrainz',
            state TEXT NOT NULL CHECK(state IN ('queued', 'checking', 'verified', 'noMatch', 'ambiguous', 'failed')),
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            UNIQUE(batch_id, candidate_key)
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_verification_items_batch_state
            ON library_completion_verification_items(batch_id, state, id);

        CREATE TABLE IF NOT EXISTS library_completion_artist_verifications (
            artist_key TEXT PRIMARY KEY,
            outcome TEXT NOT NULL CHECK(outcome IN ('verified', 'noMatch', 'ambiguous', 'failed')),
            artist TEXT NOT NULL,
            message TEXT NOT NULL,
            musicbrainz_outcome TEXT,
            musicbrainz_message TEXT,
            musicbrainz_id TEXT,
            musicbrainz_url TEXT,
            official_album_count INTEGER NOT NULL DEFAULT 0,
            discogs_outcome TEXT,
            discogs_message TEXT,
            discogs_master_id TEXT,
            discogs_url TEXT,
            discogs_studio_album_title TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 1,
            checked_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_verifications_outcome
            ON library_completion_artist_verifications(outcome, updated_at DESC);

        CREATE TABLE IF NOT EXISTS library_completion_artist_decisions (
            artist_key TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('wanted', 'notForMe', 'needsReview')),
            artist TEXT NOT NULL,
            wish_list_item_id INTEGER REFERENCES wish_list_items(id) ON DELETE SET NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_decisions_status
            ON library_completion_artist_decisions(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS library_completion_artist_verification_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('running', 'paused', 'completed')),
            total_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_verification_batches_state
            ON library_completion_artist_verification_batches(state, updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_library_completion_artist_verification_batches_one_active
            ON library_completion_artist_verification_batches(
                (CASE WHEN state IN ('running', 'paused') THEN 1 END)
            );

        CREATE TABLE IF NOT EXISTS library_completion_artist_verification_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES library_completion_artist_verification_batches(id)
                ON DELETE CASCADE,
            artist_key TEXT NOT NULL,
            artist TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'musicbrainz',
            state TEXT NOT NULL CHECK(state IN ('queued', 'checking', 'verified', 'noMatch', 'ambiguous', 'failed')),
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            UNIQUE(batch_id, artist_key)
        );

        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_verification_items_batch_state
            ON library_completion_artist_verification_items(batch_id, state, id);

        CREATE TABLE IF NOT EXISTS deemix_downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deezer_album_id TEXT NOT NULL,
            wish_list_item_id INTEGER,
            musicbrainz_release_group_id TEXT,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            year INTEGER,
            quality TEXT NOT NULL,
            destination_path TEXT NOT NULL,
            cover_path TEXT,
            track_count INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'download',
            UNIQUE(deezer_album_id, destination_path)
        );

        CREATE INDEX IF NOT EXISTS idx_deemix_downloads_wish_list_item
            ON deemix_downloads(wish_list_item_id, completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_deemix_downloads_musicbrainz_release
            ON deemix_downloads(musicbrainz_release_group_id, completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_deemix_downloads_deezer_album
            ON deemix_downloads(deezer_album_id, completed_at DESC);

        CREATE TABLE IF NOT EXISTS exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            view TEXT NOT NULL,
            format TEXT NOT NULL,
            row_count INTEGER NOT NULL,
            path TEXT NOT NULL,
            request_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rating_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            created_at TEXT NOT NULL,
            track_count INTEGER NOT NULL DEFAULT 0,
            album_count INTEGER NOT NULL DEFAULT 0,
            rated_tracks INTEGER NOT NULL DEFAULT 0,
            unrated_tracks INTEGER NOT NULL DEFAULT 0,
            fully_rated_albums INTEGER NOT NULL DEFAULT 0,
            partially_rated_albums INTEGER NOT NULL DEFAULT 0,
            unrated_albums INTEGER NOT NULL DEFAULT 0,
            albums_with_effective_rating INTEGER NOT NULL DEFAULT 0,
            average_album_rating REAL,
            average_album_score REAL
        );

        CREATE INDEX IF NOT EXISTS idx_rating_snapshots_import_run
            ON rating_snapshots(import_run_id);

        CREATE TABLE IF NOT EXISTS rating_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER NOT NULL REFERENCES import_runs(id),
            created_at TEXT NOT NULL,
            event_type TEXT NOT NULL,
            album_id TEXT NOT NULL,
            album TEXT,
            album_artist_display TEXT,
            year INTEGER,
            previous_rated_tracks INTEGER,
            current_rated_tracks INTEGER,
            previous_rating_completeness REAL,
            current_rating_completeness REAL,
            previous_effective_album_rating INTEGER,
            current_effective_album_rating INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_rating_events_import_run
            ON rating_events(import_run_id);
        CREATE INDEX IF NOT EXISTS idx_rating_events_created_at
            ON rating_events(created_at);

        CREATE TABLE IF NOT EXISTS library_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL,
            change_kind TEXT NOT NULL
                CHECK (change_kind IN ('new', 'changed', 'removed')),
            category TEXT NOT NULL,
            album_id TEXT NOT NULL,
            album_artist_display TEXT,
            album TEXT,
            year INTEGER,
            field TEXT,
            field_label TEXT,
            previous_value TEXT,
            current_value TEXT,
            change_count INTEGER,
            description TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_label TEXT NOT NULL,
            source_path TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_library_updates_created_at
            ON library_updates(created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_library_updates_kind_created_at
            ON library_updates(change_kind, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_library_updates_album
            ON library_updates(album_id, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_library_updates_import_run
            ON library_updates(import_run_id, id);

        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            backup_retention INTEGER NOT NULL DEFAULT 3,
            dark_mode INTEGER NOT NULL DEFAULT 0,
            country_flag_display TEXT NOT NULL DEFAULT 'flagAndName',
            left_sidebar_default TEXT NOT NULL DEFAULT 'expanded',
            right_sidebar_default TEXT NOT NULL DEFAULT 'expanded',
            import_source_path TEXT NOT NULL DEFAULT 'musicbee-library.tsv',
            cover_source_path TEXT NOT NULL DEFAULT 'AlbumCovers',
            billboard_source_path TEXT NOT NULL DEFAULT 'CSV_ALBUMS',
            billboard_singles_source_path TEXT NOT NULL DEFAULT 'CSV_SINGLES',
            vg_lista_album_source_path TEXT NOT NULL DEFAULT 'CSV_ALBUMS_NO',
            vg_lista_singles_source_path TEXT NOT NULL DEFAULT 'CSV_SINGLES_NO',
            official_uk_album_source_path TEXT NOT NULL DEFAULT 'CSV_ALBUMS_UK',
            official_uk_singles_source_path TEXT NOT NULL DEFAULT 'CSV_SINGLES_UK',
            ti_i_skuddet_source_path TEXT NOT NULL DEFAULT 'CSV_TIISKUDDET_NO',
            norsktoppen_source_path TEXT NOT NULL DEFAULT 'CSV_NORSKTOPPEN_NO',
            deemix_download_path TEXT NOT NULL DEFAULT '',
            deemix_download_quality TEXT NOT NULL DEFAULT 'mp3_320',
            deemix_download_fallback INTEGER NOT NULL DEFAULT 1,
            deemix_download_organization TEXT NOT NULL DEFAULT 'flat_artist_album_year',
            musicbrainz_cache_path TEXT NOT NULL DEFAULT 'MusicBrainz/musicbrainz_cache.db',
            musicbrainz_overlay_sync_path TEXT NOT NULL DEFAULT '',
            musicbrainz_overlay_auto_sync_minutes INTEGER NOT NULL DEFAULT 0,
            update_auto_check_minutes INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_links (
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

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decisions (
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

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_links_mbid
            ON musicbrainz_artist_links(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_decisions_decision
            ON musicbrainz_release_decisions(decision);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_link_tombstones (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decision_tombstones (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid)
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_overlay_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL,
            sync_path TEXT NOT NULL,
            imported_count INTEGER NOT NULL DEFAULT 0,
            exported_count INTEGER NOT NULL DEFAULT 0,
            changed_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            artist_links_imported INTEGER NOT NULL DEFAULT 0,
            artist_links_exported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_imported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_exported INTEGER NOT NULL DEFAULT 0,
            release_decisions_imported INTEGER NOT NULL DEFAULT 0,
            release_decisions_exported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_imported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_exported INTEGER NOT NULL DEFAULT 0,
            release_statuses_imported INTEGER NOT NULL DEFAULT 0,
            release_statuses_exported INTEGER NOT NULL DEFAULT 0,
            release_groups_imported INTEGER NOT NULL DEFAULT 0,
            release_groups_exported INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_overlay_sync_log_synced
            ON musicbrainz_overlay_sync_log(synced_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_release_status_cache (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            has_official_release INTEGER NOT NULL,
            checked_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_status_cache_checked
            ON musicbrainz_release_status_cache(checked_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_release_groups (
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

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_artist
            ON musicbrainz_artist_release_groups(artist_mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_fetched
            ON musicbrainz_artist_release_groups(fetched_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_origin_countries (
            country_code TEXT PRIMARY KEY,
            country_name TEXT NOT NULL,
            area_mbid TEXT,
            iso_source TEXT NOT NULL DEFAULT 'musicbrainz',
            is_historical INTEGER NOT NULL DEFAULT 0,
            is_special INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_countries (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            country_code TEXT,
            country_name TEXT,
            raw_area_mbid TEXT,
            raw_area_name TEXT,
            raw_area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            derived_from TEXT NOT NULL DEFAULT 'unresolved',
            confidence REAL,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(country_code) REFERENCES musicbrainz_origin_countries(country_code)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_local_artist
            ON musicbrainz_artist_origin_countries(local_artist_key);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_country
            ON musicbrainz_artist_origin_countries(country_code);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_mbid
            ON musicbrainz_artist_origin_countries(mbid);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_import_runs_started
            ON musicbrainz_artist_origin_import_runs(started_at);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_infos (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            sort_name TEXT,
            artist_type TEXT,
            gender TEXT,
            life_begin_date TEXT,
            life_begin_year INTEGER,
            life_end_date TEXT,
            life_end_year INTEGER,
            life_ended INTEGER,
            area_mbid TEXT,
            area_name TEXT,
            area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            end_area_mbid TEXT,
            end_area_name TEXT,
            end_area_type TEXT,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_mbid
            ON musicbrainz_artist_infos(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_type
            ON musicbrainz_artist_infos(artist_type);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_gender
            ON musicbrainz_artist_infos(gender);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_begin_year
            ON musicbrainz_artist_infos(life_begin_year);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_end_year
            ON musicbrainz_artist_infos(life_end_year);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_info_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_info_import_runs_started
            ON musicbrainz_artist_info_import_runs(started_at);

        CREATE TABLE IF NOT EXISTS import_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            source_size_bytes INTEGER NOT NULL,
            source_modified_ms INTEGER NOT NULL,
            status TEXT NOT NULL,
            processed_rows INTEGER NOT NULL DEFAULT 0,
            processed_bytes INTEGER NOT NULL DEFAULT 0,
            track_rows INTEGER NOT NULL DEFAULT 0,
            album_count INTEGER NOT NULL DEFAULT 0,
            added_tracks INTEGER NOT NULL DEFAULT 0,
            changed_tracks INTEGER NOT NULL DEFAULT 0,
            removed_tracks INTEGER NOT NULL DEFAULT 0,
            added_albums INTEGER NOT NULL DEFAULT 0,
            changed_albums INTEGER NOT NULL DEFAULT 0,
            removed_albums INTEGER NOT NULL DEFAULT 0,
            suspicious_album_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,
            import_run_id INTEGER REFERENCES import_runs(id),
            error_message TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_import_sessions_source
            ON import_sessions(source_path, id DESC);

        CREATE TABLE IF NOT EXISTS import_stage_tracks (
            session_id INTEGER NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            row_number INTEGER NOT NULL,
            display_artist TEXT NOT NULL,
            album_rating_raw TEXT NOT NULL,
            disc_number_raw TEXT NOT NULL,
            album TEXT NOT NULL,
            genre TEXT NOT NULL,
            canonical_genre TEXT NOT NULL,
            genre_normalized TEXT NOT NULL,
            love TEXT NOT NULL,
            publisher TEXT NOT NULL,
            rating_raw TEXT NOT NULL,
            title TEXT NOT NULL,
            track_number_raw TEXT NOT NULL,
            year_raw TEXT NOT NULL,
            release_year_raw TEXT NOT NULL,
            album_unique_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            filename TEXT NOT NULL,
            album_artist_display TEXT NOT NULL,
            time_raw TEXT NOT NULL,
            normalized_rating INTEGER,
            track_rating_value INTEGER,
            album_rating INTEGER,
            disc_number INTEGER,
            track_number INTEGER,
            year INTEGER,
            release_year INTEGER,
            time_seconds INTEGER,
            album_id TEXT NOT NULL,
            row_hash TEXT NOT NULL,
            PRIMARY KEY (session_id, row_number)
        );

        CREATE INDEX IF NOT EXISTS idx_import_stage_tracks_identity
            ON import_stage_tracks(session_id, file_path, filename);

        CREATE TABLE IF NOT EXISTS import_stage_albums (
            session_id INTEGER NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            album_id TEXT NOT NULL,
            album_unique_id TEXT,
            album TEXT,
            album_artist_display TEXT,
            single_display_artist TEXT,
            single_display_artist_key TEXT,
            has_multiple_display_artists INTEGER NOT NULL DEFAULT 0,
            canonical_genre TEXT,
            genre_normalized TEXT,
            publisher TEXT,
            year INTEGER,
            release_year INTEGER,
            album_rating INTEGER,
            total_tracks INTEGER NOT NULL DEFAULT 0,
            rated_tracks INTEGER NOT NULL DEFAULT 0,
            normalized_rating_sum INTEGER NOT NULL DEFAULT 0,
            total_seconds INTEGER NOT NULL DEFAULT 0,
            loved_tracks INTEGER NOT NULL DEFAULT 0,
            tmoe_seconds INTEGER NOT NULL DEFAULT 0,
            final_album_artist_display TEXT,
            rating_completeness REAL,
            ae_ratio REAL,
            calculated_album_rating INTEGER,
            effective_album_rating INTEGER,
            album_score REAL,
            album_artist_display_inferred INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (session_id, album_id)
        );

        CREATE TABLE IF NOT EXISTS import_suspicious_albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
            album_id TEXT NOT NULL,
            album TEXT,
            album_artist_display TEXT,
            year INTEGER,
            reason TEXT NOT NULL,
            previous_track_count INTEGER,
            current_track_count INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_import_suspicious_albums_session
            ON import_suspicious_albums(session_id, id);

        CREATE TABLE IF NOT EXISTS music_tool_fix_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tool_id TEXT NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence TEXT NOT NULL,
            requested_count INTEGER NOT NULL DEFAULT 0,
            fixable_count INTEGER NOT NULL DEFAULT 0,
            affected_album_count INTEGER NOT NULL DEFAULT 0,
            affected_track_count INTEGER NOT NULL DEFAULT 0,
            changed_album_count INTEGER NOT NULL DEFAULT 0,
            changed_track_count INTEGER NOT NULL DEFAULT 0,
            backup_path TEXT,
            undo_backup_path TEXT,
            source_warning TEXT NOT NULL,
            diff_json TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            undone_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_music_tool_fix_runs_created
            ON music_tool_fix_runs(created_at DESC, id DESC);

        INSERT OR IGNORE INTO app_settings (
            id, backup_retention, dark_mode, updated_at
        ) VALUES (
            1, 3, 0, datetime('now')
        );
        ",
    )
    .map_err(|error| anyhow!("Could not run SQLite migrations: {error}"))?;
    ensure_import_run_change_columns(conn)?;
    ensure_app_settings_layout_columns(conn)?;
    ensure_app_settings_import_columns(conn)?;
    ensure_app_settings_deemix_columns(conn)?;
    ensure_album_billboard_columns(conn)?;
    ensure_billboard_chart_entries_table(conn)?;
    ensure_track_billboard_single_columns(conn)?;
    ensure_billboard_single_chart_entries_table(conn)?;
    ensure_vg_lista_schema(conn)?;
    ensure_official_uk_schema(conn)?;
    ensure_ti_i_skuddet_schema(conn)?;
    ensure_norsktoppen_schema(conn)?;
    ensure_app_settings_musicbrainz_columns(conn)?;
    ensure_app_settings_musicbrainz_sync_columns(conn)?;
    ensure_app_settings_update_columns(conn)?;
    ensure_app_settings_country_flag_display_column(conn)?;
    ensure_musicbrainz_decision_tables(conn)?;
    ensure_musicbrainz_tombstone_tables(conn)?;
    ensure_musicbrainz_overlay_sync_log(conn)?;
    ensure_musicbrainz_release_status_cache(conn)?;
    ensure_musicbrainz_artist_release_groups(conn)?;
    ensure_musicbrainz_origin_country_tables(conn)?;
    ensure_musicbrainz_artist_info_tables(conn)?;
    ensure_musicbrainz_map_location_tables(conn)?;
    migrations::migrate_portable_overlay_sync_default(conn)?;
    migrations::migrate_billboard_album_source_default(conn)?;
    conn.execute_batch("DROP INDEX IF EXISTS idx_tracks_file_identity;")
        .context("Could not drop the retired track identity index")?;
    Ok(())
}

pub(super) fn ensure_smart_playlist_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS playlist_automations (
            saved_playlist_id INTEGER PRIMARY KEY
                REFERENCES saved_playlists(id) ON DELETE CASCADE,
            smart INTEGER NOT NULL DEFAULT 0,
            last_evaluated_at TEXT,
            last_error TEXT,
            desired_count INTEGER NOT NULL DEFAULT 0
        );
        ",
    )
    .context("Could not create Smart playlist schema")?;
    migrations::migrate_uk_origin_country_alias(conn)?;
    Ok(())
}

pub(super) fn phase_nineteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_eighteen_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_artist_infos")?
        && schema_table_exists(conn, "musicbrainz_artist_info_import_runs")?)
}

pub(super) fn phase_eighteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_seventeen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "country_flag_display")?)
}

pub(super) fn phase_seventeen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_sixteen_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_origin_countries")?
        && schema_table_exists(conn, "musicbrainz_artist_origin_countries")?
        && schema_table_exists(conn, "musicbrainz_artist_origin_import_runs")?)
}

pub(super) fn phase_sixteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fifteen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "import_source_path")?
        && schema_column_exists(conn, "app_settings", "cover_source_path")?
        && schema_column_exists(conn, "app_settings", "billboard_source_path")?
        && schema_column_exists(conn, "app_settings", "billboard_singles_source_path")?)
}

pub(super) fn phase_fifteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_fourteen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "update_auto_check_minutes")?)
}

pub(super) fn phase_fourteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_thirteen_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "musicbrainz_overlay_sync_path")?
        && schema_column_exists(
            conn,
            "app_settings",
            "musicbrainz_overlay_auto_sync_minutes",
        )?
        && schema_table_exists(conn, "musicbrainz_artist_link_tombstones")?
        && schema_table_exists(conn, "musicbrainz_release_decision_tombstones")?
        && schema_table_exists(conn, "musicbrainz_overlay_sync_log")?)
}

pub(super) fn phase_thirteen_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_twelve_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_artist_release_groups")?)
}

pub(super) fn phase_twelve_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_eleven_schema_exists(conn)?
        && schema_table_exists(conn, "musicbrainz_release_status_cache")?)
}

pub(super) fn phase_eleven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_ten_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "musicbrainz_cache_path")?
        && schema_table_exists(conn, "musicbrainz_artist_links")?
        && schema_table_exists(conn, "musicbrainz_release_decisions")?)
}

pub(super) fn phase_ten_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_nine_schema_exists(conn)?
        && schema_column_exists(conn, "tracks", "billboard_single_rank")?
        && schema_column_exists(conn, "tracks", "billboard_single_year")?
        && schema_table_exists(conn, "billboard_single_chart_entries")?
        && schema_column_exists(conn, "billboard_single_chart_entries", "matched_track_id")?)
}

pub(super) fn phase_nine_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_eight_schema_exists(conn)?
        && schema_table_exists(conn, "billboard_chart_entries")?
        && schema_column_exists(conn, "billboard_chart_entries", "matched_album_id")?)
}

pub(super) fn phase_eight_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_seven_schema_exists(conn)?
        && schema_column_exists(conn, "albums", "billboard_rank")?
        && schema_column_exists(conn, "albums", "billboard_year")?)
}

pub(super) fn phase_seven_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_six_schema_exists(conn)?
        && schema_column_exists(conn, "app_settings", "left_sidebar_default")?
        && schema_column_exists(conn, "app_settings", "right_sidebar_default")?)
}

pub(super) fn phase_six_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_five_schema_exists(conn)?
        && schema_table_exists(conn, "album_covers")?
        && schema_column_exists(conn, "album_covers", "cache_path")?
        && schema_column_exists(conn, "album_covers", "mime_type")?)
}

pub(super) fn phase_five_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_four_schema_exists(conn)?
        && schema_table_exists(conn, "app_settings")?
        && schema_column_exists(conn, "app_settings", "backup_retention")?
        && schema_column_exists(conn, "app_settings", "dark_mode")?
        && schema_column_exists(conn, "app_settings", "updated_at")?)
}

pub(super) fn phase_four_schema_exists(conn: &Connection) -> Result<bool> {
    Ok(phase_three_schema_exists(conn)?
        && schema_table_exists(conn, "rating_snapshots")?
        && schema_table_exists(conn, "rating_events")?
        && schema_column_exists(conn, "import_runs", "rating_events_count")?)
}

pub(super) fn phase_three_schema_exists(conn: &Connection) -> Result<bool> {
    [
        "album_search_fts",
        "track_search_fts",
        "saved_queries",
        "saved_charts",
        "exports",
    ]
    .into_iter()
    .map(|name| schema_table_exists(conn, name))
    .try_fold(true, |all_exist, exists| {
        exists.map(|exists| all_exist && exists)
    })
}

pub(super) fn schema_table_exists(conn: &Connection, name: &str) -> Result<bool> {
    conn.query_row(
        "
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?1
        )
        ",
        params![name],
        |row| row.get::<_, bool>(0),
    )
    .with_context(|| format!("Could not inspect SQLite schema object {name}"))
}

pub(super) fn schema_index_exists(conn: &Connection, name: &str) -> Result<bool> {
    conn.query_row(
        "
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'index' AND name = ?1
        )
        ",
        params![name],
        |row| row.get::<_, bool>(0),
    )
    .with_context(|| format!("Could not inspect SQLite schema index {name}"))
}

pub(super) fn ensure_import_run_change_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("added_tracks", "INTEGER NOT NULL DEFAULT 0"),
        ("changed_tracks", "INTEGER NOT NULL DEFAULT 0"),
        ("removed_tracks", "INTEGER NOT NULL DEFAULT 0"),
        ("added_albums", "INTEGER NOT NULL DEFAULT 0"),
        ("changed_albums", "INTEGER NOT NULL DEFAULT 0"),
        ("removed_albums", "INTEGER NOT NULL DEFAULT 0"),
        ("rating_events_count", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        if !schema_column_exists(conn, "import_runs", name)? {
            let sql = format!("ALTER TABLE import_runs ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add import_runs.{name}"))?;
        }
    }

    Ok(())
}

pub(super) fn ensure_app_settings_layout_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("left_sidebar_default", "TEXT NOT NULL DEFAULT 'expanded'"),
        ("right_sidebar_default", "TEXT NOT NULL DEFAULT 'expanded'"),
    ] {
        if !schema_column_exists(conn, "app_settings", name)? {
            let sql = format!("ALTER TABLE app_settings ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add app_settings.{name}"))?;
        }
    }

    Ok(())
}

pub(super) fn ensure_app_settings_import_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        (
            "import_source_path",
            "TEXT NOT NULL DEFAULT 'musicbee-library.tsv'",
        ),
        ("cover_source_path", "TEXT NOT NULL DEFAULT 'AlbumCovers'"),
        (
            "billboard_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_ALBUMS'",
        ),
        (
            "billboard_singles_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_SINGLES'",
        ),
        (
            "vg_lista_album_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_ALBUMS_NO'",
        ),
        (
            "vg_lista_singles_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_SINGLES_NO'",
        ),
        (
            "official_uk_album_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_ALBUMS_UK'",
        ),
        (
            "official_uk_singles_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_SINGLES_UK'",
        ),
        (
            "ti_i_skuddet_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_TIISKUDDET_NO'",
        ),
        (
            "norsktoppen_source_path",
            "TEXT NOT NULL DEFAULT 'CSV_NORSKTOPPEN_NO'",
        ),
    ] {
        if !schema_column_exists(conn, "app_settings", name)? {
            let sql = format!("ALTER TABLE app_settings ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add app_settings.{name}"))?;
        }
    }

    Ok(())
}

pub(super) fn ensure_app_settings_deemix_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "deemix_download_path")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN deemix_download_path TEXT NOT NULL DEFAULT '';",
        )
        .context("Could not add app_settings.deemix_download_path")?;
    }

    if !schema_column_exists(conn, "app_settings", "deemix_download_quality")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN deemix_download_quality TEXT NOT NULL DEFAULT 'mp3_320';",
        )
        .context("Could not add app_settings.deemix_download_quality")?;
    }

    if !schema_column_exists(conn, "app_settings", "deemix_download_fallback")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN deemix_download_fallback INTEGER NOT NULL DEFAULT 1;",
        )
        .context("Could not add app_settings.deemix_download_fallback")?;
    }

    if !schema_column_exists(conn, "app_settings", "deemix_download_organization")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN deemix_download_organization TEXT NOT NULL DEFAULT 'flat_artist_album_year';",
        )
        .context("Could not add app_settings.deemix_download_organization")?;
    }

    Ok(())
}

pub(super) fn ensure_library_completion_discogs_columns(conn: &Connection) -> Result<()> {
    let verification_columns = [
        (
            "verification_provider",
            "TEXT NOT NULL DEFAULT 'musicbrainz'",
        ),
        ("musicbrainz_outcome", "TEXT"),
        ("musicbrainz_message", "TEXT"),
        ("discogs_outcome", "TEXT"),
        ("discogs_message", "TEXT"),
        ("discogs_master_id", "TEXT"),
        ("discogs_url", "TEXT"),
    ];
    for (name, definition) in verification_columns {
        if !schema_column_exists(conn, "library_completion_verifications", name)? {
            let sql = format!(
                "ALTER TABLE library_completion_verifications ADD COLUMN {name} {definition}"
            );
            conn.execute(&sql, [])
                .with_context(|| format!("Could not add Library Completion column {name}"))?;
        }
    }
    if !schema_column_exists(conn, "library_completion_verification_items", "provider")? {
        conn.execute(
            "ALTER TABLE library_completion_verification_items ADD COLUMN provider TEXT NOT NULL DEFAULT 'musicbrainz'",
            [],
        )
        .context("Could not add the Library Completion queue provider column")?;
    }
    Ok(())
}

pub(super) fn ensure_library_completion_cover_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("cover_state", "TEXT"),
        ("cover_provider", "TEXT"),
        ("cover_source_url", "TEXT"),
        ("cover_cache_path", "TEXT"),
        ("cover_mime_type", "TEXT"),
        ("cover_message", "TEXT"),
        ("cover_checked_at", "TEXT"),
    ] {
        if !schema_column_exists(conn, "library_completion_verifications", name)? {
            let sql = format!(
                "ALTER TABLE library_completion_verifications ADD COLUMN {name} {definition}"
            );
            conn.execute(&sql, [])
                .with_context(|| format!("Could not add Library Completion cover column {name}"))?;
        }
    }
    Ok(())
}

pub(super) fn ensure_library_completion_artist_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS library_completion_artist_verifications (
            artist_key TEXT PRIMARY KEY,
            outcome TEXT NOT NULL CHECK(outcome IN ('verified', 'noMatch', 'ambiguous', 'failed')),
            artist TEXT NOT NULL,
            message TEXT NOT NULL,
            musicbrainz_outcome TEXT,
            musicbrainz_message TEXT,
            musicbrainz_id TEXT,
            musicbrainz_url TEXT,
            official_album_count INTEGER NOT NULL DEFAULT 0,
            discogs_outcome TEXT,
            discogs_message TEXT,
            discogs_master_id TEXT,
            discogs_url TEXT,
            discogs_studio_album_title TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 1,
            checked_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_verifications_outcome
            ON library_completion_artist_verifications(outcome, updated_at DESC);

        CREATE TABLE IF NOT EXISTS library_completion_artist_decisions (
            artist_key TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('wanted', 'notForMe', 'needsReview')),
            artist TEXT NOT NULL,
            wish_list_item_id INTEGER REFERENCES wish_list_items(id) ON DELETE SET NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_decisions_status
            ON library_completion_artist_decisions(status, updated_at DESC);

        CREATE TABLE IF NOT EXISTS library_completion_artist_verification_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('running', 'paused', 'completed')),
            total_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_verification_batches_state
            ON library_completion_artist_verification_batches(state, updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_library_completion_artist_verification_batches_one_active
            ON library_completion_artist_verification_batches(
                (CASE WHEN state IN ('running', 'paused') THEN 1 END)
            );

        CREATE TABLE IF NOT EXISTS library_completion_artist_verification_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id INTEGER NOT NULL REFERENCES library_completion_artist_verification_batches(id)
                ON DELETE CASCADE,
            artist_key TEXT NOT NULL,
            artist TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'musicbrainz',
            state TEXT NOT NULL CHECK(state IN ('queued', 'checking', 'verified', 'noMatch', 'ambiguous', 'failed')),
            attempt_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            UNIQUE(batch_id, artist_key)
        );
        CREATE INDEX IF NOT EXISTS idx_library_completion_artist_verification_items_batch_state
            ON library_completion_artist_verification_items(batch_id, state, id);
        ",
    )
    .context("Could not create the Library Completion artist discovery schema")?;
    Ok(())
}

pub(super) fn ensure_library_updates_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS library_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL,
            change_kind TEXT NOT NULL
                CHECK (change_kind IN ('new', 'changed', 'removed')),
            category TEXT NOT NULL,
            album_id TEXT NOT NULL,
            album_artist_display TEXT,
            album TEXT,
            year INTEGER,
            field TEXT,
            field_label TEXT,
            previous_value TEXT,
            current_value TEXT,
            change_count INTEGER,
            description TEXT NOT NULL,
            source_kind TEXT NOT NULL,
            source_label TEXT NOT NULL,
            source_path TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_library_updates_created_at
            ON library_updates(created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_library_updates_kind_created_at
            ON library_updates(change_kind, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_library_updates_album
            ON library_updates(album_id, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_library_updates_import_run
            ON library_updates(import_run_id, id);
        ",
    )
    .context("Could not create the durable library update history schema")?;
    Ok(())
}

pub(super) fn ensure_artist_images_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS artist_images (
            artist_key TEXT PRIMARY KEY,
            artist_name TEXT NOT NULL,
            source TEXT NOT NULL,
            source_url TEXT,
            cache_path TEXT,
            mime_type TEXT,
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable', 'failed')),
            message TEXT NOT NULL DEFAULT '',
            fetched_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_artist_images_state_fetched_at
            ON artist_images(state, fetched_at DESC);
        ",
    )
    .context("Could not create the artist portrait cache schema")?;
    Ok(())
}

pub(super) fn ensure_lastfm_popularity_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS lastfm_artist_popularity (
            artist_key TEXT PRIMARY KEY,
            artist_name TEXT NOT NULL,
            musicbrainz_mbid TEXT,
            source_url TEXT,
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable')),
            message TEXT NOT NULL DEFAULT '',
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lastfm_track_popularity (
            artist_key TEXT NOT NULL,
            track_key TEXT NOT NULL,
            artist_name TEXT NOT NULL,
            track_name TEXT NOT NULL,
            musicbrainz_recording_mbid TEXT,
            listeners INTEGER,
            play_count INTEGER,
            artist_rank INTEGER,
            source_url TEXT,
            fetch_method TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable')),
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (artist_key, track_key)
        );

        CREATE INDEX IF NOT EXISTS idx_lastfm_track_popularity_artist_rank
            ON lastfm_track_popularity(artist_key, artist_rank);
        CREATE INDEX IF NOT EXISTS idx_lastfm_track_popularity_expires
            ON lastfm_track_popularity(expires_at);
        ",
    )
    .context("Could not create the Last.fm popularity cache schema")?;
    Ok(())
}

pub(super) fn ensure_lastfm_similarity_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS lastfm_artist_similarity (
            artist_key TEXT PRIMARY KEY,
            artist_name TEXT NOT NULL,
            musicbrainz_mbid TEXT,
            source_url TEXT,
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable')),
            message TEXT NOT NULL DEFAULT '',
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lastfm_similar_artists (
            artist_key TEXT NOT NULL,
            rank INTEGER NOT NULL,
            similar_artist_name TEXT NOT NULL,
            similar_artist_mbid TEXT,
            match_score REAL NOT NULL,
            source_url TEXT,
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (artist_key, rank),
            FOREIGN KEY (artist_key) REFERENCES lastfm_artist_similarity(artist_key)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_lastfm_similar_artists_artist_rank
            ON lastfm_similar_artists(artist_key, rank);
        CREATE INDEX IF NOT EXISTS idx_lastfm_similar_artists_target_mbid
            ON lastfm_similar_artists(similar_artist_mbid);
        CREATE INDEX IF NOT EXISTS idx_lastfm_similar_artists_expires
            ON lastfm_similar_artists(expires_at);
        ",
    )
    .context("Could not create the Last.fm similar-artist cache schema")?;
    Ok(())
}

pub(super) fn ensure_lastfm_related_albums_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS lastfm_album_relationships (
            album_id TEXT PRIMARY KEY,
            album_artist TEXT NOT NULL,
            album_title TEXT NOT NULL,
            source_url TEXT,
            source_tags_json TEXT NOT NULL DEFAULT '[]',
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable')),
            message TEXT NOT NULL DEFAULT '',
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lastfm_related_albums (
            album_id TEXT NOT NULL,
            rank INTEGER NOT NULL,
            candidate_artist_name TEXT NOT NULL,
            candidate_artist_mbid TEXT,
            candidate_album_title TEXT NOT NULL,
            candidate_album_mbid TEXT,
            source_url TEXT,
            relationship_score REAL NOT NULL,
            shared_tags_json TEXT NOT NULL DEFAULT '[]',
            artist_similarity REAL,
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (album_id, rank),
            FOREIGN KEY (album_id) REFERENCES lastfm_album_relationships(album_id)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_lastfm_related_albums_album_rank
            ON lastfm_related_albums(album_id, rank);
        CREATE INDEX IF NOT EXISTS idx_lastfm_related_albums_candidate_mbid
            ON lastfm_related_albums(candidate_album_mbid);
        CREATE INDEX IF NOT EXISTS idx_lastfm_related_albums_expires
            ON lastfm_related_albums(expires_at);
        ",
    )
    .context("Could not create the Last.fm related-album cache schema")?;
    Ok(())
}

pub(super) fn ensure_artist_biography_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS artist_biographies (
            artist_key TEXT PRIMARY KEY,
            artist_name TEXT NOT NULL,
            musicbrainz_mbid TEXT,
            wikidata_id TEXT,
            wikipedia_language TEXT,
            wikipedia_title TEXT,
            biography_text TEXT,
            source_url TEXT,
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable')),
            message TEXT NOT NULL DEFAULT '',
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_artist_biographies_expires
            ON artist_biographies(expires_at);
        ",
    )
    .context("Could not create the artist biography cache schema")?;
    Ok(())
}

pub(super) fn ensure_album_review_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS album_reviews (
            album_id TEXT PRIMARY KEY,
            album_artist TEXT NOT NULL,
            album_title TEXT NOT NULL,
            album_year INTEGER,
            artist_mbid TEXT,
            release_group_mbid TEXT,
            review_id TEXT,
            review_text TEXT,
            reviewer_name TEXT,
            rating INTEGER,
            language TEXT,
            review_source TEXT,
            source_url TEXT,
            license_id TEXT,
            license_name TEXT,
            license_url TEXT,
            state TEXT NOT NULL CHECK(state IN ('available', 'unavailable')),
            message TEXT NOT NULL DEFAULT '',
            fetched_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_album_reviews_expires
            ON album_reviews(expires_at);
        ",
    )
    .context("Could not create the album review cache schema")?;
    Ok(())
}

pub(super) fn ensure_daily_edition_snapshot_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS daily_edition_snapshots (
            edition_date TEXT PRIMARY KEY,
            payload_version INTEGER NOT NULL,
            edition_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_daily_edition_snapshots_created
            ON daily_edition_snapshots(created_at DESC);
        ",
    )
    .context("Could not create the Daily Edition snapshot schema")?;
    Ok(())
}

pub(super) fn ensure_chart_album_match_state_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS chart_album_match_state (
            source TEXT PRIMARY KEY,
            reconciled_import_run_id INTEGER,
            reconciled_at TEXT NOT NULL
        );
        ",
    )
    .context("Could not create chart album match state schema")?;
    Ok(())
}

pub(super) fn ensure_album_artist_key_index(conn: &Connection) -> Result<()> {
    let artist_key = artist_key_sql("album_artist_display");
    conn.execute_batch(&format!(
        "CREATE INDEX IF NOT EXISTS idx_albums_artist_key ON albums({artist_key});"
    ))
    .context("Could not create the normalized album artist index")?;
    Ok(())
}

pub(super) fn ensure_app_settings_musicbrainz_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "musicbrainz_cache_path")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN musicbrainz_cache_path TEXT NOT NULL DEFAULT 'MusicBrainz/musicbrainz_cache.db';",
        )
        .context("Could not add app_settings.musicbrainz_cache_path")?;
    }

    Ok(())
}

pub(super) fn ensure_app_settings_musicbrainz_sync_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "musicbrainz_overlay_sync_path")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN musicbrainz_overlay_sync_path TEXT NOT NULL DEFAULT '';",
        )
        .context("Could not add app_settings.musicbrainz_overlay_sync_path")?;
    }

    if !schema_column_exists(
        conn,
        "app_settings",
        "musicbrainz_overlay_auto_sync_minutes",
    )? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN musicbrainz_overlay_auto_sync_minutes INTEGER NOT NULL DEFAULT 0;",
        )
        .context("Could not add app_settings.musicbrainz_overlay_auto_sync_minutes")?;
    }

    Ok(())
}

pub(super) fn ensure_app_settings_update_columns(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "update_auto_check_minutes")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN update_auto_check_minutes INTEGER NOT NULL DEFAULT 0;",
        )
        .context("Could not add app_settings.update_auto_check_minutes")?;
    }

    Ok(())
}

pub(super) fn ensure_app_settings_country_flag_display_column(conn: &Connection) -> Result<()> {
    if !schema_column_exists(conn, "app_settings", "country_flag_display")? {
        conn.execute_batch(
            "ALTER TABLE app_settings ADD COLUMN country_flag_display TEXT NOT NULL DEFAULT 'flagAndName';",
        )
        .context("Could not add app_settings.country_flag_display")?;
    }

    Ok(())
}

pub(super) fn ensure_musicbrainz_decision_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_links (
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

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decisions (
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

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_links_mbid
            ON musicbrainz_artist_links(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_decisions_decision
            ON musicbrainz_release_decisions(decision);
        ",
    )
    .context("Could not create MusicBrainz decision tables")?;

    Ok(())
}

pub(super) fn ensure_musicbrainz_tombstone_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_link_tombstones (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_release_decision_tombstones (
            local_artist_key TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_artist_key, release_mbid)
        );
        ",
    )
    .context("Could not create MusicBrainz sync tombstone tables")?;

    Ok(())
}

pub(super) fn ensure_musicbrainz_overlay_sync_log(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_overlay_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL,
            sync_path TEXT NOT NULL,
            imported_count INTEGER NOT NULL DEFAULT 0,
            exported_count INTEGER NOT NULL DEFAULT 0,
            changed_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT NOT NULL,
            artist_links_imported INTEGER NOT NULL DEFAULT 0,
            artist_links_exported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_imported INTEGER NOT NULL DEFAULT 0,
            artist_unlinks_exported INTEGER NOT NULL DEFAULT 0,
            release_decisions_imported INTEGER NOT NULL DEFAULT 0,
            release_decisions_exported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_imported INTEGER NOT NULL DEFAULT 0,
            release_decision_clears_exported INTEGER NOT NULL DEFAULT 0,
            release_statuses_imported INTEGER NOT NULL DEFAULT 0,
            release_statuses_exported INTEGER NOT NULL DEFAULT 0,
            release_groups_imported INTEGER NOT NULL DEFAULT 0,
            release_groups_exported INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_overlay_sync_log_synced
            ON musicbrainz_overlay_sync_log(synced_at);
        ",
    )
    .context("Could not create MusicBrainz overlay sync log")?;

    Ok(())
}

pub(super) fn ensure_musicbrainz_release_status_cache(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_release_status_cache (
            artist_mbid TEXT NOT NULL,
            release_mbid TEXT NOT NULL,
            has_official_release INTEGER NOT NULL,
            checked_at TEXT NOT NULL,
            PRIMARY KEY (artist_mbid, release_mbid)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_release_status_cache_checked
            ON musicbrainz_release_status_cache(checked_at);
        ",
    )
    .context("Could not create MusicBrainz release status cache")?;

    Ok(())
}

pub(super) fn ensure_musicbrainz_artist_release_groups(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_release_groups (
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

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_artist
            ON musicbrainz_artist_release_groups(artist_mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_release_groups_fetched
            ON musicbrainz_artist_release_groups(fetched_at);
        ",
    )
    .context("Could not create MusicBrainz artist release-group overlay")?;

    Ok(())
}

pub fn ensure_musicbrainz_origin_country_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_origin_countries (
            country_code TEXT PRIMARY KEY,
            country_name TEXT NOT NULL,
            area_mbid TEXT,
            iso_source TEXT NOT NULL DEFAULT 'musicbrainz',
            is_historical INTEGER NOT NULL DEFAULT 0,
            is_special INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_countries (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            country_code TEXT,
            country_name TEXT,
            raw_area_mbid TEXT,
            raw_area_name TEXT,
            raw_area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            derived_from TEXT NOT NULL DEFAULT 'unresolved',
            confidence REAL,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(country_code) REFERENCES musicbrainz_origin_countries(country_code)
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_local_artist
            ON musicbrainz_artist_origin_countries(local_artist_key);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_country
            ON musicbrainz_artist_origin_countries(country_code);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_mbid
            ON musicbrainz_artist_origin_countries(mbid);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_origin_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_origin_import_runs_started
            ON musicbrainz_artist_origin_import_runs(started_at);
        ",
    )
    .context("Could not create MusicBrainz artist origin-country tables")?;

    Ok(())
}

pub fn ensure_musicbrainz_map_location_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_map_locations (
            location_key TEXT PRIMARY KEY,
            area_mbid TEXT,
            country_code TEXT,
            label TEXT NOT NULL,
            latitude REAL,
            longitude REAL,
            precision TEXT NOT NULL,
            resolution_status TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'wikidata',
            wikidata_id TEXT,
            fetched_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_map_locations_area
            ON musicbrainz_map_locations(area_mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_map_locations_country
            ON musicbrainz_map_locations(country_code);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_map_locations_status
            ON musicbrainz_map_locations(resolution_status, precision);
        ",
    )
    .context("Could not create MusicBrainz map location cache")?;

    Ok(())
}

pub fn ensure_musicbrainz_artist_info_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS musicbrainz_artist_infos (
            local_artist_key TEXT PRIMARY KEY,
            display_artist TEXT NOT NULL,
            mbid TEXT NOT NULL,
            sort_name TEXT,
            artist_type TEXT,
            gender TEXT,
            life_begin_date TEXT,
            life_begin_year INTEGER,
            life_end_date TEXT,
            life_end_year INTEGER,
            life_ended INTEGER,
            area_mbid TEXT,
            area_name TEXT,
            area_type TEXT,
            begin_area_mbid TEXT,
            begin_area_name TEXT,
            begin_area_type TEXT,
            end_area_mbid TEXT,
            end_area_name TEXT,
            end_area_type TEXT,
            review_state TEXT NOT NULL DEFAULT 'unresolved',
            source TEXT NOT NULL DEFAULT 'musicbrainz-live',
            fetched_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_mbid
            ON musicbrainz_artist_infos(mbid);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_type
            ON musicbrainz_artist_infos(artist_type);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_gender
            ON musicbrainz_artist_infos(gender);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_begin_year
            ON musicbrainz_artist_infos(life_begin_year);
        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_infos_end_year
            ON musicbrainz_artist_infos(life_end_year);

        CREATE TABLE IF NOT EXISTS musicbrainz_artist_info_import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'eligible',
            status TEXT NOT NULL,
            total_artists INTEGER NOT NULL DEFAULT 0,
            eligible_count INTEGER NOT NULL DEFAULT 0,
            fetched_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            unresolved_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            last_processed_artist_key TEXT,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            error_summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_musicbrainz_artist_info_import_runs_started
            ON musicbrainz_artist_info_import_runs(started_at);
        ",
    )
    .context("Could not create MusicBrainz artist-info tables")?;

    Ok(())
}

pub(super) fn ensure_album_billboard_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("billboard_rank", "INTEGER"),
        ("billboard_year", "INTEGER"),
        ("billboard_debut_year", "INTEGER"),
        ("billboard_debut_month", "INTEGER"),
        ("billboard_debut_week", "INTEGER"),
        ("billboard_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "albums", name)? {
            let sql = format!("ALTER TABLE albums ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add albums.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_albums_billboard_rank ON albums(billboard_rank);
        CREATE INDEX IF NOT EXISTS idx_albums_billboard_debut_week
            ON albums(billboard_debut_week_key);
        ",
    )
    .context("Could not create Billboard rank index")?;

    Ok(())
}

pub(super) fn ensure_billboard_chart_entries_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS billboard_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            album TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            album_key TEXT NOT NULL,
            first_appearance TEXT,
            first_appearance_year INTEGER,
            first_appearance_month INTEGER,
            first_appearance_week INTEGER,
            first_appearance_week_key TEXT,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_match
            ON billboard_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_chart_entries_year_rank
            ON billboard_chart_entries(year, rank);
        ",
    )
    .context("Could not create Billboard chart entry table")?;

    for (name, definition) in [
        ("first_appearance", "TEXT"),
        ("first_appearance_year", "INTEGER"),
        ("first_appearance_month", "INTEGER"),
        ("first_appearance_week", "INTEGER"),
        ("first_appearance_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "billboard_chart_entries", name)? {
            let sql = format!("ALTER TABLE billboard_chart_entries ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add billboard_chart_entries.{name}"))?;
        }
    }

    Ok(())
}

pub(super) fn ensure_track_billboard_single_columns(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("billboard_single_rank", "INTEGER"),
        ("billboard_single_year", "INTEGER"),
        ("billboard_single_debut_date", "TEXT"),
        ("billboard_single_debut_year", "INTEGER"),
        ("billboard_single_debut_month", "INTEGER"),
        ("billboard_single_debut_week", "INTEGER"),
        ("billboard_single_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "tracks", name)? {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add tracks.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_tracks_billboard_single_rank
            ON tracks(billboard_single_rank);
        CREATE INDEX IF NOT EXISTS idx_tracks_billboard_single_debut_date
            ON tracks(billboard_single_debut_date);
        CREATE INDEX IF NOT EXISTS idx_tracks_billboard_single_debut_week
            ON tracks(billboard_single_debut_week_key);
        ",
    )
    .context("Could not create Billboard singles rank index")?;

    Ok(())
}

pub(super) fn ensure_billboard_single_chart_entries_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS billboard_single_chart_entries (
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
            album TEXT,
            album_key TEXT,
            date_entered_raw TEXT,
            date_entered TEXT,
            date_entered_year INTEGER,
            date_entered_month INTEGER,
            date_entered_week INTEGER,
            date_entered_week_key TEXT,
            date_entered_quality TEXT NOT NULL DEFAULT 'missing',
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_match
            ON billboard_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_year_rank
            ON billboard_single_chart_entries(year, rank);
        ",
    )
    .context("Could not create Billboard singles chart entry table")?;

    for (name, definition) in [
        ("album", "TEXT"),
        ("album_key", "TEXT"),
        ("date_entered_raw", "TEXT"),
        ("date_entered", "TEXT"),
        ("date_entered_year", "INTEGER"),
        ("date_entered_month", "INTEGER"),
        ("date_entered_week", "INTEGER"),
        ("date_entered_week_key", "TEXT"),
        ("date_entered_quality", "TEXT NOT NULL DEFAULT 'missing'"),
    ] {
        if !schema_column_exists(conn, "billboard_single_chart_entries", name)? {
            let sql = format!(
                "ALTER TABLE billboard_single_chart_entries ADD COLUMN {name} {definition}"
            );
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add billboard_single_chart_entries.{name}"))?;
        }
    }

    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_billboard_single_chart_entries_date
             ON billboard_single_chart_entries(date_entered);",
    )
    .context("Could not create Billboard singles date index")?;

    Ok(())
}

pub(super) fn ensure_vg_lista_schema(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("vg_lista_rank", "INTEGER"),
        ("vg_lista_year", "INTEGER"),
        ("vg_lista_debut_year", "INTEGER"),
        ("vg_lista_debut_month", "INTEGER"),
        ("vg_lista_debut_week", "INTEGER"),
        ("vg_lista_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "albums", name)? {
            let sql = format!("ALTER TABLE albums ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add albums.{name}"))?;
        }
    }

    for (name, definition) in [
        ("vg_lista_rank", "INTEGER"),
        ("vg_lista_year", "INTEGER"),
        ("vg_lista_debut_date", "TEXT"),
        ("vg_lista_debut_year", "INTEGER"),
        ("vg_lista_debut_month", "INTEGER"),
        ("vg_lista_debut_week", "INTEGER"),
        ("vg_lista_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "tracks", name)? {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add tracks.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS vg_lista_album_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            week_date TEXT NOT NULL,
            week_key TEXT NOT NULL,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vg_lista_single_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            rank INTEGER NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            week_date TEXT NOT NULL,
            week_key TEXT NOT NULL,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_albums_vg_lista_rank ON albums(vg_lista_rank);
        CREATE INDEX IF NOT EXISTS idx_albums_vg_lista_debut_week
            ON albums(vg_lista_debut_week_key);
        CREATE INDEX IF NOT EXISTS idx_tracks_vg_lista_rank ON tracks(vg_lista_rank);
        CREATE INDEX IF NOT EXISTS idx_tracks_vg_lista_debut_week
            ON tracks(vg_lista_debut_week_key);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_album_chart_entries_match
            ON vg_lista_album_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_album_chart_entries_week_rank
            ON vg_lista_album_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_single_chart_entries_match
            ON vg_lista_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_vg_lista_single_chart_entries_week_rank
            ON vg_lista_single_chart_entries(year, week, rank);
        ",
    )
    .context("Could not create VG Lista chart schema")?;

    Ok(())
}

pub(super) fn ensure_official_uk_schema(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("official_uk_rank", "INTEGER"),
        ("official_uk_year", "INTEGER"),
        ("official_uk_debut_year", "INTEGER"),
        ("official_uk_debut_month", "INTEGER"),
        ("official_uk_debut_week", "INTEGER"),
        ("official_uk_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "albums", name)? {
            let sql = format!("ALTER TABLE albums ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add albums.{name}"))?;
        }
    }

    for (name, definition) in [
        ("official_uk_rank", "INTEGER"),
        ("official_uk_year", "INTEGER"),
        ("official_uk_debut_date", "TEXT"),
        ("official_uk_debut_year", "INTEGER"),
        ("official_uk_debut_month", "INTEGER"),
        ("official_uk_debut_week", "INTEGER"),
        ("official_uk_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "tracks", name)? {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add tracks.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS official_uk_album_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            chart_end_date TEXT,
            rank INTEGER NOT NULL,
            last_week TEXT,
            movement TEXT,
            peak TEXT,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            weeks_on_chart TEXT,
            source_url TEXT,
            item_url TEXT,
            week_key TEXT NOT NULL,
            matched_album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS official_uk_single_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            chart_end_date TEXT,
            rank INTEGER NOT NULL,
            last_week TEXT,
            movement TEXT,
            peak TEXT,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            weeks_on_chart TEXT,
            source_url TEXT,
            item_url TEXT,
            week_key TEXT NOT NULL,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_albums_official_uk_rank
            ON albums(official_uk_rank);
        CREATE INDEX IF NOT EXISTS idx_albums_official_uk_debut_week
            ON albums(official_uk_debut_week_key);
        CREATE INDEX IF NOT EXISTS idx_tracks_official_uk_rank
            ON tracks(official_uk_rank);
        CREATE INDEX IF NOT EXISTS idx_tracks_official_uk_debut_week
            ON tracks(official_uk_debut_week_key);
        CREATE INDEX IF NOT EXISTS idx_official_uk_album_chart_entries_match
            ON official_uk_album_chart_entries(matched_album_id);
        CREATE INDEX IF NOT EXISTS idx_official_uk_album_chart_entries_week_rank
            ON official_uk_album_chart_entries(year, week, rank);
        CREATE INDEX IF NOT EXISTS idx_official_uk_single_chart_entries_match
            ON official_uk_single_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_official_uk_single_chart_entries_week_rank
            ON official_uk_single_chart_entries(year, week, rank);
        ",
    )
    .context("Could not create Official UK chart schema")?;

    Ok(())
}

pub(super) fn ensure_ti_i_skuddet_schema(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("ti_i_skuddet_rank", "INTEGER"),
        ("ti_i_skuddet_year", "INTEGER"),
        ("ti_i_skuddet_debut_date", "TEXT"),
        ("ti_i_skuddet_debut_year", "INTEGER"),
        ("ti_i_skuddet_debut_month", "INTEGER"),
        ("ti_i_skuddet_debut_week", "INTEGER"),
        ("ti_i_skuddet_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "tracks", name)? {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add tracks.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS ti_i_skuddet_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            rank INTEGER NOT NULL,
            rank_raw TEXT NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            score_votes TEXT,
            note TEXT,
            chart_details TEXT,
            source_url TEXT,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_ti_i_skuddet_rank
            ON tracks(ti_i_skuddet_rank);
        CREATE INDEX IF NOT EXISTS idx_tracks_ti_i_skuddet_debut_week
            ON tracks(ti_i_skuddet_debut_week_key);
        CREATE INDEX IF NOT EXISTS idx_ti_i_skuddet_chart_entries_match
            ON ti_i_skuddet_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_ti_i_skuddet_chart_entries_week_rank
            ON ti_i_skuddet_chart_entries(year, week, rank);
        ",
    )
    .context("Could not create Ti i Skuddet chart schema")?;

    Ok(())
}

pub(super) fn ensure_norsktoppen_schema(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        ("norsktoppen_rank", "INTEGER"),
        ("norsktoppen_year", "INTEGER"),
        ("norsktoppen_debut_date", "TEXT"),
        ("norsktoppen_debut_year", "INTEGER"),
        ("norsktoppen_debut_month", "INTEGER"),
        ("norsktoppen_debut_week", "INTEGER"),
        ("norsktoppen_debut_week_key", "TEXT"),
    ] {
        if !schema_column_exists(conn, "tracks", name)? {
            let sql = format!("ALTER TABLE tracks ADD COLUMN {name} {definition}");
            conn.execute_batch(&sql)
                .with_context(|| format!("Could not add tracks.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS norsktoppen_chart_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_file TEXT NOT NULL,
            year INTEGER NOT NULL,
            week INTEGER NOT NULL,
            chart_date TEXT NOT NULL,
            rank INTEGER NOT NULL,
            rank_raw TEXT NOT NULL,
            artist TEXT NOT NULL,
            title TEXT NOT NULL,
            artist_key TEXT NOT NULL,
            title_key TEXT NOT NULL,
            points TEXT,
            note TEXT,
            chart_details TEXT,
            source_url TEXT,
            matched_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_norsktoppen_rank
            ON tracks(norsktoppen_rank);
        CREATE INDEX IF NOT EXISTS idx_tracks_norsktoppen_debut_week
            ON tracks(norsktoppen_debut_week_key);
        CREATE INDEX IF NOT EXISTS idx_norsktoppen_chart_entries_match
            ON norsktoppen_chart_entries(matched_track_id);
        CREATE INDEX IF NOT EXISTS idx_norsktoppen_chart_entries_week_rank
            ON norsktoppen_chart_entries(year, week, rank);
        ",
    )
    .context("Could not create Norsktoppen chart schema")?;

    Ok(())
}

pub(super) fn ensure_music_doctor_schema(conn: &Connection) -> Result<()> {
    for (name, definition) in [
        (
            "music_doctor_database_path",
            "TEXT NOT NULL DEFAULT '%APPDATA%\\com.musicdoctor.desktop\\music-doctor.db'",
        ),
        ("music_doctor_auto_sync", "INTEGER NOT NULL DEFAULT 1"),
    ] {
        if !schema_column_exists(conn, "app_settings", name)? {
            conn.execute(
                &format!("ALTER TABLE app_settings ADD COLUMN {name} {definition}"),
                [],
            )
            .with_context(|| format!("Could not add app_settings.{name}"))?;
        }
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS music_doctor_sync_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            database_path TEXT NOT NULL,
            database_size_bytes INTEGER NOT NULL DEFAULT 0,
            database_modified_ns INTEGER,
            external_schema_version INTEGER NOT NULL,
            external_scan_id INTEGER NOT NULL,
            external_scan_completed_at TEXT,
            local_import_run_id INTEGER,
            source_count INTEGER NOT NULL DEFAULT 0,
            total_files INTEGER NOT NULL DEFAULT 0,
            audio_files INTEGER NOT NULL DEFAULT 0,
            audio_albums INTEGER NOT NULL DEFAULT 0,
            matched_tracks INTEGER NOT NULL DEFAULT 0,
            unmatched_library_tracks INTEGER NOT NULL DEFAULT 0,
            unmatched_doctor_audio INTEGER NOT NULL DEFAULT 0,
            file_issue_count INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_music_doctor_sync_runs_completed
            ON music_doctor_sync_runs(completed_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS music_doctor_track_quality (
            file_key TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            filename TEXT NOT NULL,
            album_id TEXT NOT NULL,
            source_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            extension TEXT NOT NULL,
            format TEXT NOT NULL,
            file_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            modified_ns INTEGER NOT NULL,
            bitrate_kbps INTEGER,
            duration_ms INTEGER,
            properties_checked_ns INTEGER,
            scan_error TEXT,
            missing INTEGER NOT NULL DEFAULT 0,
            doctor_updated_at TEXT NOT NULL,
            sync_run_id INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_music_doctor_track_file
            ON music_doctor_track_quality(file_path, filename);
        CREATE INDEX IF NOT EXISTS idx_music_doctor_track_album
            ON music_doctor_track_quality(album_id);
        CREATE INDEX IF NOT EXISTS idx_music_doctor_track_bitrate
            ON music_doctor_track_quality(bitrate_kbps);

        CREATE TABLE IF NOT EXISTS music_doctor_album_quality (
            album_id TEXT PRIMARY KEY,
            matched_tracks INTEGER NOT NULL,
            total_size_bytes INTEGER NOT NULL,
            min_bitrate_kbps INTEGER,
            avg_bitrate_kbps REAL,
            max_bitrate_kbps INTEGER,
            below_128_tracks INTEGER NOT NULL,
            below_192_tracks INTEGER NOT NULL,
            below_320_tracks INTEGER NOT NULL,
            at_least_320_tracks INTEGER NOT NULL,
            mixed_quality INTEGER NOT NULL,
            formats TEXT NOT NULL,
            sync_run_id INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE INDEX IF NOT EXISTS idx_music_doctor_album_min_bitrate
            ON music_doctor_album_quality(min_bitrate_kbps);
        CREATE INDEX IF NOT EXISTS idx_music_doctor_album_mixed_quality
            ON music_doctor_album_quality(mixed_quality);

        CREATE TABLE IF NOT EXISTS music_doctor_unmatched_files (
            file_key TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            album_folder TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            album_year INTEGER,
            extension TEXT NOT NULL,
            format TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            bitrate_kbps INTEGER,
            duration_ms INTEGER,
            doctor_updated_at TEXT NOT NULL,
            sync_run_id INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS music_doctor_file_issues (
            file_key TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            album_folder TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            album_year INTEGER,
            format TEXT NOT NULL,
            file_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            scan_error TEXT,
            missing INTEGER NOT NULL,
            issue_kind TEXT NOT NULL,
            sync_run_id INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS music_doctor_format_stats (
            format TEXT PRIMARY KEY,
            file_count INTEGER NOT NULL,
            total_bytes INTEGER NOT NULL,
            sync_run_id INTEGER NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS music_doctor_bitrate_stats (
            band TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            file_count INTEGER NOT NULL,
            total_bytes INTEGER NOT NULL,
            sync_run_id INTEGER NOT NULL
        ) WITHOUT ROWID;
        ",
    )
    .context("Could not create Music Doctor cache schema")?;

    Ok(())
}

pub(super) fn schema_column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn
        .prepare(&sql)
        .with_context(|| format!("Could not inspect SQLite table {table}"))?;
    let mut rows = stmt.query([])?;

    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }

    Ok(false)
}
