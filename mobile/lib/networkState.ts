/**
 * Network reachability — single source of truth for "are we online?"
 *
 * @react-native-community/netinfo wraps platform APIs (iOS Reachability
 * + Android ConnectivityManager) and emits a stream of state changes.
 * We expose:
 *
 *   useIsOnline()          — boolean reactive hook for UI badges
 *   subscribeToOnline(cb)  — fires `cb(isOnline)` on every transition;
 *                            used by the upload queue to retry on
 *                            network restore.
 *
 * "Online" means `isConnected && isInternetReachable !== false`. We
 * treat null `isInternetReachable` as online because some Android
 * configurations never resolve it but still have working network.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

import { logInfo } from './log';

function isOnlineFromState(state: NetInfoState): boolean {
  if (!state.isConnected) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

let lastKnownOnline = true;
let lastBreadcrumb: boolean | null = null;

NetInfo.addEventListener((state) => {
  const next = isOnlineFromState(state);
  lastKnownOnline = next;
  if (lastBreadcrumb !== next) {
    lastBreadcrumb = next;
    // Network transitions are rare and high-signal. logInfo
    // breadcrumbs them so Sentry can correlate "the upload failed at
    // 14:32" with "the device went offline at 14:31."
    logInfo('network.transition', next ? 'online' : 'offline', {
      type: state.type,
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
    });
  }
});

/**
 * Reactive hook — re-renders the consumer when reachability flips.
 * Default to `true` (optimistic) so the UI doesn't render an
 * "offline" banner during the first ~50 ms before NetInfo settles.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState<boolean>(lastKnownOnline);

  useEffect(() => {
    let mounted = true;
    // Pull current state in case the listener fired before mount.
    NetInfo.fetch()
      .then((state) => {
        if (!mounted) return;
        setOnline(isOnlineFromState(state));
      })
      .catch(() => {
        // NetInfo.fetch is allowed to reject on Android during early
        // boot — fall through to the optimistic default.
      });
    const unsub = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      setOnline(isOnlineFromState(state));
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return online;
}

export type NetworkSubscriber = (online: boolean) => void;

/**
 * Imperative subscription — used by lib/uploadQueue.ts to drain
 * pending uploads when reachability returns. Returns an unsubscribe.
 */
export function subscribeToOnline(cb: NetworkSubscriber): () => void {
  return NetInfo.addEventListener((state) => {
    cb(isOnlineFromState(state));
  });
}

/** Last-cached online flag — synchronous read for hot-path callers
 *  that don't want to subscribe. May be stale by up to one transition. */
export function isOnlineNow(): boolean {
  return lastKnownOnline;
}
