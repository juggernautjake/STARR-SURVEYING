# Employee pond view — 2026-06-16

> **Goal.** A second, more playful viewer at `/admin/employees` that the
> user can toggle to from the existing list. Big "pond" circle containing
> floating orbs (one per employee, profile picture as the orb). Search
> + role filter narrow the visible set; click an orb to open a side-
> dialogue with the employee's vital info + two contact actions (email,
> direct message). Drag an orb around to bump others with particle FX;
> shake-to-release returns the orbs to a settled gravitational center.
>
> **Constraint.** The existing `/admin/employees` list stays untouched.
> The pond is the *alternative*; users land on the list by default and
> toggle to the pond explicitly. The toggle preference persists in
> `localStorage` so the choice survives a refresh.

## Decisions locked from the spec

- **Where the toggle lives**: in-page on `/admin/employees`. A two-button
  segmented control above the search/filter row. No new route.
- **Search semantics**: name + email only. Role search is the filter
  dropdown's job; multi-select supported.
- **Hover**: enlarge the orb ~1.2×, neighbors get nudged by the collision
  engine, tooltip with name + email appears.
- **Click**: opens a side dialogue anchored to the orb position.
- **Drag**: click + hold to grab an orb; mouse motion drags the orb;
  the orb collides with neighbors during drag with particle FX.
- **Shake-to-release**: ≥3 horizontal velocity reversals within 200 ms
  while dragging → release the orb with the last velocity vector;
  surrounding orbs jitter; pond resettles toward center.
- **Missing DB fields** (DOB / age / gender / FT-PT): show "—". Tracked
  as **E11** for a follow-up schema slice.
- **Contact buttons**: Email opens `mailto:<address>`; Direct Message
  opens `/admin/messages?to=<email>` (requires the existing inbox to
  honor the query param — slice **E9** ships both halves).
- **Initial layout**: random each mount. Stable id-based hash seeds the
  starting positions only so React strict-mode double-render doesn't
  rearrange the pond before first paint.

## Architecture

- **DOM-based physics**, not canvas. ~30–50 orbs at 60 fps via CSS
  transforms is well within budget on a phone GPU; staying in the DOM
  keeps every orb addressable for tests + accessibility (a screen-
  reader sees an `<img alt>` per orb, not a canvas blob).
- **`requestAnimationFrame` loop** owned by a single hook
  (`usePondPhysics`). The loop reads + writes positions held in a
  React `useRef` to avoid re-rendering 50 nodes every frame; per-orb
  React state is limited to selection / hover / drag-in-progress.
- **Forces per frame**:
  1. Gravity toward `(centerX, centerY)` proportional to distance
     so far orbs accelerate harder.
  2. Pairwise repulsion: O(n²) but with n ≤ 50 that's ~1,250 checks
     per frame, ~75k checks/sec — negligible.
  3. Velocity damping so the pond settles when the user lets go.
  4. Bounds collision against the pond's inner radius.
- **Search + filter** drive `visibleEmployeeIds: Set<string>`. The
  physics loop integrates over the FULL universe but only renders +
  applies repulsion among visible orbs. Invisible orbs are removed
  from DOM with a `scale 1 → 0 + opacity 1 → 0` 180 ms transition
  ("blip out"). Returning orbs blip back in with `scale 0 → 1`.
- **Particle FX on collision**: a small particle pool (max 64 active)
  spawns 4–8 sparkles per significant collision. Each particle is a
  positioned `<span>` with its own short rAF loop; pool is recycled.
  Disabled under `prefers-reduced-motion`.
- **Shake detection**: track pointer velocity (last 8 samples ≈ 130 ms).
  Count horizontal sign reversals; ≥3 in the window triggers release.

## What this plan ships

**E1 shipped 2026-06-16** — view toggle + pond skeleton.
- `app/admin/employees/EmployeePond.tsx` — `PondEmployee` interface,
  `buildPondSeed`, `mulberry32`, `placeOrb` helpers (uniform-disc
  sampling so orbs don't crowd the edge). Renders the pond surface,
  the disabled toolbar slots (E2 wires them), each employee as a
  positioned `.employee-pond__orb`, and the below-pond list stub
  (E8 makes it dynamic). Avatar fallback to two-letter initials.
- `app/admin/styles/EmployeePond.css` — `.employee-pond` layout,
  the radial-gradient pond circle with subtle inset shadow, 64 px
  orb circles with white border + drop shadow, the view-toggle
  segmented control matching the calendar's shape. Phone breakpoint
  shrinks orb to 56 px and the pond to 160 px radius so portrait
  iPhone fits.
- `app/admin/employees/page.tsx` — `VIEW_PREF_KEY` + `EmployeeView`
  + `readSavedView()` localStorage helper. New `view` state hydrated
  from storage in `useEffect`; `setViewAndPersist` writes both
  state + storage. Two-button toggle in the page header
  (`data-testid="employees-view-toggle"` with
  `data-action="view-list"` / `data-action="view-pond"`). When
  `view === 'pond'`, the rest of the page is replaced by
  `<EmployeePond employees={…} />`; list view otherwise.
- Source-locked by `__tests__/employee-pond/e1-skeleton.test.ts`
  (24 assertions: seed stability + emptiness, PRNG determinism +
  range, uniform-disc placement + quadrant balance, component
  testIDs + initials fallback + toolbar slots, page wiring
  (localStorage key, SSR-safe hydration, toggle data-attrs,
  conditional render), CSS contract + no-drift token check).
- **Three post-build checks: green** — typecheck clean, lint had
  only non-blocking `<img>` warnings (one pre-existing on the
  list view), full suite 8632 green (+24).

| Piece | Slice |
|---|---|
| `/admin/employees` view toggle (List / Pond) + localStorage persist | **✅ E1** |
| Pond skeleton (data fetch, layout, no physics yet) | **✅ E1** |
| Search bar (name + email) | **✅ E2** |
| Role filter dropdown (multi-select) | **✅ E2** |

**E2 shipped 2026-06-16** — search + role filter.
- `app/admin/employees/EmployeePond.tsx`:
  - `EmployeeFilter` interface + `matchesEmployee` predicate
    (case-insensitive substring on name OR email; role match is OR
    over the selected Set; empty filter passes everyone). Search
    deliberately does NOT match against the roles array — that's
    the dropdown's job.
  - `filterEmployees` walks the list once.
  - `FILTER_ROLES` + `ROLE_FILTER_LABELS` map the 11 known roles.
  - State: `query`, `selectedRoles: ReadonlySet<UserRole>`,
    `filterOpen`. `useEffect` listens for mousedown outside the
    panel + Esc to dismiss.
  - `visibleEmployees = filterEmployees(employees, { query,
    selectedRoles })`; both the orb layout AND the below-pond list
    are now derived from this so search/filter immediately blip
    orbs in/out.
  - Toolbar: enabled search input controlled by `query`, filter
    button showing `Filter by role (N)` when N > 0, multi-select
    panel with one checkbox per role (each `data-testid=
    "employee-pond-filter-<role>"`), Clear filters button that
    resets both query + selectedRoles, live count chip
    (`Showing X of Y`).
  - Below-pond list now shows an explicit empty state when nothing
    matches.
- `app/admin/styles/EmployeePond.css`:
  - Filter dropdown panel (positioned absolute with brand-navy
    accent on the open state, 140 ms pop-in keyframes).
  - Checkbox uses `accent-color: var(--color-brand-navy)`.
  - Clear-filters button turns `--color-error` on hover so the
    destructive intent telegraphs.
  - Count chip + empty-state row.
- Source-locked by `__tests__/employee-pond/e2-search-filter.test.ts`
  (24 assertions: predicate per branch incl. trim, name vs email,
  role-non-match, role-OR semantics, search-AND-role compose;
  list helper order + empty; page state + enabled search +
  conditional panel + per-role testIDs + clear behavior + filter
  count label + click-outside/Esc; CSS panel + checkbox accent +
  destructive hover + count chip + empty-list + no-drift check).
- **Three post-build checks: green** — typecheck clean, lint only
  the pre-existing `<img>` warning, full suite 8656 green (+24).
| Physics loop (gravity + repulsion + damping + bounds) | **E3** |
| Hover scale + neighbor bump + tooltip | **E4** |
| Click → side dialogue panel anchored to orb | **E5** |
| Drag interaction (pointer down/move/up) | **E6** |
| Particle FX on collision during drag | **E7** |
| Shake-to-release detection + settle animation | **E7** |
| Below-pond list of currently-visible employees | **E8** |
| Email + Direct Message contact buttons (incl. `?to=` on inbox) | **E9** |
| `prefers-reduced-motion` + accessibility audit | **E10** |
| Three post-build checks per slice (`tsc --noEmit`, `eslint`, `vitest`) | every slice |
| Optional follow-up: DOB / gender / FT-PT schema columns | **E11** |

## Three post-build checks (per slice)

Per the user's explicit ask:
1. **Typecheck** — `npx tsc --noEmit` from the repo root. No errors.
2. **Lint** — `npx eslint` on every file the slice touched. No errors.
3. **Test** — `npx vitest run` (full suite). New source-lock assertions
   for the slice land in `__tests__/employee-pond/`.

A slice doesn't ship until all three are green.

## Slice order (recommended)

E1 → E2 → E3 → E5 → E4 → E6 → E7 → E8 → E9 → E10 → (E11 optional)

Risk-ordered:
- E1 / E2 are pure data + UI (no physics) so they're the safest start.
- E3 (physics) is the highest-risk slice in the plan; ship it early
  while the surface is small.
- E5 (dialogue) before E4 (hover) so the click path lands first; hover
  is polish on top.
- E6 + E7 share a lot of state (the active drag pointer) so they ship
  back-to-back.
- E8 is small + valuable on its own.
- E9 closes the contact loop.
- E10 is the QA sweep.

## TL;DR

| Surface | Status |
|---|---|
| Existing `/admin/employees` list | **DONE** (pre-existing) |
| `/api/admin/employees/list` endpoint | **DONE** (pre-existing) |
| View toggle + pond skeleton | **MISSING → E1** |
| Search + role filter | **MISSING → E2** |
| Pond physics + collisions + bounds | **MISSING → E3** |
| Dialogue panel anchored to orb | **MISSING → E5** |
| Hover scale + tooltip | **MISSING → E4** |
| Drag interaction | **MISSING → E6** |
| Particle FX + shake-to-release | **MISSING → E7** |
| Below-pond list | **MISSING → E8** |
| Email + DM contact buttons | **MISSING → E9** |
| Reduced-motion + a11y audit | **MISSING → E10** |
| DOB / gender / FT-PT schema | **DEFERRED → E11** (one-line rationale: data isn't in scope for the visual feature; the dialogue shows "—" until the column add lands) |
