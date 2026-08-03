// The deliverable, assembled with its provenance (research plan R25).
//
// Everything the research produces was scattered — facts in `extracted_data_points`, conflicts in
// `discrepancies`, the gameplan in `research_survey_plans`, documents and their markup elsewhere.
// Nothing said "these, in this order, are what we are handing the crew", so what the crew received
// was whatever the screens happened to show that day, and nobody could reproduce it afterwards.
//
// The acceptance is literal: "a packet PDF opens with a table of contents, and every included
// document carries its provenance line." That line is where the last eight slices land — whether a
// person CHECKED the fact (R23), whether there is a source to open (R17), what the extraction had
// originally said before it was corrected.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SECTION_ORDER,
  assemblePacket,
  canApprove,
  documentProvenance,
  factProvenance,
  type PacketItemRef,
  type PacketSources,
} from '@/lib/research/packet';
import { renderPacketPdf } from '@/lib/research/packet-pdf';
import type { Discrepancy, ExtractedDataPoint, ResearchDocument } from '@/types/research';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const fact = (over: Partial<ExtractedDataPoint> = {}): ExtractedDataPoint => ({
  id: 'f1',
  research_project_id: 'p1',
  document_id: 'd1',
  data_category: 'distance',
  raw_value: '210.5 feet',
  display_value: '210.5 ft',
  created_at: '', updated_at: '',
  ...over,
} as ExtractedDataPoint);

const document = (over: Partial<ResearchDocument> = {}): ResearchDocument => ({
  id: 'd1',
  research_project_id: 'p1',
  source_type: 'property_search',
  processing_status: 'extracted',
  created_at: '', updated_at: '',
  document_label: '1968 warranty deed',
  ...over,
} as ResearchDocument);

const conflict = (over: Partial<Discrepancy> = {}): Discrepancy => ({
  id: 'c1',
  research_project_id: 'p1',
  severity: 'discrepancy',
  title: 'Distance mismatch',
  description: 'Deed 210.5, plat 210.0',
  data_point_ids: [], document_ids: [],
  affects_boundary: true, affects_area: false, affects_closure: false,
  resolution_status: 'open',
  created_at: '', updated_at: '',
  ...over,
} as Discrepancy);

const sources = (over: Partial<PacketSources> = {}): PacketSources => ({
  facts: [fact()],
  documents: [document()],
  conflicts: [conflict()],
  documentLabels: { d1: 'the 1968 deed' },
  ...over,
});

const ref = (kind: PacketItemRef['kind'], refId: string, order = 0): PacketItemRef => ({ kind, refId, order });

describe('the provenance line answers three separate questions', () => {
  it('says plainly when nobody has checked a fact', () => {
    // Collapsing "checked" and "has a source" into one sentence is what makes a packet lie.
    const p = factProvenance(fact(), { d1: 'the 1968 deed' });
    expect(p).toContain('the 1968 deed');
    expect(p).toContain('NOT CHECKED by anybody');
  });

  it('prints what the extraction originally said, on a corrected fact', () => {
    const p = factProvenance(
      fact({ review_status: 'corrected', corrected_value: '210.8 ft', reviewed_by: 'rpls@x' }),
      { d1: 'the 1968 deed' },
    );
    expect(p).toContain('corrected by rpls@x');
    expect(p).toContain('the extraction read "210.5 ft"');
  });

  it('says when a fact came from the model with no source at all', () => {
    const p = factProvenance(fact({ document_id: '' }));
    expect(p).toContain('this came from the model');
  });

  it('prints a rejected fact as rejected rather than hiding it', () => {
    expect(factProvenance(fact({ review_status: 'rejected' }))).toContain('REJECTED');
  });

  it('shouts about a document nobody could read', () => {
    // The single most important thing to print about it — the packet would otherwise imply its
    // contents were considered.
    const p = documentProvenance(document({ readability: 'unreadable' }));
    expect(p).toContain('COULD NOT BE READ');
    expect(p).toContain('not reflected anywhere in this packet');
  });

  it('warns that thin text means unconfirmed, not absent', () => {
    expect(documentProvenance(document({ readability: 'partial' })))
      .toContain('unconfirmed rather than absent');
  });
});

describe('assembly', () => {
  it('puts the plan and the open questions before the facts', () => {
    // A crew reads the front of a packet in the truck and the back of it never; putting the open
    // questions behind fifty facts is how they get missed.
    expect(SECTION_ORDER.indexOf('plan')).toBeLessThan(SECTION_ORDER.indexOf('fact'));
    expect(SECTION_ORDER.indexOf('conflict')).toBeLessThan(SECTION_ORDER.indexOf('fact'));
  });

  it('builds the contents FROM the sections so they cannot disagree', () => {
    const p = assemblePacket('Packet', null, [ref('fact', 'f1'), ref('document', 'd1')], sources());
    expect(p.tableOfContents.map(t => t.title)).toEqual(p.sections.map(s => s.title));
    expect(p.tableOfContents.reduce((n, t) => n + t.entries, 0)).toBe(p.itemCount);
  });

  it('warns about a reference that no longer exists rather than dropping it silently', () => {
    // A packet quietly one item shorter than what was approved is the failure this table prevents.
    const p = assemblePacket('Packet', null, [ref('fact', 'gone')], sources());
    expect(p.itemCount).toBe(0);
    expect(p.warnings.join(' ')).toContain('no longer exists');
  });

  it('counts unverified items and says they must not be relied on', () => {
    const p = assemblePacket('Packet', null, [ref('fact', 'f1')], sources());
    expect(p.warnings.join(' ')).toContain('must not be relied on as readings');
  });

  it('states a conflict as a question with a field check, not a verdict', () => {
    const sourced = conflict({ document_ids: ['d1', 'd2'], data_point_ids: ['f1', 'f2'] });
    const p = assemblePacket('Packet', null, [ref('conflict', 'c1')], sources({ conflicts: [sourced] }));
    const entry = p.sections[0]!.entries[0]!;
    expect(entry.heading).toMatch(/^Which controls .*\?$/);
    expect(entry.body.length).toBeGreaterThan(0);
    // The field check names what would settle it; it never picks a winner (R20).
    expect(entry.body).not.toMatch(/the (?:deed|plat) (?:controls|wins)/i);
  });

  it('prints an unsourced conflict as a claim rather than a finding', () => {
    const p = assemblePacket('Packet', null, [ref('conflict', 'c1')], sources());
    expect(p.sections[0]!.entries[0]!.provenance).toContain('a claim, not a finding');
    expect(p.sections[0]!.entries[0]!.unsupported).toBe(true);
  });

  it('respects the order a surveyor put items in', () => {
    const p = assemblePacket('Packet', null, [
      ref('fact', 'f2', 1), ref('fact', 'f1', 0),
    ], sources({ facts: [fact(), fact({ id: 'f2', display_value: '90.0 ft' })] }));
    expect(p.sections[0]!.entries.map(e => e.refId)).toEqual(['f1', 'f2']);
  });

  it('uses the corrected value in the heading, not the original', () => {
    const p = assemblePacket('Packet', null, [ref('fact', 'f1')], sources({
      facts: [fact({ review_status: 'corrected', corrected_value: '210.8 ft' })],
    }));
    expect(p.sections[0]!.entries[0]!.heading).toContain('210.8 ft');
  });
});

describe('approval', () => {
  it('refuses an empty packet', () => {
    const p = assemblePacket('Packet', null, [], sources());
    expect(canApprove(p).canApprove).toBe(false);
    expect(canApprove(p).reason).toContain('nothing in it');
  });

  it('allows unverified items but names how many', () => {
    // A surveyor is entitled to include an unverified lead as long as it is labelled; refusing would
    // push people to leave it out of the packet entirely, which is worse.
    const p = assemblePacket('Packet', null, [ref('fact', 'f1')], sources());
    const c = canApprove(p);
    expect(c.canApprove).toBe(true);
    expect(c.reason).toContain('1 of which are unverified');
  });
});

describe('the storage contract', () => {
  const seed = read('seeds/536_research_packets.sql');

  it('stores references, not copies of the facts', () => {
    // A packet that copied its facts would disagree with a corrected value the moment somebody
    // fixed one — and the packet is what a boundary gets staked from.
    expect(seed).toContain('contents            JSONB');
    expect(seed).toContain('ids and ordering, not duplicated fact text');
  });

  it('will not let a row claim approval without a name, a time and a snapshot', () => {
    expect(seed).toMatch(/CHECK \(status <> 'approved' OR \(approved_by IS NOT NULL AND approved_at IS NOT NULL AND rendered_json IS NOT NULL\)\)/);
  });

  it('refuses to edit an approved packet', () => {
    // A mutable approved flag lets somebody approve a packet and then change what they approved.
    const route = read('app/api/admin/research/[projectId]/packets/route.ts');
    expect(route).toContain('already approved');
    expect(route).toContain('Create a new version');
  });

  it('supersedes rather than deletes the previous approved packet', () => {
    const route = read('app/api/admin/research/[projectId]/packets/route.ts');
    expect(route).toContain("status: 'superseded'");
    expect(route).not.toMatch(/from\('research_packets'\)[\s\S]{0,120}\.delete\(/);
  });

  it('does not report a failed read as "no packets"', () => {
    const route = read('app/api/admin/research/[projectId]/packets/route.ts');
    expect(route).toContain('not the same as none existing');
  });
});

describe('the PDF', () => {
  const built = assemblePacket(
    'Survey research packet',
    'Gate is locked — call the owner.',
    [ref('conflict', 'c1', 0), ref('fact', 'f1', 0), ref('document', 'd1', 0)],
    sources(),
  );

  it('renders a real PDF', () => {
    const buf = renderPacketPdf(built, { version: 1, propertyAddress: '123 FM 436', county: 'Bell' });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('says DRAFT on an unapproved packet', () => {
    // A draft and an approved packet must never be confusable in a truck.
    const src = read('lib/research/packet-pdf.ts');
    expect(src).toContain('DRAFT, not approved');
    expect(src).toContain("' (DRAFT)'");
  });

  it('puts the warnings on the cover, not in an appendix', () => {
    // A caveat at the back of a packet is a caveat nobody reads.
    const src = read('lib/research/packet-pdf.ts');
    expect(src).toContain('Before you rely on this packet');
    expect(src.indexOf('Before you rely on this packet')).toBeLessThan(src.indexOf("write('Contents'"));
  });

  it('marks an unverified item on the item itself', () => {
    // A reader scanning a packet does not carry a caveat from the cover down to item 34.
    expect(read('lib/research/packet-pdf.ts')).toContain('UNVERIFIED — see the provenance line');
  });

  it('renders an approved packet from its snapshot, not from live data', () => {
    // What was approved must stay what was approved, even after a fact is corrected.
    const route = read('app/api/admin/research/[projectId]/packets/[packetId]/pdf/route.ts');
    expect(route).toContain("row.status === 'approved' && row.rendered_json");
  });
});

describe('page images in the PDF (plan R25)', () => {
  const built = assemblePacket(
    'Survey research packet',
    null,
    [ref('document', 'd1', 0)],
    sources(),
  );

  // A 1x1 PNG. Small enough to keep the test fast, real enough for jsPDF to accept.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('embeds an image when one is supplied', () => {
    const withImage = renderPacketPdf(built, { version: 1 }, {
      d1: { status: 'embedded', dataUrl: PNG, width: 100, height: 100 },
    });
    const without = renderPacketPdf(built, { version: 1 });
    // The embedded bytes have to land somewhere.
    expect(withImage.length).toBeGreaterThan(without.length);
    expect(withImage.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('does not throw when the image data is malformed', () => {
    // Losing the plan and the open questions over one bad PNG would be the worse failure by far.
    expect(() =>
      renderPacketPdf(built, { version: 1 }, { d1: { status: 'embedded', dataUrl: 'data:image/png;base64,!!!!' } }),
    ).not.toThrow();
  });

  it('states every kind of absence rather than printing silence', () => {
    // A blank where an image should be is indistinguishable from "we have it, it just is not shown".
    const src = read('lib/research/packet-pdf.ts');
    expect(src).toContain('NO PAGE IMAGE IS HELD');
    expect(src).toContain('COULD NOT BE LOADED');
    expect(src).toContain('COULD NOT BE READ');
    expect(src).toContain('Page images were not included in this print');
  });

  it('says how many pages of a multi-page document are shown', () => {
    // One embedded page of a four-page deed reads as the whole deed otherwise — and the pages not
    // shown are exactly where a reservation or an exception tends to be.
    const src = read('lib/research/packet-pdf.ts');
    expect(src).toContain('are in the research record and are NOT reproduced here');
  });

  it('renders text-only without accusing the research of losing anything', () => {
    const buf = renderPacketPdf(built, { version: 1 });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const src = read('lib/research/packet-pdf.ts');
    expect(src).toContain('This is a text-only packet');
  });
});
