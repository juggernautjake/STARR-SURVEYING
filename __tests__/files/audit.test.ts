// __tests__/files/audit.test.ts
//
// The first block here is the whole reason `lib/files/audit.ts` exists as a separate module.
//
// Six routes wrote `activity_log` rows with `action` and `details`. The live columns are
// `action_type` and `metadata`, so PostgREST rejected every insert with PGRST204 — and every one of
// those writes was wrapped in `fireAndForget`, which exists precisely to swallow that error. The
// platform recorded nothing and reported nothing. A fire-and-forget write has no feedback path, so
// its shape has to be pinned by something that does. This is that something.

import { describe, it, expect } from 'vitest';
import { fileEventRow, describeFileEvent, humanSize, FILE_ENTITY } from '@/lib/files/audit';

describe('the row shape, which has no runtime feedback', () => {
  const row = fileEventRow({
    action: 'file_uploaded',
    nodeId: 'node-1',
    actorEmail: 'jacob@starr-surveying.com',
    metadata: { name: 'plat.pdf' },
  });

  it('uses the column names the table actually has', () => {
    // If either of these is ever renamed back, this fails instead of production going quiet.
    expect(Object.keys(row).sort()).toEqual(
      ['action_type', 'entity_id', 'entity_type', 'metadata', 'user_email'],
    );
    expect(row).not.toHaveProperty('action');
    expect(row).not.toHaveProperty('details');
  });

  it('carries the actor, the node and the action', () => {
    expect(row.user_email).toBe('jacob@starr-surveying.com');
    expect(row.entity_id).toBe('node-1');
    expect(row.action_type).toBe('file_uploaded');
    expect(row.entity_type).toBe(FILE_ENTITY);
  });

  it('never writes a null metadata, so readers need no null branch', () => {
    const bare = fileEventRow({ action: 'file_deleted', nodeId: 'n', actorEmail: 'a@b.c' });
    expect(bare.metadata).toEqual({});
  });

  it('uses one entity_type for every file event', () => {
    const actions = ['file_folder_created', 'file_renamed', 'file_moved', 'file_restored'] as const;
    const types = actions.map((a) => fileEventRow({ action: a, nodeId: 'n', actorEmail: 'a@b.c' }).entity_type);
    expect(new Set(types).size).toBe(1);
  });
});

describe('describing an event to a person', () => {
  it('a rename says what it was called BEFORE', () => {
    // A rename entry showing only the new name is a timestamp, not a history.
    const d = describeFileEvent('file_renamed', { from_name: 'old.pdf', to_name: 'new.pdf' });
    expect(d.label).toBe('Renamed');
    expect(d.detail).toBe('old.pdf → new.pdf');
  });

  it('a move names both folders, and calls the root what a person calls it', () => {
    const d = describeFileEvent('file_moved', {
      from_parent_id: null, to_parent_id: 'x', to_parent_name: 'Surveys',
    });
    expect(d.detail).toBe('the top level → Surveys');
  });

  it('a restore that had to rename says so', () => {
    // Otherwise the file appears to come back under a name nobody chose, and reads as the wrong
    // file being restored.
    const d = describeFileEvent('file_restored', { name: 'Plat.pdf', restored_as: 'Plat (2).pdf' });
    expect(d.label).toBe('Restored');
    expect(d.detail).toContain('restored as Plat (2).pdf');
  });

  it('a restore that kept its name does not claim it was renamed', () => {
    const d = describeFileEvent('file_restored', { name: 'Plat.pdf', restored_as: 'Plat.pdf' });
    expect(d.detail).not.toContain('restored as');
  });

  it('a permissions change summarises rather than listing', () => {
    const d = describeFileEvent('file_permissions_changed', { permission_mode: 'custom', grant_count: 3 });
    expect(d.label).toBe('Permissions changed');
    expect(d.detail).toContain('3 grants');
  });

  it('an unknown action still reads as words, not as a slug', () => {
    const d = describeFileEvent('file_something_new', {});
    expect(d.label).toBe('something new');
  });

  it('empty strings in metadata do not become empty details', () => {
    const d = describeFileEvent('file_renamed', { from_name: '  ', to_name: 'new.pdf' });
    expect(d.detail).toBe('new.pdf');
  });
});

describe('humanSize', () => {
  it('reads in the unit a person would use', () => {
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2.0 KB');
    expect(humanSize(5 * 1048576)).toBe('5.0 MB');
  });
  it('does not print nonsense for nonsense', () => {
    expect(humanSize(Number.NaN)).toBe('');
    expect(humanSize(-1)).toBe('');
  });
});
