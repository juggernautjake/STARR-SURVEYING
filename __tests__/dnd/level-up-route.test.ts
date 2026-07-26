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

// ── The route must SUPPLY the Fighting Style options (final-QA walkthrough, slice 4) ────────────────
// planLevelUp takes them from its caller (like subclasses) so homebrew is offered alike. This is the
// caller. Without it the level walker demands a Fighting Style and renders nothing to pick.
describe('the levels route supplies Fighting Style options', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/levels/route.ts'), 'utf8');

  it('builds the list from the edition catalog PLUS homebrew, and passes it in', () => {
    expect(SRC).toContain('featCatalogForSystem');
    // The pool is official + homebrew, so a homebrew style/boon is offered like an official one.
    expect(SRC).toMatch(/\[\.\.\.featCatalogForSystem\(def\.system\), \.\.\.homebrewFeats\]/);
    expect(SRC).toMatch(/byCategory\('fighting-style'\)/);
    expect(SRC).toMatch(/planLevelUp\(def, \{[^}]*fightingStyles[^}]*\}\)/s);
  });

  it('supplies the Epic Boon list too — the same hole existed on every class', () => {
    expect(SRC).toMatch(/byCategory\('epic-boon'\)/);
    expect(SRC).toMatch(/planLevelUp\(def, \{[^}]*epicBoons[^}]*\}\)/s);
  });
});

// ── A decorative overlay must not eat clicks (same walkthrough) ─────────────────────────────────────
// The docked dice roller's `.stage-wires` SVG is aria-hidden decoration, but it is absolutely positioned
// with a stretched viewBox — measured at 260x674px, most of it over the page behind — and had
// pointer-events:auto. It swallowed clicks on the guided builder's own phase navigation, which is how it
// was found (Playwright reported the SVG "intercepts pointer events").
describe('the roller stage decoration is inert to the pointer', () => {
  it('.stage-wires sets pointer-events:none', () => {
    const css = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/rollers/rollStage.css'), 'utf8');
    const rule = css.slice(css.indexOf('.dnd-sheet .stage-wires {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/pointer-events:\s*none/);
  });
});
