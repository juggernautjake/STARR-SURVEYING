import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { ThumbnailGrid } from '@/lib/ThumbnailGrid';
import { useDataPoint } from '@/lib/dataPoints';
import { lookupPrefix } from '@/lib/dataPointCodes';
import {
  type FieldMedia,
  useAttachPhoto,
  useDeleteMedia,
  usePointMedia,
} from '@/lib/fieldMedia';
import { colors } from '@/lib/theme';

/**
 * Photo capture loop — F3 #3.
 *
 * Plan §5.3 step 4: "After shot: stay in capture mode with bottom
 * toolbar (more photos / video / voice / notes)." This screen lands
 * on point save and stays open until the user taps Done; each photo
 * captured appends to the grid above without leaving the screen so
 * the next shot is one tap away.
 *
 * Layout:
 *   - Header: point name + prefix tag + Done
 *   - Subheader: GPS coords (when captured)
 *   - Grid: 3-col thumbnails of attached photos. Long-press deletes.
 *   - Footer: large "Snap" button + "From library" secondary
 *
 * Video + voice + notes attach via F4. The Snap-photo flow is the
 * F3 #3 deliverable; F3 #6 layers annotation on top.
 */
export default function PointPhotosScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { point, isLoading } = useDataPoint(pointId);
  const { media } = usePointMedia(pointId, 'photo');
  const attachPhoto = useAttachPhoto();
  const deleteMedia = useDeleteMedia();

  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

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
      // Stay on the screen — the new photo lands in the grid via
      // PowerSync's reactive query.
    } catch (err) {
      Alert.alert('Capture failed', (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onLongPress = (item: FieldMedia) => {
    Alert.alert(
      'Delete this photo?',
      'The image will be removed from this point. You can re-shoot it if needed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMedia(item);
            } catch (err) {
              Alert.alert('Delete failed', (err as Error).message);
            }
          },
        },
      ]
    );
  };

  const onDone = () =>
    point.job_id
      ? router.replace(`/(tabs)/jobs/${point.job_id}`)
      : router.replace('/(tabs)/jobs');

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <View
              style={[styles.tag, { backgroundColor: prefixInfo.color }]}
            >
              <Text style={styles.tagText}>{point.code_category ?? '—'}</Text>
            </View>
            <Text
              style={[styles.heading, { color: palette.text }]}
              numberOfLines={2}
            >
              {point.name}
            </Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              {prefixInfo.label}
              {hasGps
                ? ` · ${point.device_lat?.toFixed(5)}, ${point.device_lon?.toFixed(5)}`
                : ' · no GPS fix'}
              {' · '}
              {media.length} {media.length === 1 ? 'photo' : 'photos'}
            </Text>
          </View>
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

        {/* Thumbnail grid */}
        <View style={styles.gridBlock}>
          <ThumbnailGrid media={media} onLongPressMedia={onLongPress} />
          {media.length > 0 ? (
            <Text style={[styles.gridHint, { color: palette.muted }]}>
              Long-press a photo to delete.
            </Text>
          ) : null}
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
        </View>

        <View style={styles.divider} />

        <Button
          label={media.length === 0 ? 'Done (skip photos)' : 'Done'}
          onPress={onDone}
          accessibilityHint="Returns to the job detail page."
          disabled={!!busy}
        />

        <View style={{ height: 12 }} />

        <Button
          variant="secondary"
          label="Capture another point"
          onPress={() => router.replace('/(tabs)/capture')}
          accessibilityHint="Starts a new point capture flow."
          disabled={!!busy}
        />

        <Text style={[styles.footer, { color: palette.muted }]}>
          Video, voice memos, and notes attach in F4. Photo annotation
          (arrows / circles / text) lands in F3 #6.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
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
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerText: { flex: 1 },
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
  heading: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
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
