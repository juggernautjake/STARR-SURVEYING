// __tests__/dnd/asi-feat-picker-render.test.tsx — the 5e ASI picker, rendered.
//
// S6f is where this session's whole escape-hatch thread started: the 5e walker HID ineligible feats, which
// made "+ Take it anyway" unreachable for the exact case it was built for. The fix shows them instead, with
// the gate's own reason, **still selectable**.
//
// Slice 55 rendered the PF2 and IG pickers. This one was left behind — it was an inline IIFE bound to the
// walker's `draft`, so it could only be grepped. And a grep genuinely cannot tell the difference between
// the fix and the most plausible non-fix:
//
//     <option value="grappler">⊘ Grappler — needs STR 13</option>              ← the fix
//     <option value="grappler" disabled>⊘ Grappler — needs STR 13</option>     ← looks right, hatch dead
//
// The second greys the feat correctly, explains it correctly, and leaves the player exactly as stuck as the
// filter S6f removed — because a disabled option cannot be selected, cannot be sent, and can therefore
// never be refused. Only a render distinguishes them.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AsiFeatPicker, type FeatChoice } from '@/app/dnd/_ui/LevelBuilder';

const noop = () => {};
const feat = (over: Partial<FeatChoice> = {}): FeatChoice => ({
  key: 'alert', name: 'Alert', category: 'general', ...over,
} as FeatChoice);

const render = (choices: FeatChoice[], featKey?: string) =>
  renderToStaticMarkup(<AsiFeatPicker choices={choices} featKey={featKey} onPick={noop} />);

describe('an ineligible feat is shown, explained, and SELECTABLE', () => {
  const choices = [feat(), feat({ key: 'grappler', name: 'Grappler', blockedReason: 'needs Strength 13' })];
  const html = render(choices);

  it('renders the blocked feat with its reason, not hidden', () => {
    expect(html).toContain('Grappler');
    expect(html).toContain('needs Strength 13');
    expect(html).toContain('⊘');
  });

  it('and does NOT disable it — the whole point of S6f', () => {
    // The load-bearing assertion. `disabled` here would be the plausible non-fix described above.
    expect(html).not.toContain('disabled');
  });

  it('an eligible feat carries no ⊘ and no reason', () => {
    const alert = html.slice(html.indexOf('value="alert"'), html.indexOf('value="grappler"'));
    expect(alert).not.toContain('⊘');
  });
});

describe('the custom escape hatch', () => {
  it('is always offered, even when the rules list is full', () => {
    expect(render([feat()])).toContain('Custom feat');
  });

  it('shows the free-text field once a custom value is set', () => {
    const html = render([feat()], '__custom__');
    expect(html).toContain('custom feat name');
  });

  it('treats an unknown stored featKey as custom, so a saved homebrew name is not silently dropped', () => {
    // The walker can load a character already holding a feat this picker does not list.
    const html = render([feat()], 'Bogsniffer');
    expect(html).toContain('custom feat name');
    expect(html).toContain('Bogsniffer');
  });

  it('does not show the free-text field for a normal pick', () => {
    expect(render([feat()], 'alert')).not.toContain('custom feat name');
  });
});

describe('the empty case', () => {
  it('says so, and that placeholder IS disabled — it is a message, not a choice', () => {
    // The one legitimate `disabled` in this component: it labels an empty list rather than offering
    // something. Asserted explicitly so the "no disabled" rule above is understood as being about FEATS.
    const html = render([]);
    expect(html).toContain('no official feats for this system');
    expect(html).toContain('disabled');
    expect(html).toContain('Custom feat'); // …and the hatch is still there
  });
});
