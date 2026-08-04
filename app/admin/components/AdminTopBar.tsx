// app/admin/components/AdminTopBar.tsx
'use client';

import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import NotificationBell from './NotificationBell';
import ClockInPill from './ClockInPill';
import InitialAvatar from './InitialAvatar';

import { clearAllPacketCaches } from '@/lib/research/packet-offline';

import type { UserRole } from '@/lib/auth-roles';
import { RouteIcon } from '@/lib/admin/route-icons';
import { Menu, Star } from 'lucide-react';

interface AdminTopBarProps { title: string; role: UserRole; onMenuToggle: () => void; }

/**
 * PWA W6e — the account dropdown's rows, in one place.
 *
 * Five items carried five near-identical inline styles, and each was ~34px tall — under the 40px
 * floor `audit-voice-mobile.mjs` holds controls to. **Adjacent menu items are the strongest case for
 * that floor**, and stronger than an isolated button: a mis-tap here does not do nothing, it does
 * something *else*. Missing "Sign out" and hitting "Customize Hub" is a different page; missing
 * "Privacy" and hitting "Theme" is a different settings screen.
 *
 * `minHeight` rather than more padding, so the rows grow to a reliable target without changing the
 * text's position inside them. Extracted rather than edited five times because five copies of one
 * rule is how the fifth stops matching — the defect this codebase has fixed more often than any
 * other.
 */
const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  minHeight: 40,
  padding: '0.6rem 0.85rem',
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.88rem',
};

/** The same row, with the hairline that separates it from the one above. */
const MENU_ITEM_DIVIDED: React.CSSProperties = {
  ...MENU_ITEM_STYLE,
  borderTop: '1px solid var(--theme-border)',
};

export default function AdminTopBar({ title, onMenuToggle }: AdminTopBarProps) {
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

  function UserMenu({ userName }: { userName: string }) {
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
          aria-label={`Account menu — ${userName}`}
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            // W6f — the button was exactly the avatar: 34×34, under the 40px floor. The AVATAR stays
            // 34 so the topbar looks unchanged; the button around it grows to 40. That distinction
            // is the whole fix — enlarging the avatar would be a visual change nobody asked for,
            // while enlarging the target is the thing a thumb needs.
            //
            // It matters more than its size suggests: this button is the only way into the account
            // menu, which is the only way to Sign out.
            minWidth: 40,
            minHeight: 40,
            padding: 0,
            border: 'none',
            background: 'transparent',
            borderRadius: '50%',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <InitialAvatar name={userName} size={34} />
        </button>
        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              minWidth: 220,
              background: 'var(--theme-bg-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            {/* Identity header — just the name + avatar. Roles aren't shown in
                the top bar or this menu; they live in profile / settings. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.85rem', borderBottom: '1px solid var(--theme-border)' }}>
              <InitialAvatar name={userName} size={32} />
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--theme-fg-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{userName}</div>
            </div>
            <Link
              role="menuitem"
              href="/admin/profile"
              onClick={() => setOpen(false)}
              style={MENU_ITEM_STYLE}
            >
              Profile + settings
            </Link>
            {/* "Theme + density" was a second entry here until 2026-08-04. Removed at the owner's
                request — *"it should just be an option that sits in the settings."* Both entries
                led to the same page, and a menu that lists a page and then one of its sections
                invites the reader to work out the difference. Settings is the single door. */}
            {/* Install — the PWA install walkthrough had ZERO inbound links until 2026-08-04.
                Owner: *"how do I download the app to be an app icon on my phone? I would think
                there would be something in the settings page."* The page existed; nothing pointed
                at it, which is this codebase's most common defect wearing its most literal form. */}
            <Link
              role="menuitem"
              href="/admin/install"
              onClick={() => setOpen(false)}
              style={MENU_ITEM_DIVIDED}
            >
              <RouteIcon name="Smartphone" size={15} /> Install app on your phone
            </Link>
            {/* Privacy settings — controls what co-workers see about you in
                the employee directory. Previously orphaned (no inbound link);
                surfaced here so every user can reach /admin/me/privacy. */}
            <Link
              role="menuitem"
              href="/admin/me/privacy"
              onClick={() => setOpen(false)}
              style={MENU_ITEM_DIVIDED}
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
              style={MENU_ITEM_DIVIDED}
            >
              <RouteIcon name="SquarePen" size={15} /> Customize Hub
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                // PWA plan W3 — drop cached research packets before the session ends. These are work
                // vehicles and shared tablets: a packet holds a customer's parcel research, and
                // localStorage has no expiry, so without this it outlives the session that fetched
                // it and greets whoever picks the device up next.
                try { clearAllPacketCaches(window.localStorage); } catch { /* storage unavailable */ }
                void signOut({ callbackUrl: '/admin/login' });
              }}
              style={{
                ...MENU_ITEM_DIVIDED,
                // A <button>, so it needs the things a Link does not: full width, left-aligned text,
                // no chrome. Everything else — including the 40px floor — comes from the shared row,
                // because "Sign out" is the item whose mis-tap costs most and it sits at the edge of
                // the menu where a thumb overshoots.
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid var(--theme-border)',
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
        <UserMenu userName={userName} />
      </div>
    </header>
  );
}
