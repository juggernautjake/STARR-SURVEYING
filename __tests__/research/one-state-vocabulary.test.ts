// __tests__/research/one-state-vocabulary.test.ts — Phase E2.
//
// ── EMPTY, FAILED AND PENDING ARE THREE DIFFERENT ANSWERS ───────────────────────────────────────
//
// Measured across the seven research tabs before this slice: FIVE loading treatments and SIX error
// ones. `research-pipeline__loading` · an inline `styles.muted` object · a bare `<p>Loading…</p>` ·
// an `⏳` emoji · "Searching…". For errors: Tailwind `text-gray-500 text-sm mb-6` ·
// `research-pipeline__error-banner` · `pw__error` · `styles.error` — and the one that was an actual
// bug:
//
//     ProjectsTab rendered a load FAILURE inside `research-page__empty-title`
//     with an inline `#DC2626`.
//
// A failed request looked like an empty list wearing red. They are not interchangeable: **empty
// means the query worked** and there is genuinely nothing to show, so the useful response says what
// would put something there. **Failed means we do not know** — so it must offer a retry and must
// never imply the list is empty. Telling somebody they have no projects when the request never
// returned is worse than telling them nothing at all.
//
// ── WHY BILLING AND LIBRARY ARE NOT IN THIS SLICE ───────────────────────────────────────────────
//
// They are entirely dark-themed pages — `min-h-screen bg-gray-950`, their own `<header>` — left
// over from before the portal consolidation, while the other five tabs use zero dark Tailwind
// (counted, not assumed). Swapping only their ERROR state to the light primitive would make them
// inconsistent with their own surroundings: worse than the inconsistency being fixed. They need
// re-theming wholesale, which is its own slice.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { emptyLibraryCopy } from '@/app/admin/research/_tabs/LibraryTab';

const ROOT = process.cwd();
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const WIRED = [
  'app/admin/research/_tabs/ProjectsTab.tsx',
  'app/admin/research/_tabs/PipelineTab.tsx',
  'app/admin/research/_tabs/SelfHealTab.tsx',
];

describe('the tabs in this slice use the shared vocabulary', () => {
  it('each imports the primitives rather than rolling its own', () => {
    for (const f of WIRED) {
      expect(read(f), `${f} should import from components/ui`)
        .toMatch(/from '\.\.\/components\/ui'/);
    }
  });

  it('ProjectsTab no longer renders a failure as an empty state', () => {
    const src = read('app/admin/research/_tabs/ProjectsTab.tsx');

    // The precise shape of the old bug: the empty-state title class with a red inline colour.
    expect(src, 'an error must not borrow the empty-state markup')
      .not.toMatch(/empty-title" style=\{\{ color: '#DC2626' \}\}/);

    // `toContain('<ErrorState')` alone was NOT enough — a mutation that wrapped the whole thing
    // back inside `<div className="research-page__empty">` and renamed the component to
    // `<ErrorStateX` passed it, because that string still contains `<ErrorState`. Asserting the
    // whole BRANCH is what catches the regression that actually matters: an error rendered inside
    // the empty-state container looks like an empty list again, whatever the component is called.
    const start = src.indexOf('{!loading && loadError && (');
    expect(start, 'the error branch should exist').toBeGreaterThan(-1);
    const branch = src.slice(start, src.indexOf('        )}', start));

    expect(branch, 'the error must be its own state, not dressed as an empty one')
      .not.toContain('research-page__empty');
    expect(branch).toMatch(/<ErrorState\s/);
    expect(branch, 'and it must still offer a way out').toContain('onRetry={loadProjects}');
  });

  it('an error state always distinguishes itself from an empty one', () => {
    // ErrorState carries role="alert"; EmptyState deliberately carries nothing. An empty list is
    // not an interruption, and announcing it as one trains people to ignore the ones that are.
    const ui = read('app/admin/research/components/ui/index.tsx');
    const errorBlock = ui.slice(ui.indexOf('export function ErrorState'));
    expect(errorBlock.slice(0, 400)).toContain('role="alert"');

    // Scoped to the FUNCTION BODY, not to everything between the two exports. The first version of
    // this line sliced to the next export and swept up the prose between them — including the
    // sentence in this slice's own header explaining that the error gets role="alert" and the empty
    // state does not. It failed on the comment describing the rule it was checking.
    //
    // Fourth guard in this repository to match its own explanatory text this month. Long comments
    // are the house style here; any assertion over this source must stop at the code.
    const emptyStart = ui.indexOf('export function EmptyState');
    const emptyBlock = ui.slice(emptyStart, ui.indexOf('\n}', emptyStart));
    expect(emptyBlock, 'an empty list must not announce itself as an alert').not.toContain('role="alert"');
  });

  it('the empty state is only shown when the load actually SUCCEEDED', () => {
    // PipelineTab showed "No batch jobs yet" whenever the list was empty — including when the
    // fetch had just failed and left it empty. Two contradictory messages at once.
    expect(read('app/admin/research/_tabs/PipelineTab.tsx'))
      .toContain('{!loading && !loadError && batchJobs.length === 0 &&');
  });

  it('the loading label says WHAT is loading', () => {
    // "Loading…" alone tells a returning user nothing about which of several fetches is slow.
    const pipeline = read('app/admin/research/_tabs/PipelineTab.tsx');
    expect(pipeline).toMatch(/<LoadingState label="[^"]+"/);
  });

  it('SelfHealTab dropped its private inline error style', () => {
    const src = read('app/admin/research/_tabs/SelfHealTab.tsx');
    expect(src, 'the style object should go with its last caller').not.toContain("styles.error");
    expect(src).toContain('<ErrorState');
  });
});

describe('the primitives are honest about motion and overflow', () => {
  const css = read('app/admin/research/components/ui/primitives.css');

  it('the spinner stops for prefers-reduced-motion', () => {
    // Some readers cannot use a spinner and some are made unwell by one. The label carries the
    // whole message on its own, so the animation is the part that goes.
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toContain('.rui-loading__spinner');
    expect(block).toContain('animation: none');
  });

  it('a long server message wraps instead of scrolling the page sideways', () => {
    // A server message can be one unbroken token — a URL, a stack frame. Without this it widens
    // the panel and takes the whole page with it.
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('the retry button has a visible focus ring', () => {
    expect(css).toContain('.rui-error__retry:focus-visible');
  });
});

describe('the dark pair is recorded, not forgotten', () => {
  // ── THIS CHECK PASSED FOR THE WRONG REASON ────────────────────────────────────────────────────
  //
  // It used to run `read(f).includes('min-h-screen bg-gray-950')` over the RAW file. When LibraryTab
  // was re-themed (E2b, 2026-08-31) the check still counted it as dark — because the comment
  // explaining the re-theme quotes the very string being searched for.
  //
  // So the deferral tripwire, whose entire job is to fire when a deferral stops applying, went green
  // on a file that no longer contained a single dark utility in live code. Ninth time a guard in
  // this repository has matched its own prose. Comments are stripped now, and a control below
  // proves the stripper did not simply blank the file.

  const LIB = 'app/admin/research/_tabs/LibraryTab.tsx';
  const BILL = 'app/admin/research/_tabs/BillingTab.tsx';

  /** Comments removed, so prose about a class cannot be mistaken for a use of it. */
  function code(f: string): string {
    return read(f)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');
  }

  it('the comment stripper leaves the component behind', () => {
    // Control. An over-eager stripper returns something close to empty, and an empty string contains
    // no dark utilities either — which is the same false green by a different route.
    expect(code(LIB)).toContain('export default function LibraryTab');
    expect(code(LIB).length).toBeGreaterThan(3000);
  });

  it('LibraryTab is re-themed — no dark utility survives in live code', () => {
    const src = code(LIB);
    for (const util of ['min-h-screen', 'bg-gray-950', 'bg-gray-900', 'text-gray-100', 'border-gray-800']) {
      expect(src, `${util} is still applied in LibraryTab`).not.toContain(util);
    }
  });

  it('and it uses the shared states instead', () => {
    expect(read(LIB)).toMatch(/from '\.\.\/components\/ui'/);
    for (const prim of ['LoadingState', 'ErrorState', 'EmptyState']) {
      // `[\s/>]` matters: `toContain('<ErrorState')` also matches `<ErrorStateX`, so renaming the
      // component to something that does not exist passed this check. Fourth time that substring
      // flaw has got through in this repository.
      expect(read(LIB), `${LIB} should render <${prim}>`).toMatch(new RegExp(`<${prim}[\\s/>]`));
    }
  });

  it('tells the two emptinesses apart — as logic, not as three strings', () => {
    // Every earlier version of this was a text search over the file, and a mutation that flipped
    // ONE of the three inline conditions passed it: the copy was all still present, the component
    // just disagreed with itself about which state it was in. The decision is a pure function now,
    // so a logic change is one call away rather than invisible.
    const filtered = emptyLibraryCopy(true);
    const genuine = emptyLibraryCopy(false);

    expect(filtered.canClear, 'a filtered-to-nothing list must offer to clear them').toBe(true);
    expect(genuine.canClear, 'there is nothing to clear on a genuinely empty library').toBe(false);

    // The advice must actually differ. Identical copy for both is the bug this replaced.
    expect(filtered.title).not.toBe(genuine.title);
    expect(filtered.body).not.toBe(genuine.body);

    // And each must give the advice that fits ITS cause — swapping them would still differ.
    expect(filtered.body).toMatch(/filter/i);
    expect(genuine.body).toMatch(/research run/i);
    expect(genuine.body, 'do not tell somebody with an active filter to go harvest documents')
      .not.toMatch(/filter/i);
  });

  it('and the tab renders that decision rather than its own copy', () => {
    // Filtered-to-nothing and genuinely-empty are not the same state, and the advice differs.
    // The dark version said "Run a research project to harvest documents" to somebody who might
    // have 900 documents sitting behind an active county filter — wrong advice, confidently given.
    const src = read(LIB);

    // ONE binding, not the condition written out three times. A mutation that flipped only the
    // title's copy of it left the body and the action correct, so the check passed while the
    // component disagreed with itself. There is now nothing to flip independently.
    expect(src).toContain('const filtersNarrowed =');
    expect(src).toContain('emptyLibraryCopy(filtersNarrowed)');

    // Testing the helper is not testing the tab. Hard-coding `title={'Your document library is
    // empty.'}` left every string the helper returns still sitting in the file, so a copy-presence
    // check passed on a component that had stopped consulting the decision at all. This is the
    // caller-side assertion: all three fields have to be read.
    for (const field of ['emptyCopy.title', 'emptyCopy.body', 'emptyCopy.canClear']) {
      expect(src, `the empty state must render ${field}`).toContain(field);
    }
  });

  it('BillingTab is still dark, and that is why it is still deferred', () => {
    // The remaining half of E2b. If somebody re-themes it, this fails and points at the plan doc —
    // which is the intent. A deferral that no longer applies should not sit silently for months.
    expect(
      code(BILL),
      'If BillingTab is no longer a dark full-page layout, wire it to the shared states and close '
      + 'E2b in docs/planning/in-progress/RESEARCH_UI_OVERHAUL_2026-08-30.md.',
    ).toContain('min-h-screen bg-gray-950');
  });
});
