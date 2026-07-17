// __tests__/dnd/ig-ai.test.ts — the AI-customize path's pure core (full-sheet Slice 10). The parser turns
// arbitrary model JSON into safe IGPicks; a vanilla build stays 100% vanilla; invented content is flagged
// CUSTOM with the right kinds; and the grounding prompt pins the AI to the real system + catalog.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseIGPicks, IG_PICKS_TOOL, igBuilderSystemPrompt, IG_EDIT_TOOL, parseIGEditToolCall, igEditToolInstruction } from '@/lib/dnd/systems/intuitive-games/ai';
import { assembleIGVanillaCharacter } from '@/lib/dnd/systems/intuitive-games/builder';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';

describe('IG AI-customize core (full-sheet Slice 10)', () => {
  it('parseIGPicks normalizes + clamps arbitrary model JSON', () => {
    const picks = parseIGPicks({
      name: '  Zari  ', level: 99, class: 'Wizard', abilities: { INT: '18', STR: 5, bogus: 3 },
      stances: ['Offensive', 42, ''], powers: ['Mirror Image'], junk: true,
    });
    expect(picks.name).toBe('Zari');
    expect(picks.level).toBe(10);            // clamped 1–10
    expect(picks.className).toBe('Wizard');  // accepts `class` alias
    expect(picks.abilities).toEqual({ INT: 18, STR: 5 }); // strings coerced, unknown keys dropped
    expect(picks.stances).toEqual(['Offensive']);          // non-strings/empties filtered
  });

  it('an all-vanilla AI build is 100% vanilla; invented content is flagged custom with correct kinds', () => {
    const vanilla = assembleIGVanillaCharacter(parseIGPicks({ name: 'V', className: 'Wizard', ancestry: 'Migoi', powers: ['Mirror Image'], stances: ['Offensive'] }));
    expect(summarizeCharacterProvenance(vanilla, 'intuitive-games', []).custom).toHaveLength(0);

    const spicy = assembleIGVanillaCharacter(parseIGPicks({ name: 'S', className: 'Wizard', powers: ['Void Lance'], stances: ['Chaos Form'] }));
    const s = summarizeCharacterProvenance(spicy, 'intuitive-games', []);
    expect(s.custom.find((e) => e.name === 'Void Lance')?.kind).toBe('power');
    expect(s.custom.find((e) => e.name === 'Chaos Form')?.kind).toBe('stance');
    expect(s.hasBlockingCustom).toBe(true);
  });

  it('the grounding prompt pins the AI to the system + names the catalog; the tool requires a name', () => {
    const p = igBuilderSystemPrompt();
    expect(p).toMatch(/INTUITIVE GAMES/);
    expect(p).toMatch(/DEGREES OF SUCCESS|three sav|Fortitude/i); // the IG rules block is embedded
    expect(p).toMatch(/Offensive/);   // stances from the catalog
    expect(p).toMatch(/Mirror Image/); // powers from the catalog
    expect(IG_PICKS_TOOL.input_schema.required).toContain('name');
  });

  it('the AI edit tool exposes the same validated ops as the manual route (AI parity)', () => {
    // The tool enumerates exactly the validated edit ops (stance/condition/feat/power) and requires op.
    expect((IG_EDIT_TOOL.input_schema.properties.op as { enum: string[] }).enum).toEqual(
      ['set_active_stance', 'clear_stance', 'add_condition', 'remove_condition', 'add_feat', 'remove_feat', 'add_power', 'remove_power'],
    );
    expect(IG_EDIT_TOOL.input_schema.required).toContain('op');
    // A tool call runs through the SAME parser the API route uses.
    expect(parseIGEditToolCall({ op: 'add_condition', name: 'Shaken' })).toEqual({ edit: { op: 'add_condition', name: 'Shaken' } });
    expect(parseIGEditToolCall({ op: 'add_power', name: 'Mirror Image' })).toEqual({ edit: { op: 'add_power', name: 'Mirror Image' } });
    expect(parseIGEditToolCall({ op: 'nuke', name: 'x' })).toHaveProperty('error');
    // Grounding lists the real stance + condition + power names and forbids inventing.
    const g = igEditToolInstruction();
    expect(g).toMatch(/Defensive/);   // a stance
    expect(g).toMatch(/Grappled/);    // a condition
    expect(g).toMatch(/Mirror Image/); // a power
    expect(g).toMatch(/do not invent/i);
  });

  it('the live ai-edit route offers edit_ig_sheet for IG characters and applies it to data.ig', () => {
    const SRC = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/ai-edit/route.ts'), 'utf8');
    // The tool is added to the model's toolset only when the character is IG.
    expect(SRC).toMatch(/isIG \? \[IG_EDIT_TOOL\] : \[\]/);
    // A returned edit_ig_sheet call is validated (same parser) and applied to the sidecar, then persisted.
    expect(SRC).toContain("result?.name === 'edit_ig_sheet'");
    expect(SRC).toContain('parseIGEditToolCall(result.input)');
    expect(SRC).toContain('applyIgEdit(igData as IGCharacter, parsed.edit)');
    expect(SRC).toContain('ig: nextIg');
  });
});
