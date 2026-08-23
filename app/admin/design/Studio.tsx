'use client';
// app/admin/design/Studio.tsx — the Page Designer.
//
// Phase 0 (W1–W6) of docs/planning/in-progress/DESIGN_STUDIO_2026-08-23.md.
//
// ── HOW IT IS PUT TOGETHER ──────────────────────────────────────────────────────────────────────
//
// Three regions: the palette (search + categories), the artboard, and the inspector. The document
// holds TWO INDEPENDENT VIEWS — desktop and mobile — each with its own element list, grid settings
// and size. Switching views is a tab; nothing is shared or synced between them, because a phone
// layout is not a squeezed desktop layout.
//
// ── TWO DELIBERATE DEPARTURES FROM THE PLAN ─────────────────────────────────────────────────────
//
// 1. **No iframe.** The plan called for isolating the artboard in an `iframe srcdoc`. Rendering
//    inline instead means the elements wear the app's REAL stylesheets — including `forms.css`,
//    which only applies inside `.admin-layout__content` — so a mockup looks exactly like the thing
//    it is a mockup of. The cost is that studio chrome could collide with app CSS, which is paid
//    for by prefixing every chrome class `dsx-`. The export carries its own stylesheet
//    (`baseStylesheet`) so the file still stands up outside the app.
//
// 2. **Pointer events rather than @dnd-kit.** dnd-kit is built for sortable lists; a canvas needs
//    raw coordinates, an anchor, a grid and guides. Dragging here is forty lines of pointer maths
//    against `lib/design/snap.ts`, which is tested.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, Download, Grid3x3, Magnet, Ruler, Trash2, Copy, Monitor, Smartphone, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Eye, EyeOff, Lock, Unlock, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import {
  type DesignDocument, type DesignElement, type ViewId,
  addElement, removeElements, updateElement, newElementId, contentHeight, foldLines, PHONE_SAFE_AREA, reorder,
} from '@/lib/design/document';
import { placeRect, clampToArtboard, spacingTo, type Guide, type Rect } from '@/lib/design/snap';
import { ENTRIES, getEntry, isAnnotationEntry } from '@/lib/design/catalogue';
import { renderElement, positionStyle } from '@/lib/design/render';
import { saveDesign, saveDraft } from '@/lib/design/storage';
import { exportHtml, exportSpec, exportPrompt, dsPrimitiveStyles } from '@/lib/design/export';
import { artboardToSvg, captureArtboard, downloadBlob, downloadText } from '@/lib/design/capture';
import Palette from './components/Palette';
import Inspector from './components/Inspector';
import './DesignStudio.css';

interface Props {
  initial: DesignDocument;
}

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'resize'; id: string; handle: string; startX: number; startY: number; origin: Rect }
  | null;

export default function Studio({ initial }: Props) {
  const [doc, setDoc] = useState<DesignDocument>(initial);
  const [viewId, setViewId] = useState<ViewId>('desktop');
  const [selection, setSelection] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.75);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);

  const view = doc.views[viewId];
  const settings = view.settings;
  const selected = view.elements.filter((el) => selection.includes(el.id));
  const single = selected.length === 1 ? selected[0] : null;

  // ── AUTOSAVE ─────────────────────────────────────────────────────────────────────────────────
  //
  // A closed tab must never be a lost afternoon. The draft is written under its own key, separate
  // from the last explicit save, so pressing Save still means something.
  useEffect(() => {
    const timer = setTimeout(() => saveDraft(doc), 800);
    return () => clearTimeout(timer);
  }, [doc]);

  const patchView = useCallback((fn: (v: DesignDocument['views'][ViewId]) => DesignDocument['views'][ViewId]) => {
    setDoc((d) => ({
      ...d,
      views: { ...d.views, [viewId]: fn(d.views[viewId]) },
      updatedAt: new Date().toISOString(),
    }));
  }, [viewId]);

  const patchSettings = useCallback((patch: Partial<typeof settings>) => {
    patchView((v) => ({ ...v, settings: { ...v.settings, ...patch } }));
  }, [patchView]);

  // ── PLACING ──────────────────────────────────────────────────────────────────────────────────

  const place = useCallback((catalogId: string, at?: { x: number; y: number }) => {
    const entry = getEntry(catalogId);
    if (!entry) return;
    const x = at?.x ?? Math.round(view.width / 2 - entry.size.default.w / 2);
    const y = at?.y ?? 80;
    const element: Omit<DesignElement, 'z'> = {
      id: newElementId(),
      kind: entry.category === 'shape' ? 'shape' : 'catalogue',
      catalogId,
      slots: Object.fromEntries(entry.slots.map((s) => [s.name, s.default])),
      style: {},
      x: Math.max(0, x),
      y: Math.max(0, y),
      w: entry.size.default.w,
      h: entry.size.default.h,
      annotation: isAnnotationEntry(catalogId),
      name: entry.label,
    };
    patchView((v) => addElement(v, element));
    setSelection([element.id]);
    setStatus(`Placed ${entry.label}`);
  }, [patchView, view.width]);

  /** Drop a bare emoji or symbol as free text — big enough to see, editable like any other text. */
  const placeCharacter = useCallback((character: string) => {
    const element: Omit<DesignElement, 'z'> = {
      id: newElementId(),
      kind: 'text',
      catalogId: 'shape.text',
      slots: { text: character },
      style: { fontSize: '32px' },
      x: Math.round(view.width / 2 - 24), y: 80, w: 48, h: 48,
      name: character,
    };
    patchView((v) => addElement(v, element));
    setSelection([element.id]);
    setStatus(`Placed ${character}`);
  }, [patchView, view.width]);

  /** Artboard coordinates from a pointer event, correcting for zoom and scroll. */
  const artboardPoint = useCallback((clientX: number, clientY: number) => {
    const box = artboardRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: Math.round((clientX - box.left) / zoom),
      y: Math.round((clientY - box.top) / zoom),
    };
  }, [zoom]);

  const onArtboardDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const catalogId = e.dataTransfer.getData('application/x-design-entry');
    if (!catalogId) return;
    const entry = getEntry(catalogId);
    const point = artboardPoint(e.clientX, e.clientY);
    place(catalogId, {
      x: point.x - Math.round((entry?.size.default.w ?? 100) / 2),
      y: point.y - Math.round((entry?.size.default.h ?? 40) / 2),
    });
  }, [artboardPoint, place]);

  // ── MOVING AND RESIZING ──────────────────────────────────────────────────────────────────────

  /** Everything a dragged element could align TO. The element being dragged is excluded — and so
   *  is the rest of the selection — or it would snap to its own edge and refuse to move. The drag id
   *  is excluded explicitly rather than relying on the selection state, which is set in the same
   *  event and may not have landed by the first pointermove. */
  const others = useMemo(
    () => view.elements
      .filter((el) => !selection.includes(el.id) && el.id !== drag?.id)
      .map((el) => ({ id: el.id, rect: { x: el.x, y: el.y, w: el.w, h: el.h } })),
    [view.elements, selection, drag],
  );

  const beginMove = useCallback((e: React.PointerEvent, el: DesignElement) => {
    if (el.locked) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const next: DragState = { kind: 'move', id: el.id, startX: e.clientX, startY: e.clientY, originX: el.x, originY: el.y };
    dragRef.current = next;
    setDrag(next);
    if (!selection.includes(el.id)) setSelection(e.shiftKey ? [...selection, el.id] : [el.id]);
  }, [selection]);

  const beginResize = useCallback((e: React.PointerEvent, el: DesignElement, handle: string) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const next: DragState = { kind: 'resize', id: el.id, handle, startX: e.clientX, startY: e.clientY, origin: { x: el.x, y: el.y, w: el.w, h: el.h } };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state) return;
    const dx = (e.clientX - state.startX) / zoom;
    const dy = (e.clientY - state.startY) / zoom;

    if (state.kind === 'move') {
      const el = view.elements.find((x) => x.id === state.id);
      if (!el) return;
      const moved: Rect = { x: Math.round(state.originX + dx), y: Math.round(state.originY + dy), w: el.w, h: el.h };
      // The anchor is the corner you grabbed by; dragging the body uses the top-left, which is what
      // a person means when they drag a box.
      const result = placeRect(moved, 'top-left', others, { width: view.width, height: view.height }, {
        enabled: settings.snap, size: settings.size, strength: settings.strength, guides: settings.guides,
      });
      const clamped = clampToArtboard(result.rect, { width: view.width });
      setGuides(result.guides);
      patchView((v) => updateElement(v, state.id, { x: clamped.x, y: clamped.y }));
      return;
    }

    // Resize.
    const o = state.origin;
    let next: Rect = { ...o };
    if (state.handle.includes('e')) next.w = Math.max(8, Math.round(o.w + dx));
    if (state.handle.includes('s')) next.h = Math.max(8, Math.round(o.h + dy));
    if (state.handle.includes('w')) { next.x = Math.round(o.x + dx); next.w = Math.max(8, Math.round(o.w - dx)); }
    if (state.handle.includes('n')) { next.y = Math.round(o.y + dy); next.h = Math.max(8, Math.round(o.h - dy)); }
    if (settings.snap) {
      next = {
        ...next,
        w: Math.max(8, Math.round(next.w / settings.size) * settings.size),
        h: Math.max(8, Math.round(next.h / settings.size) * settings.size),
      };
    }
    patchView((v) => updateElement(v, state.id, next));
  }, [others, patchView, settings, view.elements, view.height, view.width, zoom]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setGuides([]);
  }, []);

  // ── KEYBOARD ─────────────────────────────────────────────────────────────────────────────────

  const duplicate = useCallback(() => {
    if (!selected.length) return;
    const copies = selected.map((el) => ({ ...el, id: newElementId(), x: el.x + 16, y: el.y + 16 }));
    patchView((v) => copies.reduce((acc, c) => addElement(acc, c), v));
    setSelection(copies.map((c) => c.id));
  }, [patchView, selected]);

  const save = useCallback(() => {
    const { ok, doc: saved } = saveDesign(doc, new Date().toISOString());
    if (ok) { setDoc(saved); setStatus(`Saved “${saved.name}” — v${saved.version}`); }
    else setStatus('Could not save — this browser is refusing to store data.');
  }, [doc]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
      if (e.key === 'Escape') { setSelection([]); return; }
      if (!selection.length) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        patchView((v) => removeElements(v, selection));
        setSelection([]);
        return;
      }
      const step = e.shiftKey ? 10 : (settings.snap ? settings.size : 1);
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const delta = nudge[e.key];
      if (delta) {
        e.preventDefault();
        patchView((v) => selection.reduce((acc, id) => {
          const el = acc.elements.find((x) => x.id === id);
          if (!el || el.locked) return acc;
          return updateElement(acc, id, { x: Math.max(0, el.x + delta[0]), y: Math.max(0, el.y + delta[1]) });
        }, v));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duplicate, patchView, save, selection, settings.size, settings.snap]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2600);
    return () => clearTimeout(timer);
  }, [status]);

  // ── EXPORT ───────────────────────────────────────────────────────────────────────────────────

  const exportCtx = useMemo(() => ({
    getEntry,
    isAnnotation: isAnnotationEntry,
    now: new Date().toISOString(),
  }), []);

  const doExport = useCallback(async (what: 'html' | 'json' | 'png' | 'all') => {
    const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
    if (what === 'html' || what === 'all') {
      for (const file of exportHtml(doc, exportCtx).files) downloadText(file.name, file.content);
    }
    if (what === 'json' || what === 'all') {
      const spec = exportSpec(doc, exportCtx);
      downloadText(`${slug}.design.json`, JSON.stringify(spec, null, 2));
      downloadText('PROMPT.md', exportPrompt(doc, spec));
    }
    if (what === 'png' || what === 'all') {
      setStatus('Rendering image…');
      const node = artboardRef.current;
      if (!node) return;
      const { blob, error } = await captureArtboard(node, view.width, contentHeight(view));
      if (blob) {
        downloadBlob(`${slug}-${viewId}.png`, blob);
        // The vector goes with it: same drawing, scales without blurring, and useful in a document.
        if (artboardRef.current) downloadText(`${slug}-${viewId}.svg`, artboardToSvg(artboardRef.current, view.width, contentHeight(view)));
      } else {
        // Say WHY. A capture that fails silently is a bug nobody can report, and the fallback —
        // an OS screenshot — is what the owner does today, so this is a detour rather than a wall.
        setStatus(`The image could not be rendered (${error ?? 'unknown reason'}). Take a screenshot instead.`);
        return;
      }
    }
    setStatus('Exported.');
  }, [doc, exportCtx, view, viewId]);

  // ── RENDER ───────────────────────────────────────────────────────────────────────────────────

  const height = contentHeight(view);
  const folds = foldLines(view);

  return (
    <div className="dsx" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {/* The shape primitives. The app styles .admin-btn and .job-form__input already — that is why
          the canvas is not in an iframe — but .ds-shape--rect exists nowhere else, and without this
          a red rectangle would render as an unstyled div. Same string the export writes, so the
          canvas and the file cannot disagree about what a rectangle looks like. */}
      <style dangerouslySetInnerHTML={{ __html: dsPrimitiveStyles() }} />
      {/* ── Toolbar ─────────────────────────────────────────────────────────────────────────── */}
      <header className="dsx__bar">
        <Link href="/admin/design" className="dsx__back"><ChevronLeft size={16} aria-hidden /> Designs</Link>
        <input
          className="dsx__name"
          value={doc.name}
          onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))}
          aria-label="Design name"
        />
        <input
          className="dsx__route"
          value={doc.route ?? ''}
          placeholder="/admin/jobs"
          onChange={(e) => setDoc((d) => ({ ...d, route: e.target.value || null }))}
          aria-label="Target route"
        />

        <div className="dsx__views" role="tablist" aria-label="View">
          <button role="tab" aria-selected={viewId === 'desktop'} className={`dsx__view${viewId === 'desktop' ? ' is-on' : ''}`} onClick={() => { setViewId('desktop'); setSelection([]); }}>
            <Monitor size={15} aria-hidden /> Desktop
          </button>
          <button role="tab" aria-selected={viewId === 'mobile'} className={`dsx__view${viewId === 'mobile' ? ' is-on' : ''}`} onClick={() => { setViewId('mobile'); setSelection([]); }}>
            <Smartphone size={15} aria-hidden /> Mobile
          </button>
        </div>

        <div className="dsx__tools">
          <button className={`dsx__tool${settings.show ? ' is-on' : ''}`} onClick={() => patchSettings({ show: !settings.show })} title="Show grid">
            <Grid3x3 size={15} aria-hidden /> Grid
          </button>
          <button className={`dsx__tool${settings.snap ? ' is-on' : ''}`} onClick={() => patchSettings({ snap: !settings.snap })} title="Snap to grid">
            <Magnet size={15} aria-hidden /> Snap
          </button>
          <label className="dsx__grid-size">
            <span>Size</span>
            <select value={settings.size} onChange={(e) => patchSettings({ size: Number(e.target.value) })} aria-label="Grid size">
              {[4, 8, 12, 16, 24, 32, 48].map((n) => <option key={n} value={n}>{n}px</option>)}
            </select>
          </label>
          <button className={`dsx__tool${settings.guides ? ' is-on' : ''}`} onClick={() => patchSettings({ guides: !settings.guides })} title="Smart guides">
            <Ruler size={15} aria-hidden /> Guides
          </button>
          <span className="dsx__zoom">
            <button className="dsx__tool" onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 100) / 100))} aria-label="Zoom out"><ZoomOut size={15} /></button>
            <span className="dsx__zoom-value">{Math.round(zoom * 100)}%</span>
            <button className="dsx__tool" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 100) / 100))} aria-label="Zoom in"><ZoomIn size={15} /></button>
          </span>
        </div>

        <div className="dsx__actions">
          <button className="dsx__tool dsx__tool--primary" onClick={save}><Save size={15} aria-hidden /> Save</button>
          <div className="dsx__export">
            <button className="dsx__tool"><Download size={15} aria-hidden /> Export</button>
            <div className="dsx__menu">
              <button onClick={() => void doExport('png')}>Image (PNG) of this view</button>
              <button onClick={() => void doExport('html')}>HTML + CSS files</button>
              <button onClick={() => void doExport('json')}>Spec for Claude (JSON + brief)</button>
              <button onClick={() => void doExport('all')}>Everything</button>
            </div>
          </div>
        </div>
      </header>

      <div className="dsx__body">
        <Palette onPlace={place} onPlaceCharacter={placeCharacter} viewId={viewId} />

        {/* ── Canvas ────────────────────────────────────────────────────────────────────────── */}
        <main className="dsx__canvas" onPointerDown={() => setSelection([])}>
          <div className="dsx__stage" style={{ width: view.width * zoom, height: height * zoom }}>
            <div
              ref={artboardRef}
              className={`dsx__artboard${viewId === 'mobile' ? ' dsx__artboard--phone' : ''}`}
              style={{
                width: view.width,
                height,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                backgroundSize: `${settings.size}px ${settings.size}px`,
                backgroundImage: settings.show
                  ? `linear-gradient(to right, rgba(29,48,149,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(29,48,149,.10) 1px, transparent 1px)`
                  : 'none',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onArtboardDrop}
              onPointerDown={(e) => { e.stopPropagation(); setSelection([]); }}
            >
              {/* The fold — almost every "why did nobody see this" problem lives just below one. */}
              {folds.map((y) => (
                <div key={y} className="dsx__fold" style={{ top: y }}>
                  <span>fold · {y}px</span>
                </div>
              ))}

              {/* A control under a phone's safe area is a control nobody can tap. */}
              {viewId === 'mobile' && (
                <>
                  <div className="dsx__safe" style={{ top: 0, height: PHONE_SAFE_AREA.top }}><span>safe area</span></div>
                  <div className="dsx__safe" style={{ top: view.height - PHONE_SAFE_AREA.bottom, height: PHONE_SAFE_AREA.bottom }} />
                </>
              )}

              {[...view.elements].sort((a, b) => a.z - b.z).map((el) => {
                const entry = el.catalogId ? getEntry(el.catalogId) : undefined;
                const isSelected = selection.includes(el.id);
                return (
                  <div
                    key={el.id}
                    className={`dsx__el${isSelected ? ' is-selected' : ''}${el.locked ? ' is-locked' : ''}`}
                    style={positionStyle(el)}
                    onPointerDown={(e) => beginMove(e, el)}
                    data-testid={`ds-element-${el.id}`}
                  >
                    <div className="dsx__el-inner" dangerouslySetInnerHTML={{ __html: renderElement(entry, el) }} />
                    {isSelected && !el.locked && (
                      <>
                        {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                          <span
                            key={handle}
                            className={`dsx__handle dsx__handle--${handle}`}
                            onPointerDown={(e) => beginResize(e, el, handle)}
                          />
                        ))}
                        <span className="dsx__size">{el.w} × {el.h}</span>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Guides and spacing badges, drawn while dragging. */}
              {guides.map((g, i) => (
                <div
                  key={`${g.axis}-${g.position}-${i}`}
                  className={`dsx__guide dsx__guide--${g.axis}`}
                  style={g.axis === 'x' ? { left: g.position } : { top: g.position }}
                />
              ))}
              {drag?.kind === 'move' && single && (() => {
                const gaps = spacingTo({ x: single.x, y: single.y, w: single.w, h: single.h }, others);
                return (
                  <>
                    {gaps.left !== undefined && <span className="dsx__gap" style={{ left: single.x - gaps.left, top: single.y + single.h / 2 }}>{gaps.left}</span>}
                    {gaps.above !== undefined && <span className="dsx__gap" style={{ left: single.x + single.w / 2, top: single.y - gaps.above }}>{gaps.above}</span>}
                  </>
                );
              })()}
            </div>
          </div>
        </main>

        <Inspector
          element={single}
          entry={single?.catalogId ? getEntry(single.catalogId) : undefined}
          count={selected.length}
          onChange={(patch) => single && patchView((v) => updateElement(v, single.id, patch))}
          onSlot={(name, value) => single && patchView((v) => updateElement(v, single.id, { slots: { ...single.slots, [name]: value } }))}
          onStyle={(prop, value) => single && patchView((v) => updateElement(v, single.id, { style: { ...single.style, [prop]: value } }))}
          onDelete={() => { patchView((v) => removeElements(v, selection)); setSelection([]); }}
          onDuplicate={duplicate}
          onOrder={(dir) => patchView((v) => reorder(v, selection, dir))}
        />
      </div>

      {/* ── Status + layer strip ─────────────────────────────────────────────────────────────── */}
      <footer className="dsx__foot">
        <span className="dsx__count">{view.elements.length} element{view.elements.length === 1 ? '' : 's'} on {viewId}</span>
        {selected.length > 0 && (
          <span className="dsx__foot-actions">
            <button className="dsx__tool" onClick={duplicate} title="Duplicate (Ctrl+D)"><Copy size={14} aria-hidden /></button>
            <button className="dsx__tool" onClick={() => patchView((v) => reorder(v, selection, 'front'))} title="Bring to front"><ArrowUp size={14} aria-hidden /></button>
            <button className="dsx__tool" onClick={() => patchView((v) => reorder(v, selection, 'back'))} title="Send to back"><ArrowDown size={14} aria-hidden /></button>
            <button className="dsx__tool" onClick={() => single && patchView((v) => updateElement(v, single.id, { hidden: !single.hidden }))} title="Hide">
              {single?.hidden ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            </button>
            <button className="dsx__tool" onClick={() => single && patchView((v) => updateElement(v, single.id, { locked: !single.locked }))} title="Lock">
              {single?.locked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
            </button>
            <button className="dsx__tool dsx__tool--danger" onClick={() => { patchView((v) => removeElements(v, selection)); setSelection([]); }} title="Delete">
              <Trash2 size={14} aria-hidden />
            </button>
          </span>
        )}
        {status && <span className="dsx__status" role="status">{status}</span>}
        <span className="dsx__hint">{ENTRIES.length} elements in the palette · ⌘S save · ⌘D duplicate · arrows nudge</span>
      </footer>
    </div>
  );
}
