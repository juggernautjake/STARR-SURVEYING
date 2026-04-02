# User Roles & Access Control Plan

## Overview

This document defines the complete role-based access control (RBAC) system for
Starr Surveying's employee backend. Every user who signs up or signs in is
tracked in the `registered_users` table. Admins can assign one or more roles to
any user through the **Manage Users** page. Roles determine which sidebar
sections, pages, and features are visible and usable.

---

## 1. Role Definitions

Users can hold **multiple roles simultaneously** (e.g., an employee who is also
a researcher and a field_crew member). The `roles` column in `registered_users`
is a JSON array of role strings.

| Role | Slug | Description |
|------|------|-------------|
| **Admin** | `admin` | Full access to everything. Can manage users, roles, payroll, settings, and all features. Cannot be blocked or banned. |
| **Developer** | `developer` | Full access to all features for testing purposes. Can use the Testing Lab and all tools. **Cannot** update user roles or modify site settings. |
| **Teacher** | `teacher` | Can create/edit/publish learning content (modules, articles, flashcards, quizzes). Can view and manage student progress. |
| **Student** | `student` | Access to all learning features: modules, flashcards, exam prep, knowledge base, quiz history, roadmap. No work or research access. |
| **Researcher** | `researcher` | Access to Property Research and Analysis tools. Can create/view research projects, run document analysis. No Testing Lab access. |
| **Drawer** | `drawer` | Access to CAD Editor and Research tools. Can create and edit survey drawings, import/export data. |
| **Field Crew** | `field_crew` | Access to field-oriented tools: My Jobs, My Hours, Field Notebook, Learning, Research, CAD (view-only), Assignments, Schedule. |
| **Employee** | `employee` | Base role. All authenticated users have this. Access to: Dashboard, Profile, Learning Hub (consume only), Field Notebook. Company-domain users also see messaging, notes, files, rewards, and pay. |
| **Guest** | `guest` | External (non-company) users who registered via email. Access limited to Dashboard, Profile, and Learning Hub basics. Must be approved by admin before login works. |
| **Tech Support** | `tech_support` | Access to Error Log, user management (view-only), and all pages for troubleshooting. Cannot modify roles or settings. |

### Special Rules
- **`employee`** is always present — it is the base role for all users.
- **`admin`** overrides all restrictions. Admins see everything.
- **`developer`** sees everything except user role management and site settings.
- Users can hold multiple roles (e.g., `['employee', 'field_crew', 'researcher']`).
- Company domain users (`@starr-surveying.com`) who sign in via Google are
  automatically added to `registered_users` with `['employee']` roles and
  `is_approved: true`.

---

## 2. Feature Access Matrix

Legend: **Full** = can use all features | **View** = read-only | **---** = no access

| Feature / Page | Admin | Developer | Teacher | Student | Researcher | Drawer | Field Crew | Employee | Guest | Tech Support |
|---|---|---|---|---|---|---|---|---|---|---|
| **Dashboard** | Full | Full | Full | Full | Full | Full | Full | Full | Full | Full |
| **Profile** | Full | Full | Full | Full | Full | Full | Full | Full | Full | Full |
| | | | | | | | | | | |
| **LEARNING** | | | | | | | | | | |
| Learning Hub | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| Modules & Lessons | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| Flashcards | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| Exam Prep (SIT/RPLS) | Full | Full | Full | Full | Full | Full | Full | Full | --- | Full |
| Knowledge Base | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| Quiz History | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| My Roadmap | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| My Fieldbook | Full | Full | Full | Full | Full | Full | Full | Full | --- | Full |
| Search | Full | Full | Full | Full | Full | Full | Full | Full | View | Full |
| Student Progress | Full | Full | Full | --- | --- | --- | --- | --- | --- | View |
| Manage Content | Full | Full | Full | --- | --- | --- | --- | --- | --- | View |
| | | | | | | | | | | |
| **WORK** | | | | | | | | | | |
| All Jobs | Full | Full | --- | --- | View | --- | --- | --- | --- | View |
| My Jobs | Full | Full | --- | --- | View | --- | Full | Full* | --- | View |
| My Hours | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| New Job | Full | View | --- | --- | --- | --- | --- | --- | --- | --- |
| Import Jobs | Full | View | --- | --- | --- | --- | --- | --- | --- | --- |
| Leads | Full | Full | --- | --- | --- | --- | --- | --- | --- | View |
| Hours Approval | Full | View | --- | --- | --- | --- | --- | --- | --- | View |
| Assignments | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| My Schedule | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| | | | | | | | | | | |
| **RESEARCH** | | | | | | | | | | |
| Property Research | Full | Full | --- | --- | Full | Full | View | --- | --- | View |
| Research Library | Full | Full | --- | --- | Full | Full | View | --- | --- | View |
| Research Pipeline | Full | Full | --- | --- | Full | View | --- | --- | --- | View |
| Research Billing | Full | View | --- | --- | View | --- | --- | --- | --- | View |
| Testing Lab | Full | Full | --- | --- | --- | --- | --- | --- | --- | View |
| | | | | | | | | | | |
| **CAD** | | | | | | | | | | |
| CAD Editor | Full | Full | --- | --- | View | Full | View | --- | --- | View |
| | | | | | | | | | | |
| **REWARDS & PAY** | | | | | | | | | | |
| Rewards & Store | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| Pay Progression | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| How Rewards Work | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| Manage Rewards | Full | View | --- | --- | --- | --- | --- | --- | --- | View |
| My Pay | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| Payout History | Full | Full | --- | --- | --- | --- | Full | Full* | --- | View |
| | | | | | | | | | | |
| **PEOPLE** | | | | | | | | | | |
| Employees | Full | View | --- | --- | --- | --- | --- | --- | --- | View |
| Manage Users | Full | --- | --- | --- | --- | --- | --- | --- | --- | View |
| Payroll | Full | --- | --- | --- | --- | --- | --- | --- | --- | View |
| | | | | | | | | | | |
| **COMMUNICATION** | | | | | | | | | | |
| Messages | Full | Full | Full | --- | Full | Full | Full | Full* | --- | View |
| Team Directory | Full | Full | Full | --- | Full | Full | Full | Full* | --- | View |
| | | | | | | | | | | |
| **NOTES & FILES** | | | | | | | | | | |
| Company Notes | Full | View | --- | --- | --- | --- | --- | --- | --- | View |
| My Notes | Full | Full | Full | Full | Full | Full | Full | Full* | --- | Full |
| My Files | Full | Full | Full | Full | Full | Full | Full | Full* | --- | Full |
| | | | | | | | | | | |
| **ADMIN** | | | | | | | | | | |
| Settings | Full | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Error Log | Full | Full | --- | --- | --- | --- | --- | --- | --- | Full |
| Discussions | Full | Full | Full | Full | Full | Full | Full | Full* | --- | View |

> **Full*** = Company domain (`@starr-surveying.com`) employees only. External
> registered users with just `employee` role don't see internal-only sections.

---

## 3. How Users Enter the System

### 3a. Company Employees (Google Sign-In)
1. User clicks "Sign in with Google" using their `@starr-surveying.com` account.
2. NextAuth `signIn` callback verifies the domain.
3. On first sign-in, the `jwt` callback calls `getUserRolesFromDB()`.
4. If no `registered_users` row exists yet, the system **auto-creates** one
   with `roles: ['employee']`, `is_approved: true`, and their Google profile
   name/image.
5. They appear immediately on the **Manage Users** and **Employees** pages.
6. Admins can then add roles (e.g., `field_crew`, `researcher`).

### 3b. External Users (Email/Password Registration)
1. User registers at `/register` with name, email, password.
2. A `registered_users` row is created with `roles: ['employee']`,
   `is_approved: false`.
3. User sees "pending approval" message.
4. Admin approves on the **Manage Users** page.
5. User can now log in and sees features matching their roles.
6. Admin can assign additional roles (e.g., `student`, `guest`).

---

## 4. Data Model Changes

### `registered_users` table (existing — enhanced)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated |
| `email` | TEXT UNIQUE | Lowercase, indexed |
| `name` | TEXT | Display name |
| `password_hash` | TEXT | Empty string for Google-only users |
| `roles` | JSONB | Array of role strings, e.g. `["employee", "field_crew"]` |
| `is_approved` | BOOLEAN | Default `true` for company users, `false` for external |
| `is_banned` | BOOLEAN | Default `false` |
| `banned_at` | TIMESTAMPTZ | When ban was applied |
| `banned_reason` | TEXT | Admin-provided reason |
| `auth_provider` | TEXT | `'google'` or `'credentials'` (new field) |
| `avatar_url` | TEXT | Google profile image URL (new field) |
| `last_sign_in` | TIMESTAMPTZ | Updated on each sign-in (new field) |
| `created_at` | TIMESTAMPTZ | Registration/first sign-in time |
| `updated_at` | TIMESTAMPTZ | Last modification |

### `employee_profiles` table (existing — unchanged)
Linked by `user_email`. Contains payroll-specific data (hourly rate, job title,
hire date, etc.). Only company employees need a profile here.

---

## 5. Middleware Route Protection

The `middleware.ts` file enforces role-based route access at the edge:

```
ADMIN_ONLY_ROUTES:     /admin/settings, /admin/users (edit), /admin/payroll
TEACHER_ROUTES:        /admin/learn/manage, /admin/learn/students
RESEARCH_ROUTES:       /admin/research/*
CAD_ROUTES:            /admin/cad
WORK_ROUTES:           /admin/jobs/*, /admin/leads, /admin/hours-approval
INTERNAL_ONLY_ROUTES:  All routes with internalOnly flag
```

Route access checks: `userRoles.some(r => allowedRoles.includes(r))`

---

## 6. Sidebar Navigation Updates

The `AdminSidebar.tsx` component filters nav items by:
1. `roles` array — which roles can see the item
2. `internalOnly` flag — only `@starr-surveying.com` users

Updated role mappings for each nav item enable fine-grained visibility.

---

## 7. Implementation Checklist

- [x] Define role types and access matrix (this document)
- [x] Expand `UserRole` type to include all 10 roles
- [x] Update `registered_users.roles` validation in API routes
- [x] Auto-create `registered_users` row for Google sign-ins
- [x] Update Manage Users page with new role checkboxes + descriptions
- [x] Update Employees page to show all company-domain users from `registered_users`
- [x] Update AdminSidebar role filtering for new roles
- [x] Update middleware route protection for new roles
- [x] Add role display labels and badge colors
- [x] Update promote/role-edit UI to support all roles
- [x] Migrate all frontend pages from `role === 'admin'` to `roles.includes()`
- [x] Migrate all API routes from `session.user.role` to `isAdmin(roles)` / `isDeveloper(roles)`
- [x] Update teacher/admin content checks to include developer role
- [x] Add `auth_provider` field to registration flow
- [x] SQL migration for new columns (auth_provider, avatar_url, last_sign_in)
