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
| **EP2** | New `public.employee_contact_methods` table (id, user_email, kind: 'phone' \| 'email' \| 'address', value, label, is_primary). Self-PATCH endpoint + ProfilePanel section to add / edit / delete; primary email is locked to the auth email for now. |
| **EP3** | Profile-pic upload via existing `user_files` infrastructure: client uploads image, server writes the row + sets `registered_users.avatar_url`. ProfilePanel surfaces a "Change photo" affordance on the existing avatar. |
| **EP4** | "About me" image gallery — new `public.employee_images` table (user_email, file_id, caption, sort_order). Reuses the EP3 upload flow. Grid view on the profile. |
| **EP5** | "Jobs I've worked on" tab — query `public.jobs` by `assigned_to` (or job-employees join when that lands) and render a chronological list with links to each job page. |
| **EP6** | Salary + bonuses tab — surfaces `employee_salary_history` + `employee_bonuses` + `employee_payouts` with a role-gated guard (`if (isSelf || isPayrollAdmin) { … }`). |
| **EP7** | Admin-facing read-only profile at `/admin/employees/[email]` that opens the same ProfilePanel pre-bound to that user's email; role-aware so non-admins see only what EP6's guard allows. |

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
