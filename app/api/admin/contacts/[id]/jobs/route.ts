// app/api/admin/contacts/[id]/jobs/route.ts
//
// contacts plan Slice 2 — link a contact to a job (POST) or unlink
// them (DELETE). Backed by the `job_contacts` join shipped in
// seeds/305. The same surface is consumed by:
//
//   - the contact profile page (Slice 4 — "Link this contact to a job")
//   - the job detail page picker (Slice 6 — "Add a contact to this job")
//
// The unique constraint `(job_id, contact_id, role)` on the join
// prevents duplicates so a second POST with the same triple just
// returns 409.

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeJobLinkInput } from '@/lib/contacts/payload';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });

  const body = await req.json();
  const sanitized = sanitizeJobLinkInput(body);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('job_contacts')
    .insert({
      job_id: sanitized.value.job_id,
      contact_id: id,
      role: sanitized.value.role,
      notes: sanitized.value.notes,
      created_by: session.user.email,
    })
    .select('id, job_id, contact_id, role, notes, created_at, created_by')
    .single();

  if (error) {
    // Postgres unique violation surfaces as code '23505' inside the
    // supabase error envelope. Map it to a friendlier 409 so the UI
    // can tell the user "already linked".
    if (typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'This contact is already linked to that job in that role.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const job_id = searchParams.get('job_id')?.trim();
  const role = searchParams.get('role')?.trim();
  if (!job_id) return NextResponse.json({ error: 'job_id is required' }, { status: 400 });

  let query = supabaseAdmin
    .from('job_contacts')
    .delete()
    .eq('contact_id', id)
    .eq('job_id', job_id);
  // Optional role filter — when omitted we remove every role pairing
  // for this (contact, job).
  if (role) query = query.eq('role', role);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
