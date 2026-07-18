// __tests__/dnd/level-up-route.test.ts — guards that the AI level-up route wires the pieces (ground → tool →
// parse → apply → persist) and stays behind the write chokepoint. Source-assertion (the AI call can't run in a
// unit test), mirroring pf2-edit-route.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/level-up/route.ts'), 'utf8');

describe('AI level-up route', () => {
  it('is gated by auth + the write chokepoint + AI-configured', () => {
    expect(SRC).toContain('getDndSession()');
    expect(SRC).toContain('dndAiConfigured()');
    expect(SRC).toContain('requireCharacterWrite(params.id)');
  });

  it('grounds the model with the character digest + standard options and only offers the level-up tool', () => {
    expect(SRC).toContain('characterDigest(current');
    expect(SRC).toContain('standardLevelUpOptions(def');
    expect(SRC).toContain('tools: [LEVEL_UP_TOOL]');
    expect(SRC).toContain("toolChoice: { type: 'tool', name: 'level_up_character' }");
  });

  it('parses the tool call, applies the pure draft, and persists to data', () => {
    expect(SRC).toContain('parseLevelUpToolCall(result.input, fromLevel)');
    expect(SRC).toContain('applyLevelUpDraft(current, draft)');
    expect(SRC).toContain(".from('dnd_characters')");
    expect(SRC).toContain('.update({ data: next');
  });

  it('refuses to level a character past 20', () => {
    expect(SRC).toContain('fromLevel >= 20');
  });

  it('supports both the standard (class def found) and fully-custom (no def) paths', () => {
    expect(SRC).toContain("findClass(system, current.meta?.className ?? '')");
    expect(SRC).toMatch(/def\s*\?[\s\S]*standardLevelUpOptions/); // standard only when a def resolves
  });
});
