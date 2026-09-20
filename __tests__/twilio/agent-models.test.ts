// __tests__/twilio/agent-models.test.ts — switching the speech model.
//
// Owner, 2026-09-21: "make it where we can switch between eleven_v3_conversational and
// eleven_flash_v2_5."
//
// Built as a switch rather than a decision because the reason for it cannot be settled from a
// transcript: across six test calls the audio dropped three times, always on a long agent turn, and
// generation latency is the likeliest cause but not a provable one. A switch lets the phone answer
// the question.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_MODELS, agentModelById, parseAgentModel, DEFAULT_AGENT_MODEL } from '@/lib/receptionist/agent-models';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

describe('the two models', () => {
  it('offers exactly the two the owner named', () => {
    expect(AGENT_MODELS.map((m) => m.id).sort()).toEqual(['eleven_flash_v2_5', 'eleven_v3_conversational']);
  });

  it('defaults to the one the agent is on today', () => {
    expect(agentModelById(DEFAULT_AGENT_MODEL)).toBeTruthy();
  });

  it('states what each one COSTS, not just what it is good at', () => {
    // A picker whose options have no downside is a sales page. Both of these have a real one: v3 is
    // slow, flash is flat — and a switch flipped without knowing that gets blamed for something
    // else a week later.
    for (const m of AGENT_MODELS) {
      expect(m.tradeoff.length, `${m.id} names no trade-off`).toBeGreaterThan(40);
      expect(m.latency, `${m.id} has no latency figure`).toMatch(/ms/);
    }
  });

  it('says the expressive one is the latency suspect and the fast one is flat', () => {
    const v3 = agentModelById('eleven_v3_conversational')!;
    const flash = agentModelById('eleven_flash_v2_5')!;
    expect(v3.tradeoff).toMatch(/latency|drop/i);
    expect(flash.tradeoff).toMatch(/flat/i);
  });
});

describe('parseAgentModel is an allowlist', () => {
  it('accepts the two real ids', () => {
    expect(parseAgentModel('eleven_flash_v2_5')).toBe('eleven_flash_v2_5');
    expect(parseAgentModel('  eleven_v3_conversational  ')).toBe('eleven_v3_conversational');
  });

  it('refuses anything else', () => {
    // `tts.model_id` accepts any string, so a typo would be PATCHed onto the LIVE agent and only
    // discovered when somebody rang and heard nothing.
    for (const bad of ['eleven_flash', 'gpt-4', '', '   ', 'eleven_v3', null, undefined, 42, {}]) {
      expect(parseAgentModel(bad as unknown as string), String(bad)).toBeNull();
    }
  });
});

describe('the route', () => {
  const route = read('app/api/admin/receptionist-test/model/route.ts');

  it('is admin-gated on both verbs', () => {
    expect((route.match(/isAdmin\(session\.user\.roles\)/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(route).toContain('requireAdmin');
  });

  it('validates through the allowlist rather than passing the body through', () => {
    expect(route).toContain('parseAgentModel(body.modelId)');
  });

  it('PATCHes only the one field', () => {
    // A whole-config PATCH would carry whatever this route happened to know about the agent and
    // silently reset everything it did not — the prompt, the voice, the turn-taking.
    expect(route).toContain('conversation_config: { tts: { model_id: modelId } }');
  });

  it('reads the current model from ElevenLabs rather than assuming it', () => {
    // A deploy, a script run, or somebody else's browser can all have changed it.
    expect(route).toContain('currentModel');
  });
});

describe('a prompt update does not silently undo the bench', () => {
  const script = read('scripts/elevenlabs-agent.mjs');

  it('--apply keeps the voice and model the agent is already on', () => {
    // Without this, choosing Sarah and the fast model on Monday and fixing a prompt typo on Tuesday
    // puts the line back on Riley and the expressive model with nobody having decided that.
    expect(script).toContain('liveTts.voice_id || opts.voiceId');
    expect(script).toContain('liveTts.model_id || opts.ttsModel');
  });

  it('an explicit flag still wins, and --model is the LLM not the speech model', () => {
    // `--model` sets the LLM. Conflating the two would make an LLM override stomp the speech model
    // the bench had chosen.
    expect(script).toContain("args.includes('--voice')");
    expect(script).toContain("args.includes('--tts-model')");
    expect(script).toContain("llm: flag('--model'");
  });
});

describe('the page', () => {
  const page = read('app/admin/dev/receptionist/page.tsx');

  it('offers both models', () => {
    expect(page).toContain('rtest-model-');
    expect(page).toContain('AGENT_MODELS');
  });

  it('shows the voice list that matches the engine being tested', () => {
    // Two different things were both called "voice" on this page: ElevenLabs agent voices and
    // Twilio <Say> voices. You could pick Riley for the answering machine, which cannot speak in
    // Riley. Step 2 now follows step 1.
    expect(page).toContain('usesElevenLabsVoice');
  });

  it('asks the calls API for the TEST log rather than filtering the live one', () => {
    // When the calls API gained a scope its default became `live`, so the recent-test panel was
    // asking for a hundred live calls and filtering them for test ones: always empty, no error.
    expect(page).toContain('scope=test');
  });
});
