// lib/research/document-analysis.service.ts — Deep AI analysis of legal descriptions and plats
// Runs specialized AI prompts that extract every detail from a document beyond what the standard
// DATA_EXTRACTOR pipeline captures. Designed for survey-quality comprehension.

import { callAI } from './ai-client';
import type {
  DeepDocumentAnalysis,
  LegalDescriptionAnalysis,
  PlatAnalysis,
  DocumentType,
} from '@/types/research';

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
