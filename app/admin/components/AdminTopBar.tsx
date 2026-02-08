// app/admin/components/AdminTopBar.tsx
'use client';

import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import NotificationBell from './NotificationBell';

interface AdminTopBarProps { title: string; role: 'admin' | 'employee'; onMenuToggle: () => void; }

export default function AdminTopBar({ title, role, onMenuToggle }: AdminTopBarProps) {
  const { data: session } = useSession();
  const [xp, setXp] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    fetch('/api/admin/xp')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.balance) {
          setXp({ current: d.balance.current_balance || 0, total: d.balance.total_earned || 0 });
        }
      })
      .catch(() => {});
  }, []);

  const userName = session?.user?.name || 'User';

  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        <button className="admin-topbar__hamburger" onClick={onMenuToggle} aria-label="Toggle sidebar">&#x2630;</button>
        <h1 className="admin-topbar__title">{title}</h1>
      </div>
      <div className="admin-topbar__right">
        {/* XP Counter — clickable, links to store */}
        {xp !== null && (
          <Link href="/admin/rewards/store" className="admin-topbar__xp" title="Click to spend reward points!">
            <span className="admin-topbar__xp-icon">&#x2B50;</span>
            <span className="admin-topbar__xp-current">{xp.current.toLocaleString()}</span>
            <span className="admin-topbar__xp-sep">/</span>
            <span className="admin-topbar__xp-total">{xp.total.toLocaleString()}</span>
            <span className="admin-topbar__xp-label">XP</span>
          </Link>
        )}
        {/* Username */}
        <span className="admin-topbar__username">{userName}</span>
        <NotificationBell />
        <span className={`admin-topbar__role-badge admin-topbar__role-badge--${role}`}>{role}</span>
        <button className="admin-topbar__signout" onClick={() => signOut({ callbackUrl: '/admin/login' })}>Sign Out</button>
      </div>
    </header>
  );
}
