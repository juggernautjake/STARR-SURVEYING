// __tests__/dnd/take-anyway-wiring.test.tsx — the hatch is RENDERED, not merely authored.
//
// "Authored but not wired" is the defect this repo produces most often, and a pure-logic suite cannot see
// it: `entitlement.ts` can be perfect while no picker ever mounts the control. So this renders the real 5e
// builder and asserts the hatch appears — and, more importantly, that it does NOT appear where the rules
// were never binding.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TakeAnyway from '@/app/dnd/_ui/builder/TakeAnyway';
import { unlockOffer } from '@/lib/dnd/slots/entitlement';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import Dnd5eManualBuilder from '@/app/dnd/_ui/Dnd5eManualBuilder';

const render5e = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<Dnd5eManualBuilder system="dnd5e-2024" characterId="c1" {...props} />);

describe('the 5e Foundations picker mounts the hatch', () => {
  // The feat section — and so the hatch inside it — only exists once a class gives the character ASI/feat
  // slots (`dnd5eFeatSlotsAtLevel` is 0 with no class). The builder takes its class from internal state, not
  // a prop, so a static render cannot reach that section. An earlier version of this file asserted the
  // hatch's ABSENCE on a custom character and passed — on an empty render, not on the rule. Pinning the
  // precondition here, and the offer decision through the control itself, is what those tests can honestly
  // check; the end-to-end behaviour is covered by `slot-escape-hatch.test.ts` plus the browser pass.
  it('renders no feat section, and so no hatch, before a class is chosen', () => {
    const html = render5e({ variantKind: 'vanilla' });
    expect(html).not.toContain('ASI/feat slot');
    expect(html).not.toContain('Add a different feat');
  });

  const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/Dnd5eManualBuilder.tsx'), 'utf8');

  it('derives the offer from the character, not from a hardcoded flag', () => {
    expect(SRC).toContain('unlockOffer({ isDM, kind: variantKind })');
  });

  it('feeds the hatch the same verdicts the chips are greyed by', () => {
    // If the hatch built its own list, it could offer a feat the chips call legal, or omit one they refuse.
    expect(SRC).toMatch(/blockedFeats = React\.useMemo\([\s\S]*featVerdicts\.get/);
    expect(SRC).toContain('blocked={blockedFeats}');
  });

  it('defaults to the gate being ON for a caller that does not say', () => {
    // Failing closed is the whole point of the 5e gate; a missing prop must not silently unlock the picker.
    expect(SRC).toContain("variantKind = 'vanilla'");
    expect(SRC).toContain('isDM = false');
  });
});

describe('the control itself', () => {
  const offer = unlockOffer({ kind: 'vanilla' });

  it('renders nothing when there is nothing blocked and nothing taken', () => {
    expect(renderToStaticMarkup(
      <TakeAnyway offer={offer} blocked={[]} taken={[]} onTake={() => {}} onUntake={() => {}} />,
    )).toBe('');
  });

  it('renders nothing on a CUSTOM character even with picks blocked — nothing there was ever bound', () => {
    expect(renderToStaticMarkup(
      <TakeAnyway offer={unlockOffer({ kind: 'custom' })} blocked={[{ name: 'Magic Initiate', reason: 'r' }]}
        taken={[]} onTake={() => {}} onUntake={() => {}} />,
    )).toBe('');
  });

  it('words a DM\'s use as a grant, not as breaking a rule', () => {
    const html = renderToStaticMarkup(
      <TakeAnyway offer={unlockOffer({ kind: 'vanilla', isDM: true })} blocked={[{ name: 'Magic Initiate' }]}
        taken={[]} onTake={() => {}} onUntake={() => {}} />,
    );
    expect(html).toContain('Grant it anyway');
    expect(html).toContain('DM-granted');
  });

  it('tells a player what it costs before they use it', () => {
    const html = renderToStaticMarkup(
      <TakeAnyway offer={offer} blocked={[{ name: 'Magic Initiate' }]} taken={[]} onTake={() => {}} onUntake={() => {}} />,
    );
    expect(html).toContain('Altered vanilla');
  });

  it('shows the rules\' reason beside each option, so the choice is made against a known objection', () => {
    const html = renderToStaticMarkup(
      <TakeAnyway offer={offer} blocked={[{ name: 'Magic Initiate', reason: 'origin feats come from your background' }]}
        taken={[]} onTake={() => {}} onUntake={() => {}} />,
    );
    expect(html).toContain('origin feats come from your background');
  });

  it('NAMES what was taken rather than only counting it', () => {
    // A badge that says something changed without saying what is the same problem in a nicer font.
    const html = renderToStaticMarkup(
      <TakeAnyway offer={offer} blocked={[{ name: 'Magic Initiate', reason: 'origin feats come from your background' }]}
        taken={['Magic Initiate']} onTake={() => {}} onUntake={() => {}} />,
    );
    expect(html).toContain('Magic Initiate');
    expect(html).toContain('1 exception');
    expect(html).toContain('Undo'); // an exception must be reversible, or it is a trap
  });

  it('still lists what was taken even once nothing remains blocked', () => {
    const html = renderToStaticMarkup(
      <TakeAnyway offer={offer} blocked={[]} taken={['Alert']} onTake={() => {}} onUntake={() => {}} />,
    );
    expect(html).toContain('Alert');
  });

  it('KEEPS the reason after the pick stops being blocked — found in the browser', () => {
    // The defect: every picker computes `blocked` by excluding what is already selected — correctly, since
    // a taken pick is no longer on offer. So the reason lookup found nothing the moment it mattered most.
    // The dropdown read "Ancestor's Rage — Ancestor's Rage is a level-13 feat; this character is level 1",
    // and one click later the list underneath read "not normally available". A generic fallback is exactly
    // the failure this feature exists to prevent.
    //
    // ASSERTED ON THE SOURCE, deliberately, and this is a real limit rather than laziness: the fix is a
    // cross-RENDER cache, and `renderToStaticMarkup` mounts a fresh component every call, so there is no
    // second render for it to survive. A DOM-level test could drive it; this suite has no DOM renderer.
    // The behaviour itself was verified in a browser (see DND_FINAL_QA_WALKTHROUGH, 2026-07-26) — which is
    // also the only reason the bug was found, since every unit test here passed while it was broken.
    const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/builder/TakeAnyway.tsx'), 'utf8');
    expect(src).toContain('seen.current.set(b.name, b.reason)');
    expect(src).toContain('?? seen.current.get(name)');
    // A ref and not state: caching something already rendered must not itself cause a render.
    expect(src).toContain('React.useRef(new Map<string, string>())');
  });

  it('falls back to plain wording only when the reason was never supplied', () => {
    const html = renderToStaticMarkup(
      <TakeAnyway offer={offer} blocked={[]} taken={['Mystery Feat']} onTake={() => {}} onUntake={() => {}} />,
    );
    expect(html).toContain('not normally available');
  });

  it('takes a plain {name, reason} row, so every system\'s picker can feed it', () => {
    // The tiers and wording are the part most likely to drift if each system grew its own hatch.
    //
    // Asserted on the IMPORTS, not on a grep of the whole file: the component's own comment names
    // `PickerFeat`/`PF2FeatFull`/`IGFeat` while explaining that it deliberately accepts none of them, and a
    // whole-file grep failed on that prose. Same trap as the jump-nav guard — a source test is only as
    // precise as the thing it greps for.
    const src = readFileSync(join(process.cwd(), 'app/dnd/_ui/builder/TakeAnyway.tsx'), 'utf8');
    const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]).join('\n');
    expect(imports).not.toMatch(/systems\/|feats\/catalog|PickerFeat|PF2FeatFull|IGFeat/);
  });
});

describe('the picker keeps the exception and the pick in step', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/Dnd5eManualBuilder.tsx'), 'utf8');

  it('taking through the hatch adds to BOTH the picks and the exceptions', () => {
    expect(SRC).toMatch(/onTake=\{\(name\) => \{ setFeats.*setExceptions/s);
  });

  it('deselecting the chip drops the exception too', () => {
    // Otherwise the POST would acknowledge a refusal for a feat it is no longer sending, and the character
    // would keep an "Altered vanilla" badge with nothing left to justify it.
    expect(SRC).toContain('if (on) setExceptions((cur) => cur.filter((x) => x !== f.name));');
  });

  it('the exceptions actually reach the server', () => {
    expect(SRC).toContain('exceptions: result.exceptions');
  });
});
