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

- [ ] **V1 — `state_key` on `design_mockups`**, null-defaulting, plus the same on dossiers and
      checklist state. Nothing reads it yet.
- [ ] **V2 — the deriver records the views it finds** on a route: tabs, disclosure panels, and the
      URL parameter that selects each where there is one.
- [ ] **V3 — the page list nests views under their route**, each with its own gap chips. This is the
      screen the owner is asking for.
- [ ] **V4 — the tracer traces a view.** `?tab=invoices` is a different capture from `?tab=overview`;
      today the tracer would record whichever tab happened to be default and call it the route.
- [ ] **V5 — conformance and the checklist follow the state.** They already key on route; the same
      code keyed on `state_key` answers a much sharper question — and the conformance record grows
      from 264 measured views to roughly one per tab.

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

- [ ] **W1 — `kind` on `design_mockups`** (`trace` | `composition`), defaulting to `trace`.
- [ ] **W2 — the studio can place widgets**, reading `lib/hub/widget-registry` — the palette, the
      grid, `minSize`/`maxSize`, `allowedRoles` shown on each.
- [ ] **W3 — a composition can be previewed live** at `/admin/design/serve`, rendering real widgets
      with real data rather than an artboard.
- [ ] **W4 — a portal view renders its composition when one is active**, falling back to its hand-built
      panel when none is. **The fallback is the safety property**: a composition that fails to load
      must leave the page working.
- [ ] **W5 — role-aware by construction.** A composition stores widgets; each widget already declares
      `allowedRoles`; the served page renders the intersection. This is the consolidation plan's §5
      and the owner's *"load elements dynamically based on the role of the user"*, and it comes free.
- [ ] **W6 — one editor, not two.** `GridEditor` and the design studio converge. Whichever survives,
      the other becomes a thin caller — two editors for one model is how they drift.

---

## §5. Request (1): keeping the designer honest while pages move

Every consolidation slice invalidates design records. C14 of the consolidation plan says to re-derive
at the end. **That is the wrong shape** — a batch fix-up at the end of a quarter is how the catalogue
was 46% stale the first time.

Instead: **each consolidation slice re-derives what it touched, as part of the slice.** The commands
already exist and take seconds for a handful of routes:

```
node --env-file=.env.local scripts/trace-defaults.mjs   --only /admin/billing
node --env-file=.env.local scripts/derive-dossiers.mjs  --only /admin/billing
node --env-file=.env.local scripts/check-design-conformance.mjs --only /admin/billing --write
```

- [ ] **S1 — a `--since` mode** on the three walks: re-derive every route whose page file changed
      since a given commit. Turns "remember to re-derive" into one command a hook can run.
- [x] **S2 — the merged-away routes get retired, not left rotting.** Shipped 2026-08-24.

      C1 of the consolidation left exactly the rot this predicted: `/admin/billing/invoices` and
      `/admin/billing/plan-history` each still held a **locked** design named "— as served",
      claiming to be a 1:1 record of a route that now serves a redirect.

      The tracer already refused to TRACE a forwarding route — that stops a wrong default being
      written and does nothing about the one already sitting there. The walk that discovers the
      forward now retires the design too. Both were archived on the first run.

      **`lifecycle.ts` had already decided this**, which is why no new status was invented: a
      default's only transition is `canBecome: ['archived']`, and the rule's own comment says why —
      *"a default can only ever be re-traced or retired"*. S2 is that sentence, automated.

      **Archived, not deleted, and the distinction is the whole slice.** These captures are the
      RIGHT page's elements, measured while the route really rendered them: "what this looked like
      before it became a tab" is worth keeping. The five designs DELETED on 2026-08-24 were the
      opposite case — they held the destination's elements, traced straight through a forward, and
      `/admin/schedule` was holding 72 elements of `/admin/calendar`. That is evidence of nothing.

      Only the `default` is retired. A draft somebody cloned from it is their own work on a route
      that moved, and touching it would be the tool making a decision for them. Six tests pin it.

- [x] **S3 — the page list shows staleness.** Shipped 2026-08-24. A fifth gap, `stale-default`:
      **"Traced before the page changed"**, filterable like the other four. It reads **50 of 138**
      admin routes today.

      **The first version used `fs.statSync().mtimeMs` and I nearly shipped it.** It reported the
      same 50 — but mtime records when the FILE was written, not when the page changed, and a
      branch checkout or a rebase rewrites it. This repository does both daily, so the number could
      not be trusted even when it was right. It reads the last COMMIT that touched the file now:
      one `git log` for the whole tree, measured at ~0.1s against 138 `stat` calls for a worse
      answer. mtime survives as the fallback for a deployment with no `.git`.

      **The 50 are real, and checked rather than assumed.** `/admin/assignments` was traced at
      01:26 and last committed at 20:38 — by the contrast codemod in `31a6989c7`, which touched 90
      admin files. Every one of those pages genuinely changed after its default was recorded.

      **A false alarm I raised and withdrew:** the same query appeared to show three `default` rows
      for `/admin/employees`, which would break the `singular` rule and let conformance compare
      against an arbitrary one. Filtering `deleted_at` showed 340 default rows of which 131 are
      live and **zero routes have more than one** — the tracer soft-deletes the previous default,
      exactly as it should. Recorded because "I found a bug" and "my query was missing a filter"
      look identical until you check.

      **Computed by the caller, not by `joinPages`.** That module is imported by `PageList.tsx`, a
      client component, so it cannot touch the filesystem or shell out. The API route does the
      lookup and passes a set. The alternative — making the page list server-only — would have been
      a much larger change for a chip.

---

## §6. What I am NOT proposing, and why

- **Not a page builder for arbitrary React.** §2. Drawing a rectangle cannot make a component fetch
  a job.
- **Not deleting the artboard.** The trace is what makes conformance measurable — 264 views at a mean
  99.0% today — and a composition cannot replace evidence of what the page currently is.
- **Not widgetising the bespoke pages.** `/admin/research/[projectId]` is 22,112 lines. It is a
  application, not an arrangement.
- **Not doing this before the consolidation.** The portals are what create the panels that become
  widgets. Reversed, this is a widget system with nothing to compose.

---

## §7. Order

The dependency is real and it runs one way: consolidation → views → compositions.

1. **V1–V3** can start now and are useful immediately — nesting views under routes makes the page
   list describe the product again.
2. **S1–S3** should land early. They are small and they stop the rot that request (1) is about.
3. **V4–V5** after the portal shell (consolidation C2), which is where the declared tab list comes
   from.
4. **W1–W6** last, and only for portal views. This is the biggest piece and the one most likely to be
   cut down once V and S are in and it becomes clear how much of *"full control"* they already
   delivered.

---

## §8. The open question

**Whose composition is it?** The hub's layouts are per USER (`user_hub_layouts.user_email`). A
portal's composition is presumably per FIRM — the owner designing the receipts portal for everyone.
But the same mechanism could do both, and *"looks different depending on which role"* sits between
them: a per-ROLE composition is a third option, and probably the right default for a portal.

Three scopes, one mechanism, and the answer decides the primary key. **This needs deciding before
W1**, because it is the schema.
