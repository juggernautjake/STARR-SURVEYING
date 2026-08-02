// app/AndrewAsh/studio/pages/page.tsx — every page on the site, in one list.
//
// ── BUILT-IN PAGES APPEAR HERE TOO ──────────────────────────────────────────────────────────────
//
// The six pages the site shipped with are listed alongside anything Andrew has made, marked
// "Original" until he edits one. That is the whole point of the architecture: he should not have to
// learn that some pages are his and some are the developer's. They are all his; some just have not
// been touched yet.
//
// Clicking one that has never been edited "adopts" it — copies the built-in blocks into the database
// — and from then on it is an ordinary row. Deleting that row restores the original exactly.

import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Globe, PencilLine, PlusCircle, Sparkles } from 'lucide-react';

import NewPageButton from './NewPageButton';
import AdoptRedirect from './AdoptRedirect';
import { supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_PAGES } from '@/lib/voice/default-pages';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Pages' };
export const dynamic = 'force-dynamic';

interface Row {
  id: string | null;
  slug: string;
  kind: 'page' | 'project';
  title: string;
  status: string;
  hasDraft: boolean;
  isOriginal: boolean;
  description: string;
  updatedAt: string | null;
}

export default async function PagesList({
  searchParams,
}: {
  searchParams: { adopt?: string };
}): Promise<React.ReactElement> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let saved: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('va_pages')
      .select('id, slug, kind, title, status, summary, updated_at, draft_blocks')
      .order('kind', { ascending: true })
      .order('sort_order', { ascending: true });
    saved = data ?? [];
  } catch {
    saved = [];
  }

  const savedBySlug = new Map(saved.filter((p) => p.kind === 'page').map((p) => [p.slug, p]));

  // Built-in pages, showing the saved row where one exists.
  const systemRows: Row[] = DEFAULT_PAGES.map((def) => {
    const row = savedBySlug.get(def.slug);
    return {
      id: row?.id ?? null,
      slug: def.slug,
      kind: 'page',
      title: row?.title ?? def.title,
      status: row?.status ?? 'live',
      hasDraft: Array.isArray(row?.draft_blocks) && row.draft_blocks.length > 0,
      isOriginal: !row,
      description: row?.summary ?? def.description,
      updatedAt: row?.updated_at ?? null,
    };
  });

  const projectRows: Row[] = saved
    .filter((p) => p.kind === 'project')
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      kind: 'project' as const,
      title: p.title,
      status: p.status,
      hasDraft: Array.isArray(p.draft_blocks) && p.draft_blocks.length > 0,
      isOriginal: false,
      description: p.summary ?? '',
      updatedAt: p.updated_at,
    }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      {/* Arriving from a public page's "Edit this page" on a never-edited built-in: adopt it and go
          straight to the builder, so the round trip is invisible. */}
      {searchParams.adopt && <AdoptRedirect slug={searchParams.adopt} />}

      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Pages</h1>
          <p className="vaStudioSub">
            Everything on the site, including the pages it came with. Nothing here is locked — open any
            page and change it.
          </p>
        </div>
        <NewPageButton />
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">
            <Globe size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
            The main pages
          </h2>
        </div>
        <PageRows rows={systemRows} />
      </div>

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">
            <FileText size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
            Projects
          </h2>
          <span className="vaMuted" style={{ fontSize: '0.8125rem' }}>
            {projectRows.length} page{projectRows.length === 1 ? '' : 's'}
          </span>
        </div>

        {projectRows.length === 0 ? (
          <div className="vaEmptyPanel">
            <Sparkles size={26} aria-hidden style={{ marginBottom: 12, color: 'var(--va-accent)' }} />
            <p style={{ margin: '0 0 8px', color: 'var(--va-text)', fontSize: '0.9375rem' }}>
              No project pages yet.
            </p>
            <p style={{ margin: '0 0 18px', fontSize: '0.875rem' }}>
              A project page is one job, told properly — the audio, the brief, what you brought to it.
              It is the single most persuasive thing you can put in front of a new client.
            </p>
            <NewPageButton label="Create the first one" />
          </div>
        ) : (
          <PageRows rows={projectRows} />
        )}
      </div>
    </>
  );
}

function PageRows({ rows }: { rows: Row[] }): React.ReactElement {
  return (
    <table className="vaDataTable">
      <thead>
        <tr>
          <th>Page</th>
          <th>Address</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const publicHref =
            row.kind === 'project' ? `${BASE_PATH}/work/${row.slug}` : row.slug === 'home' ? BASE_PATH : `${BASE_PATH}/${row.slug}`;
          const editHref = row.id
            ? `${BASE_PATH}/studio/pages/${row.id}`
            : `${BASE_PATH}/studio/pages?adopt=${row.slug}`;

          return (
            <tr key={row.slug + (row.id ?? '')}>
              <td data-label="Page">
                <Link href={editHref} style={{ color: 'var(--va-text)', fontWeight: 600, textDecoration: 'none' }}>
                  {row.title}
                </Link>
                {row.description && (
                  <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem', marginTop: 3 }}>
                    {row.description}
                  </span>
                )}
              </td>
              <td data-label="Address">
                <Link href={publicHref} style={{ color: 'var(--va-accent)', fontSize: '0.8125rem', textDecoration: 'none' }}>
                  {publicHref}
                </Link>
              </td>
              <td data-label="Status">
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    className={`vaStatusPill ${
                      row.status === 'live' ? 'vaStatusLive' : row.status === 'draft' ? 'vaStatusDraft' : ''
                    }`}
                  >
                    {row.status}
                  </span>
                  {row.isOriginal && <span className="vaStatusPill">Original</span>}
                  {row.hasDraft && <span className="vaStatusPill vaStatusNew">Unpublished edits</span>}
                </span>
              </td>
              <td data-label="">
                <Link href={editHref} className="vaBtn vaBtnOutline vaBtnSm">
                  <PencilLine size={13} aria-hidden /> Edit
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
