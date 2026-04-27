/**
 * Cross-notes search — Batch BB, F4 closer.
 *
 * Field surveyors hit the search button on the Jobs tab and type
 * a few characters; the screen runs `useSearchFieldNotes(query)`
 * (LIKE scan against local SQLite via PowerSync) and renders
 * results as tap-to-navigate cards. Tapping a result jumps to
 * the relevant point detail (when `data_point_id` is set) or job
 * detail (job-level notes).
 *
 * Search fields covered (parametrised, all in one query):
 *   - body
 *   - structured_data JSON
 *   - note_template
 *   - parent point name
 *   - parent job name
 *   - parent job_number
 *
 * Why a dedicated screen instead of an in-list filter?
 *   - Surveyors often search WITHOUT being on a specific job — the
 *     "where did I write that hazard note?" query crosses jobs.
 *   - A search screen with an auto-focus keyboard is the universal
 *     pattern (mail apps, Slack, Things) so the affordance is
 *     instantly recognisable.
 *
 * Resilience: works fully offline. PowerSync mirrors fieldbook_notes,
 * field_data_points, and jobs locally so the LIKE join runs against
 * SQLite without a network round-trip. Results stay reactive too —
 * if a new note arrives via sync mid-typing, it appears in the list.
 */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  NOTE_TEMPLATE_LABELS,
  type NoteTemplate,
  type SearchNoteHit,
  useSearchFieldNotes,
} from '@/lib/fieldNotes';
import { colors } from '@/lib/theme';
import { useResolvedScheme } from '@/lib/themePreference';

export default function NotesSearchScreen() {
  const scheme = useResolvedScheme();
  const palette = colors[scheme];

  const [query, setQuery] = useState('');
  // Use the raw query — the hook trims + length-guards internally
  // (returns empty for <2 chars), so the UI stays simple.
  const { hits, isLoading } = useSearchFieldNotes(query, 50);
  const trimmed = query.trim();

  const onPickHit = useCallback((hit: SearchNoteHit) => {
    if (hit.note.data_point_id) {
      router.push({
        pathname: '/(tabs)/jobs/[id]/points/[pointId]',
        params: {
          id: hit.note.job_id ?? '',
          pointId: hit.note.data_point_id,
        },
      });
    } else if (hit.note.job_id) {
      router.push({
        pathname: '/(tabs)/jobs/[id]',
        params: { id: hit.note.job_id },
      });
    }
  }, []);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
      edges={['top']}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel search"
          style={({ pressed }) => [
            styles.cancelBtn,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.cancelText, { color: palette.accent }]}>
            Cancel
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: palette.text }]}>
            Search notes
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.inputBox,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.inputGlyph, { color: palette.muted }]}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="rebar, hazard, BM01, Smith Ranch…"
          placeholderTextColor={palette.muted}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.input, { color: palette.text }]}
          accessibilityLabel="Search query"
          accessibilityHint="Searches across all your field notes — body, template, point name, job name."
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={({ pressed }) => [
              styles.clearBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[styles.clearText, { color: palette.muted }]}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {trimmed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            What are you looking for?
          </Text>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Type to search across every active note on this device.
            Body text, structured templates, point names, and job
            names all match — so &quot;rebar&quot; finds the hazard
            note about it, the monument&shy;-found note that mentions
            it, and the point named &quot;BM01-rebar&quot;.
          </Text>
        </View>
      ) : trimmed.length === 1 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Keep typing — at least two characters to search.
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Searching…
          </Text>
        </View>
      ) : hits.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            No matches
          </Text>
          <Text style={[styles.emptyBody, { color: palette.muted }]}>
            Try a shorter term, or check that the note you&apos;re
            looking for has synced to this device.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.countLine, { color: palette.muted }]}>
            {hits.length} {hits.length === 1 ? 'result' : 'results'}
            {hits.length === 50 ? ' (capped)' : ''}
          </Text>
          <FlatList
            data={hits}
            keyExtractor={(h) => h.note.id}
            renderItem={({ item }) => (
              <ResultCard
                hit={item}
                query={trimmed}
                palette={palette}
                onPress={() => onPickHit(item)}
              />
            )}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </SafeAreaView>
  );
}

interface ResultCardProps {
  hit: SearchNoteHit;
  query: string;
  palette: { text: string; muted: string; accent: string; surface: string; border: string };
  onPress: () => void;
}

/**
 * One search result. Layout:
 *   - Top row: template tag (or "Free-text") + relative time
 *   - Body excerpt with the matching term highlighted, clipped to 3 lines
 *   - Footer: job number + name · point name when point-attached
 */
function ResultCard({ hit, query, palette, onPress }: ResultCardProps) {
  const { note, jobName, jobNumber, pointName } = hit;
  const templateLabel = note.note_template
    ? NOTE_TEMPLATE_LABELS[note.note_template as NoteTemplate] ??
      note.note_template
    : 'Free-text';
  const ageLabel = note.created_at ? formatAge(note.created_at) : '';

  const bodySnippet = clipAroundQuery(note.body ?? '', query);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Note: ${templateLabel}. ${bodySnippet.slice(0, 140)}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.templatePill,
            note.note_template
              ? { backgroundColor: palette.accent }
              : {
                  backgroundColor: 'transparent',
                  borderColor: palette.border,
                  borderWidth: 1,
                },
          ]}
        >
          <Text
            style={[
              styles.templatePillText,
              { color: note.note_template ? '#FFFFFF' : palette.muted },
            ]}
          >
            {templateLabel}
          </Text>
        </View>
        <Text style={[styles.ageLabel, { color: palette.muted }]}>
          {ageLabel}
        </Text>
      </View>
      <HighlightedText
        text={bodySnippet}
        query={query}
        baseColor={palette.text}
        highlightColor={palette.accent}
      />
      <Text
        style={[styles.footer, { color: palette.muted }]}
        numberOfLines={1}
      >
        {jobNumber ? `${jobNumber} · ` : ''}
        {jobName ?? 'Unknown job'}
        {pointName ? ` · ${pointName}` : ''}
      </Text>
    </Pressable>
  );
}

/**
 * Clip the body to a ~140-char window centred on the first match.
 * If there's no match in the body (matched on a join column),
 * just truncate from the start so the user still sees something.
 * Adds ellipses when we cropped from either end.
 */
function clipAroundQuery(body: string, query: string): string {
  if (!body) return '';
  if (body.length <= 160) return body;
  const lc = body.toLowerCase();
  const idx = lc.indexOf(query.toLowerCase());
  if (idx < 0) {
    return `${body.slice(0, 157)}…`;
  }
  // Centre the match in a 140-char window.
  const start = Math.max(0, idx - 50);
  const end = Math.min(body.length, idx + query.length + 90);
  let out = body.slice(start, end);
  if (start > 0) out = `…${out}`;
  if (end < body.length) out = `${out}…`;
  return out;
}

/**
 * Render text with the matching query highlighted in the accent
 * colour. Case-insensitive match; preserves the original casing in
 * the rendered output.
 */
function HighlightedText({
  text,
  query,
  baseColor,
  highlightColor,
}: {
  text: string;
  query: string;
  baseColor: string;
  highlightColor: string;
}) {
  if (!text) {
    return (
      <Text style={[styles.body, { color: baseColor, fontStyle: 'italic' }]}>
        (no body)
      </Text>
    );
  }
  if (!query) {
    return (
      <Text
        style={[styles.body, { color: baseColor }]}
        numberOfLines={3}
      >
        {text}
      </Text>
    );
  }
  // Split case-insensitively. We keep the original casing in the
  // rendered segments — only the index alignment is lower-cased.
  const lc = text.toLowerCase();
  const lq = query.toLowerCase();
  const segments: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lc.indexOf(lq, cursor);
    if (idx < 0) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: text.slice(cursor, idx), match: false });
    }
    segments.push({
      text: text.slice(idx, idx + query.length),
      match: true,
    });
    cursor = idx + query.length;
  }
  return (
    <Text style={[styles.body, { color: baseColor }]} numberOfLines={3}>
      {segments.map((s, i) =>
        s.match ? (
          <Text
            key={i}
            style={{
              color: highlightColor,
              fontWeight: '700',
            }}
          >
            {s.text}
          </Text>
        ) : (
          <Text key={i}>{s.text}</Text>
        )
      )}
    </Text>
  );
}

function formatAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  inputGlyph: {
    fontSize: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  clearBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  clearText: {
    fontSize: 22,
    fontWeight: '300',
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  countLine: {
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  card: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  templatePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  templatePillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ageLabel: {
    fontSize: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  footer: {
    fontSize: 12,
  },
});
