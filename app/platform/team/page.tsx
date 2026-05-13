'use client';
// app/platform/team/page.tsx
//
// Operator team list + invite. Only platform_admin can invite new
// operators. Two-person rule for production-impact actions (refund
// > $500, comp > $200, force-update for premium accounts) lands
// with C-9 follow-up.
//
// Phase C-9 of OPERATOR_CONSOLE.md.

import { useEffect, useState } from 'react';

interface OperatorRow {
  email: string;
  name: string;
  role: string;
  status: string;
  invitedBy: string | null;
  invitedAt: string | null;
  lastSigninAt: string | null;
  mfaEnrolledAt: string | null;
}

const ROLES = [
  { value: 'platform_admin',     label: 'Platform admin (full ops)' },
  { value: 'platform_billing',   label: 'Billing (billing writes)' },
  { value: 'platform_support',   label: 'Support (support writes)' },
  { value: 'platform_developer', label: 'Developer (dev + health, read-only)' },
  { value: 'platform_observer',  label: 'Observer (read-only)' },
];

const ROLE_COLORS: Record<string, string> = {
  platform_admin:     '#EF4444',
  platform_billing:   '#FCD34D',
  platform_support:   '#10B981',
  platform_developer: '#3B82F6',
  platform_observer:  '#9CA3AF',
};

export default function PlatformTeamPage() {
  const [operators, setOperators] = useState<OperatorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draftEmail, setDraftEmail] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftRole, setDraftRole] = useState('platform_support');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/platform/team', { cache: 'no-store' });
      if (!res.ok) {
        setError(`Couldn't load operators (status ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { operators: OperatorRow[] };
      setOperators(data.operators);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  }

  useEffect(() => { load(); }, []);

  async function invite() {
    if (!draftEmail.trim() || !draftName.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/platform/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: draftEmail.trim(), name: draftName.trim(), role: draftRole }),
      });
      if (res.ok) {
        setComposing(false);
        setDraftEmail(''); setDraftName(''); setDraftRole('platform_support');
        await load();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error ?? `Failed (status ${res.status}).`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.8rem', margin: '0 0 0.25rem' }}>
            Team
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
            Operators with access to the Starr Software platform console. MFA required at sign-in.
          </p>
        </div>
        {!composing && (
          <button onClick={() => setComposing(true)} style={primaryBtnStyle}>+ Invite operator</button>
        )}
      </header>

      {composing && (
        <section style={composerStyle}>
          <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: '1.05rem', margin: '0 0 0.85rem' }}>Invite operator</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.7rem' }}>
            <label style={fieldStyle}>
              <span>Email</span>
              <input value={draftEmail} onChange={(e) => setDraftEmail(e.target.value)} type="email" style={inputStyle} placeholder="operator@starr-surveying.com" />
            </label>
            <label style={fieldStyle}>
              <span>Display name</span>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} style={inputStyle} placeholder="Hank Maddux" />
            </label>
            <label style={fieldStyle}>
              <span>Role</span>
              <select value={draftRole} onChange={(e) => setDraftRole(e.target.value)} style={inputStyle}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          </div>
          {formError && <div style={{ marginTop: '0.6rem', color: '#FCA5A5', fontSize: '0.85rem' }}>{formError}</div>}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={() => setComposing(false)} disabled={submitting} style={secondaryBtnStyle}>Cancel</button>
            <button onClick={invite} disabled={!draftEmail.trim() || !draftName.trim() || submitting} style={primaryBtnStyle}>
              {submitting ? 'Adding…' : 'Add operator'}
            </button>
          </div>
        </section>
      )}

      {error ? (
        <div style={emptyStyle}>{error}</div>
      ) : !operators ? (
        <div style={emptyStyle}>Loading…</div>
      ) : operators.length === 0 ? (
        <div style={emptyStyle}>No operators yet. Add the first one above.</div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>MFA</th>
              <th style={thStyle}>Last sign-in</th>
              <th style={thStyle}>Invited by</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((o) => (
              <tr key={o.email}>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.82rem' }}>{o.email}</td>
                <td style={tdStyle}>{o.name}</td>
                <td style={tdStyle}>
                  <span style={{ color: ROLE_COLORS[o.role] ?? '#9CA3AF', fontWeight: 600, fontSize: '0.82rem' }}>
                    {o.role}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: o.status === 'active' ? '#10B981' : '#9CA3AF', fontSize: '0.82rem' }}>
                    {o.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {o.mfaEnrolledAt ? '✓ enrolled' : '— not yet'}
                </td>
                <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {o.lastSigninAt ? new Date(o.lastSigninAt).toLocaleString() : '—'}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'JetBrains Mono,monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                  {o.invitedBy ?? '—'}
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
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  color: '#FFF',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontSize: '0.82rem',
  color: 'rgba(255,255,255,0.65)',
};

const composerStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '1.25rem',
  marginBottom: '1.5rem',
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

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.1rem',
  background: 'rgba(255,255,255,0.06)',
  color: '#FFF',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  fontWeight: 500,
  fontSize: '0.88rem',
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
