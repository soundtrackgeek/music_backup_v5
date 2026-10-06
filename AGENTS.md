## Development Workflow

**IMPORTANT**: After any code change, bug fix, or feature addition/removal, you MUST complete all of these steps:

1. **Update README.md** if the change affects:
   - Usage examples or commands
   - Installation instructions
   - Configuration options
   - Available features

2. **Update CHANGELOG.md**:
   - Add new version number following semantic versioning (MAJOR.MINOR.PATCH)
   - Add entry under appropriate category (Added, Changed, Fixed, Removed)
   - Include date in format YYYY-MM-DD

3. **Make sure the push builds and publishes a release**:
   - The Release workflow (`.github/workflows/release.yml`) builds and publishes only when a push changes the app version compared with the previous push. A push with an unchanged version runs only `detect_version`, and the build and publish jobs are skipped.
   - Bump the version in every place together, to the same number as the new CHANGELOG.md entry: `package.json`, `package-lock.json` (top-level and `packages[""]`), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `music-library` entry in `src-tauri/Cargo.lock`.
   - Before pushing, run `npm run check` (the same command the release build runs: version check, lint, all test suites, security check, build, and Rust tests) and fix any failure locally. A failing check blocks the release. At minimum run `npm run check:version`, `npm run lint`, and `npm run test:run` when the full check is too slow.
   - If a release run fails or is skipped because the version did not change, the fix push needs a new patch version, with its own CHANGELOG.md entry, so the next push publishes. Re-pushing the same version never publishes.

4. **Commit and push changes**:
   - Use `git add` to stage all modified files (README.md, CHANGELOG.md, version files, and code files)
   - Create descriptive commit message following existing style
   - Push to remote repository with `git push`
   - The task ends after a successful push. Do not monitor or wait for GitHub Actions, release builds, or release publication unless the user explicitly asks you to do so.
   - The user will report any CI or release failure that needs follow-up.

5. **Clean Rust build artifacts**:
   - Before finishing any repo work, run `cargo clean` from the `src-tauri` directory
   - This keeps Tauri/Rust build artifacts from growing too large between work sessions
