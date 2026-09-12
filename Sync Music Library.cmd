@echo off
setlocal DisableDelayedExpansion
title Copy Music Library from JornComputer

rem Change these settings if your Mac uses a different share or account.
set "LIBRARY_SOURCE=\\jorncomputer.tail5ef358.ts.net\C$\Users\jtill\AppData\Roaming\com.local.musiclibrary\music-library.sqlite3"
set "LIBRARY_DESTINATION=%APPDATA%\com.local.musiclibrary\music-library.sqlite3"
set "LIBRARY_USER=MicrosoftAccount\jtillnes@yahoo.com"

echo Close Music Library and Aurora on both PCs before copying.
echo A dated backup of your local database will be kept.
echo If asked, enter the Microsoft account password once. Windows will remember it.
echo.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-library-from-main-pc.ps1" -SourcePath "%LIBRARY_SOURCE%" -DestinationPath "%LIBRARY_DESTINATION%" -UserName "%LIBRARY_USER%" %*
set "SYNC_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%SYNC_EXIT_CODE%"=="0" (
    echo Sync failed. Read the error above.
) else (
    echo Database sync finished.
)
pause
exit /b %SYNC_EXIT_CODE%
