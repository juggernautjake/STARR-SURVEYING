// rollFeedBuild — pure builders that shape a resolved roll into the shared feed's `ActiveRoll` (RO-5).
//
// Every bespoke system (PF2, IG) publishes its rolls into the `RollFeed` the animated stages read. The one
// fiddly part is the BREAKDOWN STRING format the stages parse — `d20[7,18]→18 + 3` for an advantage roll,
// `d20[13] + 3` for a straight one, the dice-expr breakdown for damage. Getting that shape wrong makes the
// die/adv-pair render blank. These pure builders produce it in ONE place so PF2 and IG can't drift, and so
// the shape is unit-testable WITHOUT a browser (the animation itself is browser-verified separately).
import type { ActiveRoll, RollEntry } from '../../state/store';

const signStr = (n: number) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);

/** A resolved d20 check/save/attack → an `ActiveRoll`. `faces` (both kept + discarded d20 for adv/dis) is
 *  emitted as `d20[a,b]→kept`; omit it for a straight roll. `mode` names adv/dis for the stage's label. */
export function buildD20ActiveRoll(o: {
  token: number;
  label: string;
  natural: number;
  total: number;
  modifier: number;
  faces?: readonly [number, number] | null;
  mode?: RollEntry['mode'];
  crit: boolean;
  fumble: boolean;
  tag?: string;
  boosts?: string[];
  penalties?: string[];
}): ActiveRoll {
  const breakdown = o.faces
    ? `d20[${o.faces[0]},${o.faces[1]}]→${o.natural} ${signStr(o.modifier)}`
    : `d20[${o.natural}] ${signStr(o.modifier)}`;
  return {
    token: o.token,
    landing: o.natural,
    min: 1,
    max: 20,
    isD20: true,
    crit: o.crit,
    fumble: o.fumble,
    entry: { label: o.label, kind: 'check', total: o.total, breakdown, mode: o.mode, tag: o.tag, boosts: o.boosts, penalties: o.penalties },
  };
}

/** A resolved damage/dice-expression roll → an `ActiveRoll`. The stages parse `entry.breakdown` for the
 *  per-die cards/rows, so pass the engine's breakdown verbatim; the headline total stays authoritative. */
export function buildDamageActiveRoll(o: { token: number; label: string; total: number; breakdown: string }): ActiveRoll {
  return {
    token: o.token,
    landing: o.total,
    min: 0,
    max: o.total,
    isD20: false,
    crit: false,
    fumble: false,
    entry: { label: o.label, kind: 'damage', total: o.total, breakdown: o.breakdown },
  };
}
