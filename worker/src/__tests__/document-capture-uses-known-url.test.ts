// worker/src/__tests__/document-capture-uses-known-url.test.ts
//
// ── THE FIX SHIPPED ON ONE CALL SITE OF NINETEEN ────────────────────────────────────────────────
//
// E5c added a `knownViewerUrl` parameter to `fetchDocumentImages`, because `/doc/{id}` takes
// Kofile's INTERNAL document id (98732828) rather than the instrument number (2004032468) — so a
// caller that does not pass one has to find the page again by searching the portal and clicking the
// result, at roughly ten seconds a document.
//
// The parameter was added, documented at length, and then wired into exactly **one** of the
// nineteen places that call the function. Measured 2026-09-01. The other eighteen still searched.
//
// And most of them already HAD the url. `clerk-scraper.ts` computed `const realUrl = ref.url` and
// LOGGED it — *"real URL from search = …/doc/98732828"* — twelve lines above a capture call that
// omitted it. `plat-scraper.ts` did the same lookup twenty lines BELOW the capture, and used the
// result only to record where the document came from. The data was in scope, in the same block, in
// the same breath. The two halves simply never met.
//
// This is the shape the previous doc named G9 — *"the owner's own request was half applied"* — and
// the shape of every defect found in this repository last week: **a gap between a producer and a
// consumer that nothing compares.**
//
// ── SO THE RULE IS: PASS IT, OR SAY WHY YOU CANNOT ──────────────────────────────────────────────
//
// Not "pass it always". Four call sites genuinely have nothing to pass — they hold an instrument
// number that came out of a legal description or out of AI-extracted document text, with no search
// result behind it. Forcing a url there would mean CONSTRUCTING one, and a constructed `/doc/`
// url is wrong by definition for this portal: that is the whole reason the search+click exists.
//
// An allowlist entry needs a reason. An allowlist with no reasons is a place to hide failures.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Comments blanked, length-preserving — every file here now EXPLAINS this parameter at length. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
}

/** The text between the parentheses of one call, read by matching them rather than by guessing. */
function callArgs(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return '';
}

/** How many top-level arguments a call has — nested calls, objects and ternaries do not count. */
function argCount(args: string): number {
  if (args.trim() === '') return 0;
  let depth = 0, n = 1;
  for (const c of args) {
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) n++;
  }
  return n;
}

interface Site { file: string; line: number; args: number; }

function captureSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(ROOT)) {
    const raw = fs.readFileSync(file, 'utf8');
    const src = stripComments(raw);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const m of src.matchAll(/\bfetchDocumentImages\s*\(/g)) {
      const at = m.index! + m[0].length - 1;
      // Skip the declaration itself.
      const before = src.slice(Math.max(0, m.index! - 30), m.index!);
      if (/function\s+$/.test(before)) continue;
      sites.push({
        file: rel,
        line: src.slice(0, m.index!).split('\n').length,
        args: argCount(callArgs(src, at)),
      });
    }
  }
  return sites;
}

/**
 * Call sites that cannot pass a url, and why. `file` only — a line number in an allowlist goes
 * stale on the next edit above it and starts excusing a different call.
 */
const NOTHING_TO_PASS: Record<string, string> = {
  'services/pipeline.ts':
    'Four of its sites hold an instrument number pulled from a legal description or from '
    + 'AI-extracted document text. There is no search result behind those, so there is no url — and '
    + 'constructing one is wrong by definition, since /doc/{id} takes an internal id. The five sites '
    + 'that DO have a ref now pass it.',
  'adapters/kofile-clerk-adapter.ts':
    'A fallback after its own viewer walk failed. The url it holds is CONSTRUCTED from the '
    + 'instrument number (baseUrl + viewerPath + instrumentNo), which is exactly the guess the '
    + 'search+click exists to avoid — passing it would send the capture to a page that may not exist.',
  'counties/bell/scrapers/clerk-scraper.ts':
    'One site: `captureDocumentPages`, which takes an instrument id and nothing else. It has ZERO '
    + 'callers anywhere in the worker — threading a url into dead code would be work spent on '
    + 'something nothing runs. Recorded here rather than "fixed".',
};

describe('every document capture uses the url the search already found', () => {
  const sites = captureSites();

  it('control: the scan found the call sites at all', () => {
    // Without this, every assertion below passes against an empty list — the failure mode that let
    // the one-of-nineteen state survive in the first place.
    expect(sites.length, 'no fetchDocumentImages call sites parsed out of worker/src')
      .toBeGreaterThanOrEqual(15);
  });

  it('control: the argument counter can tell a 4-arg call from a 6-arg one', () => {
    expect(argCount('a, b, c')).toBe(3);
    expect(argCount('a, f(b, c), d')).toBe(3);
    expect(argCount('a, { x: 1, y: 2 }, c')).toBe(3);
    expect(argCount('n, isPlat ? 10 : 2, logger, county, undefined, ref?.url ?? undefined')).toBe(6);
    expect(argCount('')).toBe(0);
  });

  it('control: comment-stripping works, so the prose about this parameter is not scanned', () => {
    const sample = '// fetchDocumentImages(a, b)\nfetchDocumentImages(c, d);';
    const stripped = stripComments(sample);
    expect((stripped.match(/fetchDocumentImages\s*\(/g) ?? []).length).toBe(1);
  });

  it('every call site either passes a viewer url or is a file with a stated reason', () => {
    const bare = sites.filter((s) => s.args < 6 && !(s.file in NOTHING_TO_PASS));
    const detail = bare.map((s) => `  ${s.file}:${s.line} — ${s.args} args`).join('\n');
    expect(bare.map((s) => `${s.file}:${s.line}`),
      `these captures still re-derive a url the search already found:\n${detail}`).toEqual([]);
  });

  it('and the scrapers that HAVE the url pass it at every one of their sites', () => {
    // The two files where the url was demonstrably in scope. No allowlist for these: every site
    // in them either had a `ref` beside it or had one twenty lines away.
    for (const file of ['counties/bell/scrapers/plat-scraper.ts']) {
      const inFile = sites.filter((s) => s.file === file);
      expect(inFile.length, `no capture sites found in ${file}`).toBeGreaterThan(0);
      const bare = inFile.filter((s) => s.args < 6);
      expect(bare.map((s) => s.line), `${file} still has bare captures`).toEqual([]);
    }
  });

  it('clerk-scraper passes it everywhere except the dead export', () => {
    const inFile = sites.filter((s) => s.file === 'counties/bell/scrapers/clerk-scraper.ts');
    expect(inFile.length).toBeGreaterThan(4);
    // Exactly one bare site is expected — `captureDocumentPages`, which nothing calls. If a second
    // appears, somebody added a capture without the url.
    expect(inFile.filter((s) => s.args < 6).length,
      'clerk-scraper has more than the one known bare capture').toBe(1);
  });

  it('pipeline passes it at every site that has a ref to pass', () => {
    const inFile = sites.filter((s) => s.file === 'services/pipeline.ts');
    expect(inFile.length).toBeGreaterThan(8);
    // Five wired, four that genuinely have nothing. A drop below five means one was un-wired.
    expect(inFile.filter((s) => s.args >= 6).length,
      'a pipeline capture that used to pass the url no longer does').toBeGreaterThanOrEqual(5);
  });

  it('every allowlist entry names a file that still exists and still calls the function', () => {
    // An allowlist that outlives its subject is an excuse nobody is checking.
    for (const file of Object.keys(NOTHING_TO_PASS)) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is allowlisted and does not exist`).toBe(true);
      expect(sites.some((s) => s.file === file),
        `${file} is allowlisted and no longer calls fetchDocumentImages`).toBe(true);
    }
  });

  it('and every allowlist entry gives a real reason', () => {
    for (const [file, why] of Object.entries(NOTHING_TO_PASS)) {
      expect(why.length, `${file} is allowlisted with no explanation`).toBeGreaterThan(60);
    }
  });
});

describe('the capture leases a browser rather than launching one per document (E5b)', () => {
  // Eleven documents in one run meant eleven Chromium cold starts against the same portal. The
  // lease keeps one warm and closes it once nothing has used it for a minute; each document still
  // gets its own CONTEXT, so viewer state does not carry over.
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'services/bell-clerk.ts'), 'utf8'));
  const capture = src.slice(src.indexOf('export async function fetchDocumentImages'));

  it('control: the function was found and is not empty', () => {
    expect(capture.length).toBeGreaterThan(2000);
  });

  it('leases instead of acquiring', () => {
    const body = capture.slice(0, 4000);
    expect(body, 'the capture launches its own browser again').toContain('leaseBrowser({');
    expect(body).not.toMatch(/browser = await acquireBrowser\(/);
  });

  it('and still gives each document its own context', () => {
    // A shared context would carry one document's viewer state into the next.
    expect(capture.slice(0, 5000)).toContain('browser.newContext(');
  });
});
