// __tests__/cad/operations/offset-metadata.test.ts
//
// Slice 3 of cad-offset-tool-2026-05-29.md. Locks the read/write/
// validate contract for the offset metadata that lives in
// Feature.properties.

import { describe, it, expect } from 'vitest';
import type { Feature } from '@/lib/cad/types';
import {
  OFFSET_PROPS,
  getOffsetMetadata,
  isOffsetFeature,
  stampOffsetMetadata,
  type OffsetMetadata,
} from '@/lib/cad/operations/offset-metadata';

function plainLine(properties: Feature['properties'] = {}): Feature {
  return {
    id: 'feat-1',
    type: 'LINE',
    geometry: {
      type: 'LINE',
      start: { x: 0, y: 0 },
      end:   { x: 10, y: 0 },
    },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties,
  };
}

const SAMPLE_META: OffsetMetadata = {
  sourceId: 'src-1',
  distance: 12.5,
  unit: 'FT',
  side: 'LEFT',
  cornerHandling: 'MITER',
};

describe('OFFSET_PROPS — stable key names', () => {
  it('uses the documented camelCase keys', () => {
    expect(OFFSET_PROPS.sourceId).toBe('offsetSourceId');
    expect(OFFSET_PROPS.distance).toBe('offsetDistance');
    expect(OFFSET_PROPS.unit).toBe('offsetUnit');
    expect(OFFSET_PROPS.side).toBe('offsetSide');
    expect(OFFSET_PROPS.cornerHandling).toBe('offsetCornerHandling');
  });
});

describe('stampOffsetMetadata', () => {
  it('writes all 5 fields into properties', () => {
    const out = stampOffsetMetadata(plainLine(), SAMPLE_META);
    expect(out.properties[OFFSET_PROPS.sourceId]).toBe('src-1');
    expect(out.properties[OFFSET_PROPS.distance]).toBe(12.5);
    expect(out.properties[OFFSET_PROPS.unit]).toBe('FT');
    expect(out.properties[OFFSET_PROPS.side]).toBe('LEFT');
    expect(out.properties[OFFSET_PROPS.cornerHandling]).toBe('MITER');
  });

  it('preserves existing properties (merge, no overwrite)', () => {
    const out = stampOffsetMetadata(plainLine({ label: 'east boundary' }), SAMPLE_META);
    expect(out.properties.label).toBe('east boundary');
    expect(out.properties[OFFSET_PROPS.sourceId]).toBe('src-1');
  });

  it('does not mutate the input feature', () => {
    const input = plainLine({ label: 'before' });
    stampOffsetMetadata(input, SAMPLE_META);
    expect(input.properties).toEqual({ label: 'before' });
  });
});

describe('getOffsetMetadata — happy path', () => {
  it('round-trips through stampOffsetMetadata', () => {
    const stamped = stampOffsetMetadata(plainLine(), SAMPLE_META);
    expect(getOffsetMetadata(stamped)).toEqual(SAMPLE_META);
  });

  it('every LinearUnit is accepted', () => {
    for (const unit of ['FT', 'IN', 'MILE', 'M', 'CM', 'MM'] as const) {
      const stamped = stampOffsetMetadata(plainLine(), { ...SAMPLE_META, unit });
      expect(getOffsetMetadata(stamped)?.unit).toBe(unit);
    }
  });
});

describe('getOffsetMetadata — validation rejections', () => {
  it('returns null on a plain feature (no offset props)', () => {
    expect(getOffsetMetadata(plainLine())).toBeNull();
  });

  it('returns null when sourceId is missing', () => {
    expect(getOffsetMetadata(plainLine({
      [OFFSET_PROPS.distance]: 12.5,
      [OFFSET_PROPS.unit]: 'FT',
      [OFFSET_PROPS.side]: 'LEFT',
      [OFFSET_PROPS.cornerHandling]: 'MITER',
    }))).toBeNull();
  });

  it('returns null when sourceId is the empty string', () => {
    expect(getOffsetMetadata(plainLine({
      [OFFSET_PROPS.sourceId]: '',
      [OFFSET_PROPS.distance]: 12.5,
      [OFFSET_PROPS.unit]: 'FT',
      [OFFSET_PROPS.side]: 'LEFT',
      [OFFSET_PROPS.cornerHandling]: 'MITER',
    }))).toBeNull();
  });

  it('returns null when distance is zero or negative', () => {
    for (const d of [0, -1, -0.0001]) {
      expect(getOffsetMetadata(plainLine({
        [OFFSET_PROPS.sourceId]: 'src-1',
        [OFFSET_PROPS.distance]: d,
        [OFFSET_PROPS.unit]: 'FT',
        [OFFSET_PROPS.side]: 'LEFT',
        [OFFSET_PROPS.cornerHandling]: 'MITER',
      }))).toBeNull();
    }
  });

  it('returns null when unit is not a known LinearUnit', () => {
    expect(getOffsetMetadata(plainLine({
      [OFFSET_PROPS.sourceId]: 'src-1',
      [OFFSET_PROPS.distance]: 12.5,
      [OFFSET_PROPS.unit]: 'YARDS',
      [OFFSET_PROPS.side]: 'LEFT',
      [OFFSET_PROPS.cornerHandling]: 'MITER',
    }))).toBeNull();
  });

  it('returns null when side is invalid', () => {
    expect(getOffsetMetadata(plainLine({
      [OFFSET_PROPS.sourceId]: 'src-1',
      [OFFSET_PROPS.distance]: 12.5,
      [OFFSET_PROPS.unit]: 'FT',
      [OFFSET_PROPS.side]: 'BOTH',
      [OFFSET_PROPS.cornerHandling]: 'MITER',
    }))).toBeNull();
  });

  it('returns null when cornerHandling is invalid', () => {
    expect(getOffsetMetadata(plainLine({
      [OFFSET_PROPS.sourceId]: 'src-1',
      [OFFSET_PROPS.distance]: 12.5,
      [OFFSET_PROPS.unit]: 'FT',
      [OFFSET_PROPS.side]: 'LEFT',
      [OFFSET_PROPS.cornerHandling]: 'BEVEL',
    }))).toBeNull();
  });
});

describe('isOffsetFeature', () => {
  it('true for a stamped offset feature', () => {
    expect(isOffsetFeature(stampOffsetMetadata(plainLine(), SAMPLE_META))).toBe(true);
  });

  it('false for a plain feature', () => {
    expect(isOffsetFeature(plainLine())).toBe(false);
  });

  it('false for a feature with partial metadata', () => {
    expect(isOffsetFeature(plainLine({
      [OFFSET_PROPS.sourceId]: 'src-1',
      [OFFSET_PROPS.distance]: 12.5,
      // missing unit/side/corner
    }))).toBe(false);
  });
});
