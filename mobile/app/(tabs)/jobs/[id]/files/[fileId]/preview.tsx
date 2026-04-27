/**
 * CSV coordinate preview screen — Batch AA, F5 closer.
 *
 * Reached when the surveyor taps a CSV-typed file row on the per-
 * point detail screen. Parses the bytes locally (offline-safe,
 * leverages the upload-queue's local copy or the pinned file when
 * either is present), auto-detects P,N,E,Z,D vs N,E,Z,D,P format,
 * and renders:
 *
 *   - Stats bar: rows · matched · new · warnings.
 *   - Coordinate grid with per-row point name, N/E/Z/Description,
 *     and a ✓ / ⨯ match indicator against the existing
 *     field_data_points names on this job.
 *   - "Open in another app" fallback button at the bottom that
 *     hands off to the OS share sheet when the surveyor wants to
 *     view the raw CSV in Numbers / Excel / Google Sheets.
 *
 * Pure-read view — no mutations. The "create unmatched rows as
 * data points" import flow is v2 polish; this screen is the
 * "did my Trimble export match what we captured today?" check.
 */
import * as FileSystem from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import {
  matchedRowNames,
  parseCoordCsv,
  type CoordCsvResult,
} from '@/lib/csvCoords';
import { useJobPointNames } from '@/lib/dataPoints';
import { logError, logInfo, logWarn } from '@/lib/log';
import { isOnlineNow } from '@/lib/networkState';
import { FILES_BUCKET, type JobFile } from '@/lib/jobFiles';
import { useOpenJobFile } from '@/lib/pinnedFiles';
import { supabase } from '@/lib/supabase';
import { usePowerSync, useQuery } from '@powersync/react';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

interface CsvPreviewState {
  loading: boolean;
  error: string | null;
  result: CoordCsvResult | null;
  /** Where the bytes came from — for the helpful "loaded from your
   *  pinned copy" sub-line. */
  source: 'pin' | 'queue' | 'remote' | null;
}

export default function CsvPreviewScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const db = usePowerSync();
  const openFile = useOpenJobFile();

  const params = useLocalSearchParams<{ id: string; fileId: string }>();
  const jobId = typeof params?.id === 'string' ? params.id : null;
  const fileId = typeof params?.fileId === 'string' ? params.fileId : null;

  // Reactive job-file row + pinned row + upload-queue local URI in
  // parallel. PowerSync joins these via separate queries; we
  // resolve the bytes from whichever lands first (pin → queue →
  // remote signed URL).
  const fileQueryParams = useMemo(() => (fileId ? [fileId] : []), [fileId]);
  const { data: fileRows } = useQuery<JobFile>(
    `SELECT * FROM job_files WHERE id = ?`,
    fileQueryParams
  );
  const file = fileRows?.[0] ?? null;

  const { names: knownNames } = useJobPointNames(jobId);

  const [state, setState] = useState<CsvPreviewState>({
    loading: true,
    error: null,
    result: null,
    source: null,
  });

  // ── Resolve bytes → text → parse ────────────────────────────────────────
  //
  // Resolution order:
  //   1. pinned_files.local_uri (offline-safe; no network needed)
  //   2. pending_uploads.local_uri (the upload queue's copy, if
  //      the file hasn't synced yet)
  //   3. signed URL fetch (only path that needs reception)
  //
  // We never modify the source bytes — read-only download +
  // parse in memory. Files larger than 5 MB short-circuit with a
  // friendly "use Open in another app" message; in-memory parsing
  // a 50 MB CSV would freeze the JS thread.
  const resolveAndParse = useCallback(async () => {
    if (!file?.id) return;
    if (!file.storage_path) {
      setState({
        loading: false,
        error: 'This file has no storage path.',
        result: null,
        source: null,
      });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // Step 1: pinned copy.
      const pinned = await db.get<{ local_uri: string }>(
        `SELECT local_uri FROM pinned_files WHERE job_file_id = ?`,
        [file.id]
      );
      let localUri: string | null = pinned?.local_uri ?? null;
      let source: 'pin' | 'queue' | 'remote' = 'pin';

      // Step 2: upload-queue copy.
      if (!localUri) {
        const queued = await db.get<{ local_uri: string }>(
          `SELECT local_uri FROM pending_uploads
            WHERE parent_table = 'job_files' AND parent_id = ?`,
          [file.id]
        );
        if (queued?.local_uri) {
          localUri = queued.local_uri;
          source = 'queue';
        }
      }

      // Step 3: signed-URL download to cache.
      if (!localUri) {
        if (!isOnlineNow()) {
          setState({
            loading: false,
            error:
              'No reception, and this file isn’t pinned or in the upload queue. Pin it next time you have signal.',
            result: null,
            source: null,
          });
          return;
        }
        const { data, error } = await supabase.storage
          .from(FILES_BUCKET)
          .createSignedUrl(file.storage_path, 60 * 5);
        if (error || !data?.signedUrl) {
          throw new Error(error?.message ?? 'Could not sign download URL.');
        }
        const cachePath = `${FileSystem.cacheDirectory}csv-preview-${file.id}-${Date.now()}.csv`;
        const { uri, status } = await FileSystem.downloadAsync(
          data.signedUrl,
          cachePath
        );
        if (status >= 400) {
          throw new Error(`Download HTTP ${status}`);
        }
        localUri = uri;
        source = 'remote';
      }

      // Size guard — in-memory parse caps at 5 MB.
      const info = await FileSystem.getInfoAsync(localUri, { size: true });
      const size = info.exists && info.size != null ? info.size : 0;
      if (size > 5 * 1024 * 1024) {
        setState({
          loading: false,
          error: `This CSV is ${(size / (1024 * 1024)).toFixed(1)} MB — too large to preview on the device. Tap "Open in another app" below to view it externally.`,
          result: null,
          source,
        });
        return;
      }

      const text = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const result = parseCoordCsv(text);
      logInfo('csvPreview.parse', 'success', {
        file_id: file.id,
        format: result.format,
        rows: result.parsedCount,
        warnings: result.warnings.length,
        source,
        bytes: size,
      });
      setState({ loading: false, error: null, result, source });
    } catch (err) {
      logError('csvPreview.parse', 'failed', err, { file_id: file.id });
      setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        result: null,
        source: null,
      });
    }
  }, [db, file]);

  useEffect(() => {
    void resolveAndParse();
  }, [resolveAndParse]);

  const matched = useMemo(() => {
    if (!state.result) return new Set<string>();
    return matchedRowNames(state.result.rows, knownNames);
  }, [state.result, knownNames]);

  const stats = useMemo(() => {
    if (!state.result) {
      return { total: 0, matched: 0, unmatched: 0 };
    }
    const namedRows = state.result.rows.filter((r) => !!r.name);
    const matchedCount = namedRows.filter(
      (r) => r.name && matched.has(r.name)
    ).length;
    return {
      total: state.result.rows.length,
      matched: matchedCount,
      unmatched: namedRows.length - matchedCount,
    };
  }, [state.result, matched]);

  const onOpenExternal = async () => {
    if (!file) return;
    try {
      // We already have the full row from the SELECT * query, so
      // the JobFile shape is satisfied without a cast. useOpenJobFile
      // only reads id + storage_path + name + content_type +
      // upload_state at runtime; the rest pass through unread.
      await openFile(file);
    } catch (err) {
      logWarn('csvPreview.openExternal', 'open failed', err, {
        file_id: file.id,
      });
      Alert.alert(
        'Couldn’t open',
        err instanceof Error ? err.message : String(err)
      );
    }
  };

  if (!file) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.heading, { color: palette.text }]}>
            File not found
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            The file may have been deleted, or hasn’t synced to this
            device yet.
          </Text>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.backBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.backText, { color: palette.accent }]}>
            ‹ Back
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.heading, { color: palette.text }]}
            numberOfLines={2}
          >
            {file.name ?? 'CSV preview'}
          </Text>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            {state.source === 'pin'
              ? 'Loaded from your pinned copy.'
              : state.source === 'queue'
                ? 'Loaded from the upload queue.'
                : state.source === 'remote'
                  ? 'Loaded from the server.'
                  : 'Reading…'}
          </Text>
        </View>
      </View>

      {state.loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={palette.accent} />
          <Text style={[styles.subtitle, { color: palette.muted, marginTop: 8 }]}>
            Parsing CSV…
          </Text>
        </View>
      ) : state.error ? (
        <View style={styles.body}>
          <View
            style={[
              styles.errorBlock,
              { backgroundColor: palette.surface, borderColor: palette.danger },
            ]}
          >
            <Text style={[styles.errorTitle, { color: palette.danger }]}>
              Couldn’t preview
            </Text>
            <Text style={[styles.errorBody, { color: palette.text }]}>
              {state.error}
            </Text>
          </View>
          <View style={{ height: 12 }} />
          <Button
            variant="secondary"
            label="Open in another app"
            onPress={() => void onOpenExternal()}
            accessibilityHint="Hands the file to the OS share sheet so you can open it in Numbers / Excel / Sheets."
          />
        </View>
      ) : state.result ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Stats bar */}
          <View
            style={[
              styles.statsBar,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Stat label="Rows" value={String(stats.total)} palette={palette} />
            <Stat
              label="Matched"
              value={String(stats.matched)}
              accent={palette.success}
              palette={palette}
            />
            <Stat
              label="New"
              value={String(stats.unmatched)}
              accent={
                stats.unmatched > 0 ? palette.accent : palette.muted
              }
              palette={palette}
            />
          </View>

          {/* Format banner */}
          <View
            style={[
              styles.formatBanner,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.formatLabel, { color: palette.muted }]}>
              Detected format
            </Text>
            <Text style={[styles.formatValue, { color: palette.text }]}>
              {state.result.format === 'pnezd'
                ? 'P, N, E, Z, D — point name first'
                : state.result.format === 'nezdp'
                  ? 'N, E, Z, D, P — point name last'
                  : 'Unknown — showing raw cells'}
              {state.result.separator
                ? ` · ${
                    state.result.separator === '\t'
                      ? 'tab'
                      : state.result.separator === ';'
                        ? 'semicolon'
                        : 'comma'
                  }-separated`
                : ''}
              {state.result.hasHeader ? ' · header row skipped' : ''}
            </Text>
            {state.result.warnings.length > 0 ? (
              <Text style={[styles.warning, { color: palette.danger }]}>
                {state.result.warnings.length}{' '}
                {state.result.warnings.length === 1 ? 'warning' : 'warnings'} —{' '}
                {state.result.warnings.slice(0, 2).join(' · ')}
                {state.result.warnings.length > 2 ? ' · …' : ''}
              </Text>
            ) : null}
          </View>

          {/* Row table */}
          <View
            style={[
              styles.table,
              { borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          >
            <View
              style={[
                styles.tableHeader,
                { borderBottomColor: palette.border },
              ]}
            >
              <Text style={[styles.thNarrow, { color: palette.muted }]}>
                #
              </Text>
              <Text style={[styles.thFlex, { color: palette.muted }]}>
                Point
              </Text>
              <Text style={[styles.thNum, { color: palette.muted }]}>N</Text>
              <Text style={[styles.thNum, { color: palette.muted }]}>E</Text>
              <Text style={[styles.thNum, { color: palette.muted }]}>Z</Text>
              <Text style={[styles.thMatch, { color: palette.muted }]}>
                Match
              </Text>
            </View>
            {state.result.rows.map((row) => {
              const isMatch =
                row.name != null && matched.has(row.name);
              return (
                <View
                  key={row.rowNumber}
                  style={[
                    styles.tableRow,
                    { borderBottomColor: palette.border },
                  ]}
                >
                  <Text style={[styles.tdNarrow, { color: palette.muted }]}>
                    {row.rowNumber}
                  </Text>
                  <View style={styles.tdFlexCol}>
                    <Text
                      style={[styles.cellName, { color: palette.text }]}
                      numberOfLines={1}
                    >
                      {row.name ?? '—'}
                    </Text>
                    {row.description ? (
                      <Text
                        style={[styles.cellDesc, { color: palette.muted }]}
                        numberOfLines={1}
                      >
                        {row.description}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.tdNum, { color: palette.text }]}>
                    {row.northing != null ? row.northing.toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.tdNum, { color: palette.text }]}>
                    {row.easting != null ? row.easting.toFixed(2) : '—'}
                  </Text>
                  <Text style={[styles.tdNum, { color: palette.text }]}>
                    {row.elevation != null ? row.elevation.toFixed(2) : '—'}
                  </Text>
                  <View style={styles.tdMatch}>
                    {row.name == null ? (
                      <Text style={{ color: palette.muted }}>—</Text>
                    ) : isMatch ? (
                      <Text style={{ color: palette.success, fontWeight: '700' }}>
                        ✓
                      </Text>
                    ) : (
                      <Text style={{ color: palette.accent, fontWeight: '700' }}>
                        New
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            {state.result.rows.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={[styles.subtitle, { color: palette.muted }]}>
                  No data rows in this CSV.
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ height: 12 }} />

          <Button
            variant="secondary"
            label="Open in another app"
            onPress={() => void onOpenExternal()}
            accessibilityHint="Hands the CSV to the OS share sheet so you can open it in Numbers / Excel / Sheets."
          />

          <Text style={[styles.footnote, { color: palette.muted }]}>
            Read-only preview. ✓ means a data point with that name
            already exists on this job — captured in the field. “New”
            means the CSV row hasn’t been recorded yet. Auto-import
            of unmatched rows is a future polish.
          </Text>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

interface StatProps {
  label: string;
  value: string;
  accent?: string;
  palette: { text: string; muted: string };
}

function Stat({ label, value, accent, palette }: StatProps) {
  return (
    <View style={styles.statCol}>
      <Text
        style={[
          styles.statValue,
          { color: accent ?? palette.text },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: palette.muted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  body: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '500',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadingBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorBlock: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  statsBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formatBanner: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  formatLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  formatValue: {
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    marginTop: 6,
    fontSize: 12,
  },
  table: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thNarrow: {
    width: 32,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thFlex: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thNum: {
    width: 70,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'right',
  },
  thMatch: {
    width: 56,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tdNarrow: {
    width: 32,
    fontSize: 12,
  },
  tdFlexCol: {
    flex: 1,
  },
  tdNum: {
    width: 70,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tdMatch: {
    width: 56,
    alignItems: 'center',
  },
  cellName: {
    fontSize: 13,
    fontWeight: '600',
  },
  cellDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  emptyRow: {
    padding: 16,
    alignItems: 'center',
  },
  footnote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 16,
    lineHeight: 18,
  },
});
