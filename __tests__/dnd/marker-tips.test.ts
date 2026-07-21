// __tests__/dnd/marker-tips.test.ts — no marker on the D&D surfaces may render without a reachable
// explanation (Slices CX-10/CX-11).
//
// The owner's report was "there seem to be some places that have that little information question
// mark in a circle next to them, but hovering doesn't tell me anything". The cause was not missing
// copy — every marker already guarded against an empty string. The cause was the native `title`
// attribute: five of the eight markers on the sheet relied on it EXCLUSIVELY, and `title` needs a
// second of steady mouse-hover, never fires on touch, and is skipped by most screen-reader flows.
// The popover that fixes it (`_sheet/components/InfoTip`) had existed for a year and had been wired
// to only some of the markers — the same "authored but not wired everywhere" shape this project
// keeps finding.
//
// So this file guards the RULE rather than the instances: every marker component goes through the
// one Tip primitive, and none of them may fall back to a bare `title`. Source-anchored, like the
// rest of the sheet's UI tests — the assertions are about which component is used and what the copy
// says, neither of which needs a DOM.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const TIP = read('app/dnd/_ui/Tip.tsx');

/** Every marker component on the D&D surfaces, with the glyph it draws. Adding a marker without
 *  adding it here is the one hole this file cannot close by itself; §4 catches the common version
 *  of that mistake by scanning the marker directories for stray `title=` attributes. */
const MARKERS: { file: string; glyph: string; what: string }[] = [
  { file: 'app/dnd/_sheet/components/ui/OffRulesMark.tsx', glyph: '⚑', what: 'outside the normal rules' },
  { file: 'app/dnd/_sheet/components/ui/EditMark.tsx', glyph: '✎', what: 'hand-customized' },
  { file: 'app/dnd/_sheet/components/ui/OptionsMark.tsx', glyph: '⚙', what: 'governed by a preference' },
  { file: 'app/dnd/_ui/CampaignPreferencesDm.tsx', glyph: '?', what: "the DM's per-setting info dot" },
  { file: 'app/dnd/_ui/HouseRulesPanel.tsx', glyph: '?', what: "the player's house-rules info dot" },
];

describe('1 · there is ONE tooltip primitive, and it is reachable every way', () => {
  it('opens on hover, keyboard focus, and click/tap', () => {
    expect(TIP).toContain('onMouseEnter');
    expect(TIP).toContain('onFocus');
    expect(TIP).toContain('onClick');
  });

  it('dismisses on Escape, blur, and an outside tap (touch included)', () => {
    expect(TIP).toContain("e.key === 'Escape'");
    expect(TIP).toContain('onBlur');
    expect(TIP).toContain("addEventListener('touchstart'");
    expect(TIP).toContain('!wrapRef.current.contains');
  });

  it('is accessible — a labelled button with a role="tooltip" bubble tied by aria-describedby', () => {
    expect(TIP).toContain('aria-label={name}');
    expect(TIP).toContain('role="tooltip"');
    expect(TIP).toContain('aria-describedby');
  });

  it('renders NOTHING without text, so an unexplained marker cannot be built by accident', () => {
    expect(TIP).toContain('if (!tip) return null');
  });

  it('keeps the native title as a redundant fallback rather than the only path', () => {
    expect(TIP).toContain('title={plain}');
  });

  it('the two old InfoTips are now adapters over it, not second copies of the popover', () => {
    for (const f of ['app/dnd/_sheet/components/InfoTip.tsx', 'app/dnd/_ui/InfoTip.tsx']) {
      const src = read(f);
      expect(src, `${f} delegates to Tip`).toMatch(/import Tip from/);
      // The tell that a copy has come back: its own popover state and its own dismiss handling.
      expect(src, `${f} keeps no popover of its own`).not.toContain('role="tooltip"');
      expect(src, `${f} keeps no popover state of its own`).not.toContain('useState');
    }
  });
});

describe('2 · no marker renders without a tip', () => {
  for (const { file, glyph, what } of MARKERS) {
    it(`${glyph} (${what}) goes through Tip`, () => {
      const src = read(file);
      expect(src, `${file} imports Tip`).toMatch(/import Tip from ['"]/);
      expect(src, `${file} renders <Tip`).toContain('<Tip');
      expect(src, `${file} still draws ${glyph}`).toContain(glyph);
    });
  }

  it('none of them relies on a bare `title` attribute any more', () => {
    // `title={` / `title="` on a JSX element is the native attribute; `title=` on a <Tip …> is the
    // prop, which Tip renders into both a heading AND the fallback attribute. Distinguished by
    // stripping the Tip blocks before scanning, so a regression to a raw span is caught while the
    // legitimate prop is not.
    for (const { file } of MARKERS) {
      const withoutTips = read(file).replace(/<Tip[\s\S]*?\/>/g, '');
      expect(withoutTips, `${file} has a raw title= outside a Tip`).not.toMatch(/\stitle=/);
      expect(withoutTips, `${file} has a raw aria-label= outside a Tip`).not.toMatch(/\saria-label=/);
    }
  });
});

describe('3 · every marker says what it MEANS, not only what its data is', () => {
  // The owner's instinct, verbatim: "If it is trying to say that thing is custom or that there is
  // more info to be read about it, then it needs a tool tip that fully explains what it is for."
  // A tip reading "outside the rules: Wish" states the data and answers nothing.

  it('⚑ explains the flag is not an error, and distinguishes a DM gift from a custom pick', () => {
    const src = read('app/dnd/_sheet/components/ui/OffRulesMark.tsx');
    expect(src).toMatch(/not an error/i);
    expect(src).toMatch(/custom character is allowed to hold anything/i);
    // The DM-gift branch reassures rather than warns — it is the DM's own decision being recorded.
    expect(src).toMatch(/legitimately yours/i);
    expect(src).toMatch(/nothing is wrong and nothing needs fixing/i);
  });

  it('✎ explains it is a record of an edit, not a warning, and is not the ★', () => {
    const src = read('app/dnd/_sheet/components/ui/EditMark.tsx');
    expect(src).toMatch(/a record, not a warning/i);
    expect(src).toMatch(/nothing is broken/i);
    expect(src).toMatch(/modifying this value right now/i); // the ★'s meaning, held apart from ✎'s
  });

  it('⚙ explains that a preference — not a rule — decides the behaviour, and where to change it', () => {
    const src = read('app/dnd/_sheet/components/ui/OptionsMark.tsx');
    expect(src).toMatch(/campaign preference rather than a fixed rule/i);
    expect(src).toMatch(/Campaign preferences/);
  });

  it("the DM's ? explains the REACH of the setting, not just the setting", () => {
    const src = read('app/dnd/_ui/CampaignPreferencesDm.tsx');
    expect(src).toMatch(/campaign-wide choice/i);
    expect(src).toMatch(/locked for everyone/i);
  });

  it("the player's ? explains that the value was chosen for them, and by whom", () => {
    const src = read('app/dnd/_ui/HouseRulesPanel.tsx');
    expect(src).toMatch(/not a rule you picked/i);
    expect(src).toMatch(/Your DM sets it/i);
    // The 🔒 beside a locked row is a marker too, and got the same treatment.
    expect(src).toMatch(/cannot be changed on an individual character/i);
  });
});

describe('4 · the sheet-wide rule: no title-only affordance in the marker directories', () => {
  it('the markers are the complete list — a new one in ui/ must be registered here', () => {
    // Cheap guard against this file going stale: if a *Mark component appears that MARKERS does not
    // name, the rule above stops covering the sheet and this fails until the list is updated.
    const dir = 'app/dnd/_sheet/components/ui';
    const found = readdirSync(join(process.cwd(), dir))
      .filter((f) => /Mark\.tsx$/.test(f))
      .map((f) => `${dir}/${f}`);
    expect(found.length).toBeGreaterThan(0); // a glob that matches nothing would pass vacuously
    for (const f of found) {
      expect(MARKERS.map((m) => m.file), `${f} is not covered by marker-tips.test.ts`).toContain(f);
    }
  });
});
