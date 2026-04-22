// worker/src/lib/storage.ts
//
// Provider-agnostic document storage abstraction. Currently supports a
// local-filesystem backend (default, what we run today) and a
// Cloudflare R2 backend (Phase A integration prep — not yet activated
// in production).
//
// ── Side-by-side with artifact-uploader.ts ────────────────────────────────
//
// `worker/src/services/artifact-uploader.ts` already exists and writes
// pipeline screenshots / harvest artifacts to **Supabase Storage**. That
// service stays put — we deliberately do NOT migrate its call sites in
// this PR. Reasons:
//
//   1. The Supabase storage bucket layout is intertwined with the
//      report-share service signing scheme. Migrating it requires
//      coordinated rewrites of share-link generation, RLS policies,
//      and the artifact reader on the Next.js side.
//   2. A side-by-side abstraction means new code (Phase A integrations:
//      CapSolver evidence frames, Browserbase session recordings, R2
//      lifecycle-managed scrape artifacts) can use storage.ts from day
//      one without disturbing the existing critical path.
//   3. The eventual migration of artifact-uploader.ts → storage.ts is
//      tracked in `docs/planning/in-progress/PHASE_A_INTEGRATION_PREP.md`
//      under "Storage abstraction unification (future PR)".
//
// Until that migration lands, the rule is:
//
//   * NEW writes  →  storage.ts
//   * Existing artifact-uploader.ts call sites → unchanged
//
// Both can coexist in the same job's output set — they use disjoint key
// namespaces (artifact-uploader keys are `pipeline-artifacts/<jobId>/…`,
// storage.ts keys are `documents/<jobId>/<filename>`).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

// We type-only-import the S3 client surface we use; the runtime import
// is dynamic and routed through a variable so root tsc never tries to
// resolve the SDK from the repo root (matches the pattern used in
// browser-factory.ts for @browserbasehq/sdk).
import type {
  S3Client as S3ClientType,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';

// ── Types ──────────────────────────────────────────────────────────────────

export type StorageBackend = 'local' | 'r2';

export interface StorageOptions {
  /** Override backend selection. Defaults to env-driven. */
  backend?: StorageBackend;
  /** Local backend root. Defaults to ./storage. */
  localRoot?: string;
}

export interface UploadResult {
  /** Provider-agnostic key — pass back to download/getSignedUrl/delete. */
  storageKey: string;
  /** Bytes written. */
  size: number;
}

/**
 * Errors raised by storage operations. `code` is stable for caller
 * branching; `cause` is the underlying SDK / fs error (for logs).
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'invalid_key'
      | 'invalid_config'
      | 'backend_error',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface DocumentStorage {
  readonly backend: StorageBackend;

  /**
   * Upload bytes for a document. Storage key is derived deterministically
   * from (jobId, filename) so the same logical document always lands at
   * the same key — uploads are idempotent.
   */
  uploadDocument(
    jobId: string,
    filename: string,
    bytes: Buffer | Uint8Array,
    contentType: string,
  ): Promise<UploadResult>;

  /** Read bytes back from storage. Throws StorageError(not_found) if missing. */
  downloadDocument(storageKey: string): Promise<Buffer>;

  /**
   * Generate a short-lived URL the browser can fetch directly. For local
   * mode this returns a `file://` URL purely for development convenience
   * (the web UI never resolves these — local mode is for tests + dev).
   */
  getSignedUrl(storageKey: string, ttlSeconds: number): Promise<string>;

  /** Delete a single document. No-ops gracefully if the object is gone. */
  deleteDocument(storageKey: string): Promise<void>;
}

/**
 * Factory. Reads STORAGE_BACKEND, R2_* env vars. Memoization is the
 * caller's responsibility — typical use is one instance per worker boot.
 */
export function createDocumentStorage(opts: StorageOptions = {}): DocumentStorage {
  const backend = opts.backend ?? resolveBackend();
  if (backend === 'local') {
    const root = opts.localRoot ?? process.env.STORAGE_LOCAL_ROOT ?? './storage';
    console.log(`[storage] backend=local root=${root}`);
    return new LocalDocumentStorage(root);
  }
  console.log(`[storage] backend=r2 bucket=${process.env.R2_BUCKET ?? '(unset!)'}`);
  return new R2DocumentStorage();
}

// ── Key namespace ──────────────────────────────────────────────────────────

const KEY_REGEX = /^[A-Za-z0-9._\-/]+$/;

/**
 * Build a storage key from (jobId, filename). Both modes use this so
 * keys are identical regardless of backend — switching STORAGE_BACKEND
 * doesn't move documents around within a job.
 */
export function buildStorageKey(jobId: string, filename: string): string {
  if (!jobId || jobId.includes('/') || jobId.includes('..')) {
    throw new StorageError(`invalid jobId: ${jobId}`, 'invalid_key');
  }
  // Strip any path components from filename — only the basename is used.
  const safe = path.basename(filename).replace(/\s+/g, '_');
  if (!safe || !KEY_REGEX.test(safe)) {
    throw new StorageError(`invalid filename: ${filename}`, 'invalid_key');
  }
  return `documents/${jobId}/${safe}`;
}

// ── Local backend ──────────────────────────────────────────────────────────

class LocalDocumentStorage implements DocumentStorage {
  readonly backend = 'local' as const;

  constructor(private readonly root: string) {}

  async uploadDocument(jobId: string, filename: string, bytes: Buffer | Uint8Array): Promise<UploadResult> {
    const key  = buildStorageKey(jobId, filename);
    const full = this.toAbsPath(key);
    const start = Date.now();
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes);
    console.log(`[storage:local] upload ok jobId=${jobId} key=${key} bytes=${bytes.byteLength} (${Date.now() - start}ms)`);
    return { storageKey: key, size: bytes.byteLength };
  }

  async downloadDocument(storageKey: string): Promise<Buffer> {
    this.assertSafeKey(storageKey);
    const start = Date.now();
    try {
      const buf = await fs.readFile(this.toAbsPath(storageKey));
      console.log(`[storage:local] download ok key=${storageKey} bytes=${buf.byteLength} (${Date.now() - start}ms)`);
      return buf;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`[storage:local] download miss key=${storageKey}`);
        throw new StorageError(`document not found: ${storageKey}`, 'not_found', err);
      }
      console.warn(`[storage:local] download error key=${storageKey} ${(err as Error).message}`);
      throw new StorageError(`local read failed: ${storageKey}`, 'backend_error', err);
    }
  }

  async getSignedUrl(storageKey: string, _ttlSeconds: number): Promise<string> {
    // Local mode — return a file:// URL. Real signed URLs are R2-only.
    this.assertSafeKey(storageKey);
    return `file://${this.toAbsPath(storageKey)}`;
  }

  async deleteDocument(storageKey: string): Promise<void> {
    this.assertSafeKey(storageKey);
    try {
      await fs.unlink(this.toAbsPath(storageKey));
      console.log(`[storage:local] delete ok key=${storageKey}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // idempotent
      console.warn(`[storage:local] delete error key=${storageKey} ${(err as Error).message}`);
      throw new StorageError(`local delete failed: ${storageKey}`, 'backend_error', err);
    }
  }

  private toAbsPath(key: string): string {
    // path.resolve normalizes; assertSafeKey already checked for traversal.
    return path.resolve(this.root, key);
  }

  private assertSafeKey(key: string): void {
    if (!KEY_REGEX.test(key) || key.includes('..')) {
      throw new StorageError(`unsafe storage key: ${key}`, 'invalid_key');
    }
  }
}

// ── R2 backend ─────────────────────────────────────────────────────────────

class R2DocumentStorage implements DocumentStorage {
  readonly backend = 'r2' as const;

  /** Memoized per-instance — avoid re-importing the SDK on every call. */
  private clientPromise?: Promise<S3ClientType>;

  /** Test seam: replace the SDK importer. */
  private importerOverride?: () => Promise<unknown>;

  constructor(opts?: { importerOverride?: () => Promise<unknown> }) {
    this.importerOverride = opts?.importerOverride;
  }

  async uploadDocument(
    jobId: string,
    filename: string,
    bytes: Buffer | Uint8Array,
    contentType: string,
  ): Promise<UploadResult> {
    const key    = buildStorageKey(jobId, filename);
    const start  = Date.now();
    const client = await this.getClient();
    const { PutObjectCommand } = await this.loadSdk() as {
      PutObjectCommand: new (input: PutObjectCommandInput) => unknown;
    };
    try {
      const cmd = new PutObjectCommand({
        Bucket: this.bucket(),
        Key:    key,
        Body:   bytes,
        ContentType: contentType,
      }) as Parameters<S3ClientType['send']>[0];
      await client.send(cmd);
      console.log(`[storage:r2] upload ok jobId=${jobId} key=${key} bytes=${bytes.byteLength} contentType=${contentType} (${Date.now() - start}ms)`);
    } catch (err) {
      console.warn(`[storage:r2] upload failed key=${key} (${Date.now() - start}ms): ${(err as Error).message}`);
      throw new StorageError(`R2 upload failed: ${key}`, 'backend_error', err);
    }
    return { storageKey: key, size: bytes.byteLength };
  }

  async downloadDocument(storageKey: string): Promise<Buffer> {
    const start  = Date.now();
    const client = await this.getClient();
    const { GetObjectCommand } = await this.loadSdk() as {
      GetObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
    };
    try {
      const cmd = new GetObjectCommand({ Bucket: this.bucket(), Key: storageKey }) as Parameters<S3ClientType['send']>[0];
      // Cast: the SDK's GetObjectCommandOutput's Body type unifies many transports.
      const out = await client.send(cmd) as { Body?: unknown };
      if (!out.Body) {
        throw new StorageError(`R2 download returned empty body: ${storageKey}`, 'backend_error');
      }
      const buf = await streamToBuffer(out.Body);
      console.log(`[storage:r2] download ok key=${storageKey} bytes=${buf.byteLength} (${Date.now() - start}ms)`);
      return buf;
    } catch (err) {
      if (isNotFoundError(err)) {
        console.warn(`[storage:r2] download miss key=${storageKey}`);
        throw new StorageError(`document not found: ${storageKey}`, 'not_found', err);
      }
      if (err instanceof StorageError) throw err;
      console.warn(`[storage:r2] download failed key=${storageKey} (${Date.now() - start}ms): ${(err as Error).message}`);
      throw new StorageError(`R2 download failed: ${storageKey}`, 'backend_error', err);
    }
  }

  async getSignedUrl(storageKey: string, ttlSeconds: number): Promise<string> {
    const client = await this.getClient();
    const { GetObjectCommand } = await this.loadSdk() as {
      GetObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
    };
    // Presigner is a separate dynamic import.
    const presignerSpecifier = '@aws-sdk/s3-request-presigner';
    const { getSignedUrl } = await import(presignerSpecifier) as {
      getSignedUrl: (client: S3ClientType, command: unknown, options: { expiresIn: number }) => Promise<string>;
    };
    const cmd = new GetObjectCommand({ Bucket: this.bucket(), Key: storageKey });
    const url = await getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
    console.log(`[storage:r2] signed url issued key=${storageKey} ttl=${ttlSeconds}s`);
    return url;
  }

  async deleteDocument(storageKey: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await this.loadSdk() as {
      DeleteObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
    };
    try {
      const cmd = new DeleteObjectCommand({ Bucket: this.bucket(), Key: storageKey }) as Parameters<S3ClientType['send']>[0];
      await client.send(cmd);
      console.log(`[storage:r2] delete ok key=${storageKey}`);
    } catch (err) {
      if (isNotFoundError(err)) return; // idempotent
      console.warn(`[storage:r2] delete failed key=${storageKey}: ${(err as Error).message}`);
      throw new StorageError(`R2 delete failed: ${storageKey}`, 'backend_error', err);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private bucket(): string {
    const b = process.env.R2_BUCKET;
    if (!b) throw new StorageError('R2_BUCKET is not set', 'invalid_config');
    return b;
  }

  private async loadSdk(): Promise<unknown> {
    if (this.importerOverride) return this.importerOverride();
    // Variable indirection so root tsc doesn't try to resolve the SDK
    // from the repo root context (worker has it; root does not).
    const sdkSpecifier = '@aws-sdk/client-s3';
    return import(sdkSpecifier);
  }

  private getClient(): Promise<S3ClientType> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      const accountId       = process.env.R2_ACCOUNT_ID;
      const accessKeyId     = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      if (!accountId || !accessKeyId || !secretAccessKey) {
        const missing = [
          !accountId && 'R2_ACCOUNT_ID',
          !accessKeyId && 'R2_ACCESS_KEY_ID',
          !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
        ].filter(Boolean).join(', ');
        console.error(`[storage:r2] cannot init client — missing env vars: ${missing}`);
        throw new StorageError(
          'R2 backend requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY',
          'invalid_config',
        );
      }
      const sdk = await this.loadSdk() as {
        S3Client: new (cfg: Record<string, unknown>) => S3ClientType;
      };
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
      console.log(`[storage:r2] S3 client initialised endpoint=${endpoint} bucket=${process.env.R2_BUCKET ?? '(unset!)'} accessKeyId=${accessKeyId.slice(0, 4)}…`);
      // R2 endpoint pattern: https://<accountId>.r2.cloudflarestorage.com
      // R2 ignores region but the SDK requires one — 'auto' is the documented value.
      return new sdk.S3Client({
        region:   'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
      });
    })();
    return this.clientPromise;
  }
}

// ── Resolver ───────────────────────────────────────────────────────────────

function resolveBackend(): StorageBackend {
  const env = (process.env.STORAGE_BACKEND ?? '').toLowerCase();
  if (env === 'r2' || env === 'local') return env;
  return 'local';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
  if (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey') return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  // R2 / S3 returns a Web ReadableStream in modern AWS SDK; fall back to
  // Node's Readable + arrayBuffer interface as needed.
  if (body instanceof Uint8Array) return Buffer.from(body);
  const maybeWebStream = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeWebStream.transformToByteArray === 'function') {
    return Buffer.from(await maybeWebStream.transformToByteArray());
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new StorageError('R2 download body in unsupported shape', 'backend_error');
}

// Test-only export so unit tests can construct an R2 storage with an
// injected SDK importer (avoiding any real network use). NOT for
// production callers — use createDocumentStorage() instead.
export { R2DocumentStorage as __R2DocumentStorageForTesting };
