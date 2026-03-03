// lib/cad/import/rw5-parser.ts
import type { ParsedImportRow } from './types';

export function parseRW5(text: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('--')) continue;
    if (!line.startsWith('SP,')) continue;

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
      rows.push({ lineNumber: i + 1, rawLine: line, error: `Parse error: ${err}`, data: null });
    }
  }

  return rows;
}
