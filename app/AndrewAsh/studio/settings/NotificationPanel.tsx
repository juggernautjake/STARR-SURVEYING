'use client';
// app/AndrewAsh/studio/settings/NotificationPanel.tsx — the switch that rings the phone.
//
// Everything else in the push chain already existed: the service worker handles `push` and
// `notificationclick`, `deliverPush` fans a notification out to every live subscription, and the
// table has the right unique index. What was missing was the only part a browser will not do without
// a user gesture — asking permission and creating the subscription. So notifications collected in the
// studio and reached a locked phone never, which is the one place a notification is worth anything.
//
// ── THE PROMPT IS ASKED ONCE, AND ONLY WHEN HE PRESSES A BUTTON ─────────────────────────────────
//
// Never on page load. A permission prompt that appears before the person has any idea what the app
// is gets denied, and a denied Notification permission is STICKY — the browser will not ask again,
// and the only cure is digging through site settings. One wrong prompt costs the feature permanently,
// which is why this is the one thing that must be behind a deliberate press.
//
// ── AND WHY "DENIED" GETS INSTRUCTIONS RATHER THAN A RETRY BUTTON ───────────────────────────────
//
// Once denied, calling requestPermission() again resolves instantly to 'denied' without showing
// anything. A retry button would look broken. The honest UI is to say where the setting lives.

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';

/** The VAPID public key arrives as base64url and `pushManager.subscribe` wants a Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'checking' | 'unsupported' | 'off' | 'on' | 'denied' | 'unconfigured';

export default function NotificationPanel({ vapidKey }: { vapidKey: string | null }): React.ReactElement {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vapidKey) return setState('unconfigured');
    // iOS only exposes PushManager to an INSTALLED PWA, so on Safari this is the normal state for a
    // browser tab rather than an error — hence the wording under 'unsupported'.
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return setState('unsupported');
    }
    if (Notification.permission === 'denied') return setState('denied');

    const reg = await navigator.serviceWorker.getRegistration('/AndrewAsh/');
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? 'on' : 'off');
  }, [vapidKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function turnOn(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      // `.ready` rather than `.getRegistration()`: on a first visit the worker may still be
      // installing, and subscribing against a registration that is not active throws.
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        // Required to be true by every browser — a push that shows no notification is not allowed.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey as string),
      });

      const res = await fetch('/api/voice/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        // Roll the browser-side subscription back. Leaving it would make the browser believe this
        // device is subscribed while the server has no record — a phone that is silent forever and
        // shows a switch that says it is on.
        await sub.unsubscribe();
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save that on the server.');
      }
      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch notifications on.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/AndrewAsh/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // Server first: if the browser unsubscribes and the delete then fails, the row is orphaned
        // and every future push to it fails three times before disabling itself.
        await fetch(`/api/voice/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setError('Could not switch notifications off.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vaPanel">
      <div className="vaPanelHead">
        <h2 className="vaPanelTitle">Notifications on this device</h2>
      </div>

      <p className="vaHint" style={{ margin: '0 0 16px' }}>
        A quote request, a signed agreement, a paid invoice. These come to your phone even when the
        site is closed — which is the whole point of an inquiry arriving at 9pm on a Sunday.
      </p>

      {state === 'checking' && (
        <p className="vaMuted" style={{ fontSize: '0.875rem' }}>
          <Loader2 size={13} aria-hidden className="vaSpin" style={{ verticalAlign: -2, marginRight: 7 }} />
          Checking…
        </p>
      )}

      {state === 'on' && (
        <>
          <p style={{ color: 'var(--va-accent)', fontSize: '0.9375rem', margin: '0 0 14px', fontWeight: 600 }}>
            <BellRing size={15} aria-hidden style={{ verticalAlign: -2, marginRight: 8 }} />
            On for this device
          </p>
          <button type="button" className="vaBtn vaBtnOutline vaBtnSm" disabled={busy} onClick={() => void turnOff()}>
            {busy ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <BellOff size={12} aria-hidden />}
            Turn off here
          </button>
        </>
      )}

      {state === 'off' && (
        <>
          <button type="button" className="vaBtn vaBtnSolid vaBtnSm" disabled={busy} onClick={() => void turnOn()}>
            {busy ? <Loader2 size={12} aria-hidden className="vaSpin" /> : <Bell size={12} aria-hidden />}
            Turn on notifications
          </button>
          <p className="vaHint" style={{ marginTop: 10 }}>
            Your browser will ask once. Each phone or computer is separate — turning it on here does
            not turn it on anywhere else.
          </p>
        </>
      )}

      {state === 'denied' && (
        <div className="vaNotice" role="status">
          <strong style={{ color: 'var(--va-text)' }}>Your browser is blocking notifications</strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            It will not ask again from here. On a phone: Settings → the browser → Notifications. On a
            computer: the padlock in the address bar → Notifications → Allow. Then reload this page.
          </span>
        </div>
      )}

      {state === 'unsupported' && (
        <div className="vaNotice" role="status">
          <strong style={{ color: 'var(--va-text)' }}>Not available in this browser</strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            On an iPhone, notifications only work once the site is added to your home screen — Share →
            Add to Home Screen, then open it from there and come back to this page.
          </span>
        </div>
      )}

      {state === 'unconfigured' && (
        <div className="vaNotice" role="status">
          <strong style={{ color: 'var(--va-text)' }}>Not set up yet</strong>
          <span style={{ display: 'block', marginTop: 6 }}>
            Push needs a pair of VAPID keys on the host — <code>NEXT_PUBLIC_VOICE_VAPID_KEY</code>,{' '}
            <code>VOICE_VAPID_PUBLIC_KEY</code> and <code>VOICE_VAPID_PRIVATE_KEY</code> — plus{' '}
            <code>npm i web-push</code>. Generate them with <code>npx web-push generate-vapid-keys</code>.
            Until then everything still arrives in the studio; it just does not ring a phone.
          </span>
        </div>
      )}

      {error && (
        <p className="vaError" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
