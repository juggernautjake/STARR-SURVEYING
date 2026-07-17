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
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import { abilityMod, profBonusForLevel, profContribution } from '@/app/dnd/_sheet/rules/dnd';
import { buildLedger } from './effects/ledger';
import { deriveAc } from '@/app/dnd/_sheet/lib/derive-ac';
import { summarizeCharacterProvenance } from './provenance';
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
  const pb = profBonusForLevel(m.level ?? 1);
  // Effective ability score for a key — the digest's numbers must fold item/effect boosts.
  const effAbil = (k: AbilityKey): number => ledger.value(`ability_${k}`, char.abilities?.[k] ?? 10);

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
  // Passive Perception + Initiative — both routinely decide a ruling ("does the guard notice?", "who
  // acts first?"). EFFECTIVE: WIS/DEX fold through the ledger and Initiative folds any `initiative` effect.
  if (char.skills?.perception) {
    const pp = 10 + abilityMod(ledger.value('ability_wis', char.abilities?.wis ?? 10)) + profContribution(char.skills.perception.prof, pb) + (char.skills.perception.misc ?? 0);
    state.push(`Passive Perception ${pp}`);
  }
  if (char.abilities?.dex != null) {
    const init = ledger.value('initiative', abilityMod(ledger.value('ability_dex', char.abilities.dex)) + (c.initiativeMisc ?? 0));
    state.push(`Initiative ${signed(init)}`);
  }
  if (c.exhaustion) state.push(`Exhaustion ${c.exhaustion}`);
  if (state.length) lines.push(`STATE: ${state.join(' · ')}`);

  // What is currently modifying this character — so the AI knows WHY a number differs from the base
  // and can factor it into a ruling ("you have advantage from Rage").
  if (ledger.sources.length) {
    lines.push(`ACTIVE EFFECTS: ${ledger.sources.map((s) => s.name).join(', ')}`);
  }

  // Provenance (Slice 22): which elements are this system's vanilla content vs homebrew vs DM-granted,
  // so the librarian adjudicates WITH the character's own content instead of disclaiming it as
  // "unofficial". `summarizeCharacterProvenance` already computes this; it just wasn't in the prompt.
  const prov = summarizeCharacterProvenance(char, system);
  if (prov.hasCustom) {
    const parts: string[] = [];
    if (prov.custom.length) parts.push(`homebrew: ${prov.custom.map((e) => e.name).join(', ')}`);
    if (prov.dmGranted.length) parts.push(`DM-granted: ${prov.dmGranted.map((e) => `${e.name} (by ${e.grantedBy ?? 'DM'})`).join(', ')}`);
    if (parts.length) lines.push(`PROVENANCE — ${parts.join(' · ')}. These are REAL for this character; adjudicate WITH them, do not disclaim them as unofficial.`);
  }

  const conditions = c.conditions ?? [];
  // Say "none" explicitly: the absence of a condition is itself a fact a ruling may hinge on.
  lines.push(`CONDITIONS: ${conditions.length ? conditions.join(', ') : 'none'}`);
  if (c.concentration) lines.push(`CONCENTRATING ON: ${c.concentration}`);

  // Saving-throw BONUSES — a ruling ("does the target make the CON save vs your DC?") needs the number,
  // not just which saves are proficient. Effective ability + PB (if proficient) + misc, like the sheet.
  if (char.saves) {
    const saveLine = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const)
      .map((k) => {
        const s = char.saves![k] ?? { proficient: false, misc: 0 };
        const mod = abilityMod(effAbil(k)) + (s.proficient ? pb : 0) + (s.misc ?? 0);
        return `${k.toUpperCase()} ${signed(mod)}${s.proficient ? '*' : ''}`;
      })
      .join(' · ');
    lines.push(`SAVES: ${saveLine}  (* = proficient)`);
  }
  const skills = Object.entries(char.skills ?? {})
    .filter(([, v]) => v?.prof && v.prof !== 'none')
    .map(([k, v]) => `${k}${v.prof === 'expertise' ? ' (expertise)' : ''}`);
  if (skills.length) lines.push(`SKILL PROFICIENCIES: ${skills.join(', ')}`);

  // Resources — a ruling often depends on whether the character can still pay for something.
  const res = (char.resources ?? []).map((r) => `${r.name} ${r.current}/${r.max} (resets on ${r.resetOn} rest)`);
  if (res.length) lines.push(`RESOURCES: ${res.join(' · ')}`);

  // Spell save DC + attack — a caster's most-adjudicated numbers ("does the target save vs your
  // Fireball?"). EFFECTIVE, matching what SpellsPanel shows: the spellcasting ability folds through the
  // ledger and the DC/attack fold their own spell_save_dc/spell_attack effects, so an INT/CHA item or a
  // Rod of the Pact Keeper is reflected — the AI must not rule on a stale DC.
  if (char.spellcasting?.ability) {
    const sc = char.spellcasting;
    const mod = abilityMod(ledger.value(`ability_${sc.ability}`, char.abilities?.[sc.ability] ?? 10));
    const dc = ledger.value('spell_save_dc', c.saveDCOverride ?? 8 + pb + mod);
    const atk = ledger.value('spell_attack', pb + mod);
    lines.push(`SPELLCASTING: ${sc.ability.toUpperCase()} · Spell Save DC ${dc} · Spell Attack ${signed(atk)}`);
  }

  if (char.spellcasting?.slots) {
    const slots = Object.entries(char.spellcasting.slots)
      .filter(([, v]) => v && v.max > 0)
      .map(([lv, v]) => `L${lv} ${v!.current}/${v!.max}`);
    if (slots.length) lines.push(`SPELL SLOTS: ${slots.join(' · ')}`);
  }

  // Attacks, with the numbers.
  // Attacks WITH their to-hit / save DC — "does it hit AC 15?" is the other half of most combat
  // rulings. Computed like the sheet's Attacks table: effective ability mod + PB (if proficient) +
  // bonus, or an AOE's save DC. Without this the AI knew the damage but not whether the attack lands.
  const attacks = (char.attacks ?? [])
    .filter((a) => (a.unlockLevel ?? 1) <= (m.level ?? 1))
    .map((a) => {
      const key: AbilityKey = char.abilities?.[a.ability] != null ? a.ability : 'str';
      const hit = a.saveBased
        ? `DC ${a.saveDcOverride ?? 8 + pb + abilityMod(effAbil(a.saveDcAbility ?? 'str'))} ${(a.saveAbility ?? 'dex').toUpperCase()} save`
        : `${signed(abilityMod(effAbil(key)) + (a.proficient ? pb : 0) + (a.bonusToHit ?? 0))} to hit`;
      // Damage die + the ability mod the sheet adds automatically (the `damage` field is the raw die).
      // AOE dice don't add the ability mod, matching the Attacks table.
      const die = a.damageByLevel?.length ? a.damageByLevel.reduce((acc, e) => ((m.level ?? 1) >= e.level ? e.damage : acc), a.damage) : a.damage;
      const dmgMod = a.saveBased ? 0 : abilityMod(effAbil(key)) + (a.bonusDamage ?? 0);
      return `${a.name} (${hit}, ${a.range}, ${die}${dmgMod ? signed(dmgMod) : ''} ${a.damageType})`;
    });
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
    // Slice 22 — meet customization without flinching. The librarian's "never invent" honesty rule
    // is right, but pointed at a homebrew sheet it wrongly disclaims the character's OWN content.
    `HOMEBREW IS REAL: content on ${characterName}'s sheet marked homebrew or DM-granted (see PROVENANCE) is this character's actual rule — the sheet is its source of truth. Adjudicate WITH it; do NOT call it "unofficial" or refuse to use it. Only flag it when the player explicitly asks whether something is official, or when a homebrew element contradicts a ${systemName} rule in a way that changes the answer.`,
    '',
    `Never invent a feature, a number, or a resource that is neither on ${characterName}'s sheet nor in the ${systemName} rules. (Homebrew being ON the sheet is exactly what makes citing it honest, not invention.)`,
  ].join('\n');
}
