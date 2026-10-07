use super::*;

#[derive(Debug, Clone)]
pub(crate) struct LastFmArtistIdentity {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ArtistBiographyIdentity {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ArtistBiographyCacheRecord {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
    pub wikidata_id: Option<String>,
    pub wikipedia_language: Option<String>,
    pub wikipedia_title: Option<String>,
    pub biography_text: Option<String>,
    pub source_url: Option<String>,
    pub state: String,
    pub message: String,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct AlbumReviewIdentity {
    pub album_id: String,
    pub album_artist: String,
    pub album_title: String,
    pub album_year: Option<i32>,
    pub artist_mbid: Option<String>,
    pub release_group_mbid: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct AlbumReviewCacheRecord {
    pub album_id: String,
    pub album_artist: String,
    pub album_title: String,
    pub album_year: Option<i32>,
    pub artist_mbid: Option<String>,
    pub release_group_mbid: Option<String>,
    pub review_id: Option<String>,
    pub review_text: Option<String>,
    pub reviewer_name: Option<String>,
    pub rating: Option<i32>,
    pub language: Option<String>,
    pub review_source: Option<String>,
    pub source_url: Option<String>,
    pub license_id: Option<String>,
    pub license_name: Option<String>,
    pub license_url: Option<String>,
    pub state: String,
    pub message: String,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmLocalTrackCandidate {
    pub track_id: i64,
    pub artist_key: String,
    pub album_id: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub display_artist: Option<String>,
    pub title: String,
    pub year: Option<i32>,
    pub seconds: Option<i64>,
    pub disc_number: Option<i32>,
    pub track_number: Option<i32>,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmArtistPopularityCacheRecord {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
    pub source_url: Option<String>,
    pub state: String,
    pub message: String,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmTrackPopularityCacheRecord {
    pub artist_key: String,
    pub track_key: String,
    pub artist_name: String,
    pub track_name: String,
    pub musicbrainz_recording_mbid: Option<String>,
    pub listeners: Option<i64>,
    pub play_count: Option<i64>,
    pub artist_rank: Option<i64>,
    pub source_url: Option<String>,
    pub fetch_method: String,
    pub state: String,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmArtistSimilarityCacheRecord {
    pub artist_key: String,
    pub artist_name: String,
    pub musicbrainz_mbid: Option<String>,
    pub source_url: Option<String>,
    pub state: String,
    pub message: String,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmSimilarArtistCacheRecord {
    pub artist_key: String,
    pub rank: i64,
    pub similar_artist_name: String,
    pub similar_artist_mbid: Option<String>,
    pub match_score: f64,
    pub source_url: Option<String>,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LastFmSimilarLocalArtist {
    pub artist_id: String,
    pub artist_name: String,
    pub album_count: i64,
    pub portrait_available: bool,
    pub representative_album_id: Option<String>,
    pub representative_album: Option<String>,
    pub representative_cover_path: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmAlbumRelationshipsCacheRecord {
    pub album_id: String,
    pub album_artist: String,
    pub album_title: String,
    pub source_url: Option<String>,
    pub source_tags_json: String,
    pub state: String,
    pub message: String,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone)]
pub(crate) struct LastFmRelatedAlbumCacheRecord {
    pub album_id: String,
    pub rank: i64,
    pub candidate_artist_name: String,
    pub candidate_artist_mbid: Option<String>,
    pub candidate_album_title: String,
    pub candidate_album_mbid: Option<String>,
    pub source_url: Option<String>,
    pub relationship_score: f64,
    pub shared_tags_json: String,
    pub artist_similarity: Option<f64>,
    pub fetched_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LastFmRelatedLocalAlbum {
    pub album_id: String,
    pub album_artist: String,
    pub album_title: String,
    pub year: Option<i32>,
    pub cover_path: Option<String>,
    pub cover_mime_type: Option<String>,
}

pub(super) fn lastfm_artist_identity(
    conn: &Connection,
    artist_id: &str,
) -> Result<Option<LastFmArtistIdentity>> {
    let artist_key = artist_key_sql("album_artist_display");
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                {artist_key} AS artist_key,
                COALESCE(MIN(NULLIF(TRIM(album_artist_display), '')), 'Unknown Artist') AS artist_name
            FROM albums
            GROUP BY {artist_key}
        )
        SELECT grouped.artist_key, grouped.artist_name, COALESCE(link.mbid, info.mbid)
        FROM grouped
        LEFT JOIN musicbrainz_artist_links link
          ON link.local_artist_key = grouped.artist_key
        LEFT JOIN musicbrainz_artist_infos info
          ON info.local_artist_key = grouped.artist_key
        WHERE grouped.artist_key = ?1
        "
    );
    conn.query_row(&sql, [artist_id], |row| {
        Ok(LastFmArtistIdentity {
            artist_key: row.get(0)?,
            artist_name: row.get(1)?,
            musicbrainz_mbid: row.get(2)?,
        })
    })
    .optional()
    .context("Could not resolve the local artist for Last.fm popularity")
}

pub(crate) fn lastfm_artist_identity_for_app(
    app: &AppHandle,
    artist_id: &str,
) -> Result<Option<LastFmArtistIdentity>> {
    let (conn, _) = open_read(app)?;
    lastfm_artist_identity(&conn, artist_id)
}

pub(crate) fn artist_biography_identity_for_app(
    app: &AppHandle,
    artist_id: &str,
) -> Result<Option<ArtistBiographyIdentity>> {
    let (conn, _) = open_read(app)?;
    Ok(
        lastfm_artist_identity(&conn, artist_id)?.map(|identity| ArtistBiographyIdentity {
            artist_key: identity.artist_key,
            artist_name: identity.artist_name,
            musicbrainz_mbid: identity.musicbrainz_mbid,
        }),
    )
}

pub(super) fn artist_biography_cache(
    conn: &Connection,
    artist_key: &str,
) -> Result<Option<ArtistBiographyCacheRecord>> {
    conn.query_row(
        "
        SELECT
            artist_key, artist_name, musicbrainz_mbid, wikidata_id,
            wikipedia_language, wikipedia_title, biography_text, source_url,
            state, message, fetched_at, expires_at
        FROM artist_biographies
        WHERE artist_key = ?1
        ",
        [artist_key],
        |row| {
            Ok(ArtistBiographyCacheRecord {
                artist_key: row.get(0)?,
                artist_name: row.get(1)?,
                musicbrainz_mbid: row.get(2)?,
                wikidata_id: row.get(3)?,
                wikipedia_language: row.get(4)?,
                wikipedia_title: row.get(5)?,
                biography_text: row.get(6)?,
                source_url: row.get(7)?,
                state: row.get(8)?,
                message: row.get(9)?,
                fetched_at: row.get(10)?,
                expires_at: row.get(11)?,
            })
        },
    )
    .optional()
    .context("Could not read the artist biography cache")
}

pub(crate) fn artist_biography_cache_for_app(
    app: &AppHandle,
    artist_key: &str,
) -> Result<Option<ArtistBiographyCacheRecord>> {
    let (conn, _) = open_read(app)?;
    artist_biography_cache(&conn, artist_key)
}

pub(super) fn upsert_artist_biography(
    conn: &Connection,
    record: &ArtistBiographyCacheRecord,
) -> Result<()> {
    conn.execute(
        "
        INSERT INTO artist_biographies (
            artist_key, artist_name, musicbrainz_mbid, wikidata_id,
            wikipedia_language, wikipedia_title, biography_text, source_url,
            state, message, fetched_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(artist_key) DO UPDATE SET
            artist_name = excluded.artist_name,
            musicbrainz_mbid = excluded.musicbrainz_mbid,
            wikidata_id = excluded.wikidata_id,
            wikipedia_language = excluded.wikipedia_language,
            wikipedia_title = excluded.wikipedia_title,
            biography_text = excluded.biography_text,
            source_url = excluded.source_url,
            state = excluded.state,
            message = excluded.message,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        ",
        params![
            record.artist_key,
            record.artist_name,
            record.musicbrainz_mbid,
            record.wikidata_id,
            record.wikipedia_language,
            record.wikipedia_title,
            record.biography_text,
            record.source_url,
            record.state,
            record.message,
            record.fetched_at,
            record.expires_at,
        ],
    )
    .context("Could not cache the artist biography")?;
    Ok(())
}

pub(crate) fn upsert_artist_biography_for_app(
    app: &AppHandle,
    record: &ArtistBiographyCacheRecord,
) -> Result<()> {
    let (conn, _) = open(app)?;
    upsert_artist_biography(&conn, record)
}

pub(super) fn album_review_identity(
    conn: &Connection,
    album_id: &str,
) -> Result<Option<AlbumReviewIdentity>> {
    let artist_key = artist_key_sql("a.album_artist_display");
    let sql = format!(
        "
        SELECT
            a.id,
            COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist'),
            COALESCE(NULLIF(TRIM(a.album), ''), 'Untitled album'),
            a.year,
            link.mbid,
            (
                SELECT decision.release_mbid
                FROM musicbrainz_release_decisions decision
                WHERE decision.local_album_id = a.id
                  AND decision.decision = 'include'
                ORDER BY decision.updated_at DESC, decision.release_mbid
                LIMIT 1
            )
        FROM albums a
        LEFT JOIN musicbrainz_artist_links link
          ON link.local_artist_key = {artist_key}
         AND link.ignored = 0
        WHERE a.id = ?1
        "
    );
    conn.query_row(&sql, [album_id], |row| {
        Ok(AlbumReviewIdentity {
            album_id: row.get(0)?,
            album_artist: row.get(1)?,
            album_title: row.get(2)?,
            album_year: row.get(3)?,
            artist_mbid: row.get(4)?,
            release_group_mbid: row.get(5)?,
        })
    })
    .optional()
    .context("Could not resolve the local album for its review")
}

pub(crate) fn album_review_identity_for_app(
    app: &AppHandle,
    album_id: &str,
) -> Result<Option<AlbumReviewIdentity>> {
    let (conn, _) = open_read(app)?;
    album_review_identity(&conn, album_id)
}

pub(super) fn album_review_cache(
    conn: &Connection,
    album_id: &str,
) -> Result<Option<AlbumReviewCacheRecord>> {
    conn.query_row(
        "
        SELECT
            album_id, album_artist, album_title, album_year, artist_mbid,
            release_group_mbid, review_id, review_text, reviewer_name, rating,
            language, review_source, source_url, license_id, license_name,
            license_url, state, message, fetched_at, expires_at
        FROM album_reviews
        WHERE album_id = ?1
        ",
        [album_id],
        |row| {
            Ok(AlbumReviewCacheRecord {
                album_id: row.get(0)?,
                album_artist: row.get(1)?,
                album_title: row.get(2)?,
                album_year: row.get(3)?,
                artist_mbid: row.get(4)?,
                release_group_mbid: row.get(5)?,
                review_id: row.get(6)?,
                review_text: row.get(7)?,
                reviewer_name: row.get(8)?,
                rating: row.get(9)?,
                language: row.get(10)?,
                review_source: row.get(11)?,
                source_url: row.get(12)?,
                license_id: row.get(13)?,
                license_name: row.get(14)?,
                license_url: row.get(15)?,
                state: row.get(16)?,
                message: row.get(17)?,
                fetched_at: row.get(18)?,
                expires_at: row.get(19)?,
            })
        },
    )
    .optional()
    .context("Could not read the album review cache")
}

pub(crate) fn album_review_cache_for_app(
    app: &AppHandle,
    album_id: &str,
) -> Result<Option<AlbumReviewCacheRecord>> {
    let (conn, _) = open_read(app)?;
    album_review_cache(&conn, album_id)
}

pub(super) fn upsert_album_review(
    conn: &Connection,
    record: &AlbumReviewCacheRecord,
) -> Result<()> {
    conn.execute(
        "
        INSERT INTO album_reviews (
            album_id, album_artist, album_title, album_year, artist_mbid,
            release_group_mbid, review_id, review_text, reviewer_name, rating,
            language, review_source, source_url, license_id, license_name,
            license_url, state, message, fetched_at, expires_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
        )
        ON CONFLICT(album_id) DO UPDATE SET
            album_artist = excluded.album_artist,
            album_title = excluded.album_title,
            album_year = excluded.album_year,
            artist_mbid = excluded.artist_mbid,
            release_group_mbid = excluded.release_group_mbid,
            review_id = excluded.review_id,
            review_text = excluded.review_text,
            reviewer_name = excluded.reviewer_name,
            rating = excluded.rating,
            language = excluded.language,
            review_source = excluded.review_source,
            source_url = excluded.source_url,
            license_id = excluded.license_id,
            license_name = excluded.license_name,
            license_url = excluded.license_url,
            state = excluded.state,
            message = excluded.message,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        ",
        params![
            record.album_id,
            record.album_artist,
            record.album_title,
            record.album_year,
            record.artist_mbid,
            record.release_group_mbid,
            record.review_id,
            record.review_text,
            record.reviewer_name,
            record.rating,
            record.language,
            record.review_source,
            record.source_url,
            record.license_id,
            record.license_name,
            record.license_url,
            record.state,
            record.message,
            record.fetched_at,
            record.expires_at,
        ],
    )
    .context("Could not cache the album review")?;
    Ok(())
}

pub(crate) fn upsert_album_review_for_app(
    app: &AppHandle,
    record: &AlbumReviewCacheRecord,
) -> Result<()> {
    let (conn, _) = open(app)?;
    upsert_album_review(&conn, record)
}

pub(super) fn lastfm_local_track_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<LastFmLocalTrackCandidate> {
    Ok(LastFmLocalTrackCandidate {
        track_id: row.get(0)?,
        artist_key: row.get(1)?,
        album_id: row.get(2)?,
        album: row.get(3)?,
        album_artist: row.get(4)?,
        display_artist: row.get(5)?,
        title: row.get(6)?,
        year: row.get(7)?,
        seconds: row.get(8)?,
        disc_number: row.get(9)?,
        track_number: row.get(10)?,
    })
}

pub(crate) fn lastfm_local_tracks_for_artist_for_app(
    app: &AppHandle,
    artist_id: &str,
) -> Result<Vec<LastFmLocalTrackCandidate>> {
    let (conn, _) = open_read(app)?;
    let artist_key = artist_key_sql("COALESCE(t.album_artist_display, a.album_artist_display)");
    let sql = format!(
        "
        SELECT
            t.id,
            {artist_key} AS artist_key,
            t.album_id,
            COALESCE(t.album, a.album),
            COALESCE(t.album_artist_display, a.album_artist_display),
            t.display_artist,
            t.title,
            COALESCE(a.year, t.year),
            t.time_seconds,
            t.disc_number,
            t.track_number
        FROM tracks t
        LEFT JOIN albums a ON a.id = t.album_id
        WHERE {artist_key} = ?1
          AND NULLIF(TRIM(COALESCE(t.title, '')), '') IS NOT NULL
        ORDER BY COALESCE(a.year, t.year, 9999), LOWER(COALESCE(t.album, a.album, '')),
                 COALESCE(t.disc_number, 1), COALESCE(t.track_number, 9999), t.id
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    let tracks = stmt
        .query_map([artist_id], lastfm_local_track_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load local tracks for Last.fm artist popularity")?;
    Ok(tracks)
}

pub(crate) fn lastfm_local_tracks_for_album_for_app(
    app: &AppHandle,
    album_id: &str,
) -> Result<Vec<LastFmLocalTrackCandidate>> {
    let (conn, _) = open_read(app)?;
    let artist_key = artist_key_sql("COALESCE(t.album_artist_display, a.album_artist_display)");
    let sql = format!(
        "
        SELECT
            t.id,
            {artist_key} AS artist_key,
            t.album_id,
            COALESCE(t.album, a.album),
            COALESCE(t.album_artist_display, a.album_artist_display),
            t.display_artist,
            t.title,
            COALESCE(a.year, t.year),
            t.time_seconds,
            t.disc_number,
            t.track_number
        FROM tracks t
        LEFT JOIN albums a ON a.id = t.album_id
        WHERE t.album_id = ?1
          AND NULLIF(TRIM(COALESCE(t.title, '')), '') IS NOT NULL
        ORDER BY COALESCE(t.disc_number, 1), COALESCE(t.track_number, 9999), t.id
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    let tracks = stmt
        .query_map([album_id], lastfm_local_track_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load local album tracks for Last.fm popularity")?;
    Ok(tracks)
}

pub(crate) fn lastfm_artist_popularity_cache_for_app(
    app: &AppHandle,
    artist_key: &str,
) -> Result<Option<LastFmArtistPopularityCacheRecord>> {
    let (conn, _) = open_read(app)?;
    conn.query_row(
        "
        SELECT artist_key, artist_name, musicbrainz_mbid, source_url, state,
               message, fetched_at, expires_at
        FROM lastfm_artist_popularity
        WHERE artist_key = ?1
        ",
        [artist_key],
        |row| {
            Ok(LastFmArtistPopularityCacheRecord {
                artist_key: row.get(0)?,
                artist_name: row.get(1)?,
                musicbrainz_mbid: row.get(2)?,
                source_url: row.get(3)?,
                state: row.get(4)?,
                message: row.get(5)?,
                fetched_at: row.get(6)?,
                expires_at: row.get(7)?,
            })
        },
    )
    .optional()
    .context("Could not load the Last.fm artist popularity cache")
}

pub(crate) fn lastfm_artist_similarity_cache_for_app(
    app: &AppHandle,
    artist_key: &str,
) -> Result<Option<LastFmArtistSimilarityCacheRecord>> {
    let (conn, _) = open_read(app)?;
    conn.query_row(
        "
        SELECT artist_key, artist_name, musicbrainz_mbid, source_url, state,
               message, fetched_at, expires_at
        FROM lastfm_artist_similarity
        WHERE artist_key = ?1
        ",
        [artist_key],
        |row| {
            Ok(LastFmArtistSimilarityCacheRecord {
                artist_key: row.get(0)?,
                artist_name: row.get(1)?,
                musicbrainz_mbid: row.get(2)?,
                source_url: row.get(3)?,
                state: row.get(4)?,
                message: row.get(5)?,
                fetched_at: row.get(6)?,
                expires_at: row.get(7)?,
            })
        },
    )
    .optional()
    .context("Could not load the Last.fm artist similarity cache")
}

pub(crate) fn lastfm_similar_artist_cache_for_app(
    app: &AppHandle,
    artist_key: &str,
) -> Result<Vec<LastFmSimilarArtistCacheRecord>> {
    let (conn, _) = open_read(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT artist_key, rank, similar_artist_name, similar_artist_mbid,
               match_score, source_url, fetched_at, expires_at
        FROM lastfm_similar_artists
        WHERE artist_key = ?1
        ORDER BY rank
        ",
    )?;
    let artists = stmt
        .query_map([artist_key], |row| {
            Ok(LastFmSimilarArtistCacheRecord {
                artist_key: row.get(0)?,
                rank: row.get(1)?,
                similar_artist_name: row.get(2)?,
                similar_artist_mbid: row.get(3)?,
                match_score: row.get(4)?,
                source_url: row.get(5)?,
                fetched_at: row.get(6)?,
                expires_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load cached Last.fm similar artists")?;
    Ok(artists)
}

pub(super) fn lastfm_similar_local_artists(
    conn: &Connection,
    candidates: &[(Option<String>, String)],
) -> Result<Vec<Option<LastFmSimilarLocalArtist>>> {
    let album_artist_key = artist_key_sql("a.album_artist_display");
    let representative_artist_key = artist_key_sql("a3.album_artist_display");
    let sql = format!(
        "
        WITH grouped AS (
            SELECT
                {album_artist_key} AS artist_key,
                COALESCE(MIN(NULLIF(TRIM(a.album_artist_display), '')), 'Unknown Artist') AS artist_name,
                COUNT(*) AS album_count
            FROM albums a
            GROUP BY {album_artist_key}
        )
        SELECT
            grouped.artist_key,
            grouped.artist_name,
            grouped.album_count,
            EXISTS(
                SELECT 1 FROM artist_images image
                WHERE image.artist_key = grouped.artist_key
                  AND image.state = 'available'
                  AND NULLIF(TRIM(COALESCE(image.cache_path, '')), '') IS NOT NULL
            ) AS portrait_available,
            (
                SELECT a3.id FROM albums a3
                LEFT JOIN album_covers c3 ON c3.album_id = a3.id
                WHERE {representative_artist_key} = grouped.artist_key
                ORDER BY c3.cache_path IS NOT NULL DESC, a3.album_score DESC, a3.year ASC, a3.id ASC
                LIMIT 1
            ) AS representative_album_id,
            (
                SELECT a3.album FROM albums a3
                LEFT JOIN album_covers c3 ON c3.album_id = a3.id
                WHERE {representative_artist_key} = grouped.artist_key
                ORDER BY c3.cache_path IS NOT NULL DESC, a3.album_score DESC, a3.year ASC, a3.id ASC
                LIMIT 1
            ) AS representative_album,
            (
                SELECT c3.cache_path FROM albums a3
                JOIN album_covers c3 ON c3.album_id = a3.id
                WHERE {representative_artist_key} = grouped.artist_key
                ORDER BY a3.album_score DESC, a3.year ASC, a3.id ASC
                LIMIT 1
            ) AS representative_cover_path
        FROM grouped
        LEFT JOIN musicbrainz_artist_infos info
          ON info.local_artist_key = grouped.artist_key
        LEFT JOIN musicbrainz_artist_links link
          ON link.local_artist_key = grouped.artist_key
        WHERE (
                NULLIF(TRIM(COALESCE(?1, '')), '') IS NOT NULL
            AND LOWER(COALESCE(link.mbid, info.mbid, '')) = LOWER(?1)
        ) OR grouped.artist_key = ?2
        ORDER BY CASE
            WHEN NULLIF(TRIM(COALESCE(?1, '')), '') IS NOT NULL
             AND LOWER(COALESCE(link.mbid, info.mbid, '')) = LOWER(?1)
            THEN 0 ELSE 1 END
        LIMIT 1
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    candidates
        .iter()
        .map(|(mbid, name)| {
            let artist_key = identity::artist_key(name);
            stmt.query_row(params![mbid, artist_key], |row| {
                Ok(LastFmSimilarLocalArtist {
                    artist_id: row.get(0)?,
                    artist_name: row.get(1)?,
                    album_count: row.get(2)?,
                    portrait_available: row.get(3)?,
                    representative_album_id: row.get(4)?,
                    representative_album: row.get(5)?,
                    representative_cover_path: row.get(6)?,
                })
            })
            .optional()
            .context("Could not match a Last.fm similar artist to the local library")
        })
        .collect()
}

pub(crate) fn lastfm_similar_local_artists_for_app(
    app: &AppHandle,
    candidates: &[(Option<String>, String)],
) -> Result<Vec<Option<LastFmSimilarLocalArtist>>> {
    let (conn, _) = open_read(app)?;
    lastfm_similar_local_artists(&conn, candidates)
}

pub(crate) fn lastfm_album_relationships_cache_for_app(
    app: &AppHandle,
    album_id: &str,
) -> Result<Option<LastFmAlbumRelationshipsCacheRecord>> {
    let (conn, _) = open_read(app)?;
    conn.query_row(
        "
        SELECT album_id, album_artist, album_title, source_url,
               source_tags_json, state, message, fetched_at, expires_at
        FROM lastfm_album_relationships
        WHERE album_id = ?1
        ",
        [album_id],
        |row| {
            Ok(LastFmAlbumRelationshipsCacheRecord {
                album_id: row.get(0)?,
                album_artist: row.get(1)?,
                album_title: row.get(2)?,
                source_url: row.get(3)?,
                source_tags_json: row.get(4)?,
                state: row.get(5)?,
                message: row.get(6)?,
                fetched_at: row.get(7)?,
                expires_at: row.get(8)?,
            })
        },
    )
    .optional()
    .context("Could not load the Last.fm related-album cache")
}

pub(crate) fn lastfm_related_album_cache_for_app(
    app: &AppHandle,
    album_id: &str,
) -> Result<Vec<LastFmRelatedAlbumCacheRecord>> {
    let (conn, _) = open_read(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT album_id, rank, candidate_artist_name, candidate_artist_mbid,
               candidate_album_title, candidate_album_mbid, source_url,
               relationship_score, shared_tags_json, artist_similarity,
               fetched_at, expires_at
        FROM lastfm_related_albums
        WHERE album_id = ?1
        ORDER BY rank
        ",
    )?;
    let albums = stmt
        .query_map([album_id], |row| {
            Ok(LastFmRelatedAlbumCacheRecord {
                album_id: row.get(0)?,
                rank: row.get(1)?,
                candidate_artist_name: row.get(2)?,
                candidate_artist_mbid: row.get(3)?,
                candidate_album_title: row.get(4)?,
                candidate_album_mbid: row.get(5)?,
                source_url: row.get(6)?,
                relationship_score: row.get(7)?,
                shared_tags_json: row.get(8)?,
                artist_similarity: row.get(9)?,
                fetched_at: row.get(10)?,
                expires_at: row.get(11)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load cached Last.fm related albums")?;
    Ok(albums)
}

pub(super) fn lastfm_related_local_albums(
    conn: &Connection,
    candidates: &[(Option<String>, String, String)],
) -> Result<Vec<Option<LastFmRelatedLocalAlbum>>> {
    let album_artist_key = artist_key_sql("a.album_artist_display");
    let sql = format!(
        "
        SELECT
            a.id,
            COALESCE(NULLIF(TRIM(a.album_artist_display), ''), 'Unknown Artist'),
            COALESCE(NULLIF(TRIM(a.album), ''), 'Untitled album'),
            a.year,
            cover.cache_path,
            cover.mime_type,
            EXISTS(
                SELECT 1
                FROM musicbrainz_release_decisions decision
                WHERE decision.local_album_id = a.id
                  AND decision.decision = 'include'
                  AND NULLIF(TRIM(COALESCE(?1, '')), '') IS NOT NULL
                  AND LOWER(decision.release_mbid) = LOWER(?1)
            ) AS mbid_match
        FROM albums a
        LEFT JOIN album_covers cover ON cover.album_id = a.id
        WHERE {album_artist_key} = ?2
           OR EXISTS(
                SELECT 1
                FROM musicbrainz_release_decisions decision
                WHERE decision.local_album_id = a.id
                  AND decision.decision = 'include'
                  AND NULLIF(TRIM(COALESCE(?1, '')), '') IS NOT NULL
                  AND LOWER(decision.release_mbid) = LOWER(?1)
           )
        ORDER BY mbid_match DESC, a.year ASC, a.id ASC
        "
    );
    let mut stmt = conn.prepare(&sql)?;
    candidates
        .iter()
        .map(|(mbid, artist, album)| {
            let artist_key = identity::artist_key(artist);
            let album_key = identity::display_key(album);
            let rows = stmt
                .query_map(params![mbid, artist_key], |row| {
                    Ok((
                        LastFmRelatedLocalAlbum {
                            album_id: row.get(0)?,
                            album_artist: row.get(1)?,
                            album_title: row.get(2)?,
                            year: row.get(3)?,
                            cover_path: row.get(4)?,
                            cover_mime_type: row.get(5)?,
                        },
                        row.get::<_, bool>(6)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(rows.into_iter().find_map(|(local, mbid_match)| {
                (mbid_match || identity::display_key(&local.album_title) == album_key).then_some(local)
            }))
        })
        .collect::<Result<Vec<_>>>()
        .context("Could not match Last.fm related albums to the local library")
}

pub(crate) fn lastfm_related_local_albums_for_app(
    app: &AppHandle,
    candidates: &[(Option<String>, String, String)],
) -> Result<Vec<Option<LastFmRelatedLocalAlbum>>> {
    let (conn, _) = open_read(app)?;
    lastfm_related_local_albums(&conn, candidates)
}

pub(crate) fn lastfm_track_popularity_cache_for_app(
    app: &AppHandle,
    artist_key: &str,
) -> Result<Vec<LastFmTrackPopularityCacheRecord>> {
    let (conn, _) = open_read(app)?;
    let mut stmt = conn.prepare(
        "
        SELECT artist_key, track_key, artist_name, track_name,
               musicbrainz_recording_mbid, listeners, play_count, artist_rank,
               source_url, fetch_method, state, fetched_at, expires_at
        FROM lastfm_track_popularity
        WHERE artist_key = ?1
        ORDER BY artist_rank IS NULL, artist_rank, listeners DESC, play_count DESC, track_key
        ",
    )?;
    let tracks = stmt
        .query_map([artist_key], |row| {
            Ok(LastFmTrackPopularityCacheRecord {
                artist_key: row.get(0)?,
                track_key: row.get(1)?,
                artist_name: row.get(2)?,
                track_name: row.get(3)?,
                musicbrainz_recording_mbid: row.get(4)?,
                listeners: row.get(5)?,
                play_count: row.get(6)?,
                artist_rank: row.get(7)?,
                source_url: row.get(8)?,
                fetch_method: row.get(9)?,
                state: row.get(10)?,
                fetched_at: row.get(11)?,
                expires_at: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load cached Last.fm track popularity")?;
    Ok(tracks)
}

pub(super) fn upsert_lastfm_track_popularity(
    conn: &Connection,
    record: &LastFmTrackPopularityCacheRecord,
) -> Result<()> {
    conn.execute(
        "
        INSERT INTO lastfm_track_popularity (
            artist_key, track_key, artist_name, track_name,
            musicbrainz_recording_mbid, listeners, play_count, artist_rank,
            source_url, fetch_method, state, fetched_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ON CONFLICT(artist_key, track_key) DO UPDATE SET
            artist_name = excluded.artist_name,
            track_name = excluded.track_name,
            musicbrainz_recording_mbid = excluded.musicbrainz_recording_mbid,
            listeners = excluded.listeners,
            play_count = excluded.play_count,
            artist_rank = COALESCE(excluded.artist_rank, lastfm_track_popularity.artist_rank),
            source_url = excluded.source_url,
            fetch_method = excluded.fetch_method,
            state = excluded.state,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        ",
        params![
            record.artist_key,
            record.track_key,
            record.artist_name,
            record.track_name,
            record.musicbrainz_recording_mbid,
            record.listeners,
            record.play_count,
            record.artist_rank,
            record.source_url,
            record.fetch_method,
            record.state,
            record.fetched_at,
            record.expires_at,
        ],
    )
    .context("Could not cache Last.fm track popularity")?;
    Ok(())
}

pub(crate) fn replace_lastfm_artist_top_tracks_for_app(
    app: &AppHandle,
    artist: &LastFmArtistPopularityCacheRecord,
    tracks: &[LastFmTrackPopularityCacheRecord],
) -> Result<()> {
    let (mut conn, _) = open(app)?;
    let tx = conn
        .transaction()
        .context("Could not start the Last.fm artist popularity cache transaction")?;
    tx.execute(
        "UPDATE lastfm_track_popularity SET artist_rank = NULL WHERE artist_key = ?1",
        [artist.artist_key.as_str()],
    )?;
    for track in tracks {
        upsert_lastfm_track_popularity(&tx, track)?;
    }
    tx.execute(
        "
        INSERT INTO lastfm_artist_popularity (
            artist_key, artist_name, musicbrainz_mbid, source_url, state,
            message, fetched_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(artist_key) DO UPDATE SET
            artist_name = excluded.artist_name,
            musicbrainz_mbid = excluded.musicbrainz_mbid,
            source_url = excluded.source_url,
            state = excluded.state,
            message = excluded.message,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        ",
        params![
            artist.artist_key,
            artist.artist_name,
            artist.musicbrainz_mbid,
            artist.source_url,
            artist.state,
            artist.message,
            artist.fetched_at,
            artist.expires_at,
        ],
    )
    .context("Could not cache the Last.fm artist popularity refresh")?;
    tx.commit()
        .context("Could not commit the Last.fm artist popularity cache")?;
    Ok(())
}

pub(crate) fn replace_lastfm_artist_similarity_for_app(
    app: &AppHandle,
    artist: &LastFmArtistSimilarityCacheRecord,
    similar_artists: &[LastFmSimilarArtistCacheRecord],
) -> Result<()> {
    let (mut conn, _) = open(app)?;
    let tx = conn
        .transaction()
        .context("Could not start the Last.fm artist similarity cache transaction")?;
    tx.execute(
        "
        INSERT INTO lastfm_artist_similarity (
            artist_key, artist_name, musicbrainz_mbid, source_url, state,
            message, fetched_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(artist_key) DO UPDATE SET
            artist_name = excluded.artist_name,
            musicbrainz_mbid = excluded.musicbrainz_mbid,
            source_url = excluded.source_url,
            state = excluded.state,
            message = excluded.message,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        ",
        params![
            artist.artist_key,
            artist.artist_name,
            artist.musicbrainz_mbid,
            artist.source_url,
            artist.state,
            artist.message,
            artist.fetched_at,
            artist.expires_at,
        ],
    )
    .context("Could not cache the Last.fm artist similarity refresh")?;
    tx.execute(
        "DELETE FROM lastfm_similar_artists WHERE artist_key = ?1",
        [artist.artist_key.as_str()],
    )?;
    for similar in similar_artists {
        tx.execute(
            "
            INSERT INTO lastfm_similar_artists (
                artist_key, rank, similar_artist_name, similar_artist_mbid,
                match_score, source_url, fetched_at, expires_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
            params![
                similar.artist_key,
                similar.rank,
                similar.similar_artist_name,
                similar.similar_artist_mbid,
                similar.match_score,
                similar.source_url,
                similar.fetched_at,
                similar.expires_at,
            ],
        )
        .context("Could not cache a Last.fm similar artist")?;
    }
    tx.commit()
        .context("Could not commit the Last.fm artist similarity cache")?;
    Ok(())
}

pub(crate) fn replace_lastfm_album_relationships_for_app(
    app: &AppHandle,
    album: &LastFmAlbumRelationshipsCacheRecord,
    related_albums: &[LastFmRelatedAlbumCacheRecord],
) -> Result<()> {
    let (mut conn, _) = open(app)?;
    let tx = conn
        .transaction()
        .context("Could not start the Last.fm related-album cache transaction")?;
    tx.execute(
        "
        INSERT INTO lastfm_album_relationships (
            album_id, album_artist, album_title, source_url, source_tags_json,
            state, message, fetched_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(album_id) DO UPDATE SET
            album_artist = excluded.album_artist,
            album_title = excluded.album_title,
            source_url = excluded.source_url,
            source_tags_json = excluded.source_tags_json,
            state = excluded.state,
            message = excluded.message,
            fetched_at = excluded.fetched_at,
            expires_at = excluded.expires_at
        ",
        params![
            album.album_id,
            album.album_artist,
            album.album_title,
            album.source_url,
            album.source_tags_json,
            album.state,
            album.message,
            album.fetched_at,
            album.expires_at,
        ],
    )
    .context("Could not cache the Last.fm related-album refresh")?;
    tx.execute(
        "DELETE FROM lastfm_related_albums WHERE album_id = ?1",
        [album.album_id.as_str()],
    )?;
    for related in related_albums {
        tx.execute(
            "
            INSERT INTO lastfm_related_albums (
                album_id, rank, candidate_artist_name, candidate_artist_mbid,
                candidate_album_title, candidate_album_mbid, source_url,
                relationship_score, shared_tags_json, artist_similarity,
                fetched_at, expires_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ",
            params![
                related.album_id,
                related.rank,
                related.candidate_artist_name,
                related.candidate_artist_mbid,
                related.candidate_album_title,
                related.candidate_album_mbid,
                related.source_url,
                related.relationship_score,
                related.shared_tags_json,
                related.artist_similarity,
                related.fetched_at,
                related.expires_at,
            ],
        )
        .context("Could not cache a Last.fm related album")?;
    }
    tx.commit()
        .context("Could not commit the Last.fm related-album cache")?;
    Ok(())
}

pub(crate) fn upsert_lastfm_track_popularity_for_app(
    app: &AppHandle,
    record: &LastFmTrackPopularityCacheRecord,
) -> Result<()> {
    let (conn, _) = open(app)?;
    upsert_lastfm_track_popularity(&conn, record)
}

#[derive(Debug, Clone)]
pub(crate) struct ArtistImageCandidate {
    pub artist_key: String,
    pub artist_name: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ArtistImageCacheRecord {
    pub artist_key: String,
    pub artist_name: String,
    pub source_url: Option<String>,
    pub cache_path: Option<String>,
    pub mime_type: Option<String>,
    pub state: String,
    pub message: String,
}

pub(crate) fn artist_image_candidates_for_app(
    app: &AppHandle,
    limit: u32,
) -> Result<Vec<ArtistImageCandidate>> {
    let (conn, _) = open_read(app)?;
    let artist_key = artist_key_sql("a.album_artist_display");
    let mut stmt = conn.prepare(&format!(
        "
        SELECT
            {artist_key} AS artist_key,
            COALESCE(MIN(NULLIF(TRIM(a.album_artist_display), '')), 'Unknown Artist') AS artist_name
        FROM albums a
        LEFT JOIN artist_images image ON image.artist_key = {artist_key}
        WHERE image.artist_key IS NULL OR image.state = 'failed'
        GROUP BY {artist_key}
        ORDER BY COUNT(*) DESC, LOWER(artist_name) ASC
        LIMIT ?
        "
    ))?;
    let candidates = stmt
        .query_map([i64::from(limit.clamp(1, 200))], |row| {
            Ok(ArtistImageCandidate {
                artist_key: row.get(0)?,
                artist_name: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("Could not load artists awaiting portrait enrichment")?;
    Ok(candidates)
}

pub(crate) fn artist_image_remaining_for_app(app: &AppHandle) -> Result<i64> {
    let (conn, _) = open_read(app)?;
    let artist_key = artist_key_sql("a.album_artist_display");
    conn.query_row(
        &format!(
            "
            SELECT COUNT(*) FROM (
                SELECT {artist_key} AS artist_key
                FROM albums a
                LEFT JOIN artist_images image ON image.artist_key = {artist_key}
                WHERE image.artist_key IS NULL OR image.state = 'failed'
                GROUP BY {artist_key}
            )
            "
        ),
        [],
        |row| row.get(0),
    )
    .context("Could not count artists awaiting portrait enrichment")
}

pub(crate) fn upsert_artist_image_for_app(
    app: &AppHandle,
    record: &ArtistImageCacheRecord,
) -> Result<()> {
    let (conn, _) = open(app)?;
    let fetched_at = Utc::now().to_rfc3339();
    conn.execute(
        "
        INSERT INTO artist_images (
            artist_key, artist_name, source, source_url, cache_path,
            mime_type, state, message, fetched_at
        ) VALUES (?, ?, 'lastfm', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(artist_key) DO UPDATE SET
            artist_name = excluded.artist_name,
            source = excluded.source,
            source_url = excluded.source_url,
            cache_path = excluded.cache_path,
            mime_type = excluded.mime_type,
            state = excluded.state,
            message = excluded.message,
            fetched_at = excluded.fetched_at
        ",
        params![
            &record.artist_key,
            &record.artist_name,
            &record.source_url,
            &record.cache_path,
            &record.mime_type,
            &record.state,
            &record.message,
            &fetched_at,
        ],
    )
    .context("Could not save the artist portrait cache record")?;
    if record.state == "available" {
        if let Some(path) = &record.cache_path {
            crate::thumbnails::prewarm(
                app.path().app_data_dir()?.join("thumbs"),
                vec![(
                    format!("artist:{}", record.artist_key),
                    PathBuf::from(path),
                    fetched_at,
                )],
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::*;

    #[test]
    fn matches_similar_artists_by_mbid_then_normalized_library_name() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_infos (
                local_artist_key, display_artist, mbid, review_state,
                source, created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys',
                'be540c02-7898-4e2a-a7bd-9f85319f4597', 'imported',
                'test', '2026-08-12T12:00:00Z', '2026-08-12T12:00:00Z'
            )
            ",
            [],
        )
        .expect("insert MusicBrainz artist identity");

        let matches = lastfm_similar_local_artists(
            &conn,
            &[
                (
                    Some("be540c02-7898-4e2a-a7bd-9f85319f4597".to_string()),
                    "Provider Alias".to_string(),
                ),
                (None, "  PET SHOP BOYS  ".to_string()),
                (None, "Missing Artist".to_string()),
            ],
        )
        .expect("match similar artists");

        assert_eq!(
            matches[0].as_ref().map(|artist| artist.artist_id.as_str()),
            Some("pet shop boys")
        );
        assert_eq!(
            matches[1].as_ref().map(|artist| artist.album_count),
            Some(1)
        );
        assert_eq!(matches[2], None);
    }

    #[test]
    fn matches_related_albums_by_mbid_then_normalized_artist_and_title() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_links (
                local_artist_key, display_artist, mbid, canonical_name,
                match_method, confidence, verification_state, ignored,
                created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys',
                'be540c02-7898-4e2a-a7bd-9f85319f4597', 'Pet Shop Boys',
                'manual', 1.0, 'verified', 0,
                '2026-08-12T12:00:00Z', '2026-08-12T12:00:00Z'
            )
            ",
            [],
        )
        .expect("insert MusicBrainz artist link");
        conn.execute(
            "
            INSERT INTO musicbrainz_release_decisions (
                local_artist_key, release_mbid, decision, local_album_id,
                created_at, updated_at
            ) VALUES (
                'pet shop boys', '57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f',
                'include', 'mb:test',
                '2026-08-12T12:00:00Z', '2026-08-12T12:00:00Z'
            )
            ",
            [],
        )
        .expect("insert MusicBrainz release decision");

        let matches = lastfm_related_local_albums(
            &conn,
            &[
                (
                    Some("57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f".to_string()),
                    "Provider Alias".to_string(),
                    "Different Title".to_string(),
                ),
                (
                    None,
                    "  PET SHOP BOYS  ".to_string(),
                    "  ACTUALLY  ".to_string(),
                ),
                (
                    None,
                    "Missing Artist".to_string(),
                    "Missing Album".to_string(),
                ),
            ],
        )
        .expect("match related albums");

        assert_eq!(
            matches[0].as_ref().map(|album| album.album_id.as_str()),
            Some("mb:test")
        );
        assert_eq!(matches[1].as_ref().and_then(|album| album.year), Some(1987));
        assert_eq!(matches[2], None);
    }

    #[test]
    fn resolves_and_caches_album_review_identity() {
        let conn = seeded_connection();
        conn.execute(
            "
            INSERT INTO musicbrainz_artist_links (
                local_artist_key, display_artist, mbid, canonical_name,
                match_method, confidence, verification_state, ignored,
                created_at, updated_at
            ) VALUES (
                'pet shop boys', 'Pet Shop Boys',
                'd42c5dcb-ca99-420f-8aa1-79d1e8b8b907', 'Pet Shop Boys',
                'manual', 1.0, 'verified', 0, datetime('now'), datetime('now')
            )
            ",
            [],
        )
        .expect("insert artist link");
        conn.execute(
            "
            INSERT INTO musicbrainz_release_decisions (
                local_artist_key, release_mbid, decision, local_album_id,
                created_at, updated_at
            ) VALUES (
                'pet shop boys', '11111111-1111-1111-1111-111111111111',
                'include', 'mb:test', datetime('now'), datetime('now')
            )
            ",
            [],
        )
        .expect("insert release decision");

        let identity = album_review_identity(&conn, "mb:test")
            .expect("resolve album identity")
            .expect("album identity");
        assert_eq!(identity.album_artist, "Pet Shop Boys");
        assert_eq!(identity.album_title, "Actually");
        assert_eq!(
            identity.release_group_mbid.as_deref(),
            Some("11111111-1111-1111-1111-111111111111")
        );

        let record = AlbumReviewCacheRecord {
            album_id: identity.album_id.clone(),
            album_artist: identity.album_artist.clone(),
            album_title: identity.album_title.clone(),
            album_year: identity.album_year,
            artist_mbid: identity.artist_mbid.clone(),
            release_group_mbid: identity.release_group_mbid.clone(),
            review_id: Some("22222222-2222-2222-2222-222222222222".to_string()),
            review_text: Some("A precise, durable album review.".to_string()),
            reviewer_name: Some("Reviewer".to_string()),
            rating: Some(4),
            language: Some("en".to_string()),
            review_source: None,
            source_url: Some(
                "https://critiquebrainz.org/review/22222222-2222-2222-2222-222222222222"
                    .to_string(),
            ),
            license_id: Some("CC BY-SA 3.0".to_string()),
            license_name: Some("Creative Commons Attribution-ShareAlike".to_string()),
            license_url: Some("https://creativecommons.org/licenses/by-sa/3.0/".to_string()),
            state: "available".to_string(),
            message: "Album review loaded from CritiqueBrainz.".to_string(),
            fetched_at: "2026-08-11T12:00:00Z".to_string(),
            expires_at: "2026-09-10T12:00:00Z".to_string(),
        };
        upsert_album_review(&conn, &record).expect("cache album review");
        let cached = album_review_cache(&conn, "mb:test")
            .expect("read album review cache")
            .expect("cached album review");

        assert_eq!(cached.review_text, record.review_text);
        assert_eq!(cached.reviewer_name.as_deref(), Some("Reviewer"));
        assert_eq!(cached.rating, Some(4));
        assert_eq!(cached.license_id.as_deref(), Some("CC BY-SA 3.0"));
    }
}
