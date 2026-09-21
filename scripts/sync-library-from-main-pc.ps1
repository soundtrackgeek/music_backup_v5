#requires -Version 5.1
<#
.SYNOPSIS
Copies a closed Music Library database from the main PC over SMB.
.DESCRIPTION
Close Music Library and Aurora on both PCs first. If SMB sign-in is needed,
Windows prompts once and saves the password in Windows Credential Manager for
future runs. The source is read-only; the previous local database
is kept in a dated backup beside the destination. Requires no SQLite tools.
.EXAMPLE
.\scripts\sync-library-from-main-pc.ps1
.EXAMPLE
.\scripts\sync-library-from-main-pc.ps1 -SourcePath '\\100.105.78.85\SHARE\music-library.sqlite3'
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateNotNullOrEmpty()]
    [string] $SourcePath = '\\jorncomputer.tail5ef358.ts.net\C$\Users\jtill\AppData\Roaming\com.local.musiclibrary\music-library.sqlite3',

    [ValidateNotNullOrEmpty()]
    [string] $DestinationPath = (Join-Path $env:APPDATA 'com.local.musiclibrary\music-library.sqlite3'),

    [ValidateNotNullOrEmpty()]
    [string] $UserName = 'MicrosoftAccount\jtillnes@yahoo.com',

    [switch] $NoCredentialPrompt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-WindowsErrorCode {
    param([Exception] $Exception)
    $cause = $Exception.GetBaseException()
    if ($cause -is [ComponentModel.Win32Exception]) { return $cause.NativeErrorCode }
    return ($cause.HResult -band 0xFFFF)
}

function Open-DatabaseFile {
    param([string] $Path, [System.IO.FileAccess] $Access, [System.IO.FileShare] $Share)
    try {
        return [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, $Access, $Share)
    }
    catch {
        $cause = $_.Exception.GetBaseException()
        $code = Get-WindowsErrorCode $cause
        $detail = switch ($code) {
            { $_ -in 86, 1326 } { 'SMB sign-in failed. Use the main PC account password and the same account used by the Mac SMB connection; set -UserName if needed.'; break }
            5 { 'Access denied. Check account, share, and file permissions. C$ requires administrative-share access; use -SourcePath for an existing share that your account can read.'; break }
            { $_ -in 32, 33 } { 'Database is in use. Close Music Library and Aurora on both PCs, including tray apps and companion processes.'; break }
            { $_ -in 2, 3 } { 'Database path was not found. Check the share and the database path supplied with -SourcePath.'; break }
            { $_ -in 53, 67 } { 'SMB server or share was not found. Check Tailscale connectivity and the share name in -SourcePath.'; break }
            1219 { 'Windows already has an SMB connection to this server using another account. Inspect net use and resolve that connection, or use the same account. No connections were disconnected by this script.'; break }
            default { $cause.Message }
        }
        throw [System.IO.IOException]::new("Cannot open '$Path'. $detail (Windows error $code)", $cause)
    }
}

function Checkpoint-DatabaseFile {
    param([string] $DatabasePath)

    $walPath = $DatabasePath + '-wal'
    if (-not (Test-Path -LiteralPath $walPath)) { return }

    # Only attempt checkpoint if the DB is a valid SQLite db and WAL has valid header.
    $dbHeader = New-Object byte[] 16
    try {
        $dbStream = [System.IO.File]::Open($DatabasePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $read = $dbStream.Read($dbHeader, 0, 16)
        $dbStream.Dispose()
        if ($read -ne 16 -or [Text.Encoding]::ASCII.GetString($dbHeader) -cne "SQLite format 3`0") {
            return
        }
    }
    catch {
        return
    }

    $walHeader = New-Object byte[] 4
    try {
        $walStream = [System.IO.File]::Open($walPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $read = $walStream.Read($walHeader, 0, 4)
        $walStream.Dispose()
        if ($read -ne 4 -or $walHeader[0] -ne 0x37 -or $walHeader[1] -ne 0x7f -or $walHeader[2] -ne 0x06 -or ($walHeader[3] -notin 0x82, 0x83)) {
            return
        }
    }
    catch {
        return
    }

    # Use Windows built-in winsqlite3.dll to checkpoint and truncate the WAL safely.
    $winsqlite = Join-Path $env:SystemRoot 'System32\winsqlite3.dll'
    if (Test-Path -LiteralPath $winsqlite) {
        if (-not ('WinSqlite' -as [type])) {
            $definition = @"
using System;
using System.Runtime.InteropServices;

public class WinSqlite {
    [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_open16", CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    public static extern int Open16(string filename, out IntPtr db);

    [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_exec", CallingConvention = CallingConvention.Cdecl)]
    public static extern int Exec(IntPtr db, string sql, IntPtr callback, IntPtr arg, out IntPtr errmsg);

    [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_close_v2", CallingConvention = CallingConvention.Cdecl)]
    public static extern int Close(IntPtr db);
}
"@
            try {
                Add-Type -TypeDefinition $definition
            }
            catch {
                return
            }
        }

        $db = [IntPtr]::Zero
        try {
            $openRes = [WinSqlite]::Open16($DatabasePath, [ref]$db)
            if ($openRes -eq 0 -and $db -ne [IntPtr]::Zero) {
                $errmsg = [IntPtr]::Zero
                $null = [WinSqlite]::Exec($db, 'PRAGMA busy_timeout = 5000; PRAGMA wal_checkpoint(TRUNCATE);', [IntPtr]::Zero, [IntPtr]::Zero, [ref]$errmsg)
                $null = [WinSqlite]::Close($db)
            }
        }
        catch {}
    }
}

function Test-SavedSmbCredential {
    param([string] $ServerName, [string] $Account)
    # Query only this server's entry. cmdkey lists account metadata, not passwords.
    # Its exit code alone is unreliable: even invalid syntax can return zero.
    $listing = (& "$env:SystemRoot\System32\cmdkey.exe" "/list:$ServerName") -join "`n"
    $accountPattern = '(?m)^\s*[^:\r\n]+:\s*' + [regex]::Escape($Account) + '\s*$'
    return ($LASTEXITCODE -eq 0 -and $listing -match $accountPattern)
}

function Connect-SavedSmbShare {
    param([string] $ShareRoot)
    # Establish an SMB session explicitly. Saving with cmdkey alone does not
    # replace the identity used by an earlier failed FileStream connection.
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "$env:SystemRoot\System32\net.exe"
    $startInfo.Arguments = 'use "{0}"' -f $ShareRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $connectionProcess = [Diagnostics.Process]::Start($startInfo)
    try {
        # This step may use saved credentials, but must never ask for another
        # password or expose one in process arguments. cmdkey handles prompting.
        $connectionProcess.StandardInput.Close()
        $standardOutput = $connectionProcess.StandardOutput.ReadToEndAsync()
        $standardError = $connectionProcess.StandardError.ReadToEndAsync()
        if (-not $connectionProcess.WaitForExit(15000)) {
            $connectionProcess.Kill()
            $connectionProcess.WaitForExit()
            return [pscustomobject]@{Success = $false; Message = 'SMB connection timed out. Check that Tailscale and the main PC are online.'}
        }
        return [pscustomobject]@{
            Success = ($connectionProcess.ExitCode -eq 0)
            Message = ($standardOutput.Result + $standardError.Result).Trim()
        }
    }
    finally { $connectionProcess.Dispose() }
}

function Connect-SourceShare {
    param([string] $ShareRoot, [string] $Account)
    if ($ShareRoot -notmatch '^\\\\([^\\]+)\\[^\\]+$') {
        throw 'SMB sign-in requires a UNC share root such as \\server\share.'
    }
    $serverName = $Matches[1]
    Write-Host "SMB sign-in required for $ShareRoot as $Account."
    Write-Host 'Enter the account password once. Windows Credential Manager will remember it for future runs, including after restarting Windows.'
    # /pass without a value prompts privately. The password never enters this
    # script or its process arguments. /add saves an SMB credential for this server.
    # Inherit the console so the password prompt is visible immediately and no
    # native output is accidentally returned as part of the database file handle.
    # cmdkey parses the raw command line: quote the values, never the /switch.
    $arguments = @(('/add:"{0}"' -f $serverName), ('/user:"{0}"' -f $Account), '/pass')
    $signIn = Start-Process -FilePath "$env:SystemRoot\System32\cmdkey.exe" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
    if ($signIn.ExitCode -ne 0 -or -not (Test-SavedSmbCredential $serverName $Account)) {
        throw 'Windows could not save the SMB credential. Check the Windows message above. The local database has not been changed.'
    }
    Write-Host "Windows has a credential entry for $Account on $serverName. Connecting to the SMB share..."
    $connection = Connect-SavedSmbShare $ShareRoot
    if (-not $connection.Success) {
        throw "Windows saved the credential but could not sign into '$ShareRoot'. $($connection.Message) The local database has not been changed."
    }
}

function Open-SourceDatabase {
    param([string] $Path, [string] $Account, [switch] $NoPrompt)
    $shareRoot = $null
    $connected = $false
    if ($Path -match '^\\\\([^\\]+)\\[^\\]+') {
        $shareRoot = $Matches[0]
        $serverName = $Matches[1]
        if (Test-SavedSmbCredential $serverName $Account) {
            Write-Host "Connecting to $shareRoot with the saved Windows credential..."
            $connection = Connect-SavedSmbShare $shareRoot
            $connected = $connection.Success
        }
    }
    try {
        return Open-DatabaseFile $Path Read Read
    }
    catch {
        $code = Get-WindowsErrorCode $_.Exception
        if ($NoPrompt -or $connected -or $code -notin 5, 86, 1326 -or -not $shareRoot) {
            throw
        }
        Connect-SourceShare $shareRoot $Account
        # Only one sign-in attempt. A second failure retains its precise diagnosis.
        return Open-DatabaseFile $Path Read Read
    }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Run this script on Windows.'
}
$SourcePath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourcePath)
$DestinationPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationPath)
if ($SourcePath.Equals($DestinationPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Source and destination must be different files.'
}
if ($DestinationPath.StartsWith('\\')) {
    throw 'The destination must be a local file, not an SMB share.'
}
if ($env:COMPUTERNAME -ieq 'Jorncomputer') {
    throw 'Run this script on the receiving PC, not JornComputer (the source of truth).'
}
if (-not $PSCmdlet.ShouldProcess($DestinationPath, "Copy database from $SourcePath and keep a backup")) {
    return
}

$handles = [System.Collections.Generic.List[System.IO.FileStream]]::new()
$temporaryPath = $null
$output = $null
$backupPath = $null
try {
    # FileShare.Read denies existing and new write handles throughout the copy.
    # SQLite must have closed/checkpointed the source before a raw file copy.
    $source = Open-SourceDatabase $SourcePath $UserName -NoPrompt:$NoCredentialPrompt
    $handles.Add($source)
    foreach ($suffix in @('-wal', '-journal')) {
        $sidecarPath = $SourcePath + $suffix
        if (Test-Path -LiteralPath $sidecarPath) {
            $sidecar = Open-DatabaseFile $sidecarPath Read Read
            $handles.Add($sidecar)
            if ($sidecar.Length -ne 0) {
                throw "Source has pending SQLite journal data: '$sidecarPath'. Open and cleanly exit Music Library on the main PC, then retry. Do not delete the journal."
            }
        }
    }
    $header = New-Object byte[] 16
    if ($source.Length -lt 100 -or $source.Read($header, 0, 16) -ne 16 -or
        [Text.Encoding]::ASCII.GetString($header) -cne "SQLite format 3`0") {
        throw "Source is not a SQLite database: '$SourcePath'."
    }
    $source.Position = 0

    $directory = [System.IO.Path]::GetDirectoryName($DestinationPath)
    $null = [System.IO.Directory]::CreateDirectory($directory)
    $destinationExists = Test-Path -LiteralPath $DestinationPath
    if ($destinationExists) {
        Checkpoint-DatabaseFile $DestinationPath
        # Deny readers/writers but allow the final atomic replacement while locked.
        $destination = Open-DatabaseFile $DestinationPath ReadWrite Delete
        $handles.Add($destination)
    }
    $localSidecars = @()
    foreach ($suffix in @('-wal', '-journal', '-shm')) {
        $sidecarPath = $DestinationPath + $suffix
        if (Test-Path -LiteralPath $sidecarPath) {
            $sidecar = Open-DatabaseFile $sidecarPath ReadWrite Delete
            $handles.Add($sidecar)
            if ($suffix -ne '-shm' -and $sidecar.Length -ne 0) {
                throw "Local database has pending SQLite journal data: '$sidecarPath'. Open and cleanly exit Music Library locally, then retry. Do not delete the journal."
            }
            $localSidecars += $sidecarPath
        }
    }

    $temporaryPath = $DestinationPath + '-download-' + [Guid]::NewGuid().ToString('N')
    $output = [System.IO.File]::Open($temporaryPath, 'CreateNew', 'Write', 'None')
    $buffer = New-Object byte[] (1MB)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $lastProgress = -1000
    $copied = [long] 0
    Write-Host "Copying $SourcePath"
    Write-Host ('Database size: {0:N2} GiB' -f ($source.Length / 1GB))
    while (($count = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $output.Write($buffer, 0, $count)
        $copied += $count
        if ($timer.ElapsedMilliseconds - $lastProgress -ge 500) {
            Write-Progress -Activity 'Copying Music Library database' -Status ('{0:N2} / {1:N2} GiB' -f ($copied / 1GB), ($source.Length / 1GB)) -PercentComplete ([Math]::Min(100, 100.0 * $copied / $source.Length))
            $lastProgress = $timer.ElapsedMilliseconds
        }
    }
    $output.Flush($true)
    if ($copied -ne $source.Length -or $output.Length -ne $source.Length) {
        throw 'Incomplete database download. The local database has not been replaced.'
    }
    $output.Dispose()
    $output = $null

    # Only stale, locked sidecars are removed. Pending WAL/journal data was rejected.
    foreach ($sidecarPath in $localSidecars) {
        [System.IO.File]::Delete($sidecarPath)
    }
    # Release deleted sidecars before publishing the new DB; keep the DB locked.
    foreach ($handle in $handles) {
        if ($localSidecars -contains $handle.Name) { $handle.Dispose() }
    }
    if ($destinationExists) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
        $backupName = [System.IO.Path]::GetFileNameWithoutExtension($DestinationPath) + '.before-sync-' + $stamp + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '.sqlite3'
        $backupPath = Join-Path $directory $backupName
        [System.IO.File]::Replace($temporaryPath, $DestinationPath, $backupPath)
    }
    else {
        # Move fails safely if another process created the destination meanwhile.
        [System.IO.File]::Move($temporaryPath, $DestinationPath)
    }
    $temporaryPath = $null
    Write-Host "Updated: $DestinationPath"
    if ($backupPath) { Write-Host "Previous database: $backupPath" }
}
finally {
    if ($output) { $output.Dispose() }
    foreach ($handle in $handles) { $handle.Dispose() }
    if ($temporaryPath -and [System.IO.File]::Exists($temporaryPath)) {
        [System.IO.File]::Delete($temporaryPath)
    }
    Write-Progress -Activity 'Copying Music Library database' -Completed
}
