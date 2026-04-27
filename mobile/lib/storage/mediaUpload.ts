/**
 * Generic media-upload primitives shared by F2 receipts, F3 data-point
 * photos, F4 voice memos / video, etc.
 *
 * Two helpers:
 *   - pickAndCompress(opts) — prompts permission, opens the OS picker,
 *     downscales / re-encodes via expo-image-manipulator. Image-only
 *     today; F4 will extend with video + audio sources.
 *   - uploadToBucket(bucket, path, fileUri, contentType) — fetches the
 *     local file URI as an ArrayBuffer and ships it to Supabase Storage
 *     via the user's authenticated session.
 *
 * Designed so feature libraries (lib/receipts.ts, lib/dataPoints.ts,
 * etc.) own the bucket name / path convention / DB row shape, while
 * the actual file-handling code lives in one place.
 */
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import { logInfo, logWarn } from '../log';
import { supabase } from '../supabase';

export type ImageSource = 'camera' | 'library';

export interface PickAndCompressOptions {
  source: ImageSource;
  /** Long-edge cap in pixels. Receipts use 1600 (text legibility);
   *  data-point photos may use 2400 (more detail for surveying). */
  maxDimensionPx?: number;
  /** JPEG quality 0..1. Default 0.85 — visually lossless for paper
   *  receipts and 2x more compact than 1.0. */
  quality?: number;
  /** Whether to let the user crop / square-up after capture. The OS
   *  editor handles this — receipts want it (square the page), data
   *  points usually don't (preserve full frame). */
  allowsEditing?: boolean;
  /**
   * Logging scope so failures land under a recognisable category in
   * Sentry. e.g. 'receipts.pick' or 'dataPoints.pick'.
   */
  scope: string;
}

export interface PickedImage {
  /** Local file:// URI to the compressed JPEG. Caller passes to
   *  uploadToBucket(); the file lives in the OS cache and is cleaned
   *  up by the OS over time. */
  uri: string;
  /** Reported by FileSystem after compression, useful for telemetry. */
  fileSize?: number;
  /** Original picker asset's mime type (image/jpeg | image/heic etc.).
   *  Always 'image/jpeg' after compression — included for future
   *  callers that bypass compression. */
  contentType: string;
}

/**
 * Prompt for permission, open the OS picker, downscale + JPEG-encode.
 * Returns null when the user cancels. Throws on permission denial or
 * compression failure (caller surfaces to the UI).
 */
export async function pickAndCompress(
  opts: PickAndCompressOptions
): Promise<PickedImage | null> {
  const asset = await pickImage(opts);
  if (!asset) return null;
  return compressForUpload(asset.uri, opts);
}

// ── Video picker ─────────────────────────────────────────────────────────────

export interface PickVideoOptions {
  source: ImageSource;
  /** Max recording duration in seconds. Per plan §5.4 video is
   *  capped at 5 minutes; the OS enforces it during capture. */
  maxDurationSec?: number;
  /** Quality preset — passed straight to expo-image-picker.
   *  0..1 maps to Low / Medium / High on the native side. Default
   *  0.7 keeps file sizes reasonable for cellular sync. */
  quality?: number;
  scope: string;
}

export interface PickedVideo {
  /** file:// URI of the captured video. Caller passes to the upload
   *  queue; the OS keeps the file in the picker cache and may
   *  evict — enqueueAndAttempt copies it to documentDirectory
   *  before queueing so it's safe across app kills. */
  uri: string;
  /** Reported by FileSystem after capture. Useful for cellular-budget
   *  decisions in the WiFi-only sync rule. */
  fileSize?: number;
  /** Duration in seconds (rounded). Drives the gallery thumbnail
   *  duration overlay + IRS-grade time accounting. */
  durationSeconds?: number;
  /** Original picker asset's mime type — usually 'video/mp4' on
   *  iOS, 'video/quicktime' (MOV) gets transcoded to mp4 by the
   *  picker on most devices. */
  contentType: string;
}

const DEFAULT_VIDEO_MAX_DURATION_SEC = 300; // 5 min — plan §5.4

/**
 * Capture (camera) or pick (library) a single video. The OS provides
 * the recording UI — no in-app capture screen needed for v1. Per the
 * user's "save images and videos and voice recordings to the app and
 * the data also need to be able to be saved to the phone storage as
 * well" requirement: the file persists through enqueueAndAttempt's
 * documentDirectory copy + an opt-in MediaLibrary backup the caller
 * fires after the capture lands.
 */
export async function pickVideo(
  opts: PickVideoOptions
): Promise<PickedVideo | null> {
  const maxDurationSec = opts.maxDurationSec ?? DEFAULT_VIDEO_MAX_DURATION_SEC;
  const quality = opts.quality ?? 0.7;

  let asset: ImagePicker.ImagePickerAsset | null = null;
  if (opts.source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const err = new Error('Camera permission denied.');
      logWarn(opts.scope, 'camera permission denied', err, {
        can_ask_again: perm.canAskAgain,
      });
      throw err;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: maxDurationSec,
      videoQuality: quality,
      allowsEditing: false,
      quality: 1,
    });
    asset = result.canceled ? null : (result.assets[0] ?? null);
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const err = new Error('Photo library permission denied.');
      logWarn(opts.scope, 'library permission denied', err);
      throw err;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: maxDurationSec,
      videoQuality: quality,
      allowsEditing: false,
      quality: 1,
    });
    asset = result.canceled ? null : (result.assets[0] ?? null);
  }
  if (!asset) return null;

  // Defensive size lookup — the picker reports fileSize on most
  // platforms but not all. Falling back to FileSystem.getInfoAsync
  // gets us a consistent number for the IRS-record / cellular-budget
  // path.
  let fileSize = asset.fileSize ?? undefined;
  if (fileSize == null) {
    try {
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (info.exists && 'size' in info) fileSize = info.size;
    } catch (err) {
      logWarn(opts.scope, 'video size probe failed', err);
    }
  }

  // Hard-fail on captures that exceed the cap by 50%+ — protects
  // against picker-side cap miss on older Android devices.
  const durationSeconds =
    asset.duration != null ? Math.round(asset.duration / 1000) : undefined;
  if (durationSeconds && durationSeconds > maxDurationSec * 1.5) {
    const err = new Error(
      `Video too long (${durationSeconds}s > ${maxDurationSec}s cap).`
    );
    logWarn(opts.scope, 'video exceeds cap — refusing capture', err, {
      duration_seconds: durationSeconds,
      cap_seconds: maxDurationSec,
    });
    throw err;
  }

  logInfo(opts.scope, 'picked video', {
    uri: asset.uri,
    duration_seconds: durationSeconds ?? null,
    file_size: fileSize ?? null,
  });
  return {
    uri: asset.uri,
    fileSize,
    durationSeconds,
    contentType: asset.mimeType ?? 'video/mp4',
  };
}

async function pickImage(
  opts: PickAndCompressOptions
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (opts.source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const err = new Error('Camera permission denied.');
      logWarn(opts.scope, 'camera permission denied', err, {
        can_ask_again: perm.canAskAgain,
      });
      throw err;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: opts.allowsEditing ?? false,
      quality: 1,
      exif: false,
    });
    return result.canceled ? null : result.assets[0] ?? null;
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const err = new Error('Photo library permission denied.');
    logWarn(opts.scope, 'library permission denied', err);
    throw err;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: opts.allowsEditing ?? false,
    quality: 1,
    exif: false,
  });
  return result.canceled ? null : result.assets[0] ?? null;
}

async function compressForUpload(
  sourceUri: string,
  opts: PickAndCompressOptions
): Promise<PickedImage> {
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: opts.maxDimensionPx ?? 1600 } }],
    {
      compress: opts.quality ?? 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  let fileSize: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(result.uri, { size: true });
    if (info.exists && 'size' in info) fileSize = info.size;
  } catch {
    // Telemetry only — non-fatal.
  }

  return { uri: result.uri, fileSize, contentType: 'image/jpeg' };
}

/**
 * Upload a local file URI to a Supabase Storage bucket. The user's
 * Supabase session signs the request; bucket RLS gates the destination
 * (typically `(storage.foldername(name))[1] = auth.uid()::text` per
 * the F2 convention).
 *
 * Throws on storage rejection — caller decides whether to retry,
 * surface the error, or queue for later.
 */
export async function uploadToBucket(args: {
  bucket: string;
  path: string;
  fileUri: string;
  contentType: string;
  /** Logging scope (e.g. 'receipts.upload'). */
  scope: string;
}): Promise<void> {
  const { bucket, path, fileUri, contentType, scope } = args;

  // RN's fetch reads file:// into a Blob; convert to ArrayBuffer for
  // the Supabase JS client. FormData with file:// also works on RN
  // but the ArrayBuffer path is deterministic across platforms.
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();

  logInfo(scope, 'uploading', { bucket, path, bytes: arrayBuffer.byteLength });

  const { error } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    logWarn(scope, 'upload failed', error, { bucket, path });
    throw error;
  }
  logInfo(scope, 'upload success', { bucket, path });
}

/**
 * Best-effort removal of a previously-uploaded object. Used to clean
 * up orphans when the DB INSERT fails after a successful upload.
 * Failure is non-fatal — IRS retention archival jobs sweep orphans.
 */
export async function removeFromBucket(args: {
  bucket: string;
  path: string;
  scope: string;
}): Promise<void> {
  try {
    await supabase.storage.from(args.bucket).remove([args.path]);
  } catch (err) {
    logWarn(args.scope, 'remove failed', err, {
      bucket: args.bucket,
      path: args.path,
    });
  }
}
