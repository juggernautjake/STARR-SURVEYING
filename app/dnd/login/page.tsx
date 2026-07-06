// app/dnd/login/page.tsx — Hextech-styled sign-in (Phase B, B3). Mobile-first.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../_ui/hextech.module.css';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only honor same-origin relative paths from the ?next= gate param (no
  // open-redirect: reject absolute URLs / protocol-relative //host).
  const nextRaw = searchParams.get('next') ?? '';
  const nextPath = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dnd';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dnd/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed.');
        return;
      }
      router.push(nextPath);
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
          <h1 className={styles.title}>Campaign Portal</h1>
          <p className={styles.subtitle}>Sign in to continue your adventure</p>

          {error && <div className={styles.error}>{error}</div>}

          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>

          <div className={styles.divider}>
            <span className={styles.diamond} />
          </div>
          <p className={styles.hint}>Have an invite link? Open it to create your account.</p>
        </form>
      </div>
    </div>
  );
}

export default function DndLoginPage() {
  // Suspense boundary required because LoginForm reads useSearchParams().
  return (
    <Suspense fallback={<div className={styles.root} />}>
      <LoginForm />
    </Suspense>
  );
}
