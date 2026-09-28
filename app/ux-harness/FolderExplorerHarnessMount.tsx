'use client';
// app/ux-harness/FolderExplorerHarnessMount.tsx — the job page's file grid (FolderExplorer), alone.
//
// Registered 2026-09-27 for the owner's delete / multi-select request and the HEIC tiles: the
// screen in question is /admin/jobs/<id> on its Photos folder, and the job page itself needs a job
// row and a dozen APIs to render. The explorer needs only its tree, which a spec supplies through
// page.route — see e2e/harness/job-files-delete.spec.ts.

import FolderExplorer from '@/app/admin/components/files/FolderExplorer';

export const HARNESS_JOB_ID = '11111111-1111-4111-8111-111111111111';

export default function FolderExplorerHarnessMount() {
  return (
    <div style={{ padding: 16 }}>
      <FolderExplorer rootId={`mnt:jobs:${HARNESS_JOB_ID}`} initialFolder="photos" title="24-103 — Harness job" />
    </div>
  );
}
