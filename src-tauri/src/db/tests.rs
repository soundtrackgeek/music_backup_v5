use super::test_support::*;
use super::*;

#[test]
fn checkpoints_and_truncates_wal() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let db_path = temp_dir.path().join("test-wal.sqlite3");
    let conn = Connection::open(&db_path).expect("open db");
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE t (val INT);
         INSERT INTO t VALUES (1);",
    )
    .expect("insert in wal mode");
    // Simulate abrupt process exit where rusqlite destructor was not run
    std::mem::forget(conn);

    let wal_path = temp_dir.path().join("test-wal.sqlite3-wal");
    assert!(wal_path.exists(), "wal file should exist before checkpoint");

    checkpoint_truncate_path(&db_path).expect("checkpoint truncate");

    let wal_empty_or_removed = !wal_path.exists()
        || fs::metadata(&wal_path)
            .map(|m| m.len() == 0)
            .unwrap_or(true);
    assert!(
        wal_empty_or_removed,
        "wal file should be truncated to 0 or removed"
    );
}
