// __tests__/dnd/library-collapsible.test.ts — MOB2b. The owner asked (twice) that system-library sections be
// toggle-open/closed AND that they all START CLOSED. This source-anchors that the section renderer uses a
// native <details>/<summary> accordion and never force-opens it — so a refactor that dropped the collapse, or
// slipped an `open` attribute onto the section map, fails here rather than silently shipping always-open
// sections.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/dnd/library/[key]/page.tsx'), 'utf8');

describe('library system page — collapsible sections, default closed (MOB2b)', () => {
  it('renders each section as a <details> with a <summary>, not a plain <section>', () => {
    // The section map opens a <details> keyed by section id and puts the title in a <summary>.
    expect(page).toMatch(/page\.sections\.map\(\(s\) => \(\s*<details\b/);
    expect(page).toContain('<summary');
  });

  it('never force-opens the section accordion (no `open` attribute on the section <details>)', () => {
    // The class-tables + any per-class <details> must also stay default-closed; a literal `open` (or `open={`)
    // anywhere in the file would ship an always-expanded disclosure, defeating "all sections start CLOSED".
    expect(page).not.toMatch(/<details[^>]*\bopen\b/);
    expect(page).not.toContain('open={');
  });

  it('keeps the section id + scroll target so jump-nav still lands on the (closed) header', () => {
    expect(page).toMatch(/<details key=\{s\.id\} id=\{s\.id\}/);
    expect(page).toContain('scrollMarginTop');
  });

  it('renders a per-entry image (e.g. a species portrait) INSIDE the accordion, above the detail text', () => {
    // Owner 2026-07-17: art shows only when the accordion is open, large + centered before the detail.
    expect(page).toContain('{e.image && (');
    expect(page).toContain('<figure');
    expect(page).toMatch(/src=\{e\.image\}/);
    // the image block comes before the <Rich text={e.detail}
    expect(page.indexOf('src={e.image}')).toBeLessThan(page.indexOf('<Rich text={e.detail}'));
  });

  it('links the IG logo/title to Brendan\'s site with a "see the source material" link', () => {
    expect(page).toContain('https://www.intuitivegames.net');
    expect(page).toMatch(/see the source material/i);
    expect(page).toContain("target=\"_blank\"");
  });
});
