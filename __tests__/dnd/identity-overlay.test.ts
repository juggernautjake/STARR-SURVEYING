// __tests__/dnd/identity-overlay.test.ts — identity effects overlay the header (Slice 11, first cut).
//
// An effect can impose a different name/species/class while active — a pendant that makes you "Zul
// the Barbarian". Like every effect it's an OVERLAY: the display shows the imposed value, the base
// (char.meta.*) is untouched, and dropping the source restores exactly. This pins the ledger
// behaviour the header reads, plus the Hero wiring that reads it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const HERO = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Hero.tsx'), 'utf8');
const BIO = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Bio.tsx'), 'utf8');

function pendant(): SheetEdit {
  // An AI-authored item (Slice 14 plumbing) that renames + reclasses while worn.
  return {
    op: 'add_item',
    name: 'Pendant of Zul',
    equipped: true,
    effects: [
      { target: 'name', operation: 'set', value: 'Zul' },
      { target: 'class', operation: 'set', value: 'Barbarian' },
    ],
  } as SheetEdit;
}

describe('the ledger imposes an identity, over an untouched base', () => {
  it('a worn pendant renames + reclasses; the base stays exactly', () => {
    const base = blankCharacter('Wendol');
    base.meta = { ...base.meta, className: 'Wizard' };
    const out = applySheetEdits(base, [pendant()]);
    const led = buildLedger(out);

    expect(led.identity('name')?.value).toBe('Zul');
    expect(led.identity('name')?.source).toBe('Pendant of Zul');
    expect(led.identity('class')?.value).toBe('Barbarian');
    expect(led.isModified('name')).toBe(true);
    expect(led.isModified('class')).toBe(true);

    // The stored character never changed — dropping the source is a free, correct revert.
    expect(out.meta.name).toBe('Wendol');
    expect(out.meta.className).toBe('Wizard');
  });

  it('no identity effect → identity() is null → base name stands', () => {
    const led = buildLedger(blankCharacter('Plain'));
    expect(led.identity('name')).toBeNull();
    expect(led.isModified('name')).toBe(false);
  });

  it('unequipping removes the overlay entirely', () => {
    const base = blankCharacter('Wendol');
    let out = applySheetEdits(base, [pendant()]);
    out = applySheetEdits(out, [{ op: 'equip_item', name: 'Pendant of Zul', value: false } as SheetEdit]);
    const led = buildLedger(out);
    expect(led.identity('name')).toBeNull(); // gone the moment it's off
  });

  it('two items renaming you: LAST writer wins (identity is a choice, not a number to maximise)', () => {
    // Numbers resolve highest-wins; identity is deliberately LAST-writer-wins (ledger.ts identity()) — two
    // pendants both renaming you resolve to the one filed last (inventory order), sourced to it. A
    // regression to first-wins or a numeric max (which would go NaN on strings) would pick the wrong name.
    const c = blankCharacter('Wendol');
    c.inventory = [
      { id: 'p1', name: 'Pendant of Zul', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'name', operation: 'set', value: 'Zul' }] },
      { id: 'p2', name: 'Mask of Kael', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'name', operation: 'set', value: 'Kael' }] },
    ] as Character['inventory'];
    const led = buildLedger(c);
    expect(led.identity('name')).toEqual({ value: 'Kael', source: 'Mask of Kael' }); // the last one wins
    // ...and BOTH contributions stay visible, so the panel/★ can show the conflict rather than hide it.
    expect(led.explain('name')).toHaveLength(2);
  });
});

describe('the Hero header renders the overlay, not the base, and stars it', () => {
  it('reads identity() for name/species/class/subclass', () => {
    expect(HERO).toContain("ledger.identity('name')?.value ?? char.meta.name");
    expect(HERO).toContain("ledger.identity('species')?.value ?? char.meta.species");
    expect(HERO).toContain("ledger.identity('class')?.value ?? char.meta.className");
    expect(HERO).toContain("ledger.identity('subclass')?.value ?? char.meta.subclass");
  });

  it('the editable name input still binds to the BASE (edit writes base, display shows overlay)', () => {
    expect(HERO).toContain('value={char.meta.name}');
    expect(HERO).toContain('{renderName(displayName)}');
  });

  it('the imposed identity fields carry the ★ marker', () => {
    expect(HERO).toContain('EffectStar');
    expect(HERO).toContain('target="name"');
    expect(HERO).toContain('target="species"');
    expect(HERO).toContain('target="class"');
    expect(HERO).toContain('target="subclass"');
  });

  it('the Bio card titles use the imposed name too, for a consistent read', () => {
    expect(BIO).toContain("ledger.identity('name')?.value ?? char.meta.name");
    expect(BIO).toContain('Who Is ${displayName}?');
    expect(BIO).toContain('Playing ${displayName.split');
  });
});

describe('portrait/token identity overlay applies at DISPLAY only (Slice 11)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');

  it('an item image/token effect resolves through ledger.identity()', () => {
    const c = blankCharacter('Wendol');
    c.inventory = [{
      id: 'mask', name: 'Mask of Zul', desc: '', qty: 1, tags: [], equipped: true,
      effects: [
        { target: 'image', operation: 'set', value: 'https://media/zul-art.png' },
        { target: 'token', operation: 'set', value: 'https://media/zul-token.png' },
      ],
    }] as Character['inventory'];
    const led = buildLedger(c);
    expect(led.identity('image')?.value).toBe('https://media/zul-art.png');
    expect(led.identity('token')?.value).toBe('https://media/zul-token.png');
  });

  it('App overlays the displayed art/token, gallery + framer keep base media', () => {
    const app = read('app/dnd/_sheet/App.tsx');
    expect(app).toContain("ledger.identity('image')?.value ?? vArt?.art ?? media.artUrl");
    expect(app).toContain("ledger.identity('token')?.value ?? vArt?.token ?? media.tokenUrl");
    // the gallery manages the character's OWN art — it must read base media, not the overlay.
    expect(read('app/dnd/_sheet/components/CharacterGallery.tsx')).toContain('media.artUrl');
    expect(read('app/dnd/_sheet/components/TokenFramer.tsx')).toContain('media.tokenUrl');
  });
});

describe('gender / pronouns / profession identity fields (Slice 11)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');

  it('set_meta writes the new descriptive fields', () => {
    const out = applySheetEdits(blankCharacter('X'), [
      { op: 'set_meta', field: 'profession', value: 'Dockhand' },
      { op: 'set_meta', field: 'pronouns', value: 'they/them' },
    ] as SheetEdit[]);
    expect(out.meta.profession).toBe('Dockhand');
    expect(out.meta.pronouns).toBe('they/them');
  });

  it('an identity effect overlays profession, base untouched', () => {
    const c = blankCharacter('Wendol');
    c.meta = { ...c.meta, profession: 'Farmer' };
    c.inventory = [{ id: 'p', name: 'Guise Ring', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'profession', operation: 'set', value: 'Spy' }] }] as Character['inventory'];
    expect(buildLedger(c).identity('profession')?.value).toBe('Spy');
    expect(c.meta.profession).toBe('Farmer'); // overlay, base kept
  });

  it('an alignment overlay (Helm of Opposite Alignment) lights isModified — the ★ data trigger', () => {
    // The Bio detail rows now carry the ★; it lights on isModified(target). A classic identity item —
    // a Helm of Opposite Alignment sets `alignment` — must therefore be explainable, not a silent flip.
    const c = blankCharacter('Paladin');
    c.meta = { ...c.meta, alignment: 'Lawful Good' };
    c.inventory = [{ id: 'helm', name: 'Helm of Opposite Alignment', desc: '', qty: 1, tags: [], equipped: true, effects: [{ target: 'alignment', operation: 'set', value: 'Chaotic Evil' }] }] as Character['inventory'];
    const led = buildLedger(c);
    expect(led.identity('alignment')?.value).toBe('Chaotic Evil');
    expect(led.isModified('alignment')).toBe(true);
    expect(c.meta.alignment).toBe('Lawful Good'); // overlay, base kept
  });

  it('the Bio renders a Details line for the four fields, overlay-aware AND starred', () => {
    const bio = read('app/dnd/_sheet/components/Bio.tsx');
    expect(bio).toContain("ledger.identity(field)?.value ?? char.meta[field]");
    for (const f of ['Gender', 'Pronouns', 'Profession', 'Alignment']) expect(bio).toContain(f);
    // the overlaid value is wrapped in a ★ keyed to the field, like name/species/class in the Hero
    expect(bio).toContain('<EffectStar target={d.key} label={d.label}>{detail(d.key) || \'—\'}</EffectStar>');
  });
});
