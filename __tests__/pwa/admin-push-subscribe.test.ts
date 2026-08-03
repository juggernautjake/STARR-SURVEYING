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

  it('renders nothing at all when push is not configured', () => {
    // An enable button with no VAPID key is a promise the deployment cannot keep.
    expect(ui).toContain("state === 'unconfigured'");
    expect(ui).toMatch(/return null/);
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
