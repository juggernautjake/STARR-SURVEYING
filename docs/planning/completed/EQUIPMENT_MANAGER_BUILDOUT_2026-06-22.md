# Equipment Manager build-out (2026-06-22)

**Owner intent (verbatim):** Audit all equipment pages; build out full,
adequate management of any equipment. There will be ~one main equipment manager
using these interfaces often — make it easy + intuitive. They must be able to
**check equipment in/out to different teams or for maintenance**, **record how
many supplies have been used and how many we have**, and **track the condition
of vehicles** and all of that.

## Audit result (what already exists)
The subsystem is large and mostly built. **Equipment CRUD is done** (Add Unit /
Edit / Retire / Restore / photo / QR / bulk import all wired on
`/admin/equipment/inventory`). Read-only dashboards work: today, consumables
(restock/threshold/discontinue), maintenance calendar + event detail, templates,
timeline Gantt, overrides, fleet valuation, crew capacity. Data model is robust
(`equipment_inventory`, `equipment_reservations`, `maintenance_events`,
`equipment_events` audit log, `equipment_templates`, `vehicles`). **No
user-facing placeholder/instruction text** was found — the "plans on the page"
were code comments + read-only stub sections.

## The real gaps (this build)
1. **Check-out / check-in has NO UI**, and the existing `reserve` + `check-out`
   APIs are **job-bound** (`reserve` requires `job_id`) — they model job
   dispatch, not "lend this to a crew / send it to maintenance." The manager
   needs a **direct, status-based** check-out/in to a crew member, a vehicle,
   or maintenance, with condition tracking.
2. **No ad-hoc supply-usage recording** — usage only happens via a job
   check-in (which itself has no UI). The manager needs a quick "record N used"
   on the consumables page.
3. **No vehicle condition tracking** — `vehicles` has only name/plate/VIN/active.

## Design decision
Build a **direct assignment ledger** (`equipment_assignments`) alongside the
existing job-reservation system (left intact for job dispatch). The direct flow
is what the single equipment manager uses day-to-day; it respects
`equipment_inventory.current_status` (only check out what's `available`; sets
`in_use` / `maintenance` / `loaned_out` while out; back to `available` on
return) and writes the `equipment_events` audit log. Intuitive > clever.

## Slices
- [x] **E1 — Assignment data model.** (seed 364 applied) seed `364_equipment_assignments.sql`:
  `equipment_assignments` (id, equipment_id FK, assigned_kind
  crew|vehicle|maintenance|other, assigned_user_id, assigned_vehicle_id,
  assigned_label, checked_out_at, checked_out_by, checkout_condition
  good|fair|damaged, checkout_notes, expected_back_at, checked_in_at,
  returned_by, return_condition good|fair|damaged|lost, return_notes,
  consumed_quantity, created_at/updated_at). Partial index for the one OPEN
  assignment per item. Apply to live.
- [x] **E2 — Check-out / check-in API.** (assign + return routes, 9 helper tests) `POST /api/admin/equipment/[id]/assign`
  (check out: require available, create open assignment, set status, log event)
  and `POST /api/admin/equipment/[id]/return` (check in: close assignment, set
  available, record condition, decrement consumable `quantity_on_hand` by
  `consumed_quantity`, log event; if returned damaged/lost → create a
  `maintenance_events` triage row + set status maintenance/lost). Pure
  state-machine helper in `lib/equipment/assignment.ts` + unit tests.
- [x] **E3 — Check-out / check-in UI.** (/admin/equipment/checked-out hub + nav) Per-item **Check out** / **Check in**
  buttons on the inventory list + detail page, opening one clean modal (pick
  crew member / vehicle / maintenance / other + condition + notes + expected
  back). A new **"Checked out"** manager view (`/admin/equipment/checked-out`)
  listing every open assignment with one-click check-in; registered in nav.
- [x] **E4 — Record supply usage.** ("Use" action on consumables + POST .../use) "Use stock" action on the consumables page
  + per-row on inventory: `POST /api/admin/equipment/[id]/use` decrements
  `quantity_on_hand` by N (guarded ≥ 0), logs an event, reason/notes. Separate
  from check-in so the manager can log usage anytime.
- [x] **E5 — Vehicle condition tracking.** (seed 365 applied; condition column +
  odometer + "Log condition" modal on /admin/vehicles; condition-log API) seed `365_vehicle_condition.sql`:
  add `condition` (excellent|good|fair|poor|out_of_service), `odometer_miles`,
  `last_inspected_at`, `condition_notes`, `status` to `vehicles`, + a
  `vehicle_condition_logs` history table. UI on `/admin/vehicles`: condition
  badge + odometer + a "Log condition / inspection" modal writing a log row +
  updating the current condition. Surface vehicle maintenance link.
- [x] **E6 — Manager hub polish.** (command center on /admin/equipment: quick
  actions + live counts for out-now / supplies-to-reorder / vehicles-attention) Make `/admin/equipment` landing a real
  command center: quick actions (Check out, Check in, Record usage, Add unit),
  and at-a-glance counts (out now, low stock, maintenance due, vehicles needing
  attention). Keep it intuitive for the single power user.

## Guardrails
- Direct-assign respects `current_status`; never double-checks-out an item.
- Apply seeds via node-pg + SUPABASE_DB_URL (non-destructive ADD COLUMN /
  CREATE TABLE IF NOT EXISTS). Never touch the job-reservation tables.
- tsc + lint + relevant vitest green before each commit; one slice = one commit.
