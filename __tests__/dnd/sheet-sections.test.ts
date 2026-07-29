// Grouping the character page's surrounding panels (P4-3, audit finding D-4).
//
// THE FINDING: one 470-line page stacked ~20 always-mounted panels vertically, with the sheet somewhere in
// the middle. The sheet *itself* is tabbed; the page around it was not, so the further down a control lived
// the less likely it was ever found — the same "buried control" defect already recorded for the stance
// class.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const comp = read('app/dnd/_ui/SheetSections.tsx');
const page = read('app/dnd/characters/[id]/page.tsx');

describe('SheetSections', () => {
  it('takes already-rendered server nodes, not component references', () => {
    // The point: every panel keeps its own server-side data fetching, and the tab strip is added without
    // any of them becoming a client component.
    expect(comp).toMatch(/node: ReactNode/);
  });

  it('mounts ONLY the active section', () => {
    // Twenty always-mounted panels is also twenty panels' worth of effects and fetches on every visit.
    expect(comp).toMatch(/<div role="tabpanel">\{current\.node\}<\/div>/);
    expect(comp, 'no hidden-but-mounted sections').not.toMatch(/display: '?none/);
  });

  it('drops empty sections rather than offering a tab onto nothing', () => {
    // A read-only viewer has no Build or Manage content at all.
    expect(comp).toMatch(/sections\.filter\(\(s\) => !!s\.node\)/);
  });

  it('renders nothing when there is nothing to show', () => {
    expect(comp).toMatch(/if \(live\.length === 0\) return null;/);
  });

  it('and hides the tab strip when there is only one section', () => {
    // A single tab is furniture pretending to be a choice.
    expect(comp).toMatch(/live\.length > 1 && \(/);
  });

  it('is a real tablist for assistive tech', () => {
    expect(comp).toContain('role="tablist"');
    expect(comp).toContain('role="tab"');
    expect(comp).toContain('aria-selected');
    expect(comp).toContain('role="tabpanel"');
  });
});

// The block is sliced to the closing `]}` of the sections array, not to the first `/>` — the panels
// INSIDE it are self-closing elements, so the first `/>` lands three lines in and the slice measures
// almost nothing. (It did, on this test's first run.)
describe('what it groups on the character page', () => {
  it('the four "who can see and use this" panels are inside it', () => {
    const start = page.indexOf('<SheetSections');
    const block = page.slice(start, page.indexOf(']}', start));
    for (const panel of ['SheetVisibilityToggle', 'CharacterCampaigns', 'PromoteCampaignVersionButton', 'ExportSheetButton']) {
      expect(block, `${panel} should be grouped`).toContain(panel);
    }
  });

  it('each of them appears exactly ONCE on the page', () => {
    // The failure mode of a refactor like this is leaving the old copy behind, so the panel renders twice
    // and every action on it is duplicated.
    for (const panel of ['<SheetVisibilityToggle', '<CharacterCampaigns', '<PromoteCampaignVersionButton', '<ExportSheetButton']) {
      const count = page.split(panel).length - 1;
      expect(count, `${panel} should render once, found ${count}`).toBe(1);
    }
  });

  it('THE SHEET IS NOT TABBED', () => {
    // The sheet is why the page exists. Only the surrounding panels are grouped — which is where the twenty
    // were in the first place.
    const start = page.indexOf('<SheetSections');
    const block = page.slice(start, page.indexOf(']}', start));
    for (const sheet of ['SheetRoot', 'PF2Sheet', 'IGSheet', 'SheetChrome']) {
      expect(block, `${sheet} must stay outside the tabs`).not.toContain(sheet);
    }
  });

  it('and the section carries a line saying what lives there', () => {
    // The grouping has to teach itself, or a control simply moves from "buried at the bottom" to "behind a
    // tab nobody clicks".
    expect(page).toMatch(/blurb: 'Who can see this character/);
  });
});

describe('the Build group (P4-3b)', () => {
  // MEASURED BEFORE TOUCHING ANYTHING, on a real 2014 sheet in a browser: the sheet — the reason the page
  // exists — started **1103px** down, more than a full 889px viewport of tools above it. Moving the two
  // largest movable panels into a tab brought that to **807px**.
  const page = readFileSync(join(process.cwd(), 'app/dnd/characters/[id]/page.tsx'), 'utf8');

  it('has a Build section', () => {
    expect(page).toMatch(/id: 'build',/);
    expect(page).toMatch(/label: 'Build',/);
  });

  it('holding the designers and adopt-content', () => {
    const build = page.slice(page.indexOf("id: 'build',"), page.indexOf("id: 'manage',"));
    expect(build).toContain('<HomebrewDesignerLinks');
    expect(build).toContain('<AdoptContentPanel');
  });

  it('and neither still renders above the sheet', () => {
    // The whole point. If either is reintroduced inline, the page grows back and the tab quietly becomes
    // a duplicate rather than a home.
    const beforeSections = page.slice(0, page.indexOf('<SheetSections'));
    expect(beforeSections, 'designers must not also render inline').not.toContain('<HomebrewDesignerLinks');
    expect(beforeSections, 'adopt must not also render inline').not.toContain('<AdoptContentPanel');
  });

  it('Build is NOT the first section', () => {
    // `SheetSections` opens `live[0]`, so order decides what paints on arrival. The first browser check
    // showed only 101px saved because Build led and its 214px of designers still rendered. Experience is a
    // glance; Build is a task you go to.
    expect(page.indexOf("id: 'xp',")).toBeLessThan(page.indexOf("id: 'build',"));
  });

  it('and is empty for a viewer who cannot write', () => {
    // SheetSections drops empty sections, so a read-only viewer gets no Build tab rather than one that
    // opens onto nothing.
    const build = page.slice(page.indexOf("id: 'build',"), page.indexOf("id: 'manage',"));
    expect(build).toMatch(/node: canWrite \?/);
  });

  it('the Build Kit, chrome and versions deliberately STAY above the sheet', () => {
    // Not an oversight. The Build Kit is the primary "build this character" action; U-4 requires the
    // STYLE·TEMPLATE·THEME block to sit in the same spot on every system; VERSIONS is a picker for what you
    // are looking at, not a tool you visit.
    const beforeSections = page.slice(0, page.indexOf('<SheetSections'));
    expect(beforeSections).toContain('{topPanel}');
    expect(beforeSections).toContain('<SheetChrome');
  });
});
