// lib/admin/legacy-redirects.ts
//
// consolidation Slice 2 (2026-05-30) — the redirect table the
// middleware applies for the legacy `my-*` + `/admin/profile` URLs.
// Extracted from middleware.ts so the spec can import the constant
// without dragging in next-auth's `next/server` runtime dependency
// (vitest runs in node + can't resolve next/server in a worker).

// ── FOUR OF THESE WERE REMOVED 2026-08-04 ───────────────────────────────────────────────────────
//
// Owner: *"whenever I click 'My Hours' in the nav menu, it takes me to the hub. It almost seems like
// every nav menu link routes back to the hub. It seems like routing is broken."*
//
// Routing was fine. The nav registry pointed five entries at `/admin/me?tab=…` — the Hub — and the
// `tab` parameter has meant nothing since Slice 189 retired the Hub's tab bar. Every one of those
// menu items landed on the same undifferentiated page, which is indistinguishable from a broken
// router and was reported as one.
//
// `MyHoursPanel`, `MyPayPanel` and `MyNotesPanel` were never deleted — only their `page.tsx` files
// were, in the same consolidation that removed `/admin/profile`. Each is a complete component that
// takes no props and was reachable from nothing but the UX harness. They have their routes back, so
// these paths are real pages again and must NOT be redirected.
//
// `/admin/my-jobs` points at `/admin/assignments`, which already exists and is already registered.
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/admin/my-jobs':  '/admin/assignments',

  // `/admin/profile` was here until 2026-08-04 and is deliberately NOT any more.
  //
  // Owner report: *"whenever I click the settings + profile or the theme + density links, it just
  // takes me to the hub."* This entry was the mechanism. The panel it redirected away from —
  // profile form, Hub theme picker, density, font scale — still exists in full; what it lost was
  // its route, and this line then sent every visitor to a widget canvas that answers a different
  // question. `?tab=profile` stopped meaning anything when Slice 189 retired the Hub's tab bar,
  // so the redirect had been landing nowhere useful for two months.
  //
  // The other four entries stay: their content genuinely became widgets, and `LegacyTabNotice`
  // says which. Appearance settings did not become a widget — they configure the widget canvas,
  // which makes "edit it from inside the thing it styles" the worse home, not the better one.

  // Platform audit §2.1 / Phase 1 item 6 (2026-08-01) — "four competing home concepts", of which
  // two claimed to be THE home. `/admin/dashboard` was a 474-line hardcoded tile page; `/admin/me`
  // is the customisable hub with saved layouts. A new employee had no way to tell which was the app.
  //
  // Nothing was folded in, because there was nothing left to fold: every figure the dashboard
  // computed — lessons, quiz scores, flashcards due, activity, pending approvals, active jobs, hours
  // this week, upcoming events, PTO — already exists as a hub widget, each one configurable and
  // removable in a way the hardcoded tile never was. Deleting the page loses no capability.
  //
  // A redirect rather than a deletion because notification rows in the database still carry
  // `/admin/dashboard` links, and those outlive any deploy.
  '/admin/dashboard': '/admin/me',
};
