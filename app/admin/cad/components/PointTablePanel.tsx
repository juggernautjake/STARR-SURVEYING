'use client';
// app/admin/cad/components/PointTablePanel.tsx — Sortable, filterable table of imported survey points

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  Star,
  Crosshair,
  Trash2,
  Eye,
  Copy,
} from 'lucide-react';
import { usePointStore } from '@/lib/cad/store';
import type { PointSortField } from '@/lib/cad/store';
import type { SurveyPoint } from '@/lib/cad/types';
import Tooltip from './Tooltip';

/** Deterministic group stripe colors for calc/set/found visualization */
const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'] as const;

interface PointTablePanelProps {
  codeDisplayMode: 'ALPHA' | 'NUMERIC';
  onCodeDisplayModeChange: (mode: 'ALPHA' | 'NUMERIC') => void;
  onSelectPoint?: (pointId: string) => void;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  field: PointSortField;
  direction: SortDirection;
}

interface ContextMenu {
  x: number;
  y: number;
  point: SurveyPoint;
}

function SortIcon({ field, sort }: { field: PointSortField; sort: SortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={12} className="text-gray-500 ml-1" />;
  return sort.direction === 'asc'
    ? <ChevronUp size={12} className="text-blue-400 ml-1" />
    : <ChevronDown size={12} className="text-blue-400 ml-1" />;
}

/** Monument action badge. Detects recalc (CALC²) from parsedName. */
function ActionBadge({ point }: { point: SurveyPoint }) {
  const action = point.monumentAction;
  const isRecalc = point.parsedName.isRecalc;
  const recalcSeq = point.parsedName.recalcSequence;

  if (!action) return <span className="text-gray-500 font-mono text-[10px]">—</span>;

  const styles: Record<string, string> = {
    FOUND:      'bg-gray-700 text-gray-200',
    SET:        'bg-red-900 text-red-200',
    CALCULATED: 'bg-purple-900 text-purple-200',
    UNKNOWN:    'bg-yellow-900 text-yellow-200',
  };
  const label =
    action === 'CALCULATED' && isRecalc
      ? `CALC${recalcSeq > 0 ? '\u00B2' : ''}`
      : action === 'CALCULATED'
      ? 'CALC'
      : action;

  const title =
    action === 'CALCULATED' && isRecalc
      ? `Recalculation #${recalcSeq} — suffix variant: "${point.parsedName.suffixVariant}"`
      : action === 'CALCULATED'
      ? 'Calculated position (not field-measured)'
      : action === 'SET'
      ? 'Monument was set in the field'
      : action === 'FOUND'
      ? 'Monument was found in the field'
      : 'Action unknown';

  return (
    <span className={`px-1 py-0.5 rounded text-[10px] font-mono ${styles[action]}`} title={title}>
      {label}
    </span>
  );
}

/** Delta badge — shows calc-to-field distance if group has both */
function DeltaBadge({ point, threshold }: { point: SurveyPoint; threshold: number }) {
  const pointStore = usePointStore();
  const group = pointStore.getPointGroup(point.parsedName.baseNumber);
  if (!group || !group.hasBothCalcAndField) return null;

  // Only show on the final (drawn) point
  if (group.finalPoint.id !== point.id) return null;

  const delta = group.calcSetDelta ?? group.calcFoundDelta;
  if (delta === null) return null;

  const isWarn = delta > threshold;
  return (
    <span
      className={`ml-1 text-[10px] font-mono ${isWarn ? 'text-yellow-400' : 'text-green-400'}`}
      title={`Calc-to-field delta: ${delta.toFixed(3)}′${isWarn ? ' ⚠ Exceeds threshold' : ''}`}
    >
      Δ{delta.toFixed(2)}′
    </span>
  );
}

function IssuesBadge({ issues }: { issues: SurveyPoint['validationIssues'] }) {
  if (issues.length === 0) return null;
  const hasError = issues.some(i => i.severity === 'ERROR');
  const hasWarn = issues.some(i => i.severity === 'WARNING');
  const allMessages = issues.map(i => `[${i.severity}] ${i.message}`).join('\n');
  if (hasError) return (
    <Tooltip label="Validation Errors" description={allMessages} side="left" delay={200}>
      <span><AlertCircle size={12} className="text-red-400 inline" /></span>
    </Tooltip>
  );
  if (hasWarn) return (
    <Tooltip label="Validation Warnings" description={allMessages} side="left" delay={200}>
      <span><AlertTriangle size={12} className="text-yellow-400 inline" /></span>
    </Tooltip>
  );
  return (
    <Tooltip label="Validation Info" description={allMessages} side="left" delay={200}>
      <span><Info size={12} className="text-blue-400 inline" /></span>
    </Tooltip>
  );
}

export default function PointTablePanel({
  codeDisplayMode,
  onCodeDisplayModeChange,
  onSelectPoint,
}: PointTablePanelProps) {
  const pointStore = usePointStore();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'pointNumber', direction: 'asc' });
  const [showGroups, setShowGroups] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Delta threshold — read from drawing settings event if available
  const deltaThreshold = 0.10; // fallback; real value comes from settings

  const sortedPoints = useMemo(
    () => pointStore.getSortedPoints(sort.field, sort.direction, filter || undefined),
    [pointStore, sort, filter],
  );

  const totalCount = pointStore.getPointCount();
  const pointGroups = pointStore.pointGroups;

  // How many groups have delta warnings?
  const deltaWarningCount = useMemo(() => {
    let n = 0;
    for (const g of pointGroups.values()) {
      if (g.deltaWarning) n++;
    }
    return n;
  }, [pointGroups]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    function onDocClick() { setContextMenu(null); }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [contextMenu]);

  function handleHeaderClick(field: PointSortField) {
    setSort(prev =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
  }

  function getGroupColor(baseNumber: number): string {
    return GROUP_COLORS[baseNumber % GROUP_COLORS.length];
  }

  function isGroupFinal(pt: SurveyPoint): boolean {
    const group = pointStore.getPointGroup(pt.parsedName.baseNumber);
    return group !== undefined && group.finalPoint.id === pt.id && group.allPoints.length > 1;
  }

  function getRowBg(pt: SurveyPoint): string {
    if (pt.validationIssues.some(i => i.severity === 'ERROR')) return 'bg-red-950/40';
    if (pt.validationIssues.some(i => i.severity === 'WARNING')) return 'bg-yellow-950/30';
    return 'hover:bg-gray-750 bg-gray-800';
  }

  const handleRowClick = useCallback((pt: SurveyPoint) => {
    onSelectPoint?.(pt.id);
    // Dispatch zoom event
    if (pt.featureId) {
      window.dispatchEvent(new CustomEvent('cad:zoomToFeature', { detail: { featureId: pt.featureId } }));
    }
  }, [onSelectPoint]);

  const handleRowContextMenu = useCallback((e: React.MouseEvent, pt: SurveyPoint) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, point: pt });
  }, []);

  const handleZoomTo = useCallback((pt: SurveyPoint) => {
    setContextMenu(null);
    onSelectPoint?.(pt.id);
    if (pt.featureId) {
      window.dispatchEvent(new CustomEvent('cad:zoomToFeature', { detail: { featureId: pt.featureId } }));
    }
  }, [onSelectPoint]);

  const handleCopyCoords = useCallback((pt: SurveyPoint) => {
    setContextMenu(null);
    const text = `${pt.northing.toFixed(4)},${pt.easting.toFixed(4)},${pt.elevation?.toFixed(4) ?? ''}`;
    navigator.clipboard.writeText(text).catch(() => {
      // Clipboard API not available — silent fail
    });
  }, []);

  const handleDeletePoint = useCallback((pt: SurveyPoint) => {
    setContextMenu(null);
    if (confirm(`Delete point ${pt.pointName} (#${pt.pointNumber})?`)) {
      pointStore.removePoint(pt.id);
    }
  }, [pointStore]);

  if (totalCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
        <div className="text-gray-600 text-2xl">📍</div>
        <div>No points imported yet.</div>
        <div className="text-xs text-gray-600">Use <strong className="text-gray-400">File → Import</strong> to load field data (CSV, RW5, or JobXML).</div>
      </div>
    );
  }

  const thClass = 'px-2 py-1 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-200 whitespace-nowrap';
  const tdClass = 'px-2 py-1 text-xs text-gray-300 whitespace-nowrap font-mono';

  return (
    <div className="flex flex-col h-full bg-gray-800 text-gray-200 select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 shrink-0 flex-wrap">
        <Tooltip label="Point Table" description="All imported survey points. Click a row to select the point on the canvas and zoom to it. Right-click for more options. Use the filter box to search by name, code, or description." side="bottom" delay={600}>
          <span className="text-xs font-semibold text-gray-200 flex-1">
            Points <span className="text-gray-400 font-normal">({totalCount})</span>
            {deltaWarningCount > 0 && (
              <span className="ml-2 text-[10px] text-yellow-400" title={`${deltaWarningCount} point group(s) have calc-to-field delta exceeding the warning threshold`}>
                ⚠ {deltaWarningCount}Δ
              </span>
            )}
          </span>
        </Tooltip>

        {/* Filter */}
        <div className="relative">
          <Filter size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by name, code…"
            className="bg-gray-700 text-gray-200 text-xs pl-6 pr-6 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none w-36"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X size={10} />
            </button>
          )}
        </div>

        {/* Code display toggle */}
        <Tooltip
          label="Code Display Mode"
          description="Toggle between alpha codes (BC02, FN03) and numeric codes (309, 742). This also affects the canvas label display. You can change the default in Settings → Points."
          side="bottom"
          delay={400}
        >
          <button
            onClick={() => onCodeDisplayModeChange(codeDisplayMode === 'ALPHA' ? 'NUMERIC' : 'ALPHA')}
            className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 transition-colors"
          >
            {codeDisplayMode === 'ALPHA' ? '🔤 Alpha' : '🔢 Num'}
          </button>
        </Tooltip>

        {/* Show groups toggle */}
        <Tooltip
          label="Show Point Groups"
          description="When enabled, points with the same base number (e.g., 20calc, 20cald, 20set) are highlighted with a colored left-border stripe. The final drawn point is marked with a ★. Delta warnings (Δ) are shown when calc and field positions differ by more than the threshold."
          side="bottom"
          delay={400}
        >
          <button
            onClick={() => setShowGroups(!showGroups)}
            className={`px-2 py-1 text-[11px] rounded border transition-colors ${showGroups ? 'bg-blue-700 border-blue-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}
          >
            Groups
          </button>
        </Tooltip>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1f2e' }}>
            <tr>
              <th className={thClass} onClick={() => handleHeaderClick('pointNumber')} style={{ width: 46 }}>
                <Tooltip label="Point Number" description="The numeric identifier assigned to this point in the field. From the original import file." side="bottom" delay={600}>
                  <span className="flex items-center">#<SortIcon field="pointNumber" sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('pointName')}>
                <Tooltip label="Point Name" description="The full name as entered in the field (e.g., '20set', '35fnd', '100'). Suffixes like fnd/set/calc are parsed to determine monument action." side="bottom" delay={600}>
                  <span className="flex items-center">Name<SortIcon field="pointName" sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('northing')}>
                <Tooltip label="Northing" description="Y coordinate in survey feet. Click header to sort ascending/descending." side="bottom" delay={600}>
                  <span className="flex items-center">N<SortIcon field="northing" sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('easting')}>
                <Tooltip label="Easting" description="X coordinate in survey feet." side="bottom" delay={600}>
                  <span className="flex items-center">E<SortIcon field="easting" sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('elevation')}>
                <Tooltip label="Elevation" description="Z coordinate (elevation) in survey feet. Null if 2D file." side="bottom" delay={600}>
                  <span className="flex items-center">Elev<SortIcon field="elevation" sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick(codeDisplayMode === 'ALPHA' ? 'resolvedAlphaCode' : 'resolvedNumericCode')}>
                <Tooltip label="Point Code" description={`The ${codeDisplayMode === 'ALPHA' ? 'alpha' : 'numeric'} code for this point. B/E/A suffixes indicate line string control. Toggle Code Mode above to switch between alpha (BC02) and numeric (309) display.`} side="bottom" delay={600}>
                  <span className="flex items-center">Code<SortIcon field={codeDisplayMode === 'ALPHA' ? 'resolvedAlphaCode' : 'resolvedNumericCode'} sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('monumentAction')}>
                <Tooltip label="Monument Action" description="Whether this point is FOUND (field-located existing monument), SET (newly set monument), or CALC (computed position). CALC² = recalculation. The ★ marks the chosen final point when a group has multiple positions." side="bottom" delay={600}>
                  <span className="flex items-center">Action<SortIcon field="monumentAction" sort={sort} /></span>
                </Tooltip>
              </th>
              <th className={thClass} style={{ width: 42 }}>
                <Tooltip label="Validation Issues" description="Validation warnings/errors found during import. Click the icon to see details. Red = error, yellow = warning, blue = info." side="bottom" delay={600}>
                  <span>Issues</span>
                </Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPoints.map(pt => {
              const isFinal = isGroupFinal(pt);
              const group = showGroups ? pointStore.getPointGroup(pt.parsedName.baseNumber) : undefined;
              const groupColor = group && group.allPoints.length > 1 ? getGroupColor(pt.parsedName.baseNumber) : undefined;
              const displayCode = codeDisplayMode === 'ALPHA' ? pt.resolvedAlphaCode : pt.resolvedNumericCode;
              const codeSuffix = pt.codeSuffix ?? '';

              return (
                <tr
                  key={pt.id}
                  className={`${getRowBg(pt)} cursor-pointer border-b border-gray-700/50 transition-colors`}
                  onClick={() => handleRowClick(pt)}
                  onContextMenu={(e) => handleRowContextMenu(e, pt)}
                  style={groupColor ? { borderLeft: `3px solid ${groupColor}` } : {}}
                  title="Click to select and zoom to this point on the canvas. Right-click for more options."
                >
                  <td className={tdClass}>{pt.pointNumber}</td>
                  <td className={tdClass}>
                    <span className="flex items-center gap-1">
                      {isFinal && (
                        <Tooltip label="Final point" description="This is the chosen (final) position for this point group. It was selected because it is the SET or FOUND field measurement, or the latest recalculation." side="right" delay={200}>
                          <Star size={10} className="text-yellow-400 fill-yellow-400 shrink-0" />
                        </Tooltip>
                      )}
                      {pt.pointName}
                      {showGroups && <DeltaBadge point={pt} threshold={deltaThreshold} />}
                    </span>
                  </td>
                  <td className={tdClass}>{pt.northing.toFixed(3)}</td>
                  <td className={tdClass}>{pt.easting.toFixed(3)}</td>
                  <td className={tdClass}>{pt.elevation !== null ? pt.elevation.toFixed(2) : <span className="text-gray-600">—</span>}</td>
                  <td className={tdClass}>
                    <span title={pt.codeDefinition?.description ?? 'Unrecognized code'}>
                      {displayCode}{codeSuffix}
                    </span>
                  </td>
                  <td className={tdClass}><ActionBadge point={pt} /></td>
                  <td className={`${tdClass} text-center`}><IssuesBadge issues={pt.validationIssues} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedPoints.length === 0 && filter && (
          <div className="py-8 text-center text-gray-500 text-xs">
            No points match &ldquo;{filter}&rdquo; — try a different search term
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 shrink-0 flex items-center gap-3 text-[11px] text-gray-500">
        <span>{sortedPoints.length} of {totalCount} points</span>
        {filter && <span>· filtered by &ldquo;{filter}&rdquo;</span>}
        {showGroups && pointGroups.size > 0 && (
          <span>· {pointGroups.size} groups</span>
        )}
        <span className="flex-1 text-right text-[10px]">Right-click a row for options</span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[200] bg-gray-900 border border-gray-600 rounded shadow-xl text-xs text-gray-200 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-gray-500 text-[10px] border-b border-gray-700">
            Point #{contextMenu.point.pointNumber} — {contextMenu.point.pointName}
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 transition-colors text-left"
            onClick={() => handleZoomTo(contextMenu.point)}
          >
            <Crosshair size={12} className="text-blue-400" />
            Zoom to Point
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 transition-colors text-left"
            onClick={() => { onSelectPoint?.(contextMenu.point.id); setContextMenu(null); }}
          >
            <Eye size={12} className="text-green-400" />
            Select on Canvas
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 transition-colors text-left"
            onClick={() => handleCopyCoords(contextMenu.point)}
          >
            <Copy size={12} className="text-gray-400" />
            Copy Coordinates
          </button>
          <div className="border-t border-gray-700 mt-1 pt-1">
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-950 transition-colors text-left text-red-400"
              onClick={() => handleDeletePoint(contextMenu.point)}
            >
              <Trash2 size={12} />
              Delete Point
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
