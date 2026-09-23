// lib/receptionist/blocklist.ts — numbers the business line will not put through.
//
// Owner, 2026-09-23: "There were three or four today from the same number and it was just a
// recorded message playing... We need to be able to deal with spam callers by blocking them."
//
// ── WHAT THE CHECK COSTS, AND WHY THAT DECIDES ITS SHAPE ────────────────────────────────────────
//
// This runs while a caller is listening to silence, before the owner's phone rings. So it is one
// indexed read and it FAILS OPEN: if the database is slow or down, the call goes through. A missed
// robocall is an annoyance; a customer refused because a lookup timed out is a lost job.
//
// ── E.164, ALWAYS ───────────────────────────────────────────────────────────────────────────────
//
// Twilio presents `From` as +13182091951 and a person types (318) 209-1951. Normalising both ends
// is what makes the admin form and the live check agree — without it a number can sit in the table
// looking blocked while every call from it goes straight through.

/** Twilio's shape: +1 then ten digits for North America. */
export function normaliseNumber(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  // A browser or SIP caller — `client:jacob`, `browser:starr` — is not a phone number and must not
  // be mangled into one. Left as-is so it can never accidentally match a blocked pattern.
  if (/^[a-z]+:/i.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return s.startsWith('+') ? `+${digits}` : `+${digits}`;
}

export interface BlockRule {
  id: string;
  number: string | null;
  pattern: string | null;
  reason: string | null;
  notes: string | null;
}

export interface BlockVerdict {
  blocked: boolean;
  rule?: BlockRule;
  /** For the log and the call row — why this caller was refused. */
  why?: string;
}

/** The minimal Supabase surface, declared so a new query has to be written down to be made. */
export interface BlocklistDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (t: string) => any;
}

/**
 * Is this caller blocked?
 *
 * Exact number first, then prefix patterns. Patterns exist because the campaign that prompted this
 * arrived from two unrelated caller IDs playing one recording — the ID is spoofed and rotates, so
 * blocking a single number is always one step behind it.
 */
export async function isBlocked(db: BlocklistDb | null, from: string | null | undefined): Promise<BlockVerdict> {
  const number = normaliseNumber(from);
  if (!db || !number || /^[a-z]+:/i.test(number)) return { blocked: false };

  try {
    const { data, error } = await db
      .from('blocked_numbers')
      .select('id, number, pattern, reason, notes')
      .eq('active', true)
      .limit(500);
    if (error) return { blocked: false };

    const rules = (data ?? []) as BlockRule[];
    const exact = rules.find((r) => r.number && r.number === number);
    if (exact) return { blocked: true, rule: exact, why: exact.reason ?? 'blocked' };

    const prefix = rules.find((r) => r.pattern && number.startsWith(r.pattern));
    if (prefix) return { blocked: true, rule: prefix, why: `${prefix.reason ?? 'blocked'} (pattern ${prefix.pattern})` };

    return { blocked: false };
  } catch {
    // FAIL OPEN. A lookup that throws must not refuse a customer.
    return { blocked: false };
  }
}

/**
 * Record that a rule stopped a call.
 *
 * Counting hits is what makes a mistaken block findable: a rule with a rising count that turns out
 * to be a builder's mobile is visible, where a silent block looks exactly like a quiet week.
 */
export async function noteBlockHit(db: BlocklistDb | null, ruleId: string): Promise<void> {
  if (!db || !ruleId) return;
  try {
    // Read-then-write rather than an RPC: this is one row, once per blocked call, and adding a
    // database function for it would be more moving parts than the count is worth.
    const { data } = await db.from('blocked_numbers').select('hit_count').eq('id', ruleId).maybeSingle();
    const next = Number((data as { hit_count?: number } | null)?.hit_count ?? 0) + 1;
    await db.from('blocked_numbers')
      .update({ hit_count: next, last_hit_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', ruleId);
  } catch {
    // The block already happened; the tally is bookkeeping and must not fail the call handling.
  }
}
