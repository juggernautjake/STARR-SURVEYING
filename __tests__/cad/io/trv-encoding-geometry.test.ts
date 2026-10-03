// __tests__/cad/io/trv-encoding-geometry.test.ts
//
// trv-full-support — decoding Traverse PC's Windows-1252 bytes, and the
// chord + signed-radius arc geometry every TRV curve is built from.

import { describe, it, expect } from 'vitest';
import { decodeTextBytes, detectTextEncoding, decodeWindows1252 } from '@/lib/cad/io/trv-encoding';
import {
  arcFromChordAndRadius, arcSegmentSignedArea, signedPolygonArea, sweep, sampleArc, azimuthDeg,
  emptyBounds, extendBoundsArc,
} from '@/lib/cad/io/trv-geometry';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { SYNTHETIC_TRV, toWindows1252Bytes } from './fixtures/trv-synthetic';

describe('decodeTextBytes', () => {
  it('decodes Traverse PC ANSI bytes: the degree sign and pilcrow survive', () => {
    const bytes = toWindows1252Bytes(SYNTHETIC_TRV);
    expect(detectTextEncoding(bytes)).toBe('windows-1252');
    const text = decodeTextBytes(bytes);
    expect(text).toBe(SYNTHETIC_TRV);
    // The same bytes read as UTF-8 (what File.text() does) lose both characters.
    expect(new TextDecoder('utf-8').decode(bytes)).toContain('�');
    const label = parseTrv(text).drawingElements.find((e) => e.header[0] === '15')!;
    expect(label.properties[0].join(',')).toContain('N 90°00\'00" E 100.00\'¶');
  });

  it('leaves real UTF-8 (and pure ASCII) alone', () => {
    const utf8 = new TextEncoder().encode('{"a":"N 10° E"}');
    expect(detectTextEncoding(utf8)).toBe('utf-8');
    expect(decodeTextBytes(utf8)).toBe('{"a":"N 10° E"}');
    expect(decodeTextBytes(new TextEncoder().encode('80,24.000'))).toBe('80,24.000');
  });

  it('honours byte-order marks', () => {
    const bom8 = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    expect(decodeTextBytes(bom8)).toBe('A');
    const le = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xb0, 0x00]);
    expect(decodeTextBytes(le)).toBe('A°');
  });

  it('maps the Windows-1252 0x80-0x9F block (smart quotes, euro)', () => {
    expect(decodeWindows1252(new Uint8Array([0x93, 0x94, 0x80, 0x81]))).toBe('“”€\u0081');
  });
});

describe('arcFromChordAndRadius — Traverse PC signed radius', () => {
  const a = { x: 5100, y: 5000 };
  const b = { x: 5100, y: 5100 };

  it('negative radius → centre on the LEFT, counter-clockwise, minor arc', () => {
    const arc = arcFromChordAndRadius(a, b, -100)!;
    expect(arc.center.x).toBeCloseTo(5100 - 50 * Math.sqrt(3), 6);
    expect(arc.center.y).toBeCloseTo(5050, 6);
    expect(arc.radius).toBe(100);
    expect(arc.anticlockwise).toBe(true);
    expect((arc.delta * 180) / Math.PI).toBeCloseTo(60, 9);
    expect(arc.length).toBeCloseTo((100 * Math.PI) / 3, 9);
    expect(arc.chord).toBeCloseTo(100, 9);
    // Bulges away from the centre (to +x of the chord).
    expect(arc.mid.x).toBeCloseTo(5100 - 50 * Math.sqrt(3) + 100, 6);
    expect(arc.mid.y).toBeCloseTo(5050, 6);
  });

  it('positive radius → centre on the RIGHT, clockwise', () => {
    const arc = arcFromChordAndRadius(a, b, 100)!;
    expect(arc.center.x).toBeCloseTo(5100 + 50 * Math.sqrt(3), 6);
    expect(arc.anticlockwise).toBe(false);
    expect(arc.mid.x).toBeLessThan(5100);
  });

  it('start / end angles put the endpoints back on the circle', () => {
    for (const r of [-100, 100, -60, 75]) {
      const arc = arcFromChordAndRadius(a, b, r)!;
      expect(arc.center.x + arc.radius * Math.cos(arc.startAngle)).toBeCloseTo(a.x, 6);
      expect(arc.center.y + arc.radius * Math.sin(arc.startAngle)).toBeCloseTo(a.y, 6);
      expect(arc.center.x + arc.radius * Math.cos(arc.endAngle)).toBeCloseTo(b.x, 6);
      expect(arc.center.y + arc.radius * Math.sin(arc.endAngle)).toBeCloseTo(b.y, 6);
    }
  });

  it('a semicircle (R = chord / 2) works; a radius shorter than that does not', () => {
    const semi = arcFromChordAndRadius(a, b, -50)!;
    expect(semi.delta).toBeCloseTo(Math.PI, 6);
    expect(arcFromChordAndRadius(a, b, -49)).toBeNull();
    expect(arcFromChordAndRadius(a, a, -49)).toBeNull();
    expect(arcFromChordAndRadius(a, b, 0)).toBeNull();
  });

  it('major arc option takes the long way round', () => {
    const major = arcFromChordAndRadius(a, b, -100, true)!;
    expect((major.delta * 180) / Math.PI).toBeCloseTo(300, 6);
  });

  it('samples, sweeps and bounds consistently', () => {
    const arc = arcFromChordAndRadius(a, b, -100)!;
    const pts = sampleArc(arc);
    expect(pts[0].x).toBeCloseTo(a.x, 6);
    expect(pts[pts.length - 1].y).toBeCloseTo(b.y, 6);
    for (const p of pts) expect(Math.hypot(p.x - arc.center.x, p.y - arc.center.y)).toBeCloseTo(100, 6);
    expect(sweep(0, Math.PI / 2, true)).toBeCloseTo(Math.PI / 2, 9);
    expect(sweep(0, Math.PI / 2, false)).toBeCloseTo(1.5 * Math.PI, 9);
    const bb = emptyBounds();
    extendBoundsArc(bb, arc);
    // The arc's east-most point (angle 0 from the centre) is inside its sweep.
    expect(bb.maxX).toBeCloseTo(arc.center.x + 100, 6);
  });

  it('adds the circular segment to a closed ring area', () => {
    const ring = [{ x: 5000, y: 5000 }, a, b, { x: 5000, y: 5100 }];
    const arc = arcFromChordAndRadius(a, b, -100)!;
    const area = signedPolygonArea(ring) + arcSegmentSignedArea(arc);
    expect(area).toBeCloseTo(10000 + 5000 * (Math.PI / 3 - Math.sin(Math.PI / 3)), 6);
  });

  it('azimuths are clockwise from north', () => {
    expect(azimuthDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0, 9);
    expect(azimuthDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 9);
    expect(azimuthDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(270, 9);
  });
});
