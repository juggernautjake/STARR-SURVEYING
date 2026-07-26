// __tests__/dnd/homebrew-feat-editable.test.tsx — the homebrew feat draft is editable, and authorable
// without the AI (Slice 5's last "nice-to-have", shipped 2026-07-26).
//
// Why it was more than a nice-to-have: the drafted feat was READ-ONLY, so changing one word meant
// re-prompting the AI and hoping — and a player with no AI key could not author a feat at all. Homebrew is
// one of the two ways a player customises a character; re-rolling a whole draft to fix a prerequisite is not
// customisation. Slice 5 recorded this same remainder three times (class, feat, subclass).
//
// The interesting property to pin is that the review the player sees WHILE TYPING is the one that decides the
// save. The page runs the pure `reviewCustomFeat`; the save route runs the same function on parsed input and
// refuses errors. If they ever diverge, a player fixes every warning on screen and the save still 400s.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCustomFeat, reviewCustomFeat } from '@/lib/dnd/classes/custom';
import { splitReview } from '@/lib/dnd/classes/custom-ai';
import HomebrewFeatBuilderPage from '@/app/dnd/characters/[id]/build/feat/page';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const PAGE = 'app/dnd/characters/[id]/build/feat/page.tsx';
const src = read(PAGE);

describe('the page offers both authoring paths', () => {
  it('renders the AI prompt AND a write-it-myself route', () => {
    // `useParams` returns undefined outside a router, which is fine: the page only reads an id from it.
    const html = renderToStaticMarkup(React.createElement(HomebrewFeatBuilderPage));
    expect(html).toContain('Draft with AI');
    expect(html).toContain('Write it myself');
  });

  it('says up front that every field is editable', () => {
    const html = renderToStaticMarkup(React.createElement(HomebrewFeatBuilderPage));
    expect(html).toContain('edit every');
  });

  it('shows no draft form until there is a draft', () => {
    const html = renderToStaticMarkup(React.createElement(HomebrewFeatBuilderPage));
    expect(html).not.toContain('Rules text');
  });
});

describe('every field of the feat model is reachable', () => {
  // A form that edits four of six fields would leave the other two AI-only, which is the gap re-opened.
  for (const [field, marker] of [
    ['name', 'hf-name'],
    ['category', 'hf-cat'],
    ['prerequisite', 'hf-prereq'],
    ['body', 'hf-body'],
  ] as const) {
    it(`${field} has a control`, () => expect(src).toContain(marker));
  }

  it('ability increase is a per-ability toggle, not free text', () => {
    expect(src).toContain('abilityIncrease: on ?');
    expect(src).toContain("ABILITIES: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']");
  });

  it('repeatable is a checkbox', () => {
    expect(src).toContain('repeatable: e.target.checked');
  });

  it('category offers exactly the four the model allows', () => {
    expect(src).toContain("CATEGORIES: CustomFeat['category'][] = ['origin', 'general', 'fighting-style', 'epic-boon']");
  });
});

describe('the live review is the same verdict the save will use', () => {
  it('the page reviews with the engine, not with its own rules', () => {
    expect(src).toContain('reviewCustomFeat(buildCustomFeat(');
    expect(src).toContain('splitReview');
    // Recomputed per edit rather than held from the AI response, or the feedback would describe the draft
    // the player has since changed.
    expect(src).toMatch(/useMemo\(\(\) => \{[\s\S]*?reviewCustomFeat/);
    expect(src).toContain('}, [draft]);');
  });

  it('the save route reviews with the same function, and refuses errors', () => {
    const route = read('app/api/dnd/characters/[id]/homebrew-feat/save/route.ts');
    expect(route).toContain('reviewCustomFeat');
    expect(route).toContain('parseCustomFeatInput');
    expect(route).toMatch(/if \(!review\.ok\)[\s\S]{0,120}status: 400/);
  });

  it('saving is blocked while the engine reports an error', () => {
    expect(src).toContain('disabled={saving || !review.ok}');
  });

  it('and the shared engine really does refuse an empty draft', () => {
    // The blank "write it myself" start must NOT be saveable — it has no name and no rules text.
    const r = splitReview(reviewCustomFeat(buildCustomFeat({
      name: '', category: 'general', body: '', system: 'dnd5e-2024', custom: {},
    })));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field).sort()).toEqual(['body', 'name']);
  });

  it('and accepts a hand-written one', () => {
    const r = splitReview(reviewCustomFeat(buildCustomFeat({
      name: 'Cinder Step', category: 'general', prerequisite: 'Level 4+', body: 'You may Dash as a bonus action once per turn.',
      system: 'dnd5e-2024', custom: {},
    })));
    expect(r.ok).toBe(true);
  });
});

describe('the page does not invent what it cannot know', () => {
  it('leaves `system` to the server, which reads it off the character', () => {
    // The client has no way to know the character's system here, and guessing one would be a rules error of
    // the kind Ground Rule 3 exists to prevent. The save route derives it; the placeholder only satisfies
    // the review's presence check.
    expect(src).toContain("system: draft.system || 'set-on-save'");
    expect(src).not.toMatch(/system:\s*'dnd5e-20(14|24)'/);
    expect(read('app/api/dnd/characters/[id]/homebrew-feat/save/route.ts'))
      .toContain('normalizeSystem((character as { system?: string }).system)');
  });
});
