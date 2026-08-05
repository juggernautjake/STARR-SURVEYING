'use client';
// app/admin/components/NotificationNudge.tsx
//
// "Set it to display notifications by default." A browser will not let an app grant itself
// permission — it needs one tap, and iOS Safari refuses even to prompt outside a home-screen
// install. So "by default" is two behaviours, both driven by the shared `useAdminPush` hook:
//
//   1. If permission is ALREADY granted but this device has no subscription, the hook subscribes
//      SILENTLY (autoEnableIfGranted) — so notifications survive a reinstall or a new session
//      without anyone re-doing anything, which is as close to "on by default" as a browser permits.
//   2. If permission has never been asked, this shows a slim, dismissible bar with the single tap
//      the browser requires. Dismissal is remembered so it nags once, not forever.
//
// Mounted app-wide in the admin layout so the prompt is not hidden on /admin/install where only
// someone already looking for it would find it.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAdminPush } from '@/lib/push/use-admin-push';

const DISMISS_KEY = 'starr-notif-nudge-dismissed';
// The admin layout wraps the auth pages too, so without this the nudge appears on the login screen —
// where "Turn on" would fire a permission prompt and then 401 on the subscribe (no session yet).
// Subscribing requires a signed-in session, so the nudge has no business rendering on these.
const AUTH_PATH = /\/(login|register|signup|forgot|reset)(\/|$|\?)/i;

export default function NotificationNudge() {
  const pathname = usePathname();
  const { state, subscribe } = useAdminPush({ autoEnableIfGranted: true });
  const [dismissed, setDismissed] = useState(true); // default hidden until we read storage

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  // Only the `ready` state is actionable here — supported, configured, installed where iOS needs it,
  // permission not yet decided, and not already subscribed. Every other state is handled on
  // /admin/install (unconfigured, ios-not-installed, denied) or needs nothing (subscribed, checking),
  // so the nudge stays silent for them rather than duplicating those explanations in a bar.
  if (dismissed || state !== 'ready' || (pathname && AUTH_PATH.test(pathname))) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode — nag next load, harmless */ }
  };

  return (
    <div className="notif-nudge" role="region" aria-label="Turn on notifications">
      <span className="notif-nudge__icon" aria-hidden>🔔</span>
      <span className="notif-nudge__text">
        Turn on notifications to get job assignments, new leads, hours and messages the moment they
        happen — on this device, even when the app is closed.
      </span>
      <button type="button" className="notif-nudge__enable" onClick={() => void subscribe()}>
        Turn on
      </button>
      <button type="button" className="notif-nudge__dismiss" aria-label="Not now" onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
