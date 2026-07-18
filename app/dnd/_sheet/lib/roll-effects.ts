// app/dnd/_sheet/lib/roll-effects.ts — "what affected this roll, and how to show it".
//
// A roll's advantage/disadvantage comes from the ledger's roll-flag targets (attack_roll, <ability>_saves,
// all_skills, …). `ledger.rollFlags(target)` gives the booleans; this gives the SOURCE NAMES behind them —
// so the dice tray can show "disadvantage · Poisoned" (in red) instead of a bare "DIS", which is exactly the
// "clearly see what affected the roll and why" the user asked for. Pure over the ledger, unioned across the
// several targets a single roll consults (e.g. a specific save + all_saves).
import type { EffectLedger } from '@/lib/dnd/effects/ledger';

export interface RollEffectSources {
  /** Sources granting advantage on this roll (e.g. "Danger Sense", "Invisible"). */
  advantage: string[];
  /** Sources imposing disadvantage — the PENALTIES shown in red (e.g. "Poisoned", "Frightened", "Restrained"). */
  disadvantage: string[];
}

/** The named sources granting advantage / disadvantage on a roll, unioned across `targets` and de-duped. */
export function rollEffectSources(ledger: EffectLedger, ...targets: string[]): RollEffectSources {
  const adv = new Set<string>();
  const dis = new Set<string>();
  for (const t of targets) {
    for (const c of ledger.explain(t)) {
      if (c.effect.operation === 'advantage') adv.add(c.source);
      else if (c.effect.operation === 'disadvantage') dis.add(c.source);
    }
  }
  return { advantage: [...adv], disadvantage: [...dis] };
}
