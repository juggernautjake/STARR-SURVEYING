// app/register/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import '../admin/styles/AdminLogin.css';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      // Success — redirect to login with pending approval message
      router.push('/admin/login?pending=true');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="register-page">
      <div className="register-card">
        <img
          src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png"
          alt="Starr Surveying"
          className="register-card__logo"
        />
        <h1 className="register-card__title">Create an Account</h1>
        <p className="register-card__subtitle">
          Register to access the Starr Surveying Learning Hub
        </p>

        {error && <div className="register-card__error">{error}</div>}

        <form onSubmit={handleSubmit} className="register-card__form">
          <div className="register-card__field">
            <label htmlFor="name" className="register-card__label">Full Name</label>
            <input
              id="name"
              type="text"
              className="register-card__input"
              placeholder="John Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="register-card__field">
            <label htmlFor="email" className="register-card__label">Email Address</label>
            <input
              id="email"
              type="email"
              className="register-card__input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="register-card__field">
            <label htmlFor="password" className="register-card__label">Password</label>
            <input
              id="password"
              type="password"
              className="register-card__input"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className="register-card__field">
            <label htmlFor="confirmPassword" className="register-card__label">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              className="register-card__input"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="register-card__submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="register-card__divider">
          <span className="register-card__divider-text">Already have an account?</span>
        </div>

        <Link href="/admin/login" className="register-card__login-link">
          Sign In
        </Link>

        <p className="register-card__notice">
          Starr Surveying employees should use <strong>Google Sign-In</strong> with their company email.
        </p>

        <Link href="/" className="register-card__back">&larr; Back to starr-surveying.com</Link>
      </div>
    </div>
  );
}
