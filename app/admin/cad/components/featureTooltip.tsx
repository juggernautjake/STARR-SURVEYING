'use client';
// app/admin/cad/components/featureTooltip.tsx
//
// Phase 8 §6.1 — feature-hover tooltip content builder.
// Returns a React node summarising the feature under the
// cursor (bearing/length for LINE, R/Δ/L for ARC, name +
// code + N/E for POINT, etc.). Pure render — caller hands
// it to `TooltipProvider.showTooltip` keyed off the
// canvas-side hit-test result.

import type { ReactNode } from 'react';

import {
  formatBearing,
  inverseBearingDistance,
} from '@/lib/cad/geometry/bearing';
import { computeAreaFromPoints2D } from '@/lib/cad/geometry/area';
import type {
  ArcGeometry,
  CircleGeometry,
  DrawingDocument,
  EllipseGeometry,
  Feature,
  Point2D,
} from '@/lib/cad/types';

export function buildFeatureTooltip(
  feature: Feature,
  doc: DrawingDocument
): ReactNode {
  const layerName =
    doc.layers[feature.layerId]?.name ?? feature.layerId;
  const code =
    typeof feature.properties?.rawCode === 'string'
      ? feature.properties.rawCode
      : null;
  const aiLabel =
    typeof feature.properties?.aiLabel === 'string'
      ? feature.properties.aiLabel
      : null;
  const description =
    typeof feature.properties?.description === 'string'
      ? feature.properties.description
      : null;

  const title = aiLabel ?? description ?? defaultTitle(feature);

  return (
    <>
      <strong>{title}</strong>
      {renderGeometry(feature, doc)}
      <Row label="Layer" value={layerName} />
      {code ? <Row label="Code" value={code} /> : null}
      {feature.properties?.material ? (
        <Row label="Material" value={String(feature.properties.material)} />
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Per-type renderers
// ────────────────────────────────────────────────────────────

function renderGeometry(
  feature: Feature,
  doc: DrawingDocument
): ReactNode {
  const g = feature.geometry;
  switch (feature.type) {
    case 'POINT': {
      const p = g.point ?? g.start;
      if (!p) return null;
      const fromName = findPointName(p, doc);
      return (
        <>
          <Row label="N" value={p.y.toFixed(3)} />
          <Row label="E" value={p.x.toFixed(3)} />
          {fromName ? <Row label="Name" value={fromName} /> : null}
        </>
      );
    }
    case 'LINE': {
      if (!g.start || !g.end) return null;
      const inv = inverseBearingDistance(g.start, g.end);
      return (
        <>
          <Row label="Bearing" value={formatBearing(inv.azimuth)} />
          <Row label="Length" value={`${inv.distance.toFixed(2)}'`} />
          {pointTags(g.start, g.end, doc)}
        </>
      );
    }
    case 'POLYLINE':
    case 'POLYGON': {
      const verts = g.vertices ?? [];
      if (verts.length < 2) return null;
      const length = polylineLength(verts, feature.type === 'POLYGON');
      const rows: ReactNode[] = [
        <Row key="vc"  label="Vertices" value={String(verts.length)} />,
        <Row key="len" label="Length"   value={`${length.toFixed(2)}'`} />,
      ];
      if (feature.type === 'POLYGON' && verts.length >= 3) {
        const area = computeAreaFromPoints2D(verts);
        rows.push(
          <Row
            key="area"
            label="Area"
            value={`${Math.round(area.squareFeet).toLocaleString()} ft² (${area.acres.toFixed(4)} ac)`}
          />
        );
      }
      return <>{rows}</>;
    }
    case 'CIRCLE': {
      const c = g.circle as CircleGeometry | undefined;
      if (!c) return null;
      return (
        <>
          <Row label="Radius" value={`${c.radius.toFixed(2)}'`} />
          <Row label="Center" value={`${c.center.y.toFixed(2)} N, ${c.center.x.toFixed(2)} E`} />
        </>
      );
    }
    case 'ELLIPSE': {
      const e = g.ellipse as EllipseGeometry | undefined;
      if (!e) return null;
      return (
        <>
          <Row label="Major" value={`${e.radiusX.toFixed(2)}'`} />
          <Row label="Minor" value={`${e.radiusY.toFixed(2)}'`} />
          <Row label="Rotation" value={`${((e.rotation * 180) / Math.PI).toFixed(2)}°`} />
        </>
      );
    }
    case 'ARC': {
      const a = g.arc as ArcGeometry | undefined;
      if (!a) return null;
      let span = a.endAngle - a.startAngle;
      if (a.anticlockwise && span < 0) span += Math.PI * 2;
      if (!a.anticlockwise && span > 0) span -= Math.PI * 2;
      const delta = Math.abs(span);
      const arcLen = a.radius * delta;
      const chord = 2 * a.radius * Math.sin(delta / 2);
      const startPt: Point2D = {
        x: a.center.x + a.radius * Math.cos(a.startAngle),
        y: a.center.y + a.radius * Math.sin(a.startAngle),
      };
      const endPt: Point2D = {
        x: a.center.x + a.radius * Math.cos(a.endAngle),
        y: a.center.y + a.radius * Math.sin(a.endAngle),
      };
      const chordBearing = inverseBearingDistance(startPt, endPt).azimuth;
      return (
        <>
          <Row label="R" value={`${a.radius.toFixed(2)}'`} />
          <Row label="Δ" value={`${((delta * 180) / Math.PI).toFixed(4)}°`} />
          <Row label="L" value={`${arcLen.toFixed(2)}'`} />
          <Row label="C" value={`${chord.toFixed(2)}'`} />
          <Row label="CB" value={formatBearing(chordBearing)} />
        </>
      );
    }
    case 'TEXT':
      return (
        <Row
          label="Text"
          value={
            typeof g.textContent === 'string'
              ? truncate(g.textContent, 60)
              : '(empty)'
          }
        />
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function defaultTitle(feature: Feature): string {
  switch (feature.type) {
    case 'POINT':    return 'Point';
    case 'LINE':     return 'Line';
    case 'POLYLINE': return 'Polyline';
    case 'POLYGON':  return 'Polygon';
    case 'CIRCLE':   return 'Circle';
    case 'ELLIPSE':  return 'Ellipse';
    case 'ARC':      return 'Arc';
    case 'SPLINE':   return 'Spline';
    case 'TEXT':     return 'Text';
    case 'IMAGE':    return 'Image';
    default:         return 'Feature';
  }
}

function pointTags(
  start: Point2D,
  end: Point2D,
  doc: DrawingDocument
): ReactNode {
  const fromName = findPointName(start, doc);
  const toName = findPointName(end, doc);
  if (!fromName && !toName) return null;
  return (
    <>
      {fromName ? <Row label="From" value={fromName} /> : null}
      {toName ? <Row label="To" value={toName} /> : null}
    </>
  );
}

function findPointName(
  p: Point2D,
  doc: DrawingDocument
): string | null {
  // O(n) scan — fine for the hover hot-path because the
  // hit-test already narrowed candidates. Only POINT
  // features carry a name.
  const tol = 0.001;
  for (const f of Object.values(doc.features)) {
    if (f.type !== 'POINT' || !f.geometry.point) continue;
    const dx = f.geometry.point.x - p.x;
    const dy = f.geometry.point.y - p.y;
    if (Math.abs(dx) < tol && Math.abs(dy) < tol) {
      const name = f.properties?.pointName ?? f.properties?.pointNumber;
      if (typeof name === 'string' && name.length > 0) return name;
      if (typeof name === 'number') return String(name);
      return null;
    }
  }
  return null;
}

function polylineLength(verts: Point2D[], closed: boolean): number {
  let total = 0;
  for (let i = 0; i + 1 < verts.length; i += 1) {
    total += Math.hypot(
      verts[i + 1].x - verts[i].x,
      verts[i + 1].y - verts[i].y
    );
  }
  if (closed && verts.length > 1) {
    const last = verts[verts.length - 1];
    const first = verts[0];
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return total;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: '#94A3B8' }}>{label}</span>
      <span style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}
