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
      `${anc ? ` (${anc})` : ''}, level ${level}.`,
  );

  // The defenses a ruling turns on ("does the target save?", "does the attack hit your AC?").
  lines.push(
    `DEFENSES: AC ${d.ac} · HP ${d.maxHp} · Fort ${sign(d.saves.Fortitude)} · ` +
      `Ref ${sign(d.saves.Reflex)} · Will ${sign(d.saves.Will)} · Perception ${sign(d.perception)}.`,
  );

  // Class/Spell DC + the Multiple Attack Penalty schedule (the 2nd/3rd Strike are the ones AI gets wrong).
  const off: string[] = [`Class DC ${d.classDc}`];
  if (d.spellDc != null) off.push(`Spell DC ${d.spellDc} · Spell attack ${sign(d.spellAttack ?? 0)}`);
  lines.push(
    `OFFENSE: ${off.join(' · ')}. Multiple Attack Penalty: 2nd Strike ${pf2MultipleAttackPenalty(1, false)} ` +
      `(${pf2MultipleAttackPenalty(1, true)} agile), 3rd ${pf2MultipleAttackPenalty(2, false)} (${pf2MultipleAttackPenalty(2, true)} agile).`,
  );

  if (pf2.attacks?.length) {
    lines.push(`STRIKES: ${pf2.attacks.map((a) => `${a.name} ${sign(pf2AttackBonus(a, level, pf2.attributes))}`).join(' · ')}`);
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
