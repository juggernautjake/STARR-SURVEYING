import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { logError, logWarn } from '@/lib/log';
import { isPermissionDeniedError, promptForSettings } from '@/lib/permissionGuard';
import { useActiveTimeEntry } from '@/lib/timeTracking';
import { useCaptureReceipt } from '@/lib/receipts';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

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
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const { active } = useActiveTimeEntry();
  const captureReceipt = useCaptureReceipt();
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

  // Deep-link params from the Batch DD missing-receipt notification
  // ("/(tabs)/money/capture?stopId=...&stopArrivedAt=..."). When the
  // surveyor taps the inbox prompt, we pre-stamp the new receipt
  // with the stop's arrival time so:
  //   - AI extraction has a head-start on `transaction_at`
  //   - the bookkeeper can trace back from the receipt to the stop
  //     that prompted it (via location_stop_id)
  //   - the user-facing review screen shows a reasonable default
  //     timestamp while AI is still running
  // Both params are optional — the regular "+ Add receipt" entry
  // from the Money tab passes neither.
  const params = useLocalSearchParams<{
    stopId?: string | string[];
    stopArrivedAt?: string | string[];
  }>();
  const stopIdParam =
    typeof params.stopId === 'string' ? params.stopId : null;
  const stopArrivedAtParam =
    typeof params.stopArrivedAt === 'string' ? params.stopArrivedAt : null;
  const fromStopLabel = useMemo(() => {
    if (!stopArrivedAtParam) return null;
    const t = Date.parse(stopArrivedAtParam);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    return d.toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [stopArrivedAtParam]);

  const onCapture = async (source: 'camera' | 'library') => {
    if (busy) return;
    setBusy(source);
    const jobId = active?.entry.job_id ?? null;
    const jobTimeEntryId = active?.entry.id ?? null;
    try {
      const result = await captureReceipt({
        source,
        // If the user is clocked in, default the receipt to that job
        // and time entry. The user can re-assign on the detail screen
        // (F2 #4) or the bookkeeper can fix it on the web side.
        jobId,
        jobTimeEntryId,
        // Pre-fill from the deep-link when present (Batch EE).
        transactionAt: stopArrivedAtParam,
        locationStopId: stopIdParam,
      });
      if (!result) {
        // useCaptureReceipt() returns null only when ImagePicker's
        // result.canceled fires — every other outcome throws. Stay on
        // the screen so the user can pick the other source without
        // bouncing back to the list.
        return;
      }
      // Success: dismiss back to the list. The new pending receipt is
      // visible immediately because PowerSync wrote it locally.
      router.back();
    } catch (err) {
      // Permission denials get the Settings deep-link prompt; other
      // failures keep the generic "Capture failed" alert.
      const deniedKind = isPermissionDeniedError(err);
      if (deniedKind) {
        logWarn('moneyCapture.onCapture', 'permission denied', err, {
          source,
          job_id: jobId,
          kind: deniedKind,
        });
        promptForSettings({ kind: deniedKind });
      } else {
        // Screen-level capture so Sentry has the full handler context
        // even when the underlying lib already logged. pickAndCompress
        // / uploadToBucket errors land here from logWarn-only origins;
        // this promotes them to a real event tied to the user's tap.
        logError('moneyCapture.onCapture', 'capture flow failed', err, {
          source,
          job_id: jobId,
          job_time_entry_id: jobTimeEntryId,
        });
        Alert.alert(
          'Capture failed',
          err instanceof Error ? err.message : String(err)
        );
      }
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
        {fromStopLabel ? (
          <View
            style={[
              styles.fromStopCallout,
              {
                backgroundColor: '#FEF3C7',
                borderColor: '#D97706',
              },
            ]}
          >
            <Text style={[styles.calloutTitle, { color: '#92400E' }]}>
              🧾 Forget a receipt?
            </Text>
            <Text style={[styles.calloutBody, { color: '#1F2733' }]}>
              We&apos;ll stamp this receipt with your stop time
              ({fromStopLabel}) so the AI extraction has a head-start
              and the bookkeeper can trace it back to the stop.
            </Text>
          </View>
        ) : null}
        {active ? (
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Receipt will be linked to your active clock-in (
            {active.jobName ?? 'job'}).
          </Text>
        ) : (
          <View
            style={[
              styles.notClockedInCallout,
              {
                backgroundColor: palette.surface,
                borderColor: palette.danger,
              },
            ]}
          >
            <Text style={[styles.calloutTitle, { color: palette.danger }]}>
              Not clocked in
            </Text>
            <Text style={[styles.calloutBody, { color: palette.text }]}>
              The receipt will save without a job link. Snap it now and pick a
              job on the detail screen, or clock in first to auto-link it.
            </Text>
          </View>
        )}

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
            • Direct light, no glare on the print{'\n'}
            • AI will read the vendor + total + date and ask you to
            confirm. We{'’'}ll also flag a possible duplicate if it
            matches an earlier receipt.
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
  notClockedInCallout: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  fromStopCallout: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  calloutBody: {
    fontSize: 14,
    lineHeight: 20,
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
