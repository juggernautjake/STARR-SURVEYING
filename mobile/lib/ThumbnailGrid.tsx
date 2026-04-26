/**
 * Three-column thumbnail grid for attached photos.
 *
 * Used by the F3 #3 capture loop and (later) by the F3 #4 per-point
 * gallery. Each tile resolves its signed URL via useSignedUrl;
 * tap-to-open is wired through onPressMedia so the parent decides
 * what "open" means (lightbox in F3 #4, no-op in capture loop).
 *
 * Long-press surfaces a delete affordance on the tile itself —
 * cheaper than a per-tile menu button. The parent receives the
 * delete event via onLongPressMedia.
 */
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { type FieldMedia, useFieldMediaPhotoUrl } from './fieldMedia';
import { type Palette, colors } from './theme';

interface ThumbnailGridProps {
  media: FieldMedia[];
  onPressMedia?: (media: FieldMedia) => void;
  onLongPressMedia?: (media: FieldMedia) => void;
}

export function ThumbnailGrid({
  media,
  onPressMedia,
  onLongPressMedia,
}: ThumbnailGridProps) {
  const scheme = useColorScheme() ?? 'dark';
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
          No photos yet — tap Snap to take the first one.
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
  const url = useFieldMediaPhotoUrl(media);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="image"
      accessibilityLabel={`Photo ${index + 1}`}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: palette.border,
          backgroundColor: palette.surface,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Text style={[styles.tilePlaceholderText, { color: palette.muted }]}>
            ⏳
          </Text>
        </View>
      )}
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
  // Three-column layout — width calculation lives in the parent's
  // padding; tile takes 1/3 of available space minus gap.
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
  },
  tilePlaceholderText: { fontSize: 24 },
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
