# Sitewide UI Audit Prompt — alignment, formatting, text cutoff

> Use this as the literal prompt for a fresh agent (Claude / GPT / a
> contractor). It's self-contained: the agent doesn't need any prior
> session context to run it.

---

## Prompt to paste verbatim

You are auditing a Next.js 14 + React + TypeScript admin app for a
recurring family of visual bugs: misaligned controls, text getting
clipped, controls floating in the wrong place, and "tabs" that don't
actually act like tabs. The app is at **/home/user/STARR-SURVEYING**.

Your job is **diagnosis + a prioritized punch list**, not a sweeping
refactor. Surface findings as a table; do not edit code unless I
explicitly ask. Each finding must be reproducible (file path + line
+ what the user would see).

### What we've already learned (do not relitigate)

These root causes have been confirmed and have shipped fixes — use
them as your pattern library when scanning new pages:

1. **Marketing-form globals bleeding into admin pages.**
   `app/styles/globals.css` ships
   `input, textarea, select { width:100%; padding:0.875rem 1rem;
   margin-bottom:1.5rem; border:2px solid var(--border-color);
   font-size:1rem; }`. The 24 px bottom margin is what causes
   "search bar floats above the filter pills" because `align-items:
   center` centers the **margin box**. The width:100% pulls inputs
   to stretch their container unexpectedly. `app/admin/styles/AdminLayout.css`
   now resets `.admin-layout input/textarea/select { width:auto;
   margin:0 }` and adds a checkbox/radio reset to 16×16. Anything
   that pre-dates that reset and still uses inline `style={}` may
   carry the old shape.

2. **Checkboxes / radios rendering as huge ovals.** Same root cause
   as (1) — the global rule doesn't distinguish a `<input
   type="checkbox">` from a text input, so checkboxes inherit
   2 px borders + 14 px padding + 100 % width. Fixed by the
   16×16 reset. Look for inline-styled checkboxes that override
   the reset.

3. **Native date pickers taller than adjacent buttons.**
   `<input type="date">` has built-in calendar-icon chrome that makes
   its intrinsic height ~36–40 px even with small padding, so it
   overhangs sibling buttons that rely on `padding: 6px 12px`. Fix
   pattern: pin every control in the row to one explicit
   `height + box-sizing: border-box`. The `/admin/equipment/today`
   page documents the 32 px choice.

4. **Filter rows mixing tall labeled-input columns with bare
   buttons.** No consistent control height + no explicit wrap
   behavior on the action button → the button drops below the
   inputs when the row narrows. Codified as the
   `.admin-form-row*` utilities in `AdminLayout.css`:
   `.admin-form-row { flex; align-items: flex-end; flex-wrap:
   wrap; }`, `.admin-form-row__action { height: 36px; flex-shrink:
   0; white-space: nowrap; }`. Pages that still hand-roll their
   filter row with inline `style={}` are candidates for migration.

5. **"Tabs" that are actually `<Link>`s.** `/admin/billing` used to
   render a tab strip whose tabs hard-navigated to separate
   routes. The fix pattern is `role="tablist"` + `role="tab"` +
   `role="tabpanel"` with `aria-selected` and ArrowRight/ArrowLeft
   keyboard nav, panels rendering in-place, each panel
   lazy-loading data on first open. Look for other tab-shaped
   strips made of `<Link>`s.

6. **Floating header icons (help, star) stacking above page action
   buttons.** `AdminPageHeader` renders breadcrumb + help-? + star
   in the top right; the page below renders its H1 + a primary
   action button also in the top right. With no spacing between
   them the icons read as stacked on top of the page action.
   Fixed by adding `padding-bottom + margin-bottom + border-bottom`
   to `.admin-page-header`. Any page-level header that still
   collides visually is worth flagging.

7. **Tooltips rendering as raw inline text and pushing layout.**
   Tooltip CSS used to live in `AdminResearch.css` (research-only),
   so on every other admin page the popup rendered as unstyled
   inline text shifting siblings. Fix: portal popup to
   `document.body` via `createPortal`, and put the CSS in
   `AdminLayout.css`. Look for components whose popup CSS is
   page-scoped.

8. **Invisible navy-on-navy button text.** `app/admin/styles/AdminLayout.css`
   has an `.admin-layout a:not(.btn):not([class*="-btn"])…:not([class*="__btn"])`
   exclusion chain so BEM button anchors keep their white text on
   navy backgrounds. Watch for new BEM button classes that don't
   match either `-btn` or `__btn` glob — they'll render
   navy-on-navy.

9. **CSS imports that don't match the classes the page uses.**
   `/admin/pay-progression` was importing `AdminPayroll.css` but
   every `.pay-prog__*` class actually lives in `AdminRewards.css`.
   The page rendered unstyled. Pattern to scan: grep each page's
   class names against the imported CSS files.

10. **Text getting cut off on dropdowns (descender clipping).**
    Selects with `height: 2rem` and no `line-height` clipped the
    bottoms of "g", "p", "y" because 32 px was tighter than the
    0.85 rem font line-box. Fix: 36 px height + `line-height: 1.2`
    + custom chevron with the right room. Documented in
    `AdminAudit.css`.

11. **Pages that render every section at once when one should be
    selected.** Like (5), but for general accordion / tab-shaped
    UI. Look for pages where multiple cards stacked vertically are
    titled with what reads as a navigation strip but actually
    render simultaneously.

### Audit procedure

For **every page under `app/admin/**`** (and any public marketing /
auth pages it makes sense to spot-check), do this:

1. **Read the page file** + its imported CSS. Note the class names
   on every control row + which CSS file each one lives in.
2. **Boot the dev server** (`npm run dev` from the repo root,
   default port 3000). If you can't run a browser, do a manual
   read of the JSX + CSS instead and reason about the rendered
   geometry.
3. **Visit each route** at 1280 px viewport. Scroll to every
   control row, every header, every tab strip, every dropdown,
   every checkbox group.
4. **Score each finding** against the patterns above. If it
   matches one of (1)–(11), say which one.
5. **Note the user-visible symptom** ("Send invite button floats
   below the input row at viewport widths < 1100 px") and the
   exact file:line you'd patch.
6. If you find a NEW pattern not in the list above, add it as
   pattern 12+ in your report — the user wants the catalog to
   grow.

### What to report

Reply with a single Markdown table:

| # | Route | Pattern (1-11+) | File:line | Symptom | Suggested fix |
|---|-------|-----------------|-----------|---------|---------------|

Then a short list of routes you couldn't audit (asset behind
auth, dev server failed to boot, etc.) and one paragraph of
"net new patterns I discovered" if you found any.

### What NOT to do

- Do not refactor proactively. The user wants the punch list
  first so they can sequence the fixes.
- Do not file PRs. Stop at the report.
- Do not propose visual redesigns ("the buttons should be
  pill-shaped"). The audit is for layout / functional bugs only.
- Do not delete or rename anything. Read-only audit.
- Do not run `git push`, `gh pr create`, or any destructive
  command.

### Surface to scan first (where bugs cluster)

- Every `/admin/*` page header strip + filter row.
- Every `<input type="date">` and `<input type="time">` row.
- Every `<input type="checkbox">` or `<input type="radio">` that
  uses inline `style={}` instead of the global reset.
- Every tab-strip-shaped nav (look for `<Link>` siblings styled
  identically — strong signal of fake tabs).
- Every page where the `AdminPageHeader` breadcrumb is followed
  by an H1 + primary action button on the same row.
- Every modal / dialog (they tend to copy-paste old form rows).

### Background context

If you need it, the planning docs at
`docs/planning/in-progress/sitewide-alignment-audit-2026-06-20.md`
and `docs/planning/completed/` contain the history of which
slices have shipped. The `docs/style/admin-styling-contract.md` is
the live styling contract for admin pages.

### Output length

Keep the punch-list table tight — one line per finding. Don't
explain CSS to the reader; they already know it. The goal is a
prioritized to-do list, not a tutorial.

---

## How to reuse this prompt

- **As a slash-command target.** Save as a custom slash command
  if your tooling supports it; otherwise paste into a fresh
  Claude / GPT session.
- **As a contractor brief.** Hand to a designer or QA contractor
  with view-only repo access — they can produce the punch list
  without write permissions.
- **As a smoke check before each release.** Run it against the
  current branch; only ship the release if the high-severity
  findings (clipped text, invisible buttons, broken tabs) are
  resolved.

## Maintenance

When a new pattern is discovered, **add it to the numbered list
above** so the next audit run treats it as known prior art. The
list is a living catalog — treat it like a rule set.
