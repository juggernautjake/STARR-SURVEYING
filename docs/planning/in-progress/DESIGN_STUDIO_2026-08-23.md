# Page Design Studio — 2026-08-23

> **Owner's ask.** *"I need a way to build mock pages to help illustrate what exactly I want each
> page to look like… an editor that has a canvas that is for pc, and another for mobile views…
> a side panel [with] tabs with different categories of elements… a version of every element on the
> current backend employee portal from every page catalogued… so I can actually go through and
> quickly plan out each and every page exactly how I want it. I still find tons of repetitive
> elements and poorly formatted elements that need to be fixed, or are simply non-functional at
> all… quickly design out each page, save a screenshot of the design I made, and then upload it to
> the claude code AI to then build it out according to my specifications."*
>
> **How to run a slice.** Pick the top unchecked `- [ ]` in §19. Read the slice's detail section and
> the code it names. Build it. `npx tsc --noEmit` + `npx vitest run` + `npm run build`. Commit,
> push, tick the box with a one-line note. The doc moves to `completed/` only when every box is
> `[x]` or struck with a reason.
>
> **Status.** Phase 1 (the catalogue) is the immediate priority and the only phase the owner has
> asked to see first. Everything after it is designed here so Phase 1 does not have to be redone.

---

## §0. What is actually there, measured

Every number below was counted on 2026-08-23, not estimated. They are the reason several decisions
in this doc go the way they do.

| Thing | Count | Where |
|---|---:|---|
| Admin routes in the registry | 147 | `lib/admin/route-registry.ts` |
| `page.tsx` files under `app/admin` | 174 | (registry routes + sub-pages + `[id]` routes) |
| `.tsx` files under `app/admin` | 558 | pages + components |
| Admin stylesheets | 55 | `app/admin/**/*.css` + the four shared files |
| Lines of admin CSS | 49,722 | |
| Distinct admin class names | 6,827 | |
| Distinct BEM blocks | 600 | |
| `<style jsx>` blocks | 37 | styled-jsx inside components |
| **Inline `style={{ … }}` sites** | **3,255** | |

**The last row is the single most important fact in this document.** A third of what the employee
portal actually looks like is not in any stylesheet — it is written inline, per element, per file. A
catalogue built by scanning CSS would be confidently incomplete, and would miss precisely the
elements the owner is complaining about, because ad-hoc inline styling is *what makes* an element
inconsistent in the first place. §4.3 handles all four sources.

### 0.1 What the first scan found — three styling systems, not one

`scripts/design-catalogue-scan.mjs` (slice C1, built) ran on 2026-08-23:

| | |
|---|---:|
| CSS rule sets parsed | 11,987 |
| `<style jsx>` rule sets | 596 |
| `className` usage sites | 15,546 |
| Inline `style={{ }}` sites | 3,196 |
| Distinct classes seen | 8,463 |
| **Styled but never used** (dead CSS) | **1,295** |
| **Used but never styled** (utilities) | **1,365** |

Sorting classes by real usage turned up something the plan did not assume: **the most-used classes
in `app/admin` are Tailwind utilities**, not this app's own names — `flex` (935), `rounded` (814),
`items-center` (729), `text-gray-400` (483), `px-2` (331).

Where they live matters, and it is clean:

| | distinct classes | usages | where |
|---|---:|---:|---|
| Tailwind utilities | 483 | 15,295 | **4,500 of 5,072 class-file pairs are `app/admin/cad`**, 516 are `app/admin/research`, ~57 everywhere else |
| The app's own classes | 7,980 | 13,311 | the rest of the portal |

**So the employee portal proper — jobs, projects, files, receipts, payroll, hours, leads — is BEM
plus inline styles. CAD and research are Tailwind islands with their own visual language.** Three
consequences:

1. The catalogue's target is the BEM + inline world. That is what "every element on the employee
   backend portal" means, and it is a tractable 7,980 classes rather than an untargetable 8,463.
2. **CAD is out of scope for the palette** and should be stated as such — the same conclusion the
   2026-08-14 alignment audit reached for its own reasons ("a drawing editor with a tool rail, two
   docked panels, a command line and a status bar is not a phone surface").
3. **1,295 styled-but-unused classes is dead CSS**, and **1,365 used-but-unstyled** are the
   utilities. Both numbers are punch-list material on day one (§14), before the studio exists.

Raw scan output lands in `lib/design/catalogue/raw/` (7 MB) and is **git-ignored** — it is derived
from code, so it must never be the thing anybody edits or reviews. The curated catalogue is what
gets committed.

Two more facts worth stating up front:

- **A token system already exists and is good.** `app/styles/tokens.css` (colour ramps, control
  heights, spacing, shadows, z-index, transitions, breakpoints), `app/styles/forms.css` (normalised
  inputs scoped to `.admin-layout__content`), `app/styles/density.css` (compact / comfortable /
  spacious), `app/styles/themes.css`. `docs/admin-styling-contract.md` is the written rule set. The
  studio must speak in these tokens or it will produce mockups nobody can build faithfully.
- **A lot of editor machinery already exists in this repo.** `@dnd-kit/core`, `@dnd-kit/sortable`
  and `@dnd-kit/utilities` are already dependencies. The CAD editor has a hotkey engine
  (`lib/cad/hotkeys/*`: registry, conflict detection, presets), `ResizeHandle`, `SelectionDragChip`,
  `CanvasViewport`, and snapping constants. `jspdf` is installed. `playwright` is a devDependency
  and can drive a real browser locally (§13). None of this needs inventing.

---

## §1. The product, in one screen

A route at `/admin/design` (admin/developer only) with three regions:

```
┌───────────────┬───────────────────────────────────────────────┬──────────────────┐
│  PALETTE      │   CANVAS                                      │  INSPECTOR       │
│               │                                               │                  │
│ [Buttons]     │   ┌──────────────── 1440×900 ─────────────┐   │  Element         │
│ [Text]        │   │                                       │   │   Label   [   ]  │
│ [Inputs]      │   │   (desktop artboard)                  │   │   Size    [   ]  │
│ [Toggles]     │   │                                       │   │   Colour  [▣]    │
│ [Tags]        │   └───────────────────────────────────────┘   │   Radius  [   ]  │
│ [Cards]       │                                               │   Opacity [——●—] │
│ [Tables]      │   ┌── 390×844 ──┐                             │   Weight  [   ]  │
│ [Nav]         │   │             │                             │                  │
│ [Modals]      │   │  (phone     │        grid ▣ 8px  snap ✓   │  States          │
│ [Feedback]    │   │   artboard) │        guides ✓  rulers ✓   │   hover/disabled │
│ [Layout]      │   │             │                             │                  │
│ [Shell]       │   └─────────────┘                             │  Notes           │
│ [Emoji]       │                                               │   "this should…" │
└───────────────┴───────────────────────────────────────────────┴──────────────────┘
```

You drag an element from the palette onto either artboard, it lands where you dropped it (snapped
to the grid, or free if snapping is off), you resize and restyle it in the inspector, and you save
the design against a route (`/admin/jobs`, say) with a name and a variant. Then you export: a PNG, a
standalone HTML file, and a JSON spec — the three things that make "build this for me" unambiguous.

---

## §2. Non-goals

Stating these keeps the scope honest.

- **This is not a page builder that ships code to production.** It produces a *specification*.
  Nothing it saves is rendered to a real user. The gap between a mockup and a built page is where
  judgement lives, and pretending otherwise produces a tool that generates unmaintainable pages.
- **It is not a general-purpose design tool.** No bezier pen, no image editing, no vector drawing.
  Its vocabulary is deliberately limited to what this app can actually render.
- **It does not replace the styling contract.** It *enforces* it (§10).
- **It is not multiplayer.** One person at a time, with version history. Real-time collaboration is
  a whole product and is not what is being asked for.

---

## §3. Architecture decisions

### 3.1 The artboards render real DOM, not a `<canvas>`

Elements are real HTML nodes wearing the app's real classes, absolutely positioned inside a frame.

**Why this and not a drawing canvas:** a `<canvas>` mockup is a picture of a button. A DOM mockup
*is* the button — the same `.job-detail__action--ghost`, the same token colours, the same 40px
height, the same font stack. Three consequences follow, and all three are the point:

1. **Export to HTML is trivial and truthful** — it is already HTML.
2. **The mockup cannot lie about what the app can do.** If a control is 40px tall in the app, it is
   40px tall in the mockup, because it is the same CSS.
3. **The contract linter (§10) can measure the mockup with the same rules that measure the real app**
   — `scripts/ui-fit-sweep.mjs` already exists and does exactly this measurement.

The cost is that the artboards must load the admin stylesheets, and that scaling/zoom is a CSS
transform rather than a canvas matrix. Both are cheap.

### 3.2 Two independent views, one design document

> Owner: *"We need a desktop view available with all of the desktop elements available to design
> with, and we need an independent mobile view of the same page that will have its own totally
> separate design."*

**The desktop and mobile views are separate canvases with separate element lists.** They are bound
together only by belonging to the same design — the same name, the same target route, the same
version history, and one export that carries both.

```ts
interface DesignDocument {
  id: string;
  name: string;               // "Jobs list"
  route: string | null;       // "/admin/jobs"
  views: {
    desktop: { size: {w: 1440, h: 900}, settings: GridSettings, elements: Element[] };
    mobile:  { size: {w: 390,  h: 844}, settings: GridSettings, elements: Element[] };
  };
}
```

An earlier draft of this doc had the mobile view *derive* from the desktop one, with elements
following along until you moved them. That was wrong for what this tool is for. A phone layout is
not a squeezed desktop layout — it stacks differently, hides things, reorders them, and replaces a
table with cards — and a tool that starts by guessing at that guess is a tool you spend your time
undoing. Two blank canvases, each with the full palette, is what was asked for and it is also the
honest model.

**Each view has its own everything:** its own grid size and snap setting, its own zoom, its own
selection, its own layers, its own element list. Switching views is a tab, and both can be shown
side by side when the screen is wide enough.

**One deliberate convenience, and it is a one-time action rather than a link:** *"Copy selection to
mobile"* (and back) drops copies of the selected elements onto the other view, scaled to fit its
width and stacked in reading order, where they become ordinary elements of that view with no
memory of where they came from. It is a starting point for the ninety per cent of a phone layout
that is "the same things, arranged down the page" — and because nothing is bound, adjusting one view
can never disturb the other.

**The palette is the same in both views.** Every element is available on both canvases; the phone
view is not a restricted mode. Where a catalogue entry has a phone-specific form in the real app
(a table that becomes cards, a toolbar that becomes a sheet), the entry carries both as variants and
the palette offers the phone one first while the mobile view is active — a suggestion, never a
restriction.

**Exports are per view.** A PNG of the desktop view, a PNG of the mobile view, an HTML file for
each, and one `design.json` holding both — which is exactly the handoff the owner described:
*"Once I fully build out the desktop version and mobile version of the page, I will save the
screenshots and the html and I will come back to you and have you adjust the page."*

### 3.3 The palette is generated from the codebase, not hand-written

A hand-written palette is out of date the day after it is written, and this repo has 6,827 classes
to drift from. So the catalogue is **extracted** (§4.3), **curated** (§4.4), and **watched for
drift** (§4.5). Every entry records where it came from — file and line — so any entry can be
re-derived, and so the export can say *"this is `.jobs-page__btn--secondary`, defined at
`AdminJobs.css:412`"* rather than *"a navy button"*.

### 3.4 Storage

Postgres for the design documents (`design_mockups`, `design_mockup_versions`), the private
`design-exports` bucket for rendered PNG/HTML artifacts. The catalogue itself is a **build artifact
committed to the repo** (`lib/design/catalogue/*.json`), not a database table: it is derived from
code, it must version with the code, and a code review should show when it changes.

### 3.5 The export is the product

The screenshot is the *least* useful of the three exports and the owner named it first because it is
the obvious one. The JSON spec is the one that makes the handoff exact — see §12.

---

## §4. The element catalogue

This is Phase 1 and the thing to get right.

### 4.1 Taxonomy

Sixteen categories, which is what the palette's tabs are. Every catalogue entry belongs to exactly
one, and the choice is by *what the thing is*, not where it appears. Fifteen of them hold components
that exist in the app; the sixteenth holds free shapes that answer to nothing (§4.6).

| # | Category | What lives here |
|---|---|---|
| 1 | **Buttons** | primary / secondary / ghost / danger / icon-only / split / FAB / segmented, every size |
| 2 | **Text** | h1–h6, page titles, section titles, body, small, caption, label, code, link, list |
| 3 | **Inputs** | text, email, number, password, search, date, time, datetime, currency, textarea, file, address autocomplete |
| 4 | **Selects & pickers** | select, multi-select, combobox, date range, colour, job/client picker |
| 5 | **Toggles** | switch, checkbox, radio, radio group, segmented control, star/favourite |
| 6 | **Tags & badges** | status pills, stage chips, role badges, count badges, filter chips, tag inputs |
| 7 | **Cards & panels** | stat card, list card, detail panel, section card, accordion, well, callout |
| 8 | **Tables & lists** | table head/row/cell, sortable header, zebra list, definition list, empty row, pagination |
| 9 | **Navigation** | sidebar, icon rail, topbar, breadcrumb, tabs, back link, pagination, stepper, timeline |
| 10 | **Overlays** | modal, sheet, drawer, popover, tooltip, dropdown menu, confirm dialog, lightbox |
| 11 | **Feedback** | empty state, loading skeleton, spinner, toast, inline error, banner, progress bar |
| 12 | **Media** | avatar, initial avatar, thumbnail, image tile, file row, video player, chart, sparkline |
| 13 | **Layout** | page shell, content container, card grid, two-column split, stack, spacer, divider, toolbar row |
| 14 | **Icons** | the lucide set actually used in the app, by name |
| 15 | **Emoji & symbols** | the full Unicode emoji set, plus arrows, maths, currency, typography and box-drawing characters |
| 16 | **Shapes & annotation** | free primitives that belong to no component — §4.6 |

### 4.5b Scope: the whole site, tagged by area

> Owner: *"meticulously scan each and every page and fully scrub everything so that we can get and
> categorize every element on the website, both for the frontend and the backend."*

The scanner walks all of `app/`, not just `app/admin`. Re-run across the whole site on 2026-08-23:

| | |
|---|---:|
| Stylesheets | 96 |
| `.tsx` files | 983 |
| CSS rule sets | 18,005 |
| `<style jsx>` rule sets | 643 |
| `className` usage sites | 19,367 |
| Inline `style={{ }}` sites | **7,924** |
| Distinct classes | 10,683 |

Every finding carries an **area**, and the area is a first-class field on catalogue entries because
these surfaces do not share a vocabulary:

| Area | class usages | what it is |
|---|---:|---|
| `cad` | 13,973 | the drawing editor — its own dark, Tailwind-based language |
| `admin` | 10,459 | **the employee portal** |
| `research` | 4,174 | the research workspace — also Tailwind |
| `andrew-ash` | 1,839 | a separate product |
| `dnd` | 1,645 | a separate product |
| `marketing` | 654 | **the public site** |
| `shared` | 375 | tokens, forms, shared components |
| `customer` | 297 | portal / pay / proposal / change-order / share |
| `auth` | 129 | register / signup / credentials |

**The palette's default scope is `admin + marketing + customer + auth + shared`** — the frontend and
the backend of *this* business's website. `cad`, `research`, `dnd` and `andrew-ash` are scanned and
catalogued but filtered out by default, reachable behind an "include other products" toggle. A
palette that offered a marketing hero button for an admin toolbar would be worse than a smaller one.

### 4.5c What the punch list already says

`scripts/design-catalogue-report.mjs` (slice C2, built) on the in-scope surfaces — 7,112 classes:

| Report | Count | The shape of it |
|---|---:|---|
| **Repeated shapes** | **240** | 11 separate definitions of the same input in `AdminJobs.css` alone (`.job-research__input`, `.job-time__input`, `.job-equipment__input`, `.job-team__input`…). 10 identical section titles across five marketing stylesheets. **9 identical loading/error/empty blocks** written per page (`.announcements-empty`, `.billing-error`, `.invoices-loading`, `.support-error`…). |
| **Divergences** | **189** | elements whose inline style overrides the class they wear — `.emp-list__select` given `min-width`, `height` and `box-sizing` inline, twice on one page; `.btn` overridden on `width`, `padding`, `font-size` and `opacity`. |
| **Orphans** | **1,330** | styled, never used. 302 in `AdminResearch.css`, 274 in `AdminLearn.css`, 94 in `AdminLayout.css`. |
| **Distinct literal control heights** | **59** | the token set has three (32 / 40 / 48). **36px appears 33 times and 38px 23 times.** |

That last row is the owner's complaint, measured: a row whose controls are 36, 38 and 40 pixels tall
looks wrong and nobody can say why. The report names every one, with its file and line.

Both scripts are built and runnable now:

```bash
node scripts/design-catalogue-scan.mjs      # raw scan → lib/design/catalogue/raw/ (git-ignored)
node scripts/design-catalogue-report.mjs    # punch list → docs/planning/qa-evidence/
```

### 4.6 Shapes, labels and annotation

> Owner: *"I will also just need to be able to create shapes and add labels and text wherever I
> want and color them and edit them and stuff. Like, if I make a red square, I need to then also be
> able to round the corners more or less if I want to."*

Everything in categories 1–15 is a *component from the app*. This category is the opposite: raw
primitives that answer to nothing, for the moments when the point is "a red block goes here, about
this big" rather than "a secondary button goes here".

**The primitives:**

| Primitive | Notes |
|---|---|
| Rectangle | the workhorse; corner radius per corner or linked |
| Ellipse / circle | shift-drag for a true circle |
| Line | straight, with optional arrowheads at either end |
| Arrow | a line with a head, for pointing at things |
| Triangle / polygon | n-sided, rotatable |
| Text label | free text at any position, no component semantics |
| Sticky note | a coloured note with text — reads as a comment, not as UI |
| Callout / speech bubble | a box with a tail you can drag to point at an element |
| Frame / box | a container outline for grouping regions of a design visually |
| Image placeholder | a box with a diagonal cross and a caption, for "a photo goes here" |
| Measure / bracket | a dimension line with a label, for "this gutter should be 24px" |

**Every shape's inspector** (§7 gains a Shape section when one is selected):

- **Fill** — solid, none, or a two-stop linear gradient with an angle. Token colours first, custom
  after, with the same off-system marking as everywhere else.
- **Stroke** — width, colour, style (solid / dashed / dotted), and alignment (inside / centre /
  outside).
- **Corner radius** — one control that rounds all four, and a disclosure that breaks it into four so
  a card can have two square corners and two round ones. Rectangles, frames, image placeholders and
  callouts all get it; a slider *and* a number box, because dragging is how you find the value you
  like and typing is how you match one you already chose.
- **Rotation** — degrees, with 15° snapping while `Shift` is held.
- **Opacity**, **shadow** (the four token shadows plus custom), and **blend** for a highlight wash
  over a screenshot.
- **Flip** horizontal / vertical.
- **Aspect lock** while resizing.

**Any shape can carry a label.** Text inside a rectangle is centred by default with its own
alignment, padding, colour and typography — so "a red square that says DANGER ZONE" is one object,
not two that have to be dragged around together.

**Text elements are first-class anywhere**, not only inside shapes: click the text tool, click the
artboard, type. Full typography from §7 and §8, no component wrapper, no class.

**Annotation is a separate layer, and this matters for the export.** Sticky notes, callouts,
arrows, measure lines and anything marked *annotation* are drawing *about* the design rather than
part of it. They render in the canvas, they appear in the PNG (that is their whole purpose), and in
`design.json` they are a **separate `annotations` array** — so the agent building the page reads
"the gutter should be 24px" as an instruction and does not try to render a red arrow into the
product. A toggle hides the annotation layer for a clean screenshot.

### 4.2 Entry schema

`lib/design/catalogue/types.ts`:

```ts
export interface CatalogueEntry {
  id: string;                    // 'button.secondary', 'input.date', 'tag.status-pill'
  category: CategoryId;          // §4.1
  label: string;                 // 'Secondary button'
  description: string;           // what it is for, in one line
  keywords: string[];            // palette search
  html: string;                  // the markup, with {{slots}}
  classes: string[];             // real classes it wears
  slots: Slot[];                 // editable text/icon/emoji holes
  props: PropDef[];              // what the inspector may change (§7)
  defaults: Record<string, string | number | boolean>;
  variants: Variant[];           // modifier classes: --primary, --sm, is-on …
  states: StateName[];           // hover | focus | active | disabled | loading | error | empty
  size: {
    default: { w: number; h: number };
    resize: 'both' | 'width' | 'none';
    min?: { w?: number; h?: number };
  };
  anchors: AnchorSet;            // §5.2 — where it snaps from
  source: SourceRef[];           // { file, line, kind: 'css' | 'inline' | 'styled-jsx' | 'tsx' }
  usage: { route: string; count: number }[];   // where it appears, most-used first
  contract?: { minTapTarget?: number; minFontPx?: number };
  sourceHash: string;            // §4.5 drift detection
}
```

Two fields deserve a note.

**`usage`** is what turns the palette from an alphabetical list into a useful one: the palette sorts
by how often something is actually used, so the button you reach for first is the button the app
actually uses most. It is also the raw material for the punch list (§14) — *seventeen* variants of
"a small grey button", each defined separately, is exactly the repetition the owner keeps finding.

**`source`** makes every entry falsifiable. An entry that cannot say where it came from is a guess.

### 4.3 Extraction — four sources, because there are four

`scripts/design-catalogue-scan.mjs` walks the repo and emits `raw-*.json`. It reads:

1. **CSS rule sets** (55 files). For each selector: the declarations, the file and line, and the
   modifiers that share its block (`--primary`, `--sm`, `is-on`). This gives shape, colour and size.
2. **JSX usage** (558 files). Every `className="…"` occurrence, resolved to a route via the file
   path, giving `usage` counts and — critically — the **markup shape**: which element tag, what
   nests inside it, which icon component, what the text looks like. A catalogue entry's `html` comes
   from the most common real usage, not from someone's idea of the markup.
3. **Inline `style={{ … }}`** (3,255 sites). Parsed into declarations and attached to the element
   they sit on. Where an inline style *differs* from the class it accompanies, that is recorded as a
   **divergence** — the raw material for §14, and the reason a scan of CSS alone would be a lie.
4. **`<style jsx>` blocks** (37 files), which are CSS but invisible to a CSS-file walker.

The scan is deliberately *dumb and complete*: it does not decide what is an "element", it records
everything with provenance. Deciding is the next step, and it is done by a person.

### 4.4 Curation

The scan produces thousands of candidates. Curation reduces them to a palette a human can use, and
it is a judgement call that must be recorded rather than performed silently:

- `lib/design/catalogue/curated/*.ts` holds the hand-written entries — one file per category,
  each entry citing the raw candidates it covers.
- A candidate that is **not** promoted must be marked with a reason: `duplicate-of: button.secondary`,
  `one-off: /admin/cad`, `dead: no usage`, `deprecated: use x`. Nothing is dropped in silence.
- `npm run design:catalogue -- --report` prints coverage: how many raw candidates are accounted for,
  and by what. **Coverage is the completion criterion for Phase 1**, not a count of entries.

This is what makes "catalogue every element of every kind" a checkable claim instead of a feeling.

### 4.5 Drift

`__tests__/design/catalogue-drift.test.ts` recomputes `sourceHash` for every entry from the files it
cites. When the underlying CSS changes, the test fails with the entry name and the file that moved.
The fix is to re-scan and re-curate — never to update the hash by hand.

Same discipline as `inline-style-hex-ratchet.test.ts`, which this repo already runs, and for the
same reason: a catalogue that silently rots is worse than no catalogue, because it is trusted.

### 4.7 Tagging and search — the feature that makes the catalogue usable

> Owner: *"if I type 'date' into the element search bar, every element that deals with scheduling
> and dates and calendars and maybe even clocks and timers should show up… I want to create a
> completely robust and functional and helpful search feature to look through all of the elements."*

A palette of a few hundred entries across sixteen categories is a filing cabinet. Search is how it
becomes a tool, and the requirement above is specific: **searching for a word must find things that
word does not appear in.** That is a concept search, not a string match, and it needs three layers.

#### Layer 1 — what every entry carries

Beyond `label` and `description`, each entry gets four searchable vocabularies:

| Field | Example on `input.date` | Where it comes from |
|---|---|---|
| `keywords` | `date`, `date picker`, `calendar input`, `due date`, `deadline` | hand-written during curation |
| `concepts` | `time`, `scheduling`, `forms` | from the concept graph below |
| `synonyms` | `datepicker`, `day picker`, `when` | hand-written; the words people actually type |
| `derived` | `.job-form__input`, `/admin/jobs/new`, `<input type="date">`, `admin` | generated from the scan — classes, routes, tag, area |

`derived` is free and surprisingly powerful: typing a class name, a route, or `type=date` finds the
thing, which is exactly what somebody who half-remembers the code will type.

#### Layer 2 — the concept graph

A concept is a node with an expansion set. `lib/design/search/concepts.ts` holds them, and a query
term matching any member expands to the whole concept, at a lower weight than a direct hit.

```
time        → date · time · datetime · calendar · schedule · scheduling · deadline · due
              clock · timer · stopwatch · duration · timestamp · shift · appointment
              availability · day · week · month · year · range · recurring · reminder
money       → currency · price · cost · amount · invoice · quote · bid · payment · payout
              receipt · expense · tax · rate · total · balance · dollar
person      → user · employee · crew · client · customer · contact · avatar · profile
              assignee · owner · role · permission · team
place       → address · location · map · gps · coordinates · county · parcel · site · route
status      → state · stage · badge · pill · chip · tag · label · flag · progress · health
input       → field · form · entry · control · text · textarea · number · picker · upload
choice      → select · dropdown · combobox · radio · checkbox · toggle · switch · segmented
action      → button · cta · submit · save · cancel · delete · confirm · link · menu
container   → card · panel · section · box · well · frame · group · accordion · tabs
data        → table · list · row · grid · column · sort · filter · paginate · export
feedback    → empty · loading · skeleton · spinner · error · warning · success · toast · banner
media       → image · photo · video · file · document · attachment · thumbnail · gallery · preview
navigation  → nav · menu · sidebar · breadcrumb · back · link · tab · step · wizard · pagination
measure     → size · dimension · acreage · distance · bearing · area · length · unit
comms       → message · chat · comment · note · email · notification · alert · discussion
```

Typing `date` therefore returns: the date input, the date-range picker, the calendar month grid, the
deadline chip, the schedule row, the timer/clock pill, the timestamp caption, the "due" badge, the
availability grid — ranked with the literal `date` matches first. That is the owner's test, and it
is the acceptance criterion for the slice.

**Concepts are also facets.** The palette shows them as pills under the search box, so a search can
be narrowed by clicking rather than by typing a better query.

#### Layer 3 — the matcher

`lib/design/search/index.ts`, pure and unit-tested, built over a prebuilt inverted index (committed
JSON, generated with the catalogue so it can never drift from it):

- **Match tiers**, in descending weight: exact label · label prefix · exact keyword/synonym ·
  keyword prefix · concept expansion · description word · derived token (class/route/tag) ·
  **fuzzy** (Levenshtein ≤ 2 for terms of 5+ characters, plus trigram overlap for longer ones, so
  `calender` and `buton` both work).
- **Field weights**: label 10 · keywords 8 · synonyms 8 · concepts 5 · description 3 · derived 2.
- **Boosts**: real usage count (log-scaled — the button the app uses 274 times outranks one used
  twice), your own recent placements, and favourites.
- **Multi-term** queries AND together; quoted `"date range"` is a phrase; `-icon` excludes.
- **Filters in the query**: `category:inputs`, `area:marketing`, `state:disabled`, `is:interactive`,
  `has:icon` — with autocomplete on the filter values, because a syntax nobody can discover is a
  syntax nobody uses.
- **Never a dead end.** Zero results falls back to fuzzy-only, then to the nearest concepts, and
  says which it did: *"nothing matched 'chronometer' — showing 12 results for the concept time"*.

#### The search panel

`/` focuses it from anywhere. Results are live previews in a grid, grouped by category with counts,
arrow keys navigate, `Enter` places the top hit at the artboard centre, `Esc` clears. Under the box:
recent searches, then concept pills, then favourites. Every result shows a "why" line on hover —
*matched: keyword "deadline" · concept time* — because a search you cannot reason about is one you
stop trusting the moment it surprises you.

---

## §5. Canvas and placement

### 5.1 Viewports

| Artboard | Size | Why |
|---|---|---|
| Desktop | 1440 × 900 | the office laptop; the width the alignment audits measure |
| Phone | 390 × 844 | iPhone 14/15; the width the field crew actually uses |

**Artboards scroll, and the fold is drawn.** A real page is not 900px tall — the job detail page is
2,964px on a phone. So the height above is the *viewport*, not the artboard: the artboard grows as
far down as the design needs, and a labelled **fold line** is drawn at each viewport multiple
(900 / 1800 / 2700 on desktop, 844 / 1688 / … on phone). Almost every "why did nobody see this"
layout problem lives just below a fold, and a fixed-height canvas is a canvas that cannot show one.

**The phone artboard draws its safe areas** — the notch/dynamic-island strip at the top and the home
indicator at the bottom — because a control placed under either is a control nobody can tap.

Both sizes are editable per design (a tablet artboard at 768 is a preset), and the frame shows a
device chrome outline so a phone mockup reads as a phone. Zoom 25–200 %, fit-to-window, and pan
with space-drag. Rulers along both edges, in CSS pixels.

### 5.2 Grid, snapping, anchors

- **Grid**: on/off, size settable (4 / 8 / 12 / 16 / 24 / 32 / custom), shown as dots or lines,
  with a heavier line every N cells. Default 8px, because the token spacing scale is built on 4/8.
- **Snap**: independent of whether the grid is *shown*. Off = free placement, exactly as asked.
- **Anchors** are the "nodes" the owner described. Every element carries nine: four corners, four
  edge midpoints, and its centre — plus a **text baseline** anchor for text elements, because
  aligning two labels by their boxes is not the same as aligning them by their baselines, and the
  difference is visible.
- The **active anchor** is chosen by which handle you grabbed, and it is the point that snaps. Drag
  by the top-left and the top-left lands on the grid; drag by the centre and the centre does.
- **Smart guides** in addition to the grid: edges and centres align to *other elements*, with the
  standard magenta guide lines and equal-spacing pips. This is what makes a layout look composed,
  and no grid size can substitute for it.
- **Snap strength**: a threshold in pixels (default 6), so snapping assists rather than fights.

### 5.3 Selection and manipulation

Click to select, shift-click to add, marquee-drag to select a region, `Esc` to deselect. Eight
resize handles; `Shift` constrains proportion; `Alt` resizes from the centre. Arrow keys nudge 1px,
`Shift`+arrow 10px, and with snapping on, arrows move by one grid cell instead.

### 5.4 Order, grouping, locking, alignment

Bring forward / send back (`]` / `[`), group and ungroup (`Ctrl+G` / `Ctrl+Shift+G`), lock (which
prevents selection until unlocked, so a background frame stops getting grabbed), and an align/
distribute toolbar: left/centre/right, top/middle/bottom, distribute horizontally/vertically, and
"space evenly". A **layers panel** lists everything on the artboard in z-order with names, because
by the twentieth element clicking around is not navigation.

### 5.5 Undo

A command stack — every mutation is a command with `do`/`undo`, `Ctrl+Z` / `Ctrl+Shift+Z`, 100
levels, and coalescing so a drag is one undo rather than sixty. `lib/cad/hotkeys/*` already models
the keybinding half of this, including conflict detection.

---

## §6. The side panel

Tabs down the left (icon + label), category contents as a scrollable grid of **live previews** —
each palette item is the real element, rendered small, not a screenshot of one. Search across labels
and keywords (`Ctrl+F`). Recently used pinned at the top. Favourites.

Drag from the palette to an artboard, or click to drop at the artboard centre. While dragging, the
artboard shows the grid and the snap target.

A **custom blocks** tab holds groups you have saved as reusable pieces (§11) — "my job header",
"the filter row I like" — which is how a design system actually gets used in practice.

---

## §7. The inspector

Right rail, driven by the selected element's `props`. Sections:

- **Identity** — the catalogue entry it came from, its variant, and a name you can set.
- **Content** — the slots: label text, helper text, placeholder, icon, emoji, count.
- **Layout** — x, y, w, h (in px, with the grid cell as a secondary unit), padding, gap, alignment.
- **Type** — family (§8), size, weight, line height, letter spacing, transform, colour, alignment.
- **Colour** — background, text, border. **The palette's tokens come first**, with a "custom" escape
  hatch that is visually marked as off-system, because a mockup full of hand-picked hexes is a
  mockup nobody can build with the design system.
- **Border & shape** — width, style, colour, radius per corner.
- **Effects** — opacity, shadow (the four token shadows first), blur.
- **State** — which state to preview: default / hover / focus / disabled / loading / error / empty.
  The mockup can *say* "this is what the disabled one looks like", which today is where a large
  share of the app's inconsistency hides.
- **Placement** — which view this element lives on (§3.2), and a one-click *copy to the other
  view*. The two views are independent, so there is nothing here to keep in sync — which is the
  point.
- **Notes** — free text attached to the element, exported in the spec (§12). *"This should open the
  file viewer, not download"* is the most valuable thing on the whole screen and it is not a visual
  property.

Multi-select edits the intersection of the selected elements' props, which is how you make six
buttons the same height in one action.

---

## §8. The libraries

> Owner: *"Please make sure we have access to all emojis, text font, symbols, etc."*

Four libraries, and each is complete rather than a selection somebody made:

- **Fonts.** Three tiers, in this order: the app's own stack (Sora for headings, Inter for UI, the
  mono stack for numbers); every font already loadable in this app; then **the full Google Fonts
  catalogue**, searchable by name and filterable by category (sans, serif, mono, display,
  handwriting) with a live preview of your own text in each. Weights and italics per family, and
  variable-font axes where a family has them.
  A font outside the app's stack is **marked as off-system** in the canvas and named in the export,
  because adding a typeface is a real decision with a real cost — but it is never blocked, since
  "this page should feel different" is a legitimate thing for a mockup to say.
- **Colour.** The token ramps from `tokens.css`, grouped as they are there (brand, text, surface,
  border, status, phase). A picker for custom, with a **contrast readout** against the current
  background (WCAG AA/AAA), since the app has eleven themes and white-on-white has happened before.
- **Icons.** Every lucide icon actually imported anywhere in the app, by name, searchable — plus the
  full lucide set behind a "show all" toggle so the mockup can ask for something new.
- **Emoji.** **The complete Unicode set** — every group (smileys, people, animals, food, travel,
  activities, objects, symbols, flags), searchable by name, keyword and shortcode (`:calendar:`),
  with skin-tone and gender variants where they exist, and a recents row. A first group,
  **"used in this app"**, holds the stage/status/section emoji the portal already uses, because
  those carry meaning here. Committed as static JSON — no runtime dependency, no network call, and
  no picker that quietly differs from the one in the messenger.

- **Symbols.** Everything that is a character but not an emoji, which is the set people give up
  looking for and paste from a web page: arrows (→ ⇒ ↕ ➜), maths and logic (× ÷ ± ≈ ≤ ∑ √ ∞ °),
  currency (¤ ¢ £ € ¥ ₿), punctuation and typography (— – … ‹› «» “” ‘’ † ‡ § ¶ • ·), legal
  (© ® ™), fractions (½ ⅓ ¾), superscripts and subscripts, geometric shapes (■ ● ▲ ◆ ▸),
  box-drawing and block elements (│ ├ ─ █ ░) — which this codebase's own comment headers use —
  check marks and crosses (✓ ✔ ✗ ✕), stars (★ ☆ ✦), and the survey-relevant ones the field actually
  needs: degrees, minutes and seconds (° ′ ″) for bearings, ± for tolerance, and Δ for change.
  Searchable by name, by category, and by the character itself.

---

## §9. Content realism

A mockup that says `Lorem ipsum` teaches you nothing about whether a layout survives real data.

- Every text slot has **realistic defaults** drawn from the app's own vocabulary: job numbers
  (`26135`), project numbers (`P-2026-0009`), client names, survey types, stage names, currency,
  dates in the app's format.
- **"Stress" toggle** per artboard: swaps every string for the longest realistic one — the longest
  client name in the database, a 60-character project title, `$1,234,567.89`. This is not a
  nicety: the New Job form's Project select ran 190px off the right edge of a phone on 2026-08-22
  because one long project name set the width of the whole form, and a stress toggle would have
  shown that in the mockup.
- **Empty / one / many** toggle for lists and tables, because those three states are three different
  designs and only one of them usually gets drawn.

---

## §10. The contract, enforced in the canvas

The studio runs the same rules that measure the real app, live, on the mockup:

- controls under **40px** on the phone artboard (`--button-height`),
- text under **12px**,
- colours that are not tokens,
- elements overflowing the artboard,
- contrast below AA.

Findings appear as a quiet badge on the element and a list in a "Checks" tab — not as a blocking
error, because a mockup is allowed to propose something new. But it must do so *deliberately*, and
each finding can be dismissed with a reason that is carried into the export.

`scripts/ui-fit-sweep.mjs` already implements the measurement half of this against real pages; the
in-canvas version shares its thresholds so the tool and the audit cannot disagree.

---

## §11. Saving, variants, history

The core loop the owner named — *name it, save it, open it later, keep working* — is the baseline,
not a feature: a design has a **name** you set when you first save (and can rename any time), it
lives in a **list you can search and filter by route**, and opening one restores the artboards, the
grid settings, the zoom, the selection and the scroll position exactly as you left them. Closing the
tab without saving loses nothing, because of the autosave below.

- A **design** belongs to a route (`/admin/jobs`) or to nothing (a scratch idea), and has a name.
- **Variants** are siblings: "Jobs list — A (dense)", "Jobs list — B (cards)". Duplicating a design
  makes a variant, and variants can be viewed side by side.
- **Versions** are automatic: every save writes a version row with a diff summary, and any version
  can be restored or branched. The D&D character-sheet history (`lib/dnd/edit-history.ts`) is the
  precedent in this repo for revert-a-batch semantics.
- **Autosave** to `localStorage` every few seconds against the design id, so a closed tab is not a
  lost afternoon; explicit save writes the version.
- **Custom blocks**: any selection can be saved to the palette as a reusable block (§6).

---

## §12. Export — the handoff contract

> Owner: *"I need to be able to both save the design as a html/css file(s), and also just capture
> the canvas view as an image. I need to be able to name the design and save it and be able to open
> it and work on it more in the future."*

Three artifacts, produced together, from one button:

1. **PNG** of each artboard, and one of both side by side — a straight capture of the canvas view,
   with a toggle for whether the annotation layer (§4.6) is in the shot. Also copy-to-clipboard,
   because the next thing that happens to it is usually a paste.
2. **HTML and CSS.** Two forms, both offered:
   - **`design.html` — standalone.** The markup with the styles inlined, opening correctly from a
     file:// URL with no server and no build. This is the one to hand to somebody.
   - **`design.html` + `design.css` — a pair.** The same markup with a linked stylesheet, for when
     you want to read or tweak the CSS by hand. The stylesheet contains only the rules the design
     actually uses, with the token definitions it depends on at the top.
3. **`design.json` — the spec that makes the build unambiguous.** Its `annotations` array is
   kept separate from its `elements` array (§4.6): an arrow pointing at a button is an instruction
   about the design, not a thing to build, and conflating the two is how a red arrow ends up in
   production. For every element: its catalogue
   id, **the real class names it maps to**, its geometry at both breakpoints, its content, its
   state coverage, its notes, and any dismissed contract findings with their reasons. Plus a header:
   the target route, the design name and variant, the token set, and the checklist of what the owner
   wants different from today.

The third one is what turns *"build this page"* into *"place `.job-detail__action--ghost` here,
40px, with this label, and note that on phone it moves below the title"*. A screenshot cannot say
that, and every ambiguity it leaves is a round trip.

**Also exported:** a `PROMPT.md` — a ready-to-paste brief that references the other three files and
states the intent in prose. The owner's stated workflow is "upload it to the claude code AI", and
the difference between a good and a bad first attempt is almost entirely in that brief.

---

## §13. Import — trace a real page into the canvas

The fastest way to redesign an existing page is to start from it.

`scripts/design-import-page.mjs` drives a real browser (Playwright, already a devDependency) to a
signed-in admin route at both breakpoints and captures every visible element's box, classes, text
and computed styles into a design document. It opens in the studio as **editable elements**, matched
to catalogue entries where the classes line up.

Two things fall out of this that are worth more than the feature itself:

- It is the fastest possible **catalogue coverage check**: any element on a real page that matches
  no catalogue entry is a gap, named, with the route it came from.
- It gives the owner "here is what the page is today" next to "here is what I want" — which is the
  clearest possible brief, and it is one click.

---

## §14. The punch list — the owner's actual motivation

*"I still find tons of repetitive elements and poorly formatted elements that need to be fixed, or
are simply non-functional at all."*

The catalogue answers this as a by-product, and the studio should surface it explicitly:

- **Repetition report.** Candidates whose declarations are near-identical but which are defined
  separately — *"11 definitions of a 32px pill button across 9 files"* — with every file and line.
  This is a work order for consolidation, produced by measurement rather than by noticing.
- **Divergence report.** Elements whose inline styles contradict the class they wear (§4.3), which
  is where "poorly formatted" mostly comes from.
- **Orphan report.** Classes defined in CSS that no JSX uses: dead style, safe to delete.
- **Flagging in the canvas.** Any element on an imported page (§13) can be tagged
  `broken` / `duplicate` / `non-functional` / `ugly` with a note; the tags export as a punch list.

These three reports should run in Phase 1, because they are free once the scan exists — and they are
the closest thing to a direct answer to what the owner asked for.

---

## §15. Route, permissions, flag

- `/admin/design` (index: designs list) and `/admin/design/[id]` (the editor).
- **Admin + developer only.** It exposes the whole app's structure and is a build tool, not a
  business surface.
- Registered in `lib/admin/route-registry.ts` under Office, `iconName: 'PenTool'`, so the palette,
  rail and breadcrumbs find it.
- Behind `NEXT_PUBLIC_DESIGN_STUDIO=1` until Phase 8 completes, following the same killswitch
  discipline `RegisterAdminPWA` uses — a flag that turns a feature off must also *undo* it.

---

## §16. Data model

`seeds/609_design_studio.sql`:

```sql
design_mockups(
  id uuid pk, name text not null, route text, variant_of uuid null,
  views jsonb not null,                -- { desktop: {size,settings,elements}, mobile: {…} }
  document jsonb not null,             -- the element list
  settings jsonb not null,             -- grid size, snap, guides
  owner_email text not null, org_id uuid, status text default 'draft',
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz
)
design_mockup_versions(
  id uuid pk, mockup_id uuid fk, version int, document jsonb, summary text,
  author_email text, created_at timestamptz
)
design_mockup_exports(
  id uuid pk, mockup_id uuid fk, kind text,   -- png | html | json | prompt
  storage_bucket text, storage_path text, bytes bigint, created_at timestamptz
)
```

Plus a private `design-exports` bucket at 50 MB (a PNG of two artboards is not a video). Per
`lib/storage/uploads.ts`, the app cap and the bucket must be raised together and in that order.

---

## §17. Dependencies

| Need | Decision |
|---|---|
| Drag & drop | `@dnd-kit/*` — **already installed** |
| Resize handles | hand-rolled; CAD's `ResizeHandle` is the precedent |
| Hotkeys | `lib/cad/hotkeys/*` — reuse the engine |
| PNG export | `html-to-image` (~10 kB, MIT) — new dependency, see risk R3 |
| PDF export | `jspdf` — already installed |
| Page import | `playwright` — already a devDependency, runs locally only |
| Emoji data | a static JSON of the Unicode set, committed; no runtime dependency |

---

## §18. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **The catalogue is enormous and curation stalls.** 6,827 classes is a lot of judgement. | Curate by usage: the top 200 classes cover the overwhelming majority of screens. Coverage report (§4.4) makes the remainder visible rather than forgotten. |
| R2 | **The catalogue rots.** | Drift ratchet (§4.5), which fails the suite rather than degrading quietly. |
| R3 | **PNG export fidelity.** `html-to-image` uses SVG `foreignObject` and can miss cross-origin images and some fonts. | Fonts are self-hosted or Google Fonts (allowed); images in mockups are placeholders. Fallback: the OS screenshot, which is what the owner does today. |
| R4 | **The studio's CSS collides with the artboard's.** The editor chrome and the mockup both live in one document. | The artboard renders inside an `<iframe srcdoc>` with only the app's stylesheets loaded. Isolation by construction rather than by naming discipline. |
| R5 | **Mockups drift from what is buildable** — someone designs a control the design system cannot express. | §10's checks, and the export naming real classes: an element with no class mapping is visible in the spec as "new component required", which is a decision made on purpose. |
| R6 | **Scope creep into a real page builder.** | §2. |

---

## §19. Phases and slices

### Phase 0 — A studio you can open *(built first, deliberately)*

> Owner: *"Make sure to surface this page somewhere so that I can access it and actually start
> editing/changing things."*

Curating 7,000 classes before anything is on screen would be months of invisible work, and a
palette curated without ever having used the tool would be curated wrong. So a walking skeleton
ships first: a real route, a real canvas, a small real palette, and a real export. Everything after
it deepens something you can already open.

- [ ] **W1 — The route.** `/admin/design` and `/admin/design/[id]`, admin+developer gate, registry
      entry, flag. Empty state that explains the tool.
- [ ] **W2 — The artboards.** Desktop and mobile as independent canvases (§3.2), iframe-isolated,
      scrolling with fold lines, zoom and pan, safe areas on the phone.
- [ ] **W3 — Grid, snap, drop.** Grid on/off, size control, snapping with anchors, drag from palette
      to artboard, select, move, resize, nudge, delete.
- [ ] **W4 — A starter palette.** The first curated categories (buttons, text, inputs, layout,
      shapes) — enough to lay out a real page — with the search box working over them.
- [ ] **W5 — Save and reopen.** Name a design, save it, list it, open it, keep working. Autosave and
      crash recovery.
- [ ] **W6 — Export.** PNG of each view, HTML per view, `design.json`. This closes the owner's loop
      end to end: design both views, export, hand back for building.

### Phase 1 — The catalogue *(the depth behind W4)*

- [ ] **C1 — Scanner.** `scripts/design-catalogue-scan.mjs`: CSS rules, JSX usage, inline styles,
      styled-jsx, all with provenance. Emits `lib/design/catalogue/raw/*.json`. Unit tests for the
      parsers, including the inline-style walker (the brace-matching lesson from
      `scan-inline-style-hex.ts` applies directly).
- [ ] **C2 — Reports.** Repetition, divergence and orphan reports (§14) from the raw scan.
      `npm run design:catalogue -- --report`.
- [ ] **C3 — Schema + taxonomy.** `lib/design/catalogue/types.ts`, the fifteen categories, the
      curation file layout, and the coverage reporter.
- [ ] **C4 — Curate: Buttons, Inputs, Selects, Toggles.** The four highest-traffic categories.
- [ ] **C5 — Curate: Text, Tags & badges, Cards & panels.**
- [ ] **C6 — Curate: Tables & lists, Navigation, Overlays.**
- [ ] **C7 — Curate: Feedback, Media, Layout, Shell.**
- [ ] **C8 — The four libraries (§8): fonts, colour, icons, emoji, symbols.** Full Google Fonts
      catalogue with live preview; the complete Unicode emoji set with skin tones and shortcodes;
      the symbol sets (arrows, maths, currency, typography, geometric, box-drawing, survey marks);
      lucide icons ranked by what the app already imports. All committed as static data.
- [ ] **C8b — Shapes & annotation primitives (§4.6).** The eleven primitives, their inspector
      sections (fill, stroke, per-corner radius, rotation, opacity, shadow, flip), labels inside
      shapes, and the annotation-layer split that keeps arrows out of the build spec.
- [ ] **C8c — Tag vocabularies.** `keywords`, `synonyms` and `concepts` on every curated entry, and
      `lib/design/search/concepts.ts` — the seventeen concept groups of §4.7, each with its full
      expansion set.
- [ ] **C8d — The search engine.** `lib/design/search/index.ts`: inverted index generation, the
      match tiers, field weights, usage boost, fuzzy matching, filter syntax, and the never-a-dead-
      end fallback. Pure and unit-tested. **Acceptance: typing `date` returns the date input, the
      range picker, the calendar grid, the deadline chip, the schedule row, the timer pill and the
      timestamp caption, in that order of relevance.**
- [ ] **C9 — Per-page sweep, frontend and backend.** Walk every page — the 147 admin registry routes
      *and* the public site, customer and auth surfaces — and confirm every element on each maps to
      a catalogue entry; file the gaps. This is the "go through each and every page" pass, and it is
      done *last* so it checks the catalogue rather than building it. Output: a coverage table, one
      row per route, and a gap list.
- [ ] **C10 — Drift ratchet.** `__tests__/design/catalogue-drift.test.ts`, plus a coverage floor so
      the number of catalogued elements can never silently go down.

### Phase 2 — Canvas
- [ ] **V1** Artboard shell, iframe isolation, zoom/pan/rulers.
- [ ] **V2** Grid, snap, anchors, snap strength.
- [ ] **V3** Selection, drag, resize, nudge.
- [ ] **V4** Smart guides, align/distribute.
- [ ] **V5** Z-order, group, lock, layers panel.
- [ ] **V6** Undo/redo command stack + hotkeys.

### Phase 3 — Palette
- [ ] **P1** Tabs, live previews, recents, favourites.
- [ ] **P1b** The search panel (§4.7): the box, concept pills, grouped results, keyboard
      navigation, the "why it matched" line, and filter autocomplete.
- [ ] **P2** Drag-to-place from palette.
- [ ] **P3** Custom blocks.

### Phase 4 — Inspector
- [ ] **I1** Content, layout, type sections.
- [ ] **I2** Colour with tokens-first + contrast readout.
- [ ] **I3** Border, effects, opacity.
- [ ] **I4** States preview.
- [ ] **I5** Placement section: view membership, copy-to-other-view (scaled + stacked).
- [ ] **I6** Notes.
- [ ] **I7** Multi-select editing.

### Phase 5 — Content realism
- [ ] **D1** Realistic defaults per slot.
- [ ] **D2** Stress toggle.
- [ ] **D3** Empty/one/many toggle.

### Phase 6 — Persistence
- [ ] **S1** Seed 609 + API routes.
- [ ] **S2** Designs list (searchable, filterable by route), create, name, rename, open, delete,
      restore. Opening restores artboards, grid settings, zoom and scroll.
- [ ] **S3** Variants + side-by-side.
- [ ] **S4** Versions + restore + autosave.

### Phase 7 — Export
- [ ] **E1** PNG.
- [ ] **E2** HTML export — standalone, and the html+css pair.
- [ ] **E3** `design.json` spec.
- [ ] **E4** `PROMPT.md` brief.
- [ ] **E5** Download-all as a zip; save to the exports bucket.

### Phase 8 — The page
- [ ] **A1** `/admin/design` + `[id]`, role gate, registry entry, flag.
- [ ] **A2** Empty states, onboarding, keyboard-shortcut help.
- [ ] **A3** Remove the flag; announce.

### Phase 9 — Checks
- [ ] **Q1** In-canvas contract checks (§10) sharing thresholds with `ui-fit-sweep`.
- [ ] **Q2** Contrast checks.
- [ ] **Q3** Dismiss-with-reason, carried into the export.

### Phase 10 — Import
- [ ] **M1** `scripts/design-import-page.mjs`.
- [ ] **M2** Match imported elements to catalogue entries; report unmatched.
- [ ] **M3** Flagging + punch-list export (§14).

### Phase 11 — QA
- [ ] **T1** Browser pass: build a real mockup of `/admin/jobs` end to end, export all four
      artifacts, and hand them to a fresh agent to build from. The measure of this tool is whether
      that agent produces the right page without asking a question.
- [ ] **T2** Full suite + `npm run build` + the fit sweep on the new route.

---

## §20. Test plan

- **Unit** — scanner parsers, catalogue schema validation, snap maths (grid, anchors, guides),
  geometry transforms between breakpoints, the export serialisers.
- **Ratchet** — catalogue drift (§4.5); coverage cannot go down.
- **Browser** — a scripted pass that places elements, snaps them, resizes, saves, exports, reloads
  and confirms the design is identical. This repo's habit of driving the real surface (§T1) exists
  because a green suite has repeatedly missed exactly this class of bug.

---

## §20b. Things that were not asked for, and should be there anyway

Each of these is small next to what it prevents.

1. **Live spacing badges while dragging.** The gap between the element being moved and its
   neighbours, shown in pixels as you drag. Every "crammed together too tightly" complaint is a
   spacing decision made by eye; this makes it a decision made on purpose.
2. **Theme and density preview.** The app has eleven themes and three densities. A mockup drawn in
   one and built for another is a mockup that lies. A dropdown re-renders the artboard in any of
   them — and *"does this still work in the dark theme"* becomes a two-second question.
3. **Copy and paste between designs.** Including across tabs. The whole point of designing 147 pages
   is that they share furniture.
4. **Version diff.** "What changed between v4 and v7" as a visual overlay — old in red, new in
   green. Version history nobody can read is a list of dates.
5. **Print / PDF.** A design that can be printed can be marked up on paper, which is still how some
   review happens.
6. **A design can start from a template.** Blank, or a common shell (page header + toolbar + card
   grid), or an import of the real page (§13). Nobody should start at a void when redesigning
   something that already exists.
7. **The catalogue is browsable on its own**, outside the editor: a reference page listing every
   entry with its real classes, source and usage count. That page is also the fastest way to answer
   *"do we already have one of these?"* — which is the question whose wrong answer created 217
   button classes.
8. **Escape hatches that keep the tool honest.** A "custom element" block that is explicitly *not*
   in the design system, marked as such in the canvas and called out in the export, so proposing
   something new is possible but never accidental.
9. **The export tells you what it could not express.** If an element was styled outside the token
   set, or has no class mapping, the spec says so at the top rather than leaving the builder to
   discover it.

## §21. Questions, and the answers I am proceeding on

The owner went to bed with *"make all of the decisions about how to make this work"*. So these are
decided rather than open. Each is cheap to reverse and says how.

1. **A tablet artboard?** No — desktop and mobile only. Two views is what was asked for, and a third
   would triple the design work per page for a width almost nobody in this business uses.
   *To reverse:* `VIEW_PRESETS` in `lib/design/document.ts` is a map; adding `tablet` is one entry
   plus a tab.
2. **Who can use it?** Admin and developer only. It exposes the whole app's structure, it is a build
   tool rather than a business surface, and a half-finished mockup on a foreman's screen would read
   as a promise. *To reverse:* one `roles` array in the route registry.
3. **Print / PDF?** Yes, but last. `jspdf` is already a dependency so it is cheap; it is also the
   least-used export, and the PNG covers the review case.
4. **Where does the punch list live?** Both places. It already writes
   `docs/planning/qa-evidence/design-catalogue-report.md` — which is reviewable, diffable and
   survives a session — and the studio will show the same data. A report only a running app can
   display is a report nobody reads.
5. **Naming.** The route is `/admin/design`; the nav says **Page Designer**, because that is what
   it is for. "Design Studio" stays as the doc's title and the internal name.

## §22. Decisions taken while building, that were nobody's question

- **Image export is written by hand, not with a library.** `html-to-image` was the plan's choice;
  it is one more dependency to serialise a DOM into an SVG `foreignObject` and paint it to a
  canvas, which is forty lines. Fewer dependencies in a tool that renders arbitrary app CSS is worth
  more than the convenience.
- **The first storage is `localStorage`, and the database comes after.** The owner needs to open
  the page and place things tonight, not to wait for a seed. The document shape is identical either
  way, so the migration is a write path rather than a rewrite.
- **The palette ships with a real starter set rather than a complete one.** Curating 7,000 classes
  before anything is on screen would be months of invisible work, and a palette curated by somebody
  who has never used the tool would be curated wrong.
