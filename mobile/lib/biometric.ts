/**
 * Thin wrapper around expo-local-authentication.
 *
 * Why a wrapper at all: the Expo API returns booleans + numeric enums
 * scattered across three calls (`hasHardwareAsync`, `isEnrolledAsync`,
 * `supportedAuthenticationTypesAsync`). Most call sites just want the
 * questions "can the user use biometric here?" and "did they prove
 * they're the user?" — this module collapses to those.
 *
 * Every call is wrapped in try/catch; biometric is a best-effort
 * convenience, never a security boundary by itself. The Supabase
 * session is the actual auth, biometric just gates UI access to it.
 *
 * Phase F0 #2b — STARR_FIELD_MOBILE_APP_PLAN.md §5.1 (biometric
 * unlock + re-auth on destructive actions).
 */
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'unknown';

export interface BiometricCapability {
  /** Device has the sensor AND the user has enrolled at least one credential. */
  available: boolean;
  /** Best-guess label for UI strings. */
  kind: BiometricKind;
}

/**
 * Returns whether biometric auth is usable on this device, plus a hint
 * about which kind for UI labels ("Unlock with Face ID" vs
 * "Unlock with fingerprint"). Never throws — failure returns
 * { available: false, kind: 'unknown' }.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    if (!hasHardware || !isEnrolled) {
      return { available: false, kind: 'unknown' };
    }

    let kind: BiometricKind = 'unknown';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      kind = 'face';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      kind = 'fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      kind = 'iris';
    }

    return { available: true, kind };
  } catch {
    return { available: false, kind: 'unknown' };
  }
}

/** Human label for a biometric kind, used in button text. */
export function biometricLabel(kind: BiometricKind): string {
  switch (kind) {
    case 'face':
      return 'Face ID';
    case 'fingerprint':
      return 'fingerprint';
    case 'iris':
      return 'iris scan';
    default:
      return 'biometric';
  }
}

/**
 * Prompt the user to authenticate with whatever biometric is enrolled.
 * Returns true on success, false on cancel/failure. The `reason` is
 * shown by iOS / Android in the system prompt.
 *
 * Falls back to device passcode if biometric fails after a few tries
 * (`disableDeviceFallback: false`). For Phase F0, this is the right
 * trade-off — surveyors with sweaty hands get an out without needing
 * to re-sign-in via Supabase.
 */
export async function authenticate(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Re-auth helper for F1+ destructive actions (delete job, delete
 * point, delete time entry per plan §5.1). Behavior:
 *
 *   - If biometric is available AND enabled in app settings →
 *     prompt the user; require success before proceeding.
 *   - If biometric is unavailable (no hardware, not enrolled) →
 *     return true. The Supabase session is still required, so the
 *     destructive action isn't unauthenticated; we just don't have
 *     a second factor to demand.
 *
 * Call sites:
 *
 *   const ok = await requireReauth('Delete this data point?');
 *   if (!ok) return;
 *   await supabase.from('field_data_points').delete()...;
 */
export async function requireReauth(reason: string, biometricEnabled: boolean): Promise<boolean> {
  if (!biometricEnabled) return true;
  const cap = await getBiometricCapability();
  if (!cap.available) return true;
  return authenticate(reason);
}
