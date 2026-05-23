// lib/cad/ai/solver-proposal.ts
//
// Helper for the Calc-Point / Close-Drawing dialogues to enqueue a
// solver result as an AIProposal that flows through the existing
// CopilotCard UI. The card paints a dashed ghost on the canvas via
// the `cad:copilotPreview` event channel; the user reviews +
// inverses + accepts (commits to drawing) or skips (clears ghost,
// nothing persisted). Exactly the user-chosen UX from slice C.
//
// See docs/planning/in-progress/CAD_POINTS_AND_AI.md slices C, D, E.

import { generateId } from '../types';
import type { Point2D } from '../types';
import type { AIProposal } from './proposals';
import type { AIProvenance } from './provenance';

/**
 * Build an addPoint proposal from a solver-computed coordinate.
 * `originLabel` becomes the proposal description and threads into
 * provenance so the ghost preview tells the surveyor *why* this
 * point was computed.
 */
export function buildSolverPointProposal(args: {
  point: Point2D;
  originLabel: string; // e.g. "Calc 4th corner of pillar"
  code?: string;
  confidence?: number;
}): AIProposal {
  const provenance: AIProvenance = {
    aiOrigin: `SOLVER_${args.originLabel.replace(/\s+/g, '_').slice(0, 64)}`,
    aiConfidence: args.confidence ?? 0.9,
    aiPromptHash: 'solver',
    aiSourcePoints: [],
    aiBatchId: generateId(),
  };

  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: 'addPoint',
    args: {
      x: args.point.x,
      y: args.point.y,
      code: args.code,
      provenance,
      sandbox: false,
    },
    description: `${args.originLabel} → suggested point at (${args.point.x.toFixed(3)}, ${args.point.y.toFixed(3)}).`,
    confidence: provenance.aiConfidence,
    provenance,
    sandboxDefault: false,
  };
}

/**
 * Build a polyline/polygon proposal from a solver-adjusted vertex
 * sequence (e.g. the Bowditch-corrected perimeter). Closed = true
 * draws as a POLYGON so the renderer fills it like a real plat
 * boundary.
 */
export function buildSolverPolylineProposal(args: {
  vertices: Point2D[];
  closed: boolean;
  originLabel: string;
  confidence?: number;
}): AIProposal {
  const provenance: AIProvenance = {
    aiOrigin: `SOLVER_${args.originLabel.replace(/\s+/g, '_').slice(0, 64)}`,
    aiConfidence: args.confidence ?? 0.85,
    aiPromptHash: 'solver',
    aiSourcePoints: [],
    aiBatchId: generateId(),
  };

  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: 'drawPolylineThrough',
    args: {
      points: args.vertices.map((v) => ({ x: v.x, y: v.y })),
      closed: args.closed,
      provenance,
      sandbox: false,
    },
    description: `${args.originLabel} → ${args.closed ? 'polygon' : 'polyline'} through ${args.vertices.length} vertices.`,
    confidence: provenance.aiConfidence,
    provenance,
    sandboxDefault: false,
  };
}
