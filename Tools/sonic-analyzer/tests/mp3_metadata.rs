// SPDX-License-Identifier: GPL-3.0-only
use music_sonic_core::Analysis;
use std::{fs, path::Path, process::Command};

const AUDIO: &[u8] = include_bytes!("fixtures/noise.mp3");

fn extract(path: &Path) -> Analysis {
    let output = Command::new(env!("CARGO_BIN_EXE_music-sonic-analyzer"))
        .arg(path)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let analysis: Analysis = serde_json::from_slice(&output.stdout).unwrap();
    assert!(analysis.valid());
    analysis
}

fn synchsafe(size: usize) -> [u8; 4] {
    [21, 14, 7, 0].map(|shift| ((size >> shift) & 127) as u8)
}

#[test]
fn binary_skips_large_id3_artwork_without_changing_the_audio_features() {
    let dir = tempfile::tempdir().unwrap();
    let bare = dir.path().join("bare.mp3");
    fs::write(&bare, AUDIO).unwrap();
    let expected = extract(&bare);
    for version in [3, 4] {
        // MPEG-looking bytes inside an image must never be decoded as music.
        let mut image = b"\0image/jpeg\0\x03\0".to_vec();
        image.extend_from_slice(AUDIO);
        image.resize(1024 * 1024, 0);
        let mut frame = b"APIC".to_vec();
        frame.extend_from_slice(&if version == 3 {
            (image.len() as u32).to_be_bytes()
        } else {
            synchsafe(image.len())
        });
        frame.extend_from_slice(&[0, 0]);
        frame.extend_from_slice(&image);
        let mut tagged = vec![b'I', b'D', b'3', version, 0, 0];
        tagged.extend_from_slice(&synchsafe(frame.len()));
        tagged.extend_from_slice(&frame);
        tagged.extend_from_slice(AUDIO);
        let path = dir.path().join(format!("Jørn - tagged v2.{version}.mp3"));
        fs::write(&path, tagged).unwrap();
        let actual = extract(&path);
        assert_eq!(actual.profile, expected.profile);
        assert_eq!(actual.weights, expected.weights);
        assert_eq!(actual.features, expected.features);
    }
}

#[test]
fn packaged_smoke_fixture_produces_the_current_valid_profile() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("large-id3.mp3");
    fs::write(&path, include_bytes!("fixtures/large-id3.mp3")).unwrap();
    extract(&path);
}

#[test]
fn mp2_audio_in_an_mp3_filename_is_supported() {
    extract(&Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mpeg-layer2.mp3"));
}

#[test]
fn missing_duration_decodes_all_packets_with_unchanged_features() {
    use bliss_audio::decoder::{symphonia::SymphoniaDecoder, Decoder};
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let path = root.join("no-duration.mp3");
    let error = SymphoniaDecoder::decode(&path).unwrap_err();
    assert!(error
        .to_string()
        .contains("duration is either unknown or infinite"));
    let actual = extract(&path);
    let expected = extract(&root.join("noise.mp3"));
    assert_eq!(actual.features, expected.features);
    assert_eq!(actual.weights, expected.weights);
}

#[test]
fn invalid_audio_uses_the_recoverable_file_exit_code() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bad.mp3");
    fs::write(&path, b"This is not audio").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_music-sonic-analyzer"))
        .arg(path)
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(!output.stderr.is_empty());
    assert!(output.stdout.is_empty());
}
