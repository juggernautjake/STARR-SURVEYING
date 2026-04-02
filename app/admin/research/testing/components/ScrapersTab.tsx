// ScrapersTab.tsx — All 10 scraper test cards
'use client';

import TestCard from './TestCard';

const SCRAPERS = [
  {
    title: 'CAD Scraper',
    description: 'Searches Bell County Appraisal District for property data, legal descriptions, and improvement details.',
    module: 'cad-scraper',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '5-15s',
    requiredInputs: ['address'],
    optionalInputs: ['county', 'state'],
  },
  {
    title: 'GIS Scraper',
    description: 'Queries Bell County GIS for parcel geometry, zoning, flood zones, and coordinate data.',
    module: 'gis-scraper',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '2-5s',
    requiredInputs: ['address'],
    optionalInputs: ['county', 'state', 'lat', 'lon'],
  },
  {
    title: 'Clerk Scraper',
    description: 'Searches Bell County Clerk records for deeds, liens, easements, and plat filings.',
    module: 'clerk-scraper',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '15-45s',
    requiredInputs: ['projectId', 'ownerName'],
    optionalInputs: ['propertyId', 'subdivisionName', 'county'],
  },
  {
    title: 'Plat Scraper',
    description: 'Finds and downloads plat maps from the county clerk filing system.',
    module: 'plat-scraper',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '5-30s',
    requiredInputs: ['projectId', 'ownerName'],
    optionalInputs: ['subdivisionName', 'propertyId', 'county'],
  },
  {
    title: 'FEMA Scraper',
    description: 'Looks up FEMA flood zone designation for the property coordinates.',
    module: 'fema-scraper',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '3-5s',
    requiredInputs: ['lat', 'lon'],
  },
  {
    title: 'TxDOT Scraper',
    description: 'Checks TxDOT records for right-of-way information near the property.',
    module: 'txdot-scraper',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '3-5s',
    requiredInputs: ['lat', 'lon'],
  },
  {
    title: 'Tax Scraper',
    description: 'Retrieves tax assessment data from the TX Comptroller.',
    module: 'tax-scraper',
    requiresBrowser: false,
    requiresApiKey: false,
    estimatedRuntime: '5-15s',
    requiredInputs: ['propertyId'],
  },
  {
    title: 'Map Screenshot',
    description: 'Captures map screenshots from multiple providers (aerial, topo, street).',
    module: 'map-screenshot',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '20-40s',
    requiredInputs: ['propertyId', 'lat', 'lon'],
  },
  {
    title: 'GIS Viewer Capture',
    description: 'Opens the county GIS viewer and captures annotated screenshots with property boundaries.',
    module: 'gis-viewer',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '30-90s',
    requiredInputs: ['lat', 'lon'],
  },
  {
    title: 'Screenshot Collector',
    description: 'Captures screenshots from a list of URLs (for document thumbnails, external maps, etc).',
    module: 'screenshot-collector',
    requiresBrowser: true,
    requiresApiKey: false,
    estimatedRuntime: '7s + 5-10s/ea',
    requiredInputs: ['projectId', 'ownerName'],
    optionalInputs: ['county', 'propertyId'],
  },
];

export default function ScrapersTab() {
  return (
    <div className="testing-lab__grid">
      {SCRAPERS.map((s) => (
        <TestCard key={s.module} {...s} />
      ))}
    </div>
  );
}
