// app/api/admin/equipment/qr-stickers/route.ts
//
// POST /api/admin/equipment/qr-stickers
//
// Bulk QR sticker PDF (Phase F10.1g-i). Returns a multi-page PDF
// where each page is a single Brother DK-1201 label (2.4" × 1.1"),
// matching the F10.1f single-row layout exactly. Equipment Manager
// uses this for batch printing — filling tomorrow's reservations
// or labeling a fresh shipment of consumables in one print job.
//
// Body (one of):
//   { ids: string[] }   — explicit list (typically from
//                         catalogue checkbox selection). Hard cap
//                         200 rows per call so a misclick can't
//                         spool 5000 stickers.
//   { filter: { status?, category?, item_kind?, include_retired? } }
//                       — same filter shape as the GET catalogue
//                         endpoint. Caps at 200 results.
//
// At least one of ids / filter must be supplied. Rows with no
// qr_code_id are silently skipped (and counted in a JSON
// fallback header — see "Note" below); rows where the qr_code_id
// IS present always print.
//
// Auth: admin / developer / equipment_manager (NOT tech_support
// — they don't print labels).
//
// Note on errors: the response IS the PDF; if validation fails
// we return JSON 4xx instead. The success path bakes a
// "X-Stickers-Skipped" response header carrying the count of
// rows we filtered out for missing qr_code_id, so the caller
// can show "Printed 47 stickers (3 rows skipped — assign QR
// codes via Edit)."

import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const LABEL_WIDTH_PT = 2.4 * 72;
const LABEL_HEIGHT_PT = 1.1 * 72;
const MARGIN_PT = 6;
const QR_SIZE_PT = LABEL_HEIGHT_PT - 2 * MARGIN_PT;

const MAX_ROWS = 200;

const ALLOWED_STATUSES = new Set([
  'available',
  'in_use',
  'maintenance',
  'loaned_out',
  'lost',
  'retired',
]);
const ALLOWED_ITEM_KINDS = new Set(['durable', 'consumable', 'kit']);

interface EquipmentRow {
  id: string;
  name: string | null;
  category: string | null;
  qr_code_id: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
}

const SELECT_COLUMNS =
  'id, name, category, qr_code_id, brand, model, serial_number';

interface BulkBody {
  ids?: unknown;
  filter?: {
    status?: unknown;
    category?: unknown;
    item_kind?: unknown;
    include_retired?: unknown;
  };
}

export const POST = withErrorHandler(
  async (req: NextRequest) => {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userRoles = (session.user as { roles?: string[] } | undefined)
      ?.roles ?? [];
    if (
      !isAdmin(session.user.roles) &&
      !userRoles.includes('equipment_manager')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: BulkBody;
    try {
      body = (await req.json()) as BulkBody;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Pick exactly ONE of ids / filter — supplying both is
    // ambiguous (which wins?). Reject early.
    const hasIds = Array.isArray(body.ids);
    const hasFilter = !!body.filter;
    if (!hasIds && !hasFilter) {
      return NextResponse.json(
        { error: 'Body must include either `ids: string[]` or `filter: {…}`' },
        { status: 400 }
      );
    }
    if (hasIds && hasFilter) {
      return NextResponse.json(
        { error: 'Supply ids OR filter, not both' },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('equipment_inventory')
      .select(SELECT_COLUMNS)
      .order('name', { ascending: true })
      .limit(MAX_ROWS);

    if (hasIds) {
      const ids = (body.ids as unknown[])
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        return NextResponse.json(
          { error: 'ids array is empty' },
          { status: 400 }
        );
      }
      if (ids.length > MAX_ROWS) {
        return NextResponse.json(
          {
            error: `Too many ids (${ids.length}). Max ${MAX_ROWS} per call — print in batches.`,
          },
          { status: 400 }
        );
      }
      // UUID guard each id so a malformed request doesn't poison
      // the IN clause.
      const uuidRe =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      const bad = ids.find((id) => !uuidRe.test(id));
      if (bad) {
        return NextResponse.json(
          { error: `id "${bad}" is not a UUID` },
          { status: 400 }
        );
      }
      query = query.in('id', ids);
    } else {
      const f = body.filter ?? {};
      const includeRetired =
        typeof f.include_retired === 'boolean'
          ? f.include_retired
          : f.include_retired === '1' || f.include_retired === 'true';
      if (!includeRetired) {
        query = query.is('retired_at', null);
      }
      if (
        typeof f.status === 'string' &&
        ALLOWED_STATUSES.has(f.status)
      ) {
        query = query.eq('current_status', f.status);
      }
      if (typeof f.category === 'string' && f.category.trim()) {
        query = query.eq('category', f.category.trim());
      }
      if (
        typeof f.item_kind === 'string' &&
        ALLOWED_ITEM_KINDS.has(f.item_kind)
      ) {
        query = query.eq('item_kind', f.item_kind);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('[admin/equipment/qr-stickers] read failed', {
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const allRows = (data ?? []) as EquipmentRow[];
    const printable = allRows.filter((r) => !!r.qr_code_id);
    const skipped = allRows.length - printable.length;

    if (printable.length === 0) {
      return NextResponse.json(
        {
          error:
            'No printable rows — every match either has no qr_code_id or no match was found. Edit rows to assign QR codes first.',
          rows_matched: allRows.length,
          rows_skipped_no_qr: skipped,
        },
        { status: 422 }
      );
    }

    // Render the QR PNGs in parallel — much faster than serial
    // when printing 100+ stickers. Hard-fail if any single
    // encode fails (rare; would only happen for surprisingly
    // long qr_code_id values).
    const qrPngs = await Promise.all(
      printable.map((r) =>
        QRCode.toBuffer(r.qr_code_id as string, {
          type: 'png',
          margin: 0,
          errorCorrectionLevel: 'M',
          width: Math.ceil(QR_SIZE_PT * 4),
        })
      )
    );

    const doc = new PDFDocument({
      size: [LABEL_WIDTH_PT, LABEL_HEIGHT_PT],
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: `Equipment QR stickers — ${printable.length} units`,
        Author: 'Starr Surveying',
        Subject: `Phase F10.1g bulk QR — ${session.user.email}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    printable.forEach((row, idx) => {
      doc.addPage({ size: [LABEL_WIDTH_PT, LABEL_HEIGHT_PT], margin: 0 });

      const qrX = MARGIN_PT;
      const qrY = (LABEL_HEIGHT_PT - QR_SIZE_PT) / 2;
      doc.image(qrPngs[idx], qrX, qrY, {
        width: QR_SIZE_PT,
        height: QR_SIZE_PT,
      });

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

      drawLine(row.name ?? '(unnamed unit)', {
        fontSize: 9,
        bold: true,
      });
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
      drawLine(row.qr_code_id as string, { fontSize: 8, bold: true });
    });

    doc.end();
    const pdfBuffer = await pdfPromise;

    const bytes = new Uint8Array(pdfBuffer);
    const filename = `equipment_qr_${printable.length}_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    console.log('[admin/equipment/qr-stickers] generated', {
      rows_matched: allRows.length,
      printed: printable.length,
      skipped_no_qr: skipped,
      admin_email: session.user.email,
    });

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Stickers-Printed': String(printable.length),
        'X-Stickers-Skipped': String(skipped),
        'Cache-Control': 'no-store',
      },
    });
  },
  { routeName: 'admin/equipment/qr-stickers' }
);

function formatCategory(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
