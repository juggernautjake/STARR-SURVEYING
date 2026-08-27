import type { Metadata } from 'next';
import { SITE_URL } from './business';

// lib/seo/page-metadata.ts — a title, a description and a canonical for one public page.
//
// ── THE DEFECT THIS EXISTS TO FIX (measured live, 2026-08-25) ───────────────────────────────────
//
// Five of the nine public pages were serving the HOMEPAGE'S title tag, verbatim:
//
//   /contact       Starr Surveying | Professional Land Surveying in Central Texas
//   /credentials   Starr Surveying | Professional Land Surveying in Central Texas
//   /pricing       Starr Surveying | Professional Land Surveying in Central Texas
//   /resources     Starr Surveying | Professional Land Surveying in Central Texas
//   /service-area  Starr Surveying | Professional Land Surveying in Central Texas
//
// Not a bug in anyone's edit — a consequence of the framework. Each of those pages is a `'use client'`
// component, and a client component CANNOT export `metadata`; Next silently falls back to the root
// layout's default. Nothing warns, and the pages look completely normal in a browser.
//
// The title tag is the strongest on-page signal there is, and it is the line a person reads in the
// results before deciding whether to click. Five pages were telling Google they were the same page,
// competing with the homepage — and with each other — for the same query. `/pricing` in particular
// was invisible to the one search a surveying customer most reliably makes: what a survey costs.
//
// The fix is a `layout.tsx` beside each client page, because a layout IS a server component and can
// export what the page cannot.
//
// ── AND A SELF-REFERENCING CANONICAL, WHICH IS NOT OPTIONAL HERE ────────────────────────────────
//
// The root layout deliberately sets NO site-wide canonical: it used to be `'/'`, which made every page
// declare itself a duplicate of the homepage (worse than none). But "none" is also not right for this
// site, because it buys traffic.
//
// Every paid click arrives with `?gclid=…` appended, and the attribution layer adds `utm_*` on top. To
// a crawler each distinct query string is a distinct URL. Google usually works out that they are the
// same page — usually. A self-referencing canonical says so outright, and consolidates the ranking
// signals from every tagged variant onto the one clean URL.

export interface PageSeo {
  /** WITHOUT the brand. The root layout's template appends " | Starr Surveying" to whatever is here —
   *  so a title that includes the brand itself renders it twice, which is exactly what `/services`
   *  ("Services | Starr Surveying | Starr Surveying") and `/about` were doing in production. */
  title: string;
  /** Google rewrites descriptions it does not like, but it can only choose from what exists. An absent
   *  description is a snippet assembled from whatever text the crawler happened to find first. */
  description: string;
  /** Site-root-relative, with the leading slash, exactly as the route is served. */
  path: string;
}

export function pageMetadata({ title, description, path }: PageSeo): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path === '/' ? '' : path}`,
      type: 'website',
    },
    twitter: { title, description },
  };
}
