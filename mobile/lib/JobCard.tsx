/**
 * Job list row.
 *
 * Layout per plan §5.2 / §7.1:
 *   ┌────────────────────────────────────────┐
 *   │  Job name                              │
 *   │  job_number · client_name              │
 *   │  address                       [stage] │
 *   └────────────────────────────────────────┘
 *
 * Tap area is the entire card (minHeight 76 satisfies plan §7.1
 * rule 2 glove-friendly). Tapping navigates to the job-detail screen
 * which lands in F1 #3 — for F1 #2, the route is registered as a
 * placeholder so taps don't crash.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StageChip } from './StageChip';
import type { Job } from './jobs';
import { colors } from './theme';
import { useResolvedScheme } from './themePreference';

interface JobCardProps {
  job: Job;
  onPress: () => void;
}

export function JobCard({ job, onPress }: JobCardProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  // Fallbacks keep the layout stable when sync has only delivered a
  // partial row (rare but possible during bucket priority backlogs).
  const name = job.name?.trim() || '(unnamed job)';
  const jobNumber = job.job_number?.trim() ?? '';
  const clientName = job.client_name?.trim() ?? '';
  const address = job.address?.trim() ?? '';

  // "{job_number} · {client_name}" — collapse the separator if
  // either side is empty so we don't render dangling middots.
  const subtitle = [jobNumber, clientName].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open job ${name}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? palette.border : palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
          {name}
        </Text>
      </View>

      {subtitle ? (
        <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        <Text
          style={[styles.address, { color: palette.muted }]}
          numberOfLines={1}
        >
          {address || ' '}
          {/* nbsp keeps the row height stable when address is empty */}
        </Text>
        <StageChip stage={job.stage} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  address: {
    flex: 1,
    fontSize: 13,
  },
});
