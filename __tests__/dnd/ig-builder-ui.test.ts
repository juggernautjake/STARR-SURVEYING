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

describe('IG builder class-features preview (Area B2)', () => {
  it('previews the chosen class/subclass grants from findIGClassDetail (subclass preferred over parent)', () => {
    expect(SRC).toContain('findIGClassDetail');
    // subclass detail wins (its granular stance/powers), else the parent class.
    expect(SRC).toContain('findIGClassDetail(subclass) ?? findIGClassDetail(className)');
    expect(SRC).toContain('data-testid="ig-class-features"');
  });
  it('surfaces the class feature fields (hp, stance, powers, specializations) and the WIP note honestly', () => {
    expect(SRC).toMatch(/classDetail\.hp/);
    expect(SRC).toMatch(/classDetail\.grantedStance/);
    expect(SRC).toMatch(/classDetail\.startingPower/);
    expect(SRC).toMatch(/classDetail\.powers/);
    expect(SRC).toMatch(/classDetail\.specializations/);
    expect(SRC).toMatch(/classDetail\.note/); // a WIP class (Magician/Shaman) shows its note, not invented grants
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
