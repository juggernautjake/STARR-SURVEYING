// How many research runs a box will hold, and why (research plan R7).
//
// Concurrency for this worker is not a throughput dial — it is a survival constraint. One run is
// 20–30 minutes of a Chromium instance plus image and PDF decoding, so guessing high does not make
// things slower, it OOM-kills a neighbour at minute 22, after the paid documents have been bought.
// These tests pin the arithmetic and, more importantly, the reason each limit won.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CORES_PER_PIPELINE,
  MAX_CONCURRENT_PIPELINES_CEILING,
  RAM_PER_PIPELINE_BYTES,
  RESERVED_RAM_BYTES,
  describeCapacity,
  planCapacity,
} from '../infra/capacity.js';

const GB = 1024 ** 3;
const machine = (cores: number, gb: number) => ({ cores, totalMemoryBytes: gb * GB });
const noEnv = {} as NodeJS.ProcessEnv;

describe('the recommended box', () => {
  it('runs the politeness ceiling, not the hardware limit, on 12 cores / 32 GB', () => {
    // netcup RS 4000 G12 — the host the deployment doc recommends. cpu→8, memory→11, ceiling→6.
    const plan = planCapacity(machine(12, 32), noEnv);
    expect(plan.byCpu).toBe(8);
    expect(plan.byMemory).toBe(11);
    expect(plan.maxConcurrentPipelines).toBe(MAX_CONCURRENT_PIPELINES_CEILING);
    // The binding constraint is a decision about county servers, not about this machine — and it
    // says so, because "why only six" is the first question anyone asks.
    expect(plan.limitedBy).toBe('ceiling');
  });

  it('is memory-bound on a small box, and says so', () => {
    // 8 GB: 4 GB reserved leaves 4 GB → one run. A box this size should not be accepting two.
    const plan = planCapacity(machine(8, 8), noEnv);
    expect(plan.limitedBy).toBe('memory');
    expect(plan.maxConcurrentPipelines).toBe(1);
  });

  it('is cpu-bound on a memory-heavy, core-poor box', () => {
    const plan = planCapacity(machine(2, 64), noEnv);
    expect(plan.limitedBy).toBe('cpu');
    expect(plan.maxConcurrentPipelines).toBe(1);
  });

  it('never returns zero, however small the machine', () => {
    // A worker that admits nothing is indistinguishable from a broken one. One run, slowly, beats
    // an empty queue and a confusing 503.
    const plan = planCapacity(machine(1, 1), noEnv);
    expect(plan.maxConcurrentPipelines).toBeGreaterThanOrEqual(1);
  });
});

describe('an operator who pins it', () => {
  it('is obeyed, and the number is labelled as an override', () => {
    const plan = planCapacity(machine(12, 32), { WORKER_MAX_CONCURRENT_PIPELINES: '2' } as NodeJS.ProcessEnv);
    expect(plan.maxConcurrentPipelines).toBe(2);
    expect(plan.limitedBy).toBe('override');
    expect(plan.overridden).toBe(true);
    // The computed values survive alongside it, so "why did we pin this" stays answerable.
    expect(plan.byCpu).toBe(8);
  });

  it('ignores nonsense rather than trusting it', () => {
    for (const bad of ['0', '-3', 'lots', '']) {
      const plan = planCapacity(machine(12, 32), { WORKER_MAX_CONCURRENT_PIPELINES: bad } as NodeJS.ProcessEnv);
      expect(plan.overridden, `"${bad}" should not pin capacity`).toBe(false);
    }
  });
});

describe('the boot line', () => {
  it('states the machine, the answer, and the reason', () => {
    const line = describeCapacity(planCapacity(machine(12, 32), noEnv));
    expect(line).toContain('12 cores');
    expect(line).toContain('32 GB');
    expect(line).toContain('cpu→8');
    expect(line).toContain('memory→11');
  });

  it('names the override so a pinned value is never read as a computed one', () => {
    const line = describeCapacity(planCapacity(machine(12, 32), { WORKER_MAX_CONCURRENT_PIPELINES: '3' } as NodeJS.ProcessEnv));
    expect(line).toContain('pinned by WORKER_MAX_CONCURRENT_PIPELINES');
  });
});

describe('the budget constants stay honest', () => {
  it('reserves enough for the OS, Redis and the worker baseline', () => {
    expect(RESERVED_RAM_BYTES).toBeGreaterThanOrEqual(2 * GB);
  });

  it('budgets a real Chromium, not a hopeful one', () => {
    // Chromium with several tabs on a county portal is 0.5–1.0 GB RSS before the worker's own
    // page-image and PDF buffers. Anything under 1.5 GB per run is wishful.
    expect(RAM_PER_PIPELINE_BYTES).toBeGreaterThanOrEqual(1.5 * GB);
    expect(CORES_PER_PIPELINE).toBeGreaterThanOrEqual(1);
  });
});

describe('the worker actually enforces it', () => {
  const index = fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8');

  it('refuses a run it cannot hold instead of accepting and OOMing', () => {
    expect(index).toContain('activePipelines.size >= CAPACITY.maxConcurrentPipelines');
    // 503 + retryable, so the caller can queue rather than treating it as a failed run.
    expect(index).toContain('retryable: true');
  });

  it('reports capacity on /healthz, so a wrong-sized box is visible from the app', () => {
    expect(index).toContain('capacity: CAPACITY');
  });
});
