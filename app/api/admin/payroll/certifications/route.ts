// app/api/admin/payroll/certifications/route.ts — Employee certifications
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// GET: Get certifications for a user
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const targetEmail = email || session.user.email;

  if (!isAdmin(session.user.email) && targetEmail !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('employee_certifications')
    .select('*')
    .eq('user_email', targetEmail)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ certifications: data || [] });
}

// POST: Add a certification
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { user_email, certification_type, certification_name, issued_date, expiry_date,
          license_number, pay_bump_amount, pay_bump_percentage, document_url } = body;

  const targetEmail = user_email || session.user.email;

  // Anyone can add their own certs, but pay bump requires admin
  if (targetEmail !== session.user.email && !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const insertData: Record<string, unknown> = {
    user_email: targetEmail,
    certification_type: certification_type || 'other',
    certification_name: certification_name || certification_type,
    issued_date, expiry_date, license_number, document_url,
    pay_bump_amount: isAdmin(session.user.email) ? (pay_bump_amount || 0) : 0,
    pay_bump_percentage: isAdmin(session.user.email) ? (pay_bump_percentage || 0) : 0,
    verified: isAdmin(session.user.email),
    verified_by: isAdmin(session.user.email) ? session.user.email : null,
    verified_at: isAdmin(session.user.email) ? new Date().toISOString() : null,
  };

  const { data, error } = await supabaseAdmin
    .from('employee_certifications')
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ certification: data }, { status: 201 });
}

// PUT: Update certification (admin: verify & set pay bump; user: update details)
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'Certification ID required' }, { status: 400 });

  // Check ownership
  const { data: existing } = await supabaseAdmin
    .from('employee_certifications')
    .select('user_email')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (existing.user_email !== session.user.email && !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Non-admins cannot set pay bump or verify
  if (!isAdmin(session.user.email)) {
    delete updates.pay_bump_amount;
    delete updates.pay_bump_percentage;
    delete updates.verified;
    delete updates.verified_by;
    delete updates.verified_at;
  }

  // Admin verification
  if (isAdmin(session.user.email) && updates.verified) {
    updates.verified_by = session.user.email;
    updates.verified_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('employee_certifications')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ certification: data });
}

// DELETE: Remove certification
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from('employee_certifications')
    .select('user_email')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.user_email !== session.user.email && !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('employee_certifications').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
