// __tests__/dnd/library-grant.test.ts — giving a library entry to a character.
//
// Owner 2026-07-19. Two things under test: the KIND→op mapping is right, and the security
// shape holds — the client sends a reference, the server resolves it, so the edit vocabulary
// never becomes a client-controlled write primitive.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildGrantEdits, isGrantError } from '@/lib/dnd/library-grant';
import { grantKindForSection } from '@/app/dnd/_ui/GiveEntryButton';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const ok = (o: ReturnType<typeof buildGrantEdits>) => {
  if (isGrantError(o)) throw new Error(`expected success, got: ${o.error}`);
  return o;
};

describe('spell grants resolve against the real catalog', () => {
  it('builds an add_spell carrying the published mechanics', () => {
    const r = ok(buildGrantEdits({ kind: 'spell', name: 'Fireball', system: 'dnd5e-2024' }));
    const e = r.edits[0] as Extract<SheetEdit, { op: 'add_spell' }>;
    expect(e.op).toBe('add_spell');
    expect(e.name).toBe('Fireball');
    expect(e.level).toBe(3);
    expect(e.range).toBe('150 feet');
    expect(e.save?.ability).toBe('dex');
  });

  it('keeps the dice visible even though add_spell has no damage field', () => {
    // Dropping them silently would hand over a Fireball that rolls nothing.
    const r = ok(buildGrantEdits({ kind: 'spell', name: 'Fireball', system: 'dnd5e-2024' }));
    const e = r.edits[0] as Extract<SheetEdit, { op: 'add_spell' }>;
    expect(e.description).toContain('8d6');
  });

  it('honours the prepared option', () => {
    const plain = ok(buildGrantEdits({ kind: 'spell', name: 'Bless', system: 'dnd5e-2024' }));
    const prep = ok(buildGrantEdits({ kind: 'spell', name: 'Bless', system: 'dnd5e-2024', options: { prepared: true } }));
    expect((plain.edits[0] as Extract<SheetEdit, { op: 'add_spell' }>).prepared).toBe(false);
    expect((prep.edits[0] as Extract<SheetEdit, { op: 'add_spell' }>).prepared).toBe(true);
  });

  it('refuses an unknown spell instead of granting an empty husk', () => {
    const r = buildGrantEdits({ kind: 'spell', name: 'Fireballz', system: 'dnd5e-2024' });
    expect(isGrantError(r)).toBe(true);
  });

  it('refuses a spell for a system with no catalog rather than using 2024 data', () => {
    const r = buildGrantEdits({ kind: 'spell', name: 'Fireball', system: 'dnd5e-2014' });
    expect(isGrantError(r)).toBe(true);
  });
});

describe('item and feature grants', () => {
  it('maps weapon/armor/item onto add_item with the right kind', () => {
    expect((ok(buildGrantEdits({ kind: 'weapon', name: 'Longsword', system: 'x' })).edits[0] as { kind?: string }).kind).toBe('weapon');
    expect((ok(buildGrantEdits({ kind: 'armor', name: 'Chain Mail', system: 'x' })).edits[0] as { kind?: string }).kind).toBe('armor');
    expect((ok(buildGrantEdits({ kind: 'item', name: 'Rope', system: 'x' })).edits[0] as { kind?: string }).kind).toBe('gear');
  });

  it('carries quantity and equipped', () => {
    const r = ok(buildGrantEdits({ kind: 'weapon', name: 'Dagger', system: 'x', options: { quantity: 3, equipped: true } }));
    const e = r.edits[0] as { qty?: number; equipped?: boolean };
    expect(e.qty).toBe(3);
    expect(e.equipped).toBe(true);
  });

  it('never grants a zero or negative quantity', () => {
    const r = ok(buildGrantEdits({ kind: 'item', name: 'Torch', system: 'x', options: { quantity: -5 } }));
    expect((r.edits[0] as { qty?: number }).qty).toBe(1);
  });

  it('maps a feat onto add_feature, since there is no add_feat op', () => {
    const r = ok(buildGrantEdits({ kind: 'feature', name: 'Alert', system: 'x', options: { note: 'You gain +5 initiative.' } }));
    const e = r.edits[0] as Extract<SheetEdit, { op: 'add_feature' }>;
    expect(e.op).toBe('add_feature');
    expect(e.name).toBe('Alert');
    expect(e.body).toContain('You gain +5 initiative.');
  });

  it('rejects an empty name and an unknown kind', () => {
    expect(isGrantError(buildGrantEdits({ kind: 'spell', name: '   ', system: 'dnd5e-2024' }))).toBe(true);
    expect(isGrantError(buildGrantEdits({ kind: 'nonsense' as 'spell', name: 'X', system: 'x' }))).toBe(true);
  });
});

describe('granted edits actually land on a sheet', () => {
  it('a granted spell appears in the character’s spell list', () => {
    const c = blankCharacter('Test');
    const r = ok(buildGrantEdits({ kind: 'spell', name: 'Magic Missile', system: 'dnd5e-2024' }));
    const after = applySheetEdits(c, r.edits);
    expect(after.spells?.some((s) => s.name === 'Magic Missile')).toBe(true);
  });

  it('a granted item appears in the inventory with its quantity', () => {
    const c = blankCharacter('Test');
    const r = ok(buildGrantEdits({ kind: 'item', name: 'Healing Potion', system: 'x', options: { quantity: 2 } }));
    const after = applySheetEdits(c, r.edits);
    const item = after.inventory?.find((i) => i.name === 'Healing Potion');
    expect(item).toBeDefined();
    expect(item?.qty).toBe(2);
  });
});

describe('section → grant kind mapping', () => {
  it('offers spells only where a catalog backs them', () => {
    expect(grantKindForSection('spells', 'dnd5e-2024')).toBe('spell');
    // PF2 renders spells as a table with no catalog behind it — a button here would always error.
    expect(grantKindForSection('spells', 'pathfinder2e')).toBeNull();
  });

  it('maps IG powers and feats to features', () => {
    expect(grantKindForSection('powers', 'intuitive-games')).toBe('feature');
    expect(grantKindForSection('feats', 'intuitive-games')).toBe('feature');
  });

  it('maps gear sections to item kinds', () => {
    expect(grantKindForSection('weapons', 'x')).toBe('weapon');
    expect(grantKindForSection('shields', 'x')).toBe('armor');
    expect(grantKindForSection('magical-items', 'x')).toBe('item');
  });

  it('offers NOTHING for content it cannot deliver faithfully', () => {
    // A button that drops a bare name on a sheet and calls it a class is worse than no button.
    for (const id of ['classes', 'species', 'backgrounds', 'overview', 'unknown']) {
      expect(grantKindForSection(id, 'dnd5e-2024'), id).toBeNull();
    }
  });
});

describe('the grant route keeps the write boundary', () => {
  const route = read('app/api/dnd/characters/[id]/grant-content/route.ts');

  it('uses the same authorization chokepoint as every other sheet write', () => {
    expect(route).toContain('requireCharacterWrite(params.id)');
  });

  it('never accepts sheet edits from the client', () => {
    // The client sends kind+name; the server resolves. Accepting SheetEdit[] would let any
    // caller POST set_level or set_ability and bypass every rule the library represents.
    expect(route).toContain('buildGrantEdits(');
    expect(route).not.toMatch(/body\.edits/);
  });

  it('pins the grant to the CHARACTER’s system, not the client’s claim', () => {
    expect(route).toContain('row.system ?? body.system');
  });

  it('audits under a batch id so a grant can be reverted as a unit', () => {
    expect(route).toContain('dnd_sheet_edits');
    expect(route).toContain("source: 'library-grant'");
    expect(route).toContain('batch_id: batchId');
  });

  it('honours the campaign equip-limit preference', () => {
    expect(route).toContain('equipLimits');
  });
});

describe('the character chooser offers what the write path accepts', () => {
  it('lists writable characters, not just owned ones', () => {
    // The list route used to disagree with resolveCharacterAccess: canWrite covers owner OR
    // player OR DM, but the list only matched owner, so a DM could edit sheets no list showed.
    const listRoute = read('app/api/dnd/characters/route.ts');
    expect(listRoute).toContain('writable');
    expect(listRoute).toContain('played_by_user_id');
    const dialog = read('app/dnd/_ui/GiveToCharacter.tsx');
    expect(dialog).toContain('/api/dnd/characters?writable=1');
  });
});
