import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { useActiveTimeEntry } from '@/lib/timeTracking';
import { useCaptureReceipt } from '@/lib/receipts';
import { colors } from '@/lib/theme';

/**
 * Receipt-capture entry point — F2 #2.
 *
 * Two source choices: snap a new photo with the camera, or attach an
 * existing photo from the library (covers the case where the user
 * snapped the receipt before opening the app — common for crews who
 * Apple-Wallet-receipt at the pump and forget about the app until
 * later).
 *
 * Flow:
 *   1. User taps a source → expo-image-picker handles permission +
 *      OS picker UI.
 *   2. Image is downscaled + JPEG-compressed (lib/receipts.ts).
 *   3. Uploaded to Supabase Storage at `{user_id}/{receipt_id}.jpg`.
 *   4. INSERT a 'pending' receipts row pre-linked to whatever job the
 *      user is currently clocked into.
 *   5. Worker AI-extraction (F2 #5) picks it up server-side and writes
 *      back vendor/totals/category over the next ~5 s; the list shows
 *      "AI working…" until then.
 *   6. Modal dismisses; the new pending receipt is at the top of the
 *      list when the user lands back on /money.
 */
export default function CaptureReceiptScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { active } = useActiveTimeEntry();
  const captureReceipt = useCaptureReceipt();
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

  const onCapture = async (source: 'camera' | 'library') => {
    if (busy) return;
    setBusy(source);
    try {
      const result = await captureReceipt({
        source,
        // If the user is clocked in, default the receipt to that job
        // and time entry. The user can re-assign on the detail screen
        // (F2 #4) or the bookkeeper can fix it on the web side.
        jobId: active?.entry.job_id ?? null,
        jobTimeEntryId: active?.entry.id ?? null,
      });
      if (!result) {
        // Cancelled — leave the user on this screen so they can pick
        // a different source without bouncing back to the list.
        return;
      }
      // Success: dismiss back to the list. The new pending receipt is
      // visible immediately because PowerSync wrote it locally.
      router.back();
    } catch (err) {
      Alert.alert('Capture failed', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: palette.text }]}>Receipt</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.closeButton}
        >
          <Text style={[styles.closeText, { color: palette.muted }]}>Cancel</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          {active
            ? `Receipt will be linked to your active clock-in (${active.jobName ?? 'job'}).`
            : 'You’re not clocked in — the receipt will save without a job link. Edit it on the detail screen later.'}
        </Text>

        <View style={styles.spacer} />

        <Button
          label="Snap a new photo"
          onPress={() => onCapture('camera')}
          loading={busy === 'camera'}
          disabled={busy === 'library'}
          accessibilityHint="Opens the camera. After you snap, AI extracts the vendor, total, and category."
        />
        <View style={styles.gap} />
        <Button
          variant="secondary"
          label="Attach from photo library"
          onPress={() => onCapture('library')}
          loading={busy === 'library'}
          disabled={busy === 'camera'}
          accessibilityHint="Picks an existing photo from your library."
        />

        <View style={styles.tipBlock}>
          <Text style={[styles.tipTitle, { color: palette.muted }]}>
            Snap tips
          </Text>
          <Text style={[styles.tipBody, { color: palette.muted }]}>
            • Lay the receipt flat on a contrasting surface{'\n'}
            • Fill the frame {'—'} edges of the paper visible{'\n'}
            • Direct light, no glare on the print
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  spacer: { flex: 1 },
  gap: { height: 12 },
  tipBlock: {
    marginTop: 24,
    paddingTop: 16,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tipBody: {
    fontSize: 14,
    lineHeight: 22,
  },
});
