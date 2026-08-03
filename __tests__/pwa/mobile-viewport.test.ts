// PWA plan W6 — the mobile rules that can be decided without a device.
//
// W6 is "make sure everything works on mobile", and most of that genuinely needs a phone: real
// touch targets, real thumb reach, real behaviour inside the installed shell where there is no
// browser chrome and viewport units change meaning. That half is not fakeable and is not claimed
// here.
//
// This file pins the part that IS decidable from source, and it is the part that breaks everything
// else when it is wrong: the viewport declaration. A missing or duplicated viewport meta makes every
// page render at desktop width on a phone, and a zoom lock makes the app unusable for anyone who
// needs to magnify.
//
// THE ZOOM RULE IS THE POINT OF THIS FILE. Before W6, `app/layout.tsx` carried a comment saying
// pinch-zoom was "locked off so the app feels native" — which had never been true, since neither
// option was ever set. The comment described the worse behaviour, and someone tidying up by making
// the code match it would have introduced an accessibility regression that looked like a fix. This
// test exists so that edit fails.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const layout = fs.readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8');

/** Strip comments before matching.
 *
 *  Naming a property in prose is not setting it, and every source-scanning check written today got
 *  this wrong on its first run — three times, including this one, each failing against the very
 *  comment that explains why the code is correct. The failure is not symmetric and that is why it
 *  keeps happening: a prose mention produces a false ALARM, which is annoying but visible, while the
 *  same blindness lets a file that merely DESCRIBES a fix pass as though it applied one.
 *
 *  Handles `//`, `/* *\/` and JSX `{/* *\/}` — the last is what `app/layout.tsx` uses, so a stripper
 *  that only knew the first two would still have failed here. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')            // block comments, incl. the bodies of JSX {/* … */}
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
}

const code = stripComments(layout);

describe('the viewport is declared exactly once', () => {
  it('declares it through the Next viewport export', () => {
    expect(code).toContain('export const viewport');
    expect(code).toMatch(/width:\s*'device-width'/);
    expect(code).toMatch(/initialScale:\s*1/);
  });

  it('does NOT also hand-write a viewport meta tag', () => {
    // Next injects one from the export. A second, hand-written tag put two viewport declarations in
    // every page head, with the duplicate shadowing or outranking the export depending on order —
    // one declaration, one place to change it.
    expect(code).not.toMatch(/<meta\s+name=["']viewport["']/);
  });
});

describe('pinch-zoom is never disabled', () => {
  // WCAG 2.1 SC 1.4.4. This app is used outdoors in bright sun by crews reading bearings and job
  // numbers off a phone; pinching to check a digit is exactly the case a zoom lock breaks. It also
  // would not work — iOS Safari has ignored user-scalable=no since iOS 10 — so the only reliable
  // effect of "locking zoom for a native feel" is to break Android for low-vision users.
  it('sets no maximumScale', () => {
    expect(code).not.toContain('maximumScale');
  });

  it('sets no userScalable', () => {
    expect(code).not.toContain('userScalable');
  });

  it('has no user-scalable or maximum-scale anywhere in the app', () => {
    // Belt and braces: a viewport meta smuggled into a nested layout or a raw HTML page would defeat
    // the checks above, which only read the root layout.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.next') walk(p); continue; }
        if (!/\.(tsx?|html)$/.test(p)) continue;
        const src = stripComments(fs.readFileSync(p, 'utf8'));
        if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(src)) {
          offenders.push(path.relative(process.cwd(), p).replace(/\\/g, '/'));
        }
      }
    };
    walk(path.join(process.cwd(), 'app'));
    walk(path.join(process.cwd(), 'public'));
    expect(offenders, `these disable zoom:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

describe('the offline page is mobile-shaped', () => {
  // Shipped in W2/W3 as raw HTML outside the React tree, so it inherits none of the app's layout
  // rules and is the one page that could silently render at desktop width on a phone.
  const offline = fs.readFileSync(path.join(process.cwd(), 'public/admin/offline.html'), 'utf8');

  it('declares its own viewport, since it is outside the Next tree', () => {
    expect(offline).toMatch(/name="viewport"[^>]*width=device-width/);
  });

  it('does not disable zoom either', () => {
    expect(offline).not.toContain('user-scalable=no');
    expect(offline).not.toContain('maximum-scale');
  });

  it('constrains its content rather than assuming a wide screen', () => {
    expect(offline).toMatch(/max-width:\s*\d+px/);
  });
});
