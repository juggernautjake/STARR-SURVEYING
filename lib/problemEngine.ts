// lib/problemEngine.ts — Unified Problem Generation Engine
// Supports both admin-defined templates (from DB) and hardcoded generators.
// This is the single entry point for all algorithmic problem generation.

import {
  PROBLEM_TYPES,
  generateProblems as generateFromHardcoded,
  type GeneratedProblem,
  type SolutionStep,
  type ProblemTypeInfo,
} from './problemGenerators';

// Re-export types that consumers need
export type { GeneratedProblem, SolutionStep, ProblemTypeInfo };

// ============================================================================
// TYPES
// ============================================================================

export interface TemplateParameter {
  name: string;
  label: string;
  type: 'integer' | 'float' | 'angle_dms' | 'bearing' | 'choice' | 'computed';
  min?: number;
  max?: number;
  decimals?: number;
  step?: number;
  unit?: string;
  choices?: string[];
  formula?: string; // For computed type
}

export interface ComputedVar {
  name: string;
  formula: string;
}

export interface SolutionStepTemplate {
  step_number: number;
  title: string;
  description_template?: string;
  formula?: string;
  calculation_template?: string;
  result_template?: string;
}

export interface AnswerFormat {
  decimals?: number;
  tolerance?: number;
  unit?: string;
  prefix?: string;
  suffix?: string;
}

export interface OptionsGenerator {
  method: 'offset' | 'formula' | 'none';
  offsets?: { add?: number; multiply?: number }[];
  wrong_formulas?: string[];
}

export interface ProblemTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  question_type: string;
  difficulty: string;
  question_template: string;
  answer_formula: string;
  answer_format: AnswerFormat;
  parameters: TemplateParameter[];
  computed_vars: ComputedVar[];
  solution_steps_template: SolutionStepTemplate[];
  options_generator: OptionsGenerator;
  explanation_template?: string;
  module_id?: string;
  lesson_id?: string;
  topic_id?: string;
  exam_category?: string;
  tags: string[];
  study_references?: { type: string; id: string; label: string }[];
  generator_id?: string; // Links to hardcoded generator
  is_active: boolean;
}

// ============================================================================
// MATH EVALUATION ENGINE
// ============================================================================

// Safe math scope with surveying-specific functions
function createMathScope(vars: Record<string, number | string>): Record<string, unknown> {
  return {
    ...vars,
    PI: Math.PI,
    E: Math.E,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sqrt: Math.sqrt,
    abs: Math.abs,
    pow: Math.pow,
    floor: Math.floor,
    ceil: Math.ceil,
    log: Math.log,
    log10: Math.log10,
    exp: Math.exp,
    min: Math.min,
    max: Math.max,
    // Rounding with precision
    round: (n: number, d: number = 0) => {
      const f = Math.pow(10, d);
      return Math.round((n + Number.EPSILON) * f) / f;
    },
    // Degree/radian conversion
    toRad: (deg: number) => deg * Math.PI / 180,
    toDeg: (rad: number) => rad * 180 / Math.PI,
    // DMS helpers
    dmsToDecimal: (d: number, m: number, s: number) => d + m / 60 + s / 3600,
    decimalToDeg: (dec: number) => Math.floor(Math.abs(dec)),
    decimalToMin: (dec: number) => Math.floor((Math.abs(dec) - Math.floor(Math.abs(dec))) * 60),
    decimalToSec: (dec: number) => {
      const mFull = (Math.abs(dec) - Math.floor(Math.abs(dec))) * 60;
      return Math.round(((mFull - Math.floor(mFull)) * 60) * 10) / 10;
    },
    // Surveying-specific
    sign: Math.sign,
    hypot: Math.hypot,
  };
}

/**
 * Safely evaluate a formula string with given variables.
 * Returns the computed number or NaN on error.
 */
export function evalFormula(formula: string, vars: Record<string, number | string>): number {
  if (!formula || formula.trim() === '') return NaN;
  const scope = createMathScope(vars);
  const keys = Object.keys(scope);
  const values = keys.map(k => scope[k]);
  try {
    const fn = new Function(...keys, `"use strict"; return (${formula});`);
    const result = fn(...values);
    return typeof result === 'number' ? result : NaN;
  } catch {
    return NaN;
  }
}

// ============================================================================
// PARAMETER GENERATION
// ============================================================================

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals: number = 2): number {
  const val = Math.random() * (max - min) + min;
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

function preciseRound(val: number, decimals: number = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * f) / f;
}

/**
 * Generate random values for all template parameters.
 */
export function generateParameterValues(
  parameters: TemplateParameter[],
  existingVars?: Record<string, number | string>
): Record<string, number | string> {
  const vars: Record<string, number | string> = { ...(existingVars || {}) };

  for (const param of parameters) {
    switch (param.type) {
      case 'integer':
        vars[param.name] = randInt(param.min ?? 0, param.max ?? 100);
        break;

      case 'float':
        vars[param.name] = randFloat(
          param.min ?? 0,
          param.max ?? 100,
          param.decimals ?? 2
        );
        break;

      case 'angle_dms': {
        const d = randInt(param.min ?? 0, param.max ?? 359);
        const m = randInt(0, 59);
        const s = randFloat(0, 59.9, 1);
        vars[`${param.name}_d`] = d;
        vars[`${param.name}_m`] = m;
        vars[`${param.name}_s`] = s;
        vars[param.name] = preciseRound(d + m / 60 + s / 3600, 6);
        break;
      }

      case 'bearing': {
        const quadrants = param.choices || ['NE', 'SE', 'SW', 'NW'];
        const quad = quadrants[randInt(0, quadrants.length - 1)];
        const deg = randInt(param.min ?? 1, param.max ?? 89);
        const min = randInt(0, 59);
        vars[`${param.name}_quad`] = quad;
        vars[`${param.name}_deg`] = deg;
        vars[`${param.name}_min`] = min;
        vars[param.name] = preciseRound(deg + min / 60, 4);
        break;
      }

      case 'choice':
        if (param.choices && param.choices.length > 0) {
          vars[param.name] = param.choices[randInt(0, param.choices.length - 1)];
        }
        break;

      case 'computed':
        if (param.formula) {
          const result = evalFormula(param.formula, vars);
          vars[param.name] = isNaN(result) ? 0 : preciseRound(result, param.decimals ?? 4);
        }
        break;
    }
  }

  return vars;
}

// ============================================================================
// TEMPLATE SUBSTITUTION
// ============================================================================

/**
 * Substitute {{varName}} placeholders in a template string with values.
 * Also handles {{varName:format}} for special formatting.
 */
export function substituteTemplate(
  template: string,
  vars: Record<string, number | string>
): string {
  if (!template) return '';

  return template.replace(/\{\{(\w+)(?::([^}]+))?\}\}/g, (_match, name, format) => {
    const val = vars[name];
    if (val === undefined || val === null) return `{{${name}}}`;

    if (format) {
      // Handle format specifiers
      if (format === 'dms' && typeof val === 'number') {
        const d = Math.floor(Math.abs(val));
        const mFull = (Math.abs(val) - d) * 60;
        const m = Math.floor(mFull);
        const s = preciseRound((mFull - m) * 60, 1);
        return `${d}\u00B0${m}'${s}"`;
      }
      if (format.startsWith('f') && typeof val === 'number') {
        const decimals = parseInt(format.slice(1)) || 2;
        return val.toFixed(decimals);
      }
      if (format === 'abs' && typeof val === 'number') {
        return Math.abs(val).toString();
      }
      if (format === 'sign' && typeof val === 'number') {
        return val >= 0 ? '+' : '-';
      }
    }

    return String(val);
  });
}

// ============================================================================
// CORE GENERATION: From Template
// ============================================================================

/**
 * Generate a single problem from a ProblemTemplate definition.
 * This is the main function for template-based generation.
 */
export function generateFromTemplate(template: ProblemTemplate): GeneratedProblem {
  // If this template wraps a hardcoded generator, delegate to it
  if (template.generator_id) {
    const hardcoded = PROBLEM_TYPES.find(pt => pt.id === template.generator_id);
    if (hardcoded) {
      return hardcoded.generator();
    }
  }

  // Generate parameter values
  const vars = generateParameterValues(template.parameters);

  // Compute intermediate variables
  for (const cv of template.computed_vars) {
    const result = evalFormula(cv.formula, vars);
    vars[cv.name] = isNaN(result) ? 0 : result;
  }

  // Generate question text
  const questionText = substituteTemplate(template.question_template, vars);

  // Compute correct answer
  const answerRaw = evalFormula(template.answer_formula, vars);
  const decimals = template.answer_format?.decimals ?? 2;
  const correctAnswer = isNaN(answerRaw)
    ? String(answerRaw)
    : preciseRound(answerRaw, decimals).toFixed(decimals);

  // Generate solution steps
  const solutionSteps: SolutionStep[] = (template.solution_steps_template || []).map(st => ({
    step_number: st.step_number,
    title: st.title,
    description: st.description_template ? substituteTemplate(st.description_template, { ...vars, _answer: correctAnswer }) : undefined,
    formula: st.formula,
    calculation: st.calculation_template ? substituteTemplate(st.calculation_template, { ...vars, _answer: correctAnswer }) : undefined,
    result: st.result_template ? substituteTemplate(st.result_template, { ...vars, _answer: correctAnswer }) : undefined,
  }));

  // Generate explanation
  const explanation = template.explanation_template
    ? substituteTemplate(template.explanation_template, { ...vars, _answer: correctAnswer })
    : '';

  // Generate options for multiple choice
  let options: string[] | undefined;
  if (template.question_type === 'multiple_choice' && template.options_generator) {
    options = generateOptions(correctAnswer, template.options_generator, vars);
  }

  // Build the problem
  const tolerance = template.answer_format?.tolerance ?? 0.01;

  return {
    id: generateId(),
    question_text: questionText,
    question_type: (template.question_type as GeneratedProblem['question_type']) || 'numeric_input',
    options,
    correct_answer: correctAnswer,
    tolerance,
    solution_steps: solutionSteps,
    difficulty: (template.difficulty as GeneratedProblem['difficulty']) || 'medium',
    category: template.category,
    subcategory: template.subcategory || '',
    tags: template.tags || [],
    explanation,
  };
}

/**
 * Generate wrong options for multiple choice from a correct answer.
 */
function generateOptions(
  correctAnswer: string,
  generator: OptionsGenerator,
  vars: Record<string, number | string>
): string[] {
  const correct = parseFloat(correctAnswer);
  const options: string[] = [correctAnswer];

  if (generator.method === 'offset' && generator.offsets) {
    for (const off of generator.offsets) {
      if (off.add !== undefined) {
        options.push(preciseRound(correct + off.add, 2).toString());
      } else if (off.multiply !== undefined) {
        options.push(preciseRound(correct * off.multiply, 2).toString());
      }
    }
  } else if (generator.method === 'formula' && generator.wrong_formulas) {
    for (const wf of generator.wrong_formulas) {
      const wrongVal = evalFormula(wf, vars);
      if (!isNaN(wrongVal)) {
        options.push(preciseRound(wrongVal, 2).toString());
      }
    }
  }

  // Ensure we have at least 4 options, add random offsets if needed
  while (options.length < 4) {
    const offset = (Math.random() > 0.5 ? 1 : -1) * randFloat(1, Math.max(Math.abs(correct) * 0.15, 5), 2);
    const wrong = preciseRound(correct + offset, 2).toString();
    if (!options.includes(wrong)) {
      options.push(wrong);
    }
  }

  // Shuffle options
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return options;
}

// ============================================================================
// BATCH GENERATION
// ============================================================================

/**
 * Generate multiple problems from a single template.
 */
export function generateBatchFromTemplate(
  template: ProblemTemplate,
  count: number
): GeneratedProblem[] {
  const problems: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    problems.push(generateFromTemplate(template));
  }
  return problems;
}

/**
 * Generate problems from multiple templates (mixed set).
 */
export function generateMixedFromTemplates(
  configs: { template: ProblemTemplate; count: number }[]
): GeneratedProblem[] {
  const all: GeneratedProblem[] = [];
  for (const config of configs) {
    all.push(...generateBatchFromTemplate(config.template, config.count));
  }
  return all;
}

// ============================================================================
// TEMPLATE PREVIEW & VALIDATION
// ============================================================================

/**
 * Preview a template by generating a sample problem.
 * Returns both the problem and the generated parameter values for debugging.
 */
export function previewTemplate(template: ProblemTemplate): {
  problem: GeneratedProblem;
  parameters: Record<string, number | string>;
  computed: Record<string, number | string>;
} {
  // Generate parameter values
  const vars = generateParameterValues(template.parameters);
  const paramSnapshot = { ...vars };

  // Compute intermediate variables
  const computed: Record<string, number | string> = {};
  for (const cv of template.computed_vars) {
    const result = evalFormula(cv.formula, vars);
    vars[cv.name] = isNaN(result) ? 0 : result;
    computed[cv.name] = vars[cv.name];
  }

  // If this wraps a hardcoded generator, use it
  if (template.generator_id) {
    const hardcoded = PROBLEM_TYPES.find(pt => pt.id === template.generator_id);
    if (hardcoded) {
      return {
        problem: hardcoded.generator(),
        parameters: paramSnapshot,
        computed,
      };
    }
  }

  // Generate the problem using standard path
  const problem = generateFromTemplate(template);

  return { problem, parameters: paramSnapshot, computed };
}

/**
 * Validate a template for correctness.
 * Tests formula evaluation, parameter generation, and template substitution.
 */
export function validateTemplate(template: ProblemTemplate): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sample?: GeneratedProblem;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!template.name) errors.push('Template name is required');
  if (!template.category) errors.push('Category is required');
  if (!template.question_template) errors.push('Question template is required');
  if (!template.answer_formula && !template.generator_id) {
    errors.push('Answer formula is required (unless using a hardcoded generator)');
  }

  // If using a hardcoded generator, validate it exists
  if (template.generator_id) {
    const found = PROBLEM_TYPES.find(pt => pt.id === template.generator_id);
    if (!found) {
      errors.push(`Hardcoded generator "${template.generator_id}" not found`);
    } else {
      // Test generation
      try {
        const sample = found.generator();
        return { valid: errors.length === 0, errors, warnings, sample };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Generator threw an error: ${msg}`);
      }
    }
    return { valid: errors.length === 0, errors, warnings };
  }

  // Validate parameters
  for (const param of template.parameters) {
    if (!param.name) errors.push('Parameter name is required');
    if (!param.type) errors.push(`Parameter "${param.name}" needs a type`);
    if ((param.type === 'integer' || param.type === 'float') && param.min === undefined) {
      warnings.push(`Parameter "${param.name}" has no min value`);
    }
    if ((param.type === 'integer' || param.type === 'float') && param.max === undefined) {
      warnings.push(`Parameter "${param.name}" has no max value`);
    }
    if (param.type === 'choice' && (!param.choices || param.choices.length === 0)) {
      errors.push(`Parameter "${param.name}" (choice) needs at least one choice`);
    }
    if (param.type === 'computed' && !param.formula) {
      errors.push(`Parameter "${param.name}" (computed) needs a formula`);
    }
  }

  // Try generating a sample
  try {
    const vars = generateParameterValues(template.parameters);

    // Compute intermediate variables
    for (const cv of template.computed_vars) {
      const result = evalFormula(cv.formula, vars);
      if (isNaN(result)) {
        errors.push(`Computed variable "${cv.name}" formula returned NaN`);
      }
      vars[cv.name] = isNaN(result) ? 0 : result;
    }

    // Test answer formula
    if (template.answer_formula) {
      const answer = evalFormula(template.answer_formula, vars);
      if (isNaN(answer)) {
        errors.push('Answer formula returned NaN');
      }
    }

    // Test question template substitution
    const questionText = substituteTemplate(template.question_template, vars);
    if (questionText.includes('{{') && questionText.includes('}}')) {
      const unreplaced = questionText.match(/\{\{(\w+)\}\}/g);
      if (unreplaced) {
        warnings.push(`Unreplaced variables in question: ${unreplaced.join(', ')}`);
      }
    }

    // Generate full sample if no errors
    if (errors.length === 0) {
      const sample = generateFromTemplate(template);
      return { valid: true, errors, warnings, sample };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Generation error: ${msg}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// UNIFIED GENERATION API
// ============================================================================

/**
 * Get all available problem types: both hardcoded and from templates array.
 * This is the unified catalog for the admin UI.
 */
export function getAllProblemTypes(dbTemplates?: ProblemTemplate[]): {
  hardcoded: ProblemTypeInfo[];
  templates: ProblemTemplate[];
  combined: { id: string; name: string; category: string; source: 'hardcoded' | 'template' }[];
} {
  const templates = (dbTemplates || []).filter(t => t.is_active && !t.generator_id);
  const combined: { id: string; name: string; category: string; source: 'hardcoded' | 'template' }[] = [];

  // Add hardcoded generators
  for (const pt of PROBLEM_TYPES) {
    combined.push({
      id: `hc:${pt.id}`,
      name: pt.name,
      category: pt.category,
      source: 'hardcoded',
    });
  }

  // Add custom templates (not wrapping hardcoded generators)
  for (const t of templates) {
    combined.push({
      id: `tmpl:${t.id}`,
      name: t.name,
      category: t.category,
      source: 'template',
    });
  }

  return { hardcoded: PROBLEM_TYPES, templates, combined };
}

/**
 * Generate a problem from either a hardcoded generator ID or a template.
 * Universal entry point for all problem generation.
 */
export function generateProblem(
  source: { type: 'hardcoded'; generatorId: string } | { type: 'template'; template: ProblemTemplate }
): GeneratedProblem {
  if (source.type === 'hardcoded') {
    const problems = generateFromHardcoded(source.generatorId, 1);
    if (problems.length > 0) return problems[0];
    throw new Error(`Generator "${source.generatorId}" not found or returned no problems`);
  }
  return generateFromTemplate(source.template);
}

/**
 * Generate problems from a question_bank row that may have a template_id.
 * Used by quiz/practice delivery to create dynamic questions.
 */
export function generateDynamicQuestion(
  question: {
    id: string;
    question_text: string;
    question_type: string;
    correct_answer: string;
    options?: string[];
    explanation?: string;
    difficulty?: string;
    tags?: string[];
    is_dynamic?: boolean;
    template_id?: string;
  },
  template?: ProblemTemplate | null
): {
  question_text: string;
  correct_answer: string;
  options: string[];
  solution_steps: SolutionStep[];
  explanation: string;
  _generated_vars?: Record<string, number | string>;
} | null {
  // If there's a linked template, generate from it
  if (template) {
    const problem = generateFromTemplate(template);
    return {
      question_text: problem.question_text,
      correct_answer: problem.correct_answer,
      options: problem.options || [],
      solution_steps: problem.solution_steps,
      explanation: problem.explanation,
    };
  }

  // If it's a math_template type, use the existing system
  if (question.question_type === 'math_template' && question.is_dynamic) {
    const varDefs = parseMathTemplateVars(question.question_text);
    const vars = generateMathTemplateVars(varDefs);
    const concreteText = substituteMathTemplateVars(question.question_text, vars);

    let formulaStr = question.correct_answer || '';
    if (formulaStr.startsWith('formula:')) formulaStr = formulaStr.slice(8);
    const answer = evalFormula(formulaStr, vars);

    return {
      question_text: concreteText,
      correct_answer: isNaN(answer) ? '0' : String(answer),
      options: [],
      solution_steps: [],
      explanation: question.explanation || '',
      _generated_vars: vars,
    };
  }

  return null; // Not a dynamic question
}

// Math template helpers (for legacy {{varName:min:max}} format)
function parseMathTemplateVars(text: string): { name: string; min: number; max: number }[] {
  const regex = /\{\{(\w+):(\d+):(\d+)\}\}/g;
  const vars: { name: string; min: number; max: number }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    vars.push({ name: match[1], min: parseInt(match[2]), max: parseInt(match[3]) });
  }
  return vars;
}

function generateMathTemplateVars(varDefs: { name: string; min: number; max: number }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of varDefs) {
    result[v.name] = Math.floor(Math.random() * (v.max - v.min + 1)) + v.min;
  }
  return result;
}

function substituteMathTemplateVars(text: string, vars: Record<string, number>): string {
  return text.replace(/\{\{(\w+):\d+:\d+\}\}/g, (_match, name) => String(vars[name] ?? name));
}

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return 'gen-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
}

/**
 * Convert a DB row to a ProblemTemplate object.
 * Use when fetching templates from Supabase.
 */
export function dbRowToTemplate(row: Record<string, unknown>): ProblemTemplate {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    description: row.description ? String(row.description) : undefined,
    category: String(row.category || ''),
    subcategory: row.subcategory ? String(row.subcategory) : undefined,
    question_type: String(row.question_type || 'numeric_input'),
    difficulty: String(row.difficulty || 'medium'),
    question_template: String(row.question_template || ''),
    answer_formula: String(row.answer_formula || ''),
    answer_format: (typeof row.answer_format === 'object' ? row.answer_format : {}) as AnswerFormat,
    parameters: Array.isArray(row.parameters) ? row.parameters as TemplateParameter[] : [],
    computed_vars: Array.isArray(row.computed_vars) ? row.computed_vars as ComputedVar[] : [],
    solution_steps_template: Array.isArray(row.solution_steps_template)
      ? row.solution_steps_template as SolutionStepTemplate[]
      : [],
    options_generator: (typeof row.options_generator === 'object' ? row.options_generator : { method: 'none' }) as OptionsGenerator,
    explanation_template: row.explanation_template ? String(row.explanation_template) : undefined,
    module_id: row.module_id ? String(row.module_id) : undefined,
    lesson_id: row.lesson_id ? String(row.lesson_id) : undefined,
    topic_id: row.topic_id ? String(row.topic_id) : undefined,
    exam_category: row.exam_category ? String(row.exam_category) : undefined,
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    study_references: Array.isArray(row.study_references)
      ? row.study_references as { type: string; id: string; label: string }[]
      : [],
    generator_id: row.generator_id ? String(row.generator_id) : undefined,
    is_active: row.is_active !== false,
  };
}

/**
 * Get all hardcoded generator IDs for reference.
 */
export function getHardcodedGeneratorIds(): string[] {
  return PROBLEM_TYPES.map(pt => pt.id);
}

/**
 * Get a hardcoded generator by ID.
 */
export function getHardcodedGenerator(id: string): ProblemTypeInfo | undefined {
  return PROBLEM_TYPES.find(pt => pt.id === id);
}

/**
 * Group templates by category.
 */
export function groupTemplatesByCategory(
  templates: ProblemTemplate[]
): Record<string, ProblemTemplate[]> {
  const grouped: Record<string, ProblemTemplate[]> = {};
  for (const t of templates) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }
  return grouped;
}
