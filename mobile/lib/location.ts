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

      return {
        pos: {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          accuracy: fix.coords.accuracy ?? null,
          altitude: fix.coords.altitude ?? null,
          capturedAt: new Date(fix.timestamp).toISOString(),
        },
        reason: null,
      };
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
