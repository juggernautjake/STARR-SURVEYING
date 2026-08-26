import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  // ── www, BECAUSE THAT IS WHAT THE SITE ACTUALLY SERVES ──────────────────────────────────────
  //
  // This said `https://starr-surveying.com` (no www). Measured 2026-08-25: that host answers with a
  // 301 to `https://www.starr-surveying.com`, so EVERY url in this sitemap was a redirect.
  //
  // Google's own guidance is that a sitemap lists canonical URLs. A sitemap of redirects still gets
  // crawled, but it spends crawl budget on hops and hands Google a second spelling of every page to
  // reconcile against the one the site serves — which is exactly the ambiguity a sitemap exists to
  // remove. Three spellings of this host were in the codebase at once; the other two are fixed in
  // `app/layout.tsx`.
  const baseUrl = 'https://www.starr-surveying.com';
  const lastModified = new Date();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/services`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/service-area`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/credentials`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/resources`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}