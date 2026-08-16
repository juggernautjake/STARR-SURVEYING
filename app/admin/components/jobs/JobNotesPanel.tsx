'use client';
// app/admin/components/jobs/JobNotesPanel.tsx
//
// Owner, 2026-08-16: *"make it so that the user can open up the job and add a note to it … Job note
// entries should be recorded and should display who posted it to the job, from where and the date
// and time."*
//
// ── WHY THIS IS A PANEL AND NOT A SECTION ON ONE PAGE ───────────────────────────────────────────
//
// There are two field surfaces and they are different routes: the job detail page's **Field Work
// tab** (`/admin/jobs/[id]`), and the field-data manifest reviewer (`/admin/jobs/[id]/field`). A
// person who "opens up the job" lands on the first one.
//
// The compose box shipped in C0d2 was on the second. That is the shape this codebase keeps
// producing and paying for — C0b3b's "Log a trip →" pointed at a page with no form, and the
// mileage widget could read trips but not record one. Working, and where nobody looks.
//
// So it is one component with two mount points, sitting beside `JobInstructionsPanel` and
// `JobFieldMediaPanel` — the pattern the Field Work tab already uses.
//
// ── THE METADATA LINE IS THE FEATURE ────────────────────────────────────────────────────────────
//
// Who / from where / when, on every entry. Each has a way of being quietly wrong:
//
//   * **who** — the author is stored as an email and every note has always RENDERED as one, because
//     the manifest route's bulk name lookup keys on `created_by` (an id) and notes key on
//     `user_email`. The route behind this panel resolves names properly.
//   * **from where** — inferred for older rows from columns only one client could have written; a
//     row that cannot be placed says "Origin not recorded" rather than being assigned a plausible
//     home. See `lib/field/job-note-origin.ts`.
//   * **when** — rendered in the reader's locale from an ISO timestamp, and shown as an absolute
//     date and time rather than "3 days ago". A note about a gate code is evidence about a
//     particular visit, and relative time makes two visits look alike.

import { useCallback, useEffect, useState } from 'react';
import { StickyNote } from 'lucide-react';

export interface JobNoteEntry {
  id: string;
  body: string;
  title: string | null;
  author_email: string;
  author_name: string | null;
  origin: string;
  origin_label: string;
  created_at: string;
  updated_at: string | null;
  data_point_id: string | null;
  note_template: string | null;
  /** Soft-archived. The notes list this panel replaced showed an "archived" badge; without it an
   *  archived note is indistinguishable from a live one on the surface that took its place. */
  archived: boolean;
}

/** Absolute, and in the reader's locale. See the header for why this is not "3 days ago". */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function JobNotesPanel({ jobId }: { jobId: string }) {
  const [notes, setNotes] = useState<JobNoteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/notes`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Named, not swallowed. An empty list and a failed fetch look identical on screen, and this
        // panel's whole job is to say what is on the record for a job.
        setLoadError(j?.error ?? `Could not load notes (HTTP ${res.status}).`);
        return;
      }
      setNotes((j.notes ?? []) as JobNoteEntry[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load notes.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void load(); }, [load]);

  const add = useCallback(async () => {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(j?.error ?? `Could not save the note (HTTP ${res.status}).`);
        return;
      }
      setDraft('');
      // The server returns the created row in the SAME shape the list uses, so it can be prepended
      // rather than re-fetched — and it carries the author name and origin the server resolved, so
      // the new card is not a locally-invented row that differs from what everyone else sees.
      if (j.note) setNotes((prev) => [j.note as JobNoteEntry, ...prev]);
      else await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  }, [draft, saving, jobId, load]);

  return (
    <section style={s.card} aria-labelledby="job-notes-heading">
      <div style={s.head}>
        <h3 id="job-notes-heading" style={s.h3}>
          <StickyNote size={15} strokeWidth={2} aria-hidden />
          Job notes {notes.length > 0 ? <span style={s.count}>({notes.length})</span> : null}
        </h3>
        <p style={s.hint}>
          Anything the crew should know before or after a visit — access, hazards, who to call.
          Everyone on the job can read these.
        </p>
      </div>

      <div style={s.compose}>
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setSaveError(''); }}
          placeholder="Add a note for this job…"
          rows={3}
          maxLength={4000}
          style={s.input}
          aria-label="New job note"
        />
        <div style={s.composeRow}>
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim() || saving}
            style={{ ...s.button, ...(!draft.trim() || saving ? s.buttonOff : null) }}
            // The C16 rule: a disabled control says why rather than leaving it to be guessed.
            title={draft.trim() ? 'Post this note to the job' : 'Type a note first'}
          >
            {saving ? 'Posting…' : 'Post note'}
          </button>
          {saveError ? <span role="alert" style={s.error}>{saveError}</span> : null}
        </div>
      </div>

      {loading ? (
        <p style={s.muted}>Loading notes…</p>
      ) : loadError ? (
        <p role="alert" style={s.error}>{loadError}</p>
      ) : notes.length === 0 ? (
        <p style={s.muted}>No notes on this job yet.</p>
      ) : (
        <ul style={s.list}>
          {notes.map((n) => (
            <li key={n.id} style={s.item}>
              <p style={s.body}>{n.body || '(empty note)'}</p>
              {/* Who · from where · when — the three the owner asked for, in that order. */}
              <div style={s.meta}>
                <span style={s.author}>{n.author_name ?? n.author_email ?? 'Unknown author'}</span>
                {n.author_name && n.author_email ? (
                  <span style={s.dim}>{n.author_email}</span>
                ) : null}
                <span style={s.sep} aria-hidden>·</span>
                <span style={s.origin}>{n.origin_label}</span>
                <span style={s.sep} aria-hidden>·</span>
                <time dateTime={n.created_at} style={s.dim}>{formatWhen(n.created_at)}</time>
                {n.archived ? (
                  <>
                    <span style={s.sep} aria-hidden>·</span>
                    <span style={s.archived}>archived</span>
                  </>
                ) : null}
                {n.note_template ? (
                  <>
                    <span style={s.sep} aria-hidden>·</span>
                    <span style={s.badge}>{n.note_template}</span>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── WHY THERE IS NOT ONE HEX IN THIS FILE ───────────────────────────────────────────────────────
//
// This shipped with 30 hard-coded colours (`background: '#FFFFFF'`, `background: '#1D3095'`) and it
// was wrong on two counts. It renders under 12 skins — four of them dark, two high-contrast — so a
// literal `#FFFFFF` card with `#0B0E14` text is a white card with near-black text on `starr-dark`,
// on the same page as `JobInstructionsPanel`, which themes correctly. And a literal is unreachable
// by the print stylesheet, which fixes ink by overriding VARIABLES.
//
// No `var(--token, #fallback)` either, deliberately: `app/styles/themes.css` and `tokens.css` are
// imported by the ROOT layout, so every token here is always defined on `:root` and the fallback is
// dead code that only serves to re-introduce the literal. It is also counted by
// `scripts/scan-inline-style-hex.ts`, and this file must read zero there — see the note in that
// scanner about how this file passed the ratchet while being the exact defect it guards.
//
// Control heights come from the tokens too, per docs/admin-styling-contract.md — a hand-rolled
// `padding: 6px 14px` is how two buttons on one card end up different heights.
const s: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--theme-bg-surface)',
    border: '1px solid var(--theme-border)',
    borderRadius: 10, padding: 16, marginBottom: 16,
  },
  head: { marginBottom: 12 },
  h3: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 15, fontWeight: 700, color: 'var(--theme-fg-primary)', margin: '0 0 4px',
  },
  count: { fontSize: 13, fontWeight: 600, color: 'var(--theme-fg-muted)' },
  hint: { fontSize: 12, color: 'var(--theme-fg-muted)', margin: 0, lineHeight: 1.5 },
  compose: { marginBottom: 14 },
  input: {
    width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '8px 10px',
    fontSize: 14, lineHeight: 1.5,
    color: 'var(--theme-fg-primary)',
    background: 'var(--theme-bg-surface)',
    border: '1px solid var(--theme-border)', borderRadius: 6,
    fontFamily: 'inherit', resize: 'vertical',
  },
  composeRow: {
    display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap',
  },
  button: {
    height: 'var(--button-height)', padding: '0 16px',
    fontSize: 13, fontWeight: 600,
    color: 'var(--theme-accent-fg)',
    background: 'var(--theme-accent)',
    border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  buttonOff: { background: 'var(--theme-border-strong)', cursor: 'not-allowed' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 },
  item: {
    border: '1px solid var(--theme-border)', borderRadius: 8,
    padding: '10px 12px', background: 'var(--theme-bg-elevated)',
  },
  body: {
    fontSize: 14, lineHeight: 1.5, color: 'var(--theme-fg-primary)', margin: '0 0 6px',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  meta: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    fontSize: 12, color: 'var(--theme-fg-muted)',
  },
  author: { fontWeight: 600, color: 'var(--theme-fg-secondary)' },
  origin: { color: 'var(--theme-fg-secondary)' },
  dim: { color: 'var(--theme-fg-muted)' },
  sep: { color: 'var(--theme-border-strong)' },
  badge: {
    background: 'var(--theme-bg-elevated)', color: 'var(--theme-accent)',
    border: '1px solid var(--theme-border)',
    padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  },
  archived: {
    background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-muted)',
    border: '1px solid var(--theme-border)',
    padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.03em',
  },
  muted: { fontSize: 13, color: 'var(--theme-fg-muted)', margin: 0 },
  error: { fontSize: 12, color: 'var(--theme-danger)' },
};
