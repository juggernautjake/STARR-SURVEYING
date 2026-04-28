/**
 * Stuck-uploads triage screen.
 *
 * Per the user's resilience requirement: data captured offline must
 * NEVER be silently lost. The upload queue persists every queued file
 * to FileSystem.documentDirectory; when the queue gives up after
 * MAX_RETRIES, the row stays in `pending_uploads` + the file stays on
 * disk. This screen is how the user finds + recovers them.
 *
 * Two filter tabs:
 *   - In flight  — retry_count < MAX_RETRIES (still trying)
 *   - Failed     — retry_count >= MAX_RETRIES (queue gave up)
 *
 * Per-row actions:
 *   - Try again — resets retry_count + kicks an immediate drain.
 *                 Useful when the user has manually re-connected to
 *                 WiFi or the failure was transient (Supabase outage,
 *                 cellular dead spot now resolved).
 *   - Discard   — deletes the queue row + local file. Confirmed via
 *                 Alert.alert because it's destructive.
 *
 * The list is reactive (PowerSync useQuery), so retries / discards /
 * background drains all reflow the list immediately.
 */
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePowerSync } from '@powersync/react';

import { Button } from '@/lib/Button';
import { logError } from '@/lib/log';
import {
  type StuckUploadRow,
  discardUpload,
  retryUpload,
  useStuckUploads,
  useUploadQueueStatus,
} from '@/lib/uploadQueue';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

type Filter = 'pending' | 'failed';

export default function UploadsScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const db = usePowerSync();

  const [filter, setFilter] = useState<Filter>('pending');
  const rows = useStuckUploads(filter);
  const { pendingCount, failedCount } = useUploadQueueStatus();

  // Per-row pending state — disables both buttons on a row while its
  // mutation is in flight, so a double-tap can't fire two retries.
  const [busyId, setBusyId] = useState<string | null>(null);

  const onRetry = async (row: StuckUploadRow) => {
    setBusyId(row.id);
    try {
      await retryUpload(db, row.id);
    } catch (err) {
      // retryUpload logs internally; surface so the user knows the
      // tap didn't land instead of seeing the row sit unchanged.
      logError('uploads.onRetry', 'retry failed', err, {
        pending_id: row.id,
      });
      Alert.alert(
        'Retry failed',
        err instanceof Error ? err.message : 'Unable to reset the upload.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const onDiscard = (row: StuckUploadRow) => {
    Alert.alert(
      'Discard this upload?',
      'The local copy of the file will be deleted and it will not be uploaded. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            setBusyId(row.id);
            try {
              await discardUpload(db, row.id);
            } catch (err) {
              logError('uploads.onDiscard', 'discard failed', err, {
                pending_id: row.id,
              });
              Alert.alert(
                'Discard failed',
                err instanceof Error
                  ? err.message
                  : 'Unable to remove the upload.'
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

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
        <Text style={[styles.title, { color: palette.text }]}>Uploads</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={[styles.subtitle, { color: palette.muted }]}>
        Photos and receipts waiting to upload. The queue retries
        automatically while online — tap a row only to override.
      </Text>

      <View style={styles.tabs}>
        <FilterTab
          active={filter === 'pending'}
          label={`In flight (${pendingCount})`}
          onPress={() => setFilter('pending')}
          palette={palette}
        />
        <FilterTab
          active={filter === 'failed'}
          label={`Failed (${failedCount})`}
          onPress={() => setFilter('failed')}
          palette={palette}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: palette.muted }]}>
            {filter === 'pending'
              ? 'No uploads in flight. New captures will appear here while syncing.'
              : 'No failed uploads. Anything that gives up after 8 retries shows here so you can recover it.'}
          </Text>
        ) : (
          rows.map((row) => (
            <UploadRow
              key={row.id}
              row={row}
              busy={busyId === row.id}
              onRetry={() => void onRetry(row)}
              onDiscard={() => onDiscard(row)}
              palette={palette}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface FilterTabProps {
  active: boolean;
  label: string;
  onPress: () => void;
  palette: ReturnType<typeof colorPalette>;
}

function FilterTab({ active, label, onPress, palette }: FilterTabProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        {
          borderColor: active ? palette.accent : palette.border,
          backgroundColor: active ? palette.accent : 'transparent',
        },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.tabLabel,
          { color: active ? '#FFFFFF' : palette.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface UploadRowProps {
  row: StuckUploadRow;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  palette: ReturnType<typeof colorPalette>;
}

function UploadRow({
  row,
  busy,
  onRetry,
  onDiscard,
  palette,
}: UploadRowProps) {
  const kindLabel =
    row.parent_table === 'receipts'
      ? 'Receipt photo'
      : row.parent_table === 'field_media'
        ? 'Field photo'
        : row.parent_table;

  const ageLabel = row.created_at ? timeAgo(row.created_at) : '—';
  const nextAttempt =
    row.next_attempt_at != null
      ? formatNextAttempt(row.next_attempt_at)
      : null;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.rowHeader}>
        <Text style={[styles.rowKind, { color: palette.text }]}>
          {kindLabel}
        </Text>
        <Text style={[styles.rowAge, { color: palette.muted }]}>
          {ageLabel}
        </Text>
      </View>

      <Text style={[styles.rowMeta, { color: palette.muted }]} numberOfLines={1}>
        {row.storage_path}
      </Text>

      <View style={styles.metaRow}>
        <Text style={[styles.rowMeta, { color: palette.muted }]}>
          Retries: {row.retry_count}
        </Text>
        {nextAttempt ? (
          <Text style={[styles.rowMeta, { color: palette.muted }]}>
            Next: {nextAttempt}
          </Text>
        ) : null}
      </View>

      {row.last_error ? (
        <Text
          style={[styles.rowError, { color: palette.danger }]}
          numberOfLines={2}
        >
          {row.last_error}
        </Text>
      ) : null}

      <View style={styles.actionsRow}>
        <View style={styles.actionFlex}>
          <Button
            label="Try again"
            onPress={onRetry}
            disabled={busy}
            variant="secondary"
            accessibilityHint="Resets the retry counter and kicks the queue immediately"
          />
        </View>
        <View style={styles.actionFlex}>
          <Button
            label="Discard"
            onPress={onDiscard}
            disabled={busy}
            variant="danger"
            accessibilityHint="Deletes the local copy. Cannot be undone."
          />
        </View>
      </View>
    </View>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNextAttempt(epochMs: number): string {
  const diff = epochMs - Date.now();
  if (diff <= 0) return 'now';
  if (diff < 60_000) return `${Math.ceil(diff / 1000)}s`;
  return `${Math.ceil(diff / 60_000)}m`;
}

// Reusable Palette type — colors[scheme] return inference doesn't
// flow through the props of nested components without this.
function colorPalette(scheme: 'light' | 'dark') {
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
  subtitle: {
    fontSize: 13,
    paddingHorizontal: 24,
    marginBottom: 12,
    lineHeight: 18,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
    lineHeight: 20,
  },
  row: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowKind: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowAge: {
    fontSize: 13,
  },
  rowMeta: {
    fontSize: 12,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  rowError: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionFlex: {
    flex: 1,
  },
});
