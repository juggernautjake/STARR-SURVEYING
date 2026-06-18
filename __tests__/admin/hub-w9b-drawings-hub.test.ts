// __tests__/admin/hub-w9b-drawings-hub.test.ts
//
// Slice W9b — consolidated drawings-hub widget. Pure helpers +
// source-lock for the size-relative contract.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatRelative, limitForBucket } from '@/lib/hub/widgets/drawings-hub';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('limitForBucket (pure)', () => {
  it('returns the per-bucket row cap (0 / 4 / 6 / 8 / 12)', () => {
    expect(limitForBucket('tiny')).toBe(0);
    expect(limitForBucket('small')).toBe(4);
    expect(limitForBucket('medium')).toBe(6);
    expect(limitForBucket('large')).toBe(8);
    expect(limitForBucket('xlarge')).toBe(12);
  });
});

describe('formatRelative (pure)', () => {
  const now = new Date('2026-06-18T12:00:00Z');

  it("'just now' under a minute", () => {
    expect(formatRelative('2026-06-18T11:59:30Z', now)).toBe('just now');
  });

  it("'<N>m ago' between 1 and 59 minutes", () => {
    expect(formatRelative('2026-06-18T11:30:00Z', now)).toBe('30m ago');
  });

  it("'<N>h ago' between 1 and 23 hours", () => {
    expect(formatRelative('2026-06-18T05:00:00Z', now)).toBe('7h ago');
  });

  it("'<N>d ago' between 1 and 6 days", () => {
    expect(formatRelative('2026-06-15T12:00:00Z', now)).toBe('3d ago');
  });

  it('falls back to a locale date past 7 days', () => {
    // Just assert it doesn't crash + returns a non-empty string.
    const out = formatRelative('2026-05-01T00:00:00Z', now);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe('just now');
  });
});

describe('drawings-hub widget registration + render (W9b)', () => {
  const SRC = read('lib/hub/widgets/drawings-hub/index.tsx');

  it('registers with id "drawings-hub"', () => {
    expect(SRC).toMatch(/defineWidget<DrawingsHubContent>\(\{\s*\n\s*id: 'drawings-hub'/);
  });

  it("treats 401 / 403 as 'empty' (matches the W5 / W8 / W9a pattern)", () => {
    expect(SRC).toMatch(/res\.status === 401 \|\| res\.status === 403/);
  });

  it('size-relative testids: tiny + per-bucket dynamic at small / medium / large / xlarge', () => {
    expect(SRC).toMatch(/data-testid="drawings-hub-tiny"/);
    expect(SRC).toMatch(/data-testid=\{`drawings-hub-\$\{bucket\}`\}/);
  });

  it('Mine / All scope toggle renders at every bucket except small', () => {
    expect(SRC).toMatch(/data-testid="drawings-hub-scope-toggle"/);
    expect(SRC).toMatch(/const showScopeToggle = bucket !== 'small'/);
  });

  it('clicking each toggle chip flips the scope state', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setScope\('mine'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => setScope\('all'\)\}/);
  });

  it('row link deep-links to /admin/cad with the drawing id', () => {
    expect(SRC).toMatch(/`\/admin\/cad\?drawing=\$\{encodeURIComponent\(d\.id\)\}`/);
  });
});

describe('register-all + widget-options wire drawings-hub (W9b)', () => {
  it('imports the new widget', () => {
    const SRC = read('lib/hub/widgets/register-all.ts');
    expect(SRC).toMatch(/import '\.\/drawings-hub'/);
  });

  it("the schema registry has a 'drawings-hub' entry so the Slice-12 coverage spec passes", () => {
    const SRC = read('lib/hub/widget-options.ts');
    expect(SRC).toMatch(/'drawings-hub':\s*\{\s*source:\s*'none'\s*\}/);
  });
});
