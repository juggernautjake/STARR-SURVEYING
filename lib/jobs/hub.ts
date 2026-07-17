// lib/jobs/hub.ts — pure display derivations for the Work Mode field hub (B2/A3).
//
// Kept off the component so they're unit-testable and shared (the job picker and the Job-tab header
// showed the same label two different ways before this). No React / no I/O.

/** A job's short label: "job_number · name", dropping whichever is blank, falling back to `fallbackId`
 *  (then '') so the picker never renders an empty option. */
export function jobLabel(job: { job_number?: string | null; name?: string | null }, fallbackId?: string): string {
  return [job.job_number, job.name].filter(Boolean).join(' · ') || fallbackId || '';
}

/** Group a job's files by section for the A3 documents/research panel — section title-cased ('general'
 *  when blank), files kept in first-seen order, and the sections themselves in first-seen order. Generic
 *  so any file-shaped row with a `section` works. */
export function groupFilesBySection<T extends { section?: string | null }>(files: T[]): [string, T[]][] {
  const bySection = new Map<string, T[]>();
  for (const f of files) {
    const sec = (f.section || 'general').replace(/\b\w/g, (c) => c.toUpperCase());
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push(f);
  }
  return [...bySection.entries()];
}
