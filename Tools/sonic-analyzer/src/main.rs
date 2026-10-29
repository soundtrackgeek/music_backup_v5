// SPDX-License-Identifier: GPL-3.0-only
use base64::Engine;
use bliss_audio::{FeaturesVersion, Song};
use std::path::Path;

mod decode;
mod timeline;

struct Failure {
    message: String,
    exit_code: i32,
}

impl Failure {
    fn file(message: impl ToString) -> Self {
        Self {
            message: message.to_string(),
            exit_code: 2,
        }
    }
}

fn main() {
    let result = run();
    match result {
        Ok(value) => println!("{value}"),
        Err(error) => {
            eprintln!("{}", error.message);
            // Exit 2 means this file failed; a launch/crash/protocol error is different.
            std::process::exit(error.exit_code);
        }
    }
}

/// Usage: `music-sonic-analyzer <mp3> [--timeline-only | --no-timeline]`.
fn run() -> Result<serde_json::Value, Failure> {
    let usage = || Failure {
        message: "Expected one MP3 path and at most one of --timeline-only or --no-timeline".into(),
        exit_code: 1,
    };
    let mut args = std::env::args_os().skip(1);
    let path = args.next().ok_or_else(usage)?;
    let (bliss, timeline) = match args.next().as_deref().and_then(|a| a.to_str()) {
        None => (true, true),
        Some("--timeline-only") => (false, true),
        Some("--no-timeline") => (true, false),
        Some(_) => return Err(usage()),
    };
    if args.next().is_some() {
        return Err(usage());
    }
    let path = Path::new(&path);
    let mut output = serde_json::Map::new();
    if bliss {
        let version = FeaturesVersion::Version2;
        let samples = decode::samples(path).map_err(Failure::file)?;
        let analysis = Song::analyze_with_options(
            &samples,
            &bliss_audio::AnalysisOptions {
                features_version: version,
                ..Default::default()
            },
        )
        .map_err(Failure::file)?;
        output.insert(
            "profile".into(),
            "bliss-0.13.0-symphonia-0.6.1-v2-full-mp3".into(),
        );
        output.insert("features".into(), serde_json::json!(analysis.as_vec()));
        output.insert(
            "weights".into(),
            serde_json::json!(version.feature_weights().iter().copied().collect::<Vec<f32>>()),
        );
    }
    if timeline {
        // A timeline failure never fails the file: the Bliss result above still counts.
        let value = match timeline::extract(path) {
            Ok(t) => serde_json::json!({
                "version": timeline::VERSION,
                "rows": t.rows,
                "columns": timeline::COLUMNS,
                "channels": t.channels,
                "sampleRate": t.sample_rate,
                "leftDb": t.left_db,
                "rightDb": t.right_db,
                "truncated": t.truncated,
                "data": base64::engine::general_purpose::STANDARD.encode(t.half_bytes()),
            }),
            Err(error) => serde_json::json!({
                "version": timeline::VERSION,
                "error": error,
            }),
        };
        output.insert("timeline".into(), value);
    }
    Ok(serde_json::Value::Object(output))
}

#[cfg(test)]
mod tests {
    #[test]
    fn shared_metric_matches_bliss_version_two() {
        let weights = bliss_audio::FeaturesVersion::Version2.feature_weights();
        let a = ndarray::Array1::from_iter((0..23).map(|i| i as f32 / 23.));
        let b = ndarray::Array1::from_iter((0..23).map(|i| (23 - i) as f32 / 23.));
        let expected = bliss_audio::playlist::mahalanobis_distance(&a, &b, &weights);
        let seed = music_sonic_core::Analysis {
            profile: music_sonic_core::PROFILE.into(),
            features: a.to_vec(),
            weights: weights.iter().copied().collect(),
        };
        let actual = music_sonic_core::distance(&seed, &b.to_vec()).unwrap();
        assert!((actual - f64::from(expected)).abs() < 1e-5);
    }
}
