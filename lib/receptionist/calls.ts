// lib/receptionist/calls.ts — the call record.
//
// One row per call to the business line, written by the Twilio webhooks as the call unfolds and
// read by /admin/calls. The webhooks run with no session (unscoped), so they set org_id themselves
// through the same resolver the lead intake uses; the admin routes run scoped and see only the
// firm's rows. Everything here is a thin, typed layer over `phone_calls` — no business rules.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveIntakeOrgId } from '@/lib/leads/intake';
import type { CallFacts } from './state';
import { supabaseSearchFilter } from './call-search';

// 'blocked' is its own answer, not a flavour of 'none'. A call nobody answered is a missed
// customer and belongs in the missed-call count; a call the system REFUSED is neither missed nor
// answered, and folding the two together would either hide the blocks or inflate the misses.
export type AnsweredBy = 'owner' | 'ai' | 'voicemail' | 'none' | 'blocked';

export interface CallTurn { role: 'caller' | 'assistant' | 'owner'; text: string; at?: string }

export interface CallAnalysis {
  summary: string;
  caller_type: 'customer' | 'existing_client' | 'vendor' | 'personal' | 'spam' | 'unknown';
  intent: string;
  urgency: 'low' | 'normal' | 'high';
  /** The date the caller named, when there is one. The receptionist promises on the call that Hank
   *  is told straight away, so this has to travel as far as the text message. */
  deadline?: string | null;
  sentiment: 'positive' | 'neutral' | 'frustrated';
  action_items: string[];
  follow_up: string;
  suggested_project?: { name: string; service?: string; address?: string; notes?: string } | null;
  questions_asked?: string[];
  /** Contact and job facts the analysis read out of the words themselves — the only source when a
   *  caller just leaves a voicemail. Each field is null unless the caller actually said it. */
  contact?: CallContact | null;
}

export interface CallContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  property_id: string | null;
  acres: number | null;
  service: string | null;
}

export interface PhoneCall {
  id: string;
  org_id: string | null;
  call_sid: string;
  from_number: string;
  to_number: string;
  status: string;
  answered_by: AnsweredBy | null;
  kind: string | null;
  caller_name: string | null;
  callback_number: string | null;
  caller_email: string | null;
  property_address: string | null;
  property_id: string | null;
  acres: number | null;
  service: string | null;
  details: string | null;
  transcript: CallTurn[];
  voicemail_text: string | null;
  recording_sid: string | null;
  recording_url: string | null;
  recording_duration: number | null;
  recording_source: string | null;
  transcript_sid: string | null;
  transcript_status: string | null;
  summary: string | null;
  analysis: CallAnalysis | null;
  lead_id: string | null;
  project_id: string | null;
  duration_seconds: number | null;
  /** A call placed from /admin/dev/receptionist. Same pipeline, no owner alerts, no lead. */
  is_test: boolean;
  started_at: string;
  ended_at: string | null;
  notified_at: string | null;
}

export const CALL_COLUMNS =
  'id, org_id, call_sid, from_number, to_number, status, answered_by, kind, caller_name, callback_number, caller_email, property_address, property_id, acres, service, details, transcript, voicemail_text, recording_sid, recording_url, recording_duration, recording_source, transcript_sid, transcript_status, summary, analysis, lead_id, project_id, duration_seconds, is_test, started_at, ended_at, notified_at';

type Client = Pick<SupabaseClient, 'from'>;

export async function startCall(client: Client, args: { callSid: string; from: string; to: string; isTest?: boolean }): Promise<PhoneCall | null> {
  const org = await resolveIntakeOrgId(client);
  const row = {
    org_id: 'orgId' in org ? org.orgId : null,
    call_sid: args.callSid,
    from_number: args.from,
    to_number: args.to,
    status: 'ringing',
    transcript: [],
    ...(args.isTest ? { is_test: true } : {}),
  };
  const { data, error } = await client.from('phone_calls').upsert(row, { onConflict: 'call_sid' }).select(CALL_COLUMNS).maybeSingle();
  if (error) { console.error('[calls] startCall failed:', error); return null; }
  return (data as unknown as PhoneCall) ?? null;
}

export async function updateCall(client: Client, callSid: string, patch: Partial<Omit<PhoneCall, 'id' | 'call_sid'>>): Promise<PhoneCall | null> {
  const { data, error } = await client.from('phone_calls').update({ ...patch, updated_at: new Date().toISOString() }).eq('call_sid', callSid).select(CALL_COLUMNS).maybeSingle();
  if (error) { console.error('[calls] updateCall failed:', error); return null; }
  return (data as unknown as PhoneCall) ?? null;
}

export async function getCallBySid(client: Client, callSid: string): Promise<PhoneCall | null> {
  const { data, error } = await client.from('phone_calls').select(CALL_COLUMNS).eq('call_sid', callSid).maybeSingle();
  if (error) { console.error('[calls] getCallBySid failed:', error); return null; }
  return (data as unknown as PhoneCall) ?? null;
}

/** Is this call a test? Read from the row, which is the only place that cannot be spoofed by a cookie
 *  or a relay payload. Used before anything that would create a lead or reach a person. */
export async function isTestCall(client: Client, callSid: string): Promise<boolean> {
  if (!callSid) return false;
  const { data } = await client.from('phone_calls').select('is_test').eq('call_sid', callSid).maybeSingle();
  return Boolean((data as { is_test?: boolean } | null)?.is_test);
}

export async function getCallByRecordingSid(client: Client, recordingSid: string): Promise<PhoneCall | null> {
  const { data, error } = await client.from('phone_calls').select(CALL_COLUMNS).eq('recording_sid', recordingSid).maybeSingle();
  if (error) { console.error('[calls] getCallByRecordingSid failed:', error); return null; }
  return (data as unknown as PhoneCall) ?? null;
}

export async function getCall(client: Client, id: string): Promise<PhoneCall | null> {
  const { data, error } = await client.from('phone_calls').select(CALL_COLUMNS).eq('id', id).maybeSingle();
  if (error) { console.error('[calls] getCall failed:', error); return null; }
  return (data as unknown as PhoneCall) ?? null;
}

export interface ListCallsOptions {
  limit?: number;
  /**
   * Which log to read.
   *
   * Owner, 2026-09-21: "I want you to keep test call recordings and live call recordings seperate
   * on the website. That way we aren't seeing test calls mixed in with real calls."
   *
   * So this is a SCOPE, not a filter — the two are different logs that happen to share a table, and
   * the default is `live` because that is the one with customers in it. It is applied in the query
   * rather than in the browser: a page that fetches 200 rows and hides half of them shows 100 live
   * calls while claiming to show 200, and the oldest ones fall off the end unseen.
   */
  scope?: 'live' | 'test' | 'both';
  /** Narrowed server-side; the browser ranks what comes back. See lib/receptionist/call-search.ts. */
  search?: string;
}

export async function listCalls(client: Client, opts: ListCallsOptions | number = {}): Promise<PhoneCall[]> {
  // The old signature was `listCalls(client, limit)`. Kept working because several callers use it
  // and a silent change of meaning in a positional argument is the worst kind of breakage.
  const o: ListCallsOptions = typeof opts === 'number' ? { limit: opts } : opts;
  const limit = Math.min(500, Math.max(1, o.limit ?? 100));
  const scope = o.scope ?? 'live';

  let q = client.from('phone_calls').select(CALL_COLUMNS).order('started_at', { ascending: false });
  if (scope === 'live') q = q.eq('is_test', false);
  else if (scope === 'test') q = q.eq('is_test', true);

  const filter = supabaseSearchFilter(o.search ?? '');
  if (filter) q = q.or(filter);

  const { data, error } = await q.limit(limit);
  if (error) { console.error('[calls] listCalls failed:', error); return []; }
  return (data as unknown as PhoneCall[]) ?? [];
}

/** Append one turn to the stored transcript. Read-modify-write is fine: one call, one webhook at a time. */
export async function appendTurns(client: Client, callSid: string, turns: CallTurn[]): Promise<void> {
  const cur = await getCallBySid(client, callSid);
  if (!cur) return;
  const stamped = turns.map((t) => ({ ...t, at: t.at ?? new Date().toISOString() }));
  await updateCall(client, callSid, { transcript: [...(cur.transcript ?? []), ...stamped] });
}

export function factsToColumns(f: CallFacts): Partial<PhoneCall> {
  return {
    kind: f.kind ?? null,
    caller_name: f.name ?? null,
    callback_number: f.phone ?? null,
    caller_email: f.email ?? null,
    property_address: f.address ?? null,
    property_id: f.propertyId ?? null,
    acres: f.acres ?? null,
    service: f.service ?? null,
    details: f.details ?? null,
    lead_id: f.leadId ?? null,
  };
}

/** The inverse: what the call row knows, as facts. Nulls become absent keys. */
export function factsFromCall(c: Partial<PhoneCall> | null | undefined): CallFacts {
  if (!c) return {};
  const f: CallFacts = {};
  if (c.kind === 'customer' || c.kind === 'personal' || c.kind === 'vendor' || c.kind === 'unknown') f.kind = c.kind;
  if (c.caller_name) f.name = c.caller_name;
  if (c.callback_number) f.phone = c.callback_number;
  if (c.caller_email) f.email = c.caller_email;
  if (c.property_address) f.address = c.property_address;
  if (c.property_id) f.propertyId = c.property_id;
  if (typeof c.acres === 'number' && Number.isFinite(c.acres)) f.acres = c.acres;
  if (c.service) f.service = c.service;
  if (c.details) f.details = c.details;
  if (c.lead_id) f.leadId = c.lead_id;
  return f;
}

/** A short human title for lists and notifications. */
export function callTitle(c: Pick<PhoneCall, 'caller_name' | 'from_number' | 'kind' | 'answered_by'>): string {
  const who = c.caller_name || formatUsPhone(c.from_number);
  const how = c.answered_by === 'owner' ? 'answered by Hank' : c.answered_by === 'voicemail' ? 'left a voicemail' : c.answered_by === 'ai' ? 'handled by the receptionist' : 'missed';
  const kind = c.kind === 'customer' ? 'Customer' : c.kind === 'personal' ? 'Personal' : c.kind === 'vendor' ? 'Vendor' : '';
  return `${kind ? kind + ' call' : 'Call'} from ${who}, ${how}`;
}

export function formatUsPhone(e164: string | null | undefined): string {
  const d = (e164 ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return e164 ?? '';
}

export { supabaseAdmin as callsClient };
