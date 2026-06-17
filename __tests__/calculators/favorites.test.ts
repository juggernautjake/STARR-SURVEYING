// __tests__/calculators/favorites.test.ts
//
// Slice P3-cf — star-toggle favorites for the calculator tab strip.
// The user can star multiple calculators; starred entries bubble to
// the left of the tab strip and persist across reloads via
// localStorage.
//
// Two halves to this test:
//   1) Behavioral — `sortModelsByFavorites` is a pure exported helper
//      so we test it directly: empty Set => original order; partial
//      favorites => starred bubble up, originals preserved within
//      their group.
//   2) Source-lock — assert that the provider wires the favorites
//      Set + toggleFavorite into the CalculatorCtx + tab strip JSX,
//      and that the CSS file declares the wrap + star + gold-accent
//      classes. This keeps the contract honest under future refactors.
//
// We avoid rendering React here — vitest in this repo runs without a
// DOM by default, and the helper + source-lock cover the same surface
// area at lower cost.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CALCULATOR_MODELS,
  sortModelsByFavorites,
  type ModelKey,
} from '../../app/admin/components/calculator/CalculatorProvider';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('sortModelsByFavorites (pure helper)', () => {
  it('returns the original order when no favorites are set', () => {
    const sorted = sortModelsByFavorites(CALCULATOR_MODELS, new Set<ModelKey>());
    expect(sorted.map(m => m.key)).toEqual(CALCULATOR_MODELS.map(m => m.key));
  });

  it('moves starred models to the front while preserving original order within each group', () => {
    // Pick two non-adjacent favorites; we expect them to land in
    // their original relative order at the head of the list, with the
    // rest of the models following in their original order.
    const favorites = new Set<ModelKey>(['casio-fx-991', 'ti-30xa']);
    const sorted = sortModelsByFavorites(CALCULATOR_MODELS, favorites);

    // First two entries should be the favorited ones, in source order
    // (casio-fx-991 appears before ti-30xa in CALCULATOR_MODELS).
    expect(sorted[0].key).toBe('casio-fx-991');
    expect(sorted[1].key).toBe('ti-30xa');

    // The remainder should be the un-starred models in their
    // original relative order.
    const rest = sorted.slice(2).map(m => m.key);
    const expectedRest = CALCULATOR_MODELS
      .filter(m => !favorites.has(m.key))
      .map(m => m.key);
    expect(rest).toEqual(expectedRest);
  });

  it('is a pure function — does not mutate the input array', () => {
    const before = CALCULATOR_MODELS.map(m => m.key);
    sortModelsByFavorites(CALCULATOR_MODELS, new Set<ModelKey>(['hp-35s']));
    const after = CALCULATOR_MODELS.map(m => m.key);
    expect(after).toEqual(before);
  });
});

describe('CalculatorProvider — favorites source-lock', () => {
  const SRC = read('app/admin/components/calculator/CalculatorProvider.tsx');

  it('declares a stable localStorage key for the favorites Set', () => {
    expect(SRC).toMatch(/FAVORITES_STORAGE_KEY\s*=\s*'calculatorFavorites'/);
  });

  it('exposes favorites + toggleFavorite on the context', () => {
    expect(SRC).toMatch(/favorites:\s*ReadonlySet<ModelKey>/);
    expect(SRC).toMatch(/toggleFavorite:\s*\(model: ModelKey\) => void/);
  });

  it('persists toggleFavorite changes to localStorage', () => {
    // The toggle should write a JSON array back to the favorites key.
    expect(SRC).toMatch(/localStorage\.setItem\(\s*FAVORITES_STORAGE_KEY/);
    expect(SRC).toMatch(/JSON\.stringify\(Array\.from\(next\)\)/);
  });

  it('passes orderedModels (sorted by favorites) to the tab strip', () => {
    expect(SRC).toMatch(/orderedModels\s*=\s*sortModelsByFavorites\(CALCULATOR_MODELS,\s*favorites\)/);
    expect(SRC).toMatch(/orderedModels\.map\(/);
  });

  it('renders a star button with a stable data-testid per model', () => {
    expect(SRC).toMatch(/data-testid=\{`calc-tab-fav-\$\{m\.key\}`\}/);
    expect(SRC).toMatch(/aria-pressed=\{isFav\}/);
    // Click handler must stop propagation so the tab itself doesn't
    // also activate — otherwise starring would switch tabs.
    expect(SRC).toMatch(/e\.stopPropagation\(\);\s*\n\s*toggleFavorite\(m\.key\)/);
  });
});

describe('CalculatorModal.css — favorites styling source-lock', () => {
  const CSS = read('app/admin/components/calculator/CalculatorModal.css');

  it('declares the tab-wrap + star button classes', () => {
    expect(CSS).toMatch(/\.calc-tabstrip__tab-wrap\s*\{/);
    expect(CSS).toMatch(/\.calc-tabstrip__fav\s*\{/);
  });

  it('paints starred favorites gold (#F59E0B)', () => {
    expect(CSS).toMatch(/\.calc-tabstrip__fav\[aria-pressed='true'\]\s*\{[\s\S]*?color:\s*#F59E0B/);
  });

  it('adds a gold accent stripe to favorited tabs', () => {
    expect(CSS).toMatch(/\.calc-tabstrip__tab-wrap--fav\s+\.calc-tabstrip__tab\s*\{[\s\S]*?border-top:\s*2px solid #F59E0B/);
  });
});
