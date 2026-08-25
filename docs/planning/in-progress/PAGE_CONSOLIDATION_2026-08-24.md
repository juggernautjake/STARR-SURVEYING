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
- [ ] **C2 — Extract the shell** as `lib/admin/portal/` — tab set, `?tab=` routing, per-role
      default, per-tab gating, per-tab lazy fetch, **and the toggle read from §11.6**. Everything
      after this is configuration.

      Extract it from **`/admin/billing` and `/admin/marketing` together**, not from either alone.
      They solved the same problem twice, three months apart, and the differences between them are
      the interesting part: marketing keeps a date range in the URL alongside the tab and has one
      writer for the whole query string so changing the tab cannot drop the period; billing has no
      second parameter and does not need one. A shell derived from one example would encode that
      example's accidents.
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
