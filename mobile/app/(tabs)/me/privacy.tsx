/**
 * Privacy panel — transparent timeline + disclosure.
 *
 * Per plan §5.10.1 the privacy contract is: "tracking only happens
 * while you're clocked in, the data is yours to inspect, and the
 * dispatcher only sees the same rows you can see here." This screen
 * makes that contract observable.
 *
 * Two surfaces:
 *
 *   1. Disclosure block — what we capture (lat/lon, accuracy, battery
 *      snapshot), when (only between clock-in and clock-out), and who
 *      sees it (the surveyor + admin / dispatcher roles).
 *
 *   2. Today's timeline — every location_pings row the device has
 *      written for the current user, last 24h. Read-only; pings cannot
 *      be edited from mobile by design (the table is append-only on
 *      the server side too — see seeds/223 RLS).
 *
 * What this is NOT:
 *
 *   - There is no "pause tracking" toggle. Pausing mid-shift would
 *     violate the contract from the OTHER side: the dispatcher would
 *     think the user had left a job site when really they'd silently
 *     paused. The only way to stop tracking is to clock out (which
 *     does so atomically — see useClockOut + stopBackgroundTracking).
 */
import { Stack, router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type OwnPingRow,
  useOwnLocationPings,
} from '@/lib/locationTracker';
import { colors } from '@/lib/theme';

export default function PrivacyScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  // Last 24 h. The Me-tab summary uses the same hook; both stay in
  // sync via PowerSync's reactive query layer.
  const pings = useOwnLocationPings(24);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to Me"
          hitSlop={12}
        >
          <Text style={[styles.backChevron, { color: palette.accent }]}>
            ‹ Back
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: palette.text }]}>
          Privacy & Tracking
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.disclosure,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.disclosureTitle, { color: palette.text }]}>
            What Starr Field tracks
          </Text>
          <DisclosureRow
            palette={palette}
            label="Coordinates"
            value="Latitude, longitude, accuracy"
          />
          <DisclosureRow
            palette={palette}
            label="Battery snapshot"
            value="Percent + charging state (helps the dispatcher tell a phone-died from a reception drop)"
          />
          <DisclosureRow
            palette={palette}
            label="When"
            value="Only while you're clocked in. Tracking starts on clock-in and stops within seconds of clock-out."
          />
          <DisclosureRow
            palette={palette}
            label="Cadence"
            value="Every 30 seconds (high battery), 60 s (medium), or 120 s (low) — automatic based on your phone's battery level."
          />
          <DisclosureRow
            palette={palette}
            label="Who sees it"
            value="You (here), and admins / dispatchers via the office Team page. No third parties; no advertising."
          />
          <DisclosureRow
            palette={palette}
            label="Storage"
            value="Locally on your phone (in Starr Field's private SQLite) and in your private Starr Surveying workspace on Supabase."
            last
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.muted }]}>
              Today’s timeline
            </Text>
            <Text style={[styles.sectionCount, { color: palette.muted }]}>
              {pings.length} ping{pings.length === 1 ? '' : 's'}
            </Text>
          </View>

          {pings.length === 0 ? (
            <Text style={[styles.empty, { color: palette.muted }]}>
              Nothing tracked in the last 24 hours. Tracking only runs
              while you’re clocked in.
            </Text>
          ) : (
            pings.map((p) => <PingCard key={p.id} ping={p} palette={palette} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface DisclosureRowProps {
  label: string;
  value: string;
  last?: boolean;
  palette: ReturnType<typeof paletteOf>;
}

function DisclosureRow({ label, value, last, palette }: DisclosureRowProps) {
  return (
    <View
      style={[
        styles.dRow,
        last
          ? null
          : { borderBottomColor: palette.border, borderBottomWidth: 1 },
      ]}
    >
      <Text style={[styles.dLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.dValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

interface PingCardProps {
  ping: OwnPingRow;
  palette: ReturnType<typeof paletteOf>;
}

function PingCard({ ping, palette }: PingCardProps) {
  const captured = new Date(ping.captured_at);
  const time = captured.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const ageMin = Math.max(
    0,
    Math.floor((Date.now() - captured.getTime()) / 60_000)
  );
  const ageLabel =
    ageMin < 1
      ? 'just now'
      : ageMin < 60
        ? `${ageMin}m ago`
        : `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`;

  const sourceLabel =
    ping.source === 'clock_in'
      ? '⏵ Clock-in'
      : ping.source === 'clock_out'
        ? '⏹ Clock-out'
        : ping.source === 'foreground'
          ? 'In-app'
          : 'Background';

  return (
    <View
      style={[
        styles.pingCard,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.pingHeader}>
        <Text style={[styles.pingTime, { color: palette.text }]}>{time}</Text>
        <Text style={[styles.pingAge, { color: palette.muted }]}>
          {ageLabel}
        </Text>
      </View>

      <Text style={[styles.pingMeta, { color: palette.muted }]}>
        {sourceLabel}
      </Text>
      <Text style={[styles.pingMeta, { color: palette.muted }]}>
        {ping.lat.toFixed(5)}, {ping.lon.toFixed(5)}
        {ping.accuracy_m != null
          ? ` · ±${Math.round(ping.accuracy_m)}m`
          : ''}
      </Text>
      {ping.battery_pct != null ? (
        <Text style={[styles.pingMeta, { color: palette.muted }]}>
          Battery: {ping.battery_pct}%
          {ping.is_charging ? ' · charging' : ''}
        </Text>
      ) : null}
    </View>
  );
}

function paletteOf(scheme: 'light' | 'dark') {
  return colors[scheme];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  backChevron: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: { width: 60 },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  disclosure: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  disclosureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  dRow: {
    paddingVertical: 10,
  },
  dLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 12,
  },
  empty: {
    fontSize: 14,
    paddingVertical: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  pingCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  pingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pingTime: {
    fontSize: 15,
    fontWeight: '600',
  },
  pingAge: {
    fontSize: 12,
  },
  pingMeta: {
    fontSize: 12,
    lineHeight: 18,
  },
});
