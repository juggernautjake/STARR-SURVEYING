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
| Money | `/admin/money` | | ⬜ |
| Mileage | `/admin/mileage` | | ⬜ |
| Payroll | `/admin/payroll` | | ⬜ |
| Pay Progression | `/admin/pay-progression` | | ⬜ |
| Pay Change History | `/admin/payout-log` | | ⬜ |
| Payout Search | `/admin/payouts/search` | | ⬜ |
| Receipts | `/admin/receipts` | | ⬜ |
| Capture Receipt | `/admin/receipts/new` | | ⬜ |
| Payment Cards | `/admin/cards` | | ⬜ |
| Pass-Through Costs | `/admin/pass-through` | | ⬜ |
| Rewards & Store | `/admin/rewards` | | ⬜ |
| Manage Rewards | `/admin/rewards/admin` | | ⬜ |
| How Rewards Work | `/admin/rewards/how-it-works` | | ⬜ |
| Payouts | `/admin/payouts` | | ⬜ |
| Withdrawal Requests | `/admin/payouts/withdrawals` | | ⬜ |
| Payout Tax Report | `/admin/payouts/tax-report` | | ⬜ |
| Payout Runs | `/admin/payouts/runs` | | ⬜ |
| Ad-hoc Payout | `/admin/payouts/ad-hoc` | | ⬜ |
| Job Profitability | `/admin/finances` | | ⬜ |
| Money Overview | `/admin/finances/overview` | | ⬜ |
| Bank Reconciliation | `/admin/finances/reconcile` | | ⬜ |
| Receivables | `/admin/receivables` | | ⬜ |
| Customer Invoices | `/admin/invoicing` | | ⬜ |
| Payments Inbox | `/admin/payments/inbox` | | ⬜ |
| New Customer Invoice | `/admin/invoices/new` | | ⬜ |
| Invoice Line Categories | `/admin/invoicing/categories` | | ⬜ |
| Software Subscription | `/admin/billing` | | ⬜ |
| Subscription Invoices | `/admin/billing/invoices` | | ⬜ |
| Plan History | `/admin/billing/plan-history` | | ⬜ |
| Upgrade Plan | `/admin/billing/upgrade` | | ⬜ |

### Office — people, comms, records, setup (29)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Office | `/admin/office` | | ⬜ |
| Files | `/admin/files` | | ⬜ |
| Company Notes | `/admin/notes` | | ⬜ |
| Reports | `/admin/reports` | | ⬜ |
| People | `/admin/people` | | ⬜ |
| Employees | `/admin/employees` | | ⬜ |
| Manage Employee | `/admin/employees/manage` | | ⬜ |
| Manage Users | `/admin/users` | | ⬜ |
| Role Builder | `/admin/roles/custom` | | ⬜ |
| Contacts | `/admin/contacts` | | ⬜ |
| Invites | `/admin/invites` | | ⬜ |
| Messages | `/admin/messages` | | ⬜ |
| Calls | `/admin/phone` | | ⬜ |
| Phone Hours | `/admin/phone/settings` | | ⬜ |
| Team Directory | `/admin/messages/contacts` | | ⬜ |
| New Message | `/admin/messages/new` | | ⬜ |
| Message Settings | `/admin/messages/settings` | | ⬜ |
| Discussions | `/admin/discussions` | | ⬜ |
| Announcements | `/admin/announcements` | | ⬜ |
| Support | `/admin/support` | | ⬜ |
| New Support Ticket | `/admin/support/new` | | ⬜ |
| Notifications | `/admin/notifications` | | ⬜ |
| Compose Email | `/admin/email/new` | | ⬜ |
| Sent Email | `/admin/email/sent` | | ⬜ |
| Settings | `/admin/settings` | | ⬜ |
| Org Settings | `/admin/org-settings` | | ⬜ |
| Organizations | `/admin/orgs` | | ⬜ |
| Error Log | `/admin/error-log` | | ⬜ |
| Audit Log | `/admin/audit` | | ⬜ |

### Equipment (14)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Catalogue | `/admin/equipment` | | ⬜ |
| Equipment Today | `/admin/equipment/today` | | ⬜ |
| Check In / Out | `/admin/equipment/checked-out` | | ⬜ |
| Equipment Timeline | `/admin/equipment/timeline` | | ⬜ |
| Maintenance | `/admin/equipment/maintenance` | | ⬜ |
| Consumables | `/admin/equipment/consumables` | | ⬜ |
| Templates | `/admin/equipment/templates` | | ⬜ |
| Cleanup Queue | `/admin/equipment/templates/cleanup-queue` | | ⬜ |
| New Equipment Template | `/admin/equipment/templates/new` | | ⬜ |
| Overrides Audit | `/admin/equipment/overrides` | | ⬜ |
| Fleet Valuation | `/admin/equipment/fleet-valuation` | | ⬜ |
| Inventory Edit | `/admin/equipment/inventory` | | ⬜ |
| Import Equipment | `/admin/equipment/import` | | ⬜ |
| Crew Calendar | `/admin/personnel/crew-calendar` | | ⬜ |

### Research & CAD (10)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Research & CAD | `/admin/research-cad` | | ⬜ |
| Property Research | `/admin/research` | | ⬜ |
| Testing Lab | `/admin/research/testing` | | ⬜ |
| Site Health | `/admin/research/self-heal` | | ⬜ |
| Data Sources | `/admin/research/sites` | | ⬜ |
| Research Billing | `/admin/research/billing` | | ⬜ |
| Coverage | `/admin/research/coverage` | | ⬜ |
| Library | `/admin/research/library` | | ⬜ |
| Pipeline | `/admin/research/pipeline` | | ⬜ |
| **CAD Editor** | `/admin/cad` | | ⬜ **slice A10** |

### Knowledge (19)

| Page | Route | Findings | Pass |
|---|---|---|---|
| Learning Hub | `/admin/learn` | | ⬜ |
| My Roadmap | `/admin/learn/roadmap` | | ⬜ |
| Modules | `/admin/learn/modules` | | ⬜ |
| Knowledge Base | `/admin/learn/knowledge-base` | | ⬜ |
| Flashcards | `/admin/learn/flashcards` | | ⬜ |
| Create Flashcard | `/admin/learn/flashcards/create` | | ⬜ |
| Flashcard Bank | `/admin/learn/flashcard-bank` | | ⬜ |
| Exam Prep | `/admin/learn/exam-prep` | | ⬜ |
| SIT Exam Prep | `/admin/learn/exam-prep/sit` | | ⬜ |
| SIT Mock Exam | `/admin/learn/exam-prep/sit/mock-exam` | | ⬜ |
| RPLS Exam Prep | `/admin/learn/exam-prep/rpls` | | ⬜ |
| Practice | `/admin/learn/practice` | | ⬜ |
| Quiz History | `/admin/learn/quiz-history` | | ⬜ |
| Knowledge Search | `/admin/learn/search` | | ⬜ |
| Student Progress | `/admin/learn/students` | | ⬜ |
| Manage Content | `/admin/learn/manage` | | ⬜ |
| Manage Media | `/admin/learn/manage/media` | | ⬜ |
| Question Builder | `/admin/learn/manage/question-builder` | | ⬜ |
| References | `/admin/learn/references` | | ⬜ |

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
| A5 Money | ⬜ |
| A6 Office | ⬜ |
| A7 Equipment | ⬜ |
| A8 Research | ⬜ |
| A9 Knowledge | ⬜ |
| A10 CAD island | ⬜ |
| A11 Narrow widths | ⬜ |
| A12 Functional sweep | ⬜ |
| A13 Quick Actions the user can author | ✅ `lib/hub/custom-quick-actions.ts` (model + href allow-list + resolver, 30 tests), the editor in the widget's settings panel, and the tinted glyph disc that makes the colour choice visible. Browser-verified end to end: added a link, watched it reject `javascript:alert(1)`, saved, saw the tile on the hub, clicked it, landed on the page. |
