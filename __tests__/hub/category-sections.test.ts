// __tests__/hub/category-sections.test.ts
//
// H1 and H3 of HUB_CUSTOMIZER_2026-08-27.md. Run against the REAL registry, not fixtures, because
// both requirements are claims about the actual catalog: that every widget is filed somewhere, and
// that searching leaves you looking at a small number of boxes rather than eleven mostly-empty ones.

import { describe, it, expect } from 'vitest';
// Side-effect barrel — the registry is EMPTY without it, because every widget registers itself from
// its own module and nothing else pulls those modules in. `widget-palette.client.ts` imports this
// for the same reason and throws a named error if it is missing. Found by the control assertion
// below, which is the only thing standing between an empty catalog and twenty vacuous passes.
import '@/lib/hub/widgets/register-all';
import { allWidgets } from '@/lib/hub/widget-registry';
import type { UserRole } from '@/lib/auth-roles';
import {
  buildCategorySections,
  categoryMatches,
  categoryTags,
  CATEGORY_ORDER,
  widgetTags,
} from '@/lib/hub/widget-catalog-filter';

const CATALOG = allWidgets();

// `roles: []` is NOT "every role" — it is "no roles", and it gates away every widget that declares
// an `allowedRoles` list. Reading it as "unrestricted" cost three wrong assertions in this file: it
// makes 4 of the 11 categories vanish, which is correct behaviour and looked exactly like a bug in
// the filter.
const NO_ROLES = { roles: [] as UserRole[], activeBundles: null };
const EVERY_ROLE = {
  roles: [...new Set(CATALOG.flatMap((w) => w.allowedRoles))] as UserRole[],
  activeBundles: null,
};

describe('H1 — every widget belongs to exactly one category', () => {
  it('the catalog is not empty, so the assertions below mean something', () => {
    // The control. Without it a broken registry import would make every test here pass vacuously.
    expect(CATALOG.length).toBeGreaterThan(20);
  });

  it('no widget is uncategorised or filed under a category the UI cannot render', () => {
    const known = new Set<string>(CATEGORY_ORDER);
    const orphans = CATALOG.filter((w) => !w.category || !known.has(w.category));
    expect(orphans.map((w) => w.id + ' → ' + w.category)).toEqual([]);
  });

  it('every category the UI orders actually has widgets, or it renders an empty box forever', () => {
    const used = new Set(CATALOG.map((w) => w.category));
    const empty = CATEGORY_ORDER.filter((c) => !used.has(c));
    expect(empty).toEqual([]);
  });
});

describe('H1 outcome — it opens on categories, not a wall', () => {
  it('an unsearched catalog is a handful of boxes, not dozens of tiles', () => {
    const sections = buildCategorySections(CATALOG, EVERY_ROLE);
    expect(sections.length).toBe(CATEGORY_ORDER.length);
    // The number that matters: what the user faces on open is this, not CATALOG.length.
    expect(sections.length).toBeLessThan(CATALOG.length / 3);
  });

  it('each box knows its own size, so a closed box still says how much is inside', () => {
    for (const s of buildCategorySections(CATALOG, EVERY_ROLE)) {
      expect(s.total).toBe(s.widgets.length);
      expect(s.total).toBeGreaterThan(0);
    }
  });

  it('preserves the fixed order, so the catalog does not reshuffle between visits', () => {
    const order = buildCategorySections(CATALOG, EVERY_ROLE).map((s) => s.category);
    expect(order).toEqual(CATEGORY_ORDER.filter((c) => order.includes(c)));
  });
});

describe('H3 — searching hides whole categories', () => {
  it('a narrow search leaves one or two boxes, not eleven mostly-empty ones', () => {
    const sections = buildCategorySections(CATALOG, { ...EVERY_ROLE, search: 'weather' });
    // The actual requirement: "categories with no matching keyword are hidden entirely".
    expect(sections.length).toBeLessThan(CATEGORY_ORDER.length);
    for (const s of sections) expect(s.widgets.length).toBeGreaterThan(0);
  });

  it('never returns an empty box — an empty box is the bug this replaced', () => {
    for (const term of ['a', 'time', 'cad', 'job', 'weather', 'zzzz']) {
      for (const s of buildCategorySections(CATALOG, { ...EVERY_ROLE, search: term })) {
        expect(s.widgets.length, term + ' / ' + s.category).toBeGreaterThan(0);
      }
    }
  });

  it('narrows the widgets inside a surviving box', () => {
    const sections = buildCategorySections(CATALOG, { ...EVERY_ROLE, search: 'weather' });
    const narrowed = sections.filter((s) => s.widgets.length < s.total);
    // At least one box shows fewer than it holds, which is the "within a matching category,
    // widgets whose tags do not match are also hidden" half.
    expect(narrowed.length).toBeGreaterThan(0);
  });

  it('a category matching on its own NAME keeps everything in it', () => {
    // "cad" means "show me the CAD things", not "CAD things whose description also says cad".
    const cad = buildCategorySections(CATALOG, { ...EVERY_ROLE, search: 'cad' }).find((s) => s.category === 'cad');
    expect(cad).toBeDefined();
    expect(cad!.widgets.length).toBe(cad!.total);
  });

  it('marks surfaced categories so H4 can open them', () => {
    const searched = buildCategorySections(CATALOG, { ...EVERY_ROLE, search: 'cad' });
    expect(searched.every((s) => s.matched)).toBe(true);
    // And nothing is "matched" when there is no search to match.
    expect(buildCategorySections(CATALOG, EVERY_ROLE).every((s) => !s.matched)).toBe(true);
  });

  it('returns nothing at all for a term nothing carries', () => {
    expect(buildCategorySections(CATALOG, { ...EVERY_ROLE, search: 'qqzzxx' })).toEqual([]);
  });

  it('matches on a prefix, because the user is still typing', () => {
    // Per-keystroke search is useless if "equip" finds nothing until you finish the word.
    const partial = buildCategorySections(CATALOG, { ...EVERY_ROLE, search: 'equip' });
    expect(partial.some((s) => s.category === 'equipment')).toBe(true);
  });
});

describe('tags are derived from the widgets, never declared', () => {
  it("a category's tags are the union of its widgets'", () => {
    const cad = CATALOG.filter((w) => w.category === 'cad');
    const tags = categoryTags(cad);
    for (const w of cad) for (const t of widgetTags(w)) expect(tags.has(t)).toBe(true);
  });

  it('a hand-maintained list would go stale silently — this cannot', () => {
    // Every widget's own label words are reachable from its category, by construction.
    for (const w of CATALOG) {
      const tags = categoryTags(CATALOG.filter((x) => x.category === w.category));
      expect(categoryMatches(tags, w.label.split(/\s+/)[0]), w.id).toBe(true);
    }
  });

  it('an empty term matches everything, so a cleared search restores the full list', () => {
    expect(categoryMatches(new Set(['anything']), '')).toBe(true);
    expect(categoryMatches(new Set(['anything']), '   ')).toBe(true);
  });

  it('multi-word queries need every word somewhere in the category, in any order', () => {
    const tags = new Set(['time', 'clock', 'pay', 'stub']);
    expect(categoryMatches(tags, 'time pay')).toBe(true);
    expect(categoryMatches(tags, 'pay time')).toBe(true);
    expect(categoryMatches(tags, 'time cad')).toBe(false);
  });
});

describe('role and bundle gating still applies, and applies BEFORE the count', () => {
  it('a box never advertises tiles the user could not add', () => {
    // If gating ran after the total was taken, a closed box would promise widgets that vanish on
    // open — worse than not showing them at all.
    const sections = buildCategorySections(CATALOG, { roles: [], activeBundles: [] });
    for (const s of sections) expect(s.total).toBe(s.widgets.length);
  });
});

describe('role gating changes what the catalog even offers', () => {
  it('a user with no roles sees strictly fewer categories than one with every role', () => {
    // This is the behaviour that produced three wrong assertions in this file before the control
    // caught it. Pinned so the next reader does not repeat the mistake.
    const none = buildCategorySections(CATALOG, NO_ROLES).length;
    const all = buildCategorySections(CATALOG, EVERY_ROLE).length;
    expect(none).toBeLessThan(all);
    expect(none).toBeGreaterThan(0);
  });
});

describe('the modal is wired to all of it', () => {
  it('renders category boxes and no longer renders the filter tabs', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'lib/hub/components/AddWidgetModal.tsx'), 'utf8');

    expect(src).toContain('buildCategorySections');
    expect(src).toContain('isCategoryOpen');
    expect(src).toContain('toggleCategory');
    expect(src).toContain('onSearchChanged');
    expect(src).toContain('<CategoryBox');
    expect(src).toContain('aria-expanded={open}');

    // The tab row answered the same question as the boxes and could only ever show one category.
    expect(src).not.toContain('tabsRowStyle');
    expect(src).not.toContain('renderGrouped');
    expect(src).not.toContain('renderFlat');
  });

  it('the fade is real CSS, not just a class name on an element', () => {
    // A className with no rule behind it is the shape of "authored but not wired", and would look
    // exactly like a fade that silently does nothing.
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(process.cwd(), 'lib/hub/components/AddWidgetModal.tsx'), 'utf8');

    expect(src).toContain('className="hub-cat-reveal"');
    expect(src).toContain('@keyframes hub-cat-fade');
    expect(src).toMatch(/\.hub-cat-reveal\s*\{[^}]*animation/);
    expect(src).toContain('prefers-reduced-motion');
  });
});
