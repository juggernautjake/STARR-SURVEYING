import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { platSourceStatus, platSourceStatement } from '../services/county-plats.js';

// ── C4: every county's plat source carries an egress note, and a run says its reachability ────────
//
// Bell's free repository blocks the worker IP (reached only through the browser egress); Hays
// answers directly; a county with no registry entry has no free plat source — and the run says which
// before it searches, instead of searching in silence.

describe('platSourceStatus', () => {
  it('Bell is reachable only through the browser egress', () => {
    const s = platSourceStatus('BELL');
    expect(s.available).toBe(true);
    expect(s.egress).toBe('browser-route');
    expect(s.via).toContain('browser');
  });

  it('Hays answers the worker directly', () => {
    const s = platSourceStatus('hays');
    expect(s.available).toBe(true);
    expect(s.egress).toBe('direct');
  });

  it('a county with no registry entry has no free plat source', () => {
    const s = platSourceStatus('TRAVIS');
    expect(s.available).toBe(false);
    expect(s.egress).toBeNull();
    expect(s.via).toBe('none');
  });
});

describe('platSourceStatement', () => {
  it('names the source and how it is reached for a configured county', () => {
    expect(platSourceStatement('BELL')).toContain('reached through');
    expect(platSourceStatement('BELL')).toContain('browser');
  });
  it('says an unindexed county has no free plat source', () => {
    const line = platSourceStatement('TRAVIS');
    expect(line).toContain('No free plat repository is indexed for TRAVIS');
    expect(line).toContain('clerk index or an office fetch');
  });
});

describe('the run announces the plat source before searching', () => {
  const SRC = path.resolve(process.cwd(), 'src');
  const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  const index = strip(fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8'));
  it('index.ts logs platSourceStatement(county) at run start', () => {
    expect(index).toContain('platSourceStatement(county)');
    expect(index).toContain("'[Plats]', 'info', 'Plat source'");
  });
});
