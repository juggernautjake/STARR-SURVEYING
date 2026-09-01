// __tests__/branding/uploads.test.ts
//
// ── THE PURE HALF OF THE UPLOAD PATH ────────────────────────────────────────────────────────────
//
// The whole path was exercised once, on 2026-09-01, against the live database and bucket: create an
// asset, generate a variant, read it back through the same functions the routes use, then delete it
// and prove the deletion. 39 checks, all green, and the database left at 0 rows and 0 objects.
//
// That run is not repeatable in CI and should not be — a check that writes to production every time
// somebody pushes is not a check, it is a liability. What IS repeatable is everything in
// `lib/branding/uploads.ts`, which is pure by design so that the form, the route and this file can
// all read the same rules. The live run's findings that live here are the constraint boundaries:
// which colours are real, which kinds exist, and the size ladder that must never offer an upscale.
//
// ── WHAT THE LIVE RUN PROVED THAT THIS CANNOT ───────────────────────────────────────────────────
//
// Recorded so nobody mistakes this file for the whole story: the bucket accepts a PNG; the two
// unique indexes really do refuse a second original and a case-insensitively duplicate label; the
// status CHECK constraint really does refuse an invented status; `ON DELETE CASCADE` really does
// take the variants; and `toAsset` does not leak `storage_path` into what reaches the browser.
// Those are database facts and only the database can answer them.

import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_MIME, ACCEPT_ATTRIBUTE, BRAND_UPLOAD_MAX_BYTES, isResizable,
  VARIANT_SIZES, offeredSizes, validateProfile, fontChoices, CUSTOM_LETTERING,
  slugify, uploadedAssetUrl, humanBytes,
  UPLOAD_KINDS, UPLOAD_PLATES, UPLOAD_STATUSES, isUploadKind, isUploadPlate, isUploadStatus,
} from '@/lib/branding/uploads';
import { BRAND_COLOURS, BRAND_FONTS } from '@/lib/branding/palette';

describe('what the browser may send', () => {
  it('the accept attribute is derived from the MIME map, not typed beside it', () => {
    // Two lists is how a form offers a type the route rejects.
    expect(ACCEPT_ATTRIBUTE.split(',').sort()).toEqual(Object.keys(ACCEPTED_MIME).sort());
  });

  it('every accepted MIME has an extension, and none is empty', () => {
    for (const [mime, ext] of Object.entries(ACCEPTED_MIME)) {
      expect(mime, 'a MIME key that is not a MIME type').toContain('/');
      expect(ext.length, `${mime} maps to an empty extension`).toBeGreaterThan(1);
    }
  });

  it('the client cap is at or below the bucket limit, never above', () => {
    // seeds/622 sets the bucket to 25 MB. A client cap ABOVE the server's is the one that wastes
    // somebody's whole upload before failing; below only ever refuses early.
    expect(BRAND_UPLOAD_MAX_BYTES).toBeLessThanOrEqual(25 * 1024 * 1024);
  });

  it('only the raster types are resizable', () => {
    for (const m of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(isResizable(m), `${m} should be resizable`).toBe(true);
    }
    // Verified against sharp in the live run: these are stored and served, never resized.
    for (const m of ['image/svg+xml', 'application/pdf', 'text/plain', '']) {
      expect(isResizable(m), `${m} must not be sent to sharp`).toBe(false);
    }
  });

  it('every resizable type is one the upload accepts', () => {
    for (const mime of Object.keys(ACCEPTED_MIME)) {
      if (!isResizable(mime)) continue;
      expect(ACCEPTED_MIME[mime]).toBeTruthy();
    }
  });
});

describe('the size ladder never offers an upscale', () => {
  it('a 1400px original is offered nothing above 1400', () => {
    // The live run measured exactly this: [1024, 512, 256, 128, 64].
    const widths = offeredSizes(1400)!.map((s) => s.width);
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every((w) => w <= 1400)).toBe(true);
    expect(widths).toEqual([1024, 512, 256, 128, 64]);
  });

  it('a small original is offered very little', () => {
    expect(offeredSizes(200)!.map((s) => s.width)).toEqual([128, 64]);
  });

  it('control: the ladder DOES contain rungs above 1400, so the filter is doing work', () => {
    // Without this the assertion above passes on a ladder whose largest rung is 1024.
    expect(VARIANT_SIZES.some((s) => s.width > 1400)).toBe(true);
    expect(VARIANT_SIZES.map((s) => s.width)).toContain(4096);
  });

  it('an unknown width offers nothing at all, rather than the whole ladder', () => {
    // SVG and PDF have no pixel size. Offering "4096px" for an SVG is offering a raster of a vector.
    expect(offeredSizes(null)).toBeNull();
    expect(offeredSizes(undefined)).toBeNull();
    expect(offeredSizes(0)).toBeNull();
    expect(offeredSizes(NaN)).toBeNull();
    expect(offeredSizes(-100)).toBeNull();
  });

  it('the ladder is ordered largest first and every rung says what it is for', () => {
    const widths = VARIANT_SIZES.map((s) => s.width);
    expect([...widths].sort((a, b) => b - a)).toEqual(widths);
    for (const s of VARIANT_SIZES) {
      expect(s.use.length, `${s.label} has no reason attached`).toBeGreaterThan(10);
      expect(s.label).toContain(String(s.width));
    }
  });
});

describe('the profile validator, which the ROUTE calls and not only the form', () => {
  const ok = {
    name: 'Star Mark', kind: 'mark', plate: 'white', status: 'approved',
    colours: ['Starr Red'], fonts: [CUSTOM_LETTERING], useCases: ['Shirts'], avoid: ['Anything tiny'],
  };

  it('control: a good profile has no problems, so a failure below means something', () => {
    expect(validateProfile(ok)).toEqual([]);
  });

  it('and the bare minimum — a name and nothing else — is valid', () => {
    // The owner asked for two paths: *"we can just upload the image, or we can fill out all of the
    // … information"*. A validator that requires a description destroys the first one.
    expect(validateProfile({ name: 'Just a photo' })).toEqual([]);
  });

  it('a nameless asset is refused, because it cannot be found again', () => {
    expect(validateProfile({ ...ok, name: '' }).map((p) => p.field)).toContain('name');
    expect(validateProfile({ ...ok, name: '   ' }).map((p) => p.field)).toContain('name');
  });

  it('a colour that is not in the palette is refused', () => {
    // The load-bearing check. An unresolvable name renders as a chip with a blank swatch — a
    // confident wrong answer to "what red is in this?".
    const problems = validateProfile({ ...ok, colours: ['Racing Green'] });
    expect(problems.map((p) => p.field)).toContain('colours');
    expect(problems[0]!.message).toContain('Racing Green');
  });

  it('and every real palette name is accepted', () => {
    // The other direction: a validator that refuses everything also "refuses invalid input".
    expect(validateProfile({ ...ok, colours: BRAND_COLOURS.map((c) => c.name) })).toEqual([]);
  });

  it('an invented kind, plate or status is refused', () => {
    expect(validateProfile({ ...ok, kind: 'sticker' }).map((p) => p.field)).toContain('kind');
    expect(validateProfile({ ...ok, plate: 'chartreuse' }).map((p) => p.field)).toContain('plate');
    expect(validateProfile({ ...ok, status: 'pending' }).map((p) => p.field)).toContain('status');
  });

  it('and every declared kind, plate and status is accepted', () => {
    for (const k of UPLOAD_KINDS) expect(validateProfile({ ...ok, kind: k.id })).toEqual([]);
    for (const p of UPLOAD_PLATES) expect(validateProfile({ ...ok, plate: p.id })).toEqual([]);
    for (const s of UPLOAD_STATUSES) expect(validateProfile({ ...ok, status: s })).toEqual([]);
  });

  it('the type list is loose, because most marks are custom lettering', () => {
    // Naming a font a mark was never set in sends a designer looking for a match that does not
    // exist. Free text is the honest answer and must be allowed.
    expect(validateProfile({ ...ok, fonts: ['closest match for rebuilds: Oswald Bold'] })).toEqual([]);
    expect(validateProfile({ ...ok, fonts: ['   '] }).map((p) => p.field)).toContain('fonts');
  });

  it('a blank line in a list is a problem, in both lists', () => {
    expect(validateProfile({ ...ok, useCases: ['Shirts', ' '] }).map((p) => p.field)).toContain('useCases');
    expect(validateProfile({ ...ok, avoid: [''] }).map((p) => p.field)).toContain('avoid');
  });

  it('the caption is capped at the length one card line can hold', () => {
    expect(validateProfile({ ...ok, note: 'x'.repeat(301) }).map((p) => p.field)).toContain('note');
    expect(validateProfile({ ...ok, note: 'x'.repeat(300) })).toEqual([]);
  });

  it('and the description at 4000', () => {
    expect(validateProfile({ ...ok, description: 'x'.repeat(4001) }).map((p) => p.field)).toContain('description');
    expect(validateProfile({ ...ok, description: 'x'.repeat(4000) })).toEqual([]);
  });

  it('every problem carries a sentence, not a code', () => {
    const problems = validateProfile({ name: '', kind: 'nope', colours: ['nope'] });
    expect(problems.length).toBeGreaterThan(2);
    for (const p of problems) {
      expect(p.message.length, `${p.field} has no readable message`).toBeGreaterThan(15);
      expect(p.field).toBeTruthy();
    }
  });
});

describe('the type guards agree with the lists they guard', () => {
  it('each accepts exactly its own members', () => {
    for (const k of UPLOAD_KINDS) expect(isUploadKind(k.id)).toBe(true);
    for (const p of UPLOAD_PLATES) expect(isUploadPlate(p.id)).toBe(true);
    for (const s of UPLOAD_STATUSES) expect(isUploadStatus(s)).toBe(true);
  });

  it('and rejects everything else, including the shapes a form can actually send', () => {
    for (const guard of [isUploadKind, isUploadPlate, isUploadStatus]) {
      expect(guard(undefined)).toBe(false);
      expect(guard(null)).toBe(false);
      expect(guard('')).toBe(false);
      expect(guard(42)).toBe(false);
      expect(guard({})).toBe(false);
    }
  });
});

describe('the font picker offers the honest non-answer first', () => {
  it('custom lettering leads, because it is the true answer for most of this library', () => {
    expect(fontChoices()[0]).toBe(CUSTOM_LETTERING);
  });

  it('and every one of the faces follows', () => {
    expect(fontChoices().slice(1)).toEqual(BRAND_FONTS.map((f) => f.name));
    expect(fontChoices().length).toBe(BRAND_FONTS.length + 1);
  });
});

describe('slugs', () => {
  it('are lower-case, hyphenated and url-safe', () => {
    expect(slugify('Star Mark')).toBe('star-mark');
    expect(slugify('  Roundel — Red Field  ')).toBe('roundel-red-field');
    expect(slugify('“Starr” Wordmark')).toBe('starr-wordmark');
  });

  it('strip accents rather than dropping the letter', () => {
    expect(slugify('Café Sign')).toBe('cafe-sign');
  });

  it('never come back empty, which would collide with every other empty one', () => {
    expect(slugify('!!!')).toBe('asset');
    expect(slugify('')).toBe('asset');
    expect(slugify('   ')).toBe('asset');
  });

  it('are bounded, so a pasted paragraph does not become a 900-character key', () => {
    expect(slugify('word '.repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it('contain nothing that needs escaping in a URL', () => {
    for (const name of ['A/B test', 'x?y=1', '100% Navy', 'a b\tc\nd']) {
      const s = slugify(name);
      expect(encodeURIComponent(s), `${name} → ${s} is not URL-safe as-is`).toBe(s);
    }
  });
});

describe('the asset URL builder', () => {
  it('addresses the file route, with the variant as a query parameter', () => {
    expect(uploadedAssetUrl('abc')).toBe('/api/admin/branding/assets/abc/file');
    expect(uploadedAssetUrl('abc', 'v1')).toBe('/api/admin/branding/assets/abc/file?variant=v1');
  });

  it('encodes both parts, so an id can never break out of the path', () => {
    expect(uploadedAssetUrl('a/b')).toBe('/api/admin/branding/assets/a%2Fb/file');
    expect(uploadedAssetUrl('a', 'x&y')).toContain('variant=x%26y');
  });
});

describe('humanBytes', () => {
  it('reads as the number somebody is deciding on', () => {
    expect(humanBytes(512)).toBe('512 B');
    expect(humanBytes(2048)).toBe('2 KB');
    expect(humanBytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
    expect(humanBytes(40 * 1024 * 1024)).toBe('40 MB');
  });

  it('says nothing rather than "0 B" when there is no number', () => {
    // A variant row with an unknown size showing "0 B" claims the file is empty.
    expect(humanBytes(null)).toBe('—');
    expect(humanBytes(undefined)).toBe('—');
    expect(humanBytes(0)).toBe('—');
    expect(humanBytes(NaN)).toBe('—');
  });
});
