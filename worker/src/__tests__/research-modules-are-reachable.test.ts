// Every research module has a caller, or is listed here with a reason.
//
// TEN times in this plan, work that was designed correctly, tested, and written up as DONE had no
// caller — and in three cases the planning doc's own prose asserted the fix was live:
//
//   S8   the legibility check       computed a verdict nobody read
//   S10  ALL NINE Phase I modules   monuments, curves, varas, closure, the drawing — an island
//   S11  bearing-rotation           the owner's named feature, no route and no button
//   R13  platform-choice            "the enforcement point", never asked
//   R14  the chain walk             wired, but its searches were never passed
//   R16  frameParcel                fixed the zoom-19 defect for nobody
//   R18  chooseTiles                the recommended grid, computed and discarded
//   S-11 research-modes             a mode picker that governed nothing
//
// The reason it keeps happening is that nothing can see it. A module's own unit tests pass exactly
// the same whether or not anything calls it, `tsc` is happy, and the production build is happy. It
// is invisible to every check this repo runs — so this is the check.
//
// ── WHY AN ALLOWLIST RATHER THAN A BAN ──────────────────────────────────────────────────────────
//
// Some modules genuinely have no importer and should not: entry points, scripts, and work that is
// deliberately parked. A test that failed on all of them would be noise, and noisy tests get
// skipped, which would leave this worse than before.
//
// So the rule is: unreachable is allowed, but it must be a RECORDED DECISION with a reason. Adding
// a name here is cheap and takes ten seconds; the point is that it cannot happen by accident, and
// the list is a standing inventory of what was built and never connected.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO = path.resolve(ROOT, '..');

/** Directories whose modules are library code and should be reachable.
 *
 *  `worker/src/lib` and `worker/src/infra` were missing from the first version of this list, and the
 *  omission hid a whole subsystem: the real-time progress channel's PUBLISHER lives in
 *  `worker/src/lib/research-events-emit.ts` and has no callers, which the check could not see. A
 *  guard is only as good as its coverage, and the directories it skips are exactly where the next
 *  orphan will be. */
const LIBRARY_DIRS = [
  'worker/src/services',
  'worker/src/research',
  'worker/src/chain-of-title',
  'worker/src/lib',
  'worker/src/infra',
  'lib/research',
  // Added 2026-08-31. The list above skipped the app-side research components, and the omission
  // hid dead CAPABILITY rather than dead code: BoundaryCallsPanel (596 lines) was the ONLY caller
  // of two live API routes — /boundary-calls (fetch the metes and bounds from the county CAD) and
  // /browser-fetch — and nothing mounted it, so neither route could be reached from the product.
  //
  // This file already warned about exactly this: "a guard is only as good as its coverage, and the
  // directories it skips are exactly where the next orphan will be."
  'app/admin/research/components',
  // Added 2026-09-03 (plan B*6). The list above covered FIVE of the worker's twenty source
  // directories. Unscanned were exactly the ones the county adapters, the public-source clients,
  // the paid-purchase adapters, the Bell module and every exporter live in — which is to say, the
  // directories a research-platform audit most wants an honest orphan count for.
  'worker/src/adapters',
  'worker/src/ai',
  'worker/src/analytics',
  'worker/src/batch',
  'worker/src/billing',
  'worker/src/cli',
  'worker/src/counties',
  'worker/src/counties/bell',
  'worker/src/counties/bell/analyzers',
  'worker/src/counties/bell/config',
  'worker/src/counties/bell/reports',
  'worker/src/counties/bell/scrapers',
  'worker/src/counties/bell/screenshots',
  'worker/src/counties/bell/types',
  'worker/src/counties/bell/utils',
  'worker/src/exports',
  'worker/src/models',
  'worker/src/orchestrator',
  'worker/src/reports',
  'worker/src/routes',
  'worker/src/services/purchase-adapters',
  'worker/src/shared',
  'worker/src/sources',
  'worker/src/types',
];

/** Directories searched for callers. */
const CALLER_DIRS = ['worker/src', 'lib', 'app'];

/**
 * Modules with no importer, each with the reason it is allowed to have none.
 *
 * Anything NOT on this list must be imported by something that is not a test.
 */
const KNOWN_UNREACHABLE: Record<string, string> = {
  // Gather-run entrypoint (plan GATHER_AND_REVIEW_SPLIT G7), built ahead of its caller. It composes
  // the whole Gather pass (want-list → free-first → TexasFile → hard stops), and everything it
  // imports (gather-orchestrator, acquisition-wantlist, gather-budget, texasfile-want-buyer) is
  // reachable THROUGH it. Its own non-test caller — the HTTP dispatch that runs it when
  // phase==='gather', supplying the real resolveFree (county capture) + subject/adjoiner facts — is
  // the plan's explicit remaining wiring slice, which needs live testing. Remove this entry when that
  // dispatch lands. Deliberately staged, not dead: unit-tested by run-gather-pipeline.test.ts.

  'worker/src/research/selection-purchases.ts':
    'W2 selection->purchase-recommendation converter (the checklist drives TexasFile buying, plats first). Pure + unit-tested (selection-purchases.test.ts); its non-test caller is the run purchase feed, wired next (W2 live) — a run that, when gatherSelections is set, buys these from TexasFile. Remove when that feed is wired.',

  'worker/src/research/run-gather-pipeline.ts':
    'G7 want-list Gather engine, a STAGED ENHANCEMENT. TexasFile-in-gather is already live via the main pipeline (DocumentPurchaseOrchestrator -> buyDocument, G1/G2/G6, asserted by the-run-can-buy-documents + texasfile-buy-is-wired). This engine additionally guarantees the subject/adjoiner plat+deed priority; wiring it to feed/augment the recommender is a live-tested slice. Not dead — unit-tested by run-gather-pipeline.test.ts.',


  // One-time data migration (plan D4): its pure planning logic (planIdentityBackfill) is called by
  // the runner script worker/src/scripts/backfill-identity.mjs and its test, not by the pipeline —
  // a .mjs caller the .ts scanner does not count. Kept as a utility for future identity backfills.
  'worker/src/research/identity-backfill.ts':
    'D4 backfill utility — called by scripts/backfill-identity.mjs (a .mjs, uncounted here) and its test, not the runtime graph. A deliberate one-shot tool, not dead code.',

  // ── Found 2026-09-01, when plan E1 replaced the Research & Analysis stack ─────────────────
  //
  // These three are SUPERSEDED, and they are listed rather than deleted for one specific
  // reason: five other guards still read ResearchRunPanel.tsx to prove properties that must now
  // hold in ResearchRunView/useRunState — owner-name-reaches-the-run, worker-status,
  // run-progress, pipeline-log and stored-file. Two of those (owner-name, worker-status) have
  // already been repointed at the live code. Deleting the file before the other three follow
  // would not remove a vacuous guard; it would remove the guard entirely, and this repository
  // has lost a property that way before.
  //
  // Nothing renders any of them, so the user-facing defect is fixed either way. What remains is
  // bookkeeping, and it is written down instead of being done badly in a hurry.
  // ── ResearchRunPanel.tsx is NOT listed here, and that is a finding, not an omission ────────
  //
  // It is superseded and nothing imports it — page.tsx was its only importer and no longer is.
  // But this check reports it as WIRED, so listing it fails the stale-entry test above.
  //
  // The reason is in hasCaller: the pattern looks for the module name inside a quote character,
  // and it counts the BACKTICK as one. This repository writes long comments that name modules in
  // backticks — pipeline-log.ts says "and `ResearchRunPanel`, polling the same endpoint, had a
  // denylist" — so a file that merely DISCUSSES a module is indistinguishable from one that
  // imports it.
  //
  // That blind spot predates this change: it is why ResearchRunPanel never showed up as an orphan
  // while page.tsx held the only import, and it silently weakens the guard for every module this
  // codebase talks about in prose — which, given the house style, is most of them.
  //
  // NOT fixed here on purpose. Stripping comments before the scan is the right repair and it will
  // surface a batch of newly-visible orphans across the repo; doing that inside a slice about the
  // research run view would bury it. Recorded in the plan doc as its own item.
  // RunConsoleBar.tsx and ResearchRunPanel.tsx were DELETED on 2026-09-02, so their entries are gone
  // from this map — a listed module that no longer exists fails the stale-entry test above, which is
  // the check that keeps this list honest.
  //
  // The condition written below was met first: all five guards that read ResearchRunPanel to prove
  // properties now holding in ResearchRunView/useRunState were re-pointed at the live code in the
  // same commit — owner-name-reaches-the-run, worker-status, run-progress, pipeline-log, stored-file.
  //
  // Re-pointing them was not bookkeeping. run-console.test.ts turned out to be guarding a feature
  // that had ALREADY been dropped: the analyze route still computed `paidDocumentsNotice` and the
  // run-console route still sent `usageFailed`, and after the rebuild nothing read either one. "Why
  // did this run buy nothing?" and "this cost figure is incomplete" had both stopped reaching the
  // screen. Both were restored into useRunState/ResearchRunView before the files were deleted.
  // ResearchAnalysisPanel.tsx was DELETED on 2026-09-02 and its entry went with it — a listed
  // module that no longer exists fails the stale-entry test above, which is what keeps this list
  // from becoming folklore.
  //
  // Its entry had called the deletion an OWNER CALL, and it was: the panel's subject is the Review
  // stage rather than the run, so removing it was never a side effect of rebuilding the run view.
  // The owner asked, the replacements were checked section by section, and the one capability
  // without an exact replacement was already unreachable.
  // ── Found 2026-08-31, when this check was widened to .tsx and to app/admin/research/components
  //
  // Both are OWNER CALLS, recorded rather than resolved. One is a duplicate of a live page; the
  // other is a working feature with no obvious home, and inventing a home for it is a design
  // decision rather than a fix.
  //
  // The third find in this sweep, BoundaryCallsPanel.tsx, was WIRED instead of listed — it had an
  // obvious home on the boundary page, which already shows the calls it fetches.
  'app/admin/research/components/InteractiveBoundaryViewer.tsx':
    'SUPERSEDED, not parked. app/admin/research/[projectId]/boundary/page.tsx is a 472-line re-implementation that renders its own SVG inline and imports only RotationPanel; this is the original 689-line version, left behind. The live route works. OWNER CALL: delete it, or replace the page with it — keeping both means the next person edits whichever they find first.',
  'app/admin/research/components/TemplateManager.tsx':
    'Dead CAPABILITY, not dead code: it is the ONLY caller of /api/admin/research/templates (GET, POST, DELETE), which is routed and works. Analysis and drawing templates cannot be managed from anywhere in the product. Not wired here because it has no obvious home — unlike BoundaryCallsPanel, which belonged on the page already showing its data — and picking one is a design decision. OWNER CALL: say where it belongs, or drop the routes with it.',

  // A category this check did not anticipate: a module whose CONSUMER IS A TEST, legitimately.
  //
  // `golden-plat.ts` measures extraction against plats whose answers are known. Its runner is
  // `golden-plat.test.ts`, which loads whatever sits in `__tests__/golden-plats/` — so the module
  // does execute, on every suite run, and starts producing a real measurement the moment the owner
  // drops a JSON file in. There is no production caller to add, and inventing one would be worse
  // than this line.
  //
  // Worth distinguishing from the entries below: those are parked. This one runs.
  'worker/src/services/golden-plat.ts':
    'Measurement harness — its runner is golden-plat.test.ts, which auto-loads __tests__/golden-plats/*.json. Executes on every suite run; produces a real score as soon as a plat is supplied.',

  // Entry points and operational surfaces — called by a route, a script or a schedule, not imported.
  'lib/research/useResearchProgress.ts':
    'React hook for a UI that has not been built yet; kept because the event shape it decodes is the worker\'s.',
  'lib/research/white-label.config.ts':
    'Configuration for per-firm branding, read when white-labelling is turned on. Not code that runs.',

  // ── Found 2026-08-03 when this check was widened to worker/src/lib and worker/src/infra ──
  //
  // The first version of the list skipped those two directories, and the omission hid a whole
  // subsystem. Every entry below is a real gap; none is a false alarm.
  'worker/src/lib/research-events-emit.ts':
    'The real-time progress channel is built END TO END and connected at NEITHER end: this publisher has no callers and useResearchProgress has no consumer. It needs `npm run ws` deployed as a long-lived process, which Vercel cannot host — a deployment decision, not a coding gap. Until then the UI polls, which works.',
  'worker/src/lib/rate-limiter.ts':
    'PARKED: per-site concurrency and backoff limits (spec §18). The adapters currently pace themselves with ad-hoc waits. Real work — being rude to a county portal is how a firm gets blocked — but it belongs with a plan slice, since it changes the timing of every adapter at once.',
  'worker/src/infra/ai-guardrails.ts':
    'PARKED: validates AI-extracted bearings/distances/curves. Overlaps with survey-geometry parseBearing and curve-check, both of which ARE wired and refuse bad input at the point of use. Wiring a second validator needs a decision on which one is authoritative, or the two will disagree.',
  'worker/src/infra/county-config-registry.ts':
    'PARKED: operator-managed per-county portal overrides. The adapter registry in research_site_adapters (resolveAdapter) already serves this purpose from the database; one of the two should be retired rather than both wired.',

  // Built ahead of the surface that will use them. Each is a real decision, not an oversight.
  //
  // `prioritized-pipeline.ts` and `.service.ts` (764 lines between them) were listed here as
  // PARKED from 2026-08-27 to 2026-09-03 — the pair "where nobody can now tell which was real".
  // Plan C1b settled it from the routes' side: neither full-extract nor deep-lot-analysis
  // re-implements their loop, and the run order they specified has since been built directly into
  // the orchestrator and the generic pipeline (plan C2/C3). Both deleted.
  'lib/research/self-heal-planner.ts':
    'PARKED: the self-healing adapter plan (RESEARCH_SOFTWARE_OPTIMIZATION Part II) has not been activated; the cron route drives the existing self-heal path.',
  'lib/research/multi-source-confidence.ts':
    'PARKED: cross-source agreement scoring, superseded in practice by the confidence-scoring engine. Needs a decision on which of the two is the model before either is wired.',
  'lib/research/document-segmentation.ts':
    'PARKED: multi-document PDF splitting. Real work, but it changes what a "document" is throughout the pipeline and cannot be a small slice.',
  'lib/research/spatial-filter.ts':
    'PARKED: geometry-based adjoiner filtering; the adjoiner path currently filters by county and owner.',
  'lib/research/place-county.ts':
    'PARKED: place-name to county resolution, pending the ambiguity decision (a place name can span counties).',
  'worker/src/services/usps-address-client.ts':
    'PARKED: USPS address standardisation needs a USPS API account, which is an owner decision.',

  // ── Surfaced 2026-09-03 by plan B*6, when the scan reached the other fifteen worker dirs ──
  //
  // Stripping comments found NOTHING new in the five directories already scanned — the prose
  // blind spot was real but had not been hiding an orphan there. Widening the scan found these
  // fourteen, every one confirmed with an import-statement grep plus a control (`dead-host` has a
  // real importer, and the same grep finds it). Each carries what the header, the git dates and
  // the registry say. Wire-or-delete is the platform audit's call, not this slice's: the guard
  // has to be honest BEFORE anything is swept, and this is the honest inventory.
  'worker/src/adapters/bexar-clerk-adapter.ts':
    'DEAD SINCE 2026-04. 335 lines for bexar.tx.publicsearch.us — the same Kofile/GovOS PublicSearch host family as Bell\'s clerk, which the kofile adapter already speaks. clerk-registry.ts:34 lists Bexar as "bexar_custom — stub" and never dispatches here. AUDIT: almost certainly delete; the kofile adapter should cover Bexar.',
  'worker/src/ai/prompt-registry.ts':
    'DEAD. Phase 11 Module L: prompt versioning, accuracy tracking, A/B testing. No analyzer consults it — every live prompt is inline in its analyzer. Either the analyzers adopt it or it goes.',
  'worker/src/billing/stripe-billing.ts':
    'SPECULATIVE. Phase 11 Module G: subscriptions and per-report Stripe billing for a SaaS that does not exist. Last touched 2026-03-07. Stripe is OFF BY DESIGN in this repo. AUDIT: delete with subscription-tiers.',
  'worker/src/billing/subscription-tiers.ts':
    'SPECULATIVE. The tier table for stripe-billing.ts above; same verdict.',
  'worker/src/cli/starr-research.ts':
    'DEAD. A commander CLI (run/report/status/list/clean) that is not in worker/package.json scripts, unlike the five receipt/voice/video CLIs which are. Nothing can run it without knowing its dist path. Last touched 2026-03-06.',
  'worker/src/counties/bell/reports/export-service.ts':
    'SUPERSEDED. Bell-only PDF/JSON export from 2026-03; worker/src/reports/pdf-generator.ts and routes/report-routes.ts are the live report path and do not import it.',
  'worker/src/counties/bell/reports/plat-drawing-generator.ts':
    'SUPERSEDED. Bell-only AI plat drawing from 2026-03; worker/src/reports/svg-renderer.ts and services/survey-drawing.ts are the live drawing path. 401 lines nothing renders.',
  'worker/src/counties/bell/utils/html-parser.ts':
    'DEAD. Header says "shared helpers used by multiple scrapers"; no scraper imports it. The scrapers carry their own parsing.',
  'worker/src/counties/bell/utils/session-manager.ts':
    'DEAD. Bell session/cookie acquisition from 2026-03; the live Bell path acquires its session inside the scrapers and services/bell-clerk.ts, none of which import this.',
  'worker/src/exports/csv-exporter.ts':
    'PARKED, no caller. Phase 11 Module P batch CSV export. No route, no button. Owner call: field/GIS export is real value, but it needs a home before it is anything.',
  'worker/src/exports/jobxml-exporter.ts':
    'PARKED, no caller. Trimble JobXML export of survey points (Phase 11 Module N). Same verdict as csv-exporter; the CAD export-to-cad route is the live export path and does not use it.',
  'worker/src/exports/rw5-exporter.ts':
    'PARKED, no caller. Carlson RW5 export (Phase 11 Module N). Same verdict as jobxml-exporter.',
  // `sources/bell-cad-data-portal.ts` was listed here for one commit as "plan B4's raw material —
  // the second door into Bell CAD". It was DELETED under B4 the same day, once the recovered log of
  // the 2026-09-03 run showed the second door already exists and was used: the ArcGIS parcel layer
  // on utility.arcgis.com found parcel 42156 in one second while esearch.bellcad.org was dark.
  // The client's hardcoded download links had moved, its "scrapes on each request" comment was
  // false (it did a HEAD and returned the list), and the export it wanted to buffer in memory
  // is 239 MB. Everything it could have answered, the GIS layer answers in one request.
  'worker/src/sources/txdot-roadways-client.ts':
    'DEAD. ArcGIS client for TxDOT roadway centerlines (2026-03-12). The live right-of-way path is services/txdot-row.ts + txdot-rpam-client.ts, which do not import it. 311 lines.',
};

function listModules(dir: string): string[] {
  const abs = path.join(REPO, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    // ── `.tsx` WAS EXCLUDED, WHICH MEANT REACT COMPONENTS WERE INVISIBLE HERE ──────────────────
    //
    // This filter read `f.endsWith('.ts')`. Every React component in this repository ends in
    // `.tsx`, so for as long as this guard has existed it could not see one — and "authored but
    // not wired" is a defect that happens to COMPONENTS more than to anything else, because a
    // module with no importer at least looks odd while an unmounted component looks finished.
    //
    // Adding `app/admin/research/components` to LIBRARY_DIRS first appeared to surface nothing,
    // which was the giveaway: the directory contains 43 components and not one `.ts` file. The
    // probe was the bug, not the code.
    //
    // Found via `BoundaryCallsPanel.tsx` — 596 lines, the only caller of two live API routes, and
    // mounted by nothing.
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx'))
      && !f.endsWith('.d.ts') && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
    .map((f) => `${dir}/${f}`);
}

/** Every non-test source, read ONCE.
 *
 *  The first version of this test re-read the whole tree for each module — a few hundred files times
 *  a few dozen modules — and took ten seconds before timing out. A guard that is slow enough to be
 *  annoying is a guard somebody eventually skips, which would leave this worse than not having it. */
function allSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(p);
      }
    }
  };
  for (const d of CALLER_DIRS) walk(path.join(REPO, d));
  // The worker's package.json is a caller too: `"extract-receipts": "node dist/cli/extract-receipts.js"`
  // is how a CLI module is reached, and without this line every one of them reads as an orphan.
  out.push(path.join(REPO, 'worker/package.json'));
  return out;
}

/** Is this module named in any non-test source file other than itself?
 *
 *  Matches the basename inside quotes, which covers `import … from './x.js'`, a dynamic
 *  `await import('./x.js')`, and a path string in a registry — all three are real ways this codebase
 *  reaches a module, and the earlier version of this sweep missed the last two and produced false
 *  accusations. */
function hasCaller(modulePath: string, sources: Array<{ abs: string; text: string; code: string }>): boolean {
  // `.tsx` before `.ts`: `path.basename(p, '.ts')` only strips an EXACT suffix, so it leaves
  // "CountyNote.tsx" whole and the pattern then hunts for `'…CountyNote.tsx'` — a string no import
  // ever contains, because imports omit the extension. Every component read as an orphan, including
  // ones with three importers. Caught by the result being absurd rather than by the code looking
  // wrong.
  const base = modulePath.endsWith('.tsx')
    ? path.basename(modulePath, '.tsx')
    : path.basename(modulePath, '.ts');
  const selfAbs = path.join(REPO, modulePath);
  // The basename must be the LAST PATH SEGMENT of the quoted string — preceded by `/` or by the
  // opening quote. `\b` accepted a hyphen, so the Testing Lab's help text
  // 'feat/harris-county-adapter' counted as a caller of types/county-adapter.ts (359 lines, no
  // importer), and a display-map key 'discovery-engine' vouched for services/discovery-engine.ts
  // (531 lines, no importer). Both deleted 2026-09-03 once the platform audit named them.
  const pattern = new RegExp(`['"\`](?:[^'"\`]*/)?${base.replace(/\./g, '\\.')}(\\.js)?['"\`]`);
  // `includes` first, regex only on the survivors. This is a NECESSARY condition, not a heuristic:
  // the pattern contains `base` as a literal, so a file whose text does not contain that substring
  // cannot possibly match it. Same answers, and it skips the regex on the ~95% of files that never
  // mention the module.
  //
  // Why this is worth a comment: the check was intermittently failing at ~5.1 s against vitest's 5 s
  // default, but ONLY in the full-suite run and never in isolation — the worst shape a structural
  // guard can take, because it looks like a real orphan, passes on re-run, and teaches people to
  // re-run past it. The cost was one regex over every source file's ENTIRE text once per module,
  // roughly 12,000 full-file scans.
  //
  // A first attempt extracted each file's quoted literals once and matched against those. It looked
  // equivalent — the pattern is quote-bounded at both ends — and it was NOT: scanning for quote
  // pairs left-to-right mis-pairs them after any apostrophe in prose, so a single "don't" in a
  // comment hides every literal after it. It reported twelve modules as orphans that are wired.
  // Recorded because the reasoning was persuasive and wrong, and only running it caught that.
  return sources.some((f) => f.abs !== selfAbs && f.code.includes(base) && pattern.test(f.code));
}

/** The file with its comments removed and its string literals kept.
 *
 *  ── WHY (plan B*6) ──────────────────────────────────────────────────────────────────────────
 *
 *  `hasCaller` looks for the module's name inside quotes, and a backtick is a quote. This
 *  repository writes long comments that name modules in backticks — "and `ResearchRunPanel`,
 *  polling the same endpoint, had a denylist" — so for as long as this guard has existed, a file
 *  that merely DISCUSSED a module was indistinguishable from one that imported it. That is how
 *  ResearchRunPanel stayed "wired" for weeks after page.tsx dropped the only import, and it
 *  weakens the guard for every module this codebase talks about in prose, which is most of them.
 *
 *  Comments are removed by walking the text with a small state machine rather than with a regex,
 *  because the obvious regexes are wrong in both directions: `\/\/.*$` truncates every
 *  `'https://…'` literal, and `\/\*[\s\S]*?\*\/` eats a `/*` that sits inside a string. The
 *  walker knows which of the three quote characters it is inside and leaves those alone.
 *
 *  Regex literals are NOT tracked. A `//` inside one — `/[/]{2}/` — would drop the rest of that
 *  line, and the only thing that can hide is a specifier on the SAME line as such a regex, which
 *  no import statement is. Accepted rather than solved with a full tokenizer. */
function stripComments(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      // Line comment: drop to end of line, keep the newline so line-anchored patterns still work.
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      // String literal: copy through the matching close quote, honouring backslash escapes.
      // Template literals with `${…}` are copied verbatim — an import specifier is never built
      // from one, so nested quotes inside the expression cost nothing.
      const q = c;
      let j = i + 1;
      while (j < n && text[j] !== q) {
        if (text[j] === '\\') j++;
        if (q !== '`' && text[j] === '\n') break; // an unterminated ' or " ends at the line
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

describe('every research module is reachable, or says why not', () => {
  const sources = allSourceFiles().map((abs) => {
    const text = fs.readFileSync(abs, 'utf8');
    return { abs, text, code: stripComments(text) };
  });
  const modules = LIBRARY_DIRS.flatMap(listModules);

  // ── A CONTROL ON THIS CHECK'S OWN COVERAGE ────────────────────────────────────────────────
  //
  // Reverting the .tsx filter made this whole file pass again, silently. The orphan check found
  // nothing because components were no longer scanned; the stale-entry check found nothing because
  // it only flags listed modules that HAVE a caller. Coverage vanished and every assertion stayed
  // green — which is the same failure as a search that cannot return a positive.
  //
  // So the scan proves it can see the categories it claims to cover, before it reports on them.
  it('scans both .ts and .tsx — a guard that stops covering a file type reports nothing, loudly', () => {
    expect(modules.some((m) => m.endsWith('.ts')), 'no .ts modules scanned').toBe(true);
    expect(
      modules.some((m) => m.endsWith('.tsx')),
      'no .tsx scanned — React components are invisible to this check again',
    ).toBe(true);
    expect(
      modules.some((m) => m.startsWith('app/admin/research/components/')),
      'the app-side research components are not being scanned',
    ).toBe(true);
  });


  it('finds the modules and the sources at all', () => {
    // A sweep that silently matched nothing would pass forever and defend nothing.
    expect(modules.length).toBeGreaterThan(50);
    expect(sources.length).toBeGreaterThan(200);
  });

  it('has no unreachable module that is not a recorded decision', () => {
    const orphans = modules
      .filter((m) => !(m in KNOWN_UNREACHABLE))
      .filter((m) => !hasCaller(m, sources));

    expect(orphans, orphans.length
      ? `These modules have no non-test caller. Either wire them, or add them to KNOWN_UNREACHABLE ` +
        `with the reason:\n  ${orphans.join('\n  ')}`
      : '').toEqual([]);
    // 2.5 s alone after B*6 quadrupled the module count; the full-suite run is slower and vitest's
    // default is 5 s. A structural guard that fails on a timer teaches people to re-run past it.
  }, 30_000);

  it('has no stale entry — a module on the list that DID get wired', () => {
    // The list is an inventory, and an inventory nobody prunes stops being read. When something is
    // finally connected, its excuse should disappear with it.
    const stale = Object.keys(KNOWN_UNREACHABLE)
      .filter((m) => fs.existsSync(path.join(REPO, m)))
      .filter((m) => hasCaller(m, sources));

    expect(stale, stale.length
      ? `These are now wired — remove them from KNOWN_UNREACHABLE:\n  ${stale.join('\n  ')}`
      : '').toEqual([]);
  });

  it('has no entry for a module that no longer exists', () => {
    const gone = Object.keys(KNOWN_UNREACHABLE)
      .filter((m) => !fs.existsSync(path.join(REPO, m)));
    expect(gone, gone.length ? `Deleted modules still listed:\n  ${gone.join('\n  ')}` : '').toEqual([]);
  });

  it('gives every allowed exception an actual reason', () => {
    const empty = Object.entries(KNOWN_UNREACHABLE)
      .filter(([, why]) => why.trim().length < 30)
      .map(([m]) => m);
    expect(empty, 'An exception without a reason is the defect wearing a permission slip').toEqual([]);
  });
});

describe('this check has been watched failing', () => {
  // A check nobody has seen fail is indistinguishable from no check at all — which is, exactly, the
  // defect this whole file exists to catch. Three of the four structural checks in this repo were
  // broken on first write in ways that made them pass while defending nothing, so "it passes" is not
  // evidence that it works.
  //
  // Verified 2026-08-03 by dropping an unreferenced module into `worker/src/services/` and watching
  // the assertion above name it. Recorded here rather than automated: a self-mutating test that
  // writes files into the source tree can leave debris when it dies mid-run, and the debris is
  // itself an unreachable module.
  it('names the directories it would catch a new orphan in', () => {
    expect(LIBRARY_DIRS).toContain('worker/src/services');
    expect(LIBRARY_DIRS).toContain('lib/research');
    expect(LIBRARY_DIRS).toContain('worker/src/lib');
    expect(LIBRARY_DIRS).toContain('worker/src/infra');
    // B*6: the directories the adapters, sources and the Bell module live in.
    for (const d of ['adapters', 'sources', 'counties/bell', 'exports', 'ai', 'billing', 'services/purchase-adapters']) {
      expect(LIBRARY_DIRS).toContain(`worker/src/${d}`);
    }
  });

  it('a module named only in a comment is NOT wired — and one named in an import IS', () => {
    // The blind spot this guard carried from its first version: a backtick in prose is a quote.
    // Both cases below are the SAME text minus the comment markers, so if stripComments stops
    // running, the first assertion is what fails.
    const prose = 'export const x = 1;\n// see `./services/some-orphan.js` for why\n/* and \'./services/some-orphan\' too */\n';
    const real = 'import { y } from \'./services/some-orphan.js\';\n';
    const url = 'const u = \'https://example.com/some-orphan\'; // not a comment start';
    const fake = (text: string) => [{ abs: '/elsewhere.ts', text, code: stripComments(text) }];
    expect(hasCaller('worker/src/services/some-orphan.ts', fake(prose))).toBe(false);
    expect(hasCaller('worker/src/services/some-orphan.ts', fake(real))).toBe(true);
    // A `//` inside a string literal is not a comment; the literal survives intact.
    expect(stripComments(url)).toContain('https://example.com/some-orphan');
    expect(stripComments(url)).not.toContain('not a comment start');
  });

  it('treats a test file as NOT a caller, which is the whole point', () => {
    // If tests counted, every module with a unit test would look wired and the check would pass on
    // all eleven orphans it currently records.
    const src = fs.readFileSync(
      path.join(REPO, 'worker/src/__tests__/research-modules-are-reachable.test.ts'), 'utf8');
    expect(src).toContain("entry.name === '__tests__'");
  });
});
