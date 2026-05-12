/**
 * One-time tracking-consent modal.
 *
 * Per plan §5.10.1: surveyors must understand what's tracked, when,
 * and who sees it BEFORE the OS asks them for "Always" location
 * permission. This modal is the explainer — a friendly version of
 * the disclosure block on `(tabs)/me/privacy`, gated by the
 * `lib/trackingConsent` flag so it shows once per install.
 *
 * Caller pattern (e.g. inside the clock-in flow):
 *
 *   if (await hasTrackingConsent()) {
 *     await startBackgroundTracking(...);
 *   } else {
 *     openConsentModal({
 *       onContinue: async () => {
 *         await setTrackingConsent(true);
 *         await startBackgroundTracking(...);
 *       },
 *     });
 *   }
 *
 * Two CTAs: "Continue" (proceeds to the OS prompt) and "Skip
 * tracking for now" (clock-in still happens; only background
 * tracking is bypassed). The skip path doesn't set the consent
 * flag — the explainer shows again on the next clock-in so the
 * user gets a second chance to opt in.
 */
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './Button';
import { colors } from './theme';
import { useResolvedScheme } from './themePreference';

interface Props {
  visible: boolean;
  /** User accepted — caller persists consent + kicks off the tracker. */
  onContinue: () => void;
  /** User skipped — caller clocks in WITHOUT background tracking
   *  for this shift. The consent flag stays unset so the explainer
   *  shows again next time. */
  onSkip: () => void;
}

export function TrackingConsentModal({ visible, onContinue, onSkip }: Props) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onSkip}
    >
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.title, { color: palette.text }]}>
            Tracking your work
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            Starr Field needs to record your location while you’re
            clocked in so the office knows where the crew is and your
            mileage logs are IRS-compliant. Here’s exactly what
            happens — please read before continuing.
          </Text>

          <Section
            title="When"
            body="Only between clock-in and clock-out. The tracker stops within seconds of clock-out — there is NO way to track you off the clock."
            palette={palette}
          />
          <Section
            title="What"
            body="Latitude / longitude / accuracy / battery percent / charging state. No microphone, no contacts, no other personal data."
            palette={palette}
          />
          <Section
            title="Cadence"
            body="Every 30 seconds when battery >50%, 60 seconds at 21–50%, 120 seconds at ≤20%. The app automatically slows down to protect battery."
            palette={palette}
          />
          <Section
            title="Who sees it"
            body="You (in Me → Privacy) and admins / dispatchers via the office Team page. No third parties; no advertising."
            palette={palette}
          />
          <Section
            title="Storage"
            body="Locally on your phone (encrypted SQLite) and in your private Starr Surveying workspace on Supabase. You own your data; you can request deletion through the office."
            palette={palette}
          />
          <Section
            title="Indicators"
            body="iOS shows a blue location pill in the status bar while tracking. Android shows a persistent notification (“Starr Field — clocked in”). You always know when tracking is active."
            palette={palette}
            last
          />

          <View style={[styles.callout, { borderColor: palette.accent }]}>
            <Text style={[styles.calloutTitle, { color: palette.accent }]}>
              Your phone OS will ask next
            </Text>
            <Text style={[styles.calloutBody, { color: palette.text }]}>
              After you tap Continue, your phone will show its own
              location-permission dialog. Choose “Always” so tracking
              works when the app is in your pocket. You can change this
              any time in Settings.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.actions, { borderColor: palette.border }]}>
          <View style={styles.actionRow}>
            <View style={styles.actionFlex}>
              <Button
                variant="secondary"
                label="Skip tracking for now"
                onPress={onSkip}
                accessibilityHint="Proceeds to clock-in without background tracking. The clock-in/out coordinates are still captured."
              />
            </View>
          </View>
          <View style={styles.actionRow}>
            <View style={styles.actionFlex}>
              <Button
                label="Continue"
                onPress={onContinue}
                accessibilityHint="Records your acceptance and proceeds to the OS location-permission prompt."
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface SectionProps {
  title: string;
  body: string;
  palette: (typeof colors)[keyof typeof colors];
  last?: boolean;
}

function Section({ title, body, palette, last }: SectionProps) {
  return (
    <View
      style={[
        styles.section,
        last
          ? null
          : { borderBottomColor: palette.border, borderBottomWidth: 1 },
      ]}
    >
      <Text style={[styles.sectionLabel, { color: palette.muted }]}>
        {title}
      </Text>
      <Text style={[styles.sectionBody, { color: palette.text }]}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: 24,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  section: {
    paddingVertical: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  callout: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  calloutBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
  },
  actionFlex: { flex: 1 },
});
