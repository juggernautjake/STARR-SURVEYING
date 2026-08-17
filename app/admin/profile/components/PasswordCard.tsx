'use client';
// app/admin/profile/components/PasswordCard.tsx
//
// Owner, 2026-08-16: *"They should be able to both use the google login and the raw credentials to
// log in."*
//
// ── WHY THIS SCREEN DID NOT EXIST ───────────────────────────────────────────────────────────────
//
// The login page has always had an email + password form, and `lib/auth.ts` has always had a
// `Credentials` provider. What was missing was anywhere in the entire app to SET a password. An
// account created by signing in with Google gets `password_hash: ''` (the column is NOT NULL), so
// four of five active staff could type into that form forever and be told "Invalid email or
// password" — describing a wrong password, for an account that never had one.
//
// So this card's most important job is the sentence at the top: whether a password exists at all.
// A "change password" form shown to somebody who has none is the same trap in a nicer font.

import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password';

export function PasswordCard() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/me/password');
      if (!res.ok) return;
      const j = await res.json();
      setHasPassword(Boolean(j.hasPassword));
    } catch { /* the card still works; it just cannot pre-say which case you are in */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async () => {
    setError('');
    setDone('');
    // Checked here as well as on the server, because the mismatch case is the one worth catching
    // before a round-trip — it is the most common typo and the server cannot tell you WHICH field
    // was wrong.
    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    if (next.length < MIN_PASSWORD_LENGTH) { setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: next, currentPassword: current || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j?.error ?? `Could not save (HTTP ${res.status}).`); return; }
      setCurrent(''); setNext(''); setConfirm('');
      setHasPassword(true);
      setDone('Password saved. You can now sign in with your email and password.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }, [current, next, confirm]);

  const firstTime = hasPassword === false;

  return (
    <div className="admin-card" style={s.card}>
      <h3 style={s.h3}>
        <KeyRound size={15} strokeWidth={2} aria-hidden />
        Password sign-in
      </h3>

      {/* The status line is the feature. Everything else is a form. */}
      <p style={s.status}>
        {hasPassword === null && 'Checking…'}
        {hasPassword === true && 'You have a password set, so you can sign in with either your email and password or the Google button.'}
        {firstTime && 'You do not have a password yet — you can only sign in with the Google button. Set one here and you will be able to use either.'}
      </p>

      <div style={s.fields}>
        {/* Only asked for when there is one to prove. Showing a disabled "current password" box to
            somebody setting their first one is a field they cannot fill and cannot skip. */}
        {hasPassword === true && (
          <label style={s.label}>
            Current password
            <input
              type="password" value={current} autoComplete="current-password"
              onChange={(e) => { setCurrent(e.target.value); setError(''); }}
              style={s.input}
            />
          </label>
        )}
        <label style={s.label}>
          {firstTime ? 'Choose a password' : 'New password'}
          <input
            type="password" value={next} autoComplete="new-password"
            onChange={(e) => { setNext(e.target.value); setError(''); }}
            style={s.input}
          />
        </label>
        <label style={s.label}>
          Type it again
          <input
            type="password" value={confirm} autoComplete="new-password"
            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            style={s.input}
          />
        </label>
      </div>

      <p style={s.hint}>At least {MIN_PASSWORD_LENGTH} characters.</p>

      <div style={s.actions}>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !next || !confirm || (hasPassword === true && !current)}
          style={{ ...s.btn, ...(saving || !next || !confirm ? s.btnOff : null) }}
          title={next && confirm ? 'Save this password' : 'Fill in the new password twice'}
        >
          {saving ? 'Saving…' : firstTime ? 'Set password' : 'Change password'}
        </button>
        {error && <span role="alert" style={s.error}>{error}</span>}
        {done && <span role="status" style={s.done}>{done}</span>}
      </div>
    </div>
  );
}

// Bare `var(--theme-*)`, no hex fallbacks: `themes.css` is imported by the root layout so the tokens
// are always defined, and a literal fallback is dead code that only re-introduces the hard-coded
// colour the scanner exists to stop.
const s: Record<string, React.CSSProperties> = {
  card: { marginTop: '0.75rem', display: 'grid', gap: 10 },
  h3: {
    display: 'flex', alignItems: 'center', gap: 7, margin: 0,
    fontSize: '0.95rem', fontWeight: 600, color: 'var(--theme-fg-primary)',
  },
  status: { margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--theme-fg-secondary)' },
  fields: { display: 'grid', gap: 8, maxWidth: 380 },
  label: {
    display: 'grid', gap: 4, fontSize: 12, fontWeight: 600,
    color: 'var(--theme-fg-secondary)',
  },
  input: {
    height: 'var(--input-height)', boxSizing: 'border-box', padding: '0 10px',
    fontSize: 14, fontFamily: 'inherit',
    color: 'var(--theme-fg-primary)', background: 'var(--theme-bg-surface)',
    border: '1px solid var(--theme-border)', borderRadius: 6,
  },
  hint: { margin: 0, fontSize: 12, color: 'var(--theme-fg-muted)' },
  actions: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  btn: {
    height: 'var(--button-height)', padding: '0 16px',
    fontSize: 13, fontWeight: 600,
    color: 'var(--theme-accent-fg)', background: 'var(--theme-accent)',
    border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  btnOff: { background: 'var(--theme-border-strong)', cursor: 'not-allowed' },
  error: { fontSize: 12, color: 'var(--theme-danger)' },
  done: { fontSize: 12, color: 'var(--theme-success)' },
};
