// app/api/admin/rewards/purchase/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* POST — Purchase item from rewards store */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { item_id, payment_method } = body;
  if (!item_id) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

  const useCash = payment_method === 'cash';

  // Get item
  const { data: item } = await supabaseAdmin.from('rewards_catalog')
    .select('*').eq('id', item_id).eq('is_active', true).single();
  if (!item) return NextResponse.json({ error: 'Item not found or unavailable' }, { status: 404 });

  // Check stock
  if (item.stock_quantity !== -1 && item.stock_quantity <= 0) {
    return NextResponse.json({ error: 'Item out of stock' }, { status: 400 });
  }

  // Cash purchase flow
  if (useCash) {
    if (!item.cash_price || item.cash_price <= 0) {
      return NextResponse.json({ error: 'This item is not available for cash purchase' }, { status: 400 });
    }

    // Create purchase record (no XP deduction)
    const { data: purchase } = await supabaseAdmin.from('rewards_purchases').insert({
      user_email: session.user.email,
      item_id: item.id,
      xp_spent: 0,
      status: 'pending',
      notes: `Cash purchase: $${item.cash_price.toFixed(2)}`,
    }).select().single();

    // Reduce stock if not unlimited
    if (item.stock_quantity !== -1) {
      await supabaseAdmin.from('rewards_catalog')
        .update({ stock_quantity: item.stock_quantity - 1 })
        .eq('id', item.id);
    }

    // Notify admins
    try {
      const { data: admins } = await supabaseAdmin.from('employee_profiles')
        .select('user_email').in('user_email', ['jake@starr-surveying.com']);
      for (const admin of (admins || [])) {
        await supabaseAdmin.from('notifications').insert({
          user_email: admin.user_email,
          type: 'store_purchase',
          title: 'New Cash Purchase',
          message: `${session.user.email} purchased "${item.name}" for $${item.cash_price.toFixed(2)} (cash)`,
          is_read: false,
        });
      }
    } catch { /* ignore */ }

    return NextResponse.json({ purchase, payment_method: 'cash', cash_amount: item.cash_price });
  }

  // XP purchase flow
  // Check balance
  const { data: balance } = await supabaseAdmin.from('xp_balances')
    .select('current_balance, total_spent').eq('user_email', session.user.email).maybeSingle();

  if (!balance || balance.current_balance < item.xp_cost) {
    return NextResponse.json({ error: 'Insufficient XP', needed: item.xp_cost, have: balance?.current_balance || 0 }, { status: 400 });
  }

  // Deduct XP
  const newBalance = balance.current_balance - item.xp_cost;
  await supabaseAdmin.from('xp_balances').update({
    current_balance: newBalance,
    total_spent: (balance.total_spent || 0) + item.xp_cost,
    last_updated: new Date().toISOString(),
  }).eq('user_email', session.user.email);

  // Log transaction
  await supabaseAdmin.from('xp_transactions').insert({
    user_email: session.user.email,
    amount: -item.xp_cost,
    transaction_type: 'store_purchase',
    source_type: 'store',
    source_id: item.id,
    description: `Purchased: ${item.name}`,
    balance_after: newBalance,
  });

  // Create purchase record
  const { data: purchase } = await supabaseAdmin.from('rewards_purchases').insert({
    user_email: session.user.email,
    item_id: item.id,
    xp_spent: item.xp_cost,
    status: 'pending',
  }).select().single();

  // Reduce stock if not unlimited
  if (item.stock_quantity !== -1) {
    await supabaseAdmin.from('rewards_catalog')
      .update({ stock_quantity: item.stock_quantity - 1 })
      .eq('id', item.id);
  }

  // Notify admins
  try {
    const { data: admins } = await supabaseAdmin.from('employee_profiles')
      .select('user_email').in('user_email', ['jake@starr-surveying.com']);
    for (const admin of (admins || [])) {
      await supabaseAdmin.from('notifications').insert({
        user_email: admin.user_email,
        type: 'store_purchase',
        title: 'New Store Purchase',
        message: `${session.user.email} purchased "${item.name}" for ${item.xp_cost} XP`,
        is_read: false,
      });
    }
  } catch { /* ignore */ }

  return NextResponse.json({ purchase, new_balance: newBalance });
}, { routeName: 'rewards/purchase' });

/* PUT — Admin: fulfill or cancel purchase */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { purchase_id, status, notes } = body;

  if (!purchase_id || !status) {
    return NextResponse.json({ error: 'purchase_id and status required' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { status };
  if (status === 'fulfilled') {
    updateData.fulfilled_by = session.user.email;
    updateData.fulfilled_at = new Date().toISOString();
  }
  if (notes) updateData.notes = notes;

  // If cancelling, refund XP
  if (status === 'cancelled') {
    const { data: purchase } = await supabaseAdmin.from('rewards_purchases')
      .select('user_email, xp_spent, status').eq('id', purchase_id).single();

    if (purchase && purchase.status === 'pending') {
      const { data: bal } = await supabaseAdmin.from('xp_balances')
        .select('current_balance, total_spent').eq('user_email', purchase.user_email).single();

      if (bal) {
        await supabaseAdmin.from('xp_balances').update({
          current_balance: bal.current_balance + purchase.xp_spent,
          total_spent: Math.max(0, (bal.total_spent || 0) - purchase.xp_spent),
        }).eq('user_email', purchase.user_email);

        await supabaseAdmin.from('xp_transactions').insert({
          user_email: purchase.user_email,
          amount: purchase.xp_spent,
          transaction_type: 'admin_adjustment',
          source_type: 'store_refund',
          source_id: purchase_id,
          description: `Refund: purchase cancelled by admin`,
          balance_after: bal.current_balance + purchase.xp_spent,
        });
      }
    }
  }

  const { data } = await supabaseAdmin.from('rewards_purchases')
    .update(updateData).eq('id', purchase_id).select().single();

  return NextResponse.json({ purchase: data });
}, { routeName: 'rewards/purchase' });
