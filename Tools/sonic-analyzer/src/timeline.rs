// SPDX-License-Identifier: GPL-3.0-only
//! Per-second timeline, format `timeline-v1`.
//!
//! This decodes the file a second time, keeping the channels, so Bliss's own
//! mono decode (and therefore every saved Bliss vector) stays unchanged.
//! Each row covers one whole second of audio and holds 29 values:
//!
//! | Columns | Value |
//! | --- | --- |
//! | 0–11 | Chroma: pitch-class energy share, C to B, 30 Hz–5 kHz, sums to 1 |
//! | 12 | Spectral centroid in Hz, measured up to 11,025 Hz |
//! | 13 | Level: RMS of the (L+R)/2 mix in dBFS, floor −120 |
//! | 14 | Stereo width: Side/Mid energy in dB. NaN for mono or when both channels are below about −80 dBFS |
//! | 15 | Left/right correlation (Pearson). NaN as for width, or when a channel is constant |
//! | 16–28 | 13 MFCC coefficients from 40 mel bands, 20 Hz–11,025 Hz |
//!
//! Values are stored as little-endian IEEE half floats, row by row.
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::{f32::consts::PI, fs::File, path::Path, sync::Arc};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    errors::Error,
    formats::{probe::Hint, TrackType},
    io::{MediaSourceStream, MediaSourceStreamOptions},
};

pub const VERSION: &str = "timeline-v1";
pub const COLUMNS: usize = 29;
/// Three hours. Longer audio keeps its first three hours and is marked truncated.
pub const MAX_ROWS: usize = 3 * 60 * 60;

const CHROMA_LOW_HZ: f32 = 30.0;
const CHROMA_HIGH_HZ: f32 = 5_000.0;
const SPECTRUM_HIGH_HZ: f32 = 11_025.0;
const MEL_BANDS: usize = 40;
const MFCC: usize = 13;
const MEL_LOW_HZ: f32 = 20.0;
const LEVEL_FLOOR_DB: f64 = -120.0;
/// About −80 dBFS: below this a second has no usable stereo signal.
const SILENT_RMS: f64 = 1e-4;

pub struct Timeline {
    pub rows: usize,
    pub channels: usize,
    pub sample_rate: u32,
    pub left_db: f64,
    pub right_db: Option<f64>,
    pub truncated: bool,
    /// `rows * COLUMNS` values, row-major.
    pub values: Vec<f32>,
}

impl Timeline {
    pub fn half_bytes(&self) -> Vec<u8> {
        self.values
            .iter()
            .flat_map(|v| half::f16::from_f32(*v).to_le_bytes())
            .collect()
    }
}

#[derive(Default, Clone)]
struct Second {
    samples: u64,
    sum_l: f64,
    sum_r: f64,
    sum_ll: f64,
    sum_rr: f64,
    sum_lr: f64,
    sum_mono: f64,
    frames: u32,
    chroma: [f64; 12],
    centroid: f64,
    centroid_frames: u32,
    mfcc: [f64; MFCC],
}

struct Spectrum {
    nfft: usize,
    hop: usize,
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    window_sum: f32,
    freqs: Vec<f32>,
    pitch_class: Vec<Option<usize>>,
    centroid_bins: usize,
    mel: Vec<Vec<(usize, f32)>>,
    dct: Vec<[f32; MEL_BANDS]>,
    scratch: Vec<Complex<f32>>,
}

impl Spectrum {
    fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f32;
        // About 93 ms windows at any rate: 4096 at 44.1/48 kHz, 2048 at 22.05 kHz.
        let nfft = if sample_rate >= 32_000 {
            4096
        } else if sample_rate >= 16_000 {
            2048
        } else {
            1024
        };
        let window: Vec<f32> = (0..nfft)
            .map(|i| 0.5 - 0.5 * (2.0 * PI * i as f32 / nfft as f32).cos())
            .collect();
        let window_sum = window.iter().sum();
        let bins = nfft / 2 + 1;
        let freqs: Vec<f32> = (0..bins).map(|k| k as f32 * sr / nfft as f32).collect();
        let pitch_class = freqs
            .iter()
            .map(|&f| {
                (CHROMA_LOW_HZ..=CHROMA_HIGH_HZ).contains(&f).then(|| {
                    let midi = 69.0 + 12.0 * (f / 440.0).log2();
                    (midi.round() as i64).rem_euclid(12) as usize
                })
            })
            .collect();
        let top = SPECTRUM_HIGH_HZ.min(sr / 2.0);
        let centroid_bins = freqs.iter().take_while(|&&f| f <= top).count();
        let mel = mel_bank(&freqs, top);
        let dct = (0..MFCC)
            .map(|k| {
                let scale = if k == 0 {
                    (1.0 / MEL_BANDS as f32).sqrt()
                } else {
                    (2.0 / MEL_BANDS as f32).sqrt()
                };
                std::array::from_fn(|n| {
                    scale * (PI * k as f32 * (n as f32 + 0.5) / MEL_BANDS as f32).cos()
                })
            })
            .collect();
        Self {
            nfft,
            hop: nfft / 4,
            fft: FftPlanner::new().plan_fft_forward(nfft),
            window,
            window_sum,
            freqs,
            pitch_class,
            centroid_bins,
            mel,
            dct,
            scratch: vec![Complex::default(); nfft],
        }
    }

    fn frame(&mut self, samples: &[f32], second: &mut Second) {
        for (slot, (s, w)) in self
            .scratch
            .iter_mut()
            .zip(samples.iter().zip(&self.window))
        {
            *slot = Complex::new(s * w, 0.0);
        }
        self.fft.process(&mut self.scratch);
        let bins = self.nfft / 2 + 1;
        // Normalized so a full-scale sine reads about 0.5 at any FFT size.
        let mags: Vec<f32> = self.scratch[..bins]
            .iter()
            .map(|c| c.norm() / self.window_sum)
            .collect();

        let mut chroma = [0.0f64; 12];
        for (m, pc) in mags.iter().zip(&self.pitch_class) {
            if let Some(pc) = pc {
                chroma[*pc] += f64::from(*m);
            }
        }
        let total: f64 = chroma.iter().sum();
        if total > 1e-12 {
            for (acc, c) in second.chroma.iter_mut().zip(chroma) {
                *acc += c / total;
            }
        }

        let (weighted, sum) = mags[..self.centroid_bins]
            .iter()
            .zip(&self.freqs)
            .fold((0.0f64, 0.0f64), |(w, s), (m, f)| {
                (w + f64::from(m * f), s + f64::from(*m))
            });
        if sum > 1e-12 {
            second.centroid += weighted / sum;
            second.centroid_frames += 1;
        }

        let log_mel: Vec<f32> = self
            .mel
            .iter()
            .map(|band| {
                let energy: f32 = band.iter().map(|(k, w)| mags[*k] * mags[*k] * w).sum();
                (energy + 1e-10).ln()
            })
            .collect();
        for (acc, row) in second.mfcc.iter_mut().zip(&self.dct) {
            *acc += f64::from(row.iter().zip(&log_mel).map(|(a, b)| a * b).sum::<f32>());
        }
        second.frames += 1;
    }
}

fn mel_bank(freqs: &[f32], top: f32) -> Vec<Vec<(usize, f32)>> {
    let mel = |f: f32| 2595.0 * (1.0 + f / 700.0).log10();
    let hz = |m: f32| 700.0 * (10f32.powf(m / 2595.0) - 1.0);
    let (low, high) = (mel(MEL_LOW_HZ), mel(top));
    let edges: Vec<f32> = (0..MEL_BANDS + 2)
        .map(|i| hz(low + (high - low) * i as f32 / (MEL_BANDS + 1) as f32))
        .collect();
    (0..MEL_BANDS)
        .map(|b| {
            let (l, c, r) = (edges[b], edges[b + 1], edges[b + 2]);
            freqs
                .iter()
                .enumerate()
                .filter_map(|(k, &f)| {
                    let w = if f > l && f <= c {
                        (f - l) / (c - l)
                    } else if f > c && f < r {
                        (r - f) / (r - c)
                    } else {
                        0.0
                    };
                    (w > 0.0).then_some((k, w))
                })
                .collect()
        })
        .collect()
}

struct Builder {
    sample_rate: u32,
    channels: usize,
    spectrum: Spectrum,
    seconds: Vec<Second>,
    /// Mono samples not yet consumed by the FFT, starting at global frame `base`.
    pending: Vec<f32>,
    base: u64,
    next_frame: u64,
    frames: u64,
    left_sq: f64,
    right_sq: f64,
    truncated: bool,
}

impl Builder {
    fn new(sample_rate: u32, channels: usize) -> Self {
        Self {
            sample_rate,
            channels,
            spectrum: Spectrum::new(sample_rate),
            seconds: Vec::new(),
            pending: Vec::new(),
            base: 0,
            next_frame: 0,
            frames: 0,
            left_sq: 0.0,
            right_sq: 0.0,
            truncated: false,
        }
    }

    fn push(&mut self, interleaved: &[f32]) {
        let channels = self.channels;
        for frame in interleaved.chunks_exact(channels) {
            let (l, r) = if channels == 1 {
                (frame[0], frame[0])
            } else {
                (frame[0], frame[1])
            };
            let mono = if channels <= 2 {
                (l + r) / 2.0
            } else {
                frame.iter().sum::<f32>() / channels as f32
            };
            let (l, r) = (f64::from(l), f64::from(r));
            self.left_sq += l * l;
            self.right_sq += r * r;
            let index = self.frames / u64::from(self.sample_rate);
            self.frames += 1;
            if let Some(s) = slot(&mut self.seconds, &mut self.truncated, index) {
                s.samples += 1;
                s.sum_l += l;
                s.sum_r += r;
                s.sum_ll += l * l;
                s.sum_rr += r * r;
                s.sum_lr += l * r;
                s.sum_mono += f64::from(mono) * f64::from(mono);
            }
            self.pending.push(mono);
        }
        self.spectra();
    }

    fn spectra(&mut self) {
        let (nfft, hop) = (self.spectrum.nfft, self.spectrum.hop);
        while self.next_frame + nfft as u64 <= self.base + self.pending.len() as u64 {
            let start = (self.next_frame - self.base) as usize;
            // Like scipy's STFT with boundary=None: a frame belongs to the second of its centre.
            let centre = (self.next_frame + nfft as u64 / 2) / u64::from(self.sample_rate);
            if let Some(second) = slot(&mut self.seconds, &mut self.truncated, centre) {
                self.spectrum
                    .frame(&self.pending[start..start + nfft], second);
            }
            self.next_frame += hop as u64;
        }
        let consumed = (self.next_frame - self.base) as usize;
        if consumed > 0 && consumed <= self.pending.len() {
            self.pending.drain(..consumed);
            self.base = self.next_frame;
        }
    }

    fn finish(self) -> Timeline {
        let whole = usize::try_from(self.frames / u64::from(self.sample_rate)).unwrap_or(MAX_ROWS);
        let rows = whole.min(MAX_ROWS);
        let mut values = Vec::with_capacity(rows * COLUMNS);
        for s in self.seconds.iter().take(rows) {
            values.extend(row(s, self.channels));
        }
        let db = |sq: f64| {
            let rms = (sq / self.frames.max(1) as f64).sqrt();
            (20.0 * rms.max(1e-6).log10()).max(LEVEL_FLOOR_DB)
        };
        Timeline {
            rows,
            channels: self.channels,
            sample_rate: self.sample_rate,
            left_db: db(self.left_sq),
            right_db: (self.channels >= 2).then(|| db(self.right_sq)),
            truncated: self.truncated || whole > MAX_ROWS,
            values,
        }
    }
}

fn slot<'a>(seconds: &'a mut Vec<Second>, truncated: &mut bool, index: u64) -> Option<&'a mut Second> {
    let index = usize::try_from(index).ok()?;
    if index >= MAX_ROWS {
        *truncated = true;
        return None;
    }
    if seconds.len() <= index {
        seconds.resize(index + 1, Second::default());
    }
    Some(&mut seconds[index])
}

fn row(s: &Second, channels: usize) -> [f32; COLUMNS] {
    let mut out = [f32::NAN; COLUMNS];
    let chroma_total: f64 = s.chroma.iter().sum();
    for (i, c) in s.chroma.iter().enumerate() {
        out[i] = if chroma_total > 0.0 {
            (c / chroma_total) as f32
        } else {
            0.0
        };
    }
    out[12] = if s.centroid_frames > 0 {
        (s.centroid / f64::from(s.centroid_frames)) as f32
    } else {
        0.0
    };
    let n = s.samples.max(1) as f64;
    let mono_rms = (s.sum_mono / n).sqrt();
    out[13] = (20.0 * mono_rms.max(1e-6).log10()).max(LEVEL_FLOOR_DB) as f32;
    // Judge silence by the louder channel: an inverted channel cancels the mix to zero.
    let channel_rms = (s.sum_ll.max(s.sum_rr) / n).sqrt();
    if channels >= 2 && channel_rms >= SILENT_RMS {
        // Mid = (L+R)/2, Side = (L−R)/2, so their energies follow from the channel sums.
        let mid = (s.sum_ll + 2.0 * s.sum_lr + s.sum_rr) / 4.0;
        let side = (s.sum_ll - 2.0 * s.sum_lr + s.sum_rr) / 4.0;
        out[14] = (10.0 * ((side.max(0.0) + 1e-12) / (mid + 1e-12)).log10()) as f32;
        let (ml, mr) = (s.sum_l / n, s.sum_r / n);
        let var_l = s.sum_ll / n - ml * ml;
        let var_r = s.sum_rr / n - mr * mr;
        if var_l > 1e-12 && var_r > 1e-12 {
            out[15] = ((s.sum_lr / n - ml * mr) / (var_l * var_r).sqrt()).clamp(-1.0, 1.0) as f32;
        }
    }
    if s.frames > 0 {
        for (i, m) in s.mfcc.iter().enumerate() {
            out[16 + i] = (m / f64::from(s.frames)) as f32;
        }
    }
    out
}

pub fn extract(path: &Path) -> Result<Timeline, String> {
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
    let params = track
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or("No audio codec parameters")?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(|e| e.to_string())?;
    let mut builder: Option<Builder> = None;
    let mut decode_errors = 0;
    let mut interleaved = Vec::new();
    while let Some(packet) = format.next_packet().map_err(|e| e.to_string())? {
        if packet.track_id != track_id {
            continue;
        }
        let audio = match decoder.decode(&packet) {
            Ok(audio) => {
                decode_errors = 0;
                audio
            }
            Err(Error::DecodeError(_)) if decode_errors < 3 => {
                decode_errors += 1;
                continue;
            }
            Err(error) => return Err(error.to_string()),
        };
        if audio.frames() == 0 {
            continue;
        }
        let channels = audio.spec().channels().count();
        let rate = audio.spec().rate();
        if channels == 0 || rate == 0 {
            return Err("No audio channels".into());
        }
        let b = builder.get_or_insert_with(|| Builder::new(rate, channels));
        if b.channels != channels || b.sample_rate != rate {
            return Err("Audio format changed during decoding".into());
        }
        interleaved.resize(audio.samples_interleaved(), 0.0);
        audio.copy_to_slice_interleaved(&mut interleaved);
        b.push(&interleaved);
        if b.truncated {
            break;
        }
    }
    Ok(builder.ok_or("No decodable audio samples")?.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(rate: u32, channels: usize, seconds: usize, f: impl Fn(usize, usize) -> f32) -> Timeline {
        let mut b = Builder::new(rate, channels);
        let frames = rate as usize * seconds;
        let data: Vec<f32> = (0..frames)
            .flat_map(|i| (0..channels).map(move |c| (i, c)))
            .map(|(i, c)| f(i, c))
            .collect();
        for chunk in data.chunks(1152 * channels) {
            b.push(chunk);
        }
        b.finish()
    }

    fn sine(rate: u32, hz: f32, amp: f32) -> impl Fn(usize, usize) -> f32 {
        move |i, _| amp * (2.0 * PI * hz * i as f32 / rate as f32).sin()
    }

    #[test]
    fn a_440_hz_tone_reads_as_a_with_its_level_and_brightness() {
        let t = build(44_100, 2, 4, sine(44_100, 440.0, 0.5));
        assert_eq!(t.rows, 4);
        assert_eq!(t.values.len(), 4 * COLUMNS);
        let row = &t.values[COLUMNS..2 * COLUMNS];
        let a = row[9];
        assert!(a > 0.9, "chroma A share {a}");
        assert!((row[..12].iter().sum::<f32>() - 1.0).abs() < 1e-4);
        assert!((row[12] - 440.0).abs() < 40.0, "centroid {}", row[12]);
        // RMS of a 0.5 sine is 0.354, about −9 dBFS.
        assert!((row[13] + 9.03).abs() < 0.1, "level {}", row[13]);
        assert!(row[16..].iter().all(|v| v.is_finite()));
    }

    #[test]
    fn identical_channels_are_narrow_and_fully_correlated() {
        let t = build(44_100, 2, 3, sine(44_100, 220.0, 0.3));
        let row = &t.values[COLUMNS..2 * COLUMNS];
        assert!(row[14] < -60.0, "width {}", row[14]);
        assert!((row[15] - 1.0).abs() < 1e-3, "correlation {}", row[15]);
        assert!((t.left_db - t.right_db.unwrap()).abs() < 1e-6);
    }

    #[test]
    fn inverted_channel_is_wide_and_anticorrelated() {
        let rate = 44_100;
        let t = build(rate, 2, 3, move |i, c| {
            let v = 0.3 * (2.0 * PI * 220.0 * i as f32 / rate as f32).sin();
            if c == 0 { v } else { -v }
        });
        let row = &t.values[COLUMNS..2 * COLUMNS];
        assert!(row[14] > 60.0, "width {}", row[14]);
        assert!((row[15] + 1.0).abs() < 1e-3, "correlation {}", row[15]);
    }

    #[test]
    fn one_silent_channel_shows_in_the_channel_levels() {
        let rate = 44_100;
        let t = build(rate, 2, 2, move |i, c| {
            if c == 0 { 0.3 * (2.0 * PI * 220.0 * i as f32 / rate as f32).sin() } else { 0.0 }
        });
        assert!(t.left_db > -20.0);
        assert!(t.right_db.unwrap() <= -119.0);
        // Equal Mid and Side energy: 0 dB width, undefined correlation.
        let row = &t.values[..COLUMNS];
        assert!(row[14].abs() < 0.01, "width {}", row[14]);
        assert!(row[15].is_nan());
    }

    #[test]
    fn mono_files_and_silence_leave_stereo_columns_empty() {
        let mono = build(22_050, 1, 2, sine(22_050, 440.0, 0.5));
        assert!(mono.right_db.is_none());
        assert!(mono.values[14].is_nan() && mono.values[15].is_nan());
        assert!(mono.values[9] > 0.9);
        let silent = build(48_000, 2, 2, |_, _| 0.0);
        assert_eq!(silent.rows, 2);
        assert_eq!(silent.values[13], -120.0);
        assert!(silent.values[14].is_nan() && silent.values[15].is_nan());
    }

    #[test]
    fn partial_last_second_is_dropped_and_half_floats_round_trip() {
        let mut b = Builder::new(44_100, 2);
        b.push(&vec![0.1; 44_100 * 2 * 5 / 4]); // 1.25 s of stereo
        let t = b.finish();
        assert_eq!(t.rows, 1);
        let bytes = t.half_bytes();
        assert_eq!(bytes.len(), COLUMNS * 2);
        let level = half::f16::from_le_bytes([bytes[26], bytes[27]]).to_f32();
        assert!((level - t.values[13]).abs() < 0.05);
    }
}
