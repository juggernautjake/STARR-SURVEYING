# STARR Surveying — Modular Testing Lab Plan (v2)

> **Date:** 2026-03-29
> **Branch:** `claude/modular-ui-versions-ThZu1`
> **Status:** Implementation in progress

---

## 1. Goals

| # | Goal | Why |
|---|------|-----|
| 1 | Keep **production UI** (`/admin/research`) unchanged | Admins can still run the full pipeline end-to-end |
| 2 | Build **Testing Lab** (`/admin/research/testing`) | Admin-only debugger for every scraper, analyzer, and pipeline phase |
| 3 | **Execution Timeline** with event markers | Scrub through execution history, see exactly when each event fired |
| 4 | **Code Viewer** showing live execution trace | See which file/function is running in real-time, multi-tab |
| 5 | **Speed Control** — slow execution down dramatically | Comprehend what's happening step-by-step |
| 6 | **Pause / Resume / Rewind** | Stop at any point, review logs, rewind timeline |
| 7 | **GitHub Branch Integration** | Switch branches, pull code, edit and push from the UI |
| 8 | **Multi-branch parallel runs** | Run the same test on two branches side-by-side |

---

## 2. Architecture Overview

```
/admin/research/                  ← PRODUCTION (unchanged)
/admin/research/testing/          ← TESTING LAB
  layout.tsx                      ← Admin guard + lab chrome
  page.tsx                        ← Main dashboard with all tabs
  components/
    PropertyContextBar.tsx        ← Shared property inputs
    TestCard.tsx                  ← Reusable module card with full debugger
    ExecutionTimeline.tsx         ← Timeline bar with event markers + scrubber
    CodeViewer.tsx                ← Multi-tab code viewer/editor
    LogStream.tsx                 ← Real-time log viewer synced to timeline
    SpeedControl.tsx              ← Playback speed slider
    BranchSelector.tsx            ← GitHub branch picker + multi-branch
    OutputViewer.tsx              ← JSON tree + screenshots + errors
    ScrapersTab.tsx               ← 10 scraper cards
    AnalyzersTab.tsx              ← 8 analyzer cards
    PhasesTab.tsx                 ← 9 pipeline phase cards
    FullPipelineTab.tsx           ← Full pipeline with phase skip/resume
    HealthCheckTab.tsx            ← Worker + site health
    LogViewerTab.tsx              ← Aggregated log viewer
```

---

## 3. Execution Timeline

The timeline is the centerpiece of the debugger. Every test run produces a
linear sequence of `TimelineEvent` objects.

### 3A. TimelineEvent Structure

```typescript
interface TimelineEvent {
  id: string;                     // uuid
  timestamp: number;              // ms since run start
  type: EventType;
  label: string;                  // short description
  description: string;            // full description (shown on hover/click)
  file?: string;                  // source file path
  function?: string;              // function name
  line?: number;                  // line number
  data?: unknown;                 // event-specific payload
  duration?: number;              // ms (for span events)
}

type EventType =
  | 'phase-start'       // blue marker
  | 'phase-complete'    // green marker
  | 'phase-failed'      // red marker
  | 'api-call'          // purple marker — outbound HTTP
  | 'ai-call'           // orange marker — Claude API call
  | 'browser-action'    // cyan marker — Playwright action
  | 'data-found'        // green dot — data point extracted
  | 'warning'           // yellow marker
  | 'error'             // red marker
  | 'screenshot'        // pink marker — screenshot captured
  | 'log'               // gray dot — general log entry
  | 'checkpoint';       // white diamond — pause point for slow mode
```

### 3B. Timeline Bar UI

```
┌──────────────────────────────────────────────────────────────────┐
│  0s        5s        10s       15s       20s       25s     30s  │
│  ├─────────┼─────────┼─────────┼─────────┼─────────┼────────┤  │
│  ●    ◆  ●   ■  ●        ●  ▲  ●   ●  ■     ●              ▶  │
│  │    │  │   │  │        │  │  │   │  │     │              │  │
│  │    │  │   │  │        │  │  │   │  │     │              │  │
│  ▼────────────────────────────────────────────────────────────  │
│  [◀◀] [◀] [▌▌] [▶] [▶▶]    Speed: [0.1x ━━━━━━━━━━━━ 10x]   │
│                                                                  │
│  Marker colors:                                                  │
│  ● blue=phase-start  ● green=complete  ● red=error              │
│  ■ purple=api-call   ■ orange=ai-call  ■ cyan=browser           │
│  ▲ yellow=warning    ◆ white=checkpoint                         │
└──────────────────────────────────────────────────────────────────┘
```

**Interactions:**
- **Hover** any marker → tooltip with event label + timestamp
- **Click** any marker → jump to that point in time, update logs + code viewer
- **Drag scrubber** → scroll through time, all panels update reactively
- **Keyboard:** Left/Right arrows step between events, Space = pause/resume

### 3C. Timeline ↔ Log Sync

When the user scrubs the timeline to time `T`:
- Logs **before T** → shown in full color (black text)
- Logs **after T** → greyed out (visible but dimmed, `opacity: 0.3`)
- The **most recent log at T** is highlighted with a blue left border
- Auto-scroll positions the highlighted log entry in the center of the viewer

### 3D. Timeline ↔ Code Viewer Sync

When the timeline cursor is at time `T`:
- The code viewer shows the file/function that was executing at time `T`
- The active line is highlighted with a yellow background
- If multiple files were involved, tabs appear for each file
- The active tab auto-switches to match the current event's file

---

## 4. Code Viewer / Editor

### 4A. Read-Only During Execution

While a test is running (or paused mid-execution), the code viewer is
**read-only**. It shows:
- The current file being executed (auto-detected from timeline events)
- Syntax highlighting (TypeScript/JavaScript)
- Line numbers with the active line highlighted
- Multiple tabs when multiple files are involved
- Auto-scrolls to the active function/line

### 4B. Editor Mode (When Paused or Idle)

When no test is running, the code viewer becomes an editor:
- Full text editing with syntax highlighting
- Line numbers
- Basic keyboard shortcuts (Ctrl+S = save to branch)
- File tree sidebar showing the current branch's files
- "Save & Push" button commits and pushes to the current branch

### 4C. Implementation

We'll use a lightweight syntax highlighter (no Monaco — too heavy).
Instead: `<pre><code>` with CSS-based highlighting and contentEditable
for edit mode. This keeps the bundle small.

```typescript
interface CodeViewerProps {
  files: CodeFile[];              // files to display as tabs
  activeFileIndex: number;        // which tab is active
  activeLine?: number;            // highlighted line (yellow bg)
  readOnly: boolean;              // true during execution
  onSave?: (file: CodeFile) => void;  // called on Ctrl+S
}

interface CodeFile {
  path: string;                   // e.g. "worker/src/counties/bell/scrapers/cad.ts"
  content: string;                // file content
  language: string;               // "typescript" | "javascript"
  highlightedLines?: number[];    // lines to highlight
}
```

---

## 5. Speed Control & Playback

### 5A. Speed Slider

```
Speed: [0.1x ━━━━━●━━━━━━━━━━━ 10x]
```

- **0.1x** — 10x slower than normal (each step waits 10x longer)
- **1x** — real-time (default)
- **10x** — fast-forward through delays
- Preset buttons: `[0.1x] [0.25x] [0.5x] [1x] [2x] [5x] [10x]`

### 5B. Playback Controls

| Button | Action |
|--------|--------|
| `◀◀` | Jump to previous event |
| `◀` | Step back one event |
| `▌▌` / `▶` | Pause / Resume |
| `▶` | Step forward one event |
| `▶▶` | Jump to next event |

### 5C. How Speed Control Works

The worker sends events via SSE (Server-Sent Events). The frontend receives
them in real-time but **buffers** them. The speed slider controls the
**playback rate** of the buffer:

- At 1x: events are displayed as they arrive
- At 0.1x: events are queued and released 10x slower
- At 10x: buffered events are flushed immediately

When **paused**, new events still arrive and buffer — they just don't render.
When resumed, they play back at the selected speed.

---

## 6. Pause / Rewind / Review

### 6A. Pause

- Click `▌▌` or press Space
- Execution on the worker **continues** (we don't halt the worker)
- But the **UI playback freezes** — no new events render
- The timeline scrubber stops advancing
- New events buffer silently
- Code viewer becomes editable (for the branch files, not live execution)

### 6B. Rewind

- Drag the timeline scrubber backward
- All panels update to show state at that point in time:
  - **Logs:** entries after the cursor point are greyed out
  - **Code Viewer:** shows the file/line that was active at that time
  - **Output Viewer:** shows the results available at that time
  - **Test Card:** shows the status at that time (running/success/error)

### 6C. Review Mode

After a run completes:
- The full timeline is available for scrubbing
- All events, logs, code traces are preserved
- Can rewind to any point and inspect everything
- "Export Run" button saves the full timeline + logs as JSON

---

## 7. GitHub Branch Integration

### 7A. Branch Selector

```
┌─ Branch ──────────────────────────────────────┐
│ Current: [main ▼]  [Pull] [New Branch]        │
│                                                │
│ Compare: [feature/new-scraper ▼] [Pull]       │
│          □ Enable side-by-side comparison      │
└────────────────────────────────────────────────┘
```

### 7B. Operations

| Operation | How | API |
|-----------|-----|-----|
| **List branches** | Dropdown populated from GitHub | `GET /api/admin/research/testing/branches` |
| **Switch branch** | Select from dropdown, pulls file content | `GET /api/admin/research/testing/files?branch=X&path=Y` |
| **Pull latest** | Fetch latest from remote | `POST /api/admin/research/testing/pull` |
| **View file** | Load any file from any branch | `GET /api/admin/research/testing/files?branch=X&path=Y` |
| **Edit & push** | Edit in code viewer, commit + push | `POST /api/admin/research/testing/push` |
| **Create branch** | Branch from current | `POST /api/admin/research/testing/branches` |

### 7C. Multi-Branch Parallel Runs

When "side-by-side comparison" is enabled:
- Two test cards appear side by side
- Left runs on Branch A, Right runs on Branch B
- Both have independent timelines, logs, code viewers
- Results are shown in a diff-style comparison view
- Requires the worker to support a `branch` parameter (or we deploy
  branch-specific worker instances)

### 7D. Implementation Notes

GitHub integration uses the GitHub MCP tools available in the project,
plus API routes that execute `git` commands on the server:

```typescript
// API routes for branch operations
POST /api/admin/research/testing/branches     // create branch
GET  /api/admin/research/testing/branches     // list branches
GET  /api/admin/research/testing/files        // read file from branch
POST /api/admin/research/testing/push         // commit + push changes
POST /api/admin/research/testing/pull         // pull latest
```

---

## 8. Complete Module Inventory

### 8A. Scrapers (Bell County)

| # | Module | Worker Function | Endpoint | Required Inputs | Browser | Est. Runtime |
|---|--------|----------------|----------|-----------------|---------|-------------|
| 1 | **CAD Scraper** | `scrapeBellCad` | `POST /research/discover` | address OR propertyId OR ownerName | Yes | 5-15s |
| 2 | **GIS Scraper** | `scrapeBellGis` | `POST /research/discover` | propertyId OR lat/lon OR address | No | 2-5s |
| 3 | **Clerk Scraper** | `scrapeBellClerk` | `POST /research/harvest` | instrumentNumbers OR ownerName | Yes | 15-45s |
| 4 | **Plat Scraper** | `scrapeBellPlats` | `POST /research/harvest` | subdivisionName OR instrumentNumbers | Yes | 5-30s |
| 5 | **FEMA Scraper** | `scrapeBellFema` | `POST /research/flood-zone` | lat, lon | No | 3-5s |
| 6 | **TxDOT Scraper** | `scrapeBellTxDot` | `POST /research/row` | lat, lon | No | 3-5s |
| 7 | **Tax Scraper** | `scrapeBellTax` | `POST /research/tax` | propertyId | No | 5-15s |
| 8 | **Map Screenshot** | `captureMapScreenshots` | (via harvest) | propertyId, lat, lon | Yes | 20-40s |
| 9 | **GIS Viewer** | `captureGisViewerScreenshots` | (via harvest) | lat, lon, boundary | Yes | 30-90s |
| 10 | **Screenshot Collector** | `captureScreenshots` | (via harvest) | URL list | Yes | 7s + 5-10s/ea |

### 8B. Analyzers

| # | Module | Worker Function | Required Inputs | API Key | Est. Runtime |
|---|--------|----------------|-----------------|---------|-------------|
| 1 | **Deed Analyzer** | `analyzeBellDeeds` | deedRecords array | Claude | 10-30s |
| 2 | **Plat Analyzer** | `analyzeBellPlats` | platRecords array | Claude | 5-20s |
| 3 | **Lot Correlator** | `correlateTargetLot` | lot/block/boundary | Claude | 5-10s |
| 4 | **Discrepancy Detector** | `detectDiscrepancies` | CAD/GIS/deed/plat data | No | <1s |
| 5 | **Confidence Scorer** | `scoreDataItem` | data items array | No | <1s |
| 6 | **Relevance Validator** | `validateDeedRelevance` | deeds + property info | Optional | 1-5s |
| 7 | **GIS Quality Analyzer** | `analyzeGisQuality` | screenshots array | Claude | 2-5s/ea |
| 8 | **Screenshot Classifier** | `classifyScreenshots` | screenshots array | Optional | 1-3s |

### 8C. Pipeline Phases

| Phase | Name | Worker Endpoint | Depends On |
|-------|------|-----------------|------------|
| 1 | Property Discovery | `POST /research/discover` | (entry point) |
| 2 | Document Harvesting | `POST /research/harvest` | Phase 1 |
| 3 | AI Extraction | `POST /research/analyze` | Phase 2 |
| 4 | Subdivision Intelligence | `POST /research/subdivision` | Phase 3 |
| 5 | Adjacent Properties | `POST /research/adjacent` | Phase 3 |
| 6 | TxDOT ROW | `POST /research/row` | Phase 1 |
| 7 | Boundary Reconciliation | `POST /research/reconcile` | Phases 3-6 |
| 8 | Confidence Scoring | `POST /research/confidence` | Phase 7 |
| 9 | Document Purchase | `POST /research/purchase` | Phase 3 |

### 8D. Supplementary Endpoints

| Module | Worker Endpoint | Purpose |
|--------|-----------------|---------|
| Flood Zone | `POST /research/flood-zone` | FEMA flood zone lookup |
| Chain of Title | `POST /research/chain-of-title` | Deep chain-of-title |
| Topographic | `POST /research/topo` | USGS elevation/topo |
| Tax Rates | `POST /research/tax` | TX Comptroller tax data |
| Cross-County | `POST /research/cross-county/detect` | Multi-county detection |
| Health Check | `GET /admin/health/sites` | All site health status |

---

## 9. API Routes

### 9A. Test Run Proxy

```
POST /api/admin/research/testing/run
```

Thin proxy to worker. Accepts any module name, maps to the right worker endpoint.

```typescript
interface TestRunRequest {
  module: string;           // "cad-scraper" | "phase-1" | etc.
  inputs: Record<string, unknown>;
  projectId?: string;
  speed?: number;           // playback speed multiplier
  branch?: string;          // git branch to run against
}
```

### 9B. SSE Stream for Real-Time Events

```
GET /api/admin/research/testing/stream?runId=xxx
```

Server-Sent Events stream that proxies the worker's WebSocket events
and adds code-trace metadata.

### 9C. Branch Operations

```
GET  /api/admin/research/testing/branches          // list all branches
POST /api/admin/research/testing/branches          // create new branch
GET  /api/admin/research/testing/files?branch=X&path=Y  // read file
POST /api/admin/research/testing/push              // commit + push
POST /api/admin/research/testing/pull              // pull latest
```

---

## 10. Existing Components to Reuse

| Component | Source Path | Reuse In |
|-----------|------------|----------|
| `PipelineStepper` | `research/components/PipelineStepper.tsx` | FullPipelineTab |
| `PipelineProgressPanel` | `research/components/PipelineProgressPanel.tsx` | FullPipelineTab |
| `ArtifactGallery` | `research/components/ArtifactGallery.tsx` | OutputViewer |
| `DataPointsPanel` | `research/components/DataPointsPanel.tsx` | Analyzer output |
| `DiscrepancyPanel` | `research/components/DiscrepancyPanel.tsx` | Discrepancy output |
| `BoundaryCallsPanel` | `research/components/BoundaryCallsPanel.tsx` | Reconciliation output |
| `InteractiveBoundaryViewer` | `research/components/InteractiveBoundaryViewer.tsx` | Reconciliation output |
| `SourceDocumentViewer` | `research/components/SourceDocumentViewer.tsx` | Clerk/plat output |

---

## 11. Existing Infrastructure to Leverage

| What | Where | How We Use It |
|------|-------|---------------|
| **WebSocket Server** | `worker/src/websocket/progress-server.ts` | Proxy events to SSE stream |
| **PipelineLogger** | `worker/src/lib/logger.ts` | Source of LayerAttempt events |
| **Live-Log Registry** | `_liveLogRegistry` in logger.ts | Real-time log access |
| **BullMQ Queues** | `worker/src/infra/job-queue.ts` | Job status tracking |
| **Site Health Monitor** | `worker/src/infra/site-health-monitor.ts` | Health check tab |

---

## 12. Implementation Order

### Phase 1: Infrastructure
1. `testing/layout.tsx` — admin guard
2. `TestingLab.css` — all styles
3. `POST /api/admin/research/testing/run/route.ts` — proxy route

### Phase 2: Core Debugger Components
4. `PropertyContextBar.tsx` — shared inputs + context provider
5. `ExecutionTimeline.tsx` — timeline bar + event markers + scrubber
6. `CodeViewer.tsx` — multi-tab code viewer with syntax highlighting
7. `LogStream.tsx` — real-time log viewer synced to timeline
8. `SpeedControl.tsx` — playback speed controls
9. `OutputViewer.tsx` — JSON tree + screenshots
10. `BranchSelector.tsx` — GitHub branch picker

### Phase 3: Module Cards
11. `TestCard.tsx` — reusable card integrating all debugger components
12. `ScrapersTab.tsx` — 10 scraper cards
13. `AnalyzersTab.tsx` — 8 analyzer cards
14. `PhasesTab.tsx` — 9 phase cards
15. `FullPipelineTab.tsx` — full pipeline with controls
16. `HealthCheckTab.tsx` — health checks
17. `LogViewerTab.tsx` — aggregated logs

### Phase 4: Main Page + Integration
18. `testing/page.tsx` — tab navigation + all tabs
19. Link from production research page to testing lab

---

## 13. What Does NOT Change

- `app/admin/research/page.tsx` — **one-line addition** (link to Testing Lab)
- `app/admin/research/[projectId]/page.tsx` — **no changes**
- All existing research components — **no changes** (only imported)
- All existing API routes — **no changes**
- Worker code — **no changes** (events already streamed via WebSocket)
- `AdminResearch.css` — **no changes**

---

## 14. Security

- Testing Lab is **admin-only** (enforced in layout.tsx + middleware.ts)
- API routes check `session.user.role === 'admin'`
- Worker auth via existing `WORKER_API_KEY` Bearer token
- Git operations are server-side only (no client-side git access)
- Branch push operations require additional confirmation
- No new secrets required
