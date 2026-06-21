# Sitewide UI Consistency, Responsiveness & Navigation Audit — 2026-06-20

> **Driver.** This doc is processed by the auto-continue Stop hook
> (`.claude/hooks/continue-until-planning-done.sh`, Phase 1). Each turn:
> pick the next unchecked slice (top-to-bottom), do the actual work,
> `npm run type-check` + `npm run lint`, commit + push, tick the box
> with a one-line completion note. When every slice is `[x]` or
> explicitly deferred (`~~struck~~ — deferred: <reason>`), move this
> doc to `docs/planning/completed/` per `docs/planning/README.md`.
>
> **Scope.** Every page under `app/admin/**` (145 routes) plus the
> public marketing/auth pages worth spot-checking. Goal: uniform
> styling, responsive layout at 1280 / 768 / 599 px, no clipped text
> or misaligned controls, consistent iconography, **clear and
> consistent back / up navigation on every page**, no dead buttons,
> and any missing seeds applied.

---

## 0. Why this exists (user request, 2026-06-20)

The user asked for a full sitewide pass: "go over the entire site and
all of the pages and actually use Playwright and OCR to review each
page … look for any weird formatting or styling … elements not being
aligned or text getting cut off or the wrong icons/emojis … make
everything more responsive and better formatted … consistent in
styling and formatting … some pages have a back link/button and many
don't — make navigation consistent and clear … look for buttons that
don't work, or missing functionality, or if any seeds need to be
applied. Keep doing passes until everything looks and functions
perfectly."

This is a **build** plan, not just a diagnosis. Unlike the read-only
`docs/sitewide-alignment-audit-prompt.md` (which produces a punch
list), every slice here ships a fix.

## 1. Audit methodology (how each slice verifies)

1. **Visual** — drive the page in Playwright via the env-gated UX
   harness so no live login is needed:
   - Start dev with the flag: `NEXT_PUBLIC_E2E_HARNESS=1 npm run dev`.
   - Visit `http://localhost:<port>/ux-harness?page=<key>&chrome=1`
     (registry of keys in `app/ux-harness/UxHarnessClient.tsx`).
   - Screenshot at **1280×900**, **768×1024**, **599×900**; read the
     PNG; note clipped text / overhang / misalignment.
   - **Harness limitation:** `usePathname()` is `/ux-harness`, so the
     breadcrumb/topbar-title chrome does NOT reflect the real route,
     and pages with a client role-redirect (e.g. `jobs`) bounce to a
     real `/admin/*` route. Audit nav chrome by **code review** of
     `AdminPageHeader` + `route-registry`, and detail/`[id]` pages by
     reading the JSX. Use the harness for page-body layout only.
2. **Code** — read the page `.tsx` + every CSS file it imports; match
   findings against the pattern catalog (§2); grep the page's class
   names against the imported CSS to catch unstyled classes.
3. **Functional** — click every button/link in the harness (or trace
   its handler in code); flag `onClick` no-ops and links to routes
   that 404.

## 2. Pattern catalog (known root causes — use as the rule set)

Carried over from `docs/sitewide-alignment-audit-prompt.md`; treat as
prior art. When a finding matches one, cite the number.

1. Marketing-form globals bleeding into admin (`input,textarea,select{
   width:100%; margin-bottom:1.5rem; padding:.875rem 1rem; border:2px}`)
   — reset lives in `AdminLayout.css`; inline-styled controls predating
   it may still carry the old shape.
2. Checkboxes/radios rendering as huge ovals (same root cause as #1).
3. Native date/time pickers taller than sibling buttons (intrinsic
   calendar chrome ~36–40 px) — pin every control in the row to one
   explicit height + `box-sizing:border-box`.
4. Filter rows mixing tall labeled-input columns with bare buttons —
   migrate to `.admin-form-row*` utilities (`align-items:flex-end;
   flex-wrap:wrap; action height:36px; flex-shrink:0`).
5. "Tabs" that are actually `<Link>`s (hard route nav, not in-place
   panel swap) — convert to `role="tablist"`+`tab`+`tabpanel`.
6. Floating header icons (help/star) stacking above page action buttons.
7. Tooltips/popups rendering as raw inline text (page-scoped CSS not
   loaded) — portal to `document.body`, CSS in `AdminLayout.css`.
8. Invisible navy-on-navy button text (BEM `__btn` not excluded from
   the anchor cascade in `AdminLayout.css`).
9. CSS imports that don't match the classes the page uses (page renders
   unstyled) — grep class names vs imported files.
10. Text cutoff on dropdowns from short height + missing `line-height`
    (descender clipping) — 36 px + `line-height:1.2`.
11. Pages rendering every section at once when one should be selected.

### Net-new patterns confirmed this audit

12. **Emoji used as functional/nav icons, clashing with the lucide
    line-icon system.** 202 / 438 admin `.tsx` files contain emoji or
    symbol glyphs (`node /tmp/emojiscan.cjs`). The IconRail + sidebar +
    breadcrumbs use lucide (`Home`, `Briefcase`, `Compass`…), but page
    bodies use emoji as the affordance — e.g. the `/admin/dashboard`
    Quick Links render 🎓 / flashcard / 📇 glyphs (screenshot
    `audit-dashboard2.png`). Inconsistent weight, baseline, and color;
    emoji also render differently per-OS. **Rule:** functional + nav
    icons = lucide; emoji allowed only as decorative accents, never as
    the sole affordance for an action or nav target.
14. **Inline `style={{}}` objects vs CSS files on the same page.** Pages
    that mix both (`/admin/contacts`, `/admin/team`, `/admin/field-data`,
    the old employees list) drift out of sync with sitewide CSS changes.
    Migrate hot inline styles to classes during each workspace sweep.
15. **Responsive breakpoints beyond 1280.** Real breaks happen at 1024
    (laptop), 768 (tablet), 599/414 (phone). Every sweep screenshots at
    1280 / 768 / 599 — not just 1280.
16. **Loading / empty / error states.** A page can look fine populated and
    broken when empty (ghost containers, mis-centered spinners). Audit all
    three states per page, not just the happy path.
17. **Modal / dialog form rows.** Dialogs copy-paste old form rows and
    inherit the §1–4 alignment bugs. Audit every modal's control row.
18. **Color contrast / WCAG AA.** Pattern 8 is one contrast bug framed as
    a cascade issue; do a general AA contrast pass (muted-on-white labels,
    status pills, navy-on-navy).
19. **Keyboard a11y on portals (tooltips, tabs, menus).** Billing tabs got
    Arrow nav; tooltips + other portal UIs still lack Esc-dismiss /
    focus-trap conventions.
20. **Form-submission feedback.** Buttons should show disabled + loading +
    success/error state while submitting. Audit primary actions for "does
    it tell me what it's doing?"
21. **Spacing rhythm + token drift.** Pages mix `8px / 12px / 0.85rem /
    1rem` gaps ad-hoc. Prefer the spacing tokens; flag raw values.
22. **Typography consistency.** `Sora,sans-serif` (no space/fallback) vs
    `'Sora', sans-serif` vs JetBrains Mono used ad-hoc. Normalize the
    font stacks during sweeps.

13. **No shared back/up-navigation affordance; breadcrumb coverage is
    partial.** `AdminPageHeader` only renders a labeled crumb when
    `findRoute(pathname)` resolves in `ADMIN_ROUTES`. Detail/`[id]`
    routes (job detail, equipment detail, research project, discussion
    thread, employee history, contact, template detail, …) are NOT in
    the registry, so they show at most the workspace crumb — no "back
    to list" affordance from the shared chrome. ~66 of 145 pages
    hand-roll their own "Back to X" link (79 have *some* pattern, 66 do
    not), with inconsistent copy (`← Back`, `‹`, `Back to …`,
    `router.back()`) and placement. Need a single shared component +
    a parent-route map so every page has one consistent up-link.

## 2.5 Direct user requests (priority — interleaved with foundation)

These were called out by the user mid-audit; handle ahead of the
per-workspace sweeps.

- [x] **U1 — Employee/student list redesign + prefix search.** Shipped
  `lib/admin/employee-search.ts` (`matchesPersonPrefix`): prefix-match on
  name words / email / local-part, used by BOTH the list view and the
  Interactive pond. List redesigned onto a dedicated `.emp-card` grid +
  36px-baseline search/filter row with lucide icons. 27 tests pass.
  Commit `79f53916`. (Note: harness can't render the role-gated page with
  data — the mock session resolves as `employee`; verified by unit tests
  + live by the user.)
- [x] **U2 — Credential-bonus projected-salary overflow.** Root cause:
  `.pay-prog__badge-meta` (pay-progression credentials gallery) is a
  `space-between` flex row holding the green "+$X/hr" bonus + the navy
  "→ $XX.XX/hr" projected-rate pill, both `nowrap`, with no wrap/shrink —
  in a 220px badge track they overflowed the card. Fixed in
  `AdminRewards.css` with `flex-wrap: wrap` + `min-width: 0` so the pill
  drops below the bonus instead of spilling out. (CredentialBadge,
  `page.tsx:2131`.)

## 3. Foundation slices (ship first — highest leverage)

- [x] **F1 — Universal back / breadcrumb navigation.** `breadcrumbTrail()`
  / `parentCrumb()` / `routeLabel()` added to `lib/admin/route-registry.ts`
  (prefix-chain resolver: workspace landing → registered ancestors →
  derived leaf). `AdminPageHeader` now renders the full trail + a leading
  "‹ back" button on every admin route incl. detail/`[id]` pages. 11 new
  unit tests lock it (incl. every registered route → non-empty trail).
  Mobile rule drops the back-label. Commit `639d5961`. Visual spot-check
  deferred to per-workspace slices (harness `usePathname` is `/ux-harness`
  so the chrome can't render the real trail; logic is unit-verified).
- [ ] **F2 — Icon / emoji consistency in shared chrome.** Replace
  emoji-as-functional-icon with lucide in the always-on shared
  components. Keep emoji only where decorative.
  - [x] Dashboard cards (🎓📋🔬💰📅) + Quick Links (🎓🃏📝📊🔍📓✏️🔬📐👥🔑)
    + pending banner (🔔) → lucide (GraduationCap/ClipboardList/Microscope/
    Wallet/Calendar/Layers/ClipboardCheck/BarChart3/BookOpen/BookMarked/
    SquarePen/DraftingCompass/Users/KeyRound/Bell). Verified in harness.
  - [ ] `AdminSidebar` (legacy drawer — 📊🎓🗺️📚… nav icons), `AdminTopBar`,
    `FloatingActionMenu`/FAB, `DiscussionThreadButton`, `FloatingMessenger`.
  - [ ] **Follow-up infra:** add a registry-driven `iconName → lucide`
    resolver (`lib/admin/route-icons.tsx`) so the registry's `iconName`
    strings render everywhere; IconRail only maps the 6 workspaces today.
- [ ] **F3 — Control-row + responsive utilities sweep.** Confirm the
  `AdminLayout.css` globals reset covers every input type (text, date,
  time, checkbox, radio, select, file). Verify the 36 px control
  baseline + `.admin-form-row*` utilities exist and are correct. Grep
  for filter/action rows still hand-rolled with inline
  `style={{display:'flex'…}}` (36 page.tsx files) and list them for the
  per-workspace slices. Add any missing `@media` rules where a known
  page overflows below 1100 px.
- [ ] **F4 — Update the styling contract.** Extend
  `docs/admin-styling-contract.md` with three new sections: (a) the
  back/up-navigation rule (every page uses the shared crumb; no
  hand-rolled back links), (b) the icon rule (lucide for functional/nav;
  emoji decorative-only), (c) the control-height + `.admin-form-row`
  rule. This is the reference the per-workspace slices enforce against.

## 4. Per-workspace sweeps (one slice each; visual + functional + nav)

Each slice: run the Playwright harness pass at all three widths over
the workspace's pages, fix every §2 finding, ensure F1 back-nav is
present, replace stray emoji per F2, migrate hand-rolled filter rows
per F3, and click every button to catch dead handlers. Record a
per-page note in §6.

- [ ] **W1 — Hub workspace.** `/admin/me`, `dashboard`, `assignments`,
  `schedule`, `time-off`, `my-files`, `learn/fieldbook`, and the
  `/admin/me` tab panels (pay, hours, jobs, notes, profile).
- [ ] **W2 — Work workspace.** `work`, `jobs`, `jobs/new`,
  `jobs/import`, `jobs/[id]` detail, `calendar`, `field-data`,
  `field-data/[id]`, `team`, `timeline`, `assignments`.
- [ ] **W3 — Equipment workspace.** `equipment` + `inventory`,
  `consumables`, `maintenance` (+`[id]`), `timeline`, `fleet-valuation`,
  `overrides`, `templates` (+`new`/`[id]`/`cleanup-queue`), `today`,
  `import`, `vehicles`.
- [ ] **W4 — Research & CAD workspace.** `research-cad`, `research` +
  `new`/`billing`/`coverage`/`library`/`pipeline`/`testing`,
  `research/[id]`. (CAD editor `/admin/cad` owns its own chrome — audit
  its title-bar + dialogs only for icon/cutoff issues, do not touch its
  layout shell.)
- [ ] **W5 — Knowledge / Learn workspace.** `learn` hub + `roadmap`,
  `modules` (+detail), `knowledge-base` (+article), `flashcards`
  (+`create`/`[deck]`), `flashcard-bank`, `exam-prep` (+`sit`/`rpls`/
  mock-exam), `search`, `quiz-history`, `students` (+detail), `manage`
  (+`question-builder`/`media`/`article-editor`), `practice`.
- [ ] **W6 — Office workspace.** `office`, `billing` (+`invoices`/
  `plan-history`/`upgrade`), `payroll` (+detail), `payout-log`,
  `payouts`, `employees` (+`manage`/history), `users`, `invites`,
  `org-settings`, `orgs`, `reports`, `leads`, `contacts`, `receipts`,
  `mileage`, `finances`, `notes`, `settings`, `support` (+`new`),
  `audit`, `error-log`, `announcements`, `messages` (+`new`/`contacts`/
  `settings`), `discussions` (+`[id]`), `hours-approval`, `rewards`
  (+`store`/`admin`/`how-it-works`), `pay-progression`.

## 5. Functional + data slices

- [x] **D0 — Production error-report triage (user-supplied, 2026-06-21).**
  Fixed `/admin/research/billing` crash (API/view-model contract mismatch
  → adapter) and added a global benign-error filter (ResizeObserver loop /
  cross-origin "Script error.") in `ErrorProvider`. Verified-not-a-bug:
  research/[projectId] "Failed to fetch" (transient, caught) and
  research_projects "schema cache" (stale — table exists live, HTTP 200).
  Commit `5cdbe4d5`.
- [ ] **D1 — Dead-button / missing-functionality sweep.** Across the
  pages touched in W1–W6, list every `onClick` that no-ops or `TODO`s,
  every `<button>` with no handler, and every `<Link>`/`href` pointing
  at a route with no `page.tsx`. Fix the cheap ones inline; for any that
  need real feature work, file a one-line deferral with rationale.
- [x] **D2 — Seeds verification + application.** Built `npm run db:seed`
  (one-command node-pg runner, ordered, excludes destructive 000_reset) +
  `db:seed:all` (continue-on-error). Ran against live 2026-06-21:
  **127/172 applied, 45 skipped**, all categorized:
  - **Already-applied (≈8)** — 020 (flashcards dup-key), 093–098/210
    (policy/trigger "already exists"). No action — objects are live.
  - **Storage-bucket ownership (3)** — 102/290/295 "must be owner of table
    objects". The pooler role can't alter `storage.objects` RLS; apply
    these via the Supabase SQL editor (privileged) if the buckets/policies
    are actually missing.
  - **Curriculum buildout FK (28)** — 332–359 `buildout_mNN` FK-violate
    `lesson_blocks_lesson_id_fkey`: stale static files referencing lesson
    ids that don't match the live curriculum (built via the gen_seed
    pipeline). Content already live; files are a redundant path.
  - **Genuine drift to reconcile (later):** 101_fieldbook_tables (42601
    syntax error), 226_starr_field_files (live `job_files` lacks `name`
    col), and the payment seeds 323–326 (= deferred G3, invoices-schema
    drift). Tables already live; these need deliberate per-file
    reconciliation, not a bulk apply.

## 5.5 Session-surfaced open work (from the user's gap list)

- [ ] **G1 — Badges expansion + Safety-course badges.** System mapped: 18
  current badges, 28 modules, OSHA/HAZWOPER/First-Aid credentials exist
  but zero Safety badges. Add the missing badge seed rows (with
  appropriate lucide/emoji icons consistent with F2) to
  `seeds/001_config.sql` (~lines 26–45) + apply per D2.
- [ ] **G2 — Pay Progression visual polish.** The broken `AdminRewards.css`
  import was already fixed so the page renders, but the hero card,
  work-type grid, role ladder, and timeline still want a deliberate
  design pass (coloring + alignment per the user's "good coloring and
  perfect alignment"). Overlaps with U2 (do U2's overflow fix first).
- ~~G3 — Payment seeds 323–327~~ — **deferred: BLOCKED on a human decision
  (live Stripe billing).** Root-caused 2026-06-21: `invoices` is a
  two-feature table-name collision — live = Stripe SaaS billing schema;
  seed 323 = customer `/pay` job-invoicing schema. Feature B is already
  broken on live and seeds 323-327 can't apply. The `webhooks/stripe`
  route uses BOTH meanings, so a blind rename could break real payments.
  Full turnkey reconciliation spec (exact rename + 18 repoint sites + the
  required Stripe test) written to `docs/payments-invoices-collision-2026-06-21.md`.
  Needs the user's go-ahead (rename Feature B → `customer_invoices`, or
  delete the deprecated `/pay` feature). Not auto-applied — guardrail:
  hard-to-reverse + outward-facing (live billing).

## 5.6 Research-software deep analysis (user request 2026-06-21)

- [ ] **R1 — AI property-research software analysis + optimization
  roadmap.** After the styling sweep, do a thorough analysis of the
  property-research subsystem (`app/admin/research/**`,
  `app/api/admin/research/**`, `lib/research/**`, the recon graph,
  county-data adapters, the AI pipeline, deeds/legal-description/plat
  parsing). Understand the current architecture + how the user intends it
  to work, then produce a dedicated analysis doc
  (`docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md`)
  cataloguing: pipeline stages + failure modes, Texas county-system
  integration coverage + gaps, data-quality/accuracy levers, AI-cost +
  latency optimizations, and a prioritized roadmap toward a packageable,
  sellable product with maximal Texas-county integration. Analysis +
  roadmap only (no feature build in this slice); the roadmap spawns its
  own phase doc(s).

## 6. Per-page findings ledger (filled in as slices run)

| Route | Width(s) affected | Pattern | Symptom | Fixed in slice |
|-------|-------------------|---------|---------|----------------|
| /admin/dashboard | all | 12 | Quick-Links use emoji 🎓/📇 not lucide | _pending W1/F2_ |
| _(append rows as found)_ | | | | |

## 7. Deferral rubric

Defer a slice/item only when implementation cost clearly exceeds value;
strike it with `~~…~~ — deferred: <reason>`. Do NOT defer just to empty
the folder. Candidate deferrals: the CAD editor's internal canvas layout
(owns bespoke chrome, separately specced), and any net-new feature work
surfaced by D1 that belongs in its own phase doc.

## 8. Guardrails

- Never click Approve / Demote / Promote / Ban / Grant-role / Delete-user
  or similar during live verification (`memory/feedback_no_role_mutations.md`).
- Keep slices small + shippable: typecheck + lint + commit + push each.
- Don't redesign (no "make buttons pill-shaped") — layout/functional/
  consistency fixes only.
</content>
</invoke>
