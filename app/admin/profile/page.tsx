// app/admin/profile/page.tsx — your profile, theme and density (owner report, 2026-08-04).
//
// ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────────────────────────
//
// *"Whenever I click the settings + profile or the theme + density links, it just takes me to the
// hub. Have we built the settings page and the theme options?"*
//
// They were built. They had no route.
//
// `ProfilePanel.tsx` — 1,100+ lines carrying the profile form, the Hub theme picker, density and
// font scale — has sat in this folder since consolidation Slice 2 deleted `/admin/profile/page.tsx`
// and redirected the URL to `/admin/me?tab=profile`. Slice 189 then retired the Hub's tab bar, so
// the `tab` parameter stopped meaning anything. `LegacyTabNotice` explains where each retired tab
// went — **once**, then remembers the dismissal — after which those two menu entries land on an
// undifferentiated widget canvas and look broken.
//
// Grepped 2026-08-04: the panel's only importers were the UX harness and one helper function. **The
// theme picker the top bar links to was unreachable in the product.**
//
// ── WHY A PAGE AND NOT A WIDGET ─────────────────────────────────────────────────────────────────
//
// The consolidation's rule was right — a person's pay must not render in two places. But "theme,
// density and font scale" is not data that can disagree with itself; it is a settings form, and the
// widget canvas it was folded into is the very thing those settings configure. Editing your Hub's
// appearance from inside the Hub's edit mode is a worse place to put it, not a better one.
//
// So the panel comes back at its own address, the menu points here, and nothing renders twice.

import type { Metadata } from 'next';
import ProfilePanel from './ProfilePanel';

export const metadata: Metadata = {
  title: 'Profile & settings',
};

export default function ProfileSettingsPage() {
  return <ProfilePanel />;
}
