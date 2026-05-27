# CAD Editing, Layers, Points, Preferences & Menus — Self-Updating Audit

Status: **in progress** · Owner: CAD/UX · Opened: 2026-05-27 01:37 CDT
Time-box: **work until 6:00 AM CDT (06:00), 2026-05-27.** On every resume:
check the clock (`TZ="America/Chicago" date "+%H:%M"`). If ≥ 06:00 CDT →
§7 Finalization and STOP. Otherwise keep working the §5 backlog.

---

## 0. How to use this document (READ FIRST, EVERY RESUME)

Self-updating audit loop. The Stop hook
(`.claude/hooks/continue-until-planning-done.sh`) keeps the session
running while this file is in `docs/planning/in-progress/`. Moving it to
`completed/` is the clean stop.

On EVERY resume:
1. `TZ="America/Chicago" date "+%H:%M"` — if ≥ 06:00 → §7, STOP.
2. Read the Audit Log (§6) bottom entry for where the last slice stopped.
3. Pick the single highest-priority open `[ ]` in §5.
4. Run one audit cycle (§3) on that one target — small slice, one commit.
5. Append a dated §6 entry. Add newly-found targets as `[ ]`.
6. Commit + push. The hook resumes the loop.

Prime directives: never leave the tree broken (`npx tsc --noEmit` + lint
touched files before every commit; relevant vitest CAD suites green).
Keep `claude-opus-4-7[1m]` out of every commit/artifact. Develop + push
only to `claude/nice-bardeen-YpOrt`. Verify in the Playwright harness
(`/cad-harness`) + screenshot where it makes sense. Commit messages end
with the session URL.

---

## 3. Audit cycle (per slice)

inspect → implement small → `npx tsc --noEmit` + eslint touched files →
unit test (vitest) where logic is added → live-verify in harness +
screenshot where feasible → record in §6 → commit + push.

---

## 5. Backlog (top = next)

### Concrete user requests (this engagement)
- [x] **A. Suppress the native browser right-click menu across the CAD app.**
  DONE — `onContextMenu` on the CAD shell root preventDefaults everywhere
  except real text fields (input/textarea/contenteditable, which keep native
  copy/paste). Verified: contextmenu on the canvas is prevented, on an input
  is not (`native-contextmenu.spec`).
- [x] **B. Filter… field formatting in the Point Data Viewer / Point table.**
  Fix the reported formatting issue (alignment/padding/contrast). Then sweep
  for other formatting glitches (misaligned inputs, clipped text, dark-on-dark).
- [x] **C. Line-type symbols render ON TOP of the line.** A dashed line with an
  "O"/glyph should not have dashes crossing through the symbol — give the
  symbol a slight opaque (white) backing so the line never shows through it.
- [x] **D. Infinity (and oriented) line-type symbols tilt with the line.** Rotate
  inline symbols so their long axis follows the segment direction.
- [~] **E. Media attachments for points / lines / shapes / layers** (LARGE —
  DEFERRED-with-design for the unattended loop). Rationale: its core value
  (file upload, blob persistence, video playback, zoom viewer) can't be
  verified with confidence in this headless Playwright harness, and it needs
  a storage-infra decision best made attended. Concrete design to build next:
  • Store `lib/cad/media/media-db.ts` IndexedDB ('starr-cad-media'): `blobs`
    (mediaId→Blob) + `meta` (mediaId→MediaItem{id,ownerId,ownerKind,kind,
    name,mime,size,thumbnail?,addedAt}). `useMediaStore` keeps a byOwner
    index (hydrated from meta) so the UI can gate synchronously.
  • UI: FeatureContextMenu + PointDataViewer right-click "Add media…" /
    "View media…" (only when hasMedia); Properties panel thumbnail strip; a
    MediaViewer modal (image pan/zoom + <video> controls). Cloud upload
    (Supabase bucket like project-image.ts) is a follow-up.
- [ ] **F. Import/Export deep review** (original ask): audit CSV/PNEZD/DXF/
  LandXML/GeoJSON readers + writers + the wizard for bugs/edge cases beyond
  the reset fix already shipped.

### Ongoing audit themes (open-ended — keep finding + fixing)
- [ ] **G. Editing** — selection, grips, move/rotate/scale, undo/redo integrity.
- [ ] **H. Layer control** — visibility/lock/isolate, active-layer safety, panel UX.
- [ ] **I. Point control** — viewer, naming, codes, derived points.
- [ ] **J. Preferences** — settings dialog, display prefs, persistence.
- [ ] **K. Menu control** — menubar/submenus, command bar, context menus.

Newly-discovered audit targets get appended here as `[ ]`.

---

## 6. Audit Log

- 2026-05-27 01:37 CDT — Opened. Already shipped earlier this session (pre-doc):
  import-wizard reset-on-open + cad:openImport; point name/code label order
  (name drawn last → on top); block drawing on a hidden active layer; right-
  click menu dismissal overlays (title-block + layer/panel menus). Backlog
  seeded above. Next: A (suppress native right-click menu).

---

## 7. Finalization (clock ≥ 06:00 CDT)

1. Tree green: `npx tsc --noEmit` clean, lint clean on touched files,
   vitest CAD suites green.
2. Every open `[ ]` left unfinished gets a one-line status/deferral note.
3. Flip Status (§top) to **completed**, add a closing §6 entry.
4. Repoint any `// Spec:` refs (`grep -rln` the in-progress path) to
   `completed/`, then `git mv` this doc to `docs/planning/completed/`.
5. Commit + push. in-progress/ empties; the hook routes onward.

- 2026-05-27 01:5x CDT — A done (native right-click suppression, verified).
  Added a `cad:togglePointTable` event (consistency + testability). B: cleaned
  up the Points panel Filter field — fixed height (h-7), shrink-0, placeholder
  contrast, pointer-events-none icon, aligned clear button. Next: C (line-type
  symbols render on top of the line with an opaque backing).
- 2026-05-27 02:0x CDT — C + D done. C: inline line-type symbols now get an
  opaque paper-white backing disc drawn before the glyph, so dashes/lines no
  longer show through (`drawSymbolBacking`). D: the DASH_INFINITY line type's
  symbol now uses symbolRotation ALONG_LINE so the ∞ tilts with the segment.
  tsc + eslint clean; 20 linetype tests pass. Visual confirmation constrained
  (needs a styled line in the harness). Next: F (import/export review) or the
  ongoing audit themes; E (media) is the large staged item.
- 2026-05-27 02:1x CDT — E deferred-with-design (large; upload/video/blob not
  verifiable headless). Formatting sweep: CalcPointDialog's 9 inputs/selects
  used `bg-white dark:bg-gray-800` with no text color (latent dark-mode
  dark-on-dark + inconsistent) — added explicit `text-gray-900
  dark:text-gray-100`. Swept all CAD dialogs; no other adaptive inputs lack a
  text color. Next: F (import/export review) / audit themes.
- 2026-05-27 02:2x CDT — F (import): swapping the file mid-wizard left the
  prior parse result (importResult/previewRows) in place — stale points from
  the old file could leak. `setFile` now clears previewRows + importResult,
  and the dialog drops its local result when `importStore.file` changes.
  import-reset spec still passes. Next: more F / audit themes G–K.
- 2026-05-27 02:3x CDT — H (layers): drawing on a LOCKED active layer is now
  blocked with a warning + hint (companion to the hidden-layer guard).
  Locked-layer features were already unselectable; this closes the
  draw-new-geometry gap. `locked-layer-draw.spec` passes. Next: audit G/I/J/K.
- 2026-05-27 02:4x CDT — K (menus) ROOT-CAUSE FIX for "right-click menus
  sometimes don't dismiss": FeatureContextMenu's outside-click listener was
  attached via requestAnimationFrame inside an effect that depended on
  onClose. The parent (CanvasViewport) recreates onClose every render
  (cursor-coord updates fire constantly), so each re-render cancelled the
  pending rAF before the listener attached — the menu only sometimes had a
  working dismiss listener. Now attaches once on mount via an onClose ref;
  also listens for mousedown + pointerdown. `canvas-contextmenu.spec` passes
  (menu opens, native menu suppressed, dismisses on outside click). Added a
  `cad:togglePointTable`-style verification. Next: continue audit.
- 2026-05-27 02:5x CDT — Same dismiss-race fixed in PickModeContextMenu
  (deferred mousedown listener in an effect depending on onClose). Now
  mount-once via onClose ref. Swept all CAD components — no other
  `[onClose]`-dep + deferred-listener popups remain. tsc + eslint clean.
- 2026-05-27 03:0x CDT — K/G: cross-referenced all `cad:` event dispatches vs
  listeners — found 7 keyboard shortcuts dispatching events with NO listener
  (dead): zoom in/out/selection, select-all, toggle-ortho, focus-command-bar,
  print. Wired them: CanvasViewport handles zoomIn/zoomOut/zoomSelection/
  selectAll/toggleOrtho; CommandBar focuses its input on focusCommandBar;
  CADLayout now mounts PrintDialog (previously never rendered) + listens for
  openPrintDialog. `wired-shortcuts.spec` verifies select-all + print.
  tsc + eslint clean. Next: continue audit.
- 2026-05-27 03:1x CDT — K: MenuBar callback props all wired (cross-checked
  vs CADLayout). CommandBar had a duplicate `case 'scale'/'sc'` (second was
  unreachable dead code) — removed. tsc + eslint clean.
- 2026-05-27 03:2x CDT — Core-flow regression batch (shell, toolbar-tools,
  status-toggles, delete-undo) all pass after the loop's changes. Added typed
  command-bar commands for the newly-wired actions: `select all`/`sa`,
  `zoom in`/`zi`, `zoom out`/`zo`, `print`. Verified `select all` selects all
  (`command-selectall.spec`). Next: continue audit (J preferences / I points).
