// __tests__/dnd/slot-escape-hatch.test.ts — the escape hatch (slot plan S6).
//
// Slices S1–S5 bounded every builder to the picks its class and level grant. This is the other half of the
// owner's directive — "we will have buttons that the user can click to add other feats" — and the risk it
// carries is obvious: a hatch that simply turns the gate off would undo S1–S5 and hand back the "ten feats
// at level 2" build the whole plan exists to prevent. So what is tested here is mostly what the hatch
// REFUSES to do, and what it records when it lets something through.
import { describe, it, expect } from 'vitest';
import {
  unlockOffer, splitAcknowledged, exceptionsIn, variantKindWithExceptions,
  describeException, summarizeExceptions, type SlotException,
} from '@/lib/dnd/slots/entitlement';
import { builderChoicesFor, mergeBuilderChoices, type BuilderChoice } from '@/lib/dnd/statgen/builder-choices';

const REFUSED = [
  { name: 'Magic Initiate', reason: 'origin feats come from your background' },
  { name: 'Epic Boon of Fate', reason: 'requires level 19' },
];

describe('what the hatch offers, and to whom', () => {
  it('offers nothing on a CUSTOM character — the rules never bound, so there is no exception to record', () => {
    // Badging a departure on a sheet that never claimed to be legal would be noise, not clarity.
    expect(unlockOffer({ kind: 'custom' }).offered).toBe(false);
    expect(unlockOffer({ kind: 'custom', isDM: true }).offered).toBe(false);
  });

  it('offers on vanilla AND on altered-vanilla — one exception does not exhaust the mechanism', () => {
    expect(unlockOffer({ kind: 'vanilla' }).offered).toBe(true);
    expect(unlockOffer({ kind: 'altered-vanilla' }).offered).toBe(true);
  });

  it('stamps a DM\'s pick as dm-granted and a player\'s as expanded', () => {
    expect(unlockOffer({ kind: 'vanilla', isDM: true }).stamps).toBe('dm-granted');
    expect(unlockOffer({ kind: 'vanilla', isDM: false }).stamps).toBe('expanded');
  });

  it('says what accepting COSTS, not just that it is possible', () => {
    expect(unlockOffer({ kind: 'vanilla' }).blurb).toMatch(/Altered vanilla/);
  });
});

describe('acknowledgement is intent only — the server owns the reason', () => {
  it('lets through exactly what was named, and still refuses the rest', () => {
    const { accepted, stillRefused } = splitAcknowledged(REFUSED, ['Magic Initiate'], 'expanded', 4);
    expect(accepted.map((a) => a.name)).toEqual(['Magic Initiate']);
    expect(stillRefused.map((r) => r.name)).toEqual(['Epic Boon of Fate']);
  });

  it('records the GATE\'s reason, never one the caller could author', () => {
    // The client sends names. If it could send reasons, a crafted POST would record "the DM approved this"
    // against a refusal that happened for an entirely different cause — and the badge meant to make the
    // departure legible would launder it instead.
    const [a] = splitAcknowledged(REFUSED, ['Magic Initiate'], 'expanded', 4).accepted;
    expect(a.reason).toBe('origin feats come from your background');
    expect(a.entitlement).toBe('expanded');
    expect(a.level).toBe(4);
  });

  it('acknowledging something that was never refused adds nothing', () => {
    const { accepted } = splitAcknowledged(REFUSED, ['Alert', 'Tough'], 'expanded');
    expect(accepted).toEqual([]);
  });

  it('an empty or missing acknowledgement list refuses everything, as before', () => {
    for (const ack of [[], undefined, null]) {
      expect(splitAcknowledged(REFUSED, ack, 'expanded').stillRefused).toHaveLength(2);
    }
  });

  it('matches names the way the pickers do — case and spacing insensitive', () => {
    const { accepted } = splitAcknowledged(REFUSED, ['  magic   initiate '], 'expanded');
    expect(accepted.map((a) => a.name)).toEqual(['Magic Initiate']);
  });
});

describe('the badge follows the exceptions, and is derived rather than stored', () => {
  const e = (name: string): SlotException => ({ name, reason: 'r', entitlement: 'expanded' });

  it('vanilla + one exception reads "altered vanilla"', () => {
    expect(variantKindWithExceptions('vanilla', [e('Magic Initiate')])).toBe('altered-vanilla');
  });

  it('removing the last exception goes back to plain vanilla, leaving no scar', () => {
    expect(variantKindWithExceptions('altered-vanilla', [])).toBe('vanilla');
  });

  it('CUSTOM is absorbing — an off-rules character is not promoted for holding no exceptions', () => {
    expect(variantKindWithExceptions('custom', [])).toBe('custom');
    expect(variantKindWithExceptions('custom', [e('Magic Initiate')])).toBe('custom');
  });
});

describe('the badge NAMES what changed', () => {
  it('reads like the owner asked: the thing, and why it is unusual', () => {
    expect(describeException({ name: 'Magic Initiate', reason: 'r', entitlement: 'dm-granted', level: 4 }))
      .toBe('Magic Initiate (DM-granted, level 4)');
    expect(describeException({ name: 'Alert', reason: 'r', entitlement: 'expanded' }))
      .toBe('Alert (added outside the rules)');
  });

  it('summarizes without hiding the count', () => {
    const many = ['A', 'B', 'C', 'D'].map((n): SlotException => ({ name: n, reason: '', entitlement: 'expanded' }));
    expect(summarizeExceptions([])).toBe('');
    expect(summarizeExceptions(many)).toMatch(/and 2 more$/);
  });
});

describe('reading the ledger', () => {
  it('survives the shapes persisted JSON actually takes', () => {
    // These rows are hand-editable and predate the field, so a bad one must not throw.
    expect(exceptionsIn(undefined)).toEqual([]);
    expect(exceptionsIn(null)).toEqual([]);
    expect(exceptionsIn([{ level: 4 }, { level: 4, exception: null }, { level: 4, exception: 'x' } as never])).toEqual([]);
    expect(exceptionsIn([{ level: 4, exception: { name: '   ' } }])).toEqual([]);
  });

  it('falls back to the CHOICE\'s level when the exception carries none', () => {
    const [x] = exceptionsIn([{ level: 8, exception: { name: 'Alert', reason: 'r' } }]);
    expect(x.level).toBe(8);
    expect(x.entitlement).toBe('expanded'); // anything not 'dm-granted' is the player's own
  });
});

describe('a hatch pick reaches the ledger', () => {
  const exception: SlotException = { name: 'Magic Initiate', reason: 'origin feats come from your background', entitlement: 'expanded', level: 4 };

  it('stamps the slot the feat occupies', () => {
    const out = builderChoicesFor({
      system: 'dnd5e-2024', className: 'fighter', level: 8,
      feats: ['Magic Initiate'], exceptions: [exception],
    });
    const asi = out.filter((c) => c.kind === 'asi');
    expect(asi[0].featKey).toBe('Magic Initiate');
    expect(asi[0].exception?.entitlement).toBe('expanded');
  });

  it('records an exception on a feat BEYOND the ladder, which owns no slot', () => {
    // Those extra feats are deliberately left as plain features (they don't spend an ASI). Dropping the
    // exception with them would let a character take an off-rules feat and still read "Vanilla" — the one
    // outcome this slice exists to prevent.
    const out = builderChoicesFor({
      system: 'dnd5e-2024', className: 'wizard', level: 1,
      feats: [], exceptions: [exception],
    });
    expect(exceptionsIn(out)).toHaveLength(1);
    expect(out.find((c) => c.exception)?.kind).toBe('other');
  });

  it('the badge derived from that ledger is altered-vanilla, end to end', () => {
    const out = builderChoicesFor({ system: 'dnd5e-2024', className: 'fighter', level: 8, feats: ['Magic Initiate'], exceptions: [exception] });
    expect(variantKindWithExceptions('vanilla', exceptionsIn(out))).toBe('altered-vanilla');
  });

  it('no exceptions changes nothing about the ledger it used to produce', () => {
    const withArg = builderChoicesFor({ system: 'dnd5e-2024', className: 'fighter', level: 8, feats: ['Alert'], exceptions: [] });
    const without = builderChoicesFor({ system: 'dnd5e-2024', className: 'fighter', level: 8, feats: ['Alert'] });
    expect(withArg).toEqual(without);
    expect(withArg.every((c) => !c.exception)).toBe(true);
  });
});

describe('rebuilding does not corrupt the record', () => {
  const exceptional: BuilderChoice = { level: 3, kind: 'other', value: 'Magic Initiate', exception: { name: 'Magic Initiate', reason: 'r', entitlement: 'expanded' } };

  it('a rebuild replaces its own exceptions rather than stacking a duplicate each time', () => {
    const once = mergeBuilderChoices([exceptional], [exceptional], 8);
    expect(exceptionsIn(once)).toHaveLength(1);
  });

  it('but leaves an unrelated `other` choice alone', () => {
    // `other` is excluded from the owned-kind set precisely so a rebuild cannot delete a walker's record.
    const walker: BuilderChoice = { level: 2, kind: 'other', value: 'A thing the walker recorded' };
    const merged = mergeBuilderChoices([walker], [exceptional], 8);
    expect(merged).toContainEqual(walker);
  });

  it('dropping the feat drops the exception, so the badge can fall back to vanilla', () => {
    const merged = mergeBuilderChoices([exceptional], [{ level: 4, kind: 'asi', featKey: 'Alert' }], 8);
    expect(exceptionsIn(merged)).toEqual([]);
    expect(variantKindWithExceptions('altered-vanilla', exceptionsIn(merged))).toBe('vanilla');
  });
});
