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
 *   - hardware error               → return null + console.warn
 *
 * Callers shape:
 *   const pos = await getCurrentPositionOrNull();
 *   if (pos) { saveWithLocation(pos.latitude, pos.longitude); }
 *   else     { saveWithoutLocation(); }
 */
import * as Location from 'expo-location';

export interface CapturedPosition {
  latitude: number;
  longitude: number;
  /** Meters; null when expo-location couldn't determine. */
  accuracy: number | null;
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
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Best-effort one-shot position fix. Returns null on any failure
 * (permission, hardware, timeout) so callers can degrade gracefully.
 */
export async function getCurrentPositionOrNull(): Promise<CapturedPosition | null> {
  const granted = await ensureForegroundPermission();
  if (!granted) return null;

  try {
    // Race the GPS fix against an explicit timeout so we don't hang
    // a clock-in indefinitely on a phone with poor sky view.
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);

    if (!fix) return null;

    return {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracy: fix.coords.accuracy ?? null,
      capturedAt: new Date(fix.timestamp).toISOString(),
    };
  } catch (err) {
    console.warn('[location] getCurrentPosition failed:', err);
    return null;
  }
}
