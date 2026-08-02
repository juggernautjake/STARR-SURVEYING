// A conflict is a question, not a verdict (research plan R20).
//
// `DiscrepancyCard` rendered the AI's title, description and recommendation — prose. The
// `document_ids` and `data_point_ids` that every discrepancy carries were NEVER rendered at all. So
// "the deed calls 210.5 feet but the plat shows 210.0" arrived as something the model said, with no
// route to the deed or the plat: R17's problem one level up, on the most consequential claim in the
// packet.
//
// And `ai_recommendation` is free text — sometimes a check, sometimes a winner. A recommendation
// that quietly resolves a conflict is worse than no recommendation, because the reviewer never
// learns there was one.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CALL_DIGNITY,
  callKindFor,
  conflictTotals,
  detectNaturalMonument,
  fieldCheckFor,
  frameConflict,
  readsAsVerdict,
} from '@/lib/research/conflict-framing';
import type { Discrepancy } from '@/types/research';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const disc = (over: Partial<Discrepancy> = {}): Discrepancy => ({
  id: 'd1',
  research_project_id: 'p1',
  severity: 'discrepancy',
  title: 'Distance mismatch on the east line',
  description: 'The deed calls 210.5 feet; the plat shows 210.0 feet.',
  data_point_ids: [],
  document_ids: [],
  affects_boundary: true,
  affects_area: false,
  affects_closure: false,
  resolution_status: 'open',
  created_at: '2026-08-02T00:00:00.000Z',
  updated_at: '2026-08-02T00:00:00.000Z',
  ...over,
} as Discrepancy);

describe('the order of dignity, used to describe and not to decide', () => {
  it('ranks the calls the way Texas retracement does', () => {
    // natural > artificial > adjoiner > course > distance > quantity
    expect(CALL_DIGNITY.natural_monument).toBeLessThan(CALL_DIGNITY.artificial_monument);
    expect(CALL_DIGNITY.artificial_monument).toBeLessThan(CALL_DIGNITY.adjoiner);
    expect(CALL_DIGNITY.adjoiner).toBeLessThan(CALL_DIGNITY.course);
    expect(CALL_DIGNITY.course).toBeLessThan(CALL_DIGNITY.distance);
    expect(CALL_DIGNITY.distance).toBeLessThan(CALL_DIGNITY.quantity);
  });

  it('maps a data category to the kind of call in dispute', () => {
    expect(callKindFor('monument')).toBe('artificial_monument');
    expect(callKindFor('adjoiner')).toBe('adjoiner');
    expect(callKindFor('bearing')).toBe('course');
    expect(callKindFor('area')).toBe('quantity');
    expect(callKindFor(null)).toBe('unknown');
  });

  it('spots a natural monument by description, since no category names one', () => {
    // They sit at the top of the hierarchy, so detecting them changes the answer to "what would
    // settle this".
    expect(detectNaturalMonument('to a point in the center of Nolan Creek')).toBe(true);
    expect(detectNaturalMonument('to a large live oak marked X')).toBe(true);
    expect(detectNaturalMonument('to a 1/2 inch iron rod set')).toBe(false);
  });
});

describe('what would settle it — never who wins', () => {
  it('says a recovered monument outranks both recited numbers', () => {
    const f = fieldCheckFor('artificial_monument', false);
    expect(f).toContain('controls over the courses and distances on either document');
    // Not a verdict about which document is right.
    expect(f).not.toMatch(/the (?:deed|plat) (?:controls|wins|is correct)/i);
  });

  it('explains why bearings disagree across eras', () => {
    expect(fieldCheckFor('course', false)).toContain('rarely share a meridian');
  });

  it('calls quantity the weakest call, because it is', () => {
    const f = fieldCheckFor('quantity', false);
    expect(f).toContain('consequence of the boundary, not evidence of it');
  });

  it('puts a natural monument above everything', () => {
    expect(fieldCheckFor('distance', true)).toContain('controls over every recited course, distance and area');
  });

  it('refuses to give a generic answer for an unclassified conflict', () => {
    // "Verify on site" is not a field check.
    expect(fieldCheckFor('unknown', false)).toContain('Identify which kind of call is in dispute');
  });
});

describe('both sources, shown', () => {
  it('frames two sources as a question naming both', () => {
    const f = frameConflict(
      disc({ document_ids: ['doc-a', 'doc-b'], data_point_ids: ['dp-a', 'dp-b'] }),
      {
        category: 'distance',
        documentLabels: { 'doc-a': 'the 1968 deed', 'doc-b': 'the 1998 replat' },
        dataPointValues: { 'dp-a': '210.5 ft', 'dp-b': '210.0 ft' },
      },
    );
    expect(f.question).toBe('Which controls — the 1968 deed at 210.5 ft, or the 1998 replat at 210.0 ft?');
    expect(f.sides).toHaveLength(2);
    expect(f.unsourced).toBe(false);
  });

  it('calls an unsourced conflict what it is', () => {
    // A conflict with no sources is a claim, not a finding.
    const f = frameConflict(disc());
    expect(f.unsourced).toBe(true);
    expect(f.question).toContain('None are recorded on this finding');
  });

  it('asks for the other side when only one is recorded', () => {
    const f = frameConflict(disc({ document_ids: ['doc-a'] }), { documentLabels: { 'doc-a': 'the 1968 deed' } });
    expect(f.question).toContain('What does the other document say?');
  });

  it('does not silently drop a data point with no matching document', () => {
    const f = frameConflict(disc({ document_ids: ['doc-a'], data_point_ids: ['dp-a', 'dp-b'] }));
    expect(f.sides).toHaveLength(2);
  });

  it('says when a value was not recorded rather than showing a blank', () => {
    const f = frameConflict(disc({ document_ids: ['doc-a', 'doc-b'] }));
    expect(f.sides[0]!.value).toBe('(value not recorded)');
  });
});

describe('a recommendation that resolves the conflict instead of framing it', () => {
  it('is flagged', () => {
    expect(readsAsVerdict('Use the plat dimension of 210.0 feet.')).toBe(true);
    expect(readsAsVerdict('Rely on the more recent survey.')).toBe(true);
    expect(readsAsVerdict('Disregard the deed call.')).toBe(true);
  });

  it('does not flag an actual field check', () => {
    expect(readsAsVerdict('Measure between the recovered monuments at each end of the line.')).toBe(false);
    expect(readsAsVerdict(null)).toBe(false);
  });

  it('reaches the framed conflict', () => {
    const f = frameConflict(disc({ ai_recommendation: 'Use the plat dimension.' }));
    expect(f.recommendationPicksAWinner).toBe(true);
  });
});

describe('the count a reviewer sees first', () => {
  it('leads with the conflicts that have no sources', () => {
    const t = conflictTotals([
      frameConflict(disc({ document_ids: ['a', 'b'] })),
      frameConflict(disc()),
    ]);
    expect(t.headline).toContain('1 with no source documents recorded');
  });

  it('counts proposed winners separately', () => {
    const t = conflictTotals([frameConflict(disc({ ai_recommendation: 'Use the plat.' }))]);
    expect(t.verdicts).toBe(1);
    expect(t.headline).toContain('proposed a winner rather than a check');
  });

  it('says so plainly when every conflict is sourced', () => {
    const t = conflictTotals([frameConflict(disc({ document_ids: ['a', 'b'] }))]);
    expect(t.headline).toContain('each with both sources recorded');
  });
});

describe('the surface', () => {
  const card = read('app/admin/research/components/DiscrepancyCard.tsx');

  it('renders the source ids that were carried and never shown', () => {
    expect(card).toContain('framed.sides.map');
    expect(card).toContain('research-disc__side-value');
  });

  it('leads with the question', () => {
    expect(card).toContain('research-disc__question');
    expect(card.indexOf('research-disc__question')).toBeLessThan(card.indexOf('research-disc__desc'));
  });

  it('shows what would settle it, naming the call in dispute', () => {
    expect(card).toContain('What would settle it');
    expect(card).toContain('CALL_LABEL[framed.callKind]');
  });

  it('does not let an unsourced conflict look like a sourced one', () => {
    expect(card).toContain('research-disc__unsourced');
    expect(read('app/admin/styles/AdminResearch.css')).toContain('.research-disc__unsourced');
  });

  it('warns when the AI proposed a winner', () => {
    expect(card).toContain('recommendationPicksAWinner');
    expect(card).toContain('the conflict is still open');
  });

  it('is given document labels, not left rendering UUIDs', () => {
    const panel = read('app/admin/research/components/DiscrepancyPanel.tsx');
    expect(panel).toContain('documentLabels={documentLabels}');
    expect(panel).toContain('/documents');
  });
});
