// app/admin/components/jobs/LinkContactDialog.tsx
//
// contacts plan Slice 6 — picker for "Link a contact to this job"
// rendered from the job-detail page. Mirrors the contact-side
// LinkJobDialog (Slice 4): search → pick → role → POST.
//
// Posts to /api/admin/jobs/contacts (the job-side surface added in
// Slice 6) with { job_id, contact_id, role, notes }. PG 409
// "already linked" surfaces as the inline error.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ModalFrame from '@/app/admin/components/ui/ModalFrame';
import { JOB_CONTACT_ROLES } from '@/lib/contacts/labels';

interface ContactOption {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

interface Props {
  open: boolean;
  jobId: string;
  jobName: string;
  onClose: () => void;
  onLinked: () => void;
}

export default function LinkContactDialog({ open, jobId, jobName, onClose, onLinked }: Props) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
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
        const res = await fetch('/api/admin/contacts?limit=500&order=name');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { contacts?: ContactOption[] } = await res.json();
        setContacts(data.contacts ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load contacts');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q)
      || (c.company ?? '').toLowerCase().includes(q)
      || (c.email ?? '').toLowerCase().includes(q),
    );
  }, [contacts, filter]);

  const handleSubmit = useCallback(async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/jobs/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          contact_id: selectedId,
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
      setError(err instanceof Error ? err.message : 'Failed to link the contact.');
    } finally {
      setSubmitting(false);
    }
  }, [jobId, selectedId, role, notes, submitting, onLinked]);

  if (!open) return null;

  return (
    <ModalFrame open={open} onClose={onClose} title={`Link a contact to ${jobName}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 360, maxWidth: 560 }}>
        <div>
          <div style={labelStyle}>Filter contacts</div>
          <input
            autoFocus
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Type a name, company, or email…"
            style={inputStyle}
            disabled={submitting}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={labelStyle}>Pick a contact</span>
            <Link
              href="/admin/contacts"
              style={{ fontSize: '0.78rem', color: 'var(--theme-accent, #3b82f6)' }}
              onClick={onClose}
            >
              Manage contacts →
            </Link>
          </div>
          {loading ? (
            <div style={{ color: 'var(--color-text-muted)' }}>Loading contacts…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)' }}>
              No contacts match. <Link href="/admin/contacts" style={{ color: 'var(--theme-accent, #3b82f6)' }}>Add one</Link>?
            </div>
          ) : (
            <ul role="listbox" style={listStyle}>
              {visible.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => setSelectedId(c.id)}
                      style={active ? activeRowStyle : rowStyle}
                      disabled={submitting}
                    >
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      {(c.company || c.email) && (
                        <span style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          {c.company ?? ''}
                          {c.company && c.email ? ' · ' : ''}
                          {c.email ?? ''}
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
            placeholder="e.g. Listing agent; introduced us to the buyer."
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

const labelStyle: React.CSSProperties = { fontSize: '0.85rem', fontWeight: 600 };
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
