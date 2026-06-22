// __tests__/payments/category-editor.test.ts
//
// Phase-2 Slice 11 (data layer) source-lock for
// lib/payments/category-editor.ts.

import { describe, it, expect } from 'vitest';
import {
  previewEdit,
  suggestCategoryKey,
  validateCategorySet,
  validateSingleCategory,
  type EditableCategory,
} from '@/lib/payments/category-editor';

const cat = (overrides: Partial<EditableCategory> = {}): EditableCategory => ({
  id: 'c-default',
  category_key: 'savings',
  label: 'Savings',
  description: '',
  color: '#059669',
  target_percent: 0,
  sort_order: 100,
  is_active: true,
  is_persisted: true,
  ...overrides,
});

describe('validateSingleCategory — category_key', () => {
  it('rejects empty key', () => {
    const { errors } = validateSingleCategory(cat({ category_key: '' }));
    expect(errors.some((e) => e.field === 'category_key' && /required/.test(e.message))).toBe(true);
  });

  it('rejects non-snake-case key (uppercase, dashes, leading digit)', () => {
    expect(validateSingleCategory(cat({ category_key: 'Savings'   })).valid).toBe(false);
    expect(validateSingleCategory(cat({ category_key: 'sav-ings'  })).valid).toBe(false);
    expect(validateSingleCategory(cat({ category_key: '2savings'  })).valid).toBe(false);
    expect(validateSingleCategory(cat({ category_key: 'sav ings'  })).valid).toBe(false);
  });

  it('accepts valid snake_case', () => {
    expect(validateSingleCategory(cat({ category_key: 'savings'             })).valid).toBe(true);
    expect(validateSingleCategory(cat({ category_key: 'employee_salaries_v2' })).valid).toBe(true);
    expect(validateSingleCategory(cat({ category_key: 'a'                    })).valid).toBe(true);
  });

  it('rejects key longer than 64 chars', () => {
    const long = 'a'.repeat(65);
    expect(validateSingleCategory(cat({ category_key: long })).valid).toBe(false);
  });
});

describe('validateSingleCategory — label', () => {
  it('rejects empty / whitespace-only label', () => {
    expect(validateSingleCategory(cat({ label: '' })).valid).toBe(false);
    expect(validateSingleCategory(cat({ label: '   ' })).valid).toBe(false);
  });

  it('rejects label longer than 80 chars', () => {
    expect(validateSingleCategory(cat({ label: 'x'.repeat(81) })).valid).toBe(false);
  });

  it('accepts normal labels', () => {
    expect(validateSingleCategory(cat({ label: 'Equipment & Supplies' })).valid).toBe(true);
  });
});

describe('validateSingleCategory — target_percent', () => {
  it('rejects negative, > 100, NaN, Infinity', () => {
    expect(validateSingleCategory(cat({ target_percent: -1 })).valid).toBe(false);
    expect(validateSingleCategory(cat({ target_percent: 100.01 })).valid).toBe(false);
    expect(validateSingleCategory(cat({ target_percent: Number.NaN })).valid).toBe(false);
    expect(validateSingleCategory(cat({ target_percent: Number.POSITIVE_INFINITY })).valid).toBe(false);
  });

  it('accepts 0..100 with up to 2 decimal places', () => {
    expect(validateSingleCategory(cat({ target_percent: 0 })).valid).toBe(true);
    expect(validateSingleCategory(cat({ target_percent: 25.5 })).valid).toBe(true);
    expect(validateSingleCategory(cat({ target_percent: 33.33 })).valid).toBe(true);
    expect(validateSingleCategory(cat({ target_percent: 100 })).valid).toBe(true);
  });

  it('rejects 3+ decimal places (NUMERIC(5,2) constraint)', () => {
    expect(validateSingleCategory(cat({ target_percent: 33.333 })).valid).toBe(false);
  });
});

describe('validateSingleCategory — color', () => {
  it('accepts valid #RRGGBB hex (case-insensitive)', () => {
    expect(validateSingleCategory(cat({ color: '#1D3095' })).valid).toBe(true);
    expect(validateSingleCategory(cat({ color: '#abcdef' })).valid).toBe(true);
  });

  it('accepts null / undefined (color is optional)', () => {
    expect(validateSingleCategory(cat({ color: null })).valid).toBe(true);
    expect(validateSingleCategory(cat({ color: undefined })).valid).toBe(true);
  });

  it('rejects malformed colors', () => {
    expect(validateSingleCategory(cat({ color: '1D3095' })).valid).toBe(false);
    expect(validateSingleCategory(cat({ color: '#ZZZ' })).valid).toBe(false);
    expect(validateSingleCategory(cat({ color: '#1D3' })).valid).toBe(false);
  });
});

describe('validateCategorySet — cross-row invariants', () => {
  it('passes when active percentages sum to exactly 100', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings',   target_percent: 50, sort_order: 10 }),
      cat({ category_key: 'investing', target_percent: 50, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.total_active_percent).toBe(100);
  });

  it('FAILS when active percentages sum to < 100', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings',   target_percent: 50, sort_order: 10 }),
      cat({ category_key: 'investing', target_percent: 30, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /80/.test(e.message))).toBe(true);
  });

  it('FAILS when active percentages sum to > 100', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings',   target_percent: 70, sort_order: 10 }),
      cat({ category_key: 'investing', target_percent: 50, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(false);
  });

  it('IGNORES inactive categories when summing percentages', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings',   target_percent: 100, sort_order: 10 }),
      cat({ category_key: 'archived',  target_percent: 50,  is_active: false, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.total_active_percent).toBe(100);
  });

  it('warns (not errors) when there are no active categories', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings', target_percent: 0, is_active: false }),
    ]);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]!.message).toMatch(/no active categories/);
  });

  it('flags duplicate category_keys as an error', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings', target_percent: 50, sort_order: 10 }),
      cat({ category_key: 'savings', target_percent: 50, sort_order: 20 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /duplicate/.test(e.message))).toBe(true);
  });

  it('tolerates floating-point fuzz within ±0.01', () => {
    const result = validateCategorySet([
      cat({ category_key: 'savings',   target_percent: 33.33, sort_order: 10 }),
      cat({ category_key: 'investing', target_percent: 33.33, sort_order: 20 }),
      cat({ category_key: 'equip',     target_percent: 33.34, sort_order: 30 }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.total_active_percent).toBe(100);
  });
});

describe('previewEdit — added / modified / removed delta', () => {
  const original: EditableCategory[] = [
    cat({ id: 'a', category_key: 'savings',   target_percent: 50, label: 'Savings' }),
    cat({ id: 'b', category_key: 'investing', target_percent: 50, label: 'Investing' }),
  ];

  it('detects an ADDED category', () => {
    const draft = [...original, cat({ id: 'c', category_key: 'emergency', target_percent: 0, label: 'Emergency' })];
    const preview = previewEdit(original, draft);
    expect(preview.delta.added.map((c) => c.category_key)).toEqual(['emergency']);
  });

  it('detects a target_percent change as MODIFIED with fields_changed', () => {
    const draft = [
      { ...original[0]!, target_percent: 60 },
      original[1]!,
    ];
    const preview = previewEdit(original, draft);
    expect(preview.delta.modified).toHaveLength(1);
    expect(preview.delta.modified[0]!.fields_changed).toContain('target_percent');
  });

  it('detects a label / color / is_active / sort_order change', () => {
    const draft = [
      { ...original[0]!, label: 'Cash Reserve', color: '#000000', is_active: false, sort_order: 200 },
      original[1]!,
    ];
    const preview = previewEdit(original, draft);
    expect(preview.delta.modified[0]!.fields_changed.sort()).toEqual(
      ['color', 'is_active', 'label', 'sort_order'].sort(),
    );
  });

  it('detects a REMOVED category (UI should soft-archive, not delete)', () => {
    const draft = [original[0]!];
    const preview = previewEdit(original, draft);
    expect(preview.delta.removed.map((c) => c.category_key)).toEqual(['investing']);
  });

  it('reports percent_delta as the change in total active percentage', () => {
    const draft = [
      { ...original[0]!, target_percent: 40 },
      original[1]!,
    ];
    const preview = previewEdit(original, draft);
    expect(preview.percent_delta).toBe(-10);
    expect(preview.validation.valid).toBe(false);  // total now 90
  });

  it('does not flag identical rows as modified', () => {
    const preview = previewEdit(original, [...original]);
    expect(preview.delta.modified).toHaveLength(0);
    expect(preview.delta.added).toHaveLength(0);
    expect(preview.delta.removed).toHaveLength(0);
  });
});

describe('suggestCategoryKey', () => {
  it('lowercases and replaces non-alphanumerics with underscores', () => {
    expect(suggestCategoryKey('Equipment & Supplies')).toBe('equipment_supplies');
    expect(suggestCategoryKey('Travel — Food & Gas')).toBe('travel_food_gas');
  });

  it('strips leading/trailing underscores', () => {
    expect(suggestCategoryKey('  Hello, World!  ')).toBe('hello_world');
  });

  it('prefixes an underscore when the result starts with a digit', () => {
    expect(suggestCategoryKey('401(k) contributions')).toBe('_401_k_contributions');
  });

  it('caps at 64 chars', () => {
    expect(suggestCategoryKey('x'.repeat(100)).length).toBeLessThanOrEqual(64);
  });
});
