// __tests__/cad/persistence/autosave-summary.test.ts — summarizeDocument tallies
// layer/feature counts for the crash-recovery prompts (tolerant of bad shapes).
import { describe, it, expect } from 'vitest';
import { summarizeDocument } from '@/lib/cad/persistence/autosave';

describe('summarizeDocument', () => {
  it('counts layers and features from a normal document', () => {
    const doc = {
      id: 'd1',
      name: 'Boundary',
      layers: { a: {}, b: {}, c: {} },
      features: { f1: {}, f2: {} },
    };
    expect(summarizeDocument(doc)).toEqual({ layers: 3, features: 2 });
  });

  it('returns zeros for an empty document', () => {
    expect(summarizeDocument({ layers: {}, features: {} })).toEqual({
      layers: 0,
      features: 0,
    });
  });

  it('tolerates missing layers/features keys', () => {
    expect(summarizeDocument({ name: 'x' })).toEqual({ layers: 0, features: 0 });
  });

  it('tolerates null / non-object input', () => {
    expect(summarizeDocument(null)).toEqual({ layers: 0, features: 0 });
    expect(summarizeDocument(undefined)).toEqual({ layers: 0, features: 0 });
    expect(summarizeDocument('nope')).toEqual({ layers: 0, features: 0 });
    expect(summarizeDocument(42)).toEqual({ layers: 0, features: 0 });
  });

  it('ignores non-object layers/features values', () => {
    expect(
      summarizeDocument({ layers: 'bad', features: ['x'] }),
    ).toEqual({ layers: 0, features: 1 });
  });
});
