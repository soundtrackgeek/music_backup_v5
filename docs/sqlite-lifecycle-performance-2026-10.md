# SQLite lifecycle performance proof

Date: 2026-10-04. Music Library 0.157.7 implements item 3 of the October app review.

## What changed

- Each catalog has a process-owned pool. Desktop startup prepares it before background workers start; an Aurora bridge request keeps it alive throughout the request. Failed initialization remains retryable.
- Up to four read-only connections and one cached writer retain page caches. Overlapping mixed provider/import workflows use temporary writers, which close on return. This preserves concurrency while existing jobs retain connections during network/file work; SQLite serializes actual write transactions. A writer mutex held throughout those jobs would block unrelated writes.
- Schema 59 transactionally performs the legacy UK-to-GB repair once. Current schemas do not repeat its scans or migration transaction. Connections retain Unicode lowercase support, WAL, foreign keys and the 15-second busy timeout.
- Connections request 32 MiB page caches and 256 MiB of memory-mapped reads. Resource allocation and the mapping limit remain controlled by SQLite and the OS. Clean exit closes catalog/artwork handles, runs bounded optimization and truncates the WAL. These settings follow the [SQLite PRAGMA documentation](https://www.sqlite.org/pragma.html) and [memory-mapped I/O documentation](https://www.sqlite.org/mmap.html).
- Restore/rollback excludes new leases, waits for existing ones and closes cached handles before replacement. The restored catalog is migrated before use. Lease return rolls back unfinished transactions and removes temporary objects/attached provider databases; a connection that cannot be reset is closed before its lease is marked inactive.

## Measured results

The benchmark used an online SQLite backup of the local catalog: **1,104,937 tracks and 72,600 albums**, about 5.7 GB. The live database was opened read-only for the backup; all migrations and probes ran against the disposable copy.

The baseline used the 0.157.6 connection path and original pragmas. Both versions ran the existing Settings Performance Proof query function three times on the same snapshot. Every operation status, total and returned-row count matched across all three passes.

| Measurement | Before | After |
| --- | ---: | ---: |
| Median warm connection checkout + revision query, 99 calls | 9.984 ms | 0.753 ms |
| First checkout + revision, including initialization | 92.125 ms | 71.803 ms |
| Median complete Performance Proof query run, 3 passes | 43,347 ms | 41,578 ms |

Repeated connection/revision work was **13.3 times faster**; the median complete query run improved **4.1%**. These are local measurements, not a claim that every screen is that much faster. The OS disk cache was not flushed, and startup/first-pass timings are sensitive to cache state. The probe's query timer excludes connection initialization and its preflight search-index check.

Median individual operation timings, milliseconds:

| Operation | Before | After |
| --- | ---: | ---: |
| Album search default page | 1,193 | 982 |
| Album search sampled text | 3 | 3 |
| Track search sampled text | 228 | 207 |
| Chart-style album score ranking | 80 | 73 |
| Music Tool missing covers | 4,229 | 4,242 |
| Music Tool whitespace anomalies | 4,955 | 5,181 |
| Statistics dashboard payload | 30,647 | 29,700 |
| Discovery dashboard payload | 2,123 | 1,229 |

## Verification

- 577 Rust tests passed; 26 opt-in tests remained ignored in the normal suite. The full-catalog probe was run explicitly in addition.
- 331 frontend tests passed across all 77 files with one Vitest worker. The initial default parallel run hit three timing failures; the affected files also passed separately without code changes.
- 15 Library Trimmer, 20 database-copy and six Billboard ranking tests passed. Database-copy fixtures ran in an isolated Python child with a test COMPUTERNAME, because the production sync script correctly rejects this machine as the protected source PC; all database paths in that suite were disposable fixtures.
- Version alignment, chart-bundle checks, seven release tests, security checks, frontend production build, cargo check, formatting of the new modules and git diff checks passed.
- Regression coverage includes concurrent readers/WAL snapshots, overlapping writers, failed initialization, transaction/temporary/attachment cleanup, draining before replacement, restored schema upgrades, one-time UK repair and its atomic failure/retry, and shutdown with Unicode expression indexes.

These are Windows source-level and fixture checks. Installed desktop lifecycle behavior and macOS were not exercised, and no CI/release run was monitored.

## Repeat the probe

Create an online SQLite backup first, then point this opt-in test only at that disposable snapshot. The test can migrate and write the copy, including Discovery's saved Daily Edition.

```powershell
$env:MUSIC_LIBRARY_PROBE_COPY = 'C:\temp\catalog-snapshot.sqlite3'
$env:MUSIC_LIBRARY_PROBE_OUTPUT = 'C:\temp\sqlite-proof.json'
Set-Location src-tauri
cargo test sqlite_lifecycle_performance_proof -- --ignored --nocapture --test-threads=1
```
