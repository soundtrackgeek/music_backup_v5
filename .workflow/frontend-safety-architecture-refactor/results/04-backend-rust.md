# Backend and Rust result

- Split direct Tauri runtime access, web-preview fixtures/mock state, and shared normalization out of backend.ts.
- Reduced backend.ts from 4,704 to about 2,088 lines; web-preview behavior now has an explicit module boundary.
- Extracted Rust settings and backup/restore implementation plus migration/version helpers under `src-tauri/src/db/`.
- Added schema 20 migration and sync validation for a portable unconfigured overlay-sync default.
- Preserved Tauri command names and payload contracts via module re-exports.
