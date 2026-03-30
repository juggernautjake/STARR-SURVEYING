// AnalyzersTab.tsx — All 8 analyzer test cards
'use client';

import TestCard from './TestCard';

const ANALYZERS = [
  {
    title: 'Deed Analyzer',
    description: 'AI-powered extraction of bearings, distances, monuments, and legal descriptions from deed documents.',
    module: 'deed-analyzer',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '10-30s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Plat Analyzer',
    description: 'AI-powered extraction of lot dimensions, setbacks, easements, and boundary data from plat maps.',
    module: 'plat-analyzer',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '5-20s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Lot Correlator',
    description: 'Correlates the target lot/block with extracted data to identify the exact parcel boundaries.',
    module: 'lot-correlator',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '5-10s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Discrepancy Detector',
    description: 'Compares data from CAD, GIS, deeds, and plats to find conflicts and inconsistencies.',
    module: 'discrepancy',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '<1s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Confidence Scorer',
    description: 'Scores the reliability of each extracted data point and calculates overall confidence.',
    module: 'confidence',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '<1s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Relevance Validator',
    description: 'Validates whether harvested deeds are actually relevant to the target property.',
    module: 'relevance',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '1-5s',
    requiredInputs: ['projectId'],
  },
  {
    title: 'GIS Quality Analyzer',
    description: 'AI-powered analysis of GIS screenshot quality — checks clarity, annotation accuracy, and coverage.',
    module: 'gis-quality',
    requiresBrowser: false,
    requiresApiKey: true,
    estimatedRuntime: '2-5s/ea',
    requiredInputs: ['projectId'],
  },
  {
    title: 'Screenshot Classifier',
    description: 'Classifies captured screenshots by type (aerial, plat, deed, topo, etc).',
    module: 'screenshot-classifier',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '1-3s',
    requiredInputs: ['projectId'],
  },
];

export default function AnalyzersTab() {
  return (
    <div className="testing-lab__grid">
      {ANALYZERS.map((a) => (
        <TestCard key={a.module} {...a} />
      ))}
    </div>
  );
}
