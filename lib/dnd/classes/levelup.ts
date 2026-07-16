// lib/dnd/classes/levelup.ts — you cannot level past a choice you haven't made.
//
// A level-up is not "level += 1". Levels unlock CHOICES (subclass, ASI-or-feat, fighting style,
// expertise, cantrips, epic boon), and later levels depend on earlier ones — a Battle Master's
// level-7 manoeuvres are meaningless until the level-3 subclass is picked. So the rule enforced
// here is: to reach level N, every choice at levels 1..N must be recorded.
//
// The UI walks the returned `outstanding` list in order (see LevelUpWizard); this module is the
// pure decision layer, so it is fully testable without a browser.
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';
import type { ClassDefinition, SubclassDefinition, ClassFeature } from './types';
import { clampLevel, snapshotAtLevel } from './engine';

export type ChoiceKind = NonNullable<ClassFeature['choice']>;

/** A choice the player has already made and that is stored on the character. */
export interface RecordedChoice {
  level: number;
  kind: ChoiceKind;
  /** subclass → subclass key · fighting-style/epic-boon → its key · cantrip → spell name */
  value?: string;
  /** asi → the abilities raised, e.g. ['str','str'] for +2 STR, or ['str','con'] for +1/+1. */
  abilities?: AbilityKey[];
  /** asi → a feat key taken INSTEAD of the ability bumps. */
  featKey?: string;
  /** expertise → the skills chosen. */
  skills?: string[];
  /** Set when this level's pick was HOMEBREWED with the AI rather than taken from the book.
   *  Recorded so it shows as custom content in the DM's review (seed 443). */
  homebrew?: { name: string; body: string };
}

/** A choice still owed at a level, with everything the UI needs to prompt for it. */
export interface OutstandingChoice {
  level: number;
  kind: ChoiceKind;
  label: string;
  /** Why it matters — shown under the prompt. */
  detail: string;
  /** For subclass choices: the legal options. */
  options?: { key: string; name: string; description: string }[];
  /** For expertise: how many skills to pick, and which are legal (already-proficient, not already expert). */
  pick?: number;
  from?: string[];
}

export interface LevelUpPlan {
  from: number;
  to: number;
  /** Every choice owed at levels 1..to. Empty ⇒ the level-up can proceed immediately. */
  outstanding: OutstandingChoice[];
  /** Features gained across the levels being taken, for the "what's new" summary. */
  gained: ClassFeature[];
  /** True when nothing is owed. */
  ready: boolean;
}

const LABEL: Record<ChoiceKind, string> = {
  asi: 'Ability Score Improvement or feat',
  subclass: 'Subclass',
  'fighting-style': 'Fighting Style',
  expertise: 'Expertise',
  cantrip: 'Cantrip',
  'epic-boon': 'Epic Boon',
  other: 'Choice',
};

const DETAIL: Record<ChoiceKind, string> = {
  asi: 'Raise one ability by 2, or two abilities by 1 each (max 20) — or take a feat instead.',
  subclass: 'This decides the features you gain now and at several later levels. It cannot be changed casually.',
  'fighting-style': 'A combat specialisation you keep for the rest of the character’s life.',
  expertise: 'Double your proficiency bonus for the chosen skills.',
  cantrip: 'A spell you can cast at will, for free.',
  'epic-boon': 'A capstone feat. Epic Boons can raise an ability score above 20, up to 30.',
  other: 'A choice this level unlocks.',
};

const sameChoice = (a: RecordedChoice, level: number, kind: ChoiceKind) => a.level === level && a.kind === kind;

/** Has this choice been recorded AND actually filled in? A blank record doesn't count. */
function isSatisfied(rec: RecordedChoice | undefined): boolean {
  if (!rec) return false;
  switch (rec.kind) {
    case 'asi':
      // Either a feat, or exactly two points of ability increase (+2 to one, or +1/+1).
      return !!rec.featKey || (rec.abilities?.length === 2);
    case 'expertise':
      return !!rec.skills?.length;
    default:
      return !!rec.value;
  }
}

/**
 * What is owed to reach `to`.
 *
 * `subclasses` are the legal options for this class — passed in rather than looked up so a
 * HOMEBREW subclass is offered exactly like an official one.
 */
export function planLevelUp(
  def: ClassDefinition,
  opts: {
    from: number;
    to: number;
    recorded: RecordedChoice[];
    subclasses?: SubclassDefinition[];
    /** Skills the character is proficient in — the legal pool for Expertise. */
    proficientSkills?: string[];
    /** The chosen subclass, so its own later choices are included. */
    subclass?: SubclassDefinition | null;
  },
): LevelUpPlan {
  const from = clampLevel(opts.from);
  const to = clampLevel(opts.to);
  const recorded = opts.recorded ?? [];

  // Every choice point at or below the TARGET level — not just the new level. A character that
  // skipped its level-4 ASI must resolve it before reaching 5; otherwise the sheet quietly
  // carries a hole that later levels build on.
  const snap = snapshotAtLevel(def, to, opts.subclass);
  const outstanding: OutstandingChoice[] = [];

  for (const pc of snap.pendingChoices) {
    const rec = recorded.find((r) => sameChoice(r, pc.level, pc.kind));
    if (isSatisfied(rec)) continue;

    const choice: OutstandingChoice = {
      level: pc.level,
      kind: pc.kind,
      label: `${LABEL[pc.kind]} — level ${pc.level}`,
      detail: DETAIL[pc.kind],
    };

    if (pc.kind === 'subclass') {
      choice.options = (opts.subclasses ?? []).map((s) => ({ key: s.key, name: s.name, description: s.description }));
    }

    if (pc.kind === 'expertise') {
      const alreadyExpert = new Set(
        recorded.filter((r) => r.kind === 'expertise' && r.level < pc.level).flatMap((r) => r.skills ?? []),
      );
      // Expertise builds on itself: you can only pick skills you're proficient in, and never the
      // same skill twice.
      choice.pick = 2;
      choice.from = (opts.proficientSkills ?? []).filter((s) => !alreadyExpert.has(s));
    }

    outstanding.push(choice);
  }

  outstanding.sort((a, b) => a.level - b.level);

  const gained = [...def.features, ...(opts.subclass?.features ?? [])]
    .filter((f) => f.level > from && f.level <= to)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return { from, to, outstanding, gained, ready: outstanding.length === 0 };
}

/** The next single choice to prompt for, or null when the character is fully built to `to`. */
export function nextChoice(plan: LevelUpPlan): OutstandingChoice | null {
  return plan.outstanding[0] ?? null;
}

/**
 * Can the character legally BE this level yet? Used to gate the sheet's level control: if this
 * returns a blocked result, the UI routes into the editor's level-up wizard instead of bumping
 * the number.
 */
export function canLevelTo(
  def: ClassDefinition,
  opts: Parameters<typeof planLevelUp>[1],
): { allowed: boolean; blockedBy: OutstandingChoice | null; plan: LevelUpPlan } {
  const plan = planLevelUp(def, opts);
  return { allowed: plan.ready, blockedBy: nextChoice(plan), plan };
}

/** Record a choice, replacing any existing one at the same level+kind. */
export function recordChoice(recorded: RecordedChoice[], choice: RecordedChoice): RecordedChoice[] {
  const rest = (recorded ?? []).filter((r) => !sameChoice(r, choice.level, choice.kind));
  return [...rest, choice].sort((a, b) => a.level - b.level);
}

/**
 * Total ability increases from every recorded ASI, capped at 20 per ability.
 * `base` is the character's scores before ASIs — the increases stack across levels, which is why
 * they have to be replayed from the record rather than baked into the sheet.
 */
export function applyAbilityChoices(
  base: Record<AbilityKey, number>,
  recorded: RecordedChoice[],
  cap = 20,
): Record<AbilityKey, number> {
  const out = { ...base };
  for (const r of recorded) {
    if (r.kind !== 'asi' || r.featKey) continue;
    for (const a of r.abilities ?? []) {
      if (out[a] == null) continue;
      out[a] = Math.min(cap, out[a] + 1);
    }
  }
  return out;
}

/** Every skill the character has Expertise in, from the record. */
export function expertiseSkills(recorded: RecordedChoice[]): string[] {
  return [...new Set(recorded.filter((r) => r.kind === 'expertise').flatMap((r) => r.skills ?? []))];
}

/** The subclass key the character chose, if any. */
export function chosenSubclassKey(recorded: RecordedChoice[]): string | null {
  return recorded.find((r) => r.kind === 'subclass')?.value ?? null;
}

export interface ChoiceValidation {
  ok: boolean;
  error?: string;
}

/** Validate a choice before recording it — the same rules the UI shows as hints. */
export function validateChoice(
  choice: RecordedChoice,
  ctx: { abilities?: Record<AbilityKey, number>; cap?: number; legalSkills?: string[]; legalOptions?: string[] } = {},
): ChoiceValidation {
  const cap = ctx.cap ?? 20;
  switch (choice.kind) {
    case 'asi': {
      if (choice.featKey) return { ok: true };
      const abilities = choice.abilities ?? [];
      if (abilities.length !== 2) return { ok: false, error: 'Choose +2 to one ability, or +1 to two abilities.' };
      if (ctx.abilities) {
        // Replay the increase to make sure it doesn't push past the cap.
        const next = { ...ctx.abilities };
        for (const a of abilities) {
          if (next[a] == null) return { ok: false, error: `${a.toUpperCase()} is not an ability on this sheet.` };
          next[a] += 1;
          if (next[a] > cap) return { ok: false, error: `${a.toUpperCase()} would exceed the maximum of ${cap}.` };
        }
      }
      return { ok: true };
    }
    case 'expertise': {
      const skills = choice.skills ?? [];
      if (!skills.length) return { ok: false, error: 'Choose at least one skill.' };
      if (new Set(skills).size !== skills.length) return { ok: false, error: 'You cannot take Expertise in the same skill twice.' };
      if (ctx.legalSkills) {
        const bad = skills.find((s) => !ctx.legalSkills!.includes(s));
        if (bad) return { ok: false, error: `You must be proficient in ${bad} to take Expertise in it.` };
      }
      return { ok: true };
    }
    default: {
      if (!choice.value) return { ok: false, error: 'Make a selection.' };
      if (ctx.legalOptions && !ctx.legalOptions.includes(choice.value)) {
        return { ok: false, error: 'That is not one of the available options.' };
      }
      return { ok: true };
    }
  }
}
