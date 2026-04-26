import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { TextField } from '@/lib/TextField';
import { useAuth } from '@/lib/auth';
import {
  CODE_PREFIXES,
  type CodePrefix,
  extractPrefix,
  lookupPrefix,
  suggestNextName,
} from '@/lib/dataPointCodes';
import {
  useCreateDataPoint,
  useJobPointNames,
} from '@/lib/dataPoints';
import { useJob, useJobs, type Job } from '@/lib/jobs';
import { useActiveTimeEntry } from '@/lib/timeTracking';
import { colors, type Palette } from '@/lib/theme';

/**
 * Data-point capture entry — F3 #2 ships the pre-photo flow:
 *   1. Pick (or auto-fill) the job. Default to the active clock-in
 *      job; otherwise prompt with the recent-jobs list.
 *   2. Pick a 179-code prefix from the chip row (color-matched to the
 *      arm-sleeve cards). The next number in sequence pre-fills.
 *   3. Adjust the name if needed. Special-point flags (offset /
 *      correction) hide behind a "More options" toggle so the
 *      common path stays one tap.
 *   4. Tap "Capture" — saves the point row, captures GPS / compass,
 *      then routes to the photo-capture flow (F3 #3 placeholder
 *      until that ships).
 *
 * Plan §5.3 quick-create target is <60 s; this screen aims for under
 * 5 s of taps for a known-prefix point ("BM" → "BM06" auto → tap).
 *
 * Optional `?jobId=...` query param pre-fills the job (used when the
 * user taps "+ Point" from a job detail page) and skips the picker.
 */
export default function CaptureScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { jobId: jobIdParam } = useLocalSearchParams<{ jobId?: string }>();
  const { active } = useActiveTimeEntry();

  // Job resolution — three-way priority: explicit query param,
  // then the active clock-in job, then fall through to the picker.
  const initialJobId =
    jobIdParam ?? active?.entry.job_id ?? null;
  const [jobId, setJobId] = useState<string | null>(initialJobId);

  if (!jobId) {
    return <PickJobStep palette={palette} onPick={setJobId} />;
  }
  return <CreatePointStep palette={palette} jobId={jobId} onChangeJob={() => setJobId(null)} />;
}

// ── Step 1: pick a job ────────────────────────────────────────────────────────

function PickJobStep({
  palette,
  onPick,
}: {
  palette: Palette;
  onPick: (jobId: string) => void;
}) {
  const { jobs, isLoading } = useJobs();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: palette.text }]}>New point</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.closeButton}
        >
          <Text style={[styles.closeText, { color: palette.muted }]}>
            Cancel
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: palette.muted }]}>
        Pick a job to attach this point to.
      </Text>

      <ScrollView contentContainerStyle={styles.list}>
        {isLoading && jobs.length === 0 ? (
          <Text style={[styles.empty, { color: palette.muted }]}>Loading…</Text>
        ) : jobs.length === 0 ? (
          <Text style={[styles.empty, { color: palette.muted }]}>
            No jobs synced yet — points need a job to attach to.
          </Text>
        ) : (
          jobs.map((job) => (
            <JobPickRow
              key={job.id ?? ''}
              job={job}
              palette={palette}
              onPress={() => job.id && onPick(job.id)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function JobPickRow({
  job,
  palette,
  onPress,
}: {
  job: Job;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use job ${job.name ?? 'unnamed'}`}
      style={({ pressed }) => [
        styles.jobRow,
        {
          backgroundColor: pressed ? palette.border : palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <Text
        style={[styles.jobRowName, { color: palette.text }]}
        numberOfLines={1}
      >
        {job.name?.trim() || '(unnamed job)'}
      </Text>
      <Text
        style={[styles.jobRowMeta, { color: palette.muted }]}
        numberOfLines={1}
      >
        {[job.job_number, job.client_name].filter(Boolean).join(' · ') || ' '}
      </Text>
    </Pressable>
  );
}

// ── Step 2: name + flags + capture ────────────────────────────────────────────

interface CreatePointStepProps {
  palette: Palette;
  jobId: string;
  onChangeJob: () => void;
}

function CreatePointStep({ palette, jobId, onChangeJob }: CreatePointStepProps) {
  const { session } = useAuth();
  const { job } = useJob(jobId);
  const { names: existingNames } = useJobPointNames(jobId);
  const createDataPoint = useCreateDataPoint();

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isOffset, setIsOffset] = useState(false);
  const [isCorrection, setIsCorrection] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-suggest the next number in sequence as soon as the user taps
  // a prefix chip. We DON'T re-suggest on every name change — once
  // the user has typed anything, the suggestion stops nagging.
  const userEditedRef = useRef(false);
  const onPickPrefix = (prefix: CodePrefix) => {
    if (userEditedRef.current) {
      // User already typed — just append the prefix at cursor, but
      // for v1 we just nudge them: replace the field if it's empty,
      // otherwise leave it alone.
      if (name.trim() === '') {
        setName(suggestNextName(prefix.prefix, existingNames));
      }
      return;
    }
    setName(suggestNextName(prefix.prefix, existingNames));
  };
  const onChangeName = (next: string) => {
    userEditedRef.current = true;
    setName(next);
  };

  // Live duplicate check — UNIQUE(job_id, name) is the DB-side
  // guard but the user wants feedback before they tap Save.
  const duplicate = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed === '') return false;
    return existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  }, [name, existingNames]);

  const prefix = useMemo(() => extractPrefix(name), [name]);
  const prefixInfo = useMemo(() => lookupPrefix(prefix), [prefix]);

  const onSave = async () => {
    if (submitting) return;
    if (name.trim() === '') {
      Alert.alert('Name required', 'Tap a prefix or type a point name first.');
      return;
    }
    if (duplicate) {
      Alert.alert(
        'Duplicate name',
        `A point named "${name.trim()}" already exists on this job. Pick a different name.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await createDataPoint({
        jobId,
        name,
        description,
        isOffset,
        isCorrection,
      });
      if (!result.hasGps) {
        // Soft-warn but don't block — the user can add coords later
        // from a paper note. F3 #3 will let them re-shoot GPS too.
        Alert.alert(
          'No GPS fix',
          'Point saved without coordinates. Open the point detail to add coordinates manually.',
          [
            {
              text: 'OK',
              onPress: () => router.replace(`/(tabs)/capture/${result.id}/photos`),
            },
          ]
        );
        return;
      }
      // Happy path: route to photo capture (F3 #3 will replace the
      // placeholder route with the real flow).
      router.replace(`/(tabs)/capture/${result.id}/photos`);
    } catch (err) {
      Alert.alert('Save failed', (err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Text style={[styles.heading, { color: palette.text }]}>
              New point
            </Text>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>

          {/* Job summary — tap to switch jobs */}
          <Pressable
            onPress={onChangeJob}
            accessibilityRole="button"
            accessibilityLabel="Change job"
            style={({ pressed }) => [
              styles.jobSummary,
              {
                backgroundColor: pressed ? palette.border : palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <Text style={[styles.jobSummaryLabel, { color: palette.muted }]}>
              Job
            </Text>
            <Text
              style={[styles.jobSummaryName, { color: palette.text }]}
              numberOfLines={1}
            >
              {job?.name?.trim() || '(unnamed job)'}
            </Text>
            <Text
              style={[styles.jobSummaryMeta, { color: palette.muted }]}
              numberOfLines={1}
            >
              {job
                ? [job.job_number, job.client_name].filter(Boolean).join(' · ') || 'Tap to change'
                : 'Tap to change'}
            </Text>
          </Pressable>

          {/* Prefix picker — color-matched to arm-sleeve cards */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Code (tap to pick)
            </Text>
            <View style={styles.prefixRow}>
              {CODE_PREFIXES.map((entry) => {
                const selected = prefix === entry.prefix;
                return (
                  <Pressable
                    key={entry.prefix}
                    onPress={() => onPickPrefix(entry)}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.prefix} — ${entry.label}`}
                    style={({ pressed }) => [
                      styles.prefixChip,
                      {
                        backgroundColor: selected
                          ? entry.color
                          : pressed
                            ? palette.border
                            : palette.surface,
                        borderColor: selected ? entry.color : palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.prefixChipText,
                        { color: selected ? '#FFFFFF' : palette.text },
                      ]}
                    >
                      {entry.prefix}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {prefixInfo && prefix ? (
              <Text style={[styles.prefixHint, { color: palette.muted }]}>
                {prefixInfo.label} — {prefixInfo.description}
              </Text>
            ) : null}
          </View>

          {/* Name field */}
          <View style={styles.section}>
            <TextField
              label="Point name"
              value={name}
              onChangeText={onChangeName}
              placeholder="BM01"
              autoCorrect={false}
              autoCapitalize="characters"
              editable={!submitting}
              error={duplicate ? 'A point with this name already exists on this job.' : null}
            />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <TextField
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Found 3/4&quot; iron rod, 18&quot; deep, capped Smith RPLS 1234"
              multiline
              numberOfLines={2}
              autoCorrect
              autoCapitalize="sentences"
              editable={!submitting}
            />
          </View>

          {/* Advanced — offset / correction flags */}
          <Pressable
            onPress={() => setShowAdvanced((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={
              showAdvanced ? 'Hide advanced options' : 'Show advanced options'
            }
            style={styles.advancedToggle}
          >
            <Text style={[styles.advancedToggleText, { color: palette.accent }]}>
              {showAdvanced ? 'Hide advanced options' : 'Advanced (offset, correction)'}
            </Text>
          </Pressable>

          {showAdvanced ? (
            <View style={styles.section}>
              <FlagToggle
                label="Offset shot"
                hint="Flag the shot as an offset; record direction + distance in description."
                value={isOffset}
                onToggle={() => setIsOffset((p) => !p)}
                palette={palette}
                disabled={submitting}
              />
              <View style={{ height: 12 }} />
              <FlagToggle
                label="Correction"
                hint="Replaces a prior point — record which one in description for now."
                value={isCorrection}
                onToggle={() => setIsCorrection((p) => !p)}
                palette={palette}
                disabled={submitting}
              />
            </View>
          ) : null}

          {/* Save */}
          <Button
            label="Capture"
            onPress={onSave}
            loading={submitting}
            disabled={duplicate || name.trim() === ''}
            accessibilityHint="Saves the point with phone GPS, then opens the photo capture flow."
          />

          <Text style={[styles.footer, { color: palette.muted }]}>
            Photos / video / voice attach next (F3 #3). Until then, tap
            Capture to save the point with GPS.
          </Text>

          {/* Used to silence the no-unused-vars lint on session — the
              session check itself happens inside useCreateDataPoint. */}
          <View style={styles.spacer}>
            {session ? null : (
              <Text style={[styles.signedOutHint, { color: palette.danger }]}>
                You&apos;re signed out — sign in to save points.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface FlagToggleProps {
  label: string;
  hint: string;
  value: boolean;
  onToggle: () => void;
  palette: Palette;
  disabled?: boolean;
}

function FlagToggle({ label, hint, value, onToggle, palette, disabled }: FlagToggleProps) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [
        styles.flagRow,
        {
          backgroundColor: pressed ? palette.border : palette.surface,
          borderColor: value ? palette.accent : palette.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.flagText}>
        <Text style={[styles.flagLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.flagHint, { color: palette.muted }]}>{hint}</Text>
      </View>
      <View
        style={[
          styles.flagCheckbox,
          {
            backgroundColor: value ? palette.accent : 'transparent',
            borderColor: value ? palette.accent : palette.border,
          },
        ]}
      >
        {value ? <Text style={styles.flagCheck}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
  },
  closeButton: { padding: 8 },
  closeText: { fontSize: 16, fontWeight: '500' },
  subtitle: {
    fontSize: 14,
    paddingHorizontal: 24,
    paddingBottom: 16,
    lineHeight: 20,
  },
  empty: {
    fontStyle: 'italic',
    fontSize: 14,
    paddingVertical: 24,
    textAlign: 'center',
  },
  jobRow: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  jobRowName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  jobRowMeta: { fontSize: 13 },
  jobSummary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  jobSummaryLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  jobSummaryName: { fontSize: 17, fontWeight: '600' },
  jobSummaryMeta: { fontSize: 13, marginTop: 2 },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prefixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  prefixChip: {
    minWidth: 56,
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixChipText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Menlo',
    letterSpacing: 0.4,
  },
  prefixHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
  advancedToggle: {
    paddingVertical: 12,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 56,
  },
  flagText: { flex: 1, paddingRight: 12 },
  flagLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  flagHint: { fontSize: 12, lineHeight: 16 },
  flagCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagCheck: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 16,
    lineHeight: 18,
  },
  spacer: { marginTop: 16 },
  signedOutHint: { fontSize: 14, fontWeight: '600' },
});
