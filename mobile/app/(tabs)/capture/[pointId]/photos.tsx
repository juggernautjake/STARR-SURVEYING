import { router, useLocalSearchParams } from 'expo-router';
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

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { ScreenHeader } from '@/lib/ScreenHeader';
import * as haptics from '@/lib/haptics';
import { logError, logWarn } from '@/lib/log';
import { isPermissionDeniedError, promptForSettings } from '@/lib/permissionGuard';
import { ThumbnailGrid } from '@/lib/ThumbnailGrid';
import { VideoGrid } from '@/lib/VideoGrid';
import { useDataPoint } from '@/lib/dataPoints';
import { lookupPrefix } from '@/lib/dataPointCodes';
import {
  type FieldMedia,
  useAttachPhoto,
  useAttachVideo,
  useDeleteMedia,
  usePointMedia,
} from '@/lib/fieldMedia';
import { type Palette, colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

/**
 * Per-point capture loop — F3 #3 + F4 video review.
 *
 * Plan §5.3 step 4: "After shot: stay in capture mode with bottom
 * toolbar (more photos / video / voice / notes)." This screen lands
 * on point save and stays open until the user taps Done; each
 * capture appends to the active tab's grid without leaving the
 * screen so the next shot is one tap away.
 *
 * Layout:
 *   - Header: point name + prefix tag + GPS coords
 *   - Photos / Videos pill toggle (counts on the labels)
 *   - Active grid (3-col thumbnails). Tap a video tile → full-
 *     screen player; long-press → delete.
 *   - Capture controls: Snap photo · From library · Record video ·
 *     Record voice memo (pushes the dedicated voice screen).
 *
 * The Videos tab closes the F4 plan deferral
 * ("captures land on the web admin but don't show in the mobile
 * photos.tsx grid"). The dedicated `voice.tsx` screen still owns
 * memo playback — voice doesn't need a third tab here because
 * it has its own full-screen recorder + playback list one tap
 * away via the bottom button.
 */
export default function PointPhotosScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { point, isLoading } = useDataPoint(pointId);
  const { media } = usePointMedia(pointId, 'photo');
  const { media: videos } = usePointMedia(pointId, 'video');
  const attachPhoto = useAttachPhoto();
  const attachVideo = useAttachVideo();
  const deleteMedia = useDeleteMedia();

  const [busy, setBusy] = useState<
    'camera' | 'library' | 'video-camera' | null
  >(null);
  // Tab toggle. Photos is the default — video review is a secondary
  // surface that surveyors visit when reviewing a recorded
  // walkthrough. Counts on the chip labels make it scannable
  // ("Photos · 3" / "Videos · 1").
  const [tab, setTab] = useState<'photos' | 'videos'>('photos');

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
            The point may have been deleted, or hasn&apos;t synced to this
            device yet.
          </Text>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const prefixInfo = lookupPrefix(point.code_category);
  const hasGps = point.device_lat != null && point.device_lon != null;

  const onAttach = async (source: 'camera' | 'library') => {
    if (busy) return;
    if (!point.job_id) {
      // Schema enforces NOT NULL — this branch is defensive against a
      // partially-synced row where the FK column hasn't landed yet.
      // Surface as a warn breadcrumb so we know if it ever fires in
      // production (it shouldn't).
      logWarn('photosScreen.onAttach', 'point missing job_id — refusing capture', undefined, {
        point_id: pointId ?? null,
      });
      Alert.alert(
        'Job link missing',
        'This point isn’t linked to a job yet. Pull down to refresh and try again.'
      );
      return;
    }
    setBusy(source);
    try {
      await attachPhoto({
        jobId: point.job_id,
        dataPointId: pointId ?? null,
        source,
      });
      haptics.success();
      // Stay on the screen — the new photo lands in the grid via
      // PowerSync's reactive query.
    } catch (err) {
      // Permission denials get the Settings deep-link prompt instead
      // of a generic "Capture failed" alert. Other failure modes
      // (compression / upload / DB insert) keep the alert.
      const deniedKind = isPermissionDeniedError(err);
      if (deniedKind) {
        logWarn('photosScreen.onAttach', 'permission denied', err, {
          job_id: point.job_id,
          point_id: pointId ?? null,
          source,
          kind: deniedKind,
        });
        promptForSettings({ kind: deniedKind });
      } else {
        // Primary photo-capture path. useAttachPhoto logs DB-insert
        // failures, but compression / upload errors bubble from
        // logWarn-only origins. Promote to a real Sentry event tied
        // to the user's exact tap so ops can correlate bucket-config
        // issues with user-visible failures.
        logError('photosScreen.onAttach', 'attach failed', err, {
          job_id: point.job_id,
          point_id: pointId ?? null,
          source,
        });
        Alert.alert(
          'Capture failed',
          err instanceof Error ? err.message : String(err)
        );
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * Mirror of onAttach for video. The OS provides the recording UI
   * (per plan §5.4 the cap is 5 minutes; expo-image-picker enforces
   * via videoMaxDuration). Stays on the screen after save so the
   * surveyor can capture more right away.
   */
  const onAttachVideo = async () => {
    if (busy) return;
    if (!point?.job_id) {
      logWarn(
        'photosScreen.onAttachVideo',
        'point missing job_id — refusing capture',
        undefined,
        { point_id: pointId ?? null }
      );
      Alert.alert(
        'Job link missing',
        'This point isn’t linked to a job yet. Pull down to refresh and try again.'
      );
      return;
    }
    setBusy('video-camera');
    try {
      await attachVideo({
        jobId: point.job_id,
        dataPointId: pointId ?? null,
        source: 'camera',
      });
      haptics.success();
    } catch (err) {
      const deniedKind = isPermissionDeniedError(err);
      if (deniedKind) {
        logWarn('photosScreen.onAttachVideo', 'permission denied', err, {
          job_id: point.job_id,
          point_id: pointId ?? null,
          kind: deniedKind,
        });
        promptForSettings({ kind: deniedKind });
      } else {
        logError('photosScreen.onAttachVideo', 'attach failed', err, {
          job_id: point.job_id,
          point_id: pointId ?? null,
        });
        Alert.alert(
          'Video capture failed',
          err instanceof Error ? err.message : String(err)
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const onLongPress = (item: FieldMedia) => {
    const kind = item.media_type === 'video' ? 'video' : 'photo';
    Alert.alert(
      `Delete this ${kind}?`,
      kind === 'video'
        ? 'The recording will be removed from this point. This cannot be undone.'
        : 'The image will be removed from this point. You can re-shoot it if needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMedia(item);
            } catch (err) {
              logError('photosScreen.onDelete', 'delete failed', err, {
                media_id: item.id,
                media_type: item.media_type ?? null,
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

  const onPressVideo = (item: FieldMedia) => {
    router.push({
      pathname: '/(tabs)/capture/[pointId]/video-player',
      params: { pointId: pointId ?? '', mediaId: item.id },
    });
  };

  const exitToJob = () => {
    if (point.job_id) {
      router.replace({
        pathname: '/(tabs)/jobs/[id]',
        params: { id: point.job_id },
      });
    } else {
      router.replace('/(tabs)/jobs');
    }
  };

  const onDone = () => {
    // Most surveyor flows expect at least one capture per point —
    // a totally empty point is usually an accidental Done. Confirm
    // and offer "Snap photo" inline so the recovery path is one
    // tap. A point with only videos (e.g. a walkthrough of a
    // hazard) is still considered captured, so we count both.
    const totalCaptures = media.length + videos.length;
    if (totalCaptures === 0) {
      Alert.alert(
        'Save without captures?',
        'No photos or videos are attached to this point. Snap one now or finish without?',
        [
          {
            text: 'Snap photo',
            onPress: () => void onAttach('camera'),
          },
          {
            text: 'Finish anyway',
            style: 'destructive',
            onPress: exitToJob,
          },
        ],
        { cancelable: true }
      );
      return;
    }
    exitToJob();
  };

  // Loop back into the capture flow with the same job pre-filled —
  // otherwise the user lands on the Pick-Job step and has to re-select
  // the job they were just working on.
  const onCaptureAnother = () => {
    if (point.job_id) {
      router.replace({
        pathname: '/(tabs)/capture',
        params: { jobId: point.job_id },
      });
    } else {
      router.replace('/(tabs)/capture');
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScreenHeader back title={point.name ?? 'Point'} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.metaBlock}>
          <View style={[styles.tag, { backgroundColor: prefixInfo.color }]}>
            <Text style={styles.tagText}>{point.code_category ?? '—'}</Text>
          </View>
          <Text style={[styles.subtitle, { color: palette.muted }]}>
            {prefixInfo.label}
            {hasGps
              ? ` · ${point.device_lat?.toFixed(5)}, ${point.device_lon?.toFixed(5)}`
              : ' · no GPS fix'}
          </Text>
        </View>

        {point.description ? (
          <View
            style={[
              styles.descriptionBox,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.description, { color: palette.text }]}>
              {point.description}
            </Text>
          </View>
        ) : null}

        {/* Photos / Videos tab toggle. Always visible — surveyors
            switch tabs to review the recorded walkthrough alongside
            the still shots without leaving the capture loop. Counts
            on each chip mean "any captures here?" is a glance check. */}
        <View
          style={[
            styles.tabRow,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <TabPill
            active={tab === 'photos'}
            label="Photos"
            count={media.length}
            onPress={() => setTab('photos')}
            palette={palette}
          />
          <TabPill
            active={tab === 'videos'}
            label="Videos"
            count={videos.length}
            onPress={() => setTab('videos')}
            palette={palette}
          />
        </View>

        {/* Thumbnail grid (branches by selected tab). */}
        <View style={styles.gridBlock}>
          {tab === 'photos' ? (
            <>
              <ThumbnailGrid media={media} onLongPressMedia={onLongPress} />
              {media.length > 0 ? (
                <Text style={[styles.gridHint, { color: palette.muted }]}>
                  Long-press a photo to delete.
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <VideoGrid
                media={videos}
                onPressMedia={onPressVideo}
                onLongPressMedia={onLongPress}
              />
              {videos.length > 0 ? (
                <Text style={[styles.gridHint, { color: palette.muted }]}>
                  Tap to play · long-press to delete.
                </Text>
              ) : null}
            </>
          )}
        </View>

        {/* Capture controls */}
        <View style={styles.controlsBlock}>
          <Button
            label="Snap photo"
            onPress={() => onAttach('camera')}
            loading={busy === 'camera'}
            disabled={busy === 'library'}
            accessibilityHint="Opens the camera. The photo attaches to this point and stays at the top of the grid."
          />
          <View style={{ height: 12 }} />
          <Button
            variant="secondary"
            label="From photo library"
            onPress={() => onAttach('library')}
            loading={busy === 'library'}
            disabled={busy === 'camera'}
            accessibilityHint="Picks an existing photo from your library to attach to this point."
          />
          <View style={{ height: 12 }} />
          <Button
            variant="secondary"
            label="📹 Record video"
            onPress={onAttachVideo}
            loading={busy === 'video-camera'}
            disabled={busy === 'camera' || busy === 'library'}
            accessibilityHint="Opens the OS camera in video mode. Capped at 5 minutes per recording."
          />
          <View style={{ height: 12 }} />
          <Button
            variant="secondary"
            label="🎙 Record voice memo"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/capture/[pointId]/voice',
                params: { pointId: pointId ?? '' },
              })
            }
            disabled={!!busy}
            accessibilityHint="Opens the voice recorder. Memos attach to this point and play back from the gallery."
          />
        </View>

        <View style={styles.divider} />

        <Button
          label={
            media.length + videos.length === 0
              ? 'Done (skip captures)'
              : 'Done'
          }
          onPress={onDone}
          accessibilityHint="Returns to the job detail page."
          disabled={!!busy}
        />

        <View style={{ height: 12 }} />

        <Button
          variant="secondary"
          label="Capture another point"
          onPress={onCaptureAnother}
          accessibilityHint="Starts a new point capture flow."
          disabled={!!busy}
        />

        <Text style={[styles.footer, { color: palette.muted }]}>
          Photos · videos · voice memos · notes all attach to this
          point. Server-side video thumbnails + arrow / circle / text
          annotation primitives land in F4 / F3 polish.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One pill in the Photos / Videos tab bar. Active state lifts
 * background to the accent + flips text to a high-contrast white;
 * inactive renders muted text on a transparent fill so the active
 * pill is unmistakable in glove-vision.
 */
function TabPill({
  active,
  label,
  count,
  onPress,
  palette,
}: {
  active: boolean;
  label: string;
  count: number;
  onPress: () => void;
  palette: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
      style={({ pressed }) => [
        styles.tabPill,
        {
          backgroundColor: active ? palette.accent : 'transparent',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.tabPillText,
          { color: active ? '#FFFFFF' : palette.text },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.tabPillCount,
          { color: active ? '#FFFFFF' : palette.muted },
        ]}
      >
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBlock: {
    marginBottom: 16,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 6,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Menlo',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  descriptionBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 16,
    gap: 4,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  tabPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabPillCount: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
  gridBlock: {
    marginBottom: 24,
  },
  gridHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  controlsBlock: {
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'transparent',
    marginVertical: 12,
  },
  footer: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 16,
    lineHeight: 18,
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
});
