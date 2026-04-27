/**
 * Add-note screen — F4 free-text + structured templates.
 *
 * Routes:
 *   /(tabs)/jobs/[id]/notes/new                  — free-text job-level
 *   /(tabs)/jobs/[id]/notes/new?point_id=X       — free-text point-level
 *   /(tabs)/jobs/[id]/notes/new?point_id=X&template=offset_shot
 *     — structured template form for one of the four kinds.
 *
 * Per plan §5.5 templates:
 *   - offset_shot     — distance + direction + notes
 *   - monument_found  — type + condition + depth + notes
 *   - hazard          — type + severity + notes
 *   - correction      — what changed + why + notes
 *
 * The body summary lands in `fieldbook_notes.body` so the existing
 * web admin grep + the F4 search-across-notes feature both work
 * without parsing the JSON; the rich payload lands in
 * `structured_data` for the admin viewer's per-template render.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/lib/Button';
import { TextField } from '@/lib/TextField';
import { logError } from '@/lib/log';
import {
  NOTE_TEMPLATE_LABELS,
  type NoteTemplate,
  useAddFieldNote,
} from '@/lib/fieldNotes';
import {
  tabletContainerStyle,
  useResponsiveLayout,
} from '@/lib/responsive';
import { colors } from '@/lib/theme';

// ── Per-template form state (each template has its own draft type
// so the Save handler can compose the payload precisely) ────────────────────

interface OffsetDraft {
  distance: string;
  direction: string;
  notes: string;
}

interface MonumentDraft {
  monument_type: 'rebar' | 'pipe' | 'stone' | 'concrete' | 'other';
  condition: string;
  depth: string;
  notes: string;
}

interface HazardDraft {
  hazard_type: string;
  severity: 'low' | 'med' | 'high';
  notes: string;
}

interface CorrectionDraft {
  what_changed: string;
  why: string;
  notes: string;
}

const MONUMENT_TYPES: Array<MonumentDraft['monument_type']> = [
  'rebar',
  'pipe',
  'stone',
  'concrete',
  'other',
];
const SEVERITIES: Array<HazardDraft['severity']> = ['low', 'med', 'high'];

export default function AddNoteScreen() {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];
  const { isTablet } = useResponsiveLayout();
  const tabletStyle = tabletContainerStyle(isTablet);

  const params = useLocalSearchParams<{
    id?: string;
    point_id?: string;
    template?: string;
  }>();
  const jobId = typeof params.id === 'string' ? params.id : null;
  const pointId =
    typeof params.point_id === 'string' && params.point_id.length > 0
      ? params.point_id
      : null;

  // template is null for free-text; otherwise one of the known kinds.
  // Bad / unknown values fall back to free-text so an outdated link
  // doesn't crash the screen.
  const initialTemplate: NoteTemplate | null =
    params.template === 'offset_shot' ||
    params.template === 'monument_found' ||
    params.template === 'hazard' ||
    params.template === 'correction'
      ? params.template
      : null;

  const [template, setTemplate] = useState<NoteTemplate | null>(
    initialTemplate
  );
  const [freeBody, setFreeBody] = useState('');

  const [offset, setOffset] = useState<OffsetDraft>({
    distance: '',
    direction: '',
    notes: '',
  });
  const [monument, setMonument] = useState<MonumentDraft>({
    monument_type: 'rebar',
    condition: '',
    depth: '',
    notes: '',
  });
  const [hazard, setHazard] = useState<HazardDraft>({
    hazard_type: '',
    severity: 'med',
    notes: '',
  });
  const [correction, setCorrection] = useState<CorrectionDraft>({
    what_changed: '',
    why: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const addNote = useAddFieldNote();

  if (!jobId) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.background }]}
        edges={['top']}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: palette.text }]}>
            Job missing
          </Text>
          <Text style={[styles.caption, { color: palette.muted }]}>
            The job link is missing from the URL. Open this screen via
            the “+ Add note” button on a point.
          </Text>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const onSave = async () => {
    setSubmitting(true);
    try {
      // Build the payload matching the chosen template (or null for
      // free-text). We DON'T validate every field — the template
      // form already disables Save when required text fields are
      // empty.
      let payload: Parameters<typeof addNote>[0]['payload'] = null;
      let body = freeBody.trim();

      if (template === 'offset_shot') {
        const distance = parseFloat(offset.distance);
        payload = {
          offset_distance_ft: Number.isFinite(distance) ? distance : null,
          offset_direction: offset.direction.trim() || null,
          notes: offset.notes.trim() || null,
        };
      } else if (template === 'monument_found') {
        const depth = parseFloat(monument.depth);
        payload = {
          monument_type: monument.monument_type,
          condition: monument.condition.trim(),
          depth_in: Number.isFinite(depth) ? depth : null,
          notes: monument.notes.trim() || null,
        };
      } else if (template === 'hazard') {
        payload = {
          hazard_type: hazard.hazard_type.trim(),
          severity: hazard.severity,
          notes: hazard.notes.trim() || null,
        };
      } else if (template === 'correction') {
        payload = {
          what_changed: correction.what_changed.trim(),
          why: correction.why.trim(),
          notes: correction.notes.trim() || null,
        };
      }

      // For templates the lib computes a body summary if `body` is
      // blank, so we don't need to pre-fill — pass empty and let
      // useAddFieldNote do the right thing.
      await addNote({
        jobId,
        dataPointId: pointId,
        body,
        template,
        payload,
      });
      router.back();
    } catch (err) {
      logError('addNoteScreen.save', 'failed', err, {
        job_id: jobId,
        point_id: pointId,
        template,
      });
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Save-disabled logic per template.
  const canSave = (() => {
    if (submitting) return false;
    if (!template) return freeBody.trim().length > 0;
    if (template === 'offset_shot') {
      return offset.distance.trim() !== '' || offset.notes.trim() !== '';
    }
    if (template === 'monument_found') {
      return monument.condition.trim() !== '' || monument.notes.trim() !== '';
    }
    if (template === 'hazard') {
      return hazard.hazard_type.trim() !== '';
    }
    if (template === 'correction') {
      return (
        correction.what_changed.trim() !== '' && correction.why.trim() !== ''
      );
    }
    return false;
  })();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <ScrollView contentContainerStyle={[styles.scroll, tabletStyle]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: palette.text }]}>
            {pointId ? 'Add note to point' : 'Add note to job'}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.cancel, { color: palette.muted }]}>
              Cancel
            </Text>
          </Pressable>
        </View>

        {/* Template picker — pills. Tap to switch; "Free-text" is the
            default. Switching wipes the in-flight draft for the
            previous template; users can paste back if they meant
            different. */}
        <View style={styles.templateRow}>
          <TemplatePill
            active={template === null}
            label="Free-text"
            onPress={() => setTemplate(null)}
            palette={palette}
          />
          {(Object.keys(NOTE_TEMPLATE_LABELS) as NoteTemplate[]).map(
            (k) => (
              <TemplatePill
                key={k}
                active={template === k}
                label={NOTE_TEMPLATE_LABELS[k]}
                onPress={() => setTemplate(k)}
                palette={palette}
              />
            )
          )}
        </View>

        {template === null ? (
          <View style={styles.section}>
            <TextField
              label="Note"
              value={freeBody}
              onChangeText={setFreeBody}
              multiline
              numberOfLines={6}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Found large rusted pipe partially buried at the NW corner."
              editable={!submitting}
            />
          </View>
        ) : null}

        {template === 'offset_shot' ? (
          <View style={styles.section}>
            <TextField
              label="Offset distance (ft)"
              value={offset.distance}
              onChangeText={(t) => setOffset((o) => ({ ...o, distance: t }))}
              keyboardType="decimal-pad"
              placeholder="e.g. 2.5"
              editable={!submitting}
            />
            <TextField
              label="Direction (N / NE / 045° / etc.)"
              value={offset.direction}
              onChangeText={(t) => setOffset((o) => ({ ...o, direction: t }))}
              autoCapitalize="characters"
              placeholder="N"
              editable={!submitting}
            />
            <TextField
              label="Notes"
              value={offset.notes}
              onChangeText={(t) => setOffset((o) => ({ ...o, notes: t }))}
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Offset taken because the actual point was inaccessible behind fence."
              editable={!submitting}
            />
          </View>
        ) : null}

        {template === 'monument_found' ? (
          <View style={styles.section}>
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>
              Monument type
            </Text>
            <View style={styles.choiceRow}>
              {MONUMENT_TYPES.map((t) => (
                <ChoicePill
                  key={t}
                  active={monument.monument_type === t}
                  label={t}
                  onPress={() =>
                    setMonument((m) => ({ ...m, monument_type: t }))
                  }
                  palette={palette}
                />
              ))}
            </View>
            <TextField
              label="Condition"
              value={monument.condition}
              onChangeText={(t) =>
                setMonument((m) => ({ ...m, condition: t }))
              }
              autoCapitalize="sentences"
              placeholder="good / damaged / buried / destroyed"
              editable={!submitting}
            />
            <TextField
              label="Depth (in)"
              value={monument.depth}
              onChangeText={(t) => setMonument((m) => ({ ...m, depth: t }))}
              keyboardType="decimal-pad"
              placeholder="18"
              editable={!submitting}
            />
            <TextField
              label="Notes"
              value={monument.notes}
              onChangeText={(t) => setMonument((m) => ({ ...m, notes: t }))}
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Capped Smith RPLS 1234, lying flat just below grade."
              editable={!submitting}
            />
          </View>
        ) : null}

        {template === 'hazard' ? (
          <View style={styles.section}>
            <TextField
              label="Hazard type"
              value={hazard.hazard_type}
              onChangeText={(t) =>
                setHazard((h) => ({ ...h, hazard_type: t }))
              }
              autoCapitalize="sentences"
              placeholder="Snake nest, fence wire, soft ground, etc."
              editable={!submitting}
            />
            <Text style={[styles.fieldLabel, { color: palette.muted }]}>
              Severity
            </Text>
            <View style={styles.choiceRow}>
              {SEVERITIES.map((s) => (
                <ChoicePill
                  key={s}
                  active={hazard.severity === s}
                  label={s}
                  onPress={() => setHazard((h) => ({ ...h, severity: s }))}
                  palette={palette}
                  variant={s === 'high' ? 'danger' : 'default'}
                />
              ))}
            </View>
            <TextField
              label="Notes"
              value={hazard.notes}
              onChangeText={(t) => setHazard((h) => ({ ...h, notes: t }))}
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Two rattlers near the SW monument; advise crew rotation."
              editable={!submitting}
            />
          </View>
        ) : null}

        {template === 'correction' ? (
          <View style={styles.section}>
            <TextField
              label="What changed"
              value={correction.what_changed}
              onChangeText={(t) =>
                setCorrection((c) => ({ ...c, what_changed: t }))
              }
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Re-shot point IR03 with offset of 1.2'"
              editable={!submitting}
            />
            <TextField
              label="Why"
              value={correction.why}
              onChangeText={(t) =>
                setCorrection((c) => ({ ...c, why: t }))
              }
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Original shot taken before debris was cleared."
              editable={!submitting}
            />
            <TextField
              label="Notes"
              value={correction.notes}
              onChangeText={(t) =>
                setCorrection((c) => ({ ...c, notes: t }))
              }
              multiline
              numberOfLines={3}
              autoCorrect
              autoCapitalize="sentences"
              placeholder="Old point preserved per plan §5.3."
              editable={!submitting}
            />
          </View>
        ) : null}

        <View style={{ height: 16 }} />

        <Button
          label={submitting ? 'Saving…' : 'Save note'}
          onPress={onSave}
          loading={submitting}
          disabled={!canSave}
          accessibilityHint="Stores the note. It syncs to the admin web within seconds when online."
        />
      </ScrollView>
    </SafeAreaView>
  );
}

interface PillProps {
  active: boolean;
  label: string;
  onPress: () => void;
  palette: ReturnType<typeof paletteOf>;
  variant?: 'default' | 'danger';
}

function TemplatePill({ active, label, onPress, palette }: PillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: active ? palette.accent : palette.border,
          backgroundColor: active ? palette.accent : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.pillText,
          { color: active ? '#FFFFFF' : palette.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ChoicePill({
  active,
  label,
  onPress,
  palette,
  variant = 'default',
}: PillProps) {
  const accent = variant === 'danger' ? palette.danger : palette.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: active ? accent : palette.border,
          backgroundColor: active ? accent : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[
          styles.pillText,
          { color: active ? '#FFFFFF' : palette.muted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function paletteOf(scheme: 'light' | 'dark') {
  return colors[scheme];
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    padding: 24,
    paddingBottom: 64,
  },
  body: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  cancel: {
    fontSize: 15,
  },
  caption: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  section: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
