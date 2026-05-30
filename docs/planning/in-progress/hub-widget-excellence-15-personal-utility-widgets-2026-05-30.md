# Category 15 — Personal & utility widgets

*Part of the Hub Widget Excellence plan (`…-00-master-…`). Widgets:
**quick-actions, pinned-pages, bookmarks, recent-activity, weather,
sun-calculator, daily-briefing, mileage-tracker**. (today-schedule has
its own Foundation Doc 04.) Each: Build/Wire + 4 audit rounds. The
**quick-actions overhaul** is the headline here.*

---

## quick-actions  *(user-prioritized)*
- **Source:** `lib/hub/quick-actions-catalog.ts` (10 actions today):
  `{ id, label, href, iconName, tint, kind }`. Reads
  `customization.content.actionIds` + layout/display options.
- **User asks:** better formatting; the user should more easily choose
  which actions are available; **render as many actions as fit for the
  widget size**.
- **Track / behavior:** the surveyor's chosen ordered list of actions;
  render the maximum that fit the current bucket (don't just cap at a
  fixed number — fill the available cells), spilling the rest behind a
  "+N more" or hiding gracefully.
- **Per-bucket priority:** tiny → the top 1–2 actions as icons;
  small → 2–4 in a grid; medium → 4–8; large/xlarge → the full chosen
  set in a clean grid with labels. Compute capacity from the rendered
  cell dimensions (cols × rows of action tiles) rather than a hard cap.
- **Footer link:** none required (actions ARE the links); optional
  "Customize actions" affordance points at the widget's own editor.
- **Editor (specialized — make it great):** a **reorderable
  chip/multi-select** (from Foundation Doc 02 Slice 4) to pick + order
  which catalog actions show; layout style (grid/list); display style
  (icon+label / icon-only / label-only); optional keyboard shortcuts
  toggle. Live preview of the action grid. This is the editor the user
  specifically wants to be easy.
- **Build/Wire:** capacity-based rendering (fill the widget) + the
  reorderable action picker + better tile formatting (consistent
  sizing, tint usage, hover/focus states).
- **Slices:** Build/Wire + R1 (data: confirm the catalog + that every
  action href resolves to a real route — fix any dead one), R2 (links:
  every action goes to the right page), R3 (size: capacity fill at
  every bucket, no clip, "+N more" overflow), R4 (editor: the
  reorderable picker + preview, final polish).

## pinned-pages
- **Source:** nav-store `pinnedRoutes`. Fields: href, label, iconName.
- **Track:** the user's pinned routes (matches the sketch's "Pinned
  Pages" 2-column list: Receipts, Mileage, Discussions, Finances, Crew
  Calendar, My Files, New Job, My Field).
- **Per-bucket:** tiny → count; small → 2-col compact; medium+ →
  multi-col grid/list with icons.
- **Footer link:** none (the items are links). Optional "Manage pins".
- **Editor:** layoutStyle (grid/list), iconStyle, (R4) a manage-pins
  control.
- **Slices:** Build/Wire + R1–4 (R2: every pinned href resolves).

## bookmarks
- **Source:** user-defined `{ id, label, url, icon }` in content.
- **Track:** arbitrary user bookmarks (internal or external URLs).
- **Per-bucket:** tiny → count; small → 1-col; medium+ → grid.
- **Editor:** add/edit/remove/reorder bookmarks (reorderable list),
  layoutStyle. Make adding a bookmark easy + validated.
- **Slices:** Build/Wire + R1–4.

## recent-activity
- **Source:** nav-store `recentRoutes`. Fields: href, route {iconName,
  label}.
- **Track:** recently visited routes.
- **Per-bucket:** tiny → count; small → top few; medium+ → more.
- **Editor:** itemLimit, includeTypes.
- **Slices:** Build/Wire + R1–4 (R2: every recent href resolves).

## weather
- **Endpoint:** `/api/admin/weather?location=&zip=`. Fields: temp,
  description, icon, high/low, location.
- **Per-bucket:** tiny → emoji + temp; small → + hi/lo; medium+ →
  + description + location.
- **Footer link:** none (ambient stat). 
- **Editor:** location, zip.
- **Slices:** Build/Wire + R1–4.

## sun-calculator
- **Endpoint:** `/api/admin/sun?lat=&lng=`. Fields: sunrise, sunset,
  daylight_hours, location.
- **Per-bucket:** tiny → daylight hours; small → sunrise/sunset pair;
  medium+ → + location + twilight.
- **Editor:** latitude, longitude, units, showTwilight.
- **Slices:** Build/Wire + R1–4.

## daily-briefing
- **Composite** of schedule + weather + crew + tasks (currently stub
  sections, requires medium+). 
- **Track:** make the sections REAL — pull today's schedule (Doc 04
  data), weather (weather endpoint), crew (crew-calendar/team-status),
  action items (assignments/tasks). Each section a compact live
  summary with its own "Go to…" deep link.
- **Per-bucket:** tiny/small → "resize me larger" (keep); medium →
  2 sections; large/xlarge → all 4 sections live.
- **Editor:** showWeather, showSchedule, maxJobs (+ R4: which sections,
  ordering).
- **Slices:** Build/Wire (make sections live, not stub) + R1–4. R1 is
  heavy here (four data sources).

## mileage-tracker
- **Endpoint:** `/api/admin/mileage?period=`. Fields: miles, trips,
  reimbursable_amount.
- **Per-bucket:** tiny → miles; small → miles + amount; medium+ →
  + trips + period.
- **Footer link:** "Go to mileage →" `/admin/mileage`.
- **Editor:** period.
- **Slices:** Build/Wire (footer link) + R1–4.

## Guardrails
- quick-actions/pinned/bookmarks/recent must never render a dead link —
  R2 validates every href against the route table; drop or fix any
  that don't resolve.
- daily-briefing reuses the OTHER widgets' data paths (schedule API,
  weather API, crew/team) rather than inventing new endpoints.
- Capacity-based rendering (quick-actions) derives capacity from the
  rendered cell size (`useElementSize`), consistent with the grid's
  square-cell model.
