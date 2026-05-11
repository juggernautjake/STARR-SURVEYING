// lib/cad/hotkeys/registry.ts
//
// Phase 8 §2.1 — the central `BindableAction` registry. Every
// action surface in CAD that can be bound to a key is listed
// here. The hotkey engine looks up actions by id; the
// settings page renders this list grouped by category.
//
// Pure data — adding a new action is a single new entry. Key
// strings follow the canonical format from `key-format.ts`
// (lowercase, modifier-sorted, space-separated chords).

import type { BindableAction } from './types';

export const DEFAULT_ACTIONS: BindableAction[] = [
  // File
  { id: 'file.new',          category: 'FILE',       label: 'New Document',         description: 'Create a new empty drawing',                  defaultKey: 'ctrl+n',       isChord: false, context: 'GLOBAL' },
  { id: 'file.open',         category: 'FILE',       label: 'Open File',            description: 'Open a .starr file from disk',                defaultKey: 'ctrl+o',       isChord: false, context: 'GLOBAL' },
  { id: 'file.save',         category: 'FILE',       label: 'Save',                 description: 'Save the current drawing',                    defaultKey: 'ctrl+s',       isChord: false, context: 'GLOBAL' },
  { id: 'file.saveAs',       category: 'FILE',       label: 'Save As…',             description: 'Save with a new name or location',            defaultKey: 'ctrl+shift+s', isChord: false, context: 'GLOBAL' },
  { id: 'file.print',        category: 'FILE',       label: 'Print / Export PDF',   description: 'Open the print/export dialog',                defaultKey: 'ctrl+p',       isChord: false, context: 'GLOBAL' },

  // Edit
  { id: 'edit.undo',         category: 'EDIT',       label: 'Undo',                 description: 'Undo the last action',                        defaultKey: 'ctrl+z',       isChord: false, context: 'GLOBAL' },
  { id: 'edit.redo',         category: 'EDIT',       label: 'Redo',                 description: 'Redo the last undone action',                 defaultKey: 'ctrl+y',       isChord: false, context: 'GLOBAL' },
  { id: 'edit.redo2',        category: 'EDIT',       label: 'Redo (Alt)',           description: 'Alternative redo shortcut',                   defaultKey: 'ctrl+shift+z', isChord: false, context: 'GLOBAL' },
  { id: 'edit.cut',          category: 'EDIT',       label: 'Cut',                  description: 'Cut selected features',                       defaultKey: 'ctrl+x',       isChord: false, context: 'CANVAS' },
  { id: 'edit.copy',         category: 'EDIT',       label: 'Copy',                 description: 'Copy selected features',                      defaultKey: 'ctrl+c',       isChord: false, context: 'CANVAS' },
  { id: 'edit.paste',        category: 'EDIT',       label: 'Paste',                description: 'Paste clipboard features',                    defaultKey: 'ctrl+v',       isChord: false, context: 'CANVAS' },
  { id: 'edit.selectAll',    category: 'EDIT',       label: 'Select All',           description: 'Select all visible features',                 defaultKey: 'ctrl+a',       isChord: false, context: 'CANVAS' },
  { id: 'edit.deselect',     category: 'SELECTION',  label: 'Deselect All',         description: 'Clear the current selection',                 defaultKey: 'escape',       isChord: false, context: 'CANVAS' },
  { id: 'edit.delete',       category: 'EDIT',       label: 'Delete Selected',      description: 'Delete selected features',                    defaultKey: 'delete',       isChord: false, context: 'CANVAS' },
  { id: 'edit.sendToLayer',  category: 'EDIT',       label: 'Send to Layer…',       description: 'Open the cross-layer copy / move / duplicate dialog with the active selection pre-loaded', defaultKey: 'ctrl+shift+l', isChord: false, context: 'CANVAS' },
  { id: 'tool.intersect',    category: 'TOOLS',      label: 'Intersect Lines…',     description: 'Open the Intersect dialog — pick two LINE features and drop a POINT where they cross (or would cross if extended)', defaultKey: 'i x',           isChord: true,  context: 'CANVAS' },

  // Tools
  { id: 'tool.select',       category: 'TOOLS',      label: 'Select Tool',          description: 'Activate the selection tool',                 defaultKey: 's',            isChord: false, context: 'CANVAS' },
  { id: 'tool.pan',          category: 'TOOLS',      label: 'Pan Tool',             description: 'Activate the pan tool',                       defaultKey: 'h',            isChord: false, context: 'CANVAS' },
  { id: 'tool.point',        category: 'TOOLS',      label: 'Draw Point',           description: 'Place a survey point',                        defaultKey: 'p',            isChord: false, context: 'CANVAS' },
  { id: 'tool.line',         category: 'TOOLS',      label: 'Draw Line',            description: 'Draw a line segment',                         defaultKey: 'l',            isChord: false, context: 'CANVAS' },
  { id: 'tool.polyline',     category: 'TOOLS',      label: 'Draw Polyline',        description: 'Draw a polyline (multiple segments)',         defaultKey: 'p l',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.polygon',      category: 'TOOLS',      label: 'Draw Polygon',         description: 'Draw a closed polygon',                       defaultKey: 'p g',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.arc',          category: 'TOOLS',      label: 'Draw Arc',             description: 'Draw a circular arc',                         defaultKey: 'a',            isChord: false, context: 'CANVAS' },
  { id: 'tool.spline',       category: 'TOOLS',      label: 'Draw Spline',          description: 'Draw a fit-point spline',                     defaultKey: 's p',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.text',         category: 'TOOLS',      label: 'Draw Text',            description: 'Place a text annotation',                     defaultKey: 't',            isChord: false, context: 'CANVAS' },
  { id: 'tool.move',         category: 'TOOLS',      label: 'Move',                 description: 'Move selected features',                      defaultKey: 'm',            isChord: false, context: 'CANVAS' },
  { id: 'tool.copyTool',     category: 'TOOLS',      label: 'Copy (Tool)',          description: 'Copy and place features',                     defaultKey: 'c o',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.rotate',       category: 'TOOLS',      label: 'Rotate',               description: 'Rotate selected features',                    defaultKey: 'r o',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.mirror',       category: 'TOOLS',      label: 'Mirror',               description: 'Mirror selected features',                    defaultKey: 'm i',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.scale',        category: 'TOOLS',      label: 'Scale',                description: 'Scale selected features',                     defaultKey: 's c',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.offset',       category: 'TOOLS',      label: 'Offset',               description: 'Create parallel offset geometry',             defaultKey: 'o',            isChord: false, context: 'CANVAS' },
  { id: 'tool.trim',         category: 'TOOLS',      label: 'Trim',                 description: 'Trim lines to cutting edges',                 defaultKey: 't r',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.extend',       category: 'TOOLS',      label: 'Extend',               description: 'Extend lines to boundary edges',              defaultKey: 'e x',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.fillet',       category: 'TOOLS',      label: 'Fillet / Curb Return', description: 'Create a curb return or fillet',              defaultKey: 'f',            isChord: false, context: 'CANVAS' },
  { id: 'tool.chamfer',      category: 'TOOLS',      label: 'Chamfer',              description: 'Bevel the corner between two LINEs with a straight LINE.',     defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.split',        category: 'TOOLS',      label: 'Split',                description: 'Break a line / polyline / polygon at the clicked point.',      defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.join',         category: 'TOOLS',      label: 'Join',                 description: 'Merge selected lines / polylines into one POLYLINE.',           defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.divide',       category: 'TOOLS',      label: 'Divide',               description: 'Drop POINT markers at equal arc-length intervals along a feature.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.explode',      category: 'TOOLS',      label: 'Explode',              description: 'Burst a POLYLINE / POLYGON into individual LINE features.',     defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.reverse',      category: 'TOOLS',      label: 'Reverse Direction',    description: 'Flip the direction of a LINE / POLYLINE / POLYGON.',           defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.matchProps',   category: 'TOOLS',      label: 'Match Properties',     description: 'Copy style + layer from one feature to another.',              defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.pointAtDist',  category: 'TOOLS',      label: 'Point at Distance',    description: 'Drop a POINT at exact arc-length from the start or end of a feature.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.perpendicular',category: 'TOOLS',      label: 'Perpendicular',        description: 'Drop a perpendicular line from a point to a target line.',     defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.smooth',       category: 'TOOLS',      label: 'Smooth (Polyline → Spline)', description: 'Convert a POLYLINE / POLYGON to a smooth SPLINE.',     defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.simplify',     category: 'TOOLS',      label: 'Simplify (RDP)',       description: 'Drop redundant vertices from a POLYLINE / POLYGON via Ramer-Douglas-Peucker.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.insertVertex', category: 'TOOLS',      label: 'Insert Vertex',        description: 'Insert a new vertex on a POLYLINE / POLYGON edge at the click point.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.removeVertex', category: 'TOOLS',      label: 'Remove Vertex',        description: 'Delete the closest vertex of a POLYLINE / POLYGON within pick radius.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.list',         category: 'TOOLS',      label: 'List (probe feature)', description: 'Click any feature to print its details to the command bar.',  defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.array',        category: 'TOOLS',      label: 'Array (rect / polar)', description: 'Replicate the selection in a rectangular grid or polar fan.',  defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.flip',         category: 'TOOLS',      label: 'Flip',                 description: 'Reflect the selection through its centroid (H / V / D1 / D2).', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.invert',       category: 'TOOLS',      label: 'Invert',               description: 'Point-invert (180° rotate) the selection through a clicked center.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.measureArea',  category: 'SURVEY_MATH',label: 'Measure Area',         description: 'Click polygon vertices to read live perimeter + area.',         defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'tool.erase',        category: 'TOOLS',      label: 'Erase',                description: 'Erase features',                              defaultKey: 'e',            isChord: false, context: 'CANVAS' },
  { id: 'tool.dim',          category: 'ANNOTATIONS',label: 'Bearing/Dist Dim',     description: 'Place a bearing/distance dimension',          defaultKey: 'd',            isChord: false, context: 'CANVAS' },
  { id: 'tool.leader',       category: 'ANNOTATIONS',label: 'Leader',               description: 'Place a leader annotation',                   defaultKey: 'l d',          isChord: true,  context: 'CANVAS' },
  { id: 'tool.inverse',      category: 'SURVEY_MATH',label: 'Inverse',              description: 'Compute bearing/distance between two points', defaultKey: 'i n v',        isChord: true,  context: 'CANVAS' },
  { id: 'tool.forward',      category: 'SURVEY_MATH',label: 'Forward Point',        description: 'Place point at bearing+distance',             defaultKey: 'f p',          isChord: true,  context: 'CANVAS' },

  // Zoom / Pan
  { id: 'view.zoomExtents',  category: 'ZOOM_PAN',   label: 'Zoom Extents',         description: 'Fit all features on screen',                  defaultKey: 'z e',          isChord: true,  context: 'CANVAS' },
  { id: 'view.zoomSelection',category: 'ZOOM_PAN',   label: 'Zoom to Selection',    description: 'Zoom to the selected features',               defaultKey: 'z s',          isChord: true,  context: 'CANVAS' },
  { id: 'view.zoomIn',       category: 'ZOOM_PAN',   label: 'Zoom In',              description: 'Zoom in',                                     defaultKey: 'ctrl+equal',   isChord: false, context: 'CANVAS' },
  { id: 'view.zoomOut',      category: 'ZOOM_PAN',   label: 'Zoom Out',             description: 'Zoom out',                                    defaultKey: 'ctrl+minus',   isChord: false, context: 'CANVAS' },

  // Snap
  { id: 'snap.toggle',       category: 'SNAP',       label: 'Toggle Snap',          description: 'Turn snap on or off',                         defaultKey: 'f3',           isChord: false, context: 'CANVAS' },
  { id: 'snap.grid',         category: 'SNAP',       label: 'Toggle Grid',          description: 'Show or hide the grid',                       defaultKey: 'f7',           isChord: false, context: 'CANVAS' },
  { id: 'snap.ortho',        category: 'SNAP',       label: 'Toggle Ortho',         description: 'Constrain drawing to 90° angles',             defaultKey: 'f8',           isChord: false, context: 'CANVAS' },

  // Layers
  { id: 'layer.panel',       category: 'LAYERS',     label: 'Toggle Layer Panel',   description: 'Show or hide the layer panel',                defaultKey: 'f2',           isChord: false, context: 'GLOBAL' },
  { id: 'layer.isolateBySelection', category: 'LAYERS', label: 'Isolate Layers by Selection', description: 'Show only layers that contain at least one currently-selected feature; hide everything else.', defaultKey: '', isChord: false, context: 'CANVAS' },
  { id: 'layer.showAll',     category: 'LAYERS',     label: 'Show All Layers',      description: 'Restore visibility on every layer in the document.', defaultKey: '', isChord: false, context: 'GLOBAL' },

  // AI
  { id: 'ai.start',          category: 'AI',         label: 'Start AI Drawing',     description: 'Open the AI drawing wizard',                  defaultKey: 'ctrl+shift+a', isChord: false, context: 'GLOBAL' },
  { id: 'ai.chat',           category: 'AI',         label: 'Focus AI Chat',        description: 'Focus the AI assistant chat input',           defaultKey: 'ctrl+shift+c', isChord: false, context: 'GLOBAL' },
  { id: 'ai.cycleMode',      category: 'AI',         label: 'Cycle AI Mode',        description: 'Cycle the AI integration mode: AUTO → COPILOT → COMMAND → MANUAL (Phase 6 §32)', defaultKey: 'ctrl+shift+m', isChord: false, context: 'GLOBAL' },

  // App / View
  { id: 'view.settings',     category: 'APP',        label: 'Open Settings',        description: 'Open the Settings page',                      defaultKey: 'ctrl+comma',   isChord: false, context: 'GLOBAL' },
  { id: 'view.commandBar',   category: 'APP',        label: 'Focus Command Bar',    description: 'Move focus to the command bar',               defaultKey: 'ctrl+shift+k', isChord: false, context: 'GLOBAL' },
  { id: 'view.commandPalette', category: 'APP',      label: 'Open Command Palette', description: 'Open the searchable command palette',         defaultKey: 'ctrl+k',       isChord: false, context: 'GLOBAL' },
  { id: 'view.shortcutHelp', category: 'APP',        label: 'Keyboard Shortcuts',   description: 'Show a cheat-sheet of every keyboard binding grouped by category', defaultKey: 'shift+slash',  isChord: false, context: 'GLOBAL' },
  { id: 'view.stats',        category: 'APP',        label: 'Drawing Stats',         description: 'Print a summary of the current drawing (feature count, total polygon area, total line length, layer count) to the command bar.', defaultKey: '', isChord: false, context: 'GLOBAL' },

  // Preset switchers — surfaced via the command palette so
  // the surveyor can swap between AutoCAD aliases and the
  // built-in defaults without diving into a settings dialog.
  // Persistence rides on `useHotkeysStore`'s `persist`
  // middleware so the choice survives page reloads.
  { id: 'preset.autocad',    category: 'APP',        label: 'Apply AutoCAD-style Hotkeys', description: 'Rewrite hotkeys to AutoCAD chord aliases (L for line, M for move, RO for rotate, etc.). Persists across reloads.', defaultKey: '', isChord: false, context: 'GLOBAL' },
  { id: 'preset.reset',      category: 'APP',        label: 'Reset Hotkeys to Defaults',   description: 'Clear every customised hotkey binding and fall back to the registry defaults. Persists across reloads.',                       defaultKey: '', isChord: false, context: 'GLOBAL' },
];

/** Build a lookup map keyed by action id. Stable across
 *  module reloads — pure derivation from `DEFAULT_ACTIONS`. */
export const DEFAULT_ACTIONS_BY_ID: ReadonlyMap<string, BindableAction> =
  new Map(DEFAULT_ACTIONS.map((a) => [a.id, a]));

export function findActionById(id: string): BindableAction | undefined {
  return DEFAULT_ACTIONS_BY_ID.get(id);
}
