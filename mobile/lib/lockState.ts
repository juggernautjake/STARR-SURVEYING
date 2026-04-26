/**
 * Per-device lock-state persistence in AsyncStorage.
 *
 * Stores three things:
 *   - biometric_enabled: boolean — has the user opted into biometric
 *     unlock from the Me tab Security section?
 *   - idle_lock_minutes: number — idle threshold before auto-locking
 *     (default 15 per plan §5.1)
 *   - last_active_ts: number — wall-clock ms timestamp; written when
 *     the app goes to background, read when it comes back to compute
 *     elapsed idle time
 *
 * Why AsyncStorage and not the Supabase session: these are device
 * preferences, not user preferences. A surveyor signing into a
 * borrowed phone shouldn't inherit the previous owner's biometric
 * setup. Tying these to AsyncStorage means "this device + this
 * install" not "this user."
 *
 * All reads tolerate missing/corrupt values and return safe defaults;
 * writes never throw (logged at most). Lock state is best-effort UI
 * convenience, never a security boundary on its own.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarn } from './log';

const KEY_BIOMETRIC_ENABLED = '@starr-field/biometric_enabled';
const KEY_IDLE_MINUTES = '@starr-field/idle_lock_minutes';
const KEY_LAST_ACTIVE = '@starr-field/last_active_ts';

const DEFAULT_IDLE_MINUTES = 15;

export async function getBiometricEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BIOMETRIC_ENABLED);
    return raw === 'true';
  } catch (err) {
    logWarn('lockState.getBiometricEnabled', 'AsyncStorage read failed', err);
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_BIOMETRIC_ENABLED, enabled ? 'true' : 'false');
  } catch (err) {
    logWarn('lockState.setBiometricEnabled', 'AsyncStorage write failed', err, {
      enabled,
    });
  }
}

export async function getIdleLockMinutes(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_IDLE_MINUTES);
    if (!raw) return DEFAULT_IDLE_MINUTES;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_IDLE_MINUTES;
    return n;
  } catch (err) {
    logWarn('lockState.getIdleLockMinutes', 'AsyncStorage read failed', err);
    return DEFAULT_IDLE_MINUTES;
  }
}

export async function setIdleLockMinutes(minutes: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_IDLE_MINUTES, String(Math.max(1, Math.round(minutes))));
  } catch (err) {
    logWarn('lockState.setIdleLockMinutes', 'AsyncStorage write failed', err, {
      minutes,
    });
  }
}

/**
 * Record the moment the app went to background. Called from the
 * AppState listener in lib/auth.tsx.
 */
export async function markBackgroundedNow(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LAST_ACTIVE, String(Date.now()));
  } catch (err) {
    logWarn('lockState.markBackgroundedNow', 'AsyncStorage write failed', err);
  }
}

/**
 * Read the last backgrounded timestamp. Returns null if never set
 * (e.g. cold start) so the caller can decide its own policy.
 */
export async function getLastBackgroundedTs(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LAST_ACTIVE);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    logWarn('lockState.getLastBackgroundedTs', 'AsyncStorage read failed', err);
    return null;
  }
}
