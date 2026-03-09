// worker/src/services/pages-to-pdf.ts
// Bundles downloaded document page images (DocumentPage[]) into a single PDF
// using pdfkit, then optionally uploads to Supabase Storage.
// Used by the pipeline after Stage 2.5 Kofile image interception.

import type { DocumentPage } from '../types/index.js';

// ── PDF Generation ─────────────────────────────────────────────────────────

/**
 * Convert an array of DocumentPage (base64 PNG/JPG images) into a single PDF
 * buffer. Each page image becomes one PDF page, sized to the image dimensions.
 * Falls back to A4 portrait (595 × 842 pt) if width/height are unknown.
 */
export async function pageImagesToBuffer(pages: DocumentPage[]): Promise<Buffer> {
  if (pages.length === 0) throw new Error('No pages provided');

  // Dynamic import — pdfkit is a CommonJS module
  const PDFDocument = (await import('pdfkit')).default;

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    // autoFirstPage:false so we control every page size ourselves
    const doc = new PDFDocument({ autoFirstPage: false, compress: true });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const page of pages) {
      // PDF points: 1 pt ≈ 1/72 inch. Kofile images are typically 200–300 dpi.
      // We render at 96 dpi equivalent so large images still fit the page.
      const DPI = 96;
      const PT_PER_INCH = 72;

      let widthPt = page.width > 0 ? (page.width / DPI) * PT_PER_INCH : 612;   // Letter 8.5"
      let heightPt = page.height > 0 ? (page.height / DPI) * PT_PER_INCH : 792; // Letter 11"

      // Cap at max reasonable letter/tabloid size (11" × 17" = 792 × 1224 pt)
      const MAX_PT = 1224;
      if (widthPt > MAX_PT || heightPt > MAX_PT) {
        const scale = MAX_PT / Math.max(widthPt, heightPt);
        widthPt *= scale;
        heightPt *= scale;
      }

      doc.addPage({ size: [widthPt, heightPt], margin: 0 });

      try {
        const imageBuffer = Buffer.from(page.imageBase64, 'base64');

        // Draw the image covering the full page
        doc.image(imageBuffer, 0, 0, {
          width: widthPt,
          height: heightPt,
          fit: [widthPt, heightPt],
          align: 'center',
          valign: 'center',
        });

        // Small page-number watermark (top-right, subtle)
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#888888')
          .text(`Page ${page.pageNumber}`, widthPt - 50, 4, { width: 46, align: 'right' });
      } catch (imgErr) {
        // If image fails, render an error placeholder instead of crashing
        doc
          .font('Helvetica')
          .fontSize(14)
          .fillColor('#CC0000')
          .text(
            `[Page ${page.pageNumber}: Image could not be rendered — ${imgErr instanceof Error ? imgErr.message : String(imgErr)}]`,
            20, heightPt / 2 - 20,
            { width: widthPt - 40, align: 'center' },
          );
      }
    }

    doc.end();
  });
}

// ── Supabase Storage Upload ────────────────────────────────────────────────

/**
 * Upload a PDF buffer to Supabase Storage and return its public URL.
 *
 * Stored at: {bucket}/{projectId}/{filename}.pdf
 * Uses upsert so re-runs overwrite the same path.
 *
 * Returns null if Supabase credentials are missing or upload fails.
 */
export async function uploadPdfToStorage(
  pdfBuffer: Buffer,
  projectId: string,
  filename: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<string | null> {
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const storagePath = `${projectId}/${filename}.pdf`;
    const bucket = 'research-documents';

    const { error: uploadError } = await (supabase.storage as any)
      .from(bucket)
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error(`[PDF-UPLOAD] Storage upload failed: ${uploadError.message}`);
      return null;
    }

    const { data: urlData } = (supabase.storage as any)
      .from(bucket)
      .getPublicUrl(storagePath);

    const publicUrl: string | null = urlData?.publicUrl ?? null;

    // Back-patch research_documents if a row with this instrument number exists
    if (publicUrl) {
      try {
        await (supabase as any)
          .from('research_documents')
          .update({
            storage_path: storagePath,
            storage_url: publicUrl,
            file_type: 'pdf',
          })
          .eq('research_project_id', projectId)
          .eq('original_filename', `${filename}.pdf`);
      } catch { /* non-critical — URL is already in the pipeline result */ }
    }

    return publicUrl;
  } catch (err) {
    console.error(`[PDF-UPLOAD] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Combined helper ────────────────────────────────────────────────────────

/**
 * Bundle page images into a PDF and upload to Supabase Storage.
 * Returns the public URL or null on any failure.
 * Never throws — all errors are caught and logged.
 */
export async function bundleAndUploadPages(
  pages: DocumentPage[],
  projectId: string,
  instrumentNumber: string | null,
  documentType: string,
): Promise<string | null> {
  if (pages.length === 0) return null;

  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  // Build a safe filename
  const safeName = (instrumentNumber ?? documentType)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 60);
  const filename = `${safeName}_pages`;

  try {
    console.log(`[PDF] Building PDF from ${pages.length} page image(s) for ${safeName}…`);
    const pdfBuffer = await pageImagesToBuffer(pages);
    console.log(`[PDF] Generated ${Math.round(pdfBuffer.length / 1024)}KB PDF`);

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[PDF] Supabase credentials missing — PDF not uploaded');
      return null;
    }

    const url = await uploadPdfToStorage(pdfBuffer, projectId, filename, supabaseUrl, supabaseKey);
    if (url) {
      console.log(`[PDF] Uploaded: ${url}`);
    } else {
      console.warn('[PDF] Upload returned no URL');
    }
    return url;
  } catch (err) {
    console.error(`[PDF] Failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
