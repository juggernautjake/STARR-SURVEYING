# UI / UX Audit — Starr Surveying

**Date:** 2026-05-21
**Method:** Headless Chromium via `scripts/ui-audit.mjs` at three viewports:
- **Mobile** 390 × 844 (iPhone 14)
- **Tablet** 768 × 1024 (iPad portrait)
- **Desktop** 1440 × 900 (laptop)
**Pages captured:** 54 routes × 3 viewports = 162 screenshots
**Auth:** signed in as `jacobmaddux@starr-surveying.com` (admin role)

---

## 1. Cross-cutting issues (root causes)

These are the systemic problems that produce the "things look weird and don't line up" feeling across pages. Fixing these once benefits dozens of pages at once.

### 1.1 — No design tokens / variables

The codebase has **~30 page-specific CSS files** and **no central design system**. Concrete evidence:

- Input fields use **15+ different padding values** across files (`.35rem .55rem`, `.4rem .6rem`, `.5rem`, `.5rem .65rem`, etc.)
- Buttons in different files have heights of 28px, 36px, 40px, 44px, 48px depending on which page authored them
- 13 different CSS files style raw `input` selectors independently

**Result:** every form on every page has slightly different element heights → buttons, inputs, and dropdowns in the same row never align cleanly.

**Fix:** create `app/styles/tokens.css` with:
- `--space-1` through `--space-8` (4/8/12/16/24/32/48/64 px scale)
- `--input-height: 40px;` (uniform)
- `--input-padding-y: 8px; --input-padding-x: 12px;`
- `--border-radius-sm/md/lg`
- `--text-xs` through `--text-2xl`
- `--color-border-light/normal/dark`
- `--color-text-primary/secondary/tertiary`

Then a `forms.css` that uses these to normalize `input`, `select`, `textarea`, `button` to the same height + padding pattern. Replace ad-hoc styles incrementally as we touch each page.

**Estimated effort:** 1 day to write the tokens + forms file. Then ~30 min per page to migrate.

### 1.2 — Floating FAB menu overlaps page content

The green FAB pill (Messenger / Discussion / Fieldbook) is `position:fixed` at bottom-right and **overlaps the lower half of mobile content** on dozens of pages — most notably the Hub (covers "Recent" list), Reports (covers warning box + Jobs section), Payouts, Receipts, Hours.

**Fix:** add bottom padding to `.admin-layout__content` on mobile equal to the FAB height + safe area, so content naturally clears the FAB.

```css
@media (max-width: 768px) {
  .admin-layout__content {
    padding-bottom: 90px;  /* FAB height + breathing room */
  }
}
```

### 1.3 — Greeting card layout collapses badly on mobile

The dark-blue greeting card at the top of `/admin/me` and `/admin/my-hours` puts text + 3 buttons + a persona-dropdown on the same row. On mobile the layout becomes:

```
Good   | Open timesheet
evening,| View schedule
Jacob. | Revert to old nav
       | Persona  ?  (cut off)
```

Text on the left wraps awkwardly to 4 lines because the buttons take 60% of the row. The Persona dropdown is cut off horizontally.

**Fix:** on mobile, stack the buttons under the greeting (`flex-direction: column` on the parent at mobile width). Persona dropdown becomes full-width.

### 1.4 — Inconsistent button styles

I see at least four distinct button visual languages across the app:

| Pattern | Example | Where used |
|---|---|---|
| Yellow filled | "Send invite" | Invites page |
| Blue filled | "+ Record payout", "Sign In" | Payouts, login |
| Outline | "Open timesheet", "View schedule" | Hub greeting card |
| Red filled | "Get a Free Quote" | Marketing footer |

These conflict — `Send invite` (yellow) vs `+ Record payout` (blue) for "primary action" decisions is confusing.

**Fix:** pick **one** primary-action style (probably blue filled — already used in most places) and one secondary style (outline). Yellow is fine for warnings / destructive confirm but not primary actions.

### 1.5 — Text contrast issues

Several pages have text that's nearly invisible:
- `/admin/invites` mobile — the form labels, placeholder, and "No invites yet" message are all rendering in very light gray that's barely readable on the white background
- `/admin/me` greeting card — the secondary text ("Clock-state widget lands in slice 2b") is gray-on-blue and hard to read

**Fix:** establish `--color-text-primary: #0F1419` (high contrast), `--color-text-secondary: #6B7280` (still readable), `--color-text-tertiary: #9CA3AF` (sparingly). Audit places using `#ccc` / `#ddd` / `rgba(0,0,0,0.4)` and bump up.

### 1.6 — Marketing-site header bleeding into operator console

`/platform` on desktop renders inside the **marketing site's layout** instead of the operator console's dark-theme layout. The page shows "Starr Surveying" top nav (Services / Pricing / Contact) above the operator dashboard.

**Fix:** look at `app/platform/layout.tsx` — likely the layout file isn't intercepting properly, OR the operator-gate isn't catching the case where the operator_users row exists but the layout still falls back to root.

---

## 2. Backend issues surfaced by the audit

The screenshot session uncovered three real production bugs that aren't UX issues but block functionality:

### 2.1 — `receipts.deleted_at` column missing

The receipts page errors with `column receipts.deleted_at does not exist`. Seed 220 creates the table but doesn't add `deleted_at`. Either:
- Add `deleted_at TIMESTAMPTZ` to the receipts table (recommended)
- OR remove the soft-delete check from the receipts query

### 2.2 — `jobs.assigned_to` column missing

The Operations Report errors with `column jobs.assigned_to does not exist`. The reports code references this column but the legacy jobs schema uses `job_team` (a separate table) for assignees.

**Fix:** update `lib/reports/operations-data.ts` to either:
- Drop the `assigned_to` reference if not needed
- OR join `job_team` to derive assignee
- OR add a derived `assigned_to` column to jobs (snapshot of the lead RPLS)

### 2.3 — `receipts.org_id` column missing

Same reports error. The receipts table from seed 220 doesn't have `org_id`. The SaaS-pivot backfill seed (263) was supposed to add `org_id` to all tenant tables, but receipts didn't have the table yet when 263 ran.

**Fix:** run `ALTER TABLE receipts ADD COLUMN org_id UUID REFERENCES organizations(id);` + backfill with Starr's org_id for existing rows.

### 2.4 — `job_time_entries.clock_in_at` (probably) missing

The hours query also errored on a column starting with `clock_…` — likely `clock_in_at`. Need to verify the schema vs what the reports code expects.

---

## 3. Per-page findings (top issues)

Reviewed in detail: 16 of the 54 pages. The patterns repeat across the rest. Format: **page → mobile / tablet / desktop → top issues**.

### `/admin/me` (Hub)

- 📱 **Mobile:** greeting card cramped (§1.3); FAB overlaps Recent list (§1.2); Persona dropdown cut off; Quick Actions "View reports" + "Record payout" tiles wrap to 2 buttons per row (acceptable)
- 📲 **Tablet:** layout improves; greeting card still has cramped buttons but tolerable
- 🖥️ **Desktop:** clean — no major issues; the new tiles look fine

### `/admin/reports` (Operations Report)

- 📱 **Mobile:** server-error banner visible (§2.x); FAB overlaps stat cards
- 🖥️ **Desktop:** filters row + section toggle chips render OK; PDF print button is visible; Financial Roll-up table looks good

### `/admin/payouts`

- 📱 **Mobile:** "Record payout" button wraps to 2 lines ("Record\npayout") which looks broken; Method dropdown overflows the right edge of the viewport
- 🖥️ **Desktop:** clean — single-line button, dropdowns aligned

### `/admin/billing`

- 📱 **Mobile:** Overview / Invoices / Plan history tabs cramped; "Active bundles" shows 6 pill buttons that wrap to 3 lines (acceptable); FAB overlaps "Cancel subscription" section heavily
- 🖥️ **Desktop:** acceptable; tabs in the right place

### `/admin/invites`

- 📱 **Mobile:** **critical contrast issue** — form labels, placeholders, "No invites yet" message all rendering in very light gray, barely readable
- 🖥️ **Desktop:** same contrast issue likely

### `/admin/jobs/new`

- 📱 **Mobile:** under-construction yellow banner is OK; form fields are reasonable; FAB overlaps the middle of the form (Deadline / Description fields hidden behind it)
- 🖥️ **Desktop:** form is two-column-friendly; tooltips ("?") render small

### `/admin/receipts`

- 📱 **Mobile:** server error 500 + error-report modal pops up (§2.1)
- 🖥️ **Desktop:** same backend error

### `/platform` (operator console)

- 📱 **Mobile:** marketing-site footer mixed in (§1.6); content readable but layout confusing
- 🖥️ **Desktop:** **critical** — marketing-site header shown above the operator console (§1.6)

### `/admin/work`, `/admin/research-cad`, `/admin/office`, `/admin/equipment`, `/admin/knowledge` (workspace landings)

- All show **"0 pages in this workspace. ... No pages in this workspace are accessible with your current role + access. Ask an admin if this looks wrong."** — even though I'm signed in as ADMIN
- This suggests the role-gate logic is broken OR your `roles` array still doesn't include `admin` for `jacobmaddux@starr-surveying.com`

**Action:** verify the `registered_users.roles` for jacobmaddux includes `admin`:

```sql
SELECT email, roles FROM registered_users WHERE email = 'jacobmaddux@starr-surveying.com';
```

If `admin` isn't in the array, run:

```sql
UPDATE registered_users
SET roles = ARRAY['admin', 'developer', 'researcher', 'drawer', 'field_crew', 'employee']::text[]
WHERE email = 'jacobmaddux@starr-surveying.com';
```

Then sign out and sign back in — the JWT picks up the new roles.

### Other admin pages

Patterns repeat: FAB overlap, no token-driven spacing, varied button styles. Detailed review pending — the per-page list is mostly more of the same issues §1.1–§1.5.

---

## 4. Prioritized fix queue

Recommended order to address the biggest impact first.

### Critical (block functionality)

1. **Add `receipts.deleted_at` column** — fixes /admin/receipts 500 error
2. **Add `receipts.org_id` column** — fixes /admin/reports error
3. **Fix `jobs.assigned_to` reference in reports** — broken query
4. **Run roles update for jacobmaddux** — unlocks workspace landings
5. **Fix `/platform` layout inheritance** — operator console shouldn't show marketing header

### High (visible bad UX everywhere)

6. **Add bottom padding to `.admin-layout__content` on mobile** — fixes FAB overlap on every authenticated page (§1.2)
7. **Stack Hub greeting card buttons vertically on mobile** — fixes the cramped 4-line text wrap (§1.3)
8. **Fix `/admin/invites` text contrast** — barely-readable form labels
9. **Fix `/admin/payouts` mobile** — button wraps to 2 lines, dropdown overflows

### Medium (consistency / polish)

10. **Create `app/styles/tokens.css`** (§1.1) — design system foundation
11. **Create `app/styles/forms.css`** (§1.1) — normalize input/select/button heights to 40px
12. **Pick one primary button style** and apply across pages (§1.4)
13. **Audit + bump low-contrast text colors** (§1.5)

### Low (nice-to-have)

14. **Header logo** — the stretched "Starr Surveying" wordmark on marketing pages looks distorted (noted in earlier public-page audit)
15. **Signup page price formatter** — "$79.20mo" missing the slash
16. **Cypriene team member** — missing role/title on `/about` page

---

## 5. Recommended approach

Don't try to fix everything at once. Three phases:

### Phase 1 — Unblock functionality (1-2 hours)

Items 1-5 from the Critical list above. SQL + small code patches.

### Phase 2 — Universal mobile polish (half day)

Items 6-9 from High. These are 3-5 line CSS / component patches each, and item 6 alone fixes ~30 pages.

### Phase 3 — Design system foundation (2-3 days)

Items 10-12. Write `tokens.css` and `forms.css`. Migrate the 5 most-used pages first (Hub, Jobs, Receipts, Reports, Payouts). Iterate.

The remaining items can wait until someone notices them.

---

## 6. How this audit was generated

Run this in Claude Code in a future session to re-audit (e.g., after a redesign):

```bash
STARR_EMAIL='jacobmaddux@starr-surveying.com' \
STARR_PASSWORD='<password>' \
node scripts/ui-audit.mjs
```

Screenshots land in `/tmp/ui-audit/`. View any of them with the Read tool to see the rendered page at the captured viewport.

To customize:
- `BASE_URL=https://your-preview-url.vercel.app` — point at a different deployment
- Edit `VIEWPORTS` in the script to test different sizes (e.g., add a 320×568 iPhone SE for the smallest current phone)
- Edit `AUTH_PAGES` to add / remove routes from the audit

---

**Total findings:** 6 cross-cutting issues + 4 backend bugs + 16 page-specific issues = **26 actionable items**, sorted into 16 in the prioritized queue above.
