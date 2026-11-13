// SPDX-License-Identifier: GPL-3.0-only
//! ONNX Runtime sessions for the CLAP audio and text encoders.
//!
//! Model files (Xenova/larger_clap_music_and_speech, flattened into one folder):
//! `audio_model_fp16.onnx` for DirectML, `audio_model_quantized.onnx` for CPU,
//! `text_model_fp16.onnx` and `tokenizer.json`. The host verifies their hashes.
use ort::{
    session::{builder::GraphOptimizationLevel, Session},
    value::Tensor,
};
use std::path::Path;

use crate::{mel, DIMENSIONS};

fn threads() -> usize {
    std::thread::available_parallelism().map_or(4, |n| n.get())
}

pub struct Audio {
    session: Session,
    device: &'static str,
    batch: usize,
}

impl Audio {
    pub fn load(dir: &Path) -> Result<Self, String> {
        #[cfg(windows)]
        {
            if std::env::var_os("MUSIC_CLAP_DEVICE").is_none_or(|v| v != "cpu") {
                match Self::directml(dir) {
                    Ok(audio) => return Ok(audio),
                    Err(error) => eprintln!("DirectML unavailable, using the CPU: {error}"),
                }
            }
        }
        let session = (|| -> ort::Result<Session> {
            Ok(Session::builder()?
                .with_optimization_level(GraphOptimizationLevel::Level3)?
                .with_intra_threads(threads())?
                .commit_from_file(dir.join("audio_model_quantized.onnx"))?)
        })()
        .map_err(|e| format!("Could not load the CLAP audio model: {e}"))?;
        Ok(Self {
            session,
            device: "CPU",
            batch: 8,
        })
    }

    #[cfg(windows)]
    fn directml(dir: &Path) -> Result<Self, String> {
        use ort::ep::directml::DirectML;
        let mut session = (|| -> ort::Result<Session> {
            Ok(Session::builder()?
                .with_optimization_level(GraphOptimizationLevel::Level3)?
                // DirectML needs sequential execution without memory patterns.
                .with_memory_pattern(false)?
                .with_parallel_execution(false)?
                .with_execution_providers([DirectML::default().build().error_on_failure()])?
                .commit_from_file(dir.join("audio_model_fp16.onnx"))?)
        })()
        .map_err(|e| e.to_string())?;
        // Prove the device works before committing a whole run to it.
        let probe = vec![-50.0f32; mel::FRAMES * mel::MELS];
        Self::run(&mut session, &[&probe])?;
        Ok(Self {
            session,
            device: "DirectML",
            batch: 16,
        })
    }

    pub fn device(&self) -> &'static str {
        self.device
    }

    /// One unnormalized 512-value embedding per mel input.
    pub fn embed(&mut self, inputs: &[&Vec<f32>]) -> Result<Vec<Vec<f32>>, String> {
        let mut out = Vec::with_capacity(inputs.len());
        for chunk in inputs.chunks(self.batch) {
            out.extend(Self::run(&mut self.session, chunk)?);
        }
        Ok(out)
    }

    fn run(session: &mut Session, chunk: &[&Vec<f32>]) -> Result<Vec<Vec<f32>>, String> {
        let mut data = Vec::with_capacity(chunk.len() * mel::FRAMES * mel::MELS);
        for features in chunk {
            data.extend_from_slice(features);
        }
        let shape = vec![chunk.len() as i64, 1, mel::FRAMES as i64, mel::MELS as i64];
        let tensor = Tensor::from_array((shape, data)).map_err(|e| e.to_string())?;
        let outputs = session
            .run(ort::inputs!["input_features" => tensor])
            .map_err(|e| format!("CLAP audio inference failed: {e}"))?;
        let (shape, values) = outputs["audio_embeds"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        if shape.len() != 2 || shape[0] as usize != chunk.len() || shape[1] as usize != DIMENSIONS {
            return Err(format!("Unexpected CLAP audio output shape {shape:?}"));
        }
        if values.iter().any(|v| !v.is_finite()) {
            return Err("CLAP audio model returned non-finite values".into());
        }
        Ok(values.chunks_exact(DIMENSIONS).map(<[f32]>::to_vec).collect())
    }
}

pub struct Text {
    session: Session,
    tokenizer: tokenizers::Tokenizer,
}

/// LAION CLAP was trained on captions of at most 77 tokens.
const MAX_TOKENS: usize = 77;

impl Text {
    pub fn load(dir: &Path) -> Result<Self, String> {
        let tokenizer = tokenizers::Tokenizer::from_file(dir.join("tokenizer.json"))
            .map_err(|e| format!("Could not load the CLAP tokenizer: {e}"))?;
        let session = (|| -> ort::Result<Session> {
            // ORT 1.24's layer-norm fusion breaks this fp16 graph; basic
            // optimizations are plenty for one short query.
            Ok(Session::builder()?
                .with_optimization_level(GraphOptimizationLevel::Level1)?
                .with_intra_threads(threads())?
                .commit_from_file(dir.join("text_model_fp16.onnx"))?)
        })()
        .map_err(|e| format!("Could not load the CLAP text model: {e}"))?;
        Ok(Self { session, tokenizer })
    }

    pub fn embed(&mut self, query: &str) -> Result<Vec<f32>, String> {
        if query.is_empty() {
            return Err("Describe a sound to search for".into());
        }
        let encoding = self
            .tokenizer
            .encode(query, true)
            .map_err(|e| e.to_string())?;
        let mut ids: Vec<i64> = encoding.get_ids().iter().map(|&i| i64::from(i)).collect();
        if ids.len() > MAX_TOKENS {
            let end = *ids.last().unwrap_or(&2);
            ids.truncate(MAX_TOKENS - 1);
            ids.push(end);
        }
        let shape = vec![1i64, ids.len() as i64];
        let tensor = Tensor::from_array((shape, ids)).map_err(|e| e.to_string())?;
        let outputs = self
            .session
            .run(ort::inputs!["input_ids" => tensor])
            .map_err(|e| format!("CLAP text inference failed: {e}"))?;
        let (shape, values) = outputs["text_embeds"]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;
        if shape.len() != 2 || shape[1] as usize != DIMENSIONS || values.iter().any(|v| !v.is_finite()) {
            return Err("Unexpected CLAP text output".into());
        }
        Ok(values.to_vec())
    }
}
