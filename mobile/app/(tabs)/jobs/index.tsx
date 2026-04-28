import { router } from 'expo-router';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobCard } from '@/lib/JobCard';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { useJobs, type Job } from '@/lib/jobs';
import {
  tabletContainerStyle,
  useResponsiveLayout,
} from '@/lib/responsive';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Jobs tab — F1 #2 read-only list.
 *
 * Pulls from the local PowerSync mirror via `useJobs()`. Renders even
 * when offline (against whatever sync has delivered so far) and
 * re-renders within ms when new jobs arrive from the server.
 *
 * Defer to F1 polish:
 *   - Search input + debounce
 *   - Stage filter chips
 *   - Pinned-favorites section at top (per plan §5.2)
 *   - "active today" / "crew on-site" / "syncing" indicators per
 *     plan §5.2 (need cross-table queries against job_time_entries +
 *     location_stops + PowerSync sync state)
 *   - Pull-to-refresh visual (no-op on data — sync is continuous —
 *     but a feel-good gesture)
 */
export default function JobsScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const { jobs, isLoading } = useJobs();
  // Tablet support: clamp content to a comfortable reading width on
  // ≥600 dp displays so the cards don't span 1100 px on an iPad.
  const { isTablet } = useResponsiveLayout();
  const tabletStyle = tabletContainerStyle(isTablet);

  if (isLoading && jobs.length === 0) return <LoadingSplash />;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={[styles.headerRow, tabletStyle]}>
        <Text style={[styles.heading, { color: palette.text }]}>Jobs</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={[styles.count, { color: palette.muted }]}>
            {jobs.length}
          </Text>
          {/* Cross-notes search entry. Tap → modal-presented
              /(tabs)/jobs/search screen with auto-focused input. */}
          <Pressable
            onPress={() => router.push('/(tabs)/jobs/search')}
            accessibilityRole="button"
            accessibilityLabel="Search notes"
            accessibilityHint="Opens the cross-notes search across every job and point on this device."
            hitSlop={8}
            style={({ pressed }) => ({
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: palette.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontSize: 14, color: palette.text }}>
              🔍 Search
            </Text>
          </Pressable>
        </View>
      </View>

      {jobs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            No jobs yet
          </Text>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Jobs are created in the web admin at /admin/jobs. Once they
            sync, they show up here. Mobile job creation lands later
            in Phase F1.
          </Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={keyForJob}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              onPress={() => router.push(`/(tabs)/jobs/${item.id}`)}
            />
          )}
          contentContainerStyle={[styles.listContent, tabletStyle]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function keyForJob(job: Job): string {
  // PowerSync's id column always exists, but type the schema as
  // string-or-undefined to be defensive.
  return job.id ?? '';
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
  },
  count: {
    fontSize: 15,
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});
