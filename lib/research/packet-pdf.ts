// lib/research/packet-pdf.ts — the packet as a single document (plan R25).
//
// The acceptance is literal: "a packet PDF opens with a table of contents, and every included
// document carries its provenance line." Both are structural here rather than decorative — the
// contents page is generated FROM the sections, so it cannot drift out of step with them, and no
// entry can be written without its provenance line because the assembler produces them together.
//
// Text-first by design, and still is: the plan, the open questions and the facts come first and read
// on a phone. Page images are now embedded AFTER that text (plan R25), because a packet that names
// the governing plat and cannot show it sends a crew to the field with an instrument number.
//
// ── AN ABSENT IMAGE IS A STATEMENT, NOT A BLANK ─────────────────────────────────────────────────
//
// The failure this guards against is the same one R15 found one layer up. A document entry printed
// with no image looks identical whether the image was never fetched, could not be read, or simply
// was not requested for this render. A crew flipping to "Source documents" expecting a plat and
// finding a paragraph needs to know which — because "we never pulled it" is an errand and "the page
// is unreadable" is a trip to the courthouse.
//
// So `PacketImage` carries a `status`, every document entry prints one, and there is no code path
// that prints a document entry with silence where an image would be.

import type { AssembledPacket } from './packet';

/** Why a document entry has no page image, when it has none.
 *
 *  `not_requested` exists so a text-only render — the phone-in-a-truck case, and the default when a
 *  caller passes no images at all — does not accuse the research of failing to fetch anything. */
export type PacketImageStatus = 'embedded' | 'not_attached' | 'fetch_failed' | 'unreadable' | 'not_requested';

export interface PacketImage {
  status: PacketImageStatus;
  /** `data:image/png;base64,…`. Required when status is 'embedded'. */
  dataUrl?: string;
  /** Natural pixel size, used to fit the page without distorting the document. */
  width?: number;
  height?: number;
  /** Which page of a multi-page document this is, when known. */
  pageNumber?: number;
  /** Total pages held, so the PDF can say "page 1 of 4 shown". */
  pageCount?: number;
  /** Free text shown beneath the image — the reason, when there is no image. */
  detail?: string;
}

const IMAGE_STATEMENT: Record<PacketImageStatus, string> = {
  embedded: '',
  not_attached:
    'NO PAGE IMAGE IS HELD for this document — the record was found in the index but its pages were never retrieved.',
  fetch_failed:
    'The page image for this document COULD NOT BE LOADED when this packet was printed. It may exist; this print does not contain it.',
  unreadable:
    'The page image for this document was retrieved but COULD NOT BE READ — its contents are not reflected anywhere in this packet.',
  not_requested:
    'Page images were not included in this print. This is a text-only packet; the document itself is in the research record.',
};

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

export function renderPacketPdf(
  packet: AssembledPacket,
  meta: PacketPdfMeta,
  /** Page images by document refId. Absent entirely means a text-only print, which is a legitimate
   *  choice and is stated as one rather than reported as missing images. */
  images?: Record<string, PacketImage>,
): Buffer {
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

  /** Embed a document's page image, or say why there isn't one.
   *
   *  Never throws. A malformed image must not lose the rest of the packet — the text is the part a
   *  crew relies on, and failing the whole render over one bad PNG would take the plan and the open
   *  questions with it. A failure here becomes the same stated absence as any other. */
  const drawImage = (img: PacketImage | undefined) => {
    const image = img ?? { status: 'not_requested' as const };

    if (image.status !== 'embedded' || !image.dataUrl) {
      write(IMAGE_STATEMENT[image.status], { size: 9, bold: image.status !== 'not_requested', indent: 10, gap: 3 });
      if (image.detail) write(image.detail, { size: 8.5, indent: 10, gap: 3 });
      return;
    }

    // Fit inside the text column, preserving aspect. A stretched plat is a plat with the wrong
    // proportions on it, and somebody will scale off it.
    const maxW = PAGE_W - MARGIN * 2 - 10;
    const maxH = PAGE_H - MARGIN * 2 - 40;
    const natW = image.width && image.width > 0 ? image.width : maxW;
    const natH = image.height && image.height > 0 ? image.height : maxH;
    const scale = Math.min(maxW / natW, maxH / natH, 1);
    const w = Math.max(1, natW * scale);
    const h = Math.max(1, natH * scale);

    // A page image that would be split across a page break is unreadable, so it starts a fresh page.
    if (cur.y + h + LINE * 2 > PAGE_H - MARGIN) newPage();

    try {
      const format = /^data:image\/jpe?g/i.test(image.dataUrl) ? 'JPEG' : 'PNG';
      doc.addImage(image.dataUrl, format, MARGIN + 10, cur.y, w, h);
      cur.y += h + 4;
    } catch {
      write(IMAGE_STATEMENT.fetch_failed, { size: 9, bold: true, indent: 10, gap: 3 });
      return;
    }

    // Say how much of the document is actually shown. A single embedded page of a four-page deed
    // reads as the whole deed unless it says otherwise, and the pages not shown are exactly where a
    // reservation or an exception tends to be.
    if (image.pageCount && image.pageCount > 1) {
      write(
        `Page ${image.pageNumber ?? 1} of ${image.pageCount} shown. The remaining ${image.pageCount - 1} page(s) ` +
          `are in the research record and are NOT reproduced here.`,
        { size: 8.5, indent: 10, gap: 4 },
      );
    } else {
      cur.y += 4;
    }
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

      // A document entry always says something about its page image — including that there isn't
      // one, and why. Silence here is indistinguishable from "we have it, it just isn't shown".
      if (section.kind === 'document' || section.kind === 'drawing' || section.kind === 'imagery') {
        drawImage(images?.[entry.refId]);
      }

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
