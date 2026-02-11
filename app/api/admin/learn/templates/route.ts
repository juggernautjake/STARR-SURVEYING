// app/api/admin/learn/templates/route.ts
// CRUD API for problem templates + generation/preview/validation endpoints
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  dbRowToTemplate,
  generateFromTemplate,
  generateBatchFromTemplate,
  previewTemplate,
  validateTemplate,
  getHardcodedGeneratorIds,
  type ProblemTemplate,
} from '@/lib/problemEngine';
import { PROBLEM_TYPES } from '@/lib/problemGenerators';

/* ============= GET — List templates, preview, validate ============= */

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // --- List all templates ---
  if (!action || action === 'list') {
    const category = searchParams.get('category');
    const moduleId = searchParams.get('module_id');
    const activeOnly = searchParams.get('active_only') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '200', 10);

    let query = supabaseAdmin.from('problem_templates')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit);

    if (activeOnly) query = query.eq('is_active', true);
    if (category) query = query.eq('category', category);
    if (moduleId) query = query.eq('module_id', moduleId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const templates = (data || []).map((row: Record<string, unknown>) => dbRowToTemplate(row));

    // Group by category for convenience
    const grouped: Record<string, ProblemTemplate[]> = {};
    for (const t of templates) {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    }

    return NextResponse.json({
      templates,
      grouped,
      total: templates.length,
      hardcoded_generators: getHardcodedGeneratorIds(),
    });
  }

  // --- Get single template ---
  if (action === 'get') {
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('problem_templates')
      .select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ template: dbRowToTemplate(data) });
  }

  // --- Preview a template (generate sample) ---
  if (action === 'preview') {
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('problem_templates')
      .select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const template = dbRowToTemplate(data);
    const preview = previewTemplate(template);
    return NextResponse.json(preview);
  }

  // --- Validate a template ---
  if (action === 'validate') {
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('problem_templates')
      .select('*').eq('id', id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const template = dbRowToTemplate(data);
    const result = validateTemplate(template);
    return NextResponse.json(result);
  }

  // --- List hardcoded generators ---
  if (action === 'generators') {
    const generators = PROBLEM_TYPES.map(pt => ({
      id: pt.id,
      name: pt.name,
      description: pt.description,
      category: pt.category,
      module: pt.module,
      difficulties: pt.difficulties,
    }));

    const grouped: Record<string, typeof generators> = {};
    for (const g of generators) {
      if (!grouped[g.category]) grouped[g.category] = [];
      grouped[g.category].push(g);
    }

    return NextResponse.json({ generators, grouped, total: generators.length });
  }

  // --- Get categories (distinct) ---
  if (action === 'categories') {
    const { data } = await supabaseAdmin.from('problem_templates')
      .select('category')
      .eq('is_active', true);

    const categories = [...new Set((data || []).map((r: { category: string }) => r.category))].sort();

    // Also include hardcoded categories
    const hcCategories = [...new Set(PROBLEM_TYPES.map(pt => pt.category))];
    const allCategories = [...new Set([...categories, ...hcCategories])].sort();

    return NextResponse.json({ categories: allCategories });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'learn/templates' });

/* ============= POST — Create template, generate problems, bulk publish ============= */

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  // --- Create a new template ---
  if (!action || action === 'create') {
    const {
      name,
      description,
      category,
      subcategory,
      question_type = 'numeric_input',
      difficulty = 'medium',
      question_template,
      answer_formula,
      answer_format = { decimals: 2, tolerance: 0.01 },
      parameters = [],
      computed_vars = [],
      solution_steps_template = [],
      options_generator = { method: 'none' },
      explanation_template,
      module_id,
      lesson_id,
      topic_id,
      exam_category,
      tags = [],
      study_references = [],
      generator_id,
    } = body;

    if (!name || !category || !question_template) {
      return NextResponse.json({
        error: 'name, category, and question_template are required',
      }, { status: 400 });
    }

    if (!answer_formula && !generator_id) {
      return NextResponse.json({
        error: 'answer_formula is required (unless linking to a hardcoded generator)',
      }, { status: 400 });
    }

    // Validate before saving
    const templateData: ProblemTemplate = {
      id: '',
      name,
      description,
      category,
      subcategory,
      question_type,
      difficulty,
      question_template,
      answer_formula: answer_formula || '',
      answer_format,
      parameters,
      computed_vars,
      solution_steps_template,
      options_generator,
      explanation_template,
      module_id,
      lesson_id,
      topic_id,
      exam_category,
      tags,
      study_references,
      generator_id,
      is_active: true,
    };

    const validation = validateTemplate(templateData);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Template validation failed',
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from('problem_templates').insert({
      name,
      description: description || null,
      category,
      subcategory: subcategory || null,
      question_type,
      difficulty,
      question_template,
      answer_formula: answer_formula || '',
      answer_format,
      parameters,
      computed_vars,
      solution_steps_template,
      options_generator,
      explanation_template: explanation_template || null,
      module_id: module_id || null,
      lesson_id: lesson_id || null,
      topic_id: topic_id || null,
      exam_category: exam_category || null,
      tags,
      study_references,
      generator_id: generator_id || null,
      created_by: session.user.email,
      is_active: true,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      template: dbRowToTemplate(data),
      validation_warnings: validation.warnings,
    });
  }

  // --- Preview (POST version, for unsaved templates) ---
  if (action === 'preview') {
    const template: ProblemTemplate = {
      id: 'preview',
      name: body.name || 'Preview',
      category: body.category || 'Preview',
      subcategory: body.subcategory,
      question_type: body.question_type || 'numeric_input',
      difficulty: body.difficulty || 'medium',
      question_template: body.question_template || '',
      answer_formula: body.answer_formula || '',
      answer_format: body.answer_format || { decimals: 2, tolerance: 0.01 },
      parameters: body.parameters || [],
      computed_vars: body.computed_vars || [],
      solution_steps_template: body.solution_steps_template || [],
      options_generator: body.options_generator || { method: 'none' },
      explanation_template: body.explanation_template,
      tags: body.tags || [],
      generator_id: body.generator_id,
      is_active: true,
    };

    const validation = validateTemplate(template);
    if (!validation.valid) {
      return NextResponse.json({
        error: 'Template validation failed',
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
      }, { status: 400 });
    }

    const preview = previewTemplate(template);
    return NextResponse.json({ ...preview, validation_warnings: validation.warnings });
  }

  // --- Generate problems from template (with count) ---
  if (action === 'generate') {
    const { template_id, count = 5 } = body;
    if (!template_id) return NextResponse.json({ error: 'template_id required' }, { status: 400 });

    const { data, error } = await supabaseAdmin.from('problem_templates')
      .select('*').eq('id', template_id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const template = dbRowToTemplate(data);
    const problems = generateBatchFromTemplate(template, Math.min(count, 50));

    return NextResponse.json({ problems, total: problems.length });
  }

  // --- Publish template problems to question_bank ---
  if (action === 'publish') {
    const { template_id, count = 1, as_dynamic = true } = body;
    if (!template_id) return NextResponse.json({ error: 'template_id required' }, { status: 400 });

    const { data: tmplData, error: tmplErr } = await supabaseAdmin.from('problem_templates')
      .select('*').eq('id', template_id).single();
    if (tmplErr) return NextResponse.json({ error: tmplErr.message }, { status: 500 });

    const template = dbRowToTemplate(tmplData);
    const published: string[] = [];

    for (let i = 0; i < Math.min(count, 50); i++) {
      const problem = generateFromTemplate(template);

      const { data: qData, error: qErr } = await supabaseAdmin.from('question_bank').insert({
        question_text: as_dynamic ? template.question_template : problem.question_text,
        question_type: as_dynamic ? 'math_template' : template.question_type,
        options: problem.options || [],
        correct_answer: as_dynamic ? `formula:${template.answer_formula}` : problem.correct_answer,
        explanation: problem.explanation,
        difficulty: template.difficulty,
        module_id: template.module_id || null,
        lesson_id: template.lesson_id || null,
        topic_id: template.topic_id || null,
        exam_category: template.exam_category || null,
        tags: template.tags,
        study_references: template.study_references || [],
        template_id: template_id,
        is_dynamic: as_dynamic,
        solution_steps: problem.solution_steps,
        tolerance: template.answer_format?.tolerance || 0.01,
      }).select('id').single();

      if (qErr) {
        return NextResponse.json({ error: `Failed to publish question ${i + 1}: ${qErr.message}` }, { status: 500 });
      }
      if (qData) published.push(qData.id);
    }

    return NextResponse.json({
      published_ids: published,
      count: published.length,
      as_dynamic,
    });
  }

  // --- Bulk generate from hardcoded generator ---
  if (action === 'generate_hardcoded') {
    const { generator_id, count = 5 } = body;
    if (!generator_id) return NextResponse.json({ error: 'generator_id required' }, { status: 400 });

    const gen = PROBLEM_TYPES.find(pt => pt.id === generator_id);
    if (!gen) return NextResponse.json({ error: 'Generator not found' }, { status: 404 });

    const problems = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      problems.push(gen.generator());
    }

    return NextResponse.json({ problems, total: problems.length, generator: gen.name });
  }

  // --- Publish hardcoded generator problems to question_bank ---
  if (action === 'publish_hardcoded') {
    const { generator_id, count = 1, lesson_id, module_id, exam_category } = body;
    if (!generator_id) return NextResponse.json({ error: 'generator_id required' }, { status: 400 });

    const gen = PROBLEM_TYPES.find(pt => pt.id === generator_id);
    if (!gen) return NextResponse.json({ error: 'Generator not found' }, { status: 404 });

    const published: string[] = [];
    for (let i = 0; i < Math.min(count, 50); i++) {
      const problem = gen.generator();

      const { data: qData, error: qErr } = await supabaseAdmin.from('question_bank').insert({
        question_text: problem.question_text,
        question_type: problem.question_type === 'numeric_input' ? 'numeric_input' : problem.question_type,
        options: problem.options || [],
        correct_answer: problem.correct_answer,
        explanation: problem.explanation,
        difficulty: problem.difficulty,
        module_id: module_id || null,
        lesson_id: lesson_id || null,
        exam_category: exam_category || null,
        tags: problem.tags,
        solution_steps: problem.solution_steps,
        tolerance: problem.tolerance,
      }).select('id').single();

      if (qErr) {
        return NextResponse.json({ error: `Failed to publish: ${qErr.message}` }, { status: 500 });
      }
      if (qData) published.push(qData.id);
    }

    return NextResponse.json({
      published_ids: published,
      count: published.length,
      generator: gen.name,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'learn/templates' });

/* ============= PUT — Update template ============= */

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

  // Clean up the updates object
  const cleanUpdates: Record<string, unknown> = {};
  const allowedFields = [
    'name', 'description', 'category', 'subcategory', 'question_type',
    'difficulty', 'question_template', 'answer_formula', 'answer_format',
    'parameters', 'computed_vars', 'solution_steps_template',
    'options_generator', 'explanation_template', 'module_id', 'lesson_id',
    'topic_id', 'exam_category', 'tags', 'study_references',
    'generator_id', 'is_active',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      cleanUpdates[field] = updates[field];
    }
  }
  cleanUpdates.updated_by = session.user.email;

  const { data, error } = await supabaseAdmin
    .from('problem_templates')
    .update(cleanUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: dbRowToTemplate(data) });
}, { routeName: 'learn/templates' });

/* ============= DELETE — Delete template ============= */

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing template id' }, { status: 400 });

  // Soft delete: set is_active to false
  const { error } = await supabaseAdmin
    .from('problem_templates')
    .update({ is_active: false, updated_by: session.user.email })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'learn/templates' });
