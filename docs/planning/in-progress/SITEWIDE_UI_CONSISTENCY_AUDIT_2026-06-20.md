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

## 3. Foundation slices (ship first — highest leverage)

- [ ] **F1 — Universal back / breadcrumb navigation.** Build a shared
  parent-route resolver so every admin route (including detail/`[id]`
  pages) has a deterministic parent. Extend `AdminPageHeader` (or add a
  sibling `<AdminBackCrumb>`) to always render a labeled trail that ends
  in a clickable parent, falling back to the workspace landing. Add a
  `parentHref`/`parentLabel` map in `lib/admin/route-registry.ts` (or a
  new `lib/admin/route-parents.ts`) covering the dynamic segments. Audit
  test asserts every `page.tsx` route resolves to a non-null parent.
  Verify breadcrumb renders on a registered page, an unregistered
  static page, and a `[id]` detail page (code-trace + one real-login
  spot check if creds available).
- [ ] **F2 — Icon / emoji consistency in shared chrome.** Replace
  emoji-as-functional-icon with lucide in the always-on shared
  components first: `AdminTopBar`, `AdminSidebar`, dashboard Quick
  Links, `FloatingActionMenu`/FAB, `DiscussionThreadButton`,
  `FloatingMessenger`. Keep emoji only where decorative. Establish a
  small `iconName → lucide` mapping helper if one doesn't exist. Screenshot
  before/after.
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

- [ ] **D1 — Dead-button / missing-functionality sweep.** Across the
  pages touched in W1–W6, list every `onClick` that no-ops or `TODO`s,
  every `<button>` with no handler, and every `<Link>`/`href` pointing
  at a route with no `page.tsx`. Fix the cheap ones inline; for any that
  need real feature work, file a one-line deferral with rationale.
- [ ] **D2 — Seeds verification + application.** Inventory `seeds/*.sql`
  vs live Supabase. Per `memory/project_apply_seeds_to_supabase.md`:
  apply with node-pg + `SUPABASE_DB_URL` (CLI paths fail), verify with
  PostgREST + service key. Apply any seed whose rows are missing live;
  record what was applied. Do NOT click role-mutating buttons during
  live verification (`memory/feedback_no_role_mutations.md`).

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
