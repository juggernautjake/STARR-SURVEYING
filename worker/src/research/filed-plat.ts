// The one question three places used to answer separately: does this project already hold a plat for
// this subdivision? The early pass asks before the free portal and TexasFile; the orchestrator asks for
// the completeness summary; and Phase 2's repository search asks so it does not fetch the same file
// through a second paid browser session (run 7, 2026-09-08: the plat filed at 107 s was downloaded again
// at 301 s and then refused by the uploader as "already filed").

import { getSupabase } from '../services/pipeline.js';
import { normaliseSubdivisionName } from '../services/texasfile-rows.js';

/** The label of a plat already filed on the project for the subdivision; null when none, or on any error. */
export async function filedPlatLabel(projectId: string | undefined | null, subdivision: string | null | undefined): Promise<string | null> {
  if (!projectId || !subdivision) return null;
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const key = normaliseSubdivisionName(subdivision).replace(/[%_]/g, '');
    if (!key) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any).from('research_documents')
      .select('document_label')
      .eq('research_project_id', projectId)
      .eq('document_type', 'plat')
      .is('superseded_at', null)
      .ilike('document_label', `%${key}%`)
      .limit(1);
    return ((data ?? [])[0] as { document_label?: string } | undefined)?.document_label ?? null;
  } catch {
    return null;
  }
}
