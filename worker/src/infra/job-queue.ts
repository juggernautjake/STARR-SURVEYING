// worker/src/infra/job-queue.ts — Phase 11 Module K
// BullMQ job queue for concurrent pipeline execution.
// Max 3 simultaneous pipeline runs with rate limiting per county site.
//
// Spec §11.12.3 — Job Queue for Concurrent Users

import { Queue, Worker, QueueEvents, type Job } from 'bullmq';
import type { ReportFormat } from '../types/reports.js';

// ── Redis Connection ────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function getRedisConnection() {
  // Parse Redis URL into ioredis-compatible options
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

// ── Job Types ───────────────────────────────────────────────────────────────

export interface ResearchJobData {
  projectId: string;
  userId: string;
  address: string;
  county?: string;
  budget?: number;
  autoPurchase?: boolean;
  formats?: ReportFormat[];
  outputDir?: string;
  dataSources?: string[];
  priority?: 'normal' | 'rush';
  batchId?: string;
}

export interface ResearchJobResult {
  projectId: string;
  status: 'completed' | 'failed';
  manifestPath?: string;
  overallConfidence?: number;
  overallGrade?: string;
  durationSeconds: number;
  error?: string;
}

// ── Research Queue ──────────────────────────────────────────────────────────

export const researchQueue = new Queue<ResearchJobData, ResearchJobResult>(
  'property-research',
  {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  },
);

// ── Queue Events ────────────────────────────────────────────────────────────

export const researchQueueEvents = new QueueEvents('property-research', {
  connection: getRedisConnection(),
});

// ── Add Job to Queue ────────────────────────────────────────────────────────

export async function enqueueResearch(
  data: ResearchJobData,
): Promise<string> {
  const priority = data.priority === 'rush' ? 1 : 5;

  const job = await researchQueue.add('research', data, {
    priority,
    jobId: data.projectId,
  });

  console.log(
    `[Queue] Enqueued: ${data.projectId} (priority: ${priority}, address: ${data.address})`,
  );

  return job.id || data.projectId;
}

// ── Create Worker ───────────────────────────────────────────────────────────

export function createResearchWorker(
  processJob: (job: Job<ResearchJobData>) => Promise<ResearchJobResult>,
): Worker<ResearchJobData, ResearchJobResult> {
  const worker = new Worker<ResearchJobData, ResearchJobResult>(
    'property-research',
    async (job) => {
      console.log(
        `[Worker] Processing: ${job.data.projectId} (${job.data.address})`,
      );

      const startTime = Date.now();
      try {
        const result = await processJob(job);
        console.log(
          `[Worker] Complete: ${job.data.projectId} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`,
        );
        return result;
      } catch (err: any) {
        console.error(
          `[Worker] Failed: ${job.data.projectId} — ${err.message}`,
        );
        return {
          projectId: job.data.projectId,
          status: 'failed',
          durationSeconds: (Date.now() - startTime) / 1000,
          error: err.message,
        };
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
      limiter: {
        max: 5,
        duration: 60000, // max 5 jobs started per minute
      },
    },
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[Worker] Job completed: ${job.id} — ${result.status}`,
    );
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[Worker] Job failed: ${job?.id} — ${err.message}`,
    );
  });

  return worker;
}

// ── Queue Status ────────────────────────────────────────────────────────────

export async function getQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    researchQueue.getWaitingCount(),
    researchQueue.getActiveCount(),
    researchQueue.getCompletedCount(),
    researchQueue.getFailedCount(),
    researchQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

// ── Get Job Status ──────────────────────────────────────────────────────────

export async function getJobStatus(
  projectId: string,
): Promise<{
  found: boolean;
  state?: string;
  progress?: number;
  result?: ResearchJobResult;
}> {
  const job = await researchQueue.getJob(projectId);
  if (!job) return { found: false };

  const state = await job.getState();
  const progress =
    typeof job.progress === 'number' ? job.progress : 0;

  return {
    found: true,
    state,
    progress,
    result: job.returnvalue || undefined,
  };
}
