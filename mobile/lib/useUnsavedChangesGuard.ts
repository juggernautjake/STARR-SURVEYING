/**
 * Edit-screen "discard changes?" intercept.
 *
 * Three F1+/F2/F3 edit screens (receipt, time entry, data point) all
 * need the same guard: if the user has typed-but-unsaved changes, a
 * back-swipe / hardware back / Cancel tap should prompt before
 * dropping their work. expo-router exposes the underlying React
 * Navigation `beforeRemove` event for the back-swipe / hardware path;
 * the screen's Cancel button calls `attemptDismiss()` directly so the
 * same alert copy fires on every entry.
 *
 * Usage:
 *
 *   const dirty = useMemo(() =>
 *     vendorName !== (receipt.vendor_name ?? '') ||
 *     ... etc, [vendorName, receipt.vendor_name, ...]);
 *
 *   const { attemptDismiss } = useUnsavedChangesGuard({
 *     dirty,
 *     scope: 'receiptDetail',
 *     // Customise copy when the default isn't right:
 *     message: 'Your edits to this receipt haven’t been saved.',
 *   });
 *
 *   <Pressable onPress={attemptDismiss}>Cancel</Pressable>
 *
 * After `await save()` succeeds, set `dirty` to false (or unmount via
 * router.back()) so the guard doesn't fire on the post-save dismiss.
 */
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { logInfo } from './log';

export interface UnsavedChangesGuardOptions {
  /** True when the form has unsaved input. The hook only intercepts
   *  while this is true. */
  dirty: boolean;
  /** Sentry breadcrumb scope, e.g. 'receiptDetail' / 'pointDetail'. */
  scope: string;
  /** Override the default body copy. The title is fixed at "Discard
   *  changes?" so the user sees a consistent affordance. */
  message?: string;
  /** Called when the user confirms discard (after the alert OR when
   *  dirty is false and the guard short-circuits). Defaults to a
   *  no-op since router.back() is already running for back-swipe. */
  onDiscard?: () => void;
}

interface UnsavedChangesGuardResult {
  /** Call from the Cancel button. Shows the prompt when dirty; runs
   *  router.back() (or the supplied onDiscard) immediately when
   *  clean. */
  attemptDismiss: () => void;
}

const DEFAULT_MESSAGE = 'Your unsaved edits will be lost.';

export function useUnsavedChangesGuard(
  opts: UnsavedChangesGuardOptions
): UnsavedChangesGuardResult {
  const { dirty, scope, message = DEFAULT_MESSAGE, onDiscard } = opts;
  const navigation = useNavigation();

  // Refs so the beforeRemove listener (registered once) reads the
  // latest values. Otherwise the listener captures the dirty value
  // from the first render and never updates.
  const dirtyRef = useRef(dirty);
  const messageRef = useRef(message);
  const scopeRef = useRef(scope);
  useEffect(() => {
    dirtyRef.current = dirty;
    messageRef.current = message;
    scopeRef.current = scope;
  }, [dirty, message, scope]);

  // Intercept back-swipe + hardware back. e.preventDefault() blocks
  // the navigation; we re-dispatch e.data.action when the user
  // confirms discard.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      logInfo(`${scopeRef.current}.unsavedGuard`, 'back-swipe blocked');
      Alert.alert(
        'Discard changes?',
        messageRef.current,
        [
          {
            text: 'Keep editing',
            style: 'cancel',
            onPress: () => {
              logInfo(`${scopeRef.current}.unsavedGuard`, 'kept editing');
            },
          },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              logInfo(`${scopeRef.current}.unsavedGuard`, 'discarded');
              navigation.dispatch(e.data.action);
            },
          },
        ],
        { cancelable: true }
      );
    });
    return unsubscribe;
  }, [navigation]);

  const attemptDismiss = useCallback(() => {
    if (!dirtyRef.current) {
      onDiscard?.();
      navigation.goBack();
      return;
    }
    logInfo(`${scopeRef.current}.unsavedGuard`, 'cancel tapped (dirty)');
    Alert.alert(
      'Discard changes?',
      messageRef.current,
      [
        {
          text: 'Keep editing',
          style: 'cancel',
          onPress: () => {
            logInfo(`${scopeRef.current}.unsavedGuard`, 'kept editing');
          },
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            logInfo(`${scopeRef.current}.unsavedGuard`, 'discarded');
            onDiscard?.();
            navigation.goBack();
          },
        },
      ],
      { cancelable: true }
    );
  }, [navigation, onDiscard]);

  return { attemptDismiss };
}
