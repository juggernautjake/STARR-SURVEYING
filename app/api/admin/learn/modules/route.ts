// app/api/admin/learn/modules/route.ts
import { auth, isAdmin, canManageContent } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userCanManage = canManageContent(session.user.email);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data: mod } = await supabaseAdmin.from('learning_modules').select('*').eq('id', id).single();
    // Non-admin users cannot access draft modules
    if (!userCanManage && mod?.status === 'draft') {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }
    let lessonsQuery = supabaseAdmin.from('learning_lessons')
      .select('id, title, order_index, estimated_minutes, status, tags')
      .eq('module_id', id);
    if (!userCanManage) lessonsQuery = lessonsQuery.eq('status', 'published');
    const { data: lessons } = await lessonsQuery.order('order_index');
    const { data: questionCount } = await supabaseAdmin.from('question_bank')
      .select('id', { count: 'exact' }).eq('module_id', id).is('lesson_id', null);
    return NextResponse.json({
      module: mod,
      lessons: lessons || [],
      test_question_count: questionCount?.length || 0,
    });
  }

  // Non-admin users only see published modules
  let modulesQuery = supabaseAdmin.from('learning_modules').select('*');
  if (!userCanManage) modulesQuery = modulesQuery.eq('status', 'published');
  const { data: modules } = await modulesQuery.order('order_index');

  // Get lesson counts and XP config
  const { data: xpConfigs } = await supabaseAdmin.from('module_xp_config')
    .select('module_id, xp_value, expiry_months, difficulty_rating')
    .eq('module_type', 'learning_module').eq('is_active', true);

  const xpMap = new Map<string, { xp_value: number; expiry_months: number; difficulty_rating: number }>();
  let defaultXP = { xp_value: 500, expiry_months: 18, difficulty_rating: 3 };
  (xpConfigs || []).forEach((c: { module_id: string | null; xp_value: number; expiry_months: number; difficulty_rating: number }) => {
    if (!c.module_id) defaultXP = c;
    else xpMap.set(c.module_id, c);
  });

  const modulesWithCounts = await Promise.all((modules || []).map(async (m: any) => {
    let countQuery = supabaseAdmin.from('learning_lessons')
      .select('id', { count: 'exact' }).eq('module_id', m.id);
    if (!userCanManage) countQuery = countQuery.eq('status', 'published');
    const { data } = await countQuery;
    const xpConfig = xpMap.get(m.id) || defaultXP;
    return { ...m, lesson_count: data?.length || 0, xp_value: xpConfig.xp_value, expiry_months: xpConfig.expiry_months };
  }));

  return NextResponse.json({ modules: modulesWithCounts });
}, { routeName: 'learn/modules' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !canManageContent(session.user.email)) {
    return NextResponse.json({ error: 'Content management access required' }, { status: 403 });
  }
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('learning_modules').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ module: data });
}, { routeName: 'learn/modules' });

/* PUT — Admin/Teacher: update a module */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !canManageContent(session.user.email)) {
    return NextResponse.json({ error: 'Content management access required' }, { status: 403 });
  }
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Only allow safe fields
  const allowed: Record<string, unknown> = {};
  const safeFields = ['title', 'description', 'difficulty', 'estimated_hours', 'order_index', 'status', 'tags', 'xp_reward', 'is_fs_required'];
  for (const key of safeFields) {
    if (updates[key] !== undefined) allowed[key] = updates[key];
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from('learning_modules')
    .update(allowed).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync xp_reward to module_xp_config so the XP award system picks it up
  if (updates.xp_reward !== undefined) {
    const { data: existingConfig } = await supabaseAdmin.from('module_xp_config')
      .select('id').eq('module_type', 'learning_module').eq('module_id', id).maybeSingle();

    if (existingConfig) {
      await supabaseAdmin.from('module_xp_config')
        .update({ xp_value: Number(updates.xp_reward) })
        .eq('id', existingConfig.id);
    } else {
      await supabaseAdmin.from('module_xp_config')
        .insert({ module_type: 'learning_module', module_id: id, xp_value: Number(updates.xp_reward), is_active: true });
    }
  }

  return NextResponse.json({ module: data });
}, { routeName: 'learn/modules' });
