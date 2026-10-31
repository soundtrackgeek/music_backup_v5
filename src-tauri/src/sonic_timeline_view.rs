//! Read-only views of saved per-second timelines (`timeline-v1`).
//!
//! The caller passes a read-only catalog connection with `sonic` (analysis) and
//! `timeline` (timelines) attached when those files exist. A track's timeline is
//! found through its audio hash: `tracks` -> `sonic_tracks` -> `timelines`.
//! Long tracks are averaged down to at most [`MAX_POINTS`] points.
use crate::sonic_timeline::{COLUMNS, VERSION};
use music_sonic_core::{file_is_current, PROFILE};
use rusqlite::{params_from_iter, types::Value, Connection, OptionalExtension};
use serde::Serialize;

/// Enough points for a full-width chart; a 3-hour file stays under 100 KB of JSON.
pub(crate) const MAX_POINTS: usize = 600;
const LEVEL: usize = 13;
const BRIGHTNESS: usize = 12;
const WIDTH: usize = 14;
const CORRELATION: usize = 15;
const LEVEL_FLOOR_DB: f64 = -120.0;

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TimelineTrack {
    pub track_id: i64,
    pub title: String,
    pub disc_number: Option<i64>,
    pub track_number: Option<i64>,
    pub seconds: Option<i64>,
    /// `ready`, `failed`, `missing` (analyzed, timeline not saved yet),
    /// `notAnalyzed` or `notMp3`.
    pub state: String,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AlbumTimelines {
    pub tracks: Vec<TimelineTrack>,
    pub ready: i64,
}

#[derive(Clone, Debug, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TimelinePoint {
    /// Start of this point, in seconds from the beginning of the track.
    pub start: i64,
    /// dBFS of the (L+R)/2 mix, averaged as power.
    pub level: Option<f64>,
    /// Spectral centroid in Hz.
    pub brightness: Option<f64>,
    /// Side/Mid energy in dB. None for mono or silent stretches.
    pub width: Option<f64>,
    /// Left/right correlation, -1 to 1.
    pub correlation: Option<f64>,
    /// Pitch-class energy share, C to B.
    pub chroma: Vec<f64>,
}

#[derive(Clone, Debug, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackTimeline {
    pub track_id: i64,
    pub title: String,
    /// The `TimelineTrack` states, plus `changed` when the file was edited
    /// after analysis, `gone` when the track is not in the catalog, and
    /// `unreadable` when the stored data does not match its header.
    pub state: String,
    pub error: Option<String>,
    /// Seconds covered by the timeline (one row per second).
    pub seconds: i64,
    pub bucket_seconds: i64,
    pub channels: Option<i64>,
    pub sample_rate: Option<i64>,
    pub left_db: Option<f64>,
    pub right_db: Option<f64>,
    pub truncated: bool,
    pub points: Vec<TimelinePoint>,
}

fn is_mp3(filename: &str) -> bool {
    filename.to_ascii_lowercase().ends_with(".mp3")
}

fn joins(has_sonic: bool, has_timeline: bool) -> (&'static str, &'static str) {
    match (has_sonic, has_timeline) {
        (true, true) => (
            "s.audio_hash, x.audio_hash IS NOT NULL, x.error",
            "LEFT JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename AND s.profile=?2
             LEFT JOIN timeline.timelines x ON x.audio_hash=s.audio_hash AND x.version=?3",
        ),
        (true, false) => (
            "s.audio_hash, 0, NULL",
            "LEFT JOIN sonic.sonic_tracks s ON s.directory=t.file_path AND s.filename=t.filename AND s.profile=?2",
        ),
        _ => ("NULL, 0, NULL", ""),
    }
}

/// The parameters each join shape uses: ?1 is the album or track id.
fn args(first: Value, has_sonic: bool, has_timeline: bool) -> Vec<Value> {
    let mut v = vec![first];
    if has_sonic {
        v.push(PROFILE.to_string().into());
        if has_timeline {
            v.push(VERSION.to_string().into());
        }
    }
    v
}

fn state(filename: &str, hash: Option<&str>, saved: bool, error: Option<&str>) -> &'static str {
    if !is_mp3(filename) {
        "notMp3"
    } else if hash.is_none() {
        "notAnalyzed"
    } else if !saved {
        "missing"
    } else if error.is_some() {
        "failed"
    } else {
        "ready"
    }
}

pub(crate) fn album(
    c: &Connection,
    has_sonic: bool,
    has_timeline: bool,
    album_id: &str,
) -> rusqlite::Result<AlbumTimelines> {
    let (columns, join) = joins(has_sonic, has_timeline);
    let sql = format!(
        "SELECT t.id, COALESCE(t.title,''), t.disc_number, t.track_number, t.time_seconds,
                COALESCE(t.filename,''), {columns}
         FROM tracks t {join}
         WHERE t.album_id=?1
         ORDER BY COALESCE(t.disc_number,0), COALESCE(t.track_number,0), t.id
         LIMIT 2000"
    );
    let mut q = c.prepare(&sql)?;
    let tracks = q
        .query_map(params_from_iter(args(album_id.to_string().into(), has_sonic, has_timeline)), |r| {
            let filename: String = r.get(5)?;
            let hash: Option<String> = r.get(6)?;
            let saved: bool = r.get(7)?;
            let error: Option<String> = r.get(8)?;
            Ok(TimelineTrack {
                track_id: r.get(0)?,
                title: r.get(1)?,
                disc_number: r.get(2)?,
                track_number: r.get(3)?,
                seconds: r.get(4)?,
                state: state(&filename, hash.as_deref(), saved, error.as_deref()).into(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let ready = tracks.iter().filter(|t| t.state == "ready").count() as i64;
    Ok(AlbumTimelines { tracks, ready })
}

pub(crate) fn track(
    c: &Connection,
    has_sonic: bool,
    has_timeline: bool,
    track_id: i64,
) -> rusqlite::Result<TrackTimeline> {
    let (columns, join) = joins(has_sonic, has_timeline);
    let detail = if has_sonic && has_timeline {
        "x.rows, x.channels, x.sample_rate, x.left_db, x.right_db, x.truncated, x.data, s.size, s.modified"
    } else if has_sonic {
        "0, NULL, NULL, NULL, NULL, 0, NULL, s.size, s.modified"
    } else {
        "0, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL"
    };
    let sql = format!(
        "SELECT COALESCE(t.title,''), COALESCE(t.file_path,''), COALESCE(t.filename,''), {columns}, {detail}
         FROM tracks t {join}
         WHERE t.id=?1"
    );
    type Row = (
        String,
        String,
        String,
        Option<String>,
        bool,
        Option<String>,
        i64,
        Option<i64>,
        Option<i64>,
        Option<f64>,
        Option<f64>,
        bool,
        Option<Vec<u8>>,
        Option<i64>,
        Option<String>,
    );
    let row: Option<Row> = c
        .query_row(&sql, params_from_iter(args(track_id.into(), has_sonic, has_timeline)), |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
                r.get(6)?,
                r.get(7)?,
                r.get(8)?,
                r.get(9)?,
                r.get(10)?,
                r.get(11)?,
                r.get(12)?,
                r.get(13)?,
                r.get(14)?,
            ))
        })
        .optional()?;
    let Some((
        title,
        directory,
        filename,
        hash,
        saved,
        error,
        rows,
        channels,
        sample_rate,
        left_db,
        right_db,
        truncated,
        data,
        size,
        modified,
    )) = row
    else {
        return Ok(TrackTimeline {
            track_id,
            state: "gone".into(),
            ..Default::default()
        });
    };
    let mut out = TrackTimeline {
        track_id,
        title,
        state: state(&filename, hash.as_deref(), saved, error.as_deref()).into(),
        error,
        ..Default::default()
    };
    if out.state != "ready" {
        return Ok(out);
    }
    let current = size.zip(modified.as_deref()).is_some_and(|(size, modified)| {
        size >= 0 && file_is_current(&directory, &filename, size as u64, modified)
    });
    if !current {
        out.state = "changed".into();
        return Ok(out);
    }
    let rows = usize::try_from(rows).unwrap_or(0);
    let Some(values) = data.and_then(|d| decode(&d, rows)) else {
        out.state = "unreadable".into();
        return Ok(out);
    };
    let bucket = rows.div_ceil(MAX_POINTS).max(1);
    out.seconds = rows as i64;
    out.bucket_seconds = bucket as i64;
    out.channels = channels;
    out.sample_rate = sample_rate;
    out.left_db = left_db;
    out.right_db = right_db;
    out.truncated = truncated;
    out.points = downsample(&values, rows, bucket);
    Ok(out)
}

fn decode(data: &[u8], rows: usize) -> Option<Vec<f32>> {
    if rows == 0 || data.len() != rows * COLUMNS * 2 {
        return None;
    }
    Some(
        data.chunks_exact(2)
            .map(|b| half::f16::from_le_bytes([b[0], b[1]]).to_f32())
            .collect(),
    )
}

/// Mean of the finite values in one column over `rows`, or None.
fn mean(rows: &[&[f32]], column: usize, map: impl Fn(f64) -> f64) -> Option<f64> {
    let (sum, n) = rows
        .iter()
        .map(|r| r[column] as f64)
        .filter(|v| v.is_finite())
        .fold((0.0, 0usize), |(s, n), v| (s + map(v), n + 1));
    (n > 0).then(|| sum / n as f64)
}

fn round(v: f64, places: i32) -> f64 {
    let f = 10f64.powi(places);
    (v * f).round() / f
}

pub(crate) fn downsample(values: &[f32], rows: usize, bucket: usize) -> Vec<TimelinePoint> {
    let all: Vec<&[f32]> = values.chunks_exact(COLUMNS).take(rows).collect();
    all.chunks(bucket.max(1))
        .enumerate()
        .map(|(i, chunk)| {
            // Average level as power so a loud second is not hidden by quiet ones.
            let level = mean(chunk, LEVEL, |db| 10f64.powf(db / 10.0))
                .map(|p| (10.0 * p.log10()).max(LEVEL_FLOOR_DB));
            TimelinePoint {
                start: (i * bucket) as i64,
                level: level.map(|v| round(v, 1)),
                brightness: mean(chunk, BRIGHTNESS, |v| v).map(|v| v.round()),
                width: mean(chunk, WIDTH, |v| v).map(|v| round(v, 1)),
                correlation: mean(chunk, CORRELATION, |v| v).map(|v| round(v, 3)),
                chroma: (0..12)
                    .map(|c| round(mean(chunk, c, |v| v).unwrap_or(0.0), 3))
                    .collect(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use music_sonic_core::file_signature;
    use rusqlite::params;

    fn row(level: f32, brightness: f32, width: f32, correlation: f32) -> Vec<f32> {
        let mut r = vec![0.0; COLUMNS];
        r[9] = 1.0; // all energy on A
        r[BRIGHTNESS] = brightness;
        r[LEVEL] = level;
        r[WIDTH] = width;
        r[CORRELATION] = correlation;
        r
    }

    fn bytes(rows: &[Vec<f32>]) -> Vec<u8> {
        rows.iter()
            .flatten()
            .flat_map(|v| half::f16::from_f32(*v).to_le_bytes())
            .collect()
    }

    fn fixture(timeline: bool) -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE tracks(id INTEGER PRIMARY KEY,title TEXT,album_id TEXT,disc_number INTEGER,
                track_number INTEGER,time_seconds INTEGER,file_path TEXT,filename TEXT);
             ATTACH DATABASE ':memory:' AS sonic;
             CREATE TABLE sonic.sonic_tracks(track_key TEXT PRIMARY KEY,directory TEXT,filename TEXT,
                audio_hash TEXT,profile TEXT,size INTEGER,modified TEXT);",
        )
        .unwrap();
        if timeline {
            c.execute_batch(
                "ATTACH DATABASE ':memory:' AS timeline;
                 CREATE TABLE timeline.timelines(audio_hash TEXT,version TEXT,rows INTEGER,channels INTEGER,
                    sample_rate INTEGER,left_db REAL,right_db REAL,truncated INTEGER,data BLOB,error TEXT,
                    created_at TEXT,PRIMARY KEY(audio_hash,version));",
            )
            .unwrap();
        }
        let d = dir.path().to_string_lossy().to_string();
        for (id, name, track_no) in [
            (1, "ready.mp3", 2),
            (2, "failed.mp3", 1),
            (3, "pending.mp3", 3),
            (4, "new.mp3", 4),
            (5, "cover.flac", 5),
        ] {
            std::fs::write(dir.path().join(name), [7; 64]).unwrap();
            c.execute(
                "INSERT INTO tracks VALUES(?1,?2,'album',1,?3,180,?4,?2)",
                params![id, name, track_no, d],
            )
            .unwrap();
            if id <= 3 {
                let (size, modified) = file_signature(&dir.path().join(name)).unwrap();
                c.execute(
                    "INSERT INTO sonic.sonic_tracks VALUES(?1,?2,?1,?1,?3,?4,?5)",
                    params![name, d, PROFILE, size as i64, modified],
                )
                .unwrap();
            }
        }
        if timeline {
            let rows: Vec<Vec<f32>> = (0..5)
                .map(|i| row(-20.0 + i as f32, 1000.0 * (i + 1) as f32, -12.0, 0.8))
                .collect();
            c.execute(
                "INSERT INTO timeline.timelines VALUES('ready.mp3',?1,5,2,44100,-18.5,-19.0,0,?2,NULL,'now')",
                params![VERSION, bytes(&rows)],
            )
            .unwrap();
            c.execute(
                "INSERT INTO timeline.timelines VALUES('failed.mp3',?1,0,NULL,NULL,NULL,NULL,0,NULL,'bad frame','now')",
                [VERSION],
            )
            .unwrap();
        }
        (dir, c)
    }

    #[test]
    fn lists_album_tracks_in_order_with_their_timeline_state() {
        let (_dir, c) = fixture(true);
        let album = album(&c, true, true, "album").unwrap();
        let states: Vec<_> = album
            .tracks
            .iter()
            .map(|t| (t.track_id, t.state.as_str()))
            .collect();
        assert_eq!(
            states,
            [
                (2, "failed"),
                (1, "ready"),
                (3, "missing"),
                (4, "notAnalyzed"),
                (5, "notMp3")
            ]
        );
        assert_eq!(album.ready, 1);
    }

    #[test]
    fn works_before_any_timeline_or_analysis_exists() {
        let (_dir, c) = fixture(false);
        let states: Vec<_> = album(&c, true, false, "album")
            .unwrap()
            .tracks
            .into_iter()
            .map(|t| t.state)
            .collect();
        assert_eq!(states, ["missing", "missing", "missing", "notAnalyzed", "notMp3"]);
        assert!(album(&c, false, false, "album")
            .unwrap()
            .tracks
            .iter()
            .all(|t| t.state == "notAnalyzed" || t.state == "notMp3"));
        assert_eq!(track(&c, true, false, 1).unwrap().state, "missing");
        assert_eq!(track(&c, false, false, 1).unwrap().state, "notAnalyzed");
    }

    #[test]
    fn reads_a_ready_timeline_and_reports_other_states() {
        let (dir, c) = fixture(true);
        let t = track(&c, true, true, 1).unwrap();
        assert_eq!(t.state, "ready");
        assert_eq!((t.seconds, t.bucket_seconds, t.points.len()), (5, 1, 5));
        assert_eq!(t.channels, Some(2));
        let first = &t.points[0];
        assert_eq!(first.level, Some(-20.0));
        assert_eq!(first.brightness, Some(1000.0));
        assert_eq!(first.width, Some(-12.0));
        assert_eq!(first.chroma[9], 1.0);
        assert_eq!(t.points[4].start, 4);

        let failed = track(&c, true, true, 2).unwrap();
        assert_eq!(failed.state, "failed");
        assert_eq!(failed.error.as_deref(), Some("bad frame"));
        assert!(failed.points.is_empty());
        assert_eq!(track(&c, true, true, 99).unwrap().state, "gone");

        std::fs::write(dir.path().join("ready.mp3"), [1; 128]).unwrap();
        assert_eq!(track(&c, true, true, 1).unwrap().state, "changed");
    }

    #[test]
    fn rejects_data_that_does_not_match_its_row_count() {
        let (_dir, c) = fixture(true);
        c.execute("UPDATE timeline.timelines SET rows=6 WHERE audio_hash='ready.mp3'", [])
            .unwrap();
        assert_eq!(track(&c, true, true, 1).unwrap().state, "unreadable");
    }

    #[test]
    fn downsampling_averages_level_as_power_and_skips_missing_stereo() {
        // One loud second and one silent second: the power mean is 3 dB under
        // the loud second, not halfway to the floor.
        let rows = [row(-10.0, 1000.0, f32::NAN, f32::NAN), row(-120.0, 3000.0, f32::NAN, f32::NAN)];
        let values: Vec<f32> = rows.iter().flatten().copied().collect();
        let points = downsample(&values, 2, 2);
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].level, Some(-13.0));
        assert_eq!(points[0].brightness, Some(2000.0));
        assert_eq!(points[0].width, None);
        assert_eq!(points[0].correlation, None);
    }

    #[test]
    fn long_tracks_stay_within_the_point_limit() {
        let rows = 3 * 60 * 60;
        let values = vec![0.0f32; rows * COLUMNS];
        let bucket = rows.div_ceil(MAX_POINTS);
        let points = downsample(&values, rows, bucket);
        assert!(points.len() <= MAX_POINTS);
        assert_eq!(points.last().unwrap().start, ((points.len() - 1) * bucket) as i64);
    }
}
