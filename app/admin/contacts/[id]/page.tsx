// app/admin/contacts/[id]/page.tsx — Contact profile (Slice 4 of the
// contacts plan).
//
// Full profile for a saved contact: realtor, repeat client, student,
// teacher, employee, etc. Each row is click-to-edit via the same
// `InlineEditField` pattern the job-detail page uses. The labels
// chip-row toggles inline. Linked jobs render with their role chip;
// "Link a job" opens a small picker.

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import InlineEditField from '@/app/admin/components/jobs/InlineEditField';
import {
  CONTACT_LABELS,
  findContactLabel,
  normalizeLabel,
  JOB_CONTACT_ROLES,
} from '@/lib/contacts/labels';
import LinkJobDialog from './LinkJobDialog';

interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  labels: string[];
  notes?: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
}

interface JobLink {
  id: string;
  role: string;
  notes?: string | null;
  created_at: string;
  jobs?: {
    id: string;
    name: string;
    job_number: string | null;
    stage: string | null;
  } | null;
}

export default function ContactProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [contact, setContact] = useState<Contact | null>(null);
  const [jobs, setJobs] = useState<JobLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const id = params?.id;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contacts/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { contact: Contact; jobs?: JobLink[] } = await res.json();
      setContact(data.contact);
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Inline-edit save: PUT only the field that changed. Throws on
  // failure so InlineEditField can surface the message + roll back.
  const saveField = useCallback(async (field: string, value: string) => {
    if (!contact) return;
    const payloadValue = value.trim() === '' ? null : value;
    const res = await fetch(`/api/admin/contacts/${contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [field]: payloadValue,
        // PUT requires the full labels array — sending the current set
        // keeps the chip row stable while editing a sibling field.
        labels: contact.labels,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
    setContact((prev) => (prev ? { ...prev, [field]: payloadValue } : prev));
  }, [contact]);

  const setLabels = useCallback(async (next: string[]) => {
    if (!contact) return;
    const res = await fetch(`/api/admin/contacts/${contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || `Save failed (${res.status})`);
      return;
    }
    setContact((prev) => (prev ? { ...prev, labels: data.contact?.labels ?? next } : prev));
  }, [contact]);

  const toggleLabel = useCallback((labelId: string) => {
    if (!contact) return;
    const next = contact.labels.includes(labelId)
      ? contact.labels.filter((l) => l !== labelId)
      : [...contact.labels, labelId];
    void setLabels(next);
  }, [contact, setLabels]);

  const addCustomLabel = useCallback(() => {
    const key = normalizeLabel(customLabel);
    if (!key || !contact) return;
    if (contact.labels.includes(key)) { setCustomLabel(''); return; }
    void setLabels([...contact.labels, key]);
    setCustomLabel('');
  }, [contact, customLabel, setLabels]);

  const unlinkJob = useCallback(async (jobId: string, role: string) => {
    if (!contact) return;
    if (!window.confirm(`Unlink ${contact.name} from this job?`)) return;
    const params = new URLSearchParams({ job_id: jobId, role });
    const res = await fetch(`/api/admin/contacts/${contact.id}/jobs?${params}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to unlink');
      return;
    }
    await load();
  }, [contact, load]);

  const handleDelete = useCallback(async () => {
    if (!contact) return;
    if (!window.confirm(`Permanently delete ${contact.name}? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/contacts/${contact.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to delete');
      setDeleting(false);
      return;
    }
    router.push('/admin/contacts');
  }, [contact, router]);

  // Role guard — admin / developer / tech_support manage the firm-
  // wide contact directory.
  const userRoles = useMemo(() => session?.user?.roles || ['employee'], [session]);
  const canManage = userRoles.includes('admin') || userRoles.includes('developer') || userRoles.includes('tech_support');
  if (sessionStatus === 'authenticated' && !canManage) {
    router.replace('/admin/dashboard');
    return null;
  }
  if (!session?.user) return null;

  if (loading) {
    return <div style={pagePad}>Loading…</div>;
  }
  if (error && !contact) {
    return <div style={pagePad}><div role="alert" style={errorStyle}>{error}</div></div>;
  }
  if (!contact) {
    return <div style={pagePad}>Contact not found.</div>;
  }

  return (
    <div style={pagePad}>
      <Link href="/admin/contacts" style={{ color: 'var(--theme-fg-secondary)', fontSize: '0.85rem' }}>← All contacts</Link>

      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>{contact.name}</h1>
        <button type="button" onClick={() => void handleDelete()} style={dangerButtonStyle} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete contact'}
        </button>
      </header>

      {error && <div role="alert" style={errorStyle}>{error}</div>}

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Labels</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {CONTACT_LABELS.map((l) => {
            const active = contact.labels.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLabel(l.id)}
                style={active ? activeChipStyle : chipStyle}
                title={l.description}
              >
                {l.label}{active && ' ✓'}
              </button>
            );
          })}
          {contact.labels.filter((id) => !findContactLabel(id)).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleLabel(id)}
              style={activeChipStyle}
              title={`Custom label "${id}" — click to remove`}
            >
              {id} ×
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomLabel(); } }}
            placeholder="Add a custom label (e.g. realtor, partner-firm)"
            style={inputSlim}
          />
          <button type="button" onClick={addCustomLabel} style={secondaryButtonStyle}>Add</button>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Contact info</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 3fr', gap: '4px 12px', alignItems: 'baseline' }}>
          <strong>Name:</strong>
          <InlineEditField value={contact.name} ariaLabel="name" emptyLabel="Add name" onSave={(v) => saveField('name', v)} />
          <strong>Company:</strong>
          <InlineEditField value={contact.company} ariaLabel="company" emptyLabel="Add company" onSave={(v) => saveField('company', v)} />
          <strong>Title:</strong>
          <InlineEditField value={contact.title} ariaLabel="title" emptyLabel="Add title" onSave={(v) => saveField('title', v)} />
          <strong>Email:</strong>
          <InlineEditField value={contact.email} type="email" ariaLabel="email" emptyLabel="Add email" onSave={(v) => saveField('email', v)} />
          <strong>Phone:</strong>
          <InlineEditField value={contact.phone} type="tel" ariaLabel="phone" emptyLabel="Add phone" onSave={(v) => saveField('phone', v)} />
          <strong>Address:</strong>
          <InlineEditField value={contact.address} ariaLabel="address" emptyLabel="Add address" onSave={(v) => saveField('address', v)} />
          <strong>City:</strong>
          <InlineEditField value={contact.city} ariaLabel="city" emptyLabel="Add city" onSave={(v) => saveField('city', v)} />
          <strong>State:</strong>
          <InlineEditField value={contact.state} ariaLabel="state" emptyLabel="Add state" onSave={(v) => saveField('state', v)} />
          <strong>ZIP:</strong>
          <InlineEditField value={contact.zip} ariaLabel="zip" emptyLabel="Add ZIP" onSave={(v) => saveField('zip', v)} />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Notes</h2>
        <InlineEditField value={contact.notes} type="textarea" ariaLabel="notes" emptyLabel="Add notes…" onSave={(v) => saveField('notes', v)} />
      </section>

      <section style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={sectionTitleStyle}>Linked jobs ({jobs.length})</h2>
          <button type="button" onClick={() => setShowLinkDialog(true)} style={primaryButtonStyle}>
            + Link a job
          </button>
        </div>
        {jobs.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted, #6B7280)', fontSize: '0.9rem' }}>
            No jobs linked yet. Use &ldquo;+ Link a job&rdquo; to associate this contact with a job.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {jobs.map((j) => (
              <li key={j.id} style={jobRowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {j.jobs ? (
                    <Link href={`/admin/jobs/${j.jobs.id}`} style={{ color: 'var(--theme-accent, #3b82f6)', fontWeight: 600 }}>
                      {j.jobs.job_number ? `${j.jobs.job_number} · ` : ''}{j.jobs.name}
                    </Link>
                  ) : (
                    <span>(job no longer exists)</span>
                  )}
                  <span style={smallChipStyle}>{JOB_CONTACT_ROLES.find((r) => r.id === j.role)?.label ?? j.role}</span>
                  {j.jobs?.stage && (
                    <span style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      stage: {j.jobs.stage}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => j.jobs && void unlinkJob(j.jobs.id, j.role)}
                  style={secondaryButtonStyle}
                  aria-label="Unlink"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showLinkDialog && (
        <LinkJobDialog
          open={showLinkDialog}
          contactId={contact.id}
          contactName={contact.name}
          onClose={() => setShowLinkDialog(false)}
          onLinked={() => { setShowLinkDialog(false); void load(); }}
        />
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const pagePad: React.CSSProperties = { padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' };
const sectionStyle: React.CSSProperties = {
  padding: '1rem 1.25rem', borderRadius: 10,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-bg-surface, white)',
  display: 'flex', flexDirection: 'column', gap: 8,
};
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: '1rem', fontWeight: 600 };
const chipStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 999,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent', cursor: 'pointer', fontSize: '0.8rem',
};
const activeChipStyle: React.CSSProperties = {
  ...chipStyle,
  background: 'var(--theme-accent, #3b82f6)', color: 'var(--theme-accent-fg, white)',
  borderColor: 'var(--theme-accent, #3b82f6)',
};
const smallChipStyle: React.CSSProperties = {
  marginLeft: 8, padding: '2px 8px', borderRadius: 999,
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 12%, transparent)',
  color: 'var(--theme-accent, #3b82f6)', fontSize: '0.72rem',
};
const inputSlim: React.CSSProperties = {
  flex: 1, padding: '6px 10px', borderRadius: 6,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-bg-surface, white)', fontSize: '0.85rem',
};
const jobRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', borderRadius: 8,
  background: 'var(--theme-bg-elevated, #f9fafb)',
};
const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8,
  border: '1px solid var(--theme-accent, #3b82f6)',
  background: 'var(--theme-accent, #3b82f6)', color: 'var(--theme-accent-fg, white)',
  cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
};
const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.85rem',
};
const dangerButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid var(--theme-danger, #ef4444)',
  background: 'transparent', color: 'var(--theme-danger, #ef4444)',
  cursor: 'pointer', fontSize: '0.85rem',
};
const errorStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6,
  background: 'color-mix(in srgb, var(--theme-danger, #ef4444) 12%, transparent)',
  border: '1px solid var(--theme-danger, #ef4444)',
  color: 'var(--theme-danger, #ef4444)', fontSize: '0.9rem',
};
