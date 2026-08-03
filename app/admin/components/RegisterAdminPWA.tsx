'use client';
// app/admin/components/RegisterAdminPWA.tsx — install the surveying app's worker, and be able to
// uninstall it (PWA plan W2).
//
// GATED OFF BY DEFAULT, behind `NEXT_PUBLIC_ADMIN_PWA`. A service worker is the one piece of
// front-end code that outlives the deploy that installed it: get it wrong and every user keeps the
// broken version until they clear site data, which they will not know to do. That risk is higher
// here than anywhere else in this repo, because this is the app a business runs on — jobs, payroll,
// receipts, invoices.
//
// THE OFF PATH ACTIVELY UNINSTALLS, copied deliberately from `RegisterTabletopPWA`. A flag that
// merely skips registration leaves an already-installed worker running forever — the switch would
// turn the feature on and never off again, which is the opposite of what a killswitch is for.
//
// AND IT UNREGISTERS ONLY ITS OWN SCOPE. `/dnd/` and `/AndrewAsh/` each run their own worker. A
// broad `unregister()` from here would take both of them out, from a component with no business
// touching either — which is exactly the failure the tabletop worker's comment warns about in the
// other direction.
import { useEffect } from 'react';

const SW_URL = '/admin/sw.js';
const SCOPE = '/admin/';

export default function RegisterAdminPWA() {
  const enabled = process.env.NEXT_PUBLIC_ADMIN_PWA === '1';

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    async function enable() {
      try {
        await navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
      } catch {
        // A failed registration is not worth an error in front of somebody filing a receipt. The app
        // works without it — that is the whole point of a progressive enhancement.
      }
    }

    async function disable() {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (reg.scope.endsWith(SCOPE)) await reg.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith('starr-admin-')).map((k) => caches.delete(k)));
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
