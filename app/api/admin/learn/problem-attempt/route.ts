// app/api/admin/learn/problem-attempt/route.ts — recording an attempt at a multi-step problem.
//
// Owner, 2026-09-20: "Build any mechanics and automatic grading."
//
// A step ladder is graded in the browser so the feedback is instant — that is what makes a
// five-part problem feel like working rather than like submitting. But a mark that exists only in
// a component is a mark that vanishes on refresh, so this is where it becomes a record.
//
// ── THE SERVER GRADES IT AGAIN, AND ITS ANSWER IS THE ONE THAT IS KEPT ──────────────────────────
//
// The client sends what the student typed, NOT what the client decided about it. Trusting a posted
// verdict would make the score a thing anyone could set from the console, and a study record nobody
// can rely on is worse than no record — it would quietly corrupt the weak-area tracking that tells
// somebody what to revise.
//
// `gradeMultiStep` is pure and is the same function the browser ran, so the two agree unless
// somebody tried to make them disagree. The client keeps showing its own result for immediacy; this
// is what gets written.
//
// ── WHY IT WRITES A REAL ATTEMPT ROW ────────────────────────────────────────────────────────────
//
// Not a bespoke table. A multi-step problem is a question answered in an attempt, so it goes in
// `quiz_attempts` / `quiz_attempt_answers` like everything else, and the history, the averages and
// the "areas to review" all pick it up without knowing this type exists. `partial_score` and
// `step_results` (seeds/652) are what carry the per-part detail — so a worked solution can be shown
// again next week rather than being reconstructed from a percentage.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { gradeMultiStep, type ProblemStep } from '@/lib/learn/gradeSteps';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    questionId?: string;
    /** What they typed, keyed by step id. Never a verdict — see the header. */
    answers?: Record<string, unknown>;
    timeSpentSeconds?: number;
  } | null;

  if (!body?.questionId) return NextResponse.json({ error: 'questionId is required.' }, { status: 400 });
  const answers = (body.answers && typeof body.answers === 'object') ? body.answers : {};

  const { data: row } = await supabaseAdmin
    .from('question_bank')
    .select('id, question_type, module_id, steps, given_vars, exam_category')
    .eq('id', body.questionId)
    .is('deleted_at', null)
    .maybeSingle();

  const q = row as {
    id: string; question_type: string; module_id: string | null;
    steps: ProblemStep[] | null; given_vars: Record<string, number> | null;
    exam_category: string | null;
  } | null;

  if (!q) return NextResponse.json({ error: 'That problem is not here.' }, { status: 404 });
  if (q.question_type !== 'multi_step' || !Array.isArray(q.steps) || q.steps.length === 0) {
    return NextResponse.json({ error: 'That is not a multi-step problem.' }, { status: 400 });
  }

  const result = gradeMultiStep(q.steps, answers, q.given_vars ?? {});

  // One attempt, one question. `module_test` is the closest existing kind — these are module
  // practice — and using it keeps the history page and the hub widgets working unchanged rather
  // than needing a new `attempt_type` nobody else understands yet.
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('quiz_attempts')
    .insert({
      user_email: email,
      attempt_type: 'module_test',
      module_id: q.module_id,
      exam_category: q.exam_category,
      total_questions: 1,
      // A problem counts as correct only when every part was earned. Two of four right is honest
      // progress on those parts and is not a solved problem.
      correct_answers: result.partialScore === 1 ? 1 : 0,
      // The SCORE, though, is the parts — which is the whole point of grading each one.
      score_percent: Math.round(result.partialScore * 10000) / 100,
      time_spent_seconds: Math.max(0, Math.round(Number(body.timeSpentSeconds) || 0)),
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ error: attemptError?.message ?? 'Could not record that attempt.' }, { status: 500 });
  }

  const { error: answerError } = await supabaseAdmin.from('quiz_attempt_answers').insert({
    attempt_id: attempt.id,
    question_id: q.id,
    // Readable in a database client without having to decode anything — a person looking into a
    // dispute about somebody's practice record should not need this route to interpret the row.
    user_answer: q.steps.map((s) => `${s.id}=${String(answers[s.id] ?? '')}`).join('; '),
    is_correct: result.partialScore === 1,
    partial_score: Math.round(result.partialScore * 1000) / 1000,
    step_results: result.steps,
  });
  if (answerError) {
    // The attempt is already written. Reporting success here would be a lie about what was kept,
    // and the caller can decide whether to retry.
    return NextResponse.json({ error: answerError.message, attempt_id: attempt.id }, { status: 500 });
  }

  // Which parts went wrong, so revision can be pointed at them. Best effort: a failure here must
  // never cost the student the attempt that was just recorded.
  try {
    const missed = result.steps.filter((s) => s.verdict === 'wrong');
    for (const s of missed) {
      const step = q.steps.find((x) => x.id === s.id);
      if (!step) continue;
      const topic = step.prompt.slice(0, 120);
      const { data: existing } = await supabaseAdmin
        .from('fs_weak_areas')
        .select('id, miss_count')
        .eq('user_email', email).eq('topic', topic).maybeSingle();
      if (existing) {
        await supabaseAdmin.from('fs_weak_areas')
          .update({ miss_count: (existing.miss_count ?? 0) + 1, last_missed_at: new Date().toISOString(), resolved: false })
          .eq('id', existing.id);
      } else {
        await supabaseAdmin.from('fs_weak_areas').insert({
          user_email: email, topic, miss_count: 1, last_missed_at: new Date().toISOString(), resolved: false,
        });
      }
    }
  } catch { /* the attempt is recorded; the weak-area tally is a convenience on top of it */ }

  return NextResponse.json({
    attempt_id: attempt.id,
    // Returned so the client can reconcile if it wants to. It does not have to — it already showed
    // its own grading — but a disagreement is worth being able to see.
    result,
  });
}, { routeName: 'admin/learn/problem-attempt' });
