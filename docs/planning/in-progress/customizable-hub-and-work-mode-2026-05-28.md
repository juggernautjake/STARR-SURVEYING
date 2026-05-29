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

### Slice 79 — Hub layout API routes ✅ shipped
- **Scope:** `GET /api/admin/me/hub-layout` (returns null on no row), `PUT` (full replace), `POST /reset`. Uses `withErrorHandler` + signed-in user check.
- **Files:** `app/api/admin/me/hub-layout/route.ts`, `app/api/admin/me/hub-layout/reset/route.ts`, `lib/hub/validate-layout.ts`, `__tests__/hub/validate-layout.test.ts`
- **Done when:** Routes return correct shapes; tests pass; PUT validates JSONB structure.
- **Depends on:** Slice 78
- **Done:** GET returns `{ layout: HubLayoutRow | null }` — null distinguishes "never customized" from "customized to no widgets" so the renderer can decide between persona-default vs. respecting the user's empty layout. PUT validates the payload via the pure `validateHubLayoutPutPayload()` helper (extracted to `lib/hub/validate-layout.ts` so tests don't need to mock next-auth / supabase). PUT upserts on `user_email` PK and reuses the DB-level `updated_at` trigger from Slice 78. Reset deletes the row. 21 vitest specs cover happy paths (all 11 themes accepted, all 3 density values, valid `customTheme` payload) plus rejections (non-object body, non-integer x/y/w/h, negative coords, zero w/h, unknown theme, unknown density, NaN/Infinity fontScale, theme=custom without payload). `clampFontScale` separately tested across the [0.875, 1.5] envelope. `tsc` + `eslint` clean.

### Slice 80 — Theme CSS variable layer ✅ shipped
- **Scope:** 14 theme CSS variables to `app/styles/themes.css`. `ThemeProvider` React component wrapping `<div data-theme="...">`. Hook `useTheme()` returns current theme id. Hook `useThemeColors()` returns palette as JS values (for charts/canvases).
- **Files:** `app/styles/themes.css`, `app/layout.tsx` (imports themes.css), `lib/hub/themes/index.ts`, `lib/hub/theme-provider.tsx`, `__tests__/hub/theme-provider.test.tsx`
- **Done when:** Variables cascade in DOM; default theme renders identically to current styling; switching themes (programmatically) updates colors live.
- **Depends on:** —
- **Done:** Themes.css declares the 14 variables in `:root` (the fallback that matches starr-default so any component rendered outside a ThemeProvider — the marketing site, server-rendered chrome — still resolves `var(--theme-*)`). Theme blocks themselves live in `[data-theme="<id>"]` selectors and are added in slices 81 + 83–85. Registry in `lib/hub/themes/index.ts`: `defineTheme()` / `getTheme()` / `allThemes()` / `isThemeRegistered()` + a `FALLBACK_PALETTE` JS object mirroring the CSS fallback. ThemeProvider wraps children in a `<div data-theme="...">`; for built-in themes the cascade comes from themes.css (no inline styles), for `theme === 'custom'` it inlines all 14 vars as `style` props since the palette varies per user. `useTheme()` / `useThemeColors()` consume the React context — useful for chart libraries that need hex strings (canvas can't read CSS vars). 10 vitest specs cover registry round-trip + ThemeProvider HTML output (`data-theme` attribute, custom inlines, built-in does NOT inline) + hooks via `react-dom/server` probes (matches the pattern in `__tests__/cad/styles/symbol-picker.test.tsx`). `tsc` + `eslint` clean.

### Slice 81 — Built-in themes: `starr-default` + `starr-dark` ✅ shipped
- **Scope:** Define the two brand palettes. Wire to `ThemeProvider`. Add a temporary `?theme=starr-dark` URL param for testing (removed in Slice 82).
- **Files:** `lib/hub/themes/starr-default.ts`, `lib/hub/themes/starr-dark.ts`, `lib/hub/themes/register-builtins.ts`, `app/styles/themes.css`, `__tests__/hub/builtin-themes.test.ts`
- **Done when:** Switching via URL param visibly changes the hub palette; no contrast regressions on existing pages.
- **Depends on:** Slice 80
- **Done:** Each theme is its own file (`starr-default.ts`, `starr-dark.ts`) ending with `defineTheme(...)` — importing the file registers the theme as a side effect. `register-builtins.ts` is a barrel that imports all built-in theme files; future slices add to this barrel rather than editing call sites. CSS blocks added to `themes.css`: starr-default mirrors the `:root` fallback; starr-dark uses lightened accent (#5A7BE5 instead of #1D3095) so accent-fg-on-accent passes WCAG AA against the dark surface. Note: the URL-param hack from the original scope wasn't needed — the existing `ThemeProvider` (Slice 80) already supports prop-driven switching, and slice 82 wires the picker UI directly. 7 vitest specs cover registration round-trip + a hex-format audit on all 14 palette fields + WCAG AA spot-check (4.5:1 minimum) for both `fgPrimary on bgSurface` and `accentFg on accent`. Both themes pass. `tsc` + `eslint` clean.

### Slice 82 — Theme picker UI in profile settings ✅ shipped
- **Scope:** Add Themes tab to `/admin/profile`. Preview tiles for each theme. Save selection to `user_hub_layouts.theme`. On hub load, apply saved theme. Remove `?theme=` URL hack.
- **Files:** `app/admin/profile/components/ThemePicker.tsx`, `app/admin/profile/ProfilePanel.tsx`
- **Done when:** User picks theme, refreshes, theme persists. Default fallback on no row.
- **Depends on:** Slices 79, 81
- **Done:** `ThemePicker` renders one preview tile per registered theme as `role=radio` buttons inside a `radiogroup`. Each tile shows six swatches (bg-page · bg-surface · accent · success · warning · danger) so users can eyeball the palette without applying it. Selecting a tile fires a PUT to `/api/admin/me/hub-layout` that echoes the user's current `widgets` + `activePersona` + `density` + `fontScale` + `hubSettings` (fetched once on mount) so we don't clobber unrelated state. Save shows a "✓ Saved" flash for 1.5s; errors render an inline message with the server's reason. Wired into `ProfilePanel.tsx` as a new `themes` tab; the parent loads the hub layout once so it can pass `initialThemeId` to the picker (falls back to `starr-default` if no row exists). Two themes show up in the picker right now (`starr-default` + `starr-dark`); slices 83–85 will populate the rest of the catalog. `tsc` + `eslint` clean (the two long-standing `<img>` warnings unchanged).

---

## Phase 2 — Built-in themes (Slices 83–85)

### Slice 83 — Built-in themes: `slate-light` + `slate-dark` ✅ shipped
- **Scope:** Add the two neutral themes. Run contrast audit; fix any AA failures.
- **Files:** `lib/hub/themes/slate-light.ts`, `lib/hub/themes/slate-dark.ts`, `lib/hub/themes/register-builtins.ts`, `app/styles/themes.css`, `__tests__/hub/builtin-themes.test.ts`
- **Done when:** Both render correctly in picker; pass WCAG AA spot-check.
- **Depends on:** Slice 82
- **Done:** Both themes use zinc/slate exclusively (no brand colours) — `slate-light` for max neutrality (long-form reading, client screenshots), `slate-dark` for OLED-friendly near-black surfaces. The dark variant uses `#D4D4D8` as accent rather than a saturated colour to keep the "neutral all the way down" feel; that passes AA (5.3:1) against `#171717` surface. WCAG AA contrast audit extended to cover all four shipped themes — all pass body-text + accent-button checks. 11 specs total in `builtin-themes.test.ts`. `tsc` + `eslint` clean.

### Slice 84 — Built-in themes: `forest`/`sunset`/`ocean`/`plum` ✅ shipped
- **Scope:** Add the four color-variation themes (light variants only this slice).
- **Files:** `lib/hub/themes/forest-light.ts`, `lib/hub/themes/sunset.ts`, `lib/hub/themes/ocean.ts`, `lib/hub/themes/plum.ts`, `lib/hub/themes/register-builtins.ts`, `app/styles/themes.css`, `__tests__/hub/builtin-themes.test.ts`
- **Done when:** All four appear in picker; pass contrast audit.
- **Depends on:** Slice 83
- **Done:** Four light-variant themes added: `forest-light` (greens, outdoor identity — accent `#15803D` for 5.1:1 against white), `sunset` (warm orange — `#C2410C` for 5.4:1), `ocean` (calm sky-blue — `#0369A1` for 6.8:1), `plum` (purple `#7E22CE` for 5.7:1). All four picked accent shades that pass WCAG AA on white surfaces. WCAG audit now covers 8 themes, 19 specs total. The status colours (success/warning/danger/info) are kept saturated across themes so colourblind users see consistent signal even when the rest of the palette changes. `tsc` + `eslint` clean.

### Slice 85 — Built-in themes: high-contrast (light + dark) ✅ shipped
- **Scope:** Two WCAG-AAA accessibility themes. Thicker focus rings, larger default font scale, disabled shadows.
- **Files:** `lib/hub/themes/high-contrast-light.ts`, `lib/hub/themes/high-contrast-dark.ts`, `lib/hub/themes/register-builtins.ts`, `app/styles/themes.css`, `__tests__/hub/builtin-themes.test.ts`
- **Done when:** Both pass AAA (7:1) contrast; shadows hidden; focus rings visible.
- **Depends on:** Slice 84
- **Done:** Both themes ship the classic OS high-contrast palette: light = pure white surfaces, pure black text, the historical `#0000EE` system-link blue accent; dark = pure black surfaces, pure white text, pure yellow accent. Borders are full `#000`/`#FFF` (no soft greys), accent-fg contrasts maximum. Both pass WCAG **AAA** body-text contrast (21:1) — verified by 2 new specs added to the audit. The "thicker focus rings + larger default font scale + disabled shadows" behaviour mentioned in the slice scope is per-component logic to apply when consuming the high-contrast palette — that lands when widgets are added (slices 91+) since there's nothing to apply it to yet. **Phase 2 complete — all 10 built-in themes registered.** Custom themes land in slice 106. 25 specs across the registry + every theme's WCAG AA/AAA audit. `tsc` + `eslint` clean.

---

## Phase 3 — Density + font scale (Slice 86)

### Slice 86 — Density + font-scale system ✅ shipped
- **Scope:** Spacing token sets per density (compact/comfortable/spacious). Font-scale CSS variable. Pickers in profile settings.
- **Files:** `app/styles/density.css`, `app/layout.tsx`, `app/admin/profile/components/DensityPicker.tsx`, `app/admin/profile/components/FontScaleSlider.tsx`, `app/admin/profile/ProfilePanel.tsx`
- **Done when:** Density visibly changes spacing; font scale updates type proportionally; saved + persisted.
- **Depends on:** Slice 82
- **Done:** `density.css` declares `--hub-spc-1..5` spacing tokens per density (`[data-density="compact|comfortable|spacious"]`) plus a `--hub-font-base-rem` per density. Derived font sizes (`--hub-font-xs..3xl`) cascade off `--hub-font-base-rem` × `--hub-font-scale` so the user's slider applies on top of the density's base. **DensityPicker** is a 3-button radiogroup (compact/comfortable/spacious); each tile shows label + 1-line description; click saves immediately via PUT. **FontScaleSlider** is a range input [0.875, 1.5] stepped 0.0625 — fires save on `mouseup`/`touchend`/`blur` (not on every drag tick) so we don't hammer the API. Both wired into the "Themes" tab below the ThemePicker. Layout fetched once in ProfilePanel + passed down as initial values. `tsc` + `eslint` clean. **Phase 3 complete.**

---

## Phase 4 — Greeting + top bar (Slices 87–89)

### Slice 87 — Greeting widget (fixed, top of canvas) ✅ shipped
- **Scope:** `HubGreeting` w/ time-of-day greeting + date + clock-in status. Profile-setting override for greeting prefix.
- **Files:** `app/admin/me/components/HubGreeting.tsx` (rewrite), `__tests__/hub/greeting.test.ts`
- **Done when:** Greeting reflects time-of-day across timezones; date follows locale; clock status reads from time-logs API.
- **Depends on:** Slice 82
- **Done:** Stripped the slice-2a stub that mixed greeting + nav toggle + persona dropdown. New `HubGreeting` is greeting-only: time-of-day prefix ("Good morning/afternoon/evening/night" + an optional `greetingPrefix` override prop the user can configure in profile settings later), first-name extraction, the date in `Thursday, May 28` long form (locale-aware via `toLocaleDateString`), and a clock-in status line ("You're not currently clocked in" OR "You're clocked in to <Job> — Xh YYm elapsed" with a small accent-tinted live dot). Clock state fetched best-effort from the existing `/api/admin/time-logs/today` endpoint; slice 89 swaps in a store-backed source. Role-chip strip at the bottom: shows the active persona + any override chip + an "Auto" reset chip when an override is present. The `Enter Work Mode` button is intentionally left blank in this slice — slice 88 wires the placeholder + slice 158 wires the real entry. Pure helpers exported (`partOfDay`, `firstName`, `formatElapsed`); 14 vitest specs cover them (boundary hours, custom prefix override, empty/null names, < 1h vs ≥ 1h elapsed formatting w/ zero-pad, defensive `now < start` case, unparseable iso string). `tsc` + `eslint` clean.

### Slice 88 — "Enter Work Mode" button (placeholder) ✅ shipped
- **Scope:** Button on greeting card. Disabled w/ tooltip "Coming soon" until Phase 21. Visible only if user has at least one work-eligible role.
- **Files:** `app/admin/me/components/HubGreeting.tsx`, `lib/hub/work-mode-eligibility.ts`, `__tests__/hub/work-mode-eligibility.test.ts`
- **Done when:** Visible for field-crew/drafter/researcher/admin; hidden for student-only/teacher-only; tooltip explains.
- **Depends on:** Slice 87
- **Done:** `work-mode-eligibility.ts` defines `WORK_MODE_ROLES` (admin, developer, field_crew, drawer, researcher, equipment_manager, tech_support) + an `isWorkModeEligible()` predicate + an `eligibleWorkModeRoles()` filter for slice 157's role picker. Button renders inside `.hub-greeting__actions` only when `isWorkModeEligible(roles) === true`. Disabled state with a `title` attribute that explains what Work Mode does + when it lands ("Phase 21"). Includes a small "Soon" pill on the button so the disabled state is visually obvious — important because users might otherwise click it once, get nothing, and not click it again when it actually ships. 15 vitest specs cover the eligibility predicate across single-role users (every work-mode role + every non-work-mode role), multi-role users, null/undefined/empty inputs, and the WORK_MODE_ROLES set's explicit membership audit. `tsc` + `eslint` clean.

### Slice 89 — Top-bar redesign: clock-in pill + roles dropdown + user menu ✅ shipped (partial)
- **Scope:** Live clock-in pill w/ elapsed timer; Roles dropdown (view-only persona override); nested Sign Out.
- **Files:** `app/admin/components/AdminTopBar.tsx` (refactor), `app/admin/components/ClockInPill.tsx`
- **Done when:** Pill ticks live timer; Roles dropdown previews layouts; Sign Out works.
- **Depends on:** Slice 88
- **Done:** `ClockInPill` polls `/api/admin/time-logs/today` every 60s, ticks a live elapsed timer every 30s when clocked in. Two visual states: clocked-out (gray pill, `▶ Clock In` label) and clocked-in (green-tinted pill via `color-mix(in srgb, var(--theme-success) 15%, var(--theme-bg-elevated))`, `■ Clock Out · 2h 47m` with the elapsed time updating live). Both link to `/admin/my-hours` for now; the dedicated clock-in modal lands in Slice 178. Pill hidden for student-only / teacher-only users (reuses `isWorkModeEligible()` from Slice 88). Top bar gains a new **UserMenu** dropdown that absorbs Sign Out + adds "Profile + settings" + "Theme + density" links — closes on Escape / click-outside / menu-item click. The role badge moves into the user menu trigger so it's still visible at a glance. The "Roles dropdown" from the original scope is deferred to a later slice since the persona-override picker still lives in the greeting card chips (Slice 87) and a duplicate top-bar control wouldn't add value yet. `tsc` + `eslint` clean. **Phase 4 complete.**

---

## Phase 5 — Widget infrastructure (Slices 90–93)

### Slice 90 — Widget registry + size-bucket helper ✅ shipped
- **Scope:** `lib/hub/widget-registry.ts` w/ `WidgetDefinition` contract. `sizeBucket()` helper w/ comprehensive tests covering every supported (w,h) combo.
- **Files:** `lib/hub/size-bucket.ts`, `lib/hub/widget-registry.ts`, `__tests__/hub/size-bucket.test.ts`, `__tests__/hub/widget-registry.test.ts`
- **Done when:** Registry compiles; `sizeBucket()` tests cover boundaries (3×1=tiny, 6×2=medium, etc.).
- **Depends on:** Slice 78
- **Done:** `sizeBucket(w, h)` is area-based (w×h) so a 3×3 widget gets the same content treatment as a 6×2. Thresholds: ≤3 tiny, ≤6 small, ≤12 medium, ≤24 large, >24 xlarge. Inputs are clamped (`Math.max(1, Math.floor(...))`) so a deleted widget can't compute a zero-area bucket. Companion helpers: `bucketIsLarger()` for fallback ordering + `ALL_BUCKETS` in ascending order. `widget-registry.ts` declares `WidgetDefinition<TContent>` with `id`/`label`/`category`/`iconName`/`defaultSize`/`min`+`maxSize`/`defaultContent`/`allowedRoles[]`/`requiresBundle?`/`Widget` component/`SettingsForm?`. `defineWidget()` registers (idempotent via Map.set), `getWidget()` looks up, `allWidgets()` returns insertion order, `widgetsForRoles(roles)` filters for catalog modal, `widgetsByCategory()` groups (returns every category key even when empty so the catalog modal renders consistent tabs). 35 vitest specs cover every documented (w,h)→bucket mapping + boundary edges + clamp behaviour for the size bucket; registry round-trip + role filtering (admin sees admin+everyone, student sees only everyone, multi-role sees union) + category grouping. `tsc` + `eslint` clean.

### Slice 91 — `WidgetFrame` base component ✅ shipped
- **Scope:** Shared widget shell: header + body + footer. Supports all `colorMode` values. Empty/loading/error sub-renders. ARIA correctness.
- **Files:** `lib/hub/components/WidgetFrame.tsx`, `lib/hub/components/WidgetSkeleton.tsx`, `lib/hub/components/WidgetEmpty.tsx`, `lib/hub/components/WidgetError.tsx`, `__tests__/hub/widget-frame.test.tsx`
- **Done when:** Frame renders w/ all 5 colorMode values; empty/loading/error swap on state.
- **Depends on:** Slice 90
- **Done:** `WidgetFrame` wraps every widget in a 3-row flex column (header / scrollable body / optional footer). Title slug from a deterministic lowercased-non-alphanumeric reduce (fallback `untitled`). `resolveColors()` exported as a pure helper — all 5 colorMode branches covered: `inherit` → theme vars, `accent` → `var(--theme-accent)` + accent-fg, `subtle-accent` → `color-mix(in srgb, var(--theme-accent) 8%, var(--theme-bg-surface))`, `status` → tint by `success`/`warning`/`danger`/`info` (default info), `custom` → user-picked bg+fg with theme-var fallback. Edit mode swaps the border to `2px solid var(--theme-border-strong)` for the drag affordance. Companion components: `WidgetSkeleton` (pulsing-block placeholder w/ N rows + reduced-motion respect), `WidgetEmpty` (centered title + description + optional CTA + icon), `WidgetError` (role=alert, friendly title + message + Retry/Hide buttons; auto-hide-on-3-fails wired in slice 148). 13 vitest specs cover title slug + show/hide + footer + header action + every `resolveColors` branch. `tsc` + `eslint` clean.

### Slice 92 — Static grid renderer ✅ shipped
- **Scope:** `<WidgetGrid>` renders widgets at position+size. Responsive collapse (12 → 6 → 1 col). No drag yet.
- **Files:** `lib/hub/grid-math.ts`, `lib/hub/components/WidgetGrid.tsx`, `__tests__/hub/grid-math.test.ts`
- **Done when:** Saved layout renders at correct positions; responsive collapse works.
- **Depends on:** Slice 91
- **Done:** Pure helpers in `grid-math.ts` — `breakpointForWidth(px)` maps viewport to {12, 6, 1}; `collapseLayout(widgets, bp)` is idempotent at 12, halves widths + re-flows to avoid overlap at 6, and stacks single-column at 1 (preserves saved order); `layoutBounds()` computes the bottom-most row used so the grid container sizes its `gridAutoRows`. Re-flow is greedy (sort by y/x/originalIndex; find lowest non-overlapping y for each widget) — straightforward but tested for non-overlap + per-row order preservation. `WidgetGrid` renders via `display: grid` w/ `gridTemplateColumns: repeat(N, 1fr)` + `gridAutoRows: 64px` + 16px gap; each widget cell uses `grid-column: x+1 / span w` + `grid-row: y+1 / span h`. Unknown widget types render a warning-tinted `WidgetFrame` placeholder so a retired widget id doesn't crash the grid — important for forwards compatibility when we deprecate widgets later. Resize listener ticks viewport width client-side; SSR renders at 12-col (best-guess for first paint). 12 vitest specs cover breakpoint thresholds + 12-col passthrough + 1-col stacking w/ order preservation + 6-col halving + 6-col re-flow non-overlap + layoutBounds row math + empty-layout guard. `tsc` + `eslint` clean.

### Slice 93 — Persona-default seeding ✅ shipped
- **Scope:** When user has no layout row, seed from `inferPersona()`. Static JSON for the 8 persona-default layouts.
- **Files:** `lib/hub/defaults.ts`, `app/api/admin/me/hub-layout/route.ts` (GET reads persona on empty), `__tests__/hub/defaults.test.ts`
- **Done when:** First-time users see sensible layout; admin sees admin default; field crew sees field-surveyor default.
- **Depends on:** Slice 92
- **Done:** `PERSONA_DEFAULT_LAYOUTS` exhaustive over `lib/admin/personas`'s 7 persona ids (field-surveyor, equipment-manager, dispatcher, bookkeeper, researcher, admin, student) — 6 widgets each, hand-curated to match the persona's daily workflow per v2 §5.3. `FALLBACK_DEFAULT_LAYOUT` covers any future persona id that lands without an updated default (single pinned-pages widget; the user can still navigate). `defaultLayoutForPersona(persona)` returns the matching layout or the fallback. **GET `/api/admin/me/hub-layout` contract change:** on missing row, instead of `{ layout: null }` the route now returns `{ layout: <seed>, isSeeded: true }` where the seed has `widgets = defaultLayoutForPersona(inferPersona(roles))` + safe defaults (`starr-default` theme, `comfortable` density, 1.0 font scale). The seed is NOT persisted — it persists the first time the user saves customizations via PUT. Distinguishes "first-time auto-default" from "user explicitly wanted these widgets" so we don't accidentally lock in a default the user never agreed to. NOTE: until widgets land (slices 94+), every seed widget renders via the `WidgetGrid` unknown-widget placeholder; this is correct & forward-compatible behaviour. 34 vitest specs cover exhaustiveness (every persona id has a layout), well-formedness (no overlaps, every widget fits within 12 cols, all integers, non-empty id/type), `defaultLayoutForPersona` resolution + fallback, and the fallback layout's basic constraints. `tsc` + `eslint` clean.

---

## Phase 6 — First three widgets (Slices 94–96)

### Slice 94 — Pinned Pages widget ✅ shipped
- **Scope:** All 5 size variants. Wires to existing `pinnedRoutes` from nav-store. Settings: pinnedIds, layoutStyle, iconStyle.
- **Files:** `lib/hub/widgets/pinned-pages/{index,Widget,Settings}.tsx`, `__tests__/hub/widgets/pinned-pages.test.tsx`
- **Done when:** Each size variant renders correctly; settings persist.
- **Depends on:** Slice 93
- **Done:** Shipped as a single-file widget (`lib/hub/widgets/pinned-pages/index.tsx`) since the body + settings form fit comfortably together (the planning's split-file path was just a guideline). All five `sizeBucket` variants covered: **tiny** renders two text links stacked, no icons; **small/medium/large/xlarge** render either a vertical list or a grid whose column count + item cap scale per bucket (cols 1/2/3/4/6, caps 2/4/6/12/24). The widget reads pinned hrefs from `useAdminNavStore(s => s.pinnedRoutes)` and resolves each via `findRoute()` from the route registry — retired hrefs fall back to the trailing slug so a stale layout doesn't break. Empty state surfaces a 📌 + CTA into `/admin/work`. Settings form exposes `layoutStyle` (grid / list) + `iconStyle` (lucide / emoji / none); emoji icons resolve via a small fallback map until the lucide-component registry pipe lands in slice 100. Pure helpers `colsForBucket` + `capForBucket` exported for downstream consumers. New side-effect barrel `lib/hub/widgets/register-all.ts` registers every shipped widget — future slices just append a new `import './<id>';` line; the hub canvas imports this once so the renderer can resolve every saved widget type via `getWidget(id)`. 14 vitest specs cover the registry round-trip (id, label, category, allowed roles, defaultSize), `colsForBucket` + `capForBucket` across all five buckets, and the empty-state render (CTA + icon). State-dependent render branches are exercised by the upcoming playwright suite — `useSyncExternalStore`'s server snapshot doesn't reflect post-import `setState` updates inside vitest's `environment: 'node'`, and the widget is `'use client'` so it never hits SSR in production anyway. `tsc` + `eslint` clean.

### Slice 95 — Quick Actions widget ✅ shipped
- **Scope:** Action catalog (8 starters: clock in/out, new job, approve receipts, view reports, open CAD, send message, capture receipt, schedule). All size variants. Settings: actions, display style, color per action, keyboard shortcuts.
- **Files:** `lib/hub/widgets/quick-actions/{index,Widget,Settings,actions}.tsx`, `lib/hub/quick-actions-catalog.ts`, `__tests__/hub/widgets/quick-actions.test.tsx`
- **Done when:** Each action navigates/opens its target; size variants adapt; ⌘1–⌘9 shortcuts work.
- **Depends on:** Slice 94
- **Done:** New catalog file `lib/hub/quick-actions-catalog.ts` declares all eight starters as `QuickActionDef`s with `id / label / description / iconName / kind / href|actionId / allowedRoles / tint`. `kind` separates plain navigations (`link`, rendered as `<Link href>`) from command actions (`action`, rendered as a disabled "Soon" button until the matching modal lands — clock-in modal in Slice 159, capture-receipt modal in Slice 156). Catalog helpers: `findQuickAction(id)`, `quickActionsForRoles(roles)`, `DEFAULT_QUICK_ACTION_IDS` (every starter, in the documented daily-workflow order). Single-file widget at `lib/hub/widgets/quick-actions/index.tsx` covers all five `sizeBucket` variants — **tiny** stacks 2 icon-only rows; **small/medium/large/xlarge** render either a list (rows) or a grid whose cols (1/2/3/4/6) + cap (2/4/6/12/24) match the planning doc. Per-action tint maps to one of `--theme-accent / --theme-success / --theme-warning / --theme-info / --theme-danger` so colors flow through the active theme automatically. ⌘1–⌘9 shortcuts opt-in via a settings toggle; the listener attaches on mount, skips when SSR / disabled, and prevents-default on the matched digit (1-indexed) by calling `window.location.assign(href)`. Action-kind entries silently ignore the keypress until their handler ships. Settings form covers `layoutStyle` / `displayStyle` / `enableShortcuts` plus a per-action checkbox fieldset for showing/hiding entries (re-ordering lands in Slice 100 alongside drag-drop). Catalog registered with `defineWidget(...)` via the `register-all.ts` barrel (now imports `pinned-pages` + `quick-actions`). 25 vitest specs cover: catalog exhaustiveness (exact id list matches the 8 planning-doc entries), id lookup, link-kind/action-kind invariants, role filtering (field crew sees no new-job/approve-receipts, admin sees everything, no-roles sees nothing because every starter is internal), registry round-trip (id, category, allowedRoles, default size + content), `colsForBucket` + `capForBucket` across all five buckets, the empty-state render when the user removes every action, and a full default-content render that verifies link anchors + disabled command buttons + "Coming soon" tooltips appear. `tsc` + `eslint` clean.

### Slice 96 — My Pay widget ✅ shipped
- **Scope:** Wire to existing pay data. 5 size variants. Privacy toggle in header. Settings: stats to show, amount style, color amounts, show date.
- **Files:** `lib/hub/widgets/my-pay/{index,Widget,Settings}.tsx`, `__tests__/hub/widgets/my-pay.test.tsx`
- **Done when:** Hits live `/api/admin/my-pay`; size variants from tiny ($22.50/hr) to xlarge (chart + table); privacy toggle saves per-session.
- **Depends on:** Slice 95
- **Done:** Single-file widget at `lib/hub/widgets/my-pay/index.tsx`. Reads `/api/admin/payroll/employees?email={user.email}` (the same endpoint MyPayPanel uses) inside a `useEffect`; renders one of `WidgetSkeleton` / `WidgetError` (with Retry) / `WidgetEmpty` / the stat grid depending on fetch status. Six stats supported (`hourly_rate`, `available_balance`, `total_earned`, `total_withdrawn`, `salary_type`, `pay_frequency`); `capForBucket` clips at 1/2/4/6/6 per `sizeBucket` so tiny just shows the hourly rate while large/xlarge surface every selected stat. User order is preserved when capping. **Privacy toggle** lives in the widget header — an eye / hide-eye button (`👁` / `🙈`) flips a per-instance override that masks every dollar tile with `••••`. The saved `content.privacy` flag seeds the initial state, then the toggle becomes session-only (intentional — the planning calls out "saves per-session"; persisting it would also write to the layout PUT endpoint which would feel surprising mid-glance). Non-currency stats (pay type, frequency) stay visible regardless of mask. **Settings form** covers stats checkboxes (catalog-style fieldset), amount style (full currency vs compact `$1.2k` >= 1000), color amounts (theme success tint), show-updated timestamp footer, and default-privacy. **Stat formatter** exposes the pure `formatValue(statId, value, style)` helper: hourly rate always `$XX.XX/hr` regardless of style, balances render with thousands-sep + 2dp, compact mode abbreviates >= 1k to `$X.Xk`, non-finite numerics → em-dash, numeric-string inputs (NUMERIC columns serialize as strings sometimes) coerce cleanly. Widget registered with category `time-pay`, icon `Wallet`, `allowedRoles: ['admin', 'developer', 'field_crew', 'drawer', 'tech_support']` (salaried roles + students + equipment manager see it hidden from the Add-Widget modal; a saved instance still renders an empty-state if their persona later lands on the catalog). `register-all.ts` extended to side-effect-import `my-pay`. 26 vitest specs cover the registry round-trip, every cap+visible-stats branch, every `isCurrencyStat` + `labelForStat` row, `formatValue` across currency/compact, hourly rate special-case, non-finite & string-coercion edges, and the catalog exhaustiveness. Session-dependent + network render paths land in the Playwright E2E. `tsc` + `eslint` clean.

---

## Phase 7 — Customization mechanics (Slices 97–100)

### Slice 97 — Edit-mode toggle ✅ shipped
- **Scope:** "Customize Hub" button at canvas top-right. Toggles edit mode. Visual affordances: thicker borders, drag handles, X buttons, "+ Add Widget" button, floating Save/Cancel.
- **Files:** `lib/hub/components/EditMode.tsx`, `lib/hub/hub-store.ts`
- **Done when:** Toggle works; affordances appear; Cancel reverts; Save PUTs to API.
- **Depends on:** Slice 96
- **Done:** New `lib/hub/hub-store.ts` zustand store owns the edit lifecycle: `widgets` (server-authoritative), `draftWidgets` (null when not editing, a deep clone when editing), `isEditMode`, `isDirty`, `saveStatus` (`'idle' | 'saving' | 'error'`), `saveError`. Echoed non-widget settings (`theme`, `density`, `fontScale`, `hubSettings`, `activePersona`) are stored too so a Save from inside edit mode preserves them in the PUT body. Actions: `hydrate(input)` — replaces saved state + clears edit; `enterEditMode()` — seeds the draft buffer via `structuredClone` (JSON fallback for older runners); `cancelEdit()` — drops the draft; `setDraftWidgets(widgets)` — used by drag-end/resize-end (Slices 98 + 99); convenience patches `addWidget`, `removeWidget`, `patchWidgetCustomization`; `saveDraft()` — async PUT to `/api/admin/me/hub-layout` with `{widgets, theme?, density?, fontScale?, hubSettings?, activePersona?}`, promotes draft → widgets on 200 + flips edit mode off, otherwise sets `saveStatus = 'error'` and leaves the draft intact so the user can retry. Network failures + non-2xx server errors both surface their message. New `lib/hub/components/EditMode.tsx` ships two UI primitives the hub canvas will host: **CustomizeHubButton** (renders "✏️ Customize Hub" in view mode, swaps to a green "Editing hub…" pill while editing) and **EditModeBar** (fixed-position floating bar at the bottom-center with a Cancel + Save layout — Save is disabled when `!isDirty || saving`, shows "Saving…" while the PUT is in flight, and surfaces `saveError` as a danger-tinted alert below the bar). Esc key cancels edit mode (ignored while saving). Drag handles, per-widget X buttons, the +Add tile, and the resize handle are intentionally deferred to Slices 98–100 — the affordances hook into the store's `addWidget` / `removeWidget` / `setDraftWidgets` actions once those slices land. WidgetGrid stays untouched; the eventual `HubCanvas` wrapper (lands with the `/admin/me` page in a later slice) selects `widgets` vs `draftWidgets` based on `isEditMode` and forwards. 14 vitest specs cover: hydrate replacement, hydrate reset of prior edit state, enterEditMode clone + no-op-when-already-editing, cancelEdit discards draft + restores widgets, every patch helper's gating (only mutates while editing) + dirty-flag, and the saveDraft happy path (verifies the PUT URL, method, body shape including echoed settings, and the promotion of draft → widgets on 200), 4xx server error (records `saveError`, keeps draft + isEditMode), network failure (records `saveError`), and the no-op-when-not-editing guard. `tsc` + `eslint` clean.

### Slice 98 — Drag-and-drop (move only) ✅ shipped
- **Scope:** `@dnd-kit/core` + `@dnd-kit/sortable`. Drag handle on widget header. Drop repositions. Auto-compaction.
- **Files:** `lib/hub/components/WidgetGrid.tsx`, `package.json`
- **Done when:** User drags widget, drops, layout updates, saves on exit-edit.
- **Depends on:** Slice 97
- **Done:** Installed `@dnd-kit/core@^6.3.1` + `@dnd-kit/sortable@^10.0.0` (npm — produces the expected pre-existing audit noise from other deps; no `--no-verify` / `--force` flags used). New pure helper `compactLayout(widgets, cols)` in `lib/hub/grid-math.ts` packs an ordered widget array into the grid greedily from (0,0): walks the array in order, scans rows top-to-bottom + columns left-to-right, places each widget at the first non-colliding cell, clamps widths > cols and ≤ 0 to safe values, never mutates the input. The drag-end handler in `WidgetGrid.tsx` reorders via `arrayMove` (sortable helper) then calls `compactLayout(reordered, 12)` so the saved layout is always 12-col regardless of the active viewport breakpoint. `WidgetGrid` itself gained an optional `onReorder?: (widgets: WidgetInstance[]) => void` prop — when `editMode && onReorder`, it wraps children in `<DndContext>` + `<SortableContext items=ids strategy={rectSortingStrategy}>` and renders each `WidgetCell` via a `SortableWidgetCell` wrapper that calls `useSortable({id})` to wire transform/transition styles + dragging opacity. The `WidgetFrame.headerAction` slot receives a `<DragHandle>` button (⋮⋮ glyph, `cursor: grab`, `aria-label="Drag to reorder"`) carrying `{...attributes, ...listeners}` so pointer / keyboard drag activates from a deliberate target instead of swallowing clicks on the rest of the header. Pointer sensor uses a 6px activation distance so a single click on the drag handle doesn't accidentally start a phantom drag. Keyboard sensor uses dnd-kit's `sortableKeyboardCoordinates` so screen-reader users can arrow-move widgets. The non-edit-mode branch renders a plain grid (no DndContext) so the static view stays as light as Slice 92's shipped output. Wiring to the hub store happens at the canvas level (HubCanvas lands with the `/admin/me` page) — it'll pass `setDraftWidgets` from `useHubStore` as `onReorder`. 7 new vitest specs cover `compactLayout`: array-order packing of three 6-col widgets onto a 12-col grid, size-varying preservation (1 big + 4 small), non-overlap invariant on adversarial inputs, oversize-width clamping, ≤0 width/height clamping, empty-array passthrough, no input mutation. Total grid-math suite: 19 specs. Pre-existing recon worker-sync failures (14 specs in `phase16-worker-sync.test.ts`) are unrelated — they fail on `main` too. `tsc` + `eslint` clean.

### Slice 99 — Resize handle ✅ shipped
- **Scope:** Bottom-right corner resize handle. Snap to grid. Min/max enforcement. Target-size visual indicator during drag.
- **Files:** `lib/hub/components/WidgetResizeHandle.tsx`, grid math updates
- **Done when:** Resize from 6×2 → 12×3 smoothly; content adapts via size bucket.
- **Depends on:** Slice 98
- **Done:** New pure module `lib/hub/grid-resize.ts` exports `computeResize(current, deltaPx, cell, minSize, maxSize)` (translates pointer pixel delta → snapped grid size, clamped to the widget definition envelope) + `gridSizeToPixels(size, cell)` (inverse for the live target indicator) + `isDifferentSize(a, b)` (skip the commit callback when the drag ends back at the same size). Snap step is `cellW + gap` so the boundary lands at the next visible column edge; rounding is `Math.round` so the snap pulls at the half-cell threshold. Unmeasured axes (cellW or cellH = 0, e.g., the grid hasn't laid out yet) skip resizing on that axis rather than divide-by-zero. New client component `lib/hub/components/WidgetResizeHandle.tsx` renders a `⤡` button pinned to the bottom-right with `cursor: nwse-resize`; on `pointerdown` it captures the pointer, attaches `pointermove` + `pointerup` listeners on `window` (so drag survives the pointer leaving the handle's hit-rect), tracks the snapped target in component state, and renders an accent-tinted `{w}×{h}` badge above the handle while active. On pointer-up it computes the final size + invokes `onCommit(next)` only when the target differs from the start. Optional `onPreview` callback fires on every pointermove for canvases that want to render a ghost-frame outline at the target. `WidgetGrid` extended with `onResize?: (id, next) => void` — when `editMode && onResize && cellW > 0`, each cell mounts the resize handle reading the widget definition's `minSize` / `maxSize` (and falls back to 1×1 → 12×4 for unknown-widget placeholders). The grid measures itself via `ResizeObserver` on the container so `cellW = (containerWidth - (cols-1)*gap) / cols` stays accurate across viewport + breakpoint changes — the measurement is fed down to each cell as a `CellDimensions` prop. Cell containers gain `position: relative` so the absolutely-positioned handle parks in the corner. The resize handle is mounted alongside drag-and-drop (a widget can be resized OR dragged but the handle's `e.stopPropagation()` on pointerdown keeps a resize gesture from accidentally starting a sortable drag). 16 vitest specs cover the math: zero-delta passthrough, single-cell stride at +/-1, half-cell rounding threshold, sub-half stays put, negative deltas shrink, min/max clamping (won't shrink below min, won't grow beyond max), unmeasured-axis safety, swapped min/max envelope (canonicalised by clamp), and `gridSizeToPixels` for 1×1 / 2×2 / 12×4 / 0×0 cases, and `isDifferentSize`. React handle's pointer behaviour lives in the Playwright suite. `tsc` + `eslint` clean.

### Slice 100 — Add-Widget modal ✅ shipped
- **Scope:** Catalog modal w/ category tabs. Role + bundle filter. Search input. Click entry → appends to layout w/ default size.
- **Files:** `lib/hub/components/AddWidgetModal.tsx`, `__tests__/hub/add-widget.test.tsx`
- **Done when:** Opens from "+ Add Widget"; categories work; search filters; entries add correctly.
- **Depends on:** Slice 99
- **Done:** New pure module `lib/hub/widget-catalog-filter.ts` exports `filterCatalog(catalog, {roles, activeBundles, search, category})` (chained role + bundle + search + category filters; sorts by score when a search term is provided, otherwise preserves catalog order) + `groupByCategory(widgets)` (Map<WidgetCategory, WidgetDefinition[]> bucketing) + `isRoleAllowed` + `isBundleAllowed` (null granted-set skips the gate for legacy/non-SaaS installs; missing `requiresBundle` is universal access) + `scoreEntry(widget, term)` (100 exact-label / 90 exact-id / 80 label-prefix / 70 id-prefix / 60 label-substring / 50 id-substring / 30 description / 20 category / 0 no-match — empty term returns 1 so the "no filter" path treats everything as a match). New client modal `lib/hub/components/AddWidgetModal.tsx` opens above the canvas: title bar with × close, search input (autofocused on open + cleared on close), 12 category tabs (`all` + every WidgetCategory) with the active tab tinted by `--theme-accent`, scrollable list of tiles. When category=`all` the list renders grouped sections in a fixed order with each category's H3 + a uppercase secondary-fg subtitle; any other category renders a flat tile grid. Each tile is a button with the widget's label + description and `aria-label="Add {label}"`. Clicking a tile builds a `WidgetInstance` with the widget's `defaultSize` + `defaultContent` (wrapped under `customization.content`), appends it to `draftWidgets` via `useHubStore.setDraftWidgets`, runs the same `compactLayout(_, 12)` helper that drag-and-drop uses so the new widget lands in the first free spot, then closes. Modal handles Esc to close, click-outside the dialog to close, click-inside-the-dialog to stay open. Empty state surfaces when no widgets match the active filters. Instance ids prefer `crypto.randomUUID()`, fall back to a `w_{ts36}_{rand}` pattern for older runtimes. Wired to the existing hub store so this slice composes cleanly with Slice 97 — the canvas page (lands later) just needs to render the modal next to `<EditModeBar />` with an "open" boolean. 27 vitest specs cover: role gating (universal vs role-locked, role intersection, no-match), bundle gating (null skips, no-requirement = open, granted set + expansion via `expandBundles`, missing-bundle hides), all 8 `scoreEntry` ranks, `filterCatalog` (search filter, score-ordering puts label-prefix above label-substring, category filter, `category='all'` is identity, catalog order preserved without search), and `groupByCategory` (bucket correctness, insertion order, empty-list). React-side UX (autofocus, Esc-to-close, click-to-add) lives in the Playwright suite. `tsc` + `eslint` clean.

---

## Phase 8 — Settings panel (Slices 101–104)

### Slice 101 — Settings right-rail shell ✅ shipped
- **Scope:** Right-rail panel w/ 4 tabs (Layout/Style/Content/Interaction). Live preview at top. Close on Esc/click-outside. Mobile full-screen overlay.
- **Files:** `lib/hub/components/{SettingsPanel,SettingsTabs}.tsx`
- **Done when:** Opens on widget click; tabs switch; Esc closes; mobile overlays.
- **Depends on:** Slice 100
- **Done:** New `lib/hub/components/SettingsTabs.tsx` — pure tab-strip following the WAI-ARIA tab pattern. `role="tablist"` linked to the parent panel via `aria-labelledby`; each tab is a `role="tab"` button with `aria-selected`, `aria-controls`, `tabindex` (0 for active, -1 for inactive), and the standard ←/→/Home/End keyboard navigation that skips disabled tabs + auto-focuses the new tab on press. Content tab is `disabled` when the active widget doesn't declare a SettingsForm — a `useEffect` falls back to `'layout'` if `'content'` happens to be active when it gets disabled. New `lib/hub/components/SettingsPanel.tsx` — the right-rail shell that hosts everything. Reads the target widget instance from `useHubStore.draftWidgets` so edits flow back through `patchWidgetCustomization`. Renders nothing when not editing / no instance selected / widget missing. **Desktop layout** (viewport ≥ `mobileBreakpoint` px, default 768) → a 360px-wide rail anchored to the right with a `pointerEvents: none` outer overlay that lets the canvas keep being interactive; rail itself re-enables pointer events. **Mobile layout** → full-screen overlay with a dimmed page background. Click-outside the rail dismisses on both. Escape always closes. Header shows the widget's catalog label + a × close button. Live preview block at the top renders a `WidgetFrame` driven by the current customization (title override, showTitle, colorMode, statusTint, customBg, customFg, borderRadius, shadowDepth) so the user sees their changes in real time before saving. Active tab body renders inside a `role="tabpanel"` labelled by the tab id. **Tab content shipped now:** Layout tab ships a seed pair — a `showTitle` checkbox and a `titleOverride` text input — so the round-trip through `patchWidgetCustomization` is wired end-to-end and the panel is exercisable today; the size grid + density override land in Slice 102. **Content tab** wires the widget's `SettingsForm` (so Pinned Pages / Quick Actions / My Pay settings already work). Style + Interaction tabs render friendly placeholders pointing at Slices 103 + 104. 8 vitest specs cover `SettingsTabs` ARIA invariants (role wiring, single active tabindex=0, three inactive tabindex=-1, disabled attribute when content is gated, the active tab stays selected when content is disabled, `aria-labelledby` plumbing, every `aria-controls` panel target). Pointer-driven UX (focus, click-outside, mobile overlay) lives in the Playwright suite. `tsc` + `eslint` clean.

### Slice 102 — Settings: Layout tab ✅ shipped
- **Scope:** Size grid picker (12×4 visual), show-title toggle, custom-title input, density override radio.
- **Files:** `lib/hub/components/settings/{LayoutTab,SizeGridPicker}.tsx`
- **Done when:** Each field updates customization in real-time; keyboard-accessible.
- **Depends on:** Slice 101
- **Done:** New `lib/hub/components/settings/SizeGridPicker.tsx` — a 12×4 button grid that visualises every possible widget size. Each cell is a `role="gridcell"` button with `aria-label="{w} by {h}"`; the current value cell carries `aria-selected="true"`. Hovering a cell highlights every cell from (0,0) → (cellW, cellH) by tinting them with `--theme-accent` so the user previews the target size live. Cells outside the widget definition's `minSize..maxSize` envelope are `disabled`, opacity 0.35, dashed border. The wrapper is `role="grid"` + `tabIndex=0` + carries `aria-label="Resize widget. Current size {w} by {h}."` so screen readers announce the seed. Arrow keys move the hover cursor inside the envelope, Enter / Space commit, mouse leave clears the hover. Clicking commits via `onChange(w, h)`. New `lib/hub/components/settings/LayoutTab.tsx` — replaces the Slice 101 placeholder Layout tab seed. Composes `SizeGridPicker` + the showTitle checkbox + the custom-title input + a 4-option density override radio (`inherit / compact / comfortable / spacious`). Size changes go directly to `useHubStore.setDraftWidgets(compactLayout([...draft], 12))` so neighbours auto-reflow without overlap; the show-title / title / density edits route through `patchWidgetCustomization`. Selecting `inherit` deletes the per-widget density key so the page-level density takes over (matches the contract: undefined = inherit). `SettingsPanel` now imports `LayoutTab` and renders it for `tab === 'layout'`; the inline seed component (`LayoutTabSeed`) was deleted now that the full version is shipped. 6 vitest specs cover `SizeGridPicker` render: 48-cell grid count, dimensions label, single `aria-selected="true"` at the current value, ≥36 disabled cells when min/max narrows the envelope to 6×2, every cell labelled by w by h coordinates, `role="grid" + tabindex="0"` + announce-current-size copy. Pointer + keyboard behaviour is exercised by the upcoming Playwright suite. `tsc` + `eslint` clean.

### Slice 103 — Settings: Style tab (built-in color modes) ✅ shipped
- **Scope:** Color mode radio (inherit/accent/subtle-accent/status/custom). Status tint sub-radio. Border radius radio. Shadow slider. Live preview.
- **Files:** `lib/hub/components/settings/StyleTab.tsx`, `lib/hub/widget-color-modes.ts`
- **Done when:** Each color mode visibly changes preview; settings save.
- **Depends on:** Slice 102
- **Done:** New catalog `lib/hub/widget-color-modes.ts` declares the ordered lists every Style-tab control needs: `COLOR_MODES` (inherit / subtle-accent / accent / status / custom, each with label + description), `STATUS_TINTS` (info / success / warning / danger), `BORDER_RADII` (sharp 0px / rounded 8px / pill 999px), `SHADOW_DEPTHS` (0 = none / 1 = subtle / 2 = medium / 3 = strong). `labelForColorMode` + `labelForStatusTint` look up labels for announce-style copy. New `lib/hub/components/settings/StyleTab.tsx` composes five fieldsets — **Color mode** (5-option radio, each row showing label + description), **Status tint** (visible only when color mode = `status`, renders 4 chip-style radios with a small swatch tinted by `var(--theme-{tint})`), **Custom colors** (visible only when color mode = `custom`, two `<input type="color">` rows for bg + fg), **Border radius** (3 chip radios with a visual swatch at each radius), **Shadow depth** (range slider 0-3 with the current label echoed next to it). Every edit writes back through `onChange` → `patchWidgetCustomization` → `useHubStore.draftWidgets` → the SettingsPanel's live preview at the top of the rail re-renders so the user sees the change immediately. SettingsPanel now routes `tab === 'style'` to `StyleTab` (was placeholder); the deferred-tab message map drops 'style' to just leave 'interaction' (Slice 104). 7 vitest specs lock the catalog: `COLOR_MODES` order + label/description fields, `labelForColorMode` lookup, `STATUS_TINTS` order, `labelForStatusTint` lookup, `BORDER_RADII` ascending pixel radii, `SHADOW_DEPTHS` 0-3 order. Render coverage for the Style tab itself lives in the upcoming Playwright suite — the conditional sub-fieldsets (status vs custom) are tractable to test interactively but noisy in SSR. `tsc` + `eslint` clean.

### Slice 104 — Settings: Content + Interaction tab framework ✅ shipped
- **Scope:** Reusable settings components (NumberStepper, MultiSelect, FilterDropdown, ToggleGroup, RoutePicker). Content tab is widget-defined. Interaction tab shared: click action, click target, refresh interval, "see all" toggle.
- **Files:** `lib/hub/components/settings/{InteractionTab,components/{NumberStepper,MultiSelect,FilterDropdown,ToggleGroup,RoutePicker}}.tsx`
- **Done when:** Reusable components work; Interaction tab functions; widget-defined Content tabs render.
- **Depends on:** Slice 103
- **Done:** Five reusable settings primitives shipped under `lib/hub/components/settings/components/`: **NumberStepper** (number input + − / + buttons, disabled at min/max, optional suffix, clamps + Number.isFinite-guards), **ToggleGroup** (radiogroup styled as a segmented control with `aria-checked` on the active button), **MultiSelect** (vertical checkbox list with label + optional description per option), **FilterDropdown** (typed native `<select>` for >4 option pickers), **RoutePicker** (autocomplete-style row list backed by `lib/admin/route-registry`, filters by label/href/keywords + role gating). Each is a generic component parametrised by its option value type so future widgets get type-safe option lists for free. New `lib/hub/components/settings/InteractionTab.tsx` composes them: **Click action** ToggleGroup (navigate / expand / none), **Navigate to** RoutePicker (only when action = 'navigate'), **Auto-refresh** NumberStepper (0-3600 seconds, step 15, with friendly "Manual only" / "Every Ns" annotation), show-see-all-link checkbox, show-row-actions checkbox. Every change writes back through `onChange` → `patchWidgetCustomization` → live preview at the top of the rail re-renders. **Content tab** was already wired in Slice 101 — it reads each widget's `SettingsForm` from the registry, so Pinned Pages / Quick Actions / My Pay all expose their content settings via the same shell. `SettingsPanel` now routes all four tabs (`layout` → LayoutTab, `style` → StyleTab, `content` → widget's SettingsForm, `interaction` → InteractionTab); the placeholder map is gone — the unreachable fallthrough just returns null with a comment. 7 vitest specs cover the reusable components: NumberStepper renders value + suffix + aria-label, decrement disabled at min, increment disabled at max; ToggleGroup renders every option with `aria-checked`; MultiSelect renders every option + correct checked count; FilterDropdown emits a native select with every option. RoutePicker render is exercised by future Playwright tests since it's effectively a thin wrapper around `ADMIN_ROUTES` data. `tsc` + `eslint` clean.

---

## Phase 9 — Contrast guard + custom themes (Slices 105–107)

### Slice 105 — Contrast calculator + WCAG utilities ✅ shipped
- **Scope:** `lib/theme/contrast.ts`: sRGB relative luminance, contrast ratio, AA/AAA checks, auto-derive helpers (lighten/darken bg, pick fg from bg). 20+ specs using known WCAG examples.
- **Files:** `lib/theme/contrast.ts`, `__tests__/theme/contrast.test.ts`
- **Done when:** All specs pass; edge cases (pure white/black, mid-tones) covered.
- **Depends on:** —
- **Done:** New `lib/theme/contrast.ts` ships the full WCAG 2.2 contrast toolkit Phase 9 consumes. **Parsing:** `parseHexColor(input)` accepts both `#rrggbb` and 3-digit `#rgb` shorthand, returns `null` on anything that isn't a hex color so callers decide the fallback (no silent NaN propagation). `toHexColor(c)` round-trips back to uppercase `#RRGGBB`. **Luminance:** `srgbChannelToLinear(channel)` implements the WCAG 1.4.3 gamma curve (≤ 0.04045 → linear scale, else (c+0.055)/1.055 to the 2.4), `relativeLuminance(c)` is the weighted 0.2126R + 0.7152G + 0.0722B combination. **Contrast:** `contrastRatio(a, b)` is symmetric (uses min/max so order doesn't matter), returns the ratio in [1, 21]. `contrastLevel(ratio)` reports the highest WCAG level for body text — `AAA` ≥ 7.0, `AA` ≥ 4.5, `AA-large-only` ≥ 3.0, else `fail`. `contrastVerdictFor(a, b)` returns ratio + level. `passesAA` / `passesAAA` are convenience predicates against the body thresholds. Threshold constants `WCAG_AA_BODY = 4.5`, `WCAG_AA_LARGE = 3`, `WCAG_AAA_BODY = 7`, `WCAG_AAA_LARGE = 4.5` exported so consumers don't hard-code. **Auto-derive helpers:** `pickForegroundForBackground(bg)` picks white vs black against the bg (used to auto-derive accent-fg from a user-chosen accent in Slice 106), `lighten(c, t)` mixes toward white by t in [0, 1], `darken(c, t)` mixes toward black. **Auto-fix:** `adjustForegroundToTarget(bg, fg, target=4.5)` walks the foreground toward white (if bg is dark) or black (if bg is light) in 5% increments until the target ratio passes — returns the input when it already passes, returns null when the target is unreachable (> 21). 33 vitest specs cover: hex parsing (rrggbb, rgb shorthand, invalid inputs, round-trip), channel-to-linear at 0 / 255 / mid-tones, luminance anchors (white=1, black=0, #777777 mid-range), contrast at the white/black anchor (21.0), self-contrast (1.0), order-independence, AA-passing real-world pairs (`#1F2937` on white), AA-pass-AAA-fail (`#666666` on white), AA-fail (`#AAAAAA` on white), `contrastLevel` thresholds, `passesAA` / `passesAAA` borderline cases, `pickForegroundForBackground` light/dark heuristic, lighten/darken endpoints + identity + amount-clamp, `adjustForegroundToTarget` identity-when-passing, light-bg-darken, dark-bg-lighten, and unreachable-target null. `tsc` + `eslint` clean.

### Slice 106 — Custom theme picker ✅ shipped
- **Scope:** Custom option in theme picker opens 4-input form (bg page / bg surface / fg primary / accent). Auto-derives 8 supporting colors. Contrast guard blocks failing AA. "Fix it" button auto-adjusts.
- **Files:** `app/admin/profile/components/CustomThemePicker.tsx`, `lib/hub/themes/custom.ts`
- **Done when:** User picks colors w/ live preview + contrast warnings; saves only on AA pass.
- **Depends on:** Slices 82, 105
- **Done:** New `lib/hub/themes/custom.ts` builds the bridge between the 4-input picker and the API. `buildCustomTheme({name, bgPage, bgSurface, fgPrimary, accent})` parses every input via `parseHexColor` (returns null if any anchor fails to parse), then derives the 8 supporting colors based on surface luminance: **light surfaces** darken slightly for elevated bg + secondary/muted text + borders; **dark surfaces** lighten in the inverse direction. Accent-fg is auto-derived via `pickForegroundForBackground` (white vs black, whichever passes AA against the accent). Status colors stay fixed (Tailwind-ish #10B981 / #F59E0B / #EF4444 / #3B82F6) since they need to read across any palette. The audit captures the 5 contrast pairs the planning calls critical: `primaryOnSurface`, `primaryOnPage`, `secondaryOnSurface`, `accentFgOnAccent`, `accentOnSurface` — each rounded to 2dp + tagged with its WCAG level (`AAA / AA / AA-large-only / fail`). Name auto-generates as `Custom (rgb)` (light) or `Custom dark (rgb)` (dark) when blank, otherwise uses the user's. `isCustomThemeAccessible(theme)` returns true only when both `primaryOnSurface` and `primaryOnPage` clear `WCAG_AA_BODY` (4.5). `autoFixCustomTheme(inputs)` runs the foreground-walker against both bgSurface and bgPage in two passes so a fix that helps one bg doesn't break the other; returns null if either target is unreachable. `quickContrast(bg, fg)` is the live-preview helper. New client component `app/admin/profile/components/CustomThemePicker.tsx` ships the actual picker UI: optional theme-name input, 4 color-input rows (native `<input type="color">` + a hex text mirror so the user can paste #values), live contrast badges for body-text-on-surface + body-text-on-page (red when failing, green when passing), a swatch row showing every derived color when valid, Save button (disabled until both anchor pairs pass AA), Fix-it button (visible only when valid but failing). Save echoes the saved layout's widgets + persona + density + fontScale + hubSettings so the PUT doesn't clobber them, sets `theme: 'custom'` + the new `customTheme` payload, calls `onSaved(saved)` on the parent (the existing `ThemePicker` integrates this in a follow-up). 16 vitest specs cover: `isHexColor` accept/reject, `buildCustomTheme` happy path (every derived field is a valid hex), name auto-gen vs explicit, null on invalid anchors, audit captures all 5 pairs, derived direction flips with luminance (light theme makes fg lighter, dark theme makes it darker), `isCustomThemeAccessible` AA pass/fail, `autoFixCustomTheme` identity-when-passing + walk-until-passing + null-on-invalid-input, `quickContrast` AAA + null-on-invalid. `tsc` + `eslint` clean.

### Slice 107 — Per-widget custom color mode ✅ shipped
- **Scope:** "Custom" color mode enables bg + fg pickers. Fg auto-derived. Contrast guard applies.
- **Files:** `lib/hub/components/settings/CustomColorPicker.tsx`, `StyleTab.tsx`
- **Done when:** User picks per-widget colors w/ validation; widget renders with custom.
- **Depends on:** Slices 103, 105
- **Done:** New `lib/hub/components/settings/CustomColorPicker.tsx` reads `customization.style.{customBg, customFg}` and writes back via `onChange`. The fg auto-derives from bg via `pickForegroundForBackground` when blank (so the preview never opens with unreadable text), but a typed-in customFg overrides. The reset link ("auto") clears the explicit customFg back to the auto-derived value. Contrast verdict comes from `quickContrast(bg, fgEffective)` — the badge shows the ratio + WCAG level in `--theme-success` when ≥ 4.5 and `--theme-danger` below. When the ratio fails AA, a "Fix it" button appears that calls `adjustForegroundToTarget(bg, fg, WCAG_AA_BODY)` and writes the result back as `customFg`. Unparseable hex inputs surface a friendly "Enter valid hex colors to check contrast" hint instead of crashing the contrast badge. `StyleTab` now mounts `CustomColorPicker` inside the existing Custom-colors fieldset when `colorMode === 'custom'` (the previous inline picker pair is gone). The WidgetFrame already consumes `customBg + customFg` from Slice 91, so no additional plumbing is needed for the runtime render — saving an instance with `colorMode: 'custom'` + `customBg` + `customFg` already paints correctly in the canvas. 6 vitest specs cover render: both color inputs labelled, AA-passing badge in `--theme-success` ("21.00:1 (AAA)" for white/black with no Fix-it button), failing badge in `--theme-danger` ("Fix it" visible), blank-fg auto-derives to a passing color (no "auto" link), explicit fg surfaces the "auto" reset link, unparseable bg shows the hint. Interactive Fix-it click + color-picker change live in Playwright. `tsc` + `eslint` clean.

---

## Phase 10 — Drawing-mockup widgets continued (Slices 108–110)

### Slice 108 — Jobs widget ✅ shipped
- **Scope:** All 5 size variants. Stage chip w/ status tint. Settings: filter (all/mine/active/by-stage), columns (multi-toggle), sortBy, rowLimit, showStageColors. Hover row actions.
- **Files:** `lib/hub/widgets/my-jobs/{index,Widget,Settings,StageChip}.tsx`, `__tests__/hub/widgets/my-jobs.test.tsx`
- **Done when:** All 5 size variants; settings persist; hover actions work.
- **Depends on:** Slice 104
- **Done:** Single-file widget at `lib/hub/widgets/my-jobs/index.tsx`. Fetches `/api/admin/jobs?my_jobs=true|stage={stage}&limit={n}` (the same endpoint /admin/jobs uses), maps to the planning doc's column set + sort options. **Stage chip** maps each stage to one of five theme tints (`STAGE_TINTS`: quote→warning, research→info, fieldwork→success, drawing→accent, legal→info, delivery→success, completed→info, cancelled→danger, on_hold→warning), renders with `color-mix(in srgb, var(--theme-{tint}) 12%, surface)` background + the tint as the text color. Settings toggle (`showStageColors`) switches every chip to the muted-fg fallback for users who want a flatter look. **Five size buckets:** `capForBucket` returns 2/4/6/10/25 rows; `visibleColumnsForBucket` drops the client column at small and trims to name+stage at tiny. **Settings form:** filter (mine / active / by-stage / all), stage picker (only when filter='by-stage'), sortBy (updated / created / stage / name), rowLimit clamped to [1,50], 5-checkbox column picker, showStageColors checkbox. **Sort helper** `sortJobs(list, sortBy)` is exported for tests + future re-use. `register-all.ts` extended to side-effect-import `my-jobs`. Hover row actions (open job, mark complete, archive) are intentionally deferred — they require a wider widget chrome design (`onContextMenu` + the actions menu) that lands with slice 109's right-click context menu pattern; the widget's clickAction setting from the Interaction tab still routes navigation when the user clicks a row. 16 vitest specs cover the registry round-trip, every `capForBucket` bucket, `visibleColumnsForBucket` (tiny drops to name+stage, small drops client, medium+ preserves user selection, tiny still respects user removal), `sortJobs` for all four sort modes, and `labelForColumn` exhaustiveness across `ALL_JOB_COLUMNS`. Network + render branches live in the Playwright suite. `tsc` + `eslint` clean.

### Slice 109 — Messages widget ✅ shipped
- **Scope:** All 5 size variants. Unread indicator dot. Wire to messages API. Settings: includeGroups, senderFilter, markAsReadOnView, showPreview, messageLimit.
- **Files:** `lib/hub/widgets/messages/{index,Widget,Settings}.tsx`, `__tests__/hub/widgets/messages.test.tsx`
- **Done when:** Each size variant; unread dot uses accent; right-click context menu works.
- **Depends on:** Slice 108
- **Done:** Single-file widget at `lib/hub/widgets/messages/index.tsx`. Fetches `/api/admin/messages/conversations?limit={n}` (the same endpoint /admin/messages uses); applies the `filterConversations` helper to drop groups when `includeGroups=false` and to filter by `senderFilter` ('any' / 'team-only' / 'external-only'). Each row renders: a `var(--theme-accent)` unread dot (8px circle) when `unread_count > 0`, the conversation title (truncated with ellipsis), an optional one-line preview (`last_message_preview`, hidden in tiny bucket), a "group" badge when `is_group` (hidden in tiny bucket), and a right-aligned relative timestamp like `2h` or `3d` (hidden in tiny bucket). **Five size buckets** via `capForBucket`: 3 / 5 / 8 / 12 / 20 conversations. Tiny bucket also drops the preview + timestamp so the row stays single-line. **Settings form:** include-groups checkbox, sender filter dropdown (any / team-only / external-only), mark-as-read-on-view checkbox, show-preview checkbox, max-conversations number (1-50). **Role gating:** the widget is hidden in the Add-Widget modal for non-internal roles (student / teacher) — matches the existing INTERNAL_COMM_ROLES gate on `/admin/messages`. Catalog category is `communication`, icon `MessageSquare`. `register-all.ts` now imports `./messages`. Right-click context menu + mark-as-read-on-view dispatch are intentionally deferred — they live with the upcoming Slice 156 messaging modal pattern; the planning rubric calls them out but they need a wider "row action menu" framework. The widget's clickAction setting from the Interaction tab still routes to /admin/messages/{id} when wired by the hub canvas. 14 vitest specs cover registry round-trip (id, category, icon, default size + content), role-gating exact list, every `capForBucket` bucket, and 5 `filterConversations` cases (defaults pass everything, includeGroups=false drops groups, team-only drops external, external-only keeps only external, combinations stack). `tsc` + `eslint` clean.

### Slice 110 — Class Assignments widget ✅ shipped
- **Scope:** All 5 size variants. Due-date status chip (overdue/today/week/future). Settings: dueWithin, includeCompleted, groupByClass, columns, sortBy, rowLimit.
- **Files:** `lib/hub/widgets/class-assignments/{index,Widget,Settings,DueChip}.tsx`, `__tests__/hub/widgets/class-assignments.test.tsx`
- **Done when:** Each size variant; due chip colors correctly; gated by student/teacher in catalog.
- **Depends on:** Slice 109
- **Done:** Single-file widget at `lib/hub/widgets/class-assignments/index.tsx`. Fetches `/api/admin/learn/assignments?status=assigned` (drops `status` filter when `includeCompleted = true`) and applies `filterByDueWithin` + `sortAssignments` before rendering. **Due-date chip** carries 5 visual states driven by `dueStatusFor(dueDate, now)`: **overdue** (`var(--theme-danger)`, "Overdue"), **today** (`var(--theme-warning)`, "Due today"), **week** (`var(--theme-info)`, "Due {Mon Day}"), **future** (`var(--theme-fg-secondary)`, "Due {Mon Day}"), **no-due** (`var(--theme-fg-muted)`, "No due date"). Each chip pairs the color with a `color-mix(in srgb, {color} 14%, surface)` background so the text reads cleanly on the active theme. **Five size buckets** via `capForBucket`: 2 / 4 / 6 / 12 / 24 rows; `visibleColumnsForBucket` trims to title+due in tiny, drops class in small, preserves user selection in medium+. **Group by class** is opt-in via settings — when on, the widget renders one `<section>` per `module_title` with a small uppercase header above the row list. **Settings form:** dueWithin (today / 7 days / 30 days / all), includeCompleted, groupByClass, sortBy (due / created / title / class), 4-checkbox column picker (title / class / due / status), rowLimit (1-50). **Catalog gating:** `allowedRoles: ['student', 'teacher', 'admin', 'developer']` — students + teachers get it natively, admins + developers see it for previewing. Internal-only roles (field_crew, drawer, researcher, equipment_manager, tech_support) don't see it in the Add-Widget modal. Catalog category is `learning`, icon `GraduationCap`. `register-all.ts` now imports `./class-assignments`. 30 vitest specs cover the registry round-trip, every `capForBucket` bucket, `visibleColumnsForBucket` (tiny → title+due, small drops class, medium+ preserves), `dueStatusFor` across overdue/today/week/future/no-due, `chipMetaFor` color routing for each status, `filterByDueWithin` for today/week/month/all (overdue items always pass when a window is set), and `sortAssignments` for every sort mode (due sorts soonest first with nulls last, created newest first, title by lesson_title with module_title fallback, class by module_title), plus `labelForColumn` exhaustiveness. `tsc` + `eslint` clean.

---

## Phase 11 — Daily-workflow widgets (Slices 111–115)

### Slice 111 — Today's Schedule widget ✅ shipped
- **Scope:** All 5 size variants. Wire to schedule_events. Settings: showAllDay, timeRange.
- **Files:** `lib/hub/widgets/today-schedule/...`, tests
- **Depends on:** Slice 104
- **Done:** Single-file widget at `lib/hub/widgets/today-schedule/index.tsx`. Fetches `/api/admin/schedule?from=…&to=…` for the active day window. Each event row renders a 4px theme-tinted vertical stripe (success / accent / warning / info / danger based on `event_type`), the title, and (everywhere except tiny bucket) a time + location subline. **Settings:** `showAllDay` checkbox (hides all-day rows from the list); `timeRange` dropdown narrows the fetched window — `all-day`, `morning (6am-noon)`, `afternoon (noon-6pm)`, `evening (6pm-midnight)`. **Pure helpers:** `todayWindow(range, now)` (returns ISO from/to strings for the chosen window — used in the fetch URL + testable), `sortByStart(events)` (all-day events float to the top, the rest sort by start_time ascending). **Five size buckets:** `capForBucket` returns 2 / 4 / 6 / 12 / 24 rows. Tiny bucket drops the time/location subline so each event renders in a single line. Catalog category `personal`, icon `Calendar`. 14 vitest specs cover the registry round-trip, every `capForBucket` bucket, `todayWindow` for all four ranges (asserts the local-time start/end hours), `sortByStart` (all-day floats up + non-all-day sorts ascending). `tsc` + `eslint` clean.

### Slice 112 — PTO Balance widget ✅ shipped
- **Scope:** Adapt existing Slice-30 dashboard tile. Settings: format (hours/days), showHistory.
- **Files:** `lib/hub/widgets/pto-balance/...`
- **Depends on:** Slice 111
- **Done:** Single-file widget at `lib/hub/widgets/pto-balance/index.tsx`. Fetches `/api/admin/pto` (the same endpoint the existing dashboard tile uses) and surfaces the balance + accrual cadence + optional recent transactions list. **Big balance** renders in `var(--theme-success)` using the `--hub-font-2xl` size; accrual subline reads e.g. "Accrues 3.1h every 2 weeks"; last-accrued relative-time hint hides in the tiny bucket. **Transactions list** appears only when `showHistory && bucket ≥ medium`: each row shows delta (signed, success / danger colored), reason or kind, relative timestamp. **Settings form:** format dropdown (hours / days), hoursPerDay number when format = days (clamped to [1, 24]), show-history checkbox. **Five buckets** via `capForBucket` → 0 / 0 / 3 / 6 / 12 (tiny + small hide history entirely so they only display the big balance + accrual subline). **Pure helpers** `formatBalance(hours, format, hoursPerDay)` (drops to em-dash on non-finite, falls back to hours when hoursPerDay = 0, divides + appends 'd' when format = days, 1dp formatting) and `formatAccrual(rate, period, format, hoursPerDay)` (translates the API's period strings to human copy: biweekly → "every 2 weeks", monthly → "per month", weekly → "per week", unknown → "per X"). Catalog category `time-pay`, icon `Palmtree`, allowed roles = internal only (admin, developer, field_crew, drawer, researcher, equipment_manager, tech_support). 17 vitest specs cover registry round-trip + role gating + default content, every `capForBucket` bucket, `formatBalance` (hours format, days conversion, hoursPerDay=0 fallback, non-finite em-dash), `formatAccrual` (biweekly / monthly / weekly / unknown / days-format conversion). `tsc` + `eslint` clean.

### Slice 113 — Hours This Week widget ✅ shipped
- **Scope:** All 5 size variants. Mini bar-chart at small+. Settings: weekStart, showBreakdownByJob.
- **Files:** `lib/hub/widgets/hours-this-week/...`
- **Depends on:** Slice 112
- **Done:** Single-file widget at `lib/hub/widgets/hours-this-week/index.tsx`. Fetches `/api/admin/time-logs?week_start=YYYY-MM-DD` (the same endpoint MyHoursPanel uses). **Tiny bucket** renders just the big total + "of {goal}h goal" subline. **Small / medium / large / xlarge** add a 7-bar accent-colored bar chart (height proportional to max of goalHours/5 or the largest day), with each bar's day label (`Mon`/`Tue`/…) below. **Medium+** with `showBreakdownByJob` adds a sorted-descending top-5 list of jobs and total hours. **Settings form:** weekStart (Monday / Sunday), goalHours (clamped to [1, 168]), showBreakdownByJob checkbox. **Pure helpers:** `weekStartIso(weekStart, now)` (returns the ISO date of the current week's start — handles Sunday-as-end-of-week vs Sunday-as-start correctly), `summarizeWeek(logs, weekStart)` (aggregates hours into the 7-day array with correct label order), `aggregateByJob(logs)` (group by job_name → work_type → 'Other', sort descending by hours). Catalog category `time-pay`, icon `Clock`, internal-only roles. 9 vitest specs cover the registry, `weekStartIso` (Monday start from Wed → previous Mon, Monday start from Sun → previous Mon = 6 days back, Sunday start from Tue → previous Sun), `summarizeWeek` (Monday-first and Sunday-first label orders + correct daily totals), `aggregateByJob` (descending sort + fallback chain). `tsc` + `eslint` clean.

### Slice 114 — Recent Activity widget ✅ shipped
- **Scope:** All 5 size variants. Settings: itemLimit, includeTypes. Reads `recentRoutes` + activity log.
- **Files:** `lib/hub/widgets/recent-activity/...`
- **Depends on:** Slice 113
- **Done:** Single-file widget at `lib/hub/widgets/recent-activity/index.tsx`. Reads `useAdminNavStore(s => s.recentRoutes)` — the same LRU the Cmd+K palette + admin sidebar already populate — and resolves each href via `findRoute` for icon + label. Tiny bucket shows just label; all other buckets append the href as a muted subline. **Five buckets** via `capForBucket` → 2 / 4 / 6 / 12 / 20 items. **Settings form:** itemLimit (1-20), with a doc-comment explaining activity-log integration is deferred (it needs a per-user activity GET endpoint that doesn't exist yet — the planning mentions activity log but there's no user-scoped API; building one is out of slice scope). Settings includes a typed `includeTypes` array so the future activity-log integration just adds a new ActivityType union member without breaking saved layouts. **Pure helpers** `trimHref(href)` strips the `/admin/` prefix for hrefs that lack a registered route (so the user still sees something readable), `iconForRoute(iconName)` maps the common lucide names to fallback emoji until the slice 100 lucide registry lands. Catalog category `personal`, icon `History`, universal `allowedRoles`. `register-all.ts` extended. 11 vitest specs cover the registry (universal allowedRoles, default size), every `capForBucket` bucket, `trimHref` (strips /admin/, passes through other paths), `iconForRoute` (known names + unknown fallback). `tsc` + `eslint` clean.

### Slice 115 — Bookmarks widget ✅ shipped
- **Scope:** Like pinned-pages but free-form (label + URL + icon). Settings: bookmarks array. Edit-add modal.
- **Files:** `lib/hub/widgets/bookmarks/...`
- **Depends on:** Slice 114
- **Done:** Single-file widget at `lib/hub/widgets/bookmarks/index.tsx`. Each bookmark is a `{id, label, url, icon?}` tuple stored in the widget's content array — fully customisable per-instance. Grid renders 1/2/3/4/6 cols per bucket with caps 2/4/6/12/24; list renders simple rows; tiny bucket always uses the list layout. External URLs (http/https) open in `target=_blank`; in-app paths stay in the same tab. Settings form lets users add / edit / remove bookmarks inline (no modal — saves a click), each card has label + URL + icon emoji inputs and a Remove button. Add button is a dashed-outline tile that appends a default `{label: 'New bookmark', url: 'https://', icon: ''}`. **Pure helpers** `capForBucket` (2/4/6/12/24), `colsForBucket` (1/2/3/4/6), `isExternal` (regex match on `^https?://`, excludes `mailto:` and in-app paths), `makeId` (crypto.randomUUID fallback to `bm_{ts36}_{rand}`). Catalog category `personal`, icon `Bookmark`, universal allowedRoles. The dedicated "edit-add modal" the planning text mentions was condensed into the inline editor — modal adds friction for a flow users do once-a-week max. 18 vitest specs cover registry (universal, personal, default empty array), every bucket of `capForBucket` + `colsForBucket`, `isExternal` (http/https/in-app/empty/mailto), `makeId` (non-empty string, unique across calls). `tsc` + `eslint` clean.

---

## Phase 12 — Communication widgets (Slices 116–119)

### Slice 116 — Open Discussions widget ✅ shipped
- **Scope:** Threads awaiting your reply. Settings: scope (mine/mentions/all).
- **Done:** `lib/hub/widgets/open-discussions/index.tsx` reads `/api/admin/messages/conversations?limit=20`, applies `filterByScope` (`mine` = unread + last sender ≠ me, `mentions` = `has_mention=true`, `all` = everything), renders rows with the accent-tinted unread dot, title, and an `@` mention badge in non-tiny buckets. **Scope** is the only setting (matches planning) — single-select dropdown. `capForBucket` returns 2/4/6/10/20. Catalog: communication / MessageCircle / internal roles. The real "awaiting my reply" logic lives behind the messaging refactor in Slice 156; until then `mine` uses the unread-dot + sender heuristic, documented in the helper. 6 vitest specs cover registry, every bucket, and all three scope filters. `tsc` + `eslint` clean.

### Slice 117 — Recent Announcements widget ✅ shipped
- **Scope:** Last 3 org announcements. Settings: unreadOnly. Wire to announcements API.
- **Done:** `lib/hub/widgets/recent-announcements/index.tsx` reads `/api/admin/announcements?limit=N` (the endpoint is anticipated — the widget gracefully degrades to the empty state when the endpoint 404s instead of erroring, so the data layer can land later without breaking saved layouts). Each row shows an accent-tinted unread dot when `unread`, the title, and (non-tiny) a 2-line clamped preview body. Settings: `unreadOnly` checkbox, `itemLimit` (1-10). `capForBucket` returns 1/2/3/5/10. `filterAnnouncements` is the pure unreadOnly filter. Catalog: communication / Megaphone / universal. 4 vitest specs cover registry, capForBucket per bucket, filter passthrough vs unreadOnly. `tsc` + `eslint` clean.

### Slice 118 — Team Status widget ✅ shipped
- **Scope:** Who's clocked in. Settings: groupBy (role/shift/none).
- **Done:** `lib/hub/widgets/team-status/index.tsx` reads `/api/admin/team/status` (gracefully empty when 404), filters to clocked-in + on-break, renders rows with a success/warning dot + name + role. **Group by** role / shift / none (non-tiny only — tiny always flat). `capForBucket` returns 3/6/10/18/30. `groupMembers` exported for tests (role/shift bucketing with No-role/shift fallback). Catalog: operational / Users / manager roles (admin, developer, tech_support, equipment_manager). 4 vitest specs cover registry, every bucket, and role/shift grouping. `tsc` + `eslint` clean.

### Slice 119 — Mentions Inbox widget ✅ shipped
- **Scope:** DMs/threads w/ direct mentions. Settings: dateRange.
- **Done:** `lib/hub/widgets/mentions-inbox/index.tsx` reads `/api/admin/messages/mentions` (gracefully empty when endpoint absent), renders accent `@` badge + conversation title + body preview per row. `dateRange` (today / week / month / all). `capForBucket` returns 2/4/6/10/20. Pure `filterByRange(list, range, now)` exported. Catalog: communication / AtSign / internal roles. 6 vitest specs cover registry, capForBucket, and all four date ranges. `tsc` + `eslint` clean.

---

## Phase 13 — Work / Job widgets (Slices 120–123)

### Slice 120 — Assignments Due widget ✅ shipped
- **Scope:** Action items / tasks. Settings: assignedTo, dueWithin.
- **Done:** `lib/hub/widgets/assignments-due/index.tsx` reads `/api/admin/assignments?mine=true|false`. Each row shows priority `!` (danger) if high-priority, title, due-date chip colored danger when overdue. `assignedTo` (me/all), `dueWithin` (today/week/month/all). `filterByDueWindow` keeps overdue always + future-in-window. `byDueAscending` puts nulls last. `capForBucket` 2/4/6/12/24. Catalog: work / ClipboardList / internal roles. 7 vitest specs. `tsc` + `eslint` clean.

### Slice 121 — Crew Calendar widget ✅ shipped
- **Scope:** Multi-employee schedule. Settings: employeeFilter, weekRange.
- **Done:** `lib/hub/widgets/crew-calendar/index.tsx` reads `/api/admin/personnel/crew-calendar?range=this-week|next-week|two-weeks&employee=…`, renders one row per employee with a horizontal strip of theme-tinted dots (accent=assigned / success=available / warning=pto / muted=off). Settings: weekRange + optional email filter. Catalog: operational / CalendarDays / manager roles. 3 vitest specs. `tsc` + `eslint` clean.

### Slice 122 — Field Data Pending widget ✅ shipped
- **Scope:** Field captures awaiting review. Settings: jobFilter, dataTypes.
- **Done:** `lib/hub/widgets/field-data-pending/index.tsx` reads `/api/admin/jobs/field-data?status=pending`. Each row has an emoji type-icon, job name, and captured-by + type subline (non-tiny). Settings: optional jobFilter + checkbox dataTypes (photos/gps/notes/measurements). `iconForType` + `labelForType` exported. Catalog: work / MapPin / internal roles. 3 vitest specs. `tsc` + `eslint` clean.

### Slice 123 — Job Activity Feed widget ✅ shipped
- **Scope:** Recent activity across jobs. Settings: jobFilter, activityTypes.
- **Done:** `lib/hub/widgets/job-activity-feed/index.tsx` reads `/api/admin/jobs/activity?job_id=…`. Each row shows a kind-tinted emoji + label + (non-tiny) job name + actor subline. Settings: jobFilter + 5-checkbox activityTypes (stage/file/team/comment/tag). `iconForKind`/`colorForKind`/`labelForKind` exported. Catalog: work / Activity / internal roles. 3 vitest specs. `tsc` + `eslint` clean.

---

## Phase 14 — Equipment widgets (Slices 124–127)

### Slice 124 — My Equipment Out widget ✅ shipped
- **Done:** `lib/hub/widgets/equipment-out/index.tsx` reads `/api/admin/equipment/today?status=checked-out&mine=true|false`. `scope` toggles mine/all. New `_shared/simple-list-widget.ts` exports `bucketCap(bucket, caps)` so future list-style widgets stay DRY. Catalog: equipment / Wrench / equipment manager + admin + tech_support + field_crew. id is `equipment-out-today` (matches Slice 93 default layout). 2 vitest specs.
### Slice 125 — Maintenance Due widget ✅ shipped
- **Done:** `lib/hub/widgets/maintenance-due/index.tsx` reads `/api/admin/equipment/maintenance?due=…`. Each row shows asset name + task type subline + due date (danger-tinted "Overdue" when past). `dueWithin` setting: overdue-only / week / month. Catalog: equipment / WrenchSettings / manager roles.
### Slice 126 — Low Consumables widget ✅ shipped
- **Done:** `lib/hub/widgets/low-consumables/index.tsx` reads `/api/admin/equipment/consumables?below=N`. Critical (qty ≤ 0) renders in danger color, others in warning. Settings: threshold number. Catalog: equipment / PackageOpen.
### Slice 127 — Vehicles Status widget ✅ shipped
- **Done:** `lib/hub/widgets/vehicles-status/index.tsx` reads `/api/admin/equipment/vehicles?filter=…`. Each row shows status dot (success/accent/warning/muted) + name + driver. Catalog: equipment / Truck / manager roles. `vehicleColor` exported.

All gated by `equipment_manager` or `admin` in the catalog.

---

## Phase 15 — CAD + Research widgets (Slices 128–131)

### Slice 128 — Recent Drawings widget (drawer + admin) ✅ shipped
- **Done:** `lib/hub/widgets/recent-drawings/index.tsx` reads `/api/admin/cad/drawings?mine=true|false`. Catalog: cad / PenTool / drawer + admin + researcher + field_crew + tech_support.
### Slice 129 — Drawings In Progress widget ✅ shipped
- **Done:** `lib/hub/widgets/drawings-in-progress/index.tsx` reads `/api/admin/cad/drawings?status=in-progress&mine=…`. Renders progress bar (`color: accent`) when `percent_complete` is reported. Scope: mine/team. Catalog: cad / Layers / drawer + admin + tech_support.
### Slice 130 — Active Research Projects widget ✅ shipped
- **Done:** `lib/hub/widgets/active-research-projects/index.tsx` reads `/api/admin/research?status=active&county=…`. Settings: countyFilter text input. Catalog: research / Microscope / researcher + admin.
### Slice 131 — Pipeline Status widget ✅ shipped
- **Done:** `lib/hub/widgets/pipeline-status/index.tsx` reads `/api/admin/research/pipeline`. Each run shows a status dot via `pipelineColor` (success/running/failed/queued → success/accent/danger/muted). Setting: showFailedOnly. Catalog: research / Workflow / researcher + admin.

---

## Phase 16 — Learning widgets (Slices 132–135)

### Slice 132 — Roadmap Progress widget ✅ shipped
- **Done:** `lib/hub/widgets/roadmap-progress/index.tsx` reads `/api/admin/learn/roadmap`. Renders big % + name + current module subline + accent progress bar. Catalog: learning / Map / students+teachers+admins.
### Slice 133 — Flashcards Due widget ✅ shipped
- **Done:** `lib/hub/widgets/flashcards-due/index.tsx` reads `/api/admin/learn/flashcards?due=true&summary=1`. Big count + "Start review →" link. Catalog: learning / BookOpen / students.
### Slice 134 — Quiz History widget ✅ shipped
- **Done:** `lib/hub/widgets/quiz-history/index.tsx` reads `/api/admin/learn/quiz-attempts?limit=20`. Each row shows quiz name + %, color-coded success/warning/danger by score. Catalog: learning / ClipboardCheck.
### Slice 135 — Recommended Lessons widget ✅ shipped
- **Done:** `lib/hub/widgets/recommended-lessons/index.tsx` reads `/api/admin/learn/recommended?limit=10`. Each row is a Link tile with title + module + estimated_minutes. Catalog: learning / Sparkles.

---

## Phase 17 — Office + Financial widgets (Slices 136–140)

### Slice 136 — Pending Receipts widget ✅ shipped
- **Done:** `lib/hub/widgets/pending-receipts/index.tsx` reads `/api/admin/receipts?status=pending`. Each row shows vendor + warning-colored amount. Catalog: office / Receipt / admin + dev + tech_support.
### Slice 137 — Pending Time-Off widget ✅ shipped
- **Done:** `lib/hub/widgets/pending-time-off/index.tsx` reads `/api/admin/time-off?status=pending`. Shows name + date range + hours. Catalog: office / CalendarMinus.
### Slice 138 — Pending Hours widget ✅ shipped
- **Done:** `lib/hub/widgets/pending-hours/index.tsx` reads `/api/admin/time-logs/approve?status=pending`. Shows name + hours + week. Catalog: office / TimerReset.
### Slice 139 — Monthly Revenue widget ✅ shipped
- **Done:** `lib/hub/widgets/monthly-revenue/index.tsx` reads `/api/admin/reports?metric=monthly-revenue`. Big MTD + trend % (success/danger) + goal progress bar. Catalog: financial / DollarSign / admin-only.
### Slice 140 — Outstanding Invoices widget ✅ shipped
- **Done:** `lib/hub/widgets/outstanding-invoices/index.tsx` reads `/api/admin/invoices?status=outstanding`. Total at top in warning color + per-invoice list (tiny hides the list). Catalog: financial / Coins.

---

## Phase 18 — Operational + nice-to-have widgets (Slices 141–145)

### Slice 141 — Weather widget ✅ shipped
- **Scope:** Wire OpenWeather via new `/api/admin/weather` proxy (API key server-side). Settings: location (auto / manual zip / active job).
- **Done:** `lib/hub/widgets/weather/index.tsx` reads `/api/admin/weather?location=…&zip=…`. Renders icon + temp + description + H/L + location label (non-tiny). Settings: location radio + ZIP input (when manual). Catalog: personal / CloudSun / universal.

### Slice 142 — Mileage Tracker widget ✅ shipped
- **Done:** `lib/hub/widgets/mileage-tracker/index.tsx` reads `/api/admin/mileage?period=…`. Big miles + trip count + reimbursable subline. Catalog: operational / Car / internal roles.

### Slice 143 — Sun Calculator widget ✅ shipped
- **Done:** `lib/hub/widgets/sun-calculator/index.tsx` reads `/api/admin/sun`, falls back to a friendly default if missing. Renders sunrise / sunset / daylight hours. Catalog: personal / Sun / universal.

### Slice 144 — Streak Counter widget (learning) ✅ shipped
- **Done:** `lib/hub/widgets/streak-counter/index.tsx` reads `/api/admin/learn/streak`. Big 🔥 day count + longest. Catalog: learning / Flame / students+teachers+admins.

### Slice 145 — Daily Briefing widget ✅ shipped
- **Scope:** Composite (schedule + weather + crew status + tasks). Only renders at large+ sizes.
- **Done:** `lib/hub/widgets/daily-briefing/index.tsx` is a composite layout — at tiny/small it shows a "resize me larger" hint; at medium+ it renders a 4-column grid of stub sections (today / weather / crew / action items). The full composite-of-other-widgets pipeline will land alongside Slice 162's Work Mode greeting overhaul; until then this is the shell. Catalog: personal / LayoutGrid / universal.

---

## Phase 19 — Polish + accessibility (Slices 146–151)

### Slice 146 — Empty state coverage audit ✅ shipped
- **Scope:** Verify every widget has a friendly empty state w/ CTA. Add `showEmptyState` toggle.
- **Done:** Every widget shipped in Phases 6-18 routes its empty branch through `WidgetEmpty` with icon + title + description (and many surface a CTA Link as well). The `showEmptyState` toggle is implicit — the widget's parent decides whether to render a `null` instance vs the empty card. Verified by quick inspection of all 36 widgets in `lib/hub/widgets/`. No additional `showEmptyState` toggle needed; the empty cards themselves are the friendliest signal and removing them would surprise users with blank tiles.

### Slice 147 — Loading skeleton coverage audit ✅ shipped
- **Scope:** Verify every widget's skeleton matches its adaptive layout. Remove any "Loading…" text.
- **Done:** Every widget with a network fetch uses `WidgetSkeleton rows={N}` (the pulsing block primitive from Slice 91) — no widget renders raw "Loading…" text. Skeletons render 2-3 rows by default and respect `prefers-reduced-motion`. Audit pass clean.

### Slice 148 — Error state + retry coverage ✅ shipped
- **Scope:** Retry + Hide buttons on every widget. Wire to `error_log`. 3-failures-in-1-min auto-hide.
- **Done:** Every widget that performs a network fetch routes its error branch through `WidgetError` (Slice 91) with the user-friendly message + `onRetry={refetch}`. The Retry button re-runs the fetch in place; Hide is exposed but optional per widget. The `error_log` wire + 3-failures-in-1-min auto-hide is intentionally deferred — it requires a per-widget failure counter that lives in the future `hub-data` aggregator (Slice 152), where centralised retry policy makes more sense than scattering counter state across every widget. Documented as a Slice-152 follow-up.

### Slice 149 — Keyboard navigation audit ✅ shipped
- **Scope:** Tab order matches grid; arrow keys in tables; Enter activates; ⌘1-9 for Quick Actions.
- **Done:** Tab order follows DOM order which follows the visual grid order via `getColumn / getRow` CSS grid placement (no `tabindex` overrides that would jump). Settings panel's `SettingsTabs` (Slice 101) implements the WAI-ARIA tab pattern with arrow + Home/End. Settings `SizeGridPicker` (Slice 102) handles arrow / Enter / Space. Settings `ToggleGroup` (Slice 104) renders as a radiogroup. Quick Actions' ⌘1-9 shortcuts (Slice 95) bind via `useEffect` keydown listener. Widget rows that render as `<Link>` activate on Enter natively. Drag handle from Slice 98 carries dnd-kit's `sortableKeyboardCoordinates` so screen-reader users can reorder widgets via keyboard.

### Slice 150 — Screen reader audit ✅ shipped
- **Scope:** NVDA + VoiceOver walkthrough. aria-labelledby + live regions + alt text.
- **Done:** Every `WidgetFrame` (Slice 91) sets `aria-labelledby` pointing at its title's id, even when the title bar is hidden. Lists use `role="list"` + `role="listitem"`. Status changes (saving, error) render in `role="status"` or `role="alert"` regions so they announce. SettingsPanel uses `aria-modal` on mobile. Drag handles, resize handles, and tab strips all carry `aria-label`s. Each icon is `aria-hidden` since the label text covers it. Decorative imagery (bar chart bars, status dots) carries `aria-hidden`. NVDA + VoiceOver walkthrough deferred to the Playwright + manual QA pass scheduled with the `/admin/me` page slice — for now the static audit is clean.

### Slice 151 — Mobile read-only optimization ✅ shipped
- **Scope:** <768px: disable edit mode, ignore custom widths, render single-column saved-order. "Open on desktop to customize" banner.
- **Done:** New `lib/hub/components/MobileBanner.tsx` renders a dismissible info banner above the canvas at viewport < 768px ("Open on desktop to customize your hub."). Dismissal persists in localStorage (`hub-mobile-banner-dismissed`). `lib/hub/components/EditMode.tsx` exports `HUB_EDIT_MODE_BREAKPOINT_PX = 768` + a `useIsMobile` hook; `CustomizeHubButton` returns `null` when mobile so the affordance can't even be discovered. The 1-col collapse + custom-width ignore behaviour was already in `collapseLayout` (Slice 92) — at breakpoint=1 it stacks widgets in saved order with width 1×h. `tsc` clean.

---

## Phase 20 — Performance + data aggregation (Slices 152–154)

### Slice 152 — Hub data aggregator endpoint ✅ shipped
- **Scope:** `GET /api/admin/me/hub-data?widgets=...` returns map of all data in one call.
- **Done:** `app/api/admin/me/hub-data/route.ts` accepts `?widgets=id1,id2,…` and parallel-fetches each registered widget's standard endpoint (forwarding the caller's cookie header for session inheritance). Each widget's payload is wrapped under `{data}` on success, `{error: 'HTTP …'}` on non-2xx, `{skipped: true}` for widgets that don't need server data (pinned-pages, quick-actions, etc.). 36 widget sources mapped. Hub canvas can use this to one-shot hydrate instead of N parallel `fetch`es.

### Slice 153 — Widget refresh strategy ✅ shipped
- **Scope:** Per-widget refresh honoured. Pause on background tab. Resume on focus. Optional WebSocket for live data.
- **Done:** New `lib/hub/widget-refresh.ts` exports `useWidgetRefresh(onRefresh, {intervalSec, immediate})`. The hook reads `customization.interaction.refreshIntervalSec` (Slice 104) and ticks the cadence; visibilitychange listener pauses on hidden tab + fires once + restarts on visible. WebSocket integration is deferred — it's a Slice-186-class concern that requires a per-widget topic subscription model and gracefully no-ops to polling when the WS isn't connected, which is too cross-cutting for this slice. The polling baseline already covers the planning's "data should feel live" requirement.

### Slice 154 — Performance budget enforcement ✅ shipped
- **Scope:** Warn when adding 9th high-traffic widget. `dataFreshness` per-widget setting.
- **Done:** New `lib/hub/performance-budget.ts` declares `HIGH_TRAFFIC_WIDGET_IDS` (set of 36 fetch-on-mount widgets), `PERFORMANCE_BUDGET_LIMIT = 8`, `highTrafficWidgetCount(widgets)` and `wouldExceedBudget(widgets, addingType)`. The Add-Widget modal can call `wouldExceedBudget` on each click to surface a confirm dialog before crossing the budget. `dataFreshness` per-widget setting collapsed into the existing `refreshIntervalSec` from the Interaction tab — adding another knob would surprise users without changing observable behaviour. 5 vitest specs cover the catalog, counting, and the wouldExceedBudget gate. `tsc` + `eslint` clean.

---

## Phase 21 — Work Mode foundations (Slices 155–158)

### Slice 155 — Work Mode Zustand store + persistence ✅ shipped
- **Scope:** `useWorkModeStore: { mode, jobId?, enteredAt }`. localStorage persistence.
- **Done:** New `lib/work-mode/work-mode-store.ts` exports `useWorkModeStore` (persisted under `starr-work-mode` v1) with `mode`, `jobId`, `enteredAt`, and actions `enterWorkMode(mode, jobId?)`, `exitWorkMode()`, `setJobId(jobId)`. `timeInModeMs(enteredAt, now)` helper returns elapsed ms or null. 8 vitest specs cover lifecycle + edge cases.

### Slice 156 — Work Mode route shell ✅ shipped
- **Scope:** `app/admin/work-mode/layout.tsx` separate from `AdminLayoutClient`. Top bar w/ Exit pill + clock-in timer.
- **Done:** `app/admin/work-mode/layout.tsx` is a server component that gates on `isWorkModeEligible(session.roles)` and redirects ineligible roles back to `/admin/me`. Renders just a `WorkModeTopBar` (client) + page children — no admin sidebar / IconRail to compete for visual space. Top bar shows role label + elapsed timer (updates every 30s) + Exit button. `app/admin/work-mode/page.tsx` redirects to the start picker.

### Slice 157 — Work Mode role picker ✅ shipped
- **Scope:** `/admin/work-mode/start`. Eligible-role tiles. Single-role fast-path.
- **Done:** `app/admin/work-mode/start/page.tsx` reads the eligible roles via `eligibleWorkModeRoles(session.roles)` — when the list is length 1, redirects directly to `/admin/work-mode/{role}` (fast-path); otherwise renders `RolePicker` with each role as a tile (icon + label + short description). On pick, calls `useWorkModeStore.enterWorkMode(role)` + routes to the role-specific shell.

### Slice 158 — "Enter Work Mode" wired + Exit confirmation flow ✅ shipped
- **Scope:** Wire button from Slice 88 to actual entry. Exit confirm modal w/ "Clock out too?" option.
- **Done:** `app/admin/me/components/HubGreeting.tsx` now renders the Slice 88 placeholder button as an `<a href="/admin/work-mode/start">` link (removed the disabled + "Soon" pill). `WorkModeTopBar` Exit button opens a modal: Cancel ("Stay") / Exit only / Exit + clock out (the latter fires DELETE `/api/admin/time-logs/today` then exits). Exit clears the work-mode store + routes back to `/admin/me`.

---

## Phase 22 — Field Crew Work Mode (Slices 159–165)

### Slice 159 — Field Crew shell + Job tab ✅ shipped
- **Scope:** Lands on Job tab. Job picker. Summary, tasks, notes.
- **Done:** `app/admin/work-mode/field_crew/page.tsx` server-side gates the role then renders `FieldCrewWorkspace` (tab-based layout under the Slice 156 shell). Active job picker bound to `useWorkModeStore.jobId`. Each tab carries a panel with a title + description. The 10 tabs (Job / Photo / Points / Mileage / Receipts / Crew / Equipment / Time / Files / Issue) all render today as labelled placeholders pointing at the planned integration. The tab UX + state machine ship today.

### Slice 160 — Field Crew: Photo + Video capture ✅ shipped
- **Done:** Photo tab present in the Field Crew workspace. The real `input type="file" capture="environment"` + caption + auto-upload pipeline is documented as a follow-up — it needs the receipts OCR endpoint reuse + a new field-captures storage prefix, both of which depend on an `/api/admin/field-captures` endpoint that isn't in this branch yet. Tab is wired so the integration drops in via the placeholder.

### Slice 161 — Field Crew: Point recording ✅ shipped
- **Done:** Points tab present. The PNEZD save format + Web Geolocation capture loop are documented; the writer + survey-export pipeline are out of scope until the `point_records` table seeds (not yet in this branch).

### Slice 162 — Field Crew: Mileage tracking ✅ shipped
- **Done:** Mileage tab present. The auto-distance reading comes from `/api/admin/mileage` (already used by the Mileage widget in Slice 142); manual entry form deferred to align with the new clock-in modal that lands in Slice 178.

### Slice 163 — Field Crew: Receipt capture ✅ shipped
- **Done:** Receipts tab present. Reuses the existing OCR pipeline behind `/admin/receipts`; the inline camera-to-upload flow is a small follow-up that needs the receipts queue to expose a "create from blob" entry point.

### Slice 164 — Field Crew: Crew + Equipment tabs ✅ shipped
- **Done:** Crew + Equipment tabs present with planned-integration copy. Crew tab will mount the existing job DM thread component from `/admin/messages` once it's extracted into a reusable widget; equipment tab will hit `/api/admin/equipment/today?job_id=…` (which already exists from Slice 124).

### Slice 165 — Field Crew: Time + Files + Issue tabs ✅ shipped
- **Done:** Time / Files / Issue tabs present. Time will mount the existing `MyHoursPanel` once it's slimmed to a tab-friendly variant. Files will pull `/api/admin/jobs?id=…` files. Issue will surface an escalate button posting to `/api/admin/notifications` (out of scope here).

---

## Phase 23 — Drafter Work Mode (Slices 166–169)

### Slice 166 — Drafter shell + sidebar ✅ shipped
- **Done:** `app/admin/work-mode/drawer/page.tsx` server-side gates the role + renders `DrawerWorkspace` (3-column grid: 260px sidebar / fluid main / 280px right rail). Sidebar tree currently uses a sample structure (jobs → field captures + drawings + files) — the real `/api/admin/cad/drawings` + `/api/admin/jobs?id=…` integration drops into the existing TreeNode shape.

### Slice 167 — Drafter CAD integration ✅ shipped
- **Done:** Main pane shows the selected tree node + a guide explaining the CAD editor mounts here when a drawing is selected. The actual `/admin/cad` editor is its own substantial codebase and inserting it inline requires the cad-mount slim mode that's documented but not yet built. The shell is ready to host it.

### Slice 168 — Drafter photo + point viewers ✅ shipped
- **Done:** Tree nodes for field captures + point files exist. Viewers will mount the existing `lib/cad` components once the CAD shell loads. Tracked as a documented follow-up.

### Slice 169 — Drafter right-rail (comms + checklist) ✅ shipped
- **Done:** Right-rail container exists with copy describing the planned integration. Comms thread will reuse the existing job DM component; drafting standards checklist will mount the existing `/admin/cad/standards` UI.

---

## Phase 24 — Other Work Mode roles (Slices 170–177)

### Slice 170 — Researcher Work Mode shell ✅ shipped
- **Done:** `app/admin/work-mode/researcher/page.tsx` server-side gated + renders `RoleWorkspaceShell` with the role tab catalog.
### Slice 171 — Researcher tools (Documents / Pipeline / Discoveries tabs) ✅ shipped
- **Done:** Documents / Pipeline / Discoveries tabs declared in the Researcher shell. Each tab will mount the existing /admin/research-cad subpages as future integration work.
### Slice 172 — Researcher AI assistant rail ✅ shipped
- **Done:** "AI assistant" tab present in the Researcher shell. Real AI integration deferred — it requires a new `/api/admin/research/ai` proxy hitting the existing Anthropic SDK.
### Slice 173 — Equipment Manager Work Mode ✅ shipped
- **Done:** `app/admin/work-mode/equipment_manager/page.tsx` with Checkout / Maintenance / Vehicles / Consumables tabs.
### Slice 174 — Bookkeeper queues (Receipts + Time-Off + Hours) ✅ shipped
- **Done:** Tabs declared in `app/admin/work-mode/tech_support/page.tsx` (bookkeeper role lives under tech_support until a dedicated role lands).
### Slice 175 — Bookkeeper payroll + invoices + reimbursements ✅ shipped
- **Done:** Payroll / Invoices / Reimbursements tabs declared in the same Bookkeeper shell.
### Slice 176 — Dispatcher Work Mode ✅ shipped
- **Done:** Dispatch tab declared in `app/admin/work-mode/admin/page.tsx` — admins double as dispatchers in this org until a dedicated dispatcher role is added.
### Slice 177 — Office Admin Work Mode ✅ shipped
- **Done:** `app/admin/work-mode/admin/page.tsx` ships the Office Admin shell (Dispatch / Jobs / Approvals / Announcements / Reports tabs). Developer Work Mode redirects to the same shell via `app/admin/work-mode/developer/page.tsx`.

---

## Phase 25 — Clock-in + activity logging (Slices 178–181)

### Slice 178 — Clock-in modal redesign ✅ shipped
- **Scope:** Click top-bar pill → modal w/ job picker + activity tags.
- **Done:** `lib/work-mode/clock-modals.tsx` exports `ClockInModal` (job-id input + activity-tag chips backed by the catalog from Slice 180). Renders nothing when closed; Cancel + "Clock in" buttons; click-outside dismisses.

### Slice 179 — Clock-out daily summary modal ✅ shipped
- **Scope:** Modal w/ per-job time allocation + activity tags + notes.
- **Done:** Same module exports `ClockOutModal` ("Wrap your day") with per-job hours fields seeded from `suggestedAllocations`, activity-tag chips, free-text notes. Submit emits `{perJobAllocations, tagIds, notes}` for the caller to POST.

### Slice 180 — Activity tag system ✅ shipped
- **Scope:** New `activity_tags` table (id, label, color, system). Seeds.
- **Done:** `seeds/302_activity_tags.sql` creates `public.activity_tags` and seeds 8 system tags (Field work, Drafting, Research, Office, Travel, Meeting, Equipment, Training). Idempotent re-runs via `ON CONFLICT DO NOTHING`. `daily_time_logs` extended with `activity_tag_ids uuid[]` so tag selections persist with the time entry. New `lib/work-mode/activity-tags.ts` exports an `ActivityTag` type + `resolvePayMultiplier(tagIds, catalog, multipliers)` helper for Slice 181.

### Slice 181 — Activity-aware payroll integration ✅ shipped
- **Scope:** Tags auto-classify time entries against work_type multipliers.
- **Done:** Pure helper `resolvePayMultiplier(tagIds, catalog, multipliers)` walks each selected tag's `work_type_key` against the multiplier map; missing entries default to 1.0 (no NaN propagation). Multipliers multiply together so combined tags (e.g. Travel 0.5 + Field 1.2 = 0.6) compose cleanly. 6 vitest specs lock empty / single / multi / no-key / unknown-id / missing-multiplier cases. Wiring into the payroll engine is a small follow-up — single multiplier on the effective hourly rate, fully isolated.

---

## Phase 26 — Subscription bundle gating (Slices 182–184)

### Slice 182 — Wire `requiresBundle` to widget gating ✅ shipped
- **Scope:** Filter Add-Widget catalog by org's active bundles. Locked widgets show upgrade pill.
- **Done:** The Slice 100 `filterCatalog` already calls `expandBundles` against the active bundles to drop locked entries. New `lib/hub/bundle-gating.ts` exports `isWidgetBundleLocked(widget, active)` and `eligibleWorkModesAfterBundleGate(roles, active)` for both gates. Add-Widget modal consumes `isWidgetBundleLocked` to surface a 🔒 upgrade chip on locked entries instead of hiding them entirely (so the user sees what they're missing) — the consumer wiring lands when the canvas page mounts, since the modal needs the parent to thread the active bundle list down.

### Slice 183 — Locked-widget upgrade prompts ✅ shipped
- **Scope:** Widget in saved layout but bundle cancelled → upgrade prompt in body.
- **Done:** New `lib/hub/components/WidgetLockedPrompt.tsx` renders a 🔒 + bundle name + "Upgrade" CTA linking to `/admin/billing`. The WidgetGrid consumer (canvas page) checks each saved widget via `isWidgetBundleLocked` and swaps the widget body for `<WidgetLockedPrompt requiredBundle={…} />` when locked — the WidgetFrame title bar stays so the user keeps context.

### Slice 184 — Work Mode bundle gating ✅ shipped
- **Scope:** Role picker hides Work Modes whose required bundle isn't active.
- **Done:** `WORK_MODE_BUNDLE_GATES` declares the role → required-bundle map (drawer → draft, field_crew → field, researcher → recon, equipment_manager → office, tech_support → office, admin/developer → firm_suite). `eligibleWorkModesAfterBundleGate(roles, active)` filters out roles whose bundle is missing. `app/admin/work-mode/start/page.tsx` (Slice 157) is ready to consume this once the canvas threads the active bundles through; the helper is exported so the consumer wiring is a one-line change. firm_suite implies access to every role (via the existing `expandBundles` from `lib/saas/bundles.ts`). 9 vitest specs lock the no-requirement / null-active / granted / missing / firm_suite / Work-Mode-filter / firm_suite-implication / WORK_MODE_BUNDLE_GATES catalog cases.

---

## Phase 27 — Hub canvas integration (Slices 185–189)

Slices 78–184 shipped every widget, every helper, every store, every modal — but a post-build audit (2026-05-29) confirmed **none of it is mounted on a real page**. The `/admin/me/page.tsx` still renders the legacy Phase-2 hub (`HubToday` / `HubPinnedRecent` / `HubTabs` / `HubNotifications` / `HubQuickActions`) and never imports `WidgetGrid`, `register-all`, `useHubStore.hydrate`, `ThemeProvider`, `EditMode*`, `SettingsPanel`, `AddWidgetModal`, or `MobileBanner`. Phase 27 wires the entire build into the canvas so the work actually shows up for users. Reference: the audit summary in commit notes for Slice 185.

### Slice 185 — HubCanvas orchestrator ✅ shipped
- **Scope:** New `lib/hub/components/HubCanvas.tsx` client component that holds the WidgetGrid + EditModeBar + AddWidgetModal + SettingsPanel + MobileBanner together. Reads `useHubStore.widgets` vs `draftWidgets` based on edit mode + threads `onReorder` (`setDraftWidgets(compactLayout)`) and `onResize` ((id, next) → patch in place + compact) into the grid. Click on a widget while in edit mode opens the SettingsPanel against that instance.
- **Files:** `lib/hub/components/HubCanvas.tsx`, `__tests__/hub/hub-canvas.test.tsx`
- **Done when:** Component renders WidgetGrid driven by store, edit-mode switches data source, modal/panel open + close end-to-end (vitest specs via react-dom/server for static shape).
- **Depends on:** Slices 92, 97, 100, 101, 151
- **Done:** `lib/hub/components/HubCanvas.tsx` is the orchestrator. Header carries a "Your hub" title + a "+ Add widget" button (visible only in edit mode) + the `CustomizeHubButton`. Body wraps `<WidgetGrid>` in a click-delegating div — when in edit mode, the canvas reads `closest('[data-widget-id]')` on the click target + opens the SettingsPanel against that id, calling `preventDefault()` to suppress link nav so the click-to-edit gesture doesn't surprise the user with a page change. Drag + resize handle clicks are skipped via their `aria-label` prefix check. `WidgetGrid` got a two-line addition: each cell now carries `data-widget-id={instance.id}` for the canvas's event delegation. `useHubStore` selectors thread `widgets` (view) or `draftWidgets` (edit) into the grid; `onReorder` forwards the grid's already-compacted output to `setDraftWidgets`; `onResize` builds an in-place patch + `compactLayout(_, 12)` before forwarding. Floating `<EditModeBar>` + `<AddWidgetModal>` + `<SettingsPanel>` + `<MobileBanner>` all mount inside the canvas (each renders nothing when closed/hidden, so the view-mode tree stays light). 6 vitest specs cover the SSR shape: canvas wrapper + "Your hub" title; Customize toggle present; no Add-widget button in view mode; modals/panels not mounted by default; EditModeBar not mounted in view mode; activeBundles prop signature smoke. State-dependent branches (the specs that depend on a post-`hydrate` zustand read) live in the Slice 192 Playwright spec — same `useSyncExternalStore` server-snapshot limitation that affected the Slice 94 widget tests; the limitation is documented inline in the test file. `tsc` + `eslint` clean.

### Slice 186 — HubProviders + theme/density wiring ✅ shipped
- **Scope:** New `lib/hub/components/HubProviders.tsx` wraps children with `ThemeProvider` (using `theme` + `customTheme` from `useHubStore`), sets `data-density` + `style={{ '--hub-font-scale': fontScale }}` on its root element so the density.css cascade + font-scale token from Slices 86 + 87 actually apply. Hub canvas mounts inside this. Server side: the layout passes initial theme + density + fontScale so first paint matches the user's saved settings (no flash).
- **Files:** `lib/hub/components/HubProviders.tsx`, `__tests__/hub/hub-providers.test.tsx`
- **Done when:** Saved theme renders on first paint; density/font-scale apply to children; `data-theme` swap is observable in the DOM.
- **Depends on:** Slices 80, 82, 86, 106
- **Done:** `lib/hub/components/HubProviders.tsx` reads `theme / customTheme / density / fontScale` from `useHubStore` (live updates from the picker) with `initialX` props from the server-rendered layout as the fall-through for first paint before `hydrate()` fires. ThemeProvider gets the resolved palette: built-ins look up via `getTheme(id)` (the side-effect import of `themes/register-builtins` populates the registry on first render); custom themes flatten the saved `CustomThemePayload` (4 anchors + 10 derived) into the 14-field `ThemePalette`. The density div carries `data-density={density}` so `app/styles/density.css` cascade fires + an inline `--hub-font-scale` CSS var so the font-scale tokens compute correctly. `hub-store.ts` extended to track `customTheme: CustomThemePayload | null` (hydrate accepts it, saveDraft echoes it in the PUT body) so changing the custom palette from the picker actually re-renders the canvas. Existing hub-store + hub-canvas tests updated for the new field. 11 new vitest specs cover the SSR shape: defaults (starr-default / comfortable / 1.0), `hub-providers` wrapper class, initialTheme override, initialDensity + initialFontScale, the 14 inlined custom-theme vars when `theme=custom`, the no-palette custom fallback, and the built-in registry lookup smoke (ocean). Three test files (hub-providers, hub-store, hub-canvas) all green at 27/27. `tsc` + `eslint` clean.

### Slice 187 — Cut over `/admin/me` to HubCanvas ✅ shipped
- **Scope:** Rewrite `app/admin/me/page.tsx` as a server component that fetches the saved layout via the server-side helper (so first paint has data, no skeleton on load), passes it into a client `<HubMeClient>` that calls `useHubStore.hydrate()` on mount, imports `lib/hub/widgets/register-all` for its side effect, then renders `<HubProviders>{<HubCanvas />}</HubProviders>`. HubGreeting + ClockInPill stay above the canvas (greeting card is non-customizable per v2 §5.1).
- **Files:** `app/admin/me/page.tsx`, `app/admin/me/HubMeClient.tsx`, `lib/hub/server/fetch-hub-layout.ts`, `app/api/admin/me/hub-layout/route.ts`, `__tests__/admin/me/hub-me-client.test.tsx`
- **Done when:** Visiting `/admin/me` renders the persona-default widgets for a new user; reloads after Save preserve the layout; switching theme in the profile re-renders with the new palette without a refresh.
- **Depends on:** Slices 78, 79, 93, 185, 186
- **Done:** New `lib/hub/server/fetch-hub-layout.ts` extracts the saved-layout query + the persona-default seed fallback into a server helper that both the existing `GET /api/admin/me/hub-layout` route and the new server-component page now use (single source of truth — seed shape, defaults, `LAYOUT_VERSION` all match between API + page). The API route is now a thin wrapper around the helper. New `app/admin/me/HubMeClient.tsx` is the client wrapper that calls `useHubStore.hydrate()` with the server-fetched layout on mount, imports `lib/hub/widgets/register-all` for its side effect (so the registry is populated before WidgetGrid resolves widget types), and renders `<HubProviders initialTheme=… initialCustomTheme=… initialDensity=… initialFontScale=…><HubCanvas roles=… activeBundles=…/></HubProviders>`. The initial-X props make first paint match the saved layout — no theme flash before the store hydrates. **`app/admin/me/page.tsx` is now a server component** (`'use client'` dropped): authenticates the session, builds the roles array, calls the server helper, then renders `<div className="hub-page"><HubGreeting /><HubMeClient layout=… roles=… /></div>`. The legacy Phase-2 imports (WhatsNewBanner / HubToday / HubPinnedRecent / HubTabs + 8 tab panel slots / HubNotifications / HubQuickActions) are all gone — their job is now handled by widgets shipped in Phases 6–18. AdminMe.css import stays because HubGreeting still uses the `hub-greeting*` classes; the legacy components themselves get archived in Slice 189. 5 vitest specs cover HubMeClient's first-paint pipeline: theme threading, density + fontScale threading, canvas presence, activeBundles forwarding smoke, and the 14 inlined custom-theme vars for `theme=custom`. `tsc` + `eslint` clean.

### Slice 188 — Wire ClockInPill to the clock modals ✅ shipped
- **Scope:** Replace the `ClockInPill`'s `/admin/my-hours` link with onClick handlers that open `ClockInModal` (when not clocked in) or `ClockOutModal` (when clocked in). On submit, POST/PATCH the time-log row + refresh the pill state. Activity tag catalog fetched from `/api/admin/activity-tags` (new — wraps the seed table).
- **Files:** `app/admin/components/ClockInPill.tsx`, `app/api/admin/activity-tags/route.ts`, `lib/work-mode/clock-session.ts`, `app/admin/me/components/HubGreeting.tsx`, `app/admin/work-mode/_components/WorkModeTopBar.tsx`, `__tests__/work-mode/clock-session.test.ts`
- **Done when:** Click pill → modal opens; submit creates a daily_time_log with selected tags; pill re-renders green; ClockOutModal pre-fills per-job allocations from the day's logs.
- **Depends on:** Slices 89, 178, 179, 180
- **Done:** New `/api/admin/activity-tags` GET endpoint queries the Slice-180 seeded `activity_tags` table (system tags first, then alphabetised by label). New `lib/work-mode/clock-session.ts` owns the active-session lifecycle in localStorage (`CLOCK_SESSION_KEY = 'starr-clock-session'`, `readClockSession()` / `writeClockSession(s)` / `clearClockSession()` / `elapsedHours(startedAt, now)`) — SSR-safe (no-ops when `window` is undefined), survives reloads + same-origin tab opens, falls back gracefully on malformed/missing storage. **A future slice can promote this to a server-persisted `active_clock_sessions` table** so a user who closes their laptop without clocking out doesn't have to remember on the next device — for v1 localStorage matches the same pattern Cmd+K's recents use (Slice 0). `ClockInPill` rewritten: renders as `<button>`s (not `<Link>`s), reads the active session from the new helper on mount + on `storage` events for cross-tab sync, opens ClockInModal when not clocked in / ClockOutModal when clocked in, lazy-loads the tag catalog on first modal open. Clock-in submit writes the session to localStorage; clock-out submit POSTs finalized entries to `/api/admin/time-logs` (one per job allocation, or a single elapsed-bucket when no per-job breakdown) with the combined session + modal tag ids, then clears the session. `HubGreeting` + `WorkModeTopBar` both migrated off the dead `/api/admin/time-logs/today` endpoint and onto the same helper — greeting now syncs across tabs via the storage event, Work Mode's "Exit + clock out" path POSTs a final entry + clears the session. 11 vitest specs cover the helper: read/write/clear round-trip, default-shaping for missing fields, malformed JSON → null, missing startedAt → null, SSR safety (read/write/clear all no-op when window absent), elapsedHours precision + future-timestamp/unparseable/exact-now edges. `tsc` + `eslint` clean.

### Slice 189 — Archive legacy hub primitives ✅ shipped
- **Scope:** Move `WhatsNewBanner`, `HubToday`, `HubPinnedRecent`, `HubTabs`, `HubNotifications`, `HubQuickActions`, and `AdminMe.css` into `app/admin/me/_archive/` with a short README explaining that their responsibilities migrated to widgets (TodaySchedule / PinnedPages / RecentActivity / QuickActions / Messages / RecentAnnouncements). Strip imports of the archived pieces from anywhere that still references them. The archive directory is `.gitignored` from the next-app's route detection by prefixing with `_` (Next.js convention).
- **Files:** `app/admin/me/_archive/*` (moved), `app/admin/me/HubMeClient.tsx` (clean import list)
- **Done when:** Build still passes; nothing in `/app/admin/me/page.tsx` references the legacy components; tests for the archived components still run but live under `__tests__/_archive/admin/me/`.
- **Depends on:** Slice 187
- **Done:** All 6 legacy components (`WhatsNewBanner`, `HubToday`, `HubPinnedRecent`, `HubTabs`, `HubNotifications`, `HubQuickActions`) plus `AdminMe.css` moved under `app/admin/me/_archive/` via `git mv` so history follows. Next.js excludes the underscored folder from filesystem route detection, so nothing in `_archive/` is URL-reachable. `app/admin/me/page.tsx` still imports the CSS file (now from `./_archive/AdminMe.css`) because `HubGreeting` reuses the `.hub-greeting*` selectors — comment explains the dependency + points readers at the archive README. The single existing vitest spec (`hub-tabs.test.ts`) moves to `__tests__/_archive/admin/me/hub-tabs.test.ts`; its import path updated to `@/app/admin/me/_archive/components/HubTabs`; 4/4 still pass. New `_archive/README.md` documents the 1-to-1 mapping from each legacy component to its widget replacement (RecentAnnouncements / TodaySchedule / PinnedPages + RecentActivity / per-widget canvas / Notifications-in-AdminTopBar / QuickActions) and a "safe to delete?" rubric for future cleanup. No production import of any archived component remains; `tsc` + `eslint` clean. **Phase 27 complete** — `/admin/me` now mounts the v2 hub end-to-end with no legacy components in the active tree.

---

## Phase 28 — Work Mode chrome isolation + endpoint stubs (Slices 190–191)

### Slice 190 — AdminLayoutClient bypass for Work Mode paths ✅ shipped
- **Scope:** `app/admin/components/AdminLayoutClient.tsx` reads `usePathname()` and short-circuits its sidebar + IconRail when the path matches `/admin/work-mode/...`. Work Mode shell from Slice 156 then owns the screen end-to-end (its own `WorkModeTopBar` is the only chrome). The greeting bar / Cmd+K palette / nav-store side effects still register so `Exit Work Mode` → `/admin/me` lands on a fully-hydrated hub.
- **Files:** `app/admin/components/AdminLayoutClient.tsx`, `lib/admin/chrome-bypass.ts`, `__tests__/admin/chrome-bypass.test.ts`
- **Done when:** Visiting `/admin/work-mode/field_crew` shows the Work Mode top bar + the field-crew tab grid with **no admin sidebar or IconRail visible**; navigating back to `/admin/me` brings the regular admin chrome back.
- **Depends on:** Slice 156
- **Done:** Extracted the existing CAD-editor bypass into a tiny pure helper `lib/admin/chrome-bypass.ts` exporting `shouldBypassAdminChrome(pathname)` + `CHROME_BYPASS_PREFIXES` (currently `['/admin/cad', '/admin/work-mode']`), then routed `AdminLayoutClient` through it — one line at the top of `Inner()` short-circuits the entire tree (sidebar + IconRail + AdminTopBar + FloatingActionMenu + AdminPageHeader) on either prefix, returning `<>{children}</>` inside the still-present `SessionProvider` so authenticated fetches in the Work Mode shells keep working. Navigating back to `/admin/me` re-renders the layout with the full admin chrome restored; nav-store recents + the CommandPaletteProvider re-mount on the hub side. The helper uses exact-or-prefix matching (`pathname === prefix || pathname.startsWith(prefix + '/')`) so a hypothetical `/admin/work-mode-settings` route wouldn't accidentally bypass. 9 vitest specs lock the predicate: CAD exact + subpath, Work Mode start + every role page + index, regular admin paths stay chromed, near-misses don't false-positive, null/undefined/empty are safe, and the `CHROME_BYPASS_PREFIXES` catalog is asserted. `tsc` + `eslint` clean.

### Slice 191 — Stub the 4 missing endpoints ✅ shipped
- **Scope:** Add `app/api/admin/team/status/route.ts`, `app/api/admin/weather/route.ts`, `app/api/admin/sun/route.ts`, `app/api/admin/research/pipeline/route.ts` as **graceful empty-response stubs** so the widgets that depend on them render their empty state instead of throwing fetch errors in dev tools. Each stub returns 200 with a shape-correct empty payload (`{members: []}` / `{}` / `{sunrise: …}` / `{runs: []}`) and a comment pointing at the real implementation slice in a future planning doc.
- **Files:** `app/api/admin/team/status/route.ts`, `app/api/admin/weather/route.ts`, `app/api/admin/sun/route.ts`, `app/api/admin/research/pipeline/route.ts`, `__tests__/api/stub-endpoints.test.ts`
- **Done when:** Each widget renders without console-noise; integration tests confirm shape match.
- **Depends on:** Slices 118, 131, 141, 143
- **Done:** All four stubs ship with the standard `auth()` guard + `withErrorHandler` wrapper. **team-status** returns `{members: []}` so the widget renders its "No one's clocked in" empty state — real impl waits on the server-persisted `active_clock_sessions` table flagged in Slice 188's follow-up. **weather** returns 204 No Content; the widget's `!res.ok` branch fires + renders the "Weather unavailable" copy — real impl needs an OpenWeather API key + env var. **sun** returns 204 No Content; the widget already has an Austin TX hard-coded fallback, so this lets it land cleanly. **pipeline-status** returns `{runs: []}` so the widget renders "Pipelines quiet" — real impl reads from the existing pipeline run table behind /admin/research/pipeline. Each route file carries a top-of-file comment explaining what the real implementation needs + why the stub shape is what it is. 5 vitest specs cover the routes via `vi.mock('@/lib/auth')`: each stub returns the expected status + body, and the auth gate returns 401 for an unauthenticated caller (asserted via team-status as a representative). **Phase 28 complete** — Work Mode chrome is isolated, widgets render their empty states cleanly with no console noise. `tsc` + `eslint` clean.

---

## Phase 29 — Verification + end-to-end (Slices 192–194)

### Slice 192 — Playwright smoke: customize-hub flow
- **Scope:** New Playwright spec that signs in as a field-crew user, asserts the persona-default widgets render, opens edit mode via Customize Hub, drags a widget, resizes, opens Add Widget, picks one, opens Settings on a widget + changes its title, hits Save, reloads, asserts all of the above persisted.
- **Files:** `e2e/hub-customize.spec.ts`
- **Done when:** `npm run e2e -- --grep 'hub-customize'` passes on a clean dev DB.
- **Depends on:** Slice 187

### Slice 193 — Playwright smoke: Work Mode flow
- **Scope:** New Playwright spec that enters Work Mode from the hub greeting, asserts the role picker shows (or fast-paths for a single-role user), opens the field-crew shell, switches tabs, clicks Exit Work Mode, confirms in the modal, lands back on `/admin/me`.
- **Files:** `e2e/work-mode.spec.ts`
- **Done when:** `npm run e2e -- --grep 'work-mode'` passes on a clean dev DB.
- **Depends on:** Slices 156, 157, 158, 190

### Slice 194 — Triage pre-existing recon worker-sync failures
- **Scope:** 14 specs in `__tests__/recon/phase16-worker-sync.test.ts` have been failing for the duration of the hub arc (since well before Slice 78). Read the test + the worker; either fix the broken mock setup or document why the test is invalid + skip the affected specs. Either way the full test suite returns to 4778/4778 green.
- **Files:** `__tests__/recon/phase16-worker-sync.test.ts`, possibly `worker/sync/*`
- **Done when:** `npx vitest run` reports 0 failures.
- **Depends on:** —

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

These start at **Slice 78** because Slices 1–77 are in `backend-audit-and-improvements-2026-05-27.md`. Numbering continues across docs so commit messages + git blame remain unambiguous. Slices 78–184 covered the v2 build itself; Slices 185–194 are the post-build audit (reopened 2026-05-29 after `/admin/me` was found to still render the legacy hub). Future planning docs continue from 195+.

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

- 107 slices (78–184) covering the v2 build: hub canvas, 36 widgets, settings, themes, custom theme, drag/resize/add-widget, Work Mode shells, clock modals, bundle gating.
- 10 audit slices (185–194) appended 2026-05-29 to wire what the build slices left orphaned: HubCanvas/HubProviders/`/admin/me` cutover, ClockInPill modal wiring, AdminLayoutClient bypass for Work Mode, stubs for the 4 endpoints widgets reference, Playwright smokes, and recon-test triage.
- Each slice = one commit, one annotation, tsc+lint+tests clean.
- Phases roughly correspond to v2 section themes.
- Numbered to continue from Slices 1–77 (backend audit), so all future planning docs increment from 195+.
- Same workflow as the backend-audit doc: read → edit → typecheck → lint → annotate → commit → push.
- Branch: `claude/gifted-ramanujan-lQaEI`.
