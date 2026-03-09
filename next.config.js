/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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