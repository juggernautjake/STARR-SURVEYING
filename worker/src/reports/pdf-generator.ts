// worker/src/reports/pdf-generator.ts — Phase 10 Module 4
// Multi-section professional PDF report via pdfkit.
// Sections: Cover, Executive Summary, Boundary Table, Confidence Matrix,
// Source Documents, Drawing Page, Purchase Summary, Appendix.
//
// Spec §10.7 — PDF Report Generator

import * as fs from 'fs';
import * as path from 'path';
import type { ProjectData, ReportConfig } from '../types/reports.js';

// ── PDF Report Generator ────────────────────────────────────────────────────

export class PDFReportGenerator {

  async generate(
    data: ProjectData,
    config: ReportConfig,
    svgPath: string | null,
    outputPath: string,
  ): Promise<string> {
    // Dynamic import — pdfkit is a CommonJS module
    const PDFDocument = (await import('pdfkit')).default;

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const doc = new PDFDocument({
      size: config.pdf.pageSize === 'tabloid' ? 'TABLOID' : 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: `Boundary Research Report — ${data.address}`,
        Author: config.pdf.companyName,
        Subject: `Project ${data.projectId}`,
        Creator: 'STARR RECON Pipeline',
      },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageWidth =
      config.pdf.pageSize === 'tabloid' ? 792 : 612;
    const contentWidth = pageWidth - 144; // 72pt margins each side

    // ── Section 1: Cover Page ───────────────────────────────────────────
    this.writeCoverPage(doc, data, config, contentWidth);

    // ── Section 2: Executive Summary ────────────────────────────────────
    doc.addPage();
    this.writeExecutiveSummary(doc, data, contentWidth);

    // ── Section 3: Boundary Call Table ──────────────────────────────────
    doc.addPage();
    this.writeBoundaryTable(doc, data, contentWidth);

    // ── Section 4: Confidence Matrix ────────────────────────────────────
    doc.addPage();
    this.writeConfidenceMatrix(doc, data, contentWidth);

    // ── Section 5: Source Documents ─────────────────────────────────────
    doc.addPage();
    this.writeSourceDocuments(doc, data, contentWidth);

    // ── Section 6: Drawing Page ─────────────────────────────────────────
    if (svgPath && fs.existsSync(svgPath.replace(/\.svg$/, '.png'))) {
      doc.addPage();
      this.writeDrawingPage(doc, svgPath, contentWidth);
    }

    // ── Section 7: Purchase Summary ─────────────────────────────────────
    if (data.purchases) {
      doc.addPage();
      this.writePurchaseSummary(doc, data, contentWidth);
    }

    // ── Section 8: Appendix ─────────────────────────────────────────────
    if (config.pdf.includeAppendix) {
      doc.addPage();
      this.writeAppendix(doc, data, contentWidth);
    }

    // ── Finalize ────────────────────────────────────────────────────────
    doc.end();

    return new Promise<string>((resolve, reject) => {
      stream.on('finish', () => {
        const stats = fs.statSync(outputPath);
        console.log(
          `[PDF] Generated: ${outputPath} (${(stats.size / 1024).toFixed(0)} KB)`,
        );
        resolve(outputPath);
      });
      stream.on('error', reject);
    });
  }

  // ── Cover Page ──────────────────────────────────────────────────────────

  private writeCoverPage(
    doc: any,
    data: ProjectData,
    config: ReportConfig,
    width: number,
  ): void {
    // Logo
    if (config.pdf.logoPath && fs.existsSync(config.pdf.logoPath)) {
      doc.image(config.pdf.logoPath, 72, 72, { width: 150 });
      doc.moveDown(4);
    } else {
      doc.moveDown(6);
    }

    // Title
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .text('BOUNDARY RESEARCH REPORT', { align: 'center' });

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text('AI-Assisted Property Research & Analysis', { align: 'center' });

    doc.moveDown(3);

    // Property info box
    doc.fillColor('#000000');
    const boxTop = doc.y;
    doc.rect(72, boxTop, width, 120).stroke('#333333');

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Property Address:', 90, boxTop + 15);
    doc.font('Helvetica').text(data.address, 220, boxTop + 15);

    doc.font('Helvetica-Bold').text('County/State:', 90, boxTop + 35);
    doc.font('Helvetica').text(`${data.county}, ${data.state}`, 220, boxTop + 35);

    doc.font('Helvetica-Bold').text('Owner:', 90, boxTop + 55);
    doc
      .font('Helvetica')
      .text(data.discovery?.ownerName || 'N/A', 220, boxTop + 55);

    doc.font('Helvetica-Bold').text('Acreage:', 90, boxTop + 75);
    doc
      .font('Helvetica')
      .text(
        data.discovery?.acreage
          ? `${data.discovery.acreage.toFixed(4)} acres`
          : 'N/A',
        220,
        boxTop + 75,
      );

    doc.font('Helvetica-Bold').text('Project ID:', 90, boxTop + 95);
    doc.font('Helvetica').text(data.projectId, 220, boxTop + 95);

    doc.y = boxTop + 140;
    doc.moveDown(3);

    // Confidence badge
    const grade = data.confidence?.overallGrade || 'N/A';
    const score = data.confidence?.overallScore || 0;
    const gradeColor = this.gradeColor(grade);

    doc.fontSize(16).font('Helvetica-Bold').text('Overall Confidence', {
      align: 'center',
    });
    doc.moveDown(0.3);
    doc
      .fontSize(36)
      .fillColor(gradeColor)
      .text(`${grade} — ${score}%`, { align: 'center' });

    doc.fillColor('#000000');
    doc.moveDown(4);

    // Footer
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(config.pdf.companyName, { align: 'center' });
    doc.text(config.pdf.companyAddress, { align: 'center' });
    if (config.pdf.rpls) {
      doc.text(`RPLS #${config.pdf.rpls}`, { align: 'center' });
    }
    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(`Generated: ${new Date().toLocaleDateString()}`, {
        align: 'center',
      });
    doc
      .text(`Pipeline Version: ${data.pipelineVersion || 'N/A'}`, {
        align: 'center',
      });
  }

  // ── Executive Summary ───────────────────────────────────────────────────

  private writeExecutiveSummary(
    doc: any,
    data: ProjectData,
    width: number,
  ): void {
    doc.fillColor('#000000');
    this.sectionHeader(doc, '1. Executive Summary');

    const recon = data.reconciliationV2 || data.reconciliation;
    const calls = recon?.reconciledCalls || recon?.calls || [];
    const totalCalls = calls.length;
    const highConfCalls = calls.filter(
      (c: any) => (c.confidence || 0) >= 80,
    ).length;
    const closureRatio = recon?.closureError?.ratio || 'N/A';

    doc.fontSize(11).font('Helvetica');

    doc.text(
      `This report presents the results of AI-assisted boundary research for the property ` +
      `located at ${data.address}, ${data.county} County, Texas. ` +
      `The analysis encompassed ${data.documents?.target?.length || 0} source documents ` +
      `including plats, deeds, and easements.`,
    );

    doc.moveDown(1);

    // Key metrics table
    const metrics = [
      ['Total Boundary Calls', `${totalCalls}`],
      ['High-Confidence Calls (≥80%)', `${highConfCalls} of ${totalCalls}`],
      ['Closure Ratio', `${closureRatio}`],
      ['Overall Confidence', `${data.confidence?.overallScore || 0}% (Grade ${data.confidence?.overallGrade || 'N/A'})`],
      ['Legal Description', data.discovery?.legalDescription || 'N/A'],
      ['Subdivision', data.discovery?.subdivision || 'Metes & Bounds'],
      ['Documents Analyzed', `${(data.documents?.target?.length || 0) + (data.documents?.txdot?.length || 0)}`],
    ];

    if (data.purchases) {
      metrics.push([
        'Official Documents Purchased',
        `${data.purchases.purchased?.length || 0}`,
      ]);
      metrics.push([
        'Total Purchase Cost',
        `$${data.purchases.billing?.totalSpent?.toFixed(2) || '0.00'}`,
      ]);
    }

    const tableTop = doc.y + 5;
    let rowY = tableTop;

    for (const [label, value] of metrics) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 72;
      }

      // Alternating row background
      const rowIndex = metrics.indexOf([label, value]);
      if (rowIndex % 2 === 0) {
        doc.rect(72, rowY, width, 20).fill('#F5F5F5');
      }

      doc
        .fillColor('#000000')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(label, 80, rowY + 5, { width: width * 0.5 });
      doc
        .font('Helvetica')
        .text(value, 80 + width * 0.5, rowY + 5, { width: width * 0.45 });

      rowY += 20;
    }

    doc.y = rowY + 10;
  }

  // ── Boundary Call Table ─────────────────────────────────────────────────

  private writeBoundaryTable(
    doc: any,
    data: ProjectData,
    width: number,
  ): void {
    doc.fillColor('#000000');
    this.sectionHeader(doc, '2. Reconciled Boundary Calls');

    const recon = data.reconciliationV2 || data.reconciliation;
    const calls = recon?.reconciledCalls || recon?.calls || [];

    if (calls.length === 0) {
      doc.fontSize(10).text('No boundary calls available.');
      return;
    }

    // Column headers
    const colWidths = [40, 150, 80, 60, width - 330];
    const headers = ['#', 'Bearing', 'Distance', 'Conf.', 'Source'];
    let y = doc.y + 5;

    doc.rect(72, y, width, 18).fill('#333333');
    let x = 80;
    for (let i = 0; i < headers.length; i++) {
      doc
        .fillColor('#FFFFFF')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(headers[i], x, y + 4, { width: colWidths[i] });
      x += colWidths[i];
    }
    y += 18;

    // Data rows
    for (let i = 0; i < calls.length; i++) {
      if (y > 700) {
        doc.addPage();
        y = 72;
      }

      const call = calls[i];

      if (i % 2 === 0) {
        doc.rect(72, y, width, 18).fill('#F9F9F9');
      }

      const confColor = this.confidenceColor(call.confidence || 0);

      x = 80;
      doc
        .fillColor('#000000')
        .fontSize(9)
        .font('Helvetica')
        .text(`${i + 1}`, x, y + 4, { width: colWidths[0] });
      x += colWidths[0];

      doc.text(call.bearing || 'N/A', x, y + 4, { width: colWidths[1] });
      x += colWidths[1];

      doc.text(
        call.distance ? `${call.distance.toFixed(2)}'` : 'N/A',
        x,
        y + 4,
        { width: colWidths[2] },
      );
      x += colWidths[2];

      doc
        .fillColor(confColor)
        .font('Helvetica-Bold')
        .text(`${call.confidence || 0}%`, x, y + 4, { width: colWidths[3] });
      x += colWidths[3];

      doc
        .fillColor('#666666')
        .font('Helvetica')
        .fontSize(8)
        .text(call.source || call.sourceDocument || '', x, y + 4, {
          width: colWidths[4],
        });

      y += 18;
    }

    // Curve calls annotation
    const curveCalls = calls.filter((c: any) => c.curve);
    if (curveCalls.length > 0) {
      doc.y = y + 10;
      doc
        .fillColor('#000000')
        .fontSize(9)
        .font('Helvetica-Oblique')
        .text(
          `Note: ${curveCalls.length} call(s) include curve data (radius, arc length, delta angle).`,
        );
    }

    doc.y = y + 10;
  }

  // ── Confidence Matrix ───────────────────────────────────────────────────

  private writeConfidenceMatrix(
    doc: any,
    data: ProjectData,
    width: number,
  ): void {
    doc.fillColor('#000000');
    this.sectionHeader(doc, '3. Confidence Analysis');

    const conf = data.confidence;
    if (!conf) {
      doc.fontSize(10).text('Confidence data not available.');
      return;
    }

    // Overall scores
    doc.fontSize(11).font('Helvetica-Bold').text('Overall Scores');
    doc.moveDown(0.5);

    const scores = [
      ['Document Quality', conf.documentQuality?.score],
      ['Extraction Confidence', conf.extractionConfidence?.score],
      ['Cross-Validation', conf.crossValidation?.score],
      ['Closure Analysis', conf.closureAnalysis?.score],
      ['Monument Evidence', conf.monumentEvidence?.score],
      ['Overall Score', conf.overallScore],
    ];

    for (const [label, score] of scores) {
      if (score === undefined) continue;
      const numScore = typeof score === 'number' ? score : 0;
      const barWidth = (numScore / 100) * (width - 200);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#000000')
        .text(`${label}:`, 80, doc.y, { continued: true, width: 180 });

      const barY = doc.y;
      doc.rect(260, barY, width - 200, 12).fill('#EEEEEE');
      doc
        .rect(260, barY, barWidth, 12)
        .fill(this.confidenceColor(numScore));

      doc
        .fillColor('#000000')
        .fontSize(8)
        .text(`${numScore}%`, 265 + barWidth + 5, barY + 2);

      doc.y = barY + 18;
    }

    // Flags
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
    doc.text('Flags & Warnings');
    doc.moveDown(0.5);

    const flags = conf.flags || [];
    if (flags.length === 0) {
      doc.fontSize(9).font('Helvetica').text('No flags raised.');
    } else {
      for (const flag of flags) {
        const severity = flag.severity || 'info';
        const icon =
          severity === 'critical'
            ? '⚠'
            : severity === 'warning'
              ? '△'
              : 'ℹ';
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(
            severity === 'critical'
              ? '#CC0000'
              : severity === 'warning'
                ? '#CC6600'
                : '#333333',
          )
          .text(`${icon} [${severity.toUpperCase()}] ${flag.message}`);
        doc.moveDown(0.3);
      }
    }
  }

  // ── Source Documents ────────────────────────────────────────────────────

  private writeSourceDocuments(
    doc: any,
    data: ProjectData,
    width: number,
  ): void {
    doc.fillColor('#000000');
    this.sectionHeader(doc, '4. Source Documents');

    const allDocs = [
      ...(data.documents?.target || []).map((d) => ({
        ...d,
        category: 'Target Property',
      })),
      ...(data.documents?.txdot || []).map((d) => ({
        ...d,
        category: 'TxDOT',
      })),
    ];

    if (allDocs.length === 0) {
      doc.fontSize(10).text('No source documents cataloged.');
      return;
    }

    for (const docEntry of allDocs) {
      if (doc.y > 680) doc.addPage();

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(`${docEntry.type.toUpperCase()} — ${docEntry.instrument}`);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `Recorded: ${docEntry.recordingDate} | Pages: ${docEntry.pages} | ` +
          `Source: ${docEntry.source} | Category: ${docEntry.category}`,
        );

      const badges: string[] = [];
      if (docEntry.isOfficial) badges.push('OFFICIAL');
      if (docEntry.isWatermarked) badges.push('WATERMARKED');

      if (badges.length > 0) {
        doc
          .fontSize(8)
          .fillColor(docEntry.isOfficial ? '#006600' : '#CC6600')
          .text(badges.join(' | '));
      }

      doc.moveDown(0.5);
    }
  }

  // ── Drawing Page ────────────────────────────────────────────────────────

  private writeDrawingPage(
    doc: any,
    svgPath: string,
    width: number,
  ): void {
    this.sectionHeader(doc, '5. Boundary Drawing');

    const pngPath = svgPath.replace(/\.svg$/, '.png');
    if (fs.existsSync(pngPath)) {
      doc.image(pngPath, 72, doc.y + 10, {
        fit: [width, 500],
        align: 'center',
      });
    } else {
      doc
        .fontSize(10)
        .text('Boundary drawing not available (PNG rendering failed).');
    }
  }

  // ── Purchase Summary ────────────────────────────────────────────────────

  private writePurchaseSummary(
    doc: any,
    data: ProjectData,
    width: number,
  ): void {
    doc.fillColor('#000000');
    this.sectionHeader(doc, '6. Document Purchase Summary');

    const purchases = data.purchases;
    if (!purchases) return;

    const purchased = purchases.purchased || [];
    const billing = purchases.billing;

    doc.fontSize(11).font('Helvetica-Bold').text('Purchase Results');
    doc.moveDown(0.5);

    for (const p of purchased) {
      if (doc.y > 680) doc.addPage();

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#000000')
        .text(`${p.documentType?.toUpperCase()} — ${p.instrument}`);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          `Vendor: ${p.vendor} | Pages: ${p.pages} | Cost: $${p.totalCost?.toFixed(2)} | ` +
          `Status: ${p.status}`,
        );

      doc.moveDown(0.5);
    }

    // Billing summary
    if (billing) {
      doc.moveDown(1);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Billing Summary');
      doc.moveDown(0.3);

      doc.fontSize(10).font('Helvetica');
      doc.text(`Total Spent: $${billing.totalSpent?.toFixed(2) || '0.00'}`);
      doc.text(`Budget: $${billing.budget?.toFixed(2) || '50.00'}`);
      doc.text(`Remaining: $${billing.remainingBudget?.toFixed(2) || '0.00'}`);
      doc.text(`Documents Purchased: ${purchased.length}`);
      doc.text(
        `Total Pages: ${purchased.reduce((s: number, p: any) => s + (p.pages || 0), 0)}`,
      );
    }
  }

  // ── Appendix ────────────────────────────────────────────────────────────

  private writeAppendix(
    doc: any,
    data: ProjectData,
    _width: number,
  ): void {
    doc.fillColor('#000000');
    this.sectionHeader(doc, 'Appendix: Technical Details');

    doc.fontSize(9).font('Helvetica');

    doc.text(`Project ID: ${data.projectId}`);
    doc.text(`Pipeline Version: ${data.pipelineVersion || 'N/A'}`);
    doc.text(`Created: ${data.createdAt}`);
    doc.text(`Completed: ${data.completedAt}`);
    doc.text(`CAD Source: ${data.discovery?.cadSource || 'N/A'}`);
    doc.text(`CAD URL: ${data.discovery?.cadUrl || 'N/A'}`);

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text('Coordinate System');
    doc.font('Helvetica');
    doc.text('NAD83 Texas Central Zone (EPSG:4203)');
    doc.text('Units: US Survey Feet');

    doc.moveDown(1);
    doc.font('Helvetica-Bold').text('Disclaimer');
    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .font('Helvetica-Oblique')
      .fillColor('#666666')
      .text(
        'This report is generated by an AI-assisted research pipeline and is intended ' +
        'as preliminary boundary research only. It does NOT constitute a boundary survey ' +
        'and should NOT be used as a substitute for a survey performed by a licensed ' +
        'Registered Professional Land Surveyor (RPLS). All boundary calls, monuments, ' +
        'and measurements presented herein are derived from public records and AI ' +
        'extraction and should be independently verified in the field.',
      );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private sectionHeader(doc: any, title: string): void {
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text(title);
    doc.moveDown(0.3);
    doc
      .moveTo(72, doc.y)
      .lineTo(72 + 468, doc.y)
      .stroke('#333333');
    doc.moveDown(0.8);
  }

  private gradeColor(grade: string): string {
    switch (grade) {
      case 'A':
        return '#006600';
      case 'B':
        return '#339900';
      case 'C':
        return '#CC9900';
      case 'D':
        return '#CC6600';
      case 'F':
        return '#CC0000';
      default:
        return '#333333';
    }
  }

  private confidenceColor(score: number): string {
    if (score >= 80) return '#006600';
    if (score >= 60) return '#CC9900';
    if (score >= 40) return '#CC6600';
    return '#CC0000';
  }
}
