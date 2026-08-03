// What the packet does NOT contain, on the cover where a crew will see it.
//
// The packet lists what it has. Nothing in it could say what was ATTEMPTED AND MISSED — so a crew
// reads the source-documents section, sees eleven documents, and has no way to know a twelfth
// arrived unreadable or never arrived at all. The packet reads as complete.
//
// This is the same defect the master report had one document earlier, in the document that actually
// goes to the field. R25's own rule is that warnings go on the cover, because a caveat at the back
// is a caveat nobody reads.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assemblePacket, type PacketSources } from '@/lib/research/packet';
import { fieldBrief } from '@/lib/research/job-packet';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const sources = (over: Partial<PacketSources> = {}): PacketSources => ({
  facts: [], documents: [], conflicts: [], planSummary: null, documentLabels: {}, ...over,
});

describe('documents we could not get are named on the cover', () => {
  it('says how many and what they were', () => {
    const p = assemblePacket('Packet', null, [], sources({
      retrievalFailures: ['1974 deed (could not be read)', '1952 plat (processing failed)'],
    }));
    expect(p.warnings.join(' ')).toContain('2 document(s) could not be retrieved');
    expect(p.warnings.join(' ')).toContain('1974 deed');
    expect(p.warnings.join(' ')).toContain('1952 plat');
  });

  it('calls them errands rather than absences', () => {
    // The record may exist and be perfectly findable at the courthouse. "Not in the packet" and
    // "does not exist" are different facts and the crew acts differently on each.
    const p = assemblePacket('Packet', null, [], sources({ retrievalFailures: ['a deed'] }));
    expect(p.warnings.join(' ')).toContain('errands, not absences');
    expect(p.warnings.join(' ')).toContain('findable at the courthouse');
  });

  it('distinguishes "none failed" from "never recorded"', () => {
    // A run that never recorded them has not established that none failed, and handing the packet
    // the wrong one makes an unchecked run look checked.
    const notRecorded = assemblePacket('Packet', null, [], sources({ retrievalFailures: undefined }));
    expect(notRecorded.warnings.join(' ')).toContain('NOT recorded for this run');
    expect(notRecorded.warnings.join(' ')).toContain('possibly incomplete');

    const noneFailed = assemblePacket('Packet', null, [], sources({ retrievalFailures: [] }));
    expect(noneFailed.warnings.join(' ')).not.toContain('NOT recorded');
    expect(noneFailed.warnings.join(' ')).not.toContain('could not be retrieved');
  });
});

describe('what the closure says about our reading goes on the cover too', () => {
  it('is carried through when supplied', () => {
    // It governs whether the numbers throughout the packet can be trusted at all, so it does not
    // belong beside one fact.
    const caveat = 'The description closes to about 1 in 800 — a reading error is the more likely explanation.';
    const p = assemblePacket('Packet', null, [], sources({ readingCaveat: caveat }));
    expect(p.warnings).toContain(caveat);
  });

  it('adds nothing when there is nothing to say', () => {
    const p = assemblePacket('Packet', null, [], sources({ retrievalFailures: [], readingCaveat: null }));
    expect(p.warnings).toEqual([]);
  });
});

describe('both routes that assemble a packet supply the list', () => {
  // A draft PDF printing "not recorded" while the same packet showed the real list elsewhere would
  // be worse than either — the crew would not know which document to believe.
  const packetsRoute = read('app/api/admin/research/[projectId]/packets/route.ts');
  const pdfRoute = read('app/api/admin/research/[projectId]/packets/[packetId]/pdf/route.ts');

  it('the packets route builds it from unusable documents', () => {
    expect(packetsRoute).toContain("d.processing_status === 'unreadable'");
    expect(packetsRoute).toContain('retrievalFailures: unusable');
  });

  it('the live-assembly PDF path builds it too', () => {
    expect(pdfRoute).toContain('retrievalFailures: documents');
  });

  it('both pass [] rather than undefined, because the query DID run', () => {
    // `[]` says "established none"; undefined says "not checked". The query ran, so it is the first.
    expect(packetsRoute).toContain('this query DID run');
  });
});

describe('an old approved packet does not claim it is clean', () => {
  // `fieldBrief` did `r.warnings ?? []`, so a packet approved before cover warnings existed rendered
  // as "no warnings" — the same claim a genuinely clean packet makes. Opposite facts: one means
  // nothing to worry about, the other means nobody looked. This is the crew view, on a phone, in a
  // truck.
  //
  // The snapshot is NOT rewritten to add the field. Approval is a signature on what the packet said,
  // and back-filling it would forge that signature.
  const packetRow = (rendered: unknown) => ({
    id: 'pk1', research_project_id: 'p1', title: 'Packet', status: 'approved',
    rendered_json: rendered,
  } as unknown as Parameters<typeof fieldBrief>[0]);

  it('reports unknown when the snapshot has no warnings key', () => {
    const b = fieldBrief(packetRow({ title: 'Packet', sections: [], itemCount: 0 }))!;
    expect(b.warningsUnknown).toBe(true);
    expect(b.warnings).toEqual([]);
  });

  it('treats a recorded empty list as an ANSWER, not as unknown', () => {
    const b = fieldBrief(packetRow({ title: 'Packet', warnings: [], sections: [], itemCount: 0 }))!;
    expect(b.warningsUnknown).toBe(false);
  });

  it('carries real warnings through unchanged', () => {
    const b = fieldBrief(packetRow({
      title: 'Packet', warnings: ['2 document(s) could not be retrieved'], sections: [], itemCount: 0,
    }))!;
    expect(b.warningsUnknown).toBe(false);
    expect(b.warnings).toEqual(['2 document(s) could not be retrieved']);
  });

  it('the crew view says so rather than showing an empty warning list', () => {
    const cmp = read('app/admin/jobs/[id]/JobResearchPacket.tsx');
    expect(cmp).toContain('data.brief.warningsUnknown');
    expect(cmp).toContain('not the\n                same as it having none');
  });
});
