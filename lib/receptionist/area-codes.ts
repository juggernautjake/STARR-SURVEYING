// lib/receptionist/area-codes.ts — where a caller's number says they are from.
//
// Owner, 2026-10-06: "numbers outside of the state should be suspicious, but sometimes people move
// to Texas from other states, so we still need to answer them." And later the same day: "We need to
// check area codes and determine where the calls are from, and if they are some kind of 1-800 number
// that is likely spam."
//
// The live log agrees with the first half: three of the firm's real customer calls in September
// came from Colorado (720), Chicago (872) and California (909) numbers — a title company, an
// engineering firm and a buyer, all about Texas land. So the region is a LABEL a person sees on the
// call and the number, and never on its own a reason to screen. lib/receptionist/screening.ts reads
// it for display only. The place names come from ./area-code-map.ts.
import { lookupAreaCode, type AreaInfo } from './area-code-map';

/** Every Texas area code in service (and the overlays announced through 2026). */
export const TEXAS_AREA_CODES: ReadonlySet<string> = new Set([
  '210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469', '512', '682', '713',
  '726', '737', '806', '817', '830', '832', '903', '915', '936', '940', '945', '956', '972', '979',
]);

/** North American toll-free codes. Businesses, call centres — and most robocall campaigns. */
export const TOLL_FREE_CODES: ReadonlySet<string> = new Set(['800', '833', '844', '855', '866', '877', '888']);

/**
 * texas · out_of_state (another state, a territory or Canada) · toll_free · international (outside
 * +1, or a +1 Caribbean number that bills internationally) · unknown (a browser call, a code not in
 * service, or no number at all).
 */
export type Region = 'texas' | 'out_of_state' | 'toll_free' | 'international' | 'unknown';

export const REGION_LABEL: Record<Region, string> = {
  texas: 'Texas',
  out_of_state: 'Out of state',
  toll_free: 'Toll-free',
  international: 'International',
  unknown: 'Unknown',
};

/** The area code of a North American number, or null. */
export function areaCodeOf(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return /^[2-9]\d{9}$/.test(ten) ? ten.slice(0, 3) : null;
}

function isNorthAmerican(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return d.length === 11 && d.startsWith('1');
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
}

/** What the table knows about this number's area code, or null. */
export function areaInfoOf(phone: string | null | undefined): AreaInfo | null {
  const raw = (phone ?? '').trim();
  if (!raw || /^[a-z]+:/i.test(raw) || !isNorthAmerican(raw)) return null;
  return lookupAreaCode(areaCodeOf(raw));
}

export function regionOf(phone: string | null | undefined): Region {
  const raw = (phone ?? '').trim();
  if (!raw || /^[a-z]+:/i.test(raw)) return 'unknown';
  if (!isNorthAmerican(raw)) return raw.startsWith('+') ? 'international' : 'unknown';
  const code = areaCodeOf(raw);
  if (!code) return 'unknown';
  if (TEXAS_AREA_CODES.has(code)) return 'texas';
  const info = lookupAreaCode(code);
  if (!info) return 'unknown';
  if (info.kind === 'toll_free') return 'toll_free';
  if (info.kind === 'caribbean') return 'international';
  if (info.kind === 'premium' || info.kind === 'non_geographic') return 'unknown';
  return 'out_of_state';
}

/** The place, for a person: "Texas", "Illinois", "Toll-free", "Jamaica", "International". */
export function placeOf(phone: string | null | undefined): string {
  const info = areaInfoOf(phone);
  if (info) return info.place;
  return REGION_LABEL[regionOf(phone)];
}

/**
 * "Illinois (224)", "Toll-free (877)", "Jamaica (876) — international rates" — what a person reads
 * next to the number. Texas numbers say just "Texas (254)".
 */
export function regionText(phone: string | null | undefined): string {
  const info = areaInfoOf(phone);
  const code = areaCodeOf(phone);
  if (info && code) {
    if (info.kind === 'caribbean') return `${info.place} (${code}) — international rates`;
    return `${info.place} (${code})`;
  }
  return REGION_LABEL[regionOf(phone)];
}

/**
 * Why a number's origin is worth a second look, or null. Never a reason to screen on its own — the
 * caption beside a number on the page, nothing more.
 */
export function originNote(phone: string | null | undefined): string | null {
  const info = areaInfoOf(phone);
  if (!info) return null;
  if (info.kind === 'toll_free') return 'Toll-free numbers rarely call out; most inbound toll-free calls are call centres or robocalls.';
  if (info.kind === 'caribbean') return 'Looks like a US number but is in the Caribbean — the "one-ring" callback scam uses these. Calling back is billed internationally.';
  if (info.kind === 'premium') return 'A premium-rate number. Do not call it back.';
  return null;
}
