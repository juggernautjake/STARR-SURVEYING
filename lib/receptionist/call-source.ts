// lib/receptionist/call-source.ts — which website visit (and which ad) a phone call came from.
//
// Owner, 2026-10-06: "I do not want separate numbers for each ad... we need one number for the
// business." So there is no call-tracking number to say where a call came from. What there is: the
// website knows when a visitor taps the phone number, and it knows how that visitor arrived — the
// Google click id and UTM tags captured on their first page (lib/leads/attribution.ts). The tap is
// recorded (POST /api/phone-tap, table phone_taps) and, when a call reaches the business number
// shortly after, the two are matched here BY TIME.
//
// ── WHAT A TIME MATCH CAN AND CANNOT SAY ─────────────────────────────────────────────────────────
//
// The browser never learns the caller's number, so this is inference, and it says so:
//   likely    a phone tapped the number and a call arrived within three minutes, with no other tap
//             competing for it. On a phone the tap IS the call, so this is close to certain.
//   possible  a desktop tap (the visitor read the number and dialled it), a longer gap, or more than
//             one tap in the window. Shown, never presented as fact.
// A call with no tap before it is simply unattributed — most calls, because most callers found the
// number somewhere other than the website (a truck, a sign, a referral, Google Maps).
//
// A tap is matched to one call at most, claimed with a conditional update, so two calls arriving
// together cannot both take it. Robocalls and blocked calls are never matched: a tap followed by a
// robocall is a coincidence, and crediting an ad with it would be worse than crediting nothing.
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = Pick<SupabaseClient<any, any, any>, 'from'>;

export interface TapRow {
  id: string;
  tapped_at: string;
  path: string | null;
  device: 'mobile' | 'desktop' | null;
  visitor: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer: string | null;
  first_seen_at: string | null;
}

export const TAP_COLUMNS = 'id, tapped_at, path, device, visitor, gclid, gbraid, wbraid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, landing_page, referrer, first_seen_at';

/** How long before a call a tap can be its cause. A phone dials at once; a desktop visitor reads the
 *  number off the screen and picks up their phone, which can take a while. */
export const MOBILE_WINDOW_MS = 5 * 60_000;
export const DESKTOP_WINDOW_MS = 15 * 60_000;
/** Clocks differ by a few seconds between the browser's report and Twilio's webhook. */
const SKEW_MS = 60_000;
const LIKELY_MS = 3 * 60_000;

export type CallSource = 'google_ads' | 'website';

export interface TapMatch {
  tap: TapRow;
  confidence: 'likely' | 'possible';
  source: CallSource;
  /** "Tapped the number on /services 2 minutes before calling — from a Google ad click (campaign …)". */
  detail: string;
  gapMs: number;
}

/** Google paid traffic: a click id, or UTM tags that say so. */
export function sourceOfTap(t: Pick<TapRow, 'gclid' | 'gbraid' | 'wbraid' | 'utm_source' | 'utm_medium'>): CallSource {
  if (t.gclid || t.gbraid || t.wbraid) return 'google_ads';
  const src = (t.utm_source ?? '').toLowerCase();
  const med = (t.utm_medium ?? '').toLowerCase();
  if (src.includes('google') && /cpc|ppc|paid|ads?\b/.test(med)) return 'google_ads';
  return 'website';
}

function minutes(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m <= 0 ? 'seconds' : m === 1 ? '1 minute' : `${m} minutes`;
}

/** Where they came from before the site, in a few words. */
function arrivedFrom(t: TapRow): string {
  if (sourceOfTap(t) === 'google_ads') return `from a Google ad click${t.utm_campaign ? ` (campaign ${t.utm_campaign})` : ''}`;
  if (t.utm_source) return `from ${t.utm_source}${t.utm_medium ? ` / ${t.utm_medium}` : ''}`;
  const ref = (t.referrer ?? '').toLowerCase();
  if (/google\./.test(ref)) return 'from a Google search (not an ad)';
  if (/bing\.|yahoo\.|duckduckgo\./.test(ref)) return 'from a web search';
  if (/facebook\.|instagram\.|fb\./.test(ref)) return 'from Facebook or Instagram';
  if (ref) { try { return `from ${new URL(t.referrer as string).hostname}`; } catch { return 'from another website'; } }
  return 'having come to the site directly';
}

/**
 * The tap this call most likely followed, or null. Pure: the calls and taps are passed in.
 *
 * The latest tap before the call wins — it is the one closest to the decision to call. A tap a little
 * AFTER the call start (inside the clock skew) still counts, because the beacon and the webhook race.
 */
export function pickTap(callStartIso: string, taps: TapRow[]): TapMatch | null {
  const start = Date.parse(callStartIso);
  if (!Number.isFinite(start)) return null;
  const inWindow = taps.filter((t) => {
    const at = Date.parse(t.tapped_at);
    if (!Number.isFinite(at)) return false;
    const gap = start - at;
    const window = t.device === 'desktop' ? DESKTOP_WINDOW_MS : MOBILE_WINDOW_MS;
    return gap >= -SKEW_MS && gap <= window;
  });
  if (!inWindow.length) return null;
  inWindow.sort((a, b) => Date.parse(b.tapped_at) - Date.parse(a.tapped_at));
  const tap = inWindow[0];
  const gapMs = Math.max(0, start - Date.parse(tap.tapped_at));
  // Other taps in the window from a DIFFERENT visitor make it a guess between people.
  const rivals = inWindow.filter((t) => t.id !== tap.id && (t.visitor ?? t.id) !== (tap.visitor ?? tap.id)).length;
  const confidence = tap.device === 'mobile' && gapMs <= LIKELY_MS && rivals === 0 ? 'likely' : 'possible';
  const where = tap.path ? ` on ${tap.path}` : '';
  const how = tap.device === 'desktop' ? 'Viewed the number on a computer' : 'Tapped the number';
  const detail = `${how}${where} ${minutes(gapMs)} before calling, ${arrivedFrom(tap)}.${confidence === 'possible' ? ' A time match only — probably, not certainly, this caller.' : ''}`;
  return { tap, confidence, source: sourceOfTap(tap), detail, gapMs };
}

interface CallForMatch {
  id: string;
  started_at: string;
  is_test?: boolean | null;
  answered_by?: string | null;
  caller_verdict?: string | null;
  tap_id?: string | null;
}

/** Calls that are never credited to a website visit. */
export function matchable(c: CallForMatch): boolean {
  if (c.is_test || c.tap_id) return false;
  if (c.answered_by === 'blocked') return false;
  return c.caller_verdict !== 'robocall' && c.caller_verdict !== 'blocked';
}

/**
 * Find and claim the tap behind this call, and record the source on the call. Returns the match, or
 * null when there was none (most calls). Never throws.
 */
export async function matchCallToTap(db: Client, call: CallForMatch): Promise<TapMatch | null> {
  try {
    if (!matchable(call)) return null;
    const start = Date.parse(call.started_at);
    if (!Number.isFinite(start)) return null;
    const { data } = await db.from('phone_taps').select(TAP_COLUMNS)
      .is('call_id', null)
      .gte('tapped_at', new Date(start - DESKTOP_WINDOW_MS).toISOString())
      .lte('tapped_at', new Date(start + SKEW_MS).toISOString())
      .order('tapped_at', { ascending: false })
      .limit(20);
    const match = pickTap(call.started_at, (data ?? []) as TapRow[]);
    if (!match) return null;

    const now = new Date().toISOString();
    const { data: claimed } = await db.from('phone_taps')
      .update({ call_id: call.id, match_confidence: match.confidence, matched_at: now })
      .eq('id', match.tap.id).is('call_id', null).select('id');
    if (!(claimed ?? []).length) return null; // another call took it a moment ago
    await db.from('phone_calls').update({ tap_id: match.tap.id, source: match.source, source_detail: match.detail }).eq('id', call.id);
    return match;
  } catch (err) {
    console.error('[call-source] match failed:', err);
    return null;
  }
}

/** The tap's arrival data in the shape the lead intake takes (lib/leads/attribution.ts `Attribution`),
 *  so a lead made from a matched call carries the ad click into the offline-conversion upload. */
export function tapAttribution(t: TapRow | null): Record<string, string> | null {
  if (!t) return null;
  const out: Record<string, string> = {};
  for (const k of ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing_page', 'referrer', 'first_seen_at'] as const) {
    const v = t[k];
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
