use super::*;

pub(super) fn playlist_value_key(value: Option<&str>, fallback: &str) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_lowercase()
}

pub(super) fn playlist_row_keys(row: &BrowseRow) -> (String, String, String) {
    let artist = playlist_value_key(
        row.display_artist
            .as_deref()
            .or(row.album_artist_display.as_deref()),
        "unknown artist",
    );
    let album = playlist_value_key(row.album.as_deref(), &row.album_id);
    let genre = playlist_value_key(row.canonical_genre.as_deref(), "unknown genre");
    (artist, album, genre)
}

pub(super) fn playlist_target_reached(
    plan: &AiPlaylistPlan,
    track_count: usize,
    total_seconds: i64,
) -> bool {
    (plan.target_track_count > 0 && track_count >= plan.target_track_count as usize)
        || (plan.target_minutes > 0
            && total_seconds >= i64::from(plan.target_minutes).saturating_mul(60))
}

pub(super) fn select_playlist_rows(rows: Vec<BrowseRow>, plan: &AiPlaylistPlan) -> Vec<BrowseRow> {
    let mut genre_pool_counts = HashMap::<String, usize>::new();
    for row in &rows {
        let (_, _, genre) = playlist_row_keys(row);
        *genre_pool_counts.entry(genre).or_default() += 1;
    }

    let mut used = vec![false; rows.len()];
    let mut artist_counts = HashMap::<String, usize>::new();
    let mut album_counts = HashMap::<String, usize>::new();
    let mut genre_counts = HashMap::<String, usize>::new();
    let mut selected = Vec::new();
    let mut total_seconds = 0_i64;

    while selected.len() < 200 && !playlist_target_reached(plan, selected.len(), total_seconds) {
        let mut best: Option<(usize, Vec<usize>)> = None;
        for (index, row) in rows.iter().enumerate() {
            if used[index] || row.track_id.is_none() {
                continue;
            }
            let (artist, album, genre) = playlist_row_keys(row);
            let artist_count = *artist_counts.get(&artist).unwrap_or(&0);
            let album_count = *album_counts.get(&album).unwrap_or(&0);
            if artist_count >= plan.max_tracks_per_artist as usize
                || album_count >= plan.max_tracks_per_album as usize
            {
                continue;
            }
            let genre_count = *genre_counts.get(&genre).unwrap_or(&0);
            let genre_pool_count = *genre_pool_counts.get(&genre).unwrap_or(&0);
            let priority = match plan.strategy.as_str() {
                "variety" => vec![genre_count, artist_count, album_count, index],
                "discovery" => vec![
                    genre_count,
                    genre_pool_count,
                    artist_count,
                    album_count,
                    index,
                ],
                _ => vec![index],
            };
            if best
                .as_ref()
                .is_none_or(|(_, current_priority)| priority < *current_priority)
            {
                best = Some((index, priority));
            }
        }

        let Some((index, _)) = best else {
            break;
        };
        used[index] = true;
        let row = rows[index].clone();
        let (artist, album, genre) = playlist_row_keys(&row);
        *artist_counts.entry(artist).or_default() += 1;
        *album_counts.entry(album).or_default() += 1;
        *genre_counts.entry(genre).or_default() += 1;
        total_seconds = total_seconds.saturating_add(row.track_seconds.unwrap_or(0).max(0));
        selected.push(row);
    }
    selected
}

pub(super) fn playlist_track_from_row(row: BrowseRow) -> Result<AiPlaylistTrack> {
    Ok(AiPlaylistTrack {
        track_id: row
            .track_id
            .context("The local playlist candidate has no track ID")?,
        album_id: row.album_id,
        album: row.album,
        album_artist: row.album_artist_display,
        display_artist: row.display_artist,
        title: row.title,
        genre: row.canonical_genre,
        year: row.year,
        seconds: row.track_seconds.unwrap_or(0).max(0),
        rating: row.normalized_rating,
        loved: row.love.as_deref() == Some("L"),
        file_path: row.file_path,
        filename: row.filename,
    })
}

pub(super) fn build_playlist(conn: &Connection, plan: AiPlaylistPlan) -> Result<AiPlaylist> {
    let mut request = plan.request.clone();
    request.view = "tracks".to_string();
    request.offset = 0;
    request.limit = request.limit.clamp(20, 500);
    let response = search_library(conn, request.clone(), 500)?;
    let candidate_count = response.rows.len();
    let selected_rows = select_playlist_rows(response.rows, &plan);
    let tracks = selected_rows
        .into_iter()
        .map(playlist_track_from_row)
        .collect::<Result<Vec<_>>>()?;
    let total_seconds = tracks.iter().map(|track| track.seconds.max(0)).sum::<i64>();

    Ok(AiPlaylist {
        smart_settings: None,
        mixtape: None,
        prompt: plan.prompt,
        name: plan.name,
        description: plan.description,
        request,
        strategy: plan.strategy,
        target_track_count: plan.target_track_count,
        target_minutes: plan.target_minutes,
        max_tracks_per_artist: plan.max_tracks_per_artist,
        max_tracks_per_album: plan.max_tracks_per_album,
        matching_track_count: response.total,
        candidate_count,
        total_seconds,
        tracks,
        model: plan.model,
        usage: plan.usage,
    })
}

pub(super) fn normalize_playlist(mut playlist: AiPlaylist) -> Result<AiPlaylist> {
    crate::jev::validate_playlist(&playlist)?;
    if let Some(settings) = &playlist.smart_settings {
        validate_smart_settings(settings)?;
    }
    if playlist.prompt.trim().is_empty() || playlist.prompt.chars().count() > 2_000 {
        bail!("A saved playlist requires its original prompt")
    }
    if playlist.name.trim().is_empty() || playlist.name.chars().count() > 120 {
        bail!("Playlist titles must contain 1 to 120 characters")
    }
    if playlist.description.trim().is_empty() || playlist.description.chars().count() > 500 {
        bail!("Playlist descriptions must contain 1 to 500 characters")
    }
    if (playlist.request.view != "tracks"
        && !(playlist.request.view == "albums" && playlist.smart_settings.is_some()))
        || !matches!(
            playlist.strategy.as_str(),
            "ranked" | "variety" | "discovery" | "random"
        )
        || playlist.target_minutes > 1_440
        || (playlist.target_track_count == 0 && playlist.target_minutes == 0)
        || !(1..=10).contains(&playlist.max_tracks_per_artist)
        || !(1..=10).contains(&playlist.max_tracks_per_album)
    {
        bail!("The playlist recipe is outside the supported local limits")
    }
    if playlist
        .tracks
        .iter()
        .any(|track| track.track_id <= 0 || track.album_id.trim().is_empty())
    {
        bail!("The playlist contains an invalid local track reference")
    }
    playlist.name = playlist.name.trim().to_string();
    playlist.description = playlist.description.trim().to_string();
    playlist.prompt = playlist.prompt.trim().to_string();
    playlist.total_seconds = playlist
        .tracks
        .iter()
        .map(|track| track.seconds.max(0))
        .sum();
    playlist.candidate_count = playlist.candidate_count.max(playlist.tracks.len());
    Ok(playlist)
}

pub(super) fn saved_playlist_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedPlaylist> {
    let playlist_json: String = row.get(3)?;
    let playlist = serde_json::from_str::<AiPlaylist>(&playlist_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(SavedPlaylist {
        id: row.get(0)?,
        name: row.get(1)?,
        playlist,
        library_import_run_id: row.get(4)?,
        library_imported_at: row.get(5)?,
        library_album_count: row.get(6)?,
        library_track_count: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        automation: PlaylistAutomationStatus {
            smart: row.get::<_, i64>(10)? != 0,
            last_evaluated_at: row.get(11)?,
            last_error: row.get(12)?,
            desired_count: row.get(13)?,
        },
    })
}

pub(super) fn load_saved_playlist(conn: &Connection, id: i64) -> Result<SavedPlaylist> {
    conn.query_row(
        "
        SELECT p.id, p.name, p.prompt, p.playlist_json, p.library_import_run_id,
               p.library_imported_at, p.library_album_count, p.library_track_count,
               p.created_at, p.updated_at,
               COALESCE(automation.smart, 0),
               automation.last_evaluated_at,
               automation.last_error,
               COALESCE(automation.desired_count, 0)
        FROM saved_playlists AS p
        LEFT JOIN playlist_automations AS automation
          ON automation.saved_playlist_id = p.id
        WHERE p.id = ?1
        ",
        params![id],
        saved_playlist_from_row,
    )
    .with_context(|| format!("Could not load saved playlist {id}"))
}

pub(super) fn list_saved_playlists(conn: &Connection) -> Result<Vec<SavedPlaylist>> {
    let mut stmt = conn.prepare(
        "
        SELECT p.id, p.name, p.prompt, p.playlist_json, p.library_import_run_id,
               p.library_imported_at, p.library_album_count, p.library_track_count,
               p.created_at, p.updated_at,
               COALESCE(automation.smart, 0),
               automation.last_evaluated_at,
               automation.last_error,
               COALESCE(automation.desired_count, 0)
        FROM saved_playlists AS p
        LEFT JOIN playlist_automations AS automation
          ON automation.saved_playlist_id = p.id
        ORDER BY p.updated_at DESC, p.id DESC
        ",
    )?;
    let playlists = stmt
        .query_map([], saved_playlist_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(playlists)
}

pub(super) fn save_playlist(
    conn: &Connection,
    input: SavePlaylistRequest,
) -> Result<SavedPlaylist> {
    // Keep the mixtape catalog checks and saved snapshot in one SQLite transaction.
    let transaction = if input.playlist.mixtape.is_some() {
        Some(conn.unchecked_transaction()?)
    } else {
        None
    };
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        bail!("Name the playlist with no more than 120 characters")
    }
    let playlist = normalize_playlist(input.playlist)?;
    if playlist.mixtape.is_some() {
        if let Some(id) = input.id {
            if load_saved_playlist(conn, id)?.automation.smart {
                bail!("Save the mixtape as a new playlist so Smart refresh cannot replace its side order")
            }
        }
        for track in &playlist.tracks {
            let current: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM tracks WHERE id = ?1 AND album_id = ?2 AND file_path IS ?3 AND filename IS ?4 AND time_seconds = ?5)",
                params![track.track_id, track.album_id, track.file_path, track.filename, track.seconds],
                |row| row.get(0),
            )?;
            if !current {
                bail!("A selected mixtape track changed in the library. Reload candidates before saving so Aurora and Tonehavn receive current track identities and durations.")
            }
        }
    }
    if playlist.tracks.is_empty() && playlist.smart_settings.is_none() {
        bail!("Add at least one track before saving the playlist")
    }
    let playlist_json =
        serde_json::to_string(&playlist).context("Could not serialize the playlist")?;
    let (import_run_id, imported_at, album_count, track_count) =
        current_library_snapshot_state(conn)?;
    let now = Utc::now().to_rfc3339();
    let id = if let Some(id) = input.id {
        let changed = conn.execute(
            "
            UPDATE saved_playlists
            SET name = ?1, prompt = ?2, playlist_json = ?3,
                library_import_run_id = ?4, library_imported_at = ?5,
                library_album_count = ?6, library_track_count = ?7, updated_at = ?8
            WHERE id = ?9
            ",
            params![
                name,
                playlist.prompt,
                playlist_json,
                import_run_id,
                imported_at,
                album_count,
                track_count,
                now,
                id
            ],
        )?;
        if changed == 0 {
            bail!("The saved playlist no longer exists")
        }
        id
    } else {
        conn.execute(
            "
            INSERT INTO saved_playlists (
                name, prompt, playlist_json, library_import_run_id, library_imported_at,
                library_album_count, library_track_count, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
            ",
            params![
                name,
                playlist.prompt,
                playlist_json,
                import_run_id,
                imported_at,
                album_count,
                track_count,
                now
            ],
        )?;
        conn.last_insert_rowid()
    };
    let saved = load_saved_playlist(conn, id)?;
    if let Some(transaction) = transaction {
        transaction.commit()?;
    }
    Ok(saved)
}

pub(super) fn delete_saved_playlist(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM saved_playlists WHERE id = ?1", params![id])
        .with_context(|| format!("Could not delete saved playlist {id}"))?;
    Ok(())
}

pub(super) fn evaluate_smart_playlist(conn: &Connection, id: i64) -> Result<SavedPlaylist> {
    let transaction = if conn.is_autocommit() {
        Some(conn.unchecked_transaction()?)
    } else {
        None
    };
    let mut saved = load_saved_playlist(conn, id)?;
    if saved.playlist.mixtape.is_some() {
        bail!("A mixtape cannot be refreshed as a Smart playlist")
    }
    if !saved.automation.smart {
        bail!("Enable Smart playlist before refreshing its rules")
    }
    if !saved.playlist.request.filters.track_ids.is_empty() {
        bail!(
            "This playlist is based on temporary track IDs. Build it from reusable filters before enabling Smart playlist"
        )
    }

    let mut request = saved.playlist.request.clone();
    let track_limit = saved
        .playlist
        .smart_settings
        .as_ref()
        .map(|s| s.track_limit as usize);
    request.offset = 0;
    request.limit = 1_000;
    if request.sort.field == "random" {
        request.sort.field = "title".to_string();
        request.sort.direction = "asc".to_string();
    }

    let mut playlist_tracks = Vec::new();
    let mut desired_count = 0_i64;
    loop {
        let response = search_library(conn, request.clone(), 1_000)?;
        if request.offset == 0 {
            desired_count = response.total.max(0);
        }
        let page_count = response.rows.len();
        for row in response.rows {
            if request.view == "albums" {
                let mut album_request = BrowseRequest {
                    view: "tracks".into(),
                    limit: 1_000,
                    sort: BrowseSort {
                        field: "trackNumber".into(),
                        direction: "asc".into(),
                    },
                    ..Default::default()
                };
                album_request.filters.album_ids = vec![row.album_id];
                loop {
                    let page = search_library(conn, album_request.clone(), 1_000)?;
                    let count = page.rows.len();
                    for track in page.rows {
                        playlist_tracks.push(playlist_track_from_row(track)?);
                        if track_limit.is_some_and(|limit| playlist_tracks.len() >= limit) {
                            break;
                        }
                    }
                    album_request.offset += count as u32;
                    if count == 0
                        || i64::from(album_request.offset) >= page.total
                        || track_limit.is_some_and(|limit| playlist_tracks.len() >= limit)
                    {
                        break;
                    }
                }
            } else {
                playlist_tracks.push(playlist_track_from_row(row)?);
            }
            if track_limit.is_some_and(|limit| playlist_tracks.len() >= limit) {
                break;
            }
        }
        if track_limit.is_some_and(|limit| playlist_tracks.len() >= limit) {
            break;
        }
        if page_count == 0 {
            break;
        }
        request.offset = request.offset.saturating_add(page_count as u32);
        if i64::from(request.offset) >= desired_count {
            break;
        }
    }

    if request.view == "albums" {
        desired_count = playlist_tracks.len() as i64;
    }
    let refreshed_at = Utc::now().to_rfc3339();
    saved.playlist.tracks = playlist_tracks;
    saved.playlist.total_seconds = saved
        .playlist
        .tracks
        .iter()
        .map(|track| track.seconds.max(0))
        .sum();
    saved.playlist.matching_track_count = desired_count;
    saved.playlist.candidate_count = usize::try_from(desired_count).unwrap_or(usize::MAX);
    saved.playlist.request = request;
    saved.playlist.request.offset = 0;
    saved.playlist.request.limit = u32::try_from(desired_count.max(1)).unwrap_or(u32::MAX);
    let playlist_json = serde_json::to_string(&saved.playlist)
        .context("Could not serialize the refreshed smart playlist")?;
    let (import_run_id, imported_at, album_count, track_count) =
        current_library_snapshot_state(conn)?;
    conn.execute(
        "
        UPDATE saved_playlists
        SET playlist_json = ?1, library_import_run_id = ?2,
            library_imported_at = ?3, library_album_count = ?4,
            library_track_count = ?5, updated_at = ?6
        WHERE id = ?7
        ",
        params![
            playlist_json,
            import_run_id,
            imported_at,
            album_count,
            track_count,
            refreshed_at,
            id
        ],
    )?;
    conn.execute(
        "
        UPDATE playlist_automations
        SET last_evaluated_at = ?1, desired_count = ?2,
            last_error = NULL
        WHERE saved_playlist_id = ?3
        ",
        params![refreshed_at, desired_count, id],
    )?;

    let result = load_saved_playlist(conn, id)?;
    if let Some(transaction) = transaction {
        transaction.commit()?;
    }
    Ok(result)
}

pub(super) fn set_playlist_automation(
    conn: &Connection,
    request: SetPlaylistAutomationRequest,
) -> Result<SavedPlaylist> {
    let saved = load_saved_playlist(conn, request.id)?;
    if request.smart && saved.playlist.mixtape.is_some() {
        bail!("Mixtapes preserve an exact side order and locks; Smart refresh is not available for them")
    }
    if request.smart && !saved.playlist.request.filters.track_ids.is_empty() {
        bail!(
            "This playlist is based on temporary track IDs. Build it from reusable filters before enabling Smart playlist"
        )
    }
    conn.execute(
        "
        INSERT INTO playlist_automations (saved_playlist_id, smart)
        VALUES (?1, ?2)
        ON CONFLICT(saved_playlist_id) DO UPDATE SET
            smart = excluded.smart,
            last_error = NULL
        ",
        params![request.id, if request.smart { 1 } else { 0 }],
    )?;
    if request.smart {
        return evaluate_smart_playlist(conn, request.id);
    }
    load_saved_playlist(conn, request.id)
}

pub(crate) fn refresh_all_smart_playlists_for_connection(conn: &Connection) -> Result<usize> {
    let mut stmt = conn.prepare(
        "SELECT saved_playlist_id FROM playlist_automations WHERE smart = 1 ORDER BY saved_playlist_id",
    )?;
    let ids = stmt
        .query_map([], |row| row.get::<_, i64>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut refreshed = 0;
    for id in ids {
        let saved = load_saved_playlist(conn, id)?;
        if saved
            .playlist
            .smart_settings
            .as_ref()
            .is_some_and(|s| s.refresh_policy == "manual")
        {
            continue;
        }
        match evaluate_smart_playlist(conn, id) {
            Ok(_) => refreshed += 1,
            Err(error) => {
                conn.execute(
                    "UPDATE playlist_automations SET last_error = ?1 WHERE saved_playlist_id = ?2",
                    params![error.to_string(), id],
                )?;
            }
        }
    }
    Ok(refreshed)
}

fn validate_smart_settings(settings: &crate::ai::SmartPlaylistSettings) -> Result<()> {
    if !(1..=10_000).contains(&settings.track_limit)
        || !matches!(settings.refresh_policy.as_str(), "library" | "manual")
    {
        bail!("Smart playlists require a limit from 1 to 10000 and a library or manual refresh policy")
    }
    Ok(())
}

pub(crate) fn save_smart_playlist_on(
    conn: &Connection,
    input: crate::ai::SaveSmartPlaylistRequest,
) -> Result<SavedPlaylist> {
    validate_smart_settings(&input.settings)?;
    if !matches!(input.request.view.as_str(), "tracks" | "albums")
        || !input.request.filters.track_ids.is_empty()
        || input.request.sort.field == "random"
    {
        bail!("Smart playlists need reusable track filters and a stable sort")
    }
    let tx = conn.unchecked_transaction()?;
    let mut playlist = if let Some(id) = input.id {
        let saved = load_saved_playlist(&tx, id)?;
        if input
            .expected_updated_at
            .as_ref()
            .is_some_and(|expected| expected != &saved.updated_at)
        {
            bail!("This playlist was edited in the other app. Reload its rules before saving")
        }
        if saved.playlist.mixtape.is_some() || !saved.playlist.request.filters.track_ids.is_empty()
        {
            bail!("An ordered mixtape or exact selection cannot be replaced by Smart rules")
        }
        saved.playlist
    } else {
        build_playlist(
            &tx,
            AiPlaylistPlan {
                prompt: "Shared local Smart playlist rules".into(),
                name: input.name.clone(),
                description: "Reusable library filters shared by Aurora and Music Library.".into(),
                request: input.request.clone(),
                strategy: "ranked".into(),
                target_track_count: 1,
                target_minutes: 0,
                max_tracks_per_artist: 10,
                max_tracks_per_album: 10,
                model: "Local rules".into(),
                usage: crate::ai::AiUsage {
                    input_tokens: None,
                    cached_input_tokens: None,
                    output_tokens: None,
                },
            },
        )?
    };
    playlist.name = input.name.clone();
    playlist.request = input.request;
    playlist.request.offset = 0;
    playlist.smart_settings = Some(input.settings);
    let saved = save_playlist(
        &tx,
        SavePlaylistRequest {
            id: input.id,
            name: input.name,
            playlist,
        },
    )?;
    let saved = set_playlist_automation(
        &tx,
        SetPlaylistAutomationRequest {
            id: saved.id,
            smart: true,
        },
    )?;
    tx.commit()?;
    Ok(saved)
}

pub(crate) fn playlist_bridge_at(
    dir: &Path,
    operation: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value> {
    let conn = super::open_path(&dir.join("music-library.sqlite3"))?;
    let result = match operation {
        "playlistSaveSmart" => save_smart_playlist_on(&conn, serde_json::from_value(payload)?)?,
        "playlistRefresh" => {
            let id = payload["id"].as_i64().context("Playlist ID is required")?;
            let tx = conn.unchecked_transaction()?;
            let saved = evaluate_smart_playlist(&tx, id)?;
            tx.commit()?;
            saved
        }
        "playlistSaveSelection" => save_playlist_selection(&conn, payload)?,
        _ => bail!("Unsupported playlist operation"),
    };
    Ok(serde_json::json!({"id": result.id}))
}

fn save_playlist_selection(conn: &Connection, payload: serde_json::Value) -> Result<SavedPlaylist> {
    let name = payload["name"]
        .as_str()
        .context("Name the playlist")?
        .to_owned();
    let tx = conn.unchecked_transaction()?;
    let mut ids = Vec::<i64>::new();
    if let Some(tracks) = payload["tracks"].as_array() {
        if tracks.len() > 1_000 {
            bail!("Select at most 1000 songs")
        }
        for track in tracks {
            let id: i64 = tx
                .query_row(
                    "SELECT id FROM tracks WHERE id=?1 AND file_path=?2 AND filename=?3",
                    params![
                        track["id"].as_i64(),
                        track["filePath"].as_str(),
                        track["filename"].as_str()
                    ],
                    |r| r.get(0),
                )
                .context("A selected song changed identity. Refresh before saving")?;
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    if let Some(albums) = payload["albumIds"].as_array() {
        if albums.len() > 100 {
            bail!("Select at most 100 albums")
        }
        for album in albums {
            let mut stmt = tx.prepare("SELECT id FROM tracks WHERE album_id=?1 ORDER BY COALESCE(disc_number,1),COALESCE(track_number,0),filename,id LIMIT 1001")?;
            let album_ids = stmt
                .query_map([album.as_str().context("Invalid album ID")?], |r| {
                    r.get::<_, i64>(0)
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            if album_ids.is_empty() {
                bail!("A selected album is no longer in the catalog")
            }
            for id in album_ids {
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
            if ids.len() > 1_000 {
                bail!("The selection exceeds 1000 songs. Save fewer albums")
            }
        }
    }
    if ids.is_empty() {
        bail!("Select songs or albums before saving")
    }
    let mut request = BrowseRequest {
        view: "tracks".into(),
        limit: 1_000,
        ..Default::default()
    };
    request.filters.track_ids = ids.clone();
    let response = search_library(&tx, request.clone(), 1_000)?;
    let mut rows = response.rows;
    rows.sort_by_key(|r| ids.iter().position(|id| Some(*id) == r.track_id));
    if rows.len() != ids.len() {
        bail!("The selected songs changed. Refresh before saving")
    }
    let tracks = rows
        .into_iter()
        .map(playlist_track_from_row)
        .collect::<Result<Vec<_>>>()?;
    let playlist = AiPlaylist {
        smart_settings: None,
        mixtape: None,
        prompt: "Selected songs and albums from Aurora".into(),
        name: name.clone(),
        description: "Selected songs and albums, in their reviewed order.".into(),
        request,
        strategy: "ranked".into(),
        target_track_count: ids.len() as u32,
        target_minutes: 0,
        max_tracks_per_artist: 10,
        max_tracks_per_album: 10,
        matching_track_count: ids.len() as i64,
        candidate_count: ids.len(),
        total_seconds: tracks.iter().map(|t| t.seconds).sum(),
        tracks,
        model: "Local selection".into(),
        usage: crate::ai::AiUsage {
            input_tokens: None,
            cached_input_tokens: None,
            output_tokens: None,
        },
    };
    let saved = save_playlist(
        &tx,
        SavePlaylistRequest {
            id: None,
            name,
            playlist,
        },
    )?;
    tx.commit()?;
    Ok(saved)
}

#[cfg(not(test))]
pub fn save_smart_playlist_for_app(
    app: &AppHandle,
    input: crate::ai::SaveSmartPlaylistRequest,
) -> Result<SavedPlaylist> {
    let (conn, _) = open(app)?;
    save_smart_playlist_on(&conn, input)
}

pub(super) fn playlist_track_file(track: &AiPlaylistTrack) -> Option<PathBuf> {
    let directory = track.file_path.as_deref()?.trim();
    let filename = track.filename.as_deref()?.trim();
    if directory.is_empty() || filename.is_empty() {
        return None;
    }
    Some(PathBuf::from(directory).join(filename))
}

pub(super) fn write_playlist_m3u8(path: &Path, playlist: &AiPlaylist) -> Result<usize> {
    let mut file = fs::File::create(path)?;
    file.write_all(b"#EXTM3U\r\n")?;
    let mut row_count = 0;
    for (index, track) in playlist.tracks.iter().enumerate() {
        if let Some(tape) = &playlist.mixtape {
            if index == 0 {
                writeln!(file, "# Side A\r")?;
            }
            if index == tape.sides[0].len() {
                writeln!(file, "# Side B\r")?;
            }
        }
        let Some(track_path) = playlist_track_file(track) else {
            continue;
        };
        let artist = track
            .display_artist
            .as_deref()
            .or(track.album_artist.as_deref())
            .unwrap_or("Unknown artist")
            .replace(['\r', '\n'], " ");
        let title = track
            .title
            .as_deref()
            .unwrap_or("Unknown track")
            .replace(['\r', '\n'], " ");
        writeln!(
            file,
            "#EXTINF:{},{} - {}\r",
            track.seconds.max(0),
            artist,
            title
        )?;
        writeln!(file, "{}\r", track_path.display())?;
        row_count += 1;
    }
    Ok(row_count)
}

#[cfg(not(test))]
pub fn build_playlist_for_app(app: &AppHandle, plan: AiPlaylistPlan) -> Result<AiPlaylist> {
    let (conn, _) = open(app)?;
    ensure_search_indexes(&conn)?;
    build_playlist(&conn, plan)
}

#[cfg(not(test))]
pub fn list_saved_playlists_for_app(app: &AppHandle) -> Result<Vec<SavedPlaylist>> {
    let (conn, _) = open(app)?;
    refresh_all_smart_playlists_for_connection(&conn)?;
    list_saved_playlists(&conn)
}

#[cfg(not(test))]
pub fn save_playlist_for_app(app: &AppHandle, input: SavePlaylistRequest) -> Result<SavedPlaylist> {
    let (conn, _) = open(app)?;
    save_playlist_snapshot(&conn, input)
}

// Editing the displayed order must not restore rules superseded in the other app.
fn save_playlist_snapshot(conn: &Connection, input: SavePlaylistRequest) -> Result<SavedPlaylist> {
    let tx = conn.unchecked_transaction()?;
    if let Some(id) = input.id {
        let current = load_saved_playlist(&tx, id)?;
        if (current.playlist.smart_settings.is_some() || input.playlist.smart_settings.is_some())
            && (serde_json::to_value(&current.playlist.request)?
                != serde_json::to_value(&input.playlist.request)?
                || serde_json::to_value(&current.playlist.smart_settings)?
                    != serde_json::to_value(&input.playlist.smart_settings)?)
        {
            bail!("This playlist's rules changed in the other app. Reopen it before updating the saved order")
        }
    }
    let saved = save_playlist(&tx, input)?;
    tx.commit()?;
    Ok(saved)
}

#[cfg(not(test))]
pub fn delete_saved_playlist_for_app(app: &AppHandle, id: i64) -> Result<()> {
    let (conn, _) = open(app)?;
    delete_saved_playlist(&conn, id)
}

#[cfg(not(test))]
pub fn set_playlist_automation_for_app(
    app: &AppHandle,
    request: SetPlaylistAutomationRequest,
) -> Result<SavedPlaylist> {
    let (conn, _) = open(app)?;
    set_playlist_automation(&conn, request)
}

#[cfg(not(test))]
pub fn refresh_smart_playlist_for_app(
    app: &AppHandle,
    id: i64,
) -> Result<SmartPlaylistRefreshResult> {
    let (conn, _) = open(app)?;
    let evaluation = evaluate_smart_playlist(&conn, id)?;
    let refreshed_at = evaluation
        .automation
        .last_evaluated_at
        .clone()
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    Ok(SmartPlaylistRefreshResult {
        desired_count: evaluation.automation.desired_count,
        preview_count: evaluation.playlist.tracks.len(),
        playlist: evaluation,
        refreshed_at,
    })
}

#[cfg(not(test))]
pub fn export_playlist_for_app(
    app: &AppHandle,
    input: ExportPlaylistRequest,
) -> Result<ExportResult> {
    let (conn, _) = open(app)?;
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        bail!("Name the playlist with no more than 120 characters")
    }
    let playlist = normalize_playlist(input.playlist)?;
    if playlist.tracks.is_empty() {
        bail!("Add at least one track before exporting the playlist")
    }
    let export_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?
        .join("exports");
    fs::create_dir_all(&export_dir).context("Could not create export directory")?;
    let path = export_dir.join(format!(
        "music-library-playlist-{}-{}.m3u8",
        safe_file_segment(name),
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let row_count = write_playlist_m3u8(&path, &playlist)?;
    if row_count == 0 {
        bail!("None of the selected tracks has both a local folder and filename")
    }
    let request_json = serde_json::to_string(&playlist)
        .context("Could not serialize the playlist export record")?;
    conn.execute(
        "
        INSERT INTO exports (created_at, view, format, row_count, path, request_json)
        VALUES (?1, 'playlist', 'm3u8', ?2, ?3, ?4)
        ",
        params![
            Utc::now().to_rfc3339(),
            row_count as i64,
            path.display().to_string(),
            request_json
        ],
    )?;
    Ok(ExportResult {
        path: path.display().to_string(),
        format: "m3u8".to_string(),
        row_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_smart_rules_roundtrip_limits_manual_refresh_and_empty_matches() {
        let conn = seeded_connection();
        for i in 2..=4 {
            conn.execute("INSERT INTO tracks (id,import_run_id,album_id,title,canonical_genre,genre_normalized,normalized_rating,file_path,filename,row_hash) VALUES (?1,1,'mb:test',?2,'Synthpop','synthpop',90,'D:\\Music',?3,?4)",params![i,format!("Song {i}"),format!("{i}.mp3"),format!("hash-{i}")]).unwrap();
        }
        rebuild_search_indexes(&conn).unwrap();
        let request = test_playlist_plan().request;
        let saved = save_smart_playlist_on(
            &conn,
            crate::ai::SaveSmartPlaylistRequest {
                id: None,
                expected_updated_at: None,
                name: "Shared".into(),
                request: request.clone(),
                settings: crate::ai::SmartPlaylistSettings {
                    track_limit: 1,
                    refresh_policy: "manual".into(),
                },
            },
        )
        .unwrap();
        assert!(saved.automation.smart);
        assert_eq!(saved.playlist.tracks.len(), 1);
        assert_eq!(saved.playlist.matching_track_count, 4);
        let json = serde_json::to_value(&saved.playlist).unwrap();
        assert_eq!(json["smartSettings"]["trackLimit"], 1);
        conn.execute(
            "UPDATE tracks SET canonical_genre='Other',genre_normalized='other'",
            [],
        )
        .unwrap();
        assert_eq!(
            refresh_all_smart_playlists_for_connection(&conn).unwrap(),
            0
        );
        assert_eq!(
            load_saved_playlist(&conn, saved.id)
                .unwrap()
                .playlist
                .tracks
                .len(),
            1
        );
        let next = evaluate_smart_playlist(&conn, saved.id).unwrap();
        assert_eq!(next.playlist.tracks.len(), 0);
        let reopened = save_smart_playlist_on(
            &conn,
            crate::ai::SaveSmartPlaylistRequest {
                id: Some(saved.id),
                expected_updated_at: None,
                name: "Renamed".into(),
                request,
                settings: crate::ai::SmartPlaylistSettings {
                    track_limit: 10,
                    refresh_policy: "library".into(),
                },
            },
        )
        .unwrap();
        assert_eq!(reopened.id, saved.id);
        assert_eq!(reopened.name, "Renamed");
        assert_eq!(reopened.playlist.tracks.len(), 0);
        assert_eq!(
            refresh_all_smart_playlists_for_connection(&conn).unwrap(),
            1
        );
        let mut stale = crate::ai::SaveSmartPlaylistRequest {
            id: Some(saved.id),
            expected_updated_at: Some("outdated".into()),
            name: "Overwrite".into(),
            request: test_playlist_plan().request,
            settings: crate::ai::SmartPlaylistSettings {
                track_limit: 1,
                refresh_policy: "library".into(),
            },
        };
        assert!(save_smart_playlist_on(&conn, stale.clone())
            .unwrap_err()
            .to_string()
            .contains("other app"));
        assert_eq!(
            load_saved_playlist(&conn, saved.id).unwrap().name,
            "Renamed"
        );
        stale.id = None;
        stale.expected_updated_at = None;
        stale.name = "Empty new rules".into();
        assert!(save_smart_playlist_on(&conn, stale)
            .unwrap()
            .playlist
            .tracks
            .is_empty());
    }

    #[test]
    fn shared_album_rules_include_all_songs_and_static_selection_checks_identity() {
        let conn = seeded_connection();
        conn.execute(
            "UPDATE tracks SET disc_number=1,track_number=2 WHERE id=1",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO tracks (id,import_run_id,album_id,title,disc_number,track_number,file_path,filename,row_hash) VALUES (2,1,'mb:test','First',1,1,'D:\\Music','first.mp3','first'),(3,1,'mb:test','Disc Two',2,1,'D:\\Music','disc2.mp3','disc2')",[]).unwrap();
        rebuild_search_indexes(&conn).unwrap();
        let mut request = BrowseRequest {
            view: "albums".into(),
            ..Default::default()
        };
        request.filters.album_ids = vec!["mb:test".into()];
        let saved = save_smart_playlist_on(
            &conn,
            crate::ai::SaveSmartPlaylistRequest {
                id: None,
                expected_updated_at: None,
                name: "Albums".into(),
                request,
                settings: crate::ai::SmartPlaylistSettings {
                    track_limit: 100,
                    refresh_policy: "library".into(),
                },
            },
        )
        .unwrap();
        assert_eq!(saved.playlist.request.view, "albums");
        assert_eq!(
            saved
                .playlist
                .tracks
                .iter()
                .map(|t| t.track_id)
                .collect::<Vec<_>>(),
            vec![2, 1, 3]
        );
        let albums=save_playlist_selection(&conn,serde_json::json!({"name":"Album selection","albumIds":["mb:test","mb:test"],"tracks":[]})).unwrap();
        assert_eq!(
            albums
                .playlist
                .tracks
                .iter()
                .map(|t| t.track_id)
                .collect::<Vec<_>>(),
            vec![2, 1, 3]
        );
        let ref_track = &saved.playlist.tracks[0];
        let selection = serde_json::json!({"name":"Selection","tracks":[{"id":ref_track.track_id,"filePath":ref_track.file_path,"filename":ref_track.filename}],"albumIds":[]});
        let selected = save_playlist_selection(&conn, selection.clone()).unwrap();
        assert_eq!(selected.playlist.tracks[0].track_id, ref_track.track_id);
        assert!(selected.playlist.smart_settings.is_none());
        assert!(!selected.automation.smart);
        let before = list_saved_playlists(&conn).unwrap().len();
        let mut wrong = selection;
        wrong["tracks"][0]["filename"] = serde_json::json!("wrong.mp3");
        assert!(save_playlist_selection(&conn, wrong).is_err());
        assert_eq!(list_saved_playlists(&conn).unwrap().len(), before);
    }

    #[test]
    fn bridge_dispatch_saves_and_refreshes_an_empty_shared_recipe() {
        let dir = tempfile::tempdir().unwrap();
        drop(super::super::open_path(&dir.path().join("music-library.sqlite3")).unwrap());
        let input = crate::ai::SaveSmartPlaylistRequest {
            id: None,
            expected_updated_at: None,
            name: "Future songs".into(),
            request: BrowseRequest {
                view: "tracks".into(),
                ..Default::default()
            },
            settings: crate::ai::SmartPlaylistSettings {
                track_limit: 10,
                refresh_policy: "manual".into(),
            },
        };
        let result = playlist_bridge_at(
            dir.path(),
            "playlistSaveSmart",
            serde_json::json!({"id":null,"name":input.name,"request":input.request,"settings":input.settings}),
        )
        .unwrap();
        let id = result["id"].as_i64().unwrap();
        assert_eq!(
            playlist_bridge_at(dir.path(), "playlistRefresh", serde_json::json!({"id":id}))
                .unwrap()["id"],
            id
        );
        let conn = super::super::open_path(&dir.path().join("music-library.sqlite3")).unwrap();
        let saved = load_saved_playlist(&conn, id).unwrap();
        assert_eq!(saved.name, "Future songs");
        assert!(saved.automation.smart);
        assert!(saved.playlist.tracks.is_empty());
    }

    #[test]
    fn snapshot_edits_cannot_restore_shared_rules_changed_by_another_app() {
        let conn = seeded_connection();
        let saved = save_smart_playlist_on(
            &conn,
            crate::ai::SaveSmartPlaylistRequest {
                id: None,
                expected_updated_at: None,
                name: "Shared".into(),
                request: test_playlist_plan().request,
                settings: crate::ai::SmartPlaylistSettings {
                    track_limit: 10,
                    refresh_policy: "manual".into(),
                },
            },
        )
        .unwrap();
        let mut request = saved.playlist.request.clone();
        request.filters.year_from = Some(1980);
        save_smart_playlist_on(
            &conn,
            crate::ai::SaveSmartPlaylistRequest {
                id: Some(saved.id),
                expected_updated_at: Some(saved.updated_at),
                name: saved.name.clone(),
                request,
                settings: saved.playlist.smart_settings.clone().unwrap(),
            },
        )
        .unwrap();
        assert!(save_playlist_snapshot(
            &conn,
            SavePlaylistRequest {
                id: Some(saved.id),
                name: saved.name,
                playlist: saved.playlist
            }
        )
        .unwrap_err()
        .to_string()
        .contains("other app"));
        assert_eq!(
            load_saved_playlist(&conn, saved.id)
                .unwrap()
                .playlist
                .request
                .filters
                .year_from,
            Some(1980)
        );
    }
    use crate::db::test_support::*;

    #[test]
    fn builds_playlist_from_local_rows_and_preserves_privacy_boundary() {
        let conn = seeded_connection();

        let playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");

        assert_eq!(playlist.matching_track_count, 1);
        assert_eq!(playlist.candidate_count, 1);
        assert_eq!(playlist.tracks.len(), 1);
        assert_eq!(playlist.tracks[0].track_id, 1);
        assert_eq!(playlist.tracks[0].album_id, "mb:test");
        assert_eq!(playlist.tracks[0].seconds, 260);
        assert!(playlist.tracks[0].loved);
        assert_eq!(playlist.total_seconds, 260);
        assert_eq!(playlist.request.view, "tracks");
        assert_eq!(playlist.request.limit, 50);
    }

    #[test]
    fn saves_reopens_updates_and_deletes_exact_playlists() {
        let conn = seeded_connection();
        let playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");

        let saved = save_playlist(
            &conn,
            SavePlaylistRequest {
                id: None,
                name: "Friday Night".to_string(),
                playlist,
            },
        )
        .expect("save playlist");

        assert_eq!(saved.name, "Friday Night");
        assert_eq!(saved.playlist.tracks.len(), 1);
        assert_eq!(saved.playlist.tracks[0].track_id, 1);
        assert_eq!(list_saved_playlists(&conn).unwrap().len(), 1);

        let updated = save_playlist(
            &conn,
            SavePlaylistRequest {
                id: Some(saved.id),
                name: "Friday Night, edited".to_string(),
                playlist: saved.playlist,
            },
        )
        .expect("update playlist");
        assert_eq!(updated.id, saved.id);
        assert_eq!(updated.name, "Friday Night, edited");

        delete_saved_playlist(&conn, saved.id).expect("delete playlist");
        assert!(list_saved_playlists(&conn).unwrap().is_empty());
    }

    #[test]
    fn mixtape_roundtrip_export_and_consumer_order_preserve_locks() {
        let conn = seeded_connection();
        let playlist = test_mixtape(&conn);
        let saved = save_playlist(
            &conn,
            SavePlaylistRequest {
                id: None,
                name: "Two sides".into(),
                playlist,
            },
        )
        .unwrap();
        let reopened = load_saved_playlist(&conn, saved.id).unwrap();
        let tape = reopened.playlist.mixtape.as_ref().unwrap();
        assert!(tape.sides[0][0].transition_to_next);
        assert!(tape.sides[1][0].locked);
        assert_eq!(tape.notes.get("1").unwrap(), "Bright synths");
        // Aurora resolves by file identity; Tonehavn resolves by current catalog ID.
        for sql in [
            "SELECT t.id FROM saved_playlists p JOIN json_each(p.playlist_json, '$.tracks') item JOIN tracks t ON t.file_path=json_extract(item.value,'$.filePath') AND t.filename=json_extract(item.value,'$.filename') WHERE p.id=?1 ORDER BY CAST(item.key AS INTEGER)",
            "SELECT t.id FROM saved_playlists p JOIN json_each(p.playlist_json, '$.tracks') item JOIN tracks t ON t.id=CAST(json_extract(item.value,'$.trackId') AS INTEGER) WHERE p.id=?1 ORDER BY CAST(item.key AS INTEGER)",
        ] {
            let ids = conn.prepare(sql).unwrap().query_map(params![saved.id], |row| row.get::<_,i64>(0)).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
            assert_eq!(ids, vec![1,2,3]);
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tape.m3u8");
        assert_eq!(write_playlist_m3u8(&path, &reopened.playlist).unwrap(), 3);
        let exported = fs::read_to_string(path).unwrap();
        assert!(exported.find("# Side A").unwrap() < exported.find("track-2.mp3").unwrap());
        assert!(exported.find("track-2.mp3").unwrap() < exported.find("# Side B").unwrap());
        assert!(exported.find("# Side B").unwrap() < exported.find("track-3.mp3").unwrap());
        assert!(set_playlist_automation(
            &conn,
            SetPlaylistAutomationRequest {
                id: saved.id,
                smart: true
            }
        )
        .unwrap_err()
        .to_string()
        .contains("Mixtapes"));
    }

    #[test]
    fn mixtape_rejects_stale_catalog_identity_and_duration_before_saving() {
        let conn = seeded_connection();
        let playlist = test_mixtape(&conn);
        conn.execute("UPDATE tracks SET time_seconds=400 WHERE id=2", [])
            .unwrap();
        assert!(save_playlist(
            &conn,
            SavePlaylistRequest {
                id: None,
                name: "Two sides".into(),
                playlist
            }
        )
        .unwrap_err()
        .to_string()
        .contains("changed in the library"));
        assert!(list_saved_playlists(&conn).unwrap().is_empty());
    }

    #[test]
    fn mixtape_rejects_overlong_sides_repeat_violations_and_wrong_flat_order() {
        let conn = seeded_connection();
        let original = test_mixtape(&conn);
        let mut playlist = original.clone();
        playlist.mixtape.as_mut().unwrap().config.minutes[0] = 1;
        assert!(normalize_playlist(playlist)
            .unwrap_err()
            .to_string()
            .contains("duration limit"));
        let mut playlist = original.clone();
        playlist.mixtape.as_mut().unwrap().config.max_artist = 1;
        assert!(normalize_playlist(playlist)
            .unwrap_err()
            .to_string()
            .contains("repeat caps"));
        let mut playlist = original;
        playlist.tracks.swap(0, 2);
        assert!(normalize_playlist(playlist)
            .unwrap_err()
            .to_string()
            .contains("Side A followed by Side B"));
    }

    #[test]
    fn smart_playlists_re_evaluate_saved_rules_and_preserve_full_paths() {
        let conn = seeded_connection();
        let playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");
        let saved = save_playlist(
            &conn,
            SavePlaylistRequest {
                id: None,
                name: "Living Synthpop".to_string(),
                playlist,
            },
        )
        .expect("save playlist");

        let enabled = set_playlist_automation(
            &conn,
            SetPlaylistAutomationRequest {
                id: saved.id,
                smart: true,
            },
        )
        .expect("enable smart playlist");
        assert!(enabled.automation.smart);
        assert_eq!(enabled.automation.desired_count, 1);

        conn.execute(
            "
            INSERT INTO tracks (
                import_run_id, album_id, album_unique_id, display_artist,
                album_artist_display, album, title, canonical_genre, genre_normalized,
                publisher, love, normalized_rating, year, release_year, time_seconds,
                file_path, filename, row_hash
            ) VALUES (
                1, 'mb:test', 'test', 'Pet Shop Boys', 'Pet Shop Boys',
                'Actually', 'One More Chance', 'Synthpop', 'synthpop',
                'Parlophone', 'L', 90, 1987, 1987, 310,
                'D:\\Music\\Pet Shop Boys\\Actually', '01 One More Chance.mp3', 'hash-2'
            )
            ",
            [],
        )
        .expect("insert later matching track");
        rebuild_search_indexes(&conn).expect("rebuild search indexes");

        let evaluation = evaluate_smart_playlist(&conn, saved.id).expect("refresh smart playlist");
        assert_eq!(evaluation.automation.desired_count, 2);
        assert_eq!(evaluation.playlist.matching_track_count, 2);
        assert_eq!(evaluation.playlist.tracks.len(), 2);
        assert!(evaluation
            .playlist
            .tracks
            .iter()
            .filter_map(playlist_track_file)
            .any(|path| path.ends_with("01 One More Chance.mp3")));

        let mut invalid = evaluation.playlist.clone();
        invalid.request.filters.track_ids = vec![1];
        conn.execute(
            "UPDATE saved_playlists SET playlist_json = ?1 WHERE id = ?2",
            params![serde_json::to_string(&invalid).unwrap(), saved.id],
        )
        .unwrap();
        assert_eq!(
            refresh_all_smart_playlists_for_connection(&conn).unwrap(),
            0
        );
        assert!(load_saved_playlist(&conn, saved.id)
            .unwrap()
            .automation
            .last_error
            .unwrap()
            .contains("temporary track IDs"));
        conn.execute(
            "UPDATE saved_playlists SET playlist_json = ?1 WHERE id = ?2",
            params![
                serde_json::to_string(&evaluation.playlist).unwrap(),
                saved.id
            ],
        )
        .unwrap();
        assert_eq!(
            refresh_all_smart_playlists_for_connection(&conn).unwrap(),
            1
        );
        assert!(load_saved_playlist(&conn, saved.id)
            .unwrap()
            .automation
            .last_error
            .is_none());
    }

    #[test]
    fn rejects_track_id_snapshots_without_leaving_smart_mode_enabled() {
        let conn = seeded_connection();
        let mut playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");
        playlist.model = "Local Search".to_string();
        playlist.request.filters.track_ids = vec![playlist.tracks[0].track_id];
        let saved = save_playlist(
            &conn,
            SavePlaylistRequest {
                id: None,
                name: "Snapshot".to_string(),
                playlist,
            },
        )
        .expect("save snapshot");

        assert!(set_playlist_automation(
            &conn,
            SetPlaylistAutomationRequest {
                id: saved.id,
                smart: true,
            },
        )
        .is_err());
        assert!(
            !load_saved_playlist(&conn, saved.id)
                .expect("reload snapshot")
                .automation
                .smart
        );
    }

    #[test]
    fn accepts_local_search_playlists_above_five_hundred_tracks() {
        let conn = seeded_connection();
        let mut playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");
        let template = playlist.tracks[0].clone();
        playlist.model = "Local Search".to_string();
        playlist.target_track_count = 750;
        playlist.tracks = (1..=750)
            .map(|track_id| AiPlaylistTrack {
                track_id: track_id as i64,
                ..template.clone()
            })
            .collect();

        let saved = save_playlist(
            &conn,
            SavePlaylistRequest {
                id: None,
                name: "Long Search playlist".to_string(),
                playlist,
            },
        )
        .expect("save seven hundred fifty tracks");

        assert_eq!(saved.playlist.tracks.len(), 750);
    }

    #[test]
    fn writes_utf8_m3u8_and_skips_tracks_without_local_paths() {
        let conn = seeded_connection();
        let mut playlist = build_playlist(&conn, test_playlist_plan()).expect("build playlist");
        playlist.tracks[0].display_artist = Some("Björk".to_string());
        playlist.tracks[0].title = Some("Jóga".to_string());
        playlist.tracks.push(AiPlaylistTrack {
            track_id: 99,
            album_id: "mb:missing-path".to_string(),
            album: Some("Local only".to_string()),
            album_artist: Some("No file".to_string()),
            display_artist: None,
            title: Some("Skipped".to_string()),
            genre: Some("Test".to_string()),
            year: Some(2026),
            seconds: 120,
            rating: None,
            loved: false,
            file_path: None,
            filename: None,
        });
        let path = std::env::temp_dir().join(format!(
            "music-library-playlist-test-{}.m3u8",
            Utc::now().timestamp_millis()
        ));

        let written = write_playlist_m3u8(&path, &playlist).expect("write playlist");
        let content = fs::read_to_string(&path).expect("read playlist");

        assert_eq!(written, 1);
        assert!(content.starts_with("#EXTM3U\r\n"));
        assert!(content.contains("#EXTINF:260,Björk - Jóga\r\n"));
        assert!(content.contains("02 What Have I Done.mp3"));
        assert!(!content.contains("Skipped"));
        fs::remove_file(path).expect("remove playlist test file");
    }
}
