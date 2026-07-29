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
