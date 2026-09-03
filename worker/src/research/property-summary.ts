// worker/src/research/property-summary.ts — the property, in depth, with every claim cited.
//
// > "the AI should review all results and determine which documents provide the most useful info
// >  and should create a full and in depth summary of the property using document link references"
//
// ── WHY THIS DID NOT EXIST ──────────────────────────────────────────────────────────────────────
//
// The generic pipeline writes a master validation report (Stage 6). The Bell path — the county
// the owner actually runs — set `masterReportText: null` and `finalSummary: autoSummary`, where
// autoSummary is five lines of field values ("Owner: …", "Property ID: …", "16 deed record(s)
// retrieved"). So the Summary tab of every Bell project showed a form, not a reading. Plan E2's
// premise ("the run produces no master report at all") was half right: the generic path has one,
// Bell has none. Found by the 2026-09-03 platform audit.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────────
//
// One model call over what the run already gathered — no new fetches, no page images. The
// sources are numbered [D1..], [P1..], [E1..], [A1..] and the model is told that a sentence
// without a citation is a sentence it must not write. The numbered source list is appended
// verbatim by CODE, not by the model, so a citation always resolves to a real instrument number
// or URL. The model also ranks the sources by usefulness (plan E1's ask) and names any that look
// unrelated to the parcel (plan E3's ask) — both are judgements a reviewer can check against the
// list.
//
// Bounded: one call, one model, a hard token ceiling, and the run's own budget gate at the call
// site. Never throws — a summary that could not be written must not fail a run that found the
// documents it would have summarised.

import Anthropic from '@anthropic-ai/sdk';
import { modelFor } from '../infra/model-router.js';
import { recordAmbientAiCall } from '../infra/usage.js';
import type { BellResearchResult } from '../counties/bell/types/research-result.js';

export interface SummarySource {
  /** [D3], [P1], [E2], [A4] */
  ref: string;
  kind: 'deed' | 'plat' | 'easement' | 'adjoiner' | 'gis' | 'fema' | 'txdot';
  label: string;
  /** Instrument number, plat name, parcel id — whatever identifies it at its source. */
  identity: string | null;
  url: string | null;
  /** What the run extracted from it, compacted for the prompt. */
  content: string;
}

const MAX_CONTENT_CHARS = 2_500;
const MAX_SOURCES = 60;

const clip = (s: string | null | undefined, n = MAX_CONTENT_CHARS): string => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)} …[clipped]` : t;
};

/** Number every document the run holds, in the order a surveyor would want to cite them. */
export function collectSummarySources(r: BellResearchResult): SummarySource[] {
  const out: SummarySource[] = [];

  r.plats.plats.forEach((p, i) => {
    const a = p.aiAnalysis;
    const content = a
      ? [
          a.narrative,
          a.lotDimensions.length ? `Lot dimensions: ${a.lotDimensions.join('; ')}` : '',
          a.bearingsAndDistances.length ? `Calls: ${a.bearingsAndDistances.join('; ')}` : '',
          a.monuments.length ? `Monuments: ${a.monuments.join('; ')}` : '',
          a.easements.length ? `Easements on plat: ${a.easements.join('; ')}` : '',
          a.curves.length ? `Curves: ${a.curves.join('; ')}` : '',
        ].filter(Boolean).join(' ')
      : '(plat retrieved; no readable analysis)';
    out.push({
      ref: `[P${i + 1}]`, kind: 'plat',
      label: `Plat: ${p.name}${p.date ? ` (${p.date})` : ''}`,
      identity: p.instrumentNumber, url: p.sourceUrl, content: clip(content),
    });
  });

  r.deedsAndRecords.records.forEach((d, i) => {
    const content = d.aiSummary
      ?? [d.legalDescription ? `Legal: ${d.legalDescription}` : '', d.grantor || d.grantee ? `${d.grantor ?? '?'} → ${d.grantee ?? '?'}` : '']
        .filter(Boolean).join(' ');
    out.push({
      ref: `[D${i + 1}]`, kind: 'deed',
      label: `${d.documentType || 'Deed'}${d.recordingDate ? ` recorded ${d.recordingDate}` : ''}${d.grantor && d.grantee ? ` — ${d.grantor} to ${d.grantee}` : ''}`,
      identity: d.instrumentNumber ?? (d.volume && d.page ? `Vol. ${d.volume}, Pg. ${d.page}` : null),
      url: d.sourceUrl, content: clip(content || '(deed retrieved; no readable text)'),
    });
  });

  r.easementsAndEncumbrances.easements.forEach((e, i) => {
    out.push({
      ref: `[E${i + 1}]`, kind: 'easement',
      label: `${e.type}${e.width ? `, ${e.width}` : ''}${e.location ? ` — ${e.location}` : ''}`,
      identity: e.instrumentNumber, url: e.sourceUrl, content: clip(e.description),
    });
  });

  const fema = r.easementsAndEncumbrances.fema;
  if (fema) {
    out.push({
      ref: '[F1]', kind: 'fema', label: 'FEMA flood determination', identity: null,
      url: (fema as { sourceUrl?: string | null }).sourceUrl ?? null,
      content: clip(`Flood zone ${fema.floodZone}${(fema as { inSFHA?: boolean }).inSFHA ? ' (Special Flood Hazard Area)' : ''}`),
    });
  }

  r.adjacentProperties.forEach((a, i) => {
    out.push({
      ref: `[A${i + 1}]`, kind: 'adjoiner',
      label: `Adjoiner to the ${a.direction}: ${a.ownerName}`,
      identity: a.propertyId, url: a.sourceUrl ?? null,
      content: clip([
        a.situsAddress ? `Situs ${a.situsAddress}` : '',
        a.acreage != null ? `${a.acreage} ac` : '',
        a.legalDescription ? `Legal: ${a.legalDescription}` : '',
        a.sharedBoundary ? `Shared boundary: ${a.sharedBoundary}` : '',
      ].filter(Boolean).join('; ')),
    });
  });

  return out.slice(0, MAX_SOURCES);
}

/** The list a reader sees under the summary. Written by code so every [ref] resolves. */
export function renderSourceList(sources: SummarySource[]): string {
  if (sources.length === 0) return '';
  const lines = sources.map((s) => {
    const id = s.identity ? ` — ${s.identity}` : '';
    const url = s.url ? ` — ${s.url}` : '';
    return `${s.ref} ${s.label}${id}${url}`;
  });
  return `\n\nSOURCES\n${lines.join('\n')}`;
}

function buildPrompt(r: BellResearchResult, sources: SummarySource[]): string {
  const p = r.property;
  const facts = [
    `Owner of record: ${p.ownerName || 'unknown'}`,
    `Appraisal district property ID: ${p.propertyId || 'unknown'}`,
    `Situs: ${p.situsAddress || 'unknown'}`,
    `Legal description (appraisal district): ${p.legalDescription || 'unknown'}`,
    `Acreage (appraisal district): ${p.acreage ?? 'unknown'}`,
  ].join('\n');

  const discrepancies = r.discrepancies.length
    ? r.discrepancies.map((d) =>
        `- [${d.severity}] ${d.category}: ${d.description} (${d.source1}: "${d.source1Value}" vs ${d.source2}: "${d.source2Value}") — ${d.aiRecommendation}`,
      ).join('\n')
    : '(none flagged by the run)';

  const src = sources.map((s) => `${s.ref} ${s.label}${s.identity ? ` — ${s.identity}` : ''}\n    ${s.content}`).join('\n');

  return `You are a Texas Registered Professional Land Surveyor writing the research summary a field crew will read before staking this tract. Everything below was retrieved by an automated run from Bell County sources; you are reviewing it, not adding to it.

PROPERTY (from the appraisal district)
${facts}

DISCREPANCIES THE RUN FLAGGED
${discrepancies}

NUMBERED SOURCES (what each one says, as extracted)
${src}

WRITE the summary in Markdown with exactly these sections:

## Property
## Chain of title
## Boundary and plat
## Easements, encumbrances and flood
## Adjoining owners
## Discrepancies and what to verify in the field
## Most useful sources
## Sources that may not belong

RULES — these are not stylistic:
1. Every sentence that states a fact about the property MUST end with one or more citations in the form [D1], [P2], [E1], [A3], [F1]. A sentence you cannot cite is a sentence you do not write. Never invent a citation that is not in the list above.
2. Where two sources disagree, say so and cite both; do not pick one silently.
3. "Most useful sources": rank the five most useful references for a boundary survey, best first, one line each, and say why.
4. "Sources that may not belong": list any source whose content does not appear to concern THIS tract (different survey/abstract, different subdivision, an adjoining tract's deed filed under the same owner, a personal-property account), with the reason. Write "None identified." if there are none.
5. Be exhaustive on calls, monuments, dimensions and recording references; be brief on everything else. Mark uncertain readings with [?].
6. Do not include a sources list — it is appended by the system.`;
}

export interface PropertySummaryOutcome {
  text: string | null;
  /** One sentence for the run log. */
  statement: string;
  model: string | null;
}

/**
 * Write the summary. Never throws.
 *
 * `apiKey` empty → no call, statement says so. Any failure → `text: null` with the reason.
 */
export async function writePropertySummary(
  r: BellResearchResult,
  apiKey: string,
  opts: { maxTokens?: number; client?: Anthropic } = {},
): Promise<PropertySummaryOutcome> {
  const sources = collectSummarySources(r);
  if (sources.length === 0) {
    return { text: null, statement: 'Property summary skipped — the run holds no documents to summarise.', model: null };
  }
  if (!apiKey && !opts.client) {
    return { text: null, statement: 'Property summary skipped — ANTHROPIC_API_KEY is not set.', model: null };
  }

  const model = modelFor('synthesize').model;
  const started = Date.now();
  try {
    const client = opts.client ?? new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 6000,
      messages: [{ role: 'user', content: buildPrompt(r, sources) }],
    });

    void recordAmbientAiCall('research/property-summary', model, {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    }, { sources: sources.length });

    const body = response.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
      .trim();
    if (!body) {
      return { text: null, statement: 'Property summary: the model returned no text.', model };
    }

    // A summary that cites nothing has ignored rule 1 and is worth less than the field list it
    // replaces. Kept, but the log says so, because a reviewer should know to distrust it.
    const cited = (body.match(/\[(?:D|P|E|A|F)\d+\]/g) ?? []).length;
    const text = body + renderSourceList(sources);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    return {
      text,
      model,
      statement: cited > 0
        ? `Property summary written: ${sources.length} source(s), ${cited} citation(s), ${secs}s.`
        : `Property summary written with NO citations (${sources.length} source(s), ${secs}s) — treat it as an unreviewed narrative.`,
    };
  } catch (err) {
    return {
      text: null,
      model,
      statement: `Property summary failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
