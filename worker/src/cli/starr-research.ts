// worker/src/cli/starr-research.ts — Phase 10 Module 7
// CLI interface for STARR RECON pipeline using commander.js.
// Subcommands: run, report, status, list, clean
//
// Spec §10.10 — CLI Interface
//
// Usage:
//   npx ts-node src/cli/starr-research.ts run --address "123 Main St" --county "Bell"
//   npx ts-node src/cli/starr-research.ts report --project STARR-ABC12345
//   npx ts-node src/cli/starr-research.ts status --project STARR-ABC12345
//   npx ts-node src/cli/starr-research.ts list
//   npx ts-node src/cli/starr-research.ts clean --project STARR-ABC12345

import { Command } from 'commander';
import { MasterOrchestrator } from '../orchestrator/master-orchestrator.js';
import { defaultReportConfig } from '../types/reports.js';
import type { ReportFormat } from '../types/reports.js';

const program = new Command();

program
  .name('starr-research')
  .description('STARR RECON — AI-Powered Property Research Pipeline')
  .version('1.0.0');

// ── run — Execute full pipeline ─────────────────────────────────────────────

program
  .command('run')
  .description('Run full 9-phase research pipeline for a property')
  .requiredOption('-a, --address <address>', 'Property address')
  .option('-c, --county <county>', 'County name (auto-detected if omitted)')
  .option('-p, --project <id>', 'Project ID (auto-generated if omitted)')
  .option('-b, --budget <dollars>', 'Document purchase budget', '50')
  .option('--auto-purchase', 'Auto-approve document purchases', false)
  .option('-o, --output <dir>', 'Output directory', '/tmp/deliverables')
  .option(
    '-f, --formats <formats>',
    'Comma-separated output formats: pdf,dxf,svg,png,json,txt',
    'pdf,dxf,svg',
  )
  .option('--resume-from <phase>', 'Resume from phase number')
  .option('--skip <phases>', 'Comma-separated phase numbers to skip')
  .option('--page-size <size>', 'PDF page size: letter or tabloid', 'letter')
  .option('--dpi <dpi>', 'PNG/DXF DPI', '300')
  .option('--base-url <url>', 'Worker API base URL', 'http://localhost:3100')
  .action(async (opts) => {
    try {
      const formats = opts.formats.split(',').map((f: string) => f.trim()) as ReportFormat[];
      const skipPhases = opts.skip
        ? opts.skip.split(',').map((n: string) => parseInt(n.trim()))
        : undefined;

      const orchestrator = new MasterOrchestrator(opts.baseUrl);

      const manifest = await orchestrator.runPipeline({
        address: opts.address,
        county: opts.county,
        projectId: opts.project,
        budget: parseFloat(opts.budget),
        autoPurchase: opts.autoPurchase,
        outputDir: opts.output,
        formats,
        reportConfig: {
          pdf: {
            pageSize: opts.pageSize as 'letter' | 'tabloid',
            includeSourceThumbnails: true,
            includeAppendix: true,
            companyName: process.env.COMPANY_NAME || 'Starr Surveying Company',
            companyAddress: process.env.COMPANY_ADDRESS || 'Belton, Texas',
            rpls: process.env.COMPANY_RPLS || '',
            logoPath: process.env.COMPANY_LOGO_PATH || null,
          },
          drawing: {
            dpi: parseInt(opts.dpi),
            width: 1200,
            height: 900,
            showConfidenceColors: true,
            showAdjacentLabels: true,
            showROW: true,
            showEasements: true,
            showLotLabels: true,
            showBearingLabels: true,
            showDistanceLabels: true,
            showCurveAnnotations: true,
            showMonuments: true,
            showNorthArrow: true,
            showScaleBar: true,
            showLegend: true,
            backgroundColor: '#FFFFFF',
            boundaryColor: '#000000',
            lotLineColor: '#333333',
            easementColor: '#0066CC',
            rowColor: '#CC0000',
            adjacentColor: '#666666',
          },
        },
        resumeFromPhase: opts.resumeFrom
          ? parseInt(opts.resumeFrom)
          : undefined,
        skipPhases,
      });

      console.log('\n── Deliverables ──');
      for (const [format, filePath] of Object.entries(manifest.deliverables)) {
        if (filePath) {
          console.log(`  ${format.toUpperCase()}: ${filePath}`);
        }
      }

      console.log('\n── Metadata ──');
      console.log(`  Confidence: ${manifest.metadata.overallConfidence}% (Grade ${manifest.metadata.overallGrade})`);
      console.log(`  Calls: ${manifest.metadata.totalCalls} total, ${manifest.metadata.reconciledCalls} reconciled`);
      console.log(`  Closure: ${manifest.metadata.closureRatio}`);
      console.log(`  Cost: $${manifest.metadata.totalDocumentCost.toFixed(2)}`);
      console.log(`  Duration: ${manifest.metadata.pipelineDuration.toFixed(1)}s`);

      process.exit(0);
    } catch (err: any) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

// ── report — Generate reports from existing data ────────────────────────────

program
  .command('report')
  .description('Generate reports from existing project data')
  .requiredOption('-p, --project <id>', 'Project ID')
  .option('-o, --output <dir>', 'Output directory', '/tmp/deliverables')
  .option(
    '-f, --formats <formats>',
    'Comma-separated output formats',
    'pdf,dxf,svg',
  )
  .option('--page-size <size>', 'PDF page size', 'letter')
  .option('--dpi <dpi>', 'PNG DPI', '300')
  .option('--base-url <url>', 'Worker API base URL', 'http://localhost:3100')
  .action(async (opts) => {
    try {
      const formats = opts.formats.split(',').map((f: string) => f.trim()) as ReportFormat[];

      const orchestrator = new MasterOrchestrator(opts.baseUrl);
      const config = defaultReportConfig({
        formats,
        outputDir: opts.output,
        pdf: { pageSize: opts.pageSize as 'letter' | 'tabloid' } as any,
        drawing: { dpi: parseInt(opts.dpi) } as any,
      });

      const manifest = await orchestrator.generateReport(opts.project, config);

      console.log('\nReport generated successfully.');
      for (const [format, filePath] of Object.entries(manifest.deliverables)) {
        if (filePath) {
          console.log(`  ${format.toUpperCase()}: ${filePath}`);
        }
      }

      process.exit(0);
    } catch (err: any) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

// ── status — Check pipeline status ──────────────────────────────────────────

program
  .command('status')
  .description('Check pipeline status for a project')
  .requiredOption('-p, --project <id>', 'Project ID')
  .option('--base-url <url>', 'Worker API base URL', 'http://localhost:3100')
  .action((opts) => {
    try {
      const orchestrator = new MasterOrchestrator(opts.baseUrl);
      const status = orchestrator.getStatus(opts.project);

      if (!status.exists) {
        console.log(`Project ${opts.project} not found.`);
        process.exit(1);
      }

      console.log(`\nProject: ${opts.project}`);
      console.log(`Has Deliverables: ${status.hasDeliverables}`);

      if (status.checkpoint) {
        console.log(`\nCheckpoint:`);
        console.log(`  Started: ${status.checkpoint.startedAt}`);
        console.log(`  Last Updated: ${status.checkpoint.lastUpdated}`);
        console.log(
          `  Completed Phases: ${status.checkpoint.completedPhases.join(', ') || 'none'}`,
        );

        for (const [phase, duration] of Object.entries(
          status.checkpoint.phaseDurations,
        )) {
          console.log(`  Phase ${phase}: ${(duration as number).toFixed(1)}s`);
        }
      }

      process.exit(0);
    } catch (err: any) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

// ── list — List all projects ────────────────────────────────────────────────

program
  .command('list')
  .description('List all projects')
  .option('--base-url <url>', 'Worker API base URL', 'http://localhost:3100')
  .action((opts) => {
    try {
      const orchestrator = new MasterOrchestrator(opts.baseUrl);
      const projects = orchestrator.listProjects();

      if (projects.length === 0) {
        console.log('No projects found.');
      } else {
        console.log(`\n${projects.length} project(s):`);
        for (const p of projects) {
          const status = orchestrator.getStatus(p);
          const phases = status.checkpoint?.completedPhases.length || 0;
          const deliverables = status.hasDeliverables ? '✓' : '—';
          console.log(`  ${p}  [${phases}/9 phases]  Deliverables: ${deliverables}`);
        }
      }

      process.exit(0);
    } catch (err: any) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

// ── clean — Remove project data ─────────────────────────────────────────────

program
  .command('clean')
  .description('Remove project data and deliverables')
  .requiredOption('-p, --project <id>', 'Project ID')
  .option('--base-url <url>', 'Worker API base URL', 'http://localhost:3100')
  .action((opts) => {
    try {
      const orchestrator = new MasterOrchestrator(opts.baseUrl);
      orchestrator.cleanProject(opts.project);
      console.log(`Project ${opts.project} cleaned.`);
      process.exit(0);
    } catch (err: any) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

// ── Parse ───────────────────────────────────────────────────────────────────

program.parse();
