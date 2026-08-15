// lib/cad/ai/proposals.ts
//
// Phase 6 §32.13 Slice 5 — COPILOT proposal queue types +
// dispatcher. The AIStore holds the queue of pending proposals
// (one shows as a `CopilotCard` at a time); accepting routes
// through this module's `executeProposal`, which dispatches the
// proposed `toolName` against the tool registry (Slice 2),
// stamping provenance (Slice 3) + threading the surveyor's
// sandbox preference (Slice 4) automatically.
//
// C38 — the dispatch is generic over the registry rather than a
// switch over five hand-listed names. See `executeProposal`.

import {
  toolRegistry,
  isProposalTool,
  type ToolResult,
  type ProposalToolName,
  type AddPointArgs,
  type DrawLineBetweenArgs,
  type DrawPolylineThroughArgs,
  type DrawRectangleArgs,
  type DrawCircleArgs,
  type DrawArcArgs,
  type DrawTextArgs,
  type CreateLayerArgs,
  type ApplyLayerStyleArgs,
  type MoveFeaturesArgs,
  type RotateFeaturesArgs,
  type ScaleFeaturesArgs,
  type MirrorFeaturesArgs,
  type DeleteFeaturesArgs,
} from './tool-registry';
import type { AIProvenance } from './provenance';
import { runAsOneAIBatch } from './undo-batch';

/** Every argument shape a proposal can carry — one per writing tool in the registry. */
export type ProposalArgs =
  | AddPointArgs
  | DrawLineBetweenArgs
  | DrawPolylineThroughArgs
  | DrawRectangleArgs
  | DrawCircleArgs
  | DrawArcArgs
  | DrawTextArgs
  | CreateLayerArgs
  | ApplyLayerStyleArgs
  | MoveFeaturesArgs
  | RotateFeaturesArgs
  | ScaleFeaturesArgs
  | MirrorFeaturesArgs
  | DeleteFeaturesArgs;

/**
 * One AI proposal queued for COPILOT review. The shape stays
 * narrow on purpose — the card renders `description` + the
 * tool name; ghost previews read `args` through
 * `buildPreviewShapes` and travel on the canvas
 * `cad:copilotPreview` event.
 */
export interface AIProposal {
  /** Stable id for keying the card + matching webhook callbacks. */
  id: string;
  /** When the proposal was enqueued (ms since epoch). */
  createdAt: number;
  /** The tool to invoke when the surveyor accepts. Restricted to
   *  the registry's WRITING tools — read-only tools (solvers,
   *  C36's measurements) never appear here; they flow through the
   *  dialogue UI directly, because there is nothing to approve. */
  toolName: ProposalToolName;
  /** Args object — discriminated by `toolName` at execute time. */
  args: ProposalArgs;
  /** Human-readable summary the card shows. One sentence. */
  description: string;
  /** AI's confidence in the proposal, 0–1. */
  confidence: number;
  /** Provenance stamped on every feature this proposal produces.
   *  Layer-op and modify tools currently ignore it (no `properties`
   *  channel of their own), but the field travels along anyway so a
   *  future slice can widen it without breaking the type. */
  provenance: AIProvenance;
  /** Override for the sandbox toggle's default value. When
   *  omitted the store falls back to the active `aiStore.sandbox`
   *  per §32.3. */
  sandboxDefault?: boolean;
}

/**
 * Dispatch the proposed tool call, as one undoable AI turn.
 *
 * C38 — this was a `switch` over five hand-listed tool names with no `default`. TypeScript read it
 * as exhaustive because `ProposalToolName` was those same five names; the runtime disagreed, because
 * `blockToProposal` casts any non-solver registry tool into that type. So a `drawRectangle` or
 * `deleteFeatures` proposal reached this function, matched no case, and fell out the bottom
 * returning `undefined` — which the card reads as "no error" and reports as applied. **Accept said
 * it worked and nothing happened**, for nine of the fourteen writing tools.
 *
 * Dispatching through the registry itself removes the class of bug rather than the instance: there
 * is no list here to fall off. `provenance` and `sandbox` are threaded to every tool; the ones that
 * do not declare them ignore the extra keys, which is cheaper than maintaining a second list of
 * which tools take what.
 */
export function executeProposal(
  proposal: AIProposal,
  sandbox: boolean,
): ToolResult<unknown> {
  const { toolName, args, provenance } = proposal;
  if (!isProposalTool(toolName)) {
    // Reached only if a proposal was built for a read-only or unknown tool. Refusing out loud beats
    // the silent `undefined` this replaced: the surveyor sees why the card did nothing.
    return { ok: false, reason: `'${toolName}' is not a tool that can be applied to the drawing.` };
  }
  const def = toolRegistry[toolName] as { execute: (a: never) => ToolResult<unknown> };
  return runAsOneAIBatch(() =>
    def.execute({ ...args, provenance, sandbox } as never),
  ).result;
}
