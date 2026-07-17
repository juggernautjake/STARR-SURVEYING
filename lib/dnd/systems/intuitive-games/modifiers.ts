// lib/dnd/systems/intuitive-games/modifiers.ts — the PURE mechanical model of what a character's active
// CONDITIONS actually do to their rolls, drawn only from the Intuitive Games condition rules
// (IG_CONDITIONS / intuitivegames.net). It produces (a) the stacking FLAT d20 penalty a couple of
// conditions impose numerically, and (b) a legible summary of the disadvantage/other effects — so the
// sheet can show "what's being applied right now" and the AI reasons from the same source. Expo/React-free
// and fully testable. It does NOT silently mutate base numbers (single-source stays clean); the sheet
// shows the penalty as a note, the way the platform surfaces exhaustion.

const norm = (s: string) => s.trim().toLowerCase();

/** A condition's machine-readable mechanical effect. Only fields that apply are present. */
export interface IGConditionMechanic {
  name: string;
  /** A flat penalty applied to attack rolls, saving throws, skill checks, and ability checks (stacks). */
  flatD20?: number;
  /** Roll categories the condition imposes DISADVANTAGE on (site wording, summarized). */
  disadvantage?: string;
  /** Any other mechanical effect that isn't a flat number or a simple disadvantage. */
  other?: string;
}

// Curated from the verbatim IG condition text. Absent conditions (e.g. Heatstroke's over-time damage) carry
// no roll modifier here; they still display + tooltip via IG_CONDITIONS.
const MECHANICS: Record<string, Omit<IGConditionMechanic, 'name'>> = {
  shaken: { flatD20: -2 },
  sickened: { flatD20: -2, other: 'A failed Fortitude save while sickened paralyzes you for rounds equal to the amount you failed by.' },
  blind: { disadvantage: 'attack rolls, Reflex saves, and Perception checks', other: 'Automatically fails sight-based Perception checks.' },
  deaf: { disadvantage: 'Reflex saves and Perception checks', other: 'Automatically fails hearing-based Perception checks.' },
  prone: { disadvantage: 'melee attack rolls and Perception checks', other: 'Cannot make ranged attacks.' },
  entangled: { disadvantage: 'Strength- and Dexterity-based checks (except to break free)', other: 'Cannot move from its current location.' },
  fascinated: { disadvantage: 'Perception checks', other: 'Cannot take any actions; ends if threatened or attacked.' },
  'flat-footed': { other: 'No Dexterity modifier to Reflex saves or skill checks, and cannot make reactions.' },
  grappled: { other: 'Flat-footed; cannot move; cannot take actions that require two hands.' },
  pinned: { other: 'Prone plus the usual penalties of being grappled.' },
  paralyzed: { other: 'Cannot act; Reflex saves are treated as a natural 1 (level only). Attacks with advantage against it step up one degree.' },
  asleep: { other: 'Takes no actions and is treated as paralyzed until woken.' },
  confused: { other: 'Attacks wildly; roll each turn to determine friend-or-foe behavior.' },
  incorporeal: { other: 'Immune to physical attacks; passes through solids; considered blind while viewing the spirit world.' },
  invisible: { other: 'Advantage on Stealth; other creatures are flat-footed to its attacks.' },
  broken: { other: '(Item) Weapons attack at disadvantage; armor gives half DR and −2 Reflex; shields give no Reflex bonus.' },
};

/** The mechanical effect of a single condition (null if the name isn't a recognized IG condition). */
export function igConditionMechanic(name: string): IGConditionMechanic | null {
  const m = MECHANICS[norm(name)];
  return m ? { name: name.trim(), ...m } : null;
}

export interface IGConditionSummary {
  /** Net stacking flat penalty to attacks / saves / skill checks / ability checks (≤ 0). */
  flatD20: number;
  /** Which conditions contribute the flat penalty (e.g. ['Shaken', 'Sickened']). */
  flatSources: string[];
  /** Per-condition "Name: imposes disadvantage on X" lines, for legible display. */
  disadvantages: string[];
  /** Per-condition "Name: other effect" lines. */
  other: string[];
}

/** Aggregate every active condition into a legible mechanical summary the sheet + AI read. Unknown/custom
 *  conditions contribute nothing here (they still display via the tooltip model) — nothing is invented. */
export function igConditionSummary(conditions: string[] | null | undefined): IGConditionSummary {
  const out: IGConditionSummary = { flatD20: 0, flatSources: [], disadvantages: [], other: [] };
  for (const c of conditions ?? []) {
    const m = igConditionMechanic(c);
    if (!m) continue;
    if (m.flatD20) { out.flatD20 += m.flatD20; out.flatSources.push(m.name); }
    if (m.disadvantage) out.disadvantages.push(`${m.name}: disadvantage on ${m.disadvantage}`);
    if (m.other) out.other.push(`${m.name}: ${m.other}`);
  }
  return out;
}

/** A one-line legible headline of the flat penalty, e.g. "−4 to attacks, saves & skills (Shaken, Sickened)"
 *  — or null when no condition imposes a flat penalty. */
export function igConditionPenaltyNote(conditions: string[] | null | undefined): string | null {
  const s = igConditionSummary(conditions);
  if (s.flatD20 === 0) return null;
  return `${s.flatD20} to attacks, saves & skill checks (${s.flatSources.join(', ')})`;
}

// ── Stance mechanics ────────────────────────────────────────────────────────────────────────────────
// The machine-readable effect of the ACTIVE stance (Basic below Lv 5, Advanced at Lv 5+ — a single
// benefit), so the sheet can apply/annotate a stance and the AI reasons from structured fields, not prose.
// Faithful to intuitivegames.net/stances.

export interface IGStanceMechanic {
  name: string;
  tier: 'basic' | 'advanced';
  /** Roll categories that gain advantage. */
  advantage?: string;
  /** Roll categories that take disadvantage. */
  disadvantage?: string;
  /** Damage Reduction granted (e.g. "half your level"). */
  damageReduction?: string;
  /** A flat/other bonus the stance grants (e.g. "+half your level to damage rolls"). */
  bonus?: string;
  /** A positional/narrative effect that isn't a simple roll modifier. */
  note?: string;
}

const norm2 = (s: string) => s.trim().toLowerCase().replace(/\s+stance$/, '').replace(/\s+/g, ' ');

type Tiered = { basic: Omit<IGStanceMechanic, 'name' | 'tier'>; advanced: Omit<IGStanceMechanic, 'name' | 'tier'> };
const STANCE_MECHANICS: Record<string, Tiered> = {
  offensive: { basic: { advantage: 'attack rolls', disadvantage: 'Reflex saves' }, advanced: { bonus: '+half your level to damage rolls' } },
  defensive: { basic: { disadvantage: 'attack rolls', advantage: 'Reflex saves' }, advanced: { damageReduction: 'half your level' } },
  neutral: { basic: { note: 'You ignore opponents’ stance bonuses that enhance attack rolls, including flanking.' }, advanced: { note: 'You ignore all of your opponents’ stance bonuses.' } },
  mobile: { basic: { note: 'Moving through a threatened area no longer provokes reactions.' }, advanced: { note: 'You no longer provoke reactions.' } },
  shifting: { basic: { note: 'You can’t be flanked.' }, advanced: { note: 'A missed attack against you provokes a reaction.' } },
  welcoming: { basic: { note: 'An ally can share your square.' }, advanced: { note: 'An ally sharing your square gains +half your level to Reflex saves.' } },
  swarming: { basic: { advantage: 'attack rolls when flanking' }, advanced: { bonus: '+half your level to attack rolls when flanking' } },
  precise: { basic: { bonus: '+1d6 sneak attack vs a flanked or Unconscious/Entangled/Paralyzed/Blinded target' }, advanced: { bonus: 'sneak attack increases to 2d6' } },
  supportive: { basic: { note: 'You count as flanking when you threaten an enemy an ally also threatens.' }, advanced: { note: 'Flanking allies gain +half your level to attack rolls.' } },
  menacing: { basic: { advantage: 'trained combat skills' }, advanced: { advantage: 'all combat skills' } },
};

/** The active stance's mechanical effect at a level (Advanced at 5+), or null if the name isn't an IG
 *  stance. The Advanced tier REPLACES the Basic one (the site's "a single benefit"). */
export function igStanceMechanic(name: string | null | undefined, level: number): IGStanceMechanic | null {
  if (!name) return null;
  const def = STANCE_MECHANICS[norm2(name)];
  if (!def) return null;
  const advanced = level >= 5;
  return { name: name.replace(/\s+stance$/i, '').trim(), tier: advanced ? 'advanced' : 'basic', ...(advanced ? def.advanced : def.basic) };
}

/** A legible one-line summary of the active stance's mechanical effect. */
export function igStanceMechanicNote(name: string | null | undefined, level: number): string | null {
  const m = igStanceMechanic(name, level);
  if (!m) return null;
  const bits = [
    m.advantage && `advantage on ${m.advantage}`,
    m.disadvantage && `disadvantage on ${m.disadvantage}`,
    m.damageReduction && `DR ${m.damageReduction}`,
    m.bonus,
    m.note,
  ].filter(Boolean);
  return bits.length ? `${m.name} Stance (${m.tier}): ${bits.join('; ')}.` : null;
}
