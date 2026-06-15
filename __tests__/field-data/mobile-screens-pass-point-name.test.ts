// __tests__/field-data/mobile-screens-pass-point-name.test.ts
//
// mobile-and-customer-query-gap Slice D1d — every mobile capture
// screen tied to a `pointId` passes `point.name` through to
// the relevant `useAttachX({ pointName })` hook. Source-locked
// so a future refactor can't quietly drop the prop pass-through
// and re-orphan the data-flow we built in D1 / D1b.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('mobile fieldMedia hooks — D1d input surface (voice + video)', () => {
  const SRC = read('mobile/lib/fieldMedia.ts');

  it('AttachVoiceInput accepts an optional pointName', () => {
    expect(SRC).toMatch(/interface AttachVoiceInput \{[\s\S]*?pointName\?: string \| null;/);
  });

  it('AttachVideoInput accepts an optional pointName', () => {
    expect(SRC).toMatch(/interface AttachVideoInput \{[\s\S]*?pointName\?: string \| null;/);
  });

  it('voice INSERT carries point_name as the 4th column', () => {
    // The voice INSERT lands right after the `'voice'` literal in
    // the values list.
    expect(SRC).toMatch(
      /INSERT INTO field_media \(\s*\n\s*id, job_id, data_point_id, point_name, media_type[\s\S]*?normalizedPointName,\s*\n\s*'voice',/,
    );
  });

  it('video INSERT carries point_name as the 4th column', () => {
    expect(SRC).toMatch(
      /INSERT INTO field_media \(\s*\n\s*id, job_id, data_point_id, point_name, media_type[\s\S]*?normalizedPointName,\s*\n\s*'video',/,
    );
  });

  it('both hooks run pointName through the shared normalizer', () => {
    // Two occurrences inside the file body: one in the voice hook,
    // one in the video hook.
    const matches = SRC.match(/normalizePointName\(pointName\)/g) ?? [];
    // 3 = photo (D1b) + voice + video (this slice).
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe('photos screen — D1d pointName pass-through', () => {
  const SRC = read('mobile/app/(tabs)/capture/[pointId]/photos.tsx');

  it('attachPhoto receives the typed point name', () => {
    expect(SRC).toMatch(/attachPhoto\(\{[\s\S]*?pointName: point\.name \?\? null,/);
  });

  it('attachVideo receives the typed point name', () => {
    expect(SRC).toMatch(/attachVideo\(\{[\s\S]*?pointName: point\.name \?\? null,/);
  });
});

describe('voice screen — D1d pointName pass-through', () => {
  const SRC = read('mobile/app/(tabs)/capture/[pointId]/voice.tsx');

  it('attachVoice receives the typed point name', () => {
    expect(SRC).toMatch(/attachVoice\(\{[\s\S]*?pointName: point\.name \?\? null,/);
  });
});
