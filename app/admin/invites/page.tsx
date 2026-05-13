'use client';
// app/admin/invites/page.tsx
//
// Org invite management — admins invite coworkers, see pending +
// historical invites, revoke pending ones.
//
// Phase D-3 of CUSTOMER_PORTAL.md (smallest viable slice — composer
// + list + revoke; the /accept-invite/[token] consumer page lands
// after M-9 auth refactor enables active-org switching).

import { useEffect, useState } from 'react';

interface InviteRow {
  id: string;
  inviteeEmail: string;
  inviterEmail: string;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const ROLES = [
  { value: 'admin',      label: 'Admin' },
  { value: 'surveyor',   label: 'Surveyor' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
  { value: 'field_only', label: 'Field only' },
  { value: 'view_only',  label: 'View only' },
];

const STATUS_COLORS: Record<string, string> = {
  pending:  '#F59E0B',
  accepted: '#10B981',
  revoked:  '#9CA3AF',
  expired:  '#EF4444',
};

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('surveyor');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/invites', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load invites (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { invites: InviteRow[] };
      setInvites(data.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }

  useEffect(() => { load(); }, []);

  async function send() {
    if (!email.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeEmail: email.trim(), role }),
      });
      if (res.ok) {
        setEmail('');
        setRole('surveyor');
        await load();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error ?? `Failed (status ${res.status}).`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this invite?')) return;
    const res = await fetch(`/api/admin/invites/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  return (
    <div style={{ maxWidth: 1000, padding: '1.5rem' }}>
      <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.6rem', margin: '0 0 0.5rem' }}>Team invites</h1>
      <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 1.5rem' }}>
        Invite coworkers to your organization. They&apos;ll get an email with a one-use signup link.
      </p>

      <section style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coworker@firm.com"
              style={inputStyle}
              autoComplete="off"
            />
          </label>
          <label style={{ flex: '0 0 180px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button onClick={send} disabled={!email.trim() || submitting} style={primaryBtnStyle}>
            {submitting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        {formError && (
          <div style={{ marginTop: '0.6rem', color: '#FCA5A5', fontSize: '0.85rem' }}>{formError}</div>
        )}
      </section>

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !invites ? (
        <div style={emptyStyle}>Loading…</div>
      ) : invites.length === 0 ? (
        <div style={emptyStyle}>No invites yet. Send your first above.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Invited by</th>
              <th style={thStyle}>Sent</th>
              <th style={thStyle}>Expires</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id}>
                <td style={tdStyle}>{inv.inviteeEmail}</td>
                <td style={{ ...tdStyle, fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{inv.role}</td>
                <td style={tdStyle}>
                  <span style={{ color: STATUS_COLORS[inv.status] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.82rem' }}>
                    {inv.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {inv.inviterEmail}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                  {new Date(inv.createdAt).toLocaleDateString()}
                </td>
                <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                  {new Date(inv.expiresAt).toLocaleDateString()}
                </td>
                <td style={tdStyle}>
                  {inv.status === 'pending' && (
                    <button onClick={() => revoke(inv.id)} style={revokeBtnStyle}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#FFF',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: '#FCD34D',
  color: '#0F1419',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const revokeBtnStyle: React.CSSProperties = {
  padding: '0.3rem 0.7rem',
  background: 'transparent',
  color: '#FCA5A5',
  border: '1px solid rgba(252,165,165,0.4)',
  borderRadius: 5,
  fontSize: '0.78rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const emptyStyle: React.CSSProperties = {
  padding: '2rem',
  textAlign: 'center',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: 'rgba(255,255,255,0.6)',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  borderCollapse: 'separate',
  borderSpacing: 0,
  overflow: 'hidden',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.55rem 0.85rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.85rem',
  fontSize: '0.88rem',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};
