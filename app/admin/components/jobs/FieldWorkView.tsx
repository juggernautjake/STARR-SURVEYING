// app/admin/components/jobs/FieldWorkView.tsx — Live field work visualization
// Point map + point log + timeline slider + session markers + detail popup
// Export dialog + live equipment tracking + satellite toggle + demo data
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ─── Types ─── */
export interface FieldPoint {
  id: string;
  data_type: string;
  point_name?: string;
  northing?: number;
  easting?: number;
  elevation?: number;
  description?: string;
  raw_data?: {
    accuracy?: number;
    rtk_status?: string;
    pdop?: number;
    hdop?: number;
    vdop?: number;
    satellites?: number;
    code?: string;
    session_id?: string;
    hz_angle?: number;
    vt_angle?: number;
    slope_dist?: number;
    notes?: string;
  };
  collected_by: string;
  collected_at: string;
  instrument?: string;
}

interface SessionMarker {
  type: 'end' | 'start';
  time: number;
  label: string;
  dateLabel: string;
}

interface FieldWorkViewProps {
  jobId: string;
  points: FieldPoint[];
  onRefresh: () => void;
}

/* ─── Constants ─── */
const DATA_TYPE_COLORS: Record<string, string> = {
  point: '#1D3095',
  observation: '#7C3AED',
  measurement: '#0891B2',
  gps_position: '#059669',
  total_station: '#D97706',
  photo: '#EC4899',
  note: '#6B7280',
};

const DATA_TYPE_LABELS: Record<string, string> = {
  point: 'Point',
  observation: 'Observation',
  measurement: 'Measurement',
  gps_position: 'GPS',
  total_station: 'TS',
  photo: 'Photo',
  note: 'Note',
};

const RTK_LABELS: Record<string, { label: string; color: string }> = {
  fixed: { label: 'Fixed', color: '#059669' },
  float: { label: 'Float', color: '#D97706' },
  dgps: { label: 'DGPS', color: '#0891B2' },
  autonomous: { label: 'Auto', color: '#EF4444' },
  sbas: { label: 'SBAS', color: '#7C3AED' },
};

const SESSION_GAP_MS = 30 * 60 * 1000;

interface LabelToggles {
  name: boolean;
  code: boolean;
  elevation: boolean;
  accuracy: boolean;
  rtk: boolean;
  datetime: boolean;
  instrument: boolean;
  notes: boolean;
  coordinates: boolean;
  satellites: boolean;
}

const LABEL_NAMES: Record<keyof LabelToggles, string> = {
  name: 'Point Name',
  code: 'Point Code',
  elevation: 'Elevation',
  accuracy: 'Accuracy',
  rtk: 'RTK Status',
  datetime: 'Date/Time',
  instrument: 'Instrument',
  notes: 'Notes',
  coordinates: 'Coordinates',
  satellites: 'Satellites',
};

/* ─── Helpers ─── */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatFullDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ─── Demo Data Generator ─── */
function generateDemoSurvey(): FieldPoint[] {
  const pts: FieldPoint[] = [];
  const baseN = 10234567.0;
  const baseE = 3456789.0;
  const baseElev = 485.0;
  // Session 1: Morning — boundary traverse with GPS
  const session1Start = new Date('2026-02-06T08:15:00');
  const boundaryPts = [
    { name: 'CP-1', code: 'CP', desc: 'Control point - brass cap in concrete', dn: 0, de: 0, dEl: 0 },
    { name: 'CP-2', code: 'CP', desc: 'Control point - PK nail in curb', dn: 250.5, de: 180.3, dEl: 1.2 },
    { name: 'BND-1', code: 'IP', desc: 'Iron pin found - 1/2" rebar w/ cap', dn: 45.2, de: 30.1, dEl: 0.3 },
    { name: 'BND-2', code: 'IP', desc: 'Iron pin found - 5/8" rebar', dn: 120.8, de: 25.4, dEl: -0.8 },
    { name: 'BND-3', code: 'FND', desc: 'Found monument - TxDOT disk', dn: 185.3, de: 95.7, dEl: 2.1 },
    { name: 'BND-4', code: 'IP', desc: 'Iron pin set - 1/2" rebar w/ Starr cap', dn: 200.1, de: 210.5, dEl: 3.5 },
    { name: 'BND-5', code: 'IP', desc: 'Iron pin found - bent, disturbed', dn: 150.6, de: 275.2, dEl: 2.8 },
    { name: 'BND-6', code: 'FND', desc: 'Found fence corner post', dn: 80.4, de: 260.9, dEl: 1.9 },
    { name: 'BND-7', code: 'IP', desc: 'Iron pin set - 1/2" rebar w/ Starr cap', dn: 15.3, de: 190.8, dEl: 0.5 },
    { name: 'FNC-1', code: 'FNC', desc: 'Fence corner - T-post', dn: 82.1, de: 262.4, dEl: 1.95 },
    { name: 'FNC-2', code: 'FNC', desc: 'Fence line point', dn: 140.5, de: 268.0, dEl: 2.5 },
    { name: 'TREE-1', code: 'TREE', desc: 'Large oak tree - 24" DBH', dn: 100.2, de: 150.3, dEl: 1.1 },
    { name: 'UTIL-1', code: 'UTIL', desc: 'Electric meter on pole', dn: 60.8, de: 40.2, dEl: 0.6 },
    { name: 'UTIL-2', code: 'UTIL', desc: 'Water meter box', dn: 35.7, de: 55.1, dEl: 0.2 },
  ];

  boundaryPts.forEach((p, i) => {
    const t = new Date(session1Start.getTime() + i * 120000 + Math.random() * 30000);
    const rtks: Array<'fixed' | 'float'> = ['fixed', 'fixed', 'fixed', 'fixed', 'float'];
    const rtkStatus = rtks[Math.floor(Math.random() * rtks.length)];
    const accuracy = rtkStatus === 'fixed' ? 0.008 + Math.random() * 0.015 : 0.04 + Math.random() * 0.03;
    pts.push({
      id: `demo-s1-${i}`,
      data_type: i < 2 ? 'gps_position' : 'point',
      point_name: p.name,
      northing: baseN + p.dn,
      easting: baseE + p.de,
      elevation: baseElev + p.dEl,
      description: p.desc,
      raw_data: {
        code: p.code,
        rtk_status: rtkStatus,
        accuracy,
        pdop: 1.2 + Math.random() * 0.8,
        hdop: 0.7 + Math.random() * 0.5,
        vdop: 0.9 + Math.random() * 0.6,
        satellites: 14 + Math.floor(Math.random() * 8),
        notes: i === 4 ? 'TxDOT marker in good condition' : i === 6 ? 'Pin disturbed - may need to reset' : undefined,
      },
      collected_by: 'jake@starr-surveying.com',
      collected_at: t.toISOString(),
      instrument: 'Trimble R12i',
    });
  });

  // Session 2: Afternoon — total station detail shots (45 min gap = new session)
  const session2Start = new Date(session1Start.getTime() + 14 * 120000 + 50 * 60 * 1000);
  const detailPts = [
    { name: 'BLDG-1', code: 'BLDG', desc: 'Building corner - NW', dn: 90.0, de: 80.0, dEl: 0.8 },
    { name: 'BLDG-2', code: 'BLDG', desc: 'Building corner - NE', dn: 90.0, de: 130.0, dEl: 0.9 },
    { name: 'BLDG-3', code: 'BLDG', desc: 'Building corner - SE', dn: 55.0, de: 130.0, dEl: 0.7 },
    { name: 'BLDG-4', code: 'BLDG', desc: 'Building corner - SW', dn: 55.0, de: 80.0, dEl: 0.75 },
    { name: 'DW-1', code: 'DW', desc: 'Driveway edge - left', dn: 20.0, de: 95.0, dEl: 0.15 },
    { name: 'DW-2', code: 'DW', desc: 'Driveway edge - right', dn: 20.0, de: 115.0, dEl: 0.18 },
    { name: 'DW-3', code: 'DW', desc: 'Driveway at sidewalk', dn: 5.0, de: 105.0, dEl: 0.0 },
    { name: 'CL-1', code: 'CL', desc: 'Centerline road - begin', dn: -5.0, de: 50.0, dEl: -0.3 },
    { name: 'CL-2', code: 'CL', desc: 'Centerline road - mid', dn: -5.0, de: 150.0, dEl: -0.1 },
    { name: 'CL-3', code: 'CL', desc: 'Centerline road - end', dn: -5.0, de: 250.0, dEl: 0.2 },
    { name: 'TOPO-1', code: 'GS', desc: 'Ground shot - yard high point', dn: 110.0, de: 140.0, dEl: 1.5 },
    { name: 'TOPO-2', code: 'GS', desc: 'Ground shot - drainage swale', dn: 130.0, de: 180.0, dEl: -0.5 },
    { name: 'TOPO-3', code: 'GS', desc: 'Ground shot - low area', dn: 160.0, de: 200.0, dEl: -1.2 },
    { name: 'MH-1', code: 'MH', desc: 'Manhole - sanitary sewer', dn: 40.0, de: 160.0, dEl: 0.1 },
    { name: 'FH-1', code: 'FH', desc: 'Fire hydrant', dn: 10.0, de: 180.0, dEl: 0.05 },
  ];

  detailPts.forEach((p, i) => {
    const t = new Date(session2Start.getTime() + i * 90000 + Math.random() * 20000);
    const hzAngle = (45 + i * 22.5 + Math.random() * 2) % 360;
    pts.push({
      id: `demo-s2-${i}`,
      data_type: 'total_station',
      point_name: p.name,
      northing: baseN + p.dn,
      easting: baseE + p.de,
      elevation: baseElev + p.dEl,
      description: p.desc,
      raw_data: {
        code: p.code,
        accuracy: 0.003 + Math.random() * 0.005,
        hz_angle: hzAngle,
        vt_angle: 85 + Math.random() * 10,
        slope_dist: 20 + Math.random() * 150,
        notes: i === 13 ? 'Rim elev: 486.22, Inv IN: 481.50, Inv OUT: 481.30' : undefined,
      },
      collected_by: 'mike@starr-surveying.com',
      collected_at: t.toISOString(),
      instrument: 'Trimble S7',
    });
  });

  // Session 3: Next day morning (large gap)
  const session3Start = new Date('2026-02-07T07:45:00');
  const day2Pts = [
    { name: 'BND-8', code: 'IP', desc: 'Iron pin set - closing corner', dn: 5.0, de: 100.0, dEl: 0.1 },
    { name: 'EAS-1', code: 'EAS', desc: 'Easement line - begin', dn: 170.0, de: 50.0, dEl: 1.8 },
    { name: 'EAS-2', code: 'EAS', desc: 'Easement line - end', dn: 170.0, de: 200.0, dEl: 2.0 },
    { name: 'SIGN-1', code: 'SIGN', desc: 'Street sign - Elm St', dn: -8.0, de: 40.0, dEl: -0.4 },
    { name: 'PP-1', code: 'PP', desc: 'Power pole #47823', dn: 5.5, de: 230.0, dEl: 0.3 },
    { name: 'NOTE-1', code: 'NOTE', desc: 'Neighbor claims fence is on their side', dn: 82.0, de: 263.0, dEl: 1.95 },
  ];

  day2Pts.forEach((p, i) => {
    const t = new Date(session3Start.getTime() + i * 150000 + Math.random() * 30000);
    pts.push({
      id: `demo-s3-${i}`,
      data_type: i === 5 ? 'note' : 'gps_position',
      point_name: p.name,
      northing: baseN + p.dn,
      easting: baseE + p.de,
      elevation: baseElev + p.dEl,
      description: p.desc,
      raw_data: {
        code: p.code,
        rtk_status: 'fixed',
        accuracy: 0.006 + Math.random() * 0.012,
        pdop: 1.0 + Math.random() * 0.5,
        hdop: 0.6 + Math.random() * 0.3,
        vdop: 0.8 + Math.random() * 0.4,
        satellites: 18 + Math.floor(Math.random() * 6),
        notes: i === 5 ? 'Neighbor John Smith at 123 Elm St claims fence was moved in 2019' : undefined,
      },
      collected_by: 'jake@starr-surveying.com',
      collected_at: t.toISOString(),
      instrument: 'Trimble R12i',
    });
  });

  return pts;
}

/* ─── Export helpers ─── */
function buildPointFileContent(pts: FieldPoint[], format: 'csv' | 'pnezd'): string {
  if (format === 'pnezd') {
    return pts
      .filter(p => p.northing != null && p.easting != null)
      .map(p => `${p.point_name || ''},${p.northing?.toFixed(4)},${p.easting?.toFixed(4)},${p.elevation?.toFixed(4) || ''},${p.description || ''}`)
      .join('\n');
  }
  const header = 'Point Name,Northing,Easting,Elevation,Code,Description,Type,Accuracy (cm),RTK,Instrument,Collected By,Collected At';
  const rows = pts.map(p =>
    [
      p.point_name || '',
      p.northing?.toFixed(4) || '',
      p.easting?.toFixed(4) || '',
      p.elevation?.toFixed(4) || '',
      p.raw_data?.code || '',
      `"${(p.description || '').replace(/"/g, '""')}"`,
      p.data_type,
      p.raw_data?.accuracy != null ? (p.raw_data.accuracy * 100).toFixed(2) : '',
      p.raw_data?.rtk_status || '',
      p.instrument || '',
      p.collected_by,
      p.collected_at,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function FieldWorkView({ jobId, points: propPoints, onRefresh }: FieldWorkViewProps) {
  const [useDemoData, setUseDemoData] = useState(false);
  const demoPoints = useMemo(() => generateDemoSurvey(), []);
  const points = useDemoData ? demoPoints : propPoints;

  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [detailPoint, setDetailPoint] = useState<FieldPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineValue, setTimelineValue] = useState(1);

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
  const [exportScope, setExportScope] = useState<'all' | 'timeline'>('all');
  const [exportFormat, setExportFormat] = useState<'csv' | 'pnezd'>('csv');
  const [exportDest, setExportDest] = useState('local');
  const [equipmentPulse, setEquipmentPulse] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<SVGSVGElement>(null);

  const activeExtraLabels = useMemo(() => {
    const keys: Array<keyof LabelToggles> = ['code', 'elevation', 'accuracy', 'rtk', 'datetime', 'instrument', 'notes', 'coordinates', 'satellites'];
    return keys.filter(k => showLabels[k]).length;
  }, [showLabels]);

  const sortedPoints = useMemo(() =>
    [...points].sort((a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime()),
    [points]
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
    if (!searchQuery.trim()) return visiblePoints;
    const q = searchQuery.toLowerCase();
    return visiblePoints.filter(p =>
      (p.point_name && p.point_name.toLowerCase().includes(q)) ||
      (p.raw_data?.code && p.raw_data.code.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.data_type && p.data_type.toLowerCase().includes(q)) ||
      (p.collected_by && p.collected_by.toLowerCase().includes(q)) ||
      (p.instrument && p.instrument.toLowerCase().includes(q))
    );
  }, [visiblePoints, searchQuery]);

  const logPoints = useMemo(() => [...filteredPoints].reverse(), [filteredPoints]);

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
    const content = buildPointFileContent(exportPts, exportFormat);
    const ext = exportFormat === 'pnezd' ? 'txt' : 'csv';
    const scopeLabel = exportScope === 'timeline' ? `_timeline_${visiblePoints.length}pts` : `_full_${sortedPoints.length}pts`;
    const filename = `survey_${jobId}${scopeLabel}.${ext}`;

    if (exportDest === 'local') {
      downloadFile(content, filename);
    } else {
      downloadFile(content, filename);
      alert(`File "${filename}" downloaded. To save to ${exportDest === 'google' ? 'Google Drive' : exportDest === 'usb' ? 'USB drive' : 'cloud storage'}, upload the downloaded file there.`);
    }
    setShowExport(false);
  }

  const stats = useMemo(() => {
    const uniqueTypes = new Set<string>(visiblePoints.map(p => p.data_type));
    const fixedCount = visiblePoints.filter(p => p.raw_data?.rtk_status === 'fixed').length;
    const avgAcc = visiblePoints.filter(p => p.raw_data?.accuracy != null);
    const avgAccVal = avgAcc.length > 0 ? avgAcc.reduce((s, p) => s + p.raw_data!.accuracy!, 0) / avgAcc.length : 0;
    const instruments = new Set<string>(visiblePoints.filter(p => p.instrument).map(p => p.instrument!));
    return { uniqueTypes: uniqueTypes.size, fixedCount, avgAccCm: avgAccVal * 100, instruments: [...instruments] };
  }, [visiblePoints]);

  return (
    <div className="fw">
      {/* Controls bar */}
      <div className="fw__controls">
        <div className="fw__controls-left">
          <h3 className="fw__title">Field Data ({points.length} points)</h3>
          <label className="fw__poll-toggle">
            <input type="checkbox" checked={pollEnabled} onChange={e => setPollEnabled(e.target.checked)} />
            Live Mode
          </label>
          {pollEnabled && <span className="fw__live-dot" title="Live — polling every 5s" />}
        </div>
        <div className="fw__controls-right">
          {propPoints.length === 0 && (
            <button className={`fw__btn ${useDemoData ? 'fw__btn--active' : ''}`} onClick={() => setUseDemoData(!useDemoData)}>
              {useDemoData ? 'Hide Demo' : 'Load Demo'}
            </button>
          )}
          <button className="fw__btn" onClick={onRefresh}>Refresh</button>
          <button className="fw__btn" onClick={resetMapView}>Reset View</button>
          <button className="fw__btn fw__btn--primary" onClick={() => setShowExport(true)} disabled={points.length === 0}>
            Export
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {points.length > 0 && (
        <div className="fw__stats">
          <div className="fw__stat"><span className="fw__stat-val">{visiblePoints.length}</span><span className="fw__stat-lbl">Visible Pts</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{stats.uniqueTypes}</span><span className="fw__stat-lbl">Types</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{stats.fixedCount}</span><span className="fw__stat-lbl">Fixed RTK</span></div>
          {stats.avgAccCm > 0 && <div className="fw__stat"><span className="fw__stat-val">{stats.avgAccCm.toFixed(1)}cm</span><span className="fw__stat-lbl">Avg Accuracy</span></div>}
          <div className="fw__stat"><span className="fw__stat-val">{stats.instruments.join(', ') || '—'}</span><span className="fw__stat-lbl">Instruments</span></div>
          <div className="fw__stat"><span className="fw__stat-val">{sessionMarkers.length / 2 + 1}</span><span className="fw__stat-lbl">Sessions</span></div>
        </div>
      )}

      {/* Label toggles + satellite toggle */}
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

      {/* Main layout */}
      <div className="fw__layout">
        {/* Left: Map */}
        <div className="fw__map-container">
          {mappablePoints.length === 0 ? (
            <div className="fw__map-empty">
              <span className="fw__map-empty-icon">📡</span>
              <p>No coordinate data yet</p>
              <p className="fw__map-empty-sub">Points will appear on the map as field crew collects data</p>
              {propPoints.length === 0 && !useDemoData && (
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
                    <div><strong>CSV (Full Data)</strong><span>All fields including quality metrics, instrument, collector</span></div>
                  </label>
                  <label className={`fw__export-option ${exportFormat === 'pnezd' ? 'fw__export-option--active' : ''}`}>
                    <input type="radio" name="format" checked={exportFormat === 'pnezd'} onChange={() => setExportFormat('pnezd')} />
                    <div><strong>PNEZD (Point File)</strong><span>Point Name, Northing, Easting, Elevation, Description — for CAD import</span></div>
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
