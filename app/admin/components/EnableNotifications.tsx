'use client';
// app/admin/components/EnableNotifications.tsx
//
// PWA plan W4b — the button that turns push on for the business app.
//
// Everything under it already existed and could not be reached: W2's service worker, W4's shared
// sender, seed 571's table, and the subscribe route. This is the "yes" a crew member has to give,
// and without it the whole chain is built and unreachable — the defect this codebase produces most
// often, and one it has produced in push specifically before.
//
// THE ORDER OF THE CHECKS BELOW IS THE DESIGN. Each one has a different remedy, and collapsing them
// into "notifications unavailable" would leave a crew member with no idea what to do:
//
//   * not configured   → the operator has not set VAPID keys. Nothing the user can do; say so.
//   * unsupported      → the browser has no PushManager at all.
//   * iOS, not installed → the single most common dead end. iOS grants push ONLY to a home-screen
//                        install, and in Safari the permission prompt will not even appear. Telling
//                        someone here to "allow notifications" would send them looking for a prompt
//                        that cannot exist.
//   * denied           → they said no once. A site cannot re-prompt; it must be changed in browser
//                        settings, so offering a button that silently does nothing is a lie.

import { useCallback, useEffect, useState } from 'react';

type State =
  | 'checking' | 'unconfigured' | 'no-transport' | 'unsupported' | 'ios-not-installed'
  | 'denied' | 'ready' | 'subscribing' | 'subscribed' | 'error';

/** VAPID keys travel as base64url and `PushManager.subscribe` wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  // iOS Safari predates the media query and reports it on `navigator` instead; checking only the
  // media query would tell an installed iPhone user to go and install the app.
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod/i.test(ua) || iPadOS;
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_PUSH_VAPID_KEY || process.env.NEXT_PUBLIC_VOICE_VAPID_KEY || '';

export default function EnableNotifications() {
  const [state, setState] = useState<State>('checking');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!PUBLIC_KEY) { setState('unconfigured'); return; }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported'); return;
    }
    if (isIOS() && !isStandalone()) { setState('ios-not-installed'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }

    // W4c — the public key proves the operator set keys, NOT that the server can send. `web-push` is
    // deliberately not a dependency, so with keys set and the package absent every check above
    // passes, the browser subscribes, the row saves, and nothing is ever delivered. Asking the
    // server is the only way to know, and it is asked BEFORE the button is offered rather than
    // after a subscription exists.
    const decideFromDevice = () =>
      navigator.serviceWorker.getRegistration('/admin/')
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setState(sub ? 'subscribed' : 'ready'))
        .catch(() => setState('ready'));

    fetch('/api/admin/push/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { status?: string } | null) => {
        if (j?.status === 'no-transport') { setState('no-transport'); return; }
        if (j?.status === 'no-keys') { setState('unconfigured'); return; }
        // Unreachable status route (offline, or a deploy without it): fall through to the device
        // check rather than blocking a working setup on a diagnostic. Withholding the button here
        // would turn a failed side-question into a broken feature.
        void decideFromDevice();
      })
      .catch(() => { void decideFromDevice(); });
  }, []);

  const subscribe = useCallback(async () => {
    setState('subscribing');
    setDetail(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('denied'); return; }

      // The worker registered by RegisterAdminPWA. `ready` would resolve against ANY scope the page
      // controls, so this asks for /admin/ specifically.
      const reg = await navigator.serviceWorker.getRegistration('/admin/');
      if (!reg) { setState('error'); setDetail('The app is not installed on this device yet.'); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,   // required by Chrome; we never send silent pushes anyway
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
      });

      const res = await fetch('/api/admin/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), deviceLabel: navigator.platform || undefined }),
      });
      if (!res.ok) {
        // The browser now holds a subscription the server does not know about. Undo it, or the
        // device sits in a state where the UI says "on" and nothing will ever arrive.
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

  // W6g — `unconfigured` used to return null alongside these two, which contradicted this file's own
  // header: it lists four states precisely because collapsing them "would leave a crew member with no
  // idea what to do", and says of this one *"the operator has not set VAPID keys. Nothing the user
  // can do; say so."* It did not say so — it rendered nothing, so the install page showed no
  // Notifications section at all, which reads as "this app has no notifications" rather than "this
  // app's notifications are not switched on yet".
  //
  // That is the state the app is in right now (VAPID keys are unset), so the silent branch was the
  // one every visitor actually hit. `checking` and `unsupported` still render nothing, and that is
  // right: the first is transient, and the second is a browser limitation with no remedy to offer.
  if (state === 'checking' || state === 'unsupported') return null;

  return (
    <section className="admin-install__card">
      <h2>Notifications</h2>

      {state === 'unconfigured' && (
        <p className="admin-install__muted">
          Push notifications are built into this app but are <strong>not switched on yet</strong> —
          the server has no notification keys set. Nothing to do on this device; it needs the
          <code> PUSH_VAPID_PUBLIC_KEY</code> and <code>PUSH_VAPID_PRIVATE_KEY</code> environment
          variables set once, by whoever administers the deployment.
        </p>
      )}

      {/* W4c. Keys are set, so everything the browser can check says "go" — and the server has no
          way to send. Deliberately NOT collapsed into `unconfigured`: the remedy is a different
          command run by the same person, and "set the keys" would send them to look at keys that
          are already correct. */}
      {state === 'no-transport' && (
        <p className="admin-install__muted">
          Push notifications are <strong>configured but cannot be delivered yet</strong> — the
          notification keys are set, but the server is missing the <code>web-push</code> package that
          sends them. Nothing to do on this device. Whoever administers the deployment needs to run
          <code> npm i web-push</code> and redeploy; turning notifications on before then would say
          alerts are working when nothing would arrive.
        </p>
      )}

      {state === 'ios-not-installed' && (
        <p className="admin-install__muted">
          <strong>Add this app to your home screen first.</strong> On iPhone and iPad, notifications
          only work from the home-screen icon — there is no prompt to allow in Safari. Follow the
          install steps above, open the app from its new icon, then come back here.
        </p>
      )}

      {state === 'denied' && (
        <p className="admin-install__muted">
          Notifications are blocked for this site. A website cannot ask again once it has been
          refused, so turn them back on in your browser settings for this site, then reload.
        </p>
      )}

      {(state === 'ready' || state === 'subscribing' || state === 'error') && (
        <>
          <p className="admin-install__muted">
            Get alerted about job assignments and schedule changes on this device.
          </p>
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-install__cta"
            onClick={subscribe}
            disabled={state === 'subscribing'}
          >
            {state === 'subscribing' ? 'Turning on…' : 'Turn on notifications'}
          </button>
          {state === 'error' && detail && <p className="admin-install__muted">{detail}</p>}
        </>
      )}

      {state === 'subscribed' && (
        <p className="admin-install__muted">
          <strong>Notifications are on for this device.</strong> You can turn them off any time in
          your browser&apos;s site settings.
        </p>
      )}
    </section>
  );
}
