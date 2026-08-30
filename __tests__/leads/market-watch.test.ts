// The market watch — §I3.2. No network: the profile is a pure function of a result.
//
// The assertions worth having here are about the two things this watch could get quietly wrong:
// the geography drifting from the firm's published service area, and the sweep being narrower than
// it admits.

import { describe, it, expect } from 'vitest';
import {
  coverageNote,
  coveredCounties,
  marketProfile,
  marketQueries,
  marketSubjects,
  marketSubjectAction,
  type MarketSubject,
} from '@/lib/leads/market-watch';
import { SERVICE_AREA_COUNTIES } from '@/lib/seo/business';
import { classifyAnnouncement } from '@/lib/research/announcement-watch';

const ALL: MarketSubject[] = ['development-pipeline', 'competitor-activity'];

describe('market watch — the geography is derived, never a second copy', () => {
  it('every covered county is one the firm publishes as its service area', () => {
    // The defect this guards is the repo's most repeated: two lists that agree the day they are
    // written. `/service-area`, the LocalBusiness JSON-LD and this watch must not be able to
    // disagree about where the firm works.
    const served = new Set(SERVICE_AREA_COUNTIES.map((c) => c.replace(/ County$/, '')));
    for (const c of coveredCounties()) expect(served.has(c)).toBe(true);
  });

  it('did not silently filter itself down to nothing', () => {
    // The filter drops names it cannot match. A typo in the core list would therefore produce a
    // SMALLER watch rather than an error — silently, which is exactly the shape this repo keeps
    // hitting. Eleven counties are intended; fewer means a name stopped matching.
    expect(coveredCounties()).toHaveLength(11);
    expect(coveredCounties()).toContain('Bell');
  });

  it('states how much of the service area it does NOT cover', () => {
    // A bounded sweep that does not say it is bounded reads as "nothing is happening" when it means
    // "nobody looked". The shortfall must appear in the note, as a number.
    const note = coverageNote();
    expect(note).toContain(String(coveredCounties().length));
    expect(note).toContain(String(SERVICE_AREA_COUNTIES.length));
    expect(note).toMatch(/not searched/i);
  });

  it('asks one query per covered county, each with a rationale', () => {
    for (const s of ALL) {
      expect(marketQueries(s)).toHaveLength(coveredCounties().length);
      for (const q of marketQueries(s)) expect(q.rationale.length).toBeGreaterThan(20);
    }
  });

  it('every subject says what to DO with a hit', () => {
    // A watch that surfaces something nobody acts on is a subscription.
    expect(marketSubjects().map((s) => s.id).sort()).toEqual([...ALL].sort());
    for (const s of ALL) expect(marketSubjectAction(s).length).toBeGreaterThan(30);
  });
});

describe('market watch — the lines the profile draws', () => {
  const agenda = {
    title: 'Bell County Commissioners Court approves preliminary plat for Salado Ridge subdivision',
    content: 'The court approved the preliminary plat on March 4, 2026, clearing the subdivision for filing.',
    url: 'https://www.bellcountytx.com/agendas/2026-03-04',
    score: 0.9,
    authority: 0.8,
  };

  it('surfaces a real agenda item naming a covered county', () => {
    const v = classifyAnnouncement(agenda, marketProfile('development-pipeline'), { currentYear: 2026 });
    expect(v.verdict).toBe('likely');
    expect(v.excerpt).toBeTruthy();
  });

  it('ignores an identical item in a county the firm does not serve', () => {
    // Amarillo is 400 miles away. Naming a plat there is not a lead, and a watch that cannot tell is
    // a watch nobody will keep reading.
    const v = classifyAnnouncement(
      { ...agenda, title: 'Potter County approves preliminary plat for Amarillo North subdivision' },
      marketProfile('development-pipeline'),
      { currentYear: 2026 },
    );
    expect(v.verdict).toBe('noise');
  });

  it('caps a property-listing site, and the control proves the cap is what did it', () => {
    const listing = classifyAnnouncement(
      { ...agenda, url: 'https://www.zillow.com/bell-county-tx/new-subdivision' },
      marketProfile('development-pipeline'),
      { currentYear: 2026 },
    );
    expect(listing.verdict).not.toBe('likely');
    expect(listing.reasons.join(' ')).toMatch(/vendor marketing/i);
    // Control: the same text on the county's own host reaches `likely`, so the assertion above is
    // about the host and not about the profile rejecting everything.
    expect(classifyAnnouncement(agenda, marketProfile('development-pipeline'), { currentYear: 2026 }).verdict)
      .toBe('likely');
  });

  it('demotes an agenda item old enough that the project already happened', () => {
    // One year, the shortest window of any watch here. A 2023 plat is a building, not a lead.
    const v = classifyAnnouncement(
      { ...agenda, content: 'The court approved the preliminary plat on March 4, 2022.' },
      marketProfile('development-pipeline'),
      { currentYear: 2026 },
    );
    expect(v.verdict).not.toBe('likely');
    expect(v.reasons.join(' ')).toMatch(/stale/i);
  });

  it('does not treat the everyday vocabulary of local government as a signal', () => {
    // "meeting", "agenda", "commissioners court" appear on every page in this subject area. If any
    // counted as a change word every result would be a hit.
    const words = marketProfile('development-pipeline').changeWords.map((w) => w.toLowerCase());
    for (const everyday of ['meeting', 'agenda', 'county', 'city council', 'minutes']) {
      expect(words).not.toContain(everyday);
    }
  });
});
