// app/admin/contacts/[id]/LinkJobDialog.tsx
//
// contacts plan Slice 4 — small picker for "Link this contact to a
// job". Fetches the recent jobs list, lets the surveyor type to
// filter, pick a role from the JOB_CONTACT_ROLES vocabulary, optional
// notes, and POSTs to /api/admin/contacts/{id}/jobs.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { JOB_CONTACT_ROLES } from '@/lib/contacts/labels';

interface JobOption {
  id: string;
  name: string;
  job_number?: string | null;
  stage?: string | null;
}

interface Props {
  open: boolean;
  contactId: string;
  contactName: string;
  onClose: () => void;
  onLinked: () => void;
}

export default function LinkJobDialog({ open, contactId, contactName, onClose, onLinked }: Props) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [role, setRole] = useState<string>('client');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/jobs?limit=200');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { jobs?: JobOption[] } = await res.json();
        setJobs(data.jobs ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      j.name.toLowerCase().includes(q) || (j.job_number ?? '').toLowerCase().includes(q),
    );
  }, [jobs, filter]);

  const handleSubmit = useCallback(async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contacts/${contactId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: selectedId,
          role,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link the job.');
    } finally {
      setSubmitting(false);
    }
  }, [contactId, selectedId, role, notes, submitting, onLinked]);

  if (!open) return null;

  return (
    <ModalFrame open={open} onClose={onClose} title={`Link ${contactName} to a job`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360, maxWidth: 560 }}>
        <div>
          <div style={labelStyle}>Filter jobs</div>
          <input
            autoFocus
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Type a name or job number…"
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        <div>
          <div style={labelStyle}>Pick a job</div>
          {loading ? (
            <div style={{ color: 'var(--color-text-muted)' }}>Loading jobs…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)' }}>No jobs match.</div>
          ) : (
            <ul role="listbox" style={listStyle}>
              {visible.map((j) => {
                const active = j.id === selectedId;
                return (
                  <li key={j.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedId(j.id)}
                      style={active ? activeRowStyle : rowStyle}
                      disabled={submitting}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {j.job_number ? `${j.job_number} · ` : ''}{j.name}
                      </span>
                      {j.stage && (
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {j.stage}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <div style={labelStyle}>Role on this job</div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={inputStyle}
            disabled={submitting}
          >
            {JOB_CONTACT_ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={labelStyle}>Notes (optional)</div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Pre-qualified buyer; recommended by lender."
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        {error && <div role="alert" style={errorStyle}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle} disabled={submitting}>Cancel</button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            style={primaryButtonStyle}
            disabled={submitting || !selectedId}
          >
            {submitting ? 'Linking…' : 'Link'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}

const labelStyle: React.CSSProperties = { fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)', color: 'var(--theme-fg-primary)',
  fontSize: '0.9rem',
};
const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  maxHeight: 240, overflowY: 'auto',
  border: '1px solid var(--theme-border)', borderRadius: 6,
  background: 'var(--theme-bg-surface)',
};
const rowStyle: React.CSSProperties = {
  width: '100%', textAlign: 'left',
  padding: '8px 10px', border: 'none', borderRadius: 0,
  background: 'transparent', color: 'inherit',
  cursor: 'pointer', fontSize: '0.9rem',
};
const activeRowStyle: React.CSSProperties = {
  ...rowStyle,
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 14%, transparent)',
};
const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8,
  border: '1px solid var(--theme-accent, #3b82f6)',
  background: 'var(--theme-accent, #3b82f6)', color: 'var(--theme-accent-fg, white)',
  cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
};
const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.9rem',
};
const errorStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6,
  background: 'color-mix(in srgb, var(--theme-danger) 12%, var(--theme-bg-surface))',
  border: '1px solid var(--theme-danger)',
  color: 'var(--theme-danger)', fontSize: '0.85rem',
};
