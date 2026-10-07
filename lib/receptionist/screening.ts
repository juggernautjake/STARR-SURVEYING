// lib/receptionist/screening.ts — which calls ring, which go to voicemail, which are refused.
//
// Owner, 2026-10-06: "If they are clearly a robotic number, then they should be blocked forever …
// If they are silent and Ellie ends up hanging up on them, then they should go straight to voicemail
// from then on … We really need fail safes so that we are not weeding out calls from actual or
// potential customers."
//
// ── THE FAIL-SAFES, WHICH DECIDE EVERYTHING ELSE ─────────────────────────────────────────────────
//
//   1. A person's word beats every rule. "Always ring" on a number puts it through, full stop.
//   2. A number tied to a customer, a lead, a job or a contact — or one that has ever had a real
//      conversation with us — is KNOWN, and no automatic rule touches it. That is checked against
//      the live tables again at the moment of screening, so a customer added this morning is safe
//      this afternoon even if the catalogue has not caught up.
//   3. Screening sends a caller to VOICEMAIL, never to a dead line. The greeting thanks them, points
//      them at the website, and records. A real message from a screened number notifies exactly
//      like any other voicemail, and clears the silent mark for next time.
//   4. Only a recording is ever refused automatically — the caller's own side of the line saying
//      "press 9 to opt out" (lib/receptionist/call-verdict.ts). A silent caller, a salesman, an
//      out-of-state number: voicemail at worst. Out of state alone changes nothing.
//   5. An automatic block is made once. If somebody unblocks a number, it stays unblocked — the
//      rules do not quietly put it back.
//   6. Every decision fails OPEN. A lookup that errors or times out rings the phone.
//   7. One switch turns all automatic screening off: RECEPTIONIST_SCREENING=off. Blocks and choices
//      a person made still apply; nothing automatic does.
//   8. Everything screened is on /admin/calls under "Screened", with the reason, and every number
//      can be put back in one click from the call page or the numbers page.
import type { SupabaseClient } from '@supabase/supabase-js';
import { judgeCall, type CallerVerdict } from './call-verdict';
import { areaCodeOf, placeOf, regionOf } from './area-codes';
import { registryKey } from './registry';
import { isBlocked, type BlockRule } from './blocklist';
import type { PhoneCall } from './calls';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = Pick<SupabaseClient<any, any, any>, 'from' | 'rpc'>;

export type Screening = 'auto' | 'always_ring' | 'voicemail' | 'block';
export const SCREENINGS: readonly Screening[] = ['auto', 'always_ring', 'voicemail', 'block'];

export type NumberStatus = 'unknown' | 'person' | 'customer' | 'silent' | 'robocall' | 'spam';
export const NUMBER_STATUSES: readonly NumberStatus[] = ['unknown', 'person', 'customer', 'silent', 'robocall', 'spam'];

export type Route = 'ring' | 'voicemail' | 'block';

export interface RouteDecision {
  route: Route;
  /** One sentence for the call row and the log. */
  reason: string;
  /** True when no person chose this — the fail-safe re-check applies only to automatic decisions. */
  automatic: boolean;
}

const KNOWN_RELATIONSHIPS = new Set(['owner', 'staff', 'family', 'customer', 'vendor']);

export function screeningEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.RECEPTIONIST_SCREENING ?? '').trim().toLowerCase() !== 'off';
}

export interface RouteInput {
  screening: Screening;
  status: NumberStatus;
  relationship?: string | null;
  /** Tied to a customer, lead, job or contact. */
  linked: boolean;
  rule: (Pick<BlockRule, 'reason'> & { auto_blocked?: boolean }) | null;
  enabled: boolean;
}

/** The decision itself. Pure, so each fail-safe has a test. */
export function decideRoute(i: RouteInput): RouteDecision {
  if (i.screening === 'always_ring') return { route: 'ring', reason: 'Marked "always ring".', automatic: false };
  if (i.screening === 'block') return { route: 'block', reason: 'Blocked by hand.', automatic: false };
  if (i.rule && !i.rule.auto_blocked) return { route: 'block', reason: `On the block list (${i.rule.reason ?? 'blocked'}).`, automatic: false };
  if (i.screening === 'voicemail') return { route: 'voicemail', reason: 'Marked "send to voicemail".', automatic: false };

  const known = i.linked || i.status === 'customer' || i.status === 'person' || KNOWN_RELATIONSHIPS.has(i.relationship ?? '');
  if (known) return { route: 'ring', reason: 'Known caller.', automatic: true };
  if (!i.enabled) return { route: 'ring', reason: 'Automatic screening is switched off.', automatic: true };

  if (i.rule) return { route: 'block', reason: `Automatically blocked (${i.rule.reason ?? 'robocall'}).`, automatic: true };
  if (i.status === 'robocall') return { route: 'voicemail', reason: 'Played a recording on an earlier call.', automatic: true };
  if (i.status === 'silent') return { route: 'voicemail', reason: 'Stayed silent on an earlier call.', automatic: true };
  if (i.status === 'spam' || i.relationship === 'spam') return { route: 'voicemail', reason: 'Marked as spam.', automatic: true };
  return { route: 'ring', reason: 'New or ordinary caller.', automatic: true };
}

// ── What a number is, from its calls ───────────────────────────────────────────────────────────
export interface VerdictCounts {
  person: number; silent: number; robocall: number; spam: number; hangup: number; screened: number; blocked: number; total: number;
}

export function emptyCounts(): VerdictCounts {
  return { person: 0, silent: 0, robocall: 0, spam: 0, hangup: 0, screened: 0, blocked: 0, total: 0 };
}

export function countVerdicts(calls: Array<{ caller_verdict?: string | null; screened_as?: string | null }>): VerdictCounts {
  const c = emptyCounts();
  for (const call of calls) {
    c.total += 1;
    const v = call.caller_verdict as CallerVerdict | null | undefined;
    if (v === 'person') c.person += 1;
    else if (v === 'silent') c.silent += 1;
    else if (v === 'robocall') c.robocall += 1;
    else if (v === 'spam') c.spam += 1;
    else if (v === 'hangup') c.hangup += 1;
    if (call.screened_as === 'voicemail') c.screened += 1;
    if (call.screened_as === 'blocked' || v === 'blocked') c.blocked += 1;
  }
  return c;
}

/** One person on the line outweighs any number of recordings: a real conversation makes a number
 *  known for good (fail-safe 2). Otherwise the worst thing the calls showed. */
export function numberStatus(counts: VerdictCounts, opts: { linked: boolean; relationship?: string | null }): { status: NumberStatus; reason: string } {
  if (opts.linked) return { status: 'customer', reason: 'Tied to a customer, lead, job or contact.' };
  if (opts.relationship && KNOWN_RELATIONSHIPS.has(opts.relationship)) return { status: 'person', reason: `Marked as ${opts.relationship}.` };
  if (counts.person > 0) return { status: 'person', reason: `A real person on ${counts.person === 1 ? 'one call' : `${counts.person} calls`}.` };
  if (opts.relationship === 'spam') return { status: 'spam', reason: 'Marked as spam.' };
  if (counts.robocall > 0) return { status: 'robocall', reason: `A recording on ${counts.robocall === 1 ? 'one call' : `${counts.robocall} calls`}.` };
  if (counts.spam > 0) return { status: 'spam', reason: `A sales or nuisance call on ${counts.spam === 1 ? 'one call' : `${counts.spam} calls`}.` };
  if (counts.silent > 0) return { status: 'silent', reason: `Silent on ${counts.silent === 1 ? 'one call' : `${counts.silent} calls`}.` };
  return { status: 'unknown', reason: 'Nothing to go on yet.' };
}

// ── Links: which customer, lead, job or contact a number belongs to ─────────────────────────────
export interface NumberLinks {
  customerId: string | null;
  leadId: string | null;
  jobId: string | null;
  contactId: string | null;
  /** "Customer: Riverway Title · Job 2025-118" */
  label: string | null;
}

const NO_LINKS: NumberLinks = { customerId: null, leadId: null, jobId: null, contactId: null, label: null };

function sameTen(raw: string | null | undefined, ten: string): boolean {
  return registryKey(raw) === ten;
}

/** Looks the number up everywhere a phone number is typed by a person. Never throws. */
export async function findLinks(db: Client, ten: string): Promise<NumberLinks> {
  if (!/^\d{10}$/.test(ten)) return NO_LINKS;
  const tail = `%${ten.slice(-4)}%`;
  try {
    const [cust, leads, jobs, contacts] = await Promise.all([
      db.from('customers').select('id, display_name, primary_phone').ilike('primary_phone', tail).limit(50),
      db.from('leads').select('id, name, phone, created_at').ilike('phone', tail).order('created_at', { ascending: false }).limit(50),
      db.from('jobs').select('id, name, job_number, client_name, client_phone, deleted_at').ilike('client_phone', tail).limit(50),
      db.from('contacts').select('id, name, phone').ilike('phone', tail).limit(50),
    ]);
    const c = ((cust.data ?? []) as Array<{ id: string; display_name: string | null; primary_phone: string | null }>).find((r) => sameTen(r.primary_phone, ten));
    const l = ((leads.data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>).find((r) => sameTen(r.phone, ten));
    const j = ((jobs.data ?? []) as Array<{ id: string; name: string | null; job_number: string | null; client_name: string | null; client_phone: string | null; deleted_at: string | null }>)
      .find((r) => !r.deleted_at && sameTen(r.client_phone, ten));
    const k = ((contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string | null }>).find((r) => sameTen(r.phone, ten));
    const label = [
      c ? `Customer: ${c.display_name}` : null,
      j ? `Job ${j.job_number ?? ''}${j.name ? ` — ${j.name}` : ''}`.trim() : null,
      !c && !j && l ? `Lead: ${l.name}` : null,
      !c && !j && !l && k ? `Contact: ${k.name}` : null,
    ].filter(Boolean).join(' · ') || null;
    return { customerId: c?.id ?? null, leadId: l?.id ?? null, jobId: j?.id ?? null, contactId: k?.id ?? null, label };
  } catch (err) {
    console.error('[screening] link lookup failed:', err);
    return NO_LINKS;
  }
}

export const isLinked = (l: NumberLinks): boolean => Boolean(l.customerId || l.leadId || l.jobId || l.contactId);

// ── At the door ────────────────────────────────────────────────────────────────────────────────
export interface DoorDecision extends RouteDecision {
  numberId: string | null;
  ruleId: string | null;
}

interface RegistryRow {
  id: string; phone: string; screening: Screening; status: NumberStatus; relationship: string | null;
  customer_id: string | null; lead_id: string | null; job_id: string | null; contact_id: string | null;
}

/**
 * Decide what happens to a call that is ringing right now.
 *
 * Two reads in parallel (the number's row and the block list) and, only when the answer would be to
 * screen automatically, a third look at the customer/lead/job tables (fail-safe 2). Never throws.
 */
export async function screenIncoming(db: Client | null, from: string, env: Record<string, string | undefined> = process.env): Promise<DoorDecision> {
  const ring = (reason: string): DoorDecision => ({ route: 'ring', reason, automatic: true, numberId: null, ruleId: null });
  const ten = registryKey(from);
  if (!db) return ring('No database.');
  try {
    const [reg, verdict] = await Promise.all([
      ten ? db.from('caller_registry').select('id, phone, screening, status, relationship, customer_id, lead_id, job_id, contact_id').eq('phone', ten).maybeSingle() : Promise.resolve({ data: null }),
      isBlocked(db, from),
    ]);
    const row = (reg as { data: RegistryRow | null }).data;
    const rule = verdict.blocked && verdict.rule ? { ...verdict.rule, auto_blocked: (verdict.rule as BlockRule & { auto_blocked?: boolean }).auto_blocked ?? false } : null;
    const linkedNow = Boolean(row && (row.customer_id || row.lead_id || row.job_id || row.contact_id));
    let decision = decideRoute({
      screening: (row?.screening ?? 'auto') as Screening,
      status: (row?.status ?? 'unknown') as NumberStatus,
      relationship: row?.relationship ?? null,
      linked: linkedNow,
      rule,
      enabled: screeningEnabled(env),
    });
    // Fail-safe 2, at the moment it matters: about to screen on a rule nobody chose? Check that the
    // number has not become a customer since the catalogue last looked.
    if (decision.route !== 'ring' && decision.automatic && ten) {
      const links = await findLinks(db, ten);
      if (isLinked(links)) decision = { route: 'ring', reason: `Known caller (${links.label}).`, automatic: true };
    }
    return { ...decision, numberId: row?.id ?? null, ruleId: decision.route === 'block' ? rule?.id ?? null : null };
  } catch (err) {
    console.error('[screening] failed open:', err);
    return ring('Screening lookup failed, so the call rang.');
  }
}

// ── After the call: judge it, and update what we know about the number ─────────────────────────
type SettleRow = Pick<PhoneCall, 'id' | 'from_number' | 'is_test' | 'answered_by' | 'transcript' | 'voicemail_text' | 'analysis' | 'duration_seconds' | 'recording_duration' | 'transcript_status' | 'summary' | 'started_at' | 'caller_name'>
  & { screened_as?: string | null; caller_verdict?: string | null; verdict_reason?: string | null; outcome?: string | null };

export const SETTLE_COLUMNS = 'id, from_number, is_test, answered_by, transcript, voicemail_text, analysis, duration_seconds, recording_duration, transcript_status, summary, started_at, caller_name, screened_as, caller_verdict, verdict_reason, outcome';

/**
 * Judge one call and refresh its number. Returns the verdict written, or null when the evidence is
 * not in yet (the transcript webhook or the sweep will call again). Never throws.
 */
export async function settleCall(db: Client, call: SettleRow, opts: { final?: boolean } = {}): Promise<CallerVerdict | null> {
  try {
    if (call.is_test) return null;
    // A person's correction is final: the rules never overwrite it (see markCall).
    if ((call.verdict_reason ?? '').startsWith(MANUAL_PREFIX)) {
      await refreshNumber(db, call.from_number);
      return (call.caller_verdict as CallerVerdict | null) ?? null;
    }
    const v = judgeCall(call, opts);
    if (!v.ready) return null;
    if (v.verdict !== call.caller_verdict || v.reason !== call.verdict_reason) {
      await db.from('phone_calls').update({ caller_verdict: v.verdict, verdict_reason: v.reason, verdict_at: new Date().toISOString() }).eq('id', call.id);
    }
    await refreshNumber(db, call.from_number);
    return v.verdict;
  } catch (err) {
    console.error('[screening] settle failed:', err);
    return null;
  }
}

/**
 * Rebuild one number's catalogue row from its calls.
 *
 * Recomputed from scratch every time rather than incremented, so a webhook that fires twice cannot
 * double-count, and a corrected verdict corrects the number. Creates the row when the number is new.
 */
export async function refreshNumber(db: Client, phone: string): Promise<void> {
  const ten = registryKey(phone);
  if (!ten) return;
  const { data: calls } = await db.from('phone_calls')
    .select('id, caller_verdict, screened_as, started_at, caller_name, number_id, customer_id, job_id')
    .in('from_number', [`+1${ten}`, ten, `1${ten}`])
    .eq('is_test', false)
    .order('started_at', { ascending: true })
    .limit(1000);
  const rows = (calls ?? []) as Array<{ id: string; caller_verdict: string | null; screened_as: string | null; started_at: string; caller_name: string | null; number_id: string | null; customer_id: string | null; job_id: string | null }>;
  const counts = countVerdicts(rows);
  const links = await findLinks(db, ten);
  const { data: existing } = await db.from('caller_registry').select('id, relationship, first_seen_at, display_name').eq('phone', ten).maybeSingle();
  const ex = existing as { id: string; relationship: string | null; first_seen_at: string | null; display_name: string | null } | null;
  const { status, reason } = numberStatus(counts, { linked: isLinked(links), relationship: ex?.relationship ?? null });
  const now = new Date().toISOString();
  const patch = {
    status, status_reason: reason, status_at: now,
    region: regionOf(`+1${ten}`),
    area_code: areaCodeOf(ten),
    place: placeOf(`+1${ten}`),
    times_called: counts.total,
    calls_person: counts.person, calls_silent: counts.silent, calls_robocall: counts.robocall, calls_spam: counts.spam,
    calls_hangup: counts.hangup, calls_screened: counts.screened, calls_blocked: counts.blocked,
    customer_id: links.customerId, lead_id: links.leadId, job_id: links.jobId, contact_id: links.contactId, linked_label: links.label,
    first_seen_at: ex?.first_seen_at ?? rows[0]?.started_at ?? now,
    last_seen_at: rows[rows.length - 1]?.started_at ?? null,
  };
  let numberId = ex?.id ?? null;
  if (ex) {
    // A name heard on a call fills an empty name (as `observed` — the receptionist may not greet by it).
    const heard = !ex.display_name ? rows.slice().reverse().find((r) => r.caller_name)?.caller_name ?? null : null;
    await db.from('caller_registry').update({ ...patch, ...(heard ? { display_name: heard, name_source: 'observed' } : {}), updated_by: 'screening' }).eq('phone', ten);
  } else {
    const name = rows.slice().reverse().find((r) => r.caller_name)?.caller_name ?? null;
    const { data: made } = await db.from('caller_registry')
      .insert({ phone: ten, ...patch, display_name: name, name_source: 'observed', created_by: 'screening', updated_by: 'screening' })
      .select('id').maybeSingle();
    numberId = (made as { id: string } | null)?.id ?? null;
  }

  // Every call carries its number's id, and the customer or job it belongs to.
  const stale = rows.filter((r) => r.number_id !== numberId || r.customer_id !== links.customerId || r.job_id !== links.jobId).map((r) => r.id);
  for (let i = 0; i < stale.length; i += 100) {
    await db.from('phone_calls').update({ number_id: numberId, customer_id: links.customerId, job_id: links.jobId }).in('id', stale.slice(i, i + 100));
  }

  if (status === 'robocall') await autoBlockOnce(db, ten, reason);
}

/** Fail-safe 5: an automatic block is made once per number, ever. A rule that exists — active or
 *  switched off by a person — means this has been decided, and the rules leave it alone. */
async function autoBlockOnce(db: Client, ten: string, reason: string): Promise<void> {
  if (!screeningEnabled()) return;
  const number = `+1${ten}`;
  const { data: prior } = await db.from('blocked_numbers').select('id').eq('number', number).limit(1);
  if ((prior ?? []).length) return;
  await db.from('blocked_numbers').insert({
    number,
    reason: 'robocall',
    notes: `Blocked automatically: ${reason} Unblock it on the Blocked numbers page if this is wrong.`,
    blocked_by: 'screening',
    auto_blocked: true,
    active: true,
  });
  console.log(`[screening] auto-blocked ${number} — ${reason}`);
}

/**
 * Judge every call that has not been judged. The cron runs it every quarter hour; calls more than
 * `finalAfterMinutes` old are judged on what is there (no transcript is coming any more).
 */
export async function settleUnsettled(db: Client, opts: { limit?: number; finalAfterMinutes?: number; all?: boolean } = {}): Promise<{ looked: number; settled: number }> {
  const finalCutoff = Date.now() - (opts.finalAfterMinutes ?? 30) * 60_000;
  let q = db.from('phone_calls').select(SETTLE_COLUMNS).eq('is_test', false).not('ended_at', 'is', null)
    .order('ended_at', { ascending: false }).limit(opts.limit ?? 100);
  if (!opts.all) q = q.is('caller_verdict', null);
  const { data, error } = await q;
  if (error || !data) return { looked: 0, settled: 0 };
  let settled = 0;
  for (const row of data as unknown as Array<SettleRow & { ended_at?: string | null }>) {
    const ended = Date.parse((row as { ended_at?: string }).ended_at ?? row.started_at);
    const v = await settleCall(db, row, { final: opts.all || ended < finalCutoff });
    if (v) settled += 1;
  }
  return { looked: data.length, settled };
}

export const MANUAL_PREFIX = 'Marked by ';

/** A person says what a call really was — "that was a real customer", "that was a robocall". It
 *  sticks (settleCall skips it) and the number is recomputed at once, so a customer wrongly judged
 *  silent rings through on their very next call. */
export async function markCall(db: Client, callId: string, verdict: Exclude<CallerVerdict, 'blocked'>, by: string): Promise<void> {
  const { data } = await db.from('phone_calls').select('from_number').eq('id', callId).maybeSingle();
  const from = (data as { from_number?: string } | null)?.from_number;
  if (!from) throw new Error('No such call.');
  await db.from('phone_calls').update({ caller_verdict: verdict, verdict_reason: `${MANUAL_PREFIX}${by}.`, verdict_at: new Date().toISOString() }).eq('id', callId);
  await refreshNumber(db, from);
}

/** A person's choice for a number, from the call page or the numbers page. */
export async function setScreening(db: Client, phone: string, screening: Screening, by: string, note?: string | null): Promise<void> {
  const ten = registryKey(phone);
  if (!ten) throw new Error('That is not a ten-digit phone number.');
  const now = new Date().toISOString();
  const { data: existing } = await db.from('caller_registry').select('phone').eq('phone', ten).maybeSingle();
  const patch = { screening, screening_note: (note ?? '').trim() || null, screening_set_by: by, screening_set_at: now, updated_by: by };
  if (existing) await db.from('caller_registry').update(patch).eq('phone', ten);
  else await db.from('caller_registry').insert({ phone: ten, ...patch, name_source: 'observed', created_by: by });

  // The block list is where refusals live and are counted, so "block" and "unblock" keep it in step.
  const number = `+1${ten}`;
  if (screening === 'block') {
    const { data: rules } = await db.from('blocked_numbers').select('id, active').eq('number', number).limit(5);
    const list = (rules ?? []) as Array<{ id: string; active: boolean }>;
    if (list.length) await db.from('blocked_numbers').update({ active: true, auto_blocked: false, blocked_by: by, updated_at: now }).in('id', list.map((r) => r.id));
    else await db.from('blocked_numbers').insert({ number, reason: 'blocked by hand', notes: note ?? null, blocked_by: by, auto_blocked: false, active: true });
  } else {
    // Anything other than "block" means this number is not to be refused: switch its rules off
    // (kept, not deleted, so the history and the tally survive).
    await db.from('blocked_numbers').update({ active: false, updated_at: now }).eq('number', number).eq('active', true);
  }
}
