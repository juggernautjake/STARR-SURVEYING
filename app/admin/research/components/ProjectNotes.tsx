'use client';

// app/admin/research/components/ProjectNotes.tsx — notes, reachable from every stage (Phase N2).
//
// ── THE NOTES EXISTED AND WERE THREE LEVELS DOWN ────────────────────────────────────────────────
//
// Owner: *"be able to write notes and stuff"*.
//
// `analysis_metadata.job_notes` was already persisted, already auto-saved and already had a good
// placeholder. It rendered in exactly one place: Stage 4 → the Job Prep tab → the "Final Document"
// sub-tab. So the notes you take *while reading the results* — which is when a surveyor takes them
// — had nowhere to go until the project reached the last stage.
//
// ── AND THE SAVE FAILED SILENTLY ────────────────────────────────────────────────────────────────
//
//     } catch { /* silently ignore — next save will retry */ }
//
// The comment is honest about the intent and wrong about the consequence. There is no next save if
// the person stops typing, which is exactly what somebody does when they have finished the note.
// A dropped request means the note is in the textarea, gone on reload, and nothing ever said so.
//
// This is user-authored content — the one category where losing a write quietly is worst, because
// the system cannot regenerate it. So the state is on the screen: saving, saved with a time, or
// **failed with a retry**.
//
// ── ONE COMPONENT, TWO PLACES ───────────────────────────────────────────────────────────────────
//
// The Final Document tab keeps its notes box; it is the same component reading the same field. A
// second textarea against the same column is how two boxes come to disagree about what was typed.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ProjectNotes.css';

export type NotesSaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'failed'; message: string };

export interface ProjectNotesProps {
  projectId: string;
  /** The value from `analysis_metadata.job_notes`. */
  value: string;
  /** Kept in the parent so the Job Prep tab and this render the same text. */
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** Rendered as a collapsible section with this heading; omit for a bare textarea. */
  heading?: string;
  /** Start collapsed. The project page opens it closed; Job Prep renders it open. */
  startCollapsed?: boolean;
}

/** How the save state reads. Exported so the test asserts the words, not just the branch. */
export function saveStateLabel(state: NotesSaveState): string {
  switch (state.kind) {
    case 'saving': return 'Saving…';
    case 'saved': return `Saved ${new Date(state.at).toLocaleTimeString()}`;
    case 'failed': return `Not saved — ${state.message}`;
    default: return 'Auto-saves as you type';
  }
}

export const JOB_NOTES_PLACEHOLDER =
  'Field instructions, access notes, what to look for, who to call — anything the person who did '
  + 'not run this research needs to know before they go out.';

export default function ProjectNotes({
  projectId, value, onChange, placeholder = JOB_NOTES_PLACEHOLDER, rows = 8,
  heading, startCollapsed = false,
}: ProjectNotesProps) {
  const [state, setState] = useState<NotesSaveState>({ kind: 'idle' });
  const [open, setOpen] = useState(!startCollapsed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  const save = useCallback(async (next: string) => {
    setState({ kind: 'saving' });
    try {
      const res = await fetch('/api/admin/research', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, job_notes: next }),
      });
      // A 200 with an `{ error }` body is still a failure, and this API returns those. Checking
      // `res.ok` alone is how a rejected write reads as a successful one.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pending.current = null;
      setState({ kind: 'saved', at: Date.now() });
    } catch (err) {
      pending.current = next;
      setState({ kind: 'failed', message: String(err).replace(/^Error:\s*/, '') });
    }
  }, [projectId]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function handleChange(next: string) {
    onChange(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 1200);
  }

  const body = (
    <>
      <textarea
        className="project-notes__textarea"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-label={heading ?? 'Project notes'}
        aria-describedby={`${projectId}-notes-state`}
      />
      <div
        id={`${projectId}-notes-state`}
        className={`project-notes__state project-notes__state--${state.kind}`}
        role={state.kind === 'failed' ? 'alert' : 'status'}
      >
        {saveStateLabel(state)}
        {state.kind === 'failed' && (
          <button
            type="button"
            className="project-notes__retry"
            onClick={() => void save(pending.current ?? value)}
          >
            Retry
          </button>
        )}
      </div>
    </>
  );

  if (!heading) return <div className="project-notes">{body}</div>;

  return (
    <section className="project-notes project-notes--panel">
      <button
        type="button"
        className="project-notes__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="project-notes__heading">{heading}</span>
        {/* The count is on the closed state on purpose: a collapsed panel that gives no sign it
            holds anything is a panel nobody opens twice. */}
        {!open && value.trim() !== '' && (
          <span className="project-notes__badge">{value.trim().split(/\s+/).length} words</span>
        )}
        <span className="project-notes__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && body}
    </section>
  );
}
