// worker/src/exports/csv-exporter.ts — Phase 11 Module P
// CSV export for batch research results and property data.
// Produces comma-separated values for use in Excel, GIS tools, or import pipelines.
//
// Spec §11.15.3 — CSV Export

/**
 * Export batch research results as a CSV string.
 *
 * Columns:
 *   address, county, state, status, confidence, primary_flood_zone,
 *   flood_insurance_required, chain_links, has_chain_gap,
 *   data_point_count, discrepancy_count, completed_at
 */
export interface BatchResultRow {
  address: string;
  county: string;
  state: string;
  status: string;
  confidence?: number | null;
  primary_flood_zone?: string | null;
  flood_insurance_required?: boolean | null;
  chain_links?: number | null;
  has_chain_gap?: boolean | null;
  data_point_count?: number | null;
  discrepancy_count?: number | null;
  completed_at?: string | null;
  error?: string | null;
}

/**
 * Export a list of batch result rows to CSV format.
 * Handles quoting, escaping, and Windows-compatible CRLF line endings.
 */
export function exportBatchResultsToCSV(rows: BatchResultRow[], projectName?: string): string {
  const headers: (keyof BatchResultRow)[] = [
    'address',
    'county',
    'state',
    'status',
    'confidence',
    'primary_flood_zone',
    'flood_insurance_required',
    'chain_links',
    'has_chain_gap',
    'data_point_count',
    'discrepancy_count',
    'completed_at',
    'error',
  ];

  const headerLabels: Record<keyof BatchResultRow, string> = {
    address: 'Property Address',
    county: 'County',
    state: 'State',
    status: 'Status',
    confidence: 'Confidence %',
    primary_flood_zone: 'Primary Flood Zone',
    flood_insurance_required: 'Flood Insurance Required',
    chain_links: 'Chain of Title Links',
    has_chain_gap: 'Chain Gap Detected',
    data_point_count: 'Data Points',
    discrepancy_count: 'Discrepancies',
    completed_at: 'Completed At',
    error: 'Error',
  };

  const lines: string[] = [];

  // Optional project name header comment
  if (projectName) {
    lines.push(csvField(`STARR RECON Batch Export — ${projectName}`));
    lines.push(csvField(`Generated: ${new Date().toISOString()}`));
    lines.push('');
  }

  // Column headers
  lines.push(headers.map(h => csvField(headerLabels[h])).join(','));

  // Data rows
  for (const row of rows) {
    const cells = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      if (typeof val === 'number') return String(val);
      return csvField(String(val));
    });
    lines.push(cells.join(','));
  }

  // CRLF line endings for Windows Excel compatibility
  return lines.join('\r\n') + '\r\n';
}

/**
 * Export individual data points from a research project as CSV.
 * Useful for importing into GIS or spreadsheet workflows.
 */
export interface DataPointRow {
  data_type: string;
  value_text?: string | null;
  value_numeric?: number | null;
  value_unit?: string | null;
  confidence_score: number;
  source_document?: string | null;
  source_page?: number | null;
  verified: boolean;
  notes?: string | null;
}

export function exportDataPointsToCSV(rows: DataPointRow[], projectName?: string): string {
  const headers: (keyof DataPointRow)[] = [
    'data_type',
    'value_text',
    'value_numeric',
    'value_unit',
    'confidence_score',
    'source_document',
    'source_page',
    'verified',
    'notes',
  ];

  const headerLabels: Record<keyof DataPointRow, string> = {
    data_type: 'Data Type',
    value_text: 'Value (Text)',
    value_numeric: 'Value (Numeric)',
    value_unit: 'Unit',
    confidence_score: 'Confidence %',
    source_document: 'Source Document',
    source_page: 'Page',
    verified: 'Verified',
    notes: 'Notes',
  };

  const lines: string[] = [];

  if (projectName) {
    lines.push(csvField(`STARR RECON Data Points — ${projectName}`));
    lines.push(csvField(`Generated: ${new Date().toISOString()}`));
    lines.push('');
  }

  lines.push(headers.map(h => csvField(headerLabels[h])).join(','));

  for (const row of rows) {
    const cells = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? 'Yes' : 'No';
      if (typeof val === 'number') return String(val);
      return csvField(String(val));
    });
    lines.push(cells.join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wrap a string value in CSV quotes if it contains commas, quotes, or newlines.
 * Doubles internal quotes per RFC 4180.
 */
export function csvField(value: string): string {
  if (/[,"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
