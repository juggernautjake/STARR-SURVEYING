// PhasesTab.tsx — All 9 pipeline phase cards, runnable individually
'use client';

import TestCard from './TestCard';

const PHASES = [
  {
    title: 'Phase 1: Property Discovery',
    description: 'Searches CAD and GIS for property data, legal descriptions, coordinates, and owner info.',
    module: 'phase-1-discover',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '10-30s',
    requiredInputs: ['address'],
    optionalInputs: ['propertyId', 'ownerName', 'lat', 'lon'],
  },
  {
    title: 'Phase 2: Document Harvesting',
    description: 'Searches clerk records, downloads deeds, plats, and captures map screenshots.',
    module: 'phase-2-harvest',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '30-120s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Phase 3: AI Extraction',
    description: 'AI analyzes all harvested documents to extract bearings, distances, monuments, and boundaries.',
    module: 'phase-3-analyze',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '15-60s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Phase 4: Subdivision Intelligence',
    description: 'Researches the subdivision for additional context — lot layouts, common areas, restrictions.',
    module: 'phase-4-subdivision',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '10-30s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Phase 5: Adjacent Properties',
    description: 'Researches neighboring properties for boundary corroboration and overlap detection.',
    module: 'phase-5-adjacent',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '30-120s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Phase 6: TxDOT ROW',
    description: 'Checks TxDOT records for right-of-way information along adjacent roads.',
    module: 'phase-6-row',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '5-15s',
    requiredInputs: ['projectId'],
    optionalInputs: ['lat', 'lon'],
  },
  {
    title: 'Phase 7: Boundary Reconciliation',
    description: 'Reconciles all data sources into a unified boundary with confidence scoring per vertex.',
    module: 'phase-7-reconcile',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '10-30s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Phase 8: Confidence Scoring',
    description: 'Calculates overall confidence scores for the research and flags data quality issues.',
    module: 'phase-8-confidence',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '2-5s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Phase 9: Document Purchase',
    description: 'Purchases official copies of critical documents (deeds, plats) from the county clerk.',
    module: 'phase-9-purchase',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '15-60s',
    requiredInputs: ['projectId'],
  },
];

export default function PhasesTab() {
  return (
    <div className="testing-lab__grid testing-lab__grid--single">
      {PHASES.map((p) => (
        <TestCard key={p.module} {...p} />
      ))}
    </div>
  );
}
