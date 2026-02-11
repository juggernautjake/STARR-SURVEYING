// app/api/admin/learn/flashcards/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// SM-2 algorithm helper
function calculateSM2(
  rating: 'again' | 'hard' | 'good' | 'easy',
  prevEase: number,
  prevInterval: number,
  prevReps: number,
) {
  const ratingMap = { again: 0, hard: 1, good: 2, easy: 3 };
  const q = ratingMap[rating];

  let ease = prevEase;
  let interval = prevInterval;
  let reps = prevReps;

  if (q < 1) {
    // Failed - reset
    reps = 0;
    interval = 0;
  } else {
    if (reps === 0) {
      interval = 1;
    } else if (reps === 1) {
      interval = 3;
    } else {
      interval = Math.round(prevInterval * ease);
    }
    reps += 1;
  }

  // Adjust ease factor
  ease = ease + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;
  if (ease > 3.0) ease = 3.0;

  // Easy bonus
  if (rating === 'easy') interval = Math.round(interval * 1.3);

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + Math.max(interval, 0));

  return { ease: Math.round(ease * 100) / 100, interval, reps, nextReview };
}

// GET — List flashcards with spaced repetition data
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');
  const dueCount = searchParams.get('due_count');
  const moduleId = searchParams.get('module_id');
  const lessonId = searchParams.get('lesson_id');
  const discoveredOnly = searchParams.get('discovered') !== 'false'; // Default to discovered only

  // Return just the count of due cards
  if (dueCount === 'true') {
    const now = new Date().toISOString();
    // Cards that have a review record and are due
    const { data: dueReviews } = await supabaseAdmin.from('flashcard_reviews')
      .select('id', { count: 'exact' })
      .eq('user_email', session.user.email)
      .lte('next_review_at', now);
    // Cards that have never been reviewed (both builtin and user)
    const { data: allBuiltin } = await supabaseAdmin.from('flashcards')
      .select('id');
    const { data: allUser } = await supabaseAdmin.from('user_flashcards')
      .select('id')
      .eq('user_email', session.user.email);
    const { data: reviewed } = await supabaseAdmin.from('flashcard_reviews')
      .select('card_id')
      .eq('user_email', session.user.email);

    const reviewedIds = new Set((reviewed || []).map((r: any) => r.card_id));
    const totalCards = (allBuiltin?.length || 0) + (allUser?.length || 0);
    const unreviewedCount = [...(allBuiltin || []), ...(allUser || [])]
      .filter((c: any) => !reviewedIds.has(c.id)).length;

    return NextResponse.json({ due_count: (dueReviews?.length || 0) + unreviewedCount });
  }

  let builtIn: any[] = [];
  let userCards: any[] = [];

  if (!source || source === 'builtin') {
    let q = supabaseAdmin.from('flashcards').select('*');
    if (moduleId) q = q.eq('module_id', moduleId);
    if (lessonId) q = q.eq('lesson_id', lessonId);
    const { data } = await q.order('created_at', { ascending: true });
    builtIn = (data || []).map((c: any) => ({ ...c, source: 'builtin' }));
  }

  if (!source || source === 'user') {
    let q = supabaseAdmin.from('user_flashcards').select('*').eq('user_email', session.user.email);
    if (moduleId) q = q.eq('module_id', moduleId);
    if (lessonId) q = q.eq('lesson_id', lessonId);
    const { data } = await q.order('created_at', { ascending: false });
    userCards = (data || []).map((c: any) => ({ ...c, source: 'user' }));
  }

  let allCards = [...builtIn, ...userCards];

  // Filter to only discovered flashcards (builtin cards the user has unlocked via lesson completion)
  if (discoveredOnly && !source) {
    const { data: discoveries } = await supabaseAdmin.from('user_flashcard_discovery')
      .select('card_id, next_yearly_review_at')
      .eq('user_email', session.user.email);

    const discoveredIds = new Set((discoveries || []).map((d: any) => d.card_id));

    // Only filter builtin cards by discovery; user-created cards are always visible
    allCards = allCards.filter((c: any) => c.source === 'user' || discoveredIds.has(c.id));
  }

  // Fetch spaced repetition data for all cards
  const cardIds = allCards.map((c: any) => c.id);
  if (cardIds.length > 0) {
    const { data: reviews } = await supabaseAdmin.from('flashcard_reviews')
      .select('*')
      .eq('user_email', session.user.email)
      .in('card_id', cardIds);

    const reviewMap = new Map<string, any>();
    (reviews || []).forEach((r: any) => reviewMap.set(r.card_id, r));

    allCards.forEach((c: any) => {
      const review = reviewMap.get(c.id);
      if (review) {
        c.ease_factor = review.ease_factor;
        c.interval_days = review.interval_days;
        c.next_review_at = review.next_review_at;
        c.times_reviewed = review.times_reviewed;
        c.times_correct = review.times_correct;
      }
    });
  }

  // Get discovery stats
  const { data: totalBuiltin } = await supabaseAdmin.from('flashcards').select('id', { count: 'exact' });
  const { data: userDiscoveries } = await supabaseAdmin.from('user_flashcard_discovery')
    .select('id', { count: 'exact' })
    .eq('user_email', session.user.email);

  return NextResponse.json({
    cards: allCards,
    stats: {
      total_available: totalBuiltin?.length || 0,
      discovered: userDiscoveries?.length || 0,
      user_created: userCards.length,
    },
  });
}, { routeName: 'learn/flashcards' });

// POST — Create a flashcard (user or builtin for admins)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { term, definition, hint_1, hint_2, hint_3, keywords, tags, module_id, lesson_id, source: requestedSource } = body;

  if (!term?.trim() || !definition?.trim()) {
    return NextResponse.json({ error: 'Term and definition are required' }, { status: 400 });
  }

  // Admin can create builtin flashcards
  if (requestedSource === 'builtin' && isAdmin(session.user.email)) {
    const { data, error } = await supabaseAdmin.from('flashcards').insert({
      term: term.trim(),
      definition: definition.trim(),
      hint_1: hint_1?.trim() || null,
      hint_2: hint_2?.trim() || null,
      hint_3: hint_3?.trim() || null,
      keywords: keywords || [],
      tags: tags || [],
      module_id: module_id || null,
      lesson_id: lesson_id || null,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ card: { ...data, source: 'builtin' } });
  }

  const { data, error } = await supabaseAdmin.from('user_flashcards').insert({
    user_email: session.user.email,
    term: term.trim(),
    definition: definition.trim(),
    hint_1: hint_1?.trim() || null,
    hint_2: hint_2?.trim() || null,
    hint_3: hint_3?.trim() || null,
    keywords: keywords || [],
    tags: tags || [],
    module_id: module_id || null,
    lesson_id: lesson_id || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: { ...data, source: 'user' } });
}, { routeName: 'learn/flashcards' });

// PUT — Update a user flashcard OR submit a review rating
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, source, review_rating, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Card ID required' }, { status: 400 });

  // Handle spaced repetition review
  if (review_rating) {
    const cardSource = source || 'user';

    // Get or create review record
    const { data: existing } = await supabaseAdmin.from('flashcard_reviews')
      .select('*')
      .eq('user_email', session.user.email)
      .eq('card_id', id)
      .eq('card_source', cardSource)
      .maybeSingle();

    const prevEase = existing?.ease_factor || 2.5;
    const prevInterval = existing?.interval_days || 0;
    const prevReps = existing?.repetitions || 0;
    const prevReviewed = existing?.times_reviewed || 0;
    const prevCorrect = existing?.times_correct || 0;

    const { ease, interval, reps, nextReview } = calculateSM2(
      review_rating, prevEase, prevInterval, prevReps
    );

    const isCorrect = review_rating === 'good' || review_rating === 'easy';

    const reviewData = {
      user_email: session.user.email,
      card_id: id,
      card_source: cardSource,
      ease_factor: ease,
      interval_days: interval,
      repetitions: reps,
      next_review_at: nextReview.toISOString(),
      last_rating: review_rating,
      times_reviewed: prevReviewed + 1,
      times_correct: prevCorrect + (isCorrect ? 1 : 0),
    };

    if (existing) {
      await supabaseAdmin.from('flashcard_reviews')
        .update(reviewData)
        .eq('id', existing.id);
    } else {
      await supabaseAdmin.from('flashcard_reviews')
        .insert(reviewData);
    }

    return NextResponse.json({ success: true, next_review: nextReview.toISOString() });
  }

  // Admin editing builtin flashcards
  if (source === 'builtin' && isAdmin(session.user.email)) {
    const allowedFields = ['term', 'definition', 'hint_1', 'hint_2', 'hint_3', 'keywords', 'tags', 'module_id', 'lesson_id'];
    const cleanUpdates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) cleanUpdates[field] = updates[field];
    }
    const { data, error } = await supabaseAdmin.from('flashcards')
      .update(cleanUpdates).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ card: data });
  }

  // Regular user card update
  const { data, error } = await supabaseAdmin.from('user_flashcards')
    .update(updates).eq('id', id).eq('user_email', session.user.email).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}, { routeName: 'learn/flashcards' });

// DELETE — Delete a user flashcard
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Card ID required' }, { status: 400 });

  const { error } = await supabaseAdmin.from('user_flashcards')
    .delete().eq('id', id).eq('user_email', session.user.email);

  // Also clean up review data
  await supabaseAdmin.from('flashcard_reviews')
    .delete().eq('card_id', id).eq('user_email', session.user.email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}, { routeName: 'learn/flashcards' });
