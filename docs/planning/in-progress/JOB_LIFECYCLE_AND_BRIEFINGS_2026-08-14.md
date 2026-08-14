# Job lifecycle, briefings, and telling people things happened

**Started 2026-08-14. Active.**

Owner, 2026-08-13/14:

> *"I want it so that we have all of the current functionality with receiving job requests and then the
> creation of the job, and then the research and then the notes and instructions for the field crew,
> and then tracking throughout the rest of the job phases for deliverables and payment and all of
> that… We need to be able to assign images and files and receipts and notes and stuff to individual
> jobs."*

> *"I also want my dad to be able to take screen recordings and talk at the same time so that he can go
> over everything with the given job and post the video so I can watch it on my own time… Once he has
> compiled his notes and instructions and stuff, he can post it and make it so that all of the people
> involved in the job can see it. He will also be able to add more stuff later, like files and pictures
> and notes/instructions if needed."*

> *"Every time something happens with a job that someone is assigned to, they should get a notification
> about that thing."*

Three things, and only one of them is a new feature. The lifecycle is largely built and has holes in
specific, findable places. The notifications are a generalisation of a helper that already exists for
one event. The briefing — record your screen while talking, publish it to the job — is genuinely new.

---

## What is actually there today

Measured 2026-08-14 against the live database and the code, not assumed.

| Stage | State | Evidence |
|---|---|---|
| Job requests / leads | **Works.** 11 leads live. Intake, follow-ups, quotes, lifecycle timeline. | `app/admin/leads/*`, `leads` table (40 cols) |
| Job creation | **Works.** Manual, from a lead, and bulk import. | `app/admin/jobs/new`, `/jobs/import` |
| Research | **Works.** Own tab, packet builder, the whole research platform behind it. | job detail `research` tab, `JobResearchPacket.tsx` |
| Instructions for the crew | **Shipped 2026-08-14 (J1).** Was API-only. | `JobInstructions.tsx` |
| Phases / stages | **Works.** 3-phase scheduler onto the org calendar; stage history recorded (6 rows). | `JobPhaseScheduler.tsx`, `job_stages_history` |
| Field work | **Works.** Map, shot log, timeline. | job detail `fieldwork` tab |
| Files & photos | **Works.** Upload, sections, backup tracking, gallery, `file_nodes` mount. | `job_files` (27 cols), `/admin/files` |
| Receipts on a job | **Works.** Job detail fetches receipts by `jobId`. | job detail, `/api/admin/receipts?jobId=` |
| **Deliverables** | **API only — no screen anywhere.** | see J2 |
| Payment | **Partly.** Financial tab shows quote/payments/time. `job_payments` has no UI. | job detail `financial` tab |
| Notifications | **One event only.** Stage changes notify the team; nothing else does. | `lib/notifications/job-stage.ts` |

### The two holes worth naming

**Deliverables.** `/api/admin/deliverables` is a complete, careful API — revisions that supersede rather
than overwrite, sealing that demands the surveyor's name *and* registration number in the same
statement, issuing that demands a recipient, and a separate `received_at` because sending and arriving
are different events. It is consumed by exactly one thing: the public client portal. **No admin screen
creates a deliverable**, so the portal renders an empty list forever and the last third of every job —
the part the firm is legally on the hook for — is untracked. This is the repo's signature defect
(authored, tested, unreachable) in the highest-stakes place it has appeared yet.

**Notifications.** `resolveStageRecipients` already does the hard part — de-dupe the job team, drop
the actor because they already know. It is used for stage changes and nothing else. Uploading a file,
publishing a briefing, issuing a deliverable, linking a receipt, changing the instructions: all silent.

---

## Design decisions taken before building

### D1 — Video cannot go through an API route

Every upload in this codebase today posts a file to a Next route handler. **A screen recording cannot.**
Vercel caps a serverless request body at **4.5 MB**; a ten-minute 1080p screen recording is
**60–150 MB**. Routing it through a handler fails at the platform, not in our code, and would fail as a
timeout or a 413 that reads like a bug in the recorder.

So B3 introduces the first **direct-to-storage** upload in the product: the browser asks our API for a
signed upload URL, PUTs the bytes straight to Supabase, and then tells our API it is done. The API
never touches the bytes. This is new machinery and it is the reason B3 is its own slice.

### D2 — Record on the desktop, watch anywhere

`getDisplayMedia` — the browser API that captures a screen — **does not exist on iOS Safari** and is
unreliable on mobile generally. Dad records at a desktop, which is where he is when going over a job
anyway. Playback is a plain `<video>` and works everywhere, including the crew's phones.

Stated here because the alternative — discovering it on the truck — is how a feature gets called broken
when it is working as the platform allows.

### D3 — Mic and system audio are two different streams

Talking over a recording needs the microphone. Screen capture with `audio: true` gives *system* audio
(what the computer is playing), not the voice. Both are wanted — he may play a video or a call
recording while narrating — so B2 mixes them with a `AudioContext` before handing one track to
`MediaRecorder`. Capturing only one of them is the obvious bug and it is silent: the recording looks
fine and has no voice on it.

### D4 — A briefing is a post, not a file

A briefing has a video *and* notes *and* attachments, is authored over time, and becomes visible to the
job at a moment the author chooses. That is a post with a draft state, not a file upload. Hence its own
table. Its attachments are still registered as `job_files` so they appear in the job folder and the file
manager like everything else — the briefing is a *view* over job artefacts, never a second place files
live.

### D5 — Publish is a decision, append is not

Draft → published is a one-way door that notifies the job. Adding a file or a note to an *already
published* briefing does not re-notify everybody at full volume; it appends and sends a quieter "X added
something to the briefing". Otherwise the person who adds four photos sends four alerts and the team
learns to ignore them. (The receipts work already paid for this lesson: a flag that fires on everything
stops being read.)

### D6 — One notifier, or it will drift

Every job mutation calls **one** function, `notifyJobEvent(jobId, event, actor)`. Not a call to
`notify()` at each site with its own recipient logic — that is how two routes end up disagreeing about
who is on a job. A source-scan test (N5) fails the build if a job-mutating route writes to a job table
without going through it.

---

## Group J — the job record is complete

### J1 — The office can author field-crew instructions ✅ SHIPPED 2026-08-14

The API had authorised admins and the lead RPLS to write since 2026-07-18; the only caller was the
field crew's own Work Mode screen. Now a tab on the job, with a file picker that inserts
`[label](job-file:<id>)` embeds so an instruction carries the plat rather than mentioning it.

*Commit `ccfe87819`.*

### J2 — Deliverables get a screen ✅ SHIPPED 2026-08-14

The whole API is already there and tested. This is a panel, not a subsystem.

- List every deliverable on the job, newest first, showing name, kind, revision, state, and the dates
  that matter (sealed / issued / received).
- **Create** — name + kind. Revisioning is automatic: creating the same name again supersedes.
- **Seal** — surveyor name + registration number, both required by the API and therefore both required
  by the form, with the reason said out loud rather than a validation error after the fact.
- **Issue** — recipient required, delivery method, optional note.
- **Mark received** — separate action, because sending and arriving are different events.
- A superseded revision stays visible and reads as superseded.

**Done when:** a job's deliverables can be created, sealed, issued and marked received from the job
page, and the client portal shows what the admin created.

*Verified in the browser 2026-08-14: created → DRAFT, seal refused until the registration number was
supplied, sealed → final, issued to a named recipient, marked received. No console errors; the test
row was deleted afterwards, so production is unchanged.*

### J3 — Payment is legible on the job

`job_payments` and `job_payment_allocations` exist with no UI; the Financial tab shows the quote and
time entries. Surface what is recorded, and make "what is still owed on this job" answerable.

**Done when:** the Financial tab states quoted / invoiced / paid / outstanding, and payments recorded
elsewhere appear here rather than only in the finance area.

### J4 — Nothing is lost between lead and job

The lead → job path exists (`JobOriginatingLead.tsx`). Verify it end to end and close whatever it drops:
quote, scope, contacts, files attached to the lead.

**Done when:** converting a lead carries its contacts, quote and attachments onto the job, and the job
links back to the lead it came from.

---

## Group B — Briefings (the new feature)

### B1 — Schema

```sql
job_briefings
  id, job_id, org_id, author_email,
  title, body,                  -- the notes/instructions written alongside the video
  state,                        -- 'draft' | 'published'
  published_at, created_at, updated_at

job_briefing_items             -- video(s), files, photos, added over time
  id, briefing_id, kind,        -- 'video' | 'file' | 'photo' | 'note'
  job_file_id,                  -- FK to job_files: the briefing never owns bytes
  note_text,                    -- for kind='note'
  duration_seconds, poster_path,-- video only
  added_by, added_at, sort_order
```

Items point at `job_files`. The briefing is a view over job artefacts, per D4.

### B2 — Record the screen and talk over it

A recorder component: pick a screen/window/tab, mic on, optional system audio, record, pause/resume,
stop, preview before keeping it.

- `getDisplayMedia` + `getUserMedia`, mixed per D3.
- `MediaRecorder` with `video/webm;codecs=vp9,opus`, falling back to vp8 where vp9 is unavailable.
- A visible timer and a size estimate while recording, because a 40-minute recording surprises nobody
  if the number is on screen.
- Refuses to start on a browser without `getDisplayMedia` and says why, naming the browsers that work
  (D2) — rather than showing a dead button.

**Done when:** he can record his screen with his voice on it and play it back before deciding to keep it.

### B3 — Get a large file into storage

The first direct-to-storage upload in the product (D1).

- `POST /api/admin/jobs/[id]/briefings/[bid]/upload-url` → a signed upload URL and the storage path.
- The browser PUTs the blob straight to Supabase with progress.
- `POST …/complete` registers it as a `job_files` row (and a `file_nodes` entry) and as a
  `job_briefing_items` row.
- Resumable, or at minimum: a failed upload leaves no half-registered row, and retry is one button.

**Done when:** a 150 MB recording uploads with a progress bar and appears in the job folder.

### B4 — Compose a briefing

Title, notes (the same authoring affordances as instructions, including file embeds), the recording,
and any files or photos. Saves as a **draft** — nobody is notified, nothing is visible to the team.

**Done when:** a briefing can be assembled over several sittings without anyone seeing it.

### B5 — Publish it to everyone on the job

One button. Sets `published_at`, makes it visible to every member of `job_team`, and notifies them
once (D5, D6).

**Done when:** publishing sends one notification per team member, each linking straight to the briefing.

### B6 — Add to it later

Append a file, a photo, a note or another recording to a published briefing. Sends the quieter
"added to" notification, not the full publish alert.

**Done when:** he can add a photo a week later and the team is told without being shouted at.

### B7 — Watch it

The briefing on the job page and in Work Mode: video player, the notes beside it, attachments listed,
who wrote it and when, and what has been appended since.

**Done when:** a crew member on a phone can watch the briefing and open its attachments.

---

## Group N — every job event reaches the people on the job

### N1 — One answer to "who is on this job" ✅ SHIPPED 2026-08-14

Generalise `resolveStageRecipients` into `jobRecipients(jobId, { excludeActor })`: the active
`job_team` (not removed, not declined), plus the lead RPLS, de-duped, actor dropped.

### N2 — One notifier ✅ SHIPPED 2026-08-14

`notifyJobEvent(jobId, event, actor)` where `event` names the thing that happened and carries the link.
Every job mutation calls this and nothing else.

### N3 — Wire every existing mutation 🔶 PARTIAL 2026-08-14

Stage change (already done — move it onto N2), file uploaded, photo uploaded, briefing published,
briefing appended, instructions changed, deliverable created/sealed/issued, receipt linked to the job,
team member added/removed, payment recorded, schedule changed.

### N4 — Volume control

Per-user, per-event-type preferences, and a digest option. Without this N3 is a machine for teaching
people to swipe notifications away. Ships **with** N3, not after it.

### N5 — The guard

A source scan: any route writing to a job-scoped table must reference `notifyJobEvent`, or be listed
as exempt with a reason. Same shape as the receipts expense-total scan, and for the same reason — the
eleventh mutation written next month will not be silent by accident.

**Done when:** doing anything on a job tells the people on that job, once, with a link that lands on
the thing that happened.

---

## Group Q — it is pleasant to use

### Q1 — Drive every job screen

Jobs list, job detail (all tabs), new, import, leads, lead detail. Every button pressed, every field
saved and re-read. Fix what is broken.

### Q2 — Portrait pass

The job detail page is 10+ tabs of dense content. Phone-width sweep for overflow and unreachable
controls, as the receipts work did.

### Q3 — The role matrix

Verify what an **admin**, a **secretary**, the **owner**, a **researcher** and a **field crew** member
each see and can do on a job — and that nothing important is admin-only by accident. The owner asked
for all four office roles to manage this well; that is a claim to be tested, not assumed.

---

## Ledger

| Slice | State |
|---|---|
| J1 Instructions authoring | ✅ SHIPPED 2026-08-14 |
| J2 Deliverables screen | ✅ SHIPPED 2026-08-14 |
| J3 Payment legibility | ⬜ |
| J4 Lead → job continuity | ⬜ |
| B1 Briefing schema | ⬜ |
| B2 Screen + voice recorder | ⬜ |
| B3 Direct-to-storage upload | ⬜ |
| B4 Compose a briefing | ⬜ |
| B5 Publish | ⬜ |
| B6 Append later | ⬜ |
| B7 Watch | ⬜ |
| N1 Recipients | ✅ SHIPPED 2026-08-14 |
| N2 Notifier | ✅ SHIPPED 2026-08-14 |
| N3 Wire mutations | 🔶 PARTIAL — deliverables + instructions wired; files, photos, team, receipts, payments, schedule remain |
| N4 Volume control | ⬜ |
| N5 Guard | ⬜ |
| Q1 Screen pass | ⬜ |
| Q2 Portrait pass | ⬜ |
| Q3 Role matrix | ⬜ |

**Order:** J2 first (highest stakes, least work — the API is done). Then N1–N2 (everything else wants
to notify). Then B1–B7 as one run, because a half-built briefing is not usable. N3–N5 once the events
exist to wire. Q last, over the finished surface.
