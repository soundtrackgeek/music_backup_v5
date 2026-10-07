// SPDX-License-Identifier: GPL-3.0-only
use bliss_audio::{
    decoder::{symphonia::SymphoniaDecoder, Decoder},
    FeaturesVersion, Song,
};
use std::path::Path;

fn main() {
    let result = run();
    match result {
        Ok(value) => println!("{value}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

fn run() -> Result<serde_json::Value, String> {
    let path = std::env::args_os().nth(1).ok_or("Expected one MP3 path")?;
    let version = FeaturesVersion::Version2;
    let decoded = SymphoniaDecoder::decode(Path::new(&path)).map_err(|e| e.to_string())?;
    let analysis = Song::analyze_with_options(
        &decoded.sample_array,
        &bliss_audio::AnalysisOptions {
            features_version: version,
            ..Default::default()
        },
    )
    .map_err(|e| e.to_string())?;
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
        let weights=bliss_audio::FeaturesVersion::Version2.feature_weights();
        let a=ndarray::Array1::from_iter((0..23).map(|i|i as f32/23.));
        let b=ndarray::Array1::from_iter((0..23).map(|i|(23-i) as f32/23.));
        let expected=bliss_audio::playlist::mahalanobis_distance(&a,&b,&weights);
        let seed=music_sonic_core::Analysis{profile:music_sonic_core::PROFILE.into(),features:a.to_vec(),weights:weights.iter().copied().collect()};
        let actual=music_sonic_core::distance(&seed,&b.to_vec()).unwrap();
        assert!((actual-f64::from(expected)).abs()<1e-5);
    }
}
