# Phase 18 — Data Versioning & Pipeline Diff Engine

## Overview

Phase 18 adds **pipeline result versioning** to STARR RECON. Each time the AI pipeline runs for a research project — whether triggered by an initial upload, a document purchase, or a manual re-run — a complete snapshot of the results is saved as a numbered version.

Surveyors can then compare any two versions side-by-side to see exactly what improved (or changed) after purchasing clean, watermark-free documents.

---

## Modules

### A. `PipelineVersionStore` (`worker/src/services/pipeline-version-store.ts`)

Manages the file-based version storage. Each project gets a subdirectory under `versionsDir` (default `/tmp/recon-versions`):

```
/tmp/recon-versions/
  _global.json              ← versionId → projectId lookup
  {projectId}/
    index.json              ← array of PipelineVersion metadata records
    {versionId}.json        ← full pipeline result snapshot
```

**Key methods:**

| Method | Description |
|--------|-------------|
| `saveVersion(projectId, trigger, label, snapshot, stats)` | Write snapshot + update index; auto-increments `versionNumber` |
| `listVersions(projectId)` | Returns all versions newest-first |
| `getVersion(versionId)` | Lookup by UUID across all projects |
| `loadSnapshot(versionId)` | Load the full JSON snapshot for a version |
| `getLatestVersion(projectId)` | Shortcut for the highest version number |
| `deleteProjectVersions(projectId)` | Remove all stored versions; returns deleted count |

### B. `PipelineDiffEngine` (`worker/src/services/pipeline-diff-engine.ts`)

Compares two `PipelineVersion` snapshots and produces a structured `PipelineDiffResult`.

**Diff coverage:**

- **Confidence** — delta, direction (improved/decreased), numeric before/after
- **Closure error** — improved flag (lower is better)
- **Boundary calls** — per-call diff at bearing, distance, monument, confidence level; each changed bearing is flagged `critical`

**Key methods:**

| Method | Description |
|--------|-------------|
| `diff(vA, snapA, vB, snapB)` | Returns `PipelineDiffResult` |
| `summarizeChanges(diff)` | Array of human-readable bullet points |
| `isSignificantChange(diff)` | `true` when confidence changes >5 pts, critical changes exist, or calls added/removed |

### C. SQL Schema (`seeds/096_phase18_versions.sql`)

Creates the `pipeline_versions` table to persist version metadata in Supabase alongside the file-system snapshots. Also includes:

- `UNIQUE (project_id, version_number)` — prevents duplicate version numbers per project
- `UNIQUE` on `version_id` — ensures globally unique version identifiers
- Row Level Security — authenticated users see only their own projects; service role has full access
- `get_version_history(project_id uuid)` — convenience function returning all versions newest-first
- Indexes on `project_id`, `version_id`, `trigger`, and `created_at`

### D. Admin API (`app/api/admin/research/[projectId]/versions/route.ts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/research/{projectId}/versions` | List all versions for a project |
| `POST` | `/api/admin/research/{projectId}/versions` | `{ action: 'compare', versionAId, versionBId }` — diff two versions |

---

## Version Triggers

| Trigger | When it fires |
|---------|--------------|
| `initial_run` | First pipeline execution after document upload |
| `document_purchased` | User purchases a clean document, pipeline re-runs |
| `manual_rerun` | Surveyor manually triggers a re-analysis |
| `adjacent_update` | An adjacent parcel's data updated, triggering a cascade |
| `txdot_update` | TxDOT ROW data refreshed |

---

## Data Flow

```
Document purchased
      ↓
Pipeline re-runs
      ↓
PipelineVersionStore.saveVersion()
  ├─ writes {versionId}.json  (full snapshot)
  ├─ updates index.json        (version metadata)
  └─ updates _global.json      (versionId → projectId lookup)
      ↓
Surveyor requests diff via API
      ↓
PipelineDiffEngine.diff(vA, snapA, vB, snapB)
      ↓
PipelineDiffResult returned to UI
```

---

## Key Types

```typescript
interface PipelineVersion {
  versionId: string;          // UUID v4
  projectId: string;
  versionNumber: number;      // 1, 2, 3…
  label: string;
  trigger: VersionTrigger;
  overallConfidence: number | null;
  overallGrade: string | null;
  closureError_ft: number | null;
  callCount: number;
  documentCount: number;
  createdAt: string;          // ISO-8601
  snapshotPath: string;       // relative path to JSON snapshot
}

type VersionTrigger =
  | 'initial_run'
  | 'document_purchased'
  | 'manual_rerun'
  | 'adjacent_update'
  | 'txdot_update';
```

---

## Tests

55 unit tests in `__tests__/recon/phase18-versioning.test.ts`:

- **PipelineVersionStore** (20 tests) — instantiation, file creation, UUID generation, version number increment, list ordering, getVersion, loadSnapshot, getLatestVersion, deleteProjectVersions, trigger types
- **PipelineDiffEngine** (20 tests) — diff computation, confidence delta, closure improvement, call add/remove/modify detection, critical change flagging, summarizeChanges, isSignificantChange
- **SQL Schema** (8 tests) — file existence, table definition, UNIQUE constraints, RLS, FK reference, function definition, indexes
- **API Route structure** (7 tests) — file existence, GET/POST exports, imports

Run with:
```bash
npx vitest run phase18
```
