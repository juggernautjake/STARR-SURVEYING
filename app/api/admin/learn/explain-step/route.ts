// app/api/admin/learn/explain-step/route.ts — "why does this step work, and where would I use it?"
//
// Owner, 2026-09-20: "Involve active AI if needed, but make sure it works really well in explaining
// things and how to do problems and what all the applications might be."
//
// The stored `explanation` on a step says what the formula is. That is the right thing to show the
// instant a problem is marked — short, certain, and already written by whoever authored the problem.
// It is not an answer to "but WHY does squaring the cosine do that", and it never says where the
// relationship turns up in real work, which is the half of the request about applications.
//
// So this is a second, deeper layer, asked for per step rather than per problem. Two modes:
//
//   'how'  — why this step works, and how to recognise when to use it
//   'where' — where it shows up in actual survey practice, and where it goes wrong
//
// ── WHY IT IS ITS OWN ROUTE AND NOT THE TUTOR ───────────────────────────────────────────────────
//
// The tutor is a CONVERSATION: it carries history, retrieves sources, produces a voice script, and
// is deliberately restrained while a problem is unattempted. This is a single answer about one
// step, asked after the marking, with no thread to keep — and folding it into the tutor would mean
// either weakening the restraint that stops it solving problems for people, or asking a
// conversational endpoint a question that has no conversation.
//
// ── WHAT IT IS TOLD, AND WHAT IT IS NOT ─────────────────────────────────────────────────────────
//
// It gets the step, the problem, and whether the student got it right — because "you had the method
// and slipped a digit" and "you used the wrong relationship entirely" deserve different
// explanations. It does NOT get their numeric answer to grade: the marking already happened, in
// `gradeMultiStep`, deterministically. Asking a model to re-mark arithmetic it cannot see would be
// inviting it to contradict a correct result.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { modelFor } from '@/lib/ai/models';
import { supabaseAdmin } from '@/lib/supabase';
import type { ProblemStep } from '@/lib/learn/gradeSteps';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

/** Short on purpose. This is a paragraph beside a step, not an essay — and a wall of text under a
 *  problem somebody is mid-way through is a wall they will scroll past. */
const MAX_TOKENS = 900;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    questionId?: string;
    stepId?: string;
    mode?: 'how' | 'where';
    /** Whether they got this part right, so the explanation can meet them where they are. */
    verdict?: 'correct' | 'carried' | 'wrong' | 'blank';
  } | null;

  if (!body?.questionId || !body?.stepId) {
    return NextResponse.json({ error: 'questionId and stepId are required.' }, { status: 400 });
  }
  const mode = body.mode === 'where' ? 'where' : 'how';

  const { data: row } = await supabaseAdmin
    .from('question_bank')
    .select('question_text, steps, given_vars, explanation, module_id')
    .eq('id', body.questionId)
    .is('deleted_at', null)
    .maybeSingle();

  const q = row as {
    question_text: string; steps: ProblemStep[] | null;
    given_vars: Record<string, number> | null; explanation: string | null;
    module_id: string | null;
  } | null;
  if (!q || !Array.isArray(q.steps)) {
    return NextResponse.json({ error: 'That problem is not here.' }, { status: 404 });
  }

  const step = q.steps.find((s) => s.id === body.stepId);
  if (!step) return NextResponse.json({ error: 'That step is not in this problem.' }, { status: 404 });

  // The module it belongs to, so the answer can point back at what they have been reading rather
  // than at surveying in general.
  let moduleTitle = '';
  if (q.module_id) {
    const { data: m } = await supabaseAdmin
      .from('fs_study_modules').select('title').eq('id', q.module_id).maybeSingle();
    moduleTitle = (m as { title?: string } | null)?.title ?? '';
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Degrades to what is already stored rather than to an error. The authored explanation is a
    // real answer; it is just a shorter one.
    return NextResponse.json({
      text: step.explanation ?? q.explanation ?? 'No explanation is stored for this step yet.',
      source: 'stored',
    });
  }

  const system = [
    'You are an expert land surveyor and FS exam tutor. You are explaining ONE step of a worked problem to a student who has just submitted their attempt.',
    moduleTitle ? `The problem belongs to the module "${moduleTitle}".` : '',
    '',
    mode === 'how'
      ? [
          'EXPLAIN HOW AND WHY THIS STEP WORKS:',
          '- Start from the relationship being used and why it is the right one HERE — what in the problem tells you to reach for it.',
          '- Show the substitution with the actual numbers from this problem, and say what each symbol is.',
          '- Name the mistake people most commonly make on this step, concretely.',
          '- If a calculator shortcut exists on an NCEES-approved model, say which keys.',
        ].join('\n')
      : [
          'EXPLAIN WHERE THIS IS USED IN REAL SURVEYING WORK:',
          '- Give two or three concrete situations a working surveyor meets this in — a specific task on a specific kind of job, not a category.',
          '- Say what goes wrong in the field or on the plat when it is done wrong, and roughly how big the consequence is.',
          '- If it connects to something the student will meet later in the FS material, say so briefly.',
          '- Do NOT re-derive the arithmetic. This answer is about application, not method.',
        ].join('\n'),
    '',
    'STYLE:',
    '- Two or three short paragraphs at most. This sits beside a step on screen, not on its own page.',
    '- Plain prose. No headings, no bullet lists, no markdown tables.',
    '- Concrete over general: real distances, real angles, real jobs.',
    '- Accuracy first. If something varies by jurisdiction or by which convention is in use, say so rather than picking one silently. Never invent a formula, a constant, or a statute.',
    body.verdict === 'wrong'
      ? '- They got this step WRONG. Lead with the idea they most likely missed, kindly and without dwelling on it.'
      : body.verdict === 'carried'
        ? '- They did this step correctly but from a figure that was wrong earlier. Say plainly that their method here was right, so they do not conclude they misunderstood this part.'
        : '- They got this step right. Do not congratulate them at length; deepen it instead.',
  ].filter(Boolean).join('\n');

  const given = Object.entries(q.given_vars ?? {}).map(([k, v]) => `${k} = ${v}`).join(', ');
  const user = [
    `PROBLEM: ${q.question_text}`,
    given ? `GIVEN: ${given}` : '',
    `THIS STEP: ${step.prompt}`,
    step.formula ? `THE FORMULA USED: ${step.formula}` : '',
    step.explanation ? `WHAT THE COURSE ALREADY SAYS ABOUT IT (do not just repeat this — go further): ${step.explanation}` : '',
    '',
    mode === 'how' ? 'Explain how and why this step works.' : 'Explain where this is used in real surveying work.',
  ].filter(Boolean).join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: modelFor('drafting').model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!text) {
      return NextResponse.json({ text: step.explanation ?? 'No explanation available.', source: 'stored' });
    }
    return NextResponse.json({ text, source: 'ai' });
  } catch (err) {
    console.error('[explain-step] failed:', err);
    // Same fallback as a missing key: the stored explanation is still a real answer.
    return NextResponse.json({
      text: step.explanation ?? q.explanation ?? 'That explanation could not be generated just now.',
      source: 'stored',
    });
  }
}, { routeName: 'admin/learn/explain-step' });
