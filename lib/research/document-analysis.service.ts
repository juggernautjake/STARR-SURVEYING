// lib/research/document-analysis.service.ts — Deep AI analysis of legal descriptions and plats
// Runs specialized AI prompts that extract every detail from a document beyond what the standard
// DATA_EXTRACTOR pipeline captures. Designed for survey-quality comprehension.

import { callAI } from './ai-client';
import { fetchBoundaryCalls } from './boundary-fetch.service';
import type {
  DeepDocumentAnalysis,
  LegalDescriptionAnalysis,
  PlatAnalysis,
  DocumentType,
} from '@/types/research';
import type { BoundaryFetchRequest } from '@/types/research';

// Document types that should use the legal-description analyzer
const LEGAL_DESCRIPTION_TYPES = new Set<DocumentType>([
  'deed',
  'legal_description',
  'metes_and_bounds',
  'county_record',
  'appraisal_record',
  'field_notes',
  'easement',
  'title_commitment',
]);

// Document types that should use the plat analyzer
const PLAT_TYPES = new Set<DocumentType>([
  'plat',
  'subdivision_plat',
  'survey',
]);

/** Choose the analysis type for the document */
function resolveAnalysisType(
  documentType: DocumentType | null | undefined,
): 'legal_description' | 'plat' | 'unsupported' {
  if (!documentType) return 'legal_description'; // default for unknown
  if (PLAT_TYPES.has(documentType)) return 'plat';
  if (LEGAL_DESCRIPTION_TYPES.has(documentType)) return 'legal_description';
  return 'legal_description'; // reasonable default for other text docs
}

// ── Legal Description Analyzer ────────────────────────────────────────────────

export async function analyzeLegalDescription(
  text: string,
  context?: { documentLabel?: string; documentType?: string },
): Promise<LegalDescriptionAnalysis> {
  const userContent = [
    context?.documentType ? `Document type: ${context.documentType}` : '',
    context?.documentLabel ? `Document label: ${context.documentLabel}` : '',
    '',
    'DOCUMENT TEXT:',
    text.substring(0, 18000), // Claude 200K context — generous but not unbounded
  ].filter(Boolean).join('\n');

  const result = await callAI({
    promptKey: 'LEGAL_DESCRIPTION_ANALYZER',
    userContent,
    maxTokens: 8192,
    maxRetries: 2,
    timeoutMs: 120_000,
  });

  return result.response as LegalDescriptionAnalysis;
}

// ── Plat Analyzer ─────────────────────────────────────────────────────────────

export async function analyzePlat(
  text: string,
  context?: { documentLabel?: string; documentType?: string },
): Promise<PlatAnalysis> {
  const userContent = [
    context?.documentType ? `Document type: ${context.documentType}` : '',
    context?.documentLabel ? `Document label: ${context.documentLabel}` : '',
    '',
    'PLAT DOCUMENT TEXT:',
    text.substring(0, 18000),
  ].filter(Boolean).join('\n');

  const result = await callAI({
    promptKey: 'PLAT_ANALYZER',
    userContent,
    maxTokens: 8192,
    maxRetries: 2,
    timeoutMs: 120_000,
  });

  return result.response as PlatAnalysis;
}

// ── HTML Utility ─────────────────────────────────────────────────────────────

/** Strip HTML tags, script/style blocks, and decode common entities. */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n').trim();
}

const SOURCE_FETCH_TIMEOUT_MS = 20_000;

/**
 * Source-aware content fetcher for property-search documents.
 * Uses the best available strategy for each known portal type,
 * falling back to generic HTML fetch for unknown sources.
 *
 * Returns cleaned text ready for AI analysis, or null if fetch failed.
 */
export async function fetchSourceContent(
  sourceUrl: string,
  opts: { propertyId?: string; address?: string } = {},
): Promise<{ text: string; method: string } | null> {
  let parsedUrl: URL;
  try { parsedUrl = new URL(sourceUrl); } catch { return null; }
  const host = parsedUrl.hostname.toLowerCase();

  // ── TrueAutomation JSON API ───────────────────────────────────────────────
  if (host.includes('trueautomation.com')) {
    const cid = parsedUrl.searchParams.get('cid');
    const propId = parsedUrl.searchParams.get('prop_id') ?? opts.propertyId;
    if (cid && propId) {
      try {
        const apiUrl = `https://propaccess.trueautomation.com/clientdb/api/v1/app/properties` +
          `?cid=${encodeURIComponent(cid)}&prop_id=${encodeURIComponent(propId)}`;
        const res = await fetch(apiUrl, {
          signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
        });
        if (res.ok) {
          const data = await res.json() as Record<string, unknown>;
          const d = (Array.isArray(data) ? data[0] : (data?.data ?? data)) as Record<string, unknown> | null;
          if (d) {
            const parts = [
              d.owner_name    ? `Owner: ${d.owner_name}` : '',
              (d.situs_num ?? d.situs_street) ? `Address: ${[d.situs_num, d.situs_street, d.situs_city, d.situs_state].filter(Boolean).join(' ')}` : '',
              d.legal_desc    ? `LEGAL DESCRIPTION:\n${d.legal_desc}` : '',
              d.land_acres != null ? `Acreage: ${d.land_acres} acres` : '',
              d.geo_id        ? `Geo ID: ${d.geo_id}` : '',
              (d.deed_vol && d.deed_pg) ? `Deed Reference: Vol. ${d.deed_vol}, Pg. ${d.deed_pg}` : '',
              d.abs_name      ? `Abstract: ${d.abs_name}` : '',
              d.subdv_name    ? `Subdivision: ${d.subdv_name}` : '',
            ].filter(Boolean);
            if (parts.length > 1) return { text: parts.join('\n'), method: 'trueautomation-api' };
          }
        }
      } catch { /* fall through */ }
    }
  }

  // ── eSearch CAD property view page ───────────────────────────────────────
  if (host.includes('esearch.') && parsedUrl.pathname.toLowerCase().includes('/property/view/')) {
    try {
      const res = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
        headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
      });
      if (res.ok) {
        const text = stripHtmlToText(await res.text());
        if (text.length > 200) return { text: text.substring(0, 25000), method: 'esearch-html' };
      }
    } catch { /* fall through */ }
  }

  // ── publicsearch.us instruments API ──────────────────────────────────────
  if (host.includes('publicsearch.us')) {
    const q = parsedUrl.searchParams.get('q') ?? opts.propertyId;
    if (q) {
      const origin = parsedUrl.origin;
      for (const ep of [
        `${origin}/api/instruments?searchText=${encodeURIComponent(q)}&pageSize=5`,
        `${origin}/api/documents?search=${encodeURIComponent(q)}&limit=5`,
        `${origin}/instruments?search=index,fullText&q=${encodeURIComponent(q)}`,
      ]) {
        try {
          const res = await fetch(ep, {
            signal: AbortSignal.timeout(15_000),
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
          });
          if (!res.ok) continue;
          if (!(res.headers.get('content-type') ?? '').includes('application/json')) continue;
          const text = JSON.stringify(await res.json(), null, 2).substring(0, 25000);
          if (text.length > 50) return { text, method: 'publicsearch-api' };
        } catch { /* try next */ }
      }
    }
  }

  // ── Generic HTML fetch (any portal) ──────────────────────────────────────
  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
      headers: { 'Accept': 'text/html,application/json,*/*', 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    if (ct.includes('application/json')) {
      if (raw.length > 50) return { text: raw.substring(0, 25000), method: 'json-fetch' };
    }
    if (ct.includes('text/html')) {
      const text = stripHtmlToText(raw);
      if (text.length > 100) return { text: text.substring(0, 25000), method: 'html-fetch' };
    }
  } catch { /* fall through */ }

  return null;
}

/**
 * Build a formatted text block from a boundary fetch result.
 * Used when deep-analyze runs the boundary fetch pipeline to get legal description.
 */
export function buildBoundaryFetchText(result: Awaited<ReturnType<typeof fetchBoundaryCalls>>): string {
  const parts: string[] = [];
  if (result.property?.owner_name)      parts.push(`Owner: ${result.property.owner_name}`);
  if (result.property?.property_address) parts.push(`Address: ${result.property.property_address}`);
  if (result.property?.acreage)         parts.push(`Acreage: ${result.property.acreage} acres`);
  if (result.property?.deed_reference)  parts.push(`Deed Reference: ${result.property.deed_reference}`);
  if (result.property?.abstract)        parts.push(`Abstract: ${result.property.abstract}`);
  if (result.property?.subdivision)     parts.push(`Subdivision: ${result.property.subdivision}`);
  if (result.legal_description) {
    parts.push('');
    parts.push('LEGAL DESCRIPTION:');
    parts.push(result.legal_description);
  }
  return parts.filter(Boolean).join('\n');
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run a deep AI analysis on a document's extracted text.
 * Automatically selects the best analyzer based on document type.
 *
 * - Legal descriptions, deeds, metes-and-bounds → LEGAL_DESCRIPTION_ANALYZER
 * - Plats, subdivision plats, survey plats → PLAT_ANALYZER
 *
 * Returns a structured `DeepDocumentAnalysis` object.
 */
export async function deepAnalyzeDocument(
  documentId: string,
  extractedText: string,
  documentType: DocumentType | null | undefined,
  documentLabel?: string | null,
): Promise<DeepDocumentAnalysis> {
  const analysisType = resolveAnalysisType(documentType);

  if (analysisType === 'unsupported') {
    return {
      document_id: documentId,
      document_type: documentType ?? 'other',
      analysis_type: 'unsupported',
      analyzed_at: new Date().toISOString(),
      error: `Document type "${documentType}" is not supported by the deep analyzer. Supported types: deeds, legal descriptions, metes-and-bounds, plats, subdivision plats, surveys.`,
    };
  }

  const context = {
    documentLabel: documentLabel ?? undefined,
    documentType: documentType ?? undefined,
  };

  try {
    if (analysisType === 'plat') {
      const plat = await analyzePlat(extractedText, context);
      return {
        document_id: documentId,
        document_type: documentType ?? 'plat',
        analysis_type: 'plat',
        plat,
        analyzed_at: new Date().toISOString(),
      };
    } else {
      const legal_description = await analyzeLegalDescription(extractedText, context);
      return {
        document_id: documentId,
        document_type: documentType ?? 'legal_description',
        analysis_type: 'legal_description',
        legal_description,
        analyzed_at: new Date().toISOString(),
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      document_id: documentId,
      document_type: documentType ?? 'other',
      analysis_type: analysisType,
      analyzed_at: new Date().toISOString(),
      error: message,
    };
  }
}
