// worker/src/lib/pdf-rasterize.ts — Convert PDF pages to PNG images
//
// Uses pdftoppm (from poppler-utils) for rasterization and sharp for
// post-processing (resize, compress). Falls back to lower DPI if the
// droplet runs out of memory at 300 DPI.
//
// Install requirement: apt-get install -y poppler-utils

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Result for a single rasterized PDF page. */
export interface RasterizedPage {
  pageNumber: number;
  imageBase64: string;
  imageFormat: 'png';
  width: number;
  height: number;
}

/**
 * Rasterize a PDF (base64-encoded) into one PNG image per page.
 * Returns an array of pages with base64-encoded PNG data and dimensions.
 *
 * @param pdfBase64   Base64-encoded PDF binary
 * @param maxPages    Maximum number of pages to rasterize (default: 10)
 * @param targetDpi   Render resolution — falls back to 200 if 300 fails (OOM on 2GB droplets)
 */
export async function rasterizePdf(
  pdfBase64: string,
  maxPages = 10,
  targetDpi = 300,
): Promise<RasterizedPage[]> {
  // Lazy-import sharp so the module can be loaded even if sharp isn't installed
  const { default: sharp } = await import('sharp') as { default: typeof import('sharp') };

  const tmpDir = path.join('/tmp', `pdf-raster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const pdfPath = path.join(tmpDir, 'input.pdf');
  const outPrefix = path.join(tmpDir, 'page');

  try {
    // Write PDF to temp file
    fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, 'base64'));

    // Try pdftoppm at target DPI, fall back to lower DPI on failure
    let usedDpi = targetDpi;
    try {
      execSync(
        `pdftoppm -png -r ${targetDpi} -l ${maxPages} "${pdfPath}" "${outPrefix}"`,
        { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 },
      );
    } catch {
      // Retry at lower DPI (memory-constrained environments)
      usedDpi = 200;
      try {
        execSync(
          `pdftoppm -png -r ${usedDpi} -l ${maxPages} "${pdfPath}" "${outPrefix}"`,
          { timeout: 60_000, maxBuffer: 100 * 1024 * 1024 },
        );
      } catch {
        // Final fallback at 150 DPI
        usedDpi = 150;
        execSync(
          `pdftoppm -png -r ${usedDpi} -l ${maxPages} "${pdfPath}" "${outPrefix}"`,
          { timeout: 90_000, maxBuffer: 100 * 1024 * 1024 },
        );
      }
    }

    // Read generated page images (pdftoppm names them page-01.png, page-02.png, etc.)
    const pageFiles = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith('page-') && f.endsWith('.png'))
      .sort();

    const pages: RasterizedPage[] = [];

    for (let i = 0; i < pageFiles.length; i++) {
      const filePath = path.join(tmpDir, pageFiles[i]);
      const imgBuffer = fs.readFileSync(filePath);

      // Get dimensions
      const metadata = await sharp(imgBuffer).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;

      pages.push({
        pageNumber: i + 1,
        imageBase64: imgBuffer.toString('base64'),
        imageFormat: 'png',
        width,
        height,
      });
    }

    return pages;
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-fatal cleanup failure
    }
  }
}

/**
 * Check if pdftoppm is available on this system.
 * Call once at startup to warn if poppler-utils isn't installed.
 */
export function isPdftoppmAvailable(): boolean {
  try {
    execSync('which pdftoppm', { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
