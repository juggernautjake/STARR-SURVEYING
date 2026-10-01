'use client';
// TrvPreview — a Traverse PC (.TRV / .TRB) drawing inside the shared file viewer (owner,
// 2026-10-01: "making it so that we can clearly open and look at trv files in the file viewer").
//
// The file is parsed by lib/cad/io/trv-parser.ts and resolved by lib/cad/io/trv-model.ts — the same
// model Starr CAD's importer uses — then drawn as one SVG (lib/files/trv-preview.ts). Curves are
// true SVG arcs. Pan with a drag (mouse or one finger), zoom with the wheel or a pinch, Fit to see
// it all. The layer list toggles layers; "Point ids" toggles point labels.
//
// Loaded lazily by FileViewer, so nothing here is paid for until a TRV is opened.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Maximize2, ZoomIn, ZoomOut, Layers, Hash, ExternalLink, Info } from 'lucide-react';
import { parseTrv, type TrvDocument } from '@/lib/cad/io/trv-parser';
import { buildTrvModel } from '@/lib/cad/io/trv-model';
import { decodeTextBytes } from '@/lib/cad/io/trv-encoding';
import { stashPendingCadOpen } from '@/lib/cad/io/pending-open';
import {
  TRV_MAX_BYTES, TRV_SVG_DEFS, fitViewBox, frameFor, panelLayers, renderTrvSvg, summaryLine, zoomViewBox,
} from '@/lib/files/trv-preview';
import './TrvPreview.css';

type ViewBox = { x: number; y: number; w: number; h: number };

async function loadTrv(url: string): Promise<TrvDocument> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length'));
  if (declared > TRV_MAX_BYTES) throw new Error('this file is too large to preview — save it to open it');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > TRV_MAX_BYTES) throw new Error('this file is too large to preview — save it to open it');
  return parseTrv(decodeTextBytes(buf));
}

export interface TrvPreviewProps {
  url: string;
  name: string;
  /** Hide the "Open in Starr CAD" action (e.g. where CAD is not available). */
  hideOpenInCad?: boolean;
}

export default function TrvPreview({ url, name, hideOpenInCad }: TrvPreviewProps) {
  const [doc, setDoc] = useState<TrvDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showIds, setShowIds] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDoc(null); setError(null); setSheetIndex(null); setHidden(new Set());
    loadTrv(url)
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [url]);

  const model = useMemo(() => (doc ? buildTrvModel(doc, sheetIndex === null ? {} : { sheetIndex }) : null), [doc, sheetIndex]);
  const frame = useMemo(() => (model ? frameFor(model) : null), [model]);
  const body = useMemo(
    () => (model && frame ? renderTrvSvg(model, frame, { showPointLabels: showIds }) : ''),
    [model, frame, showIds],
  );

  // Layers start with the file's own visibility (construction copies off).
  useEffect(() => {
    if (!model) return;
    setHidden(new Set(model.layers.filter((l) => !l.visible).map((l) => l.key)));
  }, [model]);

  // ── view box: kept in a ref and written straight to the element while a gesture runs ──
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const view = useRef<ViewBox>({ x: 0, y: 0, w: 100, h: 100 });
  const apply = useCallback(() => {
    const v = view.current;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }, []);
  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!model || !frame || !svg) return;
    const r = svg.getBoundingClientRect();
    view.current = fitViewBox(model, frame, r.width > 0 && r.height > 0 ? r.width / r.height : 4 / 3);
    apply();
  }, [model, frame, apply]);
  useEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  // Drawing markup (every string escaped in renderTrvSvg) + layer visibility.
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    g.innerHTML = body;
  }, [body]);
  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    g.querySelectorAll<SVGGElement>('g[data-layer]').forEach((el) => {
      el.style.display = hidden.has(el.getAttribute('data-layer') ?? '') ? 'none' : '';
    });
  }, [hidden, body]);

  /** Client pixel → local drawing coordinates. */
  const toLocal = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const at = toLocal(clientX ?? r.left + r.width / 2, clientY ?? r.top + r.height / 2);
    if (!at) return;
    const next = zoomViewBox(view.current, factor, at.x, at.y);
    // Keep zoom sane: from ~1/50 of the fit width out to 20x it.
    if (next.w < 0.05 || next.w > 1e7) return;
    view.current = next;
    apply();
  }, [apply, toLocal]);

  // Wheel zoom (passive: false so the page does not scroll underneath).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), e.clientX, e.clientY);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt, model]);

  // Pointer pan + two-finger pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && pinch.current.dist > 0) zoomAt(dist / pinch.current.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.current.dist = dist;
      return;
    }
    const p0 = toLocal(prev.x, prev.y);
    const p1 = toLocal(now.x, now.y);
    if (!p0 || !p1) return;
    view.current = { ...view.current, x: view.current.x - (p1.x - p0.x), y: view.current.y - (p1.y - p0.y) };
    apply();
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const openInCad = () => {
    const href = stashPendingCadOpen({ url, name });
    if (href) window.location.href = href;
  };

  if (error) return <div className="fv-message" role="alert"><AlertTriangle size={18} aria-hidden="true" /> Could not open this file: {error}</div>;
  if (!doc || !model) return <div className="fv-loading"><Loader2 size={22} className="fv-spin motion-essential" aria-hidden="true" /> Loading drawing…</div>;

  const layers = panelLayers(model);
  const empty = model.entities.length === 0;
  const h = doc.header;
  const facts: Array<[string, string]> = [];
  if (h.fullVersion || doc.version) facts.push(['Traverse PC', h.fullVersion ?? doc.version ?? '']);
  if (h.jobNumber) facts.push(['Job', h.jobNumber]);
  if (doc.metadata.surveyDate) facts.push(['Date', doc.metadata.surveyDate]);
  if (doc.sheet?.scale) facts.push(['Plot scale', `1" = ${doc.sheet.scale}'`]);
  if (doc.metadata.units === '0') facts.push(['Units', 'Feet']);
  if (doc.projection?.crsName) facts.push(['Coordinate system', doc.projection.crsName]);
  facts.push(['Survey layers', String(model.summary.surveyLayers)]);
  if (model.summary.paperItems > 0) facts.push(['Sheet items not shown', `${model.summary.paperItems} (title block, border…)`]);
  if (doc.unknownRecords.length > 0) facts.push(['Unrecognised records', doc.unknownRecords.map((u) => `${u.code}×${u.count}`).join(', ')]);

  return (
    // Pointer events stop here: the viewer's stage drags to pan its own content.
    <div className="trvp" onPointerDown={(e) => e.stopPropagation()}>
      <div className="trvp__bar" role="toolbar" aria-label="Drawing controls">
        <ul className="trvp__counts" aria-label="Drawing summary">
          {summaryLine(model).map((s) => (
            <li key={s.label}><strong>{s.value.toLocaleString()}</strong> {s.label}</li>
          ))}
        </ul>
        <div className="trvp__tools">
          {doc.sheets.length > 1 ? (
            <label className="trvp__sheet">
              <span className="trvp__sr">Sheet</span>
              <select value={sheetIndex ?? doc.primarySheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}>
                {doc.sheets.map((s, i) => <option key={i} value={i}>{s.name ?? `Sheet ${i + 1}`}</option>)}
              </select>
            </label>
          ) : null}
          <button type="button" className="trvp__btn" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={16} aria-hidden="true" /></button>
          <button type="button" className="trvp__btn" onClick={() => zoomAt(1.4)} aria-label="Zoom in" title="Zoom in"><ZoomIn size={16} aria-hidden="true" /></button>
          <button type="button" className="trvp__btn" onClick={fit} title="Fit the drawing to the window"><Maximize2 size={16} aria-hidden="true" /> Fit</button>
          <button type="button" className={`trvp__btn${showIds ? ' trvp__btn--on' : ''}`} aria-pressed={showIds} onClick={() => setShowIds((v) => !v)} title="Show point numbers"><Hash size={16} aria-hidden="true" /> Point ids</button>
          <button type="button" className={`trvp__btn trvp__btn--layers${panelOpen ? ' trvp__btn--on' : ''}`} aria-pressed={panelOpen} aria-controls="trvp-layers" onClick={() => setPanelOpen((v) => !v)}><Layers size={16} aria-hidden="true" /> Layers</button>
          <button type="button" className={`trvp__btn${infoOpen ? ' trvp__btn--on' : ''}`} aria-pressed={infoOpen} onClick={() => setInfoOpen((v) => !v)} title="About this file"><Info size={16} aria-hidden="true" /></button>
          {!hideOpenInCad ? (
            <button type="button" className="trvp__btn trvp__btn--primary" onClick={openInCad} title="Open this drawing in Starr CAD"><ExternalLink size={16} aria-hidden="true" /> Open in Starr CAD</button>
          ) : null}
        </div>
      </div>

      <div className="trvp__main">
        <div className="trvp__canvas">
          {empty ? (
            <div className="fv-message"><p>This Traverse PC file has no points or drawing yet.</p></div>
          ) : null}
          <svg
            ref={svgRef}
            className="trvp__svg"
            role="img"
            aria-label={`Drawing of ${name}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={fit}
          >
            <g dangerouslySetInnerHTML={{ __html: TRV_SVG_DEFS }} />
            <g ref={gRef} />
          </svg>
          {infoOpen ? (
            <dl className="trvp__info">
              {facts.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
              {model.notes.length > 0 ? <><dt>Notes</dt><dd>{model.notes.join(' · ')}</dd></> : null}
            </dl>
          ) : null}
        </div>
        <aside id="trvp-layers" className={`trvp__layers${panelOpen ? ' trvp__layers--open' : ''}`} aria-label="Layers">
          <h3 className="trvp__h">Layers</h3>
          <ul>
            {layers.map((l) => (
              <li key={l.key}>
                <label className="trvp__layer">
                  <input
                    type="checkbox"
                    checked={!hidden.has(l.key)}
                    onChange={() => setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.key)) next.delete(l.key); else next.add(l.key);
                      return next;
                    })}
                  />
                  <span className="trvp__swatch" style={l.color ? { background: l.color } : undefined} aria-hidden="true" />
                  <span className="trvp__lname" title={l.sourceName ?? undefined}>{l.name}</span>
                  <span className="trvp__lcount">{l.count.toLocaleString()}</span>
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <p className="trvp__hint">Drag to pan · scroll or pinch to zoom · double-click to fit</p>
    </div>
  );
}
