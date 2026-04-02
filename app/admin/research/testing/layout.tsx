// app/admin/research/testing/layout.tsx — Developer guard for Testing Lab
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Admin or developer can access the Testing Lab */
function hasDevAccess(roles?: string[]): boolean {
  if (!roles) return false;
  return roles.includes('admin') || roles.includes('developer');
}

export default function TestingLabLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const allowed = hasDevAccess(session?.user?.roles);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/admin/login?callbackUrl=/admin/research/testing');
      return;
    }
    if (status === 'authenticated' && !allowed) {
      router.replace('/admin/dashboard');
    }
  }, [status, allowed, router]);

  if (status === 'loading') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '3px solid #7C3AED',
          borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }} />
        <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>Loading Testing Lab...</div>
      </div>
    );
  }

  // Prevent flash of content while redirect is in progress
  if (!session?.user || !allowed) return null;

  return <>{children}</>;
}
