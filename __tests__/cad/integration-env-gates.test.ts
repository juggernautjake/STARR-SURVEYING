// __tests__/cad/integration-env-gates.test.ts
//
// C44e — the documented env gates are the ones the code reads.
//
// `docs/cad-integration-reference.md` names, for each integration, the variable that turns it on
// and what "not configured" looks like. That document is the only place those facts are written
// down, and a document nobody checks against the code is a document about what somebody believed —
// C13 and C27 both paid for that lesson in this initiative.
//
// Nothing here can test that `FORGE_WEBHOOK_URL` is set in production; that is a deployment fact,
// not a code fact, and it is exactly why the doc exists. What CAN be tested is that the variable
// names have not been renamed out from under the doc, and that the unconfigured path still behaves
// the way the doc says it does — which is the part a reader will rely on.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const read = (p: string) => fs.readFileSync(p, 'utf8');

const DOC = 'docs/cad-integration-reference.md';
const SYNC_ROUTES = [
  ['compass', 'app/api/admin/cad/compass-sync/route.ts'],
  ['forge', 'app/api/admin/cad/forge-sync/route.ts'],
  ['orbit', 'app/api/admin/cad/orbit-sync/route.ts'],
] as const;
const AI_ROUTES = [
  'app/api/admin/cad/ai-propose/route.ts',
  'app/api/admin/cad/drawing-chat/route.ts',
  'app/api/admin/cad/sketch-reconcile/route.ts',
];

describe('C44e — every documented gate is a variable the code actually reads', () => {
  const doc = read(DOC);

  it.each(SYNC_ROUTES)('%s sync reads the URL and secret the doc names', (name, routePath) => {
    const src = read(routePath);
    const url = `${name.toUpperCase()}_WEBHOOK_URL`;
    const secret = `${name.toUpperCase()}_WEBHOOK_SECRET`;
    expect(src, `${routePath} does not read ${url}`).toContain(`process.env.${url}`);
    expect(src, `${routePath} does not read ${secret}`).toContain(`process.env.${secret}`);
    expect(doc, `${DOC} does not name ${url}`).toContain(url);
    expect(doc, `${DOC} does not name ${secret}`).toContain(secret);
  });

  it.each(SYNC_ROUTES)('%s sync still returns ok:true when unconfigured', (_name, routePath) => {
    const src = read(routePath);
    // This is the claim the whole document leads with, so it is the one most worth pinning. The
    // behaviour is defensible — the seal transition already succeeded and 503-ing would fail an
    // operation the surveyor completed — but it means `ok` cannot distinguish "delivered" from
    // "logged". If this ever changes, the doc's opening section is wrong and must change with it.
    const gate = src.slice(src.indexOf('if (!webhookUrl)'));
    const block = gate.slice(0, gate.indexOf('try {'));
    expect(block).toContain('ok: true');
    expect(block).toContain('forwardedTo: null');
  });

  it.each(AI_ROUTES)('%s names ANTHROPIC_API_KEY in its offline response', (routePath) => {
    const src = read(routePath);
    expect(src).toContain('MissingApiKeyError');
    // Naming the variable is the difference between an error a person can fix and one they can only
    // report. "AI is offline" alone sends somebody to a maintainer; "ANTHROPIC_API_KEY is not
    // configured" sends them to the dashboard.
    expect(src).toContain('ANTHROPIC_API_KEY');
  });

  it('documents the Compass hand-off key the code exports', () => {
    const src = read('lib/cad/integrations/compass.ts');
    const match = src.match(/COMPASS_HANDOFF_KEY = '([^']+)'/);
    expect(match, 'COMPASS_HANDOFF_KEY is gone or renamed').toBeTruthy();
    // The inbound half of Compass needs no env var at all — it is a localStorage hand-off between
    // two apps on one origin — so the key IS its configuration, and the doc says so.
    expect(doc).toContain(match![1]);
  });

  it('points at guards that exist', () => {
    // The doc closes with a table of "where each fact is enforced". A reference to a test file that
    // has been renamed is worse than no reference: it reads as assurance and provides none.
    const referenced = [...doc.matchAll(/`(__tests__\/[^`]+\.test\.ts)`/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(3);
    for (const t of referenced) {
      expect(fs.existsSync(t), `${DOC} points at ${t}, which does not exist`).toBe(true);
    }
  });

  it('points at integration modules and directories that exist', () => {
    // Paths in the doc are written the way a reader would say them — sometimes a directory
    // (`lib/cad/io`), sometimes a file (`lib/cad/ai/reach.ts`). Both are checked; a reference that
    // has been renamed reads as assurance and provides none.
    const referenced = [...doc.matchAll(/`(lib\/cad\/[A-Za-z0-9/_-]+(?:\.ts)?)`/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(3);
    for (const m of referenced) {
      expect(fs.existsSync(m), `${DOC} points at ${m}, which does not exist`).toBe(true);
    }
  });
});
