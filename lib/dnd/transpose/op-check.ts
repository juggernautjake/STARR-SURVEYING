// lib/dnd/transpose/op-check.ts — a deterministic, pure heuristic that flags a transposed character as
// "clearly overpowered for its level" and, if so, returns a discreet, funny note for the sheet. The transpose
// intentionally preserves an OP source character (the owner asked us NOT to nerf it); this just gently warns
// the player it looks strong, without blocking anything. Deterministic (no Math.random — that's blocked in
// pure contexts and would make this untestable): the note is chosen by a stable hash of the name + level.

export interface OpInputs {
  name: string;
  level: number;
  abilities: Record<string, number>;
  maxHp: number;
  attacksCount: number;
}

const ABIL_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

// The tongue-in-cheek notes, picked deterministically so a given character always gets the same one.
const OP_NOTES = [
  'Numbers this big usually come with their own theme music. 🎺',
  'Your DM just felt a chill and doesn’t know why. 🥶',
  'Balance patch pending. This build did not wait for it. ⚖️',
  'Suspiciously heroic. The math checked twice and left. 📈',
  'This character voids the encounter-building warranty. 🧾',
  'Somewhere, a goblin is updating its will. ✍️',
  'Rolled a little hot on the power budget, didn’t we? 🔥',
];

/** Pick one note deterministically from a stable seed (name length + level). */
function pickNote(name: string, level: number): string {
  let h = level;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return OP_NOTES[h % OP_NOTES.length];
}

/**
 * Score a character against generous, level-scaled thresholds. Returns the OP reasons found. Thresholds are
 * deliberately loose — this fires only for characters that are OBVIOUSLY strong, not merely optimized, so a
 * normal well-built sheet is never flagged.
 */
export function overpoweredReasons({ level, abilities, maxHp, attacksCount }: OpInputs): string[] {
  const lvl = Math.max(1, level || 1);
  const scores = ABIL_KEYS.map((k) => abilities?.[k] ?? 10);
  const abilitySum = scores.reduce((a, b) => a + b, 0);
  const maxAbility = Math.max(...scores);
  const reasons: string[] = [];
  // A normal built character tops out around a 78–90 ability sum; 100+ is well past any legal spread.
  if (abilitySum >= 100) reasons.push(`ability total ${abilitySum}`);
  // 22+ in a single score is beyond the ordinary 20 cap without epic boons.
  if (maxAbility >= 22) reasons.push(`a ${maxAbility} ability score`);
  // HP far above ~level × 20 (a very tanky class is ~level × 12–15).
  if (maxHp > lvl * 20 + 25) reasons.push(`${maxHp} HP at level ${lvl}`);
  // A pile of distinct attack options is another optimization tell.
  if (attacksCount > 6) reasons.push(`${attacksCount} attack options`);
  return reasons;
}

/** The full check: returns a funny note when the character reads as clearly OP, else null. */
export function opNoteFor(inputs: OpInputs): string | null {
  const reasons = overpoweredReasons(inputs);
  // Require either one extreme signal (a 24+ score / absurd HP) or two milder ones, so we only quip when it's
  // genuinely eyebrow-raising.
  const extreme = (inputs.abilities && Math.max(...ABIL_KEYS.map((k) => inputs.abilities?.[k] ?? 10)) >= 24)
    || inputs.maxHp > inputs.level * 30 + 40;
  if (!(extreme || reasons.length >= 2)) return null;
  return `${pickNote(inputs.name, inputs.level)} (Flagged as possibly OP for level ${inputs.level}: ${reasons.join(', ')}.)`;
}
