import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaybooks, loadPlaybook, validateRegistry, describePlaybooks } from '../playbooks/index.js';
import { validatePlaybook } from '../playbooks/types.js';

// ── B3: site navigation playbooks — the written-down knowledge of how each site behaves ───────────

describe('the playbook registry is well-formed', () => {
  it('every registered playbook validates', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('validatePlaybook catches a half-authored playbook', () => {
    const problems = validatePlaybook({
      site: 'x', county: 'BELL', version: 0, displayName: '', entryUrl: 'not-a-url',
      egress: 'direct', dismissals: [], searchRecipe: { query: '', documentTypes: [] },
      doneSignal: { kind: 'appears', signal: '' }, viewerRecipe: '', downloadRecipe: '', captchaSignature: null,
    });
    expect(problems.some((p) => p.includes('entryUrl'))).toBe(true);
    expect(problems.some((p) => p.includes('version'))).toBe(true);
    expect(problems.some((p) => p.includes('done-signal'))).toBe(true);
    expect(problems.some((p) => p.includes('documentTypes'))).toBe(true);
  });
});

describe('loading by county and site', () => {
  it('BELL loads the clerk and the plat repository, case-insensitively', () => {
    const bell = loadPlaybooks('Bell County');
    expect(bell.map((p) => p.site).sort()).toEqual(['bell-clerk', 'bell-plat-repo']);
  });

  it('an unindexed county loads nothing (and says so)', () => {
    expect(loadPlaybooks('TRAVIS')).toEqual([]);
    expect(describePlaybooks('TRAVIS')).toContain('No site playbook is authored');
  });

  it('the plat-repo playbook records the browser-route egress and a done-signal, never a wait', () => {
    const repo = loadPlaybook('bell-plat-repo')!;
    expect(repo.egress).toBe('browser-route');
    expect(repo.doneSignal.signal).toBeTruthy();
    const clerk = loadPlaybook('bell-clerk')!;
    expect(clerk.doneSignal).toEqual({ kind: 'disappears', signal: 'Loading Results' });
  });

  it('describePlaybooks names the sites and versions', () => {
    expect(describePlaybooks('BELL')).toContain('bell-clerk v1');
    expect(describePlaybooks('BELL')).toContain('bell-plat-repo v1');
  });
});

describe('the run surfaces the playbooks at start', () => {
  const SRC = path.resolve(process.cwd(), 'src');
  const strip = (s: string) => s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  const index = strip(fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8'));
  it('index.ts logs describePlaybooks(county) at run start', () => {
    expect(index).toContain('describePlaybooks(county)');
    expect(index).toContain("'[Playbooks]', 'info', 'Site playbooks'");
  });
});
