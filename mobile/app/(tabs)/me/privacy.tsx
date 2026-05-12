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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type OwnPingRow,
  type OwnSegmentRow,
  type OwnStopRow,
  useOwnLocationPings,
  useOwnSegmentsForDate,
  useOwnStopsForDate,
  useOwnTimelineSummary,
} from '@/lib/locationTracker';
import { ScreenHeader } from '@/lib/ScreenHeader';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

export default function PrivacyScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  // Last 24 h of raw pings. The Me-tab summary uses the same hook;
  // both stay in sync via PowerSync's reactive query layer.
  const pings = useOwnLocationPings(24);

  // Today's derived stops + segments — same data the dispatcher sees
  // on /admin/timeline. Server-side derivation runs on the
  // dispatcher's "Recompute" tap; mobile is a read-only consumer.
  const stops = useOwnStopsForDate(0);
  const segments = useOwnSegmentsForDate(0);
  const summary = useOwnTimelineSummary(0);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader back title="Privacy & Tracking" />

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

        {/* Day summary — same totals the dispatcher sees on
            /admin/timeline. Renders only when the server-side
            derivation has run (stops + segments arrive via
            PowerSync within seconds of the dispatcher's Recompute
            tap, OR overnight via the future pg_cron schedule). */}
        {stops.length > 0 || segments.length > 0 ? (
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <Text style={[styles.summaryTitle, { color: palette.text }]}>
              Today’s day, summarised
            </Text>
            <View style={styles.summaryRow}>
              <SummaryStat
                label="Stops"
                value={String(summary.stop_count)}
                palette={palette}
              />
              <SummaryStat
                label="Miles"
                value={summary.total_distance_miles.toFixed(1)}
                palette={palette}
              />
              <SummaryStat
                label="Stationary"
                value={formatStationary(summary.total_dwell_minutes)}
                palette={palette}
              />
            </View>
            <Text style={[styles.summaryHint, { color: palette.muted }]}>
              These totals match what the office sees. Stops are
              periods where you stayed within ~50 m for ≥5 min;
              segments are the travel between them.
            </Text>
            <View style={styles.timelineList}>
              {stops.map((stop, i) => (
                <View key={stop.id}>
                  <StopRow stop={stop} palette={palette} />
                  {segments[i] ? (
                    <SegmentRow
                      segment={segments[i]}
                      palette={palette}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: palette.muted }]}>
              Today’s raw pings
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

interface SummaryStatProps {
  label: string;
  value: string;
  palette: ReturnType<typeof paletteOf>;
}

function SummaryStat({ label, value, palette }: SummaryStatProps) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryStatValue, { color: palette.text }]}>
        {value}
      </Text>
      <Text style={[styles.summaryStatLabel, { color: palette.muted }]}>
        {label}
      </Text>
    </View>
  );
}

function StopRow({
  stop,
  palette,
}: {
  stop: OwnStopRow;
  palette: ReturnType<typeof paletteOf>;
}) {
  const arrived = new Date(stop.arrived_at);
  const departed = new Date(stop.departed_at);
  return (
    <View style={[styles.stopCard, { borderColor: palette.border }]}>
      <Text style={[styles.stopMarker, { color: palette.accent }]}>📍</Text>
      <View style={styles.stopBody}>
        <Text style={[styles.stopTime, { color: palette.text }]}>
          {arrived.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          → {departed.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
        <Text style={[styles.stopMeta, { color: palette.muted }]}>
          {stop.duration_minutes}m{' · '}
          {stop.place_name ??
            `${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}`}
        </Text>
      </View>
    </View>
  );
}

function SegmentRow({
  segment,
  palette,
}: {
  segment: OwnSegmentRow;
  palette: ReturnType<typeof paletteOf>;
}) {
  const meters = segment.distance_meters ?? 0;
  const miles = meters / 1609.344;
  const minutes =
    (new Date(segment.ended_at).getTime() -
      new Date(segment.started_at).getTime()) /
    60_000;
  return (
    <View style={styles.segmentRail}>
      <View
        style={[styles.segmentLine, { backgroundColor: palette.border }]}
      />
      <Text style={[styles.segmentLabel, { color: palette.muted }]}>
        🚗 {miles.toFixed(2)} mi · {Math.round(minutes)}m in transit
      </Text>
    </View>
  );
}

function formatStationary(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function paletteOf(scheme: 'light' | 'dark') {
  return colors[scheme];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  summaryHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  timelineList: {
    gap: 4,
  },
  stopCard: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  stopMarker: {
    fontSize: 18,
    width: 22,
    textAlign: 'center',
  },
  stopBody: { flex: 1 },
  stopTime: {
    fontSize: 13,
    fontWeight: '600',
  },
  stopMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  segmentRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 22,
  },
  segmentLine: {
    width: 2,
    height: 18,
    marginLeft: 10,
  },
  segmentLabel: {
    fontSize: 12,
  },
});
