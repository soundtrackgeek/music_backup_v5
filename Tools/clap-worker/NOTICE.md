# Music Sound Search Worker

This standalone executable is licensed GPL-3.0-only. See LICENSE (shipped with
the audio analyzer). It decodes local MP3 files with Symphonia 0.6.1 and runs
the LAION CLAP model `larger_clap_music_and_speech` to place music and text
descriptions in one embedding space. No audio or search text is uploaded; the
application invokes it as a child process.

Model: LAION CLAP `laion/larger_clap_music_and_speech`, Apache License 2.0,
copyright LAION. The ONNX export `Xenova/larger_clap_music_and_speech`
(revision e9fd5ac1dbf3280936a7fc3ec8a020453ff184db) is downloaded from Hugging
Face on first use and verified by SHA-256; it is not part of the installer.

Bundled runtime: ONNX Runtime 1.24, MIT License, copyright Microsoft
Corporation, statically linked through the `ort` crate (MIT OR Apache-2.0).
On Windows, DirectML.dll (the Microsoft DirectML redistributable, copyright
Microsoft Corporation, redistributed under its license terms) is shipped beside
the worker for GPU inference; without a usable GPU the worker runs on the CPU.

Corresponding source, the locked dependency manifest, and the build script are
provided in this repository under Tools/clap-worker and
scripts/build-sonic-analyzer.mjs. Build with cargo build --locked --release
--manifest-path Tools/clap-worker/Cargo.toml.

Copyright 2026 Music Library contributors. This software comes without warranty.
