// worker/src/research/reading-pass.ts — every document found is read, summarised, and if not read,
// queued and named. The property summary is written at the end of every run.
//
// > "We need to make sure that OCR runs on each image and on each document found and that it uses
// >  the methods we built to split up the document into multiple tiles and zooms in and reviews
// >  each one and fully analyzes everything and then produces the summary and results. This needs
// >  to happen to every single file that is found in a run."
// > "I want you to build the analysis and review and summary builder into the platform so that it
// >  will always happen on any given run."                                — the owner, 2026-09-04
//
// ── WHAT WAS TRUE BEFORE ────────────────────────────────────────────────────────────────────────
//
// The tiled, zooming reader existed (`adaptiveVisionOcr`) and was wired to the post-run re-read —
// which ran only `if (!ceilingHit)`. Every run on 1512 Chisholm Trail hit its ceiling in Phase 2,
// so the re-read never ran, Phase 3 never ran, and the library showed it: 60 documents, 10 with
// text, none with a summary, no data points. The reader was real; the guarantee was not.
//
// ── THE GUARANTEE ───────────────────────────────────────────────────────────────────────────────
//
//   1. The reading pass runs at the end of EVERY run, ceiling or no ceiling, under its own
//      allowance (a slice of the ceiling held for it) and the run's COST limit. The wall-clock
//      ceiling bounds the searching; it does not cancel the reading of what the searching found.
//   2. Documents are read in the order a surveyor would read them: the subject's deeds, the plats,
//      easements and restrictions, then the rest — and every page, not the first five.
//   3. Each document read gets a summary, from the same text, in the same pass.
//   4. What the allowance does not reach is marked `queued` and counted; the run summary says
//      "read N, queued K", and the next run on the project reads the queue before it searches.
//   5. The property summary is written at the end of every run from the library — every document
//      with text, cited — unless the run already wrote a richer one.

import Anthropic from '@anthropic-ai/sdk';
import type { FiledDocument } from './reanalyze-documents.js';
import { writePropertySummary, type SummaryInput, type SummarySource } from './property-summary.js';
import { modelFor } from '../infra/model-router.js';
import { recordAmbientAiCall } from '../infra/usage.js';

// ── Order ───────────────────────────────────────────────────────────────────────────────────────

/** Lower reads first. The subject's own conveyances decide the boundary; a plat draws it; an
 *  easement burdens it; everything else is context. */
export function readingRank(doc: { document_type?: string | null; document_label?: string | null }): number {
  const t = `${doc.document_type ?? ''} ${doc.document_label ?? ''}`;
  if (/deed of trust|lien|release|assignment|ucc|mechanic/i.test(t)) return 4;
  if (/deed|warranty|conveyance|quitclaim/i.test(t)) return 0;
  if (/plat|subdivision/i.test(t)) return 1;
  if (/easement|right.?of.?way|restrict|covenant|dedicat|amend/i.test(t)) return 2;
  if (/survey|field.?notes|drawing|gis_map|aerial|oblique|street/i.test(t)) return 3;
  return 5;
}

export function orderForReading<T extends { document_type?: string | null; document_label?: string | null }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => readingRank(a) - readingRank(b));
}

// ── Allowance ───────────────────────────────────────────────────────────────────────────────────

/** How long the reading pass may run after the search: 30% of the ceiling, never under two
 *  minutes nor over eight; three minutes when there is no ceiling to take a share of. */
export function readingAllowanceMs(limitMs: number | null | undefined): number {
  if (!Number.isFinite(limitMs) || !limitMs || limitMs <= 0) return 3 * 60_000;
  return Math.max(2 * 60_000, Math.min(8 * 60_000, Math.round(limitMs * 0.3)));
}

// ── Per-document summary ────────────────────────────────────────────────────────────────────────

const SUMMARY_MAX_CHARS = 12_000;

/** One short summary per document, from the text just read. Cheap tier: the text is already
 *  extracted; this is reading, not seeing. */
export async function summariseDocumentText(
  doc: { id: string; document_type?: string | null; document_label?: string | null },
  text: string,
  apiKey: string,
  opts: { client?: Anthropic } = {},
): Promise<string | null> {
  const body = text.replace(/\s+/g, ' ').trim();
  if (body.length < 40) return null;
  const choice = modelFor('classify');
  const client = opts.client ?? new Anthropic({ apiKey });
  const prompt =
    `You are summarising one recorded land document for a Texas land surveyor. Document: ` +
    `"${doc.document_label ?? doc.document_type ?? doc.id}" (type: ${doc.document_type ?? 'unknown'}).\n\n` +
    `Write at most 120 words, plain prose, no headings: the parties (grantor → grantee) if any, the ` +
    `instrument/recording reference and date if present, what the document conveys or affects, the ` +
    `legal description in brief (lot/block/subdivision or abstract/survey, acreage), and any OTHER ` +
    `instruments, plats, surveys or volume/page references it cites. Say "not stated" for what is ` +
    `absent; never invent. If the text is unreadable or not a land record, say so in one sentence.\n\n` +
    `TEXT:\n${body.slice(0, SUMMARY_MAX_CHARS)}`;
  const resp = await client.messages.create({
    model: choice.model,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const out = resp.content.filter((c): c is Anthropic.TextBlock => c.type === 'text').map((c) => c.text).join('\n').trim();
  await recordAmbientAiCall('document-summary', choice.model, { input: resp.usage.input_tokens, output: resp.usage.output_tokens }, { documentId: doc.id }).catch(() => 0);
  return out || null;
}

// ── Summarise every document that has text but no summary ────────────────────────────────────────
//
// The re-reader only reads (and so only summarises) documents whose text is missing or suspect.
// A document read cleanly on an earlier run keeps its text and is rightly skipped by the reader —
// but the owner asked for a summary of EVERY file, and a clean read with no summary is a file with
// no summary. This sweep gives each one a summary from the text already on the row, under the same
// cost budget, so "a summary for every file" holds whether the text was read this run or last.

export interface SummariseSweepReport {
  summarised: number;
  considered: number;
  statement: string;
}

export async function summariseUnsummarisedDocuments(
  supabase: { from: (t: string) => any },
  projectId: string,
  apiKey: string,
  mayContinue: () => boolean,
  log: (line: string) => void,
): Promise<SummariseSweepReport> {
  if (!apiKey) return { summarised: 0, considered: 0, statement: 'No API key — no summaries written.' };
  const { data } = await supabase.from('research_documents')
    .select('id, document_type, document_label, extracted_text, analysis_metadata')
    .eq('research_project_id', projectId)
    .is('duplicate_of', null);
  const rows = ((data ?? []) as Array<{ id: string; document_type: string | null; document_label: string | null; extracted_text: string | null; analysis_metadata: { aiSummary?: string | null } | null }>)
    .filter((d) => (d.extracted_text ?? '').trim().length >= 40 && !d.analysis_metadata?.aiSummary);
  const ordered = orderForReading(rows);
  let summarised = 0;
  for (const d of ordered) {
    if (!mayContinue()) { log(`Summary sweep stopped — the run reached its cost limit; ${ordered.length - summarised} document(s) still to summarise.`); break; }
    try {
      const summary = await summariseDocumentText(d, d.extracted_text ?? '', apiKey);
      if (!summary) continue;
      const { error } = await supabase.from('research_documents')
        .update({ analysis_metadata: { ...(d.analysis_metadata ?? {}), aiSummary: summary, summarisedAt: new Date().toISOString() }, processing_status: 'analyzed', updated_at: new Date().toISOString() })
        .eq('id', d.id);
      if (!error) summarised++;
      else log(`  ${d.document_label ?? d.id}: summary not saved — ${error.message}`);
    } catch (err) {
      log(`  ${d.document_label ?? d.id}: summary failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const statement = `Summary sweep: ${summarised} of ${ordered.length} document(s) with text but no summary now summarised.`;
  log(statement);
  return { summarised, considered: ordered.length, statement };
}

// ── The property summary, from the library ──────────────────────────────────────────────────────

export interface LibraryDocRow {
  id: string;
  document_type: string | null;
  document_label: string | null;
  recording_info: string | null;
  source_url: string | null;
  extracted_text: string | null;
  analysis_metadata: { aiSummary?: string | null } | null;
}

export interface ProjectFacts {
  property_address?: string | null;
  county?: string | null;
  parcel_id?: string | null;
  legal_description_summary?: string | null;
  owner_name?: string | null;
  acreage?: number | null;
}

/** Every document with text becomes a cited source; the facts the project holds become facts. */
export function summaryInputFromLibrary(facts: ProjectFacts, docs: LibraryDocRow[]): SummaryInput {
  const sources: SummarySource[] = [];
  let n = 0;
  for (const d of docs) {
    const summary = d.analysis_metadata?.aiSummary ?? null;
    const text = (d.extracted_text ?? '').trim();
    if (!summary && !text) continue;
    const kind: SummarySource['kind'] = /plat/i.test(`${d.document_type} ${d.document_label}`) ? 'plat'
      : /easement|right.?of.?way|restrict/i.test(`${d.document_type} ${d.document_label}`) ? 'easement'
        : /deed/i.test(`${d.document_type} ${d.document_label}`) ? 'deed'
          : /gis_map|aerial/i.test(d.document_type ?? '') ? 'gis' : 'document';
    sources.push({
      ref: `[${++n}]`,
      kind,
      label: d.document_label ?? d.document_type ?? d.id,
      identity: d.recording_info ?? null,
      url: d.source_url ?? null,
      content: summary ? `${summary}\n\n${text.slice(0, 1_500)}` : text.slice(0, 2_500),
    });
  }
  const factLines: string[] = [];
  if (facts.property_address) factLines.push(`Situs / input address: ${facts.property_address}`);
  if (facts.county) factLines.push(`County: ${facts.county}`);
  if (facts.parcel_id) factLines.push(`Appraisal district property ID: ${facts.parcel_id}`);
  if (facts.owner_name) factLines.push(`Owner of record (appraisal district): ${facts.owner_name}`);
  if (facts.legal_description_summary) factLines.push(`Legal description: ${facts.legal_description_summary}`);
  if (facts.acreage != null) factLines.push(`Acreage (appraisal district): ${facts.acreage}`);
  return { facts: factLines, discrepancies: [], sources };
}

export async function writeRunSummaryFromLibrary(
  supabase: { from: (t: string) => any },
  projectId: string,
  apiKey: string,
  log: (line: string) => void,
): Promise<{ written: boolean; statement: string }> {
  const { data: project } = await supabase.from('research_projects')
    .select('property_address, county, parcel_id, legal_description_summary, analysis_metadata')
    .eq('id', projectId).single();
  const meta = (project?.analysis_metadata ?? {}) as Record<string, unknown>;
  const result = (meta.result ?? {}) as Record<string, unknown>;
  const existing = typeof result.masterReportText === 'string' ? result.masterReportText.trim() : '';
  if (existing.length > 200) {
    return { written: false, statement: `Property summary already written by the run (${existing.length} chars) — kept.` };
  }
  const { data: docs } = await supabase.from('research_documents')
    .select('id, document_type, document_label, recording_info, source_url, extracted_text, analysis_metadata')
    .eq('research_project_id', projectId)
    .is('duplicate_of', null);
  const prop = (result.property ?? {}) as Record<string, unknown>;
  const input = summaryInputFromLibrary({
    property_address: project?.property_address ?? null,
    county: project?.county ?? null,
    parcel_id: project?.parcel_id ?? (typeof prop.propertyId === 'string' ? prop.propertyId : null),
    legal_description_summary: project?.legal_description_summary ?? (typeof prop.legalDescription === 'string' ? prop.legalDescription : null),
    owner_name: typeof prop.ownerName === 'string' ? prop.ownerName : null,
    acreage: typeof prop.acreage === 'number' ? prop.acreage : null,
  }, (docs ?? []) as LibraryDocRow[]);
  const outcome = await writePropertySummary(input, apiKey);
  if (!outcome.text) {
    log(outcome.statement);
    return { written: false, statement: outcome.statement };
  }
  const { error } = await supabase.from('research_projects')
    .update({
      analysis_metadata: {
        ...meta,
        result: { ...result, masterReportText: outcome.text, finalSummary: outcome.text, summaryWrittenFrom: 'library', summaryModel: outcome.model, summaryWrittenAt: new Date().toISOString() },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
  if (error) {
    log(`Property summary written (${outcome.text.length} chars) but could not be saved: ${error.message}`);
    return { written: false, statement: `Property summary could not be saved: ${error.message}` };
  }
  const statement = `Property summary written from the library: ${input.sources.length} source(s) cited, ${outcome.text.length} chars.`;
  log(statement);
  return { written: true, statement };
}
