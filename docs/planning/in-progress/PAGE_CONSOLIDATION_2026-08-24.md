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

- [x] **P1.1** — the shell, the tab set, and `?tab=` in the URL. Bodies moved untouched.
- [x] **P1.2** — redirect stubs for all 11 old routes.
- [x] **P1.3** — the role views (§5).

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

- [x] **P2.1** — absorb cards, pass-through and mileage as tabs. Shipped 2026-08-25 with C5.
- [ ] **P2.2a — surface the per-line editor on the approval queue.** It exists and works; it is
      only mounted in the slideshow. §10.1.
- [ ] **P2.2b — a per-line tax treatment**, beside the per-line accept. Deductible · partial ·
      not deductible. `receipts.tax_deductible_flag` is the receipt-level answer and stays as the
      default a line inherits until somebody says otherwise.
- [ ] **P2.2c — `approvedTotal()` and `deductibleTotal()`, exported, used everywhere.** Once a line
      can be rejected there are three numbers — spent, approved, deductible — and every screen that
      says "the receipt amount" has to say which. This is the `effectiveHours` defect waiting to
      happen: four files summed raw hours while a fifth summed the approver's adjustment, and the
      two disagreed across the very decision that created them. One definition, before the first
      screen reads `total_cents` again.
- [ ] **P2.2d — teach `/admin/finances` the difference.** Its Schedule-C report totals approved
      receipts today. Per-line exemption changes what it is allowed to count, so P2.2 and P7 are
      one data model seen from two ends.

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

- [x] **C0 — Get real usage data before absorbing anything.** Shipped 2026-08-24. The product
      could not answer "which of these 138 links does anyone open"; now it can, and the answer
      arrives in two weeks rather than being argued about.

      **What shipped.** `nav.route.view`, one row per admin route opened, through the telemetry
      that already existed — `trackNavEvent` → `POST /api/admin/nav-events` → `nav_events`. Four
      files: the event name added at both ends (the emitter can post whatever it likes;
      `KNOWN_EVENTS` decides what is stored, and a name added at one end only is dropped with a
      400 nobody reads), `RouteViewTelemetry` mounted app-wide beside the two existing
      effect-only components, and `lib/admin/route-usage.ts` holding the rule.

      **One rule, exported, used at both ends.** A raw pathname cannot be counted:
      `/admin/jobs/58a62727-…` and `/admin/jobs/8d787d88-…` are two visits to one page. The
      emitter writes `props.route` and the report groups by it, both through
      `normaliseRoutePath`. That is deliberate rather than tidy — the design conformance check
      shipped with two matching rules, one at each end, and they disagreed about the name of the
      same element; 220 of 266 defaults were reported stale and the score was really measuring
      class-attribute order. The same shape here would be a report counting a route the emitter
      never wrote, and it would look exactly like a page nobody opens.

      **The reading half shipped with it.** `scripts/nav-usage-report.mjs` — a slice that writes
      rows nobody can read is not a slice, it is a table. It ranks what was opened and lists what
      was not **next to the roles that could have opened it**, because there are three reasons a
      route can be missing and only one of them is a finding: nobody opened it, nobody who could
      was in the window, or it was never reachable at all — and the third is a bug, not a
      deletion candidate.

      **Off in development** unless `NEXT_PUBLIC_ROUTE_TELEMETRY=1`. A developer reloading
      `/admin/jobs` forty times while working on it would drown the signal from the people this
      plan is about.

      **Verified end to end in a browser**, not just wired: the guard compiles to `if (false)`
      with the flag set, a route load and a real in-app `<Link>` click both reach `nav_events`
      with the right normalised route, and neither fires twice. **The first probe reported zero
      events and was wrong** — `sendBeacon` sends a Blob and Playwright could not read the body.
      Seventh time in this repository that the instrument was the defect; the database settled
      it. The eight QA rows were deleted afterwards, because synthetic views would poison the
      first read of the very data this exists to produce.

      **One thing this deliberately does not measure:** which TAB gets used. `?tab=` is stripped
      by the normaliser, so `/admin/marketing?tab=spend` counts as `/admin/marketing`. That is
      right for the question C0 asks — is this ROUTE worth keeping — and it becomes the wrong
      answer the moment portals exist. **C13 should revisit it.**

      **Still to do, and it is not code:** deploy, then leave it alone for two weeks. Nothing in
      this plan should be deleted on the strength of a shorter window than that.
- [x] **C1 — Pilot: P9 Subscription. 4 links → 1**, shipped 2026-08-24. One better than planned,
      and smaller than planned, because the page had already done half of it.

      **What was already there.** `/admin/billing` has had real in-place tabs since
      `billing-real-tabs-2026-06-21`, and both surfaces already shared one fetcher. The missing
      piece was not the tabs — it was the URL. `useState` became `?tab=`, which is the one property
      of the marketing precedent worth copying above all others: a reload keeps you where you were,
      the back button steps between tabs, and a tab becomes a link somebody can send.

      **It is also what makes the redirects honest.** Without a URL for the tab, forwarding
      `/admin/billing/invoices` could only land on the overview — which looks exactly like the
      invoices having gone missing.

      **`/admin/billing/upgrade` is removed from the nav and KEPT as a route**, and the distinction
      is the one real judgement in this slice. It is not a view of your subscription; it is the
      interstitial the bundle gate sends you to, from anywhere, carrying `?requiredBundle=` and
      `?returnTo=`. The sidebar row was the accident: "Upgrade Plan" rendered **"Unknown bundle"**
      when clicked, because the parameters that give the page meaning only exist when the gate
      sends you. Making it a tab would have been worse than leaving it alone — somebody blocked
      from `/admin/research` would land on a billing portal with a tab bar instead of on a sentence
      explaining what happened. §3's "merging only helps the sidebar" rule, applied.

      **Three guards fired, and all three were right.**

      - `orphan-routes` — *"a page nobody can reach is a page nobody built"*, the ratchet against
        this repo's most common defect. Removing the upgrade page's registry entry made it an
        orphan by that test's model, and the model was incomplete rather than the change wrong:
        it knew about pages you navigate to and pages that forward, and not about **pages the code
        sends you to**. That third kind now exists in the sweep as a NAMED list whose value is
        where-from, checked against the source on every run — a stale exemption would silently
        keep a genuinely orphaned page off the report.
      - `consolidation` — asserted `/admin/billing/upgrade` is in the Money workspace. It is in no
        workspace now, deliberately. The invariant it guards (the firm's money surfaces live in
        ONE workspace, not scattered across two) is untouched; the sample was updated with the
        reason inline.
      - `inline-style-hex-ratchet` — the two pages became stubs, so the baseline over-recorded.
        Re-baselined DOWN: 2308 → 2306.

      **Verified in a browser, 12 checks**: both old bookmarks land on the right tab with it
      actually selected, a pasted `?tab=` opens that tab, a reload keeps it, a mistyped tab falls
      back to the overview instead of rendering nothing, clicking a tab writes the URL, and the
      upgrade interstitial still resolves its bundle from its query parameters.

      **The first run showed 1 of 3 redirects failing and that was the dev server, not the code.**
      A control against `/admin/marketing/spend` and `/admin/schedule` — two stubs that have been
      in production for months — showed them behaving identically to mine, which is what proved
      the mechanism was fine. Warm, it is 12/12. Worth writing down because every future slice in
      this plan will make redirect stubs, and each one will look broken on its first cold compile.

      **Not done here: the reusable shell.** The plan expected C1 to produce it. It did not, and
      should not have — `/admin/billing` already had a tab implementation, so extracting a general
      shell from a page that needed almost no change would have been designing it from one
      example. C2 extracts it from this plus `/admin/marketing`, which is two.
- [x] **C2 — Extract the shell** as `lib/admin/portal/` — tab set, `?tab=` routing, per-role
      default, per-tab gating, per-tab lazy fetch, and the toggle read from §11.6. Shipped
      2026-08-25. **Everything after this is configuration.**

      Extracted from `/admin/billing` and `/admin/marketing` **together**, as the slice insisted.
      Both are now callers: billing's page lost its `?tab=` reader, its unknown-value fallback, its
      `replace`-not-`push` rule and its "default tab has no query string" rule, and kept a
      three-entry list of tabs — the only part that was ever about billing.

      **The one thing they disagreed about is the whole reason this is not a five-line helper.**
      Marketing keeps a date range in the URL beside the tab and had one writer for the entire query
      string, precisely because each of its four predecessor pages owned its own pair of date inputs
      and changing the tab dropped the period. A shell that owned `?tab=` alone would have
      re-created that bug **inside the thing extracted from the page that had it**, in every portal
      that later grew a second parameter. So `portalHref` takes the other parameters as an argument:
      preserving them is the caller's declaration, not the shell's guess.

      Browser-verified, both pages:

      | | result |
      |---|---|
      | `/admin/billing` default | no `?tab=` — the canonical URL |
      | click Invoices | `?tab=invoices`, panel swaps, no navigation |
      | `?tab=nonsense` | falls back to Overview |
      | `/admin/billing/invoices` | still forwards to `?tab=invoices` |
      | marketing `?preset=last-month` → Spend | `?tab=spend&preset=last-month` — **period kept** |
      | marketing custom range → Spend | `?tab=spend&preset=custom&from=…&to=…` — **kept** |
      | back to the DEFAULT tab | `?preset=last-month` — period kept, no `?tab=` left behind |

      **The first probe reported the period being DROPPED** — the exact bug the shell exists to
      prevent, apparently reproduced by the extraction. It was not: the probe used
      `?preset=this-month`, and `this-month` **is** `DEFAULT_PRESET`, so `rangeToParams` correctly
      returns `{}` and the redundant parameter is normalised away. Confirmed against `HEAD` that the
      old code did exactly the same thing on the same input. Tenth time this session the instrument
      was the defect, and the first one where the false alarm was about the very property the slice
      was written to protect.

      **What the shell adds that neither example had**, and each is a real case the tests pin:

      · **A per-role default** (§5's *"one portal, several views"*) — a crew member lands on their own
        hours, a manager on the approval queue. One portal with two front doors rather than two
        portals. A default that is itself gated off falls through to the first visible tab, or the
        portal would render empty for exactly the people it was defaulted FOR.
      · **Per-tab gating on three independent axes** — the firm switched it off, the firm has no
        bundle, you do not have the role. Asked separately because they have three different
        remedies, and one boolean for all three makes *"why is this tab missing"* unanswerable. An
        admin bypasses the role check and does NOT bypass the bundle: the firm has not paid.
      · **Requesting a gated tab by URL lands on one you can see.** The normal way this happens is
        somebody sending a link from an account with more access — not an edge case.
      · **`null` when a viewer can see no tab at all**, rather than a guess. Every tab switched off is
        a real state and the caller has to say something rather than draw an empty strip.

      §11.6's toggle read comes free: `canSeeTab` calls `isDestinationEnabled`, so a tab switched off
      in Settings → Pages leaves the strip — **including for admins**, because an easier sidebar is
      the whole request — and switching off the portal takes its tabs with it.

      The decidable half is pure and has no React, no router and no fetch in it. C3–C12c are
      seventeen portals standing on this; a mistake here is not one wrong page, it is the same wrong
      page seventeen times, discovered after they all exist.
- [x] **C3 — P5 Equipment.** Shipped 2026-08-25. **Thirteen nav destinations became one**, which is
      the biggest single reduction in the plan and the first portal built entirely as C2 configuration.

      | | before | after |
      |---|---|---|
      | Equipment workspace rows in the registry | 12 | **4** (three are `showInRail: false`) |
      | in the sidebar / rail | 11 | **1** |
      | plus `/admin/vehicles` in Work | 1 | 0 — it is a tab |

      Ten tabs: `today · check-in-out · schedule · maintenance · supplies · templates · cleanup ·
      valuation · vehicles · audit`. Ordered operationally rather than alphabetically — somebody
      opening this at 6am is answering *"what goes out today"*, and somebody opening it in the office
      is answering *"what did that cost"*. The first is the default; the second is three tabs along.

      **The components moved untouched** — nine `page.tsx` files and `/admin/vehicles`, ~7,400 lines,
      byte for byte apart from one import path in `CleanupTab`. `/admin/marketing` set that precedent
      and gave the reason: *"Rewriting them in the same slice that re-arranged them would have made a
      regression impossible to attribute."* Each still fetches on mount, and only the active panel is
      mounted — which is C2's per-tab lazy fetch with no coordination at all.

      **All ten old routes still exist and forward to their tab.** Verified in a browser, every one.
      Deleting them would break every bookmark and every link in an old email; a 404 says the page is
      gone and it is not.

      **`inventory` and `import` stay routes and became buttons**, as §4 says. Both were already
      `showInRail: false` — editors you arrive at from the thing you are editing — and `inventory`
      imports three sibling modules relatively, so moving it would have been the one move in this
      slice that was not mechanical.

      **`/admin/personnel/crew-calendar` moved out of the Equipment workspace.** §4 called it
      *"evidence that the current grouping is not load-bearing"*, and it was: a crew calendar is
      about PEOPLE and it sat in the cage because that is where somebody filed it. It is in Work
      until C4 takes it into the Hours portal.

      ── **THREE GUARDS FIRED, AND ALL THREE WERE RIGHT** ──────────────────────────────────────────

      · **`api-bundle-gate`** — three `/api/admin/vehicles/*` routes became unclassified. They had
        been classified by MIRRORING `/admin/vehicles` in the page registry, and removing that nav
        row broke the mirror. The gate fails closed on unclassified, correctly. The answer is written
        out rather than invented: that page was `internalOnly` with no `requiredBundle`, so it
        already resolved to *"always-available or operator-only"* — it just no longer depends on a
        nav row a later consolidation can remove.
      · **`route-registry`** — a test asserted `equipment_manager` can reach
        `/admin/equipment/maintenance`. The invariant holds and its SAMPLE moved; re-pointed at the
        portal rather than deleted, because what is being guarded is that the role reaches the
        workspace at all.
      · **`inline-style-hex`** — ten files "got worse" and ten "improved". Investigated before
        touching the ceiling, per the standing rule, and it was a pure rename: every new count equals
        its old one, and the repository total is **2306 before and 2306 after**. Nothing was added;
        285 hexes changed path. Re-baselined, and the old paths are gone from the file.

      **The first redirect probe reported all ten FAILING.** They were all fine: `redirect()` in
      these pages resolves as a client navigation after hydration, and the probe's fixed 1,500 ms
      wait was shorter than a cold dev compile. Waiting for the destination instead of for a number
      turned ten red lines green without a line of product code changing. Eleventh time this session
      the instrument was the defect — and the same fixed-wait mistake the design walks made, in a
      different tool.

      One consequence worth recording: `/admin/equipment` no longer renders `WorkspaceLanding`, so it
      is no longer one of the five routes a W4 composition can replace. That is the right trade — it
      is a real portal now rather than a card grid — but C13 should notice that consolidating a
      workspace landing removes a composition slot.
- [x] **C4 — P3 Hours, including the role split.** Shipped 2026-08-25. Four nav rows became one, and
      this is the slice that **proves §5**.

      `/admin/hours` — a new canonical route — with tabs `my-time · approvals · time-off ·
      availability`. §4's observation was right: *"the dossiers show `/admin/my-hours` and
      `/admin/hours-approval` already call the same three APIs. They are one screen with two
      permission levels, built twice."*

      **Verified with two real accounts, same URL:**

      | | tabs | lands on | `?tab=approvals` opens |
      |---|---|---|---|
      | admin | My time · Approvals · Time off · Availability | **Approvals** | Approvals |
      | employee | My time · Time off | **My time** | **My time** |

      That table is §5's three rules in one screenshot. The employee does not see the approval queue,
      lands on their own week, and a link to a tab they may not open gives them their own timesheet
      instead — *"a default is a courtesy; it is not a permission."*

      ── **§5's FIRST RULE IS THE DANGEROUS ONE, AND IT NEARLY BIT** ───────────────────────────────

      *"A portal reachable by six roles whose tabs are gated to one is a WIDER door than six
      separately-gated pages, and it is the single most dangerous thing in this plan."*

      The four pages had four different gates: three were open (`my-hours`, `time-off`,
      `availability` — each shows you your own week) and `hours-approval` carried a **middleware role
      gate**. Merging them means the portal cannot be gated to the approvers without taking every
      employee's timesheet away, so the route is open and **the gate moved down a level rather than
      away**:

      · each tab carries the exact role list its page carried — asserted by **reading the old lists
        out of `git show HEAD:` rather than retyping them**, because retyping would only test that I
        typed the same thing twice, which is the mistake being guarded against;
      · `resolveTab` refuses to open a tab the viewer may not see, browser-verified above;
      · every time-log endpoint keeps the check it had — this slice moved components between files
        and did not touch a handler.

      The middleware guard caught the change and asked the right question — *"reachable by ANY
      authenticated user and nobody has said whether that is intended"* — and the answer is written
      into `INTENTIONALLY_OPEN` with all of the above, rather than silently added to a list.

      §5's second rule comes free and not by luck: `/admin/time-off` was **ungated**, so the union of
      the four role lists is everybody, and every viewer has at least that tab. The registry row is
      therefore ungated too — which is the honest expression of the union rather than a widening. A
      row gated tighter would have removed access while claiming to merge.

      ── **NINE TEST FILES WENT RED, AND THAT WAS THE SLICE WORKING** ─────────────────────────────

      Four were samples that moved with the code — the nav label, the drawer parity list, and two
      hours tests reading the approvals file by path. Five were findings:

      · **`notify-links-audit`** — the real one. **Thirteen files** sent notifications and widget
        footers to `/admin/my-hours` and friends. They all still WORK, but each is a link somebody
        taps from a phone notification or an email, where a redirect costs a navigation and a flicker
        on the slowest connection any of them is used on. All repointed at the tab.
      · **`api-bundle-gate`** — `/api/admin/time-off` and `/api/admin/availability` lost the page
        mirror they were classified through. **Second consolidation in a row to break a mirror**, so
        both answers are now written out explicitly rather than inherited from a nav row.
      · **`employee-can-reach-their-own-things`** — *"My Hours is no longer in the nav at all."* The
        invariant holds and its sample moved; re-checked rather than assumed, since the portal is
        ungated and defaults an `employee` to `my-time`.
      · **`widget-links`** — the tab pattern was `[a-z]+`, written when the hub's tabs were single
        words. Portal ids are kebab-case everywhere. **A pattern that predates the convention it
        checks is a fossil, not a rule** — widened.
      · **`widget-and-page-links-resolve`** — banned every query string, for a right reason: *"a 'Go
        to my hours →' whose meaning lives in a query is one page pretending to be another"*, written
        about `/admin/me?tab=…` because **the Hub ignores `tab`**. A portal built on `usePortalTabs`
        does not. The rule was broader than its concern, so it is narrowed to *"a query string the
        destination does not read"* — checked by looking for `usePortalTabs` in the destination's
        page. Still catches the Hub; no longer forces widget footers back onto redirect stubs.

      And the inline-hex ratchet fired again for the same reason as C3 — two files moved, total
      **2306 before and 2306 after**. Investigated before re-baselining, as the standing rule says.

      **What this deliberately does NOT do:** merge `my-time` and `approvals` into one screen with
      conditional bits. They are the same data at two permission levels, and §5 says to collapse the
      pair into one portal with a role-chosen default — not to interleave two large components and
      hope the conditionals are right. The merge that matters is the one in the sidebar.
- [x] **C5 — P2 Receipts, tabs only.** Shipped 2026-08-25 as **P2.1**. Four nav rows became one.
      **Per-item approval is P2.2 and remains blocked** on the owner's accounting answer — see below.

      `/admin/receipts` with tabs `queue · cards · rebilled · mileage`, browser-verified:

      | tab | renders |
      |---|---|
      | queue | the approval queue, 3,366 chars, its own status filters intact |
      | cards | the card registry |
      | rebilled | pass-through costs |
      | mileage | the trip log |

      **Two kinds of tab, and why they do not collide.** The queue has its own strip — pending /
      approved / rejected / exported / needs review — and it stays inside the queue, on `useState`.
      Those are FILTERS of one list; the portal's are different subjects. Nothing collides because
      the filter was never in the URL, so `?tab=` was free. Verified rather than assumed: the queue's
      filters still read *"Pending 23 | Approved 0 | Rejected 0 | Exported 0 | Needs review 21"*
      under the portal strip. **The first portal to hit a filter that also wants the query string
      will have to name one of them, and it will not be this one.**

      **The role split is narrower here than in C4 and still had to be checked.** `/admin/cards` and
      `/admin/pass-through` were **admin-only**; the queue and mileage were admin / developer /
      tech_support. The union is the queue's own list, so the registry row is unchanged and the two
      admin-only tabs carry their own gate — a developer opening this portal sees two tabs, not four.

      **`/admin/receipts/new` keeps its own registry row**, and that is the one real judgement in the
      slice. It is the only surface here **anyone at the firm can reach** — a crew member holding a
      fuel receipt is not an admin — so folding it into an admin-gated portal would have taken it
      away from the people who file most of them. It is the `+ Capture` button AND a nav row.

      ── **THE MIRROR BROKE FOR THE THIRD TIME, AND THAT IS NOW A PATTERN** ────────────────────────

      `api-bundle-gate` lost `/api/admin/mileage`, exactly as it lost `vehicles` in C3 and `time-off`
      + `availability` in C4. **A group classified BY MIRRORING a nav row loses its classification
      the moment that row is merged away**, and the gate fails closed — correctly, and noisily, every
      single time. Named in the file now, because every remaining portal in §8 will do it again.

      ── **AND A TEST I WROTE YESTERDAY WAS TIME-BOMBED** ─────────────────────────────────────────

      `hours-portal.test.ts` read the pre-C4 role lists from `git show HEAD:` — which was right for
      exactly one commit and wrong the next morning. **A test that reads "the previous version" from
      a moving reference is not pinned to anything**: it silently starts comparing the code against
      itself and passes forever. Pinned to `3aef7ec5f` now, and an unreachable commit makes the first
      assertion fail loudly rather than letting four comparisons pass against `undefined`.

      Worth recording as its own lesson, separate from the slice: the clever version of that test —
      read the old values from git rather than retyping them — was the right instinct and the wrong
      reference. C6 onwards should pin the SHA from the start.

      Six other files went red and were samples that moved: the Money-workspace list, the registry
      label, two finance tests reading the queue by path, and the mileage form. The inline-hex
      ratchet fired for the third consecutive slice — **2306 before and 2306 after**, investigated
      before re-baselining.

      ── **WHAT IS STILL OPEN, AND IT IS THE HALF THE OWNER NAMED FIRST** ─────────────────────────

      *"…and approving and denying receipts or **specific items on receipts**."* P2.2a–d are
      untouched: the per-line editor exists and is mounted only in the slideshow, there is no
      per-line tax treatment, `approvedTotal()`/`deductibleTotal()` do not exist, and `/admin/finances`
      still totals whole approved receipts. Shipping the tabs did **not** ship per-item approval, and
      the portal's own header says so where somebody will read it.
- [x] **C6 — P1 Pay & Payouts.** Shipped 2026-08-25, all three sub-items. **Ten nav rows became one**
      — the owner's headline example, and the portal with the most at stake: every tab decides money.

      `/admin/pay` with ten tabs: `my-pay · payroll · ledger · payout-runs · withdrawals · history ·
      rates · rewards · rewards-admin · how-rewards-work`. All ten browser-verified rendering live
      data; all ten old routes verified forwarding to their tab.

      **§5 proven where it matters most, with two real accounts on one URL:**

      | | tabs | lands on | `?tab=payroll` opens |
      |---|---|---|---|
      | admin | **10** | Payroll | Payroll |
      | employee | **1** — My pay | My pay | **My pay** |

      An employee sees their own pay and nothing else. Nine money screens are invisible to them, and
      a link to the payroll run gives them their own payslip.

      ── **THE ROUTE-SCOPED STYLESHEET TRAP, WALKED INTO AND CLOSED** ──────────────────────────────

      `app/admin/payroll/layout.tsx` and `app/admin/rewards/layout.tsx` exist for **one reason each**:
      to import `AdminPayroll.css` and `AdminRewards.css`. A Next layout loads its stylesheet for its
      route TREE and nowhere else — the trap this repository has been caught by twice.

      Moving those bodies into tabs without their stylesheets would have rendered two tabs unstyled
      with **nothing failing**: no error, no red test, just a payroll screen that looked broken. The
      portal imports both, and it is verified rather than assumed — a `.payroll-overview` rule is
      present in the document, and `rewards__hero` computes to `radius=14px pad=32px` rather than to
      browser defaults.

      ── **AND WHAT DELIBERATELY DID NOT BECOME A TAB** ───────────────────────────────────────────

      **`/admin/pay-progression` is `parked: true`.** The plan's table maps it to tab `rates`, and
      doing that would have **silently un-parked it**: `accessibleRoutes` hides a parked route from
      everybody *including admins* — *"a parked feature is deliberately out of circulation"* — and a
      tab has no such flag. 869 lines of a deliberately-withdrawn feature would have come back in
      front of people as a side effect of a navigation change. It stays a parked route, untouched.

      `/admin/payouts/tax-report` is **P7's**, not P1's. `ad-hoc` and `search` are buttons, as the
      plan says — §4 calls search *"the clearest case in the whole document: a 201-line page whose
      entire job is to search a table another page already lists"*, and taking away its sidebar row
      is the slice.

      **One row went back in after being dropped.** `/admin/payouts/runs` is the parent of
      `/admin/payouts/runs/[id]` and `.../[id]/dispatch` — **records**, which §4 says are not touched
      — and the cron that prepares a batch links straight at one. With no ancestor in the registry
      that record has no breadcrumb and the notification audit cannot resolve the link. It is back
      as `showInRail: false`: not a nav row, just the parent of a record.

      ── **SEVENTEEN TEST FILES WENT RED. TWO WERE FINDINGS THAT MATTERED.** ──────────────────────

      · **`bundle-gate`** — `bundleForRoute('/admin/payroll')` fell to `null`. **This is the packaging
        gate**, and the question is whether a paid feature was given away. It was not: the portal
        resolves to `office`, the same bundle the money workspace always defaulted to, so a firm that
        could reach payroll yesterday reaches it today and one that could not, still cannot.
      · **`api-bundle-gate`** — twelve `/api/admin/payroll/*` and `/api/admin/rewards/*` routes lost
        their classification. **The fourth mirror break in four slices**, and the first where the
        answer was a real bundle rather than `null`: they carried `office` by mirroring pages in the
        `money` workspace. Unclassified fails CLOSED so nothing leaked — but that is luck about which
        direction the file errs, not a reason to leave it. Written out at the value they had.

      Everything else was a sample that moved: the Money-workspace list, the `paycheck → Payroll`
      ranker, two drawer parity lists, and **thirteen source files** whose notification and widget
      links pointed at the absorbed routes — all repointed, because each is tapped from a phone where
      a redirect costs a navigation.

      **A deliberate narrowing, recorded rather than smuggled.** `/admin/my-pay` was
      `INTENTIONALLY_OPEN` in middleware; `/admin/pay` is not. A `guest` who typed the old URL used
      to reach it and is now bounced. That is right: the registry never offered that page to a guest,
      so the only way in was typing the URL — and an ungated portal would have shown them a strip
      with **zero visible tabs** and the message *"every part of Pay is switched off for this
      company"*, which is a lie about a permission problem.

      The inline-hex ratchet fired for the fourth consecutive slice — **2306 before, 2306 after**.

- [x] **P1.1** — the shell, the tab set, `?tab=` in the URL, bodies moved untouched. Shipped with C6.
- [x] **P1.2** — redirect stubs for all ten absorbed routes. Shipped with C6, each verified in a browser.
- [x] **P1.3** — the role views (§5). Shipped with C6; see the two-account table above.
- [x] **C7 — P4 Jobs & Projects.** Shipped 2026-08-25. **Seven nav rows became one** — three absorbed
      as tabs, three demoted to buttons. `/admin/calendar` is **deliberately not among them**; see
      below, because the reason is the most interesting thing in this slice.

      `/admin/jobs` with tabs `jobs · projects · field-data · activity`, all browser-verified, plus
      `New job`, `Import` and `New project` as buttons that kept their routes and their admin gates.

      **The roles needed no union and no middleware change** — all three absorbed pages carried
      exactly `['admin','developer','tech_support']`, the same list the portal already had. The first
      portal in this plan where the four tabs simply agree about who may see them.

      ── **WHY `/admin/calendar` IS NOT A TAB** ───────────────────────────────────────────────────

      §4's table lists it. Absorbing it needed one of two things and §5's first rule refuses both:

      · **`/admin/calendar` has no `roles`.** Every signed-in person sees it in their nav today. This
        portal sits at `/admin/jobs`, whose middleware gate is
        `['admin','developer','field_crew','researcher','tech_support']`. Absorbing the calendar under
        that gate **takes it away from everybody else** — the narrowing C4's note called *"the same
        sin as widening it, and harder to notice because nobody complains about access they never
        had."*
      · **Widening `/admin/jobs` is worse.** Middleware matches by PREFIX, and `/admin/jobs` is the
        prefix of `/admin/jobs/[id]` and `/admin/jobs/[id]/field` — **job records**, which §4 says are
        not touched. It would open a customer's job record to every role in the product as a side
        effect of a navigation change.

      There is no third option: middleware cannot express *"this path but not its dynamic children"*.
      So the calendar keeps its route and its reach, and **C13 is the right place to decide where it
      belongs** — that slice revisits the workspaces with the whole picture, which is exactly the
      information this decision needs and does not have yet.

      ── **THE STYLESHEET TRAP, AND THIS TIME THE CODEBASE HAD ALREADY WRITTEN IT DOWN** ──────────

      `app/admin/projects/layout.tsx` carries a note from the last time somebody hit it:

      > *"The projects pages were first written against `jobs-page__*`, which is declared in
      > AdminJobs.css — a stylesheet imported by app/admin/jobs/layout.tsx and therefore scoped to the
      > /admin/jobs route tree. Nothing under /admin/projects ever loaded it, so every header, button
      > and title rendered as raw browser default **while reporting zero horizontal overflow**."*

      Moving projects into this portal reverses the direction and re-creates the identical failure.
      The portal imports `AdminProjects.css`, and it is **verified against the source rather than
      eyeballed**: `.proj-page` computes to `margin: 0 0 24px`, and the stylesheet says
      `.proj-page { margin-bottom: 1.5rem; }`. Same number, so the sheet is loaded and applying.

      `AdminJobs.css` comes free — the portal lives inside `app/admin/jobs/`, whose layout still
      loads it for the job records.

      ── **AND ONE INVARIANT THAT HAD TO MOVE RATHER THAN BE DROPPED** ────────────────────────────

      §2.6 of the platform audit found **five places answering "what happened and who did it"**, and
      its fix was to make each one say which question it answers. `/admin/timeline`'s registry
      description carried the sentence *"a working feed, not a compliance record: the Audit Log is
      that"* — and a registry description dies with the row.

      It is the `activity` tab's hint now, which is where a person actually reads it: above the feed
      rather than in a menu tooltip. The test moved with it rather than being deleted, because a
      consolidation that quietly lost that sentence would put the product back to four logs and no
      map. The audit page's cross-link points at the tab too.

      Eight test files went red; all were samples that moved, plus **two API groups** —
      `/api/admin/timeline` and `/api/admin/field-data` — losing their page mirror. **Fifth mirror
      break in five slices.** Both carried `office` via the `work` workspace and are written out at
      that value. The mechanism is not going to stop being true, and the note in the file now says so.

      *(One of my own repairs was wrong first: the Work-bundle sample swapped `/admin/timeline` for
      `/admin/field-data`, which C7 absorbed in the same breath. Two absent routes is not an
      improvement on one. It asserts `/admin/calendar` now — a Work route this slice deliberately
      kept, so it is a real third case.)*
- [x] **C8 — P7 Books & Tax + P8 Customer Money.** Shipped 2026-08-25. **Nine nav rows became two.**

      | portal | tabs | absorbed |
      |---|---|---|
      | `/admin/finances` → **Books & Tax** | overview · job profitability · reconcile · payroll tax | 3 rows |
      | `/admin/invoicing` → **Customer Money** | invoices · collections · incoming · categories | 3 rows + 1 button |

      All eight tabs browser-verified with live data; all six redirects verified landing.

      **Both labels had to change, and §2.2 is the reason.** "Job Profitability" was the whole page
      and is one tab of four now; "Customer Invoices" widened the same way. Leaving either would have
      been §2.2's own defect re-made by a slice that cites §2.2 — *a name that describes a fraction of
      what the row opens*. The three money words still cannot be mistaken for each other, which is
      what the test guards: **Software Subscription · Customer Money · Books & Tax**.

      ── **THE ROLE MOVES, IN BOTH DIRECTIONS** ───────────────────────────────────────────────────

      · **A widening, declared.** `/admin/payouts/tax-report` was admin-only under the `/admin/payouts`
        prefix; as a tab its ROUTE gate becomes `/admin/finances`'s three roles. The tab carries
        `roles: ['admin']`, `resolveTab` will not open it for anyone else, and the report's endpoint
        is untouched. What a developer gains is a portal whose tax tab they cannot open.
      · **A narrowing refused.** `/admin/receivables` was `['admin','developer']` — no `tech_support` —
        against the other three rows' three roles. Rounding it up to the portal's list would have
        handed somebody a list of what every customer owes as a side effect of a navigation change
        nobody would review for that. The `collections` tab keeps the narrower list.

      ── **THE ORPHAN GUARD FIRED, AND IT WAS THE RIGHT ONE TO FIRE** ─────────────────────────────

      `orphan-routes` asserts the **three go-live dashboards are on the RAIL, not merely registered** —
      they exist because three pages were BUILT to close go-live gaps and nothing linked to them, the
      sharpest version of *authored but not wired*. All three are tabs now.

      A tab of a railed portal is **more** findable than a rail row, not less: you reach it by opening
      the thing it belongs to. So the assertion moved one level up — the portal is on the rail, its
      keywords carry `overview`, `reconcile` and `payroll tax`, and each old route still resolves as a
      redirect rather than a 404.

      ── **AND A REAL KEYWORD LOSS, CAUGHT BY A TEST ABOUT PROPOSALS** ────────────────────────────

      `proposals.test.ts` asserts the aging report is findable *by the jargon* — `keywords: ['ar',
      'aging'…]`. The Customer Money portal's first keyword list **did not carry `ar` or `aging`**, so
      somebody typing either would have got nothing, which reads as the feature having been deleted.
      Every absorbed row's keywords are on the portal now, including `venmo`, `pledge` and `past due`.

      That is the second time this plan's keyword-carrying has been load-bearing rather than tidy, and
      the first time a test in an unrelated area caught it.

      ── **FOUR BACK-LINKS THAT BECAME LINKS TO THEMSELVES** ──────────────────────────────────────

      Three absorbed bodies carried *"← Finances"* / *"← Back to invoicing"* headers. Inside a tab OF
      that portal, those point at the page you are standing on — **a no-op navigation that reads as
      broken**. Removed; the tab strip is the way back.

      The fourth, *"← Payouts"* on the tax report, is a genuine cross-link to a DIFFERENT portal, so
      it is kept and repointed at `/admin/pay?tab=payout-runs` rather than left to bounce through
      C6's redirect.

      **This is a new defect class, not a one-off.** Every portal from here should check the absorbed
      bodies for back-links to their old parent — the merge turns them into self-links silently, and
      nothing fails.

      The API mirror broke for the **sixth time in six slices** (`/api/admin/payments/*`), carried
      across at `office`. The inline-hex ratchet fired for the fifth — **2306 before, 2306 after**.
- [x] **C9 — P10 People** + **P11 Messages** (9 → 2). **DONE 2026-08-25.**

      `/admin/people` gains five tabs beside its directory — Employees, Accounts, Invites, Roles,
      Requests — and `/admin/messages` gains Directory, Email and Settings beside its Inbox. Nine
      registry rows became two; three editors (`employees/manage`, `messages/new`, `email/new`) kept
      their routes and became buttons on the tabs they belong to.

      **§4's warning about the two nouns is in the tab labels.** `/admin/employees` is a person who
      works here and `/admin/users` is a login; they are **Employees** and **Accounts**, and each
      hint says which is which in its first clause, because a tab strip is read at a glance.

      **§5, on the product's most sensitive surface.** `/admin/people` is ungated and cannot become
      gated — middleware's own note says a gate here "would remove a feature rather than protect
      one" — and `role-requests` is open for a stronger reason still: asking for a role cannot
      require the role. So every administrative tab carries its page's exact list, and the
      replacement was **checked rather than asserted**: `/api/admin/users` calls `isAdmin` on GET and
      POST, `/api/admin/roles/custom` answers 403 to a non-admin, `/api/admin/invites` scopes by
      `resolveAdminOrg`. Two signed-in accounts on one URL confirmed it: an `employee` is offered two
      tabs of six, and `?tab=accounts` lands them on Directory rather than on a panel they may not
      have. One narrowing is recorded in the Messages portal's header — `/admin/email/*` had **no**
      middleware entry at all, so as a tab it is narrower at the door than it was, of a path the nav
      never offered.

      **The bug the suite could not see.** `RolesTab` arrived as an async **server** page — `auth()`,
      a redirect, a direct `supabaseAdmin` read — and the portal is a client component, so importing
      it put `@/lib/auth` and `node:async_hooks` into the browser bundle. 26,194 tests were green and
      `tsc` was clean; **the page simply did not load**, and only a browser said so. The read moved
      to `GET /api/admin/roles/custom`, which already answered 401 and 403 — the same two refusals
      the redirect made, made by the server instead. The redirect was the third of three gates and
      the weakest of them: a redirect is a suggestion to a browser and a 403 is an answer. Every
      other absorbed tab across C3–C9 was checked afterwards; this was the only one.

      **The C8 back-link class recurred, and one variant is new.** Contacts and Settings both linked
      "← Back to Messages" from inside Messages. `EmailTab` carried a third shape: a **back arrow on
      a forward link** (`← New Email` → the composer), now duplicated by the portal's own Compose
      button. The duplicate went rather than the arrow — two controls for one action is how one of
      them ends up stale.

      **A dead parameter the merge surfaced.** `app/api/admin/learn/credits/route.ts` notified with
      `/admin/employees?manage=<email>`, and **nothing has ever read `?manage=`** — the employees
      page reads no query parameter; it is `/admin/employees/manage` that reads `?email=`. That
      notification has been landing on a list rather than on the person it is about for as long as it
      has existed. The link audit could not resolve the route any more, and that is what made
      somebody look at the parameter. Repointed at the editor.

      The API mirror broke for the **seventh time in seven slices** (`/api/admin/role-requests`).
      The inline-hex ratchet fired for the sixth — **2306 before, 2306 after**, a pure rename. All
      eight redirect stubs verified signed-in, each landing on its own tab. `npm run build` clean.
- [x] **C10 — P6 Growth** (1 → 0 new links; leads into marketing). **DONE 2026-08-25.**

      `/admin/leads` is the `leads` tab of `/admin/marketing`, second in the strip so it reads in the
      funnel's order. `/admin/leads/[id]` stays a record, as §8 said. The portal is **Growth** in the
      nav now — it holds the lead queue, so "Advertising" described four of its five tabs; both words
      are in the keywords, so the old name still finds it.

      **§5's arithmetic came out backwards here, and the answer was to fix the door.** Every slice
      before this asked whether the portal opened wider than the pages it absorbed. Here the absorbed
      page had the wider door: middleware let `admin`, `developer` and `tech_support` into
      `/admin/leads`, and the nav offered it to all three, while `/admin/marketing` has always been
      `admin` alone. So the plan's move looked like a narrowing — and checking rather than assuming
      is what showed it was not: **all nine `/api/admin/leads/*` endpoints call `isAdmin`, which is
      `admin` alone.** A `developer` who followed that nav link got the page and a 403 from every
      fetch on it. The door has been wider than the boundary for as long as both have existed, and
      what the two extra roles were offered is an empty board. §5.1 says the boundary is the
      refusal; moving it is a product decision about who may see leads, so the door came to the
      boundary instead: `/admin/leads` is `['admin']` in middleware. Verified with two accounts —
      admin renders and gets 200, non-admin is sent to `/admin/me` and gets 403.

      **A packaging leak this slice was about to make for the sixth time.** Absorbing a page has
      meant dropping its registry row. `bundleForRoute` resolves an unknown path by its deepest
      REGISTERED prefix, so dropping the row takes the bundle gate off everything beneath it.
      Measured across all 182 admin routes, C6–C9 had already done this five times:

      | Record route | Was | Had become |
      |---|---|---|
      | `/admin/employees/[email]` | `office` | **no gate** |
      | `/admin/leads/[id]` | `office` | (about to be) |
      | `/admin/field-data/[id]` | `office` | **no gate** |
      | `/admin/projects/[id]` + `/edit` | `office` | **no gate** |
      | `/admin/payroll/[email]` | `office` | **no gate** |

      Five record pages a firm that had not paid for the bundle could open. This is the same leak
      `bundle-gate.ts` already documents from 2026-08-01 — where the research index was gated and
      every individual research project was not — arriving by a different road. The fix is that an
      absorbed parent with live children stays **registered** and goes `showInRail: false`, which
      hides it from the rail, the flyout and the workspace landing and is all the consolidation ever
      needed. C9's own `/admin/employees/manage` was already doing this; the rule was just never
      stated. All five restored and re-measured back to `office`.

      **The rule for every remaining slice: before dropping a row, look for a dynamic child.**

      The range picker is absent on Leads as well as on uploads — the board filters by STATUS and
      reads no date range, so a period control above it would have been the honestly-absent rule
      broken by the slice that quotes it. Browser-verified: five tabs, 11 real leads on the tab,
      picker present on three and absent on two. Inline hexes **2306 before, 2306 after**.
      `npm run build` clean.
- [x] **C11 — P12 Knowledge** + **P13 Research** (13 → 2). **Split; BOTH DONE 2026-08-25.**
      Thirteen routes across two portals was not one slice. C11a is Knowledge; C11b is Research.

      **C11a — P12 Knowledge (9 → 0 new links). DONE.** `/admin/learn` has ten tabs: the hub's card
      grid plus roadmap, modules, knowledge base, references, flashcards, card bank, practice, quiz
      history and search. Ordered the way studying goes rather than the way the files were written.
      Six rail links become none; nine routes forward.

      **What deliberately did not come, re-read rather than assumed.** `exam-prep` and its four
      children stay separate — an exam sitting is a timed session, and a tab strip above it is an
      invitation to leave mid-question with no way to say what that did to the clock. `learn/manage`
      and its two children stay separate: authoring is a different job from studying, done by a
      different role. `students` is not on §8's list and belongs with `manage` for the same reason —
      a teacher looking at other people, not a learner looking at themselves.

      **§5 cost nothing here, and that is worth writing down rather than skipping.** All nine
      absorbed rows were ungated, and middleware gates only `/admin/learn/manage` and
      `/admin/learn/students`, neither of which is here. The portal opens exactly as wide as what it
      holds. No role list moved.

      **C10's rule paid for itself on its first outing.** Three of the nine — `modules`,
      `knowledge-base`, `flashcards` — have record children: a lesson, an article, a deck. Their rows
      stay registered with `showInRail: false`, so `/admin/learn/modules/[id]/[lessonId]` and its
      siblings still resolve to the `academy` bundle. The other six have nothing beneath them and
      their rows are gone. Measured after, not assumed: all nine record paths still answer `academy`.

      **The back-link class, at its largest yet: nine self-links in eight of the ten bodies.** Every
      absorbed page carried "← Back to Learning Hub", and every one of them now points at the portal
      it renders inside. Practice carried a second on its results screen. A tenth control was a
      different shape and worth separating: References links to `/admin/learn/exam-prep/sit`, which
      is a real route and deliberately unabsorbed — what stopped being true there is the ARROW, since
      nobody arrives from exam prep any more. Same fix as C9's "← New Email". **Three slices running
      have found this; it is not a one-off but a property of absorbing a page that knew its parent.**

      **The migration receipt needed a decision, not an edit.**
      `__tests__/admin/sidebar-registry-parity.test.ts` failed twice and both readings were correct:
      three hrefs stopped being registered, and three were "quietly demoted to palette-only" — which
      is precisely what C10's rule requires them to be. Answered the way C4, C6 and C8 answered it:
      the drawer offers one row and all six are one click from it, which is where they were.

      Browser-verified: ten tabs render, nine redirects land on their own tab, the four unabsorbed
      routes are untouched, no page errors. Inline hexes **2306 before, 2306 after**. `npm run build`
      clean.

- [x] **C11b-0 — the research read boundary.** **DONE 2026-08-25.** Not in the plan; found while
      writing C11b and shipped ahead of it, because C11b's whole shape depended on the answer.

      C11b was going to make six research pages into tabs, each carrying its registry row's role
      list. §5.1 says a tab list is a courtesy and the API is the boundary, so the lists were worth
      measuring before writing. Against a running server, with a plain `employee` token holding no
      research role of any kind:

      | Endpoint | plain `employee` |
      |---|---|
      | `GET /api/admin/research/coverage` | **200** |
      | `GET /api/admin/research/library` | **200** |
      | `GET /api/admin/research/pipeline` | **200** |
      | `GET /api/admin/research/billing` | **200** |
      | `GET /api/admin/research/sites` | **200** |
      | `GET /api/admin/research/self-heal/proposals` | 403 |

      **Five of six answered anybody who was signed in.** They call `auth()` and stop there.

      The cause is structural rather than careless: `middleware.ts`'s `ROUTE_ROLES` has only ever run
      on PAGE paths. `/api/admin/*` goes through the bundle gate alone, and four of these routes are
      deliberately bundle-exempt because they are operator tools. So the six-role gate everyone can
      see on `/admin/research` was in front of the screen, never in front of the data.

      **Why fixing it is not a product decision, when C10 said the opposite.** C10 met the mirror
      image — a door wider than its boundary — and left the boundary alone, because who may see leads
      is the owner's call. The asymmetry: there the extra roles reached a page that refused them
      everything, so narrowing the door took nothing from anybody. Here the boundary is wider than
      the product's own intent, stated twice and in agreement — middleware gates the pages to six
      roles and the registry rows say the same or narrower, and a plain `employee` is in neither.
      Refusing them is the existing policy finally reaching the data.

      `lib/research/access.ts` therefore enforces the **widest** of the product's own statements —
      the page gate — rather than the narrower per-row lists, so nobody who can open a research page
      loses anything. Verified both ways against the running server: after the change all six refuse
      a plain employee, and a real `field_crew`-only account (no admin) still gets 200 from all five.

      `__tests__/research/api-access.test.ts` pins the role list to middleware's literal entry —
      that mirror has broken seven times in seven slices — and pins each route's guard.

      **And the probe was the bug, in a new way worth recording.** The test's comment-stripping
      helper reported the `sites` guard missing when it was plainly there: the guard's own comment
      contains an api path with a star in it, which the block-comment regex read as an opening
      `/*` and followed to a closing marker sixty lines below, deleting the code under test. Line
      comments have to be stripped FIRST. The same latent bug was in C9's helper and is fixed there
      too.

- [x] **C11b — P13 Research** (7 → 1). **DONE 2026-08-25.** With C11a, C11 is complete.

      `/admin/research` has seven tabs: the projects list plus coverage, library, data sources, site
      health, pipeline and billing. Six routes forward.

      **What stayed, and the one that had a rule of its own.** `/admin/research/[projectId]` (3,654
      lines) is a record. `/admin/cad` is its own shell. `/admin/research/testing` is a lab — and it
      also has its **own middleware entry, three roles instead of six, listed before
      `/admin/research` so it wins the prefix match.** Absorbing it would have widened it from three
      roles to six, which §5 forbids outright. §8 wanted it separate anyway; this is the second
      reason, and the stronger one.

      **§5's door did not move at all.** All six absorbed pages already sat behind the same
      middleware prefix — none had a narrower entry — so their narrower registry rows expressed nav
      visibility, never a gate. **C11b-0 is what makes carrying those rows onto tabs worth anything:**
      before it, five of the six endpoints behind these screens answered any signed-in account. A tab
      list is now a courtesy over a boundary that holds rather than a courtesy over nothing.

      **A packaging consequence worth knowing before a portal causes it by accident.**
      `bundleForRoute` reads a PATHNAME, so a tab cannot carry its own bundle — everything here
      resolves as `/admin/research`, which is `recon`. Pipeline and billing were deliberately
      bundle-EXEMPT in `ROUTE_BUNDLE_OVERRIDES` ("operator-only, no customer bundle gate") and are
      now inside a gated path. Safe for the audience they have — `middleware.ts` skips the bundle
      check entirely for `isOperator` — and a non-operator without Recon is also not offered the tab
      and is refused by the API since C11b-0. **Absorbing a bundle-exempt route into a bundled portal
      always costs this.** Recorded in the portal's header.

      **C10's rule, checked and found not to apply.** Not one of the six has a dynamic child, so none
      needed a kept row. The record in this tree is `/admin/research/[projectId]`, whose parent is the
      portal itself. Checking is the rule; the answer being "no" is a result, not a skip.

      **The C9 server-component trap, avoided rather than hit.** `coverage` was a genuine server
      component. Its own header says "pure rendering of compile-time data; no client state, no
      network", `clerk-registry.ts` imports nothing, and both panels it mounts were already
      `use client` — so it became a client component honestly, with no endpoint needed. Its
      `metadata` export went with the page file: a module that is not a route cannot set a title, and
      leaving it would be a line that looks load-bearing and is not. `sites` was a four-line server
      wrapper around `SitesClient`; the wrapper WAS the page, so the tab is the client component.

      **The back-link class again — five of seven bodies.** Fourth slice running.

      **And the ratchet had been lying, in a way only a file move could expose.** The scan reported
      2306 → **2317** and named `CoverageTab.tsx` as "0 → 11". Nothing had regressed:
      `scan-inline-style-hex.ts` had `'coverage'` in `SKIP_DIRS`, meant for the test-coverage OUTPUT
      directory — and `scanRepo` only ever walks `app` and `lib`, so **that entry could never have
      matched the thing it was for.** All it did was exclude `app/admin/research/coverage/`, a
      product directory, from the ratchet entirely. Measured: the file held 12 hexes before the move
      and holds 11 after, so the code got one BETTER while the number went up eleven. The baseline is
      2317 now because that is what the codebase has always had. The ratchet's blind spot has been
      bigger than its count before; this is the same shape, keyed on a directory NAME rather than a
      path.

      Browser-verified: seven tabs render, six redirects land on their own tab, `testing` untouched,
      no page errors and no self-links left. `npm run build` clean.
- [x] **C12 — P14 Company** + **P15 System** (8 → 2). **Split; BOTH DONE 2026-08-25 — but P14 is
      two of its five, not five. C12a is System, C12b is Company; the reasons are under each.**

      **C12a — P15 System (3 → 1). DONE.** `/admin/support` has three tabs: Support, Errors, Audit
      log. `/admin/support/new` keeps its route and is the New-ticket button, as §8 asks.
      `/admin/support/tickets/[id]` is a record and stays.

      **§5 goes the OTHER way here.** `/admin/error-log` has its own middleware entry — admin,
      developer, tech_support — and `/admin/support` has none at all, so the portal is a **wider**
      door than a page it absorbs. §5 allows that only when the boundary is elsewhere and holds, so
      it was measured, and the measurement is more interesting than a 403 would have been:

      | Endpoint | plain `employee` | what actually protects it |
      |---|---|---|
      | `GET /api/admin/errors` | 200 | filters rows to `user_email` unless an admin asks for the admin view |
      | `GET /api/admin/audit` | 200 | returns `{ rows: [] }` unless you are an admin OF THE ORG |

      **Both protect with a row filter, not a status code** — a legitimate pattern, and one that a
      probe reading only status codes reports as a hole. It is not one; C11b-0 was, and the
      difference is the handler body, not the response line. Non-admins have always been allowed to
      read their own error reports; what they could not do is reach the page that draws them. The tab
      list still carries both rows' three roles, because being offered an audit tab that can only
      ever be empty is its own small lie. Browser-verified: a plain employee is offered one tab and
      `?tab=audit` puts them back on Support.

      **The IA test earned its keep.** §2.6 says five surfaces answer "what happened and who did it"
      and each must say WHICH question it answers. Those sentences lived in the registry descriptions
      of the two rows this slice deleted, and the portal's first draft summarised them into "what has
      gone wrong in the app" — putting the product back to four logs and no map. Nothing else in the
      repo would have noticed. The sentences are now the tab hints, verbatim, which is where C7 put
      the Activity feed's and is better placed anyway: read above the log, not in a menu tooltip.

      **A syntax error survived 26,209 tests.** An apostrophe in `the Jobs portal's Activity feed`
      closed a single-quoted hint early. `tsc` would have caught it; the suite did not, because every
      assertion on these files reads them as TEXT. Only loading the page did. Swept all 180 admin
      page files afterwards for the same shape — every hint/label/description literal closes cleanly.
      **Run `tsc` after the last edit, not before it.**

- [x] **C12b — P14 Company** (3 → 1). **DONE 2026-08-25. Two of §8's five, deliberately.**

      `/admin/settings` absorbs `org-settings` (tab `org-profile`) and `orgs` (tab `orgs`) — the two
      that genuinely are the COMPANY's settings, both already admin-gated. Nine tabs now, and its own
      sections became URL-driven tabs beside them.

      **The other three are not here and must not be.** `announcements`, `notifications` and
      `me/privacy` are ungated and personal: the current user's alerts, the current user's privacy,
      and the release archive the Hub's WhatsNewBanner sends every employee to with "Read full
      notes →". `/admin/settings` is middleware-gated to `['admin']`, so absorbing any of them would
      DELETE it for everyone who is not an admin — the banner included. §8 grouped by what sounds
      like settings rather than by whose settings. They belong with `/admin/me`; recorded for C13,
      because moving a page between workspaces is a decision about the product, not a tidy-up.

      **The page has been rendering unstyled, and nothing would ever have said so.** Every class in
      `settings/page.tsx` — `.jobs-page`, `.job-detail__tabs`, `.job-detail__content`,
      `.job-form__grid`, `.job-form__submit` — is defined in `AdminJobs.css`, which
      `app/admin/jobs/layout.tsx` imports and which therefore loads on the JOBS tree. This page never
      imported it. Measured in a browser, before and after the one-line fix:

      | | before | after |
      |---|---|---|
      | `.job-detail__tabs` display | `block` | `flex` |
      | `.job-detail__tabs` border-bottom | `0px` | `2px` |
      | `.job-detail__tab` display / padding | `inline-block` / `0` | `flex` / `8px` |
      | `.job-detail__tab--active` background | none | brand navy |
      | `.job-form__grid` display | `block` | `grid` |

      A tab strip that was a column of bare words, a form that was one column, and a submit button
      that looked like a link — **on the page the owner asked to hold the page-visibility control.**
      This is the route-scoped-CSS trap in its other direction: not a fix written in the wrong sheet,
      but a page written against a sheet it does not load. The import restores what the markup always
      assumed. Unpicking the coupling — this page has no business wearing `.jobs-page` — is real work
      and belongs in C14, not in the slice that found it.

      **The tabs are URL state now.** They were `useState`, which is why the two redirects could not
      have worked: forwarding to `?tab=org-profile` would have landed on General. Nine tabs, both
      redirects and the restored chrome all browser-verified, no page errors.

- [x] **C12c — P17 Page Designer** (4 → 1, +2 kept). **DONE 2026-08-25.**

      `/admin/design` has four tabs: Pages, Compare, Dossiers, Site versions. Three routes forward.

      **§8's stated reason for this slice is not true, and it is recorded rather than repeated.**
      §8 says *"six sidebar links for one internal tool is exactly the complaint being answered."*
      Measured before building on it: **the rail showed ONE.** Five of the six rows were already
      `showInRail: false`. §8 also implies the boards are hard to move between; checked, and every
      one of them already carried a back-link to the hub.

      The slice is still worth doing on a smaller, true reason: the Studio was the only surface in
      this plan that made you go back to a hub between its boards, and four tabs is one click where
      there were two, in the shape a person has now learned on nine other pages. §8's other argument
      survives intact and is why the premise being wrong is not used as a way out: *"the fact that
      the tool is mine to maintain is not a reason to exempt it from the rule in §3."*

      **Two of the five keep their routes, structurally rather than by preference.**
      `design/serve` renders a design AT REAL SIZE with no chrome — that is the whole point of it,
      and a tab strip above a design pretending to be a page would make the thing it exists to show
      untrue (§8's own exam-sitting reasoning). `design/conformance` is a server component that reads
      `conformance.generated.json` with `node:fs` at request time; as a tab it would need either
      `node:fs` in the browser bundle — the exact trap C9 hit — or the numbers frozen into the build.
      It is offered as a toolbar link from every tab instead, which is more than it had.

      **A deep link I broke and caught.** Three of the four wrappers were `return <Board />` and the
      wrapper WAS the page. The fourth was not: `dossiers/page.tsx` read `searchParams.route` and
      passed it as `initialRoute`, because — its own header — *"the link that brings most people here
      is the one in the editor's checklist panel."* Rendering `<DossierBoard />` with no prop
      compiles, typechecks, passes 26,209 tests, and silently lands every one of those links on an
      unfiltered board. The tab reads the parameter client-side, the stub forwards it rather than
      dropping it, and both were browser-verified to SELECT the route rather than merely carry it.

      Fifth slice running with self-links: three boards linked back to the portal they now render
      inside. §5 cost nothing — all six rows and the middleware prefix are `['admin', 'developer']`.

- [ ] **C12c-files — P16 Files** (`/admin/files` absorbs `/admin/my-files`). **Same shape as P14's
      three, and blocked on the same decision.**

      | | workspace | roles |
      |---|---|---|
      | `/admin/my-files` | `hub` | **ungated** |
      | `/admin/files` | `office` | admin, developer, field_crew, drawer, researcher, equipment_manager, tech_support |

      §8 argues my-files is *"the same filesystem scoped to one person — a role view, not a page"*,
      and as a rendering question that is right. As a NAVIGATION question it is not: a plain
      `employee`, a `teacher` and a `student` are in none of those seven roles, so folding my-files
      into `/admin/files` takes their own files out of their nav entirely. Personal surface, company
      page — exactly what stopped `announcements`, `notifications` and `me/privacy` in C12b.

      Doing it properly means deciding whether the company file explorer is offered to everyone with
      per-node permissions doing the work — which is a product decision about the file explorer, not
      a consolidation step. Grouped with C13 alongside P14's three, so the four personal-vs-company
      cases are decided once and together rather than four times by whoever happens to hit them.

- [x] **C12d — P19 Learning Content** (3 → 1). **DONE 2026-08-25.**
- [ ] **C12d-exam — P18 Exam Prep.** **Two of §8's three are the exam itself** — see below.

      `/admin/learn/manage` holds twelve tabs now: the ten it already had, plus Media and Question
      Builder. Two routes forward.

      **§8 asked for a portal above this page, and that was the wrong shape.** The page has read
      `?tab=` for its own ten-tab bar since it was written. A portal would have put a second strip
      above the first AND a second claim on the same parameter — and `?tab=questions` already means
      "the question LIST", while `?tab=articles` and `?tab=lessons` are live links from the article
      editor and the lesson builder. One URL would have meant two things. So the two absorbed
      surfaces are two more entries in the bar that was already there: the result §8 wanted, one
      strip instead of two, and every existing link still meaning what it meant.

      **A link that would have silently done nothing.** The Question Builder's "← Back to Questions"
      pointed at `/admin/learn/manage?tab=questions`. That was a DIFFERENT route until this slice, so
      the page remounted and re-read `?tab=` in `useState(initialTab)`. Same route now: Next soft-
      navigates, nothing remounts, the initialiser never runs again, and the link would have changed
      the URL while the screen stayed on the builder. A working link with broken behaviour, and
      nothing in a test would see it. It is a callback the page owns now — browser-verified to move
      the strip from Question Builder to Questions. `MediaTab` uses `router.back()`, which walks real
      history and is correct either way; left alone deliberately rather than converted for symmetry.

      §5 cost nothing: all three rows carried `CONTENT_MGMT_ROLES` + `tech_support`, middleware gates
      the whole `/admin/learn/manage` prefix to the same four, and both absorbed rows were already
      `showInRail: false`. C10's rule checked — neither has a dynamic child, and the records
      (`lesson-builder/[id]` at 1,978 lines, `article-editor/[id]`) hang off the row that stays.

      **One ratchet re-based with its reason.** `admin-route-gates` guards "did my regex match
      nothing?" with a floor of 40 registered gated rows, and the registry reached **exactly 40** —
      C3–C12d have folded about fifty gated rows into tabs. Lowered to 15, with a note saying to
      check the pattern before assuming rows vanished. Twelve tabs and both redirects
      browser-verified; `npm run build` clean.

- [ ] **C12d-exam — P18 Exam Prep** (`/admin/learn/exam-prep` absorbs `sit` · `sit/mock-exam` ·
      `rpls`). **§8 contradicts itself here, and only one of the three is a way in.**

      §8's own prose says: *"The exam itself still opens as its own route — a sitting is not a thing
      to put a tab bar in. What is being merged is the four ways IN to it, not the exam."* Its table
      then lists two sittings among the three:

      | Route | What it actually is |
      |---|---|
      | `exam-prep/sit` | the FS study landing — **a way in**, and absorbable |
      | `exam-prep/sit/mock-exam` | a **timed sitting**, 439 lines with a clock |
      | `exam-prep/rpls` | a `QuizRunner` that **starts a 10-question test on load** — also a sitting |

      So what remains is `exam-prep` + `sit` — a two-tab portal, which is most of a slice's cost for
      almost none of its benefit, and `sit` is the landing people reach from the hub card anyway.
      Not deferred for cost: deferred because **the plan's own rule excludes two of the three**, and
      the third is not worth a portal by itself. Worth revisiting only if C13 gives exam prep more
      ways in than it has today.
- [x] **C13a — §4's addendum, first three.** **DONE 2026-08-25.** Weather and Compliance into the
      Jobs portal; `/admin/schedule` demoted out of the rail.

      **§6 predicted 29 nav links after the merges. Measured today: 50.** The gap is §4's addendum —
      the table of nine routes the first draft left alone and which "do not survive the rule in §3 on
      a second look". It was never in the C-numbered checklist, so it never got done. C13a starts it;
      the remaining six are listed below with what each still needs.

      **A read boundary closed before the merge that needed it.** `/admin/compliance` has its own
      middleware entry — admin, developer, tech_support — and `/admin/jobs` is gated to five roles,
      so as a tab it sits behind a **wider** door. §5 allows that only when the boundary is elsewhere
      and holds, so it was measured: **`GET /api/admin/compliance` answered any signed-in account** —
      the firm's whole register of licences, insurance and instrument calibration — while every write
      on the same route already called `isAdmin`. Only the read had nothing. Same structural cause as
      C11b-0: `ROUTE_ROLES` has only ever run on page paths, so the gate everyone can see sat in
      front of the screen and never in front of the data. Closed, pinned by
      `__tests__/admin/compliance-access.test.ts`, and verified from a browser: admin 200, plain
      employee 403.

      Weather went the other way and is recorded as such: it had **no** middleware entry at all, so as
      a tab it is narrower than it was — of a path the nav never offered to the roles losing it.

      **A nav link to a redirect.** `/admin/schedule/page.tsx` is fifteen lines that
      `redirect('/admin/calendar')`, and it had a rail row in `hub` labelled "My Schedule" while
      `/admin/calendar` had one in `work` labelled "Calendar" — one destination, two names, two
      workspaces, nothing telling anyone they land in the same place. `showInRail: false`; the route
      and its middleware entry stay, because the URL is live in old links.

      **The API mirror broke for the EIGHTH time in eight slices** (`/api/admin/compliance`). Noted
      in `api-bundle-gate.ts` as a missing mechanism rather than eight mistakes: the gate classifies
      by mirroring the page registry, so deleting a page row silently unclassifies its endpoints and
      only that one test notices.

- [x] **C13b — §4's addendum, contacts and discussions.** **DONE 2026-08-25.** Both into Messages.
- [x] **C13c — §4's addendum, reports; and the company-notes boundary.** **DONE 2026-08-25.**
- [x] **C13d — §4's addendum, assignments.** **DONE 2026-08-25.** Rail links **44 → 43**.

      `/admin/assignments` is the Hours portal's `assignments` tab, second in the strip beside My
      time — the same question asked two ways: what am I meant to be doing, and what did I do.

      **This is the merge the personal-vs-company line ALLOWS, and the contrast is the useful part.**
      Four pages in this plan have been stopped at that line — `announcements`, `notifications`,
      `me/privacy`, `my-files` — because folding a personal surface into a company page gated more
      narrowly deletes it for the people it is for. Assignments is the opposite case: the API scopes
      a non-admin to `.eq('assigned_to', session.user.email)`, so you see your own work and nobody
      else's, and the Hours portal is already the `hub` workspace's personal surface. Personal into
      personal. Browser-verified with a real `field_crew` account holding no admin: it sees My time,
      **Assignments**, Time off, and `?tab=assignments` lands on it.

      ── **C10's KEEP-THE-ROW RULE IS WIDER THAN IT WAS WRITTEN** ──

      C10 said: keep the row when a **dynamic child** hangs off the route, or the child loses its
      bundle gate. `/admin/assignments` has no child — the directory held one file — so the row was
      dropped. **Four separate guards objected at once, and not one of them was about a child:**

      | Guard | Why it needed the row |
      |---|---|
      | `notify-links-audit` | assignment notifications link at this URL |
      | `api-bundle-gate` | `/api/admin/assignments` is classified by MIRRORING the row |
      | `sidebar-registry-parity` | the hand-written drawer showed it |
      | `employee-can-reach-their-own-things` | it is on the self-service list |

      So the rule is not *"a row survives its children"*. It is: **a row survives anything that still
      names the route** — a child, a notification, an API mirror, a frozen receipt. `showInRail:
      false` removes the nav entry, which was always the only part a consolidation needs. Dropping
      the row was doing more than the merge asked for, and the four guards are the reason it took
      minutes rather than months to find out.

      **This supersedes C10's wording for every remaining slice, C14 included.**

- [x] **C13e — §4's addendum, `team`.** **DONE 2026-08-25.** Rail links **43 → 42**.

      `/admin/team` is the Hours portal's `team` tab, after Approvals — the same session: who is on
      the clock right now, and whose timesheet is waiting on you. `/admin/team/[email]` is one
      person's day and keeps its own route.

      **The door came to the boundary, which is C10's move and takes nothing from anybody.** The row
      and the middleware entry both said admin, developer, tech_support. The API has never agreed:
      `GET /api/admin/team` admits `isAdmin` **or** `tech_support` and answers 401 to everyone else,
      and `/api/admin/team/[email]/today` does the same. So a `developer` has always been offered a
      page that refused them every fetch. Fourth time this plan has met a door wider than its
      boundary; same answer each time — move the door, not the boundary, because who may see the crew
      list is a product decision. Tab and middleware are both `['admin', 'tech_support']` now.
      Browser-verified: a `field_crew` account is not offered the tab, and `GET /api/admin/team`
      answers it 401.

      **A fourth open endpoint that turned out not to be one.** `/api/admin/team/status` answers any
      signed-in account, which matches the shape of the three real holes this plan has closed. It is
      not one: three Hub widgets — `daily-briefing`, `field-pulse`, `team-status` — render it on
      `/admin/me`, which everybody has. **Not every 401-only route is a hole**, and the check that
      tells them apart is who calls it, not what it returns.

- [ ] **C13f — `/admin/notes` → Company.** §4's last addendum row, and the only one left. It is a
      decision because the merge would **remove something that works**, unlike every other narrowing
      in this plan:

      `/admin/settings` is middleware-gated to `['admin']`. `/admin/notes` is gated to admin,
      developer and tech_support — and since C13c its API enforces exactly those three, so all three
      have a working page today. Folding notes into Settings takes company notes from two roles that
      can use them. That is not a door coming to a boundary; it is a boundary moving.

      **Options, for the owner:** (a) leave `/admin/notes` as its own route — one rail link, and the
      only cost is that §4's table stays one row short of done; (b) absorb it and accept that only
      admins keep company notes; (c) absorb it and widen `/admin/settings` to the three, which means
      deciding whether a `developer` should see the company's settings page at all.
- [x] **C13 — the workspace decision itself.** **ANSWERED 2026-08-25 — see §12 at the end of this
      document.** §10 said *"Workspaces — DELEGATED to me. My answer is in §12"* and §12 was never
      written; it is written now.

      **The answer: keep the seven and change nothing structurally; revisit below 30 rail links.** 42 rail
      links across 7 workspaces is six per group, which is a navigable list, and §6's threshold of
      ~29 is not met — what remains to absorb will not get it there.

      §12 first proposed two fixes and then WITHDREW both: `knowledge` does have a landing
      (`/admin/learn`; my probe looked for a route named after the workspace instead of reading
      `WORKSPACES[ws].href`), and `equipment` holding one rail link is C3 succeeding rather than a
      defect. Both the claim and the correction are in §12, in that order. The trigger to revisit is
      stated so it can be checked rather than felt: **rail links below 30.**

      Measured after C3–C13e: **42 rail links across 7 workspaces**, ALL SEVEN of which have a
      registered landing page. §6 said the 7-way split stops earning its keep at ~29 links and that
      the call should be made after a few portals ship. It is not 29 yet, and C13b is what closes
      most of the remaining gap — so the honest state is **not ready to decide**, rather than decided.

      Two things are already clear and worth writing down now:

      · **`knowledge` has no landing page** while the other six do, so the workspace concept is
        already applied inconsistently.
      · **Four pages are stuck on the personal-vs-company axis**, and they are the same question four
        times: `announcements`, `notifications`, `me/privacy` (from C12b) and `my-files` (from C12c).
        Each is ungated and personal; each has a company-shaped page it "belongs" to that is gated
        more narrowly; and folding any of them in removes it from the nav of everyone outside those
        roles. **They should be decided once, together, as one question: does the Hub own the
        personal view of a thing, or does the company page render a personal view of it for whoever
        opens it?** §5.2's role-driven rendering is the second answer; the first is what the `hub`
        workspace already is. That is the decision §12 owes.
- [ ] **C14 — Re-derive the dossiers and re-trace the defaults.** **IN PROGRESS 2026-08-25 — the
      defaults pass is running; the dossiers pass and one decision remain.**

      Every merge in this plan invalidated a dossier and a locked default. Measured against the live
      database before starting, so the size of the job is on the record rather than estimated:

      | | count |
      |---|---|
      | Registered admin rows | **75** |
      | Routes with a locked default | 138 — **67 orphaned**, 4 missing |
      | Routes with a dossier | 133 — **63 orphaned**, 5 missing |

      **`--since` is the right selector here, not `--stale`.** `staleRoutes` compares each page's last
      COMMIT time against its record's timestamp, so after a day of committing it matches nearly the
      whole tree — the first attempt ran fourteen minutes without finishing. `routesChangedSince` is
      the flag written for "what did this work touch": **115 routes changed since the branch point,
      98 of them traceable**, and roughly eighty of those are redirect stubs the tracer skips in a
      second each. The real work is the sixteen portals.

      **Re-traced so far** (each writes as it goes, so this is durable progress rather than a
      pending batch): `/admin/design` (597 elements at both viewports), `/admin/jobs`,
      `/admin/finances`, `/admin/learn`, `/admin/learn/manage`, `/admin/equipment`,
      `/admin/equipment/templates/new`, `/admin/files`, `/admin/invoicing`, `/admin/marketing`,
      `/admin/billing`, `/admin/jobs/import`, `/admin/employees/manage`. The tracer reports what
      moved: `/admin/jobs/import` shifted 2 elements, worst `.admin-page-header__trail` by 43px.

      ── **FOUR PAGES THAT WILL NOT COMPLETE A WALK, WHICH IS A FINDING RATHER THAN NOISE** ──

      | Route | What the tracer says |
      |---|---|
      | `/admin/discussions` | never finished loading |
      | `/admin/equipment/consumables` | never finished loading |
      | `/admin/equipment/timeline` | never finished loading |
      | `/admin/learn/flashcard-bank` | crashed the browser context |

      "Never finished loading" is expected on a redirect and unremarkable there — but these are live
      pages. A page that never settles is a page with a request that never resolves or a spinner that
      never clears, and the tracer is the only thing in the repo that would ever notice. Worth its
      own slice; flashcard-bank is the 130k-character page that also timed out a browser walk during
      C11a, so that one at least is a size problem rather than a hang.

      ── **CORRECTION: THE FOUR PAGES ARE NOT LIVE PAGES, AND THE REAL BUG IS IN THE TRACER** ──

      The note above this one recorded four routes that "will not complete a walk" and called it a
      finding about the pages. **That was wrong, and checking it is what found the actual bug.** All
      four are redirect stubs this plan created:

      | Route | Really is |
      |---|---|
      | `/admin/discussions` | → `/admin/messages?tab=discussions` |
      | `/admin/equipment/consumables` | → `/admin/equipment?tab=supplies` |
      | `/admin/equipment/timeline` | → `/admin/equipment?tab=schedule` |
      | `/admin/learn/flashcard-bank` | → `/admin/learn?tab=flashcard-bank` |

      The tracer asked `stillLoading` **before** it asked "did this route forward?", and a stub whose
      DESTINATION is slow trips the first question — the portal it lands on has not gone quiet inside
      the budget. So it reported a hang for a page that does not exist.

      **The cost was not a wrong log line.** The forward branch is where S2 lives: the block that
      RETIRES the locked default a forwarding route no longer has. It was unreachable for exactly the
      routes this plan created, so every one of those stubs kept a design claiming to be a 1:1 record
      of a page that now serves a redirect — the precise rot S2 was written to prevent, reintroduced
      by the order of two ifs.

      Where the browser ended up is known the moment navigation resolves; it never needed the page to
      settle. The forward is answered first now, and `stillLoading` only speaks for routes that are
      really trying to be a page. Verified on all four: each reports `redirects to …` and retires its
      live default. Seven designs archived.

      **And the correctness fix did nothing about the cost, which is why the first pass never
      finished.** The forward check moved above `stillLoading`, but it still sat below the viewport
      loop — so every stub paid two page loads, two 25-second readiness waits and two 15-second
      network-idle waits before anything looked at the URL. After the consolidation **roughly eighty
      of the ninety-eight routes in a `--since` pass are stubs**, which is most of an hour spent
      measuring redirects.

      The destination is known as soon as navigation resolves, so it is read on the FIRST navigation
      and the rest of the walk is skipped. Measured: **20 routes — 16 stubs and 4 real traces — in
      under 400 seconds**, against 8 routes in several minutes before. That is what makes the full
      pass a thing that can be run rather than a thing that gets killed.

      **The same bug was in the sibling script, and fixing one is how it was found.**
      `derive-dossiers.mjs` computed `problem = 'still loading after 25s'` **before** it asked whether
      the route forwarded, and gated the forward check on `!problem`. So a stub whose destination is
      slow was never recognised as a forward at all — it went into the "not derived" queue as a
      failure with nothing to do about it, **which is the exact failure the comment sitting above
      that check records being fixed once already.** Same order, same door, second script. Fixed the
      same way and verified on `/admin/discussions`: "redirects to /admin/messages — not a page of
      its own", counted as *not a page* rather than as a failure.

      A 4xx is still checked below rather than above, deliberately: that is a real answer from a real
      request, and a stub forwarding to a page that answers 500 should say so.

      **And a third probe that was the bug.** The retire left three rows per route still marked
      `default`, which looked like duplicate defaults — 163 route/state combinations holding 578 rows
      between them. `design_mockups` has a unique index for exactly this,
      `idx_design_mockups_one_default_per_state`, whose predicate includes `deleted_at IS NULL`; my
      query did not. Re-measured with the index's own predicate: **zero live duplicates.** The extra
      rows are soft-deleted history and the retire archived the one live default, correctly. Apply
      the predicate the constraint applies before calling its absence a defect.

      ── **THE 67 ORPHANS ARE A DECISION, NOT A CLEANUP** ──

      67 locked defaults and 63 dossiers describe routes that no longer have a registry row. It is
      tempting to delete them and it should not be done without asking, for two reasons: **every one
      of those URLs still resolves** — they forward to a tab — and those records are the only
      remaining picture of what each page looked like before it was absorbed. Deleting them makes the
      numbers tidy and throws away the before-half of every comparison this plan could ever be judged
      by. Options for the owner: (a) leave them, and let the page list show them as orphans;
      (b) re-point each at the tab that absorbed it, so the design follows the content; (c) delete.

      ── **TWO METHOD MISTAKES, BOTH MINE, BOTH WORTH RECORDING** ──

      · **`grep` buffers when its output is not a terminal.** Two background runs reported zero bytes
        for many minutes and looked hung. They were not — the pipeline was holding the lines. The
        fix is `--line-buffered`, and the lesson is that a silent pipe is not evidence of a silent
        process. Progress here is measured from the DATABASE instead, which is the honest check
        anyway: the rows are the deliverable, stdout is commentary.
      · **I killed the dev server believing it was the runaway trace**, on nothing better than its
        3.8 GB working set. The next run died on ECONNREFUSED. Identify a process by its command
        line, not by which one looks expensive.

      **Remaining:** finish the defaults pass; run `derive-dossiers.mjs --since` for the same set;
      refresh the conformance record; chase the four pages that will not settle; and put the orphan
      question to the owner.
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

## §10. The owner's answers — 2026-08-24

Asked in the first draft, answered the same day. Recorded here rather than in a chat log, because
these are the decisions the rest of the plan rests on.

**1. Per-item receipt approval — ANSWERED, and it is bigger than approve/deny.**

> *"It can be that some items on the receipt are accepted and some are rejected. There would need to
> be a way to fully flesh out the costs of a given receipt and determine what all should be tax
> exempt and what should not."*

So a receipt is not a decision, it is a **list of decisions**, and each line carries two independent
ones:

| Per line | Values | Who decides |
|---|---|---|
| accepted? | accepted · rejected | the approver |
| taxable? | taxable · exempt | the approver, and it is an accounting fact |

Three consequences the first draft did not anticipate:

- **The receipt total stops being the receipt total.** Once a line can be rejected there are three
  numbers — what was spent, what was approved, and what is deductible — and every screen that shows
  "the receipt amount" has to say WHICH. That is the same defect shape as `effectiveHours`, where
  four files summed raw hours while a fifth summed the approver's adjustment and the two disagreed
  across the very decision that created them. **One function, `approvedTotal(receipt)`, exported,
  used everywhere** — decided now, before the first screen reads `receipt.amount_cents` again.
- **Tax-exempt is not a UI flag, it is a Schedule-C input.** `/admin/finances` already builds a
  Schedule-C-shaped report from approved receipts. Per-line exemption changes what that report is
  allowed to count, so P2.2 and P7 are the same slice's data model seen from two ends.
**CHECKED, 2026-08-24 — and most of this is already built.** The first draft said to find out
before designing the screen. Found out:

| Piece | State |
|---|---|
| `receipt_line_items` table | **exists**, 93 rows, AI-extracted, position-ordered |
| per-line accept/reject | **built** — `is_business_expense`, nullable by design: TRUE claim it, FALSE do not, NULL undecided |
| the editing UI | **built** — `app/admin/receipts/ReceiptLineItems.tsx` |
| the API | **built** — `PATCH /api/admin/receipts/[id]/line-items` |
| an audit trail | **built** — `added_by`, `removed_by`, `edited_by`, and their reasons |
| per-line TAX treatment | **missing.** `tax_deductible_flag` exists on the RECEIPT, not the line |
| anybody having used it | **no.** All 93 rows are `NULL` |

So P2.2 is not "build per-item approval". It is three much smaller things:

1. **Put the existing editor where the deciding happens.** `ReceiptLineItems` is mounted in
   `ReceiptSlideshow` only — the review carousel — and not on `/admin/receipts`, which is the
   approval queue. It is one click away rather than absent, but the queue is where somebody sits
   down to approve twenty receipts, and that is where the per-line decision belongs.
2. **Add the second axis.** Accepted and deductible are not the same question: a client meal can be
   approved and only half deductible; a parking fine can be approved and not deductible at all.
   `is_business_expense` answers the first. The second needs its own per-line column.
3. **Decide what the receipt total means** once lines disagree — below.

That every one of those 93 rows is still `NULL` is the finding underneath the finding: this is the
repository's most common defect, a feature authored and never wired to the place it was for.

**2. Roles — ANSWERED, with one gap.**

> *"users could be employees, students, teachers, admin, marketing team, etc."*

`ALL_ROLES` already carries `admin`, `developer`, `teacher`, `student`, `researcher`, `drawer`,
`field_crew`, `employee`, `guest`, `tech_support`, `equipment_manager` and a money-handling role.
Everything named is there **except `marketing`** — advertising is gated to `admin` today. Adding a
role is a small change; noting that it is missing before designing a Growth portal around it is the
point.

**3. Rewards — ANSWERED. Part of pay.** It stays as a tab of P1, which is where the first draft put
it. No change; the question is closed.

**4. Workspaces — DELEGATED to me.** My answer is in §12, with the reasoning, as a later slice.

**5. Deleting rather than absorbing — still open, and now measurable.** C0 shipped; two weeks of
`nav.route.view` will produce the candidate list. Nothing gets deleted before that.

**6. NEW — page and feature toggles.** A requirement, not an answer. §11.

**7. NEW — role-driven rendering.**

> *"I want it so that pages load elements dynamically based on the role of the user."*

This is §5 stated more strongly, and it extends past the tab bar to what is INSIDE a tab. The rule
in §5.1 does not change and gets more important the finer the granularity: **hiding an element is a
courtesy, refusing the request is the boundary.** A portal that renders fewer widgets for a field
crew member and an API that would happily answer all of them is not a permission model.

---

## §11. Toggling pages and features on and off

> *"I want it so that we can have full control in the settings as to what all pages are visible and
> what pages are not… Maybe we don't want to use a page or feature right now, so we would toggle it
> off so that navigating the webpage is easier, but if we decide to use that page/feature in the
> future, then we can turn it back on and make sure it is hooked up correctly."*

### 11.1 This is a FOURTH question, and that is why it deserves its own switch

Three gates already decide whether somebody sees a route, and the toggle must not become a fourth
copy of any of them. They answer genuinely different questions:

| Gate | Where | The question |
|---|---|---|
| `roles` | `route-registry.ts` + `middleware.ts` | **may you?** |
| `requiredBundle` | `lib/saas/bundle-gate.ts` | **did the firm pay for it?** |
| `internalOnly` / `showInRail` | registry flags | **is this for staff, and does it belong in the rail?** |
| **`enabled`** | NEW | **does this firm use it at all?** |

A page can be one you may see, that you paid for, that is meant for staff — and that this firm has
simply decided not to run yet. None of the existing three can express that, which is why the answer
is a new switch rather than a new role or a new bundle.

### 11.2 Where it lives: no new table

`app_settings` is already an org-scoped key/value store (`key`, `value` JSONB, `org_id`) with a
route at `/api/admin/settings`. One row:

```
key:   'feature_toggles'
value: { "/admin/payouts/search": false, "/admin/pay#rewards": false, … }
```

**Absent means ON.** Not "absent means off" and not an exhaustive list written at install time: a
toggle system that ships with anything off is one that broke something on day one, and a new page
added next year must appear without anybody remembering to enable it.

### 11.3 The unit is a nav destination OR a portal tab

This is where §11 and §4 turn out to be the same shape. After consolidation most of what the owner
would want to switch off is not a route any more — it is a tab. "We do not do pass-through billing"
should turn off the `rebilled` tab of the receipts portal, not a URL that no longer exists.

So a toggle key is either a route (`/admin/vehicles`) or a route-plus-tab (`/admin/pay#rewards`),
and the portal shell reads it in the same breath as the role check.

**Consequence worth stating: the toggle system should be built INTO the portal shell (C2), not
bolted on after.** Building it against 138 routes and then rebuilding it against 29 portals is the
work done twice.

### 11.4 What a switched-off page actually does

The owner's own sentence settles the hardest question here: *"turn it back on and make sure it is
hooked up correctly."* An admin has to be able to REACH a disabled page to check it. So:

| Surface | Behaviour when off |
|---|---|
| Sidebar, rail, palette, search | gone. This is the whole point. |
| A link from another page | rendered, but marked — a dead link is worse than a visible one |
| Direct URL, ordinary user | a plain "this feature is turned off" page. **Not a 404** — a 404 says the thing does not exist, and it does |
| Direct URL, admin | **the page, working**, behind a banner saying it is off for everyone else, with a Turn on button |
| The APIs behind it | **unchanged.** See 11.5 |

### 11.5 The thing this must never become

**A toggle is not a permission.** It is a visibility control, and the moment somebody believes
otherwise it becomes a security hole with a friendly name: *"we turned payroll off, so the crew
cannot see wages"* is false the second anyone types the URL, and it is exactly the kind of false
belief that goes unexamined for a year.

So the APIs keep every check they have, the middleware role gate is untouched, and the toggle is
read in the UI layer and in a redirect — never as the reason a request is refused. **A test should
assert that turning a page off changes no API's answer.**

### 11.6 Turning something off should say what it breaks

Pages link to each other. Switching off `/admin/vehicles` leaves the mileage screen pointing at a
page nobody can open, and the person flipping the switch has no way to know that.

The registry plus a link scan can answer it, so the settings screen should: **"3 other pages link
here — Mileage, Equipment, Field Team."** Not a refusal, a sentence. The owner is allowed to break
a link on purpose; they are not well served by doing it invisibly.

### 11.7 Slices

- [x] **T1 — The switch, read-only.** Shipped 2026-08-25. `lib/admin/feature-toggles.ts`: `isEnabled`,
      `isDestinationEnabled`, `togglesFrom`, `toggleKey`/`parseToggleKey`, `withToggle`,
      `disabledKeys`. Stored in `app_settings` under `feature_toggles`, and **absent means ON**.

      Three decisions the tests pin, each about a failure mode rather than taste:

      · **A broken row is the harmless state.** Nothing, a string, an array, a number — every one of
        them reads as "everything is on". A parse that threw here would take out the sidebar of every
        page that reads it, and the whole point of "absent means on" is that the broken state does no
        damage.
      · **A non-boolean is dropped, never coerced.** `"false"` the string is TRUTHY in JavaScript and
        would silently mean ON — the reverse of what whoever wrote it intended. A toggle doing the
        opposite of the stored data is worse than one ignoring it.
      · **Turning something back ON deletes its key** rather than storing `true`. A map that
        accumulated `true` for everything ever toggled would slowly become the exhaustive inventory
        this design exists to avoid, including entries for routes that stopped existing.

      **The whitelist caught itself.** `/api/admin/settings` writes through `ALLOWED_KEYS`, and its
      own header says why: *"a new section written to the table by a seed but not named here reads
      back fine and silently 400s on save. That is the 'authored but not wired' failure this codebase
      hits most often."* A reader with no writer is exactly that, on the very list that warns about
      it. `feature_toggles` is on the whitelist, by importing `TOGGLES_KEY` rather than retyping the
      string — two spellings of one key is how a writer and a reader end up pointed at different rows,
      and the symptom would be a switch that saves successfully and changes nothing.

- [x] **T2 — The nav respects it.** Shipped 2026-08-25, and **in one place**, because
      `AdminSidebar`'s own header already states the rule: *"gating happens once, in
      `accessibleRoutes`, off the registry."*

      `accessibleRoutes` takes an optional `toggles` map and drops what is off. Four surfaces read
      it — the sidebar (which is also the mobile drawer, and the only nav a phone has), the icon
      rail, the command palette and the workspace flyout — and filtering in each separately is four
      places for a switched-off page to stay visible in one of them.

      The check sits **above the role logic**, beside `parked`, so `isAdmin` cannot short-circuit
      past it. Hiding it from admins too is the request itself: *"so that navigating the webpage is
      easier"*. An admin reaches a disabled page by URL (§11.4), where they get the working page
      behind a banner — the nav does not keep offering it.

      One fetch per page load, not four. React renders these concurrently, so an effect in each
      would fire four identical requests on every navigation; `useFeatureToggles` shares a
      module-level promise. It starts **everything ON** while the read is in flight rather than
      showing a loading state — a nav that waited would flicker its whole list into existence on
      every page load, and the unfiltered list is a superset, never a lie about what exists.

      Browser-verified on `/admin/equipment`: **10 cards → 9** with `/admin/equipment/timeline`
      switched off, and **back to 10** when switched on.

      *(The first probe of this reported "no change" three times and was wrong — it had picked
      `/admin/vehicles`, which is not in that workspace at all, so nothing could have changed. Ninth
      time this session a throwaway script's own bad input looked like a defect in the thing it was
      testing.)*
- [x] **T3 — The settings screen.** Shipped 2026-08-25 as a **Pages** tab on `/admin/settings` —
      where the owner asked for it — plus `GET /api/admin/feature-toggles` for the half a browser
      cannot compute.

      Browser-verified: **134 destinations in 7 workspace groups**, grouped and labelled exactly as
      the sidebar groups them. That is not cosmetic: the person using this screen is looking at their
      own sidebar deciding what to remove from it, and any other ordering makes them translate
      between two views of the same thing while flipping switches they cannot immediately verify.

      **Every switch saves on its own.** No Save button: forty switches behind one button is a page
      where a misclick loses all of it, and where *"did that take?"* is unanswerable until you
      navigate away and come back. The cost is paid honestly — a failed write puts the switch BACK,
      because a control that stays flipped after a failed save leaves the screen disagreeing with the
      product about which pages exist.

      §11.5's sentence is **on the screen**, not only in a code comment nobody using the product will
      read: *"This hides pages; it does not lock them. Permissions are set by role, not here."*

      §11.6's warning names the pages rather than counting them, and appears only once a page is OFF
      — a link count on all 134 rows is noise, and it is only a consequence after the switch.

      **The link count was wrong on its first run, and reading the output is what caught it.**
      `AdminSidebar` and `AdminLayoutClient` link to every route in the registry *by construction*,
      so counting them made every destination look like it had two or three more dependants than it
      has: `/admin/me` reported **19**, most of them the navigation itself listing it. That is worse
      than a wrong number — the sentence exists to say what you are about to break, and an inflated
      warning is one people learn to skip. Only links from a file that BELONGS to a page count now,
      and `/admin/me` reads **11**, every one a real page.

      Two smaller rules the tests pin:

      · **Every route, not only the ones this admin can open.** `accessibleRoutes` would be the
        obvious call and would be wrong — this screen decides what the FIRM uses, not what the person
        looking at it may open, and a switch you cannot find is indistinguishable from one that does
        not exist.
      · **Matched on a QUOTED href.** `"/admin/jobs"` must not be found inside `"/admin/jobs/new"`,
        or every parent route absorbs its children's inbound links — wrong in the direction that
        matters.

      The scan runs per request rather than from a generated file. Every other derived inventory here
      is generated, and every one of them has at some point been stale and believed; a link count is
      advisory, so being a request slower is free and being WRONG is the failure that matters.
- [x] **T4 — The off page**, and the admin bypass with its banner (11.4). Shipped 2026-08-25 as
      `PageOffGate`, wrapped around `children` inside the admin shell's error boundary.

      Browser-verified, one route, four states:

      | | what they see |
      |---|---|
      | ON / admin | the page |
      | OFF / admin | **the page, working**, behind a banner saying it is off for everyone else |
      | OFF / employee | *"Weather is turned off"* — no page data |
      | OFF / employee, nav | gone from their workspace list |

      Not a 404, deliberately. A 404 says the thing does not exist; it does, and somebody switched it
      off. The person who followed a link here needs to know which of the two it is, because one is a
      bug worth reporting and the other is a decision their company made. For the same reason there
      is no *"request access"* — offering a permission remedy would teach the wrong thing about what
      happened.

      It resolves the ROUTE, not the pathname, so switching off Jobs covers `/admin/jobs/abc123` too.
      Matching the raw URL would leave every detail page reachable while its parent was off — the
      sort of gap somebody finds by accident and then stops trusting the switch.

      ── **AND IT DID NOT WORK FOR ANYONE BUT ME** ────────────────────────────────────────────────

      The first browser pass showed the admin banner correctly and showed an **employee the full
      page**. The cause was one line: the toggle map was read from `/api/admin/settings`, which is
      `isAdmin`-only — as it should be, it carries the company's details and its billing. So a
      non-admin's browser got a **403**, `togglesFrom` correctly answered *"everything is on"*, and
      **both halves of this feature silently did nothing for non-admins**: the nav kept every
      switched-off page, and the off-page notice could never appear for the people it exists for.

      It worked perfectly for the one account I had been testing with, which is exactly why it took a
      second signed-in browser to find. Nothing errored, nothing logged, and every source-level test
      still passed — the fetch failing was indistinguishable from a firm that had switched nothing
      off. The values now come from `/api/admin/feature-toggles`, readable by any signed-in user
      (which pages a firm uses is not a secret — it is visible in the menus of everybody who has
      them); the link scan stays admin-only, because it is the settings screen's working data.

- [x] **T5 — The test that keeps 11.5 true**. Shipped 2026-08-25, and stronger than the slice asked
      for.

      §11.5 asks that turning a page off change no API's answer, for every role. Testing one endpoint
      would prove one endpoint. The guarantee is instead structural: **no route handler in the
      product may consult the toggle map at all**, except the one whose job is to serve it. An API
      that never reads it cannot be changed by it, for anybody.

      The test walks every `route.ts` under `app/api` (200+), collects the ones importing
      `feature-toggles`, and asserts the list is exactly two — the endpoint that serves the values,
      and the settings endpoint that imports `TOGGLES_KEY` so the writer and the reader cannot end up
      pointed at two different rows. Neither derives a 401 or 403 from `isEnabled`, and the
      middleware does not mention toggles at all: a read there would apply to every request in the
      product at once, which is the largest possible version of this mistake.

      The walk asserts it found **more than 100 route files** before checking anything. A scan that
      quietly matched nothing would pass this test forever while proving nothing — the exact shape of
      four separate bugs already recorded in this session.
- [ ] **T6 — Tab-level toggles** — **DEFERRED to C2, deliberately, by §11.3's own argument.**

      *"Building it against 138 routes and then rebuilding it against 29 portals is the work done
      twice."* The portal shell does not exist yet, so there are no tabs to switch off: every
      destination in the product is still a route, and T1–T5 cover all of them.

      **The groundwork is done and is not speculative.** `toggleKey('/admin/pay', 'rewards')` and
      `isDestinationEnabled` already exist and are tested, including the case that matters — a tab of
      a switched-off portal reads as off, because asking only about the tab's own key would leave
      every tab of a disabled portal reporting as enabled: true in the stored data and useless as an
      answer, since nobody can reach any of them.

      So C2 has to call one function, not design a mechanism. That is the difference between parking
      work and parking a decision, and this doc has a §11.3 saying which one this is.

## §12. The workspaces — the answer §10 delegated

§10 said *"Workspaces — DELEGATED to me. My answer is in §12, with the reasoning, as a later slice."*
§12 was never written. This is it, written on 2026-08-25 with the consolidation far enough along to
answer with measurements instead of a guess.

### What §6 said to wait for

> With 29 destinations, **the 7-workspace split may stop earning its keep.** Workspaces exist to make
> 138 links navigable; 29 links fit in one grouped list. […] it should be made AFTER a few portals
> ship, not designed up front on a guess.

### What is actually there now

**42 rail links across 7 workspaces**, down from 138.

| Workspace | Rail links | Landing page | Sections |
|---|---|---|---|
| `hub` | 8 | yes | none |
| `work` | 6 | yes | none |
| `equipment` | **1** | yes | none |
| `research-cad` | 4 | yes | none |
| `knowledge` | 6 | **no** | none |
| `money` | 7 | yes | 4 |
| `office` | 10 | yes | 4 |

### The answer: keep the seven, and fix the two that make the idea look arbitrary

**42 links across 7 groups is six per group.** That is a navigable list, and §6's threshold of ~29 is
not met — C13f and whatever the owner decides about the four personal-vs-company pages will move it a
little, not to 29. Deleting the workspace concept now would be re-arranging navigation for the second
time in one week on a number that has not arrived.

**But two of the seven are anomalies, and they are why the split reads as arbitrary rather than as a
map:**

1. **`equipment` holds exactly one rail link — its own portal.** Three more routes are registered and
   hidden. A workspace whose entire visible content is its own landing page is not a room; it is a
   door with a sign saying "door". Either `/admin/equipment` moves into `work` — it *is* work, and
   `work` would go to 7, still the smallest group but a real one — or the concept is admitting that a
   workspace can have one thing in it, which makes the other six harder to defend.

2. **`knowledge` has no landing page while the other six do.** `/admin/learn` is its landing in
   everything but registration: it is the first link, it is the portal, and C11a gave it ten tabs.
   The inconsistency is bookkeeping, not design.

**Neither is a big change, and neither should be made in the same slice as a merge** — §6's own
warning, which held all the way through C3–C13e and should hold for one more step.

### CORRECTION, 2026-08-25 — one of the two "anomalies" was my measurement, not the registry

The table above said `knowledge` has **no landing page** while the other six do, and the section
below built a recommendation on it. **That was wrong.** Every one of the seven workspaces has a
landing, registered and reachable:

| Workspace | `WORKSPACES[ws].href` | registered |
|---|---|---|
| `hub` | `/admin/me` | yes |
| `work` | `/admin/work` | yes |
| `equipment` | `/admin/equipment` | yes |
| `research-cad` | `/admin/research-cad` | yes |
| `knowledge` | **`/admin/learn`** | yes |
| `money` | `/admin/money` | yes |
| `office` | `/admin/office` | yes |

My probe did not read `WORKSPACES[ws].href`. It looked for a ROUTE NAMED AFTER the workspace —
`/admin/knowledge` — which four of the seven happen to follow and which is a naming convention, not a
requirement. `knowledge` is named `/admin/learn` because the product calls it Learning, and that is
the only thing wrong with it. Fourth time in this plan that the probe was the defect, and the check
that caught it is the same one every time: read the field the code reads, not a pattern that usually
matches it.

**The second anomaly does not survive either, on re-reading rather than re-measuring.** `equipment`
holding exactly one rail link is the consolidation WORKING: C3 absorbed ten pages into that portal,
so one link is the correct number. The observation that does survive is smaller and belongs to all
seven — every workspace's rail repeats its own landing as its first row, which in `equipment`'s case
is the entire group. That is a cosmetic redundancy in the rail, not a case for retiring a workspace,
and retiring one for it would be exactly the "re-arranging navigation on a number that has not
arrived" this section warns against two paragraphs later.

### So the answer is simpler than the section above concluded

**Keep the seven, change nothing structurally, revisit below 30 rail links.** The two changes
proposed above are withdrawn: one rested on a broken measurement and the other on reading a success
as a defect. What is left is the part that was always the answer — 42 links across 7 groups is a
working navigation, and the reason to delete the split was never elegance but a link count that no
longer exists and is not coming.

The trigger stands, and it is the only thing here worth acting on later: **rail links below 30.**

### The trigger, stated so it can be checked rather than felt

Revisit the seven-workspace split when **rail links fall below 30**, which needs roughly a dozen more
absorptions than remain. If that never happens, the split stays: seven groups of six is a working
navigation, and the reason to delete it was never elegance but a link count that no longer exists.

### What this does not decide

Four pages are stuck on the personal-vs-company question and they are one decision, not four —
`announcements`, `notifications`, `me/privacy` and `my-files`. Each is ungated and personal; each has
a company page it "belongs" to that is gated more narrowly; folding any of them in removes it from
the nav of everyone outside those roles. The question is: **does the Hub own the personal view of a
thing, or does the company page render a personal view of it for whoever opens it?** §5.2's
role-driven rendering is the second answer; the `hub` workspace already is the first. That is a
product decision about the shape of the app and it is not delegated — it is in §13 for the owner.

---
