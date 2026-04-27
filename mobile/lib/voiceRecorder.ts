/**
 * Voice memo recording primitives.
 *
 * Per the user's resilience requirement: "save images and videos and
 * voice recordings to the app and the data also need to be able to
 * be saved to the phone storage as well." This module is the audio
 * counterpart to lib/storage/mediaUpload.ts (which only handles
 * images).
 *
 * Capture pipeline:
 *
 *   1. ensureRecordingPermission() — prompts the OS, returns true on
 *      grant. Idempotent (cached promise).
 *   2. Audio.Recording — start / stop / get URI, with a
 *      high-quality M4A preset (AAC-LC, 44.1 kHz, mono). Mono saves
 *      ~50% bytes vs stereo with no perceptible loss for voice.
 *   3. Caller persists the resulting file:// URI via the upload
 *      queue (lib/uploadQueue.ts) into the `starr-field-voice`
 *      bucket — same offline-first pattern as photos.
 *
 * Storage path convention: {user_id}/{job_id_or_point_id}-{media_id}.m4a
 * Matches the pattern in seeds/221_starr_field_data_points.sql for
 * the per-user-folder RLS policy.
 *
 * Defensive cleanups:
 *   - When the user navigates away mid-recording without saving,
 *     the recorder.stopAndUnloadAsync + delete the temp file so
 *     orphan recordings don't accumulate in cache.
 *   - On any error during start / stop, we log the failure +
 *     surface a user-readable message to the caller.
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

import { logInfo, logWarn } from './log';

let permissionPromise: Promise<boolean> | null = null;

/**
 * Recorder singleton — only one Audio.Recording can be active per
 * process per Apple's expo-av guarantees, so we keep a module-level
 * reference and refuse a second start while one is in flight.
 */
let activeRecording: Audio.Recording | null = null;

export interface VoiceRecording {
  /** file:// URI of the captured M4A. Caller is responsible for
   *  copying/uploading; the source file lives in the Audio cache
   *  and may be evicted by the OS. */
  uri: string;
  /** Recorded duration in milliseconds. */
  durationMs: number;
  /** File size at the moment of capture. May be null when the OS
   *  hasn't flushed the file size yet. */
  fileSize: number | null;
  /** Always 'audio/mp4' for our M4A preset; included so callers
   *  can pass through to enqueueAndAttempt without re-deriving. */
  contentType: 'audio/mp4';
}

/**
 * Cached permission check / prompt. Returns true iff we can record.
 * Hard-deny (canAskAgain === false) returns false WITHOUT prompting
 * — caller is expected to surface a Settings deep-link for the
 * recovery path, same pattern as lib/notifications.ts.
 */
export async function ensureRecordingPermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        const existing = await Audio.getPermissionsAsync();
        if (existing.status === 'granted') return true;
        if (existing.status === 'denied' && !existing.canAskAgain) {
          logInfo('voiceRecorder.permission', 'hard-denied');
          return false;
        }
        const requested = await Audio.requestPermissionsAsync();
        const granted = requested.status === 'granted';
        logInfo('voiceRecorder.permission', 'prompt result', { granted });
        return granted;
      } catch (err) {
        logWarn('voiceRecorder.permission', 'check failed', err);
        return false;
      }
    })();
  }
  return permissionPromise;
}

/**
 * Bust the cached permission promise — used after the user has been
 * sent to Settings to flip the toggle, so the next call re-evaluates
 * the OS state instead of returning the stale denied result.
 */
export function resetRecordingPermissionCache(): void {
  permissionPromise = null;
}

/**
 * Start recording. Configures audio mode for the platform (iOS needs
 * the silent-switch override + recording category; Android handles it
 * implicitly). Throws if already recording or permission denied.
 */
export async function startRecording(): Promise<void> {
  if (activeRecording) {
    throw new Error('Already recording — stop the current take first.');
  }
  const granted = await ensureRecordingPermission();
  if (!granted) {
    // Phrase MUST match isPermissionDeniedError() in permissionGuard.ts
    // so the caller can branch + Settings-deep-link instead of showing
    // a generic "couldn't start recording" alert.
    throw new Error('Microphone permission denied.');
  }

  // iOS: route audio to the recording-friendly mode so the silent
  // switch doesn't kill the input. allowsRecordingIOS only takes
  // effect when set BEFORE the recording starts.
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false, // we don't want to record after
                                    // backgrounding — surveyors should
                                    // tap stop intentionally
  });

  const recording = new Audio.Recording();
  try {
    // HIGH_QUALITY is M4A on both platforms; tweak the channel count
    // down to mono since voice doesn't benefit from stereo.
    const preset: Audio.RecordingOptions = {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      ios: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
        numberOfChannels: 1,
      },
      android: {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
        numberOfChannels: 1,
      },
      web: {
        ...(Audio.RecordingOptionsPresets.HIGH_QUALITY.web ?? {}),
      },
    };

    await recording.prepareToRecordAsync(preset);
    await recording.startAsync();
    activeRecording = recording;
    logInfo('voiceRecorder.start', 'started');
  } catch (err) {
    // Best-effort cleanup before surfacing.
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      /* swallowed — the start failed before recording engaged */
    }
    activeRecording = null;
    throw err;
  }
}

/**
 * Live status snapshot — call from the UI's tick effect to drive a
 * duration counter. Returns null when no recording is active.
 */
export async function getRecordingStatus(): Promise<{
  isRecording: boolean;
  durationMs: number;
} | null> {
  if (!activeRecording) return null;
  try {
    const status = await activeRecording.getStatusAsync();
    if (!status.canRecord) return null;
    return {
      isRecording: status.isRecording,
      durationMs: status.durationMillis ?? 0,
    };
  } catch (err) {
    logWarn('voiceRecorder.status', 'getStatusAsync failed', err);
    return null;
  }
}

/**
 * Stop the active recording and return the file URI + duration.
 * Idempotent — calling stop when nothing is active returns null.
 */
export async function stopRecording(): Promise<VoiceRecording | null> {
  const recording = activeRecording;
  if (!recording) return null;
  activeRecording = null;

  try {
    await recording.stopAndUnloadAsync();
  } catch (err) {
    logWarn('voiceRecorder.stop', 'stopAndUnloadAsync failed', err);
    return null;
  }

  // Reset the audio mode so subsequent playback (lightbox preview,
  // future video player) isn't stuck in record-only routing.
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });
  } catch (err) {
    logWarn('voiceRecorder.stop', 'reset audio mode failed', err);
  }

  const uri = recording.getURI();
  if (!uri) {
    logWarn('voiceRecorder.stop', 'no URI on stopped recording');
    return null;
  }

  let fileSize: number | null = null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info) {
      fileSize = info.size;
    }
  } catch (err) {
    logWarn('voiceRecorder.stop', 'getInfoAsync failed', err);
  }

  // The status is no longer fetchable post-unload, so we read the
  // duration from the LAST status snapshot. expo-av exposes
  // _finalDurationMillis as a private prop on iOS; instead we trust
  // the file's metadata via getStatusAsync prior to unload, but
  // here we've already unloaded. As a fallback we report 0 — the
  // upload still works; the duration shows up after the worker
  // re-reads the file. Safer route: re-read post-stop via a
  // throwaway sound object.
  let durationMs = 0;
  try {
    const sound = new Audio.Sound();
    await sound.loadAsync({ uri });
    const status = await sound.getStatusAsync();
    if (status.isLoaded) {
      durationMs = status.durationMillis ?? 0;
    }
    await sound.unloadAsync();
  } catch (err) {
    logWarn('voiceRecorder.stop', 'duration probe failed', err);
  }

  logInfo('voiceRecorder.stop', 'stopped', {
    duration_ms: durationMs,
    file_size: fileSize,
    uri,
  });
  return {
    uri,
    durationMs,
    fileSize,
    contentType: 'audio/mp4',
  };
}

/**
 * Cancel + delete an in-flight recording. Used when the user
 * navigates away from the record screen without tapping save —
 * leaves no orphan files in the Audio cache.
 */
export async function cancelRecording(): Promise<void> {
  const recording = activeRecording;
  activeRecording = null;
  if (!recording) return;
  let uri: string | null = null;
  try {
    await recording.stopAndUnloadAsync();
    uri = recording.getURI();
  } catch (err) {
    logWarn('voiceRecorder.cancel', 'stopAndUnloadAsync failed', err);
  }
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });
  } catch {
    /* noop */
  }
  if (uri) {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      logWarn('voiceRecorder.cancel', 'temp file delete failed', err, {
        uri,
      });
    }
  }
  logInfo('voiceRecorder.cancel', 'cancelled');
}
