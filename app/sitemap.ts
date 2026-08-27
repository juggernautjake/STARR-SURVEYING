import { SITE_URL } from '@/lib/seo/business';
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
  const baseUrl = SITE_URL;

  // ── NO `lastModified`, AND REMOVING IT IS THE FIX (2026-08-25) ─────────────────────────────────
  //
  // Every entry below carried `lastModified: new Date()` — one `new Date()` evaluated when the sitemap
  // was produced and stamped onto all nine URLs. So the sitemap asserted that every page on the site,
  // including /privacy, had been modified moments ago. Every time. Forever.
  //
  // Google's documented behaviour is that it uses `lastmod` only when it judges the value consistent
  // with what it actually observes changing, and ignores it otherwise. A file that claims everything
  // changed today, every day, is the exact pattern that earns that distrust — so the field was not
  // merely useless, it was spending the site's credibility on a value that carried no information.
  //
  // Absent is better than false: with no `lastmod`, Google schedules crawls from its own observations,
  // which is what it was going to do anyway once it stopped believing this.
  //
  // To restore it properly, stamp each URL with the real date that page's content last changed — a
  // build step reading `git log -1` per route file could do it — and not a moment sooner.

  return [
    {
      url: baseUrl,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/services`,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pricing`,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/service-area`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/credentials`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/resources`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}