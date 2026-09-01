// __tests__/research/scope-guard.test.ts — Phase S.
//
// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────────────────────────
//
// Owner, 2026-08-31: *"if we are researching a property in a state we have not built the system for
// yet, then it should realize that and tell the user and not actually run the research."*
//
// Before `lib/research/scope.ts` there was nothing to realise it with. `getClerkByFIPS()` strips a
// leading `48` — the Texas state FIPS — and an unrecognised county falls through to a TexasFile
// entry with `fallback: true` rather than failing. So an out-of-state address geocoded, routed to a
// Texas aggregator, and spent money reporting on no property at all.
//
// ── THE ASSERTIONS THAT MATTER ARE THE REFUSALS ─────────────────────────────────────────────────
//
// A scope check that says yes to everything passes every "supported" test in this file. So the
// cases below are weighted the other way: what it must REFUSE, and — the pair that keeps a guard
// honest — that it does not refuse the county this firm actually works in.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkScope, normalizeState, scopeRefusal, SUPPORTED_STATES,
} from '@/lib/research/scope';
import { scopeLabel, scopeDescribedBy } from '@/app/admin/research/components/ScopeNotice';
import { stripJs } from '@/scripts/audit-research-contrast.mjs';
import { CLERK_REGISTRY } from '@/worker/src/adapters/clerk-registry';
import { TEXAS_COUNTIES } from '@/worker/src/lib/county-fips';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the data this is derived from', () => {
  // Control. Every verdict below comes out of these two lists; if either is empty or tiny, the
  // whole file passes by measuring nothing.
  it('has the registry and the county list', () => {
    expect(TEXAS_COUNTIES.length, 'Texas has 254 counties').toBe(254);
    expect(CLERK_REGISTRY.length).toBeGreaterThanOrEqual(20);
  });

  it('and the registry really does carry all three statuses', () => {
    // If the registry were all one status, `degraded` and `unavailable` would be untestable
    // against real data and the branches below would only ever be exercised by fixtures.
    const statuses = new Set(CLERK_REGISTRY.map((e) => e.status));
    expect([...statuses].sort()).toEqual(['implemented', 'stub', 'unavailable']);
  });
});

describe('the state check, which is the whole point', () => {
  it('REFUSES a state we have not built', () => {
    const r = checkScope('NM', 'Sandoval');
    expect(r.verdict).toBe('out-of-scope');
    expect(r.canRun, 'a run must not start outside a supported state').toBe(false);
    expect(r.message).toContain('NM');
  });

  it('names the states we DO cover, so the message is actionable', () => {
    expect(checkScope('NM', 'Sandoval').nextStep).toContain('Texas');
  });

  it('answers the STATE before the county, because that is the useful fact', () => {
    // Checking the county first reports "Sandoval is not a Texas county" — true, useless, and it
    // points the operator at the wrong field.
    const r = checkScope('NM', 'Sandoval');
    expect(r.message).not.toContain('254');
    expect(r.message).toContain('not built research for');
  });

  it.each(['TX', 'tx', 'Texas', 'texas', ' TX '])('accepts %s as Texas', (input) => {
    expect(normalizeState(input)).toBe('TX');
  });

  it.each(['NM', 'New Mexico', 'OK', 'Oklahoma', 'LA'])('does NOT read %s as Texas', (input) => {
    expect(normalizeState(input)).not.toBe('TX');
  });

  it('treats an empty state as "not enough information", not as a refusal', () => {
    // A blank form is not an out-of-scope property. Reporting one as the other would put a red
    // refusal on a screen somebody has not filled in yet.
    expect(checkScope('', '').verdict).toBe('unknown');
    expect(checkScope(null, null).verdict).toBe('unknown');
    expect(checkScope(undefined, 'Bell').verdict).toBe('unknown');
  });
});

describe('the county check', () => {
  it('SUPPORTS the county this firm actually works in', () => {
    // The other half of the control. A guard that refuses everything also passes every refusal
    // test above, and this is the case that would make it obvious in production.
    const r = checkScope('TX', 'Bell');
    expect(r.verdict).toBe('supported');
    expect(r.canRun).toBe(true);
    expect(r.needsConfirmation).toBe(false);
    expect(r.adapter?.status).toBe('implemented');
  });

  it.each(['Bell', 'bell', 'BELL', 'Bell County', ' bell county '])('reads %s as Bell', (input) => {
    expect(checkScope('TX', input).county).toBe('Bell');
  });

  it('REFUSES a county that is not one of the 254', () => {
    const r = checkScope('TX', 'Nowhere');
    expect(r.verdict).toBe('out-of-scope');
    expect(r.canRun).toBe(false);
  });

  it('REFUSES a county whose clerk has no online system', () => {
    // `unavailable` is a real status on three counties. The run would return nothing, so it does
    // not start — and the message says what has to happen instead.
    const off = CLERK_REGISTRY.find((e) => e.status === 'unavailable')!;
    const r = checkScope('TX', off.county);
    expect(r.verdict).toBe('unavailable');
    expect(r.canRun).toBe(false);
    expect(r.nextStep.length, 'a refusal with no next step is a dead end').toBeGreaterThan(0);
  });

  it('allows a STUB county but asks for confirmation first', () => {
    // The case two verdicts cannot express. 18 of the 25 registry entries are stubs: genuinely
    // researchable through the aggregator, at roughly $1–3 a document.
    const stub = CLERK_REGISTRY.find((e) => e.status === 'stub')!;
    const r = checkScope('TX', stub.county);
    expect(r.verdict).toBe('degraded');
    expect(r.canRun, 'a stub county is a price, not a prohibition').toBe(true);
    expect(r.needsConfirmation).toBe(true);
    expect(r.message).toMatch(/charged|cost|aggregator/i);
  });

  it('treats an unregistered TEXAS county as degraded, not as out of scope', () => {
    // 254 counties, 25 in the registry. The other 229 route to the aggregator exactly as a stub
    // does — refusing them would refuse most of the state.
    const registered = new Set(CLERK_REGISTRY.map((e) => e.county.toLowerCase()));
    const unregistered = TEXAS_COUNTIES.find((c) => !registered.has(c.name.toLowerCase()))!;
    const r = checkScope('TX', unregistered.name);
    expect(r.verdict, `${unregistered.name} is a real Texas county`).toBe('degraded');
    expect(r.canRun).toBe(true);
  });

  it('and asks for the county when the state is fine but the county is missing', () => {
    const r = checkScope('TX', '');
    expect(r.verdict).toBe('unknown');
    expect(r.canRun).toBe(false);
    expect(r.message).toMatch(/county/i);
  });
});

describe('every verdict is renderable', () => {
  // A refusal the UI cannot draw is a 500 with extra steps.
  it.each([
    ['out-of-scope', 'NM', 'Sandoval'],
    ['unavailable', 'TX', CLERK_REGISTRY.find((e) => e.status === 'unavailable')!.county],
    ['degraded', 'TX', CLERK_REGISTRY.find((e) => e.status === 'stub')!.county],
    ['supported', 'TX', 'Bell'],
    ['unknown', '', ''],
  ])('%s carries a message', (verdict, state, county) => {
    const r = checkScope(state, county);
    expect(r.verdict).toBe(verdict);
    expect(r.message.length, 'every verdict has to say something').toBeGreaterThan(20);
    expect(typeof r.canRun).toBe('boolean');
    expect(typeof r.needsConfirmation).toBe('boolean');
  });

  it('never asks for confirmation of something it will not run anyway', () => {
    for (const [state, county] of [['NM', 'Sandoval'], ['TX', 'Nowhere'], ['', '']]) {
      const r = checkScope(state, county);
      expect(r.canRun || !r.needsConfirmation, `${state}/${county}`).toBe(true);
    }
  });

  it('the refusal body carries what the screen needs', () => {
    const body = scopeRefusal(checkScope('NM', 'Sandoval'));
    expect(body.error).toBeTruthy();
    expect(body.scope.verdict).toBe('out-of-scope');
    expect(body.scope.supportedStates).toEqual(['Texas']);
    expect(body.scope.nextStep).toBeTruthy();
  });
});

describe('nothing here is a second copy of the registry', () => {
  it('SUPPORTED_STATES is the only hand-written list, and it is one line', () => {
    // G12 in the previous plan doc: four hand-written copies of one list. A "supported counties"
    // array beside `CLERK_REGISTRY` would go stale the first time somebody built an adapter, and
    // it would go stale silently — the run would still be refused and nobody would know why.
    const src = read('lib/research/scope.ts');
    expect(src).not.toMatch(/SUPPORTED_COUNTIES/);
    expect(src, 'the verdict must come from the registry').toContain('getClerkByCountyName');
    expect(src, 'and the county list from the county list').toContain('TEXAS_COUNTIES');
  });

  it('so adding a county to the registry is the only edit needed to support it', () => {
    // Proved by construction rather than by a fixture: every implemented entry reports supported.
    for (const e of CLERK_REGISTRY.filter((x) => x.status === 'implemented')) {
      expect(checkScope('TX', e.county).verdict, e.county).toBe('supported');
    }
  });

  it('and SUPPORTED_STATES really is just Texas today, which is the honest state of the system', () => {
    expect(SUPPORTED_STATES.map((s) => s.code)).toEqual(['TX']);
  });
});

// ── THE ROUTES, WHICH ARE THE PART THAT ACTUALLY HAS TO HOLD ────────────────────────────────────
//
// A scope check that only exists in `lib/` is a scope check the batch form walks around. This
// repository's most-repeated defect is "authored but not wired" — eleven recorded instances of work
// that was designed, tested and written up as done with nothing calling it — so the assertions
// below are about the CALLERS.
//
// Read as source rather than executed: both routes open with `auth()` and a Supabase client, and
// standing those up would test the mocks. What matters is verifiable statically and is exactly what
// went wrong before: whether the guard is *there*, on *both* paths, and *before* the expensive call.

describe('both run paths are guarded', () => {
  const ANALYZE = 'app/api/admin/research/[projectId]/analyze/route.ts';
  const BATCH = 'app/api/admin/research/batch/route.ts';

  it.each([ANALYZE, BATCH])('%s imports the scope check', (route) => {
    expect(read(route)).toContain("from '@/lib/research/scope'");
  });

  it.each([ANALYZE, BATCH])('%s refuses with 422, not a bare error', (route) => {
    const src = read(route);
    expect(src).toContain('scopeRefusal(');
    expect(src, 'the request is well formed; the property is not one we cover').toContain('status: 422');
  });

  // ── THE TWO ASSERTIONS BELOW EXIST BECAUSE THE FIRST VERSIONS SURVIVED MUTATION ───────────────
  //
  // `checkScope` appearing before `analyzeProject`, plus a `scopeRefusal(` somewhere in the file,
  // is satisfied by a guard whose condition is `if (false)`. Replacing `if (!scope.canRun)` with
  // exactly that left all 46 tests green — the check was present, imported, ordered correctly, and
  // did nothing. Presence is not effect, and this repository has shipped that distinction before.
  //
  // So the condition itself is read: the branch that returns the refusal must be the branch that
  // asks whether the run may proceed.

  it('the in-app refusal is BRANCHED ON canRun, not merely present', () => {
    const src = read(ANALYZE);
    const at = src.indexOf('scopeRefusal(scope)');
    expect(at, 'the refusal is gone').toBeGreaterThan(-1);
    // The nearest `if (…) {` above the return is the one that governs it.
    const cond = /if \(([^)]*)\)\s*\{[^{}]*$/.exec(src.slice(0, at))?.[1] ?? '';
    expect(cond, `the refusal is guarded by \`if (${cond})\`, which never consults the scope`)
      .toContain('scope.canRun');
  });

  it('the batch refusal tests the list it built, not a different one', () => {
    // Renaming the filtered list also survived: the `.filter((r) => !r.scope.canRun)` was still in
    // the file and `rows:` was still in the file, so both assertions passed while nothing was
    // checked. tsc would have caught that particular slip — and a guard that relies on the compiler
    // to notice it is one refactor away from not being a guard.
    const src = read(BATCH);
    const name = /const (\w+) = body\.properties[\s\S]*?\.filter\(\(r\) => !r\.scope\.canRun\);/
      .exec(src)?.[1];
    expect(name, 'the per-row scope filter is gone').toBeTruthy();
    expect(src, `${name} is built and never tested`).toContain(`if (${name}.length > 0) {`);
  });

  it('the in-app path checks scope BEFORE starting the analysis', () => {
    // Order is the entire assertion. A check after `analyzeProject()` refuses a run that is already
    // running, which is worse than no check: it reports a failure and spends the money anyway.
    const src = read(ANALYZE);
    const guard = src.indexOf('checkScope(');
    const start = src.indexOf('analyzeProject(projectId, config)');
    expect(guard, 'the guard is missing').toBeGreaterThan(-1);
    expect(start, 'the analysis start moved').toBeGreaterThan(-1);
    expect(guard, 'the scope check runs after the analysis has already started').toBeLessThan(start);
  });

  it('the batch path checks scope BEFORE the worker is told anything', () => {
    const src = read(BATCH);
    const guard = src.indexOf('checkScope(');
    const dispatch = src.indexOf('/research/batch`');
    expect(guard).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(-1);
    expect(guard, 'the batch is queued before its scope is checked').toBeLessThan(dispatch);
  });

  it('the in-app path selects the columns it checks', () => {
    // `checkScope(project.state, project.county)` against a row selected as `id, status` reads two
    // `undefined`s and returns `unknown` — which is `canRun: false`, so every run would be refused.
    // The guard would look like it worked and would be wrong in the safest-looking direction.
    const src = read(ANALYZE);
    expect(src).toContain("select('id, status, state, county')");
  });

  it('the batch path reports EVERY bad row, not just the first', () => {
    // Fifty rows fixed one refusal at a time is fifty round trips, and the operator would rightly
    // stop trusting the form.
    const src = read(BATCH);
    expect(src).toContain('.filter((r) => !r.scope.canRun)');
    expect(src).toContain('rows:');
  });

  it('and does NOT refuse a batch for a degraded row', () => {
    // A stub county is a price. The spend limit on that form is the control for it, and refusing
    // here would make most of Texas unbatchable.
    const src = read(BATCH);
    expect(src, 'the batch guard must key on canRun, not on the verdict').not.toMatch(/verdict\s*===\s*'degraded'/);
  });
});

// ── THE THREE SURFACES THAT START A RUN ─────────────────────────────────────────────────────────
//
// The API refuses, and that is the guard. These are the screens, and the reason they are tested is
// that a button which starts a run it already knows will be refused is worse than a disabled one:
// the operator learns the answer after the wait instead of before the click.
//
// The property that matters is not "there is a notice" — it is that all three read the SAME
// function the API refuses on. Two implementations of "is this in scope" is G12 with money attached.

describe('every surface that can start a run consults the same check', () => {
  const SURFACES = {
    'the project page': 'app/admin/research/[projectId]/page.tsx',
    'the create modal': 'app/admin/research/_tabs/ProjectsTab.tsx',
    'the batch form': 'app/admin/research/_tabs/PipelineTab.tsx',
  };

  it.each(Object.entries(SURFACES))('%s imports checkScope', (_name, file) => {
    expect(read(file)).toContain("from '@/lib/research/scope'");
  });

  it.each(Object.entries(SURFACES))('%s renders the notice', (_name, file) => {
    expect(read(file)).toContain('<ScopeNotice');
  });

  it('and none of them re-implements the verdict', () => {
    // The tell would be a second list of states or counties living in a component. Every one of
    // these reads the module; none of them decides anything itself.
    for (const file of Object.values(SURFACES)) {
      const src = read(file);
      expect(src, `${file} hard-codes a state list`).not.toMatch(/\[\s*'TX'\s*,\s*'/);
      expect(src, `${file} decides scope itself`).not.toMatch(/verdict\s*===\s*'out-of-scope'/);
    }
  });

  it('the project page DISABLES the run button, not just decorates it', () => {
    // A notice beside an enabled button is a note somebody scrolls past. `canRun` has to reach the
    // `disabled` attribute or the guard is advisory on the one screen most runs start from.
    const src = read(SURFACES['the project page']);
    expect(src).toContain('disabled={!scope.canRun}');
    expect(src).toContain('disabled={!hasInputs || !scope.canRun}');
  });

  it('and points the button at the notice for a screen reader', () => {
    // A disabled button with no accessible reason is a dead end for anyone not looking at the
    // amber box beside it.
    const src = read(SURFACES['the project page']);
    expect(src).toContain('aria-describedby={scopeDescribedBy(scope,');
  });

  it('the batch form blocks submit on any refused row', () => {
    // The route returns 422 for the WHOLE batch on one bad row, so a form that let you submit is a
    // guaranteed round trip to a red banner.
    const src = read(SURFACES['the batch form']);
    expect(src).toContain('blockedRows.length > 0');
    expect(src).toContain('disabled={batchCreating || blockedRows.length > 0}');
  });

  it('and counts only rows that are otherwise ready', () => {
    // A half-typed row is not a refusal. Without this the submit disables itself the moment
    // somebody adds an empty row, which reads as the form breaking.
    expect(read(SURFACES['the batch form'])).toContain('isReadyRow(x.r) && !x.scope.canRun');
  });

  it('the batch form defaults state the SAME WAY the API does', () => {
    // `state || 'TX'` on one side and something else on the other is how a form comes to promise
    // what the API refuses. Both sides, one default, asserted against each other.
    expect(read(SURFACES['the batch form'])).toContain("checkScope(r.state || 'TX', r.county)");
    expect(read('app/api/admin/research/batch/route.ts')).toContain("checkScope(p.state ?? 'TX', p.county)");
  });

  it('the create modal warns but does NOT block creating a record', () => {
    // Deliberate. Creating a row for a property we cannot research is reasonable — you may be
    // about to correct the state. What is refused is the RUN.
    const src = read(SURFACES['the create modal']);
    expect(src).toContain('<ScopeNotice');
    expect(src, 'creating a project must not be gated on scope')
      .toContain('disabled={!hasIdentifier || creating}');
  });
});

describe('the notice itself', () => {
  it('says nothing when there is nothing to say', () => {
    // A green tick beside every form field is noise, and a blank form is not a problem to report.
    expect(scopeLabel('supported')).toBeNull();
    expect(scopeLabel('unknown')).toBeNull();
  });

  it('carries a WORD for each state it reports, not just a colour', () => {
    // Red and amber say nothing to a reader who cannot tell them apart, and this is a decision
    // about money and about whether a job can proceed.
    expect(scopeLabel('degraded')).toBe('Extra cost');
    expect(scopeLabel('unavailable')).toBe('Cannot run');
    expect(scopeLabel('out-of-scope')).toBe('Cannot run');
  });

  it('points aria-describedby only where there is a notice to point at', () => {
    const supported = checkScope('TX', 'Bell');
    const blocked = checkScope('NM', 'Sandoval');
    expect(scopeDescribedBy(supported, 'x')).toBeUndefined();
    expect(scopeDescribedBy(blocked, 'x')).toBe('x');
  });

  it('brings its own stylesheet', () => {
    // Third instance in this repo of a shared component rendering completely unstyled because it
    // relied on a route-scoped sheet the caller did not import. A caller cannot forget this one.
    const src = read('app/admin/research/components/ScopeNotice.tsx');
    expect(src).toContain("import './ScopeNotice.css'");
  });

  it('and takes every colour from a token that EXISTS', () => {
    // `--color-danger-text` was the first draft and is defined nowhere. A token that is read and
    // undefined renders correctly through its fallback while quietly opting the whole notice out
    // of theming — which is exactly the defect tokens.css:110 records.
    const css = read('app/admin/research/components/ScopeNotice.css');
    const tokens = css.match(/var\((--[a-z-]+)/g)?.map(m => m.slice(4)) ?? [];
    expect(tokens.length, 'the notice hard-codes its colours').toBeGreaterThanOrEqual(6);
    const defined = read('app/styles/tokens.css') + read('app/styles/themes.css');
    for (const t of tokens) {
      expect(defined, `${t} is read by ScopeNotice.css and defined nowhere`).toContain(`${t}:`);
    }
  });
});

// ── DEGRADED IS A PRICE, SO THE FORM SAYS WHICH ROWS PAY IT (Phase S4) ──────────────────────────
//
// The batch form's estimate read: *"A ceiling, not a forecast: counties with a free portal spend
// nothing."* True, and unactionable — it says SOME of these are free without saying which, so an
// operator looking at "Up to $500.00" has no way to tell whether that means five dollars or five
// hundred.
//
// The scope check already knows, per row. `degraded` is exactly the paying case (no adapter of our
// own, so the TexasFile aggregator, charged per document) and `supported` is exactly the free one.

describe('the batch form names which rows cost money', () => {
  const BATCH = read('app/admin/research/_tabs/PipelineTab.tsx');

  it('counts the paying rows off the SCOPE verdict, not a second rule', () => {
    // A hand-written "is this county free" test beside `checkScope` would be a fourth copy of the
    // registry, and would disagree with the guard the moment an adapter shipped.
    expect(BATCH).toContain("rowScopes[i]!.verdict === 'degraded'");
    expect(BATCH).toContain("rowScopes[i]!.verdict === 'supported'");
  });

  it('and counts only rows that would actually run', () => {
    // A half-typed row is not a cost. Counting it would inflate the number somebody is deciding on.
    expect(BATCH).toContain("isReadyRow(r) && rowScopes[i]!.verdict === 'degraded'");
  });

  it('says the number rather than gesturing at it', () => {
    expect(BATCH).toContain('{payingRows}');
    expect(BATCH).toContain('{freeRows}');
    // stripJs: the comment in PipelineTab that explains why the vague sentence was replaced
    // QUOTES it. Thirteenth time a check in this repository has matched its own documentation.
    expect(stripJs(BATCH), 'the vague version is back')
      .not.toContain('counties with a free portal spend nothing');
  });

  it('and that check reads CODE, not the note explaining the change', () => {
    expect(BATCH, 'the explanatory comment is gone, so the control above is vacuous')
      .toContain('counties with a free portal spend nothing');
  });

  it('and still says the estimate is a ceiling', () => {
    // Removing that would be the opposite error: most runs in this firm's working area spend
    // nothing, so presenting the ceiling as a forecast would make every batch look unaffordable.
    expect(BATCH).toContain('A ceiling, not a forecast');
  });
});
