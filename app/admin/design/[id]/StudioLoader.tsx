'use client';
// app/admin/design/[id]/StudioLoader.tsx — read the document, then hand it to the editor.
//
// Two things it has to get right, and both are about not losing work:
//
//   · **A draft beats a save.** If the tab closed mid-edit, the draft is newer than the last
//     explicit save, and opening the saved version would silently discard an afternoon. The draft
//     wins, and the studio says so.
//   · **A missing id is not a crash.** A stale bookmark, a design deleted in another tab, or a
//     different browser all land here; each gets an explanation and a way back rather than a blank
//     screen.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { DesignDocument } from '@/lib/design/document';
import { loadDesign, loadDraft } from '@/lib/design/storage';
import Studio from '../Studio';

export default function StudioLoader() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const [state, setState] = useState<{ doc: DesignDocument | null; recovered: boolean; ready: boolean }>({
    doc: null, recovered: false, ready: false,
  });

  useEffect(() => {
    if (!id) { setState({ doc: null, recovered: false, ready: true }); return; }
    const saved = loadDesign(id);
    const draft = loadDraft(id);
    const useDraft = !!draft && (!saved || draft.updatedAt > saved.updatedAt);
    setState({ doc: useDraft ? draft : saved, recovered: useDraft, ready: true });
  }, [id]);

  if (!state.ready) return <p className="dsx-loading">Opening…</p>;

  if (!state.doc) {
    return (
      <div className="admin-empty" style={{ margin: '2rem auto', maxWidth: 560 }}>
        <div className="admin-empty__icon">🔍</div>
        <div className="admin-empty__title">That design isn’t in this browser</div>
        <div className="admin-empty__desc">
          Designs are stored locally for now, so one made in another browser or on another machine
          will not be here. It may also have been deleted.
        </div>
        <Link className="admin-btn admin-btn--secondary" href="/admin/design">Back to designs</Link>
      </div>
    );
  }

  return (
    <>
      {state.recovered && (
        <p className="dsx-recovered" role="status">
          Recovered unsaved changes from your last session. Press Save to keep them.
        </p>
      )}
      <Studio initial={state.doc} />
    </>
  );
}
