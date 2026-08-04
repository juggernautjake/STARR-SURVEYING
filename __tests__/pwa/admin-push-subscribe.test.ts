// PWA plan W4b — a crew member can actually say yes to notifications.
//
// Every piece under this already existed and could not reach the others: W2's service worker, W4's
// scope-agnostic sender, seed 571's table. What was missing was the "yes". A push stack with no
// subscribe path is the built-but-unreachable defect in its purest form, and this codebase has
// produced it in push specifically before.
//
// These are source-level checks. The runtime half — a real permission prompt, a real endpoint from a
// real push service — needs a device, and W6b is where that is tracked. What IS worth pinning here
// are the decisions that are silently wrong rather than loudly broken: an upsert that duplicates, a
// delete that is not scoped to its owner, a partial row that looks enabled and can never deliver,
// and the iOS precondition that makes the whole feature invisible if it is not stated.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const route = read('app/api/admin/push/subscribe/route.ts');
const ui = read('app/admin/components/EnableNotifications.tsx');
const seed = read('seeds/571_admin_push_subscriptions.sql');
/** SQL with `--` comment lines removed.
 *
 *  The seed EXPLAINS at length why it does not reuse the studio's `va_users` table, so a naive
 *  `not.toContain('va_users')` fails on the rationale. This is the fourth source-scanning check
 *  today to trip on its own prose, and the asymmetry is why it is worth a helper rather than a
 *  one-off: a prose mention is a visible false alarm, but the same blindness would let a file that
 *  merely DESCRIBES a decision pass as though it implemented one. */
const seedCode = seed.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const installPage = read('app/admin/install/page.tsx');
/** W4c — the transport half. */
const pushLib = read('lib/push/web-push.ts');
const statusRoute = read('app/api/admin/push/status/route.ts');

describe('the table keeps its own identity, separate from the studio', () => {
  it('references the admin user table, not the studio one', () => {
    // A surveyor is not a row in `va_users` and never will be. One shared table would need a
    // nullable FK pair and a CHECK to keep them exclusive — one forgotten branch away from linking a
    // crew member's phone to a studio account.
    expect(seedCode).toContain('REFERENCES registered_users(id)');
    expect(seedCode).not.toContain('va_users');
  });

  it('makes endpoint UNIQUE', () => {
    // The endpoint is stable per browser install, so without this a phone accumulates a row per app
    // launch and the crew member gets one copy of every alert per launch.
    expect(seed).toMatch(/endpoint\s+TEXT NOT NULL UNIQUE/);
  });

  it('keeps failure bookkeeping rather than deleting on first error', () => {
    // Matches the gone/transient distinction in lib/push/web-push.ts. Deleting on the first failure
    // would unsubscribe every device during an outage.
    for (const col of ['failure_count', 'last_failure_at', 'disabled_at']) {
      expect(seedCode).toContain(col);
    }
  });

  it('is RLS-denied to the client', () => {
    // A row here carries the exact endpoint needed to push to someone's phone.
    expect(seed).toContain('ENABLE ROW LEVEL SECURITY');
    expect(seed).toMatch(/USING \(false\)/);
  });
});

describe('the route refuses what it should', () => {
  it('requires a session on both verbs', () => {
    expect(route.match(/Unauthorized/g) ?? []).toHaveLength(2);
  });

  it('rejects a partial subscription', () => {
    // A row missing a key looks like an enabled device and can never deliver — the user believes
    // alerts are on and simply never receives one, which is worse than a visible 400.
    expect(route).toContain('endpoint, keys.p256dh and keys.auth are all required');
  });

  it('upserts on endpoint instead of inserting blindly', () => {
    expect(route).toContain("onConflict: 'endpoint'");
  });

  it('re-arms a previously disabled device on re-subscribe', () => {
    // The browser handing us a subscription IS the browser telling us the endpoint is live again.
    expect(route).toContain('failure_count: 0');
    expect(route).toContain('disabled_at: null');
  });

  it('scopes DELETE to the owner, not just the endpoint', () => {
    // Endpoint alone would let any signed-in user unsubscribe any device by replaying an endpoint
    // string. Small hole, free to close — and only free before it ships.
    const del = route.slice(route.indexOf('export const DELETE'));
    expect(del).toContain(".eq('endpoint'");
    expect(del).toContain(".eq('user_id', userId)");
  });
});

describe('the UI tells the truth about why it cannot help', () => {
  it('states the iOS precondition explicitly', () => {
    // The most common dead end: iOS grants push only to a home-screen install, and in Safari the
    // prompt never appears. Telling someone to "allow notifications" would send them hunting for a
    // prompt that cannot exist.
    expect(ui).toContain('ios-not-installed');
    expect(ui).toContain('only work from the home-screen icon');
  });

  it('detects an installed iOS app the way iOS actually reports it', () => {
    expect(ui).toContain('nav.standalone === true');
  });

  it('does not offer a button that cannot work after a denial', () => {
    // A site cannot re-prompt once refused; a button that silently does nothing is a lie.
    expect(ui).toContain("state === 'denied'");
    expect(ui).toContain('cannot ask again');
  });

  it('asks for the /admin/ registration specifically', () => {
    // `serviceWorker.ready` resolves against any controlling scope; /dnd/ and /AndrewAsh/ run their
    // own workers, and subscribing against the wrong one would push to the wrong app.
    expect(ui).toContain("getRegistration('/admin/')");
  });

  it('undoes the browser subscription when the server rejects it', () => {
    // Otherwise the device sits with the UI saying "on" while nothing can ever arrive.
    expect(ui).toContain('sub.unsubscribe()');
  });

  it('offers no enable button when push is not configured, but says why', () => {
    // ── This assertion was inverted on 2026-08-04 (W6g), deliberately. ──────────────────────────
    //
    // It used to require `return null` for `unconfigured`, on the rationale that "an enable button
    // with no VAPID key is a promise the deployment cannot keep". **That rationale is correct and is
    // still enforced below** — what was wrong was the remedy.
    //
    // The component's own header lists four states precisely because collapsing them "would leave a
    // crew member with no idea what to do", and says of this one: *"the operator has not set VAPID
    // keys. Nothing the user can do; say so."* Returning null does not say so. It removes the whole
    // Notifications section, which reads as "this app has no notifications" rather than "this app's
    // notifications are not switched on yet" — and since VAPID keys are unset today, that silent
    // branch was the one every visitor actually hit.
    //
    // So: no button (the original concern), and an explanation (the header's intent). The two were
    // never in conflict; only the implementation treated them as if they were.
    expect(ui).toContain("state === 'unconfigured'");

    // The section must render — `unconfigured` must NOT be in the early-return list.
    const earlyReturn = ui.slice(ui.indexOf('if (state ==='), ui.indexOf('return ('));
    expect(
      earlyReturn,
      'unconfigured is back in the early return — the install page will show no Notifications ' +
        'section at all, which is indistinguishable from the feature not existing',
    ).not.toContain('unconfigured');

    // And it must explain rather than offer an affordance that cannot work.
    expect(ui).toMatch(/not switched on yet/i);
    expect(ui, 'the explanation should name what is missing, not just say "unavailable"')
      .toMatch(/VAPID|notification keys/i);
  });
});

describe('W4c — keys set is not the same as able to send', () => {
  // The state W6g's fix could not see. `web-push` is deliberately not a dependency of this repo, so
  // with VAPID keys present and the package absent, EVERY check a browser can make passes: the
  // public key is there, the worker registers, the subscription saves, and the UI says notifications
  // are on. `sendPush` returns [] forever and nothing is ever delivered.
  //
  // It is the same failure the subscribe route already refuses for its own case — "a row that looks
  // like an enabled device and can never receive a notification… worse than a visible failure here"
  // — one layer up, and it is worse than the unconfigured case because the user has actively opted
  // in and been told yes.

  it('reports the two reasons push cannot send as different answers', () => {
    // `loadWebPush()` returns null for both, which is right for a sender and useless for a UI: the
    // remedies are "set two env vars" and "npm i web-push", and telling someone to check keys that
    // are already correct is how a real problem gets looked past.
    expect(pushLib).toContain("export type PushStatus = 'ready' | 'no-keys' | 'no-transport';");
    expect(pushLib).toContain('export function pushTransportInstalled()');
    // The transport check must NOT be gated on the keys, or it can never observe the state it exists
    // to observe — that gating is exactly what made `loadWebPush` unable to answer this.
    const fn = pushLib.slice(pushLib.indexOf('export function pushTransportInstalled'));
    expect(
      fn.slice(0, fn.indexOf('}\n\n')),
      'pushTransportInstalled must not short-circuit on pushConfigured — with no keys it would ' +
        'report the package missing, which is a different problem with a different fix',
    ).not.toContain('pushConfigured');
  });

  it('asks the server before offering the button, not after a subscription exists', () => {
    // Order is the whole slice. Discovering this after subscribing means the device is already in
    // the state the subscribe route calls worse than a visible failure.
    expect(ui).toContain("fetch('/api/admin/push/status')");
    const effect = ui.slice(ui.indexOf('useEffect(() => {'), ui.indexOf('const subscribe'));
    expect(
      effect.indexOf("fetch('/api/admin/push/status')"),
      'the status check must happen inside the mount effect, before any Enable affordance renders',
    ).toBeGreaterThan(-1);
  });

  it('does not collapse no-transport into unconfigured', () => {
    expect(ui).toContain("state === 'no-transport'");
    expect(ui, 'name the actual remedy — the person reading it is the one who can run it')
      .toMatch(/npm i web-push/);
  });

  it('still works when the status route cannot be reached', () => {
    // A diagnostic that can break the feature it diagnoses is a worse bug than the one it reports.
    // On a failed fetch the component falls back to the device check rather than withholding the
    // button from a deployment that is perfectly capable of sending.
    expect(ui).toContain('.catch(() => { void decideFromDevice(); })');
  });

  it('the status route reports a capability and never a key', () => {
    // A status endpoint is exactly where a secret gets leaked by being helpful.
    expect(statusRoute).toContain('pushStatus()');
    expect(statusRoute).not.toMatch(/vapidPrivateKey|PUSH_VAPID_PRIVATE_KEY/);
    // Session-gated, matching the subscribe route: anyone who can be notified may ask whether
    // notifications work.
    expect(statusRoute).toContain("if (!session?.user?.email)");
  });
});

describe('it is reachable', () => {
  it('is mounted on the install page', () => {
    // The whole point of W4b. A subscribe route nobody can call leaves the push stack exactly as
    // unreachable as it was before.
    expect(installPage).toContain('<EnableNotifications />');
    expect(installPage).toContain("from '@/app/admin/components/EnableNotifications'");
  });
});
