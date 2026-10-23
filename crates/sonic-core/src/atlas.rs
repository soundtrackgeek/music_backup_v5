//! Bounded local sound regions. Geometry is descriptive, never a search metric.
use crate::{Analysis, Metric, DIMENSIONS};

pub const VERSION: &str = "sonic-atlas-v1";
pub const LIMIT: usize = 180;
pub const BRIGHTNESS: usize = 2; // Bliss MeanSpectralCentroid
pub const LEVEL: usize = 8; // Bliss MeanLoudness, not LUFS

#[derive(Debug, PartialEq)]
pub struct Region {
    pub representative: usize,
    pub members: Vec<usize>,
}

/// Input is seed first, then exact metric distance and stable identity order.
/// Farthest-first centers followed by actual medoids keep the result repeatable.
pub fn regions(analysis: &Analysis, features: &[Vec<f32>]) -> Option<Vec<Region>> {
    let metric = Metric::new(analysis)?;
    if features.is_empty()
        || features.len() > LIMIT
        || features
            .iter()
            .any(|f| f.len() != DIMENSIONS || metric.distance(f).is_none())
    {
        return None;
    }
    let n = features.len();
    let distances: Vec<Vec<f64>> = features
        .iter()
        .map(|a| {
            features
                .iter()
                .map(|b| metric.between(a, b))
                .collect::<Option<Vec<_>>>()
        })
        .collect::<Option<_>>()?;
    let mut centers = vec![0];
    let target = n.div_ceil(30).clamp(1, 6);
    while centers.len() < target {
        let nearest: Vec<f64> = (0..n)
            .map(|i| {
                centers
                    .iter()
                    .map(|&j| distances[i][j])
                    .fold(f64::INFINITY, f64::min)
            })
            .collect();
        let next = (0..n).max_by(|&a, &b| nearest[a].total_cmp(&nearest[b]).then(b.cmp(&a)))?;
        if nearest[next] < 1e-8 {
            break;
        }
        centers.push(next);
    }
    let mut groups: Vec<Vec<usize>> = centers.iter().map(|_| vec![]).collect();
    for (i, row) in distances.iter().enumerate() {
        let group = (0..centers.len())
            .min_by(|&a, &b| row[centers[a]].total_cmp(&row[centers[b]]).then(a.cmp(&b)))?;
        groups[group].push(i);
    }
    Some(
        groups
            .into_iter()
            .filter(|g| !g.is_empty())
            .map(|members| {
                let cost = |i: usize| {
                    members
                        .iter()
                        .map(|&j| distances[i][j].powi(2))
                        .sum::<f64>()
                };
                let representative = *members
                    .iter()
                    .min_by(|&&a, &&b| cost(a).total_cmp(&cost(b)).then(a.cmp(&b)))
                    .unwrap();
                Region {
                    representative,
                    members,
                }
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::PROFILE;
    #[test]
    fn regions_use_the_full_metric_not_the_two_visible_axes() {
        let mut weights = vec![0.; DIMENSIONS * DIMENSIONS];
        weights[0] = 1.;
        let a = Analysis {
            profile: PROFILE.into(),
            features: vec![0.; DIMENSIONS],
            weights,
        };
        let features: Vec<_> = (0..90)
            .map(|i| {
                let mut f = a.features.clone();
                f[0] = (i / 30) as f32 * 10.;
                f
            })
            .collect();
        let groups = regions(&a, &features).unwrap();
        assert_eq!(groups.len(), 3);
        assert!(groups
            .iter()
            .all(|g| g.members.len() == 30 && g.members.contains(&g.representative)));
        assert_eq!(groups, regions(&a, &features).unwrap());
        let mut members: Vec<_> = groups.iter().flat_map(|g| g.members.clone()).collect();
        members.sort();
        assert_eq!(members, (0..90).collect::<Vec<_>>());
        assert_eq!(regions(&a, &vec![a.features.clone(); 90]).unwrap().len(), 1);
        assert!(regions(&a, &[]).is_none());
        assert!(regions(&a, &vec![a.features.clone(); LIMIT + 1]).is_none());
        assert!(regions(&a, &[vec![f32::NAN; DIMENSIONS]]).is_none());
    }
}
