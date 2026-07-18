// __tests__/dnd/sheet-help.test.ts — the AI's "how the sheet works + what each preference does" grounding
// (Area R5). Guards that every configurable preference is explained (so a new pref can't ship unexplained)
// and that the chat route actually injects the help when a character is in focus.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CAMPAIGN_PREFERENCES } from '@/lib/dnd/preferences';
import { PREFERENCE_HELP, sheetMechanicsHelp } from '@/lib/dnd/sheet-help';

describe('sheet-help grounds the AI on the sheet mechanics + every preference', () => {
  it('describes every configurable preference (nothing shipped unexplained)', () => {
    const helpKeys = PREFERENCE_HELP.map((p) => p.key).sort();
    expect(helpKeys).toEqual(Object.keys(DEFAULT_CAMPAIGN_PREFERENCES).sort());
  });

  it('the help block covers the ledger overview + names each preference', () => {
    const block = sheetMechanicsHelp();
    expect(block).toMatch(/effect ledger/i);
    for (const p of PREFERENCE_HELP) expect(block).toContain(p.name);
  });

  it('the chat route injects the sheet help when a character is in focus', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/dnd/library/chat/route.ts'), 'utf8');
    expect(route).toContain("import { sheetMechanicsHelp } from '@/lib/dnd/sheet-help'");
    expect(route).toContain('digest ? sheetMechanicsHelp() : null');
  });
});
