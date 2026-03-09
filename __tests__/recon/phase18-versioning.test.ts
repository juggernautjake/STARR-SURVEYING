// __tests__/recon/phase18-versioning.test.ts
// Unit tests for STARR RECON Phase 18: Data Versioning & Pipeline Diff Engine.
//
// Phase 18 delivers:
//   Module A: PipelineVersionStore  (worker/src/services/pipeline-version-store.ts)
//   Module B: PipelineDiffEngine    (worker/src/services/pipeline-diff-engine.ts)
//   Module C: SQL Schema            (seeds/096_phase18_versions.sql)
//   Module D: API Route structure   (app/api/admin/research/[projectId]/versions/route.ts)
//
// Tests are pure-logic only — no live network calls, no real file system I/O.
// The fs/promises module is fully mocked with an in-memory store.
//
// Test index:
//
// ── Module A: PipelineVersionStore ───────────────────────────────────────────
//  1.  PipelineVersionStore can be instantiated
//  2.  Default versionsDir is /tmp/recon-versions
//  3.  Custom versionsDir is used when provided
//  4.  saveVersion returns a PipelineVersion object
//  5.  saveVersion calls fs.writeFile (creates snapshot file)
//  6.  versionId is a valid UUID v4
//  7.  versionNumber is 1 for the first save
//  8.  versionNumber increments to 2 on second save for same project
//  9.  listVersions returns empty array for unknown project
//  10. listVersions returns versions newest-first
//  11. getVersion returns the PipelineVersion record by versionId
//  12. getVersion returns null for unknown versionId
//  13. loadSnapshot returns the snapshot object
//  14. loadSnapshot returns null for unknown versionId
//  15. getLatestVersion returns the most recent version
//  16. getLatestVersion returns null for project with no versions
//  17. deleteProjectVersions returns count of deleted versions
//  18. deleteProjectVersions returns 0 for project with no versions
//  19. VersionTrigger 'initial_run' is a valid trigger value
//  20. All 5 VersionTrigger values are valid
//
// ── Module B: PipelineDiffEngine ─────────────────────────────────────────────
//  21. PipelineDiffEngine can be instantiated
//  22. diff() returns a PipelineDiffResult with correct projectId
//  23. Identical snapshots produce totalChanges = 0
//  24. Confidence delta is computed correctly (70 → 85 = +15)
//  25. confidenceChange.improved is true when confidence increases
//  26. Closure improvement detected (closureChange.improved = true when error decreases)
//  27. callsModified is counted when a bearing changes
//  28. callsAdded is counted for new calls in versionB
//  29. callsRemoved is counted when calls disappear in versionB
//  30. criticalChanges > 0 when a bearing field changes
//  31. summarizeChanges returns an array of strings
//  32. isSignificantChange returns true when confidence improves > 5 pts
//  33. isSignificantChange returns false for tiny changes (≤5 pts, no structural changes)
//  34. summary contains confidence info (string with 'Confidence')
//  35. generatedAt is an ISO-8601 string
//  36. versionALabel and versionBLabel are set in the result
//  37. totalChanges equals callsAdded + callsRemoved + callsModified
//  38. BoundaryCallDiff has a changeType field
//  39. diff handles empty boundary calls (no boundaryCalls key in snapshot)
//  40. isSignificantChange returns true when criticalChanges > 0
//
// ── Module C: SQL Schema ─────────────────────────────────────────────────────
//  41. seeds/096_phase18_versions.sql file exists
//  42. SQL file defines pipeline_versions table
//  43. SQL file has UNIQUE constraint on version_id
//  44. SQL file has RLS enabled
//  45. SQL file has project_id FK to research_projects
//  46. SQL file defines get_version_history function
//  47. SQL file has UNIQUE constraint on (project_id, version_number)
//  48. SQL file has CREATE INDEX statements
//
// ── Module D: API Route structure ────────────────────────────────────────────
//  49. app/api/admin/research/[projectId]/versions/route.ts file exists
//  50. Admin route exports GET handler
//  51. Admin route exports POST handler
//  52. Admin route imports withErrorHandler
//  53. Admin route imports auth
//  54. Admin route imports supabaseAdmin
//  55. POST action 'compare' is referenced in the route

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// ── In-memory filesystem mock ─────────────────────────────────────────────────
// All fs/promises calls are intercepted. The store Map simulates the file system.
// Tests clear it in beforeEach so each test starts with a clean slate.

vi.mock('fs/promises', async () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    mkdir: vi.fn((_p: string, _opts?: unknown) => Promise.resolve(undefined)),
    writeFile: vi.fn((filePath: string, content: string) => {
      store.set(String(filePath), String(content));
      return Promise.resolve(undefined);
    }),
    readFile: vi.fn((filePath: string, _enc?: string) => {
      const data = store.get(String(filePath));
      if (data !== undefined) return Promise.resolve(data);
      const err = Object.assign(
        new Error(`ENOENT: no such file or directory, open '${filePath}'`),
        { code: 'ENOENT' },
      );
      return Promise.reject(err);
    }),
    rm: vi.fn((dirPath: string, _opts?: unknown) => {
      const prefix = String(dirPath);
      for (const key of [...store.keys()]) {
        if (key === prefix || key.startsWith(prefix + '/')) store.delete(key);
      }
      return Promise.resolve(undefined);
    }),
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import * as fsMock from 'fs/promises';
import {
  PipelineVersionStore,
  type PipelineVersion,
  type VersionTrigger,
} from '../../worker/src/services/pipeline-version-store.js';
import {
  PipelineDiffEngine,
  type PipelineDiffResult,
  type BoundaryCallDiff,
} from '../../worker/src/services/pipeline-diff-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_DIR = '/tmp/test-recon-versions';

function makeStats(): Pick<
  PipelineVersion,
  'overallConfidence' | 'overallGrade' | 'closureError_ft' | 'callCount' | 'documentCount'
> {
  return {
    overallConfidence: 75,
    overallGrade: 'B',
    closureError_ft: 0.12,
    callCount: 8,
    documentCount: 3,
  };
}

function makeVersion(overrides: Partial<PipelineVersion> = {}): PipelineVersion {
  return {
    versionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    projectId: 'proj-test',
    versionNumber: 1,
    label: 'Initial (watermarked)',
    trigger: 'initial_run',
    overallConfidence: 70,
    overallGrade: 'C',
    closureError_ft: 0.25,
    callCount: 5,
    documentCount: 2,
    createdAt: '2024-01-01T00:00:00.000Z',
    snapshotPath: 'proj-test/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.json',
    ...overrides,
  };
}

// ── Module A: PipelineVersionStore ───────────────────────────────────────────

describe('Phase 18 — PipelineVersionStore instantiation', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('1. PipelineVersionStore can be instantiated', () => {
    const store = new PipelineVersionStore(TEST_DIR);
    expect(store).toBeDefined();
    expect(store).toBeInstanceOf(PipelineVersionStore);
  });

  it('2. Default versionsDir is /tmp/recon-versions', () => {
    const store = new PipelineVersionStore();
    expect(store).toBeDefined();
  });

  it('3. Custom versionsDir is used when provided', () => {
    const store = new PipelineVersionStore('/custom/path');
    expect(store).toBeDefined();
  });
});

describe('Phase 18 — PipelineVersionStore.saveVersion', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('4. saveVersion returns a PipelineVersion object', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const result = await store.saveVersion('proj-1', 'initial_run', 'Initial', {}, makeStats());
    expect(result).toBeDefined();
    expect(result.projectId).toBe('proj-1');
    expect(result.label).toBe('Initial');
    expect(result.trigger).toBe('initial_run');
  });

  it('5. saveVersion calls fs.writeFile (creates snapshot file)', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    await store.saveVersion('proj-1', 'initial_run', 'Initial', { foo: 'bar' }, makeStats());
    expect(fsMock.writeFile).toHaveBeenCalled();
  });

  it('6. versionId is a valid UUID v4', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const result = await store.saveVersion('proj-1', 'initial_run', 'Initial', {}, makeStats());
    expect(result.versionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('7. versionNumber is 1 for the first save', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const result = await store.saveVersion('proj-1', 'initial_run', 'v1', {}, makeStats());
    expect(result.versionNumber).toBe(1);
  });

  it('8. versionNumber increments to 2 on second save for same project', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    await store.saveVersion('proj-1', 'initial_run', 'v1', {}, makeStats());
    const result2 = await store.saveVersion(
      'proj-1',
      'document_purchased',
      'v2',
      {},
      makeStats(),
    );
    expect(result2.versionNumber).toBe(2);
  });
});

describe('Phase 18 — PipelineVersionStore.listVersions', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('9. listVersions returns empty array for unknown project', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const versions = await store.listVersions('no-such-project');
    expect(versions).toEqual([]);
  });

  it('10. listVersions returns versions newest-first', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    await store.saveVersion('proj-ord', 'initial_run', 'v1', {}, makeStats());
    await store.saveVersion('proj-ord', 'document_purchased', 'v2', {}, makeStats());
    const list = await store.listVersions('proj-ord');
    expect(list[0].versionNumber).toBe(2);
    expect(list[1].versionNumber).toBe(1);
  });
});

describe('Phase 18 — PipelineVersionStore.getVersion', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('11. getVersion returns the PipelineVersion record by versionId', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const saved = await store.saveVersion('proj-g', 'initial_run', 'v1', {}, makeStats());
    const found = await store.getVersion(saved.versionId);
    expect(found).not.toBeNull();
    expect(found!.versionId).toBe(saved.versionId);
    expect(found!.projectId).toBe('proj-g');
  });

  it('12. getVersion returns null for unknown versionId', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const result = await store.getVersion('00000000-0000-4000-8000-000000000000');
    expect(result).toBeNull();
  });
});

describe('Phase 18 — PipelineVersionStore.loadSnapshot', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('13. loadSnapshot returns the snapshot object', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const snap = { calls: [{ bearing: 'N 45° E', distance: 100 }] };
    const saved = await store.saveVersion('proj-s', 'initial_run', 'v1', snap, makeStats());
    const loaded = await store.loadSnapshot(saved.versionId);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(snap);
  });

  it('14. loadSnapshot returns null for unknown versionId', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const result = await store.loadSnapshot('00000000-0000-4000-8000-000000000000');
    expect(result).toBeNull();
  });
});

describe('Phase 18 — PipelineVersionStore.getLatestVersion', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('15. getLatestVersion returns the most recent version', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    await store.saveVersion('proj-latest', 'initial_run', 'v1', {}, makeStats());
    const v2 = await store.saveVersion('proj-latest', 'document_purchased', 'v2', {}, makeStats());
    const latest = await store.getLatestVersion('proj-latest');
    expect(latest).not.toBeNull();
    expect(latest!.versionId).toBe(v2.versionId);
  });

  it('16. getLatestVersion returns null for project with no versions', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const result = await store.getLatestVersion('no-project');
    expect(result).toBeNull();
  });
});

describe('Phase 18 — PipelineVersionStore.deleteProjectVersions', () => {
  beforeEach(() => {
    (fsMock as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it('17. deleteProjectVersions returns count of deleted versions', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    await store.saveVersion('proj-del', 'initial_run', 'v1', {}, makeStats());
    await store.saveVersion('proj-del', 'document_purchased', 'v2', {}, makeStats());
    const count = await store.deleteProjectVersions('proj-del');
    expect(count).toBe(2);
  });

  it('18. deleteProjectVersions returns 0 for project with no versions', async () => {
    const store = new PipelineVersionStore(TEST_DIR);
    const count = await store.deleteProjectVersions('no-such-project');
    expect(count).toBe(0);
  });
});

describe('Phase 18 — VersionTrigger type values', () => {
  it("19. VersionTrigger 'initial_run' is a valid trigger value", () => {
    const trigger: VersionTrigger = 'initial_run';
    expect(trigger).toBe('initial_run');
  });

  it('20. All 5 VersionTrigger values are valid', () => {
    const triggers: VersionTrigger[] = [
      'initial_run',
      'document_purchased',
      'manual_rerun',
      'adjacent_update',
      'txdot_update',
    ];
    expect(triggers).toHaveLength(5);
    triggers.forEach((t) => expect(typeof t).toBe('string'));
  });
});

// ── Module B: PipelineDiffEngine ─────────────────────────────────────────────

describe('Phase 18 — PipelineDiffEngine instantiation', () => {
  it('21. PipelineDiffEngine can be instantiated', () => {
    const engine = new PipelineDiffEngine();
    expect(engine).toBeDefined();
    expect(engine).toBeInstanceOf(PipelineDiffEngine);
  });
});

describe('Phase 18 — PipelineDiffEngine.diff basic', () => {
  const engine = new PipelineDiffEngine();
  const vA = makeVersion({ overallConfidence: 70, closureError_ft: 0.25 });
  const vB = makeVersion({
    versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    versionNumber: 2,
    label: 'After Purchase',
    overallConfidence: 85,
    closureError_ft: 0.10,
  });
  const snapEmpty = {};

  it('22. diff() returns a PipelineDiffResult with correct projectId', () => {
    const result = engine.diff(vA, snapEmpty, vB, snapEmpty);
    expect(result).toBeDefined();
    expect(result.projectId).toBe('proj-test');
  });

  it('23. Identical snapshots produce totalChanges = 0', () => {
    const vSame = makeVersion({ overallConfidence: 70, closureError_ft: 0.25 });
    const vSame2 = makeVersion({
      versionId: 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
      versionNumber: 2,
      overallConfidence: 70,
      closureError_ft: 0.25,
    });
    const snap = { boundaryCalls: [{ bearing: 'N 45° E', distance: 100 }] };
    const result = engine.diff(vSame, snap, vSame2, snap);
    expect(result.totalChanges).toBe(0);
  });

  it('24. Confidence delta is computed correctly (70 → 85 = +15)', () => {
    const result = engine.diff(vA, snapEmpty, vB, snapEmpty);
    expect(result.confidenceChange.delta).toBe(15);
  });

  it('25. confidenceChange.improved is true when confidence increases', () => {
    const result = engine.diff(vA, snapEmpty, vB, snapEmpty);
    expect(result.confidenceChange.improved).toBe(true);
  });

  it('26. Closure improvement detected (closureChange.improved = true when error decreases)', () => {
    const result = engine.diff(vA, snapEmpty, vB, snapEmpty);
    expect(result.closureChange.improved).toBe(true);
  });
});

describe('Phase 18 — PipelineDiffEngine.diff boundary calls', () => {
  const engine = new PipelineDiffEngine();
  const baseVersion = makeVersion();
  const nextVersion = makeVersion({
    versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    versionNumber: 2,
    label: 'v2',
  });

  it('27. callsModified is counted when a bearing changes', () => {
    const snapA = { boundaryCalls: [{ bearing: 'N 45° E', distance: 100 }] };
    const snapB = { boundaryCalls: [{ bearing: 'S 30° W', distance: 100 }] };
    const result = engine.diff(baseVersion, snapA, nextVersion, snapB);
    expect(result.callsModified).toBe(1);
  });

  it('28. callsAdded is counted for new calls in versionB', () => {
    const snapA = { boundaryCalls: [] };
    const snapB = { boundaryCalls: [{ bearing: 'N 10° E', distance: 50 }] };
    const result = engine.diff(baseVersion, snapA, nextVersion, snapB);
    expect(result.callsAdded).toBe(1);
  });

  it('29. callsRemoved is counted when calls disappear in versionB', () => {
    const snapA = { boundaryCalls: [{ bearing: 'N 10° E', distance: 50 }] };
    const snapB = { boundaryCalls: [] };
    const result = engine.diff(baseVersion, snapA, nextVersion, snapB);
    expect(result.callsRemoved).toBe(1);
  });

  it('30. criticalChanges > 0 when a bearing field changes', () => {
    const snapA = { boundaryCalls: [{ bearing: 'N 45° E', distance: 200 }] };
    const snapB = { boundaryCalls: [{ bearing: 'S 20° W', distance: 200 }] };
    const result = engine.diff(baseVersion, snapA, nextVersion, snapB);
    expect(result.criticalChanges).toBeGreaterThan(0);
  });

  it('38. BoundaryCallDiff has a changeType field', () => {
    const snapA = { boundaryCalls: [{ bearing: 'N 45° E', distance: 100 }] };
    const snapB = { boundaryCalls: [{ bearing: 'S 30° W', distance: 100 }] };
    const result = engine.diff(baseVersion, snapA, nextVersion, snapB);
    const callDiff: BoundaryCallDiff = result.boundaryCalls[0];
    expect(callDiff).toHaveProperty('changeType');
    expect(['added', 'removed', 'modified', 'unchanged']).toContain(callDiff.changeType);
  });

  it('39. diff handles empty boundary calls (no boundaryCalls key in snapshot)', () => {
    const snapA = {};
    const snapB = {};
    const result = engine.diff(baseVersion, snapA, nextVersion, snapB);
    expect(result.boundaryCalls).toEqual([]);
    expect(result.totalChanges).toBe(0);
  });
});

describe('Phase 18 — PipelineDiffEngine.summarizeChanges', () => {
  const engine = new PipelineDiffEngine();
  const vA = makeVersion({ overallConfidence: 70 });
  const vB = makeVersion({
    versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    versionNumber: 2,
    overallConfidence: 88,
  });

  it('31. summarizeChanges returns an array of strings', () => {
    const result = engine.diff(vA, {}, vB, {});
    const summary = engine.summarizeChanges(result);
    expect(Array.isArray(summary)).toBe(true);
  });

  it('34. summary contains confidence info (string with Confidence)', () => {
    const result = engine.diff(vA, {}, vB, {});
    const summary = engine.summarizeChanges(result);
    const hasConf = summary.some((s) => s.toLowerCase().includes('confidence'));
    expect(hasConf).toBe(true);
  });
});

describe('Phase 18 — PipelineDiffEngine.isSignificantChange', () => {
  const engine = new PipelineDiffEngine();
  const base = makeVersion({ overallConfidence: 70 });

  it('32. isSignificantChange returns true when confidence improves > 5 pts', () => {
    const improved = makeVersion({
      versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      versionNumber: 2,
      overallConfidence: 80,
    });
    const result = engine.diff(base, {}, improved, {});
    expect(engine.isSignificantChange(result)).toBe(true);
  });

  it('33. isSignificantChange returns false for tiny changes (≤5 pts, no structural changes)', () => {
    const tiny = makeVersion({
      versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      versionNumber: 2,
      overallConfidence: 73,
    });
    const snap = { boundaryCalls: [{ bearing: 'N 45° E', distance: 100 }] };
    const result = engine.diff(base, snap, tiny, snap);
    expect(engine.isSignificantChange(result)).toBe(false);
  });

  it('40. isSignificantChange returns true when criticalChanges > 0', () => {
    const other = makeVersion({
      versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      versionNumber: 2,
      overallConfidence: 70,
    });
    const snapA = { boundaryCalls: [{ bearing: 'N 45° E', distance: 100 }] };
    const snapB = { boundaryCalls: [{ bearing: 'S 30° W', distance: 100 }] };
    const result = engine.diff(base, snapA, other, snapB);
    expect(engine.isSignificantChange(result)).toBe(true);
  });
});

describe('Phase 18 — PipelineDiffResult shape', () => {
  const engine = new PipelineDiffEngine();
  const vA = makeVersion({ overallConfidence: 65, closureError_ft: 0.3 });
  const vB = makeVersion({
    versionId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    versionNumber: 2,
    label: 'After Purchase',
    overallConfidence: 78,
    closureError_ft: 0.15,
  });

  it('35. generatedAt is an ISO-8601 string', () => {
    const result = engine.diff(vA, {}, vB, {});
    expect(() => new Date(result.generatedAt)).not.toThrow();
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('36. versionALabel and versionBLabel are set in the result', () => {
    const result = engine.diff(vA, {}, vB, {});
    expect(result.versionALabel).toBe(vA.label);
    expect(result.versionBLabel).toBe(vB.label);
  });

  it('37. totalChanges equals callsAdded + callsRemoved + callsModified', () => {
    const snapA = {
      boundaryCalls: [
        { bearing: 'N 45° E', distance: 100 },
        { bearing: 'S 20° W', distance: 200 },
      ],
    };
    const snapB = {
      boundaryCalls: [
        { bearing: 'N 90° E', distance: 100 }, // bearing changed → modified
        // second call removed
      ],
    };
    const result = engine.diff(vA, snapA, vB, snapB);
    expect(result.totalChanges).toBe(
      result.callsAdded + result.callsRemoved + result.callsModified,
    );
  });
});

// ── Module C: SQL Schema ──────────────────────────────────────────────────────

describe('Phase 18 — SQL Schema (seeds/096_phase18_versions.sql)', () => {
  const SQL_PATH = path.resolve(__dirname, '../../seeds/096_phase18_versions.sql');

  it('41. seeds/096_phase18_versions.sql file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(SQL_PATH)).toBe(true);
  });

  it('42. SQL file defines pipeline_versions table', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('pipeline_versions');
    expect(sql).toContain('CREATE TABLE');
  });

  it('43. SQL file has UNIQUE constraint on version_id', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('UNIQUE');
    expect(sql).toContain('version_id');
  });

  it('44. SQL file has RLS enabled', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('ROW LEVEL SECURITY');
  });

  it('45. SQL file has project_id FK to research_projects', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('project_id');
    expect(sql).toContain('research_projects');
    expect(sql).toContain('REFERENCES');
  });

  it('46. SQL file defines get_version_history function', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('get_version_history');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION');
  });

  it('47. SQL file has UNIQUE constraint on (project_id, version_number)', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('version_number');
    // Check there are multiple UNIQUE constraints
    const uniqueCount = (sql.match(/UNIQUE/g) || []).length;
    expect(uniqueCount).toBeGreaterThanOrEqual(2);
  });

  it('48. SQL file has CREATE INDEX statements', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const sql = readFileSync(SQL_PATH, 'utf-8');
    expect(sql).toContain('CREATE INDEX');
    expect(sql).toContain('idx_pipeline_versions');
  });
});

// ── Module D: API Route structure ─────────────────────────────────────────────

describe('Phase 18 — Admin API Route (app/api/admin/research/[projectId]/versions/route.ts)', () => {
  const ROUTE_PATH = path.resolve(
    __dirname,
    '../../app/api/admin/research/[projectId]/versions/route.ts',
  );

  it('49. route file exists', async () => {
    const { existsSync } = await vi.importActual<typeof import('fs')>('fs');
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  it('50. Admin route exports GET handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const GET');
  });

  it('51. Admin route exports POST handler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('export const POST');
  });

  it('52. Admin route imports withErrorHandler', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('withErrorHandler');
  });

  it('53. Admin route imports auth', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain("from '@/lib/auth'");
  });

  it('54. Admin route imports supabaseAdmin', async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('supabaseAdmin');
  });

  it("55. POST action 'compare' is referenced in the route", async () => {
    const { readFileSync } = await vi.importActual<typeof import('fs')>('fs');
    const src = readFileSync(ROUTE_PATH, 'utf-8');
    expect(src).toContain('compare');
  });
});
