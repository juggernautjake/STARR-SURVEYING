// Framing a parcel, and imagery that counts as evidence (research plan R16).
//
// What existed: one Google Static Maps call in `lot-correlator.ts` at zoom 19, FIXED, base64'd
// straight into an AI prompt. Zoom 19 is about 0.26 m/pixel at Texas latitudes, so a 1280 px frame
// covers roughly 330 m — fine for a quarter-acre town lot, and roughly a third of the width of a
// 200-acre tract (~900 m square). The AI was being asked to identify a parcel from a picture of a
// ninth of it, on the rural work this firm mostly does.
//
// And the image carried no capture date, scale, source or licence, so it could illustrate a packet
// but never support a conclusion in one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  HISTORICAL_WINDOW_YEARS,
  SOURCE_LICENCE,
  captionFor,
  frameParcel,
  metresPerPixel,
  planImagery,
  provenanceFor,
} from '../services/imagery-plan.js';

const TX_LAT = 31.1; // Bell County-ish.

describe('the fixed zoom was arithmetic, not preference', () => {
  it('confirms zoom 19 cannot frame a rural tract', () => {
    // 1280 px at zoom 19 is ~330 m across. A 200-acre square tract is ~900 m across, so the old
    // fixed zoom framed about a third of its width — a ninth of its area.
    const width = metresPerPixel(19, TX_LAT) * 1280;
    expect(width).toBeLessThan(400);
    expect(width).toBeLessThan(Math.sqrt(200 * 4046.86) / 2);
    expect(frameParcel({ acreage: 200, latitude: TX_LAT, imageWidthPx: 1280 }).zoom).toBeLessThan(19);
  });

  it('still frames a town lot tightly', () => {
    // A quarter-acre lot should NOT get pulled out to a rural zoom — that would be the same bug
    // pointing the other way.
    const f = frameParcel({ acreage: 0.25, latitude: TX_LAT, imageWidthPx: 1280 });
    expect(f.zoom).toBeGreaterThanOrEqual(18);
  });

  it('leaves the parcel visible context rather than filling the frame', () => {
    // The adjoiner's fence and the road are usually the point of looking at all.
    const f = frameParcel({ acreage: 10, latitude: TX_LAT, imageWidthPx: 1280 });
    expect(f.groundWidthM).toBeGreaterThan(f.parcelWidthM!);
  });

  it('returns integer zooms only', () => {
    // Providers do not serve fractional zooms; asking for 18.4 silently gets 18 at the wrong scale.
    for (const acreage of [0.2, 1, 5, 40, 200, 1000]) {
      const z = frameParcel({ acreage, latitude: TX_LAT, imageWidthPx: 1280 }).zoom;
      expect(Number.isInteger(z)).toBe(true);
    }
  });

  it('gets wider as the parcel gets bigger, monotonically', () => {
    const zooms = [1, 10, 100, 1000].map(
      (a) => frameParcel({ acreage: a, latitude: TX_LAT, imageWidthPx: 1280 }).zoom,
    );
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!).toBeLessThanOrEqual(zooms[i - 1]!);
  });

  it('says a default is a default when acreage is unknown', () => {
    const f = frameParcel({ acreage: null, latitude: TX_LAT, imageWidthPx: 1280 });
    expect(f.parcelWidthM).toBeNull();
    expect(f.reason).toContain('default rather than a fit');
  });

  it('states the square-parcel assumption instead of hiding it', () => {
    // A 10-acre strip 100 ft wide and half a mile long needs a far wider frame than sqrt(area).
    expect(frameParcel({ acreage: 10, latitude: TX_LAT, imageWidthPx: 1280 }).reason)
      .toContain('Assumes a square parcel');
  });

  it('accounts for latitude', () => {
    // Web Mercator metres-per-pixel shrinks with cos(latitude); a plan that ignored it would frame
    // the Panhandle differently from the Valley without meaning to.
    expect(metresPerPixel(18, 26)).toBeGreaterThan(metresPerPixel(18, 36));
  });
});

describe('an image is evidence only with its provenance', () => {
  it('records an unknown capture date as unknown', () => {
    // Google Static Maps does not return one at all. A caption that omits the date reads as
    // "current", which is the claim we cannot make.
    const p = provenanceFor('google_satellite', { requestedAt: '2026-08-02T00:00:00.000Z' });
    expect(p.capturedAt).toBeNull();
    expect(captionFor(p)).toContain('capture date not published');
  });

  it('puts the flown date in the caption when there is one', () => {
    const p = provenanceFor('naip', {
      requestedAt: '2026-08-02T00:00:00.000Z',
      capturedAt: '2022-06-14',
      metresPerPixel: 0.6,
    });
    expect(captionFor(p)).toContain('flown 2022-06-14');
    expect(captionFor(p)).toContain('0.60 m/pixel');
  });

  it('refuses to guess a redistribution right', () => {
    // Same spirit as R12's captcha posture: nobody should learn about a licensing problem from a
    // client's lawyer.
    expect(SOURCE_LICENCE.google_satellite.redistribution).toBe('check_licence');
    expect(SOURCE_LICENCE.naip.redistribution).toBe('permitted');
    expect(SOURCE_LICENCE.esri_world_imagery.redistribution).toBe('attribution_required');
  });

  it('carries an attribution string for every source', () => {
    for (const [, v] of Object.entries(SOURCE_LICENCE)) {
      expect(v.attribution.length).toBeGreaterThan(0);
    }
  });
});

describe('the plan, and its stated reasons why not', () => {
  const base = {
    acreage: 120,
    latitude: TX_LAT,
    longitude: -97.4,
    controllingDeedDate: '1968-03-11',
    frontages: [{ name: 'FM 436', lat: TX_LAT, lon: -97.4, isPublic: true }],
  };

  it('meets the packet standard when everything is known', () => {
    const plan = planImagery(base);
    expect(plan.meetsPacketStandard).toBe(true);
    expect(plan.captures.some((c) => c.purpose.startsWith('Current aerial'))).toBe(true);
    expect(plan.captures.some((c) => c.source === 'google_streetview')).toBe(true);
  });

  it('aims the historical aerial at the deed year, not at today', () => {
    // An aerial from 2024 says nothing about where a fence stood when a 1968 deed was written.
    const hist = planImagery(base).captures.find((c) => c.targetYear);
    expect(hist?.targetYear).toBe(1968);
    expect(hist?.acceptableYearRange).toEqual([1968 - HISTORICAL_WINDOW_YEARS, 1968 + HISTORICAL_WINDOW_YEARS]);
  });

  it('will not pick a historical aerial with no deed date to aim at', () => {
    const plan = planImagery({ ...base, controllingDeedDate: null });
    expect(plan.meetsPacketStandard).toBe(false);
    expect(plan.skipped.find((s) => s.source === 'historical_usgs')?.reason)
      .toContain('evidences nothing');
  });

  it('says a private drive is why Street View is missing', () => {
    const plan = planImagery({
      ...base,
      frontages: [{ name: 'private drive', lat: TX_LAT, lon: -97.4, isPublic: false }],
    });
    expect(plan.captures.some((c) => c.source === 'google_streetview')).toBe(false);
    expect(plan.skipped.find((s) => s.source === 'google_streetview')?.reason)
      .toContain('Field photography is the substitute');
  });

  it('treats no known frontage as an unanswered question, not a landlocked parcel', () => {
    const plan = planImagery({ ...base, frontages: [] });
    expect(plan.skipped.find((s) => s.source === 'google_streetview')?.reason)
      .toContain('not a finding that the parcel is landlocked');
    expect(plan.shortfalls.join(' ')).toContain('road frontages not identified');
  });

  it('captures Street View at EACH public frontage, not just one', () => {
    // A corner tract has two, and the occupation evidence differs on each.
    const plan = planImagery({
      ...base,
      frontages: [
        { name: 'FM 436', lat: TX_LAT, lon: -97.4, isPublic: true },
        { name: 'CR 101', lat: TX_LAT + 0.001, lon: -97.401, isPublic: true },
      ],
    });
    expect(plan.captures.filter((c) => c.source === 'google_streetview')).toHaveLength(2);
  });

  it('prefers a source that publishes a capture date for the current aerial', () => {
    // Esri/NAIP over Google: for evidence, a known flight date beats slightly newer tiles.
    const current = planImagery(base).captures[0]!;
    expect(current.source).toBe('esri_world_imagery');
  });

  it('lists shortfalls rather than quietly returning a thinner plan', () => {
    const plan = planImagery({ ...base, acreage: null, controllingDeedDate: null, frontages: [] });
    expect(plan.meetsPacketStandard).toBe(false);
    expect(plan.shortfalls).toHaveLength(3);
  });
});

describe('the old call site', () => {
  it('still exists and is the thing this replaces', () => {
    // Recorded so the next slice — actually fetching — knows where to land.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/counties/bell/analyzers/lot-correlator.ts'), 'utf8',
    );
    expect(src).toContain('maps.googleapis.com/maps/api/staticmap');
  });
});

describe('the framing is actually used (plan R16)', () => {
  // `imagery-plan.ts` fixed the arithmetic and then had ZERO callers, so `zoom = 19` stayed live in
  // `lot-correlator.ts` — the exact line this module's header describes as the defect. Ninth
  // instance of that shape in the research plan.
  const correlator = fs.readFileSync(
    path.join(process.cwd(), 'src/counties/bell/analyzers/lot-correlator.ts'), 'utf8');

  it('no longer hardcodes zoom 19', () => {
    expect(correlator).not.toMatch(/maptype === 'satellite' \? 19 : 18/);
  });

  it('frames from the parcel size', () => {
    expect(correlator).toContain('frameParcel({');
    expect(correlator).toContain('acreage: acreage ?? null');
  });

  it('passes the acreage the caller already had', () => {
    // It was sitting in `LotCorrelationInput.acreage` the whole time, one line above the call.
    expect(correlator).toContain('input.situsAddress, onProgress, input.acreage');
  });

  it('frames against the REQUESTED width, not the scale-2 pixel count', () => {
    // `scale: 2` doubles pixels without changing ground coverage. Passing 2560 here would frame
    // twice as much ground as intended — the opposite of the bug, and just as wrong.
    expect(correlator).toContain('imageWidthPx: 1280');
  });

  it('keeps the roadmap one step wider, as it was', () => {
    // The street view exists to show the parcel in its road context, and one zoom out is that
    // context. Losing the relationship would be an unrelated regression smuggled in with a fix.
    expect(correlator).toContain('Math.max(1, framing.zoom - 1)');
  });

  it('says how it framed, so a wrong-looking image can be diagnosed', () => {
    expect(correlator).toContain('Imagery framing: ${framing.reason}');
  });
});

describe('the arithmetic that made the fixed zoom wrong', () => {
  // Checked rather than asserted, because it is the justification for changing a live setting.
  it('zoom 19 shows about a third of a 200-acre tract', () => {
    const wide = frameParcel({ acreage: 200, latitude: 31, imageWidthPx: 1280 });
    const at19 = metresPerPixel(19, 31, 1) * 1280;
    expect(wide.parcelWidthM!).toBeGreaterThan(at19 * 2);
    expect(wide.zoom).toBeLessThan(19);
  });

  it('still frames a quarter-acre town lot tightly', () => {
    // The fixed zoom was not wrong everywhere — it was wrong on the rural work. A fix that pulled
    // back on a town lot would trade one bad frame for another.
    const small = frameParcel({ acreage: 0.25, latitude: 31, imageWidthPx: 1280 });
    expect(small.zoom).toBeGreaterThanOrEqual(19);
  });

  it('falls back to a stated default when acreage is unknown', () => {
    const none = frameParcel({ acreage: null, latitude: 31, imageWidthPx: 1280 });
    expect(none.reason).toContain('default rather than a fit');
  });
});
