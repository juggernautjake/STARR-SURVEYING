// lib/receptionist/area-codes.ts — where a caller's number says they are from.
//
// Owner, 2026-10-06: "numbers outside of the state should be suspicious, but sometimes people move
// to Texas from other states, so we still need to answer them."
//
// The live log agrees with the second half: three of the firm's real customer calls in September
// came from Colorado (720), Chicago (872) and California (909) numbers — a title company, an
// engineering firm and a buyer, all about Texas land. So the region is a LABEL a person sees on the
// call and the number, and never on its own a reason to screen. lib/receptionist/screening.ts reads
// it for display only.

/** Every Texas area code in service (and the overlays announced through 2026). */
export const TEXAS_AREA_CODES: ReadonlySet<string> = new Set([
  '210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469', '512', '682', '713',
  '726', '737', '806', '817', '830', '832', '903', '915', '936', '940', '945', '956', '972', '979',
]);

/** North American toll-free codes. Businesses, call centres — and most robocall campaigns. */
export const TOLL_FREE_CODES: ReadonlySet<string> = new Set(['800', '833', '844', '855', '866', '877', '888']);

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

export function regionOf(phone: string | null | undefined): Region {
  const raw = (phone ?? '').trim();
  if (!raw || /^[a-z]+:/i.test(raw)) return 'unknown';
  const d = raw.replace(/\D/g, '');
  // +1 then ten digits is North America; anything else with a + is somewhere else.
  if (raw.startsWith('+') && !(d.length === 11 && d.startsWith('1'))) return 'international';
  const code = areaCodeOf(raw);
  if (!code) return 'unknown';
  if (TEXAS_AREA_CODES.has(code)) return 'texas';
  if (TOLL_FREE_CODES.has(code)) return 'toll_free';
  return 'out_of_state';
}

/** "Out of state (224)" — what a person reads next to the number. */
export function regionText(phone: string | null | undefined): string {
  const r = regionOf(phone);
  const code = areaCodeOf(phone);
  return r === 'out_of_state' && code ? `Out of state (${code})` : REGION_LABEL[r];
}
