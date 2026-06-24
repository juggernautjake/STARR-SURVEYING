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
  expired:  'var(--color-error)',
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
      <p style={{ color: '#4B5563', margin: '0 0 1.5rem' }}>
        Invite coworkers to your organization. They&apos;ll get an email with a one-use signup link.
      </p>

      <section style={{
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}>
        {/* form-row-alignment-2026-06-20 — the row uses align-items:
            flex-end so the input bottoms + the button bottom share
            a baseline. The button has flex-shrink: 0 so it never
            collapses or wraps onto its own line; the email grows
            via flex: 1 1 0 so the row can absorb width changes
            without pushing the button below the inputs. The
            inputs + button are all 36px tall so the baseline
            actually lines up. */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 200 }}>
            <span style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>Email</span>
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
            <span style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }}>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {/* invites-row-alignment-2026-06-22 — wrap the Send invite
              button in a column with the same Email/Role label
              structure so its 36px control lines up with the inputs'
              36px controls (the bare button had no label above and
              flex-end was bottom-aligning the BOX, but the input vs
              button intrinsic baselines drift a few pixels — same
              fix as the receipts / mileage / timeline toolbars). */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }} aria-label="Send invite">
            <span style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: 600 }} aria-hidden>&nbsp;</span>
            <button onClick={send} disabled={!email.trim() || submitting} style={primaryBtnStyle}>
              {submitting ? 'Sending…' : 'Send invite'}
            </button>
          </label>
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
        <div className="admin-table-wrap">
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
                <td style={{ ...tdStyle, fontSize: '0.82rem', color: '#4B5563' }}>{inv.role}</td>
                <td style={tdStyle}>
                  <span style={{ color: STATUS_COLORS[inv.status] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.82rem' }}>
                    {inv.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: '#6B7280' }}>
                  {inv.inviterEmail}
                </td>
                <td style={{ ...tdStyle, color: '#6B7280', fontSize: '0.78rem' }}>
                  {new Date(inv.createdAt).toLocaleDateString()}
                </td>
                <td style={{ ...tdStyle, color: '#6B7280', fontSize: '0.78rem' }}>
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
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 36,
  padding: '0 0.75rem',
  background: '#FFFFFF',
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  color: '#0F1419',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  height: 36,
  padding: '0 1.1rem',
  background: '#FCD34D',
  color: '#0F1419',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  flexShrink: 0,
  // Without this, when the row gets narrow enough the button
  // wraps to its own line and "floats" right of where the user
  // expects. Keeping flex-shrink: 0 + a sensible base width means
  // the button is the LAST thing to wrap, never the first.
  whiteSpace: 'nowrap',
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
  background: '#F9FAFB',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  color: '#6B7280',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  background: '#F9FAFB',
  border: '1px solid #E5E7EB',
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
  color: '#6B7280',
  borderBottom: '1px solid #E5E7EB',
  background: '#F9FAFB',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.85rem',
  fontSize: '0.88rem',
  borderBottom: '1px solid #F3F4F6',
};
