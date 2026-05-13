# Admin Navigation Redesign — Planning Document

**Status:** Planning / RFC · ready for implementation slicing
**Owner:** Jacob Maddux
**Created:** 2026-05-12
**Target repo path:** `docs/planning/in-progress/ADMIN_NAVIGATION_REDESIGN.md`

> **One-sentence pitch:** Collapse the current 11-section, ~50-link sidebar into a 7-workspace icon rail + a `/admin/me` central hub + a `Cmd+K` command palette, so every surveyor lands somewhere useful in ≤ 1 click and can reach any page in ≤ 1 keystroke chord.

---

## 1. Executive summary

Today the admin shell has **one navigation surface** — a 240 px-wide sidebar in `AdminSidebar.tsx` listing 11 collapsible sections and ~50 links. Surveyors have to remember which section a page lives in, scan past sections they never use, and click through 2-3 levels to reach common tools. There is no search, no pinning, no recents, and no per-role default — everyone sees the same wall of links.

This document specifies a three-surface replacement:

1. **Condensed icon rail** (48 px) on the left, showing 6-7 *workspaces* plus pinned shortcuts. Default-collapsed; expand on hover or pin.
2. **`/admin/me` Hub** — the new post-login landing page. Today's snapshot + clock state + pinned/recent/personal sections all in one screen.
3. **`Cmd+K` command palette** — global launcher that fuzzy-searches every page + recent items + named actions ("Clock in", "Approve receipts", "Run AI engine").

Combined with consolidating the 7 scattered `My …` pages into a single tabbed hub view, the change drops the sidebar's primary entries from 50 → 11 and gives surveyors keyboard-first access to everything.

---

## 2. Goals & non-goals

### Goals

1. **Reduce primary-nav cognitive load.** No more than ~10 always-visible top-level entries.
2. **Make daily surfaces 0-1 clicks away.** Hub + pinned + recent should cover 80% of a surveyor's daily traffic.
3. **Make any surface reachable in ≤ 1 keystroke chord** (`Cmd+K` → type → Enter).
4. **Persist user context.** Pinned pages, last-visited tabs, persona overrides, expanded/collapsed state survive reloads.
5. **Keep role-based access.** Existing per-route role gating (`WORK_ROLES`, `EQUIPMENT_ROLES`, etc. from `AdminSidebar.tsx:62-74`) stays — we don't widen permissions, we just reorganise discovery.
6. **Brand-consistent.** Reuse the `--brand-red` / `--brand-blue` / `--brand-green` tokens from `app/styles/globals.css:7-15` so the admin shell matches the marketing site.
7. **Reversible.** A feature flag (`useUIStore.adminNavV2Enabled`) lets a user fall back to the old sidebar for one PR-cycle grace period.

### Non-goals

- Changing the underlying admin page implementations — every existing `/admin/*` route still resolves, just under a different sidebar grouping.
- Rewriting per-page UIs (those land per-row in `UX_POLISH_PLAN.md`).
- Mobile-app navigation — the mobile shell uses `<ScreenHeader>` + tabs and is out of scope here.
- Marketing-site nav — the `/about`, `/services`, etc. routes have their own header; untouched.

---

## 3. Current state — what's actually there

Counted from `app/admin/components/AdminSidebar.tsx` (commit at audit time):

| Section | Items | Daily-use rate (estimated) | Notes |
|---|---:|---:|---|
| Main | 3 | 95% | Dashboard, Assignments, My Schedule |
| Learning | 11 | 20% | One of the largest sections; mostly student-only |
| Work | 13 | 70% | The biggest section; mixes daily ops + admin one-shots |
| Equipment | 10 | 30% | Mostly Equipment Managers; mixed in with the surveyor's sidebar |
| Research | 2 | 25% | Only 2 items — doesn't earn its section |
| CAD | 1 | 35% | **Single-item section** |
| Rewards & Pay | 6 | 20% | "My Pay" is here, not in People — surprising |
| People | 4 | 15% | Admin / HR surfaces |
| Communication | 3 | 30% | Messages, Discussions, Team Directory |
| Notes & Files | 3 | 25% | Personal note-taking |
| Account | 3 | 10% | The "junk drawer" — Profile, Settings, Error Log |
| **Total** | **~50** | | |

### Pain points (specific)

- **7 scattered `My …` pages** across 5 sections: My Schedule (Main), My Jobs / My Hours (Work), My Pay (Rewards & Pay), My Notes / My Files (Notes & Files), My Profile (Account), My Fieldbook (Learning). The surveyor has no consolidated "this is mine" page.
- **Admin one-shots mixed with daily items.** "Import Jobs" / "New Job" / "Hours Approval" live in the same Work section as "My Jobs" — every surveyor scrolls past admin-only entries to reach their own work.
- **Equipment Manager is a workspace, not a section.** Per the inline note at `AdminSidebar.tsx:127-132`, EMs live "mostly in this group" — they actually need a dedicated workspace.
- **Emoji icon collisions.** `📊` is on Dashboard + Quiz History + Equipment Timeline; `📋` is on Assignments + All Jobs + Templates + Leads; `💬` is on Messages + Discussions; `🗺️` is on My Roadmap + Daily Timeline. Distinguishing icons stop being icons when they aren't unique.
- **No global search / palette.** No way to jump to a page by name. Discovery is always sidebar-scan-and-click.
- **No "recent" or "pinned" surface.** A 3-tab daily workflow can't be pinned; surveyors re-scan the sidebar every morning.
- **Single-item section (CAD).** Earns a collapsible header that hides one link.
- **Footer / Account section.** Profile + Settings + Error Log thrown in together because they didn't fit elsewhere.

---

## 4. Design principles

These are the gates every UI decision in this plan tests against.

1. **One question, one answer.** Every page has one obvious home in the sidebar (or workspace). No "is it under People or Rewards & Pay?".
2. **Fast common path.** The 80%-of-traffic surfaces are reachable in 0-1 clicks via Hub or in 1 keystroke chord via `Cmd+K`.
3. **Discoverable depth.** Secondary pages exist; they're reachable through the workspace landing pages, not as top-level sidebar entries.
4. **Persona-default, full-access on demand.** The sidebar's default order matches what the role actually opens; a "Show all" toggle reveals every accessible page. Permissions are unchanged; only ordering / collapse state shifts.
5. **Stateful.** Pins, recents, last-visited tab, sidebar collapse, persona override all survive reloads via `useUIStore` + `persist`.
6. **Keyboard-first AND click-first.** `Cmd+K` for power users, fully-clickable rail + hub for surveyors. Both paths excellent, not just one.
7. **Brand-consistent.** Shared CSS tokens with the marketing site; lucide icons everywhere (no emoji); WCAG-AA hit targets (≥ 24 px / ≥ 32 px in compressed UI).
8. **Reversible per-user.** Feature flag lets any user fall back to the old sidebar; flag is removed only after the cleanup PR-cycle grace period.

---

## 5. Proposed architecture

### 5.1 Three navigation surfaces

```
┌──┬─────────────────────────────────────────────────────────┐
│  │ Hub                                       [⌘K] [🔔] [👤] │
│⌂ │ ──────────────────────────────────────────────────────  │
│📋│ Good morning, Jacob                                      │
│🛻│ ⏱ Clocked in 2h 14m on "Smith Boundary"                  │
│🔬│ [Clock Out] [Switch Job] [View on map]                   │
│📐│ ──────────────────────────────────────────────────────  │
│🎓│ Today                                                    │
│🏢│  • Smith Boundary  — Stage 3 (CAD)         [Open]        │
│  │  • Wilson Easement — Awaiting docs         [Open]        │
│⭐│ ──────────────────────────────────────────────────────  │
│⭐│ Pinned         Recent          Workspaces                │
│⭐│ ⭐ Receipts     📐 CAD Editor   📋 Work                  │
│  │ ⭐ Hours        🔬 Property     💰 People                │
│  │ ⭐ Profile      📍 Field Data   🛻 Equipment              │
│  │ ──────────────────────────────────────────────────────  │
│⌘ │ Personal                                                 │
│  │ [Schedule] [Jobs] [Hours] [Pay] [Notes] [Files] [Me]     │
└──┴─────────────────────────────────────────────────────────┘
 ▲                                                              
 │ 48 px icon rail — workspaces + pins                          
```

#### Surface 1 — **The condensed icon rail** (always visible)

48 px wide. Vertical stack:

| Section | Contents | Width when expanded |
|---|---|---|
| Brand | Logo (click → Hub) | 32 px |
| Workspaces | 6 icons: Hub, Work, Equipment, Research & CAD, Knowledge, Office | 240 px |
| Divider | — | — |
| Pinned | Up to 5 user-pinned pages | 240 px |
| Divider | — | — |
| Tools | Notifications bell, Cmd+K hint, Avatar menu | 240 px |

- **Default:** Collapsed (icons only). Hovering an icon shows a 200 ms-delayed tooltip with the label.
- **Expanded mode:** Click the hamburger at the top to expand to 240 px showing labels + a nested page list for the currently-active workspace. Expanded state persists in `useUIStore`.
- **Active workspace** highlighted with brand-blue left border + bg-darkened icon.
- **Hover any icon → submenu fly-out:** appears 200 ms after hover, lists the workspace's pages, doesn't require the rail to expand.
- **Mobile / tablet width < 1024 px:** rail collapses to a top-of-page hamburger that opens a full-height drawer (existing pattern stays).

#### Surface 2 — **The Hub** (`/admin/me`)

The post-login landing page. Replaces the bare `/admin/dashboard` as the destination of `/admin → redirect`. Renders six panels stacked top-to-bottom:

1. **Greeting + clock state.** "Good morning, Jacob." Shows current clocked-in duration + active job; primary CTAs (Clock Out / Switch Job) inline.
2. **Today.** Up to 3 cards summarising today's assigned jobs / due deliverables / stale items.
3. **Pinned + Recent + Workspaces.** Three columns. Pinned = user-defined. Recent = last 6 visited admin routes. Workspaces = the 6 from the rail with one-line counts ("Work · 3 active jobs", "People · 2 receipts to approve").
4. **Personal hub** — tabs replacing the scattered `My …` pages: Schedule · Jobs · Hours · Pay · Notes · Files · Profile. Tab state persists.
5. **Notifications & messages snapshot.** Last 3 unread items from Messages + system alerts.
6. **Quick actions row.** Buttons for the role's top 3 actions ("Submit hours", "Approve receipts", "New job", etc.).

#### Surface 3 — **Cmd+K command palette** (global)

Modal overlay triggered by `Cmd+K` / `Ctrl+K` (or click the chip in the rail's tools section).

```
┌─────────────────────────────────────────────────┐
│ ⌘K  Search for a page or action…       [Esc ✕] │
├─────────────────────────────────────────────────┤
│ Pages                                            │
│  📋 All Jobs                       Work › Jobs  │
│  📐 CAD Editor                     Research     │
│  💰 Payroll                        People       │
│ ──────────────────────────────────────────────  │
│ Actions                                          │
│  ⏱ Clock in / out                                │
│  ✓ Approve receipts (3 pending)                  │
│  🤖 Run AI Drawing Engine                        │
│  ➕ New job                                       │
│ ──────────────────────────────────────────────  │
│ Recent                                           │
│  📐 CAD Editor — Smith Boundary                  │
│  🔬 Property Research — Wilson Easement          │
│  📍 Field Data — Point 47                        │
│ ──────────────────────────────────────────────  │
│ Jobs                                             │
│  Smith Boundary · 2025-01-12                     │
│  Wilson Easement · 2025-01-09                    │
└─────────────────────────────────────────────────┘
```

- **Fuzzy search** across: every admin route, every named action, recent pages (last 50), recent jobs / receipts / research projects by id+name, help articles.
- **Sections** auto-divide results by source.
- **Keyboard:** ↑/↓ navigate; Enter activates; `Cmd+1..9` jumps to numbered result; Esc closes.
- **Empty state:** Lists "Try typing a page name, a job, or an action".
- **Performance:** Index built lazily on first open + invalidated on route change; in-memory only.

### 5.2 Information architecture — the 6 workspaces

Each workspace has its own landing page at the listed route, an in-page secondary nav, and (when the sidebar is expanded) a nested page list.

#### 5.2.1 **Hub** — `/admin/me`
| Page | Old location | New location |
|---|---|---|
| Personal landing | — (new) | `/admin/me` |
| Dashboard | `/admin/dashboard` | redirected from `/admin/me?tab=overview` |
| My Schedule | `/admin/schedule` | `/admin/me?tab=schedule` |
| My Jobs | `/admin/my-jobs` | `/admin/me?tab=jobs` |
| My Hours | `/admin/my-hours` | `/admin/me?tab=hours` |
| My Pay | `/admin/my-pay` | `/admin/me?tab=pay` |
| My Notes | `/admin/my-notes` | `/admin/me?tab=notes` |
| My Files | `/admin/my-files` | `/admin/me?tab=files` |
| My Profile | `/admin/profile` | `/admin/me?tab=profile` |
| My Fieldbook | `/admin/learn/fieldbook` | `/admin/me?tab=fieldbook` |

Old routes redirect to the tabbed Hub view via `redirect()` so external links keep working. Persists `?tab=…` in the URL so deep-linking a tab works.

#### 5.2.2 **Work** — `/admin/work` (new landing) / `/admin/jobs` (existing)
| Page | Old location | Where it lives now |
|---|---|---|
| Work landing | — (new) | `/admin/work` — at-a-glance "what's open right now" |
| All Jobs | `/admin/jobs` | unchanged |
| New Job | `/admin/jobs/new` | unchanged |
| Import Jobs | `/admin/jobs/import` | unchanged; admin-only |
| Leads | `/admin/leads` | unchanged |
| Hours Approval | `/admin/hours-approval` | unchanged; admin-only |
| Field Team | `/admin/team` | unchanged |
| Field Data | `/admin/field-data` | unchanged |
| Daily Timeline | `/admin/timeline` | renamed sidebar label from "Daily Timeline" → "Activity Timeline" to avoid clash with `/admin/equipment/timeline` |
| Mileage | `/admin/mileage` | unchanged |
| Finances | `/admin/finances` | unchanged |
| Vehicles | `/admin/vehicles` | unchanged |
| Assignments | `/admin/assignments` | unchanged |

Routes unchanged; only the sidebar grouping moves.

#### 5.2.3 **Equipment** — `/admin/equipment` (existing landing)
| Page | Old location | Where it lives now |
|---|---|---|
| Equipment landing | `/admin/equipment` | unchanged — already a landing |
| Today | `/admin/equipment/today` | unchanged |
| Timeline | `/admin/equipment/timeline` | unchanged |
| Maintenance | `/admin/equipment/maintenance` | unchanged |
| Consumables | `/admin/equipment/consumables` | unchanged |
| Templates | `/admin/equipment/templates` | unchanged |
| Cleanup queue | `/admin/equipment/templates/cleanup-queue` | unchanged |
| Overrides audit | `/admin/equipment/overrides` | unchanged |
| Fleet valuation | `/admin/equipment/fleet-valuation` | unchanged |
| Crew calendar | `/admin/personnel/crew-calendar` | move ⇒ `/admin/equipment/crew-calendar` (with redirect; lives semantically here, not under Personnel) |

#### 5.2.4 **Research & CAD** — `/admin/research-cad` (new landing)
| Page | Old location | Where it lives now |
|---|---|---|
| Workspace landing | — (new) | `/admin/research-cad` — quick links + recent projects + open drawings |
| Property Research | `/admin/research` | unchanged |
| Testing Lab | `/admin/research/testing` | unchanged |
| CAD Editor | `/admin/cad` | unchanged |

Combines two sparse current sections (Research 2 items + CAD 1 item) into one workspace. CAD's icon stays distinct.

#### 5.2.5 **Knowledge** — `/admin/learn` (existing)
| Page | Old location | Where it lives now |
|---|---|---|
| Learning Hub | `/admin/learn` | unchanged |
| My Roadmap | `/admin/learn/roadmap` | unchanged |
| Modules | `/admin/learn/modules` | unchanged |
| Knowledge Base | `/admin/learn/knowledge-base` | unchanged |
| Flashcards | `/admin/learn/flashcards` | unchanged |
| Exam Prep | `/admin/learn/exam-prep` | unchanged |
| Quiz History | `/admin/learn/quiz-history` | unchanged |
| Search | `/admin/learn/search` | unchanged |
| Student Progress | `/admin/learn/students` | unchanged; admin-only |
| Manage Content | `/admin/learn/manage` | unchanged; admin-only |
| My Fieldbook | `/admin/learn/fieldbook` | promote to Hub tab; keep route alive as deep-link |

#### 5.2.6 **Office** — `/admin/office` (new landing)
The HR / admin / back-office workspace. Replaces the old "People", "Rewards & Pay", "Communication", "Notes & Files", "Account" sections — none of which had enough items to earn its own workspace.

| Page | Old location | Where it lives now |
|---|---|---|
| Office landing | — (new) | `/admin/office` |
| Employees | `/admin/employees` | unchanged |
| Manage Users | `/admin/users` | unchanged |
| Payroll | `/admin/payroll` | unchanged |
| Pay Progression | `/admin/pay-progression` | unchanged |
| Payout History | `/admin/payout-log` | unchanged |
| Receipts | `/admin/receipts` | unchanged |
| Rewards & Store | `/admin/rewards` | unchanged |
| Rewards Admin | `/admin/rewards/admin` | unchanged |
| How Rewards Work | `/admin/rewards/how-it-works` | unchanged |
| Messages | `/admin/messages` | unchanged |
| Team Directory | `/admin/messages/contacts` | unchanged |
| Discussions | `/admin/discussions` | unchanged |
| Company Notes | `/admin/notes` | unchanged |
| Settings | `/admin/settings` | unchanged; admin-only |
| Error Log | `/admin/error-log` | unchanged |

### 5.3 The icon rail — full spec

```
Workspace      Icon           Route                 Default Cmd shortcut
───────────────────────────────────────────────────────────────────────
Hub            Home           /admin/me             ⌘1
Work           Briefcase      /admin/work           ⌘2
Equipment      Truck          /admin/equipment      ⌘3
Research & CAD Compass        /admin/research-cad   ⌘4
Knowledge      GraduationCap  /admin/learn          ⌘5
Office         Building       /admin/office         ⌘6
```

Per `UX_POLISH_PLAN.md` §1.5, icons come from `lucide-react` — no emoji collisions, all stroke-style, all `size={18}` in the rail. Tooltips include the keyboard shortcut: `Hub (⌘1)`.

### 5.4 Persona defaults

The rail order + Hub widgets adapt to the user's role(s). Persona is computed from `session.user.roles` with a `personaOverride` field in `useUIStore` for users who want to lock a different view.

| Persona | Inferred from | Rail default order | Hub widgets |
|---|---|---|---|
| **Field Surveyor** | `field_crew` only | Hub, Work, Research & CAD, Knowledge, Equipment, Office | Clock state, Today's jobs, Recent CAD drawings, Receipts pending |
| **Equipment Manager** | `equipment_manager` | Hub, Equipment, Work, Office, Research & CAD, Knowledge | Cage status, Maintenance due, Today's checkouts, Crew calendar |
| **Dispatcher** | `admin` + `tech_support` | Hub, Work, Equipment, Office, Research & CAD, Knowledge | Field Team status, Hours approval queue, Daily Timeline preview |
| **Bookkeeper** | dedicated future role | Hub, Office, Work, Knowledge | Receipts pending, Payroll status, Recent payouts |
| **Researcher** | `researcher`, `drawer` | Hub, Research & CAD, Work, Knowledge, Office | Recent projects, Testing Lab runs, Open CAD drawings |
| **Admin** | `admin` (no others) | Hub, Work, Equipment, Office, Research & CAD, Knowledge | All of the above, condensed |
| **Student / Learner** | only learning roles | Hub, Knowledge, Office | Roadmap progress, Today's modules, Upcoming exams |

Persona never *hides* a workspace the user could access — it only reorders.

### 5.5 Pinning + recents

Stored in `useUIStore`, persisted via existing `persist` middleware:

```ts
interface AdminNavState {
  pinnedRoutes: string[];        // max 5; user-curated
  recentRoutes: string[];        // max 50; auto-maintained, LRU
  railExpanded: boolean;         // sidebar collapse state
  personaOverride: Persona | null;
  hubTab: 'overview' | 'schedule' | 'jobs' | …;
}
```

- **Pinning UX:** Every page has a star button next to the breadcrumb (top-right of the page header). Click ⭐ → adds to `pinnedRoutes`, with a toast confirming. Pinned routes show on the icon rail (below the workspaces, above the tools section) and in the Hub's Pinned column.
- **Recents:** Auto-tracked on every successful route navigation, deduplicated, capped at 50. Surfaced in the Hub's Recent column (top 6) and in the Cmd+K palette.

### 5.6 Breadcrumbs + page header

Every admin page renders a shared `<AdminPageHeader>` (new component) at the top:

```
┌──────────────────────────────────────────────────────────────┐
│ Work › Jobs › Smith Boundary                    [⭐] [⌘K] [?] │
│ Smith Boundary                                                │
│ Last opened 2 h ago · Stage 3 of 6                            │
└──────────────────────────────────────────────────────────────┘
```

- **Breadcrumb** auto-generated from the route segments + a `pageTitle` registry (extends the existing `PAGE_TITLES` map in `AdminLayoutClient.tsx:29`).
- **Star** toggles `pinnedRoutes` membership.
- **`⌘K`** opens the command palette (visible cue for the keyboard shortcut).
- **`?`** opens a context-relevant help drawer (FAQ snippet for the current page, when one exists).

Pages that need a custom header (CAD's title bar, the canvas editors) keep theirs and just embed the star button.

---

## 6. Component inventory

New + changed components, with the existing files they replace.

| Component | File | Replaces |
|---|---|---|
| `AdminShellV2` (root layout) | `app/admin/components/AdminShellV2.tsx` | `AdminLayoutClient.tsx` (kept under flag) |
| `IconRail` | `app/admin/components/nav/IconRail.tsx` | parts of `AdminSidebar.tsx` |
| `RailExpandedPanel` | `app/admin/components/nav/RailExpandedPanel.tsx` | parts of `AdminSidebar.tsx` |
| `WorkspaceFlyout` | `app/admin/components/nav/WorkspaceFlyout.tsx` | new — hover-fly-out submenu |
| `CommandPalette` | `app/admin/components/nav/CommandPalette.tsx` | new — global `Cmd+K` |
| `CommandPaletteProvider` | `app/admin/components/nav/CommandPaletteProvider.tsx` | new — registers commands + tracks recents |
| `HubPage` | `app/admin/me/page.tsx` | new — central hub |
| `HubTabs` | `app/admin/me/components/HubTabs.tsx` | new — Schedule / Jobs / Hours / Pay / Notes / Files / Profile / Fieldbook |
| `AdminPageHeader` | `app/admin/components/nav/AdminPageHeader.tsx` | new — breadcrumb + pin star + help button |
| `WorkspaceLanding` (factory) | `app/admin/components/nav/WorkspaceLanding.tsx` | new — shared layout for `/admin/work`, `/admin/office`, `/admin/research-cad` |
| Route registry | `lib/admin/route-registry.ts` | new — single source of truth for routes, titles, icons, role gates |
| `useAdminNavStore` | `lib/admin/nav-store.ts` | extends `useUIStore` with `pinnedRoutes`, `recentRoutes`, `railExpanded`, `personaOverride` |

Everything else (every existing `/admin/*` route's page implementation) is **unchanged** — they just get a new shell wrapping them.

---

## 7. Route registry (single source of truth)

`lib/admin/route-registry.ts` — every admin route declared once, consumed by:
- `IconRail` (workspace icons + tooltips)
- `RailExpandedPanel` (nested page lists)
- `WorkspaceFlyout` (hover submenus)
- `CommandPalette` (page search)
- `AdminPageHeader` (breadcrumb resolution + title lookup)
- Test fixtures (route audit tests)

Shape:

```ts
export type Workspace =
  | 'hub' | 'work' | 'equipment'
  | 'research-cad' | 'knowledge' | 'office';

export interface AdminRoute {
  href:          string;       // e.g. '/admin/jobs'
  label:         string;       // e.g. 'All Jobs'
  workspace:     Workspace;    // primary owner
  iconName:      string;       // lucide icon component name
  description?:  string;       // for the Cmd+K palette
  roles?:        UserRole[];   // existing role-gate semantics
  internalOnly?: boolean;
  // For command palette ranking
  keywords?:     string[];     // e.g. ['payroll', 'paycheck', 'salary']
  // For nav surfaces
  showInRail?:   boolean;      // default true; false hides from sidebar even when accessible
  isAction?:     boolean;      // commands (Clock in, etc.) instead of routes
}
```

A unit test walks every `/admin/**/page.tsx` and asserts each route has a registry entry; new pages can't ship without registration.

---

## 8. Phased implementation plan

Each phase is shippable on its own; the old sidebar stays intact under a feature flag until Phase 5.

### Phase 1 — Route registry + Cmd+K palette (Week 1)
The biggest single UX win with the lowest blast radius. Adds the command palette without touching any existing page or sidebar.

- [x] `lib/admin/route-registry.ts` — declares every current admin route *(slice 1a)*
- [x] `lib/admin/nav-store.ts` — Zustand slice for `recentRoutes` *(slice 1b)*
- [x] `app/admin/components/nav/CommandPalette.tsx` — modal with fuzzy search *(slice 1b)*
- [x] `app/admin/components/nav/CommandPaletteProvider.tsx` — mounted in `AdminLayoutClient`; registers `Cmd+K` / `Ctrl+K` *(slice 1b)*
- [x] Recents auto-tracked on `usePathname` change *(slice 1b)*
- [x] Initial command set: every route + 4 actions (Clock in/out, Run AI engine, New job, Approve receipts) *(slice 1b — actions ship as deep-links; Phase 6 swaps for event dispatchers + recent-use ranking)*

**Slice 1a — Route registry + audit tests (shipped):**
- `lib/admin/route-registry.ts` — `Workspace` union, `WORKSPACES` metadata for the 6 workspaces, 60+ `AdminRoute` entries covering every `app/admin/**/page.tsx` (excluding the dynamic `[id]`-segments), re-exports of the §6 role groups from `AdminSidebar.tsx:62-74`, lookups (`findRoute`, `workspaceOf`, `accessibleRoutes`, `routesForWorkspace`), and the `scoreRoute` + `rankRoutes` fuzzy ranker.
- `__tests__/admin/route-registry.test.ts` — 22 vitest cases: shape + uniqueness, lookups (deepest-prefix `workspaceOf`), access filtering (admin sees all, internalOnly gating, role gates honored, equipment_manager hat), and ranker behavior (the §12 "typing 'rec' surfaces Receipts" acceptance is locked).
- Note: the icon names in the registry are the lucide-react component strings the Phase 5 audit (§8) will consume. The registry is pure data — no React imports — so consumers (palette, rail, page header) map names to components.

**Slice 1b — Cmd+K palette + recents (shipped):**
- `lib/admin/nav-store.ts` — separate persist key (`starr-admin-nav`) holding `paletteOpen` (transient) + `recentRoutes` (capped LRU, persisted via `partialize`). Non-`/admin/*` hrefs are dropped at the entry point so junk paths never pollute the list. 8 vitest cases cover open/close/toggle, dedupe, cap, non-admin rejection, and clear.
- `app/admin/components/nav/CommandPalette.tsx` — modal with search input, three-section results layout (Recent / Pages / Actions), ↑/↓/Enter/Esc keyboard nav, click-outside dismiss, focus management. Empty query shows top 6 recents + top 8 accessible pages + visible actions; non-empty query routes everything through `rankRoutes`. Actions surface as registry-shaped entries so the same ranker scores them and they respect the same role gates.
- `app/admin/components/nav/CommandPaletteProvider.tsx` — mounts the palette + binds `Cmd+K` / `Ctrl+K` globally + tracks recents on every `usePathname` change. `Cmd+K` is intentionally NOT gated to non-editable context (per §10 it's the universal escape hatch); future shortcuts (`Cmd+1..6`, g-then-X) will be gated when they land in Phase 3.
- `app/admin/styles/AdminCommandPalette.css` — palette chrome. Inline hex values intentionally — the Phase 5 token-migration pass (§8) sweeps every nav stylesheet at once.
- `app/admin/components/AdminLayoutClient.tsx` — `<CommandPaletteProvider>` wraps the layout inside the session-authenticated branch so the palette reads roles + isCompanyUser via `useSession`.

**Phase 1 acceptance — current state:**
- ✅ `Cmd+K` from any admin page opens the palette.
- ✅ Typing "rec" surfaces Receipts as the top result (locked by test).
- ✅ Esc closes; arrow keys navigate; Enter activates.
- ✅ Route-registry audit test confirms every route + workspace + ranker behavior.
- ✅ Recents auto-tracked on `usePathname`; capped at 50; LRU on duplicates.
- 3587 vitest cases pass (30 new admin tests + 3557 pre-existing); 35 pre-existing failures (all in mobile/node_modules tsconfig-paths) unchanged; build green; type-check clean.

**Acceptance:**
- `Cmd+K` from any admin page opens the palette.
- Typing "rec" surfaces Receipts, Recent receipts (job-scoped), Rewards & Store.
- Esc closes; arrow keys navigate; Enter activates.
- 220 vitest cases still pass; new tests cover the route-registry audit + fuzzy ranking.

### Phase 2 — The Hub (`/admin/me`) (Week 2)
Lands the central hub the user explicitly asked for. Hub coexists with the old sidebar; `/admin → /admin/me` redirect replaces the existing `/admin → /admin/dashboard` we shipped in QA §3.

- [x] `app/admin/me/page.tsx` — six-panel layout *(slice 2a)*
- [x] `app/admin/me/components/HubGreeting.tsx` — time-of-day greeting; live clock-state widget deferred to slice 2b (no `useTimeStore` in the repo yet) *(slice 2a)*
- [ ] `app/admin/me/components/HubToday.tsx` — today's assignments / due items *(skeleton in slice 2a; live data in slice 2b)*
- [x] `app/admin/me/components/HubPinnedRecent.tsx` — three-column grid (Pinned placeholder, Recent live from nav-store, Workspaces live from registry) *(slice 2a)*
- [x] `app/admin/me/components/HubTabs.tsx` — Schedule / Jobs / Hours / Pay / Notes / Files / Profile / Fieldbook tab strip *(slice 2a — strip + URL state + legacy hand-off)*
- [x] Tab state persisted in URL (`?tab=…`) *(slice 2a; nav-store persistence not needed — URL is authoritative)*
- [ ] `/admin/schedule`, `/admin/my-jobs`, `/admin/my-hours`, `/admin/my-pay`, `/admin/my-notes`, `/admin/my-files`, `/admin/profile`, `/admin/learn/fieldbook` — redirect to `/admin/me?tab=…` *(slice 2c — only after slice 2b moves content into tab bodies; redirecting today would regress real pages to placeholders)*

**Slice 2b — Migration pattern + Profile panel (shipped):**
- Pattern: each legacy `My …` page extracts its body into a standalone client-component panel (`<XPanel />`); the legacy route becomes a one-line wrapper that renders the panel; the Hub's matching tab body renders the SAME panel via `HubTabs panels={{ tabId: <XPanel /> }}`. Both surfaces show identical content until slice 2c flips the legacy route to a redirect.
- `app/admin/profile/ProfilePanel.tsx` — extracted from `app/admin/profile/page.tsx` (216 lines → its own client component); `app/admin/profile/page.tsx` now a 5-line wrapper.
- `app/admin/me/page.tsx` — Hub passes `<ProfilePanel />` to `HubTabs panels` so `/admin/me?tab=profile` renders the real profile content (avatar, hourly rate, credentials, learning credits, recent changes).
- `app/admin/me/components/HubTabs.tsx` — renamed the optional `children` prop to `panels` to avoid shadowing React's built-in children semantics; only the active tab's element mounts, so unmounted panels never fetch their API data.
- Remaining panels (schedule, my-jobs, my-hours, my-pay, my-notes, my-files, fieldbook) follow this same pattern in their own slices. Slice 2c lands once all eight panels live in the Hub.

**Slice 2b/2 — MyJobs panel (shipped):**
- `app/admin/my-jobs/MyJobsPanel.tsx` — extracted from `page.tsx` (168 lines, same data fetch + active/completed grouping + JobCard grid + UnderConstruction banner + dev guide).
- `app/admin/my-jobs/page.tsx` — 5-line wrapper.
- `app/admin/me/page.tsx` — `panels.jobs = <MyJobsPanel />`. `/admin/me?tab=jobs` now renders the assigned-jobs view directly.

**Slice 2a — Hub structural skeleton (shipped):**
- `app/admin/me/page.tsx` — composes the six panels.
- `HubGreeting.tsx` — time-of-day greeting + session name; clock-state CTA points at the legacy `/admin/my-hours` until 2b. Time-of-day computed client-side after mount so SSR + hydration agree across part-of-day boundaries.
- `HubToday.tsx` — placeholder card explaining slice-2b hand-off + direct links to /admin/assignments + /admin/schedule.
- `HubPinnedRecent.tsx` — three columns: Pinned (empty-state with Phase-4 hint), Recent (live from `nav-store.recentRoutes`, top 6, resolves each href through the registry to drop deleted routes), Workspaces (live from `WORKSPACES` metadata with the Cmd+1..6 shortcut hint).
- `HubTabs.tsx` — nine-tab strip (overview + the 8 personal tabs from §5.2.1). Active tab persists via `?tab=…`; clicking a tab uses `router.replace` (no scroll) so back-button history isn't polluted. Each non-overview tab currently renders a hand-off link to its legacy route — slice 2b swaps that for real content via the optional `children` slot already on the component.
- `HubNotifications.tsx`, `HubQuickActions.tsx` — Hub panels 5 and 6 with placeholder content + Cmd+K hint; live data lands in 2b.
- `app/admin/me/AdminMe.css` — full Hub stylesheet. Inline hex matches AdminLayout.css convention; Phase 5 token audit sweeps both.
- `app/admin/page.tsx` — `/admin → /admin/me` redirect (was `/admin/dashboard`). `/admin/dashboard` itself remains live and reachable via rail / palette.
- `AdminLayoutClient.tsx` — added `/admin/me → 'Hub'` to PAGE_TITLES so the top bar shows the right title.
- `__tests__/admin/hub-tabs.test.ts` — 4 vitest cases lock `parseHubTab` (null/empty → 'overview', case-sensitive matching, fallback to 'overview' on unknown ids, canonical tab order).

**Acceptance:**
- Visiting `/admin` lands on `/admin/me`.
- All 7 `My …` routes redirect; deep-linked `?tab=hours` opens the right tab.
- Hub greeting reflects live clock state (`useTimeStore`).
- Pinned + Recent columns populate from `nav-store`.

### Phase 3 — Icon rail + workspace landings (Week 3-4)
Replaces the visible sidebar. Old sidebar still ships under feature flag.

- [ ] `app/admin/components/nav/IconRail.tsx` — 48 px rail
- [ ] `app/admin/components/nav/RailExpandedPanel.tsx` — 240 px expanded mode
- [ ] `app/admin/components/nav/WorkspaceFlyout.tsx` — hover submenu
- [ ] `app/admin/work/page.tsx` — Work landing
- [ ] `app/admin/research-cad/page.tsx` — Research & CAD landing
- [ ] `app/admin/office/page.tsx` — Office landing
- [ ] `app/admin/components/nav/AdminPageHeader.tsx` — breadcrumb + star
- [ ] Feature flag `useUIStore.adminNavV2Enabled` (default false initially; flip to true after 1 PR cycle)
- [ ] `Cmd+1..6` workspace shortcuts wired

**Acceptance:**
- Rail renders at 48 px; expanding shows 240 px with the workspace's pages.
- Workspace landing pages render the workspace's pages as cards with at-a-glance counts.
- Hover on a workspace icon → fly-out submenu 200 ms after hover; click → workspace landing.
- Active route gets the brand-blue border highlight.
- Old sidebar still reachable by flipping the flag off.

### Phase 4 — Persona defaults + pinning UX (Week 5)
Adds polish + makes the rail learn the user's role.

- [ ] `lib/admin/personas.ts` — persona-from-roles inference
- [ ] Default rail order per persona
- [ ] Persona override picker in `/admin/me?tab=profile`
- [ ] Pin star on `AdminPageHeader` — adds/removes from `pinnedRoutes`
- [ ] Pinned section on rail + Hub
- [ ] Toast confirmation when pinning ("Pinned to your nav")

**Acceptance:**
- A `field_crew`-only user lands on Hub with rail ordered Hub / Work / Research & CAD / Knowledge / Equipment / Office.
- Clicking the star on `/admin/receipts` adds it to pins; rail shows it under the workspaces.
- Persona override survives reload.

### Phase 5 — Icon migration + tokenisation + flag flip (Week 6)
Polishes the visual layer. Aligns with `UX_POLISH_PLAN.md` §1.2 (design-token migration) + §1.5 (icon vocabulary).

- [ ] Replace emoji icons in route registry with lucide components
- [ ] CSS variable tokens for rail backgrounds, hover states, active-border colour
- [ ] Brand-coloured accents on workspace icons (Work=blue, Equipment=green, etc.)
- [ ] Feature flag default-on
- [ ] Old `AdminSidebar.tsx` removed after one PR-cycle grace period

**Acceptance:**
- Zero emoji in the rail / palette / hub.
- Zero inline hex colours in the new nav components (all via tokens).
- `AdminSidebar.tsx` deleted; `AdminLayoutClient.tsx` consumes `AdminShellV2` only.
- All 220+ vitest tests still green.

### Phase 6 — Polish + analytics (Week 7-8)
- [ ] Command palette ranks results by recent usage + role match
- [ ] Hub widgets refresh on focus + after CRUD actions
- [ ] `?` help button surfaces page-specific help from the resources catalogue
- [ ] Analytics events: `nav.cmdk.open`, `nav.workspace.click`, `nav.pin.add`, `nav.persona.override` (writes to existing telemetry table; helps validate the IA in production)

---

## 9. Migration map (every current sidebar item)

> Reference: matches the inventory in §3. ✓ = unchanged route; ↗ = redirect to new home; ↻ = sidebar grouping moves but route unchanged.

| Today | Route | New home | Action |
|---|---|---|---|
| **Main** |
| Dashboard | `/admin/dashboard` | Hub | redirect `/admin/dashboard → /admin/me?tab=overview` |
| Assignments | `/admin/assignments` | Hub tab | ↗ `/admin/me?tab=assignments` |
| My Schedule | `/admin/schedule` | Hub tab | ↗ `/admin/me?tab=schedule` |
| **Learning** |
| Learning Hub | `/admin/learn` | Knowledge workspace | ↻ |
| My Roadmap | `/admin/learn/roadmap` | Knowledge | ↻ |
| Modules | `/admin/learn/modules` | Knowledge | ↻ |
| Knowledge Base | `/admin/learn/knowledge-base` | Knowledge | ↻ |
| Flashcards | `/admin/learn/flashcards` | Knowledge | ↻ |
| Exam Prep | `/admin/learn/exam-prep` | Knowledge | ↻ |
| Quiz History | `/admin/learn/quiz-history` | Knowledge | ↻ |
| My Fieldbook | `/admin/learn/fieldbook` | Hub tab | ↗ `/admin/me?tab=fieldbook` |
| Search | `/admin/learn/search` | Knowledge | ↻ |
| Student Progress | `/admin/learn/students` | Knowledge | ↻ |
| Manage Content | `/admin/learn/manage` | Knowledge | ↻ |
| **Work** |
| All Jobs | `/admin/jobs` | Work | ↻ |
| My Jobs | `/admin/my-jobs` | Hub tab | ↗ |
| My Hours | `/admin/my-hours` | Hub tab | ↗ |
| New Job | `/admin/jobs/new` | Work | ↻ |
| Import Jobs | `/admin/jobs/import` | Work | ↻ |
| Leads | `/admin/leads` | Work | ↻ |
| Hours Approval | `/admin/hours-approval` | Work | ↻ |
| Field Team | `/admin/team` | Work | ↻ |
| Field Data | `/admin/field-data` | Work | ↻ |
| Daily Timeline | `/admin/timeline` | Work | ↻ (label → "Activity Timeline") |
| Mileage | `/admin/mileage` | Work | ↻ |
| Finances | `/admin/finances` | Work | ↻ |
| Vehicles | `/admin/vehicles` | Work | ↻ |
| **Equipment** | All 10 routes | Equipment workspace | ↻ (crew-calendar move noted in §5.2.3) |
| **Research** |
| Property Research | `/admin/research` | Research & CAD | ↻ |
| Testing Lab | `/admin/research/testing` | Research & CAD | ↻ |
| **CAD** |
| CAD Editor | `/admin/cad` | Research & CAD | ↻ |
| **Rewards & Pay** |
| Rewards & Store | `/admin/rewards` | Office | ↻ |
| Pay Progression | `/admin/pay-progression` | Office | ↻ |
| How Rewards Work | `/admin/rewards/how-it-works` | Office | ↻ |
| Manage Rewards | `/admin/rewards/admin` | Office | ↻ |
| My Pay | `/admin/my-pay` | Hub tab | ↗ |
| Payout History | `/admin/payout-log` | Office | ↻ |
| **People** |
| Employees | `/admin/employees` | Office | ↻ |
| Manage Users | `/admin/users` | Office | ↻ |
| Payroll | `/admin/payroll` | Office | ↻ |
| Receipts | `/admin/receipts` | Office | ↻ |
| **Communication** |
| Messages | `/admin/messages` | Office | ↻ |
| Team Directory | `/admin/messages/contacts` | Office | ↻ |
| Discussions | `/admin/discussions` | Office | ↻ |
| **Notes & Files** |
| Company Notes | `/admin/notes` | Office | ↻ |
| My Notes | `/admin/my-notes` | Hub tab | ↗ |
| My Files | `/admin/my-files` | Hub tab | ↗ |
| **Account** |
| My Profile | `/admin/profile` | Hub tab | ↗ |
| Settings | `/admin/settings` | Office | ↻ |
| Error Log | `/admin/error-log` | Office | ↻ |

**Summary:** 8 routes redirect (the `My …` consolidation); ~42 routes stay where they are with new sidebar groupings; 0 routes are deleted.

---

## 10. Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘1` … `⌘6` | Jump to workspace 1-6 (Hub, Work, Equipment, Research & CAD, Knowledge, Office) |
| `⌘B` | Toggle rail expanded / collapsed |
| `⌘.` | Jump to Hub |
| `g` then `j` | Jump to Jobs (g-then-X chord — extensible) |
| `g` then `r` | Jump to Receipts |
| `g` then `c` | Jump to CAD |
| `⌘⇧F` | Focus the Hub-level search (alias for ⌘K with search scope = pages) |
| `?` | Open the Keyboard Shortcuts modal |
| `Esc` | Close the active overlay (palette, modal, flyout) |

All shortcuts gated by the same input-field filter the CAD `useKeyboard` hook already uses (don't fire when typing in `<input>` / `<textarea>` / contentEditable).

---

## 11. Accessibility

- **Hit targets:** every nav element ≥ 32 px on click area (rail icons are 32 px boxes with 16 px lucide icons inside). Touch-friendly even at desktop sizes.
- **ARIA:** rail is `role="navigation"` with `aria-label="Primary"`. Workspace icons declare `aria-current="page"` when active. Pinned items use `aria-label="Pinned shortcut: <page>"`.
- **Keyboard:** every element is `tab`-reachable in DOM order; focus rings use the existing `--focus-ring` token (or add one if missing).
- **Screen reader:** rail tooltips read aloud via `aria-describedby`; palette announces result count after each keystroke (debounced 200 ms).
- **Reduced motion:** `prefers-reduced-motion` disables the rail expand animation, palette fade-in, and toast slide-ins.
- **Colour contrast:** every text + icon meets AAA on the dark shell background. Rail icon active state uses brand-blue with a 4.5+ contrast against the rail background.

---

## 12. Acceptance tests

Run after each phase. Phase n's tests survive into Phase n+1.

### Phase 1 — palette
- [ ] `⌘K` from any admin route opens the palette modal.
- [ ] Typing "rec" surfaces Receipts as the top result.
- [ ] Esc, click-outside, and arrow-down-then-Enter all dismiss / activate appropriately.
- [ ] Route-registry audit test confirms every `/admin/**/page.tsx` has a registry entry.
- [ ] Recents update on route change; capped at 50; LRU on duplicates.

### Phase 2 — Hub
- [ ] `/admin` redirects to `/admin/me`.
- [ ] `/admin/me` renders all six panels.
- [ ] Greeting reflects clocked-in state from `useTimeStore`.
- [ ] All 7 `My …` legacy routes redirect to the right tab.
- [ ] Deep-linked `?tab=hours` opens the Hours tab.
- [ ] Tab state survives reload.

### Phase 3 — rail
- [ ] Rail renders at 48 px collapsed, 240 px expanded.
- [ ] Hovering a workspace icon shows tooltip after 200 ms with the keyboard shortcut.
- [ ] Click a workspace icon → workspace landing page.
- [ ] Hover a workspace icon → fly-out submenu lists workspace's pages.
- [ ] Workspace landing pages exist at `/admin/work`, `/admin/office`, `/admin/research-cad`.
- [ ] Breadcrumb shows correct trail on every admin route.
- [ ] Star button on header pins / unpins the current page.
- [ ] Old sidebar still rendered when `adminNavV2Enabled === false`.

### Phase 4 — persona + pin
- [ ] Field-Surveyor persona's rail order matches the table in §5.4.
- [ ] Pinning a page surfaces it on the rail's Pinned section + Hub's Pinned column.
- [ ] Persona override saves + persists.
- [ ] Toast appears when pinning ("Pinned to your nav").

### Phase 5 — visuals
- [ ] Zero emoji in the route registry's `iconName` field.
- [ ] Zero inline hex literals in nav components.
- [ ] `AdminSidebar.tsx` deleted; type-check clean.
- [ ] All vitest tests green.

### Phase 6 — analytics + polish
- [ ] Cmd+K results ranked higher for recently-visited pages.
- [ ] `?` button opens page-specific help where available.
- [ ] `nav.*` analytics events fire and write to telemetry.

---

## 13. Open questions

To answer with the operator before sign-off:

1. **Brand tokens.** Do we lock the workspace icon colours to specific brand tokens (Work=blue, Equipment=green, Research=red, Knowledge=amber)?
2. **Persona inference vs explicit picker.** Should new users see a one-time picker ("Which describes your role?"), or always infer from `session.user.roles`?
3. **Workspace count.** Six workspaces is the proposal. Five (merging Knowledge into Office) is feasible; seven (splitting Research from CAD) is also possible. Which feels right?
4. **Rail default state.** Expanded on first load, or collapsed? (Recommendation: collapsed, expand on hover; the rail's purpose is to *not* be a wall of links.)
5. **Mobile.** The plan assumes desktop ≥ 1024 px. Confirm the mobile drawer pattern (full-height slide-in) is fine for tablet / phone admin use, or whether we need a bottom-tab variant.
6. **Cmd+K naming.** Some surveyors won't recognise the `⌘K` glyph. Label it "Search (Ctrl K)" inline, or trust the glyph?
7. **Help drawer content.** Phase 6 hooks page-specific help to the `?` button; who curates the help content?
8. **Telemetry destination.** Phase 6 writes to telemetry; do we want `analytics_events` (existing) or a new `nav_events` table for cleaner querying?
9. **Cleanup window.** How long does the feature flag stay before we delete `AdminSidebar.tsx`? Recommend one PR-cycle (per the planning README rubric).

---

## 14. Risks + mitigations

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Surveyors don't discover `⌘K` | Medium | Low | Visible chip in the rail's tools section + onboarding tour after the v2 flag flips on |
| Hub tabs feel slower than direct routes | Low | Medium | Each tab lazy-loads its own component; `?tab=hours` deep-link makes it indistinguishable from the old `/admin/my-hours` URL |
| Persona inference is wrong for multi-hat users | Medium | Low | Persona override picker in profile; admins always get the full nav by default |
| Phase 3's rail breaks an existing flow | Medium | Medium | Feature flag stays for a PR-cycle; analytics on `cmdk.open` vs `sidebar.click` ratio validates the rollover |
| Workspace landing pages become "yet another empty page" | Medium | Low | Phase 3 ships them with at-a-glance counts + quick links; Phase 4 adds widgets so they earn their existence |
| Cmd+K conflict with browser shortcuts | Low | Medium | Use `Cmd+K` only when no editable field has focus; fall back to `Cmd+J` if a customer reports conflict |
| Old deep-links break | Low | High | Every legacy `My …` route gets a `redirect()` in `page.tsx`; route-registry audit catches missing redirects in CI |

---

## 15. Cross-references

- `docs/planning/completed/UX_POLISH_PLAN.md` §1.5 — emoji-to-lucide migration; this plan finishes the admin-side of that work
- `docs/planning/completed/UX_POLISH_PLAN.md` §2.4 — AI mode menu entry; same MenuBar restructuring conventions
- `app/admin/components/AdminSidebar.tsx` — current implementation; deleted in Phase 5
- `app/admin/components/AdminLayoutClient.tsx:29` — `PAGE_TITLES` map; subsumed by the new route registry
- `lib/cad/store/ui-store.ts` — pattern for the Zustand `persist` middleware the new `nav-store` follows
- `app/admin/page.tsx` — current `redirect('/admin/dashboard')`; Phase 2 retargets to `/admin/me`

---

## 16. Definition of done

The redesign is complete when:

1. Visiting `/admin` lands on `/admin/me` Hub.
2. The icon rail shows 6 workspaces + pinned shortcuts; collapsed by default.
3. `⌘K` opens a working command palette from any admin route.
4. All 7 `My …` legacy routes redirect to the right Hub tab.
5. Every admin page renders the shared `AdminPageHeader` with breadcrumb + star.
6. Per-persona rail defaults match §5.4.
7. Zero emoji in the rail / palette / hub.
8. `AdminSidebar.tsx` is deleted.
9. All vitest tests pass (220 + new palette / route-registry / hub tests).
10. Type-check + lint green.
11. One PR-cycle grace period has elapsed since the feature flag flipped on by default.
