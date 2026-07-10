// __tests__/lib/solutionChecker.test.ts
//
// Coverage for the practice-engine answer checker. The numeric branch
// has three "correct" zones (exact, close-but-warn, close-by-relative-
// error) and one "wrong" zone — this matters because it's the diff
// between a student getting credit and not.

import { describe, it, expect } from 'vitest';
import {
  checkNumericAnswer,
  checkTextAnswer,
  checkMultipleChoice,
  checkMultiSelect,
  checkOrdering,
  checkAnswer,
} from '@/lib/solutionChecker';

describe('checkNumericAnswer', () => {
  it('marks an exact match correct, not close, no warning', () => {
    const r = checkNumericAnswer('1.23', '1.23');
    expect(r.is_correct).toBe(true);
    expect(r.is_close).toBe(false);
    expect(r.rounding_warning).toBeUndefined();
    expect(r.feedback).toBe('Correct!');
  });

  it('honors the default 0.01 absolute tolerance', () => {
    // 1.235 - 1.230 = 0.005, well inside the 0.01 tolerance
    expect(checkNumericAnswer('1.235', '1.230').is_correct).toBe(true);
  });

  it('marks a close-but-not-exact answer correct + close + warns', () => {
    // 1.22 vs 1.23 → diff 0.01, exactly at tolerance edge → correct.
    // 1.25 vs 1.23 → diff 0.02, outside 0.01 but inside 5×=0.05 → close.
    const r = checkNumericAnswer('1.25', '1.23');
    expect(r.is_correct).toBe(true);
    expect(r.is_close).toBe(true);
    expect(r.rounding_warning).toBeTruthy();
  });

  it('uses relative-error 0.1% as the close-enough bound for large numbers', () => {
    // 100_000 ± 50 is well outside 0.05 absolute but well inside 0.1%.
    const r = checkNumericAnswer('100050', '100000');
    expect(r.is_correct).toBe(true);
    expect(r.is_close).toBe(true);
    expect(r.rounding_warning).toContain('%');
  });

  it('marks a wrong answer correctly', () => {
    const r = checkNumericAnswer('1.5', '1.0');
    expect(r.is_correct).toBe(false);
    expect(r.is_close).toBe(false);
    expect(r.feedback).toContain('Incorrect');
    expect(r.feedback).toContain('1.0');
  });

  it('detects rounding-precision differences specifically', () => {
    // 1.2 vs 1.23 → diff 0.03, inside the 0.05 close band; different
    // decimal counts → should call out the precision difference.
    const r = checkNumericAnswer('1.2', '1.23');
    expect(r.is_correct).toBe(true);
    expect(r.rounding_warning).toContain('decimal place');
  });

  it('rejects non-numeric user input with a useful message', () => {
    const r = checkNumericAnswer('abc', '1.0');
    expect(r.is_correct).toBe(false);
    expect(r.difference).toBeNull();
    expect(r.feedback).toContain('not a valid number');
  });

  it('surfaces a broken question (non-numeric correct answer)', () => {
    const r = checkNumericAnswer('1.0', 'abc');
    expect(r.is_correct).toBe(false);
    expect(r.feedback).toContain('correct answer is not numeric');
  });

  it('honors a custom tighter tolerance', () => {
    // diff = 0.005, tolerance = 0.001 → not exact, but still inside 5x=0.005 close band
    const r = checkNumericAnswer('1.235', '1.230', 0.001);
    expect(r.is_correct).toBe(true);
    expect(r.is_close).toBe(true);
  });
});

describe('checkTextAnswer', () => {
  it('is case-insensitive and trim-tolerant on exact match', () => {
    expect(checkTextAnswer('  HELLO ', 'hello').is_correct).toBe(true);
  });

  it('rejects a wrong text answer', () => {
    expect(checkTextAnswer('world', 'hello').is_correct).toBe(false);
  });

  it('accepts a substring match when partial=true', () => {
    const r = checkTextAnswer('the great gatsby novel', 'the great gatsby', true);
    expect(r.is_correct).toBe(true);
    expect(r.is_close).toBe(true);
    expect(r.feedback).toContain('Partial');
  });

  it('does NOT accept a substring match when partial=false (default)', () => {
    expect(checkTextAnswer('the great gatsby novel', 'the great gatsby').is_correct).toBe(false);
  });

  it('treats null/undefined input as empty string', () => {
    // (userAnswer || '') handles the falsy case; correct answer is just empty too.
    expect(checkTextAnswer('', '').is_correct).toBe(true);
  });
});

describe('checkMultipleChoice', () => {
  it('matches case-insensitively', () => {
    expect(checkMultipleChoice(' A ', 'a').is_correct).toBe(true);
  });

  it('rejects a mismatch', () => {
    expect(checkMultipleChoice('A', 'B').is_correct).toBe(false);
  });
});

describe('checkMultiSelect', () => {
  it('marks the exact set correct, order-insensitive', () => {
    const r = checkMultiSelect('["D","B"]', '["B","D"]');
    expect(r.is_correct).toBe(true);
    expect(r.partial_score).toBe(1);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(checkMultiSelect('[" b ","d"]', '["B","D"]').is_correct).toBe(true);
  });

  it('rejects a missing correct option (partial, not full credit)', () => {
    const r = checkMultiSelect('["B"]', '["B","D"]');
    expect(r.is_correct).toBe(false);
    expect(r.partial_score).toBeCloseTo(0.5);
  });

  it('rejects an extra (false-positive) option', () => {
    const r = checkMultiSelect('["B","D","A"]', '["B","D"]');
    expect(r.is_correct).toBe(false);
    // 2 hits − 1 false positive = 1 / 2 correct = 0.5
    expect(r.partial_score).toBeCloseTo(0.5);
  });

  it('tolerates a bare comma-delimited answer string', () => {
    expect(checkMultiSelect('B,D', '["B","D"]').is_correct).toBe(true);
  });

  it('is not correct against an empty correct set', () => {
    expect(checkMultiSelect('["B"]', '[]').is_correct).toBe(false);
  });
});

describe('checkOrdering', () => {
  it('marks the exact sequence correct', () => {
    const r = checkOrdering('["A","B","C"]', '["A","B","C"]');
    expect(r.is_correct).toBe(true);
    expect(r.partial_score).toBe(1);
  });

  it('is order-SENSITIVE (a swap is wrong)', () => {
    const r = checkOrdering('["B","A","C"]', '["A","B","C"]');
    expect(r.is_correct).toBe(false);
    // only position 3 (C) is in the right slot → 1/3
    expect(r.partial_score).toBeCloseTo(1 / 3);
  });

  it('is case- and whitespace-insensitive on the items', () => {
    expect(checkOrdering('[" a ","b","c"]', '["A","B","C"]').is_correct).toBe(true);
  });

  it('is wrong when lengths differ', () => {
    expect(checkOrdering('["A","B"]', '["A","B","C"]').is_correct).toBe(false);
  });

  it('tolerates a comma-delimited answer', () => {
    expect(checkOrdering('A,B,C', '["A","B","C"]').is_correct).toBe(true);
  });
});

describe('checkAnswer (dispatch)', () => {
  it('routes numeric_input and math_template to the numeric checker', () => {
    expect(checkAnswer('1.0', '1.0', 'numeric_input').is_correct).toBe(true);
    expect(checkAnswer('1.0', '1.0', 'math_template').is_correct).toBe(true);
  });

  it('routes multiple_choice and true_false to the multiple-choice checker', () => {
    expect(checkAnswer('a', 'A', 'multiple_choice').is_correct).toBe(true);
    expect(checkAnswer('true', 'TRUE', 'true_false').is_correct).toBe(true);
  });

  it('routes multi_select to the set-equality checker (not text match)', () => {
    expect(checkAnswer('["D","B"]', '["B","D"]', 'multi_select').is_correct).toBe(true);
    expect(checkAnswer('["B"]', '["B","D"]', 'multi_select').is_correct).toBe(false);
  });

  it('routes ordering to the sequence checker (order matters)', () => {
    expect(checkAnswer('["A","B","C"]', '["A","B","C"]', 'ordering').is_correct).toBe(true);
    expect(checkAnswer('["A","C","B"]', '["A","B","C"]', 'ordering').is_correct).toBe(false);
  });

  it('routes drag_label position-wise (each target must match)', () => {
    // arrays are parallel to the targets: [target0 term, target1 term, ...]
    expect(checkAnswer('["Plumb line","Optical axis"]', '["Plumb line","Optical axis"]', 'drag_label').is_correct).toBe(true);
    expect(checkAnswer('["Optical axis","Plumb line"]', '["Plumb line","Optical axis"]', 'drag_label').is_correct).toBe(false);
    expect(checkAnswer('["Plumb line",""]', '["Plumb line","Optical axis"]', 'drag_label').is_correct).toBe(false);
  });

  it('routes short_answer to text checker with partial matching on', () => {
    expect(checkAnswer('hello there', 'hello', 'short_answer').is_correct).toBe(true);
  });

  it('routes fill_blank to text checker with partial OFF', () => {
    expect(checkAnswer('hello there', 'hello', 'fill_blank').is_correct).toBe(false);
  });

  it('falls back to strict text-match for unknown question types', () => {
    expect(checkAnswer('hello', 'hello', 'some_new_kind').is_correct).toBe(true);
    expect(checkAnswer('hello world', 'hello', 'some_new_kind').is_correct).toBe(false);
  });
});
