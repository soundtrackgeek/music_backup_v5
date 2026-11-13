// SPDX-License-Identifier: GPL-3.0-only
//! Log-mel input for LAION CLAP, matching Hugging Face `ClapFeatureExtractor`
//! with `truncation="rand_trunc"` and `padding="repeatpad"`: 48 kHz mono,
//! 10-second windows, periodic Hann, n_fft 1024, hop 480, centred frames with
//! reflect padding, power spectrum, 64 Slaney mel bands from 50 Hz to 14 kHz,
//! and `10·log10(max(x, 1e-10))`. Callers pass exact windows, so the random
//! truncation of longer input never applies.
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;

pub const SAMPLE_RATE: u32 = 48_000;
pub const SAMPLES: usize = 480_000;
pub const MELS: usize = 64;
pub const FRAMES: usize = SAMPLES / HOP + 1;
const N_FFT: usize = 1024;
const HOP: usize = 480;
const BINS: usize = N_FFT / 2 + 1;

pub struct Mel {
    fft: Arc<dyn Fft<f64>>,
    window: Vec<f64>,
    /// Per mel band: first FFT bin and its non-zero weights.
    filters: Vec<(usize, Vec<f64>)>,
}

fn hz_to_mel(hz: f64) -> f64 {
    if hz >= 1000.0 {
        15.0 + (hz / 1000.0).ln() * 27.0 / 6.4f64.ln()
    } else {
        3.0 * hz / 200.0
    }
}

fn mel_to_hz(mel: f64) -> f64 {
    if mel >= 15.0 {
        1000.0 * (6.4f64.ln() / 27.0 * (mel - 15.0)).exp()
    } else {
        200.0 * mel / 3.0
    }
}

impl Default for Mel {
    fn default() -> Self {
        Self::new()
    }
}

impl Mel {
    pub fn new() -> Self {
        let window = (0..N_FFT)
            .map(|n| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * n as f64 / N_FFT as f64).cos())
            .collect();
        let (low, high) = (hz_to_mel(50.0), hz_to_mel(14_000.0));
        let edges: Vec<f64> = (0..MELS + 2)
            .map(|i| mel_to_hz(low + (high - low) * i as f64 / (MELS + 1) as f64))
            .collect();
        let nyquist = f64::from(SAMPLE_RATE / 2);
        let filters = (0..MELS)
            .map(|m| {
                let (left, centre, right) = (edges[m], edges[m + 1], edges[m + 2]);
                let norm = 2.0 / (right - left);
                let weights: Vec<(usize, f64)> = (0..BINS)
                    .filter_map(|k| {
                        let f = nyquist * k as f64 / (BINS - 1) as f64;
                        let w = ((f - left) / (centre - left)).min((right - f) / (right - centre));
                        (w > 0.0).then_some((k, w * norm))
                    })
                    .collect();
                let first = weights.first().map_or(0, |w| w.0);
                (first, weights.into_iter().map(|w| w.1).collect())
            })
            .collect();
        Self {
            fft: FftPlanner::new().plan_fft_forward(N_FFT),
            window,
            filters,
        }
    }

    /// Returns `FRAMES × MELS` values, frame-major, for one window of up to ten
    /// seconds at 48 kHz. Shorter audio repeats whole copies, then pads silence.
    pub fn features(&self, audio: &[f32]) -> Vec<f32> {
        let mut wave: Vec<f64> = Vec::with_capacity(SAMPLES);
        if audio.is_empty() {
            wave.resize(SAMPLES, 0.0);
        } else {
            let copies = (SAMPLES / audio.len()).max(1);
            for _ in 0..copies {
                wave.extend(audio.iter().map(|&s| f64::from(s)));
            }
            wave.truncate(SAMPLES);
            wave.resize(SAMPLES, 0.0);
        }
        let pad = N_FFT / 2;
        let mut padded = Vec::with_capacity(SAMPLES + N_FFT);
        padded.extend((1..=pad).rev().map(|i| wave[i]));
        padded.extend_from_slice(&wave);
        padded.extend((1..=pad).map(|i| wave[SAMPLES - 1 - i]));
        let mut out = Vec::with_capacity(FRAMES * MELS);
        let mut buffer = vec![Complex::new(0.0, 0.0); N_FFT];
        let mut scratch = vec![Complex::new(0.0, 0.0); self.fft.get_inplace_scratch_len()];
        let mut power = [0.0f64; BINS];
        for frame in 0..FRAMES {
            let start = frame * HOP;
            for (i, slot) in buffer.iter_mut().enumerate() {
                *slot = Complex::new(padded[start + i] * self.window[i], 0.0);
            }
            self.fft.process_with_scratch(&mut buffer, &mut scratch);
            for (k, p) in power.iter_mut().enumerate() {
                *p = buffer[k].norm_sqr();
            }
            for (first, weights) in &self.filters {
                let energy: f64 = weights
                    .iter()
                    .zip(&power[*first..])
                    .map(|(w, p)| w * p)
                    .sum();
                out.push((10.0 * energy.max(1e-10).log10()) as f32);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signal(n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| {
                let t = i as f64 / 48_000.0;
                let tau = 2.0 * std::f64::consts::PI;
                (0.5 * (tau * 440.0 * t).sin()
                    + 0.25 * (tau * 3000.0 * t + 0.3).sin()
                    + 0.1 * (tau * (100.0 + 2000.0 * t) * t).sin()) as f32
            })
            .collect()
    }

    /// Reference values from transformers' ClapFeatureExtractor for
    /// laion/larger_clap_music_and_speech on the same synthetic signal.
    fn check(n: usize, expected: &[(usize, usize, f32)], sum: f64) {
        let features = Mel::new().features(&signal(n));
        assert_eq!(features.len(), FRAMES * MELS);
        for &(frame, mel, value) in expected {
            let actual = features[frame * MELS + mel];
            assert!(
                (actual - value).abs() < 0.01,
                "frame {frame} mel {mel}: {actual} vs {value}"
            );
        }
        let total: f64 = features.iter().map(|&v| f64::from(v)).sum();
        assert!((total - sum).abs() / sum.abs() < 1e-5, "{total} vs {sum}");
    }

    #[test]
    fn full_window_matches_hugging_face() {
        check(
            480_000,
            &[(0,0,11.729), (0,5,21.428), (0,20,-14.063), (0,40,-7.9465), (0,63,-35.87), (1,0,8.0723), (1,5,16.438), (1,20,-47.238), (1,40,-50.146), (1,63,-76.22), (37,0,-34.235), (37,5,16.44), (37,20,-53.331), (37,40,-94.074), (37,63,-100.0), (500,0,-37.565), (500,5,16.439), (500,20,-56.93), (500,40,-92.008), (500,63,-100.0), (999,0,-33.431), (999,5,16.438), (999,20,-47.437), (999,40,-48.89), (999,63,-83.014), (1000,0,9.1406), (1000,5,21.742), (1000,20,-14.587), (1000,40,-7.3101), (1000,63,-43.243)],
            -4030116.8879414466,
        );
    }

    #[test]
    fn short_audio_repeats_then_pads_like_hugging_face() {
        check(
            100_000,
            &[(0,0,11.729), (0,5,21.428), (0,20,-14.063), (0,40,-7.9465), (0,63,-35.87), (1,0,8.0723), (1,5,16.438), (1,20,-47.238), (1,40,-50.146), (1,63,-76.22), (37,0,-34.235), (37,5,16.44), (37,20,-53.331), (37,40,-94.074), (37,63,-100.0), (500,0,-34.651), (500,5,16.44), (500,20,-58.182), (500,40,-19.612), (500,63,-100.0), (999,0,-100.0), (999,5,-100.0), (999,20,-100.0), (999,40,-100.0), (999,63,-100.0), (1000,0,-100.0), (1000,5,-100.0), (1000,20,-100.0), (1000,40,-100.0), (1000,63,-100.0)],
            -4218900.501131631,
        );
    }
}
