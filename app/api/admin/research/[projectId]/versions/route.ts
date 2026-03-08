// app/api/admin/research/[projectId]/versions/route.ts
// Phase 18: Pipeline Versioning API
//
// GET  /api/admin/research/{projectId}/versions
//   → List all pipeline versions for the project (newest first)
//
// POST /api/admin/research/{projectId}/versions
//   Body: { action: 'compare', versionAId: string, versionBId: string }
//   → Run a diff between two stored versions and return PipelineDiffResult

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { PipelineVersionStore } from '@/worker/src/services/pipeline-version-store';
import { PipelineDiffEngine } from '@/worker/src/services/pipeline-diff-engine';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* GET — list all pipeline versions for a project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: versions, error } = await supabaseAdmin
    .from('pipeline_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('version_number', { ascending: false });

  if (error) throw error;

  return NextResponse.json({ versions: versions ?? [] });
}, { routeName: 'research/projectId/versions/list' });

/* POST — compare two versions or other versioning actions */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    versionAId?: string;
    versionBId?: string;
  };

  if (body.action !== 'compare') {
    return NextResponse.json({ error: 'Unknown action — supported: compare' }, { status: 400 });
  }

  const { versionAId, versionBId } = body;
  if (!versionAId || !versionBId) {
    return NextResponse.json(
      { error: 'versionAId and versionBId are required for compare' },
      { status: 400 },
    );
  }

  const store = new PipelineVersionStore();

  const [versionA, versionB] = await Promise.all([
    store.getVersion(versionAId),
    store.getVersion(versionBId),
  ]);

  if (!versionA) return NextResponse.json({ error: 'versionA not found' }, { status: 404 });
  if (!versionB) return NextResponse.json({ error: 'versionB not found' }, { status: 404 });

  if (versionA.projectId !== projectId || versionB.projectId !== projectId) {
    return NextResponse.json(
      { error: 'Both versions must belong to the requested project' },
      { status: 403 },
    );
  }

  const [snapshotA, snapshotB] = await Promise.all([
    store.loadSnapshot(versionAId),
    store.loadSnapshot(versionBId),
  ]);

  if (!snapshotA) return NextResponse.json({ error: 'Snapshot for versionA not found' }, { status: 404 });
  if (!snapshotB) return NextResponse.json({ error: 'Snapshot for versionB not found' }, { status: 404 });

  const engine = new PipelineDiffEngine();
  const diffResult = engine.diff(versionA, snapshotA, versionB, snapshotB);

  return NextResponse.json({ diff: diffResult });
}, { routeName: 'research/projectId/versions/compare' });
