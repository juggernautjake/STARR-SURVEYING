// app/api/admin/equipment/[id]/qr-sticker/route.ts
//
// GET /api/admin/equipment/{id}/qr-sticker
//
// Single-row QR sticker PDF (Phase F10.1f). Sized for the §15
// prereq #26 default (Brother DK-1201 weatherproof labels —
// 2.4" × 1.1") so the Equipment Manager can print one and stick
// it on the case immediately after creating a row.
//
// Layout (left → right on a 173pt × 79pt label at 72 dpi):
//   * QR code: ~60pt square on the left, with a 6pt margin
//   * Text block: name, category, serial/model, qr_code_id
//
// The QR encodes the equipment_inventory.qr_code_id so the F10.1j
// mobile scanner can resolve it via /api/admin/equipment?qr=…
// (lands as F10.1i resolver). Encoding the id directly (not a
// URL) keeps the QR small + makes the scanner-to-resolver mapping
// explicit.
//
// Auth: admin / developer / equipment_manager. Returns
// application/pdf with Content-Disposition attachment so browser
// triggers a download named "<name>_QR_<qr_code_id>.pdf".

import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// Brother DK-1201 dimensions in PDF points (1pt = 1/72 inch).
//   2.4" × 1.1"  =  173pt × 79pt
const LABEL_WIDTH_PT = 2.4 * 72;
const LABEL_HEIGHT_PT = 1.1 * 72;
const MARGIN_PT = 6;
const QR_SIZE_PT = LABEL_HEIGHT_PT - 2 * MARGIN_PT; // square fills label height

interface EquipmentRow {
  id: string;
  name: string | null;
  category: string | null;
  qr_code_id: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
}

export const GET = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('tech_support') &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    // Path: /api/admin/equipment/[id]/qr-sticker — id is at -2.
    const id = pathSegments[pathSegments.length - 2];
    if (
      !id ||
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        id
      )
    ) {
      return NextResponse.json(
        { error: 'id must be a UUID' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('equipment_inventory')
      .select(
        'id, name, category, qr_code_id, brand, model, serial_number'
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[admin/equipment/:id/qr-sticker] read failed', {
        id,
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Equipment row not found' },
        { status: 404 }
      );
    }

    const row = data as EquipmentRow;
    if (!row.qr_code_id) {
      return NextResponse.json(
        {
          error:
            'Row has no qr_code_id; edit the unit + assign one before printing.',
        },
        { status: 422 }
      );
    }

    // Render the QR code to a PNG buffer. Margin 0 because the PDF
    // already adds whitespace around the placement.
    const qrPng = await QRCode.toBuffer(row.qr_code_id, {
      type: 'png',
      margin: 0,
      errorCorrectionLevel: 'M',
      // Render at 4× the target size in pixels so embedding into PDF
      // keeps crisp edges when the label is printed at 300dpi.
      width: Math.ceil(QR_SIZE_PT * 4),
    });

    // Build the PDF in-memory. Single-page label at the exact
    // Brother DK-1201 dimensions; the printer driver scales 0%
    // (1:1) so the QR + text land precisely where the layout
    // calls.
    const doc = new PDFDocument({
      size: [LABEL_WIDTH_PT, LABEL_HEIGHT_PT],
      margin: 0,
      info: {
        Title: `Equipment QR — ${row.name ?? row.qr_code_id}`,
        Author: 'Starr Surveying',
        Subject: `equipment_inventory.id=${row.id}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // QR — left-aligned, vertically centered.
    const qrX = MARGIN_PT;
    const qrY = (LABEL_HEIGHT_PT - QR_SIZE_PT) / 2;
    doc.image(qrPng, qrX, qrY, { width: QR_SIZE_PT, height: QR_SIZE_PT });

    // Text block — right of the QR with a 6pt gap.
    const textX = qrX + QR_SIZE_PT + MARGIN_PT;
    const textWidth = LABEL_WIDTH_PT - textX - MARGIN_PT;
    let cursorY = MARGIN_PT;

    const drawLine = (
      text: string,
      opts: { fontSize: number; bold?: boolean; muted?: boolean }
    ) => {
      const fontName = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(fontName).fontSize(opts.fontSize);
      if (opts.muted) doc.fillColor('#6B7280');
      else doc.fillColor('#0F172A');
      doc.text(text, textX, cursorY, {
        width: textWidth,
        ellipsis: true,
        lineBreak: false,
      });
      cursorY += opts.fontSize + 2;
    };

    drawLine(row.name ?? '(unnamed unit)', { fontSize: 9, bold: true });
    if (row.category) {
      drawLine(formatCategory(row.category), {
        fontSize: 7,
        muted: true,
      });
    }
    const detailLine = [row.brand, row.model, row.serial_number]
      .filter((v): v is string => !!v && !!v.trim())
      .join(' · ');
    if (detailLine) {
      drawLine(detailLine, { fontSize: 7, muted: true });
    }
    drawLine(row.qr_code_id, { fontSize: 8, bold: true });

    doc.end();
    const pdfBuffer = await pdfPromise;

    // Convert Node Buffer → Uint8Array for the BodyInit type.
    const bytes = new Uint8Array(pdfBuffer);

    const safeName = (row.name ?? row.qr_code_id)
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 60);
    const filename = `${safeName}_QR_${row.qr_code_id}.pdf`;

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { routeName: 'admin/equipment/:id/qr-sticker' }
);

function formatCategory(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
