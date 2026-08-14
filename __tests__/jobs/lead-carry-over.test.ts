// __tests__/jobs/lead-carry-over.test.ts — slice J4 of
// docs/planning/completed/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// The rule that decides whether the customer's deed reaches the job, tested without storage.
//
// Its failure mode is the quiet one: a `job_files` row that points at nothing renders as a broken
// download rather than as a missing file, so the crew clicks it, gets an error, and concludes the
// file manager is unreliable — rather than that the attachment was never really there.

import { describe, it, expect } from 'vitest';
import { attachmentsWorthCarrying } from '@/lib/leads/carry-over';

describe('which of a lead’s attachments are worth carrying', () => {
  it('carries an attachment that has bytes behind it', () => {
    const out = attachmentsWorthCarrying([
      { name: 'old-plat.pdf', size: 240_000, storage_path: 'leads/abc/old-plat.pdf' },
    ]);
    expect(out).toEqual([{ name: 'old-plat.pdf', storage_path: 'leads/abc/old-plat.pdf', size: 240_000 }]);
  });

  it('skips a summary row whose bytes were never stored', () => {
    // `lib/leads/intake.ts` writes name+size on the INSERT and patches `storage_path` in a second
    // pass, so a row with no path is an upload that did not finish. Carrying one produces a job
    // file pointing at nothing.
    expect(attachmentsWorthCarrying([{ name: 'deed.pdf', size: 100 }])).toEqual([]);
    expect(attachmentsWorthCarrying([{ name: 'deed.pdf', storage_path: '   ' }])).toEqual([]);
  });

  it('carries a file with no name rather than dropping it', () => {
    // The bytes are the point. A deed with a blank title is still the deed, and the path's basename
    // is a better label than nothing.
    const out = attachmentsWorthCarrying([{ storage_path: 'leads/abc/scan_0012.pdf' }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('scan_0012.pdf');
  });

  it('falls back to a generic name when even the path has no basename', () => {
    const out = attachmentsWorthCarrying([{ storage_path: 'x' }]);
    expect(out[0]!.name).toBe('x');
  });

  it('does not copy the same object twice', () => {
    // The customer attaching the same file twice on the enquiry form is ordinary, and two job_files
    // rows pointing at one object is a file the crew deletes once and finds still listed.
    const out = attachmentsWorthCarrying([
      { name: 'plat.pdf', storage_path: 'leads/abc/plat.pdf' },
      { name: 'plat (1).pdf', storage_path: 'leads/abc/plat.pdf' },
    ]);
    expect(out).toHaveLength(1);
  });

  it('records an unknown size as null rather than as zero', () => {
    // Zero renders as "0 B" next to a 3 MB PDF. Null renders as nothing, which is the truth.
    const out = attachmentsWorthCarrying([{ name: 'a.pdf', storage_path: 'p/a.pdf' }]);
    expect(out[0]!.size).toBeNull();
    const bad = attachmentsWorthCarrying([{ name: 'a.pdf', size: NaN, storage_path: 'p/a.pdf' }]);
    expect(bad[0]!.size).toBeNull();
  });

  it('survives a column that is not an array', () => {
    // `leads.attachments` is JSONB with a `[]` default, but a hand-edited row or an older write path
    // can leave anything in it, and a conversion must not 500 on the customer at the moment they
    // accept.
    for (const junk of [null, undefined, {}, 'nope', 42]) {
      expect(attachmentsWorthCarrying(junk), String(junk)).toEqual([]);
    }
  });

  it('skips the junk entries and keeps the good ones in the same list', () => {
    const out = attachmentsWorthCarrying([
      { name: 'no-bytes.pdf' },
      { name: 'good.pdf', storage_path: 'leads/abc/good.pdf', size: 10 },
      null,
      { storage_path: 'leads/abc/also-good.pdf' },
    ]);
    expect(out.map((a) => a.name)).toEqual(['good.pdf', 'also-good.pdf']);
  });
});
