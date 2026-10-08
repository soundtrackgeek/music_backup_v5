//! Opt-in native performance proof over disposable catalog/results snapshots.
#[test]
#[ignore = "requires MUSIC_SONIC_BENCH_DIR containing SQLite snapshots and seeds.json"]
fn sonic_performance_proof() {
    use music_sonic_core::PROFILE;
    use rusqlite::{Connection, OpenFlags};
    use std::{collections::HashMap, time::Instant};
    let dir = std::path::PathBuf::from(std::env::var_os("MUSIC_SONIC_BENCH_DIR").unwrap());
    let config: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("seeds.json")).unwrap()).unwrap();
    let stops: Vec<String> = serde_json::from_value(config["stops"].clone()).unwrap();
    let indexed = std::env::var("MUSIC_SONIC_BENCH_MODE").as_deref() != Ok("exact");
    let mut records = Vec::new();
    for iteration in 0..5 {
        for task in ["tracks", "albums", "discovery", "journey"] {
            let start = Instant::now();
            let value = if task == "tracks" {
                let c = Connection::open_with_flags(
                    dir.join("music-library.sqlite3"),
                    OpenFlags::SQLITE_OPEN_READ_ONLY,
                )
                .unwrap();
                assert!(crate::sonic::attach(&c, &dir).unwrap());
                serde_json::to_value(
                    crate::sonic::matches_query(&c, true, &stops[0], 50, indexed).unwrap(),
                )
                .unwrap()
            } else {
                let c = Connection::open_with_flags(
                    dir.join("music-library.sqlite3"),
                    OpenFlags::SQLITE_OPEN_READ_ONLY,
                )
                .unwrap();
                assert!(crate::sonic::attach(&c, &dir).unwrap());
                c.execute_batch("PRAGMA query_only=ON").unwrap();
                if task == "albums" {
                    serde_json::to_value(
                        crate::sonic_albums::query_indexed(
                            &c,
                            true,
                            &crate::sonic_albums::SonicAlbumRequest {
                                album_id: config["album"].as_str().unwrap().into(),
                                limit: 20,
                                minimum_coverage: 50,
                            },
                            &HashMap::new(),
                            indexed,
                        )
                        .unwrap(),
                    )
                    .unwrap()
                } else if task == "discovery" {
                    let seed = config["album"].as_str().unwrap().to_string();
                    let eligible = c
                        .prepare("SELECT DISTINCT album_id FROM tracks WHERE album_id!=?1")
                        .unwrap()
                        .query_map([&seed], |r| r.get::<_, String>(0))
                        .unwrap()
                        .collect::<rusqlite::Result<std::collections::HashSet<_>>>()
                        .unwrap();
                    let result =
                        crate::sonic_albums::discovery_indexed(&c, &[seed], &eligible, indexed)
                            .unwrap();
                    let mut ready = result.ready_seeds.into_iter().collect::<Vec<_>>();
                    ready.sort();
                    serde_json::json!({"readySeeds":ready,"albums":result.albums})
                } else {
                    serde_json::to_value(
                        crate::sonic_journey::query_indexed(
                            &c,
                            true,
                            &crate::sonic_journey::JourneyRequest {
                                stop_keys: stops.clone(),
                                connecting_tracks: 3,
                                minimum_rating: None,
                                same_genre: false,
                            },
                            &HashMap::new(),
                            indexed,
                        )
                        .unwrap(),
                    )
                    .unwrap()
                }
            };
            // A fast empty/error response must never pass as a performance win.
            if task == "journey" {
                assert_eq!(value["complete"], true);
                assert_eq!(
                    value["tracks"].as_array().unwrap().len(),
                    stops.len() + (stops.len() - 1) * 3
                );
            } else if task == "discovery" {
                assert!(!value["readySeeds"].as_array().unwrap().is_empty());
                assert!(value["albums"]
                    .as_object()
                    .unwrap()
                    .values()
                    .any(|v| !v.as_array().unwrap().is_empty()));
            } else {
                assert_eq!(value["seedReady"], true);
                assert!(!value[if task == "albums" { "albums" } else { "tracks" }]
                    .as_array()
                    .unwrap()
                    .is_empty());
            }
            let millis = start.elapsed().as_secs_f64() * 1000.;
            println!("{task} iteration={iteration} ms={millis:.2}");
            records.push(
                serde_json::json!({"task":task,"iteration":iteration,"ms":millis,"result":value}),
            );
        }
    }
    let output = std::env::var_os("MUSIC_SONIC_BENCH_OUTPUT").unwrap();
    std::fs::write(
        output,
        serde_json::to_vec_pretty(&serde_json::json!({"profile":PROFILE,"indexed":indexed,"indexStats":crate::sonic_index::proof_stats(),"records":records}))
            .unwrap(),
    )
    .unwrap();
}
