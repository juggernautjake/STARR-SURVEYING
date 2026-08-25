# Designs that actually serve, and a view for every tab

**Status:** planning · written 2026-08-24 · no code written yet
**Companion to:** `PAGE_CONSOLIDATION_2026-08-24.md` — the two are one system, see §5.

> **How to run a slice.** Pick the top unchecked `- [ ]`. Ship it, verify it in a browser, tick it
> with what you actually did — including what you decided *not* to do and why.

---

## §0. What was asked for

> *"We have the page editor that is supposed to help us keep track of and build pages and edit pages
> and make new versions of pages and stuff. We need all of the changes that we are making to be
> reflected there too. Also, I want it so that each page that has tabs and things that close elements
> and reveals different info and stuff has its own like, sub page listed. Basically, we will have the
> main page, and then it will have multiple views available for each toggled option so that I can edit
> each one individually if needed. I also need a way to totally design pages and set them as the page
> for the different routes. Please consider what I am needing and find a way to build it all out and
> make it useful so that I have full control over the pages and their view and style and formatting
> and functionality."*

Three requests:

1. **The designer must not go stale** as the consolidation moves pages around.
2. **A tab is a view, and every view needs its own editable entry** — not one design per route.
3. **Design a page and set it as the page for a route.**

---

## §1. I told you (3) was impossible. I was half wrong, and the half I was wrong about is the half that matters

`completed/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md` §1 says, in bold: *"Themes can be served
for real. Layouts cannot."* The reasoning was that a design is absolutely-positioned catalogue
elements on an artboard, `/admin/jobs` is a React component that authenticates and fetches and
writes, and serving the design **as** that route would replace a working page with a picture of one.

**That is still true of an artboard.** It is not true of this product, because this product already
serves a user-designed layout on a real page, and has for months.

### `/admin/me` is the counter-example, and it is not a small one

| | |
|---|---|
| Storage | `user_hub_layouts.widgets` — `[{ id, type, x, y, w, h }]` on an 8×12 grid |
| Rows today | 3 saved layouts · `design_mockups` holds 468 designs for comparison |
| Widgets available | **54** registered via `defineWidget()`, 36 of them role-gated |
| Editor | `lib/hub/components/GridEditor.tsx` — palette, click-to-place, select, resize, delete |
| Served? | **yes.** That arrangement IS the page |

And `WidgetDefinition` already carries every field this needs:

```ts
id, label, description, category, iconName
defaultSize / minSize / maxSize
allowedRoles: UserRole[]        // ← role-aware rendering, already built
requiresBundle?: BundleId       // ← entitlement, already built
Widget: ComponentType<…>        // ← the LIVE component, not a picture
SettingsForm?, Skeleton?
```

### So the real distinction is not "design vs page". It is what the design HOLDS

| | Design studio artboard | Hub layout |
|---|---|---|
| The unit | a catalogue element | a **widget** |
| What it is | a rectangle with remembered styles — a picture | a live React component |
| Has data? | no | yes, its own fetch |
| Has actions? | no | yes |
| Role-aware? | no | `allowedRoles` |
| Can be served? | **no, and never** | **yes, and is** |

**The page designer and the hub grid are two editors for the same idea, built a year apart, that do
not know about each other.** One can arrange anything and serve nothing; the other can serve
everything and only exists on one route.

That is the whole plan: converge them.

---

## §2. What "design a page and serve it" can honestly mean

Three kinds of control, and being straight about which is which is what keeps this buildable.

| Kind | What you control | Can it serve? | Status |
|---|---|---|---|
| **Theme** | colour, density, font scale | **yes, today** | shipped — 11 palettes, `ShellTheme` |
| **Composition** | which panels a view holds, where, how big, who sees them | **yes** — this is the hub's mechanism | exists for ONE route |
| **Bespoke internals** | the inside of `/admin/jobs/[id]`'s 8,734 lines | **no** | and should stay no |

The owner's *"full control over the pages and their view and style and formatting and functionality"*
is **theme + composition**, and both are real. What is not on offer is redrawing the inside of a
hand-built page in a canvas and having React honour it — that remains a picture.

**The honest sentence to hold onto:** you can control what a page is MADE OF and how it is arranged
and styled; you cannot rewrite what a component does by drawing it.

---

## §3. Requests (1) and (2): the design unit becomes a route STATE

Today the design system's unit is a **route**. One `design_mockups` row per route per status. That
is why a tabbed page is one design: `/admin/billing` has three tabs and one entry.

The owner is right that this is wrong, and it gets more wrong with every slice of the consolidation —
which is turning 111 links into tabs. **A design system whose unit is a route, pointed at a product
whose unit is becoming a tab, describes less of the product every week.**

### The change

A **view** is a route plus a state:

```
/admin/billing                     the route
/admin/billing?tab=overview        a view
/admin/billing?tab=invoices        a view
/admin/billing?tab=history         a view
```

`design_mockups` gains a **`state_key`** beside `route` — null meaning "the whole route", which is
what all 468 existing rows become. The page list shows a route with its states nested under it, each
with its own default, its own active design, its own checklist and its own dossier.

> **Not `view_key`, and the reason is a trap worth avoiding.** `design_mockups` ALREADY has a
> column called `views`, and it means the desktop/mobile pair — every design holds two viewports.
> A `view_key` beside a `views` column that means something else would be read wrongly by the first
> person to touch it, and probably by me in three weeks. The word "view" is spent; a tab is a
> STATE the page is in.
>
> This also fixes the axes properly. A design has **two** of them and they multiply:
> `state_key` × viewport. `/admin/billing?tab=invoices` at 390px is a real thing to look at.

### Where the view list comes from — and it must not be typed by hand

A hand-maintained list of tabs is wrong the first time somebody adds one. Two sources, in order:

1. **Declared.** Once C2 of the consolidation ships the portal shell, every portal declares its tabs
   in one place. That declaration IS the view list, for free.
2. **Observed.** For pages that are not portals, the dossier deriver already walks the live DOM. It
   can find `[role="tab"]`, `<details>`, and the accordion patterns the catalogue knows, and record
   the states it found. That covers the *"things that close elements and reveal different info"* half
   of the request, which is not always a tab bar.

**Deriving beats declaring for everything the shell does not own**, and the deriver already exists.

- [x] **V1 — `state_key`**, shipped 2026-08-24 as `seeds/615_design_state_key.sql`, applied to the
      live database and verified. On `design_mockups`, `design_page_dossiers` and
      `design_checklist_items`; carried through `MockupRow`, `DesignSummary` and `DossierRow`.
      **Nothing reads it yet** — V2 is what teaches the deriver to find a page's states.

      **Two deviations from what this slice asked for, both deliberate.**

      **1. `''`, not null.** The plan said "null-defaulting". `design_page_dossiers.route` was the
      PRIMARY KEY, and a tabbed route needs one dossier per tab — so the key had to become
      `(route, state_key)`, and **Postgres forbids NULL in a primary key**. Rather than run two
      conventions (nullable on designs, not-null on dossiers) and spend the next year writing
      `IS NOT DISTINCT FROM`, all three columns are `TEXT NOT NULL DEFAULT ''`. Empty string means
      the route as a whole, which is exactly what all 468 existing rows are.

      **2. `design_checklist_state` did NOT get the column**, though the slice listed it. Its key
      is `(design_id, item_id)`, and a design belongs to exactly one state — so the design id
      already carries the answer. Adding one would be a second place for the same fact to live,
      and therefore a second place for it to be wrong.

      **The primary-key change is guarded and re-runnable**, proven by running the seed twice.
      Seeds in this repo get re-run; dropping a constraint that is already gone would fail the
      whole file, and a migration that only works once is one nobody dares run.

      Verified against the live database: 159 designs and 1,781 checklist items all at `''`, the
      dossier key reading `PRIMARY KEY (route, state_key)`, and `design_checklist_state` still
      carrying six columns and no state.

      **A test that failed on its own documentation.** The assertion "this is not called
      `view_key`" was written as `expect(SEED).not.toMatch(/view_key/)` — and the seed explains at
      length *why* it is not called that. It checks for a column declaration now. A guard that
      fires on prose about the thing it guards teaches people to stop writing the prose, which is
      the same lesson `scan-inline-style-hex.ts` learned when it counted the hexes in a comment
      warning against hard-coded hexes.
- [x] **V2 — the walk records the states it finds.** Shipped 2026-08-25. `seeds/616` adds
      `design_page_dossiers.states`; the observer finds them; the deriver stores them.

      **16 admin routes have states — 76 in total.** `/admin/learn/manage` has 10,
      `/admin/my-pay` 9, `/admin/notes` 8, `/admin/settings` 6.

      Three shapes, because the codebase uses three: a real `[role="tab"]` tablist, an HTML
      `<details>`, and this app's own class convention. **Every rule below was found by running it
      and reading what came back wrong — none was predicted:**

      | what happened | the fix |
      |---|---|
      | `-tab` matched `-table` — four table headers and a paragraph of prose became "states" on `/admin/marketing` | a trailing boundary |
      | requiring a boundary BEFORE the stem too — `job-detail__tab` stopped matching and `/admin/settings` went 6 → 0 | only the trailing one matters; `__tab` always follows a block name |
      | `payroll-tabs__btn` — a third convention, plural stem with `__btn` items | `tabs?__` added |
      | which then matched a hint paragraph INSIDE the tab strip | a state is something you can **click**: button, anchor, or `role="tab"` |
      | `/admin/audit` reported one state called `1-field`, `/admin/support/new` one called `auto-attach-browser-context-recommended` | **one state is not a state** — a tab strip has at least two, a lone `<details>` is a collapsible paragraph. Counted per kind. |

      **`addressable` is `'yes'` or `'unknown'`, never `'no'`.** A tab written as
      `<a href="?tab=x">` proves itself linkable; a tab written as a `<button>` calling
      `router.replace` — which is what `/admin/billing` does, correctly — is indistinguishable
      from the DOM from one holding its state in a variable. The first version said "NOT
      addressable" about a page that had just been given `?tab=` on purpose.

      **The first run recorded ZERO states while reporting success on every page.** The walk found
      them, the type carried them, the column existed — and `sane()` in the derive route, an
      allowlist rebuilding the payload field by field, dropped them on the way past. Third time
      this session that a field added at one end of a pipeline and not the other produced an empty
      that looked entirely legitimate.
- [x] **V3 — the page list nests states under their route.** Shipped 2026-08-25. This is the screen
      the owner asked for, and it now shows **15 routes with 78 states, 75 of them with a default**.

      Each state carries its own lifecycle — its own default, active, alternatives and drafts —
      and its own gaps, with a link straight into the editor for that tab and an external link
      that opens the real page on it.

      **The conflation this had to avoid.** A design of the invoices TAB must not count as a
      design of the ROUTE — that is precisely what V1 existed to end, and doing it in the list
      would have put it straight back on screen with `/admin/billing` reporting four designs and a
      lifecycle assembled from four different things. `joinPages` keys by `(route, state)`.
      Verified live: `/admin/billing` reports **1** design of its own while showing three tabs
      each with their own.

      **Indented, not promoted.** A tab is not a peer of a page. Turning `/admin/settings` into
      seven rows would lengthen a 270-row list by half and tell you nothing new; the rule down the
      left is what says "these belong to the row above".

      **A tab is never asked for its own dossier.** The dossier is written per route, so a
      `no-dossier` chip on every tab would invent a queue of 78 items with nothing behind it. A
      missing TRACE is reported, because that is real work with a command behind it — three of
      them, all on `/admin/my-pay`, all nested inside another tab.

      One test asserted the route reported `no-dossier` while using a fixture that had a measured
      dossier. The assertion was wrong, not the code.
- [x] **V4 — a default for every tab.** Shipped 2026-08-25, `--states` on the tracer.

      Owner: *"I need each actual page to have a default for all tabs and everything."*

      **204 default rows across 138 admin routes — 73 of them per-state**, covering 73 of the 76
      states found. Two ways in, tried in order: the URL where the page reads one, then clicking
      the tab for the pages that hold their state in a variable.

      **The check that it actually got there is the whole slice.** If a click misses or a `?tab=`
      is ignored, every state captures the SAME tab and the product gets six identical defaults
      with six different names — worse than none, because they look like a finished job. Nothing
      is stored unless the state that ends up selected is the one that was asked for.
      `/admin/settings` came back 28 / 31 / 18 / 21 / 31 / 18 elements, which is what a working
      one looks like.

      **Two defects the run found rather than caused:**

      - **Every state on every non-URL page was "unreachable" and none was stored.** The tracer
        had its own idea of which state was showing, and the first element in the content with
        `--active` in its class is the **breadcrumb** — so it answered "settings" for all six tabs
        of `/admin/settings`. Fourth time in one session that two ends of a pair answered the same
        question differently. `SELECTED_STATE` is exported from the observer now and the tracer
        imports it.
      - **`seeds/615` contained a false claim I wrote without checking**: that "one default per
        route" was enforced in `lifecycle.ts` rather than in the database. Seed 612 had already
        made two real unique indexes on `(route)`, and they refused every per-tab default with
        *"duplicate key value violates unique constraint"*. `seeds/617` re-keys them to
        `(route, state_key)`, and the wrong sentence is corrected where it was written rather than
        contradicted somewhere else.

      **What is still not covered, honestly:** `/admin/my-pay` has three states — `overview`,
      `transactions`, `withdrawals` — that live inside another tab, so they are not on the page
      when the tracer arrives. The guard refuses them rather than storing a wrong capture, which
      is the right failure. Nested states need the walk to open the parent first, and that is not
      built.

      **And one thing that looks wrong and is not:** all eight states of `/admin/notes` capture 35
      elements each. They are filter tabs over one list — the layout genuinely does not change,
      only the rows do. The verification confirms the tab really switched; identical counts are
      the correct answer here.

      Three routes failed the batch run with "never finished loading" and traced on the first
      retry. That is the dev server compiling, and it is now the expected shape of a large walk.
- [x] **V5 — conformance follows the state.** Shipped 2026-08-25. The conformance endpoint and the
      sweep now key on `(route, state_key)` instead of on the route.

      **This slice began by finding a live regression V4 had introduced and nothing had caught.**
      `defaultFor(route)` asked PostgREST for the route's default with `.maybeSingle()`. That is
      correct while a route has one default and errors the moment it has four — so for every tabbed
      page it returned `null`, the endpoint produced no reports, and the sweep printed:

      ```
        [  1/1] /admin/vehicles    ✓  default/desktop 100% · default/mobile 100%
        [  1/1] /admin/settings    ✓                                    ← nothing was checked
        ── 1 page(s) compared · 0 default(s) no longer 1:1 ──
      ```

      A tick, an empty score, and a summary line saying nothing was wrong. **A conformance run that
      cannot find the design reads exactly like one that found no problem** — and nobody
      investigates a pass. Every tabbed page in the product was silently unchecked by the check that
      exists to catch drift.

      Fixed, and the sweep now walks `(route, state)` PAIRS: it navigates to `?tab=`, falls back to
      clicking the label, and **verifies with the observer's own rule that it arrived** before
      capturing. A capture of the wrong tab compared against the right tab's default reports a page
      that has changed beyond recognition — a wrong score is worse than no score, because it sends
      somebody to re-trace a page that was never wrong. `/admin/settings`'s six tabs now measure
      six times instead of once, each keyed `route · tab` in the record.

      `resolveActive` is deliberately consulted only when there is no state: it has no notion of one
      and would answer with the ROUTE's active design while the report claimed to be about the tab.
      That is the `defaultFor` lie again, and worse, because it produces a plausible score rather
      than an empty one.

- [x] **V6 — the dossier and its checklist follow the state.** Shipped 2026-08-25.
      `scripts/derive-dossiers.mjs --states`.

      §7 had the checklist half inside V5 and blocked on §8. It was not blocked; it was **out of
      order**. A per-state checklist needs per-state DOSSIERS, because the checklist is generated
      from the dossier — and the deriver wrote one row per route with `state_key: ''` hardcoded.
      Wiring the checklist to a state first would have produced an empty checklist for every tab:
      the failure this system keeps producing, where a field added at one end of a pipeline and not
      the other yields an empty that looks like success.

      So the walk moved first. The deriver visits each state the route walk found, verifies it got
      there, and inventories that tab on its own — including **listening for that tab's own network
      calls**, because `GET /api/admin/invoices` firing when you open the invoices tab is the
      clearest single statement of what that tab is for. Collected across the whole route they would
      be attributed to all six tabs equally, which says nothing about any of them.

      Verified live on `/admin/billing`:

      | `state_key` | elements | endpoints | checklist items |
      |---|---|---|---|
      | `''` (the route) | 11 | 9 | 14 |
      | `overview` | 11 | 8 | 14 |
      | `invoices` | 8 | 9 | 10 |
      | `plan-history` | 8 | 9 | 10 |

      **The checklist ID was where the damage would have been.** The id is the item's primary key
      and the foreign key of every tick against it. Left keyed on the route alone, six tabs would
      generate six rows called `ck-admin-settings-universal-0`, and a tick on one tab would appear,
      already ticked, on the other five. A shared tick reads as *work already done* — the worst
      failure a checklist has, because it does not lose the record, it manufactures a false one.
      `idFor` takes the state now, and the empty state keeps its historic id EXACTLY, because 468
      dossiers predate this and a new suffix would have silently reset the whole product's progress
      to zero while looking like nobody had ever ticked anything.

      **Four more instances of the same seam, found by looking for it rather than by it failing:**

      · `getDossier(route)` used `.maybeSingle()` — the identical trap V5 had just fixed in
        `defaultFor`, one table over, and it would have fired the day the first tab was derived.
      · `regenerateChecklist` computed "stale generated rows" against the ROUTE, so deriving the
        invoices tab would have **hard-deleted the overview tab's items and their ticks by cascade**.
      · `cloneMockup` did not copy `state_key`. The owner's flow for a tab is "open its default,
        clone it, edit the clone" — and the clone came out attached to the route, so an edited
        invoices tab would have been offered as the design of record for the whole billing page.
      · `/api/admin/design/pages` never SELECTed `state_key` on the dossiers, so all of a route's
        rows arrived claiming to be the route's own and the `Map` kept whichever came last. The
        designs beside them already carried a comment about this exact snake_case→camelCase seam
        from three slices ago; this was the same line one field over.

      And one gap was **deliberately un-suppressed**. V3 hid `no-dossier` on a state and said so out
      loud: nothing could write one, so the chip would have invented a queue of 78 rows nobody could
      empty. V6 built the thing that empties it, so the gap is real work and is reported like any
      other. *A suppressed gap is only honest for as long as it is unfixable.*

      Three tools now have to put a page into a tab and prove they got there — the tracer, the
      sweep, and the deriver. Rather than a third copy, `openState` lives in the observer beside
      `SELECTED_STATE`, the rule it has to agree with. The tracer and the sweep each had their own
      click helper matching a **different field** (`label.toLowerCase()` in one, `slug(text)` in the
      other); they happened to agree, which is the setup for the bug rather than the absence of one.

---

## §4. Request (3): compositions, and the two kinds of design

A design row gains a **kind**:

| Kind | What it is | Editable? | Servable? |
|---|---|---|---|
| `trace` | a measured record of what the page looks like today | no — it is evidence | no |
| `composition` | an arrangement of widgets | yes | **yes** |

`trace` is what every design is today. `composition` is new, and it is the hub's model generalised:
a view's design is a widget layout, and setting it active means the route renders it.

### Which routes can take a composition, and the honest answer to "all of them"

**Not all of them, and not soon.** A route can serve a composition when its content can be expressed
as widgets. Three tiers:

| Tier | Routes | What it takes |
|---|---|---|
| **Already there** | `/admin/me` | nothing — it works this way now |
| **Natural fit** | the 17 portals from the consolidation, and the workspace landings | a portal tab is a panel; panels become widgets |
| **Bespoke** | `/admin/jobs/[id]`, `/admin/research/[projectId]`, `/admin/cad` | not candidates. §2. |

The middle tier is the prize, and **the consolidation is what creates it.** Merging `/admin/receipts`
+ cards + pass-through + mileage into one portal produces four panels that want to be four widgets.
Doing the merge and the widgetising in one slice would be the mistake §3 of the consolidation plan
warns about; doing them in that order is the plan.

### The widget palette and the element catalogue both stay

They answer different questions and collapsing them would lose one:

- the **element catalogue** (51 entries) is how you describe what a page looks like — the trace, the
  spec, the punch list;
- the **widget palette** (54 widgets) is how you say what a page is made of — the composition.

A view can have both: a trace of what it is today, and a composition of what it should become. That
is exactly what the existing `default` / `active` distinction already means, and it finally gets a
mechanism behind "active" instead of being a label.

- [x] **W1 — `kind` on `design_mockups`** (`trace` | `composition`), defaulting to `trace`. Shipped
      2026-08-25 as `seeds/618_design_composition_scope.sql`, applied to the live database (234 rows,
      all `trace` / `firm`).

      It carries the §8 answer with it: `scope` (`firm` | `role` | `user`) and `scope_key`. Three
      check constraints, and each was **exercised against the live table** rather than assumed:

      | attempted | outcome |
      |---|---|
      | `scope='role'`, empty key | refused — `design_mockups_scope_key_check` |
      | `scope='firm'` with a key | refused — `design_mockups_scope_key_check` |
      | `scope='admin'` (role in the scope column) | refused — `design_mockups_scope_check` |
      | `kind='blueprint'` | refused — `design_mockups_kind_check` |
      | `scope='role'`, key `'employee'` | accepted |

      The first probe of this **proved nothing and looked like it had.** It omitted `views` and then
      `owner_email`, so every case came back "refused" — by a NOT NULL constraint, not by any of the
      three being tested. Five refusals in a row, exactly the output a working constraint set
      produces. The reason it was caught is that ALL FIVE were refused, including the one that
      should have been accepted; a probe with no positive case would have printed a clean pass.

      `resolveComposition` in `lib/design/composition.ts` is the whole cascade, pure and in one
      place. Nothing else may query the table for a composition — a fallthrough re-implemented at a
      call site is how the wrong layer silently wins, and this session has produced four bugs of
      exactly that shape.

      **The role hierarchy was invented on the first pass.** It said `owner`, `manager`, `marketing`
      — and none of those roles exists. `ALL_ROLES` has twelve entries, none of them those three, so
      the ordering would have been an opinion about an imaginary org chart while every REAL role
      tied at "unranked" and a viewer with two roles got whichever row the database returned first.
      Written in units nobody produces. The order is now spelled in the real vocabulary and a test
      asserts it covers `ALL_ROLES` exactly, so a thirteenth role fails loudly rather than ranking
      last by accident.

      One thing seed 618 deliberately does NOT do: widen the one-default-per-state indexes to
      include the scope. `default` means "a trace of what is actually served" and there is one of
      those per state however many audiences the page has. A per-scope default would let a route
      hold three rows each claiming to be the record — which is the same as holding none, because
      nothing could say which was true. The cascade decides which composition APPLIES to a viewer;
      it does not decide what the page is.
      **And the columns are wired, in the same slice, deliberately.** Seed 618 on its own is three
      columns, three constraints, a resolver and 22 tests — with **no way to create a single
      composition**, because `saveMockup` did not write any of them. That is this repo's most common
      defect: authored, complete, reachable from nowhere. `theme` and `notes` sat in exactly that
      position for weeks, edited in the UI and discarded on every save, until seed 614 went looking.
      So `kind`, `scope` and `scope_key` are in `SUMMARY_COLS`, in `toDocument`, in `summarise`, and
      in the row `saveMockup` writes.

      Two decisions in that wiring worth keeping:

      · **A clone keeps the kind and drops the audience.** A clone of a composition must be a
        composition — clone-to-edit is the flow for changing one, and a clone that came out a
        `trace` would be a drawing of a widget layout. But inheriting `scope: 'user'` would quietly
        make somebody else's personal layout the starting point for a change meant for everyone.
        The firm is the one scope that cannot be a surprise: it is what a page with no composition
        already effectively has.
      · **The refusals are in words.** The check constraints are the real guarantee and they stay,
        but a violation arrives as `violates check constraint "design_mockups_scope_key_check"`,
        reaches the person as a 500, and sends them looking for a broken database instead of picking
        a role. `saveMockup` says *"Which role is this version for? A role version with no role
        reaches nobody."* — checked there because every write goes through it and only one of them
        is an HTTP request.
- [x] **W2 — the studio can place widgets**, reading `lib/hub/widget-registry` — the palette, the
      placement, the sizing envelope.

      **The palette half shipped 2026-08-25** (`lib/design/widget-palette.ts` + `.client.ts`); the
      canvas half shipped with it; honouring `minSize`/`maxSize` on RESIZE is the one piece left,
      and is folded into W6.

      **A correction worth keeping, because the first version was wrong for an interesting reason.**
      This was built as `GET /api/admin/design/widgets`, on the reasoning that importing the registry
      into the studio would pull all 54 widget implementations into its bundle just to draw a list of
      names — the same seam as `/api/admin/design/import`, which hands the tracer a class index
      rather than making a `.mjs` script import TypeScript.

      Sound reasoning, wrong conclusion: **the registry does not exist on the server.** Every widget
      module begins with `'use client'`, so in a Route Handler Next replaces it with a
      client-reference proxy and never executes its body. `defineWidget()` never fires and
      `allWidgets()` returns `[]`. Confirmed rather than assumed afterwards — `AddWidgetModal` and
      `GridEditor` are the only two consumers of `allWidgets()` in the codebase and both are client
      components. There has never been a server-side reader.

      It was caught on the **first request** only because the endpoint **refused** an empty palette
      instead of returning one. Had it shipped `[]`, the studio would have rendered "no widgets
      available" and the obvious suspect would have been the studio, not the endpoint that had
      already answered 200. The refusal was written on a general principle — an empty palette is
      indistinguishable from a product with no widgets — and it turned out to be the thing that
      found the bug.

      So the bundle cost is accepted rather than engineered around: `/admin/me` already imports
      `register-all` for exactly this reason, and the studio is developer-only. The alternative is
      splitting metadata out of 54 widget modules, which would put every widget's description in a
      different file from the widget.

      What survives the correction is the **projection**: `toPaletteWidget` strips a definition to
      ten serialisable fields, so no React component ever reaches a stored design, a JSON payload or
      a test. Field by field, not a spread — a spread would carry every future field into a payload
      by default, including the next component somebody adds.

      Two decisions the tests pin:

      · **`allowedRoles` and `requiresBundle` are answered separately.** One is about the viewer, the
        other about the firm; they have different remedies (change the role vs. buy the bundle), and
        one boolean for both makes *"why is this widget missing"* unanswerable.
      · **A placed widget is a `catalogue` element with a namespaced id** (`widget:receipts-queue`),
        not a fourth `ElementKind`. A new kind would give every switch in the studio — renderer,
        layers panel, exporter, punch list, conformance matcher — another arm, and the ones nobody
        updated would fall through to a default that draws nothing.

      And `placementWarning` exists for the failure this whole feature invites: somebody designs the
      employee portal, places an admin-only widget on it, saves, and **every employee sees a gap**.
      Nothing errored; nothing was invalid; the page is quietly wrong for the only people who open
      it. The editor must not forbid it — a firm composition legitimately holds widgets only some
      viewers see — so it says so instead, and says *nothing* for the ordinary case, because a
      warning on every placement is one nobody reads.
      **The canvas half shipped the same day.** A Widgets tab sits beside Emoji and Symbols — the
      three things that are not catalogue entries — and browser-verified on `/admin/design/<id>`:
      **54 cards, role chips on the gated ones** (*"only admin, developer, field_crew, drawer,
      tech_support"*), click-to-place and drag both working, and a placed box measuring 449×161 on
      the artboard against a 214×56 palette tile.

      Two things had to be true for that to work, and each would have failed silently:

      · **`place()` bailed on anything with no catalogue entry** — `if (!entry) return`, correct for
        everything else, and it would have swallowed every widget placement without a word. The
        palette would have looked broken with nothing saying why.
      · **`renderElement` returns `<div class="ds-missing">?</div>`** for an id it does not know, and
        a widget has no entry by design. A deliberate placement and a broken one would have looked
        identical on the canvas, so a widget would have read as a mistake.

      A placed widget draws as a **named box**, never the live component. Rendering the real one here
      would give the editor a second way of drawing a widget beside the page's, and two renderers of
      one thing drifting apart is the defect this whole plan exists to close. The box is also the
      honest picture of what was stored: *this widget, this size, here*. Its label lives on the
      element because `renderElement` is pure and has no registry to look one up in — an export
      opened next year should still say "My pay", not `my-pay`.

      Grid cells become pixels in **one function**, `widgetPixelSize`, so the tile, the placement and
      any future preview cannot each pick their own ratio. Its arithmetic is pinned by tests rather
      than eyeballed from a screenshot: an n-cell widget spans the gutters BETWEEN its columns, and
      a full-width one comes out exactly the artboard width — otherwise a widget sized to span the
      page hangs a few pixels off the edge of it.

- [x] **W3 — a composition can be previewed live** at `/admin/design/serve`, rendering real widgets
      against the signed-in user's data. Shipped 2026-08-25.

      `/admin/design/serve?id=…` renders a composition through the hub's own `WidgetGrid`, from the
      hub's own registry. Browser-verified end to end: a composition with three widgets served
      **"My Pay · HOURLY $25.00/hr"**, **"Weather · 81° Clear night · Central Texas"** and **"My Jobs
      · No jobs yet"** — real data for the signed-in account — with **zero** placeholder boxes. The
      boxes exist only in the editor.

      Which is the whole distinction §2 draws, demonstrated: a trace holds rectangles and cannot be
      served; a composition holds working components and can.

      **The conversion back to a grid is where a served page could silently differ from its design.**
      The studio stores pixels; the hub renders columns and rows. `viewToGrid` undoes what
      `widgetPixelSize` did, and the round trip is asserted for **every size the grid can express**
      (1–8 columns × 1–4 rows) and every column — because the failure here is not an error, it is a
      widget one column over from where somebody approved it.

      Three rules, none of them invented in that function:

      · **Round to the nearest cell.** A canvas lets you place a widget at x=337 and a grid has no
        such column. Rounding is not an approximation of the design — it is what the design MEANT,
        because the thing being designed IS a grid layout and the canvas is only how it was drawn.
      · **Clamp into the widget's own envelope**, which is the registry's `minSize`/`maxSize`. A
        widget resized past what its component supports renders broken on the real page, and a
        preview exists to catch exactly that.
      · **Reading order**, because the hub's reflow resolves overlaps by walking the list — so the
        order decides who moves, and reading order is the one where the thing at the top-left stays
        at the top-left.

      **And the kind is now settable, or none of W1–W3 was reachable.** Seed 618 had the columns, the
      palette placed widgets, this route rendered them — and every design was still a `trace`, so the
      widgets drew as boxes and nothing was ever served. Authored but not wired, for the third time
      in this arc. The lifecycle panel gained *"What this is"* and *"Who sees it"*, and the audience
      control prints `scopeLabel` + `scopeMeaning` from the same module the cascade lives in, so the
      sentence on screen and the rule that resolves it cannot drift.

      `isComposition` is read off the document, never inferred from its contents: a composition
      nobody has put widgets on yet is still a composition, and guessing from *"does it contain
      widgets"* would render it as an empty TRACE — a blank page instead of an empty grid saying so.

      **My probe was the bug, twice.** The first version posted a document with `grid: {…}` where the
      shape is `settings: {…}`, and the studio threw *"Cannot read properties of undefined (reading
      'size')"*. I read the 120-second selector timeout as server load — both walks were running —
      and only found it by loading an EXISTING design and watching it work. Eighth time this session
      that a throwaway script's own malformed input looked like a defect in the thing it was testing.
- [x] **W4 — a portal view renders its composition when one is active**, falling back to its hand-built
      panel when none is. **The fallback is the safety property**: a composition that fails to load
      must leave the page working. Shipped 2026-08-25.

      `CompositionSlot` wraps the content of `WorkspaceLanding`, which is **five portal routes at
      once** — `/admin/money`, `/admin/office`, `/admin/equipment`, `/admin/research-cad`,
      `/admin/knowledge` — each keyed on its own route.

      It is the right first portal, not merely the cheapest. A landing page is a DIRECTORY of a
      workspace: nothing on it is unique behaviour, everything on it is *"show me what is going on
      here"*, which is what a widget does better than a link. Wrapping `/admin/receipts` instead
      would let a composition replace a page whose entire value IS its bespoke behaviour — the thing
      §2 says a composition cannot do. The **header stays outside the slot**: somebody arriving from
      a link still has to be told which workspace they are in.

      Browser-verified, one route, three states:

      | | cards | widgets |
      |---|---|---|
      | before anything exists | **21** | — |
      | composition active | 0 | Weather (81° Clear night) + My Pay ($25.00/hr), live |
      | composition archived | **21** | — |

      The fallback is not a catch-all bolted on afterwards; it is the DEFAULT branch. The children
      are the page, rendered first and always, and a composition replaces them only once one has
      arrived and parsed. Written the other way round — a spinner first, children as the error case —
      every portal in the product would flash empty on a slow connection and go blank on a bad row.
      `compositionFor` has exactly one failure mode, and it is *"the page stays as it was"*.

- [x] **W5 — role-aware.** ~~by construction~~ Shipped 2026-08-25, and **the premise was false.**

      The slice as written said: *"each widget already declares `allowedRoles`; the served page
      renders the intersection … it comes free."*

      The first half is true. The conclusion is not. `allowedRoles` is read in exactly ONE place in
      the hub — `widgetsForRoles()`, which filters the **Add Widget modal**. `WidgetCell` renders
      whatever instance it is handed and never consults the definition's roles at all.

      That is correct for the hub, and only for the hub: a personal layout can only contain widgets
      you were allowed to add, so the modal IS the gate. A composition breaks that assumption
      completely — it is authored by one person and served to many, so nothing about what the AUTHOR
      could add says anything about what the VIEWER may see.

      **Found by building it and looking.** A firm composition carrying the admin-only
      `pending-receipts` widget rendered it in full for an account without the admin role. Fifth
      premise in this project's planning docs to be false when checked rather than assumed — and the
      first four are already recorded in `feedback_check_the_premise_before_building`.

      `visibleWidgets` is the fix, shared by the served page AND the studio's preview: a preview that
      showed MORE than the page does would be worse than none, because it tells a designer their
      layout is fine when a third of it is invisible to the people it was built for. Verified after
      the fix, two accounts against one live composition:

      | | weather | pending-receipts |
      |---|---|---|
      | admin | ✓ | ✓ |
      | employee | ✓ | **✗** |

      An UNKNOWN widget is deliberately kept rather than filtered: `WidgetCell` already renders a
      clear *"no longer in the catalog"* frame for one, and dropping it here would turn a removed
      widget into a silent hole nobody could diagnose. Unknown is not the same as forbidden and the
      two must not look alike.

      **A note left for the hub, not fixed here.** `WidgetCell` still does not check roles, so a hub
      user whose role is revoked keeps rendering the widget they added while they had it. Filtering
      inside `WidgetCell` would close that too — and would change the behaviour of 54 widgets on
      everybody's home page, which is not a side effect to smuggle into a design slice. Written down
      rather than quietly inherited.
- [x] **W6 — one editor, not two.** Shipped 2026-08-25, and **the premise needed correcting first.**

      The slice said `GridEditor` and the design studio should converge, because *"two editors for
      one model is how they drift"*.

      They are not two editors for one model. `GridEditor` edits an **8-column grid**; the studio
      edits a **pixel canvas**. Merging them means one of those models losing, and both are right for
      what they edit — a trace genuinely is pixels, and a hub layout genuinely is cells. Doing the
      merge as written would have been a large, risky refactor that made one of the two editors worse
      at its actual job, in the name of a drift that was not the one happening.

      **The drift that actually existed is narrower and worse.** A composition is drawn on the canvas
      in pixels and served on the grid in cells, so `viewToGrid` rounds — and that rounding happened
      **invisibly, at serve time, to a layout somebody had already approved.** A widget nudged to
      x=337 sat there in the editor and moved a column on the real page. Nothing was wrong on screen;
      the page was simply not what had been signed off.

      So the studio snaps a composition's widgets to the cells they will actually land on — on drop
      AND at the end of a drag. Nothing rounds later because nothing is left to round: the canvas and
      the served page agree **by construction** rather than by two functions being kept in step,
      which is the property W6 was really asking for.

      Browser-verified with real mouse gestures (column step 182px, row step 136px):

      | | x | y |
      |---|---|---|
      | on drop | 546 = 182×3 | 136 = 136×1 |
      | after a 137 × 41 px drag | 728 = 182×4 | 136 — unchanged |

      Exactly right: 137px is more than half a column so it moves one; 41px is less than half a row
      so it does not.

      Three decisions worth keeping:

      · **Snap on release, not during the drag.** Snapping continuously makes a widget lurch between
        columns under the cursor and feels broken. The end of the drag is also the only moment the
        position is final.
      · **A DROP snaps too.** Snapping only on drag would leave the first position of every widget
        off-grid — and that is the position it keeps if nobody ever drags it, so the untouched case
        would have been the wrong one.
      · **Idempotent, asserted.** If a snapped rect snapped again to somewhere else, every drag would
        nudge a widget one way forever — a bug that only appears after ten minutes of use.

      Traces are untouched. They have no grid to snap to, and recording exact geometry is their job.
