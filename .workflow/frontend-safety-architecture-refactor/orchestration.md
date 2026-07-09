# Orchestration: Frontend safety architecture refactor

## Execution Rules

- Keep the original objective intact.
- Ask for approval before risky, expensive, external, or destructive actions.
- Keep immediate blocking work local.
- Delegate only bounded, disjoint, materially useful packets.
- Integrate packet results before final verification.

## Branching Rules

- If current behavior is ambiguous, treat existing UI markup, command exports, Rust tests, and payload types as authoritative in that order.
- If an extraction requires broad state redesign, stop at a typed prop boundary and document the next slice instead of adding global state.
- If tests expose a real behavior mismatch, preserve current behavior unless the user-requested navigation/default-path fixes explicitly cover it.
- Run narrow tests after each extraction; only advance to release metadata after code checks pass.
- Do not commit until the full verification matrix passes; do not push until the commit and final status audit are clean.

## Packet Prompts

Each packet must stay within its named file/domain scope, avoid reverting unrelated edits, record key decisions under `results/`, and identify verification evidence plus remaining risks.

## Completion Audit

- Original ten requested implementation points addressed.
- Release documentation and version metadata synchronized.
- All required checks recorded with truthful results.
- Remaining oversized modules and next extraction slices documented.
- Commit pushed to the configured upstream.
- Rust artifacts cleaned last.
