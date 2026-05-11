// lib/cad/ai/mock-proposer.ts
//
// Phase 6 §32.13 Slice 5 — minimal canned-proposal helper. The
// real AI adapter (Slice 6) replaces this; for now, tests + the
// CopilotCard demo button use these factories to build proposals
// that walk the queue end-to-end without hitting the Claude API.

import { generateId } from '../types';
import type { AIProposal } from './proposals';
import type {
  AddPointArgs,
  DrawLineBetweenArgs,
  DrawPolylineThroughArgs,
} from './tool-registry';
import type { AIProvenance } from './provenance';

const MOCK_PROMPT_HASH = 'sha256-mock-proposer';

function mockProvenance(
  origin: string,
  confidence: number,
  sourcePoints: string[] = [],
): AIProvenance {
  return {
    aiOrigin: origin,
    aiConfidence: confidence,
    aiPromptHash: MOCK_PROMPT_HASH,
    aiSourcePoints: sourcePoints,
    aiBatchId: 'mock-batch',
  };
}

/** Build an `addPoint` proposal carrying mock provenance. */
export function mockAddPointProposal(
  args: AddPointArgs,
  opts: { confidence?: number; description?: string; sandboxDefault?: boolean } = {},
): AIProposal {
  const confidence = opts.confidence ?? 0.9;
  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: 'addPoint',
    args,
    description:
      opts.description ??
      `Drop a POINT at (${args.x.toFixed(2)}, ${args.y.toFixed(2)}).`,
    confidence,
    provenance: mockProvenance('COPILOT_addPoint', confidence),
    sandboxDefault: opts.sandboxDefault,
  };
}

/** Build a `drawLineBetween` proposal carrying mock provenance. */
export function mockDrawLineProposal(
  args: DrawLineBetweenArgs,
  opts: { confidence?: number; description?: string; sandboxDefault?: boolean } = {},
): AIProposal {
  const confidence = opts.confidence ?? 0.85;
  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: 'drawLineBetween',
    args,
    description:
      opts.description ??
      `Connect (${args.from.x.toFixed(2)}, ${args.from.y.toFixed(2)}) → (${args.to.x.toFixed(2)}, ${args.to.y.toFixed(2)}).`,
    confidence,
    provenance: mockProvenance('COPILOT_drawLineBetween', confidence),
    sandboxDefault: opts.sandboxDefault,
  };
}

/** Build a `drawPolylineThrough` proposal carrying mock provenance. */
export function mockDrawPolylineProposal(
  args: DrawPolylineThroughArgs,
  opts: { confidence?: number; description?: string; sandboxDefault?: boolean } = {},
): AIProposal {
  const confidence = opts.confidence ?? 0.8;
  const verb = args.closed ? 'POLYGON' : 'POLYLINE';
  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: 'drawPolylineThrough',
    args,
    description:
      opts.description ??
      `Draw a ${verb} through ${args.points.length} vertices.`,
    confidence,
    provenance: mockProvenance('COPILOT_drawPolylineThrough', confidence),
    sandboxDefault: opts.sandboxDefault,
  };
}
