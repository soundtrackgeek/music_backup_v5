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

3. **Commit and push changes**:
   - Use `git add` to stage all modified files (README.md, CHANGELOG.md, and code files)
   - Create descriptive commit message following existing style
   - Push to remote repository with `git push`
   - The task ends after a successful push. Do not monitor or wait for GitHub Actions, release builds, or release publication unless the user explicitly asks you to do so.
   - The user will report any CI or release failure that needs follow-up.

4. **Clean Rust build artifacts**:
   - Before finishing any repo work, run `cargo clean` from the `src-tauri` directory
   - This keeps Tauri/Rust build artifacts from growing too large between work sessions
