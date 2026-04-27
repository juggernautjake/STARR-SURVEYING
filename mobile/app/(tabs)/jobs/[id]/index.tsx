import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { JobTodayRollupCard } from '@/lib/JobTodayRollup';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { PointCard } from '@/lib/PointCard';
import { ReceiptRollupCard } from '@/lib/ReceiptRollupCard';
import { StageChip } from '@/lib/StageChip';
import { useJobDataPoints } from '@/lib/dataPoints';
import { useJob, useJobTodayRollup } from '@/lib/jobs';
import { useJobReceiptRollup } from '@/lib/receipts';
import { colors, type Palette } from '@/lib/theme';

/**
 * Job detail — F1 #2 lands a minimal read-only view (header, stage,
 * client + address, key dates) so taps from the list go somewhere
 * useful. F1 #3 expands this into the full plan §5.2 detail with the
 * Points / Media / Files / Notes / Time / Expenses / Crew sub-tabs.
 */
export default function JobDetailScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { id } = useLocalSearchParams<{ id: string }>();
  const { job, isLoading } = useJob(id);
  const { rollup, isLoading: rollupLoading } = useJobReceiptRollup(id ?? null);
  const { rollup: todayRollup, isLoading: todayLoading } = useJobTodayRollup(
    id ?? null
  );
  const { points } = useJobDataPoints(id ?? null);

  if (isLoading) return <LoadingSplash />;

  if (!job) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            Job not found
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            This job may have been archived or deleted from the web admin,
            or sync hasn&apos;t reached this device yet.
          </Text>
          <Button label="Back to jobs" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text
            style={[styles.heading, { color: palette.text }]}
            numberOfLines={2}
          >
            {job.name?.trim() || '(unnamed job)'}
          </Text>
        </View>

        <View style={styles.stageRow}>
          <StageChip stage={job.stage} />
          {job.job_number ? (
            <Text style={[styles.jobNumber, { color: palette.muted }]}>
              {job.job_number}
            </Text>
          ) : null}
        </View>

        <View style={styles.actionsRow}>
          <Button
            label="+ Point"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/capture',
                params: { jobId: job.id ?? '' },
              })
            }
            accessibilityHint="Capture a new survey data point on this job."
          />
        </View>

        <JobTodayRollupCard
          rollup={todayRollup}
          palette={palette}
          isLoading={todayLoading}
          onCapture={() =>
            router.push({
              pathname: '/(tabs)/capture',
              params: { jobId: job.id ?? '' },
            })
          }
        />

        <Section title="Client" palette={palette}>
          <Field label="Name" value={job.client_name} palette={palette} />
          <Field label="Company" value={job.client_company} palette={palette} />
          <Field label="Email" value={job.client_email} palette={palette} />
          <Field label="Phone" value={job.client_phone} palette={palette} />
        </Section>

        <Section title="Property" palette={palette}>
          <Field
            label="Address"
            value={composeAddress(job)}
            palette={palette}
          />
          <Field label="County" value={job.county} palette={palette} />
          <Field
            label="Acreage"
            value={job.acreage != null ? String(job.acreage) : null}
            palette={palette}
          />
          <Field
            label="Survey type"
            value={job.survey_type}
            palette={palette}
          />
        </Section>

        <View style={styles.rollupBlock}>
          <ReceiptRollupCard rollup={rollup} isLoading={rollupLoading} />
        </View>

        {/* Data points — F3 #4. Shows the most recent N; expanding to
            a full per-job list lands in F3 polish. */}
        <Section title={`Points (${points.length})`} palette={palette}>
          {points.length === 0 ? (
            <Text style={[styles.pointsEmpty, { color: palette.muted }]}>
              No points captured yet — tap +&nbsp;Point above to start.
            </Text>
          ) : (
            <>
              {points.slice(0, 8).map((p) => (
                <PointCard
                  key={p.id ?? ''}
                  point={p}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/jobs/[id]/points/[pointId]',
                      params: { id: id ?? '', pointId: p.id ?? '' },
                    })
                  }
                />
              ))}
              {points.length > 8 ? (
                <Text style={[styles.pointsMore, { color: palette.muted }]}>
                  + {points.length - 8} more — full list lands in F3 polish.
                </Text>
              ) : null}
            </>
          )}
        </Section>

        <Section title="Timeline" palette={palette}>
          <Field
            label="Received"
            value={formatDate(job.date_received)}
            palette={palette}
          />
          <Field
            label="Quoted"
            value={formatDate(job.date_quoted)}
            palette={palette}
          />
          <Field
            label="Accepted"
            value={formatDate(job.date_accepted)}
            palette={palette}
          />
          <Field
            label="Started"
            value={formatDate(job.date_started)}
            palette={palette}
          />
          <Field
            label="Deadline"
            value={formatDate(job.deadline)}
            palette={palette}
          />
        </Section>

        <View style={styles.subTabsHint}>
          <Text style={[styles.hint, { color: palette.muted }]}>
            Points / Media / Files / Notes / Time / Expenses / Crew sub-tabs
            land in F1 #3. Today this screen is read-only.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  palette: Palette;
}

function Section({ title, children, palette }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.muted }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

interface FieldProps {
  label: string;
  value: string | null | undefined;
  palette: Palette;
}

function Field({ label, value, palette }: FieldProps) {
  if (!value || !value.trim()) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>
        {label}
      </Text>
      <Text style={[styles.fieldValue, { color: palette.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function composeAddress(job: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const street = job.address?.trim() ?? '';
  const cityState = [job.city?.trim(), job.state?.trim()]
    .filter(Boolean)
    .join(', ');
  const zip = job.zip?.trim() ?? '';
  const parts = [street, [cityState, zip].filter(Boolean).join(' ')].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join('\n') : null;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  heading: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  actionsRow: {
    marginBottom: 24,
  },
  jobNumber: {
    fontSize: 14,
    fontFamily: 'Menlo',
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
  fieldRow: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 16,
    lineHeight: 22,
  },
  rollupBlock: {
    marginBottom: 24,
  },
  pointsEmpty: {
    fontSize: 14,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  pointsMore: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingTop: 8,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  subTabsHint: {
    paddingTop: 16,
  },
  hint: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
