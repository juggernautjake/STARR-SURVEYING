/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  reactStrictMode: true,
  // Page extensions: production builds use only the standard extensions, while
  // dev builds also include `.dev.tsx`/`.dev.ts` so route group `app/(dev)/`
  // pages (e.g. `app/(dev)/dev-test/page.dev.tsx`) are stripped from prod.
  pageExtensions: isDev
    ? ['tsx', 'ts', 'jsx', 'js', 'dev.tsx', 'dev.ts']
    : ['tsx', 'ts', 'jsx', 'js'],
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  // File upload limits for research document processing (Phase 2)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    serverComponentsExternalPackages: ['playwright', 'playwright-core', '@sparticuz/chromium', '@resvg/resvg-js'],
  },
  // Note: Per-route body size limits are configured via route segment config
  // exports in individual API route files (e.g., export const maxDuration = 60)
}

module.exports = nextConfig