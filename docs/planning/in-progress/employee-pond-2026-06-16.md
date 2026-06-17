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
| Email + Direct Message contact buttons (incl. `?to=` on inbox) | **E9** |
| Recipient continuity: widget ↔ dedicated /admin/messages page | **E9b** |
| `prefers-reduced-motion` + accessibility audit | **E10** |
| Privacy contract: per-user public/private settings + role visibility matrix | **E12** |
| Activity history schema (jobs / bonuses / salary / payouts / hours / photos) | **E13** |
| Activity history surfaces (admin "everything" page + employee "my history") | **E14** |
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

## Design notes added 2026-06-16 — feedback on the prototype

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
