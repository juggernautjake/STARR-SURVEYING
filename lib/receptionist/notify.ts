// lib/receptionist/notify.ts — telling the owners what happened on the phone.
//
// Three channels, in this order:
//   1. The website bell + push (`notifyMany`), to everyone with an intake role, linking to the call
//      page where the recording, transcript, and analysis live. This is the one the owner asked
//      for: "notify us on the website and we should be able to click the notification".
//   2. A text. Business calls (customer, vendor, unknown) go to LEAD_SMS_RECIPIENTS, the same list
//      the website form uses. Personal calls go only to RECEPTIONIST_PERSONAL_RECIPIENT.
//   3. An email to the office inbox through Resend, because a text can be missed and an email is
//      searchable a year later.
import { sendSMSViaTwilio } from '@/lib/saas/notifications/sms';
import { leadSmsRecipients, findIntakeRecipients } from '@/lib/leads/intake';
import { notifyMany } from '@/lib/notifications';
import { supabaseAdmin } from '@/lib/supabase';
import type { CallFacts } from './state';
import type { PhoneCall } from './calls';
import { callTitle } from './calls';

export interface CallOutcome {
  from: string;
  facts: CallFacts;
  summary: string;
  recordingUrl?: string;
  transcript?: string;
  /** When known, the notification links to the call page. */
  callId?: string;
  answeredBy?: PhoneCall['answered_by'];
}

export function personalRecipient(env: Record<string, string | undefined> = process.env): string | null {
  const v = (env.RECEPTIONIST_PERSONAL_RECIPIENT ?? '').trim();
  return /^\+1\d{10}$/.test(v) ? v : null;
}

export function recipientsFor(facts: CallFacts, env: Record<string, string | undefined> = process.env): string[] {
  if (facts.kind === 'personal') {
    const p = personalRecipient(env);
    return p ? [p] : leadSmsRecipients(env);
  }
  return leadSmsRecipients(env);
}

export const SITE = 'https://www.starr-surveying.com';

export function outcomeText(o: CallOutcome): string {
  const who = o.facts.name ? `${o.facts.name} (${o.from})` : o.from;
  const kind = o.facts.kind === 'customer' ? 'Customer call' : o.facts.kind === 'personal' ? 'Personal call' : o.facts.kind === 'vendor' ? 'Vendor call' : 'Call';
  const lines = [`${kind} from ${who}: ${o.summary}`];
  if (o.facts.phone && o.facts.phone !== o.from) lines.push(`Callback: ${o.facts.phone}`);
  if (o.facts.address) lines.push(`Property: ${o.facts.address}`);
  if (o.facts.service) lines.push(`Needs: ${o.facts.service}`);
  if (o.callId) lines.push(`${SITE}/admin/calls/${o.callId}`);
  else if (o.facts.leadId) lines.push(`${SITE}/admin/leads/${o.facts.leadId}`);
  if (o.recordingUrl && !o.callId) lines.push(`Voicemail: ${o.recordingUrl}`);
  if (o.transcript) lines.push(`"${o.transcript.slice(0, 400)}"`);
  return lines.join('\n');
}

/** The bell. Everyone with an intake role, linking to the call page. */
export async function notifyInApp(o: CallOutcome): Promise<number> {
  try {
    const recipients = await findIntakeRecipients(supabaseAdmin);
    if (!recipients.length) return 0;
    const personal = o.facts.kind === 'personal';
    await notifyMany(recipients, {
      type: 'call.received',
      title: callTitle({ caller_name: o.facts.name ?? null, from_number: o.from, kind: o.facts.kind ?? null, answered_by: o.answeredBy ?? null }),
      body: o.summary.slice(0, 200),
      icon: 'phone',
      link: o.callId ? `/admin/calls/${o.callId}` : '/admin/calls',
      source_type: 'phone_calls',
      source_id: o.callId,
      escalation_level: o.facts.kind === 'customer' ? 'high' : personal ? 'low' : 'normal',
    });
    return recipients.length;
  } catch (err) {
    console.error('[receptionist] in-app notify failed:', err);
    return 0;
  }
}

export async function notifyOwners(
  o: CallOutcome,
  deps: { send?: typeof sendSMSViaTwilio; email?: (subject: string, text: string) => Promise<boolean>; inApp?: (o: CallOutcome) => Promise<number>; env?: Record<string, string | undefined> } = {},
): Promise<{ texted: number; emailed: boolean; belled: number }> {
  const send = deps.send ?? sendSMSViaTwilio;
  const text = outcomeText(o);
  const belled = await (deps.inApp ?? notifyInApp)(o);
  let texted = 0;
  for (const to of recipientsFor(o.facts, deps.env)) {
    try {
      if (await send({ to, body: text })) texted += 1;
    } catch (err) {
      console.error('[receptionist] owner SMS threw:', err);
    }
  }
  let emailed = false;
  try {
    emailed = await (deps.email ?? emailOffice)(`Phone: ${o.summary.slice(0, 80)}`, text);
  } catch (err) {
    console.error('[receptionist] owner email threw:', err);
  }
  return { texted, emailed, belled };
}

async function emailOffice(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === 'your_resend_api_key') return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Starr Surveying <noreply@starr-surveying.com>', to: ['info@starr-surveying.com'], subject, text }),
  });
  return res.ok;
}
