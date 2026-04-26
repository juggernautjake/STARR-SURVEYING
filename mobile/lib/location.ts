/**
 * GPS capture wrapper around expo-location.
 *
 * Phase F1 #4 only needs foreground location — we stamp the user's
 * position at clock-in and clock-out. Background tracking turns on
 * in F1 #7/#8 with the geofence + active-timeline features. Per
 * plan §5.10.1 the tracking-only-when-clocked-in privacy contract
 * is enforced architecturally there; for F1 #4, we ask for
 * "when in use" permission only.
 *
 * All functions are best-effort:
 *   - permission denied            → return null (clock action still
 *                                    succeeds, just without GPS)
 *   - GPS off / no fix in 8 sec    → return null (don't block the
 *                                    user — clock-in is more
 *                                    important than location)
 *   - hardware error               → return null + logWarn (Sentry breadcrumb)
 *
 * Callers shape:
 *   const pos = await getCurrentPositionOrNull();
 *   if (pos) { saveWithLocation(pos.latitude, pos.longitude); }
 *   else     { saveWithoutLocation(); }
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { logInfo, logWarn } from './log';

export interface CapturedPosition {
  latitude: number;
  longitude: number;
  /** Meters; null when expo-location couldn't determine. */
  accuracy: number | null;
  /** Meters above WGS-84 ellipsoid; null on Android/iOS that didn't
   *  report it (older / indoor devices). F3 data points carry this
   *  through to field_data_points.device_altitude_m. */
  altitude: number | null;
  /** ISO-8601 of when the fix was taken. */
  capturedAt: string;
}

const FIX_TIMEOUT_MS = 8_000;

/**
 * Ensure the app has foreground location permission. Prompts the
 * user the first time; subsequent calls are no-ops if already
 * granted. Returns true on success.
 */
export async function ensureForegroundPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === Location.PermissionStatus.GRANTED;
    logInfo('location.ensureForegroundPermission', 'permission result', {
      status,
      granted,
    });
    return granted;
  } catch (err) {
    logWarn('location.ensureForegroundPermission', 'permission check failed', err);
    return false;
  }
}

/**
 * Reason a fix attempt failed. Callers vary the user-facing copy
 * depending on which one — "permission denied" gets a Settings link,
 * "timeout" suggests moving outside, "hardware" is the generic
 * fallback.
 */
export type GpsFailureReason = 'no_permission' | 'timeout' | 'hardware';

export interface FixResult {
  /** The position when captured; null otherwise. */
  pos: CapturedPosition | null;
  /** When pos is null, why. When pos is set, null. */
  reason: GpsFailureReason | null;
}

/**
 * Best-effort one-shot position fix. Returns `{ pos: null, reason }`
 * on any failure (permission, hardware, timeout) so callers can vary
 * UX without inspecting log breadcrumbs.
 *
 * Existing callers using getCurrentPositionOrNull keep working —
 * that function is now a thin compatibility wrapper around this one.
 */
export async function getCurrentPosition(): Promise<FixResult> {
  const granted = await ensureForegroundPermission();
  if (!granted) {
    logInfo('location.getCurrentPosition', 'no permission — null fix');
    return { pos: null, reason: 'no_permission' };
  }

  try {
    // Race the GPS fix against an explicit timeout so we don't hang
    // a clock-in indefinitely on a phone with poor sky view. Track
    // the timer id so we can clear it when GPS wins — otherwise the
    // 8 s timer fires uselessly later, holding a JS reference.
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(null), FIX_TIMEOUT_MS);
    });

    try {
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        timeoutPromise,
      ]);

      if (!fix) {
        logInfo('location.getCurrentPosition', 'timeout — null fix', {
          timeout_ms: FIX_TIMEOUT_MS,
        });
        return { pos: null, reason: 'timeout' };
      }

      const pos: CapturedPosition = {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy: fix.coords.accuracy ?? null,
        altitude: fix.coords.altitude ?? null,
        capturedAt: new Date(fix.timestamp).toISOString(),
      };
      // Cache the fix so future calls can fall back to it when GPS
      // glitches (parking garage, indoors, etc.). Best-effort — the
      // write doesn't block the return.
      void rememberPosition(pos);
      return { pos, reason: null };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  } catch (err) {
    logWarn('location.getCurrentPosition', 'getCurrentPosition failed', err);
    return { pos: null, reason: 'hardware' };
  }
}

/**
 * Compatibility wrapper — returns just the position, dropping the
 * reason. Existing F1 clock-in/out + F2 receipt capture call this;
 * F3 capture flows use getCurrentPosition() directly so they can
 * tailor messaging.
 */
export async function getCurrentPositionOrNull(): Promise<CapturedPosition | null> {
  const { pos } = await getCurrentPosition();
  return pos;
}

// ── Last-known position cache ──────────────────────────────────────────────

const LAST_KNOWN_KEY = '@starr-field/last_known_position';

/** Cached fix annotated with how stale it is at read time. The
 *  capture flows surface staleness in the UI ("using last known
 *  position from 4 minutes ago") so the surveyor knows the GPS
 *  field on the row isn't a fresh fix. */
export interface LastKnownPosition extends CapturedPosition {
  /** Ms between captured_at and now() at the time getLastKnownPosition
   *  resolved. Callers compare against their own threshold. */
  ageMs: number;
}

/**
 * Persist the most recent fix so we have something to fall back to
 * when the next fix attempt fails (no permission, no satellite, GPS
 * hardware error). Called by getCurrentPosition on every successful
 * fix — best-effort; cache failures don't fail the parent flow.
 */
async function rememberPosition(pos: CapturedPosition): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(pos));
  } catch (err) {
    logWarn('location.rememberPosition', 'cache write failed', err);
  }
}

/**
 * Read the most recent successful fix from AsyncStorage. Returns
 * null when nothing has ever been cached (cold-start before first
 * fix) OR when the cache entry is corrupt.
 *
 * Callers vary their UX by `ageMs`:
 *   - <2 min: still trustworthy for time stamps
 *   - <30 min: usable with a "stale GPS" warning
 *   - >30 min: prompt user to re-shoot when they get reception
 */
export async function getLastKnownPosition(): Promise<LastKnownPosition | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KNOWN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CapturedPosition;
    const capturedMs = Date.parse(parsed.capturedAt);
    if (!Number.isFinite(capturedMs)) return null;
    return { ...parsed, ageMs: Date.now() - capturedMs };
  } catch (err) {
    logWarn('location.getLastKnownPosition', 'cache read failed', err);
    return null;
  }
}

/**
 * Best-effort fix that falls back to the cached last-known position
 * when the live attempt fails. Used by F1 clock-in/out and F3
 * data-point capture so a temporary GPS glitch in a parking garage
 * still produces a useful coordinate (with `stale: true` so the row
 * carries the metadata for admin review).
 *
 * Returns:
 *   - { pos, stale: false, ageMs: 0 } on a successful live fix
 *   - { pos, stale: true,  ageMs: N } when live failed but cache hit
 *   - { pos: null, reason } when both live AND cache failed
 */
export interface FixWithFallback {
  pos: CapturedPosition | null;
  /** True when pos came from the AsyncStorage cache, not the GPS
   *  hardware. The capture row marks this so the office reviewer
   *  knows. */
  stale: boolean;
  /** Cache age when stale; 0 on a fresh fix; null on total failure. */
  ageMs: number | null;
  /** Why the live fix failed; null when it succeeded. */
  reason: GpsFailureReason | null;
}

export async function getCurrentPositionWithFallback(): Promise<FixWithFallback> {
  // getCurrentPosition() refreshes the cache itself on success, so
  // we don't double-write here.
  const live = await getCurrentPosition();
  if (live.pos) {
    return { pos: live.pos, stale: false, ageMs: 0, reason: null };
  }

  // Live failed — try the cache.
  const cached = await getLastKnownPosition();
  if (cached) {
    logInfo('location.fallback', 'using cached last-known', {
      reason: live.reason,
      age_ms: cached.ageMs,
    });
    // Strip ageMs from the position itself; the wrapper carries it.
    const { ageMs, ...pos } = cached;
    return { pos, stale: true, ageMs, reason: live.reason };
  }

  return { pos: null, stale: false, ageMs: null, reason: live.reason };
}
