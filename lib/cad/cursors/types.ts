// lib/cad/cursors/types.ts
//
// Phase 8 §4.1 — cursor enum + canonical CSS mapping.
//
// This first slice ships the built-in CSS cursors only.
// Custom-bitmap variants (DRAW_ENDPOINT marker, ROTATE arc,
// SCISSORS for trim, etc.) land in a follow-up slice once
// the asset pipeline grows a place to drop the SVG/PNG
// hotspot files.

export type CursorType =
  | 'DEFAULT'
  | 'CROSSHAIR'
  | 'CROSSHAIR_SNAP'
  | 'GRAB'
  | 'GRABBING'
  | 'RESIZE_NW_SE'
  | 'RESIZE_NE_SW'
  | 'RESIZE_N_S'
  | 'RESIZE_E_W'
  | 'MOVE'
  | 'DRAW'
  | 'DRAW_ENDPOINT'
  | 'DRAW_MIDPOINT'
  | 'DRAW_INTERSECT'
  | 'DRAW_PERPENDICULAR'
  | 'ROTATE'
  | 'SCALE'
  | 'TRIM'
  | 'EXTEND'
  | 'OFFSET'
  | 'ERASE'
  | 'TEXT'
  | 'MEASURE'
  | 'AI_CHAT'
  | 'WAIT'
  | 'NOT_ALLOWED';

/** Browser-native CSS cursor for each `CursorType`. The
 *  fallback chain on every entry uses only built-in
 *  cursors so the UX stays useful before the bitmap
 *  asset slice lands. */
export const CURSOR_CSS: Record<CursorType, string> = {
  DEFAULT:            'default',
  CROSSHAIR:          'crosshair',
  CROSSHAIR_SNAP:     'crosshair',
  GRAB:               'grab',
  GRABBING:           'grabbing',
  RESIZE_NW_SE:       'nwse-resize',
  RESIZE_NE_SW:       'nesw-resize',
  RESIZE_N_S:         'ns-resize',
  RESIZE_E_W:         'ew-resize',
  MOVE:               'move',
  DRAW:               'crosshair',
  DRAW_ENDPOINT:      'crosshair',
  DRAW_MIDPOINT:      'crosshair',
  DRAW_INTERSECT:     'crosshair',
  DRAW_PERPENDICULAR: 'crosshair',
  ROTATE:             'alias',
  SCALE:              'nesw-resize',
  TRIM:               'crosshair',
  EXTEND:             'crosshair',
  OFFSET:             'copy',
  ERASE:              'cell',
  TEXT:               'text',
  MEASURE:            'crosshair',
  AI_CHAT:            'help',
  WAIT:               'wait',
  NOT_ALLOWED:        'not-allowed',
};
