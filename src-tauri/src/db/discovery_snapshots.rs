use super::*;

pub(super) fn discovery_chart_snapshot(
    conn: &Connection,
    request: &DiscoveryChartSnapshotRequest,
) -> Result<DiscoveryChartSnapshot> {
    let sources = ["billboard", "official-uk", "vg-lista"];
    let requested_source = request.source.as_deref().unwrap_or_default();
    let mut available_sources = Vec::new();
    for source in sources {
        if !discovery_chart_years(conn, source)?.is_empty() {
            available_sources.push(source);
        }
    }
    let source = if available_sources.is_empty() {
        "billboard"
    } else if request.random {
        available_sources[discovery_random_index(conn, available_sources.len())?]
    } else if available_sources.contains(&requested_source) {
        requested_source
    } else {
        available_sources[0]
    };
    let available_years = discovery_chart_years(conn, source)?;
    let year = if available_years.is_empty() {
        None
    } else if request.random {
        Some(available_years[discovery_random_index(conn, available_years.len())?])
    } else {
        request
            .year
            .filter(|year| available_years.contains(year))
            .or_else(|| available_years.first().copied())
    };
    let available_weeks = if source == "billboard" {
        Vec::new()
    } else if let Some(year) = year {
        discovery_chart_weeks(conn, source, year)?
    } else {
        Vec::new()
    };
    let week = if available_weeks.is_empty() {
        None
    } else if request.random {
        Some(available_weeks[discovery_random_index(conn, available_weeks.len())?])
    } else {
        request
            .week
            .filter(|week| available_weeks.contains(week))
            .or_else(|| available_weeks.first().copied())
    };
    let source_label = match source {
        "official-uk" => "Official UK Albums",
        "vg-lista" => "VG-lista Albums",
        _ => "Billboard Year-End Albums",
    }
    .to_string();
    let mut stories = if let Some(year) = year {
        discovery_chart_stories(conn, source, &source_label, year, week)?
    } else {
        Vec::new()
    };
    stories.truncate(12);

    Ok(DiscoveryChartSnapshot {
        source: source.to_string(),
        source_label,
        year,
        week,
        available_years,
        available_weeks,
        stories,
    })
}

pub(super) fn discovery_random_index(conn: &Connection, length: usize) -> Result<usize> {
    let value = conn.query_row("SELECT random()", [], |row| row.get::<_, i64>(0))?;
    Ok((value.unsigned_abs() as usize) % length)
}

pub(super) fn discovery_random_sort_key(seed: u64, value: &str) -> u64 {
    value
        .bytes()
        .fold(1_469_598_103_934_665_603_u64 ^ seed, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(1_099_511_628_211)
        })
}

pub(super) fn discovery_chart_years(conn: &Connection, source: &str) -> Result<Vec<i32>> {
    let table = match source {
        "official-uk" => "official_uk_album_chart_entries",
        "vg-lista" => "vg_lista_album_chart_entries",
        _ => "billboard_chart_entries",
    };
    let sql = format!(
        "SELECT DISTINCT entry.year FROM {table} entry JOIN albums a ON a.id = entry.matched_album_id ORDER BY entry.year DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let years = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery chart years")?;
    Ok(years)
}

pub(super) fn discovery_chart_weeks(
    conn: &Connection,
    source: &str,
    year: i32,
) -> Result<Vec<i32>> {
    let table = match source {
        "official-uk" => "official_uk_album_chart_entries",
        _ => "vg_lista_album_chart_entries",
    };
    let sql = format!(
        "SELECT DISTINCT entry.week FROM {table} entry JOIN albums a ON a.id = entry.matched_album_id WHERE entry.year = ?1 ORDER BY entry.week ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let weeks = stmt
        .query_map(params![year], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery chart weeks")?;
    Ok(weeks)
}

pub(super) fn discovery_chart_stories(
    conn: &Connection,
    source: &str,
    source_label: &str,
    year: i32,
    week: Option<i32>,
) -> Result<Vec<DiscoveryChartStory>> {
    let (table, title_column, date_column, period_clause) = match source {
        "official-uk" => (
            "official_uk_album_chart_entries",
            "title",
            "chart_date",
            "entry.year = ?1 AND entry.week = ?2",
        ),
        "vg-lista" => (
            "vg_lista_album_chart_entries",
            "title",
            "week_date",
            "entry.year = ?1 AND entry.week = ?2",
        ),
        _ => (
            "billboard_chart_entries",
            "album",
            "first_appearance",
            "entry.year = ?1",
        ),
    };
    let sql = format!(
        "
        WITH ranked AS (
            SELECT a.id, COALESCE(NULLIF(TRIM(a.album), ''), entry.{title_column}) AS title,
                   COALESCE(NULLIF(TRIM(a.album_artist_display), ''), entry.artist) AS artist,
                   a.album, entry.rank, entry.{date_column} AS chart_date,
                   CASE WHEN a.loved_tracks > 0 THEN 1 ELSE 0 END AS loved,
                   cover.cache_path,
                   ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY entry.rank ASC, entry.id ASC) AS story_rank
            FROM {table} entry
            JOIN albums a ON a.id = entry.matched_album_id
            LEFT JOIN album_covers cover ON cover.album_id = a.id
            WHERE {period_clause}
        )
        SELECT id, title, artist, album, rank, chart_date, loved, cache_path
        FROM ranked WHERE story_rank = 1
        ORDER BY rank ASC, LOWER(artist), LOWER(title)
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    let mapper = |row: &rusqlite::Row<'_>| {
        let rank: i32 = row.get(4)?;
        Ok(DiscoveryChartStory {
            entity: "album".to_string(),
            album_id: row.get(0)?,
            track_id: None,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            chart: source_label.to_string(),
            rank,
            chart_date: row.get(5)?,
            chart_year: year,
            loved: row.get::<_, i64>(6)? != 0,
            cover_path: row.get(7)?,
            evidence: format!("#{rank} on {source_label} · owned album"),
        })
    };
    let stories = if source == "billboard" {
        stmt.query_map(params![year], mapper)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map(params![year, week.unwrap_or(1)], mapper)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };
    Ok(stories)
}

pub(super) fn discovery_deep_cut_snapshot(
    conn: &Connection,
    request: &DiscoveryDeepCutSnapshotRequest,
) -> Result<DiscoveryDeepCutSnapshot> {
    discovery_deep_cut_snapshot_with_scope(conn, request, false)
}

pub(super) fn discovery_deep_cut_snapshot_with_scope(
    conn: &Connection,
    request: &DiscoveryDeepCutSnapshotRequest,
    include_all: bool,
) -> Result<DiscoveryDeepCutSnapshot> {
    const ELIGIBLE_TRACK: &str = "
        a.effective_album_rating >= 85
        AND t.normalized_rating IS NULL
        AND NULLIF(TRIM(COALESCE(t.love, '')), '') IS NULL
        AND t.billboard_single_rank IS NULL
        AND t.vg_lista_rank IS NULL
        AND t.official_uk_rank IS NULL
        AND t.ti_i_skuddet_rank IS NULL
        AND t.norsktoppen_rank IS NULL
        AND COALESCE(t.track_number, 2) > 1
    ";
    const RELEASE_YEAR: &str = "COALESCE(a.release_year, a.year)";
    const GENRE_ID: &str =
        "COALESCE(NULLIF(TRIM(a.genre_normalized), ''), NULLIF(TRIM(t.genre_normalized), ''))";

    let years_sql = format!(
        "SELECT DISTINCT {RELEASE_YEAR}
         FROM tracks t JOIN albums a ON a.id = t.album_id
         WHERE {ELIGIBLE_TRACK} AND {RELEASE_YEAR} IS NOT NULL
         ORDER BY {RELEASE_YEAR} DESC"
    );
    let available_years = conn
        .prepare(&years_sql)?
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load deep-cut years")?;

    let genres_sql = format!(
        "SELECT {GENRE_ID},
                COALESCE(MIN(NULLIF(TRIM(a.canonical_genre), '')), MIN(NULLIF(TRIM(t.canonical_genre), '')), {GENRE_ID})
         FROM tracks t JOIN albums a ON a.id = t.album_id
         WHERE {ELIGIBLE_TRACK} AND {GENRE_ID} IS NOT NULL
         GROUP BY {GENRE_ID}
         ORDER BY LOWER(COALESCE(MIN(NULLIF(TRIM(a.canonical_genre), '')), MIN(NULLIF(TRIM(t.canonical_genre), '')), {GENRE_ID}))"
    );
    let available_genres = conn
        .prepare(&genres_sql)?
        .query_map([], |row| {
            Ok(DiscoveryDeepCutGenre {
                id: row.get(0)?,
                label: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load deep-cut genres")?;

    let year = request.year.filter(|year| available_years.contains(year));
    let decade = if year.is_none() {
        request.decade.map(|decade| decade.div_euclid(10) * 10)
    } else {
        None
    };
    let genre = request.genre.as_ref().and_then(|genre| {
        available_genres
            .iter()
            .find(|option| option.id.eq_ignore_ascii_case(genre))
            .map(|option| option.id.clone())
    });

    let mut conditions = vec![ELIGIBLE_TRACK.to_string()];
    let mut values = Vec::new();
    if let Some(year) = year {
        conditions.push(format!("{RELEASE_YEAR} = ?"));
        values.push(Value::Integer(i64::from(year)));
    } else if let Some(decade) = decade {
        conditions.push(format!("{RELEASE_YEAR} >= ? AND {RELEASE_YEAR} < ?"));
        values.push(Value::Integer(i64::from(decade)));
        values.push(Value::Integer(i64::from(decade + 10)));
    }
    if let Some(genre) = genre.as_ref() {
        conditions.push(format!("LOWER({GENRE_ID}) = LOWER(?)"));
        values.push(Value::Text(genre.clone()));
    }
    let where_clause = conditions.join(" AND ");
    let count_sql = format!(
        "SELECT COUNT(DISTINCT a.id)
         FROM tracks t JOIN albums a ON a.id = t.album_id
         WHERE {where_clause}"
    );
    let matching_album_count =
        conn.query_row(&count_sql, params_from_iter(values.iter()), |row| {
            row.get(0)
        })?;

    let selected_album_order = if include_all {
        "ORDER BY LOWER(COALESCE(a.album_artist_display, '')), LOWER(COALESCE(a.album, ''))"
    } else {
        "ORDER BY random() LIMIT 16"
    };
    let candidate_order = if include_all {
        "COALESCE(t.track_number, 0) DESC, t.id ASC"
    } else {
        "random()"
    };
    let story_order = if include_all {
        "ORDER BY LOWER(artist), LOWER(album), LOWER(title)"
    } else {
        "ORDER BY random() LIMIT 16"
    };
    let stories_sql = format!(
        "WITH selected_albums AS (
            SELECT DISTINCT a.id
            FROM tracks t
            JOIN albums a ON a.id = t.album_id
            WHERE {where_clause}
            {selected_album_order}
        ),
        candidates AS (
            SELECT
                t.id,
                COALESCE(NULLIF(TRIM(t.title), ''), 'Untitled') AS title,
                a.id AS album_id,
                COALESCE(NULLIF(TRIM(a.album), ''), 'Unknown Album') AS album,
                COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist') AS artist,
                t.track_number,
                t.time_seconds,
                a.effective_album_rating,
                {RELEASE_YEAR} AS release_year,
                COALESCE(NULLIF(TRIM(a.canonical_genre), ''), NULLIF(TRIM(t.canonical_genre), ''), 'Unknown') AS genre,
                cover.cache_path,
                ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY {candidate_order}) AS album_candidate
            FROM tracks t
            JOIN albums a ON a.id = t.album_id
            JOIN selected_albums selected ON selected.id = a.id
            LEFT JOIN album_covers cover ON cover.album_id = a.id
            WHERE {where_clause}
        )
        SELECT id, title, album_id, album, artist, track_number, time_seconds,
               effective_album_rating, release_year, genre, cache_path
        FROM candidates
        WHERE album_candidate = 1
        {story_order}"
    );
    let story_values = values
        .iter()
        .cloned()
        .chain(values.iter().cloned())
        .collect::<Vec<_>>();
    let stories = conn
        .prepare(&stories_sql)?
        .query_map(params_from_iter(story_values.iter()), |row| {
            let album_rating: i32 = row.get(7)?;
            let release_year: Option<i32> = row.get(8)?;
            let genre: String = row.get(9)?;
            let period = release_year
                .map(|year| year.to_string())
                .unwrap_or_else(|| "year unknown".to_string());
            Ok(DiscoveryDeepCutStory {
                track_id: row.get(0)?,
                title: row.get(1)?,
                album_id: row.get(2)?,
                album: row.get(3)?,
                artist: row.get(4)?,
                track_number: row.get(5)?,
                time_seconds: row.get(6)?,
                album_rating,
                release_year,
                genre: genre.clone(),
                cover_path: row.get(10)?,
                evidence: format!(
                    "Album rated {album_rating} · {period} · {genre} · track unrated · no imported singles-chart match"
                ),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load discovery deep cuts")?;

    Ok(DiscoveryDeepCutSnapshot {
        year,
        decade,
        genre,
        available_years,
        available_genres,
        matching_album_count,
        stories,
    })
}

pub(super) fn discovery_completion_snapshot(
    conn: &Connection,
    request: &DiscoveryCompletionSnapshotRequest,
) -> Result<DiscoveryCompletionSnapshot> {
    if request.mode.as_deref() == Some("album") {
        return discovery_album_completion_snapshot_with_scope(conn, request, false);
    }
    discovery_artist_completion_snapshot_with_scope(conn, request, false, None)
}

pub(super) fn discovery_artist_completion_snapshot_with_scope(
    conn: &Connection,
    request: &DiscoveryCompletionSnapshotRequest,
    include_all: bool,
    seed_override: Option<u64>,
) -> Result<DiscoveryCompletionSnapshot> {
    #[derive(Default)]
    struct LocalArtistData {
        titles: HashSet<String>,
        genres: HashMap<String, (String, i64)>,
        representative: Option<(bool, f64, String, String, Option<String>)>,
    }

    struct ArtistCandidate {
        artist_id: String,
        artist: String,
        local_album_count: i64,
        mbids: Vec<String>,
    }

    struct GapCandidate {
        artist_id: String,
        artist: String,
        mbid: String,
        local_album_count: i64,
        owned: i64,
        official: i64,
        missing: Vec<(String, Option<i32>)>,
        genres: HashMap<String, (String, i64)>,
        portrait_available: bool,
        representative_album_id: Option<String>,
        representative_album: Option<String>,
        representative_cover_path: Option<String>,
    }

    let album_artist_key = artist_key_sql("album_artist_display");
    let candidates_sql = format!(
        "WITH artist_stats AS (
            SELECT {album_artist_key} AS artist_id,
                   COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist,
                   COUNT(*) AS album_count
            FROM albums
            WHERE NULLIF(TRIM(COALESCE(album_artist_display, '')), '') IS NOT NULL
            GROUP BY artist_id
            HAVING COUNT(*) >= 3
        )
        SELECT stats.artist_id,
               COALESCE(NULLIF(TRIM(info.display_artist), ''), stats.artist),
               stats.album_count,
               info.mbid,
               CASE WHEN links.ignored = 0 THEN links.mbid END,
               origin.mbid
        FROM artist_stats stats
        LEFT JOIN musicbrainz_artist_infos info ON info.local_artist_key = stats.artist_id
        LEFT JOIN musicbrainz_artist_links links ON links.local_artist_key = stats.artist_id
        LEFT JOIN musicbrainz_artist_origin_countries origin ON origin.local_artist_key = stats.artist_id"
    );
    let candidates = conn
        .prepare(&candidates_sql)?
        .query_map([], |row| {
            let mut mbids = Vec::new();
            for index in 3..=5 {
                if let Some(mbid) = row.get::<_, Option<String>>(index)? {
                    if !mbid.trim().is_empty() && !mbids.iter().any(|item| item == &mbid) {
                        mbids.push(mbid);
                    }
                }
            }
            Ok(ArtistCandidate {
                artist_id: row.get(0)?,
                artist: row.get(1)?,
                local_album_count: row.get(2)?,
                mbids,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let albums_sql = format!(
        "SELECT {album_artist_key}, a.id,
                COALESCE(NULLIF(TRIM(a.album), ''), 'Unknown Album'),
                NULLIF(TRIM(a.genre_normalized), ''),
                NULLIF(TRIM(a.canonical_genre), ''),
                COALESCE(a.album_score, 0), cover.cache_path
         FROM albums a
         LEFT JOIN album_covers cover ON cover.album_id = a.id"
    );
    let mut local_by_artist: HashMap<String, LocalArtistData> = HashMap::new();
    for row in conn.prepare(&albums_sql)?.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, f64>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    })? {
        let (artist_id, album_id, album, genre_id, genre_label, score, cover_path) = row?;
        let local = local_by_artist.entry(artist_id).or_default();
        local.titles.insert(identity::display_key(&album));
        if let Some(genre_id) = genre_id {
            let genre = local
                .genres
                .entry(genre_id.clone())
                .or_insert((genre_label.unwrap_or(genre_id), 0));
            genre.1 += 1;
        }
        let has_cover = cover_path.is_some();
        let replace = local
            .representative
            .as_ref()
            .is_none_or(|current| (has_cover, score) > (current.0, current.1));
        if replace {
            local.representative = Some((has_cover, score, album_id, album, cover_path));
        }
    }

    let mut releases_by_artist: HashMap<String, Vec<(String, String, Option<i32>, Option<bool>)>> =
        HashMap::new();
    for row in conn
        .prepare(
            "SELECT release_group.artist_mbid, release_group.release_mbid,
                    release_group.title, release_group.year,
                    release_status.has_official_release
             FROM musicbrainz_artist_release_groups release_group
             LEFT JOIN musicbrainz_release_status_cache release_status
               ON release_status.artist_mbid = release_group.artist_mbid
              AND release_status.release_mbid = release_group.release_mbid
             WHERE LOWER(COALESCE(release_group.type, '')) = 'album'
               AND TRIM(COALESCE(release_group.secondary_types, '')) = ''
               AND release_group.status = 'Official'",
        )?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i32>>(3)?,
                row.get::<_, Option<i64>>(4)?.map(|value| value != 0),
            ))
        })?
    {
        let (artist_mbid, release_mbid, title, year, has_official_release) = row?;
        releases_by_artist
            .entry(artist_mbid.to_lowercase())
            .or_default()
            .push((release_mbid, title, year, has_official_release));
    }

    let mut decisions = HashMap::new();
    for row in conn
        .prepare(
            "SELECT local_artist_key, release_mbid, decision
             FROM musicbrainz_release_decisions",
        )?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
    {
        let (artist_id, release_mbid, decision) = row?;
        decisions.insert((artist_id, release_mbid), decision);
    }

    let portraits = conn
        .prepare(
            "SELECT artist_key FROM artist_images
             WHERE state = 'available' AND cache_path IS NOT NULL",
        )?
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<HashSet<_>>>()?;

    let mut gaps = Vec::new();
    for candidate in candidates {
        let Some(local) = local_by_artist.get(&candidate.artist_id) else {
            continue;
        };
        let Some(mbid) = candidate.mbids.iter().find(|mbid| {
            releases_by_artist
                .get(&mbid.to_lowercase())
                .is_some_and(|releases| !releases.is_empty())
        }) else {
            continue;
        };
        let releases = &releases_by_artist[&mbid.to_lowercase()];
        let relevant = releases
            .iter()
            .filter(|(release_mbid, _, _, has_official_release)| {
                let decision = decisions
                    .get(&(candidate.artist_id.clone(), release_mbid.clone()))
                    .map(String::as_str);
                !matches!(decision, Some("not-in-scope" | "ignored"))
                    && (decision == Some("include") || *has_official_release != Some(false))
            })
            .collect::<Vec<_>>();
        let missing = relevant
            .iter()
            .filter(|(release_mbid, title, _, _)| {
                !local.titles.contains(&identity::display_key(title))
                    && !matches!(
                        decisions
                            .get(&(candidate.artist_id.clone(), release_mbid.clone()))
                            .map(String::as_str),
                        Some("owned")
                    )
            })
            .map(|(_, title, year, _)| (title.clone(), *year))
            .collect::<Vec<_>>();
        let official = relevant.len() as i64;
        let owned = official - missing.len() as i64;
        if owned < 2 || missing.is_empty() {
            continue;
        }
        let (representative_album_id, representative_album, representative_cover_path) = local
            .representative
            .as_ref()
            .map(|(_, _, album_id, album, cover)| {
                (Some(album_id.clone()), Some(album.clone()), cover.clone())
            })
            .unwrap_or((None, None, None));
        gaps.push(GapCandidate {
            artist_id: candidate.artist_id.clone(),
            artist: candidate.artist,
            mbid: mbid.clone(),
            local_album_count: candidate.local_album_count,
            owned,
            official,
            missing,
            genres: local.genres.clone(),
            portrait_available: portraits.contains(&candidate.artist_id),
            representative_album_id,
            representative_album,
            representative_cover_path,
        });
    }

    let mut available_years = gaps
        .iter()
        .flat_map(|candidate| candidate.missing.iter().filter_map(|(_, year)| *year))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    available_years.sort_unstable_by(|left, right| right.cmp(left));
    let mut genre_labels = HashMap::new();
    for candidate in &gaps {
        for (genre_id, (label, _)) in &candidate.genres {
            genre_labels
                .entry(genre_id.clone())
                .or_insert_with(|| label.clone());
        }
    }
    let mut available_genres = genre_labels
        .iter()
        .map(|(id, label)| DiscoveryDeepCutGenre {
            id: id.clone(),
            label: label.clone(),
        })
        .collect::<Vec<_>>();
    available_genres
        .sort_by(|left, right| left.label.to_lowercase().cmp(&right.label.to_lowercase()));

    let year = request.year.filter(|year| available_years.contains(year));
    let decade = if year.is_none() {
        request.decade.map(|decade| decade.div_euclid(10) * 10)
    } else {
        None
    };
    let genre = request.genre.as_ref().and_then(|genre| {
        available_genres
            .iter()
            .find(|option| option.id.eq_ignore_ascii_case(genre))
            .map(|option| option.id.clone())
    });
    let seed = if let Some(seed) = seed_override {
        seed
    } else {
        conn.query_row("SELECT random()", [], |row| row.get::<_, i64>(0))? as u64
    };
    let mut stories = Vec::new();
    for candidate in gaps {
        if genre
            .as_ref()
            .is_some_and(|genre| !candidate.genres.contains_key(genre))
        {
            continue;
        }
        let mut matching_missing = candidate
            .missing
            .iter()
            .filter(|(_, missing_year)| match (year, decade, missing_year) {
                (Some(year), _, Some(missing_year)) => *missing_year == year,
                (None, Some(decade), Some(missing_year)) => {
                    (decade..decade + 10).contains(missing_year)
                }
                (None, None, _) => true,
                _ => false,
            })
            .collect::<Vec<_>>();
        if matching_missing.is_empty() {
            continue;
        }
        matching_missing.sort_by_key(|(title, _)| discovery_random_sort_key(seed, title));
        let (missing_release_title, missing_release_year) = matching_missing[0];
        let display_genre = genre
            .as_ref()
            .and_then(|genre| candidate.genres.get(genre).map(|(label, _)| label.clone()))
            .or_else(|| {
                candidate
                    .genres
                    .values()
                    .max_by_key(|(_, count)| *count)
                    .map(|(label, _)| label.clone())
            })
            .unwrap_or_else(|| "Genre unknown".to_string());
        stories.push(DiscoveryArtistCompletionStory {
            artist_id: candidate.artist_id,
            artist: candidate.artist,
            musicbrainz_mbid: candidate.mbid,
            owned_album_count: candidate.owned,
            official_album_count: candidate.official,
            missing_album_count: candidate.missing.len() as i64,
            completion_percent: candidate.owned as f64 / candidate.official as f64,
            missing_release_title: missing_release_title.clone(),
            missing_release_year: *missing_release_year,
            genre: display_genre,
            portrait_available: candidate.portrait_available,
            representative_album_id: candidate.representative_album_id,
            representative_album: candidate.representative_album,
            representative_cover_path: candidate.representative_cover_path,
            evidence: format!(
                "{} of {} official albums owned · {} local albums",
                candidate.owned, candidate.official, candidate.local_album_count
            ),
        });
    }
    let matching_count = stories.len() as i64;
    if include_all {
        stories.sort_by(|left, right| {
            left.artist
                .to_lowercase()
                .cmp(&right.artist.to_lowercase())
                .then_with(|| left.artist_id.cmp(&right.artist_id))
        });
    } else {
        stories.sort_by_key(|story| discovery_random_sort_key(seed, &story.artist_id));
        stories.truncate(5);
    }

    Ok(DiscoveryCompletionSnapshot {
        mode: "artist".to_string(),
        year,
        decade,
        genre,
        available_years,
        available_genres,
        matching_count,
        artist_stories: stories,
        album_stories: Vec::new(),
    })
}

pub(super) fn discovery_album_completion_snapshot_with_scope(
    conn: &Connection,
    request: &DiscoveryCompletionSnapshotRequest,
    include_all: bool,
) -> Result<DiscoveryCompletionSnapshot> {
    const RELEASE_YEAR: &str = "COALESCE(a.release_year, a.year)";
    const GENRE_ID: &str = "NULLIF(TRIM(a.genre_normalized), '')";
    const ELIGIBLE: &str = "a.total_tracks > 0 AND a.rated_tracks < a.total_tracks";
    let years_sql = format!(
        "SELECT DISTINCT {RELEASE_YEAR} FROM albums a
         WHERE {ELIGIBLE} AND {RELEASE_YEAR} IS NOT NULL
         ORDER BY {RELEASE_YEAR} DESC"
    );
    let available_years = conn
        .prepare(&years_sql)?
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let genres_sql = format!(
        "SELECT {GENRE_ID}, COALESCE(MIN(NULLIF(TRIM(a.canonical_genre), '')), {GENRE_ID})
         FROM albums a WHERE {ELIGIBLE} AND {GENRE_ID} IS NOT NULL
         GROUP BY {GENRE_ID} ORDER BY LOWER(COALESCE(MIN(NULLIF(TRIM(a.canonical_genre), '')), {GENRE_ID}))"
    );
    let available_genres = conn
        .prepare(&genres_sql)?
        .query_map([], |row| {
            Ok(DiscoveryDeepCutGenre {
                id: row.get(0)?,
                label: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let year = request.year.filter(|year| available_years.contains(year));
    let decade = if year.is_none() {
        request.decade.map(|decade| decade.div_euclid(10) * 10)
    } else {
        None
    };
    let genre = request.genre.as_ref().and_then(|genre| {
        available_genres
            .iter()
            .find(|option| option.id.eq_ignore_ascii_case(genre))
            .map(|option| option.id.clone())
    });
    let mut conditions = vec![ELIGIBLE.to_string()];
    let mut values = Vec::new();
    if let Some(year) = year {
        conditions.push(format!("{RELEASE_YEAR} = ?"));
        values.push(Value::Integer(i64::from(year)));
    } else if let Some(decade) = decade {
        conditions.push(format!("{RELEASE_YEAR} >= ? AND {RELEASE_YEAR} < ?"));
        values.push(Value::Integer(i64::from(decade)));
        values.push(Value::Integer(i64::from(decade + 10)));
    }
    if let Some(genre) = genre.as_ref() {
        conditions.push(format!("LOWER({GENRE_ID}) = LOWER(?)"));
        values.push(Value::Text(genre.clone()));
    }
    let where_clause = conditions.join(" AND ");
    let matching_count = conn.query_row(
        &format!("SELECT COUNT(*) FROM albums a WHERE {where_clause}"),
        params_from_iter(values.iter()),
        |row| row.get(0),
    )?;
    let story_order = if include_all {
        "ORDER BY LOWER(COALESCE(a.album_artist_display, '')), LOWER(COALESCE(a.album, '')), a.id"
    } else {
        "ORDER BY random() LIMIT 5"
    };
    let stories_sql = format!(
        "SELECT a.id,
                COALESCE(NULLIF(TRIM(a.album), ''), 'Unknown Album'),
                COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist'),
                {RELEASE_YEAR},
                COALESCE(NULLIF(TRIM(a.canonical_genre), ''), 'Genre unknown'),
                a.total_tracks, a.rated_tracks,
                cover.cache_path
         FROM albums a
         LEFT JOIN album_covers cover ON cover.album_id = a.id
         WHERE {where_clause}
         {story_order}"
    );
    let album_stories = conn
        .prepare(&stories_sql)?
        .query_map(params_from_iter(values.iter()), |row| {
            let total_tracks: i64 = row.get(5)?;
            let rated_tracks: i64 = row.get(6)?;
            let unrated_tracks = total_tracks - rated_tracks;
            Ok(DiscoveryAlbumCompletionStory {
                album_id: row.get(0)?,
                album: row.get(1)?,
                artist: row.get(2)?,
                release_year: row.get(3)?,
                genre: row.get(4)?,
                total_tracks,
                rated_tracks,
                unrated_tracks,
                completion_percent: rated_tracks as f64 / total_tracks as f64,
                cover_path: row.get(7)?,
                evidence: format!("{rated_tracks} of {total_tracks} tracks rated"),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(DiscoveryCompletionSnapshot {
        mode: "album".to_string(),
        year,
        decade,
        genre,
        available_years,
        available_genres,
        matching_count,
        artist_stories: Vec::new(),
        album_stories,
    })
}

pub(super) fn discovery_recommendation_snapshot(
    conn: &Connection,
    request: &DiscoveryRecommendationSnapshotRequest,
) -> Result<DiscoveryRecommendationSnapshot> {
    discovery_recommendation_snapshot_with_scope(conn, request, 6, None)
}

pub(super) fn discovery_recommendation_snapshot_with_scope(
    conn: &Connection,
    request: &DiscoveryRecommendationSnapshotRequest,
    story_limit: usize,
    seed_override: Option<u64>,
) -> Result<DiscoveryRecommendationSnapshot> {
    discovery_recommendation_snapshot_filtered(conn, request, story_limit, seed_override, None)
}

pub(super) fn discovery_recommendation_snapshot_filtered(
    conn: &Connection,
    request: &DiscoveryRecommendationSnapshotRequest,
    story_limit: usize,
    seed_override: Option<u64>,
    connection: Option<&str>,
) -> Result<DiscoveryRecommendationSnapshot> {
    #[derive(Clone)]
    struct AnchorData {
        album_id: String,
        album: String,
        artist: String,
        artist_key: String,
        genre_id: String,
        genre: String,
        rated_tracks: i64,
        total_tracks: i64,
        rating_completeness: f64,
        loved_tracks: i64,
        album_score: Option<f64>,
        cover_path: Option<String>,
        has_lastfm: bool,
    }

    #[derive(Clone)]
    struct CandidateAlbum {
        album_id: String,
        album: String,
        artist: String,
        artist_key: String,
        album_key: String,
        genre_id: String,
        rated_tracks: i64,
        total_tracks: i64,
        rating_completeness: f64,
        loved_tracks: i64,
        album_score: Option<f64>,
        cover_path: Option<String>,
    }

    #[derive(Clone)]
    struct RecommendationEdge {
        candidate_index: usize,
        anchor_index: usize,
        priority: u8,
        lastfm_linked: bool,
        sonic_distance: Option<f64>,
        reason: String,
        evidence: String,
    }

    let mode = match request.mode.as_deref() {
        Some("loved") => "loved",
        Some("sonic") => "sonic",
        _ => "played",
    };
    let seed = if let Some(seed) = seed_override {
        seed
    } else {
        conn.query_row("SELECT random()", [], |row| row.get::<_, i64>(0))? as u64
    };
    let album_artist_key = artist_key_sql("album.album_artist_display");
    let recent_sql = format!(
        "WITH latest_events AS (
            SELECT event.*,
                   ROW_NUMBER() OVER (PARTITION BY event.album_id ORDER BY event.id DESC) AS recent_rank
            FROM rating_events event
        )
        SELECT album.id,
               COALESCE(NULLIF(TRIM(album.album), ''), 'Unknown Album'),
               COALESCE(NULLIF(TRIM(album.album_artist_display), ''), 'Unknown Artist'),
               {album_artist_key},
               COALESCE(album.genre_normalized, ''),
               COALESCE(NULLIF(TRIM(album.canonical_genre), ''), 'Genre unknown'),
               album.rated_tracks, album.total_tracks, album.rating_completeness,
               album.loved_tracks, album.album_score, cover.cache_path,
               EXISTS(SELECT 1 FROM lastfm_album_relationships relation WHERE relation.album_id = album.id)
               OR EXISTS(SELECT 1 FROM lastfm_artist_similarity similarity WHERE similarity.artist_key = {album_artist_key})
        FROM latest_events event
        JOIN albums album ON album.id = event.album_id
        LEFT JOIN album_covers cover ON cover.album_id = album.id
        WHERE event.recent_rank = 1
          AND event.event_type IN ('addedPartial', 'addedRated', 'completed', 'ratedMore', 'ratingChanged')
          AND COALESCE(event.current_rated_tracks, 0) > 0
          AND COALESCE(event.current_rated_tracks, 0) >= COALESCE(event.previous_rated_tracks, 0)
        ORDER BY event.id DESC
        LIMIT 48"
    );
    let recent = conn
        .prepare(&recent_sql)?
        .query_map([], |row| {
            Ok(AnchorData {
                album_id: row.get(0)?,
                album: row.get(1)?,
                artist: row.get(2)?,
                artist_key: row.get(3)?,
                genre_id: row.get(4)?,
                genre: row.get(5)?,
                rated_tracks: row.get(6)?,
                total_tracks: row.get(7)?,
                rating_completeness: row.get(8)?,
                loved_tracks: row.get(9)?,
                album_score: row.get(10)?,
                cover_path: row.get(11)?,
                has_lastfm: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let recent_album_ids = recent
        .iter()
        .map(|anchor| anchor.album_id.clone())
        .collect::<HashSet<_>>();

    let anchor_pool = if mode == "played" {
        recent.clone()
    } else {
        let loved_sql = format!(
            "SELECT album.id,
                    COALESCE(NULLIF(TRIM(album.album), ''), 'Unknown Album'),
                    COALESCE(NULLIF(TRIM(album.album_artist_display), ''), 'Unknown Artist'),
                    {album_artist_key},
                    COALESCE(album.genre_normalized, ''),
                    COALESCE(NULLIF(TRIM(album.canonical_genre), ''), 'Genre unknown'),
                    album.rated_tracks, album.total_tracks, album.rating_completeness,
                    album.loved_tracks, album.album_score, cover.cache_path,
                    EXISTS(SELECT 1 FROM lastfm_album_relationships relation WHERE relation.album_id = album.id)
                    OR EXISTS(SELECT 1 FROM lastfm_artist_similarity similarity WHERE similarity.artist_key = {album_artist_key})
             FROM albums album
             LEFT JOIN album_covers cover ON cover.album_id = album.id
             WHERE album.loved_tracks > 0 OR album.effective_album_rating >= 90
             ORDER BY album.album_score DESC, album.loved_tracks DESC
             LIMIT 128"
        );
        conn.prepare(&loved_sql)?
            .query_map([], |row| {
                Ok(AnchorData {
                    album_id: row.get(0)?,
                    album: row.get(1)?,
                    artist: row.get(2)?,
                    artist_key: row.get(3)?,
                    genre_id: row.get(4)?,
                    genre: row.get(5)?,
                    rated_tracks: row.get(6)?,
                    total_tracks: row.get(7)?,
                    rating_completeness: row.get(8)?,
                    loved_tracks: row.get(9)?,
                    album_score: row.get(10)?,
                    cover_path: row.get(11)?,
                    has_lastfm: row.get(12)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut ordered_anchor_pool = anchor_pool;
    if mode != "played" {
        let sonic_anchor_ids = discovery_sonic::bound_anchors(
            conn,
            &ordered_anchor_pool
                .iter()
                .map(|a| a.album_id.clone())
                .collect::<Vec<_>>(),
        );
        ordered_anchor_pool.sort_by_key(|anchor| {
            (
                !sonic_anchor_ids.contains(&anchor.album_id),
                !anchor.has_lastfm,
                discovery_random_sort_key(seed, &anchor.album_id),
            )
        });
    }
    let mut artist_anchor_counts = HashMap::<String, usize>::new();
    let mut anchors = Vec::new();
    for anchor in ordered_anchor_pool {
        let count = artist_anchor_counts
            .entry(anchor.artist_key.clone())
            .or_default();
        if *count >= 2 {
            continue;
        }
        *count += 1;
        anchors.push(anchor);
        if anchors.len() == 8 {
            break;
        }
    }
    let anchor_artist_keys = anchors
        .iter()
        .map(|anchor| anchor.artist_key.clone())
        .collect::<HashSet<_>>();

    let candidate_artist_key = artist_key_sql("album.album_artist_display");
    let candidate_sql = format!(
        "SELECT album.id,
                COALESCE(NULLIF(TRIM(album.album), ''), 'Unknown Album'),
                COALESCE(NULLIF(TRIM(album.album_artist_display), ''), 'Unknown Artist'),
                {candidate_artist_key},
                COALESCE(album.genre_normalized, ''),
                COALESCE(NULLIF(TRIM(album.canonical_genre), ''), 'Genre unknown'),
                album.rated_tracks, album.total_tracks, album.rating_completeness,
                album.loved_tracks, album.album_score, cover.cache_path
         FROM albums album
         LEFT JOIN album_covers cover ON cover.album_id = album.id
         WHERE album.total_tracks > 0 AND album.rating_completeness < 0.5
           AND (?1 != 'sonic' OR (album.rated_tracks = 0 AND album.rating_completeness = 0))"
    );
    let candidates = conn
        .prepare(&candidate_sql)?
        .query_map([mode], |row| {
            let album: String = row.get(1)?;
            Ok(CandidateAlbum {
                album_id: row.get(0)?,
                album_key: identity::display_key(&album),
                album,
                artist: row.get(2)?,
                artist_key: row.get(3)?,
                genre_id: row.get(4)?,
                rated_tracks: row.get(6)?,
                total_tracks: row.get(7)?,
                rating_completeness: row.get(8)?,
                loved_tracks: row.get(9)?,
                album_score: row.get(10)?,
                cover_path: row.get(11)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
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
        candidates_by_identity.insert(
            (candidate.artist_key.clone(), candidate.album_key.clone()),
            index,
        );
        candidate_by_album_id.insert(candidate.album_id.clone(), index);
    }
    let mut candidates_by_mbid = HashMap::<String, usize>::new();
    for row in conn
        .prepare(
            "SELECT release_mbid, local_album_id FROM musicbrainz_release_decisions
             WHERE decision = 'include' AND local_album_id IS NOT NULL",
        )?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
    {
        let (mbid, album_id) = row?;
        if let Some(index) = candidate_by_album_id.get(&album_id) {
            candidates_by_mbid.insert(mbid.to_lowercase(), *index);
        }
    }

    let eligible = candidates
        .iter()
        .filter(|candidate| {
            !anchor_artist_keys.contains(&candidate.artist_key)
                && !recent_album_ids.contains(&candidate.album_id)
        })
        .map(|candidate| candidate.album_id.clone())
        .collect::<HashSet<_>>();
    let sonic = discovery_sonic::discovery_sonic(
        conn,
        &anchors
            .iter()
            .map(|a| a.album_id.clone())
            .collect::<Vec<_>>(),
        &eligible,
    );
    let mut edges_by_anchor = vec![Vec::<RecommendationEdge>::new(); anchors.len()];
    let mut related_stmt = conn.prepare(
        "SELECT candidate_artist_name, candidate_album_title, candidate_album_mbid,
                relationship_score
         FROM lastfm_related_albums WHERE album_id = ?1 ORDER BY rank LIMIT 40",
    )?;
    let mut similar_stmt = conn.prepare(
        "SELECT similar_artist_name, match_score
         FROM lastfm_similar_artists WHERE artist_key = ?1 ORDER BY rank LIMIT 24",
    )?;
    for (anchor_index, anchor) in anchors.iter().enumerate() {
        let mut best_edge_by_album = HashMap::<String, RecommendationEdge>::new();
        for row in related_stmt.query_map([&anchor.album_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })? {
            let (artist, album, mbid, _) = row?;
            let candidate_index = mbid
                .as_ref()
                .and_then(|mbid| candidates_by_mbid.get(&mbid.to_lowercase()).copied())
                .or_else(|| {
                    candidates_by_identity
                        .get(&(identity::artist_key(&artist), identity::display_key(&album)))
                        .copied()
                });
            let Some(candidate_index) = candidate_index else {
                continue;
            };
            let candidate = &candidates[candidate_index];
            if anchor_artist_keys.contains(&candidate.artist_key)
                || recent_album_ids.contains(&candidate.album_id)
            {
                continue;
            }
            best_edge_by_album.insert(
                candidate.album_id.clone(),
                RecommendationEdge {
                    candidate_index,
                    anchor_index,
                    priority: 1,
                    lastfm_linked: true,
                    sonic_distance: None,
                    reason: "Related album".to_string(),
                    evidence: format!(
                        "Related to {} on Last.fm · {}% rated",
                        anchor.album,
                        (candidate.rating_completeness * 100.0).round() as i64
                    ),
                },
            );
        }
        for row in similar_stmt.query_map([&anchor.artist_key], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })? {
            let (similar_artist, _) = row?;
            let similar_key = identity::artist_key(&similar_artist);
            let Some(album_indexes) = candidates_by_artist.get(&similar_key) else {
                continue;
            };
            let mut album_indexes = album_indexes.clone();
            album_indexes.sort_by_key(|index| {
                discovery_random_sort_key(seed ^ anchor_index as u64, &candidates[*index].album_id)
            });
            for candidate_index in album_indexes.into_iter().take(2) {
                let candidate = &candidates[candidate_index];
                if anchor_artist_keys.contains(&candidate.artist_key)
                    || recent_album_ids.contains(&candidate.album_id)
                {
                    continue;
                }
                best_edge_by_album
                    .entry(candidate.album_id.clone())
                    .or_insert_with(|| RecommendationEdge {
                        candidate_index,
                        anchor_index,
                        priority: 3,
                        lastfm_linked: true,
                        sonic_distance: None,
                        reason: "Similar artist".to_string(),
                        evidence: format!(
                            "Last.fm links {} to {} · {}% rated",
                            candidate.artist,
                            anchor.artist,
                            (candidate.rating_completeness * 100.0).round() as i64
                        ),
                    });
            }
        }
        if let Some(album_indexes) = candidates_by_genre.get(&anchor.genre_id) {
            let mut album_indexes = album_indexes.clone();
            album_indexes.sort_by_key(|index| {
                discovery_random_sort_key(
                    seed ^ 0x9e37_79b9 ^ anchor_index as u64,
                    &candidates[*index].album_id,
                )
            });
            for candidate_index in album_indexes.into_iter().take(20) {
                let candidate = &candidates[candidate_index];
                if anchor_artist_keys.contains(&candidate.artist_key)
                    || recent_album_ids.contains(&candidate.album_id)
                {
                    continue;
                }
                best_edge_by_album
                    .entry(candidate.album_id.clone())
                    .or_insert_with(|| RecommendationEdge {
                        candidate_index,
                        anchor_index,
                        priority: 4,
                        lastfm_linked: false,
                        sonic_distance: None,
                        reason: "Shared genre".to_string(),
                        evidence: format!(
                            "{} link to {} · {}% rated",
                            anchor.genre,
                            anchor.album,
                            (candidate.rating_completeness * 100.0).round() as i64
                        ),
                    });
            }
        }
        if mode == "sonic" {
            best_edge_by_album.clear();
        }
        for album in sonic
            .matches
            .albums
            .get(&anchor.album_id)
            .into_iter()
            .flatten()
        {
            let Some(&candidate_index) = candidate_by_album_id.get(&album.album_id) else {
                continue;
            };
            let sound = format!(
                "Sounds like {} by {} · {}/{} MP3s analyzed · {}% rated",
                anchor.album,
                anchor.artist,
                album.analyzed_tracks,
                album.total_tracks,
                (candidates[candidate_index].rating_completeness * 100.0).round() as i64
            );
            if let Some(edge) = best_edge_by_album
                .get_mut(&album.album_id)
                .filter(|edge| edge.lastfm_linked)
            {
                edge.priority = 0; // Independent provider and sound evidence agree.
                edge.sonic_distance = album.distance;
                edge.evidence = format!("{} · {}", edge.evidence, sound);
            } else {
                best_edge_by_album.insert(
                    album.album_id.clone(),
                    RecommendationEdge {
                        candidate_index,
                        anchor_index,
                        priority: 2,
                        lastfm_linked: false,
                        sonic_distance: album.distance,
                        reason: "Sonic similarity".into(),
                        evidence: sound,
                    },
                );
            }
        }
        let mut edges = best_edge_by_album.into_values().collect::<Vec<_>>();
        edges.sort_by(|a, b| {
            a.priority
                .cmp(&b.priority)
                .then_with(|| {
                    a.sonic_distance
                        .unwrap_or(f64::MAX)
                        .total_cmp(&b.sonic_distance.unwrap_or(f64::MAX))
                })
                .then_with(|| {
                    discovery_random_sort_key(seed, &candidates[a.candidate_index].album_id).cmp(
                        &discovery_random_sort_key(seed, &candidates[b.candidate_index].album_id),
                    )
                })
        });
        // Apply connection filters before choosing one explanation per album:
        // another anchor may provide its only sound/provider relationship.
        edges.retain(|edge| match connection {
            Some("sonic") => edge.sonic_distance.is_some(),
            Some("lastfm") => edge.lastfm_linked,
            Some("related") => edge.reason == "Related album",
            Some("similar") => edge.reason == "Similar artist",
            Some("genre") => edge.reason == "Shared genre",
            _ => true,
        });
        edges_by_anchor[anchor_index] = edges;
    }

    let matching_album_ids = edges_by_anchor
        .iter()
        .flatten()
        .map(|edge| candidates[edge.candidate_index].album_id.clone())
        .collect::<HashSet<_>>();
    let lastfm_album_ids = edges_by_anchor
        .iter()
        .flatten()
        .filter(|edge| edge.lastfm_linked)
        .map(|edge| candidates[edge.candidate_index].album_id.clone())
        .collect::<HashSet<_>>();
    let sonic_album_ids = edges_by_anchor
        .iter()
        .flatten()
        .filter(|edge| edge.sonic_distance.is_some())
        .map(|edge| candidates[edge.candidate_index].album_id.clone())
        .collect::<HashSet<_>>();
    let mut selected = Vec::<RecommendationEdge>::new();
    let mut selected_albums = HashSet::<String>::new();
    let mut selected_artists = HashSet::<String>::new();
    while selected.len() < story_limit {
        let mut progressed = false;
        for anchor_index in 0..anchors.len() {
            let available = |edge: &&RecommendationEdge| {
                let candidate = &candidates[edge.candidate_index];
                !selected_albums.contains(&candidate.album_id)
                    && !selected_artists.contains(&candidate.artist_key)
            };
            let edges = &edges_by_anchor[anchor_index];
            // Give sound evidence a regular place in the mixed shelf. Provider
            // agreement still ranks first; rotate across anchors and artists.
            let sound = if selected.len() % 3 == 1 {
                edges
                    .iter()
                    .filter(available)
                    .find(|edge| edge.sonic_distance.is_some())
            } else {
                None
            };
            if let Some(edge) = sound.or_else(|| edges.iter().find(available)) {
                let candidate = &candidates[edge.candidate_index];
                selected_albums.insert(candidate.album_id.clone());
                selected_artists.insert(candidate.artist_key.clone());
                selected.push(edge.clone());
                progressed = true;
            }
            if selected.len() == story_limit {
                break;
            }
        }
        if !progressed {
            break;
        }
    }
    if selected.len() < story_limit {
        for edges in &edges_by_anchor {
            for edge in edges {
                let candidate = &candidates[edge.candidate_index];
                if selected_albums.insert(candidate.album_id.clone()) {
                    selected.push(edge.clone());
                }
                if selected.len() == story_limit {
                    break;
                }
            }
            if selected.len() == story_limit {
                break;
            }
        }
    }

    let stories = selected
        .into_iter()
        .map(|edge| {
            let candidate = &candidates[edge.candidate_index];
            let anchor = &anchors[edge.anchor_index];
            DiscoveryRecommendationStory {
                album_id: candidate.album_id.clone(),
                album: candidate.album.clone(),
                artist: candidate.artist.clone(),
                loved_tracks: candidate.loved_tracks,
                album_score: candidate.album_score,
                rated_tracks: candidate.rated_tracks,
                total_tracks: candidate.total_tracks,
                rating_completeness: candidate.rating_completeness,
                cover_path: candidate.cover_path.clone(),
                reason: edge.reason,
                anchor_album_id: anchor.album_id.clone(),
                anchor_album: anchor.album.clone(),
                anchor_artist: anchor.artist.clone(),
                evidence: edge.evidence,
                sonic_distance: edge.sonic_distance,
            }
        })
        .collect::<Vec<_>>();
    let anchor_stories = anchors
        .iter()
        .map(|anchor| {
            let completion = (anchor.rating_completeness * 100.0).round() as i64;
            let (signal, evidence) = if mode == "played" {
                (
                    format!("{completion}% rated recently"),
                    format!(
                        "{} of {} tracks rated in recent activity",
                        anchor.rated_tracks, anchor.total_tracks
                    ),
                )
            } else if anchor.album_score.is_none() {
                (
                    format!("{} loved tracks", anchor.loved_tracks),
                    format!(
                        "{} loved tracks provide the anchor; no album score yet",
                        anchor.loved_tracks
                    ),
                )
            } else {
                let score = anchor.album_score.unwrap_or_default().round() as i64;
                (
                    format!("Album score {score}"),
                    format!(
                        "Album score {score} · {} loved {}",
                        anchor.loved_tracks,
                        if anchor.loved_tracks == 1 {
                            "track"
                        } else {
                            "tracks"
                        }
                    ),
                )
            };
            DiscoveryRecommendationAnchor {
                album_id: anchor.album_id.clone(),
                album: anchor.album.clone(),
                artist: anchor.artist.clone(),
                signal,
                cover_path: anchor.cover_path.clone(),
                evidence,
            }
        })
        .collect::<Vec<_>>();
    let evidence = if mode == "sonic" {
        format!(
            "{} high-score or loved anchors · similar albums with no rated tracks",
            anchor_stories.len()
        )
    } else if mode == "played" {
        format!(
            "{} recent rating threads · suggestions are under 50% rated",
            anchor_stories.len()
        )
    } else {
        format!(
            "{} high-score or loved anchors · suggestions are under 50% rated",
            anchor_stories.len()
        )
    };

    Ok(DiscoveryRecommendationSnapshot {
        mode: mode.to_string(),
        anchors: anchor_stories,
        matching_count: matching_album_ids.len() as i64,
        lastfm_linked_count: lastfm_album_ids.len() as i64,
        sonic_linked_count: sonic_album_ids.len() as i64,
        sonic_note: sonic.note,
        stories,
        evidence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn discovery_deep_cuts_are_album_diverse_and_filter_exactly() {
        let conn = seeded_connection();
        let albums = [
            (
                "deep-1982",
                "First Artist",
                "First Album",
                1982,
                "Rock",
                "rock",
            ),
            (
                "deep-1987",
                "Second Artist",
                "Second Album",
                1987,
                "Rock",
                "rock",
            ),
            (
                "deep-2001",
                "Third Artist",
                "Third Album",
                2001,
                "Pop",
                "pop",
            ),
            (
                "deep-2005",
                "Fourth Artist",
                "Fourth Album",
                2005,
                "Rock",
                "rock",
            ),
        ];
        for (album_id, artist, album, year, genre, genre_id) in albums {
            insert_test_album(&conn, album_id, artist, album, year, 10);
            conn.execute(
                "UPDATE albums
                 SET effective_album_rating = 90, canonical_genre = ?2,
                     genre_normalized = ?3
                 WHERE id = ?1",
                params![album_id, genre, genre_id],
            )
            .expect("update deep-cut album");
            for track_number in 2..=3 {
                conn.execute(
                    "INSERT INTO tracks (
                        import_run_id, album_id, album_unique_id, display_artist,
                        album_artist_display, album, title, canonical_genre,
                        genre_normalized, normalized_rating, track_number, year,
                        release_year, time_seconds, row_hash
                    ) VALUES (
                        1, ?1, ?1, ?2, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8,
                        ?8, 240, ?9
                    )",
                    params![
                        album_id,
                        artist,
                        album,
                        format!("Deep Track {track_number}"),
                        genre,
                        genre_id,
                        track_number,
                        year,
                        format!("{album_id}-{track_number}"),
                    ],
                )
                .expect("insert deep-cut track");
            }
        }

        let all = discovery_deep_cut_snapshot(&conn, &DiscoveryDeepCutSnapshotRequest::default())
            .expect("load unfiltered deep cuts");
        assert_eq!(all.matching_album_count, 4);
        assert_eq!(all.stories.len(), 4);
        assert_eq!(
            all.stories
                .iter()
                .map(|story| story.album_id.as_str())
                .collect::<HashSet<_>>()
                .len(),
            all.stories.len()
        );

        let eighties_rock = discovery_deep_cut_snapshot(
            &conn,
            &DiscoveryDeepCutSnapshotRequest {
                year: None,
                decade: Some(1980),
                genre: Some("rock".to_string()),
            },
        )
        .expect("load 1980s rock deep cuts");
        assert_eq!(eighties_rock.matching_album_count, 2);
        assert_eq!(eighties_rock.stories.len(), 2);
        assert!(eighties_rock.stories.iter().all(|story| {
            story
                .release_year
                .is_some_and(|year| (1980..1990).contains(&year))
                && story.genre == "Rock"
        }));

        let exact_year = discovery_deep_cut_snapshot(
            &conn,
            &DiscoveryDeepCutSnapshotRequest {
                year: Some(2001),
                decade: Some(1980),
                genre: Some("pop".to_string()),
            },
        )
        .expect("load exact-year pop deep cuts");
        assert_eq!(exact_year.year, Some(2001));
        assert_eq!(exact_year.decade, None);
        assert_eq!(exact_year.matching_album_count, 1);
        assert_eq!(exact_year.stories[0].album_id, "deep-2001");
    }

    #[test]
    fn discovery_completion_finds_cached_artists_beyond_the_largest_collections() {
        let conn = seeded_connection();
        for index in 0..40 {
            let artist = format!("Large Artist {index:02}");
            insert_test_artist_info(&conn, &artist, "Group", None, Some(1980), None, false);
            for album_index in 0..4 {
                insert_test_album(
                    &conn,
                    &format!("large-{index}-{album_index}"),
                    &artist,
                    &format!("Large Album {album_index}"),
                    1980 + album_index,
                    10,
                );
            }
        }

        let target = "Target Artist";
        insert_test_artist_info(&conn, target, "Group", None, Some(1984), None, false);
        for (album_id, album, year) in [
            ("target-one", "Target One", 1984),
            ("target-two", "Target Two", 1986),
            ("target-three", "Target Three", 1988),
        ] {
            insert_test_album(&conn, album_id, target, album, year, 10);
        }
        conn.execute_batch(
            "INSERT INTO musicbrainz_artist_release_groups (
                artist_mbid, release_mbid, title, year, type, secondary_types,
                status, source, fetched_at
             ) VALUES
                ('mbid-target artist', 'target-rg-1', 'Target One', 1984, 'Album', '', 'Official', 'test', '2026-08-12'),
                ('mbid-target artist', 'target-rg-2', 'Target Two', 1986, 'Album', '', 'Official', 'test', '2026-08-12'),
                ('mbid-target artist', 'target-rg-3', 'Target Three', 1988, 'Album', '', 'Official', 'test', '2026-08-12'),
                ('mbid-target artist', 'target-rg-4', 'Missing Target', 1989, 'Album', '', 'Official', 'test', '2026-08-12'),
                ('mbid-target artist', 'target-rg-5', 'Unofficial Bootleg', 1987, 'Album', '', 'Official', 'test', '2026-08-12');
             INSERT INTO musicbrainz_release_status_cache (
                 artist_mbid, release_mbid, has_official_release, checked_at
             ) VALUES (
                 'mbid-target artist', 'target-rg-5', 0, '2026-08-12'
             );"
        )
        .expect("insert target release groups");

        let snapshot = discovery_completion_snapshot(
            &conn,
            &DiscoveryCompletionSnapshotRequest {
                mode: Some("artist".to_string()),
                year: None,
                decade: Some(1980),
                genre: Some("rock".to_string()),
            },
        )
        .expect("load artist completion snapshot");

        assert_eq!(snapshot.matching_count, 1);
        assert_eq!(snapshot.artist_stories[0].artist, target);
        assert_eq!(snapshot.artist_stories[0].owned_album_count, 3);
        assert_eq!(snapshot.artist_stories[0].official_album_count, 4);
        assert_eq!(snapshot.artist_stories[0].missing_album_count, 1);
        assert_eq!(
            snapshot.artist_stories[0].missing_release_title,
            "Missing Target"
        );
        assert_eq!(snapshot.artist_stories[0].missing_release_year, Some(1989));
    }

    #[test]
    fn discovery_album_completion_filters_unrated_albums_exactly() {
        let conn = seeded_connection();
        insert_test_album(&conn, "gap-rock", "Gap Artist", "Rock Gap", 1985, 10);
        insert_test_album(&conn, "gap-pop", "Gap Artist", "Pop Gap", 2001, 12);
        conn.execute(
            "UPDATE albums SET rated_tracks = 7, rating_completeness = 0.7 WHERE id = 'gap-rock'",
            [],
        )
        .expect("make rock album incomplete");
        conn.execute(
            "UPDATE albums SET rated_tracks = 6, rating_completeness = 0.5,
                    canonical_genre = 'Pop', genre_normalized = 'pop'
             WHERE id = 'gap-pop'",
            [],
        )
        .expect("make pop album incomplete");

        let snapshot = discovery_completion_snapshot(
            &conn,
            &DiscoveryCompletionSnapshotRequest {
                mode: Some("album".to_string()),
                year: None,
                decade: Some(1980),
                genre: Some("rock".to_string()),
            },
        )
        .expect("load album completion snapshot");

        assert_eq!(snapshot.matching_count, 1);
        assert_eq!(snapshot.album_stories[0].album_id, "gap-rock");
        assert_eq!(snapshot.album_stories[0].unrated_tracks, 3);
    }

    #[test]
    fn discovery_recommendations_mix_recent_anchors_and_exclude_recent_or_well_rated_albums() {
        let conn = seeded_connection();
        for (album_id, artist, album, year) in [
            ("played-a", "Played Artist A", "Played A", 1981),
            (
                "played-a-partial",
                "Played Artist A",
                "Nearly Finished",
                1982,
            ),
            (
                "same-artist-gap",
                "Played Artist A",
                "Same Artist Gap",
                1983,
            ),
            ("played-b", "Played Artist B", "Played B", 1991),
            ("related-gap", "Related Artist", "Related Gap", 1992),
            ("similar-gap", "Similar Artist", "Similar Gap", 1993),
            ("half-rated", "Half Artist", "Half Rated", 1994),
        ] {
            insert_test_album(&conn, album_id, artist, album, year, 10);
        }
        conn.execute_batch(
            "UPDATE albums SET canonical_genre = 'Synthpop', genre_normalized = 'synthpop'
             WHERE id IN ('played-a', 'played-a-partial', 'same-artist-gap', 'related-gap');
             UPDATE albums SET canonical_genre = 'Jazz', genre_normalized = 'jazz'
             WHERE id IN ('played-b', 'similar-gap');
             UPDATE albums SET rated_tracks = 9, rating_completeness = 0.9
             WHERE id = 'played-a-partial';
             UPDATE albums SET rated_tracks = 0, rating_completeness = 0.0,
                               effective_album_rating = NULL, album_score = NULL
             WHERE id IN ('same-artist-gap', 'related-gap', 'similar-gap');
             UPDATE albums SET rated_tracks = 5, rating_completeness = 0.5
             WHERE id = 'half-rated';

             INSERT INTO rating_events (
                 import_run_id, created_at, event_type, album_id, album,
                 album_artist_display, current_rated_tracks,
                 current_rating_completeness, current_effective_album_rating
             ) VALUES
                 (1, '2026-08-12T08:00:00Z', 'ratedMore', 'played-a-partial',
                  'Nearly Finished', 'Played Artist A', 9, 0.9, 88),
                 (1, '2026-08-12T08:01:00Z', 'completed', 'played-a',
                  'Played A', 'Played Artist A', 10, 1.0, 90),
                 (1, '2026-08-12T08:02:00Z', 'completed', 'played-b',
                  'Played B', 'Played Artist B', 10, 1.0, 92);

             INSERT INTO lastfm_album_relationships (
                 album_id, album_artist, album_title, state, message,
                 fetched_at, expires_at
             ) VALUES (
                 'played-a', 'Played Artist A', 'Played A', 'available', '',
                 '2026-08-12T08:03:00Z', '2026-09-12T08:03:00Z'
             );
             INSERT INTO lastfm_related_albums (
                 album_id, rank, candidate_artist_name, candidate_album_title,
                 relationship_score, shared_tags_json, fetched_at, expires_at
             ) VALUES (
                 'played-a', 1, 'Related Artist', 'Related Gap', 1.0,
                 '[\"synthpop\"]', '2026-08-12T08:03:00Z', '2026-09-12T08:03:00Z'
             );

             INSERT INTO lastfm_artist_similarity (
                 artist_key, artist_name, state, message, fetched_at, expires_at
             ) VALUES (
                 'played artist b', 'Played Artist B', 'available', '',
                 '2026-08-12T08:04:00Z', '2026-09-12T08:04:00Z'
             );
             INSERT INTO lastfm_similar_artists (
                 artist_key, rank, similar_artist_name, match_score,
                 fetched_at, expires_at
             ) VALUES (
                 'played artist b', 1, 'Similar Artist', 0.9,
                 '2026-08-12T08:04:00Z', '2026-09-12T08:04:00Z'
             );",
        )
        .expect("insert recommendation fixtures");

        let snapshot = discovery_recommendation_snapshot(
            &conn,
            &DiscoveryRecommendationSnapshotRequest {
                mode: Some("played".to_string()),
            },
        )
        .expect("load played recommendations");

        let recommended_ids = snapshot
            .stories
            .iter()
            .map(|story| story.album_id.as_str())
            .collect::<HashSet<_>>();
        assert!(recommended_ids.contains("related-gap"));
        assert!(recommended_ids.contains("similar-gap"));
        assert!(!recommended_ids.contains("played-a-partial"));
        assert!(!recommended_ids.contains("same-artist-gap"));
        assert!(!recommended_ids.contains("half-rated"));
        assert!(snapshot
            .stories
            .iter()
            .all(|story| story.rating_completeness < 0.5));
        assert!(snapshot
            .stories
            .iter()
            .any(|story| story.reason == "Related album"));
        assert!(snapshot
            .stories
            .iter()
            .any(|story| story.reason == "Similar artist"));
        assert!(snapshot.lastfm_linked_count >= 2);
    }

    #[test]
    fn discovery_loved_recommendations_use_high_score_anchors() {
        let conn = seeded_connection();
        insert_test_album(
            &conn,
            "loved-anchor",
            "Loved Artist",
            "Loved Anchor",
            1984,
            10,
        );
        insert_test_album(&conn, "loved-gap", "Loved Neighbor", "Loved Gap", 1985, 10);
        conn.execute_batch(
            "UPDATE albums SET loved_tracks = 4, album_score = 420.0
             WHERE id = 'loved-anchor';
             UPDATE albums SET rated_tracks = 0, rating_completeness = 0.0,
                               effective_album_rating = NULL, album_score = NULL
             WHERE id = 'loved-gap';
             INSERT INTO lastfm_artist_similarity (
                 artist_key, artist_name, state, message, fetched_at, expires_at
             ) VALUES (
                 'loved artist', 'Loved Artist', 'available', '',
                 '2026-08-12T08:04:00Z', '2026-09-12T08:04:00Z'
             );
             INSERT INTO lastfm_similar_artists (
                 artist_key, rank, similar_artist_name, match_score,
                 fetched_at, expires_at
             ) VALUES (
                 'loved artist', 1, 'Loved Neighbor', 0.95,
                 '2026-08-12T08:04:00Z', '2026-09-12T08:04:00Z'
             );",
        )
        .expect("insert loved recommendation fixtures");

        let snapshot = discovery_recommendation_snapshot(
            &conn,
            &DiscoveryRecommendationSnapshotRequest {
                mode: Some("loved".to_string()),
            },
        )
        .expect("load loved recommendations");

        assert_eq!(snapshot.mode, "loved");
        assert!(snapshot
            .anchors
            .iter()
            .any(|anchor| anchor.album_id == "loved-anchor"));
        assert!(snapshot
            .stories
            .iter()
            .any(|story| story.album_id == "loved-gap" && story.anchor_album_id == "loved-anchor"));
    }

    #[test]
    fn discovery_chart_snapshots_keep_source_year_and_week_exact() {
        let conn = seeded_connection();
        insert_test_album(
            &conn,
            "mb:billboard-chart",
            "Billboard Artist",
            "Billboard Album",
            2001,
            10,
        );
        insert_test_album(&conn, "mb:uk-chart", "UK Artist", "UK Album", 1979, 10);
        insert_test_album(&conn, "mb:vg-chart", "VG Artist", "VG Album", 2003, 10);
        conn.execute_batch(
            "
            INSERT INTO billboard_chart_entries (
                source_file, year, rank, artist, album, artist_key, album_key,
                matched_album_id, imported_at
            ) VALUES (
                'billboard.csv', 2005, 4, 'Billboard Artist', 'Billboard Album',
                'billboard artist', 'billboard album', 'mb:billboard-chart', 'now'
            );

            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, matched_album_id, imported_at
            ) VALUES
                ('uk.csv', 1982, 34, '1982-08-28', 2, 'UK Artist', 'UK Album',
                 'uk artist', 'uk album', '1982-34', 'mb:uk-chart', 'now'),
                ('uk.csv', 1982, 35, '1982-09-04', 9, 'UK Artist', 'UK Album',
                 'uk artist', 'uk album', '1982-35', 'mb:uk-chart', 'now');

            INSERT INTO vg_lista_album_chart_entries (
                source_file, year, week, rank, artist, title, artist_key,
                title_key, week_date, week_key, matched_album_id, imported_at
            ) VALUES (
                'vg.csv', 2005, 50, 3, 'VG Artist', 'VG Album', 'vg artist',
                'vg album', '2005-12-16', '2005-50', 'mb:vg-chart', 'now'
            );
            ",
        )
        .expect("insert mixed chart snapshot fixtures");

        let uk = discovery_chart_snapshot(
            &conn,
            &DiscoveryChartSnapshotRequest {
                source: Some("official-uk".to_string()),
                year: Some(1982),
                week: Some(34),
                random: false,
            },
        )
        .expect("load exact UK chart week");
        assert_eq!(uk.source_label, "Official UK Albums");
        assert_eq!(uk.year, Some(1982));
        assert_eq!(uk.week, Some(34));
        assert_eq!(uk.available_weeks, vec![34, 35]);
        assert_eq!(uk.stories.len(), 1);
        assert_eq!(uk.stories[0].rank, 2);
        assert_eq!(uk.stories[0].chart_year, 1982);

        let billboard = discovery_chart_snapshot(
            &conn,
            &DiscoveryChartSnapshotRequest {
                source: Some("billboard".to_string()),
                year: Some(2005),
                week: Some(34),
                random: false,
            },
        )
        .expect("load Billboard year-end chart");
        assert_eq!(billboard.source_label, "Billboard Year-End Albums");
        assert_eq!(billboard.year, Some(2005));
        assert_eq!(billboard.week, None);
        assert!(billboard.available_weeks.is_empty());
        assert_eq!(billboard.stories[0].rank, 4);

        for _ in 0..30 {
            let random = discovery_chart_snapshot(
                &conn,
                &DiscoveryChartSnapshotRequest {
                    source: None,
                    year: None,
                    week: None,
                    random: true,
                },
            )
            .expect("load random chart snapshot");
            assert!(["billboard", "official-uk", "vg-lista"].contains(&random.source.as_str()));
            assert!(random.year.is_some());
            assert!(!random.stories.is_empty());
            if random.source == "billboard" {
                assert!(random.week.is_none());
            } else {
                assert!(random.week.is_some());
            }
        }
    }

    #[test]
    fn discovery_chart_snapshot_falls_back_from_an_empty_requested_source() {
        let conn = seeded_connection();
        conn.execute_batch(
            "
            INSERT INTO official_uk_album_chart_entries (
                source_file, year, week, chart_date, rank, artist, title,
                artist_key, title_key, week_key, matched_album_id, imported_at
            ) VALUES (
                'uk.csv', 1987, 32, '1987-08-08', 1, 'Pet Shop Boys',
                'Actually', 'pet shop boys', 'actually', '1987-32', 'mb:test', 'now'
            );
            ",
        )
        .expect("insert only available chart source");

        let snapshot = discovery_chart_snapshot(
            &conn,
            &DiscoveryChartSnapshotRequest {
                source: Some("billboard".to_string()),
                year: None,
                week: None,
                random: false,
            },
        )
        .expect("fall back to chart source with matches");

        assert_eq!(snapshot.source, "official-uk");
        assert_eq!(snapshot.year, Some(1987));
        assert_eq!(snapshot.week, Some(32));
        assert_eq!(snapshot.stories.len(), 1);
    }
}
