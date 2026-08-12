import type { Metadata, Viewport } from 'next';
import './styles/globals.css';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/density.css';
import './styles/forms.css';
import LayoutShell from './components/LayoutShell';
import { Suspense } from 'react';
import AttributionCapture from './components/AttributionCapture';

// ============================================================================
// SITE METADATA - Controls social sharing previews and SEO
// ============================================================================
export const metadata: Metadata = {
  // ─────────────────────────────────────────────────────────────────────────
  // BASIC METADATA
  // ─────────────────────────────────────────────────────────────────────────
  title: {
    default: 'Starr Surveying | Professional Land Surveying in Central Texas',
    template: '%s | Starr Surveying',
  },
  description: 'Professional land surveying services in Central Texas. Boundary surveys, topographic surveys, construction staking, ALTA surveys, and more. RPLS licensed & insured. Get a free quote today!',
  
  keywords: [
    'land surveying',
    'land surveyor',
    'boundary survey',
    'property survey',
    'Central Texas surveyor',
    'Texas land surveyor',
    'Belton surveyor',
    'Bell County surveyor',
    'topographic survey',
    'construction staking',
    'ALTA survey',
    'RPLS',
    'licensed surveyor',
    'property lines',
    'lot survey',
  ],
  
  authors: [{ name: 'Starr Surveying' }],
  creator: 'Starr Surveying',
  publisher: 'Starr Surveying',
  
  // Base URL - REQUIRED for OG images to work properly.
  //
  // Was `www.starrsurveying.com` (no hyphen) until 2026-08-07. That domain does not resolve — the
  // site is `www.starr-surveying.com`. Every absolute URL Next.js derives from this was therefore
  // pointing at nothing, which meant EVERY og:image on the site was a dead link and no social
  // preview has ever rendered. Verified by fetching the emitted URL: connection fails outright.
  metadataBase: new URL('https://www.starr-surveying.com'),

  // NO SITE-WIDE `alternates.canonical` HERE, AND THAT IS THE FIX.
  //
  // This used to be `canonical: '/'`, which Next.js applies to every page that does not override it.
  // The result was that /services, /pricing, /contact and the rest each told Google "the canonical
  // version of me is the homepage" — i.e. every page on the site declared itself a duplicate of one
  // other page. Combined with the wrong domain above, they were declaring themselves duplicates of a
  // page that does not exist.
  //
  // That matters most for the pages Google Ads sends paid traffic to. A page canonicalised away is a
  // page Google is being asked not to index on its own merits.
  //
  // A page that wants a canonical should set its own in its `metadata` export.

  // PWA manifest — makes the site installable as a Progressive Web App
  // on iOS + Android. "Add to Home Screen" creates a standalone app icon.
  manifest: '/manifest.json',
  
  // ─────────────────────────────────────────────────────────────────────────
  // OPEN GRAPH - Facebook, iMessage, LinkedIn, Discord, Slack, etc.
  // ─────────────────────────────────────────────────────────────────────────
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.starrsurveying.com',
    siteName: 'Starr Surveying',
    title: 'Starr Surveying | Your Trusted Texas Land Surveyors',
    description: 'Professional land surveying services in Central Texas. Boundary surveys, topographic surveys, construction staking, and more. RPLS licensed. Get a free estimate!',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Starr Surveying - Your Trusted Texas Land Surveyors',
        type: 'image/png',
      },
    ],
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // TWITTER CARD - Twitter/X sharing
  // ─────────────────────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: 'Starr Surveying | Your Trusted Texas Land Surveyors',
    description: 'Professional land surveying services in Central Texas. Boundary surveys, topographic surveys, construction staking, and more. Get a free estimate!',
    images: ['/og-image.png'],
    // creator: '@StarrSurveying',  // Add if you have Twitter
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ICONS - Favicons and app icons
  // ─────────────────────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ADDITIONAL META
  // ─────────────────────────────────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  
  // Google Search Console verification
  verification: {
    google: 'BzjvCsBBacqPdyOHtrz2OQtAYeNrktNiLPfsEf7H1no',
  },
  
  // App name
  applicationName: 'Starr Surveying',
  
  // Additional meta for better SEO
  category: 'Business',
  classification: 'Land Surveying Services',
};

export const viewport: Viewport = {
  themeColor: '#BD1218',
  width: 'device-width',
  initialScale: 1,
  // M9, 2026-08-11 — WITHOUT THIS, EVERY `env(safe-area-inset-*)` RULE IN THIS APP IS DEAD CODE.
  //
  // `AdminResponsive.css` carried a dozen safe-area rules — the drawer, the FAB pill, the
  // messenger, the fieldbook — written at some point to keep controls clear of the home indicator.
  // On iOS every one of them resolved to **0**, because `env()` only reports real insets when the
  // page opts into drawing behind them with `viewport-fit=cover`. Authored, plausible-looking, and
  // doing nothing: this repo's signature defect, in CSS this time.
  //
  // This flag and the insets that answer it (AdminResponsive.css, "SAFE AREA") are one change and
  // must stay one change. Adding this alone is strictly WORSE than not adding it — the layout
  // immediately extends under the notch and the home indicator, so the top bar's controls end up
  // beneath the status bar, which is a plausible cause of the owner's *"I have to tap it twice"*
  // in the installed PWA.
  viewportFit: 'cover',
  // PWA plan W6 — PINCH-ZOOM IS DELIBERATELY LEFT ENABLED. No `maximumScale`, no `userScalable`.
  //
  // The comment that used to sit here claimed zoom was "locked off so the app feels native", and it
  // had been wrong for as long as it existed — neither option was ever set. Corrected rather than
  // implemented, because the comment described the worse behaviour of the two:
  //
  //   * Blocking zoom is an accessibility failure (WCAG 2.1 SC 1.4.4, Resize Text). This app is used
  //     outdoors in bright sun by crews reading bearings and job numbers — pinching to check a digit
  //     is exactly the case it would break.
  //   * It would not work anyway. iOS Safari has ignored `user-scalable=no` since iOS 10, so the
  //     only reliable effect would be on Android.
  //
  // Left as a comment rather than deleted so the next person to reach for "make it feel native"
  // finds the reasoning instead of the idea.
};

// ============================================================================
// ROOT LAYOUT COMPONENT
// ============================================================================
interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {/* W6 — no hand-written viewport meta here. Next injects one from the `viewport` export
            above, so writing a second by hand put TWO viewport tags in every page's head, with the
            duplicate silently outranking or shadowing the export depending on order. Removed so
            there is one declaration and one place to change it. */}

        {/* Preconnect for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {/* G1-1 — records the ad click on the FIRST page of the session, wherever that is. It lives in the
            root layout rather than on the forms because almost nobody converts on the page they landed on;
            a capture that lives on the form sees a clean URL and credits the booking to nothing.
            Renders no markup. Wrapped in Suspense because it reads `useSearchParams`, which would
            otherwise opt every page into client rendering. */}
        <Suspense fallback={null}>
          <AttributionCapture />
        </Suspense>
        <LayoutShell>
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}