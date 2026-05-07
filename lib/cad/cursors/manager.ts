// lib/cad/cursors/manager.ts
//
// Phase 8 §4.2 — pure cursor resolver. Maps the active tool
// + UI state into the right `CursorType`. The React layer
// (`useDynamicCursor`) reads stores and feeds this; the
// resolver itself is store-free so unit tests can drive it
// directly.

import type { ToolType } from '../types';
import type { CursorType } from './types';

export interface CursorContext {
  tool:           ToolType;
  /** True while the surveyor is actively dragging — driven
   *  by ToolStore's `isDragging` flag. Promotes hover-style
   *  cursors (MOVE / GRAB) into their drag-mode siblings. */
  isDragging?:   boolean;
  /** True when the pointer is over a bindable feature on
   *  the canvas (used by SELECT to flip into MOVE). */
  hoverFeature?: boolean;
  /** True when the pointer is over a selection grip. */
  isGripHover?:  boolean;
  /** Grip orientation in degrees (0 = horizontal). Drives
   *  the resize-cursor variant. */
  gripAngleDeg?: number | null;
  /** Active snap type when a snap candidate exists. */
  snapType?:
    | 'ENDPOINT'
    | 'MIDPOINT'
    | 'INTERSECTION'
    | 'PERPENDICULAR'
    | 'NEAREST'
    | 'GRID'
    | null;
  /** True when the AI element-chat picker is active. */
  isAIChatMode?: boolean;
  /** True when an AI / IO operation is in flight. */
  isWaiting?:    boolean;
  /** Override the result with NOT_ALLOWED — caller decides
   *  when a hovered state is illegal (e.g. dragging onto a
   *  locked layer). */
  notAllowed?:   boolean;
}

export function resolveCursor(ctx: CursorContext): CursorType {
  if (ctx.notAllowed) return 'NOT_ALLOWED';
  if (ctx.isWaiting) return 'WAIT';
  if (ctx.isAIChatMode) return 'AI_CHAT';

  switch (ctx.tool) {
    case 'PAN':
      return ctx.isDragging ? 'GRABBING' : 'GRAB';

    case 'SELECT':
    case 'BOX_SELECT':
      if (ctx.isGripHover && ctx.gripAngleDeg !== null && ctx.gripAngleDeg !== undefined) {
        return resolveGripCursor(ctx.gripAngleDeg);
      }
      if (ctx.isDragging && ctx.hoverFeature) return 'MOVE';
      if (ctx.hoverFeature) return 'MOVE';
      return 'DEFAULT';

    case 'DRAW_POINT':
    case 'DRAW_LINE':
    case 'DRAW_POLYLINE':
    case 'DRAW_POLYGON':
    case 'DRAW_RECTANGLE':
    case 'DRAW_REGULAR_POLYGON':
    case 'DRAW_CIRCLE':
    case 'DRAW_CIRCLE_EDGE':
    case 'DRAW_ELLIPSE':
    case 'DRAW_ELLIPSE_EDGE':
    case 'DRAW_ARC':
    case 'DRAW_SPLINE_FIT':
    case 'DRAW_SPLINE_CONTROL':
    case 'DRAW_CURVED_LINE':
      return resolveSnapCursor(ctx.snapType ?? null);

    case 'MOVE':
    case 'COPY':
      return ctx.isDragging ? 'GRABBING' : 'MOVE';

    case 'ROTATE':
      return 'ROTATE';

    case 'SCALE':
      return 'SCALE';

    case 'MIRROR':
      return 'CROSSHAIR';

    case 'OFFSET':
      return 'OFFSET';

    case 'CURB_RETURN':
      return 'CROSSHAIR';

    case 'ERASE':
      return 'ERASE';

    case 'DRAW_TEXT':
      return 'TEXT';

    case 'INVERSE':
      return 'MEASURE';

    case 'FORWARD_POINT':
      return 'CROSSHAIR';

    case 'DRAW_IMAGE':
      return 'CROSSHAIR';

    default:
      return 'DEFAULT';
  }
}

function resolveSnapCursor(
  snapType: CursorContext['snapType']
): CursorType {
  switch (snapType) {
    case 'ENDPOINT':      return 'DRAW_ENDPOINT';
    case 'MIDPOINT':      return 'DRAW_MIDPOINT';
    case 'INTERSECTION':  return 'DRAW_INTERSECT';
    case 'PERPENDICULAR': return 'DRAW_PERPENDICULAR';
    case 'NEAREST':
    case 'GRID':          return 'CROSSHAIR_SNAP';
    default:              return 'CROSSHAIR';
  }
}

function resolveGripCursor(angleDeg: number): CursorType {
  // Normalise to [0, 180); resize cursors are symmetric
  // around 180°.
  const a = ((angleDeg % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'RESIZE_E_W';
  if (a < 67.5)               return 'RESIZE_NE_SW';
  if (a < 112.5)              return 'RESIZE_N_S';
  return 'RESIZE_NW_SE';
}
