// lib/cad/ai/proposals.ts
//
// Phase 6 §32.13 Slice 5 — COPILOT proposal queue types +
// dispatcher. The AIStore holds the queue of pending proposals
// (one shows as a `CopilotCard` at a time); accepting routes
// through this module's `executeProposal`, which dispatches the
// proposed `toolName` against the tool registry (Slice 2),
// stamping provenance (Slice 3) + threading the surveyor's
// sandbox preference (Slice 4) automatically.

import {
  toolRegistry,
  type ToolResult,
  type ToolName,
  type AddPointArgs,
  type DrawLineBetweenArgs,
  type DrawPolylineThroughArgs,
  type CreateLayerArgs,
  type ApplyLayerStyleArgs,
} from './tool-registry';
import type { AIProvenance } from './provenance';

/**
 * One AI proposal queued for COPILOT review. The shape stays
 * narrow on purpose — the card renders `description` + the
 * tool name; ghost previews read `args` directly via the
 * canvas `cad:copilotPreview` event.
 */
export interface AIProposal {
  /** Stable id for keying the card + matching webhook callbacks. */
  id: string;
  /** When the proposal was enqueued (ms since epoch). */
  createdAt: number;
  /** The tool to invoke when the surveyor accepts. */
  toolName: ToolName;
  /** Args object — discriminated by `toolName` at execute time. */
  args:
    | AddPointArgs
    | DrawLineBetweenArgs
    | DrawPolylineThroughArgs
    | CreateLayerArgs
    | ApplyLayerStyleArgs;
  /** Human-readable summary the card shows. One sentence. */
  description: string;
  /** AI's confidence in the proposal, 0–1. */
  confidence: number;
  /** Provenance stamped on every feature this proposal produces.
   *  Layer-op tools currently ignore it (no `properties` channel),
   *  but the field travels along anyway so a future slice can
   *  add layer-level provenance without breaking the type. */
  provenance: AIProvenance;
  /** Override for the sandbox toggle's default value. When
   *  omitted the store falls back to the active `aiStore.sandbox`
   *  per §32.3. */
  sandboxDefault?: boolean;
}

/**
 * Dispatch the proposed tool call. Threads `sandbox` into the
 * tool args alongside any caller-supplied value — the surveyor's
 * card-time choice always wins.
 *
 * Layer-producing tools (`createLayer`, `applyLayerStyle`) carry
 * provenance but don't accept a sandbox arg; the param is dropped
 * on the floor for those calls.
 */
export function executeProposal(
  proposal: AIProposal,
  sandbox: boolean,
): ToolResult<unknown> {
  const { toolName, args, provenance } = proposal;
  switch (toolName) {
    case 'addPoint':
      return toolRegistry.addPoint.execute({
        ...(args as AddPointArgs),
        provenance,
        sandbox,
      });
    case 'drawLineBetween':
      return toolRegistry.drawLineBetween.execute({
        ...(args as DrawLineBetweenArgs),
        provenance,
        sandbox,
      });
    case 'drawPolylineThrough':
      return toolRegistry.drawPolylineThrough.execute({
        ...(args as DrawPolylineThroughArgs),
        provenance,
        sandbox,
      });
    case 'createLayer':
      return toolRegistry.createLayer.execute(args as CreateLayerArgs);
    case 'applyLayerStyle':
      return toolRegistry.applyLayerStyle.execute(args as ApplyLayerStyleArgs);
  }
}
