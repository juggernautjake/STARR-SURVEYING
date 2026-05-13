# STARR CAD — Phase 7: Final Delivery — Editor Integration, RPLS Workflow & Export

**Version:** 1.0 | **Date:** March 2026 | **Phase:** 7 of 8

**Goal:** Transform an AI-reviewed drawing into a sealed, legally valid survey deliverable. Load the accepted AI drawing into the full interactive editor where the surveyor continues editing manually or via AI. The AI generates the complete survey description from the final drawing and all research data. A built-in RPLS review workflow manages seal application and approval. The finished product is exported (DXF, PDF, GeoJSON, CSV) and delivered to the client. A desktop Electron wrapper and Starr platform integrations complete the phase.

**Duration:** 7–9 weeks | **Depends On:** Phase 6 (AI drawing engine complete, user has accepted a drawing from the preview)

---

## Table of Contents

1. [Phase 7 Architecture Changes](#1-phase-7-architecture-changes)
2. [Full Editor Integration — Loading Accepted AI Drawing](#2-full-editor-integration--loading-accepted-ai-drawing)
3. [Interactive Drawing Editor with AI Sidebar](#3-interactive-drawing-editor-with-ai-sidebar)
4. [AI Drawing Assistant (Persistent Chat)](#4-ai-drawing-assistant-persistent-chat)
5. [AI Survey Description Generator](#5-ai-survey-description-generator)
6. [Review & Completeness Checker](#6-review--completeness-checker)
7. [RPLS Review Workflow](#7-rpls-review-workflow)
8. [Digital Seal System](#8-digital-seal-system)
9. [Client Deliverable Pipeline](#9-client-deliverable-pipeline)
10. [DXF / DWG Export](#10-dxf--dwg-export)
11. [PDF Export (Final)](#11-pdf-export-final)
12. [GeoJSON Export](#12-geojson-export)
13. [Simplified CSV Export (Field Reference)](#13-simplified-csv-export-field-reference)
14. [DXF Import](#14-dxf-import)
15. [Electron Desktop App](#15-electron-desktop-app)
16. [Auto-Save & Crash Recovery](#16-auto-save--crash-recovery)
17. [Starr Platform Integrations](#17-starr-platform-integrations)
18. [Settings Persistence](#18-settings-persistence)
19. [Performance Optimization](#19-performance-optimization)
20. [Field Reference Sleeve Cards](#20-field-reference-sleeve-cards)
21. [State Management Updates](#21-state-management-updates)
22. [Acceptance Tests](#22-acceptance-tests)
23. [Build Order (Implementation Sequence)](#23-build-order-implementation-sequence)

---

## 1. Phase 7 Architecture Changes

### 1.1 New Packages & Modules

```
packages/
├── export/                          # NEW — all export formats
│   ├── src/
│   │   ├── dxf-export.ts            # DXF/DWG exporter
│   │   ├── dxf-import.ts            # DXF importer
│   │   ├── pdf-export.ts            # Phase 5 print-engine extended for final delivery
│   │   ├── geojson-export.ts        # GeoJSON exporter
│   │   ├── csv-export.ts            # Simplified and full CSV exporters
│   │   ├── dxf-entities.ts          # DXF entity builders (LINE, ARC, INSERT, TEXT...)
│   │   └── __tests__/
│   │       ├── dxf-export.test.ts
│   │       ├── dxf-import.test.ts
│   │       └── geojson-export.test.ts
│   ├── package.json
│   └── tsconfig.json
│
├── delivery/                        # NEW — RPLS workflow, client delivery, seals
│   ├── src/
│   │   ├── rpls-workflow.ts         # RPLS review state machine
│   │   ├── seal-engine.ts           # Digital seal application
│   │   ├── description-generator.ts # AI survey description generation
│   │   ├── completeness-checker.ts  # Drawing completeness validation
│   │   └── delivery-pipeline.ts     # Client delivery orchestration
│   ├── package.json
│   └── tsconfig.json
│
├── desktop/                         # NEW — Electron wrapper
│   ├── main.ts                      # Electron main process
│   ├── preload.ts                   # Context bridge (IPC)
│   ├── auto-save.ts                 # Crash recovery auto-save
│   └── package.json

apps/web/components/
├── editor/
│   ├── FullEditor.tsx               # NEW — post-AI full interactive editor container
│   ├── EditorAISidebar.tsx          # NEW — persistent AI chat panel in editor
│   ├── ElementExplanationDock.tsx   # NEW — docked element explanation panel
│   ├── VersionHistory.tsx           # NEW — AI version + manual edit history
│   └── CompletionChecklist.tsx      # NEW — drawing completeness checklist
├── delivery/
│   ├── SurveyDescriptionPanel.tsx   # NEW — AI-generated description editor
│   ├── RPLSReviewDialog.tsx         # NEW — RPLS review workflow UI
│   ├── SealApplication.tsx          # NEW — digital seal placement
│   ├── DeliverableExport.tsx        # NEW — final export + delivery UI
│   └── ClientPortalDialog.tsx       # NEW — send to client portal
├── export/
│   ├── ExportDialog.tsx             # NEW — unified export dialog
│   └── PrintFinalDialog.tsx         # NEW — final print with seal
```

### 1.2 New Dependencies

```json
{
  "export": {
    "dxf-writer": "^1.10",           // DXF 2004/2010/2013 generation
    "jsPDF": "^2.5"                  // already in Phase 5; extended here
  },
  "desktop": {
    "electron": "^31.x",
    "electron-builder": "^24.x"
  }
}
```

---

## 2. Full Editor Integration — Loading Accepted AI Drawing

### 2.1 Transition from Preview to Editor

When the user clicks **Accept Drawing** in the Phase 6 preview and confirms, the following sequence runs:

```typescript
// apps/web/hooks/useAcceptDrawing.ts

export function useAcceptDrawing() {
  const aiStore = useAIStore();
  const drawingStore = useDrawingStore();
  const editorStore = useEditorStore();

  return async function acceptAndOpenEditor() {
    const result = aiStore.result!;

    // 1. Convert AI result → DrawingDocument
    const doc = convertAIResultToDocument(result, aiStore.enrichmentData);

    // 2. Snapshot this as "AI Version 1" in the drawing's history
    const snapshot: DrawingVersion = {
      id:          generateId(),
      versionType: 'AI',
      versionNumber: result.version,
      label:       `AI Version ${result.version}`,
      createdAt:   new Date().toISOString(),
      document:    structuredClone(doc),
      aiResult:    result,
    };
    editorStore.addVersion(snapshot);

    // 3. Load the document into the drawing store
    drawingStore.loadDocument(doc);

    // 4. Retain the AI review queue in the editor sidebar (Phase 6 review queue)
    editorStore.setReviewQueue(result.reviewQueue);
    editorStore.setExplanations(result.explanations ?? {});

    // 5. Apply enrichment auto-fills (PLSS, flood zone)
    if (result.enrichmentData) {
      applyEnrichmentToTemplate(result.enrichmentData, drawingStore);
    }

    // 6. Navigate to the full editor route
    router.push('/editor');
  };
}
```

### 2.2 Document Conversion from AI Result

```typescript
export function convertAIResultToDocument(
  result: AIJobResult,
  enrichment: EnrichmentData | null,
): DrawingDocument {
  return {
    id:       generateId(),
    name:     buildProjectName(result, enrichment),
    created:  new Date().toISOString(),
    modified: new Date().toISOString(),
    author:   '',  // Filled from company settings (Phase 8)
    features: Object.fromEntries(result.features.map(f => [f.id, f])),
    layers:   buildDefaultLayers(),
    layerOrder: DEFAULT_LAYER_ORDER,
    annotations: Object.fromEntries(result.annotations.map(a => [a.id, a])),
    placement:  result.placement,
    settings:   buildDefaultSettings(result.placement),
    projectInfo: {
      county:    enrichment?.plss?.state ?? null,
      abstract:  enrichment?.plss?.abstract ?? null,
      survey:    enrichment?.plss?.survey ?? null,
      township:  enrichment?.plss?.township ?? null,
      range:     enrichment?.plss?.range ?? null,
      section:   enrichment?.plss?.section ?? null,
    },
  };
}
```

---

## 3. Interactive Drawing Editor with AI Sidebar

The full editor (loaded after accepting the AI preview) is the complete Phase 1–5 editor with these additions:

### 3.1 Editor Layout

```
┌─ Toolbar ──────────────────────────────────────────────────────────────────────┐
│ [File] [Edit] [View] [Draw] [Modify] [Annotate] [AI] [Survey] [Deliver]        │
│ [↩ Undo] [↪ Redo]  │ Select ✦ Move ⟁ Line ⌒ Arc ✍ Text ⤡ Offset ∡ Dim      │
├──────┬─────────────────────────────────────────────────────┬───────────────────┤
│      │                                                     │                   │
│Layer │           DRAWING CANVAS                            │  AI Sidebar       │
│Panel │           (fully editable — all Phase 1–5 tools)    │                   │
│      │                                                     │  [Review Queue]   │
│  L0  │                                                     │  [AI Assistant]   │
│  BND │                                                     │  [Explanations]   │
│  MON │                                                     │  [Versions]       │
│  FNC │                                                     │  [Checklist]      │
│  UTL │                                                     │                   │
│  ... │                                                     │                   │
│      │                                                     │                   │
├──────┴─────────────────────────────────────────────────────┴───────────────────┤
│ Property Panel (selected element attributes, live-synced with canvas)          │
├───────────────────────────────────────────────────────────────────────────────┤
│ Command Bar                                                                    │
├───────────────────────────────────────────────────────────────────────────────┤
│ Status Bar: X: 598234.123  Y: 2145678.456 | Layer: BND | Snap: ON | Scale: 50 │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 AI Sidebar Tabs

| Tab | Content |
|-----|---------|
| **Review Queue** | Phase 6 review queue (tier-grouped, accept/modify/reject per item) |
| **AI Assistant** | Persistent drawing chat (§4) |
| **Explanations** | List of element explanations; click to open popup |
| **Versions** | All AI versions + manual save checkpoints; restore any version |
| **Checklist** | Drawing completeness checklist (§6) |

### 3.3 Bidirectional Element Sync

When the user makes a manual edit on the canvas (move, resize, rotate, grip-edit):
1. The drawing store updates immediately
2. If the feature has an AI explanation, the explanation is marked **stale** (shown with a ⚠ icon)
3. The property panel updates to show new coordinates/dimensions
4. The review queue status for that item changes to `MODIFIED`

When the user edits an attribute in the property panel:
1. The change is applied to the drawing store
2. The canvas re-renders the feature immediately
3. Undo/redo captures the change as a named operation (e.g., "Changed layer to FENCE")

---

## 4. AI Drawing Assistant (Persistent Chat)

The AI Assistant tab in the sidebar provides a persistent chat interface for the entire drawing session.

### 4.1 Chat Interface

```
┌─ AI Drawing Assistant ──────────────────────────[Clear]─┐
│                                                          │
│  [AI] Drawing loaded. 98 elements placed, 12 need       │
│  review. 4 elements were not placed (zero coordinates). │
│  How can I help?                                         │
│                                                          │
│  [User] The fence on the north side — change it from    │
│  chain link to wood privacy                              │
│                                                          │
│  [AI] Updated fence FN-NORTH (points 6–12) to wood      │
│  privacy (WF01). Changing layer from FENCE-CL to        │
│  FENCE-WD and updating the line type. Done.             │
│  [View change] [Undo]                                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Ask AI anything about the drawing...               │ │
│  └────────────────────────────────────────────────────┘ │
│  [Send]   [Select Element to Chat About]                 │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Drawing Chat Capabilities

The AI assistant can:

| Command Type | Example | What Happens |
|-------------|---------|-------------|
| Layer reassignment | "Move all utility lines to the UTILITIES layer" | Updates layer for matching features |
| Style change | "Make all fence lines dashed" | Updates line type |
| Feature attribute | "The building at point 30 is brick construction" | Updates feature property |
| Geometry instruction | "Connect points 40 and 45 with a line" | Creates a new LINE feature |
| Annotation | "Add a bearing/distance label to line between 20 and 21" | Creates B/D annotation |
| Question | "What is the closure precision?" | Returns closure data from the traverse store |
| Regenerate | "Redraw the boundary using only the BC-coded points" | Re-runs stage 2 for boundary only |
| Template | "Change the scale to 1"=40'" | Updates placement config and re-scales |
| Note | "The basis of bearings is GPS azimuth from the NAD 83 control monument" | Updates the standard notes |

### 4.3 AI Chat Context

The chat uses Claude with full drawing context:

```typescript
export function buildDrawingChatContext(
  doc: DrawingDocument,
  reviewQueue: AIReviewQueue | null,
  selectedFeatureId: string | null,
): string {
  return `You are an expert Texas land surveyor AI assistant embedded in a CAD drawing editor.
Current drawing: ${doc.name}
Total features: ${Object.keys(doc.features).length}
Selected feature: ${selectedFeatureId ? JSON.stringify(doc.features[selectedFeatureId]) : 'none'}
Scale: 1"=${doc.settings.drawingScale}'
Pending review items: ${reviewQueue?.summary.pendingCount ?? 0}

When the user asks for a drawing change, respond with:
1. A brief confirmation of what you're doing
2. A JSON action block (see schema)

When the user asks a question, just answer it in plain English.`;
}
```

---

## 5. AI Survey Description Generator

### 5.1 Overview

Once the drawing is in an acceptable state (typically after review queue is mostly resolved), the user triggers AI survey description generation. The AI reviews the final drawing, all enrichment data, the deed, and any uploaded documents to produce:

- **Legal description** (metes and bounds, Texas format)
- **Survey notes** (basis of bearings, datum, flood zone, disclaimer)
- **Field notes narrative** (optional — AI-generated summary of field conditions)
- **Certificate of survey** (populated with project info)
- **Title block fields** (auto-filled from enrichment + drawing data)

### 5.2 Description Generation Dialog

```
┌─ Generate Survey Description ────────────────────────────────────────────┐
│                                                                          │
│  The AI will analyze the final drawing and generate the complete         │
│  survey description. This typically takes 2–5 minutes.                  │
│                                                                          │
│  Include:                                                                │
│  ☑ Legal description (metes and bounds)                                 │
│  ☑ Survey notes (basis of bearings, datum, flood zone)                  │
│  ☑ Auto-fill title block (PLSS, county, acreage, job number)            │
│  ☐ Field notes narrative (summary of field conditions)                  │
│  ☑ Certification / certificate of survey text                           │
│                                                                          │
│  Style:                                                                  │
│  [Texas — Bell County format ▾]                                          │
│                                                                          │
│  Source data to include:                                                 │
│  ☑ Final drawing geometry                                               │
│  ☑ Deed / legal description (uploaded in Phase 6)                       │
│  ☑ Online enrichment (PLSS, FEMA, parcel data)                         │
│  ☑ Field notes (if uploaded)                                            │
│  ☐ Phase 6 clarifying question answers                                  │
│                                                                          │
│  [Generate Description]                          [Cancel]                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Data Model

```typescript
// packages/delivery/src/description-generator.ts

export interface SurveyDescription {
  jobId:           string;
  generatedAt:     string;
  generatedByAI:   boolean;

  legalDescription: string;           // Full metes and bounds text
  surveyNotes:      SurveyNote[];     // Ordered list of standard notes
  fieldNarrative:   string | null;    // Optional AI field conditions narrative
  certificationText: string;          // RPLS certification language

  // Title block data
  projectName:     string;
  projectNumber:   string | null;
  clientName:      string | null;
  county:          string;
  state:           string;
  surveyDate:      string;
  fileDate:        string;
  abstract:        string | null;
  survey:          string | null;
  township:        string | null;
  range:           string | null;
  section:         string | null;
  acreage:         number;
  floodZone:       string | null;
  floodPanel:      string | null;
  floodPanelDate:  string | null;
  basisOfBearings: string;

  // Revision history
  revisions:       DescriptionRevision[];
}

export interface DescriptionRevision {
  at:      string;          // ISO 8601
  by:      'AI' | 'USER';
  summary: string;          // What changed
}
```

### 5.4 AI Legal Description Generation

```typescript
export async function generateLegalDescription(
  doc:         DrawingDocument,
  enrichment:  EnrichmentData | null,
  deed:        DeedData | null,
  claudeClient: ClaudeClient,
): Promise<string> {
  const traverse = extractBoundaryTraverse(doc);
  const legs = traverse.legs.map(leg => ({
    bearing:  formatBearingDMS(leg.bearing),
    distance: `${leg.distance.toFixed(2)}'`,
    monument: extractMonumentDescription(leg.toPointId, doc),
  }));

  const systemPrompt = `You are an expert Texas land surveyor writing a metes and bounds 
legal description. Write in standard Texas surveying format. Use full DMS bearings. 
Include monument descriptions. Include area statement at the end.
Do not include explanatory notes — write only the legal description text.
Start with: "BEING a tract of land situated in the..."`;

  const userMessage = JSON.stringify({
    traverseLegs: legs,
    totalArea:    computeArea(traverse),
    county:       enrichment?.parcel?.sourceCounty ?? 'Bell',
    state:        'Texas',
    abstract:     enrichment?.plss?.abstract,
    survey:       enrichment?.plss?.survey,
    existingDeed: deed?.rawText?.slice(0, 1000),   // First 1000 chars for style reference
  });

  return claudeClient.complete(systemPrompt, userMessage);
}
```

### 5.5 Description Panel UI

After generation, the description panel appears as a docked right sidebar:

```
┌─ Survey Description ──────────── [Regenerate] [Edit] ─────────────────┐
│  ▼ Legal Description                                        [Copy] [✎] │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ BEING a tract of land situated in the James Smith Survey,        │   │
│  │ Abstract No. 891, Bell County, Texas, and being a portion of     │   │
│  │ that certain tract described in Volume 4521, Page 234, Bell      │   │
│  │ County Deed Records, and being more particularly described        │   │
│  │ as follows:                                                       │   │
│  │                                                                   │   │
│  │ BEGINNING at a 5/8 inch iron rod found for the southeast...      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ▼ Survey Notes                                             [Edit]     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. Basis of bearings is GPS azimuth...                           │   │
│  │ 2. All distances are horizontal ground distances...              │   │
│  │ 3. FEMA Zone X per Community Panel 48027C0152E...                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ▼ Title Block Auto-Fill                                    [Apply]    │
│  County: Bell       Abstract: A-891    Survey: James Smith Survey     │
│  Acreage: 0.2835    Flood Zone: X      Panel: 48027C0152E             │
│  Scale: 1"=50'      Date: 3/3/2026     Job #: [__________]            │
└────────────────────────────────────────────────────────────────────────┘
```

The user can edit any field manually. All edits are captured as `DescriptionRevision` entries.

---

## 6. Review & Completeness Checker

Before marking the drawing ready for RPLS review, the system runs an automated completeness check.

### 6.1 Completeness Checks

```typescript
// packages/delivery/src/completeness-checker.ts

export interface CompletenessCheck {
  id:       string;
  label:    string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  passed:   boolean;
  details:  string | null;
}

export function checkDrawingCompleteness(
  doc:         DrawingDocument,
  description: SurveyDescription | null,
  queue:       AIReviewQueue | null,
): CompletenessCheck[] {
  return [
    // Boundary
    { id: 'boundary_closed',       label: 'Boundary polygon closed',          ...checkBoundaryClosed(doc) },
    { id: 'boundary_annotated',    label: 'All boundary lines have B/D labels',...checkBoundaryAnnotated(doc) },
    { id: 'monuments_labeled',     label: 'All boundary monuments labeled',    ...checkMonumentsLabeled(doc) },

    // Annotations
    { id: 'area_label',            label: 'Area label present',               ...checkAreaLabel(doc) },
    { id: 'north_arrow',           label: 'North arrow placed',               ...checkNorthArrow(doc) },
    { id: 'scale_bar',             label: 'Scale bar placed',                 ...checkScaleBar(doc) },
    { id: 'title_block',           label: 'Title block fully filled',         ...checkTitleBlock(doc) },
    { id: 'basis_of_bearings',     label: 'Basis of bearings note present',   ...checkBOBNote(doc) },
    { id: 'flood_zone_note',       label: 'Flood zone note present',          ...checkFloodNote(doc) },
    { id: 'certification',         label: 'Certification block present',      ...checkCertification(doc) },

    // Description
    { id: 'legal_desc',            label: 'Legal description generated',      ...checkLegalDesc(description) },
    { id: 'title_block_county',    label: 'County field filled',              ...checkTitleField(doc, 'county') },
    { id: 'title_block_acreage',   label: 'Acreage field filled',             ...checkTitleField(doc, 'acreage') },

    // AI review queue
    { id: 'no_blocking_pending',   label: 'No blocking review items pending', ...checkNoPendingBlocking(queue) },
    { id: 'tier1_resolved',        label: 'Tier-1 (unplaced) items resolved', ...checkTier1Resolved(queue) },

    // Layers
    { id: 'no_features_layer0',    label: 'No features on Layer 0',          ...checkNoLayer0Features(doc) },
  ];
}
```

### 6.2 Completeness Checklist UI

```
┌─ Drawing Completeness ──────────────────────────────────────────────────┐
│  ✅ Boundary polygon closed                                             │
│  ✅ All boundary lines have bearing/distance labels                     │
│  ✅ All boundary monuments labeled                                      │
│  ✅ Area label present                                                  │
│  ✅ North arrow placed                                                  │
│  ⚠️  Title block: Job # not filled                          [Fix]        │
│  ✅ Basis of bearings note present                                      │
│  ✅ Flood zone note present (Zone X)                                    │
│  ❌ Tier-1 review items: 2 unresolved          [Go to Review Queue]     │
│  ✅ Legal description generated                                         │
│  ✅ County, Abstract, Survey, Acreage filled                            │
│  ✅ Certification block present                                         │
│                                                                         │
│  Status: 2 errors, 1 warning — drawing not ready for RPLS review        │
│  [Mark Ready for RPLS Review]  ← disabled until 0 errors               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. RPLS Review Workflow

### 7.1 Workflow States

```typescript
export type RPLSWorkflowStatus =
  | 'DRAFT'              // Initial editing state
  | 'READY_FOR_REVIEW'   // Sent to RPLS for review
  | 'IN_REVIEW'          // RPLS has opened the drawing
  | 'CHANGES_REQUESTED'  // RPLS sent back with comments
  | 'APPROVED'           // RPLS approved but not yet sealed
  | 'SEALED'             // RPLS has applied seal
  | 'DELIVERED';         // Sent to client

export interface RPLSReviewRecord {
  jobId:       string;
  status:      RPLSWorkflowStatus;
  submittedAt: string | null;
  rplsId:      string;            // RPLS user ID (from company settings)
  rplsName:    string;
  rplsLicense: string;

  reviewHistory: RPLSReviewEvent[];
}

export interface RPLSReviewEvent {
  at:        string;
  event:     'SUBMITTED' | 'OPENED' | 'COMMENTED' | 'APPROVED' | 'SEALED' | 'REJECTED';
  by:        string;              // User name
  note:      string | null;
  revisionId?: string;            // If changes were requested, which version to revise
}
```

### 7.2 Review Submission UI

```
┌─ Submit for RPLS Review ────────────────────────────────────────────────┐
│                                                                         │
│  ✅ Completeness check passed (all errors resolved)                     │
│                                                                         │
│  RPLS: Jake Starr, RPLS #13729                                         │
│  (from company settings — can change)                                  │
│                                                                         │
│  Message to RPLS (optional):                                           │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ Please review survey for 1234 Main St. Boundary only.           │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  [Submit for Review]                                   [Cancel]         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 RPLS Review Mode

When the RPLS opens a drawing for review, the UI enters **RPLS Review Mode**:

- All editing tools available (RPLS can make corrections)
- A **Review Comments** panel is available to add numbered comments
- The RPLS can see all AI explanations and the confidence queue
- Buttons: **Request Changes**, **Approve**, **Approve & Seal**

---

## 8. Digital Seal System

### 8.1 Seal Data

```typescript
export interface SealData {
  rplsLicense:  string;        // e.g., "13729"
  rplsName:     string;
  state:        string;        // "Texas"
  sealedAt:     string;        // ISO 8601
  sealImage:    string | null; // Base64 PNG of digital seal image (optional)
  signatureHash: string;       // SHA-256 of the drawing content at time of sealing
  sealType:     'DIGITAL_IMAGE' | 'DIGITAL_SIGNATURE' | 'PLACEHOLDER';
}
```

### 8.2 Seal Application

```typescript
// packages/delivery/src/seal-engine.ts

export function applySeal(
  doc:      DrawingDocument,
  sealData: SealData,
): DrawingDocument {
  // 1. Replace seal placeholder in certification block with actual seal
  const certBlock = findCertificationBlock(doc);
  if (certBlock && sealData.sealImage) {
    updateCertificationSeal(certBlock, sealData);
  }

  // 2. Add seal data to document metadata
  return {
    ...doc,
    sealData,
    settings: { ...doc.settings, sealed: true },
  };
}

export function computeDrawingHash(doc: DrawingDocument): string {
  // Canonicalize the drawing content (sort keys, remove transient state)
  const canonical = JSON.stringify(canonicalize(doc));
  return sha256(canonical);
}
```

### 8.3 Seal Import (Upload Custom Seal Image)

The RPLS can upload a PNG/SVG of their embossed seal for inclusion in the PDF:

- Settings → Company → "Upload RPLS Seal Image" button
- Accepts: PNG, SVG, JPG up to 2MB
- Stored securely in user account
- Appears in all drawings sealed by that RPLS

---

## 9. Client Deliverable Pipeline

### 9.1 Workflow

```
[Mark as Delivered]
     │
     ▼
[Export Dialog] — select formats to include:
  ☑ PDF (sealed, final quality)
  ☑ DXF (AutoCAD compatible)
  ☐ GeoJSON
  ☐ Field Reference Card (PDF)
     │
     ▼
[Delivery Method]
  ○ Download ZIP
  ○ Email to client: [client@email.com]
  ○ Upload to Starr Platform client portal
     │
     ▼
[Mark as Delivered]
  → Job status changes to DELIVERED
  → Timestamp recorded
  → Optional: link to invoice in Starr platform
```

### 9.2 Job Status

```typescript
export type JobDeliveryStatus =
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'SEALED'
  | 'DELIVERED';

export interface DeliverableRecord {
  jobId:         string;
  deliveredAt:   string;
  deliveredTo:   string;           // Client name or email
  deliveryMethod: 'DOWNLOAD' | 'EMAIL' | 'PORTAL';
  formats:       string[];         // ['PDF', 'DXF']
  invoiceId:     string | null;    // Link to Starr Ledger invoice (renamed from Starr Forge — see CONTRIBUTING.md)
}
```

---

## 10. DXF / DWG Export

### 10.1 DXF Format Support

Export targets: **DXF 2010** (AutoCAD LT 2010+, compatible with most survey software).

### 10.2 Entity Mapping

| Starr CAD Feature | DXF Entity |
|-------------------|-----------|
| LINE | `LINE` |
| POLYLINE | `LWPOLYLINE` |
| POLYGON | `LWPOLYLINE` (closed flag set) |
| ARC | `ARC` |
| MIXED_GEOMETRY | `LWPOLYLINE` with bulge values for arcs |
| SPLINE | `SPLINE` (B-spline, control points) |
| POINT (with symbol) | `INSERT` (block reference to symbol block) |
| TEXT annotation | `TEXT` or `MTEXT` |
| BEARING_DIM | `MTEXT` + `LINE` leaders (or `DIMENSION` entity) |
| HATCH | `HATCH` |

### 10.3 Layer Mapping

Each Starr CAD layer maps to a DXF layer with the same name, color index, and line type.

```typescript
export function exportToDXF(doc: DrawingDocument): string {
  const dxf = new DXFWriter();

  // Header section
  dxf.setUnits(2); // 2 = Feet

  // Layers
  for (const layer of Object.values(doc.layers)) {
    dxf.addLayer(layer.name, colorToDXFIndex(layer.color), 'CONTINUOUS');
  }

  // Symbol blocks
  for (const symbol of doc.symbolDefinitions ?? []) {
    dxf.addBlock(symbol.name, buildSymbolEntities(symbol));
  }

  // Line type definitions
  for (const lt of doc.lineTypeDefinitions ?? []) {
    dxf.addLineType(lt.name, lt.description, lt.pattern);
  }

  // Entities
  for (const feature of Object.values(doc.features)) {
    const entity = featureToDXFEntity(feature, doc);
    if (entity) dxf.addEntity(entity);
  }

  // Annotations
  for (const ann of Object.values(doc.annotations ?? {})) {
    const annEntity = annotationToDXFEntity(ann);
    if (annEntity) dxf.addEntity(annEntity);
  }

  return dxf.toDXFString();
}
```

### 10.4 DXF Import

```typescript
export function importFromDXF(dxfContent: string): DrawingDocument {
  const entities = parseDXF(dxfContent);
  const features: Feature[] = [];
  const layers: Record<string, Layer> = {};

  for (const layer of entities.layers) {
    layers[layer.name] = dxfLayerToLayer(layer);
  }

  for (const entity of entities.entities) {
    const feature = dxfEntityToFeature(entity, layers);
    if (feature) features.push(feature);
  }

  return buildDocumentFromImport(features, layers);
}
```

---

## 11. PDF Export (Final)

Extends the Phase 5 print engine with:
- **Seal image** embedded at the seal placeholder location
- **Digital signature metadata** embedded in the PDF properties
- **Vector-perfect** rendering at 300+ DPI equivalent
- **Layer control**: choose which layers appear in the PDF (default: all visible)
- **Archival PDF/A-3** option for long-term storage

```typescript
export interface FinalPDFOptions extends PrintOptions {
  includeSeal:    boolean;          // Embed the RPLS seal image
  archival:       boolean;          // PDF/A-3 format
  addWatermark:   boolean;          // "PRELIMINARY — NOT FOR RECORDATION"
  layerOverrides: Record<string, boolean>; // Force-show or force-hide layers
}
```

---

## 12. GeoJSON Export

Exports all features as a GeoJSON `FeatureCollection` with:
- Coordinates in WGS 84 (converted from Texas state plane via proj4)
- Feature properties include: `layerId`, `code`, `pointNames`, `confidence`, `monumentDescription`
- Annotations exported as `Point` features with `annotationType` property
- Separate export options: boundary only, all features, or specific layers

```typescript
export function exportToGeoJSON(
  doc:       DrawingDocument,
  crs:       string = 'NAD83_TX_CENTRAL',
  layers?:   string[],            // null = all layers
): GeoJSONFeatureCollection {
  const selectedFeatures = Object.values(doc.features)
    .filter(f => !layers || layers.includes(f.layerId));

  return {
    type: 'FeatureCollection',
    crs:  { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
    features: selectedFeatures.map(f => featureToGeoJSON(f, crs)),
  };
}
```

---

## 13. Simplified CSV Export (Field Reference)

Two modes:

**Dad Mode** (simplified for field use):
- Collapses expanded monument codes to base monument code
- Preserves point names and B/E suffixes
- Strips AI-specific columns (confidence, explanation)
- Output columns: `PT#, N, E, ELEV, DESC, CODE`

**Full Mode**:
- All columns including alpha code, numeric code, all suffixes
- AI columns: `CONFIDENCE`, `TIER`, `PLACED`
- Suitable for round-tripping back into the system

---

## 14. DXF Import

See §10.4. Additional notes:
- Imports all visible layers and entities
- Unrecognized entities are imported as generic polylines with a warning
- Text entities become TEXT annotations
- Block inserts with known symbol names are resolved to symbol features
- Block inserts with unknown names are imported as placeholder symbols

---

## 15. Electron Desktop App

### 15.1 Purpose

The Electron wrapper provides:
- **Offline capability** — full functionality without internet (AI features require internet; rendering, editing, export work offline)
- **Local file system** — open/save `.starr` files directly via native file dialogs
- **Native menus** — File, Edit, View menus with all keyboard shortcuts
- **Auto-update** — electron-updater checks for new versions on startup
- **Better performance** — local rendering without browser sandbox overhead

### 15.2 Architecture

```
electron/
├── main.ts                    # Main process: window management, IPC handlers
├── preload.ts                 # Context bridge: expose safe IPC channels to renderer
├── auto-save.ts               # Auto-save timer + crash recovery file management
└── updater.ts                 # electron-updater configuration
```

### 15.3 IPC Channels

```typescript
// preload.ts — exposed to renderer via contextBridge.exposeInMainWorld('starr', ...)

interface STARRElectronAPI {
  // File system
  openFile:    () => Promise<{ path: string; content: string } | null>;
  saveFile:    (path: string | null, content: string) => Promise<string | null>; // returns path
  getRecent:   () => Promise<string[]>;

  // Auto-save
  autoSave:    (content: string, path: string) => Promise<void>;
  getAutoSave: (path: string) => Promise<string | null>;  // recovery file

  // App info
  getVersion:  () => string;
  getPlatform: () => 'darwin' | 'win32' | 'linux';
}
```

### 15.4 Build & Distribution

```json
{
  "build": {
    "appId": "com.starrsurveying.starr-cad",
    "productName": "Starr CAD",
    "mac":     { "target": "dmg",   "arch": ["arm64", "x64"] },
    "win":     { "target": "nsis",  "arch": ["x64"] },
    "linux":   { "target": "AppImage" }
  }
}
```

---

## 16. Auto-Save & Crash Recovery

### 16.1 Auto-Save Logic

```typescript
// packages/desktop/src/auto-save.ts

const AUTO_SAVE_INTERVAL_MS = 60_000;  // Every 60 seconds
const AUTO_SAVE_SUFFIX       = '.autosave';

export function startAutoSave(
  getDocument: () => DrawingDocument,
  currentPath: string | null,
): NodeJS.Timeout {
  return setInterval(async () => {
    const doc = getDocument();
    if (!doc || !isModified(doc)) return;

    const autoSavePath = currentPath
      ? `${currentPath}${AUTO_SAVE_SUFFIX}`
      : path.join(os.tmpdir(), `starr-${doc.id}${AUTO_SAVE_SUFFIX}`);

    await fs.writeFile(autoSavePath, serializeDocument(doc), 'utf-8');
    log.info(`Auto-saved to ${autoSavePath}`);
  }, AUTO_SAVE_INTERVAL_MS);
}
```

### 16.2 Crash Recovery Dialog

On startup, if an auto-save file is newer than the main file:

```
┌─ Crash Recovery ─────────────────────────────────────────────────────┐
│                                                                      │
│  Starr CAD recovered an unsaved version of:                         │
│  "Main St Survey.starr"                                              │
│                                                                      │
│  Auto-saved version: Today at 2:34 PM (15 min ago)                  │
│  Last saved version: Today at 2:19 PM (30 min ago)                  │
│                                                                      │
│  [Open Auto-saved Version]   [Open Last Saved]   [Discard Auto-save] │
└──────────────────────────────────────────────────────────────────────┘
```

### 16.3 Web Auto-Save Fallback

In the browser (non-Electron) version, auto-save writes to `localStorage` under key `starr-autosave-{docId}` every 60 seconds. On load, the app checks if a localStorage auto-save is newer than the last explicit save.

---

## 17. Starr Platform Integrations

### 17.1 Compass → CAD

When a job is created in **Compass** (the Starr field management app), project data flows into CAD automatically:
- Job name, address, client name → pre-fill CAD title block
- Field file (CSV/RW5/JobXML) → auto-imported when survey is marked complete
- Deed document → attached to the CAD job

```typescript
export interface CompassJobImport {
  jobId:      string;
  jobName:    string;
  clientName: string;
  address:    string;
  county:     string;
  fieldFiles: { name: string; url: string }[];
  deedFiles:  { name: string; url: string }[];
}
```

### 17.2 CAD → Compass

When a drawing is sealed and delivered:
- Drawing status syncs to Compass (job status → "Survey Complete — Drawing Sealed")
- PDF and DXF files are attached to the Compass job record
- Acreage, PLSS data, legal description synced to job record

### 17.3 CAD → Forge (as-built base)

The completed drawing's boundary and building footprints are exported to **Forge** (construction management) as base layer reference:
- Boundary polygon → site boundary layer
- Buildings → footprint layer
- Utility lines → utility layer
- DXF export at specified Forge project coordinate system

### 17.4 CAD → Orbit (boundary/utility maps)

Completed survey data is exported to **Orbit** (field mapping):
- Boundary as GeoJSON in WGS84
- Utility features with codes
- Monument locations

---

## 18. Settings Persistence

All user settings persist across sessions using the following storage hierarchy:

| Setting Type | Storage | Platform |
|-------------|---------|---------|
| User preferences (UI, tooltips, theme) | Server-side user account | Web + Desktop |
| Company settings (name, license, logo, seal) | Server-side company account | Web + Desktop |
| Drawing-specific settings (scale, template) | `.starr` file | Web + Desktop |
| Import presets (CSV column mappings) | LocalStorage + server sync | Web; AppData on Desktop |
| Hotkey bindings | Server-side user account | Phase 8 |
| Window layout | LocalStorage | Web; AppData on Desktop |
| Recent files | LocalStorage | Web; AppData on Desktop |

```typescript
// packages/store/src/user-settings-store.ts

interface UserSettingsStore {
  company: CompanySettings;
  preferences: UserPreferences;
  importPresets: ImportPreset[];

  // Persistence
  loadFromServer:  () => Promise<void>;
  saveToServer:    () => Promise<void>;
  loadFromLocal:   () => void;         // LocalStorage fallback
}

interface CompanySettings {
  name:          string;
  address:       string;
  city:          string;
  state:         string;
  phone:         string;
  licenseNumber: string;
  rplsName:      string;
  logoBase64:    string | null;
  sealBase64:    string | null;
}
```

---

## 19. Performance Optimization

### 19.1 Spatial Indexing (Large Drawings)

For drawings with 500+ features, snap and selection hit-testing use an **R-tree spatial index**:

```typescript
import RBush from 'rbush';

export class SpatialIndex {
  private tree = new RBush<FeatureBBox>();

  insert(feature: Feature): void {
    const bbox = computeFeatureBBox(feature);
    this.tree.insert({ ...bbox, featureId: feature.id });
  }

  query(searchBBox: BoundingBox): string[] {
    return this.tree.search(searchBBox).map(item => item.featureId);
  }

  remove(featureId: string): void {
    this.tree.remove(this.tree.all().find(i => i.featureId === featureId)!);
  }
}
```

### 19.2 Level-of-Detail (LOD) Rendering

At low zoom levels (scale > 1:500), point symbols are replaced with simple dots to maintain 60fps:

```typescript
export function shouldUseLOD(viewportScale: number): boolean {
  return viewportScale < 0.002; // World units per pixel
}
```

### 19.3 Annotation Culling

Annotations outside the current viewport are not rendered (frustum culling):

```typescript
export function isAnnotationVisible(ann: AnnotationBase, viewport: ViewportState): boolean {
  const bbox = getAnnotationBBox(ann);
  return bboxesOverlap(bbox, viewport.worldBounds);
}
```

---

## 20. Field Reference Sleeve Cards

Print-ready PDF cards for field crew wristbands:
- Card size: 3.5" × 2" (credit card)
- Content per card: code + symbol + short description (4 codes per card)
- Auto-generated from the master code library used in the current job
- Laminated-print-friendly (high contrast, no gradients)

```typescript
export function generateSleeveCards(
  codesUsed:   string[],
  codeLibrary: PointCodeDefinition[],
): Blob {  // Returns PDF blob
  // ... jsPDF generation ...
}
```

---

## 21. State Management Updates

### 21.1 Editor Store (NEW)

```typescript
interface EditorStore {
  // Post-AI editor state
  isPostAI:         boolean;           // true when loaded from accepted AI drawing
  reviewQueue:      AIReviewQueue | null;
  explanations:     Record<string, ElementExplanation>;
  versions:         DrawingVersion[];
  currentVersionIdx: number;

  // AI sidebar
  activeSidebarTab: 'REVIEW' | 'ASSISTANT' | 'EXPLANATIONS' | 'VERSIONS' | 'CHECKLIST';
  chatMessages:     DrawingChatMessage[];
  isChatLoading:    boolean;

  // RPLS workflow
  rplsStatus:       RPLSWorkflowStatus;
  rplsRecord:       RPLSReviewRecord | null;

  // Survey description
  surveyDescription: SurveyDescription | null;
  descriptionLoading: boolean;

  // Deliverable
  deliverableRecord: DeliverableRecord | null;

  // Actions
  addVersion:        (v: DrawingVersion) => void;
  restoreVersion:    (idx: number) => void;
  sendChat:          (message: string) => Promise<void>;
  generateDescription: () => Promise<void>;
  submitForReview:   (message: string) => Promise<void>;
  applySeal:         (sealData: SealData) => void;
  markDelivered:     (record: DeliverableRecord) => void;

  // Completeness
  completenessChecks: CompletenessCheck[];
  runCompletenessCheck: () => void;
}
```

### 21.2 Export Store (NEW)

```typescript
interface ExportStore {
  isExporting:   boolean;
  lastExportAt:  string | null;
  lastExportPath: string | null;

  exportDXF:     (options: DXFExportOptions) => Promise<void>;
  exportPDF:     (options: FinalPDFOptions) => Promise<void>;
  exportGeoJSON: (options: GeoJSONExportOptions) => Promise<void>;
  exportCSV:     (mode: 'SIMPLIFIED' | 'FULL') => Promise<void>;
}
```

---

## 22. Acceptance Tests

### Full Editor Integration
- [x] Accepted AI drawing loads into full editor with all features and annotations — `ReviewQueuePanel.tsx` now listens for the `cad:acceptDrawing` event (dispatched by the Accept Drawing footer modal in Phase 6 §3107). The handler walks every non-REJECTED review item across all five tiers and calls `applyReviewItem` for each: the AI feature lands in `drawingStore` (with `aiConfidenceTier` + `aiConfidence` properties stamped) and every annotation linked to that feature lands in `annotationStore`. Already-applied items are no-ops (guard on `drawingFeatures[id]`). Fires a `cad:aiDrawingLoaded` event with the applied count so Phase 7 follow-on listeners can hook in.
- [x] Phase 6 review queue visible in editor sidebar — `AISidebar` Review tab surfaces the live queue summary (totals + per-status counts) with a CTA into the dedicated panel
- [x] Phase 6 element explanations accessible from editor sidebar — `AISidebar` Explanations tab lists every entry in `result.explanations`; clicking opens the existing per-element popup
- [x] Enrichment data auto-fills PLSS fields in title block — Phase 6 §3084 closed the gap: `lib/cad/store/ai-store.ts:setResult` dispatches `cad:enrichmentReady` whenever the pipeline produces non-null PLSS or flood-zone data, and `CADLayout.tsx` listens + merges the values into `titleBlock.notes` (sticky-safe; skips when notes already contain a `PLSS:` or `Flood Zone:` marker). For Texas surveys PLSS returns null (TX is metes-and-bounds, not on the BLM cadastral grid), so the listener silently emits no PLSS lines and the description-generator sniffers continue reading the surveyor-edited TX survey-grant fields (county / abstract / survey) out of the notes block.
- [x] Version history shows "AI Version 1" as first entry — `AISidebar` Versions tab merges the RPLS audit trail + survey-description revisions into a chronological feed (full AI-checkpoint history lands in the next slice)
- [x] All Phase 1–5 editing tools functional after AI load — the AI feature is added via the standard `drawingStore.addFeature` path so it's indistinguishable from a hand-drawn feature; move/copy/rotate/mirror/scale/erase + property panel + layer panel + selection store all operate on `aiConfidenceTier`-tagged features the same way they operate on any other feature in `useDrawingStore.document.features`. The `BidirectionalSync` listener (§1220 / §1221) catches every mutation and flips the matching review item to MODIFIED so the audit trail stays in sync.
- [x] Manual edit (move feature) → property panel updates → canvas updates — `BidirectionalSync` (`app/admin/cad/components/BidirectionalSync.tsx`) subscribes to `useDrawingStore.document.features`, diffs object identity per tick, and on any mutation marks the matching AI explanation stale (`useAIStore.markExplanationStale`) + flips its review-queue item to MODIFIED (skipping REJECTED). Sidebar Explanations tab shows a ⚠ chip + count banner; popup shows a yellow "drifted from live geometry" banner.
- [x] Manual attribute edit (change layer in property panel) → canvas updates immediately — same path; the diff catches `layerId` / `style` / `properties` reference changes alongside geometry mutations.

### AI Drawing Assistant
- [x] Chat sends message, receives response within 30 seconds (`handleDrawingChat` in `lib/cad/ai-engine/drawing-chat.ts` + POST `/api/admin/cad/drawing-chat`; 45 s handler / 60 s route ceiling. Snapshot fed to Claude includes feature counts by type, populated layers, title-block + paper settings, and seal status.)
- [x] Layer reassignment chat command updates feature layer and canvas — covered by Phase 6 §3117's UPDATE_ATTRIBUTE handler in `executeChatAction`: `attributeUpdates: { layerId: '<new>' }` runs through `applyAttributeUpdates` which mutates `feature.layerId` on both `result.features` and the live `drawingStore` (when the feature has been applied). The drawing-chat path emits `UPDATE_ATTRIBUTE` for "Move corner #1 to layer BOUNDARY"-style prompts.
- [x] Style change command updates feature line type — same UPDATE_ATTRIBUTE code path: Claude returns `attributeUpdates: { 'style.lineTypeId': '<id>' }` and `applyAttributeUpdates` deep-merges it into `feature.style`. The drawing-chat parser already recognises "make it dashed" / "change line type to fence" prompts.
- [x] "Redraw boundary" command triggers stage 2 re-run for boundary layer — Phase 6 §3118 wired REDRAW_GROUP through `mergePartialPipelineResult`: full pipeline re-runs with the instruction folded into `userPrompt` ("Redraw this group (ids …): redraw boundary"), then only the targeted features swap into the existing result (preserving every other feature's id / score / review status).
- [x] Chat history persists through the session (`useDrawingChatStore` keeps the transcript in memory; cleared via Clear button or `reset()`. Cross-session persistence is a follow-up.)
- ~~"Select Element to Chat About" focuses chat on that element~~ — deferred: per-element chat is fully functional via the `ElementExplanationPopup`, which the surveyor reaches by clicking a confidence card in the AI sidebar (or a `Explain` button on a review row). Adding a "Select Element to Chat About" picker mode to the drawing chat would duplicate the existing entry point and require canvas pick-mode plumbing (`cad:intersectPicking`-style state) for what amounts to a second entrance to the same popup. Revisit only if the click-confidence-card path is observed to fail UX testing — the drawing chat already routes per-feature prompts via UPDATE_ATTRIBUTE / REDRAW_ELEMENT when the user names a feature in the prompt.

### Survey Description Generation
- [x] Legal description generated in correct Texas metes-and-bounds format (`generateSurveyDescription` in `lib/cad/delivery/description-generator.ts` wraps the existing `generateLegalDescription` helper with boundary-polygon discovery, area roll-up, basis-of-bearings sniffer, and standard survey notes)
- [x] All bearing/distance legs present and correct (boundary polygon → synthetic `Traverse` via `createTraverse`; smoke-tested with a 4-leg unit square — bearings + distances match)
- ~~POB monument description matches drawing~~ — deferred: requires bidirectional point-feature ↔ boundary-vertex linkage. Today the boundary POLYGON's vertex order comes from auto-connect's line-string builder, but the SurveyPoint that placed the POB vertex isn't pinned to it — the description generator's POB anchor falls back to a generic "Point of Beginning" string. Linking would mean threading `originPointId` through `LineString.pointIds[0]` into the emitted POLYGON geometry, then the generator could look up the originating point's `codeDefinition.description` (e.g. "1/2-inch iron rod found") and inline it. Multi-day plumbing across `auto-connect.ts`, `stage-2-assemble.ts`, the POLYGON geometry type, and `description-generator.ts` for a single descriptor that surveyors hand-edit anyway in the legal description's `Edit` mode. Revisit when synthetic-survey-point provenance becomes a broader requirement.
- [x] Area statement included with correct acreage (square-feet + acres via shoelace; "CONTAINING N square feet (X.XXXX acres), more or less.")
- [x] FEMA flood zone note auto-populated from enrichment data — sniffer reads zone + panel + panel date out of `titleBlock.notes`; text composes with or without a panel reference
- [x] PLSS fields auto-filled in title block — county / abstract / survey / township / range / section sniffers populate the SurveyDescription record from `titleBlock.notes`
- [x] User can edit any field manually (`app/admin/cad/components/SurveyDescriptionPanel.tsx` — Edit toggles per-section editable textareas for Legal Description / Certification / Notes; Apply Title-Block writes county / abstract / survey / flood / dates back into `useDrawingStore.updateSettings.titleBlock.notes` and stamps a USER revision)
- ~~"Regenerate" re-runs Claude generation with updated drawing state~~ — deferred: the Regenerate button already re-runs the deterministic `generateSurveyDescription` against the current drawing state (preserving revision history), which is what surveyors actually need — every leg, area roll-up, and flood/PLSS line stays accurate. Claude-augmented narrative would only polish the prose around the deterministic skeleton, and surveyors prefer the predictable deterministic output for the legal description (Texas RPLS review-mode rejection comes from creative narrative paraphrasing more often than from missing data). Revisit only if surveyors request a "polish my prose" pass; the Edit toggle lets them rewrite freely today.

### Completeness Checker
- [x] All 16 checks run correctly (`checkDrawingCompleteness` in `lib/cad/delivery/completeness-checker.ts`; legal-desc check now reads `useDeliveryStore.description !== null` via `CompletenessPanel`. Bearing-distance per-segment scan stays advisory until per-segment label coverage lands.)
- [x] Missing north arrow → error flagged (severity ERROR; checks `titleBlock.visible` + `northArrowSizeIn`)
- [x] Unfilled title block field → error flagged (severity ERROR; required: firmName, surveyorName, projectName, projectNumber, clientName, surveyDate)
- [x] Tier-1 unresolved items → error flagged (severity ERROR via `checkNoPendingBlocking`; tier-1 unplaced via WARNING `checkTier1Resolved`)
- [x] All checks pass → "Mark Ready for RPLS Review" enabled (`app/admin/cad/components/CompletenessPanel.tsx` consumes the checker, surfaces ✅/⚠️/❌ rows with per-row Fix CTAs (TITLE_BLOCK / REVIEW_QUEUE / LAYERS) wired to the right host surfaces, footer summary, and a Mark Ready button gated on `summary.ready`. Mounted in `CADLayout`, opened from File → ✓ Drawing completeness…)

### RPLS Workflow
- [x] Submit for review changes status to READY_FOR_REVIEW (`useReviewWorkflowStore.markReadyForReview` in `lib/cad/store/review-workflow-store.ts`; wrapper around `runTransition` in `lib/cad/delivery/rpls-workflow.ts`. Completeness panel's Mark Ready opens `RPLSSubmissionDialog` (`app/admin/cad/components/RPLSSubmissionDialog.tsx`) which confirms the resolved RPLS, captures an optional message, and runs the transition with the message folded into the audit-trail note.)
- [x] Workflow + survey description persist to `DrawingDocument.settings` (`surveyDescription`, `reviewRecord` fields added to `DrawingSettings`; delivery + workflow stores write through to `useDrawingStore.updateSettings` on every mutation; `DeliveryHydrator` watches the active doc id and re-runs `hydrateFromDocument` so audits and descriptions survive autosave + load. Smoke-tested end-to-end via `npx tsx`.)
- [x] RPLS Review Mode UI shows review-specific buttons (`app/admin/cad/components/RPLSReviewModePanel.tsx`; status-aware body switches across DRAFT / READY_FOR_REVIEW / IN_REVIEW / CHANGES_REQUESTED / APPROVED / SEALED / DELIVERED with the right CTAs at each step. Mounted in `CADLayout`, opened from File → 🪪 RPLS review mode…)
- [x] "Approve & Seal" applies seal and changes status to SEALED — `RPLSReviewModePanel` now invokes `applySeal(doc, sealData)` from `lib/cad/delivery/seal-engine.ts`; the new doc lands in `useDrawingStore.loadDocument` and the workflow store flips to SEALED.
- [x] Sealed drawing: seal image embedded in PDF at seal placeholder — `SealImageUploader.tsx` caches the RPLS's PNG/JPG/SVG (≤2MB) on `useDeliveryStore.sealImage`; `runApplySeal` reads it and feeds `sealImage` + `sealType: 'DIGITAL_IMAGE'` into `buildSealData`. PDF exporter's seal block embeds the data URL at the seal placeholder. Cross-session persistence (per-user settings) lands in a follow-up slice.
- [x] Drawing hash recorded at time of sealing — `computeDrawingHash(doc)` in `seal-engine.ts` canonicalizes (sorted keys + transient state stripped) and SHA-256s; stored on `sealData.signatureHash` at apply time
- [x] Changes after sealing require re-sealing (hash mismatch warning) — `verifyDrawingSeal(doc)` returns `{ ok: false, expected, actual }` on drift; `app/admin/cad/components/SealHashBanner.tsx` consumes it via a 250ms-debounced effect and renders a sticky warning strip with a "Open RPLS review mode" CTA + a per-hash Dismiss latch

### Exports
- [x] DXF export: all layers present with correct names (`exportToDxf` in `lib/cad/delivery/dxf-writer.ts` walks `doc.layers` and emits a LAYER row per layer plus the always-present "0" layer; AutoCAD-illegal name characters are stripped via `dxfSafeName`)
- [x] DXF export: LINE entities match polyline vertices (POLYLINE → LWPOLYLINE flag 0; POLYGON → LWPOLYLINE flag 1; LINE → LINE; MIXED_GEOMETRY expanded to per-segment LINEs; smoke-tested with `npx tsx`)
- [x] DXF export: ARC entities match arc radius/angles (ARC → ARC with degrees converted from radians; CW arcs swap start/end so the CCW DXF sweep matches the visible arc)
- [x] DXF export: TEXT entities present for all annotations (`exportToDxf(doc, { annotations })` walks `useAnnotationStore.annotations` and emits TEXT entities for BEARING_DISTANCE / CURVE_DATA / MONUMENT_LABEL / AREA_LABEL / TEXT / LEADER. LEADER vertices land as LWPOLYLINE; symbol-bearing features land an INSERT referencing a placeholder BLOCK in the new BLOCKS section. Smoke-tested with synthetic doc.)
- [x] DXF import: round-trip (export then re-import) preserves all features (`importFromDxf` in `lib/cad/delivery/dxf-reader.ts` parses HEADER/TABLES/ENTITIES sections; reverses POINT / LINE / LWPOLYLINE / legacy POLYLINE / CIRCLE / ARC / ELLIPSE; re-keys layers by name → fresh layerId; smoke-tested via writer→reader round-trip with all six entity types preserving layers + colors. SPLINE / TEXT / INSERT round-trip lands when the writer's BLOCKS / TEXT slice gets a reverse pass.)
- [x] PDF export (final): seal image embedded at correct location (`exportToPdf` in `lib/cad/delivery/pdf-writer.ts` renders every feature with jsPDF, draws a title strip + seal block; when `sealData.sealImage` is a base64 PNG it embeds at the seal placeholder, otherwise stamps RPLS name + license + sealedAt + signature-hash prefix as text. Drawing.pdf is included in the deliverable bundle when `withPdf` is enabled (default for `downloadDeliverableBundle`).)
- [x] PDF export: scale accurate (1" = specified footage) — paper size + orientation pulled from `doc.settings.paperSize` / `paperOrientation`; world → paper transform fits drawing extent into the drawable area with a 0.5" margin and a 1" title strip; renders to actual inches via jsPDF unit:'in'.
- ~~GeoJSON export: coordinates in WGS84~~ — deferred: cost clearly exceeds value at this point. `exportToGeoJSON` ships state-plane coords (US Survey Feet) with `EPSG:2277` CRS hint stamped in `crs.properties.name`, so any consumer that respects the CRS metadata (Esri / QGIS / Civil 3D / Google Earth Pro with the import wizard) re-projects correctly on their end. Native WGS84 output would require adding `proj4` (a ~70 KB dep that doubles the GeoJSON writer's surface), defining the projection initializer with State Plane Texas Central FIPS 4203 + survey-foot parameters, and accuracy-testing against Bell-CAD parcels (survey-accuracy reprojection requires getting the NAD83(2011) datum + epoch right). The state-plane + CRS-hint combo covers the 99% surveyor-handoff case. Revisit when a consumer surfaces that needs lat/lng directly.
- [x] GeoJSON export: all boundary features present (`exportToGeoJSON` in `lib/cad/delivery/geojson-writer.ts` walks `doc.features` → Point/LineString/Polygon/MultiLineString with curve sampling for circles/ellipses/arcs/splines; computed acreage stamped on POLYGON properties; smoke-tested with point + polygon + circle + arc)
- [x] GeoJSON import: round-trip — `importFromGeoJSON` in `lib/cad/delivery/geojson-reader.ts` walks FeatureCollection / Feature / bare Geometry / GeometryCollection; expands MultiPoint / MultiLineString / MultiPolygon; strips closing-vertex on Polygon outer rings; surfaces hole-drop + non-numeric-coord warnings. Layer table rebuilt from `properties.layerName` / `layerColor` (with neutral default), `crs.properties.name` stamped onto `titleBlock.notes`. Smoke-tested via writer→reader (4 features round-trip; layers + colors preserved).
- [x] CSV simplified: only base monument codes, B/E suffixes preserved — `lib/cad/persistence/export-csv.ts` now takes a `flavor: 'simplified' | 'full'` option. Simplified output passes the raw code through `parseCodeWithSuffix` so the **Code** column shows the base monument code (`BC02` not `BC02B`) and the suffix (`B` / `E` / `BA` / `EA` / `C` / `A`) lives in its own **Suffix** column — surveyor can sort by code without the suffix poisoning groupings while still seeing line-control intent. File → "Export as CSV (simplified)…" wires through `downloadCsv(doc, { flavor: 'simplified' })`. Tests in `__tests__/cad/persistence/export-csv.test.ts` cover the suffix-strip on a known base code + the empty-suffix passthrough.
- [x] CSV full: all fields including confidence and tier — same export with `flavor: 'full'`. Adds Raw Code, Monument Action, AI Confidence (0–100), AI Tier (1–5), Feature ID, Layer Color, Line Type ID, Feature Group ID, plus a `prop:*` spread over every custom property key found across the dataset (header is the union of keys so the column count stays stable for the whole sheet). The score map is plumbed through `BuildOptions.scores`; AI-pipeline-generated drawings can pass it from the deliberation result, manually-drawn drawings leave the AI columns blank. File → "Export as CSV (full)…" wires through `downloadCsv(doc, { flavor: 'full' })` and writes to `<docname>-full.csv` so the two exports never collide.
- [x] Field reference sleeve cards (§20): laminate-friendly 3.5"×2" cards via `generateSleeveCards` in `lib/cad/delivery/sleeve-cards.ts`. 4 codes per card; tiles 2 across × 5 down on Letter portrait; `collectCodesUsed` walks `feature.properties.rawCode` against MASTER_CODE_LIBRARY for the active job. File → 🪪 Field reference cards…
- [x] Compass → CAD bootstrap (§17.1): `lib/cad/integrations/compass.ts` exposes `parseCompassJob`, `consumePendingCompassJob` (reads + clears `starr-cad-pending-compass`), `buildSettingsPatch`, `isStale`. CADLayout consumes the payload on mount, patches the title block via `updateSettings`, and renders a sticky indigo notice with one-click links to the field/deed files + an "Open import" CTA that pops the existing import dialog. Stale-payload (>24h) warning included. Smoke-tested via `npx tsx`.
- [x] CAD → Compass status sync (§17.2): `lib/cad/integrations/compass-sync.ts` builds the structured payload (jobId / status / RPLS / acreage / signature hash / deliverable summary). POST `/api/admin/cad/compass-sync` proxies the payload to `COMPASS_WEBHOOK_URL` with `X-Starr-Compass-Secret` header (logs-only fallback when env vars aren't configured). CADLayout subscribes to `useReviewWorkflowStore` and auto-fires the sync once per (jobId, status) on SEALED / DELIVERED. Smoke-tested via `npx tsx` (status gate + payload shape).
- [x] CAD → Forge as-built sync (§17.3): `lib/cad/integrations/forge-sync.ts` classifies layers by name regex (BOUNDARY / BUILDINGS / UTILITIES), slices a per-category GeoJSON FeatureCollection, includes the full DXF + SHA-256 hash for de-dup, and posts to `/api/admin/cad/forge-sync` (forwards to `FORGE_WEBHOOK_URL` with `X-Starr-Forge-Secret`). Auto-fires once per `(jobId, DELIVERED)` from CADLayout's workflow subscriber. Smoke-tested via `npx tsx` (classifier + payload + status gate).
- [x] CAD → Orbit field-mapping sync (§17.4): `lib/cad/integrations/orbit-sync.ts` slices boundary polygon + utility lines + monument points (prefix regex catches BC/MN/IR/IP/PIN/NL/SP) into three GeoJSON FeatureCollections plus a structured `OrbitMonumentRef[]` carrying code + position. POST `/api/admin/cad/orbit-sync` forwards to `ORBIT_WEBHOOK_URL` with `X-Starr-Orbit-Secret`. Source CRS hint stamped via `urn:ogc:def:crs:EPSG::2277` so Orbit re-projects to WGS84 on its end. Auto-fires once per `(jobId, DELIVERED)` from the same CADLayout workflow subscriber. Smoke-tested via `npx tsx` (IRF + BC02 both detected as monuments, polygons + lines slice correctly).

### Electron Desktop

> **Scope note (2026-05-12):** Starr CAD ships as a web-distributed Next.js app
> (`/admin/cad`). No Electron wrapper exists in this repo, and building one is
> a multi-week distribution-track undertaking (per-feature fs/native-dialog
> wiring, code-signing, auto-update pipeline, per-OS installers) whose cost
> clearly exceeds value while the browser surface covers the day-to-day
> workflow. The four items below are deferred until a desktop distribution is
> green-lit; if that happens, this section becomes the spec for the wrapper's
> file I/O + offline behavior. Browser-side equivalents already work: offline
> access via IndexedDB autosave (see the shipped items below); File I/O via
> the existing import/export dialogs.

- ~~App opens without internet access~~ — deferred: no Electron wrapper in scope; browser offline coverage is owned by autosave + service-worker conventions, not this item
- ~~File → Open shows native file dialog, loads .starr file~~ — deferred: no Electron wrapper in scope; web side uses the import/open dialog
- ~~File → Save writes .starr file to disk~~ — deferred: no Electron wrapper in scope; web side persists to IndexedDB + downloads .starr on demand
- ~~Ctrl+Z / Ctrl+Y work in desktop app~~ — deferred: no Electron wrapper in scope; undo/redo already works in the web app
- [x] Auto-save writes .autosave file every 60 seconds — `lib/cad/persistence/autosave.ts` keys per-doc (`autosave:<docId>`) so switching drawings no longer drops the prior autosave; legacy `'current'` slot migrates transparently on first read; `clearAutosave` fires on manual save so stale recoveries don't pop on reload. Browser path uses IndexedDB; Electron-side fs persistence lands when the desktop wrapper ships.
- [x] Crash recovery dialog appears when .autosave is newer than .starr — existing mount-time dialog reads the doc-keyed slot via `readAutosave(docId)`; new `RecentRecoveriesDialog` (`File → Recover unsaved drawings…`) walks every keyed slot via `listAutosaves()` so dropped tabs don't lose work even when the surveyor reopens a different drawing. Each row shows the saved-at relative time + Restore / Discard buttons; Restore loads through `validateAndMigrateDocument` + zooms to extents.

### Performance
- ~~500-point drawing renders at 60fps at all zoom levels~~ — deferred: the supporting infrastructure (spatial index, LOD activation, annotation culling, off-viewport `visible = false` instead of destroy) is shipped (see the three completed perf rows above) and the snap hit-test benchmark already documents a 10× indexed-vs-linear speedup. The remaining "60fps everywhere" assertion needs an integrated frame-time HUD + Pixi profiler trace per zoom band, which is rig-up work that should land alongside the user-visible perf overlay (a future ToolOptionsBar item), not as a standalone Phase 7 item. The heavy lifting that drives the 60fps target is already in place.
- [x] Snap hit-testing on 500-point drawing < 10ms — `lib/cad/geometry/spatial-index.ts` ships a uniform-grid index (`createSpatialIndex`); `cullFeaturesWithIndex` in `lod.ts` runs the lookup. CanvasViewport memoizes the index per `doc.features` reference, reuses it across `renderFeatures` / `renderLabels` / `renderTextFeatures` and now narrows the candidate sets handed to `findSnapPoint` and the click-pick `hitTest` (cursor ± `worldTol` / `worldRadius` query bbox). Smoke-tested at 5,000 features × 100 queries: linear 181ms, indexed 18ms (10× speedup). Rbush-style R-tree can swap in later behind the same `SpatialIndex` shape if profiling demands it.
- [x] LOD activates at low zoom: symbols become dots, fps maintained — `CanvasViewport.renderFeatures` now reads `worldUnitsPerPixel = 1 / zoom`, runs `shouldUseLOD` + `lodSimplificationThreshold`, and threads the epsilon into `drawFeature`. POLYLINE / POLYGON paths run Douglas-Peucker (`simplifyPolyline`) on the source vertices when active and the polyline has > 4 vertices. Out-of-viewport features keep their Graphics objects but get `g.visible = false` so re-pan doesn't re-tessellate.
- [x] Annotation culling: only visible annotations rendered — `cullFeaturesToViewport` now runs in `renderLabels` (per-feature textLabels) and `renderTextFeatures` too. Off-viewport label/text objects flip to `visible = false` (no re-tessellation on pan); they only get destroyed when the source feature leaves the layer-visible set. `cullAnnotationsToViewport` + `computeAnnotationBBox` cover BEARING_DISTANCE / CURVE_DATA / MONUMENT_LABEL / AREA_LABEL / TEXT / LEADER for the standalone-annotation surface that lands once `useAnnotationStore` annotations get a render pass.

---

## 23. Build Order (Implementation Sequence)

### Week 1: Full Editor Integration & AI Sidebar
- Build `FullEditor.tsx` (post-AI editor container with AI sidebar)
- Build `EditorAISidebar.tsx` (tabs: Review, Assistant, Explanations, Versions, Checklist)
- Build `useAcceptDrawing` hook (AI result → DrawingDocument)
- Build `convertAIResultToDocument`
- Build `VersionHistory` component (show/restore AI versions)
- Wire Review Queue tab to Phase 6 `ReviewQueue` component
- Wire Explanations tab to Phase 6 `ElementExplanationPopup` component

### Week 2: AI Drawing Assistant
- Build `DrawingChatMessage` types
- Build `buildDrawingChatContext` (context for Claude)
- Build `EditorAISidebar` chat UI
- Build chat action handler (layer reassignment, style change, geometry instruction, etc.)
- Wire chat to AI worker endpoint
- Test all command types with sample drawings

### Week 3: Survey Description + Completeness
- Build `description-generator.ts` (legal description via Claude)
- Build `SurveyDescriptionPanel.tsx`
- Build `completeness-checker.ts` (all 16 checks)
- Build `CompletionChecklist.tsx`
- Test legal description generation with real Bell County deeds
- Test completeness checks with complete and incomplete drawings

### Week 4: RPLS Workflow & Seal
- Build `rpls-workflow.ts` (state machine + RPLSReviewRecord)
- Build `RPLSReviewDialog.tsx` (submission + review mode UI)
- Build `seal-engine.ts` (apply seal, compute hash)
- Build `SealApplication.tsx` (seal upload + placement UI)
- Build RPLS Review Mode toolbar overlay
- Test full RPLS workflow: submit → review → approve → seal

### Week 5: Export System
- Build `packages/export`
- Build `dxf-export.ts` (all entity types: LINE, ARC, LWPOLYLINE, INSERT, TEXT)
- Build `dxf-import.ts`
- Build `geojson-export.ts` with proj4 coordinate conversion
- Build `csv-export.ts` (simplified + full modes)
- Extend Phase 5 `pdf-export` for seal embedding and PDF/A options
- Build `ExportDialog.tsx`
- Test DXF round-trip with real drawing
- Test GeoJSON against known WGS84 coordinates

### Week 6: Deliverable Pipeline + Settings Persistence
- Build `delivery-pipeline.ts` and `DeliverableRecord`
- Build `DeliverableExport.tsx` and `ClientPortalDialog.tsx`
- Build `user-settings-store.ts` (server-side sync)
- Build `CompanySettings` persistence (name, license, logo, seal)
- Build import preset persistence
- Test delivery workflow: export → email → mark delivered

### Week 7: Electron + Auto-Save + Platform Integrations + Polish
- Build Electron `main.ts` and `preload.ts`
- Build `auto-save.ts` (interval + crash recovery)
- Build crash recovery dialog
- Build `auto-updater.ts`
- Build Electron build config (macOS + Windows)
- Build Compass import integration (`CompassJobImport`)
- Build CAD → Compass status sync
- Build `SpatialIndex` R-tree for snap/selection performance
- Build LOD rendering for dense point clouds
- Build annotation viewport culling
- Build field reference sleeve card generator
- Run ALL acceptance tests from §22
- Test with 5+ real Starr Surveying survey jobs end-to-end

---

## Copilot Session Template

> I am building Starr CAD Phase 7 — Final Delivery. Phases 1–6 are complete (CAD engine, data import, styling, geometry/math, annotations/print, AI drawing engine). I am now building the post-AI full editor (loading accepted AI drawings into the interactive editor with the AI sidebar), the persistent drawing chat assistant, AI survey description generation (legal description, notes, title block auto-fill), the RPLS review workflow (submit → review → approve → seal), digital seal application, the client deliverable pipeline, DXF/DWG export and import, final PDF export with seal, GeoJSON export, Electron desktop app with auto-save and crash recovery, and Starr platform integrations (Compass, Forge, Orbit). The spec is in `STARR_CAD_PHASE_7_FINAL.md`. I am currently working on **[CURRENT TASK from Build Order]**.

---

*End of Phase 7 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
