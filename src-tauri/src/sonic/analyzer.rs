//! Bounded analyzer IPC without temporary files. On Windows a randomly named
//! output file can collide with a directory (case-insensitively), returning
//! AccessDenied instead of AlreadyExists, which tempfile cannot retry.
use anyhow::{bail, Context, Result};
use std::{
    io::{self, Read},
    process::{Child, Command, Output, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

/// A three-hour timeline is about 835 KB of base64 on stdout.
const STDOUT_LIMIT: usize = 1024 * 1024;
const STDERR_LIMIT: usize = 64 * 1024;

struct Capture {
    reader: JoinHandle<io::Result<Vec<u8>>>,
    exceeded: Arc<AtomicBool>,
    label: &'static str,
}

impl Capture {
    fn start(
        mut pipe: impl Read + Send + 'static,
        limit: usize,
        label: &'static str,
    ) -> io::Result<Self> {
        let exceeded = Arc::new(AtomicBool::new(false));
        let signal = exceeded.clone();
        let reader = thread::Builder::new()
            .name("sonic-output".into())
            .spawn(move || {
                let mut bytes = Vec::new();
                let mut buffer = [0; 8192];
                loop {
                    let count = match pipe.read(&mut buffer) {
                        Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                        result => result?,
                    };
                    if count == 0 {
                        return Ok(bytes);
                    }
                    let keep = count.min(limit - bytes.len());
                    bytes.extend_from_slice(&buffer[..keep]);
                    if keep < count {
                        signal.store(true, Ordering::Relaxed);
                    }
                    // Keep draining until the supervisor stops the child. Never
                    // block it on a full pipe or retain unbounded diagnostics.
                }
            })?;
        Ok(Self {
            reader,
            exceeded,
            label,
        })
    }

    fn finish(self) -> Result<Vec<u8>> {
        let bytes = self
            .reader
            .join()
            .map_err(|_| anyhow::anyhow!("Analyzer output reader panicked"))?
            .context("Could not read analyzer output")?;
        if self.exceeded.load(Ordering::Relaxed) {
            bail!(
                "Analyzer {} exceeded its {} limit",
                self.label,
                limit_text(self.label)
            );
        }
        Ok(bytes)
    }
}

fn limit_text(label: &str) -> &'static str {
    if label == "output" {
        "1 MiB"
    } else {
        "64 KiB"
    }
}

struct RunningChild(Child);

impl Drop for RunningChild {
    fn drop(&mut self) {
        // Also runs if reader startup or process polling fails.
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub(super) fn run(
    cmd: &mut Command,
    stop: &impl Fn() -> bool,
    timeout: Duration,
) -> Result<Output> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000 | 0x0000_4000);
    }
    let mut child = RunningChild(cmd.spawn().context("Could not start the audio analyzer")?);
    let stdout = Capture::start(
        child.0.stdout.take().context("Analyzer stdout missing")?,
        STDOUT_LIMIT,
        "output",
    )
        .context("Could not start analyzer stdout reader")?;
    let stderr = Capture::start(
        child.0.stderr.take().context("Analyzer stderr missing")?,
        STDERR_LIMIT,
        "diagnostics",
    )
        .context("Could not start analyzer stderr reader")?;
    let started = Instant::now();
    let status = loop {
        if stop() {
            break Err(super::track_error("Analysis interrupted"));
        }
        if started.elapsed() > timeout {
            break Err(super::track_error(
                "Analysis exceeded the three-minute per-track limit",
            ));
        }
        if let Some(stream) = [&stdout, &stderr]
            .into_iter()
            .find(|s| s.exceeded.load(Ordering::Relaxed))
        {
            break Err(anyhow::anyhow!(
                "Analyzer {} exceeded its {} limit",
                stream.label,
                limit_text(stream.label)
            ));
        }
        match child.0.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(e) => break Err(anyhow::Error::new(e).context("Could not wait for audio analyzer")),
        }
    };
    // Close the writer ends before joining readers, including on stop/timeout.
    drop(child);
    let stdout = stdout.finish();
    let stderr = stderr.finish();
    Ok(Output {
        status: status?,
        stdout: stdout?,
        stderr: stderr?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write, path::PathBuf};

    fn helper(mode: &str) -> Command {
        let mut cmd = Command::new(std::env::current_exe().unwrap());
        cmd.args([
            "--exact",
            "sonic::analyzer::tests::child_process",
            "--ignored",
            "--nocapture",
        ])
        .env("SONIC_TEST_CHILD", mode);
        cmd
    }

    // Runs only in a separate process, so environment/stdio changes cannot
    // affect other tests. The process supervisor must reap every child.
    #[test]
    #[ignore = "subprocess fixture"]
    fn child_process() {
        let mode = std::env::var("SONIC_TEST_CHILD").unwrap();
        match mode.as_str() {
            "streams" => {
                io::stderr().write_all(&vec![b'e'; 48 * 1024]).unwrap();
                io::stdout().write_all(&vec![b'o'; 48 * 1024]).unwrap();
            }
            "stdout-overflow" | "stderr-overflow" => {
                let mut output: Box<dyn Write> = if mode == "stdout-overflow" {
                    Box::new(io::stdout())
                } else {
                    Box::new(io::stderr())
                };
                loop {
                    if output.write_all(&[b'x'; 8192]).is_err() {
                        break;
                    }
                }
            }
            "file-error" | "crash" => {
                io::stderr().write_all(b"test analyzer failure").unwrap();
                std::process::exit(if mode == "file-error" { 2 } else { 1 });
            }
            "wait" => {
                if let Some(ready) = std::env::var_os("SONIC_TEST_READY") {
                    fs::write(ready, b"ready").unwrap();
                }
                loop {
                    thread::sleep(Duration::from_secs(1));
                }
            }
            "unusable-temp" => {
                // Prove temp creation actually fails in this process, then
                // exercise the production extraction path with a real MP3.
                assert!(tempfile::NamedTempFile::new().is_err());
                let path = PathBuf::from(std::env::var_os("SONIC_TEST_MP3").unwrap());
                let analysis = super::super::extract(&path, &|| false).unwrap();
                assert!(analysis.valid());
            }
            _ => panic!("Unknown test child mode"),
        }
        std::process::exit(0);
    }

    #[test]
    fn captures_both_streams_beyond_pipe_capacity_without_deadlock() {
        let output = run(&mut helper("streams"), &|| false, Duration::from_secs(10)).unwrap();
        assert!(output.status.success());
        assert!(output.stdout.ends_with(&vec![b'o'; 48 * 1024]));
        assert_eq!(output.stderr, vec![b'e'; 48 * 1024]);
    }

    #[test]
    fn excessive_stdout_or_stderr_stops_the_process_as_a_fatal_error() {
        for mode in ["stdout-overflow", "stderr-overflow"] {
            let error = run(&mut helper(mode), &|| false, Duration::from_secs(10)).unwrap_err();
            let limit = if mode == "stdout-overflow" {
                "1 MiB"
            } else {
                "64 KiB"
            };
            assert!(error.to_string().contains(limit), "{error:#}");
            assert!(!error.is::<super::super::TrackAnalysisError>());
        }
    }

    #[test]
    fn preserves_file_errors_and_unexpected_exit_status() {
        for (mode, code) in [("file-error", 2), ("crash", 1)] {
            let output = run(&mut helper(mode), &|| false, Duration::from_secs(10)).unwrap();
            assert_eq!(output.status.code(), Some(code));
            assert_eq!(output.stderr, b"test analyzer failure");
            let error = super::super::analyzer_failure(
                output.status.code(),
                &String::from_utf8_lossy(&output.stderr),
            );
            assert_eq!(error.is::<super::super::TrackAnalysisError>(), code == 2);
        }
    }

    #[test]
    fn cancellation_and_timeout_stop_and_reap_the_child() {
        let dir = tempfile::tempdir().unwrap();
        let ready = dir.path().join("ready");
        let mut cmd = helper("wait");
        cmd.env("SONIC_TEST_READY", &ready);
        let error = run(&mut cmd, &|| ready.exists(), Duration::from_secs(10)).unwrap_err();
        assert_eq!(error.to_string(), "Analysis interrupted");
        assert!(error.is::<super::super::TrackAnalysisError>());
        let error = run(&mut helper("wait"), &|| false, Duration::from_millis(100)).unwrap_err();
        assert!(error.to_string().contains("per-track limit"));
        assert!(error.is::<super::super::TrackAnalysisError>());
    }

    #[test]
    fn real_analysis_succeeds_without_a_usable_temp_directory() {
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("not-a-directory");
        fs::write(&blocked, b"keep").unwrap();
        let mp3 = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../Tools/sonic-analyzer/tests/fixtures/large-id3.mp3");
        let before = fs::read(&mp3).unwrap();
        let mut cmd = helper("unusable-temp");
        cmd.env("TMP", &blocked)
            .env("TEMP", &blocked)
            .env("TMPDIR", &blocked)
            .env("SONIC_TEST_MP3", &mp3);
        let output = run(&mut cmd, &|| false, Duration::from_secs(30)).unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(fs::read(mp3).unwrap(), before);
        assert_eq!(fs::read(blocked).unwrap(), b"keep");
    }
}
