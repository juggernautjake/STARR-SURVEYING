# STARR-SURVEYING Platform Improvement Roadmap

## Overview

This document outlines a phased approach to improving the STARR-SURVEYING learning platform. It covers bug fixes, role-based access control, teacher roles, external user registration, and the database content rebuild from monolithic HTML to structured lesson blocks.

---

## Phase 1: Bug Fixes & Quick Wins (COMPLETED)

These issues have been resolved in the current session:

- [x] **Tooltip opacity fix** — Lock tooltips on modules/lessons now render via React portal with `opacity: 1 !important`, preventing parent opacity from dimming them
- [x] **Unpublish feature** — Added inline Publish/Unpublish toggle buttons to the Manage Content page for modules, lessons, and articles. Previously required going into edit mode to change status
- [x] **Unicode symbol rendering** — Created `lib/decodeUnicode.ts` utility that decodes literal `\u2705` and `\u{1F512}` escape sequences in database content. Applied to all `dangerouslySetInnerHTML` rendering points in:
  - Lesson viewer (`modules/[id]/[lessonId]/page.tsx`) — 12 render points
  - Lesson builder (`lesson-builder/[id]/page.tsx`) — 15 render points
  - Article reader (`ArticleReader.tsx`) — 1 render point
- [x] **Unified enrollment form** — Replaced three separate forms with one enrollment section
- [x] **Status colors** — "Assigned" renamed to "Enrolled" (blue), added "Past Due" (red)
- [x] **Specific lesson unlock** — Fixed "one or more lessons" mode unlocking all lessons
- [x] **Search bar z-index** — Fixed overlap with sticky header
- [x] **Profile initials** — Handles names with parenthetical nicknames

---

## Phase 2: Role-Based Access Control (COMPLETED)

**Goal**: Students/employees should only see learning content, not admin management tools.

### Current State
- Three roles exist: `admin`, `teacher`, `employee`
- Sidebar navigation already filters by role (`roles` property on nav items)
- API endpoints check `canManageContent()` for content management
- Middleware only checks authentication, not role-based route access
- **Gap**: Page-level components still render admin tools for all authenticated users when not gated by role checks

### Tasks

#### 2a. Audit & hide admin UI elements from students
- **Module detail page** (`modules/[id]/page.tsx`): "Manage Lessons" card (Edit/Unpublish/Delete buttons) is gated by `canManage` — already works
- **Lesson viewer** (`modules/[id]/[lessonId]/page.tsx`): Check for any admin-only editing UI that should be hidden
- **Manage Content page**: Entire page should redirect employees to `/admin/learn`
- **Student Overrides panel**: Admin-only, needs route protection
- **Dashboard**: Review widgets for admin-only data

#### 2b. Add middleware route protection
Update `middleware.ts` to enforce role-based routing:
```
/admin/learn/manage/*     → admin, teacher only
/admin/learn/students/*   → admin, teacher only
/admin/jobs/*             → admin only
/admin/leads/*            → admin only
/admin/hours-approval/*   → admin only
/admin/payout-log/*       → admin only
/admin/payroll/*          → admin only
/admin/settings/*         → admin only
```

#### 2c. Simplify student navigation
Students should see:
- Dashboard (their progress summary)
- Learning Hub → Modules → Lessons (consume content)
- Flashcards (create personal, review)
- Articles (read)
- Exam Prep (practice problems, mock exams)
- Messages
- Profile

Students should NOT see:
- Manage Content
- Student Progress (admin view)
- Jobs, Leads, Hours, Payroll
- Recycle Bin, XP Config, Activity Log

#### 2d. Employee-facing lesson viewer cleanup
- Ensure no edit buttons/links appear for employees
- Ensure "Seed Content" button is hidden
- Ensure admin panels within pages are conditionally rendered

### Estimated Effort: 1-2 sessions

---

## Phase 3: Teacher Role Implementation (COMPLETED)

**Goal**: Teachers can create and manage content but don't have full admin control.

### Current State
- `TEACHER_EMAILS` array exists in `lib/auth.ts` (currently empty)
- `isTeacher()` already returns true for both admin and teacher roles
- `canManageContent()` delegates to `isTeacher()`
- Sidebar already has `roles: ['admin', 'teacher']` on content management items

### Tasks

#### 3a. Teacher permissions matrix
| Feature | Admin | Teacher | Employee |
|---------|-------|---------|----------|
| Create/edit modules, lessons | Yes | Yes | No |
| Create/edit questions, flashcards | Yes | Yes | No |
| Create/edit articles | Yes | Yes | No |
| Publish/unpublish content | Yes | Yes | No |
| Delete content | Yes | No (soft) | No |
| View student progress | Yes | Yes | No |
| Enroll students in modules | Yes | Yes | No |
| Manage assignments | Yes | Yes | No |
| Delete users/manage payroll | Yes | No | No |
| System settings | Yes | No | No |
| Jobs/Leads/Hours management | Yes | No | No |
| XP/Rewards configuration | Yes | No | No |
| Activity log (full) | Yes | Limited | No |

#### 3b. Implementation
- Add teacher emails to `TEACHER_EMAILS` array (or make DB-driven)
- Update API DELETE endpoints to check `isAdmin()` instead of `canManageContent()`
- Add teacher-specific dashboard widgets (class overview, student progress)
- Gate destructive operations (delete, XP config, payroll) behind `isAdmin()`

#### 3c. Database-driven role assignment
- Move role assignment from hardcoded email lists to `registered_users.roles` column
- Admin UI to promote/demote users between employee/teacher/admin
- Already partially implemented: `registered_users` table has `roles` column

### Estimated Effort: 1-2 sessions

---

## Phase 4: External User Registration (COMPLETED)

**Goal**: Allow non-company users (private Gmail accounts) to register and access learning materials.

### Current State
- Google OAuth enforces `@starr-surveying.com` domain
- Credentials provider exists and validates against `registered_users` table
- `registered_users` has: `email`, `password_hash`, `roles`, `is_approved`, `is_banned`
- `isCompanyUser()` checks domain for company vs external distinction

### Tasks

#### 4a. Registration page
- Create `/admin/register` page with:
  - Name, email (any domain), password, confirm password
  - Optional: reason for registration, referral code
  - Submit creates a `registered_users` row with `is_approved: false`

#### 4b. Admin approval workflow
- Admin dashboard widget showing pending registrations
- Approve/reject/ban actions
- Notification to user on approval
- Admin can assign initial role (default: employee)

#### 4c. Login page updates
- Add "Register" link on login page
- Show "Awaiting approval" message for unapproved accounts
- Allow both Google (company) and email/password (external) login

#### 4d. Content access for external users
- External users default to `employee` role (student access only)
- Can be promoted to `teacher` by admin if needed
- Company-only features (jobs, payroll, hours) gated by `isCompanyUser()`

### Estimated Effort: 1 session

---

## Phase 5: Database Content Rebuild — Foundation (COMPLETED)

**Goal**: Set up infrastructure for converting monolithic HTML to structured lesson blocks.

### Current State
- `lesson_blocks` table exists with 22 block types
- `parseHtmlToBlocks()` exists in the lesson builder (auto-parser)
- Lesson builder already renders blocks natively
- All content has been converted from monolithic HTML to structured lesson blocks
- Consolidated seed system lives in `seeds/` directory (replacing 45+ root-level SQL files)

### Consolidated Seed Files (`seeds/`)

| File | Purpose |
|------|---------|
| `000_reset.sql` | Truncate all data tables for clean re-seed |
| `001_config.sql` | System configuration, XP settings, study references |
| `010_curriculum.sql` | Core curriculum modules and lessons |
| `011_curriculum_blocks.sql` | Welcome lesson block content |
| `020_acc.sql` | ACC course modules, lessons, quizzes, final exams |
| `021_acc_blocks.sql` | ACC lesson block content (475 blocks) |
| `030_fs_prep.sql` | FS exam prep question bank |
| `040_drone.sql` | Drone surveying module and lessons |
| `050_srvy.sql` | SRVY 2339-2344 course content |
| `060_articles.sql` | Knowledge base articles |
| `070_templates.sql` | Block and problem templates |
| `080_milestones.sql` | XP milestones and rewards |
| `run_all.sh` | Runner script: `./seeds/run_all.sh --reset` |

### What Was Done
- Created conversion scripts to parse HTML into structured blocks
- Generated block-based seed files for all 13 lessons (480 blocks total)
- Consolidated all 45+ root-level SQL files into 12 numbered seed files
- Old root-level `supabase_*.sql` files and `scripts/` directory removed

### Estimated Effort: 1 session

---

## Phase 6: Content Conversion — ACC Academic Courses (COMPLETED)

**Goal**: Convert all ACC course HTML content to structured lesson blocks.

### What Was Done
- Surveyed all 24 seed files; found 12 files with actual HTML lesson content (all ACC courses)
- Created automated SQL seed file parser that reads SQL seed files directly, extracts HTML, parses into structured blocks, and generates companion SQL files
- All 475 blocks now consolidated into `seeds/021_acc_blocks.sql`

### Conversion Results — 475 Total Blocks

| Course | Lesson ID | Blocks | Block Types |
|--------|-----------|--------|-------------|
| ACC 1335 Wk1 | acc02b01-... | 27 | text:24, table:3 |
| ACC 1335 Wk2 | acc02b02-... | 26 | text:22, table:4 |
| ACC 1335 Wk3 | acc02b03-... | 35 | text:30, table:5 |
| ACC 1335 Wk4 | acc02b04-... | 30 | text:26, table:4 |
| ACC 1335 Wk5 | acc02b05-... | 21 | text:18, table:3 |
| ACC 1341 Wk0 | acc03b00-... | 9 | text:7, table:2 |
| ACC 1341 Wk1 | acc03b01-... | 15 | text:11, callout:4 |
| ACC 1341 Wk2 | acc03b02-... | 35 | text:18, divider:8, table:2, callout:7 |
| ACC 1341 Wk3 | acc03b03-... | 72 | text:35, divider:6, image:22, callout:7, table:2 |
| ACC 1341 Wk4 | acc03b04-... | 58 | text:35, image:12, callout:3, divider:6, table:2 |
| ACC 1341 Wk5 | acc03b05-... | 74 | text:38, image:22, callout:5, divider:7, table:2 |
| ACC 1341 Wk6 | acc03b06-... | 73 | text:32, image:18, callout:6, divider:10, table:7 |

### Block Types
text, table, callout (formula/note/example/tip/danger/warning/info), image, divider, video, embed

---

## Phase 7: Content Conversion — Remaining Files (COMPLETED)

**Goal**: Convert remaining seed files with HTML content to block format.

### What Was Done
- Audited all 12 remaining seed files; only the Welcome lesson had HTML content
- Converted the Welcome lesson (5 text blocks) — now in `seeds/011_curriculum_blocks.sql`
- KB articles (`kb_articles` table) store HTML directly with no block system — no conversion applicable
- Quiz content is plain text in `question_bank` table — no HTML conversion needed

### Final Conversion Totals (Phases 5-7)
- **13 lessons** converted across all phases
- **480 total blocks** (475 from Phase 6 + 5 from welcome lesson)
- Block types used: text, table, callout (7 subtypes), image, divider, video, embed

---

## Phase 8: Polish & Enhancement

**Goal**: Final refinements after all core work is complete.

### Tasks
- Comprehensive testing of all role combinations (admin, teacher, employee, external)
- Performance optimization for block-based content rendering
- Content versioning improvements (track block-level changes)
- Problem template expansion (more parametric generators)
- Advanced teacher analytics dashboard
- Student self-service features (bookmark, notes, progress export)

### Estimated Effort: Ongoing

---

## Summary Timeline

| Phase | Focus | Status | Est. Effort |
|-------|-------|--------|-------------|
| 1 | Bug Fixes & Quick Wins | COMPLETED | — |
| 2 | Role-Based Access Control | COMPLETED | — |
| 3 | Teacher Role | COMPLETED | — |
| 4 | External User Registration | COMPLETED | — |
| 5 | DB Rebuild Foundation | COMPLETED | — |
| 6 | ACC Course Conversion (475 blocks) | COMPLETED | — |
| 7 | Remaining Files Audit & Conversion (480 total blocks) | COMPLETED | — |
| 8 | Polish & Enhancement | Planned | Ongoing |

**All core phases (1-7) COMPLETED.** Phase 8 is ongoing enhancement.

---

## Notes

- Phases 2-4 (roles/permissions) should be completed BEFORE the database rebuild, since proper role enforcement ensures students don't accidentally see builder/admin tools during the content migration.
- The database rebuild (Phases 5-7) is complete. All content has been converted to structured blocks and consolidated into the `seeds/` directory. Run `./seeds/run_all.sh --reset` to rebuild the database from scratch.
- External user registration (Phase 4) is straightforward since the `registered_users` table and Credentials provider already exist. The main work is the registration UI and admin approval workflow.
