// app/admin/components/AdminTopBar.tsx
'use client';

import { signOut } from 'next-auth/react';

interface AdminTopBarProps { title: string; role: 'admin' | 'employee'; onMenuToggle: () => void; }

export default function AdminTopBar({ title, role, onMenuToggle }: AdminTopBarProps) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        <button className="admin-topbar__hamburger" onClick={onMenuToggle} aria-label="Toggle sidebar">☰</button>
        <h1 className="admin-topbar__title">{title}</h1>
      </div>
      <div className="admin-topbar__right">
        <span className={`admin-topbar__role-badge admin-topbar__role-badge--${role}`}>{role}</span>
        <button className="admin-topbar__signout" onClick={() => signOut({ callbackUrl: '/admin/login' })}>Sign Out</button>
      </div>
    </header>
  );
}
