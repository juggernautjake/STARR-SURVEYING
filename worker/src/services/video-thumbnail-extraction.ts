/**
 * Video thumbnail extraction worker — Batch GG, F4 closer.
 *
 * Closes the F4 deferral *"server-side thumbnail extraction (FFmpeg
 * via worker) so the gallery thumbnail isn't a placeholder."* Polls
 * field_media rows captured by `useAttachVideo` (mobile inserts
 * with `thumbnail_extraction_status='queued'`), runs ffmpeg to grab
 * a poster frame, uploads the JPEG to the photo bucket, and writes
 * `thumbnail_url` back. The mobile + admin video grids already
 * render whatever's in `thumbnail_url` — this worker just fills it.
 *
 * Mirrors the receipt-extraction + voice-transcription patterns:
 *   - claimRow: race-safe UPDATE flips queued → running so two
 *     workers can't double-process the same row.
 *   - markDone: writes thumbnail_url + thumbnail_extraction_status='done'.
 *   - markFailed: truncated error in thumbnail_extraction_error;
 *     status flips to 'failed' so the mobile UI shows the placeholder
 *     glyph instead of looping forever.
 *   - Watchdog: rows stuck in 'running' past STALE_RUNNING_MS get
 *     re-queued at the start of the next batch.
 *
 * Cost model: ffmpeg-static binary spawn is essentially free (no
 * external API). Storage read + write is the only real cost; per
 * video that's one download (the same bytes already in storage)
 * + one small JPEG upload (~30 KB).
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
// ffmpeg-static ships a prebuilt static binary — no host dep needed.
// The default export is the absolute path to the binary; null when
// the package failed to download for the current platform during
// install (we treat that as a hard failure at runtime so the worker
// surfaces the misconfig instead of silently dropping every row).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — ffmpeg-static has no TS types in this version.
import ffmpegPath from 'ffmpeg-static';

const VIDEO_BUCKET = 'starr-field-videos';
const PHOTO_BUCKET = 'starr-field-photos';
/** Skip videos over this size — ffmpeg-static can technically handle
 *  multi-GB inputs, but the worker container's RAM + tempdir budget
 *  prefers we cap. Surveyor videos cap at 5 min @ 0.7 quality, which
 *  in practice lands ≪ 200 MB. */
const MAX_BYTES = 200 * 1024 * 1024;
/** Per-video ffmpeg wall-clock cap. A frame extract should take
 *  <2 s; if it doesn't, the input is malformed or the disk is
 *  thrashed and we'd rather fail fast + retry than hold the worker
 *  hostage. */
const FFMPEG_TIMEOUT_MS = 30_000;
/** How long a 'running' claim is allowed to sit before the watchdog
 *  re-queues it. Five minutes is generous against typical extracts
 *  taking <2 s. */
const STALE_RUNNING_MS = 5 * 60 * 1000;

interface ThumbRow {
  id: string;
  job_id: string | null;
  data_point_id: string | null;
  storage_url: string;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  thumbnail_extraction_status: string | null;
  thumbnail_extraction_started_at: string | null;
}

export interface ProcessLogger {
  info(msg: string, fields: Record<string, unknown>): void;
  warn(msg: string, fields: Record<string, unknown>): void;
  error(msg: string, err: unknown, fields: Record<string, unknown>): void;
}

const consoleLogger: ProcessLogger = {
  info: (msg, f) =>
    console.log(JSON.stringify({ level: 'info', svc: 'video-thumb', msg, ...f })),
  warn: (msg, f) =>
    console.warn(JSON.stringify({ level: 'warn', svc: 'video-thumb', msg, ...f })),
  error: (msg, err, f) =>
    console.error(
      JSON.stringify({
        level: 'error',
        svc: 'video-thumb',
        msg,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        ...f,
      })
    ),
};

export interface VideoThumbResult {
  mediaId: string;
  status: 'done' | 'failed' | 'skipped';
  thumbnailUrl?: string;
  bytes?: number;
  error?: string;
}

export interface VideoThumbBatchSummary {
  total: number;
  done: number;
  failed: number;
  skipped: number;
  results: VideoThumbResult[];
}

// ── Top-level batch ──────────────────────────────────────────────────────────

/**
 * Process up to `batchSize` queued thumbnail-extraction rows. Returns
 * a per-row summary so the CLI can emit a one-line stats banner.
 *
 * Watchdog: before claiming new rows we re-queue any 'running' rows
 * whose `thumbnail_extraction_started_at` is older than
 * STALE_RUNNING_MS — covers crashed workers + container restarts.
 */
export async function processVideoThumbnailBatch(
  supabase: SupabaseClient,
  options: { batchSize?: number; logger?: ProcessLogger } = {}
): Promise<VideoThumbBatchSummary> {
  const logger = options.logger ?? consoleLogger;
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 5));

  await sweepStaleRunningRows(supabase, logger);

  const { data, error } = await supabase
    .from('field_media')
    .select(
      'id, job_id, data_point_id, storage_url, file_size_bytes, ' +
        'duration_seconds, thumbnail_extraction_status, ' +
        'thumbnail_extraction_started_at'
    )
    .eq('media_type', 'video')
    .eq('upload_state', 'done')
    .eq('thumbnail_extraction_status', 'queued')
    .order('created_at', { ascending: true })
    .limit(batchSize);
  if (error) throw error;
  // Cast through `unknown` — Supabase's `data` union includes the
  // GenericStringError shape that TS2352 refuses to overlap with
  // ThumbRow without an explicit unknown bounce. The select column
  // list above is the source of truth for the row shape.
  const rows = (data ?? []) as unknown as ThumbRow[];

  const results: VideoThumbResult[] = [];
  for (const row of rows) {
    results.push(await processOne(supabase, row, logger));
  }

  return {
    total: rows.length,
    done: results.filter((r) => r.status === 'done').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  };
}

async function processOne(
  supabase: SupabaseClient,
  row: ThumbRow,
  logger: ProcessLogger
): Promise<VideoThumbResult> {
  const startedAt = new Date().toISOString();
  const claimed = await claimRow(supabase, row.id, startedAt, logger);
  if (!claimed) {
    return { mediaId: row.id, status: 'skipped' };
  }

  // Hard size guard — skip the row outright with a clear message so
  // the bookkeeper sees why a giant video has no thumb.
  if (row.file_size_bytes != null && row.file_size_bytes > MAX_BYTES) {
    await markFailed(
      supabase,
      row.id,
      `Video over ${Math.floor(MAX_BYTES / 1024 / 1024)} MB — thumbnail extraction skipped.`,
      logger
    );
    return {
      mediaId: row.id,
      status: 'failed',
      error: 'over_size_cap',
      bytes: row.file_size_bytes ?? undefined,
    };
  }

  // Per the storage RLS convention from seeds/221: storage paths
  // start with the owner's user_id segment. Re-use that segment for
  // the thumb so the photo bucket's RLS aligns with the source.
  const userId = (row.storage_url.split('/')[0] ?? '').trim();
  if (!userId) {
    await markFailed(
      supabase,
      row.id,
      `Video storage_url has no user-id prefix: ${row.storage_url}`,
      logger
    );
    return {
      mediaId: row.id,
      status: 'failed',
      error: 'bad_storage_url',
    };
  }

  let videoTmpPath: string | null = null;
  let thumbTmpPath: string | null = null;
  try {
    // 1. Download the source video to a tempfile. ffmpeg's stdin
    //    mode would let us avoid the disk hop, but the file-input
    //    path is more reliable across container OS variants and
    //    only adds ~50 ms for typical sizes.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-thumb-'));
    videoTmpPath = path.join(tmpDir, 'in.mp4');
    thumbTmpPath = path.join(tmpDir, 'out.jpg');

    const { data: dlData, error: dlErr } = await supabase.storage
      .from(VIDEO_BUCKET)
      .download(row.storage_url);
    if (dlErr || !dlData) {
      throw new Error(`storage download: ${dlErr?.message ?? 'no data'}`);
    }
    const buf = Buffer.from(await dlData.arrayBuffer());
    await fs.writeFile(videoTmpPath, buf);

    // 2. Pick a seek timestamp. 1.0 s gets past most fade-in
    //    intros; on very short clips (< 1.5 s reported by the
    //    picker), grab the first frame instead.
    const seekSec =
      row.duration_seconds != null && row.duration_seconds < 1.5
        ? 0
        : 1;

    // 3. Spawn ffmpeg. -ss BEFORE -i is fast-seek; -frames:v 1
    //    grabs exactly one frame; -q:v 4 is JPEG quality (1=best,
    //    31=worst) tuned for tile thumbnails. The output sizes to
    //    640px on the long axis to stay light.
    await runFfmpeg(
      [
        '-y', // overwrite if exists (shouldn't, but safe)
        '-ss',
        String(seekSec),
        '-i',
        videoTmpPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-2', // -2 = preserve aspect ratio, even height
        '-q:v',
        '4',
        thumbTmpPath,
      ],
      FFMPEG_TIMEOUT_MS
    );

    const thumbBuf = await fs.readFile(thumbTmpPath);
    if (thumbBuf.length === 0) {
      throw new Error('ffmpeg produced an empty thumbnail');
    }

    // 4. Upload the JPEG. Path mirrors the source video except
    //    the bucket + suffix.
    const thumbPath = `${userId}/${row.id}-thumb.jpg`;
    const { error: upErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(thumbPath, thumbBuf, {
        contentType: 'image/jpeg',
        upsert: true, // re-extracts (rare) overwrite cleanly
      });
    if (upErr) throw new Error(`storage upload: ${upErr.message}`);

    // 5. Write the path back + flip status.
    const writeErr = await markDone(supabase, row.id, thumbPath);
    if (writeErr) throw new Error(`markDone: ${writeErr}`);

    logger.info('done', {
      media_id: row.id,
      thumb_bytes: thumbBuf.length,
      seek_sec: seekSec,
    });
    return {
      mediaId: row.id,
      status: 'done',
      thumbnailUrl: thumbPath,
      bytes: thumbBuf.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('extract failed', err, {
      media_id: row.id,
      storage_url: row.storage_url,
    });
    await markFailed(supabase, row.id, msg, logger);
    return { mediaId: row.id, status: 'failed', error: msg };
  } finally {
    // Best-effort cleanup. We use mkdtemp so each row gets its own
    // directory; rm-r-f is safe here.
    if (videoTmpPath) {
      const dir = path.dirname(videoTmpPath);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }
}

// ── ffmpeg spawn helper ─────────────────────────────────────────────────────

/** Spawn ffmpeg with a wall-clock timeout. Resolves when ffmpeg
 *  exits cleanly (code 0). Rejects on non-zero exit, timeout, or
 *  spawn error. Captures stderr for the rejection message — ffmpeg
 *  writes its real error there. */
function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg-static binary path not resolved'));
      return;
    }
    const child = spawn(ffmpegPath as string, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      // ffmpeg can emit a lot of progress lines; cap the buffer so a
      // pathological input doesn't OOM the worker.
      if (stderr.length < 4096) stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg exited ${code}${stderr ? `: ${stderr.slice(-500)}` : ''}`
          )
        );
      }
    });
  });
}

// ── Watchdog ────────────────────────────────────────────────────────────────

async function sweepStaleRunningRows(
  supabase: SupabaseClient,
  logger: ProcessLogger
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('field_media')
    .update({
      thumbnail_extraction_status: 'queued',
      thumbnail_extraction_started_at: null,
    })
    .eq('thumbnail_extraction_status', 'running')
    .lt('thumbnail_extraction_started_at', cutoff)
    .select('id');
  if (error) {
    logger.warn('sweepStale failed', { error: error.message });
    return;
  }
  if (data && data.length > 0) {
    logger.info('sweepStale re-queued', { count: data.length });
  }
}

// ── Claim / mark done / mark failed ─────────────────────────────────────────

async function claimRow(
  supabase: SupabaseClient,
  mediaId: string,
  startedAt: string,
  logger: ProcessLogger
): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('field_media')
      .update({
        thumbnail_extraction_status: 'running',
        thumbnail_extraction_started_at: startedAt,
      })
      .eq('id', mediaId)
      .eq('thumbnail_extraction_status', 'queued')
      .select('id')
      .single();
    if (error) {
      // PGRST116 = "no rows" — typical lost-race, not an error.
      if (error.code !== 'PGRST116') {
        logger.warn('claim failed', {
          media_id: mediaId,
          error: error.message,
        });
      }
      return false;
    }
    return !!data;
  } catch (err) {
    logger.warn('claim threw', {
      media_id: mediaId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

async function markDone(
  supabase: SupabaseClient,
  mediaId: string,
  thumbnailUrl: string
): Promise<string | null> {
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('field_media')
    .update({
      thumbnail_url: thumbnailUrl,
      thumbnail_extraction_status: 'done',
      thumbnail_extraction_completed_at: nowIso,
      thumbnail_extraction_error: null,
    })
    .eq('id', mediaId);
  return error?.message ?? null;
}

async function markFailed(
  supabase: SupabaseClient,
  mediaId: string,
  errorMessage: string,
  logger: ProcessLogger
): Promise<void> {
  const nowIso = new Date().toISOString();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('field_media')
      .update({
        thumbnail_extraction_status: 'failed',
        thumbnail_extraction_error: errorMessage.slice(0, 2000),
        thumbnail_extraction_completed_at: nowIso,
      })
      .eq('id', mediaId);
    if (error) {
      logger.warn('markFailed write failed', {
        media_id: mediaId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn('markFailed threw', {
      media_id: mediaId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
