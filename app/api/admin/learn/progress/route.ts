// app/api/admin/learn/progress/route.ts
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get('lesson_id');
  const moduleId = searchParams.get('module_id');

  if (lessonId) {
    const { data } = await supabaseAdmin.from('user_progress')
      .select('*').eq('user_email', session.user.email).eq('lesson_id', lessonId).maybeSingle();
    return NextResponse.json({ completed: !!data, progress: data });
  }

  if (moduleId) {
    const { data } = await supabaseAdmin.from('user_progress')
      .select('*').eq('user_email', session.user.email).eq('module_id', moduleId);
    return NextResponse.json({ completedLessons: data || [] });
  }

  // All progress
  const { data } = await supabaseAdmin.from('user_progress')
    .select('*').eq('user_email', session.user.email);
  return NextResponse.json({ progress: data || [] });
}, { routeName: 'learn/progress' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { module_id, lesson_id } = await req.json();
  const { data, error } = await supabaseAdmin.from('user_progress')
    .upsert({ user_email: session.user.email, module_id, lesson_id }, { onConflict: 'user_email,lesson_id' })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-award learning credits for lesson completion
  try {
    // Check for matching credit value (specific lesson first, then global)
    let creditValue = null;
    if (lesson_id) {
      const { data: specific } = await supabaseAdmin.from('learning_credit_values')
        .select('*').eq('entity_type', 'lesson').eq('entity_id', lesson_id).eq('is_active', true).single();
      creditValue = specific;
    }
    if (!creditValue) {
      const { data: global } = await supabaseAdmin.from('learning_credit_values')
        .select('*').eq('entity_type', 'lesson').is('entity_id', null).eq('is_active', true).single();
      creditValue = global;
    }

    if (creditValue && creditValue.credit_points > 0) {
      // Insert with unique constraint to prevent duplicate awards
      await supabaseAdmin.from('employee_learning_credits').insert({
        user_email: session.user.email,
        credit_value_id: creditValue.id,
        entity_type: 'lesson',
        entity_id: lesson_id,
        entity_label: creditValue.entity_label || 'Lesson Completed',
        points_earned: creditValue.credit_points,
        source_type: 'lesson_complete',
        source_id: data.id,
      });
    }
  } catch { /* ignore - credits are optional, unique constraint prevents duplicates */ }

  // Auto-discover flashcards associated with this lesson/module
  try {
    // Find flashcards tagged with this lesson or module
    const { data: relatedCards } = await supabaseAdmin.from('flashcards')
      .select('id')
      .or(`lesson_id.eq.${lesson_id},module_id.eq.${module_id}`);

    if (relatedCards && relatedCards.length > 0) {
      const discoveries = relatedCards.map((card: { id: string }) => ({
        user_email: session.user.email,
        card_id: card.id,
        card_source: 'builtin',
        lesson_id: lesson_id || null,
        module_id: module_id || null,
        next_yearly_review_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }));
      // Upsert to avoid duplicates
      await supabaseAdmin.from('user_flashcard_discovery')
        .upsert(discoveries, { onConflict: 'user_email,card_id' });
    }
  } catch { /* ignore - discovery is optional */ }

  return NextResponse.json({ progress: data });
}, { routeName: 'learn/progress' });
