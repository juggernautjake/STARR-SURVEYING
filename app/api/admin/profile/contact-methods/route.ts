// app/api/admin/profile/contact-methods/route.ts
//
// Slice EP2 — CRUD for public.employee_contact_methods.
//
//   GET    ?email=<email>     — list rows for that user (self OR admin)
//   POST   { kind, value, label?, is_primary? }
//                              — add one row owned by the signed-in user
//   PATCH  { id, ... }         — partial update of an own row
//   DELETE ?id=<id>            — remove an own row
//
// Storage: seeds/311_employee_contact_methods.sql.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  CONTACT_KINDS,
  normalizeLabel,
  validateContact,
  type ContactKind,
} from '@/lib/employee-profile/contact-methods';

const SELECT_COLS = 'id, user_email, kind, value, label, is_primary, created_at, updated_at';

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email') || session.user.email;

  // Non-admins can only see their own contact methods.
  if (!isAdmin(session.user.roles) && email !== session.user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('employee_contact_methods')
    .select(SELECT_COLS)
    .eq('user_email', email)
    .order('kind', { ascending: true })
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [] });
}, { routeName: 'profile/contact-methods' });

// ─── POST ─────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    kind?: string; value?: string; label?: string | null; is_primary?: boolean;
  };
  if (!body.kind || !CONTACT_KINDS.includes(body.kind as ContactKind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }
  const validated = validateContact(body.kind as ContactKind, body.value ?? '');
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const userEmail = session.user.email;
  const isPrimary = body.is_primary === true;

  // Slice EP2 — when the caller marks the new row as primary, demote
  // any existing primary of the same kind first so we don't end up
  // with two primaries on the same (user, kind).
  if (isPrimary) {
    await supabaseAdmin
      .from('employee_contact_methods')
      .update({ is_primary: false })
      .eq('user_email', userEmail)
      .eq('kind', body.kind)
      .eq('is_primary', true);
  }

  const { data, error } = await supabaseAdmin
    .from('employee_contact_methods')
    .insert({
      user_email: userEmail,
      kind: body.kind,
      value: validated.value,
      label: normalizeLabel(body.label),
      is_primary: isPrimary,
    })
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data }, { status: 201 });
}, { routeName: 'profile/contact-methods' });

// ─── PATCH ────────────────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    id?: string; value?: string; label?: string | null; is_primary?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Load the existing row to confirm ownership + carry kind into
  // the value validation below.
  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('employee_contact_methods')
    .select(SELECT_COLS)
    .eq('id', body.id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Contact method not found' }, { status: 404 });
  if (existing.user_email !== session.user.email && !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (body.value !== undefined) {
    const v = validateContact(existing.kind as ContactKind, body.value);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.value = v.value;
  }
  if (body.label !== undefined) patch.label = normalizeLabel(body.label);
  if (body.is_primary !== undefined) patch.is_primary = body.is_primary === true;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  // Same primary-demotion as POST.
  if (patch.is_primary === true) {
    await supabaseAdmin
      .from('employee_contact_methods')
      .update({ is_primary: false })
      .eq('user_email', existing.user_email)
      .eq('kind', existing.kind)
      .eq('is_primary', true)
      .neq('id', body.id);
  }

  const { data, error } = await supabaseAdmin
    .from('employee_contact_methods')
    .update(patch)
    .eq('id', body.id)
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}, { routeName: 'profile/contact-methods' });

// ─── DELETE ───────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Confirm ownership before delete.
  const { data: existing } = await supabaseAdmin
    .from('employee_contact_methods')
    .select('id, user_email')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Contact method not found' }, { status: 404 });
  if (existing.user_email !== session.user.email && !isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('employee_contact_methods')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'profile/contact-methods' });
