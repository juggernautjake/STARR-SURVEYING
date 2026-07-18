// __tests__/dnd/pf2-edit-route.test.ts — Area SQ4. The PF2 in-play edit endpoint: write-gated, guards the
// PF2 sidecar, runs the pure applyPf2Edit, and persists just data.pf2e — mirroring the ig-edit route.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/pf2-edit/route.ts'), 'utf8');

describe('pf2-edit route (SQ4)', () => {
  it('is write-gated at the character chokepoint', () => {
    expect(route).toContain('requireCharacterWrite(params.id)');
    expect(route).toContain("if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })");
  });
  it('guards that the character actually has a PF2 sheet', () => {
    expect(route).toContain('const pf2 = data.pf2e');
    expect(route).toContain('if (!isPF2Character(pf2))');
  });
  it('runs the SAME validated parser + pure apply the manual/AI path uses, persisting only data.pf2e', () => {
    expect(route).toContain('parsePf2Edit(await req.json()');
    expect(route).toContain("if ('error' in parsed)"); // a bad payload is rejected 400
    expect(route).toContain('applyPf2Edit(pf2, parsed.edit, { downedDamageModel })');
    expect(route).toContain('const nextData = { ...data, pf2e: nextPf2 }');
    expect(route).toContain("change: describePf2Edit(parsed.edit)");
  });
});

describe('ai-edit route dispatches edit_pf2_sheet (SQ4)', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/api/dnd/characters/[id]/ai-edit/route.ts'), 'utf8');
  it('offers edit_pf2_sheet only for PF2 characters and applies it to data.pf2e', () => {
    expect(SRC).toMatch(/isPF2 \? \[PF2_EDIT_TOOL\] : \[\]/); // tool added only when PF2
    expect(SRC).toContain("result?.name === 'edit_pf2_sheet'");
    expect(SRC).toContain('parsePF2EditToolCall(result.input)');
    expect(SRC).toContain('applyPf2Edit(pf2Data as PF2Character, parsed.edit, { downedDamageModel })');
    expect(SRC).toContain('pf2e: nextPf2');
    expect(SRC).toContain("field_path: `pf2:${parsed.edit.op}`"); // audited to dnd_sheet_edits
  });
  it('instructs the AI it can now change PF2 HP + the death track in play', () => {
    expect(SRC).toMatch(/call edit_pf2_sheet: apply_damage \/ heal/);
  });
});
