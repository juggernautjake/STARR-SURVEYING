// __tests__/files/trv-preview.test.ts
//
// trv-full-support — Traverse PC files in the shared file viewer: which
// files are TRV, the SVG the preview draws (true arcs, pen-up gaps,
// escaped text, layer groups), the view-box maths, the hand-off to CAD,
// and the viewer wiring. Synthetic, made-up data only.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTrv } from '@/lib/cad/io/trv-parser';
import { buildTrvModel, type TrvPathSegment } from '@/lib/cad/io/trv-model';
import { arcFromChordAndRadius } from '@/lib/cad/io/trv-geometry';
import {
  trvFormat, isTrv, frameFor, renderTrvSvg, svgArcTo, svgPathData, escapeXml, fitViewBox, zoomViewBox,
  summaryLine, panelLayers, TRV_MAX_BYTES,
} from '@/lib/files/trv-preview';
import { fileKind } from '@/lib/files/viewer-model';
import { stashPendingCadOpen, consumePendingCadOpen, PENDING_OPEN_KEY, PENDING_OPEN_MAX_AGE_MS } from '@/lib/cad/io/pending-open';
import { SYNTHETIC_TRV } from '../cad/io/fixtures/trv-synthetic';

const model = buildTrvModel(parseTrv(SYNTHETIC_TRV));
const frame = frameFor(model);

describe('trvFormat / isTrv', () => {
  it('recognises .TRV and .TRB by name, whatever the type says', () => {
    expect(trvFormat('Lot 9.TRV')).toBe('trv');
    expect(trvFormat('lot.trv', 'application/octet-stream')).toBe('trv');
    expect(trvFormat('LOT.TRB', 'text/plain')).toBe('trb');
    expect(isTrv('survey.trv.pdf')).toBe(false);
    expect(isTrv('notes.txt', 'text/plain')).toBe(false);
    expect(isTrv(null)).toBe(false);
    expect(TRV_MAX_BYTES).toBeGreaterThan(1_000_000);
  });

  it('leaves fileKind alone (it also decides which folders accept an upload)', () => {
    expect(fileKind('lot.trv', null)).toBe('other');
    expect(fileKind('lot.trv', 'text/plain')).toBe('text');
  });
});

describe('SVG geometry', () => {
  it('a counter-clockwise world arc is a sweep-flag-1 SVG arc (y is flipped)', () => {
    const fr = { ox: 0, oy: 0 };
    const ccw = arcFromChordAndRadius({ x: 100, y: 0 }, { x: 100, y: 100 }, -100)!;
    expect(svgArcTo(fr, ccw)).toBe('A100 100 0 0 1 100 -100');
    const cw = arcFromChordAndRadius({ x: 100, y: 0 }, { x: 100, y: 100 }, 100)!;
    expect(svgArcTo(fr, cw)).toBe('A100 100 0 0 0 100 -100');
    const major = arcFromChordAndRadius({ x: 100, y: 0 }, { x: 100, y: 100 }, -100, true)!;
    expect(svgArcTo(fr, major)).toMatch(/^A100 100 0 1 1 /);
  });

  it('pen-up segments become moves, not lines', () => {
    const fr = { ox: 0, oy: 0 };
    const segs: TrvPathSegment[] = [
      { kind: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, fromId: 'a', toId: 'b', drawn: true },
      { kind: 'line', from: { x: 10, y: 0 }, to: { x: 20, y: 0 }, fromId: 'b', toId: 'c', drawn: false },
      { kind: 'line', from: { x: 20, y: 0 }, to: { x: 30, y: 0 }, fromId: 'c', toId: 'd', drawn: true },
    ];
    expect(svgPathData(fr, segs)).toBe('M0 0L10 0M20 0L30 0');
  });

  it('draws relative to a local origin so state-plane numbers stay precise', () => {
    expect(frame).toEqual({ ox: model.fitBounds!.minX, oy: model.fitBounds!.maxY });
  });
});

describe('renderTrvSvg', () => {
  const svg = renderTrvSvg(model, frame);

  it('groups the drawing by layer', () => {
    for (const l of model.layers) expect(svg).toContain(`data-layer="${l.key}"`);
    expect(svg).toContain('class="trv-layer trv-layer--points"');
  });

  it('draws the lot with a true arc and the labels as text', () => {
    // LOT 1 edge 2→3 (5100,5000)→(5100,5100), R 100, CCW.
    expect(svg).toMatch(/A100 100 0 0 1 /);
    expect(svg).toContain('N 90°00&#39;00&quot; E 100.00&#39;');
    expect(svg).toContain('LOT 1, BLOCK A');
    expect(svg).toContain('transform="rotate(-45 ');
  });

  it('escapes everything that comes from the file', () => {
    const evil = parseTrv([
      '#,TRAVERSE PC', '80,24.000', '#,POINTS', '0,1', '2,5000,5000,0', '0,2', '2,5000,5100,0',
      '#,Drawing', '28,5,5050,5000,0,1,10.00,0,6,<script>alert(1)</script> & "x"',
    ].join('\r\n'));
    const out = renderTrvSvg(buildTrvModel(evil), frameFor(buildTrvModel(evil)), { showPointLabels: true });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
    expect(escapeXml(`<a href='x'>&`)).toBe('&lt;a href=&#39;x&#39;&gt;&amp;');
  });

  it('point ids are optional and live with the Points layer', () => {
    expect(svg).not.toContain('class="trv-ptlabels"');
    const withIds = renderTrvSvg(model, frame, { showPointLabels: true });
    expect(withIds).toContain('<g data-layer="points" class="trv-ptlabels">');
    expect((withIds.match(/<text x="[^"]+" y="[^"]+" font-size="[^"]+">\d<\/text>/g) ?? []).length).toBe(7);
  });
});

describe('view box', () => {
  it('fits the drawing with a margin at the requested aspect', () => {
    const v = fitViewBox(model, frame, 2);
    expect(v.w / v.h).toBeCloseTo(2, 9);
    const b = model.fitBounds!;
    expect(v.x).toBeLessThan(0);
    expect(v.x + v.w).toBeGreaterThan(b.maxX - frame.ox);
    expect(v.y).toBeLessThan(0);
    expect(v.y + v.h).toBeGreaterThan(frame.oy - b.minY);
  });

  it('zooms about a fixed point', () => {
    const v = { x: 0, y: 0, w: 100, h: 50 };
    const z = zoomViewBox(v, 2, 25, 25);
    expect(z).toEqual({ x: 12.5, y: 12.5, w: 50, h: 25 });
    // The anchor stays at the same relative spot.
    expect((25 - z.x) / z.w).toBeCloseTo((25 - v.x) / v.w, 9);
  });

  it('summary + layer panel feed the toolbar', () => {
    expect(summaryLine(model).map((s) => s.label)).toEqual(['Points', 'Lines', 'Curves', 'Shapes', 'Labels', 'Layers']);
    expect(summaryLine(model).find((s) => s.label === 'Curves')!.value).toBe(3);
    expect(panelLayers(model).every((l) => l.count > 0)).toBe(true);
  });
});

describe('Open in Starr CAD hand-off', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
  };

  it('parks the file and reads it back exactly once', () => {
    const s = mem();
    expect(stashPendingCadOpen({ url: '/api/files/abc', name: 'Lot.TRV' }, s, 1000)).toBe('/admin/cad?open=file');
    expect(consumePendingCadOpen(s, 2000)).toEqual({ url: '/api/files/abc', name: 'Lot.TRV', at: 1000 });
    expect(consumePendingCadOpen(s, 2000)).toBeNull();
  });

  it('ignores stale, malformed or unsafe entries', () => {
    const s = mem();
    stashPendingCadOpen({ url: 'https://x.example/f.trv', name: 'a.trv' }, s, 0);
    expect(consumePendingCadOpen(s, PENDING_OPEN_MAX_AGE_MS + 1)).toBeNull();
    s.setItem(PENDING_OPEN_KEY, JSON.stringify({ url: 'javascript:alert(1)', name: 'a', at: 5 }));
    expect(consumePendingCadOpen(s, 6)).toBeNull();
    s.setItem(PENDING_OPEN_KEY, JSON.stringify({ url: '//evil.example/x', name: 'a', at: 5 }));
    expect(consumePendingCadOpen(s, 6)).toBeNull();
    s.setItem(PENDING_OPEN_KEY, '{not json');
    expect(consumePendingCadOpen(s, 6)).toBeNull();
    expect(stashPendingCadOpen({ url: '/x', name: 'y' }, null)).toBeNull();
  });
});

describe('viewer wiring', () => {
  const ROOT = join(__dirname, '..', '..');
  const viewer = readFileSync(join(ROOT, 'app/admin/components/files/FileViewer.tsx'), 'utf8');
  const preview = readFileSync(join(ROOT, 'app/admin/components/files/TrvPreview.tsx'), 'utf8');
  const layout = readFileSync(join(ROOT, 'app/admin/cad/CADLayout.tsx'), 'utf8');
  const menu = readFileSync(join(ROOT, 'app/admin/cad/components/MenuBar.tsx'), 'utf8');

  it('FileViewer asks trvFormat and lazy-loads TrvPreview', () => {
    expect(viewer).toMatch(/import \{ trvFormat \} from '@\/lib\/files\/trv-preview';/);
    expect(viewer).toMatch(/const TrvPreview = React\.lazy\(\(\) => import\('\.\/TrvPreview'\)\);/);
    expect(viewer).toMatch(/const trv = file \? trvFormat\(file\.name, file\.mime\) : null;/);
    expect(viewer).toMatch(/\{trv && file\.url \? \(\s*<React\.Suspense/);
    expect(viewer).toMatch(/<TrvPreview url=\{file\.url\} name=\{file\.name\} \/>/);
    expect(viewer).toMatch(/fv-stage--trv/);
    // The upload-folder rules stay on fileKind.
    expect(viewer).toMatch(/const kind = file \? fileKind\(file\.name, file\.mime\) : 'other';/);
  });

  it('TrvPreview decodes bytes, has pan / zoom / fit / layers / ids and opens in CAD', () => {
    expect(preview).toMatch(/decodeTextBytes\(buf\)/);
    expect(preview).toMatch(/addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
    expect(preview).toMatch(/pointers\.current\.size >= 2/); // pinch
    expect(preview).toMatch(/touch-action|onPointerDown=\{onPointerDown\}/);
    expect(preview).toMatch(/Fit/);
    expect(preview).toMatch(/Point ids/);
    expect(preview).toMatch(/type="checkbox"/);
    expect(preview).toMatch(/stashPendingCadOpen\(\{ url, name \}\)/);
  });

  it('CAD picks up the hand-off and MenuBar opens it through File → Open', () => {
    expect(layout).toMatch(/cadParams\.get\(PENDING_OPEN_PARAM\) === 'file'/);
    expect(layout).toMatch(/consumePendingCadOpen\(\)/);
    // Through the shared helper, so the signed storage link is fetched without cookies (2026-10-01).
    expect(layout).toMatch(/decodeTextBytes\(await fetchFileForPreview\(pending\.url\)\)/);
    expect(layout).toMatch(/new CustomEvent\('cad:openFileContents'/);
    expect(menu).toMatch(/addEventListener\('cad:openFileContents', onOpenContents\)/);
    expect(menu).toMatch(/processOpenedCadFile\(detail\.name, detail\.text\)/);
  });
});
