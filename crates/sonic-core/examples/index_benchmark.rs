//! Release-profile million-vector proof. Corpus JSON contains producer weights
//! and real analyzed features. Synthetic results are never analysis checkpoints.
use music_sonic_core::{
    index::{Index, Point},
    Analysis, Metric, DIMENSIONS, PROFILE,
};
use std::{
    fs::File,
    io::{BufReader, BufWriter},
    time::Instant,
};
fn millis(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.
}
fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    assert_eq!(
        args.len(),
        4,
        "index_benchmark corpus.json output.json count"
    );
    let corpus: serde_json::Value =
        serde_json::from_reader(BufReader::new(File::open(&args[1]).unwrap())).unwrap();
    let analysis = Analysis {
        profile: PROFILE.into(),
        weights: serde_json::from_value(corpus["weights"].clone()).unwrap(),
        features: vec![0.; DIMENSIONS],
    };
    let source: Vec<Vec<f32>> = serde_json::from_value(corpus["features"].clone()).unwrap();
    let count: usize = args[3].parse().unwrap();
    assert!(count >= source.len());
    let mut records = vec![];
    let mut state = 260_1008u64;
    for distribution in ["resampled-real-with-jitter", "uniform-23d"] {
        let mut random = || {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
            (state >> 32) as u32 as f32 / u32::MAX as f32
        };
        let start = Instant::now();
        let points = (0..count)
            .map(|i| {
                let base = &source[(i * 7919) % source.len()];
                let features = (0..DIMENSIONS)
                    .map(|j| {
                        if distribution == "uniform-23d" {
                            random() * 2. - 1.
                        } else {
                            base[j] + (random() - 0.5) * 0.02
                        }
                    })
                    .collect::<Vec<_>>();
                Point::new(format!("synthetic-{i:08}"), &features).unwrap()
            })
            .collect();
        let generated_ms = millis(start);
        let start = Instant::now();
        let index = Index::build(&analysis, points).unwrap();
        let build_ms = millis(start);
        let path = std::path::Path::new(&args[2]).with_extension(format!("{distribution}.bin"));
        let start = Instant::now();
        index
            .write(BufWriter::new(File::create(&path).unwrap()))
            .unwrap();
        let write_ms = millis(start);
        let start = Instant::now();
        let restored = Index::read(BufReader::new(File::open(&path).unwrap())).unwrap();
        let load_ms = millis(start);
        let mut queries = vec![];
        for iteration in 0..24 {
            let target = if iteration % 3 == 0 {
                let a = &restored.points()[(iteration * 104729) % count].features;
                let b = &restored.points()[((iteration + 13) * 7919) % count].features;
                a.iter()
                    .zip(b)
                    .map(|(a, b)| (a + b) * 0.5)
                    .collect::<Vec<_>>()
            } else {
                restored.points()[(iteration * 104729 + 123) % count]
                    .features
                    .to_vec()
            };
            let filter = if iteration % 3 == 2 {
                "one-percent-eligible"
            } else {
                "all"
            };
            let usable = |key: &str| filter == "all" || key.ends_with("00");
            let mut seed = analysis.clone();
            seed.features = target.clone();
            let metric = Metric::new(&seed).unwrap();
            let start = Instant::now();
            let mut exact = restored
                .points()
                .iter()
                .filter(|p| usable(&p.key))
                .map(|p| (&p.key, metric.distance(&p.features).unwrap()))
                .collect::<Vec<_>>();
            if exact.len() > 50 {
                exact.select_nth_unstable_by(50, |a, b| a.1.total_cmp(&b.1).then(a.0.cmp(b.0)));
                exact.truncate(50);
            }
            exact.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(b.0)));
            let exact_ms = millis(start);
            let start = Instant::now();
            let found = restored.nearest(&target, 50, usable);
            let index_ms = millis(start);
            let keys = found.points.iter().map(|(p, _)| &p.key).collect::<Vec<_>>();
            assert_eq!(
                keys,
                exact.iter().map(|(key, _)| *key).collect::<Vec<_>>(),
                "recall/order {distribution} {iteration}"
            );
            queries.push(serde_json::json!({"iteration":iteration,"kind":if iteration%3==0 {"journey-midpoint"}else{"track"},"filter":filter,"exactMs":exact_ms,"indexMs":index_ms,"visited":found.visited,"recallAt50":1.0,"orderedIdsEqual":true}));
        }
        records.push(serde_json::json!({"distribution":distribution,"synthetic":true,"vectors":count,"sourceVectors":source.len(),"generatedMs":generated_ms,"buildMs":build_ms,"writeMs":write_ms,"loadMs":load_ms,"bytes":std::fs::metadata(&path).unwrap().len(),"queries":queries}));
        println!("{distribution}: {count} vectors, build {build_ms:.0} ms, load {load_ms:.0} ms; all 24 queries exact");
        std::fs::remove_file(path).unwrap();
    }
    serde_json::to_writer_pretty(BufWriter::new(File::create(&args[2]).unwrap()),&serde_json::json!({"profile":PROFILE,"buildProfile":"release","threads":1,"records":records})).unwrap();
}
