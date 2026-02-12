// app/admin/login/page.tsx
'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import '../styles/AdminLogin.css';

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');
  const registered = searchParams.get('registered');
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const errorMessages: Record<string, string> = {
    AccessDenied: 'Access denied. Only @starr-surveying.com accounts can use Google sign-in.',
    OAuthCallback: 'Authentication error. Please try again.',
    CredentialsSignin: 'Invalid email or password.',
    Default: 'An error occurred. Please try again.',
  };
  const errorMessage = error ? (errorMessages[error] || errorMessages.Default) : null;

  async function handleCredentialsLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!email.trim() || !password) {
      setFormError('Email and password are required');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setFormError('Invalid email or password');
        setLoading(false);
        return;
      }

      // Success — redirect
      router.push(callbackUrl);
    } catch {
      setFormError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <img
          src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png"
          alt="Starr Surveying"
          className="admin-login__logo"
        />
        <h1 className="admin-login__title">Starr Surveying</h1>
        <p className="admin-login__subtitle">Sign in to the Learning Hub</p>

        {errorMessage && <div className="admin-login__error">{errorMessage}</div>}
        {registered && (
          <div className="admin-login__success">
            Account created successfully! Sign in below.
          </div>
        )}
        {formError && <div className="admin-login__error">{formError}</div>}

        {/* Google Sign-In for company employees */}
        <button
          className="admin-login__google-btn"
          onClick={() => signIn('google', { callbackUrl })}
        >
          <svg className="admin-login__google-icon" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
        <p className="admin-login__hint">For @starr-surveying.com employees</p>

        <div className="admin-login__divider">
          <span className="admin-login__divider-text">Or sign in with email</span>
        </div>

        {/* Email / Password Login */}
        <form onSubmit={handleCredentialsLogin} className="admin-login__form">
          <input
            type="email"
            className="admin-login__input"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            className="admin-login__input"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" className="admin-login__submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="admin-login__register-prompt">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="admin-login__register-link">Create one</Link>
        </p>

        <a href="/" className="admin-login__back">&larr; Back to starr-surveying.com</a>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="admin-login"><div className="admin-login__card">Loading...</div></div>}>
      <LoginContent />
    </Suspense>
  );
}
