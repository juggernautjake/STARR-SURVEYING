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
import { loadDraft } from '@/lib/design/storage';
import { fetchDesign } from '@/lib/design/client';
import Studio from '../Studio';

export default function StudioLoader() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const [state, setState] = useState<{ doc: DesignDocument | null; recovered: boolean; ready: boolean; offline: boolean }>({
    doc: null, recovered: false, ready: false, offline: false,
  });

  useEffect(() => {
    if (!id) { setState({ doc: null, recovered: false, ready: true, offline: false }); return; }
    let live = true;
    (async () => {
      // The server's copy is the one other machines can see; the draft is the one that might be
      // NEWER. Comparing them by `updatedAt` is what stops "opened it on the laptop" from quietly
      // reverting an afternoon of work that never got an explicit save.
      const { value: saved, offline } = await fetchDesign(id);
      const draft = loadDraft(id);
      const useDraft = !!draft && (!saved || draft.updatedAt > saved.updatedAt);
      if (!live) return;
      setState({ doc: useDraft ? draft : saved, recovered: useDraft, ready: true, offline });
    })();
    return () => { live = false; };
  }, [id]);

  if (!state.ready) return <p className="dsx-loading">Opening…</p>;

  if (!state.doc) {
    return (
      <div className="admin-empty" style={{ margin: '2rem auto', maxWidth: 560 }}>
        <div className="admin-empty__icon">🔍</div>
        <div className="admin-empty__title">That design could not be opened</div>
        <div className="admin-empty__desc">
          {state.offline
            ? 'The server could not be reached, and there is no copy of this design in this browser.'
            : 'It has been deleted, or the link is to an id that never existed.'}
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
