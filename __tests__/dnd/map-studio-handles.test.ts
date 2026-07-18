// __tests__/dnd/map-studio-handles.test.ts — Slice 35a regression guard: the image scale/rotate handles
// once "disappeared" (the reported bug). The current code draws them for every selected non-text
// instance; this locks the invariants so they can't silently vanish again. Source-anchored — map-studio
// is a vanilla-HTML tool (no module to import), so we assert against the file the browser loads, the
// same technique as progression-tab / campaign-create.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const HTML = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');
// Isolate the renderHandles() body so the assertions can't be satisfied by unrelated code elsewhere.
const BODY = (() => {
  const start = HTML.indexOf('function renderHandles(');
  expect(start, 'renderHandles() must exist').toBeGreaterThan(-1);
  const end = HTML.indexOf('\nfunction ', start + 1);
  return HTML.slice(start, end === -1 ? undefined : end);
})();

describe('map-studio image transform handles cannot silently disappear (Slice 35a)', () => {
  it('renderHandles draws for every selected instance EXCEPT text', () => {
    // The one and only kind it skips is text. If someone re-adds an `image` exclusion, this fails.
    expect(BODY).toMatch(/i\.kind===["']text["']\)return/);
    expect(BODY).not.toMatch(/kind===["']image["']\)return/);
  });

  it('draws the rotate handle plus all four corner scale handles', () => {
    for (const cls of ['ihandle rot', 'ihandle tl', 'ihandle tr', 'ihandle bl', 'ihandle br']) {
      expect(BODY, `missing "${cls}"`).toContain(cls);
    }
  });

  it('wires the handles to the scale + rotate drag handlers', () => {
    expect(BODY).toContain('onInstScaleDown');
    expect(BODY).toContain('onInstRotateDown');
    expect(BODY).toContain('data-h'); // the handles carry the discriminator the mousedown reads
  });

  it('is actually invoked from the instance render path (drawn, not just defined)', () => {
    // At least one call site outside the definition — otherwise the handles never render.
    const calls = HTML.match(/renderHandles\(\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('the corner handle CSS that makes them visible is present', () => {
    // The scale pads are transparent boxes with a ::after gold square; the rotate handle is a circle.
    expect(HTML).toContain('.ihandle.rot');
    expect(HTML).toMatch(/\.ihandle\.tl,\.ihandle\.tr,\.ihandle\.bl,\.ihandle\.br/);
    expect(HTML).toContain('#handleLayer'); // the always-on-top overlay they live in
  });
});
