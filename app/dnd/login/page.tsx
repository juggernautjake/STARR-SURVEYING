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
  // Pseudo-login: a name + password, no email, no invite. Toggle between signing in and creating
  // an account on the same form.
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Both at least four characters — matches the server; caught here for an instant message.
    if (name.trim().length < 4) { setError('Name must be at least 4 characters.'); return; }
    if (password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    setBusy(true);
    try {
      const res = await fetch(creating ? '/api/dnd/auth/signup' : '/api/dnd/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (creating ? 'Could not create the account.' : 'Login failed.'));
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
          <p className={styles.subtitle}>{creating ? 'Create an account to keep your characters' : 'Sign in to continue your adventure'}</p>

          {error && <div className={styles.error}>{error}</div>}

          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              type="text"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="At least 4 characters"
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              className={styles.input}
              type="password"
              autoComplete={creating ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              required
            />
          </label>

          <button className={styles.button} type="submit" disabled={busy}>
            {busy ? (creating ? 'Creating…' : 'Signing in…') : creating ? 'Create Account' : 'Sign In'}
          </button>

          <div className={styles.divider}>
            <span className={styles.diamond} />
          </div>
          {/* No email, no invite — just a name and a password. This is a pseudo-login to keep each
              player's stuff separate, not real authentication. */}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => { setCreating((c) => !c); setError(null); }}
          >
            {creating ? '← Have an account? Sign in' : 'New here? Create an account'}
          </button>
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
