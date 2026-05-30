// app/api/admin/contacts/route.ts
//
// contacts plan Slice 2 — list + create endpoints for the
// `contacts` table (Slice 1 schema). Sub-routes under `[id]/` handle
// read-one / update / delete + the job-link write surface.
//
// Auth: every method requires a signed-in admin user; the contact
// records are firm-wide so any admin can see them.
//
// Query params on GET:
//   ?search=<q>     — case-insensitive ilike on name / company / email
//   ?label=<key>    — filter to contacts whose labels[] contains <key>
//   ?limit=<n>      — defaults to 100, caps at 500
//   ?order=<col>    — defaults to `updated_at desc` (most-recently
//                     touched), supports `name` for alphabetic view.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { sanitizeContactInput } from '@/lib/contacts/payload';

const SELECT_COLS =
  'id, name, email, phone, company, title, address, city, state, zip, labels, notes, created_at, created_by, updated_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim();
  const label = searchParams.get('label')?.trim();
  const orderParam = searchParams.get('order');
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 100)));

  let query = supabaseAdmin
    .from('contacts')
    .select(SELECT_COLS, { count: 'exact' });

  if (search) {
    const esc = search.replace(/[%_]/g, '\\$&');
    query = query.or(
      `name.ilike.%${esc}%,company.ilike.%${esc}%,email.ilike.%${esc}%`,
    );
  }
  if (label) query = query.contains('labels', [label]);

  if (orderParam === 'name') {
    query = query.order('name', { ascending: true });
  } else {
    query = query.order('updated_at', { ascending: false });
  }

  const { data, error, count } = await query.limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [], total: count ?? data?.length ?? 0 });
}, { routeName: 'admin/contacts#get' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const sanitized = sanitizeContactInput(body, { requireName: true });
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      ...sanitized.value,
      created_by: session.user.email,
    })
    .select(SELECT_COLS)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }
  return NextResponse.json({ contact: data }, { status: 201 });
}, { routeName: 'admin/contacts#post' });
