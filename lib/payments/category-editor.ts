// lib/payments/category-editor.ts
//
// Phase-2 Slice 11 (data layer) of
// docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
//
// Pure validators + preview helpers for the (forthcoming)
// /admin/invoicing/categories editor where dad sets target percentages,
// renames buckets, picks colors, and archives categories.
//
// Why this is its own slice:
//   - Saving an invalid edit is much worse here than on most forms.
//     A percent sum ≠ 100 breaks the allocation engine; a non-snake
//     category_key collides with the schema's UNIQUE constraint; an
//     archived category that still has ledger rows can't be deleted
//     (ON DELETE RESTRICT). The editor needs all that logic BEFORE
//     it hits the save button so the failure mode is a friendly
//     inline warning, not a 500 from the route.
//   - The validators are also reused by the bulk-set-percentages
//     endpoint (when dad wants to slot in a saved profile like
//     "lean-month splits") and the import/seed scripts.

import type { AllocationCategoryInput } from './allocation-engine';

/** Category as it lives in the editor — same shape as the engine
 *  expects plus the display fields the rollup carries. */
export interface EditableCategory extends AllocationCategoryInput {
  label: string;
  description?: string | null;
  color?: string | null;
  /** Used by `previewEdit` to detect "this row already existed". */
  is_persisted?: boolean;
}

export interface ValidationError {
  /** The category_key of the offending row, or `__set__` when the
   *  error is about the collection as a whole (e.g. percent sum). */
  category_key: string;
  field: 'category_key' | 'label' | 'target_percent' | 'color' | 'set';
  message: string;
  /** When known, the value the user typed so the UI can highlight. */
  bad_value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  /** Rounded to 2 decimals for floating-point sanity. */
  total_active_percent: number;
}

/** Pure. Validate the editor state as a whole — every row + the
 *  cross-row invariants. */
export function validateCategorySet(categories: readonly EditableCategory[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const seenKeys = new Set<string>();

  for (const c of categories) {
    const single = validateSingleCategory(c);
    errors.push(...single.errors);

    if (seenKeys.has(c.category_key)) {
      errors.push({
        category_key: c.category_key,
        field: 'category_key',
        message: `duplicate category_key "${c.category_key}" — keys must be unique`,
      });
    }
    seenKeys.add(c.category_key);
  }

  const active = categories.filter((c) => c.is_active);
  const total_active_percent = roundTo(2, active.reduce((s, c) => s + (Number(c.target_percent) || 0), 0));

  if (active.length === 0) {
    warnings.push({
      category_key: '__set__',
      field: 'set',
      message: 'no active categories — the allocation engine will leave every payment unallocated.',
    });
  } else if (!isCloseTo(total_active_percent, 100, 0.01)) {
    // Hard error: allocation engine refuses to write when this is
    // wrong, so the save MUST be blocked.
    errors.push({
      category_key: '__set__',
      field: 'set',
      message:
        `active category percentages total ${total_active_percent}%, need exactly 100%. ` +
        diffMessage(active),
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    total_active_percent,
  };
}

/** Pure. Validate one row in isolation (no cross-row checks). */
export function validateSingleCategory(c: EditableCategory): { valid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!c.category_key || typeof c.category_key !== 'string') {
    errors.push({
      category_key: String(c.category_key ?? ''),
      field: 'category_key',
      message: 'category_key is required.',
      bad_value: c.category_key,
    });
  } else if (!isSnakeCase(c.category_key)) {
    errors.push({
      category_key: c.category_key,
      field: 'category_key',
      message: `category_key "${c.category_key}" must be snake_case (lowercase, digits, underscores; cannot start with a digit).`,
      bad_value: c.category_key,
    });
  } else if (c.category_key.length > 64) {
    errors.push({
      category_key: c.category_key,
      field: 'category_key',
      message: `category_key "${c.category_key}" is ${c.category_key.length} chars; max 64.`,
      bad_value: c.category_key,
    });
  }

  if (!c.label || typeof c.label !== 'string' || c.label.trim().length === 0) {
    errors.push({
      category_key: c.category_key,
      field: 'label',
      message: 'label is required.',
      bad_value: c.label,
    });
  } else if (c.label.trim().length > 80) {
    errors.push({
      category_key: c.category_key,
      field: 'label',
      message: `label is ${c.label.trim().length} chars; max 80.`,
      bad_value: c.label,
    });
  }

  if (!Number.isFinite(c.target_percent) || c.target_percent < 0 || c.target_percent > 100) {
    errors.push({
      category_key: c.category_key,
      field: 'target_percent',
      message: 'target_percent must be a number between 0 and 100.',
      bad_value: c.target_percent,
    });
  } else {
    // Schema is NUMERIC(5,2) — only 2 decimal places fit. Anything
    // beyond round-down silently.
    const rounded = roundTo(2, c.target_percent);
    if (Math.abs(c.target_percent - rounded) > 0.0001) {
      errors.push({
        category_key: c.category_key,
        field: 'target_percent',
        message: 'target_percent has more than 2 decimal places; database stores NUMERIC(5,2).',
        bad_value: c.target_percent,
      });
    }
  }

  if (c.color !== undefined && c.color !== null && !isValidHexColor(c.color)) {
    errors.push({
      category_key: c.category_key,
      field: 'color',
      message: `color "${c.color}" must be a 7-char hex like #1D3095.`,
      bad_value: c.color,
    });
  }

  return { valid: errors.length === 0, errors };
}

// ── Edit preview ─────────────────────────────────────────────────

export interface EditDelta {
  /** Categories that didn't exist in `original`. */
  added: EditableCategory[];
  /** Categories whose target_percent / label / color / is_active /
   *  description changed. */
  modified: Array<{
    category_key: string;
    before: EditableCategory;
    after: EditableCategory;
    fields_changed: Array<'target_percent' | 'label' | 'color' | 'is_active' | 'description' | 'sort_order'>;
  }>;
  /** Categories in `original` not present in `next`. The UI surfaces
   *  these for soft-archive (is_active=false), NOT hard-delete —
   *  the ledger ON DELETE RESTRICT will block a true DELETE on a
   *  category that's been used. */
  removed: EditableCategory[];
}

export interface EditPreview {
  validation: ValidationResult;
  delta: EditDelta;
  /** Change in `total_active_percent` between before and after.
   *  Negative = post-edit is below 100%; positive = above. */
  percent_delta: number;
}

/** Pure. Compare an editor draft against the persisted state. The
 *  UI calls this on every keystroke to render diff badges + the
 *  enabled/disabled state of the Save button. */
export function previewEdit(
  original: readonly EditableCategory[],
  draft: readonly EditableCategory[],
): EditPreview {
  const byKeyOriginal = new Map(original.map((c) => [c.category_key, c]));
  const byKeyNext = new Map(draft.map((c) => [c.category_key, c]));

  const added: EditableCategory[] = [];
  const modified: EditDelta['modified'] = [];
  const removed: EditableCategory[] = [];

  for (const c of draft) {
    const prior = byKeyOriginal.get(c.category_key);
    if (!prior) {
      added.push(c);
      continue;
    }
    const fields_changed: EditDelta['modified'][number]['fields_changed'] = [];
    if (!isCloseTo(Number(prior.target_percent), Number(c.target_percent), 0.001)) fields_changed.push('target_percent');
    if (prior.label.trim() !== c.label.trim()) fields_changed.push('label');
    if ((prior.color ?? null) !== (c.color ?? null)) fields_changed.push('color');
    if (prior.is_active !== c.is_active) fields_changed.push('is_active');
    if ((prior.description ?? null) !== (c.description ?? null)) fields_changed.push('description');
    if (prior.sort_order !== c.sort_order) fields_changed.push('sort_order');
    if (fields_changed.length > 0) {
      modified.push({ category_key: c.category_key, before: prior, after: c, fields_changed });
    }
  }
  for (const c of original) {
    if (!byKeyNext.has(c.category_key)) removed.push(c);
  }

  const validation = validateCategorySet(draft);
  const beforePct = roundTo(2, original.filter((c) => c.is_active).reduce((s, c) => s + Number(c.target_percent), 0));
  const percent_delta = roundTo(2, validation.total_active_percent - beforePct);

  return { validation, delta: { added, modified, removed }, percent_delta };
}

// ── Misc helpers ─────────────────────────────────────────────────

/** Pure. Coerce arbitrary user input into a snake_case key. Used
 *  by the "+ New category" affordance to suggest a key from the
 *  typed label. */
export function suggestCategoryKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1') // never start with a digit
    .slice(0, 64);
}

// ── Internals ────────────────────────────────────────────────────

function isSnakeCase(s: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(s);
}

function isValidHexColor(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function isCloseTo(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function roundTo(places: number, n: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function diffMessage(active: readonly EditableCategory[]): string {
  const top3 = active
    .slice()
    .sort((a, b) => Number(b.target_percent) - Number(a.target_percent))
    .slice(0, 3)
    .map((c) => `${c.category_key} ${roundTo(2, Number(c.target_percent))}%`)
    .join(', ');
  return active.length > 0 ? `Largest buckets: ${top3}.` : '';
}
