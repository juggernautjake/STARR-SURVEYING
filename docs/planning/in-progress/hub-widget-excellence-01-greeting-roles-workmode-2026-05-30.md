# Foundation 01 — Greeting roles-as-pills + Work-Mode role/clock-in prompt

*Part of the Hub Widget Excellence plan (see `…-00-master-…`). Covers
the page-level greeting + Enter-Work-Mode changes the user asked for.*

## User asks (verbatim intent)

> Above/near the role selector, make ALL the user's roles visible on
> the page, below the greeting block, as pill bubbles with different
> background colors and white-or-black text depending on contrast.
> Get rid of the role selector next to the "Enter Work Mode" button.
> Instead, when the user clicks Enter Work Mode they get a prompt
> asking what role they're working under. Entering work mode is not
> the same as clocking in (they might enter work mode without being
> clocked in, or clock in then enter work mode). The prompt also
> alerts them whether they're clocked in — with "Clock in now?" /
> "Stay clocked out" buttons — unless already clocked in, then assume
> they're working.

## Verified current state

- `app/admin/me/components/HubGreeting.tsx` renders the greeting, the
  date, the clock-status line, the Enter-Work-Mode `<a href="/admin/
  work-mode/start">`, and a persona chip strip (lines ~150–198) driven
  by `personaOverride` (`useAdminNavStore`) + `inferPersona(roles)` +
  `PERSONA_ORDER`. Clicking a chip toggles the persona override (a
  preview-the-hub-as-persona affordance) — this is the "role selector"
  to remove from next to the button.
- `.role-chip` / `.role-chip--active` classes are referenced but have
  NO CSS yet (unstyled buttons).
- Roles: `lib/auth.ts` `ALL_ROLES` (11): admin, developer, teacher,
  student, researcher, drawer, field_crew, employee, guest,
  tech_support, equipment_manager. `ROLE_LABELS` gives human labels.
  A user's roles come from `session.user.roles`.
- Work-mode eligible roles: `lib/hub/work-mode-eligibility.ts`
  `WORK_MODE_ROLES` = admin, developer, field_crew, drawer, researcher,
  equipment_manager, tech_support. `isWorkModeEligible(roles)`.
- `/admin/work-mode/start/page.tsx` (server) fast-paths to
  `/admin/work-mode/{role}` for a single eligible role, else renders
  `RolePicker`. No clock-in awareness.
- Clock-in: `lib/work-mode/clock-session.ts`
  (`CLOCK_SESSION_KEY = 'starr-clock-session'`, `readClockSession()`,
  `writeClockSession()`, `clearClockSession()`), surfaced by
  `app/admin/components/ClockInPill.tsx` + `lib/work-mode/clock-modals.tsx`
  (`ClockInModal` writes the session). Clock-in POSTs to
  `/api/admin/time-logs`.

## Design

### Roles-as-pills (below the greeting block)

- New presentational component `RolePills` (in
  `app/admin/me/components/`) that renders EVERY role the user holds
  (`session.user.roles`, de-duped, in a stable order) as a colored
  pill with the `ROLE_LABELS[role]` text.
- A pure `lib/admin/role-colors.ts` maps each `UserRole` → a brand-ish
  background hex + a contrast-chosen foreground (`#000` or `#fff`)
  computed from WCAG relative luminance (the same idea the CAD
  label-background work used). Pure + unit-tested for every role +
  the contrast threshold.
- Replaces the persona chip strip in the greeting's actions area. The
  "preview the hub as a persona" feature is a separate concern; if we
  keep it at all, it moves into Profile/Settings — out of scope here.
  The greeting just SHOWS the roles (read-only pills), matching the
  user's sketch ("all I want from the drawing is the roles listed
  out").

### Enter-Work-Mode prompt

- The Enter-Work-Mode button becomes a client control that opens a
  `WorkModePrompt` modal instead of navigating straight to
  `/admin/work-mode/start`.
- The modal:
  1. **Role step** — lists the user's WORK-MODE-eligible roles
     (`eligibleWorkModeRoles(roles)`) as choices ("What role are you
     working under?"). If only one, pre-selects it but still shows the
     clock-in line. Picking a role advances/enables the confirm.
  2. **Clock-in awareness** — reads `readClockSession()`:
     - **Not clocked in** → shows "You're not clocked in." with two
       actions: **"Clock in now?"** (opens the existing clock-in flow
       / writes the session, then proceeds) and **"Stay clocked out"**
       (proceeds without clocking in).
     - **Already clocked in** → shows "You're clocked in (Nh Mm)." and
       assumes working — no clock-in buttons, just **"Enter Work
       Mode."**
  3. On confirm → navigate to `/admin/work-mode/{role}`.
- Entering work mode and clocking in stay independent: the prompt can
  enter work mode without clocking in, and a person can be clocked in
  without entering work mode (the top-bar pill is unchanged).

## Slices

### Slice 1 — `role-colors.ts` pure helper + spec ✅ shipped 2026-05-30
- **Scope:** New `lib/admin/role-colors.ts`: `roleBackground(role)` +
  `roleForeground(role)` (contrast-chosen via relative luminance) +
  `rolePillColors(role)` returning `{ bg, fg }`. Distinct, readable
  background per role; deterministic.
- **Files:** `lib/admin/role-colors.ts`,
  `__tests__/admin/role-colors.test.ts`.
- **Done when:** every `UserRole` returns a `{bg,fg}` whose contrast
  ratio ≥ 4.5; fg is `#000` or `#fff`; spec covers all 11 roles +
  the contrast math.
- **Shipped:** `role-colors.ts` built on the existing
  `lib/theme/contrast.ts` WCAG helpers (`parseHexColor`,
  `contrastRatio`, `pickForegroundForBackground`, `toHexColor`).
  Distinct on-brand hex per role (deep-blue admin, indigo developer,
  purple teacher, teal student, emerald researcher, amber-brown
  drawer, green field_crew, slate employee, gray guest, sky
  tech_support, red equipment_manager) + a slate fallback for unknown
  roles. Exports `roleBackground` / `roleForeground` / `rolePillColors`
  / `rolePillContrast`. 7 specs green: every role returns a #rrggbb bg,
  a black-or-white fg, clears WCAG AA (≥ 4.5), has a distinct color,
  and the unknown-role fallback also passes. The spec declares the
  role list locally as a typed `readonly UserRole[]` (importing the
  runtime `ALL_ROLES` pulls in next-auth, which fails in vitest — same
  type-only pattern as `work-mode-eligibility.test`). typecheck + lint
  clean.

### Slice 2 — `RolePills` component + render below the greeting ✅ shipped 2026-05-30
- **Scope:** New `RolePills` rendering all of the user's roles as
  colored pills (label = `ROLE_LABELS[role]`). Mount it under the
  greeting block (its own row, matching the sketch). Remove the
  persona chip strip from the greeting's actions area.
- **Files:** `app/admin/me/components/RolePills.tsx`,
  `app/admin/me/components/HubGreeting.tsx`, `app/admin/me/AdminMe.css`
  (pill styles), `__tests__/hub/role-pills.test.tsx` (SSR render: one
  pill per role, label + inline bg/fg present).
- **Done when:** all of a user's roles show as colored pills below the
  greeting; the old persona selector strip is gone from there.
- **Shipped:** `RolePills` de-dupes the session roles (one pill per
  distinct role, stable order) and renders each as a colored pill —
  `ROLE_LABELS[role]` text, inline `background`/`color` from
  `rolePillColors(role)`, `data-role` attr, inside a
  `role="list"` / `aria-label="Your roles"` list with a "Your roles:"
  lead-in (matching the sketch). Returns nothing when the user has no
  roles. `HubGreeting` dropped the entire persona-chip strip (and its
  `personaOverride`/`useAdminNavStore`/`inferPersona`/`PERSONA_ORDER`
  imports + state) and now renders `<RolePills roles={roles} />` on its
  own full-width row below the greeting/actions; the persona-override
  store itself is left intact (still drives the nav `IconRail`). CSS:
  `.hub-greeting__role-pills` (full-width wrapping row),
  `-label`, `-list` (unstyled `ul`), `-pill` (9999px pill, inline
  bg/fg, subtle shadow). 6 specs green — they mock `@/lib/auth` for
  `ROLE_LABELS` (the real module pulls next-auth, which fails in
  vitest) and SSR-render the component to assert one labeled pill per
  role with inline bg/fg, de-dupe, the role-list a11y semantics, and
  the empty-roles → null case. typecheck + lint clean. (Added an
  explicit `import React` to `RolePills.tsx` so the classic JSX runtime
  vitest uses resolves `React.createElement`, matching `WidgetFrame`.)

### Slice 3 — `WorkModePrompt` modal: role step ✅ shipped 2026-05-30
- **Scope:** New `WorkModePrompt` client modal. The Enter-Work-Mode
  control opens it. Role step lists `eligibleWorkModeRoles(roles)`;
  selecting one enables confirm; single-role pre-selects. Confirm
  navigates to `/admin/work-mode/{role}`.
- **Files:** `app/admin/me/components/WorkModePrompt.tsx`,
  `HubGreeting.tsx` (swap the `<a>` for the trigger),
  `__tests__/hub/work-mode-prompt-role.test.tsx`.
- **Done when:** clicking Enter Work Mode opens the prompt; picking a
  role + confirming routes to that role's workspace.
- **Shipped:** `WorkModePrompt` is now the greeting CTA — a `<button>`
  (reusing the green `hub-greeting__work-mode-btn` classes, with a
  native-button reset added to the CSS) that opens a themed modal
  instead of the old `<a href="/admin/work-mode/start">`. EVERY
  eligible user sees the prompt (no single-role fast-path bypass),
  because Slice 4 hangs the clock-in step off the same modal. The role
  step is factored into a pure, exported `WorkModeRoleStep` (heading
  "What role are you working under?", one `aria-pressed` button per
  `eligibleWorkModeRoles(roles)` with label + blurb, a disabled-until-
  selected confirm) so it renders + asserts under SSR without driving
  open/close state. Two exported pure helpers: `workModeHref(role)` →
  `/admin/work-mode/{role}` and `preselectRole(eligible)` (single role
  pre-selected, else null → explicit choice). Confirm does
  `router.push(workModeHref(selectedRole))` (Slice 4 will splice the
  clock-in branch in just before the push). Esc + overlay-click close
  and return focus to the trigger. New `.work-mode-prompt__*` CSS
  (overlay, modal, role cards with an active ring, pill actions) added
  to `AdminMe.css`. 10 specs green (mock `@/lib/auth` + `next/
  navigation`): href map, preselect rule, the rendered choices +
  selected/disabled states, and that the trigger renders with no dialog
  until opened. typecheck + lint clean; the existing greeting CSS
  contract test still passes.

### Slice 4 — Clock-in awareness in the prompt
- **Scope:** The prompt reads `readClockSession()`. Not clocked in →
  "Clock in now?" / "Stay clocked out". Already clocked in → assume
  working (show elapsed, single Enter button). "Clock in now?" routes
  through the existing clock-in flow (reuse `ClockInModal` /
  `writeClockSession`) then proceeds; "Stay clocked out" proceeds.
- **Files:** `WorkModePrompt.tsx`, possibly small exports from
  `lib/work-mode/clock-modals.tsx`,
  `__tests__/hub/work-mode-prompt-clockin.test.tsx`.
- **Done when:** the prompt's clock-in branch matches the spec;
  entering work mode never force-clocks-in; already-clocked-in users
  skip the clock-in buttons.

### Slice 5 — Audit + cleanup
- **Scope:** Remove now-dead persona-selector code paths from the
  greeting if fully unused (keep `inferPersona` etc. if still used
  elsewhere — verify). Confirm the top-bar `ClockInPill` still works
  independently. a11y pass on pills (role list semantics) + the modal
  (focus trap, Esc, labelledby). Update `e2e/hub-customize.spec.ts`
  selectors only if they touched the greeting.
- **Done when:** no dead code; pills + prompt are accessible; tree
  green. Then this doc moves to `completed/`.

## Guardrails
- Don't break the independent top-bar clock-in pill.
- `roleBackground` colors should be distinguishable but on-brand;
  prefer the existing theme/brand palette where it maps cleanly.
- If `inferPersona`/persona-override is used by the nav rail elsewhere,
  leave that intact — only remove the chip STRIP from the greeting.
