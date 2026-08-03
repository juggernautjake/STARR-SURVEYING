// app/AndrewAsh/studio/documents/page.tsx — the private vault.
//
// Everything that must NEVER appear on the site: tax forms, the EIN letter, the DBA certificate,
// insurance, session masters, signed agreements. The bucket is private and every link is signed on
// read, which is the difference between this page and Media.
//
// Folders are a path string rather than a table. There is one user, folders exist for HIS memory, and
// a tree of rows buys nothing here except the ability to orphan a subtree.

import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderLock } from 'lucide-react';

import DocumentVault from './DocumentVault';
import { supabaseAdmin } from '@/lib/supabase';
import { signAttachments } from '@/lib/voice/attachments';
import { BASE_PATH } from '@/lib/voice/content';

export const metadata: Metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function DocumentsPage(): Promise<React.ReactElement> {
  let docs: any[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('va_documents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    docs = data ?? [];
  } catch {
    docs = [];
  }

  // Signed on read, per file, expiring in thirty minutes. Failures are per-file: one missing object
  // must not stop the vault listing.
  const signed = await signAttachments(
    docs.map((d) => ({ name: d.title, storage_path: d.storage_path, size_bytes: d.size_bytes, mime_type: d.mime_type })),
  );

  const items = docs.map((d, i) => ({
    id: d.id,
    title: d.title,
    folder: d.folder ?? 'Unfiled',
    category: d.category ?? 'other',
    sizeBytes: d.size_bytes ?? 0,
    createdAt: d.created_at,
    url: signed[i]?.url ?? null,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <>
      <div className="vaStudioHead">
        <div>
          <h1 className="vaStudioTitle">Documents</h1>
          <p className="vaStudioSub">
            Private. Nothing here is ever on the website — tax forms, your EIN letter, the DBA
            certificate, insurance, session masters. The files you will want in a hurry and cannot
            find. See{' '}
            <Link href={`${BASE_PATH}/studio/guide#legal-not-advice`} style={{ color: 'var(--va-accent)' }}>
              the paperwork checklist
            </Link>{' '}
            for what to keep.
          </p>
        </div>
      </div>

      {items.length === 0 && (
        <div className="vaNotice" role="status">
          <strong style={{ color: 'var(--va-accent)' }}>Start with the four that matter</strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            Your EIN confirmation letter (the IRS offers it once, as a download), the stamped DBA
            certificate, a completed W-9 ready to send, and one month of utility bills if you claim the
            home-studio deduction.
          </span>
        </div>
      )}

      <div className="vaPanel">
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">
            <FolderLock size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8, color: 'var(--va-accent)' }} />
            Everything you have filed
          </h2>
          <span className="vaMuted" style={{ fontSize: '0.75rem' }}>{items.length} files · links expire after 30 minutes</span>
        </div>
        <DocumentVault documents={items} />
      </div>
    </>
  );
}
