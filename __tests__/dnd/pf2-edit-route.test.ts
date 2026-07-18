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
    expect(route).toContain('applyPf2Edit(pf2, parsed.edit)');
    expect(route).toContain('const nextData = { ...data, pf2e: nextPf2 }');
    expect(route).toContain("change: describePf2Edit(parsed.edit)");
  });
});
