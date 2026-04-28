/**
 * Full-screen lock UI shown when the AuthProvider's `locked` state is
 * true. Auto-prompts biometric on mount; if the user cancels, they
 * can tap the button to retry, or "Sign out" to escape entirely.
 *
 * Intentionally NOT inside the Stack/Tabs hierarchy — rendered by the
 * AuthProvider as a sibling of children with absolute positioning, so
 * the underlying screen stays mounted (no flicker on unlock) but is
 * visually occluded.
 *
 * Phase F0 #2b — STARR_FIELD_MOBILE_APP_PLAN.md §5.1.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { authenticate, biometricLabel, getBiometricCapability } from './biometric';
import { colors } from './theme';

interface LockOverlayProps {
  /** Called when biometric (or fallback) auth succeeds. */
  onUnlock: () => void;
  /** Called if the user gives up and signs out. */
  onSignOut: () => void;
}

export function LockOverlay({ onUnlock, onSignOut }: LockOverlayProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const [kindLabel, setKindLabel] = useState<string>('biometric');
  const [busy, setBusy] = useState(false);

  // Guard against StrictMode / re-mount auto-prompt double-fire.
  const promptedOnce = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cap = await getBiometricCapability();
      if (!mounted) return;
      setKindLabel(biometricLabel(cap.kind));

      // Auto-prompt on first mount only. If the user cancels, they
      // re-trigger via the button; otherwise we'd loop forever.
      if (!promptedOnce.current && cap.available) {
        promptedOnce.current = true;
        const ok = await authenticate('Unlock Starr Field');
        if (mounted && ok) onUnlock();
      }
    })();
    return () => {
      mounted = false;
    };
    // onUnlock is stable from useCallback in AuthProvider; deps empty
    // is intentional so reopen-after-cancel doesn't auto-prompt again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTryAgain = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await authenticate('Unlock Starr Field');
      if (ok) onUnlock();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: palette.background }]}>
      <Text style={[styles.title, { color: palette.text }]}>Locked</Text>
      <Text style={[styles.caption, { color: palette.muted }]}>
        Use {kindLabel} to unlock Starr Field.
      </Text>

      <View style={styles.actions}>
        <Button
          label={`Unlock with ${kindLabel}`}
          onPress={onTryAgain}
          loading={busy}
          accessibilityHint="Prompts the device biometric sensor to unlock the app"
        />
        <View style={styles.spacer} />
        <Button
          variant="secondary"
          label="Sign out instead"
          onPress={onSignOut}
          accessibilityHint="Signs out and returns to the sign-in screen"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  caption: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  actions: {
    width: '100%',
    maxWidth: 400,
  },
  spacer: { height: 12 },
});
