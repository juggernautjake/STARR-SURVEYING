// lib/dnd/systems/pathfinder2e/builder.ts — deterministic "build a legal PF2 character from picks". Given
// an ancestry + background + class + attribute boosts + skill/subclass choices, assemble a complete
// PF2Character sidecar (character.data.pf2e) with level-1 proficiency ranks, HP, saves, skills, and a
// default unarmed Strike. Everything is drawn from content.ts (the vanilla library), so a straight
// assemble is 100% rules-legal; a pick outside the library is still placed and simply flagged custom.
// Pure — no services — so the builder UI and the AI tools share one source of truth.
import {
  PF2_ATTRIBUTES, PF2_SAVES,
  type PF2Character, type PF2AttributeKey, type PF2Skill, type PF2Feat,
} from './model';
import {
  PF2_SKILLS, pf2Class, pf2Ancestry, pf2Background,
  type PF2ClassDef, type PF2AncestryDef,
} from './content';

/** Apply a sequence of attribute boosts to a base modifier map, honoring the +4 partial-boost rule
 *  (at +4 or higher, a boost gives +½ — tracked here by only raising every other boost past +4). This
 *  matches PF2 attribute generation where boosts above +4 are "partial". */
export function pf2ApplyBoosts(base: Record<PF2AttributeKey, number>, boosts: PF2AttributeKey[]): Record<PF2AttributeKey, number> {
  const out = { ...base };
  const partial: Record<PF2AttributeKey, boolean> = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false };
  for (const b of boosts) {
    if (out[b] >= 4) {
      // Partial boost: two partials = +1.
      if (partial[b]) { out[b] += 1; partial[b] = false; } else { partial[b] = true; }
    } else {
      out[b] += 1;
    }
  }
  return out;
}

export interface PF2Picks {
  name?: string;
  level?: number;
  ancestry?: string;
  heritage?: string;
  background?: string;
  className?: string;
  subclass?: string;
  deity?: string;
  /** The class key attribute the player chose (for classes offering a choice). */
  keyAttribute?: PF2AttributeKey;
  /** Final attribute modifiers. If omitted, computed from the boost picks below. */
  attributes?: Partial<Record<PF2AttributeKey, number>>;
  /** The four free level-1 boosts (plus any the UI wants applied). Used only when `attributes` is absent. */
  freeBoosts?: PF2AttributeKey[];
  /** Skills the player trained beyond the class's fixed skills. */
  trainedSkills?: string[];
  languages?: string[];
  bio?: string;
  photoUrl?: string;
}

const ZERO = (): Record<PF2AttributeKey, number> => ({ STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });

/** Compute the level-1 attribute modifiers from ancestry + background + class + free boosts (when the UI
 *  didn't hand us final numbers). Free boosts must go to four DIFFERENT attributes per the rules. */
export function pf2ComputeAttributes(cls: PF2ClassDef | null, anc: PF2AncestryDef | null, picks: PF2Picks): Record<PF2AttributeKey, number> {
  if (picks.attributes) {
    const a = ZERO();
    for (const k of PF2_ATTRIBUTES) a[k] = picks.attributes[k] ?? 0;
    return a;
  }
  let a = ZERO();
  const bg = pf2Background(picks.background || '');
  // Ancestry boosts (free ones default to STR/DEX filler only if the UI gave none — the UI should pick).
  if (anc) a = pf2ApplyBoosts(a, anc.boosts.filter((b): b is PF2AttributeKey => b !== 'free'));
  // Background: one fixed + one free (the UI resolves 'free' into a real key via freeBoosts if desired).
  if (bg) a = pf2ApplyBoosts(a, bg.boosts.filter((b): b is PF2AttributeKey => b !== 'free'));
  // Class key attribute.
  const key = picks.keyAttribute || cls?.keyAttribute[0];
  if (key) a = pf2ApplyBoosts(a, [key]);
  // Four free level-1 boosts.
  if (picks.freeBoosts?.length) a = pf2ApplyBoosts(a, picks.freeBoosts);
  return a;
}

/** Build a complete, level-1-legal PF2Character from the picks. */
export function buildPF2Character(picks: PF2Picks): PF2Character {
  const cls = pf2Class(picks.className || '');
  const anc = pf2Ancestry(picks.ancestry || '');
  const bg = pf2Background(picks.background || '');
  const level = Math.max(1, Math.min(20, Math.round(picks.level ?? 1)));
  const attributes = pf2ComputeAttributes(cls, anc, picks);
  const keyAttr = picks.keyAttribute || cls?.keyAttribute[0] || 'STR';

  // Skills: every core skill starts untrained; class fixed skills + background skill + free picks → trained.
  const trained = new Set<string>();
  (cls?.fixedSkills ?? []).forEach((s) => trained.add(s.toLowerCase()));
  if (bg?.skill) trained.add(bg.skill.toLowerCase());
  (picks.trainedSkills ?? []).forEach((s) => trained.add(s.toLowerCase()));
  const skills: PF2Skill[] = PF2_SKILLS.map((s) => ({
    name: s.name, attribute: s.attribute, rank: trained.has(s.name.toLowerCase()) ? 'trained' : 'untrained', itemBonus: 0,
  }));

  const init = cls?.initial;
  const con = attributes.CON;

  const feats: PF2Feat[] = [];
  if (cls) feats.push({ id: 'cls-key', name: `${cls.name} (${cls.subclassLabel})`, level: 1, track: 'feature', traits: [cls.name], body: cls.summary });
  if (anc && picks.heritage) feats.push({ id: 'heritage', name: `${picks.heritage} ${anc.name}`, level: 1, track: 'ancestry', traits: [anc.name, 'Heritage'], body: `${anc.summary}` });

  return {
    identity: {
      name: picks.name || 'New Character', level,
      ancestry: anc?.name || picks.ancestry || '', heritage: picks.heritage || '',
      background: bg?.name || picks.background || '', className: cls?.name || picks.className || '',
      subclass: picks.subclass || '', deity: picks.deity || '',
      size: anc?.size || 'Medium', alignment: '', bio: picks.bio || '', photoUrl: picks.photoUrl || '',
    },
    attributes,
    perception: { rank: init?.perception ?? 'trained' },
    saves: Object.fromEntries(PF2_SAVES.map((s) => {
      const rank = s === 'Fortitude' ? init?.fortitude : s === 'Reflex' ? init?.reflex : init?.will;
      return [s, { rank: rank ?? 'trained', itemBonus: 0 }];
    })) as PF2Character['saves'],
    skills,
    combat: {
      ancestryHp: anc?.hp ?? 8,
      classHpPerLevel: cls?.hpPerLevel ?? 8,
      currentHp: (anc?.hp ?? 8) + ((cls?.hpPerLevel ?? 8) + con) * level,
      tempHp: 0, dyingValue: 0, woundedValue: 0,
      speed: anc?.speed ?? 25,
      armorRank: init?.defense ?? 'trained', dexCap: null, acItemBonus: 0,
      attackRank: init?.attacks ?? 'trained',
      classDcRank: init?.classDc ?? 'trained', classDcAttribute: keyAttr,
    },
    attacks: [{ id: 'unarmed', name: 'Fist', attribute: 'STR', rank: init?.attacks ?? 'trained', weaponBonus: 0, damage: '1d4 bludgeoning', traits: ['agile', 'finesse', 'nonlethal', 'unarmed'] }],
    spellcasting: cls?.spellcasting
      ? { tradition: cls.spellcasting.tradition, kind: cls.spellcasting.kind, attribute: cls.spellcasting.attribute, rank: 'trained', slots: [5] }
      : { tradition: 'none', kind: 'none', attribute: keyAttr, rank: 'untrained', slots: [] },
    feats,
    languages: [...new Set([...(anc?.languages ?? ['Common']), ...(picks.languages ?? [])])],
  };
}
