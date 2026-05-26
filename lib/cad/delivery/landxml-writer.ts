// lib/cad/delivery/landxml-writer.ts
//
// LandXML 1.2 writer — the COGO interchange format that Traverse
// PC, Civil 3D, Carlson, and Trimble Business Center all import.
// Unlike PNEZD ASCII (points only) or DXF (dumb CAD entities),
// LandXML carries:
//
//   * <CgPoints>     — numbered survey points with code + desc
//   * <PlanFeatures> — linework as a <CoordGeom> of <Line> and
//                      true <Curve> elements (radius + rotation),
//                      so arcs survive as real curves rather than
//                      being faceted into short chords.
//
// Coordinates ship as the source state-plane values (NAD83 Texas
// Central, US Survey Feet, EPSG:2277). LandXML coordinate order
// is "northing easting [elevation]" (Y then X), space-delimited.
//
// Pure: no I/O, no DOM. `exportToLandXML` returns the XML string;
// `downloadLandXML` is the browser anchor-click wrapper.

import type {
  ArcGeometry,
  DrawingDocument,
  Feature,
  Point2D,
  SplineGeometry,
} from '../types';
import { pointNumberOf, pointCodeOf, pointDescriptionOf } from '../feature-fields';

export interface LandXmlExportOptions {
  /** Sample density for SPLINE / ELLIPSE → polyline conversion.
   *  Default 32 segments. */
  curveSamples?: number;
  /** When true, hidden features still emit. Default false. */
  includeHidden?: boolean;
}

export function exportToLandXML(
  doc: DrawingDocument,
  options: LandXmlExportOptions = {}
): string {
  const samples = Math.max(2, options.curveSamples ?? 32);
  const includeHidden = !!options.includeHidden;
  const originN = doc.settings.displayPreferences?.originNorthing ?? 0;
  const originE = doc.settings.displayPreferences?.originEasting ?? 0;

  const N = (p: Point2D) => p.y + originN;
  const E = (p: Point2D) => p.x + originE;

  const features = Object.values(doc.features).filter((f) =>
    includeHidden ? true : !f.hidden
  );

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" ` +
      `version="1.2" date="${date}" time="${time}" readOnly="false">`
  );
  lines.push(
    '  <Units>' +
      '<Imperial areaUnit="squareFoot" linearUnit="USSurveyFoot" ' +
      'volumeUnit="cubicFeet" temperatureUnit="fahrenheit" ' +
      'pressureUnit="inHG" diameterUnit="inch" ' +
      'angularUnit="decimal degrees" directionUnit="decimal degrees"/>' +
      '</Units>'
  );
  lines.push(
    '  <CoordinateSystem epsgCode="2277" horizontalDatum="NAD83" ' +
      'desc="NAD83 Texas State Plane Central Zone 4203 (US Survey Feet)"/>'
  );
  lines.push(
    `  <Application name="STARR Surveying" desc="CAD drawing export" ` +
      `version="1.2" manufacturer="STARR" timeStamp="${now.toISOString()}"/>`
  );

  // ── CgPoints ────────────────────────────────────────────────
  const pointFeatures = features
    .filter((f) => f.geometry.type === 'POINT' && f.geometry.point)
    .sort((a, b) => {
      const na = Number(pointNumberOf(a) ?? Infinity);
      const nb = Number(pointNumberOf(b) ?? Infinity);
      return na - nb;
    });

  if (pointFeatures.length > 0) {
    lines.push('  <CgPoints>');
    let autoNo = 0;
    for (const f of pointFeatures) {
      const p = f.geometry.point!;
      // Never emit the internal UUID as a point name — fall back to a
      // sequential number so COGO points stay usable in Traverse PC.
      autoNo += 1;
      const name = pointNumberOf(f) ?? String(autoNo);
      const code = pointCodeOf(f);
      const desc = pointDescriptionOf(f);
      const elev = Number(f.properties?.elevation ?? 0);
      const attrs = [`name="${xmlAttr(name)}"`];
      if (code) attrs.push(`code="${xmlAttr(code)}"`);
      if (desc) attrs.push(`desc="${xmlAttr(desc)}"`);
      lines.push(
        `    <CgPoint ${attrs.join(' ')}>` +
          `${fixed(N(p))} ${fixed(E(p))} ${fixed(elev)}</CgPoint>`
      );
    }
    lines.push('  </CgPoints>');
  }

  // ── PlanFeatures (linework) ─────────────────────────────────
  const geomLines: string[] = [];
  let planIndex = 0;
  for (const f of features) {
    const coordGeom = buildCoordGeom(f, N, E, samples);
    if (!coordGeom.length) continue;
    planIndex += 1;
    const layerName =
      doc.layers[f.layerId]?.name ?? f.layerId ?? 'linework';
    const fname = `${xmlAttr(layerName)}-${planIndex}`;
    geomLines.push(`    <PlanFeature name="${fname}">`);
    geomLines.push('      <CoordGeom>');
    for (const seg of coordGeom) geomLines.push(`        ${seg}`);
    geomLines.push('      </CoordGeom>');
    geomLines.push('    </PlanFeature>');
  }

  if (geomLines.length > 0) {
    lines.push('  <PlanFeatures>');
    lines.push(...geomLines);
    lines.push('  </PlanFeatures>');
  }

  lines.push('</LandXML>');
  return lines.join('\r\n') + '\r\n';
}

/** Build the <Line>/<Curve> elements for one feature's CoordGeom. */
function buildCoordGeom(
  f: Feature,
  N: (p: Point2D) => number,
  E: (p: Point2D) => number,
  samples: number
): string[] {
  const g = f.geometry;
  const pt = (p: Point2D) => `${fixed(N(p))} ${fixed(E(p))}`;
  const lineSeg = (a: Point2D, b: Point2D) =>
    `<Line><Start>${pt(a)}</Start><End>${pt(b)}</End></Line>`;
  const polyline = (verts: Point2D[], closed: boolean): string[] => {
    const out: string[] = [];
    for (let i = 0; i < verts.length - 1; i += 1) {
      out.push(lineSeg(verts[i], verts[i + 1]));
    }
    if (closed && verts.length >= 3) {
      out.push(lineSeg(verts[verts.length - 1], verts[0]));
    }
    return out;
  };

  switch (f.type) {
    case 'LINE':
      return g.start && g.end ? [lineSeg(g.start, g.end)] : [];
    case 'POLYLINE':
      return g.vertices && g.vertices.length >= 2
        ? polyline(g.vertices, false)
        : [];
    case 'POLYGON':
      if (g.circle) return circleCurves(g.circle.center, g.circle.radius, pt);
      return g.vertices && g.vertices.length >= 3
        ? polyline(g.vertices, true)
        : [];
    case 'CIRCLE':
      return g.circle
        ? circleCurves(g.circle.center, g.circle.radius, pt)
        : [];
    case 'ARC':
      return g.arc ? [arcCurve(g.arc, pt)] : [];
    case 'MIXED_GEOMETRY':
      return g.vertices && g.vertices.length >= 2
        ? polyline(g.vertices, false)
        : [];
    case 'SPLINE':
      if (!g.spline) return [];
      return polyline(sampleSpline(g.spline, samples), g.spline.isClosed);
    case 'ELLIPSE':
      if (!g.ellipse) return [];
      return polyline(sampleEllipse(g.ellipse, samples), true);
    default:
      return [];
  }
}

/** A single ARC → LandXML <Curve> with rotation + radius. */
function arcCurve(a: ArcGeometry, pt: (p: Point2D) => string): string {
  const start: Point2D = {
    x: a.center.x + a.radius * Math.cos(a.startAngle),
    y: a.center.y + a.radius * Math.sin(a.startAngle),
  };
  const end: Point2D = {
    x: a.center.x + a.radius * Math.cos(a.endAngle),
    y: a.center.y + a.radius * Math.sin(a.endAngle),
  };
  const rot = a.anticlockwise ? 'ccw' : 'cw';
  return (
    `<Curve rot="${rot}" radius="${fixed(a.radius)}">` +
    `<Start>${pt(start)}</Start>` +
    `<Center>${pt(a.center)}</Center>` +
    `<End>${pt(end)}</End>` +
    `</Curve>`
  );
}

/** A full circle as two 180° <Curve> elements (LandXML has no
 *  circle primitive). */
function circleCurves(
  center: Point2D,
  radius: number,
  pt: (p: Point2D) => string
): string[] {
  const right: Point2D = { x: center.x + radius, y: center.y };
  const left: Point2D = { x: center.x - radius, y: center.y };
  const half = (s: Point2D, e: Point2D) =>
    `<Curve rot="ccw" radius="${fixed(radius)}">` +
    `<Start>${pt(s)}</Start><Center>${pt(center)}</Center><End>${pt(e)}</End>` +
    `</Curve>`;
  return [half(right, left), half(left, right)];
}

function sampleSpline(s: SplineGeometry, samplesPerCurve: number): Point2D[] {
  const cps = s.controlPoints;
  const out: Point2D[] = [];
  for (let i = 0; i + 3 < cps.length; i += 3) {
    const [p0, p1, p2, p3] = [cps[i], cps[i + 1], cps[i + 2], cps[i + 3]];
    if (out.length === 0) out.push(p0);
    for (let j = 1; j <= samplesPerCurve; j += 1) {
      const t = j / samplesPerCurve;
      const u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }
  return out;
}

function sampleEllipse(
  e: { center: Point2D; radiusX: number; radiusY: number; rotation: number },
  segments: number
): Point2D[] {
  const out: Point2D[] = [];
  const cosR = Math.cos(e.rotation);
  const sinR = Math.sin(e.rotation);
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const x = e.radiusX * Math.cos(t);
    const y = e.radiusY * Math.sin(t);
    out.push({
      x: e.center.x + x * cosR - y * sinR,
      y: e.center.y + x * sinR + y * cosR,
    });
  }
  return out;
}

function fixed(n: number): string {
  return n.toFixed(4);
}

function xmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Trigger a browser download of the LandXML for `doc`. */
export function downloadLandXML(
  doc: DrawingDocument,
  options: LandXmlExportOptions = {}
): { byteSize: number; filename: string } {
  if (typeof globalThis.document === 'undefined') {
    throw new Error('downloadLandXML can only run in the browser.');
  }
  const xml = exportToLandXML(doc, options);
  const baseName = doc.name.replace(/\.(xml|landxml)$/i, '');
  const filename = `${baseName || 'drawing'}.xml`;
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(globalThis.document.createElement('a'), {
    href: url,
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(url);
  return { byteSize: blob.size, filename };
}
