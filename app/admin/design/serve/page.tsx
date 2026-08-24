// app/admin/design/serve/page.tsx — see a design as a page.
//
//   /admin/design/serve?route=/admin/jobs   the design of record for that page
//   /admin/design/serve?id=d-…              one specific design
//
// Phase R1 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Resolving by ROUTE is the interesting half: it goes through `resolveActive`, the one place that
// knows what "the design for this page" means, so this page and the page list and the conformance
// view can never disagree about which design is the record. Resolving by id is the plain case —
// somebody clicked "view as a page" on a draft.

import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveActive } from '@/lib/design/active';
import { getMockup } from '@/lib/design/server';
import ServedDesign from './ServedDesign';

export const metadata: Metadata = { title: 'Design — as a page' };
export const dynamic = 'force-dynamic';

interface Props {
  // Next 14: a plain object, not a promise.
  searchParams: { route?: string; id?: string };
}

export default async function ServeDesignPage({ searchParams }: Props) {
  if (searchParams.id) {
    const doc = await getMockup(searchParams.id);
    if (!doc) return <Missing what="That design does not exist." />;
    return (
      <ServedDesign
        doc={doc}
        kind={doc.status === 'active' ? 'active' : 'default'}
        explanation={doc.status === 'active'
          ? 'The design of record for this page.'
          : `A ${doc.status ?? 'draft'} design, shown at real size.`}
        route={doc.route}
      />
    );
  }

  if (!searchParams.route) {
    return <Missing what="Say which page: /admin/design/serve?route=/admin/jobs" />;
  }

  const resolved = await resolveActive(searchParams.route);
  if (!resolved.doc) {
    return <Missing what={`${searchParams.route}: ${resolved.explanation}`} />;
  }

  return (
    <ServedDesign
      doc={resolved.doc}
      kind={resolved.kind}
      explanation={resolved.explanation}
      route={resolved.route}
    />
  );
}

function Missing({ what }: { what: string }) {
  return (
    <div className="admin-empty" style={{ margin: '3rem auto', maxWidth: 560 }}>
      <div className="admin-empty__icon">📄</div>
      <div className="admin-empty__title">Nothing to show</div>
      <div className="admin-empty__desc">{what}</div>
      <Link className="admin-btn admin-btn--secondary" href="/admin/design">Back to the Page Designer</Link>
    </div>
  );
}
