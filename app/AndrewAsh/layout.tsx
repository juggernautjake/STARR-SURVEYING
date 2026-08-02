// app/AndrewAsh/layout.tsx — the root of Andrew Ash's site.
//
// This is a separate business living at a path on someone else's domain, temporarily. Everything
// about this layout is written on the assumption that it moves: it does not import a single Starr
// component, it declares its own metadata and its own manifest, and its only dependencies on the
// host repo are `@/lib/supabase` and `@/lib/voice/*`. Lifting it out is copying two directories, a
// stylesheet and two seed files.
//
// ── noindex, FOR NOW ────────────────────────────────────────────────────────────────────────────
//
// The site is being built for review before Andrew has replaced the example content. A live portfolio
// indexed with placeholder testimonials on it is worse than no portfolio, and worse still is Google
// learning the canonical URL for "Andrew Ash voice actor" is a subdirectory of a surveying company's
// domain — that association outlives the move. `VOICE_SITE_INDEXABLE=1` flips it when the site has
// its own domain and real content.

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './_ui/voice.css';
import RevealOnScroll from './_ui/RevealOnScroll';
import RegisterVoicePWA from './_ui/RegisterVoicePWA';
import { getSiteSettings } from '@/lib/voice/settings';
import { themeCssVars } from '@/lib/voice/theme';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const indexable = process.env.VOICE_SITE_INDEXABLE === '1';

  return {
    title: {
      default: settings.metaTitle,
      template: `%s | ${settings.artistName}`,
    },
    description: settings.metaDescription,
    applicationName: settings.artistName,
    manifest: '/AndrewAsh/manifest.webmanifest',
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
    openGraph: {
      type: 'profile',
      title: settings.metaTitle,
      description: settings.metaDescription,
      siteName: settings.artistName,
      ...(settings.ogImageUrl ? { images: [{ url: settings.ogImageUrl }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: settings.metaTitle,
      description: settings.metaDescription,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const settings = await getSiteSettings();
  return {
    width: 'device-width',
    initialScale: 1,
    // Matches the page background so the phone's status bar and the address bar blend into the site
    // rather than framing it in white.
    themeColor: settings.theme.ink,
  };
}

export default async function VoiceLayout({ children }: { children: ReactNode }): Promise<React.ReactElement> {
  // Read here for the THEME only — the header and footer moved to the (site) route group.
  const settings = await getSiteSettings();

  // The theme is injected as inline custom properties on the root element, computed on the server.
  // Doing it server-side is what prevents the flash of default palette that a client-side theme
  // applier always produces — the first paint is already correct.
  const style = themeCssVars(settings.theme) as React.CSSProperties;

  return (
    <div className="vaRoot" style={style} data-theme={settings.themePreset}>
      {/* Keyboard users land here first. The site is a long single-column scroll on every page, so
          skipping the nav is the difference between three tabs and thirty. */}
      <a className="vaSkipLink" href="#va-main">
        Skip to content
      </a>

      {/* No header or footer here. The public pages get theirs from `(site)/layout.tsx`, a route
          group; the studio and the login page deliberately have none. This layout owns only what
          applies to BOTH halves — the theme, the skip link, the scroll reveal, the service worker.

          An earlier version did this with a client wrapper that read the pathname. It broke
          hydration on every page: a Client Component cannot import a Server Component, and the
          bundler emitted a client reference whose factory resolved to `undefined`
          ("Cannot read properties of undefined (reading 'call')"). The route group is the App
          Router's own answer to "this layout applies to some children and not others", and it is
          resolved at build time with no client component in the tree at all. */}
      {children}

      {/* Adds the reveal-on-scroll behaviour to anything marked `data-reveal`. Renders no DOM. */}
      <RevealOnScroll />
      {/* Installs the /AndrewAsh-scoped service worker so the studio can be added to a home screen
          and receive push. Gated; the off path actively uninstalls. */}
      <RegisterVoicePWA />
    </div>
  );
}
