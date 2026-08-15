// lib/hub/custom-quick-actions.ts
//
// User-authored Quick Actions. The catalog in `quick-actions-catalog.ts` is a fixed set of eight
// shortcuts chosen by us; this module lets the person whose hub it is add their own — a label, a
// destination, an icon and a tint — and have it render as a tile beside the built-ins.
//
// Owner, 2026-08-14: *"for the quick actions, we need to be able to add links that when clicked
// takes us to that page. Please make it so that we can fully customize the actions and links."*
//
// ── WHY THIS IS A SEPARATE, PURE MODULE ─────────────────────────────────────────────────────────
//
// The widget's saved settings are persisted as an opaque `content` blob (see
// `normalize-customization.ts`, which copies `content` through untouched by design). Anything that
// round-trips through storage and comes back as `unknown` needs a sanitizer at the boundary, and a
// sanitizer that lives inside a React component cannot be tested without rendering one. Everything
// here is a plain function over plain data.
//
// ── THE HREF RULE IS A SECURITY RULE, NOT A TIDINESS ONE ────────────────────────────────────────
//
// A custom action's destination is user input that is later handed to an anchor's `href`. A saved
// `javascript:…` value would execute on click, in the victim's session, for anyone the hub is
// shared or restored to. `safeHref` is an allow-list — internal paths, http(s), mailto and tel —
// and everything else becomes `null`, which the resolver drops. Protocol-relative `//host` is
// rejected explicitly: it starts with `/` and would otherwise read as internal while navigating
// off-site.

import type { QuickActionDef } from './quick-actions-catalog';

/** Prefix that marks an id as user-authored. Keeps custom ids from ever colliding with a catalog
 *  id, and lets the widget tell the two apart without a lookup. */
export const CUSTOM_ACTION_PREFIX = 'custom:';

export interface CustomQuickAction {
  /** Always `custom:<slug>`. Stable once created — the ordered id list refers to it. */
  id: string;
  label: string;
  /** Internal path (`/admin/…`), or an absolute http(s)/mailto/tel URL. */
  href: string;
  /** A glyph rendered verbatim on the tile (emoji or a character or two). */
  icon: string;
  tint: NonNullable<QuickActionDef['tint']>;
  /** Optional tooltip / helper text. */
  description?: string;
}

export const CUSTOM_ACTION_TINTS: ReadonlyArray<NonNullable<QuickActionDef['tint']>> = [
  'accent', 'success', 'warning', 'info', 'danger',
];

/** Glyphs offered as one-click choices in the settings form. Free text is still accepted — this is
 *  a shortcut, not a whitelist. */
export const CUSTOM_ACTION_ICON_CHOICES: ReadonlyArray<string> = [
  '⚡', '🔗', '📁', '📋', '🧾', '📊', '🗓', '📍', '🚚', '🛠', '💬', '💰', '📷', '⭐', '🏠', '🔍',
];

export const CUSTOM_ACTION_LABEL_MAX = 40;
export const CUSTOM_ACTION_DESCRIPTION_MAX = 120;
const DEFAULT_ICON = '⚡';

/**
 * The allow-list. Returns the cleaned href, or null when it is not something we will put in an
 * anchor. See the security note at the top of the file.
 */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const href = raw.trim();
  if (!href) return null;
  // Protocol-relative (`//evil.example`) passes a naive "starts with /" test while navigating
  // off-site, so it is rejected before the internal-path branch.
  if (href.startsWith('//')) return null;
  if (href.startsWith('/')) return href;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href)?.[1]?.toLowerCase();
  if (!scheme) return null; // bare `example.com` — ambiguous, and resolves as a relative path
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') return href;
  return null;
}

/** True when the destination leaves the app, so the widget can open it in a new tab with
 *  `rel="noopener"` instead of routing through next/link (which cannot handle it). */
export function isExternalHref(href: string): boolean {
  return !href.startsWith('/');
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * A stable, readable, collision-free id for a new custom action.
 *
 * Deliberately derived from the label rather than random: ids appear in the saved layout, and a
 * `custom:new-truck-checklist` is something a person can recognise in a debug dump where a uuid is
 * noise. A numeric suffix disambiguates duplicates.
 */
export function nextCustomActionId(existingIds: ReadonlyArray<string>, label: string): string {
  const base = slugify(label) || 'link';
  const taken = new Set(existingIds);
  let candidate = `${CUSTOM_ACTION_PREFIX}${base}`;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${CUSTOM_ACTION_PREFIX}${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export function isCustomActionId(id: string): boolean {
  return id.startsWith(CUSTOM_ACTION_PREFIX);
}

/**
 * Coerce one stored entry into a `CustomQuickAction`, or null when it cannot be salvaged.
 *
 * Lenient on everything cosmetic (a missing icon becomes the default, an unknown tint becomes
 * `accent`) and strict on the two fields without which the tile would be a lie: a label and a
 * destination we are willing to navigate to.
 */
export function sanitizeCustomAction(raw: unknown): CustomQuickAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && isCustomActionId(r.id) ? r.id : null;
  if (!id) return null;

  const label = typeof r.label === 'string' ? r.label.trim().slice(0, CUSTOM_ACTION_LABEL_MAX) : '';
  if (!label) return null;

  const href = safeHref(r.href);
  if (!href) return null;

  const iconRaw = typeof r.icon === 'string' ? r.icon.trim() : '';
  // Emoji are multi-code-unit; slicing by code point keeps a flag or a ZWJ sequence intact where a
  // `.slice(0, 2)` on the raw string would cut one in half and render a replacement box.
  const icon = iconRaw ? [...iconRaw].slice(0, 2).join('') : DEFAULT_ICON;

  const tint = CUSTOM_ACTION_TINTS.includes(r.tint as never)
    ? (r.tint as CustomQuickAction['tint'])
    : 'accent';

  const description = typeof r.description === 'string'
    ? r.description.trim().slice(0, CUSTOM_ACTION_DESCRIPTION_MAX)
    : '';

  return { id, label, href, icon, tint, ...(description ? { description } : {}) };
}

/** Sanitize a whole stored list, dropping unsalvageable entries and duplicate ids. */
export function normalizeCustomActions(raw: unknown): CustomQuickAction[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomQuickAction[] = [];
  for (const entry of raw) {
    const action = sanitizeCustomAction(entry);
    if (!action || seen.has(action.id)) continue;
    seen.add(action.id);
    out.push(action);
  }
  return out;
}

/** Present a custom action to the widget in the same shape the catalog uses, so the renderer has
 *  exactly one kind of thing to draw. */
export function toQuickActionDef(action: CustomQuickAction): QuickActionDef {
  return {
    id: action.id,
    label: action.label,
    description: action.description || `Opens ${action.href}`,
    iconName: '',
    glyph: action.icon,
    kind: 'link',
    href: action.href,
    allowedRoles: [],
    tint: action.tint,
  };
}
