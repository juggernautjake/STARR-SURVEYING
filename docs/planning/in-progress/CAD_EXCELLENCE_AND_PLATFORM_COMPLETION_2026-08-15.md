# Starr CAD: make it competitive — and close out what is still open

**Status:** IN PROGRESS · opened 2026-08-15 · consolidates every outstanding build item into one
stop-hook-executable doc.

> **Owner, 2026-08-15:**
> *"Please also just look through the CAD software. I want you to really think about layering and
> drawing and point management and layer management and what would be the most useful system for the
> CAD software to make it better. I want the CAD software to be fast and optimized, and I want it to
> compete with any other software out there. I want it to have AI fully integrated with all tools and
> measurements. We need to be able to pick a specific layer or set of points and tell AI what to do
> with them. We need tons of line and symbol and font variations and editing control. We need the
> hide and unhide management to work really well and be super intuitive. We need to be able to
> calculate lines and points really well."*
>
> *"Please make sure when we are drawing, that the order of clicks and placement of points and lines
> works well and is intuitive. Make sure that whenever we calculate or place offsets it is intuitive
> and simple."*
>
> *"Include again a sweep for the mobile styling/formatting for everything that has been built once
> you are done with everything else."*

---

## What this document is

One doc, because the work is being executed by a stop hook that takes the next unchecked slice and
builds it. Five streams are folded in:

1. **The hub** (P0) — retire Work Mode, finish widget editing on desktop and mobile, restyle the
   greeting banner. First, because it is small, self-contained, and on the screen the owner opens
   daily.
2. **Starr CAD excellence** (P1–P8) — the owner ask above. The bulk of the work.
3. **Carried-over open items** (P9) — the slices still outstanding in other planning docs, pulled
   here so nothing is stranded in a `pending/` file nobody opens.
4. **Integration points** (P9b) — every surfaced integration gets a caller, a failure path, and a
   sentence saying what it is for.
5. **The closing mobile/styling sweep** (P10) — explicitly requested to run *last*, over everything
   built by then.
6. **Closeout** (P11) — seeds applied to the live database, then pushed and merged to main.

**Two ordering rules are not negotiable.** P1 comes before P2–P8: it is the model and measurement
work every later phase writes against, and doing a UI phase first would build on a model that then
moves. And P10 comes last by definition — it sweeps what the others built.

---

## What was actually measured before planning

This section exists because the last pass over this codebase
(`completed/ADMIN_UI_ALIGNMENT_AND_LAYOUT_2026-08-14.md`) learned the hard way that roughly half of
any un-read audit is the instrument. Everything below was read in the source on 2026-08-15, not
assumed:

| Fact | Where | Why it matters |
|---|---|---|
| **51 tools** in `ToolType` | `lib/cad/types.ts:736-793` | The denominator for "AI integrated with all tools". |
| **13 AI tools** registered | `lib/cad/ai/tool-registry.ts` | AI reaches **25%** of the editor. This is the single largest gap against the owner ask. |
| **Two parallel AI action surfaces** | `lib/cad/ai/tool-registry.ts` (13 typed tools) vs `lib/cad/ai-engine/drawing-chat.ts` (its own op set, incl. `REDRAW_LAYER`, `layerName` routing) | Two vocabularies for "what the AI may do". Extending both is twice the work and guarantees drift. P8 settles this first. |
| **40 line types, 48 symbols** | `lib/cad/styles/linetype-library.ts`, `symbol-library.ts` | Line and symbol variation is in decent shape — *not* the gap the owner assumed. |
| **Fonts: one `fontFamily: string`, no library, no picker** | `lib/cad/types.ts:1233`; hard-coded `'Arial'` fallbacks throughout `CanvasViewport.tsx` | Fonts *are* the real gap in the "line/symbol/font variations" ask. |
| **Selection→AI exists, but only for two solver dialogues** | `lib/cad/ai/selection-points.ts` (Calc Point, Sketch Reconcile) | "Pick a set of points and tell AI what to do" is half-built: the plumbing exists, the general path does not. |
| **Layer + selection context already reaches the model** | `lib/cad/ai/system-prompt.ts`, `drawing-chat.ts:194-236` | The AI already knows the layer table, the active layer, and `selectedIds`. P8 is *reach*, not *context*. |
| **Visibility model is three separate flags** | `Feature.hidden?`, `hiddenSegments?: number[]`, `Layer.visible` | Hide/unhide is not one concept in the model, which is why it does not behave like one in the UI. |
| **Offsets already accept typed exact values** | `OffsetPanel.tsx`, `OnLineOffsetPanel.tsx`, `lib/cad/ai-engine/offset-resolver.ts` | Offsets are better than the ask implies; the gap is *discoverability and preview*, not capability. |

**Two conclusions worth stating up front, because they redirect the work:**

- **Line/symbol variety is not the problem; fonts and *editing control* are.** 40 line types and 48
  symbols is a real library. What is missing is a font system at all, and a consistent place to edit
  any of the three.
- **AI context is not the problem; AI reach is.** The model already knows the drawing. It just
  cannot *do* 38 of the 51 things the surveyor can do.

---

## D1 — "Compete with any other software" is not a slice, so it is decomposed into four claims

"Better than the competition" cannot be built or verified. It is replaced throughout this doc by
four claims that can be:

1. **Nothing the surveyor can do by hand is unavailable to the AI** (P8) — measured as tools
   reachable by AI ÷ 51.
2. **Every object's style is editable from one place, and the library is deep enough to draw a real
   plat** (P5) — measured as line types × symbols × fonts, and one editor per axis.
3. **Hidden things are always recoverable and always visible as a count** (P6) — measured as: no
   state exists where a feature is hidden and nothing on screen says so.
4. **The frame budget holds while drawing** (P1) — measured in `lib/cad/perf`, with a number, on a
   drawing large enough to hurt.

Anything that cannot be expressed as one of those four does not belong in this doc.

## D2 — Performance is re-measured before it is optimised, and the last number is not trusted

The CAD perf pass in `completed/` took a freeze from **269ms to 25ms per frame** by finding that
`getVisibleFeatures` was re-derived five times per frame. That number is a year-old measurement of a
different codebase; a great deal has shipped since.

**P1 opens by re-measuring, not by optimising.** The failure mode being avoided is the one this
codebase has hit repeatedly: a slice that "optimises" something already fast, while the actual
cost has moved somewhere nobody profiled. `lib/cad/perf` already exists and the admin cookie +
perf-overlay recipe is recorded in memory — the instrument is there, only the reading is stale.

## D3 — The visibility model is unified before the hide/unhide UI is touched

`Feature.hidden`, `Feature.hiddenSegments` and `Layer.visible` are three independent booleans that
all mean "you cannot see this". A UI built over three flags cannot be "super intuitive", because
"unhide everything" has to mean three different reversals and the user has no idea which one hid the
thing in front of them.

**So P6 starts in the model, not the panel.** One resolved `isVisible(feature)` with a *reason*
(`hidden-by-layer` / `hidden-by-feature` / `hidden-by-segment`), and the panel renders the reason.
Building the panel first would produce a prettier version of the current confusion.

## D4 — The two AI action vocabularies are merged before either is extended

Extending AI reach from 13 tools to 51 across *two* registries means 76 additions and a permanent
drift risk. `tool-registry.ts` is the typed, tested one and wins; `drawing-chat`'s op set is adapted
onto it.

**This is the highest-risk slice in the doc** and it is deliberately first inside P8, because every
subsequent AI slice doubles in cost if it is skipped.

## D5 — Click order is a specification, not a preference

"Intuitive" click order is settled by writing down the expected sequence for all drawing tools —
prompt, click 1, click 2, what Enter does, what Escape does, what right-click does — and then making
the tools match it. Without the written sequence there is nothing to test and every review is an
opinion.

The specification is drawn from **AutoCAD/Civil 3D convention**, because the surveyors using this
have that muscle memory, and a tool that surprises a trained user is the definition of
unintuitive here.

## D6 — Every phase ends green, and "green" includes the alignment audit

`node --env-file=.env.local scripts/ui-align-audit.mjs --routes /admin/cad --width 1440` and
`--width 390` are part of each CAD phase's exit criteria, not just P10's. CAD currently measures
**2 at both widths** (the accepted 18/22/24/28 control scale, D6j of the previous doc). A phase that
raises that number has regressed the editor's layout and is not done.

On Windows/Git Bash every audit invocation needs `MSYS_NO_PATHCONV=1`, or `/admin/cad` is rewritten
to `C:/Program Files/Git/admin/cad` and the run reports a single bogus `load` finding.

---

## The slices

Each is independently shippable and ends green. The stop hook takes the topmost unchecked box.

### P0 — The hub: retire Work Mode, finish widget editing, restyle the greeting

> **Owner, 2026-08-15:**
> *"I think that the quick actions widget kind of eliminates the need for the work mode
> functionality… Please build it all out so that we remove all of the workmode functionality for all
> roles, and just make sure we can fully edit and control and use the quick actions widget."*
> *"I still want the banner that says hello and tells the date and all of that, I just want the
> workmode functionality and any buttons that go with the workmode to be removed."*
> *"Please make sure the widget editing and control is fully fleshed out and complete on both pc and
> mobile."*
> *"Please reformat the greeting banner on the hub page for the desktop and mobile to be more
> friendly and appealing, but still professional."*

**P0 goes first** — ahead of all the CAD work — because it is small, it is on the screen the owner
opens every day, and none of it depends on anything else in this document.

#### D7 — `lib/work-mode/` is not the feature boundary, and deleting it would delete time tracking

Traced on 2026-08-15. The directory holds **two unrelated things**:

| Actually Work Mode — retire | Only *lives* in `lib/work-mode/` — must survive |
|---|---|
| `app/admin/work-mode/**` — the routes, drawer, role picker, and the five role workspaces (`field_crew`, `researcher`, `equipment_manager`, `tech_support`, `admin`, `developer`, `start`) | `clock-session.ts`, `clock-modals.tsx` — the clock the **site-wide top-bar pill** uses, on every admin page |
| `lib/work-mode/work-mode-store.ts` | `activity-tags.ts`, `use-activity-tags.ts` — also served by `/api/admin/activity-tags` |
| `app/admin/me/components/WorkModePrompt.tsx` and every entry-point button | The Quick Actions **Clock In/Out** tile |

**Clock-out POSTs to `/api/admin/time-logs`.** Those are payroll hours. A literal reading of "remove
all of the work mode functionality" — delete the directory — would remove time tracking from the
product and break the greeting banner the owner asked in the same breath to keep.

So: **retire the Work Mode destination; relocate clock + activity tags to `lib/time-tracking/`** so
the folder name stops implying a dependency that was never real.

#### D8 — The shell is disposable; the ten things inside it are not. Rehome, then delete.

**Owner decision, 2026-08-15: rehome first, then delete.** Nothing is lost.

The premise for retiring Work Mode — Quick Actions makes navigation fast — is exactly right about
the *shell*. It does not cover what the Field Crew workspace actually contains. Traced on
2026-08-15, `FieldCrewWorkspace.tsx` is **14 tabs**, and most have **no other entry point in the
product**:

| Capability | Alternative entry today |
|---|---|
| **Mileage capture** | ❌ None. The `mileage-tracker` hub widget reads `/api/admin/mileage?summary=1` — it *displays* a total and cannot record a trip. Mileage feeds financials. |
| **Job Instructions** (RPLS-authored, read + save) | ❌ None |
| **Field Notes**, **Job Media**, **Job Files** | ❌ None in this shell |
| **Field AI Assistant** | ❌ `/api/admin/work-mode/assistant` has exactly one caller |
| **Surveying Tools** (traverse / angle math), **Field Calculator** | ❌ None |
| Job picker, job summary, tap-to-call contacts | ✅ Reachable from the normal job pages |

So the deletion is **last**, not first. Each capability gets a home on a normal admin page or a hub
widget, and only then does the shell go.

| # | Slice | What it does |
|---|---|---|
| **C0a** | ✅ **DONE** — move clock + activity tags out of `lib/work-mode/` | `clock-session`, `clock-modals`, `activity-tags`, `use-activity-tags` → `lib/time-tracking/`, with their tests. Imports updated across `ClockInPill`, `HubGreeting`, the Quick Actions widget and `/api/admin/activity-tags`. It left `lib/work-mode/` holding exactly one file, which confirmed D7's split was the real boundary. |
| **C0b** | Rehome + **redesign** mileage capture — see D9 | Not a straight move: the owner has respecified it from odometer readings to addresses. Split into C0b1–C0b4 below. |

#### D9 — Mileage becomes address-based, and that is a new integration, not a rehome

> **Owner, 2026-08-15:** *"For mileage capture, I think I want to simplify. I just want it so that
> there is a manual capture. I want it so that we can put in the starting address and the job address
> and the distance will be calculated and then that will use the miles per gallon to calculate the
> cost as well. So all mileage tracking will just be manually entered for each job/trip."*

Today's capture is **odometer-based**: start reading, end reading, `resolveOdometerEntry` → miles →
dollars at `IRS_BUSINESS_RATE_2025`. The new design replaces the *input* (two addresses) and adds an
*output* (fuel cost from MPG). Three things it needs do not exist yet — checked on 2026-08-15:

| Needed | State today |
|---|---|
| Address → address distance | **Nothing.** No geocoding, no distance-matrix, no maps provider anywhere in `lib/` or `app/api/`. This is a new external integration with an API key and billing attached. |
| Miles per gallon | **No MPG field** on vehicles. Schema + seed. |
| Fuel price | No source. Either an org setting or a per-trip input. |

**The reimbursement question, which must not be answered by accident.** The IRS rate and a fuel-cost
estimate are different numbers for different purposes — one is what the firm reimburses and reports,
the other is what the trip actually cost in fuel. Quietly replacing the first with the second would
change what lands in the mileage report and downstream in `/admin/payouts/tax-report`.

**So both are kept:** distance still drives the IRS reimbursement exactly as it does now, and the
fuel cost is computed and stored *alongside* it. Nothing about the existing money path changes;
"calculate the cost as well" is served as an addition, and the owner can retire the IRS figure later
as a deliberate decision rather than a side effect.

| # | Slice | What it does |
|---|---|---|
| **C0b1** | Distance provider | Add the address→address distance integration behind one adapter, so the provider can change without touching the form. **Owner-gated: needs a maps API key and billing enabled.** Until it is, the form accepts a typed distance and the lookup is the enhancement — capture must not be blocked on a key. |
| **C0b2** | MPG on vehicles + a fuel price | Schema, seed, and the settings surface. Per-vehicle MPG, org-level fuel price with a per-trip override. |
| **C0b3** | The manual trip form, rehomed | Start address, job address, job, vehicle, date. Shows distance, IRS reimbursement **and** fuel cost before saving. Lives on a real page + the `mileage-tracker` widget gains capture, since the widget today can only read `?summary=1`. |
| **C0b4** | Retire the odometer path | Only after C0b3 is proven: remove `resolveOdometerEntry` capture from the UI, keep historical odometer-derived rows readable. Existing `mileage_entries` rows must not be orphaned by the new shape. |
| **C0c** | Rehome **job instructions** | Read + save, onto the job page where the rest of a job's detail already lives. |
| **C0d** | Rehome **field notes, job media, job files** | Same destination logic — these are per-job records and the job page is their home. Check for overlap with the existing files/media surfaces before building a second one. |
| **C0e** | Rehome the **field AI assistant** | Decide whether it survives as its own surface or folds into the existing admin AI entry point. `/api/admin/work-mode/assistant` gets renamed out of the work-mode namespace either way. |
| **C0f** | Rehome **surveying tools + field calculator** | Traverse/angle math already exists in `lib/cad` and the worker survey stack; check whether this is a third copy before moving it. |
| **C0g** | Retire the Work Mode destination | *Only now.* Delete `app/admin/work-mode/**`, `work-mode-store.ts`, `WorkModePrompt.tsx`, the `e2e/work-mode.spec.ts` and `__tests__/work-mode/**` suites, and the `WorkModeHarnessMount`. Remove the **7 route-registry entries** so the nav, ⌘K palette and the audit stop listing them, drop `/admin/work-mode` from `CHROME_BYPASS_PREFIXES` and the bundle-gate case, and remove every entry-point button **for all roles**. |
| **C0h** | Catch what pointed at it | Any remaining link, badge, notification target, or **saved custom Quick Action** whose href was `/admin/work-mode/*`. `resolveActions` drops unknown *ids*, but a custom link stores a raw href — it will 404 rather than disappear. |
| **C0i** | Verify time tracking survived | Clock in and out from the top-bar pill **and** the Quick Actions tile; confirm a `time_logs` row lands with the right hours, job and activity tags. Proves D7 was applied, not merely written down. |
| **C0j** | Greeting banner — restyle | `app/admin/me/components/HubGreeting.tsx`. Keep what it says (hello, the date, and the rest); make it friendlier and more appealing while staying professional. Desktop **and** mobile layouts, both designed rather than one reflowed. |
| **C0k** | Quick Actions — finish the editing UI | The model and editor shipped in A13 (`lib/hub/custom-quick-actions.ts` + the settings panel: label, destination from the route registry or any address, icon, colour, tooltip, add/edit/delete, href allow-list). What it still lacks: **reordering custom links against catalog ones is the only ordering control**, there is no duplicate, and the icon set is 16 fixed glyphs. Fill those in. |
| **C0l** | Widget editing — audit every widget's settings form | One pass over every registered widget: does its settings form expose everything its content model holds? The Quick Actions form is the reference for completeness. Produce the gap list before fixing. |
| **C0m** | Widget editing — close the gaps from C0l | |
| **C0n** | Widget editing on mobile | `lib/hub/components/MobileWidgetSettings.tsx` and `GridEditor.tsx` are separate surfaces from the desktop editor. Every capability available on desktop — add, remove, reorder, resize, configure — must be reachable on a phone. Drag-reorder and resize are the ones that typically have no touch equivalent. |
| **C0o** | Drive the hub end to end at both widths | Add a widget, configure it, reorder, resize, delete, add a custom Quick Action, click through to its page — at 1440 and at 390. The A13 pass found the Save button unclickable under the FAB dock and Escape not closing the options panel; neither was visible to any measurement. |

### P1 — Foundations: measure, then make it fast

| # | Slice | What it does |
|---|---|---|
| **C1** | Re-measure the frame budget | Reopen the perf overlay on a deliberately heavy drawing (≥5k features, ≥2k points). Record ms/frame while idle, while panning, while drawing, and while dragging a selection. **Output is a table of numbers in this doc**, not a fix. D2. |
| **C2** | Profile the render path against C1 | For whichever of the four states misses budget, find the actual cost. Suspects to confirm or clear: per-frame re-derivation, label layout, spatial index rebuilds, `linetype-renderer` dash generation, symbol re-rasterisation. |
| **C3** | Fix the top cost, re-measure, repeat until budget holds | One cost per commit, each with a before/after number. Stop when idle/pan/draw/drag all hold the budget. |
| **C4** | Large-drawing guard rails | Whatever C2 finds that is O(n) per frame gets a spatial or cached path so the editor degrades gracefully rather than falling off a cliff at some feature count. Record the count at which it used to fall over. |

### P2 — Layer management

| # | Slice | What it does |
|---|---|---|
| **C5** | Layer model audit | What a layer carries today (colour, visibility, lock?, print?, order?) vs what a surveying layer needs. Written up before any UI. |
| **C6** | Layer panel rebuild — the list | Search/filter, multi-select, drag-reorder, and per-layer state toggles that are all reachable without a context menu. |
| **C7** | Layer operations | Merge, split by code, move-selection-to-layer, isolate (show only this), and their inverses. Every one undoable as a single batch. |
| **C8** | Layer states / snapshots | Save a named set of layer visibilities ("field check", "client plat") and restore it. This is the feature that makes a deep layer list usable. |

### P3 — Point management

| # | Slice | What it does |
|---|---|---|
| **C9** | Point table rebuild | Sort, filter and multi-select over number / northing / easting / elevation / code / layer / description. Editable in place where the field is editable. |
| **C10** | Point selection ↔ canvas | Selecting rows selects on canvas and vice versa, including range selection by point number ("5-12") and by code. |
| **C11** | Point operations | Renumber, re-code, translate/rotate a set, derive points (midpoint, offset, intersection) — over the *selection*, undoable as one batch. |
| **C12** | Point import/export round-trip check | Confirm the formats already in `lib/cad/io` survive a round trip with codes, descriptions and elevations intact; fix what does not. |

### P4 — Drawing: click order and offsets

| # | Slice | What it does |
|---|---|---|
| **C13** | Write the click-order specification | One table: for each of the 51 tools — prompt text, click sequence, what Enter/Escape/right-click do, what the preview shows. D5. This is the artefact the next slices are tested against. |
| **C14** | Make the drawing tools match the spec | Fix every tool that deviates. Expect the deviations to cluster in the tools added last. |
| **C15** | A consistent command prompt | The status/command line always says what the tool wants next ("Select object to offset", "Specify through point"). A tool that is silent about what it wants is the root of "unintuitive". |
| **C16** | Offsets: preview and simplify | The numeric panels already accept exact values (P0 finding). Add live preview of the resulting geometry before commit, make side (left/right/both) obvious, and make the same interaction serve OFFSET and PERPENDICULAR. |
| **C17** | Snap feedback | Make the active snap and its type visible at the cursor at the moment it engages. Snapping the surveyor cannot see is snapping they do not trust. |

### P5 — Styles: lines, symbols, and the missing font system

| # | Slice | What it does |
|---|---|---|
| **C18** | Font system — the model | There is none today beyond `fontFamily: string`. Add a text-style concept (family, size, weight, slant, width factor) with a library, mirroring how line types and symbols already work. |
| **C19** | Font system — the editor and the picker | Pick and edit text styles anywhere text is placed, with a live sample. |
| **C20** | One style editor per axis, reachable from one place | Line type, symbol and text style each get an editor, and selected geometry routes to the right one. Today this is scattered. |
| **C21** | Library depth pass | Confirm the 40 line types and 48 symbols cover what a plat needs (survey, utility, topo, boundary); add what is missing. Deliberately *after* the editors, so gaps are added in the finished shape. |
| **C22** | Style by code | `lib/cad/codes` already maps codes to styles. Make the mapping editable in the UI and previewable, so a field code list drives the drawing's appearance. |

### P6 — Hide / unhide that behaves like one idea

| # | Slice | What it does |
|---|---|---|
| **C23** | Unify the visibility model | One `visibility(feature)` returning visible plus a *reason* when not. D3. Pure, tested, no UI. |
| **C24** | Hidden-items panel over the unified model | Every hidden thing in one list, grouped by reason, each with the exact control that will bring it back. |
| **C25** | Always-visible hidden count | A persistent indicator of how much is hidden, clickable to the panel. Removes the "where did my linework go" failure entirely. |
| **C26** | Isolate / unisolate as a first-class mode | Enter isolate on a selection or layer, and one obvious control to leave it — with the mode visible while it is on. |

### P7 — Calculations on lines and points

| # | Slice | What it does |
|---|---|---|
| **C27** | Inventory the calculators | What exists (`lib/cad/calculators`, curve, intersect, calc-point, inverse, closure, bowditch) against what a surveyor expects. Gap list. |
| **C28** | One calculation surface | The calculators are reachable from one predictable place, take the current selection as input, and write their result back as real geometry with provenance. |
| **C29** | Fill the gaps from C27 | Whatever the inventory says is missing. |
| **C30** | Show the work | Every calculated point/line can report how it was derived. This is what makes a calculation trustworthy in a survey deliverable, and it is what P8 needs to explain AI-authored geometry. |

### P8 — AI integrated with all tools and measurements

| # | Slice | What it does |
|---|---|---|
| **C31** | Merge the two AI action vocabularies | `tool-registry.ts` wins; `drawing-chat`'s ops adapt onto it. D4. **Highest risk in the doc; first in the phase.** |
| **C32** | Selection as AI scope | "Do this to *these*" — the current selection (points, features, or a whole layer) is an explicit, visible scope on the AI panel, not something inferred from a prompt. Extends the `selection-points.ts` path that today serves only two dialogues. |
| **C33** | Layer as AI scope | Same, for "everything on this layer". |
| **C34** | Extend AI reach: drawing tools | The DRAW_* family becomes AI-callable. Counts toward the 51 denominator. |
| **C35** | Extend AI reach: modify tools | MOVE/COPY/ROTATE/MIRROR/SCALE/ARRAY/TRIM/EXTEND/FILLET/CHAMFER/JOIN/SPLIT and the vertex operations. |
| **C36** | Extend AI reach: measurement + annotation | INVERSE, MEASURE_AREA, DIM, LIST, DRAW_TEXT — "AI integrated with all measurements". |
| **C37** | Every AI action is one undo | An AI request that touches forty features reverses in one step. The batch machinery exists (`lib/cad/ai/undo-batch.ts`); this slice proves it holds for the newly-reachable tools. |
| **C38** | Preview before apply | AI-proposed geometry is shown as a proposal that can be accepted or rejected. `lib/cad/ai/proposals.ts` and `sandbox.ts` exist — this extends them across the new reach. |
| **C39** | Reach measurement | Report tools-reachable-by-AI ÷ 51 as a number, and keep a test that fails when a new tool is added without an AI path. Claim 1 of D1, made permanent. |

### P9 — Carried over from other planning docs

Pulled here so the work is in one queue. Each keeps its original doc as the reference.

| # | Slice | What it does |
|---|---|---|
| **C40** | Payroll **S9c** | Close `POST /api/admin/payroll/runs` once nothing unique lives behind it; keep `GET` and `PUT`. From `pending/PAYROLL_HOURS_AND_EMPLOYEE_MONEY_2026-08-12.md`. |
| **C41** | Payroll **S8** — auto-transfer | **Owner-gated.** The doc's own condition is "a ledger that has been reconciling in production for a while first". Do not build until the owner says the ledger has. |
| **C42** | Research platform **S-8** | Next slice of the research buildout; read `HANDOFF` first per that doc. |
| **C43** | Mobile background uploads — runtime wiring | Pure logic shipped and tested; the device-runtime wiring is owner-device-tested. **Owner-gated.** |

> **Not pulled in:** `pending/DND_SYSTEMS_UNDER_CONSTRUCTION.md` and
> `pending/SETTINGS_PER_SYSTEM_RULES_VARIANTS_2026-07-22.md`. Both were **parked by explicit owner
> directive on 2026-07-26**. Un-parking them is an owner decision, not a consolidation side effect —
> so they are named here and left where they are.

### P9b — Every surfaced integration point actually works, and says what it does

> **Owner, 2026-08-15:** *"Please make sure that every integration point that is surfaced is fully
> fleshed out and works as intended. Please review them and make sure there is good documentation
> and that everything works as it should."*

This phase exists because **"authored but not wired" is this codebase's most common defect** — it is
recorded as such in the project's own working memory, and it has bitten in a specific, repeatable
way: the Phase I survey stack once shipped **nine slices with zero callers**, `/admin/payroll`
rendered two buttons and an error message as bare text because it styled them from a stylesheet it
never imported, and the D&D pass found three rendering-condition bugs behind a 15,000-test green
suite. A green suite does not prove a surface is reachable.

An integration point is **surfaced** if a user can see it, or another system can call it. Each one
is done when it has: a caller, a failure path, and a sentence saying what it is for.

| # | Slice | What it does |
|---|---|---|
| **C44z** | **`fieldbook_notes` is a name collision, and the job manifest still cannot read notes** | Found in C0d. `/api/admin/jobs/[id]/field-data` queries `fieldbook_notes` for `body, note_template, structured_data, data_point_id`. The live table of that name is the **learn** notes table (`title`, `content`, `module_id`, `lesson_id`, …), and **no seed in this repo ever created the shape the query expects**. The route now degrades and reports `unavailable: ["notes"]` instead of 500ing, so nothing is blocked — but a job's fieldbook notes are unreadable until somebody decides whether that table should exist separately or the query should target the real one. A schema decision, not a bug fix. |
| **C44a** | Enumerate the integration points | Build the actual list before checking any of them — CAD import/export formats (`lib/cad/io`, `lib/cad/import`, `lib/cad/export`), delivery (`lib/cad/delivery`), external integrations (`lib/cad/integrations`), the AI providers, and every API route the CAD surface calls. **The list is the deliverable**; the previous pass proved that fixing before reading wastes half the effort. |
| **C44b** | Orphan check — is anything authored but never called? | For every module in the C44a list, find its caller. Anything with none is either wired up or deleted, and which one is a decision that gets written down. `__tests__/lib-orphan-ratchet.test.ts` already exists for this shape — extend it to cover the CAD surface so the answer stays true. |
| **C44c** | Drive each surfaced integration end to end | Not "does the function work" but "can a person reach it and does it do the thing". Import a real file, export it, round-trip it, run a delivery, invoke each AI provider path. Record what actually happened. |
| **C44d** | Failure paths | Every integration gets a deliberate failure (bad file, missing key, network error) and must fail *legibly* — an error a surveyor can act on, not a blank panel or a silent no-op. This is where the "queued ≠ failed" class of bug lives. |
| **C44e** | Documentation pass | One reference doc covering each integration: what it is, what it expects, how it fails, and which env vars or owner-set values it needs to be live. Env-gated integrations get their gate named explicitly, because "configured" and "working" have been confused here before. |

### P10 — The closing mobile styling/formatting sweep

Runs **last**, over everything the phases above built. Explicitly requested.

| # | Slice | What it does |
|---|---|---|
| **C44** | Full re-sweep at 1440 and 390 | `scripts/ui-align-audit.mjs` over all routes at both widths. Fix every non-CAD finding to 0; CAD holds at its accepted 2. |
| **C45** | Drive the new surfaces on a phone | The audit cannot see a Save button under a dock or an Escape that does nothing (D5b of the previous doc). Every panel, editor and dialog built in P2–P8 gets driven at 390px. |
| **C46** | Functional sweep | `scripts/qa-sweep.ts` over all routes: nothing throws, no failed same-origin request, no error prose, no overflow. |
| **C47** | Green gate | `tsc`, `next lint`, `npm run build`, and the full vitest suite. `npm run build` is non-negotiable — it has been broken while tsc and 21k tests were green. |

### P11 — Closeout: seeds applied, then merged

> **Owner, 2026-08-15:** *"Once you are done auditing everything, fixing every issue you find, and
> you have completed all of the requests I have made, please make sure that all sql seed files have
> been applied to the supabase database, and also make sure that the changes get pushed and merged
> to main at the end."*

Runs **after P10**, and only after it. Nothing here is safe to do early: seeds applied against a
half-built schema and a merge of half-finished work are both hard to walk back.

| # | Slice | What it does |
|---|---|---|
| **C48** | Reconcile seeds against the live database | Establish which seed numbers the live DB has actually had applied, versus what is in the repo. The count is the deliverable — **do not apply anything yet.** The project's recorded method: apply with node-pg + `SUPABASE_DB_URL` (the CLI paths fail on this setup), verify through PostgREST with the service key. |
| **C49** | Apply the outstanding seeds | Apply in order, verifying each. A seed that is already applied must be recognised as such rather than re-run — several seeds in this repo are not idempotent. |
| **C50** | Verify against the live schema | Confirm the tables, columns and rows the seeds were supposed to create are actually there, through PostgREST rather than by trusting the apply step's exit code. |
| **C51** | Green gate before merge | `tsc`, `next lint`, `npm run build`, full vitest suite, and the alignment audit at both widths. `npm run build` has been broken in this repo while tsc and 21k tests were green — it is the one that catches client/server boundary breakage. |
| **C52** | Push and merge to main | **Owner instruction 2026-08-15 supersedes the standing PR-workflow preference for this initiative.** `gh` is not installed here, so if a PR is wanted instead, supply the compare URL. Confirm with the owner immediately before merging — this is the one irreversible step in the document. |

---

## Ledger

| Slice | State |
|---|---|
| **A14** CAD narrow-width (prerequisite, done) | ✅ Committed `140e37463`. 390px **28 → 2**; 1440px unchanged at 2. Three defects, not 28: both bars were non-wrapping flex rows (Save/Exit up to 156px off-screen, status strip 463px off); `overflow-hidden` on the status bar was clipping the snap popover **at every width, desktop included**; and docked panels claimed 436px of a 390px screen, leaving the canvas **zero width**. Fixed by wrapping (not `overflow-x: auto`, which would have clipped the same popovers) and by floating the docks over the canvas below 900px. |
| C0a Move clock + tags to `lib/time-tracking/` | ✅ `642349b39`. Pure move + import rewrites; tsc clean, 52 tests pass. Left `lib/work-mode/` holding one file, confirming D7's boundary. |
| C0b1 Distance provider (address→address) | ⬜ **owner-gated: maps API key + billing** |
| C0b2 MPG on vehicles + fuel price | ✅ Seed **592** (`vehicles.mpg`, seven additive columns on `mileage_entries`, an `app_settings` `mileage` row defaulting to 389¢/gal), `lib/mileage/fuel.ts` + 15 tests, and MPG wired through the vehicles API and form. **Additive by design** — `rate_cents_per_mile`/`total_cents` are untouched, so reimbursement and the tax report are unaffected (D9). Two things worth carrying forward: an unknown MPG returns `null`, never `0`, because "cannot estimate" and "cost nothing" must not render alike; and `/api/admin/settings` keys are a **whitelist**, so a seeded section that is not added there reads back fine and silently 400s on save. Historical rows were stamped `distance_source='odometer'` rather than left ambiguous. |
| C0b3 Manual trip API — **and the bug it exposed** | ✅ API half done. **Manual mileage capture had never worked.** The route wrote `total_cents` (GENERATED ALWAYS, seed 282) and `source: 'odometer'` (not in the CHECK constraint) — Postgres rejects both, so every save 500'd and `mileage_entries` held **0 rows in production**, confirmed against the live DB. Verified by round-tripping the old and new insert shapes in a rolled-back transaction: old → `cannot insert a non-DEFAULT value into column "total_cents"`, new → OK with `total_cents` computed to 2848. Route now takes a distance **or** odometer readings, snapshots MPG + fuel price, and records `distance_source`. Seed 592 applied live. **`__tests__/mileage/manual-mileage-route.test.ts` was asserting both bugs as requirements** and stayed green throughout — corrected, with a note on why a source scan cannot see a constraint violation. Form UI is the remaining half → C0b3b. |
| C0b3b Manual trip **form** UI, rehomed | ✅ `app/admin/mileage/LogTripForm.tsx` on `/admin/mileage`. **A third dead end in the same feature:** the hub widget's "Log a trip →" pointed at this page, and the page was a read-only GPS report with no form — so the CTA led nowhere you could log anything (it previously pointed at `/admin/me?tab=mileage`, which silently reloaded the Hub). Now true. Preview uses the **same `estimateTripFuel` the API uses**, so the screen and the row cannot diverge. **Driven end to end against the live DB:** 42.5 mi → 201, `total_cents` 2975 computed by Postgres, fuel 894¢ from 2.3 gal at 18.5 mpg × 389¢, `mpg_snapshot`/`fuel_price_cents` both captured; test rows and the temp vehicle deleted, 0 rows remaining. An unknown mpg renders "pick a vehicle with an mpg", never `$0.00`. Alignment audit 0 at 1440 **and** 390. |
| C0b4 Retire the odometer capture path | ⬜ |
| C0c Rehome job instructions | ✅ `app/admin/components/jobs/JobInstructionsPanel.tsx`, on the job detail page's **Field Work** tab — instructions belong to a job, not to a shell, and Field Work is who they are addressed to. The API was always job-scoped (`/api/admin/jobs/[id]/instructions`), so nothing server-side moved. **Round-tripped against the live DB on job 2026-0001:** GET 200 → PUT 200 (`brokenRefs: []`) → re-GET returned resolved segments → restored to the original empty value. `canEdit` honoured. A `job-file:` reference whose file is gone still renders a visible "missing" chip rather than a dead link — a crew needs to know the thing they were told to look at no longer exists. Alignment audit 0 at 1440 and 390. |
| C0d Rehome field notes / media / files | ✅ **Checking first showed only ONE of the three needed moving.** Job **files**: Work Mode listed the same endpoint the job page's Files tab already uploads/deletes/attaches through — strictly superior, nothing to move. Job **media**: genuinely uncovered, so `JobFieldMediaPanel` now sits on the Field Work tab. Field **notes** were `localStorage`-only, never synced → see C0d2. Fixing the panel's dependency exposed **two more live defects** (below); route now returns **200** with `unavailable: ["notes"]`. Alignment 0 at 390. |
| C0d1 `jobs` geofence columns — **the migration nobody wrote** | ✅ Seed **593**, applied live. `jobs.centroid_lat`, `centroid_lon`, `geofence_radius_m` are read by four code paths and **no seed ever created them** — seed 227's header even describes them as already populated. `/api/admin/jobs/[id]/field-data` returned `column jobs.centroid_lat does not exist`; the geofence endpoint and `/admin/timeline`'s "Set as job site" could never persist. Deliberately NOT reusing `jobs.latitude/longitude`: that is the geocoded address, while the centroid is an anchor the crew sets from where they stood. |
| C0d2 Field notes — **deferred, with the reason** | ⬜ **Deferred.** The Work Mode field-notes tab wrote to `localStorage` keyed by job and never synced to the server, so nothing durable exists to migrate and no other user could ever see one. The job page already carries `jobs.notes` and a Messages tab for notes that need to survive a device. Building a *new* per-job scratchpad is not what retiring Work Mode requires — but the old one should not be silently dropped either, so it is recorded here for an explicit owner call. |
| C0e Rehome the field AI assistant | ✅ Route moved `/api/admin/work-mode/assistant` → **`/api/admin/field-assistant`** (a path naming a shell that is going away is a comment that has started lying), and it gained a home as the **Field Assistant hub widget** — a personal utility like the calculator and mileage tracker, on the surface the owner is consolidating onto. Verified live: new path 200 with a correct answer (*"N30°E → back-azimuth 210°, S30°W"*), old path 404. **Three repo enforcement tests caught what I had missed** — `widget-options.ts` needs a registry entry AND a `settings-form` entry, and every widget must reach 1×1 (Slice 217). Exactly the "authored but not wired" guard, working. 2,015 hub/ai tests pass. |
| C0f Rehome surveying tools + calculator | ✅ **The duplication check said port it, for two reasons.** `lib/surveying/calculator.ts` holds **16 named operations** (bearing↔azimuth, angle arithmetic, triangles/trig, latitude & departure) with **exactly one consumer** — the Work Mode shell. It is *not* a third copy: CAD's `calculators/` is a generic four-function state machine for its own modal, and CAD's curve/closure/inverse tools work on drawing geometry, not typed numbers. Separately, dropping the arithmetic pad would have orphaned `lib/jobs/calc.ts`, which `__tests__/lib-orphan-ratchet.test.ts` actively tests for. So **one** `surveying-calculator` widget carries both modes — "work out a number in the field" is one job, and a surveyor shouldn't have to know which tile does bearings and which does multiplication. 1,936 hub tests pass; alignment 0 at 390. |
| C0g Retire the Work Mode destination | ✅ **Deleted — 29 files, 2,545 lines.** Routes, drawer, role picker, seven role workspaces, `work-mode-store`, `WorkModePrompt`, the e2e spec, the harness mount and the `__tests__/work-mode` suites; plus the **9 route-registry entries**, the `CHROME_BYPASS_PREFIXES` entry and the bundle-gate case. Verified on a clean production build: **all four Work Mode paths 404, all rehomed surfaces 200**, and the build output contains zero work-mode routes. Four judgement calls are recorded below rather than made silently. Full suite **23,956 passing**, `tsc`/`lint`/`npm run build` clean. |
| C0g1 `work-mode-eligibility` → `clock-eligibility` | ✅ The predicate never meant "can enter Work Mode" — it means **"is this person staff who work shifts"**, and its surviving caller is the site-wide clock-in pill. Deleting it with the shell would have removed the clock from every admin page. Moved to `lib/time-tracking/clock-eligibility.ts` as `isClockEligible`, semantics untouched, with a test pinning the seven roles because that set now gates **payroll hours**. |
| C0g2 `lib/jobs/crew.ts` deleted | ✅ Genuinely dead once the shell went — the orphan ratchet caught it, which is what it is for. Removed with its test rather than parked in `KNOWN_ORPHANS`. |
| C0g3 The rail-scannability test measured the wrong quantity | ✅ Removing 9 routes (8 of them `showInRail: false`) left the railed count **identical** but pushed the *ratio* past its 0.75 bound — the metric failed because its denominator shrank. A proxy that fails when the thing it proxies for is unchanged is measuring the wrong quantity, so it now asserts the **absolute** railed count, which is what the test's own comment argued for ("a rail with 126 items is a rail nobody scans"). |
| C0g4 Two verification traps, both self-inflicted | ✅ Recorded because they nearly produced a false "verified": (1) `next build` while `next dev` is running **corrupts `.next`** — they share it — so the served app 500s on every route while the build reports success; (2) a failed `next start` leaves a **zombie socket**, and probing that port returns the *previous* build's answers. The first pass reported 200s for deleted routes for exactly this reason. Stop the dev server, clear `.next`, rebuild, use a fresh port. |
| C0h Catch what pointed at it | ✅ **Checked the live database first: nothing was pointing at it.** All three `user_hub_layouts` rows are clean and `user_bookmarks` is empty, so no saved Quick Action, pinned page or bookmark 404s today. But the *mechanism* is real and permanent — `resolveActions` drops a retired catalog **id**, while a custom link stores a raw **href** and keeps rendering after its page is gone. So `isKnownInternalHref` now flags such a link in the settings panel. **Flags, never auto-removes:** the check cannot tell a dead link from a page simply absent from the registry, and deleting somebody's shortcut on that evidence is worse than the dead link. Query strings, fragments and dynamic children (`/admin/jobs/<id>`) all pass; the prefix guard stops `/admin/work` vouching for `/admin/work-mode`. Also corrected three comments that still described the shell as live — **`lib/auth-roles.ts` was deliberately left alone**, because it is a record of a real past build failure and rewriting its import chain would falsify history. 23,962 tests pass. |
| C0i Verify time tracking survived | ✅ **Proved against the live database, then made durable.** Hand-run on the clean production build: `/api/admin/activity-tags` → **200** with 28 tags (the moved catalog works), the exact clock-out payload both surfaces send → **201**, and the row landed in `daily_time_logs` with the right hours, date and email — then deleted. That proved the path on the day; `__tests__/time-tracking/clock-surfaces-wired.test.ts` is what keeps it true, because the risk was never that today's code is wrong but that a later refactor quietly re-points one surface and **nobody notices until payday**. It pins: no clock surface imports `lib/work-mode`, the pill and the Quick Actions tile share the *same* clock module (two clocks would let someone read as clocked-in on the hub and clocked-out in the top bar, with only one writing hours), the greeting still reports clock state, and both surfaces still POST to `/api/admin/time-logs`. Its own header records what a source scan **cannot** see — the `manual-mileage-route` lesson. |
| C0j Greeting banner restyle (desktop + mobile) | ✅ **Two of the three changes were repairs, not taste.** (1) The card was a two-column layout with an absolutely-positioned CTA; C0g deleted the button and left a **`padding-right: 14rem`** reservation guarding nothing — the third appearance of the defect this stylesheet's own M5 and U-7 notes describe. (2) **`.hub-greeting__clock-dot` was rendered by the component and styled nowhere at all** — only the deleted `work-mode-prompt` variant had rules, so the status dot has been an invisible empty span since it shipped. (3) The restyle itself: single left-aligned column, warmer three-stop gradient with a soft highlight, `clamp()` type so the heading scales instead of stepping at 640px, and the clock line promoted from grey text into a **status chip**. Date + chip share a row when there is width — desktop went **201px → 167px** of mostly-empty gradient. Deleted ~155 lines of dead CTA CSS and a 50-line mobile block that existed solely to manage it. **Screenshotted at 1440 and 390**, no overflow at either; alignment audit 0 at both; 23,947 tests pass. Three test files were rewritten rather than deleted — the CTA assertions became a guard on the *class* of bug their header identified (a mobile override inheriting a `position` it was not written for), which now cannot recur because no child of the card is absolutely positioned. |
| C0k Quick Actions — finish the editing UI | ✅ Three gaps closed, one of them not on the original list. **Duplicate**: the links a surveyor makes come in families (one page with four query strings, or one page tinted per crew) and without it the fifth is retyped and quietly diverges — `duplicateCustomAction` copies destination, icon, tint and tooltip, takes a fresh id, and caps the "copy" label so two tiles can never read identically. **Icons 16 → 60, in 7 labelled groups** mirroring the route registry's workspaces, because someone picking an icon already knows the *category* of what they are linking to; the flat list is now derived from the groups so the two cannot drift, and ★ ✓ ✎ are kept deliberately as the only glyphs the tint reaches (colour emoji ignore `color`). **Delete now asks first** — it was one irreversible click on a handful of typed fields with no undo anywhere in the hub, and the confirming id is held once for the whole list so two armed delete buttons can never coexist. 35 unit tests. **Verified in the browser as far as this slice can:** hub renders with no page errors and the catalog lists both new widgets — the per-widget options panel needs hover/edit-mode interaction to reach, which is C0o's job and is not claimed here. |
| C0l Widget settings completeness audit | ✅ **`scripts/widget-settings-audit.mjs`** — 54 widgets, set-differencing each `DEFAULTS` content model against what its options panel actually exposes (its own form, a declarative schema, or `none`). **Result: 47 complete, 6 deliberate `none`, and exactly ONE real gap** — `recent-activity.includeTypes`, which the widget reads to decide whether to show recent routes and the form never offers. The editing surface was in far better shape than assumed. **Three instrument corrections were needed to get there, and the first two produced spectacular false gap lists** — (1) the brace-walk started at the parameter destructuring `{ value, onChange }` rather than the function body, reporting *all 54* widgets as missing *every* key; (2) it keyed on directory name, but `equipment-out/` registers as `equipment-out-today`; (3) a non-greedy regex for registry entries ended at the first nested field object, so `daily-briefing`'s perfectly good schema read as absent. Each is D6b again: *read the findings before fixing any of them.* The 6 `declared-none` are honest — `widget-options.ts` says so in comments — but a `showOpenLink` the user cannot reach is still a setting they cannot reach, so they are surfaced as a decision to confirm rather than counted clean. Evidence: `qa-evidence/widget-settings-audit.json`. |
| C0m Close the widget settings gaps | ✅ **48 complete, 0 gaps.** The one gap was closed by *removing* the setting, not by adding a control — and the reasoning is the point. `ActivityType` had exactly one member, so a checkbox for `includeTypes` would have had one "off" state: **render an empty widget**. A control labelled, in effect, *"show nothing"*, when removing the tile already does that better. It was a placeholder — the form's own note said "activity log integration lands in a follow-up slice", and that follow-up shipped as the separate `activity` widget which supersedes this one. The key outlived the plan it was reserved for, the same shape as C0j's `padding-right: 14rem`. Verified safe before removing: no external consumer, and **no live hub layout stores it or even has the widget**. Made permanent by `__tests__/hub/widget-settings-reachable.test.ts`, which runs the audit and fails on any new gap — the failure is silent by construction (a widget reads `settings.foo`, nothing offers `foo`, nothing errors), so zero is worth pinning. The 6 deliberate `none` widgets are listed *by name* in that test, so quietly downgrading a widget to `none` to silence it shows up as a diff rather than a pass. |
| C0n Widget editing on mobile | ✅ **Four of the five capabilities were already there; height was not.** A phone gets a *different* editor — `MobileEditor` replaces `GridEditor` wholesale, because an 8-column drag-and-drop grid painter is unusable on a touch screen — and replacing a surface wholesale is exactly how a capability goes missing unnoticed: nothing errors, the sheet looks complete, and the only symptom is a thing you cannot do on a phone. Reorder (dnd-kit + touch sensors), add, remove and configure were covered, the last by `MobileWidgetSettings` reusing the *same three resolution paths* as desktop. **Width has no phone equivalent** — the stack is one column and `mobileSizeOverride` forces the rendered width to 2 for bucket maths regardless — but **height decides how much of a widget you see**, and a phone-only user was stuck with whatever had been set at a desk. Added a stepper (buttons, not a grip: a 40px row cannot host a resize handle distinguishable from the reorder grip beside it), 32px to clear the contract's interactive floor, **clamped to each widget's own `minSize.h`/`maxSize.h`** so a phone cannot produce a size the desktop grid would reject, writing through the *same* `setDraftWidgets` the grid painter uses. It moves **only `h`** — x/y/w are the desktop arrangement, and this sheet exists precisely because that arrangement is not visible on a phone. 11 parity tests. |
| C0o Drive the hub at 1440 + 390 | ✅ **Driven for real at both widths with Playwright.** Desktop: the two A13 defects stay fixed — Save is genuinely clickable (`elementFromPoint` at its centre returns the button, not the FAB dock covering it) and Escape closes the sheet. Phone: the customize sheet renders 6 rows, **the C0n height stepper actually works** (tapped *taller*, height went 2 → 3), buttons measure 32×32, Save sits on-screen and uncovered, and the page does not scroll horizontally. Quick Actions' editor is fully reachable from the phone sheet — added a link, it appeared in the list, and C0k's Duplicate and Delete controls are both present with the icon groups rendering. **One finding, and re-probing turned it into a smaller but real one.** "Add link" measured 1,314px down, which read as off-screen — but `.hub-msheet__body` scrolls, and after scrolling the button is clickable with `BUTTON` at its centre, so it was *not* the unreachable-Save defect. It was friction I introduced in C0k: a commit button behind sixty icons is a form people abandon. The row is now `position: sticky` — **780px, in the viewport with no scrolling at all** — and `sticky` not `fixed`, so a desktop panel that fits keeps it in normal flow. Alignment 0 at both widths; 23,971 tests pass. |
| C1 Re-measure frame budget | ✅ **Measured, no code changed** (D2). Full table in `qa-evidence/cad-frame-budget-2026-08-15.md`. Budget 16.7ms; `renderAll` p95 — **1k: 4.9ms · 50k: 11.1ms · 200k: 66.9ms (pan), max 136.7ms**. Four things it settles: (1) **the budget holds comfortably to 50,000 features** — 1.5× headroom at the size a real drawing reaches, so there is no performance problem in the range the product is used in; (2) **it breaks between 50k and 200k, worse than linearly** — 4× the features for 6× the frame time, so a knee exists in that range (C4 wants the exact count); (3) **`renderFeatures` is the cost** at 19.1ms p50 of a 28.7ms frame, but its **127.8ms p99 is a different phenomenon from its median** — a periodic stall, and a fix aimed at the median could leave the stutter untouched; (4) **the old 269→25ms figure has not rotted** — Large idle measures 24.8ms today, exactly where that pass left it. D2 was right to distrust a year-old number and wrong about the direction: C2–C4 are about raising the ceiling, not recovering lost ground. Labels are a steady secondary cost (6–9ms, ~25% of frame). |
| C2 Profile the render path | ✅ **One line is 78% of the render path.** `renderFeatures` opens by building `new Set(visibleFeatures.map(f => f.id))` — `getVisibleFeatures()` itself is reference-cached (the S2 fix, still working), but this derived Set is not, so a 200k string array and a 200k hash set are allocated and discarded **every frame regardless of what the camera did**. Instrumented with a nested `cullIdSets` marker rather than reasoned about: **Large pan p50 16.2ms of `renderFeatures`' 20.9ms (78%); Medium 3.3 of 4.6 (72%)**, scaling 4× for 4× the features — exactly C1's curve. **It explains both of C1's findings with one cause**: allocation + hashing gives the median, and churning ~400k objects per frame gives the GC pause that appears as the 127.8ms p99 (`cullIdSets` p99 alone is 39.7ms against its 16.2ms median). The defect is one of *scale mismatch* — the only consumer asks `has(id)` for ids in `pixi.featureGraphics`, which holds roughly what fits on screen, so **the set is built at the scale of the document to answer questions at the scale of the viewport**. Same shape as the bug S2 fixed. `culledIds` is viewport-sized and is **not** the target — measuring stopped that being assumed. Profile in `qa-evidence/cad-frame-budget-2026-08-15.md`. |
| C3 Fix top cost, repeat | ⬜ |
| C4 Large-drawing guard rails | ⬜ |
| C5 Layer model audit | ⬜ |
| C6 Layer panel — the list | ⬜ |
| C7 Layer operations | ⬜ |
| C8 Layer states / snapshots | ⬜ |
| C9 Point table rebuild | ⬜ |
| C10 Point selection ↔ canvas | ⬜ |
| C11 Point operations | ⬜ |
| C12 Point import/export round-trip | ⬜ |
| C13 Click-order specification | ⬜ |
| C14 Tools match the spec | ⬜ |
| C15 Consistent command prompt | ⬜ |
| C16 Offsets: preview + simplify | ⬜ |
| C17 Snap feedback | ⬜ |
| C18 Font system — model | ⬜ |
| C19 Font system — editor + picker | ⬜ |
| C20 One style editor per axis | ⬜ |
| C21 Library depth pass | ⬜ |
| C22 Style by code | ⬜ |
| C23 Unify the visibility model | ⬜ |
| C24 Hidden-items panel | ⬜ |
| C25 Always-visible hidden count | ⬜ |
| C26 Isolate as a mode | ⬜ |
| C27 Inventory the calculators | ⬜ |
| C28 One calculation surface | ⬜ |
| C29 Fill calculator gaps | ⬜ |
| C30 Show the work | ⬜ |
| C31 Merge AI vocabularies | ⬜ |
| C32 Selection as AI scope | ⬜ |
| C33 Layer as AI scope | ⬜ |
| C34 AI reach: drawing tools | ⬜ |
| C35 AI reach: modify tools | ⬜ |
| C36 AI reach: measurement + annotation | ⬜ |
| C37 AI action = one undo | ⬜ |
| C38 Preview before apply | ⬜ |
| C39 Reach measurement + guard test | ⬜ |
| C40 Payroll S9c | ⬜ |
| C41 Payroll S8 auto-transfer | ⬜ **owner-gated** |
| C42 Research S-8 | ⬜ |
| C43 Mobile background uploads wiring | ⬜ **owner-gated** |
| C44z fieldbook_notes name collision (schema decision) | ⬜ |
| C44a Enumerate integration points | ⬜ |
| C44b Orphan check + ratchet | ⬜ |
| C44c Drive each integration end to end | ⬜ |
| C44d Failure paths are legible | ⬜ |
| C44e Integration documentation pass | ⬜ |
| C44 Full re-sweep 1440 + 390 | ⬜ |
| C45 Drive new surfaces at 390 | ⬜ |
| C46 Functional sweep | ⬜ |
| C47 Green gate | ⬜ |
| C48 Reconcile seeds vs live DB | ⬜ |
| C49 Apply outstanding seeds | ⬜ |
| C50 Verify against live schema | ⬜ |
| C51 Green gate before merge | ⬜ |
| C52 Push + merge to main | ⬜ **confirm with owner first — irreversible** |

---

## Working notes for whoever picks this up

1. **`MSYS_NO_PATHCONV=1` on every audit invocation.** Without it Git Bash rewrites `/admin/cad`
   into a Windows path and the run reports one bogus `load` finding — which looks exactly like a
   broken page.
2. **Never edit source while a sweep is running against a dev server.** Next recompiles and the
   sweep records fake 500s. Run long sweeps against `npm run build && next start` on a separate
   port; a production server is immune to edits.
3. **A JSX comment cannot sit beside the root element of a `return (`** without a fragment. This
   cost one bogus 500 and a "findings=0" that looked like success during A14.
4. **Re-probe before believing a finding.** A 500 with `findings=0` is not a clean page; it is a
   page that never rendered.
5. **Read the findings before fixing any of them.** In the previous pass roughly half of every
   opening number was the instrument. The 28 CAD findings fixed in A14 were 3 real defects.
6. **Drive the surface, don't only measure it.** The snap-popover clip found in A14 was invisible to
   all six audit rules at every width — it was found by reading the CSS, and it had been shipping.
