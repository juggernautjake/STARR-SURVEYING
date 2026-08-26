import { MetadataRoute } from 'next';

// app/robots.ts — the file every crawler asks for first, and which this site did not have.
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────────────
//
// Measured 2026-08-25: `https://www.starr-surveying.com/robots.txt` returned the site's HTML 404
// page. Not a robots file — a page, carrying `<meta name="robots" content="noindex">` as 404s
// rightly do.
//
// A missing robots.txt is not itself a deindexing: Google treats 404 as "crawl what you like", and
// the live pages do serve `index, follow`, so the site was never blocked. But it costs two real
// things. Crawlers get no sitemap pointer, so discovery depends entirely on Search Console and
// links. And a 404 here is one of the first things an SEO audit flags, which makes it expensive to
// keep explaining.
//
// ── WHY THE ADMIN AND API PATHS ARE DISALLOWED ──────────────────────────────────────────────────
//
// Not for security — every one of those routes is authenticated and a `Disallow` is a request, not
// a control, so it must never be the thing standing between a stranger and private data. It is to
// stop crawl budget being spent on hundreds of admin routes that answer 401 to a crawler, and to
// keep sign-in pages out of results where they help nobody who finds them.
//
// `/pay/` and `/share/` carry customer tokens in the URL. Those must not be indexed at all.
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.starr-surveying.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/login',
          '/signup',
          '/register',
          '/reset-password',
          // Tokenised customer surfaces — a link in a results page would expose one person's
          // invoice or shared record to whoever searched.
          '/pay/',
          '/share/',
          // Internal tooling that is of no use to a searcher and should not compete with the
          // service pages for relevance.
          '/ux-harness',
        ],
      },
    ],
    // The canonical host, matching `sitemap.ts` and `metadataBase`. All three disagreed until
    // 2026-08-25 — see the note in `app/sitemap.ts`.
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
