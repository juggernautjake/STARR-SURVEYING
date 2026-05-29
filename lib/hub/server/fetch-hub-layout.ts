// lib/hub/server/fetch-hub-layout.ts
//
// Server-side helper that reads the saved hub layout for a given
// user — falling back to the persona-default seed when no row exists
// or when the query fails. Used by:
//   - `GET /api/admin/me/hub-layout` (the JSON endpoint)
//   - `/admin/me` server-side page render (so first paint has data)
//
// The seed is returned without persisting; saving happens on the
// first PUT.
//
// Slice 187 of customizable-hub-and-work-mode-2026-05-28.md.
// Slice 195 — crash-proofed so the page never throws + always renders
// at least the persona-default seed even if the DB query fails.

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
  /** True only when we fell back to the seed because the DB query
   *  failed (rather than because no row was found). Lets the page
   *  surface a "your hub couldn't be loaded — showing defaults"
   *  hint without conflating with first-time UX. */
  fellBackOnError?: boolean;
  /** When `fellBackOnError`, the message that caused the fallback so
   *  observability can record it. Never surfaced to the user. */
  errorMessage?: string;
}

/** Build a persona-default seed without touching the database. */
function buildSeed(userEmail: string, roles: UserRole[]): HubLayoutRow {
  const persona = inferPersona(roles);
  return {
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
}

/** Reads the saved layout for `userEmail`. When no row exists or the
 *  query fails, returns a persona-default seed (built from
 *  `inferPersona(roles)`) without persisting it. **Never throws.**
 *  The hub canvas must always render something — a transient DB
 *  failure shouldn't break the user's landing page. */
export async function fetchHubLayoutForUser(
  userEmail: string,
  roles: UserRole[],
): Promise<FetchHubLayoutResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_hub_layouts')
      .select(SELECT_COLS)
      .eq('user_email', userEmail)
      .maybeSingle();

    if (error) {
      // Soft-fail: render the seed instead of crashing the page.
      // The underlying error is logged so observability still catches
      // it (e.g., the `user_hub_layouts` table not being migrated on
      // this environment).
      console.error('[fetchHubLayoutForUser] Supabase query failed:', error.message);
      return {
        layout: buildSeed(userEmail, roles),
        isSeeded: true,
        fellBackOnError: true,
        errorMessage: error.message,
      };
    }

    if (!data) {
      return { layout: buildSeed(userEmail, roles), isSeeded: true };
    }

    return { layout: dbRowToHubLayout(data as HubLayoutDbRow), isSeeded: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[fetchHubLayoutForUser] Unexpected failure:', message);
    return {
      layout: buildSeed(userEmail, roles),
      isSeeded: true,
      fellBackOnError: true,
      errorMessage: message,
    };
  }
}
