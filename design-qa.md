# Albums through the years — design QA

- Reference: `C:\Users\jtill\Downloads\Generated image 2 (1).png`
- Reference pixels: 1672 × 941
- Desktop viewport: 1675 × 941 at density factor 1
- Desktop implementation capture: `C:\Users\jtill\.codex\visualizations\2026\07\27\019fa4a2-22a8-7133-b5d9-760615d61fb1\album-time-ribbon-desktop-final.png`
- Combined comparison: `C:\Users\jtill\.codex\visualizations\2026\07\27\019fa4a2-22a8-7133-b5d9-760615d61fb1\album-time-ribbon-reference-comparison-final.png`
- Mobile viewport: 390 × 844 at density factor 1
- Mobile implementation capture: `C:\Users\jtill\.codex\visualizations\2026\07\27\019fa4a2-22a8-7133-b5d9-760615d61fb1\album-time-ribbon-mobile-final-2.png`
- Fullscreen capture: `C:\Users\jtill\.codex\visualizations\2026\07\27\019fa4a2-22a8-7133-b5d9-760615d61fb1\album-time-ribbon-fullscreen.png`
- State: browser-preview library, Timeline, 1989, Summer, first summer album selected

## Comparison history

1. The first full comparison showed that the page started too high, the 1989/1990 labels collided, the ISO-week labels forced a scrollbar, and the selected-year focus was too narrow.
2. The second pass reserved visual space around 1989, aligned the month bridge and lower drawer to the reference, removed the week scrollbar, restored the global search rail, widened the focus field, and increased cover density.
3. Focused mobile inspection found a clipped title, a Luna/fullscreen collision, and unreadable week labels. The final compact rules balance the title, preserve fullscreen, fit all five context months, and render weeks as accessible visual ticks.

## Interaction and runtime checks

- Timeline navigation, prior/next chart year, season selection, album selection, Search handoff, exact-cohort Playlist Builder handoff, and fullscreen entry/exit all completed successfully.
- Desktop, mobile, and fullscreen states had no browser console warnings or errors.
- The final 1675 × 941 implementation and the 1672 × 941 reference were inspected together in one vertically stacked comparison; the remaining differences are intentional integrations with the existing Music Library shell and real-data controls.

final result: passed
