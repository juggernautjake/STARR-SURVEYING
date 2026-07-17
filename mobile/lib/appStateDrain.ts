// mobile/lib/appStateDrain.ts — the pure decision for WHEN an AppState transition should kick the
// upload drainer. Extracted (Expo/RN-free) so the "resume uploads on foreground return" rule is
// unit-testable like the rest of the queue's pure decisions (queueOrder / drainDecision / uploadMode /
// …); the runtime (useUploadQueueDrainer) only wires AppState to it and remembers the previous state.

/** The AppState values we care about, widened to string so a future/unknown platform state can't break
 *  the type — RN emits 'active' | 'background' | 'inactive' and reserves room for platform extras. */
export type DrainAppState = 'active' | 'background' | 'inactive' | (string & {});

/**
 * Should the drainer kick a fresh drain on a `prev → next` AppState change?
 *
 * YES exactly when the app RETURNS to the foreground (`active`) from a non-active state. While the app
 * is backgrounded/inactive the OS throttles or suspends JS timers, so the periodic drain and any
 * network-restore callback may not have fired — draining immediately on return means the surveyor's
 * queued captures resume the moment they reopen the app instead of stalling up to a full interval.
 *
 * This is the prompt-resume half of C2; it is NOT background execution (uploading while the app is away
 * needs expo-task-manager and is bounded by the OS's background windows — tracked separately).
 *
 * NOT on `active → active` (no real transition — RN can emit duplicate events) and NOT when LEAVING the
 * foreground (`active → background/inactive`). A brief `active → inactive → active` flicker (an iOS
 * notification-centre pull-down or the app switcher) does trigger one drain on the way back; that is
 * harmless — a drain with nothing eligible is a cheap no-op — and never missing a real resume is worth
 * more than suppressing that occasional extra check.
 */
export function shouldDrainOnAppStateChange(prev: DrainAppState, next: DrainAppState): boolean {
  return next === 'active' && prev !== 'active';
}
