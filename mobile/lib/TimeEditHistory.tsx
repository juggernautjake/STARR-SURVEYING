/**
 * Read-only audit list for one job_time_entry. Rendered below the
 * edit form so the surveyor can see what they (or anyone else) has
 * already changed.
 *
 * F1 #6 scope:
 *   - one row per time_edits record, newest first
 *   - shows field name + old → new + reason (if any) + who/when
 *   - empty state when nothing has been edited yet
 */
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { TimeEdit } from './timeEdits';
import { colors } from './theme';

interface TimeEditHistoryProps {
  edits: TimeEdit[];
}

export function TimeEditHistory({ edits }: TimeEditHistoryProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = colors[scheme];

  if (edits.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: palette.muted }]}>
          No edits yet — this entry is original.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {edits.map((edit, idx) => (
        <View
          key={edit.id}
          style={[
            styles.row,
            { borderColor: palette.border },
            idx === 0 && { borderTopWidth: 1 },
          ]}
        >
          <View style={styles.rowHeader}>
            <Text style={[styles.fieldName, { color: palette.text }]}>
              {prettyField(edit.field_name)}
            </Text>
            <Text style={[styles.editedAt, { color: palette.muted }]}>
              {formatRelative(edit.edited_at)}
            </Text>
          </View>

          <Text style={[styles.deltaLine, { color: palette.muted }]}>
            <Text style={[styles.oldValue, { color: palette.muted }]}>
              {prettyValue(edit.field_name, edit.old_value)}
            </Text>
            {'  →  '}
            <Text style={[styles.newValue, { color: palette.text }]}>
              {prettyValue(edit.field_name, edit.new_value)}
            </Text>
          </Text>

          {edit.delta_minutes != null && edit.delta_minutes > 0 ? (
            <Text style={[styles.deltaTag, { color: palette.accent }]}>
              {edit.delta_minutes} min change
            </Text>
          ) : null}

          {edit.reason ? (
            <Text style={[styles.reason, { color: palette.text }]}>
              &ldquo;{edit.reason}&rdquo;
            </Text>
          ) : null}

          {edit.edited_by ? (
            <Text style={[styles.editedBy, { color: palette.muted }]}>
              by {edit.edited_by}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function prettyField(field: string | null): string {
  switch (field) {
    case 'started_at':
      return 'Start time';
    case 'ended_at':
      return 'End time';
    case 'notes':
      return 'Notes';
    case 'entry_type':
      return 'Category';
    case 'job_id':
      return 'Job';
    default:
      return field ?? 'Field';
  }
}

function prettyValue(field: string | null, value: string | null): string {
  if (!value) return '(empty)';
  if (field === 'started_at' || field === 'ended_at') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }
  return value;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  list: {
    gap: 0,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  fieldName: {
    fontSize: 14,
    fontWeight: '600',
  },
  editedAt: {
    fontSize: 12,
  },
  deltaLine: {
    fontSize: 14,
    lineHeight: 20,
  },
  oldValue: {
    textDecorationLine: 'line-through',
  },
  newValue: {
    fontWeight: '600',
  },
  deltaTag: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  reason: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
  editedBy: {
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
