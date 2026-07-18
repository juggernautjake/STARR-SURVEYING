// app/dnd/join/[code]/page.tsx — invite acceptance → account creation (Phase B, B4).
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from '../../_ui/hextech.module.css';

export default function DndJoinPage() {
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
    <div className={styles.root}>
      <div className={styles.screen}>
        <form className={styles.panel} onSubmit={onSubmit}>
          <p className={styles.brand}>Starr Tabletop</p>
          <h1 className={styles.title}>Join Campaign</h1>
          <p className={styles.subtitle}>Create your account to take your seat at the table</p>

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
      </div>
    </div>
  );
}
