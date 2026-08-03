// lib/push/web-push.ts — PWA plan W4. One Web Push transport for all three PWAs.
//
// There are three scoped PWAs in this repo (/admin/, /dnd/, /AndrewAsh/) and, before this, exactly
// one push sender — living inside `lib/voice/notifications.ts`, wired to the `va_push_subscriptions`
// table, defaulting its href to `/AndrewAsh/studio`, and reading `VOICE_VAPID_*`. Perfectly good
// code that only one of the three could use.
//
// WHAT IS AND IS NOT SHARED, because getting this backwards is the whole design question:
//
//   * VAPID keys ARE shared. They identify the application SERVER to the push service, not the
//     application. One key pair legitimately serves every scope, and generating three would mean
//     three secrets to rotate for no isolation benefit.
//   * Subscription STORAGE is not shared, and this module deliberately does not touch a database.
//     Each area keeps its own table and its own disable policy — the studio's three-strike rule is
//     its own decision, not a property of Web Push. A transport that wrote to a table would have to
//     know which table, which is exactly what made the original unusable elsewhere.
//
// So this module sends bytes and reports what happened. The caller decides what that means.

/** The shape every scope's subscription row can be narrowed to. */
export interface PushSubscriptionLike {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone` means the browser discarded the subscription and it will NEVER work again (404/410).
 *  Anything else is presumed transient — that distinction is the reason this is a typed result and
 *  not a boolean, because treating a transient 500 as permanent unsubscribes a device during an
 *  outage. */
export type SendResult =
  | { ok: true }
  | { ok: false; gone: boolean; status?: number };

export interface WebPushModule {
  setVapidDetails: (subject: string, pub: string, priv: string) => void;
  sendNotification: (sub: unknown, payload: string) => Promise<unknown>;
}

/** Shared first, then the original VOICE_* names. The fallback is not clutter: the studio's keys are
 *  already set in the deployment, and a rename that silently turned push off for the one area
 *  currently using it would be a poor way to "unify" anything. */
export function vapidPrivateKey(): string | null {
  return process.env.PUSH_VAPID_PRIVATE_KEY || process.env.VOICE_VAPID_PRIVATE_KEY || null;
}

export function vapidPublicKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_PUSH_VAPID_KEY
    || process.env.PUSH_VAPID_PUBLIC_KEY
    || process.env.NEXT_PUBLIC_VOICE_VAPID_KEY
    || process.env.VOICE_VAPID_PUBLIC_KEY
    || null
  );
}

export function vapidSubject(): string {
  return process.env.PUSH_VAPID_SUBJECT || process.env.VOICE_VAPID_SUBJECT || 'mailto:admin@example.com';
}

/** True when a private key AND a public key are both present. Checking only one is how you get a
 *  sender that believes it is configured and fails on every send. */
export function pushConfigured(): boolean {
  return Boolean(vapidPrivateKey() && (process.env.PUSH_VAPID_PUBLIC_KEY || process.env.VOICE_VAPID_PUBLIC_KEY));
}

/** Resolve `web-push` at runtime, or null.
 *
 *  `web-push` is not a dependency of this repo. A bare `require` inside a try/catch is still
 *  STATICALLY ANALYSED by webpack, which then emits "Module not found" on every build and every dev
 *  page load for an optional dependency that is deliberately absent — the try/catch handles the
 *  runtime throw and does nothing about build-time resolution. Indirecting through a variable makes
 *  the specifier opaque to the bundler. Carried over from the original sender, where it was learned
 *  the hard way. */
export function loadWebPush(): WebPushModule | null {
  if (!pushConfigured()) return null;
  try {
    const load = eval('require') as (id: string) => unknown;
    const mod = load('web-push') as WebPushModule;
    mod.setVapidDetails(vapidSubject(), vapidPublicKey() as string, vapidPrivateKey() as string);
    return mod;
  } catch {
    // Not installed, or the keys are malformed. Callers have already persisted whatever they were
    // notifying about; push is the best-effort half.
    return null;
  }
}

/** Classify a failure. 404 and 410 are the push service saying the endpoint is dead for good. */
export function isGone(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode;
  return status === 404 || status === 410;
}

/** Send one payload to many subscriptions, returning a result per subscription IN INPUT ORDER.
 *
 *  Order matters because callers pair results back to their own rows by index; returning only the
 *  failures would make the caller re-derive which succeeded, and that is the kind of bookkeeping
 *  that drifts between three call sites. */
export async function sendPushWith<T extends PushSubscriptionLike>(
  webpush: WebPushModule,
  subs: readonly T[],
  payload: string,
): Promise<Array<{ sub: T; result: SendResult }>> {
  return Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        return { sub, result: { ok: true } as SendResult };
      } catch (err) {
        return {
          sub,
          result: {
            ok: false,
            gone: isGone(err),
            status: (err as { statusCode?: number })?.statusCode,
          } as SendResult,
        };
      }
    }),
  );
}

/** The convenience form: load the module and send, or return [] when push is not configured.
 *  An empty array means "nothing was attempted" — distinct from a list of failures, so a caller
 *  cannot mistake an unconfigured environment for every device having failed. */
export async function sendPush<T extends PushSubscriptionLike>(
  subs: readonly T[],
  payload: string,
): Promise<Array<{ sub: T; result: SendResult }>> {
  if (!subs.length) return [];
  const webpush = loadWebPush();
  if (!webpush) return [];
  return sendPushWith(webpush, subs, payload);
}
