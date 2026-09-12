// lib/receptionist/known-caller.ts — does the receptionist already know this number?
//
// Owner, 2026-09-11: "we need it so that the AI can remember reoccurring customers by name and
// number. It should be able to recognize reoccurring numbers that call."
//
// Three places a phone number can already live: earlier calls to this line (phone_calls), the lead
// queue (leads), and the customer book (customers). One lookup by the caller ID, digits compared on
// the last ten so "(254) 315-1123", "+12543151123" and "254.315.1123" all match. The result is a
// short sentence for the model and a name for the greeting; nothing else is read out.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface KnownCaller {
  name: string | null;
  email: string | null;
  /** Where the name came from, for the transcript and the admin page. */
  source: 'call' | 'lead' | 'customer';
  lastSeen: string | null;
  lastAbout: string | null;
  timesCalled: number;
}

type Client = Pick<SupabaseClient, 'from'>;

export function digitsOf(phone: string | null | undefined): string {
  const d = (phone ?? '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

function sameNumber(a: string | null | undefined, b: string): boolean {
  const x = digitsOf(a);
  return x.length >= 10 && x === b;
}

export async function lookupKnownCaller(client: Client, from: string): Promise<KnownCaller | null> {
  const ten = digitsOf(from);
  if (ten.length !== 10 || from.startsWith('client:')) return null;
  const tail = `%${ten.slice(-7)}%`;
  try {
    const [calls, leads, customers] = await Promise.all([
      client.from('phone_calls').select('caller_name, caller_email, callback_number, from_number, service, property_address, started_at, is_test').or(`from_number.ilike.${tail},callback_number.ilike.${tail}`).order('started_at', { ascending: false }).limit(25),
      client.from('leads').select('name, email, phone, property_address, created_at').ilike('phone', tail).order('created_at', { ascending: false }).limit(10),
      client.from('customers').select('display_name, primary_email, primary_phone, created_at').ilike('primary_phone', tail).limit(5),
    ]);
    type CallRow = { caller_name: string | null; caller_email: string | null; callback_number: string | null; from_number: string; service: string | null; property_address: string | null; started_at: string; is_test: boolean };
    type LeadRow = { name: string | null; email: string | null; phone: string | null; property_address: string | null; created_at: string };
    type CustRow = { display_name: string | null; primary_email: string | null; primary_phone: string | null };
    const priorCalls = ((calls.data ?? []) as CallRow[]).filter((c) => !c.is_test && (sameNumber(c.from_number, ten) || sameNumber(c.callback_number, ten)));
    const priorLeads = ((leads.data ?? []) as LeadRow[]).filter((l) => sameNumber(l.phone, ten));
    const cust = ((customers.data ?? []) as CustRow[]).find((c) => sameNumber(c.primary_phone, ten));

    if (cust?.display_name) {
      return { name: cust.display_name, email: cust.primary_email ?? priorLeads[0]?.email ?? null, source: 'customer', lastSeen: priorCalls[0]?.started_at ?? priorLeads[0]?.created_at ?? null, lastAbout: about(priorCalls[0]) ?? aboutLead(priorLeads[0]), timesCalled: priorCalls.length };
    }
    const lead = priorLeads.find((l) => l.name);
    if (lead) {
      return { name: lead.name, email: lead.email ?? priorCalls.find((c) => c.caller_email)?.caller_email ?? null, source: 'lead', lastSeen: priorCalls[0]?.started_at ?? lead.created_at, lastAbout: about(priorCalls[0]) ?? aboutLead(lead), timesCalled: priorCalls.length };
    }
    const named = priorCalls.find((c) => c.caller_name);
    if (named) {
      return { name: named.caller_name, email: priorCalls.find((c) => c.caller_email)?.caller_email ?? null, source: 'call', lastSeen: priorCalls[0].started_at, lastAbout: about(priorCalls[0]), timesCalled: priorCalls.length };
    }
    if (priorCalls.length) {
      return { name: null, email: null, source: 'call', lastSeen: priorCalls[0].started_at, lastAbout: about(priorCalls[0]), timesCalled: priorCalls.length };
    }
    return null;
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
function aboutLead(l: { property_address: string | null } | undefined): string | null {
  return l?.property_address ?? null;
}

/** One line for the model. It gets facts, not instructions to trust them blindly: the person on the
 *  line may be someone else using the same phone. */
export function knownCallerLine(k: KnownCaller | null): string | null {
  if (!k) return null;
  const when = k.lastSeen ? new Date(k.lastSeen).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const bits = [
    k.name ? `This number is on file as ${k.name}` : 'This number has called before',
    k.email ? `email on file ${k.email}` : null,
    when ? `last contact ${when}` : null,
    k.lastAbout ? `about ${k.lastAbout}` : null,
    k.timesCalled > 1 ? `${k.timesCalled} prior calls` : null,
  ].filter(Boolean);
  return bits.join('; ') + '. Greet them by name if it fits and confirm it is them; do not re-ask for details already on file unless they have changed.';
}
