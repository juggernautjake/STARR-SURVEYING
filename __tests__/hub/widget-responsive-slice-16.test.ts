// __tests__/hub/widget-responsive-slice-16.test.ts
//
// Slice 16 of employee-hub-overhaul-2026-05-30.md. Locks the size-
// bucket-aware branches on the three widgets whose Slice-14/15/15b/
// 15c content additions risked clipping at 'small' bucket:
//   - streak-counter: drop the "Longest:" line at small
//   - sun-calculator: hide the twilight row at small (regardless of toggle)
//   - flashcards-due: collapse the description suffix at small
//
// Source-regex assertions because the React render path hits the SSR-
// snapshot caching limitation other hub specs work around.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const STREAK = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'widgets', 'streak-counter', 'index.tsx'),
  'utf8',
);

const SUN = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'widgets', 'sun-calculator', 'index.tsx'),
  'utf8',
);

const FLASHCARDS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'widgets', 'flashcards-due', 'index.tsx'),
  'utf8',
);

describe('Slice 16 — streak-counter drops "Longest:" at small bucket', () => {
  it('declares a showLongest flag derived from the bucket', () => {
    expect(STREAK).toMatch(/const showLongest = bucket !== 'small';/);
  });

  it('gates the Longest span behind showLongest', () => {
    expect(STREAK).toMatch(
      /\{showLongest && \(\s*<span[\s\S]*?Longest:[\s\S]*?<\/span>\s*\)\}/,
    );
  });

  it('the kind/progress line still renders unconditionally (above the gated longest)', () => {
    expect(STREAK).toMatch(
      /\{meta\.label\} · \{info\.current_days\} of \{goal\}[\s\S]*?showLongest && \(/,
    );
  });
});

describe('Slice 16 — sun-calculator hides twilight at small bucket', () => {
  it('the twilight row guard requires showTwilight AND bucket !== "small"', () => {
    expect(SUN).toMatch(/\{showTwilight && bucket !== 'small' && \(/);
  });

  it('the twilight content + testid remain present (so medium+ still surfaces it)', () => {
    expect(SUN).toMatch(/data-testid="sun-calculator-twilight"/);
    expect(SUN).toMatch(/Civil twilight: ~30 min before sunrise \/ after sunset/);
  });
});

describe('Slice 16 — flashcards-due collapses description at small bucket', () => {
  it('declares a bucket-aware description local', () => {
    expect(FLASHCARDS).toMatch(/const description = overflow/);
  });

  it('overflow branch uses the short "cards ready" at small + the full suffix elsewhere', () => {
    expect(FLASHCARDS).toMatch(
      /overflow[\s\S]*?bucket === 'small' \? 'cards ready' : `cards ready \(capped at \$\{cap\}\)`/,
    );
  });

  it('non-overflow branch uses the short "cards ready" at small + the full phrase elsewhere', () => {
    expect(FLASHCARDS).toMatch(
      /bucket === 'small' \? 'cards ready' : 'cards ready for review'/,
    );
  });
});
