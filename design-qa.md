# Artist Career Peaks Design QA

## Comparison target

- Selected reference: `C:\_code\music_backup_v5\docs\design\artist-career-peaks-concept.png` at 1584×1024.
- Portrait reference: `C:\_code\music_backup_v5\docs\design\artist-career-comets-portrait-reference.png`.
- Browser implementation: `C:\_code\music_backup_v5\docs\design\artist-career-peaks-implementation.png` at 1584×1024.
- Same-frame comparison: `C:\_code\music_backup_v5\docs\design\artist-career-peaks-comparison.png`.
- Browser-rendered URL: `http://127.0.0.1:4178/`.
- Desktop QA viewport: 1584×1024 CSS pixels. Compact QA viewport: 1000×800 CSS pixels. The temporary viewport overrides were reset after testing.

## State and coverage

- Desktop comparison state: Timelines → Artists, Charts metric, Top 7 artists, Kate Bush focused, filters collapsed.
- The implementation includes the centered Charts / Genres / Artists navigation, glowing album peaks, circular artist portraits, selected album covers, a focused artist summary card, and a miniature overview strip.
- Compact QA verifies that the shell, timeline tabs, metric controls, portrait labels, focus card, and data-dense chart remain usable without compressing the visualization into illegibility.
- Browser preview data is deterministic and realistic. The desktop build renders the same view from SQLite albums, chart positions, personal album scores, cached album covers, and cached Last.fm portraits.

## Fidelity review

- Typography: Uses the reference's restrained sans-serif hierarchy and compact year/artist metadata while preserving the existing application type system.
- Layout: Reproduces the left artist labels, top year guide, stacked career baselines, selected-row covers, floating summary card, and bottom range overview.
- Color and light: Preserves the near-black blue-green field, warm amber selected career, distinct secondary artist colors, restrained glow, and softly faded focus state.
- Data semantics: Every peak maps to an album. Chart peaks combine Billboard and Official UK at 42% each and VG Lista at 16%; My Scores normalizes the user's album scores across the visible response.
- Portraits: Small circular artist images follow the Career Comets reference. Last.fm portraits are cached locally and shared by Career Peaks, Artists, and Artist Index; a representative album cover is the immediate fallback.
- Interaction: Charts/My Scores, search, artist add/remove, genre include/exclude, Scores umbrella, year bounds, Top 7/12/20, focus/fade, album opening, and artist opening are functional.
- Accessibility: Timeline tabs, metric controls, filter fields, peaks, artist labels, and navigation actions expose semantic names, pressed states, keyboard access, loading feedback, and empty/error states.

## Findings and fixes

- P1 peak fidelity: The initial implementation rendered isolated outline curves, which looked thinner and less luminous than the selected reference.
  - Fix: Closed and softly filled each peak, retained a crisp stroke and glow, and raised non-selected opacity to create the agreed gentle fade instead of near-disappearing rows.
- P1 vertical composition: The first browser pass left too much unused space below the overview strip at the reference viewport.
  - Fix: Increased the main plot and overview heights to align the composition with the reference's tall framed canvas.
- P2 overview fidelity: The first overview used plain colored baselines.
  - Fix: Replaced them with data-derived miniature album peaks and retained the teal range-window handles.
- P2 portrait continuity: Artist Index previously used generic initial circles.
  - Fix: Added a shared portrait component with Last.fm image, representative album-cover, and initial fallbacks in that order.

## Final comparison

- The selected reference and final implementation were reviewed together in `artist-career-peaks-comparison.png` at the same 1584×1024 scale.
- Intentional differences reflect the final product decision: `Charts / My Scores` replaces the mock's decorative `Peaks / Covers` switch, portraits are added beside artists, and peak density comes from actual albums rather than AI-generated decorative noise.
- Browser console errors: none.
- Verified interactions: Artists timeline tab, Charts/My Scores switch, filter disclosure, artist/genre/year controls, selected-artist focus, album peak navigation, artist navigation, and compact layout.

## Verification

- Dedicated Artist Career Peaks helper, component, and Timelines workspace suites: passed.
- Dedicated Rust weighted artist-timeline query test: passed.
- Full repository release gate: passed (`49` Vitest files / `194` tests, `15` Python tests, release/security checks, production TypeScript/Vite build, `315` Rust tests passed with `20` network-dependent tests ignored, and final `cargo check`).

final result: passed
