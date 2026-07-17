// __tests__/dnd/ac-single-source.test.ts — the StatRail used to show the manual `combat.ac` while the
// Combat panel showed the DERIVED AC (equipped armor + effective DEX + AC effects), so an armored
// character saw two different ACs. Slice 13's rule: one answer. AC is now derived once in the store and
// both surfaces read it. Guards the wiring + the derivation.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveAc } from '@/app/dnd/_sheet/lib/derive-ac';
import type { InvItem } from '@/app/dnd/_sheet/types';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const STORE = read('app/dnd/_sheet/state/store.tsx');
const COMBAT = read('app/dnd/_sheet/components/CombatPanel.tsx');
const RAIL = read('app/dnd/_sheet/components/StatRail.tsx');

describe('AC is derived once in the store and shared', () => {
  it('the store derives acInfo from inventory + effective DEX and exposes it', () => {
    expect(STORE).toContain('deriveAc(char.inventory, abilityMod(abilities.dex)');
    expect(STORE).toContain('acInfo: AcResult');
  });
  it('CombatPanel reads the store acInfo — no independent deriveAc call', () => {
    expect(COMBAT).toContain('acInfo');
    expect(COMBAT).not.toContain('deriveAc(');
  });
  it('StatRail reads the store acInfo and shows the derived AC when equipment drives it', () => {
    expect(RAIL).toContain('acInfo.fromEquipment');
    expect(RAIL).toContain('acInfo.ac');
    // it must NOT unconditionally show the raw manual value anymore
    expect(RAIL).not.toMatch(/<span className="vk">AC<\/span>\s*<span className="vv">\s*<InlineNumber value={combat\.ac}/);
  });
});

describe('the derived value both surfaces now show', () => {
  const armor: InvItem = { id: 'a', name: 'Breastplate', desc: '', qty: 1, tags: ['equipped'], kind: 'armor', equipped: true, armor: { category: 'medium', baseAC: 14, dexCap: 2 } } as unknown as InvItem;
  it('equipped medium armor drives AC = base + min(DEX, cap), flagged fromEquipment', () => {
    const r = deriveAc([armor], 3, 10); // DEX +3, capped at 2 → 14 + 2 = 16
    expect(r.ac).toBe(16);
    expect(r.fromEquipment).toBe(true);
  });
  it('falls back to the manual AC (not fromEquipment) when nothing is equipped', () => {
    const r = deriveAc([], 3, 13);
    expect(r.ac).toBe(13);
    expect(r.fromEquipment).toBe(false);
  });
});
