// __tests__/cad/operations/describe-offset-section.test.ts
//
// Slice 4 of cad-offset-tool-2026-05-29.md. Locks the descriptor
// shape the PropertyPanel reads to render its "Offset Source" section.

import { describe, it, expect } from 'vitest';
import type { Feature } from '@/lib/cad/types';
import { stampOffsetMetadata, type OffsetMetadata } from '@/lib/cad/operations/offset-metadata';
import { describeOffsetSection } from '@/lib/cad/operations/describe-offset-section';

function lineFeature(id: string, properties: Feature['properties'] = {}): Feature {
  return {
    id,
    type: 'LINE',
    geometry: { type: 'LINE', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties,
  };
}

function polylineFeature(id: string): Feature {
  return {
    id,
    type: 'POLYLINE',
    geometry: { type: 'POLYLINE', vertices: [{ x: 0, y: 0 }, { x: 5, y: 5 }] },
    layerId: 'layer-0',
    style: { color: '#fff', lineWeight: 1, opacity: 1 } as Feature['style'],
    properties: {},
  };
}

const META: OffsetMetadata = {
  sourceId: 'src-12345678abcd',
  distance: 7.5,
  unit: 'FT',
  side: 'LEFT',
  cornerHandling: 'MITER',
};

describe('describeOffsetSection — selection guard', () => {
  it('returns null when the feature carries no offset metadata', () => {
    const plain = lineFeature('feat-a');
    expect(describeOffsetSection(plain, () => undefined)).toBeNull();
  });

  it('returns null when the metadata is partially present (invalid)', () => {
    const broken = lineFeature('feat-a', { offsetSourceId: 'src-1' });
    expect(describeOffsetSection(broken, () => undefined)).toBeNull();
  });
});

describe('describeOffsetSection — happy path', () => {
  it('returns the metadata + source label when the source exists', () => {
    const offset = stampOffsetMetadata(lineFeature('feat-a'), META);
    const source = lineFeature('src-12345678abcd');
    const result = describeOffsetSection(offset, (id) =>
      id === source.id ? source : undefined,
    );
    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual(META);
    expect(result!.sourceMissing).toBe(false);
    expect(result!.sourceLabel).toBe('LINE · src-1234');
  });

  it('builds the label from the source feature type, not the offset feature type', () => {
    const offset = stampOffsetMetadata(lineFeature('feat-a'), META);
    const source = polylineFeature('src-12345678abcd');
    const result = describeOffsetSection(offset, () => source);
    expect(result!.sourceLabel).toBe('POLYLINE · src-1234');
  });

  it('shortens long source ids to 8 chars in the label', () => {
    const longId = 'a'.repeat(40);
    const offset = stampOffsetMetadata(lineFeature('feat-a'), { ...META, sourceId: longId });
    const result = describeOffsetSection(offset, () => lineFeature(longId));
    expect(result!.sourceLabel).toBe(`LINE · ${'a'.repeat(8)}`);
  });

  it('uses the raw id when it is shorter than 8 chars', () => {
    const offset = stampOffsetMetadata(lineFeature('feat-a'), { ...META, sourceId: 'src-1' });
    const result = describeOffsetSection(offset, () => lineFeature('src-1'));
    expect(result!.sourceLabel).toBe('LINE · src-1');
  });

  it('preserves all metadata fields verbatim — distance, unit, side, corner', () => {
    const meta: OffsetMetadata = {
      sourceId: 'src-12345678abcd',
      distance: 3.81,
      unit: 'M',
      side: 'RIGHT',
      cornerHandling: 'ROUND',
    };
    const offset = stampOffsetMetadata(lineFeature('feat-a'), meta);
    const source = lineFeature('src-12345678abcd');
    const result = describeOffsetSection(offset, () => source);
    expect(result!.metadata).toEqual(meta);
  });
});

describe('describeOffsetSection — stale link (source deleted)', () => {
  it('flags sourceMissing=true when the lookup returns undefined', () => {
    const offset = stampOffsetMetadata(lineFeature('feat-a'), META);
    const result = describeOffsetSection(offset, () => undefined);
    expect(result).not.toBeNull();
    expect(result!.sourceMissing).toBe(true);
  });

  it('builds a "(deleted)" label that still surfaces the short id', () => {
    const offset = stampOffsetMetadata(lineFeature('feat-a'), META);
    const result = describeOffsetSection(offset, () => undefined);
    expect(result!.sourceLabel).toBe('(deleted) · src-1234');
  });

  it('keeps the metadata available so the user can still see what was typed', () => {
    const offset = stampOffsetMetadata(lineFeature('feat-a'), META);
    const result = describeOffsetSection(offset, () => undefined);
    expect(result!.metadata).toEqual(META);
  });
});

describe('describeOffsetSection — purity', () => {
  it('does not call the lookup when the feature has no metadata', () => {
    let calls = 0;
    const lookup = (id: string) => {
      calls += 1;
      return lineFeature(id);
    };
    describeOffsetSection(lineFeature('feat-a'), lookup);
    expect(calls).toBe(0);
  });

  it('calls the lookup exactly once with the source id', () => {
    const calls: string[] = [];
    const lookup = (id: string) => {
      calls.push(id);
      return undefined;
    };
    const offset = stampOffsetMetadata(lineFeature('feat-a'), META);
    describeOffsetSection(offset, lookup);
    expect(calls).toEqual([META.sourceId]);
  });
});
