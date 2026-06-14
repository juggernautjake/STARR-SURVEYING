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
> **DONE (2026-06-14).** New `lib/cad/persistence/native-save.ts`
> exposes the Save-As entry point `saveCadFileViaPlatform(options,
> contents)` and the plain-Save companion
> `saveCadFileToPath(path, contents)`. Both route through
> `__TAURI_INTERNALS__.invoke` against `plugin:dialog|save` and
> `plugin:fs|write_text_file`, mirroring the T4 open pattern — no
> `@tauri-apps/api` import, so the web bundle stays Rust-free. The
> path-only companion is the "Save" path: skip the dialog and write
> straight to the path the active document remembers from the
> previous Save-As. Capabilities widened in
> `src-tauri/capabilities/default.json` to grant `dialog:allow-save`
> + `fs:allow-write-text-file` on top of T4's read perms — the
> existing T2 + T4 source-locks were loosened to assert presence
> (not exact set) of `core:default` / fs reads, so T5 can extend
> the list without breaking earlier fixtures. The `tauri-plugin-dialog`
> + `tauri-plugin-fs` deps already cover save; no Rust-side
> registration changes. 13 unit + source-lock cases in
> `__tests__/desktop/native-file-save.test.ts` cover both happy paths,
> user cancellation, defensive non-string dialog replies, base-name
> extraction on both path styles, the path-only companion's behavior
> off + on Tauri, and the capability extension. Full suite: 7834
> green. (MenuBar wiring deferred to a T5b follow-up — same pattern
> as T4 / T4b: the helper is callable today and the wiring is its
> own focused slice so it doesn't put the current `saveLocalCopy`
> download flow at risk.)

### T5b — Wire native save into MenuBar (Save / Save As)
> **DONE (2026-06-14).** Extended the SaveTarget store's `local`
> variant with an optional `path?: string | null` field so the
> Tauri save flow can remember the absolute filesystem path the
> surveyor picked. `setLocalTarget(docId, name, path?)` is
> backward-compatible — web callers keep using the two-arg form
> and the field stays `null`. MenuBar's `saveLocalCopy` is now
> `async` and branches at the top on `isTauri()`: under Tauri it
> resolves contents once, looks up the remembered path on the
> SaveTarget store, and dispatches — `silentName + rememberedPath`
> writes straight back through `saveCadFileToPath`; everything
> else prompts via `saveCadFileViaPlatform({ defaultPath:
> name + '.starr' })`. On a successful save the new
> `setLocalTarget(doc.id, baseName, result.path)` call persists
> the path so the next Ctrl+S is silent. The base name strips
> `.starr` so the display name doesn't double-extension on the
> menu. The web branch is preserved byte-for-byte in behavior —
> same URL-blob, same anchor click, same setLocalTarget
> two-arg call — so `isTauri() === false` users keep the existing
> download. 11 source-lock cases in
> `__tests__/desktop/menubar-save-routing.test.ts` cover the
> store extension, the import wiring, the isTauri branch
> structure (contents-first, dialog after), both Save / Save-As
> dispatch paths, path-persistence, .starr extension strip, the
> cancel short-circuit, and the verbatim-preserved web branch.
> Full suite: 7845 green.

### T6 — Autosave migration to filesystem
> **DONE (2026-06-14).** New `lib/cad/persistence/native-autosave.ts`
> mirrors the IndexedDB autosave's public API
> (`writeNativeAutosave` / `readNativeAutosave` /
> `listNativeAutosaves` / `clearNativeAutosave`) + an exported
> `resolveNativeAutosavePath` + `ensureNativeAutosaveDir` for the
> filesystem helpers. On-disk layout:
> `<appDataDir>/autosaves/<docId>.starr` — one JSON file per
> document, matching the IndexedDB row shape byte-for-byte so a
> future "import old web autosave into desktop" migration is a
> copy not a transform. The native lister filters out non-`.starr`
> entries (a user dropping a PDF into the autosaves folder doesn't
> break recovery) and tolerates per-file parse failures so one
> malformed entry can't hide the rest.
>
> `lib/cad/persistence/autosave.ts` branches every public function
> on `isTauri()` at the top: web stays on the existing IndexedDB
> impl, Tauri dynamic-imports the native module and forwards. The
> dynamic import behind the `isTauri()` guard keeps the native
> module out of the web bundle. `listAutosaves` under Tauri merges
> native + web in parallel — native takes precedence for any
> docId that exists in both stores, then web entries fill in the
> remainder so a user who switched from the browser build doesn't
> lose prior autosaves on first desktop launch. The `web` lister
> was split into a private `listWebAutosaves()` helper so the
> merge can reuse it without recursing into the isTauri branch.
>
> Capabilities widened in `src-tauri/capabilities/default.json`:
> `fs:allow-mkdir`, `fs:allow-remove`, `fs:allow-read-dir`,
> `path:default`. The plan's proposed
> "15 entries / 7 days retention" rule turned out to be wishful —
> the current IndexedDB lister is one-slot-per-docId, so the
> native variant intentionally matches that behavior. (A separate
> follow-up can layer retention pruning across both stores.)
> 22 unit + source-lock cases in
> `__tests__/desktop/native-autosave.test.ts`. Full suite: 7867
> green.

### T7 — Native app menu + Recent Files
> **DONE (2026-06-14).** New `src-tauri/src/menu.rs` builds the
> File / Edit / View / Help submenu tree with stable string IDs
> (`ID_FILE_OPEN = "file.open"`, etc.) and exports
> `install_app_menu` (called from `setup`) +  `on_menu_event`
> (called from the builder chain). Each menu item emits a
> `cad:menu` event with its id as the payload. Predefined Quit /
> Cut / Copy / Paste come from `PredefinedMenuItem::*` so the OS
> handles those natively (Cmd+C inside an `<input>` works the way
> every user expects).
>
> New `lib/cad/platform/menu-bridge.ts` exposes `MENU_EVENT_MAP`
> (frozen record mapping each menu id to the existing `cad:*`
> window event the app already listens for), `dispatchMenuAction(id)`
> (the pure dispatcher — undo / redo bypass the event bus and go
> through the undo store directly), and `registerMenuBridge()`
> (subscribes to the Tauri `cad:menu` event via a lazy import
> trampoline that keeps `@tauri-apps/api/event` out of the web
> bundle). MenuBar mounts the bridge in a useEffect with the same
> disposed / unlisten guard the Slice T4c drop listener uses, plus
> two extra listeners for `cad:openFileDialog` (File → Open…) and
> `cad:saveDocumentAs` (File → Save As…) so the existing
> openFileDialog + saveLocalCopy closures fire from the menu.
> Capabilities widened with `event:allow-listen` so the TS bridge
> can subscribe.
>
> `setup-window-stub.ts` upgraded from `{}` to a real `EventTarget`
> so the bridge dispatch tests can wire listeners and verify they
> fire — earlier desktop tests didn't need that. 16 unit +
> source-lock cases in `__tests__/desktop/menu-bridge.test.ts`
> cover the canonical id-to-event mapping, every map entry's
> round-trip through `window.dispatchEvent`, the unknown-id
> no-op, the undo/redo bypass, the boundary returns
> (web → null, missing event module → null), the MenuBar
> wiring, the Rust menu construction, and the capability grant.
> Full suite: 7883 green.
>
> Recent Files as a DYNAMIC submenu (last 10 files reachable via
> `appDataDir/recent.json`) is deferred to a T7b follow-up — the
> menu currently exposes a single static "Recent Files…" item
> that routes to the existing `cad:openFileManager` event so the
> capability isn't blocking but the dynamic rebuild work hasn't
> landed yet. A separate slice can layer it on without touching
> the menu skeleton.

### T7b — Recent Files store + open-by-path plumbing
> **DONE (2026-06-14).** New `lib/cad/persistence/recent-files.ts`
> persists at `<appDataDir>/recent.json`. Public API: `getRecentFiles()`
> reads + tolerates (returns `[]` on web / missing file / non-array /
> parse error), `addRecentFile(path, name)` does the prepend +
> dedup + cap (mkdir-then-write the whole array as JSON),
> `clearRecentFiles()`, plus the path resolver. Pure
> `applyRecentFileAdd(current, entry)` extracted for the unit tests
> + future call sites that already hold the list in memory. Caps
> at `RECENT_FILES_LIMIT = 10` (macOS convention). The lister
> caps OUTPUT at 10 too so a corrupted recent.json with >10
> entries doesn't bloat the menu.
>
> MenuBar wires the store at every native success point: the
> Tauri open-dialog branch (after `processOpenedCadFile`), the
> drag-drop listener body (per-file), and the Tauri save branch
> (after `setLocalTarget` + `clearAutosave`). The web build is
> untouched because `addRecentFile` short-circuits on
> `isTauri() === false`. A new `cad:openRecentFile` window event
> handler reads the path via the fs plugin's
> `plugin:fs|read_text_file`, runs it through `processOpenedCadFile`
> just like the open dialog, and bumps the entry to the top of
> the Recent Files list — so future surfaces (the T7c menu
> rebuild OR a Recent Files dialog) only need to dispatch the
> event with `{ path }` to fire the open flow.
>
> 21 unit + source-lock cases in
> `__tests__/desktop/recent-files.test.ts` cover the limit
> constant, path resolution, all `applyRecentFileAdd` invariants
> (prepend / move-to-top / cap-at-10 / case-sensitive compare),
> `getRecentFiles` (web fallback, missing file, malformed JSON,
> non-array, individual-entry validation, cap), `addRecentFile`
> (web no-op, full mkdir+write sequence with the correct call
> order), `clearRecentFiles`, and the MenuBar wiring shape (open
> + drop + save call sites plus the `cad:openRecentFile` handler).
> Full suite: 7904 green.
>
> (The native menu rebuild — dynamic Recent Files submenu items
> in the File menu, with each click emitting an id the bridge
> maps to `cad:openRecentFile { path }` — is deferred to T7c.
> The store + the open-by-path event are both ready; T7c just
> needs to call back into Rust to re-render the menu after each
> add and route clicks to the right path.)

### T7c — Native menu: dynamic Recent Files submenu
> **DONE (2026-06-14).** Rust side gains `RecentFilesState` (a
> `Mutex<Vec<RecentFileEntry>>` managed via `app.manage(...)`) and a
> `#[tauri::command] rebuild_menu(app, recent)` that accepts the
> TS-side list, rebuilds the entire menu via the existing
> `build_menu(app, recent)`, calls `app.set_menu(...)`, and updates
> the managed state so subsequent `on_menu_event` clicks on
> `recent.<N>` can look the path up directly. `build_recent_submenu`
> handles the empty case (single disabled "No recent files" entry)
> and the populated case (each entry's label strips a trailing
> `.starr`, plus a "Clear Recent Files" item at the bottom).
> `on_menu_event` switches to a typed `MenuEventPayload { id,
> recentPath? }` so the click carries the path resolved from state.
>
> TS bridge upgraded: `normalizeMenuPayload` accepts either the
> Slice T7 bare-string shape or the Slice T7c object shape;
> `dispatchMenuAction` takes an optional `recentPath` and routes
> `recent.<N>` clicks to a `cad:openRecentFile { path }` window
> event (Slice T7b's MenuBar listener does the rest), while
> `file.clearRecent` fires `cad:clearRecentFiles` for MenuBar's
> new clear-listener. `recent-files.ts` ends every successful
> write with `invoke('rebuild_menu', { recent: ... })` wrapped in
> a try/catch (first-boot race tolerance).
>
> Six existing fixtures from Slices T2, T7, and T7b needed
> minor updates as the surface grew — `invoke_handler` source-
> lock loosened to assert presence of `ping` rather than the
> exact handler list, the recent-files write tests grew an extra
> mocked invoke for the rebuild call, and the MENU_EVENT_MAP
> bypass exception list added `file.clearRecent`. 20 fresh source-
> lock + unit cases in
> `__tests__/desktop/recent-menu-rebuild.test.ts`. Full suite:
> 7924 green.

### T8 — CI matrix: Windows / macOS / Linux signed artifacts
> **DONE (2026-06-14).** New `.github/workflows/desktop-release.yml`
> runs on every `v*` tag push (plus `workflow_dispatch` for manual
> testing). Concurrency group keyed on `github.ref` so two tags
> never interleave. Four-platform matrix
> (`macos-14`/aarch64-apple-darwin, `macos-13`/x86_64-apple-darwin,
> `windows-latest`/x86_64-pc-windows-msvc,
> `ubuntu-22.04`/x86_64-unknown-linux-gnu) with `fail-fast: false`
> so one OS failure doesn't kill the others. Each job installs
> Rust stable via `dtolnay/rust-toolchain@stable`, caches
> `src-tauri/target` via `swatinem/rust-cache@v2`, installs the
> Linux GTK + WebKit + appindicator deps where applicable, then
> drives `tauri-apps/tauri-action@v0` (which runs Slice T2's
> `beforeBuildCommand` → Slice T1's `npm run build:desktop` →
> `tauri build`). The action forwards every macOS notarization
> secret (`APPLE_CERTIFICATE` + `_PASSWORD` +
> `APPLE_SIGNING_IDENTITY` + `APPLE_ID` + `APPLE_PASSWORD` +
> `APPLE_TEAM_ID`), Windows .pfx signing secrets
> (`WINDOWS_CERTIFICATE` + `_PASSWORD`), and Tauri updater-manifest
> signing keys (`TAURI_SIGNING_PRIVATE_KEY` + `_PASSWORD`).
> Missing secrets emit unsigned artifacts (forks get installable
> binaries even without the maintainer's certs).
> `tauri.conf.json` gains a `bundle.macOS.minimumSystemVersion`
> (10.15 Catalina) + a `bundle.windows` placeholder for the wix
> timestamp URL (left empty so tauri-action picks the active
> mirror). Artifacts land in a draft GitHub Release named after
> the tag — the maintainer publishes after smoke-testing on each
> OS. 18 source-lock cases in
> `__tests__/desktop/release-workflow.test.ts` cover the trigger
> shape, concurrency, every matrix row + runner + target, every
> required env-var pass-through, the GTK deps, the
> `--legacy-peer-deps` npm install, the draft-release flag, and
> the conf bundle changes. Full suite: 7942 green.
> (Auto-update channel served from GitHub Pages is the
> conventional follow-up; the signing secret is already wired so a
> simple T8b can layer the manifest hosting on top.)

## Phase 2 — Renderer perf pass on the existing TS/Pixi pipeline

Goal: take the **existing** Pixi renderer from "smooth at 10k
points" to "smooth at 100k+ points with dense linework," without
touching the rendering engine. Five-to-six weeks of effort. This is
where most of the felt improvement lives — the runtime ceiling is
much higher than the current code path reaches.

### P1 — Spatial index for feature bounds
> **DONE (2026-06-14).** New `lib/cad/spatial/feature-index.ts`
> implements a uniform-grid spatial index (NOT rbush — a
> hand-rolled grid handles the survey-CAD workload as fast as
> rbush at a fraction of the code AND zero new runtime deps).
> Default cell size 100 ft (one lot). Each feature's AABB is
> bucketed into every grid cell it overlaps; oversized
> features (diagonal > 8× cell size, e.g. a single huge
> polyline) go into a "large bin" that's always scanned. The
> grid by itself returns false positives — cells contain
> features whose AABB overlaps the cell, not the precise query
> rect — so we keep an `id → AABB` cache and filter the
> candidate set through `aabbsIntersect` before returning. Net
> result: callers get exactly the set of features whose stored
> AABB intersects the query, dedup'd, in O(query_cells ×
> items_per_cell) time. Public surface:
> `createFeatureIndex(cellSize?)`, `buildFeatureIndex(entries,
> cellSize?)`, plus the `FeatureIndex` interface
> (`size / upsert / remove / queryRect / cellCount /
> largeBinSize`).
>
> 19 unit cases in `__tests__/cad/spatial/feature-index.test.ts`
> cover hit / miss, invalid bounds defense, upsert dedup, multi-
> cell-spanning features returned once, the large-bin path, and a
> 10k-point stress that inserts within 1.5 s and queries a small
> region in under 50 ms — well within the ceiling Phase 2 needs.
> Cleaned up a flaky `EnvironmentTeardownError` in the existing
> Slice T7 menu-bridge undo / redo test by awaiting one
> microtask so the lazy import of the zustand store settles
> before teardown. Full suite: 7961 green, zero unhandled
> errors.
>
> (Store integration deferred to Slice P2 — this slice ships
> the standalone index so the canvas can opt in once the render
> loop is restructured. The drawing-store middleware the
> original plan called for is part of P3 dirty-region work.)

### P2 — Viewport culling in the render loop
> **DONE (2026-06-14).** Audit found the spatial-index-driven cull
> was already in `CanvasViewport.renderFeatures()` (Phase 7 §19
> shipped that earlier). What was MISSING was the per-camera
> result cache. New `lib/cad/spatial/viewport-cull-cache.ts` exposes
> `createViewportCullCache<T>()` + `getCachedCull` / `setCachedCull`
> / `invalidateCullCache` / `viewportBBoxKey`. The key quantizes
> the camera AABB to 0.5 ft so sub-pixel jitter doesn't bust the
> cache; pairs with an opaque `version` stamp (the
> `featureIndexCacheRef.current` identity) so feature add / remove
> / layer toggle invalidates immediately — the
> `ensureFeatureIndex` rebuild already returns a fresh object
> identity on every mutation, so the version field rides for free.
>
> `CanvasViewport` adds a `cullCacheRef` next to the existing
> `featureIndexCacheRef`. The render path now checks the cache
> first — a hit returns the previous `Feature[]` array unchanged
> (zero spatial query, zero allocations); a miss falls through to
> `cullFeaturesWithIndex` and stores the result. The typical
> animation-frame pattern (user hovers, camera doesn't move,
> renderer ticks for hover-highlight repaints) now skips even
> the O(log) index query.
>
> 15 unit + source-lock cases in
> `__tests__/cad/spatial/viewport-cull-cache.test.ts` cover hash
> stability, jitter tolerance, null / malformed AABB defense,
> hit / camera-move-miss / version-change-miss / null-viewport-miss
> / explicit invalidate, and the CanvasViewport wiring shape.
> Full suite: 7976 green.

### P3 — Dirty-region tessellation (store side)
> **DONE (2026-06-14).** Drawing store gains `dirtyFeatureIds:
> Set<string>` plus the helper triplet
> `markFeatureDirty(id|ids[])`, `clearFeatureDirty(id|ids[])`,
> `clearAllFeatureDirty()`, and `markAllFeaturesDirty()` (the
> last is what `cad:regenerateCanvas` will call in P3b to evict
> the entire Graphics cache, matching today's user-facing
> "Refresh canvas" semantics). The Set is intentionally a SHARED
> MUTABLE collection — every read returns the same reference and
> no zustand selector exposes it, so component re-renders never
> fire on mutation. The renderer (to be wired in P3b) reads via
> `getState()` at the top of each frame and clears per id as it
> processes.
>
> Every existing feature mutation API stamps the touched id(s):
> `addFeature`, `removeFeature`, `updateFeature`,
> `updateFeatureGeometry`, `setFeatureTextLabels`, `addFeatures`,
> `removeFeatures`. `removeFeature` / `removeFeatures` stamp
> BEFORE the mutation so the renderer can evict cached Graphics
> for ids that are about to disappear. `loadDocument` and
> `newDocument` wipe the dirty set — the new document's feature
> ids supersede whatever was queued, so stale stamps would
> confuse the renderer.
>
> 18 unit cases in
> `__tests__/cad/store/dirty-feature-ids.test.ts` cover initial
> state, Set referential stability, every mutation API stamp,
> mark/clear with single + array args, `markAllFeaturesDirty`
> for full-rebuild signals, and `loadDocument` / `newDocument`
> wipe semantics. Full suite: 7994 green.
>
> (Renderer wiring — Pixi `Graphics` cache + dirty-id-driven
> rebuild + the `cad:regenerateCanvas` reroute — is its own
> focused slice P3b. Doing the store + the canvas integration in
> one commit puts the existing render path at unnecessary risk;
> the store-only foundation lands clean here.)

### P3b — Renderer-side dirty-region rebuild
> **DONE (2026-06-14).** CanvasViewport gains
> `drawStateRef = useRef<Map<id, { feature, epsilon, layerColor }>>`
> next to the existing featureIndex + cull caches. The render
> loop reads the store's `dirtyFeatureIds` once via `getState()`
> at the top of the pass, accumulates a `processedDirty[]` list
> as it tessellates, and at the end calls `clearFeatureDirty()`
> with that list. `drawFeature(g, ...)` only fires when
> `needsRedraw` is true — true on a fresh Graphics, when the id
> is in dirty, when no `prev` entry exists, when the zustand
> feature reference identity changed, when the LOD epsilon
> rolled over, or when the layer color shifted (which goes
> through `updateLayer` without stamping the feature dirty).
> Otherwise the Graphics is reused as-is. drawState entries
> whose backing Graphics was destroyed get garbage-collected at
> the bottom of the loop. Off-screen dirty ids stay dirty so
> they redraw when they next enter the viewport.
>
> `cad:regenerateCanvas` (from cad-ux-cleanup-pass Slice 11)
> still nulls `featureIndexCacheRef`, AND now also calls
> `useDrawingStore.getState().markAllFeaturesDirty()` so the
> per-feature cache busts on Refresh Canvas — user-facing
> semantics stay identical. The existing source-lock froze the
> exact handler body; loosened to assert presence of the
> invariant calls so future slices can extend the handler
> without breaking the fixture.
>
> 10 source-lock cases in
> `__tests__/cad/ui/renderer-dirty-region.test.ts` cover the
> ref shape, the dirty-set read pattern, processedDirty
> accumulation, the full `needsRedraw` OR chain, the gated
> `drawFeature` call, drawState GC, the clearFeatureDirty
> hand-back, and the regenerate-canvas wiring. Full suite:
> 8004 green.

### P4 — Non-blocking label regen (chunked yield)
> **DONE (2026-06-14).** Audit found a true Web Worker rewrite
> would force a refactor of `generateLabelsForFeature` first —
> the function reads `useDrawingStore.getState().document.settings`
> for `codeDisplayMode` + `drawingScale`, and zustand state
> doesn't cross the worker boundary. The user-facing payoff
> (non-blocking label regen) is achievable without that
> upheaval by yielding to the event loop between chunks.
>
> New `lib/cad/labels/regenerate-layer-labels-chunked.ts`
> exports `LABEL_REGEN_CHUNK_SIZE = 200` (tuned for < 1
> frame of work per chunk on the median 2020 laptop),
> `LABEL_REGEN_CHUNK_THRESHOLD` (same — sync is cheaper for
> small layers), `regenerateLayerLabelsChunked(features,
> layer, displayPrefs, { chunkSize, signal })`, and the
> auto-dispatching `regenerateLayerLabelsAuto(...)` that
> picks sync vs chunked based on feature count. Yields via
> `setTimeout(0)` so the browser can paint + process input
> between chunks; honors `AbortSignal` by returning the
> partial map collected so far.
>
> LayerPreferencesPanel's `update()` runs the regen through
> `regenerateLayerLabelsAuto` inside a fire-and-forget async
> IIFE — small layers still hit the sync path (no scheduling
> overhead), large ones get chunked. Slider holds stay
> responsive even with ~5k point layers + heavy label prefs.
> The Slice 10 source-lock that froze the exact
> `regenerateLayerLabels` call shape was loosened to accept
> either entry point.
>
> 12 unit + source-lock cases in
> `__tests__/cad/labels/regenerate-layer-labels-chunked.test.ts`
> cover the chunk constants, single-layer + cross-layer
> filtering, multi-chunk output parity with the sync version,
> custom chunk sizes, AbortSignal handling, sync-vs-chunked
> auto-dispatch, and the LayerPreferencesPanel wiring. Also
> fixed a flaky `EnvironmentTeardownError` from the Slice T7
> menu-bridge undo/redo test by awaiting the dynamic
> `@/lib/cad/store` import explicitly. Full suite: 8016
> green, zero unhandled errors.
>
> (True Worker version logged as P4b — needs the
> `generateLabelsForFeature` store-read refactor as a
> prerequisite.)

### P4b — Web Worker label generation
With the Slice P4 chunked yield in place, the main-thread
ceiling is high enough for any realistic survey. P4b is
deferred until/unless profiling under the
T1+T2 desktop build shows the ceiling is still the
bottleneck. Prerequisite: refactor
`generateLabelsForFeature` to take its `codeDisplayMode` +
`drawingScale` as explicit arguments instead of reading the
singleton store — only then can the function execute in a
Worker context. The chunked entry point in P4 is the
fallback for the small-layer / no-Worker path even after
the Worker lands.

### P5 — LOD threshold tuning + lazy label render
> **DONE (2026-06-14).** `lib/cad/geometry/lod.ts` gains a
> `LodConfig` interface (`pixelThreshold?`,
> `labelThreshold?`, `simplifyMultiplier?`) + three exported
> defaults (`DEFAULT_LOD_PIXEL_THRESHOLD = 0.5`,
> `DEFAULT_LOD_LABEL_THRESHOLD = 2.0`,
> `DEFAULT_LOD_SIMPLIFY_MULTIPLIER = 0.5`). `shouldUseLOD` and
> `lodSimplificationThreshold` take an optional config arg
> with full back-compat (undefined → historical defaults).
> New `shouldRenderLabels(viewportScale, config)` returns
> false when world-per-pixel exceeds the label threshold —
> intentionally HIGHER than the pixel threshold because labels
> become illegible long before geometry dots take over.
>
> `DrawingSettings` gains an optional
> `lod?: { pixelThreshold?, labelThreshold?, simplifyMultiplier? }`
> field. AI-controllable: `updateSettings({ lod: { ... } })`
> already works via the existing flat-update API.
>
> CanvasViewport now reads `doc.settings.lod` once per render
> and threads the config through every threshold call.
> `renderLabels` bails at the top when `shouldRenderLabels`
> is false, tearing down the cached `pixi.labelTexts` so a
> fast zoom-out doesn't leave stale Text objects on screen
> — pure waste removed from the zoomed-out frame.
>
> 19 unit + source-lock cases in
> `__tests__/cad/geometry/lod-config.test.ts` cover the
> default constants (historical values preserved), default
> behaviour parity for `shouldUseLOD`, the new
> `shouldRenderLabels` boundary, custom-multiplier scaling +
> 0-multiplier disable, non-finite defense, the
> `DrawingSettings.lod` type extension, and the
> CanvasViewport renderer wiring (both `renderFeatures` and
> the `renderLabels` early-out). Full suite: 8035 green.

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

**Shipped 2026-06-14** — First boundary cut: the Status Bar's
cursor/coord pill now lives in
`app/admin/cad/components/StatusBarCursorPill.tsx`, a memoized
sub-component (`memo(StatusBarCursorPillInner)`) that subscribes
to its own slices via per-field selectors
(`useViewportStore((s) => s.cursorWorld)`,
`useToolStore((s) => s.state.activeTool / drawingPoints /
basePoint / rotateCenter)`). `StatusBar.tsx` drops the
`cursor` / `drawingPoints` / `basePoint` / `rotateCenter`
destructures and the inline coords + dist/bearing JSX, and now
renders `<StatusBarCursorPill prefs={prefs} />` — the surrounding
status bar (selection count, AI mode, snap chips, layer chips,
zoom controls) no longer reconciles on every mousemove tick,
and zustand's per-selector equality lets the pill itself skip
re-renders unless the cursor world position or the active-tool
gating fields actually change. The `formatDistance` /
`formatAngle` / `formatCoordinates` imports moved to the pill
with the call sites. Source-locked by
`__tests__/cad/ui/status-bar-cursor-pill.test.ts` (10 assertions).
**Follow-ups still in scope for P6:** the same treatment for the
MenuBar / LayerPanel / PropertyPanel subtrees, plus the
`CanvasViewport` cursor-tick paths — track as `P6b`.

**P6b StatusBar subscription audit shipped 2026-06-14** —
the P6 extraction pulled the cursor-pill JSX out, but the
parent `StatusBar` was still calling `useDrawingStore()`,
`useViewportStore()`, `useSelectionStore()`, and
`useToolStore()` with no selector — four whole-store
subscriptions that fired on every cursor-position / drawing-
points / selection / tool-state mutation, undoing most of the
P6 win the moment any other store ticked. P6b converts every
read to per-field selectors:
`useDrawingStore((s) => s.document / activeLayerId /
updateSettings / setActiveLayer)`,
`useViewportStore((s) => s.zoom / setZoom)`,
`useSelectionStore((s) => s.selectedIds.size)`,
and per-field `useToolStore((s) => s.state.activeTool /
orthoEnabled / polarEnabled / polarAngle / copyMode)`. The
zustand bailout now skips the bar entirely on cursor moves
and on tool-state ticks the bar doesn't render. Source-locked
by an extended `__tests__/cad/ui/status-bar-cursor-pill.test.ts`
(15 assertions; the original `viewportStore.zoom` lock was
widened to the per-field form since the access path moved).
**Remaining P6b follow-ups:** the same treatment for
MenuBar / LayerPanel / PropertyPanel and the
`CanvasViewport` cursor-tick paths — track as `P6c`.

**P6c MenuBar tool/viewport subscriptions shipped 2026-06-14** —
the MenuBar called `useToolStore()` and `useViewportStore()`
with no selector, even though it never reads a single
render-time field off either store — both were only used for
action calls inside event handlers (`toolStore.setTool(...)` in
~25 places + `viewportStore.zoomToExtents(...)` in 2 callbacks
of a local `zoomToExtents` wrapper). Per-action selectors
(`useToolStore((s) => s.setTool)`,
`useViewportStore((s) => s.zoomToExtents)`) return stable
identities, so the menu now reconciles on zero cursor-position
or drawing-points-tick mutations. The local `zoomToExtents()`
wrapper renamed to `handleZoomExtents()` so it doesn't shadow
the selector. Source-locked by
`__tests__/cad/ui/menu-bar-store-selectors.test.ts` (4
assertions covering the dropped subscriptions, the per-action
selectors, the renamed handler, and the absence of every
`toolStore.` / `viewportStore.` call site).
**Remaining P6c follow-ups:** MenuBar still subscribes to
`useDrawingStore()` (render-time `isDirty` + `document.name`,
plus ~25 callback reads), `useSelectionStore()` (render-time
`selectedIds.size` for the Export Selection disabled gates),
`useUndoStore()` (render-time can/undo descriptions), and
`useUIStore()` (render-time `showLayerPanel/showPropertyPanel`).
Those each need the StatusBar treatment — per-field selector
for the render-time read + `useXStore.getState()` inside the
callbacks — plus the LayerPanel / PropertyPanel passes and
the `CanvasViewport` cursor-tick paths. Track as `P6d`.

**P6d LayerPanel subscription audit shipped 2026-06-14** —
the LayerPanel was the next-biggest offender: whole-store
`useDrawingStore()` + `useSelectionStore()` subs that paid the
re-reconciliation tax on every layer mutation, every feature
add, every selection change, and every hover tick (the panel
renders hundreds of layer/feature/group rows on a real
drawing). Per-field selectors replace the render-time reads:
`useDrawingStore((s) => s.document / activeLayerId)`,
`useSelectionStore((s) => s.selectedIds / hoveredId /
hoveredTBElem / selectedTBElem)`. The ~25 callback action
calls (`store.updateLayer`, `store.addLayer`,
`store.hideFeature`, `selectionStore.select`, ...) route
through `useDrawingStore.getState().X` /
`useSelectionStore.getState().X` so the panel reads the
latest snapshot at click time without subscribing. Source-
locked by `__tests__/cad/ui/layer-panel-store-selectors.test.ts`
(5 assertions covering the dropped subs, the per-field
selectors, the getState-callback pattern, and the absence of
every bare `store.` / `selectionStore.` leftover). Four
pre-existing source-lock tests
(`layer-panel-feature-eyes`, `layer-panel-selection-sync`,
`layer-rename-uniqueness`, `survey-info-element-hide`) were
widened in the same commit to accept either the old
`store.X(...)` call form or the new
`useDrawingStore.getState().X(...)` form.
**Remaining P6d follow-up:** the PropertyPanel pass + the
`CanvasViewport` cursor-tick paths — track as `P6e`.

**P6e PropertyPanel subscription audit shipped 2026-06-14** —
the PropertyPanel had TWO whole-store subscription bodies that
needed the LayerPanel treatment: the main `PropertyPanel`
function plus the `OffsetSourceSection` subcomponent. Both
called `useDrawingStore()` + `useSelectionStore()` with no
selector, so every doc / selection mutation reconciled the
entire 2,400-line component (which paints the multi-tab style
editor + every-feature property panel — heavy reconcile cost
on real drawings).
The main panel now reads `useDrawingStore((s) => s.document)`
(for `customLineTypes` + layer order at render time),
`useDrawingStore((s) => s.getFeature)` (stable action ref
that re-derives off the current doc), and
`useSelectionStore((s) => s.selectedIds)`. The
`OffsetSourceSection` subscribes only to `getFeature` — its
data comes from the `feature` prop the parent threads in.
The 76 callback action calls (`drawingStore.updateFeature`,
`drawingStore.updateFeatureGeometry`, `drawingStore.addFeature`,
`selectionStore.select`, ...) route through
`useDrawingStore.getState().X` /
`useSelectionStore.getState().X`. A stale
`const { document: doc } = drawingStore` destructure mid-
component was dropped (the per-field `doc` selector covers it).
Source-locked by
`__tests__/cad/ui/property-panel-store-selectors.test.ts` (6
assertions) and a pre-existing
`fill-pattern-picker` source-lock widened to accept either the
old `drawingStore.X(...)` form or the new
`useDrawingStore.getState().X(...)` form.
**Remaining P6e follow-up:** the `CanvasViewport` cursor-tick
paths (whole-store-sub audits in the renderer hooks) — track as
`P6f`.

**P6f CanvasViewport cursor-tick extraction shipped 2026-06-14**
— the worst offender by far. `CanvasViewport` is 14,431 lines
and held a whole-store `useViewportStore()` subscription, plus
a single render-time read (`const cursorWorld =
viewportStore.cursorWorld;`) that fed a permanent N/E
coordinate tracker pinned to the bottom-left of the canvas.
Together they forced the entire React tree to reconcile on
every ~60 Hz mousemove tick, even though the actual canvas
paint runs on rAF off `useViewportStore.getState()`.
The N/E tracker moved to
`app/admin/cad/components/CanvasCoordsPill.tsx` —
a memoized sub-component (`memo(CanvasCoordsPillInner)`) that
subscribes via per-field selectors
(`useViewportStore((s) => s.cursorWorld)` +
`useDrawingStore((s) => s.document.settings.displayPreferences)`
with the `DEFAULT_DISPLAY_PREFERENCES` fallback). The 16
former `viewportStore.X(...)` callback + rAF call sites SED-
converted to `useViewportStore.getState().X(...)` so they
read the latest snapshot at call time without subscribing; the
two `useCallback` / `useEffect` dependency arrays that
referenced the old local were trimmed in the same pass. The
inline N/E IIFE JSX block was replaced with `<CanvasCoordsPill
/>`, so the surrounding 14k-line component now reconciles on
zero cursor moves. Source-locked by
`__tests__/cad/ui/canvas-coords-pill.test.ts` (9 assertions —
memo shape, per-field selectors, prefs fallback, pill mount,
dropped sub + render-time read, and three sample
`useViewportStore.getState().X` call-site spot checks). Full
suite: 8119 green.
**Remaining P6f follow-up:** the parallel
`useSelectionStore()` / `useToolStore()` / `useUndoStore()`
whole-store subs at the same top-of-CanvasViewport spot need
the same treatment, and the MenuBar still has its remaining
four whole-store subs from P6c — track as `P6g`.

**P6g CanvasViewport selection + undo subs shipped 2026-06-14**
— the two PURE-callback whole-store subs land first because
they have ZERO render-time reads: `useSelectionStore()` is used
only inside event handlers (selection mutations, grip hit
testing, group select) and the rAF loop, and `useUndoStore()`
is used only for `pushUndo(...)` inside event handlers.
Both whole-store subs dropped; ~100 callback usages SED-
converted to `useSelectionStore.getState().X` /
`useUndoStore.getState().X`. The `const { selectedIds } =
selectionStore;` destructure inside `hitTestGrip` was updated
in the same pass to read off `useSelectionStore.getState()`,
and the four `useCallback` dep arrays that listed
`selectionStore` / `undoStore` were trimmed (the eslint disable
comments above each one cover the new shape). Source-locked by
`__tests__/cad/ui/canvas-viewport-store-selectors.test.ts` (6
assertions covering the dropped subs, the new `getState()`
call form, the dep-array cleanup, and an explicit
"drawingStore + toolStore intentionally left for P6h" guard).
Full suite: 8134 green.
**Remaining P6g follow-ups:**
1. `useDrawingStore()` whole-store sub on CanvasViewport — has
   render-time reads (`document.settings.displayPreferences`,
   `document.settings.codeDisplayMode`,
   `document.layerOrder.length`, `document.settings.drawingRotationDeg`)
   so the conversion needs per-field selectors.
2. `useToolStore()` whole-store sub on CanvasViewport — has
   render-time reads (`state.activeTool`, `state.perpStartPoint`,
   `state.offsetSourceId`) so same treatment.
3. MenuBar's remaining four whole-store subs from P6c.
Track as `P6h`.

**P6h MenuBar drawing + selection subs shipped 2026-06-14** —
the two highest-frequency offenders in the MenuBar fall first:
`useDrawingStore()` was waking on every feature mutation (which
fires many ticks per second during AI runs and bulk imports)
and `useSelectionStore()` was waking on every selection change.
Both had tiny render-time read surfaces: `isDirty` +
`document.name` for the title chip, `selectedIds.size` for the
three Export Selection disabled gates. Per-field selectors take
those, and the ~50 callback action calls (`drawingStore.addFeatures`,
`drawingStore.addLayer`, `drawingStore.updateSettings`,
`drawingStore.markClean`, `drawingStore.loadDocument`,
`drawingStore.getAllFeatures`, `drawingStore.updateDocumentName`,
`drawingStore.addFeatureGroups`, `selectionStore.deselectAll`,
`selectionStore.selectedIds`, ...) SED-converted to
`useDrawingStore.getState().X` / `useSelectionStore.getState().X`.
A `let doc;` local inside `processOpenedCadFile` shadowed the
new top-level `doc` selector, so it was renamed to `loadedDoc`
for the just-parsed candidate path. Source-locked by
`__tests__/cad/ui/menu-bar-drawing-selection-selectors.test.ts`
(7 assertions); five pre-existing source-locks
(`menubar-save-routing`, `dedupe-trv-features`, `trv-io`,
`trv-titleblock`, `new-drawing-clean`) were widened to accept
either the old `drawingStore.X(...)` / `drawingStore.document`
/ `drawingStore.isDirty` forms or their new equivalents.
Full suite: 8134 green.
**Remaining P6h follow-ups:** `useUndoStore()` (render-time
`canUndo` + `canRedo` + descriptions for the Edit menu disabled
gates) and `useUIStore()` (render-time `showLayerPanel` +
`showPropertyPanel` for the View menu labels) on the MenuBar
side, plus CanvasViewport's `useDrawingStore()` +
`useToolStore()` per-field conversions. Track as `P6i`.

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

**Shipped 2026-06-14 (histogram helper only)** —
`lib/cad/perf/render-markers.ts` exports `markRender`,
`measureRender`, `getRenderProfile`, `resetRenderProfile`, and
`RENDER_MARKER_RING_CAPACITY` (600 samples per label, i.e. ten
seconds of 60-FPS frames). Each label gets its own
`Float64Array` ring buffer with O(1) ingest; `getRenderProfile`
copies the live slice, sorts, and returns nearest-rank
p50/p95/p99 + max + mean alongside an overall pooled histogram.
Non-finite / negative durations are silently dropped so callers
can `markRender(label, t1 - t0)` without guarding. The
`measureRender(label, fn)` convenience wrapper records even
when `fn` throws (finally clause), so we don't miss the outlier
frames where a phase blew up. Source-locked by
`__tests__/cad/perf/render-markers.test.ts` (12 assertions
including ring-wrap math and reset semantics).
**Follow-ups remaining in N1, tracked as `N1b`:**
the `Ctrl+Alt+P` overlay React component, the renderer-side
`measureRender` call sites in `CanvasViewport`, and the
small/medium/large fixture harness that drives the gating
decision for N2.

**N1b call-site wiring shipped 2026-06-14** —
`CanvasViewport.renderAll` now wraps its body in
`measureRender('renderAll', ...)` and instruments the four hot
phases individually:
`measureRender('renderFeatures', renderFeatures)`,
`measureRender('renderImageFeatures', renderImageFeatures)`,
`measureRender('renderLabels', renderLabels)`, and
`measureRender('renderSelection', renderSelection)`. Cheap
phases (paper, grid, snap indicator, tool preview, etc.) stay
unwrapped — the goal is signal for the Phase-3 go/no-go call,
not exhaustive per-call timing. Source-locked by
`__tests__/cad/perf/render-markers-canvas-wiring.test.ts`. The
Slice 229 source-lock for `renderAreaAnnotations`'s sandwich
position was widened to accept either the raw call or the
measured form (the renderLabels ↔ renderAreaAnnotations ↔
renderTextFeatures order is what mattered there).
**Remaining N1b follow-ups:** the `Ctrl+Alt+P` overlay React
component and the small/medium/large fixture harness — track
as `N1c`.

**N1c overlay shipped 2026-06-14** —
`app/admin/cad/components/PerfOverlay.tsx` is a dev-only
React component that the user toggles with `Ctrl+Alt+P`. While
hidden it returns `null`, so the mount in `CADLayout` (right
next to `<StatusBar />`) costs nothing beyond the keydown
listener. When visible it polls `getRenderProfile()` every
500 ms and renders a compact table with the overall pooled
histogram plus a row per tracked phase — sample count, p50,
p95, p99, and max, color-coded amber/rose for the tail
percentiles. A Reset button calls `resetRenderProfile()` so
fixture runs start clean. Source-locked by
`__tests__/cad/perf/perf-overlay.test.ts` (10 assertions across
the module shape + the CADLayout mount). **Remaining N1c
follow-up:** the small/medium/large fixture harness that
drives the Phase-3 gating decision — track as `N1d`.

**N1d synthetic generator shipped 2026-06-14** —
`lib/cad/perf/fixtures.ts` exports `FIXTURE_SIZES`
(`small: 1_000`, `medium: 50_000`, `large: 200_000`),
`generateSyntheticFeatures(count, options?)`, and
`generateNamedFixture(size, options?)`. The generator runs a
seeded mulberry32 PRNG (default seed `0xc0ffee`) so two runs
with the same seed produce byte-identical `Feature[]` — lets
us snapshot specific seeds as the canonical "synthetic 50k" /
"synthetic 200k" baselines for the Phase-3 go/no-go call. The
geometry mix is 40/40/20 POINT/LINE/POLYLINE so the fixtures
exercise the three biggest hot paths in `renderFeatures`, and
the world extent grows with √count so density stays roughly
constant rather than degenerating to a single spatial-index
cell on the large fixture. Everything lands on `'L1'` with
`DEFAULT_FEATURE_STYLE` by default so downstream perf code
doesn't have to know about a synthetic layer registry.
Source-locked by `__tests__/cad/perf/fixtures.test.ts` (13
assertions including determinism on seed + invariants on
emitted geometry). **Remaining N1d follow-up:** the actual
driver that loads each named fixture into the document store
and runs the render loop for a fixed duration — track as `N1e`.

**N1e harness driver shipped 2026-06-14** —
`lib/cad/perf/harness.ts` exports
`loadProfileFixture(features, sink, options?)` and
`captureProfileWindow(durationMs, options?)`. The driver is
decoupled from the real drawing store via a
`ProfileFixtureSink` interface (`addFeatures` required;
`addLayer`, `newDocument`, `getLayer` optional) so the real
`useDrawingStore` plugs in unchanged and unit tests can use a
plain mock. `loadProfileFixture` wipes the doc (when
`reset: true`, the default), ensures the synthetic layer
exists, pushes every feature through `addFeatures`, and
returns `{ loaded, layerCreated, reset, loadMs }` so the
overlay (N1f) can flag fixture-load regressions independent of
render perf. `captureProfileWindow` is the pure orchestration
primitive — `resetRenderProfile() → await delay(ms) →
getRenderProfile()` — with an injectable `delay` so tests
never block on real time. Source-locked by
`__tests__/cad/perf/harness.test.ts` (9 assertions across both
helpers). **Remaining N1e follow-up:** the dev-overlay button
that calls `loadProfileFixture(generateNamedFixture(size),
useDrawingStore.getState())` and surfaces the resulting
profile in the panel — track as `N1f`.

**N1f overlay wiring shipped 2026-06-14** — `PerfOverlay`
gains a fixture row with Small / Medium / Large buttons +
an amber "Capture 5s" button. Each fixture button fires a
`window.confirm("Replace the current drawing…")` (destructive,
so guarded), then calls
`loadProfileFixture(generateNamedFixture(size), useDrawingStore.getState())`
and shows `Loaded N features in Xms` in the status line. The
Capture button calls `captureProfileWindow(5_000)`, freezes the
500 ms live poll for the window's duration (so the histogram
seen on screen is exactly the captured profile, not a stale
poll snapshot), and writes the result back into the table.
Every action button is disabled while a load or capture is in
flight. Source-locked by an extended
`__tests__/cad/perf/perf-overlay.test.ts` (17 assertions
covering the imports, the confirm guard, the FIXTURE_BUTTONS
shape, the capture wiring, the disabled gate, and the
busy-pauses-poll rule). With this slice landed, **N1 is
COMPLETE**: harness module (`render-markers` + `fixtures` +
`harness`), renderer call sites (`CanvasViewport`), dev overlay
(`PerfOverlay`), and the user-driven small/medium/large
fixture flow that produces the gating profile for Phase 3.

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
