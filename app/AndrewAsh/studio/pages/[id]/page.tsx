// app/AndrewAsh/studio/pages/[id]/page.tsx — the builder shell.
//
// Server component: loads the page and the bound-widget data, then hands both to the client builder.
// The context is fetched here rather than in the builder so the live preview's `demoReels` and
// `projectGrid` widgets show REAL reels and REAL projects — a preview where the live widgets render
// as placeholders is a preview that lies about the two blocks most likely to be misjudged.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import '../../_ui/builder.css';
import PageBuilder from './PageBuilder';
import { buildPageContext } from '../../../_ui/SystemPage';
import { getPageById } from '@/lib/voice/settings';
import { normalizeWidgets } from '@/lib/voice/widgets';
import { DEFAULT_PAGE_SLUGS } from '@/lib/voice/default-pages';

export const metadata: Metadata = { title: 'Editing' };
export const dynamic = 'force-dynamic';

export default async function BuilderPage({ params }: { params: { id: string } }): Promise<React.ReactElement> {
  const [page, context] = await Promise.all([getPageById(params.id), buildPageContext()]);
  if (!page) notFound();

  // The draft is what he is editing; the published blocks are the starting point when there is no
  // draft yet.
  const blocks = page.draftBlocks && page.draftBlocks.length ? page.draftBlocks : normalizeWidgets(page.blocks);

  return (
    <PageBuilder
      pageId={page.id}
      initialBlocks={blocks}
      hasDraft={Boolean(page.draftBlocks && page.draftBlocks.length)}
      meta={{
        title: page.title,
        slug: page.slug,
        kind: page.kind,
        status: page.status,
        workState: page.workState,
        summary: page.summary ?? '',
        clientName: page.clientName ?? '',
        roleLabel: page.roleLabel ?? '',
        year: page.year,
        coverPhotoId: page.coverPhotoId ?? '',
        featured: page.featured,
        seoTitle: page.seoTitle ?? '',
        seoDescription: page.seoDescription ?? '',
      }}
      context={context}
      // Built-in pages can be restored to the original by deleting the row; a project page cannot,
      // because there is nothing to restore it to. The builder shows a different destructive action
      // for each, which is the only difference between them anywhere in the studio.
      isSystemPage={page.kind === 'page' && DEFAULT_PAGE_SLUGS.includes(page.slug)}
    />
  );
}
