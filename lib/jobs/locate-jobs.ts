// lib/jobs/locate-jobs.ts — putting every job on the map, from whatever its record says.
//
// Owner, 2026-11-11: "it should show pins on the map … that show the location of the addresses of all
// jobs we have done." "Please make it so that AI or something can look at the address and do its best
// to find the actual address and put a spot for it on the map." "I want it so that over time the map
// becomes more and more populated with the jobs we have done."
//
// ── HOW A JOB GETS A PLACE ──────────────────────────────────────────────────────────────────────
//
//  1. Its own address fields, through Google (`lib/maps/geocode.ts`) — the address came from Google
//     Places on the job form, so the same provider is what makes the two agree.
//  2. When that is missing or too vague (no street, or Google can only find the town), Claude reads
//     everything the record says — the job name ("1100 WESTWOOD DRIVE" is an address), the address
//     fields, the project and the customer ("Round Rock Housing Authority" says which town), the
//     description — and writes the single most likely full street address. Google then places THAT.
//     The model never invents coordinates; it only proposes an address for the geocoder to check.
//  3. Anything that lands outside Texas is refused: every job this firm has taken is in Texas, and a
//     confident pin in Ohio is worse than no pin.
//
// The result is written to `jobs.latitude` / `jobs.longitude` (the cache is the job row — see
// geocode.ts), plus, once seeds/683_jobs_location_lookup.sql is applied, where it came from and when
// it was tried, so a job that could not be found is not asked about again on every visit. Before that
// migration the columns are simply skipped.
import { supabaseAdmin } from '@/lib/supabase';
import { buildGeocodeQuery, geocodeAddress, type GeocodeResult } from '@/lib/maps/geocode';
import { callAi, aiConfigured } from '@/lib/ai/client';

export interface LocateRecord {
  id: string;
  job_number: string | null;
  name: string | null;
  description?: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  state?: string | null;
  zip?: string | null;
  client_company?: string | null;
  client_name?: string | null;
  project?: { name: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; client_company: string | null } | null;
}

export type LocateSource = 'address' | 'ai';

export type LocateOutcome =
  | { ok: true; lat: number; lng: number; source: LocateSource; formatted: string; precision: string; query: string }
  | { ok: false; reason: string; retryable: boolean };

/** Precise enough for a dot on a property: a building, a point along the street, or the street itself.
 *  `APPROXIMATE` (a town or a ZIP centre) is not — that is a dot in the middle of Round Rock. */
export function isPlaceablePrecision(precision: string): boolean {
  return precision === 'ROOFTOP' || precision === 'RANGE_INTERPOLATED' || precision === 'GEOMETRIC_CENTER';
}

/** Texas, with a little margin. Every job is in Texas; outside this box the answer is wrong. */
export function isInTexas(lat: number, lng: number): boolean {
  return lat >= 25.6 && lat <= 36.7 && lng >= -106.8 && lng <= -93.3;
}

/** The first query to try: the job's own address, borrowing the project's town when the job has none. */
export function addressQueryFor(r: LocateRecord): string | null {
  const own = buildGeocodeQuery({ address: r.address, city: r.city, county: r.county, state: r.state, zip: r.zip });
  if (own) return own;
  if (r.address && r.project) {
    return buildGeocodeQuery({ address: r.address, city: r.project.city, state: r.project.state ?? r.state, zip: r.project.zip });
  }
  return null;
}

/** What Claude is shown: every field that might say where the job is, and nothing else. */
export function describeForAi(r: LocateRecord): string {
  const lines: Array<[string, string | null | undefined]> = [
    ['Job number', r.job_number],
    ['Job name', r.name],
    ['Street address field', r.address],
    ['City', r.city],
    ['County', r.county],
    ['State', r.state],
    ['ZIP', r.zip],
    ['Customer company', r.client_company],
    ['Customer name', r.client_name],
    ['Project name', r.project?.name],
    ['Project address', r.project?.address],
    ['Project city', r.project?.city],
    ['Project ZIP', r.project?.zip],
    ['Project customer', r.project?.client_company],
    ['Description', r.description ? r.description.slice(0, 600) : null],
  ];
  return lines.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`).join('\n');
}

const AI_SYSTEM = `You help a land-surveying firm in Central Texas put its past jobs on a map.
You are given what a job record says. Work out the single most likely full street address of the property the job is about.
- The job name is often the address itself (e.g. "1100 WESTWOOD DRIVE").
- The customer or project name often says which town (e.g. "Round Rock Housing Authority" means Round Rock, TX).
- Every job is in Texas. Prefer the firm's area (Bell, Williamson, Travis, Coryell, Milam, Falls, McLennan, Lampasas, Burnet counties) when a town is ambiguous.
- Never invent a house number that is not in the record. A road with a town ("County Road 200, Belton, TX") is fine when there is no number.
Answer with ONLY a JSON object, no prose: {"address": "<street, city, TX ZIP if known>" or null, "confidence": "high" | "medium" | "low"}.
Use null when the record does not say enough to name a place.`;

/** Parse the model's answer; tolerant of a code fence or a sentence around the JSON. */
export function parseAiAddress(text: string): { address: string; confidence: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as { address?: unknown; confidence?: unknown };
    if (typeof v.address !== 'string' || !v.address.trim()) return null;
    return { address: v.address.trim().slice(0, 200), confidence: typeof v.confidence === 'string' ? v.confidence : 'low' };
  } catch {
    return null;
  }
}

export interface LocateDeps {
  geocode?: (query: string) => Promise<GeocodeResult>;
  /** Ask the model for an address; null when it cannot or AI is not configured. */
  askAi?: (record: LocateRecord) => Promise<string | null>;
}

async function defaultAskAi(r: LocateRecord): Promise<string | null> {
  if (!aiConfigured()) return null;
  const facts = describeForAi(r);
  if (!facts) return null;
  const res = await callAi({
    role: 'extraction',
    surface: 'map-locate-job',
    system: AI_SYSTEM,
    messages: [{ role: 'user', content: facts }],
    maxTokens: 2000,
    retries: 1,
  });
  return parseAiAddress(res.text)?.address ?? null;
}

/** Find one job. Pure apart from the two injected calls, so it is tested without Google or Claude. */
export async function locateRecord(r: LocateRecord, deps: LocateDeps = {}): Promise<LocateOutcome> {
  const geocode = deps.geocode ?? ((q: string) => geocodeAddress(q));
  const askAi = deps.askAi ?? defaultAskAi;
  let lastReason = 'The record does not say enough to find it.';
  let retryable = false;

  const tryQuery = async (query: string, source: LocateSource): Promise<LocateOutcome | null> => {
    const g = await geocode(query);
    if (!g.ok) { lastReason = g.error; retryable = retryable || g.retryable; return null; }
    const { latitude: lat, longitude: lng, precision, formatted } = g.hit;
    if (!isInTexas(lat, lng)) { lastReason = `Google placed "${query}" outside Texas (${formatted}).`; return null; }
    if (!isPlaceablePrecision(precision)) { lastReason = `Google could only find the area of "${query}", not the property.`; return null; }
    return { ok: true, lat, lng, source, formatted, precision, query };
  };

  const own = addressQueryFor(r);
  if (own) {
    const hit = await tryQuery(own, 'address');
    if (hit) return hit;
  }

  let aiAddress: string | null = null;
  try {
    aiAddress = await askAi(r);
  } catch (err) {
    lastReason = `The AI lookup failed: ${(err as Error).message}`;
    retryable = true;
  }
  if (aiAddress && aiAddress !== own) {
    const hit = await tryQuery(aiAddress, 'ai');
    if (hit) return hit;
  }
  return { ok: false, reason: lastReason, retryable };
}

// ── the database side ───────────────────────────────────────────────────────────────────────────

/** Whether seeds/683 has been applied. Learned from the first query that mentions the columns. */
let lookupColumns: boolean | null = null;
const isMissingColumn = (msg: string | undefined) => !!msg && /location_(source|checked_at|formatted)/.test(msg) && /column|schema cache/i.test(msg);

const JOB_FIELDS = 'id, job_number, name, description, address, city, county, state, zip, client_company, client_name, project_id';

type JobRow = Omit<LocateRecord, 'project'> & { project_id: string | null };

async function withProjects(rows: JobRow[]): Promise<LocateRecord[]> {
  const ids = Array.from(new Set(rows.map((r) => r.project_id).filter((x): x is string => !!x)));
  const byId = new Map<string, LocateRecord['project']>();
  if (ids.length) {
    const { data } = await supabaseAdmin.from('projects').select('id, name, address, city, state, zip, client_company').in('id', ids);
    for (const p of (data ?? []) as Array<{ id: string } & NonNullable<LocateRecord['project']>>) byId.set(p.id, p);
  }
  return rows.map(({ project_id, ...r }) => ({ ...r, project: project_id ? byId.get(project_id) ?? null : null }));
}

/** Jobs with no place yet that have not already been tried (once the migration is in).
 *  `skip` steps past ones this visit already failed on but could not mark (no migration, or a
 *  retryable failure), so a run of unfindable jobs at the top cannot stall the rest. */
export async function jobsToLocate(limit: number, skip = 0): Promise<{ records: LocateRecord[]; remaining: number }> {
  const base = () => supabaseAdmin.from('jobs').select(JOB_FIELDS, { count: 'exact' })
    .is('deleted_at', null).is('latitude', null)
    .order('created_at', { ascending: false }).range(skip, skip + limit - 1);

  let res = lookupColumns === false ? await base() : await base().is('location_checked_at', null);
  if (res.error && isMissingColumn(res.error.message)) { lookupColumns = false; res = await base(); }
  else if (!res.error && lookupColumns === null) lookupColumns = true;
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as unknown as JobRow[];
  return { records: await withProjects(rows), remaining: Math.max(0, (res.count ?? rows.length) - skip - rows.length) };
}

export async function loadLocateRecord(jobId: string): Promise<LocateRecord | null> {
  const { data } = await supabaseAdmin.from('jobs').select(JOB_FIELDS).eq('id', jobId).maybeSingle();
  if (!data) return null;
  return (await withProjects([data as unknown as JobRow]))[0];
}

/** Write what was found — or, once the columns exist, that nothing was. Returns whether the job has
 *  left the "still to locate" list (false = it will come up again, so a caller should skip past it). */
export async function saveOutcome(jobId: string, outcome: LocateOutcome): Promise<boolean> {
  const core = outcome.ok ? { latitude: outcome.lat, longitude: outcome.lng } : {};
  const extra = outcome.ok
    ? { location_source: outcome.source, location_checked_at: new Date().toISOString(), location_formatted: outcome.formatted }
    // A retryable failure (Google down, a rate limit) is not recorded, so the next visit tries again.
    : outcome.retryable ? null : { location_source: 'not_found', location_checked_at: new Date().toISOString(), location_formatted: null };

  if (lookupColumns !== false && extra) {
    const { error } = await supabaseAdmin.from('jobs').update({ ...core, ...extra }).eq('id', jobId);
    if (!error) { lookupColumns = true; return true; }
    if (!isMissingColumn(error.message)) throw new Error(error.message);
    lookupColumns = false;
  }
  if (outcome.ok) {
    const { error } = await supabaseAdmin.from('jobs').update(core).eq('id', jobId);
    if (error) throw new Error(error.message);
    return true;
  }
  return false;
}

/** For tests: forget what was learned about the columns. */
export function _resetLookupColumns(): void { lookupColumns = null; }
