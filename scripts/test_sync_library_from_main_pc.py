"""Windows integration checks using disposable SQLite databases, never app data."""

import base64
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("sync-library-from-main-pc.ps1")


@unittest.skipUnless(os.name == "nt", "Windows PowerShell script")
class DatabaseCopyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="music-library-sync-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "main pc" / "music-library.sqlite3"
        self.destination = self.root / "local pc" / "music-library.sqlite3"
        for path, value in [(self.source, "main"), (self.destination, "old local")]:
            path.parent.mkdir()
            with sqlite3.connect(path) as database:
                database.execute("CREATE TABLE marker (value TEXT)")
                database.execute("INSERT INTO marker VALUES (?)", (value,))
            database.close()
        self.source_bytes = self.source.read_bytes()
        self.local_bytes = self.destination.read_bytes()

    def run_copy(self, *extra, source=None, success=True):
        result = subprocess.run(
            [
                "powershell.exe", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT),
                "-SourcePath", str(source or self.source),
                "-DestinationPath", str(self.destination), *extra,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(list(self.destination.parent.glob("*-download-*")), [])
        return result

    def assert_originals_unchanged(self):
        self.assertEqual(self.source.read_bytes(), self.source_bytes)
        self.assertEqual(self.destination.read_bytes(), self.local_bytes)
        self.assertEqual(list(self.destination.parent.glob("*.before-sync-*.sqlite3")), [])

    def test_replaces_database_and_preserves_exact_backup(self):
        for suffix in ["-wal", "-journal", "-shm"]:
            Path(str(self.destination) + suffix).write_bytes(b"stale" if suffix == "-shm" else b"")
        Path(str(self.source) + "-wal").write_bytes(b"")
        self.run_copy()
        self.assertEqual(self.source.read_bytes(), self.source_bytes)
        self.assertTrue(Path(str(self.source) + "-wal").exists())
        self.assertEqual(self.destination.read_bytes(), self.source_bytes)
        backups = list(self.destination.parent.glob("*.before-sync-*.sqlite3"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), self.local_bytes)
        for suffix in ["-wal", "-journal", "-shm"]:
            self.assertFalse(Path(str(self.destination) + suffix).exists())
        with sqlite3.connect(self.destination) as database:
            self.assertEqual(database.execute("PRAGMA quick_check").fetchone(), ("ok",))
            self.assertEqual(database.execute("SELECT value FROM marker").fetchone(), ("main",))
        database.close()

    def test_checkpoints_local_wal_and_preserves_data_in_backup(self):
        subprocess.run(
            [
                "python", "-c",
                f"""
import sqlite3, os
c = sqlite3.connect(r"{self.destination}")
c.execute("PRAGMA journal_mode = WAL")
c.execute("INSERT INTO marker VALUES ('wal-local')")
c.commit()
os._exit(0)
""",
            ],
            check=True,
        )
        wal_path = Path(str(self.destination) + "-wal")
        self.assertTrue(wal_path.exists())
        self.assertGreater(wal_path.stat().st_size, 0)

        self.run_copy()

        self.assertEqual(self.destination.read_bytes(), self.source_bytes)
        self.assertFalse(wal_path.exists())
        backups = list(self.destination.parent.glob("*.before-sync-*.sqlite3"))
        self.assertEqual(len(backups), 1)
        with sqlite3.connect(backups[0]) as backup_db:
            values = [row[0] for row in backup_db.execute("SELECT value FROM marker").fetchall()]
            self.assertIn("wal-local", values)
        backup_db.close()

    def test_first_copy_creates_directory_and_database(self):
        self.destination.unlink()
        self.destination.parent.rmdir()
        self.run_copy()
        self.assertEqual(self.destination.read_bytes(), self.source_bytes)
        self.assertEqual(list(self.destination.parent.glob("*.before-sync-*.sqlite3")), [])

    def test_whatif_does_not_change_files(self):
        self.run_copy("-WhatIf")
        self.assert_originals_unchanged()

    def test_missing_source_preserves_local_database(self):
        self.run_copy(source=self.root / "missing.sqlite3", success=False)
        self.assert_originals_unchanged()

    def test_invalid_source_preserves_local_database(self):
        invalid = self.root / "invalid.sqlite3"
        invalid.write_bytes(b"not a SQLite database" * 100)
        self.run_copy(source=invalid, success=False)
        self.assert_originals_unchanged()

    def test_same_source_and_destination_is_rejected(self):
        self.run_copy(source=self.destination, success=False)
        self.assert_originals_unchanged()

    def test_open_source_is_rejected(self):
        database = sqlite3.connect(self.source)
        try:
            self.run_copy(success=False)
        finally:
            database.close()
        self.assert_originals_unchanged()

    def test_open_destination_is_rejected(self):
        database = sqlite3.connect(self.destination)
        try:
            self.run_copy(success=False)
        finally:
            database.close()
        self.assert_originals_unchanged()

    def test_pending_journals_are_preserved_and_rejected(self):
        for database in [self.source, self.destination]:
            for suffix in ["-wal", "-journal"]:
                with self.subTest(database=database, suffix=suffix):
                    journal = Path(str(database) + suffix)
                    journal.write_bytes(b"pending SQLite changes")
                    try:
                        self.run_copy(success=False)
                        self.assertEqual(journal.read_bytes(), b"pending SQLite changes")
                        self.assert_originals_unchanged()
                    finally:
                        journal.unlink()


@unittest.skipUnless(os.name == "nt", "Windows PowerShell script")
class AuthenticationTests(unittest.TestCase):
    def run_powershell(self, body):
        # Load helper functions without touching a share or the real database.
        setup = r"""
            $ErrorActionPreference = 'Stop'
            . $env:MUSIC_LIBRARY_SYNC_SCRIPT -WhatIf
            $script:realConnectSourceShare = ${function:Connect-SourceShare}
            $script:opens = 0
            $script:signIns = 0
            $script:connections = 0
            $script:connectionReady = $false
            function Connect-SavedSmbShare {
                $script:connections++
                $script:connectionReady = $true
                return [pscustomobject]@{Success = $true; Message = 'Connected'}
            }
            function Connect-SourceShare {
                param($ShareRoot, $Account)
                if ($ShareRoot -cne '\\test-server\Library' -or $Account -cne 'MAIN\reader') {
                    throw 'Wrong share root or account passed to SMB sign-in'
                }
                $script:signIns++
            }
        """
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand",
             base64.b64encode((setup + body + "\nexit 0\n").encode("utf-16-le")).decode("ascii")],
            env={**os.environ, "MUSIC_LIBRARY_SYNC_SCRIPT": str(SCRIPT)},
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_authentication_failure_prompts_once_then_retries(self):
        self.run_powershell(r"""
            function Open-DatabaseFile {
                $script:opens++
                if ($script:opens -eq 1) {
                    throw [IO.IOException]::new('wrapped', [ComponentModel.Win32Exception]::new(1326))
                }
                return 'opened'
            }
            $result = Open-SourceDatabase '\\test-server\Library\folder\music-library.sqlite3' 'MAIN\reader'
            if ($result -ne 'opened' -or $script:opens -ne 2 -or $script:signIns -ne 1) {
                throw 'Authentication did not retry once after successful sign-in'
            }
        """)

    def test_rejected_retry_does_not_prompt_again(self):
        self.run_powershell(r"""
            function Open-DatabaseFile {
                $script:opens++
                throw [ComponentModel.Win32Exception]::new(1326)
            }
            $failed = $false
            try { Open-SourceDatabase '\\test-server\Library\db' 'MAIN\reader' }
            catch { $failed = $true }
            if (-not $failed -or $script:opens -ne 2 -or $script:signIns -ne 1) {
                throw 'Rejected credentials caused an unexpected retry'
            }
        """)

    def test_unattended_authentication_and_non_auth_errors_never_prompt(self):
        self.run_powershell(r"""
            function Open-DatabaseFile { throw [ComponentModel.Win32Exception]::new($script:code) }
            foreach ($script:code in @(1326, 86, 5)) {
                $failed = $false
                try { Open-SourceDatabase '\\test-server\Library\db' 'MAIN\reader' -NoPrompt }
                catch { $failed = $true }
                if (-not $failed) { throw 'Unattended authentication did not stop' }
            }
            foreach ($script:code in @(2, 3, 32, 33, 53, 67, 1219, 1909)) {
                $failed = $false
                try { Open-SourceDatabase '\\test-server\Library\db' 'MAIN\reader' }
                catch { $failed = $true }
                if (-not $failed) { throw 'Non-authentication error did not stop' }
            }
            $script:code = 5
            try { Open-SourceDatabase 'C:\local.sqlite3' 'MAIN\reader' } catch {}
            if ($script:signIns -ne 0) { throw 'Unexpected SMB password prompt' }
        """)

    def test_signin_failure_stops_before_retry(self):
        self.run_powershell(r"""
            function Open-DatabaseFile {
                $script:opens++
                throw [ComponentModel.Win32Exception]::new(1326)
            }
            function Connect-SourceShare { $script:signIns++; throw 'Sign-in failed or cancelled' }
            $failed = $false
            try { Open-SourceDatabase '\\test-server\Library\db' 'MAIN\reader' }
            catch { $failed = $true }
            if (-not $failed -or $script:opens -ne 1 -or $script:signIns -ne 1) {
                throw 'Failed sign-in still attempted to open the source'
            }
        """)

    def test_existing_authentication_needs_no_prompt(self):
        self.run_powershell(r"""
            function Open-DatabaseFile { return 'opened' }
            $result = Open-SourceDatabase '\\test-server\Library\db' 'MAIN\reader'
            if ($result -ne 'opened' -or $script:signIns -ne 0) {
                throw 'Existing authentication was not reused'
            }
        """)

    def test_stores_server_credential_with_private_prompt_and_reuses_it(self):
        self.run_powershell(r"""
            Set-Item Function:Connect-SourceShare $script:realConnectSourceShare
            $script:storedCredential = $false
            function Start-Process {
                param($FilePath, $ArgumentList, [switch]$NoNewWindow, [switch]$Wait, [switch]$PassThru)
                if ($FilePath -ne "$env:SystemRoot\System32\cmdkey.exe" -or
                    $ArgumentList.Count -ne 3 -or
                    $ArgumentList[0] -cne '/add:"test-server"' -or
                    $ArgumentList[1] -cne '/user:"MicrosoftAccount\jtillnes@yahoo.com"' -or
                    $ArgumentList[2] -cne '/pass' -or
                    -not $NoNewWindow -or -not $Wait -or -not $PassThru) {
                    throw 'Credential storage must target only the server and prompt without an inline password'
                }
                $script:signIns++
                $script:storedCredential = $true
                return [pscustomobject]@{ExitCode = 0}
            }
            function Test-SavedSmbCredential { return $script:storedCredential }
            function Open-DatabaseFile {
                if (-not $script:storedCredential -or -not $script:connectionReady) {
                    throw [ComponentModel.Win32Exception]::new(1326)
                }
                return 'opened'
            }
            $first = Open-SourceDatabase '\\test-server\Library\db' $UserName
            $script:connectionReady = $false
            $second = Open-SourceDatabase '\\test-server\Library\db' $UserName -NoPrompt
            if ($first -ne 'opened' -or $second -ne 'opened' -or $script:signIns -ne 1 -or $script:connections -ne 2) {
                throw 'SMB must connect after saving and again on later runs without a second prompt'
            }
        """)

    def test_saved_credential_does_not_imply_successful_network_login(self):
        self.run_powershell(r"""
            Set-Item Function:Connect-SourceShare $script:realConnectSourceShare
            function Start-Process { return [pscustomobject]@{ExitCode = 0} }
            function Test-SavedSmbCredential { return $true }
            function Connect-SavedSmbShare {
                return [pscustomobject]@{Success = $false; Message = 'System error 1326'}
            }
            $failed = $false
            try { Connect-SourceShare '\\test-server\Library' 'MAIN\reader' }
            catch {
                if ($_.Exception.Message -notlike '*could not sign into*System error 1326*') { throw }
                $failed = $true
            }
            if (-not $failed) { throw 'Saved credential was mistaken for successful network authentication' }
        """)

    def test_share_permission_failure_after_connect_does_not_prompt_again(self):
        self.run_powershell(r"""
            function Test-SavedSmbCredential { return $true }
            function Open-DatabaseFile { throw [ComponentModel.Win32Exception]::new(5) }
            $failed = $false
            try { Open-SourceDatabase '\\test-server\Library\db' 'MAIN\reader' }
            catch { $failed = $true }
            if (-not $failed -or $script:connections -ne 1 -or $script:signIns -ne 0) {
                throw 'A file permission failure after successful login must not request another password'
            }
        """)

    def test_zero_exit_code_without_stored_credential_is_rejected(self):
        self.run_powershell(r"""
            Set-Item Function:Connect-SourceShare $script:realConnectSourceShare
            function Start-Process { return [pscustomobject]@{ExitCode = 0} }
            function Test-SavedSmbCredential { return $false }
            $failed = $false
            try { Connect-SourceShare '\\test-server\Library' 'MAIN\reader' }
            catch {
                if ($_.Exception.Message -notlike 'Windows could not save*') { throw }
                $failed = $true
            }
            if (-not $failed) { throw 'Zero exit code incorrectly reported credential storage success' }
        """)

    def test_real_cmdkey_stores_and_finds_disposable_credential(self):
        self.run_powershell(r"""
            Set-Item Function:Connect-SourceShare $script:realConnectSourceShare
            $script:testServer = 'music-library-test-' + [Guid]::NewGuid().ToString('N') + '.invalid'
            $testAccount = 'MicrosoftAccount\codex-sync-test@example.invalid'
            function Start-Process {
                param($FilePath, $ArgumentList, [switch]$NoNewWindow, [switch]$Wait, [switch]$PassThru)
                if ($FilePath -ne "$env:SystemRoot\System32\cmdkey.exe" -or
                    $ArgumentList[-1] -ne '/pass' -or -not $NoNewWindow -or -not $Wait -or -not $PassThru) {
                    throw 'Production must run cmdkey with a private password prompt'
                }
                # Use only a synthetic password for this disposable, non-networked
                # credential. Use the same raw argument string as Start-Process,
                # but retain the native process handle: Start-Process -Wait -PassThru
                # can race with a cmdkey process that exits immediately on CI.
                $ArgumentList[-1] = '/pass:not-a-real-password'
                $startInfo = [Diagnostics.ProcessStartInfo]::new()
                $startInfo.FileName = $FilePath
                $startInfo.Arguments = $ArgumentList -join ' '
                $startInfo.UseShellExecute = $false
                $startInfo.CreateNoWindow = $true
                $process = [Diagnostics.Process]::Start($startInfo)
                try {
                    if (-not $process.WaitForExit(10000)) {
                        $process.Kill()
                        throw 'Synthetic cmdkey test timed out'
                    }
                    return [pscustomobject]@{ExitCode = $process.ExitCode}
                }
                finally { $process.Dispose() }
            }
            try {
                if (Test-SavedSmbCredential $script:testServer $testAccount) { throw 'Test target already exists' }
                Connect-SourceShare "\\$script:testServer\Library" $testAccount
                if (-not (Test-SavedSmbCredential $script:testServer $testAccount)) { throw 'Native credential was not saved' }
                if (Test-SavedSmbCredential $script:testServer 'wrong-account') { throw 'Accepted another account' }
            }
            finally {
                & "$env:SystemRoot\System32\cmdkey.exe" "/delete:$script:testServer" | Out-Null
            }
            if (Test-SavedSmbCredential $script:testServer $testAccount) { throw 'Disposable credential was not removed' }
        """)


if __name__ == "__main__":
    unittest.main()
