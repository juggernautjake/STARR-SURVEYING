// app/admin/login/page.tsx
'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import '../styles/AdminLogin.css';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/dashboard';
  const errorMessages: Record<string, string> = { AccessDenied: 'Access denied. Only @starr-surveying.com accounts are allowed.', OAuthCallback: 'Authentication error. Please try again.', Default: 'An error occurred. Please try again.' };
  const errorMessage = error ? (errorMessages[error] || errorMessages.Default) : null;

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <img src="/logos/Starr_Surveying_Red_White_Blue_Star_With_Surveyor.png" alt="Starr Surveying" className="admin-login__logo" />
        <h1 className="admin-login__title">Starr Surveying</h1>
        <p className="admin-login__subtitle">Sign in to access the admin panel</p>
        {errorMessage && <div className="admin-login__error">{errorMessage}</div>}
        <button className="admin-login__google-btn" onClick={() => signIn('google', { callbackUrl })}>
          <svg className="admin-login__google-icon" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
        <div className="admin-login__divider"><span className="admin-login__divider-text">Authorized Access Only</span></div>
        <p className="admin-login__notice">This panel is restricted to <strong>@starr-surveying.com</strong> Google Workspace accounts only.</p>
        <a href="/" className="admin-login__back">← Back to starr-surveying.com</a>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return <Suspense fallback={<div className="admin-login"><div className="admin-login__card">Loading...</div></div>}><LoginContent /></Suspense>;
}
