// worker/src/infra/capacity.ts — how many research runs this machine can actually hold (plan R7).
//
// A research run is not a request. It is 20–30 minutes of one Chromium instance, several tabs, PDF
// and image decoding, and a stream of vision calls. Concurrency is therefore bounded by the box, and
// getting it wrong fails in two directions that look nothing alike:
//
//   too low   the machine idles while jobs queue, and the owner pays for cores nothing uses.
//   too high  Chromium instances contend for RAM, the kernel starts swapping or OOM-killing, and a
//             25-minute run dies at minute 22 — after the paid documents have been bought.
//
// The second is much worse and much harder to diagnose, so the defaults lean low and every input is
// visible in the numbers this module returns.
//
// ── THE MEASURED SHAPE OF ONE RUN ───────────────────────────────────────────────────────────────
//
// Chromium with a handful of open tabs on a county portal sits around 0.5–1.0 GB RSS, and the
// worker's own heap (page images, PDF buffers, extraction payloads) adds a few hundred MB while a
// document is in flight. 2.5 GB per concurrent run is the working budget — generous enough that a
// plat with thirty page images does not push the host into swap.
//
// CPU is bursty rather than steady: rendering and decoding spike, waiting on a county's server does
// not. ~1.5 cores per run keeps a spike from starving its neighbours.
//
// ── AND A CEILING THAT HAS NOTHING TO DO WITH THE HARDWARE ──────────────────────────────────────
//
// Even on a machine that could hold twelve, we do not run twelve at once against county portals.
// These are small government servers, and the fastest way to lose access to one is to look like a
// load test. The hard ceiling stays low deliberately; per-host politeness is enforced separately
// (plan R12), and this is the second wall behind it.

import os from 'node:os';

/** RAM budget per concurrent pipeline, in bytes. See the header for where 2.5 GB comes from. */
export const RAM_PER_PIPELINE_BYTES = 2.5 * 1024 ** 3;
/** Cores budgeted per concurrent pipeline. */
export const CORES_PER_PIPELINE = 1.5;
/** Held back for the OS, Redis, and the worker's own baseline before any run starts. */
export const RESERVED_RAM_BYTES = 4 * 1024 ** 3;
/** Politeness ceiling — see the header. Not a hardware number. */
export const MAX_CONCURRENT_PIPELINES_CEILING = 6;

export interface MachineFacts {
  cores: number;
  totalMemoryBytes: number;
}

export interface CapacityPlan {
  /** What the worker will actually allow. */
  maxConcurrentPipelines: number;
  /** Where that number came from — reported by /healthz so a box can be sized from evidence. */
  limitedBy: 'cpu' | 'memory' | 'ceiling' | 'override';
  byCpu: number;
  byMemory: number;
  ceiling: number;
  cores: number;
  totalMemoryGb: number;
  /** True when an operator pinned the value with WORKER_MAX_CONCURRENT_PIPELINES. */
  overridden: boolean;
}

export function readMachine(): MachineFacts {
  return { cores: os.cpus().length || 1, totalMemoryBytes: os.totalmem() };
}

/** Pure. Given the machine and the environment, decide the concurrency. */
export function planCapacity(machine: MachineFacts, env: NodeJS.ProcessEnv = process.env): CapacityPlan {
  const byCpu = Math.max(1, Math.floor(machine.cores / CORES_PER_PIPELINE));
  const usableRam = Math.max(0, machine.totalMemoryBytes - RESERVED_RAM_BYTES);
  const byMemory = Math.max(1, Math.floor(usableRam / RAM_PER_PIPELINE_BYTES));
  const ceiling = MAX_CONCURRENT_PIPELINES_CEILING;

  const raw = env.WORKER_MAX_CONCURRENT_PIPELINES;
  const override = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(override) && override > 0) {
    // An operator who pins this has a reason — a smaller box, a county that must be handled one job
    // at a time. Honoured, and reported as an override so it is never mistaken for a computed value.
    return {
      maxConcurrentPipelines: override,
      limitedBy: 'override',
      byCpu, byMemory, ceiling,
      cores: machine.cores,
      totalMemoryGb: round1(machine.totalMemoryBytes / 1024 ** 3),
      overridden: true,
    };
  }

  const limit = Math.min(byCpu, byMemory, ceiling);
  const limitedBy: CapacityPlan['limitedBy'] =
    limit === byMemory && byMemory <= byCpu && byMemory <= ceiling ? 'memory'
    : limit === byCpu && byCpu <= ceiling ? 'cpu'
    : 'ceiling';

  return {
    maxConcurrentPipelines: limit,
    limitedBy,
    byCpu, byMemory, ceiling,
    cores: machine.cores,
    totalMemoryGb: round1(machine.totalMemoryBytes / 1024 ** 3),
    overridden: false,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** One line for the boot log. The point is that a wrong-sized box is visible on day one rather than
 *  at minute 22 of a run three weeks later. */
export function describeCapacity(plan: CapacityPlan): string {
  const basis = plan.overridden
    ? 'pinned by WORKER_MAX_CONCURRENT_PIPELINES'
    : `limited by ${plan.limitedBy} (cpu→${plan.byCpu}, memory→${plan.byMemory}, ceiling→${plan.ceiling})`;
  return `${plan.cores} cores, ${plan.totalMemoryGb} GB → max ${plan.maxConcurrentPipelines} concurrent research run(s); ${basis}`;
}
