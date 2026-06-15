// __tests__/field-data/mobile-point-name-capture.test.ts
//
// mobile-and-customer-query-gap Slice D1b — the mobile field-media
// capture flow has to write `point_name` for the office-side
// reconcile helper (D1) to ever fire. This test source-locks the
// mobile changes WITHOUT importing the React-native runtime — we
// can't `vi.mock` PowerSync from node, so we lock by source.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('mobile/lib/db/schema.ts — D1b column declaration', () => {
  const SRC = read('mobile/lib/db/schema.ts');

  it('declares the point_name column on the field_media local table', () => {
    // Lock both the column add AND the position: it must land BEFORE
    // media_type so the column-order conventions stay readable.
    expect(SRC).toMatch(
      /const field_media = new Table\(\{[\s\S]*?point_name: column\.text,[\s\S]*?media_type: column\.text/,
    );
  });
});

describe('mobile/lib/fieldMedia.ts — D1b normalization + INSERT', () => {
  const SRC = read('mobile/lib/fieldMedia.ts');

  it('exports the pure `normalizePointName` helper', () => {
    expect(SRC).toMatch(/export function normalizePointName\(/);
  });

  it('takes `pointName` on the AttachPhotoInput surface', () => {
    expect(SRC).toMatch(/pointName\?: string \| null;/);
  });

  it('destructures pointName off the hook input', () => {
    expect(SRC).toMatch(
      /async \(\{ jobId, dataPointId, source, burstGroupId, pointName \}\)/,
    );
  });

  it('runs the input through the normalizer once', () => {
    expect(SRC).toMatch(/const normalizedPointName = normalizePointName\(pointName\);/);
  });

  it('writes point_name into the INSERT column list + value bindings', () => {
    expect(SRC).toMatch(
      /INSERT INTO field_media \(\s*\n\s*id, job_id, data_point_id, point_name, media_type/,
    );
    expect(SRC).toMatch(/normalizedPointName,\s*\n\s*'photo',/);
  });

  it('keeps the legacy "no point_name supplied" path working — every test invocation MUST still be able to omit pointName', () => {
    // We don't actually invoke the hook; we lock the optional `?` so
    // the type stays loose. Re-asserting the optional sigil so a
    // future tightening doesn't break old call sites.
    expect(SRC).toMatch(/pointName\?: string \| null;/);
  });
});

describe('normalizePointName — pure helper (source-string contract)', () => {
  // The test file can't `import` from mobile (react-native deps),
  // so we lock the IMPLEMENTATION shape that the office-side
  // reconcile helper relies on. The actual JS-level test of the
  // function happens via the mobile-side `npm test`.
  const SRC = read('mobile/lib/fieldMedia.ts');

  it('upper-cases the input so case-mismatched point names still reconcile', () => {
    expect(SRC).toMatch(/return v && v\.length > 0 \? v\.toUpperCase\(\) : null;/);
  });

  it('trims whitespace BEFORE the empty check', () => {
    expect(SRC).toMatch(/const v = raw\?\.trim\(\);/);
  });
});
