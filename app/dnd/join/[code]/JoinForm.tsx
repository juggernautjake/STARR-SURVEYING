// app/dnd/join/[code]/JoinForm.tsx — the account-creation form on an invite (Phase B, B4).
//
// Split out of page.tsx by P14-10b so the page itself can be a SERVER component and resolve which
// campaign the invite is for. The form is unchanged: it still reads the code from the route params and
// posts to auth/register, which remains the only thing that judges the code.
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from '@/app/dnd/_ui/hextech.module.css';

export default function JoinForm() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = String(params?.code ?? '');

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Name + password only — the platform doesn't collect an email (Slice 36). The name is the
      // identity; the invite `code` attaches this new account to the campaign.
      const res = await fetch('/api/dnd/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name: displayName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create your account.');
        return;
      }
      router.push('/dnd');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* The heading moved to the server page (P14-10b), which is the only layer that can name the
          campaign this invite is for. This component is now the FORM, and its wrapper markup is the
          page's. */}
        <form className={styles.panel} onSubmit={onSubmit} style={{ marginTop: 0 }}>
          {error && <div className={styles.error}>{error}</div>}

          <label className={styles.field}>
            <span className={styles.label}>Display Name</span>
            <input
              className={styles.input}
              type="text"
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Confirm Password</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              minLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create Account'}
          </button>

          <div className={styles.divider}>
            <span className={styles.diamond} />
          </div>
          <p className={styles.hint}>
            Already have an account?{' '}
            <a className={styles.link} href="/dnd">
              Sign in
            </a>
          </p>
        </form>
    </>
  );
}
