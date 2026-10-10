// SPDX-License-Identifier: GPL-3.0-only
//! Keep Bliss's normal decoding unchanged; finite files without a duration need
//! a packet-to-EOF fallback. Mono conversion and FFT resampling match Bliss 0.13.
use audioadapter_buffers::direct::InterleavedSlice;
use bliss_audio::decoder::{symphonia::SymphoniaDecoder, Decoder};
use rubato::{Fft, FixedSync, Resampler};
use std::{f32::consts::SQRT_2, fs::File, path::Path};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    errors::Error,
    formats::{probe::Hint, TrackType},
    io::{MediaSourceStream, MediaSourceStreamOptions},
};

// Bound fallback PCM allocation. Exceeding the limit fails rather than analyzing
// a truncated prefix. The host also enforces its three-minute process timeout.
const MAX_MONO_SAMPLES: usize = 64 * 1024 * 1024;
const SAMPLE_RATE: u32 = 22_050; // Bliss's required analysis input rate.

pub fn samples(path: &Path) -> Result<Vec<f32>, String> {
    match SymphoniaDecoder::decode(path) {
        Ok(song) => Ok(song.sample_array),
        Err(error)
            if error
                .to_string()
                .contains("duration is either unknown or infinite") =>
        {
            decode_to_end(path)
        }
        Err(error) => Err(error.to_string()),
    }
}

fn decode_to_end(path: &Path) -> Result<Vec<f32>, String> {
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
    let mut samples = Vec::new();
    let mut spec = None;
    let mut decode_errors = 0;
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
        if spec
            .as_ref()
            .is_some_and(|previous| previous != audio.spec())
        {
            return Err("Audio format changed during decoding".into());
        }
        spec = Some(audio.spec().to_owned());
        let channels = audio.spec().channels().count();
        if channels == 0 {
            return Err("No audio channels".into());
        }
        if samples.len().saturating_add(audio.frames()) > MAX_MONO_SAMPLES {
            return Err("Audio exceeds the 256 MiB fallback PCM limit".into());
        }
        let mut interleaved = vec![0.0; audio.samples_interleaved()];
        audio.copy_to_slice_interleaved(&mut interleaved);
        samples.extend(
            interleaved
                .chunks_exact(channels)
                .map(|frame| match channels {
                    1 => frame[0],
                    2 => (frame[0] + frame[1]) * SQRT_2 / 2.0,
                    _ => frame.iter().sum::<f32>() / channels as f32,
                }),
        );
    }
    let spec = spec.ok_or("No decodable audio samples")?;
    resample(samples, spec.rate()).map_err(|e| e.to_string())
}

// Based on bliss-audio 0.13.0's SymphoniaDecoder::resample_mono_samples (GPL-3.0).
// Use the identical parameters, partial-frame handling, delay and output length.
fn resample(samples: Vec<f32>, rate: u32) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    if rate == SAMPLE_RATE {
        return Ok(samples);
    }
    let mut resampler = Fft::new(
        rate as usize,
        SAMPLE_RATE as usize,
        4096,
        4,
        1,
        FixedSync::Input,
    )?;
    let mut output = Vec::with_capacity(resampler.process_all_needed_output_len(samples.len()));
    let delay = resampler.output_delay();
    let output_frames = resampler.output_frames_max();
    let input_frames = resampler.input_frames_next();
    let mut buffer = vec![0.0; output_frames];
    let chunks = samples.chunks_exact(input_frames);
    let remainder = chunks.remainder();
    for chunk in chunks {
        let input = InterleavedSlice::new(chunk, 1, input_frames)?;
        let mut adapter = InterleavedSlice::new_mut(&mut buffer, 1, output_frames)?;
        let (_, written) = resampler.process_into_buffer(&input, &mut adapter, None)?;
        output.extend_from_slice(&buffer[..written]);
    }
    if !remainder.is_empty() {
        let input = InterleavedSlice::new(remainder, 1, remainder.len())?;
        let mut adapter = InterleavedSlice::new_mut(&mut buffer, 1, output_frames)?;
        let indexing = rubato::Indexing {
            input_offset: 0,
            output_offset: 0,
            partial_len: Some(remainder.len()),
            active_channels_mask: None,
        };
        let (_, written) = resampler.process_into_buffer(&input, &mut adapter, Some(&indexing))?;
        output.extend_from_slice(&buffer[..written]);
    }
    let expected = (resampler.resample_ratio() * samples.len() as f64).ceil() as usize;
    let zeros = vec![0.0; input_frames];
    while output.len() < expected + delay {
        let input = InterleavedSlice::new(&zeros, 1, input_frames)?;
        let mut adapter = InterleavedSlice::new_mut(&mut buffer, 1, output_frames)?;
        let indexing = rubato::Indexing {
            input_offset: 0,
            output_offset: 0,
            partial_len: Some(0),
            active_channels_mask: None,
        };
        let (_, written) = resampler.process_into_buffer(&input, &mut adapter, Some(&indexing))?;
        output.extend_from_slice(&buffer[..written]);
    }
    Ok(output[delay..expected + delay].to_vec())
}

#[cfg(test)]
mod tests {
    #[test]
    fn fallback_matches_normal_decoder_pcm_and_resampling() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/noise.mp3");
        let expected = super::samples(&path).unwrap();
        assert_eq!(super::decode_to_end(&path).unwrap(), expected);
    }
}
