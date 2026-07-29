'use client';
// app/dnd/_ui/RegisterTabletopPWA.tsx — install the Tabletop worker, and be able to uninstall it (P10-5).
//
// GATED OFF BY DEFAULT, behind `NEXT_PUBLIC_DND_PWA`. A service worker is the one piece of front-end code
// that outlives the deploy that installed it: get it wrong and every visitor keeps the broken version until
// they clear site data, which they will not know to do. This one is scoped to `/dnd/` and cannot reach the
// surveying app either way, but "cannot break the business" is a lower bar than "verified", and this has
// not been driven in a browser.
//
// THE OFF PATH ACTIVELY UNINSTALLS. A flag that merely skips registration leaves an already-installed
// worker running forever — the switch would turn the feature on and never off again, which is the opposite
// of what a killswitch is for. With the flag off this unregisters any worker under our scope and drops its
// caches, so flipping the flag back is a real rollback.
import { useEffect } from 'react';

const SW_URL = '/dnd/sw.js';
const SCOPE = '/dnd/';

export default function RegisterTabletopPWA() {
  const enabled = process.env.NEXT_PUBLIC_DND_PWA === '1';

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    async function enable() {
      try {
        await navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
      } catch {
        // A failed registration is not worth an error in front of a player mid-session. The site works
        // without it — that is the whole design of a progressive enhancement.
      }
    }

    async function disable() {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          // Ours only. Unregistering by breadth would take out the business app's worker if one is ever
          // added, from a component that has no business touching it.
          if (reg.scope.endsWith(SCOPE)) await reg.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith('tabletop-')).map((k) => caches.delete(k)));
        }
      } catch {
        /* nothing to clean up, or the browser refused — either way there is nothing to tell the user */
      }
    }

    if (cancelled) return;
    void (enabled ? enable() : disable());
    return () => { cancelled = true; };
  }, [enabled]);

  return null;
}
