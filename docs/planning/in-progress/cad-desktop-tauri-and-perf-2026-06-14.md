# Starr CAD desktop — Tauri wrap + perf pass — 2026-06-14

*User request (verbatim):*
> "I want to make it so that the STARR CAD portion of the software can
> be a stand alone application on windows and mac. I want to optimize
> it so that everything runs smoothly and quickly. It will be a program
> that can be downloaded, installed and executed. It should run very
> fast and smoothly, even with large point files and many dense layers.
> If there is a way to do this to really optimize the cad software,
> let's do it. Even if we need to rebuild the software using a
> different engine/coding language."

## Direction (the short version)

Wrap the **existing** Next.js 14 + React 18 + Pixi.js + Zustand
codebase with **Tauri 2** so the same TypeScript app ships as a tiny
native binary on Windows + macOS + Linux. THEN do a focused perf pass
on the existing renderer — spatial index, dirty-region tessellation,
label-gen off the main thread, LOD, React-boundary audit — to take it
from "smooth at 10k points" to "smooth at 100k+." Only after a
profiling harness proves we've actually hit the V8 / WebGL ceiling do
we touch a native renderer (Rust + wgpu via Tauri IPC). Full rewrite
in Qt / C++ / pure Rust is explicitly rejected: the moat is the
surveying domain logic in `lib/cad/` (213 modules, 241 test files,
2866 passing cases), not the renderer; throwing that away to chase a
hypothetical 2× runtime is the move that's killed every survey-CAD
startup that's tried it.

## Constraints baked into every slice
- Stay on branch `claude/gifted-ramanujan-lQaEI`.
- Slice = typecheck + lint + test + commit + push. Tests source-lock
  the wiring; pure logic gets unit fixtures.
- **Every new command, IPC handler, and tuning knob is AI-controllable**:
  Tauri commands register through the existing `BindableAction`
  registry, all flags live in `doc.settings`, dispatchers fire
  `cad:*` events so the AI tool registry can drive them.
- **Don't bifurcate** the rendering pipeline. One renderer, gated
  paths inside it. A "second engine for big files" is rejected.
- **Hold the line on web parity** — Tauri wrap must NOT break the
  current Vercel build. The same codebase ships to web AND desktop;
  platform-specific code routes through `lib/cad/platform/runtime.ts`.

## Phase 1 — Tauri wrap (ship the binary)

Goal: a downloadable, installable Windows + macOS desktop binary that
runs the exact app you have today, with native file dialogs and
filesystem-backed autosave. Two weeks of wall-clock effort across the
slices below.

### T1 — Next.js static-export config
> **DONE (2026-06-14).** `next.config.js` now branches on
> `STARR_BUILD_TARGET=desktop`: when set, the build flips to
> `output: 'export'`, `distDir: 'out-desktop'`, `assetPrefix: ''`,
> `trailingSlash: true`, and `images.unoptimized: true` (Vercel's
> image optimization needs a server). Default (web) build is
> byte-for-byte unchanged — same routes, same server actions, same
> `serverComponentsExternalPackages`. New
> `scripts/prepare-desktop-build.mjs` stashes every non-CAD
> directory (admin job UI, /api/* handlers, marketing pages, dev
> route group — 70 dirs in this repo) into a `.desktop-stash/`
> sibling via instant `renameSync` calls, runs the inner build with
> `STARR_BUILD_TARGET=desktop`, then restores via `try/finally` so
> a failed build doesn't leave the tree mangled. Three new npm
> scripts: `build:desktop` (atomic stash → build → restore),
> `build:desktop:stash`, `build:desktop:restore`. `.gitignore` adds
> `out-desktop/` + `.desktop-stash/` so the artifacts never get
> committed. Smoke-tested: 70-dir stash + restore round-trips
> cleanly against the live repo (only the intended new files +
> edits in `git status`). 13 unit + source-lock cases in
> `__tests__/desktop/next-config-desktop-branch.test.ts`. Full
> suite: 7742 green (no regressions from the config branch).

### T2 — `tauri init` + dev shell
> **DONE (2026-06-14).** Hand-scaffolded a Tauri 2 dev shell rather
> than running `tauri init` (no network in the sandbox), matching
> what the CLI would produce: `src-tauri/Cargo.toml` (Tauri 2,
> staticlib+cdylib+rlib library crate, `custom-protocol` feature
> for `tauri dev`), `src-tauri/build.rs` (`tauri_build::build()`),
> `src-tauri/src/main.rs` (Windows-subsystem guard +
> `starr_cad_lib::run()`), `src-tauri/src/lib.rs` (default builder
> + a `#[tauri::command] ping()` smoke IPC that Slice T3 will wrap
> in a typed helper), and `src-tauri/tauri.conf.json` wired so
> `beforeDevCommand` runs `npm run dev` and `beforeBuildCommand`
> runs `npm run build:desktop` (from Slice T1). The main window
> lands directly on `/admin/cad/` so the standalone binary opens
> straight into the survey workspace. `src-tauri/capabilities/default.json`
> grants only `core:default` — Slice T4 / T6 / T7 layer dialog /
> fs / menu permissions on top. New JS deps: `@tauri-apps/api`
> (runtime), `@tauri-apps/cli` (dev). New npm scripts: `tauri`,
> `tauri:dev`, `tauri:build`. `.gitignore` adds `src-tauri/target/`
> + `src-tauri/gen/`; `src-tauri/Cargo.lock` IS committed per the
> Tauri-app convention. 23 source-lock cases in
> `__tests__/desktop/tauri-shell-scaffold.test.ts`. Full suite:
> 7765 green.

### T3 — Platform-runtime helper
> **DONE (2026-06-14).** New `lib/cad/platform/` module with three
> files: `runtime.ts` (pure, exports `isTauri()`, `isWeb()`,
> `getPlatform()`, and the typed `ping()` smoke IPC),
> `usePlatform.ts` (SSR-safe React hook returning
> `{ platform, isTauri, ready }`), and `index.ts` (public surface
> that deliberately does NOT re-export the internal
> `__unsafeSetTauriInternalsForTests` seam). Detection avoids
> importing `@tauri-apps/api` entirely — Tauri 2 injects a
> `window.__TAURI_INTERNALS__` global before the front-end mounts,
> so the web bundle never pulls in Rust-side code paths. OS
> resolution sniffs the webview UA inside Tauri (faster than the
> async `plugin:os` IPC roundtrip and reliable across WebView2 /
> WKWebView). 14 unit cases in
> `__tests__/desktop/platform-runtime.test.ts` cover web/Tauri
> boundary, all four `Platform` values + the unknown-UA fallback,
> ping happy + sad paths, SSR safety (no `window`), and the public
> surface ban on the test seam. New `setup-window-stub.ts`
> side-effect helper polyfills `window` + `navigator` for the
> node test environment (vitest defaults to `environment: 'node'`
> and the repo doesn't pull in jsdom). Full suite: 7779 green.

### T4 — Native file-open for TRV / STARR / CSV
> **DONE (2026-06-14).** New `lib/cad/persistence/native-file.ts`
> exposes `openCadFileViaPlatform(opts)` → `{ path, name, contents }
> | null`. The helper avoids `@tauri-apps/api/dialog` entirely —
> instead it calls `plugin:dialog|open` + `plugin:fs|read_text_file`
> through the runtime-injected `__TAURI_INTERNALS__.invoke`, so the
> web bundle still doesn't pull Rust code. `DEFAULT_CAD_FILTERS`
> leads with a `.starr / .trv / .csv` catch-all and ends in
> `All files`. Base-name extraction works on both POSIX and Windows
> paths. The lower-level `openFileViaTauri(opts, invoke)` is exported
> for tests + future callers that already hold a typed invoke. Rust
> side: `Cargo.toml` adds `tauri-plugin-dialog` + `tauri-plugin-fs`
> at v2, `lib.rs` registers them on the builder chain, and the
> default capability now grants `dialog:allow-open` +
> `fs:allow-read-text-file` (broader fs scopes land in T6). 15 unit
> + source-lock cases in `__tests__/desktop/native-file-open.test.ts`.
> The Slice T2 source-lock that froze the capability list to a
> single entry was loosened to assert PRESENCE of `core:default`
> instead, so subsequent slices can extend the permission surface
> without breaking the fixture. Full suite: 7794 green.
> (MenuBar's `openFileDialog` + the CADLayout drop zone wiring is
> deferred to a follow-up — the helper is callable today, but
> routing through it requires extracting the 70-line web flow into
> a shared "given (name, contents) load it" body. Doing that as a
> separate small slice avoids putting the web import path at risk
> in T4.)

### T4b — Wire native open into MenuBar + CADLayout drop zone
> **DONE (2026-06-14).** Extracted the existing `openFileDialog`
> dispatch body in `app/admin/cad/components/MenuBar.tsx` into a
> shared `async function processOpenedCadFile(name: string, text:
> string)` that owns the sniff → TRV / STARR-JSON branch → loader
> chain + setFileLoading false in its outer finally + the
> dispatch-error diagnostic. `openFileDialog` now branches at the
> top on `isTauri()`: in the Tauri shell it awaits
> `openCadFileViaPlatform()`, calls `setFileLoading(true)` only
> after the dialog returns (so the overlay doesn't block the
> picker), then feeds `(result.name, result.contents)` into the
> shared helper; the dialog-error path surfaces through the same
> `buildFileLoadDiagnostic('sniff')` pipeline the web read-error
> already uses. The web branch is byte-for-byte unchanged in
> behavior — same `<input type="file">`, same `accept`, same
> setFileLoading(true) ordering before `file.text()`, same
> diagnostic on read failure — and now also routes its loaded
> text through the shared helper instead of inlining the
> dispatch. 9 source-lock cases in
> `__tests__/desktop/menubar-open-routing.test.ts` lock the
> dispatch-body extraction (no residual `file.name` /
> `file.text()` references inside `processOpenedCadFile`), the
> isTauri branch ordering, the Tauri error path, and the web
> fallback's structural elements. The pre-existing
> `__tests__/cad/io/file-detect.test.ts` source-lock that froze
> `detectFileFormat(file.name, text)` was updated to expect the
> parameter form `detectFileFormat(name, text)`. CADLayout
> drop-zone wiring is deferred to a follow-up T4c slice — the
> drop zone consumes a real DOM `File` from the `dragover` /
> `drop` events, and Tauri's drag-and-drop story is different
> enough (file-protocol paths vs. browser `File` objects) that
> it deserves its own focused pass. Full suite: 7803 green.

### T4c — Wire native open into the CADLayout drop zone
> **DONE (2026-06-14).** Note: investigation found CADLayout has no
> pre-existing drop zone — the only canvas-level `onDrop` handler
> targets the project-image `application/starr-image-id` MIME
> type. So this slice ADDS the OS-drag-drop affordance rather than
> retrofitting an existing one. New module
> `lib/cad/persistence/native-drop.ts` exposes pure helpers
> (`basenameOf`, `isCadFilePath`, `readPathsAsCadFiles`,
> `NATIVE_DROP_EXTENSIONS`) plus the high-level
> `registerNativeDropListener(onFiles)` that returns an `unlisten`
> handle. The Tauri webview module is dynamic-imported through a
> `new Function('p', 'return import(p)')` trampoline so TS doesn't
> complain about the absent `@tauri-apps/api/webview` type
> definitions at typecheck time AND so the web bundle never pulls
> the Rust-side package. The listener filters drop payloads to
> `.starr / .trv / .csv` (case-insensitive) before issuing any
> `plugin:fs|read_text_file` IPC, and a per-file try/catch means a
> single locked file doesn't kill a multi-drop batch. MenuBar
> mounts a `useEffect` that subscribes on mount + cleanly
> unsubscribes on unmount; each dropped file feeds through the
> same `processOpenedCadFile(name, contents)` helper Slice T4b
> extracted, with `setFileLoading(true)` per file (matches the
> open-dialog ordering). 18 unit + source-lock cases in
> `__tests__/desktop/native-drop.test.ts` cover the extension
> filter, both path styles, per-file failure tolerance, the
> Tauri-boundary returns (web build → null, broken bootstrap →
> null, missing webview module → null), and the MenuBar wiring
> shape. Full suite: 7821 green.

### T5 — Native file-save (Save / Save As)
Symmetric: `saveFileDialog(defaultPath, contents)` and `saveToPath(path, contents)`.
Track the active file path in a new `documentStore.filePath`
field (persisted in IndexedDB on web, recomputed on desktop from
the last opened path). Save uses the stored path; Save As
prompts. The current `lib/cad/persistence/save.ts` flow keeps
working — only the "where do bytes go" step swaps out. Source-
lock MenuBar's File → Save / Save As paths.

### T6 — Autosave migration to filesystem
New `lib/cad/persistence/native-autosave.ts` writes to
`appDataDir() + '/autosaves/<docId>-<timestamp>.starr'` with
the same retention rules the IndexedDB autosaver already uses
(15 entries / 7 days). `lib/cad/persistence/autosave.ts` becomes
a thin selector that picks the impl via Slice T3. Recovery flow
(`RecentRecoveriesDialog`) lists entries from BOTH stores when
running on desktop so users coming from the web build don't lose
prior autosaves. Pure path-resolution helper + retention-pruning
helper get unit tests.

### T7 — Native app menu + Recent Files
Use Tauri's `Menu` API to install a real menu bar (top of screen
on macOS, top of window on Windows). File → Open / Save / Save As /
Recent Files (last 10) / Quit. Edit → Undo / Redo / Cut / Copy /
Paste / Select All. View → Zoom Extents / Refresh Canvas (fires
the Slice-11 `cad:regenerateCanvas` we just shipped). Help →
Keyboard Shortcuts (fires the existing overlay). The menu's
shortcuts route through the existing hotkey engine via the
`dispatchDefaultAction` path — single source of truth for what
each action does. Recent Files persists in
`appDataDir() + '/recent.json'`. Source-lock the menu wiring.

### T8 — CI matrix: Windows / macOS / Linux signed artifacts
`.github/workflows/release.yml` triggered on tags (`v*`). Uses
`tauri-apps/tauri-action` to produce `.dmg` + `.app` (macOS),
`.msi` + portable `.exe` (Windows), and `.AppImage` + `.deb`
(Linux). Code-signing certs live in repo secrets:
`APPLE_CERTIFICATE` + `APPLE_PASSWORD` + `APPLE_TEAM_ID` for
macOS notarization; `WIN_CERT` + `WIN_CERT_PASSWORD` for
Windows. Auto-update channel via Tauri's signed update manifest
served from the repo's GitHub Pages. No automated test on this
slice — CI is its own validation; the deliverable is a green
matrix run on a `v0.x.0-tauri-preview` tag.

## Phase 2 — Renderer perf pass on the existing TS/Pixi pipeline

Goal: take the **existing** Pixi renderer from "smooth at 10k
points" to "smooth at 100k+ points with dense linework," without
touching the rendering engine. Five-to-six weeks of effort. This is
where most of the felt improvement lives — the runtime ceiling is
much higher than the current code path reaches.

### P1 — Spatial index for feature bounds (rbush R-tree)
New `lib/cad/spatial/feature-index.ts` wraps `rbush` (4 KB,
battle-tested). Keys: feature id → AABB from `featureBounds(f)`.
The drawing store gets `withSpatialIndex` middleware that
incrementally inserts on `addFeature`, removes on
`removeFeature`, and re-inserts on `updateFeature` /
`updateFeatureGeometry`. Public helpers:
`spatialIndex.queryRect(min, max): featureId[]` for viewport +
hit-testing, `spatialIndex.queryPoint(x, y, tolPx, zoom)` for
the click-pick path. The biggest win in this whole plan —
hit-tests + culling go O(n) → O(log n). Unit tests against the
existing `__tests__/cad/geometry/bounds.test.ts` fixtures plus a
new 10k-feature synthetic stress.

### P2 — Viewport culling in the render loop
`CanvasViewport.renderFeatures()` queries the Slice-P1 index
for features intersecting the camera AABB instead of iterating
`Object.values(document.features)`. The query runs once per
render; results cached per camera-AABB hash so a no-move re-
render is essentially free. Document the before/after frame
times on the existing Garland TRV fixture (~5k points) and a
new 50k-point synthetic. Test the AABB query helper directly.

### P3 — Dirty-region tessellation
Drawing store gains `dirtyFeatureIds: Set<string>` populated by
every `addFeature` / `removeFeature` / `updateFeature` /
`updateFeatureGeometry` / `setFeatureTextLabels`. The renderer
maintains a Pixi `Graphics` cache keyed by feature id, rebuilds
Graphics only for dirty ids, and reuses cached Graphics for
clean ids on the next frame. `cad:regenerateCanvas` (the Slice
11 escape hatch we shipped) becomes "mark every id dirty + run"
so the user-facing semantics stay identical. Test the dirty-id
tracking + cache reuse.

### P4 — Label generation off the main thread
New `lib/cad/labels/worker/` module: a Web Worker that owns
`generateLabelsForFeature` and `regenerateLayerLabels`. The store
posts `{ featureId, layer, displayPrefs }` and gets
`TextLabel[]` back via a transferable `MessagePort`. The render
loop never blocks on label work, so dragging a feature with
heavy label regeneration finally feels smooth. On Tauri the
worker uses the same Web Worker API (WebView2 + WKWebView both
support workers). Adapter layer makes the worker testable from
Vitest via a thin `runInWorker(message)` shim.

### P5 — LOD threshold tuning + lazy label render
At zoom below `doc.settings.lodPixelThreshold` (default 0.5),
skip label render entirely and draw points as 2-pixel dots
instead of the symbol library glyph. Polyline simplification
epsilon ramps from 0 ft at full zoom to `simplifyEpsilon` ft at
the threshold. Surfaced as three settings:
`lodPixelThreshold`, `lodLabelThreshold`, `lodSimplifyEpsilon`
— all AI-controllable. Pure helper + selector tests; visual
fidelity tested at boundaries via existing render-fixture
infrastructure.

### P6 — React boundary audit
`CanvasViewport.tsx` is 14,431 lines — almost certainly
re-renders the world on every store tick. Audit with React
Profiler, identify the top 3 reconcile-on-every-keystroke
culprits, and split via `useSyncExternalStore` selectors with
shallow equality. Specifically: lift `cursorWorld` + `zoom` +
`isBoxSelecting` into their own selectors so cursor moves don't
reconcile the entire canvas component. Also: memoize the
`MenuBar` / `LayerPanel` / `PropertyPanel` subtrees keyed by
the selection-id set rather than reading raw `selectedIds`.
Source-lock the selector hooks; document the profiler delta on
the Garland fixture before/after.

## Phase 3 — Native renderer module (PROFILING-GATED, defer by default)

Goal: if and only if Slice P-perf shows we're still bottlenecked at
the largest realistic surveys (200k+ features, dense linework), swap
JUST the renderer for a Rust + wgpu module reached via Tauri IPC. The
TypeScript business logic (importers, AI tool registry, layer model,
code library — every line in `lib/cad/`) stays exactly where it is.

### N1 — Profiling harness
Builds on the deferred Slice 11 part 2 of the cleanup plan. Adds
`lib/cad/perf/render-markers.ts`: `markRender(label, durationMs)`
aggregates frame-time histograms; `getRenderProfile()` returns
the rolled-up p50 / p95 / p99 + per-phase breakdown. A hidden
hotkey (`Ctrl+Alt+P`) toggles a "Perf overlay" dev panel that
graphs the histograms live. The harness records on three
fixtures: small (Garland), medium (synthetic 50k), large
(synthetic 200k). **This is the gate for Phase 3** — only
ship N2 if the overlay confirms the V8 / WebGL stack IS the
bottleneck after every Phase-2 slice landed. Test the histogram
helper.

### N2 — (PROFILING-GATED) Rust + wgpu renderer behind Tauri IPC
Initial scaffold: `src-tauri/src/render/` defines a
`#[tauri::command] fn draw_features(viewport: Viewport, list:
DrawList) -> Result<()>`. The TS side serializes a compact
draw-list (id, type, vertices, style id) per frame from the
spatial-index query. Rust + wgpu renders to a window-shared
surface. **Only land this slice if Slice N1's profile says we
need it; otherwise mark deferred with a one-line rationale per
the planning rubric.**

## Risk register

- **Tauri webview parity across OSes** (WebView2 vs. WKWebView):
  Slice T2 should include a smoke checklist on both. Mitigation:
  guard any feature-detection paths in the existing code that
  read browser-specific quirks (none currently flagged).
- **Static export + Next.js dynamic routes:** Slice T1 surfaces
  these early. If a route can't go static, it's web-only.
- **macOS notarization:** can take 5–15 minutes per build; CI
  matrix needs the right secrets. Slice T8 documents.
- **Worker overhead vs. main-thread cost** for very small drawings:
  Slice P4 should fall back to main-thread label gen when the
  feature count is below a threshold (~100). Auto-tuned, not a
  user setting.
- **Spatial index churn under rapid edits** (drag a polyline →
  every vertex move re-inserts): Slice P1 includes a 16 ms
  debounce that batches incremental updates per render frame.

## Slice order (recommended)

Risk-ordered. T1–T2 ship a working dev binary in days; everything
after that is incremental improvement that can land independently.

1. **T1** — Static-export config
2. **T2** — `tauri init` + dev shell
3. **T3** — Platform-runtime helper
4. **T4** — Native file-open
5. **T5** — Native file-save
6. **T6** — Autosave migration
7. **T7** — Native app menu + Recent Files
8. **T8** — CI matrix (signed artifacts)
9. **P1** — Spatial index (rbush)
10. **P2** — Viewport culling
11. **P3** — Dirty-region tessellation
12. **P4** — Label generation off main thread
13. **P5** — LOD threshold tuning
14. **P6** — React boundary audit
15. **N1** — Profiling harness
16. **N2** — Rust + wgpu renderer (PROFILING-GATED)

## TL;DR
Tauri-wrap the existing app for Win/Mac/Linux binaries (Slices T1–T8),
then make the existing Pixi renderer smooth at 100k+ points by adding
a spatial index, dirty-region tessellation, off-thread labels, LOD,
and a React-boundary audit (Slices P1–P6). Hold a profiling-gated
optional Rust + wgpu renderer (Slices N1–N2) for the case where the
web runtime really IS the ceiling. No full rewrite — the surveying
domain logic is the moat.
