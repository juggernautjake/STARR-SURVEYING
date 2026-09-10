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
