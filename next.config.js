/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
// cad-desktop-tauri-and-perf Slice T1 — `STARR_BUILD_TARGET=desktop`
// flips Next.js into static-export mode so the Tauri shell can host
// the app from a flat `out-desktop/` directory. The default (web) build
// is unchanged: same routes, same server actions, same Vercel deploy.
// Desktop builds output to a distinct `distDir` so the two builds can
// coexist locally without stomping each other's artifacts.
const isDesktopBuild = process.env.STARR_BUILD_TARGET === 'desktop';

const nextConfig = {
  reactStrictMode: true,
  // Page extensions: production builds use only the standard extensions, while
  // dev builds also include `.dev.tsx`/`.dev.ts` so route group `app/(dev)/`
  // pages (e.g. `app/(dev)/dev-test/page.dev.tsx`) are stripped from prod.
  pageExtensions: isDev
    ? ['tsx', 'ts', 'jsx', 'js', 'dev.tsx', 'dev.ts']
    : ['tsx', 'ts', 'jsx', 'js'],
  // cad-desktop-tauri-and-perf Slice T1 — static export for Tauri. Set
  // only when STARR_BUILD_TARGET=desktop so the web build stays
  // server-rendered. Tauri serves these files directly from the
  // packaged binary; `assetPrefix: ''` keeps every asset URL relative
  // so it loads regardless of the path Tauri mounts the bundle at.
  // `trailingSlash: true` matches Tauri's expectation that directory
  // requests resolve to `index.html`.
  ...(isDesktopBuild ? {
    output: 'export',
    distDir: 'out-desktop',
    assetPrefix: '',
    trailingSlash: true,
  } : {}),
  images: {
    // Next.js image-optimization needs a server. The desktop build is
    // static so we route through the raw `<img>` path.
    unoptimized: isDesktopBuild,
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
