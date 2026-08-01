# Surveying Platform — Full Audit & Pre-Launch Question Bank
**Date:** 2026-07-29 · **Scope:** everything under `/admin`, `/api`, `lib/`, `mobile/`, and the public
marketing/pay surfaces. The `/dnd` subsystem is explicitly out of scope except where it shares
infrastructure or competes for the same code.

---

## 0. What actually exists (measured, not estimated)

| Thing | Count |
|---|---|
| Admin page routes | **158** |
| API route handlers | **517** (340 under `/api/admin`) |
| Distinct DB tables/views queried in code | **249** |
| Tables/views with a `CREATE` statement in `seeds/` | **197** |
| **Tables queried in code with NO schema in the repo** | **78** → **0** (fixed, §1.1) |
| Tables carrying an `org_id` (multi-tenant scoping) | **28 of 188** → **126** (fixed, §1.2) |
| Admin `.tsx` lines of code | **196,254** |
| Test files (whole repo) | 1,335 — of which **571 are D&D** |
| Hard-coded hexes inside `style={{}}` | **1,662 across 267 files** (ratcheted) |
| Curated help-drawer entries | **8 of 158 pages** |
| API routes using the RLS-bypassing service role | **466 of 517** |

**The honest headline:** the feature surface is genuinely impressive and unusually complete for a
one-person build — jobs, hours, payroll, payouts, receipts, mileage, equipment (incl. maintenance,
consumables, valuation, templates, reservations), CAD, research automation, an LMS with real exam
prep, messaging, leads, invoicing, a customer pay portal, a mobile app, and a SaaS/multi-tenant
scaffold. The auth coverage on API routes is solid (no admin route lacks an auth check).

**The honest problem:** it is a collection of ~20 well-built subsystems that have not yet been made
into one product. The gaps below are almost all *integration, reproducibility, and coherence* gaps —
not missing features.

---

## 1. Launch blockers (do not go live without these)

### 1.1 ✅ RESOLVED 2026-07-29 — 78 core tables had no schema in the repo
The single most serious finding of the audit, now closed. As found: `jobs` — the central entity of
the entire business — was never `CREATE TABLE`'d anywhere in `seeds/`. It was only ever `ALTER`ed
(seeds 280, 304, 306, 452). Same for:

```
jobs, job_team, job_time_entries, job_equipment, job_field_data, job_payments,
job_research, job_checklists, job_stages_history, job_tags,
employee_profiles, employee_certifications, employee_role_history, daily_time_logs,
payroll_runs, pay_stubs, pay_raises, pay_rate_standards, pay_advance_requests,
payout_log, withdrawal_requests, work_type_rates, seniority_brackets, role_tiers,
xp_transactions, xp_balances, xp_pay_milestones, badges, rewards_catalog, rewards_purchases,
learning_modules, learning_lessons, learning_topics, lesson_blocks, lesson_versions,
question_bank, quiz_attempts, quiz_attempt_answers, user_lesson_progress, user_progress,
equipment_inventory, media_library, activity_log, error_reports, recycle_bin, …(and 33 more)
```

**Consequences (before the fix):**
- You could not stand up a staging or dev database. There was one database — production.
- A new machine, a new developer, or a rebuild after an incident could not be done from the repo.
- Every schema change to these tables was an undocumented click in the Supabase dashboard.
- Disaster recovery depended entirely on Supabase's PITR retention, not on anything you control.

**FIXED — 2026-07-29.** Shipped:

| Artifact | What it does |
|---|---|
| `scripts/dump-missing-schema.mjs` | Introspects the live DB, finds every table the code queries with no CREATE in `seeds/`, and emits DDL. Read-only (catalog SELECTs only). |
| `seeds/000_baseline_tables.sql` | **76 tables + 144 indexes.** Runs FIRST — 29 later seeds (from `001_config.sql`) ALTER these tables. |
| `seeds/499_baseline_fks.sql` | **57 foreign keys.** Runs LAST — they reference tables created across the whole seed range (`conversations`, `organizations`, `receipts`, `vehicles`, `job_files`, `kb_articles`, `problem_templates`). |
| `scripts/verify-baseline-schema.mjs` | Builds both files into a scratch schema inside a transaction, diffs **every column** against production (type, precision, nullability, default), then ROLLS BACK. Production untouched. |
| `__tests__/schema-coverage.test.ts` | Guard: query a table, define a table. Fails with the offending call sites named. |

**Verified:** builds cleanly from empty — 76 tables, 243 indexes, 57 FKs — and *every column matches
production exactly*. The gap census went **78 → 0** (2 residual are documented bugs, below).

Two ordering bugs were found and fixed while doing this:
- `seeds/run_all.sh` skipped **any** `000_*` file by numeric prefix, so the baseline would never
  have run. Now skips `000_reset.sql` **by name**. (`scripts/apply-seeds.mjs` and
  `scripts/run-seeds.sh` already filtered by exact filename and were fine.)
- The generator initially swallowed `undefined_table` when adding foreign keys, which would have
  silently shipped a database with no referential integrity if the seed order were wrong. Now only
  `duplicate_object` is caught; a missing referenced table fails loudly.

**Still to do:** stand up an actual staging Supabase project from these seeds and point a preview
deploy at it. The repo can now do this; nobody has yet.

> **⚠ PARTLY DONE 2026-08-01 — the tooling is built; creating the project is the owner's to do.**
>
> The reason nobody had done this was mechanical, and worth naming: `apply-seeds.mjs` could resolve
> **exactly one connection** — production. Bootstrapping a second database meant editing `.env.local`,
> running the seeds, and remembering to change it back. And `npm run db:seed:reset` runs
> `000_reset.sql`, which **TRUNCATEs every table**, against whatever `.env.local` happens to say, with
> no confirmation of any kind. So the one step Phase 0 asks for was also the step most likely to
> delete the live business by a forgotten edit. It had been that way the whole time; nothing had fired
> it, which is not the same as it being safe.
>
> Both halves now ship together, because either alone is worse than neither — a way to point elsewhere
> makes the destructive flag easier to fire by accident, and a guard on a script that can only reach
> production is pure friction:
>
> - `--target staging` reads `STAGING_DB_URL`; `--target <postgres://…>` takes an explicit string.
>   Every run now **prints its destination**, so the target is never inferred.
> - `--reset` against production is **refused** unless `--yes-truncate-production` is passed — a
>   distinct flag rather than a prompt, since a prompt is a reflex to dismiss and does not survive the
>   unattended case. It is refused even when production is typed out as an explicit `--target` URL
>   (compared by host + database, since credentials and pooler ports differ between equivalent URLs).
> - An unrecognised `--target` **fails** rather than falling back to production, so `--target stagng`
>   cannot silently seed the live database.
> - `npm run db:bootstrap:staging` is the whole bootstrap in one command.
>
> `__tests__/schema/seed-target-guard.test.ts` runs the real script for each case.
>
> **What remains is genuinely not mine to do:** creating the Supabase project and pointing a Vercel
> preview at it requires an account on the owner's Supabase organisation and its billing. Once the
> project exists, add `STAGING_DB_URL=…` to `.env.local` and run `npm run db:bootstrap:staging` —
> the 307-file seed set applies from empty, and `scripts/verify-baseline-schema.mjs` confirms parity.

### 1.1b 🟠 NEW — three research routes query tables that exist nowhere
Found by the census above. `research_artifacts` and `research_extracted_data_points` are queried by
production code but exist in **neither `seeds/` nor the live database**:

- `app/api/admin/research/[projectId]/full-extract/route.ts:104` — artifacts always load as `[]`,
  so the "Load artifacts (screenshots)" step reports `count: 0` forever.
- `app/api/admin/research/[projectId]/deep-lot-analysis/route.ts:463` — Phase 4 cross-validation
  never finds prior extractions and silently does nothing.
- `app/api/admin/research/[projectId]/verify-lot/route.ts:380` — same.

All three destructure `{ data }` and **discard `error`**, so they degrade silently rather than
failing. Tracked in `KNOWN_PHANTOM_TABLES` in the guard test so they stay visible. **Decide:** were
these features ever finished (create the tables), or are they dead code (delete the call sites)?

> **✅ RESOLVED 2026-08-01 — neither. The features were finished; the queries were misaddressed.**
> The real data was one identifier away the whole time, so creating the tables would have duplicated
> live data and deleting the call sites would have thrown working features away.
>
> - `research_extracted_data_points` → **`extracted_data_points`**, which holds **208 rows** today.
>   The column names differ too — `display_value`/`raw_value` not `extracted_value`, `document_id`
>   not `source_document_id`, `extraction_confidence` not `confidence` — so a rename alone would have
>   compiled, run, and stayed silently empty. Measured against the live project with the most data:
>   **69 points selected, 24 becoming cross-validation atoms** where zero flowed before.
> - `research_artifacts` → artifacts are **`research_documents` rows filed under an `/artifacts/…`
>   storage path**, with `category` *derived*, not stored. The working `artifacts/route.ts` already
>   did this correctly; `full-extract` had reached for a table instead. The derivation now lives once
>   in `lib/research/artifact-category.ts` and both call it.
>
> While rewiring `full-extract`, its two queries collapsed into one — the same table twice would have
> analysed every document as text *and* as an image, doubling the vision spend and producing two atoms
> per fact to de-conflict. It now **partitions**: text where there is text, vision where there is only
> an image. On live data that is **601 text, 14 visual (10 deeds, 4 plats)** — again, up from zero.
>
> **The wrong table name was not the defect; it was how the defect got in.** All three routes now
> surface their query `error` instead of degrading to an empty result, because *"the query failed"*
> and *"there is nothing to cross-check"* were being reported identically, and that is the only reason
> this survived to be found by a census rather than by a user. `KNOWN_PHANTOM_TABLES` is now empty and
> the guard test keeps it that way. `__tests__/research/artifact-category.test.ts` pins the derivation
> — in particular that `screenshots-misc` is tested *before* `screenshots`, since inverting those two
> feeds every captured 404 and auth wall to a vision model.

### 1.2 🔴 Multi-tenancy is skin-deep
`org_id` exists on 28 tables — and they are all the *SaaS wrapper* tables (billing, subscriptions,
support tickets, invites, audit log, payments). The tables that hold the actual business — `jobs`,
`users`, `employees`, `equipment*`, `receipts`, `contacts`, `leads`, `messages`, `cad_drawings`,
`research_projects`, every `learn*` table — have **no tenant column at all**.

The `/platform`, `/admin/orgs`, `/admin/billing`, bundle-gating and operator-console code all imply
you intend to sell this to other surveying firms. As built, onboarding a second firm means every
firm sees every job, every employee, and every drawing. See §Q1 — this is the decision that most
changes what "launch" means.

> **✅ RESOLVED 2026-08-01 — the column, per D1.** `seeds/513_org_scoping.sql` puts a nullable
> `org_id uuid REFERENCES organizations(id)` (plus an index) on **73 business tables**; 53 → 126 of
> 188 now carry one, and the rest are deliberate. `scripts/audit-org-scoping.mjs` holds the
> classification and `__tests__/schema/org-scoping.test.ts` pins it, because the *classification* is
> the work and the column is the easy part:
>
> - **platform (12)** sit above the org — `organizations` itself, `operator_users`, `releases`,
>   `impersonation_sessions`. `impersonation_sessions` is the sharpest case: it exists precisely to
>   cross an org boundary, so scoping it to one org defeats it.
> - **reference (35)** are shared catalogues — 254 Texas counties, the FS reference library, the
>   problem-template bank. A per-tenant copy is duplication with extra steps, and the first divergent
>   copy is a support call about why one firm's county data is stale.
> - **per-user (22)** follow the person, not the firm. A bookmark is not tenant data.
> - **derived (51)** are children of an already-scoped table — a `job_equipment` row's tenant *is* its
>   job's. Denormalising the column onto every child is a second copy of the same fact that can
>   disagree with the first.
> - **dnd (40)** are a separate product with its own user table, explicitly out of this audit's scope.
>
> Two properties are asserted rather than left to convention. The column is **nullable with no
> default** — `NOT NULL DEFAULT <starr>` would silently stamp every future row with the Starr org,
> *including rows a second customer's code inserts*, which is the precise bug multi-tenancy exists to
> prevent, shipped early and invisibly. And the backfill **refuses to guess**: it counts
> `organizations` first and skips with a `RAISE NOTICE` if there is more than one, because by then a
> default is a guess about which customer owns a row — silent, plausible, and discovered by the other
> customer.
>
> An unclassified table defaults to **tenant**, since the cost of being wrong runs one way: a spare
> nullable column is dead weight, a missing one is a table that leaks between firms on the day the
> second one arrives.
>
> **Still open, and this is only step one.** The column exists and is empty of meaning until queries
> filter on it. Enforcement — RLS or a scoped query helper — is Phase 3 work; today a second org
> would still see everything. What D1 bought is that the migration is now a backfill.

### 1.3 🟠 Two navigation systems, drifted apart
`AdminSidebar.tsx` (legacy, 11 hand-maintained sections) and `lib/admin/route-registry.ts` (the new
IconRail/workspace/⌘K source of truth) both exist. `adminNavV2Enabled` defaults to `true` but the
legacy sidebar is still shipped and reachable.

They have diverged badly: **32 routes are in the registry and missing from the sidebar** — including
Invoicing, Contacts, Files, Calendar, Support, Reports, Billing, Org Settings, Audit Log, Invites,
Announcements. Three routes are in the sidebar and missing from the registry (`/admin/invoices/new`,
`/admin/payments/inbox`, `/admin/payouts/runs`).

**Fix:** delete `AdminSidebar.tsx` and the `adminNavV2Enabled` flag. One source of truth.

> **✅ RESOLVED 2026-08-01 — one source of truth, but NOT by deleting the sidebar.**
>
> The prescribed fix was wrong in a way worth recording. `AdminSidebar.tsx` is not merely the legacy
> desktop sidebar — it is **the mobile drawer, and the only navigation a phone has**. Deleting it
> would have removed navigation from every mobile user to fix a consistency problem. The defect was
> the second **source**, not the second **surface**.
>
> So the surface stayed and the list went. ~180 lines of hand-written nav items became a derivation:
> `accessibleRoutes()` → filter `showInRail` → group by workspace → `WORKSPACE_ORDER`. The drawer and
> the rail now cannot disagree, because they read the same array. Role gating went with it — the
> drawer's own `canAccess` and its six copied role-group constants are gone, since two places
> expressing *"who may see this"* is the same bug wearing a different hat. `adminNavV2Enabled` is
> deleted and the rail is unconditional.
>
> **The conversion nearly shipped a regression, and that is the part worth keeping.** Five routes —
> `invoices/new`, `payments/inbox`, `payouts/runs`, `rewards/how-it-works`, `rewards/admin` — had been
> registered `showInRail: false` during §1.4, on the sound-sounding grounds that a rail with
> everything on it is a rail nobody scans. But the hand-written drawer *had shown them*. The moment
> the drawer derived from the registry, "palette-only" silently became "gone from mobile" — a
> navigation regression delivered as a cleanup. Two existing tests caught it by failing; both had been
> asserting the wrong thing (a literal `href:` string inside `AdminSidebar.tsx`) and were retargeted
> to assert reachability, which is the property they were always meant to protect.
>
> `__tests__/admin/sidebar-registry-parity.test.ts` freezes all 33 hrefs the hand-written drawer
> showed, so no future edit can quietly drop one. `__tests__/admin/sidebar-render.test.tsx` **actually
> renders the component** rather than reading its source — every string assertion in this slice would
> still pass if the derivation produced an empty array, and shipping an empty drawer is precisely the
> "authored but not wired" failure §1.4 is about. Rendered as an admin: **97 links across all six
> workspaces** (44 for a field-crew user), including the Invoicing / Contacts / Files / Calendar /
> Support / Reports / Billing / Audit Log / Invites / Announcements entries this section measured as
> missing — against **33** the hand-written list managed.

### 1.4 ✅ RESOLVED 2026-08-01 — 36 built pages were unreachable from navigation

Pages that existed, worked, and were not in the route registry — so: not on the rail, not in ⌘K, no
breadcrumb, no help. **Re-measured before fixing: 35 of 127 admin pages.** Three of them
(`finances/overview`, `finances/reconcile`, `payouts/tax-report`) had been built *specifically* to
close go-live gaps G2/G3/G5, which is the sharpest possible version of this repo's signature defect:
work that shipped, works, and cannot be found — so it reads as missing, and gets built again.

**FIXED.** All 35 registered. `/admin/login` is deliberately excluded, with the reason in the audit
script: it is the door, not a room, and a menu item that signs you out of the app you are using is a
bug rather than a feature. **Orphans: 35 → 0.**

| Artifact | What it does |
|---|---|
| `scripts/audit-orphan-routes.mjs` | Walks `app/admin/**/page.tsx`, diffs against `ADMIN_ROUTES`, reports orphans **and** dangling entries. Exits non-zero on either. |
| `__tests__/admin/orphan-routes.test.ts` | The ratchet. Adding a page without a registry entry now fails, naming the file. |

**The `showInRail` split is the design, not a detail.** Registering all 35 on the rail would have
traded one problem for a worse one — a rail with 126 items is a rail nobody scans, and the go-live
dashboards would have been as lost inside it as they were outside it. So destinations somebody
navigates *to* are on the rail (the three money dashboards, Weather, Notifications, the Work Mode
door, the exam-prep tracks); pages reached *from* something else are palette-searchable, breadcrumbed
and help-addressable but not rail clutter — which is three of the four things §1.4 said they lacked.
A test asserts the three go-live dashboards are on the rail specifically, because registering them
hidden would satisfy the letter of this finding and none of it.

**Two answers this slice gave to open questions, by making them concrete rather than by deciding them:**

- **Q44 (is Work Mode a mode or a view?)** — registered as a **mode**: one door (`work-mode/start`) on
  the rail, the seven per-role shells reachable only through it. A mode has one entrance. The owner can
  still overrule this; it is now a one-line change rather than nine unregistered routes.
- **§2.2 (colliding money vocabulary)** — `/admin/finances/reconcile` is labelled **"Bank
  Reconciliation"**, not "Reconcile". The ⌘K ranker test caught the collision immediately: a bare
  "Reconcile" outranked **Receipts** for the query `rec`, which is a far more common destination and an
  explicit §12 acceptance criterion. "Reconcile" alone could mean the bank, the subscription, or a
  payout run — exactly the ambiguity §2.2 is about.

**Three existing tests failed on this change, and all three were worth the noise:**

1. The `rec` → Receipts acceptance criterion — a **real regression**, fixed by the relabel above.
2. `routeLabel` "derives readable labels for unregistered leaves" used
   `/admin/equipment/templates/new` as its example, which is now registered. It failed for the best
   possible reason; the fixture is synthetic now, because a route that exists cannot demonstrate the
   fallback for routes that do not.
3. The recency-boost test boosted the **worst** match for `"admin"` and expected it to reach the top —
   which held only while the corpus was small enough for the worst match to sit within the +25 boost.
   Registering 35 routes widened the range. Rewritten to construct the tie it claims to test, plus a
   new companion asserting the other half of the rule: **recency must NOT outrank a much better
   match**, or the palette starts second-guessing what you just typed.

Also pinned while in here: every route has a description (⌘K and the help drawer need one), and every
`iconName` is a real lucide export — it is a plain string so nothing type-checks it, and a blank icon
in a rail is indistinguishable from a broken build.
### 1.5 🟠 Deploy-time secrets & flags not yet set
From `BLOCKERS.md` §D and `GO_LIVE_GUIDE.md`: `PAYMENTS_LIVE`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`CRON_SECRET`, `NEXTAUTH_SECRET`, the mobile install URLs, storage buckets, and the owner-account
provisioning. All owner-gated, all still open.

---

## 2. Structure & organization — "is the site built weird?"

Partly, yes — but in a specific, fixable way. The information architecture is **organized by the
order features were built, not by how a surveying business actually works.**

### 2.1 Four competing "home" concepts
| Surface | What it is |
|---|---|
| `/admin/dashboard` | 474-line hardcoded tile page, heavily learning-oriented |
| `/admin/me` | The real Hub — customizable widget canvas, saved layouts, greeting |
| `/admin/work` `/admin/office` `/admin/research-cad` | Workspace landings that literally render *"Phase 4 adds at-a-glance widgets here; for now this lists every accessible page"* |
| `/admin/work-mode/*` | A separate role-specific shell you *enter*, with its own 9 routes |

A new employee logging in has no idea which of these is "the app." **Recommendation:** `/admin/me`
is the home. Delete `/admin/dashboard` (fold its useful tiles in as widgets). Either give the three
placeholder landings real widgets or make the rail icon jump straight to the workspace's busiest
page. Decide whether Work Mode is a *mode* (full-screen takeover) or a *view* — right now it's both.

### 2.2 Thirty money surfaces, no single financial home
```
finances · finances/overview · finances/reconcile · reports · invoicing · invoicing/categories
invoices/new · payments/inbox · billing · billing/invoices · billing/plan-history · billing/upgrade
payouts · payouts/runs · payouts/ad-hoc · payouts/tax-report · payout-log · payroll · payroll/[email]
pay-progression · pay-progression/[email] · receipts · receipts/new · mileage · rewards · rewards/admin
research/billing · equipment/fleet-valuation · /pay · /pay/[invoice]
```
Worse, the vocabulary collides: **"Billing"** means *the subscription you pay for the software*,
**"Invoicing"** means *what your customers pay you*, and **"Finances"** means *job profitability*.
Nobody will guess that. Suggested consolidation into one **Money** workspace with four tabs:
*Money In* (invoices, payments, the pay portal) · *Money Out* (payouts, payroll, receipts, mileage) ·
*Profitability* (per-job finances, reports, fleet valuation) · *Company Account* (the SaaS subscription).

### 2.3 Six people surfaces, no single Person record
`/admin/employees` (list) · `/admin/employees/manage` (edit) · `/admin/users` (roles) ·
`/admin/team` (live field status) · `/admin/contacts` (CRM, includes employees) ·
`/admin/messages/contacts` (pick someone to message) — plus `/admin/team/[email]`,
`/admin/payroll/[email]`, `/admin/pay-progression/[email]`, and
`/admin/employees/manage/[email]/history`.

That's ten routes describing one noun. **Recommendation:** one `/admin/people/[id]` profile with
tabs (Profile · Roles & Access · Pay · Hours · Equipment · Certifications · History), and the list
pages become *filters* on one directory, not separate pages.

### 2.4 Ten time/schedule surfaces
`schedule` · `calendar` · `timeline` · `hours-approval` · `time-off` · `personnel/crew-calendar` ·
`equipment/timeline` · `equipment/today` · `me?tab=hours` · `mileage`. Four of them are calendars.
A dispatcher deciding "who and what is available Thursday" has to open three pages.

### 2.5 Twelve communication surfaces
`messages` · `messages/new` · `messages/contacts` · `messages/settings` · `discussions` ·
`email/new` · `email/sent` · `notes` · `announcements` · `notifications` · `support` · plus lead
replies. Internal chat, internal forum, customer email, company notes, release notes, alerts, and
tickets are seven different mental models. At minimum, merge Discussions into Messages (channels)
and Notes into Files.

### 2.6 Overlapping log/audit surfaces
`/admin/audit` · `/admin/error-log` · `/admin/timeline` · `/admin/equipment/overrides` ·
`/platform/audit` · `activity_log`. Five places to answer "what happened and who did it."

---

## 3. Content & function gaps (things a surveying firm needs that aren't there)

- **No proposal / estimate / contract with customer acceptance.** A lead has a `quote_amount`
  field and that's it. There is no document you send, no line items, no scope-of-work template,
  no acceptance/e-signature, no "signed proposal → auto-create job." Searching for signature code
  finds only CAD seals. For a surveying firm this is the *front door* of every job.
- **No customer portal.** Customers get a marketing site, an email thread, and `/pay/[invoice]`
  (which requires them to already know the invoice number). They cannot log in to see job status,
  approve a change order, or download their plat. `/share/[token]` exists but is research-report-only.
- **No deliverable/document control.** There's a file explorer and CAD drawings, but no concept of
  a *deliverable* with a revision number, an issued-date, a recipient, and a "final signed & sealed"
  state — which is the artifact a surveying firm is legally on the hook for.
- **No RPLS/licensure & insurance tracking as a compliance surface.** `employee_certifications`
  exists as a table with no schema and no expiry-alerting surface. CE hours, license renewal, COI
  expiry, and vehicle registration/inspection are all business-critical dates with no home.
- **No change orders.** Scope creep is how surveying jobs lose money; there is no way to record
  "customer added 3 acres on 7/14 at $X."
- **No AR / collections view.** Invoices exist; "who owes me money and for how long" (aging report)
  does not appear in the finance code.
- **Job costing is one-directional.** Hours, mileage, receipts and equipment all attach to jobs, but
  there is no *estimate vs actual* comparison, which is the number that tells you if you're pricing
  right.
- **Weather page is orphaned** — for a field business, weather should be a first-class scheduling
  input (auto-flag rain days, suggest reschedules), not an unlinked page.

---

## 3b. 🔴 OWNER OBJECTIVE (added 2026-08-01) — one search across every document

**Owner's words:** *"I want there to be a robust file searching system on the backend so that if we
need to pull up a customer's info or job info, or business documents, we can do that. I want it to
be that we can filter docs by type, date and search using key words and matching spellings and also
by using AI to help find specific documents or information."*

### Where this actually stands (measured 2026-08-01, live DB)

Not "needs polish" — **there is no cross-corpus search over business data at all.** What exists is
real, but it is pointed entirely at the *learning* content:

| Capability | Built for | NOT built for |
|---|---|---|
| Full-text (`tsvector` + GIN) | `kb_articles`, `fs_reference_chunks`, lessons, modules, topics, flashcards, fieldbook notes | every business document and record |
| Semantic / embeddings (`pgvector`) | `fs_reference_chunks.embedding`, `dnd_system_entries.embedding` | every business document and record |
| Spelling-tolerant matching | **nothing — `pg_trgm` is not even installed** | everything |

And the documents are **scattered across nine tables that never talk to each other**:
`research_documents` (654 rows — by far the biggest real corpus), `job_files`, `field_media`,
`employee_images`, `maintenance_event_documents`, `payment_receipts`, `fs_reference_docs`,
`user_files`, plus `file_nodes`.

The obvious place to look is the File Explorer, and that is the trap: **`/admin/files` has 6 rows.**
It is a virtual filesystem shell whose `mnt:` mounts are read-only views. Searching it finds almost
nothing, which reads as "search is broken" rather than "search was never built over the real data."

The records people actually ask for by name — `customers`, `jobs`, `contacts`, `leads`,
`customer_invoices` — have no search surface either. Today "pull up that customer's info" means
knowing which page to open first.

### What must be true when this is done

1. **One entry point.** A single query reaches every corpus — documents *and* records — and returns
   one ranked, permission-filtered list. Not nine search boxes on nine pages.
2. **Filter by type and by date**, as asked: document type / MIME / source corpus, and created,
   modified, and *recorded/effective* date where the corpus has one (a deed's recording date is not
   its upload date, and for a title chain the recording date is the one that matters).
3. **Keyword search that survives a typo.** `pg_trgm` for similarity so "Waggner" finds "Waggoner"
   and "esment" finds "easement" — surveying documents are dense with proper nouns and legal terms
   that nobody spells right the first time.
4. **AI-assisted retrieval** for the questions keywords cannot express — *"the deed that mentions a
   40-foot access easement on the north line"* — via embeddings over extracted text, mirroring the
   `fs_reference_chunks` pattern already proven in this repo rather than inventing a new one.
5. **It must never leak.** Search is a permission bypass waiting to happen: results are assembled by
   the service role across tables whose own pages gate access individually. Every hit must be
   filtered by the same rules its own surface would apply, and `org_id` (§1.2) respected.
6. **Empty is a real answer.** A search that silently drops a corpus it failed to query is worse
   than one that finds nothing — see §1.1b for what that failure mode already cost here.

> **✅ 8a–8c + 8e SHIPPED 2026-08-01 — the backbone, the filters, and a search box that reaches them.**
>
> `seeds/514_search_indexes.sql` installs `pg_trgm` and trigram + full-text indexes over the document
> tables and business records. `seeds/515_search_function.sql` adds `search_everything()` — one ranked,
> permission-filtered query across ten corpora. `/api/admin/search` and `/admin/search` sit on top,
> and the route is **registered on the rail and in ⌘K**, because a search API with no search box is the
> purest possible instance of the §1.4 defect.
>
> Verified against live data, not just tested: **"Waggner" → Waggoner**, **"esment" → RIGHT OF WAY
> EASEMENT**, exact `deed` outranking both — and confirmed a second time through PostgREST, since the
> route calls the function over the wire rather than through `pg`.
>
> **Four findings, each of which would have shipped a search box that looks built and finds nothing:**
>
> 1. **`similarity()` is the wrong function.** It compares whole strings, so it is length-sensitive.
>    Measured here: `"Waggoner"` against `"3424 Waggoner Dr, Belton, TX"` scores **0.33** — a perfect
>    match, barely above the 0.3 default, and missed outright in a slightly longer label.
>    `word_similarity()`, which matches against the best word sequence *inside* the field, scores
>    **1.00**. That is what somebody typing a street name means.
> 2. **The default threshold rejects real typos.** Single-letter slips measured on this data cluster at
>    **0.43–0.55** (`esment` 0.429, `Belon` 0.500, `Waggner` 0.545). At the 0.6 default, *"matching
>    spellings"* would have matched nothing at all.
> 3. **That threshold cannot be set where you would expect, and it fails silently.** `ALTER DATABASE …
>    SET` reports success and `pg_db_role_setting` shows the value — and a fresh connection still reads
>    0.6, because the Supabase **pooler** hands back a backend that never re-read it. `SET LOCAL` fails
>    the same way. It looks applied and is not. The threshold is now pinned inside the function, via
>    `SET LOCAL` in a plpgsql body rather than the tidier `CREATE FUNCTION … SET` clause, which
>    Supabase denies outright (`42501`).
> 4. **Two hazards came with that forced move to plpgsql**, both fixed: `RETURNS TABLE` column names
>    become OUT variables that shadow the query's own columns, and `nullif(jsonb, '')` fails because
>    `''` is not valid JSON.
>
> **`customers` results are deliberately not links.** There is no `/admin/customers` page anywhere in
> the app; a link would be a 404 dressed as a feature. The result carries the contact details instead,
> and a test pins both halves so building the page later is a prompt rather than a silent divergence.
>
> **Still open:** **8d** (AI/embedding retrieval for questions keywords cannot express) — the
> `fs_reference_chunks` pattern is proven in this repo and is the next slice.

### Deliberately NOT in scope for the first pass

OCR of un-extracted PDFs, and indexing CAD geometry. Both are large, and `research_documents`
already carries `extracted_text` for the corpus that matters most — build against what is there,
then widen.

---

## 3c. 🔴 OWNER OBJECTIVE (added 2026-08-01) — sellable to other firms, and instrument-native

**Owner's words:** *"make sure that everything is set up to work well for our personal business,
'Starr Surveying', but also … thoroughly analyze all the backend pages and make sure that everything
is fully set up so that we can package the different parts of the app and have a subscription service
so that surveying firms can use our product and keep all of their business info in one place and have
full surveying business management. We need to be able to integrate … Trimble … Hexagon (Leica
Geosystems) … Topcon … GeoMax … Spectra Precision."*

This is **D1 arriving in full** (§8b: *"internal now, SaaS later"*). Later is now a build objective,
so the two audiences have to be served by one codebase without either degrading the other.

### 3c.1 Packaging — defined, and almost entirely unenforced

`lib/saas/bundles.ts` already defines six bundles — `recon`, `draft`, `field`, `office`, `academy`,
`firm_suite` — with pricing, seat rules, `implies` chains and Stripe price-id slots. The plumbing
around it is real too: `bundle-gate.ts`, `organizations`, `organization_members`, `subscriptions`,
`org_settings`, an operator console, and an `/admin/billing/upgrade` surface.

**And exactly 1 of the 131 registered admin routes carries a `requiredBundle`.**

That is the finding. Packaging is not missing — it is *declared and not applied*, which is this
repo's signature defect (§1.4, "authored but not wired") wearing its most expensive costume: every
firm that subscribes to one bundle currently gets the entire application. The catalogue says there
are six products; the software ships one.

**What must be true:**

1. **Every route, API handler and mobile tab declares which bundle it belongs to.** The audit of
   *"all the backend pages"* the owner asked for is precisely this sweep: 158 admin pages and 517 API
   handlers, each assigned, with a ratchet test so a new page cannot ship unassigned. Server-side, not
   just hidden in the nav — a bundle gate that only hides a menu item is decoration.
2. **`org_id` stops being a column and starts being a filter.** §1.2 shipped the column on 73 tables
   and said plainly that it is inert until queries use it. Selling to a second firm is the event that
   makes that inertness a data breach.
3. **Starr Surveying is tenant #1 in the same database, not a special case in the code.** The moment
   "does this work for us" and "does this work for a customer" are answered by different code paths,
   every future bug has to be found twice.
4. **Onboarding a firm from zero.** Today the app assumes Starr's data exists. A new firm needs empty
   states, a first-run setup, and defaults that are not ours (§Phase 4 item 19 names this; it becomes
   load-bearing here).

### 3c.2 Instruments — the part that decides whether a firm can actually switch

A surveying firm will not move its business into software that cannot read what its instruments
produce. Current state, measured:

| Vendor | What exists today |
|---|---|
| **Trimble** | Partly built — `lib/cad/import/jobxml-parser.ts` (JobXML), a `trimble-pnezd` CSV preset, and `rw5-parser.ts` |
| **Topcon** | Partly covered by the same RW5 / PNEZD paths; nothing Topcon-specific |
| **Hexagon (Leica Geosystems)** | Nothing — no GSI8/GSI16 reader |
| **GeoMax** | Nothing (Hexagon subsidiary; GSI-compatible, so it rides on the Leica work) |
| **Spectra Precision** | Nothing specific (Survey Pro raw is RW5-family, so partly covered) |

Also: `equipment_inventory` already has `brand`, `model`, `serial_number`, `last_calibration` and
`next_calibration_due_at` — and **0 rows**. The fleet register these integrations would hang off is
an empty table.

**Sequenced by what unlocks the most for the least:**

- **File-level import first.** Every one of the five vendors exports **LandXML**, and it is the
  neutral interchange the whole industry already uses. One good LandXML reader covers all five for
  points, alignments and surfaces before a single vendor-specific parser is written.
- **Then the native raw formats**, in order of what is closest to done: Trimble JobXML (exists,
  needs hardening) → RW5 family, which carries Topcon and Spectra Survey Pro (exists) → Leica
  GSI8/GSI16 (new, and unlocks GeoMax with it).
- **Then the fleet.** Instrument records with make/model/serial tied to `equipment_inventory`, so a
  calibration certificate and its instrument are the same object — which is also the compliance
  surface §3 says is missing.
- **Cloud APIs last, and owner-gated.** Trimble Connect and Leica Exchange are account-and-credential
  products; they cannot be built or tested without the owner's vendor accounts. File import works for
  every firm on day one and needs nobody's permission.

### 3c.3 The trap to avoid

*"Make it work for Starr"* and *"make it sellable"* pull in opposite directions exactly once: when a
hard-coded Starr assumption is cheaper than a configurable one. Those are already in the code —
`@starr-surveying.com` as the internal-user test, Starr branding in the drawer, Bell County hard-coded
in the lot-verification pipeline (which returns a 400 for any other county). Each is correct today and
each is a per-tenant setting tomorrow. **They should be found and catalogued now, while they are a
list, rather than discovered one support ticket at a time.**

---

## 3d. 🔬 FEASIBILITY (researched 2026-08-01) — "a stored point shows up in the app shortly after"

**Owner's question:** *"I would love it if when a data collector stores a point, that point shows up
on the app shortly thereafter. I don't know if this is possible. Please look into it."*

**Short answer: yes — in seconds to minutes, not instantly — and only along one vendor's path today.**
The honest version matters here, because the difference between "instant" and "a minute after the
crew has signal" changes what can be promised to a customer.

### Why per-point push does not exist

Data collectors sync at the **job/file** level, not per measurement. Nothing in the Trimble, Leica,
Topcon, GeoMax or Spectra ecosystem emits an event when a surveyor presses *Store*. What actually
happens is: the point lands in the job file on the collector, the collector syncs that job to the
vendor's cloud on a trigger or interval, and anything downstream learns about it from the cloud.

So the achievable behaviour is **"the point appears shortly after the next sync"**, and the honest
latency is *seconds to a couple of minutes with connectivity* — which is what the owner asked for,
just not by the mechanism it sounds like.

### What each vendor actually offers

| Vendor | Path | Verdict |
|---|---|---|
| **Trimble** | Trimble Access → auto-sync → **Trimble Connect**, which has a public developer API, a .NET SDK, and a **Field Data extension** built for exactly this ("securely upload, manage, review and process data collected with Trimble Access") | ✅ **Viable today.** Best path by a distance. |
| **Topcon** | MAGNET/Topcon Enterprise is a cloud hub connecting Topcon hardware and third-party products; Topcon **Integration Services** already bridge to Autodesk Construction Cloud, MS Project, P6, JDLink | ⚠️ Integration exists but appears **partner/service-mediated** rather than self-serve. Needs a vendor conversation. |
| **Leica / Hexagon** | No public integration API surfaced by research | ❌ **Assume closed** until proven otherwise. Partner-gated. |
| **GeoMax** | Hexagon subsidiary — rides on whatever Leica path opens | ❌ Blocked with Leica. |
| **Spectra Precision** | Survey Pro raw is RW5-family; no distinct cloud API found | ⚠️ File-level only. |

**Two constraints found that shape the whole design:**

1. **Trimble Connect has no webhooks.** The Core API provides **Object Sync**, which detects changes
   *since a given timestamp* — a **polling** mechanism, not push. So the architecture is a poller with
   a cursor, and "how fresh" is a dial we set (poll interval), not something the vendor pushes to us.
2. **It requires a Trimble Connect licence** on the signed-in user to sync field data at all. That is
   a per-customer cost and a per-customer prerequisite — it belongs in the subscription conversation
   (§3c.1), not buried in a technical setting.

### The part that is genuinely ours to solve: no signal

Rural Texas boundary work regularly has no cell service. Whatever the vendor path, ingestion must be
**store-and-forward**: points arrive late, in bursts, and out of order, hours after they were shot.
A design that assumes ordered near-real-time arrival will look perfect in town and lose data in the
field. Every ingested point therefore carries **two clocks** — measured-at and received-at — and the
app must never present the second as if it were the first.

### Recommended sequence (each step useful on its own)

1. **Watched-folder ingestion — universal, works with all five vendors, needs nobody's permission.**
   Every collector can auto-export to a cloud folder (Drive/Dropbox/OneDrive) or FTP. Watch it, parse,
   ingest. Unglamorous, and the only option that covers Leica and GeoMax at all today.
2. **LandXML as the interchange spine** (§3c.2) — all five export it.
3. **Trimble Connect poller** — the real near-real-time win, and the one vendor where it is clearly
   buildable. Object Sync cursor + configurable interval, per-firm credentials.
4. **Our own mobile app as the true-instant path.** The repo already captures field media, GPS and
   notes on the phone. For a crew willing to carry it alongside the collector, a point can appear
   *actually* instantly — no vendor cloud in the loop. This is the only route to the literal version
   of the owner's request, and it is entirely under our control.
5. **Topcon and Leica partnership conversations** — owner-gated, and worth opening early because they
   are slow.

**Do not promise "instant, any brand."** Promise "Trimble near-live; everything else lands on sync or
import." Under-promising here is cheap; a firm that switches on the strength of a demo and then loses
a day's shots in a dead zone is not a customer we get back.

*Sources: Trimble Connect developer documentation, Trimble Access/Connect connected-workflow and Field
Data extension material, Topcon MAGNET/Topcon Enterprise and Integration Services product pages.*

---

## 4. Good ideas that need fleshing out

| Idea | Where it stands | What it needs |
|---|---|---|
| **Hub widget canvas** | Real, good, saved layouts, role-seeded | Widgets for the money/equipment/compliance surfaces; it's the answer to "one home page" if it's finished |
| **Workspace landings** | 3 of 6 are literal placeholders | Widgets, or delete and jump straight to the busiest page |
| **Help drawer (`?`)** | Fully built; **8 of 158 pages** have content | This is the single best AI opportunity in the app (see §5) |
| **Command palette (⌘K)** | Built, ranked, recency-boosted | Only knows *routes*. Add actions ("clock in", "new job", "log mileage"), and records (job #, person, equipment) |
| **Personas / role override** | Built | Undiscoverable, and its relationship to Work Mode is unclear |
| **Research self-healing adapters** | Spec is ready in `RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md` Part II, still `pending/` | The county-portal scrapers *will* break; this is the thing that keeps research working unattended |
| **Rewards / XP / pay progression** | Substantial build (2,578-line page) | Zero schema in repo; unclear if it's actually your comp policy or an experiment |
| **SaaS platform / operator console** | Scaffolded, bundle-gating, billing | Blocked on §1.2 — it can't ship without tenant-scoping the business tables |
| **Stripe payouts (G4)** | Foundation only, `PAYOUTS_STRIPE_LIVE` gated | Connect onboarding + transfers |
| **Mobile app** | 73 screens, pure logic tested | Device runtime (camera, background upload, offline) verified only by you on a real phone |

---

## 5. AI integration — the biggest opportunity

Today there are **six unrelated AI surfaces**, each with its own hand-rolled prompt and its own
Anthropic client:

| Surface | File |
|---|---|
| CAD deed parser / drawing chat / pipeline | `lib/cad/ai-engine/*`, `lib/cad/ai/*` |
| Lead reply drafting | `lib/leads/ai-draft.ts` |
| Learning tutor / grader / definitions / quiz gen | `app/api/admin/learn/*` |
| Research analysis + chat | `app/api/admin/research/testing/*` |
| Work-mode field assistant | `app/api/admin/work-mode/assistant/route.ts` |
| (D&D librarian — separate) | `lib/dnd/ai/*` |

### What's wrong with it
1. **No assistant knows anything about your data.** The work-mode field assistant is a stateless
   chat with a system prompt. It cannot see the crew's active job, cannot clock them in, cannot
   look up which total station is checked out. It answers trig questions. That is a calculator with
   manners, not an assistant.
2. **No tool use anywhere.** Not one of these routes defines tools. Every AI surface is
   text-in/text-out. The platform has 517 API endpoints and the AI can call none of them.
3. **No shared context layer.** Nothing assembles "who is this user, what role, what job are they
   on, what's on their plate" into a reusable digest — even though the D&D side already proved
   this pattern works (`characterDigest` + grounding blocks).
4. **Model IDs are inconsistent and a generation behind:** `claude-sonnet-4-5-20250929` (12 uses),
   `claude-sonnet-4-6` (4), `claude-opus-4-7` (1), `claude-haiku-4-5` (1). The current family is
   Claude 5 (`claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`). There's no central model config.
5. **The help drawer — the literal "help me, I'm stuck" surface — has no AI at all**, and 150 of
   158 pages show *"No help curated for this page yet."*

### What "AI fully integrated" should mean here
- **One assistant, everywhere** — a persistent dock (the `?`/⌘K surface) that knows the current
  page, the user's role, and their live context, and can *act* via tools: create a job, log hours,
  submit a receipt, check out equipment, draft a customer email, start a research run, explain
  this page.
- **AI-generated page help** as the fallback when `help-catalog.ts` has no entry — grounded in the
  route registry entry + the actual page, so those 150 empty drawers fill themselves.
- **Proactive, not just reactive** — "you're still clocked in at 7pm," "this job is 12 hours over
  estimate," "Bobby's RPLS renews in 30 days," "rain Thursday, want to move the Belton job?"
- **AI in the data-entry paths** where surveying is painful: deed → legal description parsing
  (partially exists in CAD), field-note → job-notes cleanup, receipt OCR (exists), photo →
  point-code suggestion, invoice line-items from logged hours.
- **A central `lib/ai/` module**: one client factory, one model config, one tool registry, one
  context digest builder, one cost/usage log. Six copies of the same 40 lines is how prompt drift
  and cost surprises happen.

---

## 6. Styling & formatting

- **Four styling systems coexist:** 67 CSS files, **3,085 inline `style={{}}` objects across 281
  admin files**, Tailwind utilities in 97 files, and `styled-jsx` in 29.
- **1,662 hard-coded hexes live inside inline styles** (267 files). You already have a good ratchet
  test holding the line — but the pile only shrinks if someone pays it down.
- **`app/styles/tokens.css` (149 lines) is a real, well-documented token system that the components
  largely don't use.** `docs/admin-styling-contract.md` is excellent and mostly aspirational.
- **Consequence:** there is **no dark mode**, and there *cannot* be one until the hexes move to
  tokens. Same for white-labeling a SaaS customer's brand, and same for the print stylesheet
  (which overrides variables an inline hex can't see).
- **Page-size outliers** that will be painful to restyle or hand off:
  `research/[projectId]/page.tsx` (3,770 lines, 173 hexes), `pay-progression` (2,578),
  `equipment/maintenance/[id]` (2,569), `learn/manage/lesson-builder/[id]` (2,545),
  `equipment/inventory` (2,392), `receipts` (2,285).
- **Dead code:** `app/admin/profile/ProfilePanel.tsx` is still in the hex baseline though
  `/admin/profile` was consolidated away.

---

## 7. What's genuinely solid (don't touch)

- **API auth coverage.** Every one of the 340 `/api/admin` routes performs an auth check. The only
  unauthenticated routes are the intentional public ones (invoice pay, share token, webhooks,
  signup, NextAuth).
- **Route registry as data.** `lib/admin/route-registry.ts` is the right abstraction — breadcrumbs,
  ⌘K, rail, fly-outs and the audit test all derive from it.
- **The ratchet test pattern** (`inline-style-hex-ratchet.test.ts`). Pragmatic and honest.
- **Equipment subsystem.** Genuinely deep: templates + versions, reservations, maintenance history,
  consumables, valuation, overrides audit, cleanup queue.
- **Payments/finance foundation.** G1–G5 are all built and gated behind flags; only account
  activation remains.
- **The planning-doc discipline** (208 completed docs with a clear promotion rubric) is unusual
  and worth keeping.

---

## 8. Suggested sequencing

**Phase 0 — De-risk (before anything else)**
1. ✅ **DONE 2026-07-29.** Reconstructed the 76 missing table schemas into `seeds/`, verified
   column-for-column against production, guarded by a test. See §1.1.
2. ⚠ **TOOLING DONE 2026-08-01, project creation is owner-gated.** `--target staging` + a
   production-reset guard shipped; `npm run db:bootstrap:staging` does the rest once the Supabase
   project exists and `STAGING_DB_URL` is set. See §1.1.
3. ✅ **DONE 2026-08-01.** Per **D1**, nullable `org_id` now sits on the business tables — 53 → 126
   tables, via `seeds/513_org_scoping.sql`, backfilled to the single Starr org. See §1.2.
4. ✅ **DONE 2026-08-01.** Resolved the two phantom research tables (§1.1b) — neither built nor
   deleted: the real tables were `extracted_data_points` and `research_documents` all along.

**Phase 1 — Make it one product**
5. ✅ **DONE 2026-08-01.** All 35 orphan routes registered (§1.4), and the v2 flag is gone. The
   sidebar was NOT deleted — it is the mobile drawer; it now derives from the registry (§1.3).
6. Kill `/admin/dashboard`; make `/admin/me` the unambiguous home.
7. Consolidate Money (30 → ~6 surfaces) and People (10 → 1 profile + 1 directory).
8. Rename Billing/Invoicing/Finances to non-colliding words.

**Phase 1b — Unified document & record search (§3b, owner objective 2026-08-01)**

Placed here, ahead of Phase 2, deliberately: it is the surface that makes everything already built
*findable*, and every Phase 2 item (proposals, deliverables, change orders) adds documents that will
need to be found. Building it after them means retro-fitting search onto three more corpora.

8a. ✅ **DONE 2026-08-01.** Search backbone — `pg_trgm`, a normalised index over the nine document tables + the core
    business records, and one ranked query with permission + `org_id` filtering.
8b. ✅ **DONE 2026-08-01.** Filters — type / corpus / MIME, and created / modified / effective-date ranges.
8c. ✅ **DONE 2026-08-01.** Spelling-tolerant keyword ranking (trigram similarity + full-text, combined score).
8d. AI retrieval — embeddings over `extracted_text`, mirroring `fs_reference_chunks`; natural-language
    questions answered with cited documents, never with an unsourced summary.
8e. ✅ **DONE 2026-08-01.** One search UI, reachable from the rail and ⌘K, that returns documents and records together.

**Phase 1c — Sellable to other firms (§3c, owner objective 2026-08-01)**

8f. Bundle sweep — assign a `requiredBundle` to every admin route, API handler and mobile tab, gated
    **server-side**, with a ratchet so a new page cannot ship unassigned. (Today: 1 of 131 routes.)
8g. Make `org_id` load-bearing — scope every tenant query to it, not merely store it.
8h. Catalogue every hard-coded Starr assumption (`@starr-surveying.com`, branding, Bell-County-only
    lot verification) and turn each into a per-tenant setting.
8i. First-run onboarding for a firm with no data: empty states, setup wizard, non-Starr defaults.

**Phase 1d — Instrument integration (§3c.2)**

8j. LandXML import/export — one reader covering all five vendors for points, alignments and surfaces.
8k. Harden Trimble JobXML; extend the RW5 family to cover Topcon and Spectra Survey Pro explicitly.
8l. Leica GSI8/GSI16 reader (unlocks GeoMax with it).
8m. Instrument fleet register on `equipment_inventory` — make/model/serial + calibration certificates.
8n. Watched-folder ingestion — universal store-and-forward intake that works with all five vendors
    and needs no partner agreement. Two clocks on every point (measured-at, received-at).
8o. Trimble Connect poller — Object Sync cursor + configurable interval. The near-live path (§3d).
    Requires a per-firm Trimble Connect licence, which is a subscription-tier fact, not a setting.
8p. Our mobile app as the true-instant capture path — the only route to literally live points, and
    the only one with no vendor in the loop.
8q. ⏸ Topcon / Leica partnership conversations — **owner-gated**; open early, they are slow.

**Phase 2 — Close the business gaps**
9. Proposal → acceptance → job (with e-signature).
10. Customer portal (job status + deliverables + pay).
11. Deliverable revision control + AR aging + change orders.
12. Certification/insurance expiry alerting.

**Phase 3 — AI as the connective tissue**
13. `lib/ai/` — one client, one model config, one tool registry, one context digest.
14. One assistant dock with tool use, everywhere.
15. AI-fallback page help.
16. Proactive alerts.

**Phase 4 — Polish**
17. Pay down inline hexes on the top 20 files → tokens → dark mode.
18. Split the six >2,000-line pages.
19. Onboarding/empty states for a brand-new firm.

---

## 8b. Owner decisions — 2026-07-29

Answered by the owner in the audit session. These are settled; treat them as constraints.

- **D1 — Business model: internal now, SaaS later.** Ship single-tenant. Add `org_id` to the
  business tables **now** (nullable, defaulted to the Starr org) so the eventual multi-tenant
  migration is a backfill, not a rewrite. Do NOT delete `/platform`, `/admin/orgs`, bundle-gating
  or the operator console — they stay as the future path.
- **D2 — First work: schema reconstruction.** Dump the live DB, backfill the 78 missing
  `CREATE TABLE` statements into `seeds/`, stand up a staging DB from the repo, verify parity.
  Nothing else at scale until this exists.
- **D3 — Day-one workflows: all three spines must work.**
  1. Clock in → work → get paid
  2. Lead → job → invoice → paid
  3. Job → field data → CAD → deliverable
  Nothing outside these three is launch-critical.
- **D4 — AI scope: agentic intake with a human approval gate.** Specifically, the owner's stated
  target flow:
  > A request comes in from the front end. The AI **scrubs the query, gathers all pertinent info,
  > creates the job, and populates its details automatically.** Jacob or Hank then get a
  > **notification** summarising the inbound query with a **suggested quote amount**. If they
  > approve, the AI **runs the property research and saves it** for later viewing.

  Plus, generally: the AI takes notes, writes emails, answers questions about the site (pages,
  elements, how to use things) **and** answers general + complex surveying questions.

  **Design implications this creates:**
  - Job creation from an inbound lead is an *autonomous* write (no confirm) — so it needs to be
    reversible/soft-deleted and clearly marked `source: ai-intake` and `status: unconfirmed`.
  - Research kickoff is the **approval gate** (it costs money and time).
  - Quote suggestion needs a pricing model to ground on — see Q4/Q22; today nothing in the code
    computes a quote. This is a prerequisite, not a detail.
  - Notification must reach Jacob **and** Hank on a channel they actually watch (see Q-D4 below).
  - The "answer questions about pages and elements" requirement means the assistant needs the
    route registry + page context as grounding — which also fills the 150 empty help drawers.

  **New questions this raises (D4 follow-ups):**
  - **Q-D4a.** How should the suggested quote be computed — a rate table by survey type × acreage
    × county? Historical similar jobs? Your judgement encoded as rules? I need the actual pricing
    logic; I will not invent it.
  - **Q-D4b.** Which notification channel for the intake alert — in-app bell, email, SMS, or all
    three? How fast must it reach you?
  - **Q-D4c.** If the AI creates a job and you *reject* the lead, what happens to the job record —
    soft-delete, or a `rejected` stage?
  - **Q-D4d.** Can the AI reply to the customer automatically to acknowledge receipt, or does every
    outbound customer email wait for you?
  - **Q-D4e.** What's the monthly AI budget ceiling? Auto-research on every inbound lead is the
    most expensive thing in this design.
  - **Q-D4f.** Should the AI refuse to auto-create a job for obvious spam/solicitation, and what
    does it do with those?

---

## 9. Question bank

### Q1 — Business model (this changes everything downstream)
1. Is this **one firm's internal tool**, or **software you intend to sell to other surveying
   firms**? The `/platform`, `/admin/orgs`, billing, bundles and operator console say "sell it";
   the schema says "one firm."
2. If you're selling it: how many tenants in year one, and are they full firms or solo surveyors?
3. If selling — is Starr Surveying itself tenant #1 in the same database, or does it stay separate?
4. What's the pricing model you actually want (per-seat? per-firm? bundles as built)?
5. Does the D&D platform ship in the same repo/deploy forever, or does it get split out before you
   have paying customers looking at your app?

### Q2 — Launch scope & timing
6. What is the **actual launch date** you're aiming at, and who is the first real user besides you?
7. At launch, how many employees are on it? Which roles?
8. Is Hank (or whoever runs the business day-to-day) going to use this, and has he seen it?
9. What is the **one workflow** that must work perfectly on day one? (Clock in → work → get paid?
   Lead → job → invoice → paid?)
10. Are you replacing something today (spreadsheets? QuickBooks? paper?), and does data need to
    migrate in?
11. Is there a date by which you *must* be off the old system (tax year, contract, etc.)?

### Q3 — Data & operations
12. Are you comfortable that **`jobs` has no schema in the repo** and there's no staging DB? Should
    fixing that be the next thing I do?
13. Do you have Supabase PITR / backups turned on, and have you ever tested a restore?
14. How much real production data is in there now — is it live business data, or still test data?
15. Who else can access the Supabase dashboard?
16. If the database vanished tomorrow, what's the recovery plan?

### Q4 — Money
17. Does **QuickBooks / an accountant** need to consume anything from this? (That determines whether
    you need an export, or whether this *is* the books.)
18. Are employees W-2, 1099, or both? (The classification field exists — is it populated?)
19. Is payroll actually going to run through this app, or does a payroll provider do it and this
    just tracks hours?
20. Who currently sends invoices, and in what tool? Is `/admin/invoicing` replacing it?
21. Do you need **AR aging / collections** (who owes what, how late)?
22. Do you need **estimate vs actual job costing** — is knowing your per-job margin a launch
    requirement or a later nice-to-have?
23. Is the **Rewards/XP/pay-progression** system real company policy, or an experiment? (It's ~5,000
    lines and it isn't in the schema.)
24. Are you handling sales tax on any of this?

### Q5 — Customers
25. Do customers ever need to **log in**, or is email + a pay link enough forever?
26. Do you need a **signed proposal / contract** before work starts? How is that done today?
27. How do customers receive deliverables today (email a PDF? a link?), and do you need proof of
    delivery?
28. Do you need **change orders** tracked?
29. Should customers see job status ("field work complete, in drafting"), or is that too much
    transparency?
30. Who answers the phone / the contact form today, and how fast does a lead need a reply?

### Q6 — Field crew (the highest-stakes users)
31. Do crews have reliable cell service on your jobs? **How much must work fully offline?**
32. iPhone, Android, or both? Company phones or personal?
33. What do crews do today that this must replace — paper field notes? Texting photos?
34. Is the **mobile app** part of launch, or is the web app on a phone browser good enough for v1?
35. What's the single biggest daily annoyance for a crew member that software could remove?
36. Does clock-in need GPS/geofence enforcement, or is trust fine?
37. Who approves hours, and how fast does that need to happen relative to payroll?

### Q7 — Roles & access
38. Eleven roles exist (`admin, developer, teacher, student, researcher, drawer, field_crew,
    employee, guest, tech_support, equipment_manager`). **Which of these are real jobs at your
    company?** Several look like they came from the LMS.
39. `internalOnly` gates on `@starr-surveying.com` email. Will contractors/1099s have company
    emails? If not, they lose most of the app.
40. Is there a **role between employee and admin** — a foreman/PM who sees their crew's jobs and
    hours but not payroll?
41. Should an employee be able to see other employees' pay? Hours? Certifications?
42. Do you want the **custom role builder** (`/admin/roles/custom`) in the launch product, or is the
    fixed list simpler?

### Q8 — Navigation & IA
43. Do you agree `/admin/me` should be the single home page and `/admin/dashboard` should go?
44. Is **Work Mode** a full-screen mode you *enter*, or just a mobile-friendly view? (Right now it's
    ambiguous and has 9 routes.)
45. Are the six workspaces (Hub, Work, Equipment, Research & CAD, Knowledge, Office) the right six?
    I'd argue **Money** deserves its own and **Knowledge** could fold into Office for a working firm.
46. Do you want me to consolidate the People pages into one profile-with-tabs?
47. What should the **Billing / Invoicing / Finances** words become? (Suggestion: *Company Account* /
    *Customer Invoices* / *Job Profitability*.)
48. Should Discussions merge into Messages? Should Company Notes merge into Files?

### Q9 — AI
49. What are the **top five questions or tasks** you'd want an in-app assistant to handle on day one?
50. Should the assistant be allowed to **take actions** (create a job, log hours, send an email), or
    only answer questions and draft things for you to confirm?
51. Whose data can it see? Can a field crew member's assistant read job financials? Other people's
    hours?
52. What's an acceptable **monthly AI spend**? (That decides Haiku-vs-Sonnet-vs-Opus routing.)
53. Should I standardize every AI call on current Claude 5 models and one central config?
54. Do you want AI-generated help content for the 150 pages with none, or hand-written?
55. Do you want **proactive** AI (it messages you about problems), or strictly on-demand?
56. Is voice input for the field app a real requirement or a nice-to-have?
57. Is there anything the AI must **never** touch (payroll amounts, sending customer emails
    unreviewed, deleting anything)?

### Q10 — Learning platform
58. The LMS (modules, lessons, quizzes, flashcards, FS/RPLS exam prep, NMSU course) is a huge
    surface. **Is it part of the surveying business product, a separate product, or your personal
    study tool?**
59. If it ships: is it for your employees' CE/licensure, or for sale to students?
60. Does it belong in the same navigation as job dispatch, or should it be its own app?

### Q11 — Research & CAD
61. Is the automated county research pipeline running against real counties today, and what's its
    success rate?
62. When a county portal changes and scraping breaks, who notices? (Should I activate the
    self-healing adapter plan?)
63. Is Starr CAD meant to replace your real CAD, or supplement it? Do drafters actually use it?
64. Does research/CAD work need to be billable and tracked against job costs?

### Q12 — Compliance & risk
65. Do you need **license/certification expiry tracking with alerts** (RPLS renewal, CE hours, COI,
    vehicle inspection)?
66. Any records-retention requirement on survey deliverables (state board rules)?
67. Do you need an **immutable audit trail** on financial records for an accountant or auditor?
68. Is there PII you're storing (SSNs for 1099s, driver's licenses) and where does it live?
69. Do you carry E&O insurance that imposes any documentation requirements the software should
    enforce?

### Q13 — Quality bar & process
70. What's your tolerance for **breaking changes** once real employees depend on this daily?
71. Do you want a staging environment, or ship straight to production?
72. Should I keep the "one planning doc per initiative" process, or switch to something lighter?
73. How much of the **1,662 inline hexes** do you want paid down, and is **dark mode** something you
    actually want?
74. Are the six 2,000+ line page files worth splitting, or leave them alone if they work?
75. What should I do with `/admin/weather` — wire it into scheduling, or delete it?
