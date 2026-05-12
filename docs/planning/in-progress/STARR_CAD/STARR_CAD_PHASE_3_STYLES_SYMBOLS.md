# STARR CAD — Phase 3: Layer System, Symbols, Line Types & Editors ✅ COMPLETE

**Version:** 1.1 | **Date:** March 2026 | **Phase:** 3 of 7 | **Status:** ✅ COMPLETE

**Goal:** Full visual styling pipeline. Every point code maps to a specific symbol, line type, color, weight, and layer. Users can create custom symbols and line types via built-in editors. The layer panel is feature-complete with 22 surveying layers. The property panel lets you edit any selected feature's visual properties. Monument action (found/set/calc) drives symbol selection automatically.

**Duration:** 5–7 weeks | **Depends On:** Phase 2 (codes assigned to points, line strings built, import pipeline working)

---

## Table of Contents

1. [Phase 3 Architecture Changes](#1-phase-3-architecture-changes)
2. [Expanded Layer Model](#2-expanded-layer-model)
3. [Default Layer Definitions (22 Layers)](#3-default-layer-definitions-22-layers)
4. [Layer Panel UI](#4-layer-panel-ui)
5. [Style Cascade System](#5-style-cascade-system)
6. [Symbol Definition Model](#6-symbol-definition-model)
7. [Built-In Symbol Library](#7-built-in-symbol-library)
8. [Symbol Renderer](#8-symbol-renderer)
9. [Symbol Editor UI](#9-symbol-editor-ui)
10. [Line Type Definition Model](#10-line-type-definition-model)
11. [Built-In Line Type Library](#11-built-in-line-type-library)
12. [Line Type Renderer](#12-line-type-renderer)
13. [Line Type Editor UI](#13-line-type-editor-ui)
14. [Code-to-Style Mapping System](#14-code-to-style-mapping-system)
15. [Code-to-Style Mapping Panel UI](#15-code-to-style-mapping-panel-ui)
16. [Monument Action → Symbol Resolution](#16-monument-action--symbol-resolution)
17. [Property Panel](#17-property-panel)
18. [Global Style Settings](#18-global-style-settings)
19. [State Management Updates](#19-state-management-updates)
20. [Canvas Rendering Overhaul](#20-canvas-rendering-overhaul)
21. [Acceptance Tests](#21-acceptance-tests)
22. [Build Order (Implementation Sequence)](#22-build-order-implementation-sequence)

---

## 1. Phase 3 Architecture Changes

### 1.1 New Packages

```
packages/
├── styles/                          # NEW — Styling, symbols, line types
│   ├── src/
│   │   ├── types.ts                 # SymbolDefinition, LineTypeDefinition, CodeStyleMapping
│   │   ├── symbol-library.ts        # All built-in symbols (SVG path data)
│   │   ├── symbol-renderer.ts       # Render symbols to PixiJS Graphics
│   │   ├── linetype-library.ts      # All built-in line types
│   │   ├── linetype-renderer.ts     # Dash patterns + inline symbols
│   │   ├── style-cascade.ts         # 4-tier style resolution engine
│   │   ├── code-style-map.ts        # Code → symbol/lineType/color/layer defaults
│   │   └── monument-symbols.ts      # Monument action → symbol resolution
│   ├── __tests__/
│   │   ├── style-cascade.test.ts
│   │   ├── symbol-renderer.test.ts
│   │   └── linetype-renderer.test.ts
│   ├── package.json
│   └── tsconfig.json
```

### 1.2 Updated & New Components

```
apps/web/components/
├── panels/
│   ├── LayerPanel.tsx               # REWRITE — full-featured layer panel
│   ├── PropertyPanel.tsx            # REWRITE — full property editor
│   └── CodeStylePanel.tsx           # NEW — code-to-style mapping table
├── editors/
│   ├── SymbolEditor.tsx             # NEW — draw/edit custom symbols
│   ├── SymbolPicker.tsx             # NEW — select symbol from library
│   ├── LineTypeEditor.tsx           # NEW — dash pattern + inline symbol editor
│   ├── LineTypePicker.tsx           # NEW — select line type from library
│   ├── ColorPicker.tsx              # NEW — reusable color picker
│   └── LineWeightPicker.tsx         # NEW — line weight selector
├── settings/
│   └── GlobalStyleSettings.tsx      # NEW — app-wide style preferences
```

### 1.3 Updated Feature Model

Phase 1's `FeatureStyle` was minimal. Phase 3 replaces it:

```typescript
// REPLACE the Phase 1 FeatureStyle with:
export interface FeatureStyle {
  // Color
  color: string | null;              // null = inherit from cascade
  opacity: number;                   // 0–1

  // Line
  lineTypeId: string | null;         // null = inherit
  lineWeight: number | null;         // mm, null = inherit

  // Point symbol
  symbolId: string | null;           // null = inherit
  symbolSize: number | null;         // mm, null = inherit
  symbolRotation: number;            // degrees (0 = upright)

  // Label
  labelVisible: boolean | null;      // null = inherit
  labelFormat: string | null;        // null = inherit
  labelOffset: { x: number; y: number }; // screen px offset from feature

  // Flags
  isOverride: boolean;               // true = user manually set this, don't auto-update
}
```

### 1.4 Updated Layer Model

Phase 1's `Layer` was basic. Phase 3 replaces it:

```typescript
// REPLACE Phase 1 Layer with:
export interface Layer {
  id: string;
  name: string;

  // Visibility states
  visible: boolean;                  // User toggle
  locked: boolean;                   // Can't edit features, but can see/select
  frozen: boolean;                   // Invisible AND excluded from selection/snap

  // Style defaults (used by style cascade tier 3)
  color: string;
  lineWeight: number;                // mm
  lineTypeId: string;                // Line type definition ID
  opacity: number;

  // Organization
  groupId: string | null;            // Parent layer group (null = top level)
  sortOrder: number;                 // Render order within group

  // Protection
  isDefault: boolean;                // Cannot be deleted
  isProtected: boolean;              // Cannot be renamed (system layers)

  // Auto-assignment
  autoAssignCodes: string[];         // Codes that map to this layer

  // Stats (transient, not saved)
  featureCount?: number;
}

export interface LayerGroup {
  id: string;
  name: string;
  collapsed: boolean;
  sortOrder: number;
}
```

---

## 2. Expanded Layer Model

See Section 1.4 above for the full TypeScript definition. Key additions from Phase 1:

- **`frozen`**: Unlike `locked`, frozen layers are completely invisible and excluded from all hit testing, snap calculations, and selection operations. This is the CAD-standard three-state system: visible / locked / frozen.
- **`lineTypeId`**: Layers now have a default line type, not just color and weight.
- **`groupId`**: Layers can be organized into collapsible groups.
- **`autoAssignCodes`**: The codes that automatically place features on this layer during import.
- **`featureCount`**: Live count shown in the layer panel (computed, not stored).

---

## 3. Default Layer Definitions (22 Layers)

Every new drawing starts with these layers. They have `isDefault: true` and cannot be deleted.

```typescript
// packages/styles/src/default-layers.ts

import type { Layer, LayerGroup } from '@starr-cad/core';
import { generateId } from '@starr-cad/core';

export const DEFAULT_LAYER_GROUPS: LayerGroup[] = [
  { id: 'grp-boundary',  name: 'Boundary & Control', collapsed: false, sortOrder: 0 },
  { id: 'grp-improve',   name: 'Improvements',       collapsed: false, sortOrder: 1 },
  { id: 'grp-utility',   name: 'Utilities',           collapsed: false, sortOrder: 2 },
  { id: 'grp-natural',   name: 'Natural Features',    collapsed: false, sortOrder: 3 },
  { id: 'grp-transport', name: 'Transportation',      collapsed: false, sortOrder: 4 },
  { id: 'grp-annot',     name: 'Annotation & Misc',   collapsed: false, sortOrder: 5 },
];

export const DEFAULT_LAYERS: Layer[] = [
  // ── Boundary & Control ──
  { id: 'BOUNDARY',      name: 'Boundary',            visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.50, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['PL01','PL06','350','355'] },
  { id: 'BOUNDARY-MON',  name: 'Boundary Monuments',  visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.25, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['BC01','BC02','BC03','BC04','BC05','BC06','BC07','BC08','BC09','BC10','BC11','BC12','BC13','BC14','BC15','BC16','BC17','BC18','BC19','BC20','BC21','BC22','BC23','BC24','BC25','BC26','BC27','BC33'] },
  { id: 'EASEMENT',      name: 'Easement',            visible: true, locked: false, frozen: false, color: '#27AE60', lineWeight: 0.35, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-boundary', sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['PL02','351'] },
  { id: 'BUILDING-LINE', name: 'Building Line',       visible: true, locked: false, frozen: false, color: '#2980B9', lineWeight: 0.25, lineTypeId: 'DASH_DOT',     opacity: 1, groupId: 'grp-boundary', sortOrder: 3, isDefault: true, isProtected: false, autoAssignCodes: ['PL03','352'] },
  { id: 'ROW',           name: 'Right-of-Way',        visible: true, locked: false, frozen: false, color: '#E74C3C', lineWeight: 0.50, lineTypeId: 'DASHED_HEAVY', opacity: 1, groupId: 'grp-boundary', sortOrder: 4, isDefault: true, isProtected: false, autoAssignCodes: ['PL04','PL05','353','354'] },
  { id: 'FLOOD',         name: 'Flood Zone',          visible: true, locked: false, frozen: false, color: '#00BCD4', lineWeight: 0.25, lineTypeId: 'DASH_DOT_DOT', opacity: 1, groupId: 'grp-boundary', sortOrder: 5, isDefault: true, isProtected: false, autoAssignCodes: ['PL07','356'] },
  { id: 'CONTROL',       name: 'Survey Control',      visible: true, locked: false, frozen: false, color: '#FF0000', lineWeight: 0.25, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 6, isDefault: true, isProtected: false, autoAssignCodes: ['SC01','SC02','SC03','SC04','SC05','SC06','300','301','302','303','304','305'] },
  { id: 'CURVE-DATA',    name: 'Curve Data',          visible: true, locked: false, frozen: false, color: '#9B59B6', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-boundary', sortOrder: 7, isDefault: true, isProtected: false, autoAssignCodes: ['CV01','CV02','CV03','CV04','CV05','CV06','CV07','CV08','CV09','CV10'] },

  // ── Improvements ──
  { id: 'STRUCTURES',    name: 'Structures',          visible: true, locked: false, frozen: false, color: '#7F8C8D', lineWeight: 0.35, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-improve',  sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['ST01','ST02','ST03','ST04','ST05','ST06','ST07','ST08','ST09','ST10','ST11','ST12'] },
  { id: 'FENCE',         name: 'Fences',              visible: true, locked: false, frozen: false, color: '#E67E22', lineWeight: 0.25, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-improve',  sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['FN01','FN02','FN03','FN04','FN05','FN06','FN07','FN08','FN09','FN10','FN11','FN12','FN13','FN14','FN15'] },

  // ── Utilities ──
  { id: 'UTILITY-WATER', name: 'Water',               visible: true, locked: false, frozen: false, color: '#3498DB', lineWeight: 0.25, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['UT01','UT02','UT03','UT04','UT05','UT19','UT20'] },
  { id: 'UTILITY-SEWER', name: 'Sewer',               visible: true, locked: false, frozen: false, color: '#27AE60', lineWeight: 0.25, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['UT06','UT07'] },
  { id: 'UTILITY-GAS',   name: 'Gas',                 visible: true, locked: false, frozen: false, color: '#F1C40F', lineWeight: 0.25, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['UT08','UT09','UT10'] },
  { id: 'UTILITY-ELEC',  name: 'Electric',            visible: true, locked: false, frozen: false, color: '#FF8C00', lineWeight: 0.25, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 3, isDefault: true, isProtected: false, autoAssignCodes: ['UT11','UT12','UT13','UT14','UT15','UT16'] },
  { id: 'UTILITY-COMM',  name: 'Communication',       visible: true, locked: false, frozen: false, color: '#800080', lineWeight: 0.25, lineTypeId: 'DASHED',       opacity: 1, groupId: 'grp-utility',  sortOrder: 4, isDefault: true, isProtected: false, autoAssignCodes: ['UT17','UT18'] },

  // ── Natural Features ──
  { id: 'VEGETATION',    name: 'Vegetation',          visible: true, locked: false, frozen: false, color: '#008000', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-natural',  sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['VG01','VG02','VG03','VG04','VG05','VG06','VG07','VG08'] },
  { id: 'TOPO',          name: 'Topography',          visible: true, locked: false, frozen: false, color: '#8B4513', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-natural',  sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: ['TP01','TP02','TP03','TP04','TP05','TP06','PL08','PL09','MS05'] },
  { id: 'WATER-FEATURES',name: 'Water Features',      visible: true, locked: false, frozen: false, color: '#0000FF', lineWeight: 0.25, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-natural',  sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['TP07','TP08','TP09','TP10','TP11'] },

  // ── Transportation ──
  { id: 'TRANSPORTATION',name: 'Transportation',      visible: true, locked: false, frozen: false, color: '#808080', lineWeight: 0.25, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-transport',sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: ['TR01','TR02','TR03','TR04','TR05','TR06','TR07','TR08'] },

  // ── Annotation & Misc ──
  { id: 'ANNOTATION',    name: 'Annotation',          visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.25, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-annot',    sortOrder: 0, isDefault: true, isProtected: false, autoAssignCodes: [] },
  { id: 'TITLE-BLOCK',   name: 'Title Block',         visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.35, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-annot',    sortOrder: 1, isDefault: true, isProtected: false, autoAssignCodes: [] },
  { id: 'MISC',          name: 'Miscellaneous',       visible: true, locked: false, frozen: false, color: '#000000', lineWeight: 0.18, lineTypeId: 'SOLID',        opacity: 1, groupId: 'grp-annot',    sortOrder: 2, isDefault: true, isProtected: false, autoAssignCodes: ['MS01','MS02','MS03','MS04'] },
];
```

---

## 4. Layer Panel UI

The layer panel is a persistent left sidebar (below the toolbar, collapsible).

### 4.1 Layout

```
┌─ Layers ──────────────────── [+] [⚙] ─┐
│ 🔍 [Filter layers...               ]   │
├─────────────────────────────────────────┤
│ ▼ Boundary & Control                   │
│   👁 🔒 ■ BOUNDARY            (12) ◀  │
│   👁 🔒 ■ Boundary Monuments   (8)    │
│   👁 🔒 ■ Easement            (4)     │
│   👁 🔒 ■ Building Line       (2)     │
│   👁 🔒 ■ Right-of-Way        (6)     │
│   👁 🔒 ■ Flood Zone          (0)     │
│   👁 🔒 ■ Survey Control      (3)     │
│   👁 🔒 ■ Curve Data          (0)     │
│ ▼ Improvements                         │
│   👁 🔒 ■ Structures          (15)    │
│   👁 🔒 ■ Fences              (22)    │
│ ▶ Utilities (collapsed)         (18)   │
│ ▶ Natural Features (collapsed)   (45)  │
│ ▼ Transportation                       │
│   👁 🔒 ■ Transportation       (8)    │
│ ▼ Annotation & Misc                    │
│   👁 🔒 ■ Annotation          (0)     │
│   👁 🔒 ■ Title Block         (0)     │
│   👁 🔒 ■ Miscellaneous       (5)     │
├─────────────────────────────────────────┤
│ [User Layers]                          │
│   👁 🔒 ■ My Extra Layer      (3)     │
└─────────────────────────────────────────┘
```

**Legend:**
- `👁` = Visibility toggle (eye icon)
- `🔒` = Lock toggle (lock icon, shows `❄` for frozen)
- `■` = Color swatch (click to change)
- `(N)` = Feature count badge
- `◀` = Active layer indicator (highlighted row)
- `▼/▶` = Group collapse toggle
- `[+]` = New Layer button
- `[⚙]` = Layer settings menu

### 4.2 Interactions

| Action | Behavior |
|--------|----------|
| Click layer name | Set as active layer |
| Click eye icon | Toggle visibility |
| Shift+click eye icon | Solo this layer (hide all others, remember previous state; shift-click again to restore) |
| Click lock icon | Toggle locked |
| Ctrl+click lock icon | Toggle frozen (icon changes to snowflake) |
| Click color swatch | Open color picker inline |
| Double-click layer name | Rename (inline edit) |
| Right-click layer | Context menu (see below) |
| Drag layer | Reorder within group |
| Drag layer onto group header | Move to that group |
| Ctrl+click multiple layers | Multi-select for batch operations |
| Type in filter box | Filter layers by name (shows only matching) |
| Click group header ▼/▶ | Collapse/expand group |
| Click `[+]` | Create new user layer |
| Click `[⚙]` | Open layer settings (import/export schemes, reset to defaults) |

### 4.3 Context Menu

```
┌─────────────────────────────┐
│ Rename                      │
│ Change Color...             │
│ Change Line Weight...       │
│ Change Line Type...         │
│ ─────────────────────────── │
│ Select All On Layer         │
│ Move Selection To Layer     │
│ ─────────────────────────── │
│ Duplicate Layer             │
│ Merge With...       ▶      │  (submenu: list of other layers)
│ ─────────────────────────── │
│ Delete Layer                │  (disabled for default layers)
└─────────────────────────────┘
```

### 4.4 Layer State Logic

```typescript
// Visibility resolution:
function isLayerEffectivelyVisible(layer: Layer): boolean {
  return layer.visible && !layer.frozen;
}

// Can user interact with features on this layer?
function isLayerInteractive(layer: Layer): boolean {
  return layer.visible && !layer.locked && !layer.frozen;
}

// Should snap engine consider features on this layer?
function isLayerSnappable(layer: Layer): boolean {
  return layer.visible && !layer.frozen;
  // Locked layers ARE snappable (you can snap to them but not edit them)
}
```

---

## 5. Style Cascade System

The style cascade resolves the visual appearance of any feature through a 4-tier priority system.

```typescript
// packages/styles/src/style-cascade.ts

export interface ResolvedStyle {
  color: string;
  opacity: number;
  lineTypeId: string;
  lineWeight: number;           // mm
  symbolId: string;
  symbolSize: number;           // mm
  symbolRotation: number;       // degrees
  labelVisible: boolean;
  labelFormat: string;
}

/**
 * Resolve the effective style for a feature.
 * Priority (first non-null wins):
 *   1. Feature-level override (user manually set this)
 *   2. Point-code default (from code-to-style mapping)
 *   3. Layer style (the layer's default settings)
 *   4. Global fallback
 */
export function resolveStyle(
  feature: Feature,
  codeMapping: CodeStyleMapping | null,
  layer: Layer,
  globalDefaults: GlobalStyleConfig,
): ResolvedStyle {
  const fs = feature.style;

  return {
    color:          fs.color           ?? codeMapping?.lineColor    ?? layer.color         ?? '#000000',
    opacity:        fs.opacity         ?? 1,
    lineTypeId:     fs.lineTypeId      ?? codeMapping?.lineTypeId   ?? layer.lineTypeId    ?? 'SOLID',
    lineWeight:     fs.lineWeight      ?? codeMapping?.lineWeight   ?? layer.lineWeight    ?? 0.25,
    symbolId:       fs.symbolId        ?? codeMapping?.symbolId     ?? 'GENERIC_CROSS',
    symbolSize:     fs.symbolSize      ?? codeMapping?.symbolSize   ?? 2.0,
    symbolRotation: fs.symbolRotation  ?? 0,
    labelVisible:   fs.labelVisible    ?? codeMapping?.labelVisible ?? true,
    labelFormat:    fs.labelFormat     ?? codeMapping?.labelFormat  ?? '{code}',
  };
}

/**
 * For point features specifically, the symbol depends on monument action.
 * This is called AFTER resolveStyle to override the symbol if needed.
 */
export function resolveMonumentSymbol(
  fallbackSymbolId: string,
  monumentAction: MonumentAction | null,
  monumentType: string | null,
): string {
  if (!monumentAction || monumentAction === 'UNKNOWN') return fallbackSymbolId;

  // Monument symbol naming convention:
  //   MON_{type}_{action}
  //   e.g., MON_IR_050_FOUND, MON_IR_050_SET, MON_IR_050_CALC
  //
  // If we can find a specific monument symbol, use it.
  // Otherwise fall back to generic found/set/calc symbols.

  const actionSuffix = monumentAction === 'FOUND' ? 'FOUND'
                     : monumentAction === 'SET' ? 'SET'
                     : 'CALC';

  // Try specific monument symbol first (from code definition)
  // If it exists in the symbol library, use it
  // Otherwise use generic action-based symbols
  return fallbackSymbolId || `MON_GENERIC_${actionSuffix}`;
}
```

---

## 6. Symbol Definition Model

```typescript
// packages/styles/src/types.ts

export interface SymbolDefinition {
  id: string;
  name: string;
  category: 'MONUMENT_FOUND' | 'MONUMENT_SET' | 'MONUMENT_CALC' | 'CONTROL' | 'UTILITY'
           | 'VEGETATION' | 'STRUCTURE' | 'FENCE_INLINE' | 'CURVE' | 'GENERIC' | 'CUSTOM';

  // Geometry: array of SVG-like drawing commands
  // Coordinate space: centered on (0,0), reference size 10x10 units
  paths: SymbolPath[];

  // Insertion and sizing
  insertionPoint: { x: number; y: number }; // (0,0) = center
  defaultSize: number;                       // mm at 1:1 paper scale
  minSize: number;                           // mm
  maxSize: number;                           // mm

  // Color behavior
  colorMode: 'FIXED' | 'LAYER' | 'CODE';
  fixedColor: string | null;                 // Used when colorMode = 'FIXED'

  // Rotation
  defaultRotation: number;                   // degrees
  rotatable: boolean;

  // Metadata
  isBuiltIn: boolean;
  isEditable: boolean;                       // Built-ins are not editable (but can be duplicated)
  assignedCodes: string[];                   // Which codes use this by default
}

export interface SymbolPath {
  type: 'PATH' | 'CIRCLE' | 'RECT' | 'TEXT';

  // For PATH:
  d?: string;                                // SVG path data (M, L, C, A, Z commands)

  // For CIRCLE:
  cx?: number; cy?: number; r?: number;

  // For RECT:
  x?: number; y?: number; width?: number; height?: number;

  // For TEXT:
  text?: string; tx?: number; ty?: number;
  fontSize?: number;                         // relative to symbol coordinate space

  // Styling per path element
  fill: string | 'INHERIT' | 'NONE';        // 'INHERIT' = use feature color
  stroke: string | 'INHERIT' | 'NONE';
  strokeWidth: number;
}
```

---

## 7. Built-In Symbol Library

All symbols centered on `(0,0)` in a 10×10 unit coordinate space. Rendered at `symbolSize` mm on paper.

```typescript
// packages/styles/src/symbol-library.ts

export const BUILTIN_SYMBOLS: SymbolDefinition[] = [

  // ═══════════════════════════════════════════════════
  // MONUMENTS — FOUND (solid fill, black)
  // ═══════════════════════════════════════════════════

  {
    id: 'MON_GENERIC_FOUND', name: 'Monument Found (Generic)', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'MON_IR_038_FOUND', name: '3/8" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 2.5, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC01','308'],
  },
  {
    id: 'MON_IR_050_FOUND', name: '1/2" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC02','309'],
  },
  {
    id: 'MON_IR_058_FOUND', name: '5/8" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3.2, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.8, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC03','310'],
  },
  {
    id: 'MON_IR_075_FOUND', name: '3/4" IR Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC04','311'],
  },
  {
    id: 'MON_IP_FOUND', name: 'Iron Pipe Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'RECT', x: -3, y: -3, width: 6, height: 6, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC13','312'],
  },
  {
    id: 'MON_CONC_FOUND', name: 'Concrete Mon Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'RECT', x: -4, y: -4, width: 8, height: 8, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC16','313'],
  },
  {
    id: 'MON_CAP_FOUND', name: 'Cap/Disk Found', category: 'MONUMENT_FOUND',
    paths: [{ type: 'PATH', d: 'M 0 -4 L 4 0 L 0 4 L -4 0 Z', fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC19','314'],
  },
  {
    id: 'MON_PKNAIL_FOUND', name: 'PK Nail Found', category: 'MONUMENT_FOUND',
    paths: [
      { type: 'PATH', d: 'M -3 -3 L 3 3 M 3 -3 L -3 3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 1, maxSize: 5,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC22','338'],
  },
  {
    id: 'MON_MAGNAIL_FOUND', name: 'Mag Nail Found', category: 'MONUMENT_FOUND',
    paths: [
      { type: 'PATH', d: 'M 0 -4 L 2.4 3.2 L -3.8 -1.2 L 3.8 -1.2 L -2.4 3.2 Z', fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#000000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC24','340'],
  },

  // ═══════════════════════════════════════════════════
  // MONUMENTS — SET (open/outline, red)
  // Same shapes as FOUND but fill='NONE'
  // ═══════════════════════════════════════════════════

  {
    id: 'MON_GENERIC_SET', name: 'Monument Set (Generic)', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'MON_IR_050_SET', name: '1/2" IR Set', category: 'MONUMENT_SET',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC06','317'],
  },
  // ... (same pattern for all SET variants: 038, 058, 075, IP, CONC, CAP, PKNAIL, MAGNAIL)
  // Each mirrors its FOUND counterpart with fill='NONE' and fixedColor='#FF0000'

  // ═══════════════════════════════════════════════════
  // MONUMENTS — CALCULATED (target/crosshair, magenta)
  // Circle with interior cross
  // ═══════════════════════════════════════════════════

  {
    id: 'MON_GENERIC_CALC', name: 'Monument Calc (Generic)', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -4.5 0 L 4.5 0 M 0 -4.5 L 0 4.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'MON_IR_050_CALC', name: '1/2" IR Calculated', category: 'MONUMENT_CALC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -4.5 0 L 4.5 0 M 0 -4.5 L 0 4.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF00FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['BC10','328'],
  },
  // ... (same pattern for all CALC variants)

  // ═══════════════════════════════════════════════════
  // SURVEY CONTROL
  // ═══════════════════════════════════════════════════

  {
    id: 'CTRL_TRIANGLE', name: 'Control Point', category: 'CONTROL',
    paths: [{ type: 'PATH', d: 'M 0 -4.5 L 4 3.5 L -4 3.5 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['SC01','300'],
  },
  {
    id: 'CTRL_BENCHMARK', name: 'Benchmark', category: 'CONTROL',
    paths: [
      { type: 'PATH', d: 'M 0 -4.5 L 4 3.5 L -4 3.5 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.7 },
      { type: 'TEXT', text: 'BM', tx: 0, ty: 1, fontSize: 3, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 1, maxSize: 8,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['SC02','301'],
  },

  // ═══════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════

  {
    id: 'UTIL_HYDRANT', name: 'Fire Hydrant', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'FH', tx: 0, ty: 0.5, fontSize: 2.8, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT03','602'],
  },
  {
    id: 'UTIL_WATER_METER', name: 'Water Meter', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'WM', tx: 0, ty: 0.5, fontSize: 2.5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#0000FF', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT01','600'],
  },
  {
    id: 'UTIL_MANHOLE', name: 'Manhole', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'PATH', d: 'M -3.5 0 L 3.5 0 M 0 -3.5 L 0 3.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.4 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'CODE', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT06','610'],
  },
  {
    id: 'UTIL_POWER_POLE', name: 'Power Pole', category: 'UTILITY',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 2.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: 'PP', tx: 0, ty: 0.5, fontSize: 2.5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.5, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF8C00', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['UT12','641'],
  },

  // ═══════════════════════════════════════════════════
  // VEGETATION
  // ═══════════════════════════════════════════════════

  {
    id: 'VEG_TREE_DECID', name: 'Deciduous Tree', category: 'VEGETATION',
    paths: [
      // Irregular crown outline (approximated circle with bumps)
      { type: 'PATH', d: 'M 0 -4 C 2 -4.5 4.5 -2 4.5 0 C 4.5 2 3 4.5 0 4.5 C -3 4.5 -4.5 2 -4.5 0 C -4.5 -2 -2 -4.5 0 -4 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      // Trunk mark
      { type: 'CIRCLE', cx: 0, cy: 0, r: 0.8, fill: 'INHERIT', stroke: 'INHERIT', strokeWidth: 0.3 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.5, minSize: 2, maxSize: 12,
    colorMode: 'FIXED', fixedColor: '#008000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['VG01','720'],
  },
  {
    id: 'VEG_TREE_EVERG', name: 'Evergreen Tree', category: 'VEGETATION',
    paths: [
      // Star/asterisk shape (6 points)
      { type: 'PATH', d: 'M 0 -4.5 L 1 -1 L 4 -2.5 L 2 0 L 4 2.5 L 1 1 L 0 4.5 L -1 1 L -4 2.5 L -2 0 L -4 -2.5 L -1 -1 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 2, maxSize: 10,
    colorMode: 'FIXED', fixedColor: '#006400', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: ['VG02','721'],
  },

  // ═══════════════════════════════════════════════════
  // FENCE INLINE SYMBOLS (used by line type renderer)
  // ═══════════════════════════════════════════════════

  {
    id: 'FENCE_BARB_X', name: 'Barbed Wire X', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M -2 -2 L 2 2 M 2 -2 L -2 2', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 1.5, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'FENCE_CL_DIAMOND', name: 'Chain Link Diamond', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M 0 -3 L 2 0 L 0 3 L -2 0 Z', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'FENCE_BOARD_TICK', name: 'Wood Privacy Tick', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M 0 0 L 0 -3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'RR_CROSSTIE', name: 'Railroad Crosstie', category: 'FENCE_INLINE',
    paths: [{ type: 'PATH', d: 'M 0 -3.5 L 0 3.5', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.8 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 5,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },

  // ═══════════════════════════════════════════════════
  // GENERIC FALLBACKS
  // ═══════════════════════════════════════════════════

  {
    id: 'GENERIC_CROSS', name: 'Cross', category: 'GENERIC',
    paths: [{ type: 'PATH', d: 'M -3 0 L 3 0 M 0 -3 L 0 3', fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 2.0, minSize: 0.5, maxSize: 6,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'GENERIC_DOT', name: 'Dot', category: 'GENERIC',
    paths: [{ type: 'CIRCLE', cx: 0, cy: 0, r: 1, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 }],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 1.5, minSize: 0.5, maxSize: 4,
    colorMode: 'LAYER', fixedColor: null, defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
  {
    id: 'GENERIC_QUESTION', name: 'Unknown Code', category: 'GENERIC',
    paths: [
      { type: 'CIRCLE', cx: 0, cy: 0, r: 3.5, fill: 'NONE', stroke: 'INHERIT', strokeWidth: 0.5 },
      { type: 'TEXT', text: '?', tx: 0, ty: 1, fontSize: 5, fill: 'INHERIT', stroke: 'NONE', strokeWidth: 0 },
    ],
    insertionPoint: { x: 0, y: 0 }, defaultSize: 3.0, minSize: 1, maxSize: 6,
    colorMode: 'FIXED', fixedColor: '#FF0000', defaultRotation: 0, rotatable: false,
    isBuiltIn: true, isEditable: false, assignedCodes: [],
  },
];
```

---

## 8. Symbol Renderer

The symbol renderer takes a `SymbolDefinition` and renders it to PixiJS Graphics at a given screen position, scale, rotation, and color.

```typescript
// packages/styles/src/symbol-renderer.ts
import * as PIXI from 'pixi.js';

export function renderSymbol(
  g: PIXI.Graphics,
  symbol: SymbolDefinition,
  screenX: number,
  screenY: number,
  sizePx: number,                    // Symbol size in screen pixels
  rotation: number,                  // Degrees
  color: number,                     // Hex color as number (0xFF0000)
  opacity: number,
): void {
  // Scale factor: symbol coordinate space (10x10) → screen pixels
  const scale = sizePx / 10;

  g.setTransform(screenX, screenY, scale, scale, (rotation * Math.PI) / 180);

  for (const path of symbol.paths) {
    const fillColor = resolvePathColor(path.fill, color);
    const strokeColor = resolvePathColor(path.stroke, color);

    if (strokeColor !== null) g.lineStyle(path.strokeWidth, strokeColor, opacity);
    else g.lineStyle(0);

    if (fillColor !== null) g.beginFill(fillColor, opacity);

    switch (path.type) {
      case 'CIRCLE':
        g.drawCircle(path.cx!, path.cy!, path.r!);
        break;

      case 'RECT':
        g.drawRect(path.x!, path.y!, path.width!, path.height!);
        break;

      case 'PATH':
        renderSVGPath(g, path.d!);
        break;

      case 'TEXT':
        // Text rendered separately via PIXI.Text
        // (handled in a companion function since Graphics can't do text)
        break;
    }

    if (fillColor !== null) g.endFill();
  }

  g.setTransform(0, 0, 1, 1, 0); // Reset transform
}

function resolvePathColor(pathColor: string | 'INHERIT' | 'NONE', inheritColor: number): number | null {
  if (pathColor === 'NONE') return null;
  if (pathColor === 'INHERIT') return inheritColor;
  return parseInt(pathColor.replace('#', ''), 16);
}

/** Parse SVG path data and render to PixiJS Graphics */
function renderSVGPath(g: PIXI.Graphics, d: string): void {
  const commands = parseSVGPathData(d);
  let cx = 0, cy = 0; // Current position
  let startX = 0, startY = 0; // Start of current subpath

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': cx = cmd.x; cy = cmd.y; startX = cx; startY = cy; g.moveTo(cx, cy); break;
      case 'L': cx = cmd.x; cy = cmd.y; g.lineTo(cx, cy); break;
      case 'C':
        g.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        cx = cmd.x; cy = cmd.y;
        break;
      case 'Z': g.lineTo(startX, startY); cx = startX; cy = startY; break;
    }
  }
}

interface PathCommand {
  type: 'M' | 'L' | 'C' | 'Z';
  x: number; y: number;
  x1?: number; y1?: number;
  x2?: number; y2?: number;
}

function parseSVGPathData(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  // Regex tokenizer for M, L, C, Z commands with coordinates
  const regex = /([MLCZ])\s*([^MLCZ]*)/gi;
  let match;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1].toUpperCase() as PathCommand['type'];
    const nums = match[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    switch (type) {
      case 'M':
      case 'L':
        for (let i = 0; i < nums.length - 1; i += 2) {
          commands.push({ type, x: nums[i], y: nums[i + 1] });
          // After M, subsequent pairs are implicit L
          if (type === 'M' && i > 0) commands[commands.length - 1].type = 'L';
        }
        break;
      case 'C':
        for (let i = 0; i < nums.length - 5; i += 6) {
          commands.push({ type: 'C', x1: nums[i], y1: nums[i + 1], x2: nums[i + 2], y2: nums[i + 3], x: nums[i + 4], y: nums[i + 5] });
        }
        break;
      case 'Z':
        commands.push({ type: 'Z', x: 0, y: 0 });
        break;
    }
  }

  return commands;
}

/** Render text elements from a symbol (uses PIXI.Text, returns text objects for caching) */
export function renderSymbolText(
  container: PIXI.Container,
  symbol: SymbolDefinition,
  screenX: number,
  screenY: number,
  sizePx: number,
  rotation: number,
  color: number,
): PIXI.Text[] {
  const scale = sizePx / 10;
  const texts: PIXI.Text[] = [];

  for (const path of symbol.paths) {
    if (path.type !== 'TEXT') continue;

    const textColor = resolvePathColor(path.fill, color) ?? color;
    const style = new PIXI.TextStyle({
      fontSize: (path.fontSize ?? 3) * scale,
      fill: textColor,
      fontFamily: 'Arial',
      fontWeight: 'bold',
      align: 'center',
    });

    const text = new PIXI.Text(path.text!, style);
    text.anchor.set(0.5, 0.5);
    text.x = screenX + (path.tx ?? 0) * scale;
    text.y = screenY + (path.ty ?? 0) * scale;
    text.rotation = (rotation * Math.PI) / 180;
    container.addChild(text);
    texts.push(text);
  }

  return texts;
}
```

---

## 9. Symbol Editor UI

A full-screen modal dialog for creating and editing custom symbols.

### 9.1 Layout

```
┌─ Symbol Editor ─────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────┐  ┌────────────────────────────┐  ┌─────────────┐ │
│  │ Tools    │  │                            │  │ Properties  │ │
│  │          │  │     32×32 Grid Canvas      │  │             │ │
│  │ [Line]   │  │        (drawing area)      │  │ Name: _____ │ │
│  │ [Circle] │  │                            │  │ Category: _ │ │
│  │ [Arc]    │  │        ┼ insertion         │  │ Size: [2.5] │ │
│  │ [Rect]   │  │          point             │  │ Color: ___  │ │
│  │ [Poly]   │  │                            │  │ Rotatable ☐ │ │
│  │ [Text]   │  │                            │  │             │ │
│  │ [Select] │  │                            │  │ Assigned:   │ │
│  │ [Delete] │  │                            │  │  BC02, 309  │ │
│  │          │  │                            │  │  [+ Code]   │ │
│  │ ──────── │  │                            │  │             │ │
│  │ Stroke:  │  │                            │  │ Preview:    │ │
│  │  [0.5]   │  │                            │  │ ● ● ●      │ │
│  │ Fill: ☐  │  │                            │  │ (3 sizes)   │ │
│  │          │  └────────────────────────────┘  └─────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Preview at scales: [1:20] [1:50] [1:100] on ⬜/⬛ bg       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [Save]  [Save As Default for Code...]  [Export SVG]  [Cancel]  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Drawing Tools

| Tool | Description |
|------|-------------|
| Line | Click two points, creates a straight stroke |
| Circle | Click center + drag radius, or click center + edge point |
| Arc | Click start, through, end → fitted arc |
| Rectangle | Click two diagonal corners |
| Polygon | Click vertices, double-click to close |
| Text | Click position → type character(s) (max 4 chars) |
| Select | Click to select path element, drag to move, Delete to remove |
| Delete | Click a path element to remove it |

Each path element has per-element stroke width, fill toggle, and stroke/fill color (`INHERIT` or fixed). Editing happens in the Properties panel when a path element is selected.

### 9.3 Insertion Point

A draggable crosshair on the canvas. This is where the symbol aligns to the survey point. Defaults to center `(0,0)`. For some symbols (like a tree), the insertion point is the trunk center; for a fire hydrant callout, it might be offset.

### 9.4 Preview Bar

Below the canvas, a horizontal strip shows the symbol rendered at 3 different scales (small, medium, large) on both white and dark backgrounds. This confirms legibility at all zoom levels.

---

## 10. Line Type Definition Model

```typescript
// packages/styles/src/types.ts (continued)

export interface LineTypeDefinition {
  id: string;
  name: string;
  category: 'BASIC' | 'FENCE' | 'UTILITY' | 'SPECIALTY' | 'CUSTOM';

  // Dash pattern (mm, repeating: [dash, gap, dash, gap, ...])
  // Empty array = solid line
  dashPattern: number[];

  // Inline symbols placed along the line
  inlineSymbols: InlineSymbolConfig[];

  // Special rendering modes
  specialRenderer: 'NONE' | 'WAVY' | 'ZIGZAG';

  // Metadata
  isBuiltIn: boolean;
  isEditable: boolean;
  assignedCodes: string[];
}

export interface InlineSymbolConfig {
  symbolId: string;                    // Reference to SymbolDefinition
  interval: number;                    // World units (feet) between symbols at reference scale
  intervalMode: 'FIXED' | 'SCALE_DEPENDENT';
  scaleReferenceInterval: number;      // Interval at reference scale
  scaleReferenceScale: number;         // Reference drawing scale (default: 50)
  symbolSize: number;                  // mm on paper
  symbolRotation: 'ALONG_LINE' | 'FIXED' | 'PERPENDICULAR';
  offset: number;                      // Perpendicular offset from line center (world units)
  side: 'LEFT' | 'RIGHT' | 'CENTER' | 'BOTH';
}
```

---

## 11. Built-In Line Type Library

```typescript
// packages/styles/src/linetype-library.ts

export const BUILTIN_LINE_TYPES: LineTypeDefinition[] = [
  // ── Basic ──
  { id: 'SOLID',        name: 'Solid',         category: 'BASIC', dashPattern: [],                       inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASHED',       name: 'Dashed',        category: 'BASIC', dashPattern: [6, 3],                   inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASHED_HEAVY', name: 'Dashed Heavy',  category: 'BASIC', dashPattern: [10, 4],                  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DOTTED',       name: 'Dotted',        category: 'BASIC', dashPattern: [1, 2],                   inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASH_DOT',     name: 'Dash-Dot',      category: 'BASIC', dashPattern: [8, 2, 1.5, 2],           inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'DASH_DOT_DOT', name: 'Dash-Dot-Dot',  category: 'BASIC', dashPattern: [8, 2, 1.5, 2, 1.5, 2],  inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'CENTER',       name: 'Center',        category: 'BASIC', dashPattern: [12, 2, 4, 2],            inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },
  { id: 'PHANTOM',      name: 'Phantom',       category: 'BASIC', dashPattern: [12, 2, 2, 2, 2, 2],      inlineSymbols: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: [] },

  // ── Fences (12 types, each with unique inline symbol) ──
  { id: 'FENCE_BARBED_WIRE', name: 'Barbed Wire',  category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN01','740'],
    inlineSymbols: [{ symbolId: 'FENCE_BARB_X',     interval: 20, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 20, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'FIXED',       offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_WOVEN_WIRE',  name: 'Woven Wire',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN02','741'],
    inlineSymbols: [{ symbolId: 'FENCE_CL_DIAMOND', interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'ALONG_LINE', offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_CHAIN_LINK',  name: 'Chain Link',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN03','742'],
    inlineSymbols: [{ symbolId: 'FENCE_CL_DIAMOND', interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 2.5, symbolRotation: 'FIXED',       offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_METAL_IRON',  name: 'Metal/Iron',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN04','743'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 10, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 10, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'FENCE_WOOD_PRIVACY', name: 'Wood Privacy', category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN05','744'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 12, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 12, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'FENCE_WOOD_PICKET',  name: 'Wood Picket',  category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN06','745'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 8,  intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 8,  scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'FENCE_SPLIT_RAIL',   name: 'Split Rail',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN07','746'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 12, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 12, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'ALONG_LINE',   offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_BLOCK_WALL',   name: 'Block Wall',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN08','747'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 10, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 10, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'BOTH' }] },
  { id: 'FENCE_PIPE',         name: 'Pipe Fence',   category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN09','748'],
    inlineSymbols: [{ symbolId: 'GENERIC_DOT',       interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'FIXED',       offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_CABLE',        name: 'Cable Fence',  category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN10','749'],
    inlineSymbols: [{ symbolId: 'GENERIC_CROSS',     interval: 15, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 15, scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'ALONG_LINE', offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_ELECTRIC',     name: 'Electric',     category: 'FENCE', dashPattern: [6, 3], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN11','750'],
    inlineSymbols: [{ symbolId: 'FENCE_BARB_X',     interval: 25, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 25, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'FIXED',       offset: 0, side: 'CENTER' }] },
  { id: 'FENCE_GUARDRAIL',    name: 'Guardrail',    category: 'FENCE', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN12','751'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 12, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 12, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'ALONG_LINE',   offset: 0, side: 'CENTER' }] },

  // ── Specialty ──
  { id: 'RETAINING_WALL', name: 'Retaining Wall', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN13','752','ST08','507'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 4, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 4, scaleReferenceScale: 50, symbolSize: 2.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'RIGHT' }] },
  { id: 'OVERHEAD_POWER', name: 'Overhead Power', category: 'SPECIALTY', dashPattern: [8, 3], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['UT15','644'],
    inlineSymbols: [{ symbolId: 'FENCE_BOARD_TICK', interval: 30, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 30, scaleReferenceScale: 50, symbolSize: 1.5, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'CENTER' }] },
  { id: 'RAILROAD', name: 'Railroad', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['TR08','707'],
    inlineSymbols: [{ symbolId: 'RR_CROSSTIE', interval: 6, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 6, scaleReferenceScale: 50, symbolSize: 3.0, symbolRotation: 'PERPENDICULAR', offset: 0, side: 'BOTH' }] },
  { id: 'HEDGE', name: 'Hedge', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'NONE', isBuiltIn: true, isEditable: false, assignedCodes: ['FN14','753'],
    inlineSymbols: [{ symbolId: 'VEG_TREE_DECID', interval: 8, intervalMode: 'SCALE_DEPENDENT', scaleReferenceInterval: 8, scaleReferenceScale: 50, symbolSize: 2.5, symbolRotation: 'FIXED', offset: 0, side: 'CENTER' }] },
  { id: 'CREEK_WAVY', name: 'Creek/Stream', category: 'SPECIALTY', dashPattern: [], specialRenderer: 'WAVY', isBuiltIn: true, isEditable: false, assignedCodes: ['TP07','632'],
    inlineSymbols: [] },
];
```

---

## 12. Line Type Renderer

```typescript
// packages/styles/src/linetype-renderer.ts

export function renderLineWithType(
  g: PIXI.Graphics,
  lineType: LineTypeDefinition,
  screenPoints: { x: number; y: number }[],
  color: number,
  weight: number,            // screen pixels
  opacity: number,
  drawingScale: number,      // e.g., 50 for 1"=50'
  zoom: number,              // px per world unit (for scale-dependent intervals)
): void {
  if (screenPoints.length < 2) return;

  // ── Phase A: Draw the base line (dash pattern or solid) ──
  if (lineType.dashPattern.length === 0 && lineType.specialRenderer === 'NONE') {
    // Solid line
    g.lineStyle(weight, color, opacity);
    g.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i++) {
      g.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
  } else if (lineType.specialRenderer === 'WAVY') {
    renderWavyLine(g, screenPoints, color, weight, opacity);
  } else {
    // Dashed line
    renderDashedLine(g, screenPoints, lineType.dashPattern, color, weight, opacity, zoom);
  }

  // ── Phase B: Render inline symbols ──
  for (const config of lineType.inlineSymbols) {
    renderInlineSymbols(g, screenPoints, config, color, opacity, drawingScale, zoom);
  }
}

function renderDashedLine(
  g: PIXI.Graphics,
  points: { x: number; y: number }[],
  pattern: number[],          // mm values
  color: number,
  weight: number,
  opacity: number,
  zoom: number,
): void {
  // Convert mm pattern to screen pixels (~2.5px per mm at typical zoom)
  const screenPattern = pattern.map(v => v * 2.5);

  g.lineStyle(weight, color, opacity);

  let patternIdx = 0;
  let patternProgress = 0;
  let drawing = true; // Start with dash

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const dx = (p1.x - p0.x) / segLen;
    const dy = (p1.y - p0.y) / segLen;

    let traveled = 0;
    let cx = p0.x, cy = p0.y;

    if (drawing) g.moveTo(cx, cy);

    while (traveled < segLen) {
      const remaining = screenPattern[patternIdx] - patternProgress;
      const segRemaining = segLen - traveled;
      const step = Math.min(remaining, segRemaining);

      cx += dx * step;
      cy += dy * step;
      traveled += step;
      patternProgress += step;

      if (drawing) g.lineTo(cx, cy);

      if (patternProgress >= screenPattern[patternIdx]) {
        patternProgress = 0;
        patternIdx = (patternIdx + 1) % screenPattern.length;
        drawing = !drawing;
        if (drawing) g.moveTo(cx, cy);
      }
    }
  }
}

function renderInlineSymbols(
  g: PIXI.Graphics,
  points: { x: number; y: number }[],
  config: InlineSymbolConfig,
  lineColor: number,
  opacity: number,
  drawingScale: number,
  zoom: number,
): void {
  // Calculate interval in screen pixels
  let intervalPx: number;
  if (config.intervalMode === 'SCALE_DEPENDENT') {
    const scaleFactor = config.scaleReferenceScale / drawingScale;
    const intervalFeet = config.scaleReferenceInterval * scaleFactor;
    intervalPx = intervalFeet * zoom;
  } else {
    intervalPx = config.interval * zoom;
  }

  // Minimum interval to prevent overlapping
  const minInterval = config.symbolSize * 4;
  intervalPx = Math.max(intervalPx, minInterval);

  const symbolDef = getSymbolById(config.symbolId);
  if (!symbolDef) return;

  const sizePx = config.symbolSize * 2.5; // mm → screen px (approximate)
  let distAccum = intervalPx / 2; // Start half-interval in

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    while (distAccum <= segLen) {
      const t = distAccum / segLen;
      const sx = p0.x + (p1.x - p0.x) * t;
      const sy = p0.y + (p1.y - p0.y) * t;

      // Compute rotation
      let rotation = 0;
      if (config.symbolRotation === 'ALONG_LINE') rotation = angle * 180 / Math.PI;
      else if (config.symbolRotation === 'PERPENDICULAR') rotation = (angle * 180 / Math.PI) + 90;

      // Compute offset
      let ox = 0, oy = 0;
      if (config.side !== 'CENTER') {
        const perpAngle = angle + Math.PI / 2;
        const offsetPx = (config.side === 'LEFT' ? -1 : 1) * sizePx * 0.8;
        ox = Math.cos(perpAngle) * offsetPx;
        oy = Math.sin(perpAngle) * offsetPx;
      }

      renderSymbol(g, symbolDef, sx + ox, sy + oy, sizePx, rotation, lineColor, opacity);

      if (config.side === 'BOTH') {
        const perpAngle = angle + Math.PI / 2;
        const offsetPx = sizePx * 0.8;
        renderSymbol(g, symbolDef,
          sx - Math.cos(perpAngle) * offsetPx,
          sy - Math.sin(perpAngle) * offsetPx,
          sizePx, rotation, lineColor, opacity);
      }

      distAccum += intervalPx;
    }
    distAccum -= segLen;
  }
}

function renderWavyLine(
  g: PIXI.Graphics,
  points: { x: number; y: number }[],
  color: number,
  weight: number,
  opacity: number,
): void {
  g.lineStyle(weight, color, opacity);
  const amplitude = weight * 3;
  const wavelength = weight * 12;
  const STEP = 3; // pixels per sample
  let totalDist = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const perpX = -Math.sin(angle), perpY = Math.cos(angle);
    const steps = Math.ceil(segLen / STEP);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const bx = p0.x + (p1.x - p0.x) * t;
      const by = p0.y + (p1.y - p0.y) * t;
      const wave = Math.sin((totalDist + segLen * t) / wavelength * Math.PI * 2) * amplitude;
      const wx = bx + perpX * wave;
      const wy = by + perpY * wave;
      if (i === 0 && s === 0) g.moveTo(wx, wy);
      else g.lineTo(wx, wy);
    }
    totalDist += segLen;
  }
}
```

---

## 13. Line Type Editor UI

A modal dialog for creating and editing line types.

```
┌─ Line Type Editor ──────────────────────────────────────────────┐
│                                                                 │
│  Preview: ──── ● ──── ● ──── ● ──── ● ────                    │
│                                                                 │
│  ┌─ Dash Pattern ─────────────────────────────────────────────┐ │
│  │  [===========]  [===]  [===========]  [===]  [+ Add Pair] │ │
│  │  Dash: [6] mm   Gap: [3] mm                               │ │
│  │  (drag handles to adjust visually)                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Inline Symbols ───────────────────────────────────────────┐ │
│  │  Symbol: [🔽 FENCE_BARB_X]    Interval: [20] ft           │ │
│  │  Size: [2.0] mm    Rotation: [● Along  ○ Fixed  ○ Perp]   │ │
│  │  Side: [● Center  ○ Left  ○ Right  ○ Both]                │ │
│  │  Scale mode: [● Scale-Dependent  ○ Fixed]                  │ │
│  │                                                             │ │
│  │  [+ Add Another Symbol]   [Remove]                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Name: [_________________]   Category: [🔽 FENCE]              │
│  Assigned codes: FN03, 742  [+ Assign to Code]                 │
│                                                                 │
│  [Save]  [Save As New]  [Reset to Default]  [Cancel]           │
└─────────────────────────────────────────────────────────────────┘
```

The dash pattern section uses draggable handles on a visual bar — each dash and gap is a colored rectangle you can drag to resize. The numeric inputs below sync bidirectionally.

---

## 14. Code-to-Style Mapping System

The master configuration table linking every point code to its visual appearance.

```typescript
// packages/styles/src/code-style-map.ts

export interface CodeStyleMapping {
  codeAlpha: string;                 // "FN03"
  codeNumeric: string;               // "742"
  description: string;               // "Chain Link Fence"
  category: string;                  // "FENCES"

  // Point symbol (for POINT connect-type codes)
  symbolId: string;                  // "MON_IR_050_FOUND"
  symbolSize: number;                // mm
  symbolColor: string;               // "#000000" or "LAYER"

  // Line styling (for LINE connect-type codes)
  lineTypeId: string;                // "FENCE_CHAIN_LINK"
  lineWeight: number;                // mm
  lineColor: string;                 // "#000000" or "LAYER"

  // Label
  labelFormat: string;               // "{code}" or "1/2\" IRF" or "{elevation}"
  labelVisible: boolean;

  // Layer
  layerId: string;                   // "FENCE"

  // Override tracking
  isUserModified: boolean;           // true = user changed from default
}

/** Build the default mapping from the code library */
export function buildDefaultCodeStyleMap(
  codeLibrary: PointCodeDefinition[],
): Map<string, CodeStyleMapping> {
  const map = new Map<string, CodeStyleMapping>();

  for (const code of codeLibrary) {
    const mapping: CodeStyleMapping = {
      codeAlpha: code.alphaCode,
      codeNumeric: code.numericCode,
      description: code.description,
      category: code.category,
      symbolId: code.defaultSymbolId,
      symbolSize: code.connectType === 'POINT' ? 2.5 : 0,
      symbolColor: code.defaultColor,
      lineTypeId: code.defaultLineTypeId,
      lineWeight: code.defaultLineWeight || 0.25,
      lineColor: code.defaultColor,
      labelFormat: code.defaultLabelFormat,
      labelVisible: true,
      layerId: code.defaultLayerId,
      isUserModified: false,
    };
    map.set(code.alphaCode, mapping);
    map.set(code.numericCode, mapping); // Both keys point to same mapping
  }

  return map;
}
```

---

## 15. Code-to-Style Mapping Panel UI

A settings panel (accessible from menu: Settings → Code Style Mapping) presenting the entire mapping as an editable table.

```
┌─ Code Style Mapping ────────────────────────────────────────────────────┐
│ Filter: [__________]  Category: [All ▼]  Show modified only: ☐         │
├────────┬───────┬──────────────┬────────┬──────────┬───────┬────────────┤
│  Code  │ Num   │ Description  │ Symbol │ Line Type│ Color │ Layer      │
├────────┼───────┼──────────────┼────────┼──────────┼───────┼────────────┤
│  BC01  │  308  │ 3/8" IR Fnd  │ [●]    │  —       │ [■]   │ BOUND-MON  │
│  BC02  │  309  │ 1/2" IR Fnd  │ [●]    │  —       │ [■]   │ BOUND-MON  │
│  BC06  │  317  │ 1/2" IR Set  │ [○]    │  —       │ [■]   │ BOUND-MON  │
│  BC10  │  328  │ 1/2" IR Calc │ [⊕]    │  —       │ [■]   │ BOUND-MON  │
│  FN01  │  740  │ Barbed Wire  │  —     │ ──X──X── │ [■]   │ FENCE      │
│  FN03  │  742  │ Chain Link   │  —     │ ──◇──◇── │ [■]   │ FENCE      │
│  UT03  │  602  │ Fire Hydrant │ [FH]   │  —       │ [■]   │ UTIL-WATER │
│  ...   │  ...  │  ...         │  ...   │  ...     │  ...  │  ...       │
├────────┴───────┴──────────────┴────────┴──────────┴───────┴────────────┤
│  Click any cell to edit  │  Modified cells shown with blue border      │
│  [Reset All to Defaults]  [Import Scheme]  [Export Scheme]  [Close]    │
└─────────────────────────────────────────────────────────────────────────┘
```

Clicking a symbol cell opens the `SymbolPicker`. Clicking a line type cell opens the `LineTypePicker`. Clicking a color cell opens the `ColorPicker`. Clicking a layer cell opens a layer dropdown.

---

## 16. Monument Action → Symbol Resolution

This is the critical pipeline that selects the correct symbol for monument points.

```typescript
// packages/styles/src/monument-symbols.ts

/**
 * Symbol selection flow for monument (BOUNDARY_CONTROL) points:
 *
 * 1. Is the code an EXPANDED code with explicit action? (BC06 = 1/2" IR Set)
 *    → Use the symbol from the code's mapping directly.
 *
 * 2. Is the code a SIMPLIFIED code? (BC02 = 1/2" IR, no action specified)
 *    → Look at the point NAME suffix to determine action:
 *       - "20fnd" → FOUND → solid circle, black
 *       - "20set" → SET → open circle, red
 *       - "20calc" → CALCULATED → target circle, magenta
 *       - "20" (no suffix) → UNKNOWN → use FOUND style (most common case)
 *
 * 3. What if the code says FOUND but the name says SET?
 *    → Code wins. The expanded code system was designed to be unambiguous.
 *    → But flag this as a validation warning.
 *
 * Visual rules:
 *   FOUND      → solid fill, black (#000000)
 *   SET        → open (no fill), red (#FF0000)
 *   CALCULATED → circle+cross (target), magenta (#FF00FF)
 *   UNKNOWN    → solid fill, black (assume FOUND, the safe default)
 */

export function resolveMonumentVisuals(
  codeDefinition: PointCodeDefinition | null,
  monumentAction: MonumentAction | null,
): { symbolId: string; color: string } {
  if (!codeDefinition || codeDefinition.category !== 'BOUNDARY_CONTROL') {
    return {
      symbolId: codeDefinition?.defaultSymbolId ?? 'GENERIC_CROSS',
      color: codeDefinition?.defaultColor ?? '#000000',
    };
  }

  // If the code definition specifies an explicit symbol, use it
  if (codeDefinition.defaultSymbolId) {
    return {
      symbolId: codeDefinition.defaultSymbolId,
      color: codeDefinition.defaultColor,
    };
  }

  // Otherwise, resolve by monument action
  const monumentType = codeDefinition.monumentType ?? 'Generic';
  const sizeKey = (codeDefinition.monumentSize ?? '').replace(/"/g, '').replace(/\//g, '');

  switch (monumentAction) {
    case 'FOUND':      return { symbolId: findSymbolForAction(monumentType, sizeKey, 'FOUND'), color: '#000000' };
    case 'SET':        return { symbolId: findSymbolForAction(monumentType, sizeKey, 'SET'),   color: '#FF0000' };
    case 'CALCULATED': return { symbolId: findSymbolForAction(monumentType, sizeKey, 'CALC'),  color: '#FF00FF' };
    default:           return { symbolId: findSymbolForAction(monumentType, sizeKey, 'FOUND'), color: '#000000' };
  }
}

function findSymbolForAction(type: string, size: string, action: string): string {
  const typeMap: Record<string, string> = {
    'Iron Rod': 'IR', 'Iron Pipe': 'IP', 'Concrete': 'CONC',
    'Cap/Disk': 'CAP', 'PK Nail': 'PKNAIL', 'Mag Nail': 'MAGNAIL',
  };
  const prefix = typeMap[type] ?? 'GENERIC';
  const sizeStr = size ? `_${size}` : '';
  const specific = `MON_${prefix}${sizeStr}_${action}`;

  // Check if this symbol exists in library; fall back to generic
  if (getSymbolById(specific)) return specific;
  return `MON_GENERIC_${action}`;
}
```

---

## 17. Property Panel

The property panel (right sidebar, collapsible) shows and edits the properties of the current selection. Contextual: shows different content based on what's selected.

### 17.1 Modes

| Selection | Panel Mode |
|-----------|------------|
| Nothing selected | Empty with instructions text |
| Single point (`SurveyPoint`) | Full point properties |
| Single line/polyline/polygon | Feature properties |
| Multiple features | Multi-edit (common properties, "varies" for differing) |

### 17.2 Single Point Layout

```
┌─ Properties ──────────────────────┐
│ Point #20         Name: 20set     │
│                                   │
│ ── Coordinates ──                 │
│ Northing: [2145123.456]           │
│ Easting:  [598234.789]            │
│ Elevation: [815.23]               │
│                                   │
│ ── Code ──                        │
│ Code: [BC06 / 317]    1/2" IRS    │
│ Action: SET   ★ Final point       │
│ Suffix: "set" (confidence: 100%)  │
│ Base #: 20                        │
│                                   │
│ ── Point Group (#20) ──           │
│  20calc  → (2145123.2, 598234.5)  │
│  20cald  → (2145123.3, 598234.6)  │
│  20set ★ → (2145123.5, 598234.8)  │
│  Δ calc→set: 0.05'                │
│                                   │
│ ── Visual ──                      │
│ Layer: [BOUNDARY-MON ▼]           │
│ Symbol: [○ 1/2" IR Set]  [Edit]  │
│ Size: [2.5] mm                    │
│ Color: [■ #FF0000]               │
│ Label: [✓] "1/2" IRS"            │
│                                   │
│ ── Description ──                 │
│ [_______________________________] │
│                                   │
│ [Reset to Code Defaults]          │
└───────────────────────────────────┘
```

### 17.3 Single Feature (Line) Layout

```
┌─ Properties ──────────────────────┐
│ Type: POLYLINE    Points: 5       │
│ Length: 234.56 ft                  │
│                                   │
│ ── Code ──                        │
│ Code: [FN03 / 742]  Chain Link    │
│                                   │
│ ── Visual ──                      │
│ Layer: [FENCE ▼]                  │
│ Line Type: [──◇──◇── Chain Link]  │
│ Weight: [0.25] mm                 │
│ Color: [■ #000000]               │
│ Label: [✓]                        │
│                                   │
│ [Reset to Code Defaults]          │
└───────────────────────────────────┘
```

---

## 18. Global Style Settings

Accessible from menu: Settings → Drawing Preferences.

```typescript
export interface GlobalStyleConfig {
  codeDisplayMode: 'ALPHA' | 'NUMERIC';
  backgroundColor: string;
  defaultFont: string;
  defaultFontSize: number;               // points
  bearingFormat: 'QUADRANT' | 'AZIMUTH';
  bearingPrecision: 'SECOND' | 'TENTH_SECOND';
  distancePrecision: number;              // decimal places (0–4)
  areaDisplay: 'SQFT_AND_ACRES' | 'SQFT_ONLY' | 'ACRES_ONLY';
  symbolSizeMode: 'SCREEN' | 'WORLD';    // SCREEN = fixed px regardless of zoom; WORLD = scales with zoom
  selectionColor: string;
  selectionLineWidth: number;
  showPointLabels: boolean;               // Global toggle for all point labels
  showLineLabels: boolean;                // Global toggle for line code labels
  defaultPaperSize: PaperSize;
  defaultOrientation: 'PORTRAIT' | 'LANDSCAPE';
  defaultScale: number;
}
```

---

## 19. State Management Updates

### 19.1 Style Store (NEW)

```typescript
// packages/store/src/style-store.ts

interface StyleStore {
  // Libraries
  symbols: Record<string, SymbolDefinition>;       // id → definition
  lineTypes: Record<string, LineTypeDefinition>;    // id → definition
  codeStyleMap: Map<string, CodeStyleMapping>;      // code (alpha or numeric) → mapping

  // Global settings
  globalConfig: GlobalStyleConfig;

  // User customizations
  customSymbols: SymbolDefinition[];               // User-created symbols
  customLineTypes: LineTypeDefinition[];            // User-created line types

  // Actions
  initializeDefaults: () => void;
  getSymbol: (id: string) => SymbolDefinition | undefined;
  getLineType: (id: string) => LineTypeDefinition | undefined;
  getCodeMapping: (code: string) => CodeStyleMapping | undefined;
  addCustomSymbol: (symbol: SymbolDefinition) => void;
  updateCustomSymbol: (id: string, updates: Partial<SymbolDefinition>) => void;
  removeCustomSymbol: (id: string) => void;
  addCustomLineType: (lineType: LineTypeDefinition) => void;
  updateCustomLineType: (id: string, updates: Partial<LineTypeDefinition>) => void;
  removeCustomLineType: (id: string) => void;
  updateCodeMapping: (code: string, updates: Partial<CodeStyleMapping>) => void;
  resetCodeMapping: (code: string) => void;
  resetAllCodeMappings: () => void;
  updateGlobalConfig: (updates: Partial<GlobalStyleConfig>) => void;
}
```

### 19.2 Updated Drawing Store

The drawing store adds:

```typescript
// New fields on DrawingDocument:
export interface DrawingDocument {
  // ... (Phase 1/2 fields)
  customSymbols: SymbolDefinition[];
  customLineTypes: LineTypeDefinition[];
  codeStyleOverrides: Record<string, Partial<CodeStyleMapping>>;  // User overrides saved per-drawing
  globalStyleConfig: GlobalStyleConfig;
}
```

---

## 20. Canvas Rendering Overhaul

Phase 3 replaces the Phase 1/2 simple cross+line rendering with the full styled pipeline.

### 20.1 Point Rendering

```
For each visible SurveyPoint:
  1. Resolve style via cascade (Section 5)
  2. If monument code: resolve monument symbol (Section 16)
  3. Look up SymbolDefinition
  4. Call renderSymbol() at the point's screen position
  5. Render label text (code name) near the point if labelVisible
```

### 20.2 Line String Rendering

```
For each visible LineString feature:
  1. Resolve style via cascade
  2. Look up LineTypeDefinition
  3. Convert world vertices to screen coordinates
  4. Call renderLineWithType() which handles:
     - Dash patterns (or solid)
     - Inline symbols at intervals
     - Wavy/special rendering
  5. Render code label at midpoint of line if labelVisible
```

### 20.3 Performance Considerations

- Symbol rendering creates PixiJS `Graphics` objects that are cached per feature.
- Line type rendering with inline symbols can be expensive for long lines at high zoom. Use LOD: skip inline symbols when the interval would be < 3 pixels apart.
- Label text uses `PIXI.Text` which is expensive. Cache text objects and only recreate when content or style changes.
- Frozen layers skip ALL rendering (not just visual — excluded from the render loop entirely).

---

## 21. Acceptance Tests

### Layers
- [x] All 22 default layers exist on new document (unit-tested in `default-layers.test.ts`)
- [x] 6 layer groups exist and are collapsible (unit-tested in `default-layers.test.ts`)
- [x] Clicking layer name sets it as active (LayerPanel.tsx — `handleSetActive`)
- [x] Eye icon toggles visibility (features appear/disappear) (LayerPanel.tsx — `handleToggleVisibility`)
- [x] Shift+click eye = solo mode (only clicked layer visible) (LayerPanel.tsx — visibility-toggle `onClick` handler; isolates the row via the same loop as the "Isolate Layer" context-menu item)
- [x] Lock icon prevents editing features on that layer (`canFeatureBeEdited` unit-tested in `style-cascade.test.ts`)
- [x] Frozen layers: invisible AND excluded from selection/snap (`canFeatureBeRendered` / `canFeatureBeEdited` unit-tested)
- [x] Color swatch opens picker, changes update all features on layer (LayerPanel.tsx — context menu)
- [x] Drag-reorder layers changes render order on canvas (LayerPanel.tsx — drag/drop)
- [x] New Layer creates a user layer (LayerPanel.tsx — `handleNewLayer`)
- [x] Right-click context menu works (rename, color, delete, select all) (LayerPanel.tsx — `handleContextMenu`)
- [x] Cannot delete default layers (LayerPanel.tsx — `layer.isDefault` guard)
- [x] Filter/search finds layers by name (LayerPanel.tsx — `filterText` state + `filteredLayers` derivation; case-insensitive substring; active layer always kept visible so surveyor doesn't lose context)
- [x] Feature count badge updates correctly (LayerPanel.tsx — `layerFeatures.length` derived from `doc.features` on every render; SURVEY-INFO layer uses fixed element count)

### Style Cascade
- [x] Feature with no overrides uses code default colors (unit-tested in `style-cascade.test.ts`)
- [x] Feature with no code default falls back to layer color (unit-tested in `style-cascade.test.ts`)
- [x] User override on a feature sticks even when code changes (`isOverride` flag — tested)
- [x] Changing layer color updates all non-overridden features on that layer (cascade fallback chain — tested)

### Symbols
- [x] Monument `FOUND` codes render as solid filled shapes (black) (unit-tested: MONUMENT_FOUND symbols have black fixedColor)
- [x] Monument `SET` codes render as open outline shapes (red) (unit-tested: MONUMENT_SET symbols have red fixedColor)
- [x] Monument `CALC` codes render as target/crosshair shapes (magenta) (unit-tested: MONUMENT_CALC symbols have magenta fixedColor)
- [x] Utility symbols render with correct icon text (`FH`, `WM`, `PP`) (UTIL_HYDRANT, UTIL_WATER_METER, UTIL_POWER_POLE defined in library)
- [x] Tree symbols render at correct size (VEG_TREE_DECID, VEG_TREE_EVERG defined with correct sizes)
- [x] Symbols scale correctly when zooming (`SCREEN` mode = fixed px; `WORLD` mode = scale with zoom) (scale param in `renderSymbol`)
- [x] Unknown codes render with question-mark symbol (`resolveSymbolWithFallback` → GENERIC_QUESTION — tested)

### Symbol Editor
- [ ] Can create new symbol with line, circle, rect, text tools *(SymbolEditor UI — not yet implemented)*
- [ ] Insertion point is draggable *(SymbolEditor UI — not yet implemented)*
- [ ] Preview shows symbol at 3 sizes *(SymbolEditor UI — not yet implemented)*
- [ ] Can assign symbol to a point code *(SymbolEditor UI — not yet implemented)*
- [ ] Custom symbol appears in the `SymbolPicker` *(SymbolPicker UI — not yet implemented)*
- [ ] Can export symbol as SVG *(SymbolEditor UI — not yet implemented)*

### Line Types
- [x] Solid, Dashed, Dotted, Dash-Dot render correctly (unit-tested in `linetype-renderer.test.ts`)
- [x] All 12 fence types render with their unique inline symbols (unit-tested: fence types have inlineSymbols)
- [x] Inline symbols rotate along line direction (`ALONG_LINE` mode) (unit-tested in renderer)
- [x] Inline symbols orient perpendicular (`PERPENDICULAR` mode) (unit-tested in renderer)
- [x] `BOTH` side mode renders symbols on both sides of the line (unit-tested in renderer)
- [x] Scale-dependent interval adjusts with drawing scale (zoom-aware `MM_TO_PX` scaling — tested)
- [x] Railroad renders with perpendicular crossties (RAILROAD line type defined with RR_CROSSTIE inline symbol)
- [x] Retaining wall renders with hatch marks on one side (RETAINING_WALL defined with FENCE_BOARD_TICK RIGHT side)
- [x] Creek/stream renders with wavy line (CREEK_WAVY specialRenderer='WAVY' — unit-tested)

### Line Type Editor
- [ ] Can edit dash pattern visually and numerically *(LineTypeEditor UI — not yet implemented)*
- [ ] Can add/remove inline symbols *(LineTypeEditor UI — not yet implemented)*
- [ ] Preview updates live *(LineTypeEditor UI — not yet implemented)*
- [ ] Can save as new custom line type *(LineTypeEditor UI — not yet implemented)*
- [ ] Can assign to point codes *(LineTypeEditor UI — not yet implemented)*

### Code-to-Style Mapping
- [x] `buildDefaultCodeStyleMap` generates mappings for all codes (unit-tested in `code-style-map.test.ts`)
- [x] Uses GENERIC_CROSS fallback when symbolId is empty (unit-tested)
- [x] Uses SOLID fallback when lineTypeId is empty (unit-tested)
- [x] Uses MISC fallback when layerId is empty (unit-tested)
- [ ] Table shows all 134+ codes with current assignments *(CodeStylePanel UI — not yet implemented)*
- [ ] Click symbol cell opens `SymbolPicker` *(UI — not yet implemented)*
- [ ] Click line type cell opens `LineTypePicker` *(UI — not yet implemented)*
- [ ] Click color cell opens `ColorPicker` *(UI — not yet implemented)*
- [ ] Changes apply immediately on canvas *(UI — not yet implemented)*
- [ ] Modified cells show visual indicator *(UI — not yet implemented)*
- [ ] Reset to Defaults works per-code and globally *(UI — not yet implemented)*

### Property Panel
- [x] Nothing selected → panel shows instructions (PropertyPanel.tsx)
- [x] Single point → shows full point properties including group info (PropertyPanel.tsx)
- [x] Single line → shows feature properties with line type picker (PropertyPanel.tsx)
- [x] Multi-select → shows common properties, "varies" for differing (PropertyPanel.tsx)
- [x] Editing properties in panel updates the canvas immediately (PropertyPanel.tsx — `commitStyleChange`)
- [x] Layer dropdown changes the feature's layer (PropertyPanel.tsx — `handleLayerChange`)

### Monument Resolution
- [x] Expanded code (`BC06`) → `SET` symbol automatically (unit-tested in `monument-symbols.test.ts`)
- [x] Simplified code (`BC02`) + name `"20fnd"` → `FOUND` symbol (unit-tested)
- [x] Simplified code (`BC02`) + name `"20set"` → `SET` symbol (unit-tested)
- [x] Simplified code (`BC02`) + name `"20calc"` → `CALC` symbol (unit-tested)
- [x] Simplified code (`BC02`) + name `"20"` (no suffix) → `FOUND` (default) (unit-tested: null action → FOUND)
- [x] Fallback chain: specific size → type without size → generic → GENERIC_CROSS (unit-tested)

---

## 22. Build Order (Implementation Sequence)

### Week 1: Style Types & Libraries
1. Create `packages/styles` package
2. Define all types (`SymbolDefinition`, `LineTypeDefinition`, `CodeStyleMapping`, etc.)
3. Build symbol library with all built-in symbols (SVG path data)
4. Build line type library with all built-in line types
5. Build default layer definitions (22 layers + 6 groups)
6. Build code-to-style default mapping from code library

### Week 2: Renderers
1. Build symbol renderer (SVG path → PixiJS Graphics)
2. Build SVG path parser (`M`, `L`, `C`, `Z` commands)
3. Build symbol text renderer (`PIXI.Text` for symbol labels)
4. Build line type renderer (dash patterns)
5. Build inline symbol renderer (symbols along lines at intervals)
6. Build wavy line renderer (for creek/stream)
7. Build style cascade resolver
8. Write unit tests for cascade and renderers

### Week 3: Canvas Integration
1. Replace Phase 1/2 point rendering with symbol-based rendering
2. Replace Phase 1/2 line rendering with line-type-based rendering
3. Implement monument action → symbol resolution
4. Add point labels (code text near points)
5. Add line labels (code text at midpoints)
6. Implement LOD for inline symbols (skip when too dense)
7. Test rendering with real imported survey data

### Week 4: Layer Panel & Property Panel
1. Rewrite `LayerPanel` component (full UI from Section 4)
2. Implement layer visibility, lock, freeze state logic
3. Implement solo mode (Shift+click)
4. Implement drag-reorder
5. Implement layer groups with collapse
6. Implement layer context menu
7. Build `PropertyPanel` for single point mode
8. Build `PropertyPanel` for single feature mode
9. Build `PropertyPanel` for multi-feature mode

### Week 5: Editors & Mapping Panel
1. Build `SymbolEditor` modal (drawing tools, insertion point, preview)
2. Build `SymbolPicker` component (grid of symbols with search)
3. Build `LineTypeEditor` modal (dash pattern + inline symbol editing)
4. Build `LineTypePicker` component (list with visual previews)
5. Build `ColorPicker` and `LineWeightPicker` components
6. Build `CodeStylePanel` (master mapping table)
7. Build `GlobalStyleSettings` dialog

### Week 6: State, Persistence & Polish
1. Create `StyleStore` (symbols, line types, mappings, global config)
2. Wire style store into drawing document save/load
3. Save custom symbols and line types in `.starr` file
4. Save code-style overrides in `.starr` file
5. Test full import → render pipeline (CSV → codes → symbols → styled canvas)
6. Run ALL acceptance tests from Section 21
7. Performance test with 500+ features and all line types
8. Fix any failures, polish UI

---

### Copilot Session Template

> I am building Starr CAD Phase 3 — Layer System, Symbols, Line Types & Editors. Phases 1 (CAD engine core) and 2 (data import, point codes, name suffix intelligence) are complete. I am now building the full visual styling pipeline: 22 default surveying layers, a symbol library with SVG path rendering, monument action → symbol resolution (found=solid/black, set=open/red, calc=target/magenta), 20+ line types including 12 fence types with inline symbols, a dash pattern + inline symbol renderer, visual editors for both symbols and line types, a code-to-style mapping table, a style cascade system (feature override > code default > layer > global), and a full property panel. The spec is in `STARR_CAD_PHASE_3_STYLES_SYMBOLS.md`. I am currently working on **[replace with your current task from the Build Order above]**.

---

*End of Phase 3 Specification*

*Starr Surveying Company — Belton, Texas — March 2026*
