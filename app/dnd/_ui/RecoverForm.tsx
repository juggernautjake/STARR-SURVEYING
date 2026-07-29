'use client';
// app/dnd/_ui/RecoverForm.tsx — redeem a recovery code (P2-4, audit F-3).
//
// The page someone reaches when their characters are otherwise gone for good. It is deliberately plain:
// name, code, new password. Anyone here is already having a bad day.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

export default function RecoverForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/dnd/auth/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, newPassword }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error ?? 'Could not recover that account.'); return; }
      // Redeeming signs you in, so there is nothing further to do — going to the hub lands on the
      // characters someone just got back, which is the point of the whole slice.
      router.push('/dnd');
      router.refresh();
    } catch { setError('Network error — please try again.'); } finally { setBusy(false); }
  }

  return (
    <div className={styles.root}>
      <div className={styles.screen}>
        <form className={styles.panel} onSubmit={submit}>
          <p className={styles.brand}>Starr Tabletop</p>
          <h1 className={styles.title}>Recover your account</h1>
          <p className={styles.subtitle}>
            Enter your name and the recovery code you saved, then choose a new password.
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="username" required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Recovery code</span>
            {/* Hyphens and case are normalised server-side, so there is no reason to be strict here about
                how someone types back what they copied off a piece of paper. */}
            <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="ACDE-FGHJ-KLMN-PQRT-UVWX" style={{ fontFamily: 'monospace' }} required />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>New password</span>
            <input className={styles.input} type="password" minLength={8} value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? 'Recovering…' : 'Recover account'}
          </button>

          <div className={styles.divider}><span className={styles.diamond} /></div>
          <p style={{ fontSize: 11.5, color: 'var(--hx-muted)', margin: 0, lineHeight: 1.5 }}>
            No recovery code? There is no email on these accounts, so there is no other way to reset a
            password — ask your DM, who can move your characters to a new name.
          </p>
          <a className={styles.buttonGhost} href="/dnd">← Back</a>
        </form>
      </div>
    </div>
  );
}
