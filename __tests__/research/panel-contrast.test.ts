// Dark panels must set their own text colour on headings and labels.
//
// Found by finally driving these panels in a browser, which I had twice named as the remaining gap
// without attempting. The rotation panel's heading and BOTH radio labels rendered dark-on-dark —
// invisible against `bg-gray-900`. Every unit test passed, including the render tests: the markup
// was correct, the CSS cascade was not.
//
// The cause is two element rules in `app/styles/globals.css`:
//
//     h1, h2, h3, h4, h5, h6 { color: var(--brand-dark); }
//     label                  { color: var(--brand-dark); }
//
// An element selector beats an INHERITED value, always — so `text-gray-100` on the panel container
// never reaches an `<h2>` or a `<label>` inside it. Tailwind's class is on the wrong element to win.
//
// This is not a bug in those globals: they are right for the light admin pages that make up most of
// the app. It is a rule about writing a dark panel inside a light-themed application, and the only
// way to see it is to look.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/** Panels that render on a dark surface and therefore cannot rely on inheritance. */
const DARK_PANELS = [
  'app/admin/research/components/RotationPanel.tsx',
  'app/admin/research/components/VendorAccountsPanel.tsx',
];

describe('the global rules that make this necessary still exist', () => {
  // If these ever change, this whole check can go — so it fails loudly rather than quietly guarding
  // nothing, which is how a stale test outlives its reason.
  const globals = read('app/styles/globals.css');

  it('headings are coloured by an element rule', () => {
    expect(globals).toMatch(/h1, h2, h3, h4, h5, h6 \{[^}]*color: var\(--brand-dark\)/);
  });

  it('labels are too', () => {
    expect(globals).toMatch(/label \{[^}]*color: var\(--brand-dark\)/);
  });
});

describe('every heading and label in a dark panel names its own colour', () => {
  for (const file of DARK_PANELS) {
    const src = read(file);

    it(`${path.basename(file)}: headings`, () => {
      const headings = [...src.matchAll(/<h[1-6]\s+className="([^"]*)"/g)].map((m) => m[1]!);
      expect(headings.length, 'no headings found — did the panel change shape?').toBeGreaterThan(0);
      const bare = headings.filter((c) => !/\btext-(gray|white|slate|zinc)-\d{2,3}\b|\btext-white\b/.test(c));
      expect(bare, `these headings inherit a colour they will never receive:\n  ${bare.join('\n  ')}`)
        .toEqual([]);
    });

    it(`${path.basename(file)}: labels`, () => {
      const labels = [...src.matchAll(/<label\s+[^>]*className="([^"]*)"/g)].map((m) => m[1]!);
      expect(labels.length, 'no labels found — did the panel change shape?').toBeGreaterThan(0);
      const bare = labels.filter((c) => !/\btext-(gray|white|slate|zinc)-\d{2,3}\b|\btext-white\b/.test(c));
      expect(bare, `these labels render dark-on-dark:\n  ${bare.join('\n  ')}`).toEqual([]);
    });
  }
});

describe('the harness can mount them, which is how this was found', () => {
  it('both panels are registered', () => {
    const harness = read('app/ux-harness/UxHarnessClient.tsx');
    expect(harness).toContain("'research-rotation'");
    expect(harness).toContain("'research-vendor-accounts'");
  });

  it('the mounts supply real props rather than faking the API', () => {
    // A panel that fetches shows its loading or error state here, which is worth seeing. Faking the
    // response would be testing the fake.
    const mount = read('app/ux-harness/ResearchPanelHarnessMount.tsx');
    expect(mount).toContain('do not fake API responses');
  });
});
