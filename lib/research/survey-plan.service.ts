// lib/research/survey-plan.service.ts — AI-Powered Field Survey Plan Generator
//
// Generates a comprehensive, plain-English field survey plan from all available
// property data: deed calls, plat records, FEMA flood zone, TxDOT ROW, adjoiner
// data, discrepancies, and source document links.
//
// The plan is suitable for a licensed surveyor to use when planning and executing
// a boundary survey in the field.  It is also written at a level that a non-surveyor
// client can understand.

import { supabaseAdmin } from '@/lib/supabase';
import { callAI } from './ai-client';
import type { ExtractedDataPoint, Discrepancy, ResearchDocument } from '@/types/research';
import { formatBearing, formatDistance } from './normalization';
import type { NormalizedBearing, NormalizedDistance } from './normalization';

// ── Public types ──────────────────────────────────────────────────────────────

export interface SurveyPlanItem {
  priority?: 'critical' | 'important' | 'nice_to_have';
  done: boolean;
  task: string;
  why?: string;
}

export interface SurveyPlanStep {
  step: number;
  phase: string;
  title: string;
  plain_english: string;
  technical_notes?: string;
  estimated_time?: string;
}

export interface MonumentRecoveryItem {
  location: string;
  type: string;
  search_method: string;
  found_action: string;
  not_found_action: string;
}

export interface DiscrepancyToInvestigate {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  field_action: string;
}

export interface SpecialConsideration {
  category: string;
  description: string;
}

export interface DataSourceUsed {
  source: string;
  url?: string;
  data_obtained: string;
}

export interface SurveyPlan {
  property_summary: string;
  key_facts: Array<{ label: string; value: string }>;
  pre_field_research: {
    title: string;
    description: string;
    items: SurveyPlanItem[];
  };
  equipment_checklist: {
    title: string;
    items: Array<{ category: string; items: string[] }>;
  };
  field_procedures: SurveyPlanStep[];
  monument_recovery: {
    title: string;
    description: string;
    monuments: MonumentRecoveryItem[];
  };
  boundary_reconstruction: {
    title: string;
    description: string;
    method: string;
    explanation: string;
    priority_evidence: string[];
    potential_conflicts: Array<{ description: string; recommendation: string }>;
  };
  data_sources_used: DataSourceUsed[];
  discrepancies_to_investigate: DiscrepancyToInvestigate[];
  special_considerations: SpecialConsideration[];
  office_to_field_sequence: Array<{ day: string; tasks: string[] }>;
  closure_check: {
    calculated_closure_error: string;
    closure_ratio: string;
    acceptable: boolean;
    note: string;
  } | null;
  confidence_level: number;
  confidence_notes: string;
  next_steps: string[];
  generated_at: string;
}

// ── Helper: build context string for AI ──────────────────────────────────────

function buildPropertyContext(
  project: { property_address?: string | null; county?: string | null; state?: string | null; name?: string | null },
  dataPoints: ExtractedDataPoint[],
  discrepancies: Discrepancy[],
  documents: ResearchDocument[],
): string {
  const lines: string[] = [];

  lines.push('=== PROPERTY ===');
  if (project.property_address) lines.push(`Address: ${project.property_address}`);
  if (project.county) lines.push(`County: ${project.county}, ${project.state || 'TX'}`);
  if (project.name) lines.push(`Project: ${project.name}`);

  // Owner & legal
  const ownerDP = dataPoints.find(dp => dp.data_category === 'annotation' && dp.raw_value?.toLowerCase().includes('owner'));
  const legalDP = dataPoints.find(dp => dp.data_category === 'legal_description');
  const lotBlockDP = dataPoints.find(dp => dp.data_category === 'lot_block');
  const areaDP = dataPoints.find(dp => dp.data_category === 'area');
  const floodDP = dataPoints.find(dp => dp.data_category === 'flood_zone');
  const zoneDP = dataPoints.find(dp => dp.data_category === 'zoning');

  if (ownerDP) lines.push(`Owner: ${ownerDP.raw_value}`);
  if (legalDP) lines.push(`Legal Description: ${legalDP.raw_value}`);
  if (lotBlockDP) lines.push(`Lot/Block/Sub: ${lotBlockDP.raw_value}`);
  if (areaDP) lines.push(`Area: ${areaDP.display_value || areaDP.raw_value}`);
  if (floodDP) lines.push(`Flood Zone: ${floodDP.raw_value}`);
  if (zoneDP) lines.push(`Zoning: ${zoneDP.raw_value}`);

  // Boundary calls
  const callDPs = dataPoints
    .filter(dp => dp.data_category === 'call')
    .sort((a, b) => (a.sequence_order ?? 999) - (b.sequence_order ?? 999));

  if (callDPs.length > 0) {
    lines.push('\n=== BOUNDARY CALLS (deed/plat) ===');
    lines.push(`Total calls: ${callDPs.length}`);
    callDPs.slice(0, 20).forEach((dp, i) => {
      const nv = dp.normalized_value as Record<string, unknown> | null;
      let desc = dp.display_value || dp.raw_value;
      if (nv?.bearing && nv?.distance) {
        const bearingStr = formatBearing(nv.bearing as NormalizedBearing);
        const distStr = formatDistance(nv.distance as NormalizedDistance);
        desc = `${bearingStr}, ${distStr}`;
        if (nv.monument_at_end) desc += ` to ${nv.monument_at_end}`;
      }
      lines.push(`  Call ${i + 1}: ${desc}`);
    });
    if (callDPs.length > 20) lines.push(`  ... and ${callDPs.length - 20} more calls`);
  }

  // Monuments
  const monDPs = dataPoints.filter(dp => dp.data_category === 'monument');
  if (monDPs.length > 0) {
    lines.push(`\n=== MONUMENTS (${monDPs.length} found in records) ===`);
    monDPs.slice(0, 10).forEach(dp => lines.push(`  - ${dp.display_value || dp.raw_value}`));
  }

  // Easements
  const easDPs = dataPoints.filter(dp => dp.data_category === 'easement');
  if (easDPs.length > 0) {
    lines.push(`\n=== EASEMENTS ===`);
    easDPs.forEach(dp => lines.push(`  - ${dp.display_value || dp.raw_value}`));
  }

  // ROW / setbacks
  const rowDPs = dataPoints.filter(dp => dp.data_category === 'right_of_way');
  const setbackDPs = dataPoints.filter(dp => dp.data_category === 'setback');
  if (rowDPs.length > 0) {
    lines.push(`\n=== RIGHT OF WAY ===`);
    rowDPs.forEach(dp => lines.push(`  - ${dp.display_value || dp.raw_value}`));
  }
  if (setbackDPs.length > 0) {
    lines.push(`\n=== SETBACKS ===`);
    setbackDPs.forEach(dp => lines.push(`  - ${dp.display_value || dp.raw_value}`));
  }

  // Recording references
  const recDPs = dataPoints.filter(dp => dp.data_category === 'recording_reference');
  if (recDPs.length > 0) {
    lines.push(`\n=== RECORDING REFERENCES ===`);
    recDPs.forEach(dp => lines.push(`  - ${dp.display_value || dp.raw_value}`));
  }

  // Adjoiner info
  const adjDPs = dataPoints.filter(dp => dp.data_category === 'adjoiner');
  if (adjDPs.length > 0) {
    lines.push(`\n=== ADJOINERS ===`);
    adjDPs.forEach(dp => lines.push(`  - ${dp.display_value || dp.raw_value}`));
  }

  // Discrepancies
  if (discrepancies.length > 0) {
    lines.push(`\n=== DISCREPANCIES (${discrepancies.length} found) ===`);
    discrepancies.slice(0, 10).forEach(d => {
      lines.push(`  [${d.severity?.toUpperCase() || 'UNKNOWN'}] ${d.title}: ${d.description}`);
    });
  }

  // Documents used as source
  if (documents.length > 0) {
    lines.push(`\n=== SOURCE DOCUMENTS (${documents.length} total) ===`);
    documents.slice(0, 15).forEach(doc => {
      const label = doc.document_label || doc.original_filename || doc.document_type || 'Unknown';
      const url = doc.source_url ? ` — ${doc.source_url}` : '';
      lines.push(`  - ${label}${url}`);
    });
  }

  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate or retrieve a cached survey field plan for a research project.
 * The plan is generated fresh each time (no DB caching) because the
 * underlying data changes as analysis progresses.
 */
export async function generateSurveyPlan(projectId: string): Promise<SurveyPlan> {
  // Load all project data in parallel
  const [projectRes, dataPointsRes, discrepanciesRes, documentsRes] = await Promise.all([
    supabaseAdmin.from('research_projects').select('*').eq('id', projectId).single(),
    supabaseAdmin
      .from('extracted_data_points')
      .select('*')
      .eq('research_project_id', projectId)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('discrepancies').select('*').eq('research_project_id', projectId),
    supabaseAdmin
      .from('research_documents')
      .select('id, document_type, document_label, original_filename, source_url, source_type')
      .eq('research_project_id', projectId),
  ]);

  if (projectRes.error || !projectRes.data) {
    throw new Error('Project not found');
  }

  const project = projectRes.data as {
    property_address?: string | null;
    county?: string | null;
    state?: string | null;
    name?: string | null;
  };
  const dataPoints: ExtractedDataPoint[] = dataPointsRes.data || [];
  const discrepancies: Discrepancy[] = discrepanciesRes.data || [];
  const documents = (documentsRes.data || []) as ResearchDocument[];

  // Build the context string fed to the AI
  const context = buildPropertyContext(project, dataPoints, discrepancies, documents);

  // If there is very little data, return a minimal "placeholder" plan immediately
  // rather than burning AI tokens on an empty project.
  if (dataPoints.length === 0 && documents.length === 0) {
    return buildEmptyPlan(project, discrepancies);
  }

  // Call AI to generate the full plan
  const aiResult = await callAI({
    promptKey: 'SURVEY_PLAN_GENERATOR',
    userContent: `Generate a comprehensive field survey plan for this property. Use all the data below:\n\n${context}`,
    maxTokens: 4096,
    maxRetries: 2,
    timeoutMs: 90_000,
  });

  const raw = aiResult.response as Partial<SurveyPlan>;
  return normalizePlan(raw, project, documents, discrepancies);
}

// ── Fallback plan for empty projects ─────────────────────────────────────────

function buildEmptyPlan(
  project: { property_address?: string | null; county?: string | null; state?: string | null; name?: string | null },
  discrepancies: Discrepancy[],
): SurveyPlan {
  const county = project.county || 'the county';
  const address = project.property_address || 'the subject property';

  return {
    property_summary: `This research project covers ${address} in ${county}. No documents have been analyzed yet. Run a property search and analysis to generate a detailed plan.`,
    key_facts: [
      { label: 'Address', value: address },
      { label: 'County', value: county },
      { label: 'Status', value: 'Research not yet started — run Property Search first' },
    ],
    pre_field_research: {
      title: 'Before You Go: Office Research Checklist',
      description: 'Complete these steps before driving to the property.',
      items: [
        { priority: 'critical', done: false, task: `Obtain a certified copy of the current deed from ${county} County Clerk.`, why: 'The deed contains the metes-and-bounds legal description, which defines the boundary.' },
        { priority: 'critical', done: false, task: `Search ${county} CAD for the parcel ID and appraisal record.`, why: 'The appraisal record gives you the parcel ID, owner name, acreage, and a link to the deed of record.' },
        { priority: 'critical', done: false, task: 'Run a FEMA flood zone determination using the address.', why: 'You need to know if any part of the property is in a special flood hazard area before fieldwork.' },
        { priority: 'important', done: false, task: `Search ${county} County Clerk plat records for any recorded subdivision plat.`, why: 'If the property is in a platted subdivision, the plat shows the original lot dimensions and monument locations.' },
        { priority: 'important', done: false, task: 'Check TxDOT for any right-of-way adjacent to the property.', why: 'TxDOT ROW limits affect the boundary on any side adjacent to a state highway or farm-to-market road.' },
      ],
    },
    equipment_checklist: {
      title: 'Equipment & Supplies',
      items: [
        { category: 'Instruments', items: ['Total station (2″ or better accuracy)', 'Data collector with current software', 'RTK GPS receiver (recommended)', 'Backup 30m steel tape'] },
        { category: 'Monuments', items: ['1/2″ × 18″ iron rods (bring at least 12)', 'Aluminum caps stamped with your RPLS number', 'Flagging tape (multiple colors)'] },
        { category: 'Safety', items: ['Safety vest (required near roads)', 'Traffic cones (if working near road)', 'First aid kit'] },
        { category: 'Documents', items: ['Printed deed with legal description', 'County parcel map printout', 'FEMA FIRM panel printout', 'Field notes pad'] },
      ],
    },
    field_procedures: [
      { step: 1, phase: 'Setup & Control', title: 'Establish Survey Control', plain_english: 'Set up your total station at a known point, or use RTK GPS to get your starting coordinates tied to the Texas State Plane Coordinate System.', technical_notes: 'Use NGS control monuments or RTK GPS. Minimum 2 check shots before proceeding. Document backsight.', estimated_time: '30–45 min' },
      { step: 2, phase: 'Monument Search', title: 'Search for Existing Corners', plain_english: 'Walk the boundary and look for the iron rods or other monuments called out in the deed. Use a magnetic locator to find buried iron. Flag everything you find before measuring.', technical_notes: 'Search 2-foot radius around calculated corner positions. Document condition of each monument found.', estimated_time: '1–3 hours depending on property size' },
      { step: 3, phase: 'Boundary Survey', title: 'Shoot the Boundary', plain_english: 'Measure from corner to corner following the deed calls. Record every shot. Set new iron rods at any corners where none were found.', technical_notes: 'Occupy each recovered monument. Compute closure before leaving the field.', estimated_time: '2–4 hours depending on property size' },
      { step: 4, phase: 'Improvements', title: 'Locate Improvements', plain_english: 'Shoot the corners of any buildings, fences, driveways, and utilities on or near the property line.', technical_notes: 'Locate fences to both sides of property line. Note encroachments.', estimated_time: '1–2 hours' },
    ],
    monument_recovery: {
      title: 'Monument Search Strategy',
      description: 'General guidance for monument recovery. Specific monument locations will be shown after deed analysis.',
      monuments: [
        { location: 'All deed corners', type: '1/2″ iron rod (typical Texas standard)', search_method: 'Calculate position from deed calls. Search 1–2 foot radius. Use magnetic locator for buried iron.', found_action: 'Record coordinates and condition. Photograph with north arrow and scale.', not_found_action: 'Set new 1/2″ iron rod with aluminum cap stamped with your RPLS number. Note as "set" in field book.' },
      ],
    },
    boundary_reconstruction: {
      title: 'Boundary Reconstruction Approach',
      description: 'General approach for boundary reconstruction. Will be refined after deed analysis.',
      method: 'Record',
      explanation: 'Follow deed calls as written unless recovered monuments prove otherwise. Texas law gives priority to monuments over calls where they conflict.',
      priority_evidence: ['Recovered monuments (highest priority)', 'Adjoiner agreements', 'Deed calls', 'Calculated positions'],
      potential_conflicts: [],
    },
    data_sources_used: [],
    discrepancies_to_investigate: discrepancies.map(d => ({
      severity: (d.severity as 'critical' | 'high' | 'medium' | 'low') || 'medium',
      description: `${d.title}: ${d.description}`,
      field_action: d.resolution_notes || 'Measure and verify in field. Document findings.',
    })),
    special_considerations: [
      { category: 'Getting Started', description: 'Run a property search from this project\'s Research tab to automatically gather county records, FEMA flood data, and TxDOT information. Then run the AI analysis to extract deed calls and generate a detailed plan.' },
    ],
    office_to_field_sequence: [
      { day: 'Day 1 (Office)', tasks: ['Complete pre-field research checklist above', 'Obtain certified deed copy', 'Search for existing plats', 'Calculate deed calls and check closure', 'Identify control monuments near the property'] },
      { day: 'Day 2 (Field)', tasks: ['Set up instrument at control point', 'Search for and recover deed corner monuments', 'Shoot all improvements, fences, utilities', 'Set any missing corner monuments', 'Compute closure before leaving'] },
      { day: 'Day 3 (Office)', tasks: ['Reduce field data and adjust closure', 'Resolve any discrepancies', 'Draft survey plat', 'Write surveyor\'s notes and certification', 'Deliver to client'] },
    ],
    closure_check: null,
    confidence_level: 10,
    confidence_notes: 'No documents have been analyzed yet. Run Property Search and Analysis to generate a high-confidence plan.',
    next_steps: [
      'Click "Property Search" and enter the property address to gather county records',
      'Import the search results and run AI Analysis',
      'Return to this Survey Plan tab for a fully detailed plan',
      'Set ANTHROPIC_API_KEY environment variable to enable AI analysis',
    ],
    generated_at: new Date().toISOString(),
  };
}

// ── Normalize & validate AI response ─────────────────────────────────────────

function normalizePlan(
  raw: Partial<SurveyPlan>,
  project: { property_address?: string | null; county?: string | null; state?: string | null; name?: string | null },
  documents: ResearchDocument[],
  discrepancies: Discrepancy[],
): SurveyPlan {
  // Build data sources from documents if the AI didn't provide them
  const dataSources: DataSourceUsed[] = raw.data_sources_used && raw.data_sources_used.length > 0
    ? raw.data_sources_used
    : documents
        .filter(doc => doc.source_url)
        .slice(0, 10)
        .map(doc => ({
          source: doc.document_label || doc.original_filename || doc.document_type || 'Document',
          url: doc.source_url || undefined,
          data_obtained: doc.document_type || 'Property record',
        }));

  return {
    property_summary: raw.property_summary || `Research project for ${project.property_address || 'the subject property'} in ${project.county || 'Texas'}.`,
    key_facts: raw.key_facts || [
      { label: 'Address', value: project.property_address || '—' },
      { label: 'County', value: `${project.county || '—'}, ${project.state || 'TX'}` },
    ],
    pre_field_research: raw.pre_field_research || {
      title: 'Before You Go: Office Research Checklist',
      description: 'Complete these steps before driving to the property.',
      items: [],
    },
    equipment_checklist: raw.equipment_checklist || {
      title: 'Equipment & Supplies',
      items: [],
    },
    field_procedures: raw.field_procedures || [],
    monument_recovery: raw.monument_recovery || {
      title: 'Monument Search Strategy',
      description: 'Search for monuments at calculated positions from deed calls.',
      monuments: [],
    },
    boundary_reconstruction: raw.boundary_reconstruction || {
      title: 'Boundary Reconstruction Approach',
      description: 'Follow deed calls as written.',
      method: 'Record',
      explanation: 'Use deed calls and recovered monuments to reconstruct the boundary.',
      priority_evidence: [],
      potential_conflicts: [],
    },
    data_sources_used: dataSources,
    discrepancies_to_investigate: raw.discrepancies_to_investigate || discrepancies.map(d => ({
      severity: (d.severity as 'critical' | 'high' | 'medium' | 'low') || 'medium',
      description: `${d.title}: ${d.description}`,
      field_action: d.resolution_notes || 'Measure and verify in field.',
    })),
    special_considerations: raw.special_considerations || [],
    office_to_field_sequence: raw.office_to_field_sequence || [],
    closure_check: raw.closure_check || null,
    confidence_level: typeof raw.confidence_level === 'number' ? raw.confidence_level : 50,
    confidence_notes: raw.confidence_notes || 'Plan generated from available data.',
    next_steps: raw.next_steps || [],
    generated_at: new Date().toISOString(),
  };
}
