// lib/dnd/effects/consume.ts — the PURE consumption plan for a consumable item (Slice 12).
//
// "Use" on a consumable used to live entirely inside the Inventory component's `consume()` handler,
// mixing the decision (what does this potion DO — heal now? snapshot a lasting buff? note-only?)
// with the I/O (roll the dice, adjust HP, push an ActiveEffect, decrement qty). That decision is the
// part Slice 12's acceptance tests are about — "a pure-heal potion leaves NO panel entry; a buff
// potion's effect still shows with its label and duration" — so it belongs in a pure, unit-testable
// function, like every other decision-vs-I/O split in this codebase (cf. the mobile drain brains).
//
// planConsume(item) returns WHAT should happen; the component still does the rolling/HP/qty writes.
// The one architectural rule of Part II holds here: a lasting effect is SNAPSHOTTED into an
// ActiveEffect that outlives the item (the potion is gone from inventory, the buff keeps showing),
// so editing the item later never mutates a buff already running.
import type { InvItem } from '@/app/dnd/_sheet/types';
import type { Effect } from '@/app/dnd/_sheet/engine/effects';

/** An instant that resolves once, now (roll the dice, apply, leave nothing behind). */
export interface ConsumeInstant {
  kind: 'heal' | 'temp';
  /** Dice expression to roll, e.g. '2d4+2'. */
  dice: string;
}

/** A lasting effect to snapshot into an ActiveEffect (survives the consumed item). */
export interface ConsumeActiveEffectSeed {
  label: string;
  effects: Effect[];
  duration?: string;
  source: string;
}

export interface ConsumePlan {
  /** Resolve-now instant, or null when the consumable is lasting / note-only / has no dice. */
  instant: ConsumeInstant | null;
  /** Lasting effect to record in Active Effects, or null for a pure instant / note-only. */
  activeEffect: ConsumeActiveEffectSeed | null;
  /** Whether to decrement qty (you drank it, it's gone). False only when there's nothing to consume. */
  consumes: boolean;
}

const NOOP: ConsumePlan = { instant: null, activeEffect: null, consumes: false };

/**
 * Decide what using a consumable does, without doing any of it. The instant and the lasting effect are
 * decided INDEPENDENTLY (not one-or-the-other by `kind`), so a potion carrying BOTH an instant and a buff
 * does both — the case the data model must get right (Slice 12 / DND_RULES 1405):
 *  - heal / temp with dice → an instant to roll now.
 *  - status with a named condition → an ActiveEffect (label = the condition, no stat effects).
 *  - buff → an ActiveEffect snapshotting its temporary `effects` (empty array if none) + duration.
 *  - a heal / temp that ALSO carries `effects` → BOTH: the instant heals now AND the lasting buff survives
 *    the item (e.g. Potion of Storm Giant Strength that also heals 2d4+2).
 *  - custom → note-only: nothing resolves, but the item is still consumed.
 *  - every real consumable decrements qty; an item with no consumable data is a no-op (no decrement).
 * A heal/temp with no dice still consumes (you used it) but rolls nothing.
 */
export function planConsume(item: Pick<InvItem, 'name' | 'qty' | 'consumable'>): ConsumePlan {
  const eff = item.consumable?.effect;
  if (!eff) return NOOP;
  const consumes = (item.qty ?? 0) > 0;

  // An instant fires for a heal/temp that carries dice — resolve once, now, leave nothing behind. (Dice on
  // a buff/status/custom are not an instant heal — the instant kind IS the consumable's heal/temp kind.)
  const instant: ConsumeInstant | null =
    (eff.kind === 'heal' || eff.kind === 'temp') && eff.dice ? { kind: eff.kind, dice: eff.dice } : null;

  // A lasting ActiveEffect fires for: a named status condition; a `buff` (always, even with no mechanical
  // effects — a timed label that shows in the panel); or a heal/temp that ALSO carries `effects` (the
  // "both" case). SNAPSHOT, not a reference: copy each effect into a fresh object + array so the running
  // ActiveEffect is independent of the item it came from — a later edit to the item (or drinking one of a
  // stack of 2) can never retroactively rewrite a buff already running (Slice 12's core invariant).
  let activeEffect: ConsumeActiveEffectSeed | null = null;
  if (eff.kind === 'status') {
    activeEffect = eff.status ? { label: eff.status, effects: [], duration: eff.duration, source: item.name } : null;
  } else if (eff.kind === 'buff' || ((eff.kind === 'heal' || eff.kind === 'temp') && (eff.effects ?? []).length > 0)) {
    activeEffect = { label: item.name, effects: (eff.effects ?? []).map((e) => ({ ...e })), duration: eff.duration, source: item.name };
  }

  return { instant, activeEffect, consumes };
}
