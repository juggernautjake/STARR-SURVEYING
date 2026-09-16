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
import { lookupRegistry, type Relationship } from './registry';
import { OWNER_NAME as OWNER } from './knowledge';

/** One earlier enquiry, kept separate from the others. Jobs are not merged: a repeat customer can
 *  have three properties, and a third of a fence survey is not the same job as a closing survey. */
export interface PriorEnquiry {
  when: string;
  service: string | null;
  address: string | null;
  name: string | null;
}

export interface KnownCaller {
  /** The name on file. Whether it may be SPOKEN depends on `nameCertain` — see `knownCallerLine`. */
  name: string | null;
  /** True only when a person put this name to this number on purpose (a verified registry entry).
   *  The owner's own number is the reason this flag exists: "my number is (254)-315-1123 (Jacob
   *  Maddux). it should not assume that anyone else's number is me." Certain names may be greeted
   *  with; overheard ones may only be recognised. */
  nameCertain: boolean;
  /** What this number is to the firm — staff and family are not interviewed like customers. */
  relationship: Relationship;
  /** The office's own note about this number, written for the receptionist to act on. */
  notes: string | null;
  email: string | null;
  /** Where the name came from, for the transcript and the admin page. */
  source: 'registry' | 'call' | 'lead' | 'customer';
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
    const [registry, calls, leads, customers] = await Promise.all([
      lookupRegistry(client, ten),
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
    // Nothing to say unless the office knows this number (the registry) or it has actually rung us
    // before. A lead or customer row ALONE is not enough: those are written by test calls and by
    // hand, and one of them is what made the receptionist ask a stranger if he was the owner's son.
    if (!registry && priorCalls.length === 0) return null;

    const priorLeads = ((leads.data ?? []) as LeadRow[]).filter((l) => sameNumber(l.phone, ten));
    const cust = ((customers.data ?? []) as CustRow[]).find((c) => sameNumber(c.primary_phone, ten));
    const enquiries: PriorEnquiry[] = priorCalls.slice(0, 4).map((c) => ({
      when: c.started_at,
      service: c.service?.replace(/_/g, ' ') ?? null,
      address: c.property_address ?? null,
      name: c.caller_name ?? null,
    }));
    const email = registry?.email ?? priorCalls.find((c) => c.caller_email)?.caller_email ?? priorLeads.find((l) => l.email)?.email ?? cust?.primary_email ?? null;
    const base = {
      email,
      relationship: registry?.relationship ?? ('unknown' as Relationship),
      notes: registry?.notes ?? null,
      lastSeen: priorCalls[0]?.started_at ?? registry?.lastSeenAt ?? null,
      lastAbout: about(priorCalls[0]) ?? registry?.lastAbout ?? null,
      // The registry counts calls the log may have rotated away; the log counts calls made before
      // the registry existed. Whichever remembers more is the one that is right.
      timesCalled: Math.max(priorCalls.length, registry?.timesCalled ?? 0),
      enquiries,
    };

    // A number the office has asked us not to put a name to — shared, reassigned, or opted out.
    if (registry?.neverAssume) return { ...base, name: null, nameCertain: false, source: 'registry' };
    // The office's own answer wins over anything overheard, and only it can be certain.
    if (registry?.displayName) {
      return { ...base, name: registry.displayName, nameCertain: registry.nameSource === 'verified', source: 'registry' };
    }
    if (cust?.display_name) return { ...base, name: cust.display_name, nameCertain: false, source: 'customer' };
    const lead = priorLeads.find((l) => l.name);
    if (lead) return { ...base, name: lead.name, nameCertain: false, source: 'lead' };
    const named = priorCalls.find((c) => c.caller_name);
    if (named) return { ...base, name: named.caller_name, nameCertain: false, source: 'call' };
    return { ...base, name: null, nameCertain: false, source: registry ? 'registry' : 'call' };
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
  const first = (k.name ?? '').trim().split(/\s+/)[0] ?? '';
  const seen = k.timesCalled > 0
    ? `This number has reached us ${k.timesCalled === 1 ? 'once before' : `${k.timesCalled} times before`}${k.lastSeen ? `, most recently on ${day(k.lastSeen)}` : ''}.`
    : 'This number is on file at the office, though it has not rung this line before.';

  // ── WHO WE ARE ALLOWED TO SAY THIS IS ────────────────────────────────────────────────────────
  // The whole point of the registry (seeds/640_caller_registry.sql). A name the office put to a
  // number on purpose may be greeted with; a name we overheard on a call may only be recognised.
  const identity = k.name && k.nameCertain
    ? [
        `WHO THIS IS: the office has confirmed that this number belongs to ${k.name}. You may greet them by name, as a question, once: "Hi, is this ${first}?"`,
        `If they say they are someone else — phones get borrowed — believe them immediately, drop the name, and take the call as a brand new one.`,
      ].join(' ')
    : k.name
      ? [
          `WHO THIS MIGHT BE: the name ${k.name} was heard on an earlier call from this number, but nobody has confirmed it belongs to them. DO NOT say that name first and do not greet them by it.`,
          `Ask "have you called us before?" and "who am I speaking with?" like you would anyone. If they give that name, you may then say you have them on file.`,
        ].join(' ')
      : `WHO THIS IS: unknown. There is no confirmed name for this number. Ask who you are speaking with, and do not guess.`;

  const relationship = RELATIONSHIP_NOTES[k.relationship];

  return [
    `CALLER HISTORY — system data about the PHONE NUMBER, not about the person on the line. The caller has not told you any of this.`,
    seen,
    identity,
    relationship,
    k.notes ? `OFFICE NOTE ABOUT THIS NUMBER: ${k.notes}` : null,
    k.enquiries.length ? `Earlier enquiries from this number, each a separate job:\n${jobs}` : null,
    `HOW TO USE IT: do not mention any earlier job first. Once you know who you are speaking with and they are the person on file, you may say you have them on file and then ASK WHICH IT IS: "are you calling about the property you spoke to us about before, or is this a new request?" Name the property only after they have said it is the same one. If it is new, take it from scratch.`,
    `NEVER MIX JOBS: a new call is a new job unless the caller says otherwise. Never carry an address, acreage, survey type or deadline from an earlier enquiry into this one.`,
  ].filter(Boolean).join('\n');
}

/** What each kind of caller means for how the call should go. The receptionist interviewing the
 *  owner's own son about what his survey is for is the failure this prevents. */
const RELATIONSHIP_NOTES: Record<Relationship, string | null> = {
  owner: `THIS IS ${OWNER}'S OWN NUMBER. Do not run an enquiry. Say hello, help with whatever he asks, and keep it short.`,
  staff: `THIS NUMBER BELONGS TO THE CREW, not a customer. Never run a survey enquiry, never ask what the property is for, and never offer to take their details as a lead. Say hello, take anything they want passed to ${OWNER}, and let them go.`,
  family: `THIS IS FAMILY OR A FRIEND OF THE FIRM, not a customer. Be warm and brief, take a message for ${OWNER}, and do not interview them.`,
  customer: `This number belongs to a customer of the firm.`,
  vendor: `This number is a vendor, a salesperson or a recruiter. Be polite and brief, take a message only if they insist, and do not book anything.`,
  spam: `This number has been marked as spam or a nuisance caller. Be polite, do not take details, and end the call quickly.`,
  unknown: null,
};
