// app/api/admin/me/hub-layout/route.ts
//
// Hub layout API. Per-user only — no admin "view another user's layout"
// path because layouts are personal preferences, not org data.
//
// GET   /api/admin/me/hub-layout    → HubLayoutRow | null (null when no row)
// PUT   /api/admin/me/hub-layout    → upsert full row, returns the saved row
// (POST reset lives at /reset/route.ts)
//
// Slice 79 of customizable-hub-and-work-mode-2026-05-28.md.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  type HubLayoutPutPayload,
  type HubLayoutDbRow,
  dbRowToHubLayout,
  LAYOUT_VERSION,
} from '@/lib/hub/types';
import { validateHubLayoutPutPayload, clampFontScale } from '@/lib/hub/validate-layout';
import { fetchHubLayoutForUser } from '@/lib/hub/server/fetch-hub-layout';
import type { UserRole } from '@/lib/auth';

const SELECT_COLS =
  'user_email, layout_version, widgets, active_persona, theme, custom_theme, density, font_scale, hub_settings, updated_at';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles: UserRole[] = (session.user.roles ??
    (session.user.role ? [session.user.role] : [])) as UserRole[];

  try {
    const { layout, isSeeded } = await fetchHubLayoutForUser(session.user.email, roles);
    return isSeeded
      ? NextResponse.json({ layout, isSeeded: true })
      : NextResponse.json({ layout });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Layout fetch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, { routeName: 'admin/me/hub-layout/GET' });

export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: HubLayoutPutPayload;
  try {
    payload = (await req.json()) as HubLayoutPutPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validationError = validateHubLayoutPutPayload(payload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Upsert. PG handles the conflict on user_email PK; trigger auto-bumps
  // updated_at.
  const { data, error } = await supabaseAdmin
    .from('user_hub_layouts')
    .upsert(
      {
        user_email: session.user.email,
        layout_version: LAYOUT_VERSION,
        widgets: payload.widgets,
        active_persona: payload.activePersona ?? null,
        theme: payload.theme ?? 'starr-default',
        custom_theme: payload.customTheme ?? null,
        density: payload.density ?? 'comfortable',
        font_scale: clampFontScale(payload.fontScale ?? 1.0),
        hub_settings: payload.hubSettings ?? {},
      },
      { onConflict: 'user_email' },
    )
    .select(SELECT_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ layout: dbRowToHubLayout(data as HubLayoutDbRow) });
}, { routeName: 'admin/me/hub-layout/PUT' });
