// __tests__/admin/motion-polish-2026-09-09.test.ts — the motion pass on the two listings and the modal.
//
// Owner, 2026-09-09: "really smooth transitions and animations and loading transitions". What must
// stay true: motion is opacity/transform only (cheap to paint), every animation is switched off
// under prefers-reduced-motion, a reload never flashes a skeleton over rows already on screen, and
// the modal plays OUT before it unmounts.

import { describe, it, expect } from 'vitest';
import { readSource } from '../helpers/read-source';

const LISTING_CSS = 'app/admin/components/listing/Listing.css';
const MODAL_CSS = 'app/admin/research/components/NewResearchProjectModal.css';
const MODAL = 'app/admin/research/components/NewResearchProjectModal.tsx';
const PROJECTS = 'app/admin/jobs/_tabs/ProjectsTab.tsx';
const RESEARCH = 'app/admin/research/_tabs/ProjectsTab.tsx';

describe('the listings', () => {
  it('cards rise in one after another, keyed off the row index', () => {
    const css = readSource(LISTING_CSS);
    expect(css).toContain('animation-delay: calc(var(--i, 0) * 45ms)');
    for (const f of [PROJECTS, RESEARCH]) {
      const src = readSource(f);
      expect(src, f).toContain("style={{ '--i': i } as CSSProperties}");
      expect(src, f).toContain('className="lst-list__item"');
      expect(src, f).toContain('className="lst-card__go"');
    }
  });
  it('the skeleton is card-shaped, shows once, and a reload dims the rows instead', () => {
    const css = readSource(LISTING_CSS);
    expect(css).toContain('.lst-skel__bar--title');
    expect(css).toContain('.lst-list--refreshing { opacity: 0.55; pointer-events: none; }');
    for (const f of [PROJECTS, RESEARCH]) {
      const src = readSource(f);
      expect(src, f).toContain('setLoadedOnce(true)');
      expect(src, f).toContain('loading && !loadedOnce');
      expect(src, f).toContain("lst-list--refreshing");
      expect(src, f).not.toContain('lst-skeleton');
    }
  });
  it('a page change glides back to the top of the list and replays the entrance', () => {
    for (const f of [PROJECTS, RESEARCH]) {
      const src = readSource(f);
      expect(src, f).toContain("listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })");
      expect(src, f).toContain('key={`${page}-${sort}`}');
    }
  });
  it('work in progress pulses on the research list only', () => {
    expect(readSource(RESEARCH)).toContain("LIVE_STATUSES = new Set<WorkflowStep>(['analyzing', 'drawing', 'verifying'])");
    expect(readSource(LISTING_CSS)).toContain('@keyframes lst-pulse');
    expect(readSource(PROJECTS)).not.toContain('lst-status--live');
  });
});

describe('the modal', () => {
  it('plays out before it unmounts, on every way of closing', () => {
    const src = readSource(MODAL);
    expect(src).toContain("window.setTimeout(() => { setClosing(false); onClose(); }, 180)");
    expect(src).toContain("if (e.key === 'Escape' && !busy) close()");
    expect(src).toContain('onClick={close} aria-label="Close"');
    expect(src).toContain('onClick={close} disabled={busy}>Cancel');
    expect(src).not.toMatch(/onClick=\{onClose\}/);
    const css = readSource(MODAL_CSS);
    expect(css).toContain('.nrp-overlay--closing');
    expect(css).toContain('.nrp-modal--closing');
  });
  it('locks the page behind, shows a progress bar while working, and unfolds its cards', () => {
    const src = readSource(MODAL);
    expect(src).toContain("document.body.style.overflow = 'hidden'");
    expect(src).toContain('className="nrp-progress" role="progressbar"');
    expect(src).toContain('className="nrp-reveal"');
    const css = readSource(MODAL_CSS);
    expect(css).toContain('@keyframes nrp-unfold { from { grid-template-rows: 0fr;');
    expect(css).toContain('@keyframes nrp-sweep');
  });
});

describe('motion is cheap and can be turned off', () => {
  it('both sheets switch every animation off under prefers-reduced-motion', () => {
    for (const f of [LISTING_CSS, MODAL_CSS]) {
      const css = readSource(f);
      const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
      expect(at, `${f} has no reduced-motion block`).toBeGreaterThan(-1);
      const block = css.slice(at, css.indexOf('}\n}', at) + 3);
      expect(block).toContain('animation: none');
      // Every @keyframes the sheet declares is applied by some rule the block resets — a keyframe
      // added later without a reset is the regression this guards.
      const names = [...css.matchAll(/@keyframes ([a-z-]+)/g)].map((m) => m[1]);
      expect(names.length).toBeGreaterThan(3);
    }
  });
  it('animates only opacity and transform (and grid rows for the unfold) — never layout properties', () => {
    for (const f of [LISTING_CSS, MODAL_CSS]) {
      const css = readSource(f);
      for (const m of css.matchAll(/@keyframes [a-z-]+ \{([^}]*\}[^}]*)\}/g)) {
        const body = m[1];
        expect(body, `${f}: ${m[0].slice(0, 40)} animates a layout property`).not.toMatch(/\b(width|height|margin|padding|top|font-size)\s*:/);
      }
    }
  });
});
