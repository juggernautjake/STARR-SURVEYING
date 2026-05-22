# Pay Progression Overhaul

**Status:** Planning — slices below ship one at a time per the in-progress / completed cycle.
**Total estimate:** ~7 engineering days across 26 slices + 6 verification checkpoints.
**Related:** previous `docs/planning/completed/UI_UX_OVERHAUL.md` established the token system this plan builds on.

---

## 0. tl;dr

The `/admin/pay-progression` page used to feel like a "ladder" — visible progression, tier cards, achievement badges, an XP bar. Today it's mostly text in a stack of `<section>` boxes. The structure is there in the DB (`work_type_rates`, `role_tiers`, `seniority_brackets`, `credential_bonuses`, `xp_pay_milestones`, `pay_system_config`) but the page reads them like a printout, not a path.

This overhaul:

1. **Restores the visual ladder** — tier-by-tier progression with a current-position marker, credential badges with earned/locked states, an XP bar that fills as the user climbs, a hero card that shows "you are here / next step is X away."
2. **Makes every value admin-editable** — the same six config tables get a CRUD surface on the page itself (gated to admins), no more SQL-only edits.
3. **Wires roles → titles → tiers** — `PayrollConstants.tsx` currently hard-codes 6 job titles while `role_tiers` has 14 tiers. Collapse that disconnect; titles come from the DB.
4. **Adds per-user overrides** — new `user_pay_overrides` table + UI so admins can pin an individual employee's rate, bonus stack, or progression milestone independent of the default system, with reason + audit trail.
5. **Connects certifications → automatic raise triggers** — `/admin/learn` completion writes to `employee_earned_credentials`, the pay page previews the bump before it applies, and the admin approves.
6. **Continues the broader UI/UX audit** — Phase 6 sweeps other admin surfaces (Office, Equipment, Schedule, Knowledge) for the same kind of styling regressions.

---

## 1. Goals & non-goals

### Goals

- Make `/admin/pay-progression` visually communicate progression instead of describing it. A new employee should understand the path at a glance.
- Stop requiring SQL Editor access to tune the pay system. Admins / owners edit values, tiers, bonuses, caps — and see the effect immediately.
- Tie roles/titles assigned in user management directly to the pay calculation. No two hard-coded title lists.
- Allow per-employee overrides without breaking the default system. Default stays the source of truth; override is a clearly-labeled exception.
- Keep using the design tokens shipped in the UI/UX overhaul (`tokens.css`, `forms.css`). No new color palettes.

### Non-goals

- **Payroll-run engine rewrite.** Existing `/admin/payroll` and the `payroll/runs` API stay as-is. This plan touches the *progression* surface and the *config* it reads, not the run-creation pipeline.
- **Time-tracking changes.** `/admin/my-hours` and `job_time_entries` are out of scope.
- **Tax / withholding logic.** Pure pay-progression visualization + editing; no tax rules.
- **Multi-currency / multi-tenant pay overrides.** Single org, USD.
- **Public-facing pay page.** This stays inside `/admin/*` — gated to authenticated employees + admins.

---

## 2. Current state

| Aspect | Today |
|---|---|
| Pay-progression page | `app/admin/pay-progression/page.tsx` (635 lines). Read-only. Fetches `/api/admin/rewards?section=pay`. Renders 6 `<section>` boxes top-to-bottom: current breakdown, base rates, role tiers, seniority brackets, credentials, XP milestones, transparency, worked example. |
| Pay-progression CSS | `app/admin/styles/AdminRewards.css` lines 162–300+ contain `.pay-prog__*`. Has tier-card, timeline, and grid classes but the page underutilizes them. |
| Config tables | `work_type_rates` (10), `role_tiers` (14), `seniority_brackets` (8), `credential_bonuses` (15), `xp_pay_milestones` (6), `pay_system_config` (caps). All seeded in `seeds/001_config.sql`. |
| User-level pay data | `employee_profiles.hourly_rate` (direct field). `employee_certifications.pay_bump_amount` per cert. `pay_raises` history. No `user_pay_overrides` table. |
| Roles vs. titles | `registered_users.roles TEXT[]` is the access-scope array (admin/developer/employee/etc). `employee_profiles.job_title` is a TEXT field. `role_tiers.role_key` is the pay-grade key. Three separate name spaces, no shared vocabulary. |
| Job title list | Hard-coded in `app/admin/components/payroll/PayrollConstants.tsx:4-11` — 6 titles only (survey_technician, instrument_operator, party_chief, survey_drafter, office_tech, lead_rpls). `role_tiers` has 14. The dropdown on the payroll page cannot select e.g. "Senior RPLS" or "Project Manager". |
| Certification → pay link | Hard-coded `credential_bonuses` table. `/admin/learn` completion isn't wired to `employee_earned_credentials` insert (verified-by-admin only path today). |
| Admin CRUD UI for pay config | None. Values change via SQL Editor. |

---

## 3. Architecture

### 3.1 — Calculation order

The "effective rate" for a given user on a given task is a deterministic stack. Document and implement it as a single function (`lib/payroll/effective-rate.ts`) so the admin CRUD UI and the per-user override page produce the same number.

```
effective_rate(user, work_type) =
  override.fixed_rate  if user.pay_overrides.fixed_rate is set
  else
    work_type_rates[work_type].base_rate
    + role_tiers[user.tier_key].base_bonus                       × override.role_bonus_multiplier (default 1)
    + currentBracket(user.years_employed).bonus_per_hour         × override.seniority_multiplier (default 1)
    + Σ credential_bonuses[c].bonus_per_hour for c in user.earned (capped by pay_system_config.max_credential_stack)
    + Σ xp_pay_milestones[m].bonus_per_hour for m where user.xp ≥ m.threshold (capped by pay_system_config.max_xp_milestone_bonus)
    + override.flat_addition                                     (default 0)
  clamped to work_type_rates[work_type].max_bonus_cap (if set)
  clamped to role_tiers[user.tier_key].max_effective_rate (if set)
```

Override fields (`user_pay_overrides`):

| Field | Type | Purpose |
|---|---|---|
| `fixed_rate` | NUMERIC(10,2) NULL | If set, ignores the whole formula. Admin pins an exact $/hr. |
| `role_bonus_multiplier` | NUMERIC(4,3) DEFAULT 1.0 | Scales the role bonus (1.0 = no change, 0 = strip it). |
| `seniority_multiplier` | NUMERIC(4,3) DEFAULT 1.0 | Same for seniority. |
| `flat_addition` | NUMERIC(10,2) DEFAULT 0 | $/hr added on top. Use for "+$2 because Hank said so". |
| `reason` | TEXT | Required when any override field is non-default. |
| `effective_date` | DATE | When the override takes effect. |
| `expires_at` | DATE NULL | Optional sunset. |
| `approved_by` | TEXT (email) | Audit trail. |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.2 — Visual surfaces

| Surface | What changes |
|---|---|
| Hero card | Replace the 4-column grid with a single "You're here" card: current title, current effective rate large + green delta vs base rate, "next milestone" callout with the $/hr gain it unlocks. |
| Tier ladder | New component `<TierLadder>`. Vertical stepped list of all `role_tiers` ordered by `base_bonus`. Current tier highlighted; tiers below show as "✓ unlocked", above as "🔒 next steps". Click a tier to see who else is in it (admin view only). |
| Credentials gallery | Replace `pay-prog__creds-grid` flex column with a true grid of badge cards. Earned credentials show in full color + earned date; locked ones are grayscaled with `+$X/hr when earned` tooltip. |
| XP milestones bar | A horizontal progress bar with milestone notches; each notch tags `$0.50/hr unlocked`. Current XP fills the bar; passed notches glow gold. |
| Worked example | Keep but make it interactive — sliders/dropdowns to "play with" role + credentials + years, watch the live effective rate update. |
| Admin edit mode | A floating "Edit pay system" pill (top-right) toggles admin-only inline edit affordances on every config card. Save writes through to `/api/admin/payroll/rates` (already exists for some tables — extend it). |
| Per-user override | New page `/admin/pay-progression/[email]` for any admin viewing a specific employee. Shows the same visuals plus an override panel. |

### 3.3 — Roles ↔ titles ↔ tiers

After this overhaul:

- `registered_users.roles` stays as the access-scope array (auth gate).
- `role_tiers` becomes the canonical pay-grade table (14 entries today, fully editable).
- `employee_profiles.tier_key` (renamed from `job_title`) FK-references `role_tiers.role_key`.
- The "job title" dropdown everywhere reads from `role_tiers` (no more hard-coded list).
- Optional `role_tiers.aliases TEXT[]` for backward-compat strings ("party_chief" vs. "Party Chief").

This is a one-time data migration. Old `employee_profiles.job_title` values backfill into `tier_key` via a slug/alias match.

---

## 4. Slices

Phases mirror the structure of `docs/planning/completed/UI_UX_OVERHAUL.md`: each slice is a single PR-sized change with a verification step. Checkpoints (`V-N`) re-screenshot the page so we can compare before/after.

### Phase 1 — Visual restyling (5 slices, ~1.5 days)

| Slice | Description | Estimate |
|---|---|---|
| **P-1** | Hero card: replace 4-column "Current Pay Breakdown" with a stacked "You are here" panel (large effective rate, tier badge, next milestone delta, mini sparkline). Token-driven. | 3 hours | ✅ Shipped — `app/admin/pay-progression/page.tsx` swaps the 4-column `.pay-prog__current` grid for a `.pay-prog__hero` card with two columns: left shows current tier + the large effective rate ($24.50/hr style) + chip breakdown (Base, Role +$X, Seniority +$Y, Credentials +$Z); right shows the closest unlock-able next milestone with its $/hr delta in brand-gold. Picker function (`pickNextMilestone`) ranks candidates from next tier promotion, next seniority bracket, and the highest-bonus unearned credential, returning the largest delta. `app/admin/styles/AdminRewards.css` replaces the old `.pay-prog__current*` block with a fully token-driven hero stylesheet (brand-navy gradient, gold accent chips for bonuses, white text on dark surface). Mobile media query at 720px stacks the two columns and swaps the vertical divider for a horizontal one. Typecheck clean; 234 braces balanced. |
| **P-2** | `<TierLadder>` component: vertical stepped tier list ordered by `base_bonus`, current tier highlighted, locked tiers grayscaled, $/hr badge on each step. Replaces `pay-prog__timeline` horizontal scroll. | 4 hours | ✅ Shipped — the Role Progression section now uses an `<ol className="pay-prog__ladder">` of `.pay-prog__rung` rows, ordered ascending by `base_bonus`. Each rung is a CSS grid (40px marker / 1fr body / auto stats) with state classes `--unlocked` (✓ green-bg check, faded label), `--current` (brand-navy gradient row, white-circle marker with pulsing ring + "You are here" pill), `--locked` (gray marker with lock SVG, muted label). Vertical connector lines drawn between rungs via `::before` pseudo-elements, colored by the rung-above's state (success-green below current, navy at current, default-gray above). Includes `prefers-reduced-motion` opt-out for the pulse. Mobile breakpoint at 600px collapses stats onto a second row below the body. Type interface extended with optional `description` and `sort_order`. Typecheck clean; 265 braces balanced. |
| **P-3** | Credentials gallery: grid of badge cards, earned in color + earned date, locked grayscale + "+$X/hr" tooltip. Replaces `pay-prog__creds-grid` flex column. | 3 hours | ✅ Shipped — `.pay-prog__creds-grid` flex column replaced with `.pay-prog__badges` (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`). Each `.pay-prog__badge` is a card with a 48px medal slot + body + meta row. Earned state: brand-gold medal SVG (trophy ribbon), full-color border, earned-month displayed below the bonus in navy. Locked state: grayscale medal with lock SVG, 0.78 opacity, "Locked" label. Section header now shows `{earned} of {total} earned · cap +$8.00/hr` for at-a-glance progress. Cards sorted by bonus amount descending so high-value credentials surface first. Hover lift + shadow. Typecheck clean; 276 braces balanced. |
| **P-4** | XP milestones bar: horizontal progress bar with notches at each `xp_threshold`, gold-glow on passed notches, current XP fill. | 2 hours | ✅ Shipped — replaced the horizontal-scroll milestone strip with a single horizontal `<div role="progressbar">` track. Track height 14px with a pill radius; fill is a `--color-brand-navy → --color-brand-gold` gradient sized to `(total_earned / maxThreshold) × 100%` with a soft gold glow. Each `xp_pay_milestones` row renders as a notch positioned absolutely along the track, with the $/hr unlock tag above the dot and the threshold label (`10k`, `20k`, etc.) below. Passed notches glow gold with a layered box-shadow halo; future notches stay gray with hollow dots. Section header tally shows `{currentXp} XP earned · +${unlockedBonus}/hr unlocked · cap +$3.00/hr`. Below the bar, a "X XP to next milestone unlocks +$Y/hr" hint shows the immediate goal. Wired `xp_balances.total_earned` through the page (was already on the API response, just unused). Typecheck clean; 291 braces balanced. |
| **P-5** | Interactive worked example: role/credentials/years inputs at the top of the section, live recalculated effective rate below. No DB writes — pure preview. | 3 hours | ✅ Shipped — new `<PayCalculator>` component (in-file for now; Phase 4 P-16 lifts the math into `lib/payroll/effective-rate.ts`). Two-column layout: left has the form (role select / work-type select / years input / XP input / credentials checkbox grid), right has the live output (large effective rate + breakdown stack). Pre-fills from the user's current values so the result matches the hero card until they tweak. Math mirrors the calculation order in §3.1: role + seniority + credential (capped $8) + XP (capped $3) → raw bonus → ×work-type multiplier → work-type cap → role ceiling. Stack shows each step; "capped from $X" hint when a cap kicks in; warning-colored rows for work-type cap or role ceiling. Inputs use the global token-driven form styles. Mobile breakpoint at 720px collapses to a single column. Typecheck clean; 320 braces balanced. |
| **V-1** | **Verification checkpoint** — re-run `scripts/ui-audit-v1.mjs` against `/admin/pay-progression`. Visually confirm the 5 new surfaces render at mobile + desktop. Append findings; if any are broken, add P-5a/b/c here before Phase 2. | 30 min | ✅ Shipped — added `scripts/ui-audit-pay-prog.mjs` (focused audit for `/admin/pay-progression`). Baseline captured at `/tmp/pay-prog-v1/` (2 shots, mobile + desktop). Production main shows the **pre-overhaul state** because Phase 1 changes (P-1..P-5) are on branch HEAD `2837c95` awaiting merge. Static verification passes throughout: `tsc --noEmit` clean after every slice; `AdminRewards.css` brace balance went 234 → 265 → 276 → 291 → 320 with each slice (matching the new style blocks added). The 5 new surfaces are: `.pay-prog__hero` (P-1), `.pay-prog__ladder` (P-2), `.pay-prog__badges` (P-3), `.pay-prog__xp-bar` (P-4), `.pay-prog__calc` (P-5). No regressions to the existing transparency / education / FS-exam blocks — those still use the original styling. Visual confirmation of the new surfaces will follow the next Vercel deploy. |

### Phase 2 — Roles, titles, tiers consolidation (3 slices, ~1 day)

| Slice | Description | Estimate |
|---|---|---|
| **P-6** | SQL seed: add `role_tiers.aliases TEXT[]`, add `employee_profiles.tier_key TEXT REFERENCES role_tiers(role_key)`, backfill `tier_key` from existing `job_title` via alias match. Keep `job_title` writable for now (Phase 7 deletes it). | 2 hours |
| **P-7** | Replace hard-coded `JOB_TITLES` in `app/admin/components/payroll/PayrollConstants.tsx` with a server-fetched list from `role_tiers`. Update every dropdown that imports `JOB_TITLES` (search the codebase, it's ~8 call sites). | 2 hours |
| **P-8** | New admin role-assignment widget on the user-management page: select tier from a dropdown sourced from `role_tiers`; show that tier's `base_bonus` + `max_effective_rate` inline so the admin sees what they're granting. | 2 hours |
| **V-2** | **Verification checkpoint** — confirm: title dropdowns everywhere show all 14 tiers (not 6); existing employees still have a valid `tier_key`; the pay-progression page shows the user's tier in the hero card. Append findings. | 30 min |

### Phase 3 — Admin CRUD on the pay-system config (6 slices, ~2 days)

| Slice | Description | Estimate |
|---|---|---|
| **P-9** | "Edit pay system" pill (admin-only) on `/admin/pay-progression`. Toggling enables inline edit affordances (pencil icons next to every config value). Off by default. | 2 hours |
| **P-10** | CRUD on `work_type_rates`: edit `base_rate`, `bonus_multiplier`, `max_bonus_cap`, `icon`, `label`. Add/remove work types. Extend `/api/admin/payroll/rates` (already exists for reading). | 3 hours |
| **P-11** | CRUD on `role_tiers`: edit `label`, `base_bonus`, `max_effective_rate`, `description`, `sort_order`. Add/remove tiers (with safety check — can't remove a tier that any employee has). | 3 hours |
| **P-12** | CRUD on `seniority_brackets`: edit boundaries + bonus, add/remove brackets. | 2 hours |
| **P-13** | CRUD on `credential_bonuses` + `xp_pay_milestones`: edit credential bonuses and thresholds. Add custom credentials beyond the seeded 15. | 3 hours |
| **P-14** | CRUD on `pay_system_config` (the caps row): edit the 4 cap values inline. | 1 hour |
| **V-3** | **Verification checkpoint** — confirm: editing any config value persists via the new API; effective rate calculation reflects the new values on the next page load; non-admin users do NOT see the edit pill or API endpoints. Append findings. | 1 hour |

### Phase 4 — Per-user pay overrides (4 slices, ~1.5 days)

| Slice | Description | Estimate |
|---|---|---|
| **P-15** | SQL seed: create `user_pay_overrides` table per §3.1, with all the fields (fixed_rate, multipliers, flat_addition, reason, effective_date, expires_at, approved_by). Idempotent CREATE TABLE IF NOT EXISTS. Add audit triggers. | 2 hours |
| **P-16** | `lib/payroll/effective-rate.ts` — single canonical calculation function consumed by the pay-progression page, the payroll-run engine (read-side only), and the override preview. Unit tests for each branch of the formula. | 3 hours |
| **P-17** | Override UI: new page `/admin/pay-progression/[email]` for admins viewing a specific employee. Shows the standard pay-progression visuals computed for that employee, plus an "Override panel" with all override fields. Before/after preview when fields change. | 4 hours |
| **P-18** | Audit-trail viewer: history of all overrides applied to an employee (date, who changed what, reason). Shown below the override panel. | 2 hours |
| **V-4** | **Verification checkpoint** — confirm: setting `fixed_rate` pins the rate everywhere it's calculated; multipliers + flat additions stack correctly; non-default overrides require a `reason`; audit trail captures who/what/when. Append findings. | 1 hour |

### Phase 5 — Certifications → automatic raise triggers (3 slices, ~1 day)

| Slice | Description | Estimate |
|---|---|---|
| **P-19** | Wire `/admin/learn` completion to `employee_earned_credentials` insert. When a user completes a learning module that maps to a credential, the row is inserted with `verified=false`. Admin approves to flip `verified=true` (which is what the pay calc reads). | 3 hours |
| **P-20** | "Preview the bump" on the pay-progression page: for each locked credential, show "If you earn this, your effective rate becomes $X/hr (+$Y/hr)". Uses `effective-rate.ts`. | 2 hours |
| **P-21** | Auto-raise approval queue: new admin panel listing pending verified credentials. Approve to apply the bump (writes `pay_raises` row + updates `employee_profiles`). Deny to leave unchanged. | 3 hours |
| **V-5** | **Verification checkpoint** — confirm: learning completion creates a credential row; admin approval persists; the user's effective rate jumps by the credential bonus; the audit-trail viewer shows the change. Append findings. | 30 min |

### Phase 6 — Continue the UI/UX audit (4 slices, ~1 day)

The user explicitly asked to continue improving styling and formatting. These slices apply the same "consume tokens / restore visual structure" treatment used in `UI_UX_OVERHAUL.md` to the next-highest-traffic surfaces.

| Slice | Description | Estimate |
|---|---|---|
| **P-22** | Re-audit `/admin/payroll` (the dashboard) at mobile + desktop. The page has 5 tabs (overview, employees, rates, payroll runs); inventory `style={{}}` props + raw hex colors. Migrate to tokens. | 3 hours |
| **P-23** | Re-audit `/admin/payroll/[email]` (per-employee detail). Apply the same token migration. Add a "View pay progression" link → `/admin/pay-progression/[email]` (Phase 4). | 2 hours |
| **P-24** | Audit `/admin/equipment`, `/admin/schedule`, `/admin/office`, `/admin/knowledge` for the same patterns: invisible-text from inherited dark-theme assumptions, hard-coded hex colors, off-token spacing. Migrate. | 4 hours |
| **P-25** | Audit `/admin/learn` (where Phase 5's certification flow now lives). Apply token migration; add a "Pay impact" callout on each module showing the credential bonus tied to it. | 3 hours |
| **V-6** | **Final verification checkpoint** — re-run the full audit (`scripts/ui-audit.mjs` with `includeAuth=true`). Diff against the V-1 baseline. Confirm zero new findings on the 5 Phase 1 surfaces; document any new findings on Phase 6 surfaces. | 1 hour |

### Phase 7 — Cleanup + completion (1 slice, ~10 min)

| Slice | Description | Estimate |
|---|---|---|
| **P-26** | Delete the now-shadowed `employee_profiles.job_title` column (data migrated to `tier_key` in P-6). Delete the hard-coded `JOB_TITLES` constant (call sites migrated in P-7). Move this plan to `docs/planning/completed/`. | 10 min |

---

## 5. How to apply new SQL seeds

Same pattern as the UI/UX overhaul. When a slice ships a seed file (e.g., P-6, P-15), apply via the Supabase SQL Editor:

1. Open https://supabase.com/dashboard/project/pmpjaqrmxnbfdayddrha/sql/new
2. Open the seed file on GitHub at its raw URL (e.g., `https://github.com/juggernautjake/STARR-SURVEYING/raw/<branch>/seeds/<file>.sql?v=1`)
3. Paste into the SQL Editor
4. Click **Run**
5. Verify via the `-- Verification` block at the bottom of each seed

All seeds use `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `INSERT … ON CONFLICT DO NOTHING` so re-running is safe.

---

## 6. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Renaming `employee_profiles.job_title` → `tier_key` breaks queries throughout the codebase | High | P-6 *adds* `tier_key` without dropping `job_title`; P-26 drops it only after every call site is migrated and verified. |
| The new calculation function disagrees with payroll-run output, causing pay drift | High | P-16 is a *read-side* helper for visualization + override preview. The payroll-run engine continues to read `employee_profiles.hourly_rate` directly. A later (out-of-scope) slice can unify them after this plan validates the formula. |
| Admins accidentally edit a config value and break everyone's pay | Medium | P-9 makes edit mode a deliberate toggle; P-10..P-14 include a "preview the diff" step before save. Audit trail on every config change. |
| `user_pay_overrides` rows get orphaned when an employee leaves | Low | Override row keyed by email; if the user is removed, the override is dead data. Add a nightly cleanup later if it becomes noise. |
| Token migrations regress visual layouts (same risk as UI/UX overhaul) | Low | Phase 6 follows the same pattern that worked: only swap exact-match values, preserve off-scale ones. Re-screenshot at each checkpoint. |

---

## 7. Open questions

- Should `user_pay_overrides` support time-bounded overrides ("+$2/hr from May 1 through Sept 30 for the busy season")? `effective_date` + `expires_at` are in §3.1 but the UI in P-17 may simplify to "active now / not active" for v1.
- Do we want a self-service path where an employee can request a raise tied to a credential they just earned, vs. admin-initiated approval? Phase 5 assumes admin-initiated.
- For the per-user override page, should the override apply org-wide (same rate on every work type) or per-work-type (different override for field vs. office work)? §3.1 assumes org-wide; per-work-type is a future extension.

Resolve before Phase 4 ships.

---

## 8. Implementation notes

- Use the design tokens from `app/styles/tokens.css`. No new `#hex` literals in new code.
- Reuse `app/styles/forms.css` for any input/select/button inside the admin edit mode.
- The "edit mode" pill should follow the FAB z-index (`--z-fab: 90`) so it stays above page content but below modals.
- Inline SVG for icons (the U-20 footer fix established the pattern). No emoji-as-icon.
- All new API routes gate on `isAdmin(session.user.roles)` — match the existing pattern in `/api/admin/payroll/*`.
- Migrations are additive until P-26; the plan can be paused at any checkpoint without breaking production.
