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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { LoadingSplash } from '@/lib/LoadingSplash';
import * as haptics from '@/lib/haptics';
import { logError } from '@/lib/log';
import { PhotoLightbox } from '@/lib/PhotoLightbox';
import { ScreenHeader } from '@/lib/ScreenHeader';
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
  NOTE_TEMPLATE_LABELS,
  type FieldNote,
  type NoteTemplate,
  parseStructuredPayload,
  useArchiveFieldNote,
  usePointNotes,
} from '@/lib/fieldNotes';
import {
  type JobFile,
  useDeleteJobFile,
  usePickAndAttachFile,
  usePointFiles,
} from '@/lib/jobFiles';
import {
  useIsPinned,
  useOpenJobFile,
  usePinFile,
  useUnpinFile,
} from '@/lib/pinnedFiles';
import {
  type FieldMedia,
  useDeleteMedia,
  usePointMedia,
} from '@/lib/fieldMedia';
import { colors, type Palette } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

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
  const scheme = useResolvedScheme();
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
  const { notes } = usePointNotes(point.id);
  const archiveNote = useArchiveFieldNote();
  const { files } = usePointFiles(point.id);
  const pickFile = usePickAndAttachFile();
  const deleteFile = useDeleteJobFile();
  const [attachingFile, setAttachingFile] = useState(false);
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
      haptics.success();
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
      <ScreenHeader
        title={point.name ?? 'Point'}
        right={
          <Pressable
            onPress={attemptDismiss}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancelText, { color: palette.muted }]}>
              Cancel
            </Text>
          </Pressable>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.metaBlock}>
            <View style={[styles.tag, { backgroundColor: prefixInfo.color }]}>
              <Text style={styles.tagText}>{point.code_category ?? '—'}</Text>
            </View>
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

          {/* Notes — F4 #3 free-text + structured templates */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                Notes ({notes.length})
              </Text>
            </View>
            {notes.length === 0 ? (
              <Text style={[styles.sectionHint, { color: palette.muted }]}>
                No notes yet. Add a free-text note or pick a template
                (offset shot · monument found · hazard · correction).
              </Text>
            ) : (
              <View style={{ gap: 8, marginBottom: 8 }}>
                {notes.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    palette={palette}
                    onLongPress={() => onLongPressNote(n.id, archiveNote)}
                  />
                ))}
              </View>
            )}
            <View style={{ height: 12 }} />
            <Button
              variant="secondary"
              label="+ Add note"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/jobs/[id]/notes/new',
                  params: {
                    id: point.job_id,
                    point_id: point.id,
                  },
                })
              }
              accessibilityHint="Opens the note editor with template picker."
            />
          </View>

          {/* Files — F5 generic attachments (PDF, CSV, instrument
              exports, scanned plans, etc.) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, { color: palette.muted }]}>
                Files ({files.length})
              </Text>
            </View>
            {files.length === 0 ? (
              <Text style={[styles.sectionHint, { color: palette.muted }]}>
                No files yet. Attach a PDF, CSV, instrument export, or
                any other file from your phone, iCloud, or Google Drive.
              </Text>
            ) : (
              <View style={{ gap: 8, marginBottom: 8 }}>
                {files.map((f) => (
                  <FileCard
                    key={f.id}
                    file={f}
                    palette={palette}
                    onLongPress={() => onLongPressFile(f, deleteFile)}
                  />
                ))}
              </View>
            )}
            <View style={{ height: 12 }} />
            <Button
              variant="secondary"
              label={attachingFile ? 'Attaching…' : '+ Attach file'}
              loading={attachingFile}
              disabled={attachingFile}
              onPress={async () => {
                if (!point.job_id) {
                  Alert.alert(
                    'Job link missing',
                    'This point isn’t linked to a job yet. Pull down to refresh and try again.'
                  );
                  return;
                }
                setAttachingFile(true);
                try {
                  await pickFile({
                    jobId: point.job_id,
                    dataPointId: point.id,
                  });
                } catch (err) {
                  logError('pointDetail.attachFile', 'failed', err, {
                    point_id: point.id,
                    job_id: point.job_id,
                  });
                  Alert.alert(
                    'Couldn’t attach file',
                    err instanceof Error ? err.message : String(err)
                  );
                } finally {
                  setAttachingFile(false);
                }
              }}
              accessibilityHint="Opens the OS document picker. Files upload in the background and survive offline captures."
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
            variant="danger"
            label="Delete point"
            onPress={onDelete}
            disabled={submitting}
            accessibilityHint="Removes the point and any attached photos. Owner-only within 24 h of creation."
          />
        </ScrollView>

        {/* Sticky Save bar (D7) — keeps Save one tap away even while
            the description / name field is keyboard-active. Delete
            stays in the scroll above because it's destructive + lower
            priority. */}
        <View
          style={[
            styles.stickyBar,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
            },
          ]}
        >
          <Button
            label="Save"
            onPress={onSave}
            loading={submitting}
            disabled={duplicate || name.trim() === ''}
            accessibilityHint="Saves the changes."
          />
        </View>
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

interface NoteCardProps {
  note: FieldNote;
  palette: Palette;
  onLongPress: () => void;
}

/**
 * Single-row note card. Shows the body summary (free-text note OR
 * the per-template summary computed at insert time), the template
 * tag when present, and a relative-time stamp. Long-press opens
 * the archive confirmation Alert.
 */
function NoteCard({ note, palette, onLongPress }: NoteCardProps) {
  const template = (note.note_template ?? null) as NoteTemplate | null;
  const templateLabel = template ? NOTE_TEMPLATE_LABELS[template] : null;
  const ageLabel = note.created_at ? noteTimeAgo(note.created_at) : '';
  // Defensive parse — old/garbled JSON renders the body fallback.
  // We don't surface payload fields inline today; the admin viewer
  // does the rich render.
  void parseStructuredPayload(note.structured_data);
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={500}
      style={[styles.noteCard, { borderColor: palette.border }]}
      accessibilityRole="button"
      accessibilityLabel={`Note: ${note.body ?? ''}`}
      accessibilityHint="Long-press to archive"
    >
      {templateLabel ? (
        <Text style={[styles.noteTemplateTag, { color: palette.accent }]}>
          {templateLabel}
        </Text>
      ) : null}
      <Text style={[styles.noteBody, { color: palette.text }]}>
        {note.body ?? ''}
      </Text>
      <Text style={[styles.noteAge, { color: palette.muted }]}>
        {ageLabel}
      </Text>
    </Pressable>
  );
}

function noteTimeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function onLongPressNote(
  noteId: string,
  archive: ReturnType<typeof useArchiveFieldNote>
): void {
  Alert.alert(
    'Archive this note?',
    'It will be hidden from the mobile list but still visible to the office reviewer.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archive(noteId);
          } catch (err) {
            Alert.alert(
              'Archive failed',
              err instanceof Error ? err.message : String(err)
            );
          }
        },
      },
    ]
  );
}

interface FileCardProps {
  file: JobFile;
  palette: Palette;
  onLongPress: () => void;
}

/**
 * One-row file card. Tap opens via the OS share sheet (Quick Look /
 * Files / Drive / etc.); long-press confirms delete; the 📍 button
 * pins the file for offline re-read. Pinned rows show a 📍 badge in
 * the title row.
 *
 * Pinning fetches the bytes via a signed URL and writes them under
 * `documentDirectory/pinned/<id>.<ext>` so the file is readable
 * offline. Unpinning drops the local copy. The plat / deed / CSV
 * a surveyor needs in the field is always one tap from the cab.
 */
function FileCard({ file, palette, onLongPress }: FileCardProps) {
  const isPinned = useIsPinned(file.id);
  const pinFile = usePinFile();
  const unpinFile = useUnpinFile();
  const openFile = useOpenJobFile();
  const [busy, setBusy] = useState<'open' | 'pin' | null>(null);

  const ageLabel = file.created_at ? noteTimeAgo(file.created_at) : '';
  const sizeLabel =
    file.file_size_bytes != null
      ? formatFileSize(file.file_size_bytes)
      : null;
  const stateColor =
    file.upload_state === 'failed'
      ? palette.danger
      : file.upload_state === 'done'
        ? palette.success
        : palette.muted;

  // CSV files route to the in-app coordinate preview screen rather
  // than the OS share sheet — surveyors get the P,N,E,Z,D table +
  // match-to-points view inline. The preview screen has an "Open
  // in another app" fallback so the share-sheet path is still one
  // tap away when the user wants Numbers / Excel.
  const isCsvFile =
    !!file.id &&
    !!file.job_id &&
    (file.content_type === 'text/csv' ||
      file.content_type === 'application/csv' ||
      /\.csv$/i.test(file.name ?? ''));

  const onTap = async () => {
    if (busy) return;
    setBusy('open');
    try {
      if (isCsvFile && file.id && file.job_id) {
        router.push({
          pathname: '/(tabs)/jobs/[id]/files/[fileId]/preview',
          params: { id: file.job_id, fileId: file.id },
        });
        return;
      }
      await openFile(file);
    } catch (err) {
      Alert.alert(
        'Couldn’t open file',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setBusy(null);
    }
  };

  const onTogglePin = async () => {
    if (busy) return;
    setBusy('pin');
    try {
      if (isPinned) {
        await unpinFile(file.id);
      } else {
        await pinFile(file);
      }
    } catch (err) {
      Alert.alert(
        isPinned ? 'Unpin failed' : 'Pin failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.noteCard, { borderColor: palette.border }]}>
      <Pressable
        onPress={onTap}
        onLongPress={onLongPress}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel={`File: ${file.name ?? 'untitled'}${isPinned ? ', pinned for offline access' : ''}`}
        accessibilityHint="Tap to open. Long-press to delete."
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text
            style={[styles.noteBody, { color: palette.text, flex: 1 }]}
            numberOfLines={2}
          >
            {isCsvFile ? '📊 ' : isPinned ? '📍 ' : '📎 '}
            {file.name ?? 'Untitled'}
          </Text>
          <Pressable
            onPress={onTogglePin}
            disabled={busy === 'pin' || file.upload_state !== 'done'}
            accessibilityRole="button"
            accessibilityLabel={
              isPinned ? 'Unpin from offline access' : 'Pin for offline access'
            }
            accessibilityHint={
              isPinned
                ? 'Frees device storage. The file stays attached to the point.'
                : 'Downloads the file to this device so it opens without reception.'
            }
            style={({ pressed }) => ({
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: isPinned ? palette.accent : palette.border,
              backgroundColor: isPinned ? palette.accent : 'transparent',
              opacity:
                pressed || busy === 'pin' || file.upload_state !== 'done'
                  ? 0.6
                  : 1,
            })}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: isPinned ? '#FFFFFF' : palette.text,
              }}
            >
              {busy === 'pin'
                ? '…'
                : isPinned
                  ? 'Pinned'
                  : 'Pin offline'}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.noteAge, { color: palette.muted }]}>
          {sizeLabel ? `${sizeLabel} · ` : ''}
          <Text style={{ color: stateColor }}>
            {file.upload_state === 'pending'
              ? 'Uploading…'
              : file.upload_state === 'failed'
                ? 'Failed — retry from Me → Uploads'
                : file.upload_state === 'done'
                  ? 'Synced'
                  : (file.upload_state ?? 'queued')}
          </Text>
          {ageLabel ? ` · ${ageLabel}` : ''}
          {busy === 'open' ? ' · Opening…' : ''}
        </Text>
      </Pressable>
    </View>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function onLongPressFile(
  file: JobFile,
  deleteFile: ReturnType<typeof useDeleteJobFile>
): void {
  Alert.alert(
    'Delete this file?',
    `“${file.name ?? 'Untitled'}” will be removed from this point. Cannot be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFile(file);
          } catch (err) {
            Alert.alert(
              'Delete failed',
              err instanceof Error ? err.message : String(err)
            );
          }
        },
      },
    ]
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  stickyBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
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
  noteCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noteTemplateTag: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  noteAge: {
    fontSize: 11,
    marginTop: 6,
  },
});
