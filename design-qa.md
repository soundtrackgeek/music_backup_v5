# Artist Career Peaks Refinement Design QA

## Comparison target

- Selected reference: `C:\_code\music_backup_v5\docs\design\artist-career-peaks-concept.png` at 1584×1024.
- Reported pre-fix state: `C:\Users\jtill\AppData\Local\Temp\codex-clipboard-287ce904-91e1-4ef6-8e42-f2d55399f71f.png` at 1765×903.
- Browser implementation: `C:\_code\music_backup_v5\docs\design\artist-career-peaks-refinement-implementation.png` at 1584×900.
- Same-frame review input: `C:\_code\music_backup_v5\docs\design\artist-career-peaks-refinement-comparison.png` at 3168×900. The reference's top 900 pixels and the implementation were placed side by side at the same physical scale.
- Browser-rendered URL: `http://127.0.0.1:4178/`.
- Browser capture: 1267×720 CSS pixels at 1.25 device scale, yielding 1584×900 physical pixels.

## State and coverage

- QA state: Timelines → Artists, My Scores, filters expanded, KISS and Ozzy Osbourne selected, 37 albums visible, KISS focused.
- The comparison covers the dark-theme year ruler, framed filter controls, per-album square peak markers, focused-artist treatment, selected-album covers, dedicated artist detail rail, and overall career-peak composition.
- The reference and final browser capture were reviewed together in the same comparison input rather than as independent screenshots.
- The rendered implementation intentionally uses the user's two-artist state instead of the seven example artists in the concept.

## Fidelity review

- Typography and contrast: Year labels now use explicit light-on-dark SVG text colors and tabular numerals. Filter labels retain the product's compact Manrope hierarchy.
- Layout: The chart preserves the reference's left artist labels, top year guide, luminous career baselines, and album peaks. A 204-pixel detail rail reserves space for artist information without reducing or covering plotted years.
- Album semantics: Every rendered peak has a small square album-cover marker at its summit. The three strongest selected albums retain the larger reference-style cover treatment.
- Hover behavior: Peak markers use the shared album-cover preview system. Hovering displays a 300×300 cover plus a separate album-and-year caption without shrinking the artwork.
- Filters: Artist, include genre, exclude genre, From, To, and Top count controls now use the same framed panel treatment and teal focus language as the Genre timeline.
- Focus behavior: Selecting or hovering an artist preserves the warm luminous focus and gently fades other careers without removing them.

## Findings and fixes

- P1 unreadable year ruler: Career Peaks referenced local `--text`, `--muted`, `--border`, and `--panel` tokens that were undefined in this component scope, allowing SVG year text to fall back to black in the dark theme.
  - Fix: Defined scoped light/dark tokens and added explicit year-label fills for both themes.
- P1 artist card obstruction: The selected-artist card was absolutely positioned over the late-year portion of the SVG.
  - Fix: Wrapped the plot and card in a two-column visual container and placed the card in a dedicated right rail; compact layouts stack it beneath the plot.
- P1 incomplete album hover: SVG native title text produced an `Album (Year)` browser tooltip without artwork.
  - Fix: Removed SVG titles and attached the shared 300×300 `AlbumCover` preview with an album-and-year caption to every peak marker.
- P2 missing summit markers: Peaks had only their line shape, while the agreed concept showed a distinct square album point at each summit.
  - Fix: Added one cover-backed, focusable square marker per album at the computed peak coordinate.
- P2 flat filters: Missing local border and panel tokens made the controls look unframed and visually disconnected.
  - Fix: Restored bordered fields, compact uppercase labels, consistent panel backgrounds, and visible teal focus states.

## Verification

- Browser console errors: none.
- Browser interaction: My Scores, filter disclosure, artist add/remove state, selected-artist focus, peak-marker presence, album navigation affordances, and non-overlapping detail placement verified.
- Component coverage: verifies all peaks receive cover markers, the artist card is outside the plot, native SVG titles are absent, and captioned previews preserve a 300×300 artwork area.
- Same-frame visual comparison: reviewed and passed, including the intentional user-requested deviation that moves the info card out of the plotted timeline.
- Automated release checks: passed (`49` Vitest files / `196` tests, Python trimmer tests, release/security checks, production TypeScript/Vite build, Rust tests, and final `cargo check`).

final result: passed
