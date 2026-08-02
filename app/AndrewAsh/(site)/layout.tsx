// app/AndrewAsh/(site)/layout.tsx — the public site's header and footer.
//
// ── WHY A ROUTE GROUP ───────────────────────────────────────────────────────────────────────────
//
// `(site)` is a route group: the parentheses mean it organises files WITHOUT appearing in any URL.
// `/AndrewAsh/(site)/about/page.tsx` still serves `/AndrewAsh/about`. What it buys is a layout that
// applies to exactly these pages and not to the studio.
//
// The first attempt did this with a client component that read `usePathname` and returned bare
// children for studio routes. It rendered correctly on the server and then failed to hydrate on every
// page of the site:
//
//     TypeError: Cannot read properties of undefined (reading 'call')
//       at options.factory (webpack.js) → at Lazy → at div → at VoiceLayout (Server)
//
// Bisecting confirmed the wrapper was the cause. The App Router has a first-class answer to "this
// layout applies to some children and not others" and it is this file — a structural boundary
// resolved at build time, with no client component in the tree, no pathname string to keep in sync,
// and no way for the studio to accidentally inherit a "Request a quote" button above Andrew's
// invoices.
//
// The parent layout keeps what genuinely applies to BOTH halves: the theme root, the CSS variables,
// the skip link, the scroll-reveal behaviour and the service worker registration.
//
// The login page deliberately sits OUTSIDE this group too. It is a bare page: a marketing header over
// a password field invites the visitor to wander off, and it is the one screen where the only useful
// action is the form.

import type { ReactNode } from 'react';

import VoiceHeader from '../_ui/VoiceHeader';
import VoiceFooter from '../_ui/VoiceFooter';
import { getSiteSettings } from '@/lib/voice/settings';

export default async function PublicSiteLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  const settings = await getSiteSettings();

  return (
    <>
      <VoiceHeader artistName={settings.artistName} tagline={settings.tagline} navItems={settings.navItems} />
      <main id="va-main" style={{ display: 'flex', flexDirection: 'column', minHeight: '60vh' }}>
        {children}
      </main>
      <VoiceFooter settings={settings} />
    </>
  );
}
