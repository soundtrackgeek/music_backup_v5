// SPDX-License-Identifier: GPL-3.0-only
//! Long-lived CLAP worker for Music Library sound search.
//!
//! `--info` reports whether this build can run CLAP.
//! `--serve <model-dir>` loads the audio encoder once, prints a ready line, then
//! answers one JSON line per request on stdin until stdin closes:
//!   request  `{"tracks":[{"path":"…","windows":[30,95,160]}]}`
//!   response `{"results":[{"embedding":"<base64 f32 LE ×512>","windows":[…],"seconds":…}|{"error":"…"}]}`
//! `--text <model-dir>` reads one UTF-8 query on stdin and prints its embedding.
//!
//! A track that cannot be decoded returns an error entry. Anything else that
//! goes wrong (model load, inference) exits non-zero with a message on stderr.
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    io::{self, BufRead, Read, Write},
    path::{Path, PathBuf},
};

mod audio;
mod mel;
#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
mod model;

pub const DIMENSIONS: usize = 512;
/// Requests are bounded so a confused host cannot make the worker allocate freely.
const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_TRACKS: usize = 64;
const MAX_WINDOWS: usize = 8;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    tracks: Vec<TrackRequest>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrackRequest {
    path: PathBuf,
    windows: Vec<u32>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum TrackResult {
    Ready {
        embedding: String,
        windows: Vec<u32>,
        seconds: f64,
    },
    Failed {
        error: String,
    },
}

fn encode(values: &[f32]) -> String {
    let bytes: Vec<u8> = values.iter().flat_map(|v| v.to_le_bytes()).collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn normalize(values: &mut [f32]) -> bool {
    let norm = values.iter().map(|v| v * v).sum::<f32>().sqrt();
    if !norm.is_finite() || norm <= f32::EPSILON {
        return false;
    }
    values.iter_mut().for_each(|v| *v /= norm);
    true
}

/// Decoded, mel-transformed windows for one track.
struct Prepared {
    features: Vec<Vec<f32>>,
    windows: Vec<u32>,
    seconds: f64,
}

fn prepare(mel: &mel::Mel, track: &TrackRequest) -> Result<Prepared, String> {
    if track.windows.len() > MAX_WINDOWS {
        return Err("Too many windows requested".into());
    }
    let decoded = audio::windows(&track.path, &track.windows)?;
    let starts = if track.windows.is_empty() {
        audio::spread(decoded.seconds.floor() as u32)
    } else {
        track.windows.clone()
    };
    // Drop windows that start past the end of the audio; keep at least one.
    let mut kept: Vec<(u32, Vec<f32>)> = starts
        .into_iter()
        .zip(decoded.windows)
        .filter(|(_, w)| w.len() >= mel::SAMPLE_RATE as usize)
        .collect();
    if kept.is_empty() {
        return Err("The audio is shorter than one second in every window".into());
    }
    kept.sort_by_key(|(s, _)| *s);
    Ok(Prepared {
        features: kept.iter().map(|(_, w)| mel.features(w)).collect(),
        windows: kept.iter().map(|(s, _)| *s).collect(),
        seconds: decoded.seconds,
    })
}

fn fail(message: impl std::fmt::Display) -> ! {
    eprintln!("{message}");
    std::process::exit(1)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["--info"] => {
            let available = cfg!(not(all(target_os = "macos", target_arch = "x86_64")));
            println!(
                "{}",
                serde_json::json!({"available": available, "dimensions": DIMENSIONS})
            );
        }
        ["--serve", dir] => serve(Path::new(dir)),
        ["--text", dir] => text(Path::new(dir)),
        _ => fail("Usage: music-clap-worker --info | --serve <model-dir> | --text <model-dir>"),
    }
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn serve(_: &Path) {
    fail("Sound search needs Apple silicon on macOS")
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn text(_: &Path) {
    fail("Sound search needs Apple silicon on macOS")
}

#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
fn text(dir: &Path) {
    let mut query = String::new();
    io::stdin()
        .take(16 * 1024)
        .read_to_string(&mut query)
        .unwrap_or_else(|e| fail(e));
    let mut encoder = model::Text::load(dir).unwrap_or_else(|e| fail(e));
    let mut embedding = encoder.embed(query.trim()).unwrap_or_else(|e| fail(e));
    if !normalize(&mut embedding) {
        fail("The text model returned an empty embedding");
    }
    println!("{}", serde_json::json!({"embedding": encode(&embedding)}));
}

/// Reads requests and decodes their windows on a separate thread, one request
/// ahead of inference. On a slow (external) disk, reading the next batch then
/// overlaps the model run of the current one. The host keeps two requests in
/// flight to use this; responses still come back in request order.
#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
fn serve(dir: &Path) {
    let mut encoder = model::Audio::load(dir).unwrap_or_else(|e| fail(e));
    let stdout = io::stdout();
    let mut out = stdout.lock();
    let ready = serde_json::json!({"ready": true, "device": encoder.device(), "dimensions": DIMENSIONS});
    writeln!(out, "{ready}").and_then(|_| out.flush()).unwrap_or_else(|e| fail(e));
    let profile = std::env::var_os("MUSIC_CLAP_PROFILE").is_some();
    let (send, receive) = std::sync::mpsc::sync_channel::<Vec<Result<Prepared, String>>>(1);
    std::thread::spawn(move || {
        let mel = mel::Mel::new();
        let stdin = io::stdin();
        let mut input = stdin.lock();
        let mut line = Vec::new();
        loop {
            line.clear();
            let read = (&mut input)
                .take(MAX_REQUEST_BYTES as u64 + 1)
                .read_until(b'\n', &mut line)
                .unwrap_or_else(|e| fail(e));
            if read == 0 {
                return; // The host closed stdin: the sender drops and serve ends.
            }
            if line.len() > MAX_REQUEST_BYTES {
                fail("Request exceeds 1 MiB");
            }
            let request: Request = serde_json::from_slice(&line).unwrap_or_else(|e| fail(e));
            if request.tracks.len() > MAX_TRACKS {
                fail("Too many tracks in one request");
            }
            let started = std::time::Instant::now();
            let prepared: Vec<Result<Prepared, String>> = std::thread::scope(|scope| {
                let handles: Vec<_> = request
                    .tracks
                    .iter()
                    .map(|track| scope.spawn(|| prepare(&mel, track)))
                    .collect();
                handles
                    .into_iter()
                    .map(|h| h.join().unwrap_or_else(|_| Err("The decoder panicked".into())))
                    .collect()
            });
            if profile {
                eprintln!("decode {:?} tracks {}", started.elapsed(), prepared.len());
            }
            if send.send(prepared).is_err() {
                return;
            }
        }
    });
    for prepared in receive {
        let started = std::time::Instant::now();
        let inputs: Vec<&Vec<f32>> = prepared
            .iter()
            .filter_map(|p| p.as_ref().ok())
            .flat_map(|p| p.features.iter())
            .collect();
        let embeddings = encoder.embed(&inputs).unwrap_or_else(|e| fail(e));
        if profile {
            eprintln!("infer {:?} windows {}", started.elapsed(), inputs.len());
        }
        let mut next = embeddings.into_iter();
        let results: Vec<TrackResult> = prepared
            .into_iter()
            .map(|p| match p {
                Err(error) => TrackResult::Failed { error },
                Ok(p) => {
                    let mut mean = vec![0.0f32; DIMENSIONS];
                    for _ in &p.features {
                        let mut e = next.next().unwrap_or_else(|| fail("Missing embedding"));
                        if normalize(&mut e) {
                            mean.iter_mut().zip(&e).for_each(|(m, v)| *m += v);
                        }
                    }
                    if normalize(&mut mean) {
                        TrackResult::Ready {
                            embedding: encode(&mean),
                            windows: p.windows,
                            seconds: p.seconds,
                        }
                    } else {
                        TrackResult::Failed {
                            error: "The audio model returned an empty embedding".into(),
                        }
                    }
                }
            })
            .collect();
        let response = serde_json::json!({ "results": results });
        writeln!(out, "{response}")
            .and_then(|_| out.flush())
            .unwrap_or_else(|e| fail(e));
    }
}
