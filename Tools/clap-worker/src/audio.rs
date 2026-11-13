// SPDX-License-Identifier: GPL-3.0-only
//! Decode only the requested ten-second windows of an MP3 as 48 kHz mono.
//!
//! Each window is reached with a coarse seek (a byte-position estimate plus a
//! short forward scan that keeps the MP3 bit-reservoir frames), so only about
//! thirty seconds of a track are read from disk. Music libraries often live on
//! external hard drives, where reading whole files would dominate the run.
//! Files that cannot seek fall back to reading every packet and decoding only
//! those near a window. Before each window the decoder is reset and primed
//! with a few earlier frames. Mono is the mean of the channels, like librosa's
//! `mono=True`, which CLAP was trained with.
use audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler};
use std::{fs::File, path::Path};
use symphonia::core::{
    codecs::audio::{AudioDecoder, AudioDecoderOptions},
    errors::{Error, SeekErrorKind},
    formats::{probe::Hint, FormatReader, SeekMode, SeekTo, TrackType},
    io::{MediaSourceStream, MediaSourceStreamOptions},
    packet::Packet,
    units::Timestamp,
};

use crate::mel::{SAMPLES, SAMPLE_RATE};

pub const WINDOW_SECONDS: u32 = 10;
/// Audio decoded and discarded before a window (an MP3 frame is 1152 samples).
const PRIME_SECONDS: f64 = 0.15;
/// Three hours, the same limit as the per-second timeline.
const MAX_SECONDS: f64 = 3.0 * 60.0 * 60.0;
const MAX_DECODE_ERRORS: u32 = 8;

pub struct Decoded {
    /// One 48 kHz mono buffer per requested window, at most ten seconds each.
    pub windows: Vec<Vec<f32>>,
    /// Seconds of audio seen, measured from packet timestamps.
    pub seconds: f64,
}

struct Source {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    rate: u32,
    /// Seconds per timestamp tick.
    tick: f64,
}

fn open(path: &Path) -> Result<Source, String> {
    let source = MediaSourceStream::new(
        Box::new(File::open(path).map_err(|e| e.to_string())?),
        MediaSourceStreamOptions::default(),
    );
    let format = symphonia::default::get_probe()
        .probe(&Hint::new(), source, Default::default(), Default::default())
        .map_err(|e| e.to_string())?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or("No audio track")?;
    let track_id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or("No audio codec parameters")?
        .clone();
    let rate = params.sample_rate.ok_or("Unknown sample rate")?;
    let tick = track
        .time_base
        .map(|tb| f64::from(tb.numer.get()) / f64::from(tb.denom.get()))
        .unwrap_or(1.0 / f64::from(rate));
    let decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&params, &AudioDecoderOptions::default())
        .map_err(|e| e.to_string())?;
    Ok(Source {
        format,
        decoder,
        track_id,
        rate,
        tick,
    })
}

/// One window's source-rate mono samples.
struct Window {
    start: f64,
    end: f64,
    samples: Vec<f32>,
    capacity: usize,
}

impl Window {
    fn new(start: u32, rate: u32) -> Self {
        Self {
            start: f64::from(start),
            end: f64::from(start + WINDOW_SECONDS),
            samples: Vec::new(),
            capacity: (f64::from(WINDOW_SECONDS) * f64::from(rate)).round() as usize,
        }
    }
}

/// Decodes one packet into every window it overlaps. False means the packet
/// itself failed to decode; the caller bounds how many failures it accepts.
fn decode_into(
    source: &mut Source,
    packet: &Packet,
    windows: &mut [Window],
    interleaved: &mut Vec<f32>,
) -> Result<bool, String> {
    let start = packet.pts.get() as f64 * source.tick;
    let audio = match source.decoder.decode(packet) {
        Ok(audio) => audio,
        Err(Error::DecodeError(_)) => return Ok(false),
        Err(error) => return Err(error.to_string()),
    };
    let channels = audio.spec().channels().count();
    if channels == 0 || audio.frames() == 0 {
        return Ok(true);
    }
    interleaved.resize(audio.samples_interleaved(), 0.0);
    audio.copy_to_slice_interleaved(&mut interleaved[..]);
    let frame_seconds = 1.0 / f64::from(audio.spec().rate());
    for (i, frame) in interleaved.chunks_exact(channels).enumerate() {
        let at = start + i as f64 * frame_seconds;
        let mono = frame.iter().sum::<f32>() / channels as f32;
        for w in windows.iter_mut() {
            if at >= w.start && at < w.end && w.samples.len() < w.capacity {
                w.samples.push(mono);
            }
        }
    }
    Ok(true)
}

/// Window starts are whole seconds. An empty list means "choose for me": the
/// whole file is scanned and windows are placed at 1/6, 1/2 and 5/6 of it.
/// Windows come back in the order requested.
pub fn windows(path: &Path, starts: &[u32]) -> Result<Decoded, String> {
    if starts.is_empty() {
        let seconds = duration(path)?;
        return windows(path, &spread(seconds));
    }
    let mut sorted = starts.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let decoded = match seek_windows(path, &sorted) {
        Ok(decoded) => decoded,
        Err(_) => scan_windows(path, &sorted)?,
    };
    let windows = starts
        .iter()
        .map(|s| {
            let i = sorted.binary_search(s).unwrap_or(0);
            decoded.windows[i].clone()
        })
        .collect();
    Ok(Decoded {
        windows,
        seconds: decoded.seconds,
    })
}

fn finish(windows: Vec<Window>, rate: u32, seconds: f64) -> Result<Decoded, String> {
    if windows.iter().all(|w| w.samples.is_empty()) {
        return Err("No decodable audio in the requested windows".into());
    }
    let windows = windows
        .into_iter()
        .map(|w| resample(w.samples, rate))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Decoded { windows, seconds })
}

fn seek_windows(path: &Path, starts: &[u32]) -> Result<Decoded, String> {
    let mut source = open(path)?;
    let mut windows: Vec<Window> = starts
        .iter()
        .map(|&s| Window::new(s, source.rate))
        .collect();
    let mut interleaved = Vec::new();
    let mut seconds = 0.0f64;
    for window in windows.iter_mut() {
        let target = (window.start - PRIME_SECONDS).max(0.0);
        let ts = Timestamp::new((target / source.tick) as i64);
        match source.format.seek(
            SeekMode::Coarse,
            SeekTo::Timestamp {
                ts,
                track_id: source.track_id,
            },
        ) {
            Ok(_) => {}
            // Past the end: this window stays empty and the caller drops it.
            Err(Error::SeekError(SeekErrorKind::OutOfRange)) => continue,
            Err(error) => return Err(error.to_string()),
        }
        source.decoder.reset();
        let mut errors = 0;
        while let Some(packet) = source.format.next_packet().map_err(|e| e.to_string())? {
            if packet.track_id != source.track_id {
                continue;
            }
            let start = packet.pts.get() as f64 * source.tick;
            seconds = seconds.max(start + packet.dur.get() as f64 * source.tick);
            if start >= window.end {
                break;
            }
            if !decode_into(
                &mut source,
                &packet,
                std::slice::from_mut(window),
                &mut interleaved,
            )? {
                errors += 1;
                if errors > MAX_DECODE_ERRORS {
                    return Err("Too many decode errors".into());
                }
            }
        }
    }
    finish(windows, source.rate, seconds)
}

fn scan_windows(path: &Path, starts: &[u32]) -> Result<Decoded, String> {
    let mut source = open(path)?;
    let mut windows: Vec<Window> = starts
        .iter()
        .map(|&s| Window::new(s, source.rate))
        .collect();
    let last_end = windows.iter().map(|w| w.end).fold(0.0, f64::max);
    let mut decoding = false;
    let mut errors = 0;
    let mut seconds = 0.0f64;
    let mut interleaved = Vec::new();
    while let Some(packet) = source.format.next_packet().map_err(|e| e.to_string())? {
        if packet.track_id != source.track_id {
            continue;
        }
        let start = packet.pts.get() as f64 * source.tick;
        let end = start + packet.dur.get() as f64 * source.tick;
        seconds = seconds.max(end);
        if start > MAX_SECONDS || start >= last_end {
            break;
        }
        if !windows
            .iter()
            .any(|w| end > w.start - PRIME_SECONDS && start < w.end)
        {
            decoding = false;
            continue;
        }
        if !decoding {
            source.decoder.reset();
            decoding = true;
        }
        if decode_into(&mut source, &packet, &mut windows, &mut interleaved)? {
            errors = 0;
        } else {
            errors += 1;
            if errors > MAX_DECODE_ERRORS {
                return Err("Too many consecutive decode errors".into());
            }
        }
    }
    finish(windows, source.rate, seconds)
}

#[cfg(test)]
pub(crate) fn scan_for_test(path: &Path, starts: &[u32]) -> Result<Decoded, String> {
    scan_windows(path, starts)
}

/// Duration from packet timestamps, without decoding.
fn duration(path: &Path) -> Result<u32, String> {
    let source = MediaSourceStream::new(
        Box::new(File::open(path).map_err(|e| e.to_string())?),
        MediaSourceStreamOptions::default(),
    );
    let mut format = symphonia::default::get_probe()
        .probe(&Hint::new(), source, Default::default(), Default::default())
        .map_err(|e| e.to_string())?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or("No audio track")?;
    let track_id = track.id;
    let rate = track
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .and_then(|p| p.sample_rate)
        .ok_or("Unknown sample rate")?;
    let tick = track
        .time_base
        .map(|tb| f64::from(tb.numer.get()) / f64::from(tb.denom.get()))
        .unwrap_or(1.0 / f64::from(rate));
    let mut seconds = 0.0f64;
    while let Some(packet) = format.next_packet().map_err(|e| e.to_string())? {
        if packet.track_id == track_id {
            seconds = seconds.max((packet.pts.get() as f64 + packet.dur.get() as f64) * tick);
            if seconds > MAX_SECONDS {
                break;
            }
        }
    }
    Ok(seconds.floor() as u32)
}

/// Fallback placement when the host has no timeline: up to three windows at
/// 1/6, 1/2 and 5/6 of the track, fewer for tracks under thirty seconds.
pub fn spread(seconds: u32) -> Vec<u32> {
    if seconds <= WINDOW_SECONDS {
        return vec![0];
    }
    let count = (seconds / WINDOW_SECONDS).clamp(1, 3);
    let last = seconds - WINDOW_SECONDS;
    (0..count)
        .map(|i| {
            let centre = f64::from(seconds) * f64::from(2 * i + 1) / f64::from(2 * count);
            (centre - f64::from(WINDOW_SECONDS) / 2.0).clamp(0.0, f64::from(last)) as u32
        })
        .collect()
}

// Same FFT resampler setup as the Bliss analyzer, aimed at 48 kHz.
fn resample(samples: Vec<f32>, rate: u32) -> Result<Vec<f32>, String> {
    if rate == SAMPLE_RATE || samples.is_empty() {
        let mut samples = samples;
        samples.truncate(SAMPLES);
        return Ok(samples);
    }
    let error = |e: &dyn std::fmt::Display| e.to_string();
    let mut resampler = Fft::new(
        rate as usize,
        SAMPLE_RATE as usize,
        4096,
        4,
        1,
        FixedSync::Input,
    )
    .map_err(|e| error(&e))?;
    let delay = resampler.output_delay();
    let output_frames = resampler.output_frames_max();
    let input_frames = resampler.input_frames_next();
    let expected = (resampler.resample_ratio() * samples.len() as f64).ceil() as usize;
    let mut output = Vec::with_capacity(expected + delay + output_frames);
    let mut buffer = vec![0.0; output_frames];
    let chunks = samples.chunks_exact(input_frames);
    let remainder = chunks.remainder();
    for chunk in chunks {
        let input = InterleavedSlice::new(chunk, 1, input_frames).map_err(|e| error(&e))?;
        let mut adapter =
            InterleavedSlice::new_mut(&mut buffer, 1, output_frames).map_err(|e| error(&e))?;
        let (_, written) = resampler
            .process_into_buffer(&input, &mut adapter, None)
            .map_err(|e| error(&e))?;
        output.extend_from_slice(&buffer[..written]);
    }
    let zeros = vec![0.0; input_frames];
    let mut tail: &[f32] = remainder;
    while output.len() < expected + delay {
        let input = InterleavedSlice::new(if tail.is_empty() { &zeros[..0] } else { tail }, 1, tail.len())
            .map_err(|e| error(&e))?;
        let mut adapter =
            InterleavedSlice::new_mut(&mut buffer, 1, output_frames).map_err(|e| error(&e))?;
        let indexing = rubato::Indexing {
            input_offset: 0,
            output_offset: 0,
            partial_len: Some(tail.len()),
            active_channels_mask: None,
        };
        let (_, written) = resampler
            .process_into_buffer(&input, &mut adapter, Some(&indexing))
            .map_err(|e| error(&e))?;
        output.extend_from_slice(&buffer[..written]);
        tail = &[];
    }
    let mut output = output[delay..expected + delay].to_vec();
    output.truncate(SAMPLES);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../sonic-analyzer/tests/fixtures")
            .join(name)
    }

    #[test]
    fn spread_places_up_to_three_windows_inside_the_track() {
        assert_eq!(spread(5), vec![0]);
        assert_eq!(spread(10), vec![0]);
        assert_eq!(spread(15), vec![2]);
        assert_eq!(spread(25), vec![1, 13]);
        assert_eq!(spread(180), vec![25, 85, 145]);
        assert!(spread(10_000).iter().all(|&s| s + WINDOW_SECONDS <= 10_000));
    }

    #[test]
    fn fixtures_decode_to_48_khz_windows() {
        for name in ["large-id3.mp3", "mpeg-layer2.mp3", "no-duration.mp3", "noise.mp3"] {
            let decoded = windows(&fixture(name), &[]).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!decoded.windows.is_empty(), "{name}");
            for w in &decoded.windows {
                assert!(!w.is_empty() && w.len() <= SAMPLES, "{name}: {}", w.len());
                assert!(w.iter().all(|s| s.is_finite()), "{name}");
            }
            assert!(decoded.seconds > 0.0, "{name}");
        }
    }
}
