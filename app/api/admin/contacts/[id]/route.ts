// app/api/admin/contacts/[id]/route.ts
//
// contacts plan Slice 2 — read-one / update / delete for a single
// contact. GET includes the nested job-link list so the profile page
// (Slice 4) can render the "Linked jobs" section in one fetch.
//
// Hard delete on purpose — there's no `archived_at` on the table.
// If/when the user wants soft delete we add the column + flip this.

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { sanitizeContactInput } from '@/lib/contacts/payload';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SELECT_COLS =
  'id, name, email, phone, company, title, address, city, state, zip, labels, notes, created_at, created_by, updated_at';

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });

  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select(SELECT_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  // Nested job-link list, enriched with the job's name + number so the
  // profile page doesn't have to fan out.
  const { data: links, error: linksErr } = await supabaseAdmin
    .from('job_contacts')
    .select('id, role, notes, created_at, created_by, jobs(id, name, job_number, stage)')
    .eq('contact_id', id)
    .order('created_at', { ascending: false });
  if (linksErr) return NextResponse.json({ error: linksErr.message }, { status: 500 });

  return NextResponse.json({ contact, jobs: links ?? [] });
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });

  const body = await req.json();
  const sanitized = sanitizeContactInput(body);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  // Only include fields the caller actually sent, so a PATCH-style
  // partial update doesn't blank out untouched columns. `labels` is
  // always sent (sanitizeContactInput defaults to []), so callers who
  // don't want to clobber labels should pass the existing list.
  const patch: Record<string, unknown> = { ...sanitized.value };
  if (!('name' in body)) delete patch.name;

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing contact id' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
