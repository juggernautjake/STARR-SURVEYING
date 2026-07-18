// __tests__/dnd/map-player-console.test.ts — Slice 39 regression guard: the studio's "▶ Player" preview is a
// lesser view than the real player console (console.html), so the reported gap ("I don't see the digital
// screen when I click Player as the DM") was real. The fix is a Player-mode-only "🖥 Open player console ↗"
// link that deep-links to the campaign's real console carrying the current map. This locks that entry point —
// its URL shape and its visibility gating — against regression. Source-anchored: map-studio.html is a vanilla
// browser page (no ES exports).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');

describe('map studio → player console entry point (Slice 39)', () => {
  it('renders the "Open player console" link, hidden by default', () => {
    expect(SRC).toContain('id="openPlayerConsole"');
    expect(SRC).toMatch(/id="openPlayerConsole"[^>]*display:none/); // starts hidden; setMode reveals it
  });

  it('deep-links to the campaign\'s real console carrying the current map id (URL-encoded)', () => {
    // /dnd/campaigns/<campaign>/console?map=<map>, both params encoded, and only when a campaign is present
    // (standalone studio use has no console to open).
    expect(SRC).toContain('`/dnd/campaigns/${encodeURIComponent(camp)}/console`');
    expect(SRC).toContain('`?map=${encodeURIComponent(mid)}`');
    expect(SRC).toMatch(/const camp=q\.get\("campaign"\)/);
    expect(SRC).toMatch(/if\(el&&camp\)/); // the link only arms when a campaign param exists
  });

  it('is shown ONLY in Player mode (and only when armed for a campaign), hidden otherwise', () => {
    // setMode toggles the link: visible when play mode AND it was armed (dataset.ok), else display:none.
    expect(SRC).toMatch(/el\.style\.display=\(m==="play"&&el\.dataset\.ok\)\?"":"none"/);
  });
});
