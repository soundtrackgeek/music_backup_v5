# Frontend workspace architecture

`App.tsx` mounts the workspace store providers and the app shell. Add a feature in its workspace directory instead of adding rendering, state, effects, or handlers to the entry point.

## State and workflows

The app uses React reducers and context, with no additional state runtime. Each `useXStore.ts` owns a workspace's initial state, reducer, stable setters, and long-lived refs. Stores stay mounted while the visible workspace changes, so query fields, selected entities, chart configuration, Year Ledger filters, import previews, settings drafts, and progress survive navigation and panel recovery. UI-only controls in independent components can continue to use local state.

`workspaceStore.tsx` supplies typed field actions and functional updates. Setters are created once per reducer and retain React's `Object.is` bailout. Updates to one field preserve the rest of that store. Keep event listeners and request guards in `useXWorkspace` hooks beside the views. Preserve cancellation, request identity, and explicit apply/rollback behavior when extending a workflow.

`useAppController.ts` composes the stores and hooks in dependency order. `useCatalogWorkspace` coordinates startup, catalog revision events, settings write serialization, and refreshes that span workspaces. `useNavigationWorkspace` owns cross-workspace launches; `useShellWorkspace` owns Luna launches, layout, and detail-drawer focus. The coordinating component subscribes to these stores, so this change does not claim that every workspace update avoids a shell render. Split subscriptions or add measured memoization when profiling identifies a bottleneck.

## Rendering and recovery

`WorkspaceRouter` and `WorkspaceDetails` choose the active view and its inspector. Views and their panels live under `src/workspaces/<feature>/`; shared catalog values and criteria live under `src/components/catalog/`. Settings has separate General, Updates, Data, Diagnostics, and MusicBrainz panels. Pure helpers remain under `src/app` or their owning feature.

Each workspace view, its details, and Luna has a `WorkspaceErrorBoundary`. **Reload this view** remounts the failing panel tree while the stores and backend jobs continue. Navigation remains available after a view failure. A final app boundary also provides recovery if shell initialization fails. Render boundaries do not handle event-handler or asynchronous command failures; those retain their existing error states.

**Copy error details** includes the app version, workspace, timestamp, JavaScript stack, and React component stack. Desktop uses Tauri's clipboard plugin; browser preview uses the browser clipboard. If copying fails, details remain selectable. `renderDiagnostics.ts` keeps the latest 20 bounded failures in memory and exposes copies for a future combined diagnostics export. It does not write to the library database.

## Styles and guardrails

`src/styles.css` is a stylesheet manifest. `src/styles/tokens.css` defines repeated palette values, spacing, radii, and recovery-panel theme colors. `src/styles/shared.css` contains shared layout, controls, and selectors spanning features. Workspace CSS lives beside its views; assistant, provider, and MusicBrainz styles live beside their shared component families. Selectors retain their feature namespaces and media/theme variants. Mixed selectors remain in shared styles. Completion's original defaults load before shared controls; `src/styles/responsive.css` loads the late shared progress-theme and browse-filter media overrides last. Shared criterion inputs load before credential-field overrides. Preserve this cascade order when adding imports. The manifest loads all styles to preserve reuse in inspectors and overlays.

The extraction retains existing rules; unused CSS was not deleted based on browser preview coverage because desktop-only states and provider workflows may need it. Compare computed styles and rendered layouts before removing or changing legacy overrides.

Run `npm run lint` for the ESLint `max-lines` warning at 1,500 nonblank, noncomment lines. Existing oversized backend adapters, type definitions, and independent workspaces still warn; newly extracted modules are below the limit. `npm run check` includes this guard plus the existing frontend, script, security, build, and Rust checks.

Regression tests cover queued reducer updates, stable setters, navigation retention, retry without losing query state, isolation of a failed view, clipboard fallback, and bounded diagnostic evidence. Existing App tests continue to cover independent startup counts, Year Ledger restoration, search interactions, and album detail loading.
