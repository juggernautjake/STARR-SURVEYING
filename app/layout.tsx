import type { Metadata } from 'next';
import Script from 'next/script';
import './styles/globals.css';
import LayoutShell from './components/LayoutShell';

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
  
  // Base URL - REQUIRED for OG images to work properly
  metadataBase: new URL('https://www.starrsurveying.com'),
  
  alternates: {
    canonical: '/',
  },
  
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
  
  // Theme color for mobile browsers (your brand red)
  themeColor: '#BD1218',
  
  // App name
  applicationName: 'Starr Surveying',
  
  // Additional meta for better SEO
  category: 'Business',
  classification: 'Land Surveying Services',
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Preconnect for faster font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {/* Google tag (gtag.js) - Google Ads AW-17921491739 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=AW-17921491739"
          strategy="afterInteractive"
        />
        <Script id="google-ads-gtag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17921491739');
          `}
        </Script>

        <LayoutShell>
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}