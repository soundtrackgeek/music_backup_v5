//! Small, deterministic ranking prior. Scores are never predicted stars or
//! probabilities. Artist-disjoint validation gates use of the fitted model.
use music_sonic_core::DIMENSIONS;
use serde::{Deserialize, Serialize};

pub(super) const VERSION: &str = "hidden-logistic-v1";

#[derive(Clone)]
pub(super) struct Example {
    pub features: Vec<f32>,
    pub positive: bool,
    pub artist: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct Model {
    mean: Vec<f64>,
    scale: Vec<f64>,
    coefficients: Vec<f64>,
    pub auc: f64,
    pub training: usize,
    pub validation: usize,
}

pub(super) fn hash(value: &str) -> u64 {
    value.bytes().fold(0xcbf29ce484222325, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x100000001b3)
    })
}

fn sigmoid(value: f64) -> f64 {
    1.0 / (1.0 + (-value.clamp(-30., 30.)).exp())
}

impl Model {
    pub fn score(&self, features: &[f32]) -> f64 {
        let sum = features.iter().enumerate().fold(0., |sum, (i, x)| {
            sum + self.coefficients[i]
                * ((f64::from(*x) - self.mean[i]) / self.scale[i]).clamp(-8., 8.)
        });
        sigmoid(sum)
    }
}

fn fit(rows: &[&Example]) -> Model {
    let n = rows.len() as f64;
    let mut mean = vec![0.; DIMENSIONS];
    for row in rows {
        for (sum, x) in mean.iter_mut().zip(&row.features) {
            *sum += f64::from(*x) / n;
        }
    }
    let mut scale = vec![0.; DIMENSIONS];
    for row in rows {
        for (i, x) in row.features.iter().enumerate() {
            scale[i] += (f64::from(*x) - mean[i]).powi(2) / n;
        }
    }
    for x in &mut scale {
        *x = x.sqrt().max(0.01);
    }
    let positives = rows.iter().filter(|e| e.positive).count() as f64;
    // Balance classes: the collection has substantially more five-star labels.
    let weights = [0.5 / (n - positives), 0.5 / positives];
    let prepared: Vec<_> = rows
        .iter()
        .map(|e| {
            (
                e.features
                    .iter()
                    .enumerate()
                    .map(|(i, x)| ((f64::from(*x) - mean[i]) / scale[i]).clamp(-8., 8.))
                    .collect::<Vec<_>>(),
                e.positive,
            )
        })
        .collect();
    let mut coefficients = vec![0.; DIMENSIONS];
    for _ in 0..100 {
        let mut gradient = vec![0.; DIMENSIONS];
        for (features, positive) in &prepared {
            let prediction = sigmoid(features.iter().zip(&coefficients).map(|(x, w)| x * w).sum());
            let error =
                (prediction - if *positive { 1. } else { 0. }) * weights[usize::from(*positive)];
            for (g, x) in gradient.iter_mut().zip(features) {
                *g += error * x;
            }
        }
        for (w, g) in coefficients.iter_mut().zip(gradient) {
            *w -= 0.3 * (g + 0.02 * *w);
        }
    }
    Model {
        mean,
        scale,
        coefficients,
        auc: 0.,
        training: rows.len(),
        validation: 0,
    }
}

fn auc(mut rows: Vec<(f64, bool)>) -> Option<f64> {
    rows.sort_by(|a, b| a.0.total_cmp(&b.0));
    let positives = rows.iter().filter(|r| r.1).count();
    let negatives = rows.len() - positives;
    if positives == 0 || negatives == 0 {
        return None;
    }
    let mut wins = 0.;
    let mut lower_negatives = 0;
    let mut start = 0;
    while start < rows.len() {
        let mut end = start + 1;
        while end < rows.len() && rows[end].0 == rows[start].0 {
            end += 1;
        }
        let positive = rows[start..end].iter().filter(|r| r.1).count();
        let negative = end - start - positive;
        wins += positive as f64 * (lower_negatives as f64 + negative as f64 * 0.5);
        lower_negatives += negative;
        start = end;
    }
    Some(wins / (positives * negatives) as f64)
}

pub(super) fn train(rows: &[Example]) -> Option<Model> {
    let valid: Vec<_> = rows
        .iter()
        .filter(|e| {
            !e.artist.is_empty()
                && e.features.len() == DIMENSIONS
                && e.features.iter().all(|v| v.is_finite())
        })
        .collect();
    let (validation, training): (Vec<_>, Vec<_>) =
        valid.into_iter().partition(|e| hash(&e.artist) % 5 == 0);
    for (sample, minimum) in [(&training, 30), (&validation, 10)] {
        if sample.iter().filter(|e| e.positive).count() < minimum
            || sample.iter().filter(|e| !e.positive).count() < minimum
        {
            return None;
        }
        let artists: std::collections::HashSet<_> = sample.iter().map(|e| &e.artist).collect();
        if artists.len() < 5 {
            return None;
        }
    }
    let mut model = fit(&training);
    model.auc = auc(validation
        .iter()
        .map(|e| (model.score(&e.features), e.positive))
        .collect())?;
    model.validation = validation.len();
    // An unhelpful model must not silently become the primary ordering signal.
    (model.auc >= 0.6).then_some(model)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_on_unseen_artists_and_learns_a_ranking_without_nan() {
        let rows: Vec<_> = (0..100)
            .flat_map(|artist| {
                (0..8).map(move |i| {
                    let mut features = vec![0.; DIMENSIONS];
                    features[0] = if i < 4 { -0.7 } else { 0.7 };
                    Example {
                        features,
                        positive: i >= 4,
                        artist: format!("artist-{artist}"),
                    }
                })
            })
            .collect();
        let model = train(&rows).unwrap();
        assert_eq!(model.auc, 1.);
        assert!(model.validation >= 20);
        assert_eq!(model.training + model.validation, rows.len());
        assert!(model.score(&rows[4].features) > model.score(&rows[0].features));
        let restored: Model =
            serde_json::from_str(&serde_json::to_string(&model).unwrap()).unwrap();
        assert_eq!(
            restored.score(&rows[4].features),
            model.score(&rows[4].features)
        );
    }
    #[test]
    fn rejects_thin_one_class_and_uninformative_training_and_handles_ties() {
        assert!(train(&[]).is_none());
        let rows: Vec<_> = (0..100)
            .flat_map(|artist| {
                (0..8).map(move |i| Example {
                    features: vec![0.; DIMENSIONS],
                    positive: i >= 4,
                    artist: format!("artist-{artist}"),
                })
            })
            .collect();
        assert!(train(&rows).is_none());
        assert_eq!(auc(vec![(0.5, true), (0.5, false)]), Some(0.5));
        assert_eq!(auc(vec![(0.2, false), (0.8, true)]), Some(1.));
    }
}
