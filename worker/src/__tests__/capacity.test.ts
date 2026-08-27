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
  readMachine,
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

describe('readMachine reads the container, not the host', () => {
  // These cover the one branch that only runs somewhere the suite never does: inside a container
  // with a cgroup memory cap. The bug being pinned is quiet — the worker reads 32 GB on a box that
  // will only give the container 26 GB, admits runs against memory it cannot have, and the failure
  // surfaces as an OOM kill at minute 22 of a 25-minute run.

  const HOST = 32 * GB;
  const CONTAINER = 26 * GB;
  const missing = (): never => { throw new Error('ENOENT'); };

  it('prefers the cgroup v2 limit over the host', () => {
    const read = (p: string) => {
      if (p === '/sys/fs/cgroup/memory.max') return String(CONTAINER);
      return missing();
    };
    expect(readMachine(read, HOST, 12).totalMemoryBytes).toBe(CONTAINER);
  });

  it('falls back to cgroup v1 when v2 is absent', () => {
    const read = (p: string) => {
      if (p === '/sys/fs/cgroup/memory/memory.limit_in_bytes') return String(CONTAINER);
      return missing();
    };
    expect(readMachine(read, HOST, 12).totalMemoryBytes).toBe(CONTAINER);
  });

  it('treats cgroup v2 "max" as uncapped and uses the host', () => {
    const read = (p: string) => (p === '/sys/fs/cgroup/memory.max' ? 'max' : missing());
    expect(readMachine(read, HOST, 12).totalMemoryBytes).toBe(HOST);
  });

  it('treats the cgroup v1 sentinel as uncapped', () => {
    // v1 signals "no limit" with a huge number rather than a word. Believing it would compute a
    // concurrency in the thousands.
    const read = (p: string) =>
      p === '/sys/fs/cgroup/memory/memory.limit_in_bytes' ? '9223372036854771712' : missing();
    expect(readMachine(read, HOST, 12).totalMemoryBytes).toBe(HOST);
  });

  it('ignores a cgroup value larger than the host', () => {
    // A container is never given more than the machine has, so a bigger number means we misread the
    // file. Trusting it would be strictly worse than not reading it at all.
    const read = (p: string) => (p === '/sys/fs/cgroup/memory.max' ? String(64 * GB) : missing());
    expect(readMachine(read, HOST, 12).totalMemoryBytes).toBe(HOST);
  });

  it('ignores unparseable content', () => {
    const read = (p: string) => (p === '/sys/fs/cgroup/memory.max' ? 'not-a-number' : missing());
    expect(readMachine(read, HOST, 12).totalMemoryBytes).toBe(HOST);
  });

  it('uses the host when there is no cgroup at all — the dev-machine case', () => {
    expect(readMachine(missing, HOST, 12).totalMemoryBytes).toBe(HOST);
  });

  it('changes nothing about today’s netcup answer, and that is the point', () => {
    // 26 GB container: byMemory = (26-4)/2.5 = 8; byCpu = 12/1.5 = 8; ceiling 6 → still 6.
    // The fix is latent by design: correct now, and still correct when the ceiling moves.
    const read = (p: string) => (p === '/sys/fs/cgroup/memory.max' ? String(CONTAINER) : missing());
    const plan = planCapacity(readMachine(read, HOST, 12), {} as NodeJS.ProcessEnv);
    expect(plan.maxConcurrentPipelines).toBe(6);
    expect(plan.limitedBy).toBe('ceiling');
    // Pinned so the difference is visible: the host reading would have said 11 here.
    expect(plan.byMemory).toBe(8);
  });
});
