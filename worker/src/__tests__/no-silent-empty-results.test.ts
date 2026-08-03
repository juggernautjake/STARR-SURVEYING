// A failure must never be returned as an empty result set (plan R39).
//
// This is the defect the whole research plan is about, expressed as a ratchet. It was found three
// separate times in adapters that were already "working":
//
//   Kofile      searchByLegalDescription logged "not supported" and returned [] — across TWENTY
//               counties including Bell, the home county.
//   Kofile      parseSearchResults returned [] when the browser session had died.
//   TexasFile   four search methods swallowed their errors and returned [], and TexasFile is the
//               fallback for 232 counties. Its legal-description search and image retrieval
//               returned [] for "the free tier does not offer this".
//
// In every case a caller receives exactly what it would receive from a property with nothing
// recorded against it. The distinction is invisible at the call site, which is why it has to be
// enforced here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), 'src/adapters', f), 'utf8');

/** Adapters a county can actually be routed to today. */
const ROUTED = [
  'kofile-clerk-adapter.ts',
  'texasfile-adapter.ts',
  'edoctec-clerk-adapter.ts',
  'tyler-eagle-adapter.ts',
  'uslandrecords-adapter.ts',
  'aumentum-clerk-adapter.ts',
  'idocmarket-adapter.ts',
];

/** Strip comments so prose about the old behaviour does not trip the checks. */
const codeOf = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('no routed adapter swallows a failure into an empty result', () => {
  it.each(ROUTED)('%s does not return [] from a catch block', (file) => {
    const code = codeOf(read(file));
    // `} catch (...) { ... return []; }` with nothing but logging in between.
    const hits = code.match(/catch\s*(\([^)]*\))?\s*\{[^{}]*return\s*\[\]\s*;/g) ?? [];
    expect(hits, `${file} swallows an error into an empty array:\n${hits.join('\n')}`).toEqual([]);
  });

  it.each(ROUTED)('%s does not return [] when the page/session is missing', (file) => {
    const code = codeOf(read(file));
    const hits = code.match(/if\s*\(\s*!this\.page\s*\)\s*return\s*\[\]\s*;/g) ?? [];
    expect(hits, `${file} reports a dead session as "no records"`).toEqual([]);
  });
});

describe('the reason is recorded where it was fixed', () => {
  it('Kofile says a legal-description miss is about the text, not the land', () => {
    expect(read('kofile-clerk-adapter.ts')).toContain('NOT that no document touches this land');
  });

  it('Kofile says a dead session is not an empty index', () => {
    expect(read('kofile-clerk-adapter.ts')).toContain('session failure, NOT an empty index');
  });

  it('TexasFile says a failed search is not an empty index', () => {
    // It is the fallback for 232 counties, so this one had the widest reach.
    expect(read('texasfile-adapter.ts')).toContain('This is an error, NOT an empty index');
  });

  it('TexasFile distinguishes an unoffered capability from absent records', () => {
    expect(read('texasfile-adapter.ts')).toContain('A missing capability, NOT an empty index');
  });

  it('TexasFile says a paywalled image is not an absent image', () => {
    expect(read('texasfile-adapter.ts')).toContain('the absence of ACCESS, not the absence of images');
  });
});
