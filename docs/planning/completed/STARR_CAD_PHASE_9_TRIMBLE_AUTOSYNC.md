# STARR CAD — Phase 9: Trimble Access AutoSync ingestion

> **Status:** spec complete; implementation deferred. The doc describes
> the full Day-1 → Day-5 build-out for the live-streaming field-to-office
> path. Implementation requires (a) a Trimble Connect Business
> subscription + TID OAuth client credentials, (b) a TDC600 controller
> for real-device testing, and (c) a focused 2–5 day implementation
> window once Phase 1–8 have shipped. None of those preconditions
> exist today; deferring the implementation, not the spec.
>
> When the implementation slot opens, create a fresh
> `STARR_CAD_PHASE_9_IMPLEMENTATION.md` under `in-progress/` with
> Day-1 → Day-5 acceptance checklists; this doc stays in `completed/`
> as the source-of-truth spec the implementation cites.
>
> **Owner:** Jacob Maddux · **Last updated:** 2026-04-30
>
> **Position in roadmap:** Phase 9 lands AFTER Phase 8 closes out. The
> Phase 1–6 AI engine + Phase 7 export + Phase 8 polish all run on
> CSV/RW5/JobXML/PDF inputs (deterministic translators per
> `STARR_CAD_MASTER_PLAN.md` §8b). This doc spells out the live-streaming
> path that lights up office-side analysis seconds-to-minutes after each
> field shot.

---

## 1. Scope + the user story

> *Jacob walks the boundary, shoots a fence corner at 9:42 AM. By 9:46
> AM, Hank's office screen shows the new point on the map. He notices
> it's 0.4 ft off from the deed call and texts Jacob: "want to recheck
> that one?"*

That round-trip — measure → analyse → call the field — is the headline
goal. Polling cadence target = 5 minutes (the user's directive). Real-
world latency end-to-end is 30 s – 2 min depending on cell signal +
Trimble Connect's processing.

**Three subsystems** stitched together:

| Tier | Lives where | What it does |
|---|---|---|
| **Field** | TDC600 controller running Trimble Access | Captures shots; AutoSync uploads to Trimble Connect every 5 min + on close-job + on end-survey |
| **Cloud** | Trimble Connect (Trimble's file-storage + collab platform) | Holds the latest job snapshot + version history; what the office app polls |
| **Office** | Custom Python service (FastAPI + APScheduler) + Next.js admin web | Polls Connect, diffs new points, fires events, runs analysis handlers, pushes to the live map |

---

## 2. Field-side configuration (TDC600 / Trimble Access)

5-minute one-time setup per controller per project. No code; pure config.

1. **Sign into Trimble Identity (TID)** in Access. Confirms the
   controller has a refresh-token-able session that AutoSync uses to
   authenticate uploads.
2. **Trimble Connect Business subscription** — required for both field
   crew and office account. Bundled with Trimble Access subscription, so
   already paid for; Hank confirms project membership in Connect.
3. **Configure AutoSync.** From the Projects screen → Sync Scheduler:
   - `Automatically upload current project` → Yes
   - `Periodically` → `0 hours, 5 minutes`
   - `When closing a job` → Yes  *(belt-and-suspenders backup)*
   - `When ending a survey` → Yes  *(catches stragglers when the crew
     wraps the job)*
4. **Auto-CSV export** alongside the binary `.job` upload. Critical:
   the default upload is the binary `.job` file which is parseable but
   proprietary and a pain. Configure Access to also export a CSV (Point
   #, Code, Northing, Easting, Elevation, Description 1, Description 2)
   on every sync via one of the predefined XSL stylesheets in `Trimble
   Data\System Files\`. The CSV lands in the same Connect folder as the
   `.job` and is trivial to parse. **Whichever fields are useful in the binary file but aren't in the CSV file should be added to the CSV.**

5. **Validate.** Walk a few test shots, wait 5 min, confirm the CSV
   appears in Connect via the web UI. Without this validation step the
   field crew will burn a day shooting before discovering the sync
   silently failed.

---

## 3. Cloud-side: what Trimble Connect actually is

A file-storage + collaboration platform under the hood. Each AutoSync
**replaces** the latest job files in the project folder; Connect keeps
version history but the "current" pointer is always the most-recent
snapshot. So the office app does NOT need to handle deltas from Trimble
— it just detects "this file changed" via the file's modified
timestamp and computes the delta itself by diffing the new CSV against
its last-seen state.

Implications for our diff pattern:
- **Don't trust file content alone for "is this newer?"** — use the
  Connect-server-side `modified_at` field on the file metadata.
- **Don't assume sequential point numbers fill gaps.** Crews re-shoot
  points, delete points mid-job, and renumber. The diff has to handle
  insert + update + delete cleanly.
- **Single source of truth is the latest CSV.** No append-only
  guarantees from Connect.

---

## 4. Office-side architecture

Hybrid Python micro-service per `STARR_CAD_MASTER_PLAN.md` §16.2:

```
Trimble Connect (cloud)
        ▲
        │ HTTP polls every 5 min
        │
┌───────┴────────────────────────────────────────┐
│  PYTHON SERVICE (FastAPI + APScheduler)        │
│                                                 │
│  ┌──────────────┐   ┌──────────────────────┐   │
│  │ poll_loop    │──▶│ diff_against_seen()  │   │
│  │ (5-min tick) │   │ (SQLite "seen" table) │   │
│  └──────────────┘   └─────────┬────────────┘   │
│                               │                 │
│                               ▼                 │
│                     ┌─────────────────────┐    │
│                     │ new_points_event    │    │
│                     │   .fire(new, all,   │    │
│                     │          job_meta)  │    │
│                     └─────────┬───────────┘    │
│                               │                 │
│         ┌─────────────────────┼─────────────────┐
│         ▼          ▼          ▼          ▼     │
│   websocket    fxl_code   duplicate   closure  │
│     push      check      detect      check    │
│         …                                       │
└─────────────────────────────────────────────────┘
        │ WebSocket
        ▼
┌────────────────────────────────────────────────┐
│  ADMIN WEB (Next.js + Leaflet)                 │
│  - Live map of new points as they arrive       │
│  - Alert panel (overrides, code mismatches…)   │
│  - Drill into any point → CAD scene graph     │
└────────────────────────────────────────────────┘
```

### 4.1 Stack picks

- **Backend:** Python with **FastAPI** for HTTP, **APScheduler** for
  the 5-min cron tick (or just `asyncio.sleep(300)` in a loop — APS
  is overkill for a single job).
- **State:** **SQLite** for the "seen points" diff table — keeps the
  whole service single-binary and dev-easy. Postgres is overkill for
  this; the data volume is small (low-thousands of points per job)
  and the lookup pattern is simple.
- **Frontend:** Existing Next.js admin web. New page at
  `/admin/research/live-points` (or similar — naming TBD). Leaflet.js
  for the map (free, no API key for OpenStreetMap base tiles). Or
  Mapbox / Esri tiles if Hank wants something fancier.
- **Live updates:** WebSocket between the Python service and the
  Next.js page — point arrives → instant render. Or HTTP poll every
  30 s as a simpler fallback (works fine at this scale; degrades
  gracefully on flaky office wifi).

### 4.2 The polling loop (conceptual)

```python
# Every 5 minutes:
1. Get OAuth access token (refresh from TID if needed)
2. GET /projects → find the Starr project ID
3. GET /projects/{id}/files → list files in the AutoSync folder
4. For the CSV export file:
   - Compare its server-side modified timestamp to last seen
   - If newer → download it
5. Parse the CSV
6. Diff against SQLite "seen points" table by point ID
7. New / updated / deleted points → fire new_points_event
8. Sleep 5 minutes
```

The handlers (§5 below) handle every downstream effect; the loop
itself is dead-simple and never grows in complexity even as the
analysis surface expands.

---

## 5. OAuth setup with Trimble Identity (TID)

One-time pain, then "just works" forever. Standard OAuth 2.0
Authorization Code flow.

1. **Register the office app** at the Trimble Developer Console
   (`developer.trimble.com`). Get a Client ID + Client Secret. Pick
   the redirect URI for the office hostname (e.g.,
   `https://starr-office.example/oauth/callback`).
2. **First-run flow.** Hank signs in once with his TID. The office
   app stores the **refresh token** in a secrets store (encrypted at
   rest). All subsequent access tokens are minted from the refresh
   token without user involvement.
3. **Refresh handling.** Access tokens are short-lived (~1h);
   refresh tokens are long-lived (months). The polling loop checks
   token expiry before every Connect call and refreshes when needed.
4. **Connect API endpoints we actually use:**
   - `GET https://app.connect.trimble.com/tc/api/2.0/projects` —
     list projects
   - `GET .../projects/{id}/files` — list files in a project
   - `GET .../files/{id}/fs` — download a file's content
   - All require `Authorization: Bearer <access_token>` header
5. **Reference docs:** `developer.trimble.com/docs/connect`. Verify
   API surface annually — Trimble has rev'd this before.

---

## 6. Event-driven analysis architecture

The polling loop's job: "did anything new arrive? if yes, announce
it." The handlers' job: "I care about new points, here's what I do
with them." The two never know about each other directly.

This is the **single most important architectural choice** in
Phase 9 — it's what lets the analysis surface grow without ever
touching the polling code.

### 6.1 The event primitive

```python
class PointEvent:
    """Single-event subscriber/fire pattern. Handlers register via
    decorator; the polling loop fires once per detected delta."""

    def __init__(self):
        self._handlers: list[Handler] = []

    def subscribe(self, fn=None, *, priority: int = 50):
        """@decorator — handlers ordered by ascending priority
        (lower numbers run first)."""
        def wrap(f):
            self._handlers.append(Handler(f, priority))
            self._handlers.sort(key=lambda h: h.priority)
            return f
        return wrap(fn) if fn else wrap

    def fire(self, new_points, all_points, job_meta):
        results = []
        for handler in self._handlers:
            try:
                r = handler.fn(new_points, all_points, job_meta)
                results.append((handler.fn.__name__, r))
            except Exception as e:
                log.error(f"{handler.fn.__name__} failed: {e}")
                # One bad handler must not break the others.
        return results

new_points_event = PointEvent()
```

The poll loop's only handoff is one line:
`new_points_event.fire(new_pts, all_pts, job_meta)`.

### 6.2 Handler conventions (binding)

- **Self-contained.** Each handler is a single function — no
  inter-handler dependencies. If two handlers need shared state,
  they go through SQLite + the `job_meta` payload.
- **Idempotent.** Re-firing the same `new_points` payload must not
  double-count (e.g., the duplicate-detection handler doesn't
  insert a duplicate alert if it already saw the same pair).
- **Per-handler config flag.** Wrap each handler in a config gate
  so the dispatcher can disable per-job (deed-compare for topo
  jobs is noise; closure-check for non-boundary surveys is
  noise). Pattern: each handler reads
  `config.handlers[handler_name]['enabled']`.
- **Priority hints, not hard ordering.** WebSocket push runs at
  priority=10 (UI feedback first); deed comparison runs at
  priority=70 (slower; less time-critical). The loop doesn't
  block on slow handlers — see §6.4 async upgrade.
- **Return a `HandlerResult`** — not direct alert calls. The
  aggregator collects results and decides what to do with each
  alert (text Hank, log, notification panel, daily digest line).

### 6.3 Initial handler set

Each one-paragraph spec becomes its own implementation file.

| Handler | Priority | What it does |
|---|---|---|
| `push_to_websocket` | 10 | New points → broadcast to office Leaflet map for instant render. |
| `validate_codes_against_fxl` | 20 | Each new point's code must exist in the firm's Feature Code Library (`STARR_CAD_MASTER_PLAN.md` §8b.4). Unknown code → soft-warn alert + recommend mapping in the FXL editor. |
| `detect_duplicates` | 30 | Within 0.05 ft + same code → alert "possible duplicate of point #X." Avoids the "I shot the same iron rod twice" mistake. |
| `auto_draw_linework` | 40 | Two consecutive points with a linework code (e.g., `BL`/`EP`/`FC`) → fire a polyline-add event into the §10 calculation methods registry's `bearing_distance` flow + push the new line to the map. |
| `compute_closure` | 50 | When ≥3 points carry the boundary code, run `compute_traverse_closure` from `lib/cad-cogo/`. Precision ratio < 1:10000 → alert "verify field shots." |
| `deed_comparison` | 70 | If a deed file is loaded for the job, compare each new boundary point against the nearest extracted deed corner (`STARR_CAD_MASTER_PLAN.md` §9 document ingestion produces these). Distance > 0.5 ft → alert + suggest "monument disturbed?" |
| `cert_expires_in_window` | 80 | Cross-check the active surveyor's `personnel_skills` (F10.4-a `personnel_skills` table) for any cert expiring before the job's planned completion → soft-warn so dispatch can swap before the cert lapses. |
| `end_of_day_report` | 999 | Listens for the `survey_ended_event` (a sibling event, see §6.5). Compiles the day's points + alerts + linework into a one-page PDF emailed to Hank by 5 pm. |

### 6.4 Async + slow-handler upgrade path

Some handlers are slow — `deed_comparison` may hit an external
parsing service; `cert_expires_in_window` may RPC to F10.4-b. The
event-firing code stays synchronous; slow handlers opt into a
thread pool by adding `@async_handler` decorator that wraps the
function in `asyncio.run_in_executor`. The loop's wall-clock cost
stays low even with five slow handlers stacked.

### 6.5 Multiple event types

The pattern generalises beyond "new point arrived." Future events:

```python
job_opened_event = Event()       # crew started the job in Access
survey_ended_event = Event()     # crew tapped "End survey"
control_point_measured_event = Event()  # specific event_type in CSV
```

Same `subscribe()` + `fire()` API; handlers stay one-event-scoped.

### 6.6 Handler state persistence

Some handlers need cross-run memory (e.g., "tell me when a point is
added within 10 ft of yesterday's last shot"). Each handler gets
its own SQLite table or JSON file keyed by handler name. Convention:
`handler_state_<handler_name>` table; the framework provides
`get_state(handler_name)` + `set_state(handler_name, dict)` helpers.

---

## 7. Frontend rendering (Leaflet)

Existing Next.js admin web hosts the live-points page. Inline-styles
pattern matches the rest of `/admin/equipment/*`.

```javascript
// Initial render — Belton, TX centroid + 18-zoom for survey-scale view
const map = L.map('map').setView([31.05, -97.46], 18);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Code → color map drives marker tint per point's feature code.
const colors = {
  FENCE: 'brown',
  IRON: 'red',
  POWER: 'orange',
  FH: 'green',
  // ... loaded from the firm FXL library
};

// WebSocket listener
ws.onmessage = (event) => {
  const pt = JSON.parse(event.data);
  if (pt.type === 'new_point') {
    L.circleMarker([pt.lat, pt.lng], {
      color: colors[pt.code] || 'blue',
      radius: 5,
    })
      .addTo(map)
      .bindPopup(`${pt.name} | ${pt.code} | ${pt.desc1}`);
  } else if (pt.type === 'new_line') {
    L.polyline([pt.from_latlng, pt.to_latlng], { color: colors[pt.code] }).addTo(map);
  } else if (pt.type === 'alert') {
    appendToAlertPanel(pt.severity, pt.message, pt.point_id);
  }
};
```

CRS handling: Access exports lat/long via `geographic` projection +
state-plane via `grid` projection. The CSV carries both — the office
app stores both forms, renders lat/long on Leaflet, runs analysis
in state-plane to match how the §10 calculation methods registry
operates (`STARR_CAD_MASTER_PLAN.md` §10.5).

---

## 8. Roadmap (focused weekend or two for v1)

| Day | Deliverable |
|---|---|
| Day 1 | OAuth flow working end-to-end; can list + download files from Connect; auth refresh tested |
| Day 2 | Polling loop, CSV parser, SQLite diff logic, `new_points_event` skeleton fires correctly on synthetic input |
| Day 3 | Frontend Leaflet map + WebSocket updates rendering points + lines live |
| Day 4-5 | Initial handler set wired (websocket + fxl_code + duplicates) + a real field test against the TDC600 |
| +1-2 weeks | Closure + deed comparison + auto-linework handlers + alert panel UX |
| Continuous | New handlers added as Hank surfaces new analysis ideas — each is a single function decorated with `@new_points_event.subscribe`, no other code touched |

---

## 9. Risks + open questions

| Risk | Severity | Mitigation |
|---|---|---|
| Cell signal in field → AutoSync delays/failures | medium | Belt-and-suspenders config (close-job + end-survey triggers); office surfaces "no sync in last 30 min" warning to dispatcher |
| Trimble Connect API surface changes | medium-low | Annual API smoke-test in CI; pin to Connect API v2.0 explicitly |
| OAuth refresh token revoked/expires | low | Hank's once-a-month sign-in re-auth is a non-event; surface clear "click here to re-auth" link in the office UI when refresh fails |
| Two crews on different jobs racing the same Connect project | low | Per-job CSV file + per-job SQLite "seen" namespace; the diff loop is per-(project_id, job_id) keyed |
| Handler regression silently breaks analysis | medium | Per-handler unit tests against fixture point sets; CI runs the full handler chain on the fixtures every PR |
| Field-collected codes drift from the firm FXL | medium | `validate_codes_against_fxl` handler is the early-warning system. Unknown codes alert the dispatcher within 5 min so the field crew can correct before the day's done |

### 9.1 Open questions to confirm before building

1. **Authoritative CSV column order.** Trimble Access has 4-5 default
   stylesheets; pin one + version-control the XSL. Confirm with Hank
   which fields he wants beyond the default PNEZD set.
2. **Connect Business seat assignment.** Does the office app's TID
   account need its own Connect Business seat or does it ride on
   Hank's? Verify with Trimble billing.
3. **Office hosting.** Self-host on a Starr-office mini-PC, deploy to
   the existing Next.js infra, or run as a sidecar Docker on the
   admin-web host? Recommendation: sidecar Docker — keeps the live-
   points service co-located with the admin web for low-latency
   WebSocket without exposing it publicly.
4. **Multi-project polling.** When two crews are out on different
   jobs, the loop polls both Connect projects. Naive: poll all
   projects every 5 min; smarter: only poll projects with an active
   job_team row in `proposed`/`confirmed` state for today.
   Recommendation: smart filter on day 1 to avoid pointless API
   calls.

---

## 10. Cross-references

- `STARR_CAD_MASTER_PLAN.md` §16.2 — Python micro-service stack
  picks; this doc inherits them.
- `STARR_CAD_MASTER_PLAN.md` §17.4 — Phase 9 placeholder; this doc
  is the deep-dive it points to.
- `STARR_CAD_MASTER_PLAN.md` §8b.4 — translator IR + feature-code
  library (the FXL the `validate_codes_against_fxl` handler reads
  against).
- `STARR_CAD_MASTER_PLAN.md` §10 — calculation methods registry
  (`compute_closure`, `bearing_distance` for `auto_draw_linework`).
- `STARR_CAD_MASTER_PLAN.md` §12 — conversational basis-selection
  workspace (for "this point is 0.4 ft off the deed call — what do
  you want to do?" follow-ups via the AI agent).
- `STARR_FIELD_MOBILE_APP_PLAN.md` §5.12.4 — `personnel_skills`
  cert table (the `cert_expires_in_window` handler reads against).
- [`../../completed/AI_PLAT_DRAWING_SYSTEM_PLAN.md`](../../completed/AI_PLAT_DRAWING_SYSTEM_PLAN.md)
  §14-19 — Jacob's original Phase 2 architecture; this doc is the
  operational deep-dive on top of it.
