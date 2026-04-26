/**
 * Full-screen photo viewer modal.
 *
 * Shown when the user taps a thumbnail in the F3 #4 point detail
 * gallery. Tap-to-dismiss; the image fills the screen with object-
 * fit: contain so portrait/landscape both display fully.
 *
 * v1 ships single-photo view. F3 polish can extend to swipe-between-
 * photos by passing the full media list + current index.
 */
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { type FieldMedia, useFieldMediaPhotoUrl } from './fieldMedia';
import { colors } from './theme';

interface PhotoLightboxProps {
  media: FieldMedia | null;
  onDismiss: () => void;
}

export function PhotoLightbox({ media, onDismiss }: PhotoLightboxProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const url = useFieldMediaPhotoUrl(media);

  const visible = !!media;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close photo"
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Full-size photo"
          />
        ) : (
          <View style={styles.loading}>
            <Text style={[styles.loadingText, { color: palette.muted }]}>
              Loading photo…
            </Text>
          </View>
        )}
        <Text style={styles.closeHint}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loading: {
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  closeHint: {
    position: 'absolute',
    bottom: 32,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
});
