// worker/src/research/research-round.ts — which research round a run is (plan 3.4, 2026-09-06)
//
// The research ⇄ analysis loop is round-based: round 1 is the first run; each user-initiated
// follow-up seeded from the discovered leads bumps `research_projects.analysis_metadata.researchRound`
// (index.ts, the follow-up bookkeeping). The run's filing path stamps that round onto every
// document it files (`research_documents.research_round`, seed 632), so a reviewer can tell an
// original find from what a follow-up added.
//
// `readResearchRound` is the one reader of the round for a run that is NOT a follow-up (a plain
// re-run stays on the project's current round). Pure over the injected client so it is tested
// without Supabase.

export interface RoundReader {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        single: () => Promise<{ data: { analysis_metadata?: unknown } | null; error?: { message: string } | null }>;
      };
    };
  };
}

/** The project's current research round; 1 when it has never been set. Never throws. */
export async function readResearchRound(sb: RoundReader, projectId: string): Promise<number> {
  try {
    const { data } = await sb.from('research_projects').select('analysis_metadata').eq('id', projectId).single();
    return roundFromMetadata(data?.analysis_metadata);
  } catch {
    return 1;
  }
}

/** The round recorded in an `analysis_metadata` bag, or 1. */
export function roundFromMetadata(meta: unknown): number {
  const r = (meta as { researchRound?: unknown } | null | undefined)?.researchRound;
  return typeof r === 'number' && Number.isFinite(r) && r >= 1 ? Math.floor(r) : 1;
}
