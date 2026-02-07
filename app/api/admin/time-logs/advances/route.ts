// app/api/admin/time-logs/advances/route.ts — Pay advance requests
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: List advance requests
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const admin = isAdmin(session.user.email);

  let query = supabaseAdmin
    .from('pay_advance_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (!admin) query = query.eq('user_email', session.user.email);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ advances: data || [] });
}, { routeName: 'time-logs/advances' });

// POST: Submit advance request (employee) or review (admin)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const admin = isAdmin(session.user.email);

  // Admin reviewing an existing request
  if (body.id && admin) {
    const { id, action, denial_reason, pay_date, notes } = body as {
      id: string;
      action: 'approve' | 'deny';
      denial_reason?: string;
      pay_date?: string;
      notes?: string;
    };

    const updateData: Record<string, unknown> = {
      reviewed_by: session.user.email,
      reviewed_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      updateData.status = 'approved';
      updateData.pay_date = pay_date || new Date().toISOString().split('T')[0];
      if (notes) updateData.notes = notes;
    } else {
      updateData.status = 'denied';
      updateData.denial_reason = denial_reason || 'Denied by admin';
    }

    const { data, error } = await supabaseAdmin
      .from('pay_advance_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ advance: data });
  }

  // Employee submitting new request
  const { amount, reason } = body as { amount: number; reason: string };
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Valid amount required' }, { status: 400 });
  if (!reason?.trim()) return NextResponse.json({ error: 'Reason is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('pay_advance_requests')
    .insert({
      user_email: session.user.email,
      amount,
      reason: reason.trim(),
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'advance_requested',
      entity_type: 'pay_advance_requests',
      entity_id: data.id,
      metadata: { amount },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ advance: data }, { status: 201 });
}, { routeName: 'time-logs/advances' });

// DELETE: Cancel own pending advance request
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('pay_advance_requests')
    .select('user_email, status')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const admin = isAdmin(session.user.email);
  if (!admin && existing.user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!admin && existing.status !== 'pending') {
    return NextResponse.json({ error: 'Can only cancel pending requests' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('pay_advance_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'time-logs/advances' });
