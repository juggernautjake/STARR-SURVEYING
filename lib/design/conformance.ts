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

export type FindingKind = 'missing' | 'extra' | 'moved' | 'resized' | 'shifted';

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

/**
 * The one rule both sides answer to.
 *
 * There used to be two, and they disagreed. The page picked the BEM child class — the one with
 * `__` in it — while the design took whichever class happened to be written first in the markup.
 * For `class="team-page team-page__card"` that is `.team-page__card` on one side and `.team-page`
 * on the other: the same element, counted as one thing missing and one thing extra. Pages whose
 * elements led with their block class scored in single digits — `/admin/team` came out at 7%
 * minutes after being traced from the very page it was being compared against — and pages whose
 * markup happened to put the `__` class first scored 100%. The score was measuring class-attribute
 * ORDER.
 *
 * Written once, exported, and used by every caller, because two copies of a matching rule is how
 * this happened.
 */
export function classSignature(classes: string[]): string | null {
  const meaningful = classes.filter((c) => !/^(is-|has-|jsx-)/.test(c) && c.length > 2);
  const base = meaningful.find((c) => c.includes('__')) ?? meaningful[0];
  return base ? `.${base.split('--')[0]}` : null;
}

/** The class signature an element claims. Null when nothing on it can be matched. */
export function signatureOfElement(el: DesignElement, entries: Map<string, CatalogueEntry>): string | null {
  if (el.importedFrom) {
    // `importedFrom` is the node's class attribute verbatim — or its TAG when the node had no
    // classes at all (`lib/design/import.ts`: `classes.join(' ') || tag`). Both cases go through
    // the same two steps the page side uses, in the same order, so the two can only ever agree:
    // a class if there is a usable one, the tag otherwise.
    //
    // The ambiguity that remains is a node whose only classes are one or two characters long —
    // `classSignature` discards those as noise, and this side cannot then tell them from a tag.
    // No class in this codebase is that short; if one ever is, that element will be reported
    // missing, which is the safe direction to be wrong in.
    const raw = el.importedFrom.split(/\s+/).filter(Boolean);
    return classSignature(raw) ?? (raw.length === 1 ? `.${raw[0]}` : null);
  }
  if (el.catalogId) {
    const entry = entries.get(el.catalogId);
    const sig = classSignature(entry?.classes ?? []);
    if (sig) return sig;
    return el.catalogId;
  }
  // Shapes and free text answer to nothing on the page — they are the designer's own marks, and
  // reporting them as missing from the product would be reporting the tool as a defect.
  return null;
}

/**
 * Half this product's markup carries no class at all. `/admin/team` renders 92 of its 102 nodes
 * as bare `<h1>`, `<span>`, `<button>`, `<article>` — and `lib/design/import.ts` already records
 * those by TAG (`importedFrom: node.classes.join(' ') || node.tag`), so the design side has always
 * called one `.span` and this side called it nothing. Ninety-two elements that could never match
 * anything, on a page whose design had been traced from it minutes earlier: 10%.
 *
 * The tag is a weaker identity than a class and it is not nothing — thirty-six spans on one side
 * and thirty-six on the other is a match, and thirty-four is two missing, which is the answer the
 * check exists to give. Classes still win when there are any; the tag is the fallback, on both
 * sides, spelled the same way.
 */
function signatureOfNode(node: CapturedNode): string | null {
  return classSignature(node.classes) ?? (node.tag ? `.${node.tag}` : null);
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

  // ── THE WHOLE PAGE MOVING IS ONE FINDING, NOT EVERY ELEMENT MOVING ───────────────────────────
  //
  // `/admin/me` matched 118 of 118 elements and scored 0%, on the strength of 104 "moved"
  // findings that were every one of them `+0, +27`. Nothing had moved: the page started 27px
  // lower than when it was traced — one banner, one scrollbar, one font that loaded a beat later.
  //
  // §P3 already wrote this lesson down for the re-trace diff — "insert one banner and an index
  // comparison reports that the entire page moved" — and this check had the same disease in a
  // different form. The shared offset is measured first, reported once if it is large enough to
  // matter, and subtracted before anything is called displaced. What survives is the elements
  // that moved RELATIVE TO THE PAGE, which is the only kind of movement a design can be wrong
  // about.
  const pairs: Array<{ sig: string; el: DesignElement; node: CapturedNode }> = [];
  const spare = new Map<string, CapturedNode[]>();
  for (const [sig, list] of pageBySig) spare.set(sig, [...list]);

  for (const [sig, designed] of designBySig) {
    const onPage = spare.get(sig) ?? [];
    for (const el of designed) {
      if (onPage.length === 0) continue;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const [i, node] of onPage.entries()) {
        const d = Math.hypot(node.rect.x - el.x, node.rect.y - el.y);
        if (d < bestDistance) { bestDistance = d; bestIndex = i; }
      }
      pairs.push({ sig, el, node: onPage.splice(bestIndex, 1)[0] });
    }
  }

  // The MEDIAN, not the mean: a handful of genuinely displaced elements must not drag the
  // baseline toward themselves and hide the drift they represent.
  const median = (xs: number[]) => {
    if (!xs.length) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };
  let offsetX = 0;
  let offsetY = 0;
  if (pairs.length >= 8) {
    const mx = median(pairs.map((pr) => Math.round(pr.node.rect.x - pr.el.x)));
    const my = median(pairs.map((pr) => Math.round(pr.node.rect.y - pr.el.y)));
    // Only when MOST of the page agrees. Two thirds within 8px of the same shift is a page that
    // moved; anything looser is a page whose elements moved independently, and subtracting a
    // number there would hide exactly what this check is for.
    const agreeing = pairs.filter((pr) =>
      Math.abs(Math.round(pr.node.rect.x - pr.el.x) - mx) <= 8
      && Math.abs(Math.round(pr.node.rect.y - pr.el.y) - my) <= 8).length;
    if (agreeing / pairs.length >= 0.66 && Math.hypot(mx, my) > tolerance / 2) {
      offsetX = mx;
      offsetY = my;
      findings.push({
        kind: 'shifted',
        signature: '(page)',
        label: 'the whole page',
        delta: Math.round(Math.hypot(mx, my)),
        note: `The page as a whole sits ${Math.round(Math.hypot(mx, my))}px from where it was traced `
          + `(${mx >= 0 ? '+' : ''}${mx}, ${my >= 0 ? '+' : ''}${my}) — ${agreeing} of ${pairs.length} `
          + `elements moved together. Everything below is measured against that.`,
      });
    }
  }

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

      const dx = Math.round(node.rect.x - el.x) - offsetX;
      const dy = Math.round(node.rect.y - el.y) - offsetY;
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

const KIND_ORDER: Record<FindingKind, number> = { shifted: 0, missing: 1, moved: 2, resized: 3, extra: 4 };

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
        // Same rule as the conformance matcher, for the same reason — a re-trace reporting what
        // moved by a different name than the check uses is two tools describing one page in two
        // vocabularies.
        const raw = (el.importedFrom ?? el.catalogId ?? '').split(/\s+/).filter(Boolean);
        const key = raw[0]?.startsWith('.') ? raw[0] : classSignature(raw);
        if (!key) continue;
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
