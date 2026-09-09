# New Research Project modal — the intake form from the owner's drawing (2026-09-09)

Owner's drawing: `Initial Research Information Input Modal.pdf` (two pages). Owner's words:

> "I want to simplify it. … The '+Add Info' button will then prompt the user to select what kind of
> info they want to add. … Each option should render a field that is designed specifically for that
> option, with enforced formatting. … The volume/page field would actually be two fields with a '/'
> between them. … Each uploaded file will be shown and will have a view button next to it. …
> the user can choose to add the research project to a job project so that they are linked. Job
> projects can have multiple research projects linked to them. … those jobs will be shown, and the
> user can check which of the jobs the new research project relates to. … each section has an info
> button/icon at the bottom right which simply just explains what that section is for."

Decisions taken in the same conversation:

- **No run settings on the form.** "The modal should not handle all of the settings, but should just
  be used to take in information and set things up." The spend switch, the budget and the readiness
  verdict are gone from the modal; they belong to the research page (to be redesigned later).
- **A project-name section** leads (the owner: "You can add an initial section that takes the research
  project name").
- **No analysis at creation.** "We will push back the analysis of any initial notes or documents to the
  start of the actual research run. The first thing that the system will do is take any user-given
  info and analyze it fully and determine if any of that information is useful enough to use." The
  form stores everything in the shape that analysis will read; the analysis itself is the first
  stage of the run and is NOT built in this slice (see "Left for the run page").

## What shipped

| Piece | Where |
|---|---|
| The modal — six sections, More Info popovers, drag-and-drop files with View, project + jobs linker | `app/admin/research/components/NewResearchProjectModal.tsx` + `.css` (all tokens, no inline hex) |
| The catalogue of information kinds, with sanitizers, validators, help and examples | `lib/research/intake-info.ts` |
| One column and one join table for the link | `seeds/633_research_project_links.sql` — `research_projects.project_id`, `research_project_jobs`; backfilled from `job_id`; **applied to production 2026-09-09** |
| API: `project_id` + `job_ids` on POST (join rows written, `job_id` mirrored), `project_id` on PATCH, generic supplemental count, owner_name folded from the first "Current owner" line | `app/api/admin/research/route.ts` |
| ProjectsTab mounts the modal; the 1,100-line inline form is gone | `app/admin/research/_tabs/ProjectsTab.tsx` |
| Types | `types/research.ts` (`project_id`), `useRunState.ts` (`Partial<IntakeSupplemental>`) |
| Tests | `__tests__/research/new-research-project-modal.test.ts` (catalogue + wiring); `create-modal-fields`, `paid-documents-toggle-is-wired` rewritten; `job-link`, `county-check-is-wired`, `owner-name-reaches-the-run`, `structured-address-reaches-the-search`, `modals-do-not-close-on-outside-click`, `run-readiness`, `scope-guard` re-pointed |

### The kinds of information (the owner asked me to determine them)

| Kind | Fields | Format enforced |
|---|---|---|
| Current owner | (a fixed field under the Property ID, not in the picker) | sent as `owner_name`; leads `ownerNames` |
| Previous owner | name | same; stored separately (`priorOwnerNames`) |
| Instrument number | instrument | upper-cased, no spaces, 4–20 chars, ≥ 4 digits, letters only as a prefix |
| Volume / Page | volume `/` page | digits; page may end in one letter |
| Plat cabinet / slide | cabinet `/` slide | cabinet ≤ 4 alphanumerics; slide number + optional suffix |
| Subdivision, lot, block | name, lot, block | name required; lot/block short codes |
| Abstract / survey | number, survey | number digits only ("A-38" → 38) |
| Geo ID / account no. | id | alphanumerics, dots, dashes |
| Legal description | text | ≥ 5 chars |
| Acreage | acres | positive decimal, ≤ 4 places |
| Previous address | address | ≥ 5 chars |
| Recording date | date | YYYY-MM-DD, real, ≥ 1800, not future |
| Coordinates | lat `,` lng | decimal degrees within range |
| Something else | label, value | both required |

The payload (`IntakeSupplemental`) keeps the four names the run has read since plan H2 —
`instrumentNumbers`, `ownerNames`, `volumePages`, `cabinetSlides` — and adds the rest beside them.
It is stored on `research_projects.analysis_metadata.supplemental` and handed to the worker
unchanged when a run starts; the worker uses what it already knows and ignores the rest until the
run-start analysis is built.

### Required fields

The drawing marks the street, city, state, ZIP and county as required and the Property ID as
optional. Implemented as: **county always required; then either the full street address or a
Property ID**. A rural tract may have no situs address and be reachable only by its Property ID,
and refusing that would send people to the appraisal district site for an address that does not
exist. The asterisks are as drawn.

### Linking

Search projects (number, name, client, address) → pick one → **Confirm link** → the project's jobs
appear with checkboxes and an **All jobs** toggle. Arriving from a job (`?new=1&job=<id>`) pre-links
the job's project and ticks the job. `job_id` is kept as a mirror of the first linked job because the
job page's research tab, the research packet route and the project header read it; the join table
is the source of truth. The edit modal on the project page still edits only `job_id` (PATCH accepts
`project_id` now, so that is a small follow-up).

## Left for the run page (not this slice)

- **Run-start intake analysis** — the first stage of a run reads `intake_notes`, the uploaded
  documents (`source_type = 'user_upload'`, text already extracted by `processDocument`) and the
  supplemental payload, and decides what is useful. Nothing analyses at creation any more.
- **Run settings on the research page** — spend switch, budget, which information to use, and a
  review/edit of the initial information. Owner: "we will eventually fully redesign each research
  page, but for now I am just redesigning the initial modal."
- `RerunDialog` still uses the older `SupplementalInfoFields` (four kinds). Unify onto the catalogue
  when the run page is redesigned.
- The project page's edit modal: expose the project + jobs link (PATCH already accepts `project_id`;
  the join table needs a small route).
