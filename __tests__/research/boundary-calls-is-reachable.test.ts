// __tests__/research/boundary-calls-is-reachable.test.ts
//
// ── TWO WORKING ENDPOINTS NOTHING COULD REACH ───────────────────────────────────────────────────
//
// `BoundaryCallsPanel.tsx` — 596 lines, styled, with its classes defined in `AdminResearch.css` —
// was never mounted by anything. It was the ONLY caller of two live API routes:
//
//   · `/api/admin/research/[projectId]/boundary-calls`  — "Fetch boundary calls from county CAD"
//   · `/api/admin/research/[projectId]/browser-fetch`
//
// Both are routed. Both work. Neither could be reached from the product, because the one component
// that called them rendered nowhere.
//
// **That is not dead UI, it is dead capability** — reading a boundary out of the county record is
// close to the centre of what this software is for. And it is invisible to every check this repo
// runs: the routes typecheck, the component typecheck, its own classes are styled, and the build is
// clean. `verify:orphans` did list the component, but the reachability GUARD
// (`research-modules-are-reachable.test.ts`) does not scan `app/admin/research/components`, which is
// exactly the gap its own header warns about: *"a guard is only as good as its coverage, and the
// directories it skips are exactly where the next orphan will be."*
//
// ── WHY IT IS PINNED AS A CHAIN ─────────────────────────────────────────────────────────────────
//
// Asserting only "the panel exists" was true the whole time it was unreachable. Asserting only "the
// page imports it" would pass if the page stopped being routed. So the assertions below walk the
// whole path — layout mounts the nav, the nav links to the route, the route's page mounts the panel,
// the panel calls the endpoints, and the endpoints exist.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

const PANEL = 'app/admin/research/components/BoundaryCallsPanel.tsx';
const PAGE = 'app/admin/research/[projectId]/boundary/page.tsx';
const NAV = 'app/admin/research/[projectId]/components/ResearchProjectNav.tsx';
const LAYOUT = 'app/admin/research/[projectId]/layout.tsx';

describe('the whole path from a click to the county', () => {
  it('the project layout mounts the nav', () => {
    expect(read(LAYOUT)).toContain('<ResearchProjectNav />');
  });

  it('the nav links to the boundary route', () => {
    expect(read(NAV)).toContain('/boundary`');
  });

  it('the boundary route exists', () => {
    expect(exists(PAGE)).toBe(true);
  });

  it('the boundary page MOUNTS the panel, not merely imports it', () => {
    const page = read(PAGE);
    expect(page).toContain("import BoundaryCallsPanel from '../../components/BoundaryCallsPanel'");
    expect(page).toMatch(/<BoundaryCallsPanel\s/);
  });

  it('and the mount is not behind a guard that is never true', () => {
    // `{false && <BoundaryCallsPanel …}` passed the assertion above — the panel is imported,
    // referenced, and renders nowhere, which is EXACTLY the state this whole file exists to end.
    // The same mutation was caught on ProjectStats in B2 and the lesson was not carried here.
    //
    // It IS behind `fetchOpen`, deliberately — a disclosure the operator opens. So the assertion
    // cannot be "no condition at all"; it is that the condition is a piece of state the UI can
    // actually change.
    const page = read(PAGE);
    const line = page.split('\n').find((l) => l.includes('<BoundaryCallsPanel'))!;
    expect(line, 'the mount should not be inline-guarded').not.toMatch(/&&|\?/);
    expect(page, 'the disclosure must be openable').toContain('setFetchOpen');
    expect(page, 'and it must start from real state').toMatch(/const \[fetchOpen, setFetchOpen\] = useState/);
  });

  it('and passes it the project it is looking at', () => {
    const page = read(PAGE);
    const at = page.indexOf('<BoundaryCallsPanel');
    const el = page.slice(at, page.indexOf('/>', at));
    expect(el).toContain('projectId={projectId}');
  });

  it('an import refreshes the viewer instead of leaving it stale', () => {
    // Without `onImported`, calls fetched from the county land in the database and the viewer keeps
    // showing what it loaded on mount — so the feature looks like it did nothing.
    const page = read(PAGE);
    const at = page.indexOf('<BoundaryCallsPanel');
    expect(page.slice(at, page.indexOf('/>', at))).toContain('onImported={loadBoundary}');
  });
});

describe('the endpoints the panel calls are real', () => {
  it('both routes exist on disk', () => {
    for (const r of ['boundary-calls', 'browser-fetch']) {
      expect(exists(`app/api/admin/research/[projectId]/${r}/route.ts`), `${r} route missing`).toBe(true);
    }
  });

  it('the panel calls both of them', () => {
    const panel = read(PANEL);
    expect(panel).toContain('/boundary-calls`');
    expect(panel).toContain('/browser-fetch`');
  });

  it('the panel is not the only caller BY ACCIDENT again — the page is now above it', () => {
    // The regression that would restore the original state: deleting the mount and leaving the
    // component. Everything else in this file would still pass on the component alone.
    const mounts = read(PAGE).match(/<BoundaryCallsPanel/g)?.length ?? 0;
    expect(mounts, 'nothing mounts the panel — the endpoints are unreachable again').toBeGreaterThan(0);
  });
});

describe('it will render, not just mount', () => {
  it('the classes it uses are defined in a stylesheet', () => {
    // A class no sheet defines renders as unstyled text in the middle of a panel — present in a
    // test, invisible as a control. This repo has shipped that three times.
    const css = read('app/admin/styles/AdminResearch.css');
    expect(css).toContain('.research-boundary');
  });

  it('and that stylesheet is loaded on this route', () => {
    // AdminResearch.css is route-scoped. A shared component relying on a sheet the route does not
    // import renders completely unstyled with nothing erroring — third instance in this repo.
    expect(read('app/admin/research/layout.tsx')).toContain("import '../styles/AdminResearch.css'");
  });
});
