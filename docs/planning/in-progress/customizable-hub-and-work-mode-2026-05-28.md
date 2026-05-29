# Customizable Hub + Work Mode — sliced planning (2026-05-28)

> Status: in-progress. ~107 slices across 26 phases. One slice = one commit. Slice numbering continues from the backend-audit doc (1–77), starting here at **Slice 78**.
>
> Design rationale lives separately in v2 (kept inline below at the top for self-contained reading). This document is the executable breakdown.
>
> Author: Jacob (user) + Claude (cloud planning session 2026-05-28).

---

## 0 · Design rationale (compressed)

- **Hub** at `/admin/me` — widget canvas + fixed greeting + clock-in pill. Drag/resize widgets, theme the whole page, persona-default layout for new users.
- **Work Mode** at `/admin/work-mode/[role]` — separate route shell that replaces `AdminLayoutClient`. Streamlined per-role tooling: Field Crew, Drafter, Researcher, Equipment Manager, Bookkeeper, Dispatcher, Office Admin.
- **Theme system** — 12 CSS variables on a scoped wrapper. 11 built-in themes (Starr light/dark, slate, forest, sunset, ocean, plum, high-contrast). Custom theme picker with WCAG-AA contrast guard that blocks failing combinations.
- **Widget customization** — every instance has Layout (size, title, density) · Style (color mode, radius, shadow) · Content (widget-specific filters/columns/limits) · Interaction (click action, refresh interval) settings. Settings panel as a right-rail in edit mode.
- **Adaptive sizing** — every widget defines explicit sub-renders at 5 size buckets (tiny / small / medium / large / xlarge). No clipping, no empty padding. Computed by `sizeBucket(w, h)`.
- **Clock-in** — top-bar pill with live elapsed timer when clocked in. Modal on click-in for job picker + activity tags. Modal on click-out for daily-summary with per-job time allocation.
- **Subscription gating** — every widget definition has a `requiresBundle?: BundleId` field, undefined on every widget for now, wires to `lib/saas/bundle-gate.ts` when pricing ships.
- **Storage** — new `user_hub_layouts` table: `user_email PK · layout_version · widgets jsonb · active_persona · theme · custom_theme jsonb · density · font_scale · hub_settings jsonb · updated_at`.

---

## Phase 1 — DB + theme infrastructure (Slices 78–82)

### Slice 78 — DB migration: `user_hub_layouts` table ✅ shipped
- **Scope:** Create the per-user hub layout table w/ theme, density, font-scale, widgets jsonb, custom_theme jsonb, hub_settings jsonb columns. Indexes on `user_email`.
- **Files:** `seeds/301_user_hub_layouts.sql` (numbers 299 + 300 already in use), `lib/hub/types.ts`
- **Done when:** Migration applies idempotently against staging; TypeScript types compile; no UI changes.
- **Depends on:** —
- **Done:** Migration written with idempotent `CREATE TABLE IF NOT EXISTS` + an `updated_at` auto-touch trigger. `density` + `font_scale` columns get CHECK constraints (`density IN (...)`, `font_scale BETWEEN 0.75 AND 2.00` as a defensive backstop around the app-layer 0.875..1.5 clamp). Types in `lib/hub/types.ts` define `WidgetInstance`, `WidgetCustomization`, `HubLayoutRow`, `HubLayoutPutPayload`, plus the theme/density/scale unions and a `dbRowToHubLayout()` converter that handles `font_scale` returning as string (pg numeric quirk) or number. `tsc` + `eslint` clean.

### Slice 79 — Hub layout API routes
- **Scope:** `GET /api/admin/me/hub-layout` (returns null on no row), `PUT` (full replace), `POST /reset`. Uses `withErrorHandler` + signed-in user check.
- **Files:** `app/api/admin/me/hub-layout/route.ts`, `app/api/admin/me/hub-layout/reset/route.ts`, `__tests__/api/hub-layout.test.ts`
- **Done when:** Routes return correct shapes; tests pass; PUT validates JSONB structure.
- **Depends on:** Slice 78

### Slice 80 — Theme CSS variable layer
- **Scope:** 14 theme CSS variables to `app/styles/themes.css`. `ThemeProvider` React component wrapping `<div data-theme="...">`. Hook `useTheme()` returns current theme id. Hook `useThemeColors()` returns palette as JS values (for charts/canvases).
- **Files:** `app/styles/themes.css`, `lib/hub/theme-provider.tsx`, `lib/hub/use-theme.ts`, `__tests__/hub/theme.test.tsx`
- **Done when:** Variables cascade in DOM; default theme renders identically to current styling; switching themes (programmatically) updates colors live.
- **Depends on:** —

### Slice 81 — Built-in themes: `starr-default` + `starr-dark`
- **Scope:** Define the two brand palettes. Wire to `ThemeProvider`. Add a temporary `?theme=starr-dark` URL param for testing (removed in Slice 82).
- **Files:** `lib/hub/themes/starr-default.ts`, `lib/hub/themes/starr-dark.ts`, `lib/hub/themes/index.ts`
- **Done when:** Switching via URL param visibly changes the hub palette; no contrast regressions on existing pages.
- **Depends on:** Slice 80

### Slice 82 — Theme picker UI in profile settings
- **Scope:** Add Themes tab to `/admin/profile`. Preview tiles for each theme. Save selection to `user_hub_layouts.theme`. On hub load, apply saved theme. Remove `?theme=` URL hack.
- **Files:** `app/admin/profile/components/ThemePicker.tsx`, `app/admin/profile/ProfilePanel.tsx`
- **Done when:** User picks theme, refreshes, theme persists. Default fallback on no row.
- **Depends on:** Slices 79, 81

---

## Phase 2 — Built-in themes (Slices 83–85)

### Slice 83 — Built-in themes: `slate-light` + `slate-dark`
- **Scope:** Add the two neutral themes. Run contrast audit; fix any AA failures.
- **Files:** `lib/hub/themes/slate-*.ts`, `lib/hub/themes/index.ts`
- **Done when:** Both render correctly in picker; pass WCAG AA spot-check.
- **Depends on:** Slice 82

### Slice 84 — Built-in themes: `forest`/`sunset`/`ocean`/`plum`
- **Scope:** Add the four color-variation themes (light variants only this slice).
- **Files:** `lib/hub/themes/{forest,sunset,ocean,plum}-light.ts`
- **Done when:** All four appear in picker; pass contrast audit.
- **Depends on:** Slice 83

### Slice 85 — Built-in themes: high-contrast (light + dark)
- **Scope:** Two WCAG-AAA accessibility themes. Thicker focus rings, larger default font scale, disabled shadows.
- **Files:** `lib/hub/themes/high-contrast-*.ts`, conditional shadow logic
- **Done when:** Both pass AAA (7:1) contrast; shadows hidden; focus rings visible.
- **Depends on:** Slice 84

---

## Phase 3 — Density + font scale (Slice 86)

### Slice 86 — Density + font-scale system
- **Scope:** Spacing token sets per density (compact/comfortable/spacious). Font-scale CSS variable. Pickers in profile settings.
- **Files:** `app/styles/density.css`, `app/admin/profile/components/{DensityPicker,FontScaleSlider}.tsx`
- **Done when:** Density visibly changes spacing; font scale updates type proportionally; saved + persisted.
- **Depends on:** Slice 82

---

## Phase 4 — Greeting + top bar (Slices 87–89)

### Slice 87 — Greeting widget (fixed, top of canvas)
- **Scope:** `HubGreeting` w/ time-of-day greeting + date + clock-in status. Profile-setting override for greeting prefix.
- **Files:** `app/admin/me/components/HubGreeting.tsx` (rewrite), `app/admin/me/page.tsx`, `__tests__/hub/greeting.test.tsx`
- **Done when:** Greeting reflects time-of-day across timezones; date follows locale; clock status reads from time-logs API.
- **Depends on:** Slice 82

### Slice 88 — "Enter Work Mode" button (placeholder)
- **Scope:** Button on greeting card. Disabled w/ tooltip "Coming soon" until Phase 21. Visible only if user has at least one work-eligible role.
- **Files:** `app/admin/me/components/HubGreeting.tsx`, `lib/hub/work-mode-eligibility.ts`
- **Done when:** Visible for field-crew/drafter/researcher/admin; hidden for student-only/teacher-only; tooltip explains.
- **Depends on:** Slice 87

### Slice 89 — Top-bar redesign: clock-in pill + roles dropdown + user menu
- **Scope:** Live clock-in pill w/ elapsed timer; Roles dropdown (view-only persona override); nested Sign Out.
- **Files:** `app/admin/components/{AdminTopBar,UserMenu,ClockInPill}.tsx`
- **Done when:** Pill ticks live timer; Roles dropdown previews layouts; Sign Out works.
- **Depends on:** Slice 88

---

## Phase 5 — Widget infrastructure (Slices 90–93)

### Slice 90 — Widget registry + size-bucket helper
- **Scope:** `lib/hub/widget-registry.ts` w/ `WidgetDefinition` contract. `sizeBucket()` helper w/ comprehensive tests covering every supported (w,h) combo.
- **Files:** `lib/hub/widget-registry.ts`, `lib/hub/size-bucket.ts`, `__tests__/hub/size-bucket.test.ts`
- **Done when:** Registry compiles; `sizeBucket()` tests cover boundaries (3×1=tiny, 6×2=medium, etc.).
- **Depends on:** Slice 78

### Slice 91 — `WidgetFrame` base component
- **Scope:** Shared widget shell: header + body + footer. Supports all `colorMode` values. Empty/loading/error sub-renders. ARIA correctness.
- **Files:** `lib/hub/components/{WidgetFrame,WidgetSkeleton,WidgetEmpty,WidgetError}.tsx`
- **Done when:** Frame renders w/ all 5 colorMode values; empty/loading/error swap on state.
- **Depends on:** Slice 90

### Slice 92 — Static grid renderer
- **Scope:** `<WidgetGrid>` renders widgets at position+size. Responsive collapse (12 → 6 → 1 col). No drag yet.
- **Files:** `lib/hub/components/WidgetGrid.tsx`, `lib/hub/grid-math.ts`, `__tests__/hub/grid.test.tsx`
- **Done when:** Saved layout renders at correct positions; responsive collapse works.
- **Depends on:** Slice 91

### Slice 93 — Persona-default seeding
- **Scope:** When user has no layout row, seed from `inferPersona()`. Static JSON for the 8 persona-default layouts.
- **Files:** `lib/hub/defaults.ts`, `app/api/admin/me/hub-layout/route.ts` (GET reads persona on empty)
- **Done when:** First-time users see sensible layout; admin sees admin default; field crew sees field-surveyor default.
- **Depends on:** Slice 92

---

## Phase 6 — First three widgets (Slices 94–96)

### Slice 94 — Pinned Pages widget
- **Scope:** All 5 size variants. Wires to existing `pinnedRoutes` from nav-store. Settings: pinnedIds, layoutStyle, iconStyle.
- **Files:** `lib/hub/widgets/pinned-pages/{index,Widget,Settings}.tsx`, `__tests__/hub/widgets/pinned-pages.test.tsx`
- **Done when:** Each size variant renders correctly; settings persist.
- **Depends on:** Slice 93

### Slice 95 — Quick Actions widget
- **Scope:** Action catalog (8 starters: clock in/out, new job, approve receipts, view reports, open CAD, send message, capture receipt, schedule). All size variants. Settings: actions, display style, color per action, keyboard shortcuts.
- **Files:** `lib/hub/widgets/quick-actions/{index,Widget,Settings,actions}.tsx`, `lib/hub/quick-actions-catalog.ts`, `__tests__/hub/widgets/quick-actions.test.tsx`
- **Done when:** Each action navigates/opens its target; size variants adapt; ⌘1–⌘9 shortcuts work.
- **Depends on:** Slice 94

### Slice 96 — My Pay widget
- **Scope:** Wire to existing pay data. 5 size variants. Privacy toggle in header. Settings: stats to show, amount style, color amounts, show date.
- **Files:** `lib/hub/widgets/my-pay/{index,Widget,Settings}.tsx`, `__tests__/hub/widgets/my-pay.test.tsx`
- **Done when:** Hits live `/api/admin/my-pay`; size variants from tiny ($22.50/hr) to xlarge (chart + table); privacy toggle saves per-session.
- **Depends on:** Slice 95

---

## Phase 7 — Customization mechanics (Slices 97–100)

### Slice 97 — Edit-mode toggle
- **Scope:** "Customize Hub" button at canvas top-right. Toggles edit mode. Visual affordances: thicker borders, drag handles, X buttons, "+ Add Widget" button, floating Save/Cancel.
- **Files:** `lib/hub/components/EditMode.tsx`, `lib/hub/hub-store.ts`
- **Done when:** Toggle works; affordances appear; Cancel reverts; Save PUTs to API.
- **Depends on:** Slice 96

### Slice 98 — Drag-and-drop (move only)
- **Scope:** `@dnd-kit/core` + `@dnd-kit/sortable`. Drag handle on widget header. Drop repositions. Auto-compaction.
- **Files:** `lib/hub/components/WidgetGrid.tsx`, `package.json`
- **Done when:** User drags widget, drops, layout updates, saves on exit-edit.
- **Depends on:** Slice 97

### Slice 99 — Resize handle
- **Scope:** Bottom-right corner resize handle. Snap to grid. Min/max enforcement. Target-size visual indicator during drag.
- **Files:** `lib/hub/components/WidgetResizeHandle.tsx`, grid math updates
- **Done when:** Resize from 6×2 → 12×3 smoothly; content adapts via size bucket.
- **Depends on:** Slice 98

### Slice 100 — Add-Widget modal
- **Scope:** Catalog modal w/ category tabs. Role + bundle filter. Search input. Click entry → appends to layout w/ default size.
- **Files:** `lib/hub/components/AddWidgetModal.tsx`, `__tests__/hub/add-widget.test.tsx`
- **Done when:** Opens from "+ Add Widget"; categories work; search filters; entries add correctly.
- **Depends on:** Slice 99

---

## Phase 8 — Settings panel (Slices 101–104)

### Slice 101 — Settings right-rail shell
- **Scope:** Right-rail panel w/ 4 tabs (Layout/Style/Content/Interaction). Live preview at top. Close on Esc/click-outside. Mobile full-screen overlay.
- **Files:** `lib/hub/components/{SettingsPanel,SettingsTabs}.tsx`
- **Done when:** Opens on widget click; tabs switch; Esc closes; mobile overlays.
- **Depends on:** Slice 100

### Slice 102 — Settings: Layout tab
- **Scope:** Size grid picker (12×4 visual), show-title toggle, custom-title input, density override radio.
- **Files:** `lib/hub/components/settings/{LayoutTab,SizeGridPicker}.tsx`
- **Done when:** Each field updates customization in real-time; keyboard-accessible.
- **Depends on:** Slice 101

### Slice 103 — Settings: Style tab (built-in color modes)
- **Scope:** Color mode radio (inherit/accent/subtle-accent/status/custom). Status tint sub-radio. Border radius radio. Shadow slider. Live preview.
- **Files:** `lib/hub/components/settings/StyleTab.tsx`, `lib/hub/widget-color-modes.ts`
- **Done when:** Each color mode visibly changes preview; settings save.
- **Depends on:** Slice 102

### Slice 104 — Settings: Content + Interaction tab framework
- **Scope:** Reusable settings components (NumberStepper, MultiSelect, FilterDropdown, ToggleGroup, RoutePicker). Content tab is widget-defined. Interaction tab shared: click action, click target, refresh interval, "see all" toggle.
- **Files:** `lib/hub/components/settings/{InteractionTab,components/{NumberStepper,MultiSelect,FilterDropdown,ToggleGroup,RoutePicker}}.tsx`
- **Done when:** Reusable components work; Interaction tab functions; widget-defined Content tabs render.
- **Depends on:** Slice 103

---

## Phase 9 — Contrast guard + custom themes (Slices 105–107)

### Slice 105 — Contrast calculator + WCAG utilities
- **Scope:** `lib/theme/contrast.ts`: sRGB relative luminance, contrast ratio, AA/AAA checks, auto-derive helpers (lighten/darken bg, pick fg from bg). 20+ specs using known WCAG examples.
- **Files:** `lib/theme/contrast.ts`, `__tests__/theme/contrast.test.ts`
- **Done when:** All specs pass; edge cases (pure white/black, mid-tones) covered.
- **Depends on:** —

### Slice 106 — Custom theme picker
- **Scope:** Custom option in theme picker opens 4-input form (bg page / bg surface / fg primary / accent). Auto-derives 8 supporting colors. Contrast guard blocks failing AA. "Fix it" button auto-adjusts.
- **Files:** `app/admin/profile/components/CustomThemePicker.tsx`, `lib/hub/themes/custom.ts`
- **Done when:** User picks colors w/ live preview + contrast warnings; saves only on AA pass.
- **Depends on:** Slices 82, 105

### Slice 107 — Per-widget custom color mode
- **Scope:** "Custom" color mode enables bg + fg pickers. Fg auto-derived. Contrast guard applies.
- **Files:** `lib/hub/components/settings/CustomColorPicker.tsx`, `StyleTab.tsx`
- **Done when:** User picks per-widget colors w/ validation; widget renders with custom.
- **Depends on:** Slices 103, 105

---

## Phase 10 — Drawing-mockup widgets continued (Slices 108–110)

### Slice 108 — Jobs widget
- **Scope:** All 5 size variants. Stage chip w/ status tint. Settings: filter (all/mine/active/by-stage), columns (multi-toggle), sortBy, rowLimit, showStageColors. Hover row actions.
- **Files:** `lib/hub/widgets/my-jobs/{index,Widget,Settings,StageChip}.tsx`, `__tests__/hub/widgets/my-jobs.test.tsx`
- **Done when:** All 5 size variants; settings persist; hover actions work.
- **Depends on:** Slice 104

### Slice 109 — Messages widget
- **Scope:** All 5 size variants. Unread indicator dot. Wire to messages API. Settings: includeGroups, senderFilter, markAsReadOnView, showPreview, messageLimit.
- **Files:** `lib/hub/widgets/messages/{index,Widget,Settings}.tsx`, `__tests__/hub/widgets/messages.test.tsx`
- **Done when:** Each size variant; unread dot uses accent; right-click context menu works.
- **Depends on:** Slice 108

### Slice 110 — Class Assignments widget
- **Scope:** All 5 size variants. Due-date status chip (overdue/today/week/future). Settings: dueWithin, includeCompleted, groupByClass, columns, sortBy, rowLimit.
- **Files:** `lib/hub/widgets/class-assignments/{index,Widget,Settings,DueChip}.tsx`, `__tests__/hub/widgets/class-assignments.test.tsx`
- **Done when:** Each size variant; due chip colors correctly; gated by student/teacher in catalog.
- **Depends on:** Slice 109

---

## Phase 11 — Daily-workflow widgets (Slices 111–115)

### Slice 111 — Today's Schedule widget
- **Scope:** All 5 size variants. Wire to schedule_events. Settings: showAllDay, timeRange.
- **Files:** `lib/hub/widgets/today-schedule/...`, tests
- **Depends on:** Slice 104

### Slice 112 — PTO Balance widget
- **Scope:** Adapt existing Slice-30 dashboard tile. Settings: format (hours/days), showHistory.
- **Files:** `lib/hub/widgets/pto-balance/...`
- **Depends on:** Slice 111

### Slice 113 — Hours This Week widget
- **Scope:** All 5 size variants. Mini bar-chart at small+. Settings: weekStart, showBreakdownByJob.
- **Files:** `lib/hub/widgets/hours-this-week/...`
- **Depends on:** Slice 112

### Slice 114 — Recent Activity widget
- **Scope:** All 5 size variants. Settings: itemLimit, includeTypes. Reads `recentRoutes` + activity log.
- **Files:** `lib/hub/widgets/recent-activity/...`
- **Depends on:** Slice 113

### Slice 115 — Bookmarks widget
- **Scope:** Like pinned-pages but free-form (label + URL + icon). Settings: bookmarks array. Edit-add modal.
- **Files:** `lib/hub/widgets/bookmarks/...`
- **Depends on:** Slice 114

---

## Phase 12 — Communication widgets (Slices 116–119)

### Slice 116 — Open Discussions widget
- **Scope:** Threads awaiting your reply. Settings: scope (mine/mentions/all).

### Slice 117 — Recent Announcements widget
- **Scope:** Last 3 org announcements. Settings: unreadOnly. Wire to announcements API.

### Slice 118 — Team Status widget
- **Scope:** Who's clocked in. Settings: groupBy (role/shift/none).

### Slice 119 — Mentions Inbox widget
- **Scope:** DMs/threads w/ direct mentions. Settings: dateRange.

---

## Phase 13 — Work / Job widgets (Slices 120–123)

### Slice 120 — Assignments Due widget
- **Scope:** Action items / tasks. Settings: assignedTo, dueWithin.

### Slice 121 — Crew Calendar widget
- **Scope:** Multi-employee schedule. Settings: employeeFilter, weekRange.

### Slice 122 — Field Data Pending widget
- **Scope:** Field captures awaiting review. Settings: jobFilter, dataTypes.

### Slice 123 — Job Activity Feed widget
- **Scope:** Recent activity across jobs. Settings: jobFilter, activityTypes.

---

## Phase 14 — Equipment widgets (Slices 124–127)

### Slice 124 — My Equipment Out widget
### Slice 125 — Maintenance Due widget
### Slice 126 — Low Consumables widget
### Slice 127 — Vehicles Status widget

All gated by `equipment_manager` or `admin` in the catalog.

---

## Phase 15 — CAD + Research widgets (Slices 128–131)

### Slice 128 — Recent Drawings widget (drawer + admin)
### Slice 129 — Drawings In Progress widget
### Slice 130 — Active Research Projects widget
### Slice 131 — Pipeline Status widget

---

## Phase 16 — Learning widgets (Slices 132–135)

### Slice 132 — Roadmap Progress widget
### Slice 133 — Flashcards Due widget
### Slice 134 — Quiz History widget
### Slice 135 — Recommended Lessons widget

---

## Phase 17 — Office + Financial widgets (Slices 136–140)

### Slice 136 — Pending Receipts widget (admin + tech_support)
### Slice 137 — Pending Time-Off widget
### Slice 138 — Pending Hours widget
### Slice 139 — Monthly Revenue widget (admin-only)
### Slice 140 — Outstanding Invoices widget

---

## Phase 18 — Operational + nice-to-have widgets (Slices 141–145)

### Slice 141 — Weather widget
- **Scope:** Wire OpenWeather via new `/api/admin/weather` proxy (API key server-side). Settings: location (auto / manual zip / active job).

### Slice 142 — Mileage Tracker widget

### Slice 143 — Sun Calculator widget

### Slice 144 — Streak Counter widget (learning)

### Slice 145 — Daily Briefing widget
- **Scope:** Composite (schedule + weather + crew status + tasks). Only renders at large+ sizes.

---

## Phase 19 — Polish + accessibility (Slices 146–151)

### Slice 146 — Empty state coverage audit
- **Scope:** Verify every widget has a friendly empty state w/ CTA. Add `showEmptyState` toggle.
- **Depends on:** Slice 145

### Slice 147 — Loading skeleton coverage audit
- **Scope:** Verify every widget's skeleton matches its adaptive layout. Remove any "Loading…" text.
- **Depends on:** Slice 146

### Slice 148 — Error state + retry coverage
- **Scope:** Retry + Hide buttons on every widget. Wire to `error_log`. 3-failures-in-1-min auto-hide.
- **Depends on:** Slice 147

### Slice 149 — Keyboard navigation audit
- **Scope:** Tab order matches grid; arrow keys in tables; Enter activates; ⌘1-9 for Quick Actions.
- **Depends on:** Slice 148

### Slice 150 — Screen reader audit
- **Scope:** NVDA + VoiceOver walkthrough. aria-labelledby + live regions + alt text.
- **Depends on:** Slice 149

### Slice 151 — Mobile read-only optimization
- **Scope:** <768px: disable edit mode, ignore custom widths, render single-column saved-order. "Open on desktop to customize" banner.
- **Depends on:** Slice 150

---

## Phase 20 — Performance + data aggregation (Slices 152–154)

### Slice 152 — Hub data aggregator endpoint
- **Scope:** `GET /api/admin/me/hub-data?widgets=...` returns map of all data in one call.
- **Depends on:** Slice 151

### Slice 153 — Widget refresh strategy
- **Scope:** Per-widget refresh honoured. Pause on background tab. Resume on focus. Optional WebSocket for live data.
- **Depends on:** Slice 152

### Slice 154 — Performance budget enforcement
- **Scope:** Warn when adding 9th high-traffic widget. `dataFreshness` per-widget setting.
- **Depends on:** Slice 153

---

## Phase 21 — Work Mode foundations (Slices 155–158)

### Slice 155 — Work Mode Zustand store + persistence
- **Scope:** `useWorkModeStore: { mode, jobId?, enteredAt }`. localStorage persistence.
- **Depends on:** Slice 154

### Slice 156 — Work Mode route shell
- **Scope:** `app/admin/work-mode/layout.tsx` separate from `AdminLayoutClient`. Top bar w/ Exit pill + clock-in timer.
- **Depends on:** Slice 155

### Slice 157 — Work Mode role picker
- **Scope:** `/admin/work-mode/start`. Eligible-role tiles. Single-role fast-path.
- **Depends on:** Slice 156

### Slice 158 — "Enter Work Mode" wired + Exit confirmation flow
- **Scope:** Wire button from Slice 88 to actual entry. Exit confirm modal w/ "Clock out too?" option.
- **Depends on:** Slice 157

---

## Phase 22 — Field Crew Work Mode (Slices 159–165)

### Slice 159 — Field Crew shell + Job tab
- **Scope:** Lands on Job tab. Job picker. Summary, tasks, notes.

### Slice 160 — Field Crew: Photo + Video capture
- **Scope:** Camera button → native camera or file picker. Caption + job tag.

### Slice 161 — Field Crew: Point recording
- **Scope:** GPS point capture w/ description. PNEZD save.

### Slice 162 — Field Crew: Mileage tracking
- **Scope:** GPS start/stop or manual entry. Auto-distance.

### Slice 163 — Field Crew: Receipt capture
- **Scope:** Camera capture. OCR via existing pipeline. Auto-submit.

### Slice 164 — Field Crew: Crew + Equipment tabs
- **Scope:** Crew tab (job DM thread). Equipment tab (checkout state + return).

### Slice 165 — Field Crew: Time + Files + Issue tabs
- **Scope:** Time tab (timesheet). Files tab (cached). Issue tab (escalate red button).

---

## Phase 23 — Drafter Work Mode (Slices 166–169)

### Slice 166 — Drafter shell + sidebar
- **Scope:** Left tree: Jobs → Job → Field Captures + Drawings + Files. Search.

### Slice 167 — Drafter CAD integration
- **Scope:** Main area opens `/admin/cad` editor when drawing selected.

### Slice 168 — Drafter photo + point viewers
- **Scope:** Photo viewer. Point-file table view.

### Slice 169 — Drafter right-rail (comms + checklist)
- **Scope:** Comms thread w/ field crew for active job. Drafting standards checklist.

---

## Phase 24 — Other Work Mode roles (Slices 170–177)

### Slice 170 — Researcher Work Mode shell
### Slice 171 — Researcher tools (Documents / Pipeline / Discoveries tabs)
### Slice 172 — Researcher AI assistant rail
### Slice 173 — Equipment Manager Work Mode
### Slice 174 — Bookkeeper Work Mode: queues (Receipts + Time-Off + Hours)
### Slice 175 — Bookkeeper Work Mode: payroll + invoices + reimbursements
### Slice 176 — Dispatcher Work Mode (Crew Calendar + open jobs + comms)
### Slice 177 — Office Admin Work Mode

---

## Phase 25 — Clock-in + activity logging (Slices 178–181)

### Slice 178 — Clock-in modal redesign
- **Scope:** Click top-bar pill → modal w/ job picker + activity tags.

### Slice 179 — Clock-out daily summary modal
- **Scope:** Modal w/ per-job time allocation + activity tags + notes.

### Slice 180 — Activity tag system
- **Scope:** New `activity_tags` table (id, label, color, system). Seeds.

### Slice 181 — Activity-aware payroll integration
- **Scope:** Tags auto-classify time entries against work_type multipliers.

---

## Phase 26 — Subscription bundle gating (Slices 182–184)

### Slice 182 — Wire `requiresBundle` to widget gating
- **Scope:** Filter Add-Widget catalog by org's active bundles. Locked widgets show upgrade pill.

### Slice 183 — Locked-widget upgrade prompts
- **Scope:** Widget in saved layout but bundle cancelled → upgrade prompt in body.

### Slice 184 — Work Mode bundle gating
- **Scope:** Role picker hides Work Modes whose required bundle isn't active.

---

## Cross-cutting reminders for every slice

1. Read the relevant design rationale section before coding.
2. Implement → `npm run type-check && npm run lint` clean.
3. Add tests (vitest specs for logic, RTL for UI where feasible).
4. Annotate THIS doc with completion note + commit hash.
5. Commit only the files this slice touched (`git add <specific>` — never `-A`).
6. Push to `claude/gifted-ramanujan-lQaEI`.
7. Note any followups discovered + add them as a new slice at the end of the appropriate phase.

---

## Slice numbering convention

These start at **Slice 78** because Slices 1–77 are in `backend-audit-and-improvements-2026-05-27.md`. Numbering continues across docs so commit messages + git blame remain unambiguous. Future planning docs continue from 185+.

---

## Open questions (still need Jacob's answers)

1. Sign Out placement (nested user menu vs standalone)
2. Clock-in job picker — required when?
3. Admin powers in Field Crew mode — retain or lose?
4. Mobile editing — read-only or simplified edit?
5. Greeting auto-collapse timing
6. Roles dropdown — view-only or active-persona switch?
7. Default density
8. Custom theme — auto-derive secondary text or let user pick?
9. Widget shadow + radius defaults
10. Per-widget density override — ship or skip?
11. Quick Actions max
12. My Pay privacy toggle default
13. Theme list — ship all 11 or start w/ 4?
14. Custom theme name — required?
15. Empty-state CTAs

For now, the slice work proceeds with the recommended-defaults from the v2 design doc. Jacob can intercept at any time to override before the relevant slice ships.

---

## TL;DR

- 107 slices (78 through 184) covering everything in the v2 design.
- Each slice = one commit, one annotation, tsc+lint+tests clean.
- Phases roughly correspond to v2 section themes.
- Numbered to continue from Slices 1–77 (backend audit), so all future planning docs increment from 185+.
- Same workflow as the backend-audit doc: read → edit → typecheck → lint → annotate → commit → push.
- Branch: `claude/gifted-ramanujan-lQaEI`.
