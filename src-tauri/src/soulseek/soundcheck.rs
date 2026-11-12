use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
    sync::OnceLock,
};
use symphonia::{
    core::{
        codecs::{
            audio::{
                well_known::{
                    CODEC_ID_AAC, CODEC_ID_ALAC, CODEC_ID_FLAC, CODEC_ID_MP3, CODEC_ID_OPUS,
                    CODEC_ID_VORBIS,
                },
                AudioCodecId, AudioDecoderOptions,
            },
            registry::CodecRegistry,
        },
        errors::Error as SymphoniaError,
        formats::{probe::Hint, FormatOptions, TrackType},
        io::MediaSourceStream,
        meta::{MetadataOptions, StandardTag},
        units::Timestamp,
    },
    default,
};

const AUDIO_EXTENSIONS: [&str; 16] = [
    "aac", "aif", "aiff", "alac", "ape", "caf", "flac", "m4a", "mp3", "mp4", "ogg", "opus", "wav",
    "wma", "wv", "oga",
];
const PROBED_EXTENSIONS: [&str; 12] = [
    "aac", "aif", "aiff", "alac", "caf", "flac", "m4a", "mp3", "mp4", "ogg", "opus", "wav",
];

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SoundcheckStatus {
    #[default]
    Pending,
    Passed,
    Review,
    Failed,
    Unsupported,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SoundcheckResult {
    pub status: SoundcheckStatus,
    pub checked_at_ms: u64,
    pub deep: bool,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub duration_seconds: Option<f64>,
    pub bitrate_kbps: Option<u32>,
    pub sample_rate: Option<u32>,
    pub bits_per_sample: Option<u32>,
    pub channels: Option<u32>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub issues: Vec<String>,
}

pub fn is_audio_path(path: &Path) -> bool {
    extension(path).is_some_and(|extension| AUDIO_EXTENSIONS.contains(&extension.as_str()))
}

pub fn inspect_file(path: &Path, deep: bool, checked_at_ms: u64) -> Option<SoundcheckResult> {
    if !is_audio_path(path) {
        return None;
    }
    let extension = extension(path).unwrap_or_default();
    if !PROBED_EXTENSIONS.contains(&extension.as_str()) {
        return Some(SoundcheckResult {
            status: SoundcheckStatus::Unsupported,
            checked_at_ms,
            deep,
            container: Some(extension.to_ascii_uppercase()),
            issues: vec![format!(
                "{} audio is recognized, but this Soundcheck version cannot inspect it yet.",
                extension.to_ascii_uppercase()
            )],
            ..Default::default()
        });
    }

    match inspect_probed_file(path, &extension, deep, checked_at_ms) {
        Ok(result) => Some(result),
        Err(message) => Some(SoundcheckResult {
            status: SoundcheckStatus::Failed,
            checked_at_ms,
            deep,
            container: Some(extension.to_ascii_uppercase()),
            issues: vec![message],
            ..Default::default()
        }),
    }
}

fn inspect_probed_file(
    path: &Path,
    extension: &str,
    deep: bool,
    checked_at_ms: u64,
) -> Result<SoundcheckResult, String> {
    let source = File::open(path)
        .map_err(|error| format!("Music Library could not open this audio file: {error}"))?;
    let stream = MediaSourceStream::new(Box::new(source), Default::default());
    let mut hint = Hint::new();
    hint.with_extension(extension);
    let mut format = default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|error| format!("The audio container could not be read: {error}"))?;

    let track = format
        .default_track(TrackType::Audio)
        .cloned()
        .ok_or_else(|| "No readable audio stream was found in this file.".to_owned())?;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .cloned()
        .ok_or_else(|| "The file did not report usable audio codec parameters.".to_owned())?;
    let registration = codecs().get_audio_decoder(params.codec);
    let codec_name = registration
        .map(|registration| registration.codec.info.short_name)
        .unwrap_or_else(|| codec_fallback_name(params.codec, extension));
    let codec = codec_name.to_ascii_uppercase();
    let duration_seconds = track
        .time_base
        .zip(track.duration)
        .and_then(|(time_base, duration)| {
            i64::try_from(duration.get())
                .ok()
                .map(Timestamp::new)
                .and_then(|duration| time_base.calc_time(duration))
        })
        .map(|time| time.as_secs_f64())
        .filter(|duration| *duration > 0.0)
        .or_else(|| {
            params
                .sample_rate
                .zip(track.num_frames)
                .and_then(|(sample_rate, frames)| {
                    (sample_rate > 0).then_some(frames as f64 / f64::from(sample_rate))
                })
        });
    let duration_seconds = if extension == "mp3" {
        reconcile_mp3_duration(duration_seconds, mp3_header_duration_seconds(path))
    } else {
        duration_seconds
    };
    let mut track_number = None;
    let mut track_total = None;
    if let Some(revision) = format.metadata().skip_to_latest() {
        for tag in &revision.media.tags {
            match tag.std.as_ref() {
                Some(StandardTag::TrackNumber(number)) => {
                    track_number = u32::try_from(*number).ok();
                }
                Some(StandardTag::TrackTotal(total)) => {
                    track_total = u32::try_from(*total).ok();
                }
                _ => {}
            }
        }
    }
    track_number = track_number.or_else(|| infer_track_number(path));

    let mut issues = Vec::new();
    if duration_seconds.is_none() {
        issues.push("No reliable duration was reported.".to_owned());
    }
    if track_number.is_none() {
        issues.push("No track number was found in the tags or filename.".to_owned());
    }
    if !extension_matches_codec(extension, codec_name) {
        issues.push(format!(
            "The .{extension} extension does not match the detected {codec} stream."
        ));
    }
    if registration.is_none() {
        issues.push(format!(
            "{codec} headers are readable, but full frame decoding is not available in this Soundcheck version."
        ));
    }

    if deep {
        if registration.is_none() {
            return Ok(SoundcheckResult {
                status: SoundcheckStatus::Unsupported,
                checked_at_ms,
                deep,
                codec: Some(codec),
                container: Some(extension.to_ascii_uppercase()),
                duration_seconds,
                bitrate_kbps: None,
                sample_rate: params.sample_rate,
                bits_per_sample: params.bits_per_coded_sample.or(params.bits_per_sample),
                channels: params.channels.map(|channels| channels.count() as u32),
                track_number,
                track_total,
                issues,
            });
        }
        let mut decoder = codecs()
            .make_audio_decoder(&params, &AudioDecoderOptions::default().verify(true))
            .map_err(|error| {
                format!("The {codec} stream could not be opened for decoding: {error}")
            })?;
        let mut packets = 0_u64;
        loop {
            let packet = match format.next_packet() {
                Ok(Some(packet)) => packet,
                Ok(None) => break,
                Err(SymphoniaError::ResetRequired) => {
                    return Err("The audio stream changed format during the deep scan.".to_owned())
                }
                Err(error) => return Err(format!("The audio stream ended unexpectedly: {error}")),
            };
            if packet.track_id != track.id {
                continue;
            }
            decoder
                .decode(&packet)
                .map_err(|error| format!("A damaged audio frame was found: {error}"))?;
            packets = packets.saturating_add(1);
        }
        if packets == 0 {
            return Err("The deep scan found no decodable audio frames.".to_owned());
        }
        if decoder.finalize().verify_ok == Some(false) {
            return Err("The decoder's embedded integrity check did not match.".to_owned());
        }
    }

    let bitrate_kbps = duration_seconds.and_then(|duration| {
        std::fs::metadata(path).ok().and_then(|metadata| {
            (duration > 0.0)
                .then(|| ((metadata.len() as f64 * 8.0) / duration / 1_000.0).round() as u32)
        })
    });
    Ok(SoundcheckResult {
        status: if issues.is_empty() {
            SoundcheckStatus::Passed
        } else {
            SoundcheckStatus::Review
        },
        checked_at_ms,
        deep,
        codec: Some(codec),
        container: Some(extension.to_ascii_uppercase()),
        duration_seconds,
        bitrate_kbps,
        sample_rate: params.sample_rate,
        bits_per_sample: params.bits_per_coded_sample.or(params.bits_per_sample),
        channels: params.channels.map(|channels| channels.count() as u32),
        track_number,
        track_total,
        issues,
    })
}

fn codecs() -> &'static CodecRegistry {
    static CODECS: OnceLock<CodecRegistry> = OnceLock::new();
    CODECS.get_or_init(|| {
        let mut codecs = CodecRegistry::new();
        default::register_enabled_codecs(&mut codecs);
        codecs
    })
}

fn codec_fallback_name(codec: AudioCodecId, extension: &str) -> &'static str {
    match codec {
        CODEC_ID_MP3 => "mp3",
        CODEC_ID_AAC => "aac",
        CODEC_ID_ALAC => "alac",
        CODEC_ID_FLAC => "flac",
        CODEC_ID_VORBIS => "vorbis",
        CODEC_ID_OPUS => "opus",
        _ if matches!(extension, "wav" | "aif" | "aiff" | "caf") => "pcm",
        _ => "unknown audio",
    }
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

fn extension_matches_codec(extension: &str, codec: &str) -> bool {
    match codec.to_ascii_lowercase().as_str() {
        "mp1" => extension == "mp1",
        "mp2" => extension == "mp2",
        "mp3" | "mpeg audio" | "mpa" => extension == "mp3",
        "aac" => matches!(extension, "aac" | "m4a" | "mp4"),
        "alac" => matches!(extension, "alac" | "m4a" | "mp4"),
        "flac" => extension == "flac",
        "vorbis" => matches!(extension, "ogg" | "oga"),
        "opus" => matches!(extension, "ogg" | "oga" | "opus"),
        codec if codec.contains("pcm") => matches!(extension, "wav" | "aif" | "aiff" | "caf"),
        _ => true,
    }
}

fn infer_track_number(path: &Path) -> Option<u32> {
    let stem = path.file_stem()?.to_str()?.trim_start();
    let digits = stem
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>();
    if digits.is_empty() {
        return None;
    }
    let remainder = &stem[digits.len()..];
    if remainder.is_empty() || remainder.starts_with([' ', '-', '.', '_']) || digits.len() >= 2 {
        digits.parse::<u32>().ok().filter(|number| *number > 0)
    } else {
        None
    }
}

/// Prefers the frame count in an MP3's own VBR header when Symphonia's length
/// disagrees with it by more than a second. Symphonia skips a Xing header whose
/// first frame carries a CRC, then guesses from the first 16 frames, which can
/// make a quiet-intro track read several times too long.
fn reconcile_mp3_duration(probed: Option<f64>, header: Option<f64>) -> Option<f64> {
    match (probed, header) {
        (Some(probed), Some(header)) if (probed - header).abs() > 1.0 => Some(header),
        (None, header) => header,
        (probed, _) => probed,
    }
}

/// Reads an MP3's length from the Xing/Info or VBRI header in its first frame.
pub(crate) fn mp3_header_duration_seconds(path: &Path) -> Option<f64> {
    let mut file = File::open(path).ok()?;
    let mut offset = 0_u64;
    let mut id3 = [0_u8; 10];
    // Skip any ID3v2 tags before the first MPEG frame.
    loop {
        file.seek(SeekFrom::Start(offset)).ok()?;
        file.read_exact(&mut id3).ok()?;
        if &id3[..3] != b"ID3" {
            break;
        }
        let size = id3[6..10]
            .iter()
            .fold(0_u64, |size, byte| (size << 7) | u64::from(byte & 0x7f));
        let footer = if id3[5] & 0x10 != 0 { 10 } else { 0 };
        offset += 10 + size + footer;
    }
    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut buffer = Vec::with_capacity(64 * 1024);
    file.take(64 * 1024).read_to_end(&mut buffer).ok()?;
    mp3_header_duration_from_bytes(&buffer)
}

fn mp3_header_duration_from_bytes(buffer: &[u8]) -> Option<f64> {
    let read_u32 = |at: usize| {
        buffer
            .get(at..at + 4)
            .map(|bytes| u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    };
    let start = (0..buffer.len().saturating_sub(4)).find(|&at| {
        let (sync, flags, rates) = (buffer[at], buffer[at + 1], buffer[at + 2]);
        sync == 0xff
            && flags & 0xe0 == 0xe0
            && (flags >> 3) & 0x3 != 1
            && (flags >> 1) & 0x3 == 1
            && (1..=14).contains(&(rates >> 4))
            && (rates >> 2) & 0x3 != 3
    })?;
    let header = &buffer[start..start + 4];
    let version = (header[1] >> 3) & 0x3;
    let mpeg1 = version == 3;
    let sample_rate = [44_100.0, 48_000.0, 32_000.0][usize::from((header[2] >> 2) & 0x3)]
        / match version {
            3 => 1.0,
            2 => 2.0,
            _ => 4.0,
        };
    let samples_per_frame = if mpeg1 { 1152.0 } else { 576.0 };
    let mono = header[3] >> 6 == 3;
    let side_info = match (mpeg1, mono) {
        (true, false) => 32,
        (true, true) | (false, false) => 17,
        (false, true) => 9,
    };
    let crc = if header[1] & 0x1 == 0 { 2 } else { 0 };
    let mut frames = None;
    // A CRC-protected frame may place the tag after the CRC or, as LAME does,
    // where it would be without one.
    for at in [start + 4 + side_info, start + 4 + crc + side_info] {
        if matches!(buffer.get(at..at + 4), Some(b"Xing" | b"Info")) {
            let flags = read_u32(at + 4)?;
            frames = (flags & 0x1 != 0).then(|| read_u32(at + 8)).flatten();
            break;
        }
    }
    if frames.is_none() && buffer.get(start + 36..start + 40) == Some(b"VBRI".as_slice()) {
        frames = read_u32(start + 36 + 14);
    }
    frames
        .filter(|frames| *frames > 0)
        .map(|frames| f64::from(frames) * samples_per_frame / sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write};
    use tempfile::tempdir;

    /// A CRC-protected MPEG-1 Layer III frame with a LAME-style Xing tag.
    fn crc_protected_xing_frame(frames: u32) -> Vec<u8> {
        let mut frame = vec![0xff, 0xfa, 0x90, 0x64, 0x86, 0x1f];
        frame.resize(36, 0);
        frame.extend_from_slice(b"Xing");
        frame.extend_from_slice(&0x0f_u32.to_be_bytes());
        frame.extend_from_slice(&frames.to_be_bytes());
        frame.resize(417, 0);
        frame
    }

    #[test]
    fn mp3_header_duration_reads_a_xing_tag_behind_a_crc() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("crc.mp3");
        let mut bytes = b"ID3\x03\x00\x00\x00\x00\x01\x00".to_vec();
        bytes.resize(10 + 128, 0);
        bytes.extend(crc_protected_xing_frame(8_202));
        fs::write(&path, bytes).unwrap();

        let seconds = mp3_header_duration_seconds(&path).expect("xing duration");
        assert!((seconds - 214.26).abs() < 0.01, "{seconds}");

        // VBRI and plain Info tags read the same way; a frame without a tag has none.
        let mut vbri = vec![0xff, 0xfb, 0x90, 0x64];
        vbri.resize(36, 0);
        vbri.extend_from_slice(b"VBRI\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00");
        vbri.extend_from_slice(&100_u32.to_be_bytes());
        assert_eq!(
            mp3_header_duration_from_bytes(&vbri),
            Some(100.0 * 1152.0 / 44_100.0)
        );
        assert_eq!(
            mp3_header_duration_from_bytes(&[0xff, 0xfb, 0x90, 0x64, 0, 0]),
            None
        );
    }

    #[test]
    fn mp3_header_duration_replaces_only_a_disagreeing_estimate() {
        assert_eq!(
            reconcile_mp3_duration(Some(1159.2), Some(214.3)),
            Some(214.3)
        );
        assert_eq!(
            reconcile_mp3_duration(Some(214.25), Some(214.3)),
            Some(214.25)
        );
        assert_eq!(reconcile_mp3_duration(None, Some(214.3)), Some(214.3));
        assert_eq!(reconcile_mp3_duration(Some(180.0), None), Some(180.0));
    }

    fn write_wav(path: &Path) {
        let sample_count = 8_000_u32;
        let data_size = sample_count * 2;
        let mut file = File::create(path).unwrap();
        file.write_all(b"RIFF").unwrap();
        file.write_all(&(36 + data_size).to_le_bytes()).unwrap();
        file.write_all(b"WAVEfmt ").unwrap();
        file.write_all(&16_u32.to_le_bytes()).unwrap();
        file.write_all(&1_u16.to_le_bytes()).unwrap();
        file.write_all(&1_u16.to_le_bytes()).unwrap();
        file.write_all(&8_000_u32.to_le_bytes()).unwrap();
        file.write_all(&16_000_u32.to_le_bytes()).unwrap();
        file.write_all(&2_u16.to_le_bytes()).unwrap();
        file.write_all(&16_u16.to_le_bytes()).unwrap();
        file.write_all(b"data").unwrap();
        file.write_all(&data_size.to_le_bytes()).unwrap();
        file.write_all(&vec![0_u8; data_size as usize]).unwrap();
    }

    #[test]
    fn quick_and_deep_scans_read_a_complete_wav() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("01 - Soundcheck.wav");
        write_wav(&path);

        let quick = inspect_file(&path, false, 42).unwrap();
        assert_eq!(quick.status, SoundcheckStatus::Passed);
        assert_eq!(quick.track_number, Some(1));
        assert_eq!(quick.sample_rate, Some(8_000));
        assert!(!quick.deep);

        let deep = inspect_file(&path, true, 43).unwrap();
        assert_eq!(deep.status, SoundcheckStatus::Passed);
        assert!(deep.deep);
    }

    #[test]
    fn corrupt_audio_is_reported_without_modifying_it() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("02 - Broken.flac");
        fs::write(&path, b"not an audio stream").unwrap();
        let before = fs::read(&path).unwrap();

        let result = inspect_file(&path, false, 42).unwrap();

        assert_eq!(result.status, SoundcheckStatus::Failed);
        assert!(!result.issues.is_empty());
        assert_eq!(fs::read(path).unwrap(), before);
    }

    #[test]
    fn unsupported_audio_stays_visible_for_review() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("03 - Legacy.wma");
        fs::write(&path, b"legacy").unwrap();

        let result = inspect_file(&path, false, 42).unwrap();

        assert_eq!(result.status, SoundcheckStatus::Unsupported);
        assert_eq!(result.track_number, None);
    }
}
