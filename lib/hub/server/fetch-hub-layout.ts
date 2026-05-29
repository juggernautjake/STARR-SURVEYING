// lib/hub/server/fetch-hub-layout.ts
//
// Server-side helper that reads the saved hub layout for a given
// user — falling back to the persona-default seed when no row exists.
// Used by:
//   - `GET /api/admin/me/hub-layout` (the JSON endpoint)
//   - `/admin/me` server-side page render (so first paint has data)
//
// The seed is returned without persisting; saving happens on the
// first PUT.
//
// Slice 187 of customizable-hub-and-work-mode-2026-05-28.md.

import { supabaseAdmin } from '@/lib/supabase';
import type { UserRole } from '@/lib/auth';
import {
  type HubLayoutDbRow,
  type HubLayoutRow,
  dbRowToHubLayout,
  LAYOUT_VERSION,
} from '@/lib/hub/types';
import { defaultLayoutForPersona } from '@/lib/hub/defaults';
import { inferPersona } from '@/lib/admin/personas';

const SELECT_COLS =
  'user_email, layout_version, widgets, active_persona, theme, custom_theme, density, font_scale, hub_settings, updated_at';

export interface FetchHubLayoutResult {
  layout: HubLayoutRow;
  /** True when no saved row exists and the layout is the persona-default
   *  seed. Lets consumers signal "first-time" UX (e.g., a welcome tip)
   *  vs "user explicitly chose this". */
  isSeeded: boolean;
}

/** Reads the saved layout for `userEmail`. When no row exists, returns
 *  a persona-default seed (built from `inferPersona(roles)`) without
 *  persisting it. */
export async function fetchHubLayoutForUser(
  userEmail: string,
  roles: UserRole[],
): Promise<FetchHubLayoutResult> {
  const { data, error } = await supabaseAdmin
    .from('user_hub_layouts')
    .select(SELECT_COLS)
    .eq('user_email', userEmail)
    .maybeSingle();

  if (error) {
    // Bubble up to the caller — the route turns this into a 500; the
    // page server-component lets Next show the error boundary.
    throw new Error(error.message);
  }

  if (!data) {
    const persona = inferPersona(roles);
    const seed: HubLayoutRow = {
      userEmail,
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
    return { layout: seed, isSeeded: true };
  }

  return { layout: dbRowToHubLayout(data as HubLayoutDbRow), isSeeded: false };
}
