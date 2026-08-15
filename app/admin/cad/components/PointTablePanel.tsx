'use client';
// app/admin/cad/components/PointTablePanel.tsx — Sortable, filterable table of imported survey points

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { usePointStore } from '@/lib/cad/store';
import type { PointSortField } from '@/lib/cad/store';
import type { SurveyPoint } from '@/lib/cad/types';

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

function SortIcon({ field, sort }: { field: PointSortField; sort: SortState }) {
  if (sort.field !== field) return <ChevronsUpDown size={12} className="text-gray-500 ml-1" />;
  return sort.direction === 'asc'
    ? <ChevronUp size={12} className="text-blue-400 ml-1" />
    : <ChevronDown size={12} className="text-blue-400 ml-1" />;
}

/**
 * C9 — an in-place editor for one cell.
 *
 * ── WHY ONLY THREE FIELDS ARE EDITABLE HERE ─────────────────────────────────────────────────────
 *
 * `updatePoint` is a blind shallow merge: it does not re-derive anything and does not touch the
 * linked CAD feature. Most of `SurveyPoint` therefore CANNOT be edited in place without silently
 * desynchronising something:
 *
 *   northing / easting — the linked feature (`featureId`) carries its own geometry. Editing the
 *                        number here would move the point in the table and leave it on the canvas.
 *   pointName          — `parsedName` is derived from it, and `point-rename.ts` exists precisely
 *                        because a rename has to find and update every reference.
 *   rawCode            — `parsedCode`, `resolvedAlphaCode`, `resolvedNumericCode` and
 *                        `codeDefinition` are all derived from it.
 *
 * Those belong to C11's point OPERATIONS, which can re-derive and sync. What is left is the set
 * that derives nothing and drives nothing: `description`, `elevation` (the feature is 2D, so Z is
 * independent of its geometry) and `monumentAction` (a plain enum a surveyor genuinely re-classifies
 * — a found monument turning out to be a set one).
 *
 * Shipping an editable northing that only half-worked would be worse than shipping none.
 */
function EditableCell({
  value,
  placeholder,
  numeric,
  onCommit,
  className,
}: {
  value: string;
  placeholder?: string;
  numeric?: boolean;
  onCommit: (next: string) => void;
  className: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <td
        className={`${className} cursor-text hover:bg-gray-700/60`}
        // The row itself selects the point on click; an edit must not also jump the canvas.
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
        title="Click to edit"
      >
        {value || <span className="text-gray-600">{placeholder ?? '—'}</span>}
      </td>
    );
  }

  const commit = () => { setEditing(false); if (draft !== value) onCommit(draft); };

  return (
    <td className={className} onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={draft}
        inputMode={numeric ? 'decimal' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          // Escape abandons the edit rather than committing it — the one key everyone expects to
          // be an undo, and the only way out of a cell you opened by mistake.
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        className="w-full bg-gray-900 border border-blue-500 rounded px-1 text-xs text-gray-100 font-mono"
      />
    </td>
  );
}

function ActionBadge({ action }: { action: SurveyPoint['monumentAction'] }) {
  if (!action) return <span className="text-gray-500">—</span>;
  const styles: Record<string, string> = {
    FOUND:      'bg-gray-700 text-gray-200',
    SET:        'bg-red-900 text-red-200',
    CALCULATED: 'bg-purple-900 text-purple-200',
    UNKNOWN:    'bg-yellow-900 text-yellow-200',
  };
  const labels: Record<string, string> = {
    FOUND: 'FOUND', SET: 'SET', CALCULATED: 'CALC', UNKNOWN: '?',
  };
  return (
    <span className={`px-1 py-0.5 rounded text-[10px] font-mono ${styles[action]}`}>
      {labels[action]}
    </span>
  );
}

function IssuesBadge({ issues }: { issues: SurveyPoint['validationIssues'] }) {
  if (issues.length === 0) return null;
  const hasError = issues.some(i => i.severity === 'ERROR');
  const hasWarn = issues.some(i => i.severity === 'WARNING');
  const msg = issues[0].message;
  if (hasError) return <span title={msg}><AlertCircle size={12} className="text-red-400 inline" /></span>;
  if (hasWarn) return <span title={msg}><AlertTriangle size={12} className="text-yellow-400 inline" /></span>;
  return <span title={msg}><Info size={12} className="text-blue-400 inline" /></span>;
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

  const sortedPoints = useMemo(
    () => pointStore.getSortedPoints(sort.field, sort.direction, filter || undefined),
    [pointStore, sort, filter],
  );

  const totalCount = pointStore.getPointCount();

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
    if (!showGroups) return false;
    const group = pointStore.getPointGroup(pt.parsedName.baseNumber);
    return group?.finalPoint.id === pt.id && group.allPoints.length > 1;
  }

  function getRowBg(pt: SurveyPoint): string {
    if (pt.validationIssues.some(i => i.severity === 'ERROR')) return 'bg-red-950/40';
    if (pt.validationIssues.some(i => i.severity === 'WARNING')) return 'bg-yellow-950/30';
    return 'hover:bg-gray-750 bg-gray-800';
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-full bg-gray-800 items-center justify-center text-gray-500 text-sm">
        No points imported. Use File → Import to load field data.
      </div>
    );
  }

  const thClass = 'px-2 py-1 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-200 whitespace-nowrap';
  const tdClass = 'px-2 py-1 text-xs text-gray-300 whitespace-nowrap font-mono';

  return (
    <div className="flex flex-col h-full bg-gray-800 text-gray-200 select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-200 flex-1">
          Points <span className="text-gray-400 font-normal">({totalCount})</span>
        </span>

        {/* Filter */}
        <div className="relative shrink-0 h-7 w-36">
          <Filter size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter…"
            className="h-7 w-full bg-gray-700 text-gray-200 placeholder-gray-500 text-xs leading-none pl-7 pr-7 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Code display toggle */}
        <button
          onClick={() => onCodeDisplayModeChange(codeDisplayMode === 'ALPHA' ? 'NUMERIC' : 'ALPHA')}
          className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300"
          title="Toggle alpha/numeric code display"
        >
          Code: {codeDisplayMode}
        </button>

        {/* Show groups toggle */}
        <button
          onClick={() => setShowGroups(!showGroups)}
          className={`px-2 py-1 text-[11px] rounded border ${showGroups ? 'bg-blue-700 border-blue-600 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}
          title="Show calc/set/found group relationships"
        >
          Groups
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1f2e' }}>
            <tr>
              <th className={thClass} onClick={() => handleHeaderClick('pointNumber')} style={{ width: 50 }}>
                <span className="flex items-center">#<SortIcon field="pointNumber" sort={sort} /></span>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('pointName')}>
                <span className="flex items-center">Name<SortIcon field="pointName" sort={sort} /></span>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('northing')}>
                <span className="flex items-center">Northing<SortIcon field="northing" sort={sort} /></span>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('easting')}>
                <span className="flex items-center">Easting<SortIcon field="easting" sort={sort} /></span>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('elevation')}>
                <span className="flex items-center">Elev<SortIcon field="elevation" sort={sort} /></span>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick(codeDisplayMode === 'ALPHA' ? 'resolvedAlphaCode' : 'resolvedNumericCode')}>
                <span className="flex items-center">Code<SortIcon field={codeDisplayMode === 'ALPHA' ? 'resolvedAlphaCode' : 'resolvedNumericCode'} sort={sort} /></span>
              </th>
              <th className={thClass} onClick={() => handleHeaderClick('monumentAction')}>
                <span className="flex items-center">Action<SortIcon field="monumentAction" sort={sort} /></span>
              </th>
              {/* C9 — description was filterable but had no column, so a surveyor could search for a
                  note they could not read. */}
              <th className={thClass} onClick={() => handleHeaderClick('description')}>
                <span className="flex items-center">Description<SortIcon field="description" sort={sort} /></span>
              </th>
              <th className={thClass} style={{ width: 40 }}>Issues</th>
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
                  className={`${getRowBg(pt)} cursor-pointer border-b border-gray-700/50`}
                  onClick={() => onSelectPoint?.(pt.id)}
                  style={groupColor ? { borderLeft: `3px solid ${groupColor}` } : {}}
                >
                  <td className={tdClass}>{pt.pointNumber}</td>
                  <td className={tdClass}>
                    <span className="flex items-center gap-1">
                      {isFinal && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
                      {pt.pointName}
                    </span>
                  </td>
                  <td className={tdClass}>{pt.northing.toFixed(3)}</td>
                  <td className={tdClass}>{pt.easting.toFixed(3)}</td>
                  {/* C9 — editable. Elevation derives nothing and the linked feature is 2D, so Z
                      is independent of its geometry. */}
                  <EditableCell
                    className={tdClass}
                    numeric
                    value={pt.elevation !== null ? pt.elevation.toFixed(2) : ''}
                    onCommit={(next) => {
                      const trimmed = next.trim();
                      // Blank clears it back to null — "no elevation" is a real state for a 2D
                      // point, and is not the same as zero.
                      if (!trimmed) { usePointStore.getState().updatePoint(pt.id, { elevation: null }); return; }
                      const n = Number(trimmed);
                      if (Number.isFinite(n)) usePointStore.getState().updatePoint(pt.id, { elevation: n });
                    }}
                  />
                  <td className={tdClass}>{displayCode}{codeSuffix}</td>
                  {/* C9 — a surveyor genuinely re-classifies these: a monument recorded FOUND turns
                      out to have been SET. A plain enum with nothing derived from it. */}
                  <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={pt.monumentAction ?? ''}
                      onChange={(e) => usePointStore.getState().updatePoint(pt.id, {
                        monumentAction: (e.target.value || null) as SurveyPoint['monumentAction'],
                      })}
                      className="bg-transparent text-[10px] text-gray-300 hover:bg-gray-700 rounded cursor-pointer"
                      aria-label={`Monument action for ${pt.pointName}`}
                    >
                      <option value="">—</option>
                      <option value="FOUND">FOUND</option>
                      <option value="SET">SET</option>
                      <option value="CALCULATED">CALC</option>
                      <option value="UNKNOWN">?</option>
                    </select>
                  </td>
                  {/* C9 — description had no column at all. Free text, nothing derived from it. */}
                  <EditableCell
                    className={`${tdClass} max-w-[180px] truncate`}
                    value={pt.description}
                    placeholder="add note"
                    onCommit={(next) => usePointStore.getState().updatePoint(pt.id, { description: next.trim() })}
                  />
                  <td className={tdClass}><IssuesBadge issues={pt.validationIssues} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedPoints.length === 0 && filter && (
          <div className="py-8 text-center text-gray-500 text-xs">
            No points match &ldquo;{filter}&rdquo;
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 shrink-0 flex items-center gap-3 text-[11px] text-gray-500">
        <span>{sortedPoints.length} of {totalCount} points</span>
        {filter && <span>· filtered</span>}
      </div>
    </div>
  );
}
