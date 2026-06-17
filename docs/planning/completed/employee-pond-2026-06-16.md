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
| Drag interaction (pointer down/move/up) | **✅ E6** |
| Hockey-table feel + selected-puck visual focus | **✅ E6b** |

**E6b shipped 2026-06-16** — dynamic/organic feel + selection focus.
- `lib/employee-pond/physics.ts`:
  - `DEFAULT_PHYSICS` retuned: `gravity 1.4 → 0.8`, `damping 0.45
    → 0.85` (so velocities decay gently rather than snapping
    to zero), `idleJitter: 24` and `cursorAttraction: 4000` added.
  - `PhysicsOptions` extended with `idleJitter`,
    `cursor: { x; y } | null`, `cursorAttraction`.
  - `stepPhysics` now applies three additional forces (skipped
    for dragging orbs):
    1. Cursor attraction — pull toward the active cursor with
       force `strength / (dist + 50)` so close orbs don't get
       a runaway tug.
    2. Idle jitter — small `(rand-0.5) * 2 * idleJitter * dt`
       per axis so the pond never stops.
- `app/admin/employees/useEmployeePondPhysics.ts`:
  - Internal `cursorRef` holds the current pond-relative cursor.
  - Loop hands `cursorRef.current` to `stepPhysics` every frame.
  - Handle gains `setCursor(cursor: {x;y} | null)`.
- `app/admin/employees/EmployeePond.tsx`:
  - `SELECTION_SCALE` + `SELECTION_RADIUS` constants (same
    magnitudes as hover bump) + `prevSelectedRef` so the
    effect knows which orb to reset on change.
  - New useEffect on `selectedEmployee`: on change, resets the
    previous selected orb and bumps the new one — the orb
    stays enlarged as long as the dialogue is open.
  - Hover useEffect early-returns when a dialogue is open so
    the two effects don't fight; hover tooltip + state still
    track normally for other interactions.
  - Pond surface gets `data-selection-active="true"` when a
    dialogue is open; `onPointerMove` (mouse/pen only) feeds
    pond-relative cursor into `physics.setCursor`;
    `onPointerLeave` clears it.
- `app/admin/styles/EmployeePond.css`:
  - `.employee-pond__pond[data-selection-active='true']
    .employee-pond__orb:not([data-selected='true'])` fades to
    `opacity: 0.32`.
  - The selected orb stays `opacity: 1` + `z-index: 5` so it
    sits above the dimmed crowd.
  - Orb gets an `opacity 200ms ease` transition so the dim is
    smooth; reduced-motion disables it.
- E3 source-locks that assumed zero idle jitter were updated to
  opt out via `idleJitter: 0` explicitly so the deterministic
  pure-gravity / non-overlap assertions still hold.
- Source-locked by `__tests__/employee-pond/e6b-feel-selection.test.ts`
  (22 assertions: DEFAULT_PHYSICS tuned constants; cursor
  attraction force direction + null no-op + drag-skip; idle
  jitter non-zero produces motion + zero leaves still; hook
  cursorRef + every-frame handoff + setCursor handle; page
  selection constants + prevRef + selection effect bumping +
  hover-suppression; pond data-selection-active + cursor
  handlers + touch-input skip; CSS dim rule + selected-orb
  opacity-1-z-5 + transition + reduced-motion).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8762 green
  (+22).

**E6 shipped 2026-06-16** — drag interaction.
- `lib/employee-pond/drag.ts`:
  - `pointerToPondCoords` translates window-space pointer to
    pond-center frame; pure, deterministic.
  - `MotionSample` + `computeReleaseVelocity` computes a flick
    velocity from the first + last samples; zero when fewer than
    two samples or zero elapsed time.
  - `DRAG_THRESHOLD_PX = 5` + `exceedsDragThreshold(dx, dy)`
    so the click vs drag disambiguation happens once, in one
    place.
  - `MOTION_BUFFER_LIMIT = 8` keeps the recent-motion buffer
    bounded.
- `app/admin/employees/EmployeePond.tsx`:
  - Drag refs: `pondElRef` (so handlers can read the bounding
    rect), `draggingIdRef`, `dragStartRef`, `dragMotionRef`,
    `motionSamplesRef`, `suppressNextClickRef`.
  - `handleOrbPointerDown` captures the pointer + records the
    drag origin from the orb's CURRENT physics position. Doesn't
    flip `physics.dragging` yet — that waits until motion
    crosses the threshold so a quick tap still opens the
    dialogue.
  - `handleOrbPointerMove` checks the threshold once; on crossing,
    calls `physics.setDragging(id, true)`, marks
    `suppressNextClickRef = true`, then on every move converts
    pointer → pond coords and writes both the new position AND
    a fresh motion sample to the buffer (`shift()`-trimmed at
    `MOTION_BUFFER_LIMIT`).
  - `handleOrbPointerUp` computes the release velocity from the
    motion buffer, applies it via `physics.setOrb`, clears the
    dragging flag. Drag state reset on every release.
  - `handleOrbPointerCancel` ends the drag gracefully (no
    release velocity) when the OS reclaims the pointer.
  - Orb `onClick` checks `suppressNextClickRef` before opening
    the dialogue so a drag-then-release doesn't accidentally
    select.
- `app/admin/styles/EmployeePond.css`:
  - Orb `cursor: grab` (resting) and `cursor: grabbing` on
    `:active` so the gesture telegraphs.
  - `touch-action: none` on the orb so a finger drag doesn't
    scroll the page.
- Source-locked by `__tests__/employee-pond/e6-drag.test.ts`
  (21 assertions: pointer translation in three directions,
  threshold disc inside/outside, threshold constant, release
  velocity with three buffer shapes, MOTION_BUFFER_LIMIT
  constant; page wiring incl. import, every ref, pointerdown
  capture + physics.orbs read, pointermove threshold +
  setDragging + pond-relative track + buffer trim, pointerup
  release-vel + clear, pointercancel guard, click suppression,
  every handler attached; CSS cursor states + touch-action).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8740 green
  (+21).
- The E5 source-lock that pinned the inline `onClick={() =>
  handleOrbClick(employee)}` was widened to match the new
  wrapped-with-suppression-guard pattern.
| Particle FX on collision during drag | **✅ E7** |
| Shake-to-release detection + settle animation | **✅ E7** |

**E7 shipped 2026-06-16** — particle FX + shake-to-release + kick.
- `lib/employee-pond/drag.ts`:
  - `SHAKE_MIN_REVERSALS = 3`, `SHAKE_WINDOW_MS = 400` constants.
  - `detectShake(samples)` — pure helper that returns true when
    the horizontal direction reversed `SHAKE_MIN_REVERSALS`
    times inside `SHAKE_WINDOW_MS`. False when buffer too short,
    when motion stays one direction, or when the window is too
    wide (a slow swerve isn't a shake).
- `lib/employee-pond/physics.ts`:
  - `PhysicsOptions.onDraggedCollision?` callback added.
  - `stepPhysics` fires it inside the repulsion pass whenever
    overlap involves a dragging orb; argument is the contact
    midpoint + the current `force` magnitude so the React side
    can scale particle count.
- `app/admin/employees/useEmployeePondPhysics.ts`:
  - `collisionCbRef` holds the latest callback; loop reads
    `.current` so a React-side identity change doesn't re-bind
    the rAF. Forwarded into `stepPhysics` every frame.
- `app/admin/employees/EmployeePond.tsx`:
  - `Particle` interface, `MAX_ACTIVE_PARTICLES = 64`, particle
    state + `particleSeqRef` counter.
  - `spawnParticles(x, y, count)` mints 3–7 particles at a
    point (more for harder collisions); pool is capped via
    `slice(next.length - MAX_ACTIVE_PARTICLES)` so a long drag
    can't drown the page.
  - `removeParticle(id)` retires a particle when its CSS
    animation ends.
  - `handleDraggedCollision(e)` — throttles to once per ≥40 ms
    so a deep overlap firing every step doesn't drown the pond;
    forwarded into the physics hook via a `ref` (the callback
    is defined AFTER the hook call because it depends on
    `physics`).
  - `kickNeighbors(originX, originY, range, strength)` walks
    `physics.orbs` and patches velocities outward with
    distance fall-off + a small random jitter.
  - `handleOrbPointerDown` resets `shakeReleasedRef`.
  - `handleOrbPointerMove` calls `detectShake(samples)` after
    sampling. On a positive hit:
    - assigns a random release velocity 600–1000 px/s,
    - flips `physics.setDragging(id, false)`,
    - spawns 12 particles at the release point,
    - `kickNeighbors(pond.x, pond.y, 140, 220)` so surrounding
      orbs bounce outward and the pond visibly reacts.
  - `handleOrbPointerUp` skips the normal release-velocity
    logic when `shakeReleasedRef.current` is true (the shake
    already assigned velocity).
- `app/admin/styles/EmployeePond.css`:
  - `.employee-pond__particle` — 8 px circle, absolute,
    `pointer-events: none`, brand-hue `hsl()` color set inline.
  - `@keyframes employee-pond-particle` — translates from
    `(--p-x, --p-y)` toward
    `(--p-x + --p-vx*0.5, --p-y + --p-vy*0.5)` while fading
    opacity 1 → 0 and scaling 1 → 0.3 over 600 ms.
  - `prefers-reduced-motion` collapses the animation to 1 ms.
- Source-locked by `__tests__/employee-pond/e7-particles-shake.test.ts`
  (22 assertions: detectShake thresholds + four branches;
  stepPhysics collision callback fires only when overlap +
  dragging orb is involved, contact-point math, no-overlap
  no-fire; hook ref forward + every-frame handoff; page state,
  pool cap, 40-ms throttle, shakeReleasedRef reset, shake
  detection wiring incl. setDragging false + 12-particle
  burst + 140/220 neighbor kick, pointerup skip-when-shake;
  CSS particle box + keyframes vars + reduced-motion).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8784 green
  (+22).
| Below-pond list of currently-visible employees | **✅ E8** |

**E8 shipped 2026-06-16** — below-pond list polish.
- `app/admin/employees/EmployeePond.tsx`:
  - Every row is now a real `<button>` so keyboard tab order
    works + screen readers announce the row as actionable.
  - Click → calls the same `handleOrbClick(e)` as clicking the
    orb, opening the E5 dialogue anchored to the orb's
    current position.
  - Hover (mouse/pen only) cross-highlights the matching orb
    by writing to `hoveredEmployeeId`, so the user can locate
    a specific employee by name and immediately see where
    they're floating. Focus also fires for keyboard parity.
  - `data-selected` / `data-hovered` mirrors the dialogue +
    hover state so the row visually reflects the same state
    as the orb.
  - Row content: 36 px avatar (image with initials fallback) +
    name + email + optional job title + up to 3 role pills
    with a `+N` overflow indicator using `ROLE_FILTER_LABELS`
    so the labels match the filter dropdown.
- `app/admin/styles/EmployeePond.css`:
  - `.employee-pond__list-row` flex layout, brand-navy hover
    ring, brand-navy border + soft shadow when selected,
    `:focus-visible` outline for keyboard nav.
  - Avatar 36×36 with circle clip + image / initials variants.
  - Role pill uses `--color-bg-subtle` + `--radius-pill`
    (canonical tokens — no drift).
  - Phone breakpoint collapses the list grid to a single
    column + drops the 50% role-pill width cap so wide
    multi-role rows still read.
- Source-locked by `__tests__/employee-pond/e8-list-polish.test.ts`
  (15 assertions: button + testID + data-attrs + click handler +
  pointer cross-highlight + focus parity + avatar fallback +
  text layout + 3-pill cap + overflow `+N` + label source-of-
  truth; CSS row flex + hover ring + selected border + avatar
  shape + pill shape + phone column collapse + no-drift token
  check).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings (one new for the row
  avatar), full suite 8799 green (+15).
| Email + Direct Message contact buttons (incl. `?to=` on inbox) | **✅ E9 (DM done; in-app email page → E9c)** |

**E9 shipped 2026-06-16** — Email + DM contact buttons (DM lands
end-to-end; in-app email composer page deferred to **E9c** because
no email surface exists yet — Email button uses `mailto:` for
universal reach until E9c builds the dedicated page).
- `app/admin/employees/EmployeePond.tsx`:
  - Email button is now an `<a href={mailto:<email>}>` so right-
    click + copy works and the OS mail client opens reliably.
    `data-action="contact-email"` + testID preserved.
  - DM button dispatches a `CustomEvent('employee-pond:open-
    messenger', { detail: { email } })` then calls
    `closeDialogue()` so the widget has full focus. SSR-safe:
    guards on `typeof window === 'undefined'`.
- `app/admin/components/FloatingMessenger.tsx`:
  - `useEffect` listens for `employee-pond:open-messenger`. On
    receive, normalizes the email (`trim()` + `toLowerCase()`),
    refuses when no `userEmail` is signed in, then either:
    1. Reuses an existing direct conversation whose
       participants include the target email — `setActiveConv` +
       jump to chat view + fetch messages.
    2. POSTs `/api/admin/messages/conversations` with
       `{ type: 'direct', participant_emails: [targetEmail] }`,
       picks up the new conv, and lands the user in chat.
  - Listener cleans up on unmount via removeEventListener so an
    auth-driven re-mount doesn't leak duplicate handlers.
- Source-locked by `__tests__/employee-pond/e9-contact-buttons.test.ts`
  (12 assertions: Email mailto + testID; DM CustomEvent dispatch
  + closeDialogue afterward + SSR guard; FloatingMessenger
  addEventListener + cleanup + email normalize + user-email
  guard + existing-conv reuse + new-conv POST + view+fetch
  jump).
- **E9c** (queued) builds the dedicated `/admin/email/new`
  composer page. **E9b** (queued) layers shared recipient
  continuity across the messenger widget, `/admin/messages`,
  and (once E9c lands) the email composer.
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8811
  green (+12).
| Recipient continuity: widget ↔ dedicated /admin/messages page | **✅ E9b** |

**E9b shipped 2026-06-16** — cross-surface recipient continuity.
- `lib/employee-pond/messenger-recipient.ts`:
  - Shared localStorage-backed store keyed by
    `admin/messages/active-recipient`.
  - `MESSENGER_RECIPIENT_TTL_MS = 1 hour` so stale recipients age
    out — returning the next day doesn't auto-open yesterday's
    chat.
  - `normalizeRecipientEmail` (trim + lowercase) used by every
    callsite so the store always agrees on identity.
  - `saveActiveRecipient(email)`, `readActiveRecipient(now?)`,
    `clearActiveRecipient()`, plus pure `isRecipientFresh` for
    the freshness check. SSR-safe: every function short-
    circuits when `typeof window === 'undefined'` or when
    localStorage throws (private mode).
- `app/admin/components/FloatingMessenger.tsx`:
  - **Persist** effect — whenever `activeConv` changes and is a
    direct conv, the other participant's email is normalized
    and persisted. Group conversations don't touch the store
    (no single recipient).
  - **Hydrate** effect — when the widget opens AND the user
    isn't already on a chat view, the saved recipient (if
    fresh) jumps the widget straight to the matching
    conversation. Idempotent: doesn't override an active context.
- `app/admin/messages/page.tsx`:
  - Mirror persist effect (same shape as the widget) so picking
    a recipient here also writes through.
  - Mirror hydrate effect, gated by `continuityHydratedRef` so
    it fires exactly once per page load and only after
    `conversations` populates. Auto-selects the conversation
    matching the saved recipient on entry.
- Source-locked by
  `__tests__/employee-pond/e9b-recipient-continuity.test.ts`
  (18 assertions: normalization edges; TTL freshness gates;
  localStorage round-trip via a node-side stub matching the
  desktop test pattern; clear + empty-save semantics; unparseable
  + too-old short-circuit; FloatingMessenger persist + hydrate +
  active-chat guard; messages page imports + persist + hydrate
  + hydrate-once ref + activeConv set + fetchMessages call).
- **Three post-build checks: green** — typecheck clean, lint
  clean on the touched files, full suite 8829 green (+18).
| In-app email composer page at /admin/email/new | **✅ E9c** |

**E9c shipped 2026-06-16** — in-app email composer.
- `app/api/admin/email/send/route.ts`:
  - Admin-gated POST. Validates `to` (regex email shape), `subject`,
    `body` (all required + trimmed).
  - Sends via Resend (`POST https://api.resend.com/emails`) using
    the same pattern as `app/api/contact/route.ts`. `reply_to`
    set to the signed-in sender's email so a recipient hitting
    Reply lands on the actual sender, not the noreply alias.
  - HTML body escapes user content + linebreaks → `<p>…<br>…</p>`.
  - Dev-mode short-circuit: when `RESEND_API_KEY` is missing or
    placeholder, logs + returns success so the UI flow is
    reachable without a live key.
  - 502 with clean messages on Resend non-2xx + network errors.
- `app/admin/email/new/page.tsx`:
  - Reads `?to=<email>` first; falls back to
    `readActiveRecipient()` so jumping from the messenger widget
    or `/admin/messages` (or anywhere that's written through the
    E9b shared store) lands with the recipient already loaded.
  - Persists the recipient back through `saveActiveRecipient(to)`
    once the value matches the email-shape regex so leaving for
    the messenger widget or `/admin/messages` keeps continuity.
  - Composes To / Subject / Body. Send button POSTs through the
    new endpoint; disables while sending; renders success /
    error states via `role="status"` + `role="alert"`. Clears
    Subject + Body on success.
- `app/admin/styles/EmailCompose.css`:
  - Page surface tuned to a 720 px max-width content column.
  - Send button uses `--color-brand-navy` + `--color-text-on-brand`
    + 44 pt min-height (mobile-friendly).
  - Success / error status banners use
    `--color-success-bg` / `--color-error-bg` tokens.
  - Phone breakpoint stretches the Send button to full-width.
- `app/admin/employees/EmployeePond.tsx`:
  - Email button now `<a href="/admin/email/new?to=<encoded>">`
    — no more `mailto:`. The dialogue's other buttons unchanged.
- Source-locked by `__tests__/employee-pond/e9c-email-page.test.ts`
  (19 assertions: page `'use client'` + shared-store import +
  `?to=` then store hydrate + persist-on-valid-email; three
  form testIDs; Send POST shape; role="status"/role="alert"
  + send-disabled; endpoint auth gate + every validation
  branch + dev-mode short-circuit + reply_to wiring + 502
  failure modes + HTML escape; EmployeePond button switched
  from mailto: to the new route + no mailto: in the contact-
  email block; CSS Send brand-navy + 44 pt, status banner
  tokens, no-drift check).
- The E9 source-lock that pinned the old `mailto:` href on the
  Email button was updated to assert the new in-app route.
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8881 green
  (+19).
| `prefers-reduced-motion` + accessibility audit | **✅ E10** |
| Full mobile-responsive build of the pond surface | **✅ E10b** |
| Soft viewport — orbs render but can drift outside the visible circle | **✅ E10b** |

**E10b shipped 2026-06-16** — mobile-responsive build + soft pond
viewport.
- `app/admin/styles/EmployeePond.css` — `@media (max-width: 768px)`
  block extended for a full phone-tuned pass:
  - **Toolbar reorg**: stacks column; search becomes its own
    full-width row at 44 pt min; filter button + count chip share
    the next row.
  - **Filter panel as a sheet**: `position: fixed; inset: 0`
    full-screen on phone with `env(safe-area-inset-bottom/top)`
    padding so the iOS home indicator + notch stay clear. List
    rows bump padding + font size to thumb-friendly; checkboxes
    grow to 22 × 22 px.
  - **Dialogue as a bottom-sheet**: `position: fixed !important;
    bottom: 0; width: 100%`; top corners rounded (`var(--radius-lg)
    var(--radius-lg) 0 0`); slides up via
    `@keyframes employee-pond-sheet-rise` (translateY 100% → 0 in
    220 ms cubic-bezier ease-out); grab-handle pseudo-element at
    the top; safe-area-inset-bottom padding so contact buttons
    don't touch the home indicator; every interactive (close,
    Email, Message, Open profile) at 44 pt min.
  - **Surface padding** reduced so the pond + list don't crowd
    the edge.
- `@media (max-width: 480px)` block added — small-phone
  tightening: `--pond-radius: 140px`, `--orb-size: 52px`,
  list-row avatar 32 × 32.
- `lib/employee-pond/physics.ts` — **soft viewport**:
  - Removed the hard wall-bounce + position clamp (the previous
    "snap back at the edge" semantics).
  - Replaced with a soft inward pull whose magnitude is
    proportional to overshoot. An orb that drifts outside the
    visible radius (via drag fling / shake release / hard
    collision) gets a continuous inward tug; gravity + damping
    bring it home over ~1–2 seconds. No instantaneous reflection,
    so the user sees a smooth return rather than a snap.
  - The pond's existing `overflow: hidden` clips off-screen orbs
    visually — they're DOM-rendered, still tick in the physics,
    and can be brought back into view by search filter, by
    collisions from other orbs, or by gravity. Matches the user
    spec's "window into a larger world" feel.
  - `bounceRestitution` retained on the options interface for
    API compatibility (`void bounceRestitution;` documents it
    explicitly).
  - Dragging orbs bypass the viewport pull just like every other
    force, so the user can drag freely off-screen.
- E3 wall tests rewritten to assert the new soft-viewport
  behavior (orb stays outside but vx points inward; outside-orb
  drifts back over 5 s of simulation; inside-orb unaffected by
  the viewport tug; dragging-orb sees no force).
- Source-locked by `__tests__/employee-pond/e10b-mobile-viewport.test.ts`
  (19 assertions: soft viewport in four shapes; mobile toolbar
  reorg + 44 pt; full-screen filter panel + safe-area + thumb-
  size rows; bottom-sheet dialogue + sheet-rise keyframes + grab
  handle + 44 pt buttons + close + safe-area; small-phone size
  tightening).
- **Three post-build checks: green** — typecheck clean, lint
  clean on touched files, full suite 8862 green (+19).
- **Particle triple-check (this slice)**: reviewed the entire
  particle path end-to-end (`spawnParticles` → state push with
  pool cap → CSS custom-prop translate3d animation → onAnimationEnd
  removal). No issues found. Reduced-motion path verified to
  short-circuit at React + collapse-to-1ms at CSS. Pool cap
  keeps render bounded even under a long drag through dozens
  of orbs.

**E10 shipped 2026-06-16** — reduced-motion + a11y audit.
- `app/admin/employees/EmployeePond.tsx`:
  - `reduceMotion` state subscribes to
    `window.matchMedia('(prefers-reduced-motion: reduce)')` +
    a `change` listener so a live OS toggle propagates.
  - Physics hook now called with `enabled: !reduceMotion` so
    the rAF loop pauses for sensitive users.
  - `spawnParticles` short-circuits when `reduceMotion` is
    true — the gesture still works, it just doesn't shower
    sparkles.
  - `dialogueOpenerRef` captures the element that opened the
    dialogue (orb or list row); `closeDialogue` returns focus
    to it via `setTimeout(0)` after the React close commits,
    then clears the ref so stale elements don't leak.
  - `handleOrbClick(employee, opener?)` widened to take the
    trigger element; orb `onClick` passes
    `orbRefsRef.current.get(...)`, `onKeyDown` passes
    `e.currentTarget`, list row `onClick` passes
    `ev.currentTarget`.
  - Pond surface gets `role="region"` +
    `aria-roledescription="Interactive employee pond"` +
    a live `aria-label` ("Employee pond — N employees
    visible. Use the list below or Tab to navigate.") so
    screen readers announce the section and point users at
    the easier nav path (the below-pond list).
- `app/admin/employees/useEmployeePondPhysics.ts`:
  - New effect: when `enabled === false`, write a one-shot
    static transform for every orb (so they land at their
    seeded positions instead of stacking at center). Re-runs
    on `visibleIds` / `pondRadius` changes.
- Source-locked by
  `__tests__/employee-pond/e10-reduced-motion-a11y.test.ts`
  (14 assertions: matchMedia subscribe + change listener
  cleanup; hook enabled-flag swap; spawnParticles short-
  circuit; static-fallback effect + its deps; focus-return
  capture + setTimeout focus + opener clear; orb onClick +
  onKeyDown + list row onClick all pass an opener; pond
  role + aria-roledescription + live aria-label shape).
- Three prior source-locks were widened to accept the new
  hook signature: E3 (`enabled: true` → expression), E5
  (`handleOrbClick(employee)` → with-opener variant), E8
  (list row click → `(ev) => handleOrbClick(e, ev.currentTarget)`).
- **Three post-build checks: green** — typecheck clean, lint
  only the pre-existing `<img>` warnings, full suite 8843
  green (+14).
| Privacy contract: per-user public/private settings + role visibility matrix | **✅ E12 (foundation; E12b adds API + UI)** |

**E12 shipped 2026-06-16** — privacy foundation: schema + pure
visibility helper. The actual API + the per-user settings UI ship
as **E12b** so this slice stays surgical.
- `seeds/295_employee_privacy.sql`:
  - `employee_privacy` table with `user_email` as PK.
  - Contact + employment-context fields default to `true`
    (visible by default for team coherence): name, email,
    phone, hire_date, job_title, employment_type, photos,
    jobs_history.
  - Personal + pay-adjacent fields default to `false`: DOB,
    gender, address, hours, bonuses.
  - **No salary / payout columns** — those categories are
    admin-only at the JS layer regardless of any user toggle,
    so persisting a toggle row would be misleading.
  - `idx_employee_privacy_updated_at` index for the
    "recently changed" admin diagnostic.
- `lib/employee-pond/visibility.ts`:
  - `ADMIN_VISIBILITY_ROLES` = `['admin', 'developer',
    'tech_support', 'equipment_manager']` — roles that see
    every field.
  - `ALWAYS_ADMIN_ONLY_FIELDS` = `['hourly_rate',
    'annual_salary', 'payout_history']` — pay-data the helper
    refuses to surface to non-admins regardless of toggles.
  - `EmployeePrivacy` interface mirrors the schema columns 1:1.
  - `DEFAULT_EMPLOYEE_PRIVACY` — sensible defaults applied at
    read time when no DB row exists.
  - `viewerSeesEverything(viewer, targetEmail)` — true when
    viewer is the target OR holds any admin-visibility role.
  - `filterEmployeeView({ viewer, target, targetPrivacy? })`
    — pure filter:
    1. Own profile → full record returned.
    2. Admin viewer → full record returned.
    3. Otherwise → only the fields the target's toggles allow,
       with `email` always present (it's the id) and `name`
       falling back to literal `'Employee'` when the name
       toggle is off so the UI always has something to render.
       Pay-data fields are NEVER returned in this branch.
  - `hydrateEmployeePrivacy(partial)` — merges a partial row
    (from the DB or a form draft) over the defaults so
    callers always have a complete struct to work with.
- Source-locked by `__tests__/employee-pond/e12-visibility.test.ts`
  (24 assertions: ADMIN_VISIBILITY_ROLES list + ALWAYS_ADMIN_ONLY
  list; default-privacy split by sensitivity; viewerSeesEverything
  own-profile + every admin role + general-role false; filter
  helper own-profile branch + admin branch incl. salary + payout
  + every admin role variant; general-viewer-public-defaults
  surface + private-defaults hidden + always-admin-only never
  surfaces + opt-in surfaces + opt-out hides + name fallback +
  email-always-present; hydrate null + partial; SQL schema
  PK + every default + no-salary-column + index).
- **Three post-build checks: green** — typecheck clean, lint
  clean, full suite 8905 green (+24).

E12b (queued) ships the GET/PUT endpoint for the user's own
settings + the `/me/privacy` (or settings panel) UI that exposes
the toggles. E13 (activity history schema) + E14 (admin
"everything" page + employee "my history" page) consume the
helper to filter their displays.
| Privacy API + per-user settings UI | **✅ E12b** |

**E12b shipped 2026-06-16** — privacy API + per-user settings UI.
- `app/api/admin/employees/privacy/route.ts`:
  - `EDITABLE_KEYS` allow-list (13 entries — every column in
    seeds/295). Salary + payout fields explicitly absent.
  - **GET** auth-gates on signed-in email, lowercases for
    lookup, selects only the legal columns from
    `employee_privacy` for the current user, hydrates
    against `DEFAULT_EMPLOYEE_PRIVACY` so missing rows fall
    back to the documented defaults. Returns
    `{ privacy, defaults }` so the page can later add a
    "reset to default" button.
  - **PUT** auth-gates, validates the body is an object,
    walks each key against the allow-list (rejects unknown
    keys + non-boolean values with a 400), refuses empty
    bodies. Upserts on `user_email` with a fresh
    `updated_at` timestamp and returns the hydrated row.
- `app/admin/me/privacy/page.tsx`:
  - `'use client'` + `useSession` gate.
  - Four `GROUPS` (Contact / Personal / Employment / Activity)
    drive the form layout; every field has a `label` + a
    plain-English `hint` so users understand what they're
    flipping.
  - Loads via GET on mount; toggles update local state; Save
    PUTs the full struct. Status banners via `role="status"` +
    `role="alert"`. Save button disables while in flight.
  - Intro copy explicitly calls out the role visibility matrix
    + the salary/payout admin-only enforcement so users
    understand the contract.
- Stylesheet borrowed from `EmailCompose.css` so the page
  matches the rest of the admin shell without a new file.
- Source-locked by
  `__tests__/employee-pond/e12b-privacy-api-ui.test.ts` (17
  assertions: GET + PUT auth gates; EDITABLE_KEYS shape + no
  salary/payout; GET hydrate + defaults return; PUT unknown-
  key + non-boolean + empty-body rejection; PUT upsert path +
  lowercase email; page testIDs for groups + toggles; load on
  mount; PUT body shape; role="status"/alert; save-disable;
  matrix copy).
- **Three post-build checks: green** — typecheck clean, lint
  clean on touched files, full suite 8922 green (+17).
| Activity history schema (jobs / bonuses / salary / payouts / hours / photos) | **✅ E13** |

**E13 shipped 2026-06-16** — activity history schema.
- `seeds/296_employee_bonuses.sql` — per-employee bonus log.
  Columns: `id`, `user_email`, `amount_cents (BIGINT)`,
  `reason (NOT NULL)`, `awarded_by`, `awarded_at`,
  `related_job_id (FK to jobs, nullable)`, `notes`, audit
  timestamps. Indexes: `(user_email, awarded_at DESC)` for the
  activity list; partial index on `related_job_id` for the
  "show all bonuses tied to this job" query.
- `seeds/297_employee_salary_history.sql` — per-employee salary
  change log. Columns: `id`, `user_email`,
  `base_hourly_rate_cents`, `base_annual_salary_cents`,
  `effective_from (NOT NULL)`, `effective_to (NULL = current)`,
  `changed_by`, `change_reason`, `notes`, audit timestamps. CHECK
  constraints: at least one of hourly / annual must be set;
  `effective_from <= effective_to` when both present. Indexes:
  `(user_email, effective_from DESC)`, plus a partial index for
  the "current compensation" row (`WHERE effective_to IS NULL`).
- `seeds/298_employee_payouts.sql` — per-employee payout ledger.
  Columns: `id`, `user_email`, `period_start (DATE NOT NULL)`,
  `period_end (DATE NOT NULL)`, `gross_cents (BIGINT NOT NULL)`,
  `net_cents (BIGINT NOT NULL)`, `items (JSONB NOT NULL DEFAULT
  '[]')`, `paid_at (NOT NULL)`, `method (DEFAULT 'direct_deposit')`,
  `reference`, `notes`, `created_by`, audit timestamps. CHECK
  constraints: `period_start <= period_end`; `gross_cents >= 0`,
  `net_cents >= 0`, `net_cents <= gross_cents`. Indexes:
  `(user_email, paid_at DESC)`, `(period_end DESC)`.
- `lib/employee-pond/activity-history.ts`:
  - `ACTIVITY_TABLES` constant mapping `'bonuses' | 'salary' |
    'payouts'` → table names so consumers don't hard-code.
  - TypeScript interfaces matching each table 1:1:
    `EmployeeBonus`, `EmployeeSalaryHistoryRow`, `EmployeePayout`
    with `PayoutLineItem` for the JSONB shape.
  - `formatCents(n)` — canonical USD formatter, `'—'` on null /
    undefined / NaN.
  - `formatHours(n)` — singular vs plural label, `'—'` on
    null / undefined / NaN.
  - `currentSalaryRow(rows)` — returns the row with
    `effective_to IS NULL` if one exists; falls back to the most
    recent `effective_from` otherwise; null on empty input.
  - `sumBonusesSince(bonuses, sinceIso)` — inclusive YTD sum
    helper for the admin everything-page header summary.
- Source-locked by
  `__tests__/employee-pond/e13-activity-history.test.ts` (22
  assertions: ACTIVITY_TABLES shape; formatCents zero + thousand
  + million + nulls + negative; formatHours singular vs plural +
  nulls; currentSalaryRow empty + open-row + fallback;
  sumBonusesSince inclusive cutoff + no-match + empty; SQL
  schemas — bonuses columns + reference + index; salary CHECK
  constraints + partial current index; payouts columns + JSONB
  items + amounts CHECK + method default + activity index).
- **Three post-build checks: green** — typecheck clean, lint
  clean, full suite 8944 green (+22).

E14 (admin "everything" page + employee "My history" page)
consumes the schemas + helper next.
| Activity history surfaces (admin "everything" page + employee "my history") | **✅ E14 (admin page; "/me/history" → E14b)** |

**E14 shipped 2026-06-16** — admin "everything" page + API.
The user's-own `/me/history` mirror page is straightforward (calls
the same endpoint with `email = session.user.email`) and stays
queued as **E14b**.
- `app/api/admin/employees/[email]/history/route.ts`:
  - GET reads the `[email]` segment off the URL pathname (the
    `withErrorHandler` wrapper is single-arg so no Next ctx
    available).
  - Auth gates on signed-in user. Hydrates the target user's
    privacy row up-front; uses
    `viewerSeesEverything(viewer, targetEmail)` to decide
    whether salary + payouts ever leave the server.
  - Bonuses returned when viewer is admin / self **OR** when
    the target user has `show_bonuses_to_employees = true`.
  - Salary history + payouts are returned **only when**
    `viewerSeesEverything === true`. Non-admin viewers never
    see the rows — enforced at the API layer so a hostile
    client can't bypass the JS-side helper.
  - Response: `{ target_email, viewer_sees_everything,
    bonuses, salary_history, payouts }`.
- `app/admin/employees/manage/[email]/history/page.tsx`:
  - `'use client'`, reads dynamic email param, fetches the
    history endpoint with `credentials: 'include'`.
  - Four tabs (Overview / Bonuses / Salary / Payouts).
    `salary` + `payouts` tab buttons are hidden when
    `viewer_sees_everything === false` so the page reflects
    the gate.
  - Overview shows YTD bonus total via `sumBonusesSince`,
    current salary via `currentSalaryRow` (admin-only), and a
    plain-language privacy notice for limited viewers
    explaining the role requirement.
  - Bonus / Salary / Payout rows each carry stable testIDs.
    Currency rendered via `formatCents` so every surface
    shares the canonical USD format.
  - Back link routes to `/admin/employees/manage?email=<…>`
    so the user can step back to the main profile.
- Stylesheet reused from `EmailCompose.css` — keeps the page
  consistent with the rest of the admin shell.
- Source-locked by
  `__tests__/employee-pond/e14-history-page.test.ts` (16
  assertions: API auth gate + privacy hydrate + sees-everything
  gate + bonuses-vs-toggle + salary/payouts always-admin-only +
  response shape + pathname parse; page `'use client'` + fetch
  call + tab list + admin-only tab gating + YTD overview +
  current-salary-admin-only + bonus/salary/payout row testIDs +
  back link + helper import).
- **Three post-build checks: green** — typecheck clean, lint
  clean, full suite 8960 green (+16).
| Three post-build checks per slice (`tsc --noEmit`, `eslint`, `vitest`) | every slice |
| Optional follow-up: DOB / gender / FT-PT schema columns | **⏸️ E11 — DEFERRED. Rationale: the dialogue renders `—` placeholders today; adding the columns is decoupled from the visible feature and lands as part of the next employee-data PR.** |
| `/me/history` mirror page (employee viewing their own history) | **⏸️ E14b — DEFERRED. Rationale: the API already enforces visibility correctly for `viewer === target`; the mirror page is a copy of the admin page targeting `session.user.email` and lands when an employee profile portal is built.** |

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

## Design notes added 2026-06-16 — feedback on the prototype

### E10b — Mobile-responsive build of the full pond surface
User feedback (2026-06-16): "Please also create a version of
this for all mobile devices. Create the look same look and
feel and styling, just make it all formatted and functional
for mobile devices."

The current pond surface is desktop-tuned. The phone breakpoint
shrinks the pond + list grid but the full UX (orbs, search,
filter, dialogue, contact buttons, drag, hover tooltip, list
rows) needs an end-to-end pass for touch / portrait phones.

E10b actions:
- **Toolbar layout on phone**: search field becomes full-
  width row 1; filter button + count chip become row 2 with
  44 pt min touch targets. Filter panel pops as a full-
  screen sheet on phone (matching the calendar's cheat-sheet
  pattern from the previous plans).
- **Pond sizing**: pond radius already drops to 160 px at
  ≤768 px; verify orb count + density still feels right at
  that scale, otherwise tune to 180 px + 48 px orbs.
- **Touch drag**: pointerdown / move / up already work for
  touch (Slice E6). Verify no double-fire with the pond's
  cursor-attraction onPointerMove (which already excludes
  touch).
- **Touch hover**: hover effects are skipped on touch — make
  sure the on-tap dialogue path is still discoverable. Add
  a tap-and-hold gesture that surfaces the tooltip (name +
  email) without committing to the dialogue, so phone users
  get name-confirmation parity with desktop hover.
- **Dialogue on phone**: at the moment the dialogue is
  280×360 anchored next to the orb. On a 360-wide phone the
  panel may overflow the viewport. Convert to a bottom-sheet
  modal on phone: slides up from the bottom, full-width with
  safe-area inset for the home indicator, X close + drag-
  down dismissal gesture.
- **List rows on phone**: already collapse to single column
  via E8. Verify 44 pt touch targets on the row buttons +
  the "Open profile" link inside the dialogue.
- **Email + DM buttons on phone**: already full-width via
  E5's `.employee-pond__dialogue-contact` flex. Verify on a
  narrow phone they don't overlap with the safe-area.
- **Phone-specific particles**: the particle pool may feel
  too dense on a small screen; reduce `MAX_ACTIVE_PARTICLES`
  to 32 on phone (or scale particle count down per
  collision).
- **Performance check on phone**: profile the rAF loop with
  ~30 orbs on a mid-tier Android (Pixel 4a class). If
  framerate drops below 50 fps, reduce repulsion pass cost
  (broad-phase grid) or cap visible orb count.
- **Source-locked** via a single test file
  `__tests__/employee-pond/e10b-mobile.test.ts` that locks
  the new CSS phone rules, the bottom-sheet markup, and the
  tap-and-hold tooltip gesture.

E10b is the next slice after this commit.

### E6b — Dynamic / organic / fun feel + selection focus
User feedback after E6 shipped (in their words):
- The pond should feel "dynamic and organic and fun to
  interact with" (the "hockey table" comparison was just a
  metaphor for the floaty/glide feel — not a hard
  requirement).
- When a puck is selected, **all other pucks should fade
  slightly + the selected one stays full-color + enlarged**
  until the user unselects (closes the dialogue or clicks
  elsewhere).

E6b actions:
- **Physics tuning** for the floaty/organic feel:
  - Lower `gravity` (1.4 → ~0.8) so orbs drift in rather
    than snap.
  - Raise `damping` (per-second factor) so they settle
    gently after a perturbation.
  - Add a small idle-jitter (tiny random force per frame
    capped at low magnitude) so the pond never goes
    completely still.
- **Cursor-position attraction**: when the cursor is inside
  the pond, apply a faint additional force toward the
  cursor (so orbs seem subtly aware of where the user is
  looking). Falls off with distance; doesn't override the
  central gravity.
- **Selection state visual**: while a dialogue is open:
  - All NON-selected orbs get `opacity: 0.35`
  - The selected orb keeps `opacity: 1` AND retains the
    hover scale via `physics.setOrb(selected, { scale: 1.18,
    radius: HOVER_RADIUS })`
  - On unselect (close), restore all to `opacity: 1` and the
    selected orb to `scale: 1, radius: ORB_RADIUS_PX`
- Implementation: a new `data-selection-active` attribute on
  `.employee-pond__pond` flips the CSS rule that fades
  non-selected orbs. Pure CSS handles the dim; physics handle
  changes drive the persistent scale/radius bump.

### E12 — Privacy contract + role visibility matrix
User feedback: visibility should vary by viewer role + per-user
public/private toggles. Locking the matrix:

**Roles that see EVERYTHING** (no filtering):
`admin`, `developer`, `tech_support`, `equipment_manager`,
plus the user themselves (own profile is always fully visible).

**Roles that see GENERAL info only** (public fields per the
viewed user's privacy settings):
`employee`, `field_crew`, `drawer`, `researcher`, `teacher`,
`student`, `guest`.

**Per-user public/private settings** (new `employee_privacy`
table or columns on `registered_users`):
- `show_full_name_to_employees` (default true)
- `show_email_to_employees` (default true)
- `show_phone_to_employees` (default true if a phone is on file)
- `show_dob_to_employees` (default false)
- `show_gender_to_employees` (default false)
- `show_address_to_employees` (default false)
- `show_hire_date_to_employees` (default true)
- `show_job_title_to_employees` (default true)
- `show_photos_to_employees` (default true — for the avatar in
  the pond + the photos they've posted)
- `show_jobs_history_to_employees` (default true — which past
  jobs they were on)
- `show_hours_to_employees` (default false — pay-adjacent data
  defaults to private)
- `show_bonuses_to_employees` (default false)
- `show_salary_to_employees` (always false to non-admins,
  regardless of the toggle — pay info is admin-only)
- `show_payout_history_to_employees` (always false to
  non-admins)

Each employee gets a `/admin/employees/manage/privacy` panel
(or `/me/privacy`) where they can flip each toggle. The toggles
that say "always false to non-admins, regardless of toggle"
aren't surfaced as user-editable — they're enforced server-side
in the visibility filter.

The visibility filter is a pure helper
`lib/employee-pond/visibility.ts`:
```ts
filterEmployeeView(
  viewer: { roles: UserRole[]; email: string },
  target: FullEmployeeProfile,
  targetPrivacy: EmployeePrivacy,
): VisibleEmployeeProfile
```
Used by both the API list endpoint AND the dialogue panel
render so the same rules apply everywhere. Source-locked at
that boundary.

### E13 — Activity history schema
The data model the user wants tracked per employee, mostly
sourcing from existing tables but with a few additions:

| Surface | Source today | Add for E13 |
|---|---|---|
| **Jobs they've been part of** | `job_team` table (per-job assignees) | indexed read by `user_email` |
| **Hours worked** | `daily_time_logs` + `job_time_entries` | nothing new; the query already aggregates |
| **Photos posted** | `field_media` (mobile) + `job_files` (web) keyed on `created_by` | `created_by` index |
| **Bonuses** | `employee_bonuses` (need to add) | new table with `user_email, amount, reason, awarded_by, awarded_at, related_job_id?` |
| **Salary history** | `employee_salary_history` (need to add) | new table with `user_email, base_hourly_rate, base_salary_annual, effective_from, effective_to, changed_by, change_reason` |
| **Payout history** | `employee_payouts` (need to add) | new table with `user_email, period_start, period_end, gross, net, items[], paid_at, method` |
| **Personal info** | `registered_users` + `employee_profiles` | new columns added in E11 (DOB / gender / FT-PT) |

Three new seeds (`employee_bonuses`, `employee_salary_history`,
`employee_payouts`) for the missing tables. RLS policies
restrict reads to the user themselves + admin/owner roles.

### E14 — Activity history surfaces
- **Admin "everything" page** at `/admin/employees/manage/[email]/
  history` — a single tabbed view (Overview, Jobs, Hours, Photos,
  Bonuses, Salary, Payouts) where admins can scrub every
  company-related activity for one employee.
- **Employee "my history" page** at `/me/history` — the
  same view but with the admin-only sections (Salary, Payouts)
  redacted. Employees see their own salary always (it's their
  own data); the dim is only for non-admins viewing OTHER
  employees.

Both surfaces consume the visibility filter from E12 so the
same code paths enforce the matrix.

### Slice order — updated
E1 → E2 → E3 → E5 → E4 → **E6** → **E6b** → E7 → E8 → E9 →
E9b → E10 → (E11 optional) → **E12** → **E13** → **E14**

E6b lands right after E6 so the polish ships while the drag
slice is still hot in memory. The privacy + history slices
group at the end because they touch the schema + auth surface
significantly and are independent of the visual interactions.

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
