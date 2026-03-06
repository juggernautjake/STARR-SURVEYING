// worker/src/reports/svg-renderer.ts — Phase 10 §10.4 (Module 1)
// Converts a ReconciledBoundaryModel into a publication-quality SVG vector
// boundary drawing with confidence color-coding, monument symbols, curve arcs,
// bearing/distance labels, north arrow, scale bar, and legend.
//
// Spec §10.4 — SVG Boundary Renderer

import type {
  ReportConfig,
  ProjectData,
  Point2D,
  DrawingExtent,
} from '../types/reports.js';

// ── Monument symbol definitions ─────────────────────────────────────────────

const MONUMENT_SYMBOLS: Record<string, string> = {
  IRF: `<symbol id="mon-irf" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="10" cy="10" r="2" fill="#000"/></symbol>`,
  IRS: `<symbol id="mon-irs" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="#000" stroke-width="1.5"/><line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/></symbol>`,
  IPF: `<symbol id="mon-ipf" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="10" cy="10" r="2" fill="#000"/></symbol>`,
  IPS: `<symbol id="mon-ips" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" fill="none" stroke="#000" stroke-width="1.5"/><line x1="5" y1="5" x2="15" y2="15" stroke="#000" stroke-width="1.5"/><line x1="15" y1="5" x2="5" y2="15" stroke="#000" stroke-width="1.5"/></symbol>`,
  CONC: `<symbol id="mon-conc" viewBox="0 0 20 20"><polygon points="10,2 18,18 2,18" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="10" cy="13" r="2" fill="#000"/></symbol>`,
  MAG: `<symbol id="mon-mag" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="#000" stroke-width="1.5"/><line x1="10" y1="3" x2="10" y2="17" stroke="#000" stroke-width="1.0"/><line x1="3" y1="10" x2="17" y2="10" stroke="#000" stroke-width="1.0"/></symbol>`,
  PKnail: `<symbol id="mon-pkn" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3" fill="#000"/><line x1="10" y1="2" x2="10" y2="18" stroke="#000" stroke-width="1.0"/><line x1="2" y1="10" x2="18" y2="10" stroke="#000" stroke-width="1.0"/></symbol>`,
  UNKNOWN: `<symbol id="mon-unk" viewBox="0 0 20 20"><circle cx="10" cy="10" r="6" fill="none" stroke="#000" stroke-width="1.0" stroke-dasharray="3,2"/></symbol>`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function confidenceColor(score: number): string {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#EAB308';
  if (score >= 40) return '#F97316';
  return '#EF4444';
}

function bearingToAzimuth(bearing: string): number {
  const m = bearing?.match(
    /([NS])\s*(\d+)[°]\s*(\d+)[''′]\s*([\d.]+)?[""″]?\s*([EW])/i,
  );
  if (!m) return 0;
  const decimal =
    parseInt(m[2]) + parseInt(m[3]) / 60 + parseFloat(m[4] || '0') / 3600;
  const ns = m[1].toUpperCase();
  const ew = m[5].toUpperCase();
  if (ns === 'N' && ew === 'E') return decimal;
  if (ns === 'S' && ew === 'E') return 180 - decimal;
  if (ns === 'S' && ew === 'W') return 180 + decimal;
  if (ns === 'N' && ew === 'W') return 360 - decimal;
  return 0;
}

function computeCorners(model: any, pobN = 0, pobE = 0): Point2D[] {
  const corners: Point2D[] = [];
  let curN = pobN;
  let curE = pobE;
  corners.push({ x: 0, y: 0, northing: curN, easting: curE });

  const calls = model.reconciledPerimeter?.calls || [];
  for (const call of calls) {
    let brg: string;
    let dist: number;
    if (call.type === 'curve' && call.reconciledCurve) {
      brg =
        call.reconciledCurve.chordBearing || call.reconciledBearing || '';
      dist =
        call.reconciledCurve.chordDistance || call.reconciledDistance || 0;
    } else {
      brg = call.reconciledBearing || '';
      dist = call.reconciledDistance || 0;
    }
    const azRad = (bearingToAzimuth(brg) * Math.PI) / 180;
    curN += dist * Math.cos(azRad);
    curE += dist * Math.sin(azRad);
    corners.push({ x: 0, y: 0, northing: curN, easting: curE });
  }
  return corners;
}

function computeExtent(
  corners: Point2D[],
  width: number,
  height: number,
): DrawingExtent {
  const ns = corners.map((c) => c.northing);
  const es = corners.map((c) => c.easting);
  const minN = Math.min(...ns);
  const maxN = Math.max(...ns);
  const minE = Math.min(...es);
  const maxE = Math.max(...es);
  const rangeN = maxN - minN || 1;
  const rangeE = maxE - minE || 1;
  const pad = 0.15;
  const drawW = width * (1 - 2 * pad);
  const drawH = height * (1 - 2 * pad);
  const scaleFactor = Math.min(drawW / rangeE, drawH / rangeN);
  return {
    minN,
    maxN,
    minE,
    maxE,
    rangeN,
    rangeE,
    scaleFactor,
    paddingLeft: width * pad,
    paddingTop: height * pad,
    paddingRight: width * pad,
    paddingBottom: height * pad,
  };
}

function toSVG(
  northing: number,
  easting: number,
  ext: DrawingExtent,
): { x: number; y: number } {
  return {
    x: (easting - ext.minE) * ext.scaleFactor + ext.paddingLeft,
    y: (ext.maxN - northing) * ext.scaleFactor + ext.paddingTop,
  };
}

function midpoint(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function lineAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

function parseDelta(delta: string): number {
  const m = delta?.match(/(\d+)[°]\s*(\d+)[''′]\s*([\d.]+)/);
  if (!m) return 0;
  return parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600;
}

function roundScaleBar(feet: number): number {
  const candidates = [10, 20, 25, 50, 100, 150, 200, 250, 500, 1000];
  return candidates.reduce((prev, curr) =>
    Math.abs(curr - feet) < Math.abs(prev - feet) ? curr : prev,
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── SVG Boundary Renderer ───────────────────────────────────────────────────

export class SVGBoundaryRenderer {
  private config: ReportConfig;

  constructor(config: ReportConfig) {
    this.config = config;
  }

  render(data: {
    model: any;
    confidence: any;
    discovery: ProjectData['discovery'];
    rowData?: any;
    crossValidation?: any;
  }): string {
    const { model, confidence, discovery } = data;
    const conf = this.config.drawing;
    const corners = computeCorners(model);
    const ext = computeExtent(corners, conf.width, conf.height);
    const svgCorners = corners.map((c) => ({
      ...toSVG(c.northing, c.easting, ext),
      northing: c.northing,
      easting: c.easting,
    }));

    const parts: string[] = [];

    // Header
    parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${conf.width} ${conf.height}" width="${conf.width}" height="${conf.height}">`,
    );

    // Styles
    parts.push(`<style>`);
    parts.push(
      `  .boundary-line { stroke: ${conf.boundaryColor}; stroke-width: 2; fill: none; }`,
    );
    parts.push(
      `  .lot-line { stroke: ${conf.lotLineColor}; stroke-width: 1; fill: none; stroke-dasharray: 8,4; }`,
    );
    parts.push(
      `  .easement-line { stroke: ${conf.easementColor}; stroke-width: 1.5; fill: none; stroke-dasharray: 12,4,4,4; }`,
    );
    parts.push(
      `  .row-line { stroke: ${conf.rowColor}; stroke-width: 1.5; fill: none; stroke-dasharray: 6,3; }`,
    );
    parts.push(
      `  .bearing-label { font-family: 'Courier New', monospace; font-size: 9px; fill: #333; }`,
    );
    parts.push(
      `  .distance-label { font-family: 'Courier New', monospace; font-size: 9px; fill: #333; }`,
    );
    parts.push(
      `  .lot-label { font-family: Arial, sans-serif; font-size: 14px; fill: #000; font-weight: bold; text-anchor: middle; }`,
    );
    parts.push(
      `  .acreage-label { font-family: Arial, sans-serif; font-size: 10px; fill: #555; text-anchor: middle; }`,
    );
    parts.push(
      `  .adjacent-label { font-family: Arial, sans-serif; font-size: 8px; fill: #666; text-anchor: middle; }`,
    );
    parts.push(
      `  .title-text { font-family: Arial, sans-serif; font-size: 18px; fill: #000; font-weight: bold; }`,
    );
    parts.push(
      `  .subtitle-text { font-family: Arial, sans-serif; font-size: 12px; fill: #333; }`,
    );
    parts.push(
      `  .pob-label { font-family: Arial, sans-serif; font-size: 10px; fill: #CC0000; font-weight: bold; }`,
    );
    parts.push(
      `  .curve-label { font-family: 'Courier New', monospace; font-size: 8px; fill: #0066CC; }`,
    );
    parts.push(
      `  .confidence-badge { font-family: Arial, sans-serif; font-size: 7px; fill: #FFF; }`,
    );
    parts.push(`</style>`);

    // Defs
    parts.push(`<defs>`);
    Object.values(MONUMENT_SYMBOLS).forEach((sym) => parts.push(`  ${sym}`));
    parts.push(
      `  <marker id="north-arrow" viewBox="0 0 10 10" refX="5" refY="10" markerWidth="8" markerHeight="8" orient="auto">`,
    );
    parts.push(`    <polygon points="5,0 10,10 5,7 0,10" fill="#000"/>`);
    parts.push(`  </marker>`);
    parts.push(`</defs>`);

    // Background
    parts.push(
      `<rect width="100%" height="100%" fill="${conf.backgroundColor}"/>`,
    );

    // Title block
    parts.push(
      `<text x="20" y="30" class="title-text">${escapeXml(discovery.ownerName)}</text>`,
    );
    parts.push(
      `<text x="20" y="48" class="subtitle-text">${escapeXml(discovery.subdivision || 'Unplatted Tract')}${discovery.lot ? ` — Lot ${discovery.lot}` : ''}${discovery.block ? `, Block ${discovery.block}` : ''}</text>`,
    );
    parts.push(
      `<text x="20" y="64" class="subtitle-text" style="fill:#666">${escapeXml(discovery.situs)} — ${discovery.acreage.toFixed(4)} acres</text>`,
    );

    // Boundary lines
    const calls = model.reconciledPerimeter?.calls || [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const startPt = svgCorners[i];
      const endPt = svgCorners[i + 1] || svgCorners[0];
      const callConf = confidence.callConfidence?.find(
        (c: any) => c.callId === call.callId,
      );
      const confScore = callConf?.score ?? 50;
      const lineColor = conf.showConfidenceColors
        ? confidenceColor(confScore)
        : conf.boundaryColor;

      if (call.type === 'curve' && call.reconciledCurve) {
        const delta = parseDelta(call.reconciledCurve.delta || '0°00\'00"');
        const scaledR = call.reconciledCurve.radius * ext.scaleFactor;
        const largeArc = delta > 180 ? 1 : 0;
        const sweep =
          (call.reconciledCurve.direction || 'right') === 'right' ? 1 : 0;
        parts.push(
          `<path d="M ${startPt.x.toFixed(2)} ${startPt.y.toFixed(2)} A ${scaledR.toFixed(2)} ${scaledR.toFixed(2)} 0 ${largeArc} ${sweep} ${endPt.x.toFixed(2)} ${endPt.y.toFixed(2)}" stroke="${lineColor}" stroke-width="2" fill="none"/>`,
        );
        if (conf.showCurveAnnotations) {
          const mid = midpoint(startPt, endPt);
          const offset = sweep === 1 ? 15 : -15;
          parts.push(
            `<text x="${mid.x}" y="${mid.y + offset}" class="curve-label" text-anchor="middle">R=${call.reconciledCurve.radius.toFixed(2)}' Δ=${call.reconciledCurve.delta}</text>`,
          );
        }
      } else {
        parts.push(
          `<line x1="${startPt.x.toFixed(2)}" y1="${startPt.y.toFixed(2)}" x2="${endPt.x.toFixed(2)}" y2="${endPt.y.toFixed(2)}" stroke="${lineColor}" stroke-width="2"/>`,
        );
      }

      // Bearing label
      if (conf.showBearingLabels && call.reconciledBearing) {
        const mid = midpoint(startPt, endPt);
        const angle = lineAngle(startPt, endPt);
        parts.push(
          `<text x="${mid.x.toFixed(2)}" y="${(mid.y - 8).toFixed(2)}" class="bearing-label" text-anchor="middle" transform="rotate(${angle.toFixed(1)}, ${mid.x.toFixed(2)}, ${(mid.y - 8).toFixed(2)})">${escapeXml(call.reconciledBearing)}</text>`,
        );
      }

      // Distance label
      if (conf.showDistanceLabels && call.reconciledDistance) {
        const mid = midpoint(startPt, endPt);
        const angle = lineAngle(startPt, endPt);
        parts.push(
          `<text x="${mid.x.toFixed(2)}" y="${(mid.y + 14).toFixed(2)}" class="distance-label" text-anchor="middle" transform="rotate(${angle.toFixed(1)}, ${mid.x.toFixed(2)}, ${(mid.y + 14).toFixed(2)})">${call.reconciledDistance.toFixed(2)}'</text>`,
        );
      }

      // Confidence badge
      if (conf.showConfidenceColors && callConf) {
        const mid = midpoint(startPt, endPt);
        parts.push(
          `<circle cx="${(mid.x + 20).toFixed(2)}" cy="${(mid.y - 2).toFixed(2)}" r="8" fill="${confidenceColor(confScore)}" opacity="0.8"/>`,
        );
        parts.push(
          `<text x="${(mid.x + 20).toFixed(2)}" y="${(mid.y + 1).toFixed(2)}" class="confidence-badge" text-anchor="middle">${confScore}</text>`,
        );
      }
    }

    // Monument symbols
    if (conf.showMonuments) {
      for (let i = 0; i < svgCorners.length - 1; i++) {
        const pt = svgCorners[i];
        const call = calls[i] || calls[0];
        const monType = call?.monument || 'UNKNOWN';
        const symId = this.monumentSymbolId(monType);
        parts.push(
          `<use href="#${symId}" x="${(pt.x - 8).toFixed(2)}" y="${(pt.y - 8).toFixed(2)}" width="16" height="16"/>`,
        );
      }
    }

    // POB label
    const pob = svgCorners[0];
    parts.push(
      `<text x="${(pob.x + 12).toFixed(2)}" y="${(pob.y - 12).toFixed(2)}" class="pob-label">POB</text>`,
    );

    // Lot labels
    if (conf.showLotLabels && model.reconciledLots) {
      for (const lot of model.reconciledLots) {
        const lotCorners = this.computeLotCorners(lot, ext);
        if (lotCorners.length > 2) {
          const cx =
            lotCorners.reduce((s: number, p: any) => s + p.x, 0) /
            lotCorners.length;
          const cy =
            lotCorners.reduce((s: number, p: any) => s + p.y, 0) /
            lotCorners.length;
          parts.push(
            `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" class="lot-label">Lot ${lot.lotId}</text>`,
          );
          if (lot.reconciledAcreage) {
            parts.push(
              `<text x="${cx.toFixed(2)}" y="${(cy + 16).toFixed(2)}" class="acreage-label">${lot.reconciledAcreage.toFixed(4)} ac</text>`,
            );
          }
        }
      }
    }

    // North arrow
    if (conf.showNorthArrow) {
      const naX = conf.width - 60;
      parts.push(`<g transform="translate(${naX}, 80)">`);
      parts.push(
        `  <line x1="0" y1="40" x2="0" y2="0" stroke="#000" stroke-width="2" marker-end="url(#north-arrow)"/>`,
      );
      parts.push(
        `  <text x="0" y="-8" text-anchor="middle" style="font-family:Arial;font-size:14px;font-weight:bold">N</text>`,
      );
      parts.push(`</g>`);
    }

    // Scale bar
    if (conf.showScaleBar) {
      const sbY = conf.height - 40;
      const targetPx = conf.width * 0.2;
      const targetFt = targetPx / ext.scaleFactor;
      const roundFt = roundScaleBar(targetFt);
      const barPx = roundFt * ext.scaleFactor;
      parts.push(`<g transform="translate(40, ${sbY})">`);
      parts.push(
        `  <line x1="0" y1="0" x2="${barPx.toFixed(2)}" y2="0" stroke="#000" stroke-width="2"/>`,
      );
      parts.push(
        `  <line x1="0" y1="-5" x2="0" y2="5" stroke="#000" stroke-width="1.5"/>`,
      );
      parts.push(
        `  <line x1="${barPx.toFixed(2)}" y1="-5" x2="${barPx.toFixed(2)}" y2="5" stroke="#000" stroke-width="1.5"/>`,
      );
      parts.push(
        `  <text x="${(barPx / 2).toFixed(2)}" y="16" text-anchor="middle" style="font-family:Arial;font-size:10px">${roundFt} ft</text>`,
      );
      parts.push(`</g>`);
    }

    // Legend
    if (conf.showLegend) {
      parts.push(this.renderLegend(conf));
    }

    // Confidence summary box
    const overallScore = confidence.overallConfidence?.score ?? 0;
    const overallGrade = confidence.overallConfidence?.grade ?? 'N/A';
    const closureRatio =
      model.reconciledPerimeter?.closure?.closureRatio ?? 'N/A';
    const bx = conf.width - 200;
    const by = conf.height - 100;
    parts.push(`<g transform="translate(${bx}, ${by})">`);
    parts.push(
      `  <rect x="0" y="0" width="180" height="80" rx="4" fill="#F8F9FA" stroke="#DEE2E6" stroke-width="1"/>`,
    );
    parts.push(
      `  <text x="90" y="18" text-anchor="middle" style="font-family:Arial;font-size:11px;font-weight:bold">Research Confidence</text>`,
    );
    parts.push(
      `  <text x="90" y="40" text-anchor="middle" style="font-family:Arial;font-size:24px;font-weight:bold;fill:${confidenceColor(overallScore)}">${overallGrade} (${overallScore})</text>`,
    );
    parts.push(
      `  <text x="90" y="58" text-anchor="middle" style="font-family:Arial;font-size:10px;fill:#666">Closure: ${closureRatio}</text>`,
    );
    parts.push(
      `  <text x="90" y="72" text-anchor="middle" style="font-family:Arial;font-size:9px;fill:#999">AI Research — Not a Survey</text>`,
    );
    parts.push(`</g>`);

    parts.push(`</svg>`);
    return parts.join('\n');
  }

  private monumentSymbolId(type: string): string {
    const map: Record<string, string> = {
      IRF: 'mon-irf',
      iron_rod_found: 'mon-irf',
      IRS: 'mon-irs',
      iron_rod_set: 'mon-irs',
      IPF: 'mon-ipf',
      iron_pipe_found: 'mon-ipf',
      IPS: 'mon-ips',
      iron_pipe_set: 'mon-ips',
      CONC: 'mon-conc',
      concrete: 'mon-conc',
      MAG: 'mon-mag',
      mag_nail: 'mon-mag',
      PKnail: 'mon-pkn',
      pk_nail: 'mon-pkn',
    };
    return map[type] || 'mon-unk';
  }

  private renderLegend(conf: ReportConfig['drawing']): string {
    const lx = 20;
    const ly = conf.height - 160;
    const lines: string[] = [];
    lines.push(`<g transform="translate(${lx}, ${ly})">`);
    lines.push(
      `  <rect x="0" y="0" width="160" height="120" rx="4" fill="#F8F9FA" stroke="#DEE2E6" stroke-width="1"/>`,
    );
    lines.push(
      `  <text x="10" y="16" style="font-family:Arial;font-size:10px;font-weight:bold">Legend</text>`,
    );

    let row = 0;
    const addItem = (color: string, dash: string, label: string) => {
      const y = 30 + row * 16;
      lines.push(
        `  <line x1="10" y1="${y}" x2="40" y2="${y}" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`,
      );
      lines.push(
        `  <text x="48" y="${y + 4}" style="font-family:Arial;font-size:9px;fill:#333">${label}</text>`,
      );
      row++;
    };

    addItem(conf.boundaryColor, '', 'Boundary');
    addItem(conf.lotLineColor, '8,4', 'Lot Line');
    addItem(conf.easementColor, '12,4,4,4', 'Easement');
    addItem(conf.rowColor, '6,3', 'Right-of-Way');
    addItem(conf.adjacentColor, '4,4', 'Adjacent');

    lines.push(`</g>`);
    return lines.join('\n');
  }

  private computeLotCorners(
    lot: any,
    ext: DrawingExtent,
  ): { x: number; y: number }[] {
    if (!lot.calls || lot.calls.length === 0) return [];
    const corners: { x: number; y: number }[] = [];
    let curN = 0;
    let curE = 0;
    corners.push(toSVG(curN, curE, ext));
    for (const call of lot.calls) {
      const az = bearingToAzimuth(
        call.reconciledBearing || call.bearing || '',
      );
      const dist = call.reconciledDistance || call.distance || 0;
      const rad = (az * Math.PI) / 180;
      curN += dist * Math.cos(rad);
      curE += dist * Math.sin(rad);
      corners.push(toSVG(curN, curE, ext));
    }
    return corners;
  }
}
