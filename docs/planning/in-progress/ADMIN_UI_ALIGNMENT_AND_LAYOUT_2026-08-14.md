# Every admin page, measured: padding, alignment, and layout

**Started 2026-08-14. Active.**

Owner, 2026-08-14:

> *"There are tons of places where fields and buttons and text are not aligned, or are awkward sizes
> relative to each other. There will be places where a field does not sit in vertical alignment with
> a button sitting beside it, so it looks janky… page by page, element by element. Please do not
> destroy functionality. Make sure everything that is needing to be surfaced is, and make sure all
> of the fields and buttons and stuff work."*

141 pages. 52 stylesheets, 39,538 lines of CSS under `app/admin` alone. This document is the list of
pages, the method for finding the defects, and the order they get fixed in.

---

## The problem with "go look at every page"

The obvious plan is to open all 141 screens and fix what looks wrong. That plan fails for three
reasons, and each one shaped what is below.

**The eye stops working.** By the fortieth screen a 3px offset does not register. The defects the
owner is describing are 2–8px — precisely the range that reads as "janky" without ever announcing
itself. A method that depends on noticing gets worse the longer it runs.

**"Fixed" is not provable.** Without a number, the only evidence a page improved is that somebody
looked at it twice. There is no way to show a fix worked, and no way to notice when it regresses.

**The same bug gets fixed forty different ways.** A 40px input beside a 35px button is not 40 page
bugs; it is one missing rule about how tall a control is. Fixing it per page produces forty new
one-off values and a codebase that is harder to keep aligned than before.

So: **measure first, fix the shared layer, then the pages, and prove it with the number.**

---

## D1 — The audit is arithmetic, not judgement

`scripts/ui-align-audit.mjs` signs in as an admin, walks every route from the same registry the nav
uses, and reduces each page to `getBoundingClientRect` measurements. Five rules, each written to
fire on what a person would call janky and stay quiet on what they would call deliberate:

| Rule | What it catches | Threshold, and why |
|---|---|---|
| `row-centre` | Two controls side by side whose centre lines differ | ≥1.5px. Below the threshold of conscious noticing, above sub-pixel layout rounding. **This is the owner's headline complaint.** |
| `row-height` | Neighbouring controls of visibly different height | ≥4px. 2px is a border; 4px is the 40-beside-36 that reads as a mistake. |
| `left-ragged` | Stacked siblings whose left edges nearly-but-don't match | 1–8px. A deliberate indent is ≥12px; 1–8px is always a stray margin. |
| `height-spread` | One page using many different control heights | ≥4 distinct heights. Every pair can pass and the page still look unconsidered. |
| `small-target` | Controls under 28px tall | Hard floor. |
| `overflow` | Anything wider than the window | Any overflow. The failure this codebase keeps regressing. |

Findings are collapsed by shape, so a table with twenty identical rows reads as **one** problem to
fix rather than twenty.

## D2 — Pinned chrome is excluded, and finding that out was the point of prototyping

The first version reported the floating action dock on **all 148 routes**: its pull handle is 56px
tall next to 48px buttons. That is deliberate — the handle is a tab spanning the bar, not a button
that failed to match. Left in, it produced 3 false high-severity findings per page and buried
everything real.

Anything inside a `position: fixed` or `sticky` subtree is now measured for overflow only. **A rule
that fires on every page is a rule nobody reads.**

The correction is recorded because it is the general risk here: a detector that cries wolf gets
switched off, and then the real defects ship.

## D3 — Fix the shared layer before any page

The measured evidence already shows the same defect repeating across unrelated screens. Those get
fixed once, in the shared layer, and the per-page pass then handles what is genuinely local.

Concretely, the order is: **control-size contract → shared form/row primitives → per-workspace
pages → the CAD island → responsive widths.** A page-by-page pass done first would bake forty
one-off values into place and make the shared fix impossible afterwards.

## D4 — The primitive already exists. Nobody uses it.

The root cause of `row-height` and `height-spread` is not that the shared layer is missing. It is
that the shared layer was built, documented, and then never adopted.

`app/admin/styles/AdminLayout.css` defines `.admin-form-row`, with `__label`, `__input`, `__select`
and `__action`, all pinned to 36px, under a comment that reads:

> *"Apply these from page-level `<div className="admin-form-row">` and every control inside lines up
> to the same baseline at any width. Pages migrating off custom inline styles should swap to these
> incrementally."*

**Measured 2026-08-14: 291 admin components contain a form control. The number using
`.admin-form-row` is zero.**

That single fact explains the whole complaint. With no adopted primitive, every screen picked its
own height, and the sweep duly finds 35px, 36px, 40px, 48px and 56px controls sitting next to each
other. So this is not a design job — the design exists. It is an **adoption** job, and adoption is
exactly the page-by-page, element-by-element pass the owner asked for.

The revised shape: **A1 finishes the primitive** (it currently offers one size and no guidance on
which to use where), and **A2 onward adopt it**, screen by screen, replacing the one-off values the
audit points at.

## D4c — Correction to D4: the primitive is not the contract, and the contract is *already enforced*

D4 said the shared layer exists and nobody uses it. That is true of `.admin-form-row`, and it is
also not the cause. Following the 40px inputs back through the cascade found something else:

**There are two control-size contracts, they disagree, and the one nobody wrote down is the one
that wins.**

- `app/styles/tokens.css` declares `--input-height: 40px`, `--button-height: 40px`,
  `--button-height-sm: 32px`, `--button-height-lg: 48px`.
- `app/styles/forms.css` applies them to **every** `input[type=…]`, `select` and `textarea` inside
  `.admin-layout__content`, at specificity (0,1,1).
- `docs/admin-styling-contract.md` told authors the baseline was **36px**.
- `.admin-form-row` said 36px too.

A page selector like `.lead-card__status-select` scores (0,1,0), so **when a page sets a height on
an input or select, it loses silently.** The stylesheet says 34px; the screen renders 40px.

And `forms.css` only reaches a *button* through `.btn` / `.form-button` — which admin pages
essentially never use, because they name buttons BEM-style (`lead-card__btn`, `people__filter`,
`tl-btn`, `fx__kind`). So the button keeps the height its page asked for.

That is the whole defect, in one sentence: **the shared rule silently raises the field to 40px and
never touches the button beside it.**

The smoking gun is `AdminAssignments.css`, which carries this comment above its filter row:

> *"Slice 83 — pill buttons + select share an explicit 28px height, matching font-size, and matching
> border-radius so they line up on the filter row instead of the select sticking out as the tallest
> control."*

Somebody already fixed this exact bug by hand. Today that select renders at 40px and sticks out as
the tallest control, because `forms.css` overrode it and nothing told them.

**What this changes about the plan.** A1 stops being "design a size system" and becomes "stop the
two systems disagreeing": correct the contract doc to the enforced 40px, point `.admin-form-row` at
the real tokens, and write down the two moves a page is allowed to make. No new token is declared —
the contract doc forbids parallel `:root` blocks, and the first draft of A1 broke that rule by
inventing `--control-h-sm/md/lg` before this was understood.

**The two moves, which make A3–A9 mechanical rather than forty judgement calls:**

1. **Standard row** — replace the literal in the page's own button rule with the token:
   `height: var(--button-height)`. The field beside it is already 40px, so the row is now level.
2. **Genuinely dense row** — do not fight the specificity. Redefine the token on the row container:
   `--input-height: var(--button-height-sm)`. Custom properties inherit, so the select follows
   through `forms.css` and the button follows through its own rule. One line, both controls, and no
   new number enters the codebase.

## D4b — A dead end worth recording: it is not the global margin

The obvious suspect was `app/styles/globals.css`, which gives every `input, textarea, select` a
`margin-bottom: 1.5rem`. In a centred flex row that margin is counted in the alignment, which would
push a field about 12px out of line with the button beside it — the owner's description exactly.

**Measured across eight form-heavy admin pages: zero controls carry any vertical margin.**
`.admin-layout input` already resets it, under a comment that says
`margin-bottom → kills the 24 px alignment offset`. Somebody found this before and fixed it.

Recorded so the next reader does not spend an afternoon re-deriving it and "fixing" a rule that is
already correct — and because it is a reminder that on this surface the global stylesheet mostly
does not reach the admin, so fixes belong in the admin layer.

## D4d — Two more holes in the shared layer, found by following the Hub's numbers back

The Hub pass (A3) turned up three findings, all `height-spread`. Chasing each one to its rule found
that two of the three were not Hub problems at all:

- **`.admin-btn` sized itself from padding.** The closest thing this codebase has to a shared admin
  button — used in **45 files** — declared `padding: .5rem 1rem` and no height, which renders 43px.
  Every input and select beside it renders 40px, because `forms.css` enforces that. A 3px mismatch,
  on every screen in the product that pairs this button with a field. It now takes
  `min-height: var(--button-height)`, and `--sm` takes `var(--button-height-sm)`. `min-height`
  rather than `height` because a few usages wrap to two lines, and the ≤768px touch rule that raises
  it to 44px still wins.
- **178 admin inputs carry no `type` attribute, and `forms.css` never saw them.** The selector list
  enumerates `input[type="text"]`, `[type="email"]`, and eight more. HTML defaults a typeless
  `<input>` to text, so these are ordinary text fields to the user — but they matched none of those
  selectors and skipped the whole block: height, padding, border, focus ring. They fell back to
  whatever their own page said, which is where a 34 or 36px field beside a 40px one comes from with
  no rule anywhere admitting to it. `input:not([type])` is now in both lists.

Neither is a Hub bug. Both were found from Hub numbers, and fixing them moves every workspace at
once — which is the entire argument of D3, arriving one slice later than planned because the
evidence for it only existed after A1 corrected the contract.

## D4e — A half-applied fix moves the defect; it does not remove it

A3 zeroed `margin-bottom` on the admin labels that *wrap a field*, because `globals.css` gives every
label 10px and a row aligned to `flex-end` aligns margin boxes, not borders. That was right, and it
was half the row.

`/admin/field-data` and `/admin/timeline` build their Refresh control as

```html
<label><span aria-hidden>&nbsp;</span><button>Refresh</button></label>
```

on purpose, so the button's column is shaped exactly like the labelled fields beside it. Those
labels wrap a *button*, matched none of the three `:has()` selectors, and kept their 10px — so
after A3 the button end of the row was 10px out of line with the field end. Measured 10.0px and
9.4px, both high severity, and both are the owner's sentence verbatim.

The reset now covers `label:has(> button)` too. The lesson is the one worth carrying into A5–A9:
**when a rule is written for "the row wrapper", enumerate every shape the row wrapper takes.** A
partial reset is harder to find than no reset, because the comment above it says the bug is fixed.

## D5 — Layout changes are allowed; broken functionality is not

The owner explicitly invited better layouts where the current one is wrong, so a slice may
restructure a screen. Two guardrails, applied to every slice:

- **Nothing is deleted to make a page tidy.** If a control is hard to see the answer is to place it
  properly, not to remove it. The owner asked specifically that everything needing to be surfaced
  still is.
- **Every slice re-runs the functional checks**: `scripts/qa-sweep.ts` (does every page still render,
  do its requests still succeed, is it showing an error), `npx tsc --noEmit`, and the full vitest
  suite. A slice is not done until those are as green as they were before it started.

## D5b — Two things the sweep cannot see, found by driving the browser

The measurement is arithmetic on rectangles. It cannot tell that a rectangle is *unreachable*.
Both of these came out of a Playwright run of the Hub, and neither would ever appear in a finding
count:

- **The hub's Customize modal could not be saved at 1440×1000.** `GridEditor`'s overlay was
  `zIndex: 80`; the floating action dock is `--z-fab: 90`. The dock therefore floated over the
  modal's footer and swallowed every click on Auto-format / Reset / Save layout. Playwright named
  the culprit outright — *"`<div class=fab-menu--expanded>` intercepts pointer events"* — where a
  person would have concluded the Save button was broken. The overlay now sits at
  `var(--z-modal, 200)`, which is what the token was for.
- **Escape did not close the widget options panel.** The handler was an `onKeyDown` on the backdrop
  `<div>`. A div with no `tabIndex` never takes focus, so it never received a keypress; the
  listener had been attached to an element the event could not reach. It is now a `document`
  listener for as long as the panel is open, and it stops propagation so the same Escape does not
  also run `GridEditor`'s `window`-level cascade one hop further out.
- **Backspace in a text field deleted the selected widget.** `GridEditor` binds Delete / Backspace
  (remove the selected widget) and ← ↑ → ↓ (nudge it a cell) to `window`, with no check on where
  the keystroke was aimed. Correcting a typo in the widget Title field — or in a Quick Actions link
  label, which is how this surfaced — removed the widget from the layout instead of a character
  from the field, and moving the caret slid the widget across the grid. Both shortcuts now stand
  down when the target is an input, textarea, select or contenteditable (`isTypingTarget`).

Recorded because the lesson generalises: **drive the surface, don't only measure it.** A screen can
pass all six rules and still have a primary action nobody can click — and all three of these were
found in the same twenty minutes of driving one screen, after that screen had measured clean.

## D6 — CAD is a styling island and is handled on its own

`/admin/cad` alone produced **74 findings — more than the other 11 pages of the sample combined.**
It is built from Tailwind-style utility classes (`py-1.5`, `bg-gray-800`, `w-9 h-9`) rather than the
token system every other admin page uses. It is not a page with alignment bugs; it is a second
design system living inside the first. Mixing it into a general pass would either corrupt the pass
with island exceptions or quietly rewrite a complex editor. Slice A10, on its own, with its own
before/after.

## D6b — The first baseline counted noise, and the collapser was not collapsing

The 2026-08-14 sweep returned 233 findings. Re-reading them before fixing anything found three
classes of finding that no CSS change could ever fix, and one bug in the audit itself:

- **Checkboxes measured as short controls.** `input[type=checkbox]` is 14px by definition and sits
  beside 32–40px controls on every table in the product. "14px input beside a 32px button" fired on
  files, receipts, reports, notifications, org-settings, equipment… *Now excluded from `row-height`
  and kept in `row-centre`* — a checkbox that does not centre with the control beside it is exactly
  the janky thing being hunted; its height is not.
- **SVG interiors measured as ragged layout.** `/admin/research/coverage` alone contributed 109
  findings of the form "this `<path>` starts 7.6px off its siblings". Chart geometry is placed by
  the plotting maths, not by CSS. *Now excluded.*
- **The collapse key included the rendered text.** D1 promised that twenty identical rows read as
  one problem. They did not: `/admin/receipts` reported 48 findings that were the same three
  defects repeated down sixteen rows, because each row's merchant name made its key unique.
  *Findings now collapse on tag + class only.*

The corrected sweep is the baseline the ledger holds. Recording it because the temptation, on
seeing 233, is to start fixing — and roughly half of that number was the instrument, not the
product. **A count nobody has read the contents of is not a baseline.**

## D6c — Quick Actions became the user's own, mid-pass

Owner, 2026-08-15, while A3 was running:

> *"for the quick actions, we need to be able to add links that when clicked takes us to that page.
> Please make it so that we can fully customize the actions and links and stuff in the quick actions
> widget in the hub."*

The widget already let a user reorder and hide actions. What it did not let them do was *add* one:
the catalog is eight entries chosen by us, and the settings panel could only select from it. Slice
A13 adds user-authored links — label, destination, icon, colour — stored in the widget's own
content and rendered beside the built-ins.

Three decisions worth keeping:

- **The destination is a picker over the route registry, not a URL box.** `ADMIN_ROUTES` is the same
  table the nav and the ⌘K palette read, so every admin page is offered by its human label and its
  real href. Hand-typed paths are how a shortcut ends up pointing at a page that has since moved.
  A free-text field is still there, second in the list, for anything outside the app.
- **The href allow-list is a security control.** A custom action's destination is user input that
  ends up in an anchor's `href`. A saved `javascript:…` would execute on click, in an authenticated
  admin session, for anyone the layout is restored to. `safeHref` permits internal paths, http(s),
  `mailto:` and `tel:`, rejects everything else, and rejects protocol-relative `//host` explicitly
  because it passes a naive "starts with `/`" test while navigating off-site. External destinations
  open in a new tab with `rel="noopener noreferrer"`.
- **The colour control had to be made real.** `colorForTint` was applied as the glyph's text colour,
  and every glyph in the fallback table is a colour emoji, which ignores `color`. The tint each
  catalog entry declares had therefore been invisible since the widget shipped. Offering the user a
  colour that visibly does nothing is worse than offering none, so the glyph now sits in a tinted
  disc — which shows the tint whatever the glyph is, and lights up the eight built-in tiles too.

## D6d — Two more instrument corrections, and one page that was never styled at all

A5 (Money) produced three findings. One was a defect, one was the instrument, and one was neither —
it was a page using a stylesheet it does not load.

- **`/admin/payroll`'s two payout buttons had no styling whatsoever.** They are `className="tl-btn"`,
  and `.tl-btn` is declared in `AdminTimeLogs.css`, which this route never imports — `payroll/layout.tsx`
  loads `AdminPayroll.css` alone. So did the failure message below them (`tl-pay-error`). Three
  elements rendering as bare text on a money screen, and the only reason the sweep noticed is that
  an unstyled `<button>` is 26px tall. **A class name is not a contract; the stylesheet has to be
  on the page.** Swapped to the page's own `payroll-btn`, and the error style added where this page
  can see it.
- **Screen-reader-only inputs measured as ragged layout.** `/admin/receipts/new` keeps three
  `<input type=file>` behind its visible buttons, hidden with the standard 1×1 clipped pattern, and
  the `-1px` margin that pattern requires duly reported as *"this input starts 1.0px off the left
  edge its siblings share"*. A control nobody can see cannot be misaligned, and hiding those with
  `display: none` — which would silence the rule — would take them out of the accessibility tree.
  *Now excluded when clipped and ≤2px.*
- **Card-shaped buttons counted as control heights.** `/admin/payroll` paints its fourteen position
  cards and three action cards as `<button>`, at 99, 123 and 166px. Every actual control on the page
  was at 40px and it still read as "4 different button heights". A button taller than 64px is a
  surface with a click handler, not a control whose height anyone chose. *Now excluded from
  `height-spread`.*

## D6e — A page is not finished the first time it measures zero

`/admin/me` measured 0 at the end of A3. It measured 1 during A5 — a 23px `wx-chip` in the weather
widget — because **the weather widget had not finished loading the first time.** The sweep waits
2.5s and then for network idle; a widget that fetches on mount and paints late can be absent at
measurement and present in the product.

The defence is cheap and is now habit: **re-measure a group at the end of a later slice, not only at
the end of its own.** A5 re-ran the Hub and Work routes and found it. The alternative is a page that
is green in the ledger and wrong on the screen, which is worse than never having measured it.

## D6f — The literal-36px slices, and one way to break the whole app with a comment

By the end of A6 the same history had turned up four times: **Slices 83, 86, 87, 90 and 102 each
found a row where the field and the button disagreed, and each fixed it by writing `height: 36px`
on both.** Every one of those fixes has since come apart, because the input in the row is a typeless
`<input>` that `forms.css` now raises to 40px at a specificity the page cannot reach. The literal
was never the fix — it was a coincidence that held until the shared layer moved.

That is the argument for the contract's two moves stated as a rule: **a control height that is not a
token is a fix with an expiry date.**

And one cheap mistake worth recording, because it cost a full app-wide 500 for a few minutes:
`/admin/files` styles itself with **styled-jsx**, so its CSS lives inside a JS template literal. A
comment written in the usual house style — naming a property in backticks — closed the template
early and produced `Syntax Error` on every route that imports it. Comments inside styled-jsx may not
contain backticks. The sweep caught it immediately (every route answered 500), which is the second
time in this pass that measuring right after editing has paid for itself.

## D6g — A boxless button is text, and text has no control height

`/admin/equipment/overrides` has an underlined `last 30d` beside its date field — a `<button>` with
no border and no background, sized by the line it sits in. The sweep reported it as **22.4px out of
line with a 40px date input**, high severity. There is no change that fixes that: making the link
40px tall would wreck the sentence it belongs to.

`small-target` already had this reasoning — it only fires on controls that *have a box*, because
"demanding 32px of a text link would be asking for a worse screen". `row-height` did not, and
neither did `height-spread`. Both now share the same `hasBox` predicate that `small-target` used,
hoisted to the top of the probe. **Its CENTRE is still compared** — a text link that does not sit on
the line of the field beside it is exactly the janky thing being hunted; its height is not.

Third instrument correction in three slices, and they have all had the same shape: the rule was
right about *controls* and was being handed something that is not a control.

## D6h — There are two utility-class islands, not one, and the inline-checkbox label is a pattern

**The island is not only CAD.** D6 called `/admin/cad` "a second design system living inside the
first" and gave it its own slice. `/admin/research/library` is a third: same dark chrome, same
`px-3 py-1 / bg-gray-800` utility classes, and the same failure — filter tabs at 24px beside selects
and a search field that `forms.css` raises to 40px, with the tabs under the 28px floor as well.

It is fixed here rather than deferred to A10, because it is one toolbar rather than an editor, and
because the fix stays inside the island's own idiom: Tailwind's arbitrary-property syntax carries
the token redefinition (`[--input-height:var(--button-height-sm)]`) in the class list where the rest
of that page's styling lives. **Opening a second styling system on an element to fix the first one
is how the islands got here.** Tailwind is configured for real in this repo — it is not a
lookalike — so `h-[var(--button-height-sm)]` is the native way to say it.

**And the inline-checkbox label is now a recognised pattern, seen three times.** `globals.css` gives
every label 10px of bottom margin. The admin reset clears it for labels wrapping a control, and
deliberately spares checkbox labels, because a *column* of options needs that margin. But an inline
checkbox in a *toolbar row* is the other shape, and there the margin lifts the control:

- `/admin/org-settings` — MFA checkbox, 10px (7.2px after a hand-guessed padding partly cancelled it)
- `/admin/equipment/templates` — "Include archived" column, 10px
- `/admin/research/testing` — "Auto" toggle, 5px (a centred row halves the offset)

Each is one `margin-bottom: 0` at the point of use. A blanket rule cannot tell the two shapes apart,
because CSS cannot ask what its parent's `display` is — so the exclusion stays, and the row-shaped
usages opt out one at a time. **Expect this one in A9 too.**

## D6i — A3's own fix made two rows worse, and that is the contract working

A3 moved `.admin-btn--sm` off its 36px literal onto `--button-height-sm`, which is 32. Two rows in
Knowledge got *further* out of line as a result: a 32px button beside a 40px field is an 8px gap
where 36px had been a 4px one.

That is not a regression to undo. `--button-height-sm` is documented as *"a dense toolbar or an
in-row action — only where the row has no input or select in it"*, and both of those rows have a
field in them. The pages were reaching for the small size in a place the contract does not allow,
and the old 36px literal had been quietly splitting the difference — close enough to 40 to look
almost right, close enough to 32 to look almost deliberate, and correct at neither.

Dropping `--sm` from those two buttons is the whole fix. **A number that is nearly right in two
directions hides which of the two the author meant** — which is the argument for the token system
stated from the other end.

## D7 — Verification is the number AND a look

The count going down is necessary and not sufficient — a rule can be satisfied while the screen
still looks wrong. Every slice ends with both: the re-measured count, and a browser screenshot of
the changed screens at 1440px reviewed against the before.

---

## The pages — all 141

Grouped by the workspace the nav puts them in. The **Pass** column is filled in as each is
evaluated; **Findings** is that page's measured count at 1440px.

### Hub — the individual's own screens (14)

**Findings** below is *baseline → after A3*.

| Page | Route | Findings | Pass |
|---|---|---|---|
| Hub | `/admin/me` | 2 → 0 | ✅ |
| Search Everything | `/admin/search` | 0 → 0 | ✅ |
| Profile & Settings | `/admin/profile` | 0 → 0 | ✅ |
| Assignments | `/admin/assignments` | 1 → 0 | ✅ |
| My Schedule | `/admin/schedule` | 5 → 0 | ✅ |
| My Hours | `/admin/my-hours` | 1 → 0 | ✅ |
| Time Off | `/admin/time-off` | 0 → 0 | ✅ |
| My Pay | `/admin/my-pay` | 0 → 0 | ✅ |
| My Notes | `/admin/my-notes` | 1 → 0 | ✅ |
| Access Requests | `/admin/role-requests` | 0 → 0 | ✅ |
| My Files | `/admin/my-files` | 1 → 0 | ✅ |
| Get the App | `/admin/install` | 0 → 0 | ✅ |
| My Fieldbook | `/admin/learn/fieldbook` | 0 → 0 | ✅ |
| Privacy Settings | `/admin/me/privacy` | 0 → 0 | ✅ |

### Work — jobs, crews, the field (25)

Measured 2026-08-15, after A3's shared-layer fixes had already landed — which is why most of this
workspace starts at zero.

| Page | Route | Findings | Pass |
|---|---|---|---|
| Work | `/admin/work` | 0 → 0 | ✅ |
| Calendar | `/admin/calendar` | 1 → 0 | ✅ |
| All Jobs | `/admin/jobs` | 0 → 0 | ✅ (fixed in A3) |
| New Job | `/admin/jobs/new` | 0 → 0 | ✅ |
| Import Jobs | `/admin/jobs/import` | 0 → 0 | ✅ |
| Leads | `/admin/leads` | 0 → 0 | ✅ |
| Advertising | `/admin/marketing` | 0 → 0 | ✅ |
| Availability | `/admin/availability` | 0 → 0 | ✅ |
| Pay Rates | `/admin/pay-rates` | 0 → 0 | ✅ |
| Hours Approval | `/admin/hours-approval` | 0 → 0 | ✅ |
| Field Team | `/admin/team` | 0 → 0 | ✅ |
| Field Data | `/admin/field-data` | 1 → 0 | ✅ |
| Activity Timeline | `/admin/timeline` | 1 → 0 | ✅ |
| Vehicles | `/admin/vehicles` | 0 → 0 | ✅ |
| Compliance | `/admin/compliance` | 0 → 0 | ✅ |
| Weather | `/admin/weather` | 0 → 0 | ✅ |
| Work Mode | `/admin/work-mode/start` | 0 → 0 | ✅ |
| Work Mode Home | `/admin/work-mode` | 0 → 0 | ✅ |
| Work Mode — Field Crew | `/admin/work-mode/field_crew` | 0 → 0 | ✅ |
| Work Mode — Drafting | `/admin/work-mode/drawer` | 0 → 0 | ✅ |
| Work Mode — Research | `/admin/work-mode/researcher` | 0 → 0 | ✅ |
| Work Mode — Equipment | `/admin/work-mode/equipment_manager` | 0 → 0 | ✅ |
| Work Mode — Support | `/admin/work-mode/tech_support` | 0 → 0 | ✅ |
| Work Mode — Admin | `/admin/work-mode/admin` | 0 → 0 | ✅ |
| Work Mode — Developer | `/admin/work-mode/developer` | 0 → 0 | ✅ |

### Money — in, out, and profitability (30)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Money | `/admin/money` | 0 → 0 | ✅ |
| Mileage | `/admin/mileage` | 0 → 0 | ✅ |
| Payroll | `/admin/payroll` | 1 → 0 | ✅ two buttons + an error message were rendering unstyled (D6d) |
| Pay Progression | `/admin/pay-progression` | 0 → 0 | ✅ |
| Pay Change History | `/admin/payout-log` | 0 → 0 | ✅ |
| Payout Search | `/admin/payouts/search` | 0 → 0 | ✅ |
| Receipts | `/admin/receipts` | 0 → 0 | ✅ |
| Capture Receipt | `/admin/receipts/new` | 1 → 0 | ✅ instrument (D6d) |
| Payment Cards | `/admin/cards` | 0 → 0 | ✅ |
| Pass-Through Costs | `/admin/pass-through` | 0 → 0 | ✅ |
| Rewards & Store | `/admin/rewards` | 0 → 0 | ✅ |
| Manage Rewards | `/admin/rewards/admin` | 0 → 0 | ✅ |
| How Rewards Work | `/admin/rewards/how-it-works` | 0 → 0 | ✅ |
| Payouts | `/admin/payouts` | 0 → 0 | ✅ |
| Withdrawal Requests | `/admin/payouts/withdrawals` | 0 → 0 | ✅ |
| Payout Tax Report | `/admin/payouts/tax-report` | 0 → 0 | ✅ |
| Payout Runs | `/admin/payouts/runs` | 0 → 0 | ✅ |
| Ad-hoc Payout | `/admin/payouts/ad-hoc` | 0 → 0 | ✅ |
| Job Profitability | `/admin/finances` | 0 → 0 | ✅ |
| Money Overview | `/admin/finances/overview` | 0 → 0 | ✅ |
| Bank Reconciliation | `/admin/finances/reconcile` | 0 → 0 | ✅ |
| Receivables | `/admin/receivables` | 0 → 0 | ✅ |
| Customer Invoices | `/admin/invoicing` | 0 → 0 | ✅ |
| Payments Inbox | `/admin/payments/inbox` | 0 → 0 | ✅ |
| New Customer Invoice | `/admin/invoices/new` | 1 → 0 | ✅ 32px remove button in a row of 40px inputs |
| Invoice Line Categories | `/admin/invoicing/categories` | 0 → 0 | ✅ |
| Software Subscription | `/admin/billing` | 0 → 0 | ✅ |
| Subscription Invoices | `/admin/billing/invoices` | 0 → 0 | ✅ |
| Plan History | `/admin/billing/plan-history` | 0 → 0 | ✅ |
| Upgrade Plan | `/admin/billing/upgrade` | 0 → 0 | ✅ |

### Office — people, comms, records, setup (29)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Office | `/admin/office` | 0 → 0 | ✅ |
| Files | `/admin/files` | 2 → 0 | ✅ 27px icon buttons, a 43px "New folder", and a 1.6px centre drift from one-sided scrollbar padding |
| Company Notes | `/admin/notes` | 0 → 0 | ✅ |
| Reports | `/admin/reports` | 0 → 0 | ✅ |
| People | `/admin/people` | 0 → 0 | ✅ |
| Employees | `/admin/employees` | 0 → 0 | ✅ |
| Manage Employee | `/admin/employees/manage` | 0 → 0 | ✅ |
| Manage Users | `/admin/users` | 1 → 0 | ✅ four button heights (30/34/37/40) to two tokens |
| Role Builder | `/admin/roles/custom` | 0 → 0 | ✅ |
| Contacts | `/admin/contacts` | 0 → 0 | ✅ |
| Invites | `/admin/invites` | 0 → 0 | ✅ |
| Messages | `/admin/messages` | 0 → 0 | ✅ |
| Calls | `/admin/phone` | — | ⏸ **not on this branch** — 404s here. The calls/voicemail feature lives on `claude/job-lifecycle-2026-08-14`, unmerged, and `lib/admin/route-registry.ts` on main has no entry for it. Measure both rows when that branch lands; nothing to fix here. |
| Phone Hours | `/admin/phone/settings` | — | ⏸ same |
| Team Directory | `/admin/messages/contacts` | 2 → 0 | ✅ Slice 102's literal 36px, outranked by forms.css |
| New Message | `/admin/messages/new` | 0 → 0 | ✅ |
| Message Settings | `/admin/messages/settings` | 0 → 0 | ✅ |
| Discussions | `/admin/discussions` | 0 → 0 | ✅ |
| Announcements | `/admin/announcements` | 0 → 0 | ✅ |
| Support | `/admin/support` | 0 → 0 | ✅ |
| New Support Ticket | `/admin/support/new` | 0 → 0 | ✅ |
| Notifications | `/admin/notifications` | 0 → 0 | ✅ |
| Compose Email | `/admin/email/new` | 0 → 0 | ✅ |
| Sent Email | `/admin/email/sent` | 0 → 0 | ✅ |
| Settings | `/admin/settings` | 0 → 0 | ✅ |
| Org Settings | `/admin/org-settings` | 1 → 0 | ✅ a hand-guessed `paddingBottom` that was 7.2px wrong |
| Organizations | `/admin/orgs` | 0 → 0 | ✅ |
| Error Log | `/admin/error-log` | 0 → 0 | ✅ |
| Audit Log | `/admin/audit` | 0 → 0 | ✅ |

### Equipment (14)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Catalogue | `/admin/equipment` | 0 → 0 | ✅ |
| Equipment Today | `/admin/equipment/today` | 0 → 0 | ✅ |
| Check In / Out | `/admin/equipment/checked-out` | 0 → 0 | ✅ |
| Equipment Timeline | `/admin/equipment/timeline` | 0 → 0 | ✅ |
| Maintenance | `/admin/equipment/maintenance` | 0 → 0 | ✅ |
| Consumables | `/admin/equipment/consumables` | 0 → 0 | ✅ |
| Templates | `/admin/equipment/templates` | 1 → 0 | ✅ a checkbox column 10px high, then 2px, then level |
| Cleanup Queue | `/admin/equipment/templates/cleanup-queue` | 0 → 0 | ✅ |
| New Equipment Template | `/admin/equipment/templates/new` | 0 → 0 | ✅ |
| Overrides Audit | `/admin/equipment/overrides` | 4 → 0 | ✅ the dense-row move, done properly |
| Fleet Valuation | `/admin/equipment/fleet-valuation` | 0 → 0 | ✅ |
| Inventory Edit | `/admin/equipment/inventory` | 0 → 0 | ✅ |
| Import Equipment | `/admin/equipment/import` | 0 → 0 | ✅ |
| Crew Calendar | `/admin/personnel/crew-calendar` | 0 → 0 | ✅ |

### Research & CAD (10)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Research & CAD | `/admin/research-cad` | 0 → 0 | ✅ |
| Property Research | `/admin/research` | 0 → 0 | ✅ |
| Testing Lab | `/admin/research/testing` | 1 → 0 | ✅ a checkbox label's 10px margin, halved into a 5px centre shift |
| Site Health | `/admin/research/self-heal` | 0 → 0 | ✅ |
| Data Sources | `/admin/research/sites` | 0 → 0 | ✅ |
| Research Billing | `/admin/research/billing` | 0 → 0 | ✅ |
| Coverage | `/admin/research/coverage` | 0 → 0 | ✅ |
| Library | `/admin/research/library` | 2 → 0 | ✅ **the second utility-class island** — see A10's note |
| Pipeline | `/admin/research/pipeline` | 0 → 0 | ✅ |
| **CAD Editor** | `/admin/cad` | | ⬜ **slice A10** |

### Knowledge (19)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Learning Hub | `/admin/learn` | 0 → 0 | ✅ |
| My Roadmap | `/admin/learn/roadmap` | 0 → 0 | ✅ |
| Modules | `/admin/learn/modules` | 0 → 0 | ✅ |
| Knowledge Base | `/admin/learn/knowledge-base` | 0 → 0 | ✅ |
| Flashcards | `/admin/learn/flashcards` | 0 → 0 | ✅ |
| Create Flashcard | `/admin/learn/flashcards/create` | 0 → 0 | ✅ |
| Flashcard Bank | `/admin/learn/flashcard-bank` | 0 → 0 | ✅ |
| Exam Prep | `/admin/learn/exam-prep` | 0 → 0 | ✅ |
| SIT Exam Prep | `/admin/learn/exam-prep/sit` | 0 → 0 | ✅ |
| SIT Mock Exam | `/admin/learn/exam-prep/sit/mock-exam` | 0 → 0 | ✅ |
| RPLS Exam Prep | `/admin/learn/exam-prep/rpls` | 0 → 0 | ✅ |
| Practice | `/admin/learn/practice` | 0 → 0 | ✅ |
| Quiz History | `/admin/learn/quiz-history` | 1 → 0 | ✅ `--sm` in a row with a field (D6i) |
| Knowledge Search | `/admin/learn/search` | 0 → 0 | ✅ |
| Student Progress | `/admin/learn/students` | 0 → 0 | ✅ |
| Manage Content | `/admin/learn/manage` | 0 → 0 | ✅ |
| Manage Media | `/admin/learn/manage/media` | 1 → 0 | ✅ same |
| Question Builder | `/admin/learn/manage/question-builder` | 1 → 0 | ✅ a 31px row action painted a thousand times, and a 39px add-button |
| References | `/admin/learn/references` | 0 → 0 | ✅ |

---

## Measured baseline

*(Filled in from the full 1440px sweep — see `docs/planning/qa-evidence/align-audit/`.)*

| Rule | Count |
|---|---|
| `row-centre` | |
| `row-height` | |
| `left-ragged` | |
| `height-spread` | |
| `small-target` | |
| `overflow` | |
| **Total** | |

---

## Slices

Each is independently shippable and ends green.

| # | Slice | What it does |
|---|---|---|
| **A0** | The audit and the baseline | `scripts/ui-align-audit.mjs`, plus the measured starting number. **Done in this pass.** |
| **A1** | Settle the contract | Two size systems disagreed (D4c). Correct `docs/admin-styling-contract.md` from the fictional 36px to the enforced 40px, point `.admin-form-row` at the real `tokens.css` values, and write down the two moves a page may make. **No new tokens.** Admin-scoped: `globals.css` also dresses the public marketing site and must not move. |
| **A2** | Adopt it — the page-by-page pass | Replace the one-off heights the audit points at with `var(--button-height)` (or a row-scoped `--input-height` for genuinely dense rows), screen by screen. This is slices A3–A9 in practice; the contract is what makes them mechanical instead of forty judgement calls. |
| **A3** | Hub (14 pages) | Per-page pass over the measured findings. |
| **A4** | Work (25 pages) | |
| **A5** | Money (30 pages) | |
| **A6** | Office (29 pages) | |
| **A7** | Equipment (14 pages) | |
| **A8** | Research (9 pages) | CAD excluded. |
| **A9** | Knowledge (19 pages) | |
| **A10** | The CAD island | `/admin/cad` on its own — 74 findings, a second design system. |
| **A11** | Narrow widths | Re-measure at 1280 and 390; fix what only breaks there. |
| **A12** | Functional sweep | `qa-sweep.ts` over all 141, plus tsc and the full suite, proving nothing was broken and nothing stopped being surfaced. |
| **A13** | Quick Actions the user can author | Owner ask that arrived during A3 (D6c): add / edit / delete your own shortcut tiles — label, destination from the route registry (or any address), icon, colour — with an href allow-list and a tint that is finally visible. |

**Order matters.** A1 and A2 come first because they remove the repeated defect at its source; doing
the page passes first would bake one-off values in and make the shared fix impossible.

---

## Ledger

| Slice | State |
|---|---|
| A0 Audit + baseline | ✅ audit written; false-positive classes removed and the collapser fixed (D6b); baseline re-measured |
| A1 Control-size contract | ✅ contract doc corrected to the enforced 40px, primitive repointed at `tokens.css`, the two moves written down (D4c) |
| A2 Row/field primitives | ⬜ folded into A3–A9 — the contract is the primitive |
| A3 Hub | ✅ 14 pages measured, **11 findings → 0**. Two of the three that survived A1 were shared-layer holes, not Hub bugs (D4d): `.admin-btn` (45 files) sized from padding to 43px, and `input:not([type])` missing from `forms.css` (178 inputs). Page-local: `.mynotes__tab` 42→40, `.mynotes__chip` pinned to the token, the my-notes search row moved to the dense-row move, `.tl-tabs__btn` 46→40. Plus two defects no rule can see (D5b): the Customize modal's Save was unclickable under the FAB dock, and Escape did not close the widget options panel. |
| A4 Work | ✅ 25 pages measured, **3 findings → 0**. One was the A3 label-margin reset applied to only half a row (D4e): the Refresh *button* column on `/admin/field-data` and `/admin/timeline` kept the 10px bottom margin its neighbouring field columns had just lost, so the two ends of the row disagreed by 10px and 9.4px. Page-local: the calendar toolbar's four button heights (36/38/39.8/40) went to one, and the timeline's two padding-sized buttons took the token. |
| A5 Money | ✅ 30 pages measured, **3 findings → 0**, plus one the Hub had hidden behind a slow-loading widget (D6e). `/admin/payroll` was using `tl-btn` and `tl-pay-error` from a stylesheet it never imports, so two buttons and a failure message rendered as bare text (D6d); `/admin/invoices/new` had a 32px remove button in a row of 40px fields; `.payroll-btn` and the payroll tab strip took the token. Two instrument corrections: clipped screen-reader inputs, and card-shaped buttons over 64px. |
| A6 Office | ✅ 27 pages measured (2 deferred — `/admin/phone*` is unmerged work, see the table), **6 findings → 0**. `/admin/messages/contacts` was Slice 102's literal 36px outranked by `forms.css`, the third page in this pass with that exact history; `/admin/files` had 27px icon buttons under the floor and a 1.6px drift from one-sided scrollbar padding; `/admin/users` ran four button heights; `/admin/org-settings` had a hand-guessed `paddingBottom` that missed by 7.2px. |
| A7 Equipment | ✅ 14 pages measured, **5 findings → 0**. `/admin/equipment/overrides` is the first page in this pass to take the contract's *second* move — it is genuinely dense (12px labels), so the row redefines `--input-height` and both the date field and the type toggles follow. `/admin/equipment/templates` had a checkbox column floating 10px above its neighbours (a label wrapping its input one level deeper than the reset's `:has(> …)` reaches) and three more literal 36s. One instrument correction: a boxless button is text, so its height no longer compares (D6g). |
| A8 Research | ✅ 9 pages measured, **3 findings → 0**. `/admin/research/library` turned out to be a *second* utility-class island (D6h) — its filter tabs were `py-1`, 24px, beside 40px selects, and under the floor; fixed in Tailwind's own idiom rather than by opening a second styling system on the same element. `/admin/research/testing` was the checkbox-label margin again, the third instance this pass. |
| A9 Knowledge | ✅ 19 pages measured, **3 findings → 0**. Two were A3's own `.admin-btn--sm` fix landing in rows that should never have used the small size (D6i); the third was `.manage__item-btn` at 31px — a class that paints a thousand buttons on the question-builder alone — plus a 39px add-button on a form of 40s. |
| A10 CAD island | ⬜ |
| A11 Narrow widths | ⬜ |
| A12 Functional sweep | ⬜ |
| A13 Quick Actions the user can author | ✅ `lib/hub/custom-quick-actions.ts` (model + href allow-list + resolver, 30 tests), the editor in the widget's settings panel, and the tinted glyph disc that makes the colour choice visible. Browser-verified end to end: added a link, watched it reject `javascript:alert(1)`, saved, saw the tile on the hub, clicked it, landed on the page. |
