// app/dnd/_sheet/engine/weapon-items.ts — an inventory weapon → an Attacks-table row.
//
// THE PROMISE THIS KEEPS. The `weapon` tag is one of three tags this codebase calls "wiring, not
// labels", and it says so to the player in `ITEM_TAGS`: *"Can be attacked with — it shows up in your
// Attacks table with its own to-hit and damage."* `RESERVED_TAGS` refuses to let a homebrew tag reuse
// the name **because** "`weapon` is what puts an item in the Attacks table", and `InvItem.tags` repeats
// it. Three statements of the same contract — and nothing implemented it. `Attacks.tsx` rendered stored
// attacks plus `grantsAttack` items only, so a player who built a Longsword in the weapon builder, saw
// that tooltip, and equipped it got no row at all.
//
// WHY NOT `engine/weapons.ts`, WHICH ALREADY DOES THIS. Because it does it for a different data model.
// `attacksFromInventory`/`buildAttack` operate on `EquipItem` + `WeaponSpec` (engine/equipment.ts):
// `category: 'simple' | 'martial'`, `damage: string`, `range: { normal, long }`. The live sheet's items
// are `InvItem` + `WeaponStats` (types.ts): `ability`, `proficient`, `toHitBonus`, `range: string`,
// `damage: TypedDamage`, `bonus: TypedDamage[]`. Those are not the same shape, and the only caller of
// `attacksFromInventory` is `engine/character.ts`'s `deriveCharacter` — a reducer no live surface
// imports. So the gap was never "call the existing function": it was written against a model the sheet
// doesn't use. The plan doc's note that it "derives it correctly but is still UNCALLED" is true only in
// the narrow sense; wiring it would have needed a converter for facts `WeaponStats` already states.
//
// WHICH IS WHY THIS MAPPER IS SO THIN, AND DELIBERATELY SO. `WeaponStats` is authored through the
// ItemBuilder, which captures ability, proficiency, range and damage EXPLICITLY. So there is nothing to
// infer and no rule to invent (Ground Rule 3): the item says what it is. In particular this does NOT
// parse a class's prose weapon proficiencies ('Martial weapons that have the Light property') to second-
// guess the checkbox the author already ticked.
//
// AND IT RETURNS A DECLARATIVE `Attack`, NOT A COMPUTED ONE. `buildAttack` folds ability mod, proficiency
// bonus and global effects into a finished `toHit` number. Handing that to the Attacks row would
// double-count, because the row adds ability + PB + the ledger's attack targets itself. Returning the
// weapon's INTRINSIC facts and letting the row do the arithmetic is what keeps a weapon row honest — the
// same reason the granted-attack path is "rendered through the SAME row logic so their to-hit/damage
// can't drift".
import type { AbilityKey } from '../rules/dnd';
import type { Attack, InvItem, WeaponStats } from '../types';

/** The row a weapon item contributes, badged to the item it came from. */
export interface WeaponAttackRow {
  atk: Attack;
  source: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Is this item a weapon for Attacks-table purposes? Either signal counts: `kind` is what the
 *  ItemBuilder sets, and the `weapon` TAG is what the player-facing contract names (and what a
 *  hand-written or imported item is likely to carry). */
export const isWeaponItem = (it: InvItem): it is InvItem & { weapon: WeaponStats } =>
  !!it.weapon && (it.kind === 'weapon' || (it.tags ?? []).includes('weapon'));

/**
 * Which ability powers this weapon, when the item doesn't say.
 *
 * The ItemBuilder always writes one (its select defaults to STR), so this only covers items authored
 * before the field existed, imports, and AI-written items. The rule is the one already established in
 * `engine/weapons.ts`: finesse takes the better of STR/DEX, ammunition (bows, crossbows) is DEX, and
 * everything else is STR. Kept identical on purpose — two places deciding this differently is how a
 * weapon's to-hit comes out different depending on which surface you look at.
 */
export function weaponAbility(w: WeaponStats, mods: Partial<Record<AbilityKey, number>>): AbilityKey {
  if (w.ability) return w.ability;
  const props = (w.properties ?? []).map(norm);
  if (props.includes('finesse')) return (mods.dex ?? 0) >= (mods.str ?? 0) ? 'dex' : 'str';
  if (props.includes('ammunition')) return 'dex';
  return 'str';
}

/**
 * Every weapon in the inventory, as Attacks-table rows.
 *
 * NOT gated on `equipped`. The contract the player is shown is unconditional — the tag "shows up in
 * your Attacks table" — and a paper sheet lists the weapons you carry, not only the one in your hand.
 * (Equipping still governs EFFECTS, via the ledger; that is a different question from being listed.)
 * The dead `attacksFromInventory` did filter on `equipped`, so this is a deliberate divergence from it
 * rather than an oversight: if the owner prefers held-only, it is the one `filter` below.
 *
 * `taken` are names already spoken for by stored attacks, so a player who hand-authored "Longsword"
 * before this existed doesn't suddenly see it twice. Matched on the normalised NAME because a stored
 * attack carries no reference to the item it was written for.
 */
export function attacksFromWeaponItems(
  inventory: InvItem[] | undefined,
  mods: Partial<Record<AbilityKey, number>>,
  taken: string[] = [],
): WeaponAttackRow[] {
  const spokenFor = new Set(taken.map(norm));
  return (inventory ?? [])
    .filter(isWeaponItem)
    .filter((it) => !spokenFor.has(norm(it.name)))
    .map((it) => {
      const w = it.weapon;
      const ability = weaponAbility(w, mods);
      const ranged = (w.properties ?? []).map(norm).includes('ammunition');
      // Extra typed dice (a +1d6 poison blade) have no field on `Attack`, whose damage is one die
      // string plus a flat modifier. They go in `notes`, which the row already renders — dropping
      // them silently would understate the weapon the player authored.
      const extra = (w.bonus ?? []).filter((b) => b.dice?.trim()).map((b) => `+${b.dice} ${b.type}`.trim());
      const atk: Attack = {
        // Namespaced so it can never collide with a stored attack's id (and so the row key is stable).
        id: `witem-${it.id}`,
        name: it.name,
        ability,
        proficient: w.proficient === true,
        range: w.range?.trim() || (ranged ? '—' : '5 ft'),
        damage: w.damage?.dice?.trim() || '1d4',
        damageType: w.damage?.type?.trim() || '—',
        ...(w.toHitBonus ? { bonusToHit: w.toHitBonus } : {}),
        // STR melee is what Reckless Attack's advantage keys off, so a greataxe qualifies and a bow doesn't.
        ...(ability === 'str' && !ranged ? { strMelee: true } : {}),
        ...(extra.length ? { notes: extra.join(', ') } : {}),
      };
      return { atk, source: it.name };
    });
}
