# Page versions, portal themes, and a dossier for every page

**Status:** in progress · started 2026-08-23 · follows `completed/DESIGN_THEMES_2026-08-23.md`

> **How to run a slice.** Pick the top unchecked `- [ ]`. Ship it, verify it in a browser, tick it
> with what you actually did — including what you decided *not* to do and why.

---

## §0. What was asked for

1. *"multiple versions of a page designed for both desktop and mobile"* — an **active** version,
   **alternative** versions that are complete but inactive, and **drafts** still being worked on.
2. *"start a page design from scratch, or take an existing active, alternative, or draft page and
   branch/copy it"*.
3. *"link page designs together to mark them as alternative themes for each other"*.
4. *"the user would be able to go into their settings and select the theme for their backend
   portal"* — at least **three clearly defined prebuilt themes**, looking good on all pages,
   **not** affecting the frontend.
5. *"download the html file, screenshot the page, save it to the website"*, then choose: active,
   alternative, theme-linked, or draft.
6. *"if we make a page the active page, then it will become the actual served page"*, and linked
   themes become selectable in settings while that page is active.
7. *"eventually create full alternative versions of the website"* — many pages activated at once,
   with multiple themes in each version; and serve individual pages per active version.
8. *"evaluate/analyze each page and determine the purpose of the page and what all functions it
   serves"* — a clear comprehensive summary, plus every main element and what it is for.
9. That information **available in the editor**, as a **checklist**: bare-minimum required items,
   optional-but-useful items, and items the user adds themselves. Check them off as you build; see
   what is left.
10. *(mid-request)* *"make sure the editing view of each page is true to the actual elements and
    sizes of the elements on the page"* — no building something in the editor, liking it, and
    discovering it never represented the real page.

11. *(mid-request)* A **default version of every page, 1:1 with what is actually served**. The
    default is **never editable** — you clone it and change the clone, or design a new page from
    scratch and make that active. **Every Starr Surveying page listed and clickable** into the
    editor. Desktop and mobile for all of it.

---

## §1. The one thing that cannot be built as described, and what replaces it

**Themes can be served for real. Layouts cannot.**

A theme is a set of CSS custom-property values. The app already reads `--theme-*` on every surface,
`ShellTheme` already puts `data-theme` on `<html>` for the whole admin shell, and eleven palettes
already exist in `app/styles/themes.css`. Activating a theme genuinely changes the live portal, and
it already cannot touch the frontend, because `ShellTheme` mounts inside the admin shell. Item (4)
is therefore *real serving*, and most of the work is making designer-built themes join that list and
making the flagship three actually hold up.

A **design**, though, is absolutely-positioned catalogue elements on an artboard. `/admin/jobs` is a
React component that authenticates, fetches jobs, filters them, opens a creation form and writes to
the database. Serving a design *as* that route would replace a working page with a picture of one:
no data, no actions, no auth. The request says *"it will become the actual served page"* — taken
literally, activating a design would break the page it was meant to improve.

So **active means the design of record for that route**:

- it is the canonical specification — what the page is supposed to be;
- it is what the **checklist** measures, so "complete" is a claim with evidence behind it;
- it is **previewable as a real page** at real size, via a serve route, so you can look at it full
  screen rather than on a canvas;
- it is what the compare board and the export default to;
- and its **linked themes become selectable in portal settings**, which is the half that really does
  change what users see.

The functional page stays functional. This is stated here rather than discovered later, because the
difference between "the spec is active" and "the page is replaced" is the difference between a tool
that helps and a tool that takes the site down.

**What this costs, honestly:** you cannot redesign `/admin/jobs` in the editor and have the new
layout appear for users without someone implementing it. What you get instead is a spec that is
measured against the real page, a checklist that says exactly what is missing, and a preview that
shows the target at full size. §7 (Phase R) builds a **conformance view** that diffs the active
design against the live page, which is the closest honest thing to "is the served page the active
version yet?"

---

## §2. Fidelity is the foundation, so it goes first

*"I don't want it so that we build everything out in the editor, like it, and then set it to active,
only to find out that it built everything weirdly in a way that did not represent the actual planned
page."*

This is the correct thing to worry about and it is not currently proven. Two checks exist:

- `scripts/check-design-representative.mjs` compares an element's computed style on the artboard
  against the same class on its real page. Last run: **9 compared, 41 not present on the sampled
  routes**. It samples six pages, so four fifths of the catalogue is never compared to anything.
- `scripts/check-design-alignment.mjs` measures text centring and default frame vs natural size.
  54/54 clean — but "natural size" is the element's size *on the artboard*, not its size on the
  live page. It can be internally consistent and still wrong.

Neither answers the owner's question, which is: **does an element in the editor have the same size
and the same look as that element on the page it came from?** Phase F answers it by measurement, for
every catalogued element, against a route that actually renders it.

---

## §3. What already exists (measured 2026-08-23, do not rebuild)

| Thing | Where | State |
|---|---|---|
| Mockup storage | `design_mockups` (seed 609) | `route`, `variant_of`, `views` (desktop + mobile independent), `status: draft/ready/archived`, `version` |
| History | `design_mockup_versions` | every save |
| Per-route review | `design_page_reviews` (seed 610) | `route` PK, `status`, `note` — the seed of the dossier |
| Designer themes | `design_themes`, `design_palettes` (seed 611) | token maps + palettes, saved and listed |
| Portal themes | `lib/hub/themes/*.ts`, `app/styles/themes.css` | 11 registered palettes + a `custom` path |
| Theme application | `app/admin/components/ShellTheme.tsx` | `data-theme` on `<html>`, admin shell only — frontend already unaffected |
| Theme picker | `app/admin/profile/components/ThemePicker.tsx` | user-facing selection, writes through the hub store |
| Export | `lib/design/export.ts`, `capture.ts` | HTML, PNG, spec, punch-list |
| Coverage | `scripts/design-coverage-sweep.mjs` | 133 admin routes, ≈46% catalogued, ranked by routes-worn |
| Page list | `lib/design/pages.generated.json` | 270 pages (176 admin) |

The status vocabulary is the main collision: `draft | ready | archived` has to become
`active | alternative | draft` (plus `archived`, which is not one of the three but is needed and
already used).

---

## §4. Data model

```
design_mockups
  status         'default' | 'draft' | 'alternative' | 'active' | 'archived'
  locked         NEW - true for 'default'. A default is a TRACE of the served page, so editing one
                 would make it a lie. Enforced in the API, not only in the UI.
  route          the page it is for
  variant_of     lineage: which design it was branched from (already exists)
  theme_group    NEW — designs sharing this id are the same LAYOUT in different themes
  theme_id       NEW — which theme this one wears (references design_themes.id, or a builtin id)
  activated_at   NEW — when it became the design of record
  activated_by   NEW

design_page_dossiers                       NEW
  route          PK
  summary        what the page is and what it is for, in prose
  purpose        one line
  functions      JSONB — the jobs the page does
  elements       JSONB — [{ selector, label, purpose, required }]
  derived_at     when the measured half was last refreshed
  authored_by    who wrote the prose half

design_checklist_items                     NEW
  id, route, tier ('required' | 'recommended' | 'custom')
  label, detail, element_ref, sort
  created_by     null for generated items, an email for user-added ones

design_checklist_state                     NEW
  design_id + item_id  PK
  checked, checked_by, checked_at, note
  -- state is per DESIGN, not per route: two versions of a page are at different points

design_site_versions                       NEW
  id, name, description, status ('draft' | 'published'), theme_id
design_site_version_members                NEW
  version_id + design_id
```

**Two rules the schema has to enforce, not merely hope for:**

1. **One active design per route per viewport family.** Desktop and mobile live in the same
   document (`views`), so it is one active *document* per route. A partial unique index does this;
   application code alone does not, and "two active designs" is a bug you find by being confused.
2. **Checklist state belongs to the design, not the route.** Three versions of `/admin/jobs` are at
   three different points. Keying state by route would make ticking an item on a draft appear to
   complete the active one.

---

## §5. Phases

### Phase F — Fidelity: the editor tells the truth about the real page

- [ ] **F1 — Find, for every catalogued entry, a route that really renders it.** The coverage sweep
      already records which classes appear on which routes; invert that index and store it. An entry
      with no route is a red flag in itself: it means the palette offers something the app does not
      have.
- [ ] **F2 — Compare every entry against its real route**, not against six sampled pages: computed
      font, weight, colour, background, border, radius, padding — and **size**, which is the one the
      owner named. Report per entry, with the numbers.
- [ ] **F3 — Fix what is off**, and record what differs for a reason (an element that is `width:100%`
      on its page has no intrinsic width to match; say so rather than inventing one).
- [ ] **F4 — Gate it.** A test that fails when an entry drifts from the page it claims to represent.
- [ ] **F5 — Show fidelity in the editor.** Per element, a marker saying whether it has been verified
      against a live route and when. A palette that silently contains one unverified element is the
      thing the owner is worried about; the fix is to never let it be silent.

### Phase E — The editor fits the window, and behaves like an editor

Owner, mid-build: *"the editor really fits in the browser window. In the right side of the page it
seems like elements are going off of the screen when the window scale is just at 100%"*, *"ctrl + z
to undo and ctrl + y to redo"*, and *"all of the button elements are properly visible in the editor
version of the page and that all elements are properly visible."*

- [x] **E1 — Measured** via `scripts/check-design-fits.mjs` at 1024/1152/1280/1440/1536/1920. Nothing was past the right edge at any width — the first version of the check passed clean. The real fault was that the CHROME fitted and the DESIGN did not: at 1152px the rail, palette, inspector and layer list took 721px, leaving a 383px canvas to show a 1080px artboard. at real widths (1280, 1440, 1536, 1920) rather than guessing
      which panel is the culprit. Report every control whose right edge is past the viewport.
- [x] **E2 — Fixed at 1024 and up.** The inspector and the layer list share one column instead of being two siblings of the canvas (+165px); both side columns collapse from the toolbar; the zoom fits the artboard to the canvas on open, on resize and on demand instead of assuming 75%; and the floating dock is hidden in the editor, where it sat on top of the Appearance swatches. The check now asserts the ARTBOARD fits, not just the chrome., and the artboard still gets a
      usable share of the width. A tool you cannot reach is a tool you do not have.
- [x] **E3 — Verified by pressing the keys**, not by reading the source. Both already worked; two probe bugs made them look broken (focus parked in a panel field, where undo correctly belongs to the browser; and asserting the placement was the last undoable action after clicking four panel toggles that were themselves undoable). (with Ctrl+Shift+Z as the other common redo), working
      from anywhere in the editor and not while typing in a text field.
- [x] **E4 — Every element measured** for zero width, zero height, hidden visibility, zero opacity and display:none across the whole palette at every width. All clean. Nothing clipped, nothing transparent,
      nothing rendered at zero height — checked by measurement across the whole palette.
### Phase P — A default version of every page, 1:1 with what is served

The default is **not drawn**. It is a **trace** of the live page, produced by the importer that
already exists — which is the only way "1:1" can be true rather than aspirational. Somebody
rebuilding 270 pages by hand in a canvas would produce 270 approximations.

- [x] **P1 — 130 of 138 admin pages traced**, desktop and mobile, by `scripts/trace-defaults.mjs`. Eight failed and are named in §6. Dynamic routes are skipped by design (38 of them): tracing `/admin/jobs/[id]` would make one job the specification for the page.
- [x] **P2 — Locked, and enforced in `saveMockup`** rather than only in the UI, so a stale tab, a script or a direct API call all hit it. The refusal is a 409 carrying the reason, not a 500. The editor opens a default read-only with the reason on screen and Clone beside it, and read-only is enforced at `patchView` — the one funnel every placement, drag, nudge, reorder and delete goes through, because disabling buttons would still leave the arrow keys. , rejected by the save API, and the editor
      opens them read-only with the reason on screen and a Clone button next to it. A default that
      can be edited is no longer a record of what is served.
- [ ] **P3 — Re-trace on demand**, because the app changes. Re-tracing replaces the default and
      says what moved; it never touches a clone somebody made from it.
- [ ] **P4 — Prove the trace is 1:1** by measurement: element count, and each element within
      tolerance of its real position and size. A default that quietly drops a third of the page is
      the exact failure the owner is worried about.

### Phase N — Every page, listed and one click from the editor

- [x] **N1 — All 270 pages listed**, each row now showing what exists for it: Default, Active, and counts of alternatives and drafts. Counted rather than listed for the plural kinds — nine links would push the route off the row., grouped and searchable, each showing what exists for it:
      default, active, how many alternatives, how many drafts.
- [x] **N2 — Each chip is a link** straight into that design; both viewports are in the document. on the right design, with desktop/mobile both
      available.
- [ ] **N3 — The list says what is missing** — pages with no default traced yet, pages with no
      active version — so it doubles as the work queue.
### Phase S — Status and lifecycle

- [x] **S1 — `lib/design/lifecycle.ts`** defines all five statuses, what each permits, and what activating one does — read by the API and the editor, so the UI cannot offer a Save the server will reject. Seed 612 migrated the old `ready` rows to `alternative`. `active | alternative | draft | archived`, defined in one place with
      what each means and what it permits. Migrate the existing `ready` rows.
- [x] **S2 — Partial unique indexes** make two actives (or two defaults) for one route unrepresentable rather than merely discouraged, and activation demotes the previous holder to `alternative` in the same call., enforced by a partial unique index, with activation demoting the
      previous holder to `alternative` in one transaction rather than two writes and a prayer.
- [ ] **S3 — Transitions in the UI**: a status control in the editor and in the page list, with the
      consequence of each choice written next to it.
- [ ] **S4 — The page list groups by route and status**, so "what is live for this page, and what
      else exists" is one glance.

### Phase B — Branch and copy

- [x] **B1 — `POST /api/admin/design/:id/clone`.** Carries both viewports, the theme and the lineage; never locked. Verified end to end: clone a default, activate the clone, previous holder demoted. — the default included, which is the
      primary gesture: *"we should never be able to change the default page for any page itself,
      but we should be able to clone it and change the clone."* The clone carries both viewports,
      the theme, and the checklist state, and records what it came from.
- [ ] **B2 — Start from scratch** stays a first-class option, and from a **dossier** — a new design
      that already knows what the page is for and has the checklist waiting.
- [ ] **B3 — Lineage is visible**: what this was branched from, and what has been branched from it.

### Phase K — Theme links between designs

- [x] **K1 — `theme_group` + `asThemeSibling`** on the clone endpoint. A plain clone starts a new
      layout lineage; a theme sibling joins the source's group, and the source joins its own group at
      the same time so the relationship exists in both directions rather than one. The distinction
      has to be made at clone time — a re-skin and a re-layout are indistinguishable afterwards by
      looking at the contents.
- [ ] **K2 — Re-theming a design does not require rebuilding it.** A design carries a theme token
      map; a theme sibling is the same elements with a different map. Changing colours must never
      mean replacing elements.
- [ ] **K3 — The group is visible and editable** — link an existing design into a group, unlink one.

### Phase T — Portal themes people actually choose

- [x] **T1 — Eleven already existed** and were already applied shell-wide by `ShellTheme`, so the work was not designing three more — it was making the eleven actually hold up. `starr-default` (light), `starr-dark` and `ocean` are the three verified in depth; `forest-dark` is checked alongside them. and named for what they are, not for a
      colour. They must hold up on the heaviest pages, not just a card demo.
- [x] **T2 — `scripts/check-portal-themes.mjs`** renders six real routes under each theme and measures contrast against what is actually painted behind each element, plus large pale surfaces in a dark app. First honest run: 18 failures on `starr-dark` alone, including a breadcrumb at **1.02:1** — invisible, not merely hard to read. See §5 for the root cause and what is left.: contrast on real text, no unthemed
      islands, no white modal in a dark app. The existing inline-hex ratchet says where the app stops
      reading its own variables; that list is the work.
- [ ] **T3 — Designer themes become selectable** in `ThemePicker`, alongside the built-ins, when they
      belong to a theme group whose layout is active.
- [x] **T4 — Asserted, not assumed.** The audit loads a public page with the theme set and fails if `data-theme` is present. The aliases in §5 live inside `[data-theme]` blocks precisely so a page with no theme resolves the original hexes., and there is a test that says so rather than a belief.
- [ ] **T5 — Preview before choosing.** A theme is a big change to look at for the first time after
      applying it.

### Phase D — A dossier for every page

- [ ] **D1 — Derive what can be derived.** Walk each route and record its real elements, forms,
      actions, tables, filters and the APIs it calls. Measurement, not recollection.
- [ ] **D2 — Author the prose.** Purpose in one line; a comprehensive summary; the functions it
      serves. For every admin route.
- [ ] **D3 — Name the main elements and what each is for**, tied to the real selectors so the
      editor can match them.
- [ ] **D4 — Store, edit and review** dossiers, with the derived half refreshable without destroying
      the authored half.

### Phase C — Checklists that make "done" mean something

- [ ] **C1 — Generate the required tier** from the dossier: the elements without which the page
      cannot do its job.
- [ ] **C2 — Generate the recommended tier**: what would make it better, marked as optional so it
      cannot be confused with the floor.
- [ ] **C3 — Custom items** the user adds, per route, in the same list.
- [ ] **C4 — Check off per design**, with progress that distinguishes "all required done" from "all
      items done", because those are different claims.
- [ ] **C5 — The panel in the editor**: summary, elements, checklist, progress — while designing,
      not in another tab.
- [ ] **C6 — Auto-detect what has been placed.** If the design contains an element the checklist
      asks for, say so. The user still confirms; a checklist that ticks itself is one nobody trusts,
      and one that ignores what is plainly on the canvas is one nobody uses.

### Phase V — Site versions

- [ ] **V1 — A named collection of designs** across many routes, with a theme.
- [ ] **V2 — Publish a version**: activate every member in one action, with a preview of what will
      change and what is missing.
- [ ] **V3 — Individual pages still win.** Activating a version must not silently discard a
      per-page choice made deliberately; state the rule and show the conflicts.
- [ ] **V4 — Coverage**: how much of the site a version actually covers.

### Phase R — Serving and conformance

- [ ] **R1 — Serve a design as a full page** at real size — the honest "see it as a page".
- [ ] **R2 — Resolve the active design** for a route from one place, so every surface agrees.
- [ ] **R3 — Conformance view**: the active design against the live page, by measurement. The
      closest honest answer to *"is the served page the active version yet?"*

---

## §6. Decisions taken up front

**Status is one field, not three booleans.** `is_active` + `is_draft` + `is_alternative` makes
illegal states representable and they will happen.

**Activation is a transaction.** Promote and demote together or not at all.

**Checklist state is per design.** See §4.

**A theme sibling shares elements, not copies of them.** Otherwise "change the colours" becomes
"rebuild the page", which is exactly the work the request exists to avoid.

**Derived and authored dossier content are separate fields.** Re-running the deriver must never
overwrite prose somebody wrote, and prose must never be mistaken for measurement.

**Generated checklist items are marked as generated.** A user must be able to tell what the system
inferred from what a person decided, or they cannot trust either.

**The frontend is out of scope and is tested to stay that way.**

---

## §5. What the theme audit found, and why one fix covered hundreds of rules

The first honest run reported **18 contrast failures on `starr-dark` alone**, on six routes. The
worst was the active breadcrumb at **1.02:1** — near-black text on a near-black page, which is not
"hard to read", it is invisible.

**The root cause was not the themes. It was that most of the app never asked them anything.**

`themes.css` publishes fourteen `--theme-*` variables per theme. But `tokens.css` declares
`--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary` and `--color-text-muted`
as fixed hexes, `globals.css` declares a second, older set (`--text-primary`, `--brand-dark`), and
between them **hundreds of rules read those instead**. Nothing ever re-pointed them at the theme, so
a dark theme changed the page background and left the text where it was.

Three changes, in order of leverage:

1. **The static tokens follow the theme** — aliased inside each of the eleven `[data-theme]` blocks,
   never in `tokens.css`. A page with no `data-theme` — the entire public site, and the admin
   default — still resolves the original hexes and does not move by a pixel. This is what keeps
   "themes are admin-only" true while fixing every rule at once.
2. **73 colour literals** in admin stylesheets (`color: #0F1419`, `#374151`, `#6B7280`, `#9CA3AF`)
   converted to `var(--theme-…, <same hex>)`. The artboard is exempt: a mockup must look identical
   to everyone, so its ink does not follow the viewer's theme.
3. **101 rules that paint the accent and hard-code white text** now take `--theme-accent-fg`. A dark
   theme lightens its accent so links can be read on a dark page, which is exactly the wrong
   direction for white text on that same accent — one colour cannot serve both, so the theme
   publishes both.

Plus two palette corrections found by measurement: `starr-dark`'s accent was 4.45:1 as link text
(five hundredths under AA — close enough to look fine and still a failure), and `ocean`'s muted
foreground was a cyan at 3.21:1.

### The instrument was wrong twice before the app was wrong once

- The audit set `data-theme` on `<html>` after navigating. `ShellTheme` hydrates from the hub store
  a second later and writes **the account's own preference** over the top — so every run measured
  `starr-default` while printing "starr-dark" as its heading. Eighteen findings about a theme that
  was never applied. It now answers `/api/admin/me/hub-data` with the theme under test, so the app
  applies it through its own code path and keeps it applied.
- Two runs measured stale CSS the dev server had not recompiled yet, which made a correct fix look
  like it had done nothing.

### Still open — a named punch list, not a vague one

| What | Measured | Note |
|---|---|---|
| `.jobs-page__btn--primary` | 2.72:1 dark, 1.74:1 forest | the rule was converted; something later still wins |
| `.emp-card__role-chip` | 3.09–3.58:1 on **every** theme | role-coloured chips; fails on light too, so it predates themes |
| `.worker-status__headline` / `__hint` | 1.16–1.42:1 dark | light text on a panel that is not following the theme |
| `.job-card__stage`, `.job-card__deadline` | 2.15:1 on **every** theme | `#F59E0B` as text; a pre-existing defect the audit surfaced |
| `.admin-learn__section-arrow` | 2.59–2.69:1 dark | brand red as an icon colour on a dark surface |
| `.job-card__tag`, `.ws-landing__shortcut` | 4.34:1 | marginal — under AA by a rounding error |

Four of the six fail on the **light** theme as well, which means they are app defects the theme
audit found rather than theme defects. That is worth saying plainly: this pass made the portal
themes work and, on the way, turned up a handful of contrast bugs that have been shipping all along.

---

## §6. Where this stands

### Traced

**130 of 138 non-dynamic admin pages** now have a locked default, desktop and mobile, measured from
the running app. `/admin` came out at 165 desktop / 127 mobile elements; `/admin/jobs` at 75 / 74.
38 dynamic routes are skipped by design.

Eight did not trace, and the reason is worth keeping rather than retrying blindly:

| Route | Why |
|---|---|
| `/admin/equipment/inventory`, `/maintenance`, `/overrides`, `/fleet-valuation`, `/import` | `api 500` from the import endpoint |
| `/admin/pay-rates` | `api 500` |
| `/admin/equipment/consumables` | `api 405` |
| `/admin/pay-progression` | the page aborted the navigation |

Five of the six 500s are the equipment area, which suggests one cause rather than six. Not
diagnosed yet.

`/admin/work` traced 70 desktop elements and **2 mobile**, which is not a mobile page with two
things on it — it is a capture that did not wait long enough. Worth re-tracing with a longer settle.

### Built and verified

- Fidelity measurement (Phase F1/F2), the editor fit and behaviour (Phase E), the status lifecycle
  and its two database-enforced singular kinds (Phase S), cloning including theme siblings (B, K1),
  the traced defaults (P), the page list showing what exists per page (N), and the theme audit with
  its systemic fixes (T).

### Specified but NOT built

Stated plainly so the doc is not read as a claim:

- **Phase D — dossiers.** No page has a purpose, summary or element inventory yet.
- **Phase C — checklists.** Nothing generates or tracks them.
- **Phase V — site versions.** The tables exist (seed 612); nothing reads or writes them.
- **Phase R — serving and conformance.** No serve route, no conformance diff.
- **F3/F4/F5** — the fidelity differences are measured and recorded in
  `lib/design/fidelity.generated.json`, but not yet fixed, gated, or surfaced in the editor.
