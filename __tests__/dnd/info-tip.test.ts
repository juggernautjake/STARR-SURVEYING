// __tests__/dnd/info-tip.test.ts — the touch/keyboard-reachable effect tooltip (Area B7). Native `title` is
// mouse-hover ONLY (invisible on a tablet at the table); InfoTip adds a tappable/focusable ⓘ that reveals the
// full rules text, so the owner's "keyboard- and touch-reachable" requirement is met.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The popover itself moved to `_ui/Tip` in CX-10, where it merged with the builder's duplicate;
// `_sheet/components/InfoTip` is now an adapter over it. The interaction claims below belong to
// whichever file actually implements them, so they follow it — asserting them against the adapter
// would pass on an empty shell. What stays pinned here is the WIRING: which chips get a tip.
// The primitive's own contract is re-asserted, alongside every marker's, in marker-tips.test.ts.
const tip = readFileSync(join(process.cwd(), 'app/dnd/_ui/Tip.tsx'), 'utf8');
const adapter = readFileSync(join(process.cwd(), 'app/dnd/_sheet/components/InfoTip.tsx'), 'utf8');
const sheet = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGSheet.tsx'), 'utf8');
// The PF2 condition chips moved into the panel set (usePf2Panels, T-5a); the Classic shell
// (PF2Sheet) is now thin. Read both so the InfoTip wiring anchors hold wherever they live.
const pf2 = readFileSync(join(process.cwd(), 'app/dnd/_ui/PF2Sheet.tsx'), 'utf8')
  + readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');

describe('InfoTip is reachable by hover, focus, AND tap', () => {
  it('opens on mouse hover, keyboard focus, and click/tap', () => {
    expect(tip).toContain('onMouseEnter');
    expect(tip).toContain('onFocus');
    expect(tip).toContain('onClick');
  });
  it('dismisses on Escape, blur, and an outside tap', () => {
    expect(tip).toContain("e.key === 'Escape'");
    expect(tip).toContain('onBlur');
    expect(tip).toContain("addEventListener('touchstart'");
    expect(tip).toContain('!wrapRef.current.contains');
  });
  it('is accessible — a labelled button with role="tooltip" bubble tied by aria-describedby', () => {
    expect(tip).toContain('aria-label={name}');
    expect(tip).toContain('role="tooltip"');
    expect(tip).toContain('aria-describedby');
  });
  it('renders nothing when there is no tip text', () => {
    expect(tip).toContain('if (!tip) return null');
  });
  it('and the sheet-side InfoTip still exists, forwarding tip + label unchanged', () => {
    expect(adapter).toContain("import Tip from '@/app/dnd/_ui/Tip'");
    expect(adapter).toContain('<Tip tip={tip} label={label} />');
  });
});

describe('IGSheet wires InfoTip onto in-play effect chips', () => {
  it('the shared chip() (stances/feats/powers/defensive powers) and the condition chips get an InfoTip', () => {
    expect(sheet).toContain('{tip && <InfoTip tip={tip}');            // chip() helper
    expect(sheet).toContain('{e?.tooltip && <InfoTip tip={e.tooltip}'); // condition chips
    expect(sheet).toContain('hover or tap ⓘ for the full rules');     // the label reflects touch-reachability
  });
});

describe('PF2Sheet condition chips also get InfoTip (touch parity)', () => {
  it('the PF2 condition chip reveals its rules note on tap/focus, not just hover', () => {
    expect(pf2).toContain("import InfoTip from '@/app/dnd/_sheet/components/InfoTip'");
    expect(pf2).toContain('{note && <InfoTip tip={note}');
  });
});
