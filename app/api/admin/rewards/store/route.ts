// app/api/admin/rewards/store/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — Admin: list all store items + pending purchases + pay config */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const [
    { data: items },
    { data: pendingPurchases },
    { data: allPurchases },
    { data: milestones },
    { data: badges },
    { data: workTypeRates },
    { data: roleTiers },
    { data: seniorityBrackets },
    { data: credentialBonuses },
    { data: payConfig },
  ] = await Promise.all([
    supabaseAdmin.from('rewards_catalog').select('*').order('sort_order'),
    supabaseAdmin.from('rewards_purchases').select('*, rewards_catalog(name, category, tier)').eq('status', 'pending').order('created_at', { ascending: false }),
    supabaseAdmin.from('rewards_purchases').select('*, rewards_catalog(name, category, tier)').order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('xp_pay_milestones').select('*').order('xp_threshold'),
    supabaseAdmin.from('badges').select('*').order('sort_order'),
    supabaseAdmin.from('work_type_rates').select('*').order('base_rate', { ascending: false }),
    supabaseAdmin.from('role_tiers').select('*').order('base_bonus'),
    supabaseAdmin.from('seniority_brackets').select('*').order('min_years'),
    supabaseAdmin.from('credential_bonuses').select('*').order('bonus_per_hour', { ascending: false }),
    supabaseAdmin.from('pay_system_config').select('*').order('key'),
  ]);

  return NextResponse.json({
    items: items || [],
    pending_purchases: pendingPurchases || [],
    all_purchases: allPurchases || [],
    milestones: milestones || [],
    badges: badges || [],
    work_type_rates: workTypeRates || [],
    role_tiers: roleTiers || [],
    seniority_brackets: seniorityBrackets || [],
    credential_bonuses: credentialBonuses || [],
    pay_config: payConfig || [],
  });
}, { routeName: 'rewards/store' });

/* POST — Admin: add or update store item */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, description, category, xp_cost, tier, stock_quantity, is_active, sort_order, image_url } = body;

  if (!name || !category || !xp_cost || !tier) {
    return NextResponse.json({ error: 'name, category, xp_cost, and tier required' }, { status: 400 });
  }

  const itemData = {
    name, description, category, xp_cost, tier,
    stock_quantity: stock_quantity ?? -1,
    is_active: is_active ?? true,
    sort_order: sort_order ?? 0,
    image_url: image_url || null,
  };

  if (id) {
    const { data, error } = await supabaseAdmin.from('rewards_catalog')
      .update(itemData).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  const { data, error } = await supabaseAdmin.from('rewards_catalog')
    .insert(itemData).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}, { routeName: 'rewards/store' });

/* PUT — Admin: update any pay/rewards entity */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { entity, id, ...updates } = body;

  if (entity === 'milestone') {
    if (id) {
      const { data, error } = await supabaseAdmin.from('xp_pay_milestones')
        .update(updates).eq('id', id).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ milestone: data });
    }
    // Create new milestone
    const { data, error } = await supabaseAdmin.from('xp_pay_milestones')
      .insert(updates).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ milestone: data });
  }

  if (entity === 'badge') {
    const { data } = await supabaseAdmin.from('badges')
      .update(updates).eq('id', id).select().single();
    return NextResponse.json({ badge: data });
  }

  if (entity === 'work_type_rate') {
    const { data, error } = await supabaseAdmin.from('work_type_rates')
      .update(updates).eq('work_type', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ work_type_rate: data });
  }

  if (entity === 'role_tier') {
    const { data, error } = await supabaseAdmin.from('role_tiers')
      .update(updates).eq('role_key', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ role_tier: data });
  }

  if (entity === 'seniority_bracket') {
    const { data, error } = await supabaseAdmin.from('seniority_brackets')
      .update(updates).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ seniority_bracket: data });
  }

  if (entity === 'credential_bonus') {
    const { data, error } = await supabaseAdmin.from('credential_bonuses')
      .update(updates).eq('credential_key', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ credential_bonus: data });
  }

  if (entity === 'pay_config') {
    const { data, error } = await supabaseAdmin.from('pay_system_config')
      .update({ value: updates.value, description: updates.description })
      .eq('key', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ config: data });
  }

  if (entity === 'store_item') {
    const { data, error } = await supabaseAdmin.from('rewards_catalog')
      .update(updates).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  }

  return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
}, { routeName: 'rewards/store' });

/* DELETE — Admin: delete entity */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get('entity');
  const id = searchParams.get('id');

  if (!entity || !id) {
    return NextResponse.json({ error: 'entity and id required' }, { status: 400 });
  }

  if (entity === 'milestone') {
    const { error } = await supabaseAdmin.from('xp_pay_milestones').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (entity === 'store_item') {
    const { error } = await supabaseAdmin.from('rewards_catalog').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Cannot delete this entity type' }, { status: 400 });
}, { routeName: 'rewards/store' });
