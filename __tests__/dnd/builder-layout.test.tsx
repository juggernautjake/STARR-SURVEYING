// __tests__/dnd/builder-layout.test.tsx — readability + responsive guards for the guided builder
// (final-QA walkthrough, slice 8 — the doc's "styling, formatting, readability" item).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the builder does not scroll sideways on a phone', () => {
  const CSS = read('app/dnd/_ui/hextech.module.css');
  const TSX = read('app/dnd/_ui/builder/GuidedBuilder.tsx');

  it('the two-column shell collapses below a breakpoint', () => {
    // It was an inline `minmax(200px, 260px) 1fr`, whose 200px floor plus gap plus page padding could not
    // fit a 375px viewport — measured 439px of content in a 375px window before the fix.
    expect(CSS).toMatch(/\.builderGrid\s*\{[^}]*grid-template-columns:\s*minmax\(200px, 260px\) 1fr/s);
    expect(CSS).toMatch(/@media \(max-width: 760px\)[^}]*\{[\s\S]*?\.builderGrid\s*\{\s*grid-template-columns:\s*1fr/);
  });

  it('the step rail stops sticking when it is stacked', () => {
    // A sticky rail above the content on a small screen would eat the viewport as you scroll.
    expect(CSS).toMatch(/\.builderRail\s*\{[^}]*position:\s*sticky/s);
    expect(CSS).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.builderRail\s*\{\s*position:\s*static/);
  });

  it('the component uses the classes, not the old inline grid', () => {
    expect(TSX).toContain('className={styles.builderGrid}');
    expect(TSX).toContain('className={styles.builderRail}');
    expect(TSX).not.toContain("gridTemplateColumns: 'minmax(200px, 260px) 1fr'");
  });
});

describe('the feat picker leads with what you can actually take', () => {
  const SRC = read('app/dnd/_ui/Dnd5eManualBuilder.tsx');

  it('partitions eligible before ineligible', () => {
    // Once the eligibility gate landed, a level-8 Fighter saw 31 struck-through entries with 5 live ones
    // scattered among them inside a 160px scroller. The legal picks now come first.
    expect(SRC).toContain('const orderedFeats');
    // Reads the memoised verdict MAP, not the per-render `eligibilityOf` closure — depending on that
    // closure would re-partition the catalog every render and defeat the memo (and trips exhaustive-deps).
    expect(SRC).toMatch(/featVerdicts\.get\(f\.name\)\?\.ok \?\? true/);
    expect(SRC).toMatch(/\(ok \? chosenOrOk : blocked\)\.push\(f\)/);
    expect(SRC).toMatch(/return \[\.\.\.chosenOrOk, \.\.\.blocked\]/);
    expect(SRC).toContain('{orderedFeats.map((f) => {');
  });

  it('keeps the ineligible ones visible rather than hiding them', () => {
    // "Why can't I take Alert?" is a question the list should still answer — they are greyed, not removed.
    expect(SRC).toMatch(/blocked\.push|: blocked\)/);
    expect(SRC).toContain('greyed out');
  });

  it('is a STABLE partition, so the list does not reshuffle as eligibility changes', () => {
    // Catalog order is preserved inside each group (a plain two-bucket push, no sort comparator).
    expect(SRC).not.toMatch(/orderedFeats[\s\S]{0,200}\.sort\(/);
  });
});
