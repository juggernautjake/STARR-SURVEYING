# Planning documents: what is still on the table

Reviewed 2026-10-23, branch `claude/feature-catalogue`. Machine-readable version: `plans.json` (51 entries, schema in the task). Evidence is a grep or file reference in each entry.

Owner's frame: **make it super functional and easy to use, and make it work for tons of surveying firms nationwide.**

## How the planning folders look

- `pending/` 6 files, `in-progress/` 5, `obsolete/` 2, `completed/` 273 (about 100 are D&D, tutor or character-builder docs and were skipped). The task said 7 pending; this worktree has 6. The seventh, `pending/CHECK_PRINTING_2026-10-11.md`, exists only as an untracked file in the main checkout (STARR-SURVEYING, branch `claude/job-property-id-2026-10-14`). I diffed that checkout's `docs/planning/**` against this worktree and it is the only extra plan. It is in `plans.json` with `branch: unmerged`.
- Method: unchecked boxes, "deferred", "owner", "not built" greps, then reading only those sections, then a code grep per item.
- Four plans carry most of the open work, and none of them is in `pending/`: `completed/PLATFORM_AUDIT_AND_LAUNCH_QUESTIONS_2026-07-29.md`, `completed/STARR_SAAS_MASTER_PLAN.md` with its sub-plans, `planning/BLOCKERS.md`, and `completed/STARR_CAD_MASTER_PLAN.md`.
- Side projects D&D (`dnd`) and AndrewAsh exist, are parked by owner direction, and were not reviewed (entry `plan.office-supporting-dnd-andrewash`).

The headline: **most of what the plans ask for is already built.** The audit's phases 0 to 5 (search, bundles, org scoping, LandXML/JobXML/GSI readers, proposals, customer portal, compliance register, AR aging, change orders, assistant) are marked done and mostly check out in code. What remains is (a) work that needs an owner account or decision, (b) the consolidation the audit asked for but only labelled, and (c) the nationwide layer, which no plan owns.

## What's still open, grouped by area

Status key: NS not started, P partial, B blocked on owner, O obsolete. Effort S/M/L/XL.

### Platform (foundations and nationwide)

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| Information architecture: real workspace landings, one Money home, one People home | P | L | decision: Money tab names, Work Mode as mode or view |
| State and jurisdiction config (law, units, registry, closure tolerance, tax, forms) | NS | XL | decision: which second state |
| Finish removing Starr/Belton/Bell hard-coding (audit still lists 67 files, 119 refs) | P | M | none |
| External sign-in, invite acceptance page, remove `ADMIN_EMAILS` / domain lock (A-9c, A-10) | P | M | none |
| Staging DB, test tenant, isolation tests, a runner for `verify:org-scope` | B | M | owner account; CI-secret decision |
| Stripe writes: plan change, refund, dunning, reconcile, price ids, wildcard DNS | B | L | Stripe products, pricing |
| Operator and portal leftovers: impersonation, knowledge base, SLA, logo upload, data export/delete | P | L | first real need |
| Mobile app multi-tenant, org switcher, store release | B | L | A-9c, Apple/Google accounts |
| Help-drawer coverage (7 hand-written entries) | P | M | who curates help |
| Unmerged finished work (sales tax, job-lifecycle, receipt-reading-v2, payroll helper) | P | M | per-branch decision |
| Research page state store (3,600-line component) | NS | L | fold into research UI decision |
| Page Designer catalogue (46% of elements named) | P | M | after IA |
| Owner-only chores (Doppler, Voyage key revoke, worker auto-updater, cancel Browserbase/iDocket/Mapbox) | B | S | owner |

### Research

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| Curate counties in the owner's order (Williamson done as profile; Austin ring, Waco ring, Conroe/Huntsville/College Station next) | P | XL | golden parcels |
| County drills, canaries, regression harness | NS | L | cadence decision, golden parcels |
| Collapse nine county registries into profiles | P | M | none |
| Bell CAD geo-block (Browserbase on for the CAD adapter, or cancel it) | B | S | owner decision |
| First paid document purchase, captcha policy and key | B | S | owner authorisation |
| Aggregate spend cap before the queue poller is switched on | NS | S | owner decision |
| Bell plat catalogue: 7,839 left, about $345 | P | M | Anthropic credit |
| Lot verification beyond Bell | P | M | none |
| Starr Archive (filing-cabinet intake, scan station, triage) | NS | XL | go-ahead, hardware |
| Probe side-by-side confirm | NS | S | enable probe |

### CAD

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| A current CAD rebuild plan (the April master plan is 150+ slices stale) | P | XL | rebuild-or-continue decision; drafter standards interview |
| Desktop app: remaining Tauri slices, signing | P | M | Apple/Windows signing |
| Live point streaming from the collector (Trimble Connect or plug-in) | B | L | Trimble Connect Business + OAuth |
| Topcon/Leica partnerships and cloud APIs | B | L | owner conversations |

Not found in code and listed in the old master plan: basis-selection workspace, stake-out export, per-firm policy editor, DXF round-trip QA suite. Calculator registry, six-stage AI engine, seal engine and RPLS workflow do exist.

### Jobs

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| Jobs model as per-firm configuration (survey types, stages, templates) | NS | L | canonical pipeline decision |
| Agentic intake: request to job, suggested quote, approval, research | P | L | **pricing logic** (no code computes a quote) |
| Jobs/map/research: twelve unanswered design questions | P | L | owner Q&A |
| GPS-tagged capture from the phone, video path with moving node | P | L | device test |
| Interactive map phases 2b to 8 (boxes stale; map PDF export not found) | P | L | none |
| Estimate versus actual costing | NS | M | quote model |
| Weather as scheduling input | NS | S | none |
| Mobile background upload runtime | B | M | device build |

### People

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| One person record plus directory (employees, users, team, personnel, contacts still separate) | P | M | none |
| Hours as one time model; fewer calendars; state-specific overtime and pay periods | P | L | S8 decision; state config |
| Graduated pay (built, parked) | B | S | policy decision |

### Money

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| Real payments go-live (M1 to M7, `PAYMENTS_LIVE`) | B | S | Stripe/PNC/Venmo logins |
| Payout autopilot go-live (PayPal Business, ACH id, check stock, fee policy) | B | S | owner accounts, CPA |
| Withholding and pay statements (S9b/S9c) | B | XL | accountant answer |
| Payment handles and payment settings in `org_settings` | NS | M | none |
| Texas sales tax and deadlines (unmerged) | P | M | merge decision |
| Printed paychecks: Positive Pay, MICR test (plan only in main checkout, unmerged; mostly built since) | P | S | check stock, PNC file spec, withholding |
| Address mileage (server Google key) | B | S | owner creates key |
| Holding balances / investing | NS | XL | legal, partner; poor fit nationwide |

### Office

| Idea | Status | Effort | Blocked by |
|---|---|---|---|
| "How To" guide videos (no plan exists) | NS | L | stable IA, production method |
| Communication surfaces: actually merge discussions into messages, notes into files | P | M | none |
| Marketing/SEO owner items (M1 to M4, G1 to G4) | B | S | owner logins, content |
| Phone-call plan from BLOCKERS | O | n/a | superseded by receptionist build |
| Google integration plan | O | n/a | already in `obsolete/` |

## Owner decisions still pending

Everything below converts directly to work. Grouped by what it unblocks.

**Shape of the product**
1. Which second state should the config layer be designed against (a real prospect, not a guess).
2. Rebuild CAD or keep slicing; and a session with Hank on drafting standards (the master plan calls it non-optional).
3. Canonical lead-to-cash pipeline stages and survey types.
4. Names for the Money tabs, and whether Work Mode is a mode or a view.
5. Who curates help text.
6. The twelve jobs/map questions (layers versus point types, CSV coordinate zone, EXIF, manifest/ZIP, delete or bridge `field_data_points`, prefill, hidden field-data nav).

**Money and accounts**
7. Quote pricing logic (rate table, past jobs, or rules) plus intake notification channel, auto-reply policy, AI budget, reject behaviour (Q-D4a to f).
8. Does the firm withhold; employees or contractors (gates S9b/S9c).
9. Browserbase for Bell CAD: keep (one adapter) or cancel.
10. Authorise one paid research run; which counties may be captcha-solved.
11. Aggregate spend cap (or accept the vendor balance as the cap).
12. Stripe products, prices and subdomain DNS; Apple, Play and signing accounts; a staging Supabase project.
13. Trimble Connect Business subscription (gates point streaming).
14. Run `verify:org-scope` in CI (DB secret in CI) or as a cron route.
15. Merge, cherry-pick or delete the unmerged branches.
16. Payroll S8 auto-transfer; whether pay progression is real policy.
17. Drill cadence and whether drills may open clerk viewers; golden parcels per county.
18. Go-ahead for Starr Archive, including scanner and OCR choice.

**Smaller, from older docs, mostly D&D-adjacent** (Intuitive Games class taxonomy, off-roster powers) are listed in BLOCKERS section A to C and ignored here.

## Duplicates and conflicts between plans

- **Jobs and map: two overlapping plans.** `interactive-property-map` (phases 0 to 8), `gps-capture` and `jobs-map-research-consolidation` all define how captures become map points. The consolidation review's own section 10 withdraws its earlier "delete the ingest stack" recommendation, and the GPS plan puts coordinates on the file while the map plan puts them on the point. Treat the GPS plan's "file owns the capture, point is derived" as the rule.
- **Payroll: two engines, one decided.** `PAYROLL_HOURS_AND_EMPLOYEE_MONEY` (D2: `payout_batches` survives, `payroll_runs` becomes read-only history) versus `payouts-and-holding-money` and `PAYOUT_AUTOPILOT` (which extend `payout_batches`). Consistent, but the legacy route cannot close until S9b.
- **Two county-source stories.** `COUNTY_CURATION_SYSTEM` (profiles) conflicts in spirit with the nine registries it lists, and `RESEARCH_RELIABILITY_AND_COUNTIES` / `Self_healing_adapter_system_plan` predate it. Profiles win; registries should derive.
- **Two plat/library catalogues.** `plat-catalogue-resume` (research library) and `starr-archive.md` (intake and index) both want searchable job and plat records with identity keys. Archive should reuse the catalogue's four-witness verification instead of re-inventing it.
- **Research kickoff versus intake approval.** The agentic-intake design (approval gates research) overlaps `RESEARCH_FLOW_AND_SCOPE_GUARD`; one gate should be authoritative.
- **Multi-tenancy plan versus reality.** `MULTI_TENANCY_FOUNDATION` says `org_id NOT NULL` and a removed feature flag; the audit chose nullable `org_id` with a backfill and no flag, then seed 517 added DEFAULTs. Definition-of-done lists in the sub-plans are not true as written.
- **Money naming.** "Billing" (software subscription), "Invoicing" (customer invoices), "Finances" (job profitability) collide; the Money consolidation was proposed but not done.
- **SaaS plan versus owner decision D1.** Plan: sell now, tenants, subdomains. D1 (2026-07-29): "internal now, SaaS later". The product vision in this request reverses D1 again; confirm.

## Plans that are stale

- `BLOCKERS.md` header and its phone-call section: calls are built (`lib/receptionist`). The "unmerged" inventory (A0000) is dated 2026-08-29; several of its branches have since landed.
- `docs/payments-invoices-collision-2026-06-21.md` ("BLOCKED on a human decision"): seeds now use `customer_invoices`; the collision was resolved.
- `completed/ADMIN_NAVIGATION_REDESIGN.md` carries about 37 unchecked boxes under a "Closed" banner; `AdminSidebar` was kept as the mobile drawer, so "deleted" boxes are wrong.
- `completed/PLAN.md` (137 boxes): superseded in its own banner. `completed/STARR_RECON/*` phase files (about 120 boxes) are marked COMPLETE; the boxes are historical.
- `completed/STARR_CAD_MASTER_PLAN.md`: canonical but dated 2026-04-30; see CAD rebuild entry.
- `completed/MULTI_TENANCY_FOUNDATION.md`, `MOBILE_MULTI_TENANT.md`, `OPERATOR_CONSOLE.md`, `CUSTOMER_PORTAL.md`, `SUBSCRIPTION_BILLING_SYSTEM.md`: still headed "RFC" or "target path in-progress"; they sit in `completed/` but contain the deferred list above.
- `planning/README.md` says the Phase-N spec sets sit in `in-progress/`; they are in `completed/`.
- `in-progress/` contents are stale labels: Payout Autopilot says "Not merged" yet its commits are in main history; map and capture docs hold checkboxes for features whose code exists.
- `docs/platform/STARR_SOFTWARE_SUITE.md` (April 2026): names Starr Orbit, Atlas, Compass as reserved with no code, and cites paths (`in-progress/STARR_CAD/`) that moved. Pricing tiers there ($99/$299) disagree with the SaaS plan ($49 to $499).
- `docs/HANDOFF_TO_CLAUDE_DESKTOP.md`: a one-off handoff prompt about slices 24 to 32; not a plan.
- `QA_CHECKLIST.md`: all 83 boxes ticked; nothing open.
- `obsolete/`: `auto_drawing_agent_plan.md` is a byte duplicate and past its grace period; `GOOGLE_INTEGRATION` already obsolete.
- `docs/planning/completed` has no plan docs after 2026-09-15, although payouts, receptionist, receipts v2 and boundary/improvements shipped in October. **Docs lag code**; the repo, not the plans, is the source of truth for recent work.

## Proposed order of attack

The principle: do first the things that make every later thing cheaper and do not fork Starr from the multi-firm product. Do the owner-only chores in parallel (step 0) because they cost a few hours and unblock real money.

### Step 0. Owner chores, in parallel, this week (S)
Set `PAYMENTS_LIVE` path (M1 to M7), Google server key, decide Browserbase for Bell CAD, revoke the old Voyage key, install the worker auto-updater, authorise one paid research run, cancel unused services. **Unlocks:** the first real online payment, Bell data in every run, proof the purchase path works, saved money.

### Step 1. Foundations that make everything easier (L total)
1. **Information architecture and navigation.** Real workspace landings, one Money home, one People home, merge discussions into messages. Reason: every later feature, help article and video is placed and named here; doing it later means redoing screenshots, help and videos. It is also the first thing any new firm judges. **Unlocks:** help text, onboarding, videos, the page catalogue.
2. **The jobs model as configuration.** Survey types, stages, templates, deliverables per firm. Reason: jobs are the spine of the three day-one workflows (clock to pay, lead to cash, job to deliverable); research, CAD, hours and pricing all key off them. **Unlocks:** agentic intake, costing, per-firm CAD standards.
3. **Hours as one time model**, with the state-rule hooks left open. Reason: hours are the highest-frequency action and feed payroll; they are already mostly built, so this is consolidation plus config. **Unlocks:** payroll and payouts that behave for other states.
4. **Finish the unmerged work decisions** (sales tax, job-lifecycle, receipt-reading-v2) so nothing drifts further.

### Step 2. Tenant and state configuration (L to XL)
Remove the remaining Starr/Bell hard-coding (67 files), move payment handles and payment settings to `org_settings`, build external sign-in and the invite acceptance page, create the staging project and a second test tenant with isolation tests running automatically, then design the state config layer against one real second state (start by lifting Texas sales tax and TBPELS rules into it). Reason: until a second firm can sign in, see only its own data, and see its own names and rules, nothing else is sellable. **Unlocks:** onboarding a pilot firm, Stripe billing, the mobile org switcher.

### Step 3. The two pillars
- **Texas research coverage.** Williamson is a profile only; add golden parcels and the drill (weekly, free, no purchases) first so each new county is provable, then roll through the Austin ring, Waco ring, then Conroe/Huntsville/College Station in the owner's order. Fold the nine registries into profiles on the way. Add the aggregate spend cap before turning on the queue poller. Finish the Bell plat catalogue when credit is topped up. Reason: this is the differentiator, and trust in it depends on drift detection. **Unlocks:** coverage claims you can defend, and the county-profile pattern for other states.
- **CAD rebuild planning.** Write the one current plan: keep list from the 150+ slices, the tool dispatcher and method registry, document ingestion, calculated points and basis workspace, sealing, firm policy as data. Book the drafter-standards session before writing it. Reason: the master plan is from April and the code has moved on; a rebuild decision costs nothing to make now and a lot to make late. **Unlocks:** the CAD scope for step 4 and policy-driven standards for other states.

### Step 4. Integrations, money rails and the field
Stripe subscription writes and pricing; payout autopilot go-live (PayPal Business, ACH, checks); withholding via a payroll partner if the accountant says yes; Trimble Connect (only if the subscription is bought) and vendor cloud APIs; mobile multi-tenant and the store release; GPS capture on real devices and the interactive map phases; estimate versus actual costing. Reason: each needs an account or decision, and each is worth more once the tenant layer exists. **Unlocks:** revenue, field adoption, a credible hardware story.

### Step 5. Adoption layer
Help coverage for every page, then the "How To" guide videos (screen recordings of the stable UI, linked from help drawers and first-run onboarding), Starr Archive as the "bring your paper over" feature, marketing, Page Designer catalogue. Reason: videos and help describe screens that must stop moving; the archive is large and best built tenant-scoped on the finished base. **Unlocks:** self-serve onboarding, which is what scales to "tons of firms".

### Step 6. Later or never
Holding employee balances and investing (state-by-state money transmission, poor fit for a multi-firm product). D&D and AndrewAsh remain parked.

## Caveats

- Status calls rest on greps and file reads, not on running the app; each entry's `evidence` field says what was checked. Box counts in older completed plans are mostly stale, and I did not verify live database state (canary rows, unmerged branch contents).
- I did not read the full 273 completed plans; about 170 non-D&D docs were scanned by greps for open markers, and the long ones listed above were read at the relevant sections.
