// Is a document about THIS property, judged from what it says once it has been read?
//
// The clerk's deeds get a relevance check (`document-relevance-validator`) from their index rows. A
// document BOUGHT from TexasFile arrives with whatever the search returned: run 7 (2026-09-08) bought the
// row "whose legal description is blank — check it against the subject", filed it as "Deed — <the
// subject's owner> (Bell)", and nobody checked. Its pages say "5.71 acres in the John Lewis Survey,
// Abstract Number 512" — not Winnie Mae Addition, not this lot. After the review has READ a document
// its text is the evidence, and this is the check.
//
// Conservative on purpose: a verdict of `unrelated` needs the text to NAME a subdivision, survey or
// abstract, none of which is the subject's, while nothing else in it (address, parcel id, the subject's
// own subdivision) ties it back. Naming nothing is `undecided`, never a mark.

import { normaliseSubdivisionName } from '../services/texasfile-rows.js';

export interface SubjectKeys {
  subdivision?: string | null;
  survey?: string | null;
  abstract?: string | null;
  lot?: string | null;
  block?: string | null;
  propertyId?: string | null;
  /** Street number + street name, e.g. "1401 North East St". */
  address?: string | null;
}

export interface TextRelevanceVerdict {
  verdict: 'related' | 'unrelated' | 'undecided';
  reason: string;
  named: { subdivisions: string[]; surveys: string[]; abstracts: string[] };
}

const SUBDIVISION_SUFFIX = '(?:addition|subdivision|estates|acres|heights|place|park|village|ranch|hills|meadows|terrace)';
const STOP = /^(the|of|in|to|and|said|being|all|that|certain|lot|block|city|county|texas|records|plat)$/i;

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The run of name-like words (capitalised, not stop-words) at the END of a phrase, kept in order —
 *  "part of the John Lewis" → ["John", "Lewis"]; "of WINNIE MAE" → ["WINNIE", "MAE"]. */
function nameWords(phrase: string, max: number): string[] {
  const words = tidy(phrase).split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0 && out.length < max; i--) {
    const w = words[i];
    if (STOP.test(w) || !/^[A-Z][A-Za-z'.&\-]*$/.test(w)) break;
    out.unshift(w);
  }
  return out;
}

/** Every "<Name> Addition/Subdivision/…" the text names, as it names them. */
export function subdivisionsNamed(text: string): string[] {
  const out = new Set<string>();
  const re = new RegExp(`([A-Za-z][A-Za-z'.&\\- ]{1,40}?)\\s+${SUBDIVISION_SUFFIX}\\b`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // The name is the run of capitalised words just before the suffix ("part of the John Lewis" → "John Lewis").
    const words = nameWords(m[1], 4);
    if (words.length === 0) continue;
    out.add(tidy(`${words.join(' ')} ${m[0].trim().split(/\s+/).pop()}`));
  }
  return [...out];
}

/** Every "<Name> Survey" the text names. */
export function surveysNamed(text: string): string[] {
  const out = new Set<string>();
  const re = /([A-Za-z][A-Za-z'.&\- ]{1,40}?)\s+survey\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const words = nameWords(m[1], 3);
    if (words.length === 0) continue;
    // "on the ground survey", "actual survey" — not a land survey's name.
    if (/^(ground|actual|field|boundary|land|title|this|a|an)$/i.test(words[words.length - 1])) continue;
    out.add(tidy(words.join(' ')));
  }
  return [...out];
}

/** Every abstract number the text names. */
export function abstractsNamed(text: string): string[] {
  const out = new Set<string>();
  const re = /abstract\s*(?:no\.?|number|#)?\s*(\d{1,5})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1]);
  return [...out];
}

function normName(s: string): string {
  return normaliseSubdivisionName(s).replace(/\b(addition|subdivision|estates|acres|heights|place|park|village|ranch|hills|meadows|terrace|survey)\b/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function addressAppears(text: string, address: string | null | undefined): boolean {
  if (!address) return false;
  const m = address.match(/^\s*(\d+[A-Za-z]?)\s+(.+?)\s*$/);
  if (!m) return false;
  const num = m[1];
  const street = m[2].replace(/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|hwy|highway)\b\.?/gi, '').replace(/[^a-z0-9 ]/gi, ' ').trim().split(/\s+/)[0];
  if (!street) return false;
  return new RegExp(`\\b${num}\\b[^\\n]{0,40}\\b${street}\\b`, 'i').test(text);
}

export function textRelevanceVerdict(text: string, subject: SubjectKeys): TextRelevanceVerdict {
  const t = text ?? '';
  const named = { subdivisions: subdivisionsNamed(t), surveys: surveysNamed(t), abstracts: abstractsNamed(t) };
  const subjSub = subject.subdivision ? normName(subject.subdivision) : '';
  const subjSurvey = subject.survey ? normName(subject.survey) : '';
  const subjAbstract = (subject.abstract ?? '').replace(/\D/g, '');

  // Ties back to the subject: its subdivision, survey, abstract, parcel id or address named.
  const ties: string[] = [];
  if (subjSub && named.subdivisions.some((s) => normName(s) === subjSub)) ties.push(`names ${subject.subdivision}`);
  if (subjSurvey && named.surveys.some((s) => normName(s) === subjSurvey)) ties.push(`names the ${subject.survey} Survey`);
  if (subjAbstract && named.abstracts.includes(subjAbstract)) ties.push(`names Abstract ${subjAbstract}`);
  if (subject.propertyId && new RegExp(`\\b${subject.propertyId.replace(/\D/g, '')}\\b`).test(t) && subject.propertyId.replace(/\D/g, '').length >= 4) ties.push(`names parcel ${subject.propertyId}`);
  if (addressAppears(t, subject.address)) ties.push(`names ${subject.address}`);
  if (ties.length > 0) return { verdict: 'related', reason: ties.join('; '), named };

  const namesSomething = named.subdivisions.length + named.surveys.length + named.abstracts.length > 0;
  const subjectKnown = !!(subjSub || subjSurvey || subjAbstract);
  if (!namesSomething || !subjectKnown) {
    return { verdict: 'undecided', reason: namesSomething ? 'the subject has no subdivision, survey or abstract to compare against' : 'the text names no subdivision, survey or abstract', named };
  }
  const what = [
    named.subdivisions.length ? named.subdivisions.slice(0, 3).join(', ') : '',
    named.surveys.length ? `${named.surveys.slice(0, 3).join(', ')} Survey` : '',
    named.abstracts.length ? `Abstract ${named.abstracts.slice(0, 3).join(', ')}` : '',
  ].filter(Boolean).join('; ');
  const subjectIs = subject.subdivision ?? (subject.survey ? `the ${subject.survey} Survey` : `Abstract ${subject.abstract}`);
  return { verdict: 'unrelated', reason: `the document names ${what}; the subject is ${subjectIs}`, named };
}

/** Document types whose text describes land — the only ones a text verdict applies to. */
export const TEXT_RELEVANCE_TYPES = new Set(['deed', 'easement', 'plat', 'right_of_way', 'row', 'affidavit', 'lien', 'other_instrument']);

/**
 * After the review has read a document: mark it `unrelated` when its text says so. Idempotent — a
 * row that already carries a relevance verdict is left alone. Logs what it decided and why.
 */
export async function assessRelevanceAfterRead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  projectId: string,
  documentId: string,
  log: (line: string) => void,
): Promise<TextRelevanceVerdict | null> {
  const { data: doc } = await sb.from('research_documents')
    .select('id, document_label, document_type, extracted_text, relevance')
    .eq('id', documentId).single();
  if (!doc || doc.relevance) return null;
  if (!TEXT_RELEVANCE_TYPES.has(String(doc.document_type ?? ''))) return null;
  const text = String(doc.extracted_text ?? '');
  if (text.length < 200) return null;

  const { data: project } = await sb.from('research_projects')
    .select('property_address, parcel_id, analysis_metadata')
    .eq('id', projectId).single();
  const result = (project?.analysis_metadata?.result ?? {}) as Record<string, unknown>;
  const subject: SubjectKeys = {
    subdivision: (result.subdivisionName as string | null) ?? null,
    survey: (result.surveyName as string | null) ?? null,
    abstract: (result.abstractNumber as string | null) ?? null,
    lot: (result.lotNumber as string | null) ?? null,
    block: (result.blockNumber as string | null) ?? null,
    propertyId: (result.propertyId as string | null) ?? project?.parcel_id ?? null,
    address: ((result.situsAddress as string | null) ?? project?.property_address ?? null)?.split(',')[0] ?? null,
  };
  const v = textRelevanceVerdict(text, subject);
  const label = String(doc.document_label ?? documentId).slice(0, 70);
  if (v.verdict === 'unrelated') {
    await sb.from('research_documents').update({
      relevance: 'unrelated',
      relevance_classification: { by: 'text-relevance', at: new Date().toISOString(), reason: v.reason, named: v.named },
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    log(`Relevance after reading "${label}": UNRELATED — ${v.reason}`);
  } else {
    log(`Relevance after reading "${label}": ${v.verdict} — ${v.reason}`);
  }
  return v;
}
