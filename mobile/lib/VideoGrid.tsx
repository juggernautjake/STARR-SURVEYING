/**
 * Three-column video grid for the per-point capture screen.
 *
 * Mirrors `ThumbnailGrid` for photos but tailored to video metadata:
 *   - Film-strip placeholder + ▶ overlay when no server-extracted
 *     thumbnail is available (the FFmpeg-thumbnail worker is F4
 *     polish — until it ships, every tile renders the placeholder
 *     even after upload completes).
 *   - Bottom-left duration pill (`mm:ss`) so surveyors can spot the
 *     30-second walkthrough they meant to keep vs. the 5-minute
 *     accident.
 *   - Top-right upload-state badge (↑ pending / WiFi waiting / !
 *     failed) — same vocabulary as ThumbnailGrid so the surveyor
 *     learns the pictograms once.
 *
 * Tap a tile → open the full-screen player (parent decides via
 * `onPressMedia`); long-press → delete (parent confirms via
 * `onLongPressMedia`). Both handlers are optional so the grid can
 * be rendered read-only when needed (e.g. a future read-only
 * review surface for the dispatcher).
 */
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type FieldMedia, useFieldMediaPhotoUrl } from './fieldMedia';
import { type Palette, colors } from './theme';
import { useResolvedScheme } from './themePreference';

interface VideoGridProps {
  media: FieldMedia[];
  onPressMedia?: (media: FieldMedia) => void;
  onLongPressMedia?: (media: FieldMedia) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoGrid({
  media,
  onPressMedia,
  onLongPressMedia,
}: VideoGridProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  if (media.length === 0) {
    return (
      <View
        style={[
          styles.empty,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.emptyText, { color: palette.muted }]}>
          No videos yet — tap “Record video” below to capture one.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {media.map((item, idx) => (
        <Tile
          key={item.id}
          media={item}
          index={idx}
          palette={palette}
          onPress={onPressMedia ? () => onPressMedia(item) : undefined}
          onLongPress={
            onLongPressMedia ? () => onLongPressMedia(item) : undefined
          }
        />
      ))}
    </View>
  );
}

interface TileProps {
  media: FieldMedia;
  index: number;
  palette: Palette;
  onPress?: () => void;
  onLongPress?: () => void;
}

function Tile({ media, index, palette, onPress, onLongPress }: TileProps) {
  // Re-use the photo-bucket resolver for thumbnails. Video thumbs
  // (when the FFmpeg worker is wired up) will land in PHOTO_BUCKET
  // alongside the photos — the storage_url column carries the
  // bucket-path; for videos that path is currently null on every
  // row until the worker ships, so the placeholder is the norm.
  const thumbUrl = useFieldMediaPhotoUrl(media);
  const duration = formatDuration(media.duration_seconds ?? null);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Video ${index + 1}, ${duration}`}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: palette.border,
          backgroundColor: palette.surface,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Text style={styles.tilePlaceholderGlyph}>🎬</Text>
        </View>
      )}

      {/* Always render the play overlay so a video tile is
          unmistakable — even when the thumbnail is present. */}
      <View style={styles.playOverlay} pointerEvents="none">
        <Text style={styles.playGlyph}>▶</Text>
      </View>

      {/* Duration pill */}
      <View style={styles.durationPill} pointerEvents="none">
        <Text style={styles.durationText}>{duration}</Text>
      </View>

      {/* Upload state badge — same vocabulary as ThumbnailGrid */}
      {media.upload_state && media.upload_state !== 'done' ? (
        <View style={[styles.statusBadge, { backgroundColor: palette.accent }]}>
          <Text style={styles.statusBadgeText}>
            {media.upload_state === 'pending'
              ? '↑'
              : media.upload_state === 'wifi-waiting'
                ? 'WiFi'
                : '!'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  tilePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0E14',
  },
  tilePlaceholderGlyph: {
    fontSize: 32,
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    fontSize: 28,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  durationPill: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
  statusBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  empty: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
