/**
 * One-time tracking-consent persistence.
 *
 * Per F6 plan and the user's privacy contract (§5.10.1): the FIRST
 * time a surveyor clocks in, we show an in-app explainer BEFORE
 * the OS "Always" location permission prompt. The explainer mirrors
 * the disclosure copy on `(tabs)/me/privacy` so the user has time
 * to read what's being captured before the OS dialog forces a snap
 * decision.
 *
 * After the user taps "Continue" we set a flag in AsyncStorage so
 * subsequent clock-ins go straight to the OS prompt without re-
 * showing the explainer (the explainer is also reachable via the
 * Privacy panel for re-review).
 *
 * The flag is per-device (AsyncStorage is per-app, per-install) —
 * uninstalling and reinstalling re-triggers the explainer, which is
 * the correct behaviour for a privacy disclosure (the user gets a
 * fresh chance to opt out on a new device).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logInfo, logWarn } from './log';

const KEY = '@starr-field/tracking_consent_v1';

let cached: boolean | null = null;

/** Read the consent flag. Cached after first read for hot-path
 *  callers (clock-in flow) that don't want an AsyncStorage round-
 *  trip on every check. */
export async function hasTrackingConsent(): Promise<boolean> {
  if (cached != null) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw === 'true';
    return cached;
  } catch (err) {
    logWarn(
      'trackingConsent.hasTrackingConsent',
      'AsyncStorage read failed',
      err
    );
    return false;
  }
}

/** Persist a "yes, I understand" — caller invokes after the user
 *  taps Continue on the explainer modal. Idempotent — re-setting
 *  to true is a no-op. */
export async function setTrackingConsent(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, value ? 'true' : 'false');
    cached = value;
    logInfo(
      'trackingConsent.setTrackingConsent',
      value ? 'granted' : 'revoked'
    );
  } catch (err) {
    logWarn(
      'trackingConsent.setTrackingConsent',
      'AsyncStorage write failed',
      err,
      { value }
    );
  }
}

/** Reset the flag — surfaced under Me → Privacy when the surveyor
 *  taps "Re-show the consent screen" so they can re-read the
 *  disclosure before their next clock-in. */
export async function resetTrackingConsent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
    cached = false;
    logInfo('trackingConsent.reset', 'cleared');
  } catch (err) {
    logWarn(
      'trackingConsent.reset',
      'AsyncStorage delete failed',
      err
    );
  }
}
