// lib/learn/questionDelivery.ts
// Shared question SHAPING (server → client) and GRADING logic for every learn
// surface: lesson quizzes, module tests, exam-prep practice, and the full FS
// Exam Simulator. Both `app/api/admin/learn/quizzes/route.ts` and
// `app/api/admin/learn/exam-prep/fs/mock-exam/route.ts` call these so that a
// question of any type is generated, figured, and graded identically no matter
// which surface serves it.
//
// This module is intentionally PURE — no Supabase, no auth, no side effects — so
// it can be unit-tested and reused. Essay grading (which needs the Anthropic
// API) stays in the quizzes route; everything else lives here.

import {
  generateDynamicQuestion,
  evalFormula,
  type ProblemTemplate,
} from '@/lib/problemEngine';
import { buildDiagramFromSpec } from '@/lib/diagrams/survey-diagram';

/* ============================================================================
 * TYPES
 * ==========================================================================*/

// A raw question_bank row (only the columns the delivery path reads).
export interface RawQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options?: unknown;
  correct_answer?: string;
  explanation?: string;
  difficulty?: string;
  tags?: string[];
  is_dynamic?: boolean;
  template_id?: string | null;
  tolerance?: number | null;
  diagram?: unknown;
  study_references?: unknown;
  [key: string]: unknown;
}

export type DragLabelOptions = { terms: string[]; targets: string[] };
export type HotspotOptions = { regions: { id: string; label: string }[] };

// The client-facing question shape. `options` is a string[] for most types but
// an object for drag_label ({terms,targets}) and hotspot ({regions}).
export interface ClientQuestion {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | DragLabelOptions | HotspotOptions;
  difficulty: string;
  tags: string[];
  // legacy math_template
  _math_vars?: Record<string, number>;
  _original_type?: string;
  // dynamic (template-linked) — echoed back at grade time
  _dynamic?: boolean;
  _template_id?: string;
  _generated_answer?: string;
  _solution_steps?: unknown[];
  _tolerance?: number;
  _diagram?: string;
}

// The answer payload the client echoes back at grade time.
export interface AnswerPayload {
  question_id: string;
  user_answer: string;
  math_vars?: Record<string, number>;
  _dynamic?: boolean;
  _generated_answer?: string;
  _tolerance?: number;
  _solution_steps?: unknown[];
}

export interface SyncGradeResult {
  question_id: string;
  user_answer: string;
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  partial_score?: number;
  blank_results?: boolean[];
  correct_answers?: string[];
  solution_steps?: unknown[];
  tolerance?: number;
}

/* ============================================================================
 * DIAGRAMS
 * ==========================================================================*/

// Resolve a fixed figure stored on a STATIC question_bank row (q.diagram is a
// DiagramSpec with literal values). Returns the inline SVG or undefined.
export function staticDiagram(q: { diagram?: unknown }): string | undefined {
  if (!q || !q.diagram) return undefined;
  const svg = buildDiagramFromSpec(q.diagram as never, {});
  return svg || undefined;
}

/* ============================================================================
 * MATH TEMPLATE HELPERS (legacy {{name:min:max}} format)
 * ==========================================================================*/

function parseMathVars(text: string): { name: string; min: number; max: number }[] {
  const regex = /\{\{(\w+):(\d+):(\d+)\}\}/g;
  const vars: { name: string; min: number; max: number }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.push({ name: match[1], min: parseInt(match[2]), max: parseInt(match[3]) });
  }
  return vars;
}

function generateMathVars(varDefs: { name: string; min: number; max: number }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of varDefs) {
    result[v.name] = Math.floor(Math.random() * (v.max - v.min + 1)) + v.min;
  }
  return result;
}

function substituteMathVars(text: string, vars: Record<string, number>): string {
  return text.replace(/\{\{(\w+):\d+:\d+\}\}/g, (_match, name) => String(vars[name] ?? name));
}

/* ============================================================================
 * SHAPING — server row → client question
 * ==========================================================================*/

/**
 * Turn a raw question_bank row into the client-facing question. Handles:
 *  - dynamic template-linked questions (fresh random values + matching figure),
 *  - legacy math_template ({{v:min:max}}),
 *  - fill_blank / drag_label / hotspot object option shapes,
 *  - essay (no options, reference answer hidden),
 *  - standard MC / true_false / short_answer / numeric_input (+ static figure).
 *
 * `template` is the resolved ProblemTemplate for a dynamic row (or null/undefined).
 */
export function shapeQuestion(q: RawQuestion, template?: ProblemTemplate | null): ClientQuestion {
  // Dynamic template-linked questions: generate fresh values each attempt.
  if (q.is_dynamic && q.template_id && template) {
    const generated = generateDynamicQuestion(q as never, template);
    if (generated) {
      return {
        id: q.id,
        question_text: generated.question_text,
        question_type: template.question_type === 'multiple_choice' ? 'multiple_choice' : 'numeric_input',
        options: generated.options || [],
        difficulty: q.difficulty || 'medium',
        tags: q.tags || [],
        _dynamic: true,
        _template_id: q.template_id,
        _generated_answer: generated.correct_answer,
        _solution_steps: generated.solution_steps,
        _tolerance: template.answer_format?.tolerance || q.tolerance || 0.01,
        _diagram: generated.diagram,
      };
    }
  }

  // Legacy math_template — generate concrete values.
  if (q.question_type === 'math_template') {
    const varDefs = parseMathVars(q.question_text);
    const vars = generateMathVars(varDefs);
    return {
      id: q.id,
      question_text: substituteMathVars(q.question_text, vars),
      question_type: 'numeric_input',
      options: [],
      difficulty: q.difficulty || 'medium',
      tags: q.tags || [],
      _math_vars: vars,
      _original_type: 'math_template',
    };
  }

  // fill_blank — shuffle the option pool but keep the question intact.
  if (q.question_type === 'fill_blank') {
    const opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: (opts as string[]).sort(() => Math.random() - 0.5),
      difficulty: q.difficulty || 'medium',
      tags: q.tags || [],
    };
  }

  // essay — no options, never expose the reference answer.
  if (q.question_type === 'essay') {
    return {
      id: q.id,
      question_text: q.question_text,
      question_type: 'essay',
      options: [],
      difficulty: q.difficulty || 'medium',
      tags: q.tags || [],
    };
  }

  // drag_label — options is { terms, targets }; shuffle terms, keep targets.
  if (q.question_type === 'drag_label') {
    const raw = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || {});
    const terms = Array.isArray(raw.terms) ? [...raw.terms].sort(() => Math.random() - 0.5) : [];
    const targets = Array.isArray(raw.targets) ? raw.targets : [];
    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: { terms, targets },
      difficulty: q.difficulty || 'medium',
      tags: q.tags || [],
      _diagram: staticDiagram(q),
    };
  }

  // hotspot — options is { regions:[{id,label}] }; shuffle region order.
  if (q.question_type === 'hotspot') {
    const raw = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || {});
    const regions = Array.isArray(raw.regions) ? [...raw.regions].sort(() => Math.random() - 0.5) : [];
    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: { regions },
      difficulty: q.difficulty || 'medium',
      tags: q.tags || [],
      _diagram: staticDiagram(q),
    };
  }

  // Standard: multiple_choice / true_false / multi_select / short_answer /
  // numeric_input. Short/numeric have no options; the rest shuffle.
  const opts = q.question_type === 'short_answer' || q.question_type === 'numeric_input'
    ? []
    : (typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []))
        .sort(() => Math.random() - 0.5);

  return {
    id: q.id,
    question_text: q.question_text,
    question_type: q.question_type,
    options: opts,
    difficulty: q.difficulty || 'medium',
    tags: q.tags || [],
    _diagram: staticDiagram(q),
  };
}

/** Which template_ids does this batch of rows need resolved? */
export function neededTemplateIds(rows: RawQuestion[]): string[] {
  return [...new Set(
    rows.filter(q => q.is_dynamic && q.template_id).map(q => q.template_id as string)
  )];
}

/* ============================================================================
 * GRADING HELPERS
 * ==========================================================================*/

export function gradeFillBlank(userAnswer: string, correctAnswer: string): {
  is_correct: boolean; partial_score: number; blank_results: boolean[]; correct_answers: string[];
} {
  let userBlanks: string[];
  let correctBlanks: string[];
  try { userBlanks = JSON.parse(userAnswer); } catch { userBlanks = []; }
  try { correctBlanks = JSON.parse(correctAnswer); } catch { correctBlanks = [correctAnswer]; }

  const blank_results = correctBlanks.map((correct, i) => {
    const user = (userBlanks[i] || '').toLowerCase().trim();
    return user === correct.toLowerCase().trim();
  });
  const correctCount = blank_results.filter(Boolean).length;
  const total = correctBlanks.length;
  return {
    is_correct: correctCount === total,
    partial_score: total > 0 ? correctCount / total : 0,
    blank_results,
    correct_answers: correctBlanks,
  };
}

export function gradeMultiSelect(userAnswer: string, correctAnswer: string): { is_correct: boolean; partial_score: number } {
  let userArr: string[];
  let correctArr: string[];
  try { userArr = JSON.parse(userAnswer); } catch { userArr = []; }
  try { correctArr = JSON.parse(correctAnswer); } catch { correctArr = [correctAnswer]; }

  const userSet = new Set(userArr.map(s => s.toLowerCase().trim()));
  const correctSet = new Set(correctArr.map(s => s.toLowerCase().trim()));
  const hits = [...correctSet].filter(a => userSet.has(a)).length;
  const falsePositives = [...userSet].filter(a => !correctSet.has(a)).length;
  const is_correct = hits === correctSet.size && falsePositives === 0;
  const partial_score = correctSet.size > 0 ? Math.max(0, (hits - falsePositives) / correctSet.size) : 0;
  return { is_correct, partial_score };
}

// Ordering: both answers are JSON arrays; grade is exact sequence equality
// (case-insensitive). partial_score = fraction of positions matching.
export function gradeOrdering(userAnswer: string, correctAnswer: string): { is_correct: boolean; partial_score: number } {
  let userArr: string[];
  let correctArr: string[];
  try { userArr = JSON.parse(userAnswer); } catch { userArr = []; }
  try { correctArr = JSON.parse(correctAnswer); } catch { correctArr = [correctAnswer]; }
  const norm = (s: unknown) => String(s).toLowerCase().trim();
  const u = userArr.map(norm);
  const c = correctArr.map(norm);
  const positionsCorrect = c.filter((val, i) => u[i] === val).length;
  const is_correct = c.length > 0 && u.length === c.length && positionsCorrect === c.length;
  const partial_score = c.length > 0 ? positionsCorrect / c.length : 0;
  return { is_correct, partial_score };
}

export function gradeNumeric(userAnswer: string, correctAnswer: string, tolerance: number = 0.01): { is_correct: boolean } {
  const userNum = parseFloat(userAnswer);
  const correctNum = parseFloat(correctAnswer);
  if (isNaN(userNum) || isNaN(correctNum)) return { is_correct: false };
  return { is_correct: Math.abs(userNum - correctNum) <= tolerance };
}

/* ============================================================================
 * GRADING — one answer against its row (every type EXCEPT essay)
 * ==========================================================================*/

/**
 * Grade a single answer synchronously. Returns null ONLY for essay questions,
 * which require async AI grading the caller must handle. For every other type
 * (including dynamic template questions graded against the echoed-back
 * `_generated_answer`) it returns a full result.
 */
export function gradeQuestionSync(a: AnswerPayload, q: RawQuestion): SyncGradeResult | null {
  const qType = q.question_type as string;
  const base = {
    question_id: a.question_id,
    user_answer: a.user_answer,
    correct_answer: q.correct_answer || '',
    explanation: q.explanation || '',
  };

  // Dynamic template questions — grade against the answer generated for THIS
  // attempt (echoed back by the client; the server can't recompute the randoms).
  const isDynamic = a._dynamic || (q.is_dynamic && q.template_id);
  if (isDynamic && a._generated_answer) {
    const tol = a._tolerance || q.tolerance || 0.01;
    const userNum = parseFloat(a.user_answer);
    const correctNum = parseFloat(a._generated_answer);
    const is_correct = !isNaN(userNum) && !isNaN(correctNum) && Math.abs(userNum - correctNum) <= tol;
    return {
      ...base,
      is_correct,
      correct_answer: a._generated_answer,
      solution_steps: a._solution_steps || [],
      tolerance: tol,
    };
  }

  if (qType === 'essay') return null; // caller handles async AI grading

  if (qType === 'fill_blank') {
    const r = gradeFillBlank(a.user_answer, q.correct_answer || '');
    return { ...base, is_correct: r.is_correct, partial_score: r.partial_score, blank_results: r.blank_results, correct_answers: r.correct_answers };
  }

  if (qType === 'multi_select') {
    const r = gradeMultiSelect(a.user_answer, q.correct_answer || '');
    return { ...base, is_correct: r.is_correct, partial_score: r.partial_score };
  }

  // Ordering AND drag_label are both position-wise array equality.
  if (qType === 'ordering' || qType === 'drag_label') {
    const r = gradeOrdering(a.user_answer, q.correct_answer || '');
    return { ...base, is_correct: r.is_correct, partial_score: r.partial_score };
  }

  // Hotspot — chosen region id vs correct region id (case-insensitive).
  if (qType === 'hotspot') {
    const is_correct = (a.user_answer || '').trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
    return { ...base, is_correct };
  }

  if (qType === 'numeric_input') {
    const r = gradeNumeric(a.user_answer, q.correct_answer || '', q.tolerance || 0.01);
    return { ...base, is_correct: r.is_correct, solution_steps: [] };
  }

  // Legacy math_template — evaluate the stored formula with the submitted vars.
  if (qType === 'math_template') {
    const mathVars = a.math_vars || {};
    let formulaStr = q.correct_answer || '';
    if (formulaStr.startsWith('formula:')) formulaStr = formulaStr.slice(8);
    const expected = evalFormula(formulaStr, mathVars);
    const tolerance = q.tolerance || 0.5;
    const userNum = parseFloat(a.user_answer);
    const is_correct = !isNaN(expected) && !isNaN(userNum) && Math.abs(userNum - expected) <= tolerance;
    return { ...base, is_correct, correct_answer: String(isNaN(expected) ? 'Error computing' : expected) };
  }

  // Standard: multiple_choice / true_false / short_answer.
  const is_correct = (a.user_answer || '').toLowerCase().trim() === (q.correct_answer || '').toLowerCase().trim();
  return { ...base, is_correct };
}
