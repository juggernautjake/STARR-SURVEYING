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

describe('IG builder parent → subclass picker (Area T1)', () => {
  it('the class dropdown offers the four parent classes', () => {
    expect(SRC).toContain('const classes = useMemo(() => igParentClasses()');
  });
  it('the subclass dropdown is scoped to the chosen parent and resets when the class changes', () => {
    expect(SRC).toContain('setClassName(e.target.value); setSubclass('); // changing class clears the subclass
    expect(SRC).toContain('(className ? igSubclassesOf(className) : subclasses).map'); // scoped options
    expect(SRC).toContain('disabled={!className}'); // can't pick a subclass before a class
  });
});
