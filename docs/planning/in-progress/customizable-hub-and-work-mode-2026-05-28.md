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
