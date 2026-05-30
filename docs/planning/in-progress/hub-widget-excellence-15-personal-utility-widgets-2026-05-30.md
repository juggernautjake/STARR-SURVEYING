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
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** The headline
  overhaul. **R1/R2 (data + links):** audited all 10 catalog actions —
  the 6 `link` actions (`/admin/jobs/new`, `/admin/receipts`,
  `/admin/reports`, `/admin/cad`, `/admin/messages/new`,
  `/admin/schedule`) each resolve to a real `app/.../page.tsx` (verified
  against the route tree); the 2 `action` actions (clock-in-out,
  capture-receipt) keep their disabled "coming soon" state until their
  modals ship. No dead links. A catalog-integrity spec now locks that
  every `link` has an internal href + every `action` has an actionId.
  **R3 (capacity fill — the user's core ask "render as many as fit"):**
  replaced the hard per-bucket cap with measured capacity. The widget
  now self-measures its body via `useElementSize` and a new pure
  `lib/hub/widgets/quick-actions/capacity.ts` derives cols × rows from
  the contentRect (`gridCapacity` for tiles, `listCapacity` for rows,
  the standard "n tiles + (n-1) gaps fit the track" inversion). It fills
  the cell instead of stopping at a fixed number; the bucket cap remains
  the pre-measure fallback (first paint / SSR). Overflow is handled by
  `splitForCapacity` → a non-interactive **"+N more"** indicator in the
  last cell (never a dead link — a tooltip explains resize/trim).
  Grid uses `minmax(0,1fr)` cols + `alignContent:start` so tiles never
  clip. **R4 (editor):** swapped the order-agnostic checkbox list for a
  **reorderable picker** built on the shared ordered-list helpers
  (`moveUp`/`moveDown`/`addOrdered`/`removeOrdered`/`unselectedOptions`,
  Foundation Doc 02): a "Shown actions" ordered list with ↑/↓/✕ per row,
  an "Add an action" chip row of the unselected catalog entries, and a
  **live preview** grid that reflects the current selection + display
  style. Layout/display/shortcuts selects retained. 13 specs (grid +
  list capacity, overflow split + cap=1 edge, measured-vs-fallback
  capacity, icon-only packs tighter, catalog integrity, registry). Full
  hub suite (1639) green; typecheck + lint clean. **quick-actions is
  done.**

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
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 (data):** pins
  come from the shared `nav-store.pinnedRoutes` (capped at
  `MAX_PINNED_ROUTES` = 5) + the `route-registry` for labels/icons —
  confirmed correct. **R2 (the headline — "never render a dead link"):**
  the old code rendered retired pins as a `Link` with a stripped-href
  label → a guaranteed 404. Added a pure
  `lib/hub/widgets/pinned-pages/resolve.ts` →
  `resolvePinnedRoutes(hrefs, ADMIN_ROUTES)` that keeps exact matches
  (route label + icon) and **deep-subtree** matches (`/admin/jobs/abc`
  inherits `/admin/jobs`'s label/icon via `deepestPrefix`) but **drops
  any href that resolves to no registered route**. The widget now feeds
  the full `ADMIN_ROUTES` table through it. **R3 (size):** tiny now
  shows the pin **count** (matching the other widgets) instead of two
  truncated text links; grid uses `minmax(0,1fr)` + `alignContent:start`
  + per-card ellipsis so labels never clip, and since pins ≤ 5 every
  resolved pin renders at every non-tiny bucket (no cap-clipping).
  **R4 (editor):** added an inline **Manage pins** control — lists the
  resolved pins with an unpin (✕) button wired to the nav-store's
  `unpinRoute`, so the user curates pins without leaving the hub
  (reflects + edits the same list the rail/command palette use).
  layoutStyle + iconStyle selects retained. 6 new resolver specs
  (exact, deep subtree, drop stale, order/filter, deepestPrefix
  longest-ancestor + exact-not-ancestor). The existing slice-94 specs
  (registry + cols/cap + empty-state) still green. Full hub suite (1645)
  green; typecheck + lint clean. **pinned-pages is done.**

## bookmarks
- **Source:** user-defined `{ id, label, url, icon }` in content.
- **Track:** arbitrary user bookmarks (internal or external URLs).
- **Per-bucket:** tiny → count; small → 1-col; medium+ → grid.
- **Editor:** add/edit/remove/reorder bookmarks (reorderable list),
  layoutStyle. Make adding a bookmark easy + validated.
- **Slices:** Build/Wire + R1–4.
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1/R2 (the
  headline — links must be safe, never a dead/dangerous one):**
  bookmarks are arbitrary user-entered URLs (no route table to validate
  against), so added a pure `lib/hub/widgets/bookmarks/url.ts` →
  `isValidBookmarkUrl(url)` + `safeBookmarks(list)`. It accepts internal
  absolute paths (`/admin/…`), complete `http(s)://host` URLs, and
  `mailto:`/`tel:`; it **rejects** `javascript:`/`data:` (XSS vectors),
  protocol-relative `//host`, blanks, and unfinished drafts (`https://`).
  The widget now renders only `safeBookmarks(...)`. **R3 (size):** tiny
  shows the bookmark **count** (was a 1-col list that didn't fit a 1×1).
  **R4 (editor — "make adding easy + validated"):** added **reorder**
  (↑/↓ per row, on the shared `moveUp`/`moveDown` helpers) and **inline
  URL validation** — a non-empty-but-unsafe URL flags a red border +
  `aria-invalid` + a "enter a full http(s):// URL or an internal /path"
  hint (a blank URL is treated as a draft, not an error); the URL
  placeholder now shows both accepted forms. Existing add/edit/remove
  retained. 6 new url specs (http(s)/internal/mailto/tel accepted;
  javascript/data/protocol-relative/blank/draft rejected; safeBookmarks
  filter+order). The slice-115 specs (registry + caps/cols + isExternal
  + makeId) still green. Full hub suite (1650) green; typecheck + lint
  clean. **bookmarks is done.**

## recent-activity
- **Source:** nav-store `recentRoutes`. Fields: href, route {iconName,
  label}.
- **Track:** recently visited routes.
- **Per-bucket:** tiny → count; small → top few; medium+ → more.
- **Editor:** itemLimit, includeTypes.
- **Slices:** Build/Wire + R1–4 (R2: every recent href resolves).
- **Build/Wire + Rounds 1–4 ✅ shipped 2026-05-30.** **R1 (data):**
  reads `nav-store.recentRoutes` + the route-registry for labels/icons —
  confirmed correct; the itemLimit + tiny-counter were already fine.
  **R2 (the headline — "every recent href resolves"):** the old code
  rendered a recent href even when `findRoute` missed (raw stripped-href
  label) → a retired route would be a dead link, and deep visited pages
  (`/admin/jobs/abc`) showed an ugly stripped label. **Lifted the
  pinned-pages resolver into `_shared/route-resolve.ts`**
  (`resolveRouteHrefs` + `deepestPrefix`) since two widgets now need it,
  and pointed `pinned-pages/resolve.ts` at it via re-export (its widget
  + specs unchanged). recent-activity now resolves `recentRoutes`
  against the full `ADMIN_ROUTES`: exact + deep-subtree matches keep the
  route's label/icon (deep hrefs preserved so the link still lands on
  the exact page) and **unregistered hrefs are dropped**. The tiny
  counter now reflects the resolvable count (matches the list). **R3
  (size):** tiny → count (already), list rows ellipsis-clamped (already
  fine). **R4 (editor):** itemLimit retained; the includeTypes axis is
  the single real type today (recent-routes) — the activity-log type is
  still a documented follow-up (no phantom options). 5 new shared
  route-resolve specs; the slice-114 specs (caps/trimHref/iconForRoute/
  registry) still green. Full hub suite (1655) green; typecheck + lint
  clean. **recent-activity is done.**

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
