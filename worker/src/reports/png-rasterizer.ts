// worker/src/reports/png-rasterizer.ts — Phase 10 Module 2
// Converts SVG boundary drawings to high-resolution PNG rasters.
// Uses resvg-js (preferred), falling back to rsvg-convert or Inkscape CLI.
//
// Spec §10.5 — PNG Rasterization

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ── PNG Rasterizer ──────────────────────────────────────────────────────────

export class PNGRasterizer {
  private dpi: number;

  constructor(dpi: number = 300) {
    this.dpi = dpi;
  }

  // ── Main rasterize method ───────────────────────────────────────────────

  async rasterize(svgContent: string, outputPath: string): Promise<string> {
    // Try resvg-js first (fastest, no external deps)
    try {
      return await this.rasterizeWithResvg(svgContent, outputPath);
    } catch {
      console.log('[PNG] resvg-js unavailable, trying rsvg-convert...');
    }

    // Try rsvg-convert (librsvg CLI)
    try {
      return this.rasterizeWithRsvgConvert(svgContent, outputPath);
    } catch {
      console.log('[PNG] rsvg-convert unavailable, trying Inkscape...');
    }

    // Try Inkscape CLI
    try {
      return this.rasterizeWithInkscape(svgContent, outputPath);
    } catch {
      console.log('[PNG] Inkscape unavailable, trying ImageMagick...');
    }

    // Last resort: ImageMagick convert
    return this.rasterizeWithImageMagick(svgContent, outputPath);
  }

  // ── resvg-js (preferred) ───────────────────────────────────────────────

  private async rasterizeWithResvg(
    svgContent: string,
    outputPath: string,
  ): Promise<string> {
    // Dynamic import to avoid hard dependency
    const { Resvg } = await import('@resvg/resvg-js');

    const resvg = new Resvg(svgContent, {
      dpi: this.dpi,
      shapeRendering: 2, // geometricPrecision
      textRendering: 1, // optimizeLegibility
      imageRendering: 0, // optimizeQuality
      fitTo: {
        mode: 'width' as const,
        value: Math.round((this.dpi / 96) * this.extractWidth(svgContent)),
      },
    });

    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pngBuffer);

    console.log(
      `[PNG] Rendered via resvg-js: ${outputPath} (${pngBuffer.length} bytes, ${this.dpi} DPI)`,
    );
    return outputPath;
  }

  // ── rsvg-convert (librsvg) ─────────────────────────────────────────────

  private rasterizeWithRsvgConvert(
    svgContent: string,
    outputPath: string,
  ): string {
    const tmpSvg = outputPath.replace(/\.png$/, '.tmp.svg');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(tmpSvg, svgContent);

    try {
      execSync(
        `rsvg-convert -d ${this.dpi} -p ${this.dpi} -o "${outputPath}" "${tmpSvg}"`,
        { timeout: 30_000 },
      );

      console.log(
        `[PNG] Rendered via rsvg-convert: ${outputPath} (${this.dpi} DPI)`,
      );
      return outputPath;
    } finally {
      try {
        fs.unlinkSync(tmpSvg);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  // ── Inkscape CLI ───────────────────────────────────────────────────────

  private rasterizeWithInkscape(
    svgContent: string,
    outputPath: string,
  ): string {
    const tmpSvg = outputPath.replace(/\.png$/, '.tmp.svg');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(tmpSvg, svgContent);

    try {
      execSync(
        `inkscape "${tmpSvg}" --export-type=png --export-filename="${outputPath}" --export-dpi=${this.dpi}`,
        { timeout: 60_000 },
      );

      console.log(
        `[PNG] Rendered via Inkscape: ${outputPath} (${this.dpi} DPI)`,
      );
      return outputPath;
    } finally {
      try {
        fs.unlinkSync(tmpSvg);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  // ── ImageMagick convert (last resort) ──────────────────────────────────

  private rasterizeWithImageMagick(
    svgContent: string,
    outputPath: string,
  ): string {
    const tmpSvg = outputPath.replace(/\.png$/, '.tmp.svg');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(tmpSvg, svgContent);

    try {
      execSync(
        `convert -density ${this.dpi} "${tmpSvg}" "${outputPath}"`,
        { timeout: 60_000 },
      );

      console.log(
        `[PNG] Rendered via ImageMagick: ${outputPath} (${this.dpi} DPI)`,
      );
      return outputPath;
    } finally {
      try {
        fs.unlinkSync(tmpSvg);
      } catch {
        // ignore cleanup failure
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private extractWidth(svgContent: string): number {
    const match = svgContent.match(/width="(\d+)"/);
    return match ? parseInt(match[1]) : 1200;
  }
}
