'use client';
// app/admin/components/jobs/JobInstructionsPanel.tsx
//
// C0c of docs/planning/completed/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md
//
// RPLS-authored instructions for a job: what the crew needs to know before they go out. Read by
// anyone on the job, edited by the lead RPLS or an admin.
//
// ── WHY THIS MOVED ──────────────────────────────────────────────────────────────────────────────
//
// It lived as a tab inside the Work Mode field-crew shell, which is being retired (D8). The
// capability is not Work Mode's — it is a property of a JOB, and the job detail page is where every
// other property of a job already lives. It sits on the Field Work tab because that is who the
// instructions are addressed to.
//
// The API it talks to was always job-scoped (`/api/admin/jobs/[id]/instructions`), so nothing about
// the server side changes. Only the shell it was trapped in goes away.
//
// ── THE `job-file:` EMBED IS THE POINT, NOT A FLOURISH ──────────────────────────────────────────
//
// Instructions reference the job's own files — a plat to match, a photo of a monument, a prior
// survey. The route resolves each `[label](job-file:ID)` embed server-side and hands back segments,
// so a link cannot leak a file the caller could not otherwise read. A reference whose file has been
// deleted comes back with `file: null` and renders as a visible "missing" chip rather than a dead
// link or a silent omission — a surveyor needs to know the thing they were told to look at is gone.

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, AlertTriangle } from 'lucide-react';

export interface ResolvedSegment {
  type: 'text' | 'link';
  text?: string;
  label?: string;
  fileId?: string;
  image?: boolean;
  file?: { id: string; name?: string | null; url?: string | null } | null;
}

export default function JobInstructionsPanel({ jobId }: { jobId: string }) {
  const [segments, setSegments] = useState<ResolvedSegment[]>([]);
  const [text, setText] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/instructions`);
      if (!res.ok) throw new Error('load');
      const j = await res.json();
      setSegments((j.segments ?? []) as ResolvedSegment[]);
      setText(j.instructions ?? '');
      setCanEdit(!!j.canEdit);
    } catch {
      setStatus({ ok: false, message: 'Could not load instructions.' });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/instructions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ ok: false, message: j.error ?? 'Could not save.' });
        return;
      }
      const broken = (j.brokenRefs ?? []) as string[];
      // A save that silently dropped a reference would be worse than one that refuses: the crew
      // would be sent to look at something that is not there.
      setStatus(broken.length
        ? { ok: false, message: `Saved — but ${broken.length} linked file${broken.length === 1 ? '' : 's'} no longer exist.` }
        : { ok: true, message: 'Saved.' });
      setEditing(false);
      await load();
    } catch {
      setStatus({ ok: false, message: 'Network error — not saved.' });
    } finally {
      setSaving(false);
    }
  }, [jobId, text, load]);

  return (
    <section style={s.card} aria-labelledby="job-instructions-heading">
      <div style={s.head}>
        <h3 id="job-instructions-heading" style={s.h3}>
          <ClipboardList size={15} strokeWidth={2} aria-hidden /> Job instructions
        </h3>
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} style={s.btnGhost}>Edit</button>
        )}
      </div>

      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : editing ? (
        <div style={s.stack}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            aria-label="Job instructions"
            placeholder="What the crew needs to know. Link a job file with [label](job-file:FILE_ID), or embed an image with ![alt](job-file:FILE_ID)."
            style={s.textarea}
          />
          <div style={s.actions}>
            <button type="button" onClick={save} disabled={saving} style={{ ...s.btn, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setStatus(null); void load(); }} style={s.btnGhost}>
              Cancel
            </button>
          </div>
        </div>
      ) : segments.length === 0 ? (
        <p style={s.muted}>
          No instructions yet{canEdit ? ' — use Edit to add them.' : '.'}
        </p>
      ) : (
        <div style={s.body}>
          {segments.map((seg, i) => {
            if (seg.type === 'text') return <span key={i}>{seg.text}</span>;
            if (!seg.file) {
              return (
                <span key={i} style={s.missing} title="This linked file no longer exists.">
                  <AlertTriangle size={12} strokeWidth={2} aria-hidden /> {seg.label} (missing)
                </span>
              );
            }
            if (seg.image && seg.file.url) {
              // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
              return <img key={i} src={seg.file.url} alt={seg.label ?? ''} style={s.image} />;
            }
            return (
              <a key={i} href={seg.file.url ?? '#'} target="_blank" rel="noopener noreferrer" style={s.link}>
                {seg.label || seg.file.name || 'file'}
              </a>
            );
          })}
        </div>
      )}

      {status && (
        <p role="status" style={{ ...s.status, color: status.ok ? 'var(--theme-success)' : 'var(--theme-danger)' }}>
          {status.message}
        </p>
      )}
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--theme-border, #E2E5EB)',
    borderRadius: 10,
    padding: 16,
    background: 'var(--theme-bg-surface, #FFF)',
    marginBottom: 16,
    display: 'grid',
    gap: 10,
  },
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  h3: { margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: 'var(--theme-fg-primary, #101828)' },
  stack: { display: 'grid', gap: 8 },
  muted: { margin: 0, fontSize: 13, color: 'var(--theme-fg-secondary, #6B7280)' },
  body: { whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, color: 'var(--theme-fg-primary, #101828)' },
  textarea: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--theme-border, #E2E5EB)',
    background: 'var(--theme-bg-surface, #FFF)',
    color: 'var(--theme-fg-primary, #101828)',
    font: 'inherit',
    fontSize: 14,
    resize: 'vertical',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  // Heights from the tokens, per docs/admin-styling-contract.md.
  btn: {
    height: 'var(--button-height, 40px)',
    padding: '0 16px',
    borderRadius: 8,
    border: '1px solid var(--theme-accent, #1F6FEB)',
    background: 'var(--theme-accent, #1F6FEB)',
    color: '#FFF',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  btnGhost: {
    height: 'var(--button-height, 40px)',
    padding: '0 14px',
    borderRadius: 8,
    border: '1px solid var(--theme-border, #E2E5EB)',
    background: 'var(--theme-bg-surface, #FFF)',
    color: 'var(--theme-fg-primary, #101828)',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  link: { color: 'var(--theme-accent, #1F6FEB)', textDecoration: 'underline' },
  missing: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: 'var(--theme-fg-secondary, #6B7280)',
    border: '1px dashed var(--theme-border, #E2E5EB)',
    borderRadius: 4,
    padding: '0 6px',
  },
  image: { display: 'block', maxWidth: '100%', borderRadius: 8, margin: '8px 0' },
  status: { margin: 0, fontSize: 13, fontWeight: 500 },
};
