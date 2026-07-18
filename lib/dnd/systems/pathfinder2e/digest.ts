// lib/dnd/systems/pathfinder2e/digest.ts — the in-play STATE summary of a PF2 character for the
// adjudication AI ("Ask the Librarian" about THIS character).
//
// The general `characterDigest` reads the 5e `Character` model; a PF2 character's real numbers live in the
// `data.pf2e` sidecar (PF2Character) and are computed by the pure `rules.ts` (proficiency = rank + level,
// AC, DCs, saves, Strike bonuses, MAP) — none of which the general digest sees. So without this the
// librarian would rule on a PF2 character blind to its actual AC, save totals, Class/Spell DC, and skill
// bonuses ("does the target save vs your DC?" needs the number). Pure + PF2-source-only (Ground Rule 1);
// the chat route appends it.

import type { PF2Character } from './model';
import { pf2Derived, pf2SkillTotal, pf2AttackBonus, pf2MultipleAttackPenalty } from './rules';

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** A compact, adjudication-focused summary of a PF2 character's derived numbers + capabilities. */
export function pf2CharacterDigest(pf2: PF2Character): string {
  const lines: string[] = [];
  const id = pf2.identity;
  const level = id.level;
  const d = pf2Derived(pf2);

  const build = [id.className, id.subclass].filter(Boolean).join(' ');
  const anc = [id.ancestry, id.heritage].filter(Boolean).join(' ');
  lines.push(
    `PATHFINDER 2e CHARACTER: ${id.name || 'Unnamed'}${build ? ` — ${build}` : ''}` +
      `${anc ? ` (${anc})` : ''}, level ${level}.` +
      // Background gives narrative/context; DEITY is mechanically live in PF2 (anathema, domains, favored
      // weapon), so a ruling on "does this break your anathema?" needs it. Both omitted when unset.
      `${id.background ? ` Background: ${id.background}.` : ''}${id.deity ? ` Deity: ${id.deity}.` : ''}`,
  );

  // The defenses a ruling turns on ("does the target save?", "does the attack hit your AC?"). HP is
  // CURRENT/max so a ruling knows how hurt the character is (currentHp 0 = unset/full, as the sheet reads it).
  const hpCur = pf2.combat.currentHp || d.maxHp;
  const temp = pf2.combat.tempHp ? ` (+${pf2.combat.tempHp} temp)` : '';
  lines.push(
    `DEFENSES: AC ${d.ac} · HP ${hpCur}/${d.maxHp}${temp} · Fort ${sign(d.saves.Fortitude)} · ` +
      `Ref ${sign(d.saves.Reflex)} · Will ${sign(d.saves.Will)} · Perception ${sign(d.perception)}.`,
  );

  // PF2's death track — stated only when live, since a ruling on a downed character turns on it (Dying 4 =
  // dead; each Wounded step raises the Dying you return with). PF2 tracks no other named conditions.
  const track: string[] = [];
  if (pf2.combat.dyingValue) track.push(`Dying ${pf2.combat.dyingValue}`);
  if (pf2.combat.woundedValue) track.push(`Wounded ${pf2.combat.woundedValue}`);
  if (track.length) lines.push(`STATUS: ${track.join(' · ')}.`);

  // Class/Spell DC + the Multiple Attack Penalty schedule (the 2nd/3rd Strike are the ones AI gets wrong).
  const off: string[] = [`Class DC ${d.classDc}`];
  if (d.spellDc != null) off.push(`Spell DC ${d.spellDc} · Spell attack ${sign(d.spellAttack ?? 0)}`);
  lines.push(
    `OFFENSE: ${off.join(' · ')}. Multiple Attack Penalty: 2nd Strike ${pf2MultipleAttackPenalty(1, false)} ` +
      `(${pf2MultipleAttackPenalty(1, true)} agile), 3rd ${pf2MultipleAttackPenalty(2, false)} (${pf2MultipleAttackPenalty(2, true)} agile).`,
  );

  if (pf2.attacks?.length) {
    // Name + to-hit AND damage (a ruling needs "how much?", not just "does it hit?"), plus traits — agile
    // decides which Multiple Attack Penalty column applies, so the AI must see it on the strike itself.
    lines.push(
      `STRIKES: ${pf2.attacks
        .map((a) => {
          const traits = (a.traits ?? []).length ? ` [${a.traits.join(', ')}]` : '';
          return `${a.name} ${sign(pf2AttackBonus(a, level, pf2.attributes))}${a.damage ? `, ${a.damage}` : ''}${traits}`;
        })
        .join(' · ')}`,
    );
  }

  // Trained-or-better skills with their totals — the numbers behind a skill ruling ("Athletics to Grapple").
  const trained = (pf2.skills ?? []).filter((s) => s.rank !== 'untrained');
  if (trained.length) {
    lines.push(
      `SKILLS: ${trained
        .map((s) => `${s.name} ${sign(pf2SkillTotal(s, level, pf2.attributes, pf2.combat.armorCheckPenalty))} (${s.rank})`)
        .join(' · ')}`,
    );
  }

  return lines.join('\n');
}
