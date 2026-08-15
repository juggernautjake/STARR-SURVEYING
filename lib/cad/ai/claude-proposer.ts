// lib/cad/ai/claude-proposer.ts
//
// Phase 6 §32.13 Slice 6 — real Claude API behind the COPILOT
// proposal queue. Takes the surveyor's prompt + the project
// context, calls Claude with the tool registry exposed as
// tools, and turns every `tool_use` block in the response into
// an `AIProposal` ready for `enqueueProposal`.
//
// Server-side only — pulls `ANTHROPIC_API_KEY` from the
// process environment, so callers must route through the
// /api/admin/cad/ai-propose route (Slice 6's UI wiring lives
// in Slice 7 once COMMAND mode lands).

import Anthropic from '@anthropic-ai/sdk';
import { MissingApiKeyError } from '../ai-engine/claude-deed-parser';
import {
  toolRegistry,
  isReadOnlyTool,
  type ToolName,
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
} from './tool-registry';
import type { AIProposal, ProposalArgs } from './proposals';
import type { AIProvenance } from './provenance';
import {
  buildSystemPrompt,
  hashPrompt,
  type ProjectContext,
} from './system-prompt';
import { generateId } from '../types';
import { modelFor } from '@/lib/ai/models';

const DEFAULT_MODEL = modelFor('reasoning').model;
const MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Narrow interface around the slice of the Anthropic SDK we
 * use, so tests can inject a fake without spinning up the
 * real client. Mirrors `client.messages.create` exactly.
 */
export interface ClaudeMessagesClient {
  messages: {
    create(params: Anthropic.Messages.MessageCreateParamsNonStreaming):
      | Promise<Anthropic.Messages.Message>
      | Anthropic.Messages.Message;
  };
}

export interface ProposeFromPromptOptions {
  /** Override the model id. Defaults to `claude-sonnet-4-6`. */
  model?: string;
  /** Inject a stub client (tests only). */
  client?: ClaudeMessagesClient;
  /** Cancellation hook (forwarded to the SDK). */
  signal?: AbortSignal;
  /** Images the surveyor attached for vision review (e.g. a hand
   *  sketch of a building). Sent as image blocks on the first turn so
   *  the model can read shape + dimensions and pair them to points. */
  images?: Array<{ base64: string; mediaType: string }>;
  /** Override the batch id stamped on every proposal's provenance.
   *  Defaults to a fresh UUID per call so an undo-batch can be
   *  built from the surveyor's "this turn" decision. */
  batchId?: string;
}

export interface ProposeFromPromptResult {
  /** Every tool_use block Claude emitted, turned into a proposal.
   *  Empty when Claude emitted text only (in which case the
   *  surveyor should be shown the `narrative`). */
  proposals: AIProposal[];
  /** Concatenated plain-text content from Claude's response.
   *  Used for caveats / clarification questions when the model
   *  decided not to call a tool. */
  narrative: string;
  /** End-to-end latency for the call (ms). */
  latencyMs: number;
  /** Model id that was used. */
  model: string;
}

/**
 * Run a single Claude turn. The tool registry is exposed as
 * the tool list; every `tool_use` block in the response becomes
 * one proposal in the returned array (and one entry to push
 * onto `useAIStore.proposalQueue` when the caller is server-
 * side — the route handler does that for us).
 */
export async function proposeFromPrompt(
  prompt: string,
  context: ProjectContext,
  options: ProposeFromPromptOptions = {},
): Promise<ProposeFromPromptResult> {
  const startTime = Date.now();
  const model = options.model ?? DEFAULT_MODEL;
  const batchId = options.batchId ?? generateId();

  let client: ClaudeMessagesClient;
  if (options.client) {
    client = options.client;
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new MissingApiKeyError();
    client = new Anthropic({ apiKey }) as unknown as ClaudeMessagesClient;
  }

  const systemPrompt = buildSystemPrompt(context);
  const promptHash = hashPrompt(systemPrompt);

  const tools: Anthropic.Messages.Tool[] = (Object.keys(toolRegistry) as ToolName[]).map((name) => {
    const def = toolRegistry[name];
    return {
      name: def.name,
      description: def.description,
      input_schema: def.inputSchema as Anthropic.Messages.Tool.InputSchema,
    };
  });

  // Race the SDK against a manual timeout so a stuck stream
  // can't hang the whole request.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener('abort', () => timeoutController.abort());
  }

  try {
    const proposals: AIProposal[] = [];
    const narrativeParts: string[] = [];
    // Agentic tool loop: the model can call deterministic SOLVER tools
    // (perpendicular foot, bearing/distance, intersection, fourth corner)
    // — we run those server-side and feed the result back so it can chain
    // a calculation into a placement. PLACEMENT tools (addPoint /
    // drawLineBetween / drawPolylineThrough) become proposals for the
    // surveyor to approve; we acknowledge them so the model can keep
    // building (e.g. a whole wall or fence run across several tool calls).
    // Attach any images on the first user turn (vision review).
    const images = options.images ?? [];
    const firstContent: Anthropic.Messages.MessageParam['content'] = images.length > 0
      ? [
          ...images.map((img) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
              data: img.base64,
            },
          })),
          { type: 'text' as const, text: prompt },
        ]
      : prompt;
    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: firstContent }];
    const MAX_ITERS = 6;

    for (let iter = 0; iter < MAX_ITERS; iter += 1) {
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        tools,
        // ephemeral cache the system prompt — repeated proposals in the
        // same session pay only the prompt tokens that change.
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          if (block.text.trim()) narrativeParts.push(block.text);
        } else if (block.type === 'tool_use') {
          if (isReadOnlyTool(block.name)) {
            // Deterministic calculator or measurement — run it and return the value to the model.
            // C38 widened this from solvers alone: a `measureFeature` call is a question the model
            // asked mid-reasoning, and answering it is what lets the next tool_use be right. Before
            // this it fell to the proposal branch and came back as a card offering to "apply" a
            // measurement, which applies nothing.
            let payload: string;
            try {
              const def = toolRegistry[block.name as ToolName];
              payload = JSON.stringify(def.execute(block.input as never));
            } catch (e) {
              payload = JSON.stringify({ ok: false, reason: e instanceof Error ? e.message : 'solver error' });
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: payload });
          } else {
            const proposal = blockToProposal(block, batchId, promptHash);
            if (proposal) proposals.push(proposal);
            // Acknowledge so the model can continue building; the actual
            // commit happens only when the surveyor approves the card.
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ ok: true, queuedForApproval: true }),
            });
          }
        }
      }

      // Continue only while the model paused for tool results.
      if (response.stop_reason === 'tool_use' && toolResults.length > 0) {
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
        continue;
      }
      break;
    }

    return {
      proposals,
      narrative: narrativeParts.join('\n\n').trim(),
      latencyMs: Date.now() - startTime,
      model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convert one `tool_use` block into an `AIProposal`. Returns
 * `null` when the block names a tool we don't register (defence
 * in depth — the model shouldn't emit one, but if it does the
 * runtime stays honest).
 */
function blockToProposal(
  block: Anthropic.Messages.ToolUseBlock,
  batchId: string,
  promptHash: string,
): AIProposal | null {
  const name = block.name as ToolName;
  if (!(name in toolRegistry)) return null;
  // Read-only tools never become proposals — solvers only compute, and C36's measurements only
  // report. Both are surfaced through the dialogue UI / ghost preview; the model should call them
  // mid-conversation, not as accept-this actions, and a block emitted in a single-turn response is
  // silently dropped here. See CAD_POINTS_AND_AI slice B.
  //
  // C38 — this used to test `isSolverTool`, which named eight tools while the type it guarded meant
  // "everything but the original five". C36's three measurement tools were in neither list, so a
  // `measureFeature` block became a proposal card offering to apply a measurement.
  if (isReadOnlyTool(name)) return null;
  const proposalName = name as ProposalToolName;

  const provenance: AIProvenance = {
    aiOrigin: `COPILOT_${proposalName}`,
    // Anthropic's response doesn't currently include a per-tool
    // confidence score, so we baseline at 0.8. Future slices can
    // promote a confidence emitted by the model in `narrative`.
    aiConfidence: 0.8,
    aiPromptHash: promptHash,
    aiSourcePoints: [],
    aiBatchId: batchId,
  };

  const args = (block.input ?? {}) as ProposalArgs;

  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: proposalName,
    args,
    description: describeArgs(proposalName, args),
    confidence: provenance.aiConfidence,
    provenance,
  };
}

/** Best-effort single-sentence summary for the proposal card. */
function describeArgs(name: ProposalToolName, args: unknown): string {
  if (name === 'addPoint') {
    const a = args as AddPointArgs;
    return `Drop a POINT at (${a.x.toFixed(2)}, ${a.y.toFixed(2)})${a.code ? ` with code ${a.code}` : ''}.`;
  }
  if (name === 'drawLineBetween') {
    const a = args as DrawLineBetweenArgs;
    return `Connect (${a.from.x.toFixed(2)}, ${a.from.y.toFixed(2)}) → (${a.to.x.toFixed(2)}, ${a.to.y.toFixed(2)}).`;
  }
  if (name === 'drawPolylineThrough') {
    const a = args as DrawPolylineThroughArgs;
    return `Draw a ${a.closed ? 'POLYGON' : 'POLYLINE'} through ${a.points.length} vertices.`;
  }
  if (name === 'createLayer') {
    const a = args as CreateLayerArgs;
    return `Create layer "${a.name}".`;
  }
  if (name === 'applyLayerStyle') {
    const a = args as ApplyLayerStyleArgs;
    const keys = Object.keys(a.style ?? {});
    return `Apply style (${keys.join(', ')}) to layer ${a.layerId.slice(0, 6)}.`;
  }
  // C38 — the nine writing tools C34/C35 added. Without these the card's one-sentence summary read
  // "Invoke deleteFeatures.", which is a description of the call and not of what it does.
  if (name === 'drawRectangle') {
    const a = args as DrawRectangleArgs;
    const w = Math.abs(a.opposite.x - a.corner.x);
    const h = Math.abs(a.opposite.y - a.corner.y);
    return `Draw a ${w.toFixed(2)} × ${h.toFixed(2)} ft rectangle.`;
  }
  if (name === 'drawCircle') {
    const a = args as DrawCircleArgs;
    return `Draw a circle of radius ${a.radius.toFixed(2)} ft at (${a.center.x.toFixed(2)}, ${a.center.y.toFixed(2)}).`;
  }
  if (name === 'drawArc') {
    const a = args as DrawArcArgs;
    return `Draw an arc from (${a.start.x.toFixed(2)}, ${a.start.y.toFixed(2)}) to (${a.end.x.toFixed(2)}, ${a.end.y.toFixed(2)}).`;
  }
  if (name === 'drawText') {
    const a = args as DrawTextArgs;
    return `Place the note “${a.text}” at (${a.at.x.toFixed(2)}, ${a.at.y.toFixed(2)}).`;
  }
  const ids = (args as { ids?: string[] }).ids;
  if (name === 'moveFeatures') {
    const a = args as { dx: number; dy: number };
    return `Move ${ids?.length ?? 0} feature(s) ${a.dx.toFixed(2)} ft east and ${a.dy.toFixed(2)} ft north.`;
  }
  if (name === 'rotateFeatures') {
    return `Rotate ${ids?.length ?? 0} feature(s) ${(args as { angleDeg: number }).angleDeg.toFixed(4)}°.`;
  }
  if (name === 'scaleFeatures') {
    return `Scale ${ids?.length ?? 0} feature(s) by ×${(args as { factor: number }).factor}.`;
  }
  if (name === 'mirrorFeatures') {
    return `Mirror ${ids?.length ?? 0} feature(s) across the given axis.`;
  }
  if (name === 'deleteFeatures') {
    return `Delete ${ids?.length ?? 0} feature(s).`;
  }
  return `Invoke ${name}.`;
}
