import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { LoadingSplash } from '@/lib/LoadingSplash';
import { TextField } from '@/lib/TextField';
import { TimeEditHistory } from '@/lib/TimeEditHistory';
import { useJob } from '@/lib/jobs';
import { formatDuration } from '@/lib/timeFormat';
import { useEditTimeEntry, useTimeEdits, validateEdit } from '@/lib/timeEdits';
import { useQuery } from '@powersync/react';
import { colors } from '@/lib/theme';

interface JobTimeEntryRow {
  id: string;
  job_id: string | null;
  user_email: string | null;
  entry_type: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  duration_minutes: number | null;
  created_at: string | null;
  /** Daily-log status — blocks edits when not 'open' (F1 #9). */
  _log_status: string | null;
}

/**
 * Manual time-entry edit screen — F1 #6.
 *
 * Layout:
 *   1. Header (job/category + duration)
 *   2. Start time picker
 *   3. End time picker (or "Open — clock out instead" hint)
 *   4. Notes input
 *   5. Reason input (highlighted when delta tier ≥ reason_required)
 *   6. Save / Cancel buttons
 *   7. Edit history (read-only) — appended below so the user can
 *      see what they / others have already changed
 *
 * Rules per plan §5.8.3:
 *   delta < 5 min   silent (still logged for audit)
 *   delta 5–15 min  optional reason
 *   delta 15–60 min reason required
 *   delta > 60 min  reason required + admin-approval flag (saved
 *                   anyway; F1 #9 + web side surface the queue)
 *   age > 24 hours  blocked on mobile; admin only
 */
export default function EditTimeEntryScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: rows, isLoading: rowLoading } = useQuery<JobTimeEntryRow>(
    `SELECT jte.id, jte.job_id, jte.user_email, jte.entry_type,
            jte.started_at, jte.ended_at, jte.notes,
            jte.duration_minutes, jte.created_at,
            dtl.status AS _log_status
     FROM job_time_entries AS jte
     LEFT JOIN daily_time_logs AS dtl ON dtl.id = jte.daily_time_log_id
     WHERE jte.id = ?
     LIMIT 1`,
    id ? [id] : []
  );
  const row = rows?.[0];
  const dayStatus = row?._log_status ?? 'open';
  const dayLocked = dayStatus !== 'open' && dayStatus !== 'rejected';

  const { job } = useJob(row?.job_id);
  const { edits } = useTimeEdits(id);
  const editEntry = useEditTimeEntry();

  // Form state. Initialized lazily once the row arrives.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate form once the row lands. State setters in useEffect
  // (not useMemo) — useMemo runs during render, where calling setX
  // is a hooks violation.
  useEffect(() => {
    if (!row || hydrated) return;
    setStartedAt(row.started_at);
    setEndedAt(row.ended_at);
    setNotes(row.notes ?? '');
    setHydrated(true);
  }, [row, hydrated]);

  const [submitting, setSubmitting] = useState(false);

  // Live validation so the UI can show the tier badge as the user
  // adjusts the time pickers.
  const validation = useMemo(() => {
    if (!row) return null;
    return validateEdit(
      {
        started_at: row.started_at,
        ended_at: row.ended_at,
        created_at: row.created_at,
      },
      {
        started_at: startedAt,
        ended_at: endedAt === null ? '' : endedAt,
        notes,
        reason,
      }
    );
  }, [row, startedAt, endedAt, notes, reason]);

  if (rowLoading || !row) {
    return rowLoading ? (
      <LoadingSplash />
    ) : (
      <NotFound palette={palette} onBack={() => router.back()} />
    );
  }

  const onSave = async () => {
    if (dayLocked) {
      Alert.alert(
        'Day already submitted',
        'This day has been submitted to the dispatcher. Ask Henry to edit it from the web admin, or clock the time correction into a new entry.'
      );
      return;
    }
    if (!validation || !validation.ok) {
      Alert.alert('Cannot save', validation?.error ?? 'Please review your edits.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await editEntry(
        {
          id: row.id,
          started_at: row.started_at,
          ended_at: row.ended_at,
          notes: row.notes,
          created_at: row.created_at,
        },
        {
          started_at: startedAt,
          ended_at: endedAt === null ? '' : endedAt,
          notes,
          reason,
        }
      );
      if (result.tier === 'needs_approval') {
        Alert.alert(
          'Saved — admin approval queued',
          `Edit of ${result.deltaMinutes} min flagged for admin review.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        router.back();
      }
    } catch (err) {
      Alert.alert('Save failed', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const tierBadge = validation ? tierLabel(validation.tier) : null;
  const tierColor = validation ? tierColorHex(validation.tier, palette) : palette.muted;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Text style={[styles.heading, { color: palette.text }]} numberOfLines={2}>
              {job?.name ?? entryTypeLabel(row.entry_type)}
            </Text>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            {entryTypeLabel(row.entry_type)} · {formatRowDuration(row)}
          </Text>

          {dayLocked ? (
            <View
              style={[
                styles.lockedBanner,
                { backgroundColor: palette.surface, borderColor: palette.danger },
              ]}
            >
              <Text style={[styles.lockedTitle, { color: palette.danger }]}>
                {dayStatus === 'submitted'
                  ? 'Submitted for approval'
                  : dayStatus === 'approved'
                    ? 'Approved'
                    : dayStatus === 'locked'
                      ? 'Locked by payroll'
                      : 'Locked'}
              </Text>
              <Text style={[styles.lockedBody, { color: palette.text }]}>
                Edits to this entry are read-only on mobile. Ask Henry to
                edit it in the web admin, or clock a correction into a new
                entry.
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Start time
            </Text>
            <TimeFieldPicker
              value={startedAt}
              onChange={setStartedAt}
              palette={palette}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              End time
            </Text>
            {endedAt === null ? (
              <Text style={[styles.openHint, { color: palette.accent }]}>
                Still clocked in — clock out from the Time tab to set an end time.
              </Text>
            ) : (
              <TimeFieldPicker
                value={endedAt}
                onChange={setEndedAt}
                palette={palette}
              />
            )}
          </View>

          <View style={styles.section}>
            <TextField
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="What were you working on?"
              editable={!submitting}
            />
          </View>

          {tierBadge && validation ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                Edit summary
              </Text>
              <Text style={[styles.tierBadge, { color: tierColor }]}>
                {tierBadge}
                {validation.maxDeltaMinutes > 0
                  ? ` · ${validation.maxDeltaMinutes} min change`
                  : ''}
              </Text>
              {validation.tier === 'reason_required' ||
              validation.tier === 'needs_approval' ||
              validation.tier === 'reason_optional' ? (
                <TextField
                  label={
                    validation.tier === 'reason_optional'
                      ? 'Reason (optional)'
                      : 'Reason (required)'
                  }
                  value={reason}
                  onChangeText={setReason}
                  placeholder="forgot to clock out, rounded to nearest minute, etc."
                  multiline
                  numberOfLines={2}
                  autoCorrect
                  autoCapitalize="sentences"
                  editable={!submitting}
                  error={validation.error}
                />
              ) : null}
            </View>
          ) : null}

          <Button
            label="Save"
            onPress={onSave}
            loading={submitting}
            disabled={!validation?.ok || dayLocked}
            accessibilityHint="Saves the changes and writes an audit row per changed field"
          />

          <View style={styles.historySection}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              Edit history
            </Text>
            <TimeEditHistory edits={edits} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface TimeFieldPickerProps {
  value: string | null;
  onChange: (next: string) => void;
  palette: { surface: string; border: string; text: string; muted: string };
}

function TimeFieldPicker({ value, onChange, palette }: TimeFieldPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const date = value ? new Date(value) : new Date();
  const valid = !Number.isNaN(date.getTime());

  // iOS shows inline; Android shows a modal popup that we trigger
  // via a button press.
  const isAndroid = Platform.OS === 'android';

  const onPickerChange = (event: { type?: string }, picked?: Date) => {
    if (isAndroid) setShowPicker(false);
    if (event?.type === 'dismissed') return;
    if (picked && !Number.isNaN(picked.getTime())) {
      onChange(picked.toISOString());
    }
  };

  if (isAndroid) {
    return (
      <View>
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          style={[
            styles.androidValue,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.androidValueText, { color: palette.text }]}>
            {valid
              ? date.toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'Pick a time'}
          </Text>
        </Pressable>
        {showPicker ? (
          <DateTimePicker
            value={valid ? date : new Date()}
            mode="datetime"
            onChange={onPickerChange}
          />
        ) : null}
      </View>
    );
  }

  return (
    <DateTimePicker
      value={valid ? date : new Date()}
      mode="datetime"
      display="default"
      onChange={onPickerChange}
    />
  );
}

interface NotFoundProps {
  palette: { background: string; text: string; muted: string };
  onBack: () => void;
}

function NotFound({ palette, onBack }: NotFoundProps) {
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.notFound}>
        <Text style={[styles.heading, { color: palette.text }]}>
          Entry not found
        </Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          This entry may have been deleted or hasn&apos;t synced to this
          device yet.
        </Text>
        <Button label="Back" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}

function entryTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'on_site':
      return 'On site';
    case 'travel':
      return 'Travel';
    case 'office':
      return 'Office';
    case 'overhead':
      return 'Overhead';
    default:
      return 'Time entry';
  }
}

function formatRowDuration(row: JobTimeEntryRow): string {
  if (row.duration_minutes != null) {
    return formatDuration(row.duration_minutes * 60_000);
  }
  if (row.started_at && !row.ended_at) return 'open';
  return '—';
}

function tierLabel(tier: string): string {
  switch (tier) {
    case 'silent':
      return 'Small change · auto-logged';
    case 'reason_optional':
      return 'Edit · reason helpful';
    case 'reason_required':
      return 'Significant edit · reason required';
    case 'needs_approval':
      return 'Major edit · admin approval needed';
    case 'blocked':
      return 'Locked · admin must edit';
    default:
      return tier;
  }
}

function tierColorHex(
  tier: string,
  palette: { accent: string; danger: string; muted: string; success: string }
): string {
  switch (tier) {
    case 'silent':
    case 'reason_optional':
      return palette.success;
    case 'reason_required':
      return palette.accent;
    case 'needs_approval':
    case 'blocked':
      return palette.danger;
    default:
      return palette.muted;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 64,
  },
  notFound: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heading: {
    flex: 1,
    fontSize: 26,
    fontWeight: '700',
    paddingRight: 12,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  androidValue: {
    minHeight: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  androidValueText: {
    fontSize: 16,
  },
  openHint: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  tierBadge: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  historySection: {
    marginTop: 32,
  },
  lockedBanner: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  lockedTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  lockedBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
