# One portal per job: consolidating 138 nav links into 29

**Status:** planning · written 2026-08-24 · no code written yet

> **How to run a slice.** Pick the top unchecked `- [ ]`. Ship it, verify it in a browser, tick it
> with what you actually did — including what you decided *not* to do and why.

---

## §0. What was asked for

> *"We need to really consolidate as many pages as we can… if we can consolidate all of the payment
> pages into a single payment portal, that would be great. The payment portal would look different
> depending on which role the user has… We need to have the same system for hour management too…
> the same for job management… equipment management… doing taxes… reviewing ads and conversions…
> There are just way too many links in all of the side navbar menu items… one portal for receipt
> management. This will handle adding receipts, reviewing receipts, and approving and denying
> receipts or specific items on receipts."*

Seven portals named explicitly: **payments, hours, jobs, equipment, tax, advertising, receipts.**
Plus the general instruction: go through everything and find the rest.

---

## §1. The measured picture

Not estimates. Counted from `lib/admin/route-registry.ts`, the 133 page dossiers derived on
2026-08-24, and every `page.tsx` under `app/admin`.

| | Count |
|---|---|
| `page.tsx` files under `app/admin` | **181** |
| Of those, dynamic detail routes (`/admin/jobs/[id]`) | 38 |
| Entries in the sidebar registry | **138** |
| Workspaces they are split across | 7 |
| Links in the biggest workspace (Office) | 33 |
| Links in the second biggest (Money) | 30 |
| Pages under 250 total lines including everything they import | **43** |
| Pages that ALREADY use tabs | **49** |
| Redirect stubs from a consolidation already done | 5 |

Two of those numbers are the whole argument.

**43 pages are under 250 lines.** A page that is one filtered table and a heading is not a page; it
is a tab that was given a URL. `/admin/receivables` is 160 lines. `/admin/payouts/search` is 201.
`/admin/pass-through` is 197. `/admin/billing/invoices`, `/admin/billing/plan-history` and
`/admin/billing/upgrade` are 200, 205 and 226 — three sidebar links for one subscription screen.

**49 pages already use tabs.** The pattern the owner is asking for is not a new idea in this
codebase. It is the majority idiom already; it has simply never been applied to the sidebar.

---

## §2. The pattern already exists, it shipped, and it was the same request

This matters more than anything else in this document, so it goes before the plan rather than inside
it: **do not invent a consolidation pattern. Extend the one that is already running in production.**

`/admin/marketing` absorbed three pages in a slice labelled A1. Its header says why:

> *"has tabs for the different advertising elements that we need to manage"* — an owner request,
> answered by moving four page bodies into `_tabs/` untouched and keeping `?tab=` in the URL.

And `app/admin/marketing/spend/page.tsx`, in full, is now:

```tsx
// /admin/marketing/spend — kept as a redirect, not deleted. A1.
//
// The page body moved into the tabbed shell at /admin/marketing (see `_tabs/`). This file stays so
// that every bookmark, every link in an old email, and every `// Spec:` reference to the old URL
// still lands in the right place instead of 404ing.
import { redirect } from 'next/navigation';
export default function Page(): never { redirect('/admin/marketing?tab=spend'); }
```

Four properties of that slice are worth copying exactly:

1. **The tab lives in the URL, not in component state.** A reload keeps you where you were, the back
   button steps between tabs, and — the one that actually matters — a tab is a link somebody can
   send. *"Look at the upload log"* should be a URL, not four instructions.
2. **The page bodies moved untouched.** Rewriting a page in the same slice that relocates it means
   any bug that appears afterwards has two possible causes. Move first; improve later, separately.
3. **The old routes still exist**, as one-line server redirects. No bookmark breaks, no email link
   404s, and the `middleware.ts` role gate on the old prefix still applies on the way through.
4. **It is already proven at this scale** — and `/admin/marketing` is 1,932 lines across four tabs,
   which is larger than most of the portals proposed below.

**One consequence for §0: advertising is already done.** `/admin/marketing` has `overview`, `spend`,
`conversions` and `uploads` tabs today. The only work left in that domain is folding `/admin/leads`
in, which is P6 below. The owner asked for something that already exists, which is worth saying
plainly rather than building twice.

**A second precedent, and a warning with it.** `/admin/schedule` is a redirect to `/admin/calendar`,
and `/admin` is a redirect to `/admin/me`. Both are correct. But on 2026-08-24 the design tracer
followed `/admin/schedule` and stored 72 elements of the CALENDAR as the locked "1:1 with what is
served" default of the SCHEDULE route. **Every redirect this plan creates is a place some other tool
can quietly file the wrong page under the wrong name.** The tracer and the dossier deriver were both
taught to refuse a route that forwards; anything new that walks routes needs the same check.

---

## §3. The rule: when a page becomes a tab, and when it does not

A rule stated once here, so that forty decisions below are not forty arguments.

**Merge when all four are true:**

- **Same subject.** The pages are about the same nouns — the same table, or the same money.
- **Same session.** A person doing one of these jobs is plausibly about to do the other. Approving
  hours and locking the pay period are one sitting; approving hours and editing the CAD catalogue
  are not.
- **The nav entry is a filter.** If the only difference between two pages is a `WHERE` clause, they
  are one page with a control on it. Six of the thirty money links are this.
- **The merge does not make a page nobody can load.** See the risk in §8.

**Do NOT merge when any of these is true:**

- **It is a detail route.** `/admin/jobs/[id]` is not a tab of `/admin/jobs`; it is a record. All 38
  dynamic routes are out of scope, permanently.
- **The roles genuinely differ in KIND, not in degree.** A tab a role cannot see is fine. A whole
  portal where every tab is hidden is a broken page — see §5.
- **It is a full-screen tool.** `/admin/cad` renders its own shell and never mounts
  `.admin-layout__content` at all. It is an application that happens to live at a URL.
- **It is a creation flow that is long enough to be its own place.** `/admin/receipts/new` is 2,424
  lines with a camera in it. It stays a route; it just also becomes reachable as a button.
- **Merging only helps the sidebar.** If the pages have nothing to do with each other and the merge
  exists to make a number smaller, the number was the wrong target.

---

## §4. The consolidation map

**138 nav links → 29**: 111 absorbed into 17 portals, 27 links surviving, plus the two portals
that are new routes (`/admin/pay`, `/admin/hours`).

> **This number is counted, not estimated.** `node scripts/nav-consolidation-count.mjs` runs the
> map below against the live registry and prints the result. Re-run it after every slice; it goes
> stale loudly rather than quietly.
>
> **The first draft of this document said 24, guessed rather than counted, and was wrong by nine.**
> That is recorded rather than tidied away because it is the same defect this repository keeps
> finding in its own instruments — a confident number nobody derived.

Each portal below lists what it absorbs and what it does with it.

### P1 — Pay & Payouts · `/admin/pay` (absorbs 11)

The owner's headline example. Eleven links, one question: what is somebody owed and how do they get
it.

| Absorbed | Becomes | Today |
|---|---|---|
| `/admin/payroll` | tab `runs` | 1,370 lines, already tabbed |
| `/admin/payouts` | tab `ledger` | 478 |
| `/admin/payouts/runs` | tab `runs` (same tab) | — |
| `/admin/payouts/ad-hoc` | a button on `ledger` | 300 |
| `/admin/payouts/search` | the search box on `ledger` | 201 |
| `/admin/payouts/withdrawals` | tab `withdrawals` | 266 |
| `/admin/payout-log` | tab `history` | 353 |
| `/admin/pay-rates` | tab `rates` | 269 |
| `/admin/pay-progression` | tab `rates` (same tab) | 2,622 |
| `/admin/my-pay` | **the employee's view of this portal** — see §5 | 345 |
| `/admin/rewards`, `/admin/rewards/admin`, `/admin/rewards/how-it-works` | tab `rewards` | 348 + 784 + 247 |

`/admin/payouts/search` is the clearest case in the whole document: a 201-line page whose entire job
is to search a table that another page already lists. It is a search box that was given a sidebar
link.

- [ ] **P1.1** — the shell, the tab set, and `?tab=` in the URL. Bodies moved untouched.
- [ ] **P1.2** — redirect stubs for all 11 old routes.
- [ ] **P1.3** — the role views (§5).

### P2 — Receipts & Spending · `/admin/receipts` (absorbs 4)

Named explicitly: *"one portal for receipt management… adding receipts, reviewing receipts, and
approving and denying receipts or specific items on receipts."*

**Most of this already exists.** `/admin/receipts` is 5,517 lines with `pending / approved /
rejected / exported / needs_review` tabs and bulk approve. What is missing from the owner's sentence
is **per-ITEM approval** — today the decision is per receipt.

| Absorbed | Becomes |
|---|---|
| `/admin/receipts/new` | stays a route, and becomes the `+ Capture` button on the portal |
| `/admin/cards` | tab `cards` — the card registry receipts are matched against |
| `/admin/pass-through` | tab `rebilled` — costs paid on a customer's behalf |
| `/admin/mileage` | tab `mileage` — the other reimbursable |

- [ ] **P2.1** — absorb cards, pass-through and mileage as tabs.
- [ ] **P2.2** — **per-item approve/deny.** The one genuinely NEW capability in this plan. Needs a
      decision first: does denying one line item reject the receipt, reduce it, or split it? That is
      an accounting question, not a UI one, and it belongs to the owner. **BLOCKED pending that
      answer** — do not guess.

### P3 — Hours & Time · `/admin/hours` (absorbs 4)

| Absorbed | Becomes |
|---|---|
| `/admin/hours-approval` | tab `approvals` (admin) |
| `/admin/my-hours` | tab `my-time` — **the same portal, employee view** |
| `/admin/time-off` | tab `time-off` |
| `/admin/availability` | tab `availability` |

The dossiers show `/admin/my-hours` and `/admin/hours-approval` already call the same three APIs —
`time-logs`, `time-logs/advances`, `time-logs/lock-period`. They are one screen with two permission
levels, built twice.

### P4 — Jobs & Projects · `/admin/jobs` (absorbs 6)

| Absorbed | Becomes |
|---|---|
| `/admin/projects` | tab `projects` |
| `/admin/projects/new` | a button |
| `/admin/jobs/new` | a button |
| `/admin/jobs/import` | a button on the `jobs` tab |
| `/admin/calendar` | tab `calendar` |
| `/admin/timeline` | tab `activity` |
| `/admin/field-data` | tab `field-data` |

`/admin/jobs/[id]` (8,734 lines) is **not** touched. It is a record, not a tab.

### P5 — Equipment · `/admin/equipment` (absorbs 10)

The most mechanical merge in the document — fourteen links about one cage.

`today` · `checked-out` · `timeline` · `maintenance` · `consumables` · `templates` ·
`templates/cleanup-queue` · `overrides` · `fleet-valuation` · `inventory` · `import` →
tabs `today / check-in-out / schedule / maintenance / supplies / templates / valuation / audit`,
with `inventory` and `import` as buttons on the catalogue tab.

`/admin/vehicles` (1,302 lines) joins as tab `vehicles` — it is fleet, and the dossiers show
`/admin/equipment` already calls `/api/admin/vehicles`.

`/admin/personnel/crew-calendar` moves to **P3 (Hours)**, where it belongs. It is filed under
Equipment today, which is worth noticing as evidence that the current grouping is not load-bearing.

### P6 — Growth · `/admin/marketing` (absorbs 1)

Already has `overview / spend / conversions / uploads`. Add `/admin/leads` as tab `leads`.
**`/admin/leads/[id]` (3,348 lines) stays a record.**

### P7 — Books & Tax · `/admin/finances` (absorbs 3)

| Absorbed | Becomes |
|---|---|
| `/admin/finances/overview` | tab `overview` — money in vs money out |
| `/admin/finances/reconcile` | tab `reconcile` — the bank CSV queue |
| `/admin/payouts/tax-report` | tab `payroll-tax` |
| `/admin/finances` (Schedule-C summary) | tab `schedule-c` |

### P8 — Customer Money · `/admin/invoicing` (absorbs 4)

`/admin/invoices/new` (890) → a button · `/admin/invoicing/categories` (an admin list) → tab
`categories` · `/admin/receivables` (160) → tab `collections` · `/admin/payments/inbox` → tab
`incoming`.

### P9 — Subscription · `/admin/billing` (absorbs 3)

`billing/invoices`, `billing/plan-history`, `billing/upgrade` — 200, 205 and 226 lines. Three
sidebar links for one subscription screen that **already has tabs**. This is the cheapest slice in
the plan and should probably be done first as the pilot.

### P10 — People · `/admin/people` (absorbs 6)

`/admin/employees` · `/admin/employees/manage` · `/admin/users` · `/admin/invites` ·
`/admin/roles/custom` · `/admin/role-requests` → tabs `directory / accounts / invites / roles /
requests`.

**Care needed:** `/admin/employees` and `/admin/users` are different nouns — a person who works here
versus a login. They are adjacent, not identical, and the tab labels have to keep that clear.

### P11 — Messages · `/admin/messages` (absorbs 3)

`messages/contacts` · `messages/new` · `messages/settings` → a directory pane, a compose button and
a settings tab. `/admin/email/new` and `/admin/email/sent` join as tab `email`.

### P12 — Knowledge · `/admin/learn` (absorbs 8)

19 links today. `roadmap` · `modules` · `knowledge-base` · `flashcards` · `flashcard-bank` ·
`quiz-history` · `search` · `references` · `practice` → tabs. **`exam-prep` and its four children
stay separate** — an exam sitting is a session you do not want a tab bar in.
**`learn/manage` and its two children stay separate**: authoring is a different job from studying,
done by a different role, and `manage/lesson-builder` is 3,199 lines.

### P13 — Research · `/admin/research` (absorbs 5)

`coverage` · `library` · `pipeline` · `sites` · `self-heal` · `billing` → tabs.
**`/admin/research/[projectId]` (22,112 lines — the largest page in the product) is untouched**, and
so is `/admin/research/testing` (a lab) and `/admin/cad` (its own shell).

### P14 — Company · `/admin/settings` (absorbs 5)

`org-settings` · `orgs` · `announcements` · `notifications` · `me/privacy` → tabs.

### P15 — System · `/admin/support` (absorbs 3)

`support/new` · `error-log` · `audit` → tabs. Developer-facing; low traffic; low risk.

### P16 — Files · `/admin/files` (absorbs 1)

`/admin/my-files` is the same filesystem scoped to one person — a role view, not a page. §5.

### P17 — Page Designer · `/admin/design` (absorbs 5)

`design/compare` · `design/dossiers` · `design/versions` · `design/conformance` · `design/serve`
→ tabs.

**This one contradicts the first draft**, which said the design tool should be left alone because
consolidating an internal tool "helps nobody who does the firm's actual work". That was wrong on
its own terms: six sidebar links for one internal tool is exactly the complaint being answered,
and the fact that the tool is mine to maintain is not a reason to exempt it from the rule in §3.

### P18 — Exam Prep · `/admin/learn/exam-prep` (absorbs 3)

`exam-prep/sit` · `exam-prep/sit/mock-exam` · `exam-prep/rpls` → tabs on the prep landing.
**The exam itself still opens as its own route** — §3 says a sitting is not a thing to put a tab
bar in, and that still holds. What is being merged is the four ways IN to it, not the exam.

### P19 — Learning Content · `/admin/learn/manage` (absorbs 2)

`manage/media` · `manage/question-builder` → tabs. Authoring stays separate from studying (P12);
this merges only the authoring surfaces with each other.

### Also folded in while verifying the count

These were "left alone" in the first draft and do not survive the rule in §3 on a second look:

| Route | Goes to | Why the first draft was wrong |
|---|---|---|
| `/admin/contacts`, `/admin/discussions` | P11 Messages | all three are "talking to people" |
| `/admin/notes` | P14 Company | company notes are a settings-adjacent company record |
| `/admin/team`, `/admin/assignments` | P3 Hours | who is working, and on what — the same session as approving their hours |
| `/admin/schedule` | P3 Hours | it is **already a redirect stub** to `/admin/calendar` and should never have been a sidebar link |
| `/admin/weather`, `/admin/compliance` | P4 Jobs | both are "can we work, and may we" |
| `/admin/reports` | P7 Books & Tax | it is a financial report |

### Left alone deliberately (and why)

| Route | Why it stays |
|---|---|
| `/admin/me` | the Hub. It is the thing portals are reached FROM. |
| `/admin/search` | searches everything; belongs to no portal. |
| `/admin/profile` | 1,199 lines, already tabbed, personal. |
| `/admin/cad` | own full-screen shell, outside `.admin-layout` entirely. |
| `/admin/design` + 5 children | an internal tool with its own IA; consolidating it helps nobody who does the firm's actual work. |
| `/admin/files` | 2,249 lines, a filesystem. `/admin/my-files` is its personal view — §5. |
| `/admin/install` | one screen, one job |
| `/admin/research/testing` | a lab, not a view |
| `/admin/office`, `/admin/work`, `/admin/money`, `/admin/research-cad` | the four workspace landings. They exist to make 138 links navigable and may not survive C13 — but removing them is an IA decision, not a merge. Dropping them takes the total from 29 to **25**. |
| all 38 `[id]` routes | records, not tabs |

---

## §5. The role axis — one portal, several views

> *"The payment portal would look different depending on which role the user has."*

**This is already how the product is built — it is just built as separate PAGES instead of separate
views.** Four pairs:

| Employee page | Admin page | Same data? |
|---|---|---|
| `/admin/my-pay` | `/admin/payroll` + `/admin/payouts` | yes — dossiers show shared `payroll/balance`, `payouts/search` |
| `/admin/my-hours` | `/admin/hours-approval` | yes — shared `time-logs`, `advances`, `lock-period` |
| `/admin/my-files` | `/admin/files` | yes |
| `/admin/my-notes` | `/admin/notes` | yes |

Collapsing each pair into one portal with a role-chosen default view is the owner's request answered
exactly. **Three rules for doing it without breaking anything:**

1. **The API is the boundary, not the tab.** A tab hidden in the UI is a convenience; the route
   behind it must still refuse. This repo already learned that — `middleware.ts` carries the note
   that the gate "keeps out roles the product never offers the page to at all" while "the API is the
   real boundary". Consolidation must not quietly widen a gate: a portal reachable by six roles
   whose tabs are gated to one is a **wider** door than six separately-gated pages, and it is the
   single most dangerous thing in this plan.
2. **Never render an empty portal.** If a role can see no tab, the portal must not be in their
   sidebar at all. The registry already computes per-route role visibility; the portal's entry needs
   to be visible only when at least one of its tabs is.
3. **The default tab is per role, and the URL still wins.** A field crew member landing on
   `/admin/pay` gets `my-pay`; an admin gets `runs`. But `/admin/pay?tab=runs` sent to either of
   them opens `runs` — or refuses, if they may not see it. A default is a courtesy; it is not a
   permission.

---

## §6. What this does to the sidebar

| | Now | After |
|---|---|---|
| Nav links | 138 | **29** (25 if C13 drops the four workspace landings) |
| Workspaces | 7 | 5 or 6 (see below) |
| Deepest nesting | 3 levels | 2 |

With 29 destinations, **the 7-workspace split may stop earning its keep.** Workspaces exist to make
138 links navigable; 29 links fit in one grouped list. That is a judgement call for the owner and it
should be made AFTER a few portals ship, not designed up front on a guess.

**Do not delete the workspace concept in the same slice as the merges.** Two large IA changes at
once means any complaint afterwards has two possible causes.

---

## §7. Risks, named

1. **A portal that is slower than the page it replaced.** Four tabs' data fetched on mount is four
   times the work for a person who wanted one. **Fetch per tab, on demand.** `/admin/marketing`
   already does this; copy it.
2. **The widened door.** §5.1. The most dangerous item here. Every merged route's role list must be
   re-derived as the UNION of what it absorbs — and then each tab gated to its own original list, at
   the API. A test should assert that no tab is reachable by a role its old route refused.
3. **Bookmarks and deep links.** Solved by the redirect-stub pattern — but there are ~150 of them
   after this plan, and every route-walking tool has to know they forward. §2.
4. **Losing a page by absorbing it.** A tab nobody clicks is easier to lose than a link nobody
   clicks. Before merging a page, check whether anyone actually uses it — `lib/admin/nav-telemetry.ts`
   exists and should be read first.
5. **The 22,112-line page.** `/admin/research/[projectId]` and `/admin/jobs/[id]` (8,734) are not in
   scope, but they IMPORT from the pages being moved. Check imports before moving any body.
6. **Doing it all at once.** 15 portals is a quarter's work. §8 orders them so the cheapest and least
   risky comes first and the plan can be abandoned after any slice with the product in a coherent
   state.

---

## §8. Slices, in the order they should be done

Ordered by *risk-adjusted value*: the pilot is small and reversible, the owner's named portals come
early, and the internal tooling comes last.

- [ ] **C0 — Get real usage data before absorbing anything.** See §10: the telemetry that exists
      cannot answer "which links does anyone open", and the sample it does have suggests some of
      these pages want DELETING rather than re-homing — a cheaper answer than a tab. One slice:
      emit a `nav.route.view` event on every admin route for two weeks, then read it. **This can
      change the plan below, so it goes first — but it does not block C1, which is safe either
      way.**
- [ ] **C1 — Pilot: P9 Subscription** (3 links → 1). Smallest, already tabbed, lowest traffic,
      admin-only. Proves the mechanics end to end and produces the reusable portal shell.
- [ ] **C2 — Extract the shell.** Whatever C1 produced, as `lib/admin/portal/` — tab set, `?tab=`
      routing, per-role default, per-tab gating, per-tab lazy fetch. Everything after this is
      configuration.
- [ ] **C3 — P5 Equipment** (14 → 1). Biggest single reduction, one subject, low blast radius.
- [ ] **C4 — P3 Hours** (4 → 1) **including the role split**. First portal to prove §5.
- [ ] **C5 — P2 Receipts** (4 → 1), tabs only. **Per-item approval is P2.2 and is blocked** on the
      owner's accounting answer.
- [ ] **C6 — P1 Pay & Payouts** (11 → 1). The headline. Do it after Hours has proven the role split.
- [ ] **C7 — P4 Jobs** (6 → 1).
- [ ] **C8 — P7 Books & Tax** + **P8 Customer Money** (7 → 2).
- [ ] **C9 — P10 People** + **P11 Messages** (9 → 2).
- [ ] **C10 — P6 Growth** (1 → 0 new links; leads into marketing).
- [ ] **C11 — P12 Knowledge** + **P13 Research** (13 → 2).
- [ ] **C12 — P14 Company** + **P15 System** (8 → 2).
- [ ] **C12b — P16 Files** + **P17 Page Designer** (6 → 2). Internal surfaces, done last on purpose:
      they are the ones whose breakage costs the firm nothing.
- [ ] **C12c — P18 Exam Prep** + **P19 Learning Content** (5 → 2).
- [ ] **C13 — Re-examine the workspaces** with 24 links instead of 138. §6. A separate decision,
      made with the result in front of you.
- [ ] **C14 — Re-derive the dossiers and re-trace the defaults.** Every merge invalidates a dossier
      and a locked default design. `scripts/derive-dossiers.mjs --area admin` and
      `scripts/trace-defaults.mjs --area admin`, and the conformance record with them.

---

## §9. What the usage data does and does not say

Checked rather than assumed, because "nobody uses that page" is the kind of claim that justifies
deleting somebody's tool.

`nav_events` holds **239 rows spanning 2026-05-29 → 2026-08-24**. It records workspace clicks,
command-palette opens and persona switches — **not page views**. There is no `page_views` table and
no `route_visits` table; `activity_log` (213 rows) records domain actions, not navigation.

**So the product cannot currently answer "which of these 138 links does anyone open."** That is a
gap worth closing before deleting anything, and it is C0.

Two things it CAN say, both worth acting on:

**Workspace clicks over three months:**

| Workspace | Links in it | Clicks |
|---|---|---|
| Hub | 14 | 66 |
| Work | 18 | 47 |
| Office | 33 | 40 |
| Knowledge | 19 | 36 |
| Research & CAD | 10 | 33 |
| Equipment | 14 | 7 |
| **Money** | **30** | **3** |

**Money is the second-largest workspace in the product and was opened three times in three
months.** It is also the one the owner most wants consolidated. Those two facts together are the
strongest argument in this document — not that the pages are badly grouped, but that thirty links
were built for a job nobody has yet done in the app.

**Distinct paths seen at all: 52**, out of 138 nav links plus 38 detail routes. The top of that
list is `/admin/me` (58), `/admin/work` (24), `/admin/office` (19), `/admin/messages` (12),
`/admin/receipts` (9), `/admin/jobs` (7).

**The honest caveat, stated so nobody over-reads the number:** `pathname` is recorded only when a
nav event fires, so it is a sample of "where someone was when they clicked a workspace", not a
visit log. A page missing from those 52 is **not proven unused** — it is unobserved. That
distinction is exactly why C0 exists, and why no page in this plan is marked for deletion yet.

---

## §10. The open questions — owner decisions, not engineering ones

1. **Per-item receipt approval (P2.2):** when one line on a receipt is denied, does the receipt get
   rejected, reduced, or split into two? This is the only genuinely new capability requested and it
   cannot be guessed.
2. **Employees vs Users (P10):** are these one list with a status column, or two genuinely different
   things? Today they are two pages with 25 and 643 lines. It is a data question.
3. **Rewards (P1):** is the points store part of pay, or its own thing? It is filed under Money
   today and reads as a separate product.
4. **Workspaces after (C13):** keep 7, collapse to 3–4, or drop the concept and use one grouped
   list?
5. **Anything to DELETE rather than absorb?** C0 will produce candidates. A link nobody opens is
   cheaper removed than re-homed.
