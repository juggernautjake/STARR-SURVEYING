// lib/admin/chrome-bypass.ts
//
// Predicate for routes that should render WITHOUT the regular admin
// chrome (sidebar, IconRail, top bar, floating action menu, etc.).
// Used by `app/admin/components/AdminLayoutClient.tsx` to short-circuit
// its tree on paths that own their own full-bleed chrome.
//
// Today:
//   - `/admin/cad/*`       → the CAD editor draws its own UI (Slice
//                            pre-78, predates this planning doc).
//   - `/admin/work-mode/*` → the Work Mode shell renders WorkModeTopBar
//                            (Slice 156) and nothing else; admins
//                            shouldn't see the regular sidebar fighting
//                            for visual space.
//
// Slice 190 of customizable-hub-and-work-mode-2026-05-28.md.

const BYPASS_PREFIXES: ReadonlyArray<string> = [
  '/admin/cad',
  '/admin/work-mode',
];

/** True when the chrome should NOT render around the route. */
export function shouldBypassAdminChrome(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return BYPASS_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const CHROME_BYPASS_PREFIXES = BYPASS_PREFIXES;
