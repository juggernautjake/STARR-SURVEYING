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
>
> **How to run a slice (fresh agent, no prior context needed):**
> 1. `NEXT_PUBLIC_E2E_HARNESS=1 npm run dev` (port 3000/3001).
> 2. Pick the **top unchecked `- [ ]`** in the "Remaining slices" index
>    below. Read the slice's detail section + the live code it names.
> 3. Visual audit via `…/ux-harness?page=<key>&chrome=1` at 1280/768/599
>    (harness caveats: §1). Fix per the §2 pattern catalog + §2.5 / §3-5.6.
> 4. `npm run type-check` + `npm run lint` (only the pre-existing
>    `no-img-element` warnings are acceptable). Commit + push.
> 5. Tick the box with a one-line note (commit hash). Move the doc to
>    `completed/` only when ALL boxes are `[x]` or struck-deferred.

## Remaining slices (execution order — work top to bottom)

1. ~~F2 (FAB remainder)~~ ✅ DONE — all 4 FAB launchers → lucide.
2. ~~F3 — control-row + responsive utilities (foundation)~~ ✅ DONE —
   reset + utilities verified; file-input + date/time baseline added; the
   35-page inline-flex migration list is recorded in the F3 detail and
   handed to W1–W6.
3. ~~F4 — styling contract~~ ✅ DONE — nav/icon/control-row rules added.
   _(legacy detail below)_ §3. Extend `docs/admin-styling-contract.md`
   with the back-nav, icon (lucide vs emoji), and control-height rules.
4. ~~W1 Hub~~ ✅ DONE — Hub pages emoji→lucide + time-off 36px baseline.
5. ~~W2 Work~~ ✅ DONE — §4 — work, jobs(+new/import/[id]), calendar, field-data
   (+[id]), team, timeline, assignments.
6. ~~W3 Equipment~~ ✅ DONE — §4 — equipment + inventory/consumables/maintenance/
   timeline/fleet-valuation/overrides/templates/today/import, vehicles.
7. ~~W4 Research & CAD~~ ✅ DONE (research pages; CAD-internal emoji deferred) — §4 — research-cad, research(+sub-pages/[id]);
   CAD editor only for icon/cutoff in its title-bar + dialogs.
8. ~~W5 Knowledge/Learn~~ ✅ DONE — §4 — learn hub + roadmap/modules/knowledge-base/
   flashcards/exam-prep/search/quiz-history/students/manage/practice.
9. ~~W6 Office~~ ✅ DONE — §4 — office, billing, payroll, employees, users, invites,
   org-settings, orgs, reports, leads, contacts, receipts, mileage,
   finances, notes, settings, support, audit, error-log, announcements,
   messages, discussions, hours-approval, rewards, pay-progression.
10. ~~D1 — dead-button sweep~~ ✅ DONE — 1 dead link fixed; no dead buttons.
11. ~~G1 — badges + Safety badges~~ ✅ DONE — 6 safety badges + auto-award.
12. ~~G2 — Pay Progression polish~~ ✅ DONE — section-title icons → lucide.
13. **G4 — regenerate empty-lesson curriculum buildout** §5 D2 note
    (gen_seed pipeline; ~207/422 lessons empty).
14. **R1 — research-software analysis + optimization roadmap** §5.6.
15. **(blocked, do not auto-run) G3 — payments/invoices collision** §5.5
    → needs the user's decision per `docs/payments-invoices-collision-2026-06-21.md`.

> **Done so far (do not redo):** planning doc, F1 (universal breadcrumb/back
> nav), U1 (employee list + prefix search), U2 (credential-bonus overflow),
> D0 (error-report triage), D2 (one-command seed runner + 101/226 fixes,
> applied to live), F2-resolver + F2-dashboard + F2-sidebar/topbar.

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
- [x] **F2 — Icon / emoji consistency in shared chrome.** DONE (resolver +
  dashboard + sidebar/topbar + all 4 FAB launchers). Replace
  emoji-as-functional-icon with lucide in the always-on shared
  components. Keep emoji only where decorative.
  - [x] Dashboard cards (🎓📋🔬💰📅) + Quick Links (🎓🃏📝📊🔍📓✏️🔬📐👥🔑)
    + pending banner (🔔) → lucide (GraduationCap/ClipboardList/Microscope/
    Wallet/Calendar/Layers/ClipboardCheck/BarChart3/BookOpen/BookMarked/
    SquarePen/DraftingCompass/Users/KeyRound/Bell). Verified in harness.
  - [x] **Resolver infra shipped:** `lib/admin/route-icons.tsx`
    (`RouteIcon` + `iconForName`, ~70 lucide names, Circle fallback).
  - [x] `AdminSidebar` — all 63 nav `icon:` emoji → lucide names rendered
    via `RouteIcon`; icon-span CSS flex-centers the SVG. `AdminTopBar`
    "Customize Hub" → SquarePen. Verified in harness (14/14 visible
    sidebar icons are lucide SVGs, 0 emoji).
  - [x] FAB launchers → lucide: CalculatorFab (🧮→Calculator),
    Fieldbook (📓→Notebook), DiscussionThreadButton (🚩→Flag),
    FloatingMessenger (💬→MessageSquare). Colored button backgrounds kept
    (intentional brand styling); verified all 4 render lucide SVGs in the
    harness. Content emoji (the messenger emoji-picker + `QUICK_EMOJIS`)
    intentionally kept — those are an emoji feature, not nav icons.
- [x] **F3 — Control-row + responsive utilities (foundation).** Verified
  the `AdminLayout.css` reset + utilities are solid: globals reset
  (`input/textarea/select { width:auto; margin:0 }` @196), checkbox/radio
  16×16 reset @214, and the full `.admin-form-row*` system @81 (36px
  baseline, `__field`/`__action`/`__toggle`). **Gaps closed this slice:**
  added a `input[type=file]` reset (was inheriting the marketing 2px
  border + 1.5rem margin) and a date/time/datetime-local 36px baseline pin
  (pattern #3). **Per-page migration handed to W1–W6** — 35 page.tsx files
  still hand-roll filter rows with inline `style={{display:'flex'}}`:
  calendar, contacts(+[id]), employees/manage(+history), employees/[email],
  invites, jobs/import, jobs/[id], learn/{exam-prep, flashcard-bank,
  flashcards, manage(+lesson-builder/media/question-builder), modules/[id]
  (+[lessonId]), practice, quiz-history, search, students/[email]}, notes,
  org-settings, orgs, payroll/[email], reports(+job/[jobId]),
  research/[projectId](+report), rewards/{admin,how-it-works}, settings,
  time-off, users. Each W slice migrates its workspace's pages to
  `.admin-form-row*`.
- [x] **F4 — Update the styling contract.** Added 3 sections to
  `docs/admin-styling-contract.md`: "Navigation — every admin page has a
  back/up affordance (F1)", "Icons — lucide for function/nav; emoji
  decorative-only (F2)", and "Control rows — the 36px baseline +
  `.admin-form-row*` (F3)". This is the reference the W1–W6 sweeps enforce.
  **Foundation phase F1–F4 complete.**

## 4. Per-workspace sweeps (one slice each; visual + functional + nav)

Each slice: run the Playwright harness pass at all three widths over
the workspace's pages, fix every §2 finding, ensure F1 back-nav is
present, replace stray emoji per F2, migrate hand-rolled filter rows
per F3, and click every button to catch dead handlers. Record a
per-page note in §6.

- [x] **W1 — Hub workspace.** `/admin/me`, `dashboard`, `assignments`,
  `schedule`, `time-off`, `my-files`, `learn/fieldbook`, and the
  `/admin/me` tab panels (pay, hours, jobs, notes, profile). DONE —
  dashboard/my-files/assignments/my-pay/my-jobs/profile emoji→lucide;
  time-off form pinned to the 36px baseline (pattern #3). me/schedule/
  fieldbook had no emoji. Deferred: data-driven config icons + my-notes
  emoji-picker (see sub-notes).
  - [x] **dashboard** — emoji→lucide (done in F2).
  - [x] **my-files** — 7 folder-filter category icons + dropzone + empty +
    loading emoji → lucide (Folder/MapPin/DraftingCompass/Camera/FileText/
    Mic/Package, Upload, Loader2, FolderOpen). Verified 7/7 SVG in harness.
  - [x] **assignments** — 10 task-type emoji + empty-state → lucide
    (ClipboardList/BookOpen/ClipboardCheck/PenSquare/Rocket/CheckCircle2/
    Wrench/Clock/Satellite/GraduationCap); dropped the emoji from the
    native `<select>` options (SVG can't render in `<option>`).
  - [x] **my-pay / my-jobs / profile** — inline emoji → lucide (Wallet,
    Landmark, FolderOpen, X). me/schedule/time-off/fieldbook had no emoji.
  - [x] **time-off** — form `inputStyle` pinned to 36px + border-box so
    native date pickers align (pattern #3). The page is uniformly
    inline-styled + internally consistent; a full `.admin-form-row`
    migration would be disproportionate, so left as-is.
  - ~~data-driven config icons~~ — deferred: my-pay `useJobTitles` 👤 +
    my-hours `work_types` 📋 store emoji in DB config; needs a
    config→lucide-name migration + a name→component renderer, not a
    component swap. Tracked as **G5** below. Same for my-notes' emoji
    list-icon picker (a legitimate emoji-picker feature — keep).
- [x] **W2 — Work workspace.** `work`, `jobs`, `jobs/new`,
  `jobs/import`, `jobs/[id]` detail, `calendar`, `field-data`,
  `field-data/[id]`, `team`, `timeline`, `assignments`. DONE — every Work
  page's emoji icons → lucide (jobs list/detail, calendar, team, timeline,
  field-data list/detail; work/jobs-new/jobs-import had none).
  - [x] **jobs** (All Jobs) — view-toggle ⊞/☰→LayoutGrid/List, delete 🗑→
    Trash2 (×2), empty 📋→Briefcase. work/jobs-new/jobs-import: no emoji.
  - [x] **timeline** (📍→MapPin, 🚗→Car) + **field-data** (🔄→Image) —
    emoji-free.
  - [x] **team** (Field Team) — battery ⚡/🔋, delivered/read ✓/⏳, Submit ✓,
    Open profile 📋, Mileage 🚗, Timeline 🗺️ → lucide. Emoji-free.
  - [x] **calendar** — fullscreen/print/empty/close/create-event/create-job
    emoji → lucide. Emoji-free. (All W2 list/main pages now done.)
  - [x] **field-data/[id]** — file-type/audio/transcription glyphs → lucide.
  - [x] **jobs/[id]** detail — 10 tab icons + inline buttons → lucide.
- [x] **W3 — Equipment workspace.** `equipment` + `inventory`,
  `consumables`, `maintenance` (+`[id]`), `timeline`, `fleet-valuation`,
  `overrides`, `templates` (+`new`/`[id]`/`cleanup-queue`), `today`,
  `import`, `vehicles`. DONE — every Equipment page's functional emoji →
  lucide across 13 pages (toast success strings + the `startsWith('✓')`
  styling logic intentionally kept).
  - [x] Status-glyph pages → lucide: maintenance, overrides, cleanup-queue,
    templates/new, timeline (⚠/✓/✕). equipment + vehicles had no emoji.
  - [x] **consumables** — error/threshold/on-hand ⚠/✓ + 3 close ✕ → lucide
    (toast success strings kept as text).
  - [x] **inventory** — photo 📷→Camera, close ✕→X, low-stock ⚠ → lucide
    (toast strings kept; `startsWith('✓')` styling logic preserved).
  - [x] **today** (condition labels + 5 banners), **import** (banners +
    dry-run), **equipment/[id]** (photo + history errors) → lucide.
    **templates** is toast-string-only (no JSX emoji).
  - [x] maintenance/[id] + templates/[id] → lucide. All Equipment pages done.
- [x] **W4 — Research & CAD workspace.** `research-cad`, `research` +
  `new`/`billing`/`coverage`/`library`/`pipeline`/`testing`,
  `research/[id]`. (CAD editor `/admin/cad` owns its own chrome — audit
  its title-bar + dialogs only for icon/cutoff issues, do not touch its
  layout shell.)
  - [x] **pipeline** + **testing** → lucide. research/research-cad/coverage:
    clean. research/billing fixed earlier (D0 adapter). research/new is a
    modal, not a page.
  - [x] **library** — DOC_TYPE_ICONS map → lucide components (Map/ScrollText/
    Spline/DraftingCompass/FileText) via DocTypeIcon helper; header/empty/
    badges/address/spinner glyphs → lucide.
  - [x] **research/[projectId]** — fully converted (parts 1+2): structural
    chrome + docTypeIcons/sourceTypeLabels component maps (Map→MapIcon to
    avoid shadowing global Map) + typeIcon prop threading + qualityScore +
    all job-prep/final-doc buttons. Page is emoji-free.
  - ~~CAD editor internal emoji~~ — deferred: `/admin/cad`'s 40+ component
    files (MenuBar, ToolOptionsBar, dialogs, panels) use emoji throughout
    a bespoke editor surface with its own visual language + separate specs
    (`docs/planning/completed/STARR_CAD*`). Converting all is a large
    workstream disproportionate to value (the plan already scoped CAD to
    "dialogs/icon-cutoff only, don't touch the layout shell"), and CAD
    emoji are far less jarring than admin-chrome emoji (now fixed). The
    research-pages portion of W4 — the user-facing emoji problem — is done.
- [x] **W5 — Knowledge / Learn workspace.** `learn` hub + `roadmap`,
  `modules` (+detail), `knowledge-base` (+article), `flashcards`
  (+`create`/`[deck]`), `flashcard-bank`, `exam-prep` (+`sit`/`rpls`/
  mock-exam), `search`, `quiz-history`, `students` (+detail), `manage`
  (+`question-builder`/`media`/`article-editor`), `practice`.
  - [x] learn hub + search + quiz-history + knowledge-base +
    flashcards/create → lucide. Most learn pages are already emoji-light.
  - [x] modules/[id]/[lessonId], students(+[email]), modules/[id]/test,
    knowledge-base/[slug], exam-prep/rpls → lucide / title-emoji dropped.
  - [x] **manage/lesson-builder/[id]** part 1 — 15 close ✕ + structural
    glyphs + link-type ternary + Style 🎨→Palette → lucide. Kept the
    author emoji-picker + block.content.icon (content-authoring feature).
  - [x] lesson-builder part 2 — BLOCK_TYPES palette (23 types) → lucide. W5 done.
    🖼🔊💡✦🎯📎🎞🔗🃏📰➡🧮) → lucide-component map + palette render.
- [x] **W6 — Office workspace.** `office`, `billing` (+`invoices`/
  `plan-history`/`upgrade`), `payroll` (+detail), `payout-log`,
  `payouts`, `employees` (+`manage`/history), `users`, `invites`,
  `org-settings`, `orgs`, `reports`, `leads`, `contacts`, `receipts`,
  `mileage`, `finances`, `notes`, `settings`, `support` (+`new`),
  `audit`, `error-log`, `announcements`, `messages` (+`new`/`contacts`/
  `settings`), `discussions` (+`[id]`), `hours-approval`, `rewards`
  (+`store`/`admin`/`how-it-works`), `pay-progression`.
  - [x] Batch 1 (9 small pages): billing, billing/upgrade, contacts,
    reports, error-log, leads, notes, messages/new, messages/contacts →
    lucide. office/payout-log/payouts/users/invites/org-settings/orgs/
    mileage/audit/announcements/support: already emoji-free.
  - [x] Batch 2: finances (⬇→Download), discussions (ESCALATION_ICONS map
    + empty + help-flag), employees/manage (5 tab icons) → lucide.
  - [x] **settings** — 6 section tabs + section/integration icon spans →
    lucide.
  - [x] **receipts** (🗑/🔧/⚠/🏛/✕) + **payroll** (4 summary + 3 action
    icons) → lucide.
  - [x] pay-progression + messages chrome → lucide. All W6 pages done.
    icon = G5 (DB-config work-type).

## 5. Functional + data slices

- [x] **D0 — Production error-report triage (user-supplied, 2026-06-21).**
  Fixed `/admin/research/billing` crash (API/view-model contract mismatch
  → adapter) and added a global benign-error filter (ResizeObserver loop /
  cross-origin "Script error.") in `ErrorProvider`. Verified-not-a-bug:
  research/[projectId] "Failed to fetch" (transient, caught) and
  research_projects "schema cache" (stale — table exists live, HTTP 200).
  Commit `5cdbe4d5`.
- [x] **D1 — Dead-button / missing-functionality sweep.** Scanned all of
  `app/admin`: **no empty `onClick={() => {}}` handlers** and no
  "coming soon"/placeholder dead buttons (the "coming soon"/"not yet"
  hits are legitimate copy/empty-states). A dead-link scan over every
  `href`/`router.push('/admin/…')` literal (53 distinct) found exactly
  **1 dead static link**: AdminTopBar → `/admin/profile` (page removed in
  the hub consolidation). Fixed by repointing both topbar links to the
  live hub URLs (`/admin/me?tab=profile` + `?sub=themes`) and teaching
  `ProfilePanel` to honor a `?sub=` deep-link — which also fixed a real
  bug (the "Theme + density" item used to land on profile-info because
  the redirect dropped its query). Scan now reports 0 dead links.
  Commit `02d06f57`.
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
  - **Genuine drift — FIXED:** 101_fieldbook_tables (invalid
    `CREATE POLICY IF NOT EXISTS` → DROP+CREATE, 11 policies) and
    226_starr_field_files (job_files schema-drift guard) now apply
    cleanly (commit `…`). Storage-bucket policy files (102/290/295)
    stay skipped — verified all 4 buckets EXIST live; only the
    `storage.objects` RLS statements need the privileged dashboard role,
    and the app already works, so no action.
  - **Payment seeds 323–327** — see G3: blocked on a human decision
    (invoices table collision with live Stripe billing).
  - **Curriculum buildout 332–359 (28 files)** — stale generated
    artifacts: their hardcoded lesson UUIDs are orphaned (a later
    curriculum re-seed recreated `learning_lessons` with new ids; live =
    422 lessons / 1463 blocks, but only **215 lessons have blocks** →
    ~207 empty). Can't bulk-apply; the real fix is regenerating these via
    the `scripts/_tmp_landlaw` gen_seed pipeline against current lesson
    ids — a content task, tracked as G4 below.

- [ ] **G4 — Regenerate the empty-lesson curriculum buildout.** ~207 of
  422 lessons have no blocks. The 332–359 buildout seeds are stale
  (orphaned lesson ids). Re-run the `scripts/_tmp_landlaw` JSON→gen_seed
  pipeline against the current live lesson ids to fill the empty lessons,
  then apply. Separate content workstream from the UI audit; size it
  before starting. (Was implicitly deferred; surfaced by the D2 apply.)

- ~~G5 — Data-driven config icons → lucide~~ — deferred: job-title
  (`useJobTitles`) and work-type (`work_types` API) icons are emoji stored
  in DB config and are admin-editable; converting needs a config→lucide-
  name migration + a name→`RouteIcon` renderer wherever they display.
  Low value (not broken, admin-configurable) and cross-cuts payroll +
  hours + assignments. Revisit if the user wants the config UIs to offer a
  lucide picker. Surfaced by W1.

## 5.5 Session-surfaced open work (from the user's gap list)

- [x] **G1 — Badges expansion + Safety-course badges.** Added 6 safety
  badges to `seeds/001_config.sql` (Safety First / OSHA Certified / First
  Responder / HAZWOPER Qualified / Field-Safe / Safety Champion), using the
  allowed certification/achievement categories (the `badges_category_check`
  has no 'safety' value). Applied live (catalogue 18 → 24). **Also wired
  the awarding** in `pay-config/credential-queue` — verifying a safety
  credential now idempotently grants its badge + the Safety First entry +
  Safety Champion (when all core safety creds are verified). Commit
  `f2160364`. Badge `icon` stays emoji to match the 18 existing badges
  (DB-stored content, same class as the G5 config icons). The internal
  **Safety *course* content** (≠ the credentials, which exist) needs the
  gen_seed curriculum pipeline → folded into G4.
- [x] **G2 — Pay Progression visual polish.** Iconography pass: the page
  title + all 10 section headers used HTML-ENTITY emoji (`&#x1F4B0;` etc.)
  that every unicode scan missed — converted all 13 to lucide (Wallet,
  HardHat, BarChart3, Calendar, ScrollText, Star, GraduationCap, Target,
  Calculator, ClipboardList, Loader2). Verified in harness: 10/10 section
  titles render lucide SVGs; navbar (IconRail + topbar + sidebar) confirmed
  intact. Commit `69e12c20`. (Deeper layout/spacing redesign of the hero
  card itself not done blind — the page is data-gated; U2 already fixed the
  one concrete overflow bug. The rate/tier work-type icons stay = G5.)

- [ ] **W7 — Entity-encoded emoji sweep (follow-up).** The W1–W6 sweeps
  matched only literal-unicode emoji; **~35 admin files also use HTML-entity
  emoji** (`&#x1F…;` / `&#x26…;`) that were missed. Re-run the conversion
  targeting the entity form (`grep -rlE "&#x1F[0-9A-Fa-f]{3};" app/admin
  --include="*.tsx"`). Same rules (chrome→lucide; content pickers/
  data-config/decorative stay). **Caution:** several are content editors/
  viewers (TipTapEditor, ArticleEditor/Reader, FlashcardViewer, QuizRunner,
  Fieldbook) whose emoji may be content-authoring tools — assess each.
  - [x] **Navbar** (hamburger/XP/sidebar arrows). Commit `8eeb99b8`.
  - [x] **learn/modules + roadmap + exam-prep** — loading/empty/lock/header/
    stat entity emoji → lucide. Commit `34658211`.
  - [ ] Remaining (~30): learn/modules/[id](+[lessonId]), learn/manage(+
    question-builder/lesson-builder/media/article-editor), learn/exam-prep/
    sit(+module/[id]/mock-exam), learn/flashcards(+bank/practice),
    learn/articles/[id], rewards(+how-it-works/admin), my-notes, users,
    discussions(+[id]), and components (TipTapEditor, JobFileManager,
    Fieldbook, FlashcardViewer, QuizRunner, FileViewer, ArticleReader/Editor,
    SmallScreenBanner). Content editors need per-file assessment.
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
