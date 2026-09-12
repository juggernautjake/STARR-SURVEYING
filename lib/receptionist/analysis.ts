// lib/receptionist/analysis.ts — what the owners should know about a call, in one screen.
//
// Runs once per call after it ends (or after a transcript arrives for a call Hank answered). One
// Claude request at the `reasoning` tier — this is the read a surveyor acts on — returning a JSON
// object the /admin/calls page renders and the notification quotes. Never throws: a failed analysis
// leaves `analysis` null and the transcript still readable.
import { BUSINESS_NAME } from '@/lib/seo/business';
import { callAi, aiConfigured } from '@/lib/ai/client';
import type { CallAnalysis, CallContact, CallTurn, PhoneCall } from './calls';

const SYSTEM = `You analyze phone calls to ${BUSINESS_NAME}, a licensed land surveying firm in Belton, Texas, for the two owners (Hank, the surveyor, and Jacob). You are given the call transcript and what the receptionist or system recorded. Produce a JSON object only, no prose:
{
  "summary": "1-2 plain sentences a busy owner reads in a text message: who called, what they want, and what happened or what they were told. Lead with the need, not the greeting.",
  "contact": { "name": "the caller's name as they said it" or null, "phone": "callback number as digits, e.g. 2545550100" or null, "email": "lowercase" or null, "address": "property address or at least city/county" or null, "property_id": "appraisal-district property ID / parcel / account number" or null, "acres": number or null, "service": "what they need, e.g. 'boundary survey'" or null },
  "caller_type": "customer" | "existing_client" | "vendor" | "personal" | "spam" | "unknown",
  "intent": "one short phrase, e.g. 'boundary survey quote for a residential lot'",
  "urgency": "low" | "normal" | "high",
  "sentiment": "positive" | "neutral" | "frustrated",
  "action_items": ["concrete next steps for the owners, each starting with a verb"],
  "follow_up": "who should call back and by when, in plain words",
  "suggested_project": { "name": "short project name like 'Boundary survey - 123 Main St, Belton'", "service": "...", "address": "...", "notes": "..." } or null if this is not survey work,
  "questions_asked": ["questions the caller asked that the owners should be ready to answer"]
}
Be specific and honest. If the transcript is thin, say so in the summary rather than inventing detail. "contact" holds only what the caller actually said on this call (a voicemail is often the only place a name and number appear; listen for them, and for spelled-out names, numbers said digit by digit, and emails said with "at" and "dot"); when a number is said in pieces, join the digits; never copy the caller ID into "phone" unless they read it out; leave every unknown field null. Urgency is high only when the caller said so or a deadline (closing, construction start, court date) is near.`;

export function transcriptText(turns: CallTurn[] | null | undefined, voicemail?: string | null): string {
  const lines = (turns ?? []).map((t) => `${t.role === 'caller' ? 'Caller' : t.role === 'owner' ? 'Hank' : 'Receptionist'}: ${t.text}`);
  if (voicemail) lines.push(`Voicemail (transcribed): ${voicemail}`);
  return lines.join('\n');
}

export function parseAnalysis(text: string): CallAnalysis | null {
  // The model sometimes wraps the object in a ```json fence; take the outermost braces.
  const m = text.replace(/`{3}(?:json)?/gi, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<CallAnalysis>;
    if (typeof j.summary !== 'string') return null;
    const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
    return {
      summary: j.summary.trim(),
      caller_type: pick(j.caller_type, ['customer', 'existing_client', 'vendor', 'personal', 'spam', 'unknown'] as const, 'unknown'),
      intent: typeof j.intent === 'string' ? j.intent : '',
      urgency: pick(j.urgency, ['low', 'normal', 'high'] as const, 'normal'),
      sentiment: pick(j.sentiment, ['positive', 'neutral', 'frustrated'] as const, 'neutral'),
      action_items: Array.isArray(j.action_items) ? j.action_items.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
      follow_up: typeof j.follow_up === 'string' ? j.follow_up : '',
      suggested_project: j.suggested_project && typeof j.suggested_project === 'object' && typeof (j.suggested_project as { name?: unknown }).name === 'string' ? (j.suggested_project as CallAnalysis['suggested_project']) : null,
      questions_asked: Array.isArray(j.questions_asked) ? j.questions_asked.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
      contact: parseContact(j.contact),
    };
  } catch {
    return null;
  }
}

function parseContact(v: unknown): CallContact | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const str = (k: string, max = 200): string | null => { const v = o[k]; return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null; };
  const digits = (typeof o.phone === 'string' ? o.phone : '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null;
  const email = str('email')?.toLowerCase().replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.').replace(/\s+/g, '') ?? null;
  const acresRaw = typeof o.acres === 'number' ? o.acres : parseFloat(String(o.acres ?? '').replace(/[^0-9.]/g, ''));
  const c: CallContact = {
    name: str('name', 80),
    phone,
    email: email && email.includes('@') ? email : null,
    address: str('address'),
    property_id: str('property_id', 40),
    acres: Number.isFinite(acresRaw) && acresRaw > 0 ? acresRaw : null,
    service: str('service', 80),
  };
  return Object.values(c).some((x) => x !== null) ? c : null;
}

/** Columns the analysis can fill in that the receptionist did not: only the blanks, never an
 *  overwrite, so a name the caller spelled out to the receptionist beats the model's guess. */
export function contactColumns(call: Pick<PhoneCall, 'caller_name' | 'callback_number' | 'caller_email' | 'property_address' | 'property_id' | 'acres' | 'service'>, analysis: CallAnalysis | null | undefined): Partial<PhoneCall> {
  const c = analysis?.contact;
  if (!c) return {};
  const out: Partial<PhoneCall> = {};
  if (!call.caller_name && c.name) out.caller_name = c.name;
  if (!call.callback_number && c.phone) out.callback_number = c.phone;
  if (!call.caller_email && c.email) out.caller_email = c.email;
  if (!call.property_address && c.address) out.property_address = c.address;
  if (!call.property_id && c.property_id) out.property_id = c.property_id;
  if (call.acres == null && c.acres != null) out.acres = c.acres;
  if (!call.service && c.service) out.service = c.service;
  return out;
}

export async function analyzeCall(call: Pick<PhoneCall, 'from_number' | 'answered_by' | 'transcript' | 'voicemail_text' | 'kind' | 'caller_name' | 'callback_number' | 'caller_email' | 'property_address' | 'property_id' | 'acres' | 'service' | 'details' | 'duration_seconds'>): Promise<CallAnalysis | null> {
  if (!aiConfigured()) return null;
  const text = transcriptText(call.transcript, call.voicemail_text);
  if (!text.trim()) return null;
  const facts = [
    call.caller_name && `name: ${call.caller_name}`,
    call.callback_number && `callback: ${call.callback_number}`,
    call.caller_email && `email: ${call.caller_email}`,
    call.property_address && `property: ${call.property_address}`,
    call.property_id && `property ID: ${call.property_id}`,
    call.acres != null && `acres: ${call.acres}`,
    call.service && `service: ${call.service}`,
    call.details && `details: ${call.details}`,
  ].filter(Boolean).join('; ');
  const user = [
    `Caller ID: ${call.from_number}. Answered by: ${call.answered_by ?? 'unknown'}. Duration: ${call.duration_seconds ?? '?'}s.`,
    facts ? `Facts the receptionist collected: ${facts}.` : 'No structured facts were collected.',
    `Transcript:\n${text}`,
  ].join('\n\n');
  try {
    const r = await callAi({ role: 'reasoning', surface: 'phone-call-analysis', system: SYSTEM, messages: [{ role: 'user', content: user }], maxTokens: 3000 });
    const parsed = parseAnalysis(r.text);
    if (!parsed) console.error('[receptionist] analysis returned no parseable JSON:', r.text.slice(0, 200).replace(/\s+/g, ' '), '…', r.text.slice(-120).replace(/\s+/g, ' '));
    return parsed;
  } catch (err) {
    console.error('[receptionist] analysis failed:', err);
    return null;
  }
}
