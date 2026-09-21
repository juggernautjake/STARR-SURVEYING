// __tests__/field-ingest/to-map.test.ts — collector points reaching the map.
//
// Owner, 2026-09-20: "could we have it where the interactive map point layer gets automatically
// updated with the newly streamed points?"
//
// The database half is exercised by the route; what is tested here is the reasoning that decides
// whether a point is placeable at all — the unit check and the description — plus the properties of
// the bridge that make repeated syncing safe. Those properties are the ones that fail silently:
// a duplicate pin looks like one pin, and a wrong-zone pin looks like a pin.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkUnit, describePoint, COLLECTOR_LAYER_NAME, type InstrumentPointRow } from '@/lib/field-ingest/to-map';

const source = fs.readFileSync(path.join(process.cwd(), 'lib/field-ingest/to-map.ts'), 'utf8');
/** Comments stripped — this codebase names what it decided against inside them. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const cron = fs.readFileSync(path.join(process.cwd(), 'app/api/cron/field-sync/route.ts'), 'utf8');

const pt = (over: Partial<InstrumentPointRow> = {}): InstrumentPointRow => ({
  id: 'ip-1', job_id: 'job-1', point_name: '104', code: null, description: null,
  northing: 10_241_883.21, easting: 3_122_904.77, elevation: null, unit: 'unknown',
  measured_at: null, received_at: '2026-09-21T14:00:00.000Z', ...over,
});

describe('units — the assumption that survives every review', () => {
  it.each([['unknown', 'unknown'], ['blank', ''], ['ft', 'ft'], ['feet', 'feet'], ['usft', 'usft'], ['US_FT', 'US_FT']])(
    '%s is treated as feet', (_l, u) => { expect(checkUnit(u).ok).toBe(true); },
  );

  it('accepts a missing unit, because most collector exports have none', () => {
    // Refusing these would make the feature useless for the common case. Every Texas survey this
    // firm does is in US survey feet.
    expect(checkUnit(null).ok).toBe(true);
    expect(checkUnit(undefined).ok).toBe(true);
  });

  it.each([['m', 'm'], ['meters', 'meters'], ['metres', 'metres'], ['km', 'km']])(
    'refuses %s and says why', (_l, u) => {
      const v = checkUnit(u);
      expect(v.ok).toBe(false);
      if (v.ok) throw new Error('expected a refusal');
      expect(v.why).toMatch(/units/i);
      expect(v.why, 'must say nothing converts').toMatch(/convert/i);
    },
  );

  it('refuses a unit it does not recognise rather than assuming feet', () => {
    const v = checkUnit('chains');
    expect(v.ok).toBe(false);
  });

  it('a metre file is the one where the assumption is PROVABLY wrong', () => {
    // 3.28x out is obvious on a map. International vs US survey feet is 2ppm out and is not — and
    // neither is guessable from the numbers, which is why nothing here converts.
    expect(checkUnit('meters').ok).toBe(false);
    expect(checkUnit('ifeet').ok, 'international feet still go through').toBe(true);
  });
});

describe('what the pin says', () => {
  it('uses the point number as the title, because that is what a surveyor calls it', () => {
    expect(describePoint(pt({ point_name: '104' })).title).toBe('104');
    expect(describePoint(pt({ point_name: 'CP1' })).title).toBe('CP1');
  });

  it('never has an empty title', () => {
    expect(describePoint(pt({ point_name: '   ' })).title).toBe('Point');
  });

  it('folds code, description and elevation into the notes', () => {
    const { notes } = describePoint(pt({ description: 'FND 1/2" IR', code: 'IR', elevation: 712.44 }));
    expect(notes).toContain('FND 1/2" IR');
    expect(notes).toContain('Code IR');
    expect(notes).toContain('712.44');
  });

  it('records the shot time only when the file had one', () => {
    // seeds/522: measured_at is nullable because plenty of formats do not record it, and stamping
    // a point with its upload time "looks like it was shot at 6pm from the office car park".
    expect(describePoint(pt({ measured_at: null })).notes).toBeNull();
    expect(describePoint(pt({ measured_at: '2026-09-14T14:42:11.000Z' })).notes).toMatch(/Shot 2026-09-14/);
  });

  it('is null rather than an empty string when the collector said nothing', () => {
    expect(describePoint(pt()).notes).toBeNull();
  });
});

describe('the zone is never guessed', () => {
  it('refuses a map with no zone declared', () => {
    expect(code).toMatch(/if \(!zone\)/);
    expect(source).toMatch(/no coordinate zone set/i);
  });

  it('has no default zone anywhere', () => {
    expect(code).not.toContain('DEFAULT_TEXAS_ZONE_KEY');
  });

  it('reports a point that lands outside Texas rather than dropping it', () => {
    // Outside the box almost always means the MAP's zone is wrong, and the person has to see that
    // to recognise it.
    expect(source).toMatch(/usually means the map's zone is wrong/);
  });
});

describe('a re-sync updates rather than stacks', () => {
  it('keys existing pins on the collector point id', () => {
    expect(code).toContain('from_instrument_point_id');
    expect(code).toMatch(/existing\.get\(p\.id\)/);
  });

  it('moves a pin only when the coordinates actually changed', () => {
    expect(code).toContain('samePlace');
    expect(code).toMatch(/result\.unchanged \+= 1/);
  });

  it('refreshes ONLY the position, never the title or notes', () => {
    // A surveyor may have corrected a name. A later sync of the same shot must not undo that.
    const update = code.slice(code.indexOf('.update({'), code.indexOf('.update({') + 220);
    expect(update).toContain('lat:');
    expect(update).toContain('lng:');
    expect(update).not.toContain('title:');
    expect(update).not.toContain('notes:');
  });
});

describe('the sheet', () => {
  it('is a named layer, not the default one, so it hides in a click', () => {
    expect(COLLECTOR_LAYER_NAME).toBe('Collector points');
    expect(code).toContain('is_default: false');
  });

  it('survives losing a race to a concurrent sync', () => {
    // Two ticks overlapping must not fail; the loser re-reads.
    expect(code).toMatch(/again/);
  });
});

describe('the cron is the piece that never existed', () => {
  it('is registered to run', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as
      { crons?: Array<{ path: string; schedule: string }> };
    const entry = (vercel.crons ?? []).find((c) => c.path === '/api/cron/field-sync');
    expect(entry, 'lib/field-ingest/trimble-connect.ts had zero production callers before this').toBeTruthy();
    expect(entry!.schedule).toBe('*/5 * * * *');
  });

  it('is gated on CRON_SECRET like every other tick', () => {
    expect(cron).toContain('CRON_SECRET');
    expect(cron).toMatch(/Bearer \$\{expected\}/);
  });

  it('runs the BRIDGE even with no Trimble credentials', () => {
    // The difference between "this works once you buy a subscription" and "this works, and a
    // subscription makes it automatic". Points dragged in through the collector upload go through
    // the same table and need no credentials at all.
    // The CALL, not the import at the top of the file — which is where this assertion first
    // pointed, and why it failed against correct code.
    const bridgeAt = cron.indexOf('const jobIds = await jobsWithCollectorPoints()');
    const guardAt = cron.indexOf('if (hasTrimble)');
    expect(bridgeAt, 'the bridge must actually be called').toBeGreaterThan(0);
    expect(bridgeAt).toBeGreaterThan(guardAt);

    // And it sits at the function's top level rather than inside the credentials block. Indentation
    // is the structural fact here: two spaces is the body of the handler, four would be nested.
    expect(cron).toMatch(/\n {2}const jobIds = await jobsWithCollectorPoints\(\);/);
  });

  it('says WHY it skipped the poll instead of logging nothing', () => {
    // "No credentials" and "no new points" look identical in a log that does not distinguish them,
    // and only one of those is something the owner can fix.
    expect(cron).toMatch(/configured: false/);
    expect(cron).toMatch(/corporate domain/i);
    expect(cron).toMatch(/personal\/free/i);
  });

  it('one broken source does not stop the others or the bridge', () => {
    expect(cron).toMatch(/catch \(e\)/);
  });
});
