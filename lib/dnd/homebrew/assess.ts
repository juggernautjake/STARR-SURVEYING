// lib/dnd/homebrew/assess.ts — the AI's write-up on a piece of custom content (P6-17).
//
// The owner's ask: *"Once the user saves it, the AI will evaluate the build and write up an assessment."*
//
// ADVISORY, NEVER A GATE. This is an opinion on someone's creative work, so it is stored beside the piece
// and shown, and it never blocks a save, changes a value, or marks a piece invalid. That boundary is the
// whole design: the moment an assessment can refuse a save, an author is arguing with a model about their
// own homebrew — which is the opposite of "full control over every aspect".
//
// It also must not become a second, softer rules engine. `validateHomebrewPayload` already decides whether
// mechanics are VALID; this decides whether they are *balanced and complete*, which is a judgement call and
// is labelled as one. Where the two would overlap, the validator wins and the assessment stays quiet.
//
// The prompt-building is pure and testable; the model call lives in the route.
import { homebrewKindLabel, type HomebrewContent } from './model';
import { kindSpec, kindIsMechanicalIn } from './kinds';
import { systemLabel, normalizeSystem } from '@/lib/dnd/systems';

/** How an assessment reads at a glance. Deliberately not a score out of ten: a number invites an author to
 *  optimise for it, and "7/10" says nothing actionable about a class. */
export type AssessmentVerdict = 'solid' | 'watch' | 'rough';

export interface Assessment {
  verdict: AssessmentVerdict;
  /** One sentence: the headline. */
  summary: string;
  /** What works. Never empty in practice — an author who just wrote a thing deserves to be told what
   *  landed, and a review that opens with problems reads as a rejection. */
  strengths: string[];
  /** Balance or consistency concerns, each phrased as an observation rather than an instruction. */
  concerns: string[];
  /** What is missing or unfinished — the most useful part for a partial build. */
  gaps: string[];
  /** When it was written, so a stale assessment can be spotted after an edit. */
  assessedAt?: string;
}

const VERDICTS: readonly AssessmentVerdict[] = ['solid', 'watch', 'rough'];

const strList = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max);

/**
 * Defensively read a stored or freshly-generated assessment. Returns null when there is nothing usable —
 * a half-parsed assessment is worse than none, because it is shown to the author as if it were a considered
 * opinion.
 */
export function normalizeAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
  if (!summary) return null;
  const verdict = VERDICTS.includes(r.verdict as AssessmentVerdict) ? (r.verdict as AssessmentVerdict) : 'watch';
  return {
    verdict,
    summary,
    strengths: strList(r.strengths, 5),
    concerns: strList(r.concerns, 5),
    gaps: strList(r.gaps, 5),
    ...(typeof r.assessedAt === 'string' ? { assessedAt: r.assessedAt } : {}),
  };
}

export const ASSESSMENT_LABELS: Record<AssessmentVerdict, string> = {
  solid: 'Looks solid',
  watch: 'Worth a second look',
  rough: 'Needs work',
};

/** The instruction. Kept here rather than inline in the route so it can be asserted — a prompt that quietly
 *  drifts toward "refuse bad content" is exactly the failure this file's header warns about. */
export const ASSESSMENT_SYSTEM_PROMPT = [
  'You are a thoughtful tabletop RPG design reviewer. A player has just authored a piece of homebrew content',
  'and wants an honest, useful read on it.',
  '',
  'Your job is to be USEFUL, not to gatekeep. This is their creative work; you are a second pair of eyes,',
  'not an approval authority. Never tell them the content is not allowed, and never suggest it be deleted.',
  '',
  'Judge it against comparable OFFICIAL content in the same system — a homebrew feat against that system’s',
  'real feats, a class against its real classes. If you do not know that system well, say so in a concern',
  'rather than inventing a comparison.',
  '',
  'An unfinished piece is normal and expected: a class written to level 5 is a partial build, not a mistake.',
  'Report what is missing under "gaps" in a matter-of-fact way, never as criticism.',
  '',
  'Respond with ONLY a JSON object:',
  '{',
  '  "verdict": "solid" | "watch" | "rough",',
  '  "summary": "one sentence",',
  '  "strengths": ["..."],',
  '  "concerns": ["..."],',
  '  "gaps": ["..."]',
  '}',
  '',
  'verdict: "solid" = balanced and coherent; "watch" = one or two things worth a second look;',
  '"rough" = significant balance or consistency problems. Two or three items per list, at most five.',
  'Each item is one sentence. Phrase concerns as observations ("the damage outpaces a comparable feat"),',
  'not commands ("reduce the damage").',
].join('\n');

/** Everything the model is told about the piece. Pure, so the tests can assert what is (and is not) sent. */
export function assessmentUserPrompt(c: HomebrewContent, opts: { partialToLevel?: number | null } = {}): string {
  const spec = kindSpec(c.kind);
  const scope = c.system === 'any' ? 'any system (system-agnostic)' : systemLabel(normalizeSystem(c.system));
  const lines: string[] = [
    `Kind: ${homebrewKindLabel(c.kind)} — ${spec.blurb}`,
    `System: ${scope}`,
    `Name: ${c.name}`,
  ];
  if (c.summary) lines.push(`Summary: ${c.summary}`);
  if (c.description) lines.push('', 'Rules text:', c.description);

  // The mechanical payload, so the review is about the NUMBERS and not only the prose. Serialized rather
  // than described, because a summary of a payload is where a reviewer's misreading would come from.
  if (c.payload && typeof c.payload === 'object') {
    lines.push('', 'Mechanical payload (JSON):', JSON.stringify(c.payload, null, 2).slice(0, 6000));
  }

  // Context that changes what a fair review looks like. Without these, a model reliably reports a partial
  // class as broken and a prose-only piece as missing its mechanics — both of which are correct states.
  if (opts.partialToLevel != null && opts.partialToLevel < 20) {
    lines.push('', `NOTE: this is a PARTIAL build, written to level ${opts.partialToLevel} of 20. That is a deliberate, supported state — do not treat the missing levels as a flaw, just note them under gaps.`);
  }
  if (c.system !== 'any' && !kindIsMechanicalIn(c.kind, c.system)) {
    lines.push('', `NOTE: a ${homebrewKindLabel(c.kind).toLowerCase()} in this system is written as rules text — the platform does not resolve it into numbers on a sheet. Do not report the absence of a mechanical payload as a gap.`);
  }
  return lines.join('\n');
}

/** Is this assessment older than the piece it describes? Shown as a staleness hint rather than hidden —
 *  an assessment of a previous draft is misleading precisely because it looks current. */
export function isAssessmentStale(a: Assessment | null, updatedAt?: string | null): boolean {
  if (!a?.assessedAt || !updatedAt) return false;
  return new Date(a.assessedAt).getTime() < new Date(updatedAt).getTime() - 1000;
}
