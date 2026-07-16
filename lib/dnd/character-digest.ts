// lib/dnd/character-digest.ts — a compact, factual summary of a character for the AI.
//
// The librarian answers rules questions from the system's catalog. To ADJUDICATE — "can I use
// Cross Counter while grappled?" — it also needs to know what this character actually is: its
// class and level, what it can do, what's currently true of it (conditions, HP, resources).
//
// Deliberately FACTS ONLY and deliberately small:
//  · No bio/flavour prose. It's not evidence for a ruling and it burns the context window.
//  · Bodies are truncated. The full rules text is already in the grounding block; the digest's
//    job is to say WHICH features this character has, not to restate them.
//  · Nothing is inferred. If the sheet doesn't say it, it isn't here — the AI must not be handed
//    a guess dressed up as a fact.
import type { Character } from '@/app/dnd/_sheet/types';
import { abilityMod } from '@/app/dnd/_sheet/rules/dnd';
import { buildLedger } from './effects/ledger';
import { deriveAc } from '@/app/dnd/_sheet/lib/derive-ac';
import { systemLabel, type CharacterSystem } from './systems';

/** Trim a rules body to its first sentence-ish, for a name + reminder rather than a restatement. */
function brief(body: string, max = 130): string {
  const flat = (body || '').replace(/\*\*/g, '').replace(/\s*\n+\s*/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  return (stop > 60 ? cut.slice(0, stop + 1) : cut) + '…';
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export interface DigestOptions {
  /** Cap on features listed, newest-unlocked first. Keeps the prompt bounded on a level-20 sheet. */
  maxFeatures?: number;
}

/**
 * Render `char` as the block the adjudication prompt reads. Returns plain text (not JSON) because
 * the model reasons over it better, and because it stays readable in a log when a ruling looks off.
 */
export function characterDigest(char: Character, system: CharacterSystem, opts: DigestOptions = {}): string {
  const maxFeatures = opts.maxFeatures ?? 24;
  const m = char.meta ?? ({} as Character['meta']);
  const c = char.combat ?? ({} as Character['combat']);
  const lines: string[] = [];

  // Resolve the character through the effect ledger (Slice 15): the digest must report the numbers
  // that are TRUE RIGHT NOW, not the stored base. A ruling on a belt-boosted STR 19 that reads the
  // base 16 is exactly the confidently-wrong adjudication this whole part exists to prevent.
  const ledger = buildLedger(char);

  const who = [m.species, m.className, m.subclass].filter(Boolean).join(' · ');
  lines.push(`NAME: ${m.name || 'Unnamed'}`);
  lines.push(`SYSTEM: ${systemLabel(system)}`);
  if (who) lines.push(`BUILD: ${who}`);
  if (m.level) lines.push(`LEVEL: ${m.level}`);

  // Abilities with modifiers — the numbers most rulings turn on. EFFECTIVE (ledger) values, with
  // the base noted when an effect has moved it, so the AI reasons on the real score AND can see it's
  // not the character's natural one.
  if (char.abilities) {
    const ab = Object.entries(char.abilities)
      .map(([k, v]) => {
        const eff = ledger.value(`ability_${k}`, v as number);
        const note = eff !== v ? ` [base ${v}]` : '';
        return `${k.toUpperCase()} ${eff} (${signed(abilityMod(eff))})${note}`;
      })
      .join(' · ');
    if (ab) lines.push(`ABILITIES: ${ab}`);
  }

  // Current state — what is true of this character RIGHT NOW. Speed, max HP and AC all resolve
  // effectively: HP/speed fold through the ledger; AC runs the same `deriveAc` the sheet does
  // (equipped armour/shield + AC effects), so the digest's AC matches what the player sees.
  const state: string[] = [];
  if (c.maxHp != null) {
    const hp = ledger.value('hp_max', c.maxHp);
    state.push(`HP ${c.currentHp ?? 0}/${hp}${hp !== c.maxHp ? ` [base ${c.maxHp}]` : ''}${c.tempHp ? ` (+${c.tempHp} temp)` : ''}`);
  }
  if (c.ac != null) {
    const dexMod = abilityMod(ledger.value('ability_dex', char.abilities?.dex ?? 10));
    const acInfo = deriveAc(char.inventory, dexMod, c.ac, char.activeEffects);
    state.push(`AC ${acInfo.ac}${acInfo.ac !== c.ac ? ` [base ${c.ac}]` : ''}`);
  }
  if (c.speed != null) {
    const sp = ledger.value('speed_walk', c.speed);
    state.push(`Speed ${sp} ft${sp !== c.speed ? ` [base ${c.speed}]` : ''}`);
  }
  if (c.exhaustion) state.push(`Exhaustion ${c.exhaustion}`);
  if (state.length) lines.push(`STATE: ${state.join(' · ')}`);

  // What is currently modifying this character — so the AI knows WHY a number differs from the base
  // and can factor it into a ruling ("you have advantage from Rage").
  if (ledger.sources.length) {
    lines.push(`ACTIVE EFFECTS: ${ledger.sources.map((s) => s.name).join(', ')}`);
  }

  const conditions = c.conditions ?? [];
  // Say "none" explicitly: the absence of a condition is itself a fact a ruling may hinge on.
  lines.push(`CONDITIONS: ${conditions.length ? conditions.join(', ') : 'none'}`);
  if (c.concentration) lines.push(`CONCENTRATING ON: ${c.concentration}`);

  // Proficiencies actually matter for "can I…" questions.
  const profSaves = Object.entries(char.saves ?? {})
    .filter(([, v]) => v?.proficient)
    .map(([k]) => k.toUpperCase());
  if (profSaves.length) lines.push(`SAVE PROFICIENCIES: ${profSaves.join(', ')}`);
  const skills = Object.entries(char.skills ?? {})
    .filter(([, v]) => v?.prof && v.prof !== 'none')
    .map(([k, v]) => `${k}${v.prof === 'expertise' ? ' (expertise)' : ''}`);
  if (skills.length) lines.push(`SKILL PROFICIENCIES: ${skills.join(', ')}`);

  // Resources — a ruling often depends on whether the character can still pay for something.
  const res = (char.resources ?? []).map((r) => `${r.name} ${r.current}/${r.max} (resets on ${r.resetOn} rest)`);
  if (res.length) lines.push(`RESOURCES: ${res.join(' · ')}`);

  if (char.spellcasting?.slots) {
    const slots = Object.entries(char.spellcasting.slots)
      .filter(([, v]) => v && v.max > 0)
      .map(([lv, v]) => `L${lv} ${v!.current}/${v!.max}`);
    if (slots.length) lines.push(`SPELL SLOTS: ${slots.join(' · ')}`);
  }

  // Attacks, with the numbers.
  const attacks = (char.attacks ?? [])
    .filter((a) => (a.unlockLevel ?? 1) <= (m.level ?? 1))
    .map((a) => `${a.name} (${a.range}, ${a.damage} ${a.damageType})`);
  if (attacks.length) lines.push(`ATTACKS: ${attacks.join(' · ')}`);

  // Features the character actually HAS at its level — the core of "does my feature apply?".
  const feats = (char.features ?? [])
    .filter((f) => (f.unlockLevel ?? 1) <= (m.level ?? 1))
    .slice(0, maxFeatures);
  if (feats.length) {
    lines.push('FEATURES:');
    for (const f of feats) lines.push(`  · ${f.name}${f.source ? ` [${f.source}]` : ''}: ${brief(f.body?.[0] ?? '')}`);
    const hidden = (char.features ?? []).length - feats.length;
    if (hidden > 0) lines.push(`  · (+${hidden} more not listed)`);
  }

  const traits = char.traits ?? [];
  if (traits.length) {
    lines.push('TRAITS:');
    for (const t of traits) lines.push(`  · ${brief(t)}`);
  }

  const equipped = (char.inventory ?? []).filter((i) => i.equipped || i.tags?.includes('equipped'));
  if (equipped.length) lines.push(`EQUIPPED: ${equipped.map((i) => i.name).join(' · ')}`);

  const active = (char.activeEffects ?? []).map((e) => e.label);
  if (active.length) lines.push(`ACTIVE EFFECTS: ${active.join(' · ')}`);

  return lines.join('\n');
}

/**
 * The instruction that turns the librarian into an adjudicator for THIS character.
 *
 * The hard part of a ruling isn't the answer, it's the honesty: most table arguments happen where
 * the rules genuinely don't say. So this demands the model separate what the rules state from what
 * it is inferring, and hand the call to the DM when the rules don't settle it — rather than
 * manufacturing a confident answer, which is the failure mode that makes a rules bot useless.
 */
export function adjudicationInstruction(characterName: string, systemName: string): string {
  return [
    `ADJUDICATING FOR A SPECIFIC CHARACTER: you are answering about ${characterName}, whose sheet is given below.`,
    `Use ${characterName}'s ACTUAL numbers, features, resources and current conditions — not a generic ${systemName} character's.`,
    '',
    'When the question is situational ("can I…", "what happens if…", "does X apply here?"):',
    `1. Answer with a clear ruling first, in one line.`,
    `2. Then say WHY, citing the specific rule and the specific thing on ${characterName}'s sheet that it turns on.`,
    `3. If the rules as given genuinely do not settle it, SAY SO — do not manufacture a rule to close the gap.`,
    `   Give the most defensible reading, label it as your reading, and say it is the DM's call.`,
    `4. If the character cannot do the thing (no such feature, no resource left, a condition blocks it),`,
    `   say that plainly and name what is missing.`,
    '',
    'Never invent a feature, a number, or a resource this character does not have on its sheet.',
  ].join('\n');
}
