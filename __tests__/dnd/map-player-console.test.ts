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

// ── The in-place drawer (the FULLER ask the link was a first step toward) ────────────────────────
// Owner: "the whole digital screen viewer … should pop up from the bottom of the map viewer, and then if
// we close it it just slides down to the bottom, but the top of it is always visible so that we can click
// on it to open it again. It should have all of the info displayed on the screen and knobs and all of
// that." The toolbar link opens the real console in a NEW TAB; this is the console inside the map viewer.
describe('map studio → embedded player console drawer (Slice 39)', () => {
  it('mounts a drawer inside the map viewer, not as a separate page', () => {
    expect(SRC).toContain('id="pConsole"');
    expect(SRC).toContain('id="pConsoleFrame"');
    // Inside .canvaswrap (which is already position:relative;overflow:hidden), anchored to its bottom.
    expect(SRC).toMatch(/\.pconsole\{position:absolute;left:0;right:0;bottom:0/);
  });

  it('reuses console.html rather than rebuilding the screen', () => {
    // Same "iframe the proven static tool" approach as /dnd/campaigns/[id]/console, carrying the studio's
    // own campaign + map params so the drawer shows the same map the DM is looking at.
    expect(SRC).toContain('frame.src="console.html?"+p.toString()');
    expect(SRC).toMatch(/new URLSearchParams\(\{campaign:camp\}\)/);
    expect(SRC).toMatch(/if\(mid\)p\.set\("map",mid\)/);
  });

  it('SLIDES rather than mounting/unmounting, and never closes past its peek header', () => {
    // A transform transition — an unmount would also tear down the console's engine and lose the
    // player's screen state, and would read as a flash rather than a drawer.
    expect(SRC).toMatch(/transform:translateY\(calc\(100% - var\(--peek\)\)\);transition:transform/);
    expect(SRC).toMatch(/\.pconsole\.open\{transform:translateY\(0\);\}/);
    // The header is its own non-shrinking row exactly one --peek tall, so the closed drawer always
    // leaves precisely the handle showing — the affordance for reopening it.
    expect(SRC).toMatch(/\.pconsole \.phead\{flex:0 0 var\(--peek\);height:var\(--peek\)/);
  });

  it('appears only in Player mode, and only when there is a campaign to load', () => {
    expect(SRC).toMatch(/body\.playmode \.pconsole\.avail\{display:flex;\}/);
    expect(SRC).toMatch(/const available=!!camp;/);
    expect(SRC).toContain('pConsole.sync(m);'); // setMode drives it
  });

  it('remembers open/closed for the session', () => {
    expect(SRC).toContain('"stardust-map-studio:console-open"');
    expect(SRC).toMatch(/sessionStorage\.setItem\(KEY,open\?"1":"0"\)/);
  });

  it('loads the console lazily — a DM who never opens it pays nothing', () => {
    // console.html is ~172KB and boots its own engine + fetches the campaign map. Setting src at page
    // load would tax every DM-editor session that never opens the drawer.
    expect(SRC).toMatch(/if\(loaded\)return;loaded=true;/);
    expect(SRC).toMatch(/if\(open\)load\(\);/);
    // The iframe ships with NO src attribute; it is set on first open.
    expect(SRC).toMatch(/<iframe id="pConsoleFrame"(?![^>]*\ssrc=)[^>]*>/);
  });

  it('is operable by keyboard and announces its state', () => {
    expect(SRC).toMatch(/id="pConsoleHead" role="button" tabindex="0" aria-expanded="false"/);
    expect(SRC).toMatch(/head\.addEventListener\("keydown"/);
    expect(SRC).toMatch(/aria-controls="pConsoleBody"/);
  });
});
