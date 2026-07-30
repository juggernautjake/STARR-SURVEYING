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
  // THE GUARANTEE IS "COLLAPSIBLE AND CLOSED", NOT "A LITERAL <details> IN THIS FILE". These two assertions
  // used to pin `page.sections.map((s) => (<details` and `<details key={s.id} id={s.id}`, and they failed the
  // moment the accordion chrome moved into the shared `CollapsibleSection` — the change that made the three
  // BESPOKE sections (Spells, Class tables, Glossary) collapsible too, which is what the owner asked for both
  // times. A test that fails when its own subject is extended to more of the page is pinning the mechanism.
  //
  // `CollapsibleSection` is now the thing that must be a default-closed `<details>`, and
  // library-sections-collapsible.test.ts asserts exactly that, plus that no surface renders a section header
  // outside one. Here we assert this page routes its sections through it, with their ids intact.
  it('renders each section through the shared collapsible, not a plain <section>', () => {
    expect(page).toMatch(/page\.sections\.map\(\(s\) => \(\s*<CollapsibleSection\b/);
    expect(page).not.toMatch(/<section[^>]*framedPanel[\s\S]{0,400}?<h2[^>]*panelTitle/);
  });

  it('never force-opens the section accordion (no `open` attribute on the section <details>)', () => {
    // The class-tables + any per-class <details> must also stay default-closed; a literal `open` (or `open={`)
    // anywhere in the file would ship an always-expanded disclosure, defeating "all sections start CLOSED".
    expect(page).not.toMatch(/<details[^>]*\bopen\b/);
    expect(page).not.toContain('open={');
  });

  it('keeps the section id + scroll target so jump-nav still lands on the (closed) header', () => {
    // The id is what jump-nav and every `#section` deep link target; it must survive the chrome moving.
    expect(page).toMatch(/<CollapsibleSection key=\{s\.id\} id=\{s\.id\}/);
    // `scrollMarginTop` now lives on the shared component (one sticky-header offset for every section) —
    // which is the point, but it means this page no longer needs to say it, so check where it actually is.
    expect(readFileSync(join(process.cwd(), 'app/dnd/_ui/CollapsibleSection.tsx'), 'utf8')).toContain('scrollMarginTop');
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
