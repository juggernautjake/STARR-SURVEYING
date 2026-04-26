/**
 * Sign in with Apple button — iOS only.
 *
 * Uses Apple's native button via expo-apple-authentication so the
 * styling and HIG compliance are handled for us. Tapping it runs
 * AppleAuthentication.signInAsync, then hands the resulting identity
 * token to Supabase via signInWithIdToken; AuthProvider's session
 * subscription handles the rest.
 *
 * Returns null on Android — Sign in with Apple is iOS-only by design.
 * Google native sign-in is deferred to F0 #2d / F1 (it needs a GCP
 * project + 3 client IDs from the user before it can work).
 *
 * Activation gates:
 *   - Apple developer account with Sign in with Apple capability
 *     enabled for this bundle id (com.starrsoftware.starrfield)
 *   - Supabase Auth → Providers → Apple enabled, with the Services ID
 *     and key/team configured
 *
 * Without those, the button still renders but Supabase rejects the
 * token. The error surfaces to the parent via `onError`.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, useColorScheme } from 'react-native';

import { logWarn } from './log';
import { supabase } from './supabase';

interface AppleSignInButtonProps {
  /** Called with a user-presentable error message when sign-in fails. */
  onError?: (message: string) => void;
}

export function AppleSignInButton({ onError }: AppleSignInButtonProps) {
  const scheme = useColorScheme() ?? 'dark';
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (mounted) setAvailable(ok);
      })
      .catch((err) => {
        // Older iOS or simulator without Apple ID — button hides.
        // Real entitlement misconfig also lands here; surface to
        // Sentry so it's debuggable rather than silently hidden.
        logWarn('appleSignIn.isAvailable', 'check failed', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (Platform.OS !== 'ios' || !available) return null;

  const onPress = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });
      if (!credential.identityToken) {
        onError?.('Apple did not return an identity token.');
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) onError?.(error.message);
      // Success path: AuthProvider catches the session via
      // onAuthStateChange and the (auth) layout redirects.
    } catch (err) {
      // ERR_REQUEST_CANCELED is a normal user dismissal — don't
      // surface as an error.
      const e = err as { code?: string; message?: string };
      if (e.code === 'ERR_REQUEST_CANCELED') return;
      onError?.(e.message ?? 'Apple sign-in failed.');
    }
  };

  return (
    <View style={styles.wrapper}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  button: {
    width: '100%',
    height: 60, // matches Button minHeight (plan §7.1 rule 2)
  },
});
