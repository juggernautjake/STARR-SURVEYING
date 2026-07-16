// lib/dnd/effects/triggers.ts — event-triggered reactions (Slice 15), beside the effect ledger.
//
// Why separate from Effect: an Effect is a CONTINUOUS overlay the ledger resolves into a number.
// A Trigger is an EVENT-driven action — it fires when something happens, rolls dice, and targets
// someone who isn't you (retaliation). Folding it into Effect would wreck what makes the ledger
// tractable (pure, order-independent, always re-derivable). So triggers live here, collected from
// the same sources but resolved on demand.
//
// Triggers are PROMPTS, not automation (the doc's rule): the sheet surfaces "Spiked Barbs: 1d6
// piercing to the attacker — roll?" and the player/DM resolves it. Nothing here applies damage to a
// creature the app doesn't model.
import type { Character, Trigger, TriggerEvent } from '@/app/dnd/_sheet/types';

const isEquipped = (i: { equipped?: boolean; tags?: string[] }) => i.equipped === true || i.tags?.includes('equipped') === true;
const isItemActive = (i: { equipped?: boolean; attuned?: boolean; tags?: string[] }) =>
  i.attuned ? isEquipped(i) && i.attuned === true : isEquipped(i);

/** A trigger plus where it came from — what a surfacing UI shows. */
export interface ActiveTrigger extends Trigger {
  source: string;
  sourceKind: 'item' | 'feature';
}

/** Human labels for each event, for the reactions list + prompts. */
export const TRIGGER_EVENT_LABEL: Record<TriggerEvent, string> = {
  hit_by_melee: 'When hit by a melee attack',
  hit_by_ranged: 'When hit by a ranged attack',
  hit_by_spell: 'When hit by a spell',
  you_hit: 'When you hit',
  you_crit: 'When you crit',
  you_are_crit: 'When you are crit',
  save_failed: 'When you fail a save',
  turn_start: 'At the start of your turn',
  turn_end: 'At the end of your turn',
  damaged: 'When you take damage',
  reduced_to_zero: 'When you drop to 0 HP',
};

/**
 * Every trigger currently ACTIVE on the character: from equipped/attuned items and level-unlocked
 * features, minus any whose `condition` isn't currently true. Same active-rule the effect ledger
 * uses, so a trigger and an effect on the same item agree about when they apply.
 */
export function collectTriggers(char: Character, activeConditions: string[] = []): ActiveTrigger[] {
  const active = new Set([...activeConditions, ...((char.combat?.conditions ?? []) as string[])]);
  const level = char.meta?.level ?? 1;
  const out: ActiveTrigger[] = [];

  const gated = (t: Trigger) => !t.condition || active.has(t.condition);

  for (const item of char.inventory ?? []) {
    if (!item?.triggers?.length || !isItemActive(item)) continue;
    for (const t of item.triggers) if (gated(t)) out.push({ ...t, source: item.name, sourceKind: 'item' });
  }
  for (const f of char.features ?? []) {
    if (!f?.triggers?.length) continue;
    if ((f.unlockLevel ?? 1) > level) continue;
    for (const t of f.triggers) if (gated(t)) out.push({ ...t, source: f.name, sourceKind: 'feature' });
  }
  return out;
}

/** The active triggers that fire on a given event — what the sheet surfaces when that event happens. */
export function triggersForEvent(char: Character, event: TriggerEvent, activeConditions: string[] = []): ActiveTrigger[] {
  return collectTriggers(char, activeConditions).filter((t) => t.on === event);
}

/** A plain-English line for a trigger's action — the same string the reactions list and a prompt use. */
export function describeTrigger(t: Trigger): string {
  const a = t.action;
  const limit = t.limit ? ` (${t.limit.max}/${t.limit.per})` : '';
  switch (a.kind) {
    case 'damage': return `${a.dice ?? ''} ${a.damageType ?? ''} damage${a.attack ? ' (attack roll)' : ''}${limit}`.trim();
    case 'heal': return `heal ${a.dice ?? ''}${limit}`.trim();
    case 'temp_hp': return `${a.dice ?? ''} temp HP${limit}`.trim();
    case 'condition': return `apply ${a.condition ?? 'a condition'}${limit}`.trim();
    case 'effect': return `grant an effect${limit}`.trim();
    case 'resource': return `spend/restore a resource${limit}`.trim();
    default: return `${a.note ?? 'DM adjudicates'}${limit}`.trim();
  }
}
