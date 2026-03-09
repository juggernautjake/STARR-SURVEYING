// __tests__/recon/phase16-worker-sync.test.ts
// Unit tests for STARR RECON Phase 16: Worker Supabase Integration
//
// This covers:
//   Module A: harvest-supabase-sync.ts — Supabase sync service for worker
//     • mapDocumentType()        — maps worker DocumentType → DB enum value
//     • buildDocumentLabel()     — builds a human-readable label
//     • syncHarvestToSupabase()  — top-level sync orchestrator
//
// Tests are pure-logic/unit only — no live network calls, no real DB.
//
// Test index:
//
// ── Module A: mapDocumentType ────────────────────────────────────────────────
//  1.  maps warranty_deed → deed
//  2.  maps plat → plat
//  3.  maps amended_plat → plat
//  4.  maps easement → easement
//  5.  maps utility_easement → easement
//  6.  maps right_of_way → easement
//  7.  maps restrictive_covenant → restrictive_covenant
//  8.  maps deed_restriction → restrictive_covenant
//  9.  maps ccr → restrictive_covenant
//  10. maps oil_gas_lease → county_record
//  11. maps affidavit → county_record
//  12. maps other → other
//  13. maps unknown type → other (fallback)
//
// ── Module B: buildDocumentLabel ─────────────────────────────────────────────
//  14. produces a non-empty string
//  15. includes the document type words (title-cased)
//  16. includes the recording date when present
//  17. includes the first grantor when present
//  18. handles empty grantors gracefully
//  19. handles empty recordingDate gracefully
//
// ── Module C: syncHarvestToSupabase — no Supabase config ────────────────────
//  20. returns SyncResult with documentsInserted = 0 when Supabase not configured
//  21. returns SyncResult with imagesUploaded = 0 when Supabase not configured
//  22. returns a non-empty errors array when Supabase not configured
//  23. SyncResult has the correct shape (documentsInserted, imagesUploaded, errors)
//
// ── Module D: syncHarvestToSupabase — mocked Supabase ────────────────────────
//  24. calls supabase insert for each target document
//  25. calls supabase insert for each subdivision document
//  26. calls supabase insert for each adjacent document
//  27. inserts correct research_project_id
//  28. inserts source_type = 'property_search'
//  29. inserts correct document_type from mapDocumentType
//  30. inserts processing_status = 'pending'
//  31. documentsInserted is incremented for successful inserts
//  32. collects error for failed insert (does not throw)
//  33. skips image upload when images array is empty
//  34. skips image upload when image file does not exist on disk
//  35. uploads image when file exists on disk
//  36. back-patches storage_path and storage_url after page-1 upload
//  37. does NOT back-patch for page > 1
//  38. increments imagesUploaded count after successful upload
//  39. collects error for failed storage upload
//  40. full sync of a three-document result returns correct counts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import type { HarvestResult } from '../../worker/src/services/document-harvester.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal HarvestedDocument fixture */
function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    instrumentNumber: 'INS-001',
    documentType: 'warranty_deed' as const,
    recordingDate: '2020-03-15',
    grantors: ['Smith, John'],
    grantees: ['Jones, Mary'],
    pages: 2,
    images: [] as Array<{
      instrumentNumber: string; pageNumber: number; totalPages: number;
      imagePath: string; isWatermarked: boolean; quality: 'good' | 'fair' | 'poor';
    }>,
    isWatermarked: false,
    source: 'bell-clerk',
    purchaseAvailable: false,
    relevance: 'target' as const,
    relevanceNote: 'Target property deed',
    ...overrides,
  };
}

/** Minimal HarvestResult fixture */
function makeHarvestResult(overrides: Partial<HarvestResult> = {}): HarvestResult {
  return {
    status: 'complete',
    documents: { target: [], subdivision: [], adjacent: {} },
    documentIndex: {
      totalDocumentsFound: 0, totalPagesDownloaded: 0,
      totalPagesAvailableForPurchase: 0, estimatedPurchaseCost: 0,
      sources: [], failedSearches: 0, searchesPerformed: 0,
    },
    timing: {},
    errors: [],
    ...overrides,
  };
}

// ── Module A: mapDocumentType ─────────────────────────────────────────────────

describe('mapDocumentType()', () => {
  let mapDocumentType: (t: string) => string;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../worker/src/services/harvest-supabase-sync.js');
    mapDocumentType = mod.mapDocumentType;
  });

  it('1. maps warranty_deed → deed', () => { expect(mapDocumentType('warranty_deed')).toBe('deed'); });
  it('2. maps plat → plat', () => { expect(mapDocumentType('plat')).toBe('plat'); });
  it('3. maps amended_plat → plat', () => { expect(mapDocumentType('amended_plat')).toBe('plat'); });
  it('4. maps easement → easement', () => { expect(mapDocumentType('easement')).toBe('easement'); });
  it('5. maps utility_easement → easement', () => { expect(mapDocumentType('utility_easement')).toBe('easement'); });
  it('6. maps right_of_way → easement', () => { expect(mapDocumentType('right_of_way')).toBe('easement'); });
  it('7. maps restrictive_covenant → restrictive_covenant', () => { expect(mapDocumentType('restrictive_covenant')).toBe('restrictive_covenant'); });
  it('8. maps deed_restriction → restrictive_covenant', () => { expect(mapDocumentType('deed_restriction')).toBe('restrictive_covenant'); });
  it('9. maps ccr → restrictive_covenant', () => { expect(mapDocumentType('ccr')).toBe('restrictive_covenant'); });
  it('10. maps oil_gas_lease → county_record', () => { expect(mapDocumentType('oil_gas_lease')).toBe('county_record'); });
  it('11. maps affidavit → county_record', () => { expect(mapDocumentType('affidavit')).toBe('county_record'); });
  it('12. maps other → other', () => { expect(mapDocumentType('other')).toBe('other'); });
  it('13. unknown type falls back to other', () => { expect(mapDocumentType('totally_unknown_type')).toBe('other'); });
});

// ── Module B: buildDocumentLabel ─────────────────────────────────────────────

describe('buildDocumentLabel()', () => {
  let buildDocumentLabel: (doc: ReturnType<typeof makeDoc>) => string;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../worker/src/services/harvest-supabase-sync.js');
    buildDocumentLabel = mod.buildDocumentLabel;
  });

  it('14. returns a non-empty string', () => {
    const label = buildDocumentLabel(makeDoc());
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('15. title-cases the document type words', () => {
    const label = buildDocumentLabel(makeDoc({ documentType: 'warranty_deed' }));
    expect(label).toContain('Warranty');
    expect(label).toContain('Deed');
  });

  it('16. includes the recording date when present', () => {
    const label = buildDocumentLabel(makeDoc({ recordingDate: '2020-03-15' }));
    expect(label).toContain('2020-03-15');
  });

  it('17. includes the first grantor when present', () => {
    const label = buildDocumentLabel(makeDoc({ grantors: ['Smith, John'] }));
    expect(label).toContain('Smith, John');
  });

  it('18. handles empty grantors array gracefully', () => {
    const label = buildDocumentLabel(makeDoc({ grantors: [] }));
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('19. handles empty recordingDate gracefully', () => {
    const label = buildDocumentLabel(makeDoc({ recordingDate: '' }));
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
});

// ── Module C: syncHarvestToSupabase — no Supabase config ─────────────────────

describe('syncHarvestToSupabase() — Supabase not configured', () => {
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
  });

  it('20. documentsInserted = 0 when not configured', async () => {
    const { syncHarvestToSupabase } = await import('../../worker/src/services/harvest-supabase-sync.js');
    const result = await syncHarvestToSupabase('proj-abc', makeHarvestResult());
    expect(result.documentsInserted).toBe(0);
  });

  it('21. imagesUploaded = 0 when not configured', async () => {
    const { syncHarvestToSupabase } = await import('../../worker/src/services/harvest-supabase-sync.js');
    const result = await syncHarvestToSupabase('proj-abc', makeHarvestResult());
    expect(result.imagesUploaded).toBe(0);
  });

  it('22. errors array is non-empty when not configured', async () => {
    const { syncHarvestToSupabase } = await import('../../worker/src/services/harvest-supabase-sync.js');
    const result = await syncHarvestToSupabase('proj-abc', makeHarvestResult());
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('23. SyncResult has the correct shape', async () => {
    const { syncHarvestToSupabase } = await import('../../worker/src/services/harvest-supabase-sync.js');
    const result = await syncHarvestToSupabase('proj-abc', makeHarvestResult());
    expect(result).toHaveProperty('documentsInserted');
    expect(result).toHaveProperty('imagesUploaded');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ── Module D: syncHarvestToSupabase — mocked Supabase ────────────────────────

/** Build a mock Supabase client that records all calls */
function buildMockClient(opts: {
  insertError?: string | null;
  insertId?: string;
  uploadError?: string | null;
} = {}) {
  const storageFrom = {
    upload: vi.fn().mockImplementation(async () => {
      if (opts.uploadError) return { error: { message: opts.uploadError } };
      return { error: null };
    }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.jpg' } }),
  };

  const fromFn = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(
          opts.insertError
            ? { data: null, error: { message: opts.insertError } }
            : { data: { id: opts.insertId ?? 'row-uuid-001' }, error: null },
        ),
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  }));

  const client = { from: fromFn, storage: { from: vi.fn().mockReturnValue(storageFrom) } };
  return { client, fromFn, storageFrom };
}

// Shared variable so vi.doMock factory closures reference the current client
let _activeClient: ReturnType<typeof buildMockClient>['client'] | null = null;

/** Reset modules, inject doMock, then re-import sync function with the given mock client */
async function loadSyncWith(mock: ReturnType<typeof buildMockClient>) {
  _activeClient = mock.client;
  vi.resetModules();
  vi.doMock('@supabase/supabase-js', () => ({
    createClient: vi.fn().mockReturnValue(_activeClient),
  }));
  const { syncHarvestToSupabase } = await import('../../worker/src/services/harvest-supabase-sync.js');
  return syncHarvestToSupabase;
}

describe('syncHarvestToSupabase() — mocked Supabase', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    _activeClient = null;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('24. calls supabase.from for each target document', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-1', makeHarvestResult({ documents: { target: [makeDoc()], subdivision: [], adjacent: {} } }));
    expect(mock.fromFn).toHaveBeenCalled();
  });

  it('25. calls supabase.from for each subdivision document', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-1', makeHarvestResult({ documents: { target: [], subdivision: [makeDoc({ instrumentNumber: 'SUB-001' })], adjacent: {} } }));
    expect(mock.fromFn).toHaveBeenCalled();
  });

  it('26. calls supabase.from for each adjacent document', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-1', makeHarvestResult({ documents: { target: [], subdivision: [], adjacent: { 'adj-1': [makeDoc({ instrumentNumber: 'ADJ-001' })] } } }));
    expect(mock.fromFn).toHaveBeenCalled();
  });

  it('27. inserts correct research_project_id', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc()], subdivision: [], adjacent: {} } }));
    const insertArgs = mock.fromFn.mock.results[0]?.value?.insert?.mock?.calls?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertArgs?.research_project_id).toBe('proj-abc');
  });

  it('28. inserts source_type = property_search', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc()], subdivision: [], adjacent: {} } }));
    const insertArgs = mock.fromFn.mock.results[0]?.value?.insert?.mock?.calls?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertArgs?.source_type).toBe('property_search');
  });

  it('29. inserts correct document_type via mapDocumentType', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ documentType: 'plat' })], subdivision: [], adjacent: {} } }));
    const insertArgs = mock.fromFn.mock.results[0]?.value?.insert?.mock?.calls?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertArgs?.document_type).toBe('plat');
  });

  it('30. inserts processing_status = pending', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc()], subdivision: [], adjacent: {} } }));
    const insertArgs = mock.fromFn.mock.results[0]?.value?.insert?.mock?.calls?.[0]?.[0] as Record<string, unknown> | undefined;
    expect(insertArgs?.processing_status).toBe('pending');
  });

  it('31. documentsInserted increments for each successful insert', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    const result = await sync('proj-abc', makeHarvestResult({
      documents: { target: [makeDoc(), makeDoc({ instrumentNumber: 'INS-002' })], subdivision: [], adjacent: {} },
    }));
    expect(result.documentsInserted).toBe(2);
  });

  it('32. collects error for failed insert without throwing', async () => {
    const mock = buildMockClient({ insertError: 'FK violation' });
    const sync = await loadSyncWith(mock);
    const result = await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc()], subdivision: [], adjacent: {} } }));
    expect(result.documentsInserted).toBe(0);
    expect(result.errors.some((e) => e.includes('FK violation'))).toBe(true);
  });

  it('33. skips image upload when images array is empty', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images: [] })], subdivision: [], adjacent: {} } }));
    expect(mock.storageFrom.upload).not.toHaveBeenCalled();
  });

  it('34. skips image upload when file does not exist on disk', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    const images = [{ instrumentNumber: 'INS-001', pageNumber: 1, totalPages: 1, imagePath: '/tmp/nonexistent-12345.jpg', isWatermarked: false, quality: 'good' as const }];
    await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images })], subdivision: [], adjacent: {} } }));
    expect(mock.storageFrom.upload).not.toHaveBeenCalled();
  });

  it('35. uploads image when file exists on disk', async () => {
    const mock = buildMockClient();
    const tmpPath = path.join('/tmp', `wksync-35-${Date.now()}.jpg`);
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmpPath, Buffer.from('FAKEJPEG'));
    try {
      const sync = await loadSyncWith(mock);
      const images = [{ instrumentNumber: 'INS-001', pageNumber: 1, totalPages: 1, imagePath: tmpPath, isWatermarked: false, quality: 'good' as const }];
      await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images })], subdivision: [], adjacent: {} } }));
      expect(mock.storageFrom.upload).toHaveBeenCalledOnce();
    } finally { unlinkSync(tmpPath); }
  });

  it('36. back-patches storage_path/storage_url after page-1 upload', async () => {
    const mock = buildMockClient();
    const tmpPath = path.join('/tmp', `wksync-36-${Date.now()}.jpg`);
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmpPath, Buffer.from('FAKEJPEG'));
    try {
      const sync = await loadSyncWith(mock);
      const images = [{ instrumentNumber: 'INS-001', pageNumber: 1, totalPages: 1, imagePath: tmpPath, isWatermarked: false, quality: 'good' as const }];
      await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images })], subdivision: [], adjacent: {} } }));
      // update() should have been called to back-patch the row
      const updCalls = mock.fromFn.mock.results.flatMap(
        (r: { value?: { update?: { mock?: { calls?: unknown[][] } } } }) => r.value?.update?.mock?.calls ?? [],
      );
      expect(updCalls.length).toBeGreaterThan(0);
    } finally { unlinkSync(tmpPath); }
  });

  it('37. does NOT back-patch for page > 1', async () => {
    const mock = buildMockClient();
    const tmpPath = path.join('/tmp', `wksync-37-${Date.now()}.jpg`);
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmpPath, Buffer.from('FAKEJPEG'));
    try {
      const sync = await loadSyncWith(mock);
      const images = [{ instrumentNumber: 'INS-001', pageNumber: 2, totalPages: 3, imagePath: tmpPath, isWatermarked: false, quality: 'good' as const }];
      await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images })], subdivision: [], adjacent: {} } }));
      const updCalls = mock.fromFn.mock.results.flatMap(
        (r: { value?: { update?: { mock?: { calls?: unknown[][] } } } }) => r.value?.update?.mock?.calls ?? [],
      );
      expect(updCalls.length).toBe(0);
    } finally { unlinkSync(tmpPath); }
  });

  it('38. increments imagesUploaded after successful upload', async () => {
    const mock = buildMockClient();
    const tmpPath = path.join('/tmp', `wksync-38-${Date.now()}.jpg`);
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmpPath, Buffer.from('FAKEJPEG'));
    try {
      const sync = await loadSyncWith(mock);
      const images = [{ instrumentNumber: 'INS-001', pageNumber: 1, totalPages: 1, imagePath: tmpPath, isWatermarked: false, quality: 'good' as const }];
      const result = await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images })], subdivision: [], adjacent: {} } }));
      expect(result.imagesUploaded).toBe(1);
    } finally { unlinkSync(tmpPath); }
  });

  it('39. collects error for failed storage upload without throwing', async () => {
    const mock = buildMockClient({ uploadError: 'storage quota exceeded' });
    const tmpPath = path.join('/tmp', `wksync-39-${Date.now()}.jpg`);
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmpPath, Buffer.from('FAKEJPEG'));
    try {
      const sync = await loadSyncWith(mock);
      const images = [{ instrumentNumber: 'INS-001', pageNumber: 1, totalPages: 1, imagePath: tmpPath, isWatermarked: false, quality: 'good' as const }];
      const result = await sync('proj-abc', makeHarvestResult({ documents: { target: [makeDoc({ images })], subdivision: [], adjacent: {} } }));
      expect(result.errors.some((e) => e.includes('storage quota exceeded'))).toBe(true);
    } finally { unlinkSync(tmpPath); }
  });

  it('40. full sync of three documents returns correct counts', async () => {
    const mock = buildMockClient();
    const sync = await loadSyncWith(mock);
    const result = await sync('proj-xyz', makeHarvestResult({
      documents: {
        target:      [makeDoc({ instrumentNumber: 'INS-001' })],
        subdivision: [makeDoc({ instrumentNumber: 'INS-002' })],
        adjacent:    { 'adj-1': [makeDoc({ instrumentNumber: 'ADJ-001' })] },
      },
    }));
    expect(result.documentsInserted).toBe(3);
    expect(result.imagesUploaded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
