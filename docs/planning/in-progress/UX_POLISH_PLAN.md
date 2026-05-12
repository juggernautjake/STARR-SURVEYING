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
- [ ] **Mobile**: fix the missing `useResolvedScheme()` imports in `lib/Button.tsx:35`, `lib/TextField.tsx:29`, `lib/JobCard.tsx:28`, `lib/CaptureFab.tsx:36`, `lib/Timesheet.tsx:35` — either it's dead code or a build break, and at minimum the theme system isn't actually applied consistently.
- [ ] **CAD**: pull `app/styles/globals.css:7-15` brand tokens (`--brand-red`, `--brand-blue`, `--brand-green`, `--shadow-brand`) into the CAD shell so the marketing site and the CAD app share an identity (currently they look like different products).

### 1.3 Unified confirmation primitive
Three different "are you sure?" patterns coexist within each app. Mixed patterns mean a destructive action is sometimes a styled modal and sometimes the OS dialog.

- [ ] **CAD**: standardise on one `<ConfirmDialog>` component matching the existing dark-shell pattern. Audit current modal layouts (`IntersectDialog`, `LayerTransferDialog`, `ElementExplanationPopup`) for consistency.
- [ ] **RECON**: replace the 11 `window.confirm()` calls with the shared `<ConfirmDialog>`. Affected sites: `[projectId]/page.tsx:421, 510, 725, 741, 1124, 1138, 1239, 2870`; `components/AnnotationLayerPanel.tsx:208`; `components/DrawingCanvas.tsx:1390`; `components/DrawingPreferencesPanel.tsx:188`; `components/ElementDetailPanel.tsx:85,107`; `components/TemplateManager.tsx:118`.
- [ ] **Mobile**: replace `Alert.alert` confirmation on sign-out (`me/index.tsx:224`) with at minimum a 2-step confirm. Note: destructive `Alert.alert` `style: 'destructive'` works on iOS only — Android shows blue. Audit `photos.tsx:223`, `points/[pointId].tsx:240,250`, `money/[id].tsx:306-326`.

### 1.4 Shared screen-header primitive
Each app re-rolls headers per screen, with drift in title scale, back-button placement, and SafeArea handling.

- [ ] **Mobile**: build `<ScreenHeader title back?  actions?/>` + `<ScreenScroll edges={…}/>` shared components owning SafeAreaView, title typography, optional back+close, optional right-side action. Use everywhere instead of the five different header treatments per tab (`jobs/index.tsx:54-82` vs. `money/index.tsx:65-132` vs. `time/index.tsx:202-205` vs. `gear/index.tsx:113-124` vs. `me/index.tsx:254-259`).
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
- [ ] **MenuBar File menu has 28 items** in one nesting level (`MenuBar.tsx:329-385`). Same-action duplicates ("Save" vs "Save As…" at line 338). Re-nest using submenus and drop duplicates.
- [ ] **LayerTransferDialog at 2334 lines** has 4 source-mode tabs, 6+ option groups, type-IDs filtering, code remapping, traverse routing, presets all in one modal. Split into tabs or a wizard.

### 2.4 Discoverability gaps
- [ ] **Variant flyouts on ToolBar buttons** are signalled by a 5-pixel corner triangle at 40% opacity (`ToolBar.tsx:653-656`). Replace with a visible chevron + a "More variants" hint in the tooltip.
- [ ] **Snap-type popover** is hidden behind a small `▾` chevron in the StatusBar (`StatusBar.tsx:317-324`). No keyboard discoverability.
- [ ] **AI mode chip** in the status bar (`StatusBar.tsx:250-278`) is the only entry to the four-mode framework. `Ctrl+Shift+M` lives in the tooltip only. Add a menu-bar entry under Tools or AI.
- [ ] **Two-character chord shortcuts** (`Z E`, `I X`, `O A`, `R V`, `S F`, `S N`, `C R`, `O F`, `I N V`, `F P`, `C C`, `I M`) have no on-screen progress indicator (`MenuBar.tsx:467,418,517-545`). **Build a chord-in-progress HUD** at bottom-center showing completable second keys.
- [ ] **"Recover unsaved drawings…"** buried as the 4th File-menu entry (`MenuBar.tsx:335`). Add a status-bar banner when there's a recoverable drawing older than the current one.
- [ ] **"Hidden Items"** sits as a small text-link at the bottom of LayerPanel (`LayerPanel.tsx:651-657`). Add a "N hidden features" pill in the StatusBar when count > 0.
- [ ] **Promote draft layer** button only appears on draft layers (`LayerPanel.tsx:456-494`) with no documentation in MenuBar/Help.
- [ ] **Three AI surfaces** (DrawingChatPanel, AISidebar, AICopilotSidebar) with overlapping responsibilities and three File-menu entries (`MenuBar.tsx:365-371`) that never explain the difference. Either consolidate (per §2.2) or label each entry by intent.
- [ ] **Settings dialog only via Help → Settings & Preferences** (`MenuBar.tsx:570`). Add a gear icon to the MenuBar's right side next to the document name; doubles as a visible sibling for the otherwise lonely document name.
- [ ] **Layer-rotation feature** buried as the second-to-last item of the layer right-click menu (`LayerPanel.tsx:725-774`); numeric input appears in place — easy to miss.
- [ ] **Intersect tool** chord shortcut `I X` (`MenuBar.tsx:418`) is invisible without browsing the Edit menu. The new chord HUD (above) handles this.
- [ ] **Compass / RECON import** triggered by external apps writing to localStorage (`CADLayout.tsx:166-207`); no in-app entry point.
- [ ] **CopilotCard "Modify" tooltip** says "Ask the AI to revise this proposal (Slice 6)" leaking internal versioning (`CopilotCard.tsx`). Update copy.

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
- [ ] **Stats cards are decorative, not actionable** (`[projectId]/page.tsx:1610-1631`). Wrap each in a button that jumps to the corresponding review tab.

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
- [ ] **`WorkflowStepper.tsx` is dead code** — never imported. Delete + document the `PipelineStepper.tsx:79` stage labels vs the 7-step `WORKFLOW_STEPS` mismatch.
- [ ] **Keyboard shortcuts** registered in `[projectId]/page.tsx:1281-1320` (Ctrl+S, Ctrl+Z/Y, Escape, 16 tool letters). Only tool letters show as `<kbd>` badges. Add a `?` overlay listing every shortcut + `aria-keyshortcuts` on Save/Undo/Redo.
- [ ] **"Initiate Research & Analysis"** auto-fires a long-running pipeline with no preview of cost/duration (`[projectId]/page.tsx:1655-1668`). Add a confirm dialog with the expected fan-out.
- [ ] **Re-run dialog focuses the unsafe option** (`[projectId]/page.tsx:1768-1825`). Make "Update Parameters First" the default focus.
- [ ] **Coherence Review verdict** is rendered halfway down the Summary tab below the stats row + narrative (`[projectId]/page.tsx:1918-2407`). Move the verdict pill to the top of the tab.
- [ ] **"Misc documents filtered out" hint** (`[projectId]/page.tsx:2746-2750`) is a passive gray line — no link to view filtered items. Add a "View hidden misc captures" link.

---

## 4. STARR Mobile (field app)

### 4.1 Cohesion / theme
- [ ] Replace the five hand-rolled tab headers with the shared `<ScreenHeader>` primitive (§1.4). Affected: `jobs/index.tsx:54-82`, `money/index.tsx:65-132`, `time/index.tsx:202-205`, `gear/index.tsx:113-124`, `me/index.tsx:254-259`.
- [ ] Standardise title type-scale. Currently 32px (tab indexes), 28px (job detail / point photos), 24px (receipt detail), 14px (Gear).
- [ ] Fix the missing `useResolvedScheme` imports (§1.2) so the theme system actually applies.
- [ ] Add missing palette entries (`amber`, `amberText`, `reviewBg`, `successContrast`) so the Sun theme works on Money / Receipt / Gear screens.
- [ ] Tab label "$" → "Money" (`(tabs)/_layout.tsx:92`). Single-char labels are unscannable.
- [ ] Replace emoji tab icons with `lucide-react-native` so active/inactive tint actually works.
- [ ] Remove duplicate `Stack.Screen options={{ headerShown: false }}` calls inside child screens — `me/uploads.tsx:121`, `me/privacy.tsx:70`.

### 4.2 Positioning
- [ ] **Job detail has no Back affordance.** `jobs/[id]/index.tsx` ScrollView has a heading then content — only the 404 branch has back (line 59). Surface a real back via `<ScreenHeader back/>` or expose the system header in `jobs/[id]/_layout.tsx`.
- [ ] **Tab bar height (64 px) + bottom padding doesn't include safe-area insets** (`(tabs)/_layout.tsx:12,46-55`). Home-indicator phones can have labels sitting too close to the indicator strip.
- [ ] **CaptureFab + ScannerFab collide on narrow phones in landscape** — both sit within ~50 px (`ScannerFab.tsx:48,416-419`, `CaptureFab.tsx:87`).
- [ ] **Money header search-pill** at `paddingHorizontal: 10, paddingVertical: 6` (`jobs/index.tsx:62-80`) — ~32 px touch target, only `hitSlop={8}` rescues it.
- [ ] **Sign-out button at the bottom of a 2000+px Me scroll** (`me/index.tsx:536-542`) — out of thumb zone *and* easy to accidentally tap after scrolling all the way down. Group account actions at the top of the Me tab.

### 4.3 Cramped / hard-to-navigate
- [ ] **Me tab is a 7-section ScrollView with no anchors / no sticky chrome** (`me/index.tsx:261-542`). Add a sticky in-tab subnav or collapsible section headers.
- [ ] **Receipt detail is ~700 lines of form** with 13 sections (`money/[id].tsx:331-602`). Add a sticky Save bar above the keyboard.
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
- [ ] **No haptics anywhere.** Plan §7.1 calls for "glove-friendly" but only size is addressed. Add `Haptics.impactAsync` on primary tap / capture / save / sign-out flows.
- [ ] **Sign-out has no confirmation** (`me/index.tsx:224-240,536-542`). One stray tap signs out + may drop to login if biometrics off.
- [ ] **SafeArea `edges={['top']}` only** on modal-style screens — `money/[id].tsx:334,1001`, `capture/index.tsx:88,295`, `jobs/[id]/points/[pointId].tsx:268,559`. Add `'bottom'` so the home indicator doesn't sit on Delete/Save.
- [ ] **`KeyboardAvoidingView` `behavior: 'padding'` is iOS-only** in `sign-in.tsx`, `forgot-password.tsx`, `capture/index.tsx`, `money/[id].tsx`, `jobs/[id]/points/[pointId].tsx`, `time/edit/[id].tsx`. Add an Android branch (`'height'`) so the keyboard doesn't cover totals/save.
- [ ] **Tab bar covers content** in receipt detail when scrolled to bottom (`money/[id].tsx:1042-1046`). The 64px tab bar eats ~14px of the Delete button.
- [ ] **`numberOfLines` clamps strip valuable info** — `JobCard.tsx:57,62,69` clamps title / subtitle / address to 1 line. Typical Texas job names ("Jenkins Boundary Survey - 240ac off Belton Lake Rd") disappear at column 22.
- [ ] **No pull-to-refresh** on Jobs / Money / Time. PowerSync is reactive but users expect the gesture. `jobs/index.tsx:36` has a TODO comment.
- [ ] **Sun-theme toggle is 3 taps deep** in Me → Display. Plan §7.1 §7.3 calls for "1-tap toggle". Add a long-press on the tab bar or a Me-header pill.
- [ ] **Discard duplicate / Keep — different receipt buttons wrap** because each has `minHeight: 60` + `paddingHorizontal: 24` (`money/[id].tsx:868-895`). On smaller phones the second drops to a second line — looks like two unrelated buttons. Stack vertically below a breakpoint.

---

## 5. Implementation sequence

Each slice is small enough to ship in one PR. Phases land in this order so the cross-cutting fixes (§1) are in place before per-app touch-ups depend on them.

### Phase A — Shared primitives (do first)

1. **Slice A1** — CAD design-token CSS variables + Tailwind extension. Migrate the 6+ inline `#1a1f2e` / `#2a2f3e` sites. No visible change yet; future slices depend on this.
2. **Slice A2** — RECON design-token audit. Migrate the workspace page's 175 inline-style blocks to `AdminResearch.css` classes. Touches one big file but no behaviour change.
3. **Slice A3** — Mobile palette gaps. Add `amber`/`amberText`/`reviewBg`/`successContrast` to `lib/theme.ts`. Fix the missing `useResolvedScheme` imports across `lib/Button.tsx`, `lib/TextField.tsx`, `lib/JobCard.tsx`, `lib/CaptureFab.tsx`, `lib/Timesheet.tsx`.
4. **Slice A4** — Shared `<ConfirmDialog>` per app + audit existing destructive flows. CAD: harmonise existing modal headers. RECON: replace all 11 `window.confirm()` calls. Mobile: replace `Alert.alert` sign-out.
5. **Slice A5** — Mobile `<ScreenHeader>` + `<ScreenScroll>` shared components. Adopt on every tab index + detail screen.

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
16. **Slice C4** — Stat tiles become actionable buttons.
17. **Slice C5** — Stage-3 navigation row grouped by intent; destructive Re-run in its own group.
18. **Slice C6** — Easements tab 2-column grid + sticky in-tab subnav.
19. **Slice C7** — Delete `components/WorkflowStepper.tsx` + document `PipelineStepper` step semantics.

### Phase D — Mobile highest-impact

20. **Slice D1** — Real back affordance on every detail screen via `<ScreenHeader>`.
21. **Slice D2** — Touch-target audit pass (≥ 44pt on every primary action).
22. **Slice D3** — Add `'bottom'` SafeArea edges on modal-style screens; add Android `KeyboardAvoidingView` branch.
23. **Slice D4** — Sign-out confirmation; reposition account section to top of Me.
24. **Slice D5** — Pull-to-refresh on Jobs / Money / Time.
25. **Slice D6** — Swipe-to-delete on photo / note / file rows.
26. **Slice D7** — Sticky Save bar above keyboard on Receipt detail + Point detail + Time edit.
27. **Slice D8** — One-tap Sun-theme toggle (tab-bar long-press or Me-header pill).
28. **Slice D9** — Haptics on primary actions (capture / save / sign-out).

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

*End of UX Polish Plan*
