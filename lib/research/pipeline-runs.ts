// lib/research/pipeline-runs.ts
//
// hub-widget-excellence-12 — the /api/admin/research/pipeline endpoint
// was a hardcoded `{ runs: [] }` stub, so the pipeline-status widget
// always showed empty. There's no dedicated "pipeline_runs" table, but
// each research project IS a pipeline run (its `status` is the workflow
// stage: upload → configure → analyzing → review → drawing → verifying
// → complete). This pure module maps a project row to the widget's
// PipelineRun shape so the endpoint can return real data.

export type PipelineRunStatus = 'running' | 'success' | 'failed' | 'queued';

export interface PipelineRunProject {
  id: string;
  name?: string | null;
  status?: string | null;
  updated_at?: string | null;
}

export interface PipelineRun {
  id: string;
  name: string;
  status: PipelineRunStatus;
  started_at: string | null;
}

/** Map a research-project workflow status to the pipeline-run status the
 *  widget renders. */
export function mapProjectStatusToRun(status: string | null | undefined): PipelineRunStatus {
  switch (status) {
    case 'complete':
      return 'success';
    case 'upload':
    case 'configure':
      return 'queued';
    case 'analyzing':
    case 'review':
    case 'drawing':
    case 'verifying':
      return 'running';
    default:
      // Unknown / null → treat as queued rather than inventing a failure.
      return 'queued';
  }
}

/** Map a research project to a pipeline run row. */
export function toPipelineRun(project: PipelineRunProject): PipelineRun {
  return {
    id: project.id,
    name: project.name?.trim() || 'Research project',
    status: mapProjectStatusToRun(project.status),
    started_at: project.updated_at ?? null,
  };
}
