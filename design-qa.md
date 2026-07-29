# Library Completion Design QA

## Comparison Target

- Approved visual: `C:\Users\jtill\.codex\generated_images\019faaff-e573-71e1-9016-da52c971a50c\exec-90f4c683-1792-4a65-a30c-d493558dc9d7.png` at 1487×1058.
- Final Workbench capture: `C:\_code\music_backup_v5\docs\design\library-completion-workbench.png` at 1487×1058.
- Same-frame comparison: `C:\_code\music_backup_v5\docs\design\library-completion-qa-comparison.png`.
- Coverage Atlas capture: `C:\_code\music_backup_v5\docs\design\library-completion-atlas.png`.
- Responsive capture: `C:\_code\music_backup_v5\docs\design\library-completion-tablet.png`.
- Browser-rendered URL: `http://127.0.0.1:1420/`.

## Required Fidelity Surfaces

- Typography: Preserves the app's existing Inter hierarchy while matching the approved compact, evidence-led command-centre density. Headings, status labels, source metadata, and numeric Atlas values remain distinct and readable.
- Spacing and layout: Reproduces the approved two-column candidate/dossier Workbench, compact command bar, evidence ledger, decision controls, provider handoff, and first-class Atlas view. The implementation uses the product's established full/icon navigation behavior instead of replacing the global shell.
- Colors and surfaces: Maps the approved restrained teal, warm gray, amber review state, fine borders, and shallow elevation into the existing design tokens. No gradients or decorative placeholder art were introduced.
- Image quality: Uses six existing real raster cover assets in the browser preview. Missing production artwork has an intentional icon fallback rather than a fake cover.
- Copy and content: Separates first-charted year from release verification, states local absence precisely, labels MusicBrainz as on demand, and identifies Discogs as a next phase instead of implying requests are already running.
- Icons and accessibility: Uses the existing Lucide family, semantic buttons/regions, explicit labels, keyboard focus, alt text, status text, disabled Deemix state before a wanted decision, and keyboard search focus via Ctrl+K.

## Findings and Fixes

### Pass 1

- P2 behavior: The initially selected Official UK 1980s Atlas cell had no matching preview candidates, so its primary **Review candidates** action opened an empty campaign.
- Fix: The Atlas now initially selects the data-backed Official UK 1990s cohort; the campaign opens three realistic candidates while any other cell remains selectable.
- P2 content: The Windows preview displayed a macOS shortcut glyph, and the shared MusicBrainz mock produced an unrelated artist/year for Completion queries.
- Fix: Changed the hint to Ctrl+K and made the preview MusicBrainz query/result carry the selected album, artist, and chart year coherently.

### Pass 2

- The initial light-theme comparison found no remaining actionable P0, P1, or P2 mismatch against the approved concept. A later real-library dark-theme review exposed the remediation items below.
- Intentional product integrations: the current application shell keeps its established responsive sidebar; automated provider activity from the concept is represented honestly as on-demand MusicBrainz, next-phase Discogs, and idle/ready Deemix states in this first implementation.
- Browser console errors: none.
- Core interactions verified: Completion navigation, Workbench/Atlas switching, Atlas cohort handoff, persistent wanted state, Deemix lookup result, MusicBrainz candidate display, filters, and responsive reflow.
- Viewport resilience: no horizontal overflow at 1487×1058, 1180×900, 1040×800, or 800×900.

### Feedback remediation — 0.96.1

- P1 data integrity: Atlas campaigns previously filtered the globally capped 5,000-row Workbench response, so a cohort count such as 2,009 could open only the subset present in that global slice.
- Fix: **Review candidates** now requests the complete selected source-and-decade cohort from SQLite without the global cap, applies the **Open unverified** status filter, and shows the loaded cohort count in the campaign chip. Browser QA confirmed the selected Atlas count, campaign count, and queue count reconcile.
- P1 provider feedback: MusicBrainz could finish with no visible result, and the free-form `title by artist (year)` string produced weak release-group searches.
- Fix: Completion now sends structured title, artist, and chart-year fields; the UI preserves found, empty, failure/retry, and verified states. Search results exclude release groups with Live, Compilation, or any other secondary type, and selection revalidation requires an Official release.
- P1 content: Chart-confidence language implied studio-album verification before a catalog check.
- Fix: New chart rows are labeled **Unverified**, the dossier says **Album type unverified**, and confidence badges describe the strength of the chart match rather than album type.
- P2 contrast: several dark-theme ledger labels and supporting metadata inherited low-contrast light-theme colors.
- Fix: Added explicit dark-theme primary, secondary, and tertiary text colors, stronger borders, and 12px/11px ledger typography. Computed browser styles confirmed `rgb(231, 240, 237)` primary labels and `rgb(181, 196, 191)` evidence text on the dark panel.
- Browser console errors: none after the remediation pass.

## Verification

- Full 0.96.1 release gate: 39 frontend suites / 156 tests passed, 15 Python companion tests passed, security checks passed, production build passed, 189 Rust tests passed with 20 live-network tests ignored, and `cargo check` passed. Rust tests ran sequentially to avoid contention between the existing local HTTP gateway fixtures.
- Dedicated Completion component/navigation tests: passed.

final result: passed
