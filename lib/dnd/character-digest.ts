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
import { abilityMod, profBonusForLevel, profContribution, SKILLS } from '@/app/dnd/_sheet/rules/dnd';
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
  // Background (its grants are reflected in skills/features, but the name gives context) and alignment
  // (mechanically live in 2014 — aligned weapons, detect evil/good — narrative in 2024). Omitted when unset.
  const idExtra = [m.background && `Background: ${m.background}`, m.alignment && `Alignment: ${m.alignment}`].filter(Boolean).join(' · ');
  if (idExtra) lines.push(idExtra);

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
  // Non-walking movement (Slice 11): fly/swim/climb/burrow are each their own target with their own
  // base, exactly as CombatPanel shows them — a potion of flying is a fly speed, not "+30 speed". The
  // sheet gives these a home; the digest is the AI's copy of the sheet, so a ruling ("can you reach the
  // ledge?", "how fast do you swim clear?") must see them too. Shown only once granted (base 0 hidden).
  const extraSpeeds = (
    [
      ['speed_fly', 'fly'],
      ['speed_swim', 'swim'],
      ['speed_climb', 'climb'],
      ['speed_burrow', 'burrow'],
    ] as const
  )
    .map(([key, label]) => ({ label, value: ledger.value(key, 0), modified: ledger.isModified(key) }))
    .filter((s) => s.value > 0 || s.modified);
  if (extraSpeeds.length) state.push(`Movement ${extraSpeeds.map((s) => `${s.label} ${s.value} ft`).join(', ')}`);
  // Granted senses (darkvision 60, tremorsense…) — a ruling on "do you see in the dark?" hinges on this.
  // Same source the sheet's Senses line reads (grant_sense contributions carry the sense text).
  const senses = ledger
    .explain('grant_sense')
    .filter((cn) => !cn.suppressed && typeof cn.effect.value === 'string')
    .map((cn) => String(cn.effect.value));
  if (senses.length) state.push(`Senses ${senses.join(', ')}`);
  // Movement traits granted by an effect — presence IS the effect (Boots of Levitation → hover; a spell →
  // ignore difficult terrain). CombatPanel lists these; a ruling on "can you cross the bramble?" / "do you
  // fall when knocked prone mid-air?" needs them too. Read like the sheet: any non-suppressed contribution.
  const moveTraits = (
    [
      ['hover', 'can hover'],
      ['ignore_difficult_terrain', 'ignores difficult terrain'],
    ] as const
  )
    .filter(([key]) => ledger.explain(key).some((cn) => !cn.suppressed))
    .map(([, label]) => label);
  if (moveTraits.length) state.push(`Movement traits: ${moveTraits.join(', ')}`);
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
  // State the exhaustion penalty the SHEET applies (−2/level to every d20 roll), so a ruling on "does
  // this attack/save/check land?" uses the same reduced roll the sheet does — not the unpenalized bonus.
  if (c.exhaustion) state.push(`Exhaustion ${c.exhaustion} (−${2 * c.exhaustion} to all d20 rolls)`);
  if (state.length) lines.push(`STATE: ${state.join(' · ')}`);

  // Damage + condition DEFENSES granted by active effects — the "do you take fire damage?" / "are you
  // immune to being Frightened?" facts a ruling turns on. Read exactly as CombatPanel's Defenses card:
  // resistances/vulnerabilities are collect-ops; damage `immunity` and `condition_immunity` share the
  // `immunity` operation, so each is read per-TARGET (never lumped) and de-duplicated by value.
  const dedupValues = (contribs: ReturnType<typeof ledger.explain>): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const cn of contribs) {
      if (cn.suppressed || typeof cn.effect.value !== 'string') continue;
      const k = cn.effect.value.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(cn.effect.value);
    }
    return out;
  };
  const defense: string[] = [];
  const resist = ledger.collected('resistance').map((r) => r.value);
  const vuln = ledger.collected('vulnerability').map((v) => v.value);
  const dmgImm = dedupValues(ledger.explain('immunity'));
  const condImm = dedupValues(ledger.explain('condition_immunity'));
  // Advantage on saves vs a named condition (Dwarven Resilience vs poison, Fey Ancestry vs charm) — the
  // sheet lists these; a ruling on "do you save with advantage vs the poison?" needs them. Not auto-applied
  // (the game asks the player to invoke it), which is exactly why the AI must be told the advantage exists.
  const condAdv = ledger.collected('condition_advantage').map((a) => a.value);
  if (resist.length) defense.push(`Resistant: ${resist.join(', ')}`);
  if (dmgImm.length) defense.push(`Immune: ${dmgImm.join(', ')}`);
  if (vuln.length) defense.push(`Vulnerable: ${vuln.join(', ')}`);
  if (condImm.length) defense.push(`Immune to conditions: ${condImm.join(', ')}`);
  if (condAdv.length) defense.push(`Advantage on saves vs: ${condAdv.join(', ')}`);
  if (defense.length) lines.push(`DEFENSES: ${defense.join(' · ')}`);

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
        // Fold the ledger save-bonus targets so the AI's save number matches the sheet's (which now does).
        const mod = abilityMod(effAbil(k)) + (s.proficient ? pb : 0) + (s.misc ?? 0)
          + ledger.value(`${k}_saves`, 0) + ledger.value('all_saves', 0);
        return `${k.toUpperCase()} ${signed(mod)}${s.proficient ? '*' : ''}`;
      })
      .join(' · ');
    lines.push(`SAVES: ${saveLine}  (* = proficient)`);
  }
  // Proficient/expert skills WITH their total bonus — a skill-check ruling ("do you pick the lock?") needs the
  // NUMBER, not just "you're proficient" (SAVES already show numbers; the IG/PF2 digests show skill totals).
  // Ability mod + proficiency contribution (½/×1/×2 for prof/expertise) + misc, matching the sheet's Skills.
  const skills = Object.entries(char.skills ?? {})
    .filter(([, v]) => v?.prof && v.prof !== 'none')
    .map(([k, v]) => {
      const def = SKILLS.find((s) => s.key === k);
      const ability = def?.ability ?? 'int';
      const total = abilityMod(effAbil(ability)) + profContribution(v.prof, pb) + (v.misc ?? 0);
      return `${def?.label ?? k} ${signed(total)}${v.prof === 'expertise' ? ' (expertise)' : ''}`;
    });
  if (skills.length) lines.push(`SKILLS: ${skills.join(' · ')}`);

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

  // The character's actual SPELLS — a ruling on "can you cast X / what does your <spell> do?" needs the LIST,
  // which the DC/slots above don't give. Name + level + school + a brief of the effect (a homebrew/customized
  // spell's text rides along verbatim); capped like FEATURES so a full caster doesn't blow the prompt budget.
  const spells = char.spells ?? [];
  if (spells.length) {
    const shown = spells.slice(0, maxFeatures);
    lines.push('SPELLS:');
    for (const s of shown) {
      const lvl = s.level === 0 ? 'cantrip' : `L${s.level}`;
      lines.push(`  · ${s.name} (${lvl}${s.school ? `, ${s.school}` : ''}${s.prepared === false ? ', unprepared' : ''}): ${brief(s.description ?? '')}`);
    }
    const hidden = spells.length - shown.length;
    if (hidden > 0) lines.push(`  · (+${hidden} more not listed)`);
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
        : `${signed(abilityMod(effAbil(key)) + (a.proficient ? pb : 0) + (a.bonusToHit ?? 0)
            + ledger.value('attack_roll', 0) + ledger.value('attack_and_damage', 0))} to hit`;
      // Damage die + the ability mod the sheet adds automatically (the `damage` field is the raw die).
      // AOE dice don't add the ability mod, matching the Attacks table.
      const die = a.damageByLevel?.length ? a.damageByLevel.reduce((acc, e) => ((m.level ?? 1) >= e.level ? e.damage : acc), a.damage) : a.damage;
      const dmgMod = a.saveBased ? 0 : abilityMod(effAbil(key)) + (a.bonusDamage ?? 0)
        + ledger.value('damage_roll', 0) + ledger.value('attack_and_damage', 0);
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
    `The numbers on the sheet are ALREADY the current EFFECTIVE values — base plus every active item, spell, form and condition (a "[base N]" note shows the unmodified value, and a listed penalty like "Exhaustion 3 (−6 to all d20 rolls)" is the current effect). Rule on them as given; do NOT re-add a bonus that is plainly already folded in, or re-apply a penalty already reflected.`,
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
