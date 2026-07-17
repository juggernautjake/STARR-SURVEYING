// lib/dnd/systems/intuitive-games/digest.ts — the in-play STATE summary of an IG character for the
// adjudication AI ("Ask the Librarian" about THIS character).
//
// The general `characterDigest` reads the 5e `Character` model; an IG character's real state lives in the
// `data.ig` sidecar (IGCharacter) with its OWN conditions / active stance / feats / powers, and the
// mechanical EFFECT of that state (the stacking condition penalty, the active stance's benefit) is computed
// by `modifiers.ts` — none of which the general digest sees. So without this the librarian would rule on an
// IG character blind to whether it is Shaken (−2 to attacks/saves/skills) or in an Offensive stance
// (advantage on attacks). Pure + IG-source-only (Ground Rule 1); the chat route appends it to the digest.

import type { IGCharacter } from './model';
import { igConditionSummary, igStanceMechanicNote } from './modifiers';

/** A compact, adjudication-focused summary of an IG character's current mechanical state. */
export function igCharacterDigest(ig: IGCharacter): string {
  const lines: string[] = [];
  const id = ig.identity;
  const build = [id.className, id.subclass, id.specialization].filter(Boolean).join(' / ');
  lines.push(
    `INTUITIVE GAMES CHARACTER: ${id.name || 'Unnamed'}${build ? ` — ${build}` : ''}` +
      `${id.ancestry ? ` (${id.ancestry})` : ''}, level ${id.level}.`,
  );

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

  if (ig.combat.defensivePower) lines.push(`DEFENSIVE POWER: ${ig.combat.defensivePower}`);
  const feats = [...(ig.feats?.general ?? []), ...(ig.feats?.combat ?? [])];
  if (feats.length) lines.push(`FEATS: ${feats.join(', ')}`);
  if (ig.powers?.length) lines.push(`POWERS: ${ig.powers.join(', ')}`);

  return lines.join('\n');
}
