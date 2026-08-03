// app/AndrewAsh/(site)/[slug]/page.tsx — a page Andrew made.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────
//
// The builder could create a `kind: 'page'` record, and Studio → Pages linked to it at
// `/AndrewAsh/<slug>` — and that URL 404'd, because nothing served it. Andrew could build a page,
// publish it, click the address the studio showed him, and land on a not-found. "He can create new
// pages and projects" was the headline requirement and it stopped one route short of working.
//
// Found by reading the planning doc's route table against `find app/AndrewAsh -name page.tsx`, which
// is the only reliable way to catch this: every individual piece existed and had been tested, so
// nothing failed. The seam between them was the hole.
//
// ── WHY A BARE SLUG RATHER THAN /p/<slug> ───────────────────────────────────────────────────────
//
// The doc originally specified `/AndrewAsh/p/[slug]`. A bare `/AndrewAsh/rates` is a better address
// to say out loud and to put in an email signature, and — decisively — it is the URL the studio was
// ALREADY generating and showing him. Matching the code to the link means no data migration and no
// page whose address changes under an existing link.
//
// The cost is that this segment competes with every static route under /AndrewAsh. Next resolves
// static before dynamic, so `/AndrewAsh/studio` still wins — which means a page slugged `studio`
// would be silently unreachable forever. `SHADOWED_SLUGS` in lib/voice/slug.ts prevents that at
// creation, where the problem is free to fix.
//
// The built-in slugs (`about`, `coaching`, …) are deliberately NOT blocked: their routes are
// `SystemPage`, which reads `va_pages` by slug and prefers Andrew's row. That is how adopting a
// built-in page works, so those addresses belong to the table already.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import WidgetRenderer from '../../_ui/WidgetRenderer';
import OwnerBar from '../../_ui/OwnerBar';
import { buildPageContext } from '../../_ui/SystemPage';
import { getPageBySlug, listLivePages } from '@/lib/voice/settings';
import { publicWidgets } from '@/lib/voice/widgets';
import { getVoiceSession } from '@/lib/voice/auth';
import { BASE_PATH } from '@/lib/voice/content';
import { isShadowedSlug } from '@/lib/voice/slug';

export const revalidate = 0;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const pages = await listLivePages('page');
  // Pre-renders the custom pages that exist at build time; new ones still work, because Next falls
  // back to rendering on demand. Shadowed slugs are dropped — a static route owns those paths, so
  // emitting them here would be a param for a page this segment will never be asked to serve.
  return pages.filter((p) => !isShadowedSlug(p.slug)).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await getPageBySlug(params.slug, 'page', false);
  if (!page) return { title: 'Page not found' };
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || page.summary || undefined,
  };
}

export default async function CustomPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<React.ReactElement> {
  // Belt and braces. A shadowed slug can only reach this handler if the static route that owns the
  // path were removed — at which point serving whatever row happens to sit at `studio` would be a
  // surprise at a well-known address. 404 instead.
  if (isShadowedSlug(params.slug)) notFound();

  const session = getVoiceSession();

  // Drafts are visible to Andrew and nobody else. Checked at the route rather than inside the data
  // function, so the authorisation decision is where a reader of this file can see it.
  const [page, context] = await Promise.all([
    getPageBySlug(params.slug, 'page', Boolean(session)),
    buildPageContext(),
  ]);

  if (!page) notFound();

  const clientView = searchParams?.view === 'client';
  const ownerMode = Boolean(session) && !clientView;
  const editHref = `${BASE_PATH}/studio/pages/${page.id}`;
  const blocks = ownerMode && page.draftBlocks ? page.draftBlocks : page.blocks;

  return (
    <>
      {session && <OwnerBar pageTitle={page.title} editHref={editHref} isCustomised slug={page.slug} />}
      {session && page.status !== 'live' && !clientView && (
        <div className="vaOwnerBar vaOwnerBarPreview vaNoPrint">
          <span className="vaOwnerBarLabel">
            {page.status === 'draft' ? 'Draft — not visible to anyone else' : 'Archived — not listed publicly'}
          </span>
        </div>
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
