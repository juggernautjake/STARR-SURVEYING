// __tests__/hub/hub-greeting-mobile-css.test.ts
//
// hub-mobile-build-out Slice 4 — locks the phone-only (<640 px) media
// rule on the hub greeting: card padding + heading typography
// tightened, and the role-pills list turns into a swipeable horizontal
// strip so a surveyor with many roles doesn't get a tall pill stack
// pushing widgets off the fold.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'app', 'admin', 'me', 'AdminMe.css'),
  'utf8',
);

// Slice the phone polish block out (balanced braces). There's an
// earlier `@media (max-width: 640px)` rule for `.hub-columns`, so we
// anchor on the Slice-4 marker comment to find ours.
function phoneBlock(): string {
  const marker = CSS.indexOf('hub-mobile-build-out Slice 4');
  if (marker < 0) return '';
  const opener = CSS.indexOf('@media (max-width: 640px)', marker);
  if (opener < 0) return '';
  const braceStart = CSS.indexOf('{', opener);
  if (braceStart < 0) return '';
  let depth = 1;
  for (let i = braceStart + 1; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') {
      depth--;
      if (depth === 0) return CSS.slice(braceStart + 1, i);
    }
  }
  return '';
}

describe('hub-greeting phone (<640 px) polish', () => {
  it('has a phone-only @media block', () => {
    expect(CSS).toMatch(/@media \(max-width: 640px\)/);
  });

  it('tightens .hub-page padding on phones', () => {
    expect(phoneBlock()).toMatch(/\.hub-page\s*\{[\s\S]*?padding:/);
  });

  it('tightens the greeting heading typography on phones', () => {
    expect(phoneBlock()).toMatch(/\.hub-greeting__heading\s*\{[\s\S]*?font-size:\s*1\.35rem/);
  });

  it('turns the role-pills list into a horizontal swipeable strip', () => {
    const block = phoneBlock();
    expect(block).toMatch(/\.hub-greeting__role-pills-list\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(block).toMatch(/\.hub-greeting__role-pills-list\s*\{[\s\S]*?overflow-x:\s*auto/);
  });

  it('hides the scrollbar so the strip reads as a swipe affordance', () => {
    const block = phoneBlock();
    expect(block).toMatch(/scrollbar-width:\s*none/);
    expect(block).toMatch(/::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
  });

  it('pins each pill so the flex strip never squashes them', () => {
    expect(phoneBlock()).toMatch(/\.hub-greeting__role-pill\s*\{[\s\S]*?flex:\s*0 0 auto/);
  });
});
