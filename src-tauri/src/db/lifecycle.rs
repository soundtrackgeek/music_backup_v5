//! Per-catalog connections. Leases keep SQLite's page cache while separating
//! concurrent reads from a cached writer. Mixed provider/import workflows may
//! retain a handle while doing network or file work; overlapping commands get
//! temporary writers so only SQLite transactions serialize actual writes.
use anyhow::{Context, Result};
use rusqlite::{Connection, OpenFlags};
use std::collections::HashMap;
use std::ops::{Deref, DerefMut};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, OnceLock, Weak};
use std::time::{Duration, Instant};

const READERS: usize = 4;
const WAIT: Duration = Duration::from_secs(15);
static POOLS: OnceLock<Mutex<HashMap<PathBuf, Weak<ConnectionPool>>>> = OnceLock::new();

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Access {
    Read,
    Write,
}

#[derive(Default)]
struct State {
    initialized: bool,
    exclusive: bool,
    active: usize,
    readers: usize,
    writer_busy: bool,
    idle_readers: Vec<Connection>,
    writer: Option<Connection>,
}

pub(crate) struct ConnectionPool {
    path: PathBuf,
    state: Mutex<State>,
    available: Condvar,
}

pub(crate) struct CatalogConnection {
    connection: Option<Connection>,
    pool: Arc<ConnectionPool>,
    access: Access,
    cached_writer: bool,
}

pub(crate) fn pool_for_path(path: &Path) -> Result<Arc<ConnectionPool>> {
    // Canonicalize the directory even before a new catalog exists. This also
    // gives ordinary and Windows verbatim paths the same registry entry.
    let parent = path
        .parent()
        .context("Database path has no parent directory")?;
    let path = parent
        .canonicalize()?
        .join(path.file_name().context("Database path has no filename")?);
    #[cfg(windows)]
    let path = PathBuf::from(path.to_string_lossy().to_lowercase());
    let mut pools = POOLS
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    pools.retain(|_, pool| pool.strong_count() > 0);
    if let Some(pool) = pools.get(&path).and_then(Weak::upgrade) {
        return Ok(pool);
    }
    let pool = Arc::new(ConnectionPool {
        path: path.clone(),
        state: Mutex::new(State::default()),
        available: Condvar::new(),
    });
    pools.insert(path, Arc::downgrade(&pool));
    Ok(pool)
}

impl ConnectionPool {
    pub(super) fn checkout(self: &Arc<Self>, access: Access) -> Result<CatalogConnection> {
        let deadline = Instant::now() + WAIT;
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        while state.exclusive
            || match access {
                Access::Read => state.readers == READERS,
                Access::Write => false,
            }
        {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(busy());
            }
            state = self
                .available
                .wait_timeout(state, remaining)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        // A failed initialization never marks the catalog ready: the next
        // attempt can recover after external lock contention has ended.
        if !state.initialized {
            let conn = Connection::open(&self.path)?;
            super::configure(&conn)?;
            super::migrate(&conn)?;
            state.writer = Some(conn);
            state.initialized = true;
        }
        let cached_writer = access == Access::Write && !state.writer_busy;
        let connection = match access {
            Access::Read => match state.idle_readers.pop() {
                Some(conn) => conn,
                None => {
                    let conn =
                        Connection::open_with_flags(&self.path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
                    super::configure_reader(&conn)?;
                    conn
                }
            },
            Access::Write => match if cached_writer {
                state.writer.take()
            } else {
                None
            } {
                Some(conn) => conn,
                None => {
                    let conn = Connection::open(&self.path)?;
                    super::configure(&conn)?;
                    conn
                }
            },
        };
        match access {
            Access::Read => state.readers += 1,
            Access::Write if cached_writer => state.writer_busy = true,
            Access::Write => {}
        }
        state.active += 1;
        Ok(CatalogConnection {
            connection: Some(connection),
            pool: self.clone(),
            access,
            cached_writer,
        })
    }

    /// Exclude new leases, drain existing ones, and close every handle before
    /// replacement. Invalidate initialization even when replacement fails.
    pub(crate) fn with_replacement<T>(&self, replace: impl FnOnce() -> Result<T>) -> Result<T> {
        let _exclusive = self.drain()?;
        replace()
    }

    pub(crate) fn shutdown(&self) -> Result<()> {
        let _exclusive = self.drain()?;
        if !_exclusive.initialized || !self.path.exists() {
            return Ok(());
        }
        let conn = Connection::open(&self.path)?;
        super::configure(&conn)?;
        // Readers carry most query history, so consider all tables. Bundled
        // SQLite bounds analysis performed by optimize, even on large catalogs.
        conn.execute_batch("PRAGMA optimize = 0x10002;")?;
        drop(conn);
        super::checkpoint_truncate_path(&self.path)
    }

    fn drain(&self) -> Result<Exclusive<'_>> {
        let deadline = Instant::now() + WAIT;
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        while state.exclusive {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(busy());
            }
            state = self
                .available
                .wait_timeout(state, remaining)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        state.exclusive = true;
        self.available.notify_all();
        while state.active > 0 {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                state.exclusive = false;
                self.available.notify_all();
                return Err(busy());
            }
            state = self
                .available
                .wait_timeout(state, remaining)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        }
        let initialized = state.initialized;
        state.idle_readers.clear();
        state.writer = None;
        state.initialized = false;
        Ok(Exclusive {
            pool: self,
            initialized,
        })
    }
}

struct Exclusive<'a> {
    pool: &'a ConnectionPool,
    initialized: bool,
}
impl Drop for Exclusive<'_> {
    fn drop(&mut self) {
        self.pool
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .exclusive = false;
        self.pool.available.notify_all();
    }
}

impl Deref for CatalogConnection {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.connection.as_ref().unwrap()
    }
}
impl DerefMut for CatalogConnection {
    fn deref_mut(&mut self) -> &mut Connection {
        self.connection.as_mut().unwrap()
    }
}

impl Drop for CatalogConnection {
    fn drop(&mut self) {
        let mut connection = self.connection.take().unwrap();
        let reusable = reset(&mut connection).is_ok();
        let mut connection = Some(connection);
        // Close discarded/temporary handles before marking their lease idle.
        // Restore must never observe active=0 while a handle is still closing.
        if !reusable || (self.access == Access::Write && !self.cached_writer) {
            drop(connection.take());
        }
        let mut state = self.pool.state.lock().unwrap_or_else(|e| e.into_inner());
        state.active -= 1;
        match self.access {
            Access::Read => {
                state.readers -= 1;
                if reusable {
                    state.idle_readers.push(connection.take().unwrap());
                }
            }
            Access::Write if self.cached_writer => {
                state.writer_busy = false;
                if reusable {
                    state.writer = connection.take();
                }
            }
            Access::Write => {}
        }
        self.pool.available.notify_all();
    }
}

fn reset(conn: &mut Connection) -> Result<()> {
    if !conn.is_autocommit() {
        conn.execute_batch("ROLLBACK;")?;
    }
    // Failed commands can leave TEMP objects or attached provider databases.
    // They belonged to the command, not to the next borrower of this handle.
    let objects = conn.prepare("SELECT type, name FROM sqlite_temp_schema WHERE type IN ('view', 'table') ORDER BY type DESC, name")?
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (kind, name) in objects {
        conn.execute_batch(&format!(
            "DROP {} IF EXISTS temp.\"{}\";",
            kind,
            name.replace('"', "\"\"")
        ))?;
    }
    let attached = conn
        .prepare("PRAGMA database_list")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for name in attached
        .into_iter()
        .filter(|name| name != "main" && name != "temp")
    {
        conn.execute_batch(&format!(
            "DETACH DATABASE \"{}\";",
            name.replace('"', "\"\"")
        ))?;
    }
    conn.execute_batch("PRAGMA query_only=OFF; PRAGMA foreign_keys=ON;")?;
    conn.busy_timeout(WAIT)?;
    Ok(())
}

fn busy() -> anyhow::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY),
        Some("Catalog connections are busy; retry after the current operation finishes".into()),
    )
    .into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (tempfile::TempDir, Arc<ConnectionPool>) {
        let dir = tempfile::tempdir().unwrap();
        let pool = pool_for_path(&dir.path().join("catalog.sqlite3")).unwrap();
        (dir, pool)
    }

    #[test]
    fn reuses_writer_and_cleans_failed_command_state() {
        let (_dir, pool) = fixture();
        {
            let conn = pool.checkout(Access::Write).unwrap();
            conn.execute_batch("CREATE TABLE lease_test(value); INSERT INTO lease_test VALUES(1); BEGIN; INSERT INTO lease_test VALUES(2); CREATE TEMP TABLE leftovers(value); ATTACH ':memory:' AS provider;").unwrap();
            conn.busy_timeout(Duration::ZERO).unwrap();
        }
        let conn = pool.checkout(Access::Write).unwrap();
        assert!(conn.total_changes() >= 2, "must reuse the same handle");
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM lease_test", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sqlite_temp_schema", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM pragma_database_list", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            2
        );
        assert_eq!(
            conn.query_row("PRAGMA busy_timeout", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            15000
        );
    }

    #[test]
    fn readers_keep_snapshots_without_blocking_the_writer() {
        let (_dir, pool) = fixture();
        {
            let conn = pool.checkout(Access::Write).unwrap();
            conn.execute_batch("CREATE TABLE lease_test(value); INSERT INTO lease_test VALUES(1);")
                .unwrap();
        }
        let readers: Vec<_> = (0..READERS)
            .map(|_| pool.checkout(Access::Read).unwrap())
            .collect();
        let first = &readers[0];
        assert_eq!(
            first
                .query_row("SELECT unicode_lower('BÖRK')", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "börk"
        );
        assert!(first
            .execute("INSERT INTO lease_test VALUES(9)", [])
            .is_err());
        first.execute_batch("BEGIN;").unwrap();
        let value = || {
            first
                .query_row("SELECT value FROM lease_test", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap()
        };
        assert_eq!(value(), 1);
        let conn = pool.checkout(Access::Write).unwrap();
        conn.execute("UPDATE lease_test SET value=2", []).unwrap();
        assert_eq!(value(), 1);
        first.execute_batch("ROLLBACK;").unwrap();
        assert_eq!(value(), 2);
        drop(readers);
        assert_eq!(pool.state.lock().unwrap().idle_readers.len(), READERS);
    }

    #[test]
    fn replacement_waits_for_leases_and_reinitializes_older_catalogs() {
        let (_dir, pool) = fixture();
        let reader = pool.checkout(Access::Read).unwrap();
        let replacing = pool.clone();
        let task = std::thread::spawn(move || {
            replacing.with_replacement(|| {
            std::fs::remove_file(&replacing.path)?;
            let conn = Connection::open(&replacing.path)?;
            super::super::configure(&conn)?;
            super::super::migrate(&conn)?;
            conn.execute_batch("PRAGMA user_version=58; CREATE TABLE restored(value); INSERT INTO restored VALUES(42);")?;
            Ok(())
        })
        });
        let state = pool.state.lock().unwrap();
        let (state, timeout) = pool
            .available
            .wait_timeout_while(state, Duration::from_secs(5), |state| !state.exclusive)
            .unwrap();
        assert!(!timeout.timed_out(), "replacement must begin draining");
        assert_eq!(state.active, 1);
        drop(state);
        drop(reader);
        task.join().unwrap().unwrap();
        let reader = pool.checkout(Access::Read).unwrap();
        assert_eq!(
            reader
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            super::super::LATEST_SCHEMA_VERSION
        );
        assert_eq!(
            reader
                .query_row("SELECT value FROM restored", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            42
        );
    }

    #[test]
    fn failed_replacement_and_failed_initialization_can_retry() {
        let (_dir, pool) = fixture();
        std::fs::write(&pool.path, b"not a database").unwrap();
        assert!(pool.checkout(Access::Read).is_err());
        std::fs::remove_file(&pool.path).unwrap();
        drop(pool.checkout(Access::Write).unwrap());
        assert!(pool
            .with_replacement::<()>(|| anyhow::bail!("copy failed"))
            .is_err());
        drop(pool.checkout(Access::Read).unwrap());
        assert!(!pool.state.lock().unwrap().exclusive);
    }

    #[test]
    fn distinct_paths_have_independent_migration_and_writer_state() {
        let (dir, first) = fixture();
        let second = pool_for_path(&dir.path().join("second.sqlite3")).unwrap();
        let writer = first.checkout(Access::Write).unwrap();
        let other_writer = second.checkout(Access::Write).unwrap();
        assert_eq!(
            other_writer
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            super::super::LATEST_SCHEMA_VERSION
        );
        let alias = pool_for_path(&dir.path().join(".").join("catalog.sqlite3")).unwrap();
        assert!(Arc::ptr_eq(&first, &alias));
        drop(writer);
    }

    #[test]
    fn mixed_workflows_can_overlap_without_blocking_unrelated_writes() {
        let (_dir, pool) = fixture();
        {
            let conn = pool.checkout(Access::Write).unwrap();
            conn.execute_batch("CREATE TABLE counter(value); INSERT INTO counter VALUES(0);")
                .unwrap();
        }
        let held_writer = pool.checkout(Access::Write).unwrap();
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let pool = pool.clone();
                std::thread::spawn(move || {
                    let conn = pool.checkout(Access::Write).unwrap();
                    conn.execute("UPDATE counter SET value=value+1", [])
                        .unwrap();
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        assert!(pool.state.lock().unwrap().writer_busy);
        drop(held_writer);
        let conn = pool.checkout(Access::Read).unwrap();
        assert_eq!(
            conn.query_row("SELECT value FROM counter", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            8
        );
    }

    #[test]
    fn shutdown_closes_handles_and_keeps_unicode_indexes_usable() {
        let (_dir, pool) = fixture();
        {
            let conn = pool.checkout(Access::Write).unwrap();
            conn.execute_batch("CREATE TABLE names(value TEXT); CREATE INDEX lower_name ON names(unicode_lower(value)); INSERT INTO names VALUES('BÖRK');").unwrap();
        }
        drop(pool.checkout(Access::Read).unwrap());
        pool.shutdown().unwrap();
        let state = pool.state.lock().unwrap();
        assert!(state.writer.is_none() && state.idle_readers.is_empty());
        drop(state);
        let renamed = pool.path.with_extension("closed.sqlite3");
        std::fs::rename(&pool.path, &renamed).unwrap();
        let conn = Connection::open(renamed).unwrap();
        super::super::configure(&conn).unwrap();
        assert_eq!(
            conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
    }
}
