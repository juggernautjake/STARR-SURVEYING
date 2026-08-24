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

- [x] **F1 — Every entry now names the route it was measured on.** The walk visits routes until each
      entry has been found rendered for real; 27 are never rendered by any admin route and are
      recorded as unverified rather than as passes (a toast, a skeleton, an error banner, the studio's
      own shape primitives). The coverage sweep
      already records which classes appear on which routes; invert that index and store it. An entry
      with no route is a red flag in itself: it means the palette offers something the app does not
      have.
- [x] **F2 — Compared against its real route**, not against six sampled pages: computed
      font, weight, colour, background, border, radius, padding — and **size**, which is the one the
      owner named. Report per entry, with the numbers.
- [x] **F3 — Fixed, or recorded with the reason.** The differences fall into three kinds and only one
      of them is a defect: a wrong DEFAULT FRAME (fixed — the palette now hands you the size the
      element really is), a style the artboard cannot reach (`.fx__icon-btn` lives in a `<style jsx>`
      block, so it renders unstyled; recorded, because resizing the frame to match would make an
      unstyled button the right size, which is worse — it would look measured), and a height that
      comes from the PARENT rather than the element (inherited line-height inside `.job-card`; the
      artboard is not that card). The third kind is recorded with its numbers rather than pretended
      away.
- [x] **F4 — Gated** by `__tests__/design/fidelity-record.test.ts`: every catalogue entry must be
      accounted for in the record, nothing may differ without a written reason, and the ACCEPTED list
      is itself checked for entries that have stopped differing — a stale exemption is where real
      findings go to hide. The record is also asserted to be newer than the catalogue files it
      describes, because a record older than the entries is describing something else.
- [x] **F5 — Marked in the palette.** `lib/design/fidelity.ts` reads the record and every card carries
      its state: verified draws nothing (the good case is the quiet case; a wall of green ticks trains
      the eye to stop seeing any of them), differing and never-measured each get their own mark and a
      tooltip carrying the numbers. "Nobody has checked this" is a visible state rather than an
      absent one, which is the whole point.

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
- [x] **P3 — Re-tracing says what moved.** `scripts/trace-defaults.mjs --only <route>` is the re-trace,
      and it now prints the difference per view: elements gained, elements lost, and what moved by
      more than 24px, worst first. Compared by class signature rather than by index — insert one
      banner and an index comparison reports that the entire page moved. Nothing is printed on a
      first trace, because there was no previous default to differ from. Only the row whose status is
      `default` is replaced: a clone somebody made from it is an ordinary draft with its own id and
      is not touched, which is stated in `writeDefault` because "re-trace the page" sounds like it
      might reach everything derived from it.

      **Not built: a Re-trace button in the UI.** Tracing needs Playwright driving a real browser
      against the running app; putting that behind a button in production would mean the server
      launching a browser on request. The page list shows how old each default is and the exact
      command instead.
- [x] **P4 — Proved by measurement**, and it is the same measurement as R3 pointed at a different
      design: `scripts/check-design-conformance.mjs --which default` re-captures the live page and
      compares it with the stored default, element by element, at both viewports. `traceIsFaithful`
      is the stricter reading a default earns by claiming to be a record: ANY missing element fails
      it, an empty trace fails it by name, and the script exits non-zero only on a default — an
      active design differing from the page is the normal state of a proposal, and failing on that
      would make the check something people turn off.

### Phase N — Every page, listed and one click from the editor

- [x] **N1 — All 270 pages listed**, each row now showing what exists for it: Default, Active, and counts of alternatives and drafts. Counted rather than listed for the plural kinds — nine links would push the route off the row., grouped and searchable, each showing what exists for it:
      default, active, how many alternatives, how many drafts.
- [x] **N2 — Each chip is a link** straight into that design; both viewports are in the document. on the right design, with desktop/mobile both
      available.
- [x] **N3 — The list is the work queue.** Four gaps, each a different job with a different tool: no
      default traced, nothing measured about the page, nothing designed at all, no design of record.
      Each is a filter with a count over EVERY page (not over what is currently shown, so choosing a
      filter cannot move the numbers underneath it), and the counts are derived in `lib/design/pages.ts`
      so the filter and the chip cannot disagree about what "missing" means. First run: 140 pages
      with no default, 259 with nothing measured, 129 with no design of record.

      "No design of record" is deliberately not reported for a page with nothing designed at all —
      that is the same complaint twice, and a queue that says everything twice is one people stop
      reading.
### Phase S — Status and lifecycle

- [x] **S1 — `lib/design/lifecycle.ts`** defines all five statuses, what each permits, and what activating one does — read by the API and the editor, so the UI cannot offer a Save the server will reject. Seed 612 migrated the old `ready` rows to `alternative`. `active | alternative | draft | archived`, defined in one place with
      what each means and what it permits. Migrate the existing `ready` rows.
- [x] **S2 — Partial unique indexes** make two actives (or two defaults) for one route unrepresentable rather than merely discouraged, and activation demotes the previous holder to `alternative` in the same call., enforced by a partial unique index, with activation demoting the
      previous holder to `alternative` in one transaction rather than two writes and a prayer.
- [x] **S3 — Every transition states its consequence before the click.** `LifecyclePanel` in the editor
      offers only the transitions `lifecycle.ts` permits, each rendered as a two-line button: the
      status, and what happens to everything else. Activating reads `activationEffect`, so it says
      which design it is about to demote BY NAME — an "Activate" that quietly displaces somebody
      else's choice is the surprise that makes people stop trusting a tool. The sentences come from
      `lifecycle.ts` rather than being written again here, so the UI and the API cannot tell different
      stories.
- [x] **S4 — One glance per row.** Each route's row carries Default · Active · N alternatives · N
      drafts · its dossier state, and now a link straight to the design of record rendered as a page.

      **Deliberately not a second grouping.** The list is already grouped by area (176 admin routes
      and 35 D&D pages are not the same job), and grouping again by status would put one page in five
      places. The gap filters answer the same question — "show me everything with no design of
      record" — without fragmenting the list.

### Phase B — Branch and copy

- [x] **B1 — `POST /api/admin/design/:id/clone`.** Carries both viewports, the theme and the lineage; never locked. Verified end to end: clone a default, activate the clone, previous holder demoted. — the default included, which is the
      primary gesture: *"we should never be able to change the default page for any page itself,
      but we should be able to clone it and change the clone."* The clone carries both viewports,
      the theme, and the checklist state, and records what it came from.
- [x] **B2 — A design started from the page list already knows what the page is for.** It is attached
      to the route, so the route's checklist is waiting for it, and if a dossier exists its purpose,
      audience, summary and measured functions are written into the design's notes at creation.
      Starting from an empty canvas with no idea what the page has to do is how a design ends up a
      tidy arrangement of the wrong things — and everything needed was already in the system; the
      only question was whether it reached the person at the moment they start. Starting blank is
      still one field and a button.
- [x] **B3 — Lineage is in the panel**: what this was branched from, what has been branched from it,
      and everything else that names the same route, each with its status. `variant_of` (where this
      came from — a history, fixed at clone time) and `theme_group` (what this is the same layout as
      — a membership that can be joined and left) are kept as different relationships on purpose:
      a design branched to try a different LAYOUT shares a parent with its source and is emphatically
      not a theme of it.

### Phase K — Theme links between designs

- [x] **K1 — `theme_group` + `asThemeSibling`** on the clone endpoint. A plain clone starts a new
      layout lineage; a theme sibling joins the source's group, and the source joins its own group at
      the same time so the relationship exists in both directions rather than one. The distinction
      has to be made at clone time — a re-skin and a re-layout are indistinguishable afterwards by
      looking at the contents.
- [x] **K2 — Re-theming touches the colours and nothing else.** `PUT /api/admin/design/:id/relations`
      reads the elements from the row and writes them back untouched, replacing only the theme — so
      the promise holds even if the editor is buggy, which is the right place for a guarantee like
      that to live. Verified in a browser: element count identical before and after, theme stored.

      **This is where the phase found a defect that had been shipping since the studio launched.** A
      design's theme was never persisted at all — `design_mockups` had no `theme` column, and neither
      did it have `notes`. Both were edited in the UI, both were written to the browser copy, and the
      save reported success while storing neither. Pick a theme, reload on the same machine and it is
      there (localStorage); open the same design on another machine and it is the default palette and
      an empty notes box. Seed 614 adds both columns; K2 was unimplementable until it did.
- [x] **K3 — Families are visible and editable.** The panel lists the themes of this layout, links an
      existing design for the same route into the family, and leaves one. Linking names another
      DESIGN rather than a group id, so a family is always named after a real layout. Two designs for
      different pages are refused: a family that spanned routes would make "this page's themes"
      unanswerable.

### Phase T — Portal themes people actually choose

- [x] **T1 — Eleven already existed** and were already applied shell-wide by `ShellTheme`, so the work was not designing three more — it was making the eleven actually hold up. `starr-default` (light), `starr-dark` and `ocean` are the three verified in depth; `forest-dark` is checked alongside them. and named for what they are, not for a
      colour. They must hold up on the heaviest pages, not just a card demo.
- [x] **T2 — `scripts/check-portal-themes.mjs`** renders six real routes under each theme and measures contrast against what is actually painted behind each element, plus large pale surfaces in a dark app. First honest run: 18 failures on `starr-dark` alone, including a breadcrumb at **1.02:1** — invisible, not merely hard to read. See §5 for the root cause and what is left.: contrast on real text, no unthemed
      islands, no white modal in a dark app. The existing inline-hex ratchet says where the app stops
      reading its own variables; that list is the work.
- [x] **T3 — Designer themes are offered in settings**, in their own section under the eleven built-ins,
      when they belong to a theme family whose layout is the design of record for its page. Three
      conditions and each does work: a FAMILY (a one-off theme tried on a draft is not a decision),
      whose layout is ACTIVE (which is exactly what the request ties them to), carrying TOKENS (an
      option that changes nothing is worse than a missing one). Identical palettes are offered once —
      the same theme across five pages of a site version is one choice, not five.

      Two things had to be built underneath it. The endpoint is under `/api/admin/me/` and gated to
      any signed-in user rather than to developers: this is a personal setting like density, and
      gating it to developers would mean the themes were built for everybody and offered to nobody.
      And `ShellTheme` now applies a custom palette shell-wide — it only ever set `data-theme`, and
      `custom` has no stylesheet block because the palette is per user, so a chosen designer theme
      would have painted nothing. A `[data-theme="custom"]` block was added too, carrying only the
      static-token aliases from §5: without it a custom theme moved the surfaces and left every
      `--color-text-*` rule painting the original near-black, which is the same defect §5 describes
      surviving in the one theme that had no block to fix it.
- [x] **T4 — Asserted, not assumed.** The audit loads a public page with the theme set and fails if `data-theme` is present. The aliases in §5 live inside `[data-theme]` blocks precisely so a page with no theme resolves the original hexes., and there is a test that says so rather than a belief.
- [x] **T5 — Preview, then keep or cancel.** Previewing writes the same variables the shell writes and
      saves nothing, so it is not a swatch approximating the theme — it IS the theme, applied to the
      page you are standing on. Cancelling re-broadcasts the SAVED values rather than reversing the
      paint by hand: the shell owns how a theme is applied, and a second implementation of "undo the
      paint" is how the two come to disagree. A fixed bar carries Keep and Cancel, because a preview
      you can only leave by finding the control that started it is a trap.

### Phase D — A dossier for every page

- [x] **D1 — `scripts/derive-dossiers.mjs` walks the route and records what is there**: every control a
      person can operate, every region (table, form, list, card grid, toolbar, dialog, empty state),
      every heading, and every API call the page makes while it loads and settles. The network list
      turns out to be the most useful part — a `POST /api/admin/jobs` while the page is open says more
      about what a page DOES than any number of buttons.

      The walk refuses to store what it cannot trust: an error status, a redirect, or a page that
      rendered nothing is reported and dropped rather than saved with a caveat nobody reads. Two of
      the first twelve routes were refused on exactly that ground.
- [x] **D2 — The written half has a screen of its own** at `/admin/design/dossiers`: purpose in one
      line, who opens it and on what, and the comprehensive summary. The default filter is "measured,
      needs a sentence", because that is the pile a person can actually clear — the deriver produces
      it by the hundred and only a human can finish it.

      **What is left is writing, not building.** The prose for 176 routes is authorship; every page
      is listed, filtered and one click from its form, and the queue says exactly how many are
      waiting.
- [x] **D3 — Every element is named, explained and tied to its selector**, with the catalogue entry it
      matches — or a visible "not in the palette" when nothing does, which is a gap in the PALETTE
      surfaced where somebody is about to need it rather than in a report nobody reads. Repeated
      elements are grouped: forty job cards are one element of the page repeated forty times, and
      listing forty would make `/admin/jobs` three hundred rows nobody reads.
- [x] **D4 — The two halves cannot overwrite each other.** Different columns, different endpoints,
      different functions: `saveAuthored` cannot write `elements`, `saveDerived` cannot write
      `summary`. That is not tidiness — losing a paragraph somebody spent ten minutes on because a
      button moved is how people stop writing paragraphs. The screen shows it too: the written half
      is in editable fields, the measured half is grey, timestamped and read-only with the command
      that refreshes it, because a reader who cannot tell which half a claim came from cannot tell
      whether disagreeing means fixing a sentence or re-running a measurement.

### Phase C — Checklists that make "done" mean something

- [x] **C1 — The required tier is generated from the dossier's own judgement** — the heading that says
      where you are, the surface the data is in, the form, the empty state, the control that starts
      the page's main action — plus two universal must-haves: a mobile layout that is not the desktop
      one squeezed (half this app is used outdoors on a handset), and a heading. Kept deliberately
      short: a checklist where everything is required is one nobody finishes, and one nobody finishes
      is one nobody reads. A page's own functions become required items when no element covers them,
      so a page that CREATES something is asked for somewhere to start that even if the trace missed
      the button.
- [x] **C2 — Recommended is everything else the page has**, plus the states nobody draws and everybody
      ships: an empty state with a way forward, a loading state, and what happens when the fetch does
      not come back. Marked as optional in the panel, with the tier's meaning printed under its
      heading, so it can never be read as the floor. One-off decorations are dropped — an element
      seen once, matching no catalogue entry and not required is almost always a wrapper the trace
      happened to keep, and asking somebody to tick it is asking them to stop reading.
- [x] **C3 — Custom items** are added in the panel, live in the same list, and default to the `custom`
      tier rather than to `required`: adding a reminder should not silently raise the bar the page is
      measured against. Generated and custom are told apart by the ROW (`created_by IS NULL`), never
      by the text — and regeneration rewrites the generated rows and leaves the custom ones exactly
      as they are.
- [x] **C4 — Ticked per design, and progress reports two numbers.** State is keyed by design, so three
      versions of `/admin/jobs` are at three different points and a tick on a draft cannot mark the
      active design complete. "12 of 18" hides the only question worth asking, so the must-haves get
      their own counter and their own bar and the total is the quieter number beside it — and an
      empty required list never reports a met floor, which would let "complete" mean "never
      measured".
- [x] **C5 — The panel is in the editor**, with the must-have count on the toolbar button so it is
      readable without opening anything. Two tabs: the checklist, and what the page is (purpose,
      summary, what it does with the evidence, every element, every endpoint it calls). The moment
      the checklist matters is the moment you are placing things; on another screen it is consulted
      twice — once before you have built anything, once when changing it is expensive.
- [x] **C6 — Detection is shown beside the box and never in it.** An item whose element is already on
      the canvas says "on the canvas"; the count of those appears above the list as a nudge. Matching
      is by catalogue id first and by traced class signature second — never by geometry, because a
      guess there would tick a box nobody earned. The reverse case is surfaced too: an item ticked
      with nothing matching on the canvas says so, since the other explanation is that it was ticked
      by mistake and nobody would ever find out.

### Phase V — Site versions

- [x] **V1 — A named set of designs across many routes**, at `/admin/design/versions`. A default cannot
      be a member: it is a trace of what is already served, so "activating" one would publish a
      description of the present as a plan for the future. One design per route per version, enforced
      by a partial unique index rather than discovered at publish time.
- [x] **V2 — The plan is the screen; publishing is the button underneath it.** Opening a version shows,
      per route, exactly what publishing would do: activate, already the record, conflict, or the
      design has been deleted. The plan and the publish come from the SAME function — a preview
      computed by a second implementation can be wrong about the thing it exists to prevent.
- [x] **V3 — A later per-page choice wins, and says so.** If a route's current design of record was
      activated AFTER the version claimed that route, publishing skips it and the row explains why,
      with a checkbox to take it anyway. Time is the only evidence available for "somebody decided
      this deliberately, later", and the comparison is one-directional on purpose: a version assembled
      today does not lose to an activation from last month, because that activation is what the
      version was assembled to replace. Overriding is possible and explicit — a rule with no override
      is a rule people work around by deleting things.
- [x] **V4 — Coverage, scoped to the areas the version touches.** A version that redesigns the whole
      employee portal and leaves the D&D side project alone is 100% of what it set out to do; calling
      it 46% of everything would make the number useless for the only decision it informs. The
      per-area breakdown is in the tooltip, and the plan says how many in-scope pages the version does
      NOT name — "publish the new site" reading as "every page changes" is the natural assumption and
      it is wrong.

### Phase R — Serving and conformance

- [x] **R1 — `/admin/design/serve?route=…`** renders the design of record full bleed at 1:1, with the
      editor's chrome gone and a viewport switch. It does not scale to fit: a design that only looks
      right shrunk is a design that does not look right, so it scrolls sideways instead. Annotations
      are dropped — an arrow pointing at a button is a note about the design, not part of the page.
      The banner saying "this is a design, not the page" is not decoration: somebody arriving from a
      link has to know within a second, or this becomes the most convincing way in the system to be
      wrong about what the app does.
- [x] **R2 — `lib/design/active.ts` answers it once.** Four surfaces ask which design is the record for
      a route, and four copies of the query would be four chances to disagree about the edge cases —
      which are the entire content of the question. The interesting one: a route with only a default
      resolves to the default, SAID to be a default, because showing it is genuinely the most useful
      answer and presenting it as "the active design" would turn a measurement into a decision nobody
      made.
- [x] **R3 — `/admin/design/conformance`**, from a measured record rather than a live diff (the walk
      takes minutes at two viewports; nobody can wait for it while a page renders, and a score with no
      date is a number people trust for months). Per route it reports what share of the design's
      elements are on the page, in the right place, at the right size — computed from the DESIGN's
      elements, so a page with an extra help link is conformant-with-an-addition rather than 90%
      conformant, and the way to raise the number is never to delete a useful control.

      Pairing is by class signature, not by index: pair the nth design element with the nth page
      element and one inserted banner reports that the whole page moved, which is indistinguishable
      from a page that really did and destroys the value of every future run.

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

## §7. What the theme audit found, and why one fix covered hundreds of rules

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

## §8. Where this stands

**Every slice in §5 is built.** What follows is what that does and does not mean, because "48 of 48
ticked" is exactly the kind of claim this doc exists to keep honest.

### Built and verified in a browser

All ten phases. The pass that matters is the last one: a scripted walk through the real UI signed
in as an admin, which placed a design, ticked a checklist item and reloaded to prove the tick had
reached the server, activated a design and watched the previous holder demote, re-themed and
confirmed not one element moved, published nothing it was not asked to, and previewed a designer
theme in portal settings. 27 of 29 checks passed on the second run; the two failures were the dev
server restarting mid-run, re-probed individually and clean.

**The first run of that pass reported six failures that were all the probe asserting before React
had finished.** Worth writing down again: the probe was the bug, for the fourth time in this
repository. The rewritten one waits for the thing it is about to assert on.

### Two defects the phase found rather than caused

**A design's theme and notes were never being stored.** `DesignDocument` has carried both since the
studio shipped; `design_mockups` had columns for neither, and `saveMockup` wrote every field it
knew about and reported success. On one machine it looked fine, because localStorage kept them.
Open the same design anywhere else and it was the default palette and an empty notes box. Seed 614
adds the columns. K2 — *"re-theming does not require rebuilding"* — was unimplementable until it
did, because a theme sibling would have been a copy of the elements wearing nothing.

**A custom theme painted the surfaces and left the text where it was.** `[data-theme="custom"]` had
no block in `themes.css`, so none of the static-token aliases §7 added for the eleven built-ins
applied to it — the same defect §7 describes, surviving in the one theme that had no block to fix
it. A custom dark theme was therefore the worst-looking option in the picker, and it read as the
custom-theme feature being broken rather than as forty missing lines of CSS.

### What is data-entry rather than engineering

Two of the deliverables are now machines that have to be run and filled in:

- **Dossiers.** The deriver measures a route in about eight seconds. 11 routes have been derived so
  far, producing 120 checklist items. The remaining ~165 admin routes are one command
  (`scripts/derive-dossiers.mjs --area admin`). The WRITTEN half — purpose, audience, summary — is
  authorship and no machine can produce it; `/admin/design/dossiers` lists exactly which pages are
  waiting, and that queue is the work.
- **Conformance.** `scripts/check-design-conformance.mjs --write` produces the record the page
  reads. It has not been run across the whole product yet, so the page currently says so — with the
  command — rather than showing numbers with no date on them.

### Still open, from the earlier passes

**Eight pages have no default traced**, and the reasons are worth keeping rather than retrying
blindly:

| Route | Why |
|---|---|
| `/admin/equipment/inventory`, `/maintenance`, `/overrides`, `/fleet-valuation`, `/import` | `api 500` from the import endpoint |
| `/admin/pay-rates` | `api 500` |
| `/admin/equipment/consumables` | `api 405` |
| `/admin/pay-progression` | the page aborted the navigation |

Five of the six 500s are the equipment area, which suggests one cause rather than six. Not
diagnosed. `/admin/work` traced 70 desktop elements and **2 mobile**, which is not a mobile page
with two things on it — it is a capture that did not wait long enough.

### The third instrument bug, and the one worth remembering

**Every walk in this system waited a fixed number of milliseconds, and that number was measuring the
dev server.** Three separate symptoms, one cause:

- `/admin/audit` and `/admin/billing` derived to an EMPTY inventory and were refused. Neither is an
  empty page: they render `⏳ Loading...` for four and eleven seconds while the route compiles.
- `/admin/work` traced 70 desktop elements and 2 mobile — not a phone page with two things on it.
- The fidelity check located **4 of 51** palette elements across 34 routes, where an earlier run of
  the same script had found 28. Nothing about the catalogue had changed. It was sampling spinners
  and reporting the app as unfindable.

`waitForPageReady` now waits for the content root to hold something operable, and every walk — the
deriver, the tracer and the fidelity check — uses it. Both refused routes derive on the first try
afterwards, and the fidelity walk's yield went from 4/51 to 25/51 on the same app.

That is the fourth time in this repository that the instrument was the defect, and the shape is
always the same: a measurement that is confidently wrong looks exactly like a finding.

**The six contrast findings in §7's punch list are unchanged.** Four of them fail on the light
theme as well, which means they are app defects the theme audit found rather than theme defects.

### What this still cannot do, by construction

Activating a design does not replace the React page — §1 says why, and nothing in this pass changed
it. What activation now does is real and worth naming: it decides what the checklist measures, what
the conformance view diffs the live page against, which themes portal settings offers, and what
`/admin/design/serve` renders at full size. The gap between the specification and the product is a
number on a page rather than an assumption.
