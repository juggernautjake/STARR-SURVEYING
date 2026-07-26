// __tests__/dnd/approval-exceptions.test.tsx — the DM's review sees out-of-slot picks (slot plan S8c).
//
// The gap this closes was invisible by construction. `SheetApprovalPanel` lists a character's content by
// PROVENANCE — `summarizeCharacterProvenance`, "is this thing in the book?" — and a cross-class feat taken
// through the escape hatch IS in the book. So it classified as plain `vanilla`, was counted in the "N
// vanilla" figure, and appeared nowhere in the itemised list. The one surface whose job is "show the DM
// what to look at" showed nothing about the exact thing S6 was built to record.
//
// Two axes, and they cross:
//   · CONTENT     (`elements`)    — is this in the book?
//   · ENTITLEMENT (`exceptions`)  — was this character allowed it HERE?
// A DM-blessed cross-class feat is vanilla content the character wasn't entitled to; a homebrew feat in a
// legal slot is the reverse. Listing them together would put a "CUSTOM" badge on book-legal content, so
// they are rendered as separate sections with separate words.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SlotException } from '@/lib/dnd/slots/entitlement';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
import SheetApprovalPanel from '@/app/dnd/_ui/SheetApprovalPanel';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const EXC: SlotException[] = [
  { name: 'Magic Initiate', reason: 'origin feats come from your background', entitlement: 'dm-granted', level: 4 },
  { name: 'Alert', reason: 'you do not meet its prerequisites', entitlement: 'expanded', level: 8 },
];

const render = (props: Record<string, unknown> = {}) => renderToStaticMarkup(
  <SheetApprovalPanel
    characterId="c1" status="submitted" isDM canWrite
    elements={[{ kind: 'feat', name: 'Magic Initiate', source: 'vanilla' }]}
    allowCustom hasBlockingCustom={false}
    {...props}
  />,
);

describe('the review names out-of-slot picks', () => {
  it('shows nothing extra when there are none', () => {
    const html = render();
    expect(html).not.toContain('taken outside the rules');
  });

  it('names each one, with the RULES\' objection', () => {
    // Without the reason the DM sees a name and has to work out for themselves what was wrong with it.
    const html = render({ exceptions: EXC });
    expect(html).toContain('2 taken outside the rules');
    expect(html).toContain('Magic Initiate');
    expect(html).toContain('origin feats come from your background');
    expect(html).toContain('Alert');
    expect(html).toContain('you do not meet its prerequisites');
  });

  it('says which level each was taken at', () => {
    expect(render({ exceptions: EXC })).toContain('level 4');
  });

  it('distinguishes a DM\'s own grant from a player\'s call', () => {
    const html = render({ exceptions: EXC });
    expect(html).toContain('DM-GRANTED');
    expect(html).toContain('OUT OF SLOT');
  });
});

describe('the two axes stay separate', () => {
  it('an out-of-slot pick that IS in the book is not badged CUSTOM', () => {
    // The whole point: this content is vanilla. Calling it custom would be a different, false claim.
    const html = render({ exceptions: [EXC[1]], elements: [{ kind: 'feat', name: 'Alert', source: 'vanilla' }] });
    expect(html).toContain('OUT OF SLOT');
    expect(html).not.toContain('>CUSTOM<');
  });

  it('the content list still works on its own axis, untouched', () => {
    const html = render({ elements: [{ kind: 'feat', name: 'Homebrew Thing', source: 'custom' }] });
    expect(html).toContain('CUSTOM');
    expect(html).toContain('Homebrew Thing');
  });

  it('both can appear at once, in separate sections', () => {
    const html = render({
      exceptions: [EXC[1]],
      elements: [{ kind: 'feat', name: 'Homebrew Thing', source: 'custom' }],
    });
    expect(html).toContain('taken outside the rules');
    expect(html).toContain('Homebrew Thing');
  });
});

describe('what this deliberately does NOT do', () => {
  const PAGE = read('app/dnd/characters/[id]/page.tsx');

  it('does not turn an exception into a submission blocker', () => {
    // Whether a vanilla-only campaign should REFUSE a submission over an out-of-slot pick is a policy call
    // for the campaign owner. Quietly making it one would start failing submissions that succeed today.
    expect(PAGE).toContain('hasBlockingCustom={summary.hasBlockingCustom}');
    expect(PAGE).not.toMatch(/hasBlockingCustom=\{[^}]*exception/i);
  });

  it('feeds the panel from the ledger, per system', () => {
    expect(PAGE).toContain('exceptions={sheetExceptions(character.data, sys)}');
  });
});

describe('the panel is actually mounted with it', () => {
  it('the prop is wired, not just accepted', () => {
    // A component that takes a prop nothing passes is this repo's most common defect.
    expect(read('app/dnd/_ui/SheetApprovalPanel.tsx')).toContain('exceptions.map((e, i)');
    expect(read('app/dnd/characters/[id]/page.tsx')).toContain('exceptions={sheetExceptions(');
  });
});
