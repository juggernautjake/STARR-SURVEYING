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
- **Contact buttons** (refined 2026-06-16 per user clarification):
  - **Direct Message** opens the existing **bottom-right messenger
    widget** with the selected user **preloaded as the recipient**.
    No navigation. Slice **E9** wires whatever opens the widget
    today (likely a top-level provider or a global event) + injects
    the recipient.
  - **Email** routes to the existing **email interface page**
    (the on-app email surface, not `mailto:`). Slice **E9**
    locates that route + adds a `?to=<email>` prefill query param.
    The email page must **preload the employee as recipient** so
    the compose form opens with `To:` already populated — no
    re-typing — when the user clicks Email from the pond.
    Continuity carries through if they switch composers (web
    page ↔ widget ↔ dedicated messages page) — the recipient
    travels with them per E9b's shared store.
- **Recipient continuity** (added 2026-06-16 per user clarification):
  When the bottom-right messenger has a recipient loaded AND the
  user navigates to the dedicated `/admin/messages` page, the page
  must open with the same recipient still selected. Slice **E9b**
  ships this: the messenger's recipient state lives in a shared
  store (localStorage or a top-level provider) so both surfaces
  read from the same key. Conversely, going from the dedicated
  page back to the small messenger keeps the same recipient. A
  single source of truth in either direction.
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
| Physics loop (gravity + repulsion + damping + bounds) | **✅ E3** |

**E3 shipped 2026-06-16** — pond physics loop.
- `lib/employee-pond/physics.ts` — pure `stepPhysics(orbs, opts)`
  that mutates the orb array in place for performance. Forces
  applied per frame in order: gravity toward center, pairwise
  repulsion when overlapping (O(n²), <1250 checks at n=50),
  semi-implicit Euler integration, pond-wall bounce with energy
  retention (`bounceRestitution = 0.55`), exponential damping
  (`Math.pow(damping, dt)` so the per-frame factor is correct
  regardless of dt). `DEFAULT_PHYSICS` constants exported so the
  hook and the test share one source of truth.
  `totalKineticEnergy` helper for "is the pond settled?" checks.
  The `dragging` flag on `OrbState` short-circuits every force
  except the repulsion it inflicts on neighbors — E6 will flip
  it during drag.
- `app/admin/employees/useEmployeePondPhysics.ts` — rAF hook
  owning the loop. Caps `dt` at 33 ms so a tab-switch catch-up
  frame can't explode the simulation. Battery-saving guard: the
  loop is skipped entirely when `enabled === false`. Orb pool
  syncs to `visibleIds` on change (existing orbs keep their
  position + velocity; new orbs spawn at a randomized point via
  `placeOrb`; vanished orbs drop out). Every frame writes
  `transform = translate3d(calc(<x>px - 50%), calc(<y>px - 50%),
  0)` directly to the DOM elements via the refs Map — no React
  re-render per frame. Returns a `PondPhysicsHandle` with
  `setOrb` + `setDragging` so E6 (drag) can imperatively patch
  positions.
- `app/admin/employees/EmployeePond.tsx` — imports the hook,
  declares `ORB_RADIUS_PX = 32` and `POND_RADIUS_PX = 280`
  constants, holds an `orbRefsRef` (Map<id, HTMLElement>) +
  a stable `setOrbRef(id)` callback ref. Each orb element
  attaches the ref + drops the previous inline static
  transform; physics owns position now. `data-orb-count`
  reflects `visibleEmployees.length` for diagnostic tooling.
- Source-locked by `__tests__/employee-pond/e3-physics.test.ts`
  (22 assertions: gravity restoration, dragging-suppresses-
  gravity, dt-≤-0 no-op, repulsion sign per orb, dragger-pushes-
  but-isn't-pushed, wall clamp, normal reflection, damping
  reduces velocity, kinetic energy decay; hook contract for
  rAF lifecycle + dt cap + disabled guard + visibleIds sync +
  setOrb/setDragging handle + imperative transform write;
  page wiring for hook import + refs map + setOrbRef + hook
  call args + ref attachment + static-transform-dropped).
- The E2 test that locked the pre-physics layout shape was
  widened to the new render path (`visibleEmployees.map((employee)
  => ...`).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warning, full suite 8678 green
  (+22).
| Hover scale + neighbor bump + tooltip | **✅ E4** |

**E4 shipped 2026-06-16** — hover scale + neighbor bump + tooltip.
- `lib/employee-pond/physics.ts`:
  - `OrbState.scale?: number` added (default 1.0). Physics step
    doesn't read it; it's a transform-write field consumed by
    the hook.
- `app/admin/employees/useEmployeePondPhysics.ts`:
  - Transform write appends `scale(<scale>)` so the hover bump
    is visually applied without React re-renders.
  - `setOrb` accepts `radius` + `scale` patches so the hover
    hook can change both atomically.
- `app/admin/employees/EmployeePond.tsx`:
  - `hoveredEmployeeId` state + `prevHoveredRef` to know which
    orb to reset.
  - `HOVER_SCALE = 1.18` + `HOVER_RADIUS = ORB_RADIUS_PX *
    HOVER_SCALE` constants.
  - `useEffect` on `hoveredEmployeeId` change resets the prior
    orb to `{ scale: 1, radius: ORB_RADIUS_PX }` and bumps the
    new one to `{ scale: HOVER_SCALE, radius: HOVER_RADIUS }`.
    The existing pairwise repulsion in the physics step
    naturally pushes neighbors away from the now-larger orb;
    when the radius shrinks, gravity pulls them back to
    center → the "expanding and shrinking should bump
    neighbors" requirement is satisfied without any new
    physics code.
  - Orb element: `data-hovered` mirror; `onPointerEnter` /
    `onPointerLeave` (excludes touch input via `pointerType`
    check so a finger swipe doesn't trigger the bump);
    `onFocus` / `onBlur` so keyboard users get the same path.
  - Orb markup restructured: avatar/initials now inside an
    `.employee-pond__orb-clip` wrapper that owns
    `overflow: hidden`; the outer orb becomes
    `overflow: visible` so the tooltip can escape.
  - Tooltip: `<div role="tooltip">` with name + email,
    `aria-hidden` mirrors hover state, stable testID.
- `app/admin/styles/EmployeePond.css`:
  - Orb overflow flipped to visible; new `.orb-clip` owns the
    circular clipping.
  - `data-hovered` orb gets a brand-navy-tinted shadow + z-index
    bump.
  - Tooltip styled as a small dark pill below the orb with an
    upward-pointing caret, fade-in transition, hover-controlled
    opacity. `prefers-reduced-motion` collapses to 1 ms.
- Source-locked by `__tests__/employee-pond/e4-hover-tooltip.test.ts`
  (17 assertions: physics bumps neighbors harder when radius
  grows; hook transform write includes scale; setOrb radius +
  scale patches; component state + constants + hover-change
  effect; pointer / focus listeners with touch-excluded
  semantics; orb markup restructure incl. clip + tooltip; CSS
  overflow flip + clip overflow + data-hovered shadow + tooltip
  fade + arrow caret + reduced-motion + no-drift token check).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8719 green
  (+17).
| Click → side dialogue panel anchored to orb | **✅ E5** |

**E5 shipped 2026-06-16** — click → side dialogue.
- `lib/employee-pond/dialogue-anchor.ts`:
  - `anchorDialogue(input)` decides position + origin corner.
    Strategy: orb in left half → dialogue to the right; orb in
    right half → dialogue to the left. Same for top/bottom. The
    origin corner is the corner of the dialogue pointing at the
    orb so the expand animation grows out of that point.
  - `yearsWithCompany(hireDateIso, now?)` returns a one-decimal
    seniority number; null when the hire date isn't parseable;
    0 when hire date is in the future.
- `app/admin/employees/EmployeePond.tsx`:
  - State: `selectedEmployee`, `dialoguePosition` (left/top/origin).
  - `handleOrbClick(employee)` reads the orb's CURRENT physics
    position from `physics.orbs` so the panel anchors to where
    the orb actually is at click time (not its CSS-static origin).
  - Esc dismisses via a document keydown listener active only
    while the dialogue is open.
  - Orb element: `onClick` + `onKeyDown` (Enter / Space) opens
    the dialogue; `data-selected` mirrors `selectedEmployee?.id`
    for the brand-navy outline ring.
  - Dialogue render block: transparent backdrop catches outside
    clicks (`onClick={closeDialogue}`); panel itself stops
    propagation. Panel shows avatar/initials, name, email, then
    `<dl>` rows for Roles, Job title, Years with company, DOB ·
    Age · Gender (— placeholder), Employment type (—). Open
    profile link routes to `/admin/employees/manage?email=<…>`.
    Email + Direct Message buttons rendered with stable
    `data-action="contact-email"` / `"contact-dm"` so E9 can wire
    them without touching the markup.
- `app/admin/styles/EmployeePond.css`:
  - `.employee-pond__dialogue-backdrop` (inset:-200vw to catch
    clicks anywhere outside the panel), `.employee-pond__dialogue`
    (280×360, brand-navy primary button, soft drop shadow,
    pop-in fade keyframes), avatar 48 px with white border,
    field rows in a stacked `<dl>` grid, action footer with
    Open profile link + two contact buttons. Selected orb gets a
    3 px brand-navy outline ring. `prefers-reduced-motion`
    disables the pop animation.
- Source-locked by `__tests__/employee-pond/e5-dialogue.test.ts`
  (24 assertions: anchor in all four quadrants + center, gap
  respected; yearsWithCompany null/future/3.5y; page state +
  click reads physics position + orb onClick/onKeyDown +
  data-selected mirror + Esc dismiss + backdrop + every
  field-row label + open-profile route + two contact buttons +
  click-outside-vs-stopPropagation contract; CSS surface +
  primary brand-navy button + selected-orb ring + reduced-motion
  + no-drift token check).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings (one new for the
  dialogue avatar), full suite 8702 green (+24).
| Drag interaction (pointer down/move/up) | **E6** |
| Particle FX on collision during drag | **E7** |
| Shake-to-release detection + settle animation | **E7** |
| Below-pond list of currently-visible employees | **E8** |
| Email + Direct Message contact buttons (incl. `?to=` on inbox) | **E9** |
| Recipient continuity: widget ↔ dedicated /admin/messages page | **E9b** |
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
