// app/admin/design/[id]/page.tsx — the editor.
//
// A thin client wrapper, because the document lives in the browser's storage for now (see §22 of
// the plan: the database table is designed and comes next; the document shape is identical either
// way, so that migration is a write path rather than a rewrite).

import type { Metadata } from 'next';
import StudioLoader from './StudioLoader';

export const metadata: Metadata = { title: 'Page Designer' };

export default function DesignEditorPage() {
  return <StudioLoader />;
}
