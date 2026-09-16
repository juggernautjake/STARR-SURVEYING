// lib/receptionist/registry.ts — the caller ID memory: what we know about a number, and how surely.
//
// Owner, 2026-09-16: "The voice agent needs to know that my number is (254)-315-1123 (Jacob
// Maddux). it should not assume that anyone else's number is me. Please build out the whole
// infrastructure for the call id rememberance log that attaches call info and names and stuff to a
// number."
//
// Those two sentences are one design. A receptionist that recognises the owner's son by his number
// and a receptionist that asks a stranger whether he is Jacob are the same feature with the same
// data — the difference is entirely in HOW SURE we are, and the old code had nowhere to put that.
// It read names out of call rows, which are a log of what somebody said, and treated a
// speech-to-text guess exactly like a fact.
//
// So every name in the registry carries its provenance (see seeds/640_caller_registry.sql):
//
//   verified   a person put this name to this number on purpose. The receptionist may lead with it:
//              "Hi, is this Jacob?" Today that is Jacob's own number, and anything the office types
//              in afterwards.
//   observed   the name came off a transcript, an analysis or a web form. The receptionist may NOT
//              say it first; it asks who is speaking and uses the name to recognise the answer.
//
// The log half is `rememberCaller`, which every finished, non-test call runs through: it counts the
// call, moves the clock forward, records what they rang about, and fills in a name or an email ONLY
// where nothing better is already known. An observed name never overwrites a verified one, and a
// test call never writes at all — the owner's own test calls are what taught the old system to
// think every caller was Jacob.
import type { SupabaseClient } from '@supabase/supabase-js';

export const TABLE = 'caller_registry';

export type NameSource = 'verified' | 'observed';
export type Relationship = 'owner' | 'staff' | 'family' | 'customer' | 'vendor' | 'spam' | 'unknown';

export const RELATIONSHIPS: readonly Relationship[] = ['owner', 'staff', 'family', 'customer', 'vendor', 'spam', 'unknown'];

export interface RegistryEntry {
  phone: string;
  displayName: string | null;
  nameSource: NameSource;
  email: string | null;
  company: string | null;
  relationship: Relationship;
  notes: string | null;
  neverAssume: boolean;
  timesCalled: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastAbout: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = Pick<SupabaseClient<any, any, any>, 'from'>;

interface Row {
  phone: string;
  display_name: string | null;
  name_source: string;
  email: string | null;
  company: string | null;
  relationship: string;
  notes: string | null;
  never_assume: boolean;
  times_called: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_about: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/** The ten national digits — the only form Twilio's `+1254…`, a form's `(254) 315-1123` and a
 *  customer row's `254.315.1123` all agree on. Anything else is not a number we can key on. */
export function registryKey(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return /^[2-9]\d{9}$/.test(ten) ? ten : null;
}

/** "(254) 315-1123" — how a number is written for a person to read. */
export function formatPhone(phone: string | null | undefined): string {
  const ten = registryKey(phone);
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : (phone ?? '').trim();
}

function toEntry(r: Row): RegistryEntry {
  return {
    phone: r.phone,
    displayName: r.display_name,
    nameSource: r.name_source === 'verified' ? 'verified' : 'observed',
    email: r.email,
    company: r.company,
    relationship: (RELATIONSHIPS as readonly string[]).includes(r.relationship) ? (r.relationship as Relationship) : 'unknown',
    notes: r.notes,
    neverAssume: r.never_assume === true,
    timesCalled: r.times_called ?? 0,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastAbout: r.last_about,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/** What we know about one number. Never throws: the receptionist answers the call either way. */
export async function lookupRegistry(client: Client, phone: string | null | undefined): Promise<RegistryEntry | null> {
  const key = registryKey(phone);
  if (!key) return null;
  try {
    const { data, error } = await client.from(TABLE).select('*').eq('phone', key).maybeSingle();
    if (error || !data) return null;
    return toEntry(data as Row);
  } catch (err) {
    console.error('[registry] lookup failed:', err);
    return null;
  }
}

export interface RememberInput {
  phone: string | null | undefined;
  /** A name heard on the call. Recorded as `observed`; never overwrites a verified name. */
  name?: string | null;
  email?: string | null;
  /** A few words about what they rang about, for the next call's greeting. */
  about?: string | null;
  /** When the call happened. Defaults to now. */
  at?: string;
  /** Test calls do not teach the registry anything. This is not optional politeness: the owner's
   *  own test calls are exactly what taught the old system that every caller was Jacob. */
  isTest?: boolean;
}

/** Count a finished call against its number, and learn from it what is safe to learn.
 *
 *  Returns the row as it now stands, or null when there was nothing to do. Never throws — a
 *  registry write must not be able to fail a call's wrap-up. */
export async function rememberCaller(client: Client, input: RememberInput): Promise<RegistryEntry | null> {
  const key = registryKey(input.phone);
  if (!key || input.isTest) return null;
  const at = input.at ?? new Date().toISOString();
  const name = (input.name ?? '').trim() || null;
  const email = (input.email ?? '').trim().toLowerCase() || null;
  const about = (input.about ?? '').trim().slice(0, 200) || null;

  try {
    const existing = await lookupRegistry(client, key);
    if (!existing) {
      const { data, error } = await client.from(TABLE).insert({
        phone: key,
        display_name: name,
        name_source: 'observed',
        email,
        last_about: about,
        times_called: 1,
        first_seen_at: at,
        last_seen_at: at,
        created_by: 'receptionist',
        updated_by: 'receptionist',
      }).select('*').maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toEntry(data as Row) : null;
    }

    // What a call is allowed to change. A verified name is the office's, not the transcript's.
    const patch: Record<string, unknown> = {
      times_called: (existing.timesCalled ?? 0) + 1,
      last_seen_at: at,
      first_seen_at: existing.firstSeenAt ?? at,
      updated_by: 'receptionist',
    };
    if (about) patch.last_about = about;
    if (name && existing.nameSource !== 'verified' && !existing.displayName) patch.display_name = name;
    if (email && !existing.email) patch.email = email;

    const { data, error } = await client.from(TABLE).update(patch).eq('phone', key).select('*').maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntry(data as Row) : null;
  } catch (err) {
    console.error('[registry] could not record the call:', err);
    return null;
  }
}

export interface RegistryPatch {
  displayName?: string | null;
  email?: string | null;
  company?: string | null;
  relationship?: Relationship;
  notes?: string | null;
  neverAssume?: boolean;
  /** Only an explicit edit by a person can promote a name to `verified`. */
  nameSource?: NameSource;
}

/** An edit made by a person on the admin page. A name typed here is verified by definition — a
 *  human put it to this number on purpose, which is the whole distinction the table exists for. */
export async function saveRegistryEntry(client: Client, phone: string, patch: RegistryPatch, by: string): Promise<RegistryEntry> {
  const key = registryKey(phone);
  if (!key) throw new Error('That is not a ten-digit phone number.');
  const row: Record<string, unknown> = { phone: key, updated_by: by };
  if (patch.displayName !== undefined) {
    const name = (patch.displayName ?? '').trim();
    row.display_name = name || null;
    // Typing a name verifies it; clearing it drops back to "we overheard something once".
    row.name_source = name ? (patch.nameSource ?? 'verified') : 'observed';
  } else if (patch.nameSource) {
    row.name_source = patch.nameSource;
  }
  if (patch.email !== undefined) row.email = (patch.email ?? '').trim().toLowerCase() || null;
  if (patch.company !== undefined) row.company = (patch.company ?? '').trim() || null;
  if (patch.relationship !== undefined) row.relationship = patch.relationship;
  if (patch.notes !== undefined) row.notes = (patch.notes ?? '').trim() || null;
  if (patch.neverAssume !== undefined) row.never_assume = patch.neverAssume;

  const { data, error } = await client.from(TABLE).upsert(row, { onConflict: 'phone' }).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The registry did not return the row it just saved.');
  return toEntry(data as Row);
}

export async function deleteRegistryEntry(client: Client, phone: string): Promise<void> {
  const key = registryKey(phone);
  if (!key) return;
  const { error } = await client.from(TABLE).delete().eq('phone', key);
  if (error) throw new Error(error.message);
}

/** The admin list: who has rung, most recent first. `search` matches a name, a number or a note. */
export async function listRegistry(client: Client, opts: { search?: string; limit?: number } = {}): Promise<RegistryEntry[]> {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200));
  let q = client.from(TABLE).select('*').order('last_seen_at', { ascending: false, nullsFirst: false }).limit(limit);
  const search = (opts.search ?? '').trim();
  if (search) {
    const digits = search.replace(/\D/g, '');
    const like = `%${search}%`;
    q = digits.length >= 3
      ? q.or(`phone.ilike.%${digits}%,display_name.ilike.${like},notes.ilike.${like},company.ilike.${like}`)
      : q.or(`display_name.ilike.${like},notes.ilike.${like},company.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toEntry);
}
