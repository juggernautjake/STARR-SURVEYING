# UI / UX Overhaul

**Status:** Planning — slices below ship one at a time per the in-progress / completed cycle.
**Total estimate:** ~5 engineering days across 21 slices.
**Source of truth for findings:** `docs/UI_AUDIT.md`.

---

## 0. tl;dr

The site (web + mobile-PWA) suffers from three classes of problem:

1. **Critical functional bugs** — `/admin/receipts` and `/admin/reports` 500 because the code queries columns that don't exist; `/platform` renders inside the marketing layout; admin workspace landings show "0 pages accessible" because the role-array gate fails.
2. **Universal mobile polish gaps** — a fixed FAB pill overlaps content on every page; the Hub greeting card cramps badly; key forms have low text contrast.
3. **No design system** — 30+ separate CSS files, 15+ distinct input-padding values, 4+ button-style variants. Things don't line up because no shared tokens exist.

This overhaul addresses all three, in that order, across 21 slices grouped into 4 phases.

---

## 1. Goals & non-goals

### Goals

- Stop the 500s and broken-query banners visible during normal use.
- Make every authenticated page usable on mobile without FAB overlap, button wrapping, or invisible text.
- Establish a design token system (`app/styles/tokens.css`) so future pages don't drift.
- Normalize form-element heights (`app/styles/forms.css`) so buttons, inputs, selects, textareas line up in every row.
- Fix the highest-impact per-page issues from the audit (header logo distortion, signup price formatter, missing team title).

### Non-goals

- **Full whole-app redesign.** This is targeted polish + foundation, not a Figma-led rebuild.
- **Tailwind migration.** The codebase uses CSS files; we add tokens that the existing files consume. No bulk rewrite.
- **Mobile-native app polish.** Out of scope; that lives in the Starr Field RFC.
- **Marketing-site overhaul.** A few targeted fixes only.
- **Per-page CSS rewrites for every page.** We migrate the 5 most-used pages; others can wait until they're touched for other reasons.

---

## 2. Current state

What exists today, drawn from `docs/UI_AUDIT.md`:

| Aspect | State |
|---|---|
| CSS organization | ~30 page-specific files (`AdminJobs.css`, `AdminPayroll.css`, etc.), each authoring spacing / colors independently |
| Design tokens | **None** — no `variables.css`, no CSS custom properties scheme |
| Component library | None — each page composes raw HTML elements with bespoke classes |
| Button styles | At least 4 distinct visual languages (yellow filled, blue filled, outline, red filled) |
| Input padding | 15+ different values across files |
| Mobile breakpoint | Inconsistent — some files use `768px`, others `1023px`, others `599px` |
| Tooling | Next.js + raw CSS files imported per-component |

What's working well that we **don't want to change**:

- Sora font for headings + Inter for body — consistent and tasteful
- Brand colors (red `#BD1218`, navy `#1D3095`, yellow `#FCD34D`) — well-used, recognizable
- Star+Surveyor logo + favicon iconography — clear brand identity
- IconRail nav (left side, when nav-v2 is on) — clean

The overhaul leaves brand colors / typography / iconography untouched. It introduces a token layer those things can reference, but doesn't change them.

---

## 3. Architecture

### 3.1 — `app/styles/tokens.css` (new)

Defines CSS custom properties (variables) on `:root`. Used everywhere via `var(--…)`. Categories:

| Category | Examples |
|---|---|
| **Spacing scale** | `--space-1: 4px` through `--space-8: 64px` (4 / 8 / 12 / 16 / 24 / 32 / 48 / 64) |
| **Font sizes** | `--text-xs: 0.72rem` through `--text-2xl: 1.6rem` |
| **Font weights** | `--weight-normal: 400; --weight-medium: 500; --weight-semibold: 600; --weight-bold: 700` |
| **Border radii** | `--radius-sm: 4px; --radius-md: 6px; --radius-lg: 10px; --radius-pill: 999px` |
| **Borders** | `--border-light: 1px solid #E5E7EB; --border-normal: 1px solid #D1D5DB; --border-strong: 1px solid #9CA3AF` |
| **Text colors** | `--color-text-primary: #0F1419; --color-text-secondary: #6B7280; --color-text-tertiary: #9CA3AF; --color-text-on-dark: #FFFFFF` |
| **Brand colors** | `--color-brand-red: #BD1218; --color-brand-navy: #1D3095; --color-brand-gold: #FCD34D` |
| **Status colors** | `--color-success: #10B981; --color-warning: #F59E0B; --color-error: #EF4444; --color-info: #3B82F6` |
| **Form heights** | `--input-height: 40px; --button-height: 40px; --button-height-sm: 32px; --button-height-lg: 48px` |
| **Form padding** | `--input-padding-y: 8px; --input-padding-x: 12px` |
| **Shadows** | `--shadow-sm: 0 1px 2px rgba(0,0,0,.04); --shadow-md: 0 2px 8px rgba(0,0,0,.08); --shadow-lg: 0 4px 16px rgba(0,0,0,.12)` |
| **Z-index** | `--z-rail: 40; --z-sidebar: 50; --z-fab: 90; --z-topbar: 100; --z-modal: 200; --z-toast: 300` |
| **Breakpoints** | `--bp-mobile: 599px; --bp-tablet: 1023px; --bp-desktop: 1440px` (documented; CSS uses @media literals) |
| **Transitions** | `--transition-fast: .15s ease; --transition-base: .25s ease; --transition-slow: .4s ease` |

### 3.2 — `app/styles/forms.css` (new)

Uses the tokens to normalize form-element appearance. Selectors target raw HTML inputs + a `.form-input` / `.form-select` / `.form-button` class for opt-in cases.

```css
input[type="text"],
input[type="email"],
input[type="password"],
input[type="number"],
input[type="date"],
input[type="tel"],
input[type="url"],
input[type="search"],
select,
textarea,
.form-input {
  height: var(--input-height);
  padding: var(--input-padding-y) var(--input-padding-x);
  border: var(--border-normal);
  border-radius: var(--radius-md);
  font-family: 'Inter', sans-serif;
  font-size: var(--text-base);
  color: var(--color-text-primary);
  background: #FFF;
  transition: border-color var(--transition-fast);
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--color-brand-navy);
  box-shadow: 0 0 0 3px rgba(29, 48, 149, .15);
}
textarea {
  height: auto;
  min-height: calc(var(--input-height) * 2);
  padding-top: var(--input-padding-y);
  padding-bottom: var(--input-padding-y);
  resize: vertical;
}
```

Plus button variants:

```css
.btn-primary {
  height: var(--button-height);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-brand-navy);
  color: var(--color-text-on-dark);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.btn-secondary { /* outline variant */ }
.btn-danger    { /* red filled */ }
.btn-sm        { height: var(--button-height-sm); padding: 0 var(--space-3); }
.btn-lg        { height: var(--button-height-lg); padding: 0 var(--space-5); }
```

### 3.3 — Migration order (per page)

Pages migrate in order of usage. Top 5: Hub, Jobs (list + new), Receipts, Reports, Payouts. Lower-frequency pages migrate when next touched for a feature change.

---

## 4. Phased delivery

Slices grouped into 4 phases. Each slice = 1 commit + push.

**Verification protocol** — interspersed `Vx` slices re-run `scripts/ui-audit.mjs`
to see if recent fixes actually improved the rendered output. Each verification
slice does:

1. Re-run the audit script against the live site
2. Read screenshots from `/tmp/ui-audit/`
3. **For every issue catalogued as "fixed" since the last checkpoint**: confirm
   the visual change landed. If a fix didn't take, note that in the plan + open
   a follow-up slice.
4. **For any NEW issues discovered during this checkpoint**: append them to the
   plan as additional `U-N` slices in the appropriate phase. The plan grows
   based on what we learn.
5. Commit the audit log delta to `docs/UI_AUDIT.md` so we have history.

This loops until a verification checkpoint finds **zero new issues** + confirms
all prior fixes landed. Only then does the plan move to `completed/`.

### Phase 1 — Unblock functionality (5 slices, ~2 hours)

| Slice | Description | Estimate |
|---|---|---|
| **U-1** | Schema fix: add `receipts.deleted_at` + `receipts.org_id` columns | 30 min | ✅ Shipped + applied — `seeds/283_ui_audit_receipts_columns.sql`. User confirmed the SQL ran in the Supabase SQL Editor. |
| **U-2** | Code fix: `lib/reports/operations-data.ts` `jobs.assigned_to` reference (use `job_team` JOIN or drop) | 20 min | ✅ Shipped — the jobs table's actual column is `lead_rpls_email` (the assigned lead RPLS), not `assigned_to`. Renamed every DB-column reference across `lib/reports/operations-data.ts`, `app/api/admin/reports/operations.csv/route.ts`, and `app/api/admin/reports/job/[jobId]/route.ts`. The output JS field stays `assignedTo` (camelCase) so React components are unaffected. |
| **U-3** | Code fix: `lib/reports/operations-data.ts` `job_time_entries.clock_*` reference (verify column name vs schema) | 20 min | ✅ Shipped — confirmed via `app/api/admin/payroll/runs/route.ts` that the actual column names are `start_time` + `end_time` (not `clock_in_at` + `clock_out_at`). Renamed across the same three reports files. |
| **U-4** | Add roles update SQL helper + apply for `jacobmaddux@starr-surveying.com` (unblocks workspace landings) | 10 min | ✅ Seed shipped — `seeds/284_ui_audit_jacobmaddux_admin_role.sql`. Idempotent (only updates if 'admin' isn't already in the array). **You need to run this in the Supabase SQL Editor** — see §4.5 above. After applying, sign out and back in so the JWT picks up the new roles. |
| **U-5** | Fix `/platform/*` layout inheritance — operator console should not show the marketing header | 30 min |
| **V-1** | **Verification checkpoint** — re-run `scripts/ui-audit.mjs` against the live site. Confirm /admin/receipts no longer 500s, /admin/reports loads cleanly, /platform shows operator layout, workspace landings populate. Append new findings to plan. | 30 min |

### Phase 2 — Universal mobile polish (4 slices, ~3 hours)

| Slice | Description | Estimate |
|---|---|---|
| **U-6** | Add bottom-padding to `.admin-layout__content` on mobile so FAB doesn't overlap content (single CSS rule, fixes ~30 pages) | 15 min |
| **U-7** | Stack Hub greeting card buttons vertically on mobile; persona dropdown full-width | 30 min |
| **U-8** | Fix `/admin/invites` low-contrast text (form labels barely visible on white) | 20 min |
| **U-9** | Fix `/admin/payouts` mobile: "Record payout" button wraps to 2 lines + Method dropdown overflows | 30 min |
| **V-2** | **Verification checkpoint** — re-run audit. Confirm FAB no longer overlaps mobile content, Hub greeting card stacks cleanly, invites text is readable, payouts mobile fits. Append findings. | 30 min |

### Phase 3 — Design system foundation (6 slices, ~2 days)

| Slice | Description | Estimate |
|---|---|---|
| **U-10** | Create `app/styles/tokens.css` with the full token catalog | 1 hour |
| **U-11** | Create `app/styles/forms.css` normalizing input / select / textarea / button to uniform heights | 2 hours |
| **U-12** | Import tokens + forms globally in `app/layout.tsx` so every page picks them up | 15 min |
| **V-3** | **Verification checkpoint** — re-run audit. Confirm tokens are loaded (inspect any page's computed CSS for `--space-4` etc.) and no global regressions before migrating page CSS. | 30 min |
| **U-13** | Migrate `/admin/me` (Hub) to use tokens — refactor `AdminMe.css` ad-hoc values | 2 hours |
| **U-14** | Migrate `/admin/jobs` + `/admin/jobs/new` (Jobs list + new) to use tokens | 2 hours |
| **U-15** | Migrate `/admin/receipts` + `/admin/reports` + `/admin/payouts` (3 highest-traffic new-feature pages) to use tokens | 3 hours |
| **V-4** | **Verification checkpoint** — re-run audit. Confirm all 5 migrated pages have consistent form-element heights, button styles, and spacing. Buttons/inputs/dropdowns should now line up in every row. Append findings. | 30 min |

### Phase 4 — Per-page polish from audit (6 slices, ~half day)

| Slice | Description | Estimate |
|---|---|---|
| **U-16** | Signup price formatter: `"$79.20mo"` → `"$79.20/mo"` (`/signup` mobile + tablet) | 15 min |
| **U-17** | `/about` team — add Cypriene's missing role/title | 5 min |
| **U-18** | `/` marketing — fix distorted "Starr Surveying" wordmark logo in header | 30 min |
| **U-19** | `/` mobile — "Why Starr Surveying?" 4-column stat block: keep 2-column on small mobile instead of collapsing to 1 | 30 min |
| **U-20** | Footer mobile — "Write a Review" + "Copy Link" button alignment + icon rendering | 30 min |
| **V-5** | **Final verification checkpoint** — re-run audit, save final screenshot set, diff against the original baseline. Confirm 0 new findings. If any remain, append slices U-22+ to continue the loop. | 1 hour |
| **U-21** | When V-5 finds zero outstanding issues: move this plan to `docs/planning/completed/`. Final commit. | 5 min |

---

## 4.5 — How to apply new SQL seeds

When a slice ships a seed file (e.g., U-1 ships `seeds/283_*.sql`), you apply it via the **Supabase SQL Editor**:

1. Open https://supabase.com/dashboard/project/pmpjaqrmxnbfdayddrha/sql/new
2. Open the seed file on GitHub at its raw URL (e.g., `https://github.com/juggernautjake/STARR-SURVEYING/raw/claude/planning-doc-buildout-bQL2H-3rzxF/seeds/283_ui_audit_receipts_columns.sql?v=1` — append `?v=N` if you've already loaded it once to bypass browser cache)
3. Copy the entire contents
4. Paste into the SQL Editor
5. Click **Run**
6. Verify the result: each seed file has a `-- Verification` block at the bottom showing the queries to run and the expected output

All seeds in this branch use `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` patterns so re-running is safe.

After applying, the slice's "shipped" annotation in the table above gets the SQL run confirmed.

## 5. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Token migrations break layouts in subtle ways | Medium | Migrate one page at a time; re-screenshot via `ui-audit.mjs` before + after each |
| The "no FAB overlap" CSS change breaks the FAB positioning itself | Low | Add the bottom-padding to `.admin-layout__content`, not the FAB. FAB stays `position:fixed` at its existing bottom offset. |
| Adding `receipts.deleted_at` conflicts with code that already assumes the column doesn't exist | Low | Read the existing receipts code paths first; the audit error message was clear about expecting the column |
| `jobs.assigned_to` JOIN through `job_team` is slow on large job tables | Low | At your scale (3 users, dozens of jobs) this isn't a concern. Add index later if needed. |
| Layout fix for `/platform` could break operator console for users who aren't yet seeing the marketing-header issue | Low | Verify post-change that `/platform` still renders the dark operator console layout |

---

## 6. Open questions

1. **Background color of `--color-text-on-dark`** — should that be pure white `#FFFFFF` or off-white `#F9FAFB`? Recommend pure white for max contrast on the navy headers we have.
2. **Should we add a CSS reset / normalize** as part of `tokens.css`? Recommend yes — small modern CSS reset to neutralize default browser styles.
3. **Migrate marketing-site pages too?** Not in scope here. Marketing fixes are in Phase 4 (U-18/19/20) but full marketing redesign is deferred.
4. **Should `.btn-primary` etc. classes be added to a single shared file, or split into `buttons.css` + `forms.css` + `tables.css`?** Recommend one `forms.css` with form-related elements + buttons grouped together. Tables can come later if a need arises.
5. **Should every existing page-CSS file be deleted as it's migrated?** No — leave the old class names in place during migration and only delete the duplicated style rules. That way the JSX doesn't have to change in one giant commit.

---

## 7. Definition of done

The overhaul is complete when:

1. `/admin/receipts` no longer 500s.
2. `/admin/reports` shows real data with no broken-query warnings.
3. `/platform` renders inside its own dark operator-console layout, no marketing header.
4. Every authenticated mobile page can be scrolled to the bottom without the FAB blocking content.
5. The Hub greeting card on mobile fits comfortably without the buttons forcing the text to wrap to 4 lines.
6. `/admin/invites` form labels are readable at standard distance from the screen.
7. `/admin/payouts` mobile fits within the viewport with no horizontal overflow.
8. `app/styles/tokens.css` exists and defines the full token catalog.
9. `app/styles/forms.css` exists and is loaded globally; inputs / selects / textareas / buttons render with consistent heights everywhere on the 5 migrated pages.
10. Visual diff (via re-run of `scripts/ui-audit.mjs`) shows the Phase 1-3 fixes confirmed and no regressions on other pages.

---

## 8. Cross-references

- `docs/UI_AUDIT.md` — the source of truth for what's broken and where
- `scripts/ui-audit.mjs` — the audit tool, used for before/after verification
- `app/admin/styles/AdminLayout.css` — current layout CSS, gets the FAB fix
- `lib/reports/operations-data.ts` — broken queries get fixed in U-2/U-3
- `seeds/280_reports_job_result.sql` — example pattern for U-1 column additions
- `app/admin/components/AdminLayoutClient.tsx` — already touched for hamburger fix; might need `/platform` carve-out
- `docs/planning/completed/CUSTOMER_PORTAL.md` — design context for the customer-portal pages this overhaul polishes
