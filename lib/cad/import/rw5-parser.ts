// lib/cad/import/rw5-parser.ts
import type { ParsedImportRow } from './types';
import { cadLog } from '../logger';

export function parseRW5(text: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text.split(/\r?\n/);
  let spCount = 0;

  cadLog.info('RW5Parser', `Parsing RW5: ${lines.length} line(s)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('--')) continue;
    if (!line.startsWith('SP,')) continue;

    spCount++;
    try {
      const parts = line.split(',');

      const pnPart = parts.find(p => p.startsWith('PN'));
      const ptNum = pnPart ? parseInt(pnPart.substring(2)) : 0;

      const nPart = parts.find(p => p.trimStart().startsWith('N '));
      const northing = nPart ? parseFloat(nPart.trim().substring(2)) : 0;

      const ePart = parts.find(p => p.trimStart().startsWith('E '));
      const easting = ePart ? parseFloat(ePart.trim().substring(2)) : 0;

      const elPart = parts.find(p => p.trimStart().startsWith('EL'));
      const elevation = elPart ? parseFloat(elPart.trim().substring(2)) : null;

      const descPart = parts.find(p => p.trimStart().startsWith('--'));
      let pointName = ptNum.toString();
      let rawCode = '';
      let description = '';

      if (descPart) {
        const descText = descPart.trim().substring(2).trim();
        const words = descText.split(/\s+/);
        if (words.length >= 2) {
          pointName = words[0];
          rawCode = words[1];
          description = words.slice(2).join(' ');
        } else if (words.length === 1) {
          if (/^\d+[a-zA-Z]*$/.test(words[0])) {
            rawCode = words[0];
          } else {
            pointName = words[0];
          }
        }
      }

      if (isNaN(ptNum) || isNaN(northing) || isNaN(easting)) {
        cadLog.warn('RW5Parser', `Line ${i + 1}: invalid numeric data (ptNum=${ptNum}, N=${northing}, E=${easting}) — skipped`);
        rows.push({ lineNumber: i + 1, rawLine: line, error: 'Invalid numeric value in SP record', data: null });
        continue;
      }

      rows.push({
        lineNumber: i + 1,
        rawLine: line,
        error: null,
        data: {
          pointNumber: ptNum,
          pointName,
          northing,
          easting,
          elevation: elevation !== null && !isNaN(elevation) ? elevation : null,
          rawCode,
          description,
        },
      });
    } catch (err) {
      cadLog.warn('RW5Parser', `Line ${i + 1}: unexpected parse error — ${err}`);
      rows.push({ lineNumber: i + 1, rawLine: line, error: `Parse error: ${err}`, data: null });
    }
  }

  cadLog.info('RW5Parser', `RW5 parse complete: ${spCount} SP record(s) found, ${rows.filter(r => r.error).length} error(s)`);
  return rows;
}
