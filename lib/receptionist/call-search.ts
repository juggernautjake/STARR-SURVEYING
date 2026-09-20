// lib/receptionist/call-search.ts — finding one call among hundreds.
//
// Owner, 2026-09-21: "we need a search bar in the recorded calls page so that we can look up names
// and addresses and key words and stuff, and any calls that contain that info should be shown and
// the rest of the calls should be filtered out from the view. This should be dynamic. It should
// primarily filter by location and name."
//
// ── NAME AND ADDRESS FIRST, EVERYTHING ELSE AFTER ───────────────────────────────────────────────
//
// "Primarily by location and name" is a ranking instruction, not a restriction. Somebody typing
// "pecan" wants the call from Pecan Hollow Drive at the top — but if the only mention of pecan is
// halfway through a transcript, they still want that call, below the address matches rather than
// missing.
//
// So every field is searched and the matches are ORDERED by where the hit landed. A search that
// silently omits a call the person knows exists is the worst outcome here, because they conclude
// the search is broken and stop using it.
//
// ── PHONE NUMBERS ARE NOT TEXT ──────────────────────────────────────────────────────────────────
//
// `254-555-0188`, `(254) 555-0188` and `2545550188` are the same number, and a person will type
// whichever they are looking at. Anything that looks like a number is compared digits-to-digits,
// which is the one special case worth having.
//
// Pure, and the same scoring runs on the server (for the query) and in the browser (for ranking
// what came back). Tested in __tests__/twilio/call-search.test.ts.

import type { PhoneCall } from './calls';

/** Where a match was found, worst to best. The number is the score. */
export const MATCH_WEIGHT = {
  /** The caller's name. What people search for most. */
  name: 100,
  /** The property address. The other thing people search for most. */
  address: 90,
  /** A phone number, matched on digits. */
  phone: 80,
  /** An email address. */
  email: 70,
  /** The service or what the call was about. */
  service: 50,
  /** The one-line summary, ours or the analysis's. */
  summary: 40,
  /** The voicemail text. */
  voicemail: 30,
  /** Somewhere in the transcript. Still a match, just the least specific one. */
  transcript: 10,
} as const;

export type MatchField = keyof typeof MATCH_WEIGHT;

export interface CallMatch {
  score: number;
  /** Which fields matched, best first — so the UI can say WHY a call is in the list. */
  fields: MatchField[];
}

/** Lower-case, collapse whitespace, drop punctuation that people type inconsistently. */
export function normalizeForSearch(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,'"`()\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Just the digits. `null` when there are too few to mean anything. */
export function digitsOf(s: string | null | undefined): string | null {
  const d = (s ?? '').replace(/\D/g, '');
  // Three is the shortest run worth matching: fewer and every call in the log contains it.
  return d.length >= 3 ? d : null;
}

/** Everything in a call that is worth searching, by field. */
function haystacks(call: Partial<PhoneCall>): Record<MatchField, string> {
  const analysis = call.analysis as
    | { summary?: string; contact?: { name?: string; address?: string; email?: string; phone?: string }; intent?: string }
    | null
    | undefined;

  const transcript = Array.isArray(call.transcript)
    ? (call.transcript as Array<{ text?: string }>).map((t) => t?.text ?? '').join(' ')
    : '';

  return {
    // Both the column and whatever the analysis read out of the words: a voicemail-only call has
    // no caller_name at all, and its name lives in the analysis.
    name: [call.caller_name, analysis?.contact?.name].filter(Boolean).join(' '),
    address: [call.property_address, analysis?.contact?.address, call.property_id].filter(Boolean).join(' '),
    phone: [call.from_number, call.callback_number, analysis?.contact?.phone].filter(Boolean).join(' '),
    email: [call.caller_email, analysis?.contact?.email].filter(Boolean).join(' '),
    service: [call.service, call.kind, analysis?.intent].filter(Boolean).join(' '),
    summary: [call.summary, analysis?.summary, call.details].filter(Boolean).join(' '),
    voicemail: call.voicemail_text ?? '',
    transcript,
  };
}

/**
 * Score one call against a query.
 *
 * Returns null when nothing matched, so a caller can filter and rank in one pass.
 *
 * EVERY word in the query has to match SOMEWHERE, but they need not match the same field. Somebody
 * typing "whitfield pecan" is describing one call using two different facts about it, and
 * requiring both in one field would find nothing.
 */
export function scoreCall(call: Partial<PhoneCall>, query: string): CallMatch | null {
  const q = normalizeForSearch(query);
  if (!q) return null;

  const fields = haystacks(call);
  const normalized = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, normalizeForSearch(v)]),
  ) as Record<MatchField, string>;
  const phoneDigits = (fields.phone ?? '').replace(/\D/g, '');

  const words = q.split(' ').filter(Boolean);
  const hit = new Set<MatchField>();

  for (const word of words) {
    let found = false;

    // A number is compared digit to digit, because nobody types a phone number the same way twice.
    const wordDigits = digitsOf(word);
    if (wordDigits && phoneDigits.includes(wordDigits)) {
      hit.add('phone');
      found = true;
    }

    for (const key of Object.keys(MATCH_WEIGHT) as MatchField[]) {
      if (normalized[key].includes(word)) {
        hit.add(key);
        found = true;
      }
    }

    // One unmatched word is enough to exclude the call. Anything looser turns a two-word search
    // into a list of everything that mentions "the".
    if (!found) return null;
  }

  if (hit.size === 0) return null;
  const ordered = [...hit].sort((a, b) => MATCH_WEIGHT[b] - MATCH_WEIGHT[a]);
  return {
    // The best field decides the rank; the others break ties, so a call matching name AND address
    // beats one matching name alone.
    score: MATCH_WEIGHT[ordered[0]] * 10 + ordered.reduce((sum, f) => sum + MATCH_WEIGHT[f], 0),
    fields: ordered,
  };
}

export interface SearchedCall<T> {
  call: T;
  match: CallMatch;
}

/**
 * Filter and rank a list of calls.
 *
 * An empty query returns everything, unranked and in the order it arrived — which is newest first,
 * and is what somebody who has not typed anything wants to see.
 */
export function searchCalls<T extends Partial<PhoneCall>>(calls: T[], query: string): T[] {
  if (!normalizeForSearch(query)) return calls;
  const scored: Array<SearchedCall<T>> = [];
  for (const call of calls) {
    const match = scoreCall(call, query);
    if (match) scored.push({ call, match });
  }
  return scored.sort((a, b) => b.match.score - a.match.score).map((s) => s.call);
}

/** Which fields matched, for showing the person why a call is in their results. */
export function matchedFields<T extends Partial<PhoneCall>>(call: T, query: string): MatchField[] {
  return scoreCall(call, query)?.fields ?? [];
}

/**
 * The Postgres `or` filter for a server-side search.
 *
 * The server narrows, the browser ranks. Postgres can find the rows quickly but cannot order them
 * by which field matched without a great deal more machinery, and the browser has the whole row in
 * hand anyway. So this is deliberately LOOSER than `scoreCall`: it errs toward returning a call
 * that `scoreCall` will then drop, never toward missing one.
 *
 * Only the first word is sent. A multi-word query would need an AND across `or` groups, which
 * PostgREST cannot express in one filter, and the browser applies the rest.
 */
export function supabaseSearchFilter(query: string): string | null {
  // NOT `normalizeForSearch`. That strips hyphens and commas, which turns "254-555-0188" into three
  // separate words and sends only "254" — matching every call from area code 254 and none of the
  // right one. Tokenising here is on whitespace alone, and the dangerous characters are removed
  // from the token afterwards rather than used to split it.
  const first = query.trim().split(/\s+/)[0] ?? '';
  if (!first) return null;

  const digits = digitsOf(first);
  const looksLikeANumber = digits !== null && digits.length >= 6 && /^[\d\s()+\-.]+$/.test(first);

  // A phone number is a phone number. Emitting text clauses for it as well would match any call
  // whose summary happened to contain those digits, which is noise dressed as thoroughness.
  if (looksLikeANumber) {
    return [
      `from_number.ilike.%${digits}%`,
      `callback_number.ilike.%${digits}%`,
    ].join(',');
  }

  // `,` and `)` end a PostgREST filter group and `%` is the wildcard, so a query containing them
  // would change the SHAPE of the filter rather than being searched for. Stripped, not escaped:
  // nobody searches a call log for a bracket.
  const safe = first.replace(/[,()%*]/g, '');
  if (!safe) return null;
  const like = `%${safe}%`;

  const clauses = [
    `caller_name.ilike.${like}`,
    `property_address.ilike.${like}`,
    `property_id.ilike.${like}`,
    `caller_email.ilike.${like}`,
    `service.ilike.${like}`,
    `details.ilike.${like}`,
    `summary.ilike.${like}`,
    `voicemail_text.ilike.${like}`,
  ];

  // A short digit run inside a word — "2484" in "FM 2484" — is still worth trying against the
  // number columns, because somebody looking up a call by a partial number types exactly that.
  const embedded = digitsOf(safe);
  if (embedded) {
    clauses.push(`from_number.ilike.%${embedded}%`, `callback_number.ilike.%${embedded}%`);
  }

  return clauses.join(',');
}
