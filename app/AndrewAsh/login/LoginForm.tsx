'use client';
// app/AndrewAsh/login/LoginForm.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';
import { passwordProblem } from '@/lib/voice/auth-rules';

interface Props {
  mode: 'login' | 'setup';
  requiresKey: boolean;
  /** True while a new person may still create their own account — see MAX_SELF_SETUP_ACCOUNTS. */
  canSetUp: boolean;
  next: string;
}

export default function LoginForm({ mode: initialMode, requiresKey, canSetUp, next }: Props): React.ReactElement {
  const router = useRouter();
  // Held in state rather than read from the URL on every toggle: switching between signing in and
  // creating an account should not lose what has already been typed into the shared fields.
  const [mode, setMode] = useState<'login' | 'setup'>(initialMode);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [signupKey, setSignupKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (mode === 'setup') {
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/voice/auth/${mode === 'setup' ? 'setup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, signupKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'That did not work.');

      // A full navigation, not router.push. The session is an httpOnly cookie set by the response, and
      // a client-side transition would render the studio layout against the server components already
      // in the router cache — which were rendered for a signed-OUT visitor and would bounce straight
      // back to this page. `refresh()` then `push()` also works and is one more round trip.
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="vaCard">
      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      {mode === 'setup' && (
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-login-name">
            Your name
          </label>
          <input
            id="va-login-name"
            className="vaInput"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            placeholder="Andrew Ash"
            required
          />
        </div>
      )}

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-login-email">
          {mode === 'setup' ? 'Username or email' : 'Username or email'}
        </label>
        <input
          id="va-login-email"
          type="text"
          className="vaInput"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </div>

      <div className="vaField">
        <label className="vaLabel" htmlFor="va-login-password">
          Password
        </label>
        <input
          id="va-login-password"
          type="password"
          className="vaInput"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          // `new-password` on setup so a password manager offers to GENERATE one rather than
          // autofilling an existing credential into what is actually an account-creation form.
          autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
          required
        />
        {mode === 'setup' && (
          <p className="vaHint">
            At least 10 characters. A short phrase you can remember beats a short scramble you cannot.
          </p>
        )}
      </div>

      {mode === 'setup' && requiresKey && (
        <div className="vaField">
          <label className="vaLabel" htmlFor="va-login-key">
            Setup key
          </label>
          <input
            id="va-login-key"
            className="vaInput"
            value={signupKey}
            onChange={(e) => setSignupKey(e.target.value)}
            required
          />
          <p className="vaHint">The value of VOICE_SIGNUP_KEY on this deployment.</p>
        </div>
      )}

      <button type="submit" className="vaBtn vaBtnSolid" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
        {busy ? (
          <>
            <Loader2 size={16} aria-hidden className="vaSpin" /> Working…
          </>
        ) : (
          <>
            <LogIn size={16} aria-hidden /> {mode === 'setup' ? 'Create my account' : 'Sign in'}
          </>
        )}
      </button>

      {/* ── THE WAY IN FOR SOMEONE WHO HAS NEVER BEEN HERE ──────────────────────────────────────
          Andrew should choose his own username, email and password rather than being handed
          credentials somebody else picked and typed into a chat. This link is the surfaced route to
          that, and it disappears the moment the studio is full — see MAX_SELF_SETUP_ACCOUNTS. */}
      {canSetUp && (
        <p className="vaLoginSwitch">
          {mode === 'setup' ? (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(null); }}>
                Sign in instead
              </button>
            </>
          ) : (
            <>
              First time here?{' '}
              <button type="button" onClick={() => { setMode('setup'); setError(null); }}>
                Create your account
              </button>
            </>
          )}
        </p>
      )}

      {!canSetUp && mode === 'login' && (
        <p className="vaHint" style={{ textAlign: 'center', marginTop: 16 }}>
          Need an account? Ask someone already signed in to add you from Settings → Team.
        </p>
      )}
    </form>
  );
}
