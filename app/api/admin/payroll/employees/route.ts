// app/api/admin/payroll/employees/route.ts — Employee profiles & pay management
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Get employee profile(s)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const includeInactive = searchParams.get('include_inactive') === 'true';

  // Non-admins can only see their own profile
  if (!isAdmin(session.user.email) && email && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (email || !isAdmin(session.user.email)) {
    const targetEmail = email || session.user.email;
    const { data, error } = await supabaseAdmin
      .from('employee_profiles')
      .select('*')
      .eq('user_email', targetEmail)
      .single();

    if (error && error.code === 'PGRST116') {
      return NextResponse.json({ profile: null, exists: false });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get certifications
    const { data: certs } = await supabaseAdmin
      .from('employee_certifications')
      .select('*')
      .eq('user_email', targetEmail)
      .order('created_at', { ascending: false });

    // Get raise history
    const { data: raises } = await supabaseAdmin
      .from('pay_raises')
      .select('*')
      .eq('user_email', targetEmail)
      .order('effective_date', { ascending: false });

    // Get latest raise for next review date
    const nextReview = raises && raises.length > 0 ? raises[0].next_review_date : null;

    return NextResponse.json({
      profile: data,
      certifications: certs || [],
      raise_history: raises || [],
      next_review_date: nextReview,
      exists: true,
    });
  }

  // Admin: list all employees
  let query = supabaseAdmin
    .from('employee_profiles')
    .select('*')
    .order('user_name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ employees: data || [] });
}

// POST: Create or update employee profile (admin only for others, self for own)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { user_email, ...profileData } = body;

  const targetEmail = user_email || session.user.email;

  // Non-admins can only update limited fields on their own profile
  if (!isAdmin(session.user.email)) {
    if (targetEmail !== session.user.email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Only allow bank info updates for non-admins
    const allowed = {
      user_email: targetEmail,
      user_name: profileData.user_name,
      bank_name: profileData.bank_name,
      bank_routing_last4: profileData.bank_routing_last4,
      bank_account_last4: profileData.bank_account_last4,
      bank_account_type: profileData.bank_account_type,
    };

    const { data, error } = await supabaseAdmin
      .from('employee_profiles')
      .upsert(allowed, { onConflict: 'user_email' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  }

  // Admin: full profile creation/update
  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .upsert({ user_email: targetEmail, ...profileData }, { onConflict: 'user_email' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  try {
    await supabaseAdmin.from('activity_log').insert({
      user_email: session.user.email,
      action_type: 'employee_profile_updated',
      entity_type: 'employee_profile',
      entity_id: data.id,
      metadata: { target_email: targetEmail },
    });
  } catch { /* ignore */ }

  return NextResponse.json({ profile: data });
}

// PUT: Update specific fields (admin only for pay-related fields)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { user_email, ...updates } = body;

  if (!user_email) return NextResponse.json({ error: 'user_email required' }, { status: 400 });

  // Pay-related fields require admin
  const payFields = ['hourly_rate', 'salary_type', 'annual_salary', 'job_title', 'pay_frequency'];
  const hasPayFields = payFields.some(f => f in updates);

  if (hasPayFields && !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Only admins can modify pay settings' }, { status: 403 });
  }

  if (!isAdmin(session.user.email) && user_email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('employee_profiles')
    .update(updates)
    .eq('user_email', user_email)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
