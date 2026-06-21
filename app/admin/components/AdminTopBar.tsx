// app/admin/components/AdminTopBar.tsx
'use client';

import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import NotificationBell from './NotificationBell';
import ClockInPill from './ClockInPill';

import type { UserRole } from '@/lib/auth';
import { RouteIcon } from '@/lib/admin/route-icons';
import { Menu, Star } from 'lucide-react';

interface AdminTopBarProps { title: string; role: UserRole; onMenuToggle: () => void; }

export default function AdminTopBar({ title, role, onMenuToggle }: AdminTopBarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [xp, setXp] = useState<{ current: number; total: number } | null>(null);

  const refreshXp = useCallback(() => {
    fetch('/api/admin/xp')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.balance) {
          setXp({ current: d.balance.current_balance || 0, total: d.balance.total_earned || 0 });
        }
      })
      .catch(() => {});
  }, []);

  // Refresh XP on mount and on navigation
  useEffect(() => { refreshXp(); }, [pathname, refreshXp]);

  // Listen for custom xp-updated events from other components
  useEffect(() => {
    const handler = () => refreshXp();
    window.addEventListener('xp-updated', handler);
    return () => window.removeEventListener('xp-updated', handler);
  }, [refreshXp]);

  const userName = session?.user?.name || 'User';

  function UserMenu({ userName, role }: { userName: string; role: UserRole }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      function onDocClick(e: MouseEvent) {
        if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      }
      function onEsc(e: KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
      }
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onEsc);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('keydown', onEsc);
      };
    }, [open]);

    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid var(--theme-border)',
            color: 'var(--theme-fg-primary)',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontWeight: 600 }}>{userName}</span>
          <span className={`admin-topbar__role-badge admin-topbar__role-badge--${role}`} style={{ fontSize: '0.7rem' }}>
            {role}
          </span>
          <span aria-hidden style={{ fontSize: '0.7em', opacity: 0.6 }}>▾</span>
        </button>
        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              minWidth: 200,
              background: 'var(--theme-bg-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            <Link
              role="menuitem"
              href="/admin/me?tab=profile"
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '0.6rem 0.85rem', textDecoration: 'none', color: 'var(--theme-fg-primary)', fontSize: '0.88rem' }}
            >
              Profile + settings
            </Link>
            <Link
              role="menuitem"
              href="/admin/me?tab=profile&sub=themes"
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '0.6rem 0.85rem', textDecoration: 'none', color: 'var(--theme-fg-primary)', fontSize: '0.88rem', borderTop: '1px solid var(--theme-border)' }}
            >
              Theme + density
            </Link>
            {/* Privacy settings — controls what co-workers see about you in
                the employee directory. Previously orphaned (no inbound link);
                surfaced here so every user can reach /admin/me/privacy. */}
            <Link
              role="menuitem"
              href="/admin/me/privacy"
              onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', textDecoration: 'none', color: 'var(--theme-fg-primary)', fontSize: '0.88rem', borderTop: '1px solid var(--theme-border)' }}
            >
              <RouteIcon name="Lock" size={15} /> Privacy
            </Link>
            {/* Slice 197 — entry into hub edit mode from anywhere in
                the admin app. /admin/me?edit=1 auto-triggers
                useHubStore.enterEditMode() in HubMeClient. */}
            <Link
              role="menuitem"
              href="/admin/me?edit=1"
              onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', textDecoration: 'none', color: 'var(--theme-fg-primary)', fontSize: '0.88rem', borderTop: '1px solid var(--theme-border)' }}
            >
              <RouteIcon name="SquarePen" size={15} /> Customize Hub
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.6rem 0.85rem',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid var(--theme-border)',
                color: 'var(--theme-fg-primary)',
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        <button className="admin-topbar__hamburger" onClick={onMenuToggle} aria-label="Toggle sidebar"><Menu size={18} strokeWidth={2} /></button>
        <h1 className="admin-topbar__title">{title}</h1>
      </div>
      <div className="admin-topbar__right">
        {/* Clock-in pill — Slice 89. Hidden for student-only / teacher-only. */}
        <ClockInPill />
        {/* XP Counter — clickable, links to store */}
        {xp !== null && (
          <Link href="/admin/rewards" className="admin-topbar__xp" title="Click to spend reward points!">
            <span className="admin-topbar__xp-icon"><Star size={13} strokeWidth={2} fill="currentColor" /></span>
            <span className="admin-topbar__xp-current">{xp.current.toLocaleString()}</span>
            <span className="admin-topbar__xp-sep">/</span>
            <span className="admin-topbar__xp-total">{xp.total.toLocaleString()}</span>
            <span className="admin-topbar__xp-label">XP</span>
          </Link>
        )}
        <NotificationBell />
        <UserMenu userName={userName} role={role} />
      </div>
    </header>
  );
}
