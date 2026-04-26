import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import { logError } from '@/lib/log';
import { PhotoLightbox } from '@/lib/PhotoLightbox';
import { TextField } from '@/lib/TextField';
import { ThumbnailGrid } from '@/lib/ThumbnailGrid';
import { useUnsavedChangesGuard } from '@/lib/useUnsavedChangesGuard';
import {
  type FieldDataPoint,
  type DataPointPatch,
  useDataPoint,
  useDeleteDataPoint,
  useJobPointNames,
  useUpdateDataPoint,
} from '@/lib/dataPoints';
import { lookupPrefix } from '@/lib/dataPointCodes';
import {
  type FieldMedia,
  useDeleteMedia,
  usePointMedia,
} from '@/lib/fieldMedia';
import { colors, type Palette } from '@/lib/theme';

/**
 * Per-point detail / edit screen — F3 #4.
 *
 * Layout:
 *   - Header: prefix tag + name + GPS
 *   - Photo gallery (3-col thumbnails — tap to open lightbox,
 *     long-press to delete)
 *   - "+ Add photos" button → routes back into the capture loop
 *   - Edit form (name / description / flags)
 *   - Save / Delete
 *
 * Owner-deletion is gated by RLS to the first 24h after creation
 * (per seeds/221_*.sql); after that the button surfaces an error
 * from the server. The cascade in the seed sweeps attached photos
 * automatically — the storage objects get cleaned up by the IRS-
 * style retention sweep.
 */
export default function PointDetailScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  const { pointId } = useLocalSearchParams<{ pointId: string }>();
  const { point, isLoading } = useDataPoint(pointId);

  if (isLoading) return <LoadingSplash />;

  if (!point) {
    return <NotFound palette={palette} onBack={() => router.back()} />;
  }

  // key on point.id so navigating between rows resets form state.
  return <PointForm key={point.id} point={point} palette={palette} />;
}

interface PointFormProps {
  point: FieldDataPoint;
  palette: Palette;
}

function PointForm({ point, palette }: PointFormProps) {
  const updatePoint = useUpdateDataPoint();
  const deletePoint = useDeleteDataPoint();
  const deleteMedia = useDeleteMedia();
  const { media } = usePointMedia(point.id, 'photo');
  const { names: existingNames } = useJobPointNames(point.job_id);

  const [name, setName] = useState<string>(point.name ?? '');
  const [description, setDescription] = useState<string>(point.description ?? '');
  const [isOffset, setIsOffset] = useState<boolean>(!!point.is_offset);
  const [isCorrection, setIsCorrection] = useState<boolean>(!!point.is_correction);
  const [submitting, setSubmitting] = useState(false);
  const [openMedia, setOpenMedia] = useState<FieldMedia | null>(null);

  const prefixInfo = lookupPrefix(point.code_category);
  const hasGps = point.device_lat != null && point.device_lon != null;

  const duplicate = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === point.name) return false;
    return existingNames.some(
      (n) => n.toLowerCase() === trimmed.toLowerCase() && n !== point.name
    );
  }, [name, existingNames, point.name]);

  // Dirty flag for the discard-changes guard. Compare each form
  // field against its original value on the row.
  const dirty = useMemo(
    () =>
      name.trim() !== (point.name ?? '') ||
      description !== (point.description ?? '') ||
      isOffset !== !!point.is_offset ||
      isCorrection !== !!point.is_correction,
    [name, description, isOffset, isCorrection, point]
  );

  const { attemptDismiss } = useUnsavedChangesGuard({
    dirty,
    scope: 'pointDetail',
    message: 'Your edits to this point haven’t been saved.',
  });

  const onSave = async () => {
    if (submitting) return;
    if (name.trim() === '') {
      Alert.alert('Name required', 'Tap a prefix or type a name first.');
      return;
    }
    if (duplicate) {
      Alert.alert(
        'Duplicate name',
        `A point named "${name.trim()}" already exists on this job.`
      );
      return;
    }

    // Diff-only patch — same pattern as the receipt edit form.
    const patch: DataPointPatch = {};
    if (name.trim() !== (point.name ?? '')) patch.name = name;
    const cleanDesc = description.trim() || null;
    if (cleanDesc !== (point.description ?? null)) patch.description = cleanDesc;
    if (isOffset !== !!point.is_offset) patch.isOffset = isOffset;
    if (isCorrection !== !!point.is_correction) {
      patch.isCorrection = isCorrection;
    }

    if (Object.keys(patch).length === 0) {
      router.back();
      return;
    }

    setSubmitting(true);
    try {
      await updatePoint(point.id, patch);
      router.back();
    } catch (err) {
      logError('pointDetail.onSave', 'update failed', err, {
        point_id: point.id,
        job_id: point.job_id,
      });
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Delete this point?',
      `${media.length > 0 ? `All ${media.length} attached photos will be removed too. ` : ''}You can re-create the point if needed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePoint(point.id);
              if (point.job_id) {
                router.replace({
                  pathname: '/(tabs)/jobs/[id]',
                  params: { id: point.job_id },
                });
              } else {
                router.back();
              }
            } catch (err) {
              logError('pointDetail.onDelete', 'delete failed', err, {
                point_id: point.id,
                job_id: point.job_id,
                media_count: media.length,
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

  const onDeletePhoto = (item: FieldMedia) => {
    Alert.alert(
      'Delete this photo?',
      'The image will be removed from this point.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMedia(item);
            } catch (err) {
              logError('pointDetail.onDeletePhoto', 'delete failed', err, {
                media_id: item.id,
                point_id: point.id,
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

  const onAddPhotos = () => {
    router.push({
      pathname: '/(tabs)/capture/[pointId]/photos',
      params: { pointId: point.id },
    });
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
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
                {point.device_altitude_m != null
                  ? ` · ${point.device_altitude_m.toFixed(1)} m`
                  : ''}
              </Text>
            </View>
            <Pressable
              onPress={attemptDismiss}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>

          {/* Photo gallery */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                Photos ({media.length})
              </Text>
            </View>
            <ThumbnailGrid
              media={media}
              onPressMedia={(m) => setOpenMedia(m)}
              onLongPressMedia={onDeletePhoto}
            />
            {media.length > 0 ? (
              <Text style={[styles.sectionHint, { color: palette.muted }]}>
                Tap to view full-size · long-press to delete.
              </Text>
            ) : null}
            <View style={{ height: 12 }} />
            <Button
              variant="secondary"
              label="+ Add photos"
              onPress={onAddPhotos}
              accessibilityHint="Opens the camera to attach more photos to this point."
            />
          </View>

          {/* Edit form */}
          <View style={styles.section}>
            <TextField
              label="Point name"
              value={name}
              onChangeText={setName}
              autoCorrect={false}
              autoCapitalize="characters"
              editable={!submitting}
              error={duplicate ? 'A point with this name already exists on this job.' : null}
            />
          </View>

          <View style={styles.section}>
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Found 3/4&quot; iron rod, 18&quot; deep, capped Smith RPLS 1234"
              editable={!submitting}
            />
          </View>

          {/* Flags */}
          <View style={styles.section}>
            <FlagToggle
              label="Offset shot"
              value={isOffset}
              onToggle={() => setIsOffset((p) => !p)}
              palette={palette}
              disabled={submitting}
            />
            <View style={{ height: 8 }} />
            <FlagToggle
              label="Correction"
              value={isCorrection}
              onToggle={() => setIsCorrection((p) => !p)}
              palette={palette}
              disabled={submitting}
            />
          </View>

          <Button
            label="Save"
            onPress={onSave}
            loading={submitting}
            disabled={duplicate || name.trim() === ''}
            accessibilityHint="Saves the changes."
          />
          <View style={{ height: 12 }} />
          <Button
            variant="danger"
            label="Delete point"
            onPress={onDelete}
            disabled={submitting}
            accessibilityHint="Removes the point and any attached photos. Owner-only within 24 h of creation."
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <PhotoLightbox media={openMedia} onDismiss={() => setOpenMedia(null)} />
    </SafeAreaView>
  );
}

interface FlagToggleProps {
  label: string;
  value: boolean;
  onToggle: () => void;
  palette: Palette;
  disabled?: boolean;
}

function FlagToggle({ label, value, onToggle, palette, disabled }: FlagToggleProps) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [
        styles.flagRow,
        {
          backgroundColor: pressed ? palette.border : palette.surface,
          borderColor: value ? palette.accent : palette.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.flagLabel, { color: palette.text }]}>{label}</Text>
      <View
        style={[
          styles.flagCheckbox,
          {
            backgroundColor: value ? palette.accent : 'transparent',
            borderColor: value ? palette.accent : palette.border,
          },
        ]}
      >
        {value ? <Text style={styles.flagCheck}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

interface NotFoundProps {
  palette: Palette;
  onBack: () => void;
}

function NotFound({ palette, onBack }: NotFoundProps) {
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.notFound}>
        <Text style={[styles.heading, { color: palette.text }]}>
          Point not found
        </Text>
        <Text style={[styles.subtitle, { color: palette.muted }]}>
          The point may have been deleted or hasn&apos;t synced to this
          device yet.
        </Text>
        <Button label="Back" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 64,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
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
  heading: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
    paddingTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 56,
    justifyContent: 'space-between',
  },
  flagLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  flagCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagCheck: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  notFound: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
