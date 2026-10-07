# Music Sonic Analyzer

This standalone executable is licensed GPL-3.0-only, including its bliss-audio
dependency. See LICENSE. It uses Symphonia 0.6.1 to decode local MP3 files and
Bliss 0.13.0 feature version 2. No audio is uploaded. The application invokes it
as a child process; the applications do not link bliss-audio.

Corresponding source, the locked dependency manifest, and the build script are
provided in this repository under Tools/sonic-analyzer and
scripts/build-sonic-analyzer.mjs. Build with cargo build --locked --release
--manifest-path Tools/sonic-analyzer/Cargo.toml. GPL dependency sources are
available from crates.io at the exact versions in Cargo.lock.

Release source archives and Git tags are available at
https://github.com/soundtrackgeek/music_backup_v5/releases . Use the source tag
matching the installed Music Library version. This includes the build script,
analyzer sources and exact lockfile used to build its packaged binary.

Copyright 2026 Music Library contributors; bliss-audio copyright
Polochon-street and contributors. This software comes without warranty.
