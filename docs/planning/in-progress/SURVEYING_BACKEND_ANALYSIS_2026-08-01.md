# The surveying backend — full analysis, and what to do about it

**Status:** IN PROGRESS · opened 2026-08-01 · owner-directed · **stop-hook doc — work it slice by slice**
**Owner ask:** *"I want you to do a full and complete analysis of everything on it and see if you can find any
ways it can be improved for future use."*

> **How to work this doc.** Take the **lowest-numbered unchecked slice in the lowest unchecked phase** and do
> it. One slice = one commit, ending green: `tsc --noEmit`, the relevant `vitest` scope, `eslint`. UI slices
> are **driven in a browser** before being ticked — the standing rule here, and this document contains three
> fresh examples of why. Tick the box, write one line of what actually shipped, move on.
> **Do not renumber slices.** Insert as `A3-2b` rather than shifting everything below.

---

## What this thing actually is, measured

Every number below was counted, not estimated.

| | |
| --- | --- |
| Pages | **216** |
| API routes | **521** total — **380** business, 141 D&D |
| Admin API routes | **340** |
| Library modules | **849** `.ts` files |
| Live Postgres tables | **277** |
| Seed files | **299** |
| Test files | **1,370** — 603 D&D, **767** business |
| Whole suite | **20,206 passing**, 30 skipped, ~57s |

**This is not a small app, and it is not a prototype.** 340 admin API routes and 277 live tables is the
surface area of a mature internal platform. The analysis below is therefore about *risk and leverage* rather
than about building missing features — most of what a surveying firm needs is already here.

---

## The three findings that matter

Ordered by what they would cost if left alone. Each was **verified against the code**, and one of them
started life as a false alarm that verification killed — which is recorded because it is the more useful
half of the story.

### 🔴 F1 — Public endpoints have NO abuse protection of any kind

**Measured:** rate limiting exists on **27 routes, all of them D&D**. Business routes: **zero**. The two
genuinely public endpoints have no rate limit, no captcha, no honeypot, no per-IP throttle:

| Endpoint | What an abuser gets |
| --- | --- |
| `POST /api/contact` | Sends **three emails per submission** (info@, the Yahoo account, Hank personally), **uploads attachments** to Supabase storage, and writes a `leads` row. Unbounded. |
| `GET /api/public/invoice/[number]` | Invoice-number **enumeration**, returning customer name, amounts and balances. |

The contact form is the sharper of the two: a script pointed at it fills Hank's inbox, burns the Resend
quota (which, once exhausted, silently stops **real customer enquiries** from being emailed at all), and
fills the storage bucket. The lead table would also fill with junk, which is where the office looks for work.

**Ironically the machinery already exists** — `lib/dnd/rate-limit.ts` and `seeds/456_dnd_rate_limits.sql`
were built for the hobby project and never applied to the business. That is the whole fix: lift it out of
`lib/dnd/` and put it in front of the public surface.

### 🟠 F2 — The D&D project has better engineering hygiene than the business it lives inside

Not a criticism of the D&D work — it is genuinely well built — but the asymmetry is the finding:

| | D&D | Business |
| --- | --- | --- |
| Rate limiting | 27 routes | **0** |
| Route-authorization sweeps | done, with a source-scanning guard | never run |
| Browser-verified UI passes | standing rule, ~130 slices | ad hoc |
| Planning docs | 5 live, slice-by-slice | this is the first |

**The business backend is where the money is**, and it is the half with less coverage. F1 exists because
nobody ever swept the business routes the way the D&D routes were swept. The phases below are largely that
sweep.

### 🟡 F3 — Two live-money defects found in one afternoon, by looking

Both were found incidentally while doing something else, which is the argument for doing this deliberately:

- **Google Ads was double-counting every `/contact` lead** (fixed 2026-07-31). Two conversion paths fired
  for one submission, and Smart Bidding had been training on a lead count roughly twice reality.
- **The invoice portal rendered completely unstyled** (fixed 2026-07-31) — the stylesheet was imported by a
  page that a guard skips, so the customer-facing payment page shipped as raw HTML with its heading behind
  the logo. **On the page where customers pay.**

Neither had a failing test. Both had *passing* ones — the payment test asserted the header component was
mounted, which it was, invisibly, behind the site logo.

> ### ⚪ The finding that wasn't: 328 "unauthenticated" admin routes
>
> A first sweep reported that **328 of 340 admin API routes had no auth call**, which would have been a
> catastrophic finding. It was wrong: the grep looked for `getServerSession`, and this repo uses
> `auth()` / `isAdmin` from `lib/auth`. Re-measured with the right predicate: **340 of 340 are gated. Zero
> gaps.**
>
> It is recorded because the near-miss is instructive. A confident wrong number in a document like this
> would have sent someone on a week-long audit of a problem that does not exist — and the only thing that
> stopped it was opening one of the files to see what it actually did. **Check the tool before believing the
> measurement**, especially when the measurement is alarming.

---

## Phase A — close the public surface (F1)

*Highest value per hour in the entire document. Nothing here is speculative.*

- [x] **A1-1 — Promote the rate limiter out of `lib/dnd/`. SHIPPED 2026-08-01.** Moved to
      `lib/rate-limit.ts`; `lib/dnd/rate-limit.ts` is now a re-export, so all 27 call sites are untouched.
      The counter table moved with it — `dnd_rate_limits` → `rate_limits` (seed **502, applied live**) —
      and there was nothing to migrate, because counter rows belong to windows that expire. **Not forked:**
      two copies is how one gets the fix and the other does not, which this repo has learned three times
      (the two `MAX_BYTES`, the fourth roll log, the stage token three of four stylesheets read).
      *Five source-scanning tests read the old path and were repointed; they are the reason the move was
      provably complete rather than probably complete.*

- [x] **A1-2 — Throttle `POST /api/contact`. SHIPPED 2026-08-01.** Two buckets, both per IP because there
      is no user: **5 per 10 minutes** stops a burst, **20 per day** stops the slow grind that never trips
      the burst limit. Checked burst-first so a customer who simply resubmitted gets the actionable message
      rather than the 24-hour one.
      **Placed above `parseRequest`**, which matters more than it looks: parsing a multipart body reads the
      uploaded files into memory, so throttling after that point still makes us do the expensive part.

- [x] **A1-3 — A honeypot field on every intake form. SHIPPED 2026-08-01.** `lib/leads/honeypot.ts`
      (13 tests) + `HoneypotFields`, on **all four** surfaces.
      **A trapped submission is told it SUCCEEDED.** A bot that gets an error retries, mutates, and finds
      the shape that works; one that gets a 200 goes away and learns nothing. The price of that choice is
      that a false positive is **invisible to the customer** — they believe they contacted us and nobody
      has — which is why the checks are deliberately loose (a missing timestamp is never a trap) and why
      every trip is logged.
      *Rendering the inputs turned out not to be enough:* every form builds its body from React state, not
      the DOM, so a hidden input nothing reads is submitted by nobody. `honeypotValuesFrom` closes that,
      and takes any container rather than a form — the calculator submits from a button and has no form.
      **Browser-verified both ways:** a real customer's submission carries the timestamp and no honeypot; a
      filled honeypot is transmitted so the server can trap it.

- [x] **A1-4 — Throttle the public invoice lookup. SHIPPED 2026-08-01.** 30 per 5 minutes — enough to
      fumble an invoice number repeatedly without noticing.
      The route's own header said the slug "prevents enumeration". True of the slug; **not** true of
      `invoice_number`, which the same handler also accepts because it is what is printed on the paper
      invoice the customer is holding. *(Equal-time responses for hit and miss remain open — see A1-4b.)*

- [x] **A1-4b — Make a hit and a miss take the same time. SHIPPED 2026-08-01.** Two mechanisms, and the
      first is the real one.
      **The same round trips either way.** A miss that skipped the payments query is structurally faster,
      and a difference that scales with how busy the database is cannot be padded away — so that query
      now runs on both paths, looking up an id that exists nowhere when there is no invoice.
      **And a floor** (`lib/http/constant-time.ts`), applied to *every* terminal path rather than the
      404 alone: one unpadded `return` reinstates the leak, and the next one added would be an early
      refusal, which is the shape that returns fastest. A test asserts there are none.
      *Measured on the running app, and it corrected this file's own first draft:* hit and miss came back
      at a **median of 515 ms and 522 ms** — seven apart on five hundred. **The equal-work change did
      that; the floor never fired**, because the real work already exceeded it. The floor earns its place
      in the other regime, where both paths are tens of milliseconds and a residual 15 ms is 60% rather
      than 1% — proportion is what an attacker averages, not absolute time. The comment now says so
      instead of claiming the floor sits above the slow path.

- [x] **A1-5 — Cap the storage a single IP can consume. SHIPPED 2026-08-01.** `UPLOAD_LIMITS` caps one
      file and `QUOTE_ATTACHMENT_MAX_TOTAL_BYTES` caps one submission at 25 MB. Nothing capped a DAY, and
      A1-2 allows 20 submissions per address — so the real uncapped figure was **500 MB from one
      connection**, discoverable only via a storage bill or a quota wall.
      **Counted in MEGABYTES, which is why the limiter gained a `cost`.** A per-submission limit cannot
      express "a lot of small ones", and a per-request limit set low enough to bound the bytes would
      refuse the customer who legitimately sends one big site plan. 60 MB/day is far above a real enquiry
      — a survey request is a few photographs and a PDF — and far below what makes filling the bucket
      worth anyone's time.
      The charge is `Math.max(1, Math.ceil(mb))`: the counter stores integers, so a thousand 0.4 MB
      uploads would otherwise cost nothing, and a zero cost would make the check free to bypass. The
      default stays 1, so the seven buckets that were counting requests before `cost` existed still do.
      *Necessarily after `parseRequest`*, unlike A1-2's burst limit — the sizes are the thing being
      limited and they do not exist until the body is read. Acceptable precisely because the burst limit
      sits above it: an abuser gets five parses per ten minutes to reach this wall.

## Phase B — sweep the business routes the way the D&D routes were swept

- [ ] **B1-1 — Authorization sweep over all 380 business routes**, in the style of
      `__tests__/dnd/delete-route-authorization.test.ts`: classify each handler by its gate, then pin the
      result with a source-scanning test so a route added in a hurry cannot skip it. The admin routes are
      already clean (340/340) — this is about `/api/app`, `/api/platform`, `/api/webhooks` and `/api/public`.

- [ ] **B1-2 — Every destructive handler, specifically.** "Signed in" is never sufficient for a DELETE: the
      question is always *whose* it is.

- [ ] **B1-3 — Webhook signature verification.** `/api/webhooks` accepts money-adjacent events from Stripe.
      Verify the sweep covers replay protection, not just signature validity.

- [ ] **B1-4 — Service-role audit.** `supabaseAdmin` bypasses RLS entirely. Enumerate every route that uses
      it with a user-supplied id and confirm ownership is checked in the handler, because the database will
      not check it for them.

## Phase C — the money path

- [ ] **C1-1 — End-to-end test of the invoice lifecycle**: issued → partially paid → paid, including the
      upfront rule. Six test invoices exist in live data (`TEST-0001`…`TEST-0006`) covering exactly these
      states — they should be driven by a test, not only by hand.
- [ ] **C1-2 — Reconcile `payment_attempts` against real payments.** The deep-link methods (Venmo, Cash App,
      Zelle) rely on the customer pressing "I sent it", so the office queue is a claim, not a fact. A
      report of claims with no matching payment after N days is the control that makes it trustworthy.
- [ ] **C1-3 — Receipt on every path.** Verify a receipt actually sends for each of the six methods.

## Phase D — the leads-to-cash loop (feeds the Google work)

- [ ] **D1-1 — Lead → job conversion is one action.** `converted_job_id` exists; confirm the office can do
      it in one click and that the lead's attribution travels with it, since that is what `job_secured`
      uploads depend on.
- [ ] **D1-2 — Stale-lead surfacing.** `follow_up_date` exists and nothing appears to chase it. A lead that
      nobody rings is the cheapest lost revenue in the business.
- [ ] **D1-3 — Source attribution on the leads board** (also G1-4 in the Google doc — do it once).

## Phase E — durability

- [ ] **E1-1 — Where are the backups?** 277 tables of a real business. Confirm PITR is on and, more
      importantly, that a **restore has actually been rehearsed**. An unrehearsed backup is a belief.
- [ ] **E1-2 — What happens when Resend is down?** Today a customer enquiry emails three people and writes
      a row. If the email fails, is the lead still captured — and does anyone know the email did not send?
- [ ] **E1-3 — Error budget.** `/admin/error-log` exists; is anyone looking at it, and does anything alert?

---

## What is deliberately NOT in this document

- **A rewrite of anything.** Nothing here is architecturally wrong. The app's shape is sound and the
  problems are gaps, not misdesigns.
- **The D&D platform.** It has five planning docs of its own.
- **Feature requests.** The owner asked what could be *improved*, and the honest answer is that the highest
  value available is closing a public form that anyone can point a script at — not new features.

## Why this ordering

Phase A is first because it is the only phase where the *downside is unbounded*: everything else costs time,
while an unthrottled contact form can exhaust an email quota and take real customer enquiries down with it.
Phase B is second because it is the sweep that would have caught A. C and D are revenue. E is the one that
matters most on the day it matters at all.
