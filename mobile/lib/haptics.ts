/**
 * Thin haptics wrapper.
 *
 * One job: keep haptic calls one-line at call sites and isolate
 * expo-haptics so swapping for a different backend later doesn't
 * touch every screen. Each call is fire-and-forget — surveyors
 * don't care if the buzz fails on a device without a Taptic
 * Engine, so failures are silently swallowed instead of bubbling.
 *
 * Usage taxonomy (so we don't over-haptic):
 *   - `tap()`       — primary action initiation (Snap photo, Add
 *                     receipt, etc.). Surveyor feels the tap
 *                     register before the camera UI fades in.
 *   - `confirm()`   — destructive confirmation accepted (Sign out,
 *                     Delete). Signals "you're past the safety net".
 *   - `success()`   — async work landed successfully (clocked out,
 *                     receipt saved, week submitted). Closes the
 *                     loop on the user's tap from a second earlier.
 *   - `warn()`      — recoverable bump (duplicate point name, GPS
 *                     timeout). Same intensity as confirm but
 *                     semantically different.
 *
 * iOS uses the Taptic Engine; Android uses the vendor's vibrator
 * pattern. Behaviour-wise they map close enough that one taxonomy
 * works for both.
 */
import * as Haptics from 'expo-haptics';

/** Primary action initiation. */
export function tap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Destructive confirmation accepted. */
export function confirm(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Async work landed successfully. */
export function success(): void {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success
  ).catch(() => {});
}

/** Recoverable warning. */
export function warn(): void {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Warning
  ).catch(() => {});
}
