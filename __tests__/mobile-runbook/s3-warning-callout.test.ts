// __tests__/mobile-runbook/s3-warning-callout.test.ts
//
// mobile-and-customer-query-gap Slice S3 — mobile styles audit.
// Locks the shared warningCallout palette role + the migration of
// every drift literal (#FEF3C7 / #D97706 / #92400E) on the surfaces
// the audit identified. Source-lock by source-string read so the
// office test tree doesn't have to import React Native.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('mobile audit doc — present + complete', () => {
  const DOC = read('mobile/STYLES_AUDIT.md');

  it('declares what already works (don\'t touch)', () => {
    expect(DOC).toMatch(/Three-scheme theme/);
    expect(DOC).toMatch(/useResolvedScheme\(\)/);
    expect(DOC).toMatch(/controls.*token/);
  });

  it('catalogues the drift categories', () => {
    expect(DOC).toMatch(/Hard-coded `#RRGGBB` literals/);
    expect(DOC).toMatch(/text scale handling/);
    expect(DOC).toMatch(/Tablet layouts/);
  });

  it('tracks the larger follow-up slices (S3b/c/d/e/f)', () => {
    expect(DOC).toMatch(/S3b/);
    expect(DOC).toMatch(/S3c/);
    expect(DOC).toMatch(/S3d/);
    expect(DOC).toMatch(/S3e/);
    expect(DOC).toMatch(/S3f/);
  });
});

describe('mobile/lib/theme.ts — warningCallout role added', () => {
  const SRC = read('mobile/lib/theme.ts');

  it('extends the Palette interface with warningCallout', () => {
    expect(SRC).toMatch(/warningCallout: \{[\s\S]*?background: string;[\s\S]*?border: string;[\s\S]*?title: string;[\s\S]*?\};/);
  });

  it('declares values for all three schemes (light / dark / sun)', () => {
    // Look for the role under each scheme block.
    const matches = SRC.match(/warningCallout: \{[\s\S]*?\}/g) ?? [];
    // 4 matches = the interface declaration + light + dark + sun.
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('the light scheme retains the original amber palette (#FEF3C7 / #D97706 / #92400E)', () => {
    expect(SRC).toMatch(/light: \{[\s\S]*?warningCallout: \{[\s\S]*?background: '#FEF3C7'[\s\S]*?border: '#D97706'[\s\S]*?title: '#92400E'/);
  });
});

describe('mobile/lib/WarningCallout.tsx — shared component', () => {
  const SRC = read('mobile/lib/WarningCallout.tsx');

  it('default-exports the WarningCallout component', () => {
    expect(SRC).toMatch(/export default function WarningCallout\(/);
  });

  it('takes title + body + optional testID', () => {
    expect(SRC).toMatch(/title: string;[\s\S]*?body: string;[\s\S]*?testID\?: string;/);
  });

  it('reads colors from the resolved scheme palette (no hard-coded literals)', () => {
    expect(SRC).toMatch(/const scheme = useResolvedScheme\(\);/);
    expect(SRC).toMatch(/const palette = colors\[scheme\];/);
    expect(SRC).toMatch(/palette\.warningCallout\.background/);
    expect(SRC).toMatch(/palette\.warningCallout\.border/);
    expect(SRC).toMatch(/palette\.warningCallout\.title/);
  });
});

describe('mobile/app/(tabs)/money/capture.tsx — receipt callout migrated', () => {
  const SRC = read('mobile/app/(tabs)/money/capture.tsx');

  it('imports the shared WarningCallout component', () => {
    expect(SRC).toMatch(/import WarningCallout from '@\/lib\/WarningCallout';/);
  });

  it('renders <WarningCallout> in place of the inline View+Text block', () => {
    expect(SRC).toMatch(/<WarningCallout\s+testID="money-capture-warning-from-stop"/);
  });

  it('no longer carries the hard-coded amber literals at the inline-style call site', () => {
    expect(SRC).not.toMatch(/backgroundColor: '#FEF3C7'/);
    expect(SRC).not.toMatch(/borderColor: '#D97706'/);
    expect(SRC).not.toMatch(/color: '#92400E'/);
  });
});

describe('mobile/app/(tabs)/money/index.tsx — filter-chips migrated', () => {
  const SRC = read('mobile/app/(tabs)/money/index.tsx');

  it('uses palette.warningCallout for the active-filter chip', () => {
    expect(SRC).toMatch(/backgroundColor: palette\.warningCallout\.background,/);
    expect(SRC).toMatch(/borderColor: palette\.warningCallout\.border,/);
    expect(SRC).toMatch(/color: palette\.warningCallout\.title/);
  });

  it('no longer carries the hard-coded amber literals at the inline-style call site', () => {
    expect(SRC).not.toMatch(/backgroundColor: '#FEF3C7'/);
    expect(SRC).not.toMatch(/borderColor: '#D97706'/);
  });

  it('the static filterChipText style block no longer locks a color (per-call-site override)', () => {
    expect(SRC).not.toMatch(/filterChipText: \{\s*\n\s*color: '#92400E'/);
  });
});
