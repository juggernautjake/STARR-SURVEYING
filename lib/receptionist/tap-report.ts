// lib/receptionist/tap-report.ts — what the browser sends when a visitor taps the phone number, checked.
//
// Pure, so the rules are tested without a request: the body is untrusted (anyone can POST to a public
// route), so every field is a short string or dropped, the path must be a path, and a request from an
// obvious crawler is ignored rather than recorded as a person about to call.

const MAX = 300;
const FIELDS = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing_page', 'referrer'] as const;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, MAX);
  return s || null;
}

export interface TapInsert {
  path: string | null;
  device: 'mobile' | 'desktop' | null;
  visitor: string | null;
  first_seen_at: string | null;
  gclid: string | null; gbraid: string | null; wbraid: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_term: string | null; utm_content: string | null;
  landing_page: string | null; referrer: string | null;
}

/** The row to insert, or null for a body that is not a tap report (or a crawler). */
export function parseTapReport(raw: string, userAgent: string | null): TapInsert | null {
  if (userAgent && BOT.test(userAgent)) return null;
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!body || typeof body !== 'object' || body.kind !== 'tel') return null;
  const path = clean(body.path);
  const firstSeen = clean(body.first_seen_at);
  const out: TapInsert = {
    path: path && path.startsWith('/') ? path : null,
    device: body.device === 'mobile' || body.device === 'desktop' ? body.device : null,
    visitor: clean(body.visitor)?.replace(/[^a-z0-9-]/gi, '').slice(0, 40) || null,
    first_seen_at: firstSeen && Number.isFinite(Date.parse(firstSeen)) ? new Date(firstSeen).toISOString() : null,
    gclid: null, gbraid: null, wbraid: null,
    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null,
    landing_page: null, referrer: null,
  };
  for (const f of FIELDS) out[f] = clean(body[f]);
  return out;
}
