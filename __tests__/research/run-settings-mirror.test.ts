import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RUN_SETTING_KEYS } from '@/worker/src/research/run-settings';

// The worker's RunSettings and the app's RunSettingsInput describe the SAME per-run knobs, but the
// two sides cannot import each other's types (different tsconfigs), so nothing binds them at compile
// time — the worker's run-settings.ts says exactly this. A run configured with a setting the app
// forgot to mirror is silently dropped. `RUN_SETTING_KEYS` is the worker's runtime list of those
// keys; this asserts the app's mirror carries every one, so adding a key (e.g. `phase` for the
// gather/analyze split) to one side without the other fails here instead of in a run.

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

// The RunSettingsInput interface body, isolated so we match its fields and not an unrelated mention.
function runSettingsInputBody(): string {
  const src = read('app/admin/research/components/useRunState.ts');
  const start = src.indexOf('export interface RunSettingsInput {');
  expect(start, 'RunSettingsInput interface not found in useRunState.ts').toBeGreaterThan(-1);
  const end = src.indexOf('}', start);
  return src.slice(start, end);
}

describe('the app mirrors every worker run setting', () => {
  const body = runSettingsInputBody();

  for (const key of RUN_SETTING_KEYS) {
    it(`RunSettingsInput declares "${key}"`, () => {
      expect(body).toMatch(new RegExp(`\\b${key}\\??:`));
    });
  }

  it('includes the gather/analyze phase specifically', () => {
    expect(RUN_SETTING_KEYS).toContain('phase');
    expect(body).toMatch(/phase\?:/);
  });
});
