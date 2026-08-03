// The packet, reachable from the job (research plan R26).
//
// `research_projects.job_id` has been written on project creation since the table existed and read
// by nothing. So everything R13–R25 produced — the chain, the plats, the conflicts, the gameplan,
// the packet — lived behind `/admin/research/<uuid>`, a screen a field crew has no reason to open
// and often no permission to. The acceptance is exactly this: "a field user opens the job and reads
// the plan without touching the research UI."
//
// Four states, and a naive implementation renders three of them as an empty panel. A crew that sees
// nothing concludes there is nothing — drives out and repeats work somebody already did, or works
// from a draft nobody finished checking.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  fieldBrief,
  fieldHighlights,
  jobPacketStatus,
  type PacketRow,
} from '@/lib/research/job-packet';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const packet = (over: Partial<PacketRow> = {}): PacketRow => ({
  id: 'pk1',
  research_project_id: 'proj1',
  version: 1,
  title: 'Survey research packet',
  status: 'approved',
  approved_by: 'rpls@example.com',
  approved_at: '2026-08-02T10:00:00.000Z',
  rendered_json: null,
  ...over,
});

describe('the four states must not look alike', () => {
  it('says plainly when no research is attached', () => {
    const s = jobPacketStatus([], []);
    expect(s.state).toBe('no_research');
    expect(s.nextStep).toContain('created without linking this job');
  });

  it('distinguishes "research exists" from "packet approved"', () => {
    // The state a crew must not read as "nothing was done".
    const s = jobPacketStatus(['proj1'], []);
    expect(s.state).toBe('research_only');
    expect(s.headline).toContain('no packet has been assembled for the field');
    expect(s.packet).toBeNull();
  });

  it('refuses to hand a draft to the crew', () => {
    // Working from a draft is how unchecked facts reach the ground.
    const s = jobPacketStatus(['proj1'], [packet({ status: 'draft', approved_by: null, approved_at: null })]);
    expect(s.state).toBe('draft_only');
    expect(s.packet).toBeNull();
    expect(s.nextStep).toContain('Do not work from the draft');
  });

  it('names the approver and the date on an approved packet', () => {
    const s = jobPacketStatus(['proj1'], [packet()]);
    expect(s.state).toBe('approved');
    expect(s.headline).toContain('rpls@example.com');
    expect(s.headline).toContain('2026-08-02');
  });
});

describe('which packet the crew works from', () => {
  it('takes the most recently approved', () => {
    const s = jobPacketStatus(['proj1'], [
      packet({ id: 'old', version: 1, approved_at: '2026-07-01T00:00:00.000Z' }),
      packet({ id: 'new', version: 2, approved_at: '2026-08-01T00:00:00.000Z' }),
    ]);
    expect(s.packet?.id).toBe('new');
  });

  it('never offers a superseded packet', () => {
    // They are kept as evidence of what a crew was previously given, not to work from now.
    const s = jobPacketStatus(['proj1'], [packet({ status: 'superseded' })]);
    expect(s.state).not.toBe('approved');
    expect(s.packet).toBeNull();
  });

  it('prefers an approved packet over a newer draft', () => {
    const s = jobPacketStatus(['proj1'], [
      packet({ id: 'draft', version: 3, status: 'draft', approved_at: null }),
      packet({ id: 'approved', version: 2 }),
    ]);
    expect(s.packet?.id).toBe('approved');
  });
});

describe('what the crew actually reads', () => {
  const withJson = packet({
    rendered_json: {
      title: 'Survey research packet',
      warnings: ['3 items are unverified.'],
      itemCount: 12,
      sections: [
        { title: 'Field plan', entries: [{ heading: 'Recover the NE rod', body: '', provenance: '', unsupported: false }] },
        { title: 'Open questions for the field', entries: [{ heading: 'Which controls — deed or replat?', body: '', provenance: '', unsupported: false }] },
        { title: 'Facts relied on', entries: [{ heading: 'distance: 210.5 ft', body: '', provenance: '', unsupported: true }] },
      ],
    },
  });

  it('reads the approved snapshot, not the live tables', () => {
    // It is what was approved, and it is a single object — which is what makes it cacheable for a
    // truck with no signal.
    const b = fieldBrief(withJson);
    expect(b?.itemCount).toBe(12);
    expect(b?.warnings).toEqual(['3 items are unverified.']);
  });

  it('returns nothing for a packet with no snapshot', () => {
    expect(fieldBrief(packet())).toBeNull();
    expect(fieldBrief(null)).toBeNull();
  });

  it('lifts the plan and the open questions out of the packet', () => {
    // A packet with fifty facts buries them, and nobody scrolls for them on a phone in a truck.
    const h = fieldHighlights(fieldBrief(withJson));
    expect(h.plan).toEqual(['Recover the NE rod']);
    expect(h.questions).toEqual(['Which controls — deed or replat?']);
  });

  it('is empty rather than throwing when there is no brief', () => {
    expect(fieldHighlights(null)).toEqual({ plan: [], questions: [] });
  });
});

describe('the surface', () => {
  it('does not report a failed read as "no research"', () => {
    // A crew told there is nothing when a packet was approved drives out and repeats the work.
    const route = read('app/api/admin/jobs/[id]/research-packet/route.ts');
    expect(route).toContain('not the same as there being none');
    // The sentence MOVED (offline caching, plan R26): the panel no longer owns it, because "the read
    // failed" and "the read failed and we hold a copy" are now different answers and the rule that
    // tells them apart lives in `packet-offline.ts`. The claim being defended is unchanged — a failed
    // read must never render as "there is no research" — so the assertion follows it rather than
    // being deleted. Emphasis is now capitalisation, which is this codebase's convention everywhere
    // a statement carries a warning, and survives being logged or read aloud.
    const offline = read('lib/research/packet-offline.ts');
    expect(offline).toContain('NOT the same as there being none');

    // And the panel must actually render whatever that rule produced.
    const panel = read('app/admin/jobs/[id]/JobResearchPacket.tsx');
    expect(panel).toContain('{verdict.statement}');
  });

  it('makes job_id load-bearing at last', () => {
    const route = read('app/api/admin/jobs/[id]/research-packet/route.ts');
    expect(route).toContain(".eq('job_id', jobId)");
  });

  it('is mounted on the job page AND in Work Mode', () => {
    // "Authored but not wired" is this repo's most common defect, and the acceptance is specifically
    // that a FIELD user can read the plan.
    expect(read('app/admin/jobs/[id]/page.tsx')).toContain('<JobResearchPacket jobId={jobId} />');
    expect(read('app/admin/jobs/[id]/field/page.tsx')).toContain('<JobResearchPacket jobId={jobId} />');
  });

  it('puts the packet above the captured points in Work Mode', () => {
    // It is what you read before you start, not after.
    const field = read('app/admin/jobs/[id]/field/page.tsx');
    expect(field.indexOf('JobResearchPacket')).toBeLessThan(field.indexOf('>Points<'));
  });

  it('does not colour the warn states like the approved one', () => {
    const css = read('app/admin/styles/AdminJobs.css');
    expect(css).toContain('.job-packet--warn');
    expect(css).toContain('.job-packet--ok');
    expect(css).not.toMatch(/\.job-packet--warn\s*\{[^}]*#059669/);
  });
});
