// lib/receptionist/analysis.ts — what the owners should know about a call, in one screen.
//
// Runs once per call after it ends (or after a transcript arrives for a call Hank answered). One
// Claude request at the `reasoning` tier — this is the read a surveyor acts on — returning a JSON
// object the /admin/calls page renders and the notification quotes. Never throws: a failed analysis
// leaves `analysis` null and the transcript still readable.
import { BUSINESS_NAME } from '@/lib/seo/business';
import { callAi, aiConfigured } from '@/lib/ai/client';
import type { CallAnalysis, CallTurn, PhoneCall } from './calls';

const SYSTEM = `You analyze phone calls to ${BUSINESS_NAME}, a licensed land surveying firm in Belton, Texas, for the two owners (Hank, the surveyor, and Jacob). You are given the call transcript and what the receptionist or system recorded. Produce a JSON object only, no prose:
{
  "summary": "2-3 sentences a busy owner reads on a phone. Who called, why, what happened, what they were told.",
  "caller_type": "customer" | "existing_client" | "vendor" | "personal" | "spam" | "unknown",
  "intent": "one short phrase, e.g. 'boundary survey quote for a residential lot'",
  "urgency": "low" | "normal" | "high",
  "sentiment": "positive" | "neutral" | "frustrated",
  "action_items": ["concrete next steps for the owners, each starting with a verb"],
  "follow_up": "who should call back and by when, in plain words",
  "suggested_project": { "name": "short project name like 'Boundary survey - 123 Main St, Belton'", "service": "...", "address": "...", "notes": "..." } or null if this is not survey work,
  "questions_asked": ["questions the caller asked that the owners should be ready to answer"]
}
Be specific and honest. If the transcript is thin, say so in the summary rather than inventing detail. Urgency is high only when the caller said so or a deadline (closing, construction start, court date) is near.`;

export function transcriptText(turns: CallTurn[] | null | undefined, voicemail?: string | null): string {
  const lines = (turns ?? []).map((t) => `${t.role === 'caller' ? 'Caller' : t.role === 'owner' ? 'Hank' : 'Receptionist'}: ${t.text}`);
  if (voicemail) lines.push(`Voicemail (transcribed): ${voicemail}`);
  return lines.join('\n');
}

export function parseAnalysis(text: string): CallAnalysis | null {
  const m = text.match(/\{[\s\S]*\}/);
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
    };
  } catch {
    return null;
  }
}

export async function analyzeCall(call: Pick<PhoneCall, 'from_number' | 'answered_by' | 'transcript' | 'voicemail_text' | 'kind' | 'caller_name' | 'callback_number' | 'property_address' | 'service' | 'details' | 'duration_seconds'>): Promise<CallAnalysis | null> {
  if (!aiConfigured()) return null;
  const text = transcriptText(call.transcript, call.voicemail_text);
  if (!text.trim()) return null;
  const facts = [
    call.caller_name && `name: ${call.caller_name}`,
    call.callback_number && `callback: ${call.callback_number}`,
    call.property_address && `property: ${call.property_address}`,
    call.service && `service: ${call.service}`,
    call.details && `details: ${call.details}`,
  ].filter(Boolean).join('; ');
  const user = [
    `Caller ID: ${call.from_number}. Answered by: ${call.answered_by ?? 'unknown'}. Duration: ${call.duration_seconds ?? '?'}s.`,
    facts ? `Facts the receptionist collected: ${facts}.` : 'No structured facts were collected.',
    `Transcript:\n${text}`,
  ].join('\n\n');
  try {
    const r = await callAi({ role: 'reasoning', surface: 'phone-call-analysis', system: SYSTEM, messages: [{ role: 'user', content: user }], maxTokens: 1200 });
    return parseAnalysis(r.text);
  } catch (err) {
    console.error('[receptionist] analysis failed:', err);
    return null;
  }
}
