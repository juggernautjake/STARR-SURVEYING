'use client';
// lib/push/use-admin-push.ts — the client half of business-app push, in one place.
//
// EnableNotifications.tsx owned all of this; extracting it lets a second surface (the proactive
// nudge) share the exact same state machine and subscribe flow rather than growing a divergent copy
// — the "two implementations that drift" defect this repo keeps catching. The UI stays in the
// components; the mechanics live here.
//
// ── "ON BY DEFAULT", HONESTLY ───────────────────────────────────────────────────────────────────
//
// Browsers do not allow an app to grant itself notification permission — it takes a user gesture, and
// iOS Safari refuses even to prompt outside a home-screen install. So "by default" is two things this
// hook does do:
//   1. `autoEnableIfGranted`: if permission is ALREADY granted (a prior yes, or the OS default on a
//      re-install) but no push subscription exists, subscribe silently — no gesture needed once
//      permission is held, so notifications "just stay on" across sessions and reinstalls.
//   2. surfacing the `ready` state so a nudge can ask for that one tap the browser requires.

import { useCallback, useEffect, useRef, useState } from 'react';

export type AdminPushState =
  | 'checking' | 'unconfigured' | 'no-transport' | 'unsupported' | 'ios-not-installed'
  | 'denied' | 'ready' | 'subscribing' | 'subscribed' | 'unsubscribing' | 'error';

/** VAPID keys travel as base64url and `PushManager.subscribe` wants raw bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // iOS Safari predates the media query and reports it on `navigator`; a media-query-only check would
  // tell an installed iPhone user to go and install the app they are already inside.
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod/i.test(ua) || iPadOS;
}

export const PUSH_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_PUSH_VAPID_KEY || process.env.NEXT_PUBLIC_VOICE_VAPID_KEY || '';

interface UseAdminPushOptions {
  /** Silently subscribe when permission is already granted but no subscription exists. */
  autoEnableIfGranted?: boolean;
}

export interface UseAdminPush {
  state: AdminPushState;
  detail: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function useAdminPush(options: UseAdminPushOptions = {}): UseAdminPush {
  const { autoEnableIfGranted = false } = options;
  const [state, setState] = useState<AdminPushState>('checking');
  const [detail, setDetail] = useState<string | null>(null);
  // Guards a single auto-subscribe attempt per mount, so a re-render can't loop the OS prompt path.
  const autoTried = useRef(false);

  const subscribe = useCallback(async () => {
    setState('subscribing');
    setDetail(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('denied'); return; }

      // `ready` resolves against ANY controlled scope; ask for /admin/ specifically since /dnd/ and
      // /AndrewAsh/ run their own workers.
      const reg = await navigator.serviceWorker.getRegistration('/admin/');
      if (!reg) { setState('error'); setDetail('The app is not installed on this device yet.'); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, // required by Chrome; we never send silent pushes anyway
        applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY),
      });

      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), deviceLabel: navigator.platform || undefined }),
      });
      if (!res.ok) {
        // The browser now holds a subscription the server does not know about. Undo it, or the device
        // sits with the UI saying "on" and nothing ever arriving.
        await sub.unsubscribe().catch(() => {});
        setState('error');
        setDetail('Could not save this device. Please try again.');
        return;
      }
      setState('subscribed');
    } catch (err) {
      setState('error');
      setDetail(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, []);

  /** Silent subscribe used by auto-enable: never prompts, so it is safe to call without a gesture.
   *  Only reached when `Notification.permission === 'granted'` already. */
  const subscribeSilently = useCallback(async (): Promise<boolean> => {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/admin/');
      if (!reg) return false;
      const existing = await reg.pushManager.getSubscription();
      if (existing) { setState('subscribed'); return true; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUSH_PUBLIC_KEY),
      });
      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), deviceLabel: navigator.platform || undefined }),
      });
      if (!res.ok) { await sub.unsubscribe().catch(() => {}); return false; }
      setState('subscribed');
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Turn push off for THIS device only — each device holds its own subscription, so silencing a
   *  phone must not silence the tablet in the truck. */
  const unsubscribe = useCallback(async () => {
    setState('unsubscribing');
    setDetail(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/admin/');
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) { setState('ready'); return; }
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {}); // local first: once this resolves, no push can arrive
      const res = await fetch('/api/admin/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      setState('ready');
      if (!res.ok) {
        setDetail(
          'Notifications are off on this device. The server record could not be cleared just now; ' +
          'it is harmless and will be removed automatically on the next send attempt.',
        );
      }
    } catch (err) {
      setState('error');
      setDetail(err instanceof Error ? err.message : 'Could not turn notifications off.');
    }
  }, []);

  useEffect(() => {
    if (!PUSH_PUBLIC_KEY) { setState('unconfigured'); return; }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported'); return;
    }
    if (isIOS() && !isStandalone()) { setState('ios-not-installed'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }

    const decideFromDevice = () =>
      navigator.serviceWorker.getRegistration('/admin/')
        .then((reg) => reg?.pushManager.getSubscription())
        .then(async (sub) => {
          if (sub) { setState('subscribed'); return; }
          // Permission already granted but no subscription — the "keep it on" path. Subscribe without
          // a prompt; fall back to offering the button if the silent attempt cannot complete.
          if (autoEnableIfGranted && Notification.permission === 'granted' && !autoTried.current) {
            autoTried.current = true;
            const ok = await subscribeSilently();
            if (!ok) setState('ready');
            return;
          }
          setState('ready');
        })
        .catch(() => setState('ready'));

    // W4c — the public key proves keys are set, not that the server can send (`web-push` may be
    // absent). Ask before offering the button, and fall through to the device check if the status
    // route is unreachable rather than blocking a working setup on a diagnostic.
    fetch('/api/admin/push/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { status?: string } | null) => {
        if (j?.status === 'no-transport') { setState('no-transport'); return; }
        if (j?.status === 'no-keys') { setState('unconfigured'); return; }
        void decideFromDevice();
      })
      .catch(() => { void decideFromDevice(); });
  }, [autoEnableIfGranted, subscribeSilently]);

  return { state, detail, subscribe, unsubscribe };
}
