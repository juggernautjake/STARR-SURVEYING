// lib/research/research-synthesizer.ts — Final research synthesis engine
//
// After all resources have been analyzed and cross-validated, this engine
// produces the final comprehensive summary with all data formatted and displayed.

import { callAI } from './ai-client';
import type {
  DataAtom,
  AtomCategory,
  ValidationGraph,
  AtomConflict,
  AtomConfirmation,
  ValidationLog,
} from './cross-validation.service';
import type { ResourceExtractionReport } from './extraction-objectives';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single confirmed data point with all supporting evidence */
export interface ConfirmedDataPoint {
  /** Data category */
  category: AtomCategory;
  /** Human-readable label */
  label: string;
  /** Best/most confident value */
  best_value: string;
  /** Confidence in this value (0-100) */
  confidence: number;
  /** All sources that confirmed this value */
  confirmed_by: Array<{
    source: string;
    value: string;
    confidence: number;
  }>;
  /** Any conflicting values from other sources */
  conflicts: Array<{
    source: string;
    value: string;
    severity: string;
    resolution: string | null;
  }>;
}

/** Organized section of the final summary */
export interface SummarySection {
  /** Section heading */
  title: string;
  /** Section icon for display */
  icon: string;
  /** Data points in this section */
  data_points: ConfirmedDataPoint[];
  /** Free-text notes for this section */
  notes: string[];
}

/** The complete research synthesis */
export interface ResearchSynthesis {
  /** Project / property identifier */
  project_id: string;
  /** Property address */
  property_address: string;
  /** When this synthesis was generated */
  generated_at: string;

  // ── Executive Summary ─────────────────────────────────────────
  /** One-paragraph executive summary */
  executive_summary: string;
  /** Overall research confidence (0-100) */
  overall_confidence: number;
  /** Confidence tier: VERY_HIGH / HIGH / MODERATE / LOW / INSUFFICIENT */
  confidence_tier: string;

  // ── Organized Data ────────────────────────────────────────────
  /** Data organized into logical sections */
  sections: SummarySection[];

  // ── Source Analysis ───────────────────────────────────────────
  /** Per-resource extraction reports */
  resource_reports: ResourceExtractionReport[];
  /** Summary of how many data points each source contributed */
  source_contributions: Array<{
    source: string;
    atoms_contributed: number;
    confirmed_count: number;
    conflicted_count: number;
    reliability_score: number;
  }>;

  // ── Validation Summary ────────────────────────────────────────
  /** Total atoms in the validation graph */
  total_data_points: number;
  /** How many were confirmed by multiple sources */
  confirmed_count: number;
  /** How many had conflicts */
  conflicted_count: number;
  /** How many remain unvalidated (single source only) */
  unvalidated_count: number;
  /** Critical conflicts that need resolution */
  critical_issues: Array<{
    category: string;
    description: string;
    sources: string[];
    values: string[];
    recommendation: string;
  }>;

  // ── Interesting Findings ──────────────────────────────────────
  /** Aggregated interesting findings from all resources */
  interesting_findings: string[];

  // ── Completeness ──────────────────────────────────────────────
  /** What data we successfully extracted */
  data_found: string[];
  /** What data we could NOT find (gaps) */
  data_gaps: string[];
  /** Recommendations for filling gaps */
  gap_recommendations: string[];
}

// ── Category Labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  property_id: 'Property ID',
  owner_name: 'Owner Name',
  situs_address: 'Property Address',
  legal_description: 'Legal Description',
  lot_number: 'Lot Number',
  block_number: 'Block Number',
  subdivision_name: 'Subdivision Name',
  abstract_number: 'Abstract Number',
  survey_name: 'Survey Name',
  acreage: 'Acreage',
  deed_reference: 'Deed Reference',
  plat_reference: 'Plat Reference',
  bearing: 'Bearing',
  distance: 'Distance',
  boundary_call: 'Boundary Call',
  monument: 'Monument',
  point_of_beginning: 'Point of Beginning',
  easement: 'Easement',
  flood_zone: 'Flood Zone',
  city_name: 'City',
  school_district: 'School District',
  market_value: 'Market Value',
  land_value: 'Land Value',
  improvement_value: 'Improvement Value',
  lot_identification: 'Lot Identification',
  pin_location: 'Pin Location',
  parcel_geometry: 'Parcel Geometry',
  // New categories
  curve_data: 'Curve Data',
  right_of_way: 'Right-of-Way',
  setback_line: 'Building Setback Line',
  grantor: 'Grantor (Seller)',
  grantee: 'Grantee (Buyer)',
  deed_date: 'Deed Date',
  deed_type: 'Deed Type',
  plat_date: 'Plat Date',
  surveyor_name: 'Surveyor / RPLS',
  street_name: 'Street Name',
  adjacent_lot: 'Adjacent Lot',
  restriction: 'Restriction / Covenant',
  encumbrance: 'Lien / Encumbrance',
  coordinate: 'Coordinate',
  elevation: 'Elevation',
  other: 'Other',
};

/** Section definitions for organizing data */
const SECTION_DEFINITIONS: Array<{
  title: string;
  icon: string;
  categories: AtomCategory[];
}> = [
  {
    title: 'Property Identity',
    icon: 'ID',
    categories: ['property_id', 'owner_name', 'situs_address', 'lot_identification'],
  },
  {
    title: 'Lot, Block & Subdivision',
    icon: 'LOT',
    categories: ['lot_number', 'block_number', 'subdivision_name', 'abstract_number', 'survey_name'],
  },
  {
    title: 'Area & Dimensions',
    icon: 'AREA',
    categories: ['acreage', 'distance', 'parcel_geometry', 'coordinate', 'elevation'],
  },
  {
    title: 'Metes & Bounds',
    icon: 'M&B',
    categories: ['bearing', 'boundary_call', 'monument', 'point_of_beginning', 'curve_data'],
  },
  {
    title: 'Deed & Recording References',
    icon: 'DEED',
    categories: ['deed_reference', 'plat_reference', 'grantor', 'grantee', 'deed_date', 'deed_type'],
  },
  {
    title: 'Plat & Survey',
    icon: 'PLAT',
    categories: ['plat_date', 'surveyor_name'],
  },
  {
    title: 'Legal Description',
    icon: 'LEGAL',
    categories: ['legal_description'],
  },
  {
    title: 'Easements & Encumbrances',
    icon: 'EASE',
    categories: ['easement', 'right_of_way', 'setback_line', 'restriction', 'encumbrance'],
  },
  {
    title: 'Surrounding Properties',
    icon: 'ADJ',
    categories: ['adjacent_lot', 'street_name'],
  },
  {
    title: 'Flood & Environment',
    icon: 'FLOOD',
    categories: ['flood_zone'],
  },
  {
    title: 'Location & Jurisdiction',
    icon: 'LOC',
    categories: ['city_name', 'school_district', 'pin_location'],
  },
  {
    title: 'Valuation',
    icon: 'VAL',
    categories: ['market_value', 'land_value', 'improvement_value'],
  },
];

// ── Synthesizer ──────────────────────────────────────────────────────────────

/**
 * Generate the final comprehensive research synthesis from all analyzed resources.
 */
export async function synthesizeResearch(params: {
  project_id: string;
  property_address: string;
  validation_graph: ValidationGraph;
  resource_reports: ResourceExtractionReport[];
  validation_logs: ValidationLog[];
}): Promise<ResearchSynthesis> {
  const { project_id, property_address, validation_graph, resource_reports, validation_logs } = params;
  const { atoms, conflicts, confirmations, summary: graphSummary } = validation_graph;

  // ── Step 1: Build confirmed data points ───────────────────────
  const confirmedPoints = buildConfirmedDataPoints(atoms, conflicts, confirmations);

  // ── Step 2: Organize into sections ────────────────────────────
  const sections = organizeSections(confirmedPoints, atoms);

  // ── Step 3: Calculate source contributions ────────────────────
  const sourceContributions = calculateSourceContributions(atoms, confirmations, conflicts);

  // ── Step 4: Identify critical issues ──────────────────────────
  const criticalIssues = conflicts
    .filter(c => c.severity === 'critical' || c.severity === 'major')
    .map(c => {
      const atomA = atoms.find(a => a.id === c.atom_a_id);
      const atomB = atoms.find(a => a.id === c.atom_b_id);
      return {
        category: c.category,
        description: c.description,
        sources: [atomA?.source || 'unknown', atomB?.source || 'unknown'],
        values: [atomA?.value || '?', atomB?.value || '?'],
        recommendation: c.recommendation || 'Manual review required',
      };
    });

  // ── Step 5: Identify data gaps ────────────────────────────────
  const categoriesFound = new Set(atoms.map(a => a.category));
  const criticalCategories: AtomCategory[] = [
    'property_id', 'owner_name', 'situs_address', 'lot_number',
    'block_number', 'subdivision_name', 'acreage', 'deed_reference',
    'legal_description',
  ];
  const dataFound = criticalCategories.filter(c => categoriesFound.has(c)).map(c => CATEGORY_LABELS[c] || c);
  const dataGaps = criticalCategories.filter(c => !categoriesFound.has(c)).map(c => CATEGORY_LABELS[c] || c);

  const gapRecommendations = dataGaps.map(gap => {
    switch (gap) {
      case 'Lot Number': return 'Run lot verification pipeline with GIS + plat cross-check';
      case 'Block Number': return 'Check subdivision plat or CAD GIS parcel data';
      case 'Deed Reference': return 'Search county clerk deed records by owner name or legal description';
      case 'Legal Description': return 'Extract from most recent deed or survey document';
      case 'Acreage': return 'Calculate from parcel geometry or extract from deed/plat';
      default: return `Search additional sources for ${gap}`;
    }
  });

  // ── Step 6: Aggregate interesting findings ────────────────────
  const allFindings = resource_reports.flatMap(r => r.interesting_findings);

  // ── Step 7: AI Executive Summary ──────────────────────────────
  const executiveSummary = await generateExecutiveSummary({
    property_address,
    sections,
    criticalIssues,
    dataGaps,
    sourceContributions,
    allFindings,
    graphSummary,
  });

  // ── Step 8: Compute overall confidence ────────────────────────
  const overallConfidence = graphSummary.overall_confidence;
  const confidenceTier = overallConfidence >= 90 ? 'VERY_HIGH'
    : overallConfidence >= 75 ? 'HIGH'
    : overallConfidence >= 60 ? 'MODERATE'
    : overallConfidence >= 40 ? 'LOW'
    : 'INSUFFICIENT';

  return {
    project_id,
    property_address,
    generated_at: new Date().toISOString(),
    executive_summary: executiveSummary,
    overall_confidence: overallConfidence,
    confidence_tier: confidenceTier,
    sections,
    resource_reports,
    source_contributions: sourceContributions,
    total_data_points: graphSummary.total_atoms,
    confirmed_count: graphSummary.confirmed_count,
    conflicted_count: graphSummary.conflicted_count,
    unvalidated_count: graphSummary.unvalidated_count,
    critical_issues: criticalIssues,
    interesting_findings: allFindings,
    data_found: dataFound,
    data_gaps: dataGaps,
    gap_recommendations: gapRecommendations,
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function buildConfirmedDataPoints(
  atoms: DataAtom[],
  conflicts: AtomConflict[],
  confirmations: AtomConfirmation[],
): ConfirmedDataPoint[] {
  // Group atoms by category
  const byCategory = new Map<AtomCategory, DataAtom[]>();
  for (const atom of atoms) {
    const list = byCategory.get(atom.category) || [];
    list.push(atom);
    byCategory.set(atom.category, list);
  }

  const points: ConfirmedDataPoint[] = [];

  for (const [category, categoryAtoms] of byCategory.entries()) {
    // Find the best atom (highest confidence, most confirmations)
    const sorted = [...categoryAtoms].sort((a, b) => {
      // Confirmed > unvalidated > conflicted
      const stateOrder = { confirmed: 0, unvalidated: 1, conflicted: 2, overridden: 3, rejected: 4 };
      const stateDiff = (stateOrder[a.validation_state] ?? 5) - (stateOrder[b.validation_state] ?? 5);
      if (stateDiff !== 0) return stateDiff;
      return b.confidence - a.confidence;
    });

    const bestAtom = sorted[0];

    // Find confirmations for this category
    const categoryConfirmations = confirmations.filter(c => c.category === category);
    const confirmedBy = categoryAtoms
      .filter(a => a.id !== bestAtom.id)
      .filter(a => {
        return categoryConfirmations.some(
          c => (c.atom_a_id === bestAtom.id && c.atom_b_id === a.id) ||
               (c.atom_b_id === bestAtom.id && c.atom_a_id === a.id),
        );
      })
      .map(a => ({
        source: a.source,
        value: a.value,
        confidence: a.confidence,
      }));

    // Find conflicts for this category
    const categoryConflicts = conflicts.filter(c => c.category === category);
    const conflictEntries = categoryConflicts.map(c => {
      const otherAtomId = c.atom_a_id === bestAtom.id ? c.atom_b_id : c.atom_a_id;
      const otherAtom = atoms.find(a => a.id === otherAtomId);
      return {
        source: otherAtom?.source || 'unknown',
        value: otherAtom?.value || '?',
        severity: c.severity,
        resolution: c.resolution,
      };
    });

    points.push({
      category,
      label: CATEGORY_LABELS[category] || category,
      best_value: bestAtom.value,
      confidence: bestAtom.confidence,
      confirmed_by: [
        { source: bestAtom.source, value: bestAtom.value, confidence: bestAtom.confidence },
        ...confirmedBy,
      ],
      conflicts: conflictEntries,
    });
  }

  return points;
}

function organizeSections(
  dataPoints: ConfirmedDataPoint[],
  atoms: DataAtom[],
): SummarySection[] {
  const sections: SummarySection[] = [];
  const usedCategories = new Set<string>();

  for (const def of SECTION_DEFINITIONS) {
    const sectionPoints = dataPoints.filter(dp =>
      def.categories.includes(dp.category) && dp.best_value,
    );

    if (sectionPoints.length === 0) continue;

    for (const dp of sectionPoints) {
      usedCategories.add(dp.category);
    }

    const notes: string[] = [];

    // Add conflict warnings
    const sectionConflicts = sectionPoints.filter(dp => dp.conflicts.length > 0);
    if (sectionConflicts.length > 0) {
      notes.push(`${sectionConflicts.length} data point(s) have conflicts from different sources`);
    }

    // Count sources
    const sources = new Set(sectionPoints.flatMap(dp => dp.confirmed_by.map(cb => cb.source)));
    notes.push(`Data from ${sources.size} source(s): ${[...sources].join(', ')}`);

    sections.push({
      title: def.title,
      icon: def.icon,
      data_points: sectionPoints,
      notes,
    });
  }

  // Catch any uncategorized data points
  const uncategorized = dataPoints.filter(dp => !usedCategories.has(dp.category) && dp.best_value);
  if (uncategorized.length > 0) {
    sections.push({
      title: 'Other Data',
      icon: 'OTHER',
      data_points: uncategorized,
      notes: [`${uncategorized.length} additional data point(s)`],
    });
  }

  return sections;
}

function calculateSourceContributions(
  atoms: DataAtom[],
  confirmations: AtomConfirmation[],
  conflicts: AtomConflict[],
): ResearchSynthesis['source_contributions'] {
  const sourceMap = new Map<string, {
    atoms: number;
    confirmed: number;
    conflicted: number;
  }>();

  for (const atom of atoms) {
    const entry = sourceMap.get(atom.source) || { atoms: 0, confirmed: 0, conflicted: 0 };
    entry.atoms++;
    if (atom.validation_state === 'confirmed') entry.confirmed++;
    if (atom.validation_state === 'conflicted') entry.conflicted++;
    sourceMap.set(atom.source, entry);
  }

  return [...sourceMap.entries()]
    .map(([source, stats]) => ({
      source,
      atoms_contributed: stats.atoms,
      confirmed_count: stats.confirmed,
      conflicted_count: stats.conflicted,
      reliability_score: stats.atoms > 0
        ? Math.round(((stats.confirmed) / stats.atoms) * 100)
        : 0,
    }))
    .sort((a, b) => b.atoms_contributed - a.atoms_contributed);
}

async function generateExecutiveSummary(params: {
  property_address: string;
  sections: SummarySection[];
  criticalIssues: ResearchSynthesis['critical_issues'];
  dataGaps: string[];
  sourceContributions: ResearchSynthesis['source_contributions'];
  allFindings: string[];
  graphSummary: ValidationGraph['summary'];
}): Promise<string> {
  const { property_address, sections, criticalIssues, dataGaps, sourceContributions, allFindings, graphSummary } = params;

  const dataSnapshot = sections.map(s => {
    const points = s.data_points.map(dp => `  - ${dp.label}: ${dp.best_value} (${dp.confidence}% confidence, ${dp.confirmed_by.length} source(s))`).join('\n');
    return `${s.title}:\n${points}`;
  }).join('\n\n');

  const prompt = `You are writing an executive summary for a land surveying research report.

PROPERTY: ${property_address}

DATA COLLECTED:
${dataSnapshot}

SOURCES USED: ${sourceContributions.map(s => `${s.source} (${s.atoms_contributed} data points)`).join(', ')}

VALIDATION STATS: ${graphSummary.total_atoms} total data points, ${graphSummary.confirmed_count} confirmed, ${graphSummary.conflicted_count} conflicted, ${graphSummary.unvalidated_count} single-source

${criticalIssues.length > 0 ? `CRITICAL ISSUES:\n${criticalIssues.map(i => `- ${i.description}`).join('\n')}` : 'No critical issues.'}

${dataGaps.length > 0 ? `DATA GAPS: ${dataGaps.join(', ')}` : 'All critical data categories collected.'}

${allFindings.length > 0 ? `INTERESTING FINDINGS:\n${allFindings.slice(0, 10).map(f => `- ${f}`).join('\n')}` : ''}

Write a 2-3 paragraph executive summary. Include:
1. What property was researched and the key identifying information (lot, block, subdivision)
2. What data was successfully collected and confirmed across sources
3. Any issues, conflicts, or gaps that need attention
4. Overall assessment of research completeness and confidence

Be concise, professional, and specific. Use the actual values from the data.`;

  try {
    const result = await callAI({
      promptKey: 'FINAL_COHERENCE_REVIEWER',
      userContent: prompt,
      maxTokens: 2048,
      timeoutMs: 60_000,
    });

    return result.raw.replace(/```[\s\S]*?```/g, '').trim();
  } catch {
    // Fallback to programmatic summary
    const lotInfo = sections.find(s => s.title === 'Lot, Block & Subdivision');
    const lotStr = lotInfo?.data_points.map(dp => `${dp.label}: ${dp.best_value}`).join(', ') || 'unknown';

    return `Research synthesis for ${property_address}. Property identified as ${lotStr}. ` +
      `${graphSummary.total_atoms} data points extracted from ${sourceContributions.length} source(s), ` +
      `${graphSummary.confirmed_count} confirmed by multiple sources, ` +
      `${graphSummary.conflicted_count} conflicts detected. ` +
      `${criticalIssues.length > 0 ? `${criticalIssues.length} critical issue(s) require attention. ` : ''}` +
      `${dataGaps.length > 0 ? `Missing data: ${dataGaps.join(', ')}. ` : 'All critical data categories collected. '}` +
      `Overall confidence: ${graphSummary.overall_confidence}%.`;
  }
}

// ── Display Formatting ───────────────────────────────────────────────────────

/**
 * Format the synthesis into a human-readable display structure.
 * Returns structured data suitable for rendering in the UI.
 */
export function formatSynthesisForDisplay(synthesis: ResearchSynthesis): {
  header: { address: string; confidence: string; tier: string; generated: string };
  executive_summary: string;
  sections: Array<{
    title: string;
    icon: string;
    rows: Array<{
      label: string;
      value: string;
      confidence: number;
      sources: number;
      conflicts: number;
      status: 'confirmed' | 'single_source' | 'conflicted';
    }>;
    notes: string[];
  }>;
  validation_summary: {
    total: number;
    confirmed: number;
    conflicted: number;
    unvalidated: number;
    percentage_confirmed: number;
  };
  source_table: Array<{
    source: string;
    contributed: number;
    confirmed: number;
    reliability: number;
  }>;
  issues: ResearchSynthesis['critical_issues'];
  gaps: { missing: string[]; recommendations: string[] };
  findings: string[];
} {
  return {
    header: {
      address: synthesis.property_address,
      confidence: `${synthesis.overall_confidence}%`,
      tier: synthesis.confidence_tier,
      generated: synthesis.generated_at,
    },
    executive_summary: synthesis.executive_summary,
    sections: synthesis.sections.map(s => ({
      title: s.title,
      icon: s.icon,
      rows: s.data_points.map(dp => ({
        label: dp.label,
        value: dp.best_value,
        confidence: dp.confidence,
        sources: dp.confirmed_by.length,
        conflicts: dp.conflicts.length,
        status: dp.conflicts.length > 0
          ? 'conflicted' as const
          : dp.confirmed_by.length > 1
            ? 'confirmed' as const
            : 'single_source' as const,
      })),
      notes: s.notes,
    })),
    validation_summary: {
      total: synthesis.total_data_points,
      confirmed: synthesis.confirmed_count,
      conflicted: synthesis.conflicted_count,
      unvalidated: synthesis.unvalidated_count,
      percentage_confirmed: synthesis.total_data_points > 0
        ? Math.round((synthesis.confirmed_count / synthesis.total_data_points) * 100)
        : 0,
    },
    source_table: synthesis.source_contributions.map(s => ({
      source: s.source,
      contributed: s.atoms_contributed,
      confirmed: s.confirmed_count,
      reliability: s.reliability_score,
    })),
    issues: synthesis.critical_issues,
    gaps: {
      missing: synthesis.data_gaps,
      recommendations: synthesis.gap_recommendations,
    },
    findings: synthesis.interesting_findings,
  };
}
