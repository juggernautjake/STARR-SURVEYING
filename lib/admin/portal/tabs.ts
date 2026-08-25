// lib/admin/portal/tabs.ts — what a portal's tab strip is, decided without a router.
//
// C2 of §8 in docs/planning/completed/PAGE_CONSOLIDATION_2026-08-24.md.
//
// *"Extract the shell as `lib/admin/portal/` — tab set, `?tab=` routing, per-role default, per-tab
// gating, per-tab lazy fetch, and the toggle read from §11.6. Everything after this is
// configuration."*
//
// ── EXTRACTED FROM TWO EXAMPLES, NOT ONE ────────────────────────────────────────────────────────
//
// The plan is specific about this and it is the reason this file looks the way it does:
//
//     "Extract it from /admin/billing and /admin/marketing together, not from either alone. They
//      solved the same problem twice, three months apart, and the differences between them are the
//      interesting part … A shell derived from one example would encode that example's accidents."
//
// They agree on more than they disagree on, and everything they agree on is here as a rule rather
// than a convention:
//
//   · an unknown `?tab=` falls back to the default rather than rendering nothing — a mistyped or
//     stale link should land somewhere useful, not on a blank panel;
//   · the default tab omits `?tab=` entirely, so `/admin/billing` is the canonical URL and not
//     `/admin/billing?tab=overview`;
//   · `replace`, never `push` — flicking between four tabs must not bury the page you arrived from
//     under four history entries.
//
// **They disagree about exactly one thing, and it is the whole reason this is not a five-line
// helper.** `/admin/marketing` keeps a date range in the URL beside the tab, and has ONE writer for
// the query string so that changing the tab cannot drop the period and changing the period cannot
// drop the tab — which is precisely what happened when each of its four pages owned its own pair of
// date inputs. `/admin/billing` has no second parameter and needs none.
//
// A shell that owned `?tab=` and nothing else would have re-created marketing's original bug in
// every portal that later grew a second parameter. So `portalHref` takes the OTHER parameters as
// its argument, and preserving them is the caller's declaration rather than the shell's guess.
//
// ── AND WHY THIS FILE HAS NO REACT IN IT ────────────────────────────────────────────────────────
//
// Which tab is showing, which tabs a person may see, and what URL a tab has are three questions with
// exact answers, and they are where the mistakes live. Testing them through a rendered component
// would mean a router, a session and a DOM to assert a string comparison.

import type { UserRole } from '@/lib/auth-roles';
import type { BundleId } from '@/lib/saas/bundles';
import { isDestinationEnabled, type FeatureToggles } from '@/lib/admin/feature-toggles';

export interface PortalTab {
  /** The `?tab=` value. Also half of this tab's feature-toggle key — see `toggleKey`. */
  id: string;
  label: string;
  /** A Lucide icon NAME or component, at the caller's discretion — this module never renders it. */
  icon?: unknown;
  /** One line under the label. Marketing has these; billing does not. */
  hint?: string;
  /**
   * Who may see this tab. Empty or absent means everyone who can reach the portal.
   *
   * This is §5's role axis — *"one portal, several views"* — and it is a FILTER, never a permission.
   * The APIs behind a tab keep every check they have; hiding a tab from somebody who could call its
   * endpoint directly would be the toggle mistake (§11.5) in a second costume.
   */
  roles?: UserRole[];
  /** What the firm must be paying for. A different question from `roles` — see §11.1. */
  requiredBundle?: BundleId;
}

export interface PortalSpec {
  /** The portal's route, e.g. `/admin/billing`. Used for hrefs and for toggle keys. */
  route: string;
  tabs: PortalTab[];
  /**
   * Which tab a person lands on.
   *
   * A function rather than a constant, because §5 asks for a per-ROLE default: a crew member opening
   * the hours portal should land on their own hours and a manager on the approval queue, and that is
   * one portal with two front doors rather than two portals.
   *
   * Returning an id that is gated off for the viewer is not an error — `resolveTab` falls through to
   * the first tab they can see. A default nobody can open would otherwise make the portal render
   * empty for exactly the people it was defaulted for.
   */
  defaultTab: string | ((roles: readonly string[]) => string);
}

export interface Viewer {
  roles: readonly string[];
  isCompanyUser?: boolean;
  bundles?: readonly string[];
}

/** This tab's feature-toggle key — `/admin/pay#rewards`. One spelling, shared with §11. */
export function tabToggleKey(route: string, tabId: string): string {
  return `${route}#${tabId}`;
}

/**
 * May this viewer see this tab?
 *
 * Three independent questions, asked separately and in this order, because they have three different
 * remedies and collapsing them makes *"why is this tab missing"* unanswerable:
 *
 *     the firm switched it off   →  turn it back on in Settings
 *     the firm has no bundle     →  buy the bundle
 *     you do not have the role   →  ask an admin
 */
export function canSeeTab(
  spec: PortalSpec,
  tab: PortalTab,
  viewer: Viewer,
  toggles?: FeatureToggles | null,
): boolean {
  if (!isDestinationEnabled(toggles, spec.route, tab.id)) return false;
  if (tab.requiredBundle && !(viewer.bundles ?? []).includes(tab.requiredBundle)) return false;
  if (!tab.roles?.length) return true;
  // An admin sees every tab of a portal they can reach. Same rule as `accessibleRoutes`, and worth
  // stating rather than inheriting: a portal whose approval tab was invisible to admins would be a
  // portal nobody could administer.
  if (viewer.roles.includes('admin')) return true;
  return tab.roles.some((needed) => viewer.roles.includes(needed));
}

/** The tabs this viewer actually gets, in the order the spec declares them. */
export function visibleTabs(
  spec: PortalSpec,
  viewer: Viewer,
  toggles?: FeatureToggles | null,
): PortalTab[] {
  return spec.tabs.filter((t) => canSeeTab(spec, t, viewer, toggles));
}

/** The id this viewer lands on when the URL says nothing. */
export function defaultTabFor(spec: PortalSpec, viewer: Viewer): string {
  return typeof spec.defaultTab === 'function' ? spec.defaultTab(viewer.roles) : spec.defaultTab;
}

/**
 * Which tab is showing, given a `?tab=` value.
 *
 * ── EVERY FALLBACK HERE IS A REAL CASE ──────────────────────────────────────────────────────────
 *
 *   · an unknown id — a mistyped link, or a bookmark from before a tab was renamed;
 *   · an id that EXISTS and is gated off for this viewer — a link somebody sent from an account with
 *     more access, which is the normal way this happens rather than an edge case;
 *   · a default that is itself gated off — a per-role default pointed at a tab this person cannot
 *     see, which would render the portal empty for exactly the people it was defaulted for.
 *
 * The last fallback is the first VISIBLE tab. `null` only when a viewer can see no tab at all, which
 * is a real state — every tab switched off, or a portal whose tabs are all role-gated away — and the
 * caller has to say something rather than render a strip with nothing in it.
 */
export function resolveTab(
  spec: PortalSpec,
  raw: string | null | undefined,
  viewer: Viewer,
  toggles?: FeatureToggles | null,
): string | null {
  const visible = visibleTabs(spec, viewer, toggles);
  if (!visible.length) return null;
  if (raw && visible.some((t) => t.id === raw)) return raw;
  const preferred = defaultTabFor(spec, viewer);
  if (visible.some((t) => t.id === preferred)) return preferred;
  return visible[0].id;
}

/**
 * The URL for a tab, preserving whatever else the caller keeps in the query string.
 *
 * ── THE ONE THING THE TWO EXAMPLES DISAGREED ABOUT ──────────────────────────────────────────────
 *
 * `others` is marketing's date range, and billing passes nothing. A shell that owned `?tab=` alone
 * would have silently dropped the period on every tab change — which is the exact bug marketing was
 * consolidated to fix, re-created inside the thing extracted from it.
 *
 * `?tab=` is omitted for the default so `/admin/billing` stays the canonical URL. Both examples do
 * this and both are right: a portal whose front door is `?tab=overview` has two URLs for one page,
 * and the one people paste is the ugly one.
 */
export function portalHref(
  spec: PortalSpec,
  tabId: string,
  viewer: Viewer,
  others: Record<string, string> = {},
): string {
  const q = new URLSearchParams();
  if (tabId !== defaultTabFor(spec, viewer)) q.set('tab', tabId);
  for (const [k, v] of Object.entries(others)) {
    // An empty value is dropped rather than written as `&preset=`. A trailing empty parameter is
    // the kind of thing that survives a copy-paste and then fails to parse on the way back in.
    if (v !== '' && v != null) q.set(k, v);
  }
  const qs = q.toString();
  return `${spec.route}${qs ? `?${qs}` : ''}`;
}
