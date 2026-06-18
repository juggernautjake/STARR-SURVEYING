// app/api/admin/roles/custom/route.ts
//
// Slice W7 — CRUD endpoint for the admin-defined custom_roles
// table.
//
// GET   — list every custom role (admin only)
// POST  — create one { key?, label, description?, permissions? }
//
// If `key` is omitted, the server slugifies the label.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  normalizeLabel,
  slugifyRoleKey,
  validateRoleKey,
} from '@/lib/admin/role-builder';

const SELECT_COLS = 'id, key, label, description, permissions, created_by, created_at, updated_at';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('custom_roles')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: data ?? [] });
}, { routeName: 'admin/roles/custom' });

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as {
    key?: string;
    label?: string;
    description?: string;
    permissions?: Record<string, unknown>;
  };

  const label = normalizeLabel(body.label);
  if (!label) {
    return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
  }

  // Either accept the caller's key OR slugify the label. The
  // resulting key always runs through validateRoleKey so it
  // matches the CHECK constraint in the migration.
  const candidate = typeof body.key === 'string' && body.key.trim()
    ? body.key.trim()
    : (slugifyRoleKey(label) ?? '');
  const validated = validateRoleKey(candidate);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const description = normalizeLabel(body.description);
  const permissions = body.permissions && typeof body.permissions === 'object'
    ? body.permissions
    : {};

  const { data, error } = await supabaseAdmin
    .from('custom_roles')
    .insert({
      key: validated.key,
      label,
      description,
      permissions,
      created_by: session.user.email,
    })
    .select(SELECT_COLS)
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Role key "${validated.key}" already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ role: data }, { status: 201 });
}, { routeName: 'admin/roles/custom' });
