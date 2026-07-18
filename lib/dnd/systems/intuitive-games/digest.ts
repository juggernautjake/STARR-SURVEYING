// lib/dnd/systems/intuitive-games/digest.ts — the in-play STATE summary of an IG character for the
// adjudication AI ("Ask the Librarian" about THIS character).
//
// The general `characterDigest` reads the 5e `Character` model; an IG character's real state lives in the
// `data.ig` sidecar (IGCharacter) with its OWN conditions / active stance / feats / powers, and the
// mechanical EFFECT of that state (the stacking condition penalty, the active stance's benefit) is computed
// by `modifiers.ts` — none of which the general digest sees. So without this the librarian would rule on an
// IG character blind to whether it is Shaken (−2 to attacks/saves/skills) or in an Offensive stance
// (advantage on attacks). Pure + IG-source-only (Ground Rule 1); the chat route appends it to the digest.

import { type IGCharacter, IG_ABILITIES } from './model';
import { igConditionSummary, igStanceMechanicNote } from './modifiers';
import { findIGAncestry, IG_DEFENSIVE_POWERS } from './content';
import { igDerived, igSkillTotal, igAbilityMod, igResolveAttack } from './rules';

const sgn = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** A compact, adjudication-focused summary of an IG character's current mechanical state. */
export function igCharacterDigest(ig: IGCharacter): string {
  const lines: string[] = [];
  const id = ig.identity;
  const build = [id.className, id.subclass, id.specialization].filter(Boolean).join(' / ');
  lines.push(
    `INTUITIVE GAMES CHARACTER: ${id.name || 'Unnamed'}${build ? ` — ${build}` : ''}` +
      `${id.ancestry ? ` (${id.ancestry})` : ''}, level ${id.level}.` +
      `${id.background ? ` Background: ${id.background}.` : ''}`,
  );

  // Ancestry TRAITS with their full IG text — a ruling on "can you see in the dark?" turns on the
  // ancestry's own trait (Cave Vision → darkvision 30 ft), which naming the ancestry alone doesn't give.
  // Drawn only from IG_ANCESTRIES (Ground Rule 1); an unknown/custom ancestry resolves to nothing, never
  // invented. This mirrors the 5e digest surfacing senses/movement the AI would otherwise be blind to.
  const ancestry = findIGAncestry(id.ancestry);
  if (ancestry?.traits.length) {
    lines.push(`ANCESTRY TRAITS (${ancestry.name}): ${ancestry.traits.map((t) => `${t.name} — ${t.text}`).join(' · ')}`);
  }

  // DEFENSES — the numbers a ruling turns on, resolved by rules.ts: current/max HP (IG tracks lethal and
  // nonlethal damage separately), damage reduction, and the three saves (Fortitude/Reflex/Will). Without
  // these the librarian couldn't answer "am I still up?" or "do I make the Reflex save?" for the character.
  const der = igDerived(ig);
  const nonlethal = Number(ig.combat.hitPoints?.nonlethal) || 0;
  const dr = Number(ig.combat.damageReduction) || 0;
  const hp = `HP ${der.currentHp}/${der.maxHp}${nonlethal ? ` (${nonlethal} nonlethal)` : ''}`;
  // Raw ability modifiers — a ruling on a bare ability check (a STR check to force a door) needs these, not
  // just the derived skills/saves. Scores → mods via igAbilityMod, exactly as the sheet computes them.
  lines.push(`ABILITIES: ${IG_ABILITIES.map((k) => `${k} ${sgn(igAbilityMod(ig.abilities[k]))}`).join(', ')}`);

  const saves = `Fort ${sgn(der.saves.Fortitude)}, Ref ${sgn(der.saves.Reflex)}, Will ${sgn(der.saves.Will)}`;
  lines.push(`DEFENSES: ${hp} · DR ${dr} · Saves ${saves}`);

  // ATTACKS — a ruling on "does my sword hit / how much damage?" needs the resolved to-hit + damage, which
  // the digest was missing entirely for IG (5e/PF2 carry theirs). igResolveAttack folds proficiency, Weapon
  // Focus/Specialization, and the governing ability, exactly as the sheet does.
  if (ig.combat.attacks?.length) {
    const parts = ig.combat.attacks.map((a) => {
      const r = igResolveAttack(ig, a);
      return `${a.name} ${sgn(r.toHit)}, ${r.damage}`;
    });
    lines.push(`ATTACKS: ${parts.join(' · ')}`);
  }

  // Trained SKILLS with their totals — a skill-check ruling ("do you pick the lock?") needs the bonus. Only
  // ranked/proficient skills are listed (untrained ones would just be clutter); a combat skill is flagged
  // because it resolves against the target's Reflex save, not a flat DC (IG's distinct combat-skill rule).
  const trained = (ig.skills ?? []).filter((s) => (Number(s.ranks) || 0) > 0 || s.proficient);
  if (trained.length) {
    const parts = trained.map((s) => `${s.name} ${sgn(igSkillTotal(s, id.level, igAbilityMod(ig.abilities[s.ability])))}${s.combat ? ' [combat]' : ''}`);
    lines.push(`SKILLS (trained): ${parts.join(', ')}`);
  }

  // Active stance — one at a time. Its mechanical effect (advantage/disadvantage/DR/bonus) is exactly what
  // a ruling turns on, so state the resolved note, not just the name.
  const stance = ig.combat.stances?.[0];
  lines.push(`ACTIVE STANCE: ${stance ? (igStanceMechanicNote(stance, id.level) ?? `${stance} Stance`) : 'none'}`);

  // Conditions + the SAME computed penalty/disadvantage the sheet shows, so the AI rules WITH them (a ruling
  // on "does my attack hit while Shaken?" needs the −2 that the player can see on the sheet).
  const conds = ig.combat.conditions ?? [];
  if (conds.length) {
    const sum = igConditionSummary(conds);
    const parts: string[] = [conds.join(', ')];
    if (sum.flatD20 !== 0) parts.push(`${sum.flatD20} to attacks, saves & skill checks (${sum.flatSources.join(', ')})`);
    for (const d of sum.disadvantages) parts.push(d);
    lines.push(`CONDITIONS: ${parts.join(' · ')}`);
  } else {
    lines.push('CONDITIONS: none');
  }

  // The defensive power is a combat reaction — show WHAT it does, like the stance's effect and the
  // conditions' penalty above, since the AI can't recall a bespoke IG reaction from its name alone. Effect
  // from IG_DEFENSIVE_POWERS for a recognized one; a custom/unknown power stays name-only (never invented).
  if (ig.combat.defensivePower) {
    const dp = IG_DEFENSIVE_POWERS.find((d) => d.name.toLowerCase() === ig.combat.defensivePower.toLowerCase());
    lines.push(`DEFENSIVE POWER: ${ig.combat.defensivePower}${dp?.effect ? ` — ${dp.effect}` : ''}`);
  }
  const feats = [...(ig.feats?.general ?? []), ...(ig.feats?.combat ?? [])];
  if (feats.length) lines.push(`FEATS: ${feats.join(', ')}`);
  if (ig.powers?.length) lines.push(`POWERS: ${ig.powers.join(', ')}`);

  // Companion creature (Beastmaster's beast, Summoner's elemental, …) — a whole second combatant the AI
  // would otherwise never see. State its type + HP so a ruling knows the companion is on the field.
  const comp = ig.companion;
  if (comp) {
    const bits = [comp.creatureType, `HP ${comp.hitPoints}`, comp.movement].filter(Boolean);
    lines.push(`COMPANION: ${comp.name || 'Unnamed'}${bits.length ? ` (${bits.join(', ')})` : ''}`);
  }

  return lines.join('\n');
}
