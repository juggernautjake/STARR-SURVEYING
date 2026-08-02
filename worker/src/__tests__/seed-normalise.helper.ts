// worker/src/__tests__/seed-normalise.helper.ts — read a seed file for assertions about its CONTENT.
//
// Seed files wrap their prose in `--` comments and their constraints across lines to stay inside a
// column limit. A test that matches the raw text is therefore asserting the line width, and it
// breaks the next time somebody reflows a paragraph — which teaches people that the test is noise.
//
// This joins continuation comment lines and collapses whitespace, so an assertion is about what the
// seed SAYS rather than where it happened to wrap.

import fs from 'node:fs';
import path from 'node:path';

export function readSeedNormalised(seedFile: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), '..', 'seeds', seedFile), 'utf8');
  return raw
    .replace(/\r?\n--/g, ' ')
    .replace(/\s+/g, ' ');
}
