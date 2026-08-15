// __tests__/hub/widgets/custom-quick-actions.test.ts
//
// admin-ui-alignment-2026-08-14 — user-authored Quick Actions.
//
// Owner: *"we need to be able to add links that when clicked takes us to that page… fully
// customize the actions and links."*
//
// What is locked here: the href allow-list (a saved `javascript:` destination is the one way this
// feature could hurt someone, so it gets the most cases), the leniency of the sanitizer on
// cosmetic fields against its strictness on label + href, id stability, and the resolver's
// behaviour when an id outlives the thing it named.

import { describe, it, expect } from 'vitest';
import {
  CUSTOM_ACTION_ICON_CHOICES,
  CUSTOM_ACTION_ICON_GROUPS,
  CUSTOM_ACTION_LABEL_MAX,
  CUSTOM_ACTION_PREFIX,
  duplicateCustomAction,
  isCustomActionId,
  isExternalHref,
  isKnownInternalHref,
  nextCustomActionId,
  normalizeCustomActions,
  safeHref,
  sanitizeCustomAction,
  toQuickActionDef,
  type CustomQuickAction,
} from '@/lib/hub/custom-quick-actions';
import { resolveActions } from '@/lib/hub/widgets/quick-actions';
import { DEFAULT_QUICK_ACTION_IDS } from '@/lib/hub/quick-actions-catalog';

const link = (over: Partial<CustomQuickAction> = {}): CustomQuickAction => ({
  id: 'custom:truck-checklist',
  label: 'Truck checklist',
  href: '/admin/equipment/today',
  icon: '🚚',
  tint: 'accent',
  ...over,
});

describe('safeHref — the allow-list', () => {
  it('accepts internal paths, with query and fragment', () => {
    expect(safeHref('/admin/jobs')).toBe('/admin/jobs');
    expect(safeHref('/admin/jobs?status=open#top')).toBe('/admin/jobs?status=open#top');
  });

  it('accepts absolute http(s), mailto and tel', () => {
    expect(safeHref('https://example.com/x')).toBe('https://example.com/x');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:office@starr-surveying.com')).toBe('mailto:office@starr-surveying.com');
    expect(safeHref('tel:+15125550123')).toBe('tel:+15125550123');
  });

  it('trims surrounding whitespace', () => {
    expect(safeHref('  /admin/jobs  ')).toBe('/admin/jobs');
  });

  it('rejects script-bearing schemes in any casing or spacing', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JavaScript:alert(1)')).toBeNull();
    expect(safeHref('  javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox')).toBeNull();
  });

  it('rejects a protocol-relative URL, which would read as internal and navigate off-site', () => {
    expect(safeHref('//evil.example/steal')).toBeNull();
  });

  it('rejects a bare host and non-strings', () => {
    expect(safeHref('example.com')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref('   ')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(42)).toBeNull();
  });
});

describe('isExternalHref', () => {
  it('is true for anything that is not an in-app path', () => {
    expect(isExternalHref('/admin/jobs')).toBe(false);
    expect(isExternalHref('https://example.com')).toBe(true);
    expect(isExternalHref('mailto:a@b.com')).toBe(true);
  });
});

describe('isKnownInternalHref — C0h, the dead-link flag', () => {
  const known = ['/admin/jobs', '/admin/mileage', '/admin/work'];

  it('accepts an exact registered route', () => {
    expect(isKnownInternalHref('/admin/jobs', known)).toBe(true);
  });

  it('ignores query and fragment, which are the user’s business', () => {
    expect(isKnownInternalHref('/admin/jobs?status=open', known)).toBe(true);
    expect(isKnownInternalHref('/admin/jobs#top', known)).toBe(true);
    expect(isKnownInternalHref('/admin/jobs/', known)).toBe(true);
  });

  it('accepts a dynamic child of a real page', () => {
    // `/admin/jobs/<id>` is a perfectly good shortcut and will never be in the registry.
    expect(isKnownInternalHref('/admin/jobs/abc-123', known)).toBe(true);
  });

  it('flags a path whose page no longer exists', () => {
    expect(isKnownInternalHref('/admin/work-mode/start', known)).toBe(false);
    expect(isKnownInternalHref('/admin/nonsense', known)).toBe(false);
  });

  it('does not let a shorter route swallow a longer sibling', () => {
    // The exact prefix bug the bundle gate documents: `/admin/work` must NOT vouch for
    // `/admin/work-mode`, or retiring one feature would silently bless links into the other.
    expect(isKnownInternalHref('/admin/work-mode', known)).toBe(false);
    expect(isKnownInternalHref('/admin/work', known)).toBe(true);
  });

  it('always passes an external href, because it cannot know', () => {
    expect(isKnownInternalHref('https://example.com/anything', known)).toBe(true);
    expect(isKnownInternalHref('mailto:a@b.com', known)).toBe(true);
  });
});

describe('sanitizeCustomAction', () => {
  it('passes a well-formed entry through', () => {
    expect(sanitizeCustomAction(link())).toEqual(link());
  });

  it('drops an entry with no label, no usable href, or a non-custom id', () => {
    expect(sanitizeCustomAction({ ...link(), label: '   ' })).toBeNull();
    expect(sanitizeCustomAction({ ...link(), href: 'javascript:alert(1)' })).toBeNull();
    expect(sanitizeCustomAction({ ...link(), id: 'new-job' })).toBeNull();
    expect(sanitizeCustomAction(null)).toBeNull();
    expect(sanitizeCustomAction('nope')).toBeNull();
  });

  it('is lenient on the cosmetic fields', () => {
    const out = sanitizeCustomAction({ id: 'custom:x', label: 'X', href: '/admin/me', tint: 'chartreuse' });
    expect(out?.icon).toBe('⚡');
    expect(out?.tint).toBe('accent');
    expect(out?.description).toBeUndefined();
  });

  it('trims a long label and keeps a multi-code-unit emoji intact', () => {
    const long = sanitizeCustomAction({ ...link(), label: 'x'.repeat(120) });
    expect(long?.label.length).toBe(40);
    // A flag is a pair of surrogate pairs; slicing the raw string by 2 would render a broken box.
    expect(sanitizeCustomAction({ ...link(), icon: '🇺🇸' })?.icon).toBe('🇺🇸');
  });
});

describe('normalizeCustomActions', () => {
  it('drops junk and duplicate ids, keeping the first of each', () => {
    const out = normalizeCustomActions([
      link(),
      link({ label: 'A duplicate id' }),
      link({ id: 'custom:other', label: 'Other' }),
      { garbage: true },
      null,
    ]);
    expect(out.map((a) => a.id)).toEqual(['custom:truck-checklist', 'custom:other']);
    expect(out[0].label).toBe('Truck checklist');
  });

  it('returns an empty list for a non-array, so a corrupt save cannot crash the hub', () => {
    expect(normalizeCustomActions(undefined)).toEqual([]);
    expect(normalizeCustomActions({ 0: link() })).toEqual([]);
  });
});

describe('nextCustomActionId', () => {
  it('derives a readable, prefixed id from the label', () => {
    expect(nextCustomActionId([], 'Truck Checklist')).toBe(`${CUSTOM_ACTION_PREFIX}truck-checklist`);
    expect(isCustomActionId(nextCustomActionId([], 'X'))).toBe(true);
  });

  it('disambiguates against ids already in use', () => {
    const taken = ['custom:truck-checklist'];
    expect(nextCustomActionId(taken, 'Truck checklist')).toBe('custom:truck-checklist-2');
    expect(nextCustomActionId([...taken, 'custom:truck-checklist-2'], 'Truck checklist'))
      .toBe('custom:truck-checklist-3');
  });

  it('falls back to a usable id when the label has no alphanumerics', () => {
    expect(nextCustomActionId([], '★★★')).toBe('custom:link');
  });
});

describe('duplicateCustomAction — C0k', () => {
  it('copies every field but takes a fresh id and a "copy" label', () => {
    const src = link({ description: 'Daily check', tint: 'warning' });
    const copy = duplicateCustomAction(src, [src.id]);
    expect(copy.id).not.toBe(src.id);
    expect(isCustomActionId(copy.id)).toBe(true);
    expect(copy.label).toBe('Truck checklist copy');
    // The whole point: destination, icon, tint and tooltip come along, or duplicating saves nothing.
    expect(copy.href).toBe(src.href);
    expect(copy.icon).toBe(src.icon);
    expect(copy.tint).toBe('warning');
    expect(copy.description).toBe('Daily check');
  });

  it('keeps duplicating cleanly — a copy of a copy gets its own id', () => {
    const src = link();
    const first = duplicateCustomAction(src, [src.id]);
    const second = duplicateCustomAction(src, [src.id, first.id]);
    expect(second.id).not.toBe(first.id);
    expect(new Set([src.id, first.id, second.id]).size).toBe(3);
  });

  it('never produces a label longer than the cap', () => {
    // A label already at the limit would otherwise overflow it by exactly " copy" — and a silently
    // truncated duplicate LABEL is worse than the retyping this feature exists to avoid, because
    // two tiles then read identically.
    const long = link({ label: 'x'.repeat(CUSTOM_ACTION_LABEL_MAX) });
    const copy = duplicateCustomAction(long, [long.id]);
    expect(copy.label.length).toBe(CUSTOM_ACTION_LABEL_MAX);
  });

  it('survives the sanitizer, so a duplicate can actually be stored', () => {
    const copy = duplicateCustomAction(link(), ['custom:truck-checklist']);
    expect(sanitizeCustomAction(copy)).toEqual(copy);
  });
});

describe('the icon choices', () => {
  it('the flat list is derived from the groups, so the two cannot disagree', () => {
    expect(CUSTOM_ACTION_ICON_CHOICES).toEqual(CUSTOM_ACTION_ICON_GROUPS.flatMap((g) => g.glyphs));
  });

  it('offers no duplicate glyph across groups', () => {
    const seen = new Set(CUSTOM_ACTION_ICON_CHOICES);
    expect(seen.size).toBe(CUSTOM_ACTION_ICON_CHOICES.length);
  });

  it('every group is labelled and non-empty', () => {
    for (const g of CUSTOM_ACTION_ICON_GROUPS) {
      expect(g.label.trim()).not.toBe('');
      expect(g.glyphs.length).toBeGreaterThan(0);
    }
  });

  it('keeps text-presentation glyphs, which are the only ones the tint reaches', () => {
    // Colour emoji ignore `color` entirely — the reason the widget paints a tinted disc behind the
    // glyph at all. ★ ✓ ✎ actually take the colour the user picked.
    for (const g of ['★', '✓', '✎']) expect(CUSTOM_ACTION_ICON_CHOICES).toContain(g);
  });
});

describe('toQuickActionDef', () => {
  it('renders as a link-kind action carrying its own glyph', () => {
    const def = toQuickActionDef(link());
    expect(def.kind).toBe('link');
    expect(def.href).toBe('/admin/equipment/today');
    expect(def.glyph).toBe('🚚');
    expect(def.allowedRoles).toEqual([]);
  });

  it('describes itself by its destination when no tooltip was given', () => {
    expect(toQuickActionDef(link()).description).toBe('Opens /admin/equipment/today');
    expect(toQuickActionDef(link({ description: 'Daily check' })).description).toBe('Daily check');
  });
});

describe('resolveActions — catalog and custom together', () => {
  it('resolves both kinds, in the order the user chose', () => {
    const out = resolveActions(['custom:truck-checklist', 'new-job'], [link()]);
    expect(out.map((a) => a.id)).toEqual(['custom:truck-checklist', 'new-job']);
  });

  it('skips an id whose definition is gone rather than rendering a dead tile', () => {
    // Both cases happen in the field: a retired catalog entry, and a custom link the user deleted
    // from another device before this layout was loaded.
    const out = resolveActions(['custom:deleted', 'retired-catalog-entry', 'new-job'], []);
    expect(out.map((a) => a.id)).toEqual(['new-job']);
  });

  it('leaves the shipped defaults resolvable', () => {
    expect(resolveActions([...DEFAULT_QUICK_ACTION_IDS], []).length).toBe(DEFAULT_QUICK_ACTION_IDS.length);
  });
});
