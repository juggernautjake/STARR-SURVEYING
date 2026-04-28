/**
 * Themed remote-image preview with a built-in placeholder.
 *
 * Used by F2's receipt detail screen and (soon) F3's data-point photo
 * gallery. Centralises the loading state, fallback styling, and
 * "photo unavailable" copy so the look is consistent across feature
 * surfaces.
 *
 * Pass null/undefined when the URL is still being signed — the
 * placeholder renders until the URL arrives, then the Image swaps in.
 */
import { Image, StyleSheet, Text, View } from 'react-native';

import { type Palette, colors } from './theme';

interface RemotePhotoProps {
  /** Signed URL or null while it's being generated. Pass undefined to
   *  show the "no photo" fallback (e.g. row missing photo_url). */
  signedUrl: string | null | undefined;
  /** Aspect ratio (width / height). Receipts use 3/4; data points
   *  vary. Defaults to 3/4 (typical paper-receipt portrait). */
  aspectRatio?: number;
  /** Accessibility label — required so screen readers announce the
   *  image purpose. */
  accessibilityLabel: string;
  /** Visible fallback string when signedUrl is undefined (vs null,
   *  which means "still loading"). */
  unavailableText?: string;
}

export function RemotePhoto({
  signedUrl,
  aspectRatio = 3 / 4,
  accessibilityLabel,
  unavailableText = 'Photo unavailable',
}: RemotePhotoProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  if (signedUrl) {
    return (
      <Image
        source={{ uri: signedUrl }}
        style={[styles.photo, { aspectRatio, borderColor: palette.border }]}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        paletteStyle(palette),
        { aspectRatio },
      ]}
    >
      <Text style={[styles.placeholderText, { color: palette.muted }]}>
        {signedUrl === null ? 'Loading photo…' : unavailableText}
      </Text>
    </View>
  );
}

function paletteStyle(palette: Palette) {
  return {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  };
}

const styles = StyleSheet.create({
  photo: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
  },
  placeholder: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
