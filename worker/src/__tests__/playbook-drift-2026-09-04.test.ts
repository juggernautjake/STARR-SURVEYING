import { describe, it, expect } from 'vitest';
import { assessPlaybookDrift, describeDrift, type SiteObservation } from '../playbooks/drift.js';
import { loadPlaybook } from '../playbooks/index.js';
import { detectCaptcha } from '../research/captcha-signatures.js';

// ── B5: the drift-watch decision — how a live site has moved away from its playbook ───────────────

const clerk = loadPlaybook('bell-clerk')!;
const repo = loadPlaybook('bell-plat-repo')!;

const obs = (o: Partial<SiteObservation>): SiteObservation => ({ reachable: true, ...o });

describe('assessPlaybookDrift', () => {
  it('reports nothing when the site still matches', () => {
    expect(assessPlaybookDrift(clerk, obs({ doneSignalSeen: true, captcha: null }))).toEqual([]);
  });

  it('an unreachable site is the only finding (nothing else can be judged)', () => {
    const f = assessPlaybookDrift(clerk, { reachable: false, httpStatus: 503 });
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('unreachable');
    expect(f[0].detail).toContain('HTTP 503');
  });

  it('flags a captcha that the playbook did not record', () => {
    const captcha = detectCaptcha('<div class="h-captcha"></div>');
    const f = assessPlaybookDrift(clerk, obs({ captcha }));
    expect(f.some((x) => x.kind === 'captcha' && x.detail.includes('hCaptcha'))).toBe(true);
  });

  it('flags a missing done-signal', () => {
    const f = assessPlaybookDrift(clerk, obs({ doneSignalSeen: false }));
    expect(f.some((x) => x.kind === 'done-signal-missing' && x.detail.includes('Loading Results'))).toBe(true);
  });

  it('flags an egress that no longer matches the playbook', () => {
    // The plat repo is browser-route; observing a direct hit means the block changed.
    const f = assessPlaybookDrift(repo, obs({ egressUsed: 'direct' }));
    expect(f.some((x) => x.kind === 'egress-changed')).toBe(true);
  });

  it('does not flag the egress it expects', () => {
    const f = assessPlaybookDrift(repo, obs({ egressUsed: 'browser-route' }));
    expect(f.some((x) => x.kind === 'egress-changed')).toBe(false);
  });
});

describe('describeDrift', () => {
  it('says no drift when clean, and names the findings otherwise', () => {
    expect(describeDrift(clerk, [])).toContain('no drift');
    const line = describeDrift(clerk, assessPlaybookDrift(clerk, obs({ doneSignalSeen: false })));
    expect(line).toContain('DRIFTED');
    expect(line).toContain('Loading Results');
  });
});
