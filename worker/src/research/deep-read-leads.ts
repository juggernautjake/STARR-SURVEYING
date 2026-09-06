// worker/src/research/deep-read-leads.ts — the user-initiated AI "deep-read for more clues" (plan 4).
//
// Owner, 2026-09-06: the AI/OCR identifier read is optional and USER-triggered. This runs one bounded AI
// pass over the text the run already captured (deed/plat OCR) to pull identifiers the STRUCTURED parse
// missed — subdivisions, survey names, referenced deeds (vol/page or instrument), prior owners — and turns
// them into follow-up leads via the same `compileDiscoveredLeads` the rest of the loop uses. The AI call is
// injected so the shaping is unit-tested without a network; the endpoint records its cost against the run.

import { compileDiscoveredLeads, type DiscoveredLead, type AlreadySearched } from './discovered-leads.js';
import type { ChainGap } from '../chain-of-title/chain-gaps.js';

/** The identifiers a deep-read asks the model for. Every field optional; the model returns what it finds. */
export interface DeepReadExtract {
  subdivisions?: string[];
  surveys?: string[];
  references?: Array<{ volume?: string; page?: string; instrument?: string }>;
  priorOwners?: string[];
}

export const DEEP_READ_PROMPT =
  'You are reading Texas county land records (deeds, plats) already captured for one property. From the ' +
  'text below, extract ONLY identifiers that point at OTHER records worth pulling next — do not summarise. ' +
  'Return STRICT JSON: {"subdivisions":[],"surveys":[],"references":[{"volume":"","page":""} or {"instrument":""}],' +
  '"priorOwners":[]}. subdivisions = subdivision/addition names; surveys = original survey names ' +
  '(e.g. "WILLIAM HARTRICK SURVEY"); references = every prior deed the text CITES by volume/page or ' +
  'instrument number; priorOwners = grantors/prior owners in the chain of title. Omit anything you are ' +
  'not confident is a real citation. TEXT:\n';

/** Parse the model's JSON (tolerant of code fences / surrounding prose). */
export function parseDeepReadExtract(modelText: string): DeepReadExtract {
  if (!modelText) return {};
  const m = modelText.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const raw = JSON.parse(m[0]) as Record<string, unknown>;
    const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [];
    const refs = Array.isArray(raw.references)
      ? (raw.references as Record<string, unknown>[]).map((r) => ({
          volume: typeof r.volume === 'string' ? r.volume.trim() : undefined,
          page: typeof r.page === 'string' ? r.page.trim() : undefined,
          instrument: typeof r.instrument === 'string' ? r.instrument.trim() : undefined,
        })).filter((r) => (r.volume && r.page) || r.instrument)
      : [];
    return { subdivisions: strArr(raw.subdivisions), surveys: strArr(raw.surveys), references: refs, priorOwners: strArr(raw.priorOwners) };
  } catch {
    return {};
  }
}

/** Map a deep-read extract onto the shared `compileDiscoveredLeads` inputs and compile the leads. */
export function extractToLeads(extract: DeepReadExtract, round: number, alreadySearched?: AlreadySearched): DiscoveredLead[] {
  const dataPoints: Array<{ data_category: string; raw_value?: string | null; display_value?: string | null }> = [];
  for (const s of extract.subdivisions ?? []) dataPoints.push({ data_category: 'subdivision_name', display_value: s });
  // A survey is searched on the plat "Name" field just like a subdivision (plan 3).
  for (const s of extract.surveys ?? []) dataPoints.push({ data_category: 'subdivision_name', display_value: s });
  // References: a labelled "Vol X Pg Y" is unambiguous as a data point; an INSTRUMENT the model tagged
  // as such is routed through the citation path (label-anchored parse) so it is not mis-read as vol/page.
  const gaps: ChainGap[] = [];
  for (const r of extract.references ?? []) {
    if (r.volume && r.page) dataPoints.push({ data_category: 'recording_reference', raw_value: `Vol ${r.volume} Pg ${r.page}` });
    else if (r.instrument) gaps.push({ kind: 'unfollowed_citation', citedIn: 'deep-read', missing: `Instrument No. ${r.instrument}`, statement: '', nextStep: '' });
  }
  return compileDiscoveredLeads({ gaps, dataPoints, priorOwners: extract.priorOwners, alreadySearched, round });
}

export interface DeepReadInput {
  /** The captured document text (deed/plat OCR), already concatenated + bounded by the caller. */
  documentText: string;
  round: number;
  alreadySearched?: AlreadySearched;
  /** Injected: send the prompt to the model, return its text. The endpoint passes the real client + records cost. */
  callAi: (prompt: string) => Promise<string>;
}

/**
 * Run one deep-read pass and return the NEW leads. Never throws on a bad model response — a deep-read that
 * cannot parse is "no new clues", not a failure.
 */
export async function deepReadForLeads(input: DeepReadInput): Promise<DiscoveredLead[]> {
  const text = (input.documentText ?? '').slice(0, 24_000); // bound the prompt; the run's OCR can be long
  if (!text.trim()) return [];
  let modelText = '';
  try {
    modelText = await input.callAi(DEEP_READ_PROMPT + text);
  } catch {
    return [];
  }
  return extractToLeads(parseDeepReadExtract(modelText), input.round, input.alreadySearched);
}
