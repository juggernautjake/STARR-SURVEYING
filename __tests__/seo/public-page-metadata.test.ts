import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── THE RATCHET FOR A DEFECT THAT NOTHING ELSE CAN SEE ──────────────────────────────────────────
//
// On 2026-08-25, five of the nine public pages were serving the homepage's title tag. The cause is
// structural rather than careless: a `'use client'` page CANNOT export `metadata`, Next falls back to
// the root layout's default without complaint, and the page renders perfectly in a browser. Type
// checking passes. The test suite passes. Nothing anywhere goes red.
//
// The only way this becomes visible is to assert it, so:
//
//   every public route must own its title — by exporting `metadata` from a SERVER page, or by having
//   a `layout.tsx` beside it that does.
//
// The failure this catches next is the likely one: somebody adds a page under `app/`, marks it
// `'use client'` because it needs a hook, and ships a route that tells Google it is the homepage.

const APP = join(process.cwd(), 'app');

/** The routes a search engine is invited to index. Deliberately a hand-kept list rather than a glob:
 *  the app has ~139 admin routes and several token-gated customer surfaces, none of which want a
 *  marketing title, and a glob would drag every one of them in. */
const PUBLIC_ROUTES = [
  'about',
  'contact',
  'credentials',
  'pricing',
  'privacy',
  'resources',
  'service-area',
  'services',
] as const;

function read(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

describe('public page metadata', () => {
  it.each(PUBLIC_ROUTES)('/%s declares its own title', (route) => {
    const page = read(join(APP, route, 'page.tsx'));
    const layout = read(join(APP, route, 'layout.tsx'));

    expect(page, `app/${route}/page.tsx is missing`).not.toBeNull();

    const pageIsClient = /^\s*['"]use client['"]/m.test(page as string);
    const pageHasMetadata = /export const metadata|export async function generateMetadata/.test(page as string);
    const layoutHasMetadata =
      layout !== null && /export const metadata|export async function generateMetadata/.test(layout);

    if (pageIsClient) {
      // The whole point. A client page's own `export const metadata` would be silently ignored, so the
      // layout beside it is the only thing that can carry the title.
      expect(
        layoutHasMetadata,
        `app/${route}/page.tsx is a client component, so it cannot export metadata. ` +
          `It needs an app/${route}/layout.tsx exporting metadata — see lib/seo/page-metadata.ts.`,
      ).toBe(true);
    } else {
      expect(
        pageHasMetadata || layoutHasMetadata,
        `app/${route} exports no metadata from either page.tsx or layout.tsx`,
      ).toBe(true);
    }
  });

  it.each(PUBLIC_ROUTES)('/%s does not repeat the brand in its own title', (route) => {
    // `app/layout.tsx` sets `title.template = '%s | Starr Surveying'`, so a page title containing the
    // brand renders it twice — which production was doing on /services and /about. The template is
    // what appends the brand; a page must not.
    const source = [read(join(APP, route, 'page.tsx')), read(join(APP, route, 'layout.tsx'))]
      .filter(Boolean)
      .join('\n');

    const titles = [...source.matchAll(/title:\s*(['"])(.*?)\1/g)].map((m) => m[2]);
    for (const title of titles) {
      expect(title, `app/${route} title repeats the brand: "${title}"`).not.toMatch(/Starr Surveying/);
    }
  });

  it.each(PUBLIC_ROUTES)('/%s canonicalises to itself, not to another page', (route) => {
    const source = [read(join(APP, route, 'page.tsx')), read(join(APP, route, 'layout.tsx'))]
      .filter(Boolean)
      .join('\n');

    const canonical = source.match(/canonical:\s*(['"])(.*?)\1/)?.[2] ?? source.match(/path:\s*(['"])(.*?)\1/)?.[2];

    // Not every page must declare one — absent means self-canonical, which is correct. What must never
    // happen again is a page pointing at a DIFFERENT url: the root layout once set `canonical: '/'`
    // site-wide, so every page declared itself a duplicate of the homepage.
    if (canonical !== undefined) {
      expect(canonical, `app/${route} canonicalises to ${canonical}`).toBe(`/${route}`);
    }
  });

  it('the root layout still sets no site-wide canonical', () => {
    // If this ever fails, read the long comment in app/layout.tsx before "fixing" it. A canonical in the
    // root layout applies to every page that does not override it, which is how the whole site came to
    // declare itself a duplicate of the homepage.
    const root = read(join(APP, 'layout.tsx')) as string;
    const alternates = root.match(/alternates:\s*\{[^}]*\}/s);
    expect(alternates, 'app/layout.tsx now sets a site-wide canonical').toBeNull();
  });
});
