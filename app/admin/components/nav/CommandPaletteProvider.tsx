'use client';
// app/admin/components/nav/CommandPaletteProvider.tsx
//
// Mounts the Cmd+K palette + wires the global keyboard shortcut +
// auto-tracks recents on every /admin/* navigation. Lives inside
// AdminLayoutClient's session-authenticated branch so the palette can
// read roles + isCompanyUser via useSession.
//
// Cmd+K (or Ctrl+K) toggles the palette from anywhere in the admin
// shell, including while typing in an input — the palette is the
// universal escape hatch. Other future nav shortcuts (Cmd+1..6,
// g-then-X chords) are gated to non-editable context per §10.

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAdminNavStore } from '@/lib/admin/nav-store';
import { WORKSPACES, WORKSPACE_ORDER } from '@/lib/admin/route-registry';

import CommandPalette from './CommandPalette';

export default function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const togglePalette = useAdminNavStore((s) => s.togglePalette);
  const closePalette = useAdminNavStore((s) => s.closePalette);
  const pushRecent = useAdminNavStore((s) => s.pushRecent);

  // Track recents on every admin route change. Skip the login page so
  // it doesn't pollute the list.
  useEffect(() => {
    if (!pathname) return;
    if (!pathname.startsWith('/admin/')) return;
    if (pathname === '/admin/login') return;
    pushRecent(pathname);
  }, [pathname, pushRecent]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePalette();
        return;
      }
      // Cmd+1..6 → jump to the matching workspace landing. Gated to
      // non-editable context per §10 so it doesn't steal the digit
      // from form inputs.
      if (meta && /^[1-6]$/.test(e.key)) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
          return;
        }
        const id = WORKSPACE_ORDER[Number(e.key) - 1];
        if (id) {
          e.preventDefault();
          router.push(WORKSPACES[id].href);
        }
        return;
      }
      if (e.key === 'Escape') {
        // Closing on Escape is also handled inside the modal's
        // onKeyDown when it has focus; the global listener is the
        // fallback when focus is elsewhere.
        closePalette();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePalette, closePalette, router]);

  return (
    <>
      {children}
      <CommandPalette />
    </>
  );
}
