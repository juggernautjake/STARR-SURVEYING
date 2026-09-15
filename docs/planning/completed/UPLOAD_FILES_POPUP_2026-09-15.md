# Upload files pop-up + named job folders — 2026-09-15

**Owner:** "We revamped the file storage system … but my dad is having a hard time finding a way to
easily upload files properly. We need a button for uploading/attaching files, that when pressed, opens
a pop up kind of modal that allows the user to drop files into it or open the computer file explorer
… the user will be required to choose which folder in a job the file(s) will upload to … choose from a
dropdown list of available folders in the job, and they should even be able to create and name a new
folder … Make sure we can clearly see the buttons for uploading files."

## Why uploading was hard (found, not guessed)

1. **No upload button at a job's top level.** The FolderExplorer only showed *Upload to X* after you
   opened a standard folder. The job's Files tab opens at the top, showing folder tiles and no way to
   upload.
2. **On desktop Chrome and Edge, choosing a file could do nothing.** Both browsers have Background Fetch,
   so the explorer took the "background" path, and `startBackgroundUpload` awaited
   `navigator.serviceWorker.ready`. That promise **never settles** while no service worker is
   registered, and the admin PWA is off unless `NEXT_PUBLIC_ADMIN_PWA=1`. When a worker *was*
   registered, files only appeared after a refresh.

## What shipped

| Piece | Where |
|---|---|
| Named folders table + `job_files.folder_id` | `seeds/639_job_file_folders.sql` (**applied to live 2026-09-15**) |
| Folder ids `mnt:jobs:<job>:<root>.<uuid>` (same segment count as a standard folder), name rule, roots | `lib/files/job-folders.ts` |
| Listing named folders + their files, the tree walk, breadcrumbs | `lib/files/mounts.ts` |
| Create / rename / remove (files move UP, never deleted) | `app/api/admin/jobs/folders/route.ts`, `…/folders/[id]/route.ts` |
| `folder_id` on upload, move within a job, send/copy | `lib/files/job-folders-server.ts` → `jobs/files`, `jobs/files/[id]`, `jobs/files/[id]/send` |
| Viewer Move/Copy into named folders | `lib/files/adapters/mount.ts` |
| Dropdown destinations / new-folder parents / suggestions | `lib/files/upload-destinations.ts` (pure) |
| **The pop-up** | `app/admin/components/files/UploadFilesDialog.tsx` + `.css` |
| Upload bar, drop-anywhere, New folder, Rename, Remove | `app/admin/components/files/FolderExplorer.tsx` |
| **Upload files** first in the job header; Overview "Add files" / "Add photos" open the pop-up | `app/admin/jobs/[id]/page.tsx`, `.job-detail__uploadbtn` in `AdminJobs.css` |
| Background hand-off can no longer hang | `lib/jobs/upload-background.ts` (`getRegistration()` + `active`) |

## The pop-up

1. **Add files.** Drag them onto the big target (or anywhere on the pop-up), or press **Choose files…**
   to open the computer's file picker.
2. **Choose a folder for each file.** Each file has its own required dropdown: the job's Research, CAD,
   Photos, Videos, Documents (offered even while empty) and every named folder, indented. On a project
   the options are grouped by job. **Put every file in** fills all the dropdowns at once. A one-click
   suggestion ("Put it in Photos") appears but is never applied for you. Photos only accepts images and
   Videos only video; other options are greyed with the reason. **＋ New folder…** asks for a name and
   where to put it, creates the folder, and selects it.
3. **Upload.** Files go up one at a time. Each shows its own progress bar with MB counts, then a tick
   and "Saved in Photos › Corners", or an error with **Retry**. Nothing uploads until every file has a
   folder. An over-cap video offers **Cut it into parts**. The background hand-off is an opt-in
   checkbox, shown only when a service worker is actually active.

Guards: `__tests__/files/upload-files-dialog.test.ts` (pure logic, the listing on a fake database,
the routes, the wiring on both callers).
