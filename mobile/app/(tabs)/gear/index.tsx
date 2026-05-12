/**
 * Gear tab — index dashboard for Equipment Managers.
 *
 * Phase F10.8 §5.12.9.2 — the role-gated 6th tab. v1 ships an
 * at-a-glance dashboard with the four numbers an EM glances at
 * before walking into the cage:
 *
 *   * Open maintenance — events with state ∈ scheduled / in_
 *     progress / awaiting_parts / awaiting_vendor.
 *   * Failed QA — needs re-work; legally suspect to roll out.
 *   * Cert expiring 60d — calibrations the EM should book a
 *     vendor for soon.
 *   * Out today — equipment_reservations checked out for jobs
 *     active today.
 *
 * Each tile is tap-able; v1 routes the EM to the admin web for
 * the full drilldown (mobile drilldowns ship in v2 polish). A
 * companion "Open admin web" button at the bottom of the screen
 * deep-links to the same admin pages for any other EM workflow.
 */
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { useIsEquipmentManager } from '@/lib/myRoles';
import { colors, type Palette } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';
import { useQuery } from '@powersync/react';

const ADMIN_WEB_BASE =
  process.env.EXPO_PUBLIC_ADMIN_WEB_URL ?? 'https://app.starrsurveying.com';

export default function GearIndexScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const { session } = useAuth();
  const { isEquipmentManager, isLoading: rolesLoading } = useIsEquipmentManager();

  // Pull the four stat counts in parallel from PowerSync's local
  // SQLite. Each query is cheap; useQuery memoises so re-renders
  // don't re-issue them.
  const { data: openMaintRows } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM maintenance_events
       WHERE state IN ('scheduled', 'in_progress', 'awaiting_parts', 'awaiting_vendor')`,
    []
  );
  const { data: failedQaRows } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM maintenance_events
       WHERE state = 'failed_qa'`,
    []
  );
  const { data: certExpiringRows } = useQuery<{ count: number }>(
    // Cert expiring within 60 days OR overdue — same set the
    // §5.12.7.1 Today banner surfaces on the admin web.
    `SELECT COUNT(*) AS count FROM equipment_inventory
       WHERE next_calibration_due_at IS NOT NULL
         AND retired_at IS NULL
         AND DATE(next_calibration_due_at) <= DATE('now', '+60 days')`,
    []
  );
  const { data: outTodayRows } = useQuery<{ count: number }>(
    `SELECT COUNT(*) AS count FROM equipment_reservations
       WHERE state = 'checked_out'
         AND DATE(reserved_to) >= DATE('now')`,
    []
  );

  const openMaintCount = openMaintRows?.[0]?.count ?? 0;
  const failedQaCount = failedQaRows?.[0]?.count ?? 0;
  const certExpiringCount = certExpiringRows?.[0]?.count ?? 0;
  const outTodayCount = outTodayRows?.[0]?.count ?? 0;

  if (rolesLoading) {
    return <LoadingSplash />;
  }
  if (!isEquipmentManager) {
    // Defense in depth — the tab is also hidden in the parent
    // layout. This catches deep links + role demotion mid-session.
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            Gear tab is for Equipment Managers
          </Text>
          <Text style={[styles.emptyCaption, { color: palette.muted }]}>
            Ask an admin to add the &ldquo;equipment_manager&rdquo;
            role to your account if you should see this.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const emEmail = session?.user.email ?? '';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <Text style={[styles.label, { color: palette.muted }]}>
            🛠 Gear · Equipment Manager
          </Text>
          <Text
            style={[styles.email, { color: palette.text }]}
            selectable
            numberOfLines={1}
          >
            {emEmail}
          </Text>
        </View>

        <View style={styles.grid}>
          <StatTile
            glyph="🛠"
            label="Open maintenance"
            value={openMaintCount}
            tone="default"
            palette={palette}
            href={`${ADMIN_WEB_BASE}/admin/equipment/maintenance`}
          />
          <StatTile
            glyph="⚠"
            label="Failed QA"
            value={failedQaCount}
            tone={failedQaCount > 0 ? 'red' : 'default'}
            palette={palette}
            href={`${ADMIN_WEB_BASE}/admin/equipment/maintenance`}
          />
          <StatTile
            glyph="🧪"
            label="Cert expiring 60d"
            value={certExpiringCount}
            tone={certExpiringCount > 0 ? 'amber' : 'default'}
            palette={palette}
            href={`${ADMIN_WEB_BASE}/admin/equipment/today`}
          />
          <StatTile
            glyph="📤"
            label="Out today"
            value={outTodayCount}
            tone="default"
            palette={palette}
            href={`${ADMIN_WEB_BASE}/admin/equipment/today`}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.muted }]}>
            Quick actions
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open admin web for full equipment dashboard"
              onPress={() => {
                void Linking.openURL(
                  `${ADMIN_WEB_BASE}/admin/equipment/today`
                );
              }}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={[styles.actionGlyph, { color: palette.text }]}
              >
                🌐
              </Text>
              <View style={styles.actionTextBlock}>
                <Text
                  style={[styles.actionTitle, { color: palette.text }]}
                >
                  Open admin web
                </Text>
                <Text
                  style={[styles.actionCaption, { color: palette.muted }]}
                >
                  Today rollup, calendar, drilldowns — full UX is on
                  the web for now.
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.footnote, { color: palette.muted }]}>
          Drilldowns and scan-to-checkout from the field are on the
          roadmap. If the counts above stay at zero, ask the office
          to verify equipment sync is enabled for your device.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface StatTileProps {
  glyph: string;
  label: string;
  value: number;
  tone: 'default' | 'red' | 'amber';
  palette: Palette;
  href: string;
}

function StatTile({
  glyph,
  label,
  value,
  tone,
  palette,
  href,
}: StatTileProps) {
  const toneBg =
    tone === 'red'
      ? '#FEE2E2'
      : tone === 'amber'
      ? '#FEF3C7'
      : palette.surface;
  const toneFg =
    tone === 'red'
      ? '#7F1D1D'
      : tone === 'amber'
      ? '#78350F'
      : palette.text;
  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(href);
      }}
      accessibilityRole="link"
      accessibilityLabel={`${value} ${label}, opens admin web`}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: toneBg,
          borderColor: palette.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.tileGlyph, { color: toneFg }]}>{glyph}</Text>
      <Text
        style={[
          styles.tileValue,
          { color: toneFg, fontVariant: ['tabular-nums'] },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.tileLabel, { color: toneFg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 8 },
  headerBlock: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 140,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  tileGlyph: { fontSize: 22 },
  tileValue: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRow: {
    gap: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionGlyph: {
    fontSize: 22,
  },
  actionTextBlock: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionCaption: {
    fontSize: 12,
    marginTop: 2,
  },
  footnote: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 16,
    lineHeight: 16,
  },
  empty: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyCaption: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
