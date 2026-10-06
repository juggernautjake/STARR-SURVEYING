'use client';
// lib/time-tracking/clock-modals.tsx
//
// Clock-in + clock-out dialogs, opened from the top-bar `ClockInPill` and the hub's Quick Actions
// tile. Slices 178 + 179 of customizable-hub-and-work-mode-2026-05-28.md.
//
// ── UI PASS, 2026-10-06 ─────────────────────────────────────────────────────────────────────────
// Owner: "work on the clock in and clock out pages and modals … everything needs to be simpler and
// more straight forward." What changed, measured on a 390px phone:
//   · A sheet with a pinned header and pinned buttons. The clock-out button used to be below the
//     fold of a dialog that scrolled inside a page that scrolled — the one control that matters,
//     out of sight.
//   · Clock-out opens with what you worked ("8h 30m today · 8:00 AM – 4:30 PM"), which it never said.
//   · The job is a real job search (the same picker receipts and hours use), not a free-text box
//     whose typed number was then rejected by the database.
//   · 28 tag chips are folded away until wanted; the ones picked at clock-in come pre-selected at
//     clock-out instead of being asked again from scratch.
//   · Lunch is four buttons that look like buttons, plus "Other" for anything else.

import React, { useMemo, useState } from 'react';
import JobRefPicker, { jobRefLabel, type JobRefOption } from '@/app/admin/components/jobs/JobRefPicker';
import './ClockModals.css';

interface ActivityTag { id: string; label: string; color: string; }

/** "8h 30m" from hours. */
export function formatWorked(hours: number): string {
  const mins = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const clockTime = (iso: string | number) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ── Clock in ──────────────────────────────────────────────────────────────────────────────────────

interface ClockInModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { jobId: string | null; jobLabel: string | null; tagIds: string[] }) => void | Promise<void>;
  catalog: ActivityTag[];
}

export function ClockInModal({ open, onClose, onSubmit, catalog }: ClockInModalProps) {
  const [job, setJob] = useState<JobRefOption | null>(null);
  const [tagIds, setTagIds] = useState<string[]>([]);

  if (!open) return null;
  return (
    <ModalShell
      title="Clock in"
      onClose={onClose}
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() => onSubmit({ jobId: job?.id ?? null, jobLabel: job ? jobRefLabel(job) : null, tagIds })}
          confirmLabel={`Clock in · ${clockTime(Date.now())}`}
          busyLabel="Clocking in…"
        />
      )}
    >
      <JobRefPicker
        value={job}
        onChange={setJob}
        label="Job (optional)"
        clearLabel="No job — office, equipment, training…"
        hint="Leave empty if you’re not on a specific job."
      />
      <TagPicker catalog={catalog} value={tagIds} onChange={setTagIds} summaryLabel="What are you working on? (optional)" />
    </ModalShell>
  );
}

// ── Clock out ─────────────────────────────────────────────────────────────────────────────────────

interface ClockOutModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { perJobAllocations: Record<string, number>; tagIds: string[]; notes: string; lunchMinutes: number | null }) => void | Promise<void>;
  catalog: ActivityTag[];
  /** Map of job id → suggested hours, e.g. from the day's auto-tracked time. */
  suggestedAllocations: Record<string, number>;
  /** When the shift started — shown, and used for the worked total. */
  startedAt?: string;
  /** Readable names for the job ids in `suggestedAllocations`. */
  jobLabels?: Record<string, string>;
  /** Tags chosen at clock-in, pre-selected here. */
  initialTagIds?: string[];
}

const LUNCH_OPTIONS = [
  { v: 0, label: 'None' },
  { v: 30, label: '30 min' },
  { v: 45, label: '45 min' },
  { v: 60, label: '1 hr' },
];

export function ClockOutModal({
  open, onClose, onSubmit, catalog, suggestedAllocations, startedAt, jobLabels = {}, initialTagIds = [],
}: ClockOutModalProps) {
  const [allocations, setAllocations] = useState<Record<string, number>>(suggestedAllocations);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [notes, setNotes] = useState('');
  // ── LUNCH (owner, 2026-09-19) ──────────────────────────────────────────────────────────────────
  // `null` is "nobody answered" and is NOT zero: an approver sees "no lunch recorded" rather than
  // "no lunch taken". Pressing "None" is how somebody says zero — a different fact (seeds/650).
  const [lunch, setLunch] = useState<number | null>(null);
  const [lunchOther, setLunchOther] = useState(false);

  const worked = useMemo(() => {
    if (!startedAt) return null;
    const t = Date.parse(startedAt);
    return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 3_600_000) : null;
  }, [startedAt, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const jobIds = Object.keys(allocations);

  return (
    <ModalShell
      title="Clock out"
      onClose={onClose}
      footer={(
        <ModalActions
          onCancel={onClose}
          onConfirm={() => onSubmit({ perJobAllocations: allocations, tagIds, notes, lunchMinutes: lunch })}
          confirmLabel={worked != null ? `Clock out · ${formatWorked(worked)}` : 'Clock out'}
          busyLabel="Saving your hours…"
        />
      )}
    >
      {worked != null && startedAt && (
        <div className="clockm__summary" role="status">
          <span className="clockm__summary-hours">{formatWorked(worked)}</span>
          <span className="clockm__summary-span">
            {clockTime(startedAt)} – {clockTime(Date.now())}
            {worked > 14 ? ' · that’s a long day — check you didn’t miss a clock-out' : ''}
          </span>
        </div>
      )}

      {/* Only when the day had a job to split — "No jobs logged today" said nothing useful. */}
      {jobIds.length > 0 && (
        <div className="clockm__field">
          <span className="clockm__label">Hours by job</span>
          {jobIds.map((jobId) => (
            <label key={jobId} className="clockm__alloc">
              <span className="clockm__alloc-name">{jobLabels[jobId] ?? 'Job'}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.25}
                value={allocations[jobId]}
                onChange={(e) => setAllocations({ ...allocations, [jobId]: Number(e.target.value) })}
                className="clockm__input clockm__input--hours"
                aria-label={`Hours on ${jobLabels[jobId] ?? 'this job'}`}
              />
            </label>
          ))}
        </div>
      )}

      <div className="clockm__field">
        <span className="clockm__label">Lunch</span>
        <div className="clockm__segmented" role="group" aria-label="Lunch">
          {LUNCH_OPTIONS.map((opt) => {
            const on = !lunchOther && lunch === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                aria-pressed={on}
                className={`clockm__seg${on ? ' clockm__seg--on' : ''}`}
                onClick={() => { setLunchOther(false); setLunch(on ? null : opt.v); }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={lunchOther}
            className={`clockm__seg${lunchOther ? ' clockm__seg--on' : ''}`}
            onClick={() => { setLunchOther(!lunchOther); if (lunchOther) setLunch(null); }}
          >
            Other
          </button>
        </div>
        {lunchOther && (
          <label className="clockm__inline">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={480}
              step={5}
              autoFocus
              value={lunch ?? ''}
              onChange={(e) => setLunch(e.target.value === '' ? null : Math.max(0, Math.min(480, Math.round(Number(e.target.value)) || 0)))}
              className="clockm__input clockm__input--hours"
              aria-label="Minutes at lunch"
            />
            <span>minutes</span>
          </label>
        )}
        <span className="clockm__hint">Not taken off your hours — whoever approves them sees it and decides.</span>
      </div>

      <label className="clockm__field">
        <span className="clockm__label">What did you get done? (optional)</span>
        <textarea
          value={notes}
          rows={3}
          placeholder="Work done, blockers, follow-ups"
          onChange={(e) => setNotes(e.target.value)}
          className="clockm__input clockm__textarea"
        />
      </label>

      <TagPicker catalog={catalog} value={tagIds} onChange={setTagIds} summaryLabel="Tags (optional)" />
    </ModalShell>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────────────────────────

/** Tags, folded until wanted. The chosen ones are always visible in the summary line. */
function TagPicker({ catalog, value, onChange, summaryLabel }: {
  catalog: ActivityTag[];
  value: string[];
  onChange: (ids: string[]) => void;
  summaryLabel: string;
}) {
  const chosen = catalog.filter((t) => value.includes(t.id));
  return (
    <details className="clockm__tags">
      <summary className="clockm__tags-summary">
        <span className="clockm__label">{summaryLabel}</span>
        <span className="clockm__tags-chosen">
          {chosen.length === 0 ? 'None' : chosen.map((t) => t.label).join(', ')}
        </span>
      </summary>
      <div className="clockm__chips">
        {catalog.map((t) => {
          const on = value.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id])}
              className={`clockm__chip${on ? ' clockm__chip--on' : ''}`}
              style={{ '--chip': t.color } as React.CSSProperties}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function ModalShell({ title, children, onClose, footer }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
}) {
  return (
    <div role="dialog" aria-modal aria-label={title} className="clockm__overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="clockm__sheet">
        <header className="clockm__header">
          <h3 className="clockm__title">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="clockm__close">×</button>
        </header>
        <div className="clockm__body">{children}</div>
        <footer className="clockm__footer">{footer}</footer>
      </div>
    </div>
  );
}

/**
 * The confirm button, which can be pressed exactly once.
 *
 * DOUBLE-LOGGED HOURS, 2026-08-24: two identical 7.56-hour rows 3.2 seconds apart — the button
 * stayed live for the whole round-trip and was pressed twice. The guard lives HERE so both surfaces
 * that open this modal get it. Cancel is disabled too while saving, so the dialog cannot be closed
 * on a submission whose outcome the person could then not see.
 */
function ModalActions({ onCancel, onConfirm, confirmLabel, busyLabel }: {
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  busyLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      // The caller normally unmounts this modal on success; this runs when it did not, so the
      // person is never stranded on a dead button.
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" onClick={onCancel} disabled={busy} className="clockm__btn clockm__btn--ghost">Cancel</button>
      <button type="button" onClick={confirm} disabled={busy} aria-busy={busy} className="clockm__btn clockm__btn--primary">
        {busy ? (busyLabel ?? 'Saving…') : confirmLabel}
      </button>
    </>
  );
}
