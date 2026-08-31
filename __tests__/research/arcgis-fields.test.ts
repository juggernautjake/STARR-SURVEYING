// __tests__/research/arcgis-fields.test.ts
//
// Every fixture below uses the REAL field names from the live Bell CAD layer, read off its own
// schema endpoint on 2026-08-30. That matters more than usual here: the bug being fixed was three
// services confidently naming a column — `SITUS_ADDR` — that the layer has never had. A test
// written from the same imagination would pin the same fiction.
//
// The layer's actual fields: prop_id, prop_id_text, file_as_name, legal_acreage, block,
// tract_or_lot, situs_num, situs_street_prefx, situs_street, situs_street_sufix, situs_city,
// situs_zip, legal_desc, Volume, Page, Deed_Date …

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../../scripts/derive-portal-tabs.mjs';
import {
  PARCEL_OUT_FIELDS,
  composeSitusAddress,
  pickField,
  readParcelAttributes,
} from '@/lib/research/arcgis-fields';

/** A real row shape from the live layer. */
const BELL_ROW = {
  prop_id: 61334,
  file_as_name: 'FOWLER, ALLISON ETVIR MARSHALL',
  situs_num: '1211',
  situs_street: 'SHARON',
  situs_street_sufix: null,
  legal_acreage: 3.33,
  block: null,
  tract_or_lot: '7',
};

describe('the situs address, which Bell CAD stores in three columns', () => {
  it('composes it from the parts', () => {
    expect(composeSitusAddress(BELL_ROW)).toBe('1211 SHARON');
  });

  it('includes prefix and suffix when present', () => {
    expect(composeSitusAddress({
      situs_num: '13520', situs_street_prefx: 'W', situs_street: 'HWY 36', situs_street_sufix: 'RD',
    })).toBe('13520 W HWY 36 RD');
  });

  it('still reads a single-column layer, including the name that caused the bug', () => {
    // SITUS_ADDR is kept as a fallback because a DIFFERENT layer may genuinely have it — there is
    // already a national Esri fallback layer configured. It is Bell's schema that does not.
    expect(composeSitusAddress({ SITUS_ADDR: '400 N Main St' })).toBe('400 N Main St');
    expect(composeSitusAddress({ situs_address: '9 Elm' })).toBe('9 Elm');
  });

  it('prefers the composed parts when a layer somehow has both', () => {
    expect(composeSitusAddress({ situs_num: '1', situs_street: 'A ST', SITUS_ADDR: 'STALE VALUE' }))
      .toBe('1 A ST');
  });

  it('returns null rather than an empty string when there is no address', () => {
    // '' would render as a parcel whose address is nothing, rather than a parcel with no address.
    expect(composeSitusAddress({ prop_id: 1 })).toBeNull();
    expect(composeSitusAddress({ situs_street: '   ' })).toBeNull();
    expect(composeSitusAddress(null)).toBeNull();
  });
});

describe('pickField', () => {
  it('is case-insensitive — the entire point', () => {
    expect(pickField({ PROP_ID: 7 }, ['prop_id'])).toBe(7);
    expect(pickField({ prop_id: 7 }, ['PROP_ID'])).toBe(7);
  });

  it('treats blank as absent and falls through', () => {
    expect(pickField({ a: '   ', b: 'real' }, ['a', 'b'])).toBe('real');
    expect(pickField({ a: null, b: 0 }, ['a', 'b'])).toBe(0); // 0 is a value, not absence
  });

  it('returns undefined when nothing matches', () => {
    expect(pickField({ x: 1 }, ['y', 'z'])).toBeUndefined();
    expect(pickField(undefined, ['y'])).toBeUndefined();
  });
});

describe('readParcelAttributes on a real row', () => {
  it('maps every field the services consume', () => {
    expect(readParcelAttributes(BELL_ROW)).toEqual({
      prop_id: 61334,
      owner: 'FOWLER, ALLISON ETVIR MARSHALL',
      address: '1211 SHARON',
      lot: '7',
      block: null,
      acreage: 3.33,
    });
  });

  it('survives a row with nothing in it', () => {
    // The fallback layer's schema is unknown; a row it cannot read must not throw mid-run.
    expect(readParcelAttributes({})).toEqual({
      prop_id: 0, owner: null, address: null, lot: null, block: null, acreage: null,
    });
  });

  it('does not report a non-numeric acreage as NaN', () => {
    // NaN would serialise to null in JSON anyway, but arrive as NaN in any arithmetic first.
    expect(readParcelAttributes({ legal_acreage: 'not a number' }).acreage).toBeNull();
  });
});

describe('the callers ask for every field, not a list that can 400', () => {
  const ROOT = process.cwd();
  const CALLERS = [
    'lib/research/parcel-map-capture.service.ts',
    'lib/research/progressive-zoom.service.ts',
    'lib/research/gis-progressive-zoom.service.ts',
  ];
  const read = (p: string) => stripComments(fs.readFileSync(path.join(ROOT, p), 'utf8'));

  it('uses the shared constant', () => {
    expect(PARCEL_OUT_FIELDS).toBe('*');
    for (const f of CALLERS) {
      expect(read(f), `${f} must send PARCEL_OUT_FIELDS`).toContain('outFields: PARCEL_OUT_FIELDS');
    }
  });

  it('no caller still names SITUS_ADDR in executable code', () => {
    // Comments are stripped: all three now EXPLAIN the bug at length, and a raw scan would read the
    // explanation as the offence. That mistake has been made three times on this codebase.
    const offenders = CALLERS.filter((f) => read(f).includes('SITUS_ADDR'));
    expect(offenders, `still naming a column the layer does not have:\n  ${offenders.join('\n  ')}`)
      .toEqual([]);
  });

  it('reads attributes through the shared helper', () => {
    for (const f of CALLERS) expect(read(f)).toContain('readParcelAttributes(');
  });

  it('bounds the query now that it can actually return rows', () => {
    for (const f of CALLERS) expect(read(f)).toMatch(/resultRecordCount:\s*'\d+'/);
  });
});
