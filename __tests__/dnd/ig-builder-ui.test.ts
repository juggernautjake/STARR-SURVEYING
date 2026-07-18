// __tests__/dnd/ig-builder-ui.test.ts — the IG builder offers the scrubbed backgrounds as pickable
// suggestions (a datalist), keeping freeform as the custom escape hatch. Source-anchored (client component).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/IGCharacterBuilder.tsx'), 'utf8');

describe('IG builder background picker', () => {
  it('offers the 10 backgrounds via a datalist (real options + freeform)', () => {
    expect(SRC).toContain('IG_BACKGROUND_DEFS');
    expect(SRC).toContain('list="ig-background-opts"'); // the input is linked to the datalist
    expect(SRC).toMatch(/<datalist id="ig-background-opts">/);
    expect(SRC).toMatch(/b\.stance/); // each option shows what it grants
  });

  it('offers the scrubbed class specializations via a datalist too', () => {
    expect(SRC).toContain('IG_CLASS_DETAILS');
    expect(SRC).toContain('list="ig-spec-opts"');
    expect(SRC).toMatch(/c\.specializations/);
  });
});
