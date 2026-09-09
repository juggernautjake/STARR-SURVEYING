# Projects + Research Projects listings, stacked (2026-09-09)

Owner's drawings: `Projects Listing Page.pdf`, `Research Page.pdf`. Owner's words:

> "I want it so that the project pages are listed vertically stacked on top of each other with the
> project name, customer name, creation date, deadline date, address(es), number of jobs both the
> total and number of jobs completed within the project, the total quoted cost of the project and
> how much has been paid, the project id and the job status. There will be a search bar with a
> filter. The filter will filter by status, or date created, date due, alphabetical from A-Z and
> from Z-A, and whatever other filters you think would be good. We need to keep it simple."

Decisions in the same conversation: the chip is the **project status** (Active / On hold /
Complete / Cancelled); the deadline is the **nearest open job deadline** (projects have none of
their own); the research card follows its own drawing (name, research status, address, created,
connected project); **ten cards a page**.

## What shipped

| Piece | Where |
|---|---|
| Shared frame — search bar with Search button, Filter dropdown (groups of chips), pager "‹ 1 of 16 ›" | `app/admin/components/listing/ListingControls.tsx` + `Listing.css` (tokens only; `.lst--projects` / `.lst--research` set the accent) |
| Sorting, paging, formatting — pure | `lib/admin/listing.ts` (`sortRows`, `paginate`, `formatDate`, `money`, `isOverdue`) |
| Projects list, stacked | `app/admin/jobs/_tabs/ProjectsTab.tsx` (the Projects tab of the Jobs & Projects portal; `/admin/projects` forwards there) |
| Research list, stacked | `app/admin/research/_tabs/ProjectsTab.tsx` |
| Roll-up: `completed` (live jobs at stage `completed`) and `next_deadline` (soonest deadline among live, not-complete jobs; past-due included) | `lib/projects/model.ts`, read by both projects routes |
| Projects API: `job_addresses[]` per project (distinct job site lines) | `app/api/admin/projects/route.ts` |
| Research API: `linked_project { id, project_number, name }` per row, one query | `app/api/admin/research/route.ts` |
| Tests | `__tests__/projects/listing-pages-2026-09-09.test.ts` |

## The filters

Both pages: **Status** (project status / research stage), **Sort by** — Newest first, Oldest first,
Due soonest (projects only), A → Z, Z → A, Recently updated. Projects also keep **Created or worked
on between** (from / to) and **Archived instead of live** inside the dropdown. The button shows how
many filters are off their default; Reset clears them.

Sorting and paging happen in the browser on the full list (the APIs page at 200 and the loop reads
on past that): a deadline derived from jobs cannot be sorted in SQL, and the firm has dozens of
projects, not thousands.

## Gone, on purpose

- The Recent strip (2026-08-19) and the "Assigned to" search on the Projects tab — "keep it simple".
  `scripts/check-project-recents-search.mjs`, the Playwright check that drove them, is stale for
  those two assertions.
- The eight stage chips in a row on the Research tab, the Coverage / Testing Lab buttons beside the
  title (both are portal tabs), and the grid of cards.

## How they differ

Same search bar, dropdown, cards and pager. Projects: a solid brand-blue left edge, a
key/value block (Customer, Created, Deadline, Address), a dashed footer with jobs complete, paid of
quoted, the project ID. Research: a dashed teal left edge, the address as the bold second line, a
footer with the creation date and the connected project. Icons differ (folder vs microscope).

## Motion pass (same day)

Owner: "really smooth transitions and animations and loading transitions". What changed, on the
two listings and the intake modal:

- Cards rise in one after another (45 ms apart, `--i` from the row index); a page change glides
  the list to its top and replays the entrance; a hover widens the coloured edge and slides in a
  chevron ("this opens"); a press settles the card.
- The skeleton is card-shaped (edge, title bar, chip, three lines) and shows ONCE; a filter or
  search reload dims the rows already on screen instead of flashing a skeleton over them.
- In-progress research chips (Analyzing / Drawing / Verifying) carry a pulsing dot.
- The modal plays OUT (fade + sink, 180 ms) on ×, Cancel, Escape and after Create; the page behind
  is scroll-locked while it is up; a slim sweeping bar runs under the header while the project is
  created and files upload; the info cards and the category picker unfold (grid-row trick) instead
  of popping; linking a project pops a green tick; the drop zone breathes while a file is dragged.
- Every animation is opacity/transform (plus grid rows for the unfold) and is switched off under
  `prefers-reduced-motion`. Guard: `__tests__/admin/motion-polish-2026-09-09.test.ts`.
- Found on the way: the exit animation lost a specificity tie to the entrance rule declared later
  in the sheet — the closing rules use two classes.
