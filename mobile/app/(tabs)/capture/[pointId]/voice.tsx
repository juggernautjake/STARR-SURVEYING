/**
 * Voice memo capture loop — F4 #1 (the audio half of the user's
 * resilience requirement: "save … voice recordings to the app and
 * the data also need to be able to be saved to the phone storage as
 * well").
 *
 * Layout mirrors photos.tsx so surveyors don't relearn the flow:
 *   - Header: point name + Done
 *   - Status block: ● record indicator + duration counter
 *   - Existing memos list with playback controls (single tap = play /
 *     pause); long-press to delete.
 *   - Footer: large Record / Stop button + Cancel
 *
 * Per F4 plan: transcription is a follow-up. The recorded audio is
 * persisted via lib/uploadQueue (offline-first) and surfaced on the
 * web admin's /admin/field-data/[id] page with an HTML5 <audio>
 * player.
 */
import { Audio } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { logError, logWarn } from '@/lib/log';
import { isPermissionDeniedError, promptForSettings } from '@/lib/permissionGuard';
import { useDataPoint } from '@/lib/dataPoints';
import {
  type FieldMedia,
  useAttachVoice,
  useDeleteMedia,
  usePointMedia,
} from '@/lib/fieldMedia';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';
import {
  cancelRecording,
  getRecordingStatus,
  startRecording,
  stopRecording,
} from '@/lib/voiceRecorder';

const TICK_MS = 250;
const MAX_RECORDING_MS = 5 * 60 * 1000; // hard cap so a forgotten
                                        // recording doesn't fill
                                        // the device

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PointVoiceScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { point, isLoading } = useDataPoint(pointId);
  const { media } = usePointMedia(pointId, 'voice');
  const attachVoice = useAttachVoice();
  const deleteMedia = useDeleteMedia();

  // Recording state. We keep `recording` separate from `durationMs`
  // because the duration ticks every 250 ms while the boolean only
  // flips on start / stop.
  const [recording, setRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [saving, setSaving] = useState(false);

  // Auto-stop ref: the tick effect schedules a stop when duration
  // exceeds MAX_RECORDING_MS. Held in a ref to avoid re-creating the
  // tick when state changes.
  const autoStoppedRef = useRef(false);

  // Cleanup: if the user navigates away mid-recording, kill the
  // recorder + delete the temp file. cancelRecording is idempotent.
  useEffect(() => {
    return () => {
      // Best-effort — we don't await on unmount.
      void cancelRecording().catch((err) =>
        logWarn('voiceScreen.cleanup', 'cancel failed', err)
      );
    };
  }, []);

  // Live duration tick. Polls expo-av status because Audio.Recording
  // doesn't expose an event listener for it.
  useEffect(() => {
    if (!recording) return;
    let mounted = true;
    const interval = setInterval(async () => {
      const status = await getRecordingStatus();
      if (!mounted) return;
      if (!status) return;
      setDurationMs(status.durationMs);
      if (
        status.durationMs >= MAX_RECORDING_MS &&
        !autoStoppedRef.current
      ) {
        autoStoppedRef.current = true;
        // Auto-save when the cap is hit so we don't lose what was
        // captured. The user gets an alert telling them what
        // happened.
        void onStopAndSave(/* auto */ true);
      }
    }, TICK_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const onStart = useCallback(async () => {
    if (recording || saving) return;
    autoStoppedRef.current = false;
    try {
      await startRecording();
      setRecording(true);
      setDurationMs(0);
    } catch (err) {
      const deniedKind = isPermissionDeniedError(err);
      if (deniedKind) {
        logWarn('voiceScreen.onStart', 'permission denied', err, {
          point_id: pointId ?? null,
          kind: deniedKind,
        });
        promptForSettings({ kind: deniedKind });
        return;
      }
      logError('voiceScreen.onStart', 'startRecording failed', err, {
        point_id: pointId ?? null,
      });
      Alert.alert(
        'Couldn’t start recording',
        err instanceof Error ? err.message : String(err)
      );
    }
  }, [pointId, recording, saving]);

  const onStopAndSave = useCallback(
    async (auto: boolean = false) => {
      if (!recording) return;
      setRecording(false);
      setSaving(true);
      try {
        const result = await stopRecording();
        if (!result) {
          Alert.alert(
            'Recording lost',
            'The recorder failed to produce a file. Please try again.'
          );
          return;
        }
        if (!point?.job_id) {
          Alert.alert(
            'Job link missing',
            'This point isn’t linked to a job yet. Pull down to refresh and try again.'
          );
          return;
        }
        await attachVoice({
          jobId: point.job_id,
          dataPointId: pointId ?? null,
          uri: result.uri,
          durationMs: result.durationMs,
          fileSize: result.fileSize,
        });
        if (auto) {
          Alert.alert(
            'Saved at the 5-minute cap',
            'Voice memos are capped at 5 minutes per recording. Tap Record to capture more.'
          );
        }
      } catch (err) {
        logError('voiceScreen.onStop', 'save failed', err, {
          point_id: pointId ?? null,
        });
        Alert.alert(
          'Save failed',
          err instanceof Error ? err.message : String(err)
        );
      } finally {
        setSaving(false);
        setDurationMs(0);
      }
    },
    [point, pointId, recording, attachVoice]
  );

  const onCancel = useCallback(async () => {
    if (!recording) return;
    setRecording(false);
    setDurationMs(0);
    try {
      await cancelRecording();
    } catch (err) {
      logWarn('voiceScreen.onCancel', 'cancel failed', err, {
        point_id: pointId ?? null,
      });
    }
  }, [pointId, recording]);

  const exitToJob = () => {
    if (point?.job_id) {
      router.replace({
        pathname: '/(tabs)/jobs/[id]',
        params: { id: point.job_id },
      });
    } else {
      router.back();
    }
  };

  if (isLoading) return <LoadingSplash />;

  if (!point) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            Point not found
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            The point may have been deleted, or hasn’t synced to this
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
        <Text style={[styles.title, { color: palette.text }]}>
          {point.name}
        </Text>
        <Button
          label="Done"
          variant="secondary"
          onPress={exitToJob}
          disabled={recording || saving}
        />
      </View>

      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: palette.surface,
            borderColor: recording ? palette.danger : palette.border,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: recording
                  ? palette.danger
                  : palette.border,
              },
            ]}
          />
          <Text style={[styles.statusText, { color: palette.text }]}>
            {recording
              ? 'Recording…'
              : saving
                ? 'Saving…'
                : 'Ready to record'}
          </Text>
        </View>
        <Text style={[styles.duration, { color: palette.text }]}>
          {formatDuration(durationMs)}
        </Text>
        <Text style={[styles.cap, { color: palette.muted }]}>
          5-minute cap per recording. Saves automatically at the cap.
        </Text>
      </View>

      <View style={styles.controlsRow}>
        {recording ? (
          <>
            <View style={styles.controlBig}>
              <Button
                label="Stop & Save"
                variant="primary"
                onPress={() => void onStopAndSave(false)}
                loading={saving}
              />
            </View>
            <View style={styles.controlSmall}>
              <Button
                label="Cancel"
                variant="danger"
                onPress={() => void onCancel()}
              />
            </View>
          </>
        ) : (
          <View style={styles.controlBig}>
            <Button
              label="● Record"
              variant="primary"
              onPress={onStart}
              loading={saving}
              accessibilityHint="Starts a voice memo. Tap Stop to save."
            />
          </View>
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: palette.muted }]}>
        Memos on this point ({media.length})
      </Text>

      {media.length === 0 ? (
        <Text style={[styles.empty, { color: palette.muted }]}>
          No memos yet. Tap Record to start.
        </Text>
      ) : (
        <View style={styles.memosList}>
          {media.map((m) => (
            <MemoRow
              key={m.id}
              media={m}
              onLongPress={() => onLongPressDelete(m, deleteMedia)}
              palette={palette}
            />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

function onLongPressDelete(
  item: FieldMedia,
  deleteMedia: ReturnType<typeof useDeleteMedia>
): void {
  Alert.alert(
    'Delete this memo?',
    'The audio will be removed from this point. You can re-record if needed.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMedia(item);
          } catch (err) {
            logError('voiceScreen.onDelete', 'delete failed', err, {
              media_id: item.id,
            });
            Alert.alert(
              'Delete failed',
              err instanceof Error ? err.message : String(err)
            );
          }
        },
      },
    ]
  );
}

interface MemoRowProps {
  media: FieldMedia;
  onLongPress: () => void;
  palette: ReturnType<typeof colorPalette>;
}

/**
 * Single-row memo player. Loads the audio on demand (first tap) so we
 * don't preload every memo on the screen. Subsequent taps toggle
 * play/pause without re-loading.
 */
function MemoRow({ media, onLongPress, palette }: MemoRowProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      // Unload on unmount to free decoder memory.
      void sound?.unloadAsync().catch(() => {
        /* noop */
      });
    };
  }, [sound]);

  const onTap = useCallback(async () => {
    if (loading) return;
    if (sound) {
      try {
        if (playing) {
          await sound.pauseAsync();
        } else {
          await sound.playAsync();
        }
        setPlaying((p) => !p);
      } catch (err) {
        logWarn('voiceScreen.MemoRow', 'play/pause failed', err);
      }
      return;
    }
    setLoading(true);
    try {
      // Local file (still uploading) preferred when available so
      // the user can hear what they just recorded without the
      // remote round-trip. We don't have direct access to that here
      // since usePendingUploadLocalUri is hook-keyed; for simplicity
      // we play the storage_url which is a local path until the
      // upload-queue marks it 'done' on the server. Once the server
      // path is signed-URL territory, the admin path is the canonical
      // playback. Mobile-side surveyor playback of just-recorded
      // memos is best-effort.
      const uri = media.storage_url;
      if (!uri) {
        Alert.alert(
          'Memo not yet uploaded',
          'This memo will play once the upload finishes. Stay online for a moment.'
        );
        return;
      }
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setPlaying(false);
        }
      });
      setSound(newSound);
      setPlaying(true);
    } catch (err) {
      logWarn('voiceScreen.MemoRow', 'load failed', err, {
        media_id: media.id,
      });
      Alert.alert(
        'Couldn’t play this memo',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setLoading(false);
    }
  }, [loading, sound, playing, media]);

  const seconds = media.duration_seconds ?? 0;
  const durationLabel = formatDuration(seconds * 1000);

  return (
    <Pressable
      onPress={onTap}
      onLongPress={onLongPress}
      delayLongPress={500}
      style={[styles.memoRow, { borderColor: palette.border }]}
      accessibilityRole="button"
      accessibilityLabel={
        playing ? 'Pause memo' : `Play memo, ${durationLabel}`
      }
      accessibilityHint="Long-press to delete"
    >
      <Text style={[styles.memoIcon, { color: palette.accent }]}>
        {loading ? '…' : playing ? '⏸' : '▶'}
      </Text>
      <View style={styles.memoMeta}>
        <Text style={[styles.memoDuration, { color: palette.text }]}>
          {durationLabel}
        </Text>
        <Text style={[styles.memoSubtitle, { color: palette.muted }]}>
          {media.upload_state === 'pending'
            ? 'Uploading…'
            : media.upload_state === 'failed'
              ? 'Failed — retry from Me → Uploads'
              : 'Synced'}
        </Text>
      </View>
    </Pressable>
  );
}

function colorPalette(scheme: 'light' | 'dark') {
  return colors[scheme];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  caption: {
    fontSize: 14,
    marginVertical: 12,
    paddingHorizontal: 24,
  },
  body: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  statusCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  duration: {
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginVertical: 4,
  },
  cap: {
    fontSize: 12,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  controlBig: { flex: 2 },
  controlSmall: { flex: 1 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    fontSize: 14,
  },
  memosList: {
    paddingHorizontal: 24,
    gap: 8,
  },
  memoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    gap: 12,
  },
  memoIcon: {
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  memoMeta: {
    flex: 1,
  },
  memoDuration: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  memoSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
