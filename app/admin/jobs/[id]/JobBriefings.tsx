// app/admin/jobs/[id]/JobBriefings.tsx — slices B4, B5, B6 and B7 of
// docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md
//
// Owner, 2026-08-13: *"Once he has compiled his notes and instructions and stuff, he can post it and
// make it so that all of the people involved in the job can see it. He will also be able to add more
// stuff later, like files and pictures and notes/instructions if needed."*
//
// ── ONE PANEL, TWO AUDIENCES ────────────────────────────────────────────────────────────────────
//
// The author sees a workbench: record, write, attach, post. Everyone else sees a post: watch it,
// read it, open the attachments. They are the same component because they are the same object, and
// splitting them is how the reader's view quietly loses the thing that was added on Tuesday.
//
// What separates them is authorship, not role — `author_email === me`. A draft is not listed for
// anyone else at all (the API filters it), so there is no state where a reader sees an edit control
// for something they cannot change.
//
// ── WHY "START A BRIEFING" MUST EXIST BEFORE THE RECORDING ──────────────────────────────────────
//
// The upload files bytes under a briefing id, so the draft has to exist first. That makes the first
// button look like it does nothing — it creates an empty draft — which is why it says what it did.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Megaphone, Plus, Send, Loader2, Trash2, Paperclip, StickyNote, Image as ImageIcon,
  FileText, Video as VideoIcon, X, AlertTriangle, Pencil, Check,
} from 'lucide-react';
import BriefingRecorder, { type RecordedTake } from './BriefingRecorder';
import { uploadBriefingItem, UploadAborted } from '@/lib/jobs/briefing-upload';
import { formatBytes, formatDuration } from '@/lib/jobs/recorder';

export interface BriefingItem {
  id: string;
  kind: 'video' | 'photo' | 'file' | 'note';
  job_file_id: string | null;
  note_text: string | null;
  duration_seconds: number | null;
  added_by: string;
  added_at: string;
  sort_order: number;
  file_name: string | null;
  file_size_bytes: number | null;
  content_type: string | null;
  /** Signed by the API. Null when the bytes are gone, which `missing` says out loud. */
  url: string | null;
  missing: boolean;
}

export interface Briefing {
  id: string;
  job_id: string;
  author_email: string;
  title: string | null;
  body: string | null;
  state: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  items: BriefingItem[];
}

interface JobFileLite { id: string; file_name: string; section?: string }

interface Props {
  jobId: string;
  jobNumber?: string | null;
  /** The signed-in address. Decides workbench vs post — see the header. */
  selfEmail?: string | null;
  /** The job's files, offered as `[label](job-file:<id>)` embeds in the notes, exactly as the
   *  Instructions tab does. One embed syntax for the whole product. */
  files: readonly JobFileLite[];
  /** Deep link from a notification: `?briefing=<id>` opens that one expanded. */
  focusBriefingId?: string | null;
}

interface Uploading {
  key: string;
  label: string;
  fraction: number;
  bytes: number;
  error?: string;
  controller: AbortController;
}

export default function JobBriefings({ jobId, jobNumber, selfEmail, files, focusBriefingId }: Props) {
  const [briefings, setBriefings] = useState<Briefing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [uploads, setUploads] = useState<Uploading[]>([]);
  /** Which briefing has its notes open for editing, and the working text. */
  const [editing, setEditing] = useState<{ id: string; title: string; body: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{ id: string; kind: 'photo' | 'file' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/briefings`);
      const json = (await res.json()) as { briefings?: Briefing[]; error?: string };
      if (!res.ok) throw new Error(json.error || `Could not load the briefings (HTTP ${res.status}).`);
      setBriefings(json.briefings ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  // Open the one a notification pointed at. Done once the list has arrived rather than on mount,
  // because the id means nothing until there is a row to expand.
  useEffect(() => {
    if (focusBriefingId && briefings?.some((b) => b.id === focusBriefingId)) {
      setExpanded((s) => new Set(s).add(focusBriefingId));
    }
  }, [focusBriefingId, briefings]);

  // A draft is somebody's unfinished work — always open, because the whole point of the panel for
  // its author is that it is the workbench.
  useEffect(() => {
    if (!briefings) return;
    const drafts = briefings.filter((b) => b.state === 'draft').map((b) => b.id);
    if (drafts.length) setExpanded((s) => { const n = new Set(s); drafts.forEach((d) => n.add(d)); return n; });
  }, [briefings]);

  const isAuthor = useCallback(
    (b: Briefing) => Boolean(selfEmail && b.author_email.toLowerCase() === selfEmail.toLowerCase()),
    [selfEmail],
  );

  const startDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/briefings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      });
      const json = (await res.json()) as { briefing?: Briefing; error?: string };
      if (!res.ok || !json.briefing) throw new Error(json.error || `Could not start a briefing (HTTP ${res.status}).`);
      await load();
      setExpanded((s) => new Set(s).add(json.briefing!.id));
      setEditing({ id: json.briefing.id, title: '', body: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/briefings/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editing.title, body: editing.body }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Save failed (HTTP ${res.status}).`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const publish = async (b: Briefing) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/briefings/${b.id}/publish`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as { error?: string; notified?: number };
      if (!res.ok) throw new Error(json.error || `Could not post the briefing (HTTP ${res.status}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeBriefing = async (b: Briefing) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/briefings/${b.id}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not delete the draft (HTTP ${res.status}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (b: Briefing, item: BriefingItem) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/jobs/${jobId}/briefings/${b.id}/items?itemId=${encodeURIComponent(item.id)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not remove that (HTTP ${res.status}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async (b: Briefing) => {
    const text = (noteDraft[b.id] ?? '').trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/briefings/${b.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'note', noteText: text, sortOrder: b.items.length }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Could not add the note (HTTP ${res.status}).`);
      setNoteDraft((d) => ({ ...d, [b.id]: '' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** The shared upload path: a kept recording, a picked photo, a picked file. All three are the same
   *  three steps (sign → PUT → register) and differ only in what they are called. */
  const upload = useCallback(async (
    briefingId: string,
    kind: 'video' | 'photo' | 'file',
    blob: Blob,
    fileName: string,
    durationSeconds?: number,
  ) => {
    const key = `${briefingId}:${fileName}:${blob.size}`;
    const controller = new AbortController();
    setUploads((u) => [...u, { key, label: fileName, fraction: 0, bytes: blob.size, controller }]);
    try {
      await uploadBriefingItem({
        jobId, briefingId, kind, blob, fileName, durationSeconds,
        signal: controller.signal,
        onProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, fraction: p.fraction } : x))),
      });
      setUploads((u) => u.filter((x) => x.key !== key));
      await load();
    } catch (e) {
      if (e instanceof UploadAborted) {
        setUploads((u) => u.filter((x) => x.key !== key));
        return;
      }
      // Kept on screen rather than cleared: the retry button is the whole point of showing the
      // failure, and a toast that vanishes takes the retry with it.
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, error: e instanceof Error ? e.message : String(e) } : x)));
    }
  }, [jobId, load]);

  const onPickedFiles = async (list: FileList | null) => {
    const target = pickerTarget;
    setPickerTarget(null);
    if (!list || !target) return;
    for (const f of Array.from(list)) {
      await upload(target.id, target.kind, f, f.name);
    }
  };

  const keepTake = useCallback((briefingId: string) => (take: RecordedTake) => {
    void upload(briefingId, 'video', take.blob, take.fileName, take.durationSeconds);
  }, [upload]);

  const sorted = useMemo(
    () => (briefings ?? []).slice().sort((a, b) => {
      // Drafts first — they are the author's to-do — then published, newest first.
      if (a.state !== b.state) return a.state === 'draft' ? -1 : 1;
      return (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);
    }),
    [briefings],
  );

  if (briefings === null && !error) {
    return <p style={mutedStyle}>Loading briefings…</p>;
  }

  const myDraft = sorted.find((b) => b.state === 'draft' && isAuthor(b));

  return (
    <div className="job-detail__section">
      <h3><Megaphone size={15} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />Briefings</h3>
      <p className="job-detail__section-desc">
        Record your screen while talking through the job, write the notes that go with it, attach the
        files and photos, and post it when it is ready. Everyone on the job is told once, and can
        watch it whenever they get to it. You can add to it later without shouting at them again.
      </p>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {!myDraft && (
        <button type="button" style={primaryBtn} disabled={busy} onClick={() => void startDraft()}>
          {busy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
          Start a briefing
        </button>
      )}

      {/* One hidden input, retargeted. Two inputs (photos, files) would need two refs and two
          handlers to do the same job. */}
      <input
        ref={filePickerRef}
        type="file"
        multiple
        accept={pickerTarget?.kind === 'photo' ? 'image/*' : undefined}
        style={{ display: 'none' }}
        onChange={(e) => { void onPickedFiles(e.target.files); e.target.value = ''; }}
      />

      {sorted.length === 0 && (
        <p style={mutedStyle}>
          No briefings yet. A briefing is the way to hand somebody the whole picture of a job without
          being on the phone at the same time.
        </p>
      )}

      {sorted.map((b) => {
        const mine = isAuthor(b);
        const open = expanded.has(b.id);
        const draft = b.state === 'draft';
        const myUploads = uploads.filter((u) => u.key.startsWith(`${b.id}:`));
        return (
          <div key={b.id} style={{ ...cardStyle, borderLeft: draft ? '4px solid var(--color-warning)' : undefined }}>
            <div
              style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap', cursor: 'pointer' }}
              onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; }); } }}
            >
              <strong style={{ fontSize: '0.95rem' }}>{b.title?.trim() || (draft ? 'Untitled draft' : 'Untitled briefing')}</strong>
              <span style={badgeStyle(b.state)}>{draft ? 'Draft — only you can see it' : 'Posted'}</span>
              <span style={mutedInline}>
                {b.author_email}
                {b.published_at ? ` · posted ${fmt(b.published_at)}` : ` · started ${fmt(b.created_at)}`}
                {b.items.length > 0 && ` · ${summarise(b.items)}`}
              </span>
            </div>

            {open && (
              <div style={{ marginTop: '0.75rem' }}>
                {/* ── the notes ── */}
                {editing?.id === b.id ? (
                  <div style={{ marginBottom: '0.8rem' }}>
                    <label style={fieldStyle}>
                      <span style={labelStyle}>Title</span>
                      <input
                        style={inputStyle}
                        value={editing.title}
                        autoFocus
                        placeholder="Walkthrough — Hensley tract boundary"
                        onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      />
                    </label>
                    <label style={{ ...fieldStyle, marginTop: '0.5rem' }}>
                      <span style={labelStyle}>Notes and instructions</span>
                      <textarea
                        style={textareaStyle}
                        rows={8}
                        value={editing.body}
                        placeholder={'What you want them to know. Attach a file below and it travels with the note rather than being described.'}
                        onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      />
                    </label>
                    {files.length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={pickerLabelStyle}>
                          <Paperclip size={12} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
                          Link a file from this job into the notes
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {files.slice(0, 24).map((f) => (
                            <button
                              key={f.id} type="button" style={chipStyle}
                              title={`Insert a link to ${f.file_name}`}
                              onClick={() => setEditing((cur) => cur && ({
                                ...cur,
                                body: `${cur.body}${cur.body && !cur.body.endsWith('\n') ? '\n' : ''}`
                                  + `[${f.file_name.replace(/\.[a-z0-9]+$/i, '')}](job-file:${f.id})\n`,
                              }))}
                            >
                              {f.file_name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                      <button type="button" style={primaryBtn} disabled={busy} onClick={() => void saveNotes()}>
                        <Check size={13} />Save notes
                      </button>
                      <button type="button" style={ghostBtn} disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {b.body?.trim() && <div style={bodyStyle}>{renderBody(b.body, files)}</div>}
                    {mine && (
                      <button
                        type="button" style={{ ...ghostBtn, marginBottom: '0.7rem' }}
                        onClick={() => setEditing({ id: b.id, title: b.title ?? '', body: b.body ?? '' })}
                      >
                        <Pencil size={13} />{b.body?.trim() ? 'Edit the notes' : 'Write the notes'}
                      </button>
                    )}
                  </>
                )}

                {/* ── what is in it (B7) ── */}
                {b.items.map((item) => (
                  <BriefingItemView
                    key={item.id}
                    item={item}
                    canRemove={mine}
                    onRemove={() => void removeItem(b, item)}
                  />
                ))}

                {/* ── uploads in flight (B3) ── */}
                {myUploads.map((u) => (
                  <div key={u.key} style={{ ...itemStyle, background: 'var(--color-bg-subtle)' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <VideoIcon size={14} />
                      <span style={{ fontSize: '0.83rem' }}>{u.label}</span>
                      <span style={mutedInline}>{formatBytes(u.bytes)}</span>
                      {!u.error && (
                        <button type="button" style={ghostBtn} onClick={() => u.controller.abort()}>
                          <X size={12} />Cancel
                        </button>
                      )}
                    </div>
                    {u.error ? (
                      <p className="admin-error" role="alert" style={{ marginBottom: 0 }}>
                        {u.error}{' '}
                        <button type="button" style={{ ...ghostBtn, marginLeft: '0.4rem' }}
                          onClick={() => setUploads((cur) => cur.filter((x) => x.key !== u.key))}>
                          Dismiss
                        </button>
                      </p>
                    ) : (
                      <div style={barTrack} aria-label={`Uploading ${u.label}`} role="progressbar"
                        aria-valuenow={Math.round(u.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
                        <div style={{ ...barFill, width: `${Math.round(u.fraction * 100)}%` }} />
                      </div>
                    )}
                  </div>
                ))}

                {/* ── the workbench (B4/B6) ── */}
                {mine && (
                  <div style={{ marginTop: '0.8rem', paddingTop: '0.7rem', borderTop: '1px solid var(--color-border)' }}>
                    <BriefingRecorder jobNumber={jobNumber} onKeep={keepTake(b.id)} disabled={busy} />

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                      <button type="button" style={ghostBtn}
                        onClick={() => { setPickerTarget({ id: b.id, kind: 'photo' }); setTimeout(() => filePickerRef.current?.click(), 0); }}>
                        <ImageIcon size={13} />Add photos
                      </button>
                      <button type="button" style={ghostBtn}
                        onClick={() => { setPickerTarget({ id: b.id, kind: 'file' }); setTimeout(() => filePickerRef.current?.click(), 0); }}>
                        <Paperclip size={13} />Add files
                      </button>
                    </div>

                    <div style={{ marginTop: '0.7rem' }}>
                      <label style={fieldStyle}>
                        <span style={labelStyle}>Add a note</span>
                        <textarea
                          style={{ ...textareaStyle, minHeight: 60 }} rows={2}
                          value={noteDraft[b.id] ?? ''}
                          placeholder="One more thing…"
                          onChange={(e) => setNoteDraft((d) => ({ ...d, [b.id]: e.target.value }))}
                        />
                      </label>
                      <button type="button" style={ghostBtn} disabled={busy || !(noteDraft[b.id] ?? '').trim()}
                        onClick={() => void addNote(b)}>
                        <StickyNote size={13} />Add the note
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {draft ? (
                        <>
                          <button type="button" style={primaryBtn} disabled={busy || myUploads.length > 0}
                            onClick={() => void publish(b)}>
                            <Send size={13} />Post it to the job
                          </button>
                          <button type="button" style={ghostBtn} disabled={busy} onClick={() => void removeBriefing(b)}>
                            <Trash2 size={13} />Delete this draft
                          </button>
                          <span style={mutedInline}>
                            {myUploads.length > 0
                              ? 'Wait for the upload to finish — posting now would announce a briefing without its recording.'
                              : 'Posting tells everyone on this job, once.'}
                          </span>
                        </>
                      ) : (
                        <span style={mutedInline}>
                          Posted. Anything you add now sends a quieter “added to the briefing” note rather
                          than announcing it again.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One item, rendered as what it is. A video is a player; a photo is a picture; a file is a link;
 *  a note is text. Rendering all four as "attachment" is how a briefing becomes a list of names. */
function BriefingItemView({ item, canRemove, onRemove }: {
  item: BriefingItem; canRemove: boolean; onRemove: () => void;
}) {
  const remove = canRemove ? (
    <button type="button" style={{ ...ghostBtn, padding: '0.2rem 0.5rem' }} onClick={onRemove} title="Remove from the briefing">
      <X size={12} />
    </button>
  ) : null;

  if (item.kind === 'note') {
    return (
      <div style={itemStyle}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <StickyNote size={14} style={{ marginTop: 3, flexShrink: 0 }} />
          <div style={{ flex: 1, whiteSpace: 'pre-wrap', fontSize: '0.87rem', lineHeight: 1.55 }}>{item.note_text}</div>
          {remove}
        </div>
        <div style={{ ...mutedInline, marginTop: '0.3rem' }}>{item.added_by} · {fmt(item.added_at)}</div>
      </div>
    );
  }

  if (item.missing || !item.url) {
    return (
      <div style={{ ...itemStyle, borderLeft: '4px solid var(--color-warning)' }} role="alert">
        <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
        <strong>{item.file_name ?? 'An attachment'}</strong> is no longer in storage. It was added by{' '}
        {item.added_by} on {fmt(item.added_at)} — re-upload it if it still matters. {remove}
      </div>
    );
  }

  if (item.kind === 'video') {
    return (
      <div style={itemStyle}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <VideoIcon size={14} />
          <strong style={{ fontSize: '0.85rem' }}>{item.file_name}</strong>
          <span style={mutedInline}>
            {item.duration_seconds ? formatDuration(item.duration_seconds) : ''}
            {item.file_size_bytes ? ` · ${formatBytes(item.file_size_bytes)}` : ''}
          </span>
          {remove}
        </div>
        {/* `preload="metadata"`: a crew member opening a job on cellular must not start pulling
            120 MB because the tab rendered. */}
        <video src={item.url} controls preload="metadata" playsInline style={videoStyle} />
        <div style={{ ...mutedInline, marginTop: '0.3rem' }}>{item.added_by} · {fmt(item.added_at)}</div>
      </div>
    );
  }

  if (item.kind === 'photo') {
    return (
      <div style={itemStyle}>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          <img src={item.url} alt={item.file_name ?? 'Briefing photo'} style={photoStyle} />
        </a>
        <div style={{ ...mutedInline, marginTop: '0.3rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span>{item.file_name} · {item.added_by} · {fmt(item.added_at)}</span>
          {remove}
        </div>
      </div>
    );
  }

  return (
    <div style={itemStyle}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <FileText size={14} />
        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.87rem' }}>
          {item.file_name}
        </a>
        <span style={mutedInline}>
          {item.file_size_bytes ? formatBytes(item.file_size_bytes) : ''} · {item.added_by} · {fmt(item.added_at)}
        </span>
        {remove}
      </div>
    </div>
  );
}

/**
 * Render the notes, turning `[label](job-file:<id>)` into a link to the job's file.
 *
 * The same embed syntax as `jobs.instructions`, resolved the same way, because a person writing
 * both should not have to remember which screen supports which. A reference to a file that is no
 * longer on the job renders as the plain label with a mark — it fails visibly rather than as a dead
 * link.
 */
function renderBody(body: string, files: readonly JobFileLite[]): React.ReactNode {
  const byId = new Map(files.map((f) => [f.id, f]));
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]*)\]\(job-file:([0-9a-fA-F-]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    const file = byId.get(m[2]!);
    parts.push(
      file
        ? <a key={`f${key++}`} href={`/admin/jobs?file=${m[2]}`} title={file.file_name}>{m[1] || file.file_name}</a>
        : <span key={`f${key++}`} style={{ textDecoration: 'line-through', color: 'var(--color-warning-text)' }} title="This file is no longer on the job">{m[1]}</span>,
    );
    last = re.lastIndex;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

/** "1 recording, 3 photos, 2 notes" — what is in it, without opening it. */
function summarise(items: readonly BriefingItem[]): string {
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  const label: Record<string, [string, string]> = {
    video: ['recording', 'recordings'], photo: ['photo', 'photos'],
    file: ['file', 'files'], note: ['note', 'notes'],
  };
  return (['video', 'photo', 'file', 'note'] as const)
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${label[k]![counts[k] === 1 ? 0 : 1]}`)
    .join(', ');
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

function badgeStyle(state: string): React.CSSProperties {
  const tone = state === 'draft'
    ? { fg: 'var(--color-warning-text)', bg: 'var(--color-warning-surface)' }
    : { fg: 'var(--color-success-text)', bg: 'var(--color-success-surface)' };
  return {
    fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: 999, color: tone.fg, background: tone.bg, whiteSpace: 'nowrap',
  };
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 8,
  padding: '0.75rem 0.9rem', marginTop: '0.7rem', background: 'var(--color-surface)',
};
const itemStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 6,
  padding: '0.55rem 0.7rem', marginTop: '0.5rem', background: 'var(--color-bg-subtle)',
};
const bodyStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.6,
  color: 'var(--color-text-primary)', marginBottom: '0.7rem',
};
const videoStyle: React.CSSProperties = {
  display: 'block', width: '100%', maxHeight: 460, borderRadius: 6, background: '#000',
};
const photoStyle: React.CSSProperties = {
  display: 'block', maxWidth: '100%', maxHeight: 300, borderRadius: 6,
};
const barTrack: React.CSSProperties = {
  height: 6, borderRadius: 999, background: 'var(--color-border)', marginTop: '0.45rem', overflow: 'hidden',
};
const barFill: React.CSSProperties = {
  height: '100%', background: 'var(--color-brand-navy)', transition: 'width 0.2s linear',
};
const fieldStyle: React.CSSProperties = { display: 'block' };
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)', marginBottom: '0.2rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.5rem', borderRadius: 6,
  border: '1px solid var(--color-border)', background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
};
const textareaStyle: React.CSSProperties = { ...inputStyle, lineHeight: 1.55, resize: 'vertical' };
const pickerLabelStyle: React.CSSProperties = {
  fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--color-text-secondary)', marginBottom: '0.3rem',
};
const chipStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', borderRadius: 999, padding: '0.22rem 0.6rem',
  fontSize: '0.76rem', cursor: 'pointer', maxWidth: '100%', overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  border: '1px solid var(--color-brand-navy)', background: 'var(--color-brand-navy)',
  color: 'var(--color-text-on-brand)', borderRadius: 6, padding: '0.4rem 0.9rem',
  fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
  color: 'var(--color-text-primary)', borderRadius: 6, padding: '0.35rem 0.75rem',
  fontSize: '0.82rem', cursor: 'pointer',
};
const mutedStyle: React.CSSProperties = { fontSize: '0.85rem', color: 'var(--color-text-tertiary)' };
const mutedInline: React.CSSProperties = { fontSize: '0.77rem', color: 'var(--color-text-tertiary)' };
