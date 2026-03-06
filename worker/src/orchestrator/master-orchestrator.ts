// worker/src/orchestrator/master-orchestrator.ts — Phase 10 Module 6
// Full 9-phase pipeline orchestrator with checkpoint/resume, non-critical
// phase failure tolerance, and deliverable generation.
//
// Spec §10.9 — Master Pipeline Orchestrator

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  ProjectData,
  ReportConfig,
  ReportManifest,
  PipelineOptions,
  CheckpointData,
} from '../types/reports.js';
import { defaultReportConfig } from '../types/reports.js';
import { SVGBoundaryRenderer } from '../reports/svg-renderer.js';
import { PNGRasterizer } from '../reports/png-rasterizer.js';
import { DXFExporter } from '../reports/dxf-exporter.js';
import { PDFReportGenerator } from '../reports/pdf-generator.js';
import { LegalDescriptionGenerator } from '../reports/legal-description-generator.js';

// ── Phase Definitions ───────────────────────────────────────────────────────

interface PhaseDefinition {
  phase: number;
  name: string;
  endpoint: string;
  critical: boolean;
}

const PHASES: PhaseDefinition[] = [
  { phase: 1, name: 'Property Discovery', endpoint: '/research/discover', critical: true },
  { phase: 2, name: 'Document Harvesting', endpoint: '/research/harvest', critical: true },
  { phase: 3, name: 'AI Extraction', endpoint: '/research/analyze', critical: true },
  { phase: 4, name: 'Subdivision Analysis', endpoint: '/research/subdivision', critical: false },
  { phase: 5, name: 'Adjacent Properties', endpoint: '/research/adjacent', critical: false },
  { phase: 6, name: 'TxDOT ROW', endpoint: '/research/row', critical: false },
  { phase: 7, name: 'Boundary Reconciliation', endpoint: '/research/reconcile', critical: true },
  { phase: 8, name: 'Confidence Scoring', endpoint: '/research/confidence', critical: true },
  { phase: 9, name: 'Document Purchase', endpoint: '/research/purchase', critical: false },
];

// ── Master Orchestrator ─────────────────────────────────────────────────────

export class MasterOrchestrator {
  private baseUrl: string;
  private outputDir: string;

  constructor(baseUrl: string = 'http://localhost:3100') {
    this.baseUrl = baseUrl;
    this.outputDir = '/tmp/analysis';
  }

  // ── Run Full Pipeline ───────────────────────────────────────────────────

  async runPipeline(options: PipelineOptions): Promise<ReportManifest> {
    const projectId = options.projectId || `STARR-${randomUUID().slice(0, 8).toUpperCase()}`;
    const startTime = Date.now();

    const reportConfig = defaultReportConfig(options.reportConfig);
    reportConfig.outputDir = options.outputDir;
    reportConfig.formats = options.formats;

    const checkpoint = this.loadCheckpoint(projectId) || {
      projectId,
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  STARR RECON Pipeline — Project ${projectId}`);
    console.log(`  Address: ${options.address}`);
    console.log(`${'═'.repeat(60)}\n`);

    // ── Execute phases ────────────────────────────────────────────────
    const phasesToRun = PHASES.filter((p) => {
      if (options.skipPhases?.includes(p.phase)) return false;
      if (options.resumeFromPhase && p.phase < options.resumeFromPhase) return false;
      if (checkpoint.completedPhases.includes(p.phase)) return false;
      return true;
    });

    for (const phaseDef of phasesToRun) {
      const phaseStart = Date.now();

      options.onProgress?.(phaseDef.phase, phaseDef.name, 'starting');
      console.log(`\n▶ Phase ${phaseDef.phase}: ${phaseDef.name}`);

      try {
        const result = await this.executePhase(
          phaseDef,
          projectId,
          options,
          checkpoint,
        );

        checkpoint.completedPhases.push(phaseDef.phase);
        checkpoint.phaseOutputs[phaseDef.phase] = result;
        checkpoint.phaseDurations[phaseDef.phase] =
          (Date.now() - phaseStart) / 1000;
        checkpoint.lastUpdated = new Date().toISOString();

        this.saveCheckpoint(checkpoint);

        options.onProgress?.(phaseDef.phase, phaseDef.name, 'completed');
        console.log(
          `  ✓ Phase ${phaseDef.phase} completed (${checkpoint.phaseDurations[phaseDef.phase].toFixed(1)}s)`,
        );
      } catch (err: any) {
        checkpoint.phaseDurations[phaseDef.phase] =
          (Date.now() - phaseStart) / 1000;
        checkpoint.lastUpdated = new Date().toISOString();
        this.saveCheckpoint(checkpoint);

        if (phaseDef.critical) {
          options.onProgress?.(phaseDef.phase, phaseDef.name, 'failed');
          console.error(
            `  ✗ Phase ${phaseDef.phase} FAILED (critical): ${err.message}`,
          );
          throw new Error(
            `Pipeline failed at critical Phase ${phaseDef.phase} (${phaseDef.name}): ${err.message}`,
          );
        } else {
          options.onProgress?.(phaseDef.phase, phaseDef.name, 'skipped');
          console.warn(
            `  ⚠ Phase ${phaseDef.phase} failed (non-critical, continuing): ${err.message}`,
          );
        }
      }
    }

    // ── Generate deliverables ─────────────────────────────────────────
    console.log(`\n▶ Generating deliverables...`);
    const projectData = await this.loadProjectData(projectId);
    const manifest = await this.generateDeliverables(
      projectData,
      reportConfig,
      checkpoint,
      startTime,
    );

    // ── Cleanup checkpoint ────────────────────────────────────────────
    this.removeCheckpoint(projectId);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Pipeline Complete — Project ${projectId}`);
    console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`  Output: ${reportConfig.outputDir}`);
    console.log(`${'═'.repeat(60)}\n`);

    return manifest;
  }

  // ── Execute Individual Phase ────────────────────────────────────────────

  private async executePhase(
    phaseDef: PhaseDefinition,
    projectId: string,
    options: PipelineOptions,
    checkpoint: CheckpointData,
  ): Promise<string> {
    const body: Record<string, any> = { projectId };

    // Phase-specific request bodies — field names must match each route's expected shape.
    switch (phaseDef.phase) {
      case 1:
        body.address = options.address;
        if (options.county) body.county = options.county;
        break;
      case 2:
        // POST /research/harvest accepts HarvestInput (owner, county, projectId, deedRefs…)
        // discoveryPath points to Phase 1 discovery.json which the harvest route reads
        body.discoveryPath = checkpoint.phaseOutputs[1];
        break;
      case 3:
        // POST /research/analyze expects { projectId, harvestResultPath }
        body.harvestResultPath = checkpoint.phaseOutputs[2];
        break;
      case 4:
        // POST /research/subdivision expects { projectId, intelligencePath }
        body.intelligencePath = checkpoint.phaseOutputs[3];
        break;
      case 5:
        // POST /research/adjacent expects { projectId, intelligencePath, subdivisionPath? }
        body.intelligencePath = checkpoint.phaseOutputs[3];
        body.subdivisionPath = checkpoint.phaseOutputs[4] || null;
        break;
      case 6:
        // POST /research/row expects { projectId, intelligencePath }
        body.intelligencePath = checkpoint.phaseOutputs[3];
        break;
      case 7:
        // POST /research/reconcile expects { projectId, phasePaths: { intelligence, subdivision?, crossValidation?, rowReport? } }
        body.phasePaths = {
          intelligence: checkpoint.phaseOutputs[3],
          subdivision: checkpoint.phaseOutputs[4] || null,
          crossValidation: checkpoint.phaseOutputs[5] || null,
          rowReport: checkpoint.phaseOutputs[6] || null,
        };
        break;
      case 8:
        body.reconciliationPath = checkpoint.phaseOutputs[7];
        break;
      case 9:
        body.confidenceReportPath = checkpoint.phaseOutputs[8];
        if (options.budget) body.budget = options.budget;
        if (options.autoPurchase !== undefined)
          body.autoPurchase = options.autoPurchase;
        break;
    }

    // POST to phase endpoint
    const response = await fetch(`${this.baseUrl}${phaseDef.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const result = await response.json() as any;

    // Poll for completion if async (202 Accepted)
    if (response.status === 202 && result.statusUrl) {
      return this.pollForCompletion(result.statusUrl, phaseDef);
    }

    return result.outputPath || result.path || '';
  }

  // ── Poll for Async Phase Completion ─────────────────────────────────────

  private async pollForCompletion(
    statusUrl: string,
    phaseDef: PhaseDefinition,
  ): Promise<string> {
    const maxWait = 300_000; // 5 minutes
    const pollInterval = 3_000; // 3 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await this.sleep(pollInterval);

      const response = await fetch(`${this.baseUrl}${statusUrl}`);
      if (!response.ok) continue;

      const status = await response.json() as any;

      if (status.status === 'completed' || status.status === 'complete') {
        return status.outputPath || status.path || '';
      }

      if (status.status === 'failed' || status.status === 'error') {
        throw new Error(
          `Phase ${phaseDef.phase} failed: ${status.error || 'Unknown error'}`,
        );
      }

      // Still processing...
      process.stdout.write('.');
    }

    throw new Error(
      `Phase ${phaseDef.phase} timed out after ${maxWait / 1000}s`,
    );
  }

  // ── Load Project Data ───────────────────────────────────────────────────

  async loadProjectData(projectId: string): Promise<ProjectData> {
    const projectDir = path.join(this.outputDir, projectId);

    const loadJson = (filename: string): any => {
      const filePath = path.join(projectDir, filename);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      return null;
    };

    const discovery = loadJson('discovery.json');
    const harvest = loadJson('harvest_result.json');
    const extraction = loadJson('property_intelligence.json');
    const subdivision = loadJson('subdivision_model.json');
    const adjacent = loadJson('cross_validation_report.json');
    const txdot = loadJson('row_data.json');
    const reconciliation = loadJson('reconciled_boundary.json');
    const confidence = loadJson('confidence_report.json');
    const purchases = loadJson('purchase_report.json');
    const reconciliationV2 = loadJson('reconciled_boundary_v2.json');

    return {
      projectId,
      address: discovery?.address || '',
      county: discovery?.county || '',
      state: 'TX',
      createdAt: discovery?.createdAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      pipelineVersion: process.env.PIPELINE_VERSION || '1.0.0',

      discovery: discovery || {
        propertyId: '',
        ownerName: '',
        legalDescription: '',
        acreage: 0,
        situs: '',
        subdivision: null,
        lot: null,
        block: null,
        cadUrl: '',
        cadSource: '',
      },

      documents: harvest || { target: [], adjacent: [], txdot: [] },
      intelligence: extraction,
      subdivision,
      crossValidation: adjacent,
      rowData: txdot,
      reconciliation: reconciliation || { reconciledCalls: [], corners: [] },
      confidence: confidence || { overallScore: 0, overallGrade: 'N/A' },
      purchases,
      reconciliationV2,
    };
  }

  // ── Generate Deliverables ───────────────────────────────────────────────

  async generateDeliverables(
    data: ProjectData,
    config: ReportConfig,
    checkpoint: CheckpointData,
    startTime: number,
  ): Promise<ReportManifest> {
    fs.mkdirSync(config.outputDir, { recursive: true });

    const deliverables: ReportManifest['deliverables'] = {
      pdf: null,
      dxf: null,
      svg: null,
      png: null,
      json: null,
      txt: null,
    };

    // ── SVG ─────────────────────────────────────────────────────────
    if (config.formats.includes('svg') || config.formats.includes('png') || config.formats.includes('pdf')) {
      try {
        const svgRenderer = new SVGBoundaryRenderer();
        const svgContent = svgRenderer.render(data, config);
        const svgPath = path.join(config.outputDir, `${data.projectId}_boundary.svg`);
        fs.writeFileSync(svgPath, svgContent);
        deliverables.svg = svgPath;
        console.log(`  ✓ SVG: ${svgPath}`);

        // ── PNG ───────────────────────────────────────────────────
        if (config.formats.includes('png') || config.formats.includes('pdf')) {
          try {
            const pngRasterizer = new PNGRasterizer(config.drawing.dpi);
            const pngPath = path.join(
              config.outputDir,
              `${data.projectId}_boundary.png`,
            );
            await pngRasterizer.rasterize(svgContent, pngPath);
            deliverables.png = pngPath;
            console.log(`  ✓ PNG: ${pngPath}`);
          } catch (err: any) {
            console.warn(`  ⚠ PNG generation failed: ${err.message}`);
          }
        }
      } catch (err: any) {
        console.warn(`  ⚠ SVG generation failed: ${err.message}`);
      }
    }

    // ── DXF ─────────────────────────────────────────────────────────
    if (config.formats.includes('dxf')) {
      try {
        const dxfExporter = new DXFExporter();
        const dxfPath = path.join(
          config.outputDir,
          `${data.projectId}_boundary.dxf`,
        );
        dxfExporter.export(data, config, dxfPath);
        deliverables.dxf = dxfPath;
        console.log(`  ✓ DXF: ${dxfPath}`);
      } catch (err: any) {
        console.warn(`  ⚠ DXF generation failed: ${err.message}`);
      }
    }

    // ── Legal Description (TXT) ─────────────────────────────────────
    if (config.formats.includes('txt') || config.formats.includes('pdf')) {
      try {
        const legalGen = new LegalDescriptionGenerator();
        const legalText = legalGen.generate(data);
        const txtPath = path.join(
          config.outputDir,
          `${data.projectId}_legal_description.txt`,
        );
        fs.writeFileSync(txtPath, legalText);
        deliverables.txt = txtPath;
        console.log(`  ✓ TXT: ${txtPath}`);
      } catch (err: any) {
        console.warn(`  ⚠ Legal description generation failed: ${err.message}`);
      }
    }

    // ── JSON ─────────────────────────────────────────────────────────
    if (config.formats.includes('json')) {
      try {
        const jsonPath = path.join(
          config.outputDir,
          `${data.projectId}_data.json`,
        );
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        deliverables.json = jsonPath;
        console.log(`  ✓ JSON: ${jsonPath}`);
      } catch (err: any) {
        console.warn(`  ⚠ JSON export failed: ${err.message}`);
      }
    }

    // ── PDF (last — needs PNG) ───────────────────────────────────────
    if (config.formats.includes('pdf')) {
      try {
        const pdfGen = new PDFReportGenerator();
        const pdfPath = path.join(
          config.outputDir,
          `${data.projectId}_report.pdf`,
        );
        await pdfGen.generate(data, config, deliverables.svg, pdfPath);
        deliverables.pdf = pdfPath;
        console.log(`  ✓ PDF: ${pdfPath}`);
      } catch (err: any) {
        console.warn(`  ⚠ PDF generation failed: ${err.message}`);
      }
    }

    // ── Build manifest ──────────────────────────────────────────────
    const recon = data.reconciliationV2 || data.reconciliation;
    const calls = recon?.reconciledCalls || recon?.calls || [];

    const manifest: ReportManifest = {
      projectId: data.projectId,
      generatedAt: new Date().toISOString(),
      outputDir: config.outputDir,
      deliverables,
      sourceDocuments: (data.documents?.target || []).map(
        (d) => d.instrument,
      ),
      metadata: {
        propertyName: data.discovery?.ownerName || '',
        address: data.address,
        overallConfidence: data.confidence?.overallScore || 0,
        overallGrade: data.confidence?.overallGrade || 'N/A',
        totalCalls: calls.length,
        reconciledCalls: calls.filter((c: any) => (c.confidence || 0) >= 60)
          .length,
        closureRatio: recon?.closureError?.ratio || 'N/A',
        totalDocumentCost: data.purchases?.billing?.totalSpent || 0,
        pipelineDuration: (Date.now() - startTime) / 1000,
        phaseDurations: Object.entries(checkpoint.phaseDurations).map(
          ([phase, seconds]) => ({
            phase: parseInt(phase),
            name: PHASES.find((p) => p.phase === parseInt(phase))?.name || '',
            seconds: seconds as number,
          }),
        ),
      },
    };

    // Save manifest
    const manifestPath = path.join(
      config.outputDir,
      `${data.projectId}_manifest.json`,
    );
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ Manifest: ${manifestPath}`);

    return manifest;
  }

  // ── Generate Report Only (no pipeline) ──────────────────────────────────

  async generateReport(
    projectId: string,
    config?: Partial<ReportConfig>,
  ): Promise<ReportManifest> {
    const reportConfig = defaultReportConfig(config);
    const data = await this.loadProjectData(projectId);

    const checkpoint: CheckpointData = {
      projectId,
      completedPhases: [],
      phaseOutputs: {},
      phaseDurations: {},
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    return this.generateDeliverables(
      data,
      reportConfig,
      checkpoint,
      Date.now(),
    );
  }

  // ── Pipeline Status ─────────────────────────────────────────────────────

  getStatus(projectId: string): {
    exists: boolean;
    checkpoint: CheckpointData | null;
    hasDeliverables: boolean;
  } {
    const checkpoint = this.loadCheckpoint(projectId);
    const outputDir = path.join(this.outputDir, projectId);
    const hasDeliverables =
      fs.existsSync(outputDir) &&
      fs.readdirSync(outputDir).some((f) => f.endsWith('_manifest.json'));

    return {
      exists: !!checkpoint || hasDeliverables,
      checkpoint,
      hasDeliverables,
    };
  }

  // ── List Projects ───────────────────────────────────────────────────────

  listProjects(): string[] {
    if (!fs.existsSync(this.outputDir)) return [];
    return fs
      .readdirSync(this.outputDir)
      .filter((f) =>
        fs.statSync(path.join(this.outputDir, f)).isDirectory(),
      );
  }

  // ── Clean Project ───────────────────────────────────────────────────────

  cleanProject(projectId: string): void {
    const projectDir = path.join(this.outputDir, projectId);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      console.log(`[Orchestrator] Cleaned project: ${projectId}`);
    }
    this.removeCheckpoint(projectId);
  }

  // ── Checkpoint Persistence ──────────────────────────────────────────────

  private loadCheckpoint(projectId: string): CheckpointData | null {
    const cpPath = path.join(this.outputDir, projectId, '.checkpoint.json');
    if (fs.existsSync(cpPath)) {
      return JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
    }
    return null;
  }

  private saveCheckpoint(checkpoint: CheckpointData): void {
    const cpDir = path.join(this.outputDir, checkpoint.projectId);
    fs.mkdirSync(cpDir, { recursive: true });
    const cpPath = path.join(cpDir, '.checkpoint.json');
    fs.writeFileSync(cpPath, JSON.stringify(checkpoint, null, 2));
  }

  private removeCheckpoint(projectId: string): void {
    const cpPath = path.join(this.outputDir, projectId, '.checkpoint.json');
    if (fs.existsSync(cpPath)) {
      fs.unlinkSync(cpPath);
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
