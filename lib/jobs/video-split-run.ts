// lib/jobs/video-split-run.ts — actually cutting the video (or audio), in the browser.
//
// The plan lives next door in `video-split.ts` and is pure. This is the half that needs a real
// container muxer, and it is deliberately isolated so nothing else in the app imports ffmpeg.
//
// ── WHY FFMPEG AND NOT A BYTE SLICE ─────────────────────────────────────────────────────────────
//
// Repeating the point from the plan module because it is the thing somebody will be tempted to
// "simplify" later: an MP4/MOV keeps its index (`moov`) in one place and interleaves samples
// against it. `file.slice(a, b)` gives you parts that upload fine and cannot be opened. This runs
// ffmpeg with `-c copy`, which rewrites each part's container while copying the audio and video
// streams untouched — no re-encode, no quality loss, and it runs at IO speed rather than the many
// minutes an encode would take.
//
// ── WHY IT IS LOADED LAZILY ─────────────────────────────────────────────────────────────────────
//
// The core is ~31 MB of WebAssembly. Almost every upload is under the limit and needs none of it,
// so it is imported only at the moment a split is actually going to happen. Nobody pays for this
// while attaching a PDF.
//
// ── THE INPUT IS READ FROM DISK, NOT COPIED INTO MEMORY (2026-10-06) ────────────────────────────
//
// Owner, 2026-10-06: "I have multiple videos over 5 minutes that do not seem to be able to be
// uploaded or even split up." The first version wrote the whole file into ffmpeg's in-memory file
// system and cut every part in one pass, so a 600 MB iPhone video needed the 600 MB input, the
// 600 MB of output and the working copies all in WebAssembly memory at once — well past what a
// browser tab is given, and it died as an out-of-memory abort. iPhone HDR video runs about 93 MB a
// minute, so that was every video over about five minutes: exactly what the owner saw.
//
// Now the file is MOUNTED (WORKERFS): ffmpeg reads the bytes it needs straight from the File on
// disk, and nothing is copied in. Each part is cut by its own run, read out, handed to the caller,
// and deleted before the next one starts — so the peak is one part, not the whole recording. The
// container is kept (a .MOV stays a .MOV) because copying HEVC into a different container is where
// Apple players get fussy.

import { partName, type SplitPart } from './video-split';

export interface SplitProgress {
  part: number;
  total: number;
  /** 0–100 within the current part. */
  pct: number;
}

/**
 * Read a video's (or audio file's) duration without decoding it, using the browser's own demuxer.
 *
 * The plan needs a duration and the file does not carry one anywhere reachable from JavaScript.
 * A media element pointed at a blob URL will report it once metadata is parsed — a few hundred
 * kilobytes of read, not the whole file.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    el.preload = 'metadata';
    const done = (v: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 15000);
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** Same thing, named for what it now measures. */
export const readMediaDuration = readVideoDuration;

interface Ffmpeg {
  writeFile: (n: string, d: Uint8Array) => Promise<unknown>;
  readFile: (n: string) => Promise<Uint8Array | string>;
  deleteFile: (n: string) => Promise<unknown>;
  createDir: (p: string) => Promise<unknown>;
  mount: (type: string, opts: { files: File[] }, at: string) => Promise<unknown>;
  unmount: (at: string) => Promise<unknown>;
  exec: (args: string[]) => Promise<number>;
  on: (ev: string, cb: (e: { progress: number }) => void) => void;
  off: (ev: string, cb: (e: { progress: number }) => void) => void;
}

let ffmpegPromise: Promise<Ffmpeg> | null = null;

async function loadFfmpeg(): Promise<Ffmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const ffmpeg = new FFmpeg();
      const base = '/ffmpeg';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return ffmpeg as unknown as Ffmpeg;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

export interface SplitOutcome {
  ok: boolean;
  files?: File[];
  error?: string;
}

/** The ffmpeg arguments for one part. Pure, so the cut is tested without the wasm. */
export function partArgs(input: string, part: SplitPart, output: string, isLast: boolean): string[] {
  return [
    // Seek on the input side: fast (no decode), lands on the keyframe at or before the start.
    '-ss', String(part.startSec),
    '-i', input,
    // The last part runs to the end, so a rounding error can never drop the final second.
    ...(isLast ? [] : ['-t', String(part.durationSec)]),
    // Video and audio only — iPhone files carry timecode and metadata tracks that some containers
    // refuse to copy.
    '-map', '0:v?', '-map', '0:a?',
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    output,
  ];
}

/**
 * Cut `file` into the parts the plan describes, and hand back real `File` objects the ordinary
 * upload path can take — so splitting changes nothing downstream. `onPart` receives each part the
 * moment it exists, for callers that want to start uploading before the last one is cut.
 */
export async function splitVideo(
  file: File,
  parts: SplitPart[],
  onProgress?: (p: SplitProgress) => void,
  onPart?: (f: File, index: number, total: number) => void,
): Promise<SplitOutcome> {
  if (parts.length === 0) return { ok: false, error: 'Nothing to split.' };
  const mountAt = '/in';
  let mounted = false;
  let ffmpeg: Ffmpeg | null = null;
  const total = parts.length;
  let current = 1;
  const progress = (e: { progress: number }) =>
    onProgress?.({ part: current, total, pct: Math.max(0, Math.min(100, Math.round((e.progress ?? 0) * 100))) });

  try {
    ffmpeg = await loadFfmpeg();
    const dot = file.name.lastIndexOf('.');
    const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : '.mp4';
    await ffmpeg.createDir(mountAt).catch(() => undefined);
    await ffmpeg.mount('WORKERFS', { files: [file] }, mountAt);
    mounted = true;
    const input = `${mountAt}/${file.name}`;
    ffmpeg.on('progress', progress);

    const out: File[] = [];
    for (const part of parts) {
      current = part.index;
      onProgress?.({ part: current, total, pct: 0 });
      const name = `part_${part.index}${ext}`;
      const code = await ffmpeg.exec(partArgs(input, part, name, part.index === total));
      const data = await ffmpeg.readFile(name).catch(() => null);
      await ffmpeg.deleteFile(name).catch(() => undefined);
      const bytes = data == null ? null : typeof data === 'string' ? new TextEncoder().encode(data) : data;
      if (code !== 0 || !bytes || bytes.length === 0) {
        return { ok: false, error: `Part ${part.index} of ${total} could not be cut (ffmpeg exit ${code}).` };
      }
      const piece = new File([bytes as BlobPart], partName(file.name, part.index, total), { type: file.type || 'video/mp4', lastModified: file.lastModified });
      out.push(piece);
      onPart?.(piece, part.index, total);
    }
    return { ok: true, files: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/memory|abort|allocation|OOM/i.test(msg)) {
      return {
        ok: false,
        error: 'This device ran out of memory cutting the file. Choose shorter parts (1 or 2 minutes), '
          + 'or do it on a computer.',
      };
    }
    return { ok: false, error: `The file could not be split: ${msg}` };
  } finally {
    if (ffmpeg) {
      ffmpeg.off('progress', progress);
      if (mounted) await ffmpeg.unmount(mountAt).catch(() => undefined);
    }
  }
}
