// app/api/admin/learn/tutor-problem/route.ts
//
// POST /api/admin/learn/tutor-problem — interactive practice inside the AI tutor.
//   action 'fetch'   : { questionId } → { problem (rendered, answer hidden), answerToken }
//   action 'grade'   : { answerToken, answer } → { correct, gradable, correctAnswer, explanation, solutionSteps }
//   action 'another' : { questionId } → a fresh problem of the SAME kind (same
//                      dynamic template, else another question_bank row sharing
//                      the module + a genre:* tag).
//
// Grading is stateless: `fetch` returns an opaque base64url `answerToken`
// carrying the answer/tolerance/explanation/steps; the client echoes it back to
// `grade`. (Self-study tool — the token only obfuscates the answer.)
//
// Auth: any signed-in user.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { dbRowToTemplate, generateDynamicQuestion } from '@/lib/problemEngine';

type Row = Record<string, unknown> & {
  id: string; question_text?: string; question_type?: string; options?: unknown;
  correct_answer?: string; explanation?: string; tolerance?: number;
  is_dynamic?: boolean; template_id?: string; module_id?: string; tags?: string[];
  difficulty?: string;
};
type Step = Record<string, unknown>;
interface TokenPayload {
  correct_answer: string; tolerance: number; question_type: string;
  explanation: string; solution_steps: Step[];
}
interface Rendered {
  id: string; question_type: string; question_text: string;
  options: string[]; diagram?: string; difficulty?: string;
}

const b64e = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');
const b64d = (s: string): TokenPayload | null => {
  try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as TokenPayload; } catch { return null; }
};
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function asOptions(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map((x) => String(x)) : []; } catch { return []; } }
  return [];
}

async function renderProblem(row: Row): Promise<{ problem: Rendered; token: string } | null> {
  let question_text = String(row.question_text || '');
  let options = asOptions(row.options);
  let correct_answer = String(row.correct_answer || '');
  let explanation = String(row.explanation || '');
  let solution_steps: Step[] = [];
  let diagram: string | undefined;
  let tolerance = Number(row.tolerance ?? 0) || 0;
  const qtype = String(row.question_type || 'short_answer');

  if (row.is_dynamic && row.template_id) {
    const { data: tpl } = await supabaseAdmin.from('problem_templates').select('*').eq('id', row.template_id).single();
    if (tpl) {
      const template = dbRowToTemplate(tpl as Record<string, unknown>);
      const gen = generateDynamicQuestion(
        { id: row.id, question_text, question_type: qtype, correct_answer, options, explanation, is_dynamic: true, template_id: row.template_id },
        template,
      );
      if (gen) {
        question_text = gen.question_text;
        options = gen.options || [];
        correct_answer = gen.correct_answer;
        explanation = gen.explanation || explanation;
        solution_steps = (gen.solution_steps as unknown as Step[]) || [];
        diagram = gen.diagram;
        const af = (template as { answer_format?: { tolerance?: number } }).answer_format;
        if (af && typeof af.tolerance === 'number') tolerance = af.tolerance;
      }
    }
  }

  const displayOptions =
    qtype === 'true_false' ? ['True', 'False']
    : qtype === 'multiple_choice' ? shuffle(options)
    : [];

  const problem: Rendered = { id: String(row.id), question_type: qtype, question_text, options: displayOptions, diagram, difficulty: row.difficulty };
  const token = b64e({ correct_answer, tolerance, question_type: qtype, explanation, solution_steps } satisfies TokenPayload);
  return { problem, token };
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { action?: string; questionId?: string; answerToken?: string; answer?: string }
    | null;
  if (!body?.action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  if (body.action === 'fetch' || body.action === 'another') {
    if (!body.questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });
    const { data: row } = await supabaseAdmin.from('question_bank').select('*').eq('id', body.questionId).single();
    if (!row) return NextResponse.json({ error: 'Problem not found' }, { status: 404 });

    let target = row as Row;
    if (body.action === 'another' && !target.is_dynamic) {
      const genre = (target.tags || []).find((t: string) => t.startsWith('genre:'));
      let q = supabaseAdmin.from('question_bank').select('*').eq('is_published', true).neq('id', target.id).limit(30);
      if (target.module_id) q = q.eq('module_id', target.module_id);
      const { data: pool } = await q;
      const candidates = ((pool as Row[] | null) || []).filter((r: Row) => !genre || (r.tags || []).includes(genre));
      if (candidates.length) target = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const rendered = await renderProblem(target);
    if (!rendered) return NextResponse.json({ error: 'Could not render problem' }, { status: 500 });
    return NextResponse.json({ problem: rendered.problem, answerToken: rendered.token });
  }

  if (body.action === 'grade') {
    const payload = body.answerToken ? b64d(body.answerToken) : null;
    if (!payload) return NextResponse.json({ error: 'Invalid answerToken' }, { status: 400 });
    const ans = String(body.answer ?? '').trim();
    const correct = String(payload.correct_answer ?? '').trim();
    const type = payload.question_type;
    let isCorrect = false;
    let gradable = true;
    if (type === 'numeric_input' || type === 'math_template') {
      const a = parseFloat(ans.replace(/[^0-9.\-]/g, ''));
      const c = parseFloat(correct);
      const tol = Number(payload.tolerance) || 0;
      isCorrect = isFinite(a) && isFinite(c) && Math.abs(a - c) <= (tol || Math.max(0.01, Math.abs(c) * 0.001));
    } else if (type === 'multiple_choice' || type === 'true_false' || type === 'fill_blank') {
      isCorrect = ans.toLowerCase() === correct.toLowerCase();
    } else {
      gradable = false; // short_answer / essay — not auto-graded here
    }
    return NextResponse.json({
      correct: isCorrect, gradable, correctAnswer: correct,
      explanation: payload.explanation || '', solutionSteps: payload.solution_steps || [],
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}, { routeName: 'admin/learn/tutor-problem#post' });
