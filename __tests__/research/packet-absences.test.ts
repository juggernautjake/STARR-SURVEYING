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
    // Line endings normalised. The literal carries a bare `\n` and the working tree is CRLF, so
    // this could only pass on the machine that wrote it. Eighth instance of this trap in the repo
    // today across three shapes — silent negative controls, a source-slice that swallowed a whole
    // file, and exact-match assertions like this one.
    expect(cmp.replace(/\r\n/g, '\n')).toContain('not the\n                same as it having none');
  });
});

describe('every PacketSources field has something that supplies it', () => {
  // `readingCaveat` shipped two slices ago with a renderer, a test, and NO PRODUCER — nothing built
  // it, so the cover line could never appear. That is the mirror image of the defect this session
  // has been chasing: not a producer with no consumer, but a consumer with nothing feeding it. It
  // passes every unit test, because the test supplies the field itself.
  //
  // The only thing that catches it is comparing the shape to the routes that build it.
  const packetSrc = read('lib/research/packet.ts');
  const routes = [
    'app/api/admin/research/[projectId]/packets/route.ts',
    'app/api/admin/research/[projectId]/packets/[packetId]/pdf/route.ts',
  ].map(read).join('\n');

  /** Field names declared on the PacketSources interface. */
  const declared = (() => {
    const start = packetSrc.indexOf('export interface PacketSources {');
    const end = packetSrc.indexOf('\n}', start);
    const body = packetSrc.slice(start, end);
    return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]!);
  })();

  it('finds the interface', () => {
    // A scan matching nothing would pass forever — the failure mode two other checks in this repo
    // had before they were fixed.
    expect(declared.length).toBeGreaterThanOrEqual(6);
    expect(declared).toContain('readingCaveat');
  });

  it('at least one route supplies each one', () => {
    // `\\b`, not `\b`. In a template literal `\b` is a BACKSPACE character, so the pattern became
    // /[backspace]facts[backspace]/ and matched nothing — the check reported every field as
    // unsupplied. It failed loudly here, which was luck: with the polarity reversed the same
    // mistake passes silently forever, which is how the other two checks in this repo were broken
    // when first written.
    // Matched as a PROPERTY (`field:` or shorthand `field,`), not merely as a name appearing
    // somewhere. Verified by deleting `readingCaveat,` from the returned object: the first version
    // still passed, because the local `const readingCaveat = …` above it kept the word present. A
    // check that a name is mentioned is not a check that a value is supplied.
    const missing = declared.filter((f) => !new RegExp(`(^|[\\s{,])${f}\\s*[,:]`, 'm').test(routes));
    expect(missing, missing.length
      ? `PacketSources declares these and no route builds them, so the packet can never show them:\n` +
        `  ${missing.join('\n  ')}`
      : '').toEqual([]);
  });

  it('readingCaveat is built from the plan\'s own closure check', () => {
    expect(routes).toContain('closure_check');
    expect(routes).toContain('readingCaveat');
  });

  it('fires only when the closure is NOT acceptable', () => {
    // Cover warnings that fire on healthy runs are how a crew learns to skip the cover.
    expect(routes).toContain('cc.acceptable === false');
  });
});
