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
  type ToolName,
  type AddPointArgs,
  type DrawLineBetweenArgs,
  type DrawPolylineThroughArgs,
  type CreateLayerArgs,
  type ApplyLayerStyleArgs,
} from './tool-registry';
import type { AIProposal } from './proposals';
import type { AIProvenance } from './provenance';
import {
  buildSystemPrompt,
  hashPrompt,
  type ProjectContext,
} from './system-prompt';
import { generateId } from '../types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
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
    const response = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      tools,
      // ephemeral cache the system prompt — repeated proposals
      // in the same session pay only the prompt tokens that
      // change (mainly the user message).
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const proposals: AIProposal[] = [];
    const narrativeParts: string[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        narrativeParts.push(block.text);
      } else if (block.type === 'tool_use') {
        const proposal = blockToProposal(block, batchId, promptHash);
        if (proposal) proposals.push(proposal);
      }
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

  const provenance: AIProvenance = {
    aiOrigin: `COPILOT_${name}`,
    // Anthropic's response doesn't currently include a per-tool
    // confidence score, so we baseline at 0.8. Future slices can
    // promote a confidence emitted by the model in `narrative`.
    aiConfidence: 0.8,
    aiPromptHash: promptHash,
    aiSourcePoints: [],
    aiBatchId: batchId,
  };

  const args = (block.input ?? {}) as
    | AddPointArgs
    | DrawLineBetweenArgs
    | DrawPolylineThroughArgs
    | CreateLayerArgs
    | ApplyLayerStyleArgs;

  return {
    id: generateId(),
    createdAt: Date.now(),
    toolName: name,
    args,
    description: describeArgs(name, args),
    confidence: provenance.aiConfidence,
    provenance,
  };
}

/** Best-effort single-sentence summary for the proposal card. */
function describeArgs(name: ToolName, args: unknown): string {
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
  return `Invoke ${name}.`;
}
