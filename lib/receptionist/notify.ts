// lib/receptionist/notify.ts — telling the owners what the receptionist did.
//
// Business calls (a customer, a vendor, unknown) text everyone in LEAD_SMS_RECIPIENTS, the same
// list the website's request form uses, so a lead from the phone looks like a lead from the form.
// Personal calls text only RECEPTIONIST_PERSONAL_RECIPIENT (the owner whose phone forwarded), so a
// message from a family member does not land on the other owner's phone.
//
// Every message is also emailed to the office inbox through Resend, the same sender the form uses,
// because a text can be missed and an email is searchable a year later.
import { sendSMSViaTwilio } from '@/lib/saas/notifications/sms';
import { leadSmsRecipients } from '@/lib/leads/intake';
import type { CallFacts } from './state';

export interface CallOutcome {
  from: string;
  facts: CallFacts;
  summary: string;
  recordingUrl?: string;
  transcript?: string;
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

export function outcomeText(o: CallOutcome): string {
  const who = o.facts.name ? `${o.facts.name} (${o.from})` : o.from;
  const kind = o.facts.kind === 'customer' ? 'Customer call' : o.facts.kind === 'personal' ? 'Personal call' : o.facts.kind === 'vendor' ? 'Vendor call' : 'Call';
  const lines = [`${kind} from ${who}: ${o.summary}`];
  if (o.facts.phone && o.facts.phone !== o.from) lines.push(`Callback: ${o.facts.phone}`);
  if (o.facts.address) lines.push(`Property: ${o.facts.address}`);
  if (o.facts.service) lines.push(`Needs: ${o.facts.service}`);
  if (o.facts.leadId) lines.push(`https://www.starr-surveying.com/admin/leads/${o.facts.leadId}`);
  if (o.recordingUrl) lines.push(`Voicemail: ${o.recordingUrl}`);
  if (o.transcript) lines.push(`"${o.transcript.slice(0, 400)}"`);
  return lines.join('\n');
}

export async function notifyOwners(
  o: CallOutcome,
  deps: { send?: typeof sendSMSViaTwilio; email?: (subject: string, text: string) => Promise<boolean>; env?: Record<string, string | undefined> } = {},
): Promise<{ texted: number; emailed: boolean }> {
  const send = deps.send ?? sendSMSViaTwilio;
  const text = outcomeText(o);
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
  return { texted, emailed };
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
