# Projects, and the jobs that live inside them

**Status:** IN PROGRESS · opened 2026-08-19

> **Owner, 2026-08-19:** *"On the backend it really seems like the project functionality I wanted is
> not surfaced. We have it so that we can create a new job or edit jobs, but what I want is for us to
> be able to create new projects, and then within the project we can create a new job. We would then
> be able to have multiple jobs within a project. Please check and see if this functionality exists
> or not. We need this represented on the navmenu and on the work pages."*

---

## 1. It did not exist

Checked against the live database and the code before writing anything, because "is it built?" has
been answered wrong in this repo by reading a doc header.

| Question | Answer, measured |
|---|---|
| Is there a `projects` table? | **No.** The only matches were `research_projects` (the deed-research platform's own runs) and unrelated `project_id` columns on lidar/recon/VA tables. |
| Does `jobs` have a `project_id`? | **No.** 61 columns, none of them a parent. |
| Is there a Projects page or route? | **No.** |
| Was the *word* anywhere? | Yes — `/admin/jobs` carried `keywords: ['projects']` in the nav registry. **The word was anticipated; the entity was never built.** |

So this is a genuine build, not a surfacing problem.

## 2. The four decisions, and what they cost

Asked before building, because each one changes the work materially.

| Decision | Chosen | Why it matters |
|---|---|---|
| Is a project required? | **Required** — every job has one | Enforced in the database (`NOT NULL` + FK), not only in the form. A rule enforced in one route is a rule the next route forgets. |
| Numbering | **Job numbers untouched**; projects get `P-YYYY-NNNN` | `2026-0007` is already on quotes, invoices, drawings and file names. Renumbering a job inside its project (`2026-014.1`) would change the meaning of paper the firm has already sent out. The `P-` prefix makes the two visibly different. |
| What the project owns | Client, site, money roll-up, files | The economic argument for the layer: the fourth job on a parcel stops being a fourth retyping of the same address. |
| Money | **Summed, never stored** | A stored total drifts the first time a job is edited by anything that does not know to update its parent, and a wrong money figure is worse than none. |

### Three rules that are wrong in the obvious implementation

1. **Inheritance happens once, at creation — and never overwrites.** The values are *written onto*
   the job, not resolved through the project on read, because every PDF export, field packet and CAD
   title block already reads `job.client_name` and `job.address`; turning those into lookups would
   have meant editing dozens of call sites to fix a problem nobody has. And a caller who types a
   different address is telling you this job is on the adjoining parcel — a project that overwrote it
   would silently discard the more specific of the two facts.
2. **Project edits do not cascade down.** Same reason. The project page reports which jobs have
   diverged instead of quietly correcting them.
3. **`nextProjectNumber` takes the MAX, not the count.** With `P-2026-0001..0003` and 0002 deleted, a
   count-based scheme returns `0003` — which already exists. Either the unique index rejects it, or
   worse, a number that is on somebody's paperwork gets reused.

## 3. The migration

`seeds/601_projects.sql`, applied live 2026-08-19.

The `NOT NULL` **comes last**, and cannot come first: the column is added nullable, every existing
job is given a project built from its own client and site data, a guard raises if any job was missed,
and only then is the constraint applied.

The backfill makes **one project per existing job**, not a single "Unassigned" bucket — a shared
bucket would put unrelated clients and parcels in one container and somebody would later have to
guess which job belonged with which. A project of one job is honest and can be merged by hand; a
project of everything is a lie that cannot be undone.

Result: **7 projects created, 7 jobs linked, 0 orphans.** All seven existing jobs turned out to be
binned QA artifacts, so their projects were created binned too.

## 4. What shipped

| Surface | |
|---|---|
| `projects` table + `jobs.project_id NOT NULL` | seed 601 |
| `lib/projects/model.ts` | numbering, status vocabulary, inheritance, roll-up — pure, 21 tests |
| `GET/POST /api/admin/projects` | list with a one-query roll-up (never N+1), create |
| `GET/PATCH/DELETE /api/admin/projects/[id]` | detail + jobs + roll-up; delete **refused** while live jobs remain |
| `POST /api/admin/jobs` | project now required; inherits client + site |
| `/admin/projects`, `/admin/projects/new`, `/admin/projects/[id]` | list, create, detail |
| `/admin/jobs/new` | required project picker, prefills from it, `?project=` preselects |
| `/admin/jobs/[id]` | links up to its parent project |
| `/admin/jobs` | links across to All Projects |
| Nav registry | **All Projects** + **New Project**, listed *above* All Jobs |
| Work landing | picks both up automatically, plus an **Active projects** counter |
| File Explorer | `mnt:projects` — project → job → kind → items |

### Why the Projects mount reuses `jobKindNodes` verbatim

A file appears with the **same id** it has everywhere else (`mnt:job-files:…`), so download, preview
and search need no third code path, and the per-kind role gates are the same ones. A parallel
resolver would have been a second place to get permissions wrong. The one rule added: a job id under
`mnt:projects:<a>` must actually belong to project `<a>`, or a drawing could be read under the wrong
engagement's breadcrumb.

## 5. Verification

`scripts/check-projects-jobs.mjs` — **ALL CLEAR**. It creates a project and two jobs, then removes
all three, and asserts the things unit tests cannot: that a job with no project is refused, that the
second job inherits the client but keeps the address it was given, that job numbers never changed
shape, that a full project cannot be deleted, that a foreign job is unreachable through a project
folder, and that every screen and nav entry exists.

It produced **one false finding** on its first run — "the project does not appear on the projects
page" — from a fixed 1500 ms sleep against a dev server still compiling the route. The page was
correct; the check was not. It now waits for the element rather than sleeping at it. *Same lesson as
the jobs/files fabric doc: an assertion that can fail for timing reasons is not an assertion.*

## 6. Naming and numbering, as the owner described them

> **Owner, 2026-08-19:** *"We will likely name the project by the name of the customer or location or
> date or some combination of all 3, and then we will create the job(s) within the project folder and
> give the job a number."*

Two gaps that named themselves:

- **The name.** The New Project form offers a suggestion built from exactly those three parts —
  `Smith Holdings — Los Ebanos Estates — Aug 2026` — as a button, not a format. The name stays free
  text, because the day somebody needs *"Smith Tract — re-survey after the flood"* is the day an
  enforced pattern becomes an obstacle. Missing parts are dropped rather than leaving an empty
  separator, and a bare date is never offered: that is a timestamp, not a name.
- **The number.** The jobs API has always accepted a `job_number` and generated one only when it was
  absent — but **no form had ever offered the field**, so the number could only ever be automatic.
  There is now a Job Number box on the New Job form, placeholdered *Automatic*. Left blank nothing
  changes; typed, it is honoured — which matters when matching a number a client or a legacy file
  already uses.

## 7. The styling pass

The first screenshots looked broken, and the reason is worth recording because the same trap is
still live elsewhere in this codebase.

**`AdminJobs.css` is imported by `app/admin/jobs/layout.tsx`.** It is therefore scoped to the
/admin/jobs route tree. The projects pages were written against `jobs-page__*` on the reasoning that
the two are siblings — and loaded **none of it**. A 60px unstyled `<h1>`, a primary button rendering
as white text on white, a secondary button as a bare red link. Horizontal overflow was **zero the
whole time**, which is exactly why a measurement said nothing was wrong.

The second trap was quieter: `.pd__job` sits on a `<Link>`, and **styled-jsx only adds its scope
class to intrinsic elements** — a custom component never receives it, so that rule matched nothing.

Both disappear by giving projects their own `AdminProjects.css` and a layout that loads it, rather
than borrowing another route's stylesheet. Every colour is `var(--theme-*, #literal)`, so the
surfaces follow the user's theme and the theming ratchet stays green.

Responsive behaviour that needed deciding rather than defaulting:

- **Header buttons** split the row evenly below 560px instead of wrapping into a ragged stack.
- **Filter chips and the status bar** scroll sideways as one strip rather than wrapping into four
  ragged lines above the content.
- **Job rows** are a 4-column grid on a desktop and reflow to number+money / name / stage on a
  phone — the order somebody reads them in.
- **Job rows carry a tinted ground**, because a hairline border made three jobs read as one block of
  text, especially on a phone where each job occupies three lines.

Verified by screenshot at 1440 and 390 on every new page, waiting for real content rather than
sleeping at it — the first attempt captured the app shell's own loading screen and measured that.
