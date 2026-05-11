// __tests__/cad/ai/claude-proposer.test.ts
//
// Phase 6 §32.13 Slice 6 — server-side proposer tests. We
// inject a fake `ClaudeMessagesClient` so no real API calls
// fire in CI; the suite locks down the tool-use → proposal
// translation, the system prompt + ephemeral-cache wiring,
// and the per-proposal provenance stamping.

import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  proposeFromPrompt,
  type ClaudeMessagesClient,
} from '@/lib/cad/ai/claude-proposer';
import { buildSystemPrompt, hashPrompt } from '@/lib/cad/ai/system-prompt';
import type { ProjectContext } from '@/lib/cad/ai/system-prompt';

const CONTEXT: ProjectContext = {
  layers: [
    { id: 'layer-1', name: 'BACK_OF_CURB', color: '#446699' },
    { id: 'layer-2', name: 'EDGE_OF_PAVEMENT', color: '#996644' },
  ],
  activeLayerId: 'layer-1',
  mode: 'COPILOT',
  sandboxDefault: true,
  autoApproveThreshold: 0.85,
};

function makeClient(content: Anthropic.Messages.ContentBlock[]): ClaudeMessagesClient {
  return {
    messages: {
      create: vi.fn(async () => ({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      } as Anthropic.Messages.Message)),
    },
  };
}

describe('buildSystemPrompt', () => {
  it('includes every layer + the active layer + the tool catalogue', () => {
    const prompt = buildSystemPrompt(CONTEXT);
    expect(prompt).toContain('BACK_OF_CURB');
    expect(prompt).toContain('EDGE_OF_PAVEMENT');
    expect(prompt).toContain('Active layer (used when a tool arg omits layerId): layer-1');
    expect(prompt).toContain('addPoint:');
    expect(prompt).toContain('drawLineBetween:');
    expect(prompt).toContain('drawPolylineThrough:');
    expect(prompt).toContain('createLayer:');
    expect(prompt).toContain('applyLayerStyle:');
    expect(prompt).toContain('Current mode: COPILOT');
    expect(prompt).toContain('Sandbox routing (writes to DRAFT__<layer> when on): ON');
  });

  it('hashPrompt is stable for identical input', () => {
    const a = buildSystemPrompt(CONTEXT);
    const b = buildSystemPrompt(CONTEXT);
    expect(hashPrompt(a)).toBe(hashPrompt(b));
  });

  it('hashPrompt diverges when the context changes', () => {
    const a = hashPrompt(buildSystemPrompt(CONTEXT));
    const b = hashPrompt(
      buildSystemPrompt({ ...CONTEXT, activeLayerId: 'layer-2' }),
    );
    expect(a).not.toBe(b);
  });
});

describe('proposeFromPrompt — tool_use translation', () => {
  it('returns one proposal per tool_use block', async () => {
    const client = makeClient([
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'addPoint',
        input: { x: 10, y: 20, code: 'BC-1' },
      },
      {
        type: 'tool_use',
        id: 'tu_2',
        name: 'addPoint',
        input: { x: 11, y: 21, code: 'BC-2' },
      },
    ]);
    const result = await proposeFromPrompt('place two BC points', CONTEXT, { client });
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].toolName).toBe('addPoint');
    expect((result.proposals[0].args as { x: number; y: number }).x).toBe(10);
  });

  it('collects text content into the narrative', async () => {
    const client = makeClient([
      {
        type: 'text',
        text: 'I am unsure about points beyond #100; please confirm.',
        citations: null,
      } as Anthropic.Messages.TextBlock,
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'addPoint',
        input: { x: 0, y: 0 },
      },
    ]);
    const result = await proposeFromPrompt('add a point', CONTEXT, { client });
    expect(result.narrative).toContain('unsure about points beyond');
    expect(result.proposals).toHaveLength(1);
  });

  it('drops tool_use blocks for unregistered tool names', async () => {
    const client = makeClient([
      {
        type: 'tool_use',
        id: 'tu_1',
        name: 'addPoint',
        input: { x: 0, y: 0 },
      },
      {
        type: 'tool_use',
        id: 'tu_2',
        name: 'deleteEverything',
        input: {},
      },
    ]);
    const result = await proposeFromPrompt('do stuff', CONTEXT, { client });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].toolName).toBe('addPoint');
  });

  it('stamps a per-proposal provenance object with shared batchId + promptHash', async () => {
    const client = makeClient([
      { type: 'tool_use', id: 'tu_1', name: 'addPoint', input: { x: 0, y: 0 } },
      { type: 'tool_use', id: 'tu_2', name: 'addPoint', input: { x: 1, y: 1 } },
    ]);
    const result = await proposeFromPrompt('two points', CONTEXT, {
      client,
      batchId: 'batch-fixed',
    });
    expect(result.proposals[0].provenance.aiBatchId).toBe('batch-fixed');
    expect(result.proposals[1].provenance.aiBatchId).toBe('batch-fixed');
    expect(result.proposals[0].provenance.aiPromptHash).toBe(
      result.proposals[1].provenance.aiPromptHash,
    );
    expect(result.proposals[0].provenance.aiOrigin).toBe('COPILOT_addPoint');
  });

  it('forwards the tool registry as `tools` to the SDK', async () => {
    const calls: Anthropic.Messages.MessageCreateParams[] = [];
    const client: ClaudeMessagesClient = {
      messages: {
        create: async (params) => {
          calls.push(params);
          return {
            id: 'msg', type: 'message', role: 'assistant', model: 'x',
            content: [], stop_reason: 'end_turn', stop_sequence: null,
          } as unknown as Anthropic.Messages.Message;
        },
      },
    };
    await proposeFromPrompt('hi', CONTEXT, { client });
    expect(calls).toHaveLength(1);
    const toolNames = (calls[0].tools ?? []).map((t) => (t as Anthropic.Messages.Tool).name).sort();
    expect(toolNames).toEqual(['addPoint', 'applyLayerStyle', 'createLayer', 'drawLineBetween', 'drawPolylineThrough'].sort());
  });

  it('marks the system prompt for ephemeral caching', async () => {
    const calls: Anthropic.Messages.MessageCreateParams[] = [];
    const client: ClaudeMessagesClient = {
      messages: {
        create: async (params) => {
          calls.push(params);
          return {
            id: 'msg', type: 'message', role: 'assistant', model: 'x',
            content: [], stop_reason: 'end_turn', stop_sequence: null,
          } as unknown as Anthropic.Messages.Message;
        },
      },
    };
    await proposeFromPrompt('hi', CONTEXT, { client });
    expect(Array.isArray(calls[0].system)).toBe(true);
    const sys = (calls[0].system as Anthropic.Messages.TextBlockParam[])[0];
    expect(sys.type).toBe('text');
    expect(sys.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('generates one description per proposal', async () => {
    const client = makeClient([
      { type: 'tool_use', id: 'tu_1', name: 'addPoint', input: { x: 5, y: 7, code: 'EP-1' } },
      { type: 'tool_use', id: 'tu_2', name: 'drawLineBetween', input: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } },
      { type: 'tool_use', id: 'tu_3', name: 'createLayer', input: { name: 'NEW_LAYER' } },
    ]);
    const r = await proposeFromPrompt('mixed turn', CONTEXT, { client });
    expect(r.proposals[0].description).toMatch(/POINT at \(5.00, 7.00\).*EP-1/);
    expect(r.proposals[1].description).toMatch(/Connect/);
    expect(r.proposals[2].description).toMatch(/Create layer "NEW_LAYER"/);
  });
});
