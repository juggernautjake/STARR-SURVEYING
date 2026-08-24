// lib/design/portal-themes.ts — designer themes that people can actually choose.
//
// Phase T3 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Owner: *"the different themes that we linked to the page will become an option in the settings
// for the user while that page is set as active."*
//
// ── THE RULE, AND WHY IT IS THE RULE ────────────────────────────────────────────────────────────
//
// A theme built in the Page Designer is offered in portal settings when it belongs to a THEME
// FAMILY whose layout is the design of record for its page. Three conditions, each doing work:
//
//   · **A family**, because a one-off theme somebody tried on a draft is not a decision. Joining a
//     family is the gesture that says "this is a skin of that layout" — and it is made explicitly,
//     at clone time or by linking, so it cannot be inferred wrongly from the contents.
//   · **Whose layout is active**, because the request ties the two together: the themes of a page
//     are offered *while that page is set as active*. A family attached to nothing is a colour
//     experiment, and an experiment in the settings list is how a portal ends up with forty themes
//     nobody can tell apart.
//   · **Carrying tokens**, because a theme with no token map changes nothing, and an option that
//     does nothing is worse than a missing one.
//
// ── AND WHY DEDUPLICATION IS BY TOKEN MAP ───────────────────────────────────────────────────────
//
// The same theme applied to five pages in one site version is one choice, not five. Offering it
// five times would be the settings screen reporting the internals of the design system to somebody
// who just wants a darker sidebar.

import { supabaseAdmin } from '@/lib/supabase';
import type { DesignTheme } from './document';

export interface SelectableDesignerTheme {
  /** `design:<id>` — namespaced so it can never collide with a built-in theme id. */
  id: string;
  name: string;
  tokens: Record<string, string>;
  /** Where it comes from, so the picker can say why this is on offer. */
  fromRoute: string | null;
  fromDesign: { id: string; name: string; status: string };
}

const TABLE = 'design_mockups';

export async function selectableDesignerThemes(): Promise<SelectableDesignerTheme[]> {
  // The active designs that belong to a theme family — the families that are "in force".
  const { data: actives, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, route, theme_group')
    .eq('status', 'active')
    .not('theme_group', 'is', null)
    .is('deleted_at', null);
  if (error) throw new Error(error.message);

  const groups = [...new Set(((actives ?? []) as Array<{ theme_group: string }>).map((a) => a.theme_group))];
  if (!groups.length) return [];

  const { data: members, error: memberError } = await supabaseAdmin
    .from(TABLE)
    .select('id, name, route, status, theme, theme_group')
    .in('theme_group', groups)
    .is('deleted_at', null);
  if (memberError) throw new Error(memberError.message);

  const out: SelectableDesignerTheme[] = [];
  const seen = new Set<string>();

  for (const row of (members ?? []) as Array<Record<string, unknown>>) {
    const theme = row.theme as DesignTheme | null;
    if (!theme?.tokens || Object.keys(theme.tokens).length === 0) continue;

    // Same colours, offered once. The key is the token map itself rather than the theme id,
    // because the same library theme copied into five designs has five different embedded copies
    // and one appearance.
    const fingerprint = JSON.stringify(
      Object.entries(theme.tokens).filter(([, v]) => !!v).sort(([a], [b]) => a.localeCompare(b)),
    );
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    out.push({
      id: `design:${theme.id}`,
      name: theme.name || 'Untitled theme',
      tokens: theme.tokens,
      fromRoute: (row.route as string | null) ?? null,
      fromDesign: {
        id: row.id as string,
        name: row.name as string,
        status: (row.status as string) ?? 'draft',
      },
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The fourteen palette colours a designer theme carries, with sensible stand-ins.
 *
 * A designer theme sets only the tokens it cares about — that is the whole point of the token map
 * being sparse. The portal needs all fourteen, so the gaps are filled from the tokens that ARE set
 * rather than from a fixed default: a dark theme that never named a border colour should get a
 * border derived from its own surface, not a light grey that only works on white.
 */
export function paletteFromTokens(tokens: Record<string, string>): Record<string, string> {
  const t = (name: string, fallback: string) => tokens[name] || fallback;
  const bgPage = t('--theme-bg-page', t('--color-bg-app', '#F8FAFC'));
  const bgSurface = t('--theme-bg-surface', t('--color-bg-card', '#FFFFFF'));
  const fgPrimary = t('--theme-fg-primary', t('--color-text-primary', '#0F172A'));
  const accent = t('--theme-accent', t('--color-brand-navy', '#1D3095'));
  return {
    bgPage,
    bgSurface,
    bgElevated: t('--theme-bg-elevated', t('--color-bg-subtle', bgSurface)),
    fgPrimary,
    fgSecondary: t('--theme-fg-secondary', t('--color-text-secondary', fgPrimary)),
    fgMuted: t('--theme-fg-muted', t('--color-text-muted', fgPrimary)),
    accent,
    // White on a light theme's accent is right and on a dark theme's lightened accent is wrong —
    // which is why themes.css publishes `--theme-accent-fg` separately. Falling back to white is
    // still the least-bad guess when a designer theme never set it.
    accentFg: t('--theme-accent-fg', '#FFFFFF'),
    border: t('--theme-border', t('--color-border', bgSurface)),
    borderStrong: t('--theme-border-strong', t('--color-border-strong', t('--theme-border', bgSurface))),
    success: t('--theme-success', t('--color-success', '#10B981')),
    warning: t('--theme-warning', '#F59E0B'),
    danger: t('--theme-danger', t('--color-error', '#EF4444')),
    info: t('--theme-info', '#3B82F6'),
  };
}
