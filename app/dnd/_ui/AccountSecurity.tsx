'use client';
// app/dnd/_ui/AccountSecurity.tsx — change your password, and get a way back in (P2-4, audit F-3).
//
// Before this there was no way to change a /dnd password at all, and a forgotten one made every character,
// variant and membership on the account permanently unreachable. Both controls live together because they
// answer the same question — "what happens to my account if something goes wrong" — and separating them
// would leave the recovery code somewhere nobody looks until it is too late to generate one.
//
// THE CODE IS SHOWN EXACTLY ONCE. Only its bcrypt hash is stored, so nothing on the server can reproduce
// it. That makes the moment it is on screen the only moment it exists in readable form, which is why it
// renders in a deliberately unmissable block with a copy button rather than as a line of body text.
import { useState } from 'react';
import styles from './hextech.module.css';

export default function AccountSecurity() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const [codePassword, setCodePassword] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true); setPwMsg(null);
    try {
      const r = await fetch('/api/dnd/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setPwMsg(j.error ?? 'Could not change your password.'); return; }
      setPwMsg('Password changed.');
      setCurrentPassword(''); setNewPassword('');
    } catch { setPwMsg('Network error — please try again.'); } finally { setPwBusy(false); }
  }

  async function generateCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeBusy(true); setCodeMsg(null); setCode(null);
    try {
      const r = await fetch('/api/dnd/auth/recovery-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: codePassword }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setCodeMsg(j.error ?? 'Could not generate a code.'); return; }
      setCode(j.code as string);
      setCodePassword('');
    } catch { setCodeMsg('Network error — please try again.'); } finally { setCodeBusy(false); }
  }

  const field = { padding: '8px 10px', fontSize: 13, background: 'rgba(1,10,19,0.55)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)', borderRadius: 6, width: '100%' } as const;
  const label = { fontSize: 11.5, color: 'var(--hx-teal-1)', fontWeight: 700, letterSpacing: '0.05em' } as const;

  return (
    <section className={styles.framedPanel} style={{ padding: '12px 16px', display: 'grid', gap: 14, marginTop: 14 }}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle} style={{ margin: 0 }}>Account security</h2>

      <form onSubmit={changePassword} style={{ display: 'grid', gap: 8 }}>
        <span style={label}>CHANGE PASSWORD</span>
        {/* The current password is required even though you are signed in: a session on a shared machine
            must not be enough to lock the real owner out of their own account. */}
        <input type="password" aria-label="Current password" placeholder="Current password" autoComplete="current-password"
          value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={field} required />
        <input type="password" aria-label="New password" placeholder="New password (at least 8 characters)" autoComplete="new-password"
          minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={field} required />
        <button className={styles.hexBtn} type="submit" disabled={pwBusy} style={{ justifySelf: 'start' }}>
          {pwBusy ? 'Changing…' : 'Change password'}
        </button>
        {pwMsg && <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{pwMsg}</span>}
      </form>

      <div style={{ borderTop: '1px solid var(--hx-line)', paddingTop: 12, display: 'grid', gap: 8 }}>
        <span style={label}>RECOVERY CODE</span>
        <p style={{ fontSize: 12.5, color: 'var(--hx-muted)', margin: 0, lineHeight: 1.5 }}>
          There is no email on this account, so a forgotten password cannot be reset by mail. A recovery
          code is the way back in — <strong style={{ color: 'var(--hx-text)' }}>write it down somewhere
          safe</strong>. It is shown once, works once, and generating a new one replaces the old.
        </p>
        <form onSubmit={generateCode} style={{ display: 'grid', gap: 8 }}>
          <input type="password" aria-label="Your password, to confirm" placeholder="Your password" autoComplete="current-password"
            value={codePassword} onChange={(e) => setCodePassword(e.target.value)} style={field} required />
          <button className={styles.hexBtn} type="submit" disabled={codeBusy} style={{ justifySelf: 'start' }}>
            {codeBusy ? 'Generating…' : 'Generate a recovery code'}
          </button>
        </form>
        {codeMsg && <span style={{ fontSize: 12.5, color: 'var(--hx-muted)' }}>{codeMsg}</span>}
        {code && (
          // The one moment this string exists in readable form anywhere.
          <div style={{ border: '1px solid var(--hx-gold-2)', background: 'rgba(var(--hx-teal-1-rgb),0.06)', padding: '10px 12px', borderRadius: 6, display: 'grid', gap: 6 }}>
            <strong style={{ fontFamily: 'monospace', fontSize: 17, letterSpacing: '0.08em', color: 'var(--hx-gold-2)' }}>{code}</strong>
            <span style={{ fontSize: 11.5, color: 'var(--hx-muted)' }}>
              Copy this now — it will not be shown again, and it cannot be looked up.
            </span>
            <button type="button" className={styles.hexBtn} style={{ justifySelf: 'start', fontSize: 11.5 }}
              onClick={() => navigator.clipboard?.writeText(code).catch(() => {})}>
              Copy
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
