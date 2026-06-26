# Starr File Explorer — Full-Fledged File Management System

**Status:** 🟡 In progress (created 2026-06-25).
**Owner:** Jacob (Starr Software / Starr Surveying).

A company-wide file explorer in the admin: browse every file (financial reports,
receipt photos, job files, uploaded docs), organized in folders with **granular
permissions** (by role or specific person), **personal folders** per employee,
**shared** areas everyone can reach, in-app **PDF + image viewing**, and
**upload/download** to/from the device.

## How this doc is driven
Stop-hook driven: next unchecked slice → read live code → smallest shippable change
→ typecheck + lint + test → commit + push → annotate the slice. Tag **[me]** (code)
vs **[you]** (operator). Triple-check function, feature, style, and formatting each
slice; verify mobile at 390px and desktop.

---

## 1. Goals
1. **Browse all files** on the site from one place — financial reports, receipt pics, job files, uploaded files, etc.
2. **Folder/file permissions** — restrict sensitive info to the right roles or specific people.
3. Works for **all employees**.
4. **Personal folder** per employee (their private saved data).
5. **Shared** areas anyone can access.
6. A **permissions interface** to grant roles or specific users access to a folder/file.
7. **View PDFs and images** in-app.
8. **Download and upload** files to/from the device.
9. Robust, intuitive, fully working — brand-styled, mobile + desktop.

## 2. Architecture (grounded in the existing stack)
- **Virtual filesystem:** a `file_nodes` table (folders + files, `parent_id` tree). Files point at Supabase Storage (`storage_bucket` + `storage_path`). New explorer uploads go to a private **`file-explorer`** bucket (auto-created via `ensureStorageBucket`); existing sources (receipts, job files) mount in read-only later (F9).
- **Permissions:** a `file_permissions` table — grants of `everyone | role | user` × `view | download | edit | manage`, with **inheritance** (a node either inherits from its nearest `custom` ancestor or breaks inheritance with its own grants). Owner of a node (or ancestor personal root) = manage; admins = manage. Resolution is **pure + unit-tested** in `lib/files/permissions.ts`; the API enforces it server-side via the service role (Supabase RLS = service-role only; the route is the gate).
- **Personal roots + Shared root:** auto-provisioned system folders (protected from rename/delete).
- **UI:** `/admin/files` — folder tree + main pane (list/grid), breadcrumb, upload/download, rename/move/delete, an in-app PDF/image viewer, and a permissions dialog. Brand-styled (navy/red, Inter/Sora), mobile-first.

## 3. Slice plan

### F1 — Schema + permission model (foundation) **[me]**
- [x] ✓ 2026-06-25 — `file_nodes` + `file_permissions` (**seed 384, applied live**; RLS,
  unique-name-per-folder, soft delete, parent_id tree) + `lib/files/permissions.ts` (access
  levels none<view<download<edit<manage, grant matching everyone/role/user, inheritance walk,
  owner/admin overrides, `canView/Download/Edit/Manage`). Source-locked by
  `__tests__/admin/file-explorer-permissions.test.ts` (12 green).

### F2 — Core node API **[me]**
- [x] **F2a** ✓ 2026-06-25 — `GET /api/admin/files` (list children + breadcrumb,
  permission-filtered), `POST` create folder, `PATCH /api/admin/files/[id]` rename/move
  (cycle-guarded), `DELETE` soft-delete subtree — all permission-enforced via
  `lib/files/server.ts` (chain load, grant batching, `resolveAccess`, `listChildren`,
  `collectSubtreeIds`) + name-collision auto-suffix. Pure `lib/files/tree.ts`
  (`sanitizeName`, `nextAvailableName`, `wouldCreateCycle`, `buildBreadcrumb`)
  source-locked by `file-explorer-tree.test.ts` (18 green incl. permissions).
- [ ] **F2b** `POST /api/admin/files/[id]/copy` — copy **and** duplicate (storage-object
  copy for files once F3's bucket exists; deep copy for folders).

### F3 — Upload / download API **[me]**
- [x] ✓ 2026-06-25 — `lib/files/upload.ts` (validateUpload @100MB cap, buildStoragePath,
  image/pdf/previewable mime helpers; tests). `POST /api/admin/files/upload` → signed
  upload URL into the private `file-explorer` bucket (`ensureStorageBucket`, edit-gated);
  `POST /api/admin/files/upload/complete` → creates the file node; `GET
  /api/admin/files/[id]/download` → short-lived signed URL (`?inline=1` for the F6 viewer),
  download-gated. No API body-size limit (client PUTs to the signed URL).

### F4 — Explorer UI: browse **[me]**
- [x] ✓ 2026-06-25 — `/admin/files` page — breadcrumb nav, create-folder, upload (XHR
  progress), download (signed URL), rename, soft-delete; permission-aware row actions
  (`canDownload`/`canEdit` per node), brand-styled styled-jsx, mobile-responsive,
  empty/loading/error states. **Entry point: a "Files" item in the admin nav
  (`route-registry.ts`, `FolderOpen` icon, `internalOnly`, all employee roles)** so it's
  reachable for everyone. Grid toggle + drag-move land in F5; the tree pane folds into F5's
  clipboard/move UX.

### F5 — Upload / download + clipboard UI **[me]**
- [ ] Direct upload (drag-and-drop **and** file-picker) with progress; download (single +
  multi-select); **cut / copy / paste, duplicate, rename, and drag-to-move** for files and
  folders (multi-select aware); device round-trip verified both directions.

### F6 — In-app viewer **[me]**
- [ ] PDF viewer + image lightbox (zoom, next/prev) via signed URLs; graceful fallback to download for unsupported types.

### F7 — Permissions interface **[me]**
- [ ] Per folder/file dialog: add/remove grants (everyone / role / specific user) × access level; inherit-vs-custom toggle; live "who can access" effective-access preview.

### F8 — Personal folders + Shared root **[me]**
- [ ] Auto-provision a personal root per employee (owner=manage) + a Shared root (everyone=view); protect system folders; backfill existing employees.

### F9 — Mount existing sources (read-only) **[me]**
- [ ] Surface receipts, job files, and finance exports as read-only virtual nodes so "all files" are browsable in one tree (per-source, gated by the source's own access rules).

### F10 — QA + polish **[me]**
- [ ] 3-pass review of every function/feature/style: keyboard nav + ARIA, mobile + desktop, large trees, permission edge cases (deny beats allow? owner vs custom), error/empty states, download/upload integrity.

## 4. Decisions & guardrails
- **Server-enforced permissions** — every read/write re-checks access server-side; the client never decides access. RLS keeps tables service-role-only; the API is the gate.
- **Soft delete** (`deleted_at`) with a trash concept later; never hard-delete from the UI.
- **Sensitive by default** — a new folder inherits its parent's permissions; personal roots are owner-only; nothing is world-readable unless explicitly granted `everyone`.
- **Admins always have manage** (break-glass); logged.
- Reuse existing Supabase Storage + the `ensureStorageBucket` helper; don't duplicate per-feature file systems — mount them (F9).
