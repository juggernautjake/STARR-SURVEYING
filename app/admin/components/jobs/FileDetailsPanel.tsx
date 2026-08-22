// app/admin/components/jobs/FileDetailsPanel.tsx — what a file is called, how it is tagged, and
// what people have said about it.
//
// Owner, 2026-08-22: *"I need to be able to name them and write notes for them too that people can
// review at a later time."*
//
// Lives beside the media in the viewer rather than in a separate dialog, because every one of these
// edits is made WHILE looking at the file. A rename box that requires closing the video first is a
// rename box people use once.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Check, Loader2, Pencil, Send, Trash2, X } from 'lucide-react';
import { MAX_TAGS_PER_FILE, normalizeTag, parseTags } from '@/lib/files/labels';
import { authorLabel, canDeleteComment, canEditComment, MAX_COMMENT_LENGTH } from '@/lib/files/comments';

export interface DetailsFile {
  id: string;
  file_name: string;
  label?: string | null;
  tags?: string[] | null;
  description?: string | null;
  file_size?: number | null;
  file_size_bytes?: number | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
}

interface Comment {
  id: string;
  body: string;
  author_email: string;
  author_name?: string | null;
  created_at: string;
  edited_at?: string | null;
}

function formatBytes(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function FileDetailsPanel({
  file,
  onPatched,
}: {
  file: DetailsFile;
  /** The updated row, so the list behind the viewer renames itself without a refetch. */
  onPatched?: (patch: Partial<DetailsFile>) => void;
}) {
  const { data: session } = useSession();
  const me = {
    email: session?.user?.email ?? '',
    isAdmin: (session?.user as { roles?: string[] } | undefined)?.roles?.includes('admin') ?? false,
  };

  // ── Label ────────────────────────────────────────────────────────────────────────────────────
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(file.label ?? '');
  const [savingLabel, setSavingLabel] = useState(false);

  // ── Tags ─────────────────────────────────────────────────────────────────────────────────────
  const [tagDraft, setTagDraft] = useState('');
  const [tags, setTags] = useState<string[]>(file.tags ?? []);

  // ── Notes ────────────────────────────────────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);

  // Re-seed every local draft when the viewer steps to a different file. Without this, paging from
  // one photo to the next carries the previous file's half-typed note across — and the person then
  // posts it against the wrong photo without noticing.
  useEffect(() => {
    setLabelDraft(file.label ?? '');
    setEditingLabel(false);
    setTags(file.tags ?? []);
    setTagDraft('');
    setDraft('');
    setEditingId(null);
    setError(null);
  }, [file.id, file.label, file.tags]);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/admin/files/comments?subject_type=job_file&subject_id=${file.id}`);
      const body = await res.json().catch(() => ({}));
      setComments(res.ok ? (body.comments ?? []) : []);
    } catch {
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [file.id]);

  useEffect(() => { void loadComments(); }, [loadComments]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    const res = await fetch(`/api/admin/jobs/files/${file.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? 'That did not save.');
      return false;
    }
    onPatched?.(json.file ?? body);
    return true;
  }

  async function saveLabel() {
    setSavingLabel(true);
    // An empty box CLEARS the rename rather than erroring, so the uploaded name comes back — see
    // `checkLabel`. Sending `null` rather than `''` says that explicitly.
    const ok = await patch({ label: labelDraft.trim() ? labelDraft : null });
    setSavingLabel(false);
    if (ok) setEditingLabel(false);
  }

  async function commitTags(next: string[]) {
    const before = tags;
    setTags(next);                                     // optimistic: chips must feel instant
    const ok = await patch({ tags: next });
    if (!ok) setTags(before);                          // and must not lie when the save failed
  }

  function addTag() {
    const tag = normalizeTag(tagDraft);
    if (!tag) { setTagDraft(''); return; }
    if (tags.includes(tag)) { setTagDraft(''); return; }
    if (tags.length >= MAX_TAGS_PER_FILE) {
      setError(`Up to ${MAX_TAGS_PER_FILE} tags on one file.`);
      return;
    }
    setTagDraft('');
    void commitTags([...tags, tag]);
  }

  async function postComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/files/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_type: 'job_file', subject_id: file.id, body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'That note did not save.'); return; }
      setComments((c) => [...c, json.comment]);
      setDraft('');
      // Scroll only after the new note is in the DOM, or this lands on the previous last note.
      requestAnimationFrame(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    const res = await fetch(`/api/admin/files/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? 'That edit did not save.'); return; }
    setComments((c) => c.map((x) => (x.id === id ? json.comment : x)));
    setEditingId(null);
  }

  async function removeComment(id: string) {
    // No `confirm()` — a browser dialog blocks the whole page and the note is soft-deleted, not
    // destroyed. The row simply disappears from the thread.
    const res = await fetch(`/api/admin/files/comments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? 'That note could not be removed.');
      return;
    }
    setComments((c) => c.filter((x) => x.id !== id));
  }

  const size = formatBytes(file.file_size ?? file.file_size_bytes);

  return (
    <aside className="file-details" aria-label="File details and notes">
      {/* ── Name ─────────────────────────────────────────────────────────────────────────────── */}
      <section className="file-details__section">
        <h4 className="file-details__heading">Name</h4>
        {editingLabel ? (
          <div className="file-details__label-edit">
            <input
              className="file-details__input"
              value={labelDraft}
              autoFocus
              placeholder={file.file_name}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                // stopPropagation everywhere in this panel: the viewer listens for +/-/0/arrows on
                // the window, and typing "0" in a name box must not reset the zoom behind it.
                e.stopPropagation();
                if (e.key === 'Enter') void saveLabel();
                if (e.key === 'Escape') { setLabelDraft(file.label ?? ''); setEditingLabel(false); }
              }}
              maxLength={120}
            />
            <button className="file-details__icon-btn" onClick={() => void saveLabel()} disabled={savingLabel} title="Save name">
              {savingLabel ? <Loader2 size={15} className="file-details__spin" /> : <Check size={15} />}
            </button>
            <button
              className="file-details__icon-btn"
              onClick={() => { setLabelDraft(file.label ?? ''); setEditingLabel(false); }}
              title="Cancel"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button className="file-details__label-show" onClick={() => setEditingLabel(true)} title="Rename this file">
            <span className={file.label ? 'file-details__label' : 'file-details__label file-details__label--unset'}>
              {file.label || file.file_name}
            </span>
            <Pencil size={13} />
          </button>
        )}
        {/* Shown only once a label exists, so the person can still find the file their phone made. */}
        {file.label && <p className="file-details__original">Uploaded as {file.file_name}</p>}
      </section>

      {/* ── Tags ─────────────────────────────────────────────────────────────────────────────── */}
      <section className="file-details__section">
        <h4 className="file-details__heading">Tags</h4>
        <div className="file-details__tags">
          {tags.map((tag) => (
            <span key={tag} className="file-details__tag">
              {tag}
              <button
                className="file-details__tag-x"
                onClick={() => void commitTags(tags.filter((t) => t !== tag))}
                title={`Remove "${tag}"`}
                aria-label={`Remove tag ${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {tags.length < MAX_TAGS_PER_FILE && (
            <input
              className="file-details__tag-input"
              value={tagDraft}
              placeholder="Add tag…"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                // Comma as well as Enter: people type "monument, access" as one habit.
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
                if (e.key === 'Backspace' && !tagDraft && tags.length) {
                  void commitTags(tags.slice(0, -1));
                }
              }}
              onBlur={addTag}
              maxLength={32}
            />
          )}
        </div>
      </section>

      {/* ── Facts nobody should have to leave the viewer to see ──────────────────────────────── */}
      <section className="file-details__section file-details__facts">
        {size && <span>{size}</span>}
        {file.uploaded_by && <span>Added by {file.uploaded_by.split('@')[0]}</span>}
        {file.uploaded_at && <span>{formatWhen(file.uploaded_at)}</span>}
      </section>

      {/* ── Notes ────────────────────────────────────────────────────────────────────────────── */}
      <section className="file-details__section file-details__thread-section">
        <h4 className="file-details__heading">
          Notes {comments.length > 0 && <span className="file-details__count">{comments.length}</span>}
        </h4>

        <div className="file-details__thread">
          {loadingComments ? (
            <p className="file-details__muted">Loading notes…</p>
          ) : comments.length === 0 ? (
            <p className="file-details__muted">No notes yet. Write what this shows, so it still makes sense later.</p>
          ) : (
            comments.map((c) => (
              <article key={c.id} className="file-details__note">
                <header className="file-details__note-head">
                  <strong>{authorLabel(c)}</strong>
                  <span>{formatWhen(c.created_at)}</span>
                  {c.edited_at && <span className="file-details__edited">edited</span>}
                </header>

                {editingId === c.id ? (
                  <div className="file-details__note-edit">
                    <textarea
                      className="file-details__textarea"
                      value={editDraft}
                      autoFocus
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Escape') setEditingId(null);
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveEdit(c.id);
                      }}
                      maxLength={MAX_COMMENT_LENGTH}
                      rows={3}
                    />
                    <div className="file-details__note-actions">
                      <button className="file-details__btn" onClick={() => void saveEdit(c.id)}>Save</button>
                      <button className="file-details__btn file-details__btn--ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* `white-space: pre-wrap` in the stylesheet — the line breaks somebody typed
                        while listing three monuments are part of what they wrote. */}
                    <p className="file-details__note-body">{c.body}</p>
                    <div className="file-details__note-actions">
                      {canEditComment(c, me) && (
                        <button
                          className="file-details__note-action"
                          onClick={() => { setEditingId(c.id); setEditDraft(c.body); }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      )}
                      {canDeleteComment(c, me) && (
                        <button className="file-details__note-action" onClick={() => void removeComment(c.id)}>
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))
          )}
          <div ref={threadEndRef} />
        </div>

        <div className="file-details__composer">
          <textarea
            className="file-details__textarea"
            value={draft}
            placeholder="Write a note…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              // Ctrl/Cmd+Enter sends; plain Enter makes a new line. A note here is often three
              // lines about three monuments, and Enter-to-send would post the first one alone.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void postComment(); }
            }}
            maxLength={MAX_COMMENT_LENGTH}
            rows={2}
          />
          <button
            className="file-details__send"
            onClick={() => void postComment()}
            disabled={posting || !draft.trim()}
            title="Add note (Ctrl+Enter)"
          >
            {posting ? <Loader2 size={15} className="file-details__spin" /> : <Send size={15} />}
          </button>
        </div>
      </section>

      {error && <p className="file-details__error" role="alert">{error}</p>}
    </aside>
  );
}

/** Exported for the list view, which shows the same chips without the editor. */
export { parseTags };
