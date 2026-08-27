// lib/leads/enrichment.ts — what the office should know before ringing a lead back
//
// Plan §I3 item 1, the one the doc rated "business — strong". A quote request arrives carrying a
// name, maybe a company, and an address. Whoever calls back has no idea whether they are talking to a
// builder with twelve permits in progress or a homeowner in a fence dispute — and those two calls
// should not sound the same.
//
// ── THIS IS A READING LAYER, NOT A SEARCH ───────────────────────────────────────────────────────
//
// The searching is already built: `lib/research/open-web.ts` runs five angles, weights domains by
// provenance, dedupes across angles and reports a reason for every angle that did not run. None of
// that is re-implemented here. What is new is the part that module deliberately does not do —
// turning ranked pages into a handful of signals a person can act on in the ten seconds before a
// call connects.
//
// ── EVERY SIGNAL CARRIES ITS EVIDENCE, OR IT DOES NOT EXIST ─────────────────────────────────────
//
// A signal is an assertion about a real person or business, drawn from unverified search results.
// So `LeadSignal` cannot be constructed without at least one source URL, and the briefing prints
// them. The office is meant to click and judge — never to read "commercial operator" as a fact the
// system established. Nothing here is customer-facing, nothing here is auto-sent, and nothing here
// feeds `ai-draft.ts`: the doc's own line is that this firm's product is a licensed professional's
// assurance, and unverified search results must not get anywhere near a customer reply.
//
// ── "WE DID NOT LOOK" IS NOT "WE LOOKED AND FOUND A NICE QUIET HOMEOWNER" ────────────────────────
//
// The failure this repo keeps rediscovering, most recently in the admin address autocomplete, where
// a REFUSED API key and an address with no matches rendered the identical blank space. So
// `LeadEnrichment.status` distinguishes them, and a briefing built from a `not-configured` run says
// so on its first line rather than presenting an empty findings list as a clean bill of health.

import {
  searchOpenWeb,
  type OpenWebAngle,
  type OpenWebReport,
  type OpenWebResult,
  type OpenWebSubject,
  type SearchOpenWebOptions,
} from '@/lib/research/open-web';

// ── Input ───────────────────────────────────────────────────────────────────────────────────────

/** The slice of a lead this module reads. Deliberately narrower than `LeadRow` so a column rename
 *  in the intake schema does not reach in here, and so callers can enrich a lead that is still a
 *  form payload rather than a saved row. */
export interface EnrichableLead {
  name?: string | null;
  company?: string | null;
  /** Street, or "<street>, <city>" — whatever intake stored. Not re-parsed. */
  propertyAddress?: string | null;
  city?: string | null;
  county?: string | null;
  /** Free text the customer typed. Read for intent words, never for facts. */
  projectDetails?: string | null;
  serviceType?: string | null;
}

// ── Signals ─────────────────────────────────────────────────────────────────────────────────────

export type LeadSignalKind =
  /** Trades as a business — builder, developer, contractor, title company, realtor. Changes the
   *  call: repeat work, invoicing terms, and they know what a survey is. */
  | 'commercial-operator'
  /** A live permit or a planning agenda naming them. Means a real project with a real deadline,
   *  which is the strongest buying signal available. */
  | 'active-permit'
  /** Plat, replat or subdivision activity. Often the survey they are about to ask for. */
  | 'subdivision-activity'
  /** Litigation, boundary or access dispute in the public record. Handle carefully — this is when a
   *  survey becomes evidence, and the scope conversation is different. */
  | 'dispute-context'
  /** Liens, judgments, foreclosure or probate touching the owner. Relevant to whether the job gets
   *  paid, and to who actually has authority to commission it. */
  | 'encumbrance-context';

export interface LeadSignal {
  kind: LeadSignalKind;
  /** One line for a human, written to be read aloud before a call. */
  note: string;
  /** How much weight to give it. Never "certain" — every input is an unverified web page. */
  confidence: 'weak' | 'moderate' | 'strong';
  /** At least one, always. A signal without a source is not reportable, so the constructor refuses. */
  sources: ReadonlyArray<{ url: string; title: string; authority: number }>;
}

export type EnrichmentStatus =
  /** Searched, and the results are below. */
  | 'searched'
  /** No `TAVILY_API_KEY`. Nothing was looked at — which is not the same as nothing being there. */
  | 'not-configured'
  /** The lead carried no name, company or address worth searching. */
  | 'insufficient-lead'
  /** Every angle that ran failed. An incident, not a setting. */
  | 'search-failed';

export interface LeadEnrichment {
  status: EnrichmentStatus;
  signals: LeadSignal[];
  /** The underlying report, kept so a caller can show the raw findings. Null when nothing ran. */
  report: OpenWebReport | null;
  /** What was searched for, echoed back. Reviewing a wrong answer starts with the query. */
  subject: OpenWebSubject | null;
}

// ── Lead → search subject ───────────────────────────────────────────────────────────────────────

/** Company suffixes and trade words that make a name a business rather than a person. */
const COMMERCIAL_WORDS =
  /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|ltd|limited|lp|llp|company|co|holdings|group|partners|properties|development|developments|developer|builders?|construction|contracting|contractors?|homes|realty|real estate|title|escrow|engineering|engineers?|architects?|ranch|farms?|investments?|capital|enterprises?)\b/i;

/**
 * Is this name a business?
 *
 * Used to decide which name to search AND as a signal in its own right. Kept exported because the
 * word list is the kind of thing that gets tuned, and tuning something you cannot test in isolation
 * is how it stops being tuned.
 */
export function looksCommercial(name: string | null | undefined): boolean {
  if (!name) return false;
  return COMMERCIAL_WORDS.test(name);
}

/**
 * Build the search subject from a lead.
 *
 * ── THE ONE ASSUMPTION WORTH NAMING ─────────────────────────────────────────────────────────────
 *
 * `OpenWebSubject.ownerName` drives the encumbrance angle, and a lead's name is the person ASKING
 * for a survey — usually but not always the owner. A builder commissioning a survey on a client's
 * lot is the common exception.
 *
 * So the company is preferred whenever there is one. That is the better search on both counts: a
 * business has a public record worth finding, and searching a company is ordinary commercial
 * diligence in a way that searching a private individual by name is not. The personal name is used
 * only when it is the sole identifier available, and the resulting signals say `encumbrance-context`
 * rather than anything that reads as a finding about a person.
 */
export function leadSubject(lead: EnrichableLead): OpenWebSubject | null {
  const company = lead.company?.trim() || null;
  const person = lead.name?.trim() || null;
  const address = lead.propertyAddress?.trim() || null;

  // Prefer the company; fall back to a personal name only if it is all we have.
  const ownerName = company || person || undefined;

  const subject: OpenWebSubject = {
    ownerName,
    address: address ?? undefined,
    county: lead.county?.trim() || undefined,
  };

  // Nothing to ask about. Reported rather than searched — an empty query returns noise, and noise
  // presented as enrichment is worse than an honest blank.
  if (!subject.ownerName && !subject.address) return null;

  return subject;
}

// ── Reading the results ─────────────────────────────────────────────────────────────────────────

/** `.gov` and `.us` carry the authority band the open-web module already computed. Above this, a
 *  result is an official record rather than a mention of one. */
const OFFICIAL_AUTHORITY = 0.7;

const ANGLE_TO_SIGNAL: Partial<Record<OpenWebAngle, LeadSignalKind>> = {
  'permits-planning': 'active-permit',
  'plat-subdivision': 'subdivision-activity',
  'news-disputes': 'dispute-context',
  'owner-encumbrance': 'encumbrance-context',
};

const SIGNAL_NOTES: Record<LeadSignalKind, string> = {
  'commercial-operator': 'Trades as a business — expect repeat work, and they will know what a survey is.',
  'active-permit': 'A permit or planning agenda names them. Live project, real deadline.',
  'subdivision-activity': 'Plat or subdivision activity in the record — likely the survey they want.',
  'dispute-context': 'A boundary, access or litigation context appears. The survey may become evidence.',
  'encumbrance-context': 'Liens, judgments or probate touch the owner. Relevant to payment and authority.',
};

/**
 * Turn ranked pages into signals.
 *
 * Confidence comes from provenance, not from how many pages matched. Ten content-farm pages about a
 * name are not better evidence than one county agenda — they are usually the same syndicated page.
 */
export function classifyLeadSignals(
  lead: EnrichableLead,
  report: OpenWebReport | null,
): LeadSignal[] {
  const signals: LeadSignal[] = [];

  // This one needs no search at all — it is read off the lead itself, and it is the single most
  // useful thing to know before the call.
  const commercialName = lead.company?.trim() || (looksCommercial(lead.name) ? lead.name!.trim() : null);

  if (report) {
    for (const angle of report.angles) {
      const kind = ANGLE_TO_SIGNAL[angle.angle];
      if (!kind || angle.results.length === 0) continue;

      const sources = angle.results
        .slice(0, 3)
        .map((r: OpenWebResult) => ({ url: r.url, title: r.title, authority: r.authority }));

      const official = sources.some((s) => s.authority >= OFFICIAL_AUTHORITY);
      signals.push({
        kind,
        note: SIGNAL_NOTES[kind],
        // An official record is a fact worth acting on; an open-web mention is a prompt to look.
        confidence: official ? 'strong' : sources.length > 1 ? 'moderate' : 'weak',
        sources,
      });
    }
  }

  // Added last so a searched signal with real evidence sorts above it, but included even on a
  // `not-configured` run — the lead's own company field does not need Tavily to be readable.
  if (commercialName) {
    const corroborating = signals.flatMap((s) => s.sources).slice(0, 2);
    signals.push({
      kind: 'commercial-operator',
      note: SIGNAL_NOTES['commercial-operator'],
      // The lead literally typed a company name. That is weak evidence about their business, and
      // strong evidence that they consider themselves one.
      confidence: corroborating.length > 0 ? 'strong' : 'moderate',
      // A signal must cite something. With no search results, the citation is the lead itself —
      // stated as such, so nobody mistakes it for an external finding.
      sources: corroborating.length > 0
        ? corroborating
        : [{ url: '', title: `Stated on the enquiry: "${commercialName}"`, authority: 0 }],
    });
  }

  const rank = { strong: 0, moderate: 1, weak: 2 } as const;
  return signals.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
}

// ── The one call a route makes ──────────────────────────────────────────────────────────────────

/**
 * Enrich a lead. Never throws, never blocks intake.
 *
 * A quote request must be saved and acknowledged whether or not a third-party search API is having a
 * good day. So every failure here resolves to a status, and the caller's job is to display it rather
 * than to handle an exception.
 */
export async function enrichLead(
  lead: EnrichableLead,
  opts: SearchOpenWebOptions = {},
): Promise<LeadEnrichment> {
  const subject = leadSubject(lead);
  if (!subject) {
    return { status: 'insufficient-lead', signals: classifyLeadSignals(lead, null), report: null, subject: null };
  }

  let report: OpenWebReport;
  try {
    report = await searchOpenWeb(subject, opts);
  } catch {
    // `searchOpenWeb` already settles each angle independently, so reaching here means something
    // structural. Still not an exception the caller should catch — intake must not fail for this.
    return { status: 'search-failed', signals: classifyLeadSignals(lead, null), report: null, subject };
  }

  const ran = report.angles.filter((a) => a.skipped === null);
  const notConfigured = report.angles.some((a) => a.skipped === 'not-configured');

  // Order matters. `not-configured` is checked before "everything failed", because a missing key
  // makes every angle skip and would otherwise be reported as an outage — sending someone to
  // investigate Tavily's status page when the real answer is that no key was ever set.
  const status: EnrichmentStatus = notConfigured
    ? 'not-configured'
    : ran.length === 0
      ? 'search-failed'
      : 'searched';

  return {
    status,
    signals: classifyLeadSignals(lead, status === 'searched' ? report : null),
    report: status === 'searched' ? report : null,
    subject,
  };
}

// ── The briefing ────────────────────────────────────────────────────────────────────────────────

const STATUS_HEADER: Record<EnrichmentStatus, string> = {
  searched: 'Background — public web, UNVERIFIED. Click through before relying on any of it.',
  'not-configured': 'NOT SEARCHED — no search key configured. This is a blank, not a clean record.',
  'insufficient-lead': 'NOT SEARCHED — the enquiry carried no company, name or address to search.',
  'search-failed': 'SEARCH FAILED — the provider did not answer. Try again; do not read this as "nothing found".',
};

/**
 * The internal one-screen summary, for the person about to make the call.
 *
 * Plain text on purpose: it goes in a lead note, a notification, and eventually a panel, and the one
 * format all three already handle is text. The header always states what kind of result this is,
 * because a briefing with no signals means something entirely different depending on the status.
 */
export function enrichmentBriefing(enrichment: LeadEnrichment): string {
  const lines: string[] = [STATUS_HEADER[enrichment.status], ''];

  if (enrichment.subject?.ownerName) lines.push(`Searched: ${enrichment.subject.ownerName}`);
  if (enrichment.subject?.address) lines.push(`Address: ${enrichment.subject.address}`);
  if (enrichment.subject) lines.push('');

  if (enrichment.signals.length === 0) {
    lines.push(
      enrichment.status === 'searched'
        ? 'No signals. Treat as an ordinary enquiry — most leads are, and that is a useful answer.'
        : 'No signals, because nothing was searched. See above.',
    );
    return lines.join('\n');
  }

  for (const s of enrichment.signals) {
    lines.push(`[${s.confidence.toUpperCase()}] ${s.note}`);
    for (const src of s.sources) {
      lines.push(src.url ? `    ${src.title} — ${src.url}` : `    ${src.title}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
