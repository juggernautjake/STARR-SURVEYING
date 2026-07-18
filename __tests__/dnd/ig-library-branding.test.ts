// __tests__/dnd/ig-library-branding.test.ts — the IG library page shows Brendan's logo + credit (only for
// Intuitive Games). Source-anchored (the page is a server component); the manifest is covered by ig-art.test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/library/[key]/page.tsx'), 'utf8');

describe('IG library page branding', () => {
  it('renders the IG logo + Brendan credit, gated to the intuitive-games system only', () => {
    expect(SRC).toContain("page.key === 'intuitive-games'");
    expect(SRC).toContain('igSystemLogo()');
    expect(SRC).toContain('IG_ART_CREDIT');
    expect(SRC).toMatch(/alt="Intuitive Games logo"/);
  });

  it('renders a section image gallery when a section carries images', () => {
    expect(SRC).toContain('s.images');
    expect(SRC).toMatch(/s\.images\.gallery\.map/);
    expect(SRC).toMatch(/s\.images!\.credit/); // the credit line renders
  });
});
