// worker/src/batch/batch-processor.ts — Phase 11 Module I
// Batch processing for multiple properties.
// Processes properties sequentially or parallel (up to concurrency limit).
//
// Spec §11.10 — Batch Processing & Automation

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { BatchJob } from '../types/expansion.js';
import { enqueueResearch, getJobStatus } from '../infra/job-queue.js';
import type { ReportFormat } from '../types/reports.js';

// ── Batch Processor ─────────────────────────────────────────────────────────

export class BatchProcessor {
  private outputDir: string;

  constructor(outputDir: string = '/tmp/batch') {
    this.outputDir = outputDir;
    fs.mkdirSync(outputDir, { recursive: true });
  }

  /**
   * Create and start a batch job from a list of properties.
   */
  async createBatch(
    userId: string,
    properties: { address: string; county?: string; label?: string }[],
    options: {
      budget?: number;
      autoPurchase?: boolean;
      formats?: string[];
      dataSources?: string[];
      priority?: 'normal' | 'rush';
    } = {},
  ): Promise<BatchJob> {
    const batchId = `BATCH-${randomUUID().slice(0, 8).toUpperCase()}`;

    const batch: BatchJob = {
      batchId,
      userId,
      properties,
      options: {
        budget: options.budget || 50,
        autoPurchase: options.autoPurchase || false,
        formats: options.formats || ['pdf', 'dxf', 'svg'],
        dataSources: options.dataSources || ['cad', 'clerk_free', 'fema'],
        priority: options.priority || 'normal',
      },
      status: 'queued',
      results: properties.map((p) => ({
        address: p.address,
        projectId: '',
        status: 'pending' as const,
      })),
      createdAt: new Date().toISOString(),
      completedAt: null,
      totalCost: 0,
    };

    this.saveBatch(batch);

    console.log(
      `[Batch] Created: ${batchId} — ${properties.length} properties`,
    );

    return batch;
  }

  /**
   * Start processing a batch by enqueueing all properties.
   */
  async startBatch(batchId: string): Promise<BatchJob> {
    const batch = this.loadBatch(batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    batch.status = 'processing';

    for (let i = 0; i < batch.properties.length; i++) {
      const prop = batch.properties[i];
      const projectId = `${batchId}-${String(i + 1).padStart(3, '0')}`;

      batch.results[i].projectId = projectId;

      try {
        await enqueueResearch({
          projectId,
          userId: batch.userId,
          address: prop.address,
          county: prop.county,
          budget: batch.options.budget,
          autoPurchase: batch.options.autoPurchase,
          formats: batch.options.formats as ReportFormat[],
          dataSources: batch.options.dataSources,
          priority: batch.options.priority,
          batchId,
        });

        console.log(
          `[Batch] Enqueued: ${projectId} — ${prop.address}`,
        );
      } catch (err: any) {
        batch.results[i].status = 'failed';
        batch.results[i].error = err.message;
        console.error(
          `[Batch] Failed to enqueue ${projectId}: ${err.message}`,
        );
      }
    }

    this.saveBatch(batch);
    return batch;
  }

  /**
   * Check the status of a batch job.
   */
  async checkBatchStatus(batchId: string): Promise<BatchJob> {
    const batch = this.loadBatch(batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);

    let allDone = true;
    let anyFailed = false;

    for (const result of batch.results) {
      if (!result.projectId || result.status === 'failed') continue;

      if (result.status === 'pending') {
        const jobStatus = await getJobStatus(result.projectId);

        if (jobStatus.found) {
          if (jobStatus.state === 'completed' && jobStatus.result) {
            result.status = 'complete';
            result.overallConfidence =
              jobStatus.result.overallConfidence;
          } else if (jobStatus.state === 'failed') {
            result.status = 'failed';
            result.error = jobStatus.result?.error;
            anyFailed = true;
          } else {
            allDone = false;
          }
        } else {
          allDone = false;
        }
      }

      if (result.status === 'failed') anyFailed = true;
    }

    if (allDone) {
      batch.status = anyFailed ? 'partial' : 'complete';
      batch.completedAt = new Date().toISOString();
    }

    this.saveBatch(batch);
    return batch;
  }

  /**
   * Parse a CSV file into property list for batch processing.
   */
  parseCSV(csvContent: string): { address: string; county?: string; label?: string }[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return []; // Need at least header + 1 row

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());

    const addressIdx = header.findIndex((h) =>
      ['address', 'property_address', 'street_address'].includes(h),
    );
    const cityIdx = header.findIndex((h) => ['city'].includes(h));
    const stateIdx = header.findIndex((h) => ['state'].includes(h));
    const zipIdx = header.findIndex((h) =>
      ['zip', 'zipcode', 'zip_code'].includes(h),
    );
    const countyIdx = header.findIndex((h) => ['county'].includes(h));
    const labelIdx = header.findIndex((h) =>
      ['label', 'name', 'description', 'lot'].includes(h),
    );

    if (addressIdx === -1) {
      throw new Error(
        'CSV must have an "address" column. ' +
        'Expected columns: address, city, state, zip, county, label',
      );
    }

    const properties: { address: string; county?: string; label?: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0) continue;

      let address = values[addressIdx]?.trim();
      if (!address) continue;

      // Build full address if components are separate
      if (cityIdx >= 0 && values[cityIdx]) {
        address += `, ${values[cityIdx].trim()}`;
      }
      if (stateIdx >= 0 && values[stateIdx]) {
        address += `, ${values[stateIdx].trim()}`;
      }
      if (zipIdx >= 0 && values[zipIdx]) {
        address += ` ${values[zipIdx].trim()}`;
      }

      properties.push({
        address,
        county: countyIdx >= 0 ? values[countyIdx]?.trim() : undefined,
        label: labelIdx >= 0 ? values[labelIdx]?.trim() : undefined,
      });
    }

    return properties;
  }

  // ── CSV Line Parser (handles quoted fields) ─────────────────────────────

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  // ── Batch Summary ───────────────────────────────────────────────────────

  generateSummary(batch: BatchJob): string {
    const completed = batch.results.filter(
      (r) => r.status === 'complete',
    ).length;
    const failed = batch.results.filter(
      (r) => r.status === 'failed',
    ).length;
    const pending = batch.results.filter(
      (r) => r.status === 'pending',
    ).length;

    const avgConfidence =
      batch.results
        .filter((r) => r.overallConfidence !== undefined)
        .reduce((sum, r) => sum + (r.overallConfidence || 0), 0) /
      Math.max(completed, 1);

    return [
      `Batch: ${batch.batchId}`,
      `Status: ${batch.status}`,
      `Properties: ${batch.properties.length}`,
      `  Completed: ${completed}`,
      `  Failed: ${failed}`,
      `  Pending: ${pending}`,
      `Average Confidence: ${avgConfidence.toFixed(0)}%`,
      `Total Cost: $${batch.totalCost.toFixed(2)}`,
      `Created: ${batch.createdAt}`,
      batch.completedAt ? `Completed: ${batch.completedAt}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private saveBatch(batch: BatchJob): void {
    const filePath = path.join(this.outputDir, `${batch.batchId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(batch, null, 2));
  }

  private loadBatch(batchId: string): BatchJob | null {
    const filePath = path.join(this.outputDir, `${batchId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }

  listBatches(): BatchJob[] {
    if (!fs.existsSync(this.outputDir)) return [];
    return fs
      .readdirSync(this.outputDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(this.outputDir, f), 'utf-8'),
          );
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}
