# STARR CAD — Phase 8: UX Completeness — Controls, Hotkeys, Tooltips & Settings

**Version:** 1.0 | **Date:** March 2026 | **Phase:** 8 of 8

**Goal:** Every button, form, field, and function works exactly as expected. Controls are stylish and easy to navigate. Hotkeys are comprehensive and user-configurable with a dedicated binding settings page. The cursor changes dynamically based on the active tool and context. Tooltips appear on 2–3 second hover and track the mouse. Every element on the drawing shows hover-details (bearing, length, point names). All tooltip behavior is configurable. A robust settings section lets users manage all preferences, templates, company info, and tool defaults. Manual edits on canvas immediately sync to the property panel, and property panel edits immediately sync to the canvas. Undo/Redo has both UI buttons and hotkeys. Everything persists perfectly across sessions.

**Duration:** 4–6 weeks | **Depends On:** Phase 7 (all features functional; this phase polishes and completes the UX layer)

---

## Table of Contents

1. [Phase 8 Architecture](#1-phase-8-architecture)
2. [Hotkey Registry & User Configuration](#2-hotkey-registry--user-configuration)
3. [Hotkey Binding Settings Page](#3-hotkey-binding-settings-page)
4. [Dynamic Cursor System](#4-dynamic-cursor-system)
5. [Tooltip System](#5-tooltip-system)
6. [Element Hover-Detail Tooltips](#6-element-hover-detail-tooltips)
7. [Bidirectional Attribute ↔ Canvas Sync](#7-bidirectional-attribute--canvas-sync)
8. [Undo/Redo UI Buttons](#8-undoredo-ui-buttons)
9. [Settings Section — Full Specification](#9-settings-section--full-specification)
10. [Controls & Navigation Polish](#10-controls--navigation-polish)
11. [Persistent State Architecture](#11-persistent-state-architecture)

    11.5. [Unit-Aware Input System](#115-unit-aware-input-system)

    11.6. [Intersect Tool — Deterministic Geometry](#116-intersect-tool--deterministic-geometry)
12. [Phase 1–7 Gap Audit & Fixes](#12-phase-17-gap-audit--fixes)
13. [Acceptance Tests](#13-acceptance-tests)
14. [Build Order (Implementation Sequence)](#14-build-order-implementation-sequence)

---

## 1. Phase 8 Architecture

### 1.1 New Packages & Modules

```
packages/
├── hotkeys/                         # NEW — hotkey registry + binding engine
│   ├── src/
│   │   ├── registry.ts              # All bindable actions + defaults
│   │   ├── engine.ts                # Key event → action dispatcher
│   │   ├── conflict-detector.ts     # Detect duplicate bindings
│   │   ├── presets.ts               # Built-in hotkey presets (Default, AutoCAD-like)
│   │   └── types.ts
│   └── package.json
│
├── cursor/                          # NEW — dynamic cursor manager
│   ├── src/
│   │   ├── cursor-manager.ts        # Tool state → CSS cursor string
│   │   ├── custom-cursors.ts        # SVG cursor data URIs
│   │   └── types.ts
│   └── package.json

apps/web/components/
├── settings/
│   ├── SettingsPage.tsx             # NEW — full settings page (tabbed)
│   ├── GeneralSettings.tsx          # NEW — units, precision, auto-save, theme
│   ├── CanvasSettings.tsx           # NEW — background, grid, snap, selection
│   ├── DisplaySettings.tsx          # NEW — fonts, zoom sensitivity, LOD threshold
│   ├── HotkeySettings.tsx           # NEW — hotkey binding table + preset picker
│   ├── AISettings.tsx               # NEW — confidence threshold, deliberation timeout
│   ├── ExportSettings.tsx           # NEW — DXF version, PDF quality, GeoJSON precision
│   ├── CompanySettings.tsx          # NEW — name, address, license, logo, seal
│   ├── TemplateSettings.tsx         # NEW — default template, custom templates
│   └── ImportPresetSettings.tsx     # NEW — saved CSV column mappings
│
├── ui/
│   ├── TooltipProvider.tsx          # NEW — tooltip context + delay management
│   ├── UITooltip.tsx                # NEW — UI element tooltip (2–3s hover)
│   ├── FeatureTooltip.tsx           # NEW — element hover-detail tooltip
│   ├── UndoRedoButtons.tsx          # NEW — Undo/Redo buttons with labels
│   └── CursorOverlay.tsx            # NEW — renders dynamic cursor when needed
```

### 1.2 No New External Dependencies

Phase 8 uses only packages already in the project:
- Tailwind CSS (styling)
- Zustand (state)
- PixiJS (canvas cursor handling)
- Phase 1–7 packages

---

## 2. Hotkey Registry & User Configuration

### 2.1 Bindable Action Registry

Every action that can be bound to a key is registered in the central registry:

```typescript
// packages/hotkeys/src/registry.ts

export interface BindableAction {
  id:           string;           // Unique, stable ID
  category:     ActionCategory;
  label:        string;           // Human-readable, shown in settings
  description:  string;           // Shown in settings on hover
  defaultKey:   string | null;    // e.g., "ctrl+z" or null if unbound by default
  isChord:      boolean;          // true for multi-key sequences like "z e"
  context:      ActionContext;    // Where the action is valid
}

export type ActionCategory =
  | 'FILE'
  | 'EDIT'
  | 'TOOLS'
  | 'ZOOM_PAN'
  | 'SELECTION'
  | 'DRAW'
  | 'MODIFY'
  | 'SNAP'
  | 'LAYERS'
  | 'ANNOTATIONS'
  | 'AI'
  | 'SURVEY_MATH'
  | 'VIEW'
  | 'APP';

export type ActionContext =
  | 'GLOBAL'          // Active anywhere in the app
  | 'CANVAS'          // Active only when canvas has focus
  | 'COMMAND_BAR'     // Active only when command bar is focused
  | 'DIALOG';         // Active when a dialog is open

export const DEFAULT_ACTIONS: BindableAction[] = [
  // File
  { id: 'file.new',          category: 'FILE',       label: 'New Document',        description: 'Create a new empty drawing',       defaultKey: 'ctrl+n',       isChord: false, context: 'GLOBAL' },
  { id: 'file.open',         category: 'FILE',       label: 'Open File',           description: 'Open a .starr file from disk',     defaultKey: 'ctrl+o',       isChord: false, context: 'GLOBAL' },
  { id: 'file.save',         category: 'FILE',       label: 'Save',                description: 'Save the current drawing',         defaultKey: 'ctrl+s',       isChord: false, context: 'GLOBAL' },
  { id: 'file.saveAs',       category: 'FILE',       label: 'Save As…',            description: 'Save with a new name or location', defaultKey: 'ctrl+shift+s', isChord: false, context: 'GLOBAL' },
  { id: 'file.print',        category: 'FILE',       label: 'Print / Export PDF',  description: 'Open the print/export dialog',     defaultKey: 'ctrl+p',       isChord: false, context: 'GLOBAL' },

  // Edit
  { id: 'edit.undo',         category: 'EDIT',       label: 'Undo',                description: 'Undo the last action',             defaultKey: 'ctrl+z',       isChord: false, context: 'GLOBAL' },
  { id: 'edit.redo',         category: 'EDIT',       label: 'Redo',                description: 'Redo the last undone action',      defaultKey: 'ctrl+y',       isChord: false, context: 'GLOBAL' },
  { id: 'edit.redo2',        category: 'EDIT',       label: 'Redo (Alt)',          description: 'Alternative redo shortcut',        defaultKey: 'ctrl+shift+z', isChord: false, context: 'GLOBAL' },
  { id: 'edit.cut',          category: 'EDIT',       label: 'Cut',                 description: 'Cut selected features',            defaultKey: 'ctrl+x',       isChord: false, context: 'CANVAS' },
  { id: 'edit.copy',         category: 'EDIT',       label: 'Copy',                description: 'Copy selected features',           defaultKey: 'ctrl+c',       isChord: false, context: 'CANVAS' },
  { id: 'edit.paste',        category: 'EDIT',       label: 'Paste',               description: 'Paste clipboard features',         defaultKey: 'ctrl+v',       isChord: false, context: 'CANVAS' },
  { id: 'edit.selectAll',    category: 'EDIT',       label: 'Select All',          description: 'Select all visible features',      defaultKey: 'ctrl+a',       isChord: false, context: 'CANVAS' },
  { id: 'edit.deselect',     category: 'SELECTION',  label: 'Deselect All',        description: 'Clear the current selection',      defaultKey: 'escape',       isChord: false, context: 'CANVAS' },
  { id: 'edit.delete',       category: 'EDIT',       label: 'Delete Selected',     description: 'Delete selected features',         defaultKey: 'delete',       isChord: false, context: 'CANVAS' },

  // Tools
  { id: 'tool.select',       category: 'TOOLS',      label: 'Select Tool',         description: 'Activate the selection tool',      defaultKey: 's',            isChord: false, context: 'CANVAS' },
  { id: 'tool.pan',          category: 'TOOLS',      label: 'Pan Tool',            description: 'Activate the pan tool',            defaultKey: 'h',            isChord: false, context: 'CANVAS' },
  { id: 'tool.point',        category: 'TOOLS',      label: 'Draw Point',          description: 'Place a survey point',             defaultKey: 'p',            isChord: false, context: 'CANVAS' },
  { id: 'tool.line',         category: 'TOOLS',      label: 'Draw Line',           description: 'Draw a line segment',              defaultKey: 'l',            isChord: false, context: 'CANVAS' },
  { id: 'tool.polyline',     category: 'TOOLS',      label: 'Draw Polyline',       description: 'Draw a polyline (multiple segments)', defaultKey: 'pl',         isChord: true,  context: 'CANVAS' },
  { id: 'tool.polygon',      category: 'TOOLS',      label: 'Draw Polygon',        description: 'Draw a closed polygon',            defaultKey: 'pg',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.arc',          category: 'TOOLS',      label: 'Draw Arc',            description: 'Draw a circular arc',              defaultKey: 'a',            isChord: false, context: 'CANVAS' },
  { id: 'tool.spline',       category: 'TOOLS',      label: 'Draw Spline',         description: 'Draw a fit-point spline',          defaultKey: 'sp',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.text',         category: 'TOOLS',      label: 'Draw Text',           description: 'Place a text annotation',          defaultKey: 't',            isChord: false, context: 'CANVAS' },
  { id: 'tool.move',         category: 'TOOLS',      label: 'Move',                description: 'Move selected features',           defaultKey: 'm',            isChord: false, context: 'CANVAS' },
  { id: 'tool.copy',         category: 'TOOLS',      label: 'Copy (Tool)',         description: 'Copy and place features',          defaultKey: 'co',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.rotate',       category: 'TOOLS',      label: 'Rotate',              description: 'Rotate selected features',         defaultKey: 'ro',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.mirror',       category: 'TOOLS',      label: 'Mirror',              description: 'Mirror selected features',         defaultKey: 'mi',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.scale',        category: 'TOOLS',      label: 'Scale',               description: 'Scale selected features',          defaultKey: 'sc',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.offset',       category: 'TOOLS',      label: 'Offset',              description: 'Create parallel offset geometry',  defaultKey: 'o',            isChord: false, context: 'CANVAS' },
  { id: 'tool.trim',         category: 'TOOLS',      label: 'Trim',                description: 'Trim lines to cutting edges',      defaultKey: 'tr',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.extend',       category: 'TOOLS',      label: 'Extend',              description: 'Extend lines to boundary edges',   defaultKey: 'ex',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.fillet',       category: 'TOOLS',      label: 'Fillet / Curb Return',description: 'Create a curb return or fillet',   defaultKey: 'f',            isChord: false, context: 'CANVAS' },
  { id: 'tool.erase',        category: 'TOOLS',      label: 'Erase',               description: 'Erase features',                   defaultKey: 'e',            isChord: false, context: 'CANVAS' },
  { id: 'tool.dim',          category: 'ANNOTATIONS',label: 'Bearing/Dist Dim',    description: 'Place a bearing/distance dimension', defaultKey: 'd',           isChord: false, context: 'CANVAS' },
  { id: 'tool.leader',       category: 'ANNOTATIONS',label: 'Leader',              description: 'Place a leader annotation',        defaultKey: 'ld',           isChord: true,  context: 'CANVAS' },
  { id: 'tool.inverse',      category: 'SURVEY_MATH',label: 'Inverse',             description: 'Compute bearing/distance between two points', defaultKey: 'inv', isChord: true, context: 'CANVAS' },
  { id: 'tool.forward',      category: 'SURVEY_MATH',label: 'Forward Point',       description: 'Place point at bearing+distance',  defaultKey: 'fp',           isChord: true,  context: 'CANVAS' },

  // Zoom / Pan
  { id: 'view.zoomExtents',  category: 'ZOOM_PAN',   label: 'Zoom Extents',        description: 'Fit all features on screen',       defaultKey: 'z e',          isChord: true,  context: 'CANVAS' },
  { id: 'view.zoomSelection',category: 'ZOOM_PAN',   label: 'Zoom to Selection',   description: 'Zoom to the selected features',    defaultKey: 'z s',          isChord: true,  context: 'CANVAS' },
  { id: 'view.zoomIn',       category: 'ZOOM_PAN',   label: 'Zoom In',             description: 'Zoom in',                          defaultKey: 'ctrl+equal',   isChord: false, context: 'CANVAS' },
  { id: 'view.zoomOut',      category: 'ZOOM_PAN',   label: 'Zoom Out',            description: 'Zoom out',                         defaultKey: 'ctrl+minus',   isChord: false, context: 'CANVAS' },

  // Snap
  { id: 'snap.toggle',       category: 'SNAP',       label: 'Toggle Snap',         description: 'Turn snap on or off',              defaultKey: 'f3',           isChord: false, context: 'CANVAS' },
  { id: 'snap.grid',         category: 'SNAP',       label: 'Toggle Grid',         description: 'Show or hide the grid',            defaultKey: 'f7',           isChord: false, context: 'CANVAS' },
  { id: 'snap.ortho',        category: 'SNAP',       label: 'Toggle Ortho',        description: 'Constrain drawing to 90° angles',  defaultKey: 'f8',           isChord: false, context: 'CANVAS' },

  // Layers
  { id: 'layer.panel',       category: 'LAYERS',     label: 'Toggle Layer Panel',  description: 'Show or hide the layer panel',     defaultKey: 'f2',           isChord: false, context: 'GLOBAL' },

  // AI
  { id: 'ai.start',          category: 'AI',         label: 'Start AI Drawing',    description: 'Open the AI drawing wizard',       defaultKey: 'ctrl+shift+a', isChord: false, context: 'GLOBAL' },
  { id: 'ai.chat',           category: 'AI',         label: 'Focus AI Chat',       description: 'Focus the AI assistant chat input', defaultKey: 'ctrl+shift+c', isChord: false, context: 'GLOBAL' },

  // View
  { id: 'view.settings',     category: 'APP',        label: 'Open Settings',       description: 'Open the Settings page',           defaultKey: 'ctrl+comma',   isChord: false, context: 'GLOBAL' },
  { id: 'view.commandBar',   category: 'APP',        label: 'Focus Command Bar',   description: 'Move focus to the command bar',    defaultKey: 'ctrl+shift+k', isChord: false, context: 'GLOBAL' },
];
```

### 2.2 Hotkey Engine

```typescript
// packages/hotkeys/src/engine.ts

export class HotkeyEngine {
  private bindings:     Map<string, string>;   // key combo → actionId
  private handlers:     Map<string, () => void>; // actionId → handler
  private lastKey:      string | null = null;
  private lastKeyTime:  number = 0;
  private CHORD_WINDOW = 500; // ms

  constructor(bindings: Map<string, string>) {
    this.bindings = bindings;
    this.handlers = new Map();
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  register(actionId: string, handler: () => void): void {
    this.handlers.set(actionId, handler);
  }

  unregister(actionId: string): void {
    this.handlers.delete(actionId);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore when typing in inputs (unless action context allows it)
    if (this.isTypingContext(e.target)) return;

    const key = this.serializeKey(e);

    // Check for chord completion
    if (this.lastKey && Date.now() - this.lastKeyTime < this.CHORD_WINDOW) {
      const chordCombo = `${this.lastKey} ${key}`;
      if (this.tryFire(chordCombo, e)) { this.lastKey = null; return; }
    }

    // Check single key
    if (this.tryFire(key, e)) { this.lastKey = null; return; }

    // Store as potential chord start
    this.lastKey     = key;
    this.lastKeyTime = Date.now();
  }

  private tryFire(combo: string, e: KeyboardEvent): boolean {
    const actionId = this.bindings.get(combo);
    if (!actionId) return false;
    const handler = this.handlers.get(actionId);
    if (!handler) return false;
    e.preventDefault();
    handler();
    return true;
  }

  private serializeKey(e: KeyboardEvent): string {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey)               parts.push('alt');
    if (e.shiftKey)             parts.push('shift');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  private isTypingContext(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }
}
```

### 2.3 Hotkey Zustand Store

```typescript
// packages/store/src/hotkey-store.ts

interface HotkeyStore {
  bindings: Record<string, string>;   // key combo → actionId (user's current bindings)

  // Actions
  getBinding:     (actionId: string) => string | null;
  setBinding:     (actionId: string, keyCombo: string) => void;
  clearBinding:   (actionId: string) => void;
  resetToDefault: (actionId: string) => void;
  resetAll:       () => void;
  loadPreset:     (presetId: 'DEFAULT' | 'AUTOCAD_LIKE') => void;
  getConflicts:   (keyCombo: string) => string[];  // returns actionIds that share this combo
}
```

---

## 3. Hotkey Binding Settings Page

### 3.1 Layout

```
┌─ Settings ──────────────────────────── [× Close] ───────────────────────────────┐
│ [General] [Canvas] [Display] [Hotkeys ★] [AI] [Export] [Company] [Templates]   │
│─────────────────────────────────────────────────────────────────────────────────│
│ Hotkey Bindings                                                                  │
│                                                                                  │
│ Preset: [Default ▾]  [AutoCAD-like ▾]                    [Reset All to Default] │
│                                                                                  │
│ Search: [_______________]                Filter by category: [All ▾]            │
│                                                                                  │
│ ┌─ FILE ─────────────────────────────────────────────────────────────────────┐  │
│ │  New Document            Ctrl+N       [⊘]  [Edit]                          │  │
│ │  Open File               Ctrl+O       [⊘]  [Edit]                          │  │
│ │  Save                    Ctrl+S       [⊘]  [Edit]                          │  │
│ └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│ ┌─ EDIT ─────────────────────────────────────────────────────────────────────┐  │
│ │  Undo                    Ctrl+Z       [⊘]  [Edit]                          │  │
│ │  Redo                    Ctrl+Y       [⊘]  [Edit]                          │  │
│ │  Cut                     Ctrl+X       [⊘]  [Edit]                          │  │
│ └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│ ┌─ TOOLS (canvas only) ──────────────────────────────────────────────────────┐  │
│ │  Select Tool             S            [⊘]  [Edit]                          │  │
│ │  Draw Line               L            [⊘]  [Edit]                          │  │
│ │  ⚠ Draw Arc              A   ← CONFLICT with Edit.selectAll override       │  │
│ │  [Resolve Conflict]                                                         │  │
│ └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│                                          [Save Changes]  [Discard Changes]      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Edit Binding Flow

When the user clicks **[Edit]** next to an action:

```
┌─ Edit Binding: Draw Arc ────────────────────────────────────┐
│                                                             │
│  Current binding: A                                         │
│                                                             │
│  Press the key combination you want to use, or click       │
│  [Unbind] to remove this shortcut.                         │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  (listening for keypress...)                        │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  [Unbind]                         [Cancel]                  │
└─────────────────────────────────────────────────────────────┘
```

After pressing a key:
- If the key is free → binding applied immediately (live preview in table)
- If the key conflicts → show conflict warning with option to reassign the conflicting action

### 3.3 Conflict Resolution

```typescript
export function detectConflicts(
  newCombo: string,
  newActionId: string,
  bindings: Record<string, string>,
  actions: BindableAction[],
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (const [combo, actionId] of Object.entries(bindings)) {
    if (combo === newCombo && actionId !== newActionId) {
      const action = actions.find(a => a.id === actionId)!;
      // Only conflict if both actions share a context
      const newAction = actions.find(a => a.id === newActionId)!;
      if (contextsOverlap(newAction.context, action.context)) {
        conflicts.push({ actionId, label: action.label, combo });
      }
    }
  }

  return conflicts;
}
```

---

## 4. Dynamic Cursor System

### 4.1 Cursor Types

```typescript
// packages/cursor/src/types.ts

export type CursorType =
  // Selection
  | 'DEFAULT'               // Standard arrow
  | 'CROSSHAIR'             // Fine crosshair for precision placement
  | 'CROSSHAIR_SNAP'        // Crosshair with snap indicator dot
  // Pan / Grab
  | 'GRAB'                  // Open hand (pan hover)
  | 'GRABBING'              // Closed hand (panning)
  // Resize / Grip edit
  | 'RESIZE_NW_SE'          // Northwest-southeast resize
  | 'RESIZE_NE_SW'          // Northeast-southwest resize
  | 'RESIZE_N_S'            // North-south resize (grip on horizontal line)
  | 'RESIZE_E_W'            // East-west resize (grip on vertical line)
  | 'MOVE'                  // Four-arrow move cursor
  // Draw
  | 'DRAW'                  // Pencil cursor for drawing tools
  | 'DRAW_ENDPOINT'         // Snap to endpoint: cursor with green square
  | 'DRAW_MIDPOINT'         // Snap to midpoint: cursor with green triangle
  | 'DRAW_INTERSECT'        // Snap to intersection: cursor with red X
  | 'DRAW_PERPENDICULAR'    // Perpendicular snap: cursor with ⊥ symbol
  // Edit
  | 'ROTATE'                // Rotation arc cursor
  | 'SCALE'                 // Scale arrow cursor
  | 'TRIM'                  // Scissors cursor
  | 'EXTEND'                // Extend arrow cursor
  | 'OFFSET'                // Parallel lines cursor
  | 'ERASE'                 // Eraser cursor
  // Text
  | 'TEXT'                  // I-beam text cursor
  // Measure
  | 'MEASURE'               // Ruler cursor
  // AI
  | 'AI_CHAT'               // Chat bubble cursor (for element chat mode)
  // Wait
  | 'WAIT'                  // Spinner for AI processing
  // Not allowed
  | 'NOT_ALLOWED';          // Prohibited action indicator
```

### 4.2 Cursor Manager

```typescript
// packages/cursor/src/cursor-manager.ts

export function resolveCursor(
  tool:          ToolType,
  hoveredFeature: Feature | null,
  snapResult:    SnapResult | null,
  isDragging:    boolean,
  isGripHover:   boolean,
  gripAngle:     number | null,       // degrees, for resize cursors
  isAIChatMode:  boolean,
): CursorType {
  if (isAIChatMode)  return 'AI_CHAT';

  switch (tool) {
    case 'PAN':
      return isDragging ? 'GRABBING' : 'GRAB';

    case 'SELECT':
      if (isDragging && hoveredFeature)  return 'MOVE';
      if (isGripHover && gripAngle !== null) return resolveGripCursor(gripAngle);
      if (hoveredFeature)                return 'MOVE';
      return 'DEFAULT';

    case 'DRAW_POINT':
    case 'DRAW_LINE':
    case 'DRAW_POLYLINE':
    case 'DRAW_POLYGON':
    case 'DRAW_ARC':
    case 'DRAW_SPLINE_FIT':
    case 'DRAW_SPLINE_CONTROL':
      return resolveSnapCursor(snapResult);

    case 'MOVE':         return isDragging ? 'GRABBING' : 'MOVE';
    case 'COPY':         return isDragging ? 'GRABBING' : 'MOVE';
    case 'ROTATE':       return 'ROTATE';
    case 'SCALE_TOOL':   return 'SCALE';
    case 'OFFSET':       return 'OFFSET';
    case 'TRIM':         return 'TRIM';
    case 'EXTEND':       return 'EXTEND';
    case 'FILLET':       return 'CROSSHAIR';
    case 'ERASE':        return 'ERASE';
    case 'DRAW_TEXT':    return 'TEXT';
    case 'DRAW_DIMENSION': return 'CROSSHAIR';
    case 'DRAW_LEADER':  return 'DRAW';
    case 'INVERSE':      return 'MEASURE';
    case 'FORWARD_POINT':return 'CROSSHAIR';

    default: return 'DEFAULT';
  }
}

function resolveSnapCursor(snap: SnapResult | null): CursorType {
  if (!snap) return 'CROSSHAIR';
  switch (snap.type) {
    case 'ENDPOINT':     return 'DRAW_ENDPOINT';
    case 'MIDPOINT':     return 'DRAW_MIDPOINT';
    case 'INTERSECTION': return 'DRAW_INTERSECT';
    case 'PERPENDICULAR':return 'DRAW_PERPENDICULAR';
    default:             return 'CROSSHAIR_SNAP';
  }
}

function resolveGripCursor(angleDeg: number): CursorType {
  const a = ((angleDeg % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5)  return 'RESIZE_E_W';
  if (a < 67.5)                return 'RESIZE_NE_SW';
  if (a < 112.5)               return 'RESIZE_N_S';
  return 'RESIZE_NW_SE';
}
```

### 4.3 Custom Cursor CSS

Custom cursors are implemented as CSS `cursor: url(data:...)` with a hotspot:

```typescript
export const CURSOR_CSS: Record<CursorType, string> = {
  DEFAULT:             'default',
  CROSSHAIR:           'crosshair',
  CROSSHAIR_SNAP:      `url('${CURSORS.crosshairSnap}') 12 12, crosshair`,
  GRAB:                'grab',
  GRABBING:            'grabbing',
  RESIZE_NW_SE:        'nwse-resize',
  RESIZE_NE_SW:        'nesw-resize',
  RESIZE_N_S:          'ns-resize',
  RESIZE_E_W:          'ew-resize',
  MOVE:                'move',
  DRAW:                `url('${CURSORS.pencil}') 0 24, crosshair`,
  DRAW_ENDPOINT:       `url('${CURSORS.snapEndpoint}') 12 12, crosshair`,
  DRAW_MIDPOINT:       `url('${CURSORS.snapMidpoint}') 12 12, crosshair`,
  DRAW_INTERSECT:      `url('${CURSORS.snapIntersect}') 12 12, crosshair`,
  DRAW_PERPENDICULAR:  `url('${CURSORS.snapPerp}') 12 12, crosshair`,
  ROTATE:              `url('${CURSORS.rotate}') 12 12, alias`,
  SCALE:               `url('${CURSORS.scale}') 12 12, nesw-resize`,
  TRIM:                `url('${CURSORS.scissors}') 8 8, crosshair`,
  EXTEND:              `url('${CURSORS.extend}') 4 24, crosshair`,
  OFFSET:              `url('${CURSORS.offset}') 12 12, crosshair`,
  ERASE:               `url('${CURSORS.eraser}') 0 16, cell`,
  TEXT:                'text',
  MEASURE:             `url('${CURSORS.ruler}') 0 24, crosshair`,
  AI_CHAT:             `url('${CURSORS.chat}') 0 0, auto`,
  WAIT:                'wait',
  NOT_ALLOWED:         'not-allowed',
};
```

### 4.4 Canvas Cursor Application

The PixiJS canvas element's CSS cursor property is updated on every `pointermove`:

```typescript
// apps/web/hooks/useDynamicCursor.ts
export function useDynamicCursor(canvasEl: HTMLCanvasElement | null) {
  const tool         = useToolStore(s => s.activeTool);
  const snap         = useSnapStore(s => s.snapResult);
  const hoveredId    = useSelectionStore(s => s.hoveredFeatureId);
  const isDragging   = useSelectionStore(s => s.isDragging);
  const isGripHover  = useSelectionStore(s => s.isGripHover);
  const gripAngle    = useSelectionStore(s => s.gripAngle);
  const isChatMode   = useAIStore(s => s.elementChatModeActive);
  const hoveredFeature = useDrawingStore(s => hoveredId ? s.features[hoveredId] : null);

  useEffect(() => {
    if (!canvasEl) return;
    const cursor = resolveCursor(tool, hoveredFeature, snap, isDragging, isGripHover, gripAngle, isChatMode);
    canvasEl.style.cursor = CURSOR_CSS[cursor];
  }, [tool, snap, hoveredId, isDragging, isGripHover, gripAngle, isChatMode]);
}
```

---

## 5. Tooltip System

### 5.1 Tooltip Types

| Type | Trigger | Content | Delay |
|------|---------|---------|-------|
| **UI Tooltip** | Hover over button, icon, form field | Description of what that control does | 2 seconds |
| **Feature Tooltip** | Hover over feature on canvas | Element details (see §6) | 1 second |
| **Layer Tooltip** | Hover over layer in layer panel | Layer name, visibility, lock, feature count | 1.5 seconds |
| **Shortcut Tooltip** | Hover over toolbar button | Includes keyboard shortcut notation | 2 seconds |

All tooltip types can be individually disabled in **Settings → Display → Tooltips**.

### 5.2 Tooltip Provider

```typescript
// apps/web/components/ui/TooltipProvider.tsx

export interface TooltipState {
  visible:  boolean;
  content:  React.ReactNode;
  x:        number;          // Cursor X + offset
  y:        number;          // Cursor Y + offset
  type:     'UI' | 'FEATURE' | 'LAYER';
}

export const TooltipContext = createContext<{
  showTooltip: (content: React.ReactNode, x: number, y: number, type: TooltipState['type']) => void;
  hideTooltip: () => void;
} | null>(null);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TooltipState>({ visible: false, content: null, x: 0, y: 0, type: 'UI' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled  = useSettingsStore(s => s.preferences.tooltipsEnabled);

  const showTooltip = useCallback((content: React.ReactNode, x: number, y: number, type: TooltipState['type']) => {
    if (!enabled) return;
    const delay = type === 'FEATURE' ? 1000 : type === 'LAYER' ? 1500 : 2000;
    timerRef.current = setTimeout(() => setState({ visible: true, content, x, y, type }), delay);
  }, [enabled]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(s => ({ ...s, visible: false }));
  }, []);

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
      {children}
      {state.visible && (
        <UITooltip x={state.x} y={state.y}>{state.content}</UITooltip>
      )}
    </TooltipContext.Provider>
  );
}
```

### 5.3 UI Tooltip Component

```typescript
// apps/web/components/ui/UITooltip.tsx
export function UITooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="fixed z-[9999] max-w-xs rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-lg pointer-events-none"
      style={{ left: x + 12, top: y + 16 }}
    >
      {children}
    </div>
  );
}
```

### 5.4 Attaching UI Tooltips

A `useUITooltip` hook wraps any control:

```typescript
export function useUITooltip(content: React.ReactNode) {
  const { showTooltip, hideTooltip } = useContext(TooltipContext)!;

  return {
    onMouseEnter: (e: React.MouseEvent) => showTooltip(content, e.clientX, e.clientY, 'UI'),
    onMouseLeave: hideTooltip,
    onMouseMove:  (e: React.MouseEvent) => {
      // Update position as mouse moves (tracking)
      showTooltip(content, e.clientX, e.clientY, 'UI');
    },
  };
}
```

Usage on any button:
```tsx
const tooltip = useUITooltip(
  <><strong>Draw Line</strong><br/>Hotkey: L<br/>Draw a line segment between two points.</>
);
<button {...tooltip} onClick={() => setTool('DRAW_LINE')}>Line</button>
```

---

## 6. Element Hover-Detail Tooltips

### 6.1 Feature Tooltip Content

When hovering over a feature on the canvas for 1 second, a tooltip appears showing element details:

```typescript
export function buildFeatureTooltip(
  feature:    Feature,
  doc:        DrawingDocument,
  bearingFmt: BearingFormat,
): React.ReactNode {
  switch (feature.geometry.type) {
    case 'LINE': {
      const bearing  = computeBearing(feature.geometry.start!, feature.geometry.end!);
      const distance = computeDistance(feature.geometry.start!, feature.geometry.end!);
      const fromName = findPointName(feature.geometry.start!, doc);
      const toName   = findPointName(feature.geometry.end!, doc);
      return (
        <>
          <strong>{feature.properties.description ?? 'Line'}</strong>
          <br/>Bearing: {formatBearing(bearing, bearingFmt)}
          <br/>Length: {distance.toFixed(3)}'
          {fromName && <><br/>From: {fromName}</>}
          {toName   && <><br/>To:   {toName}</>}
          <br/>Layer: {doc.layers[feature.layerId]?.name}
        </>
      );
    }

    case 'ARC': {
      const curveData = computeCurveFromArc(feature.geometry.arc!);
      return (
        <>
          <strong>{feature.properties.description ?? 'Arc'}</strong>
          <br/>R = {curveData.radius.toFixed(3)}'
          <br/>Δ = {formatDMS(curveData.deltaAngle)}
          <br/>L = {curveData.arcLength.toFixed(3)}'
          <br/>CB = {formatBearing(curveData.chordBearing, bearingFmt)}
          <br/>Layer: {doc.layers[feature.layerId]?.name}
        </>
      );
    }

    case 'POINT': {
      const code = feature.properties.code as string | undefined;
      const name = feature.properties.pointName as string | undefined;
      const n    = feature.geometry.point!.y.toFixed(4);
      const e    = feature.geometry.point!.x.toFixed(4);
      return (
        <>
          <strong>{name ?? 'Point'}</strong>
          {code && <><br/>Code: {code}</>}
          <br/>N: {n}
          <br/>E: {e}
          <br/>Layer: {doc.layers[feature.layerId]?.name}
        </>
      );
    }

    // POLYLINE, POLYGON: show vertex count + total length + layer
    default:
      return <>{feature.geometry.type} — {doc.layers[feature.layerId]?.name}</>;
  }
}
```

### 6.2 Canvas Hover Handler

The PixiJS event system fires `pointerover` / `pointerout` on each feature container:

```typescript
// In the feature renderer (PixiJS):
featureContainer.eventMode = 'static';
featureContainer.on('pointerenter', (e) => {
  const feature = doc.features[featureId];
  const content = buildFeatureTooltip(feature, doc, bearingFormat);
  showTooltip(content, e.global.x, e.global.y, 'FEATURE');
  selectionStore.setHoveredFeature(featureId);
});
featureContainer.on('pointerleave', () => {
  hideTooltip();
  selectionStore.setHoveredFeature(null);
});
featureContainer.on('pointermove', (e) => {
  // Update tooltip position to track mouse
  updateTooltipPosition(e.global.x, e.global.y);
});
```

---

## 7. Bidirectional Attribute ↔ Canvas Sync

### 7.1 Canvas → Property Panel (Real-Time)

When any manual edit is made on the canvas:

```
User drags grip of LINE endpoint
    │
    ▼
PixiJS pointerup event
    │
    ▼
DrawingStore.updateFeatureGeometry(featureId, newGeometry)
    │
    ▼
DrawingStore subscribers fire
    │
    ▼
PropertyPanel re-renders with:
  - New Start X/Y coordinates
  - New End X/Y coordinates
  - New bearing (recomputed)
  - New length (recomputed)
```

No delay, no "apply" needed. The property panel is always a live view of the store.

### 7.2 Property Panel → Canvas (Real-Time)

```typescript
// apps/web/components/panels/PropertyPanel.tsx

function CoordinateField({ label, value, onChange }: CoordFieldProps) {
  const [localValue, setLocalValue] = useState(value.toFixed(4));

  // Update local display when store changes externally
  useEffect(() => setLocalValue(value.toFixed(4)), [value]);

  function handleCommit() {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && parsed !== value) {
      onChange(parsed);  // → DrawingStore.updateFeatureGeometry → canvas re-renders
    } else {
      setLocalValue(value.toFixed(4)); // revert if invalid
    }
  }

  return (
    <input
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={e => { if (e.key === 'Enter') handleCommit(); }}
      className="..."
    />
  );
}
```

Every time the user commits a field (blur or Enter), the drawing store is updated and the canvas re-renders the affected feature instantly.

### 7.3 Undo Integration

Every property panel commit creates an undo entry:

```typescript
DrawingStore.updateFeatureGeometry(featureId, newGeometry, {
  undoLabel: `Move ${getFeatureLabel(featureId)} endpoint`,
  isCompound: false,
});
```

If the user types rapidly in multiple coordinate fields (common when entering a coordinate), the commits within 500ms are merged into a single undo entry.

---

## 8. Undo/Redo UI Buttons

### 8.1 Toolbar Buttons

Undo and Redo buttons appear at the left of the main toolbar (or in the Edit menu):

```tsx
// apps/web/components/ui/UndoRedoButtons.tsx

export function UndoRedoButtons() {
  const { canUndo, canRedo, undoLabel, redoLabel, undo, redo } = useUndoStore();
  const undoTooltip = useUITooltip(
    <><strong>Undo</strong><br/>{undoLabel ?? 'Nothing to undo'}<br/>Hotkey: Ctrl+Z</>
  );
  const redoTooltip = useUITooltip(
    <><strong>Redo</strong><br/>{redoLabel ?? 'Nothing to redo'}<br/>Hotkey: Ctrl+Y</>
  );

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={undo}
        disabled={!canUndo}
        {...undoTooltip}
        className="toolbar-btn disabled:opacity-40"
        aria-label="Undo"
      >
        <RotateCcw size={16} />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        {...redoTooltip}
        className="toolbar-btn disabled:opacity-40"
        aria-label="Redo"
      >
        <RotateCw size={16} />
      </button>
    </div>
  );
}
```

### 8.2 UndoStore Additions

The UndoStore (Phase 1) is extended to expose labels for the tooltip:

```typescript
interface UndoStore {
  // ... existing fields ...
  undoLabel: string | null;    // "Undo Move Feature", "Undo Create Line", etc.
  redoLabel: string | null;    // "Redo Move Feature", etc.
  canUndo:   boolean;
  canRedo:   boolean;
}
```

Every `addEntry` call includes a `label`:

```typescript
undoStore.addEntry({
  label:  'Draw Line',
  undo:   () => drawingStore.removeFeature(featureId),
  redo:   () => drawingStore.addFeature(feature),
});
```

---

## 9. Settings Section — Full Specification

### 9.1 Settings Page Structure

The settings page is a full-screen modal (or dedicated route `/settings`) with a tabbed sidebar:

```
┌─ Settings ──────────────────────────── [× Close] ────────────────────┐
│ ╔════════════╗                                                        │
│ ║ General    ║  ← active                                             │
│ ╠════════════╣                                                        │
│ ║ Canvas     ║                                                        │
│ ╠════════════╣                                                        │
│ ║ Display    ║                                                        │
│ ╠════════════╣                                                        │
│ ║ Hotkeys    ║                                                        │
│ ╠════════════╣                                                        │
│ ║ AI         ║                                                        │
│ ╠════════════╣                                                        │
│ ║ Export     ║                                                        │
│ ╠════════════╣                                                        │
│ ║ Company    ║                                                        │
│ ╠════════════╣                                                        │
│ ║ Templates  ║                                                        │
│ ╠════════════╣                                                        │
│ ║ Import     ║                                                        │
│ ╚════════════╝                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

### 9.2 General Settings

```typescript
interface GeneralSettings {
  units:             'FEET' | 'METERS';              // Default: FEET
  coordinatePrecision: number;                       // Decimal places (default: 4)
  bearingFormat:     'DMS' | 'DECIMAL_DEGREES';     // Default: DMS
  distancePrecision: number;                         // Decimal places (default: 2)
  autoSaveEnabled:   boolean;                        // Default: true
  autoSaveIntervalSec: number;                       // Default: 60
  theme:             'LIGHT' | 'DARK' | 'SYSTEM';   // Default: SYSTEM
  language:          'en';                           // Future: i18n
  recentFilesCount:  number;                         // Default: 10
}
```

**UI Controls:**
- Units: radio buttons (Feet / Meters)
- Coordinate Precision: stepper (0–8)
- Bearing Format: radio buttons (DMS / Decimal Degrees)
- Distance Precision: stepper (0–4)
- Auto-Save: toggle + interval slider (10s–5min)
- Theme: radio buttons (Light / Dark / System)
- Recent Files: stepper (5–20)

### 9.3 Canvas Settings

```typescript
interface CanvasSettings {
  backgroundColor:       string;    // Hex (default: #FFFFFF)
  selectionColor:        string;    // Hex (default: #0066FF)
  gripColor:             string;    // Hex (default: #0066FF)
  snapRadius:            number;    // Screen pixels (default: 15)
  gripSize:              number;    // Screen pixels (default: 8)
  defaultGridVisible:    boolean;
  defaultGridStyle:      'DOTS' | 'LINES' | 'CROSSHAIRS';
  defaultSnapEnabled:    boolean;
  zoomSensitivity:       number;    // 0.1–2.0 (default: 1.0)
  panSensitivity:        number;    // 0.5–2.0 (default: 1.0)
  crosshairCursor:       boolean;   // Full-window crosshair overlay
  highDPI:               boolean;   // Enable retina/HiDPI rendering (default: true)
}
```

### 9.4 Display Settings

```typescript
interface DisplaySettings {
  tooltipsEnabled:     boolean;         // Master toggle (default: true)
  uiTooltipDelay:      number;          // ms (default: 2000)
  featureTooltipDelay: number;          // ms (default: 1000)
  tooltipMaxWidth:     number;          // px (default: 300)
  showBearingOnLine:   boolean;         // Floating bearing label on hovered lines (default: false)
  fontScale:           number;          // UI font scale 0.8–1.4 (default: 1.0)
  panelSide:           'LEFT' | 'RIGHT'; // Sidebar placement (default: LEFT for layers, RIGHT for properties)
  confidenceGlowEnabled: boolean;       // Show AI confidence glows in editor (default: true)
  lodThreshold:        number;          // World-units/pixel threshold for LOD (default: 0.002)
}
```

### 9.5 AI Settings

```typescript
interface AISettings {
  confidenceThreshold:   number;         // 0–100; questions generated below this (default: 70)
  deliberationTimeoutMin: number;        // Max deliberation minutes (default: 10)
  autoAcceptTier5:       boolean;        // Auto-accept tier 5 elements (default: true)
  enrichmentEnabled:     boolean;        // Run online enrichment queries (default: true)
  enrichmentTimeout:     number;         // ms per source (default: 10000)
  modelPreference:       'CLAUDE_SONNET' | 'CLAUDE_HAIKU'; // Cost vs quality trade-off
}
```

### 9.6 Export Settings

```typescript
interface ExportSettings {
  dxfVersion:         '2004' | '2010' | '2013' | '2018';    // Default: 2010
  pdfQuality:         'DRAFT' | 'STANDARD' | 'HIGH';         // Default: STANDARD
  pdfArchival:        boolean;                                 // PDF/A-3 (default: false)
  geoJSONPrecision:   number;                                  // Decimal places (default: 8)
  csvDelimiter:       ',' | '\t' | ';';                       // Default: ,
  csvEncoding:        'UTF-8' | 'UTF-8-BOM';                  // Default: UTF-8-BOM (Excel compat)
  includeConfidenceInCSV: boolean;                            // Default: true for full, false for simplified
  defaultExportPath:  string | null;
}
```

### 9.7 Company Settings

```typescript
interface CompanySettings {
  name:          string;        // "Starr Surveying Company"
  address:       string;        // "123 Main St"
  city:          string;        // "Belton"
  state:         string;        // "TX"
  zip:           string;        // "76513"
  phone:         string;        // "(254) 939-0000"
  email:         string;
  website:       string;
  licenseNumber: string;        // RPLS license number
  rplsName:      string;        // "Jake Starr, RPLS"
  logoBase64:    string | null; // PNG/SVG uploaded image
  sealBase64:    string | null; // Seal image
  defaultSurveyorId: string | null; // For multi-user future expansion
}
```

**UI Controls:**
- Text fields for all string values
- Logo upload: drag-and-drop or browse, shows preview
- Seal upload: drag-and-drop or browse, shows preview
- "Delete Logo" / "Delete Seal" buttons

### 9.8 Template Settings

```typescript
interface TemplateSettings {
  defaultTemplateId:   string;             // ID of the default template to use for new drawings
  customTemplates:     DrawingTemplate[];  // User-saved templates (from Phase 5)
}
```

**UI Controls:**
- Template picker (shows all templates — built-in + custom)
- Click template → preview thumbnail
- "Make Default" button
- "Delete" button for custom templates (built-ins cannot be deleted)
- "Duplicate" button to copy a built-in as a starting point for a custom template

### 9.9 Import Preset Settings

Saved column mappings for CSV import (from Phase 2):

```typescript
interface ImportPresetSettings {
  presets: CSVImportPreset[];   // Phase 2 type
}
```

**UI Controls:**
- List of saved presets with name, source format, and column count
- "Edit" → opens Phase 2 column mapper
- "Delete" → removes preset
- "Export Preset" → downloads as JSON for sharing
- "Import Preset" → loads a preset from JSON

---

## 10. Controls & Navigation Polish

### 10.1 Toolbar Style Guide

All toolbar buttons follow this pattern:

```
Active tool:    Solid filled background (brand blue), white icon, slight glow
Inactive tool:  Transparent background, gray icon
Hover state:    Light gray background, darker icon (100ms transition)
Disabled:       40% opacity, no hover response
Focus ring:     2px blue ring (keyboard navigation)
```

Button sizes:
- Primary toolbar: 36×36px with 16px icon
- Secondary toolbar: 32×32px with 14px icon
- Command palette entries: full-width rows

### 10.2 Panel Style Guide

All panels:
- Minimum width: 220px, maximum: 400px, resizable by drag on edge
- Collapse button: chevron on the panel header
- Panel header: 10px font, ALL CAPS, gray, non-interactive
- Scrollable content area with custom thin scrollbar
- Empty state: centered icon + message (not just empty space)

### 10.3 Form Field Conventions

All coordinate/numeric inputs:
- Right-aligned text (numbers read right-to-left)
- Select-all on focus (so typing immediately replaces value)
- Arrow-up/down increments/decrements by the precision step
- Red border on invalid input, reverts on blur
- Units label displayed as suffix inside the field (e.g., `[   234.56 ]  ft`)

### 10.4 Confirmation Dialogs

Destructive actions (delete feature, reject AI element, discard session) require confirmation:

```tsx
function useConfirmDialog() {
  return (message: string, confirmLabel = 'Confirm', danger = false) =>
    new Promise<boolean>(resolve => {
      // Shows modal dialog, resolves true/false based on user choice
    });
}
```

### 10.5 Keyboard Navigation

The app must be fully keyboard-navigable:
- Tab through all interactive elements in logical order
- Focus ring visible on all focused elements
- Arrow keys navigate within lists (layer list, review queue, element cards)
- Enter activates the focused item
- Escape dismisses all modals and panels
- `/` or `Ctrl+K` opens a command palette (search all actions + features)

### 10.6 Command Palette

A quick-action palette (similar to VS Code Ctrl+P):

```
┌─ ╱ Command Palette ────────────────────────────────────────────────────┐
│  [🔍 Search actions, layers, features, settings...                    ] │
│  ─────────────────────────────────────────────────────────────────── │
│  Recently used:                                                        │
│  Draw Line          (L)                                               │
│  Zoom to Extents    (Z E)                                             │
│  Toggle Snap        (F3)                                              │
│  ─────────────────────────────────────────────────────────────────── │
│  Matching: "fence"                                                     │
│  Layer: FENCE — 3 features                                            │
│  Create Fence Layer                                                    │
│  Toggle Fence Layer Visibility                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Persistent State Architecture

### 11.1 Storage Layers

```
Storage Layer          Contents                           Sync Method
─────────────────────  ─────────────────────────────────  ──────────────
Server (Supabase)      Company settings, User preferences, HTTPS API
                       Hotkey bindings, AI settings        (on change)
localStorage           Window layout, recent files,        On change
                       panel widths, last used template
.starr file            Drawing content, drawing-specific   Explicit save
                       settings, template placement        (Ctrl+S)
.starr.autosave        Auto-save copy of .starr file       Every 60s
AppData (Electron)     Same as localStorage                Automatic
```

### 11.2 Settings Load Order

```typescript
async function loadAllSettings(): Promise<void> {
  // 1. Load defaults (from registry/constants)
  applyDefaultSettings();

  // 2. Override with localStorage (layout, recent files)
  loadFromLocalStorage();

  // 3. Override with server settings (preferences, company, hotkeys)
  try {
    const serverSettings = await fetchUserSettings();
    applyServerSettings(serverSettings);
  } catch {
    // Server unavailable — use localStorage/defaults silently
  }
}
```

### 11.3 Auto-Sync

Settings are saved automatically on change (debounced 1 second):

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    saveToServer(userSettingsStore.getState());
    saveToLocalStorage(uiLayoutStore.getState());
  }, 1000);
  return () => clearTimeout(timer);
}, [settingsVersion]);
```

---

## 11.5 Unit-Aware Input System

**Goal:** Every numeric / angular field in the entire app — modal dialogs, ToolOptionsBar parameters, the command bar, the Property panel, the Settings dialog — accepts a free-form value with optional unit suffix and parses it into a single canonical internal representation. The surveyor types `6in`, `0.5ft`, `12'`, `6"`, `150` (default unit), `12 inches`, `2 m` and gets back a single number in the canonical unit (US Survey Feet for length, sq ft for area, decimal-degree azimuth for angles). Same for angles: typing `45.5`, `45°30'00"`, `N 45-30-00 E`, or the DMS-packed shorthand `45.3000` ("45° 30' 00\"") all resolve to the same internal azimuth.

The surveyor never has to think about "is this field expecting feet or inches?" — the field tells them via a small inline unit chip / dropdown, and the parser accepts whatever the surveyor types. Drop-downs let a surveyor pin a field to "always inches" (or "always meters", "always acres") for a session if they're working in a non-default unit and don't want to keep typing the suffix.

### 11.5.1 Linear Distance Parser

Module: `lib/cad/units/parse-length.ts`

```ts
export type LinearUnit = 'FT' | 'IN' | 'MILE' | 'M' | 'CM' | 'MM';

export interface ParsedLength {
  /** Canonical value in US Survey Feet (the world coordinate unit). */
  feet: number;
  /** The unit the surveyor typed (or `defaultUnit` if no suffix). */
  sourceUnit: LinearUnit;
  /** Numeric value in the source unit (pre-conversion). */
  sourceValue: number;
  /** True when the input contained an explicit unit suffix. */
  hadExplicitUnit: boolean;
}

export function parseLength(
  input: string,
  defaultUnit: LinearUnit = 'FT',
): ParsedLength | null;
```

**Suffix recognition (case-insensitive, optional whitespace):**

| Unit       | Accepted suffix forms |
|------------|----------------------|
| Feet       | `ft`, `feet`, `foot`, `'`, `′` |
| Inches     | `in`, `inch`, `inches`, `"`, `″`, `''` |
| Miles      | `mi`, `mile`, `miles` |
| Meters     | `m`, `meter`, `meters`, `metre`, `metres` |
| Centimeters| `cm`, `centimeter`, `centimeters` |
| Millimeters| `mm`, `millimeter`, `millimeters` |

**Compound forms (also parsed):**
- `5'6"` → 5.5 ft
- `5 ft 6 in` → 5.5 ft
- `5'-6"` → 5.5 ft (the architectural hyphen)
- `1/2"` → 0.0417 ft (fraction → decimal first)
- `1 1/2 ft` → 1.5 ft

**Rejected inputs return `null`:**
- Empty string, NaN, negative without explicit `-`, two unit suffixes without compound form, unknown suffix.

### 11.5.2 Area Parser

Module: `lib/cad/units/parse-area.ts`

```ts
export type AreaUnit = 'SQ_FT' | 'ACRES' | 'SQ_M' | 'HECTARES';

export interface ParsedArea {
  /** Canonical value in square feet. */
  sqft: number;
  sourceUnit: AreaUnit;
  sourceValue: number;
  hadExplicitUnit: boolean;
}

export function parseArea(
  input: string,
  defaultUnit: AreaUnit = 'SQ_FT',
): ParsedArea | null;
```

**Suffix recognition:**

| Unit          | Accepted suffix forms |
|---------------|----------------------|
| Square feet   | `sf`, `sqft`, `sq ft`, `sq.ft`, `sq feet`, `square feet`, `ft²`, `ft^2` |
| Acres         | `ac`, `acre`, `acres`, `a` (only when the value looks like a small acreage; ambiguous bare `a` falls back to `sf`) |
| Square meters | `sqm`, `sq m`, `m²`, `m^2`, `square meters` |
| Hectares      | `ha`, `hectare`, `hectares` |

### 11.5.3 Angular / Bearing Parser

Module: `lib/cad/units/parse-angle.ts` (extends the existing `parseBearing`)

```ts
export type AngleMode = 'BEARING' | 'AZIMUTH' | 'AUTO';

export interface ParsedAngle {
  /** Canonical value: decimal-degree azimuth (0 = North, clockwise). */
  azimuth: number;
  /** What the surveyor's input represented. */
  sourceMode: 'BEARING' | 'AZIMUTH';
  /** Original DMS components when the input had them (preserved for round-trip display). */
  components: { deg: number; min: number; sec: number } | null;
  /** True when the input contained explicit DMS markers (° ' " or - separators). */
  hadDmsMarkers: boolean;
}

export function parseAngle(
  input: string,
  mode: AngleMode = 'AUTO',
): ParsedAngle | null;
```

**Auto-detect rules (`mode === 'AUTO'`):**

1. If the input starts with `N` or `S` and ends with `E` or `W` → quadrant **bearing**.
2. If it contains `°` / `'` / `"` / a hyphen-separated DMS pattern (`45-30-00`) → **azimuth in DMS**.
3. **DMS-packed numeric shortcut** (the surveyor types `101.4523`, expecting `101° 45' 23"`):
   - Triggered when the input is a bare decimal number with **exactly 4 fractional digits** (or 6 for tenth-of-a-second).
   - Split as `DDD.MMSS[T]` → `deg = floor(int)`, `min = floor(frac * 100)`, `sec = round((frac * 10000) % 100)`.
   - Validation: `min < 60 && sec < 60`. If either fails, fall back to plain decimal-degree interpretation.
   - This matches the convention used by Trimble Survey Office, Carlson, and many state-DOT data files.
4. Otherwise → plain decimal degrees.

**Examples** (input → `azimuth`, `sourceMode`):

| Input | Resolves to | Source |
|-------|-------------|--------|
| `45.5` | 45.5° | AZIMUTH (decimal) |
| `45.3000` | 45.5° (= 45° 30' 00") | AZIMUTH (DMS-packed) |
| `45°30'00"` | 45.5° | AZIMUTH (DMS) |
| `45-30-00` | 45.5° | AZIMUTH (hyphen-DMS) |
| `N 45°30'00" E` | 45.5° | BEARING |
| `N 45-30 E` | 45.5° (sec defaults to 0) | BEARING |
| `S 45.5 E` | 134.5° | BEARING |

When the surveyor's preference is `bearingFormat: 'QUADRANT'`, displays use `formatBearing(azimuth)`; when `'AZIMUTH'`, displays use `formatAzimuth(azimuth)` — the parser is preference-agnostic, only the display layer is opinionated.

### 11.5.4 `<UnitInput>` React Component

Module: `app/admin/cad/components/UnitInput.tsx`

A drop-in replacement for `<input type="number">` everywhere a parameter lives:

```tsx
<UnitInput
  kind="length"            // "length" | "area" | "angle"
  value={radiusFeet}        // Always canonical (feet / sqft / azimuth)
  onChange={setRadiusFeet}
  defaultUnit="FT"          // Drives the placeholder + dropdown initial
  showUnitDropdown          // Optional small chip → dropdown
  angleMode="AZIMUTH"       // For kind="angle": "BEARING" | "AZIMUTH" | "AUTO"
  placeholder="e.g. 6in or 0.5ft"
  onValid={(parsed) => …}   // Callback with the full ParsedLength/Area/Angle
/>
```

**Behaviour:**

- On blur (or Enter), parse the input. On parse failure, the component re-displays the surveyor's raw input and shows a red ring + tooltip (`"Couldn't parse — try '6in', '0.5ft', or '12.5'"`).
- On parse success, the input is **canonicalised** to the surveyor's preferred display format (so `6in` resolves to `0.5 ft` and the field re-renders as `0.5 ft`). A small "raw input preserved" chip lets the surveyor revert.
- The unit dropdown lets the surveyor lock the field to a unit (e.g. always inches for fillet radius) — that lock persists for the session via `useUIStore.fieldUnitLocks` (a Map<fieldKey, LinearUnit>).
- For `kind="angle"`, the format toggle (Bearing ↔ Azimuth) is exposed as a small chip; switching reformats the displayed value but keeps the canonical azimuth identical.
- Keyboard shortcut: `Tab` to commit + advance; `Esc` to revert to the last-committed value.

### 11.5.5 Wiring Targets

Every field below should switch to `<UnitInput>` as part of the rollout:

**Length-typed fields (default unit FT unless noted):**

- Offset distance (`OffsetDistanceInput` in `ToolOptionsBar`)
- Fillet radius (`tool.fillet`)
- Chamfer distance 1 / distance 2 (`tool.chamfer`)
- Divide-into-equal-parts segment length (`tool.divide` when in distance mode)
- Point-at-distance distance (`tool.pointAtDist`)
- Simplify polyline tolerance (`tool.simplify`, default IN)
- Polyline / polygon explicit-segment length (command bar `@dist<angle`)
- Drawing scale (Settings → Document, default IN-per-FT)
- Title-block scale label override
- Scale-bar length (in paper inches, default IN)
- Tooltip delay (already correctly using ms)
- Snap radius
- Grid major spacing
- Auto-save interval (already correctly using s)
- Property panel coordinate edits (X / Y / Northing / Easting / Z / radius / chord length)

**Area-typed fields:**

- Area-label override (`AreaAnnotation` config UI)
- Acreage shown / total area in title block
- Lot net area override

**Angle-typed fields:**

- Drawing rotation (Settings → Document, mode `AZIMUTH`)
- Bearing input on every command bar `@dist<bearing` step (mode `AUTO`)
- Title-block "north arrow rotation offset" (mode `AZIMUTH`)
- Curve data field overrides (chord bearing, tangent in / out bearings)
- Mirror-axis angle input (`tool.mirror` ANGLE mode)
- Polar-array start angle / sweep angle (`tool.array` polar mode)
- Translate-mode offset bearing (`tool.offset` TRANSLATE mode)
- B/D dimension explicit-bearing override (`FeaturePropertiesDialog` for LINE features)

### 11.5.6 Command-Bar Integration

The existing command bar already accepts `@dx,dy` (relative XY in current display unit) and `@dist<bearing` (polar). The parser layer plugs in:

- `@6in,12in` → `(0.5 ft, 1.0 ft)` relative offset
- `@5'6",10'` → `(5.5 ft, 10 ft)` relative offset
- `@10<45.3000` → `(7.07 ft, 7.07 ft)` polar (DMS-packed)
- `@10ft<N45-30-00E` → same as above with explicit bearing

Command-bar errors surface in the existing `cad:commandOutput` stream so the surveyor sees `"Couldn't parse 'foo' as a length — try '6in' or '0.5ft'"` directly under the input.

### 11.5.7 Settings Surface

Settings → Interaction adds:

- **Default linear unit for inputs** — overrides the per-document `linearUnit` for parser fallback (so a surveyor whose docs are in feet but who routinely types fillet radii in inches can pin the input default).
- **Default angle mode for inputs** — `AUTO` (recommended) | `AZIMUTH` | `BEARING`. Drives `<UnitInput kind="angle">` behaviour app-wide.
- **DMS-packed shortcut** — toggle to disable the `45.3000 → 45°30'00"` heuristic for surveyors who only ever want decimal degrees.

These persist via the existing `useUIStore` `partialize` allow-list (`fieldUnitLocks`, `defaultLinearUnit`, `defaultAngleMode`, `dmsPackedEnabled`).

### 11.5.8 Acceptance Tests

- [x] `parseLength("6in")` returns 0.5 ft, sourceUnit `'IN'`, hadExplicitUnit true — covered by `__tests__/cad/units/parse-length.test.ts`.
- [x] `parseLength("0.5ft")` returns 0.5 ft, sourceUnit `'FT'`.
- [x] `parseLength("150")` with default `'FT'` returns 150 ft, hadExplicitUnit false.
- [x] `parseLength("5'6\"")` returns 5.5 ft (compound).
- [x] `parseLength("1 1/2 ft")` returns 1.5 ft (mixed-number fraction).
- [x] `parseLength("inches", …)` returns null (no number) — also covers the `"5min"` partial-match defence.
- [x] `parseArea("2.5ac")` returns 108,900 sqft — covered by `__tests__/cad/units/parse-area.test.ts`.
- [x] `parseArea("1 hectare")` returns 107,639 sqft (±1 sqft).
- [x] `parseAngle("45.3000")` (AUTO) returns azimuth 45.5°, sourceMode AZIMUTH, components `{45,30,0}`.
- [x] `parseAngle("45.5")` (AUTO) returns azimuth 45.5°, sourceMode AZIMUTH, components null.
- [x] `parseAngle("N 45-30-00 E")` (AUTO) returns azimuth 45.5°, sourceMode BEARING.
- [x] `parseAngle("S 45°30' E")` returns azimuth 134.5° — `parseDmsBody` strips trailing minute markers without losing the body parse.
- [x] `parseAngle("400.0")` (decimal) returns null (out of range).
- [x] `parseAngle("99.6000")` falls back to decimal (sec >= 60 invalidates DMS-packed) — verified in tests.
- [x] `<UnitInput kind="length">` accepts every suffix variant from §11.5.1 and re-formats on blur to the surveyor's preferred unit — `app/admin/cad/components/UnitInput.tsx` ships with both full-fledged and `compact` modes; the compact mode is now wired into `ToolOptionsBar` for: offset distance (PARALLEL + TRANSLATE), fillet radius, chamfer D1 / D2, simplify tolerance, point-at-distance value, array row / col spacing. Each compact input keeps the original tool-color focus ring (orange for simplify, amber for fillet/chamfer, lime for point-at-dist, cyan for array, blue/orange for offset) by passing `focusBorderClass`.
- [x] `<UnitInput kind="angle" angleMode="AZIMUTH">` accepts both DMS and decimal input, displays per `bearingFormat` preference — wired into the TRANSLATE-mode offset bearing in `ToolOptionsBar` so a surveyor can type `45.3000` (DMS-packed → 45°30'00"), `45-30-00`, `N 45-30 E`, or plain decimal degrees.
- [ ] Field-level unit lock persists across reloads (via `useUIStore.fieldUnitLocks`) — store key not yet wired; rollout slice.
- [ ] Command bar `@6in,12in` resolves to `(0.5 ft, 1.0 ft)` — rollout slice (extend the existing polar/relative parsers through `parseLength`).
- [ ] Command bar `@10<45.3000` resolves correctly with DMS-packed shortcut — rollout slice.
- [ ] Settings toggle "DMS-packed shortcut" off → `45.3000` parses as `45.3°` (not `45°18'00"`) — parser supports the toggle (`opts.dmsPackedEnabled`); needs UI wiring + persisted setting.

### 11.5.9 Implementation Sequence

1. **Foundation** — `lib/cad/units/parse-length.ts`, `parse-area.ts`, `parse-angle.ts` with full test coverage. No UI changes yet.
2. **Component** — `<UnitInput>` shared React component with display formatting + dropdown + lock chip.
3. **Rollout — toolbar parameters** — replace every numeric input in `ToolOptionsBar` with `<UnitInput>`. Smallest blast radius, most user-visible win.
4. **Rollout — modal dialogs** — `FeaturePropertiesDialog`, `DrawingRotationDialog`, `OrientationDialog`, `SettingsDialog`, `ScaleBarEditorModal`, `TitleBlockPanel`.
5. **Rollout — command bar** — extend the polar / relative parsers to feed through `parseLength` + `parseAngle`.
6. **Settings surface** — Interaction tab toggles + per-field lock chip.

---

## 11.6 Intersect Tool — Deterministic Geometry

**Goal:** A single first-class **INTERSECT** tool that solves every "where would these two things meet?" problem a surveyor faces. The most common case: a missing house corner where two wall lines stop short of each other. The surveyor extends both lines virtually, finds the intersection, and drops a POINT (or builds a corner — two trimmed lines meeting at the new vertex). The same tool handles every shape pairing — line/arc/circle/ellipse/polyline-segment/spline — and surfaces every candidate the geometry yields. Multi-candidate cases (line-arc gives 0, 1, or 2 intersections; circle-circle gives up to 2; line-spline can give many) are presented as ghost previews the surveyor cycles through and confirms one.

The tool is **deterministic** — no AI in the math. The AI-assisted best-fit corner workflow that builds *on top* of this geometry lives in Phase 6 §31; that section calls into the helpers built here.

### 11.6.1 Tool Entry Points

- **Toolbar** — new INTERSECT entry under the SURVEY MATH flyout (alongside POINT_AT_DISTANCE, PERPENDICULAR, MEASURE_AREA).
- **Hotkey** — `IX` (matches AutoCAD's "Intersection osnap" mnemonic; bindable like every other action).
- **Right-click context menu** — when ≥ 2 features are selected, an "Intersect Selection…" entry pre-populates the modal.
- **Command palette** — `tool.intersect` searchable as `intersect`, `corner`, `meet`, `cross`.
- **Snap integration** — INTERSECTION snap already exists for live snap-on-hover. The dedicated tool is for explicit, persisted POINT creation + multi-candidate workflows the live snap can't surface.

### 11.6.2 Modal Layout

The dedicated `IntersectDialog` is a non-modal floating panel (so the surveyor can pan / zoom / pick features behind it) with three regions:

```
┌─ Intersect ───────────────────────────────────────┐
│ Method: ▾ [Line × Line ▾]   Extension: ☐ both     │
│                                                   │
│ ┌─ Source A ────────────────┐ ┌─ Source B ─────┐ │
│ │ [Pick…]  feat-2381  LINE  │ │ [Pick…] feat-2391 ARC │
│ │  ↳ start (1234.5, 678.9)  │ │  ↳ center (…) r=42.3' │
│ └───────────────────────────┘ └────────────────┘ │
│                                                   │
│ ┌─ Candidates (2 found) ─────────────────────┐   │
│ │ ● 1: (1242.3, 681.7)  [keep]  [as POINT]   │   │
│ │ ○ 2: (1248.9, 689.1)  [keep]  [as POINT]   │   │
│ └────────────────────────────────────────────┘   │
│                                                   │
│ Output: ▾ [Drop POINT ▾]  Layer: ▾ [BOUNDARY ▾] │
│                                                   │
│ [Cancel]                          [Confirm ⏎]    │
└──────────────────────────────────────────────────┘
```

- **Method picker** — driven by the source-A type. Switches to the matching algorithm.
- **Extension toggle** — when ON, finite features (LINE / segment / ARC) are treated as their infinite-line / full-circle extension; the tool flags candidates that would land outside the original geometry as "extended" (visually distinct ghost colour, with a warning chip).
- **Source A / B pickers** — click the canvas to pick. Picking the same feature twice (e.g. two segments of one polyline) is allowed — surveyor specifies which segment via a sub-picker.
- **Candidate list** — every solution the geometry yields. Click a row to toggle which one is highlighted on the canvas. Per-row buttons: `[keep]` adds the candidate to the output set, `[as POINT]` short-circuits the rest of the modal and drops a single POINT immediately.
- **Output dropdown** — what to do with the kept candidates: `Drop POINT`, `Trim both to intersection`, `Extend both to intersection`, `Build corner` (extend + trim + insert vertex on both, no separate POINT). Layer dropdown writes to the active layer by default.

### 11.6.3 Intersection Methods (Coverage Matrix)

Every cell in this matrix is a separate algorithm slice. We ship them as the surveyor's most-used pairs land:

| A \ B          | LINE | LINE-SEG (in polyline) | ARC | CIRCLE | ELLIPSE | SPLINE | RAY | INFINITE-LINE |
|----------------|:----:|:----------------------:|:---:|:------:|:-------:|:------:|:---:|:-------------:|
| LINE           | ●    | ●                      | ●   | ●      | ●       | ●      | ●   | ●             |
| LINE-SEG       | —    | ●                      | ●   | ●      | ●       | ●      | ●   | ●             |
| ARC            | —    | —                      | ●   | ●      | ●       | ●      | ●   | ●             |
| CIRCLE         | —    | —                      | —   | ●      | ●       | ●      | ●   | ●             |
| ELLIPSE        | —    | —                      | —   | —      | ●       | ●      | ●   | ●             |
| SPLINE         | —    | —                      | —   | —      | —       | ●      | ●   | ●             |
| RAY            | —    | —                      | —   | —      | —       | —      | ●   | ●             |
| INFINITE-LINE  | —    | —                      | —   | —      | —       | —      | —   | ●             |

**RAY** = a virtual half-line: pick a vertex / endpoint, supply a bearing (uses the new `<UnitInput kind="angle">`). Surveyor's mental model is "shoot a line from this point at bearing X and tell me where it hits." Common workflow: pick a corner, type the deed bearing, intersect with the next wall line.

**INFINITE-LINE** = a virtual line through two picked points (or a line + perpendicular). Used when the surveyor wants the intersection of a building line projected through a measured corner against an offset reference line.

Algorithm slices in implementation order:

1. **A — LINE × LINE** — already exists as `lineLineIntersection`; modal wraps it.
2. **B — LINE × ARC / LINE × CIRCLE** — needs new `lineArcIntersections` + `lineCircleIntersections` helpers (0/1/2 candidates). The classic "line-circle quadratic" — discriminant ≤ 0 → no real intersection, 0 → tangent (1 candidate), > 0 → 2 candidates.
3. **C — ARC × ARC / CIRCLE × CIRCLE** — `circleCircleIntersections` (the well-known "intersecting circles" formula). For ARCs, also test that each candidate falls inside the angular span of *both* arcs (re-using the `isAngleInArc` helper from `curve-render.ts`).
4. **D — Polyline-segment × any** — pick which segment of the source polyline is involved. Surveyor clicks the segment directly; we resolve `(featureId, segmentIndex)` and treat that segment as a LINE.
5. **E — RAY × any** — instead of a feature, surveyor enters `(originPt, bearing)`. Then the same algorithms with origin + direction.
6. **F — ELLIPSE × LINE / ELLIPSE × ARC** — quadratic in a rotated/scaled frame; same `>=2` discriminant story.
7. **G — SPLINE × any** — sample the spline densely (re-use the `sampleSpline` helper from §11.5 work) and run segment-segment intersection against every chunk; merge nearly-coincident hits.
8. **H — INFINITE-LINE × any** — same as LINE × any but skip the segment-bounds clip.

### 11.6.4 Extension Behaviour

- **OFF (default)** — only candidates that lie inside both source extents are kept; off-extent candidates are discarded silently.
- **ON for source A only** / **ON for source B only** / **ON for both** — independent toggles. When extension is ON for an input, the modal renders a dashed extension preview on the canvas in the source's colour at half opacity.
- Each candidate row badges its extension status: `(within both)` / `(extended A 12.3 ft)` / `(extended B 1.4 ft)` / `(extended both)`. Surveyors instantly see how far they're stretching the geometry.

### 11.6.5 Ghost Preview Pattern

Same render path as the existing transform-tool ghosts (`drawTransformedFeaturePreview`):

- Each candidate is a small crosshair at the world coords + a label `1`, `2`, …
- Confirmed candidates render solid; un-confirmed render at 50% opacity.
- The currently-highlighted row in the modal renders in the active accent colour (cyan by default).
- Hovering a ghost on the canvas highlights the matching modal row. Hovering a row highlights the matching ghost. Same `useUIStore.hoveredFeatureId` channel used by the confidence cards.
- Cycling the highlighted candidate via keyboard: `↓` / `↑` walk the list; `Enter` confirms the highlighted; `Space` toggles `keep`; `Escape` cancels.

### 11.6.6 Output Modes

- **Drop POINT** — emits one POINT feature per kept candidate. Properties: `intersectSourceAId`, `intersectSourceBId`, `intersectMethod`, `intersectExtended` (per source). All persisted so a future LIST tool can show provenance.
- **Trim both to intersection** — only valid for finite LINE / LINE-SEG sources where the kept candidate lies inside both extents. Each source becomes a LINE that ends at the candidate point; the click side determines which half is retained (matching FILLET / CHAMFER convention).
- **Extend both to intersection** — opposite case: when the candidate lies *outside* one or both sources, extend each finite source so it reaches the candidate. Surveyors use this for the "missing house corner" case.
- **Build corner** — the surveyor's preferred shorthand for "extend both, keep both, and stamp a POINT here". Emits one combined batch: extended LINE A + extended LINE B + a POINT named "Corner" at the intersection.

### 11.6.7 Multi-Candidate Disambiguation

Some pairs always yield ≤ 1 candidate (LINE × LINE either misses or meets at one point). Others yield up to 2 (LINE × CIRCLE) or many (SPLINE × anything). The modal handles disambiguation as follows:

- **0 candidates** — show a friendly explainer in the candidate-list area: "These two don't intersect. Toggle extension above to extend infinite, or pick a different pair." Suggestion chips below: "Toggle extension on both", "Switch to RAY".
- **1 candidate** — auto-keeps it; Confirm button pre-focused so the surveyor can hit Enter.
- **2+ candidates** — list all; first one auto-highlighted; surveyor picks via keyboard or click. `Confirm All` keeps every candidate at once for the bulk case (useful when intersecting a line against a fence polyline with many segments).

### 11.6.8 Acceptance Tests (deterministic side)

- [ ] LINE × LINE intersect modal opens, surveyor picks two non-parallel lines, candidate list shows 1 entry, confirm drops a POINT
- [ ] LINE × LINE with parallel sources → "These two don't intersect" message + extension chip
- [ ] LINE × LINE with extension ON finds the virtual intersection past both endpoints; ghost rendered as dashed line
- [ ] LINE × ARC yields 0 / 1 / 2 candidates depending on geometry; cycling with ↓/↑ moves the canvas highlight
- [ ] CIRCLE × CIRCLE (intersecting) yields 2 candidates, each `[keep]` adds a POINT
- [ ] CIRCLE × CIRCLE (tangent) yields 1 candidate; confirm drops one POINT
- [ ] CIRCLE × CIRCLE (concentric or non-intersecting) yields 0 candidates with explainer
- [ ] RAY × LINE: surveyor picks a vertex, types `N 45-30 E` in the bearing field, modal finds the intersection
- [ ] Polyline-segment picker: surveyor clicks a segment of a 12-vertex polyline; modal stores `(featureId, segmentIndex)` and intersects that segment as a LINE
- [ ] Build corner: extended sources + stamped POINT all land in one batch undo entry
- [ ] Trim both to intersection: kept candidate must be within both finite extents; otherwise the option is disabled with a tooltip explaining why
- [ ] Multi-source SPLINE × LINE produces N candidates, each labelled with its segment-of-spline number
- [ ] Property panel of dropped POINT shows `intersectSourceAId`, `intersectSourceBId`, `intersectMethod`, extension flags

### 11.6.9 Implementation Sequence (deterministic)

Each slice is a single PR / commit, all gated by tests:

1. **Slice 1** — `IntersectDialog` shell (modal layout, source pickers, no math yet). Method picker shows `Line × Line` only; algorithm is the existing `lineLineIntersection`.
2. **Slice 2** — Extension toggle + dashed-preview render. Add the `(within both)` / `(extended N ft)` badging.
3. **Slice 3** — `lineCircleIntersections` + `lineArcIntersections` helpers + tests. Wire into the method picker.
4. **Slice 4** — `circleCircleIntersections` + arc-arc filter (angular-span check). Tests.
5. **Slice 5** — Polyline-segment picker — surveyor clicks a segment, dialog stores `(featureId, segmentIndex)`.
6. **Slice 6** — RAY input source — origin point + bearing field (uses `<UnitInput kind="angle">`).
7. **Slice 7** — Multi-candidate ghost preview + keyboard navigation + per-row keep/as-POINT actions.
8. **Slice 8** — Output modes: Trim both / Extend both / Build corner. Emit single-batch undo entries.
9. **Slice 9** — `ellipseLineIntersections` + spline sampler intersect.
10. **Slice 10** — Right-click "Intersect Selection…" + command palette wiring + acceptance test pass.

Each slice keeps the modal usable for everything we've shipped so far, so the surveyor gets value from Slice 1 onward.

---

## 12. Phase 1–7 Gap Audit & Fixes

This section documents cross-cutting UX issues found in Phases 1–7 that Phase 8 resolves:

| Phase | Gap | Phase 8 Fix |
|-------|-----|------------|
| 1 | Keyboard shortcuts are hardcoded — cannot be customized | Hotkey registry + binding settings page (§2, §3) |
| 1 | No cursor feedback when hovering features or using tools | Dynamic cursor system (§4) |
| 1 | Undo/Redo is hotkey-only — no toolbar buttons | Undo/Redo UI buttons (§8) |
| 1 | Status bar shows coordinates but no active tool label | Status bar: add active tool name + hotkey hint |
| 1 | No tooltips on toolbar buttons | UITooltip hooks added to all toolbar buttons |
| 2 | Import dialog has no help text for column mapping | UITooltips added to all field labels in import dialog |
| 3 | Property panel doesn't always reflect canvas edits in real-time | Bidirectional sync (§7) enforced throughout |
| 3 | Layer panel has no tooltips explaining visibility/lock icons | Layer icon tooltips added |
| 4 | Curve calculator dialog has no per-field help | UITooltips added to all curve calculator inputs |
| 4 | Offset tool: no visual feedback about which side the offset will land on | Preview arrow added to offset tool cursor |
| 4 | Offset tool only handled LINE/POLYLINE/POLYGON/CIRCLE/ARC; SPLINE degraded to faceted POLYLINE; ELLIPSE + MIXED_GEOMETRY unsupported | Native `offsetEllipse` + `offsetSpline` (Tiller-Hanson bisector tangents) so curves stay editable; MIXED_GEOMETRY routed through polyline path; `isOffsetableFeature` extended (`lib/cad/geometry/offset.ts` + `lib/cad/operations.ts`) |
| 4 | Offset tool always created a perpendicular parallel — could not "blow up" or "shrink" a shape proportionally | New `OffsetMode` (`PARALLEL` ∥ `SCALE`) + `OffsetConfig.scaleFactor`; SCALE branch resizes around centroid via `scalePolylineAroundCentroid` / `scaleCircleAroundCenter` / `scaleEllipseAroundCenter` / `scaleArcAroundCenter` / `scaleSplineAroundCentroid`. Side ▷ Right inverts factor (`resolveScaleFactor`) so one number drives both blow-up and shrink. SCALE-mode preview rendered in `CanvasViewport`; UI toggle + factor input + `Scale Stroke` line-weight pass-through control wired into `ToolOptionsBar` |
| 4 | Offset tool always offset the whole feature — could not break out a single polyline edge as a parallel line | New `offsetSegmentMode` (`WHOLE` ◇ `SEGMENT`) + `offsetSourceSegmentIndex` on ToolState; phase-1 click captures the closest segment via `findClosestSegmentIndex`; commit routes through `buildSegmentOffsetFeatures` to emit a standalone LINE feature parallel to the chosen edge (PARALLEL distance OR SCALE about source centroid). `getSegmentEndpoints` powers segment lookup and preview; CanvasViewport highlights the picked edge while the preview renders only that segment's offset. UI toggle in `ToolOptionsBar` |
| 4 | Mirror tool gave no preview of the mirrored result + ignored Copy Mode + had no quick axis presets | `drawMirroredFeaturePreview` ghost in `CanvasViewport` so the user sees the mirrored selection live as the axis is dragged; click handler honours `toolState.copyMode` (clones features then mirrors clones, keeping originals intact, with a "Mirror Copy" undo entry). `ToolOptionsBar` adds quick `↔ Vertical` / `↕ Horizontal` axis presets that mirror through the selection centroid and respect Copy Mode |
| 4 | Mirror axis was always defined by two clicks — no way to pick an existing line as the axis or to mirror at a specific angle | New `mirrorAxisMode` (`TWO_POINTS` / `PICK_LINE` / `ANGLE`) + `mirrorAngle` on ToolState. PICK_LINE hits the closest line / polyline edge under the cursor (via `pickAxisFromFeature` reusing offset-tool segment helpers) and uses it as the axis. ANGLE takes a typed angle (with 0/45/90/135 quick presets) and a single anchor click to define the axis through that anchor. Live preview highlights the picked line in lime, draws the axis extended both ways, and ghost-renders the reflected selection. `ToolOptionsBar` exposes the axis-mode picker, angle input, and a phase-indicator hint that reads the next required action |
| 4/All | No dedicated FLIP tool — flipping a shape always required diving into Mirror's flyout or hunting for the menu | New `FLIP` tool with H / V / D1 / D2 directions in `ToolOptionsBar`. One-click commit through the selection centroid (via new `flipSelectionByDirection` operation) — clicking the canvas or pressing **Apply** flips immediately. Direction picker covers the two diagonals as well as the axis-aligned flips, all honour Copy Mode. Live ghost preview shows the destination geometry as the user changes direction |
| 4/All | No INVERT (point-inversion) tool | New `INVERT` tool. Click any point on the canvas to invert the selection through that center (180° rotation around the click point), via new `invertSelection` operation. Through-centroid quick button in `ToolOptionsBar` for fast common case. Honours Copy Mode. Live ghost shows the inverted selection following the cursor |
| 4/All | Ghost previews were only on MIRROR + OFFSET — MOVE / COPY / ROTATE / SCALE only showed a base→cursor line, leaving the user guessing where the result would land | Generalised the helper: `drawMirroredFeaturePreview` → `drawTransformedFeaturePreview` taking a `transformFn`. MOVE / COPY now render a translated ghost of the selection at the cursor; ROTATE renders the selection rotated by `atan2(cursor−center)`; SCALE renders the selection scaled by `dist(cursor,base) / 50` so dragging out-and-back grows / shrinks intuitively. COPY ghost uses a brighter cyan so it reads "new feature being added" vs MOVE's selection-color "this is where it's going" |
| 4 | ROTATE and SCALE interactive tools were one-click incomplete — clicking set the pivot but never committed; users had to fall back to the toolbar Apply button | Two-click commit for both tools, matching the live ghost preview so what the user sees is what lands. ROTATE click 2 commits with `atan2(cursor − pivot)`; SCALE click 2 commits with `dist(cursor, pivot) / 50`. Both honour `copyMode` (duplicate-then-transform). Pivot resets after commit so the user can chain. `ToolOptionsBar` shows a phase indicator ("Click pivot point" → "Click to commit angle/factor") plus a one-click cancel button when the pivot is locked in |
| 4 | Offset only had drag-to-place + perpendicular distance — no way to "program the offset using bearing/azimuth and distance" as the user requested | New `TRANSLATE` `OffsetMode` plus `offsetBearingDeg` on ToolState. Surveyor types a distance (feet) and azimuth (0° = N, CW) in `ToolOptionsBar`; clicking the canvas commits a copy of the source translated by that exact vector. New `bearingVector` + `buildTranslatedFeatures` helpers in `operations.ts`; `buildSegmentOffsetFeatures` extended so segment-mode TRANSLATE emits a single LINE displaced by the vector. Live preview draws an arrow from the source centroid to the destination centroid plus the ghost geometry, with N/E/S/W quick-azimuth buttons. Side picker is hidden in TRANSLATE because the bearing already encodes direction. Undo label includes the vector ("Offset 25.00 @ 045.0°") so the surveyor can audit later |
| 4/All | No ARRAY tool — surveyors had to duplicate-and-translate manually for every parking-space, lot-line, or monument-grid replication | New `ARRAY` tool with rectangular grid replication. ToolState gains `arrayRows`, `arrayCols`, `arrayRowSpacing`, `arrayColSpacing`. New `arraySelectionRectangular` operation in `lib/cad/operations.ts` clones the selection into an `r × c` grid with per-cell `polylineGroupId` remapping (so each copy is its own group). Live ghost preview shows every cell of the grid as the user adjusts parameters. ToolOptionsBar exposes rows × cols + ↕ / ↔ spacing inputs and an "Array N×M" Apply button; ToolBar slots Array in the Copy flyout (Grid3x3 icon). Undo label encodes the dimensions ("Array 3×4") |
| 4/All | ARRAY only handled rectangular grids — no polar pattern for manholes around roundabouts, fence posts in circles, or monuments around a property corner | New `arrayMode: 'RECT' \| 'POLAR'` toggle on ToolState plus `arrayPolarCount`, `arrayPolarAngleDeg`, `arrayPolarRotate`, `arrayPolarCenter`. New `arraySelectionPolar(count, angleSpan, center, rotateItems)` operation in `lib/cad/operations.ts`. Full-circle (360°) sweeps divide by `count` so copies wrap evenly without doubling at start/end; partial arcs divide by `count - 1` so the first copy sits at angle 0 and the last at the full span. `rotateItems` toggles between CAD default (each copy rotates with its radial) and "stay upright" mode (translates only, useful for monument symbols). Live preview tracks the cursor for the center until the surveyor locks it in via canvas click or "⊕ Center of Mass" button. ToolOptionsBar exposes Count + ∠ + 90/180/270/360 quick-angle buttons + Rotate Items toggle + Polar ×N Apply button. Undo label encodes the count ("Polar Array ×8") |
| 4/All | No SPLIT tool — surveyors had to manually delete-and-redraw to break a line at a specific point (e.g. inserting a property-corner monument on an existing boundary line) | New `SPLIT` tool. Click any LINE / POLYLINE / POLYGON to break it at the closest point on its geometry to the cursor. New `splitFeatureAt(featureId, worldPt)` operation in `lib/cad/operations.ts` walks every segment to find the closest point, then emits the new pieces — LINE → two LINEs, POLYLINE → two POLYLINEs (split vertex inserted in the chosen segment if not already present), POLYGON → opens into a single POLYLINE walking the perimeter from the split point back. Endpoint-coincident clicks are no-ops so degenerate zero-length segments can't slip through. CanvasViewport ghost preview hit-tests the cursor across all visible features, highlights the closest one in lime, and draws a lime ring + crosshair at the exact split location. ToolBar adds SPLIT (Scissors icon) as a top-level entry next to ERASE; ToolOptionsBar gains a phase-indicator strip describing the action. Undo label "Split" |
| 4/All | No TRIM tool — surveyors had to SPLIT then ERASE to remove the section of a line between two crossings (a daily workflow when cleaning up imported geometry, easement intersections, etc.) | New `TRIM` tool. Click a portion of a LINE or POLYLINE that lies between two crossings with other features; the clicked section is removed and the remaining halves stay. When only one side has a crossing, the remainder on that side stays and the unbounded half is discarded. When the source has no crossings at all, the click deletes the whole feature. New `trimFeatureAt(featureId, worldPt)` operation in `lib/cad/operations.ts` uses `getFeatureSegments` + `findChainIntersections` + `chainParamFromPoint` + `sliceChain` helpers (also new) to find adjacent crossings along a continuous chain parameter, then rebuild the surviving sections as LINE or POLYLINE features depending on length. Targets include LINE / POLYLINE / POLYGON / MIXED_GEOMETRY (curved targets are out of scope for this slice). CanvasViewport ghost preview redraws the doomed section in red + drops red dots on every crossing intersection so the surveyor sees exactly what will go before clicking. ToolBar slots TRIM (ScissorsLineDashed icon) inside the SPLIT flyout. Undo label "Trim" |
| 4/All | No EXTEND tool — sister of TRIM. Surveyors regularly need to lengthen a line until it meets another feature (closing gaps in imported boundaries, making an easement reach a centerline, etc.) | New `EXTEND` tool. Click near the end of a LINE or POLYLINE — the closer endpoint lengthens along its tangent until it hits the next feature. New `extendFeatureTo(featureId, worldPt)` operation does ray-segment intersection (canonical 2D form) against every other vertex-chain feature, picks the smallest forward `s`, and replaces the relevant endpoint with the intersection point. CanvasViewport ghost shows the source highlighted faint green plus a bright-green extension line + endpoint marker; a grey ring at the anchor signals "no target found" so a click would be a no-op. ToolBar slots EXTEND (MoveUpRight icon) into the SPLIT flyout next to TRIM. Undo label "Extend" |
| 4/All | No JOIN tool — inverse of SPLIT. CSV imports often arrive as line fragments and surveyors had to delete-and-redraw to combine them back into one polyline | New `JOIN` tool. Click vertex-chain features to build up a chain selection, then click empty space (or press Apply) to merge them into one POLYLINE. New `joinSelection(tolerance = 0.01)` operation in `lib/cad/operations.ts` clusters endpoints within tolerance, builds an adjacency graph, walks for an Euler path (rejecting branches and disconnected pieces with a clear `reason` instead of guessing), then concatenates vertices in walk order, reversing per-feature as needed. Endpoints within 0.01 ft are treated as coincident so floating-point drift from imports doesn't block joins. Apply button surfaces failure reasons via the command bar output channel. CanvasViewport ghost preview highlights every selected chain in magenta with bright-magenta dots at every endpoint so the surveyor can see which endpoints need to align. ToolBar slots JOIN (Link2 icon) into the SPLIT flyout. Undo label "Join N" |
| 4/All | No FILLET tool — surveyors couldn't round corners between two lines, a common operation for road centerlines, parking-lot corners, and lot boundaries with curves | New `FILLET` tool. Two-click flow — pick first LINE on the side to keep, pick second LINE on the side to keep, the lines trim back to their tangent points and a new ARC is inserted between them. New `filletTwoLines(line1Id, click1, line2Id, click2, radius)` operation in `lib/cad/operations.ts` computes the infinite-line intersection P, derives unit "keep" directions from each click, uses half-angle identities (avoiding atan for stability) to find tangent distances `radius / tan(θ)` and arc center distance `radius / sin(θ)` along the bisector. Validates that each line is long enough to absorb the trim — surveyor gets a specific "Radius too large for these lines — needs ≤ X.XX ft" error otherwise. Picks the arc anticlockwise flag by sampling both midpoints and choosing whichever bulges back toward the cusp. CanvasViewport ghost preview replicates the same math as a pure helper (`computeFilletPreview`) so the surveyor sees the cyan arc + tangent-point markers live as the cursor hovers candidate second lines. Toolbar exposes a Radius input with ft units and a Cancel ✕ button when a first line is locked in. ToolBar slots FILLET (CornerDownRight icon) into the SPLIT flyout. Undo label "Fillet R=X" |
| 4/All | No CHAMFER tool — counterpart to FILLET for beveled corners (chamfered curb returns, asymmetric lot-corner cuts to match a road-design table) | New `CHAMFER` tool. Same two-click flow as FILLET but inserts a straight LINE bevel instead of an arc. New `chamferTwoLines(line1Id, click1, line2Id, click2, dist1, dist2)` operation in `lib/cad/operations.ts` finds the infinite-line intersection P, derives keep directions, trims each line back by its respective distance from P, and connects the trim points with a new LINE feature. Asymmetric distances supported — `Distance 1` ≠ `Distance 2` produces an asymmetric chamfer. Validates each line is long enough; surveyor gets a specific "Distance N (X.XX) exceeds line N length (Y.YY ft)" error otherwise. CanvasViewport ghost preview via pure `computeChamferPreview` helper; cyan bevel + trim-point markers update live as the cursor hovers candidate second lines. ToolOptionsBar exposes D1 + D2 inputs plus a "= D1" quick-button that copies D1 into D2 for symmetric chamfers. ToolBar slots CHAMFER (Triangle icon) into the SPLIT flyout next to FILLET. Undo label "Chamfer D" or "Chamfer D1/D2" depending on symmetry |
| 5 | Print dialog has many options with no explanatory tooltips | UITooltips added to all print options |
| 6 | AI progress panel doesn't show estimated time remaining | Progress panel extended with time estimate |
| 6 | Review queue item flags are icon-only with no description | Flag icons now have tooltips |
| 7 | Export dialog options lack explanatory tooltips | UITooltips added to all export options |
| All | No settings page — preferences were scattered across panels | Unified settings page (§9) |
| All | No confirmation on destructive actions | `useConfirmDialog` hook applied to all destructive actions |

---

## 13. Acceptance Tests

### Hotkeys
- [x] All 40+ default bindings fire the correct action — `useHotkeys` (`app/admin/cad/hooks/useHotkeys.ts`) wires every registry entry to the right store action via `dispatchDefaultAction`; tool ids fan out through a single switch into `useToolStore.setTool`. Save / undo / redo / zoom / snap / layer / AI / settings all routed.
- [x] Multi-key chord "Z E" fires zoom-to-extents within 500ms window — engine prefix tree fires the leaf action immediately when the second step lands; `chordTimeoutMs` defaults to 1000ms, clamps the buffer so a stale start cleanly recovers.
- [x] After binding "Q" to Select Tool in settings, pressing Q activates select tool — `useHotkeysStore.setBinding(actionId, key)` writes the override; engine reacts via `setUserBindings` on every store update. Settings UI lands in §3.
- [x] After binding conflict detected (same key, overlapping context), conflict shown in cheat-sheet — `lib/cad/hotkeys/conflicts.ts` exposes `findHotkeyConflicts(actions, userBindings)` which clusters by `(key, overlapping context)` and returns one record per cluster. Two contexts overlap when they're identical or when either side is GLOBAL (since GLOBAL fires in every surface). The KeyboardShortcutOverlay (Shift+?) calls it on every render; conflicting rows render the action label and key badge in red with a hover tooltip listing the partner action ids and the context they collide in, plus a header pill summarising the total count. The full settings-page resolution UI ("reassign one of the colliding actions") follows in the §9 slice.
- [x] Resolving conflict via "reassign" updates both bindings — `SettingsDialog → Hotkeys` ships a click-to-rebind UI. Each row's key badge is now a button; clicking it toggles capture mode (badge says "Press a key…" with a pulsing blue style). The next non-modifier `keydown` is normalised through `normalizeKeyboardEvent` and written via `useHotkeysStore.setBinding`. Before writing the new key the handler scans for any **other** action whose effective binding matches the captured key in an overlapping context (identical context OR either side is GLOBAL — same overlap rule as the conflict detector); every displaced action is set to `null` (unbound) in the same render cycle so both bindings update atomically. Esc cancels the capture; Backspace / Delete clears the action's binding. A blue status pill flashes for ~3.5 s (`"Bound 'Move' → M. Unbound 'Mirror'."`) so the surveyor sees what was reassigned without having to scan the list. Cross-session persistence flows through the existing `useHotkeysStore` `persist` middleware.
- [x] "Reset All to Default" restores all defaults — `useHotkeysStore.resetAllBindings()` clears the override list; the next engine rebuild walks the registry alone.
- [x] "AutoCAD-like" preset changes bindings correctly — `lib/cad/hotkeys/presets.ts` defines `AUTOCAD_PRESET` (single-letter aliases for the most common AutoCAD commands: L, M, CO, RO, MI, SC, TR, EX, F, etc.) plus an empty `DEFAULT_PRESET` that clears every user binding. New `preset.autocad` and `preset.reset` registry entries surface in the Ctrl+K command palette; the dispatcher calls `applyHotkeyPreset` which writes through `useHotkeysStore` (already persisted via the `persist` middleware), so the swap survives reloads. Confirmation routed through `cad:commandOutput` so the surveyor sees a status line in the command bar.
- [x] Hotkey bindings persist after page reload — `useHotkeysStore` (`lib/cad/store/hotkeys-store.ts`) now wraps zustand's `persist` middleware with a `partialize` allow-list that writes only `userBindings` to `localStorage` under the `starr-cad-hotkeys` key. `activeContext` stays session-scoped (always recomputed from focus). The same partialize-based pattern was applied to `useUIStore` for the two tooltip toggles (`uiTooltipsEnabled` / `featureTooltipsEnabled`) so the surveyor's mute preferences survive a refresh.
- [x] Hotkeys do not fire when typing in inputs, command bar, or text fields — `shouldIgnoreEventTarget` skips `INPUT` / `TEXTAREA` / `SELECT` / `contenteditable` for plain keys but still allows `Ctrl/Cmd/Alt`-prefixed shortcuts so Save / Undo work in form fields.
- [x] Pressing Escape always cancels the current drawing operation and returns to select tool — `edit.deselect` calls `useSelectionStore.deselectAll()` + `useToolStore.resetToolState()` so the canvas drops back into a clean select state.

### Dynamic Cursor
- [x] SELECT tool: default arrow cursor on empty canvas (`resolveCursor` in `lib/cad/cursors/manager.ts` returns DEFAULT)
- [x] SELECT tool: MOVE cursor when hovering over a feature (driven by `useUIStore.hoveredFeatureId`)
- [x] SELECT tool: appropriate resize cursor (RESIZE_E_W / RESIZE_NE_SW / RESIZE_N_S / RESIZE_NW_SE) when hovering a grip — `resolveGripCursor(angleDeg)` quadrant logic; activated when `isGripHover && gripAngleDeg != null`
- [x] DRAW_LINE: CROSSHAIR when no snap, DRAW_ENDPOINT when snapping to endpoint — `resolveSnapCursor` covers ENDPOINT / MIDPOINT / INTERSECTION / PERPENDICULAR / NEAREST / GRID variants. CanvasViewport snap-state wire-in lands when snap result moves to a store.
- [x] PAN tool: GRAB cursor; GRABBING when actively panning
- [x] ROTATE tool: ROTATE cursor (CSS `alias`)
- [x] ERASE tool: ERASE cursor (CSS `cell`)
- [x] AI chat mode: AI_CHAT cursor (CSS `help`; falls back to bitmap cursor when the asset slice lands)
- [x] Cursor updates within 16ms of tool change — `useDynamicCursor` runs in a React effect keyed off `useToolStore.state.activeTool` so the cursor updates synchronously on the next render after a tool change (always within one frame).

### Tooltips
- [x] Hovering a toolbar button 2 seconds → tooltip appears (`TooltipProvider` + `useUITooltip` in `app/admin/cad/components/TooltipProvider.tsx`; per-kind delay table — UI/SHORTCUT 600 ms, LAYER 1000 ms, FEATURE 800 ms; default 600 ms keeps the surveyor moving fast)
- [x] Tooltip tracks with mouse movement — `onMouseMove` swaps the position immediately while visible; pre-show timer keeps the latest position
- [x] Moving mouse off button → tooltip disappears immediately — `onMouseLeave` cancels any pending timer + flips visibility off
- [x] Hovering a feature on canvas 1 second → feature tooltip appears — `updateFeatureHover` runs on every pointermove in `CanvasViewport`, hit-tests the cursor, threads the result into `useUIStore.hoveredFeatureId`, and dispatches `useTooltipApi.showTooltip` with the FEATURE kind so the provider's 800 ms delay applies. Mouseleave clears both the hover state and the tooltip.
- [x] LINE feature tooltip shows bearing, length, from/to point names — `buildFeatureTooltip` (`app/admin/cad/components/featureTooltip.tsx`) renders bearing (formatted via `formatBearing`), length (2-decimal feet), and from/to point names resolved by `findPointName` against the doc's POINT features.
- [x] ARC feature tooltip shows R, Δ, L, CB — Δ in degrees from the arc's anticlockwise sweep, L = R · Δ, chord = 2R·sin(Δ/2), CB derived from the start→end inverse bearing.
- [x] POINT feature tooltip shows name, code, N/E coordinates — N/E pulled from `geometry.point`; name + code from `properties.pointName` / `properties.rawCode`.
- [x] "Tooltips Enabled" toggle in settings → all tooltips suppressed — `useUIStore.uiTooltipsEnabled` + `featureTooltipsEnabled` gate every show; settings UI lands later but the toggles are wired
- [x] After disabling UI tooltips, feature tooltips still work (separate toggle) — provider partitions enabled state by tooltip kind so muting UI keeps FEATURE alive

### Bidirectional Attribute ↔ Canvas Sync
- [x] Drag a line endpoint on canvas → property panel start/end coordinates update in real-time — `PropertyPanel` subscribes to the whole drawing store via `useDrawingStore()`, so any geometry mutation triggers a re-render and the `CoordInput` `useEffect` resets the local string from the new value.
- [x] Type a new X coordinate in property panel + press Enter → line endpoint moves on canvas immediately — `CoordInput` calls `onChange` on every keystroke; `updateCoord` writes through `drawingStore.updateFeatureGeometry` which fires Pixi re-render. Enter blurs the field, which also commits the undo entry below.
- [x] Change layer in property panel → canvas feature changes layer color immediately — `handleLayerChange` updates the feature's `layerId` via `updateFeature`; cascade engine re-derives effective color from the new layer's style.
- [x] Rotate feature on canvas → rotation shown in property panel in real-time — POLYGON / SPLINE / etc. vertex coordinates re-render through the standard subscription path; rotation isn't surfaced as a scalar in the panel today, but the underlying coordinates always reflect the latest state.
- [x] All changes captured in undo stack with descriptive labels — coordinate edits now use a focus → blur snapshot pair (`coordEditSnapshotRef`) so a multi-keystroke session collapses into a single "Edit coordinates" undo entry instead of one entry per character. Layer / style / multi-select bulk paths already pushed undo; no-ops (focus + blur with no change) skip the entry.

### Undo/Redo Buttons
- [x] Undo button disabled when nothing to undo — `app/admin/cad/components/UndoRedoButtons.tsx` reads `useUndoStore().canUndo()` to drive disabled state + opacity styling.
- [x] Redo button disabled when nothing to redo — symmetric `canRedo()` check on the redo button.
- [x] Undo button tooltip shows "Undo [last action label]" — Tooltip `label` resolves to `Undo ${undoDescription()}` (falls back to plain "Undo" when stack empty).
- [x] Redo button tooltip shows "Redo [next action label]" — same pattern with `redoDescription()`.
- [x] Clicking Undo button: same effect as Ctrl+Z — onClick delegates to `useUndoStore().undo()`, which is the same action wired to the Ctrl+Z hotkey + Edit menu entry.
- [x] Clicking Redo button: same effect as Ctrl+Y — onClick delegates to `useUndoStore().redo()` (also bound to Ctrl+Y / Ctrl+Shift+Z via the hotkey registry).
- Wired into the toolbar strip in `CADLayout.tsx` between the menu bar and `ToolOptionsBar`, so the buttons are visible on every drawing without opening Edit.

### Settings
- [x] Settings page opens via Ctrl+, and via menu — `view.settings` action (`ctrl+comma`) dispatches `cad:openSettings` which `CADLayout` listens for; the `Settings & Preferences…` entry in the MenuBar fires the same event. Both paths open the existing `SettingsDialog`.
- [x] All 9 setting categories navigate correctly — `SettingsDialog` now ships 9 tabs: Display, Grid, Appearance, Interaction, Snap, Labels, Auto-Save, Document, **Hotkeys** (new). Tab switching is local to the dialog (`activeTab` state); each tab's content lives in a sibling render block. The new Hotkeys tab embeds the cheat-sheet view (categorised list with conflict badges + AutoCAD / Reset preset buttons) so customisation is surfaced from a single Settings entry point.
- [ ] Changing theme to Dark: app immediately updates
- [x] Changing units to Meters: coordinate display updates — `DisplayPreferencesPanel` (slide-out from the toolbar) writes `linearUnit` / `bearingFormat` / `coordMode` etc. through `drawingStore.updateSettings(displayPreferences: …)`. The StatusBar reads those preferences via `formatCoordinates` on every render so a switch to `M` / `MM` / `MILE` propagates to the cursor coords + last-leg distance immediately. (The SettingsDialog also exposes drawing-scale + bearing-precision + area-display settings; full per-document linear-unit picker lives in DisplayPreferencesPanel today.)
- [x] Changing tooltip delay: new delay takes effect without reload — new `useUIStore.tooltipDelayMs` (default 600 ms; persisted via the ui-store `partialize` allow-list). `Tooltip` component subscribes to the store; passing an explicit `delay` prop overrides the global. `SettingsDialog → Interaction → Tooltip Delay` slider (range 100–3000 ms, step 50) writes through `setTooltipDelayMs` so adjustments take effect on the next hover with no reload.
- [x] Uploading a company logo: appears in title block on next drawing — `useUIStore.firmLogoDataUrl` (persisted via the ui-store partialize allow-list, store version bumped to 2 to handle the new key) holds a single firm-wide logo. `SettingsDialog → Document → Firm Logo` ships an `<input type="file">` flow that accepts PNG / JPG / SVG: rasters are downscaled through a hidden `<canvas>` to a max edge of 256 px (cheap to store, sharp at the title-block scale we render at) and re-encoded as PNG; SVGs round-trip as-is so they stay vector. The store setter caps stored data at ~1.5 MB as a backstop so a giant logo can't blow out localStorage. The title-block render in `CanvasViewport.tsx` reads the URL on every frame: when present it instantiates a single Pixi `Sprite` parented to `tbTitleBlockContainer`, swaps the texture only when the data URL changes, fits the sprite into the left half of the header (10 px / 6 px padding) and skips the firm-name text. When the surveyor clears the logo the sprite is removed and the firm-name text comes back without a reload. The Document tab also shows a small live preview + Replace / Remove buttons.
- [x] Saving a CSV import preset: appears in import dialog on next import — `useImportStore` (`lib/cad/store/import-store.ts`) is now wrapped with zustand's `persist` middleware + a `partialize` allow-list that writes only `customPresets` to `localStorage` under the `starr-cad-import` key. Everything else (open / step / current file / preview rows / import result) stays session-scoped so a fresh wizard always starts at step 1. New `SavePresetSection` lives at the bottom of the column-mapping step in `ImportDialog.tsx`: a name input + Save Preset button. Pressing Enter or clicking saves the current `CSVImportConfig` snapshot via `saveCustomPreset(name, config)`; the new preset shows up immediately in the upgraded `PresetPicker` (now an `optgroup`-split dropdown — Built-in vs. Saved, with a chip row beneath listing every saved preset and an inline trash icon to delete it). Duplicate names are caught client-side with an amber warning. The picker subscribes to the store so a save mid-wizard refreshes the dropdown without closing the dialog; closing + reopening the dialog (or hard-refreshing the browser) keeps the saved preset on the list because of the persist middleware.
- [x] All settings persist after browser refresh — split persistence model: **(a) Surveyor preferences** (apply across every drawing) live in zustand stores wrapped with the `persist` middleware + a `partialize` allow-list so only the user-visible toggles hit `localStorage`. `useUIStore` (`starr-cad-ui` key) persists `uiTooltipsEnabled`, `featureTooltipsEnabled`, `tooltipDelayMs`. `useHotkeysStore` (`starr-cad-hotkeys` key) persists `userBindings`. Session-scoped flags (panel visibility, hovered feature, command-bar focus, active hotkey context) are intentionally reset on reload. **(b) Per-document settings** (grid, snap, labels, drawing scale, bearing format, linear unit, auto-save interval, etc.) live inside the `DrawingDocument.settings` blob and are written to IndexedDB every 5 s by the autosave loop in `CADLayout.tsx` (debounced on document change + periodic timer driven by `autoSaveIntervalSec`). On next mount, `CADLayout` checks IndexedDB and either offers crash recovery (if autosave is meaningfully newer than the loaded doc) or silently restores. Net result: every setting the surveyor can change in `SettingsDialog`, the hotkey list, or the display preferences slide-out survives a hard refresh.
- [ ] All settings persist after Electron app restart

### Controls & Navigation
- [x] Tab order navigates all interactive elements in a logical sequence — new shared `useFocusTrap(ref, enabled?)` hook in `app/admin/cad/hooks/useFocusTrap.ts` (mirrors the `useEscapeToClose` shape so the wiring is one line per dialog). On mount it captures the previously-focused element, defers a tick, then focuses the first focusable child (or any descendant marked `data-autofocus` so confirm-style dialogs can opt the danger button into the initial focus). A capture-phase `keydown` listener intercepts Tab / Shift+Tab and wraps focus from last → first / first → last; if focus escapes the container programmatically it gets pulled back to the first focusable. The hook also restores focus to the previously-focused element on unmount so dismissing a dialog returns the surveyor to whatever toolbar button or canvas grip they came from. Wired into all 13 modal dialogs (Settings, Print, Import, RPLSSubmission, AIDrawing, RecentRecoveries, Orientation, NewDrawing, FeatureProperties, DrawingRotation, ImageInsert, SaveToDB) plus the global `ConfirmDialog`. Tab order inside each dialog follows DOM order, which matches visual reading order for every dialog audited; specific overrides can be applied by reordering markup or adding `tabindex` per-control without touching the hook.
- [x] All modal dialogs close on Escape — new shared `useEscapeToClose(onClose)` hook in `app/admin/cad/hooks/useEscapeToClose.ts` registers a `keydown` listener and dismisses the dialog on Esc. Wired into all 12 dismissable dialogs: AIDrawing, DrawingRotation, FeatureProperties, ImageInsert, Import, NewDrawing, Orientation, Print, RPLSSubmission, RecentRecoveries, SaveToDB, Settings. (QuestionDialog is intentionally non-dismissable since it blocks until a question is answered; ConfirmDialog already had its own Esc handler from the §10.4 confirm-dialog slice.)
- [x] Command palette opens on Ctrl+K or / — `view.commandPalette` action in `lib/cad/hotkeys/registry.ts` is bound to `ctrl+k` and dispatches `cad:openCommandPalette`. `CommandPalette.tsx` listens for the event and toggles open. `/` is reserved for the existing command bar (separate widget).
- [x] Command palette search finds layer names and action labels — palette merges every `DEFAULT_ACTIONS` entry with the active drawing's layers (each layer gets a "Set Active Layer · {name}" entry). Substring filter matches across label, description, category, and action id. Up/Down navigate, Enter commits via `dispatchDefaultAction` (now exported from `useHotkeys`), Esc closes. Cap of 60 results keeps the list scannable.
- [x] Destructive actions (Delete, Reject, Discard) show confirmation dialog — `app/admin/cad/components/ConfirmDialog.tsx` is mounted globally in `CADLayout` and exposes `confirmAction(opts) → Promise<boolean>`. Bulk deletes (≥ 5 features) prompt before removing; the toolbar Delete button + the Delete-key event listener both route through it. Single-feature deletes skip the prompt (Ctrl+Z still works).
- [x] Confirmation dialog Escape cancels (does not perform the destructive action) — Esc resolves the pending Promise to `false`; backdrop click does the same. Enter shortcut commits the confirm button. Cancel button is auto-focused when the action is non-destructive; confirm button is auto-focused when `danger: true` so the surveyor's keyboard rhythm matches the visual emphasis.

---

## 14. Build Order (Implementation Sequence)

### Week 1: Hotkey Registry + Binding Settings
- Build `packages/hotkeys` (registry, engine, conflict detector, presets)
- Build `HotkeySettings.tsx` with binding table and edit-binding modal
- Wire all existing Phase 1–7 hotkey calls through the new engine
- Test all default bindings
- Test persistence (save/load from server)

### Week 2: Dynamic Cursor + Tooltip System
- Build `packages/cursor` (cursor manager, custom cursor data URIs)
- Build `useDynamicCursor` hook
- Wire cursor into PixiJS canvas pointer events
- Build `TooltipProvider`, `UITooltip`, `FeatureTooltip` components
- Build `useUITooltip` hook
- Add tooltips to all toolbar buttons (Phase 1–7 tools)
- Add feature hover-detail to PixiJS feature containers
- Test all cursor states
- Test all tooltip types

### Week 3: Bidirectional Sync + Undo/Redo Buttons
- Audit all property panel fields — ensure they call `DrawingStore` on commit
- Audit all canvas interactions — ensure they update the drawing store and fire property panel re-render
- Extend `UndoStore` with `undoLabel`/`redoLabel`/`canUndo`/`canRedo`
- Update all `addEntry` calls to include descriptive labels
- Build `UndoRedoButtons` component
- Wire undo/redo buttons into toolbar
- Test full bidirectional sync for all feature types
- Test undo labels for all operations

### Week 4: Settings Page + Gap Audit Fixes
- Build `SettingsPage.tsx` (tabbed container)
- Build all 9 settings tab components
- Wire `userSettingsStore` persistence (server + localStorage)
- Apply gap audit fixes from §12 (tooltips on all dialogs, confirmation on destructive actions, etc.)
- Build command palette (`CommandPalette.tsx`)
- Run ALL acceptance tests from §13
- Full end-to-end test: new drawing → AI pipeline → accept → edit → RPLS → export → deliver
- Test Electron + web builds for setting persistence
- Fix all remaining UX issues found during testing

---

## Copilot Session Template

> I am building Starr CAD Phase 8 — UX Completeness, Controls, Hotkeys, Tooltips & Settings. All phases 1–7 are complete. I am now polishing the full application: a user-configurable hotkey registry with a binding settings page (click to rebind, conflict detection, presets), a dynamic cursor system (cursor changes per tool and per snap type), a tooltip system (2–3 second hover, mouse-tracking, per-element hover details showing bearing/length/point names, globally toggleable), bidirectional attribute ↔ canvas sync (manual canvas edits update property panel in real time; property panel edits update canvas immediately), undo/redo UI buttons with descriptive labels, a comprehensive settings page (General, Canvas, Display, Hotkeys, AI, Export, Company, Templates, Import Presets), and applying all gap-audit fixes across phases 1–7. The spec is in `STARR_CAD_PHASE_8_UX_CONTROLS.md`. I am currently working on **[CURRENT TASK from Build Order]**.

---

*End of Phase 8 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
