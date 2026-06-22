'use client';
// lib/work-mode/clock-modals.tsx
//
// Clock-in + clock-out modal dialogs. Triggered from the top-bar
// `ClockInPill` (Slice 89) and Work Mode Exit "Clock out too?" path.
//
// Slices 178 + 179 of customizable-hub-and-work-mode-2026-05-28.md.

import React, { useState } from 'react';

interface ActivityTag { id: string; label: string; color: string; }

interface ClockInModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { jobId: string | null; tagIds: string[] }) => void;
  catalog: ActivityTag[];
}

export function ClockInModal({ open, onClose, onSubmit, catalog }: ClockInModalProps) {
  const [jobId, setJobId] = useState<string>('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  if (!open) return null;
  // clock-in-modal-polish-2026-06-22 — when no specific job applies
  // (office work, equipment management, training, etc.) the user just
  // picks the tags that describe their day. The optional-hint and the
  // tag prompt below make that path obvious.
  return (
    <ModalShell title="Clock in" onClose={onClose}>
      <label style={fieldStyle}>
        <span style={labelStyle}>Active job (optional)</span>
        <input
          type="text"
          value={jobId}
          placeholder="Job number — leave blank for office, equipment, training, etc."
          onChange={(e) => setJobId(e.target.value)}
          style={inputStyle}
        />
        <span style={hintStyle}>
          Skip this if you&rsquo;re not on a specific job — just pick tags below.
        </span>
      </label>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>What are you working on?</legend>
        <span style={{ ...hintStyle, display: 'block', marginBottom: 8 }}>
          Pick every tag that might apply today. You can refine at clock-out.
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {catalog.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTagIds((arr) => on ? arr.filter((x) => x !== t.id) : [...arr, t.id])}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 999,
                  border: `1px solid ${t.color}`,
                  background: on ? t.color : 'transparent',
                  color: on ? 'var(--theme-accent-fg)' : t.color,
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                }}
                aria-pressed={on}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <ModalActions onCancel={onClose} onConfirm={() => onSubmit({ jobId: jobId || null, tagIds })} confirmLabel="Clock in" />
    </ModalShell>
  );
}

interface ClockOutModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { perJobAllocations: Record<string, number>; tagIds: string[]; notes: string }) => void;
  catalog: ActivityTag[];
  /** Map of job id → suggested hours, e.g. from the day's auto-tracked time. */
  suggestedAllocations: Record<string, number>;
}

export function ClockOutModal({ open, onClose, onSubmit, catalog, suggestedAllocations }: ClockOutModalProps) {
  const [allocations, setAllocations] = useState<Record<string, number>>(suggestedAllocations);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  if (!open) return null;

  return (
    <ModalShell title="Wrap your day" onClose={onClose}>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Time by job</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.keys(allocations).length === 0 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--theme-fg-secondary)' }}>No jobs logged today.</span>
          )}
          {Object.entries(allocations).map(([jobId, hours]) => (
            <label key={jobId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: '0.85rem' }}>{jobId}</span>
              <input
                type="number"
                min={0}
                step={0.25}
                value={hours}
                onChange={(e) => setAllocations({ ...allocations, [jobId]: Number(e.target.value) })}
                style={{ ...inputStyle, width: 80, textAlign: 'right' }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Tags</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {catalog.map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTagIds((arr) => on ? arr.filter((x) => x !== t.id) : [...arr, t.id])}
                style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${t.color}`, background: on ? t.color : 'transparent', color: on ? 'var(--theme-accent-fg)' : t.color, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label style={fieldStyle}>
        <span style={labelStyle}>End-of-day debrief</span>
        <textarea
          value={notes}
          rows={4}
          placeholder="A few sentences on what you actually got done today — work performed, blockers, follow-ups."
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, height: 96, resize: 'vertical' }}
        />
        <span style={hintStyle}>
          A short recap so future-you and admins can reconstruct the day.
        </span>
      </label>
      <ModalActions onCancel={onClose} onConfirm={() => onSubmit({ perJobAllocations: allocations, tagIds, notes })} confirmLabel="Submit + clock out" />
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={closeButtonStyle}>×</button>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
      <button type="button" onClick={onCancel} style={cancelButtonStyle}>Cancel</button>
      <button type="button" onClick={onConfirm} style={primaryButtonStyle}>{confirmLabel}</button>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--theme-bg-page) 70%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 };
const modalStyle: React.CSSProperties = { background: 'var(--theme-bg-surface)', borderRadius: 8, padding: 'var(--hub-spc-4, 16px)', minWidth: 360, maxWidth: 540, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' };
const closeButtonStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--theme-fg-secondary)', fontSize: '1.25rem', cursor: 'pointer' };
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle: React.CSSProperties = { fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 600 };
const hintStyle: React.CSSProperties = { fontSize: '0.78rem', color: 'var(--theme-fg-secondary)', lineHeight: 1.4 };
const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 4, border: '1px solid var(--theme-border)', background: 'var(--theme-bg-elevated)', color: 'var(--theme-fg-primary)', fontSize: '0.85rem' };
const cancelButtonStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 6, background: 'transparent', border: 'none', color: 'var(--theme-fg-secondary)', cursor: 'pointer' };
const primaryButtonStyle: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--theme-accent)', color: 'var(--theme-accent-fg)', fontWeight: 600, cursor: 'pointer' };
