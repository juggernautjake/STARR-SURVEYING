'use client';
// app/platform/components/PlatformLayoutClient.tsx
//
// Operator console shell. Mirrors AdminLayoutClient's shape (session
// provider + role gate) but enforces isOperator instead of any org
// membership.
//
// Phase C-1 slice — minimal version: redirects non-operators to
// /admin/me; renders children with a brand-distinct gradient
// background so it's visually obvious you're on the platform side.
//
// IconRail / fly-outs / cross-tenant search etc. ship in subsequent
// C-* slices.
//
// Spec: docs/planning/in-progress/OPERATOR_CONSOLE.md §2 + §3.

import { SessionProvider, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function Inner({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    // Phase C-1 baseline: deny entry unless session.user.isOperator is
    // true. The isOperator flag lands when M-9 ships the auth refactor
    // that emits the new JWT shape; until then ALL access is denied
    // (defense in depth — the route is unreachable before it's safe).
    if (!session?.user) {
      router.replace('/admin/login');
      return;
    }
    if (!session.user.isOperator) {
      router.replace('/admin/me');
    }
  }, [session, status, router]);

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0F1419 0%, #1F2937 100%)',
        color: '#FFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}>
        Loading operator console…
      </div>
    );
  }

  // While the redirect resolves, render nothing (avoids flash of unstyled).
  if (!session?.user?.isOperator) {
    return null;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0F1419 0%, #1F2937 100%)',
      color: '#FFF',
      fontFamily: 'Inter, sans-serif',
    }}>
      <header style={{
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            background: '#F59E0B',
            color: '#0F1419',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
          }}>
            Operator
          </span>
          <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 600 }}>
            Starr Software · Platform Console
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.6)' }}>
          {session.user.email}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default function PlatformLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Inner>{children}</Inner>
    </SessionProvider>
  );
}
