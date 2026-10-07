use super::*;

#[derive(Clone)]
pub(super) struct DiscoveryMixerSeedData {
    pub(super) option: DiscoveryMixerSeedOption,
    pub(super) artist_key: String,
    pub(super) album_id: Option<String>,
    pub(super) genre_id: String,
    pub(super) genre: String,
}

#[derive(Clone)]
pub(super) struct DiscoveryMixerCandidateData {
    pub(super) album_id: String,
    pub(super) album: String,
    pub(super) artist: String,
    pub(super) artist_key: String,
    pub(super) album_key: String,
    pub(super) release_year: Option<i32>,
    pub(super) genre_id: String,
    pub(super) genre: String,
    pub(super) cover_path: Option<String>,
    pub(super) rating_completeness: f64,
    pub(super) loved_tracks: i64,
    pub(super) album_score: Option<f64>,
}

#[derive(Clone)]
pub(super) struct DiscoveryMixerConnection {
    pub(super) seed_index: usize,
    pub(super) strength: f64,
    pub(super) reason: String,
    pub(super) evidence: String,
    pub(super) lastfm_linked: bool,
}

#[derive(Clone)]
pub(super) struct DiscoveryMixerRankedCandidate {
    pub(super) candidate_index: usize,
    pub(super) artist_key: String,
    pub(super) score: f64,
    pub(super) seed_indices: Vec<usize>,
}

pub(super) fn discovery_mixer_familiarity(candidate: &DiscoveryMixerCandidateData) -> f64 {
    let completion = candidate.rating_completeness.clamp(0.0, 1.0);
    let score = (candidate.album_score.unwrap_or_default() / 400.0).clamp(0.0, 1.0);
    let loved = (candidate.loved_tracks as f64 / 3.0).clamp(0.0, 1.0);
    completion * 0.7 + score * 0.2 + loved * 0.1
}

pub(super) fn discovery_mixer_preference(
    candidate: &DiscoveryMixerCandidateData,
    explore_percent: i64,
) -> f64 {
    let explore = explore_percent.clamp(0, 100) as f64 / 100.0;
    let familiarity = discovery_mixer_familiarity(candidate);
    (1.0 - explore) * familiarity + explore * (1.0 - familiarity)
}

pub(super) fn select_discovery_mixer_candidates(
    mut candidates: Vec<DiscoveryMixerRankedCandidate>,
    seed_count: usize,
    limit: usize,
) -> Vec<DiscoveryMixerRankedCandidate> {
    candidates.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.candidate_index.cmp(&right.candidate_index))
    });
    let mut selected = Vec::new();
    let mut seed_loads = vec![0_usize; seed_count];
    let mut artist_loads = HashMap::<String, usize>::new();

    while selected.len() < limit && !candidates.is_empty() {
        let choice = candidates
            .iter()
            .enumerate()
            .map(|(index, candidate)| {
                let least_seed_load = candidate
                    .seed_indices
                    .iter()
                    .map(|seed_index| seed_loads[*seed_index])
                    .min()
                    .unwrap_or_default();
                let artist_load = artist_loads
                    .get(&candidate.artist_key)
                    .copied()
                    .unwrap_or_default();
                let adjusted =
                    candidate.score - least_seed_load as f64 * 0.08 - artist_load as f64 * 0.18;
                (index, adjusted, candidate.score)
            })
            .max_by(|left, right| {
                left.1
                    .partial_cmp(&right.1)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| {
                        left.2
                            .partial_cmp(&right.2)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    })
                    .then_with(|| right.0.cmp(&left.0))
            })
            .map(|choice| choice.0)
            .unwrap_or_default();
        let candidate = candidates.remove(choice);
        if let Some(seed_index) = candidate
            .seed_indices
            .iter()
            .min_by_key(|seed_index| (seed_loads[**seed_index], **seed_index))
            .copied()
        {
            seed_loads[seed_index] += 1;
        }
        *artist_loads
            .entry(candidate.artist_key.clone())
            .or_default() += 1;
        selected.push(candidate);
    }

    selected
}

pub(super) fn discovery_mixer_seed_options(
    conn: &Connection,
    request: &DiscoveryMixerSeedSearchRequest,
) -> Result<Vec<DiscoveryMixerSeedOption>> {
    let kind = match request.kind.as_deref() {
        Some("artist") => "artist",
        Some("album") => "album",
        _ => "all",
    };
    let limit = request.limit.unwrap_or(16).clamp(4, 40) as usize;
    let query = request.query.as_deref().unwrap_or_default().trim();
    let pattern = format!("%{}%", escape_like(&query.to_lowercase()));
    let artist_limit = if kind == "all" {
        limit.div_ceil(2)
    } else {
        limit
    };
    let album_limit = if kind == "all" { limit / 2 } else { limit };
    let mut options = Vec::new();

    if kind != "album" {
        let artist_key = artist_key_sql("album.album_artist_display");
        let representative_key = artist_key_sql("candidate.album_artist_display");
        let artist_sql = format!(
            "WITH grouped AS (
                SELECT {artist_key} AS artist_key,
                       COALESCE(MIN(NULLIF(TRIM(album.album_artist_display), '')), 'Unknown Artist') AS artist_name,
                       COUNT(*) AS album_count,
                       COALESCE(MIN(NULLIF(TRIM(album.canonical_genre), '')), 'Genre unknown') AS genre
                FROM albums album
                GROUP BY {artist_key}
             )
             SELECT grouped.artist_key, grouped.artist_name, grouped.album_count, grouped.genre,
                    (
                        SELECT cover.cache_path
                        FROM albums candidate
                        JOIN album_covers cover ON cover.album_id = candidate.id
                        WHERE {representative_key} = grouped.artist_key
                        ORDER BY candidate.album_score DESC, candidate.year ASC, candidate.id ASC
                        LIMIT 1
                    )
             FROM grouped
             WHERE unicode_lower(grouped.artist_name) LIKE ?1 ESCAPE '\\'
             ORDER BY grouped.album_count DESC, unicode_lower(grouped.artist_name), grouped.artist_key
             LIMIT ?2"
        );
        let artist_options = conn
            .prepare(&artist_sql)?
            .query_map(params![pattern, artist_limit as i64], |row| {
                let album_count = row.get::<_, i64>(2)?;
                let genre = row.get::<_, String>(3)?;
                Ok(DiscoveryMixerSeedOption {
                    kind: "artist".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    subtitle: format!(
                        "{album_count} {} · {genre}",
                        if album_count == 1 { "album" } else { "albums" }
                    ),
                    artist: None,
                    cover_path: row.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        options.extend(artist_options);
    }

    if kind != "artist" {
        let album_options = conn
            .prepare(
                "SELECT album.id,
                        COALESCE(NULLIF(TRIM(album.album), ''), 'Untitled album'),
                        COALESCE(NULLIF(TRIM(album.album_artist_display), ''), 'Unknown Artist'),
                        album.year,
                        COALESCE(NULLIF(TRIM(album.canonical_genre), ''), 'Genre unknown'),
                        cover.cache_path
                 FROM albums album
                 LEFT JOIN album_covers cover ON cover.album_id = album.id
                 WHERE unicode_lower(COALESCE(album.album, '')) LIKE ?1 ESCAPE '\\'
                    OR unicode_lower(COALESCE(album.album_artist_display, '')) LIKE ?1 ESCAPE '\\'
                 ORDER BY album.album_score IS NULL, album.album_score DESC,
                          unicode_lower(COALESCE(album.album, '')), album.id
                 LIMIT ?2",
            )?
            .query_map(params![pattern, album_limit as i64], |row| {
                let artist = row.get::<_, String>(2)?;
                let year = row.get::<_, Option<i32>>(3)?;
                let genre = row.get::<_, String>(4)?;
                Ok(DiscoveryMixerSeedOption {
                    kind: "album".to_string(),
                    id: row.get(0)?,
                    title: row.get(1)?,
                    subtitle: format!(
                        "{artist}{} · {genre}",
                        year.map(|value| format!(" · {value}")).unwrap_or_default()
                    ),
                    artist: Some(artist),
                    cover_path: row.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        options.extend(album_options);
    }

    options.truncate(limit);
    Ok(options)
}

pub(super) fn discovery_mixer_seed_data(
    conn: &Connection,
    input: &DiscoveryMixerSeedInput,
) -> Result<DiscoveryMixerSeedData> {
    match input.kind.as_str() {
        "album" => {
            let artist_key = artist_key_sql("album.album_artist_display");
            conn.query_row(
                &format!(
                    "SELECT album.id,
                            COALESCE(NULLIF(TRIM(album.album), ''), 'Untitled album'),
                            COALESCE(NULLIF(TRIM(album.album_artist_display), ''), 'Unknown Artist'),
                            {artist_key},
                            COALESCE(album.genre_normalized, ''),
                            COALESCE(NULLIF(TRIM(album.canonical_genre), ''), 'Genre unknown'),
                            album.year, cover.cache_path
                     FROM albums album
                     LEFT JOIN album_covers cover ON cover.album_id = album.id
                     WHERE album.id = ?1"
                ),
                [input.id.trim()],
                |row| {
                    let id = row.get::<_, String>(0)?;
                    let title = row.get::<_, String>(1)?;
                    let artist = row.get::<_, String>(2)?;
                    let genre = row.get::<_, String>(5)?;
                    let year = row.get::<_, Option<i32>>(6)?;
                    Ok(DiscoveryMixerSeedData {
                        option: DiscoveryMixerSeedOption {
                            kind: "album".to_string(),
                            id: id.clone(),
                            title,
                            subtitle: format!(
                                "{artist}{} · {genre}",
                                year.map(|value| format!(" · {value}"))
                                    .unwrap_or_default()
                            ),
                            artist: Some(artist),
                            cover_path: row.get(7)?,
                        },
                        artist_key: row.get(3)?,
                        album_id: Some(id),
                        genre_id: row.get(4)?,
                        genre,
                    })
                },
            )
            .optional()?
            .with_context(|| format!("Could not find mixer album seed {}", input.id))
        }
        "artist" => {
            let artist_key = input.id.trim();
            let grouped_key = artist_key_sql("album.album_artist_display");
            let representative_key = artist_key_sql("candidate.album_artist_display");
            let sql = format!(
                "WITH grouped AS (
                    SELECT {grouped_key} AS artist_key,
                           COALESCE(MIN(NULLIF(TRIM(album.album_artist_display), '')), 'Unknown Artist') AS artist_name,
                           COUNT(*) AS album_count,
                           COALESCE(MIN(NULLIF(TRIM(album.genre_normalized), '')), '') AS genre_id,
                           COALESCE(MIN(NULLIF(TRIM(album.canonical_genre), '')), 'Genre unknown') AS genre
                    FROM albums album
                    WHERE {grouped_key} = ?1
                    GROUP BY {grouped_key}
                 )
                 SELECT grouped.artist_key, grouped.artist_name, grouped.album_count,
                        grouped.genre_id, grouped.genre,
                        (
                            SELECT cover.cache_path
                            FROM albums candidate
                            JOIN album_covers cover ON cover.album_id = candidate.id
                            WHERE {representative_key} = grouped.artist_key
                            ORDER BY candidate.album_score DESC, candidate.year ASC, candidate.id ASC
                            LIMIT 1
                        )
                 FROM grouped"
            );
            conn.query_row(&sql, [artist_key], |row| {
                let artist_name = row.get::<_, String>(1)?;
                let album_count = row.get::<_, i64>(2)?;
                let genre = row.get::<_, String>(4)?;
                Ok(DiscoveryMixerSeedData {
                    option: DiscoveryMixerSeedOption {
                        kind: "artist".to_string(),
                        id: row.get(0)?,
                        title: artist_name,
                        subtitle: format!(
                            "{album_count} {} · {genre}",
                            if album_count == 1 { "album" } else { "albums" }
                        ),
                        artist: None,
                        cover_path: row.get(5)?,
                    },
                    artist_key: row.get(0)?,
                    album_id: None,
                    genre_id: row.get(3)?,
                    genre,
                })
            })
            .optional()?
            .with_context(|| format!("Could not find mixer artist seed {}", input.id))
        }
        _ => bail!("Mixer seeds must be local artists or albums."),
    }
}

pub(super) fn discovery_mixer(
    conn: &Connection,
    request: &DiscoveryMixerRequest,
) -> Result<DiscoveryMixerResponse> {
    let mut seen_seeds = HashSet::<(String, String)>::new();
    let mut seeds = Vec::new();
    for input in &request.seeds {
        let seed = discovery_mixer_seed_data(conn, input)?;
        let identity = (seed.option.kind.clone(), seed.option.id.clone());
        if seen_seeds.insert(identity) {
            seeds.push(seed);
        }
        if seeds.len() == 8 {
            break;
        }
    }
    if seeds.len() < 2 {
        bail!("Choose at least two different local artists or albums.")
    }
    let explore_percent = request.explore_percent.unwrap_or(50).clamp(0, 100);
    let result_limit = request.limit.unwrap_or(12).clamp(4, 20) as usize;
    let excluded_album_ids = seeds
        .iter()
        .filter_map(|seed| seed.album_id.clone())
        .collect::<HashSet<_>>();
    let excluded_artist_keys = seeds
        .iter()
        .map(|seed| seed.artist_key.clone())
        .collect::<HashSet<_>>();
    let candidate_artist_key = artist_key_sql("album.album_artist_display");
    let candidate_sql = format!(
        "SELECT album.id,
                COALESCE(NULLIF(TRIM(album.album), ''), 'Untitled album'),
                COALESCE(NULLIF(TRIM(album.album_artist_display), ''), 'Unknown Artist'),
                {candidate_artist_key},
                COALESCE(album.genre_normalized, ''),
                COALESCE(NULLIF(TRIM(album.canonical_genre), ''), 'Genre unknown'),
                album.year, cover.cache_path, album.rating_completeness,
                album.loved_tracks, album.album_score
         FROM albums album
         LEFT JOIN album_covers cover ON cover.album_id = album.id
         WHERE album.total_tracks > 0
         ORDER BY album.id"
    );
    let mut candidates = conn
        .prepare(&candidate_sql)?
        .query_map([], |row| {
            let album = row.get::<_, String>(1)?;
            Ok(DiscoveryMixerCandidateData {
                album_id: row.get(0)?,
                album_key: identity::display_key(&album),
                album,
                artist: row.get(2)?,
                artist_key: row.get(3)?,
                genre_id: row.get(4)?,
                genre: row.get(5)?,
                release_year: row.get(6)?,
                cover_path: row.get(7)?,
                rating_completeness: row.get(8)?,
                loved_tracks: row.get(9)?,
                album_score: row.get(10)?,
            })
        })?
        .filter_map(|row| match row {
            Ok(candidate)
                if !excluded_album_ids.contains(&candidate.album_id)
                    && !excluded_artist_keys.contains(&candidate.artist_key) =>
            {
                Some(Ok(candidate))
            }
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut seen_candidate_identities = HashSet::<(String, String)>::new();
    candidates.retain(|candidate| {
        seen_candidate_identities
            .insert((candidate.artist_key.clone(), candidate.album_key.clone()))
    });

    let mut candidates_by_artist = HashMap::<String, Vec<usize>>::new();
    let mut candidates_by_genre = HashMap::<String, Vec<usize>>::new();
    let mut candidates_by_identity = HashMap::<(String, String), usize>::new();
    let mut candidate_by_album_id = HashMap::<String, usize>::new();
    for (index, candidate) in candidates.iter().enumerate() {
        candidates_by_artist
            .entry(candidate.artist_key.clone())
            .or_default()
            .push(index);
        if !candidate.genre_id.is_empty() {
            candidates_by_genre
                .entry(candidate.genre_id.clone())
                .or_default()
                .push(index);
        }
        candidates_by_identity
            .entry((candidate.artist_key.clone(), candidate.album_key.clone()))
            .or_insert(index);
        candidate_by_album_id.insert(candidate.album_id.clone(), index);
    }
    let mut candidates_by_release_mbid = HashMap::<String, usize>::new();
    for row in conn
        .prepare(
            "SELECT release_mbid, local_album_id
             FROM musicbrainz_release_decisions
             WHERE decision = 'include' AND local_album_id IS NOT NULL",
        )?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
    {
        let (mbid, album_id) = row?;
        if let Some(index) = candidate_by_album_id.get(&album_id) {
            candidates_by_release_mbid.insert(mbid.to_lowercase(), *index);
        }
    }
    let mut artist_key_by_mbid = HashMap::<String, String>::new();
    for row in conn
        .prepare(
            "SELECT LOWER(TRIM(mbid)), local_artist_key
             FROM musicbrainz_artist_links
             WHERE NULLIF(TRIM(mbid), '') IS NOT NULL
             UNION ALL
             SELECT LOWER(TRIM(mbid)), local_artist_key
             FROM musicbrainz_artist_infos
             WHERE NULLIF(TRIM(mbid), '') IS NOT NULL",
        )?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
    {
        let (mbid, artist_key) = row?;
        artist_key_by_mbid.insert(mbid, artist_key);
    }

    let mut connections = HashMap::<usize, Vec<DiscoveryMixerConnection>>::new();
    let mut upsert_connection = |candidate_index: usize, connection: DiscoveryMixerConnection| {
        let candidate_connections = connections.entry(candidate_index).or_default();
        if let Some(existing) = candidate_connections
            .iter_mut()
            .find(|existing| existing.seed_index == connection.seed_index)
        {
            if connection.strength > existing.strength {
                *existing = connection;
            }
        } else {
            candidate_connections.push(connection);
        }
    };
    let mut related_stmt = conn.prepare(
        "SELECT candidate_artist_name, candidate_album_title, candidate_album_mbid,
                relationship_score, shared_tags_json
         FROM lastfm_related_albums
         WHERE album_id = ?1 ORDER BY rank LIMIT 40",
    )?;
    let mut similar_stmt = conn.prepare(
        "SELECT similar_artist_name, similar_artist_mbid, match_score
         FROM lastfm_similar_artists
         WHERE artist_key = ?1 ORDER BY rank LIMIT 24",
    )?;
    for (seed_index, seed) in seeds.iter().enumerate() {
        if let Some(album_id) = seed.album_id.as_deref() {
            for row in related_stmt.query_map([album_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })? {
                let (artist, album, mbid, strength, tags_json) = row?;
                let candidate_index = mbid
                    .as_deref()
                    .and_then(|mbid| candidates_by_release_mbid.get(&mbid.to_lowercase()))
                    .copied()
                    .or_else(|| {
                        candidates_by_identity
                            .get(&(identity::artist_key(&artist), identity::display_key(&album)))
                            .copied()
                    });
                let Some(candidate_index) = candidate_index else {
                    continue;
                };
                let tags = serde_json::from_str::<Vec<String>>(&tags_json)
                    .unwrap_or_default()
                    .into_iter()
                    .take(2)
                    .collect::<Vec<_>>();
                let tag_evidence = if tags.is_empty() {
                    String::new()
                } else {
                    format!(" · {}", tags.join(" · "))
                };
                upsert_connection(
                    candidate_index,
                    DiscoveryMixerConnection {
                        seed_index,
                        strength: strength.clamp(0.0, 1.0),
                        reason: "Related album".to_string(),
                        evidence: format!(
                            "Related to {}{} · {}% relationship",
                            seed.option.title,
                            tag_evidence,
                            (strength.clamp(0.0, 1.0) * 100.0).round() as i64
                        ),
                        lastfm_linked: true,
                    },
                );
            }
        }

        for row in similar_stmt.query_map([seed.artist_key.as_str()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, f64>(2)?,
            ))
        })? {
            let (similar_artist, similar_mbid, match_score) = row?;
            let similar_key = similar_mbid
                .as_deref()
                .and_then(|mbid| artist_key_by_mbid.get(&mbid.to_lowercase()))
                .cloned()
                .unwrap_or_else(|| identity::artist_key(&similar_artist));
            let Some(album_indexes) = candidates_by_artist.get(&similar_key) else {
                continue;
            };
            let mut album_indexes = album_indexes.clone();
            album_indexes.sort_by(|left, right| {
                discovery_mixer_preference(&candidates[*right], explore_percent)
                    .partial_cmp(&discovery_mixer_preference(
                        &candidates[*left],
                        explore_percent,
                    ))
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| candidates[*left].album_id.cmp(&candidates[*right].album_id))
            });
            for candidate_index in album_indexes.into_iter().take(3) {
                upsert_connection(
                    candidate_index,
                    DiscoveryMixerConnection {
                        seed_index,
                        strength: match_score.clamp(0.0, 1.0) * 0.9,
                        reason: "Similar artist".to_string(),
                        evidence: format!(
                            "Last.fm links {} to {} · {}% match",
                            candidates[candidate_index].artist,
                            seed.option.title,
                            (match_score.clamp(0.0, 1.0) * 100.0).round() as i64
                        ),
                        lastfm_linked: true,
                    },
                );
            }
        }

        if let Some(genre_indexes) = candidates_by_genre.get(&seed.genre_id) {
            let mut genre_indexes = genre_indexes.clone();
            genre_indexes.sort_by(|left, right| {
                discovery_mixer_preference(&candidates[*right], explore_percent)
                    .partial_cmp(&discovery_mixer_preference(
                        &candidates[*left],
                        explore_percent,
                    ))
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| candidates[*left].album_id.cmp(&candidates[*right].album_id))
            });
            for candidate_index in genre_indexes.into_iter().take(120) {
                upsert_connection(
                    candidate_index,
                    DiscoveryMixerConnection {
                        seed_index,
                        strength: 0.28,
                        reason: "Shared genre".to_string(),
                        evidence: format!("Shares {} with {}", seed.genre, seed.option.title),
                        lastfm_linked: false,
                    },
                );
            }
        }
    }

    let seed_count = seeds.len();
    let mut ranked = connections
        .iter()
        .map(|(candidate_index, candidate_connections)| {
            let candidate = &candidates[*candidate_index];
            let best_strength = candidate_connections
                .iter()
                .map(|connection| connection.strength)
                .fold(0.0_f64, f64::max);
            let mut seed_indices = candidate_connections
                .iter()
                .map(|connection| connection.seed_index)
                .collect::<Vec<_>>();
            seed_indices.sort_unstable();
            seed_indices.dedup();
            let coverage = (seed_indices.len() as f64 / seed_count as f64).clamp(0.0, 1.0);
            DiscoveryMixerRankedCandidate {
                candidate_index: *candidate_index,
                artist_key: candidate.artist_key.clone(),
                score: best_strength * 0.55
                    + discovery_mixer_preference(candidate, explore_percent) * 0.30
                    + coverage * 0.15,
                seed_indices,
            }
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                candidates[left.candidate_index]
                    .album_id
                    .cmp(&candidates[right.candidate_index].album_id)
            })
    });
    let matching_count = ranked.len() as i64;
    let lastfm_linked_count = ranked
        .iter()
        .filter(|ranked| {
            connections[&ranked.candidate_index]
                .iter()
                .any(|connection| connection.lastfm_linked)
        })
        .count() as i64;
    let selected = select_discovery_mixer_candidates(ranked, seed_count, result_limit);
    let recommendations = selected
        .into_iter()
        .map(|ranked| {
            let candidate = &candidates[ranked.candidate_index];
            let mut candidate_connections = connections[&ranked.candidate_index].clone();
            candidate_connections.sort_by(|left, right| {
                right
                    .strength
                    .partial_cmp(&left.strength)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| left.seed_index.cmp(&right.seed_index))
            });
            let strongest = candidate_connections
                .first()
                .expect("mixer candidate has relationship evidence");
            let mut seed_labels = candidate_connections
                .iter()
                .map(|connection| seeds[connection.seed_index].option.title.clone())
                .collect::<Vec<_>>();
            seed_labels.sort();
            seed_labels.dedup();
            let mut evidence = candidate_connections
                .iter()
                .take(3)
                .map(|connection| connection.evidence.clone())
                .collect::<Vec<_>>();
            let completion = (candidate.rating_completeness.clamp(0.0, 1.0) * 100.0).round();
            evidence.push(format!(
                "{} balance signal · {completion:.0}% of tracks rated · {} loved {}",
                if explore_percent < 40 {
                    "Familiar"
                } else if explore_percent > 60 {
                    "Explore"
                } else {
                    "Balanced"
                },
                candidate.loved_tracks,
                if candidate.loved_tracks == 1 {
                    "track"
                } else {
                    "tracks"
                }
            ));
            DiscoveryMixerRecommendation {
                album_id: candidate.album_id.clone(),
                album: candidate.album.clone(),
                artist: candidate.artist.clone(),
                release_year: candidate.release_year,
                genre: candidate.genre.clone(),
                cover_path: candidate.cover_path.clone(),
                rating_completeness: candidate.rating_completeness,
                reason: strongest.reason.clone(),
                seed_labels,
                evidence,
                ranking_score: (ranked.score * 1_000_000.0).round() / 1_000_000.0,
            }
        })
        .collect::<Vec<_>>();
    Ok(DiscoveryMixerResponse {
        seeds: seeds.into_iter().map(|seed| seed.option).collect(),
        explore_percent,
        matching_count,
        lastfm_linked_count,
        recommendations,
        evidence: format!(
            "{} cached Last.fm matches · {} local candidates · duplicate albums and seed artists excluded",
            lastfm_linked_count, matching_count
        ),
    })
}

pub(super) fn discovery_shelf_explorer(
    conn: &Connection,
    request: &DiscoveryShelfExplorerRequest,
) -> Result<DiscoveryShelfExplorerResponse> {
    let shelf = match request.shelf.as_str() {
        "anniversaries" | "life-events" | "charts" | "deep-cuts" | "completion"
        | "recommendations" => request.shelf.as_str(),
        _ => bail!("Unknown discovery shelf: {}", request.shelf),
    };
    let limit = request.limit.unwrap_or(24).clamp(1, 50);
    let offset = request.offset.unwrap_or(0).max(0);
    let seed = request.seed.unwrap_or(7_311_989);
    let query = request
        .query
        .as_deref()
        .map(str::trim)
        .filter(|query| !query.is_empty())
        .map(str::to_lowercase);
    let mut response = DiscoveryShelfExplorerResponse {
        shelf: shelf.to_string(),
        title: String::new(),
        evidence_note: String::new(),
        total: 0,
        limit,
        offset,
        seed,
        anniversary_years: None,
        event_type: None,
        source: None,
        source_label: None,
        year: None,
        week: None,
        decade: None,
        genre: None,
        mode: None,
        connection: None,
        query: query.clone(),
        sort: request.sort.clone().unwrap_or_default(),
        available_years: Vec::new(),
        available_weeks: Vec::new(),
        available_genres: Vec::new(),
        anniversaries: Vec::new(),
        life_events: Vec::new(),
        chart_stories: Vec::new(),
        deep_cuts: Vec::new(),
        artist_completions: Vec::new(),
        album_completions: Vec::new(),
        recommendations: Vec::new(),
        anchors: Vec::new(),
    };

    match shelf {
        "anniversaries" => {
            let date = request
                .date
                .as_deref()
                .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                .unwrap_or_else(|| Local::now().date_naive());
            let years = request.anniversary_years.unwrap_or(50).clamp(1, 100);
            let source = match request.source.as_deref() {
                Some("billboard" | "official-uk" | "vg-lista" | "uncharted") => {
                    request.source.as_deref().unwrap_or("all")
                }
                _ => "all",
            };
            let sort = match request.sort.as_deref() {
                Some("artist" | "album") => request.sort.as_deref().unwrap_or("chart"),
                _ => "chart",
            };
            let mut stories = discovery_anniversaries_all(conn, date, years)?
                .into_iter()
                .filter(|story| match source {
                    "billboard" => story
                        .chart_evidence
                        .iter()
                        .any(|evidence| evidence.starts_with("Billboard")),
                    "official-uk" => story
                        .chart_evidence
                        .iter()
                        .any(|evidence| evidence.starts_with("Official UK")),
                    "vg-lista" => story
                        .chart_evidence
                        .iter()
                        .any(|evidence| evidence.starts_with("VG-lista")),
                    "uncharted" => story.chart_evidence.is_empty(),
                    _ => true,
                })
                .filter(|story| {
                    explorer_matches(
                        query.as_deref(),
                        &[&story.album, &story.artist, &story.evidence],
                    )
                })
                .collect::<Vec<_>>();
            match sort {
                "artist" => stories.sort_by(|left, right| {
                    left.artist
                        .to_lowercase()
                        .cmp(&right.artist.to_lowercase())
                        .then_with(|| left.album.to_lowercase().cmp(&right.album.to_lowercase()))
                }),
                "album" => stories.sort_by(|left, right| {
                    left.album
                        .to_lowercase()
                        .cmp(&right.album.to_lowercase())
                        .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
                }),
                _ => {}
            }
            response.title = format!("{years}-Year Album Anniversaries");
            response.evidence_note = format!(
                "Owned albums released in {}. Imported Billboard, Official UK, and VG-lista positions rank charted albums first; local ratings only break ties and fill gaps.",
                date.year() - years
            );
            response.total = stories.len() as i64;
            response.anniversary_years = Some(years);
            response.source = Some(source.to_string());
            response.sort = sort.to_string();
            response.anniversaries = explorer_page(&stories, offset, limit);
        }
        "life-events" => {
            let date = request
                .date
                .as_deref()
                .and_then(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").ok())
                .unwrap_or_else(|| Local::now().date_naive());
            let event_type = if request.event_type.as_deref() == Some("memorial") {
                "memorial"
            } else {
                "birthday"
            };
            let sort = match request.sort.as_deref() {
                Some("loved" | "name" | "year") => request.sort.as_deref().unwrap_or("albums"),
                _ => "albums",
            };
            let mut stories = discovery_life_events_all(conn, date)?
                .into_iter()
                .filter(|story| story.event_type == event_type)
                .filter(|story| {
                    explorer_matches(
                        query.as_deref(),
                        &[&story.artist, &story.event_date, &story.evidence],
                    )
                })
                .collect::<Vec<_>>();
            match sort {
                "loved" => stories.sort_by(|left, right| {
                    right
                        .loved_tracks
                        .cmp(&left.loved_tracks)
                        .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
                }),
                "name" => stories.sort_by_key(|story| story.artist.to_lowercase()),
                "year" => stories.sort_by(|left, right| {
                    right
                        .event_date
                        .cmp(&left.event_date)
                        .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
                }),
                _ => stories.sort_by(|left, right| {
                    right
                        .album_count
                        .cmp(&left.album_count)
                        .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
                }),
            }
            response.title = if event_type == "birthday" {
                "Artist Birthdays".to_string()
            } else {
                "Artist Memorials".to_string()
            };
            response.evidence_note = format!(
                "MusicBrainz person records whose {} date matches {}. Library album and loved-track counts provide the local evidence.",
                if event_type == "birthday" { "birth" } else { "death" },
                date.format("%B %-d")
            );
            response.total = stories.len() as i64;
            response.event_type = Some(event_type.to_string());
            response.sort = sort.to_string();
            response.life_events = explorer_page(&stories, offset, limit);
        }
        "charts" => {
            let snapshot = discovery_chart_snapshot(
                conn,
                &DiscoveryChartSnapshotRequest {
                    source: request.source.clone(),
                    year: request.year,
                    week: request.week,
                    random: false,
                },
            )?;
            let sort = match request.sort.as_deref() {
                Some("artist" | "album") => request.sort.as_deref().unwrap_or("rank"),
                _ => "rank",
            };
            let mut stories = if let Some(year) = snapshot.year {
                discovery_chart_stories(
                    conn,
                    &snapshot.source,
                    &snapshot.source_label,
                    year,
                    snapshot.week,
                )?
            } else {
                Vec::new()
            }
            .into_iter()
            .filter(|story| {
                explorer_matches(
                    query.as_deref(),
                    &[&story.title, &story.artist, &story.chart, &story.evidence],
                )
            })
            .collect::<Vec<_>>();
            match sort {
                "artist" => stories.sort_by(|left, right| {
                    left.artist
                        .to_lowercase()
                        .cmp(&right.artist.to_lowercase())
                        .then_with(|| left.rank.cmp(&right.rank))
                }),
                "album" => stories.sort_by(|left, right| {
                    left.title
                        .to_lowercase()
                        .cmp(&right.title.to_lowercase())
                        .then_with(|| left.rank.cmp(&right.rank))
                }),
                _ => stories.sort_by_key(|story| story.rank),
            }
            response.title = "Chart Toppers From…".to_string();
            response.evidence_note = "Imported album-chart rows matched to albums you own; duplicate chart rows collapse to each album's best position for the selected period.".to_string();
            response.total = stories.len() as i64;
            response.source = Some(snapshot.source);
            response.source_label = Some(snapshot.source_label);
            response.year = snapshot.year;
            response.week = snapshot.week;
            response.available_years = snapshot.available_years;
            response.available_weeks = snapshot.available_weeks;
            response.sort = sort.to_string();
            response.chart_stories = explorer_page(&stories, offset, limit);
        }
        "deep-cuts" => {
            let snapshot = discovery_deep_cut_snapshot_with_scope(
                conn,
                &DiscoveryDeepCutSnapshotRequest {
                    year: request.year,
                    decade: request.decade,
                    genre: request.genre.clone(),
                },
                true,
            )?;
            let sort = match request.sort.as_deref() {
                Some("newest" | "artist" | "track") => request.sort.as_deref().unwrap_or("rating"),
                _ => "rating",
            };
            let mut stories = snapshot
                .stories
                .into_iter()
                .filter(|story| {
                    explorer_matches(
                        query.as_deref(),
                        &[
                            &story.title,
                            &story.album,
                            &story.artist,
                            &story.genre,
                            &story.evidence,
                        ],
                    )
                })
                .collect::<Vec<_>>();
            match sort {
                "newest" => stories.sort_by(|left, right| {
                    right
                        .release_year
                        .cmp(&left.release_year)
                        .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
                }),
                "artist" => stories.sort_by(|left, right| {
                    left.artist
                        .to_lowercase()
                        .cmp(&right.artist.to_lowercase())
                        .then_with(|| left.album.to_lowercase().cmp(&right.album.to_lowercase()))
                }),
                "track" => stories.sort_by_key(|story| story.title.to_lowercase()),
                _ => stories.sort_by(|left, right| {
                    right
                        .album_rating
                        .cmp(&left.album_rating)
                        .then_with(|| left.artist.to_lowercase().cmp(&right.artist.to_lowercase()))
                }),
            }
            response.title = "Deep Cuts".to_string();
            response.evidence_note = "One unrated, unloved, non-opening track per album rated 85 or higher, excluding tracks found in any imported singles chart.".to_string();
            response.total = stories.len() as i64;
            response.year = snapshot.year;
            response.decade = snapshot.decade;
            response.genre = snapshot.genre;
            response.available_years = snapshot.available_years;
            response.available_genres = snapshot.available_genres;
            response.sort = sort.to_string();
            response.deep_cuts = explorer_page(&stories, offset, limit);
        }
        "completion" => {
            let mode = if request.mode.as_deref() == Some("album") {
                "album"
            } else {
                "artist"
            };
            let completion_request = DiscoveryCompletionSnapshotRequest {
                mode: Some(mode.to_string()),
                year: request.year,
                decade: request.decade,
                genre: request.genre.clone(),
            };
            let snapshot = if mode == "album" {
                discovery_album_completion_snapshot_with_scope(conn, &completion_request, true)?
            } else {
                discovery_artist_completion_snapshot_with_scope(
                    conn,
                    &completion_request,
                    true,
                    Some(seed as u64),
                )?
            };
            response.title = "Complete the Collection".to_string();
            response.year = snapshot.year;
            response.decade = snapshot.decade;
            response.genre = snapshot.genre;
            response.available_years = snapshot.available_years;
            response.available_genres = snapshot.available_genres;
            response.mode = Some(mode.to_string());
            if mode == "album" {
                let sort = match request.sort.as_deref() {
                    Some("least-complete" | "newest" | "artist" | "album") => {
                        request.sort.as_deref().unwrap_or("most-unrated")
                    }
                    _ => "most-unrated",
                };
                let mut stories = snapshot
                    .album_stories
                    .into_iter()
                    .filter(|story| {
                        explorer_matches(
                            query.as_deref(),
                            &[&story.album, &story.artist, &story.genre, &story.evidence],
                        )
                    })
                    .collect::<Vec<_>>();
                match sort {
                    "least-complete" => stories.sort_by(|left, right| {
                        left.completion_percent
                            .partial_cmp(&right.completion_percent)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    }),
                    "newest" => {
                        stories.sort_by(|left, right| right.release_year.cmp(&left.release_year))
                    }
                    "artist" => stories.sort_by_key(|story| story.artist.to_lowercase()),
                    "album" => stories.sort_by_key(|story| story.album.to_lowercase()),
                    _ => stories
                        .sort_by(|left, right| right.unrated_tracks.cmp(&left.unrated_tracks)),
                }
                response.evidence_note = "Owned albums with at least one unrated track. Completion is calculated directly from rated and total track counts.".to_string();
                response.total = stories.len() as i64;
                response.sort = sort.to_string();
                response.album_completions = explorer_page(&stories, offset, limit);
            } else {
                let sort = match request.sort.as_deref() {
                    Some("least-complete" | "artist" | "missing-year") => {
                        request.sort.as_deref().unwrap_or("most-missing")
                    }
                    _ => "most-missing",
                };
                let mut stories = snapshot
                    .artist_stories
                    .into_iter()
                    .filter(|story| {
                        explorer_matches(
                            query.as_deref(),
                            &[
                                &story.artist,
                                &story.missing_release_title,
                                &story.genre,
                                &story.evidence,
                            ],
                        )
                    })
                    .collect::<Vec<_>>();
                match sort {
                    "least-complete" => stories.sort_by(|left, right| {
                        left.completion_percent
                            .partial_cmp(&right.completion_percent)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    }),
                    "artist" => stories.sort_by_key(|story| story.artist.to_lowercase()),
                    "missing-year" => stories.sort_by(|left, right| {
                        right.missing_release_year.cmp(&left.missing_release_year)
                    }),
                    _ => stories.sort_by(|left, right| {
                        right.missing_album_count.cmp(&left.missing_album_count)
                    }),
                }
                response.evidence_note = "Official primary-album release groups from the local MusicBrainz cache compared with owned titles and saved release decisions.".to_string();
                response.total = stories.len() as i64;
                response.sort = sort.to_string();
                response.artist_completions = explorer_page(&stories, offset, limit);
            }
        }
        "recommendations" => {
            let mode = if request.mode.as_deref() == Some("loved") {
                "loved"
            } else {
                "played"
            };
            let connection = match request.connection.as_deref() {
                Some("lastfm" | "related" | "similar" | "genre") => {
                    request.connection.as_deref().unwrap_or("all")
                }
                _ => "all",
            };
            let snapshot = discovery_recommendation_snapshot_with_scope(
                conn,
                &DiscoveryRecommendationSnapshotRequest {
                    mode: Some(mode.to_string()),
                },
                usize::MAX,
                Some(seed as u64),
            )?;
            let sort = match request.sort.as_deref() {
                Some("least-rated" | "artist" | "album") => {
                    request.sort.as_deref().unwrap_or("relevance")
                }
                _ => "relevance",
            };
            let mut stories = snapshot
                .stories
                .into_iter()
                .filter(|story| match connection {
                    "lastfm" => story.reason != "Shared genre",
                    "related" => story.reason == "Related album",
                    "similar" => story.reason == "Similar artist",
                    "genre" => story.reason == "Shared genre",
                    _ => true,
                })
                .filter(|story| {
                    explorer_matches(
                        query.as_deref(),
                        &[
                            &story.album,
                            &story.artist,
                            &story.anchor_album,
                            &story.anchor_artist,
                            &story.evidence,
                        ],
                    )
                })
                .collect::<Vec<_>>();
            match sort {
                "least-rated" => stories.sort_by(|left, right| {
                    left.rating_completeness
                        .partial_cmp(&right.rating_completeness)
                        .unwrap_or(std::cmp::Ordering::Equal)
                }),
                "artist" => stories.sort_by_key(|story| story.artist.to_lowercase()),
                "album" => stories.sort_by_key(|story| story.album.to_lowercase()),
                _ => {}
            }
            response.title = if mode == "played" {
                "Because You Played…".to_string()
            } else {
                "Because You Loved…".to_string()
            };
            response.evidence_note = format!(
                "{} from up to eight mixed album anchors; candidates are under 50% rated and exclude recent albums plus every anchor artist.",
                if mode == "played" {
                    "Recent positive rating activity is treated as listening evidence"
                } else {
                    "High album scores and loved tracks provide the listening signal"
                }
            );
            response.total = stories.len() as i64;
            response.mode = Some(mode.to_string());
            response.connection = Some(connection.to_string());
            response.sort = sort.to_string();
            response.recommendations = explorer_page(&stories, offset, limit);
            response.anchors = snapshot.anchors;
        }
        _ => unreachable!(),
    }

    Ok(response)
}

pub(super) fn explorer_matches(query: Option<&str>, values: &[&str]) -> bool {
    query.is_none_or(|query| {
        values
            .iter()
            .any(|value| value.to_lowercase().contains(query))
    })
}

pub(super) fn explorer_page<T: Clone>(items: &[T], offset: i64, limit: i64) -> Vec<T> {
    items
        .iter()
        .skip(offset as usize)
        .take(limit as usize)
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn discovery_shelf_explorer_pages_filters_sorts_and_keeps_row_evidence() {
        let conn = seeded_connection();
        for index in 0..5 {
            let album_id = format!("explorer-deep-{index}");
            let artist = format!("Explorer Artist {index}");
            let album = format!("Explorer Album {index}");
            insert_test_album(&conn, &album_id, &artist, &album, 1980 + index, 10);
            conn.execute(
                "UPDATE albums SET effective_album_rating = ?2 WHERE id = ?1",
                params![album_id, 90 + index],
            )
            .expect("rate explorer album");
            conn.execute(
                "INSERT INTO tracks (
                    import_run_id, album_id, album_unique_id, display_artist,
                    album_artist_display, album, title, canonical_genre,
                    genre_normalized, normalized_rating, track_number, year,
                    release_year, time_seconds, row_hash
                 ) VALUES (
                    1, ?1, ?1, ?2, ?2, ?3, ?4, 'Rock', 'rock', NULL, 3,
                    ?5, ?5, 240, ?6
                 )",
                params![
                    album_id,
                    artist,
                    album,
                    format!("Explorer Track {index}"),
                    1980 + index,
                    format!("explorer-track-{index}"),
                ],
            )
            .expect("insert explorer track");
        }

        let mut first_request = shelf_explorer_request("deep-cuts");
        first_request.genre = Some("rock".to_string());
        first_request.sort = Some("artist".to_string());
        first_request.limit = Some(2);
        let first =
            discovery_shelf_explorer(&conn, &first_request).expect("load first explorer page");
        assert_eq!(first.total, 5);
        assert_eq!(first.deep_cuts.len(), 2);
        assert_eq!(first.offset, 0);
        assert!(first
            .deep_cuts
            .iter()
            .all(|story| story.evidence.contains("track unrated")
                && story.evidence.contains("no imported singles-chart match")));
        assert!(first.deep_cuts[0].artist < first.deep_cuts[1].artist);

        let mut second_request = first_request.clone();
        second_request.offset = Some(2);
        let second =
            discovery_shelf_explorer(&conn, &second_request).expect("load second explorer page");
        assert_eq!(second.total, first.total);
        assert_eq!(second.offset, 2);
        assert_eq!(second.seed, first.seed);
        assert!(first.deep_cuts.iter().all(|first_story| second
            .deep_cuts
            .iter()
            .all(|second_story| first_story.album_id != second_story.album_id)));

        let mut filtered_request = first_request;
        filtered_request.query = Some("Explorer Artist 4".to_string());
        filtered_request.offset = Some(0);
        let filtered =
            discovery_shelf_explorer(&conn, &filtered_request).expect("filter explorer page");
        assert_eq!(filtered.total, 1);
        assert_eq!(filtered.deep_cuts[0].artist, "Explorer Artist 4");
        assert_eq!(filtered.sort, "artist");
        assert_eq!(filtered.genre.as_deref(), Some("rock"));
    }

    #[test]
    fn discovery_mixer_seed_search_returns_local_artists_and_albums() {
        let conn = seeded_connection();
        insert_discovery_mixer_fixtures(&conn);

        let options = discovery_mixer_seed_options(
            &conn,
            &DiscoveryMixerSeedSearchRequest {
                query: Some("seed artist a".to_string()),
                kind: None,
                limit: Some(12),
            },
        )
        .expect("search mixer seeds");

        assert!(options
            .iter()
            .any(|option| option.kind == "artist" && option.title == "Seed Artist A"));
        assert!(options.iter().any(|option| {
            option.kind == "album" && option.artist.as_deref() == Some("Seed Artist A")
        }));
    }

    #[test]
    fn discovery_mixer_uses_local_genres_when_relationship_caches_are_empty() {
        let conn = seeded_connection();
        insert_test_album(
            &conn,
            "offline-seed",
            "Offline Seed Artist",
            "Offline Seed",
            1990,
            10,
        );
        insert_test_album(
            &conn,
            "offline-synthpop",
            "Offline Candidate A",
            "Local Synthpop",
            1991,
            10,
        );
        insert_test_album(
            &conn,
            "offline-rock",
            "Offline Candidate B",
            "Local Rock",
            1992,
            10,
        );
        conn.execute_batch(
            "UPDATE albums SET canonical_genre = 'Synthpop', genre_normalized = 'synthpop'
             WHERE id = 'offline-synthpop';
             UPDATE albums SET canonical_genre = 'Rock', genre_normalized = 'rock'
             WHERE id IN ('offline-seed', 'offline-rock');",
        )
        .expect("set offline mixer genres");

        let response = discovery_mixer(
            &conn,
            &DiscoveryMixerRequest {
                seeds: vec![
                    DiscoveryMixerSeedInput {
                        kind: "album".to_string(),
                        id: "mb:test".to_string(),
                    },
                    DiscoveryMixerSeedInput {
                        kind: "album".to_string(),
                        id: "offline-seed".to_string(),
                    },
                ],
                explore_percent: Some(50),
                limit: Some(8),
            },
        )
        .expect("build offline mixer");

        let ids = response
            .recommendations
            .iter()
            .map(|item| item.album_id.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(response.lastfm_linked_count, 0);
        assert!(ids.contains("offline-synthpop"));
        assert!(ids.contains("offline-rock"));
        assert!(response
            .recommendations
            .iter()
            .all(|item| item.reason == "Shared genre"));
    }
}
