# Mobile Responsiveness Audit & Build-Out

> Goal: every admin ("backend") page is fully usable and well-formatted on a
> phone. Nothing too big or too small, nothing overlapping, nothing off-screen
> or out of place. Every page, button, field, text, and interface looks good at
> 360–430px wide.

**Status:** 🟡 In progress — auditing in slices.
**Owner:** mobile build-out effort (2026-06).
**Primary viewport:** 390 × 844 (iPhone 12/13/14). **Stress viewport:** 360 × 800 (small Android).

---

## 1. How this doc is driven

Work happens in **slices**, one area per slice. Each slice:

1. **Audit** the pages in that area (method below) and record findings in the
   per-page catalogue (§5) — every layout/styling fix the page needs.
2. **Update this doc** with the findings and a concrete fix plan.
3. **Commit** the doc update (the slice's deliverable).

Once the **whole surface is audited** (every row in §5 is `🔍` or `✅`), the
effort flips to **build-out**: work the §6 fix backlog, implement the mobile
fixes area-by-area, re-verify, and mark rows `✔️`.

### Status legend
| Mark | Meaning |
| --- | --- |
| ⬜ | Not yet audited |
| 🔍 | Audited — issues found (see notes / backlog) |
| ✅ | Audited — already mobile-clean, no work needed |
| 🔧 | Fix in progress |
| ✔️ | Fixed & verified on phone viewport |

---

## 2. Audit method

Pages are audited with a layered method because the app is data-driven and the
render harness only has empty stub data:

1. **Structural render pass (automated).** `/ux-harness` renders the real page
   component at 390px with a seeded admin session; a Playwright script measures
   `documentElement.scrollWidth − clientWidth` (horizontal overflow) and flags
   any visible element whose right edge pokes past the viewport. Script:
   `scratchpad/audit.js` (reusable). **Result of first run (45 top-level pages):
   0 horizontal overflow on every page** — the global shell + `AdminResponsive.css`
   hold up structurally.
2. **CSS responsive review.** Read the governing stylesheet(s) for the page and
   check for: fixed `px` widths/min-widths that exceed ~360px, grids/flex rows
   that don't collapse to one column, tables without horizontal scroll or a card
   fallback, modals/drawers wider than the viewport, absolute-positioned overlays.
3. **JSX review.** Check the page/component for inline `style={{ width: … }}`
   fixed px, hardcoded column counts, and tap targets < 40px.
4. **Visual spot-check.** Screenshot in the harness where the page renders with
   stub data (forms, empty states, static content render fine; list/table pages
   need seeded data — tracked per page).

Breakpoint conventions already used in the codebase (reuse these, don't invent
new ones): **768px** (tablet/handoff), **600/599px** (phone), **480px** (small
phone), **380px** (very small). Tokens live in `app/admin/styles/tokens.css`.

### Established responsive conventions (reuse, don't reinvent)
- **Responsive grids:** `repeat(auto-fill/auto-fit, minmax(260px, 1fr))`
  collapses to one column on a phone with no breakpoint (e.g. WorkspaceLanding,
  verified clean). Or explicit `3 → 2 → 1` column steps at 1100/640px (AdminMe).
- **Table-wrap convention:** wide tables sit in an `overflow-x: auto` wrapper
  (`.um-table-wrap`, etc. — 14 stylesheets) so the table scrolls **inside its
  card** instead of pushing the page wide; secondary columns are hidden at
  768px (`th:nth-child(n){display:none}`). **Primary table audit check: every
  `<table>` must have such a wrapper, else it overflows the page once populated.**
  (The empty-data structural pass cannot catch a missing wrapper — populated or
  code review only.)

---

## 3. Stylesheet responsive-coverage census

Mobile breakpoints (`@media max-width ≤ 820px`) per admin stylesheet. Thin/zero
coverage = prime suspects; `AdminResponsive.css` centralizes cross-page mobile
overrides so a low count here does not always mean the page is broken.

| Stylesheet | Mobile BPs | Note |
| --- | --- | --- |
| AdminResponsive.css | 54 | Central mobile override sheet (layout-global) |
| AdminLearn.css | 39 | Learning hub + modules |
| AdminResearch.css | 33 | Research workspace |
| AdminRewards.css | 16 | Rewards/store |
| AdminLayout.css | 9 | Shell (sidebar/topbar/cards/buttons) |
| AdminMessaging.css | 8 | Messages |
| Calendar.css | 7 | Calendar |
| AdminFieldWork.css | 5 | Fieldbook / field UI |
| AdminMe.css / AdminTimeLogs.css | 4 | Hub / time logs |
| TestingLab / EmployeePond / CalculatorModal / AdminUsers / AdminPayroll / AdminMyNotes / AdminErrors / AdminArticle | 3 | Thin |
| AdminJobs / AdminLogin / EmailCompose / IconRail / AdminEmployeeManage | 2 | Thin |
| AdminAssignments / AdminDiscussions / AdminNotes / AdminPageHeader / AdminSchedule / Leads / install | 1 | Very thin |
| **WorkspaceLanding.css** | **0** | ⚠️ workspace landing tiles — verify wrap |
| **AdminAudit.css** | **0** | ⚠️ audit log table — verify mobile table |
| **AdminCommandPalette.css** | **0** | Cmd+K palette — likely fine (centered modal) |
| **payments-admin.css** | **0** | ⚠️ payments inbox — verify |

---

## 4. Slice plan

Audit slices (record findings in §5/§6):

- [x] **S1 — Hub:** workspace landings (work/office/research-cad) ✅ clean; me/dashboard/my-files/schedule/time-off audited (need data-render verification — see §6).
- [ ] **S2 — Work:** jobs(+[id], field, new, import), leads(+[id]), calendar, finances, mileage, vehicles, timeline, team(+[email]), field-data(+[id]), assignments, hours-approval, reports(+job/[id]), invoicing(+categories), invoices/new, payments/inbox, receipts(+new)
- [ ] **S3 — Equipment:** equipment + all subroutes (today, timeline, catalogue, templates, consumables, maintenance, overrides, fleet-valuation, checked-out, inventory, import, crew-calendar)
- [ ] **S4 — Research & CAD:** research + subroutes, research/testing, cad
- [ ] **S5 — Learning:** learn + all subroutes (modules, lessons, quizzes, flashcards, exam-prep, knowledge-base, manage, students, etc.)
- [ ] **S6 — Office/Admin:** employees(+manage), payroll, payouts(+runs/dispatch/tax), billing, settings, org-settings, orgs, users, roles/custom, notes, announcements, support, weather
- [ ] **S7 — Communication:** messages(+conversation/new/contacts/settings), discussions(+[id]), contacts(+[id]), email/new
- [ ] **S8 — Rewards & Pay:** rewards(+admin/how-it-works), pay-progression(+[email]), payout-log, my-pay, my-hours, my-jobs, my-notes
- [ ] **S9 — Account/Roles:** profile, audit, error-log, work-mode + all role variants, learn/fieldbook

Build-out slices (after audit complete): B1…Bn, one per area, working the §6 backlog.

---

## 5. Page catalogue

Columns: **Audit** = audit status, **Fix** = fix status, **Notes** = governing
stylesheet + findings. Dynamic `[param]` pages share their parent's stylesheet
and are audited via code review (no harness render without seeded params).

### Hub
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/me | 🔍 | ⬜ | AdminMe.css. Grids responsive 3→2→1 @1100/640px. Verify widget cards + greeting at 360px w/ data. |
| /admin/me/privacy | ⬜ | ⬜ | AdminMe.css. Code review pending. |
| /admin/dashboard | 🔍 | ⬜ | Data-driven (blank w/ stub). Verify metric-card grid + activity feed w/ data. |
| /admin/my-files | 🔍 | ⬜ | MyFilesPanel. 0 overflow. Verify file rows/grid w/ data. |
| /admin/schedule | 🔍 | ⬜ | AdminSchedule.css (1 BP). 0 overflow. Verify shift list w/ data. |
| /admin/time-off | 🔍 | ✔️ | Table wrapped in `.admin-table-wrap`. |
| /admin/install | ✅ | ✔️ | install.css. Built mobile-first this effort; verified iPhone/Android. |
| /admin/work | ✅ | — | WorkspaceLanding auto-fill grid. Verified clean (screenshot). |
| /admin/office | ✅ | — | WorkspaceLanding auto-fill grid. Verified clean (screenshot). |
| /admin/research-cad | ✅ | — | WorkspaceLanding (same component). Clean by inheritance. |

### Work
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/jobs | ⬜ | ⬜ | AdminJobs.css (2 BP, 1592 lines). 0 overflow w/ stub. |
| /admin/jobs/[id] | ⬜ | ⬜ | AdminJobs.css. Detail — code review. |
| /admin/jobs/[id]/field | ⬜ | ⬜ | AdminFieldWork.css. Field crew primary surface. |
| /admin/jobs/new | ⬜ | ⬜ | AdminJobs.css. Big form. |
| /admin/jobs/import | ⬜ | ⬜ | AdminJobs.css. |
| /admin/leads | ⬜ | ⬜ | Leads.css (1 BP). |
| /admin/leads/[id] | ⬜ | ⬜ | Leads.css. |
| /admin/calendar | ⬜ | ⬜ | Calendar.css (7 BP, 1658 lines). |
| /admin/finances | ⬜ | ⬜ | 0 overflow. |
| /admin/mileage | 🔍 | ✔️ | Inline-style table wrapped in `.admin-table-wrap`. |
| /admin/vehicles | ⬜ | ⬜ | 0 overflow. |
| /admin/timeline | ⬜ | ⬜ | 0 overflow. |
| /admin/team | ⬜ | ⬜ | 0 overflow. |
| /admin/team/[email] | ⬜ | ⬜ | Detail — code review. |
| /admin/field-data | ⬜ | ⬜ | Server comp. |
| /admin/field-data/[id] | ⬜ | ⬜ | Detail. |
| /admin/assignments | ⬜ | ⬜ | AdminAssignments.css (1 BP). |
| /admin/hours-approval | ⬜ | ⬜ | AdminTimeLogs.css. |
| /admin/reports | ⬜ | ⬜ | Data-driven (blank w/ stub). |
| /admin/reports/job/[jobId] | ⬜ | ⬜ | Detail. |
| /admin/invoicing | ⬜ | ⬜ | |
| /admin/invoicing/categories | ⬜ | ⬜ | |
| /admin/invoices/new | ⬜ | ⬜ | Big form. |
| /admin/payments/inbox | ⬜ | ⬜ | payments-admin.css (0 BP) ⚠️. |
| /admin/receipts | ⬜ | ⬜ | |
| /admin/receipts/new | ⬜ | ⬜ | Form. |

### Equipment
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/equipment | ⬜ | ⬜ | Catalogue. 0 overflow. |
| /admin/equipment/[id] | ⬜ | ⬜ | Detail. |
| /admin/equipment/today | ⬜ | ⬜ | |
| /admin/equipment/timeline | ⬜ | ⬜ | |
| /admin/equipment/consumables | ⬜ | ⬜ | |
| /admin/equipment/maintenance | ⬜ | ⬜ | |
| /admin/equipment/maintenance/[id] | ⬜ | ⬜ | Detail. |
| /admin/equipment/templates | ⬜ | ⬜ | |
| /admin/equipment/templates/[id] | ⬜ | ⬜ | Detail. |
| /admin/equipment/templates/new | ⬜ | ⬜ | Form. |
| /admin/equipment/templates/cleanup-queue | ⬜ | ⬜ | |
| /admin/equipment/overrides | ⬜ | ⬜ | |
| /admin/equipment/fleet-valuation | ⬜ | ⬜ | |
| /admin/equipment/checked-out | ⬜ | ⬜ | |
| /admin/equipment/inventory | ⬜ | ⬜ | |
| /admin/equipment/import | ⬜ | ⬜ | |
| /admin/personnel/crew-calendar | ⬜ | ⬜ | Calendar.css. |

### Research & CAD
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/research | ⬜ | ⬜ | AdminResearch.css (33 BP). 0 overflow. |
| /admin/research/[projectId] | ⬜ | ⬜ | Detail. |
| /admin/research/[projectId]/boundary | ⬜ | ⬜ | Map-heavy. |
| /admin/research/[projectId]/documents | ⬜ | ⬜ | |
| /admin/research/[projectId]/report | ⬜ | ⬜ | |
| /admin/research/billing | ⬜ | ⬜ | |
| /admin/research/coverage | ⬜ | ⬜ | |
| /admin/research/library | ⬜ | ⬜ | |
| /admin/research/pipeline | ⬜ | ⬜ | |
| /admin/research/self-heal | ⬜ | ⬜ | |
| /admin/research/testing | ⬜ | ⬜ | TestingLab.css (3 BP, 3130 lines). |
| /admin/cad | ⬜ | ⬜ | **Desktop-primary** CAD editor — mobile = informational/limited. Flag, don't force. |

### Learning
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/learn | ⬜ | ⬜ | AdminLearn.css (39 BP). 0 overflow. |
| /admin/learn/roadmap | ⬜ | ⬜ | |
| /admin/learn/modules | ⬜ | ⬜ | |
| /admin/learn/modules/[id] | ⬜ | ⬜ | |
| /admin/learn/modules/[id]/[lessonId] | ⬜ | ⬜ | Lesson reader. |
| /admin/learn/modules/[id]/[lessonId]/quiz | ⬜ | ⬜ | Quiz. |
| /admin/learn/modules/[id]/test | ⬜ | ⬜ | |
| /admin/learn/knowledge-base | ⬜ | ⬜ | |
| /admin/learn/knowledge-base/[slug] | ⬜ | ⬜ | Article. AdminArticle.css. |
| /admin/learn/articles/[id] | ⬜ | ⬜ | AdminArticle.css. |
| /admin/learn/flashcards | ⬜ | ⬜ | |
| /admin/learn/flashcards/[deckId] | ⬜ | ⬜ | |
| /admin/learn/flashcards/create | ⬜ | ⬜ | |
| /admin/learn/flashcard-bank | ⬜ | ⬜ | |
| /admin/learn/exam-prep | ⬜ | ⬜ | |
| /admin/learn/exam-prep/sit | ⬜ | ⬜ | |
| /admin/learn/exam-prep/sit/mock-exam | ⬜ | ⬜ | |
| /admin/learn/exam-prep/sit/module/[id] | ⬜ | ⬜ | |
| /admin/learn/exam-prep/rpls | ⬜ | ⬜ | |
| /admin/learn/practice | ⬜ | ⬜ | |
| /admin/learn/quiz-history | ⬜ | ⬜ | |
| /admin/learn/search | ⬜ | ⬜ | |
| /admin/learn/fieldbook | ⬜ | ⬜ | AdminFieldWork.css. |
| /admin/learn/students | ⬜ | ⬜ | |
| /admin/learn/students/[studentEmail] | ⬜ | ⬜ | |
| /admin/learn/manage | ⬜ | ⬜ | |
| /admin/learn/manage/question-builder | ⬜ | ⬜ | |
| /admin/learn/manage/media | ⬜ | ⬜ | |
| /admin/learn/manage/article-editor/[id] | ⬜ | ⬜ | Editor. |
| /admin/learn/manage/lesson-builder/[id] | ⬜ | ⬜ | Editor. |

### Office / Admin
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/employees | ⬜ | ⬜ | EmployeePond.css (3 BP). 0 overflow. |
| /admin/employees/[email] | ⬜ | ⬜ | AdminEmployeeManage.css. |
| /admin/employees/manage | ⬜ | ⬜ | |
| /admin/employees/manage/[email]/history | ⬜ | ⬜ | |
| /admin/payroll | ⬜ | ⬜ | AdminPayroll.css (3 BP, 1676 lines). 0 overflow. |
| /admin/payroll/[email] | ⬜ | ⬜ | |
| /admin/payouts | ⬜ | ⬜ | Data-driven (blank w/ stub). |
| /admin/payouts/ad-hoc | ⬜ | ⬜ | |
| /admin/payouts/runs | ⬜ | ⬜ | |
| /admin/payouts/runs/[id] | ⬜ | ⬜ | |
| /admin/payouts/runs/[id]/dispatch | ⬜ | ⬜ | |
| /admin/payouts/tax-report | ⬜ | ⬜ | |
| /admin/billing | ⬜ | ⬜ | 0 overflow. |
| /admin/billing/invoices | ⬜ | ⬜ | |
| /admin/billing/plan-history | ⬜ | ⬜ | |
| /admin/billing/upgrade | ⬜ | ⬜ | |
| /admin/settings | ⬜ | ⬜ | 0 overflow (form). |
| /admin/org-settings | ⬜ | ⬜ | 0 overflow. |
| /admin/orgs | ⬜ | ⬜ | 0 overflow. |
| /admin/users | ⬜ | ⬜ | AdminUsers.css (3 BP). 0 overflow. |
| /admin/roles/custom | ⬜ | ⬜ | Role builder. |
| /admin/notes | ⬜ | ⬜ | AdminNotes.css (1 BP). |
| /admin/announcements | ⬜ | ⬜ | 0 overflow. |
| /admin/support | ⬜ | ⬜ | 0 overflow. |
| /admin/support/new | ⬜ | ⬜ | Form. |
| /admin/support/tickets/[id] | ⬜ | ⬜ | Detail. |
| /admin/weather | ⬜ | ⬜ | Server comp. |

### Communication
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/messages | ⬜ | ⬜ | AdminMessaging.css (8 BP, 2864 lines). |
| /admin/messages/[conversationId] | ⬜ | ⬜ | |
| /admin/messages/new | ⬜ | ⬜ | |
| /admin/messages/contacts | ⬜ | ⬜ | |
| /admin/messages/settings | ⬜ | ⬜ | |
| /admin/discussions | ⬜ | ⬜ | AdminDiscussions.css (1 BP). |
| /admin/discussions/[id] | ⬜ | ⬜ | |
| /admin/contacts | ⬜ | ⬜ | Server comp. |
| /admin/contacts/[id] | ⬜ | ⬜ | |
| /admin/email/new | ⬜ | ⬜ | EmailCompose.css (2 BP). |

### Rewards & Pay
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/rewards | ⬜ | ⬜ | AdminRewards.css (16 BP). 0 overflow. |
| /admin/rewards/admin | ⬜ | ⬜ | |
| /admin/rewards/how-it-works | ⬜ | ⬜ | Static content. |
| /admin/pay-progression | ⬜ | ⬜ | 0 overflow. Long content (11k chars). |
| /admin/pay-progression/[email] | ⬜ | ⬜ | |
| /admin/payout-log | ⬜ | ⬜ | Data-driven. |
| /admin/my-pay | ⬜ | ⬜ | MyPayPanel. 0 overflow. |
| /admin/my-hours | ⬜ | ⬜ | MyHoursPanel. 0 overflow. |
| /admin/my-jobs | ⬜ | ⬜ | MyJobsPanel. |
| /admin/my-notes | ⬜ | ⬜ | AdminMyNotes.css (3 BP). |

### Account / Roles / Misc
| Route | Audit | Fix | Notes |
| --- | :-: | :-: | --- |
| /admin/profile | ⬜ | ⬜ | ProfilePanel. |
| /admin/audit | ⬜ | ⬜ | AdminAudit.css (0 BP) ⚠️ table. |
| /admin/error-log | ⬜ | ⬜ | AdminErrors.css (3 BP). |
| /admin/work-mode | ⬜ | ⬜ | Role launcher. |
| /admin/work-mode/start | ⬜ | ⬜ | |
| /admin/work-mode/admin | ⬜ | ⬜ | |
| /admin/work-mode/developer | ⬜ | ⬜ | |
| /admin/work-mode/drawer | ⬜ | ⬜ | |
| /admin/work-mode/equipment_manager | ⬜ | ⬜ | |
| /admin/work-mode/field_crew | ⬜ | ⬜ | Field crew — high priority. |
| /admin/work-mode/researcher | ⬜ | ⬜ | |
| /admin/work-mode/tech_support | ⬜ | ⬜ | |
| /admin/login | ⬜ | ⬜ | AdminLogin.css (2 BP). |

---

## 6. Fix backlog

Populated during audit slices. Each item: `[area] page — issue — fix`. Worked
during build-out slices.

**Cross-cutting — TABLE-WRAPPER SWEEP (primary mobile risk).**
Static detector (`scratchpad/table-wrap-check.js`) scanned all 55 `<table>`
files: **27 already sit in an `overflow-x:auto` wrapper; 28 do NOT** and will
overflow the page once populated with a wide row. Verified real (finances +
mileage use inline-style `<table>` directly in a `<section>`, no wrapper).
**Uniform fix:** add a shared responsive wrapper utility (e.g. `.admin-table-wrap
{ overflow-x:auto; -webkit-overflow-scrolling:touch }` in AdminResponsive.css)
and wrap each flagged `<table>`. Then re-run the detector → 0 flagged.

**Build-out progress (table wrappers):** added shared `.admin-table-wrap`
utility to `AdminResponsive.css` (always-on `overflow-x:auto`). Wrapping flagged
tables in it, area by area. **✔️ done (16/28 files):** `time-off`, `mileage`,
`invites`, `payouts`, `billing/invoices`, `audit`, + all 10 Equipment pages (11
tables, via `scratchpad/wrap-equipment.js` codemod). Detector re-run → **12
files remain** (finances, reports, reports/job, 3 payroll components,
research/[projectId], FieldWorkView import-preview, 2 CAD + DrawingCanvas
[desktop], rewards/how-it-works). Note: FieldWorkView's main log table already
uses `.fw__table-scroll` (no work).

Flagged files by area (build-out targets):
- **Hub:** ✔️ `time-off/page.tsx`
- **Work:** `finances`, `reports`, `reports/job/[jobId]`, ✔️ `mileage`,
  ✔️ `invites`, `components/jobs/FieldWorkView` (FieldWorkView line 993)
- **Office/Pay:** ✔️ `payouts`, ✔️ `billing/invoices`, ✔️ `audit`,
  `components/payroll/PayStubView`, `PayRateTable`, `PayrollRunPanel`
- **Equipment:** ✔️ ALL done — `[id]`, `consumables`, `import`, `inventory`,
  `maintenance`, `maintenance/[id]`, `overrides`, `templates`, `templates/[id]`,
  `templates/cleanup-queue`
- **Research/CAD (lower prio — desktop-primary):** `research/[projectId]`,
  `research/components/DrawingCanvas`, `cad/LayerTransferDialog`, `cad/PerfOverlay`
- **Rewards:** `rewards/how-it-works`

_Note:_ a `width:100%` table with wrapping cells gets cramped but does not
overflow; the wrapper makes wide/`nowrap` tables scroll instead of breaking the
page — safe to apply uniformly regardless.

**Cross-cutting — FIXED MULTI-COLUMN GRIDS.**
4 grids use fixed px columns summing > 360px and may not collapse on a phone
(verify each has a mobile `1fr` / scroll override; add one if missing):
- [ ] `AdminJobs.css:355` — `100px 1fr 120px 120px 120px 100px`
- [ ] `AdminJobs.css:1048` — `80px 1fr 1fr 80px 1fr 80px`
- [ ] `AdminResearch.css:10729` — `1fr 200px 80px 36px`
- [ ] `AdminResearch.css:10889` — `1fr 110px 1.4fr 110px 36px`

**Cross-cutting — CLEARED (no work):**
- Fixed inline widths ≥400px: only the floating calculator (overridden to
  `calc(100vw - 24px)` at ≤480px — fine) and CAD panels (desktop-primary).
- Forms: multi-col form rows collapse to 1 col at ≤768px; inputs are `width:100%`.
- Large CSS `min-width`s: inside desktop `min-width` media queries or already
  paired with `overflow-x:auto` (schedule/calendar grids) — fine.

- [ ] **Data-render verification** — list/table/dashboard pages render blank in
  the empty-data harness; seed representative rows for key endpoints so their
  mobile layout can actually be screenshotted (deferred to per-area slices).

**S1 — Hub:**
- [ ] time-off — has a `<table>`; verify it has an overflow-x wrapper.
- [ ] me / dashboard / my-files / schedule — verify card grids + lists at 360px
  with seeded data (no static issues found in CSS review; grids are responsive).

---

## 7. Changelog

- **2026-06-23 — Slice 0 (setup):** Created doc. Ran structural render pass
  (45 top-level pages, 390px) → **0 horizontal overflow** everywhere. Took CSS
  responsive-coverage census (§3) and recorded breakpoint conventions. Built the
  full 152-route catalogue (§5). Reusable audit tooling in `scratchpad/audit.js`
  + `/ux-harness` registry (added `learn`, `messages`, `payout-log`).
- **2026-06-23 — Slice 1 (Hub):** Workspace landings (work/office/research-cad)
  verified mobile-clean (auto-fill grid, screenshot). Hub/dashboard grids are
  responsive (3→2→1). Documented two established conventions in §2 (auto-fill
  grids; table-wrap `overflow-x:auto`). Identified the **table-wrapper sweep** as
  the primary cross-cutting mobile risk (empty-data pass can't catch it).
- **2026-06-23 — Slice 2 (table sweep, all areas):** Built reusable static
  detector (`scratchpad/table-wrap-check.js`). Scanned all 55 `<table>` files →
  **28 lack an `overflow-x` wrapper** and will overflow once populated; 27 are
  fine. Spot-verified (finances/mileage genuinely unwrapped inline-style tables).
  Recorded the full flagged list + uniform fix in §6. This is the single biggest
  mobile-layout backlog item and spans most areas.
- **2026-06-23 — Slice 3 (fixed-width + forms, all areas):** Audited fixed
  widths, forms, multi-col grids cross-cutting. **Cleared:** inline fixed widths
  (only calculator — already mobile-overridden — and CAD), forms (collapse +
  100% inputs), large CSS min-widths (desktop queries / already scroll-wrapped).
  **Found:** 4 fixed multi-column grids to verify/collapse (§6). Conclusion: the
  backend is mobile-mature; concrete backlog = 28 table wrappers + 4 grids.
  **Audit phase complete for layout/overflow; moving to build-out.**
- **2026-06-23 — Build-out B1 (table wrappers, Hub+Work start):** Added shared
  `.admin-table-wrap` utility to AdminResponsive.css. Wrapped tables in
  `time-off`, `mileage`, `invites` (3/28). ESLint clean. Remaining flagged files
  wrapped in subsequent build-out slices.
- **2026-06-23 — Build-out B2 (Office/Pay tables):** Wrapped `payouts`,
  `billing/invoices`, `audit` (6/28 total). Verified FieldWorkView's main log
  table already uses `.fw__table-scroll` (skipped, no change). ESLint clean.
- **2026-06-23 — Build-out B3 (Equipment tables):** Wrapped all 10 Equipment
  pages (11 tables) via a safe non-nesting codemod (`scratchpad/wrap-equipment.js`).
  ESLint clean on all 10. Detector re-run (patched to read the table's own line):
  **16/28 files done, 12 remain.**
