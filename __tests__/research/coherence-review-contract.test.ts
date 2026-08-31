// __tests__/research/coherence-review-contract.test.ts — B1a.
//
// ── THIS PANEL'S CONTRACT LIVES IN A PROMPT ─────────────────────────────────────────────────────
//
// Every other Review-tab extraction in `_sections/` is held against `worker/src` by
// `review-reads-what-the-worker-writes.test.ts`. The Quality & Coherence Review cannot be:
// `coherence_review` appears NOWHERE in `worker/src`. It is written by
// `lib/research/analysis.service.ts` — the app-side pipeline — and the seventeen keys it contains
// are declared, in prose, by the `COHERENCE_SYNTHESIS` prompt's JSON block in
// `lib/research/prompts.ts`.
//
// That is the doc's "READ FIRST — there are TWO research pipelines" made concrete, and it is the
// worse of the two positions to be in: a prompt is edited far more casually than a type, and no
// compiler reads it. A key renamed in that JSON block silently empties a section of the screen a
// surveyor signs off from.
//
// ── THE PROBE IS CONTROLLED, BECAUSE A BARE GREP HAS BEEN WRONG NINE TIMES HERE ─────────────────
//
// `describe('the probe can answer both ways')` below is not ceremony. Every negative sweep in this
// repository that shipped without a control has been wrong at least once, and a matcher that
// returns true for everything passes this entire file while proving nothing.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { contrast, parseHex, stripJs } from '../../scripts/audit-research-contrast.mjs';
import {
  coherenceReviewData,
  scoreFillColor, deltaColor, deedCompleteColor,
  COHERENCE_RESULT_KEYS, COHERENCE_CODE_ATTACHED_KEYS, COHERENCE_VERDICTS,
  COHERENCE_TEXT_COLORS, COHERENCE_GRAPHIC_COLORS, COHERENCE_BACKGROUNDS,
  VERDICT_COLORS, VERDICT_LABELS, VERDICT_FALLBACK_COLOR,
  DEED_BREAKS_COLOR, MISSING_INSTRUMENTS_COLOR,
} from '../../app/admin/research/[projectId]/_sections/coherence-review-data';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PROMPTS = read('lib/research/prompts.ts');
const SERVICE = read('lib/research/analysis.service.ts');
const PAGE = read('app/admin/research/[projectId]/page.tsx');

/**
 * The page with its comments blanked.
 *
 * The retired-hex assertions below went red on the first run against a comment that *names* the hex
 * it retired — the tenth time a check in this repository has read its own prose as evidence. It is
 * the single most reliable way to be wrong here, so it gets its own control at the bottom of the
 * colours block rather than a note.
 */
const PAGE_CODE: string = stripJs(PAGE);

/**
 * The COHERENCE_SYNTHESIS prompt only — not the whole file.
 *
 * `lib/research/prompts.ts` is 1,100+ lines of a dozen prompts, and most of these key names
 * (`summary`, `severity`, `title`, `description`) appear in several of them. Sweeping the file
 * would report every key as present no matter what this prompt says, which is the failure this
 * whole test exists to prevent. Sliced to the one prompt, then checked below that the slice is real.
 */
function coherencePrompt(): string {
  const start = PROMPTS.indexOf('COHERENCE_SYNTHESIS: {');
  if (start < 0) throw new Error('COHERENCE_SYNTHESIS is gone from lib/research/prompts.ts');
  const end = PROMPTS.indexOf('\n};', start);
  return PROMPTS.slice(start, end < 0 ? PROMPTS.length : end);
}

const PROMPT = coherencePrompt();

/** Is this key declared as a JSON key in the prompt's response schema? */
export function isDeclaredIn(key: string, corpus: string): boolean {
  const k = key.includes('.') ? key.split('.').pop()! : key;
  // The schema is written as JSON inside a template literal: `"overall_verdict": …`.
  return new RegExp(`"${k}"\\s*:`).test(corpus);
}

const isDeclared = (key: string) => isDeclaredIn(key, PROMPT);

describe('the probe can answer both ways', () => {
  it('sliced a real prompt and not the whole file', () => {
    expect(PROMPT.length, 'the slice collapsed').toBeGreaterThan(2_000);
    expect(PROMPT.length, 'the slice ran past the prompt into the rest of the file')
      .toBeLessThan(PROMPTS.length / 2);
  });

  it('is the RIGHT prompt', () => {
    expect(PROMPT).toContain('final reviewer in a multi-pass quality analysis');
  });

  it('finds a key the prompt certainly declares', () => {
    expect(isDeclared('overall_verdict'), 'the prompt text is not being read').toBe(true);
  });

  it('does NOT find a key nobody declares', () => {
    expect(isDeclared('zzzKeyNobodyDeclares')).toBe(false);
  });

  it('and the slice is narrow enough to return a negative', () => {
    // `chord_bearing` is declared by ANOTHER prompt in this same file — the curve-call extractor —
    // and not by this one. Without the slice it reads as present, which is precisely how a
    // whole-file sweep passes vacuously. 44 keys inside the slice, 297 in the file.
    expect(isDeclaredIn('chord_bearing', PROMPTS), 'the control key is not in the file at all')
      .toBe(true);
    expect(isDeclared('chord_bearing'), 'the slice is leaking into other prompts').toBe(false);
  });

  it('requires the JSON quoting, not a bare word', () => {
    expect(isDeclaredIn('needle', '"needle": 1')).toBe(true);
    expect(isDeclaredIn('needle', 'the needle: is prose'), 'prose is not a schema').toBe(false);
  });
});

describe('every key the Coherence panel reads is one the prompt declares', () => {
  it('has a key list to check', () => {
    // Control: an empty list agrees with everything.
    expect(COHERENCE_RESULT_KEYS.length).toBeGreaterThanOrEqual(17);
  });

  it.each([...COHERENCE_RESULT_KEYS])('%s is declared by COHERENCE_SYNTHESIS', (key) => {
    expect(
      isDeclared(key),
      `The Quality & Coherence Review reads \`${key}\`, and the COHERENCE_SYNTHESIS prompt does not `
      + 'ask the model to produce it. The section renders empty, which reads as "this property has '
      + 'none" rather than "nobody asked".',
    ).toBe(true);
  });

  it.each([...COHERENCE_VERDICTS])('the verdict %s is one the prompt can return', (verdict) => {
    expect(PROMPT).toContain(`"${verdict}"`);
    expect(VERDICT_LABELS[verdict], 'a verdict with no label renders its raw enum value').toBeTruthy();
    expect(VERDICT_COLORS[verdict], 'a verdict with no colour falls back to grey').toBeTruthy();
  });

  it('declares no verdict the panel cannot label', () => {
    // The other direction: the prompt gaining a fifth verdict must not render as a raw enum.
    const declared = [...PROMPT.matchAll(/"overall_verdict":\s*([^\n]+)/g)][0]?.[1] ?? '';
    const found = [...declared.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(found.length, 'the verdict enum line was not found').toBeGreaterThanOrEqual(4);
    for (const v of found) {
      expect(VERDICT_LABELS[v], `the prompt can return "${v}" and the panel has no label for it`)
        .toBeTruthy();
    }
  });
});

describe('the keys the prompt does NOT declare, and must not', () => {
  it.each([...COHERENCE_CODE_ATTACHED_KEYS])('%s is attached by code, not asked of the model', (key) => {
    // If one of these ever appears in the prompt schema, the list above is the wrong place for it —
    // and more importantly, the model would start inventing values for a field the code overwrites.
    expect(isDeclared(key), `${key} is now in the prompt; move it into COHERENCE_RESULT_KEYS`)
      .toBe(false);
    expect(SERVICE, `${key} is in neither the prompt nor the service — nothing produces it`)
      .toContain(key);
  });

  it('the service really does attach the pass count the badge depends on', () => {
    expect(SERVICE).toMatch(/_pass_count\s*=\s*3/);
  });
});

describe('the shaping itself', () => {
  const withReview = (cr: Record<string, unknown>) => ({ analysis_metadata: { coherence_review: cr } });

  it('returns null when the run produced no coherence review', () => {
    expect(coherenceReviewData({})).toBeNull();
    expect(coherenceReviewData({ analysis_metadata: {} })).toBeNull();
    expect(coherenceReviewData({ analysis_metadata: { coherence_review: null } })).toBeNull();
  });

  it('survives metadata of every wrong shape', () => {
    for (const junk of [null, undefined, 'a string', 42, [], { coherence_review: 'nope' }]) {
      expect(() => coherenceReviewData({ analysis_metadata: junk }), String(junk)).not.toThrow();
    }
    expect(coherenceReviewData({ analysis_metadata: { coherence_review: 'nope' } })).toBeNull();
  });

  it('defaults every list rather than handing the panel undefined', () => {
    const d = coherenceReviewData(withReview({}))!;
    expect(d.coherenceIssues).toEqual([]);
    expect(d.pipelineIssues).toEqual([]);
    expect(d.fieldNotes).toEqual([]);
    expect(d.missing).toEqual([]);
    expect(d.statement).toBe('');
    expect(d.execSummary).toBe('');
    expect(d.techSummary).toBe('');
  });

  it('coerces a list of the wrong type to an empty one instead of crashing .map', () => {
    const d = coherenceReviewData(withReview({
      coherence_issues: 'not an array', field_survey_notes: { 0: 'a' },
    }))!;
    expect(d.coherenceIssues).toEqual([]);
    expect(d.fieldNotes).toEqual([]);
  });

  it('coerces a non-numeric score to 0 rather than rendering NaN/100', () => {
    expect(coherenceReviewData(withReview({ overall_score: 'high' }))!.score).toBe(0);
    expect(coherenceReviewData(withReview({ overall_score: Number.NaN }))!.score).toBe(0);
    expect(coherenceReviewData(withReview({ overall_score: 82 }))!.score).toBe(82);
  });

  it('shows the multi-pass badge only when the pass count really is there', () => {
    // The badge renders on `passCount > 1`. Defaulting to 0 would hide it correctly but read as a
    // count; defaulting to 3 would claim three passes on a run that made one.
    expect(coherenceReviewData(withReview({}))!.passCount).toBe(1);
    expect(coherenceReviewData(withReview({ _pass_count: 3 }))!.passCount).toBe(3);
  });

  it('falls back to a labelled grey for a verdict it does not know', () => {
    const d = coherenceReviewData(withReview({ overall_verdict: 'catastrophic' }))!;
    expect(d.verdictLabel, 'an unknown verdict must still say something').toBe('catastrophic');
    expect(d.verdictColor).toBe(VERDICT_FALLBACK_COLOR);
  });

  it('says "unknown" rather than blank when the verdict is missing entirely', () => {
    expect(coherenceReviewData(withReview({}))!.verdict).toBe('unknown');
  });

  // ── THE ZERO CASES, WHICH ARE THE WHOLE POINT ────────────────────────────────────────────────

  // ── EACH CLAUSE ALONE, BECAUSE TOGETHER THEY MASK EACH OTHER ───────────────────────────────────
  //
  // The first version of these asserted on `{ deeds_found: 0, complete: false, breaks: 0 }` — all
  // three at once — and putting `deeds_found != null` back to a bare `deeds_found` did NOT turn it
  // red: `complete != null` carried the case on its own. A composite fixture proves the OR, not the
  // clause. One field per test, and each one mutation-checked.

  it.each([
    ['deeds_found', { deeds_found: 0 }],
    ['complete', { complete: false }],
    ['breaks', { breaks: 0 }],
  ])('SHOWS the deed-chain box on a falsy %s and nothing else', (_field, detail) => {
    // `deedDetail && (chain_summary || deeds_found)` — every one of these values is falsy, so the
    // one state a surveyor most needs to see rendered nothing at all: no break count, no
    // `complete: false`, no missing instruments. Fourth instance of this shortcut in the portal.
    const d = coherenceReviewData(withReview({ deed_chain_detail: detail }))!;
    expect(d.showDeedDetail, 'a falsy value is a finding, not an absence').toBe(true);
  });

  it('SHOWS the deed-chain box when only missing instruments came back', () => {
    expect(coherenceReviewData(withReview({
      deed_chain_detail: { missing_instruments: ['Vol. 412 Pg. 88'] },
    }))!.showDeedDetail).toBe(true);
  });

  it('hides it when the pipeline reported no deed chain at all', () => {
    expect(coherenceReviewData(withReview({}))!.showDeedDetail).toBe(false);
    expect(coherenceReviewData(withReview({ deed_chain_detail: {} }))!.showDeedDetail).toBe(false);
    expect(coherenceReviewData(withReview({
      deed_chain_detail: { missing_instruments: [] },
    }))!.showDeedDetail).toBe(false);
  });

  it.each([
    ['call_count', { call_count: 0 }],
    ['issues_found', { issues_found: 0 }],
  ])('SHOWS the boundary box on a zero %s and nothing else', (_field, detail) => {
    // Same shortcut, same box: `call_count: 0` on a traverse the pipeline did look at is a finding,
    // and the pre-existing guard read only `traverse_summary || closure_status`. One field per case,
    // for the reason recorded above the deed block.
    expect(coherenceReviewData(withReview({ boundary_detail: detail }))!.showBoundaryDetail)
      .toBe(true);
  });

  it('hides the boundary box when there is nothing to say', () => {
    expect(coherenceReviewData(withReview({}))!.showBoundaryDetail).toBe(false);
    expect(coherenceReviewData(withReview({ boundary_detail: {} }))!.showBoundaryDetail).toBe(false);
  });

  it('returns BOOLEANS for both flags, not a truthy object or null', () => {
    // `a && (b || c)` hands back the LEFT operand when it is falsy — so with no detail at all these
    // used to be `undefined`, and React renders `{undefined && …}` fine, which is exactly why
    // nobody notices until something compares them.
    for (const meta of [{}, { deed_chain_detail: null }, { deed_chain_detail: { complete: true } }]) {
      const d = coherenceReviewData(withReview(meta))!;
      expect(typeof d.showDeedDetail, JSON.stringify(meta)).toBe('boolean');
      expect(typeof d.showBoundaryDetail, JSON.stringify(meta)).toBe('boolean');
    }
  });
});

describe('the colours, which no CSS audit can reach', () => {
  // `scripts/audit-research-contrast.mjs` matches colour literals in stylesheets and in inline
  // style attributes. `style={{ color: verdictColors[verdict] }}` has no literal at the style site
  // at all — the value comes from a map by key. Not "skipped": invisible. This is the only place
  // these eleven colours get measured.

  it('measures a real background, not an empty string', () => {
    for (const [name, bg] of Object.entries(COHERENCE_BACKGROUNDS)) {
      expect(parseHex(bg), `${name} is not a parseable colour`).toBeTruthy();
    }
  });

  it('the audit script agrees with itself', () => {
    // If this drifts, every number below is wrong.
    expect(contrast(parseHex('#000000')!, parseHex('#ffffff')!)).toBeCloseTo(21, 5);
  });

  it('has colours to check', () => {
    expect(COHERENCE_TEXT_COLORS.length).toBeGreaterThanOrEqual(11);
    expect(COHERENCE_GRAPHIC_COLORS.length).toBeGreaterThanOrEqual(3);
  });

  it.each(COHERENCE_TEXT_COLORS)('$what — $color on $on clears 4.5:1', ({ color, on, what }) => {
    const ratio = contrast(parseHex(color)!, parseHex(on)!);
    expect(ratio, `${what}: ${color} on ${on} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COHERENCE_GRAPHIC_COLORS)('$what — $color on $on clears 3:1', ({ color, on, what }) => {
    // WCAG 1.4.11: a non-text graphic needs 3:1 against what is adjacent to it.
    const ratio = contrast(parseHex(color)!, parseHex(on)!);
    expect(ratio, `${what}: ${color} on ${on} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
  });

  it('the check can fail — the retired colours would not pass it', () => {
    // Control. Every colour above passing proves nothing if the assertion cannot go red. These are
    // the four this extraction actually replaced, at the ratios they rendered at.
    for (const [bad, on] of [
      ['#059669', COHERENCE_BACKGROUNDS.header],   // ready_for_fieldwork — 3.61:1
      ['#D97706', COHERENCE_BACKGROUNDS.header],   // needs_attention — 3.05:1
      ['#059669', COHERENCE_BACKGROUNDS.surface],  // the score delta — 3.77:1
      ['#D97706', COHERENCE_BACKGROUNDS.surface],  // missing instruments — 3.19:1
    ]) {
      expect(contrast(parseHex(bad)!, parseHex(on)!), `${bad} on ${on} should be a failure`)
        .toBeLessThan(4.5);
    }
  });

  it('none of the retired colours is still in use', () => {
    const inUse = [
      ...Object.values(VERDICT_COLORS), VERDICT_FALLBACK_COLOR,
      DEED_BREAKS_COLOR, MISSING_INSTRUMENTS_COLOR,
      scoreFillColor(100), scoreFillColor(50), scoreFillColor(10),
      deltaColor(1, 2), deltaColor(2, 1), deedCompleteColor(true), deedCompleteColor(false),
    ].map((c) => c.toUpperCase());
    for (const retired of ['#059669', '#D97706']) {
      expect(inUse, `${retired} is back`).not.toContain(retired);
    }
  });

  it('does not signal the deed chain by colour alone', () => {
    // Red/green carries no information for ~8% of men. Both states are worded.
    expect(PAGE).toContain("{deedDetail.complete ? 'Complete' : 'Incomplete'}");
  });

  it('picks the score fill by band, at the boundaries', () => {
    expect(scoreFillColor(70)).toBe(scoreFillColor(100));
    expect(scoreFillColor(69)).toBe(scoreFillColor(40));
    expect(scoreFillColor(39)).toBe(scoreFillColor(0));
    expect(scoreFillColor(70)).not.toBe(scoreFillColor(69));
    expect(scoreFillColor(40)).not.toBe(scoreFillColor(39));
  });

  it('colours the delta by DIRECTION — down is bad, equal is not', () => {
    expect(deltaColor(60, 80)).not.toBe(deltaColor(80, 60));
    // A score that did not move renders the "up" colour, which is the pre-existing reading; the
    // arrow itself only draws when the two differ.
    expect(deltaColor(70, 70)).toBe(deltaColor(80, 70));
  });
});

describe('the page uses it', () => {
  it('imports and calls the shaping function', () => {
    expect(PAGE).toContain("from './_sections/coherence-review-data'");
    expect(PAGE).toContain('coherenceReviewData(project)');
  });

  it('no longer carries the inline cast', () => {
    expect(PAGE, 'the seventeen-key inline cast is back')
      .not.toContain("cr.overall_verdict ?? 'unknown'");
    expect(PAGE).not.toContain('const verdictColors: Record<string, string>');
    expect(PAGE).not.toContain('const verdictLabels: Record<string, string>');
  });

  it('uses the shared visibility flags rather than re-deriving them', () => {
    expect(PAGE, 'the falsy-zero deed guard is back')
      .not.toContain('deedDetail.chain_summary || deedDetail.deeds_found');
    expect(PAGE).toContain('showDeedDetail &&');
    expect(PAGE).toContain('showBoundaryDetail &&');
  });

  it('holds no retired colour literal of its own', () => {
    // Both are retired across this file, not just the coherence panel: `#059669` was also the Run
    // Verification button's background behind white text at 3.77:1, which is how it was found.
    for (const hex of ['#059669', '#D97706']) {
      expect(PAGE_CODE, `${hex} is inline in page.tsx again`).not.toContain(hex);
    }
  });

  it('and that check reads CODE, not the comment explaining the retirement', () => {
    // Control. The assertion above went red on its first run against the comment that names the hex
    // it retired. A guard that matches its own documentation cannot distinguish a fix from a note.
    expect(PAGE, 'the comment that caused this control is gone; the control is now vacuous')
      .toContain('#059669');
    expect(stripJs("const a = 1; // was '#059669'\n")).not.toContain('#059669');
    expect(stripJs("const a = '#059669';\n"), 'the stripper is eating code').toContain('#059669');
  });
});
