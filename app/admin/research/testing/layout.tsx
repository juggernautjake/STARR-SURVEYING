// app/admin/research/testing/layout.tsx — Admin-only guard for Testing Lab
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function TestingLabLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role || 'employee';

  useEffect(() => {
    if (status === 'authenticated' && userRole !== 'admin') {
      router.replace('/admin/dashboard');
    }
  }, [status, userRole, router]);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>Loading Testing Lab...</div>
      </div>
    );
  }

  if (!session?.user || userRole !== 'admin') return null;

  return <>{children}</>;
}
