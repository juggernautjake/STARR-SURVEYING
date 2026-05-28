// app/api/admin/leads/route.ts
// CRUD for the sales-pipeline leads board (/admin/leads). Admin-only.
//
// GET    /api/admin/leads                 — list leads (newest first)
//          ?status=quoted                 — optional status filter
//          ?search=acme                   — optional name/company/email/phone search
// POST   /api/admin/leads                 — create { name, ... }
// PATCH  /api/admin/leads                 — update { id, status?, ...fields }
// DELETE /api/admin/leads?id=<id>         — delete a lead
//
// Storage: seeds/292_leads.sql.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS =
  'id, name, email, phone, company, source, status, notes, property_address, city, state, survey_type, estimated_acreage, quote_amount, assigned_to, follow_up_date, converted_job_id, created_by, created_at, updated_at';
const VALID_STATUS = new Set(['new', 'contacted', 'quoted', 'accepted', 'declined', 'lost']);

// Fields a client may set on create/update (besides status, handled separately).
const EDITABLE_FIELDS = [
  'name', 'email', 'phone', 'company', 'source', 'notes', 'property_address',
  'city', 'state', 'survey_type', 'estimated_acreage', 'quote_amount',
  'assigned_to', 'follow_up_date',
] as const;

function pickEditable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f] === '' ? null : body[f];
  }
  return out;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isAdmin(session.user.roles)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { email: session.user.email };
}

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let query = supabaseAdmin
    .from('leads')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false });

  if (status && status !== 'all' && VALID_STATUS.has(status)) query = query.eq('status', status);
  if (search && search.trim()) {
    const t = search.trim().replace(/[%,]/g, '');
    query = query.or(`name.ilike.%${t}%,company.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}, { routeName: 'admin/leads' });

// ─── POST — create ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const status = typeof body.status === 'string' && VALID_STATUS.has(body.status) ? body.status : 'new';

  const { data, error } = await supabaseAdmin
    .from('leads')
    .insert({ ...pickEditable(body), name, status, created_by: gate.email })
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data }, { status: 201 });
}, { routeName: 'admin/leads' });

// ─── PATCH — update / advance status ──────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json() as Record<string, unknown>;
  if (typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { ...pickEditable(body), updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUS.has(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${String(body.status)}` }, { status: 400 });
    }
    patch.status = body.status;
  }
  if ('name' in patch && !String(patch.name).trim()) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update(patch)
    .eq('id', body.id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  return NextResponse.json({ lead: data });
}, { routeName: 'admin/leads' });

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });

  const { error } = await supabaseAdmin.from('leads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/leads' });
