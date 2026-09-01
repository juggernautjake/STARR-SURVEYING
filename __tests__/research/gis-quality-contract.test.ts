// __tests__/research/gis-quality-contract.test.ts — B1a, fourteenth extraction.
//
// ── A CARD THAT HAD NEVER RENDERED ──────────────────────────────────────────────────────────────
//
// The Artifacts tab reads `analysis_metadata.result.gisQualityReport` — seven keys across two
// nesting levels, declared by hand in `page.tsx`, produced by hand in the Bell orchestrator, with
// nothing connecting the two. All seven names match today. What the extraction found was not a key
// bug; it was four unreadable colours that no instrument in this repository could see.
//
// **0 of 50 projects** carry a report with checks, measured 2026-08-31. Only the Bell orchestrator
// writes one, only when GIS screenshots exist and AI credits are not depleted. So:
//
//   · `check-portal-themes.mjs` measures RENDERED text and found nothing to measure — the same
//     blind spot that hid the Document Library's row colours until G18 made the rows appear, and
//     the same one U4 found on the project-scoped routes. Third instance.
//   · `audit-research-contrast.mjs` reads inline style OBJECTS, and the colour was a ternary
//     assigned to a local — `const color = score >= 70 ? '#22c55e' : …` then `style={{ color }}`.
//     No literal in the object to find.
//
// Measured, on white:  #22c55e 2.28:1 · #eab308 **1.92:1** · #ef4444 3.76:1 · #999 2.85:1.
// The 1.92:1 is the score itself — the one number the card exists to show.
//
// The lesson is not "add a third instrument". It is that a value with a NAME is a value an audit
// can follow, and a fixture is what makes a never-rendered branch measurable.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ResearchProject } from '@/types/research';
import {
  gisQualityOf, toneForScore, GIS_QUALITY_KEYS, GIS_QUALITY_IGNORED_KEYS,
  GIS_SCORE_GOOD, GIS_SCORE_FAIR,
} from '@/app/admin/research/[projectId]/_sections/gis-quality-data';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const PAGE = 'app/admin/research/[projectId]/page.tsx';
const CARD = 'app/admin/research/[projectId]/_sections/GisQualityCard.tsx';
const DATA = 'app/admin/research/[projectId]/_sections/gis-quality-data.ts';
const WORKER_TYPE = 'worker/src/counties/bell/types/research-result.ts';
const ORCHESTRATOR = 'worker/src/counties/bell/orchestrator.ts';

const check = (over: Record<string, unknown> = {}) => ({
  label: 'Parcel overview', qualityScore: 82, zoomAssessment: 'appropriate',
  whatIsShown: 'Parcel lines and adjoining tracts', recommendations: [], ...over,
});

const project = (gisQualityReport: unknown): ResearchProject =>
  ({ analysis_metadata: { result: { gisQualityReport } } }) as unknown as ResearchProject;

// ── THE CONTRACT ────────────────────────────────────────────────────────────────────────────────

describe('every key the page reads is one the worker writes', () => {
  const workerType = read(WORKER_TYPE);
  const declaration = workerType.slice(
    workerType.indexOf('gisQualityReport?: {'),
    workerType.indexOf('researchCompleteness'),
  );

  it('the producer is where this test thinks it is', () => {
    // Control. If the declaration moved, every assertion below would pass against an empty string.
    expect(declaration.length, 'the gisQualityReport declaration was not found').toBeGreaterThan(120);
    expect(declaration).toContain('checks: Array<{');
  });

  for (const key of GIS_QUALITY_KEYS) {
    it(`\`${key}\` is produced`, () => {
      expect(declaration, `${key} is read by the Artifacts tab and written by nobody`)
        .toMatch(new RegExp(`\\b${key}\\s*:`));
    });
  }

  it('and the list is COMPLETE — every key the worker declares is accounted for', () => {
    // Without this, the loop above is a list checking itself. Deleting an entry from
    // GIS_QUALITY_KEYS deleted a test and passed, which is the "a probe that cannot fail" shape
    // recorded in contrast-floor.test.ts. Mutation-tested: dropping 'zoomAssessment' survived the
    // first pass, and this is what kills it.
    //
    // Reading the worker's declaration makes it bidirectional: the page dropping a key fails here,
    // and the WORKER adding one fails here too — which is the more likely direction, and the one
    // that would otherwise ship a field nobody renders.
    const declared = new Set([
      ...[...declaration.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\??\s*:/gm)].map((m) => m[1]!),
    ]);
    declared.delete('gisQualityReport');

    expect(declared.size, 'no keys were parsed out of the worker declaration').toBeGreaterThanOrEqual(8);

    const accounted = new Set<string>([...GIS_QUALITY_KEYS, ...GIS_QUALITY_IGNORED_KEYS]);
    const missing = [...declared].filter((k) => !accounted.has(k));
    expect(missing, `the worker writes ${missing.join(', ')} and the Artifacts tab accounts for neither reading nor ignoring it`)
      .toEqual([]);
  });

  it('and the ignored key really is written, so the exclusion is honest', () => {
    // `aiUsage` is deliberately not read — it is billing, not quality. Asserting it EXISTS keeps
    // the exclusion list from quietly becoming a place to hide keys somebody forgot.
    for (const key of GIS_QUALITY_IGNORED_KEYS) {
      expect(read(ORCHESTRATOR)).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it('the page no longer casts the shape itself', () => {
    const src = read(PAGE);
    expect(src, 'the hand-written cast is back').not.toContain('gisQualityReport as {');
    expect(src).toContain('<GisQualityCard report={gisQualityOf(project)} />');
  });
});

describe('the score bands match the worker\'s', () => {
  it('because the worker draws the same lines, four times over', () => {
    // 70 and 40 appear as literals in orchestrator.ts and twice in gis-quality-analyzer.ts. They
    // cannot share a module across the app/worker boundary without a shared package, so this reads
    // the worker's literals instead. If somebody moves the bands, the product must not go on
    // showing a green tick beside a number the pipeline log called a warning.
    const worker = read(ORCHESTRATOR) + read('worker/src/counties/bell/analyzers/gis-quality-analyzer.ts');
    expect(worker).toContain(`qualityScore >= ${GIS_SCORE_GOOD}`);
    expect(worker).toContain(`qualityScore >= ${GIS_SCORE_FAIR}`);
  });

  it('control: this would notice a changed band', () => {
    const worker = read(ORCHESTRATOR);
    expect(worker).not.toContain('qualityScore >= 71');
  });

  it('and the tone function draws them in the same places', () => {
    expect(toneForScore(100)).toBe('good');
    expect(toneForScore(GIS_SCORE_GOOD)).toBe('good');
    expect(toneForScore(GIS_SCORE_GOOD - 1)).toBe('fair');
    expect(toneForScore(GIS_SCORE_FAIR)).toBe('fair');
    expect(toneForScore(GIS_SCORE_FAIR - 1)).toBe('poor');
    expect(toneForScore(0)).toBe('poor');
  });
});

// ── THE SHAPING ─────────────────────────────────────────────────────────────────────────────────

describe('gisQualityOf', () => {
  it('reads a well-formed report', () => {
    const r = gisQualityOf(project({ summary: 'Two of three usable', checks: [check()], actionableAdjustments: ['Zoom out'] }));
    expect(r?.summary).toBe('Two of three usable');
    expect(r?.checks).toHaveLength(1);
    expect(r?.actionableAdjustments).toEqual(['Zoom out']);
  });

  it('returns null when there is no report at all', () => {
    expect(gisQualityOf(null)).toBeNull();
    expect(gisQualityOf(project(null))).toBeNull();
    expect(gisQualityOf({} as ResearchProject)).toBeNull();
  });

  it('returns null for a report with no checks', () => {
    // A heading over an empty grid is worse than nothing: it asserts an analysis happened.
    expect(gisQualityOf(project({ summary: 'x', checks: [], actionableAdjustments: [] }))).toBeNull();
  });

  it('handles analysis_metadata arriving as a JSON STRING', () => {
    // PostgREST returns jsonb parsed, but this page has been handed both, and `document-rows.ts`
    // was caught by exactly this: reading a key off a string yields undefined, silently.
    const p = { analysis_metadata: JSON.stringify({ result: { gisQualityReport: { summary: 's', checks: [check()], actionableAdjustments: [] } } }) } as unknown as ResearchProject;
    expect(gisQualityOf(p)?.checks).toHaveLength(1);
  });

  it('and does not throw on a string that is not JSON', () => {
    const p = { analysis_metadata: 'not json {' } as unknown as ResearchProject;
    expect(() => gisQualityOf(p)).not.toThrow();
    expect(gisQualityOf(p)).toBeNull();
  });

  it('a MISSING score does not read as zero', () => {
    // Zero means "we looked and it was terrible". Absent means we do not know, and showing a red
    // 0/100 for it is a confident claim about a measurement that was never taken.
    const r = gisQualityOf(project({ summary: '', checks: [check({ qualityScore: undefined })], actionableAdjustments: [] }));
    expect(r?.checks[0]!.qualityScore).toBe(GIS_SCORE_FAIR);
    expect(toneForScore(r!.checks[0]!.qualityScore)).toBe('fair');
  });

  it('clamps a score outside 0–100', () => {
    const r = gisQualityOf(project({ summary: '', checks: [check({ qualityScore: 140 }), check({ qualityScore: -20 })], actionableAdjustments: [] }));
    expect(r?.checks.map((c) => c.qualityScore)).toEqual([100, 0]);
  });

  it('never renders a blank label', () => {
    // The same property `titleOf` needed in document-rows.ts, for the same reason.
    const r = gisQualityOf(project({ summary: '', checks: [check({ label: '   ' })], actionableAdjustments: [] }));
    expect(r?.checks[0]!.label.trim().length).toBeGreaterThan(0);
  });

  it('drops empty recommendations rather than rendering empty bullets', () => {
    // Both lists are filtered, and both are asserted — the two filters are separate code and a
    // mutation to either must fail something.
    const r = gisQualityOf(project({ summary: '', checks: [check({ recommendations: ['Zoom in', '', '  ', 7] })], actionableAdjustments: ['', 'Retry'] }));
    expect(r?.checks[0]!.recommendations).toEqual(['Zoom in']);
    expect(r?.actionableAdjustments).toEqual(['Retry']);
  });

  it('survives a checks array full of rubbish', () => {
    expect(gisQualityOf(project({ summary: '', checks: [null, 'x', 3], actionableAdjustments: [] }))).toBeNull();
  });
});

// ── THE COLOURS, WHICH ARE WHY THIS WAS WORTH EXTRACTING ────────────────────────────────────────

describe('the card carries no literal colours', () => {
  const card = read(CARD);

  it('no hex anywhere in the component', () => {
    expect(card, 'a literal colour is back in the card').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('and none of the four that failed', () => {
    const all = card + read(PAGE);
    for (const hex of ['#22c55e', '#eab308', '#ef4444']) {
      expect(all, `${hex} is back`).not.toContain(hex);
    }
  });

  it('the phantom token is gone', () => {
    // `--text-tertiary` is defined in neither tokens.css nor themes.css, so `var(--text-tertiary,
    // #999)` always painted #999 — 2.85:1. A fallback that is always the value is not a fallback.
    const defined = read('app/styles/tokens.css') + read('app/styles/themes.css');
    expect(defined, 'the token exists now, so this check should be re-read rather than deleted')
      .not.toContain('--text-tertiary:');
    expect(read(CARD)).not.toContain('--text-tertiary');
    expect(read(PAGE), 'the Artifacts tab still reads a token nothing defines')
      .not.toMatch(/--text-tertiary[^)]*\)\s*['"]?\s*,?\s*fontSize: '0\.75rem'/);
  });

  it('every token the stylesheet uses for this card is real', () => {
    const css = read('app/admin/styles/AdminResearch.css');
    const block = css.slice(css.indexOf('.gis-quality {'), css.indexOf('.research-prefill-note {'));
    expect(block.length, 'the .gis-quality rules are gone').toBeGreaterThan(400);

    // Comments stripped FIRST. The rule for --gis-quality__zoom explains, in prose, that it used
    // to read `var(--text-tertiary, #999)` — and the scan below matched that sentence and reported
    // the card as reading a token nothing defines. Fourteenth instance in this repository of a
    // check matching its own explanation; it is always worth stripping before scanning.
    const code = block.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const defined = read('app/styles/tokens.css') + read('app/styles/themes.css') + css;
    const tokens = new Set([...code.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]!));
    expect(tokens.size, 'the scan found no tokens at all — it cannot fail').toBeGreaterThanOrEqual(6);
    for (const t of tokens) {
      expect(defined, `${t} is read by .gis-quality and defined nowhere`).toContain(`${t}:`);
    }
    expect([...tokens], 'the phantom token is being read again').not.toContain('--text-tertiary');
  });

  it('and the score keeps a non-colour signal', () => {
    // A quality score distinguished only by colour is unreadable to a colour-blind surveyor and
    // invisible in a printed packet.
    //
    // The first version of this asserted the file CONTAINED 'TONE_ICON', which renaming the
    // declaration alone survived — the usage still contained the string. A name check is not a
    // render check. This reads the map and the mount point.
    expect(card).toMatch(/good:\s*Check/);
    expect(card).toMatch(/fair:\s*AlertTriangle/);
    expect(card).toMatch(/poor:\s*X/);

    // The icon is chosen from the map and actually rendered beside the score.
    expect(card).toMatch(/const Icon = TONE_ICON\[tone\]/);
    const at = card.indexOf('gis-quality__score gis-quality__score--');
    expect(at, 'the score span is gone').toBeGreaterThan(-1);
    expect(card.slice(at, at + 260), 'the icon is no longer rendered with the score')
      .toMatch(/<Icon\b/);
  });
});

describe('the page mounts it', () => {
  // The doc's rule for every B1a extraction: a wiring test. An extracted section that nothing
  // renders is the `authored but not wired` defect at the width of a file.
  const src = read(PAGE);

  it('imports and renders the card', () => {
    expect(src).toContain("import GisQualityCard from './_sections/GisQualityCard'");
    expect(src).toContain('<GisQualityCard');
  });

  it('on the Artifacts tab, above the gallery', () => {
    const at = src.indexOf('<GisQualityCard');
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toContain("reviewTab === 'artifacts'");
    expect(src.slice(at, at + 200)).toContain('<ArtifactGallery');
  });
});
