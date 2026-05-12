/**
 * Full-screen photo viewer modal.
 *
 * Shown when the user taps a thumbnail in the F3 #4 point detail
 * gallery. Tap-to-dismiss; the image fills the screen with object-
 * fit: contain so portrait/landscape both display fully.
 *
 * Renders the existing annotation overlay (parsed from
 * field_media.annotations) ON TOP of the photo so the surveyor
 * sees their marks immediately. The original photo is never
 * modified per plan §5.4 — annotations are a separate JSON
 * layer rendered live.
 *
 * The "Annotate" button opens the PhotoAnnotator editor; saving
 * persists the JSON via useUpdateMediaAnnotations and the lightbox
 * re-renders with the new strokes (no re-fetch needed — PowerSync's
 * reactive query updates the parent screen's media list).
 */
import { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button } from './Button';
import {
  type FieldMedia,
  useFieldMediaPhotoUrl,
  useUpdateMediaAnnotations,
} from './fieldMedia';
import { logError } from './log';
import { PhotoAnnotator } from './PhotoAnnotator';
import {
  parseAnnotations,
  strokeToPath,
  strokeWidthPx,
} from './photoAnnotation';
import { useAuth } from './auth';
import { colors } from './theme';
import { useResolvedScheme } from './themePreference';

interface PhotoLightboxProps {
  media: FieldMedia | null;
  onDismiss: () => void;
}

export function PhotoLightbox({ media, onDismiss }: PhotoLightboxProps) {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];
  const url = useFieldMediaPhotoUrl(media);
  const { session } = useAuth();
  const updateAnnotations = useUpdateMediaAnnotations();

  const [annotatorOpen, setAnnotatorOpen] = useState(false);
  // Track image natural size so we can scale the SVG overlay to
  // match the contained image's actual rendered rect (Image with
  // resizeMode=contain doesn't fill the parent — there are letterbox
  // bars on the long axis).
  const [imageSize, setImageSize] = useState<{
    naturalWidth: number;
    naturalHeight: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  const annotationDoc = useMemo(
    () => parseAnnotations(media?.annotations ?? null),
    [media?.annotations]
  );

  const visible = !!media;

  // Compute the rect the photo actually occupies inside its container
  // when resizeMode=contain. The SVG overlay sits on top of THAT
  // rect, not the whole container — otherwise strokes would render
  // in the letterbox.
  const overlayRect = useMemo(() => {
    if (!imageSize) return null;
    const { naturalWidth, naturalHeight, containerWidth, containerHeight } =
      imageSize;
    if (
      !naturalWidth ||
      !naturalHeight ||
      !containerWidth ||
      !containerHeight
    ) {
      return null;
    }
    const imgRatio = naturalWidth / naturalHeight;
    const contRatio = containerWidth / containerHeight;
    let drawW: number;
    let drawH: number;
    if (imgRatio > contRatio) {
      // Wider than container — letterbox top/bottom.
      drawW = containerWidth;
      drawH = containerWidth / imgRatio;
    } else {
      drawW = containerHeight * imgRatio;
      drawH = containerHeight;
    }
    return {
      width: drawW,
      height: drawH,
      left: (containerWidth - drawW) / 2,
      top: (containerHeight - drawH) / 2,
    };
  }, [imageSize]);

  const onSaveAnnotations = async (json: string | null) => {
    if (!media?.id) return;
    try {
      await updateAnnotations(media.id, json);
      setAnnotatorOpen(false);
    } catch (err) {
      // updateAnnotations logs internally; surface for the user
      // because otherwise the editor stays open with no feedback.
      logError('PhotoLightbox.onSaveAnnotations', 'failed', err, {
        media_id: media.id,
      });
      throw err;
    }
  };

  return (
    <>
      <Modal
        visible={visible && !annotatorOpen}
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <Pressable
            style={styles.imageArea}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onLayout={(e) => {
              setImageSize((prev) => ({
                naturalWidth: prev?.naturalWidth ?? 0,
                naturalHeight: prev?.naturalHeight ?? 0,
                containerWidth: e.nativeEvent.layout.width,
                containerHeight: e.nativeEvent.layout.height,
              }));
            }}
          >
            {url ? (
              <Image
                source={{ uri: url }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel="Full-size photo"
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source;
                  setImageSize((prev) => ({
                    naturalWidth: width,
                    naturalHeight: height,
                    containerWidth: prev?.containerWidth ?? 0,
                    containerHeight: prev?.containerHeight ?? 0,
                  }));
                }}
              />
            ) : (
              <View style={styles.loading}>
                <Text style={[styles.loadingText, { color: palette.muted }]}>
                  Loading photo…
                </Text>
              </View>
            )}

            {/* Render annotation overlay on top — pointerEvents="none"
                so taps still pass through to the dismiss handler. */}
            {url && annotationDoc && overlayRect ? (
              <View
                style={[
                  styles.svgOverlay,
                  {
                    width: overlayRect.width,
                    height: overlayRect.height,
                    left: overlayRect.left,
                    top: overlayRect.top,
                  },
                ]}
                pointerEvents="none"
              >
                <Svg
                  width={overlayRect.width}
                  height={overlayRect.height}
                  style={StyleSheet.absoluteFillObject}
                >
                  {annotationDoc.items.map((item, i) => {
                    if (item.type !== 'pen') return null;
                    return (
                      <Path
                        key={i}
                        d={strokeToPath(
                          item,
                          overlayRect.width,
                          overlayRect.height
                        )}
                        stroke={item.color}
                        strokeWidth={strokeWidthPx(
                          item.width,
                          overlayRect.width,
                          overlayRect.height
                        )}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    );
                  })}
                </Svg>
              </View>
            ) : null}
          </Pressable>

          {url && media?.media_type === 'photo' ? (
            <View style={styles.toolbar} pointerEvents="box-none">
              <View style={styles.toolbarBtn}>
                <Button
                  variant="secondary"
                  label={
                    annotationDoc && annotationDoc.items.length > 0
                      ? '✏️ Edit annotations'
                      : '✏️ Annotate'
                  }
                  onPress={() => setAnnotatorOpen(true)}
                  accessibilityHint="Opens the annotation editor. Original photo stays unchanged."
                />
              </View>
            </View>
          ) : null}

          <Text style={styles.closeHint}>Tap anywhere to close</Text>
        </View>
      </Modal>

      {/* Editor opens INSIDE the same lightbox session so the
          dismiss path stays clean. We hide the lightbox while the
          editor is open (visible flag above) so the two modals
          don't stack. */}
      <PhotoAnnotator
        visible={annotatorOpen}
        photoUrl={url}
        initialAnnotationsJson={media?.annotations ?? null}
        userId={session?.user.id ?? null}
        onSave={onSaveAnnotations}
        onCancel={() => setAnnotatorOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  imageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  svgOverlay: {
    position: 'absolute',
  },
  loading: {
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  toolbar: {
    position: 'absolute',
    bottom: 64,
    left: 16,
    right: 16,
  },
  toolbarBtn: {
    width: '100%',
  },
  closeHint: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
});
