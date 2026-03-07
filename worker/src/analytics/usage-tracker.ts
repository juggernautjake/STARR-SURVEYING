// worker/src/analytics/usage-tracker.ts — Phase 11 Module L
// Usage analytics tracking for research runs, AI calls, and costs.
//
// Spec §11.13.1 — Usage Analytics

import * as fs from 'fs';
import * as path from 'path';
import type { ResearchEvent } from '../types/expansion.js';

// ── Usage Tracker ───────────────────────────────────────────────────────────

export class UsageTracker {
  private logDir: string;
  private events: ResearchEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private bufferSize = 50;

  constructor(logDir: string = '/tmp/analytics') {
    this.logDir = logDir;
    fs.mkdirSync(logDir, { recursive: true });

    // Auto-flush every 30 seconds
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  /**
   * Track a research event.
   */
  track(event: Omit<ResearchEvent, 'timestamp'>): void {
    this.events.push({
      ...event,
      timestamp: new Date().toISOString(),
    });

    if (this.events.length >= this.bufferSize) {
      this.flush();
    }
  }

  /**
   * Track pipeline start.
   */
  pipelineStarted(
    userId: string,
    projectId: string,
    county: string,
  ): void {
    this.track({
      eventType: 'pipeline_started',
      userId,
      projectId,
      county,
    });
  }

  /**
   * Track pipeline completion.
   */
  pipelineCompleted(
    userId: string,
    projectId: string,
    county: string,
    durationSeconds: number,
    overallConfidence: number,
  ): void {
    this.track({
      eventType: 'pipeline_completed',
      userId,
      projectId,
      county,
      durationSeconds,
      overallConfidence,
    });
  }

  /**
   * Track phase completion.
   */
  phaseCompleted(
    userId: string,
    projectId: string,
    county: string,
    phase: number,
    phaseName: string,
    durationSeconds: number,
  ): void {
    this.track({
      eventType: 'phase_completed',
      userId,
      projectId,
      county,
      phase,
      phaseName,
      durationSeconds,
    });
  }

  /**
   * Track AI extraction call.
   */
  aiExtraction(
    userId: string,
    projectId: string,
    county: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    costEstimate: number,
  ): void {
    this.track({
      eventType: 'ai_extraction',
      userId,
      projectId,
      county,
      aiModel: model,
      aiInputTokens: inputTokens,
      aiOutputTokens: outputTokens,
      aiCostEstimate: costEstimate,
    });
  }

  /**
   * Track document purchase.
   */
  documentPurchased(
    userId: string,
    projectId: string,
    county: string,
    documentCost: number,
    serviceFee: number,
  ): void {
    this.track({
      eventType: 'document_purchased',
      userId,
      projectId,
      county,
      documentCost,
      serviceFee,
    });
  }

  /**
   * Get usage summary for a user.
   */
  getUserSummary(
    userId: string,
    startDate?: string,
    endDate?: string,
  ): {
    totalPipelines: number;
    completedPipelines: number;
    failedPipelines: number;
    totalAICost: number;
    totalDocumentCost: number;
    avgConfidence: number;
    countyBreakdown: Record<string, number>;
  } {
    const allEvents = this.loadEvents(startDate, endDate);
    const userEvents = allEvents.filter((e) => e.userId === userId);

    const pipelines = userEvents.filter(
      (e) => e.eventType === 'pipeline_completed',
    );
    const failed = userEvents.filter(
      (e) => e.eventType === 'pipeline_failed',
    );
    const aiCalls = userEvents.filter(
      (e) => e.eventType === 'ai_extraction',
    );
    const purchases = userEvents.filter(
      (e) => e.eventType === 'document_purchased',
    );

    const countyBreakdown: Record<string, number> = {};
    for (const e of pipelines) {
      countyBreakdown[e.county] = (countyBreakdown[e.county] || 0) + 1;
    }

    return {
      totalPipelines: pipelines.length + failed.length,
      completedPipelines: pipelines.length,
      failedPipelines: failed.length,
      totalAICost: aiCalls.reduce(
        (sum, e) => sum + (e.aiCostEstimate || 0),
        0,
      ),
      totalDocumentCost: purchases.reduce(
        (sum, e) => sum + (e.documentCost || 0),
        0,
      ),
      avgConfidence:
        pipelines.length > 0
          ? pipelines.reduce(
              (sum, e) => sum + (e.overallConfidence || 0),
              0,
            ) / pipelines.length
          : 0,
      countyBreakdown,
    };
  }

  /**
   * Flush buffered events to disk.
   */
  flush(): void {
    if (this.events.length === 0) return;

    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(this.logDir, `events_${date}.jsonl`);

    const lines = this.events
      .map((e) => JSON.stringify(e))
      .join('\n');

    fs.appendFileSync(filePath, lines + '\n');
    this.events = [];
  }

  /**
   * Load events from disk for a date range.
   */
  private loadEvents(
    startDate?: string,
    endDate?: string,
  ): ResearchEvent[] {
    const events: ResearchEvent[] = [];

    if (!fs.existsSync(this.logDir)) return events;

    const files = fs
      .readdirSync(this.logDir)
      .filter((f) => f.startsWith('events_') && f.endsWith('.jsonl'))
      .sort();

    for (const file of files) {
      const fileDate = file.replace('events_', '').replace('.jsonl', '');
      if (startDate && fileDate < startDate) continue;
      if (endDate && fileDate > endDate) continue;

      const filePath = path.join(this.logDir, file);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        // Skip unreadable file
        continue;
      }
      for (const line of content.trim().split('\n')) {
        if (line) {
          try {
            events.push(JSON.parse(line));
          } catch {
            // Skip malformed lines
          }
        }
      }
    }

    return events;
  }

  /**
   * Cleanup — stop flush interval.
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
  }
}
