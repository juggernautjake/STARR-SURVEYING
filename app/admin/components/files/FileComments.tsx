'use client';
// app/admin/components/files/FileComments.tsx — the threaded notes on a file (`file_comments`), shown
// in the shared viewer's details panel for the surfaces that have a thread (job files, field media).
// The single "Notes" field above it is the file's own description; this is the conversation.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Loader2, Send, Trash2 } from 'lucide-react';
import { formatWhen } from './format';

interface Comment {
  id: string;
  body: string;
  author_email: string;
  author_name?: string | null;
  created_at: string;
  edited_at?: string | null;
}

export default function FileComments({ subjectType, subjectId }: { subjectType: 'job_file' | 'field_media'; subjectId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/files/comments?subject_type=${subjectType}&subject_id=${subjectId}`);
      const body = await res.json().catch(() => ({}));
      setComments(res.ok ? (body.comments ?? []) : []);
    } catch { setComments([]); } finally { setLoading(false); }
  }, [subjectType, subjectId]);
  useEffect(() => { void load(); }, [load]);

  const post = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true); setError(null);
    try {
      const res = await fetch('/api/admin/files/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, body }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'That note did not save.'); return; }
      setComments((c) => [...c, json.comment]);
      setDraft('');
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } finally { setPosting(false); }
  };
  const remove = async (id: string) => {
    const res = await fetch(`/api/admin/files/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error ?? 'That note could not be removed.'); return; }
    setComments((c) => c.filter((x) => x.id !== id));
  };

  return (
    <div className="fv-comments">
      <h3 className="fv-info__h"><MessageSquare size={13} aria-hidden="true" /> Thread</h3>
      {loading ? <p className="fv-info__busy"><Loader2 size={13} className="fv-spin motion-essential" aria-hidden="true" /> Loading notes…</p> : null}
      {!loading && comments.length === 0 ? <p className="fv-info__ro">No notes in the thread yet.</p> : null}
      <ul className="fv-comments__list">
        {comments.map((c) => (
          <li key={c.id} className="fv-comment">
            <div className="fv-comment__head">
              <strong>{c.author_name || c.author_email}</strong>
              <span>{formatWhen(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
              <button type="button" className="fv-comment__x" onClick={() => void remove(c.id)} aria-label="Remove note" title="Remove"><Trash2 size={12} aria-hidden="true" /></button>
            </div>
            <p className="fv-comment__body">{c.body}</p>
          </li>
        ))}
        <div ref={endRef} />
      </ul>
      <div className="fv-comments__compose">
        <textarea className="fv-info__notes" rows={2} placeholder="Add a note to the thread…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void post(); }} />
        <button type="button" className="fv-btn" onClick={() => void post()} disabled={posting || !draft.trim()}>
          {posting ? <Loader2 size={14} className="fv-spin motion-essential" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />} Post
        </button>
      </div>
      {error ? <p className="fv-info__error" role="alert">{error}</p> : null}
    </div>
  );
}
