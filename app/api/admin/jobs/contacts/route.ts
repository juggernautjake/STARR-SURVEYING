// app/api/admin/jobs/contacts/route.ts
//
// contacts plan Slice 6 — job-side surface for the contacts ↔ jobs
// join. Mirrors `app/api/admin/contacts/[id]/jobs` so the job-detail
// page can list / link / unlink contacts from one endpoint.
//
//   GET    /api/admin/jobs/contacts?job_id=<id>
//          → { links: { id, role, notes, contact_id, contacts(id, name, company, email, phone, labels) }[] }
//
//   POST   /api/admin/jobs/contacts
//          body: { job_id, contact_id, role?, notes? }
//
//   DELETE /api/admin/jobs/contacts?job_id=<id>&contact_id=<cid>[&role=]
//          (no role = remove every pairing for this (job, contact))

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get('job_id')?.trim();
  if (!job_id) return NextResponse.json({ error: 'job_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('job_contacts')
    .select('id, role, notes, created_at, created_by, contact_id, contacts(id, name, company, email, phone, labels)')
    .eq('job_id', job_id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}, { routeName: 'admin/jobs/contacts#get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const job_id = (body.job_id as string | undefined)?.trim();
  const contact_id = (body.contact_id as string | undefined)?.trim();
  const role = (body.role as string | undefined)?.trim() || 'client';
  const notes = (body.notes as string | undefined)?.trim() || null;
  if (!job_id || !contact_id) {
    return NextResponse.json({ error: 'job_id and contact_id are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('job_contacts')
    .insert({ job_id, contact_id, role, notes, created_by: session.user.email })
    .select('id, job_id, contact_id, role, notes, created_at, created_by')
    .single();
  if (error) {
    if (typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'This contact is already linked to that job in that role.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: data }, { status: 201 });
}, { routeName: 'admin/jobs/contacts#post' });

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get('job_id')?.trim();
  const contact_id = searchParams.get('contact_id')?.trim();
  const role = searchParams.get('role')?.trim();
  if (!job_id || !contact_id) {
    return NextResponse.json({ error: 'job_id and contact_id are required' }, { status: 400 });
  }
  let query = supabaseAdmin
    .from('job_contacts')
    .delete()
    .eq('job_id', job_id)
    .eq('contact_id', contact_id);
  if (role) query = query.eq('role', role);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/jobs/contacts#delete' });
