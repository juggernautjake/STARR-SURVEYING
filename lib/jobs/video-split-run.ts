// lib/jobs/video-split-run.ts — actually cutting the video, in the browser.
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
// ── THE HONEST LIMIT ────────────────────────────────────────────────────────────────────────────
//
// ffmpeg.wasm holds the input in WebAssembly memory. A phone browser tab has far less headroom than
// a desktop one, so a very large file can fail here — and it fails as an out-of-memory abort, which
// says nothing useful. `splitVideo` catches that and returns a sentence naming the actual options,
// rather than letting a wall of wasm text reach somebody standing in a field.

import { partName, type SplitPart } from './video-split';

export interface SplitProgress {
  part: number;
  total: number;
  /** 0–100 within the current part. */
  pct: number;
}

/**
 * Read a video's duration without decoding it, using the browser's own demuxer.
 *
 * The plan needs a duration and the file does not carry one anywhere reachable from JavaScript.
 * A `<video>` element pointed at a blob URL will report it once metadata is parsed — a few hundred
 * kilobytes of read, not the whole file.
 */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    // A file the browser cannot demux (some HEVC .mov on a non-Apple browser) never fires
    // `loadedmetadata`, and would otherwise hang the upload forever behind a spinner.
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

let ffmpegPromise: Promise<{ ffmpeg: unknown; fetchFile: (f: File) => Promise<Uint8Array> }> | null = null;

async function loadFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const ffmpeg = new FFmpeg();
      // ── SELF-HOSTED, NOT A CDN ────────────────────────────────────────────────────────────────
      //
      // The library's own examples fetch this from unpkg. That would put a third-party origin in the
      // path of a field upload — blocked by any strict CSP, and unavailable exactly when a crew is
      // somewhere with one bar of signal. The 32 MB core is served from this app's own `/public`
      // instead, so it is on the same origin as everything else and cached like any other asset.
      //
      // The single-threaded core: the multithreaded one needs SharedArrayBuffer, which needs
      // COOP/COEP headers site-wide — a change that would affect every other page in the admin for
      // the sake of one rare operation. Slower here, no blast radius anywhere else.
      const base = '/ffmpeg';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      return { ffmpeg, fetchFile };
    })().catch((e) => {
      // A failed load must not poison every later attempt — the next one gets a fresh try.
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

/**
 * Cut `file` into the parts the plan describes, and hand back real `File` objects the ordinary
 * upload path can take — so splitting changes nothing downstream.
 */
export async function splitVideo(
  file: File,
  parts: SplitPart[],
  onProgress?: (p: SplitProgress) => void,
): Promise<SplitOutcome> {
  if (parts.length === 0) return { ok: false, error: 'Nothing to split.' };

  try {
    const { ffmpeg, fetchFile } = await loadFfmpeg();
    // The library's types are loose across versions; the three calls used here are stable.
    const fx = ffmpeg as {
      writeFile: (n: string, d: Uint8Array) => Promise<unknown>;
      readFile: (n: string) => Promise<Uint8Array | string>;
      deleteFile: (n: string) => Promise<unknown>;
      exec: (args: string[]) => Promise<unknown>;
      on: (ev: string, cb: (e: { progress: number }) => void) => void;
    };

    const ext = file.name.slice(file.name.lastIndexOf('.')) || '.mp4';
    const input = `in${ext}`;
    await fx.writeFile(input, await fetchFile(file));

    // ── THE SEGMENT MUXER, NOT N SEPARATE -ss/-t PASSES ─────────────────────────────────────────
    //
    // The obvious implementation — loop the parts, `-ss <start> -i in -t <len> -c copy` each time —
    // is WRONG, and wrong in a way that looks right: it was measured producing a "part 2" that was
    // 172,725 bytes against a 172,527-byte original, reporting the full 5.9s duration. With stream
    // copy the output keeps the source timestamps, so the trim is not applied the way the arguments
    // suggest and the tail part comes out as the whole recording.
    //
    // `-f segment` exists for exactly this. One pass, cuts on real keyframes, and
    // `-reset_timestamps 1` rebases every piece to start at zero — which is what makes each one a
    // standalone video rather than a fragment that claims to begin four minutes in.
    const partSeconds = parts[0]?.durationSec ?? 0;
    onProgress?.({ part: 1, total: parts.length, pct: 0 });
    fx.on('progress', (e: { progress: number }) =>
      onProgress?.({ part: 1, total: parts.length, pct: Math.min(100, Math.round((e.progress ?? 0) * 100)) }));

    await fx.exec([
      '-i', input,
      '-c', 'copy',
      '-f', 'segment',
      '-segment_time', String(partSeconds),
      '-reset_timestamps', '1',
      `seg_%03d${ext}`,
    ]);

    // Read back however many segments were actually produced. Keyframe spacing decides the real
    // boundaries, so the count can differ from the plan by one — trusting the plan here would drop
    // the last piece of somebody's recording, or fail reading a file that was never written.
    const out: File[] = [];
    const raw: Uint8Array[] = [];
    for (let i = 0; i < parts.length + 4; i += 1) {
      const segName = `seg_${String(i).padStart(3, '0')}${ext}`;
      let data: Uint8Array | string;
      try {
        data = await fx.readFile(segName);
      } catch {
        break; // no more segments
      }
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      if (bytes.length === 0) break;
      // Copied into a fresh buffer: ffmpeg reuses its heap, and a File backed by it would change
      // contents underneath the upload.
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      raw.push(copy);
      await fx.deleteFile(segName).catch(() => undefined);
    }
    await fx.deleteFile(input).catch(() => undefined);

    if (raw.length === 0) return { ok: false, error: 'The video could not be split — no parts were produced.' };

    // Named only now, when the real count is known.
    const total = raw.length;
    for (let i = 0; i < total; i += 1) {
      out.push(new File([raw[i]], partName(file.name, i + 1, total), { type: file.type || 'video/mp4' }));
    }
    return { ok: true, files: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Out-of-memory surfaces as an abort with no useful text. Say what can actually be done about
    // it instead — this message is read by somebody holding a phone in a field.
    if (/memory|abort|allocation|OOM/i.test(msg)) {
      return {
        ok: false,
        error: 'This video is too large for the browser to cut up on this device. '
          + 'Try again on a computer, or record the next one at a lower resolution.',
      };
    }
    return { ok: false, error: `The video could not be split: ${msg}` };
  }
}
