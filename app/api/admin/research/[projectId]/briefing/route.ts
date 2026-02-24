// app/api/admin/research/[projectId]/briefing/route.ts
// GET — Generate a plain-English briefing from all extracted data points for a project
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import type { ExtractedDataPoint, Discrepancy } from '@/types/research';
import { formatBearing, formatDistance } from '@/lib/research/normalization';
import type { NormalizedBearing, NormalizedDistance } from '@/lib/research/normalization';

function extractProjectId(req: NextRequest): string | null {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return null;
  return afterResearch.split('/')[0] || null;
}

/* GET — Return structured briefing data derived from extracted data points */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Load all data in parallel
  const [projectRes, dataPointsRes, discrepanciesRes, documentsRes, drawingsRes] = await Promise.all([
    supabaseAdmin.from('research_projects').select('*').eq('id', projectId).single(),
    supabaseAdmin
      .from('extracted_data_points')
      .select('*')
      .eq('research_project_id', projectId)
      .order('sequence_order', { ascending: true, nullsFirst: false })
      .order('data_category', { ascending: true }),
    supabaseAdmin.from('discrepancies').select('*').eq('research_project_id', projectId),
    supabaseAdmin.from('research_documents').select('id, document_type, document_label, original_filename').eq('research_project_id', projectId),
    supabaseAdmin
      .from('rendered_drawings')
      .select('comparison_notes, overall_confidence, created_at')
      .eq('research_project_id', projectId)
      .is('archived_at', null)
      .order('version', { ascending: false })
      .limit(1),
  ]);

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = projectRes.data;
  const dataPoints: ExtractedDataPoint[] = dataPointsRes.data || [];
  const discrepancies: Discrepancy[] = discrepanciesRes.data || [];
  const docMap = new Map((documentsRes.data || []).map((d: { id: string; document_label?: string | null; original_filename?: string | null }) => [
    d.id,
    d.document_label || d.original_filename || 'Unknown Document',
  ]));
  const latestDrawing = drawingsRes.data?.[0] || null;

  // ── Section 1: Boundary lines (calls) ─────────────────────────────────
  const callDPs = dataPoints
    .filter(dp => dp.data_category === 'call')
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));

  const boundaryLines = callDPs.map((dp, idx) => {
    const nv = dp.normalized_value as Record<string, unknown> | null;
    let description = dp.display_value || dp.raw_value;
    if (nv?.bearing && nv?.distance) {
      const bearingStr = formatBearing(nv.bearing as NormalizedBearing);
      const distStr = formatDistance(nv.distance as NormalizedDistance);
      description = `${bearingStr}, ${distStr}`;
    }
    return {
      index: idx + 1,
      description,
      raw: dp.raw_value,
      confidence: dp.extraction_confidence ?? 0,
      has_discrepancy: discrepancies.some(d => d.data_point_ids.includes(dp.id)),
      monument_at_end: (nv?.monument_at_end as string | undefined) || null,
    };
  });

  // ── Section 2: Corner & boundary markers (monuments) ──────────────────
  const monumentDPs = dataPoints.filter(dp => dp.data_category === 'monument');
  const monuments = monumentDPs.map(dp => {
    const nv = dp.normalized_value as Record<string, unknown> | null;
    return {
      description: dp.display_value || dp.raw_value,
      type: (nv?.type as string) || 'unknown',
      condition: (nv?.condition as string) || 'unknown',
      sequence_order: dp.sequence_order,
      confidence: dp.extraction_confidence ?? 0,
      has_discrepancy: discrepancies.some(d => d.data_point_ids.includes(dp.id)),
    };
  });

  // ── Section 3: Easements ───────────────────────────────────────────────
  const easementDPs = dataPoints.filter(dp => dp.data_category === 'easement');
  const easements = easementDPs.map(dp => {
    const nv = dp.normalized_value as Record<string, unknown> | null;
    return {
      description: dp.display_value || dp.raw_value,
      type: (nv?.type as string) || 'easement',
      width: (nv?.width as number | undefined) ?? null,
      purpose: (nv?.purpose as string | undefined) || null,
      grantee: (nv?.grantee as string | undefined) || null,
      source_doc: docMap.get(dp.document_id) || 'Unknown Document',
    };
  });

  // ── Section 4: Improvements, utilities, fences ────────────────────────
  // Capture utility_info, annotation, and 'other' categories (which can include
  // improvements, fences, buildings, and other field observations)
  const utilityDPs = dataPoints.filter(dp => dp.data_category === 'utility_info');
  const utilities = utilityDPs.map(dp => ({
    description: dp.display_value || dp.raw_value,
    source_doc: docMap.get(dp.document_id) || 'Unknown Document',
  }));

  const otherConsiderations = dataPoints
    .filter(dp => ['setback', 'right_of_way', 'zoning', 'flood_zone', 'annotation', 'other'].includes(dp.data_category))
    .map(dp => ({
      category: dp.data_category,
      description: dp.display_value || dp.raw_value,
      source_doc: docMap.get(dp.document_id) || 'Unknown Document',
    }));

  // ── Section 5: Area & closure ─────────────────────────────────────────
  const areaDPs = dataPoints.filter(dp => dp.data_category === 'area');
  const areas = areaDPs.map(dp => ({
    description: dp.display_value || dp.raw_value,
    confidence: dp.extraction_confidence ?? 0,
  }));

  const pobDPs = dataPoints.filter(dp => dp.data_category === 'point_of_beginning');
  const pob = pobDPs[0] ? (pobDPs[0].display_value || pobDPs[0].raw_value) : null;

  // ── Section 6: Discrepancy summary ────────────────────────────────────
  const openDiscrepancies = discrepancies.filter(d => d.resolution_status === 'open' || d.resolution_status === 'reviewing');
  const criticalDiscrepancies = openDiscrepancies.filter(d => d.severity === 'contradiction' || d.severity === 'error');
  const discrepancySummary = {
    total: discrepancies.length,
    open: openDiscrepancies.length,
    critical: criticalDiscrepancies.length,
    items: openDiscrepancies.slice(0, 10).map(d => ({
      title: d.title,
      severity: d.severity,
      affects_boundary: d.affects_boundary,
    })),
  };

  // ── Section 7: Legal / recording references ───────────────────────────
  const legalDPs = dataPoints.filter(dp =>
    ['recording_reference', 'legal_description', 'lot_block', 'subdivision_name'].includes(dp.data_category)
  );
  const legalRefs = legalDPs.map(dp => ({
    category: dp.data_category,
    description: dp.display_value || dp.raw_value,
  }));

  // ── Build plain-English summary sentences ─────────────────────────────
  const summaryLines: string[] = [];

  // Property identity
  if (project.property_address) {
    summaryLines.push(`Property: ${project.property_address}${project.county ? `, ${project.county} County` : ''}${project.state ? `, ${project.state}` : ''}.`);
  }
  if (project.parcel_id) {
    summaryLines.push(`CAD Property ID: ${project.parcel_id}.`);
  }

  // Legal description / lot-block
  const legalSummary = legalRefs.filter(r => r.category === 'legal_description' || r.category === 'lot_block' || r.category === 'subdivision_name');
  if (legalSummary.length > 0) {
    summaryLines.push(`Legal description: ${legalSummary.map(r => r.description).join('; ')}.`);
  }

  // POB
  if (pob) {
    summaryLines.push(`Point of Beginning: ${pob}.`);
  }

  // Boundary
  if (boundaryLines.length > 0) {
    summaryLines.push(`The boundary contains ${boundaryLines.length} call${boundaryLines.length !== 1 ? 's' : ''} as follows:`);
    boundaryLines.forEach(bl => {
      const discNote = bl.has_discrepancy ? ' [⚠ discrepancy flagged]' : '';
      const monNote = bl.monument_at_end ? ` (to ${bl.monument_at_end})` : '';
      summaryLines.push(`  ${bl.index}. ${bl.description}${monNote}${discNote}`);
    });
  } else {
    summaryLines.push('No boundary call data was extracted from the provided documents.');
  }

  // Area
  if (areas.length > 0) {
    summaryLines.push(`Area: ${areas.map(a => a.description).join('; ')}.`);
  } else if (latestDrawing?.comparison_notes) {
    const areaMatch = latestDrawing.comparison_notes.match(/Area:\s*([\d.,]+ acres)/i);
    if (areaMatch) summaryLines.push(`Computed area: ${areaMatch[1]}.`);
  }

  // Closure
  if (latestDrawing?.comparison_notes) {
    const closureMatch = latestDrawing.comparison_notes.match(/closure:\s*(1:\d+)/i);
    if (closureMatch) summaryLines.push(`Traverse closure: ${closureMatch[1]} (higher is better; 1:10,000+ is excellent).`);
  }

  // Corner markers
  if (monuments.length > 0) {
    const found = monuments.filter(m => m.condition === 'found');
    const set = monuments.filter(m => m.condition === 'set');
    summaryLines.push(`Corner markers: ${monuments.length} monument${monuments.length !== 1 ? 's' : ''} identified (${found.length} found, ${set.length} set).`);
    monuments.forEach((m, i) => {
      summaryLines.push(`  ${i + 1}. ${m.description}${m.has_discrepancy ? ' [⚠ discrepancy]' : ''}`);
    });
  } else {
    summaryLines.push('No corner or boundary markers were specifically identified in the documents.');
  }

  // Easements
  if (easements.length > 0) {
    summaryLines.push(`Easements: ${easements.length} easement${easements.length !== 1 ? 's' : ''} found.`);
    easements.forEach((e, i) => {
      const widthNote = e.width ? ` (${e.width} ft wide)` : '';
      summaryLines.push(`  ${i + 1}. ${e.description}${widthNote} — Source: ${e.source_doc}`);
    });
  } else {
    summaryLines.push('No easements were identified in the provided documents.');
  }

  // Utilities
  if (utilities.length > 0) {
    summaryLines.push(`Utility information: ${utilities.map(u => u.description).join('; ')}.`);
  }

  // Other considerations
  const zoning = otherConsiderations.filter(o => o.category === 'zoning');
  const flood = otherConsiderations.filter(o => o.category === 'flood_zone');
  const setbacks = otherConsiderations.filter(o => o.category === 'setback');
  const rowItems = otherConsiderations.filter(o => o.category === 'right_of_way');

  if (setbacks.length > 0) summaryLines.push(`Setbacks: ${setbacks.map(s => s.description).join('; ')}.`);
  if (rowItems.length > 0) summaryLines.push(`Rights of way: ${rowItems.map(r => r.description).join('; ')}.`);
  if (zoning.length > 0) summaryLines.push(`Zoning: ${zoning.map(z => z.description).join('; ')}.`);
  if (flood.length > 0) summaryLines.push(`Flood zone: ${flood.map(f => f.description).join('; ')}.`);

  // Discrepancies
  if (discrepancySummary.open > 0) {
    summaryLines.push(`⚠ There are ${discrepancySummary.open} open discrepanc${discrepancySummary.open !== 1 ? 'ies' : 'y'} requiring attention${discrepancySummary.critical > 0 ? `, including ${discrepancySummary.critical} critical` : ''}.`);
  } else if (discrepancySummary.total > 0) {
    summaryLines.push(`All ${discrepancySummary.total} discrepanc${discrepancySummary.total !== 1 ? 'ies' : 'y'} have been resolved.`);
  } else {
    summaryLines.push('No discrepancies were detected in the extracted data.');
  }

  return NextResponse.json({
    briefing: {
      summary: summaryLines,
      sections: {
        boundary_lines: boundaryLines,
        monuments,
        easements,
        utilities,
        other_considerations: otherConsiderations,
        areas,
        pob,
        legal_refs: legalRefs,
        discrepancies: discrepancySummary,
      },
      meta: {
        data_point_count: dataPoints.length,
        document_count: docMap.size,
        generated_at: new Date().toISOString(),
        property_id: project.parcel_id ?? null,
      },
    },
  });
}, { routeName: 'research/briefing' });
