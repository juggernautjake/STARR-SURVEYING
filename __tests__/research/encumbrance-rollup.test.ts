// What encumbers this property (research plan R34).
//
// An easement is usually recorded against ONE of the two tracts it crosses. A utility easement
// granted by the neighbour to the north, running along the common line, sits in the neighbour's deed
// and appears nowhere in this property's chain — and it still matters. A rollup built only from the
// subject's own documents is therefore systematically incomplete, and incomplete precisely at the
// boundary, which is the part a retracement is about.
//
// What this must NOT do is decide whether a neighbour's easement burdens this tract. That depends on
// the grant's wording and on where the line really falls — a legal question. It gets the same
// treatment R20 gives a conflict: surfaced, attributed, and left open.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  kindOf,
  purposeOf,
  rollUpEncumbrances,
  summariseEncumbrances,
  widthOf,
  type EncumbranceInput,
} from '@/lib/research/encumbrance-rollup';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const inp = (over: Partial<EncumbranceInput> = {}): EncumbranceInput => ({
  id: 'e1',
  category: 'easement',
  rawValue: 'a 20 foot utility easement along the North line',
  documentId: 'd1',
  ...over,
});

describe('classifying what it is', () => {
  it('uses the extraction category when it has one', () => {
    expect(kindOf('right_of_way', 'anything')).toBe('right_of_way');
    expect(kindOf('restrictive_covenant', 'anything')).toBe('restriction');
  });

  it('falls back to the text for an uncategorised fact', () => {
    expect(kindOf('other', 'County road widening right-of-way taking')).toBe('right_of_way');
    expect(kindOf('other', 'a drainage easement')).toBe('easement');
    expect(kindOf('other', '25 foot building line')).toBe('setback');
    expect(kindOf('other', 'nothing in particular')).toBe('unknown');
  });

  it('reads the width forms instruments actually use', () => {
    // A stated width is what turns "there is an easement" into something a crew can stake.
    expect(widthOf('a 20 foot utility easement')).toBe(20);
    expect(widthOf("a 15' drainage easement")).toBe(15);
    expect(widthOf('an easement of a width of 30 feet')).toBe(30);
    expect(widthOf('a utility easement as shown on the plat')).toBeNull();
  });

  it('does not read a metes-and-bounds distance as an easement width', () => {
    // "210.5 feet to the right" would otherwise parse as a 210-foot easement — a fabricated
    // encumbrance on a drawing.
    expect(widthOf('THENCE North 45 degrees East, 210.5 feet to the right of an iron rod')).toBeNull();
    expect(widthOf('thence 318.20 feet to a point')).toBeNull();
  });

  it('picks up the purpose', () => {
    expect(purposeOf('a 20 foot utility easement')).toBe('utility');
    expect(purposeOf('pipeline right of way')).toBe('pipeline');
    expect(purposeOf('an easement')).toBeNull();
  });
});

describe('a neighbour-recorded encumbrance is surfaced, not decided', () => {
  it('marks where it was recorded and names the neighbour', () => {
    const [e] = rollUpEncumbrances([inp({
      adjoinerId: 'a1', adjoinerLabel: 'SMITH, JOHN', adjoinsWhere: 'north line',
    })]);
    expect(e!.origin).toBe('adjoiner');
    expect(e!.source).toContain('SMITH, JOHN');
    expect(e!.source).toContain('adjoins on the north line');
  });

  it('refuses to say whether it burdens this tract', () => {
    // A legal question that depends on the grant's words and on where the line really falls.
    const [e] = rollUpEncumbrances([inp({ adjoinerId: 'a1' })]);
    expect(e!.bearing).toContain('Recorded against the NEIGHBOUR, not this property');
    expect(e!.bearing).toContain('read the instrument before excluding it');
  });

  it('states plainly when it is the subject’s own', () => {
    const [e] = rollUpEncumbrances([inp()]);
    expect(e!.origin).toBe('subject');
    expect(e!.bearing).toBe('Recorded against this property.');
  });
});

describe('it uses what a reviewer corrected, not the raw extraction', () => {
  it('prefers the corrected value', () => {
    const [e] = rollUpEncumbrances([inp({
      rawValue: 'a 20 foot utility easement',
      reviewStatus: 'corrected',
      correctedValue: 'a 30 foot utility easement along the North line',
    })]);
    expect(e!.text).toContain('30 foot');
    expect(e!.widthFt).toBe(30);
    expect(e!.unverified).toBe(false);
  });

  it('flags one nobody has checked', () => {
    expect(rollUpEncumbrances([inp()])[0]!.unverified).toBe(true);
    expect(rollUpEncumbrances([inp({ reviewStatus: 'accepted' })])[0]!.unverified).toBe(false);
  });
});

describe('the summary', () => {
  it('counts the neighbour-sourced ones separately and explains why they are here', () => {
    // They are the ones a reader will not expect and is most likely to dismiss.
    const s = summariseEncumbrances(rollUpEncumbrances([
      inp({ id: 'own' }),
      inp({ id: 'nbr', adjoinerId: 'a1', adjoinerLabel: 'SMITH' }),
    ]));
    expect(s.fromAdjoiners).toBe(1);
    expect(s.caveats.join(' ')).toContain('usually recorded against only one of the two tracts');
    expect(s.caveats.join(' ')).toContain('not automatically');
  });

  it('flags an easement with nothing to stake', () => {
    const s = summariseEncumbrances(rollUpEncumbrances([
      inp({ rawValue: 'a utility easement as shown on the plat' }),
    ]));
    expect(s.withoutWidth).toBe(1);
    expect(s.caveats.join(' ')).toContain('nothing to stake');
  });

  it('always names the gap it cannot close', () => {
    // Said every time rather than only when it looks relevant.
    const s = summariseEncumbrances([]);
    expect(s.caveats.join(' ')).toContain('whose records were not retrieved is missing from this list');
  });

  it('does not report an empty list as "there are none"', () => {
    expect(summariseEncumbrances([]).headline).toContain('not the same as there being none');
  });
});

describe('the surface', () => {
  const route = read('app/api/admin/research/[projectId]/encumbrances/route.ts');
  const panel = read('app/admin/research/components/EncumbrancePanel.tsx');

  it('pulls facts from neighbours researched in full', () => {
    expect(route).toContain("not('deep_project_id', 'is', null)");
  });

  it('explains why a shallow neighbour contributes nothing yet', () => {
    // It has pages we looked at, not data points — which is the gap R33 closes.
    expect(route).toContain('a shallow neighbour has pages we looked at, not data points');
  });

  it('sizes the gap instead of implying it', () => {
    expect(route).toContain('neighboursNotResearched');
    expect(panel).toContain('have not\n          been researched in full');
  });

  it('does not report a failed read as "no encumbrances"', () => {
    expect(route).toContain('not the same as there being none');
    expect(panel.replace(/\s+/g, ' ')).toContain('<strong>not</strong> the same as there being none');
  });

  it('does not colour a neighbour-recorded encumbrance like the subject’s own', () => {
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.encumbrance--adjoiner');
    expect(css.replace(/\s+/g, ' ')).toContain('most likely to dismiss');
  });

  it('is mounted on the easements tab', () => {
    const page = read('app/admin/research/[projectId]/page.tsx');
    expect(page).toContain('<EncumbrancePanel projectId={projectId} />');
  });
});
