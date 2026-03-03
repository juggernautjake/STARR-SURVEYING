// lib/cad/import/jobxml-parser.ts
import type { ParsedImportRow } from './types';
import { cadLog } from '../logger';

/** Extract the text content of the first matching simple XML tag. */
function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * Regex-based fallback parser for environments where DOMParser is not available
 * (e.g. Node.js server-side). Handles simple Trimble JobXML <Point> elements.
 */
function parseJobXMLRegex(xmlText: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const pointPattern = /<Point[^>]*>([\s\S]*?)<\/Point>/gi;
  let match: RegExpExecArray | null;
  let lineNum = 0;

  while ((match = pointPattern.exec(xmlText)) !== null) {
    lineNum++;
    const inner = match[1];
    try {
      const name  = extractTag(inner, 'Name') ?? '';
      const code  = extractTag(inner, 'Code') ?? '';
      const northRaw = extractTag(inner, 'North') ?? extractTag(inner, 'Northing') ?? '0';
      const eastRaw  = extractTag(inner, 'East')  ?? extractTag(inner, 'Easting')  ?? '0';
      const elevRaw  = extractTag(inner, 'Elevation') ?? extractTag(inner, 'Elev');

      const northing = parseFloat(northRaw);
      const easting  = parseFloat(eastRaw);
      const elevation = elevRaw !== null ? parseFloat(elevRaw) : null;

      const numMatch = name.match(/^(\d+)/);
      const ptNum = numMatch ? parseInt(numMatch[1]) : lineNum;

      rows.push({
        lineNumber: lineNum,
        rawLine: match[0].substring(0, 200),
        error: null,
        data: {
          pointNumber: ptNum,
          pointName: name,
          northing: isNaN(northing) ? 0 : northing,
          easting:  isNaN(easting)  ? 0 : easting,
          elevation: elevation !== null && !isNaN(elevation) ? elevation : null,
          rawCode: code,
          description: '',
        },
      });
    } catch (err) {
      rows.push({ lineNumber: lineNum, rawLine: match[0].substring(0, 200), error: `Regex parse error: ${err}`, data: null });
    }
  }

  return rows;
}

export function parseJobXML(xmlText: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];

  // Prefer browser DOMParser; fall back to regex for server-side / test environments
  if (typeof DOMParser === 'undefined') {
    cadLog.info('JobXMLParser', 'DOMParser unavailable — using regex fallback parser');
    const result = parseJobXMLRegex(xmlText);
    cadLog.info('JobXMLParser', `Regex parse complete: ${result.length} point(s) found`);
    return result;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    cadLog.warn('JobXMLParser', `XML parse error: ${parseError.textContent}`);
    return [{ lineNumber: 0, rawLine: '', error: `XML parse error: ${parseError.textContent}`, data: null }];
  }

  const points = doc.querySelectorAll('Point');
  cadLog.info('JobXMLParser', `Parsing JobXML: ${points.length} Point element(s)`);
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
      cadLog.warn('JobXMLParser', `Point ${lineNum}: parse error — ${err}`);
      rows.push({ lineNumber: lineNum, rawLine: '', error: `XML parse error: ${err}`, data: null });
    }
  });

  cadLog.info('JobXMLParser', `JobXML parse complete: ${rows.length} point(s), ${rows.filter(r => r.error).length} error(s)`);
  return rows;
}
