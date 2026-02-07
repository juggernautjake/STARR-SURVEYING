// app/api/admin/time-logs/rates/route.ts — Work type rates, role tiers, seniority, credentials
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// GET: Fetch all rate configuration tables
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table'); // optional: filter to one table

  const results: Record<string, unknown> = {};

  if (!table || table === 'work_types') {
    const { data } = await supabaseAdmin
      .from('work_type_rates')
      .select('*')
      .order('sort_order');
    results.work_types = data || [];
  }

  if (!table || table === 'role_tiers') {
    const { data } = await supabaseAdmin
      .from('role_tiers')
      .select('*')
      .order('sort_order');
    results.role_tiers = data || [];
  }

  if (!table || table === 'seniority') {
    const { data } = await supabaseAdmin
      .from('seniority_brackets')
      .select('*')
      .order('min_years');
    results.seniority_brackets = data || [];
  }

  if (!table || table === 'credentials') {
    const { data } = await supabaseAdmin
      .from('credential_bonuses')
      .select('*')
      .order('sort_order');
    results.credential_bonuses = data || [];
  }

  // If user-specific, also get their earned credentials
  const email = searchParams.get('email');
  if (email) {
    const { data } = await supabaseAdmin
      .from('employee_earned_credentials')
      .select('*')
      .eq('user_email', email);
    results.earned_credentials = data || [];
  }

  return NextResponse.json(results);
}, { routeName: 'time-logs/rates' });

// PUT: Update a rate (admin only)
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.email)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { table, id, ...updates } = body as { table: string; id: string; [key: string]: unknown };

  if (!table || !id) return NextResponse.json({ error: 'table and id required' }, { status: 400 });

  const allowedTables = ['work_type_rates', 'role_tiers', 'seniority_brackets', 'credential_bonuses'];
  if (!allowedTables.includes(table)) {
    return NextResponse.json({ error: 'Invalid table' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}, { routeName: 'time-logs/rates' });
