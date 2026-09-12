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

export type AnsweredBy = 'owner' | 'ai' | 'voicemail' | 'none';

export interface CallTurn { role: 'caller' | 'assistant' | 'owner'; text: string; at?: string }

export interface CallAnalysis {
  summary: string;
  caller_type: 'customer' | 'existing_client' | 'vendor' | 'personal' | 'spam' | 'unknown';
  intent: string;
  urgency: 'low' | 'normal' | 'high';
  sentiment: 'positive' | 'neutral' | 'frustrated';
  action_items: string[];
  follow_up: string;
  suggested_project?: { name: string; service?: string; address?: string; notes?: string } | null;
  questions_asked?: string[];
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
  'id, org_id, call_sid, from_number, to_number, status, answered_by, kind, caller_name, callback_number, caller_email, property_address, property_id, service, details, transcript, voicemail_text, recording_sid, recording_url, recording_duration, recording_source, transcript_sid, transcript_status, summary, analysis, lead_id, project_id, duration_seconds, is_test, started_at, ended_at, notified_at';

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

export async function listCalls(client: Client, limit = 100): Promise<PhoneCall[]> {
  const { data, error } = await client.from('phone_calls').select(CALL_COLUMNS).order('started_at', { ascending: false }).limit(limit);
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
    service: f.service ?? null,
    details: f.details ?? null,
    lead_id: f.leadId ?? null,
  };
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
