// app/api/admin/research/county-config/route.ts
// Phase 16: County Configuration Registry API
//
// GET  — List all active county portal configs (admin only)
// POST — Upsert a county portal config (admin only)
// DELETE — Deactivate a county portal config (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ── GET — list all configs ────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const platform   = searchParams.get('platform') ?? null;
  const countyFips = searchParams.get('countyFips') ?? null;
  const activeOnly = searchParams.get('activeOnly') !== 'false';

  let query = supabaseAdmin
    .from('county_portal_configs')
    .select('*')
    .order('county_name', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);
  if (platform)   query = query.eq('platform', platform);
  if (countyFips) query = query.eq('county_fips', countyFips);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ configs: data ?? [], total: (data ?? []).length });
}, { routeName: 'admin/research/county-config GET' });

// ── POST — upsert a config ────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    countyFips: string;
    countyName: string;
    platform: string;
    config?: Record<string, unknown>;
    notes?: string;
  };

  if (!body.countyFips || !body.countyName || !body.platform) {
    return NextResponse.json(
      { error: 'countyFips, countyName, and platform are required' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('county_portal_configs')
    .upsert(
      {
        county_fips:  body.countyFips,
        county_name:  body.countyName,
        platform:     body.platform,
        config:       body.config ?? {},
        notes:        body.notes ?? null,
        is_active:    true,
        created_by:   session.user.email,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'county_fips,platform' },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data }, { status: 201 });
}, { routeName: 'admin/research/county-config POST' });

// ── DELETE — deactivate a config ──────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const countyFips = searchParams.get('countyFips');
  const platform   = searchParams.get('platform');

  if (!countyFips || !platform) {
    return NextResponse.json(
      { error: 'countyFips and platform query parameters are required' },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from('county_portal_configs')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('county_fips', countyFips)
    .eq('platform', platform);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}, { routeName: 'admin/research/county-config DELETE' });
