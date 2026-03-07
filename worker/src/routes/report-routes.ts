// worker/src/routes/report-routes.ts — Phase 10 Express Routes
// Endpoints for pipeline execution, report generation, and deliverable access.
//
// Spec §10.11 — Express API Routes
//
// v1.1 fixes:
//   - PipelineLogger replaces bare console.log/console.error (consistent with Phases 6-9)
//   - Rate limiting added: POST routes 5/min, GET routes 60/min
//   - JSON.parse wrapped in try/catch in GET routes (corrupt manifest recovery)
//   - Empty projectId guard with 400 response
//   - MasterOrchestrator instantiated per-factory-call (not shared across routes)

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { MasterOrchestrator } from '../orchestrator/master-orchestrator.js';
import { defaultReportConfig } from '../types/reports.js';
import type { ReportFormat } from '../types/reports.js';
import { PipelineLogger } from '../lib/logger.js';

// ── Local rate limiter (mirrors the pattern in index.ts) ─────────────────────
// Keeps report-routes.ts self-contained without circular imports.

const _routeRateWindows = new Map<string, number[]>();

function routeRateLimit(maxReq: number, windowMs: number) {
  return (req: Request, res: Response, next: () => void) => {
    const key = `${req.path}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const hits = (_routeRateWindows.get(key) ?? []).filter(
      (ts) => now - ts < windowMs,
    );
    if (hits.length >= maxReq) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    hits.push(now);
    _routeRateWindows.set(key, hits);
    next();
  };
}

// ── Safe JSON parse helper ────────────────────────────────────────────────────

function safeReadJson(filePath: string, projectId: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    const logger = new PipelineLogger(projectId || 'unknown');
    logger.warn('report-routes', `Failed to parse ${filePath}: ${String(e)}`);
    return null;
  }
}

export function createReportRoutes(requireAuth: any): Router {
  const router = Router();
  const orchestrator = new MasterOrchestrator();

  // ── POST /research/run — Full pipeline execution ──────────────────────

  router.post(
    '/research/run',
    requireAuth,
    routeRateLimit(5, 60_000),
    async (req: Request, res: Response) => {
      const {
        address,
        county,
        projectId,
        budget,
        autoPurchase,
        formats,
        outputDir,
        resumeFromPhase,
        skipPhases,
      } = req.body as {
        address?: string;
        county?: string;
        projectId?: string;
        budget?: number;
        autoPurchase?: boolean;
        formats?: string[];
        outputDir?: string;
        resumeFromPhase?: number;
        skipPhases?: number[];
      };

      if (!address) {
        res.status(400).json({ error: 'address is required' });
        return;
      }

      const validFormats: ReportFormat[] = ['pdf', 'dxf', 'svg', 'png', 'json', 'txt'];
      const requestedFormats = (formats || ['pdf', 'dxf', 'svg']).filter(
        (f) => validFormats.includes(f as ReportFormat),
      ) as ReportFormat[];

      // Return 202 immediately — pipeline runs in background
      const runProjectId = (projectId || '').trim() ||
        `STARR-${Date.now().toString(36).toUpperCase()}`;

      res.status(202).json({
        status: 'accepted',
        projectId: runProjectId,
        statusUrl: `/research/run/${runProjectId}`,
      });

      // Execute pipeline asynchronously (detached from HTTP response)
      const pipelineLogger = new PipelineLogger(runProjectId);
      try {
        const manifest = await orchestrator.runPipeline({
          address,
          county,
          projectId: runProjectId,
          budget: budget || 50,
          autoPurchase: autoPurchase || false,
          outputDir: outputDir || `/tmp/deliverables/${runProjectId}`,
          formats: requestedFormats,
          resumeFromPhase,
          skipPhases,
        });

        pipelineLogger.info(
          'pipeline',
          `Complete: ${runProjectId} — ${manifest.metadata.pipelineDuration.toFixed(1)}s`,
        );
      } catch (err: any) {
        pipelineLogger.error(
          'pipeline',
          `Failed: ${runProjectId} — ${err.message}`,
          err,
        );
      }
    },
  );

  // ── GET /research/run/:projectId — Pipeline status ────────────────────

  router.get(
    '/research/run/:projectId',
    requireAuth,
    routeRateLimit(60, 60_000),
    (req: Request, res: Response) => {
      const { projectId } = req.params;

      if (!projectId?.trim()) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const status = orchestrator.getStatus(projectId);

      if (!status.exists) {
        res.status(404).json({ error: `Project ${projectId} not found` });
        return;
      }

      if (status.hasDeliverables) {
        // Load manifest — use safe parse to handle corrupt files
        const manifestPath = findManifest(projectId);
        if (manifestPath) {
          const manifest = safeReadJson(manifestPath, projectId);
          if (manifest) {
            res.json({ status: 'completed', manifest });
            return;
          }
          // Manifest file is corrupt; fall through to in_progress
        }
      }

      if (status.checkpoint) {
        res.json({
          status: 'in_progress',
          completedPhases: status.checkpoint.completedPhases,
          lastUpdated: status.checkpoint.lastUpdated,
        });
        return;
      }

      res.json({ status: 'unknown' });
    },
  );

  // ── POST /research/report — Generate reports from existing data ───────

  router.post(
    '/research/report',
    requireAuth,
    routeRateLimit(5, 60_000),
    async (req: Request, res: Response) => {
      const { projectId, formats, outputDir, pageSize, dpi } = req.body as {
        projectId?: string;
        formats?: string[];
        outputDir?: string;
        pageSize?: 'letter' | 'tabloid';
        dpi?: number;
      };

      if (!projectId?.trim()) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const validFormats: ReportFormat[] = ['pdf', 'dxf', 'svg', 'png', 'json', 'txt'];
      const requestedFormats = (formats || ['pdf', 'dxf', 'svg']).filter(
        (f) => validFormats.includes(f as ReportFormat),
      ) as ReportFormat[];

      const reportLogger = new PipelineLogger(projectId);

      try {
        const config = defaultReportConfig({
          formats: requestedFormats,
          outputDir: outputDir || `/tmp/deliverables/${projectId}`,
          pdf: pageSize ? ({ pageSize } as any) : undefined,
          drawing: dpi ? ({ dpi } as any) : undefined,
        });

        const manifest = await orchestrator.generateReport(projectId, config);
        reportLogger.info('report-routes', `Reports generated for ${projectId}`);
        res.json({ status: 'completed', manifest });
      } catch (err: any) {
        reportLogger.error(
          'report-routes',
          `Report generation failed for ${projectId}: ${err.message}`,
          err,
        );
        res.status(500).json({ error: `Report generation failed: ${err.message}` });
      }
    },
  );

  // ── GET /research/deliverables/:projectId — List deliverables ─────────

  router.get(
    '/research/deliverables/:projectId',
    requireAuth,
    routeRateLimit(60, 60_000),
    (req: Request, res: Response) => {
      const { projectId } = req.params;

      if (!projectId?.trim()) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const manifestPath = findManifest(projectId);

      if (!manifestPath) {
        res.status(404).json({ error: `No deliverables found for ${projectId}` });
        return;
      }

      const manifest = safeReadJson(manifestPath, projectId);
      if (!manifest) {
        res.status(500).json({ error: `Manifest file is corrupt for ${projectId}` });
        return;
      }

      res.json(manifest);
    },
  );

  // ── GET /research/download/:projectId/:format — Download deliverable ──

  router.get(
    '/research/download/:projectId/:format',
    requireAuth,
    routeRateLimit(60, 60_000),
    (req: Request, res: Response) => {
      const { projectId, format } = req.params;

      if (!projectId?.trim()) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      const manifestPath = findManifest(projectId);

      if (!manifestPath) {
        res.status(404).json({ error: `No deliverables found for ${projectId}` });
        return;
      }

      const manifest = safeReadJson(manifestPath, projectId);
      if (!manifest) {
        res.status(500).json({ error: `Manifest file is corrupt for ${projectId}` });
        return;
      }

      const filePath = manifest.deliverables?.[format];

      if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({
          error: `${format.toUpperCase()} deliverable not found for ${projectId}`,
        });
        return;
      }

      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        dxf: 'application/dxf',
        svg: 'image/svg+xml',
        png: 'image/png',
        json: 'application/json',
        txt: 'text/plain',
      };

      res.setHeader('Content-Type', mimeTypes[format] || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${projectId}_boundary.${format}"`,
      );
      res.sendFile(filePath);
    },
  );

  return router;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findManifest(projectId: string): string | null {
  const searchDirs = [
    `/tmp/deliverables/${projectId}`,
    `/tmp/deliverables`,
    `/tmp/analysis/${projectId}`,
  ];

  for (const dir of searchDirs) {
    const manifestPath = path.join(dir, `${projectId}_manifest.json`);
    if (fs.existsSync(manifestPath)) {
      return manifestPath;
    }
  }

  return null;
}
