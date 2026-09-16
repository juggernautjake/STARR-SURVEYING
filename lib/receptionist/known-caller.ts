// lib/receptionist/known-caller.ts — has this number reached us before?
//
// Owner, 2026-09-11: "we need it so that the AI can remember reoccurring customers by name and
// number. It should be able to recognize reoccurring numbers that call."
//
// Owner, 2026-09-16, after listening to real calls: "The agent kept asking customers if they had
// called before, even if they hadn't … it would ask a brand new caller if they were the same caller
// from the same month … Another call the agent asked if the caller was Jacob, which is me."
//
// Both of those were this file. Two defects, now fixed here:
//
//  1. THE CALL IN PROGRESS COUNTED AS A PRIOR CALL. The row for the live call is written at pickup,
//     and the caller's name is written into it mid-call. The lookup then found that row and reported
//     "this number has called before, as Angela" — a first-time caller was greeted as a returning
//     one with the name she had given thirty seconds earlier. `lookupKnownCaller` now takes the
//     current call's sid and start time and refuses to count anything at or after it.
//  2. TEST CALLS LEAKED IN THROUGH THE SIDE DOOR. Only phone_calls was filtered on is_test; the
//     leads and customers rows that older test calls created were not, so the owner's own number
//     came back as a customer on file and the agent asked a stranger if they were Jacob. A number is
//     now only "known" if a real, finished, non-test call came from it before this one.
//
// And one change of kind: what the model is told. It used to be handed the name with "greet them by
// name". It is now handed history with an explicit instruction NOT to assume, because the person
// holding a phone is not always the person the phone belongs to — and because the owner wants the
// caller asked, not told: "If the number is in the previous caller registry, then it can ask if the
// caller has called before and what their name is, and if they have, then it can refer back to
// previous calls and use that information."
import type { SupabaseClient } from '@supabase/supabase-js';

/** One earlier enquiry, kept separate from the others. Jobs are not merged: a repeat customer can
 *  have three properties, and a third of a fence survey is not the same job as a closing survey. */
export interface PriorEnquiry {
  when: string;
  service: string | null;
  address: string | null;
  name: string | null;
}

export interface KnownCaller {
  /** The name on file. NEVER spoken before the caller says it themselves — see `knownCallerLine`. */
  name: string | null;
  email: string | null;
  /** Where the name came from, for the transcript and the admin page. */
  source: 'call' | 'lead' | 'customer';
  lastSeen: string | null;
  lastAbout: string | null;
  timesCalled: number;
  /** Each earlier enquiry on its own, newest first, at most four. */
  enquiries: PriorEnquiry[];
}

type Client = Pick<SupabaseClient, 'from'>;

export interface LookupOptions {
  /** The sid of the call being handled. Never counted as a prior call — it is this one. */
  currentCallSid?: string | null;
  /** When this call started (ISO). Nothing at or after it counts as prior history. */
  since?: string | null;
}

export function digitsOf(phone: string | null | undefined): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

function sameNumber(a: string | null | undefined, b: string): boolean {
  const x = digitsOf(a);
  return x.length >= 10 && x === b;
}

export async function lookupKnownCaller(client: Client, from: string, opts: LookupOptions = {}): Promise<KnownCaller | null> {
  const ten = digitsOf(from);
  if (ten.length !== 10 || from.startsWith('client:')) return null;
  const tail = `%${ten.slice(-7)}%`;
  // Anything that started within a minute of this call is this call (or a redial of it), whatever
  // the sid says. Clocks and retries are not worth trusting to the millisecond.
  const cutoff = opts.since ? new Date(new Date(opts.since).getTime() - 60_000) : null;
  try {
    const [calls, leads, customers] = await Promise.all([
      client.from('phone_calls').select('call_sid, caller_name, caller_email, callback_number, from_number, service, property_address, started_at, is_test').or(`from_number.ilike.${tail},callback_number.ilike.${tail}`).order('started_at', { ascending: false }).limit(25),
      client.from('leads').select('name, email, phone, property_address, created_at').ilike('phone', tail).order('created_at', { ascending: false }).limit(10),
      client.from('customers').select('display_name, primary_email, primary_phone, created_at').ilike('primary_phone', tail).limit(5),
    ]);
    type CallRow = { call_sid: string | null; caller_name: string | null; caller_email: string | null; callback_number: string | null; from_number: string; service: string | null; property_address: string | null; started_at: string; is_test: boolean };
    type LeadRow = { name: string | null; email: string | null; phone: string | null; property_address: string | null; created_at: string };
    type CustRow = { display_name: string | null; primary_email: string | null; primary_phone: string | null };
    const priorCalls = ((calls.data ?? []) as CallRow[]).filter((c) => {
      if (c.is_test) return false;                                              // test calls are not history
      if (opts.currentCallSid && c.call_sid === opts.currentCallSid) return false; // this very call
      if (cutoff && new Date(c.started_at) >= cutoff) return false;             // this call, by the clock
      return sameNumber(c.from_number, ten) || sameNumber(c.callback_number, ten);
    });
    // No earlier real call from this number means the number is not in the registry — full stop. A
    // lead or customer row on its own is not enough: those are also written by test calls and by
    // hand, and one of them is what made the receptionist ask a stranger if he was the owner's son.
    if (priorCalls.length === 0) return null;

    const priorLeads = ((leads.data ?? []) as LeadRow[]).filter((l) => sameNumber(l.phone, ten));
    const cust = ((customers.data ?? []) as CustRow[]).find((c) => sameNumber(c.primary_phone, ten));
    const enquiries: PriorEnquiry[] = priorCalls.slice(0, 4).map((c) => ({
      when: c.started_at,
      service: c.service?.replace(/_/g, ' ') ?? null,
      address: c.property_address ?? null,
      name: c.caller_name ?? null,
    }));
    const email = priorCalls.find((c) => c.caller_email)?.caller_email ?? priorLeads.find((l) => l.email)?.email ?? cust?.primary_email ?? null;
    const base = { email, lastSeen: priorCalls[0]!.started_at, lastAbout: about(priorCalls[0]), timesCalled: priorCalls.length, enquiries };

    if (cust?.display_name) return { ...base, name: cust.display_name, source: 'customer' };
    const lead = priorLeads.find((l) => l.name);
    if (lead) return { ...base, name: lead.name, source: 'lead' };
    const named = priorCalls.find((c) => c.caller_name);
    if (named) return { ...base, name: named.caller_name, source: 'call' };
    return { ...base, name: null, source: 'call' };
  } catch (err) {
    console.error('[known-caller] lookup failed:', err);
    return null;
  }
}

function about(c: { service: string | null; property_address: string | null } | undefined): string | null {
  if (!c) return null;
  const parts = [c.service?.replace(/_/g, ' '), c.property_address].filter(Boolean);
  return parts.length ? parts.join(' at ') : null;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'an earlier date');

/** What the model is told about the history on this number.
 *
 *  It is written as facts plus a standing order, because the model's failure mode is to treat
 *  anything in its context as something the caller said. The name is in here so the receptionist can
 *  recognise it when the caller offers it — not so it can be read out first. */
export function knownCallerLine(k: KnownCaller | null): string | null {
  if (!k) return null;
  const jobs = k.enquiries.map((e) => {
    const bits = [e.address ? `about ${e.address}` : null, e.service ? `(${e.service})` : null].filter(Boolean).join(' ');
    return `  • ${day(e.when)}${bits ? ` — ${bits}` : ' — no property recorded'}${e.name ? `, caller gave the name ${e.name}` : ''}`;
  }).join('\n');
  return [
    `CALLER HISTORY — system data about the PHONE NUMBER, not about the person on the line. The caller has not told you any of this.`,
    `This number has reached us ${k.timesCalled === 1 ? 'once before' : `${k.timesCalled} times before`}, most recently on ${day(k.lastSeen)}.${k.name ? ` The name on file for it is ${k.name}.` : ''}`,
    k.enquiries.length ? `Earlier enquiries from this number, each a separate job:\n${jobs}` : null,
    `HOW TO USE IT: do not greet them by name, do not say the name on file, and do not mention any of these jobs first. Ask "have you called us before?" and "who am I speaking with?" like you would anyone. If the name they give matches the file, you may say you have them on file and ask whether this is about one of the properties above, naming it. If the name does not match — phones get shared and handed on — treat them as a brand new caller and take everything fresh.`,
    `NEVER MIX JOBS: a new call is a new job unless the caller says otherwise. Never carry an address, acreage, survey type or deadline from an earlier enquiry into this one. Ask for the property this call is about, even when you think you know it, and only use an earlier job's details after the caller has named that same property.`,
  ].filter(Boolean).join('\n');
}
