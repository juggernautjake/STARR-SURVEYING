// A row must never claim to hold a file it does not hold.
//
// ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────────────────────────────
//
// Measured in production on 2026-08-30: of 347 distinct `research_documents.storage_url` values,
// **22 returned HTTP 400**, and every single one was a map image. The planning doc had recorded this
// as "one storage_url returns 400 — probably a casualty, not a bug". It was 22, and it was a bug.
//
// The cause is that `supabaseAdmin.storage.from(bucket).getPublicUrl(path)` BUILDS A STRING. It does
// not ask the bucket whether anything is there. Three of the four services that store research
// artifacts called it unconditionally, after code that explicitly tolerates a failed upload:
//
//     if (uploadError) {
//       console.warn('[MapImage] Storage upload failed:', uploadError.message);
//       // Continue — create the DB record without storage_path
//     }
//     const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
//     ...
//     storage_path: uploadError ? null : storagePath,   // honest
//     storage_url:  urlData?.publicUrl || null,         // NOT honest
//
// The row then says two opposite things at once — `storage_path: null` meaning "not stored" beside
// a `storage_url` meaning "here it is" — and the URL 400s forever. Nothing noticed, because a
// warning was logged and the insert went ahead regardless. That is this codebase's recurring shape:
// an unknown, or in this case a known failure, rendered as an answer.
//
// ── WHY A SOURCE TEST ────────────────────────────────────────────────────────────────────────────
//
// The honest test would insert a row with a failing upload and assert the column. That needs a live
// Supabase and a way to make an upload fail on demand, which is a fixture nobody will maintain. The
// invariant is structural and cheap to state: in every service that writes `storage_url`, the URL
// must be gated on the upload having succeeded. `browser-scrape.service.ts` already did this
// correctly with `if (!uploadError)`, so the correct pattern was in the repo the whole time — which
// is exactly why a guard is worth more than a fix: the next service will be written by someone
// reading one of the three that were wrong.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readRaw = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Source with comments removed.
 *
 * NOT optional, and this guard proved it on itself. The first version scanned raw source, and the
 * fix it was written to protect contains an explanatory comment quoting `if (!uploadError)` — so
 * reverting map-image.service.ts to the broken form still passed, because the regex matched the
 * PROSE describing the correct pattern instead of code implementing it. A guard that reads its own
 * documentation as evidence will certify anything that talks about being correct.
 *
 * Line comments before block comments, for the reason recorded in `scripts/derive-portal-tabs.mjs`.
 */
const read = (p: string) => readRaw(p)
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every service that inserts a research_documents row carrying a storage_url. */
const SERVICES = [
  'lib/research/map-image.service.ts',
  'lib/research/parcel-map-capture.service.ts',
  'lib/research/progressive-zoom.service.ts',
  'lib/research/browser-scrape.service.ts',
];

describe('storage_url is only recorded when the file was actually stored', () => {
  it('finds the services it means to guard — a wrong path would pass everything', () => {
    // Control. If a file is renamed and this list silently stops matching, every assertion below
    // becomes vacuous, so the existence check is the first thing asserted.
    for (const f of SERVICES) {
      expect(fs.existsSync(path.join(ROOT, f)), `${f} is missing — update this guard`).toBe(true);
    }
  });

  it('every getPublicUrl call is gated on the upload having succeeded', () => {
    const offenders: string[] = [];

    for (const f of SERVICES) {
      const src = read(f);
      if (!src.includes('getPublicUrl')) continue;

      // Two acceptable shapes:
      //   `uploadError ? { data: null } : ...getPublicUrl(...)`   — the ternary guard
      //   `if (!uploadError) { ...getPublicUrl(...) }`            — browser-scrape's original
      const ternaryGuarded = /uploadError\s*\n?\s*\?\s*\{\s*data:\s*null\s*\}/.test(src);
      const blockGuarded = /if\s*\(\s*!uploadError\s*\)/.test(src);

      if (!ternaryGuarded && !blockGuarded) offenders.push(f);
    }

    expect(
      offenders,
      'These services build a public URL without checking that the upload succeeded. '
        + 'getPublicUrl does not verify the object exists, so the row will advertise a file that '
        + `is not there and the URL will 400:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no service records storage_url unconditionally beside a nulled storage_path', () => {
    // The precise inconsistency that produced the 22 rows: one column tells the truth about the
    // upload and the one beside it does not.
    const offenders: string[] = [];

    for (const f of SERVICES) {
      const src = read(f);
      const nullsThePath = /storage_path:\s*uploadError\s*\?\s*null/.test(src);
      const urlFromRawData = /storage_url:\s*urlData\?\.publicUrl/.test(src);
      // Fine only when urlData itself is already gated (checked above); flag the combination where
      // the path is conditional and nothing anywhere guards the URL.
      const guarded = /uploadError\s*\n?\s*\?\s*\{\s*data:\s*null\s*\}/.test(src)
        || /if\s*\(\s*!uploadError\s*\)/.test(src);

      if (nullsThePath && urlFromRawData && !guarded) offenders.push(f);
    }

    expect(offenders, `storage_path is nulled on upload failure but storage_url is not:\n  ${offenders.join('\n  ')}`)
      .toEqual([]);
  });

  it('browser-scrape still uses the shape the others were corrected to match', () => {
    // It was right before this fix and is the reference. If somebody "simplifies" it, the guard
    // above would still pass on the other three while the reference implementation rots.
    expect(read('lib/research/browser-scrape.service.ts')).toMatch(/if\s*\(\s*!uploadError\s*\)/);
  });
});
