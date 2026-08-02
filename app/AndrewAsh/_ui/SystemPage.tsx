// app/AndrewAsh/_ui/SystemPage.tsx — renders one of the site's built-in pages.
//
// Every public route on this site is five lines that call this. The resolution order is the whole
// idea:
//
//     1. A row in `va_pages` with this slug   →  Andrew has edited it. His version wins, always.
//     2. The default block array               →  He has not. Render the site as built.
//
// So a route never renders JSX of its own, and "Andrew can edit this page" is true of every page by
// construction rather than by anybody remembering to make it so. Deleting his row restores the
// original, which is what makes "Restore the original" in the studio a one-line operation with no
// content to regenerate.
//
// ── ONE ROUND OF QUERIES PER PAGE, NOT PER WIDGET ───────────────────────────────────────────────
//
// The bound widgets (demoReels, projectGrid, testimonials, packages, creditsList) all need data. If
// each fetched its own, a home page would make five sequential round trips inside the render — and
// because React renders children depth-first, they would not even parallelise. Instead the context is
// assembled once, here, in a single Promise.all, and handed down. A page with five bound widgets and
// a page with one cost the same.
//
// The fetches are unconditional rather than derived from which widgets are present. Scanning the
// blocks first would save a query or two on simple pages and would mean a widget Andrew ADDS in the
// editor renders empty until the page is reloaded — which reads as a broken widget.

import { notFound } from 'next/navigation';

import WidgetRenderer, { type PageContext } from './WidgetRenderer';
import OwnerBar from './OwnerBar';
import { defaultPageBySlug } from '@/lib/voice/default-pages';
import { normalizeWidgets, publicWidgets, type Widget } from '@/lib/voice/widgets';
import {
  getPageBySlug,
  getSiteSettings,
  listCoachingPackages,
  listCredits,
  listDemos,
  listLivePages,
  listTestimonials,
} from '@/lib/voice/settings';
import { getVoiceSession } from '@/lib/voice/auth';
import { BASE_PATH } from '@/lib/voice/content';

export async function buildPageContext(): Promise<PageContext> {
  const [settings, demos, projects, testimonials, packages, credits] = await Promise.all([
    getSiteSettings(),
    listDemos(),
    listLivePages('project'),
    listTestimonials('all'),
    listCoachingPackages(),
    listCredits(),
  ]);

  return {
    demos,
    projects,
    testimonials,
    packages,
    credits,
    artistName: settings.artistName,
    location: settings.location,
  };
}

interface Props {
  slug: string;
  /** Set by the studio's preview route so unpublished draft blocks render. */
  preview?: boolean;
  /** The route's `searchParams`. Read for `?view=client`, which suppresses ALL owner chrome.
   *
   *  This is read on the SERVER rather than toggled in the browser precisely so that client view
   *  renders a page with no edit buttons in the DOM at all — not edit buttons hidden with CSS. When
   *  Andrew asks to see what a client sees, the honest answer has to be the same HTML. */
  searchParams?: Record<string, string | string[] | undefined>;
}

export default async function SystemPage({ slug, preview = false, searchParams }: Props): Promise<React.ReactElement> {
  const fallback = defaultPageBySlug(slug);

  const [saved, context] = await Promise.all([
    getPageBySlug(slug, 'page', true),
    buildPageContext(),
  ]);

  // Neither a saved page nor a built-in default: genuinely not a page on this site.
  if (!saved && !fallback) notFound();

  let blocks: Widget[];
  let isCustomised: boolean;

  if (saved) {
    // A page Andrew has saved. Drafts render only in preview; the public gets the published set.
    const source = preview && saved.draftBlocks ? saved.draftBlocks : saved.blocks;
    // An empty saved blocks array is ambiguous — it means either "I deleted everything" or "the save
    // wrote nothing". Falling back to the default is the safer reading of both: the site keeps
    // working, and a genuinely emptied page is a state Andrew can reach on purpose by hiding blocks
    // rather than by deleting them all.
    blocks = source.length ? source : normalizeWidgets(fallback?.blocks ?? []);
    isCustomised = source.length > 0;
  } else {
    blocks = normalizeWidgets(fallback!.blocks);
    isCustomised = false;
  }

  // Only read the session when rendering the owner chrome. It touches cookies, which opts the route
  // out of static rendering — acceptable for the owner bar, and the reason `revalidate` is short
  // rather than the page being fully static.
  const session = getVoiceSession();
  const clientView = searchParams?.view === 'client';
  const ownerMode = Boolean(session) && !clientView;
  const editHref = saved ? `${BASE_PATH}/studio/pages/${saved.id}` : `${BASE_PATH}/studio/pages?adopt=${slug}`;

  return (
    <>
      {session && (
        <OwnerBar
          pageTitle={saved?.title ?? fallback?.title ?? slug}
          editHref={editHref}
          isCustomised={isCustomised}
          slug={slug}
        />
      )}
      <WidgetRenderer
        widgets={publicWidgets(blocks)}
        context={context}
        ownerMode={ownerMode}
        editHref={editHref}
      />
    </>
  );
}

/** Metadata for a built-in page, preferring whatever Andrew saved. */
export async function systemPageMetadata(slug: string): Promise<{ title: string; description: string }> {
  const fallback = defaultPageBySlug(slug);
  const saved = await getPageBySlug(slug, 'page', true);
  return {
    title: saved?.seoTitle || saved?.title || fallback?.seoTitle || fallback?.title || 'Andrew Ash',
    description: saved?.seoDescription || fallback?.seoDescription || '',
  };
}
