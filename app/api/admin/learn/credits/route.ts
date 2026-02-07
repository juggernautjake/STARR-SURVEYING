// app/api/admin/learn/credits/route.ts — Learning credit values & thresholds
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Fetch credit values, thresholds, and optionally employee credit summary
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const section = searchParams.get('section'); // 'values', 'thresholds', 'employee', or all

  const results: Record<string, unknown> = {};

  if (!section || section === 'values') {
    const { data } = await supabaseAdmin.from('learning_credit_values').select('*').eq('is_active', true).order('entity_type').order('created_at');
    results.credit_values = data || [];
  }

  if (!section || section === 'thresholds') {
    const { data } = await supabaseAdmin.from('credit_thresholds').select('*').eq('is_active', true).order('points_required');
    results.thresholds = data || [];
  }

  // Employee-specific credits
  const targetEmail = email || session.user.email;
  if (!section || section === 'employee') {
    const { data: credits } = await supabaseAdmin
      .from('employee_learning_credits')
      .select('*')
      .eq('user_email', targetEmail)
      .order('earned_at', { ascending: false });

    const totalPoints = (credits || []).reduce((s: number, c: { points_earned: number }) => s + c.points_earned, 0);

    const { data: achievements } = await supabaseAdmin
      .from('employee_threshold_achievements')
      .select('*')
      .eq('user_email', targetEmail);

    results.employee_credits = credits || [];
    results.total_points = totalPoints;
    results.achievements = achievements || [];
  }

  return NextResponse.json(results);
}, { routeName: 'learn/credits' });

// POST: Admin creates/updates credit values or thresholds
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { type } = body as { type: string; [key: string]: unknown };

  if (type === 'credit_value') {
    const { entity_type, entity_id, entity_label, credit_points, description } = body;
    if (!entity_type || credit_points === undefined) {
      return NextResponse.json({ error: 'entity_type and credit_points required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from('learning_credit_values').insert({
      entity_type, entity_id: entity_id || null, entity_label: entity_label || null,
      credit_points, description: description || null, created_by: session.user.email,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (type === 'threshold') {
    const { threshold_name, points_required, reward_type, raise_amount, bonus_amount, credential_key, description, is_repeatable } = body;
    if (!threshold_name || !points_required || !reward_type) {
      return NextResponse.json({ error: 'threshold_name, points_required, reward_type required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from('credit_thresholds').insert({
      threshold_name, points_required, reward_type,
      raise_amount: raise_amount || 0, bonus_amount: bonus_amount || 0,
      credential_key: credential_key || null, description: description || null,
      is_repeatable: is_repeatable || false, created_by: session.user.email,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Award credits to employee (manual or auto)
  if (type === 'award') {
    const { user_email, entity_type: etype, entity_id: eid, entity_label: elabel, points_earned, source_type: stype, source_id: sid, notes } = body;
    if (!user_email || !points_earned) {
      return NextResponse.json({ error: 'user_email and points_earned required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from('employee_learning_credits').insert({
      user_email, entity_type: etype || 'manual', entity_id: eid || null,
      entity_label: elabel || null, points_earned,
      source_type: stype || 'manual', source_id: sid || null,
      awarded_by: session.user.email, notes: notes || null,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Check if employee hit any thresholds
    const { data: allCredits } = await supabaseAdmin
      .from('employee_learning_credits')
      .select('points_earned')
      .eq('user_email', user_email);

    const totalPoints = (allCredits || []).reduce((s: number, c: { points_earned: number }) => s + c.points_earned, 0);

    const { data: thresholds } = await supabaseAdmin
      .from('credit_thresholds')
      .select('*')
      .eq('is_active', true)
      .lte('points_required', totalPoints)
      .order('points_required');

    const { data: existingAch } = await supabaseAdmin
      .from('employee_threshold_achievements')
      .select('threshold_id')
      .eq('user_email', user_email);

    const achievedIds = new Set<string>((existingAch || []).map((a: { threshold_id: string }) => a.threshold_id));
    const newlyReached = (thresholds || []).filter((t: { id: string }) => !achievedIds.has(t.id));

    // Record new achievements and notify admin
    for (const threshold of newlyReached) {
      await supabaseAdmin.from('employee_threshold_achievements').insert({
        user_email, threshold_id: threshold.id,
        points_at_achievement: totalPoints, action_taken: 'pending_admin',
      });

      // Notify admins about threshold reached
      await supabaseAdmin.from('notifications').insert({
        user_email: session.user.email,
        type: 'threshold_reached',
        title: `${user_email} reached "${threshold.threshold_name}"`,
        body: `Employee has ${totalPoints} points (needed ${threshold.points_required}). Reward: ${threshold.reward_type}`,
        icon: '🏆',
        link: `/admin/employees?manage=${encodeURIComponent(user_email)}`,
        source_type: 'learning',
      });
    }

    return NextResponse.json({ data, total_points: totalPoints, new_thresholds: newlyReached.length });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}, { routeName: 'learn/credits' });

// PUT: Update credit value or threshold
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { table, id, ...updates } = body as { table: string; id: string; [key: string]: unknown };

  if (!table || !id) return NextResponse.json({ error: 'table and id required' }, { status: 400 });

  const allowed = ['learning_credit_values', 'credit_thresholds', 'employee_threshold_achievements'];
  if (!allowed.includes(table)) return NextResponse.json({ error: 'Invalid table' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}, { routeName: 'learn/credits' });
