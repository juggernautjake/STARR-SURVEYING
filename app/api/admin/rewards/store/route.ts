// app/api/admin/rewards/store/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — Admin: list all store items + pending purchases */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { data: items } = await supabaseAdmin.from('rewards_catalog')
    .select('*').order('sort_order');

  const { data: pendingPurchases } = await supabaseAdmin.from('rewards_purchases')
    .select('*, rewards_catalog(name, category, tier)')
    .eq('status', 'pending').order('created_at', { ascending: false });

  const { data: allPurchases } = await supabaseAdmin.from('rewards_purchases')
    .select('*, rewards_catalog(name, category, tier)')
    .order('created_at', { ascending: false }).limit(50);

  // XP milestones config
  const { data: milestones } = await supabaseAdmin.from('xp_pay_milestones')
    .select('*').order('xp_threshold');

  // Badge list
  const { data: badges } = await supabaseAdmin.from('badges')
    .select('*').order('sort_order');

  return NextResponse.json({
    items: items || [],
    pending_purchases: pendingPurchases || [],
    all_purchases: allPurchases || [],
    milestones: milestones || [],
    badges: badges || [],
  });
}, { routeName: 'rewards/store' });

/* POST — Admin: add or update store item */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, description, category, xp_cost, tier, stock_quantity, is_active, sort_order } = body;

  if (!name || !category || !xp_cost || !tier) {
    return NextResponse.json({ error: 'name, category, xp_cost, and tier required' }, { status: 400 });
  }

  if (id) {
    // Update existing
    const { data, error } = await supabaseAdmin.from('rewards_catalog')
      .update({ name, description, category, xp_cost, tier, stock_quantity: stock_quantity ?? -1, is_active: is_active ?? true, sort_order: sort_order ?? 0 })
      .eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  // Create new
  const { data, error } = await supabaseAdmin.from('rewards_catalog')
    .insert({ name, description, category, xp_cost, tier, stock_quantity: stock_quantity ?? -1, is_active: is_active ?? true, sort_order: sort_order ?? 0 })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}, { routeName: 'rewards/store' });

/* PUT — Admin: update XP milestones or alert settings */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { entity, id, ...updates } = body;

  if (entity === 'milestone') {
    const { data } = await supabaseAdmin.from('xp_pay_milestones')
      .update(updates).eq('id', id).select().single();
    return NextResponse.json({ milestone: data });
  }

  if (entity === 'badge') {
    const { data } = await supabaseAdmin.from('badges')
      .update(updates).eq('id', id).select().single();
    return NextResponse.json({ badge: data });
  }

  return NextResponse.json({ error: 'Invalid entity' }, { status: 400 });
}, { routeName: 'rewards/store' });
