// app/api/admin/learn/students/route.ts
// Teacher/admin API to view student progress overview and details
import { NextRequest, NextResponse } from 'next/server';
import { auth, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !canManageContent(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  // If email provided, return detailed student progress
  if (email) {
    return getStudentDetail(email);
  }

  // Otherwise return overview of all students
  return getStudentList();
}

async function getStudentList() {
  // Run parallel queries for student data aggregation
  const [progressRes, quizRes, xpRes, moduleRes, activityRes] = await Promise.all([
    // Lesson completions per user
    supabaseAdmin.rpc('get_student_lesson_counts').select('*'),
    // Quiz stats per user
    supabaseAdmin.rpc('get_student_quiz_stats').select('*'),
    // XP balances
    supabaseAdmin.from('xp_balances').select('user_email, current_balance, total_earned'),
    // Module completions per user
    supabaseAdmin.rpc('get_student_module_counts').select('*'),
    // Last activity per user
    supabaseAdmin.rpc('get_student_last_activity').select('*'),
  ]);

  // If RPCs don't exist, fall back to direct queries
  const hasFallback =
    progressRes.error?.code === '42883' ||
    quizRes.error?.code === '42883' ||
    moduleRes.error?.code === '42883' ||
    activityRes.error?.code === '42883';

  if (hasFallback) {
    return getStudentListFallback();
  }

  // Merge data by user_email
  const students = new Map<string, Record<string, unknown>>();

  const ensure = (email: string) => {
    if (!students.has(email)) {
      students.set(email, {
        email,
        lessons_completed: 0,
        quiz_count: 0,
        avg_quiz_score: 0,
        xp_balance: 0,
        xp_total: 0,
        modules_completed: 0,
        last_active: null,
      });
    }
    return students.get(email)!;
  };

  (progressRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.lessons_completed = r.count;
  });
  (quizRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.quiz_count = r.count;
    s.avg_quiz_score = parseFloat(r.avg_score) || 0;
  });
  (xpRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.xp_balance = r.current_balance;
    s.xp_total = r.total_earned;
  });
  (moduleRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.modules_completed = r.count;
  });
  (activityRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.last_active = r.last_active;
  });

  return NextResponse.json({ students: Array.from(students.values()) });
}

/** Fallback approach without Postgres RPC functions — uses direct table queries */
async function getStudentListFallback() {
  const [progressRes, quizRes, xpRes, moduleRes] = await Promise.all([
    supabaseAdmin.from('user_progress').select('user_email'),
    supabaseAdmin
      .from('quiz_attempts')
      .select('user_email, score_percent, completed_at'),
    supabaseAdmin
      .from('xp_balances')
      .select('user_email, current_balance, total_earned'),
    supabaseAdmin
      .from('module_completions')
      .select('user_email')
      .eq('is_current', true),
  ]);

  const students = new Map<string, Record<string, unknown>>();

  const ensure = (email: string) => {
    if (!students.has(email)) {
      students.set(email, {
        email,
        lessons_completed: 0,
        quiz_count: 0,
        avg_quiz_score: 0,
        xp_balance: 0,
        xp_total: 0,
        modules_completed: 0,
        last_active: null,
      });
    }
    return students.get(email)!;
  };

  // Count lessons per user
  (progressRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.lessons_completed = (s.lessons_completed as number) + 1;
  });

  // Aggregate quiz stats per user
  const quizAgg = new Map<string, { total: number; sum: number; lastDate: string | null }>();
  (quizRes.data || []).forEach((r: any) => {
    const agg = quizAgg.get(r.user_email) || { total: 0, sum: 0, lastDate: null };
    agg.total++;
    agg.sum += parseFloat(r.score_percent) || 0;
    if (!agg.lastDate || r.completed_at > agg.lastDate) agg.lastDate = r.completed_at;
    quizAgg.set(r.user_email, agg);
  });
  quizAgg.forEach((agg, email) => {
    const s = ensure(email);
    s.quiz_count = agg.total;
    s.avg_quiz_score = Math.round((agg.sum / agg.total) * 10) / 10;
    if (!s.last_active || (agg.lastDate && agg.lastDate > (s.last_active as string))) {
      s.last_active = agg.lastDate;
    }
  });

  // XP balances
  (xpRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.xp_balance = r.current_balance;
    s.xp_total = r.total_earned;
  });

  // Module completions
  (moduleRes.data || []).forEach((r: any) => {
    const s = ensure(r.user_email);
    s.modules_completed = (s.modules_completed as number) + 1;
  });

  return NextResponse.json({ students: Array.from(students.values()) });
}

async function getStudentDetail(email: string) {
  const [modulesRes, lessonsRes, quizzesRes, xpRes, xpTxRes] = await Promise.all([
    // Module completions
    supabaseAdmin
      .from('module_completions')
      .select('module_id, module_type, completed_at, xp_earned, is_current')
      .eq('user_email', email)
      .order('completed_at', { ascending: false }),
    // Lesson completions
    supabaseAdmin
      .from('user_progress')
      .select('lesson_id, module_id, completed_at')
      .eq('user_email', email)
      .order('completed_at', { ascending: false }),
    // Quiz history
    supabaseAdmin
      .from('quiz_attempts')
      .select('id, attempt_type, module_id, lesson_id, total_questions, correct_answers, score_percent, time_spent_seconds, completed_at')
      .eq('user_email', email)
      .order('completed_at', { ascending: false })
      .limit(50),
    // XP balance
    supabaseAdmin
      .from('xp_balances')
      .select('current_balance, total_earned, total_spent, last_updated')
      .eq('user_email', email)
      .single(),
    // Recent XP transactions
    supabaseAdmin
      .from('xp_transactions')
      .select('amount, transaction_type, description, created_at')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Fetch module titles for enrichment
  const moduleIds = new Set<string>();
  (modulesRes.data || []).forEach((m: any) => moduleIds.add(m.module_id));
  (lessonsRes.data || []).forEach((l: any) => { if (l.module_id) moduleIds.add(l.module_id); });
  (quizzesRes.data || []).forEach((q: any) => { if (q.module_id) moduleIds.add(q.module_id); });

  let moduleTitles: Record<string, string> = {};
  if (moduleIds.size > 0) {
    const { data: mods } = await supabaseAdmin
      .from('learning_modules')
      .select('id, title')
      .in('id', Array.from(moduleIds));
    (mods || []).forEach((m: any) => { moduleTitles[m.id] = m.title; });
  }

  // Fetch lesson titles
  const lessonIds = new Set<string>();
  (lessonsRes.data || []).forEach((l: any) => lessonIds.add(l.lesson_id));
  (quizzesRes.data || []).forEach((q: any) => { if (q.lesson_id) lessonIds.add(q.lesson_id); });

  let lessonTitles: Record<string, string> = {};
  if (lessonIds.size > 0) {
    const { data: les } = await supabaseAdmin
      .from('learning_lessons')
      .select('id, title')
      .in('id', Array.from(lessonIds));
    (les || []).forEach((l: any) => { lessonTitles[l.id] = l.title; });
  }

  return NextResponse.json({
    email,
    modules: (modulesRes.data || []).map((m: any) => ({
      ...m,
      module_title: moduleTitles[m.module_id] || 'Unknown Module',
    })),
    lessons: (lessonsRes.data || []).map((l: any) => ({
      ...l,
      module_title: moduleTitles[l.module_id] || '',
      lesson_title: lessonTitles[l.lesson_id] || 'Unknown Lesson',
    })),
    quizzes: (quizzesRes.data || []).map((q: any) => ({
      ...q,
      module_title: q.module_id ? moduleTitles[q.module_id] || '' : '',
      lesson_title: q.lesson_id ? lessonTitles[q.lesson_id] || '' : '',
    })),
    xp: xpRes.data || { current_balance: 0, total_earned: 0, total_spent: 0 },
    xp_history: xpTxRes.data || [],
  });
}
