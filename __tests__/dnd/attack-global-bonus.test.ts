// __tests__/dnd/attack-global-bonus.test.ts — the GLOBAL attack/damage bonus targets reach the roll.
//
// A weapon's own +N is per-attack (bonusToHit / w.bonus) and already worked. But the registry's GLOBAL
// roll targets — attack_roll (+N to every attack), damage_roll (+N to every damage), and the classic
// magic-item attack_and_damage (+N to both) — were folded only by the now-dead deriveCharacter engine,
// so an item/effect granting a bonus to ALL attacks reached neither the to-hit nor the damage. Now folded
// into the live Attacks card + rollWeaponDamage (no-op without such an effect). Source-anchored: the
// to-hit lives in a component and the damage in a store callback.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ATTACKS = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/components/Attacks.tsx'), 'utf8');
const STORE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_sheet/state/store.tsx'), 'utf8');

describe('global attack/damage bonus effects reach the rolls', () => {
  it('the to-hit folds attack_roll + attack_and_damage (on top of the per-attack bonusToHit)', () => {
    expect(ATTACKS).toContain("ledger.value('attack_roll', 0) + ledger.value('attack_and_damage', 0)");
  });

  it('the weapon damage flat folds damage_roll + attack_and_damage (on top of ability + form)', () => {
    expect(STORE).toContain("ledger.value('damage_roll', 0) + ledger.value('attack_and_damage', 0)");
  });

  it('the Attacks component pulls the ledger from the store to do the fold', () => {
    expect(ATTACKS).toMatch(/useChar\(\)[\s\S]*ledger/);
  });
});
