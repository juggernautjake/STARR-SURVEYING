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
  type HubLayoutRow,
  dbRowToHubLayout,
  LAYOUT_VERSION,
} from '@/lib/hub/types';
import { validateHubLayoutPutPayload, clampFontScale } from '@/lib/hub/validate-layout';
import { defaultLayoutForPersona } from '@/lib/hub/defaults';
import { inferPersona } from '@/lib/admin/personas';
import type { UserRole } from '@/lib/auth';

const SELECT_COLS =
  'user_email, layout_version, widgets, active_persona, theme, custom_theme, density, font_scale, hub_settings, updated_at';

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('user_hub_layouts')
    .select(SELECT_COLS)
    .eq('user_email', session.user.email)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    // No saved layout. Build a seed layout from the user's inferred
    // persona so first-time users land on a sensible canvas without
    // having to configure anything. The seed is returned WITHOUT
    // persisting — that happens the first time the user saves
    // customizations via PUT, distinguishing "first-time auto-default"
    // from "user explicitly wanted these widgets".
    const roles: UserRole[] = (session.user.roles ??
      (session.user.role ? [session.user.role] : [])) as UserRole[];
    const persona = inferPersona(roles);
    const seed: HubLayoutRow = {
      userEmail: session.user.email,
      layoutVersion: LAYOUT_VERSION,
      widgets: defaultLayoutForPersona(persona),
      activePersona: null,
      theme: 'starr-default',
      customTheme: null,
      density: 'comfortable',
      fontScale: 1.0,
      hubSettings: {},
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ layout: seed, isSeeded: true });
  }

  return NextResponse.json({ layout: dbRowToHubLayout(data as HubLayoutDbRow) });
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
