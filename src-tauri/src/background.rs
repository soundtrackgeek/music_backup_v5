//! Process-owned schedules. Only saved scheduling fields can reset a deadline.
use std::time::Duration;
use tokio::sync::watch;
use tauri_specta::Event as _;

#[derive(Clone, Debug, PartialEq, Eq)]
struct Schedule {
    period: Option<Duration>,
    path: String,
}

impl Schedule {
    fn minutes(minutes: u32, path: String) -> Self {
        Self {
            period: (minutes > 0).then(|| Duration::from_secs(u64::from(minutes) * 60)),
            path,
        }
    }

    fn overlay(minutes: u32, saved_path: String) -> Self {
        Self::minutes(
            if saved_path.trim().is_empty() {
                0
            } else {
                minutes
            },
            saved_path,
        )
    }
}

fn update(sender: &watch::Sender<Schedule>, next: Schedule) {
    sender.send_if_modified(|current| {
        if *current == next {
            return false;
        }
        *current = next;
        true
    });
}

async fn run_schedule<F, Fut>(mut config: watch::Receiver<Schedule>, immediate: bool, mut job: F)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    loop {
        let schedule = config.borrow_and_update().clone();
        let Some(period) = schedule.period else {
            if config.changed().await.is_err() {
                return;
            }
            continue;
        };
        let start = tokio::time::Instant::now();
        let mut timer =
            tokio::time::interval_at(if immediate { start } else { start + period }, period);
        timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                biased;
                changed = config.changed() => {
                    if changed.is_err() { return; }
                    break;
                }
                _ = timer.tick() => job().await,
            }
        }
    }
}

// Emit a second pulse after a change for child queries that failed transiently.
#[derive(Default)]
struct RevisionNotifier {
    observed: Option<String>,
    pending: bool,
    retry: bool,
}

impl RevisionNotifier {
    fn observe(&mut self, revision: &str) -> bool {
        if self.observed.as_deref() != Some(revision) {
            self.observed = Some(revision.to_string());
            self.pending = true;
            self.retry = false;
        }
        self.pending || self.retry
    }

    fn acknowledge(&mut self, revision: &str) {
        if self.observed.as_deref() != Some(revision) {
            return;
        }
        if self.pending {
            self.pending = false;
            self.retry = true;
        } else {
            self.retry = false;
        }
    }
}

#[cfg(not(test))]
mod desktop {
    use super::*;
    use crate::{db, models::AppSettings, music_doctor, updater};
    use tauri::{AppHandle, Manager};

    pub struct BackgroundScheduler {
        doctor: watch::Sender<Schedule>,
        overlay: watch::Sender<Schedule>,
        updates: watch::Sender<Schedule>,
        tasks: Vec<tauri::async_runtime::JoinHandle<()>>,
    }

    #[derive(Default)]
    pub struct CatalogNotifications(std::sync::Mutex<RevisionNotifier>);

    impl CatalogNotifications {
        pub fn acknowledge(&self, revision: &str) {
            self.0
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .acknowledge(revision);
        }
    }

    impl BackgroundScheduler {
        pub fn configure(&self, settings: &AppSettings) {
            // send_if_modified leaves timers alone when unrelated settings are saved.
            update(&self.doctor, doctor_schedule(settings));
            update(&self.overlay, overlay_schedule(settings));
            update(
                &self.updates,
                Schedule::minutes(settings.update_auto_check_minutes, String::new()),
            );
        }

        pub fn stop(&self) {
            for task in &self.tasks {
                task.abort();
            }
        }
    }

    fn doctor_schedule(settings: &AppSettings) -> Schedule {
        Schedule::minutes(
            if settings.music_doctor_auto_sync {
                5
            } else {
                0
            },
            settings.music_doctor_database_path.clone(),
        )
    }

    fn overlay_schedule(settings: &AppSettings) -> Schedule {
        Schedule::overlay(
            settings.musicbrainz_overlay_auto_sync_minutes,
            settings.musicbrainz_overlay_sync_path.clone(),
        )
    }

    pub fn start(app: &AppHandle) -> anyhow::Result<()> {
        let settings = db::settings_for_app(app)?;
        app.manage(updater::UpdateState::default());
        app.manage(CatalogNotifications::default());
        let (doctor, doctor_config) = watch::channel(doctor_schedule(&settings));
        let (overlay, overlay_config) = watch::channel(overlay_schedule(&settings));
        let (updates, update_config) = watch::channel(Schedule::minutes(
            settings.update_auto_check_minutes,
            String::new(),
        ));
        let doctor_app = app.clone();
        let overlay_app = app.clone();
        let update_app = app.clone();
        let catalog_app = app.clone();
        let tasks = vec![
            tauri::async_runtime::spawn(run_schedule(doctor_config, true, move || {
                let app = doctor_app.clone();
                async move {
                    let _ = tauri::async_runtime::spawn_blocking(move || {
                        // Re-read saved settings at execution, including the source path.
                        let settings = db::settings_for_app(&app)?;
                        if !settings.music_doctor_auto_sync {
                            return Ok::<_, anyhow::Error>(());
                        }
                        let status = music_doctor::status_for_app(&app)?;
                        if status.valid && status.needs_sync && !status.sync_in_progress {
                            crate::jobs::submit(&app,"musicDoctor",serde_json::json!({}))?;
                        }
                        Ok(())
                    })
                    .await;
                }
            })),
            tauri::async_runtime::spawn(run_schedule(overlay_config, false, move || {
                let app = overlay_app.clone();
                async move {
                    let _ = tauri::async_runtime::spawn_blocking(move || {
                        let settings = db::settings_for_app(&app)?;
                        if settings.musicbrainz_overlay_auto_sync_minutes == 0
                            || settings.musicbrainz_overlay_sync_path.trim().is_empty()
                        {
                            return Ok::<_, anyhow::Error>(());
                        }
                        crate::jobs::submit(&app,"overlay",serde_json::json!({"recordNoop":false}))?;
                        Ok(())
                    })
                    .await;
                }
            })),
            tauri::async_runtime::spawn(async move {
                // Startup check is independent of the recurring interval being disabled.
                let _ = updater::check(&update_app).await;
                run_schedule(update_config, false, || updater::check_quietly(&update_app)).await;
            }),
            tauri::async_runtime::spawn(async move {
                let mut timer = tokio::time::interval(Duration::from_secs(1));
                timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    timer.tick().await;
                    let app = catalog_app.clone();
                    if let Ok(Ok(revision)) = tauri::async_runtime::spawn_blocking(move || {
                        db::catalog_revision_for_app(&app)
                    })
                    .await
                    {
                        if catalog_app
                            .state::<CatalogNotifications>()
                            .0
                            .lock()
                            .unwrap_or_else(|error| error.into_inner())
                            .observe(&revision)
                        {
                            let _ = crate::events::CatalogRevisionChanged(revision).emit(&catalog_app);
                        }
                    }
                }
            }),
        ];
        app.manage(BackgroundScheduler {
            doctor,
            overlay,
            updates,
            tasks,
        });
        Ok(())
    }
}

#[cfg(not(test))]
pub use desktop::*;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    #[tokio::test(start_paused = true)]
    async fn saved_settings_control_deadlines_without_overlapping_jobs() {
        let (sender, receiver) = watch::channel(Schedule::minutes(60, "saved.sqlite3".into()));
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let task = tokio::spawn(run_schedule(receiver, false, move || {
            let counter = counter.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_secs(120)).await;
            }
        }));
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(3599)).await;
        // Identical saved scheduling settings (e.g. an artist/sidebar change) do not reset.
        update(&sender, Schedule::minutes(60, "saved.sqlite3".into()));
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        sender
            .send(Schedule::minutes(0, "saved.sqlite3".into()))
            .unwrap();
        tokio::time::advance(Duration::from_secs(120)).await;
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(7200)).await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        sender
            .send(Schedule::minutes(5, "new-saved.sqlite3".into()))
            .unwrap();
        tokio::task::yield_now().await;
        tokio::time::advance(Duration::from_secs(300)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        task.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn slow_jobs_skip_missed_ticks_and_do_not_overlap() {
        let (_sender, receiver) = watch::channel(Schedule::minutes(1, String::new()));
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = calls.clone();
        let task = tokio::spawn(run_schedule(receiver, true, move || {
            let counter = counter.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_secs(180)).await;
            }
        }));
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        tokio::time::advance(Duration::from_secs(120)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        tokio::time::advance(Duration::from_secs(60)).await;
        tokio::task::yield_now().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        task.abort();
    }

    #[test]
    fn overlay_requires_a_saved_path_and_only_changed_scheduling_fields_notify() {
        assert_eq!(Schedule::overlay(60, "  ".into()).period, None);
        assert_eq!(Schedule::overlay(0, "saved.sqlite3".into()).period, None);
        let original = Schedule::overlay(60, "saved.sqlite3".into());
        let (sender, mut receiver) = watch::channel(original.clone());
        // Unrelated saved preferences project to the exact same schedule.
        update(&sender, original);
        assert!(!receiver.has_changed().unwrap());
        update(&sender, Schedule::overlay(60, "new-saved.sqlite3".into()));
        assert!(receiver.has_changed().unwrap());
        assert_eq!(receiver.borrow_and_update().path, "new-saved.sqlite3");
        update(&sender, Schedule::overlay(15, "new-saved.sqlite3".into()));
        assert!(receiver.has_changed().unwrap());
        assert_eq!(
            receiver.borrow_and_update().period,
            Some(Duration::from_secs(900))
        );
    }

    #[test]
    fn revision_changes_get_one_follow_up_pulse() {
        let mut notifier = RevisionNotifier::default();
        assert!(notifier.observe("a"));
        // Keep retrying while hidden or a refresh fails, until the UI acknowledges.
        assert!(notifier.observe("a"));
        notifier.acknowledge("a");
        assert!(notifier.observe("a"));
        notifier.acknowledge("a");
        assert!(!notifier.observe("a"));
        assert!(notifier.observe("b"));
        assert!(notifier.observe("c"));
        notifier.acknowledge("b");
        assert!(notifier.observe("c"));
        notifier.acknowledge("c");
        assert!(notifier.observe("c"));
        notifier.acknowledge("c");
        assert!(!notifier.observe("c"));
    }
}
