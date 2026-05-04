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
- [ ] Accepted AI drawing loads into full editor with all features and annotations
- [ ] Phase 6 review queue visible in editor sidebar
- [ ] Phase 6 element explanations accessible from editor sidebar
- [ ] Enrichment data auto-fills PLSS fields in title block
- [ ] Version history shows "AI Version 1" as first entry
- [ ] All Phase 1–5 editing tools functional after AI load
- [ ] Manual edit (move feature) → property panel updates → canvas updates
- [ ] Manual attribute edit (change layer in property panel) → canvas updates immediately

### AI Drawing Assistant
- [ ] Chat sends message, receives response within 30 seconds
- [ ] Layer reassignment chat command updates feature layer and canvas
- [ ] Style change command updates feature line type
- [ ] "Redraw boundary" command triggers stage 2 re-run for boundary layer
- [ ] Chat history persists through the session
- [ ] "Select Element to Chat About" focuses chat on that element

### Survey Description Generation
- [ ] Legal description generated in correct Texas metes-and-bounds format
- [ ] All bearing/distance legs present and correct
- [ ] POB monument description matches drawing
- [ ] Area statement included with correct acreage
- [ ] FEMA flood zone note auto-populated from enrichment data
- [ ] PLSS fields auto-filled in title block
- [ ] User can edit any field manually
- [ ] "Regenerate" re-runs Claude generation with updated drawing state

### Completeness Checker
- [x] All 16 checks run correctly (`checkDrawingCompleteness` in `lib/cad/delivery/completeness-checker.ts`; bearing-distance per-segment scan + legal-desc gate stay advisory until §5 + per-segment label coverage land)
- [x] Missing north arrow → error flagged (severity ERROR; checks `titleBlock.visible` + `northArrowSizeIn`)
- [x] Unfilled title block field → error flagged (severity ERROR; required: firmName, surveyorName, projectName, projectNumber, clientName, surveyDate)
- [x] Tier-1 unresolved items → error flagged (severity ERROR via `checkNoPendingBlocking`; tier-1 unplaced via WARNING `checkTier1Resolved`)
- [x] All checks pass → "Mark Ready for RPLS Review" enabled (`app/admin/cad/components/CompletenessPanel.tsx` consumes the checker, surfaces ✅/⚠️/❌ rows with per-row Fix CTAs (TITLE_BLOCK / REVIEW_QUEUE / LAYERS) wired to the right host surfaces, footer summary, and a Mark Ready button gated on `summary.ready`. Mounted in `CADLayout`, opened from File → ✓ Drawing completeness…)

### RPLS Workflow
- [x] Submit for review changes status to READY_FOR_REVIEW (`useReviewWorkflowStore.markReadyForReview` in `lib/cad/store/review-workflow-store.ts`; wrapper around `runTransition` in `lib/cad/delivery/rpls-workflow.ts`. Completeness panel's Mark Ready opens `RPLSSubmissionDialog` (`app/admin/cad/components/RPLSSubmissionDialog.tsx`) which confirms the resolved RPLS, captures an optional message, and runs the transition with the message folded into the audit-trail note.)
- [x] RPLS Review Mode UI shows review-specific buttons (`app/admin/cad/components/RPLSReviewModePanel.tsx`; status-aware body switches across DRAFT / READY_FOR_REVIEW / IN_REVIEW / CHANGES_REQUESTED / APPROVED / SEALED / DELIVERED with the right CTAs at each step. Mounted in `CADLayout`, opened from File → 🪪 RPLS review mode…)
- [x] "Approve & Seal" applies seal and changes status to SEALED — `RPLSReviewModePanel` now invokes `applySeal(doc, sealData)` from `lib/cad/delivery/seal-engine.ts`; the new doc lands in `useDrawingStore.loadDocument` and the workflow store flips to SEALED.
- [ ] Sealed drawing: seal image embedded in PDF at seal placeholder — seal data + image slot ready on `DrawingSettings.sealData`; PDF exporter wiring lands in §10 slice
- [x] Drawing hash recorded at time of sealing — `computeDrawingHash(doc)` in `seal-engine.ts` canonicalizes (sorted keys + transient state stripped) and SHA-256s; stored on `sealData.signatureHash` at apply time
- [x] Changes after sealing require re-sealing (hash mismatch warning) — `verifyDrawingSeal(doc)` returns `{ ok: false, expected, actual }` on drift; `app/admin/cad/components/SealHashBanner.tsx` consumes it via a 250ms-debounced effect and renders a sticky warning strip with a "Open RPLS review mode" CTA + a per-hash Dismiss latch

### Exports
- [ ] DXF export: all layers present with correct names
- [ ] DXF export: LINE entities match polyline vertices
- [ ] DXF export: ARC entities match arc radius/angles
- [ ] DXF export: TEXT entities present for all annotations
- [ ] DXF import: round-trip (export then re-import) preserves all features
- [ ] PDF export (final): seal image embedded at correct location
- [ ] PDF export: scale accurate (1" = specified footage)
- [ ] GeoJSON export: coordinates in WGS84
- [ ] GeoJSON export: all boundary features present
- [ ] CSV simplified: only base monument codes, B/E suffixes preserved
- [ ] CSV full: all fields including confidence and tier

### Electron Desktop
- [ ] App opens without internet access
- [ ] File → Open shows native file dialog, loads .starr file
- [ ] File → Save writes .starr file to disk
- [ ] Ctrl+Z / Ctrl+Y work in desktop app
- [ ] Auto-save writes .autosave file every 60 seconds
- [ ] Crash recovery dialog appears when .autosave is newer than .starr

### Performance
- [ ] 500-point drawing renders at 60fps at all zoom levels
- [ ] Snap hit-testing on 500-point drawing < 10ms
- [ ] LOD activates at low zoom: symbols become dots, fps maintained
- [ ] Annotation culling: only visible annotations rendered

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
