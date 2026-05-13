// mobile/app/accept-invite/[token].tsx
//
// Deep-link target for organization invitations. iOS Associated
// Domains (applinks:starrsoftware.com in mobile/app.json) and Android
// intentFilters route https://starrsoftware.com/accept-invite/<token>
// here when the app is installed.
//
// Phase M-11e — placeholder screen. The actual accept-and-join flow
// lands when the web-side /api/auth/accept-invite + the matching
// mobile endpoint exist (depends on master plan Phase A M-9 auth
// refactor). Until then this screen renders the token + a "tap to
// open in browser" fallback.
//
// Spec: docs/planning/in-progress/MOBILE_MULTI_TENANT.md §5.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const tokenStr = typeof token === 'string' ? token : '';

  function openInBrowser() {
    if (!tokenStr) return;
    Linking.openURL(`https://starrsoftware.com/accept-invite/${encodeURIComponent(tokenStr)}`);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.heading}>You&apos;ve been invited</Text>
        <Text style={styles.body}>
          Someone has invited you to join their organization on Starr Software.
        </Text>
        {tokenStr ? (
          <Text style={styles.token} selectable>
            Invitation code: {tokenStr.slice(0, 8)}…
          </Text>
        ) : (
          <Text style={styles.bodyMuted}>
            No invitation token found in the link.
          </Text>
        )}
        <Text style={styles.bodyMuted}>
          Tap to complete acceptance in your browser. The in-app
          acceptance flow ships in a future update.
        </Text>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={openInBrowser}
          disabled={!tokenStr}
        >
          <Text style={styles.btnPrimaryText}>Open in browser</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/')}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#152050' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
  },
  body: { fontSize: 16, color: '#FFF', lineHeight: 22, marginBottom: 12 },
  bodyMuted: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
    marginBottom: 16,
  },
  token: {
    fontFamily: 'Menlo',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  btnPrimary: {
    backgroundColor: '#FFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPrimaryText: {
    color: '#1D3095',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondaryText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
