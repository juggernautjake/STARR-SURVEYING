// app/AndrewAsh/work/[slug]/page.tsx — one project page.
//
// Identical machinery to the built-in pages: blocks in, widgets out. The only difference is that a
// project page has no built-in default to fall back on — it exists because Andrew made it — so a
// missing slug is a genuine 404 rather than a reason to render something.
//
// A project header (client, role, year) is NOT rendered here. It is blocks, like everything else, so
// Andrew can move the title below the audio, drop the year, or lead with a photograph. Hardcoding a
// header would make the top of every project page the one part he could not touch — and the top of
// the page is exactly the part worth arranging per project.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import WidgetRenderer from '../../../_ui/WidgetRenderer';
import OwnerBar from '../../../_ui/OwnerBar';
import { buildPageContext } from '../../../_ui/SystemPage';
import { getPageBySlug, listLivePages } from '@/lib/voice/settings';
import { publicWidgets } from '@/lib/voice/widgets';
import { getVoiceSession } from '@/lib/voice/auth';
import { BASE_PATH } from '@/lib/voice/content';

export const revalidate = 0;

/** Pre-renders the slugs that exist at build time. New projects still work — Next falls back to
 *  rendering on demand — this just makes the ones that already exist fast on first hit. */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const projects = await listLivePages('project');
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await getPageBySlug(params.slug, 'project', false);
  if (!page) return { title: 'Project not found' };
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || page.summary || undefined,
  };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<React.ReactElement> {
  const session = getVoiceSession();

  // Drafts are visible to Andrew and to nobody else. The session check happens HERE, at the route,
  // rather than inside the data function — data access that reads cookies hides an authorisation
  // decision from every caller that uses it.
  const [page, context] = await Promise.all([
    getPageBySlug(params.slug, 'project', Boolean(session)),
    buildPageContext(),
  ]);

  if (!page) notFound();

  const clientView = searchParams?.view === 'client';
  const ownerMode = Boolean(session) && !clientView;
  const editHref = `${BASE_PATH}/studio/pages/${page.id}`;
  const blocks = ownerMode && page.draftBlocks ? page.draftBlocks : page.blocks;

  return (
    <>
      {session && (
        <OwnerBar pageTitle={page.title} editHref={editHref} isCustomised slug={page.slug} />
      )}
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
