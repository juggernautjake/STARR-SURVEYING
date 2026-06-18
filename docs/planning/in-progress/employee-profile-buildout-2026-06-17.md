# Employee profile buildout — 2026-06-17

> User: "We also need to build out the full user profile page.
> This will have all of the user's roles, jobs they have worked
> on, dob, gender, age, certifications/achievements, phone
> number, email, ect. For some users, they will be able to see
> all of their information. Salary, bonuses, and other pertinent
> info. Please build out the full employee profile page and make
> it so that they can add images, change their profile pic, add
> phone numbers, emails, etc.... Make it all customizable and
> comprehensive."

## What already exists

- `public.employee_profiles` table with `user_name, job_title,
  hire_date, hourly_rate, tier_key, is_active, …`.
- `public.employee_certifications` (badges + pay-bump amounts).
- `public.employee_salary_history` + `public.employee_bonuses` +
  `public.employee_payouts`.
- `app/admin/profile/ProfilePanel.tsx` already renders the
  current user's profile inside `/admin/me?tab=profile` with
  tabs: Profile, Credentials, Learning Credits, Recent Changes,
  Themes.
- `public.registered_users.avatar_url` holds the (Google or
  uploaded) profile picture URL.
- `public.user_files` exists for arbitrary user-owned uploads.

## What's missing per the user

1. **Personal-info section**: date of birth (→ age derived),
   gender, pronouns, free-form bio. Currently no schema for any
   of these.
2. **Multiple phones + emails**: today the profile carries one
   email (the auth one) and no phone fields. The user wants the
   ability to add and label more than one of each.
3. **Profile picture upload + change**: today `avatar_url` is
   set by the auth provider; there's no UI to upload or replace it.
4. **General image gallery**: arbitrary images the user can add
   to their profile (no schema today).
5. **Jobs worked on**: relate `public.jobs` to the user (by
   assignment / crew membership) and render a tab on the profile.
6. **Visibility of pay-sensitive sections** (salary, bonuses,
   payouts): the data already exists; the profile needs to
   surface it for the viewer themself + admins / payroll roles
   per a small per-section guard.

## Slice plan

The first slice ships a useful personal-info section and is
small enough to bisect. Later slices each carry their own
migration so the schema lands incrementally and reversibly.

| Slice | What ships |
|---|---|
| **EP1** | Migration 310 adds `date_of_birth DATE`, `gender TEXT`, `pronouns TEXT`, `bio TEXT` to `employee_profiles`. The existing POST `/api/admin/payroll/employees` allow-list grows to accept the four fields from the signed-in user. `ProfilePanel` gains a "Personal info" card with view + edit modes plus a derived "Age N" line from DOB (`deriveAge` is exported + tested). ✅ shipped |
| **EP2a** | Migration 311 + `lib/employee-profile/contact-methods.ts` pure helpers + new `/api/admin/profile/contact-methods` GET/POST/PATCH/DELETE. ✅ shipped |
| **EP2b** | ProfilePanel "Contact methods" card that consumes the EP2a API: groups per kind, "Set primary" / Delete per row, inline Add form (kind / value / label / primary). Edit-in-place deferred — delete + re-add covers the same need today. ✅ shipped |
| **EP3** | New POST/DELETE `/api/admin/profile/avatar` writes to the public `user-avatars` bucket (auto-created), updates `registered_users.avatar_url`, and prunes the previous custom avatar. ProfilePanel hangs a hidden `<input type=file>` over the existing avatar with a hover "Change" overlay; live state takes over after a successful upload so the user sees the new photo without a page reload. ✅ shipped |
| **EP4** | Migration 312 adds `public.employee_images` (user_email, image_url, storage_path, caption, sort_order). New POST/GET/DELETE `/api/admin/profile/images` uploads to a public `user-gallery` bucket, auto-assigns the next sort_order, and rolls back on DB failure. ProfilePanel gets an "About-me gallery" card with a responsive grid, per-tile delete, and an upload form with optional caption. ✅ shipped |
| **EP5** | New `/api/admin/profile/jobs?email=<email>` joins `job_team` with `jobs`, orders by latest assignment, and collapses repeat assignments per job. ProfilePanel renders a "Jobs I've worked on" card with each row linking to `/admin/jobs/<id>` + a "Crew lead" badge when the user led the crew. ✅ shipped |
| **EP6** | New role-gated `/api/admin/profile/compensation?email=<email>` fans out 3 parallel reads (`employee_salary_history` + `employee_bonuses` capped at 50 + `employee_payouts` capped at 12). Self always passes; others need an admin / developer / tech_support role via the new pure `canSeeOthersPay` predicate. ProfilePanel renders a "Compensation" card with current rate, salary history, recent bonuses, and last few payouts. ✅ shipped |
| **EP7a** | Basic per-user public profile at `/admin/employees/[email]`. Server component, view-only, surfaces the EP1 personal-info section + the EP2 contact methods + hire date / status / credentials. Pay (hourly_rate) gated to self or admin. ✅ shipped |
| **EP7b** | Admin edit-on-behalf-of: full ProfilePanel-style editor at this same route when the viewer is an admin. (next slice) |

Each slice ships with the standard three post-build checks
(typecheck, lint, vitest) per the user's standing ask.

## Notes locked from the spec

- **Age is derived, not stored.** Computing `Math.floor((now -
  dob) / 365.25 days)` at render time avoids a stale `age` column
  on a long-lived row.
- **Self-edit only for EP1.** Updates run through a new
  `/api/admin/profile/self` PATCH that scopes the write to
  `session.user.email`; admin-edits-on-behalf-of land in EP7.
- **`gender` + `pronouns` are free-form TEXT.** No CHECK
  constraint or enum — the user spec says "gender" without
  picking a fixed list, and locking a list would force a follow-
  up migration the moment someone wants to add an option.
- **Schema is additive across every slice.** No dropped columns,
  no renames; each migration uses `ADD COLUMN IF NOT EXISTS` so
  partial rollouts don't break already-running pages.
