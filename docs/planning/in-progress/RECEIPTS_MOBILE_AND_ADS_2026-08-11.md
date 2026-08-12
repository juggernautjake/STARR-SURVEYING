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

### M1 — One tap opens the sidebar ✅ SHIPPED 2026-08-11

`AdminLayoutClient` passes `onMenuToggle={() => setSidebarOpen((p) => !p)}` and `AdminTopBar` calls
it from a plain `onClick`. Nothing in that path obviously double-fires, so **diagnose before
editing** — reproduce it at phone width in a real browser and find what eats the first tap
(candidates: a `:hover`-gated style on `.admin-topbar__hamburger`, an overlay with a stale
`pointer-events`, a click-away handler on a sibling popup closing the drawer in the same tick).

- Fix the actual cause, not the symptom. Do not "fix" it by making the button open-only — that
  would break closing the drawer from the same control.
- Add a regression test asserting one `click` on the hamburger leaves the drawer open.
- **Done when:** one tap opens it, one tap closes it, at 390px wide.

**Completion note — and the honest headline: the two-tap symptom did NOT reproduce.**

Driven in a real browser at 390 × 844 with `hasTouch`/`isMobile` (`e2e/sidebar-one-tap.spec.ts`).
One `tap()` on the hamburger flips `admin-sidebar` → `admin-sidebar admin-sidebar--open` and the
panel slides in. A probe of `elementsFromPoint` at the button's centre found nothing sitting on top
of it — the top hit is the button's own `<svg>`. So there is no swallowed tap in Chromium, and the
`setSidebarOpen` path is not double-firing.

**What the same session DID measure**, and what is very likely what the owner is seeing:

> With the drawer open, `elementFromPoint` at the centre of `.admin-sidebar__header` returned
> `header.admin-topbar`. **Overlap: 56px.** The top bar (`z-index: 200`) was painted over the
> drawer (`z-index: 50`), covering its logo, its "Starr Surveying" brand, and the tap target that
> goes to the Hub.

That is the corner of the screen the eye returns to after pressing a menu button — and it was the
one corner where nothing appeared to change. A tap that looks like it did nothing gets repeated,
and the repeat closes the drawer. It reads exactly as "I have to tap it twice."

Three changes:

1. **Drawer `z-index` 50 → 310, scrim 45 → 300.** Above the top bar (200), below the AI tutor's
   scrim (400) and modals (1000+), so nothing that *should* cover the drawer stops doing so. The
   scrim moved too — at 45 it dimmed the page but not the bar, so the bar alone stayed bright, which
   reads as a rendering fault rather than an open menu.
2. **A close button in the drawer header** — required, not decoration. Raising the drawer above the
   bar puts the hamburger *underneath* it, so the control that opened the menu can no longer close
   it. Without an explicit X the only way out would be the dimmed strip on the right, which nothing
   advertises. Caught because raising the z-index turned the "one tap closes it" assertion red; the
   test found the regression the fix introduced, in the same run.
3. **Hover styles gated behind `@media (hover: hover) and (pointer: fine)`.** On iOS a touch on an
   element carrying `:hover` can be spent applying the hover rather than delivering the click — the
   textbook cause of two-tap. Not a confirmed root cause here, and labelled as such in the CSS: it
   is the removal of a known suspect at zero cost, since a phone gains nothing from a hover style it
   can never show.

**If the owner still needs two taps after this**, the remaining suspects are iOS-only and need his
device: Safari's hover emulation (now mitigated), or PWA standalone-mode hit-testing. The z-index
defect was real, reproducible and is fixed regardless.

Two tests now guard it: one tap opens; the drawer stacks above the bar. Closing is asserted via both
the new X and the scrim.

**Filed for M9 while here:** `app/layout.tsx` has no `viewportFit: 'cover'`, which means the
`env(safe-area-inset-*)` rules already written in `AdminResponsive.css` (drawer, FAB, messenger,
fieldbook — a dozen of them) **resolve to 0 on iOS and do nothing today**. Authored but not wired,
again. M9 must add `viewport-fit=cover` and the top-bar inset *together* — adding the meta alone
would push content under the notch and make things worse.

### M2 — A dialog primitive that cannot outgrow the screen ✅ SHIPPED 2026-08-11

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

**Completion note.** `app/admin/styles/AdminDialog.css` (loaded by the admin layout, so it reaches
every route rather than the ones somebody remembers), and the Edit Roles dialog converted to it.

**Measured before and after, in a browser at 390 × 844.** With the height cap removed the dialog
renders **888px tall on an 844px viewport** — the test catches it with *"the dialog is taller than
the screen: expected <= 844, received 888.2"*. With the shell in place it fits, the role list scrolls
internally, and "Save Roles" stays on screen even after scrolling to the bottom of the list. The
red-test was run deliberately: a layout test that has never failed is not evidence.

The three rules, all load-bearing: `dvh` not `vh` (mobile Safari computes `vh` as though the address
bar were absent — the exact devices this is for); the **body** scrolls, never the page; the **footer
sits outside the scroll area**, which is what makes "I cannot see the button" impossible to
reintroduce by adding one more role.

`min-height: 0` on the body is called out in the CSS because leaving it off silently reproduces the
original bug — a flex child refuses to shrink below its content and defeats the parent's cap.

The three confirm dialogs on the same page keep `.um-modal`, but that class was given the same guard
(`align-items: flex-start`, scrollable overlay, `max-height` + own scroll). Converting a heading, a
sentence and two buttons would have been churn; leaving them able to outgrow the screen would have
been the same bug waiting for a fourth paragraph.

**Three harness mistakes worth recording, because each produced a green result that meant nothing:**

1. `test.skip(!await locator.isVisible(), …)` — `isVisible()` does **not** auto-wait, and the user
   list arrives from a fetch, so it was false every time and the test **skipped itself while
   reporting green**. Now a hard assertion: this environment has users, and if the rows do not
   arrive that is a real failure.
2. `waitUntil: 'domcontentloaded'` raced the same fetch. Now `networkidle`. Three consecutive runs
   green.
3. The dev server was started with its log **inside the repo**, so Next's file watcher restarted it
   on every write and Playwright got intermittent `ERR_CONNECTION_REFUSED`. Log now lives outside
   the working tree.

**And one environment fact worth keeping**: `AUTH_URL` in `.env.local` is hard-coded to
`http://localhost:3000`, so a dev server on any other port redirects a gated route to a dead origin.
Run local e2e with `AUTH_URL=http://localhost:<port>` set to match. Also: a hand-minted token is
re-resolved against `registered_users` by the jwt callback, so the email must be a real admin in the
database — `jacobmaddux96@gmail.com` silently resolves to `employee` and every gated route bounces.

### M3 — Sweep the remaining dialogs onto the primitive ✅ SHIPPED 2026-08-11

- Inventory every modal/dialog/popover in `app/admin` (grep `role="dialog"`, `position: fixed`
  panels, the `ModalFrame` users).
- Convert each to the M2 shell, or record why it genuinely differs.
- Give `ModalFrame` a phone path: its drag/resize model assumes a mouse and a big screen, and a
  draggable window on a 390px viewport is a worse control than a full-screen sheet.
- **Done when:** the inventory list is fully checked off in this doc.

**Completion note.** The inventory found **two different defects**, not one, and lumping them
together would have hidden the second:

**(a) One more dialog with no cap at all.** `.emp-manage__modal` (Employee Manage) had no
`max-height` and no `overflow`, inside a fixed overlay with `align-items: center` — byte-for-byte
the shape M2 measured at 888px on an 844px screen. Fixed the same way: `flex-start` under 720px
tall, a scrollable overlay, and a height cap with its own scroll.

**(b) Every dialog that WAS capped used `vh`.** Thirteen declarations across seven stylesheets —
the command palette (70vh), the error viewer (90vh), the field-work popup (85vh), the shared
`.admin-modal` (85vh), the fieldbook (85vh), the file viewer (92vh), the AI tutor panel (86vh), and
five in Research (85–95vh).

That second one is the more interesting finding, because those all *look* correct. Mobile Safari
computes `vh` against the viewport **as though the browser chrome were absent**, so an `85vh` dialog
is taller than 85% of what the user can actually see, and a `95vh` one can exceed the visible
viewport outright. Each is now twinned — the `vh` line kept as the fallback, a `dvh` line after it —
which is exactly the pattern `.admin-sidebar` already used in this codebase. Nothing changes on
desktop; on a phone the caps start meaning what they say.

**Not converted, with reasons rather than silence:**

- **CAD panels** (`AIChatDock`, `CanvasViewport`, `PerfOverlay`, `ReviewQueuePanel`, …) — canvas
  furniture positioned against a drawing surface, not centred dialogs, and not reachable on a phone.
  Forcing them into a dialog shell would be a rewrite of the CAD chrome for no benefit.
- **`ModalFrame`** — the draggable/resizable CAD window. It needs a phone path (a drag-and-resize
  window is a poor control at 390px), but that is a redesign rather than a shell swap, and it is
  called out in M9's neighbourhood rather than pretended done here.
- **The three `.um-modal` confirms** — already guarded in M2; a heading, a sentence and two buttons
  gain nothing from head/body/foot structure.

Verified: `tsc` clean, and the M2 + M1 browser specs still pass (3/3) after the sweep — the point of
re-running them was that a global height change is exactly the kind of edit that quietly breaks the
thing it was meant to protect.

### M4 — Kill horizontal overflow structurally ✅ SHIPPED 2026-08-11 (guard shipped; no overflow found)

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

**Completion note — the guard is shipped, and it found NOTHING. That is the finding.**

`e2e/mobile-overflow-audit.spec.ts` visits **20 admin routes at 360 × 780** with touch emulation and
reports, per route, whether the document scrolls sideways and which elements are wider than the
viewport *without a scrollable ancestor rescuing them*. It asserts on the page-level measure — the
thing the owner actually sees — and `AUDIT=1` turns it into a report that never fails.

Result: **zero routes scroll sideways, zero unrescued offenders.** Including all four the owner
named (`/admin/me`, `/admin/jobs`, `/admin/receipts`, hours), plus the table-heavy ones where width
usually goes wrong (payroll, calendar, inventory, team, leads, invoicing, reports).

Two corrections made along the way, both worth recording:

- The first run used **390px** (iPhone 14/15) and found nothing on ten routes. That is not a
  credible answer to a specific complaint, so the audit moved to **360px** — the common Android
  baseline — because auditing at the widest common phone is exactly how a real overflow gets a clean
  bill of health. It still found nothing, which is now a much stronger statement.
- The element-level probe originally flagged anything whose right edge passed the viewport. That
  reported a 326px card inside a 360px page as an offender, and a right-aligned 40px avatar on four
  routes. Noise nearly buried the headline. It now flags width only.

**So why does the owner see it?** Named here rather than guessed at, in likelihood order:

1. **The database is nearly empty** — 2 jobs, 0 receipts, 7 users. Width problems come from *content*:
   a long job name, a full street address, a `firstname.lastname@` email, a table with thirty rows of
   real data. An empty table cannot overflow. This is the same trap R4 hit, where an empty `receipts`
   table made a filter that matches nothing indistinguishable from a filter that is wrong.
2. **A route outside these 20.** There are ~130.
3. **PWA standalone mode**, where the viewport and safe areas differ — which M9 has not addressed
   yet, and where `viewport-fit=cover` is still missing.

**M5–M8 must therefore drive with real content, not an empty dev database**, or they will produce
the same false all-clear. The most useful next step is the owner naming a page where he sees it, or
running this audit against production data. The guard is the durable part: from now on this is a
number, not an opinion.

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

### M9 — PWA and native shell fit ✅ SHIPPED 2026-08-11 (device verification outstanding)

The owner asked for this to hold *"whether they are dedicated apps from the google or apple app
stores, or PWAs."*

- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on the fixed chrome (top bar, drawer,
  any sticky action bar), so content clears the notch and the home indicator.
- Verify the Tauri/native shell (`src-tauri`, `mobile/`) picks up the same stylesheets and that no
  shell-level container reintroduces horizontal scroll.
- **Done when:** the top bar and the sticky bulk-action bar both clear the safe areas on a notched
  device.

**Completion note.** `viewportFit: 'cover'` in `app/layout.tsx`, plus the top/side/dialog insets in
`AdminResponsive.css`.

**The finding that made this worth doing now:** the app already carried **a dozen**
`env(safe-area-inset-*)` rules — the drawer, the FAB pill, the messenger, the fieldbook — and on iOS
**every one of them resolved to 0**. `env()` only reports real insets once the page opts into
drawing behind them with `viewport-fit=cover`, which was never set. Authored, plausible-looking, and
inert. This repo's signature defect, in CSS this time.

**The two halves are one change and must stay one change.** `viewport-fit=cover` on its own is
strictly worse than not setting it: the layout immediately extends under the notch and the home
indicator, so the fixed top bar sits beneath the status bar. That is worth naming precisely because
it is a plausible cause of the owner's *"I have to tap it twice"* **in the installed PWA** — a first
tap landing on the status bar scrolls to top instead of reaching the hamburger, and M1 could never
have reproduced that in a desktop browser.

What the insets do: the top bar **grows** by the inset rather than being pushed down by it, so its
background still reaches the top of the screen (a gap above a fixed bar reads as a rendering fault)
while its controls sit below the status bar; `.admin-layout__content`'s clearance grows by exactly
the same amount, or every page's first heading slides under the bar; the drawer takes its own top
inset, since M1 moved it above the bar; and the dialog footer takes the bottom inset — which M2
deliberately left out because it would have been decoration until today.

**One trap caught while writing it.** The side insets were initially applied unconditionally. This
block sits at the END of the stylesheet, so an unscoped `padding-left` beats every narrow-width rule
earlier in the file — including the deliberate 0.5rem and 0.35rem paddings that buy back space on
small screens. In portrait the side insets are 0, so those overrides would have cost density for
nothing. Now scoped to `@media (orientation: landscape)`, which is the only orientation where a
notch bites a side edge. Print also explicitly undoes the top growth: paper has no notch.

Verified: `tsc` clean, the M1/M2 specs still pass (3/3), and the M4 overflow audit still reports zero
across all 20 routes — a change that adds padding to the shell is exactly the one that could
introduce the overflow M4 exists to catch.

**Still outstanding, and not claimable from here:** the actual appearance on a notched device. The
insets are 0 in every desktop browser, so nothing local can prove the top bar clears the status bar
on a real iPhone. That check belongs with N4's badge verification, on the owner's phone, after
deploy.

## Group A — Advertising

### A1 — Four pages become one tabbed page ✅ SHIPPED 2026-08-11

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

**Completion note.** `/admin/marketing` is now a tabbed shell — Overview · Spend · Conversions ·
Upload log — with the four page bodies moved untouched into `_tabs/`.

**The bodies did not change, deliberately.** Rewriting them in the same slice that re-arranged them
would make a regression impossible to attribute: if a number came out wrong afterwards, nobody could
say whether the consolidation or the rewrite did it. A2–A5 change what is inside; this slice only
changed where they live.

Tab state lives in the URL (`?tab=spend`) rather than component state, so a reload keeps your place,
back steps between tabs, and a tab is a link somebody can send. `replace` not `push`, and
`scroll: false` — flicking between four tabs should not bury the page you came from under four
history entries or jump you to the top of something you are reading. Only the active tab is
mounted: all four fetch on mount, and mounting all four would fire every advertising query on every
visit to answer one question.

The three old routes stay as one-line `redirect()` server components and are **no longer registered**
— a registry entry is a nav row, and four rows pointing at one page is the clutter this removed.
Every keyword from the four was merged into the single entry, because losing them means somebody
searching "upload log" or "cpl" in the palette finds nothing, which is how a consolidation quietly
makes a feature disappear while the page sits right there.

**Verified in a browser at 360px**: the four tabs render, tapping each updates both the URL and the
active state, the page does not scroll sideways, and all three old routes land on the right tab
(`/spend`→`tab=spend`, `/uploads`→`tab=uploads`, `/exports`→`tab=conversions`).

**One self-inflicted false alarm worth recording.** A `curl` of the old routes returned `200` with no
`Location`, which read as "the redirects are dead" — the exact defect shape I have been finding all
session, so it was believable. It was wrong: `redirect()` from a Server Component during streaming
SSR returns a 200 document that navigates on the client, not a 307. The browser test above is what
settled it. A protocol-level probe can report a working redirect as broken just as easily as it can
report a broken one as fine.

Two follow-ups that fell out of the move: `__tests__/marketing/marketing-pages-are-styled.test.ts`
now follows the bodies into `_tabs/` rather than the old URLs (the redirect stubs load no stylesheet,
so pointing the guard at them would have made it assert nothing), and its scoping regex learned the
`mkt-` prefix — listed *before* `mk` because alternation is first-match and `mk` otherwise matches
inside `.mkt-` and then fails on the separator. The Google OAuth callback's landing URL points at
`?tab=uploads` directly, saving a redirect hop at the least patient moment in that flow.

### A2 — Current month by default, and any period the user asks for ✅ SHIPPED 2026-08-11

**Scope extended 2026-08-11 (same session), owner:**

> *"I want the default view to show the current month's info, but I also want the user that has
> access to advertising page(s) to be able to change the time frame to review any month, or even the
> current full year or past years. We should also be able to narrow it down to weeks and even
> individual days."*

So the current month is the **default**, not the only option. The range control needs: any month, any
year (current and past), any week, any single day, plus an arbitrary custom range. Presets do the
common cases in one tap; the custom range covers the rest without needing a preset for every
question.

Two things this must get right, because both are easy to get wrong and neither fails loudly:

- **Granularity follows the range, and must be stated.** A day view plotted per-day is one bar; a
  year plotted per-day is 365 unreadable ones. The chart should bucket by hour / day / week / month
  as the span grows, and *say which* — an unlabelled axis is how somebody reads a monthly total as a
  daily one.
- **The range must survive a reload and be shareable**, so it lives in the URL, not component state.
  "Look at last March" is a link somebody sends, not an instruction to click four times.

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

### E1 — Audit every gate that quietly excludes `employee` ✅ SHIPPED 2026-08-11

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

**Completion note — and the headline finding is the owner's first example.**

`WORK_ROLES` is `['admin', 'developer', 'field_crew']`. It does **not** contain `employee`. And
**`/admin/my-hours` was gated on it** — so *"log hours"*, the first thing the owner named, was hidden
from the nav for exactly the accounts he meant. Same shape as R1's receipt page, one sentence later
in the same request.

Widened, after checking each API first: `/admin/my-hours`, `/admin/schedule`, `/admin/assignments`
and `/admin/my-pay` in the registry; `/admin/assignments`, `/admin/schedule`, `/admin/messages`,
`/admin/discussions` and `/admin/rewards` in middleware. **Messages is worth calling out** — a plain
employee could not reach the messaging page at all, so talking to a colleague was a privilege of
holding a second role.

**The gates were stricter than the boundary, which is the safe direction to correct.** Every one of
these is backed by an API that already scopes a non-admin to their own rows — `assignments`,
`schedule`, `time-logs` and `xp` all filter on `session.user.email` unless the caller is an admin, and
the messages API refuses a non-participant outright. So widening the *gate* cannot widen the *data*;
it only stops hiding pages from the people they were written for. Verified before changing anything,
because the opposite mistake — opening a page whose API does not scope — is how a permission leak
gets shipped as a usability fix.

**The guard.** `employee-can-reach-their-own-things.test.ts` asserts eight self-service routes from
**both** sides (registry visibility *and* middleware admission), because the two disagree silently in
both directions: registry-stricter hides a working page, middleware-stricter offers a menu item that
bounces you. A second block asserts the administration routes — payroll, users, employees,
org-settings, the receipts *approval* queue, invoicing, hours-approval — are **still** closed, so a
future widening cannot quietly go too far.

**Red-tested:** removing `employee` from `/admin/my-hours` again fails with
*"hidden from the nav for a plain employee"*, naming the route. 23 assertions.

### E2 — Ask for a role, without a phone call ✅ SHIPPED 2026-08-11

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

**Completion note.** Seed 581 (`role_requests`), `/admin/role-requests` (one page, both audiences),
and two API routes.

**Approving calls the ONE existing grant path.** Writing the `registered_users.roles` update inside
the approve handler would have been three lines. Instead the rule was extracted to
`lib/admin/apply-roles.ts` and `/admin/users` now calls it too, unchanged in behaviour. Two writers
of access control is how one of them stops being audited, and the drift is invisible — both work,
both look right, and the day somebody adds a validation rule to one, the other becomes the hole.
Three lines is not worth that.

**The request stores the roles ASKED FOR, not the resulting set**, and approval *adds* them. Between
asking and approving, an admin may have granted something else through the normal path; replaying a
stored final list would silently revoke it, and an approval that takes access away is the least
expected outcome there is.

Smaller decisions worth keeping: the page is registered with **no `roles` key**, because the people
who need to ask for a role are by definition the ones who do not have it — gating the request page
would be a locked door with the key inside. A failed grant leaves the request **pending** rather
than marking it approved, since telling somebody they have access they do not have is the worst
available outcome. Withdrawing your own request needs no admin. A partial unique index stops a
double-tap producing two identical pending rows.

**Verified end to end against production**, not just typechecked: an employee's request returns 201
and appears in the admin queue; the employee's own `GET` returns `queue: null` (they cannot see other
people's stated reasons); an employee approving their own request is refused **403**; an admin
approving returns 200 and the role lands. The test account was then restored to `["employee"]` and
confirmed.

**One thing that would have shipped broken.** After applying seed 581, PostgREST returned **404** for
the new table — the schema cache had not picked it up, so every one of these routes would have
failed in production while the table plainly existed in the database. Fixed with
`NOTIFY pgrst, 'reload schema'`. This is the same trap R4 checked for, and it caught something real
this time: **applying a seed is not the same as the API being able to see it.**

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

### N1 — A new message creates a notification ✅ SHIPPED 2026-08-11 (it never actually worked)

- On message insert, `notify()` the recipient with a `message` kind carrying the conversation id.
- Reuse the existing `notify()` → `sendAdminPush` spine so the bell, the push and the app-icon badge
  all follow from one write. Do not add a parallel path for messages.
- Do not notify the sender, and do not notify somebody who is currently looking at that conversation
  — a bell that rings for a message you are reading teaches people to ignore the bell.
- **Done when:** sending a message to another employee produces a bell count and an icon badge on
  their phone.

**Completion note — N1 was "already built" and had never once worked.**

The plan recorded N1 as needing `notify()` wiring. Reading the code said it was done:
`messages/send` calls `notifyMany`, and `lib/notifications.ts`'s own header comment lists *"job
assignment, hours decision, payment, raise, **message**"* as callers that get bells and badges for
free. I accepted that and moved to N3.

Then the N3 test sent a real message and looked in the table. **Zero notification rows**, while
`reminder` and `lead.new` rows sat right there. A probe of the exact insert returned:

```
23503  Key (thread_id)=(…) is not present in table "admin_discussion_threads"
```

`notifications.thread_id` carries a **foreign key to the discussion board**. `messages/send` was
passing a messenger *conversation* id into it, so every message-notification insert violated the FK
— and the `try/catch` wrapped around that block, there so a notification failure can never block a
message, swallowed all of it in silence.

So the code read as wired, the comment asserted it was wired, and **not one message notification had
ever been created.** Nothing needed `thread_id`: the conversation is already in the `link` and the
message id is already in `source_id`. Removing that one field is the entire fix.

This is the sharpest example this session of the rule that keeps paying: **check the premise against
the data, not against the code.** A comment claiming a feature works is evidence about intent, not
about behaviour.

**N2 was broken for a second, independent reason.** The link was
`/admin/messages?conversation=<id>` — and `/admin/messages` is the inbox, which never reads
`searchParams`. Tapping a message notification dropped you on the list of conversations to hunt for
the one you had just been told about. `/admin/messages/<id>` is a real route (the thread view); the
link now uses it and resolves 200 onto the conversation.

**N3 — reading clears the bell.** `messages/read` marked `message_read_receipts` and
`conversation_participants.last_read_at` and never touched `notifications`: two independent
"has this been seen" flags, only one of which anything cleared, which is exactly why the red bubble
and the home-screen badge stayed lit. Both read shapes now funnel through one helper keyed on
`source_id` — the full page marks a conversation, the floating messenger marks individual messages,
and a badge that clears on one surface but not the other is worse than one that never clears,
because it looks fixed.

**Verified end to end against production:** send → unread message bells `0 → 1`; read →
`{"marked":3,"cleared_notifications":1}`; bells → `0`. The badge follows the bell count, so the
home-screen bubble clears with it.

**Still open, and honestly scoped:** the clearing is server-side. A tab that is *already open* on
another device updates on its next poll rather than instantly. The owner asked for *"in real time"*,
and closing that last gap means pushing the change to open clients over the existing realtime
channel — a separate slice, and one that only matters once the underlying state is right, which it
now is for the first time.

### N2 — Clicking the bell notification opens the conversation ✅ SHIPPED 2026-08-11

- The notification carries a deep link to `/admin/messages/[conversationId]`; clicking it navigates
  there and opens that thread, not the messages index.
- **Done when:** the click lands on the right conversation from a cold app start.

### N3 — Read once, read everywhere ✅ SHIPPED 2026-08-11 (server side; live push to open tabs still open)

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

### A7 — Who was behind the click

Added 2026-08-11 (same session), owner:

> *"If we are capturing unique customer info, we need to be able to track that and be able to review
> the unique customer info for a given click, conversion, and/or form submission, and/or call or
> whatever."*

**Start by finding out what is actually captured today, and say so plainly.** This repo already has
`lib/leads/attribution.ts`, a lead intake path, an `AttributionCard` on the lead detail page, and
offline-conversion upload to Google. The honest first move is an inventory: for a click, a form
submission, and a phone call, what identity actually lands in the database — gclid, UTM parameters,
a session id, an IP, a name and email? — and where does the trail break.

Then close the gap between "we have a number" and "we can see who". The dashboard reports counts;
the owner is asking to click a conversion and see the person.

- **Inventory first.** Trace one real lead end to end and write down what exists at each hop. Do not
  build a viewer over fields that turn out to be empty.
- **Click → person.** `gclid` is the join key Google gives us; make sure it is captured on landing,
  persisted through the form, and stored on the lead so a conversion can be traced back to the ad,
  the campaign and the keyword.
- **Calls.** Almost certainly the weakest link — a phone call carries no gclid unless call tracking
  is configured. Say so rather than implying coverage. This may be an owner decision (a call-tracking
  number costs money) rather than an engineering task.
- **A drill-down.** From a conversion count on the dashboard, reach the list of people behind it,
  and from a person reach their first touch, their form, and their job if they became one.

**Two rules this slice must not break:**

- **Privacy is not an afterthought here.** This is customer PII — names, emails, phone numbers,
  addresses, and the ad that caught them. It belongs behind the same gate as the rest of the money
  pages, must never reach a client bundle that a non-admin can load, and must not be logged.
- **Never invent an identity.** If a conversion has no identifiable person, the answer is
  "anonymous — no gclid captured", not a plausible-looking guess. A dashboard that quietly attributes
  the wrong customer to a sale is worse than one that admits it does not know.

## Group F — File management

Added 2026-08-11 (same session), owner:

> *"We should be able to open the file manager and find all of the drawings, images, receipt images,
> jobs, folders, files, docs, and everything… navigate through the levels and sub-levels… searches
> and file format filters… totally linked to every page on the backend… Some folders and files will
> just be for personal use for each user, and some will be company wide, and some will just be for
> specific roles."*

And, decisively, on how to go about it:

> *"If we already have file management, please just review it and improve it as much as possible. If
> we don't, then build it completely… Just don't build two conflicting versions of a file
> explorer/file management system. It should all work together and be cohesive."*

### **We already have one. This group EXTENDS it and never forks it.**

Reviewed 2026-08-11. `/admin/files` is a real virtual filesystem, not a stub:

- **Schema**: `file_nodes` + `file_permissions` (seeds 384/385, both applied).
- **Page**: `app/admin/files/page.tsx`, ~1,110 lines — folder tree, multi-select, drag-move,
  clipboard copy/cut, rename, delete, a preview viewer, and a permissions editor.
- **API**: list, upload + upload/complete, `[id]` mutate, copy, download, permissions,
  permissions/preview, people.
- **Mounts**: `lib/files/mounts.ts` already surfaces four existing sources as **read-only** virtual
  folders — receipts, job files, research documents, field media — synthesized on read, capped at
  `download`, role-gated, and re-validated on the download route.

So the architecture is sound and the answer is *improve*, not *rebuild*. **No slice below may create
a second explorer, a second permissions model, or a second upload path.** Where a feature is missing
it gets added to `file_nodes` / `mounts.ts` / `/admin/files`.

### What the review actually found missing

Measured against the owner's list, not guessed:

| Asked for | State today |
|---|---|
| Receipts, job files, research docs, field media | ✅ mounted read-only |
| **Drawings** | ❌ `cad_drawings` is **not mounted** — explicitly named by the owner |
| Folders, levels and sub-levels | ✅ `file_nodes` tree |
| **Search** | ❌ **none.** No search input exists on the page at all |
| **File-format filters** | ❌ none |
| Upload | ✅ exists |
| Personal / company-wide / role-scoped | ⚠️ `file_permissions` supports it; needs checking that the UI *says* which a folder is |
| **"Linked to every page"** | ❌ no shared attach/browse component; each feature has its own uploader |
| Mobile | ⚠️ unaudited at phone width |

### F1 — Mount the drawings ✅ SHIPPED 2026-08-11

`cad_drawings` is the one source the owner named that has no mount. Add it to `mounts.ts` beside the
existing four — same read-only contract, same role gate (`drawer`, `admin`, `developer`), same
download re-validation. Nothing else changes: one more entry in `SOURCES` and its resolver.

- **Done when:** a drawer can browse Drawings in `/admin/files` and open one, and cannot rename or
  delete it.

**Completion note — and this was NOT the one-line addition it looked like.**

Drawings differ from the four existing mounts in a way that matters: `cad_drawings.document` is
**JSONB in the database**, not an object in a storage bucket. There is no path to sign, so the mount
contract — resolve to `{bucket, path}`, hand back a signed URL — simply does not apply. Three
consequences, each handled rather than papered over:

1. **The download is synthesized.** `resolveMountFile` returns an `inlineBody` for this source only;
   every other source keeps the signed-URL path untouched. Served as `.starr`, not `.json`, because
   that is what the CAD editor writes and reads — a file downloaded here opens again without being
   renamed. The schema's own comment calls `document` "the same payload as .starr file".
2. **The endpoint's contract did not change.** Returning the bytes straight from the download route
   was the obvious move and would have broken every existing caller: the explorer does
   `await res.json()` and reads `{ url }`, so a raw body would have parsed as the drawing and left
   `url` undefined. The URL now points back at the same route with `?raw=1`, which streams the body
   and re-validates the role gate — that is a normal request anybody could make directly.
3. **Opening beats downloading.** A drawing's natural action is the CAD editor, so mounted nodes
   carry `open_href` and the explorer checks it BEFORE preview and download. Without that ordering a
   drawing is `application/json`, falls through to `download()`, and hands somebody a blob when they
   wanted the drawing.

The listing deliberately does not `select` the `document` column — pulling 500 serialised drawings
to print their names would move megabytes to render a file list. Size shows features and layers
instead of bytes, because the byte length of a JSONB column means nothing to a surveyor.

**Verified against real data**, not a fixture: the root now lists Drawings beside the four existing
mounts at `view` access, `mnt:drawings` returns 3 real drawings, and the first downloads as a 356 KB
`26075.starr` with `Content-Disposition: attachment` and keys `version, document, application`.
`open_href` resolves to `/admin/cad?drawing=<id>`.

Also observed while verifying, and useful for F4: the root already contains **Personal** and
**Shared** folders at `manage`. The scoping exists structurally — F4's job is making a folder *say*
which it is, not inventing the concept.

### F2 — Search ✅ SHIPPED 2026-08-11

The largest gap, and the one that makes a file explorer usable at all: there is **no search input**.
A tree with hundreds of nodes and no search is a filing cabinet with the drawers welded shut.

- Search `file_nodes` by name, scoped to what the caller may see — the permission filter must be in
  the QUERY, not applied after, or a search leaks the existence of files by returning fewer results
  than it says.
- Include mounted sources, which means searching their underlying tables rather than `file_nodes`.
  Say when a source is excluded rather than silently returning less.
- Results show the containing folder, and clicking one navigates there with the file selected —
  "found it" and "can act on it" are different things.

**Completion note (F2 + F3 shipped together — the filter is useless without the search).**

`searchNodes` in `lib/files/server.ts`, `GET /api/admin/files/search`, and a search box + eight
format chips in the explorer.

**This slice's own instruction was wrong, and it is corrected rather than quietly ignored.** It said
the permission filter "must be in the QUERY, not applied after". That was written before reading the
permission model and is not achievable as stated: access is the MAX of grants matching you on the
nearest `custom` ancestor, resolved by walking the chain in TypeScript. Expressing it as SQL needs a
recursive CTE re-stating an inheritance rule that lives in code — the two-sources-of-truth problem
this codebase keeps paying for.

The real risk behind that instruction is **leakage**, and leakage is avoidable without SQL: match by
name, resolve access through the *same* code path the browse view uses, drop what you may not view,
and **never report a total**. "Showing 3 of 50" is the leak — it tells you 47 files exist that you
cannot see. The response carries `truncated` instead, which says only "there may be more".

Ancestors load in breadth-first passes rather than one chain walk per hit; 300 matches would
otherwise be 300 sequential round trips.

**It searches the mounts too**, which is most of the point: half the firm's files are not in
`file_nodes` at all. A search covering only `file_nodes` would answer "no such file" about a receipt
sitting right there in the tree. Mount search reuses `listMount` rather than adding a query path per
source, because that is where each source's role gate lives — and reports `mount_capped` rather than
implying it looked at everything.

**Two bugs the verification caught, both of which would have shipped:**

1. **`kindOf` and `FILE_KINDS` were first written in `server.ts`** and imported by the explorer — a
   **client component**. That would have pulled `supabaseAdmin`, and the SERVICE-ROLE KEY, into the
   client import graph. Next would very likely have failed the build, but "the bundler probably
   catches it" is not the standard for a credential. They now live in `lib/files/kinds.ts` with no
   imports at all, used by both sides.
2. **Filtering `kind=cad` returned zero hits over three drawings that were plainly there.** Mounted
   drawings render as `26075 (408 features, 6 layers)` — no extension — so `kindOf`'s fallback landed
   on `layers)` and filed them under "other". Fixed with a product media type,
   `application/vnd.starr.drawing+json`, used for classification only; the download still serves
   `application/json`, which is what the bytes are. Found by running the filter against real data
   rather than trusting the classifier.

**Verified against production data:** a two-character minimum is enforced with a readable message,
`q=26` returns 29 hits across `file_nodes` *and* the Research Documents and Drawings mounts each
showing its path, `kind=image` narrows to 26, `kind=cad` returns the two matching drawings, the UI
reports "29 matches", and the page does not scroll sideways at 360px.

### F3 — Format filters ✅ SHIPPED 2026-08-11 (with F2 — a filter is useless without the search)

Filter by kind (images, PDFs, documents, CAD, video, audio) on both the browse and search views.
Derived from `mime_type`, with a fallback to the extension for mounted rows whose mime is inferred.

### F4 — Say which scope a folder is ✅ SHIPPED 2026-08-11

The permissions model already supports personal / company / role. Whether a person can *see* which
one they are looking at is a different question, and the one that gets someone into trouble: a
folder that looks private and is not is a genuine privacy failure. Surface the scope as a visible
badge on every folder, and make the permissions editor state it in words.

**Completion note.** `describeAudience` in `lib/files/permissions.ts` (pure, 15 tests), resolved
server-side in `listChildren`, rendered as a badge on folder rows.

**It resolves inheritance rather than reporting it.** The tempting implementation reads a node's own
grants and shows "Inherited" when `permission_mode` is `inherit`. That answer is useless *and
reassuring* — "inherited" sounds contained while the parent may be shared with the whole firm. It
walks to the nearest `custom` ancestor exactly as `resolveAccess` does, so the badge and the actual
access can never disagree. Two other cases carry the same weight: an `everyone` grant **wins** over
precise shares sitting beside it (reporting "2 people" for a folder that is also company-wide would
be the most dangerous wrong answer available), and "Only you" **does not claim administrators are
shut out**, because they are not.

**The finding that came out of driving it against production data.** The root folder named
**"Personal"** badged **"Everyone"** — and that was *correct*: seed 385 grants it `everyone = view`
on purpose, because it is a container whose child folders are each owner-private. True and
frightening is the worst combination a badge can have. A badge that cries wolf is read once,
disbelieved, and then ignored on the folder where it mattered — which defeats the whole point of
this slice.

The distinction is in the data rather than the name: a seeded `is_system` root whose only
company-wide grant is **view** is a container, while "Shared" carries `everyone = edit` and is a
genuine company-wide drive. A read-only company folder somebody creates themselves is not
`is_system`, so it still reads "Everyone". Verified live: Personal → "Container", Shared →
"Everyone".

Badges are on **folders only**. A folder is what people put things into, so it is the decision
point; badging every file as well would make a wall of chips and train the eye to skip them.
Rendered inside the name cell rather than as a sixth grid column, so the row's five-column template
and its mobile collapse are untouched.

**One process note.** The badges did not render on first check and the row was missing from the DOM
entirely. That was **not** a code bug — the dev server had gone stale after a long session of edits
and was serving 404s for its own chunks, leaving the page stuck on the session-loading state. Worth
recording because the symptom is indistinguishable from "authored but not wired", which is the
defect this repo actually has; a restart is the first thing to try, not a rewrite.

### F5 — One attach/browse component, used everywhere ✅ PICKER SHIPPED · wider adoption blocked on a schema decision

*"Totally linked to every page."* Today each feature has its own uploader and its own idea of where
files go. Build **one** picker — browse the tree, search, upload-in-place, return a node id — and
adopt it feature by feature (job files first, then receipts, then research). Adopting it everywhere
in one slice is how a regression lands in ten places at once.

**Completion note. The picker is built and adopted once; the adoption this slice PLANNED is blocked
on a decision I am not going to make silently.**

`app/admin/components/files/FilePicker.tsx` — browse, search, breadcrumb, select, returns
`{ id, name }`. It calls the same two endpoints as `/admin/files`, so it can never show a different
tree or a different set of permissions from the explorer itself. It frames itself with M2's
`.admin-dialog`, inheriting the height cap, internal scroll and pinned footer rather than repeating
them. Permissions are **not** re-implemented: the list endpoint already returns only what the caller
may see, and the picker filters for *usability* (a folder you can only view is not somewhere you can
move a file INTO), never for visibility.

**Adopted in "Move to…"**, which needed no schema change and closed a real gap: moving something
previously meant dragging it onto a visible folder — impossible on a touch screen — or
cut → navigate → paste, which asks you to hold a destination in your head while walking there.
Verified end to end: `PATCH 200`, and the destination folder afterwards contains the moved item.

**Why job files were NOT adopted, which was this slice's stated plan.** `job_files.storage_path` is
`NOT NULL` and points into the `starr-field-files` bucket; a `file_nodes` file lives in a different
bucket under a different path. Attaching one to a job therefore means either **copying the bytes**
(duplicating the file, after which the two copies diverge and nobody knows which is current) or
**adding a nullable `file_node_id`** to `job_files` and teaching every read path to follow it.

The second is right and the first is a trap. But it is a schema change plus a read-path change
across every surface that lists job files — a slice of its own, with a seed, not something to bolt
onto the end of this one. **Naming it beats half-doing it**, and building the picker with no adopter
at all would have been the exact "authored but not wired" defect this doc keeps finding.

Next slice for this, when it is picked up: seed `job_files.file_node_id` (nullable, FK to
`file_nodes`), make `storage_path` nullable for referenced rows, then adopt the picker behind an
"Attach from Files" action.

**One honest note about the verification.** An intermediate run reported the destination empty after
the move, and I took that at face value and started hunting a bug in working code. It was a false
negative — a 2.5 s wait where the round trip needed more. The decisive run traced the actual network
call (`PATCH 200`) and re-read the destination, which is what should have been done first: a UI
assertion that something did *not* happen is exactly the kind that needs the underlying request
checked before believing it.

### F6 — Mobile ✅ SHIPPED 2026-08-11

`/admin/files` has never been audited at phone width, and a two-pane tree + detail layout is the
shape most likely to fail there. Add it to the M4 audit's route list, then reformat: the tree
becomes a drill-down rather than a side-by-side pane.

**Completion note. The overflow guard passed — and the page was still bad on a phone.**

`/admin/files` is now the 21st route in the M4 audit and reports zero sideways scroll at 360px. That
is worth stating plainly because it is the limit of that guard: **no page-level overflow is not the
same as usable**. Measuring the actual controls found two defects the audit cannot see:

- **Action buttons were 27 × 27 px.** Four of them, adjacent, on every row the viewer can manage —
  and one of them is **Delete**. Well under the 40px floor this product holds controls to, and a
  mis-tap there does not do nothing, it does something else.
- **The name column collapsed to 108 px** — under a third of the row, about twelve characters of a
  filename, which is the one thing you are scanning a file list for.

Squeezing harder fixes neither, so the actions **reformat onto their own line** below 640px: the
name takes the full width back and the buttons get real targets. `:empty` keeps rows with no actions
on a single line, so the list only grows where it must. Measured after: buttons **40 × 40**, name
column **232 px**, chips **34 → 40 px**, still no sideways scroll.

**Two self-inflicted faults on the way, both worth recording because both looked like other things:**

1. **A backtick inside a CSS comment took the page down.** The stylesheet is a `styled-jsx` template
   literal, so ``` `2.2rem 1fr auto` ``` in my own explanatory comment terminated the string. The
   symptom was a 500 on `/admin/files`, which reads exactly like a broken import.
2. **The first version of the phone overrides did nothing at all.** They were written inside the
   *existing* `@media (max-width: 640px)` block near the row rules — but the F2/F3 base styles are
   appended **after** that block, and on equal specificity the later rule wins. The chip stayed 34px
   and the measurement is the only reason it was caught. The overrides now sit last in the sheet,
   with a comment saying why. This is the "authored but not wired" shape in CSS: the rule existed,
   read correctly, and had no effect.

### F7 — Prove it end to end ✅ SHIPPED 2026-08-11

Upload a file into a personal folder, a company folder and a role folder; confirm each is visible to
exactly the right accounts and invisible to the others. Permissions are the part of this system where
a bug is silent and expensive.

**Completion note.** `e2e/file-permissions-hold.spec.ts` — three real signed-in accounts against the
live API.

**Why an e2e and not more unit tests.** `resolveAccess` and `describeAudience` are already covered
and are pure: they answer correctly about grants handed to them. What they cannot tell you is
whether the database, the API and the session all agree — whether a grant written through
`PUT /permissions` is the grant `listChildren` reads back, and whether a real account with real
roles sees what the model says it should. That gap is exactly where a permission bug hides, because
nothing throws and nobody notices.

Three transitions, each asserted from both sides:

1. Shared with **one person** → that person sees it, and a second employee account **does not**.
2. Shared with **everyone** → the account that could not see it a moment ago now can.
3. Shared with **nobody** → both lose it again. Un-sharing is the direction people actually rely on,
   and a model that only ever widens is the one that leaks.

Plus the documented exception: an admin still sees it, which is why F4's badge never promises true
privacy.

**Both employee accounts are non-admin on purpose.** An admin resolves to `manage` on every node, so
an admin can never demonstrate that something is hidden — a negative assertion written against one
would pass for the wrong reason forever.

**It was red-tested.** A negative assertion that passes on its first run deserves suspicion, so the
grant was temporarily widened to include the second employee: the "must NOT see it" expectation
failed, by name. It has teeth.

**It writes to the live database, and cleans up.** There is no staging database, so it creates one
uniquely-named folder under Shared and deletes it in `finally` — including when an assertion fails.
It never touches an existing node and never uploads a file: a folder proves the grant logic, and a
stray empty folder is a far cheaper failure than a stray document. Verified afterwards that all
test folders carry `deleted_at` (the product's normal soft-delete, invisible in the explorer and
swept by the `purge-deleted` cron).

**One thing this could NOT test, stated rather than glossed:** the **role**-grant path end to end.
It needs a non-admin account holding a named role, and this firm has none — every `drawer`,
`researcher` and `field_crew` holder is also an admin, so they would see the folder regardless and
the assertion would prove nothing. The role logic is covered at the unit level in
`file-audience.test.ts`; closing the end-to-end gap needs a non-admin role account to exist, which
is an owner decision about staffing, not an engineering task.

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
| M1 | ✅ shipped | Two-tap did NOT reproduce; fixed the measured z-index defect (drawer under the top bar) + close button + hover gating |
| M2 | ✅ shipped | .admin-dialog shell + Edit Roles converted; red-tested (888px on an 844px screen) |
| M3 | ✅ shipped | Found 2 defects: 1 uncapped modal + 13 vh caps that lie on mobile Safari, all twinned to dvh |
| M4 | ✅ shipped | Guard over 20 routes at 360px: ZERO sideways scroll, zero offenders. Non-reproduction recorded; M5-M8 need real data |
| M5 | ☐ | Hub portrait |
| M6 | ☐ | Jobs portrait |
| M7 | ☐ | Receipts portrait |
| M8 | ☐ | Hours portrait |
| M9 | ✅ shipped | viewport-fit=cover + top/side/dialog insets; a dozen pre-existing env() rules were inert until now. Device check outstanding |
| A1 | ✅ shipped | One /admin/marketing with 4 tabs, URL-held state, old routes redirect, 4 nav rows → 1 |
| A2 | ✅ shipped | lib/marketing/date-range.ts (25 tests incl. the 1st-of-month rollover) + RangePicker in the shell; one control, four tabs |
| A3 | ☐ | Impressions / clicks / conversions live |
| A4 | ☐ | Auto-refresh + freshness stamp |
| A5 | ☐ | Visual overhaul |
| A6 | ☐ | Google Ads access-level probe |
| A7 | ☐ | Unique customer behind each click / conversion / form / call — inventory first |
| E1 | ✅ shipped | WORK_ROLES has no employee, so /admin/my-hours was hidden from them. 4 registry + 5 middleware gates widened; 23-assertion guard |
| E2 | ✅ shipped | seed 581 + /admin/role-requests; approving calls the ONE existing grant path; verified end to end incl. 403 on self-approve |
| N1 | ✅ shipped | thread_id had an FK to admin_discussion_threads — EVERY message notification insert had been failing 23503 into a silent catch |
| N2 | ✅ shipped | link was ?conversation= which nothing reads; now /admin/messages/<id>, verified 200 |
| N3 | ◐ shipped | reading clears the bell + badge server-side (verified 1→0). Live push to an already-open tab remains |
| N4 | ☐ | Badge verified on real iOS + Android PWAs |
| F1 | ✅ shipped | Drawings mounted; JSONB not a bucket, so the download is synthesized as .starr and open_href goes to CAD |
| F2 | ✅ shipped | Search over file_nodes + all mounts; never reports a total (that is the leak) |
| F3 | ✅ shipped | 8 kind chips; caught drawings mis-filed as other, fixed with a product media type |
| F4 | ✅ shipped | describeAudience + badges; resolves inheritance, and found "Personal" badged Everyone (true, and crying wolf) |
| F5 | ◐ picker shipped | FilePicker built + adopted in Move-to. Job-file attach needs a job_files.file_node_id column — named, not half-done |
| F6 | ✅ shipped | 27x27 action buttons → 40x40, name column 108px → 232px, chips 34 → 40; route added to the M4 audit |
| F7 | ✅ shipped | 3 real accounts, live API, red-tested; role path NOT testable — no non-admin role holder exists |
| S1 | ☐ | Build, PR, merge, confirm redeploy |

## Known-red before this work started

Two suite failures exist on clean `main` (verified by stashing this branch and re-running):

- `theme-vars-are-adopted.test.ts` — hardcoded-colour ratchet at **2344**, limit 2297.
- `starr-assumptions.test.ts` — firm-identity references at **175**, limit 160.

Neither is caused by this branch: the new `JobRefPicker.css` was written to add **zero** to the
ratchet (measured 2344 before and after), and no new file hardcodes the firm name. Both are ratchets
that someone let drift; they need their own slice, and pretending they are ours would hide that.
