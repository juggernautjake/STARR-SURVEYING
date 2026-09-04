// worker/src/playbooks/index.ts — the playbook registry + loader (plan B3).
//
// A typed registry rather than raw .json files on disk: the worker runs from a compiled `dist/`
// where a src/*.json would not travel, and a typed constant is checked at build time and reviewed in
// the same diff. The shape is exactly the playbook contract in types.ts, so it is the JSON the plan
// described, made compile-safe. Scrapers read these (B4); a nightly walk diffs live sites against
// them (B5).

import type { Playbook } from './types.js';
import { validatePlaybook } from './types.js';
import { BELL_PLAYBOOKS } from './bell.js';

const REGISTRY: Playbook[] = [...BELL_PLAYBOOKS];

/** Every playbook for a county (case-insensitive; the vocabulary is upper-case, per identityKey). */
export function loadPlaybooks(county: string | null | undefined): Playbook[] {
  const key = (county ?? '').replace(/\s+county$/i, '').trim().toUpperCase();
  if (!key) return [];
  return REGISTRY.filter((p) => (p.county ?? '').toUpperCase() === key);
}

/** One named site's playbook, or null. */
export function loadPlaybook(site: string): Playbook | null {
  return REGISTRY.find((p) => p.site === site) ?? null;
}

/** Every problem across every registered playbook — empty when they are all well-formed. */
export function validateRegistry(): string[] {
  return REGISTRY.flatMap((p) => validatePlaybook(p));
}

/** One line for the run log: which playbooks a county's run is driving from. */
export function describePlaybooks(county: string | null | undefined): string {
  const pbs = loadPlaybooks(county);
  if (pbs.length === 0) return `No site playbook is authored for ${county ?? 'this county'} yet — scrapers use their built-in recipes.`;
  return `Driving from ${pbs.length} site playbook(s): ${pbs.map((p) => `${p.site} v${p.version}`).join(', ')}.`;
}
