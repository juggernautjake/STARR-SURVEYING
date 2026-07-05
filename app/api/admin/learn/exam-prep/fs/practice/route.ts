// app/api/admin/learn/exam-prep/fs/practice/route.ts
//
// Untimed, not-for-score PRACTICE for an FS module. Distinct from the graded
// module quiz (/api/admin/learn/quizzes). Reuses the existing question bank and
// the stateless ProblemCard grader (/api/admin/learn/tutor-problem) — this route
// just builds the practice QUEUE and tracks lightweight progress.
//
//   GET  ?module_id=&kind=all|knowledge|problems&difficulty=&genre=&count=
//        → { questions:[{id,question_type,difficulty}], counts, progress }
//   POST { module_id, question_id, is_correct }
//        → records an attempt into fs_practice_progress; returns { progress }
//
// Auth: any signed-in user.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface QRow { id: string; question_type: string; difficulty: string | null; tags: string[] | null }

const KNOWLEDGE_TYPES = ['multiple_choice', 'true_false'];
const PROBLEM_TYPES = ['numeric_input', 'math_template'];

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const moduleId = searchParams.get('module_id');
  if (!moduleId) return NextResponse.json({ error: 'module_id is required' }, { status: 400 });
  const kind = (searchParams.get('kind') || 'all').toLowerCase();       // all|knowledge|problems
  const difficulty = searchParams.get('difficulty') || '';             // easy|medium|hard|''
  const genre = searchParams.get('genre') || '';                       // genre slug or ''
  const count = Math.min(Math.max(parseInt(searchParams.get('count') || '20', 10) || 20, 1), 50);

  // Pull the module's approved FS questions (small set: 30–80 per module).
  const { data } = await supabaseAdmin
    .from('question_bank')
    .select('id, question_type, difficulty, tags')
    .eq('exam_category', 'FS')
    .eq('module_id', moduleId)
    .eq('is_published', true)
    .limit(500);
  const all = (data || []) as QRow[];

  // Filter counts for the panel's chips (over the full module set).
  const genres = new Set<string>();
  let nKnowledge = 0, nProblems = 0;
  const byDifficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
  for (const q of all) {
    if (KNOWLEDGE_TYPES.includes(q.question_type)) nKnowledge++;
    if (PROBLEM_TYPES.includes(q.question_type)) nProblems++;
    if (q.difficulty && byDifficulty[q.difficulty] !== undefined) byDifficulty[q.difficulty]++;
    (q.tags || []).forEach((t) => { if (t.startsWith('genre:')) genres.add(t.slice(6)); });
  }

  // Apply the requested filters to build the queue.
  let pool = all.filter((q) => {
    if (kind === 'knowledge' && !KNOWLEDGE_TYPES.includes(q.question_type)) return false;
    if (kind === 'problems' && !PROBLEM_TYPES.includes(q.question_type)) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    if (genre && !(q.tags || []).includes(`genre:${genre}`)) return false;
    return true;
  });
  pool = shuffle(pool).slice(0, count);

  const { data: prog } = await supabaseAdmin
    .from('fs_practice_progress')
    .select('attempted, correct, last_practiced_at')
    .eq('user_email', email).eq('module_id', moduleId).maybeSingle();

  return NextResponse.json({
    questions: pool.map((q) => ({ id: q.id, question_type: q.question_type, difficulty: q.difficulty })),
    counts: {
      total: all.length, knowledge: nKnowledge, problems: nProblems,
      by_difficulty: byDifficulty, genres: [...genres].sort(),
    },
    progress: prog || { attempted: 0, correct: 0, last_practiced_at: null },
  });
}, { routeName: 'admin/learn/exam-prep/fs/practice#get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    { module_id?: string; question_id?: string; is_correct?: boolean } | null;
  const moduleId = body?.module_id;
  if (!moduleId) return NextResponse.json({ error: 'module_id is required' }, { status: 400 });

  // Read-modify-write the per-module tally (best effort; never block practice).
  const { data: cur } = await supabaseAdmin
    .from('fs_practice_progress')
    .select('attempted, correct')
    .eq('user_email', email).eq('module_id', moduleId).maybeSingle();
  const attempted = (cur?.attempted || 0) + 1;
  const correct = (cur?.correct || 0) + (body?.is_correct ? 1 : 0);

  const { data: saved } = await supabaseAdmin
    .from('fs_practice_progress')
    .upsert({
      user_email: email, module_id: moduleId,
      attempted, correct, last_practiced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'user_email,module_id' })
    .select('attempted, correct, last_practiced_at').single();

  return NextResponse.json({ progress: saved || { attempted, correct } });
}, { routeName: 'admin/learn/exam-prep/fs/practice#post' });
