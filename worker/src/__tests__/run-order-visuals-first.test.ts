import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RUN_ORDER, describeRunOrder, visualReadiness } from '../research/run-order.js';

// ── THE ORDER THE OWNER ASKED FOR, AND THE ORDER THE RUN FOLLOWED ───────────────────────────────
//
// > "the order should be, drawings/plats, then the overhead views, then the rest of the documents"
//
// The run did the exact inverse. Imagery capture and the drawing hunt were the LAST two things it
// did, in `index.ts`, after `runCountyResearch` had already returned and every deed had been
// searched, downloaded and analysed — because they were written as a post-processing step.
//
// On 2026-09-03 that cost the whole run. Bell CAD was unreachable, so there were no coordinates;
// the run spent 163 minutes and $29.19 grinding owner-name searches at the clerk and reached the
// imagery stage only at [1377s], to print "Direct map screenshots skipped — no property ID or
// coordinates". Under the requested order it would have known that in the first minute.

const ROOT = path.join(__dirname, '..');
const code = (p: string): string => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!/\b(import|export|const|function)\b/.test(s)) throw new Error(`stripping destroyed ${p}`);
  return s;
};

describe('the order is data, so the log and the code cannot drift', () => {
  it('is the order the owner asked for', () => {
    expect(RUN_ORDER.map((s) => s.step)).toEqual(['identify', 'drawings', 'imagery', 'documents']);
  });

  it('drawings come before imagery, and both before the documents', () => {
    const at = (s: string) => RUN_ORDER.findIndex((x) => x.step === s);
    expect(at('drawings')).toBeLessThan(at('imagery'));
    expect(at('imagery')).toBeLessThan(at('documents'));
  });

  it('every step says why it is where it is', () => {
    // A bare ordering is a rule nobody can argue with later. "Identify" leads by necessity, not
    // preference, and the difference matters to whoever next wants to move something.
    for (const s of RUN_ORDER) expect(s.why.length).toBeGreaterThan(40);
  });

  it('describeRunOrder is what the operator reads', () => {
    expect(describeRunOrder()).toHaveLength(RUN_ORDER.length);
    expect(describeRunOrder()[1]).toContain('Drawings and plats');
  });
});

describe('a gap in what we identified is not a finding about the property', () => {
  const base = {
    propertyId: null, latitude: null, longitude: null, acreage: null,
    legalDescription: null, subdivisionName: null, situsAddress: null,
    controllingDeedDate: null, neighbours: [],
  };

  it('coordinates and a name means both are possible', () => {
    const r = visualReadiness({ ...base, latitude: 31, longitude: -97, subdivisionName: 'Ash Family Trust' });
    expect(r.canPhotograph).toBe(true);
    expect(r.canFindPlat).toBe(true);
    expect(r.statement).toContain('Ash Family Trust');
  });

  it('coordinates without a name is a metes-and-bounds parcel, and says so', () => {
    const r = visualReadiness({ ...base, latitude: 31, longitude: -97 });
    expect(r.canPhotograph).toBe(true);
    expect(r.canFindPlat).toBe(false);
    expect(r.statement).toContain('metes-and-bounds');
  });

  it('neither is reported as OUR gap, not the property having no plat', () => {
    // The distinction the 2026-09-03 run got wrong everywhere: "we could not find it" and "it does
    // not exist" are different answers and only one of them is a finding.
    const r = visualReadiness(base);
    expect(r.canPhotograph).toBe(false);
    expect(r.statement).toContain('gap in what the run could identify');
    expect(r.statement).toContain('not a finding');
  });

  it('a NaN coordinate is absent, not zero', () => {
    // (0, 0) is the Gulf of Guinea. Photographing it would produce a confident, wrong artefact.
    const r = visualReadiness({ ...base, latitude: Number.NaN, longitude: Number.NaN });
    expect(r.canPhotograph).toBe(false);
  });
});

describe('the hook is wired — assert the CALLERS', () => {
  it('CONTROL: the probe reads real files', () => {
    expect(code('index.ts').length).toBeGreaterThan(10_000);
    expect(code('counties/router.ts')).toContain('runCountyResearch');
  });

  it('the router hands it to BOTH paths', () => {
    const s = code('counties/router.ts');
    // Bell's argument list and the generic PipelineInput. Same expression, so count.
    expect(s.split('onPropertyIdentified: input.onPropertyIdentified').length - 1).toBe(2);
  });

  it('Bell fires it BEFORE the clerk search, not after', () => {
    const s = code('counties/bell/orchestrator.ts');
    const fired = s.indexOf('await input.onPropertyIdentified(');
    const clerk = s.indexOf('2A — Bell County Clerk search');
    expect(fired, 'Bell never fires the hook').toBeGreaterThan(-1);
    expect(clerk, 'the clerk search anchor moved').toBeGreaterThan(-1);
    // The whole point. If this inverts, the visual work is back where it was.
    expect(fired).toBeLessThan(clerk);
  });

  it('the generic pipeline fires it BEFORE Stage 2', () => {
    const s = code('services/pipeline.ts');
    const fired = s.indexOf('await input.onPropertyIdentified(');
    const stage2 = s.indexOf("stopIfAborted('Stage 2')");
    expect(fired).toBeGreaterThan(-1);
    expect(stage2).toBeGreaterThan(-1);
    expect(fired).toBeLessThan(stage2);
  });

  it('both AWAIT it — fire-and-forget would restore the old order in all but name', () => {
    expect(code('counties/bell/orchestrator.ts')).toContain('await input.onPropertyIdentified(');
    expect(code('services/pipeline.ts')).toContain('await input.onPropertyIdentified(');
  });

  it('index.ts actually supplies it', () => {
    // A hook nothing passes is the defect this repo keeps producing: authored, plausible, inert.
    const s = code('index.ts');
    expect(s).toContain('onPropertyIdentified: async (identified) =>');
    expect(s).toContain('captureVisualsAtIdentification(projectId, county, identified)');
  });

  it('the end-of-run capture became a fallback and cannot double-file', () => {
    const s = code('index.ts');
    // visualsCaptured is a Map<projectId, Set<kind>> now (which kinds the early pass already got).
    expect(s).toContain('visualsCaptured.get(projectId)');
    // Cleared on re-run, or the second run skips its own fallback on the first run's flag.
    expect(s).toContain('visualsCaptured.delete(projectId)');
  });

  it('neither path can be failed by a slow map server', () => {
    // Supporting evidence must never lose a completed run. Wrapped at all three levels.
    expect(code('counties/bell/orchestrator.ts')).toContain("recordError('Phase 1.5'");
    expect(code('services/pipeline.ts')).toContain('Visual capture failed (non-fatal)');
    expect(code('index.ts')).toContain('early visual phase threw');
  });
});
