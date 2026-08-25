// lib/admin/feature-toggles.ts — which pages this firm actually uses.
//
// T1 of §11 in docs/planning/in-progress/PAGE_CONSOLIDATION_2026-08-24.md.
//
// Owner: *"I want it so that we can have full control in the settings as to what all pages are
// visible and what pages are not… Maybe we don't want to use a page or feature right now, so we
// would toggle it off so that navigating the webpage is easier, but if we decide to use that
// page/feature in the future, then we can turn it back on and make sure it is hooked up correctly."*
//
// ── THIS IS A FOURTH QUESTION, NOT A FOURTH COPY OF AN EXISTING ONE ─────────────────────────────
//
// Three gates already decide whether somebody sees a route, and this must not become another
// spelling of any of them. They answer genuinely different questions:
//
//     roles           route-registry + middleware   MAY you?
//     requiredBundle  lib/saas/bundle-gate          did the FIRM PAY for it?
//     internalOnly    registry flags                is this for STAFF?
//     enabled         here                          does this firm USE it at all?
//
// A page can be one you may see, that the firm pays for, meant for staff — and that this firm has
// simply decided not to run yet. None of the other three can say that, which is why this is a new
// switch and not a new role or a new bundle.
//
// ── AND THE THING IT MUST NEVER BECOME ──────────────────────────────────────────────────────────
//
// **A toggle is not a permission.** It is a visibility control, and the moment anybody believes
// otherwise it is a security hole with a friendly name: *"we turned payroll off, so the crew cannot
// see wages"* is false the second somebody types the URL, and that is exactly the kind of false
// belief that survives unexamined for a year.
//
// So this is read by NAV and by a redirect, never as the reason a request is refused. Every API
// keeps every check it has. `__tests__` asserts that turning a page off changes no API's answer —
// §11.5 asks for that test by name, and it is the one that keeps this file honest.
//
// ── WHY THIS FILE HAS NO IMPORTS ────────────────────────────────────────────────────────────────
//
// It is read by the sidebar, the rail, the command palette and the search — all client components —
// and by server code doing the redirect. Anything server-only in here would drag `node:async_hooks`
// into the browser bundle through thirty components, which is the failure `lib/auth-roles.ts` was
// split out to prevent and which broke the production build for two commits.

/** The `app_settings` row this lives in. One row, org-scoped, alongside `general` and `company`. */
export const TOGGLES_KEY = 'feature_toggles';

/**
 * A stored toggle map: destination → whether the firm uses it.
 *
 * Only `false` is ever meaningful. `true` is stored when somebody switches a page back on, and it
 * reads identically to the key being absent — see `isEnabled`.
 */
export type FeatureToggles = Record<string, boolean>;

/**
 * A toggle key: a route, or a route and one of its tabs.
 *
 * ── WHY TABS ARE KEYS TOO ───────────────────────────────────────────────────────────────────────
 *
 * §11.3: after consolidation, most of what somebody wants to switch off is no longer a route — it is
 * a tab. *"We do not do pass-through billing"* should turn off the `rebilled` tab of the receipts
 * portal, not a URL that has stopped existing. So the unit is a nav DESTINATION, and a destination
 * can be either.
 *
 * `#` rather than `?tab=`: a key is an identity, not a URL. Writing it as a query string invites
 * somebody to build one by string-concatenating a href, and then a trailing `&sort=name` from a
 * bookmarked link would produce a key that matches nothing.
 */
export function toggleKey(route: string, stateKey?: string): string {
  return stateKey ? `${route}#${stateKey}` : route;
}

/** The two halves of a key back out. `stateKey` is `''` for a plain route. */
export function parseToggleKey(key: string): { route: string; stateKey: string } {
  const hash = key.indexOf('#');
  return hash === -1
    ? { route: key, stateKey: '' }
    : { route: key.slice(0, hash), stateKey: key.slice(hash + 1) };
}

/**
 * Does this firm use this destination?
 *
 * ── ABSENT MEANS ON, AND THAT IS THE LOAD-BEARING DECISION ──────────────────────────────────────
 *
 * Not "absent means off", and not an exhaustive list written at install time. Two reasons, and both
 * are about the failure mode rather than about taste:
 *
 *   · A toggle system that ships with anything off is one that broke something on day one, and the
 *     person who finds out is a user who cannot reach a page that worked yesterday.
 *   · A page added next year must appear WITHOUT anybody remembering to enable it. An exhaustive
 *     list is a second inventory of the product, and the second inventory is always the stale one —
 *     this codebase has the route registry and `pages.generated.json` and has already been bitten
 *     by them disagreeing.
 *
 * So the stored map is a list of EXCEPTIONS. An empty map is a fully-working product, which is also
 * exactly what a failed read should look like: see `togglesFrom`.
 */
export function isEnabled(toggles: FeatureToggles | null | undefined, key: string): boolean {
  return toggles?.[key] !== false;
}

/**
 * Is this destination available, given its route may be off too?
 *
 * A tab of a switched-off portal is switched off. Asking only about the tab's own key would leave
 * every tab of a disabled portal reading as enabled — true in the stored data and useless as an
 * answer, because nobody can reach any of them.
 */
export function isDestinationEnabled(
  toggles: FeatureToggles | null | undefined,
  route: string,
  stateKey?: string,
): boolean {
  if (!isEnabled(toggles, route)) return false;
  return !stateKey || isEnabled(toggles, toggleKey(route, stateKey));
}

/**
 * Read a toggle map out of whatever `/api/admin/settings` returned.
 *
 * Every failure — no settings, no row, a row holding a string, a row holding an array — answers with
 * an empty map, which means "everything is on". A malformed row must not switch the product off:
 * the whole point of "absent means on" is that the broken state is the harmless one, and a parse
 * that threw here would take out the sidebar of every page that reads it.
 *
 * Non-boolean values are dropped rather than coerced. `"false"` the string is truthy in JavaScript
 * and would silently mean ON, which is the reverse of what whoever wrote it intended — and a toggle
 * that does the opposite of what the stored data says is worse than one that ignores it.
 */
export function togglesFrom(settings: unknown): FeatureToggles {
  if (!settings || typeof settings !== 'object') return {};
  const raw = (settings as Record<string, unknown>)[TOGGLES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: FeatureToggles = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' && key.startsWith('/')) out[key] = value;
  }
  return out;
}

/**
 * Everything currently switched off, sorted, for a settings screen and for a test to count.
 *
 * Derived rather than stored: a stored count is a second copy of the same fact and would be wrong
 * the first time somebody edited the map by hand.
 */
export function disabledKeys(toggles: FeatureToggles | null | undefined): string[] {
  return Object.entries(toggles ?? {})
    .filter(([, on]) => on === false)
    .map(([key]) => key)
    .sort();
}

/**
 * The map after a switch is flipped.
 *
 * Switching something ON deletes its key rather than storing `true`. The stored map is a list of
 * exceptions, and a map that accumulated `true` for everything ever toggled would slowly become the
 * exhaustive inventory this design exists to avoid — including entries for routes that no longer
 * exist, which nothing would ever clean up.
 */
export function withToggle(
  toggles: FeatureToggles | null | undefined,
  key: string,
  enabled: boolean,
): FeatureToggles {
  const next = { ...(toggles ?? {}) };
  if (enabled) delete next[key];
  else next[key] = false;
  return next;
}
