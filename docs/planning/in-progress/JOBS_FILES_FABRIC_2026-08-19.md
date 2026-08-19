# Receipts, jobs, and the file system that should already know about both

**Status:** IN PROGRESS · opened 2026-08-19

> **Owner, 2026-08-19:** *"I want the receipt interface and functionality to be fully built out and
> for the project/job pages and UI and project/job management to be fully fleshed out. I want it all
> to be done correctly and be properly hooked up to our file management system."*

`in-progress/` was **empty** when this was asked — every planning doc had been closed or parked. So
this was surveyed against live code and the live database before anything was written, because the
question "is it built?" has been answered wrong in this repo by reading a doc header four times.

---

## 1. What the survey actually found

**Almost all of it is built.** That is the honest headline, and it changes what this doc is for: not
a rebuild, a seam.

| Surface | State, measured |
|---|---|
| Receipts queue, slideshow, deep read, line items, editing, confidence | Built. 21 receipts, 69 line items live |
| Receipt → job link | Built end to end — `JobRefPicker` at capture, a job picker in the queue, and the job's Financial tab lists its receipts |
| Job detail: 10 tabs (overview, schedule, research, CAD, field work, files, photos, financial, activity, messages) | All built and rendering. The Messages stub the old doc recorded is now a real `JobMessagesPanel` |
| Job files | Built — `job_files`, sections, versions, backups, and `file_node_id` to reference a File Explorer document instead of copying bytes |
| File Explorer | Built — `file_nodes`, permissions, personal/shared roots, viewer, clipboard, upload |
| Every page under /admin/receipts, /admin/jobs, /admin/files | `qa-sweep` clean: 0 findings across 7 routes |

### The seam that is missing, and why it matters

**The File Explorer does not know a job exists.**

Its five read-only mounts (`lib/files/mounts.ts`) are *flat lists by source type* — every receipt in
one folder, every job file in another, every drawing in a third, each capped at 500. There is no
`jobs` source. So:

- *"Show me everything for job 24-103"* is **not answerable in the file system.** You must open the
  job and read five different tabs, each of which shows one kind of thing.
- The firm's unit of work is a job. The file system's unit is a source table. Those are different
  shapes, and the mismatch is exactly what "properly hooked up" names.

**And the numbers say nobody has crossed the seam yet:**

| Measured 2026-08-19 | |
|---|---|
| receipts with a `job_id` | **0 of 20** |
| `job_files` referencing a `file_node_id` | **0 of 1** |
| `file_nodes` | 24 (the seeded Shared/Personal skeleton) |

Two readings are possible — the platform is young, or the affordance is not where people are. Both
are addressed by making the job the thing you navigate, rather than a field you remember to set.

---

## 2. Slices

| # | Slice | State |
|---|---|---|
| **S1** | A **Jobs mount**: one folder per job, holding that job's files, photos, receipts, research and drawings | **DONE** |
| **S2** | Nested mount paths — a breadcrumb trail, and `/admin/files?node=…` deep links | **DONE** |
| **S3** | Both directions: the job page opens its folder; the folder opens the job | **DONE** |
| **S4** | Receipt capture: the required declared fields | **DONE** — committed `56b584cf6` |
| **S5** | Browser QA across all three surfaces | **DONE** — `ALL CLEAR` |
| **S6** | The shape `job_files` is written in — unplanned, and the real meaning of the request | **DONE** |
| **S7** | Track every file/folder action to the person who did it, and let anyone pull up the history | **DONE** |
| **S8** | A bin, so a deleted file or folder can be recovered | **DONE** |

### S6 — which is what "properly hooked up" actually meant

§1 framed the seam as an *arrangement* problem. It was only half that. The job page wrote every
attachment as a **base64 `data:` URI in a Postgres text column**; the File Explorer reads **storage
objects**. So the "Job Files" mount was not sparsely populated, it was *structurally empty* — it
filters `upload_state = 'done' AND storage_path IS NOT NULL`, which nothing the job page had ever
produced could satisfy. A missing shape, not a missing link. (A 10 MB PDF was also ~13 MB of base64
on a row every file list pulls, and the auto-backup inserted a second row holding it again.)

`lib/jobs/file-storage.ts` now names the five shapes a row can hold; the web upload goes signed-URL
→ client `PUT` → row, the path the mobile app already used. Legacy `data:` rows are **not** migrated
in place — they are still read, still downloadable, and simply labelled. Rewriting somebody's
existing attachment is a worse failure than carrying it.

### S5 found two things, and only one of them was the product

- **Real bug — the deep link landed on the root.** `/admin/files` reads `?node=` in an effect, so the
  first render always loads the root and the folder is only requested on the next pass. Two requests
  in flight, no ordering guarantee, and the root — one cheap query against a job folder's five —
  overtook the folder that was supposed to replace it. Every load now takes a ticket and only the
  newest may write state. The symptom was the worst kind: the link looked like it did nothing.
- **Check bug — a selector, reported as a product defect.** The Files tab carries a badge count, so
  its accessible name is `"Files 1"`, and `/^files$/i` matched nothing. The click was guarded by
  `if (count)`, so the miss was *silent* and surfaced as "the job page has no link to its folder"
  — when the anchor was there all along. Two assertions were also passing on evidence that could not
  distinguish success from failure (`body.includes('Files')` is true of the root listing too). A
  check that skips a step must say so out loud; an assertion that cannot fail is not an assertion.

### S1 — the Jobs mount

`mnt:jobs` → a folder per job (`24-103 — Smith Tract`) → a subfolder per kind that has anything in
it → the items themselves, each downloadable exactly as it is from its own source mount.

**The rule this must not break:** a mount is READ-ONLY and capped at `download`, so no write path
(rename, move, delete, permissions) can reach a receipt or a drawing through it. The Jobs mount
inherits that by construction — it is a different arrangement of the same synthesized nodes, not a
new kind of node.

**Role gating is per KIND, not per job.** Receipts are `admin`/`developer`; job files and field media
are also `field_crew`; research adds `researcher`/`drawer`. Those gates already exist on the source
mounts, and a job folder must apply the *same* ones — otherwise the Jobs mount becomes a way for a
field crew member to read receipts they are not allowed to see, which is a permissions hole wearing
a folder icon.

### S4 — the receipt fields, which were already half-built when this was asked

`lib/receipts/required-fields.ts`, its 31 tests, seed 600 and the capture-form wiring were sitting
**uncommitted in the working tree** at the start of this work, from the session that answered the
owner's earlier request: *"before it can be submitted, the user has to put in the date, business
name, and total amount."* Seed 600 is already applied live (`declared_by_submitter` exists on
`receipts`). It is finished, verified and committed here rather than left to be lost.

---

## 3. S7 — the tracking that was reported but not happening

> **Owner, 2026-08-19:** *"Please make sure we are tracking who creates the folders and uploads the
> files and stuff too. Every file/folder addition, change and update should be tracked, and should
> be tracked to the user that did it. We should be able to pull up the histories for these things."*

Two separate gaps, and the second one is the interesting one.

### The gap that was expected: the File Explorer recorded nothing

Not one of its mutations wrote an audit row. Creating a folder, uploading, renaming, moving,
copying, deleting and changing permissions all happened with no record of who did them. Every one is
now recorded against the acting user, and `GET /api/admin/files/<id>/history` reads them back.

### The gap that was not: six routes were writing to a column that does not exist

`activity_log` has **`action_type`** and **`metadata`**. Six routes — CAD saves, job creation, job
stage changes, job team changes, **job file uploads**, and employee password sets — wrote **`action`**
and **`details`**. PostgREST rejects that:

```
PGRST204  Could not find the 'action' column of 'activity_log' in the schema cache
```

…and every one of those inserts was wrapped in `fireAndForget`, whose entire purpose is to swallow
the error so an advisory write can never fail a user's action. So the platform **reported** that it
tracked job files and recorded **none of them**. Nothing failed. Nothing was logged.

The reader had the same two names wrong, and worse: `jobs/activity` selected `action, details`, got
the same error, and hit `dbErrorResponse` — so the job **Activity tab was not showing a partial
feed, it was failing outright**.

Measured, not inferred: 70 rows in `activity_log`, 3 of them about a job, **none written since
2026-08-14**, and a live insert with the code's own column names returning PGRST204.

**The lesson is not "check your column names."** It is that a fire-and-forget write has no feedback
path, so its shape must be pinned by something that does. `lib/files/audit.ts` is now the only place
a file event's columns are spelled, `fileEventRow` is pure, and `__tests__/files/audit.test.ts`
asserts those spellings. A rename that breaks the insert now breaks a test.

### Decisions worth keeping

- **History is gated by the same access as seeing the node.** A history says who touched a file and,
  for a permissions change, exactly who was granted what. Anything looser would make the endpoint a
  way to enumerate a folder you cannot open.
- **A folder's history includes its contents.** A folder's own record is created-once,
  renamed-maybe-once. The question somebody has *in* a folder is "what has been happening in here."
- **Keyed on node id, never on a path**, so a file's history survives being renamed and moved.
- **Renames and moves carry their FROM value.** An entry that shows only the new name is a
  timestamp, not a history.

## 4. S8 — the bin

> **Owner, 2026-08-19:** *"We need to have a deleted files/folders bin too, so we can recover files
> if we need to."*

Deletes were **already soft** (`file_nodes.deleted_at`) — and no screen or route had ever looked at a
deleted row, so nothing could be recovered. The bytes sat in the bucket, the row sat in the table,
both unreachable. The delete confirmation even promised *"this can be undone by an admin"*, which
was not true of any screen that existed.

Four rules, each one wrong in the obvious implementation:

1. **The bin lists what a person deleted, not every row that got a timestamp.** Deleting a folder of
   50 files stamps 51 rows; a bin showing 51 entries is a disaster report. An entry is a *deletion
   root* — a deleted node whose parent is not deleted. It is also the only arrangement in which
   restore cannot produce an orphan.
2. **Restore is scoped by the deletion timestamp, not by the subtree.** Delete `survey.pdf` on
   Monday, delete its folder on Friday, restore the folder — Monday's file must stay deleted. The
   delete route stamps one subtree with one timestamp, so equality recovers exactly the act that was
   undone. Without this, restoring a folder silently resurrects everything anyone ever threw away
   inside it.
3. **A restored name can collide**, so the restore renames and *says so* — a file that reappears
   under a name nobody chose reads as the wrong file having been restored.
4. **Purging destroys bytes, so it is admin-only**, removes storage objects before rows, and is
   recorded *before* the purge, because afterwards there is no node left to hang a history on.

Edit access on the parent is enough to throw something away; it is not enough to make it
unrecoverable. Those are different sized mistakes.

## 5. Verification

| Check | Result |
|---|---|
| `scripts/check-jobs-files-fabric.mjs` | **ALL CLEAR** |
| `scripts/check-files-history-bin.mjs` | **ALL CLEAR** |
| `npx tsc --noEmit` | clean |
| `npm run build` | exit 0 |

Both scripts create their own data and put it back, and report what they could not undo.
