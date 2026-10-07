// lib/leads/phone-tap-beacon.ts — tell the server a visitor tapped the phone number (browser only).
//
// Owner, 2026-10-06: one business number, no call-tracking numbers. A call reaching that number can
// only be tied to an ad by noticing the tap that came before it; lib/receptionist/call-source.ts does
// the matching. This sends what the browser already holds about how the visitor arrived — the
// attribution captured on their first page by ./attribution.ts — and nothing else.
//
// sendBeacon, because a tel: tap hands the page to the phone app and an ordinary fetch can be cut
// off on the way out. It never throws: tracking must not be able to stop a person phoning.
import { readAttribution } from './attribution';

const VISITOR_KEY = 'starr.visitor.v1';

function visitorId(): string | null {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 36);
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Phone or computer: on a phone the tap places the call; on a computer the visitor dials by hand. */
function deviceKind(): 'mobile' | 'desktop' {
  try {
    if (window.matchMedia?.('(pointer: coarse)').matches) return 'mobile';
  } catch { /* fall through */ }
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

export function reportPhoneTap(): void {
  try {
    const a = readAttribution();
    const body = JSON.stringify({
      kind: 'tel',
      path: window.location.pathname,
      device: deviceKind(),
      visitor: visitorId(),
      ...(a ?? {}),
    });
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon?.('/api/phone-tap', blob)) return;
    void fetch('/api/phone-tap', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
  } catch {
    // Never in the way of the call.
  }
}
