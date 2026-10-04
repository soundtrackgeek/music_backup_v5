// Opt-in: point MUSIC_LIBRARY_PROBE_COPY at a disposable SQLite snapshot, never
// the active catalog. This runs the same Performance Proof queries as Settings.
use super::*;

#[test]
#[ignore = "requires a disposable full-catalog snapshot and an output path"]
fn sqlite_lifecycle_performance_proof() {
    let path = PathBuf::from(std::env::var_os("MUSIC_LIBRARY_PROBE_COPY").expect("snapshot path"));
    let output =
        PathBuf::from(std::env::var_os("MUSIC_LIBRARY_PROBE_OUTPUT").expect("output path"));
    let started = Instant::now();
    let mut opens = Vec::new();
    let pool = pool_for_path(&path).unwrap();
    for _ in 0..100 {
        let start = Instant::now();
        let conn = pool.checkout(lifecycle::Access::Read).unwrap();
        catalog_revision(&conn).unwrap();
        opens.push(start.elapsed().as_micros());
    }
    let mut probes = Vec::new();
    for _ in 0..3 {
        let conn = pool.checkout(lifecycle::Access::Write).unwrap();
        let probe = performance_probe(&conn, "disposable-catalog-snapshot".into()).unwrap();
        assert!(probe
            .operations
            .iter()
            .all(|operation| operation.status == "ok"));
        probes.push(probe);
    }
    fs::write(
        output,
        serde_json::to_vec_pretty(&serde_json::json!({
            "open_and_revision_us": opens,
            "probes": probes,
            "wall_ms": started.elapsed().as_millis(),
        }))
        .unwrap(),
    )
    .unwrap();
}
