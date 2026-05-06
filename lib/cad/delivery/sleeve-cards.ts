// lib/cad/delivery/sleeve-cards.ts
//
// Phase 7 §20 — field reference sleeve cards. Generates a
// laminate-friendly PDF the field crew can clip to their
// wristband or stuff in a clipboard pocket: one 3.5"×2"
// card per cluster of four codes, sized so a stack of cards
// covers the entire master code library used on the active
// job.
//
// Layout (Letter portrait, 0.5" margins, 7.5"×10" usable):
//   * 2 cards across × 5 cards down = 10 cards per page
//   * Each card is 3.5"×2" with a thin border for the
//     laminator to find the cut line
//   * Each card carries up to 4 code rows: alpha code +
//     numeric code + short description, with a small symbol
//     placeholder square on the left
//
// Pure (per the jsPDF Promise API). Returns the produced
// `Blob` so the caller can stream / download / hand to the
// browser. Throws when invoked outside a browser environment.

import jsPDF from 'jspdf';

import type { DrawingDocument, PointCodeDefinition } from '../types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface SleeveCardOptions {
  /** Page margin in inches. Default 0.5". */
  marginIn?: number;
  /** Card width in inches. Default 3.5" (credit-card width). */
  cardWidthIn?: number;
  /** Card height in inches. Default 2.0" (credit-card height). */
  cardHeightIn?: number;
  /** Codes per card. Default 4. */
  codesPerCard?: number;
  /** Page size override; default Letter. */
  pageSize?: 'LETTER' | 'TABLOID';
}

export interface SleeveCardResult {
  blob:        Blob;
  filename:    string;
  byteSize:    number;
  cardCount:   number;
  pageCount:   number;
  codesIncluded: number;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Walk the active document and return the distinct point
 * codes referenced by its features. Codes are collected from
 * `feature.properties.rawCode` which the import path stamps
 * onto every POINT feature; codes that map cleanly through
 * the supplied library are de-duped and sorted by category +
 * alphacode for a predictable card order.
 */
export function collectCodesUsed(
  doc: DrawingDocument,
  library: PointCodeDefinition[]
): PointCodeDefinition[] {
  const byAlpha = new Map<string, PointCodeDefinition>();
  for (const c of library) byAlpha.set(c.alphaCode.toUpperCase(), c);

  const usedAlphas = new Set<string>();
  for (const f of Object.values(doc.features)) {
    if (f.hidden) continue;
    const raw = f.properties?.rawCode;
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const alpha = String(raw).split(/[\s_]/)[0]?.toUpperCase() ?? '';
    if (alpha && byAlpha.has(alpha)) usedAlphas.add(alpha);
  }

  return Array.from(usedAlphas)
    .map((a) => byAlpha.get(a)!)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.alphaCode.localeCompare(b.alphaCode);
    });
}

/**
 * Render the sleeve-card PDF for the supplied codes. Pure;
 * returns a `SleeveCardResult` with the produced Blob + a
 * filename suggestion. When `codes` is empty, the PDF still
 * emits with a single "no codes used" banner so the surveyor
 * sees an explicit empty state instead of a 0-byte download.
 */
export function generateSleeveCards(
  doc: DrawingDocument,
  codes: PointCodeDefinition[],
  options: SleeveCardOptions = {}
): SleeveCardResult {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('generateSleeveCards can only run in the browser.');
  }
  const margin = options.marginIn ?? 0.5;
  const cardW = options.cardWidthIn ?? 3.5;
  const cardH = options.cardHeightIn ?? 2.0;
  const codesPerCard = Math.max(1, options.codesPerCard ?? 4);
  const pageSize = options.pageSize ?? 'LETTER';
  const pageDims = pageSize === 'TABLOID' ? [11, 17] : [8.5, 11];

  const pdf = new jsPDF({
    unit: 'in',
    format: pageDims,
    orientation: 'p',
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const cardsAcross = Math.max(1, Math.floor(usableW / cardW));
  const cardsDown = Math.max(1, Math.floor(usableH / cardH));
  const cardsPerPage = cardsAcross * cardsDown;

  pdf.setFont('helvetica');
  pdf.setLineWidth(0.005);
  pdf.setDrawColor(0, 0, 0);
  pdf.setTextColor(0, 0, 0);

  if (codes.length === 0) {
    pdf.setFontSize(12);
    pdf.text(
      'No point codes referenced in the active drawing.',
      margin,
      margin + 0.5
    );
    pdf.text(
      'Add features with codes (e.g. import field data) and re-run.',
      margin,
      margin + 0.7
    );
    const blob = pdf.output('blob');
    return {
      blob,
      filename: buildFilename(doc, 0),
      byteSize: blob.size,
      cardCount: 0,
      pageCount: 1,
      codesIncluded: 0,
    };
  }

  const totalCards = Math.ceil(codes.length / codesPerCard);
  let cardIndex = 0;
  let codeCursor = 0;
  let pageCount = 1;

  while (codeCursor < codes.length) {
    const cardOnPage = cardIndex % cardsPerPage;
    if (cardOnPage === 0 && cardIndex > 0) {
      pdf.addPage(pageDims, 'p');
      pageCount += 1;
    }
    const col = cardOnPage % cardsAcross;
    const row = Math.floor(cardOnPage / cardsAcross);
    const x = margin + col * cardW;
    // PDF y origin is top-left; cards flow down from the top
    // margin so the first row appears at the top of the page.
    const y = margin + row * cardH;

    const slice = codes.slice(codeCursor, codeCursor + codesPerCard);
    drawCard(pdf, x, y, cardW, cardH, slice, cardIndex + 1, totalCards);
    codeCursor += slice.length;
    cardIndex += 1;
  }

  const blob = pdf.output('blob');
  return {
    blob,
    filename: buildFilename(doc, totalCards),
    byteSize: blob.size,
    cardCount: totalCards,
    pageCount,
    codesIncluded: codes.length,
  };
}

/**
 * Browser-side wrapper that triggers an anchor-click download.
 * Returns the same shape as `generateSleeveCards` for caller-
 * side telemetry.
 */
export function downloadSleeveCards(
  doc: DrawingDocument,
  library: PointCodeDefinition[],
  options: SleeveCardOptions = {}
): SleeveCardResult {
  const codes = collectCodesUsed(doc, library);
  const result = generateSleeveCards(doc, codes, options);
  const url = URL.createObjectURL(result.blob);
  const a = Object.assign(globalThis.document.createElement('a'), {
    href: url,
    download: result.filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return result;
}

// ────────────────────────────────────────────────────────────
// Per-card render
// ────────────────────────────────────────────────────────────

function drawCard(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  codes: PointCodeDefinition[],
  cardIndex: number,
  totalCards: number
): void {
  // Border (the laminator's cut guide).
  pdf.rect(x, y, w, h, 'S');

  // Header strip with project + card index.
  const headerH = 0.28;
  pdf.setFontSize(7);
  pdf.text('STARR SURVEYING — FIELD CODES', x + 0.1, y + 0.13);
  pdf.text(
    `Card ${cardIndex} of ${totalCards}`,
    x + w - 0.1,
    y + 0.13,
    { align: 'right' }
  );
  pdf.setLineWidth(0.003);
  pdf.line(x, y + headerH, x + w, y + headerH);

  // Code rows fill the remaining height evenly.
  const bodyH = h - headerH;
  const rowH = bodyH / Math.max(1, codes.length);
  for (let i = 0; i < codes.length; i += 1) {
    drawCodeRow(pdf, x, y + headerH + i * rowH, w, rowH, codes[i]);
  }
}

function drawCodeRow(
  pdf: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  code: PointCodeDefinition
): void {
  // Symbol placeholder — small circle in a square slot on the
  // left. Real symbol-path rasterization lands as a follow-up
  // slice once the SVG-to-PDF helper exists.
  const slotW = 0.45;
  pdf.setLineWidth(0.003);
  pdf.rect(x + 0.05, y + 0.05, slotW - 0.1, h - 0.1, 'S');
  pdf.setLineWidth(0.005);
  pdf.circle(
    x + 0.05 + (slotW - 0.1) / 2,
    y + 0.05 + (h - 0.1) / 2,
    Math.min((slotW - 0.1) / 4, (h - 0.1) / 4),
    'S'
  );

  // Alpha + numeric code, bold + tabular.
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(code.alphaCode, x + slotW + 0.05, y + 0.18);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`(${code.numericCode})`, x + slotW + 0.05, y + 0.32);

  // Short description on the right column. Truncate so the
  // text doesn't overflow the card.
  const desc = code.simplifiedDescription || code.description;
  const truncated = truncate(desc, 36);
  pdf.setFontSize(8);
  pdf.text(truncated, x + slotW + 0.55, y + 0.22, {
    maxWidth: w - slotW - 0.6,
  });
  // Category chip under the description.
  pdf.setFontSize(6);
  pdf.setTextColor(80, 80, 80);
  pdf.text(code.category, x + slotW + 0.55, y + h - 0.1);
  pdf.setTextColor(0, 0, 0);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function buildFilename(doc: DrawingDocument, cardCount: number): string {
  const slug = kebabCase(doc.name) || 'drawing';
  const suffix = cardCount > 0 ? `-${cardCount}cards` : '';
  return `${slug}-field-cards${suffix}.pdf`;
}

function kebabCase(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}
