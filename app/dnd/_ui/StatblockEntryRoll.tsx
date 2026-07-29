'use client';
// StatblockEntryRoll — roll a creature's attack and damage from its stat block (P13-8).
//
// The owner: *"the dice roller needs to work with creatures and stuff too"*. A creature's actions are what
// a DM rolls most at the table, and a stat block was previously numbers you read off and typed into a
// roller by hand.
//
// SELF-CONTAINED, and that is a deliberate limit. The animated roller stages read `useRollFeed()`, which
// only exists inside a sheet's `RollFeedProvider` — the content page is a server page with no sheet store,
// so wiring the full dock here would mean standing up a feed for a page that has no character. This rolls
// and shows its own result instead: honest, immediate, and no pretence of being the animated roller. When
// a creature is opened AS a sheet (P13-8's playable stat block), that surface can provide a real feed and
// these same helpers feed it.
import { useState } from 'react';
import { parseDice, parseModifier, rollAttack, rollDice, formatSpec, explainRoll, type RollResult } from '@/lib/dnd/bestiary/rolls';

const btn: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, lineHeight: 1, padding: '3px 8px', cursor: 'pointer',
  background: 'none', border: '1px solid var(--hx-teal-1)', color: 'var(--hx-teal-1)', borderRadius: 6,
};

export default function StatblockEntryRoll({ toHit, damage }: { toHit?: string; damage?: string }) {
  const [last, setLast] = useState<{ label: string; result: RollResult } | null>(null);
  const mod = parseModifier(toHit);
  const dmg = parseDice(damage);

  // Nothing parseable — render nothing rather than a button that would roll a lie. A stat block line like
  // "half the target's current hit points" has no dice in it, and inventing some would be worse than
  // leaving the DM to read the sentence.
  if (mod === null && !dmg) return null;

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginLeft: 6 }}>
      {mod !== null && (
        <button type="button" style={btn} title={`Roll d20 ${mod < 0 ? '−' : '+'} ${Math.abs(mod)} to hit`}
          onClick={() => setLast({ label: 'Attack', result: rollAttack(mod) })}>
          ⚄ {mod < 0 ? '−' : '+'}{Math.abs(mod)}
        </button>
      )}
      {dmg && (
        <button type="button" style={btn} title={`Roll ${formatSpec(dmg)} damage`}
          onClick={() => setLast({ label: 'Damage', result: rollDice(dmg) })}>
          ⚔ {formatSpec(dmg)}
        </button>
      )}
      {last && (
        // The parts, not just the total: a number nobody can check is a number nobody trusts at a table.
        <span aria-live="polite" style={{ fontSize: 12, color: 'var(--hx-gold-2)' }}>
          {last.label} {explainRoll(last.result)}
        </span>
      )}
    </span>
  );
}
