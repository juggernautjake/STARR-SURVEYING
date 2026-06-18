// __tests__/admin/hub-s4-recent-announcements.test.ts
//
// Slice S4 of widget-size-responsive-content-2026-06-18 —
// per-bucket growth for `recent-announcements`. The three
// other S4 widgets (messages, mentions-inbox, open-discussions)
// are deferred: their consolidated replacement `comms-inbox`
// (W8) already follows the W5 exemplary pattern, and polishing
// the legacy tiles past their tiny-mode would slow surveyors
// who migrate.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatPublishedAge } from '@/lib/hub/widgets/recent-announcements';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('formatPublishedAge (pure)', () => {
  const now = Date.parse('2026-06-18T12:00:00Z');

  it("'just now' under a minute", () => {
    expect(formatPublishedAge('2026-06-18T11:59:30Z', now)).toBe('just now');
  });

  it("'5m' / '3h' / '2d' relative formats", () => {
    expect(formatPublishedAge('2026-06-18T11:55:00Z', now)).toBe('5m');
    expect(formatPublishedAge('2026-06-18T09:00:00Z', now)).toBe('3h');
    expect(formatPublishedAge('2026-06-16T12:00:00Z', now)).toBe('2d');
  });

  it('falls back to a locale date past 7 days', () => {
    const out = formatPublishedAge('2026-05-10T12:00:00Z', now);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/^\d+m$/);
    expect(out).not.toBe('just now');
  });

  it("returns '' for an unparseable ISO", () => {
    expect(formatPublishedAge('not-a-date', now)).toBe('');
  });
});

describe('recent-announcements rendering contract (S4)', () => {
  const SRC = read('lib/hub/widgets/recent-announcements/index.tsx');

  it('per-bucket dynamic testid', () => {
    expect(SRC).toMatch(/data-testid=\{`recent-announcements-\$\{bucket\}`\}/);
  });

  it('row date column renders at medium+', () => {
    expect(SRC).toMatch(/const showDate = bucket === 'medium' \|\| bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="recent-announcements-row-date"/);
  });

  it('body preview renders at large+ only', () => {
    expect(SRC).toMatch(/const showPreview = bucket === 'large' \|\| bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="recent-announcements-row-preview"/);
  });

  it('"Open announcements →" CTA is xlarge-only', () => {
    expect(SRC).toMatch(/const showOpenCta = bucket === 'xlarge'/);
    expect(SRC).toMatch(/data-testid="recent-announcements-cta"/);
  });
});
