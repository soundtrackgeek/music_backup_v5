// SPDX-License-Identifier: GPL-3.0-only
use bliss_audio::{FeaturesVersion, Song};
use std::path::Path;

mod decode;

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

fn run() -> Result<serde_json::Value, Failure> {
    let path = std::env::args_os().nth(1).ok_or_else(|| Failure {
        message: "Expected one MP3 path".into(),
        exit_code: 1,
    })?;
    let version = FeaturesVersion::Version2;
    let samples = decode::samples(Path::new(&path)).map_err(Failure::file)?;
    let analysis = Song::analyze_with_options(
        &samples,
        &bliss_audio::AnalysisOptions {
            features_version: version,
            ..Default::default()
        },
    )
    .map_err(Failure::file)?;
    Ok(serde_json::json!({
        "profile": "bliss-0.13.0-symphonia-0.6.1-v2-full-mp3",
        "features": analysis.as_vec(),
        "weights": version.feature_weights().iter().copied().collect::<Vec<f32>>()
    }))
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
