// app/admin/contacts/page.tsx — Contacts list (Slice 3 of the
// contacts plan).
//
// Firm-wide contacts directory: realtors, repeat clients, students,
// teachers, employees. Each row links to /admin/contacts/[id] (the
// profile page lands in Slice 4). Search + label filter share the
// API contract: `?search=<q>` and `?label=<key>`.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CONTACT_LABELS, findContactLabel } from '@/lib/contacts/labels';
import NewContactDialog from './NewContactDialog';

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  labels: string[];
  updated_at: string;
}

export default function ContactsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (appliedSearch) params.set('search', appliedSearch);
      if (labelFilter) params.set('label', labelFilter);
      const res = await fetch(`/api/admin/contacts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { contacts?: ContactRow[] } = await res.json();
      setContacts(data.contacts ?? []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load contacts');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, labelFilter]);

  useEffect(() => { void loadContacts(); }, [loadContacts]);

  // Role guard — admins, developers, and tech_support can manage the
  // firm-wide contact directory.
  const userRoles = useMemo(() => session?.user?.roles || ['employee'], [session]);
  const canManageContacts = userRoles.includes('admin') || userRoles.includes('developer') || userRoles.includes('tech_support');
  if (sessionStatus === 'authenticated' && !canManageContacts) {
    router.replace('/admin/dashboard');
    return null;
  }
  if (!session?.user) return null;

  return (
    <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Contacts</h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-muted, #6B7280)', fontSize: '0.95rem' }}>
            Realtors, clients, students, teachers, employees — anyone you want to keep on file.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewDialog(true)}
          style={primaryButtonStyle}
          data-testid="contacts-new-button"
        >
          + New contact
        </button>
      </header>

      {/* Search + label filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()); }}
          style={{ display: 'flex', gap: 8, flex: '1 1 280px', minWidth: 240 }}
        >
          <input
            type="search"
            placeholder="Search name / company / email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search contacts"
            style={inputStyle}
          />
          <button type="submit" style={secondaryButtonStyle}>Search</button>
          {appliedSearch && (
            <button
              type="button"
              onClick={() => { setSearch(''); setAppliedSearch(''); }}
              style={secondaryButtonStyle}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Filter by label">
          <button
            type="button"
            onClick={() => setLabelFilter(null)}
            style={labelFilter === null ? activeChipStyle : chipStyle}
          >
            All
          </button>
          {CONTACT_LABELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLabelFilter((cur) => (cur === l.id ? null : l.id))}
              style={labelFilter === l.id ? activeChipStyle : chipStyle}
              title={l.description}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div role="alert" style={errorStyle}>{errorMessage}</div>
      )}

      {/* Table */}
      <div style={tableWrapperStyle}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {appliedSearch || labelFilter ? 'No contacts match this filter.' : 'No contacts yet. Click "+ New contact" to add the first one.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Labels</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--theme-border, #e5e7eb)' }}>
                  <td style={tdStyle}>
                    <Link
                      href={`/admin/contacts/${c.id}`}
                      style={{ color: 'var(--theme-accent, #3b82f6)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {c.name}
                    </Link>
                    {c.title && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{c.title}</div>
                    )}
                  </td>
                  <td style={tdStyle}>{c.company ?? '—'}</td>
                  <td style={tdStyle}>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} style={{ color: 'inherit' }}>{c.email}</a>
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{c.phone}</a>
                    ) : '—'}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {c.labels.map((id) => {
                        const def = findContactLabel(id);
                        return (
                          <span
                            key={id}
                            style={smallChipStyle}
                            title={def?.description ?? `Custom label "${id}"`}
                          >
                            {def?.label ?? id}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewDialog && (
        <NewContactDialog
          open={showNewDialog}
          onClose={() => setShowNewDialog(false)}
          onCreated={(created) => {
            setShowNewDialog(false);
            // Navigate straight to the new profile so the surveyor
            // can add details.
            router.push(`/admin/contacts/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--theme-accent, #3b82f6)',
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, white)',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: 600,
};
const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '0.9rem',
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'var(--theme-bg-surface, white)',
  fontSize: '0.95rem',
};
const chipStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--theme-border, #e5e7eb)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '0.8rem',
};
const activeChipStyle: React.CSSProperties = {
  ...chipStyle,
  background: 'var(--theme-accent, #3b82f6)',
  color: 'var(--theme-accent-fg, white)',
  borderColor: 'var(--theme-accent, #3b82f6)',
};
const smallChipStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  background: 'color-mix(in srgb, var(--theme-accent, #3b82f6) 12%, transparent)',
  color: 'var(--theme-accent, #3b82f6)',
  fontSize: '0.72rem',
  whiteSpace: 'nowrap',
};
const tableWrapperStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border, #e5e7eb)',
  borderRadius: 10,
  overflow: 'hidden',
  background: 'var(--theme-bg-surface, white)',
};
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-muted, #6B7280)',
  background: 'var(--theme-bg-elevated, #f9fafb)',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
};
const errorStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--theme-danger, #ef4444) 12%, transparent)',
  border: '1px solid var(--theme-danger, #ef4444)',
  color: 'var(--theme-danger, #ef4444)',
  fontSize: '0.9rem',
};
