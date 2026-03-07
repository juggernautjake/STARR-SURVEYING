// worker/src/reports/dxf-exporter.ts — Phase 10 Module 3
// Generates DXF R2010 (AC1027) CAD drawings from reconciled boundary data.
// 13 layers, monument insert blocks, arc entities, bearing/distance text.
//
// Spec §10.6 — DXF Export Engine
//
// Output is compatible with AutoCAD Civil 3D and BricsCAD.
// Coordinates: NAD83 Texas Central Zone (4203), US Survey Feet.

import * as fs from 'fs';
import * as path from 'path';
import type { ProjectData, ReportConfig } from '../types/reports.js';

// ── ACI Color Constants ─────────────────────────────────────────────────────

const ACI = {
  WHITE: 7,
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  CYAN: 4,
  BLUE: 5,
  MAGENTA: 6,
  GRAY: 8,
  LIGHT_GRAY: 9,
  DARK_RED: 12,
  ORANGE: 30,
  BROWN: 33,
} as const;

// ── Layer Definitions ───────────────────────────────────────────────────────

interface LayerDef {
  name: string;
  color: number;
  lineType: string;
  description: string;
}

const LAYERS: LayerDef[] = [
  { name: 'BOUNDARY', color: ACI.WHITE, lineType: 'CONTINUOUS', description: 'Subject property boundary' },
  { name: 'BOUNDARY-TEXT', color: ACI.WHITE, lineType: 'CONTINUOUS', description: 'Bearing and distance labels' },
  { name: 'LOTS', color: ACI.CYAN, lineType: 'CONTINUOUS', description: 'Subdivision lot lines' },
  { name: 'LOT-TEXT', color: ACI.CYAN, lineType: 'CONTINUOUS', description: 'Lot/block labels' },
  { name: 'EASEMENTS', color: ACI.BLUE, lineType: 'DASHED', description: 'Easement lines' },
  { name: 'EASEMENT-TEXT', color: ACI.BLUE, lineType: 'CONTINUOUS', description: 'Easement labels' },
  { name: 'ROW', color: ACI.RED, lineType: 'DASHDOT', description: 'Right-of-way lines' },
  { name: 'ROW-TEXT', color: ACI.RED, lineType: 'CONTINUOUS', description: 'ROW labels' },
  { name: 'ADJACENT', color: ACI.GRAY, lineType: 'CONTINUOUS', description: 'Adjacent property boundaries' },
  { name: 'ADJACENT-TEXT', color: ACI.GRAY, lineType: 'CONTINUOUS', description: 'Adjacent owner labels' },
  { name: 'MONUMENTS', color: ACI.GREEN, lineType: 'CONTINUOUS', description: 'Survey monuments' },
  { name: 'CONFIDENCE', color: ACI.YELLOW, lineType: 'CONTINUOUS', description: 'Confidence annotations' },
  { name: 'TITLE', color: ACI.WHITE, lineType: 'CONTINUOUS', description: 'Title block and metadata' },
];

// ── DXF Exporter ────────────────────────────────────────────────────────────

export class DXFExporter {

  export(data: ProjectData, config: ReportConfig, outputPath: string): string {
    const lines: string[] = [];

    // ── HEADER section ─────────────────────────────────────────────────
    this.writeHeader(lines, data);

    // ── CLASSES section (empty for basic DXF) ──────────────────────────
    lines.push('  0', 'SECTION', '  2', 'CLASSES', '  0', 'ENDSEC');

    // ── TABLES section ─────────────────────────────────────────────────
    this.writeTables(lines);

    // ── BLOCKS section ─────────────────────────────────────────────────
    this.writeBlocks(lines);

    // ── ENTITIES section ───────────────────────────────────────────────
    lines.push('  0', 'SECTION', '  2', 'ENTITIES');

    this.writeBoundary(lines, data);

    if (config.dxf.includeLabels) {
      this.writeBoundaryLabels(lines, data);
    }

    if (config.dxf.includeMonuments) {
      this.writeMonuments(lines, data);
    }

    if (config.dxf.includeEasements) {
      this.writeEasements(lines, data);
    }

    if (config.dxf.includeROW) {
      this.writeROW(lines, data);
    }

    if (config.dxf.includeAdjacent) {
      this.writeAdjacent(lines, data);
    }

    this.writeConfidenceAnnotations(lines, data);
    this.writeTitleBlock(lines, data, config);

    lines.push('  0', 'ENDSEC');

    // ── EOF ────────────────────────────────────────────────────────────
    lines.push('  0', 'EOF');

    // Write file
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, lines.join('\n'));

    const stats = fs.statSync(outputPath);
    console.log(
      `[DXF] Exported: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB, ${LAYERS.length} layers)`,
    );
    return outputPath;
  }

  // ── HEADER Section ──────────────────────────────────────────────────────

  private writeHeader(lines: string[], data: ProjectData): void {
    lines.push('  0', 'SECTION', '  2', 'HEADER');

    // DXF version AC1027 = R2010
    this.headerVar(lines, '$ACADVER', 1, 'AC1027');

    // Coordinate system hint
    this.headerVar(lines, '$INSUNITS', 70, '2'); // 2 = Feet

    // Extents — compute from boundary corners
    const corners = this.getCorners(data);
    if (corners.length > 0) {
      const minE = Math.min(...corners.map((c) => c.easting));
      const minN = Math.min(...corners.map((c) => c.northing));
      const maxE = Math.max(...corners.map((c) => c.easting));
      const maxN = Math.max(...corners.map((c) => c.northing));

      lines.push('  9', '$EXTMIN');
      lines.push(' 10', minE.toFixed(4), ' 20', minN.toFixed(4), ' 30', '0.0');
      lines.push('  9', '$EXTMAX');
      lines.push(' 10', maxE.toFixed(4), ' 20', maxN.toFixed(4), ' 30', '0.0');
    }

    lines.push('  0', 'ENDSEC');
  }

  private headerVar(
    lines: string[],
    name: string,
    groupCode: number,
    value: string,
  ): void {
    lines.push('  9', name);
    lines.push(`  ${groupCode}`, value);
  }

  // ── TABLES Section ──────────────────────────────────────────────────────

  private writeTables(lines: string[]): void {
    lines.push('  0', 'SECTION', '  2', 'TABLES');

    // ── LTYPE table ───────────────────────────────────────────────────
    lines.push('  0', 'TABLE', '  2', 'LTYPE', ' 70', `${3}`);

    // CONTINUOUS
    lines.push('  0', 'LTYPE', '  2', 'CONTINUOUS', ' 70', '0');
    lines.push('  3', 'Solid line', ' 72', '65', ' 73', '0', ' 40', '0.0');

    // DASHED
    lines.push('  0', 'LTYPE', '  2', 'DASHED', ' 70', '0');
    lines.push(
      '  3', 'Dashed _ _ _ _', ' 72', '65', ' 73', '2', ' 40', '0.75',
    );
    lines.push(' 49', '0.5', ' 49', '-0.25');

    // DASHDOT
    lines.push('  0', 'LTYPE', '  2', 'DASHDOT', ' 70', '0');
    lines.push(
      '  3', 'Dash dot _ . _', ' 72', '65', ' 73', '4', ' 40', '1.0',
    );
    lines.push(' 49', '0.5', ' 49', '-0.25', ' 49', '0.0', ' 49', '-0.25');

    lines.push('  0', 'ENDTAB');

    // ── LAYER table ───────────────────────────────────────────────────
    lines.push('  0', 'TABLE', '  2', 'LAYER', ' 70', `${LAYERS.length}`);

    for (const layer of LAYERS) {
      lines.push('  0', 'LAYER');
      lines.push('  2', layer.name);
      lines.push(' 70', '0'); // not frozen/locked
      lines.push(' 62', `${layer.color}`);
      lines.push('  6', layer.lineType);
    }

    lines.push('  0', 'ENDTAB');

    // ── STYLE table (text styles) ─────────────────────────────────────
    lines.push('  0', 'TABLE', '  2', 'STYLE', ' 70', '2');

    // Standard style
    lines.push('  0', 'STYLE', '  2', 'STANDARD');
    lines.push(' 70', '0', ' 40', '0.0', ' 41', '1.0', ' 42', '2.5');
    lines.push('  3', 'txt');

    // Title style
    lines.push('  0', 'STYLE', '  2', 'TITLE');
    lines.push(' 70', '0', ' 40', '0.0', ' 41', '1.0', ' 42', '5.0');
    lines.push('  3', 'txt');

    lines.push('  0', 'ENDTAB');

    lines.push('  0', 'ENDSEC');
  }

  // ── BLOCKS Section ──────────────────────────────────────────────────────

  private writeBlocks(lines: string[]): void {
    lines.push('  0', 'SECTION', '  2', 'BLOCKS');

    // Monument block definitions
    const monumentTypes = ['IRF', 'IRS', 'IPF', 'IPS', 'CONC', 'MAG', 'PKNAIL'];

    for (const mon of monumentTypes) {
      lines.push('  0', 'BLOCK', '  2', `MON_${mon}`, ' 70', '0');
      lines.push(' 10', '0.0', ' 20', '0.0', ' 30', '0.0');
      lines.push('  8', 'MONUMENTS');

      // Each monument type gets a different symbol
      switch (mon) {
        case 'IRF': // Iron rod found — circle with cross
          this.blockCircle(lines, 0, 0, 1.5);
          this.blockLine(lines, -1.5, 0, 1.5, 0);
          this.blockLine(lines, 0, -1.5, 0, 1.5);
          break;
        case 'IRS': // Iron rod set — circle with X
          this.blockCircle(lines, 0, 0, 1.5);
          this.blockLine(lines, -1.06, -1.06, 1.06, 1.06);
          this.blockLine(lines, -1.06, 1.06, 1.06, -1.06);
          break;
        case 'IPF': // Iron pipe found — filled circle
          this.blockCircle(lines, 0, 0, 2.0);
          this.blockCircle(lines, 0, 0, 1.0);
          break;
        case 'IPS': // Iron pipe set — double circle
          this.blockCircle(lines, 0, 0, 2.0);
          this.blockCircle(lines, 0, 0, 1.0);
          break;
        case 'CONC': // Concrete monument — square
          this.blockLine(lines, -1.5, -1.5, 1.5, -1.5);
          this.blockLine(lines, 1.5, -1.5, 1.5, 1.5);
          this.blockLine(lines, 1.5, 1.5, -1.5, 1.5);
          this.blockLine(lines, -1.5, 1.5, -1.5, -1.5);
          break;
        case 'MAG': // Mag nail — triangle
          this.blockLine(lines, 0, 2.0, 1.73, -1.0);
          this.blockLine(lines, 1.73, -1.0, -1.73, -1.0);
          this.blockLine(lines, -1.73, -1.0, 0, 2.0);
          break;
        case 'PKNAIL': // PK nail — diamond
          this.blockLine(lines, 0, 2.0, 2.0, 0);
          this.blockLine(lines, 2.0, 0, 0, -2.0);
          this.blockLine(lines, 0, -2.0, -2.0, 0);
          this.blockLine(lines, -2.0, 0, 0, 2.0);
          break;
      }

      lines.push('  0', 'ENDBLK');
    }

    lines.push('  0', 'ENDSEC');
  }

  private blockCircle(
    lines: string[],
    cx: number,
    cy: number,
    r: number,
  ): void {
    lines.push('  0', 'CIRCLE');
    lines.push('  8', 'MONUMENTS');
    lines.push(' 10', cx.toFixed(4), ' 20', cy.toFixed(4), ' 30', '0.0');
    lines.push(' 40', r.toFixed(4));
  }

  private blockLine(
    lines: string[],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    lines.push('  0', 'LINE');
    lines.push('  8', 'MONUMENTS');
    lines.push(' 10', x1.toFixed(4), ' 20', y1.toFixed(4), ' 30', '0.0');
    lines.push(' 11', x2.toFixed(4), ' 21', y2.toFixed(4), ' 31', '0.0');
  }

  // ── Boundary Entities ───────────────────────────────────────────────────

  private writeBoundary(lines: string[], data: ProjectData): void {
    const calls = this.getCalls(data);
    const corners = this.getCorners(data);

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const from = corners[i];
      const to = corners[(i + 1) % corners.length];

      if (!from || !to) continue;

      if (call.curve) {
        this.writeArc(lines, 'BOUNDARY', from, to, call.curve);
      } else {
        lines.push('  0', 'LINE');
        lines.push('  8', 'BOUNDARY');
        lines.push(
          ' 10', from.easting.toFixed(4),
          ' 20', from.northing.toFixed(4),
          ' 30', '0.0',
        );
        lines.push(
          ' 11', to.easting.toFixed(4),
          ' 21', to.northing.toFixed(4),
          ' 31', '0.0',
        );
      }
    }
  }

  // ── Bearing & Distance Labels ───────────────────────────────────────────

  private writeBoundaryLabels(lines: string[], data: ProjectData): void {
    const calls = this.getCalls(data);
    const corners = this.getCorners(data);

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const from = corners[i];
      const to = corners[(i + 1) % corners.length];

      if (!from || !to) continue;

      const midE = (from.easting + to.easting) / 2;
      const midN = (from.northing + to.northing) / 2;
      const angle = Math.atan2(
        to.easting - from.easting,
        to.northing - from.northing,
      );
      const angleDeg = (angle * 180) / Math.PI;

      // Bearing label (offset above line)
      const offsetDist = 3.0; // feet offset from line
      const perpAngle = angle + Math.PI / 2;
      const labelE = midE + offsetDist * Math.sin(perpAngle);
      const labelN = midN + offsetDist * Math.cos(perpAngle);

      lines.push('  0', 'TEXT');
      lines.push('  8', 'BOUNDARY-TEXT');
      lines.push(
        ' 10', labelE.toFixed(4),
        ' 20', labelN.toFixed(4),
        ' 30', '0.0',
      );
      lines.push(' 40', '2.0'); // text height
      lines.push('  1', call.bearing || '');
      lines.push(' 50', angleDeg.toFixed(2));
      lines.push(' 72', '1'); // center-justified

      // Distance label (offset below line)
      const distLabelE = midE - offsetDist * Math.sin(perpAngle);
      const distLabelN = midN - offsetDist * Math.cos(perpAngle);

      lines.push('  0', 'TEXT');
      lines.push('  8', 'BOUNDARY-TEXT');
      lines.push(
        ' 10', distLabelE.toFixed(4),
        ' 20', distLabelN.toFixed(4),
        ' 30', '0.0',
      );
      lines.push(' 40', '1.8');
      lines.push('  1', `${call.distance?.toFixed(2)}'`);
      lines.push(' 50', angleDeg.toFixed(2));
      lines.push(' 72', '1');
    }
  }

  // ── Monument Inserts ────────────────────────────────────────────────────

  private writeMonuments(lines: string[], data: ProjectData): void {
    const corners = this.getCorners(data);
    const monuments = data.reconciliation?.monuments || [];

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      const monument = monuments[i];
      const monType = monument?.type?.toUpperCase() || 'IRF';
      const blockName = `MON_${monType.replace(/[\s-]/g, '')}`;

      // INSERT block reference
      lines.push('  0', 'INSERT');
      lines.push('  8', 'MONUMENTS');
      lines.push('  2', blockName);
      lines.push(
        ' 10', corner.easting.toFixed(4),
        ' 20', corner.northing.toFixed(4),
        ' 30', '0.0',
      );
      lines.push(' 41', '1.0', ' 42', '1.0'); // scale

      // Monument label
      if (monument?.description) {
        lines.push('  0', 'TEXT');
        lines.push('  8', 'MONUMENTS');
        lines.push(
          ' 10', (corner.easting + 3).toFixed(4),
          ' 20', (corner.northing + 3).toFixed(4),
          ' 30', '0.0',
        );
        lines.push(' 40', '1.5');
        lines.push('  1', monument.description);
      }
    }
  }

  // ── Easement Entities ───────────────────────────────────────────────────

  private writeEasements(lines: string[], data: ProjectData): void {
    const easements = data.reconciliation?.easements || [];

    for (const easement of easements) {
      const coords = easement.coordinates || [];
      for (let i = 0; i < coords.length - 1; i++) {
        lines.push('  0', 'LINE');
        lines.push('  8', 'EASEMENTS');
        lines.push('  6', 'DASHED');
        lines.push(
          ' 10', (coords[i].easting || 0).toFixed(4),
          ' 20', (coords[i].northing || 0).toFixed(4),
          ' 30', '0.0',
        );
        lines.push(
          ' 11', (coords[i + 1].easting || 0).toFixed(4),
          ' 21', (coords[i + 1].northing || 0).toFixed(4),
          ' 31', '0.0',
        );
      }

      // Easement label
      if (easement.description && coords.length >= 2) {
        const midE = (coords[0].easting + coords[coords.length - 1].easting) / 2;
        const midN = (coords[0].northing + coords[coords.length - 1].northing) / 2;

        lines.push('  0', 'TEXT');
        lines.push('  8', 'EASEMENT-TEXT');
        lines.push(
          ' 10', midE.toFixed(4),
          ' 20', midN.toFixed(4),
          ' 30', '0.0',
        );
        lines.push(' 40', '1.5');
        lines.push('  1', easement.description);
      }
    }
  }

  // ── ROW Entities ────────────────────────────────────────────────────────

  private writeROW(lines: string[], data: ProjectData): void {
    const rowLines = data.rowData?.rowLines || [];

    for (const row of rowLines) {
      const coords = row.coordinates || [];
      for (let i = 0; i < coords.length - 1; i++) {
        lines.push('  0', 'LINE');
        lines.push('  8', 'ROW');
        lines.push('  6', 'DASHDOT');
        lines.push(
          ' 10', (coords[i].easting || 0).toFixed(4),
          ' 20', (coords[i].northing || 0).toFixed(4),
          ' 30', '0.0',
        );
        lines.push(
          ' 11', (coords[i + 1].easting || 0).toFixed(4),
          ' 21', (coords[i + 1].northing || 0).toFixed(4),
          ' 31', '0.0',
        );
      }

      // ROW label
      if (row.roadName && coords.length >= 2) {
        const midE = (coords[0].easting + coords[coords.length - 1].easting) / 2;
        const midN = (coords[0].northing + coords[coords.length - 1].northing) / 2;

        lines.push('  0', 'TEXT');
        lines.push('  8', 'ROW-TEXT');
        lines.push(
          ' 10', midE.toFixed(4),
          ' 20', midN.toFixed(4),
          ' 30', '0.0',
        );
        lines.push(' 40', '2.0');
        lines.push('  1', `${row.roadName} R.O.W.`);
      }
    }
  }

  // ── Adjacent Properties ─────────────────────────────────────────────────

  private writeAdjacent(lines: string[], data: ProjectData): void {
    const adjacent = data.crossValidation?.adjacentProperties || [];

    for (const prop of adjacent) {
      const coords = prop.boundaryCoordinates || [];
      for (let i = 0; i < coords.length - 1; i++) {
        lines.push('  0', 'LINE');
        lines.push('  8', 'ADJACENT');
        lines.push(
          ' 10', (coords[i].easting || 0).toFixed(4),
          ' 20', (coords[i].northing || 0).toFixed(4),
          ' 30', '0.0',
        );
        lines.push(
          ' 11', (coords[i + 1].easting || 0).toFixed(4),
          ' 21', (coords[i + 1].northing || 0).toFixed(4),
          ' 31', '0.0',
        );
      }

      // Owner label
      if (prop.ownerName && coords.length > 0) {
        const centroidE = coords.reduce((s: number, c: any) => s + (c.easting || 0), 0) / coords.length;
        const centroidN = coords.reduce((s: number, c: any) => s + (c.northing || 0), 0) / coords.length;

        lines.push('  0', 'TEXT');
        lines.push('  8', 'ADJACENT-TEXT');
        lines.push(
          ' 10', centroidE.toFixed(4),
          ' 20', centroidN.toFixed(4),
          ' 30', '0.0',
        );
        lines.push(' 40', '1.8');
        lines.push('  1', prop.ownerName);
        lines.push(' 72', '1');
      }
    }
  }

  // ── Confidence Annotations ──────────────────────────────────────────────

  private writeConfidenceAnnotations(
    lines: string[],
    data: ProjectData,
  ): void {
    const calls = this.getCalls(data);
    const corners = this.getCorners(data);

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const from = corners[i];
      const to = corners[(i + 1) % corners.length];

      if (!from || !to || call.confidence === undefined) continue;

      const midE = (from.easting + to.easting) / 2;
      const midN = (from.northing + to.northing) / 2;

      // Confidence % label
      lines.push('  0', 'TEXT');
      lines.push('  8', 'CONFIDENCE');
      lines.push(
        ' 10', (midE + 5).toFixed(4),
        ' 20', (midN + 5).toFixed(4),
        ' 30', '0.0',
      );
      lines.push(' 40', '1.2');
      lines.push('  1', `${call.confidence}%`);
    }
  }

  // ── Title Block ─────────────────────────────────────────────────────────

  private writeTitleBlock(
    lines: string[],
    data: ProjectData,
    config: ReportConfig,
  ): void {
    const corners = this.getCorners(data);
    if (corners.length === 0) return;

    const minE = Math.min(...corners.map((c) => c.easting));
    const minN = Math.min(...corners.map((c) => c.northing));

    // Place title block below and left of boundary
    const titleE = minE;
    const titleN = minN - 50;

    // Project title
    lines.push('  0', 'TEXT');
    lines.push('  8', 'TITLE');
    lines.push(
      ' 10', titleE.toFixed(4),
      ' 20', titleN.toFixed(4),
      ' 30', '0.0',
    );
    lines.push(' 40', '5.0');
    lines.push('  1', `BOUNDARY RESEARCH — ${data.address}`);
    lines.push('  7', 'TITLE');

    // Company info
    lines.push('  0', 'TEXT');
    lines.push('  8', 'TITLE');
    lines.push(
      ' 10', titleE.toFixed(4),
      ' 20', (titleN - 8).toFixed(4),
      ' 30', '0.0',
    );
    lines.push(' 40', '3.0');
    lines.push('  1', config.pdf.companyName);

    // Date and project ID
    lines.push('  0', 'TEXT');
    lines.push('  8', 'TITLE');
    lines.push(
      ' 10', titleE.toFixed(4),
      ' 20', (titleN - 14).toFixed(4),
      ' 30', '0.0',
    );
    lines.push(' 40', '2.5');
    lines.push('  1', `Project: ${data.projectId} | ${data.completedAt}`);

    // Coordinate system
    lines.push('  0', 'TEXT');
    lines.push('  8', 'TITLE');
    lines.push(
      ' 10', titleE.toFixed(4),
      ' 20', (titleN - 19).toFixed(4),
      ' 30', '0.0',
    );
    lines.push(' 40', '2.0');
    lines.push('  1', 'NAD83 Texas Central Zone (4203) | US Survey Feet');

    // Confidence
    const grade = data.confidence?.overallConfidence?.grade || 'N/A';
    const score = data.confidence?.overallConfidence?.score || 0;
    lines.push('  0', 'TEXT');
    lines.push('  8', 'TITLE');
    lines.push(
      ' 10', titleE.toFixed(4),
      ' 20', (titleN - 24).toFixed(4),
      ' 30', '0.0',
    );
    lines.push(' 40', '2.0');
    lines.push('  1', `Overall Confidence: ${score}% (Grade ${grade})`);
  }

  // ── Arc Entity ──────────────────────────────────────────────────────────

  private writeArc(
    lines: string[],
    layer: string,
    from: { easting: number; northing: number },
    to: { easting: number; northing: number },
    curve: any,
  ): void {
    if (!curve.radius) {
      // Fall back to LINE if no radius
      lines.push('  0', 'LINE');
      lines.push('  8', layer);
      lines.push(
        ' 10', from.easting.toFixed(4),
        ' 20', from.northing.toFixed(4),
        ' 30', '0.0',
      );
      lines.push(
        ' 11', to.easting.toFixed(4),
        ' 21', to.northing.toFixed(4),
        ' 31', '0.0',
      );
      return;
    }

    // Compute arc center from endpoints and radius
    const midE = (from.easting + to.easting) / 2;
    const midN = (from.northing + to.northing) / 2;
    const chordDist = Math.sqrt(
      (to.easting - from.easting) ** 2 + (to.northing - from.northing) ** 2,
    );
    const halfChord = chordDist / 2;
    const radius = curve.radius;

    if (halfChord > radius) {
      // Degenerate — draw as line
      lines.push('  0', 'LINE');
      lines.push('  8', layer);
      lines.push(
        ' 10', from.easting.toFixed(4),
        ' 20', from.northing.toFixed(4),
        ' 30', '0.0',
      );
      lines.push(
        ' 11', to.easting.toFixed(4),
        ' 21', to.northing.toFixed(4),
        ' 31', '0.0',
      );
      return;
    }

    const sagitta = radius - Math.sqrt(radius * radius - halfChord * halfChord);
    const perpE = -(to.northing - from.northing) / chordDist;
    const perpN = (to.easting - from.easting) / chordDist;

    // Default concavity: center on left side of travel direction
    const direction = curve.concavity === 'right' ? -1 : 1;
    const centerE = midE + direction * (radius - sagitta) * perpE;
    const centerN = midN + direction * (radius - sagitta) * perpN;

    // Compute start and end angles
    const startAngle =
      (Math.atan2(from.northing - centerN, from.easting - centerE) * 180) /
      Math.PI;
    const endAngle =
      (Math.atan2(to.northing - centerN, to.easting - centerE) * 180) /
      Math.PI;

    lines.push('  0', 'ARC');
    lines.push('  8', layer);
    lines.push(
      ' 10', centerE.toFixed(4),
      ' 20', centerN.toFixed(4),
      ' 30', '0.0',
    );
    lines.push(' 40', radius.toFixed(4));
    lines.push(' 50', startAngle.toFixed(2)); // start angle
    lines.push(' 51', endAngle.toFixed(2)); // end angle
  }

  // ── Data Accessors ──────────────────────────────────────────────────────

  private getCalls(data: ProjectData): any[] {
    const recon = data.reconciliationV2 || data.reconciliation;
    return recon?.reconciledCalls || recon?.calls || [];
  }

  private getCorners(
    data: ProjectData,
  ): { easting: number; northing: number }[] {
    const recon = data.reconciliationV2 || data.reconciliation;
    return recon?.corners || recon?.coordinates || [];
  }
}
