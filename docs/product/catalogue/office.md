# Office, customers and knowledge: catalogue overview

Entries: `office.json` (54 entries, `area: "office"`). Every claim there cites `file:line`. Where I could not confirm something in code, the entry says so.

## What this area is for

It is everything the front office touches that is not a job, a drawing or money:

- **Getting work:** website leads, phone calls and the AI receptionist, quotes, ad attribution and marketing.
- **Knowing the customer:** contacts, call history, emails, a global search.
- **Talking to the team:** staff chat, discussions, email, support tickets.
- **Running the firm:** settings, page toggles, roles.
- **Learning:** exam prep and a course builder.
- **The admin shell itself:** navigation, workspaces, Cmd+K, the Hub dashboard, help.
- **An internal design tool** for the owner's own page planning.

## How the parts fit together

```
 website form ─┐                      ┌─ Lead detail ─ reply / AI draft / quote ─┐
 phone line ───┼─> leads (admin only) ┤                                          ├─> "Convert to job" -> /admin/jobs/new?fromLead=
 manual entry ─┘                      └─ follow-up queue                         ┘
      │
      └─ phone: Twilio -> owner's cell -> (no answer) -> AI agent or answering machine
                        -> call row + recording + verdict -> bell/text/email -> "make lead"
 Marketing tabs read leads + spend + Google Ads to answer "did the ads work".
 Contacts live in the Messages portal; a lead page reads the customers table for lifetime value.
```

Almost every page here was merged into a "portal" with `?tab=` during the August 2026 consolidation (`docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md`). The old routes remain as one-line redirects, and records (`leads/[id]`, `contacts/[id]`, `calls/[id]`, `tickets/[id]`) keep their own routes.

## Main user journeys

| Who | Journey | Where it works today | Friction |
|---|---|---|---|
| Office manager | A new enquiry arrives, ring back, quote, convert to job | Marketing > Leads > Lead detail > Reply / Quote / Convert | Leads, calls, marketing and settings are admin only (`middleware.ts:77,96,100`), so the office manager needs full admin. Leads sit under "Marketing". |
| Owner (RPLS) | Missed a call, see who it was | Calls log > call detail > listen / make lead | Good: reasons and one-tap undo are shown. Names Hank/Ellie are hard-coded. |
| Owner | Is advertising working? | Marketing > Overview | Built for Google Ads only; most leads come by phone, so the page leads with a coverage meter. |
| Anyone | Find a customer, deed or invoice | Search Everything, or Cmd+K for pages | Two separate searches. Cmd+K does not search records. |
| Crew | Report a problem, message the office | Floating menu, Messages | The Report button posts to an admin-only API (`discussions/route.ts:65`). |
| New hire | Learn the software | Help drawer, Learn | No how-to content exists. See below. |
| Owner | Hide pages the firm does not use | Settings > Pages | Works; the need comes from having ~197 pages. |

## Biggest problems

1. **Information architecture is 197 pages behind seven workspaces.** About 100 are registered, 56 of those are hidden from the rail, and three lists (registry, middleware, page code) must agree.
2. **Permissions are admin-or-nothing for the office.** No office-manager, RPLS, party-chief or drafter capability set. The API and the middleware disagree in places: discussions, contacts.
3. **One person is three records.** Lead, contact and customer are separate tables and pages. The CRM is split across Marketing (leads), Messages (contacts) and record pages.
4. **Starr is compiled in.** Hank, Ellie, Belton, nine core counties, Texas RPLS and law, TBPELS, Texas one-party consent, Central Texas Spanish, Google Ads only, a single Twilio number, owner phone and SMS recipients in env vars. The receptionist's knowledge is a source file with no UI.
5. **Overlapping channels.** Three feedback paths (report button, discussions, support tickets); three message surfaces (floating messenger, inbox, conversation page); two composers (staff email, lead reply); two staff lists (Messages directory, People); two searches.
6. **No how-to.** The help drawer has 7 curated pages (`help-catalog.ts`); the rest is AI-generated from route metadata. Learn is surveyor exam prep, not product training.
7. **Internal tooling in the customer product.** The Page Designer (7 pages, about 5,000 lines with CSS), `dev/receptionist`, conformance and "serve as page" are for the owner's own use.
8. **Stale audits.** `docs/admin-surface-audit-2026-05-30.md` counts 135 pages and 43 widgets; today there are 197 and 56. `UI_AUDIT.md` lists three DB column bugs whose current state I did not verify.
9. **Pending plans mislabelled.** `SETTINGS_PER_SYSTEM_RULES_VARIANTS` is about tabletop-game character sheets, not firm settings. `OWNER_ACTIONS_RESEARCH_AND_MARKETING` is a checklist for the owner, no engineering.

## Rebuild recommendation for the area

- **One Clients record** (person or company) with a timeline of calls, emails, quotes, jobs and invoices. Leads, contacts and customers become views of it.
- **A real pipeline:** New, Contacted, Quoted, Won, Lost on a board; a "call back today" strip first; quote builder with PDF and accept link; one click to make a job.
- **Phone:** Voicemail (default) and AI receptionist as two modes, configured on a plain page (greeting, hours, questions, who to notify, what it knows). One AI path, not three.
- **One composer, one inbox**, sending from the firm's address, threaded on the record.
- **One search:** Cmd+K for pages, actions and records; the results page behind "see all".
- **Capability-based roles** with editable templates, generating middleware and navigation from one table.
- **Modules chosen at onboarding** (CRM, Phone, Marketing, Learn, Research, Equipment, Payroll) instead of a page-toggle screen as the main control.
- **Move internal tools** (Page Designer, test bench, conformance) behind a developer flag and out of the product catalogue.
- **Firm profile** collecting state licences (many), units, coordinate system, brand, service area and hours, then applied everywhere (receptionist, marketing market watch, learn, settings defaults).

---

## The admin shell: navigation, workspaces and roles

### How it works now

- **One registry** (`lib/admin/route-registry.ts`) lists about 100 destinations. Each has a workspace, label, icon, description, optional roles, optional section, optional `showInRail:false`, optional `parked`, optional `requiredBundle`. The rail, fly-outs, mobile drawer, landings, breadcrumbs and Cmd+K all read it (`route-registry.ts:1-12`).
- **Seven workspaces**, `Mod+1..7`: Hub, Work, Equipment, Research & CAD, Knowledge, Money, Office (`route-registry.ts:46-62`). Registered rows per workspace: hub 11, work 18, equipment 4, research-cad 5, knowledge 12, money 15, office 21.
- **Personas** (field surveyor, equipment manager, dispatcher, bookkeeper, researcher, admin, student) reorder the rail but never hide a workspace (`personas.ts:1-10`).
- **Four separate gates** answer four questions: roles (may you), bundle (did the firm pay), `internalOnly` (is it for staff), toggles (does this firm use it). Toggles are visibility only and every API keeps its own checks (`feature-toggles.ts:1-40`).
- **Twelve roles** (`auth-roles.ts:22-46`) and a middleware prefix table. Admin-only: settings, payroll, roles, calls, leads, marketing. Design: admin and developer. Messages and discussions: eight roles.
- **17 portals** use one tab shell (`usePortalTabs`). Each portal replaced many routes; the old ones redirect.
- **Floating tools** on every page: messenger, report issue, fieldbook, calculator, AI assistant (`AdminLayoutClient.tsx:296-302`).
- **Hub** (`/admin/me`) is a customisable grid of 56 widgets.

### What is wrong with it

- Seven workspaces is too many categories for a firm of 5 to 30 people. Two are almost empty (Equipment 4 rows, Research & CAD 5). The consolidation plan itself said the split "may stop earning its keep" and then kept it (section 12).
- Several pages are reachable three ways (rail, landing card, Cmd+K), and a few mean different things to different roles under the same word ("Contacts", "Billing" vs "Invoicing").
- The role model is built around Starr's crew (`drawer`, `field_crew`, `researcher`) and `admin` is everything.
- The shell asks the user to learn the product structure, when most people want "my day" and "find a thing".

### A simpler information architecture

Four places, plus search and help. The test: could a new office manager say where to go for each job in one sentence?

| Area | What lives in it | Who lives here |
|---|---|---|
| **Today** (Hub) | Schedule, what needs me (approvals, callbacks, overdue), clock in, messages. Fixed top row, widgets below. Per-role default layout set once by the owner. | everyone |
| **Jobs** | Jobs, schedule and dispatch, field data, equipment and vehicles, drawings (CAD), research. | party chief, drafter, RPLS, dispatcher |
| **Clients and money** | Leads and quotes, clients, calls, email, invoices, payments, receipts, payroll approvals, reports. | office manager, bookkeeper, owner |
| **Firm** | People and roles, files, settings and modules, integrations, brand, notifications, audit. | owner, office manager |
| **Search (Cmd+K)** | Pages, actions and records in one list. | everyone |
| **Help (?)** | How-to guides, report a problem, ask AI. | everyone |

Rules for it:

1. **Max two levels.** Area, then page; tabs only inside a page.
2. **Modules, not 150 switches.** Onboarding picks CRM, Phone, Marketing, Learn, Research, Equipment, Payroll. Page-level toggles stay under an "advanced" link.
3. **Roles as capability bundles.** Templates (Owner, Office manager, RPLS, Party chief, Drafter, Field tech, Bookkeeper) that the owner can edit. Nav and middleware are generated from the same table so they cannot drift.
4. **Persona decides the default area and rail order,** not just ordering.
5. **Phone gets a bottom bar** with Today, Jobs, Clients, Search, plus a drawer. One nav component, responsive.
6. **Record drawers.** Opening a lead, client or job from a list opens a side panel on desktop instead of a new page.
7. **One launcher for help and comms** (Message, Report, Ask AI, Calculator), replacing five floating buttons.
8. **Delete or hide internal tools** from customer builds: Page Designer, conformance, test bench.

Nothing here deletes a capability. It changes where each one is found.

---

## The learn section

### What it is now

`/admin/learn` is a study platform for Texas surveying education, with 32 pages and 44 API routes:

- **Portal tabs (all roles):** Hub, Roadmap (28 modules with sequential locking), Modules and lessons, Knowledge base articles, References (trusted documents the AI tutor reads), Flashcards and Card bank, Practice, Quiz history, Search.
- **Exam prep:** Fundamentals of Surveying (SIT) with chunked module pages, a timed mock exam, a calculator manual with keystroke practice; RPLS prep as a thin quiz page.
- **AI tutor** answering from uploaded references, with freshness checks that flag new handbook editions.
- **Authoring (admin, developer, teacher, tech_support):** `/admin/learn/manage` with ten-plus tabs, a lesson builder with 23 block types (text, image, video, callout, quiz, table, slideshow, equation, tabs, accordion, practice problem and more), an article editor, a question builder, a media library, assignments, XP config, student overrides, recycle bin.
- **Teacher view:** students list and per-student progress.
- **Tracking:** XP, streaks, module completion, credentials. A "pay impact" callout points at the pay-progression feature, which is now parked.

It is good at one thing: licensure prep for the owner's own exams. Roadmap text says "Texas Land Surveying curriculum" (`RoadmapTab.tsx:173`) and seeds carry NMSU land-law content.

### What it is not

It is not product training. `help-catalog.ts` has 7 curated entries; the help drawer asks AI to guess the rest from route metadata (`HelpDrawer.tsx:1-30`). No page and no tool has a video.

### How it becomes the "How To" guide hub

Most of the parts already exist: a block-based lesson builder with video blocks, a media library, completion tracking, a retrieval-backed AI tutor, a help drawer, and Cmd+K. What is missing is the mapping from a tool to its guide and the content.

1. **Key every guide to a route id.** One guide per registry destination (and per tab for portals): `guide.leads`, `guide.calls.registry`, `guide.settings.pages`. A guide is a lesson built in the existing lesson builder: a 60-120 second video, a numbered step list, a "try it" button that deep-links to the tool, and a one-line "common mistake".
2. **Show it where the question arises.** The `?` drawer opens the guide for the current page first (curated beats AI, as the code already prefers). Empty states ("No leads yet") link to the guide. Cmd+K gets a "How to..." result type. Learn gets a **How To** tab listing guides by area and role.
3. **Role paths.** "New crew hire", "New office manager", "New drafter": ordered guide lists with completion tracking and an owner sign-off, using module progress and XP that already exist.
4. **Video that scales.** Record short screen captures per tool; store as uploaded files with captions and chapters. Today the video block takes a YouTube/Vimeo link or an upload and has no transcript, so add: transcript, captions, chapter markers, poster frame, and a "video out of date" flag when the page changes (reuse the content-freshness watcher, which already flags stale source material, to compare against the page's last-modified commit).
5. **Ask the guide.** Point the existing retrieval and tutor stack at the guides and the firm's own SOP documents: "How do I record a revised quote?" returns the step and the video timestamp.
6. **Separate two kinds of content.** *Product guides* (generic, shipped with the software, updated by us) and *firm guides* (their own SOPs, county sites, field procedure, authored by them). Licensure prep (SIT, RPLS) becomes an optional per-state pack.
7. **Coverage check.** A CI test lists registry destinations with no guide, in the way the registry already has a guard test, so every new tool ships with a video.
8. **Authoring cost.** Aim for about 40 guides: one for each of the roughly 40 destinations in the simplified IA above, not one per page. Start with the five most-used (Clock in, Jobs, Leads, Calls, Settings > Modules).

What to keep from today's Learn: the lesson builder, media library, module progress, XP, assignments and the AI tutor retrieval. What to cut: nine of ten study tabs into Continue, Library and Practice; the pay-impact callout while pay progression is parked; the FS content out of the default install and into an optional pack.

---

## Plans in `docs/planning/**` that touch this area

| Plan | Status | Relevance | Open ideas |
|---|---|---|---|
| `completed/PAGE_CONSOLIDATION_2026-08-24.md` | done | The portal and toggle design | Section 13 owner decisions: personal-vs-company pages, `/api/admin/contacts` access, workspace shape |
| `completed/ADMIN_NAVIGATION_REDESIGN.md` | done | Rail, palette, help drawer | Phase 6 palette actions ranked by use |
| `completed/HUB_CUSTOMIZER_2026-08-27.md` and `hub-widget-excellence-*` | done | Hub widgets | None found |
| `completed/LEAD_TO_CASH_ATTRIBUTION_AND_GOOGLE_ADS_2026-07-31.md` | done | Attribution and Ads | Developer token and conversion actions (owner) |
| `completed/lead-reply-expansion-2026-06-18.md` | done | Reply composer | None found |
| `completed/contacts-2026-05-30.md` | done | Contacts CRM | Access control question |
| `completed/SUPPORT_DESK.md` | done | Tickets | Realtime updates |
| `completed/DESIGN_STUDIO_*`, `PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md` | done | Design tool | Serve-as-page limits |
| `completed/FS_*`, `SIT_PREP_BUILDOUT`, `AI_TUTOR_*` | done | Learn | None found |
| `pending/SETTINGS_PER_SYSTEM_RULES_VARIANTS_2026-07-22.md` | pending | **Not about firm settings.** Tabletop-game character preferences; IG house rules unnamed | Belongs with the game project |
| `pending/OWNER_ACTIONS_RESEARCH_AND_MARKETING.md` | pending | Owner checklist | M1 Ads conversion actions, M2 Search Console, M3 `sameAs` URLs, M4 county pages, G1-G4 Business Profile |
| `obsolete/GOOGLE_INTEGRATION_2026-07-31.md` | obsolete | Still cited in code headers as in-progress | Update the comments |

## Not verified

- Browser behaviour: I read code only. The non-admin Report-button failure, the admin-without-developer failure on Design APIs and the UI_AUDIT bugs' current state are inferred from code.
- `lib/voice/*` (voice-acting business guides) is unrelated to the receptionist and was left out of scope.
