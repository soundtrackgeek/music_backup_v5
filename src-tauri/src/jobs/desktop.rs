use super::*;
use crate::{
    artist_completion, covers, lastfm, library_completion, music_doctor, musicbrainz,
    musicbrainz_sync, wishlist,
};
use serde_json::{json, Value};
use std::{
    cell::RefCell,
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
    time::Instant,
};
use tauri::{AppHandle, Manager};
use tauri_specta::Event as _;
use tokio::sync::{oneshot, Notify};

type Handler = fn(&AppHandle, Value) -> Result<Value>;
struct Registration {
    kind: &'static str,
    label: &'static str,
    resumable: bool,
    cancel: bool,
    retry: bool,
    handler: Handler,
}
macro_rules! registration {
    ($kind:literal,$label:literal,$resume:literal,$cancel:literal,$retry:literal,$handler:expr) => {
        Registration {
            kind: $kind,
            label: $label,
            resumable: $resume,
            cancel: $cancel,
            retry: $retry,
            handler: $handler,
        }
    };
}
fn encode<T: Serialize>(value: T) -> Result<Value> {
    Ok(serde_json::to_value(value)?)
}
const HANDLERS: &[Registration] = &[
    registration!(
        "sonicReuse",
        "Verify reused analysis",
        true,
        true,
        true,
        crate::sonic::run
    ),
    registration!(
        "sonicAnalysis",
        "Audio analysis",
        true,
        true,
        true,
        crate::sonic::run
    ),
    registration!(
        "albumVerification",
        "Album verification",
        true,
        true,
        true,
        |app, p| {
            library_completion::run_job(
                app,
                p["batchId"]
                    .as_i64()
                    .ok_or_else(|| anyhow::anyhow!("Missing batch"))?,
                p["createdAt"].as_str().unwrap_or_default(),
            )
        }
    ),
    registration!(
        "artistVerification",
        "Artist verification",
        true,
        true,
        true,
        |app, p| {
            artist_completion::run_job(
                app,
                p["batchId"]
                    .as_i64()
                    .ok_or_else(|| anyhow::anyhow!("Missing batch"))?,
                p["createdAt"].as_str().unwrap_or_default(),
            )
        }
    ),
    registration!(
        "originCountries",
        "Origin country import",
        false,
        true,
        true,
        |app, p| encode(musicbrainz::import_origin_countries_for_app(
            app,
            serde_json::from_value(p)?
        )?)
    ),
    registration!(
        "artistInfo",
        "Artist info import",
        false,
        true,
        true,
        |app, p| encode(musicbrainz::import_artist_infos_for_app(
            app,
            serde_json::from_value(p)?
        )?)
    ),
    registration!(
        "covers",
        "Cover import",
        false,
        true,
        true,
        |app, p| encode(covers::import_album_covers(
            app.clone(),
            serde_json::from_value(p)?
        )?)
    ),
    registration!(
        "portraits",
        "Last.fm portraits",
        false,
        true,
        true,
        |app, p| encode(lastfm::refresh_artist_images(
            app.clone(),
            serde_json::from_value(p["limit"].clone())?
        )?)
    ),
    registration!(
        "musicDoctor",
        "Music Doctor sync",
        false,
        false,
        true,
        |app, _| {
            let result = music_doctor::sync_for_app(app)?;
            let _ = crate::events::MusicDoctorSyncCompleted(result.clone()).emit(app);
            encode(result)
        }
    ),
    registration!(
        "overlay",
        "MusicBrainz overlay sync",
        false,
        false,
        true,
        |app, p| {
            let result = musicbrainz_sync::sync_for_app_with_options(
                app,
                p["recordNoop"].as_bool().unwrap_or(true),
            )?;
            if result.changed_count > 0 {
                let _ = crate::events::MusicBrainzOverlaySyncCompleted(result.clone()).emit(app);
            }
            encode(result)
        }
    ),
    registration!(
        "wishListSearch",
        "Wish List MusicBrainz search",
        false,
        false,
        true,
        |_, p| encode(wishlist::search_musicbrainz_for_wishlist(
            serde_json::from_value(p)?
        )?)
    ),
    registration!(
        "wishListVerification",
        "Wish List verification",
        false,
        false,
        true,
        |app, p| encode(wishlist::add_musicbrainz_candidate_for_app(
            app,
            serde_json::from_value(p)?
        )?)
    ),
];
fn registration(kind: &str) -> Result<&'static Registration> {
    HANDLERS
        .iter()
        .find(|h| h.kind == kind)
        .ok_or_else(|| anyhow::anyhow!("Unknown job kind {kind}"))
}

pub struct JobSystem {
    path: PathBuf,
    wake: Arc<Notify>,
    waiters: Mutex<HashMap<i64, oneshot::Sender<std::result::Result<Value, String>>>>,
    tasks: Mutex<Vec<tauri::async_runtime::JoinHandle<()>>>,
    transitions: Mutex<()>,
    events: Mutex<()>,
    catalog: RwLock<()>,
}
impl JobSystem {
    fn open(&self) -> Result<Connection> {
        let conn = Connection::open(&self.path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(conn)
    }
    pub fn stop(&self) {
        for task in self
            .tasks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain(..)
        {
            task.abort();
        }
    }
}
struct CurrentJob {
    app: AppHandle,
    id: i64,
    started: Instant,
    store: Connection,
}
thread_local! { static CURRENT: RefCell<Option<CurrentJob>> = const { RefCell::new(None) }; }

pub fn start(app: &AppHandle) -> Result<()> {
    let path = app.path().app_data_dir()?.join("jobs.sqlite3");
    let system = JobSystem {
        path,
        wake: Arc::new(Notify::new()),
        waiters: Mutex::new(HashMap::new()),
        tasks: Mutex::new(Vec::new()),
        transitions: Mutex::new(()),
        events: Mutex::new(()),
        catalog: RwLock::new(()),
    };
    let conn = system.open()?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
    ensure_schema(&conn)?;
    recover(&conn)?;
    drop(conn);
    app.manage(system);
    // Attach existing persistent verification queues, including jobs created before this release.
    library_completion::resume_verification_worker(app.clone());
    artist_completion::resume_verification_worker(app.clone());
    for _ in 0..2 {
        let app = app.clone();
        let wake = app.state::<JobSystem>().wake.clone();
        let worker_app = app.clone();
        let task = tauri::async_runtime::spawn(async move {
            loop {
                // Register before claiming; notify_one retains a permit for work queued during execution.
                let notified = wake.notified();
                let app = worker_app.clone();
                let outcome = tauri::async_runtime::spawn_blocking(move || run_next(&app)).await;
                match outcome {
                    Ok(Ok(true)) => continue,
                    Ok(Err(error)) => {
                        eprintln!("Activity worker: {error:#}");
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                    Err(error) => {
                        eprintln!("Activity worker task: {error}");
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                    _ => notified.await,
                }
            }
        });
        app.state::<JobSystem>()
            .tasks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(task);
    }
    Ok(())
}

pub fn list_for_app(app: &AppHandle) -> Result<Vec<Job>> {
    list(&app.state::<JobSystem>().open()?)
}
fn emit(app: &AppHandle) {
    let system = app.state::<JobSystem>();
    let _events = system.events.lock().unwrap_or_else(|e| e.into_inner());
    if let Ok(jobs) = list_for_app(app) {
        let _ = crate::events::ActivityJobsChanged(jobs).emit(app);
    }
}
pub fn submit(app: &AppHandle, kind: &str, payload: Value) -> Result<i64> {
    let h = registration(kind)?;
    let id = enqueue(
        &app.state::<JobSystem>().open()?,
        kind,
        h.label,
        &payload.to_string(),
        h.resumable,
        h.cancel,
        h.retry,
        None,
    )?;
    emit(app);
    app.state::<JobSystem>().wake.notify_one();
    Ok(id)
}
pub async fn execute(
    app: AppHandle,
    kind: &str,
    payload: Value,
) -> std::result::Result<Value, String> {
    let id = submit(&app, kind, payload).map_err(|e| format!("{e:#}"))?;
    let (sender, receiver) = oneshot::channel();
    app.state::<JobSystem>()
        .waiters
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, sender);
    // Completion may race waiter registration. Read after registration to close that gap.
    let job = get(
        &app.state::<JobSystem>().open().map_err(|e| e.to_string())?,
        id,
    )
    .map_err(|e| e.to_string())?;
    if matches!(job.state.as_str(), "completed" | "failed" | "cancelled") {
        app.state::<JobSystem>()
            .waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
        return stored_result(job);
    }
    receiver
        .await
        .map_err(|_| "The job worker stopped".to_string())?
}
/// A finished job's stored result, typed for the generated bindings.
///
/// It serializes exactly like the raw JSON `Value` the job produced, but tells
/// specta the TypeScript type is `T`. (`Value` itself cannot be exported:
/// specta rc.25 recurses forever on it.)
pub struct JobOutput<T>(Value, std::marker::PhantomData<fn() -> T>);
impl<T> serde::Serialize for JobOutput<T> {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}
impl<T: specta::Type> specta::Type for JobOutput<T> {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        T::definition(types)
    }
}
/// Runs a job and returns its result typed as `T`; the job handler must
/// produce JSON that serializes from `T`.
pub async fn execute_typed<T>(
    app: AppHandle,
    kind: &str,
    payload: Value,
) -> std::result::Result<JobOutput<T>, String> {
    execute(app, kind, payload)
        .await
        .map(|value| JobOutput(value, std::marker::PhantomData))
}
fn stored_result(job: Job) -> std::result::Result<Value, String> {
    if let Some(result) = job.result_json {
        serde_json::from_str(&result).map_err(|e| e.to_string())
    } else if job.state == "completed" {
        Ok(Value::Null)
    } else {
        Err(job
            .error
            .unwrap_or_else(|| format!("{} {}", job.label, job.state)))
    }
}
fn run_next(app: &AppHandle) -> Result<bool> {
    let system = app.state::<JobSystem>();
    let _catalog = system
        .catalog
        .try_read()
        .map_err(|_| anyhow::anyhow!("Catalog replacement is in progress"))?;
    let job = {
        let system = app.state::<JobSystem>();
        let _transition = system.transitions.lock().unwrap_or_else(|e| e.into_inner());
        claim(&mut system.open()?)?
    };
    let Some(job) = job else {
        return Ok(false);
    };
    // Audio decoding owns only derived storage. A paused, multi-day scan must
    // not prevent imports/restores; it rechecks the current catalog per item.
    let _catalog = if matches!(job.kind.as_str(), "sonicAnalysis" | "sonicReuse") {
        drop(_catalog);
        None
    } else {
        Some(_catalog)
    };
    emit(app);
    let store = system.open()?;
    CURRENT.with(|c| {
        *c.borrow_mut() = Some(CurrentJob {
            app: app.clone(),
            id: job.id,
            started: Instant::now(),
            store,
        })
    });
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        checkpoint()?;
        (registration(&job.kind)?.handler)(app, serde_json::from_str(&job.payload_json)?)
    }))
    .unwrap_or_else(|_| {
        Err(anyhow::anyhow!(
            "The job handler panicked; review Activity before retrying."
        ))
    });
    CURRENT.with(|c| *c.borrow_mut() = None);
    let reattach = result
        .as_ref()
        .err()
        .is_some_and(|error| error.is::<CheckpointChanged>());
    {
        let system = app.state::<JobSystem>();
        let _transition = system.transitions.lock().unwrap_or_else(|e| e.into_inner());
        finish(&system.open()?, job.id, &result)?;
    }
    emit(app);
    if let Some(waiter) = app
        .state::<JobSystem>()
        .waiters
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&job.id)
    {
        // Preserve partial import summaries for the original workspace on cancellation.
        let outcome = match result {
            Ok(value) => Ok(value),
            Err(error) => Err(format!("{error:#}")),
        };
        let _ = waiter.send(outcome);
    }
    if reattach {
        if job.kind == "albumVerification" {
            library_completion::resume_verification_worker(app.clone());
        } else {
            artist_completion::resume_verification_worker(app.clone());
        }
    }
    Ok(true)
}

pub fn cancel_requested() -> bool {
    CURRENT.with(|c| {
        c.borrow().as_ref().is_some_and(|current| {
            get(&current.store, current.id)
                .map(|j| matches!(j.state.as_str(), "cancelling" | "cancelled"))
                .unwrap_or(false)
        })
    })
}
pub fn should_stop() -> bool {
    CURRENT.with(|c| {
        c.borrow().as_ref().is_some_and(|current| {
            get(&current.store, current.id)
                .map(|j| j.state != "running")
                .unwrap_or(true)
        })
    })
}
pub fn checkpoint() -> Result<()> {
    if cancel_requested() {
        bail!("Job cancelled at a safe boundary.");
    }
    Ok(())
}
pub fn progress(completed: i64, total: i64, message: &str) {
    CURRENT.with(|c| {
        if let Some(current) = c.borrow().as_ref() {
            let percent = if total > 0 {
                (completed as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
            } else { 0.0 };
            let eta = if completed > 0 && completed < total {
                Some((current.started.elapsed().as_secs_f64() / completed as f64 * (total-completed) as f64).ceil() as i64)
            } else { None };
            let _ = current.store.execute(
                "UPDATE jobs SET completed=?2,total=?3,progress=?4,eta_seconds=?5,message=?6,updated_at=?7 WHERE id=?1",
                params![current.id,completed,total,percent,eta,message,Utc::now().to_rfc3339()],
            );
            emit(&current.app);
        }
    });
}

/// Project a checkpoint queue into the common registry without duplicating its items.
pub fn verification_status(app: &AppHandle, kind: &str, status: &Value) -> Result<()> {
    let Some(batch) = status.get("batch").filter(|b| !b.is_null()) else {
        return Ok(());
    };
    let batch_id = batch["id"]
        .as_i64()
        .ok_or_else(|| anyhow::anyhow!("Missing verification batch ID"))?;
    let h = registration(kind)?;
    let conn = app.state::<JobSystem>().open()?;
    let key = format!(
        "{kind}:{batch_id}:{}",
        batch["createdAt"].as_str().unwrap_or_default()
    );
    let id = enqueue(
        &conn,
        kind,
        batch["label"].as_str().unwrap_or(h.label),
        &json!({"batchId":batch_id,"createdAt":batch["createdAt"]}).to_string(),
        true,
        true,
        true,
        Some(&key),
    )?;
    let job = get(&conn, id)?;
    if matches!(job.state.as_str(), "cancelled" | "cancelling") {
        return Ok(());
    }
    let source = batch["state"].as_str().unwrap_or("paused");
    let failed = batch["failedCount"].as_i64().unwrap_or(0);
    let state = match source {
        "completed" if failed > 0 => "failed",
        "completed" => "completed",
        "paused" if matches!(job.state.as_str(), "running" | "pausing") => "pausing",
        "paused" => "paused",
        "running" if job.state == "pausing" => "running",
        _ if matches!(job.state.as_str(), "running" | "pausing") => job.state.as_str(),
        _ => "queued",
    };
    let completed = batch["completedCount"].as_i64().unwrap_or(0);
    let total = batch["totalCount"].as_i64().unwrap_or(0);
    let error = (source == "completed" && failed > 0)
        .then(|| format!("{failed} checks failed. Retry reruns only failed checks."));
    conn.execute("UPDATE jobs SET state=?2,completed=?3,total=?4,progress=?5,eta_seconds=?6,error=?7,message=?8,updated_at=?9 WHERE id=?1",params![id,state,completed,total,if total>0 {completed as f64/total as f64*100.0} else {0.0},batch["estimatedSecondsRemaining"].as_i64(),error,format!("{completed} of {total} checks complete"),Utc::now().to_rfc3339()])?;
    emit(app);
    if state == "queued" {
        app.state::<JobSystem>().wake.notify_one();
    }
    Ok(())
}

pub fn control_for_app(app: &AppHandle, id: i64, action: &str) -> Result<Vec<Job>> {
    let system = app.state::<JobSystem>();
    let _transition = system.transitions.lock().unwrap_or_else(|e| e.into_inner());
    let conn = app.state::<JobSystem>().open()?;
    let job = get(&conn, id)?;
    let next = control(&conn, id, action)?;
    if matches!(
        job.kind.as_str(),
        "albumVerification" | "artistVerification"
    ) {
        let payload: Value = serde_json::from_str(&job.payload_json)?;
        let batch = payload["batchId"]
            .as_i64()
            .ok_or_else(|| anyhow::anyhow!("Missing batch ID"))?;
        // The common state is authoritative for cancellation; the checkpoint is paused
        // so the current provider response can settle without scheduling another item.
        if let Err(error) = match job.kind.as_str() {
            "albumVerification" => library_completion::control_job(app, batch, action),
            _ => artist_completion::control_job(app, batch, action),
        } {
            conn.execute(
                "UPDATE jobs SET state=?2,error=?3 WHERE id=?1",
                params![id, job.state, error.to_string()],
            )?;
            emit(app);
            return Err(error);
        }
    }
    if next.state == "cancelled" {
        if let Some(waiter) = app
            .state::<JobSystem>()
            .waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id)
        {
            let _ = waiter.send(Err("Job cancelled before execution".to_string()));
        }
    }
    emit(app);
    app.state::<JobSystem>().wake.notify_one();
    list_for_app(app)
}
pub fn cancel_kind(app: &AppHandle, kind: &str) -> Result<()> {
    if let Some(job) = list_for_app(app)?.into_iter().find(|j| {
        j.kind == kind
            && matches!(
                j.state.as_str(),
                "queued" | "running" | "paused" | "pausing"
            )
    }) {
        control_for_app(app, job.id, "cancel")?;
    }
    Ok(())
}

pub fn ensure_verification_slot(app: &AppHandle, kind: &str, batch_id: Option<i64>) -> Result<()> {
    for job in list_for_app(app)? {
        if job.kind == kind
            && matches!(
                job.state.as_str(),
                "queued" | "running" | "pausing" | "paused" | "cancelling"
            )
        {
            let payload: Value = serde_json::from_str(&job.payload_json)?;
            if batch_id.is_none() || payload["batchId"].as_i64() != batch_id {
                bail!("Finish or cancel the current verification job before starting another one.");
            }
        }
    }
    Ok(())
}

pub fn with_catalog_replacement<T>(
    app: &AppHandle,
    operation: impl FnOnce() -> Result<T>,
) -> Result<T> {
    let system = app.state::<JobSystem>();
    let catalog = system.catalog.try_write().map_err(|_| {
        anyhow::anyhow!(
            "Finish or cancel active jobs in Activity Center before replacing the catalog."
        )
    })?;
    let _transition = system.transitions.lock().unwrap_or_else(|e| e.into_inner());
    let result = operation()?;
    system.open()?.execute("UPDATE jobs SET state='failed',can_retry=0,error='The catalog was replaced. Start this work again from its workspace.',updated_at=?1 WHERE state IN ('queued','running','pausing','paused','cancelling')",[Utc::now().to_rfc3339()])?;
    drop(_transition);
    drop(catalog);
    library_completion::resume_verification_worker(app.clone());
    artist_completion::resume_verification_worker(app.clone());
    emit(app);
    Ok(result)
}
