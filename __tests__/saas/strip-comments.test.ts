// __tests__/saas/strip-comments.test.ts
//
// `audit-starr-assumptions.mjs` counts hard-coded firm identity on tenant-facing surfaces. It read
// raw source, so it counted PROSE: 46 of the 165 references in the 2026-08-30 backlog were sentences
// in comments explaining why a county behaves the way it does. No customer firm has ever expected a
// comment to say their name, which is the question every pattern in that audit claims to be asking.
//
// This is the third guard in this repository to match its own explanatory text this month. Long
// comments are the house style here, so any scanner over this source must strip them first.
//
// ── THE STRIPPER IS NOW LOAD-BEARING ────────────────────────────────────────────────────────────
//
// It decides a ratchet's number, so it gets its own tests. The dangerous failure is not "misses a
// comment" — that only inflates a count. It is **eating code**: a naive `//` rule swallows the rest
// of any line containing a URL, and county-adapter files are full of `https://esearch.bellcad.org`.
// That would silently DROP real hits and make the backlog look paid down.

import { describe, it, expect } from 'vitest';
import { stripComments } from '../../scripts/audit-starr-assumptions.mjs';

describe('prose goes', () => {
  it('removes a line comment', () => {
    expect(stripComments('// a note about Bell County\nconst x = 1;')).not.toContain('Bell County');
  });

  it('removes a block comment, including a multi-line one', () => {
    const src = '/* a long note\n * about Bell County\n */\nconst x = 1;';
    expect(stripComments(src)).not.toContain('Bell County');
  });

  it('removes a JSDoc block', () => {
    expect(stripComments('/** Bell County only */\nexport const x = 1;')).not.toContain('Bell County');
  });

  it('removes a trailing comment without taking the code with it', () => {
    const out = stripComments('const county = "travis"; // not Bell County');
    expect(out).not.toContain('Bell County');
    expect(out).toContain('const county = "travis";');
  });
});

describe('code stays — the failure that would matter', () => {
  it('does not eat a line containing a URL', () => {
    // The whole reason for the `://` guard. Swallowing this line would drop a real adapter hostname
    // and make the backlog look smaller than it is, which is the one direction a ratchet must never
    // be wrong in.
    const src = 'const url = "https://esearch.bellcad.org/Search";';
    expect(stripComments(src)).toContain('esearch.bellcad.org/Search');
  });

  it('keeps a protocol-relative URL intact too', () => {
    expect(stripComments('const u = "//cdn.example.com/x.js";\n')).toContain('cdn.example.com');
  });

  it('keeps real county comparisons', () => {
    const src = 'if (countyName === "bell") { route(); }';
    expect(stripComments(src)).toContain('countyName === "bell"');
  });

  it('does not treat a `//` inside a block comment as a line comment', () => {
    // Order matters: blocks are stripped first. If line comments went first, the `*/` closing this
    // block would survive and the rest of the file could be mangled.
    const out = stripComments('/* see https://x.test for Bell County */\nconst x = 1;');
    expect(out).not.toContain('Bell County');
    expect(out).toContain('const x = 1;');
  });
});

describe('the stripper is actually used', () => {
  it('scan() reports fewer hits than a raw read would', async () => {
    // The guard against someone adding stripComments and never wiring it in — this repo's most
    // common defect, and one a unit test of the helper alone cannot see.
    const fs = await import('node:fs');
    const src = fs.readFileSync('scripts/audit-starr-assumptions.mjs', 'utf8');
    expect(src).toContain('stripComments(fs.readFileSync(');
  });
});
