// lib/design/conformance.ts — is the page what the design says it should be?
//
// Phases R3 and P4 of docs/planning/in-progress/PAGE_VERSIONS_AND_PORTAL_THEMES_2026-08-23.md.
//
// Two questions, one measurement, and the difference between them is only which design you point
// it at:
//
//   · against the ACTIVE design → *"is the served page the active version yet?"* (R3). The honest
//     answer to the request that a design "become the actual served page": nothing here changes
//     the app, it tells you how far apart the specification and the product are.
//   · against the DEFAULT design → *"is the trace still 1:1 with the page?"* (P4). A default claims
//     to be a record of what is served. This is what makes that claim checkable rather than
//     assumed, and it is the check that catches a trace which quietly dropped a third of the page.
//
// ── WHY MATCHING IS BY SIGNATURE AND NOT BY POSITION ────────────────────────────────────────────
//
// The tempting implementation pairs the nth design element with the nth page element and compares
// coordinates. It produces beautiful reports and they are fiction: insert one banner at the top of
// the page and every subsequent pair is wrong, so the report says the entire page moved.
//
// So elements are paired by WHAT THEY ARE — the catalogue entry, or the class signature a traced
// element carries — and position is compared only within a pair. An element that exists on both
// sides but has moved is a finding; an element on one side only is a different finding; and the
// two are never confused, which is what makes the output worth reading.

import type { DesignDocument, DesignElement, ViewId } from './document';
import type { CapturedNode } from './import';
import type { CatalogueEntry } from './catalogue/types';

export interface ConformanceOptions {
  /** How far an element may move before it counts as moved. */
  tolerancePx?: number;
  /** How much it may grow or shrink before it counts as resized. */
  sizeTolerancePx?: number;
}

export type FindingKind = 'missing' | 'extra' | 'moved' | 'resized';

export interface ConformanceFinding {
  kind: FindingKind;
  /** The class signature or catalogue id both sides are talking about. */
  signature: string;
  label: string;
  /** Where the design puts it. */
  design?: { x: number; y: number; w: number; h: number };
  /** Where the page puts it. */
  page?: { x: number; y: number; w: number; h: number };
  /** How far apart, in px, for `moved` and `resized`. */
  delta?: number;
  /** One line a person can act on. */
  note: string;
}

export interface ConformanceReport {
  route: string;
  view: ViewId;
  designId: string;
  designName: string;
  designStatus: string;
  /** Elements in the design that were paired with something on the page. */
  matched: number;
  designElements: number;
  pageElements: number;
  findings: ConformanceFinding[];
  /**
   * 0–100. The share of the design's elements that are on the page, in the right place, at the
   * right size.
   *
   * Deliberately computed from the DESIGN's elements rather than from both sides: a page that has
   * everything the design asks for plus an extra help link is not 90% conformant, it is conformant
   * with an addition — and treating those the same would push somebody to delete a useful control
   * to make a number go up.
   */
  score: number;
  measuredAt: string;
}

/** The class signature an element claims. Null when nothing on it can be matched. */
export function signatureOfElement(el: DesignElement, entries: Map<string, CatalogueEntry>): string | null {
  if (el.importedFrom) {
    const first = el.importedFrom.split(/\s+/).filter(Boolean)[0];
    if (first) return `.${first.split('--')[0]}`;
  }
  if (el.catalogId) {
    const entry = entries.get(el.catalogId);
    const cls = entry?.classes?.[0];
    if (cls) return `.${cls.split('--')[0]}`;
    return el.catalogId;
  }
  // Shapes and free text answer to nothing on the page — they are the designer's own marks, and
  // reporting them as missing from the product would be reporting the tool as a defect.
  return null;
}

function signatureOfNode(node: CapturedNode): string | null {
  const meaningful = node.classes.filter((c) => !/^(is-|has-|jsx-)/.test(c) && c.length > 2);
  const base = meaningful.find((c) => c.includes('__')) ?? meaningful[0];
  return base ? `.${base.split('--')[0]}` : null;
}

/**
 * Compare one view of a design against a capture of the live page.
 *
 * Both sides are grouped by signature and compared as MULTISETS: a design with three job cards and
 * a page with five is a count difference on one signature, not three matches and two orphans. That
 * is what keeps the report the length of the differences rather than the length of the page.
 */
export function conformanceOf(
  doc: DesignDocument,
  view: ViewId,
  nodes: CapturedNode[],
  entries: CatalogueEntry[],
  options: ConformanceOptions = {},
): ConformanceReport {
  const tolerance = options.tolerancePx ?? 24;
  const sizeTolerance = options.sizeTolerancePx ?? 16;
  const byId = new Map(entries.map((e) => [e.id, e]));

  const designElements = (doc.views[view]?.elements ?? [])
    .filter((el) => !el.hidden && !el.annotation);

  const designBySig = new Map<string, DesignElement[]>();
  let unmatchable = 0;
  for (const el of designElements) {
    const sig = signatureOfElement(el, byId);
    if (!sig) { unmatchable += 1; continue; }
    const list = designBySig.get(sig) ?? [];
    list.push(el);
    designBySig.set(sig, list);
  }

  const pageBySig = new Map<string, CapturedNode[]>();
  for (const node of nodes) {
    const sig = signatureOfNode(node);
    if (!sig) continue;
    const list = pageBySig.get(sig) ?? [];
    list.push(node);
    pageBySig.set(sig, list);
  }

  const findings: ConformanceFinding[] = [];
  let matched = 0;

  for (const [sig, designed] of designBySig) {
    const onPage = [...(pageBySig.get(sig) ?? [])];
    for (const el of designed) {
      if (onPage.length === 0) {
        findings.push({
          kind: 'missing',
          signature: sig,
          label: el.name ?? el.catalogId ?? sig,
          design: { x: el.x, y: el.y, w: el.w, h: el.h },
          note: `The design has ${sig} here; the page has none.`,
        });
        continue;
      }
      // Nearest instance wins. With several of the same thing on the page, pairing the designed one
      // with the closest is the only pairing that makes a position comparison mean anything.
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const [i, node] of onPage.entries()) {
        const d = Math.hypot(node.rect.x - el.x, node.rect.y - el.y);
        if (d < bestDistance) { bestDistance = d; bestIndex = i; }
      }
      const node = onPage.splice(bestIndex, 1)[0];
      matched += 1;

      const dx = Math.round(node.rect.x - el.x);
      const dy = Math.round(node.rect.y - el.y);
      const distance = Math.round(Math.hypot(dx, dy));
      if (distance > tolerance) {
        findings.push({
          kind: 'moved',
          signature: sig,
          label: el.name ?? el.catalogId ?? sig,
          design: { x: el.x, y: el.y, w: el.w, h: el.h },
          page: { x: node.rect.x, y: node.rect.y, w: node.rect.w, h: node.rect.h },
          delta: distance,
          note: `${distance}px from where the design puts it (${dx >= 0 ? '+' : ''}${dx}, ${dy >= 0 ? '+' : ''}${dy}).`,
        });
      }

      const dw = Math.round(node.rect.w - el.w);
      const dh = Math.round(node.rect.h - el.h);
      if (Math.abs(dw) > sizeTolerance || Math.abs(dh) > sizeTolerance) {
        findings.push({
          kind: 'resized',
          signature: sig,
          label: el.name ?? el.catalogId ?? sig,
          design: { x: el.x, y: el.y, w: el.w, h: el.h },
          page: { x: node.rect.x, y: node.rect.y, w: node.rect.w, h: node.rect.h },
          delta: Math.max(Math.abs(dw), Math.abs(dh)),
          note: `${el.w}×${el.h} in the design, ${node.rect.w}×${node.rect.h} on the page.`,
        });
      }
    }

    for (const leftover of onPage) {
      findings.push({
        kind: 'extra',
        signature: sig,
        label: leftover.text?.slice(0, 40) || sig,
        page: leftover.rect,
        note: `The page has another ${sig} the design does not account for.`,
      });
    }
  }

  // Signatures the design never mentions at all.
  for (const [sig, onPage] of pageBySig) {
    if (designBySig.has(sig)) continue;
    findings.push({
      kind: 'extra',
      signature: sig,
      label: onPage[0].text?.slice(0, 40) || sig,
      page: onPage[0].rect,
      note: onPage.length > 1
        ? `${onPage.length} × ${sig} on the page, nothing like it in the design.`
        : `${sig} is on the page and not in the design.`,
    });
  }

  const wrong = findings.filter((f) => f.kind !== 'extra').length;
  const denominator = designElements.length - unmatchable;
  const score = denominator > 0
    ? Math.max(0, Math.round(((denominator - wrong) / denominator) * 100))
    : 0;

  return {
    route: doc.route ?? '',
    view,
    designId: doc.id,
    designName: doc.name,
    designStatus: doc.status ?? 'draft',
    matched,
    designElements: designElements.length,
    pageElements: nodes.length,
    findings: findings.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (b.delta ?? 0) - (a.delta ?? 0)),
    score,
    measuredAt: new Date().toISOString(),
  };
}

const KIND_ORDER: Record<FindingKind, number> = { missing: 0, moved: 1, resized: 2, extra: 3 };

/** One line for a list. Says the number that matters first. */
export function conformanceSummary(report: ConformanceReport): string {
  const missing = report.findings.filter((f) => f.kind === 'missing').length;
  const moved = report.findings.filter((f) => f.kind === 'moved' || f.kind === 'resized').length;
  const extra = report.findings.filter((f) => f.kind === 'extra').length;
  if (report.designElements === 0) return 'The design has nothing on this view.';
  return `${report.score}% — ${missing} missing · ${moved} out of place · ${extra} on the page but not in the design`;
}

/**
 * Is a default still a faithful trace? (P4)
 *
 * A stricter reading of the same report, because a default makes a stronger claim than an active
 * design does. An active design is a proposal and is SUPPOSED to differ from the page. A default
 * says "this is what the page is", so anything missing is the trace having lost something.
 */
export function traceIsFaithful(
  report: ConformanceReport,
  limits: { maxMissing?: number; minScore?: number } = {},
): { ok: boolean; why: string } {
  const missing = report.findings.filter((f) => f.kind === 'missing').length;
  const maxMissing = limits.maxMissing ?? 0;
  const minScore = limits.minScore ?? 90;
  if (report.designElements === 0) {
    return { ok: false, why: 'The default has no elements — a trace that captured nothing.' };
  }
  if (missing > maxMissing) {
    return { ok: false, why: `${missing} element(s) in the default are not on the page — the trace is stale.` };
  }
  if (report.score < minScore) {
    return { ok: false, why: `${report.score}% conformant, below the ${minScore}% a trace has to hold.` };
  }
  return { ok: true, why: `${report.score}% — the default still matches the page it was traced from.` };
}

export interface RetraceChange {
  view: string;
  before: number;
  after: number;
  /** Class signatures the page has now and did not have before. */
  added: string[];
  /** Signatures the previous default had and the page no longer does. */
  removed: string[];
  /** Signatures on both sides that are more than 24px from where they were. */
  moved: Array<{ signature: string; by: number }>;
}

/**
 * What changed between the default that was there and the one replacing it.
 *
 * Phase P3. *"Re-tracing replaces the default and says what moved."* A silent replacement is the
 * worst version of this feature: the whole reason to re-trace is that the page has changed, and a
 * re-trace that does not say HOW leaves you comparing two screenshots by eye — which is the job the
 * tracer exists to do for you.
 *
 * Compared by class signature rather than by index, for the same reason the conformance check is:
 * insert one banner and an index comparison reports that the entire page moved.
 */
export function diffDefaults(
  before: DesignDocument | null,
  after: DesignDocument,
): RetraceChange[] {
  if (!before) return [];
  const out: RetraceChange[] = [];

  for (const view of ['desktop', 'mobile'] as const) {
    const sigOf = (doc: DesignDocument) => {
      const map = new Map<string, { x: number; y: number }>();
      for (const el of doc.views?.[view]?.elements ?? []) {
        const first = (el.importedFrom ?? el.catalogId ?? '').split(/\s+/).filter(Boolean)[0];
        if (!first) continue;
        const key = first.startsWith('.') ? first : `.${first.split('--')[0]}`;
        // First instance wins: a signature that appears forty times is one element of the page,
        // and its position is the position of the first one on both sides.
        if (!map.has(key)) map.set(key, { x: el.x, y: el.y });
      }
      return map;
    };

    const a = sigOf(before);
    const b = sigOf(after);
    const added = [...b.keys()].filter((k) => !a.has(k));
    const removed = [...a.keys()].filter((k) => !b.has(k));
    const moved: Array<{ signature: string; by: number }> = [];
    for (const [key, pos] of b) {
      const was = a.get(key);
      if (!was) continue;
      const by = Math.round(Math.hypot(pos.x - was.x, pos.y - was.y));
      if (by > 24) moved.push({ signature: key, by });
    }

    out.push({
      view,
      before: before.views?.[view]?.elements?.length ?? 0,
      after: after.views?.[view]?.elements?.length ?? 0,
      added: added.slice(0, 25),
      removed: removed.slice(0, 25),
      moved: moved.sort((x, y) => y.by - x.by).slice(0, 25),
    });
  }

  return out;
}
