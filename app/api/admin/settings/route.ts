// app/api/admin/settings/route.ts
// Org-wide application settings (key -> JSONB sections). Admin only.
//
// GET /api/admin/settings           — returns { settings: { <key>: <value>, … } }
// PUT /api/admin/settings           — upsert one section { key, value }
//
// Storage: seeds/294_app_settings.sql.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// Sections the UI is allowed to write. Keeps arbitrary keys out of the store.
//
// C0b2 (2026-08-15) added 'mileage' — { fuelPriceCents } — for the org-wide fuel price the trip
// form estimates against. Worth noting the shape of this list: it is a WHITELIST, so a new section
// that is written to the table by a seed but not named here reads back fine and silently 400s on
// save. That is the "authored but not wired" failure this codebase hits most often.
const ALLOWED_KEYS = new Set(['general', 'company', 'mileage']);

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin.from('app_settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) settings[(row as { key: string }).key] = (row as { value: unknown }).value;
  return NextResponse.json({ settings });
}, { routeName: 'admin/settings' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { key?: string; value?: unknown };
  if (!body.key || !ALLOWED_KEYS.has(body.key)) {
    return NextResponse.json({ error: `Invalid settings key: ${String(body.key)}` }, { status: 400 });
  }
  if (body.value === null || typeof body.value !== 'object' || Array.isArray(body.value)) {
    return NextResponse.json({ error: 'value must be an object' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .upsert(
      { key: body.key, value: body.value, updated_by: session.user.email, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    .select('key, value')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ setting: data });
}, { routeName: 'admin/settings' });
