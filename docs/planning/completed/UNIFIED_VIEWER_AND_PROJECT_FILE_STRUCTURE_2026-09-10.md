# One file viewer, and the standard project file structure

**Status:** DONE · built 2026-09-09 → 2026-09-10 · branch `claude/milam-county-adapter-2026-09-09`

> **Owner, 2026-09-09:** *"Go and look at the file/doc/image viewers that are scattered throughout
> the project … make all of these uniform … attach notes and metadata/tags … rename … copy and
> paste files and send them to new destinations … a uniform way to download all files … zoom in
> and out and pan around and change pages … move back and forth between documents with the left
> and right arrows on each side of the document name … the download button opens the computer
> file explorer … rename the file before saving … NOT reload the page with the document in a
> viewer … just one download button on the viewer."*
>
> **Owner, 2026-09-10:** *"We will have the project folder … within the project folder, the
> individual job folders. Inside of the individual job folders, we will have a research folder …
> a cad folder … a photos folder, and a videos folder. … an option to 'view all files in this
> folder and its subfolders' … This will reduce the number of bubbles we have. Instead we will just
> have the project and job file explorer … a Job Projects folder that contains all of the project
> folders."*

---

## 1. The viewer

**One component.** `app/admin/components/files/FileViewer.tsx` (+ `.css`). Every surface feeds it a
*collection* (the folder on screen) and *capabilities* from an adapter under `lib/files/adapters/`:

| Surface | Adapter | What the details panel can do |
|---|---|---|
| File Explorer (`/admin/files`) | `explorer.ts` | rename, notes, tags, move/copy to another folder, delete — read-only on `mnt:` items |
| Job + project pages (the FolderExplorer) | `mount.ts` | job files: rename, notes, tags, move to another standard folder / job / project, copy, delete; research documents: rename, notes, tags |
| Research documents page | `research-document.ts` | rename, notes, tags, move/copy to another research project |

`SourceDocumentViewer` (annotations, OCR text, page images) and the artifact lightbox keep their
bodies and share only the download.

- **‹ name ›** arrows and ←/→ walk the collection. PgUp/PgDn pages, +/−/0 zoom, R rotate.
- **PDFs are rendered to a canvas by pdf.js** — a PDF can never take the page over. The worker,
  wasm decoders and standard fonts are copied to `public/pdfjs/` by
  `scripts/copy-pdfjs-assets.mjs` (`prebuild` / `predev`), because bundling the worker by URL
  passed `next dev` and failed `next build` (the minifier rejects the worker's `import.meta`).
- **ONE download control**, through `lib/files/download.ts`: `showSaveFilePicker` (the OS "Save
  as" dialog — rename before saving) and, where the API is missing, an object-URL download. Never
  an `<a download>` on a redirecting route. `fetchBlob` uses `credentials: 'same-origin'`:
  `'include'` fails CORS on a route that 302s to storage (which answers `*`).
- **Download all** — `DownloadAllButton` — one .zip of the folder on screen (JSZip, four fetches at
  a time; member names unique per folder; folder paths kept for a whole-job zip).
- **Notes + tags** on `file_nodes` and `research_documents` (seed 634, applied); job files already
  had `description` / `tags` / `label`.
- **Send**: `POST /api/admin/jobs/files/[id]/send` and `…/research/[projectId]/documents/[docId]/send`
  (`{ mode: 'move' | 'copy', … }`); a copy duplicates the storage object.

## 2. The structure

```
Job Projects/                                   mnt:projects           (the File Explorer root folder)
  P-2026-0012 — HILDA WALL THORNDALE/           mnt:projects:<p>
    Project documents/                          mnt:projects:<p>:docs   files with a project and no job
    26146 — HILDA WALL SURVEY/                  mnt:projects:<p>:<j>   (= mnt:jobs:<j>)
      Research/                                 …:research   research_documents linked to the job (seed 633 join + job_id), job files filed as research
      CAD/                                      …:cad        cad_drawings (open in the editor) + CAD / Trimble / point files
      Photos/                                   …:photos     job files in the photos section + Work Mode photos
      Videos/                                   …:videos     job files in the videos section + Work Mode video
      Documents/  (when non-empty)              …:documents  everything else
      Receipts/   (when non-empty)              …:receipts
```

- The vocabulary is `lib/files/job-folders.ts` — shared by the server (`lib/files/mounts.ts`
  lists it) and the client (the FolderExplorer uploads *into* it). `folderForJobFile` decides
  where an existing row lands: section first, then file type, then the bytes.
- The four standard folders are **always present**; Documents and Receipts appear when they hold
  something. Each folder names the sources whose rows it can contain and every source re-checks
  its own role gate — a folder cannot be more permissive than the flat mount of the same rows.
- A mounted file carries `source` (the row behind it), `notes`, `tags`, `original_name`.
- A linked job file (F5) is listed **as** its explorer document, so opening it re-checks the
  viewer's own access.
- `listMountTree` / `GET /api/admin/files/tree?node=` flattens a subtree (a job costs one listing);
  bounded, with `truncated`.

## 3. The pages

- **Job page** — the Research, CAD, Files, Photos and Videos bubbles are gone. The tabs are
  Overview · Schedule · **Files** · Field Work · Financial · Activity · Messages. Files is the
  `FolderExplorer` over `mnt:jobs:<id>`: folder tiles with counts and blurbs, upload into a folder
  (drag-and-drop, attach from Files, over-cap video cut into parts, Background Fetch where the
  browser allows), "All files" across the folders, search, the viewer, Save as, Download all.
  The research records and "Start property research" sit under Research; "New Drawing" under CAD.
  The stage timeline and the overview quick actions still ask for research / cad / photos and land
  on the matching folder (`openTab`).
- **Project page** — the documents panel in the sidebar became a full-width Files section over
  `mnt:projects:<id>`: Project documents beside the job folders.
- **File Explorer** — the mount is called **Job Projects**.

Retired: `JobFileManager`, `JobPhotoGallery`, `JobCadPanel`, `ProjectFilesPanel` (their features
moved into the explorer; guards re-pointed).

## 4. Guards

`__tests__/files/unified-file-viewer.test.ts`, `__tests__/files/project-folder-structure.test.ts`,
`__tests__/files/jobs-mount.test.ts` (re-pointed), `__tests__/viewers/viewer-fit.test.ts`
(the shared viewer reads `lib/viewers/viewer-fit`).

## 5. Verified

- Full suite green (28 454 tests), `next build` green, orphan guard: no new orphans.
- Browser, dev server, admin session: job 26146's Files tab (Research 5 / CAD 0 / Photos 0 /
  Videos 2 / Documents 3, badge 10), All files view grouped by folder, a research document open in
  the viewer with Details; the File Explorer's Job Projects folder; the project page's Files section.

## 6. Not done / owner's call

- Field-crew members see the Jobs and Job Projects folders (they always did); researchers now do
  too, and see only the Research folder inside a job.
- The old `?tab=photos|videos|research|cad` deep links land on the Files tab's matching folder.
- `.trv` files land in Documents (the extension is not in the CAD list); say if they are CAD.

---

## 7. Later the same day (2026-09-10)

**The viewer header** — ‹ name › centred, "4 / 11 files · Page 1 of 3" beneath. And the viewer
imports `pdfjs-dist/build/pdf.min.mjs`: the unminified `pdf.mjs` is itself a webpack bundle whose
`__webpack_require__` collides with Next's under `next dev` (module evaluation died in
`__webpack_require__.r` with "Object.defineProperty called on non-object") while `next build`,
which mangles names, passed — so production rendered and dev did not. Types: `types/pdfjs-min.d.ts`.
A stale PWA service worker on localhost also served old chunks during the repro: unregister + clear
caches before believing a dev reproduction.

**Zoom at the cursor** — ctrl/⌘ + wheel (which is also what a trackpad pinch sends) zooms at the
cursor, continuously from the fitted size; the wheel listener is native and non-passive.

**NEW bubbles + due bubbles** — a new job writes one `job_created` notification per company user who
works jobs (the creator excepted). Unread = NEW on the Work icon, "New" on the flyout's Job Projects
row, NEW beside Created on the project cards, New on job cards and the project page's job rows;
opening the job reads it (`/api/admin/jobs/new`; `lib/admin/use-new-jobs.ts` is the one client
reader). Beside Deadline: DUE IN TWO DAYS / DUE IN ONE DAY / DUE TODAY / PAST DUE by calendar day
(`dueBubble` in `lib/admin/listing.ts`). Guard: `__tests__/jobs/new-job-badges.test.ts`.

**ONE file explorer pop-up** — `app/admin/components/files/FileExplorerDialog.tsx` (+ `.css`), the
Windows-Explorer-shaped modal: places on the left (My files, Shared files, Job Projects, Jobs,
Research Documents, Drawings, Receipts, Job Files, Field Media, People's files), the folder on the
right with a breadcrumb and Up, four views (large icons with image previews, small icons, list,
details), search across everything (mounts included), and a footer that carries the caller's
actions. It replaced `FilePicker.tsx`:

- the viewer's Send To is one **Send to…** button → the pop-up in folder mode with **Copy here** /
  **Move here**; which folders qualify is each adapter's `canSendTo` (explorer: any folder you can
  edit; job files: a job's Research / CAD / Photos / Videos / Documents folder or a project's
  documents — the send route now takes the destination's `section`; research documents: another
  research project under Research Documents, which became a folder per research project);
- attach-from-Files on the FolderExplorer opens it in file mode;
- the explorer page's Move opens it with "Move here".

Retired with it: `app/admin/components/jobs/FileViewer.tsx` (the adapter whose callers went with
the tabs), `lib/files/adapters/job-file.ts`, `FileDetailsPanel.tsx`. Guard:
`__tests__/files/file-explorer-dialog.test.ts`.

**A project has no address; its jobs do** — "we might have a project that has multiple properties
with different addresses." `INHERITED_FIELDS` is the client and the lead surveyor only; the project
forms lost the Site fieldset; the listing card's Address row lists the jobs' addresses one per line
(and a search by street / city / county reaches them through the jobs); the project page lost the
Site card and shows each job in full — number, stage, name, address with county and legal
description, survey type and acreage, deadline with its due bubble, created, and quote / paid /
owed. The new-job form fills the client from the project and never the site.

**Page titles** — `lib/admin/page-title.ts`: a page that knows its subject calls `usePageTitle()`
and the bar (and the browser tab) say "P-2026-0012 — HILDA WALL THORNDALE" / "26146 — HILDA WALL
SURVEY" / "Edit P-2026-0012 — …" / "Field captures — 26146 — …" instead of "Admin" or "Job
Detail". The route rules gained Edit Project / Project Detail / Field Captures for the moment
before the data lands. The store hook is read above the layout's early returns (hook order).
Guard: `__tests__/projects/job-addresses-and-titles.test.ts`.
