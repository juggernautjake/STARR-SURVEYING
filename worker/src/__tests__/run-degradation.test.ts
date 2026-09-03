import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assessDegradation, degradationBadge } from '../research/run-degradation.js';

// ── THE RUN THAT NEVER MENTIONED ITS OWN BLIND SPOT ─────────────────────────────────────────────
//
// 2026-09-03: `esearch.bellcad.org` unreachable for a whole 163-minute Bell run. The appraisal
// record is what confirms WHICH parcel a run is about. Without it the run fell through to matching
// the clerk index by OWNER NAME, found 16 deeds, and reported them with no mention that nothing had
// confirmed the owner holds this particular parcel.
//
// They are probably the right deeds. Probably is the problem — and it is the same hazard this
// codebase already refuses elsewhere, where guessing a county "returns a confident report about
// somebody else's land".

const BELL = { county: 'Bell' };

describe('graded by what is still known, not by what failed', () => {
  it('a reachable district that found the record is not degraded at all', () => {
    const d = assessDegradation({ ...BELL, cadReachable: true, cadRecordFound: true, hasCoordinates: true, parcelId: '42156' });
    expect(d.level).toBe('ok');
    expect(d.canContinue).toBe(true);
    expect(degradationBadge(d)).toBeNull();
  });

  it('THE 2026-09-03 CASE: district down, but a Property ID still names the parcel', () => {
    // That project carried parcel_id 42156. A blanket "primary source dead, abort" would have
    // discarded 16 real deeds over an outage that never stopped the run knowing which property it
    // was about. This is the case the obvious design gets wrong.
    const d = assessDegradation({ ...BELL, cadReachable: false, cadRecordFound: false, hasCoordinates: false, parcelId: '42156' });
    expect(d.level).toBe('degraded');
    expect(d.canContinue).toBe(true);
    expect(d.detail).toContain('Property ID 42156 identifies the parcel');
    // And it must say the findings are unconfirmed — that is the whole point.
    expect(d.detail).toMatch(/no document here has been confirmed/);
    // It also explains the missing imagery, which was skipped for want of coordinates.
    expect(d.detail).toMatch(/Aerial, GIS and flood-zone lookups were skipped/);
  });

  it('coordinates alone are enough to keep going', () => {
    const d = assessDegradation({ ...BELL, cadReachable: false, cadRecordFound: false, hasCoordinates: true, parcelId: null });
    expect(d.level).toBe('degraded');
    expect(d.detail).toContain('coordinates identify the parcel');
    // Imagery was possible here, so it must NOT claim those lookups were skipped.
    expect(d.detail).not.toMatch(/skipped for want of coordinates/);
  });

  it('nothing identifies the property → STOP, because a finding would be attributed to a guess', () => {
    const d = assessDegradation({ ...BELL, cadReachable: false, cadRecordFound: false, hasCoordinates: false, parcelId: null });
    expect(d.level).toBe('cannot_attribute');
    expect(d.canContinue).toBe(false);
    expect(d.detail).toMatch(/attributed\s+to a property nobody can name/);
    // An empty result is honest; a populated one attached to an unnamed parcel is not.
    expect(d.detail).toMatch(/Add a Property ID/);
  });

  it('reachable-but-no-match reads differently from unreachable', () => {
    // "The district holds no record" is a finding about the property. "We could not reach it" is a
    // finding about us. Conflating them is the defect this codebase keeps unpicking.
    const down = assessDegradation({ ...BELL, cadReachable: false, cadRecordFound: false, hasCoordinates: true });
    const empty = assessDegradation({ ...BELL, cadReachable: true, cadRecordFound: false, hasCoordinates: true });
    expect(down.detail).toContain('could not be reached');
    expect(empty.detail).toContain('returned no record');
    expect(down.detail).not.toBe(empty.detail);
  });

  it('CONTROL: an ok run carries no headline to accidentally display', () => {
    const d = assessDegradation({ ...BELL, cadReachable: true, cadRecordFound: true, hasCoordinates: true });
    expect(d.headline).toBe('');
    expect(d.detail).toBe('');
  });
});

describe('the orchestrator actually asks — assert the CALLER', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'counties', 'bell', 'orchestrator.ts'), 'utf8');
  const code = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');

  it('CONTROL: stripping kept the code and dropped the prose', () => {
    expect(code).toContain('assessDegradation');
    expect(code).not.toContain('163 minutes');
  });

  it('assesses degradation once Phase 1 has resolved', () => {
    expect(code).toContain('const degradation = assessDegradation({');
    // It must read the ACTUAL outcome, not a hardcoded optimism.
    expect(code).toContain("cadReachable: cadResult.status === 'fulfilled'");
    expect(code).toContain('cadRecordFound: cad !== null');
  });

  it('reports it rather than deciding silently', () => {
    expect(code).toMatch(/progress\('Phase 1', `⚠ \$\{degradation\.headline\}`\)/);
  });

  it('and stops only when nothing identifies the property', () => {
    expect(code).toContain('if (!degradation.canContinue)');
  });
});
