# UX Polish Plan — STARR CAD · STARR RECON · STARR Mobile

> **Status:** in-progress · **Owner:** Jacob Maddux · **Created:** 2026-05-12
>
> Cross-cutting UX assessment of the three customer-facing surfaces. Findings come from a parallel read of `app/admin/cad/` (65 components), `app/admin/research/` (64 components / sub-routes), and `mobile/` (68 screens/components). Every item below references at least one `file:line` so a future slice can land it without re-scoping.

---

## 1. Cross-cutting themes (all three apps)

The same five patterns surfaced everywhere. Fixing them once at the shared layer kills the largest cohesion debts across the codebase.

### 1.1 Multi-theme drift
Every app has at least two parallel design systems in flight. The biggest single perceived-polish jump is unifying each app's theme.

- [ ] **CAD**: dark Tailwind shell (`MenuBar`, `StatusBar`, `LayerPanel`, `AICopilotSidebar`) vs. light inline-style Phase-7 surfaces (`DrawingChatPanel.tsx:174-280`, `AISidebar.tsx:646+`, `CompletenessPanel.tsx:227-240`, `ElementExplanationPopup.tsx:462-690`, `RPLSSubmissionDialog`, `RPLSReviewModePanel`, `QuestionDialog`, `ReviewQueuePanel`, `SealHashBanner`, `SealImageUploader`, `SurveyDescriptionPanel`, `RecentRecoveriesDialog`, `TooltipProvider`). Pick dark + migrate the 14 light-theme surfaces, or do the reverse — *not* both.
- [ ] **RECON**: four themes coexist — BEM light (`page.tsx`, `[projectId]/page.tsx` via `AdminResearch.css`), Tailwind dark (`library/page.tsx:166-167`, `billing/page.tsx:166`, `[projectId]/documents/page.tsx:211`, `[projectId]/boundary/page.tsx:255`), dark slate Easements cards inside the light shell (`[projectId]/page.tsx:2444-2515`), and gray inline-style field report (`[projectId]/report/page.tsx:100-198`). Pick one direction.
- [ ] **Mobile**: hard-coded brand colours bypass the palette in ≥ 4 spots — `ScannerFab.tsx:425,452-456` (`#15803D`/`#FFFFFF`), `money/index.tsx:81,220` (`#FEF3C7`/`#D97706`/`#92400E`), `money/[id].tsx:830-832,842`, `gear/index.tsx:232-243` (`#FEE2E2`/`#7F1D1D`/`#FEF3C7`/`#78350F`). Add the missing `amber` / `amberText` / `reviewBg` / `successContrast` palette entries so the Sun theme actually applies.

### 1.2 Design-token layer
None of the three apps consistently uses a token layer. Inline hex literals drift from Tailwind classes whenever one is updated without the other.

- [ ] **CAD**: introduce `--cad-surface-1/2/3` (the `#1a1f2e` / `#2a2f3e` / `bg-gray-800/900` family), `--cad-accent`, `--cad-danger` CSS variables + corresponding Tailwind theme entries. Migrate 6+ inline `style={{ backgroundColor: '#1a1f2e' }}` sites: `ToolOptionsBar.tsx:183`, `UndoRedoButtons.tsx:23`, `DisplayPreferencesPanel.tsx:201`, `ImportDialog.tsx:63,112,447,520`, `LayerPreferencesPanel.tsx:84`. Eliminate the bespoke `bg-gray-850/750/950` classes scattered across 15+ files.
- [ ] **RECON**: workspace page (`[projectId]/page.tsx`, 3508 lines) holds 175 inline `style={{…}}` blocks with hard-coded `#7C3AED` / `#2563EB` / `#DC2626` / `#FECACA` / `#374151` / `#9CA3AF`. Migrate to existing `AdminResearch.css` `--recon-card` / `--recon-border` tokens; add new tokens for the colours that don't have one yet.
- [x] **Mobile**: fix the missing `useResolvedScheme()` imports in `lib/Button.tsx`, `lib/TextField.tsx`, `lib/JobCard.tsx`, `lib/CaptureFab.tsx`, `lib/Timesheet.tsx` — all five files now import the hook from `./themePreference` and follow the canonical `const scheme = useResolvedScheme(); const palette = colors[scheme];` pattern (Button.tsx:15/37, TextField.tsx:21/32, JobCard.tsx:21/29, CaptureFab.tsx:31/37, Timesheet.tsx:27/36). `palette` is consumed downstream in each file's styles (Button 4 sites, TextField 6, Timesheet 10, JobCard 5, CaptureFab 1). Theme system is applied consistently.
- [ ] **CAD**: pull `app/styles/globals.css:7-15` brand tokens (`--brand-red`, `--brand-blue`, `--brand-green`, `--shadow-brand`) into the CAD shell so the marketing site and the CAD app share an identity (currently they look like different products).

### 1.3 Unified confirmation primitive
Three different "are you sure?" patterns coexist within each app. Mixed patterns mean a destructive action is sometimes a styled modal and sometimes the OS dialog.

- [ ] **CAD**: standardise on one `<ConfirmDialog>` component matching the existing dark-shell pattern. Audit current modal layouts (`IntersectDialog`, `LayerTransferDialog`, `ElementExplanationPopup`) for consistency.
- [x] **RECON**: replace the 11 `window.confirm()` calls with the shared `<ConfirmDialog>` — shipped in `b4ce608` ("feat(research): unified <ConfirmDialog> primitive — replace 14 window.confirm calls"; the audit caught 3 more callsites than this row originally listed). `app/admin/research/components/ConfirmDialog.tsx` is the primitive, consumed by `[projectId]/page.tsx`, `layout.tsx`, `AnnotationLayerPanel.tsx`, `DrawingCanvas.tsx`, `DrawingPreferencesPanel.tsx`, `ElementDetailPanel.tsx`, `TemplateManager.tsx`. `grep -rn "window\.confirm" app/admin/research/` now matches only the source-file's history comment.
- [x] **Mobile**: replace `Alert.alert` confirmation on sign-out (`me/index.tsx:224`) with at minimum a 2-step confirm — shipped in `2cd4634` ("feat(mobile): confirm before sign-out"). `mobile/app/(tabs)/me/index.tsx:232` now wraps `signOut()` in `Alert.alert('Sign out?', …, [Cancel, Sign out (destructive)])`; the audit targets all carry the same Cancel + destructive Delete pattern already: `capture/[pointId]/photos.tsx:218` (delete photo/video), `jobs/[id]/points/[pointId].tsx:234` (delete photo), `money/[id].tsx:306` (delete receipt; body varies when AI extraction is still running). The Android `style:'destructive'` colour-mismatch caveat in the original note is platform-level and out of scope for this row.

### 1.4 Shared screen-header primitive
Each app re-rolls headers per screen, with drift in title scale, back-button placement, and SafeArea handling.

- [x] **Mobile**: build `<ScreenHeader title back?  actions?/>` shared component owning SafeAreaView, title typography, optional back+close, optional right-side action — shipped in `c1e7f17` (`mobile/lib/ScreenHeader.tsx` + migrate 5 tab indexes), `f7b47f0` (6 detail-screen headers), and `0ec7cde` (remaining 8 detail-screen headers). Now imported by every tab index and every detail screen across `jobs/`, `money/`, `time/`, `gear/`, `me/`, `capture/`.
- [ ] **CAD**: replace the per-dialog header (✕ vs `<X>` vs `<X size=14/16/18>`) with a single `<DialogHeader title/>` component — sizes currently range 12-18 px. Affected sites listed in §2 below.
- [ ] **RECON**: per-page header order is inconsistent across `[projectId]/page.tsx:1536-1631`, `[projectId]/boundary/page.tsx:257-283`, `documents/page.tsx:213-228`, `library/page.tsx:172`, `billing/page.tsx:170`. Standardise: back link → breadcrumb → title → metadata → actions.

### 1.5 Icon / glyph vocabulary
Mixed lucide icons and literal emoji obscure the intent on every surface.

- [ ] **CAD**: `MenuBar.tsx:346,349,353,365,369,374,378,382` mixes 🪪 📦 🤖 💬 🧠 ✓ 📜 with plain text; `FeatureContextMenu.tsx:7-25` uses lucide; `StatusBar.tsx` is lucide-only; `AISidebar.tsx:55-81` uses emoji for tabs. Pick one (lucide).
- [ ] **RECON**: doc-type icon map is duplicated in `[projectId]/page.tsx:2649-2664`, `library/page.tsx:48-50`, `documents/page.tsx:40-46` with overlapping but non-identical mappings (e.g. easement is `🛤️` vs `📋`). Extract to a single source of truth + replace emoji with lucide.
- [ ] **Mobile**: tab icons are all emoji (`(tabs)/_layout.tsx:70,86,93,100,111`) — render differently iOS vs Android, don't tint with `tabBarActiveTintColor`. Replace with lucide-react-native (or expo-symbols) so active/inactive state is conveyed by colour, not just label.

---

## 2. STARR CAD (desktop)

255 open items already exist in Phase 3/5/6/7/8 docs. The findings below are *additional* polish work not yet captured there.

### 2.1 Cohesion / theme
- [ ] Add a CAD design-token layer (see §1.2). Migrate inline `style={{ backgroundColor: '#1a1f2e' }}` sites listed above.
- [ ] Pick one font family for chat inputs — `AICopilotSidebar.tsx:280` and `CanvasViewport.tsx:10797` both override the inherited Inter with `font-sans`; most other inputs inherit it implicitly.
- [ ] Standardise close-button glyph + size across every dialog. Mixed `<X size=12|14|16|18>` vs. literal `✕` in `StatusBar.tsx`, `MenuBar.tsx:679`, `CADLayout.tsx:558,644`, `DrawingChatPanel.tsx:73`, `CompletenessPanel.tsx`.

### 2.2 Positioning — top-right panel collision
The single most user-impacting layout issue. Five floating surfaces fight for the same screen real estate at different z-indices:

| Component | Position | z-index | File |
|---|---|---|---|
| CopilotCard | `top-16 right-4 w-[360px]` | 40 | `CopilotCard.tsx:102` |
| AICopilotSidebar | `top-12 right-0 w-[340px]` | 30 | `AICopilotSidebar.tsx:105` |
| DrawingChatPanel | `top:60 right:0 width:380` | 900 | `DrawingChatPanel.tsx:174` |
| AISidebar | `top:60 right:0` | 935 | `AISidebar.tsx:646` |
| CompletenessPanel | `top:60 right:0 width:380` | (varies) | `CompletenessPanel.tsx:227` |
| DisplayPreferences / LayerPreferences / FeatureLabelPreferences | `absolute right-0 top-0` (canvas) | (varies) | various |

Any combination of two can be open simultaneously per `CADLayout.tsx:824-925`. CopilotCard literally floats on top of the AI sidebar that already shows its data.

- [ ] **Consolidate the right-side panels into one docked stack.** Extend the existing AI sidebar to host the chat + copilot + completeness tabs; the others get promoted into it instead of being separate fixed-position elements.
- [ ] **AICopilotSidebar's `bottom-8`** (`AICopilotSidebar.tsx:105`) is hand-tuned and doesn't account for the CommandBar above the StatusBar, or for the PointTable panel (h-48) that mounts above the StatusBar (`CADLayout.tsx:770-777`) — opening the point table truncates the sidebar.
- [ ] **UndoRedoButtons + ToolOptionsBar + Display-Preferences toggle** are three separate elements forced together with three separate backgrounds (`CADLayout.tsx:667-687`, `UndoRedoButtons.tsx:23`). Wrap them in one shared container.
- [ ] **CopilotCard z-40 overlaps the FeatureContextMenu z-50** so right-clicking a feature while an AI proposal is up creates an awkward stacking situation (`CopilotCard.tsx:102`, `FeatureContextMenu.tsx:969`).
- [ ] **TitleBlock panel** silently swallows LayerPreferences / FeatureLabelPreferences panels via `&& !showTitleBlock` guards (`CADLayout.tsx:720,728`) instead of reflowing.
- [ ] **Compass hand-off banner** (`CADLayout.tsx:568-647`) is static — no animation — so menu positions shift after first render.
- [ ] **Document name on the MenuBar** is right-aligned `ml-auto` with no sibling (`MenuBar.tsx:637-660`); easy to miss; double-click rename is the only edit affordance with no visual hint.

### 2.3 Cramped / hard-to-navigate
- [ ] **StatusBar packs 12+ controls into a `py-0.5 gap-4` row** (`StatusBar.tsx:184-422`). On a 1366px laptop this overflows; the `overflow-hidden` on line 184 silently clips the right edge. Group snap+grid+ortho+polar toggles into a single "Drafting Aids" popover. Move the active-layer label to the LayerPanel header (it's already visible there). Free space for the AI mode chip + drawing scale.
- [ ] **Layer rows jam 8+ controls at `text-xs`** (`LayerPanel.tsx:263-495`) — chevron `size={10}`, settings cog `size={10}` — sub-AAA touch targets. Switch to a two-line layout: name + feature count on line 1, controls (visibility, lock, color, settings, promote) on line 2.
- [ ] **ToolOptionsBar at `min-h-[40px] overflow-x-auto`** (`ToolOptionsBar.tsx:182`) shows different controls per tool and becomes a horizontal scroll-strip on TRANSFORM / ARRAY / OFFSET. 2129 lines of conditional UI. Split into per-tool mini-panels below the toolbar; keep the universal strip for global modes only (ortho/polar/copy).
- [ ] **AICopilotSidebar** at 340 px wide crams Header + Auto-approve slider + Saved resolutions row + Reference-doc chip + AUTO controls + Transcript + Input form into a single column. Settings + AUTO strips alone eat ~25% of vertical space before any chat is visible. Collapse the settings strip behind a "Settings" chevron when collapsed.
- [ ] **FeatureContextMenu** grows to 14 items with submenus for AI features (`FeatureContextMenu.tsx:869-901,969`) at `min-w-[200px] max-w-[260px]`. Group by intent (Edit · Select · Layer · AI) with dividers.
- [ ] **MenuBar File menu has 28 items** in one nesting level (`MenuBar.tsx:329-385`). Re-nest using submenus. *Save / Save As duplicate dropped in this iteration:* both entries called the same `saveDocument` (no "Save As" semantics in a web app — every download lets the browser rename). "Save to Cloud…" still owns the DB-backed save. Submenu nesting for the export-format cluster (CSV simplified/full, DXF, PDF, Field cards, GeoJSON, Deliverable bundle) remains a follow-up.
- [ ] **LayerTransferDialog at 2334 lines** has 4 source-mode tabs, 6+ option groups, type-IDs filtering, code remapping, traverse routing, presets all in one modal. Split into tabs or a wizard.

### 2.4 Discoverability gaps
- [x] **Variant flyouts on ToolBar buttons** are signalled by a 5-pixel corner triangle at 40% opacity — shipped in `40903ae`. `ToolBar.tsx:660` now renders a `<ChevronDown size={9}>` at the bottom-right of every `hasVariants` button with `opacity-60 group-hover:opacity-100`; tooltip already carries the `▸` hint (commented inline at 656-658).
- [ ] **Snap-type popover** is hidden behind a small `▾` chevron in the StatusBar (`StatusBar.tsx:317-324`). No keyboard discoverability.
- [ ] **AI mode chip** in the status bar (`StatusBar.tsx:250-278`) is the only entry to the four-mode framework. `Ctrl+Shift+M` lives in the tooltip only. Add a menu-bar entry under Tools or AI.
- [x] **Two-character chord shortcuts** (`Z E`, `I X`, `O A`, `R V`, `S F`, `S N`, `C R`, `O F`, `I N V`, `F P`, `C C`, `I M`) have no on-screen progress indicator — shipped in `b97ed7b` ("feat(cad): chord-shortcut HUD — visible second-key completions"). `app/admin/cad/components/ChordHUD.tsx` renders the in-progress prefix + every completable second key with its action label at bottom-center while a chord is mid-stroke.
- [x] **"Recover unsaved drawings…"** StatusBar pill — `StatusBar.tsx` now takes an `onOpenRecentRecoveries` prop and on mount + on `doc.id` change calls `listAutosaves()` to count IndexedDB autosaves whose `docId` differs from the active drawing. When the count is > 0 the bar renders a clickable `🔄 N recoverable` pill (same amber palette as the Hidden Items pill) that opens the existing `RecentRecoveriesDialog`. `CADLayout.tsx:789` passes `setShowRecentRecoveries(true)` for the callback. The File-menu entry stays for discoverability; the pill is the no-menu path.
- [x] **"Hidden Items"** pill in StatusBar — shipped per §UX U18 (`StatusBar.tsx:76-80,316-324`). The bar derives `hiddenCount = Object.values(doc.features).filter(f => f.hidden).length` and renders a clickable `{hiddenCount} hidden` pill (with title-attr count + plural) whenever the count is > 0. Clicking still routes the surveyor to the existing manage flow.
- [ ] **Promote draft layer** button only appears on draft layers (`LayerPanel.tsx:456-494`) with no documentation in MenuBar/Help.
- [ ] **Three AI surfaces** (DrawingChatPanel, AISidebar, AICopilotSidebar) with overlapping responsibilities and three File-menu entries (`MenuBar.tsx:365-371`) that never explain the difference. Either consolidate (per §2.2) or label each entry by intent.
- [x] **Settings dialog only via Help → Settings & Preferences** — Settings gear icon already lives on the right side of `MenuBar.tsx:693-701` (next to the Keyboard-shortcuts icon and the document name). Click dispatches `cad:openSettings` (same event the Help menu entry fires) and the title-attr surfaces the `Ctrl+,` shortcut. Both the menu entry and the icon are intentional — the icon is the no-menu path.
- [ ] **Layer-rotation feature** buried as the second-to-last item of the layer right-click menu (`LayerPanel.tsx:725-774`); numeric input appears in place — easy to miss.
- [x] **Intersect tool** chord shortcut `I X` is now discoverable through the Chord HUD (`b97ed7b`) — pressing `I` displays a list of completable second keys including `I X → Intersect Lines…`.
- [ ] **Compass / RECON import** triggered by external apps writing to localStorage (`CADLayout.tsx:166-207`); no in-app entry point.
- [x] **CopilotCard "Modify" tooltip** — fixed. `CopilotCard.tsx:166` now reads "Skip this proposal and open the chat so you can ask the AI to revise it." — no "Slice 6" string leak. (The remaining `Slice 5/6` reference is in the file-header comment, not a user-visible string.)

---

## 3. STARR RECON (property research workspace)

### 3.1 Cohesion / theme
- [ ] Unify the four parallel themes (see §1.1).
- [ ] Decompose `[projectId]/page.tsx` (3,508 lines, 175 inline-style blocks) into per-stage files: `Stage1Upload.tsx`, `Stage2Research.tsx`, `Stage3Review.tsx`, `Stage4JobPrep.tsx`, plus per-dialog extractions. Migrate inline styles to `AdminResearch.css` classes.
- [ ] Convert the 5 dark `#0f172a` Easements cards (`[projectId]/page.tsx:2444-2533`) to use the existing `coherence-review__detail-box` pattern from a few hundred lines up.

### 3.2 Positioning
- [ ] **Header/back-link order is inconsistent** across `[projectId]/page.tsx:1536-1631`, `[projectId]/boundary/page.tsx:257-283`, `documents/page.tsx:213-228`, `library/page.tsx:172`, `billing/page.tsx:170`. Standardise via the shared header primitive (§1.4).
- [ ] **Edit + Archive sit adjacent with no separator** in the top-right action bar (`[projectId]/page.tsx:1585-1600`). Archive is destructive; relies on red text alone. Add a separator + a danger affordance.
- [ ] **Re-run Research is in the same flex row as `Continue to Job Prep →`** (`[projectId]/page.tsx:1744-1765`). Split the row into three regions: (left) `← Back` + `Continue →`, (middle) spacer, (right) `Re-run Research` inside `<div role="group" aria-label="Destructive actions">` with a top divider on wrap.
- [ ] **PipelineStepper duplicates step indication** alongside the stats row and per-stage `research-step-header` icons (`[projectId]/page.tsx:1604-1631`). Viewport consumes ~25-30% before any actionable content. Pick one progress signal.
- [ ] **County badge floats inside the address span** without spacing rules (`[projectId]/page.tsx:1572`); pinches on wrap.
- [ ] **Stage-4 drawing tools** — toggling preferences (`showPrefsPanel`) overlays the canvas instead of resizing (`[projectId]/page.tsx:2879-2899`).
- [x] **Stats cards are decorative, not actionable** — shipped in `9552eea` ("feat(research): make Quick-stat tiles actionable"). Each tile in `app/admin/research/[projectId]/page.tsx`'s stats grid now wraps in a `<button>` that calls `setActiveReviewTab(…)` to jump to the corresponding review tab.

### 3.3 Cramped / hard-to-navigate
- [ ] **Easements tab is a wall of nested grids** (`[projectId]/page.tsx:2444-2533`). Convert to a 2-column grid + sticky in-tab subnav (FEMA, TxDOT, Plat ROW, Plat Easements, Clerk Easements, Covenants).
- [ ] **Discrepancies tab badge shows count but not worst-severity** (`[projectId]/page.tsx:1844`).
- [ ] **Documents subroute toolbar** (`[projectId]/documents/page.tsx:233-271`) — 7 filter pills + search + sort with `flex-wrap`; search input collapses to ~160px when wrapped.
- [ ] **Library toolbar** (`library/page.tsx:197-250`) — same pattern; results count in `ml-auto` jumps inconsistently on reflow.
- [ ] **Pipeline batch table address input** gets ~40% of row at desktop widths (`pipeline/page.tsx:191-235`); no expand-row affordance.
- [ ] **Billing Purchases table has 8 columns inside `max-w-5xl`** (`billing/page.tsx:177,322-417`); address collapses to `truncate max-w-32` on 14" laptops.
- [ ] **Review summary stats row has no upper bound** (`[projectId]/page.tsx:1881-1897`); 11+ pills tile unpredictably on wrap (acreage next to errors next to flood zone). Group them.
- [ ] **DocumentUploadPanel renders inline with PropertySearchPanel** (`[projectId]/page.tsx:1649-1668`) with no visual separator — users type addresses into the upload panel's secondary fields.
- [ ] **Final Document tab embeds large SVGs inline** (`[projectId]/page.tsx:1476-1481`) without a viewport-fit scaler; long traverses overflow horizontally.

### 3.4 Discoverability
- [ ] **Pipeline Dashboard is orphaned.** `/admin/research/pipeline` is reachable only by typing the URL. Promote the project-nav strip to a top-level admin tab strip on `page.tsx`; keep project-scoped routes (Boundary, Documents, Report) inside the workspace.
- [ ] **Testing Lab** is only reachable from the list-page header (`page.tsx:142-148`). Add it to the global nav.
- [ ] **Project-nav bar is omitted from the list page** (`page.tsx`). Global routes (Library, Billing, Pipeline, Testing) should be visible there.
- [x] **`WorkflowStepper.tsx` is dead code** — shipped in `010b99d` ("chore(research): drop dead WorkflowStepper + document PipelineStepper"). The component file is gone; `find . -name "WorkflowStepper.tsx"` returns nothing. The pipeline-stepper mismatch is documented inline.
- [ ] **Keyboard shortcuts** registered in `[projectId]/page.tsx:1281-1320` (Ctrl+S, Ctrl+Z/Y, Escape, 16 tool letters). Only tool letters show as `<kbd>` badges. Add a `?` overlay listing every shortcut + `aria-keyshortcuts` on Save/Undo/Redo.
- [ ] **"Initiate Research & Analysis"** auto-fires a long-running pipeline with no preview of cost/duration (`[projectId]/page.tsx:1655-1668`). Add a confirm dialog with the expected fan-out.
- [ ] **Re-run dialog focuses the unsafe option** (`[projectId]/page.tsx:1768-1825`). Make "Update Parameters First" the default focus.
- [ ] **Coherence Review verdict** is rendered halfway down the Summary tab below the stats row + narrative (`[projectId]/page.tsx:1918-2407`). Move the verdict pill to the top of the tab.
- [ ] **"Misc documents filtered out" hint** (`[projectId]/page.tsx:2746-2750`) is a passive gray line — no link to view filtered items. Add a "View hidden misc captures" link.

---

## 4. STARR Mobile (field app)

### 4.1 Cohesion / theme
- [x] Replace the five hand-rolled tab headers with the shared `<ScreenHeader>` primitive (§1.4) — shipped in `c1e7f17`. All five tab index files (jobs/money/time/gear/me) import `ScreenHeader` and render it instead of bespoke header layouts.
- [ ] Standardise title type-scale. Currently 32px (tab indexes), 28px (job detail / point photos), 24px (receipt detail), 14px (Gear).
- [ ] Fix the missing `useResolvedScheme` imports (§1.2) so the theme system actually applies.
- [ ] Add missing palette entries (`amber`, `amberText`, `reviewBg`, `successContrast`) so the Sun theme works on Money / Receipt / Gear screens.
- [x] Tab label "$" → "Money" (and "Me" → "Account", "Gear" → "Equipment") — shipped in `334c415` ("fix(ux): UX polish batch 1 — sidebar padding, RECON Pipeline CSS, mobile tab renames"). `mobile/app/(tabs)/_layout.tsx` now reads `title: 'Money'` at 96, `'Account'` at 103, `'Equipment'` at 114.
- [ ] Replace emoji tab icons with `lucide-react-native` so active/inactive tint actually works.
- [x] Remove duplicate `Stack.Screen options={{ headerShown: false }}` calls inside child screens — the parent `mobile/app/(tabs)/me/_layout.tsx:22` already sets `headerShown: false` globally for every me/* screen, so the per-screen overrides were redundant. Dropped from `me/uploads.tsx:122` and `me/privacy.tsx:71`, plus the unused `Stack` import in each.

### 4.2 Positioning
- [x] **Job detail has no Back affordance** — shipped via the `<ScreenHeader>` migration. `mobile/app/(tabs)/jobs/[id]/index.tsx:71-72` renders `<ScreenHeader back …/>` with the `back` prop enabling the native back chevron on every visit of the screen.
- [x] **Tab bar height (64 px) + bottom padding doesn't include safe-area insets** — shipped in `1ba30c9` ("fix(mobile): tab bar respects safe-area + jobs/search modal gains bottom edge"). `mobile/app/(tabs)/_layout.tsx:31` calls `useSafeAreaInsets()`, then 56-58 add `insets.bottom` to both the bar height (`TAB_BAR_HEIGHT + insets.bottom`) and the `paddingBottom` (`8 + insets.bottom`).
- [ ] **CaptureFab + ScannerFab collide on narrow phones in landscape** — both sit within ~50 px (`ScannerFab.tsx:48,416-419`, `CaptureFab.tsx:87`).
- [ ] **Money header search-pill** at `paddingHorizontal: 10, paddingVertical: 6` (`jobs/index.tsx:62-80`) — ~32 px touch target, only `hitSlop={8}` rescues it.
- [ ] **Sign-out button at the bottom of a 2000+px Me scroll** (`me/index.tsx:536-542`) — out of thumb zone *and* easy to accidentally tap after scrolling all the way down. Group account actions at the top of the Me tab.

### 4.3 Cramped / hard-to-navigate
- [ ] **Me tab is a 7-section ScrollView with no anchors / no sticky chrome** (`me/index.tsx:261-542`). Add a sticky in-tab subnav or collapsible section headers.
- [x] **Receipt detail sticky Save bar** — shipped in `67708a4` ("feat(mobile): sticky Save bar on Receipt / Point / Time edit"). `money/[id].tsx:607` renders the bar via `styles.stickyBar` (defined at 1070); same pattern lands in `jobs/[id]/points/[pointId].tsx:500` and `time/edit/[id].tsx:356`.
- [ ] **Time tab combines status card + week card + 14 days of entries** in one scroll (`time/index.tsx:198-385`). Stale-clock-in banner pushes the active card down on the very screen the user opens to clock out. Add a sticky top region.
- [ ] **Point detail expands Photos + Notes + Files + name + description + flags + Save + Delete** inline (`jobs/[id]/points/[pointId].tsx:311-501`). On 12 photos + 4 notes + 3 files, form fields are well below the fold.
- [ ] **Long-press is the only delete affordance** for photos / videos / notes / files. Add swipe-to-delete on rows; keep long-press as a power-user shortcut.
- [ ] **Money empty state hides the FAB** — `money/index.tsx:170-197` only renders the FAB when there are receipts. New users land on the empty state with the "+ Add receipt" button in the center, not in a persistent location.
- [ ] **Uploads triage** has Try Again + Discard side-by-side with equal visual weight (`me/uploads.tsx:286-305`); destructive should be visually subordinate.

### 4.4 Discoverability
- [ ] **Cross-notes search** is hidden behind a pill in the Jobs tab only (`jobs/index.tsx:62-80`). Surface from every tab or move to a global header.
- [ ] **"Advanced (offset, correction)"** is collapsed by default in Capture (`capture/index.tsx:437-470`). Offset shots are common — expand by default for users with role=field, or surface a "What's an offset?" link.
- [ ] **Voice memos** only reachable inside a Point's photo screen (`capture/[pointId]/photos.tsx:428-439`). Add a top-level voice button on the Capture screen.
- [ ] **Gear tab is role-gated** with no surfacing toast when role changes mid-session (`(tabs)/_layout.tsx:107-114`).
- [ ] **Pinned files** read-only in Me → Storage (`me/index.tsx:477-491`); unpin requires drilling to per-point file card. Add "Manage pinned files" deep-link.
- [ ] **Time tab's "Fix the time" panel** only renders when `elapsedMs > 16h` (`time/index.tsx:215-254`). Add a graduated affordance at 8h / 12h.
- [ ] **Receipt extraction states** surface via three stacked banners + a list-card chip (4 surfaces total, `money/[id].tsx:364-382`, `ReceiptCard.tsx:103-152`). Consolidate.
- [ ] **ScannerFab only renders when `summary.total > 0`** (`ScannerFab.tsx:364`). New EMs have zero indication the scanner exists.
- [ ] **Cross-notes search** has no recent / saved surface (`jobs/search.tsx:56-77`).
- [ ] **CaptureFab long-press is a stub** that opens an Alert (`CaptureFab.tsx:45-50`) but the accessibilityHint advertises the feature. Either implement or remove the hint.

### 4.5 Mobile-specific
- [ ] **Sub-44pt touch targets**: Money filter clear (32×32 — `money/index.tsx:227-228`), Receipt detail Cancel (no `minHeight`, padding 4 only — `money/[id].tsx:1059-1063`), Capture screen Cancel (padding:8 — `capture/index.tsx:561`), uploads back chevron (no min size — `me/uploads.tsx:124-133`), filter tabs in uploads (~30 pt — `me/uploads.tsx:369`).
- [x] **No haptics anywhere** — shipped in `46acce0` ("feat(mobile): haptics on primary actions"). Sign-out (`me/index.tsx:241` `haptics.confirm()`), theme toggle (`me/index.tsx:287` `haptics.tap()`), receipt capture (`money/capture.tsx:103` `haptics.success()`), and other primary flows now fire haptic feedback via the shared `haptics` helper.
- [x] **Sign-out has no confirmation** — duplicate of §1.3 row above. Shipped in `2cd4634` (also referenced as Slice D4/U23 below); `me/index.tsx:232` wraps `signOut()` in a native Alert with Cancel + destructive Sign-out + consequence copy.
- [ ] **SafeArea `edges={['top']}` only** on modal-style screens — `money/[id].tsx:334,1001`, `capture/index.tsx:88,295`, `jobs/[id]/points/[pointId].tsx:268,559`. Add `'bottom'` so the home indicator doesn't sit on Delete/Save.
- [ ] **`KeyboardAvoidingView` `behavior: 'padding'` is iOS-only** in `sign-in.tsx`, `forgot-password.tsx`, `capture/index.tsx`, `money/[id].tsx`, `jobs/[id]/points/[pointId].tsx`, `time/edit/[id].tsx`. Add an Android branch (`'height'`) so the keyboard doesn't cover totals/save.
- [ ] **Tab bar covers content** in receipt detail when scrolled to bottom (`money/[id].tsx:1042-1046`). The 64px tab bar eats ~14px of the Delete button.
- [ ] **`numberOfLines` clamps strip valuable info** — `JobCard.tsx:57,62,69` clamps title / subtitle / address to 1 line. Typical Texas job names ("Jenkins Boundary Survey - 240ac off Belton Lake Rd") disappear at column 22.
- [x] **No pull-to-refresh** on Jobs / Money / Time — shipped in `c92b7c7` ("feat(mobile): pull-to-refresh on Jobs / Money / Time"). All three tab indexes import `RefreshControl` from `react-native` and bind it to their ScrollView/FlatList: `jobs/index.tsx:118`, `money/index.tsx:192`, `time/index.tsx:226`.
- [x] **Sun-theme toggle is 3 taps deep** — shipped in `c87c7b6` ("feat(mobile): one-tap Sun-readable toggle in Me header"). `mobile/app/(tabs)/me/index.tsx:279-292` renders a `☀ Sun` / `☀ On` pill in the Me ScreenHeader's right slot; single tap toggles between `'sun'` and `'auto'` via the existing theme-preference store; light haptic confirms the flip. The 4-pill Display picker further down still owns explicit Light / Dark selection.
- [ ] **Discard duplicate / Keep — different receipt buttons wrap** because each has `minHeight: 60` + `paddingHorizontal: 24` (`money/[id].tsx:868-895`). On smaller phones the second drops to a second line — looks like two unrelated buttons. Stack vertically below a breakpoint.

---

## 5. Implementation sequence

Each slice is small enough to ship in one PR. Phases land in this order so the cross-cutting fixes (§1) are in place before per-app touch-ups depend on them.

### Phase A — Shared primitives (do first)

1. **Slice A1** — CAD design-token CSS variables + Tailwind extension. Migrate the 6+ inline `#1a1f2e` / `#2a2f3e` sites. No visible change yet; future slices depend on this.
2. **Slice A2** — RECON design-token audit. Migrate the workspace page's 175 inline-style blocks to `AdminResearch.css` classes. Touches one big file but no behaviour change.
3. **Slice A3** — Mobile palette gaps. Add `amber`/`amberText`/`reviewBg`/`successContrast` to `lib/theme.ts`. Fix the missing `useResolvedScheme` imports across `lib/Button.tsx`, `lib/TextField.tsx`, `lib/JobCard.tsx`, `lib/CaptureFab.tsx`, `lib/Timesheet.tsx`.
4. **Slice A4** — Shared `<ConfirmDialog>` per app + audit existing destructive flows. CAD: harmonise existing modal headers. RECON: replace all 11 `window.confirm()` calls. Mobile: replace `Alert.alert` sign-out.
5. **Slice A5** — Mobile `<ScreenHeader>` + `<ScreenScroll>` shared components. Adopt on every tab index + detail screen. **`<ScreenHeader>` shipped (U20–U22)**: 5 tab indexes + 14 detail screens migrated (`jobs/[id]`, `capture/index`, `money/[id]`, `time/edit/[id]`, `me/uploads`, `me/privacy`, `jobs/search`, `jobs/[id]/notes/new`, `time/pick-job`, `money/capture`, `jobs/[id]/files/[fileId]/preview`, `jobs/[id]/points/[pointId]`, `capture/[pointId]/photos`, `capture/[pointId]/voice`). `<ScreenScroll>` deferred — every screen has bespoke SafeArea/edge needs and a wrapper would be premature.

### Phase B — CAD highest-impact

6. **Slice B1** — CAD AI-surface theme unification. Migrate `DrawingChatPanel`, `AISidebar`, `CompletenessPanel`, `ElementExplanationPopup`, the four RPLS / signature components, `QuestionDialog`, `ReviewQueuePanel`, `SealHashBanner`, `SealImageUploader`, `SurveyDescriptionPanel`, `RecentRecoveriesDialog`, `TooltipProvider` from inline-style to Tailwind dark.
7. **Slice B2** — Right-side panel consolidation. Merge the 5 floating top-right panels into one tabbed sidebar.
8. **Slice B3** — Chord-shortcut HUD. Toast at bottom-centre when a chord-start key is pressed; lists completable second keys.
9. **Slice B4** — StatusBar declutter. Group snap/grid/ortho/polar into one "Drafting Aids" popover. Move active-layer label to LayerPanel header. Add "N hidden features" pill + "Recoverable drawing" banner.
10. **Slice B5** — Layer-row two-line layout. Bump touch targets to ≥ 24 px.
11. **Slice B6** — ToolBar variant-flyout visible chevron + tooltip hint.
12. **Slice B7** — MenuBar right-side gear icon + sibling for document name.

### Phase C — RECON highest-impact

13. **Slice C1** — Theme unification. Pick light or dark, migrate the four sub-routes (`library`, `billing`, `documents`, `boundary`) + Easements tab + field report.
14. **Slice C2** — Workspace decomposition. Split `[projectId]/page.tsx` into per-stage files + extract dialogs.
15. **Slice C3** — Promote Pipeline + Testing Lab + global routes to a top-level admin nav strip on `page.tsx`.
16. **Slice C4** — Stat tiles become actionable buttons. **Shipped (U29)**: 4 quick-stat tiles on the project workspace are now proper `<button>` elements with hover / focus-visible / disabled states. Documents pushes to the `/documents` sub-route; Data Points → `artifacts` tab; Discrepancies + Resolved → `discrepancies` tab. Each click also smooth-scrolls the review-summary panel into view so the user lands in front of the rows, not just a number.
17. **Slice C5** — Stage-3 navigation row grouped by intent; destructive Re-run in its own group.
18. **Slice C6** — Easements tab 2-column grid + sticky in-tab subnav.
19. **Slice C7** — Delete `components/WorkflowStepper.tsx` + document `PipelineStepper` step semantics. **Shipped (U30)**: WorkflowStepper.tsx removed (zero external refs — dead code). PipelineStepper.tsx gains a header docstring explaining the 7→4 collapse (`configure`+`analyzing` → research; `drawing`+`verifying`+`complete` → jobprep) plus the revert-handler semantics.

### Phase D — Mobile highest-impact

20. **Slice D1** — Real back affordance on every detail screen via `<ScreenHeader>`.
21. **Slice D2** — Touch-target audit pass (≥ 44pt on every primary action).
22. **Slice D3** — Add `'bottom'` SafeArea edges on modal-style screens; add Android `KeyboardAvoidingView` branch.
23. **Slice D4** — Sign-out confirmation; reposition account section to top of Me. **Sign-out confirmation shipped (U23)**: native Alert.alert destructive-button pattern with copy that names the consequence ("…stays on this device until you sign back in").
24. **Slice D5** — Pull-to-refresh on Jobs / Money / Time. **Shipped (U24)**: feel-good gesture only (600 ms spinner) on all three lists. PowerSync sync is continuous, so the gesture confirms intent without thrashing the sync stream.
25. **Slice D6** — Swipe-to-delete on photo / note / file rows.
26. **Slice D7** — Sticky Save bar above keyboard on Receipt detail + Point detail + Time edit. **Shipped (U27)**: Save lives in a sibling View below the ScrollView, inside the existing KeyboardAvoidingView so it floats above the keyboard. Destructive Delete stays in the scroll on Receipt + Point (lower priority, intentionally further from thumb). Time edit's Edit-history block now scrolls below the sticky bar.
27. **Slice D8** — One-tap Sun-theme toggle (tab-bar long-press or Me-header pill). **Shipped (U26)**: small `☀ Sun` / `☀ On` switch pill in the Me ScreenHeader right slot. Single tap toggles between `'sun'` and `'auto'`; the existing 4-pill Display picker still owns explicit Light / Dark selection. Light haptic confirms.
28. **Slice D9** — Haptics on primary actions (capture / save / sign-out). **Shipped (U25)**: thin `lib/haptics.ts` wrapper around `expo-haptics` with a four-call taxonomy (`tap` / `confirm` / `success` / `warn`). Wired into clock-in, clock-out, submit-week, receipt capture, receipt save, receipt confirm-review, photo / video attach, point save, time-edit save, note save, and sign-out-accept.

---

## 6. Acceptance criteria for "UX polish complete"

- [ ] Every checkbox in §1–§4 is closed *or* deliberately deferred with a one-line note.
- [ ] No inline `style={{ backgroundColor: '#…' }}` literals remain in CAD admin components.
- [ ] No inline `style={{…}}` blocks remain in RECON workspace page (175 → 0).
- [ ] No `useResolvedScheme()` calls without a matching import in mobile shared lib.
- [ ] No `window.confirm` / raw `Alert.alert` confirmation in any admin app — every destructive op goes through `<ConfirmDialog>`.
- [ ] Every tab / detail screen in mobile uses `<ScreenHeader>` + `<ScreenScroll>`.
- [ ] Every primary action on mobile has a ≥ 44pt touch target.
- [ ] No emoji used as a primary icon in CAD MenuBar, RECON nav, or mobile tab bar.

---

# Part 2 — Alignment + naming deep audit (added 2026-05-12)

A second sweep specifically on (a) buttons / fields / icons that should be vertically aligned but aren't, and (b) titles / labels / setting names that don't accurately describe what they do. Findings here are additive to §1–§6 above.

## 7. Cross-cutting alignment debt (root causes)

All three apps share the same underlying problem: **shared primitives don't agree on size, padding, or border-radius**. Fix this at the primitive layer once and dozens of downstream rows snap into place.

### 7.1 Control-height tokens (do first)

- [ ] **Mobile**: `lib/Button.tsx` is `minHeight: 60 / borderRadius: 12 / paddingH: 24`; `lib/TextField.tsx` is `minHeight: 56 / borderRadius: 10 / paddingH: 16`. Every form that stacks a Button under a TextField inherits a 4 px shoulder + 2 px corner-radius drift. Define `controlHeight` (56 or 60 — pick one) and `controlRadius` (10 or 12 — pick one) in `lib/theme.ts` and apply to both primitives.
- [ ] **Mobile minHeight catalogue across the app**: `24, 40, 44, 56, 60, 76, 96`. No `spacing.*` token enforces a rhythm. Add `spacing.xs/sm/md/lg/xl = 4/8/12/16/24/32` plus a `controlSize.sm/md/lg = 40/48/56` (or similar) and migrate every inline `minHeight:` literal.
- [ ] **CAD**: pick one chrome-row height (`h-9` = 36 px or `min-h-[40px]`) and apply across `MenuBar.tsx:580`, `CADLayout.tsx:667-687`, `UndoRedoButtons.tsx:22`, `ToolOptionsBar.tsx:182`. Today `UndoRedoButtons` uses `w-7 h-7` (28 px) while `ToolOptionsBar` chips use `h-6` (24 px) in the same horizontal strip → 4 px baseline drift.
- [ ] **CAD inputs in dialogs must declare an explicit `h-6` or `h-7`.** Today `FeaturePropertiesDialog.tsx:491,506` and `LayerPreferencesPanel.tsx:105,130,351-600` omit `h-` entirely → render with UA default, drift against adjacent `h-6` color pickers.
- [ ] **RECON**: adopt a four-token button height scale (`sm = 28`, `md = 32`, `lg = 36`, `link = inherit`) via `.btn-*` utilities + audit every adjacent-button row. Direct kills: `[projectId]/page.tsx:1585-1600` (Edit/Archive), `:1744-1765` (Stage-3 nav), `:1792-1822` (Re-run modal trio), `DrawingViewToolbar.tsx:97-216` (three button heights in one bar).

### 7.2 Icon-size scale

- [ ] **CAD**: lucide icons currently use 9, 10, 11, 12, 13, 14, 15, 16 simultaneously. Pick three sizes (`ICON_SM = 12` inline, `ICON_MD = 14` dialog headers, `ICON_LG = 16` primary headers) and stop using everything else. Top offenders: `LayerPanel.tsx:370-419`, `LayerPreferencesPanel.tsx:61-313`, `IntersectDialog.tsx:423-680`, `AICopilotSidebar.tsx:111-290`.
- [ ] **CAD**: in one layer row (`LayerPanel.tsx:376,388,400,418`): chevron 10 → eye 12 → lock 12 → settings 10. Expand toggle and settings cog are 2 px smaller than the eye/lock pair sitting between them.
- [ ] **CAD**: `LayerPreferencesPanel.tsx:61,89,96,306,313,618` uses sizes 9, 10, 11, 12 in one panel — section-collapse chevron 9, type icon 10, rotate icon 11, close X 12.
- [ ] **CAD bare icons inside `flex items-center` rows that also contain text inputs**: wrap every `<X size={N}/>` in a uniform `<button className="w-5 h-5 flex items-center justify-center">…</button>` so the row's tallest child is predictable. Top offenders: `IntersectDialog.tsx:634,680`; `LayerTransferDialog.tsx` inner rows; `FeaturePropertiesDialog.tsx:481-516`.

### 7.3 Chip / pill component

- [ ] **Mobile**: catalogue of "chip" `paddingV` values across the app: 2, 3, 4, 6 — six distinct paddings for the same visual idiom. Sources: `lib/StageChip.tsx:54-55` (4), `lib/StatusChip.tsx:88-89` (2), `lib/PointCard.tsx:132-133` (3), `lib/CategoryPicker.tsx:120` (6), `lib/MyTruckSection.tsx:183,243` (3 and 2). Build a `<Chip tone size>` primitive with one paddingV (suggest 4) and one minHeight (suggest 28).
- [ ] **CAD**: dialog footer button paddings: `IntersectDialog.tsx:554,561` uses `px-3 py-1.5`; `DrawingRotationDialog.tsx:147-158` uses `px-4 py-1.5`; `ImportDialog.tsx:774-799` mixes `px-3` Back with `px-4` Import/Next *and* `rounded` vs `rounded-lg`. Standardise on `px-3 py-1.5 text-xs rounded`.
- [x] **CAD**: `CopilotCard.tsx:154-177` Skip + Modify + Accept padding harmonised — Skip and Modify bumped from `px-2.5 py-1` to `px-3 py-1` to match Accept. Footer button row reads consistently now.

### 7.4 Tile / card primitives

- [ ] **RECON**: three stat-tile vocabularies coexist:
  - `.research-hub__stat` (`AdminResearch.css:578-586`) — `padding: 0.85rem 1.25rem`
  - `.review-stat` (`:9840-9848`) — `padding: 0.45rem 0.85rem`
  - Billing tile (`billing/page.tsx:269-280`) — Tailwind `bg-gray-900 ... p-4`
  
  Extract a single `.recon-stat` primitive (suggest `padding: 0.7rem 1rem`, `min-width: 110px`).
- [ ] **RECON**: five Easements boxes at `[projectId]/page.tsx:2444-2515` repeat the same inline-style block five times without a shared class. Extract a `.recon-data-card` class.
- [ ] **CAD**: define a `<DialogShell>` component with one header sizing (`px-4 py-3` with `text-sm font-semibold` title and `X size={16}` close) + one footer sizing. Eliminates the four current dialog-header sizes (`px-3 py-2`, `px-4 py-3`, `px-5 py-4`, inline `14px 20px`) and the corresponding footer drift.
- [ ] **CAD**: `ElementExplanationPopup.tsx` uses inline-style objects (`styles.title`, `styles.header`) with hard-coded `padding: '14px 20px'`, `fontSize: 16`, `fontSize: 12`. Migrate to the new `<DialogShell>`.

### 7.5 Action-row pattern

- [ ] **Mobile**: `<ActionRow>` component for "two buttons side-by-side". `flex: 1` children + uniform gap; force secondary buttons to use an invisible inset (e.g. internal padding adjusted by border width) so the visual content width matches the primary. Apply to `money/[id].tsx:868` (Discard duplicate / Keep), `me/uploads.tsx:286` (Try again / Discard), `time/index.tsx:335` (Submit / Export CSV), `money/[id].tsx:580` (Retry AI / Save / Delete).
- [ ] **RECON**: Re-run-confirm modal at `[projectId]/page.tsx:1792-1822` has three buttons that share `padding: '0.5rem 1rem'` but one has `border: 'none'` while siblings have a 1 px border → the borderless button is 1 px shorter. Add `box-sizing: border-box` or give the borderless button a transparent 1 px border.
- [ ] **RECON**: Stage-3 nav row at `:1744-1765` mixes a text-link back-button (~16 px) with two ~35 px pill buttons in one flex row — the user's exact "out of alignment to each other" complaint. Either promote the back-button to pill height, or split into two rows (back-link only above; Continue + Re-run pills below).

## 8. CAD-specific alignment

### 8.1 Button-field row mismatches
- [ ] `FeaturePropertiesDialog.tsx:481-501` — color input `w-8 h-6` next to Line Weight input with no `h-` and `text-xs py-0.5`. Two adjacent rows render at visibly different heights; labels don't share a baseline. Force every input in the dialog to `h-6`.
- [ ] `IntersectDialog.tsx:597-624` — `SourcePickerRow` Extend checkbox is `px-1.5 py-1`, the Pick-from-canvas button is `px-2 py-1`. Same row, different horizontal padding → irregular gutter.
- [ ] `IntersectDialog.tsx:626-640` — picked-source readout `px-2 py-1.5` contains a bare `<X size={11}/>` glyph with no padding wrapper → icon visibly off-centre in its `flex items-center justify-between` parent.
- [ ] `IntersectDialog.tsx:687-697` — `RaySourceRow` puts a plain `<span text-[11px]>` next to a `UnitInput` forced to `h-6`. Centred but the span has line-height 11 px and the input is 24 px.
- [ ] `AICopilotSidebar.tsx:269-292` — submit row has `<span text-[10px]>Ctrl+Enter sends</span>` next to a `<button px-2.5 py-1 text-[11px]>`. Visual mass is lopsided.
- [ ] `StatusBar.tsx:213-242` — zoom strip mixes `<button w-4 h-4>` (16 px), `<input style={{height:18}}>` (18 px), and an unstyled `<span>%</span>` (line-height 16 px) in one `flex items-center` row. Three intrinsic heights.
- [ ] `LayerPanel.tsx:370-435` — layer row mixes `<button p-0.5>` icon buttons (~14-16 px), a `<div w-3 h-3>` color swatch (12 px), and an inline rename input with no height (~20 px). Centred but children differ 6-8 px.
- [ ] `ImportDialog.tsx:259-273` — drop-zone rename row: input is `flex-1 text-xs px-2 py-1.5 rounded` next to an action button `px-3 py-1.5 text-xs font-medium rounded`. Same `py` but `font-medium` button text drifts visually against regular input text.

### 8.2 Sidebar / panel padding drift
- [x] **`AICopilotSidebar.tsx:271` input row breathing room** — shipped in `4d4d61f` (U28). Bumped to `px-3 py-3` and `space-y-1.5` (the user's primary complaint about a cramped input row). Other strips in the sidebar still vary by intent (header, settings, AUTO) which is acceptable; only the input form needed the gutter fix.
- [ ] `AICopilotSidebar.tsx:271,280,288` — inside the input form, textarea is `px-2 py-1.5`, parent form is `px-2 py-2`, Send button is `px-2.5 py-1`. Three nested gutters.
- [ ] `LayerPreferencesPanel.tsx:58,64,100` — section header `px-3 py-1.5`, section body `px-3 pb-2`, sub-card `px-2 py-1` with internal `px-2 pb-2 pt-1 space-y-1.5`. Three nested levels of padding without a clean step pattern.
- [ ] `StatusBar.tsx:184` — outer strip is `gap-4`, but AI-mode chip group uses `gap-1`, zoom group uses `gap-0.5`, snap-popover footer uses `gap-2`. Pick one stride per strip.
- [ ] `CADLayout.tsx:667-687` — tool-options row mixes UndoRedoButtons (`min-h-[40px] px-2`), ToolOptionsBar (`min-h-[40px] px-3`), DisplayPrefsToggle wrapper (`px-2`). Same min-height but horizontal padding switches per chunk.

### 8.3 Floating panel anchor drift
- [ ] `AICopilotSidebar.tsx:105` anchors at `top-12` (48 px from top); `CopilotCard.tsx:102` anchors at `top-16` (64 px). Neither matches the actual chrome height (MenuBar `px-3 py-1.5 text-sm` ≈ 28-30 px + tool-options strip `min-h-[40px]` ≈ 68-70 px total). Replace magic numbers with a calc against a `--cad-chrome-height` CSS variable.

### 8.4 Small chrome glitches
- [ ] `CADLayout.tsx:556-560` auto-save warning `px-3 py-1` vs `:571` Compass notice `px-4 py-2` — two banner heights for the same kind of strip.
- [ ] `MenuBar.tsx:580-588` — menu items inherit `text-xs`, but the logo span at the same level is `text-sm` → logo larger than menus immediately to its right.
- [ ] `MenuBar.tsx:681` shortcut overlay uses `gap-x-6 gap-y-1` — non-square grid (24 px horizontal vs 4 px vertical).
- [ ] `LayerPanel.tsx:643` footer is `p-1 space-y-0.5` — 2 px between two action buttons feels tight relative to the body rhythm above.

## 9. RECON-specific alignment

### 9.1 The pipeline page is unstyled
- [ ] **`research-pipeline__*` BEM classes are referenced everywhere in `pipeline/page.tsx:200-234` but never defined in `AdminResearch.css`** (verified — 0 matches for `research-pipeline`). The entire batch-creation form and jobs list falls back to UA defaults. Define the missing classes (`__input`, `__remove-btn`, `__add-row-btn`, `__submit-btn`, `__create-btn`, `__refresh-btn`, `__job-card`).

### 9.2 Broken tab states
- [x] `.research-project-nav__link--active` wired via `usePathname()` — the nav was hoisted out of `[projectId]/page.tsx` into the dedicated `app/admin/research/[projectId]/components/ResearchProjectNav.tsx` (the file's header comment notes the move). `usePathname()` at line 26 + a per-link `matches()` predicate at 22-23 light up the `--active` class + `aria-current="page"` for whichever route matches.
- [ ] `.review-summary-panel__tab` active state uses a 2 px bottom-border but inactive tabs have no transparent placeholder → every tab click shifts content 2 px. Give inactive tabs `border-bottom: 2px solid transparent`.
- [ ] Project nav (`0.4 × 0.85 / font-size 0.82rem`) vs review tabs (`0.6 × 1 / 0.85rem`) — 50 % different padding-y for two tab strips on the same page. Pick one.
- [ ] Billing top-tabs use Tailwind `px-4 py-2 rounded text-sm`; document filter pills use `px-3 py-1 rounded text-xs`. Three different "tab" size scales across the product.

### 9.3 Stat tile + Easements drift
- [ ] Three stat-tile vocabularies (see §7.4). Extract `.recon-stat` primitive.
- [ ] Easements tab (`[projectId]/page.tsx:2444-2515`) has five inline-style boxes that share most properties but not all — four use `gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem'`, one uses a `<ul paddingLeft: '1.2rem'>`, one uses neither. Extract `.recon-data-card`.
- [ ] GIS Quality Report cards at `:2562-2599` use `var(--bg-elevated, #f9fafb)` (light theme) while the surrounding Easements tab cards use `#0f172a` (dark) → light cards inside a dark-cards tab.

### 9.4 Modal drift
- [ ] Three modal vocabularies: `.research-modal`, `.research-save-dialog`, inline-style Re-run confirm. Title font (`1.25/1.1/1.1rem`), footer gap (`0.75/0.5/0.5rem`), action-button padding (`0.55/0.45/0.5rem`), border-radius (`12/14/6/8`) all drift. Collapse to one `<ResearchModal>`.

### 9.5 Hand-tuned pixel hacks
- [ ] PipelineStepper connector uses `margin-top: 22.5px` (`AdminResearch.css:9302-9311`) — a half-pixel hand-tune to align with a 48 px circle. Replace with flex centring.
- [ ] First pipeline-stepper item uses `justify-content: flex-end` (`AdminResearch.css:9298-9300`) to fake right-alignment because the first stage has no connector. CSS comment admits this is a workaround.
- [ ] `.research-page__header` `border-left: 3px` vs `.research-step-header` `border-left: 4px` — 1 px difference between two stacked left-accent rails.

### 9.6 Table cell rhythm
- [ ] Bearing/Distance table (`[projectId]/page.tsx:2269-2284`) uses `0.5rem 0.6rem` headers / `0.4rem 0.6rem` cells, light theme. Deed-chain table four lines below (`:2347-2363`) uses `0.4rem 0.6rem` headers / `0.3rem 0.6rem` cells, dark theme. Two table cell scales + two themes in one tab.

## 10. Mobile-specific alignment

### 10.1 Form rows
- [ ] `money/[id].tsx:1105-1128` — date display matches TextField (56 px) but the tax-flag chip row right below it is `minHeight: 44`. Adjacent rows step down.
- [ ] `capture/index.tsx:614-653` — `prefixChip` (40), `flagRow` (56), Button (60) — three control-row heights in one capture form.
- [ ] `time/edit/[id].tsx:498-504` has its own `androidValue` style block duplicating the Receipt-detail style → drift when one is tweaked.

### 10.2 List rows
- [ ] `lib/JobCard.tsx:67-76` — `footerRow alignItems: 'center'` mixes 13-pt address with `StageChip` (paddingV 4 + emoji). On iOS the stage emoji renders 2-3 px above the address baseline.
- [ ] `lib/JobCard.tsx:55-65` — `headerRow space-between` has only one child → dead layout intent, the `space-between` is a no-op.
- [ ] `lib/ReceiptCard.tsx:181-186` — footerRow mixes 13-pt subtitle with paddingV-2 status chip — chip looks visibly short.
- [ ] `lib/PointCard.tsx:63-80` — tag pill (paddingV 3), Menlo 17-pt name, 13-pt media count with emoji. Menlo's ascenders + emoji baseline give the right-side count a visibly different vertical position from the left tag pill.
- [ ] `lib/Timesheet.tsx:188-198` — outer `dayHeader alignItems: 'baseline'` nested inside `dayHeaderLeft alignItems: 'center'` containing a StatusChip. Baseline-vs-centre conflict → StatusChip sits below the date baseline.
- [ ] `numberOfLines={1}` empty-content collapse: JobCard / ReceiptCard use a `' '` nbsp trick to preserve minHeight (`JobCard.tsx:72`, `ReceiptCard.tsx:86`); PointCard doesn't → list rows have heterogeneous heights.

### 10.3 Header row variants for the same idiom
- [ ] Heading + Cancel row uses **four different alignment strategies** for the same UI pattern:
  - `money/[id].tsx:344-362` — `alignItems: 'flex-start'` + `paddingTop: 4` hack on Cancel (only works when heading is exactly two lines).
  - `time/edit/[id].tsx:226-239` — `alignItems: 'baseline'`.
  - `capture/index.tsx:90-102,305-319` — `alignItems: 'center'` + `closeButton padding: 8`.
  - `me/uploads.tsx:122-136` — fake centring via `headerSpacer width: 60`.
- [ ] **Eight different page-title sizes** across the app: Jobs/Money/Time/Sign-in 32, Receipt detail 24, Capture 28, Time edit 26, Uploads 18, Gear 14, Search 22.

### 10.4 Banners + cards
- [ ] `money/[id].tsx:1067-1083` — LockedBanner `borderRadius: 10` vs DuplicateBanner (`:833`) and ReviewBanner (`:958`) `borderRadius: 12`. Three stacked banners, one has a different corner radius.
- [ ] `me/index.tsx:606-705` — AboutRow rolls its own buttons (paddingV 10, paddingH 14, borderRadius 8), then the screen ends with a `<Button>` Sign-out (minHeight 60, paddingH 24, borderRadius 12). Two button systems on one screen.
- [ ] `gear/index.tsx:298-307` — StatTile `paddingVertical: 16, paddingHorizontal: 14` — asymmetric inset. Tiles in a flex-wrap grid will have differently inset content if their labels wrap.

### 10.5 FAB alignment
- [ ] CaptureFab (`lib/CaptureFab.tsx:32`) is 64 px; ScannerFab (`lib/ScannerFab.tsx:422-424`) is 56 px. Pick one size.
- [ ] CaptureFab `marginTop: -18` lifts above the 64-px tab bar → bottom edge sits at `tabBar.top + 18`. ScannerFab `bottom: bottomInset = 80` (i.e. `TAB_BAR_HEIGHT + 16`). On the same screen ScannerFab sits ~34 px higher than CaptureFab's centre. **Two floating circles at different heights.**
- [ ] CaptureFab uses `slot alignItems: 'center'`; ScannerFab uses `layer.right: 16, alignItems: 'flex-end'`. No shared notion of where floating elements sit.

### 10.6 Section-spacing rhythm
- [ ] `time/index.tsx` — five different inter-section gaps: 16, 24, 24, 32, 24.
- [ ] `money/[id].tsx` — `headerRow.marginBottom: 16`, `lockedBanner.marginBottom: 20`, `photoBlock.marginBottom: 24`, `section.marginBottom: 8`.
- [ ] `jobs/[id]/index.tsx` — 12/16/24 mix on a long ScrollView.
- [ ] `MyTruckSection.tsx:166 sectionTitle.marginBottom: 12` vs `MyPersonalKitSection.tsx:200 4` — same page, two adjacent sections, different title-to-body gaps.

### 10.7 Tab-bar baselines
- [ ] `(tabs)/_layout.tsx:126-128` — emoji icons (📋 / ⏱ / 👤 / 🛠 / `$`) render at different baselines on iOS. With `paddingTop:8, paddingBottom:8`, the inactive emoji + 11-pt label can shift 2-3 px between tabs. Wrap each glyph in a fixed-height `View { height: 28, justifyContent: 'flex-end' }` so all five share a baseline; or swap to `@expo/vector-icons` Ionicons.

---

## 11. Naming + titles audit

### 11.1 Mobile tab labels (highest visibility — every session)
- [ ] **Tab "$" → "Money"** (`mobile/app/(tabs)/_layout.tsx:92`). Single-character label is unscannable.
- [ ] **Tab "Me" → "Account"** (`(tabs)/_layout.tsx:99`) + add a screen H1 of "Account" in `(tabs)/me/index.tsx`. "Me" is ambiguous; the screen is Security / Notifications / Backups / Display / Storage / Privacy / About.
- [ ] **Tab "Gear" → "Equipment"** (`(tabs)/_layout.tsx:111`). "Gear" collides with surveying-gear vocabulary.
- [ ] **Capture screen H1** `'New point'` → `'New Point'` (`capture/index.tsx:91`) — match Title Case used by every other tab.

### 11.2 CAD nav labels
- [ ] `AISidebar.tsx:66` tab `label: 'Why'` → **"Explanations"** (matches the internal tab id).
- [ ] `AISidebar.tsx:71` tab `label: 'Versions'` → **"History"** or **"Audit trail"** (current description says "audit trail of seal events + survey-description revisions"; "Versions" implies file history).
- [ ] `MenuBar.tsx:329-575` — top menu lacks an **"AI"** category despite a large AI cluster (lines 353-385) buried in File. Move "Run AI Drawing Engine…", "Show AI review queue", "AI clarifying questions…", "AI drawing chat…", "AI sidebar (tabs)" to a new top-level **"AI"** menu.

### 11.3 RECON nav labels
- [ ] `[projectId]/page.tsx:1547-1561` — project nav: `📐 Boundary Viewer · 📁 Documents · 📱 Field Report · 📚 Library · 💳 Billing`. The 📱 on Field Report is misleading (it's a printable office report). Drop the glyph or rename to **"Field Brief"**.
- [ ] `[projectId]/page.tsx:1833,1839-1846` — `'survey'` tab rendered as `"📐 Survey Data"` is vague (every tab is survey data). Rename to **"Boundary Calls"** or **"Measurements"**.

### 11.4 Page / browser titles
- [x] `app/admin/cad/page.tsx:6` — dynamic browser tab title — shipped in `40903ae` (Slice U15). `CADLayout.tsx:126` sets `document.title` to `'{drawing.name} — Starr CAD'` whenever the active drawing changes. Multi-drawing tabs are now distinguishable.
- [ ] `app/admin/research/layout.tsx` exports no metadata, so every research route inherits `app/admin/layout.tsx:6` default `'Admin | Starr Surveying'`. Add per-route metadata so multi-tab users can tell projects apart.

### 11.5 Setting / field names leaking developer terms
- [ ] `AIProvenancePopup.tsx:87` — label `"Batch id"` → **"AI run ID"** or **"Pipeline run"**.
- [ ] `AICopilotSidebar.tsx:163` — `"Saved code resolutions"` → **"Saved code → layer mappings"** or **"Remembered code answers"**.
- [x] `lib/cad/hotkeys/registry.ts` user-facing descriptions are clean — current rows for `ai.parseCodes` / `ai.fillCorners` / `ai.checkClosure` / `ai.createLayerFromCodes` / `ai.explainFeature` / `ai.undoBatch` / `ai.startAuto` / `ai.pauseAuto` / `ai.replaySequence` (lines 100-109) all read in surveyor language; no `Phase 6 §32 Slice N` strings survive. The only "Phase 6" mention is a `//` code-comment at line 98 that isn't rendered anywhere.
- [x] `lib/cad/hotkeys/registry.ts:106` — `aiBatchId` store-key leak already paraphrased. The `ai.undoBatch` row now reads `"Undo every feature produced in the most recent AI turn as a single group."` — surveyor-readable; no camelCase store key.
- [ ] `types/research.ts:7-15` — `WORKFLOW_STEPS` labels `'Configure'`, `'Analyzing'`, `'Verifying'` are state-machine names exposed in `STATUS_LABELS` as filter chips. Rename to noun states: **"Setup"** / **"Research in progress"** / **"Verifying drawing"**.

### 11.6 Vague button labels (add an object)
- [x] `MenuBar.tsx:338` — "Save As…" duplicate dropped in `b8da39d`. Both entries called the same `saveDocument`; there's no save-as semantics in a web app (the browser anchor-click already lets the user rename on save). Only `Save` (Ctrl+S, blob download) + `Save to Cloud…` (DB-backed) remain.
- [x] `time/index.tsx` — week-card primary button now reads `label="Submit week"` (line 366; moved since the audit). Verb-object form makes intent unambiguous next to the adjacent Export-CSV button.
- [x] Verb-object Save labels — `money/[id].tsx:615` `label="Save receipt"`, `jobs/[id]/points/[pointId].tsx:508` `label="Save point"`, `time/edit/[id].tsx:364` `label="Save time entry"`. (Line numbers drifted since the original audit.)
- [x] `ConfirmDialog.tsx:140` fallback audit — all 3 call sites already pass explicit verbs: `LayerTransferDialog.tsx:238` `confirmLabel: 'Move'`, `ToolOptionsBar.tsx:1810` `confirmLabel: 'Delete'`, `CanvasViewport.tsx:10277` `confirmLabel: 'Delete'`. No site relies on the `'Confirm'` default.
- [x] `DrawingPreferencesPanel.tsx:408` — bare `<span>Apply</span>` → `<span>Apply fill</span>`. The doc proposed "Apply preferences" but the checkbox actually toggles whether the per-feature fill color is rendered (vs `fill: 'none'`), not preferences — "Apply fill" matches the underlying state.
- [x] `SaveToDBDialog.tsx` — "Database" engineer-speak removed. Header at line 171 reads `'Save Drawing'` / `'Open Saved Drawing'`; the delete confirm (`4d4d61f`) reads "Delete X from your saved drawings?" instead of "from the database". The Starr-Cloud brand rename remains a separate marketing call.

### 11.7 Internal-versioning leakage in UI copy (14+ sites)
- [x] `CopilotCard.tsx:166` — duplicate of §2.4 row; tooltip now reads "Skip this proposal and open the chat so you can ask the AI to revise it." No Slice-N leak in any user-visible string.
- [x] `AICopilotSidebar.tsx:220` — §32.13 Slice 11 leak gone. Tooltip now reads `"Kick off an AUTO run — the AI walks the project intake and proposes the drawing."`
- [x] `AICopilotSidebar.tsx:237` — verified clean. Tooltip reads `"Halt AUTO at the next boundary and drop into COPILOT (Ctrl+Shift+P)."` — only the keyboard shortcut surfaces, no Phase/Slice reference.
- [x] `AIProvenancePopup.tsx:107` — Phase 6 §3–§10 leak gone. Body now reads `"Run the full AI Drawing Engine for the reasoning, weighted data sources, assumptions, and confidence breakdown."`
- [x] `AIDrawingDialog.tsx:138` — "Phase 6 pipeline" leak gone. Body now reads `"AI Drawing Engine. {n} point{s} loaded. …"`.
- [x] `OrientationDialog.tsx:270` — "Phase 6" thrown-error leak gone. Now reads `'AI deed orientation is not available yet — use a manual method below.'`
- [x] `OrientationDialog.tsx:405` — "Phase 6 will add" leak gone. Span now reads `"— AI deed-matched calls will appear here once that path lands"`.
- [x] `OrientationDialog.tsx:492` — "Phase 6 — coming soon" leak gone. Tab option label now reads `'Coming with the AI Drawing Engine'`.
- [x] `OrientationDialog.tsx:567` — "— Phase 6" suffix gone. Heading now reads `<div>AI Deed / Plat Import</div>`.
- [x] `lib/cad/hotkeys/registry.ts` — duplicate of the §11 audit row above. No user-visible Phase / Slice references survive in the registered shortcut descriptions.
- [x] `mobile/app/(tabs)/jobs/index.tsx` empty-state copy — the "Mobile job creation lands later in Phase F1." string no longer appears in `mobile/app/(tabs)/jobs/index.tsx`; verified via `grep "Mobile job creation"`. Empty state has been rewritten to surveyor language.
- [x] `mobile/app/(tabs)/gear/index.tsx` source-path leak — the `"PowerSync sync rules (mobile/lib/db/sync-rules.yaml) must be deployed…"` footnote no longer appears in `mobile/app/(tabs)/gear/index.tsx`; verified via `grep "sync-rules\.yaml"`.
- [x] `mobile/app/(tabs)/me/index.tsx` "Coming soon" section — neither the section title nor the F1+ body string survives in `mobile/app/(tabs)/me/index.tsx`; verified via `grep "Coming soon\|Profile editing.*F1"`. The remaining F1+ reference (line 67) is a `//` code-comment, not rendered anywhere.
- [x] `mobile/app/(tabs)/time/index.tsx` smart-prompts hint — `time/index.tsx:407` now reads `"Stay-clocked-in prompts and GPS auto-suggest are on the roadmap."` — no `F1 #7 and #8` leak. (Remaining F1 references on lines 47/49/52/239 are `//` code-comments, not rendered.)

### 11.8 Hardcoded staffing in mobile (5 sites)
- [x] Hardcoded "Henry" staffing — `grep -rn "Henry" mobile/app/ --include="*.tsx"` returns no matches. All cited sites have been rewritten to role-aware copy.

### 11.9 Acronyms without definitions
- [ ] **RPLS** (Registered Professional Land Surveyor) appears across `RPLSReviewModePanel.tsx`, `RPLSSubmissionDialog.tsx`, `CADLayout.tsx:31,148,883-898`, `MenuBar.tsx:382-384`, `AISidebar.tsx:80`. New employees and trainees won't know the acronym. Add a tooltip on first use or rename UI copy to **"Licensed surveyor review"**.
- [ ] **RDP** (Ramer-Douglas-Peucker) in `lib/cad/hotkeys/registry.ts:64` `'Simplify (RDP)'` and `MenuBar.tsx:457`. Rename to **"Simplify polyline"** with tolerance in tooltip.
- [ ] **AUTO / COPILOT / COMMAND / MANUAL** AI modes — uppercase across CAD UI but no definition anywhere. Add a one-time tip when the user first cycles modes (`Ctrl+Shift+M`).

### 11.10 Aria / tooltip inconsistencies
- [x] `CADLayout.tsx` close button `aria-label="Dismiss"` outlier — flipped to `"Close"` so every closer across CAD's 15 dialogs / panels reads the same. (The line in question moved to :653 between the audit and this fix; the Compass-notice dismiss button is the only one that drifted.)
- [x] `AISidebar.tsx` inner tab strip aria-label collision — shipped in `4d4d61f`. Inner-nav `aria-label="AI sidebar tabs"` → `aria-label="Tabs"`; the surrounding panel still carries "AI sidebar" so the screen reader no longer echoes it twice on every focus.
- [ ] `StatusBar.tsx:283,290-292` — `title="Active tool"` / `title="Active layer"` with no `aria-label`. Screen readers announce just the value without context.
- [x] `research/[projectId]/page.tsx` toast close `aria-label="Dismiss"` outlier — flipped to `"Close"` (line :3601, moved since the original audit). RECON's other 4 closers — `CoordinateEntryPanel`, `VertexEditPanel`, both BriefingPanel buttons — already used `"Close"`. Product-wide closers now read the same.

### 11.11 Error / empty-state copy that lacks an action
- [x] `MenuBar.tsx` + `useKeyboard.ts` alert copy — shipped in `4d4d61f`. All "See the browser console for details" tails replaced with "Try again, or contact support if it keeps failing." Surveyor-actionable instead of dev-speak.
- [ ] `SaveToDBDialog.tsx:157` — bare `"Delete failed"` with no recovery path.
- [ ] `CADLayout.tsx:540` — `"…Starting fresh."` actionable, but offer **"Download the raw autosave"** so users don't lose data silently.
- [ ] `research/components/DocumentUploadPanel.tsx:35` — generic `'Error'` status pill with no detail.
- [ ] `research/page.tsx:73` — `'Failed to load projects. Please try again.'` → add a Retry button instead of asking the user to refresh.

### 11.12 Capitalisation / verb tense
- [ ] CAD tool labels mix `Point` / `Line` / `Polyline` in `MenuBar.tsx:551-553` with `Draw Point` / `Draw Line` in `lib/cad/hotkeys/registry.ts:38-39`. Standardise on verb-first ("Draw Point").
- [ ] `lib/cad/hotkeys/registry.ts` mixes "Drop POINT" (uppercase) vs "Drop a POINT" vs "drop a perpendicular line" (lowercase) vs "Erase features" — pick one casing for feature types.
- [x] `MenuBar.tsx` Snap toggle reads as state, not action — shipped in `4d4d61f`. Labels now read `Enable Snap` / `Disable Snap`, matching the adjacent `Show Grid` / `Hide Grid` idiom. (The doc's earlier proposed wording was "Turn snap on / off"; the shipped wording is the cleaner verb-first form per the §13 verb-first standardisation slice.)

---

## 12. Updated implementation sequence

Insert these slices into the existing §5 sequence. Naming items can land anywhere because they're surface-only; alignment items should follow Phase A (shared primitives).

### Phase A+ — Alignment primitives (do alongside Phase A)
1. **Slice A6 — Mobile theme tokens.** Add `controlHeight`, `controlRadius`, `spacing.xs/sm/md/lg/xl` to `lib/theme.ts`. Migrate `Button.tsx` + `TextField.tsx` to the new tokens so they share dimensions.
2. **Slice A7 — Mobile `<Chip>` + `<ActionRow>` primitives.** Replace the six chip paddings + four action-row implementations.
3. **Slice A8 — CAD icon-size + chrome-height tokens.** Pick three icon sizes + one chrome row height. Codemod the obvious offenders.
4. **Slice A9 — CAD `<DialogShell>` primitive.** Migrate every dialog to one header / footer / button-pad standard.
5. **Slice A10 — RECON `.recon-stat` + `.recon-data-card` + `<ResearchModal>` primitives.** Migrate Easements + stats + 3 modal patterns.

### Phase E — Naming + copy pass (low-risk, can land last)
6. **Slice E1** — Mobile tab + screen H1 renames (`$` → Money, `Me` → Account, `Gear` → Equipment).
7. **Slice E2** — Strip every "Phase X / Slice X / F1 #N / Coming soon / lands later" string from user-visible copy across all three apps (14+ sites).
8. **Slice E3** — Strip hardcoded staffing ("Henry") from mobile copy (5 sites). Replace with role-aware text.
9. **Slice E4** — CAD AI menu top-level extraction. Move 6 AI items out of File.
10. **Slice E5** — Dynamic browser tab titles for CAD + RECON. **Shipped (U15)** in `40903ae`: `CADLayout.tsx:126` sets `'{drawing.name} — Starr CAD'`; `app/admin/research/layout.tsx` exports `metadata.title: 'Research — Starr Surveying'`; `[projectId]/page.tsx:210` flips to `'{project.name} — Research'` on project load, reverts on unmount.
11. **Slice E6** — `lib/cad/hotkeys/registry.ts` descriptions: strip Phase/Slice refs, paraphrase `aiBatchId`/`aiOrigin` into surveyor language.
12. **Slice E7** — Wire `usePathname()` into `.research-project-nav__link--active` (the active state CSS already exists; just apply it). One-line fix that solves the "where am I?" problem.
13. **Slice E8** — Verb-first standardisation on CAD tool labels + casing pass on feature-type names ("POINT" everywhere or "point" everywhere).

## 13. Quick-win shortlist (highest ROI per hour)

If only ten things ship from Part 2, do these:

1. Change `AICopilotSidebar.tsx:271` `px-2 py-2` → `px-3 py-2` (the user's primary complaint). **Shipped (U28)** — bumped to `px-3 py-3` and `space-y-1.5` for a less cramped input row.
2. Wire `.research-project-nav__link--active` via `usePathname()` (one-line fix, broken everywhere right now).
3. Add `border-bottom: 2px solid transparent` to inactive `.review-summary-panel__tab` (stops the 2 px content shift on every tab click).
4. Define the missing `research-pipeline__*` CSS classes (the Pipeline page is currently unstyled).
5. Mobile tab `$` → `Money`.
6. Strip every "Phase X / Slice X / Coming soon" string from user-visible copy.
7. Replace `SaveToDBDialog.tsx` "Database" wording with the actual storage product name. **Shipped (U28)** — delete confirmation now reads "Delete X from your saved drawings?" instead of "from the database".
8. Move CAD AI menu items out of File into a top-level AI menu.
9. Unify `lib/Button.tsx` + `lib/TextField.tsx` to a single `controlHeight` token.
10. Strip hardcoded "Henry" from mobile copy (5 sites).

---

*End of UX Polish Plan (Part 2 added 2026-05-12).*


*End of UX Polish Plan*
