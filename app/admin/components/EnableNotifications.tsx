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

import { useAdminPush } from '@/lib/push/use-admin-push';

export default function EnableNotifications() {
  // The mechanics (state machine, subscribe/unsubscribe, the W4c server-can-send check) live in the
  // shared hook so this page and the proactive nudge cannot drift. This page does NOT auto-enable —
  // it is the explicit controls surface, where the user chooses.
  const { state, detail, subscribe, unsubscribe } = useAdminPush();

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

      {/* ── An OFF switch, added 2026-08-04 at the owner's request ──────────────────────────────
          This said "you can turn them off any time in your browser's site settings" — which is
          true, buried three levels into a menu most people never open, and impossible on some
          Android launchers without finding the site entry by hand. Meanwhile the subscribe route
          has always had a DELETE verb, correctly scoped to the signed-in user, that **nothing
          called**. The off switch was built and unreachable; this is the button.

          Both halves run, in this order: the browser subscription is dropped first, then the row.
          If the row delete fails we still stop, because a device that has unsubscribed locally can
          never receive a push again — leaving the UI saying "on" would be the lie. The row becomes
          a dead endpoint, which the sender already handles: a 404/410 from the push service is
          `gone`, and gone rows are cleaned up on the next send. */}
      {state === 'subscribed' && (
        <>
          <p className="admin-install__muted">
            <strong>Notifications are on for this device.</strong> You will get job updates and
            urgent messages here, even when the app is closed.
          </p>
          <button
            type="button"
            className="admin-install__btn admin-install__btn--ghost"
            onClick={() => void unsubscribe()}
            style={{ marginTop: '0.6rem' }}
          >
            Turn notifications off on this device
          </button>
          {detail && <p className="admin-install__muted" style={{ marginTop: '0.4rem' }}>{detail}</p>}
        </>
      )}

      {state === 'unsubscribing' && (
        <p className="admin-install__muted">Turning notifications off…</p>
      )}
    </section>
  );
}
