// worker/src/playbooks/types.ts — the shape of a site navigation playbook (plan B3).
//
// A playbook is the written-down knowledge of how ONE site behaves: where it is entered, what
// popups stand in the way, how its search is driven, the signal that means "results are ready"
// (never a fixed wait), how a result is opened and downloaded, the captcha it is known to show, and
// how the worker must reach it. The scrapers read these instead of carrying the selectors inline
// (B4), a nightly walk diffs the live site against them (B5), and a person reviews changes. This
// file is the contract; the per-county data lives beside it (e.g. bell.ts).

import type { PlatEgress } from '../services/county-plats.js';

/** The named states a records site moves through. A step asserts it is in the expected one. */
export type SiteState = 'entry' | 'search' | 'results' | 'viewer' | 'download';

export interface Playbook {
  /** Stable id, e.g. "bell-clerk", "bell-plat-repo". */
  site: string;
  /** The county this site serves (matches pipeline input.county), or null for a cross-county site. */
  county: string | null;
  /** Bumped by a person when the recipe changes; the drift watch (B5) records against it. */
  version: number;
  /** Human label for logs and the dossier index. */
  displayName: string;
  /** Where the site is entered. */
  entryUrl: string;
  /** How the worker reaches it — mirrors the plat egress vocabulary. */
  egress: PlatEgress;
  /** Popups/consent gates to dismiss, in order. `signal` is what proves the popup is present. */
  dismissals: Array<{ signal: string; action: string; why: string }>;
  /** The search recipe: how a query is entered and which document types to keep. */
  searchRecipe: {
    /** Free text describing the query construction (e.g. "subdivision name, section suffix stripped"). */
    query: string;
    /** Document types this search should surface, by the words the index files them under. */
    documentTypes: string[];
  };
  /** What proves the results are ready — an element or text that appears/disappears, never a wait. */
  doneSignal: { kind: 'appears' | 'disappears'; signal: string };
  /** How a single result is opened, and how its file is downloaded. Free text recipes. */
  viewerRecipe: string;
  downloadRecipe: string;
  /** The captcha/bot-wall this site is known to show, matched to detectCaptcha's vocabulary; null if none seen. */
  captchaSignature: string | null;
}

/** A playbook is usable only if these are present — asserted at load so a half-authored one fails loud. */
export function validatePlaybook(pb: Playbook): string[] {
  const problems: string[] = [];
  if (!pb.site) problems.push('missing site id');
  if (!pb.entryUrl || !/^https?:\/\//.test(pb.entryUrl)) problems.push(`${pb.site}: entryUrl is not an absolute URL`);
  if (!Number.isInteger(pb.version) || pb.version < 1) problems.push(`${pb.site}: version must be a positive integer`);
  if (!pb.doneSignal?.signal) problems.push(`${pb.site}: a done-signal is required (never a fixed wait)`);
  if (!pb.searchRecipe?.documentTypes?.length) problems.push(`${pb.site}: searchRecipe.documentTypes is empty`);
  return problems;
}
