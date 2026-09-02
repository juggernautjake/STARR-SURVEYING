// worker/src/__tests__/capture-plan.test.ts — plan F1–F4.
//
// The owner asked for satellite and bird's-eye views of properties AND their surrounding
// properties, plus the county's CAD GIS map, captured and saved for every run.
//
// The pieces existed and were not joined: `planImagery()` had no caller outside its own tests,
// Bell's capture took Google satellite at a FIXED zoom 20 while `frameParcel()` sat unused, and
// `BIS_CONFIGS` carried a `gisBaseUrl` for 19 counties that was used only to query features.
//
// These tests are about the DECISIONS. The last block is about whether anything calls them, which
// is the half that has gone wrong here before.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  planCaptures,
  captureKey,
  provenanceForCapture,
  captionForCapture,
  googleSatelliteUrl,
  googleObliqueUrl,
  MAX_NEIGHBOUR_CAPTURES,
  MIN_ZOOM,
  MAX_ZOOM,
  type CapturePlanInput,
} from '../research/capture-plan.js';

const BELTON = { latitude: 31.0568, longitude: -97.4642 };

const base: CapturePlanInput = {
  projectId: 'p1',
  county: 'Bell',
  ...BELTON,
  acreage: 10,
  parcelId: '123456',
  gisBaseUrl: 'https://gis.bisclient.com/bellcad/',
};

const kinds = (p: ReturnType<typeof planCaptures>) => p.captures.map((c) => c.kind);
const skipKinds = (p: ReturnType<typeof planCaptures>) => p.skipped.map((s) => s.kind);

describe('the subject parcel is framed, not photographed at a fixed zoom', () => {
  it('captures the subject aerial', () => {
    expect(kinds(planCaptures(base))).toContain('aerial_subject');
  });

  it('uses a WIDER frame for a bigger tract — the defect fixed zoom 20 had', () => {
    // Zoom 20 is roughly 165 m of ground. A 200-acre tract is about 900 m across, so a fixed zoom
    // photographs the middle of it and labels the image as the parcel.
    const small = planCaptures({ ...base, acreage: 0.25 });
    const large = planCaptures({ ...base, acreage: 200 });
    const z = (p: ReturnType<typeof planCaptures>) =>
      p.captures.find((c) => c.kind === 'aerial_subject')!.zoom!;
    expect(z(large)).toBeLessThan(z(small));
    expect(z(large)).toBeLessThan(20);
  });

  it('records the scale, because an image with no scale cannot support a measurement', () => {
    const c = planCaptures(base).captures.find((x) => x.kind === 'aerial_subject')!;
    expect(c.metresPerPixel).toBeGreaterThan(0);
    expect(c.purpose).toMatch(/m\/px/);
  });
});

describe('the surrounding properties — the half that was missing entirely', () => {
  const withNeighbours: CapturePlanInput = {
    ...base,
    neighbours: [
      { label: 'North adjoiner', lat: 31.058, lon: -97.4642 },
      { label: 'South adjoiner', lat: 31.055, lon: -97.4642 },
    ],
  };

  it('captures each adjoining parcel', () => {
    const p = planCaptures(withNeighbours);
    expect(p.captures.filter((c) => c.kind === 'aerial_neighbours')).toHaveLength(2);
  });

  it('photographs them at the SAME scale as the subject, so they can be compared', () => {
    const p = planCaptures(withNeighbours);
    const subject = p.captures.find((c) => c.kind === 'aerial_subject')!;
    for (const n of p.captures.filter((c) => c.kind === 'aerial_neighbours')) {
      expect(n.zoom).toBe(subject.zoom);
    }
  });

  it('caps the count and SAYS it truncated, rather than silently dropping the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      label: `Adjoiner ${i}`, lat: 31.05 + i / 1000, lon: -97.46,
    }));
    const p = planCaptures({ ...withNeighbours, neighbours: many });
    expect(p.captures.filter((c) => c.kind === 'aerial_neighbours')).toHaveLength(MAX_NEIGHBOUR_CAPTURES);
    expect(p.skipped.find((s) => s.kind === 'aerial_neighbours')?.reason)
      .toMatch(/further adjoining parcel/i);
  });

  it('says WHY when there are none, without implying the tract has no neighbours', () => {
    const p = planCaptures(base);
    const reason = p.skipped.find((s) => s.kind === 'aerial_neighbours')!.reason;
    expect(reason).toMatch(/not that the tract has no neighbours/i);
  });
});

describe('the county CAD GIS map', () => {
  it('is captured from the county gisBaseUrl, not from a Bell-only constant', () => {
    const p = planCaptures({ ...base, county: 'Coryell', gisBaseUrl: 'https://gis.bisclient.com/coryellcad/' });
    const gis = p.captures.find((c) => c.kind === 'cad_gis')!;
    expect(gis.url).toContain('coryellcad');
  });

  it('addresses the specific parcel when a parcel id is known', () => {
    const gis = planCaptures(base).captures.find((c) => c.kind === 'cad_gis')!;
    expect(gis.url).toContain('PropertyID=123456');
  });

  it('still opens the county viewer when there is no parcel id', () => {
    const gis = planCaptures({ ...base, parcelId: null }).captures.find((c) => c.kind === 'cad_gis')!;
    expect(gis.url).toBe('https://gis.bisclient.com/bellcad');
  });

  it('is OCR\'d — a lot number in a map image is text, not pixels', () => {
    expect(planCaptures(base).captures.find((c) => c.kind === 'cad_gis')!.ocr).toBe(true);
  });

  it('blames OUR registry, not the county, when no viewer is registered', () => {
    const p = planCaptures({ ...base, county: 'Falls', gisBaseUrl: null });
    const reason = p.skipped.find((s) => s.kind === 'cad_gis')!.reason;
    expect(reason).toMatch(/coverage gap in our registry/i);
    expect(reason).toMatch(/not a county without a map/i);
  });

  it('is captured even when no centroid was resolved, because it is addressed by parcel id', () => {
    // The one capture that does not need coordinates. Dropping it along with the aerials would lose
    // the county's own drawing of the parcel for exactly the properties we know least about.
    const p = planCaptures({ ...base, latitude: null, longitude: null });
    expect(kinds(p)).toContain('cad_gis');
  });
});

describe('oblique / bird\'s-eye', () => {
  it('is planned when a provider is configured', () => {
    expect(kinds(planCaptures({ ...base, obliqueProvider: 'google' }))).toContain('oblique');
  });

  it('is a tilted URL, not the same nadir view under a different name', () => {
    const o = planCaptures({ ...base, obliqueProvider: 'google' }).captures
      .find((c) => c.kind === 'oblique')!;
    expect(o.url).toMatch(/45t/);
    expect(o.url).not.toBe(googleSatelliteUrl(BELTON.latitude, BELTON.longitude, o.zoom!));
  });

  it('blames OUR configuration when there is no provider, not the county\'s coverage', () => {
    const reason = planCaptures(base).skipped.find((s) => s.kind === 'oblique')!.reason;
    expect(reason).toMatch(/this firm's imagery accounts/i);
    expect(reason).toMatch(/says nothing about whether oblique coverage exists/i);
  });
});

describe('Street View', () => {
  it('is captured at each PUBLIC frontage', () => {
    const p = planCaptures({
      ...base,
      frontages: [
        { name: 'FM 436', lat: 31.056, lon: -97.464, isPublic: true },
        { name: 'Private drive', lat: 31.057, lon: -97.465, isPublic: false },
      ],
    });
    expect(p.captures.filter((c) => c.kind === 'streetview')).toHaveLength(1);
  });

  it('treats "all frontages are private" as a fact about access, not an omission', () => {
    const p = planCaptures({
      ...base,
      frontages: [{ name: 'Private drive', lat: 31.057, lon: -97.465, isPublic: false }],
    });
    expect(p.skipped.find((s) => s.kind === 'streetview')!.reason)
      .toMatch(/fact about access, not an omission/i);
  });
});

describe('historical aerial', () => {
  it('aims at the controlling deed\'s year', () => {
    const c = planCaptures({ ...base, controllingDeedDate: '1968-04-12' }).captures
      .find((x) => x.kind === 'aerial_historical')!;
    expect(c.targetYear).toBe(1968);
  });

  it('is skipped with a reason when no deed date is known', () => {
    expect(planCaptures(base).skipped.find((s) => s.kind === 'aerial_historical')!.reason)
      .toMatch(/evidences nothing/i);
  });
});

describe('a re-run does not retake the same screenshot', () => {
  // 19 of the 53 duplicate document groups measured in production on 2026-09-01 were one screenshot
  // re-taken by a later run.
  it('skips a capture the library already holds', () => {
    const first = planCaptures(base);
    const heldKeys = first.captures.map((c) => c.key);
    const second = planCaptures({ ...base, alreadyHeldKeys: heldKeys });
    expect(second.captures).toHaveLength(0);
    expect(second.skipped.some((s) => /already held/i.test(s.reason))).toBe(true);
  });

  it('DOES retake when the operator asked for fresh imagery', () => {
    // The point of the re-run setting: something on the ground changed.
    const first = planCaptures(base);
    const second = planCaptures({
      ...base,
      alreadyHeldKeys: first.captures.map((c) => c.key),
      refreshImagery: true,
    });
    expect(second.captures.length).toBe(first.captures.length);
  });

  it('gives the same subject the same key across runs', () => {
    expect(captureKey('p1', 'cad_gis', '123456')).toBe(captureKey('p1', 'cad_gis', '123456'));
    expect(captureKey('p1', 'cad_gis', '123456')).not.toBe(captureKey('p2', 'cad_gis', '123456'));
  });
});

describe('no centroid is a gap in what WE found, not a fact about the land', () => {
  it('skips the aerials with that distinction stated', () => {
    const p = planCaptures({ ...base, latitude: null, longitude: null });
    expect(skipKinds(p)).toContain('aerial_subject');
    expect(p.skipped[0].reason).toMatch(/gap in what the run identified, not a fact about the land/i);
  });
});

describe('provenance — what makes an aerial evidence rather than decoration', () => {
  it('admits it does not know when the imagery was flown', () => {
    // Google does not return a capture date. A packet implying a date it never verified is worse
    // than one that says it does not know.
    const c = planCaptures(base).captures.find((x) => x.kind === 'aerial_subject')!;
    const p = provenanceForCapture(c);
    expect(p.capturedAt).toBeNull();
    expect(captionForCapture(c, p)).toMatch(/capture date not published/i);
  });

  it('carries the attribution and the redistribution posture', () => {
    const c = planCaptures(base).captures.find((x) => x.kind === 'aerial_subject')!;
    const p = provenanceForCapture(c);
    expect(p.attribution).toBeTruthy();
    // Google imagery in a client deliverable is a licensing question nobody should discover from a
    // client's lawyer.
    expect(p.redistribution).toBe('check_licence');
  });

  it('records the scale and the centre it was taken at', () => {
    const c = planCaptures(base).captures.find((x) => x.kind === 'aerial_subject')!;
    const p = provenanceForCapture(c);
    expect(p.metresPerPixel).toBeGreaterThan(0);
    expect(p.centre).toEqual({ lat: BELTON.latitude, lon: BELTON.longitude });
  });
});

describe('the plan explains itself', () => {
  it('summarises what it will and will not do', () => {
    const p = planCaptures({ ...base, neighbours: [{ label: 'N', lat: 31.058, lon: -97.464 }] });
    expect(p.summary).toMatch(/capture\(s\) planned/);
    expect(p.summary).toMatch(/skipped, each with a stated reason/);
  });
});

// ── The half that has gone wrong here before ────────────────────────────────────────────────────

describe('the county GIS URLs this depends on are real, not invented', () => {
  it('BIS_CONFIGS carries gisBaseUrl for a batch of counties', () => {
    const bis = readFileSync(join(__dirname, '..', 'services', 'bis-cad.ts'), 'utf8');
    const count = (bis.match(/gisBaseUrl:/g) ?? []).length;
    // 19 at the time of writing. Asserting a floor, not the exact number: adding counties is good.
    expect(count).toBeGreaterThanOrEqual(15);
    expect(bis).toContain('https://gis.bisclient.com/bellcad/');
  });
});

describe('three zoom levels on every run', () => {
  // The owner's request: "for google maps and satellite, I want it so that we have a zoomed out
  // view, a medium zoom view, and then a closer up zoom view… for every run we do".
  it('captures wide, framed and close for the subject', () => {
    const kinds = planCaptures(base).captures.map((c) => c.kind);
    expect(kinds).toContain('aerial_wide');
    expect(kinds).toContain('aerial_subject');
    expect(kinds).toContain('aerial_close');
  });

  it('orders them wide → framed → close', () => {
    const p = planCaptures(base);
    const z = (k: string) => p.captures.find((c) => c.kind === k)!.zoom!;
    expect(z('aerial_wide')).toBeLessThan(z('aerial_subject'));
    expect(z('aerial_subject')).toBeLessThan(z('aerial_close'));
  });

  it('scales all three from the ACREAGE, not from a fixed number', () => {
    // The defect this replaces: Bell captured everything at a hardcoded zoom 20.
    const small = planCaptures({ ...base, acreage: 0.25 });
    const large = planCaptures({ ...base, acreage: 200 });
    const wide = (p: ReturnType<typeof planCaptures>) =>
      p.captures.find((c) => c.kind === 'aerial_wide')!.zoom!;
    expect(wide(large)).toBeLessThan(wide(small));
  });

  it('reports a DIFFERENT scale for each band', () => {
    // Metres-per-pixel doubles per zoom level down. Reporting the framed scale on all three would
    // put a wrong number on two of them, and the scale is what makes an aerial measurable.
    const p = planCaptures(base);
    const mpp = ['aerial_wide', 'aerial_subject', 'aerial_close']
      .map((k) => p.captures.find((c) => c.kind === k)!.metresPerPixel!);
    expect(new Set(mpp).size).toBe(3);
    expect(mpp[0]).toBeGreaterThan(mpp[1]);   // wider = more ground per pixel
    expect(mpp[1]).toBeGreaterThan(mpp[2]);
  });

  it('stays inside the range Google actually resolves', () => {
    for (const acreage of [0.05, 1, 50, 500, 5000]) {
      for (const c of planCaptures({ ...base, acreage }).captures) {
        if (!c.zoom) continue;
        expect(c.zoom, `acreage ${acreage}`).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(c.zoom, `acreage ${acreage}`).toBeLessThanOrEqual(MAX_ZOOM);
      }
    }
  });

  it('gives each band its own stable key, so a re-run does not refile them', () => {
    const first = planCaptures(base);
    const keys = first.captures.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const second = planCaptures({ ...base, alreadyHeldKeys: keys });
    expect(second.captures).toHaveLength(0);
  });

  it('says WHY each band is worth taking, in the packet not just the log', () => {
    const p = planCaptures(base);
    expect(p.captures.find((c) => c.kind === 'aerial_wide')!.purpose).toMatch(/road it takes access from/i);
    expect(p.captures.find((c) => c.kind === 'aerial_close')!.purpose).toMatch(/fence/i);
  });
});
