// __tests__/files/bulk-delete.test.ts
//
// The delete API behind every Delete button and every "3 selected → Delete" (owner, 2026-09-27):
//
//   1. the pure core — validation, one-at-a-time with partial failure, the summary and the status;
//   2. the real per-kind handlers on a fake Supabase — permission denial, soft vs hard delete, the
//      order that never leaves a row pointing at a missing object, and Undo;
//   3. the route — a mixed batch answers 207 with a result per item; nobody-allowed answers 403.
//
// Nothing here reaches a real database or bucket.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseTargets, runBulk, summarise, batchStatus, MAX_BULK_ITEMS,
  type Handlers, type DeleteActor, type KindHandler,
} from '@/lib/files/bulk-delete';

// ── a fake Supabase that records what was asked of it ────────────────────────────────────────
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const ops: string[] = [];
const storageFailures = new Set<string>();

function query(table: string) {
  const filters: Array<[string, unknown]> = [];
  let mode: 'select' | 'update' | 'delete' = 'select';
  let patch: Row = {};
  const rows = () => (db[table] ??= []).filter((r) => filters.every(([k, v]) => r[k] === v));
  const run = () => {
    if (mode === 'update') {
      const hit = rows();
      hit.forEach((r) => Object.assign(r, patch));
      ops.push(`update ${table} ${filters.map(([k, v]) => `${k}=${v}`).join(',')} ${JSON.stringify(patch)}`);
      return { data: hit, error: null };
    }
    if (mode === 'delete') {
      const hit = rows();
      db[table] = db[table]!.filter((r) => !hit.includes(r));
      ops.push(`delete ${table} ${filters.map(([k, v]) => `${k}=${v}`).join(',')}`);
      return { data: hit, error: null };
    }
    return { data: rows(), error: null };
  };
  const q = {
    select: () => q,
    update: (p: Row) => { mode = 'update'; patch = p; return q; },
    delete: () => { mode = 'delete'; return q; },
    insert: (r: Row | Row[]) => { (db[table] ??= []).push(...(Array.isArray(r) ? r : [r])); ops.push(`insert ${table}`); return Promise.resolve({ error: null }); },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
    maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({
  RESEARCH_DOCUMENTS_BUCKET: 'research-documents',
  supabaseAdmin: {
    from: (t: string) => query(t),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          ops.push(`remove ${bucket}/${paths.join(',')}`);
          return { error: storageFailures.has(paths[0]!) ? { message: 'object store unavailable' } : null };
        },
      }),
    },
  },
}));
vi.mock('@/lib/apiErrorHandler', () => ({ fireAndForget: async (p: PromiseLike<unknown>) => { await p; } }));
// The File Explorer node path is the existing, separately tested route logic.
vi.mock('@/lib/files/node-delete', () => ({
  softDeleteNode: vi.fn(async (id: string) => (id === 'sysroot'
    ? { ok: false, status: 400, error: 'System folders cannot be deleted.' }
    : { ok: true, name: `${id}.pdf`, count: 1 })),
  restoreNode: vi.fn(async (id: string) => ({ ok: true, name: `${id}.pdf`, restoredAs: `${id}.pdf`, count: 1 })),
}));

const admin: DeleteActor = { email: 'owner@example.com', roles: ['admin'], admin: true };
const crew: DeleteActor = { email: 'crew@example.com', roles: ['field_crew'], admin: false };
const student: DeleteActor = { email: 'student@example.com', roles: ['student'], admin: false };

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  ops.length = 0;
  storageFailures.clear();
});

// ── 1. the pure core ─────────────────────────────────────────────────────────────────────────

describe('parseTargets — the browser is untrusted', () => {
  it('accepts a list of { kind, id } and drops duplicates, keeping order', () => {
    const r = parseTargets({ targets: [{ kind: 'job_file', id: 'a' }, { kind: 'file_node', id: 'b' }, { kind: 'job_file', id: 'a' }] });
    expect(r).toEqual({ ok: true, targets: [{ kind: 'job_file', id: 'a' }, { kind: 'file_node', id: 'b' }] });
  });
  it.each([
    [null, /Nothing to delete/],
    [{ targets: [] }, /Nothing to delete/],
    [{ targets: [{ kind: 'receipts', id: 'a' }] }, /Unknown kind/],
    [{ targets: [{ kind: 'job_file', id: "a'; drop table" }] }, /valid id/],
    [{ targets: [{ kind: 'job_file' }] }, /valid id/],
  ])('refuses %j', (body, msg) => {
    const r = parseTargets(body);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(msg);
  });
  it(`refuses more than ${MAX_BULK_ITEMS} at once`, () => {
    const targets = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => ({ kind: 'job_file', id: `f${i}` }));
    expect(parseTargets({ targets }).ok).toBe(false);
  });
});

describe('runBulk — one failure never stops the rest', () => {
  const fake = (impl: KindHandler['delete']): Handlers => {
    const h: KindHandler = { delete: impl };
    return { file_node: h, job_file: h, research_document: h, user_file: h, vehicle_photo: h, equipment_photo: h, lead_attachment: h };
  };

  it('reports each item on its own: a denial on item 2 and a crash on item 3 do not stop item 4', async () => {
    const results = await runBulk('delete', [
      { kind: 'job_file', id: 'ok1' }, { kind: 'job_file', id: 'nope' }, { kind: 'job_file', id: 'boom' }, { kind: 'file_node', id: 'ok2' },
    ], admin, fake(async (id) => {
      if (id === 'nope') return { ok: false, status: 403, error: 'not allowed', name: 'nope.pdf' };
      if (id === 'boom') throw new Error('database went away');
      return { ok: true, name: `${id}.jpg` };
    }));
    expect(results.map((r) => [r.id, r.ok, r.status ?? null])).toEqual([
      ['ok1', true, null], ['nope', false, 403], ['boom', false, 500], ['ok2', true, null],
    ]);
    expect(results[0]!.restorable).toBe(true); // job files can be undone
    expect(results[2]!.error).toBe('database went away');
    expect(batchStatus(results)).toBe(207);
    const s = summarise('delete', results);
    expect(s).toMatchObject({ succeeded: 2, failed: 2 });
    expect(s.message).toMatch(/Deleted 2 of 4 files\. Could not delete: nope\.pdf \(not allowed\); boom \(database went away\)/);
  });

  it('when nobody is allowed anything, the batch says 403 plainly', async () => {
    const results = await runBulk('delete', [{ kind: 'job_file', id: 'a' }, { kind: 'job_file', id: 'b' }], student,
      fake(async () => ({ ok: false, status: 403, error: 'no' })));
    expect(batchStatus(results)).toBe(403);
  });

  it('restore of a kind that cannot be undone is refused per item, not thrown', async () => {
    const results = await runBulk('restore', [{ kind: 'research_document', id: 'd1' }], admin, fake(async () => ({ ok: true })));
    expect(results[0]).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/cannot be restored/) });
  });
});

// ── 2. the real handlers ─────────────────────────────────────────────────────────────────────

describe('job files — soft delete, role-gated, undoable', () => {
  beforeEach(() => {
    db.job_files = [
      { id: 'jf1', job_id: 'job1', file_name: 'corner.jpg', name: null, section: 'photos', is_deleted: false },
      { id: 'jf1-bak', backup_of: 'jf1', job_id: 'job1', file_name: 'corner.jpg', is_deleted: false },
    ];
  });

  it('a field crew member can delete: the file and its backup are flagged, the object stays for Undo', async () => {
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.job_file.delete('jf1', crew)).toEqual({ ok: true, name: 'corner.jpg' });
    expect(db.job_files!.every((r) => r.is_deleted === true)).toBe(true);
    expect(ops.some((o) => o.startsWith('remove'))).toBe(false);
    expect(db.activity_log).toEqual([expect.objectContaining({ action_type: 'job_file_deleted', entity_id: 'job1', user_email: 'crew@example.com' })]);
  });

  it('PERMISSION DENIED: a student cannot delete a job file, and nothing changes', async () => {
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    const out = await DELETE_HANDLERS.job_file.delete('jf1', student);
    expect(out).toMatchObject({ ok: false, status: 403 });
    expect(db.job_files!.every((r) => r.is_deleted === false)).toBe(true);
    expect(db.activity_log).toBeUndefined();
  });

  it('Undo brings it and its backup back, and says so in the history', async () => {
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    await DELETE_HANDLERS.job_file.delete('jf1', crew);
    expect(await DELETE_HANDLERS.job_file.restore!('jf1', crew)).toEqual({ ok: true, name: 'corner.jpg' });
    expect(db.job_files!.every((r) => r.is_deleted === false)).toBe(true);
    expect(db.activity_log!.map((r) => r.action_type)).toEqual(['job_file_deleted', 'job_file_restored']);
  });

  it('an already-deleted or unknown file is a 404, not a second history entry', async () => {
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.job_file.delete('nope', admin)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('research documents — hard delete, row before object', () => {
  beforeEach(() => {
    db.research_documents = [{ id: 'd1', research_project_id: 'p1', storage_path: 'p1/deed.pdf', original_filename: 'deed.pdf', document_label: 'Deed 1998' }];
    db.extracted_data_points = [{ id: 'x', document_id: 'd1' }];
  });

  it('removes the facts, then the row, then the object — in that order', async () => {
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.research_document.delete('d1', { ...crew, roles: ['researcher'] })).toEqual({ ok: true, name: 'Deed 1998' });
    const order = ops.filter((o) => /^(delete|remove)/.test(o));
    expect(order).toEqual([
      'delete extracted_data_points document_id=d1',
      'delete research_documents id=d1',
      'remove research-documents/p1/deed.pdf',
    ]);
    expect(db.research_documents).toEqual([]);
  });

  it('if the object cannot be removed, the delete still stands and the leftover is logged for cleanup', async () => {
    storageFailures.add('p1/deed.pdf');
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect((await DELETE_HANDLERS.research_document.delete('d1', admin)).ok).toBe(true);
    expect(db.activity_log![0]!.metadata).toMatchObject({ storage_error: 'object store unavailable', storage_path: 'p1/deed.pdf' });
  });

  it('PERMISSION DENIED: a field-only account cannot delete research', async () => {
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.research_document.delete('d1', crew)).toMatchObject({ ok: false, status: 403 });
    expect(db.research_documents).toHaveLength(1);
  });
});

describe('My Files and vehicle photos', () => {
  it('My Files: only the owner, even for an admin', async () => {
    db.user_files = [{ id: 'u1', user_email: 'crew@example.com', storage_path: 'crew/u1-a.png', file_name: 'a.png' }];
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.user_file.delete('u1', admin)).toMatchObject({ ok: false, status: 403, name: 'a.png' });
    expect(await DELETE_HANDLERS.user_file.delete('u1', crew)).toEqual({ ok: true, name: 'a.png' });
    expect(ops).toContain('remove user-files/crew/u1-a.png');
  });

  it('vehicle photo: admin only; deleting the primary photo clears the vehicle thumbnail', async () => {
    db.vehicle_photos = [{ id: 'vp1', vehicle_id: 'v1', photo_path: 'v1/vp1.jpg', caption: 'Front' }];
    db.vehicles = [{ id: 'v1', primary_photo_path: 'v1/vp1.jpg' }];
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.vehicle_photo.delete('vp1', crew)).toMatchObject({ ok: false, status: 403 });
    expect(await DELETE_HANDLERS.vehicle_photo.delete('vp1', admin)).toEqual({ ok: true, name: 'Front' });
    expect(db.vehicles![0]!.primary_photo_path).toBeNull();
    expect(ops).toContain('remove vehicle-photos/v1/vp1.jpg');
  });

  it('vehicle photo: a photo whose vehicle is not visible (another firm) is not found', async () => {
    db.vehicle_photos = [{ id: 'vp2', vehicle_id: 'v-other-org', photo_path: 'x.jpg', caption: null }];
    db.vehicles = [];
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.vehicle_photo.delete('vp2', admin)).toMatchObject({ ok: false, status: 404 });
    expect(db.vehicle_photos).toHaveLength(1);
  });
});

describe('equipment photo and lead attachments', () => {
  it('equipment photo: admin or equipment manager; the unit keeps no pointer to a removed photo', async () => {
    db.equipment_inventory = [{ id: 'e1', name: 'Trimble S7', photo_url: 'e1/photo.jpg' }];
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    expect(await DELETE_HANDLERS.equipment_photo.delete('e1', crew)).toMatchObject({ ok: false, status: 403 });
    expect(await DELETE_HANDLERS.equipment_photo.delete('e1', { ...crew, roles: ['equipment_manager'] })).toEqual({ ok: true, name: 'Photo of Trimble S7' });
    expect(db.equipment_inventory![0]!.photo_url).toBeNull();
    expect(ops).toContain('remove starr-field-equipment-photos/e1/photo.jpg');
  });

  it('lead attachments: removed by content key, so deleting two in one batch removes the right two', async () => {
    const { leadAttachmentId } = await import('@/lib/files/bulk-delete');
    const a = { name: 'plat.pdf', size: 100, storage_path: 'L1/plat.pdf' };
    const b = { name: 'site.jpg', size: 200, storage_path: 'L1/site.jpg' };
    const c = { name: 'deed.pdf', size: 300, storage_path: 'L1/deed.pdf' };
    db.leads = [{ id: 'L1', attachments: [a, b, c] }];
    const { DELETE_HANDLERS } = await import('@/lib/files/delete-handlers');
    const results = await runBulk('delete', [
      { kind: 'lead_attachment', id: leadAttachmentId('L1', a) },
      { kind: 'lead_attachment', id: leadAttachmentId('L1', c) },
    ], admin, DELETE_HANDLERS);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((db.leads![0]!.attachments as Array<{ name: string }>).map((x) => x.name)).toEqual(['site.jpg']);
    expect(ops).toContain('remove lead-attachments/L1/plat.pdf');
    expect(ops).toContain('remove lead-attachments/L1/deed.pdf');
    expect(await DELETE_HANDLERS.lead_attachment.delete(leadAttachmentId('L1', b), crew)).toMatchObject({ ok: false, status: 403 });
  });
});

// ── 3. the route ─────────────────────────────────────────────────────────────────────────────

const session = vi.hoisted(() => ({ current: null as null | { user: { email: string; roles: string[] } } }));
// next-auth cannot load under vitest; the role helpers below are copies of lib/auth.ts's own
// (admin always passes hasAnyRole; research = admin/developer/researcher/drawer).
vi.mock('@/lib/auth', () => {
  const hasAnyRole = (roles: string[] | null | undefined, required: string[]) =>
    !!roles && (roles.includes('admin') || required.some((r) => roles.includes(r)));
  return {
    auth: async () => session.current,
    isAdmin: (roles: string[] | null | undefined) => !!roles?.includes('admin'),
    hasAnyRole,
    canAccessResearch: (roles: string[] | null | undefined) => hasAnyRole(roles, ['admin', 'developer', 'researcher', 'drawer']),
  };
});

async function post(path: 'bulk-delete' | 'bulk-restore', body: unknown) {
  const mod = path === 'bulk-delete'
    ? await import('@/app/api/admin/files/bulk-delete/route')
    : await import('@/app/api/admin/files/bulk-restore/route');
  const { NextRequest } = await import('next/server');
  const res = await mod.POST(new NextRequest(`http://localhost/api/admin/files/${path}`, { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
}

describe('POST /api/admin/files/bulk-delete', () => {
  beforeEach(() => {
    db.job_files = [{ id: 'jf1', job_id: 'job1', file_name: 'a.jpg', section: 'photos', is_deleted: false }];
    db.research_documents = [{ id: 'd1', research_project_id: 'p1', storage_path: 'p1/b.pdf', original_filename: 'b.pdf', document_label: null }];
  });

  it('401 without a session', async () => {
    session.current = null;
    expect((await post('bulk-delete', { targets: [{ kind: 'job_file', id: 'jf1' }] })).status).toBe(401);
  });

  it('PARTIAL FAILURE: a field crew member deletes the job photo but not the research document → 207, per item', async () => {
    session.current = { user: { email: 'crew@example.com', roles: ['field_crew'] } };
    const { status, json } = await post('bulk-delete', { targets: [{ kind: 'job_file', id: 'jf1' }, { kind: 'research_document', id: 'd1' }] });
    expect(status).toBe(207);
    expect(json.results).toEqual([
      expect.objectContaining({ id: 'jf1', ok: true, restorable: true }),
      expect.objectContaining({ id: 'd1', ok: false, status: 403 }),
    ]);
    expect(json.message).toMatch(/Deleted 1 of 2 files/);
    expect(db.research_documents).toHaveLength(1);
  });

  it('PERMISSION DENIED for everything → a plain 403', async () => {
    session.current = { user: { email: 'student@example.com', roles: ['student'] } };
    const { status } = await post('bulk-delete', { targets: [{ kind: 'job_file', id: 'jf1' }] });
    expect(status).toBe(403);
    expect(db.job_files![0]!.is_deleted).toBe(false);
  });

  it('400 on a malformed body', async () => {
    session.current = { user: { email: 'owner@example.com', roles: ['admin'] } };
    expect((await post('bulk-delete', { targets: [{ kind: 'everything', id: '*' }] })).status).toBe(400);
  });

  it('Undo: bulk-restore brings the job file back', async () => {
    session.current = { user: { email: 'owner@example.com', roles: ['admin'] } };
    await post('bulk-delete', { targets: [{ kind: 'job_file', id: 'jf1' }] });
    expect(db.job_files![0]!.is_deleted).toBe(true);
    const { status } = await post('bulk-restore', { targets: [{ kind: 'job_file', id: 'jf1' }] });
    expect(status).toBe(200);
    expect(db.job_files![0]!.is_deleted).toBe(false);
  });
});
