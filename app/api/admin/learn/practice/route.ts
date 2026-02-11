// app/api/admin/learn/practice/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { PROBLEM_TYPES, generateProblems, type GeneratedProblem } from '@/lib/problemGenerators';
import { checkNumericAnswer, checkTextAnswer, checkMultipleChoice } from '@/lib/solutionChecker';
import {
  generateFromTemplate,
  generateBatchFromTemplate,
  dbRowToTemplate,
  type ProblemTemplate,
} from '@/lib/problemEngine';

/* GET — Get problem types or generate a practice set */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // Return all available problem types grouped by category
  if (action === 'types') {
    const grouped: Record<string, { id: string; name: string; description: string; category: string; module: number; difficulties: string[]; source?: string }[]> = {};
    for (const pt of PROBLEM_TYPES) {
      if (!grouped[pt.category]) grouped[pt.category] = [];
      grouped[pt.category].push({
        id: pt.id,
        name: pt.name,
        description: pt.description,
        category: pt.category,
        module: pt.module,
        difficulties: pt.difficulties,
        source: 'hardcoded',
      });
    }

    // Also include active DB templates (non-generator-linked)
    const { data: templates } = await supabaseAdmin.from('problem_templates')
      .select('*').eq('is_active', true);
    const customTemplates = (templates || [])
      .filter((t: any) => !t.generator_id)
      .map((t: any) => dbRowToTemplate(t));
    for (const t of customTemplates) {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push({
        id: `tmpl:${t.id}`,
        name: t.name,
        description: t.description || '',
        category: t.category,
        module: 0,
        difficulties: [t.difficulty],
        source: 'template',
      });
    }

    const totalTypes = PROBLEM_TYPES.length + customTemplates.length;
    return NextResponse.json({ categories: grouped, total_types: totalTypes });
  }

  // Generate problems from config (passed as JSON in query param)
  if (action === 'generate') {
    const configStr = searchParams.get('config');
    if (!configStr) return NextResponse.json({ error: 'config param required' }, { status: 400 });

    let config: { typeId: string; count: number }[];
    try { config = JSON.parse(configStr); } catch { return NextResponse.json({ error: 'Invalid config JSON' }, { status: 400 }); }

    const problems: GeneratedProblem[] = [];

    // Gather any template IDs we need to fetch
    const templateIds = config
      .filter(c => c.typeId.startsWith('tmpl:'))
      .map(c => c.typeId.slice(5));
    const templateMap = new Map<string, ProblemTemplate>();
    if (templateIds.length > 0) {
      const { data: tmplRows } = await supabaseAdmin.from('problem_templates')
        .select('*').in('id', templateIds);
      for (const row of (tmplRows || [])) {
        templateMap.set(row.id, dbRowToTemplate(row));
      }
    }

    for (const c of config) {
      if (c.typeId.startsWith('tmpl:')) {
        // Generate from DB template
        const tmplId = c.typeId.slice(5);
        const template = templateMap.get(tmplId);
        if (template) {
          problems.push(...generateBatchFromTemplate(template, c.count));
        }
      } else {
        // Generate from hardcoded generator
        const generated = generateProblems(c.typeId, c.count);
        problems.push(...generated);
      }
    }

    const randomize = searchParams.get('randomize') === 'true';
    if (randomize) {
      for (let i = problems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [problems[i], problems[j]] = [problems[j], problems[i]];
      }
    }

    // Return problems without correct answers (for client)
    const clientProblems = problems.map(p => ({
      id: p.id,
      question_text: p.question_text,
      question_type: p.question_type,
      options: p.options,
      difficulty: p.difficulty,
      category: p.category,
      subcategory: p.subcategory,
      tags: p.tags,
      tolerance: p.tolerance,
    }));

    // Store full problems server-side in a temporary session
    const sessionId = 'ps-' + Math.random().toString(36).substring(2, 12);
    await supabaseAdmin.from('practice_sessions').insert({
      id: sessionId,
      user_email: session.user.email,
      problems: JSON.stringify(problems),
      config: JSON.stringify(config),
      total_problems: problems.length,
      status: 'active',
    }).then(() => {}).catch(() => {
      // Table might not exist yet — problems can still be graded client-side
    });

    return NextResponse.json({
      session_id: sessionId,
      problems: clientProblems,
      total: problems.length,
    });
  }

  // Get practice history
  if (action === 'history') {
    const { data } = await supabaseAdmin.from('practice_sessions')
      .select('id, config, total_problems, correct_answers, score_percent, time_spent_seconds, completed_at, created_at')
      .eq('user_email', session.user.email)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(20);
    return NextResponse.json({ sessions: data || [] });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'learn/practice' });

/* POST — Submit practice session answers or get solution */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // Grade a single problem (for "See Solution" or answer check)
  if (action === 'check_answer') {
    const { problem_id, user_answer, correct_answer, question_type, tolerance } = body;

    let result;
    if (question_type === 'numeric_input' || question_type === 'math_template') {
      result = checkNumericAnswer(user_answer || '', correct_answer || '', tolerance || 0.01);
    } else if (question_type === 'multiple_choice' || question_type === 'true_false') {
      result = checkMultipleChoice(user_answer || '', correct_answer || '');
    } else {
      result = checkTextAnswer(user_answer || '', correct_answer || '', true);
    }

    return NextResponse.json(result);
  }

  // Submit full practice session
  if (action === 'submit_session') {
    const { session_id, answers, time_spent_seconds } = body;

    // Try to get stored problems
    let storedProblems: GeneratedProblem[] | null = null;
    if (session_id) {
      const { data } = await supabaseAdmin.from('practice_sessions')
        .select('problems').eq('id', session_id).eq('user_email', session.user.email).maybeSingle();
      if (data?.problems) {
        try { storedProblems = JSON.parse(data.problems); } catch { /* ignore */ }
      }
    }

    // Grade each answer
    const results = (answers || []).map((a: { problem_id: string; user_answer: string; correct_answer: string; question_type: string; tolerance: number }) => {
      // Find the stored problem for complete solution
      const stored = storedProblems?.find(p => p.id === a.problem_id);
      const correctAns = stored?.correct_answer || a.correct_answer;
      const tol = stored?.tolerance || a.tolerance || 0.01;
      const qType = stored?.question_type || a.question_type || 'numeric_input';

      let checkResult;
      if (qType === 'numeric_input' || qType === 'math_template') {
        checkResult = checkNumericAnswer(a.user_answer || '', correctAns, tol);
      } else if (qType === 'multiple_choice' || qType === 'true_false') {
        checkResult = checkMultipleChoice(a.user_answer || '', correctAns);
      } else {
        checkResult = checkTextAnswer(a.user_answer || '', correctAns, true);
      }

      return {
        problem_id: a.problem_id,
        ...checkResult,
        solution_steps: stored?.solution_steps || [],
        explanation: stored?.explanation || '',
      };
    });

    const correctCount = results.filter((r: { is_correct: boolean }) => r.is_correct).length;
    const closeCount = results.filter((r: { is_close: boolean }) => r.is_close).length;
    const totalCount = results.length;
    const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    // Update practice session if it exists
    if (session_id) {
      await supabaseAdmin.from('practice_sessions')
        .update({
          status: 'completed',
          correct_answers: correctCount,
          score_percent: scorePercent,
          time_spent_seconds: time_spent_seconds || 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', session_id)
        .eq('user_email', session.user.email)
        .then(() => {}).catch(() => {});
    }

    return NextResponse.json({
      results,
      summary: {
        total: totalCount,
        correct: correctCount,
        close: closeCount,
        incorrect: totalCount - correctCount,
        score_percent: scorePercent,
        passed: scorePercent >= 70,
        time_spent_seconds: time_spent_seconds || 0,
      },
    });
  }

  // Get solution for a single problem (when student gives up)
  if (action === 'see_solution') {
    const { session_id, problem_id } = body;

    if (session_id) {
      const { data } = await supabaseAdmin.from('practice_sessions')
        .select('problems').eq('id', session_id).eq('user_email', session.user.email).maybeSingle();
      if (data?.problems) {
        try {
          const problems: GeneratedProblem[] = JSON.parse(data.problems);
          const problem = problems.find(p => p.id === problem_id);
          if (problem) {
            return NextResponse.json({
              correct_answer: problem.correct_answer,
              solution_steps: problem.solution_steps,
              explanation: problem.explanation,
              gave_up: true, // Mark as missed
            });
          }
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}, { routeName: 'learn/practice' });
