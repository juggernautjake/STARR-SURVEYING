# STARR Surveying — Modular Testing Lab Plan (v3)

> **Date:** 2026-03-29  
> **Last Updated:** 2026-04-02  
> **Branch:** `claude/setup-starr-backend-testing-v19py`  
> **Status:** Phases 1-4 complete + worker instrumentation. Phase 5+ (Interactive Debugger IDE) planned below.

---

## Current Build Status

### Phase 1 — Infrastructure ✅ Complete

| File | Status | Notes |
|------|--------|-------|
| `testing/layout.tsx` | ✅ Done | Admin guard, unauthenticated redirect to `/admin/login`, `as any` removed |
| `TestingLab.css` | ✅ Done | ~1,560 lines, single canonical definition per class, CSS variables, dark debug panels / light page chrome |
| `POST /api/admin/research/testing/run/route.ts` | ✅ Done | Per-module timeouts, module group constants (HARVEST/ANALYZE/etc.), safe projectId resolve, `as any` removed |
| `GET /api/admin/research/testing/stream/route.ts` | ✅ Done | SSE stream, `runId` alias, `X-Accel-Buffering: no`, typed log entries, `as any` removed |
| `GET /api/admin/research/testing/branches/route.ts` | ✅ Done | Omits `Authorization` when no GITHUB_TOKEN, `as any` removed |
| `GET /api/admin/research/testing/files/route.ts` | ✅ Done | Directory detection via `Array.isArray`, `as any` removed |
| `POST /api/admin/research/testing/pull/route.ts` | ✅ Done | Returns sha + commit message, `as any` removed |
| `POST /api/admin/research/testing/push/route.ts` | ✅ Done | Commit/push via GitHub API, `as any` removed |
| `testing/page.tsx` | ✅ Done | 6-tab layout, branch feedback banner, PropertyContextProvider wrapper, SHA guard |

### Phase 2 — Core Debugger Components ✅ Complete

| File | Status | Notes |
|------|--------|-------|
| `PropertyContextBar.tsx` | ✅ Done | Shared inputs + context provider, 3 real Bell County fixtures, controlled fixture selector, load error feedback, loads `subdivisionName`, `branch` field added to context (drives BranchSelector + all API calls) |
| `ExecutionTimeline.tsx` | ✅ Done | Drag scrubber, keyboard nav scoped to component (tabIndex+onKeyDown — fixes multi-instance window listener stacking), SSR-safe tooltip |
| `CodeViewer.tsx` | ✅ Done | Multi-tab, lightweight syntax highlighting, edit mode with Ctrl+S, line-level highlighting |
| `LogStream.tsx` | ✅ Done | Timeline-synced, auto-scroll, level filter, future-event dimming |
| `BranchSelector.tsx` | ✅ Done | Branch list from GitHub API, compare mode, inline create |
| `OutputViewer.tsx` | ✅ Done | JSON tree (collapsible), Raw (JSON.stringify try/catch safe), Screenshot gallery tabs |

### Phase 3 — Module Cards ✅ Complete

| File | Status | Notes |
|------|--------|-------|
| `TestCard.tsx` | ✅ Done | Interval cleanup, async 202 notice, type-safe log entry processing, conditional code/log split view, stable async message keys, contextRecord extracted, `branch` forwarded to API |
| `ScrapersTab.tsx` | ✅ Done | 10 scrapers — correct `address` input for CAD/GIS, `projectId+ownerName` for clerk/plat |
| `AnalyzersTab.tsx` | ✅ Done | 8 analyzers — all require `projectId` |
| `PhasesTab.tsx` | ✅ Done | 9 phases — phase-1 requires `address` (was wrongly `propertyId`) |
| `FullPipelineTab.tsx` | ✅ Done | Phase skip/resume, step nav, dynamic PIPELINE_PHASES lookup, live timer (`playbackRef` added — fixes frozen timeline during run), Clear button, missingInputs now checks address||propertyId, branch forwarded to API |
| `HealthCheckTab.tsx` | ✅ Done | Worker health + external site grid, `0ms` latency display fixed (`!== undefined`), stable vendor keys |
| `LogViewerTab.tsx` | ✅ Done | Enter key to load, batch-ID for dedup, type-safe level validation, clean message builder (no `[] : ` artifacts) |

### Phase 4 — Integration ✅ Complete

| Item | Status | Notes |
|------|--------|-------|
| Link from `/admin/research` page to Testing Lab | ✅ Done | Button added to research page header |
| Production UI unchanged | ✅ Confirmed | No changes to research/[projectId]/page.tsx or any existing components |

---

## Known Gaps / Completed in Worker Instrumentation

| Gap | Status |
|-----|--------|
| `CodeViewer` is never populated with actual code traces | ✅ Resolved — `TimelineTracker` + `SOURCE_FILE_MAP` emit file/line events, SSE streams them, TestCard loads files from GitHub API |
| Timeline only has start/complete events | ✅ Resolved — every `PipelineLogger.addEntry()` produces a timeline event via `fromLayerAttempt()` |
| SSE stream doesn't emit phase-level events | ✅ Resolved — `stream/route.ts` forwards timeline entries with dedup |
| `FullPipelineTab` currentPhase only updates from log parsing | ✅ Resolved (log parsing works, real phase events also flow) |
| `LogViewerTab` has no feed from active TestCard runs | ✅ Resolved — `useTestingLogStore` shared pub/sub store |
| `paused` CardStatus requires worker pause support | ✅ Resolved — `POST /research/pause/:projectId` + `POST /research/resume/:projectId` endpoints |
| Multi-branch side-by-side comparison UI | Deferred to Phase 7 |
| No test coverage for Testing Lab components | Deferred to Phase 8 |

---

## Phase 5 — Interactive Code Debugger (Line-Level Tracing)

> **Goal:** See actual code lines fire in real time as the pipeline runs. Green highlight for success, red for failure. Lines stay highlighted after execution so you can see what worked and what failed. Slow the process down to any speed, pause at any point.

### 5A. Worker Function-Level Instrumentation

The worker's `PipelineLogger` already bridges to `TimelineTracker`, but we need **line-level granularity** — not just "this function ran" but "this specific line inside this function executed."

**Approach:** Instrument key pipeline functions with checkpoint calls that emit file + line number. We do NOT instrument every single line (that would require AST rewriting or source maps). Instead, we instrument at **decision points** — function entry, key branches, API calls, data extraction points, and error handlers.

```typescript
// Example: worker/src/services/discovery-engine.ts
export async function runDiscovery(input: DiscoveryInput, logger: PipelineLogger) {
  // __trace emits a timeline event with { file, function, line }
  __trace('discovery-engine.ts', 'runDiscovery', 45, 'entry');
  
  const address = normalizeAddress(input.address);
  __trace('discovery-engine.ts', 'runDiscovery', 48, 'address-normalized');
  
  const cadAdapter = selectAdapter(input.county);
  __trace('discovery-engine.ts', 'runDiscovery', 51, 'adapter-selected', { adapter: cadAdapter.name });
  
  try {
    const result = await cadAdapter.search(address);
    __trace('discovery-engine.ts', 'runDiscovery', 55, 'search-complete', { 
      status: 'success', dataPoints: result.length 
    });
    return result;
  } catch (err) {
    __trace('discovery-engine.ts', 'runDiscovery', 60, 'search-failed', { 
      status: 'error', error: err.message 
    });
    throw err;
  }
}
```

**Files to instrument (priority order):**
1. `discovery-engine.ts` — Phase 1 discovery (most visible first step)
2. `document-harvester.ts` — Phase 2 harvest
3. `ai-extraction.ts` / `ai-document-analyzer.ts` — Phase 3 AI
4. `master-orchestrator.ts` — Phase sequencing
5. All CAD/clerk adapters — Phase 1-2 external calls
6. `geometric-reconciliation-engine.ts` — Phase 7
7. `confidence-scoring-engine.ts` — Phase 8

**New helper: `worker/src/lib/trace.ts`**
```typescript
export function __trace(file: string, fn: string, line: number, label: string, data?: unknown) {
  // Emits a timeline event with precise file:line info
  // Only active when testMode=true (no overhead in production)
}
```

### 5B. CodeViewer Line-Level Highlighting

Upgrade the CodeViewer to support three highlight states per line:

| State | Color | Meaning |
|-------|-------|---------|
| **Active** | Yellow background | Currently executing (latest trace event) |
| **Success** | Green left border | This line executed successfully |
| **Failed** | Red left border + red text | This line threw an error |
| **Pending** | No highlight | Not yet reached |

```typescript
interface CodeFile {
  path: string;
  content: string;
  language: string;
  highlightedLines?: number[];           // existing: yellow highlight
  successLines?: number[];               // NEW: green border
  failedLines?: number[];                // NEW: red border
  activeExecutionLine?: number;          // NEW: currently executing
}
```

**Implementation:**
- `code-viewer__line--success` CSS class: `border-left: 3px solid #059669`
- `code-viewer__line--failed` CSS class: `border-left: 3px solid #DC2626; color: #FCA5A5`
- `code-viewer__line--executing` CSS class: `background: rgba(250, 204, 21, 0.2); animation: pulse 1s`
- Lines accumulate state — a line can be both "success" and later "failed" (shows failed)
- Auto-scroll to the currently executing line

### 5C. Execution Modes

Three modes the tester can choose before or during a run:

| Mode | Behavior | Button |
|------|----------|--------|
| **Run Until Failure** | Runs at full speed, pauses automatically when an error occurs | `▶ Run Until Fail` |
| **Continuous at Speed** | Runs at the selected speed (0.1x–10x), pauses when user clicks Pause | `▶ Run at Speed` |
| **Step-Through** | Pauses after every function/checkpoint. User clicks "Next" to advance. | `▶ Step` |

**Worker support needed:**
- `POST /research/step/:projectId` — Advance one checkpoint, then pause
- Worker holds execution at each `__trace()` call when in step mode
- Uses a Promise + resolve pattern: `await stepGate.wait()` blocks until the frontend sends the next step signal

### 5D. Step Forward / Step Back with Live Editing

**Step Forward:** Advance to the next `__trace` checkpoint. The CodeViewer shows the next file/line, highlights it, and waits.

**Step Back:** Rewind to the previous checkpoint. This does NOT re-execute code — it replays the **recorded state** from that checkpoint:
- CodeViewer shows the file/line from the previous checkpoint
- LogStream scrolls to the log entry at that time
- OutputViewer shows the data available at that point
- The timeline scrubber moves to that timestamp

**Live Edit → Re-execute:**
1. User pauses or steps to a function
2. User edits the code in CodeViewer (edit mode activates automatically when paused)
3. User clicks "Save & Re-run from here"
4. Frontend commits the edit to a temporary branch via GitHub API
5. Worker restarts the current phase from the edited checkpoint using the new branch
6. Results display side-by-side: original vs edited

---

## Phase 6 — Dependency Graph & Impact Analysis

> **Goal:** When you change code, see what else it affects. Hyperlinked function calls showing the dependency chain. Warnings when a change could break downstream code.

### 6A. Function Call Graph

Build a static dependency graph of the worker codebase:

```
POST /api/admin/research/testing/dependencies
  → Analyzes worker/src/ with TypeScript compiler API
  → Returns: { 
      functions: [{ file, name, line, calledBy: [...], calls: [...] }],
      imports: [{ from, to, symbols: [...] }]
    }
```

**Visualization in the Testing Lab:**
- When you hover over a function in CodeViewer, a popup shows:
  - "Called by: master-orchestrator.ts:runPipeline(), bell-research.ts:runBellCounty()"
  - "Calls: bis-adapter.ts:search(), address-normalizer.ts:normalize()"
- Clicking a caller/callee navigates the CodeViewer to that file/line
- During a live run, the active call chain is highlighted in blue

### 6B. Impact Analysis Warning System

When the user edits code in the CodeViewer:

1. **Immediate analysis** (< 1 second):
   - Parse the edit to identify changed functions/exports
   - Look up the dependency graph to find all callers
   - Show a yellow warning banner: "This function is called by 3 other files. Changes may affect: [list]"

2. **Deep analysis** (2-5 seconds, uses AI):
   - Send the diff + dependency context to Claude
   - Claude analyzes: "This change modifies the return type of `normalizeAddress()`. The following callers expect the old shape: [list]. Suggested fix: [code]"

### 6C. Right-Click Context Menu in CodeViewer

When you highlight code in the CodeViewer and right-click:

| Menu Item | Action |
|-----------|--------|
| **View Dependencies** | Opens the dependency graph popup showing what this code calls and what calls it |
| **AI Analysis** | Sends the highlighted code + its context to Claude for analysis. Returns: purpose, potential issues, suggestions |
| **Chat About This Code** | Opens an inline AI chat panel scoped to the highlighted code — brainstorm fixes, improvements, alternatives |
| **Copy** | Copy to clipboard |
| **Paste** | Paste from clipboard (edit mode only) |
| **Delete with Warning** | Shows impact analysis warning before deleting — "Deleting this will break: [callers]" |
| **What Is This For?** | AI explains the purpose of this code in the context of the current test run — e.g. "This function scrapes the Bell County CAD website using Playwright to find property tax records" |
| **Find All References** | Shows all files/lines that reference the highlighted symbol |

### 6D. Implementation Files

```
testing/components/
  DependencyGraph.tsx          ← Interactive graph visualization
  ImpactAnalysisBanner.tsx     ← Warning banner for edits
  CodeContextMenu.tsx          ← Right-click menu
  AIChatPanel.tsx              ← Inline AI chat about code
  AIAnalysisPanel.tsx          ← AI analysis results display

app/api/admin/research/testing/
  dependencies/route.ts        ← Static dependency analysis endpoint
  ai-analyze/route.ts          ← AI code analysis endpoint
  ai-chat/route.ts             ← AI chat endpoint (streaming)
```

---

## Phase 7 — Screenshot & Data Inspector with AI

> **Goal:** Right-click on screenshots and data artifacts to copy, delete, or run AI analysis (OCR, classification). View captured data alongside the code that produced it.

### 7A. Enhanced OutputViewer

Upgrade OutputViewer to support right-click context menus on:

**Screenshots:**
| Menu Item | Action |
|-----------|--------|
| **Copy Image** | Copy to clipboard |
| **Download** | Save as PNG |
| **Delete** | Remove from results (with confirmation) |
| **AI OCR Analysis** | Extract text from the screenshot using Claude Vision |
| **AI Classification** | Classify the screenshot (aerial, plat, deed, topo, etc.) |
| **Compare with Original** | Side-by-side comparison with the source page |
| **View Source Code** | Jump to the CodeViewer line that captured this screenshot |

**Data Points (JSON tree):**
| Menu Item | Action |
|-----------|--------|
| **Copy Value** | Copy the selected JSON value |
| **Copy Path** | Copy the JSON path (e.g. `result.boundary.calls[0].bearing`) |
| **AI Analysis** | Explain what this data means in surveying context |
| **Find Source** | Jump to the code line that produced this data point |
| **Validate** | Check if this value is within expected ranges |

### 7B. Data ↔ Code Linking

Every data point in the OutputViewer is linked back to the timeline event (and therefore the code line) that produced it. Clicking "View Source Code" on a data point navigates the CodeViewer to the exact line.

### 7C. AI Analysis Endpoints

```
POST /api/admin/research/testing/ai-analyze
  body: { type: 'ocr' | 'classify' | 'explain' | 'validate', content: string | base64 }
  → Uses Claude Vision for images, Claude text for code/data
  → Returns: { analysis: string, suggestions?: string[], confidence: number }
```

---

## Phase 8 — AI-Integrated Development Assistant

> **Goal:** Integrated AI assistance throughout the Testing Lab. Highlight code → get suggestions. Chat about issues. Get fix recommendations. Full Claude-powered development experience inside the debugger.

### 8A. Inline AI Chat Panel

A collapsible side panel that maintains conversation context about the current test run:

- **Scoped context:** The AI knows which module is being tested, what the inputs are, what the current results are, and what errors occurred
- **Code-aware:** When you highlight code and click "Chat About This Code", the chat receives the code + its dependencies
- **Suggestion mode:** AI can suggest code changes that the user can apply with one click (inserts into CodeViewer in edit mode)
- **History:** Chat history persists per test run and can be exported

### 8B. Automatic Failure Analysis

When a test fails:
1. The AI automatically analyzes the failure (error message, stack trace, code context)
2. Displays a "Suggested Fix" card below the error in the OutputViewer
3. User can click "Apply Fix" to insert the suggestion into the CodeViewer
4. User can click "Explain" for a deeper analysis

### 8C. Code Change Suggestions

When the user edits code in the CodeViewer:
1. AI watches the edits in real-time (debounced 2s)
2. If the edit introduces potential issues, shows an inline warning
3. If the edit is incomplete, offers autocomplete suggestions
4. If the edit changes a function signature, suggests updates to all callers

---

## Phase 9 — Multi-Branch Comparison & Side-by-Side Runs

> **Goal:** Run the same test on two branches simultaneously, see results side by side, identify regressions.

### 9A. Side-by-Side Test Runner

When "branch comparison" is enabled in BranchSelector:
- Two TestCards appear side by side (Branch A | Branch B)
- Both run the same module with the same inputs
- Timelines are synced — scrubbing one scrubs both
- Logs are color-coded by branch
- OutputViewer shows a diff of the results

### 9B. Regression Detection

Automatic comparison after both branches complete:
- Data point diff: which values changed?
- Performance diff: which branch was faster?
- Error diff: did one branch fail where the other succeeded?
- AI summary: "Branch B's change to normalizeAddress() caused 3 additional data points to be found but increased runtime by 2.5s"

---

## Implementation Order Summary

| Phase | Name | Status | Est. Effort |
|-------|------|--------|-------------|
| 1 | Infrastructure | ✅ Complete | — |
| 2 | Core Debugger Components | ✅ Complete | — |
| 3 | Module Cards | ✅ Complete | — |
| 4 | Integration | ✅ Complete | — |
| 4.5 | Worker Instrumentation | ✅ Complete | — |
| **5** | **Interactive Code Debugger** | 🔴 Not Started | 2-3 weeks |
| **6** | **Dependency Graph & Impact Analysis** | 🔴 Not Started | 2-3 weeks |
| **7** | **Screenshot & Data Inspector with AI** | 🔴 Not Started | 1-2 weeks |
| **8** | **AI-Integrated Development Assistant** | 🔴 Not Started | 2-3 weeks |
| **9** | **Multi-Branch Comparison** | 🔴 Not Started | 1-2 weeks |

### Phase 5 Build Order (detailed)

```
Phase 5A: Worker trace helper + instrument 2-3 key service files
Phase 5B: CodeViewer line-state highlighting (success/failed/executing)
Phase 5C: Execution mode selector (run-until-fail, continuous, step-through)
Phase 5D: Step forward/back controls with state replay
Phase 5E: Live edit → re-execute from checkpoint
```

### Phase 6 Build Order (detailed)

```
Phase 6A: Dependency analysis API endpoint (TypeScript compiler API)
Phase 6B: DependencyGraph.tsx visualization component
Phase 6C: Impact analysis warning banner
Phase 6D: CodeContextMenu.tsx right-click menu
Phase 6E: Wire all context menu actions
```

### Phase 7 Build Order (detailed)

```
Phase 7A: OutputViewer right-click context menu
Phase 7B: AI analysis API endpoint (Claude Vision + text)
Phase 7C: Data ↔ Code linking (trace IDs)
Phase 7D: Screenshot AI OCR/classification
```

### Phase 8 Build Order (detailed)

```
Phase 8A: AIChatPanel.tsx component
Phase 8B: AI chat API endpoint (streaming)
Phase 8C: Automatic failure analysis
Phase 8D: Code change suggestions (real-time)
Phase 8E: One-click fix application
```

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
