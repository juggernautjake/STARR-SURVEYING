// __tests__/research/dom-fingerprint.test.ts
//
// §9.1 (structural layer) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.

import { describe, it, expect } from 'vitest';
import {
  diffFingerprints,
  fingerprintHtml,
} from '@/lib/research/dom-fingerprint';

const BASELINE_FORM = `
  <html>
    <body>
      <form action="/search" method="post">
        <input type="text" name="propertyId" placeholder="Property ID">
        <select name="county">
          <option value="bell">Bell</option>
          <option value="harris">Harris</option>
        </select>
        <button type="submit">Search</button>
      </form>
      <table>
        <thead><tr><th>Owner</th><th>Acres</th></tr></thead>
        <tbody>
          <tr><td>Smith John</td><td>5.2</td></tr>
        </tbody>
      </table>
    </body>
  </html>
`;

describe('fingerprintHtml — stability', () => {
  it('produces an identical hash for the same input', () => {
    const a = fingerprintHtml(BASELINE_FORM);
    const b = fingerprintHtml(BASELINE_FORM);
    expect(a.hash).toBe(b.hash);
    expect(a.element_count).toBeGreaterThan(0);
  });

  it('ignores text content changes (the "Owner" header could be renamed)', () => {
    const a = fingerprintHtml(BASELINE_FORM);
    const b = fingerprintHtml(BASELINE_FORM.replace('Owner', 'Property Owner'));
    expect(a.hash).toBe(b.hash);
  });

  it('ignores random class name churn (Tailwind hashes change)', () => {
    const a = fingerprintHtml(`<form action="/x"><input name="q" class="px-4"></form>`);
    const b = fingerprintHtml(`<form action="/x"><input name="q" class="abc-123-xyz-very-long"></form>`);
    expect(a.hash).toBe(b.hash);
  });

  it('ignores whitespace + comment changes', () => {
    const a = fingerprintHtml(BASELINE_FORM);
    const b = fingerprintHtml(BASELINE_FORM.replace(/\n/g, '').replace(/\s+/g, ' '));
    const c = fingerprintHtml(`<!-- header --> ${BASELINE_FORM} <!-- footer -->`);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(c.hash);
  });

  it('ignores script + style blocks (they can change without breaking the adapter)', () => {
    const withScripts = BASELINE_FORM.replace(
      '<body>',
      '<body><script>var x = Math.random();</script><style>.foo { color: red }</style>',
    );
    expect(fingerprintHtml(withScripts).hash).toBe(fingerprintHtml(BASELINE_FORM).hash);
  });

  it('is order-of-attributes insensitive', () => {
    const a = fingerprintHtml(`<input type="text" name="q" id="search">`);
    const b = fingerprintHtml(`<input id="search" name="q" type="text">`);
    expect(a.hash).toBe(b.hash);
  });
});

describe('fingerprintHtml — breakage detection', () => {
  it('different hash when a form field disappears', () => {
    const without = BASELINE_FORM.replace(
      /<input type="text" name="propertyId"[^>]*>/,
      '',
    );
    const a = fingerprintHtml(BASELINE_FORM);
    const b = fingerprintHtml(without);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different hash when the form action changes', () => {
    const moved = BASELINE_FORM.replace('action="/search"', 'action="/v2/search"');
    expect(fingerprintHtml(BASELINE_FORM).hash).not.toBe(fingerprintHtml(moved).hash);
  });

  it('different hash when input name is renamed', () => {
    const renamed = BASELINE_FORM.replace('name="propertyId"', 'name="parcel_id"');
    expect(fingerprintHtml(BASELINE_FORM).hash).not.toBe(fingerprintHtml(renamed).hash);
  });

  it('different hash when a table column is added', () => {
    const newCol = BASELINE_FORM.replace(
      '<th>Owner</th><th>Acres</th>',
      '<th>Owner</th><th>Acres</th><th>Value</th>',
    );
    expect(fingerprintHtml(BASELINE_FORM).hash).not.toBe(fingerprintHtml(newCol).hash);
  });
});

describe('diffFingerprints — bucketing', () => {
  it('identical fingerprints → similarity 1, severity healthy', () => {
    const f = fingerprintHtml(BASELINE_FORM);
    const d = diffFingerprints(f, f);
    expect(d.identical).toBe(true);
    expect(d.similarity).toBe(1);
    expect(d.severity).toBe('healthy');
  });

  it('small change (e.g. add one button) → degraded, not broken', () => {
    const tweaked = BASELINE_FORM.replace(
      '</form>',
      '<button type="button">Cancel</button></form>',
    );
    const d = diffFingerprints(fingerprintHtml(BASELINE_FORM), fingerprintHtml(tweaked));
    expect(d.identical).toBe(false);
    expect(d.similarity).toBeGreaterThan(0.6);
    expect(d.severity).toBe('degraded');
    expect(d.added.length + d.removed.length).toBeGreaterThan(0);
  });

  it('completely different page → broken', () => {
    const a = fingerprintHtml(BASELINE_FORM);
    const b = fingerprintHtml(`
      <html><body><main>
        <nav><a href="/login">Login</a></nav>
        <article>Sorry, this site has moved.</article>
      </main></body></html>
    `);
    const d = diffFingerprints(a, b);
    expect(d.similarity).toBeLessThan(0.6);
    expect(d.severity).toBe('broken');
  });

  it('returns the added/removed tokens for the §9.4 repair agent', () => {
    const before = fingerprintHtml(`<form action="/v1"><input name="q"></form>`);
    const after  = fingerprintHtml(`<form action="/v2"><input name="q"></form>`);
    const d = diffFingerprints(before, after);
    expect(d.removed.some((t) => t.includes('action="/v1"'))).toBe(true);
    expect(d.added.some((t) => t.includes('action="/v2"'))).toBe(true);
  });
});

describe('fingerprintHtml — robustness', () => {
  it('handles empty input without throwing', () => {
    const f = fingerprintHtml('');
    expect(f.element_count).toBe(0);
    expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles malformed HTML by ignoring the unparseable parts', () => {
    expect(() =>
      fingerprintHtml('<form action="/x"><input name="q" <broken'),
    ).not.toThrow();
  });

  it('produces a deterministic 64-char hex SHA-256', () => {
    const f = fingerprintHtml(BASELINE_FORM);
    expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
