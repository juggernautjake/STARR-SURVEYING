// app/admin/components/jobs/FieldWorkView.tsx — Comprehensive field work visualization
// Point map + point log + data table + timeline + crew panel + import/export + job header
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import type { FieldPoint, SessionMarker, LabelToggles, JobContext, CrewActivity } from './fieldwork-types';
import {
  DATA_TYPE_COLORS,
  DATA_TYPE_LABELS,
  RTK_LABELS,
  SESSION_GAP_MS,
  LABEL_NAMES,
  SURVEY_TYPE_LABELS,
  STAGE_LABELS,
  POINT_CODE_CATEGORIES,
  formatTime,
  formatDate,
  formatDateTime,
  formatFullDateTime,
  formatDuration,
  formatDurationLong,
  deriveCrewActivity,
} from './fieldwork-types';
import { generateDemoSurvey } from './fieldwork-demo';
import { buildPointFileContent, downloadFile, parsePointFile } from './fieldwork-export';
import type { ExportFormat } from './fieldwork-export';

// Re-export FieldPoint so existing consumers (e.g. jobs/[id]/page.tsx) keep working
export type { FieldPoint } from './fieldwork-types';
export type { JobContext } from './fieldwork-types';

type ViewTab = 'map' | 'table';
type SortField = 'name' | 'code' | 'elevation' | 'accuracy' | 'time' | 'type' | 'instrument';
type SortDir = 'asc' | 'desc';

interface FieldWorkViewProps {
  jobId: string;
  points: FieldPoint[];
  onRefresh: () => void;
  job?: JobContext;
}


/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function FieldWorkView({ jobId, points: propPoints, onRefresh, job }: FieldWorkViewProps) {
  const [useDemoData, setUseDemoData] = useState(false);
  const demoPoints = useMemo(() => generateDemoSurvey(), []);
  const points = useDemoData ? demoPoints : propPoints;

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [detailPoint, setDetailPoint] = useState<FieldPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineValue, setTimelineValue] = useState(1);
  const [viewTab, setViewTab] = useState<ViewTab>('map');
  const [showCrewPanel, setShowCrewPanel] = useState(false);

  const [showLabels, setShowLabels] = useState<LabelToggles>({
    name: true, code: false, elevation: false, accuracy: false,
    rtk: false, datetime: false, instrument: false, notes: false,
    coordinates: false, satellites: false,
  });

  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showSatellite, setShowSatellite] = useState(false);
  const [hoveredSession, setHoveredSession] = useState<SessionMarker | null>(null);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'timeline'>('all');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportDest, setExportDest] = useState('local');
  const [equipmentPulse, setEquipmentPulse] = useState(0);

  // Table view state
  const [tableSortField, setTableSortField] = useState<SortField>('time');
  const [tableSortDir, setTableSortDir] = useState<SortDir>('desc');
  const [tableFilter, setTableFilter] = useState<string>('all');

  // Import state
  const [importData, setImportData] = useState<FieldPoint[]>([]);
  const [importFileName, setImportFileName] = useState('');

  const logRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const activeExtraLabels = useMemo(() => {
    const keys: Array<keyof LabelToggles> = ['code', 'elevation', 'accuracy', 'rtk', 'datetime', 'instrument', 'notes', 'coordinates', 'satellites'];
    return keys.filter(k => showLabels[k]).length;
  }, [showLabels]);

  // Merge imported data with live data
  const allPoints = useMemo(() => [...points, ...importData], [points, importData]);

  const sortedPoints = useMemo(() =>
    [...allPoints].sort((a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()),
    [allPoints]
  );

  const sessionMarkers = useMemo(() => {
    const markers: SessionMarker[] = [];
    for (let i = 1; i < sortedPoints.length; i++) {
      const prev = new Date(sortedPoints[i - 1].collected_at).getTime();
      const curr = new Date(sortedPoints[i].collected_at).getTime();
      if (curr - prev > SESSION_GAP_MS) {
        markers.push({
          type: 'end', time: prev,
          label: `Survey ended ${formatDateTime(sortedPoints[i - 1].collected_at)}`,
          dateLabel: formatFullDateTime(sortedPoints[i - 1].collected_at),
        });
        markers.push({
          type: 'start', time: curr,
          label: `Survey restarted ${formatDateTime(sortedPoints[i].collected_at)}`,
          dateLabel: formatFullDateTime(sortedPoints[i].collected_at),
        });
      }
    }
    return markers;
  }, [sortedPoints]);

  const timeRange = useMemo(() => {
    if (sortedPoints.length === 0) return { min: 0, max: 1 };
    const times = sortedPoints.map(p => new Date(p.collected_at).getTime());
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [sortedPoints]);

  const cutoffTime = timeRange.min + (timeRange.max - timeRange.min) * timelineValue;
  const visiblePoints = useMemo(() =>
    sortedPoints.filter(p => new Date(p.collected_at).getTime() <= cutoffTime),
    [sortedPoints, cutoffTime]
  );

  const mappablePoints = useMemo(() =>
    visiblePoints.filter(p => p.northing != null && p.easting != null),
    [visiblePoints]
  );

  const filteredPoints = useMemo(() => {
    let filtered = visiblePoints;
    if (tableFilter !== 'all') {
      filtered = filtered.filter(p => p.data_type === tableFilter);
    }
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(p =>
      (p.point_name && p.point_name.toLowerCase().includes(q)) ||
      (p.raw_data?.code && p.raw_data.code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.data_type && p.data_type.toLowerCase().includes(q)) ||
      (p.collected_by && p.collected_by.toLowerCase().includes(q)) ||
      (p.instrument && p.instrument.toLowerCase().includes(q))
    );
  }, [visiblePoints, searchQuery, tableFilter]);

  const logPoints = useMemo(() => [...filteredPoints].reverse(), [filteredPoints]);

  // Sorted for table view
  const tablePoints = useMemo(() => {
    const arr = [...filteredPoints];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (tableSortField) {
        case 'name': cmp = (a.point_name || '').localeCompare(b.point_name || ''); break;
        case 'code': cmp = (a.raw_data?.code || '').localeCompare(b.raw_data?.code || ''); break;
        case 'elevation': cmp = (a.elevation ?? 0) - (b.elevation ?? 0); break;
        case 'accuracy': cmp = (a.raw_data?.accuracy ?? 999) - (b.raw_data?.accuracy ?? 999); break;
        case 'time': cmp = new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime(); break;
        case 'type': cmp = a.data_type.localeCompare(b.data_type); break;
        case 'instrument': cmp = (a.instrument || '').localeCompare(b.instrument || ''); break;
      }
      return tableSortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredPoints, tableSortField, tableSortDir]);

  const bounds = useMemo(() => {
    if (mappablePoints.length === 0) return { minN: 0, maxN: 100, minE: 0, maxE: 100 };
    const ns = mappablePoints.map(p => p.northing!);
    const es = mappablePoints.map(p => p.easting!);
    const minN = Math.min(...ns); const maxN = Math.max(...ns);
    const minE = Math.min(...es); const maxE = Math.max(...es);
    const padN = Math.max((maxN - minN) * 0.12, 10);
    const padE = Math.max((maxE - minE) * 0.12, 10);
    return { minN: minN - padN, maxN: maxN + padN, minE: minE - padE, maxE: maxE + padE };
  }, [mappablePoints]);

  const MAP_W = 800;
  const MAP_H = 600;

  const scaleE = useCallback((e: number) => {
    const range = bounds.maxE - bounds.minE || 1;
    return ((e - bounds.minE) / range) * MAP_W;
  }, [bounds]);

  const scaleN = useCallback((n: number) => {
    const range = bounds.maxN - bounds.minN || 1;
    return MAP_H - ((n - bounds.minN) / range) * MAP_H;
  }, [bounds]);

  // Crew activity stats
  const crewActivity: CrewActivity[] = useMemo(() =>
    deriveCrewActivity(allPoints, job?.team || []),
    [allPoints, job?.team]
  );

  // Job duration stats
  const jobDuration = useMemo(() => {
    if (sortedPoints.length === 0) return null;
    const firstTime = new Date(sortedPoints[0].collected_at).getTime();
    const lastTime = new Date(sortedPoints[sortedPoints.length - 1].collected_at).getTime();
    const totalSpan = lastTime - firstTime;

    // Compute actual field time (excluding gaps > 30min)
    let fieldTime = 0;
    for (let i = 1; i < sortedPoints.length; i++) {
      const gap = new Date(sortedPoints[i].collected_at).getTime() - new Date(sortedPoints[i - 1].collected_at).getTime();
      if (gap < SESSION_GAP_MS) fieldTime += gap;
    }

    const isOngoing = (Date.now() - lastTime) < 60 * 60 * 1000; // last point < 1hr ago

    return { firstTime, lastTime, totalSpan, fieldTime, isOngoing };
  }, [sortedPoints]);

  // Live equipment position
  const equipmentPos = useMemo(() => {
    if (!pollEnabled || sortedPoints.length === 0) return null;
    const last = sortedPoints[sortedPoints.length - 1];
    if (last.northing == null || last.easting == null) return null;
    return {
      northing: last.northing + Math.sin(equipmentPulse * 0.3) * 2,
      easting: last.easting + Math.cos(equipmentPulse * 0.3) * 2,
      label: last.instrument || 'Active Equipment',
    };
  }, [pollEnabled, sortedPoints, equipmentPulse]);

  useEffect(() => {
    if (!pollEnabled) return;
    const interval = setInterval(() => {
      onRefresh();
      setEquipmentPulse(p => p + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [pollEnabled, onRefresh]);

  useEffect(() => {
    if (!selectedPointId || !logRef.current) return;
    const el = logRef.current.querySelector(`[data-point-id="${selectedPointId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedPointId]);

  function handlePointClick(pt: FieldPoint) {
    setSelectedPointId(prev => prev === pt.id ? null : pt.id);
  }
  function handlePointDoubleClick(pt: FieldPoint) {
    setDetailPoint(pt);
  }

  function handleMapMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - mapPan.x, y: e.clientY - mapPan.y });
  }
  function handleMapMouseMove(e: React.MouseEvent) {
    if (!isPanning) return;
    setMapPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }
  function handleMapMouseUp() { setIsPanning(false); }
  function handleMapWheel(e: React.WheelEvent) {
    e.preventDefault();
    setMapZoom(prev => Math.max(0.1, Math.min(20, prev * (e.deltaY > 0 ? 0.9 : 1.1))));
  }
  function resetMapView() { setMapZoom(1); setMapPan({ x: 0, y: 0 }); }
  function toggleLabel(key: keyof LabelToggles) {
    setShowLabels(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function toggleTableSort(field: SortField) {
    if (tableSortField === field) {
      setTableSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setTableSortField(field);
      setTableSortDir('asc');
    }
  }

  function getPointMapLabels(pt: FieldPoint): string[] {
    const lines: string[] = [];
    if (showLabels.name && pt.point_name) lines.push(pt.point_name);
    if (showLabels.code && pt.raw_data?.code) lines.push(`[${pt.raw_data.code}]`);
    if (showLabels.elevation && pt.elevation != null) lines.push(`El: ${pt.elevation.toFixed(2)}`);
    if (showLabels.accuracy && pt.raw_data?.accuracy != null) lines.push(`Acc: ${(pt.raw_data.accuracy * 100).toFixed(1)}cm`);
    if (showLabels.rtk && pt.raw_data?.rtk_status) lines.push(`RTK: ${RTK_LABELS[pt.raw_data.rtk_status]?.label || pt.raw_data.rtk_status}`);
    if (showLabels.datetime) lines.push(formatTime(pt.collected_at));
    if (showLabels.instrument && pt.instrument) lines.push(pt.instrument);
    if (showLabels.coordinates && pt.northing != null && pt.easting != null) lines.push(`N:${pt.northing.toFixed(1)} E:${pt.easting.toFixed(1)}`);
    if (showLabels.satellites && pt.raw_data?.satellites != null) lines.push(`Sat: ${pt.raw_data.satellites}`);
    if (showLabels.notes && pt.raw_data?.notes) lines.push(pt.raw_data.notes.length > 30 ? pt.raw_data.notes.slice(0, 30) + '...' : pt.raw_data.notes);
    return lines;
  }

  function accClass(acc: number) {
    return acc <= 0.02 ? 'fw-log__acc--high' : acc <= 0.05 ? 'fw-log__acc--med' : 'fw-log__acc--low';
  }

  function handleExport() {
    const exportPts = exportScope === 'timeline' ? visiblePoints : sortedPoints;
    const content = buildPointFileContent(exportPts, exportFormat, job?.jobName);
    const extMap: Record<ExportFormat, string> = { csv: 'csv', pnezd: 'txt', dxf: 'dxf', kml: 'kml' };
    const ext = extMap[exportFormat];
    const scopeLabel = exportScope === 'timeline' ? `_timeline_${visiblePoints.length}pts` : `_full_${sortedPoints.length}pts`;
    const jobLabel = job?.jobNumber ? `_${job.jobNumber}` : '';
    const filename = `survey${jobLabel}${scopeLabel}.${ext}`;

    if (exportDest === 'local') {
      downloadFile(content, filename);
    } else {
      downloadFile(content, filename);
      alert(`File "${filename}" downloaded. To save to ${exportDest === 'google' ? 'Google Drive' : exportDest === 'usb' ? 'USB drive' : 'cloud storage'}, upload the downloaded file there.`);
    }
    setShowExport(false);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parsePointFile(text, 'auto');
      setImportData(parsed);
    };
    reader.readAsText(file);
    // Reset file input
    if (importInputRef.current) importInputRef.current.value = '';
  }

  const stats = useMemo(() => {
    const uniqueTypes = new Set<string>(visiblePoints.map(p => p.data_type));
    const fixedCount = visiblePoints.filter(p => p.raw_data?.rtk_status === 'fixed').length;
    const avgAcc = visiblePoints.filter(p => p.raw_data?.accuracy != null);
    const avgAccVal = avgAcc.length > 0 ? avgAcc.reduce((s, p) => s + p.raw_data!.accuracy!, 0) / avgAcc.length : 0;
    const instruments = new Set<string>(visiblePoints.filter(p => p.instrument).map(p => p.instrument!));
    const codes = new Set<string>(visiblePoints.filter(p => p.raw_data?.code).map(p => p.raw_data!.code!));
    const collectors = new Set<string>(visiblePoints.map(p => p.collected_by));
    const elevRange = visiblePoints.filter(p => p.elevation != null);
    const minElev = elevRange.length > 0 ? Math.min(...elevRange.map(p => p.elevation!)) : null;
    const maxElev = elevRange.length > 0 ? Math.max(...elevRange.map(p => p.elevation!)) : null;
    return {
      uniqueTypes: uniqueTypes.size, fixedCount, avgAccCm: avgAccVal * 100,
      instruments: [...instruments], codeCount: codes.size, collectorCount: collectors.size,
      minElev, maxElev,
    };
  }, [visiblePoints]);

  const stageInfo = job ? STAGE_LABELS[job.stage] || STAGE_LABELS.quote : null;

  return (
    <div className="fw">
      {/* Job Context Header */}
      {job && (
        <div className="fw__job-header">
          <div className="fw__job-header-main">
            <div className="fw__job-header-left">
              <span className="fw__job-number">{job.jobNumber}</span>
              <h2 className="fw__job-name">{job.jobName}</h2>
              <div className="fw__job-meta">
                <span>{SURVEY_TYPE_LABELS[job.surveyType] || job.surveyType}</span>
                {job.acreage && <span>{job.acreage} acres</span>}
                {job.clientName && <span>{job.clientName}</span>}
                {job.address && <span>{job.address}{job.city ? `, ${job.city}` : ''}{job.state ? ` ${job.state}` : ''}</span>}
                {job.county && <span>{job.county} County</span>}
              </div>
            </div>
            <div className="fw__job-header-right">
              {stageInfo && (
                <span className="fw__job-stage" style={{ background: stageInfo.color + '20', color: stageInfo.color }}>
                  {stageInfo.label}
                </span>
              )}
              {job.deadline && (
                <span className="fw__job-deadline">
                  Due: {formatDate(job.deadline)}
                </span>
              )}
            </div>
          </div>

          {/* Duration & crew summary bar */}
          <div className="fw__job-summary">
            <div className="fw__job-summary-item">
              <span className="fw__job-summary-icon">📏</span>
              <div>
                <span className="fw__job-summary-val">{allPoints.length}</span>
                <span className="fw__job-summary-lbl">Total Points</span>
              </div>
            </div>
            {jobDuration && (
              <>
                <div className="fw__job-summary-item">
                  <span className="fw__job-summary-icon">⏱️</span>
                  <div>
                    <span className="fw__job-summary-val">{formatDuration(jobDuration.fieldTime)}</span>
                    <span className="fw__job-summary-lbl">Field Time</span>
                  </div>
                </div>
                <div className="fw__job-summary-item">
                  <span className="fw__job-summary-icon">📅</span>
                  <div>
                    <span className="fw__job-summary-val">{formatDurationLong(jobDuration.totalSpan)}</span>
                    <span className="fw__job-summary-lbl">{jobDuration.isOngoing ? 'Open (Ongoing)' : 'Total Span'}</span>
                  </div>
                </div>
              </>
            )}
            <div className="fw__job-summary-item">
              <span className="fw__job-summary-icon">👥</span>
              <div>
                <span className="fw__job-summary-val">{crewActivity.length}</span>
                <span className="fw__job-summary-lbl">
                  Crew{crewActivity.filter(c => c.isActive).length > 0 ? ` (${crewActivity.filter(c => c.isActive).length} active)` : ''}
                </span>
              </div>
            </div>
            <div className="fw__job-summary-item">
              <span className="fw__job-summary-icon">🔧</span>
              <div>
                <span className="fw__job-summary-val">{stats.instruments.length}</span>
                <span className="fw__job-summary-lbl">Instrument{stats.instruments.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {job.totalHours > 0 && (
              <div className="fw__job-summary-item">
                <span className="fw__job-summary-icon">🕐</span>
                <div>
                  <span className="fw__job-summary-val">{job.totalHours}h</span>
                  <span className="fw__job-summary-lbl">Logged Hours</span>
                </div>
              </div>
            )}
            <button className="fw__crew-toggle" onClick={() => setShowCrewPanel(!showCrewPanel)}>
              {showCrewPanel ? 'Hide Crew' : 'Show Crew Details'}
            </button>
          </div>
        </div>
      )}

      {/* Crew Activity Panel */}
      {showCrewPanel && crewActivity.length > 0 && (
        <div className="fw__crew-panel">
          <h4 className="fw__crew-title">Field Crew Activity</h4>
          <div className="fw__crew-grid">
            {crewActivity.map(crew => (
              <div key={crew.email} className={`fw__crew-card ${crew.isActive ? 'fw__crew-card--active' : ''}`}>
                <div className="fw__crew-card-header">
                  <span className={`fw__crew-status ${crew.isActive ? 'fw__crew-status--active' : crew.pointCount > 0 ? 'fw__crew-status--idle' : 'fw__crew-status--none'}`} />
                  <span className="fw__crew-name">{crew.name}</span>
                  {crew.isActive && <span className="fw__crew-active-badge">In Field</span>}
                </div>
                <div className="fw__crew-card-body">
                  <div className="fw__crew-stat"><span className="fw__crew-stat-lbl">Points</span><span className="fw__crew-stat-val">{crew.pointCount}</span></div>
                  {crew.instruments.length > 0 && (
                    <div className="fw__crew-stat"><span className="fw__crew-stat-lbl">Instrument</span><span className="fw__crew-stat-val">{crew.instruments.join(', ')}</span></div>
                  )}
                  {crew.avgAccuracy != null && (
                    <div className="fw__crew-stat"><span className="fw__crew-stat-lbl">Avg Accuracy</span><span className="fw__crew-stat-val">{(crew.avgAccuracy * 100).toFixed(1)}cm</span></div>
                  )}
                  {crew.fixedCount > 0 && (
                    <div className="fw__crew-stat"><span className="fw__crew-stat-lbl">Fixed RTK</span><span className="fw__crew-stat-val">{crew.fixedCount}</span></div>
                  )}
                  {crew.firstPoint && (
                    <div className="fw__crew-stat"><span className="fw__crew-stat-lbl">First Shot</span><span className="fw__crew-stat-val">{formatDateTime(crew.firstPoint)}</span></div>
                  )}
                  {crew.lastPoint && (
                    <div className="fw__crew-stat"><span className="fw__crew-stat-lbl">Last Shot</span><span className="fw__crew-stat-val">{formatDateTime(crew.lastPoint)}</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="fw__controls">
        <div className="fw__controls-left">
          <h3 className="fw__title">Field Data ({allPoints.length} points{importData.length > 0 ? ` · ${importData.length} imported` : ''})</h3>
          <label className="fw__poll-toggle">
            <input type="checkbox" checked={pollEnabled} onChange={e => setPollEnabled(e.target.checked)} />
            Live Mode
          </label>
          {pollEnabled && <span className="fw__live-dot" title="Live — polling every 5s" />}
        </div>
        <div className="fw__controls-right">
          {/* View toggle */}
          <div className="fw__view-tabs">
            <button className={`fw__view-tab ${viewTab === 'map' ? 'fw__view-tab--active' : ''}`} onClick={() => setViewTab('map')}>Map View</button>
            <button className={`fw__view-tab ${viewTab === 'table' ? 'fw__view-tab--active' : ''}`} onClick={() => setViewTab('table')}>Data Table</button>
          </div>
          {propPoints.length === 0 && importData.length === 0 && (
            <button className={`fw__btn ${useDemoData ? 'fw__btn--active' : ''}`} onClick={() => setUseDemoData(!useDemoData)}>
              {useDemoData ? 'Hide Demo' : 'Load Demo'}
            </button>
          )}
          <button className="fw__btn" onClick={() => setShowImport(true)}>Import</button>
          <button className="fw__btn" onClick={onRefresh}>Refresh</button>
          {viewTab === 'map' && <button className="fw__btn" onClick={resetMapView}>Reset View</button>}
          <button className="fw__btn fw__btn--primary" onClick={() => setShowExport(true)} disabled={allPoints.length === 0}>
            Export
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {allPoints.length > 0 && (
        <div className="fw__stats">
          <div className="fw__stat"><span className="fw__stat-val">{visiblePoints.length}</span><span className="fw__stat-lbl">Visible Pts</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{stats.uniqueTypes}</span><span className="fw__stat-lbl">Types</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{stats.codeCount}</span><span className="fw__stat-lbl">Codes</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{stats.fixedCount}</span><span className="fw__stat-lbl">Fixed RTK</span></div>
          {stats.avgAccCm > 0 && <div className="fw__stat"><span className="fw__stat-val">{stats.avgAccCm.toFixed(1)}cm</span><span className="fw__stat-lbl">Avg Accuracy</span></div>}
          {stats.minElev != null && stats.maxElev != null && (
            <div className="fw__stat"><span className="fw__stat-val">{stats.minElev.toFixed(1)} — {stats.maxElev.toFixed(1)}</span><span className="fw__stat-lbl">Elev Range</span></div>
          )}
          <div className="fw__stat"><span className="fw__stat-val">{stats.instruments.join(', ') || '—'}</span><span className="fw__stat-lbl">Instruments</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{sessionMarkers.length / 2 + 1}</span><span className="fw__stat-lbl">Sessions</span></div>
        </div>
      )}

      {/* Label toggles + satellite toggle */}
      {viewTab === 'map' && (
        <div className="fw__label-toggles">
          <span className="fw__label-toggles-title">Display:</span>
          {(Object.keys(LABEL_NAMES) as Array<keyof LabelToggles>).map(key => (
            <label key={key} className={`fw__label-toggle ${showLabels[key] ? 'fw__label-toggle--active' : ''}`}>
              <input type="checkbox" checked={showLabels[key]} onChange={() => toggleLabel(key)} />
              {LABEL_NAMES[key]}
            </label>
          ))}
          <span className="fw__label-toggles-sep" />
          <label className="fw__label-toggle fw__label-toggle--sat">
            <span className="fw__toggle-switch">
              <input type="checkbox" checked={showSatellite} onChange={e => setShowSatellite(e.target.checked)} />
              <span className="fw__toggle-track"><span className="fw__toggle-thumb" /></span>
            </span>
            Satellite
          </label>
        </div>
      )}

      {/* Type filter for table view */}
      {viewTab === 'table' && (
        <div className="fw__table-filters">
          <span className="fw__label-toggles-title">Filter:</span>
          <button className={`fw__filter-btn ${tableFilter === 'all' ? 'fw__filter-btn--active' : ''}`} onClick={() => setTableFilter('all')}>All</button>
          {Object.entries(DATA_TYPE_LABELS).map(([key, label]) => {
            const count = visiblePoints.filter(p => p.data_type === key).length;
            if (count === 0) return null;
            return (
              <button key={key} className={`fw__filter-btn ${tableFilter === key ? 'fw__filter-btn--active' : ''}`}
                onClick={() => setTableFilter(tableFilter === key ? 'all' : key)}
                style={{ borderColor: tableFilter === key ? DATA_TYPE_COLORS[key] : undefined, color: tableFilter === key ? DATA_TYPE_COLORS[key] : undefined }}>
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ MAP VIEW ═══ */}
      {viewTab === 'map' && (
        <>
          <div className="fw__layout">
            {/* Left: Map */}
            <div className="fw__map-container">
              {mappablePoints.length === 0 ? (
                <div className="fw__map-empty">
                  <span className="fw__map-empty-icon">📡</span>
                  <p>No coordinate data yet</p>
                  <p className="fw__map-empty-sub">Points will appear on the map as field crew collects data</p>
                  {propPoints.length === 0 && !useDemoData && importData.length === 0 && (
                    <button className="fw__btn" style={{ marginTop: '1rem' }} onClick={() => setUseDemoData(true)}>
                      Load Demo Survey
                    </button>
                  )}
                </div>
              ) : (
                <svg ref={mapRef} className="fw__map-svg"
                  viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet"
                  onMouseDown={handleMapMouseDown} onMouseMove={handleMapMouseMove}
                  onMouseUp={handleMapMouseUp} onMouseLeave={handleMapMouseUp}
                  onWheel={handleMapWheel}
                  style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                >
                  <rect x="0" y="0" width={MAP_W} height={MAP_H} fill={showSatellite ? '#2D4A2D' : '#FAFBFC'} />

                  {showSatellite && (
                    <g opacity="0.35">
                      <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#3A5A3A" />
                      {Array.from({ length: 8 }, (_, i) => (
                        <ellipse key={`tree${i}`} cx={100 + i * 95 + (i % 2) * 40} cy={80 + (i % 3) * 180}
                          rx={35 + (i % 3) * 15} ry={25 + (i % 2) * 10} fill="#2A4A2A" />
                      ))}
                      <rect x="0" y={MAP_H - 60} width={MAP_W} height="35" fill="#5A5A5A" opacity="0.6" />
                    </g>
                  )}

                  <g opacity={showSatellite ? 0.08 : 0.15} stroke={showSatellite ? '#fff' : '#94A3B8'} strokeWidth="0.5">
                    {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} x1="0" y1={(MAP_H / 10) * i} x2={MAP_W} y2={(MAP_H / 10) * i} />)}
                    {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={(MAP_W / 10) * i} y1="0" x2={(MAP_W / 10) * i} y2={MAP_H} />)}
                  </g>

                  <text x="4" y="14" fill={showSatellite ? '#ccc' : '#94A3B8'} fontSize="9" fontFamily="monospace">N: {bounds.maxN.toFixed(1)}</text>
                  <text x="4" y={MAP_H - 4} fill={showSatellite ? '#ccc' : '#94A3B8'} fontSize="9" fontFamily="monospace">N: {bounds.minN.toFixed(1)}</text>
                  <text x={MAP_W - 4} y={MAP_H - 4} fill={showSatellite ? '#ccc' : '#94A3B8'} fontSize="9" fontFamily="monospace" textAnchor="end">E: {bounds.maxE.toFixed(1)}</text>

                  <g transform={`translate(${mapPan.x}, ${mapPan.y}) scale(${mapZoom})`}>
                    {mappablePoints.length > 1 && mappablePoints.map((pt, i) => {
                      if (i === 0) return null;
                      const prev = mappablePoints[i - 1];
                      return <line key={`line-${pt.id}`}
                        x1={scaleE(prev.easting!)} y1={scaleN(prev.northing!)}
                        x2={scaleE(pt.easting!)} y2={scaleN(pt.northing!)}
                        stroke={showSatellite ? '#ffffff40' : '#CBD5E1'}
                        strokeWidth={0.5 / mapZoom} strokeDasharray={`${3 / mapZoom}`} />;
                    })}

                    {mappablePoints.map(pt => {
                      const cx = scaleE(pt.easting!);
                      const cy = scaleN(pt.northing!);
                      const isSelected = selectedPointId === pt.id;
                      const color = DATA_TYPE_COLORS[pt.data_type] || '#1D3095';
                      const r = isSelected ? 7 / mapZoom : 5 / mapZoom;
                      const labelLines = getPointMapLabels(pt);

                      return (
                        <g key={pt.id} style={{ cursor: 'pointer' }}>
                          {isSelected && (
                            <circle cx={cx} cy={cy} r={12 / mapZoom} fill="none" stroke={color} strokeWidth={2 / mapZoom} opacity="0.5">
                              <animate attributeName="r" values={`${12 / mapZoom};${16 / mapZoom};${12 / mapZoom}`} dur="1.5s" repeatCount="indefinite" />
                            </circle>
                          )}
                          <circle cx={cx} cy={cy} r={r} fill={color} stroke={showSatellite ? '#000' : '#fff'} strokeWidth={1.5 / mapZoom}
                            onClick={(e) => { e.stopPropagation(); handlePointClick(pt); }}
                            onDoubleClick={(e) => { e.stopPropagation(); handlePointDoubleClick(pt); }} />
                          {labelLines.length > 0 && (
                            <g>
                              <rect x={cx + 7 / mapZoom} y={cy - (6 + (labelLines.length - 1) * 11) / mapZoom}
                                width={Math.max(...labelLines.map(l => l.length)) * 5.5 / mapZoom + 6 / mapZoom}
                                height={(labelLines.length * 11 + 2) / mapZoom} rx={2 / mapZoom}
                                fill={showSatellite ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)'} pointerEvents="none" />
                              {labelLines.map((line, li) => (
                                <text key={li} x={cx + 10 / mapZoom}
                                  y={cy + (-3 + (li - labelLines.length + 1) * 11 + 8) / mapZoom}
                                  fontSize={9 / mapZoom} fill={showSatellite ? '#E5E7EB' : '#374151'}
                                  fontFamily="monospace" pointerEvents="none">
                                  {line}
                                </text>
                              ))}
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {/* Live equipment position */}
                    {equipmentPos && (
                      <g>
                        <circle cx={scaleE(equipmentPos.easting)} cy={scaleN(equipmentPos.northing)}
                          r={14 / mapZoom} fill="none" stroke="#FF6B00" strokeWidth={2 / mapZoom} opacity="0.3">
                          <animate attributeName="r" values={`${14 / mapZoom};${28 / mapZoom};${14 / mapZoom}`} dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.4;0.0;0.4" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={scaleE(equipmentPos.easting)} cy={scaleN(equipmentPos.northing)}
                          r={8 / mapZoom} fill="none" stroke="#FF6B00" strokeWidth={1.5 / mapZoom} opacity="0.6">
                          <animate attributeName="r" values={`${8 / mapZoom};${18 / mapZoom};${8 / mapZoom}`} dur="2s" repeatCount="indefinite" begin="0.3s" />
                          <animate attributeName="opacity" values="0.6;0.0;0.6" dur="2s" repeatCount="indefinite" begin="0.3s" />
                        </circle>
                        <circle cx={scaleE(equipmentPos.easting)} cy={scaleN(equipmentPos.northing)}
                          r={5 / mapZoom} fill="#FF6B00" stroke="#fff" strokeWidth={2 / mapZoom} />
                        <text x={scaleE(equipmentPos.easting) + 10 / mapZoom} y={scaleN(equipmentPos.northing) - 10 / mapZoom}
                          fontSize={9 / mapZoom} fill="#FF6B00" fontWeight="bold" fontFamily="monospace" pointerEvents="none">
                          {equipmentPos.label}
                        </text>
                      </g>
                    )}
                  </g>

                  <g transform={`translate(${MAP_W - 120}, ${MAP_H - 30})`}>
                    <line x1="0" y1="0" x2="80" y2="0" stroke={showSatellite ? '#fff' : '#374151'} strokeWidth="2" />
                    <line x1="0" y1="-4" x2="0" y2="4" stroke={showSatellite ? '#fff' : '#374151'} strokeWidth="1.5" />
                    <line x1="80" y1="-4" x2="80" y2="4" stroke={showSatellite ? '#fff' : '#374151'} strokeWidth="1.5" />
                    <text x="40" y="14" textAnchor="middle" fontSize="9" fill={showSatellite ? '#ccc' : '#374151'} fontFamily="monospace">
                      {((bounds.maxE - bounds.minE) * 80 / MAP_W).toFixed(1)} ft
                    </text>
                  </g>
                </svg>
              )}

              <div className="fw__map-zoom">
                <button className="fw__map-zoom-btn" onClick={() => setMapZoom(z => Math.min(20, z * 1.3))}>+</button>
                <span className="fw__map-zoom-level">{Math.round(mapZoom * 100)}%</span>
                <button className="fw__map-zoom-btn" onClick={() => setMapZoom(z => Math.max(0.1, z / 1.3))}>-</button>
              </div>

              <div className="fw__map-legend">
                {Object.entries(DATA_TYPE_COLORS).map(([type, color]) => {
                  if (!mappablePoints.some(p => p.data_type === type)) return null;
                  return <span key={type} className="fw__map-legend-item"><span className="fw__map-legend-dot" style={{ background: color }} />{DATA_TYPE_LABELS[type] || type}</span>;
                })}
                {equipmentPos && <span className="fw__map-legend-item"><span className="fw__map-legend-dot" style={{ background: '#FF6B00' }} />Live Equipment</span>}
              </div>
            </div>

            {/* Right: Point Log */}
            <div className="fw__log">
              <div className="fw__log-header">
                <h4 className="fw__log-title">Shot Log</h4>
                <span className="fw__log-count">{filteredPoints.length} pts</span>
              </div>
              <div className="fw__log-search">
                <input type="text" placeholder="Search name, code, description, instrument..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="fw__log-search-input" />
                {searchQuery && <button className="fw__log-search-clear" onClick={() => setSearchQuery('')}>x</button>}
              </div>
              <div className="fw__log-list" ref={logRef}>
                {logPoints.length === 0 ? (
                  <div className="fw__log-empty">{searchQuery ? 'No points match your search' : 'No points recorded yet'}</div>
                ) : logPoints.map(pt => {
                  const isSelected = selectedPointId === pt.id;
                  const hasExtras = activeExtraLabels > 0;
                  return (
                    <div key={pt.id} data-point-id={pt.id}
                      className={`fw__log-item ${isSelected ? 'fw__log-item--selected' : ''} ${hasExtras ? 'fw__log-item--expanded' : ''}`}
                      onClick={() => handlePointClick(pt)} onDoubleClick={() => handlePointDoubleClick(pt)}>
                      <div className="fw__log-item-top">
                        <span className="fw__log-item-name">{pt.point_name || 'Unnamed'}</span>
                        <span className="fw__log-item-type" style={{ color: DATA_TYPE_COLORS[pt.data_type] || '#6B7280' }}>
                          {DATA_TYPE_LABELS[pt.data_type] || pt.data_type}
                        </span>
                      </div>
                      <div className="fw__log-item-mid">
                        {pt.description && <span className="fw__log-item-desc">{pt.description}</span>}
                        {pt.raw_data?.code && <span className="fw__log-item-code">{pt.raw_data.code}</span>}
                      </div>
                      <div className="fw__log-item-bottom">
                        <span className="fw__log-item-time">{formatDate(pt.collected_at)} {formatTime(pt.collected_at)}</span>
                        <div className="fw__log-item-badges">
                          {pt.raw_data?.accuracy != null && <span className={`fw-log__acc ${accClass(pt.raw_data.accuracy)}`}>{(pt.raw_data.accuracy * 100).toFixed(1)}cm</span>}
                          {pt.raw_data?.rtk_status && (
                            <span className="fw-log__rtk" style={{ background: (RTK_LABELS[pt.raw_data.rtk_status]?.color || '#6B7280') + '20', color: RTK_LABELS[pt.raw_data.rtk_status]?.color || '#6B7280' }}>
                              {RTK_LABELS[pt.raw_data.rtk_status]?.label || pt.raw_data.rtk_status}
                            </span>
                          )}
                        </div>
                      </div>
                      {hasExtras && (
                        <div className="fw__log-item-extra">
                          {showLabels.coordinates && pt.northing != null && (
                            <div className="fw__log-extra-row"><span className="fw__log-extra-label">Coords</span>
                              <span className="fw__log-extra-val">N: {pt.northing.toFixed(4)} &nbsp; E: {pt.easting?.toFixed(4)} &nbsp; El: {pt.elevation?.toFixed(4) ?? '—'}</span></div>
                          )}
                          {showLabels.elevation && pt.elevation != null && !showLabels.coordinates && (
                            <div className="fw__log-extra-row"><span className="fw__log-extra-label">Elevation</span><span className="fw__log-extra-val">{pt.elevation.toFixed(4)}</span></div>
                          )}
                          {showLabels.instrument && pt.instrument && (
                            <div className="fw__log-extra-row"><span className="fw__log-extra-label">Instrument</span><span className="fw__log-extra-val">{pt.instrument}</span></div>
                          )}
                          {showLabels.satellites && pt.raw_data?.satellites != null && (
                            <div className="fw__log-extra-row"><span className="fw__log-extra-label">Satellites</span><span className="fw__log-extra-val">{pt.raw_data.satellites} tracked</span></div>
                          )}
                          {showLabels.accuracy && pt.raw_data?.pdop != null && (
                            <div className="fw__log-extra-row"><span className="fw__log-extra-label">DOP</span>
                              <span className="fw__log-extra-val">P:{pt.raw_data.pdop.toFixed(2)} H:{pt.raw_data.hdop?.toFixed(2) ?? '—'} V:{pt.raw_data.vdop?.toFixed(2) ?? '—'}</span></div>
                          )}
                          {showLabels.notes && pt.raw_data?.notes && (
                            <div className="fw__log-extra-row fw__log-extra-row--note"><span className="fw__log-extra-label">Note</span><span className="fw__log-extra-val">{pt.raw_data.notes}</span></div>
                          )}
                          {pt.raw_data?.hz_angle != null && (showLabels.accuracy || showLabels.instrument) && (
                            <div className="fw__log-extra-row"><span className="fw__log-extra-label">Obs</span>
                              <span className="fw__log-extra-val">Hz: {pt.raw_data.hz_angle.toFixed(4)} Vt: {pt.raw_data.vt_angle?.toFixed(4) ?? '—'} SD: {pt.raw_data.slope_dist?.toFixed(3) ?? '—'}</span></div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ TABLE VIEW ═══ */}
      {viewTab === 'table' && (
        <div className="fw__table-container">
          <div className="fw__table-search">
            <input type="text" placeholder="Search all columns..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="fw__log-search-input" />
            {searchQuery && <button className="fw__log-search-clear" onClick={() => setSearchQuery('')}>x</button>}
          </div>
          <div className="fw__table-scroll">
            <table className="fw__table">
              <thead>
                <tr>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('name')}>
                    Point {tableSortField === 'name' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('code')}>
                    Code {tableSortField === 'code' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="fw__th">Northing</th>
                  <th className="fw__th">Easting</th>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('elevation')}>
                    Elevation {tableSortField === 'elevation' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="fw__th">Description</th>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('type')}>
                    Type {tableSortField === 'type' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('accuracy')}>
                    Accuracy {tableSortField === 'accuracy' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="fw__th">RTK</th>
                  <th className="fw__th">DOP</th>
                  <th className="fw__th">Sats</th>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('instrument')}>
                    Instrument {tableSortField === 'instrument' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="fw__th">Collector</th>
                  <th className="fw__th fw__th--sortable" onClick={() => toggleTableSort('time')}>
                    Time {tableSortField === 'time' ? (tableSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tablePoints.length === 0 ? (
                  <tr><td colSpan={14} className="fw__table-empty">No points to display</td></tr>
                ) : tablePoints.map(pt => (
                  <tr key={pt.id}
                    className={`fw__tr ${selectedPointId === pt.id ? 'fw__tr--selected' : ''}`}
                    onClick={() => handlePointClick(pt)}
                    onDoubleClick={() => handlePointDoubleClick(pt)}>
                    <td className="fw__td fw__td--mono fw__td--name">{pt.point_name || '—'}</td>
                    <td className="fw__td">
                      {pt.raw_data?.code && (
                        <span className="fw__td-code" style={{
                          background: (POINT_CODE_CATEGORIES[pt.raw_data.code]?.color || '#6B7280') + '15',
                          color: POINT_CODE_CATEGORIES[pt.raw_data.code]?.color || '#6B7280',
                        }}>
                          {pt.raw_data.code}
                        </span>
                      )}
                    </td>
                    <td className="fw__td fw__td--mono">{pt.northing?.toFixed(4) ?? '—'}</td>
                    <td className="fw__td fw__td--mono">{pt.easting?.toFixed(4) ?? '—'}</td>
                    <td className="fw__td fw__td--mono">{pt.elevation?.toFixed(4) ?? '—'}</td>
                    <td className="fw__td fw__td--desc">{pt.description || '—'}</td>
                    <td className="fw__td">
                      <span className="fw__td-type" style={{ color: DATA_TYPE_COLORS[pt.data_type] }}>
                        {DATA_TYPE_LABELS[pt.data_type] || pt.data_type}
                      </span>
                    </td>
                    <td className="fw__td">
                      {pt.raw_data?.accuracy != null && (
                        <span className={`fw-log__acc ${accClass(pt.raw_data.accuracy)}`}>
                          {(pt.raw_data.accuracy * 100).toFixed(1)}cm
                        </span>
                      )}
                    </td>
                    <td className="fw__td">
                      {pt.raw_data?.rtk_status && (
                        <span className="fw-log__rtk" style={{
                          background: (RTK_LABELS[pt.raw_data.rtk_status]?.color || '#6B7280') + '20',
                          color: RTK_LABELS[pt.raw_data.rtk_status]?.color || '#6B7280',
                        }}>
                          {RTK_LABELS[pt.raw_data.rtk_status]?.label || pt.raw_data.rtk_status}
                        </span>
                      )}
                    </td>
                    <td className="fw__td fw__td--mono fw__td--sm">
                      {pt.raw_data?.pdop != null ? `${pt.raw_data.pdop.toFixed(1)}` : '—'}
                    </td>
                    <td className="fw__td fw__td--sm">{pt.raw_data?.satellites ?? '—'}</td>
                    <td className="fw__td fw__td--sm">{pt.instrument || '—'}</td>
                    <td className="fw__td fw__td--sm">{pt.collected_by.split('@')[0]}</td>
                    <td className="fw__td fw__td--mono fw__td--sm">{formatDateTime(pt.collected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fw__table-footer">
            <span>{tablePoints.length} of {visiblePoints.length} points shown</span>
            {importData.length > 0 && (
              <button className="fw__btn fw__btn--sm" onClick={() => { setImportData([]); setImportFileName(''); }}>
                Clear Imported ({importData.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Timeline Slider */}
      <div className="fw__timeline">
        <div className="fw__timeline-header">
          <span className="fw__timeline-label">{sortedPoints.length > 0 ? formatDateTime(sortedPoints[0].collected_at) : '—'}</span>
          <span className="fw__timeline-current">
            Showing {visiblePoints.length} of {sortedPoints.length} points
            {timelineValue < 1 && ` (up to ${formatFullDateTime(new Date(cutoffTime).toISOString())})`}
          </span>
          <span className="fw__timeline-label">{sortedPoints.length > 0 ? formatDateTime(sortedPoints[sortedPoints.length - 1].collected_at) : '—'}</span>
        </div>
        <div className="fw__timeline-track">
          {sortedPoints.length > 0 && (
            <div className="fw__timeline-density">
              {Array.from({ length: 50 }, (_, i) => {
                const tStart = timeRange.min + (timeRange.max - timeRange.min) * (i / 50);
                const tEnd = timeRange.min + (timeRange.max - timeRange.min) * ((i + 1) / 50);
                const count = sortedPoints.filter(p => { const t = new Date(p.collected_at).getTime(); return t >= tStart && t < tEnd; }).length;
                const maxH = 12;
                const h = count > 0 ? Math.max(2, Math.min(maxH, (count / Math.max(1, sortedPoints.length / 10)) * maxH)) : 0;
                return <div key={i} className="fw__timeline-density-bar" style={{ height: h, opacity: count > 0 ? 0.4 : 0 }} />;
              })}
            </div>
          )}
          {sessionMarkers.map((marker, i) => {
            const pos = timeRange.max === timeRange.min ? 50 : ((marker.time - timeRange.min) / (timeRange.max - timeRange.min)) * 100;
            return (
              <div key={i} className={`fw__timeline-marker fw__timeline-marker--${marker.type}`} style={{ left: `${pos}%` }}
                onMouseEnter={() => setHoveredSession(marker)} onMouseLeave={() => setHoveredSession(null)}
                onClick={() => setHoveredSession(prev => prev === marker ? null : marker)}>
                <div className="fw__timeline-marker-line" />
                {hoveredSession === marker && (
                  <div className="fw__timeline-marker-tooltip">
                    <div>{marker.label}</div>
                    <div style={{ fontSize: '0.62rem', opacity: 0.7 }}>{marker.dateLabel}</div>
                  </div>
                )}
              </div>
            );
          })}
          <input type="range" min="0" max="1" step="0.001"
            value={timelineValue} onChange={e => setTimelineValue(parseFloat(e.target.value))}
            className="fw__timeline-slider" />
        </div>
        <div className="fw__timeline-actions">
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0)}>Start</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0.25)}>25%</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0.5)}>50%</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(0.75)}>75%</button>
          <button className="fw__btn fw__btn--sm" onClick={() => setTimelineValue(1)}>Current</button>
        </div>
      </div>

      {/* Import Dialog */}
      {showImport && (
        <div className="fw__popup-overlay" onClick={() => setShowImport(false)}>
          <div className="fw__popup" onClick={e => e.stopPropagation()}>
            <div className="fw__popup-header"><h3>Import Point File</h3><button className="fw__popup-close" onClick={() => setShowImport(false)}>x</button></div>
            <div className="fw__popup-body">
              <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: '0 0 1rem' }}>
                Import points from a CSV or PNEZD text file. Supports files exported from Trimble Business Center, Trimble Access, AutoCAD Civil 3D, or any standard point file format.
              </p>
              <div className="fw__import-formats">
                <div className="fw__import-format">
                  <strong>CSV</strong>
                  <span>Headers: Point Name, Northing, Easting, Elevation, Code, Description, ...</span>
                </div>
                <div className="fw__import-format">
                  <strong>PNEZD</strong>
                  <span>No header. Columns: Point, Northing, Easting, Elevation, Description</span>
                </div>
              </div>
              <div className="fw__import-drop">
                <input ref={importInputRef} type="file" accept=".csv,.txt,.pnezd" onChange={handleImportFile} style={{ display: 'none' }} />
                <button className="fw__btn fw__btn--primary" onClick={() => importInputRef.current?.click()}>
                  Choose File
                </button>
                {importFileName && <span className="fw__import-file-name">{importFileName}</span>}
              </div>
              {importData.length > 0 && (
                <div className="fw__import-preview">
                  <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{importData.length} points parsed successfully</p>
                  <div className="fw__import-preview-table">
                    <table className="fw__table">
                      <thead>
                        <tr>
                          <th className="fw__th">Point</th>
                          <th className="fw__th">N</th>
                          <th className="fw__th">E</th>
                          <th className="fw__th">Z</th>
                          <th className="fw__th">Desc</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importData.slice(0, 10).map(p => (
                          <tr key={p.id}>
                            <td className="fw__td fw__td--mono">{p.point_name || '—'}</td>
                            <td className="fw__td fw__td--mono">{p.northing?.toFixed(2)}</td>
                            <td className="fw__td fw__td--mono">{p.easting?.toFixed(2)}</td>
                            <td className="fw__td fw__td--mono">{p.elevation?.toFixed(2) ?? '—'}</td>
                            <td className="fw__td">{p.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importData.length > 10 && <p style={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', margin: '0.5rem 0 0' }}>...and {importData.length - 10} more</p>}
                  </div>
                </div>
              )}
              <div className="fw__export-actions">
                <button className="fw__btn" onClick={() => { setShowImport(false); setImportData([]); setImportFileName(''); }}>Cancel</button>
                <button className="fw__btn fw__btn--primary" onClick={() => setShowImport(false)} disabled={importData.length === 0}>
                  Load {importData.length} Points
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {showExport && (
        <div className="fw__popup-overlay" onClick={() => setShowExport(false)}>
          <div className="fw__popup" onClick={e => e.stopPropagation()}>
            <div className="fw__popup-header"><h3>Export Point File</h3><button className="fw__popup-close" onClick={() => setShowExport(false)}>x</button></div>
            <div className="fw__popup-body">
              <div className="fw__popup-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                <h4>Which points?</h4>
                <div className="fw__export-options">
                  <label className={`fw__export-option ${exportScope === 'all' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="scope" checked={exportScope === 'all'} onChange={() => setExportScope('all')} />
                    <div><strong>Full Point File</strong><span>All {sortedPoints.length} points from the entire survey</span></div>
                  </label>
                  <label className={`fw__export-option ${exportScope === 'timeline' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="scope" checked={exportScope === 'timeline'} onChange={() => setExportScope('timeline')} />
                    <div><strong>Timeline Selection</strong><span>{visiblePoints.length} points up to {timelineValue < 1 ? formatFullDateTime(new Date(cutoffTime).toISOString()) : 'current time'}</span></div>
                  </label>
                </div>
              </div>
              <div className="fw__popup-section">
                <h4>File Format</h4>
                <div className="fw__export-options">
                  <label className={`fw__export-option ${exportFormat === 'csv' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="format" checked={exportFormat === 'csv'} onChange={() => setExportFormat('csv')} />
                    <div><strong>CSV (Full Data)</strong><span>All fields including quality metrics and instruments</span></div>
                  </label>
                  <label className={`fw__export-option ${exportFormat === 'pnezd' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="format" checked={exportFormat === 'pnezd'} onChange={() => setExportFormat('pnezd')} />
                    <div><strong>PNEZD</strong><span>Standard point file for Trimble/CAD import</span></div>
                  </label>
                  <label className={`fw__export-option ${exportFormat === 'dxf' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="format" checked={exportFormat === 'dxf'} onChange={() => setExportFormat('dxf')} />
                    <div><strong>DXF (AutoCAD)</strong><span>Points and labels organized by code layers</span></div>
                  </label>
                  <label className={`fw__export-option ${exportFormat === 'kml' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="format" checked={exportFormat === 'kml'} onChange={() => setExportFormat('kml')} />
                    <div><strong>KML (Google Earth)</strong><span>Placemarks for map visualization</span></div>
                  </label>
                </div>
              </div>
              <div className="fw__popup-section">
                <h4>Save To</h4>
                <div className="fw__export-options">
                  <label className={`fw__export-option ${exportDest === 'local' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="dest" checked={exportDest === 'local'} onChange={() => setExportDest('local')} />
                    <div><strong>This Computer</strong><span>Download to your default downloads folder</span></div>
                  </label>
                  <label className={`fw__export-option ${exportDest === 'google' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="dest" checked={exportDest === 'google'} onChange={() => setExportDest('google')} />
                    <div><strong>Google Drive</strong><span>Download then upload to Google Drive</span></div>
                  </label>
                  <label className={`fw__export-option ${exportDest === 'usb' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="dest" checked={exportDest === 'usb'} onChange={() => setExportDest('usb')} />
                    <div><strong>USB / Thumb Drive</strong><span>Download then save to external drive</span></div>
                  </label>
                </div>
              </div>
              <div className="fw__export-actions">
                <button className="fw__btn" onClick={() => setShowExport(false)}>Cancel</button>
                <button className="fw__btn fw__btn--primary" onClick={handleExport}>
                  Export {exportScope === 'timeline' ? visiblePoints.length : sortedPoints.length} Points
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Point Detail Popup */}
      {detailPoint && (
        <div className="fw__popup-overlay" onClick={() => setDetailPoint(null)}>
          <div className="fw__popup fw__popup--detail" onClick={e => e.stopPropagation()}>
            <div className="fw__popup-header">
              <div>
                <h3>{detailPoint.point_name || 'Unnamed Point'}</h3>
                <span style={{ fontSize: '0.75rem', color: DATA_TYPE_COLORS[detailPoint.data_type], fontWeight: 600 }}>
                  {DATA_TYPE_LABELS[detailPoint.data_type] || detailPoint.data_type}
                  {detailPoint.raw_data?.code && ` — ${detailPoint.raw_data.code}`}
                  {detailPoint.raw_data?.code && POINT_CODE_CATEGORIES[detailPoint.raw_data.code] && (
                    <span style={{ fontWeight: 400, color: '#6B7280' }}> ({POINT_CODE_CATEGORIES[detailPoint.raw_data.code].label})</span>
                  )}
                </span>
              </div>
              <button className="fw__popup-close" onClick={() => setDetailPoint(null)}>x</button>
            </div>
            <div className="fw__popup-body">
              <div className="fw__popup-grid">
                <div className="fw__popup-field"><label>Collected</label><span>{formatFullDateTime(detailPoint.collected_at)}</span></div>
                <div className="fw__popup-field"><label>Collected By</label><span>{detailPoint.collected_by}</span></div>
                {detailPoint.instrument && <div className="fw__popup-field"><label>Instrument</label><span>{detailPoint.instrument}</span></div>}
                {detailPoint.raw_data?.code && <div className="fw__popup-field"><label>Point Code</label><span>{detailPoint.raw_data.code}</span></div>}
              </div>
              <div className="fw__popup-section">
                <h4>Coordinates</h4>
                <div className="fw__popup-grid fw__popup-grid--3">
                  <div className="fw__popup-field"><label>Northing</label><span className="fw__popup-mono">{detailPoint.northing?.toFixed(4) ?? '—'}</span></div>
                  <div className="fw__popup-field"><label>Easting</label><span className="fw__popup-mono">{detailPoint.easting?.toFixed(4) ?? '—'}</span></div>
                  <div className="fw__popup-field"><label>Elevation</label><span className="fw__popup-mono">{detailPoint.elevation?.toFixed(4) ?? '—'}</span></div>
                </div>
                {(detailPoint.raw_data?.coordinate_system || detailPoint.raw_data?.geoid_model) && (
                  <div className="fw__popup-grid" style={{ marginTop: '0.5rem' }}>
                    {detailPoint.raw_data?.coordinate_system && <div className="fw__popup-field"><label>Coord System</label><span>{detailPoint.raw_data.coordinate_system}</span></div>}
                    {detailPoint.raw_data?.geoid_model && <div className="fw__popup-field"><label>Geoid Model</label><span>{detailPoint.raw_data.geoid_model}</span></div>}
                  </div>
                )}
              </div>
              {detailPoint.raw_data && (detailPoint.raw_data.accuracy != null || detailPoint.raw_data.rtk_status) && (
                <div className="fw__popup-section">
                  <h4>Quality Metrics</h4>
                  <div className="fw__popup-grid">
                    {detailPoint.raw_data.accuracy != null && (
                      <div className="fw__popup-field"><label>Accuracy</label>
                        <span className={`fw-log__acc ${accClass(detailPoint.raw_data.accuracy)}`} style={{ display: 'inline-block' }}>{(detailPoint.raw_data.accuracy * 100).toFixed(2)} cm</span></div>
                    )}
                    {detailPoint.raw_data.rtk_status && (
                      <div className="fw__popup-field"><label>RTK Status</label>
                        <span className="fw-log__rtk" style={{ background: (RTK_LABELS[detailPoint.raw_data.rtk_status]?.color || '#6B7280') + '20', color: RTK_LABELS[detailPoint.raw_data.rtk_status]?.color, display: 'inline-block' }}>
                          {RTK_LABELS[detailPoint.raw_data.rtk_status]?.label || detailPoint.raw_data.rtk_status}</span></div>
                    )}
                    {detailPoint.raw_data.pdop != null && <div className="fw__popup-field"><label>PDOP</label><span>{detailPoint.raw_data.pdop.toFixed(2)}</span></div>}
                    {detailPoint.raw_data.hdop != null && <div className="fw__popup-field"><label>HDOP</label><span>{detailPoint.raw_data.hdop.toFixed(2)}</span></div>}
                    {detailPoint.raw_data.vdop != null && <div className="fw__popup-field"><label>VDOP</label><span>{detailPoint.raw_data.vdop.toFixed(2)}</span></div>}
                    {detailPoint.raw_data.satellites != null && <div className="fw__popup-field"><label>Satellites</label><span>{detailPoint.raw_data.satellites} tracked</span></div>}
                  </div>
                  {(detailPoint.raw_data.antenna_height != null || detailPoint.raw_data.prism_height != null || detailPoint.raw_data.base_station || detailPoint.raw_data.epoch_count != null) && (
                    <div className="fw__popup-grid" style={{ marginTop: '0.5rem' }}>
                      {detailPoint.raw_data.antenna_height != null && <div className="fw__popup-field"><label>Antenna Height</label><span>{detailPoint.raw_data.antenna_height.toFixed(3)}m</span></div>}
                      {detailPoint.raw_data.prism_height != null && <div className="fw__popup-field"><label>Prism Height</label><span>{detailPoint.raw_data.prism_height.toFixed(3)}m</span></div>}
                      {detailPoint.raw_data.base_station && <div className="fw__popup-field"><label>Base Station</label><span>{detailPoint.raw_data.base_station}</span></div>}
                      {detailPoint.raw_data.epoch_count != null && <div className="fw__popup-field"><label>Epochs</label><span>{detailPoint.raw_data.epoch_count}</span></div>}
                      {detailPoint.raw_data.measurement_method && <div className="fw__popup-field"><label>Method</label><span>{detailPoint.raw_data.measurement_method}</span></div>}
                    </div>
                  )}
                </div>
              )}
              {detailPoint.raw_data && detailPoint.raw_data.hz_angle != null && (
                <div className="fw__popup-section">
                  <h4>Observations (Total Station)</h4>
                  <div className="fw__popup-grid fw__popup-grid--3">
                    <div className="fw__popup-field"><label>Hz Angle</label><span className="fw__popup-mono">{detailPoint.raw_data.hz_angle.toFixed(4)}</span></div>
                    {detailPoint.raw_data.vt_angle != null && <div className="fw__popup-field"><label>Vt Angle</label><span className="fw__popup-mono">{detailPoint.raw_data.vt_angle.toFixed(4)}</span></div>}
                    {detailPoint.raw_data.slope_dist != null && <div className="fw__popup-field"><label>Slope Distance</label><span className="fw__popup-mono">{detailPoint.raw_data.slope_dist.toFixed(4)}</span></div>}
                  </div>
                </div>
              )}
              {detailPoint.description && (
                <div className="fw__popup-section"><h4>Description</h4><p>{detailPoint.description}</p></div>
              )}
              {detailPoint.raw_data?.notes && (
                <div className="fw__popup-section"><h4>Field Notes</h4><p className="fw__popup-note">{detailPoint.raw_data.notes}</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
