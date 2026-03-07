// app/admin/research/[projectId]/boundary/page.tsx — Phase 13 Interactive Boundary Viewer
// SVG-based interactive boundary viewer for a STARR RECON research project.
// Renders the reconciled boundary with confidence coloring, click-to-inspect
// per call, layer toggles, and an optional measurement tool.
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BoundaryCall {
  callIndex: number;
  bearing?: string;
  distance?: number;
  isCurve?: boolean;
  score?: number;
  grade?: 'A' | 'B' | 'C' | 'D' | 'F';
  source?: string;
  rawText?: string;
  discrepancy?: { severity: 'critical' | 'major' | 'minor'; description: string } | null;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

interface BoundaryViewState {
  calls: BoundaryCall[];
  closureError?: number;
  closureRatio?: string;
  overallScore?: number;
  overallGrade?: string;
  projectId: string;
  address: string;
  countyName?: string;
}

type ViewLayer = 'boundary' | 'confidence' | 'sources' | 'discrepancies';
type ColorMode = 'solid' | 'confidence' | 'source';

// ── Confidence → color mapping ─────────────────────────────────────────────

function scoreToColor(score: number | undefined, mode: ColorMode): string {
  if (mode !== 'confidence' || score === undefined) return '#2563EB';
  if (score >= 90) return '#10B981'; // A — green
  if (score >= 80) return '#84CC16'; // B — lime
  if (score >= 70) return '#F59E0B'; // C — amber
  if (score >= 60) return '#F97316'; // D — orange
  return '#EF4444';                   // F — red
}

// ── Grade badge color ──────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: '#10B981', B: '#84CC16', C: '#F59E0B', D: '#F97316', F: '#EF4444',
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function BoundaryViewerPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId ?? '';

  const [viewState, setViewState] = useState<BoundaryViewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedCall, setSelectedCall] = useState<BoundaryCall | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('confidence');
  const [activeLayers, setActiveLayers] = useState<Set<ViewLayer>>(
    new Set(['boundary', 'confidence']),
  );
  const [measureMode, setMeasureMode] = useState(false);
  const [svgPanOffset, setSvgPanOffset] = useState({ x: 0, y: 0 });
  const [svgScale, setSvgScale] = useState(1);

  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // ── Auth guard ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') router.push('/auth/signin');
  }, [sessionStatus, router]);

  // ── Load boundary data ───────────────────────────────────────────────────

  const loadBoundary = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/research/${projectId}/boundary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as BoundaryViewState;
      setViewState(data);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadBoundary(); }, [loadBoundary]);

  // ── SVG Pan / Zoom ───────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setSvgScale(s => Math.min(Math.max(s * delta, 0.2), 10));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || measureMode) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - svgPanOffset.x, y: e.clientY - svgPanOffset.y };
  }, [svgPanOffset, measureMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setSvgPanOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
  }, []);

  const handleMouseUp = useCallback(() => { isPanning.current = false; }, []);

  const resetView = useCallback(() => {
    setSvgPanOffset({ x: 0, y: 0 });
    setSvgScale(1);
  }, []);

  // ── Layer toggle ─────────────────────────────────────────────────────────

  const toggleLayer = useCallback((layer: ViewLayer) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer); else next.add(layer);
      return next;
    });
  }, []);

  // ── Render boundary SVG ──────────────────────────────────────────────────

  const renderBoundarySVG = useCallback((calls: BoundaryCall[]) => {
    if (calls.length === 0) return null;

    // Compute bounding box from call coordinates
    const xs = calls.flatMap(c => [c.x1 ?? 0, c.x2 ?? 0]);
    const ys = calls.flatMap(c => [c.y1 ?? 0, c.y2 ?? 0]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const W = maxX - minX || 400;
    const H = maxY - minY || 400;
    const PAD = 40;
    const vbW = W + PAD * 2;
    const vbH = H + PAD * 2;

    return (
      <svg
        ref={svgRef}
        viewBox={`${minX - PAD} ${minY - PAD} ${vbW} ${vbH}`}
        className="w-full h-full"
        style={{
          transform: `translate(${svgPanOffset.x}px, ${svgPanOffset.y}px) scale(${svgScale})`,
          transformOrigin: 'center center',
          cursor: measureMode ? 'crosshair' : isPanning.current ? 'grabbing' : 'grab',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Grid (subtle) */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={minX - PAD} y={minY - PAD} width={vbW} height={vbH} fill="url(#grid)" />

        {/* Boundary lines */}
        {activeLayers.has('boundary') && calls.map(call => {
          if (call.x1 === undefined) return null;
          const color = scoreToColor(call.score, colorMode);
          const isSelected = selectedCall?.callIndex === call.callIndex;
          const hasDisc = call.discrepancy && activeLayers.has('discrepancies');
          return (
            <g key={call.callIndex}>
              <line
                x1={call.x1} y1={call.y1} x2={call.x2} y2={call.y2}
                stroke={hasDisc ? '#EF4444' : color}
                strokeWidth={isSelected ? 4 : 2}
                strokeDasharray={call.isCurve ? '8 4' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedCall(call)}
              />
              {/* Call index label at midpoint */}
              {activeLayers.has('sources') && (
                <text
                  x={((call.x1 ?? 0) + (call.x2 ?? 0)) / 2}
                  y={((call.y1 ?? 0) + (call.y2 ?? 0)) / 2 - 6}
                  fontSize="10"
                  fill="#374151"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {call.callIndex + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }, [activeLayers, colorMode, selectedCall, svgPanOffset, svgScale, measureMode, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp]);

  // ── Loading / error states ───────────────────────────────────────────────

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center text-gray-300">
          <div className="text-4xl mb-4 animate-spin">⟳</div>
          <p>Loading boundary data…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">Failed to load boundary data</p>
          <p className="text-gray-500 text-sm mb-6">{loadError}</p>
          <button onClick={loadBoundary} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const calls = viewState?.calls ?? [];

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/admin/research/${projectId}`} className="text-gray-400 hover:text-white text-sm">
            ← Back
          </Link>
          <h1 className="text-lg font-semibold">Boundary Viewer</h1>
          {viewState?.address && (
            <span className="text-gray-400 text-sm truncate max-w-xs">{viewState.address}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {viewState?.overallGrade && (
            <span
              className="px-3 py-1 rounded-full font-bold text-white"
              style={{ backgroundColor: GRADE_COLORS[viewState.overallGrade] ?? '#6B7280' }}
            >
              Grade {viewState.overallGrade} ({viewState.overallScore ?? '—'}%)
            </span>
          )}
          <Link
            href={`/admin/research/${projectId}`}
            className="px-3 py-1.5 bg-gray-700 rounded hover:bg-gray-600 text-sm"
          >
            Full Report
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar — Layer Controls ── */}
        <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Layers</h2>
            {(['boundary', 'confidence', 'sources', 'discrepancies'] as ViewLayer[]).map(layer => (
              <label key={layer} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={activeLayers.has(layer)}
                  onChange={() => toggleLayer(layer)}
                  className="rounded"
                />
                <span className="capitalize">{layer}</span>
              </label>
            ))}
          </div>

          <div className="p-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Color Mode</h2>
            {(['solid', 'confidence', 'source'] as ColorMode[]).map(mode => (
              <label key={mode} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="colorMode"
                  checked={colorMode === mode}
                  onChange={() => setColorMode(mode)}
                />
                <span className="capitalize">{mode}</span>
              </label>
            ))}
          </div>

          <div className="p-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">View</h2>
            <button
              onClick={resetView}
              className="w-full text-left text-sm py-1 text-gray-300 hover:text-white"
            >
              ↺ Reset View
            </button>
            <label className="flex items-center gap-2 py-1 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={measureMode}
                onChange={e => setMeasureMode(e.target.checked)}
              />
              Measure Mode
            </label>
          </div>

          {/* Boundary summary */}
          {viewState && (
            <div className="p-3 text-xs text-gray-400">
              <div className="mb-1"><span className="text-gray-500">Calls:</span> {calls.length}</div>
              {viewState.closureRatio && (
                <div className="mb-1"><span className="text-gray-500">Closure:</span> 1:{viewState.closureRatio}</div>
              )}
              {viewState.countyName && (
                <div><span className="text-gray-500">County:</span> {viewState.countyName}</div>
              )}
            </div>
          )}
        </aside>

        {/* ── Main SVG Viewer ── */}
        <main
          className="flex-1 relative overflow-hidden bg-gray-950"
          style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
        >
          {calls.length > 0
            ? renderBoundarySVG(calls)
            : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-5xl mb-4">📐</div>
                  <p>No boundary calls available yet.</p>
                  <p className="text-sm mt-2">Run the research pipeline to extract boundary data.</p>
                </div>
              </div>
            )
          }

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            <button onClick={() => setSvgScale(s => Math.min(s * 1.2, 10))}
              className="w-8 h-8 bg-gray-700 rounded text-white hover:bg-gray-600 font-bold text-lg">+</button>
            <button onClick={() => setSvgScale(s => Math.max(s * 0.8, 0.2))}
              className="w-8 h-8 bg-gray-700 rounded text-white hover:bg-gray-600 font-bold text-lg">−</button>
            <button onClick={resetView}
              className="w-8 h-8 bg-gray-700 rounded text-white hover:bg-gray-600 text-xs">⟳</button>
          </div>
        </main>

        {/* ── Right Sidebar — Call Detail ── */}
        {selectedCall && (
          <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <h2 className="font-semibold">Call #{selectedCall.callIndex + 1}</h2>
              <button onClick={() => setSelectedCall(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="p-3 space-y-3 text-sm">
              {selectedCall.bearing && (
                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Bearing</div>
                  <div className="font-mono text-blue-300">{selectedCall.bearing}</div>
                </div>
              )}
              {selectedCall.distance !== undefined && (
                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Distance</div>
                  <div className="font-mono">{selectedCall.distance.toFixed(2)} ft</div>
                </div>
              )}
              {selectedCall.isCurve && (
                <div className="text-yellow-400 text-xs">⌒ Curve call</div>
              )}
              {selectedCall.source && (
                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Source</div>
                  <div>{selectedCall.source}</div>
                </div>
              )}
              {selectedCall.score !== undefined && (
                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Confidence</div>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded text-white text-xs font-bold"
                      style={{ backgroundColor: GRADE_COLORS[selectedCall.grade ?? 'F'] ?? '#6B7280' }}
                    >
                      {selectedCall.grade}
                    </span>
                    <span>{selectedCall.score}%</span>
                  </div>
                </div>
              )}
              {selectedCall.discrepancy && (
                <div className="bg-red-900/30 border border-red-700 rounded p-2">
                  <div className="text-red-400 text-xs font-semibold uppercase mb-1">
                    ⚠ {selectedCall.discrepancy.severity} discrepancy
                  </div>
                  <div className="text-gray-300 text-xs">{selectedCall.discrepancy.description}</div>
                </div>
              )}
              {selectedCall.rawText && (
                <div>
                  <div className="text-gray-400 text-xs uppercase tracking-wider mb-0.5">Raw Text</div>
                  <div className="text-gray-300 text-xs font-mono bg-gray-800 rounded p-2 break-words">
                    {selectedCall.rawText}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
