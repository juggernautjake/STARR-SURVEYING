// lib/admin/nav-telemetry.ts
//
// Fire-and-forget client-side emitter for the V2 admin nav telemetry.
// ADMIN_NAVIGATION_REDESIGN.md §13.8.
//
// Usage:
//   trackNavEvent('nav.cmdk.open', { trigger: 'shortcut' });
//
// Behaviour:
//   - Posts to `/api/admin/nav-events` via `navigator.sendBeacon` when
//     available so the request survives a page transition; falls back
//     to a `keepalive: true` fetch.
//   - SSR-safe: no-op on the server (returns immediately).
//   - Never throws; telemetry failure is invisible to the caller.

export type NavEventName =
  | 'nav.cmdk.open'
  | 'nav.workspace.click'
  | 'nav.pin.add'
  | 'nav.pin.remove'
  | 'nav.persona.override';

export interface NavEventProps {
  [key: string]: unknown;
}

const ENDPOINT = '/api/admin/nav-events';

export function trackNavEvent(event: NavEventName, props: NavEventProps = {}): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({
    event,
    props,
    pathname: window.location?.pathname ?? null,
  });

  try {
    // Prefer sendBeacon — non-blocking, survives unload.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
    // Fall back to fetch with keepalive so a navigation doesn't drop the request.
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch {
    // never throw
  }
}
