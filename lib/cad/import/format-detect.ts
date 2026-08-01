// lib/cad/import/format-detect.ts — which reader a dropped file needs (audit §3c.2, items 8j–8l).
//
// Five vendors, five-ish formats, and a surveyor who has just been handed a file by a client does not
// necessarily know which one it is. The extension is a hint and not much more: `.raw` is Carlson,
// Topcon *and* Spectra; `.xml` is LandXML *and* Trimble JobXML; `.txt` is anything at all.
//
// So detection reads the content and uses the extension only to break ties. Each reader exports its
// own `looksLike…`, which keeps the knowledge of "what does this format's first line look like" in
// the file that already knows.
//
// **The unknown case returns `unknown`, not a guess.** Feeding a GSI file to the CSV reader produces
// rows — nonsense rows, with the point number parsed out of a word index — and a plausible-looking
// import is worse than a refusal.

import { looksLikeLandXml } from './landxml-parser';
import { looksLikeJobXml } from './jobxml-parser';
import { looksLikeGsi } from './gsi-parser';
import { looksLikeRw5 } from './rw5-parser';

export type SurveyFormat = 'landxml' | 'jobxml' | 'gsi' | 'rw5' | 'csv' | 'unknown';

export interface FormatDetection {
  format: SurveyFormat;
  /** Why, in a sentence, for the import UI. A detection the user cannot understand is a detection
   *  they cannot overrule when it is wrong. */
  reason: string;
  /** Vendors known to produce this format, for the "we can read your instrument" answer. */
  vendors: string[];
}

const VENDORS: Record<SurveyFormat, string[]> = {
  landxml: ['Trimble', 'Topcon', 'Leica', 'GeoMax', 'Spectra Precision', 'Carlson', 'Civil 3D'],
  jobxml: ['Trimble'],
  gsi: ['Leica Geosystems', 'GeoMax'],
  rw5: ['Carlson', 'Topcon', 'Spectra Precision'],
  csv: ['any — column mapping required'],
  unknown: [],
};

/** Looks like a delimited coordinate file: several lines that are mostly numbers and separators. */
function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 20);
  if (lines.length < 2) return false;
  const numeric = lines.filter((l) => {
    const parts = l.split(/[,\t;|]/);
    if (parts.length < 3) return false;
    // At least three fields that parse as numbers — a point number and two coordinates.
    return parts.filter((p) => Number.isFinite(Number(p.trim()))).length >= 3;
  });
  return numeric.length >= Math.max(2, Math.floor(lines.length * 0.6));
}

export function detectSurveyFormat(text: string, filename?: string): FormatDetection {
  const ext = (filename?.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();

  // Content first, in specificity order. LandXML and JobXML are both XML, so both are checked before
  // anything generic — and JobXML's own check is more specific, so it goes first.
  if (looksLikeJobXml(text)) {
    return { format: 'jobxml', reason: 'Trimble JobXML — found a <JOBFile> or <PointRecord> element.', vendors: VENDORS.jobxml };
  }
  if (looksLikeLandXml(text)) {
    return { format: 'landxml', reason: 'LandXML — found a <LandXML> root element.', vendors: VENDORS.landxml };
  }
  if (looksLikeGsi(text)) {
    return { format: 'gsi', reason: 'Leica GSI — found word-index blocks (WI....±value).', vendors: VENDORS.gsi };
  }
  if (looksLikeRw5(text)) {
    return { format: 'rw5', reason: 'RW5 raw data — found record types (JB/MO/SP/OC/SS).', vendors: VENDORS.rw5 };
  }
  if (looksLikeCsv(text)) {
    return { format: 'csv', reason: 'Delimited coordinates — needs a column mapping before import.', vendors: VENDORS.csv };
  }

  // Extension as a last resort, and only to say what we EXPECTED — never to select a reader whose
  // content check just failed. `.xml` that is not LandXML or JobXML is some third thing.
  if (ext) {
    return {
      format: 'unknown',
      reason: `Could not recognise the contents. The .${ext} extension did not match any reader's format check, so no reader was chosen — importing it with the wrong one would produce points rather than an error.`,
      vendors: [],
    };
  }
  return { format: 'unknown', reason: 'Could not recognise this file as any supported survey format.', vendors: [] };
}

/** Every format this build can read, for the "does it work with my instrument?" question a firm asks
 *  before it signs up. Derived from the same table the detector uses, so the marketing answer and the
 *  code cannot drift — which is §1.3's lesson applied to a sales page. */
export function supportedFormats(): Array<{ format: SurveyFormat; vendors: string[] }> {
  return (['landxml', 'jobxml', 'rw5', 'gsi', 'csv'] as const).map((format) => ({ format, vendors: VENDORS[format] }));
}
