// worker/src/__tests__/direct-viewer-navigation.test.ts
//
// From the owner's 2026-08-30 run, the same document identified twice:
//
//     [ownerSearch] Doc 2004032468: real URL from search = https://…/doc/98732828
//     Search+click: searching for instrument 2004032468        ← ~10s to re-derive it
//     Search: internal docId=98732828                           ← the same id, again
//
// Eleven documents, ~10s each. `fetchDocumentImages` now takes the viewer URL when the caller
// already read one, and navigates straight there.
//
// ── THE THING THIS GUARDS IS NOT THE SPEED-UP ───────────────────────────────────────────────────
//
// It is the correctness constraint that makes the speed-up safe. Tyler's `/doc/` takes an INTERNAL
// document id (98732828), not the instrument number (2004032468) — the existing comment in
// bell-clerk.ts says so, and it is why search+click exists at all. In clerk-scraper.ts:
//
//     const realDocUrl = docRef.url ?? BELL_ENDPOINTS.clerk.document(instrumentNumber);
//
// `realDocUrl` therefore silently becomes a CONSTRUCTED /doc/{instrumentNumber} when the search
// result had no URL — a URL that 404s or opens the wrong record. Passing `realDocUrl` would have
// reintroduced the exact bug the original comment warns about, in the name of going faster.
// Only `docRef.url` — read from the search results — may be navigated to.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const strip = (s: string) => s
  .split('\r\n').join('\n')
  .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
  .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

const read = (p: string) => strip(fs.readFileSync(path.resolve(__dirname, p), 'utf8'));

describe('the direct-navigation path is guarded', () => {
  const src = read('../services/bell-clerk.ts');

  it('accepts a known viewer URL', () => {
    expect(src).toContain('knownViewerUrl');
  });

  it('only trusts a URL on THIS portal that is actually a /doc/ URL', () => {
    // Without both halves, a caller passing a wrong host would send the browser somewhere
    // unrelated, and a non-/doc/ URL would open a page with no viewer to intercept.
    expect(src).toMatch(/knownViewerUrl\.startsWith\(baseUrl\)/);
    expect(src).toMatch(/knownViewerUrl\.includes\('\/doc\/'\)/);
  });

  it('falls back to search when no URL was supplied', () => {
    // The search path must survive intact — most callers still have only an instrument number.
    expect(src).toContain('Search+click: searching for instrument');
    expect(src).toMatch(/page\.goto\(trustedViewerUrl \?\? searchUrl/);
  });

  it('does not run the row-click when it navigated directly', () => {
    expect(src).toMatch(/if \(!trustedViewerUrl\) \{/);
  });

  it('still waits for the viewer to fire its signed URLs on both paths', () => {
    // The wait is what lets the response interceptor collect image URLs. Skipping it on the
    // direct path would make it fast and empty.
    expect(src).toContain('TYLER_VIEWER_LOAD_TIMEOUT_MS');
  });
});

describe('the caller passes the read URL, never a constructed one', () => {
  const src = read('../counties/bell/scrapers/clerk-scraper.ts');

  it('passes docRef.url', () => {
    expect(src).toMatch(/fetchDocumentImages\([^)]*docRef\.url/s);
  });

  it('does NOT pass realDocUrl, which falls back to a constructed /doc/{instrument}', () => {
    // The whole correctness argument in one assertion.
    expect(src, 'realDocUrl may be BELL_ENDPOINTS.clerk.document(instrumentNumber) — a URL that 404s')
      .not.toMatch(/fetchDocumentImages\([^)]*realDocUrl/s);
  });

  it('the fallback that makes realDocUrl unsafe still exists — so this guard still means something', () => {
    // Control. If the ?? fallback were removed, realDocUrl would become safe and this guard would
    // be pinning a rule that no longer applies. Better to fail and be re-read than to pass hollow.
    expect(src).toMatch(/realDocUrl = docRef\.url \?\? BELL_ENDPOINTS\.clerk\.document/);
  });
});
