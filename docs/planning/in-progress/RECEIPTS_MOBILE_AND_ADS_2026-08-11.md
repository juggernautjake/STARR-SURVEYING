# Receipts, Mobile Fit, and Advertising — 2026-08-11

**Status:** in-progress. Slices ship one at a time; the stop hook drives the loop.

---

## Why this doc exists

Three complaints from the owner on 2026-08-11, in his words:

> *"Anyone that is a employee or field worker or admin or just about anybody needs to be able to
> upload receipts. We need to make sure that we track all of the info from each receipt and format
> it all. We need to make sure that AI is properly hooked up to analyze everything properly and
> thoroughly."*

> *"the vertical portrait view on mobile devices is not working right. The content is too wide for
> the screen on my phone… There are modals and elements here and there that will not fit on the
> screen vertically. This is like how we had the issue with the submenus that open when we click a
> category in the sidebar navmenu where we could not actually see all of the submenu items, so we
> added a scroll bar… when assigning roles to someone, I am not able to scroll to see all of the
> roles and I cannot see the button to actually save/assign the role to that person."*

> *"We want it so that we can combine the advertising pages into one page that has tabs… I want the
> advertising analysis elements to show all of the results for spending and conversions and clicks
> and impressions and all of that info for the current month by default, and it should switch on the
> first of the month to the new month every month… in real time."*

Plus two standing ones: one tap to open the sidebar, not two; and *"it might be that we have not
created a job yet on the backend, but that we are working on that job… it should prompt us if we
want to create a new job to place that file or receipt into so we can find it later."*

## The three findings that shaped the plan

**1. The receipt AI was never reachable, not misconfigured.** `worker/src/services/receipt-extraction.ts`
is a competent Claude Vision extractor with dedup, confidence scores and a cost ledger. Its only
caller was `node dist/cli/extract-receipts.js`, meant for a DigitalOcean droplet. Production is
Vercel. Nothing ran it. Every receipt uploaded from the website was inserted with
`extraction_status = 'queued'` and stayed there, while the bookkeeper queue cheerfully rendered
"AI working…" about a worker that was never going to arrive. This is the repo's signature defect —
authored, tested, unwired — and it is worth naming because the instinct on reading the complaint is
to go tuning the prompt.

**2. The job field only accepted the value nobody knows.** The capture page asked for a
"Job number (optional)" as free text and posted it into `receipts.job_id`, a UUID FK. Typing
`24-103` — the literal thing the label asked for — failed on INSERT, *after* the photo was already
in the bucket. In practice every web-captured receipt was filed against no job at all. The
"create the job on the fly" feature the owner asked for is the same code path as the fix.

**3. The mobile problems are one problem wearing two costumes.** Content wider than the screen and
dialogs taller than the screen are both "a box was allowed to size itself to its content, on a
device where content does not get a vote." The submenu scrollbar the owner remembers was the same
fix applied once, by hand, in one place. Doing that thirty more times by hand is how the
thirty-first gets missed — so the mobile slices build a shared primitive first and then apply it,
rather than chasing pages.

## What already shipped (this session, before the doc existed)

Committed on `claude/receipts-mobile-ads-2026-08-11`. Listed so a later slice does not redo it.

- **R1 — Anyone at the firm can submit a receipt.** `lib/admin/route-registry.ts`: `/admin/receipts/new`
  lost its `roles` array (a missing list means "everyone", still gated by `internalOnly`) and lost
  `showInRail: false`. Two things had been hiding it: the role list omitted plain `employee` — the
  default role most staff hold — and `showInRail: false` hid it from the mobile drawer for
  *everybody*, which is the only navigation a phone has. Middleware already allowed the route; the
  nav was the whole blocker.
- **R2 — Job references resolve, and missing jobs can be created.** `lib/jobs/job-ref.ts` (UUID →
  job number → name → single unambiguous fuzzy hit; `not_found` returns near-misses),
  `app/api/admin/jobs/resolve/route.ts`, and `app/admin/components/jobs/JobRefPicker.tsx` +
  `.css` — a type-ahead picker with an inline "create this job" panel. Wired into the capture page.
  The upload route resolves the reference *before* touching storage, so a bad reference can no
  longer strand a photo, and returns `409 { code: 'job_not_found', ref, suggestions }`.
- **R3 — The AI is wired to three doors.** `worker/src/services/receipt-extraction-core.ts` holds the
  prompt, parser, merge rules and dedup fingerprint with no infrastructure imports; the worker CLI
  and the new `lib/receipts/extract.ts` both import it, so the two paths cannot drift. New:
  `POST /api/admin/receipts/[id]/extract` (fired by the capture page after each upload, and by a
  future button), `GET /api/cron/receipt-extraction` (hourly sweep, registered in `vercel.json`).
  The prompt now also reads vendor phone, card brand, receipt number, discounts, currency, a
  one-line summary and `review_flags`; `MAX_TOKENS` went 2048 → 4096 because a truncated response is
  invalid JSON, not a partial answer. Seed `580_receipt_ai_extras.sql` adds the `ai_extras` jsonb
  column those land in.

Verified: `ANTHROPIC_API_KEY` and `CRON_SECRET` are both set in Vercel production, so this runs on
deploy rather than waiting on an owner action.

---

# Slices

Each is independently shippable: typecheck + lint + relevant tests, commit, push, annotate here.

## Group R — Receipts

### R4 — Apply seed 580 and prove the column landed ✅ SHIPPED 2026-08-11

`lib/receipts/extract.ts` already survives a missing `ai_extras` (it retries the UPDATE without it
and logs), so a deploy ahead of the seed degrades instead of failing. That guard is a safety net,
not the plan.

- Apply `seeds/580_receipt_ai_extras.sql` to live Supabase with node-pg + `SUPABASE_DB_URL` (the
  Supabase CLI paths do not work here — see the apply-seeds memory).
- Verify via PostgREST + service key that `receipts.ai_extras` exists and the partial GIN index is
  present.
- **Done when:** a `select ai_extras from receipts limit 1` succeeds against production.

**Completion note.** Applied with `node scripts/apply-seeds.mjs --only 580_receipt_ai_extras.sql`
against production (1/1 applied, 0 skipped). Verified three ways:
`information_schema.columns` reports `ai_extras` as `jsonb`; `pg_indexes` reports
`idx_receipts_review_flags`; and PostgREST returns 200 for
`receipts?select=ai_extras,extraction_status`, which also proves the API schema cache picked the
column up — a migration PostgREST has not noticed is a migration the app still cannot use.

**And a correction to this doc's own premise, found while verifying.** The `receipts` table holds
**zero rows** (so does `receipt_line_items`; `jobs` holds 2). There is no accumulated backlog of
queued receipts. The wiring defect was real and would have hit the very first upload — nothing ran
the extractor — but nothing had been filed for it to strand. R9 is rewritten below accordingly:
the honest verification is one receipt end to end, not draining a queue that does not exist.

The 2-job count is also worth noting for R5: the "create the job inline" path is not an edge case
here, it is going to be the common path.

### R5 — Replace the 500-job `<select>` with the picker, everywhere a job is chosen ✅ SHIPPED 2026-08-11

`app/admin/receipts/page.tsx` still fetches `/api/admin/jobs?limit=500` and renders every job into a
native `<select>`. On a phone that is a 500-row wheel, and it silently truncates at 500 — the job
you want is the one that isn't there.

- Swap that control for `<JobRefPicker compact />` in the expanded receipt row.
- Do the same in `app/admin/components/jobs/JobFileManager.tsx` (the owner's request named *"a
  receipt or file"*, and files have the same problem).
- Delete the now-unused `jobs` fetch + prop threading in the receipts page.
- **Done when:** assigning a receipt to a job that does not exist offers to create it, from the
  bookkeeper queue as well as from capture.

**Completion note.** Receipts queue done: the mount-time `/api/admin/jobs?limit=500` fetch, the
`jobs` state and the prop threaded down to every row are all deleted, and the expanded row now uses
`<JobRefPicker compact />`. The selected value is reconstructed from `job_name` / `job_number`,
which the list API already annotates onto each row, so showing the current selection costs no extra
request. The wrapper gets `flex: 1 1 240px; min-width: 0` — the dropdown is absolutely positioned
and needs a box to grow into, and the `min-width: 0` is the M4 rule applied at the point of change
rather than left for the sweep.

**The `JobFileManager` half of this slice was wrong and is withdrawn, not deferred.** That component
is rendered *inside* a job page and is already scoped to one job — it has no job selector to
replace, so there was nothing to do. Checked the rest of the product for the same shape rather than
assuming: the only other `jobs.map` selectors are `contacts/[id]` (linking a contact to a job) and
`FieldCrewWorkspace` (a job *switcher*, not an assignment). Neither is a file or receipt being filed
against a job that might not exist, so neither is in this slice's question. If a general file upload
ever grows a job field, it should use the same picker.

### R6 — Show everything the AI read ✅ SHIPPED 2026-08-11

The queue renders eight fields. The extractor now returns roughly twenty, plus line items. A
bookkeeper currently answers "which card was this?" by squinting at the photo.

- Extend `app/api/admin/receipts/route.ts` to batch-fetch `receipt_line_items` for the page (one
  `.in('receipt_id', ids)` query, same shape as the existing maintenance-events lookup) and to pass
  `ai_extras` + `dedup_match_id` through.
- Add both to `AdminReceiptRow` in `app/admin/receipts/receipt-types.ts`.
- In the expanded row: a line-items table, the `ai_summary` sentence at the top, `review_flags` as a
  warning band, a duplicate-warning card when `dedup_match_id` is set (linking to the other
  receipt), and per-field confidence shown as a subtle marker on low-confidence values rather than a
  wall of percentages.
- **Rule:** every one of these is advisory and must read as advisory. A flag that fires on ordinary
  receipts is a flag people learn to scroll past, which is how the one real problem gets approved
  with the rest.
- **Done when:** a receipt with line items shows them, and a receipt with no flags shows no band.

**Completion note (✅ SHIPPED 2026-08-11).** All of it, plus one thing this slice did not plan for.

The API batch-fetches `receipt_line_items` in a single `.in('receipt_id', ids)` — same shape as the
existing maintenance lookup, and best-effort for the same reason: a failure degrades to "no line
items" rather than taking down the queue, because the totals a bookkeeper approves live on the
receipt row, not in that table.

In the expanded row, ordered deliberately: the AI's one-sentence summary and the review-flag band
sit **above** the field list, because a warning underneath twenty rows of data is one nobody meets
until after they have decided. Then the fields (now including discount, card brand, receipt number
and vendor phone), then the line-items table.

Two judgement calls worth recording, since both had a tempting wrong answer:

- **Confidence is shown only where it is low.** A percentage beside every value was the obvious
  build, and it is worse: eighteen confident numbers wearing "97%" trains the eye to skip the badge,
  and then the one reading "20%" gets skipped with them. Only sub-0.6 fields get a small `?` with
  the figure in its tooltip, so the mark still means something.
- **The line items stay a table and scroll horizontally.** Restacking them into cards on a phone
  would have satisfied M4's letter and destroyed the point — the amounts are meant to be compared
  down the column. This is exactly the reformat-vs-scroll distinction M4 now spells out, and the
  wrapper scrolls, never the page.

**Unplanned, and the reason the slice cost more than it looked:** `AdminReceiptRow` was declared
**twice** — in `receipt-types.ts` and again inside `app/api/admin/receipts/route.ts`, whose own
header called itself a mirror of the other. Adding the new fields to the UI's copy made the route
fail to compile. Rather than edit both and deepen the drift, the route now imports the shared type
(re-exporting it so existing importers are unaffected), and the shared file gained the
`ReceiptRow` / `AdminReceiptRow` split the route actually needed: table columns versus table columns
plus the joins the API annotates on. One declaration, two views.

Verified: `tsc` clean, lint clean (one pre-existing `<img>` warning on the signed-URL photo), and
all 97 receipt-matching tests pass.

### R7 — "Run AI" per row, and a queue filter for what needs a human ✅ SHIPPED 2026-08-11

- A button on each expanded row calling `POST /api/admin/receipts/[id]/extract`. Label it "Run AI"
  when extraction never ran or failed, "Run AI again" when it is `done` (which sends
  `{ force: true }`). Show the returned cost.
- Poll or refetch the row while `extraction_status` is `running` so the result appears without a
  manual refresh.
- Add a "Needs review" filter to the status tabs: rows with `review_flags` non-empty, or a
  `dedup_match_id`, or `extraction_status = 'failed'`. This is what the GIN index in seed 580 is for.
- **Done when:** a failed extraction can be retried from the UI without a redeploy.

**Completion note.** Button shipped, labelled from state: "Run AI" when it never ran or failed, "Run
AI again" (with a confirm, and `force: true`) once it is `done`. `force` is sent *only* on that
manual re-read, so no automatic path can re-bill a finished receipt.

**Why the button had to exist at all**, recorded because it is not obvious from the outside: before
it, `extraction_status = 'failed'` was **terminal**. The capture page's kick has already happened by
then, and the cron sweep deliberately skips `failed` rows so an unreadable photo is not re-billed
every hour forever. Recovering a receipt meant editing the database. Now it is a click.

**Polling was dropped, and that is an improvement rather than a cut.** The slice said "poll or
refetch while `running`". The endpoint runs the extraction synchronously and returns the result, so
the button awaits it and refreshes the row — the fields appear when the call returns, with no poll
loop to leak on unmount and no interval to tune. Per-receipt failures come back `200` with a failed
result, and only "the AI is unavailable at all" is non-2xx; both are surfaced in their own words,
because "try again" is right for one and useless for the other.

**The filter is a fifth tab, not a status.** A receipt that needs a person can be pending, approved
or exported — it is a question about the *extraction*, so it could not be another
`.eq('status', …)`. Three things qualify: `failed`, a `dedup_match_id`, or a non-empty
`review_flags`.

Two things worth keeping:

- **`queued` is deliberately NOT "needs review".** "Nobody has read it yet" and "somebody read it
  and could not" are different states, and folding the first in would bury the receipts that need a
  decision under everything uploaded in the last five minutes. Pinned by a test.
- **The SQL predicate was verified, not assumed.** A PostgREST probe returned `200` for all four
  candidate spellings — against an empty table, where a filter that matches nothing and a filter
  that is wrong look identical. The semantics were then checked directly in production SQL with a
  four-case `VALUES` table, confirming `(ai_extras->>'review_flags') <> '[]'` is TRUE only for a
  non-empty array and NULL (excluded) for an unextracted row. That verification is copied into
  `__tests__/finance/receipt-needs-review.test.ts` so the TypeScript half is pinned to the same
  four verdicts.

`needsReview()` now lives beside the row type and is used by **both** the API (counting the tab) and
the queue, so the number on the tab and the rows behind it cannot disagree — a count that contradicts
its own list is how people stop trusting a filter. 8 new tests, all passing; `tsc` and lint clean.

Also fixed in passing: the tab counts are computed from the returned page, not the table, which was
pre-existing and silent. Left as-is rather than quietly changed, but now stated in a comment — with
`limit=100`, a queue of 300 pending receipts reports 100.

### R8 — Let people see their own receipts ✅ SHIPPED 2026-08-11

R1 lets anyone submit. Nobody except a bookkeeper can then see what happened to it — `/admin/receipts`
is admin/developer/tech_support, correctly, because it is the approval queue. Submitting into a void
is most of why people stop submitting.

- `GET /api/admin/receipts/mine` — the caller's own receipts only, resolved through the same
  email → `auth.users.id` lookup the upload route uses. Never accepts a user id from the client.
- Render a compact list on `/admin/receipts/new` under the capture form: date, vendor, total,
  status chip, and the rejection reason when there is one.
- **Done when:** a `field_crew` account can see its own submitted receipts and cannot see anyone
  else's.

**Completion note.** `GET /api/admin/receipts/mine` plus a `MyReceipts` list under the capture form.

**The security shape is the design, not a check bolted on.** The route takes **no user parameter** —
not an optional one, not an admin-only one. Identity comes from the session, resolves to an
`auth.users.id` server-side, and the query is pinned to it. A route that accepts `?user=` and then
verifies you may use it is one forgotten check away from handing over somebody else's vendor names,
totals and card last-fours; a route that cannot express the question is not. Bookkeepers get no
special case here either — they have `/admin/receipts`, and two doors into the same data is how one
of them stops being audited.

**A trap R1 created, found while wiring this, and fixed here.** The capture page ended with
`router.push('/admin/receipts')`. R1 opened capture to everyone but the approval queue is still
admin/developer/tech_support — so a `field_crew` or `employee` account finishing an upload was
thrown at a page middleware bounces them off, landing on `/admin/me` **with no confirmation that
anything had been filed**. The upload looked like it had failed. It now stays put, shows a
`role="status"` confirmation and refreshes the list below; the two "back to queue" links render only
for roles that can actually follow them.

Two smaller calls: the job selection is deliberately **kept** after an upload (a stack of receipts is
nearly always one job, and re-picking each time is the friction that ends with everything filed
against nothing), and the list renders **nothing at all** until you have filed something, so a
first-time user sees only the form.

### R9 — Prove one receipt makes it end to end

**Rewritten after R4** — the original said "drain the backlog", and there is no backlog: the
`receipts` table is empty. Everything above is still theory, but the thing that proves it is a
receipt that goes in and comes out with fields on it, not a queue depth going to zero.

- After deploy, upload a real photographed receipt through `/admin/receipts/new`, on a phone,
  signed in as a **non-admin** account — that exercises R1's role change, R2's picker and R3's
  extraction kick in the one path a crew member will actually use.
- Confirm: the row lands, `extraction_status` goes `queued → running → done`, `vendor_name`,
  `total_cents` and `category` are populated, `extraction_cost_cents` is non-zero, `ai_extras`
  carries a summary, and any line items are in `receipt_line_items`.
- Then call `/api/cron/receipt-extraction` with the `CRON_SECRET` bearer token and confirm it
  reports `attempted: 0` — an empty sweep is the correct answer once the kick worked, and it
  distinguishes "the cron is fine" from "the cron never ran".
- Record the observed vendor, total and cost here.
- **Done when:** a receipt photographed on a phone has AI-filled fields without anyone touching a
  terminal.

## Group M — Mobile fit

### M1 — One tap opens the sidebar

`AdminLayoutClient` passes `onMenuToggle={() => setSidebarOpen((p) => !p)}` and `AdminTopBar` calls
it from a plain `onClick`. Nothing in that path obviously double-fires, so **diagnose before
editing** — reproduce it at phone width in a real browser and find what eats the first tap
(candidates: a `:hover`-gated style on `.admin-topbar__hamburger`, an overlay with a stale
`pointer-events`, a click-away handler on a sibling popup closing the drawer in the same tick).

- Fix the actual cause, not the symptom. Do not "fix" it by making the button open-only — that
  would break closing the drawer from the same control.
- Add a regression test asserting one `click` on the hamburger leaves the drawer open.
- **Done when:** one tap opens it, one tap closes it, at 390px wide.

### M2 — A dialog primitive that cannot outgrow the screen

The role-assignment dialog is the reported case: the list of roles scrolls off the bottom and the
save button is unreachable. It will not be the only one.

- Build one shared shell (`.admin-dialog` in a stylesheet the admin layout already loads, plus a
  small React wrapper if the markup varies): `max-height: min(92dvh, ...)`, a header that stays, a
  **body that scrolls internally** (`overflow-y: auto; overscroll-behavior: contain`), and a
  **footer pinned outside the scroll area** so the primary action is always on screen.
- `dvh`, not `vh` — mobile Safari's `vh` counts the address bar as absent, which is precisely how a
  dialog ends up taller than the visible viewport.
- Apply it to the role-assignment dialog and verify at 390 × 667.
- **Done when:** with every role expanded on a small phone, the save button is visible without
  scrolling the page behind the dialog.

### M3 — Sweep the remaining dialogs onto the primitive

- Inventory every modal/dialog/popover in `app/admin` (grep `role="dialog"`, `position: fixed`
  panels, the `ModalFrame` users).
- Convert each to the M2 shell, or record why it genuinely differs.
- Give `ModalFrame` a phone path: its drag/resize model assumes a mouse and a big screen, and a
  draggable window on a 390px viewport is a worse control than a full-screen sheet.
- **Done when:** the inventory list is fully checked off in this doc.

### M4 — Kill horizontal overflow structurally

Owner, following up: *"reformat/refactor any elements that overflow on mobile to be formatted
differently to fit or to be scrollable. Please really work on this."*

Chasing pages one at a time will not converge. Find the shapes that cause it and fix the shapes.

- Add a dev-only guard that flags any element wider than its scroll container at 390px, and run it
  across the admin routes (the `/ux-harness` route already exists for screenshotting page bodies).
- Fix the recurring causes at the source: flex/grid children missing `min-width: 0`; fixed
  `minWidth` on inputs; wide tables without an `overflow-x: auto` wrapper; long unbroken strings
  (emails, storage paths, job names) needing `overflow-wrap: anywhere`.
- **Two allowed remedies, and the choice is not arbitrary.** *Reformat* when the content has a
  natural narrow form — a row of labelled fields becomes a stack, a 4-up KPI grid becomes 2-up then
  1-up, a wide table becomes one card per row. *Scroll* when the content is genuinely
  two-dimensional and squeezing it destroys it — a data table with eight comparable numeric columns,
  a chart, a code or ledger block. Reformatting a real table into stacked cards loses the
  column-to-column comparison that was the only reason to have a table; scrolling a form that could
  simply have stacked hides half the fields behind a gesture nobody knows is available.
- Where scroll is the answer, the scroll container must be the element itself, never the page, and
  it must look scrollable (a visible edge fade or a scrollbar) — a horizontally scrollable region
  with no affordance reads as truncated content.
- **Done when:** the guard reports zero overflowing elements on the pages named in M5–M8, and no
  page scrolls horizontally as a whole.

### M5 — Hub (`/admin/me`) portrait pass
### M6 — Job management (`/admin/jobs`, `/admin/jobs/[id]`) portrait pass
### M7 — Receipts (`/admin/receipts`, `/admin/receipts/new`) portrait pass
### M8 — Hours (`/admin/my-hours`, `/admin/hours-approval`) portrait pass

One slice each, same shape: drive the page at 390 × 844 in a real browser, screenshot it, fix what
overflows or is unreachable, screenshot again, attach both here. The owner named these four
specifically. `/admin/receipts` needs particular attention — its expanded row is a hard-coded
`gridTemplateColumns: 'minmax(200px, 320px) 1fr'` two-column grid that cannot fit a phone, and its
filter row is a flex line of five controls with fixed minimum widths.

**Drive the browser.** A green test suite has missed rendering-condition bugs on this repo before;
these four slices are not done on the strength of a diff.

### M9 — PWA and native shell fit

The owner asked for this to hold *"whether they are dedicated apps from the google or apple app
stores, or PWAs."*

- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the fixed chrome (top bar, drawer,
  any sticky action bar), so content clears the notch and the home indicator.
- Verify the Tauri/native shell (`src-tauri`, `mobile/`) picks up the same stylesheets and that no
  shell-level container reintroduces horizontal scroll.
- **Done when:** the top bar and the sticky bulk-action bar both clear the safe areas on a notched
  device.

## Group A — Advertising

### A1 — Four pages become one tabbed page

`/admin/marketing`, `/admin/marketing/spend`, `/admin/marketing/uploads`, `/admin/marketing/exports`
are four separate routes; the owner wants one page with tabs.

- Make `/admin/marketing` the shell with tabs Overview · Spend · Conversions · Exports, tab state in
  the URL (`?tab=spend`) so links and refreshes survive.
- Keep the existing page bodies as components rather than rewriting them in this slice — one change
  at a time.
- Redirect the three old routes to the corresponding tab (middleware `LEGACY_REDIRECTS` is the
  existing mechanism) so bookmarks and any registry entries keep working; update
  `lib/admin/route-registry.ts` to a single entry.
- **Done when:** all four surfaces are reachable from one page and the old URLs redirect.

### A2 — Current month by default, rolling over on the 1st

- One shared helper (`lib/marketing/date-range.ts`) returning the current month's start/end from a
  clock passed in, with unit tests that cross a month boundary and a year boundary. Derived per
  request, never cached at module scope — a module-level "today" is exactly how a dashboard gets
  stuck on last month and nobody notices for weeks.
- Default every advertising view to it; keep an explicit range picker for anyone who wants history.
- **Done when:** a test with a faked clock on the 1st returns the new month.

### A3 — The numbers the owner asked for, live

Spend, impressions, clicks, conversions — plus the derived CTR, CPC and cost-per-conversion, since
those are what a spend decision actually turns on.

- Extend `lib/integrations/google-ads/spend.ts`'s GAQL to select `metrics.impressions`,
  `metrics.clicks`, `metrics.conversions`, `metrics.conversions_value` alongside cost, at campaign
  and day grain.
- Persist to the existing spend table (add columns via a seed) so the dashboard has history and does
  not depend on a live API call to render.
- Read path: serve from the table, and refresh from Google on demand.
- **Done when:** the four headline numbers render for the current month from real data.

### A4 — Actually live

- Auto-refresh on an interval while the tab is visible (`document.visibilityState`), plus a manual
  refresh, plus a visible "updated HH:MM" stamp.
- Never show a stale number without saying it is stale — "real time" that silently isn't is worse
  than a timestamp.
- **Done when:** leaving the page open across a data refresh updates it without a reload.

### A5 — Make it worth looking at

The owner: *"much more appealing and functional."*

- KPI tiles for the four headline metrics with month-over-month deltas; a daily spend/conversions
  trend chart; a sortable campaign table underneath.
- Load the `dataviz` skill before writing any chart code, and follow the repo's existing theme
  tokens so it reads correctly in every skin, light and dark.
- Mobile: tiles stack, the table scrolls inside its own container (M4's rule).
- **Done when:** the page passes the same 390px check as M5–M8.

### A6 — Answer "are we Basic-access verified?" in the product

The owner asked; the answer is not in this repo and not in an env var. All six `GOOGLE_ADS_*`
variables plus the four conversion-action resource names **are** now set in Vercel production
(checked 2026-08-11) — that part of the 2026-08-06 activation checklist is done. What cannot be read
from here is Google's approval state for the developer token.

It can be read *empirically*: a Test-access token querying a non-test account fails with a specific
error (`DEVELOPER_TOKEN_NOT_APPROVED`), which is a different failure from bad credentials.

- Add a diagnostics call that runs a trivial GAQL query and classifies the result: working /
  token not approved (still Test) / credentials wrong / account not linked.
- Surface it on the marketing page as a one-line status with the fix for each state.
- **Done when:** the page states the access level instead of the owner having to open the Ads
  console. Record the observed answer here.

## Group E — What an employee can actually do

Added 2026-08-11, same session:

> *"if a user is registered as an employee role, then they should be able to log hours and log
> receipts and have a lot more functionality control on the backend. Users should also be able to
> request role changes or the addition of roles to their account."*

### E1 — Audit every gate that quietly excludes `employee`

R1 found this shape once and it will not be the only instance: `/admin/receipts/new` listed seven
roles and omitted `employee` — the DEFAULT role every staff member falls back to — so the largest
group of users was locked out of a page written for them. The registry and the middleware express
role access in two places, and `employee` is the one that gets forgotten because it is the empty
default rather than a named job.

- Enumerate every `roles: [...]` in `lib/admin/route-registry.ts` and every entry in middleware's
  protected-prefix table, and mark each as: correctly restricted / should include `employee` /
  should have no role list at all.
- Self-service surfaces are the ones to open: hours (`/admin/my-hours`), receipts, time off,
  assignments, schedule, my files, my pay, messages, rewards, the fieldbook. Money and personnel
  administration stay restricted.
- Where a gate is widened, check the API behind it agrees. **A page that opens onto a 403 is worse
  than a page that is hidden** — this repo's own middleware notes call that out as the W6c rule, and
  it is the trap this slice is most likely to fall into.
- **Done when:** a test asserts every route whose middleware admits `employee` is also visible to
  `employee` in the registry, and vice versa, so the two lists cannot drift again.

### E2 — Ask for a role, without a phone call

No role-request feature exists today (grepped: no `role_request` table, route or UI). Roles are
granted only by an admin on `/admin/employees`, which means a new drawer who needs CAD access has no
in-product way to say so.

- Seed a `role_requests` table: requester email, requested role(s), a reason, status
  (pending/approved/denied), decided-by, decided-at.
- A request form on the profile/settings page listing the roles the person does **not** hold, with
  a short "why do you need it" field. Requesting is not granting — the wording must not imply it.
- An approval queue for admins, reusing the shape of the existing time-off approval queue.
- Approving grants the role through the **existing** grant path so audit logging and
  `lib/notifications/role-change.ts` fire exactly as they do today. Do not write a second granting
  code path — two ways to change somebody's access is how one of them stops being audited.
- Respect the never-click-role-mutating-buttons-during-a-live-audit rule when testing: build against
  a test account, not a real employee.
- **Done when:** a `field_crew` account can request `drawer`, an admin sees it in a queue, and
  approving it grants the role and notifies the requester.

## Group N — One notification state, everywhere

Added 2026-08-11, same session. The owner's description is precise and worth keeping intact:

> *"if messages are sent back and forth on the app, and the message notifications are showing on the
> little message widget/button in the app, then the messages notifications should also show in the
> notification bell… If the user clicks on that notification in the bell, it will navigate them to
> the full messaging page and open the conversation… However, if the user checks the notification in
> the little message pop up element at the bottom right and reviews the new message(s), then this
> should be registered as them having seen the notification… If there is a red notification bubble on
> the notification bell just to show that a message is waiting to be viewed, and the user views that
> message by any means possible on the website/app, then that notification bubble should disappear in
> real time. I want it so that the pwa icon on the iphone and android home screens will show a
> notification bubble whenever a notification has queued to be reviewed in the app."*

**What already exists** (checked 2026-08-11, so no slice re-invents it): the bell reads
`/api/admin/notifications`; `NotificationBell.tsx` already calls `navigator.setAppBadge(unreadCount)`
and `public/admin/sw.js` sets the badge from a push payload; `PUSH_VAPID_PUBLIC_KEY`,
`PUSH_VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_PUSH_VAPID_KEY`, `PUSH_VAPID_SUBJECT` and
`NEXT_PUBLIC_ADMIN_PWA` are all set in Vercel production.

**So the home-screen badge is not missing infrastructure — it is missing rows.** Messages never
create a notification, so the bell count never includes them, so the badge never counts them. That
single fact is why the owner sees a count in the messenger widget and nothing on the icon.

### N1 — A new message creates a notification

- On message insert, `notify()` the recipient with a `message` kind carrying the conversation id.
- Reuse the existing `notify()` → `sendAdminPush` spine so the bell, the push and the app-icon badge
  all follow from one write. Do not add a parallel path for messages.
- Do not notify the sender, and do not notify somebody who is currently looking at that conversation
  — a bell that rings for a message you are reading teaches people to ignore the bell.
- **Done when:** sending a message to another employee produces a bell count and an icon badge on
  their phone.

### N2 — Clicking the bell notification opens the conversation

- The notification carries a deep link to `/admin/messages/[conversationId]`; clicking it navigates
  there and opens that thread, not the messages index.
- **Done when:** the click lands on the right conversation from a cold app start.

### N3 — Read once, read everywhere, in real time

The hard half. Three surfaces can mark a message read — the floating messenger, the full messaging
page, and the bell itself — and all three must converge without a refresh.

- Make "message read" the single event, and have the notification row's read state derive from it,
  rather than tracking two independent read flags that can disagree. Two sources of truth for "has
  this been seen" is exactly how a badge gets stuck.
- Push the change to open clients (the existing realtime/WS channel, or a short poll if that is what
  the messenger already uses) so the bell's red bubble clears while the user watches.
- Clear the app-icon badge on the same event — `navigator.clearAppBadge()` when the count reaches
  zero, not merely on next app open.
- **Done when:** reading a message in the bottom-right popup clears the bell bubble and the
  home-screen badge without a reload, and the same holds for every other read path.

### N4 — Verify the badge on real devices

Simulators lie about badging, and this is the part the owner will judge by looking at his phone.

- Verify on a real installed iOS PWA and a real installed Android PWA: badge appears on receipt,
  clears on read.
- iOS only badges an installed PWA with notification permission granted — if that is the blocker,
  say so in this doc rather than reporting the feature working.
- **Done when:** confirmed on both platforms, or the platform limitation is documented here.

## Group S — Ship

### S1 — Merge to main and confirm the redeploy

- `npm run type-check`, `npm run lint`, `npx vitest run`, and **`npm run build`** — the build is
  non-negotiable here: tsc and the test suite have both been green on this repo while the production
  build was broken (client → `@/lib/auth` pulling `node:async_hooks`).
- Push the branch, open the PR against `main` (`gh` is not installed — give the compare URL).
- After merge, confirm Vercel picked up the deploy and the new cron appears in the project's cron
  list.
- **Done when:** production serves the change and `/api/cron/receipt-extraction` is scheduled.

---

## Ledger

| Slice | Status | Note |
|-------|--------|------|
| R1 | ✅ shipped | Route registry — role list dropped, un-hidden from the drawer |
| R2 | ✅ shipped | `job-ref.ts`, resolve route, `JobRefPicker`, capture page + upload route wired |
| R3 | ✅ shipped | Core split, web runner, extract route, hourly cron, seed 580 authored |
| R4 | ✅ shipped | Seed 580 applied to production; column + index + PostgREST verified |
| R5 | ✅ shipped | Picker into the bookkeeper queue; the job-files half was withdrawn (no selector exists there) |
| R6 | ✅ shipped | Line items, summary, flags, dedup, low-confidence marks; collapsed a duplicated row type |
| R7 | ✅ shipped | Run-AI / Run-AI-again button + Needs-review tab; shared needsReview() + 8 tests |
| R8 | ✅ shipped | /mine route (no user param by design) + list; fixed the post-upload redirect trap R1 created |
| R9 | ☐ | Drain the backlog, record the numbers |
| M1 | ☐ | One-tap sidebar — diagnose first |
| M2 | ☐ | Dialog primitive + role assignment |
| M3 | ☐ | Sweep remaining dialogs |
| M4 | ☐ | Structural overflow fix + guard |
| M5 | ☐ | Hub portrait |
| M6 | ☐ | Jobs portrait |
| M7 | ☐ | Receipts portrait |
| M8 | ☐ | Hours portrait |
| M9 | ☐ | PWA / native safe areas |
| A1 | ☐ | Tabbed marketing page |
| A2 | ☐ | Current-month default, rolls over |
| A3 | ☐ | Impressions / clicks / conversions live |
| A4 | ☐ | Auto-refresh + freshness stamp |
| A5 | ☐ | Visual overhaul |
| A6 | ☐ | Google Ads access-level probe |
| E1 | ☐ | Audit every gate that excludes `employee` |
| E2 | ☐ | Role-change / add-role requests |
| N1 | ☐ | Messages create notifications |
| N2 | ☐ | Bell notification opens the conversation |
| N3 | ☐ | Read once, read everywhere, in real time |
| N4 | ☐ | Badge verified on real iOS + Android PWAs |
| S1 | ☐ | Build, PR, merge, confirm redeploy |

## Known-red before this work started

Two suite failures exist on clean `main` (verified by stashing this branch and re-running):

- `theme-vars-are-adopted.test.ts` — hardcoded-colour ratchet at **2344**, limit 2297.
- `starr-assumptions.test.ts` — firm-identity references at **175**, limit 160.

Neither is caused by this branch: the new `JobRefPicker.css` was written to add **zero** to the
ratchet (measured 2344 before and after), and no new file hardcodes the firm name. Both are ratchets
that someone let drift; they need their own slice, and pretending they are ours would hide that.
