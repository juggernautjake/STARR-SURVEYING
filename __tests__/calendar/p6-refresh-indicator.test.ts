// __tests__/calendar/p6-refresh-indicator.test.ts
//
// calendar-polish Slice P6 — wall-TV refresh indicator. Locks the
// page wiring (distinct refreshing state, flag flip around
// auto-refresh only) + the CSS visibility gate (must be both
// data-display-mode='big-screen' AND data-refreshing='true').

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('/admin/calendar/page.tsx — P6 wiring', () => {
  const SRC = read('app/admin/calendar/page.tsx');

  it('declares a `refreshing` state distinct from `loading`', () => {
    expect(SRC).toMatch(/const \[refreshing, setRefreshing\] = useState<boolean>\(false\)/);
  });

  it('flips refreshing only inside the auto-refresh interval, not on every fetch', () => {
    expect(SRC).toMatch(
      /setInterval\(\(\) => \{[\s\S]*?setRefreshing\(true\);[\s\S]*?void load\(\)\.finally\(\(\) => \{[\s\S]*?setTimeout\(\(\) => setRefreshing\(false\), 1200\);/,
    );
  });

  it('the initial mount load() does NOT flip refreshing (only the auto-refresh does)', () => {
    // The mount-time useEffect should call load() WITHOUT touching
    // setRefreshing — the very first paint isn't an "auto-refresh".
    // Lock the mount path is a plain `if (isAdminUser) void load();`
    // with no setRefreshing nearby.
    expect(SRC).toMatch(
      /useEffect\(\(\) => \{\s*\n\s*if \(isAdminUser\) void load\(\);\s*\n\s*\}, \[isAdminUser, load\]\);/,
    );
  });

  it('page root carries data-refreshing only when the flag is true', () => {
    expect(SRC).toMatch(/data-refreshing=\{refreshing \? 'true' : undefined\}/);
  });

  it('renders the dot element with testID + aria-hidden (decorative)', () => {
    expect(SRC).toMatch(/className="calendar-page__refresh-dot"/);
    expect(SRC).toMatch(/data-testid="calendar-refresh-dot"/);
    expect(SRC).toMatch(/aria-hidden/);
  });
});

describe('Calendar.css — P6 visibility + animation', () => {
  const CSS = read('app/admin/styles/Calendar.css');

  it('dot is positioned fixed + transparent by default', () => {
    expect(CSS).toMatch(
      /\.calendar-page__refresh-dot \{[\s\S]*?position: fixed;[\s\S]*?opacity: 0;/,
    );
  });

  it('dot is success-token green so it reads as a healthy heartbeat', () => {
    expect(CSS).toMatch(
      /\.calendar-page__refresh-dot \{[\s\S]*?background: var\(--color-success, #10B981\);/,
    );
  });

  it('dot becomes visible ONLY when BOTH attributes are set on the root', () => {
    expect(CSS).toMatch(
      /\.calendar-page\[data-display-mode='big-screen'\]\[data-refreshing='true'\] \.calendar-page__refresh-dot \{[\s\S]*?opacity: 1;[\s\S]*?animation: calendar-refresh-glow/,
    );
  });

  it('declares the expanding-ring keyframes', () => {
    expect(CSS).toMatch(/@keyframes calendar-refresh-glow \{[\s\S]*?box-shadow: 0 0 0 18px/);
  });

  it('reduced-motion keeps the dot visible (status signal) but skips the ring', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\[data-display-mode='big-screen'\]\[data-refreshing='true'\] \.calendar-page__refresh-dot \{\s*\n\s*animation: none/,
    );
  });

  it('print stylesheet hides the dot — wall-TV-only signal', () => {
    expect(CSS).toMatch(
      /@media print \{[\s\S]*?\.calendar-page__refresh-dot \{\s*\n\s*display: none !important;/,
    );
  });

  it('uses canonical success token (no drift)', () => {
    expect(CSS).toMatch(/var\(--color-success/);
    expect(CSS).not.toMatch(/var\(--color-primary[,)]/);
  });
});
