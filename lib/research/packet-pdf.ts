// lib/research/packet-pdf.ts — the packet as a single document (plan R25).
//
// The acceptance is literal: "a packet PDF opens with a table of contents, and every included
// document carries its provenance line." Both are structural here rather than decorative — the
// contents page is generated FROM the sections, so it cannot drift out of step with them, and no
// entry can be written without its provenance line because the assembler produces them together.
//
// Text-first on purpose. A packet whose value is in what it SAYS — which facts were checked, which
// questions are open, which document nobody could read — is useful in the truck on a phone. Embedded
// page images are the next increment, not this one.

import type { AssembledPacket } from './packet';

const PAGE_W = 612;   // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;
const LINE = 13;

interface Cursor { y: number; page: number }

export interface PacketPdfMeta {
  version: number;
  approvedBy?: string | null;
  approvedAt?: string | null;
  propertyAddress?: string | null;
  county?: string | null;
}

export function renderPacketPdf(packet: AssembledPacket, meta: PacketPdfMeta): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = require('jspdf') as typeof import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait' });

  const cur: Cursor = { y: MARGIN, page: 1 };

  const newPage = () => { doc.addPage(); cur.page++; cur.y = MARGIN; };
  const space = (n: number) => { if (cur.y + n > PAGE_H - MARGIN) newPage(); };

  const write = (text: string, opts: { size?: number; bold?: boolean; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const x = MARGIN + (opts.indent ?? 0);
    const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2 - (opts.indent ?? 0)) as string[];
    for (const line of lines) {
      space(LINE);
      doc.text(line, x, cur.y);
      cur.y += size <= 10 ? LINE : LINE + 4;
    }
    cur.y += opts.gap ?? 0;
  };

  // ── Cover ─────────────────────────────────────────────────────────────────
  write(packet.title, { size: 18, bold: true, gap: 6 });
  if (meta.propertyAddress) write(meta.propertyAddress, { size: 12, gap: 2 });
  if (meta.county) write(`${meta.county} County, Texas`, { size: 11, gap: 8 });

  write(
    meta.approvedBy
      ? `Version ${meta.version} — approved by ${meta.approvedBy}${meta.approvedAt ? ` on ${meta.approvedAt.slice(0, 10)}` : ''}.`
      : `Version ${meta.version} — DRAFT, not approved.`,
    { size: 10, gap: 10 },
  );

  if (packet.coverNotes) write(packet.coverNotes, { size: 10, gap: 10 });

  // Warnings go on the COVER, not in an appendix. A caveat at the back of a packet is a caveat
  // nobody reads, and these are the ones that change what a crew does.
  if (packet.warnings.length > 0) {
    write('Before you rely on this packet', { size: 12, bold: true, gap: 3 });
    for (const w of packet.warnings) write(`• ${w}`, { size: 10, indent: 10, gap: 2 });
    cur.y += 8;
  }

  // ── Contents ──────────────────────────────────────────────────────────────
  // Generated from the sections, so it cannot describe a packet different from the one printed.
  write('Contents', { size: 14, bold: true, gap: 4 });
  for (const t of packet.tableOfContents) {
    write(`${t.number}.  ${t.title}  (${t.entries} item${t.entries === 1 ? '' : 's'})`, { size: 10, indent: 10 });
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  for (const [i, section] of packet.sections.entries()) {
    newPage();
    write(`${i + 1}. ${section.title}`, { size: 14, bold: true, gap: 6 });

    for (const entry of section.entries) {
      space(LINE * 4);
      write(entry.heading, { size: 11, bold: true, gap: 1 });
      if (entry.body && entry.body !== entry.heading) write(entry.body, { size: 10, indent: 10, gap: 1 });

      // An unsupported item is marked ON the item. A reader scanning a packet does not carry a
      // caveat from the cover down to item 34.
      if (entry.unsupported) {
        write('UNVERIFIED — see the provenance line below before relying on this.', {
          size: 9, bold: true, indent: 10, gap: 1,
        });
      }

      write(entry.provenance, { size: 8.5, indent: 10, gap: 1 });
      if (entry.note) write(`Note: ${entry.note}`, { size: 9, indent: 10, gap: 1 });
      cur.y += 5;
    }
  }

  // ── Footers ───────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${packet.title} — version ${meta.version}${meta.approvedBy ? '' : ' (DRAFT)'} — page ${p} of ${total}`,
      MARGIN,
      PAGE_H - 28,
    );
  }

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
}
