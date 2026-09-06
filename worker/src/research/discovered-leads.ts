// worker/src/research/discovered-leads.ts — the leads analysis surfaces for a FOLLOW-UP research round.
//
// Owner, 2026-09-06: research gathers; analysis reads and, if it finds more clues (chain of title,
// referenced documents, adjoiners), COMPILES them so the user can choose to run ANOTHER research pass
// seeded with them. This is the compiler: it turns the analysis outputs the run already produces — the
// chain-of-title GAPS (`chain-gaps.ts findGaps` → `chain-errands.ts errandsFromGaps`), the adjoiner list,
// and the extracted data points — into a de-duped set of NEW search leads, excluding anything the run
// already searched. Pure, so it is unit-tested without a database.

import type { ChainGap } from '../chain-of-title/chain-gaps.js';
import { errandsFromGaps } from '../chain-of-title/chain-errands.js';

export type LeadKind = 'volume_page' | 'instrument' | 'grantor_name' | 'adjoiner' | 'subdivision';

export interface DiscoveredLead {
  /** Stable id so the UI can select/track it and 2.2 can mark it searched. */
  id: string;
  kind: LeadKind;
  /** The value a follow-up run searches on (a name, an instrument, a subdivision; vol/page uses volume+page). */
  value: string;
  volume?: string;
  page?: string;
  /** Human label for the UI. */
  label: string;
  /** Where the lead came from (a deed's instrument, "adjoiner register", "data point"). */
  source: string;
  /** The research round that surfaced it (1 = the initial run). */
  round: number;
  /** Set true once a follow-up round has searched it (2.2), so it is never chased twice. */
  searched: boolean;
}

/** What the run has ALREADY searched, so a lead that repeats it is dropped. Keys are normalised. */
export interface AlreadySearched {
  instruments?: Iterable<string>;
  volumePages?: Iterable<string>;   // normalised `VOL{n}PG{n}`
  names?: Iterable<string>;         // upper-cased, whitespace-collapsed
  subdivisions?: Iterable<string>;  // upper-cased
}

const normInstr = (s: string): string => (s ?? '').replace(/\D/g, '');
const normVp = (vol: string, page: string): string => `VOL${Number(vol) || vol}PG${Number(page) || page}`;
const normName = (s: string): string => (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

export interface CompileLeadsInput {
  /** Chain-of-title gaps (unfollowed citations) from `findGaps`. */
  gaps?: ChainGap[];
  /** Prior grantors to search as grantee (chain walk-back leads). */
  priorOwners?: string[];
  /** The adjoiner register: neighbouring owners / parcels. */
  adjoiners?: Array<{ owner?: string | null; propertyId?: string | null }>;
  /** Extracted data points that carry a searchable reference. */
  dataPoints?: Array<{ data_category: string; raw_value?: string | null; display_value?: string | null; document_id?: string | null }>;
  alreadySearched?: AlreadySearched;
  round: number;
}

/**
 * Compile the analysis outputs into de-duped NEW search leads (plan 1.1). Anything the run already searched,
 * or that repeats another lead, is dropped — a follow-up round should only ADD.
 */
export function compileDiscoveredLeads(input: CompileLeadsInput): DiscoveredLead[] {
  const searchedInstr = new Set([...(input.alreadySearched?.instruments ?? [])].map(normInstr).filter(Boolean));
  const searchedVp = new Set([...(input.alreadySearched?.volumePages ?? [])]);
  const searchedNames = new Set([...(input.alreadySearched?.names ?? [])].map(normName).filter(Boolean));
  const searchedSubs = new Set([...(input.alreadySearched?.subdivisions ?? [])].map((s) => s.toUpperCase()).filter(Boolean));

  const out: DiscoveredLead[] = [];
  const seen = new Set<string>(); // dedup key per lead

  const add = (lead: Omit<DiscoveredLead, 'id' | 'round' | 'searched'>, dedupKey: string): void => {
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    out.push({ ...lead, id: dedupKey, round: input.round, searched: false });
  };

  // 1) Chain-of-title citations → volume_page / instrument leads (the strongest chain-of-title leads).
  const { errands } = errandsFromGaps(input.gaps ?? []);
  for (const e of errands) {
    if (e.kind === 'volume_page' && e.volume && e.page) {
      const key = normVp(e.volume, e.page);
      if (searchedVp.has(key)) continue;
      add({ kind: 'volume_page', value: key, volume: e.volume, page: e.page, label: `Deed cites ${e.raw}`, source: `cited in ${e.citedIn.join(', ')}` }, `vp:${key}`);
    } else if (e.kind === 'instrument_number' && e.instrument) {
      const key = normInstr(e.instrument);
      if (!key || searchedInstr.has(key)) continue;
      add({ kind: 'instrument', value: e.instrument, label: `Deed cites instrument ${e.raw}`, source: `cited in ${e.citedIn.join(', ')}` }, `instr:${key}`);
    }
  }

  // 2) Prior grantors → grantor_name leads (walk the chain back another owner).
  for (const name of input.priorOwners ?? []) {
    const n = normName(name);
    if (!n || searchedNames.has(n)) continue;
    add({ kind: 'grantor_name', value: name.trim(), label: `Prior owner: ${name.trim()}`, source: 'chain of title' }, `name:${n}`);
  }

  // 3) Adjoiners → adjoiner leads (a neighbour's own deed can resolve a shared boundary).
  for (const a of input.adjoiners ?? []) {
    const owner = (a.owner ?? '').trim();
    const n = normName(owner);
    if (!n || searchedNames.has(n)) continue;
    add({ kind: 'adjoiner', value: owner, label: `Adjoiner: ${owner}${a.propertyId ? ` (#${a.propertyId})` : ''}`, source: 'adjoiner register' }, `adj:${n}`);
  }

  // 4) Data points that carry a reference the run has not chased.
  for (const dp of input.dataPoints ?? []) {
    const raw = (dp.display_value ?? dp.raw_value ?? '').trim();
    if (!raw) continue;
    if (dp.data_category === 'subdivision_name') {
      const s = raw.toUpperCase();
      if (searchedSubs.has(s)) continue;
      add({ kind: 'subdivision', value: raw, label: `Subdivision: ${raw}`, source: 'data point' }, `sub:${s}`);
    } else if (dp.data_category === 'recording_reference') {
      // A recording reference is usually a vol/page or instrument; try to key it. Handles labelled
      // "Vol 5456 Pg 704" and bare "5456/704".
      const vp = raw.match(/\b(?:vol(?:ume)?|book|bk)\.?\s*(\d{1,5})\s*,?\s*(?:pg|page|p)\.?\s*(\d{1,5})\b/i)
        ?? raw.match(/(\d{1,5})\s*[^0-9A-Za-z]{1,4}\s*(\d{1,5})/);
      if (vp) {
        const key = normVp(vp[1]!, vp[2]!);
        if (searchedVp.has(key)) continue;
        add({ kind: 'volume_page', value: key, volume: vp[1], page: vp[2], label: `Recording reference ${raw}`, source: 'data point' }, `vp:${key}`);
      } else {
        const key = normInstr(raw);
        if (key.length >= 5 && !searchedInstr.has(key)) {
          add({ kind: 'instrument', value: raw, label: `Recording reference ${raw}`, source: 'data point' }, `instr:${key}`);
        }
      }
    }
  }

  return out;
}

/**
 * Mark the leads a follow-up round is searching as `searched: true` (plan 2.2), so the next
 * compile does not surface them again. A lead matches the run's supplemental by its normalised
 * value: instrument digits, `VOL{n}PG{n}`, upper-cased name, upper-cased subdivision. Pure.
 */
export function markLeadsSearched(
  leads: DiscoveredLead[],
  supplemental: { instrumentNumbers?: string[]; volumePages?: Array<{ volume?: string; page?: string; book?: string }>; ownerNames?: string[]; subdivisions?: string[] } | null | undefined,
): DiscoveredLead[] {
  const s = supplemental ?? {};
  const instr = new Set((s.instrumentNumbers ?? []).map(normInstr).filter(Boolean));
  const vps = new Set((s.volumePages ?? []).map((vp) => normVp(vp.volume ?? vp.book ?? '', vp.page ?? '')));
  const names = new Set((s.ownerNames ?? []).map(normName).filter(Boolean));
  const subs = new Set((s.subdivisions ?? []).map((x) => (x ?? '').toUpperCase()).filter(Boolean));
  return leads.map((l) => {
    if (l.searched) return l;
    const hit =
      (l.kind === 'instrument' && instr.has(normInstr(l.value))) ||
      (l.kind === 'volume_page' && l.volume && l.page && vps.has(normVp(l.volume, l.page))) ||
      ((l.kind === 'grantor_name' || l.kind === 'adjoiner') && names.has(normName(l.value))) ||
      (l.kind === 'subdivision' && subs.has(l.value.toUpperCase()));
    return hit ? { ...l, searched: true } : l;
  });
}

/** Turn selected leads into the run's `supplemental` payload for a follow-up round (plan 2.1). */
export function leadsToSupplemental(leads: DiscoveredLead[]): {
  instrumentNumbers: string[];
  volumePages: Array<{ volume: string; page: string }>;
  ownerNames: string[];
  subdivisions: string[];
} {
  const instrumentNumbers: string[] = [];
  const volumePages: Array<{ volume: string; page: string }> = [];
  const ownerNames: string[] = [];
  const subdivisions: string[] = [];
  for (const l of leads) {
    if (l.kind === 'instrument') instrumentNumbers.push(l.value);
    else if (l.kind === 'volume_page' && l.volume && l.page) volumePages.push({ volume: l.volume, page: l.page });
    else if (l.kind === 'grantor_name' || l.kind === 'adjoiner') ownerNames.push(l.value);
    else if (l.kind === 'subdivision') subdivisions.push(l.value);
  }
  return { instrumentNumbers, volumePages, ownerNames, subdivisions };
}
