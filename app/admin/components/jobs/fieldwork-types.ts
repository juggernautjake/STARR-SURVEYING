// app/admin/components/jobs/fieldwork-types.ts — Shared types, constants, and format helpers for FieldWorkView

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
    prism_height?: number;
    antenna_height?: number;
    measurement_method?: string;
    epoch_count?: number;
    base_station?: string;
    geoid_model?: string;
    coordinate_system?: string;
  };
  collected_by: string;
  collected_at: string;
  instrument?: string;
}

export interface SessionMarker {
  type: 'end' | 'start';
  time: number;
  label: string;
  dateLabel: string;
}

export interface LabelToggles {
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

/** Job context passed to FieldWorkView for the header bar */
export interface JobContext {
  jobNumber: string;
  jobName: string;
  stage: string;
  surveyType: string;
  clientName?: string;
  address?: string;
  city?: string;
  state?: string;
  county?: string;
  acreage?: number;
  deadline?: string;
  createdAt: string;
  team: CrewMember[];
  totalHours: number;
}

/** Crew member / team member on a job */
export interface CrewMember {
  id: string;
  user_email: string;
  user_name?: string;
  role: string;
  assigned_at: string;
  notes?: string;
}

/** Derived crew activity stats (computed from field data) */
export interface CrewActivity {
  email: string;
  name: string;
  pointCount: number;
  firstPoint: string;
  lastPoint: string;
  instruments: string[];
  avgAccuracy: number | null;
  fixedCount: number;
  isActive: boolean; // collected within last 15 minutes
}

/* ─── Constants ─── */
export const DATA_TYPE_COLORS: Record<string, string> = {
  point: '#1D3095',
  observation: '#7C3AED',
  measurement: '#0891B2',
  gps_position: '#059669',
  total_station: '#D97706',
  photo: '#EC4899',
  note: '#6B7280',
};

export const DATA_TYPE_LABELS: Record<string, string> = {
  point: 'Point',
  observation: 'Observation',
  measurement: 'Measurement',
  gps_position: 'GPS',
  total_station: 'TS',
  photo: 'Photo',
  note: 'Note',
};

export const RTK_LABELS: Record<string, { label: string; color: string }> = {
  fixed: { label: 'Fixed', color: '#059669' },
  float: { label: 'Float', color: '#D97706' },
  dgps: { label: 'DGPS', color: '#0891B2' },
  autonomous: { label: 'Auto', color: '#EF4444' },
  sbas: { label: 'SBAS', color: '#7C3AED' },
};

export const SESSION_GAP_MS = 30 * 60 * 1000;

export const LABEL_NAMES: Record<keyof LabelToggles, string> = {
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

/** Survey type display names */
export const SURVEY_TYPE_LABELS: Record<string, string> = {
  boundary: 'Boundary Survey',
  topographic: 'Topographic Survey',
  alta: 'ALTA/NSPS Survey',
  construction: 'Construction Staking',
  subdivision: 'Subdivision Plat',
  elevation: 'Elevation Certificate',
  route: 'Route Survey',
  hydrographic: 'Hydrographic Survey',
  as_built: 'As-Built Survey',
  geodetic: 'Geodetic Survey',
  control: 'Control Survey',
  other: 'Other',
};

/** Stage configuration for display */
export const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  quote: { label: 'Quote', color: '#6B7280' },
  proposal: { label: 'Proposal', color: '#7C3AED' },
  research: { label: 'Research', color: '#0891B2' },
  fieldwork: { label: 'Field Work', color: '#D97706' },
  drafting: { label: 'Drafting', color: '#1D3095' },
  review: { label: 'Review', color: '#059669' },
  delivered: { label: 'Delivered', color: '#16A34A' },
  closed: { label: 'Closed', color: '#374151' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
};

/** Supported point code categories for Trimble/AutoCAD */
export const POINT_CODE_CATEGORIES: Record<string, { label: string; color: string }> = {
  CP: { label: 'Control Point', color: '#DC2626' },
  IP: { label: 'Iron Pin', color: '#1D3095' },
  FND: { label: 'Found Monument', color: '#7C3AED' },
  SET: { label: 'Set Monument', color: '#059669' },
  FNC: { label: 'Fence', color: '#92400E' },
  BLDG: { label: 'Building', color: '#374151' },
  TREE: { label: 'Tree', color: '#16A34A' },
  UTIL: { label: 'Utility', color: '#D97706' },
  CL: { label: 'Centerline', color: '#0891B2' },
  EAS: { label: 'Easement', color: '#7C3AED' },
  DW: { label: 'Driveway', color: '#6B7280' },
  GS: { label: 'Ground Shot', color: '#9CA3AF' },
  MH: { label: 'Manhole', color: '#374151' },
  FH: { label: 'Fire Hydrant', color: '#EF4444' },
  PP: { label: 'Power Pole', color: '#D97706' },
  SIGN: { label: 'Sign', color: '#0891B2' },
  TOPO: { label: 'Topo Shot', color: '#9CA3AF' },
  NOTE: { label: 'Note', color: '#6B7280' },
};

/* ─── Format Helpers ─── */
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function formatFullDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Format elapsed hours from ms */
export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/** Format elapsed time as "X days Y hours" */
export function formatDurationLong(ms: number): string {
  const totalHours = Math.floor(ms / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${days} day${days !== 1 ? 's' : ''}, ${hours}h`;
}

/** Derive crew activity stats from field points */
export function deriveCrewActivity(points: FieldPoint[], teamMembers: CrewMember[]): CrewActivity[] {
  const byEmail = new Map<string, { pts: FieldPoint[]; name: string }>();

  // Seed from team members so we show everyone even if they haven't collected points
  for (const tm of teamMembers) {
    if (!byEmail.has(tm.user_email)) {
      byEmail.set(tm.user_email, { pts: [], name: tm.user_name || tm.user_email.split('@')[0] });
    }
  }

  // Group points by collector
  for (const pt of points) {
    const existing = byEmail.get(pt.collected_by);
    if (existing) {
      existing.pts.push(pt);
    } else {
      byEmail.set(pt.collected_by, { pts: [pt], name: pt.collected_by.split('@')[0] });
    }
  }

  const now = Date.now();
  const fifteenMin = 15 * 60 * 1000;
  const activities: CrewActivity[] = [];

  byEmail.forEach((data, email) => {
    const sorted = [...data.pts].sort((a, b) => new Date(a.collected_at).getTime() - new Date(b.collected_at).getTime());
    const instruments = new Set<string>();
    let totalAcc = 0;
    let accCount = 0;
    let fixedCount = 0;

    for (const p of sorted) {
      if (p.instrument) instruments.add(p.instrument);
      if (p.raw_data?.accuracy != null) { totalAcc += p.raw_data.accuracy; accCount++; }
      if (p.raw_data?.rtk_status === 'fixed') fixedCount++;
    }

    const lastTime = sorted.length > 0 ? new Date(sorted[sorted.length - 1].collected_at).getTime() : 0;

    activities.push({
      email,
      name: data.name,
      pointCount: sorted.length,
      firstPoint: sorted.length > 0 ? sorted[0].collected_at : '',
      lastPoint: sorted.length > 0 ? sorted[sorted.length - 1].collected_at : '',
      instruments: [...instruments],
      avgAccuracy: accCount > 0 ? totalAcc / accCount : null,
      fixedCount,
      isActive: lastTime > 0 && (now - lastTime) < fifteenMin,
    });
  });

  // Sort: active first, then by point count
  activities.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.pointCount - a.pointCount;
  });

  return activities;
}
