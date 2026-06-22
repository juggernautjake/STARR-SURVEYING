// app/api/admin/research/self-heal/settings/route.ts
//
// Slice 1 of research-self-heal-slice-1-manual-sweep-2026-06-22.md —
// GET + PUT the singleton row in research_self_heal_settings. Drives
// the dashboard toggle that controls whether the automated layers
// (scheduled cron + AI repair auto-apply) run at all. Defaults are
// all-OFF; the manual sweep button at /admin/research/self-heal works
// regardless of these flags.

import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS =
  'id, autoapply_enabled, autoapply_confidence_threshold, reviewer_confidence_threshold, require_canary_pass, schedule_enabled, manual_sweep_enabled, last_manual_sweep_at, last_manual_sweep_by, notes, updated_at, updated_by';

async function authGate(): Promise<
  | { ok: true; email: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!isAdmin(session.user.roles)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: session.user.email };
}

export const GET = withErrorHandler(async () => {
  const g = await authGate();
  if (!g.ok) return g.res;

  const { data, error } = await supabaseAdmin
    .from('research_self_heal_settings')
    .select(SELECT_COLS)
    .eq('id', 'singleton')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    // Defensive: if the seed hasn't been applied yet, return the
    // hard-coded safe defaults so the dashboard still renders.
    return NextResponse.json({
      settings: {
        id: 'singleton',
        autoapply_enabled: false,
        autoapply_confidence_threshold: 0.9,
        reviewer_confidence_threshold: 0.5,
        require_canary_pass: true,
        schedule_enabled: false,
        manual_sweep_enabled: true,
        last_manual_sweep_at: null,
        last_manual_sweep_by: null,
        notes: null,
        updated_at: null,
        updated_by: null,
      },
      seed_required: true,
    });
  }
  return NextResponse.json({ settings: data, seed_required: false });
}, { routeName: 'admin/research/self-heal/settings.get' });

const ALLOWED_KEYS = new Set([
  'autoapply_enabled',
  'autoapply_confidence_threshold',
  'reviewer_confidence_threshold',
  'require_canary_pass',
  'schedule_enabled',
  'manual_sweep_enabled',
  'notes',
]);

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const g = await authGate();
  if (!g.ok) return g.res;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: g.email,
  };

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const v = body[key];
    if (key.endsWith('_threshold')) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return NextResponse.json(
          { error: `${key} must be a number in [0, 1]` },
          { status: 400 },
        );
      }
      patch[key] = n;
    } else if (key === 'notes') {
      patch[key] = typeof v === 'string' ? v.trim() || null : null;
    } else {
      if (typeof v !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 });
      }
      patch[key] = v;
    }
  }

  // Upsert pattern — first run after the seed lands, the row exists
  // and this is a plain update; if the seed somehow hasn't run, this
  // still works by inserting the singleton.
  const { data, error } = await supabaseAdmin
    .from('research_self_heal_settings')
    .upsert({ id: 'singleton', ...patch }, { onConflict: 'id' })
    .select(SELECT_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}, { routeName: 'admin/research/self-heal/settings.put' });
