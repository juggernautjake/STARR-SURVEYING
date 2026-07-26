// __tests__/dnd/exception-badge.test.tsx — the badge NAMES what changed (slot plan S8b).
//
// S8a made "altered vanilla" a real state; S6 made picks record WHY they departed from the rules. This is
// the payoff, and it is the owner's requirement verbatim:
//
//   > "We need it to be clear that something is not the usual."
//
// A badge that reports a departure without naming it is the same problem in a nicer font — so what is
// tested here is that every surface showing the kind can also show the reason, and that no surface
// collapses the three kinds back into two.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VariantToggleView } from '@/app/dnd/_sheet/components/VariantToggle';
import { sheetExceptions, sheetExceptionLabels } from '@/lib/dnd/slots/sheet-exceptions';
import { buildVariantCards } from '@/lib/dnd/variant-view';
import type { ActiveSheet } from '@/lib/dnd/system-variants';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const EXC = { name: 'Magic Initiate', reason: 'origin feats come from your background', entitlement: 'dm-granted', level: 4 };

describe('reading a sheet\'s exceptions, whatever system it is', () => {
  it('finds them in each system\'s own ledger', () => {
    expect(sheetExceptions({ build: { choices: [{ level: 4, exception: EXC }] } }, 'dnd5e-2024')).toHaveLength(1);
    expect(sheetExceptions({ pf2Build: { choices: [{ level: 4, exception: EXC }] } }, 'pathfinder2e')).toHaveLength(1);
    expect(sheetExceptions({ igBuild: { choices: [{ level: 4, exception: EXC }] } }, 'intuitive-games')).toHaveLength(1);
  });

  it('does not read another system\'s ledger — a transposed sheet can carry a stale one', () => {
    // A character moved between systems keeps the old block in `data`; reading it would badge the new sheet
    // with exceptions that belong to a build it no longer is.
    expect(sheetExceptions({ pf2Build: { choices: [{ level: 4, exception: EXC }] } }, 'dnd5e-2024')).toEqual([]);
  });

  it('survives every shape persisted jsonb actually takes', () => {
    for (const data of [null, undefined, 'nonsense', {}, { build: null }, { build: {} }, { build: { choices: 'no' } }]) {
      expect(() => sheetExceptions(data, 'dnd5e-2024')).not.toThrow();
      expect(sheetExceptions(data, 'dnd5e-2024')).toEqual([]);
    }
  });

  it('words them for display', () => {
    expect(sheetExceptionLabels({ build: { choices: [{ level: 4, exception: EXC }] } }, 'dnd5e-2024'))
      .toEqual(['Magic Initiate (DM-granted, level 4)']);
  });
});

describe('the sheet\'s build control tells the truth about all three kinds', () => {
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(<VariantToggleView {...props} />);

  it('an ALTERED-VANILLA sheet no longer reads "Vanilla — rules-legal only"', () => {
    // The bug: this control tested `variantKind === 'custom'` and treated everything else as vanilla, so a
    // character deliberately holding picks its class and level do not grant displayed a flat denial of
    // that fact — on the one control whose whole job is to say which build this is.
    const html = render({ variantKind: 'altered-vanilla', canWrite: false, exceptions: ['Magic Initiate (DM-granted, level 4)'] });
    expect(html).not.toContain('Vanilla — rules-legal only');
    expect(html).toContain('Altered vanilla');
  });

  it('and NAMES the exception rather than counting it', () => {
    const html = render({ variantKind: 'altered-vanilla', canWrite: false, exceptions: ['Magic Initiate (DM-granted, level 4)'] });
    expect(html).toContain('Magic Initiate (DM-granted, level 4)');
  });

  it('names them for the writable control too, not just the read-only chip', () => {
    const html = render({ variantKind: 'altered-vanilla', canWrite: true, characterId: 'c1', exceptions: ['Alert (added outside the rules)'] });
    expect(html).toContain('Exceptions:');
    expect(html).toContain('Alert (added outside the rules)');
  });

  it('leaves plain vanilla and custom exactly as they were', () => {
    expect(render({ variantKind: 'vanilla', canWrite: false })).toContain('Vanilla — rules-legal only');
    expect(render({ variantKind: 'custom', canWrite: false })).toContain('Custom — homebrew allowed');
  });

  it('degrades sanely if the kind is altered but the names did not arrive', () => {
    const html = render({ variantKind: 'altered-vanilla', canWrite: false });
    expect(html).toContain('Altered vanilla');
    expect(html).not.toContain('undefined');
  });
});

describe('the VERSIONS card carries them', () => {
  const active: ActiveSheet = {
    system: 'dnd5e-2024', sheet_type: 'default', kind: 'altered-vanilla',
    data: { meta: { name: 'Vex', level: 4 }, build: { choices: [{ level: 4, exception: EXC }] } },
  };

  it('names the exception on the card model', () => {
    const [card] = buildVariantCards(active, {}, { characterName: 'Vex' });
    expect(card.exceptions).toEqual(['Magic Initiate (DM-granted, level 4)']);
    expect(card.tags.some((t) => t.label === 'Altered vanilla')).toBe(true);
  });

  it('reports none for a CUSTOM version — it never claimed to follow the rules', () => {
    const [card] = buildVariantCards({ ...active, kind: 'custom' }, {}, { characterName: 'Vex' });
    expect(card.exceptions).toEqual([]);
  });

  it('reports none for a plain vanilla version', () => {
    const [card] = buildVariantCards(
      { ...active, kind: 'vanilla', data: { meta: { name: 'Vex', level: 4 } } }, {}, { characterName: 'Vex' },
    );
    expect(card.exceptions).toEqual([]);
  });

  it('and the browser actually renders them', () => {
    // The card model carrying a field nothing prints is this repo's most common defect.
    expect(read('app/dnd/_ui/VariantBrowser.tsx')).toContain('c.exceptions.slice(0, 2)');
  });
});

describe('the kind cannot be hand-set into a lie', () => {
  const SRC = read('app/api/dnd/characters/[id]/variant/route.ts');

  it('asking for plain vanilla on a sheet holding exceptions resolves to altered vanilla', () => {
    // The badge is derived from the ledger everywhere else; this endpoint was the one place a human could
    // have stamped "Vanilla" on a character the ledger disproves.
    expect(SRC).toContain("kind === 'vanilla' && exceptions.length ? 'altered-vanilla' : kind");
  });

  it('and says why, rather than silently ignoring the request', () => {
    expect(SRC).toContain('effectiveKind !== kind');
    expect(SRC).toContain('recorded exception');
  });

  it('going CUSTOM is untouched — that is a real choice, not a claim the sheet can disprove', () => {
    expect(SRC).toMatch(/kind === 'vanilla' &&/);
  });
});
