// __tests__/media/receipt-upload-normalises.test.ts
//
// The web receipt upload used to derive its extension from `file.type` and store the bytes untouched,
// so an iPhone receipt landed in the bucket as `.heic` — unreadable by the bookkeeper on Windows and
// by much of the tooling downstream.
//
// This guards the fix at the route level. The conversion itself is covered by image-format.test.ts;
// what is asserted here is that this route USES it, and that the two things most likely to be
// "simplified" later — deciding from bytes rather than the header, and letting PDFs through — stay put.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs
  .readFileSync(path.join(process.cwd(), 'app', 'api', 'admin', 'receipts', 'upload', 'route.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

/** The header explains the old bug at length and would satisfy a naive match on its own. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

describe('the web receipt upload cannot store a HEIC', () => {
  it('runs uploads through the normaliser', () => {
    expect(CODE).toMatch(/normaliseImage\(/);
  });

  it('takes the extension from the normaliser, not from the MIME type', () => {
    // iOS reports a HEIC as image/jpeg when "Most Compatible" is half configured, and browsers that
    // do not know the format send application/octet-stream. Trusting the header stores a HEIC under
    // a .jpg name — worse than an honest .heic, because the file then lies about itself.
    expect(CODE).toMatch(/ext\s*=\s*norm\.extension/);
    expect(CODE).toMatch(/contentType\s*=\s*norm\.contentType/);
  });

  it('still accepts a PDF receipt untouched', () => {
    // A scanned receipt is a legitimate PDF and is not an image problem. Sending it to an image
    // converter would reject a perfectly good receipt.
    expect(CODE).toMatch(/isPdf/);
    expect(CODE).toMatch(/0x25.*0x50.*0x44.*0x46/);
  });

  it('refuses an unreadable file rather than storing it', () => {
    // Storing something nobody can open later is the failure this whole change exists to prevent.
    expect(CODE).toMatch(/UnsupportedImageError/);
    expect(CODE).toMatch(/status:\s*415/);
  });

  it('tells the caller when a conversion happened', () => {
    // Somebody who uploads IMG_0042.HEIC and finds a .jpg later should have been told.
    expect(CODE).toMatch(/converted/);
  });
});
