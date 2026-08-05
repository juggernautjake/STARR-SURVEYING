// worker/src/__tests__/notify-research-done.test.ts
//
// "Whenever AI research gets done, it notifies whoever initiated the research."

import { describe, it, expect, vi } from 'vitest';
import { notifyResearchInitiator } from '../shared/notify-research-done.js';

/** A minimal fake of the PostgREST query builder the helper uses. */
function fakeSupabase(opts: {
  project?: { created_by: string | null; property_address?: string | null; county?: string | null; name?: string | null } | null;
  existingNotifications?: unknown[];
  insertError?: { message: string } | null;
}) {
  const inserts: Record<string, unknown>[] = [];

  const api = {
    from(table: string) {
      if (table === 'research_projects') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.project ?? null }) }) }),
        };
      }
      if (table === 'notifications') {
        return {
          // dedup check: .select().eq().eq().eq().limit()
          select: () => ({
            eq: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: opts.existingNotifications ?? [] }) }) }) }),
          }),
          insert: async (row: Record<string, unknown>) => {
            inserts.push(row);
            return { error: opts.insertError ?? null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  return { api, inserts };
}

describe('notifyResearchInitiator', () => {
  it('writes one notification to the initiator when a run completes', async () => {
    const { api, inserts } = fakeSupabase({
      project: { created_by: 'jane@starr-surveying.com', property_address: '123 Main', county: 'Bell' },
    });
    await notifyResearchInitiator(api, { projectId: 'p1', outcome: 'complete' });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].user_email).toBe('jane@starr-surveying.com');
    expect(inserts[0].type).toBe('research_complete');
    expect(inserts[0].source_id).toBe('p1');
    expect(String(inserts[0].title)).toContain('123 Main');
    expect(String(inserts[0].title)).toContain('Bell County');
    expect(inserts[0].link).toBe('/admin/research/p1');
  });

  it('does not notify twice for the same project', async () => {
    // The completion path runs more than once — a re-run, the unified and county-specific pipelines
    // both ending. Two "your research is done" bells is noise.
    const { api, inserts } = fakeSupabase({
      project: { created_by: 'jane@starr-surveying.com', property_address: '123 Main' },
      existingNotifications: [{ id: 'already-sent' }],
    });
    await notifyResearchInitiator(api, { projectId: 'p1', outcome: 'complete' });
    expect(inserts).toHaveLength(0);
  });

  it('says nothing when there is no initiator on record', async () => {
    // A system-triggered run, or an old row. Nobody to tell — not an error.
    const { api, inserts } = fakeSupabase({ project: { created_by: null } });
    await notifyResearchInitiator(api, { projectId: 'p1', outcome: 'complete' });
    expect(inserts).toHaveLength(0);
  });

  it('wording and escalation differ for a failed run', async () => {
    const { api, inserts } = fakeSupabase({
      project: { created_by: 'jane@starr-surveying.com', property_address: '123 Main' },
    });
    await notifyResearchInitiator(api, { projectId: 'p1', outcome: 'failed', detail: 'Credits ran out.' });

    expect(String(inserts[0].title)).toMatch(/could not finish/i);
    expect(String(inserts[0].body)).toContain('Credits ran out.');
    // A failure is a louder nudge than a clean finish, still just a bell.
    expect(inserts[0].escalation_level).toBe(1);
    expect(inserts[0].icon).toBe('⚠️');
  });

  it('marks a partial run as finished-with-gaps rather than clean', async () => {
    const { api, inserts } = fakeSupabase({
      project: { created_by: 'jane@starr-surveying.com', property_address: '123 Main' },
    });
    await notifyResearchInitiator(api, { projectId: 'p1', outcome: 'partial' });
    expect(String(inserts[0].title)).toMatch(/with gaps/i);
  });

  it('falls back to the project name when there is no address', async () => {
    const { api, inserts } = fakeSupabase({
      project: { created_by: 'jane@starr-surveying.com', property_address: null, name: 'Smith parcel' },
    });
    await notifyResearchInitiator(api, { projectId: 'p1', outcome: 'complete' });
    expect(String(inserts[0].title)).toContain('Smith parcel');
  });

  it('never throws — a notification failure must not break a finished run', async () => {
    const { api } = fakeSupabase({
      project: { created_by: 'jane@starr-surveying.com', property_address: '123 Main' },
      insertError: { message: 'db down' },
    });
    await expect(notifyResearchInitiator(api, { projectId: 'p1', outcome: 'complete' })).resolves.toBeUndefined();
  });

  it('does nothing without a supabase client', async () => {
    await expect(notifyResearchInitiator(null, { projectId: 'p1', outcome: 'complete' })).resolves.toBeUndefined();
  });
});
