// worker/src/__tests__/storage.test.ts
//
// Tests for the document storage abstraction. Local backend runs against
// a temp directory (real fs); R2 backend runs against an injected fake
// SDK importer so we never touch a real Cloudflare account.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createDocumentStorage,
  buildStorageKey,
  StorageError,
  type DocumentStorage,
} from '../lib/storage.js';

const SAMPLE_JOB = '11111111-2222-3333-4444-555555555555';

// ── Local backend ──────────────────────────────────────────────────────────

describe('LocalDocumentStorage (end-to-end via real fs)', () => {
  let dir: string;
  let storage: DocumentStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'starr-storage-'));
    storage = createDocumentStorage({ backend: 'local', localRoot: dir });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uploads and downloads bytes round-trip', async () => {
    const bytes = Buffer.from('hello world');
    const { storageKey, size } = await storage.uploadDocument(SAMPLE_JOB, 'doc.pdf', bytes, 'application/pdf');
    expect(storageKey).toBe(`documents/${SAMPLE_JOB}/doc.pdf`);
    expect(size).toBe(bytes.byteLength);

    const back = await storage.downloadDocument(storageKey);
    expect(back.equals(bytes)).toBe(true);

    // And the file actually exists on disk.
    const onDisk = await readFile(path.resolve(dir, storageKey));
    expect(onDisk.equals(bytes)).toBe(true);
  });

  it('returns a file:// URL for getSignedUrl', async () => {
    const { storageKey } = await storage.uploadDocument(SAMPLE_JOB, 'a.txt', Buffer.from('x'), 'text/plain');
    const url = await storage.getSignedUrl(storageKey, 60);
    expect(url.startsWith('file://')).toBe(true);
    expect(url).toContain(storageKey);
  });

  it('deleteDocument is idempotent (deleting twice does not throw)', async () => {
    const { storageKey } = await storage.uploadDocument(SAMPLE_JOB, 'gone.txt', Buffer.from('x'), 'text/plain');
    await storage.deleteDocument(storageKey);
    await storage.deleteDocument(storageKey); // no-op
  });

  it('throws StorageError(not_found) for missing key on download', async () => {
    await expect(storage.downloadDocument(`documents/${SAMPLE_JOB}/missing.pdf`))
      .rejects.toMatchObject({ name: 'StorageError', code: 'not_found' });
  });

  it('rejects path traversal attempts in storage key', async () => {
    await expect(storage.downloadDocument('documents/../../etc/passwd'))
      .rejects.toMatchObject({ name: 'StorageError', code: 'invalid_key' });
    await expect(storage.deleteDocument('documents/../../etc/passwd'))
      .rejects.toMatchObject({ name: 'StorageError', code: 'invalid_key' });
  });

  it('strips path components from filename input (only basename used)', async () => {
    const { storageKey } = await storage.uploadDocument(SAMPLE_JOB, '/etc/passwd/sneaky.txt', Buffer.from('x'), 'text/plain');
    expect(storageKey).toBe(`documents/${SAMPLE_JOB}/sneaky.txt`);
  });
});

// ── buildStorageKey ────────────────────────────────────────────────────────

describe('buildStorageKey', () => {
  it('produces deterministic key from (jobId, filename)', () => {
    expect(buildStorageKey(SAMPLE_JOB, 'a.pdf'))
      .toBe(`documents/${SAMPLE_JOB}/a.pdf`);
  });
  it('replaces whitespace in filename with underscore', () => {
    expect(buildStorageKey(SAMPLE_JOB, 'has spaces.pdf'))
      .toBe(`documents/${SAMPLE_JOB}/has_spaces.pdf`);
  });
  it('rejects jobIds containing slashes or .. (traversal-shaped)', () => {
    expect(() => buildStorageKey('../etc', 'a.pdf')).toThrow(StorageError);
    expect(() => buildStorageKey('a/b', 'c.pdf')).toThrow(StorageError);
  });
  it('rejects empty filenames after sanitization', () => {
    expect(() => buildStorageKey(SAMPLE_JOB, '/')).toThrow(StorageError);
  });
});

// ── R2 backend (mocked SDK) ────────────────────────────────────────────────

describe('R2DocumentStorage (mocked AWS SDK)', () => {
  // We need to access the R2 class — it's not exported, so we exercise it
  // via the factory with STORAGE_BACKEND=r2 and a fake SDK.
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      STORAGE_BACKEND:       process.env.STORAGE_BACKEND,
      R2_BUCKET:             process.env.R2_BUCKET,
      R2_ACCOUNT_ID:         process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID:      process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY:  process.env.R2_SECRET_ACCESS_KEY,
    };
    process.env.STORAGE_BACKEND      = 'r2';
    process.env.R2_BUCKET            = 'test-bucket';
    process.env.R2_ACCOUNT_ID        = 'fake-account';
    process.env.R2_ACCESS_KEY_ID     = 'fake-key-id';
    process.env.R2_SECRET_ACCESS_KEY = 'fake-secret';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('throws invalid_config when R2 creds are missing', async () => {
    delete process.env.R2_ACCOUNT_ID;
    const storage = createDocumentStorage();
    await expect(storage.uploadDocument(SAMPLE_JOB, 'a.txt', Buffer.from('x'), 'text/plain'))
      .rejects.toMatchObject({ name: 'StorageError', code: 'invalid_config' });
  });

  it('upload sends a PutObjectCommand with the right Bucket/Key/Body', async () => {
    const { fakeSdk, sentCommands, S3ClientCtor } = makeFakeS3Sdk();
    const storage = await makeR2Storage(fakeSdk);
    const { storageKey } = await storage.uploadDocument(SAMPLE_JOB, 'a.pdf', Buffer.from('hello'), 'application/pdf');
    expect(storageKey).toBe(`documents/${SAMPLE_JOB}/a.pdf`);
    expect(S3ClientCtor).toHaveBeenCalledTimes(1);
    expect(sentCommands.length).toBe(1);
    expect(sentCommands[0]).toMatchObject({
      __cmd: 'PutObject',
      input: { Bucket: 'test-bucket', Key: `documents/${SAMPLE_JOB}/a.pdf`, ContentType: 'application/pdf' },
    });
  });

  it('download returns body bytes via transformToByteArray', async () => {
    const { fakeSdk } = makeFakeS3Sdk({
      sendImpl: async (cmd: { __cmd: string }) => {
        if (cmd.__cmd === 'GetObject') {
          return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]) } };
        }
        return {};
      },
    });
    const storage = await makeR2Storage(fakeSdk);
    const back = await storage.downloadDocument(`documents/${SAMPLE_JOB}/a.bin`);
    expect(Array.from(back)).toEqual([1, 2, 3, 4]);
  });

  it('download maps NoSuchKey errors to StorageError(not_found)', async () => {
    const { fakeSdk } = makeFakeS3Sdk({
      sendImpl: async () => {
        const err = Object.assign(new Error('not there'), { name: 'NoSuchKey' });
        throw err;
      },
    });
    const storage = await makeR2Storage(fakeSdk);
    await expect(storage.downloadDocument(`documents/${SAMPLE_JOB}/missing.pdf`))
      .rejects.toMatchObject({ name: 'StorageError', code: 'not_found' });
  });

  it('delete is idempotent on 404', async () => {
    const { fakeSdk } = makeFakeS3Sdk({
      sendImpl: async () => {
        const err = Object.assign(new Error('gone'), { $metadata: { httpStatusCode: 404 } });
        throw err;
      },
    });
    const storage = await makeR2Storage(fakeSdk);
    await expect(storage.deleteDocument(`documents/${SAMPLE_JOB}/x`)).resolves.toBeUndefined();
  });

  it('upload error propagates as StorageError(backend_error)', async () => {
    const { fakeSdk } = makeFakeS3Sdk({
      sendImpl: async () => { throw new Error('connection refused'); },
    });
    const storage = await makeR2Storage(fakeSdk);
    await expect(storage.uploadDocument(SAMPLE_JOB, 'a.txt', Buffer.from('x'), 'text/plain'))
      .rejects.toMatchObject({ name: 'StorageError', code: 'backend_error' });
  });
});

// ── Test helpers for R2 mocking ────────────────────────────────────────────

interface FakeSdkResult {
  fakeSdk: () => Promise<unknown>;
  sentCommands: Array<{ __cmd: string; input: unknown }>;
  S3ClientCtor: ReturnType<typeof vi.fn>;
}

function makeFakeS3Sdk(opts: {
  sendImpl?: (cmd: { __cmd: string; input: unknown }) => Promise<unknown>;
} = {}): FakeSdkResult {
  const sentCommands: Array<{ __cmd: string; input: unknown }> = [];
  const send = vi.fn(async (cmd: { __cmd: string; input: unknown }) => {
    sentCommands.push(cmd);
    if (opts.sendImpl) return opts.sendImpl(cmd);
    return {};
  });
  const S3ClientCtor = vi.fn(function (this: unknown, _cfg: unknown) {
    (this as { send: typeof send }).send = send;
  }) as unknown as ReturnType<typeof vi.fn>;
  const cmdFactory = (name: string) => class { __cmd = name; constructor(public input: unknown) {} };
  const sdk = {
    S3Client:            S3ClientCtor,
    PutObjectCommand:    cmdFactory('PutObject'),
    GetObjectCommand:    cmdFactory('GetObject'),
    DeleteObjectCommand: cmdFactory('DeleteObject'),
  };
  return { fakeSdk: async () => sdk, sentCommands, S3ClientCtor };
}

/**
 * Build an R2-backed storage with the SDK importer overridden. We have
 * to reach into the module to construct R2DocumentStorage with the test
 * seam — we expose a private constructor option for this purpose.
 */
async function makeR2Storage(fakeSdkLoader: () => Promise<unknown>): Promise<DocumentStorage> {
  // The exported factory does NOT take an importer override (we don't
  // want production code to have a bypass). For tests, we import the
  // R2 class via a test-only named export.
  const mod = await import('../lib/storage.js') as {
    __R2DocumentStorageForTesting: new (opts: { importerOverride: () => Promise<unknown> }) => DocumentStorage;
  };
  return new mod.__R2DocumentStorageForTesting({ importerOverride: fakeSdkLoader });
}
