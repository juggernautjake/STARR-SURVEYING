/**
 * Photo annotation editor.
 *
 * Per plan §5.4 ("the original is ALWAYS preserved unmodified")
 * v1 ships freehand pen strokes serialised to JSON in
 * `field_media.annotations`. The original photo bytes are never
 * touched — both mobile + web admin overlay the SVG live from the
 * JSON when rendering.
 *
 * UI:
 *   - Full-screen modal with the photo at object-fit: contain.
 *   - SVG overlay tracks PanResponder strokes in real time.
 *   - Floating toolbar: colour picker (4 colours) · Undo · Clear ·
 *     Save · Cancel.
 *   - Save persists the doc; Cancel discards. Both close the modal.
 *
 * Coordinate system: every point + width is normalised 0..1 over
 * the *intrinsic* image dimensions, so the overlay re-renders
 * identically on phone / tablet / web admin lightbox without
 * re-mapping.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button } from './Button';
import { logError } from './log';
import {
  ANNOTATION_COLORS,
  type AnnotationDocument,
  type PenStroke,
  DEFAULT_PEN_COLOR,
  DEFAULT_PEN_WIDTH,
  emptyAnnotationDocument,
  parseAnnotations,
  strokeToPath,
  strokeWidthPx,
} from './photoAnnotation';
import { colors } from './theme';

interface PhotoAnnotatorProps {
  /** Visibility — controlled by caller. */
  visible: boolean;
  /** file:// URI or signed URL of the source photo. The annotator
   *  never modifies it; we just need to render it underneath. */
  photoUrl: string | null;
  /** Existing annotations JSON (TEXT-encoded) — null/empty starts a
   *  blank doc. */
  initialAnnotationsJson: string | null;
  /** auth.users.id of the current user — stamped into the doc. */
  userId: string | null;
  /** Caller persists the JSON (or null to clear) and resolves. */
  onSave: (annotationsJson: string | null) => Promise<void>;
  /** Discard + close without writing. */
  onCancel: () => void;
}

export function PhotoAnnotator({
  visible,
  photoUrl,
  initialAnnotationsJson,
  userId,
  onSave,
  onCancel,
}: PhotoAnnotatorProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  // Document state — initialised from the prop on first render or
  // when the caller swaps photos. Mutations push new strokes.
  const [doc, setDoc] = useState<AnnotationDocument>(() => {
    return (
      parseAnnotations(initialAnnotationsJson) ??
      emptyAnnotationDocument(userId)
    );
  });

  // Re-seed when the caller opens the modal for a different photo.
  // Tracked via a ref so we only re-seed on transition (visible
  // false→true) rather than every render.
  const lastPhotoRef = useRef<string | null>(photoUrl);
  if (visible && lastPhotoRef.current !== photoUrl) {
    lastPhotoRef.current = photoUrl;
    setDoc(
      parseAnnotations(initialAnnotationsJson) ??
        emptyAnnotationDocument(userId)
    );
  }

  // Layout dimensions of the canvas — used to translate touch coords
  // (px) into normalised image coords (0..1). Set on the canvas
  // <View>'s onLayout.
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Active in-flight stroke (the one the user is currently drawing).
  // Held outside `doc.items` so the SVG redraws on every touch event
  // without churning the doc state — it merges in on stroke release.
  const [activeStroke, setActiveStroke] = useState<PenStroke | null>(null);

  const [color, setColor] = useState<string>(DEFAULT_PEN_COLOR);
  const [saving, setSaving] = useState(false);

  // PanResponder needs stable references that always read the LATEST
  // colour + canvas size. Refs avoid re-creating the responder on
  // every render (which would lose mid-stroke gestures).
  const colorRef = useRef(color);
  colorRef.current = color;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { width, height } = canvasSizeRef.current;
          if (width === 0 || height === 0) return;
          const x = e.nativeEvent.locationX / width;
          const y = e.nativeEvent.locationY / height;
          setActiveStroke({
            type: 'pen',
            color: colorRef.current,
            width: DEFAULT_PEN_WIDTH,
            points: [{ x, y }],
          });
        },
        onPanResponderMove: (e) => {
          const { width, height } = canvasSizeRef.current;
          if (width === 0 || height === 0) return;
          const x = e.nativeEvent.locationX / width;
          const y = e.nativeEvent.locationY / height;
          // Skip points within 1 normalised-pixel of the previous —
          // every PanResponder fire would otherwise flood the doc
          // with hundreds of redundant points per stroke.
          setActiveStroke((prev) => {
            if (!prev) return prev;
            const last = prev.points[prev.points.length - 1];
            if (
              last &&
              Math.abs(last.x - x) < 0.001 &&
              Math.abs(last.y - y) < 0.001
            ) {
              return prev;
            }
            return { ...prev, points: [...prev.points, { x, y }] };
          });
        },
        onPanResponderRelease: () => {
          setActiveStroke((prev) => {
            if (prev && prev.points.length > 0) {
              setDoc((d) => ({
                ...d,
                updated_at: new Date().toISOString(),
                updated_by: userId,
                items: [...d.items, prev],
              }));
            }
            return null;
          });
        },
        onPanResponderTerminate: () => {
          // Same flush as Release — covers the rare case where the OS
          // steals the gesture (incoming call, etc.).
          setActiveStroke((prev) => {
            if (prev && prev.points.length > 0) {
              setDoc((d) => ({
                ...d,
                updated_at: new Date().toISOString(),
                updated_by: userId,
                items: [...d.items, prev],
              }));
            }
            return null;
          });
        },
      }),
    [userId]
  );

  const onUndo = useCallback(() => {
    setDoc((d) => {
      if (d.items.length === 0) return d;
      return {
        ...d,
        updated_at: new Date().toISOString(),
        updated_by: userId,
        items: d.items.slice(0, -1),
      };
    });
  }, [userId]);

  const onClear = useCallback(() => {
    if (doc.items.length === 0) return;
    Alert.alert(
      'Clear all annotations?',
      'Every stroke on this photo will be removed. The original photo stays unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () =>
            setDoc({
              schema: 1,
              updated_at: new Date().toISOString(),
              updated_by: userId,
              items: [],
            }),
        },
      ]
    );
  }, [doc, userId]);

  const onSavePress = useCallback(async () => {
    setSaving(true);
    try {
      // Empty doc → save null so the column clears (admin viewer
      // hides the overlay when annotations IS NULL).
      const payload =
        doc.items.length > 0
          ? JSON.stringify({
              ...doc,
              updated_at: new Date().toISOString(),
              updated_by: userId,
            })
          : null;
      await onSave(payload);
    } catch (err) {
      logError('PhotoAnnotator.save', 'failed', err);
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSaving(false);
    }
  }, [doc, userId, onSave]);

  // Combined render list — committed strokes plus the in-flight one
  // so the user sees their finger trail in real time.
  const renderItems = useMemo(() => {
    const merged = [...doc.items];
    if (activeStroke && activeStroke.points.length > 0) {
      merged.push(activeStroke);
    }
    return merged;
  }, [doc.items, activeStroke]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.canvas, { borderColor: palette.border }]}
          onLayout={(e) =>
            setCanvasSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
          {...panResponder.panHandlers}
        >
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <Text style={[styles.missing, { color: palette.muted }]}>
              No photo to annotate.
            </Text>
          )}
          <View style={styles.svgWrap} pointerEvents="none">
            {canvasSize.width > 0 ? (
              <Svg
                width={canvasSize.width}
                height={canvasSize.height}
                style={StyleSheet.absoluteFillObject}
              >
                {renderItems.map((item, i) => {
                  if (item.type !== 'pen') return null;
                  return (
                    <Path
                      key={`${i}-${item.points.length}`}
                      d={strokeToPath(
                        item,
                        canvasSize.width,
                        canvasSize.height
                      )}
                      stroke={item.color}
                      strokeWidth={strokeWidthPx(
                        item.width,
                        canvasSize.width,
                        canvasSize.height
                      )}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  );
                })}
              </Svg>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <View style={styles.colorRow}>
            {ANNOTATION_COLORS.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setColor(c.hex)}
                accessibilityRole="button"
                accessibilityLabel={`${c.label} pen`}
                accessibilityState={{ selected: color === c.hex }}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: c.hex,
                    borderColor: color === c.hex ? palette.text : 'transparent',
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.actionRow}>
            <View style={styles.actionFlex}>
              <Button
                variant="secondary"
                label="Undo"
                onPress={onUndo}
                disabled={saving || doc.items.length === 0}
              />
            </View>
            <View style={styles.actionFlex}>
              <Button
                variant="danger"
                label="Clear"
                onPress={onClear}
                disabled={saving || doc.items.length === 0}
              />
            </View>
          </View>
          <View style={styles.actionRow}>
            <View style={styles.actionFlex}>
              <Button
                variant="secondary"
                label="Cancel"
                onPress={onCancel}
                disabled={saving}
              />
            </View>
            <View style={styles.actionFlex}>
              <Button
                label={saving ? 'Saving…' : 'Save'}
                onPress={onSavePress}
                loading={saving}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  canvas: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  svgWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  missing: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 40,
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    gap: 12,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionFlex: {
    flex: 1,
  },
});
