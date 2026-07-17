// __tests__/dnd/ig-feat-text-coverage.test.ts — the feat-side parallel of condition-text-coverage: every
// IG feat the library/search/AI-grounding surfaces MUST carry its mechanical effect text (and, when the
// site lists them, its prerequisites). A feat that is just a name explains nothing — it breaks both the
// "AI answers what X does from the library" promise and IG Ground Rule 2 (source-faithful, never a bare
// placeholder standing in for real rules). If a future feat is genuinely WIP on the site, it must be
// labelled as such in `effect` (an honest "not yet defined on the site"), not left empty — an empty string
// here is the failure this guards. igAllFeats() is the single list the page, cross-system search, the
// provenance classifier, and grounding all read, so pinning it here covers every downstream reader.
import { describe, it, expect } from 'vitest';
import { igAllFeats } from '@/lib/dnd/systems/intuitive-games/feats';

describe('Intuitive Games feats each carry real mechanical text', () => {
  const feats = igAllFeats();

  it('the catalog is non-empty (guard would be vacuous otherwise)', () => {
    expect(feats.length).toBeGreaterThan(100);
  });

  it('every feat has a non-empty effect', () => {
    const empty = feats.filter((f) => !f.effect || !f.effect.trim()).map((f) => f.name);
    expect(empty, `these IG feats have no effect text (a name that explains nothing)`).toEqual([]);
  });

  it('every feat effect is substantive, not a bare placeholder', () => {
    // A one- or two-word "effect" is a placeholder, not rules text. Real IG effects are full sentences.
    const stub = feats.filter((f) => f.effect.trim().split(/\s+/).length < 4).map((f) => f.name);
    expect(stub, `these IG feats have suspiciously short effect text (likely a placeholder)`).toEqual([]);
  });

  it('any duplicate name is a cross-page listing, never a same-page dup', () => {
    // The IG site itself lists a few feats (e.g. Shield Proficiency, Weapon Training) on BOTH the General
    // and Combat pages, so a name can legitimately appear twice — but only once per page. Two entries with
    // the same name AND the same category is an accidental transcription dup that would shadow one in the
    // per-page display. That is what this catches; genuine cross-page duplicates are allowed.
    const seen = new Map<string, Set<string>>();
    const samePageDups: string[] = [];
    for (const f of feats) {
      const cats = seen.get(f.name) ?? new Set<string>();
      if (cats.has(f.category)) samePageDups.push(`${f.name} (${f.category})`);
      cats.add(f.category);
      seen.set(f.name, cats);
    }
    expect(samePageDups, `same-page duplicate IG feats (accidental transcription dup)`).toEqual([]);
  });
});
