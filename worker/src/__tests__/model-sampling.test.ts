// worker/src/__tests__/model-sampling.test.ts
//
// From the owner's run on 2026-08-30:
//
//     [Stage1D] Claude | ai-variant-generation | fail
//     ERROR: 400 {"message":"`temperature` is deprecated for this model."}
//
// The AI address-variant step died on a hard 400 because the worker sends `temperature: 0` to
// `claude-sonnet-5`, which removed the sampling parameters. The run continued — that stage is
// non-fatal — so the only evidence was one red line in an hour of logs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  rejectsSamplingParams,
  samplingFor,
  SAMPLING_REJECTING_MODEL_PREFIXES,
} from '../infra/model-sampling.js';

describe('which models reject temperature', () => {
  it('rejects it on the models that actually removed it', () => {
    for (const m of ['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-fable-5']) {
      expect(rejectsSamplingParams(m), `${m} rejects sampling params`).toBe(true);
    }
  });

  it('still sends it on the models that accept it', () => {
    // Not "delete temperature everywhere": on 4.6 and older, temperature: 0 is doing real work.
    // These are extraction prompts and the default is 1.0.
    for (const m of ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5']) {
      expect(rejectsSamplingParams(m), `${m} accepts sampling params`).toBe(false);
    }
  });

  it('matches on prefix, so a dated or suffixed id still resolves', () => {
    expect(rejectsSamplingParams('claude-sonnet-5-20260101')).toBe(true);
    expect(rejectsSamplingParams('CLAUDE-SONNET-5')).toBe(true);
    expect(rejectsSamplingParams('  claude-opus-5  ')).toBe(true);
  });

  it('treats an unknown model as ACCEPTING — the failure modes are asymmetric', () => {
    // Wrongly omitting temperature makes a prompt slightly less deterministic. Wrongly sending it
    // fails the entire request, which is what happened. Guess in the direction that degrades.
    expect(rejectsSamplingParams('some-future-model')).toBe(false);
    expect(rejectsSamplingParams(undefined)).toBe(false);
    expect(rejectsSamplingParams('')).toBe(false);
  });
});

describe('samplingFor', () => {
  it('omits the field entirely rather than sending null', () => {
    // `temperature: undefined` still serialises the key in some paths; the object must not have it.
    const out = samplingFor('claude-sonnet-5');
    expect(out).toEqual({});
    expect('temperature' in out).toBe(false);
  });

  it('passes the requested value through on an accepting model', () => {
    expect(samplingFor('claude-sonnet-4-6')).toEqual({ temperature: 0 });
    expect(samplingFor('claude-sonnet-4-6', 0.7)).toEqual({ temperature: 0.7 });
  });

  it('covers every prefix it advertises', () => {
    for (const p of SAMPLING_REJECTING_MODEL_PREFIXES) {
      expect(samplingFor(p)).toEqual({});
    }
  });
});

describe('no API call site still sends a literal temperature (E5a)', () => {
  /** Every worker source, excluding tests. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') sources(p, out);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
        out.push(p);
      }
    }
    return out;
  }

  const SRC_ROOT = path.resolve(__dirname, '..');
  // prompt-registry.ts is DATA, not a request: `temperature` is a required field on stored
  // PromptVersion records describing a prompt's configuration. A codemod converted those three
  // and tsc rejected it — the field is `number`, not `number | undefined`. Verified separately
  // that nothing reads `.temperature` off those records, so none of them reaches the API.
  const CONFIG_NOT_REQUESTS = ['ai/prompt-registry.ts'];

  it('finds a plausible number of worker sources — a broken walk would pass everything', () => {
    expect(sources(SRC_ROOT).length).toBeGreaterThan(100);
  });

  it('has no literal `temperature:` left in code that builds a request', () => {
    const offenders = sources(SRC_ROOT)
      .filter((f) => !CONFIG_NOT_REQUESTS.some((c) => f.replace(/\\/g, '/').endsWith(c)))
      .filter((f) => /temperature:\s*[\d.]/.test(
        fs.readFileSync(f, 'utf8')
          .split('\r\n').join('\n')
          .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
          .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ''),
      ))
      .map((f) => path.relative(SRC_ROOT, f).replace(/\\/g, '/'));

    expect(
      offenders,
      'these send a literal temperature and will 400 the moment modelFor() returns a Sonnet 5 or '
        + `Opus 5 model — the router's mid and top tiers are exactly those:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the router really does hand out models that reject it — so the rule still applies', () => {
    // Control. If the tiers were all moved to 4.6, this whole guard would be pinning a rule that
    // no longer bites, and should be re-read rather than left passing.
    const router = fs.readFileSync(path.resolve(SRC_ROOT, 'infra/model-router.ts'), 'utf8');
    expect(router).toMatch(/mid:\s*'claude-sonnet-5'/);
    expect(router).toMatch(/top:\s*'claude-opus-5'/);
  });
});

describe('the call site that failed is wired to it', () => {
  it('address-normalizer no longer sends a literal temperature', () => {
    // The module's own tests pass whether or not anything calls it. This checks the caller.
    const src = fs.readFileSync(
      path.resolve(__dirname, '../services/address-normalizer.ts'),
      'utf8',
    )
      .split('\r\n').join('\n')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

    expect(src).toContain('samplingFor(aiModel)');
    expect(src, 'a literal temperature would 400 on Sonnet 5').not.toMatch(/temperature:\s*0/);
  });
});
