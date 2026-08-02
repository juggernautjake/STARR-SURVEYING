// lib/research/report-card.ts — what did this run actually achieve, per dollar (plan R30).
//
// ── THE POINT ───────────────────────────────────────────────────────────────────────────────────
//
// The owner's requirement is "as cheap but as effective as possible". Neither half has been a number
// so far. R4 made spend measurable, R5 made the budget enforceable, R22 put both on a screen — but
// nothing said whether a run that cost $4.20 did more than one that cost $1.10, so there was no way
// to tell a cheap run from a thin one.
//
// ── WHAT WE REFUSE TO SCORE ─────────────────────────────────────────────────────────────────────
//
// The plan asks for "facts extracted vs expected for that property type". **There is no baseline.**
// Nobody has established what a 40-acre rural tract in Bell County should yield, and inventing a
// number would produce a score that looks objective and means nothing — the exact failure this whole
// document has been closing everywhere else.
//
// So the card scores what is actually measurable — sources reached against sources registered,
// evidence and review coverage, cost per fact — and states plainly that the fact-count target is
// unknown until the golden set exists (§4.3, owner). A missing measurement said out loud is worth
// more than a fabricated one.

export interface RunFacts {
  runId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  costUsd: number;
  paidPages: number;
  limits: { maxMinutes?: number; maxUsd?: number } | null;
  skippedWork: Array<{ what?: string; reason?: string }>;
  budgetSummary: string | null;
}

export interface RunContent {
  /** Documents retrieved in this run. */
  documents: number;
  /** Of those, how many were unreadable (R18) — a retrieved document nobody can read is not a source
   *  reached, and counting it as one is how a thin run scores well. */
  unreadableDocuments: number;
  /** Site adapters registered for this county — the denominator for "sources reached". */
  sourcesRegistered: number;
  sourcesReached: number;
  facts: number;
  /** Facts with a document, page or quote behind them (R17). */
  factsWithEvidence: number;
  /** Facts a person has checked (R23). */
  factsReviewed: number;
  conflicts: number;
}

export interface ReportCard {
  runId: string;
  wallClockMinutes: number | null;
  costUsd: number;
  /** The "cheap but effective" number. Null when nothing was extracted — a divide-by-zero rendered
   *  as $0.00 would make the emptiest run look like the most efficient one. */
  costPerFact: number | null;
  costPerSourceReached: number | null;
  /** 0–1, or null when the denominator is unknown. Null is not zero. */
  sourceCoverage: number | null;
  evidenceRate: number | null;
  reviewRate: number | null;
  facts: number;
  conflicts: number;
  skipped: Array<{ what: string; reason: string }>;
  /** Everything this card deliberately does NOT claim. */
  notMeasured: string[];
  headline: string;
  /** True when the run stopped early or dropped work — such a run must never read as a good one. */
  truncated: boolean;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;
}

export function buildReportCard(run: RunFacts, content: RunContent): ReportCard {
  const wallClockMinutes = run.finishedAt
    ? Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 60_000)
    : null;

  const skipped = (run.skippedWork ?? []).map((s) => ({
    what: s.what ?? 'unnamed work',
    reason: s.reason ?? 'no reason recorded',
  }));

  const truncated = skipped.length > 0 || !!run.budgetSummary || run.status === 'interrupted';

  // Divide-by-zero would make the emptiest run the most efficient one, so these stay null.
  const costPerFact = content.facts > 0 ? Number((run.costUsd / content.facts).toFixed(4)) : null;
  const costPerSourceReached = content.sourcesReached > 0
    ? Number((run.costUsd / content.sourcesReached).toFixed(4))
    : null;

  const notMeasured: string[] = [
    'How many facts this property SHOULD have yielded. No baseline exists for a property type, so ' +
    'a low fact count here is not evidence of a poor run — nor of a good one.',
  ];
  if (content.sourcesRegistered === 0) {
    notMeasured.push(
      'Source coverage: no adapters are registered for this county, so "reached 3 of ?" has no denominator.',
    );
  }
  if (content.unreadableDocuments > 0) {
    notMeasured.push(
      `${content.unreadableDocuments} retrieved document(s) could not be read, so their contents are ` +
      'absent from every count on this card.',
    );
  }

  const headline = truncated
    ? `Run stopped short: ${skipped.length} piece(s) of work were skipped` +
      (run.budgetSummary ? ` (${run.budgetSummary})` : '') +
      `. ${content.facts} fact(s) for $${run.costUsd.toFixed(2)} — do not read this as a complete run.`
    : `${content.facts} fact(s) and ${content.conflicts} conflict(s) from ${content.sourcesReached} source(s) ` +
      `in ${wallClockMinutes ?? '?'} minutes for $${run.costUsd.toFixed(2)}` +
      (costPerFact != null ? ` — $${costPerFact.toFixed(3)} per fact.` : '.');

  return {
    runId: run.runId,
    wallClockMinutes,
    costUsd: run.costUsd,
    costPerFact,
    costPerSourceReached,
    sourceCoverage: ratio(content.sourcesReached, content.sourcesRegistered),
    evidenceRate: ratio(content.factsWithEvidence, content.facts),
    reviewRate: ratio(content.factsReviewed, content.facts),
    facts: content.facts,
    conflicts: content.conflicts,
    skipped,
    notMeasured,
    headline,
    truncated,
  };
}

// ── Comparing two runs ──────────────────────────────────────────────────────────────────────────

export interface CardComparison {
  a: ReportCard;
  b: ReportCard;
  lines: string[];
  /** Which run was better value, or null when they cannot be honestly compared. */
  verdict: string;
}

function pct(from: number, to: number): string {
  if (from === 0) return to === 0 ? 'unchanged' : 'up from nothing';
  const d = ((to - from) / from) * 100;
  return `${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(0)}%`;
}

/** Two runs on one property, side by side.
 *
 *  The acceptance case is a cheap run against an expensive one. The comparison refuses to declare a
 *  winner when either run was truncated: a run that skipped the deed chain will always look cheaper
 *  per fact, and rewarding that would train the system to do less work for a better score. */
export function compareCards(a: ReportCard, b: ReportCard): CardComparison {
  const lines: string[] = [
    `Cost: $${a.costUsd.toFixed(2)} → $${b.costUsd.toFixed(2)} (${pct(a.costUsd, b.costUsd)}).`,
    `Facts: ${a.facts} → ${b.facts} (${pct(a.facts, b.facts)}).`,
    `Conflicts found: ${a.conflicts} → ${b.conflicts}.`,
  ];

  if (a.costPerFact != null && b.costPerFact != null) {
    lines.push(`Cost per fact: $${a.costPerFact.toFixed(3)} → $${b.costPerFact.toFixed(3)} (${pct(a.costPerFact, b.costPerFact)}).`);
  } else {
    lines.push('Cost per fact: not comparable — one of these runs extracted nothing.');
  }

  if (a.evidenceRate != null && b.evidenceRate != null) {
    lines.push(`Facts with a source: ${(a.evidenceRate * 100).toFixed(0)}% → ${(b.evidenceRate * 100).toFixed(0)}%.`);
  }

  if (a.wallClockMinutes != null && b.wallClockMinutes != null) {
    lines.push(`Wall clock: ${a.wallClockMinutes} → ${b.wallClockMinutes} minutes.`);
  }

  let verdict: string;
  if (a.truncated || b.truncated) {
    verdict =
      'These runs are not comparable: at least one stopped short of the work it was asked to do. ' +
      'A truncated run always looks cheaper per fact, and treating that as efficiency would reward ' +
      'doing less.';
  } else if (b.facts > a.facts && b.costPerFact != null && a.costPerFact != null && b.costPerFact <= a.costPerFact) {
    verdict = 'The second run found more and cost less per fact. Strictly better.';
  } else if (b.facts < a.facts && b.costUsd < a.costUsd) {
    verdict =
      `The second run cost $${(a.costUsd - b.costUsd).toFixed(2)} less and found ${a.facts - b.facts} fewer ` +
      'fact(s). Whether that is a saving or a gap depends on what the missing facts were — the counts alone cannot say.';
  } else if (b.costUsd > a.costUsd && b.facts <= a.facts) {
    verdict = 'The second run cost more and found no more. Worth looking at what it spent the money on.';
  } else {
    verdict = 'Neither run is clearly better on these numbers alone.';
  }

  return { a, b, lines, verdict };
}
