// __tests__/dnd/campaign-lobby-error.test.ts — the campaign "enter as" picker used to swallow a failed
// /api/dnd/dev/enter (403 for a password-protected account, etc.): the click just reverted with no
// message, a dead button. It now surfaces the reason. Source-anchored (the interaction needs a rendered
// component + router mock); found + verified via the Slice-40 browser pass.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/CampaignLobby.tsx'), 'utf8');

describe('CampaignLobby surfaces a failed enter instead of swallowing it', () => {
  it('reads the API error and sets an error state on a non-ok response', () => {
    expect(SRC).toContain('const [error, setError]');
    expect(SRC).toContain('r.json().catch(() => ({}))'); // reads the server\'s reason
    expect(SRC).toContain('setError(j.error');
  });
  it('renders the error to the user (an alert), not a silent no-op', () => {
    expect(SRC).toContain('role="alert"');
    expect(SRC).toContain('{error}');
    // the old branch was `} else setEntering(null)` with nothing else — the error path is now non-empty
    expect(SRC).not.toMatch(/\}\s*else\s+setEntering\(null\)/);
  });
});
