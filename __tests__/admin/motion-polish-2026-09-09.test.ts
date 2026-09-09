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
    // The tempo is a token and the stagger is capped — see motion.css / MOTION_SYSTEM.md.
    expect(css).toContain('animation-delay: calc(min(var(--i, 0), 12) * var(--motion-stagger))');
    expect(css).toContain('animation: ui-rise var(--motion-base) var(--ease-out) both;');
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
    expect(readSource(LISTING_CSS)).toContain('animation: ui-pulse 1.6s var(--ease-in-out) infinite;');
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
    expect(src).toContain('className="nrp-progress motion-essential" role="progressbar"');
    expect(src).toContain('className="nrp-reveal"');
    const css = readSource(MODAL_CSS);
    expect(css).toContain('animation: ui-unfold var(--motion-base) var(--ease-out);');
    expect(css).toContain('animation: ui-sweep 1.1s var(--ease-in-out) infinite;');
  });
});

describe('motion is cheap and can be turned off', () => {
  it('reduced motion is handled ONCE, globally, in motion.css — the sheets carry no block of their own', () => {
    const motion = readSource('app/styles/motion.css');
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)');
    expect(motion).toContain('animation-duration: 0.01ms !important');
    for (const f of [LISTING_CSS, MODAL_CSS]) {
      const css = readSource(f);
      expect(css, `${f} re-declares reduced motion`).not.toContain('prefers-reduced-motion');
      expect(css, `${f} declares its own keyframes`).not.toContain('@keyframes');
    }
  });
  it('animates only opacity and transform (and grid rows for the unfold) — never layout properties', () => {
    for (const f of ['app/styles/motion.css']) {
      const css = readSource(f);
      for (const m of css.matchAll(/@keyframes [a-z-]+ \{([^}]*\}[^}]*)\}/g)) {
        const body = m[1];
        expect(body, `${f}: ${m[0].slice(0, 40)} animates a layout property`).not.toMatch(/\b(width|height|margin|padding|top|font-size)\s*:/);
      }
    }
  });
});
