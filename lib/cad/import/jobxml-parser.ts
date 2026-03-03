// lib/cad/import/jobxml-parser.ts
import type { ParsedImportRow } from './types';

export function parseJobXML(xmlText: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];

  // Use DOMParser in browser environment
  if (typeof DOMParser === 'undefined') {
    return [{ lineNumber: 0, rawLine: '', error: 'DOMParser not available in this environment', data: null }];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return [{ lineNumber: 0, rawLine: '', error: `XML parse error: ${parseError.textContent}`, data: null }];
  }

  const points = doc.querySelectorAll('Point');
  let lineNum = 0;

  points.forEach((ptEl) => {
    lineNum++;
    try {
      const name = ptEl.querySelector('Name')?.textContent?.trim() ?? '';
      const code = ptEl.querySelector('Code')?.textContent?.trim() ?? '';

      // Try multiple element name variations for coordinates
      const northEl = ptEl.querySelector('North') ?? ptEl.querySelector('Northing');
      const eastEl = ptEl.querySelector('East') ?? ptEl.querySelector('Easting');
      const elevEl = ptEl.querySelector('Elevation') ?? ptEl.querySelector('Elev');

      const northing = northEl ? parseFloat(northEl.textContent ?? '0') : 0;
      const easting = eastEl ? parseFloat(eastEl.textContent ?? '0') : 0;
      const elevRaw = elevEl ? parseFloat(elevEl.textContent ?? '') : null;

      const numMatch = name.match(/^(\d+)/);
      const ptNum = numMatch ? parseInt(numMatch[1]) : lineNum;

      rows.push({
        lineNumber: lineNum,
        rawLine: ptEl.outerHTML?.substring(0, 200) ?? '',
        error: null,
        data: {
          pointNumber: ptNum,
          pointName: name,
          northing,
          easting,
          elevation: elevRaw !== null && !isNaN(elevRaw) ? elevRaw : null,
          rawCode: code,
          description: '',
        },
      });
    } catch (err) {
      rows.push({ lineNumber: lineNum, rawLine: '', error: `XML parse error: ${err}`, data: null });
    }
  });

  return rows;
}
