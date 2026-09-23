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
//
// The text (owner, 2026-09-12): a one-to-two-sentence summary, then the caller's name, number and
// email, then the job (address, property ID, acres), then one link that opens the call page with
// the recording loaded. Facts come from three places, best first: what the receptionist collected
// live, what the call row already holds, and what the analysis read out of the words — which is
// the only source when a caller just leaves a voicemail.
import { BUSINESS_NAME, EMAIL, SITE_URL } from '@/lib/seo/business';
import { sendSMSViaTwilio } from '@/lib/saas/notifications/sms';
import { leadSmsRecipients, findIntakeRecipients } from '@/lib/leads/intake';
import { notifyMany } from '@/lib/notifications';
import { supabaseAdmin } from '@/lib/supabase';
import { ASSISTANT_NAME, OWNER_NAME } from './knowledge';
import type { CallFacts } from './state';
import type { PhoneCall } from './calls';
import { callTitle, factsFromCall, formatUsPhone } from './calls';

export interface CallOutcome {
  from: string;
  facts: CallFacts;
  summary: string;
  recordingUrl?: string;
  transcript?: string;
  /** When known, the notification links to the call page. */
  callId?: string;
  answeredBy?: PhoneCall['answered_by'];
  /** The call row when known: its columns and analysis fill in whatever the live facts lack. */
  call?: Partial<PhoneCall> | null;
  /** A test call, when the row is not to hand. Same effect as `call.is_test`: nobody is told. */
  test?: boolean;
  /**
   * This summary is a placeholder and a better one is coming.
   *
   * Set by `after-dial`, whose summary is literally "the recording and a summary follow once it is
   * transcribed". Holding the email for the real one is the difference between an inbox that says
   * "Answered by Hank, 287 seconds" and one that says "Chrissy at Riverway Title called about the
   * 2020 survey for Lot 14". The bell still lights immediately either way.
   */
  provisional?: boolean;
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

export const SITE = SITE_URL;

/** Live facts first, then the row, then the analysis's reading of the words. */
export function mergedFacts(o: Pick<CallOutcome, 'facts' | 'call'>): CallFacts {
  const c = o.call?.analysis?.contact;
  const fromWords: CallFacts = c
    ? {
        name: c.name ?? undefined,
        phone: c.phone ?? undefined,
        email: c.email ?? undefined,
        address: c.address ?? undefined,
        propertyId: c.property_id ?? undefined,
        acres: c.acres ?? undefined,
        service: c.service ?? undefined,
      }
    : {};
  const out: CallFacts = { ...fromWords, ...factsFromCall(o.call), ...o.facts };
  for (const k of Object.keys(out) as Array<keyof CallFacts>) if (out[k] === undefined || out[k] === null || out[k] === '') delete out[k];
  return out;
}

/** The first one or two sentences, whole, under a soft cap. */
export function briefSummary(text: string, max = 300): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const parts = t.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];
  let out = parts[0] ?? '';
  if (parts[1] && (out + ' ' + parts[1]).length <= max) out += ' ' + parts[1];
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}

function headline(o: CallOutcome, f: CallFacts): string {
  const type = o.call?.analysis?.caller_type;
  const kind =
    f.kind === 'customer' ? (type === 'existing_client' ? 'Existing client' : 'Customer') :
    f.kind === 'personal' ? 'Personal' :
    f.kind === 'vendor' ? 'Vendor' :
    type === 'spam' ? 'Likely spam' : '';
  const how = o.answeredBy;
  if (how === 'voicemail') return `${kind || 'New'} voicemail`;
  if (how === 'owner') return `${kind ? kind + ' call' : 'Call'} answered by ${OWNER_NAME}`;
  if (how === 'none') return `Missed ${kind ? kind.toLowerCase() + ' call' : 'call'}`;
  if (how === 'ai') return `${kind ? kind + ' call' : 'New call'}, handled by ${ASSISTANT_NAME}`;
  return kind ? `${kind} call` : 'Call';
}

function acresText(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 1).replace(/\.?0+$/, '');
  return `${s} ac`;
}

export function callLink(o: Pick<CallOutcome, 'callId' | 'facts'>): string | null {
  if (o.callId) return `${SITE}/admin/calls/${o.callId}`;
  if (o.facts.leadId) return `${SITE}/admin/leads/${o.facts.leadId}`;
  return null;
}

/**
 * A deadline the caller named, when the analysis found one and called the call urgent.
 *
 * ── WHY THIS IS AT THE TOP OF THE MESSAGE AND NOT IN THE SUMMARY ────────────────────────────────
 *
 * The receptionist now asks every caller whether anything has a date on it, and when there is one
 * she says out loud that ${OWNER} is being told straight away. That is a promise the firm makes on
 * a recorded line, so the text he gets has to keep it — a closing on Friday buried in the third
 * sentence of a summary, in a message that looks like every other message, is not being told.
 *
 * `urgency` has been on the analysis all along and changed nothing about what was sent.
 */
function urgentPrefix(o: CallOutcome): string | null {
  if (o.call?.analysis?.urgency !== 'high') return null;
  const when = (o.call?.analysis?.deadline ?? '').trim();
  return when ? `URGENT — ${when}` : 'URGENT';
}

export function outcomeText(o: CallOutcome): string {
  const f = mergedFacts(o);
  const urgent = urgentPrefix(o);
  const lines: string[] = [
    urgent ? `${urgent}\n${BUSINESS_NAME}: ${headline(o, f)}` : `${BUSINESS_NAME}: ${headline(o, f)}`,
  ];

  // Who, and how to reach them.
  const callback = f.phone && f.phone !== o.from ? f.phone : o.from;
  const who = [f.name, formatUsPhone(callback) || callback].filter(Boolean).join(' · ');
  if (who) lines.push(f.phone && f.phone !== o.from ? `${who} (called from ${formatUsPhone(o.from)})` : who);
  if (f.email) lines.push(f.email);

  // What happened.
  const summary = briefSummary(o.summary);
  if (summary) lines.push(summary);

  // The job.
  const job = [f.address, f.propertyId ? `ID ${f.propertyId}` : null, f.acres != null ? acresText(f.acres) : null].filter(Boolean);
  if (job.length) lines.push(`Property: ${job.join(' · ')}`);
  if (f.service && !summary.toLowerCase().includes(f.service.toLowerCase())) lines.push(`Needs: ${f.service}`);

  // The words themselves, only when nothing better summarised them.
  if (o.transcript && !o.call?.analysis?.summary) lines.push(`"${o.transcript.replace(/\s+/g, ' ').trim().slice(0, 200)}"`);

  // One link: the call page with the recording, or the voicemail file when there is no row yet.
  const link = callLink(o);
  if (link) lines.push(`Listen: ${link}`);
  else if (o.recordingUrl) lines.push(`Voicemail: ${o.recordingUrl}`);
  return lines.join('\n');
}

/**
 * The bell. Everyone with an intake role, linking to the call page.
 *
 * ── ONE ROW PER CALL, REVISED — NOT ONE PER WEBHOOK ─────────────────────────────────────────────
 *
 * Owner, 2026-09-23: "whenever someone calls, we get 2-3 emails and 2-3 app notifications... I want
 * it so that these notifications are all consolidated into one email and one notification."
 *
 * A single call fires several webhooks — the dial result, then the transcript minutes later — and
 * each used to insert its own row. Measured on the live table: exactly 12 rows per call, 2 for each
 * of the 6 people with an intake role, every time.
 *
 * The two are not equals. The first says "Answered by Hank, 287 seconds. The recording and a
 * summary follow once it is transcribed"; the second says "Chrissy at Riverway Title called about
 * Starr's 2020 survey (job 20178) for Lot…". So this does not drop the later one — it REVISES the
 * row already there, and the bell ends up holding the good summary rather than both.
 *
 * Revising marks it unread again: the placeholder may well have been read, and the real summary is
 * the part actually worth reading. No second push — the phone already buzzed for this call.
 */
export async function notifyInApp(o: CallOutcome): Promise<number> {
  try {
    const recipients = await findIntakeRecipients(supabaseAdmin);
    if (!recipients.length) return 0;
    const f = mergedFacts(o);
    const personal = f.kind === 'personal';
    const content = {
      title: callTitle({ caller_name: f.name ?? null, from_number: o.from, kind: f.kind ?? null, answered_by: o.answeredBy ?? null }),
      body: briefSummary(o.summary, 200),
      link: o.callId ? `/admin/calls/${o.callId}` : '/admin/calls',
      escalation_level: (f.kind === 'customer' ? 'high' : personal ? 'low' : 'normal') as 'high' | 'low' | 'normal',
    };

    if (o.callId) {
      const { data: already } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('source_type', 'phone_calls')
        .eq('source_id', o.callId)
        .limit(50);
      if (already?.length) {
        await supabaseAdmin
          .from('notifications')
          .update({ ...content, is_read: false, read_at: null })
          .eq('source_type', 'phone_calls')
          .eq('source_id', o.callId);
        console.log(`[receptionist] revised ${already.length} existing bell rows for call ${o.callId}`);
        return already.length;
      }
    }

    await notifyMany(recipients, {
      ...content,
      type: 'call.received',
      icon: 'phone',
      source_type: 'phone_calls',
      source_id: o.callId,
    });
    return recipients.length;
  } catch (err) {
    console.error('[receptionist] in-app notify failed:', err);
    return 0;
  }
}

export async function notifyOwners(
  o: CallOutcome,
  deps: {
    send?: typeof sendSMSViaTwilio;
    email?: (subject: string, text: string) => Promise<boolean>;
    inApp?: (o: CallOutcome) => Promise<number>;
    env?: Record<string, string | undefined>;
    /** Has an email already gone out about this call? Injected so the gate can be tested. */
    alreadyNotified?: (callId: string) => Promise<boolean>;
    stamp?: (callId: string) => Promise<void>;
  } = {},
): Promise<{ texted: number; emailed: boolean; belled: number }> {
  // ── A TEST CALL TELLS NOBODY. THE CHECK LIVES HERE (owner, 2026-09-15) ──────────────────────
  // "For test calls, it should all be closed so I can test the voice and the responses." Every caller
  // used to make this check for itself, and the Voice Intelligence transcript webhook did not — so a
  // test call the owner answered still texted, emailed and rang the bell. One gate, at the door that
  // every text, email and in-app notification goes through, cannot be forgotten by the next caller.
  if (o.test || o.call?.is_test) {
    console.log('[receptionist] test call — no text, no email, no bell');
    return { texted: 0, emailed: false, belled: 0 };
  }
  const send = deps.send ?? sendSMSViaTwilio;
  const text = outcomeText(o);
  const belled = await (deps.inApp ?? notifyInApp)(o);

  // ── ONE EMAIL AND ONE TEXT PER CALL ───────────────────────────────────────────────────────────
  //
  // The bell above can be revised after the fact; a sent email cannot. So the email waits for a
  // summary worth sending, and once it has gone out, later webhooks for the same call stay quiet.
  //
  // `notified_at` on the call row is the record of that. It is the same stamp a blocked call gets
  // (app/api/twilio/receptionist/route.ts), for the same reason: it means "this call has been
  // dealt with; no webhook that fires later should mail anybody about it".
  if (o.callId) {
    const gate = await emailGateFor(o, deps.alreadyNotified ?? hasBeenNotified);
    if (gate !== 'send') {
      console.log(`[receptionist] call ${o.callId}: bell only — ${gate}`);
      return { texted: 0, emailed: false, belled };
    }
  }

  let texted = 0;
  for (const to of recipientsFor(mergedFacts(o), deps.env)) {
    try {
      if (await send({ to, body: text })) texted += 1;
    } catch (err) {
      console.error('[receptionist] owner SMS threw:', err);
    }
  }
  let emailed = false;
  try {
    emailed = await (deps.email ?? emailOffice)(`Phone: ${briefSummary(o.summary, 80)}`, text);
  } catch (err) {
    console.error('[receptionist] owner email threw:', err);
  }

  // Stamped after the fact, so a send that threw leaves the call still owed an email and the sweep
  // picks it up, rather than marking it done on the way in and losing it.
  if (o.callId && (emailed || texted)) {
    await (deps.stamp ?? stampNotified)(o.callId);
  }
  return { texted, emailed, belled };
}

/**
 * Should this outcome put an email and a text out, or has the call been dealt with already?
 *
 * Fails toward SENDING: a lookup that throws reads as "not yet notified", and the worst case is the
 * duplicate we started with rather than a customer nobody hears about.
 */
async function emailGateFor(o: CallOutcome, notified: (id: string) => Promise<boolean>): Promise<'send' | string> {
  if (await notified(o.callId as string)) return 'already emailed about this call';
  // The placeholder from `after-dial` — "the recording and a summary follow once it is
  // transcribed" — is not worth an email when the real summary is minutes away. If the transcript
  // never arrives, the sweep in `mailUnnotifiedCalls` sends what we have rather than nothing.
  if (o.provisional) return 'summary is provisional; waiting for the transcript';
  return 'send';
}

async function hasBeenNotified(callId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('phone_calls').select('notified_at').eq('id', callId).maybeSingle();
    return Boolean((data as { notified_at?: string | null } | null)?.notified_at);
  } catch (err) {
    console.error('[receptionist] notified_at lookup threw, sending anyway:', err);
    return false;
  }
}

async function stampNotified(callId: string): Promise<void> {
  try {
    await supabaseAdmin.from('phone_calls')
      .update({ notified_at: new Date().toISOString() }).eq('id', callId);
  } catch (err) {
    console.error('[receptionist] could not stamp notified_at:', err);
  }
}

/**
 * The calls that were never emailed about, because the transcript that was supposed to carry the
 * real summary never came.
 *
 * Without this, holding the provisional email is a silent way to lose a call: the bell would show
 * it and the inbox never would. Run from the receptionist-transcripts cron, which already ticks
 * every 15 minutes for the same reason — ElevenLabs writes its summary a little after the call.
 *
 * `olderThanMinutes` is the grace period: long enough that a transcript still on its way is not
 * pre-empted, short enough that a missed customer is not sitting unseen for an hour.
 */
export async function mailUnnotifiedCalls(
  opts: { olderThanMinutes?: number; notify?: typeof notifyOwners } = {},
): Promise<{ swept: number; mailed: number }> {
  const cutoff = new Date(Date.now() - (opts.olderThanMinutes ?? 20) * 60_000).toISOString();
  const notify = opts.notify ?? notifyOwners;
  try {
    const { data, error } = await supabaseAdmin
      .from('phone_calls')
      .select('id, from_number, summary, answered_by, is_test, analysis, caller_name, caller_email, started_at')
      .is('notified_at', null)
      .not('ended_at', 'is', null)
      .lt('ended_at', cutoff)
      .order('ended_at', { ascending: false })
      .limit(50);
    if (error || !data?.length) return { swept: 0, mailed: 0 };

    let mailed = 0;
    for (const row of data as unknown as PhoneCall[]) {
      // A blocked call is stamped the moment it is refused, so it never reaches here. A test call
      // is refused by notifyOwners itself. Both checks are cheap and both are worth keeping local.
      if (row.is_test) continue;
      const summary = row.analysis?.summary || row.summary || 'Called. No transcript arrived, so there is no summary — the recording is on the call page.';
      const res = await notify({
        from: row.from_number, facts: {}, summary,
        callId: row.id, answeredBy: row.answered_by, call: row,
      });
      if (res.emailed || res.texted) mailed += 1;
    }
    console.log(`[receptionist] sweep: ${data.length} calls never emailed about, ${mailed} sent`);
    return { swept: data.length, mailed };
  } catch (err) {
    console.error('[receptionist] unnotified sweep failed:', err);
    return { swept: 0, mailed: 0 };
  }
}

/**
 * The office copy of a call.
 *
 * ── IT USED TO FAIL IN COMPLETE SILENCE ───────────────────────────────────────────────────────
 *
 * A missing RESEND_API_KEY returned `false` and said nothing, and a rejected send returned `res.ok`
 * and said nothing. `notifyOwners` then reported `emailed: false` to a caller that does not look at
 * it. So the failure mode was: somebody phones, nobody is emailed, and the first anyone knows is a
 * customer asking why they were never called back.
 *
 * In development the quiet return is right — nobody wants a red line in the console for a key they
 * deliberately did not set. In production a missing key is a misconfiguration, and the log names
 * the variable so whoever reads it knows what to set rather than only that something broke.
 */
async function emailOffice(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === 'your_resend_api_key') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[receptionist] RESEND_API_KEY is not set — the office was NOT emailed about this call');
    }
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${BUSINESS_NAME} <noreply@${EMAIL.split('@')[1]}>`, to: [EMAIL], subject, text }),
  });
  if (!res.ok) {
    // The body carries Resend's reason — a blocked domain, an unverified sender — and without it
    // the log says only "it did not work", which is the least actionable thing a log can say.
    const detail = await res.text().catch(() => '');
    console.error(`[receptionist] office email rejected (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.ok;
}
