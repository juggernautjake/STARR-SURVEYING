import { ResizeMode, Video } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { logError } from '@/lib/log';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';
import {
  type FieldMedia,
  useDeleteMedia,
  useFieldMediaVideoUrl,
  usePointMedia,
} from '@/lib/fieldMedia';

/**
 * Full-screen video player for a single `field_media.media_type='video'`
 * row. Reached from the Videos tab on `(tabs)/capture/[pointId]/photos`.
 *
 * Why a dedicated screen (not an in-grid lightbox)?
 *   - The OS-native `<Video>` component owns the controls (scrubber,
 *     play/pause, AirPlay) and renders best when it owns the whole
 *     viewport. An overlaid lightbox stacks `<Video>` on top of an
 *     existing scroll view, which on Android occasionally drops the
 *     touch target for the seek bar.
 *   - Stack-pushed routes give us free back-gesture + animation
 *     parity with the rest of the capture flow.
 *
 * Resilience contract (mirrors voice.tsx):
 *   - Pending uploads still play — `useFieldMediaVideoUrl` returns
 *     the local `documentDirectory` URI from the upload queue while
 *     bytes are in-flight, so a 30-second walkthrough plays back
 *     immediately after capture even with no signal.
 *   - Player errors surface as a banner over the placeholder, never
 *     a crash. We log every error to Sentry so a wedged signed URL
 *     (expired TTL, misconfigured bucket) is visible to ops.
 *   - Long-press Delete uses the same Alert + `useDeleteMedia` path
 *     as the photo grid. After delete we `router.back()` so the
 *     surveyor lands back on the Videos tab.
 */
export default function VideoPlayerScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const { pointId, mediaId } = useLocalSearchParams<{
    pointId: string;
    mediaId: string;
  }>();

  // Look up the row by id from the point's video list. Doing it via
  // usePointMedia keeps the player reactive to PowerSync — if the
  // bytes upload mid-playback the upload_state badge updates.
  const { media: videos } = usePointMedia(pointId, 'video');
  const media = useMemo(
    () => videos.find((v) => v.id === mediaId) ?? null,
    [videos, mediaId]
  );

  const url = useFieldMediaVideoUrl(media);
  const deleteMedia = useDeleteMedia();
  const videoRef = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-arm the loading spinner when the source URI changes (rare —
  // happens when the upload completes mid-screen and the resolver
  // swaps from local file → signed URL).
  useEffect(() => {
    setLoading(!!url);
    setError(null);
  }, [url]);

  if (!media) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            Video not found
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            The recording may have been deleted from another device, or
            hasn’t synced to this device yet.
          </Text>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const onDelete = () => {
    Alert.alert(
      'Delete this video?',
      'The video will be removed from this point. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMedia(media);
              router.back();
            } catch (err) {
              logError('videoPlayer.onDelete', 'delete failed', err, {
                media_id: media.id,
                point_id: pointId ?? null,
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
  };

  const stateLabel = formatStateLabel(media);
  const sizeLabel = formatBytes(media.file_size_bytes ?? null);
  const durationLabel = formatDuration(media.duration_seconds ?? null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to videos"
          style={({ pressed }) => [
            styles.headerBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={styles.headerBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Video
        </Text>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete video"
          style={({ pressed }) => [
            styles.headerBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.headerBtnText, styles.danger]}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.stage}>
        {url ? (
          <Video
            ref={videoRef}
            source={{ uri: url }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
            onLoadStart={() => setLoading(true)}
            onLoad={() => setLoading(false)}
            onError={(err) => {
              setLoading(false);
              const msg = err instanceof Error ? err.message : String(err);
              setError(msg);
              logError('videoPlayer.onError', 'playback error', err, {
                media_id: media.id,
                point_id: pointId ?? null,
                upload_state: media.upload_state ?? null,
              });
            }}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderGlyph}>🎬</Text>
            <Text style={styles.placeholderText}>
              {media.upload_state === 'pending'
                ? 'Uploading…'
                : 'No playback available'}
            </Text>
          </View>
        )}
        {loading && url ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>
              Playback failed: {error}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metaBlock}>
        <MetaRow label="Duration" value={durationLabel} />
        <MetaRow label="Size" value={sizeLabel} />
        <MetaRow label="State" value={stateLabel.text} accent={stateLabel.accent} />
        <MetaRow
          label="Captured"
          value={formatTimestamp(media.captured_at)}
        />
      </View>
    </SafeAreaView>
  );
}

function MetaRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, accent ? { color: accent } : null]}>
        {value}
      </Text>
    </View>
  );
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatStateLabel(media: FieldMedia): { text: string; accent: string } {
  switch (media.upload_state) {
    case 'done':
      return { text: 'Synced', accent: '#34D399' };
    case 'wifi-waiting':
      return { text: 'Waiting for Wi-Fi', accent: '#FBBF24' };
    case 'failed':
      return { text: 'Upload failed', accent: '#F87171' };
    case 'pending':
    default:
      return { text: 'Uploading…', accent: '#FBBF24' };
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 60,
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  danger: {
    color: '#F87171',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  stage: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderGlyph: {
    fontSize: 64,
    marginBottom: 12,
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.85)',
  },
  errorBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  metaBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0B0E14',
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  metaLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    color: '#FFFFFF',
  },
  caption: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
});
