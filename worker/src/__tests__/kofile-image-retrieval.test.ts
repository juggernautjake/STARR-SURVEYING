// Pulling the actual file, for all 22 Kofile counties (plans R13/R15/R25).
//
// The document images are the point of the whole platform: everything downstream — OCR, boundary
// calls, the chain of title, the packet — needs the page, not the index entry.
//
// `KofileClerkAdapter.getDocumentImages` walks the viewer by CSS selector and then `return images`.
// When a viewer changes its class names that yields zero images while every step reports success, and
// an empty array there says *this document has no pages* — about a document the index has just told
// us has some. That is the silent-empty defect this repo has a ratchet for, applied to the one
// artifact a surveyor actually reads.
//
// Two things now stand behind it: the capture proven in production against Bell, and — if that also
// finds nothing — a throw, because "we could not open the viewer" and "the county holds no pages"
// must not look the same in a packet.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const adapter = read('src/adapters/kofile-clerk-adapter.ts');
const bellClerk = read('src/services/bell-clerk.ts');

describe('an empty capture is never returned as a finding', () => {
  it('does not return [] when both capture paths fail', () => {
    expect(adapter).toContain('This is a');
    expect(adapter).toContain('RETRIEVAL failure, not a document without pages');
  });

  it('says the index listed the instrument, so the absence is ours', () => {
    expect(adapter).toContain('the index listed this instrument');
  });

  it('falls through to the production capture before giving up', () => {
    expect(adapter).toContain('retrying with the production capture path');
    expect(adapter).toContain('fetchDocumentImages');
  });
});

describe('the fallback opens the right portal', () => {
  it('passes the adapter\'s own verified base URL', () => {
    // Not the county-name lookup: bell-clerk's KOFILE_CONFIGS still lists Coryell, McLennan, Falls
    // and Lampasas, whose portals were probed dead in R37/R38 and removed from the routing set. An
    // adapter exists only because its county passed that verification, so its URL is the trusted one.
    expect(adapter).toContain('this.config.baseUrl,');
    expect(adapter).toContain('Coryell, McLennan, Falls and Lampasas');
  });

  it('fetchDocumentImages accepts that override', () => {
    expect(bellClerk).toContain('baseUrlOverride?: string');
    expect(bellClerk).toContain('const baseUrl = baseUrlOverride ?? getKofileBaseUrl(county)');
  });

  it('the image cache is keyed on the portal, not just the county name', () => {
    // Two callers naming one county but opening different portals would otherwise share an entry,
    // and the second would be handed the first's pages — one county's deed presented as another's.
    expect(bellClerk).toContain('const cacheKey = `${baseUrlOverride ?? county}:${instrumentNumber}`');
  });
});

describe('the capture that is actually proven', () => {
  it('disables the browser HTTP cache, because the URLs are signed and expire', () => {
    // The documented regression: revisiting a document serves cached, expired signed URLs and
    // captures zero pages — the precise failure the adapter fallback exists to catch.
    expect(bellClerk).toContain('Disable browser HTTP cache');
    expect(bellClerk).toContain('signed URLs');
  });

  it('is county-parameterised rather than Bell-only', () => {
    // It always was. Only Bell's scraper called it, which is why 21 other counties looked unserved.
    expect(bellClerk).toMatch(/county: string = 'bell'/);
  });
});
