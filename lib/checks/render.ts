// lib/checks/render.ts — draws laid-out checks into one PDF, one sheet per check.
//
// The geometry is decided in layout.ts (pure, tested); this file only paints it. Built-in Helvetica,
// like lib/payments/receipt-pdf.ts, so no font bytes ship — except the MICR font for blank stock, which
// the firm supplies at public/fonts/micr-e13b.ttf (see layout.ts for why).

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { layoutCheck, PAGE, type CheckBank, type CheckDoc } from './layout';

export const MICR_FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'micr-e13b.ttf');

export function micrFontAvailable(): boolean {
  try { return fs.statSync(MICR_FONT_PATH).isFile(); } catch { return false; }
}

export interface RenderOptions {
  /** Watermark every sheet — for a reprint of a number already printed. Never negotiable. */
  copyWatermark?: boolean;
  /** An alignment test on plain paper: boxes where each field lands, no real numbers. */
  alignmentTest?: boolean;
}

export async function renderChecksPdf(docs: readonly CheckDoc[], bank: CheckBank, opts: RenderOptions = {}): Promise<Buffer> {
  if (bank.stock === 'blank_micr' && !micrFontAvailable()) {
    throw new Error('Blank check stock needs an E-13B MICR font at public/fonts/micr-e13b.ttf. Use pre-printed checks, or add the font.');
  }
  const pdf = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, autoFirstPage: false, info: { Title: 'Payroll checks', Author: bank.payer_name } });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { pdf.on('end', () => resolve(Buffer.concat(chunks))); pdf.on('error', reject); });
  if (bank.stock === 'blank_micr') pdf.registerFont('MICR', MICR_FONT_PATH);

  for (const doc of docs) {
    pdf.addPage({ size: [PAGE.width, PAGE.height], margin: 0 });
    for (const op of layoutCheck(doc, bank)) {
      if (op.t === 'line') {
        pdf.save().lineWidth(0.6).strokeColor('#000');
        if (op.dash) pdf.dash(3, { space: 3 });
        pdf.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).stroke();
        pdf.undash().restore();
        continue;
      }
      pdf.font(op.font === 'micr' ? 'MICR' : op.font === 'bold' ? 'Helvetica-Bold' : 'Helvetica').fontSize(op.size).fillColor('#000');
      // PDF text is drawn from its top-left; layout y is the baseline, so lift by the ascent.
      const y = op.y - op.size * 0.8;
      if (op.align === 'right') {
        const w = op.width ?? 200;
        pdf.text(op.text, op.x - w, y, { width: w, align: 'right', lineBreak: false });
      } else {
        pdf.text(op.text, op.x, y, { lineBreak: false });
      }
    }
    if (opts.copyWatermark || opts.alignmentTest) {
      pdf.save().rotate(-20, { origin: [PAGE.width / 2, 130] }).font('Helvetica-Bold').fontSize(40).fillColor('#c00', 0.25)
        .text(opts.alignmentTest ? 'ALIGNMENT TEST — NOT A CHECK' : 'COPY — NOT NEGOTIABLE', 40, 110, { width: PAGE.width - 80, align: 'center' })
        .restore();
    }
  }
  pdf.end();
  return done;
}
