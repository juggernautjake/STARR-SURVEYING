// worker/src/routes/report-routes.ts — Phase 10 Express Routes
// Endpoints for pipeline execution, report generation, and deliverable access.
//
// Spec §10.11 — Express API Routes

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { MasterOrchestrator } from '../orchestrator/master-orchestrator.js';
import { defaultReportConfig } from '../types/reports.js';
import type { ReportFormat } from '../types/reports.js';

export function createReportRoutes(requireAuth: any): Router {
  const router = Router();
  const orchestrator = new MasterOrchestrator();

  // ── POST /research/run — Full pipeline execution ──────────────────────

  router.post('/research/run', requireAuth, async (req: Request, res: Response) => {
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
    const runProjectId = projectId || `STARR-${Date.now().toString(36).toUpperCase()}`;
    res.status(202).json({
      status: 'accepted',
      projectId: runProjectId,
      statusUrl: `/research/run/${runProjectId}`,
    });

    // Execute pipeline asynchronously
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

      console.log(
        `[Pipeline] Complete: ${runProjectId} — ${manifest.metadata.pipelineDuration.toFixed(1)}s`,
      );
    } catch (err: any) {
      console.error(`[Pipeline] Failed: ${runProjectId} — ${err.message}`);
    }
  });

  // ── GET /research/run/:projectId — Pipeline status ────────────────────

  router.get('/research/run/:projectId', requireAuth, (req: Request, res: Response) => {
    const { projectId } = req.params;
    const status = orchestrator.getStatus(projectId);

    if (!status.exists) {
      res.status(404).json({ error: `Project ${projectId} not found` });
      return;
    }

    if (status.hasDeliverables) {
      // Load manifest
      const manifestPath = findManifest(projectId);
      if (manifestPath) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        res.json({ status: 'completed', manifest });
        return;
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
  });

  // ── POST /research/report — Generate reports from existing data ───────

  router.post('/research/report', requireAuth, async (req: Request, res: Response) => {
    const { projectId, formats, outputDir, pageSize, dpi } = req.body as {
      projectId?: string;
      formats?: string[];
      outputDir?: string;
      pageSize?: 'letter' | 'tabloid';
      dpi?: number;
    };

    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }

    const validFormats: ReportFormat[] = ['pdf', 'dxf', 'svg', 'png', 'json', 'txt'];
    const requestedFormats = (formats || ['pdf', 'dxf', 'svg']).filter(
      (f) => validFormats.includes(f as ReportFormat),
    ) as ReportFormat[];

    try {
      const config = defaultReportConfig({
        formats: requestedFormats,
        outputDir: outputDir || `/tmp/deliverables/${projectId}`,
        pdf: pageSize ? { pageSize } as any : undefined,
        drawing: dpi ? { dpi } as any : undefined,
      });

      const manifest = await orchestrator.generateReport(projectId, config);
      res.json({ status: 'completed', manifest });
    } catch (err: any) {
      res.status(500).json({ error: `Report generation failed: ${err.message}` });
    }
  });

  // ── GET /research/deliverables/:projectId — List deliverables ─────────

  router.get('/research/deliverables/:projectId', requireAuth, (req: Request, res: Response) => {
    const { projectId } = req.params;
    const manifestPath = findManifest(projectId);

    if (!manifestPath) {
      res.status(404).json({ error: `No deliverables found for ${projectId}` });
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    res.json(manifest);
  });

  // ── GET /research/download/:projectId/:format — Download deliverable ──

  router.get('/research/download/:projectId/:format', requireAuth, (req: Request, res: Response) => {
    const { projectId, format } = req.params;
    const manifestPath = findManifest(projectId);

    if (!manifestPath) {
      res.status(404).json({ error: `No deliverables found for ${projectId}` });
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
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
  });

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
