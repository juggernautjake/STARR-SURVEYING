// __tests__/dnd/roller-clipping-detector.test.ts — the detector behind D7-3.
//
// The owner's requirement is absolute: *"Make sure the modal for the roller is always the right size to
// fully contain all of the content of the rollers at all times and that there is never a need for a
// scrolling bar to appear or be used to see everything."* Proving that across the matrix (4 systems × 4
// rollers × 5 skins × dice counts × viewports) needs a detector that is right about what a scrollbar IS —
// and the existing `detectOverflow` answers a different question entirely.
//
// WHY A SECOND DETECTOR AND NOT A FLAG. `detectOverflow` asks "does this paint outside the VIEWPORT", and
// to answer that honestly it must EXCLUDE `position: fixed` elements and anything inside a scroll container
// — a docked FAB and a scrolling table are both fine. For the roller window every one of those exclusions
// is inverted: the roller IS `position: fixed`, and becoming a scroll container is precisely the defect.
// Adding a flag that reverses three of a function's rules leaves both callers harder to reason about than
// two functions that each answer one question.
//
// NO jsdom IN THIS REPO — the suite runs `environment: 'node'` (see vitest.config.ts; vitest.setup.ts
// already shims localStorage for the same reason). Rather than add a DOM dependency for one file, the
// handful of browser calls these functions make are stubbed below. That turns out to be the better test:
// the stub IS the contract, so it states exactly which DOM surface the detector may rely on, and a change
// that reaches for something else fails here rather than in a browser sweep an hour later.
import { describe, it, expect, afterEach } from 'vitest';
import { detectClipped, detectOversized } from '@/scripts/lib/overflow.mjs';

// ── the smallest DOM these detectors need ───────────────────────────────────────────────────────
interface FakeEl {
  tagName: string;
  className: string;
  dataset: Record<string, string>;
  parentElement: FakeEl | null;
  children: FakeEl[];
  style: { overflowY: string };
  clientHeight: number;
  scrollHeight: number;
  rect: { width: number; height: number; top: number; left: number };
  getBoundingClientRect(): { width: number; height: number; top: number; left: number };
}

function el(opts: Partial<FakeEl> & { cls?: string; overflowY?: string; scrollable?: boolean } = {}): FakeEl {
  const node: FakeEl = {
    tagName: 'DIV',
    className: opts.cls ?? '',
    dataset: opts.scrollable ? { scrollable: 'true' } : {},
    parentElement: null,
    children: [],
    style: { overflowY: opts.overflowY ?? 'visible' },
    clientHeight: opts.clientHeight ?? 100,
    scrollHeight: opts.scrollHeight ?? 100,
    rect: opts.rect ?? { width: 396, height: 560, top: 10, left: 10 },
    getBoundingClientRect() {
      return this.rect;
    },
  };
  return node;
}

function append(parent: FakeEl, child: FakeEl): FakeEl {
  child.parentElement = parent;
  parent.children.push(child);
  return child;
}

/** Every descendant, depth-first — what `querySelectorAll('*')` returns. */
function descendants(node: FakeEl): FakeEl[] {
  return node.children.flatMap((c) => [c, ...descendants(c)]);
}

const documentElement = el({ cls: 'html' });

/** Install the globals the detectors touch. Returns a teardown. */
function mount(root: FakeEl | null, viewport = { w: 1024, h: 768 }) {
  root && (root.parentElement = documentElement);
  const g = globalThis as Record<string, unknown>;
  g.document = {
    documentElement,
    querySelector: () => root,
  };
  g.window = { innerWidth: viewport.w, innerHeight: viewport.h };
  g.getComputedStyle = (node: FakeEl) => ({ overflowY: node.style.overflowY });
  // `querySelectorAll('*')` on the root — the detector spreads it after the root itself.
  if (root) (root as unknown as { querySelectorAll: () => FakeEl[] }).querySelectorAll = () => descendants(root);
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.document;
  delete g.window;
  delete g.getComputedStyle;
});

describe('detectClipped — what counts as a scrollbar', () => {
  it('reports a box whose content is taller than it is', () => {
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'auto', clientHeight: 200, scrollHeight: 380, cls: 'ir-body' }));
    mount(root);
    const r = detectClipped('.roller-window');
    expect(r.found).toBe(true);
    expect(r.count).toBe(1);
    expect(r.offenders[0].hidden).toBe(180);
    expect(r.offenders[0].cls).toContain('ir-body');
  });

  it('ignores a box that fits', () => {
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'auto', clientHeight: 300, scrollHeight: 300 }));
    mount(root);
    expect(detectClipped('.roller-window').count).toBe(0);
  });

  it('ignores overflow:visible however tall the content — that spills, it does not scroll', () => {
    // A visible overflow is `detectOverflow`'s problem. Counting it here would report one defect twice
    // under two names, and the two have different fixes.
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'visible', clientHeight: 100, scrollHeight: 900 }));
    mount(root);
    expect(detectClipped('.roller-window').count).toBe(0);
  });

  it('counts overflow:hidden — content nobody can reach is worse than content behind a scrollbar', () => {
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'hidden', clientHeight: 100, scrollHeight: 400 }));
    mount(root);
    expect(detectClipped('.roller-window').count).toBe(1);
  });

  it('allows 2px of sub-pixel slack, so the detector does not cry wolf', () => {
    // Layout rounding routinely yields scrollHeight a pixel or two greater on a box that clips nothing
    // visible. A detector with false positives is a detector somebody switches off.
    const ok = el({ cls: 'roller-window' });
    append(ok, el({ overflowY: 'auto', clientHeight: 300, scrollHeight: 302 }));
    mount(ok);
    expect(detectClipped('.roller-window').count).toBe(0);

    const bad = el({ cls: 'roller-window' });
    append(bad, el({ overflowY: 'auto', clientHeight: 300, scrollHeight: 303 }));
    mount(bad);
    expect(detectClipped('.roller-window').count).toBe(1);
  });

  it('checks the root itself, not only its descendants', () => {
    const root = el({ cls: 'roller-window', overflowY: 'auto', clientHeight: 400, scrollHeight: 700 });
    mount(root);
    expect(detectClipped('.roller-window').count).toBe(1);
  });
});

describe('detectClipped — the one permitted scroller (D7-2)', () => {
  it('a box that opts in with data-scrollable is not an offender', () => {
    // Roll history is unbounded by nature; the plan permits exactly this one.
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'auto', clientHeight: 120, scrollHeight: 900, scrollable: true }));
    mount(root);
    expect(detectClipped('.roller-window').count).toBe(0);
  });

  it('the permission inherits, so a scroller nested inside the history panel is also fine', () => {
    const root = el({ cls: 'roller-window' });
    const history = append(root, el({ scrollable: true }));
    append(history, el({ overflowY: 'auto', clientHeight: 100, scrollHeight: 800 }));
    mount(root);
    expect(detectClipped('.roller-window').count).toBe(0);
  });

  it('but a sibling of the history panel is still reported', () => {
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'auto', clientHeight: 120, scrollHeight: 900, scrollable: true }));
    append(root, el({ overflowY: 'auto', clientHeight: 100, scrollHeight: 260, cls: 'ir-break' }));
    mount(root);
    const r = detectClipped('.roller-window');
    expect(r.count).toBe(1);
    expect(r.offenders[0].cls).toContain('ir-break');
  });
});

describe('detectClipped — reporting', () => {
  it('says so plainly when the roller is not on the page, rather than reporting a clean pass', () => {
    // A missing root returning `count: 0` would read as "no scrollbars" — the exact false green that lets
    // a sweep pass on a page where the roller never mounted.
    mount(null);
    const r = detectClipped('.roller-window');
    expect(r.found).toBe(false);
    expect(r.count).toBe(0);
  });

  it('sorts worst-first, because the box hiding the most is the one to size for', () => {
    const root = el({ cls: 'roller-window' });
    append(root, el({ overflowY: 'auto', clientHeight: 100, scrollHeight: 150, cls: 'small' }));
    append(root, el({ overflowY: 'auto', clientHeight: 100, scrollHeight: 500, cls: 'big' }));
    mount(root);
    const r = detectClipped('.roller-window');
    expect(r.offenders[0].cls).toContain('big');
    expect(r.offenders[0].hidden).toBe(400);
  });
});

describe('detectOversized — the window versus the viewport', () => {
  it('passes a window that fits', () => {
    mount(el({ cls: 'roller-window', rect: { width: 396, height: 560, top: 10, left: 10 } }));
    const r = detectOversized('.roller-window');
    expect(r.tooWide).toBe(false);
    expect(r.tooTall).toBe(false);
    expect(r.offTop).toBe(false);
  });

  it('flags a window taller than the viewport — the 360px-phone case', () => {
    // A 560px roller plus chrome does not fit a 640px-tall phone once the safe-area inset is taken.
    mount(el({ cls: 'roller-window', rect: { width: 340, height: 700, top: 0, left: 0 } }), { w: 360, h: 640 });
    const r = detectOversized('.roller-window');
    expect(r.tooTall).toBe(true);
    expect(r.tooWide).toBe(false);
  });

  it('flags a window wider than a 360px phone', () => {
    // FIXED_W is 396 — wider than a 360px viewport before `max-width` clamps it. This is the assertion
    // that would catch the clamp being removed.
    mount(el({ cls: 'roller-window', rect: { width: 396, height: 400, top: 10, left: 0 } }), { w: 360, h: 800 });
    expect(detectOversized('.roller-window').tooWide).toBe(true);
  });

  it('flags a window pushed off the top, where the header would be unreachable', () => {
    mount(el({ cls: 'roller-window', rect: { width: 396, height: 560, top: -40, left: 10 } }));
    expect(detectOversized('.roller-window').offTop).toBe(true);
  });

  it('reports found:false for a missing window rather than a passing result', () => {
    mount(null);
    expect(detectOversized('.roller-window').found).toBe(false);
  });
});
