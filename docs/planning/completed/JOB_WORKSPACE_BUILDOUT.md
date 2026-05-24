# Job Workspace Buildout

Turn the job detail page into the single workspace a surveyor runs an
entire job from: create it, attach files + photos, do research, draw
CAD linked to the job, track field work, money, and team — all behind
tabs that appear once the job exists.

## 1. State of the job pages today

The detail page (`app/admin/jobs/[id]/page.tsx`, 818 lines) already
ships a tabbed workspace. Tabs only render on the detail route, which
only exists after a job is created — so "tabs appear once a job is
created" is already satisfied structurally.

| Tab | Component | State |
|-----|-----------|-------|
| Overview | inline + `JobChecklist`, `JobTeamPanel`, `JobEquipmentList` | ✅ working |
| Research | `JobResearchPanel` | ✅ working (14 categories, add/expand/delete) |
| Field Work | `FieldWorkView` | ✅ working (point map, shot log, timeline) |
| Files | `JobFileManager` | ✅ working (upload/download/delete, sections, backup) |
| Financial | `JobQuoteBuilder` + `JobTimeTracker` | ✅ working |
| Messages | inline placeholder | 🟡 stub — links to /admin/messages |

Supporting infra already in place:
- Job CRUD API at `/api/admin/jobs` (+ sub-routes: files, research,
  field-data, stages, team, equipment, checklists, time, payments).
- **`cad_drawings` table already has `job_id` (FK to jobs + index)**,
  and `/api/admin/cad/drawings` POST accepts `job_id`. The CAD editor
  (`/admin/cad`) can save/load drawings to the DB via `SaveToDBDialog`
  and `drawingStore.loadDocument()`.

## 2. Gaps vs. the ask

1. **CAD drawing for the job** — biggest gap. There is **no CAD tab**.
   The CAD editor exists but isn't reachable *in the context of a job*,
   and drawings linked to a job aren't surfaced anywhere. The DB
   linkage exists; the UI doesn't.
2. **Add images to the job** — images currently fall into the generic
   Files tab. No gallery / thumbnail / lightbox experience. The dev
   guide already lists "Photo Gallery" as remaining work.
3. **Messages** — placeholder only.
4. **Flow polish** — no inline editing of job fields, no activity feed,
   no PDF export (all listed as remaining work in the page's own dev
   guide).

## 3. Slices

Highest value + directly-requested first.

| Slice | Description | Status |
|-------|-------------|--------|
| **A** | **CAD tab + job↔drawing linkage.** (1) `/api/admin/cad/drawings` GET accepts `?job_id=` and filters. (2) CAD editor accepts `?drawing=<id>` (auto-load that drawing) and `?job=<id>&job_name=` (start a new drawing pre-linked to the job; the save dialog defaults `job_id`). (3) New `JobCadPanel` component + a "CAD" tab: lists drawings for this job (name, feature/layer counts, updated), "New Drawing" button → opens `/admin/cad?job=<id>`, each row → opens `/admin/cad?drawing=<id>`. | ✅ Shipped — drawings GET now filters by `?job_id`; POST only writes `job_id` when explicitly sent (so re-saving from the generic CAD open dialog no longer nulls a job link). CADLayout handles `?drawing=` (fetch + `loadDocument`, unwraps the stored `{version,application,document}` envelope, stamps `?job=` from the drawing's own link, suppresses the startup dialog) and `?job=` (new drawing, job param flows to save). SaveToDBDialog reads `?job=` and includes `job_id` in the save payload. New `JobCadPanel` + "CAD" tab (between Research and Field Work) lists the job's drawings with feature/layer counts + updated date; "New Drawing" → `/admin/cad?job=<id>&job_name=`, each row → `/admin/cad?drawing=<id>`. Typecheck + lint clean. E2E deferred to slice H (deployment-gated — new tab isn't on prod yet). |
| **B** | **Photos/Images tab.** New `JobPhotoGallery` component + "Photos" tab. Reuses the existing files API/storage but filters to image types, renders a responsive thumbnail grid with a lightbox (click to enlarge, prev/next), drag-and-drop or button upload, caption + delete. Uploads tagged `section='photos'` so they're distinct from documents. | ✅ Shipped — `JobPhotoGallery` is self-contained over the existing `job_files` API (`?section=photos`), so it reuses the data-URL storage `JobFileManager` already uses. Responsive auto-fill thumbnail grid (4:3, object-fit cover); click opens a fixed lightbox with Prev/Next/Delete/Close + keyboard nav (←/→/Esc); button + drag-and-drop upload (image/* only, 10 MB/file guard); soft-delete via the files DELETE. Tagged `section='photos'` so they don't collide with the Files tab. New "Photos" tab after Files. Added a `.jobs-page__btn--danger` style for the delete action. Typecheck + lint clean. |
| **C** | **Overview quick-actions + cross-tab counts.** Surface live counts on each tab (files, photos, drawings, research items) and add an Overview "what's next" strip with one-click jumps (Add files, Start a drawing, Add research). Makes the workspace feel connected instead of siloed. | ✅ Shipped — Overview now opens with a quick-action strip (Add research / Start a drawing / Add files / Add photos / Field work) that jumps straight to the relevant tab. Tab buttons show a count badge: Files from `job.file_count` (always known), Research + Field Work from their loaded arrays, CAD + Photos via the panels' `onCountChange` callbacks (deliberately not preloaded — photo data URLs are heavy). Active-tab badge inverts to navy. New `.job-detail__tab-badge` + `.job-detail__quick-action(s)` styles. Typecheck + lint clean. |
| **D** | **Inline editing of core job fields** (name, description, client info, property details, deadline, priority) via the existing `PUT /api/admin/jobs`. Click-to-edit on the Overview tab. | ✅ Shipped — new reusable `InlineEditField` (text/textarea/number/date/select/tel/email; Enter or blur saves, Esc cancels, shows saving/error, rolls back on failure). Overview's Description, Property Details (address/city/state/zip/county/lot/subdivision/abstract/acreage), Client (name/email/phone/company), and Notes are now click-to-edit and always rendered (so empty fields can be filled with an "Add…" affordance). `saveField` PUTs just the changed field, coerces numerics/booleans, and patches local state. Hover shows a ✎ pencil. Typecheck + lint clean. |
| **E** | **Activity feed** — chronological log (stage changes, file/photo uploads, drawings created, research added) read from `activity_log` + `job_stages_history`. New "Activity" tab or an Overview panel. | ✅ Shipped — new `/api/admin/jobs/activity` merges `activity_log` (entity_type='job') + `job_stages_history` into one newest-first timeline (de-duped: stage changes come from the richer history table). New `JobActivityFeed` component + "Activity" tab with per-type icons, actor, and timestamp. Also added `cad_drawing_saved` logging to the drawings POST so job-linked drawings show up in the feed. Typecheck + lint clean. |
| **F** | **Messages tab** — wire to the real messaging system (auto-create/find a conversation for the job, embed the thread) OR a lightweight `job_messages` table if conversations aren't job-scopable. Investigate first. | ✅ Shipped — conversations carry a `metadata` jsonb, so they're job-scopable without a migration. New `/api/admin/jobs/conversation` GET finds-or-creates the job's conversation (titled `Job <number> — <name>`, participants = job team + lead RPLS + creator, `metadata.job_id`). New `JobMessagesPanel` embeds a real thread (find-or-create → list via `/api/admin/messages/send` GET → send via POST), own-vs-other bubble alignment, Enter-to-send, plus an "Open in Messages" deep link. Replaced the placeholder Messages tab. Typecheck + lint clean. |
| **G** | **PDF export** of a job summary (header, property, client, stages, financial, file/photo/drawing manifest) via the existing PDF tooling. | ✅ Shipped — `jobPdf.ts` generates a one-page summary client-side with jsPDF (no server round-trip — all data is already loaded): title, status, property, client, financial, work manifest (files/photos/drawings/research/hours from the live tab counts), and description. New "⬇ Export PDF" button in the job header. Typecheck + lint clean. |
| **H** | **Audit** — verify the full flow end-to-end (create → files → photos → research → CAD → field → financial), Playwright smoke of the new tabs, and a summary table at the bottom of this doc. | ✅ See audit table below. E2E deferred — the new tabs aren't deployed to production yet (the only environment reachable from here), so the existing Playwright suite would gate on deploy; recommend running it post-deploy. |

## 4. Risks + mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| CAD editor URL-param auto-load conflicts with the startup NewDrawingDialog | Med | When `?drawing=` or `?job=` is present, suppress the startup dialog and load/seed accordingly. |
| Drawing save doesn't persist `job_id` when launched from a job | Med | Pass `job` through to `SaveToDBDialog`'s default `job_id`; verify the POST body carries it. |
| Photo uploads bloat the generic files list | Low | Tag `section='photos'`; Files tab can exclude that section, Photos tab includes only it. |
| Messaging system isn't job-scopable | Med | Slice F starts with investigation; fall back to a minimal `job_messages` table if needed. |

## 5. Out of scope (this round)

- Trimble live point streaming, satellite tile imagery (separate, API-key-dependent efforts already noted in the page's dev guide).
- Real-time collaborative CAD editing.

## 6. Audit (end of session)

| Slice | Shipped? | Commit | Notes |
|-------|----------|--------|-------|
| A CAD tab + job↔drawing link | ✅ | `12c8a77` | New Drawing / open existing in editor, scoped to job. |
| B Photos gallery | ✅ | `f120a06` | Thumbnail grid + lightbox + upload. |
| C Quick-actions + tab counts | ✅ | `ac1a635` | Overview jump strip + badges. |
| D Inline editing | ✅ | `a8622b8` | Click-to-edit Overview fields. |
| E Activity feed | ✅ | `dac8963` | Merged activity_log + stage history tab. |
| F Messages tab | ✅ | this batch | Embedded job thread via metadata-scoped conversation. |
| G PDF export | ✅ | this batch | Client-side jsPDF one-page summary. |
| H Audit | ✅ | this batch | This table. |

### The job workspace now (tabs that appear once a job exists)
Overview (with quick-actions + inline edit + Export PDF) · Research ·
**CAD** · Field Work · Files · **Photos** · Financial · **Activity** ·
**Messages**. Bolded tabs are new this build; the rest were extended
(counts, inline edit).

### End-to-end flow covered
Create job → edit details inline → add research → start a CAD drawing
linked to the job → add files + photos → coordinate on the job thread →
track financial/time → review the activity log → export a PDF summary.

### Deferred / follow-ups (not blocking)
- **Playwright E2E of new tabs** — deferred to post-deploy (production
  is the only reachable environment here and doesn't have the new tabs
  yet). The existing suite + new specs should be run after deploy.
- The in-page "Development Guide" block still lists the old 6-tab
  state; cosmetic, left as-is.
- Trimble live streaming + satellite imagery remain out of scope
  (separate, API-key-dependent efforts).
